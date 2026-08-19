#!/usr/bin/env python3
"""
Basal — local server.

Serves the web app and proxies Open Food Facts so the phone never has to
deal with CORS or rate limits. Lookups are cached to disk forever, so a
barcode you've scanned once resolves instantly and works offline.

Runs over HTTPS with a self-signed cert, because iOS Safari refuses camera
access on plain HTTP. Your phone will warn once; accept it and you're in.

    python3 server.py            # https on :8443
    python3 server.py --port 9000
    python3 server.py --http     # no TLS (camera won't work on iPhone)
"""

import argparse
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
# Named docs/ because that is the folder GitHub Pages will serve from.
WEB = os.path.join(ROOT, "docs")
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(DATA, "cache")
CERT = os.path.join(DATA, "cert.pem")
KEY = os.path.join(DATA, "key.pem")

OFF_BASE = "https://world.openfoodfacts.org"

# ── Whoop ───────────────────────────────────────────────────────────────
# Whoop does have a real developer API. You register an app once at
# developer.whoop.com, paste the two keys into data/whoop_credentials.json,
# and after a single browser authorisation this machine keeps itself topped
# up. No more exporting a zip every week.
WHOOP_AUTH = "https://api.prod.whoop.com/oauth/oauth2/auth"
WHOOP_TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token"
WHOOP_API = "https://api.prod.whoop.com/developer/v1"
WHOOP_SCOPES = "read:recovery read:cycles read:sleep read:profile read:body_measurement offline"
WHOOP_CREDS = os.path.join(DATA, "whoop_credentials.json")
WHOOP_TOKENS = os.path.join(DATA, "whoop_tokens.json")
UA = "Basal/1.0 (personal macro tracker; contact: local)"
FIELDS = ",".join([
    "code", "product_name", "product_name_en", "generic_name", "brands",
    "quantity", "serving_size", "serving_quantity", "nutriments",
    "image_front_small_url", "categories_tags", "nova_group",
    "ingredients_text", "countries_tags",
])

os.makedirs(CACHE, exist_ok=True)

_throttle_lock = threading.Lock()
_last_call = [0.0]


def _polite_wait(min_gap=0.7):
    """Open Food Facts is a donation-funded nonprofit. Don't hammer it."""
    with _throttle_lock:
        gap = time.time() - _last_call[0]
        if gap < min_gap:
            time.sleep(min_gap - gap)
        _last_call[0] = time.time()


def _fetch(url):
    _polite_wait()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and abs(f) != float("inf") else None


def normalize(product, code):
    """Flatten an Open Food Facts product into the shape the app stores."""
    n = product.get("nutriments") or {}

    kcal = _num(n.get("energy-kcal_100g"))
    if kcal is None:
        kj = _num(n.get("energy_100g")) or _num(n.get("energy-kj_100g"))
        if kj is not None:
            kcal = round(kj / 4.184, 1)

    per100 = {
        "kcal": kcal,
        "p": _num(n.get("proteins_100g")),
        "c": _num(n.get("carbohydrates_100g")),
        "f": _num(n.get("fat_100g")),
        "fib": _num(n.get("fiber_100g")),
        "sug": _num(n.get("sugars_100g")),
        "sat": _num(n.get("saturated-fat_100g")),
        # OFF stores sodium in grams; the app wants milligrams.
        "na": (lambda s: round(s * 1000) if s is not None else None)(_num(n.get("sodium_100g"))),
    }

    name = (product.get("product_name")
            or product.get("product_name_en")
            or product.get("generic_name") or "").strip()

    serving_g = _num(product.get("serving_quantity"))
    serving_label = (product.get("serving_size") or "").strip()
    if serving_g is None and serving_label:
        m = re.search(r"([\d.]+)\s*(g|ml)", serving_label, re.I)
        if m:
            serving_g = _num(m.group(1))

    pack_g = None
    q = (product.get("quantity") or "").strip()
    if q:
        m = re.search(r"([\d.]+)\s*(g|ml|kg|l)\b", q, re.I)
        if m:
            v, unit = _num(m.group(1)), m.group(2).lower()
            if v is not None:
                pack_g = v * 1000 if unit in ("kg", "l") else v

    serv = []
    if serving_g:
        serv.append({"l": serving_label or f"1 serving ({serving_g:g} g)", "g": serving_g})
    if pack_g and (not serving_g or abs(pack_g - serving_g) > 1):
        serv.append({"l": f"whole pack ({q})", "g": pack_g})

    return {
        "id": "off:" + code,
        "barcode": code,
        "n": name or f"Unknown product {code}",
        "brand": (product.get("brands") or "").split(",")[0].strip(),
        "per100": per100,
        "serv": serv,
        "img": product.get("image_front_small_url"),
        "nova": product.get("nova_group"),
        "src": "openfoodfacts",
        "complete": per100["kcal"] is not None and per100["p"] is not None,
    }


def _read_json(path, default=None):
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def _write_json(path, obj):
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=2)
    try:
        os.chmod(path, 0o600)   # tokens are credentials
    except OSError:
        pass


def whoop_creds():
    c = _read_json(WHOOP_CREDS) or {}
    cid = c.get("client_id") or os.environ.get("WHOOP_CLIENT_ID")
    secret = c.get("client_secret") or os.environ.get("WHOOP_CLIENT_SECRET")
    return (cid, secret) if cid and secret else (None, None)


def whoop_redirect(host=None):
    """
    Always localhost, never the LAN address.

    Whoop matches the redirect URI character for character against the one
    you registered. If this followed the Host header, authorising from the
    phone would send back 192.168.x.x and Whoop would reject it. So the
    authorisation is done once, on the Mac, at a fixed address — and the
    phone simply reads whatever the Mac has already fetched.
    """
    port = os.environ.get("BASAL_PORT", "8443")
    return f"https://localhost:{port}/api/whoop/callback"


def whoop_post(data):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(
        WHOOP_TOKEN, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())


def whoop_token():
    """A live access token, refreshed if the stored one has expired."""
    tok = _read_json(WHOOP_TOKENS)
    if not tok:
        return None, "not connected"
    if tok.get("expires_at", 0) > time.time() + 90:
        return tok["access_token"], None

    cid, secret = whoop_creds()
    if not cid:
        return None, "credentials missing"
    try:
        fresh = whoop_post({
            "grant_type": "refresh_token",
            "refresh_token": tok["refresh_token"],
            "client_id": cid,
            "client_secret": secret,
            "scope": "offline",
        })
    except urllib.error.HTTPError as e:
        return None, f"refresh rejected ({e.code}) — reconnect"
    except (urllib.error.URLError, OSError) as e:
        return None, f"offline ({e})"

    fresh["expires_at"] = time.time() + int(fresh.get("expires_in", 3600))
    # Whoop rotates the refresh token; losing it means reconnecting by hand.
    if "refresh_token" not in fresh:
        fresh["refresh_token"] = tok["refresh_token"]
    _write_json(WHOOP_TOKENS, fresh)
    return fresh["access_token"], None


def whoop_get(path, token, params=None):
    url = f"{WHOOP_API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def whoop_collect(path, token, start, extra=None):
    """Walk the paginated collection endpoints."""
    out, nxt, guard = [], None, 0
    while guard < 40:
        guard += 1
        params = {"limit": 25, "start": start}
        if extra:
            params.update(extra)
        if nxt:
            params["nextToken"] = nxt
        try:
            page = whoop_get(path, token, params)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2)
                continue
            raise
        out.extend(page.get("records", []))
        nxt = page.get("next_token")
        if not nxt:
            break
    return out


def _day(iso, offset_hours=0):
    if not iso:
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})T(\d{2})", iso)
    if not m:
        return None
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"


def whoop_sync(days=120):
    """Pull recent data and shape it exactly like the CSV importer does."""
    token, err = whoop_token()
    if err:
        return {"ok": False, "error": err}

    start = time.strftime("%Y-%m-%dT%H:%M:%S.000Z",
                          time.gmtime(time.time() - days * 86400))
    try:
        cycles = whoop_collect("/cycle", token, start)
        recovery = whoop_collect("/recovery", token, start)
        sleeps = whoop_collect("/activity/sleep", token, start)
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"Whoop returned {e.code}"}
    except (urllib.error.URLError, OSError) as e:
        return {"ok": False, "error": f"could not reach Whoop ({e})"}

    by_cycle = {}
    for c in cycles:
        sc = c.get("score") or {}
        by_cycle[c["id"]] = {
            "start": c.get("start"), "end": c.get("end"),
            "strain": sc.get("strain"),
            "kcal": round(sc.get("kilojoule", 0) / 4.184) if sc.get("kilojoule") else None,
            "avgHr": sc.get("average_heart_rate"), "maxHr": sc.get("max_heart_rate"),
        }

    sleep_by_id = {}
    for s_ in sleeps:
        sc = s_.get("score") or {}
        stage = sc.get("stage_summary") or {}
        ms = lambda k: (stage.get(k) or 0) / 3600000
        sleep_by_id[s_["id"]] = {
            "end": s_.get("end"),
            "sleepH": round(
                (ms("total_in_bed_time_milli") - ms("total_awake_time_milli")), 2) or None,
            "remH": round(ms("total_rem_sleep_time_milli"), 2) or None,
            "swsH": round(ms("total_slow_wave_sleep_time_milli"), 2) or None,
            "sleepPerf": sc.get("sleep_performance_percentage"),
            "sleepEff": sc.get("sleep_efficiency_percentage"),
            "resp": sc.get("respiratory_rate"),
        }

    rows = {}
    for r in recovery:
        sc = r.get("score") or {}
        cyc = by_cycle.get(r.get("cycle_id")) or {}
        slp = sleep_by_id.get(r.get("sleep_id")) or {}
        # File it under the morning you woke into, matching the CSV path.
        date = _day(slp.get("end") or cyc.get("end") or r.get("created_at"))
        if not date:
            continue
        rows[date] = {
            "recovery": sc.get("recovery_score"),
            "rhr": sc.get("resting_heart_rate"),
            "hrv": sc.get("hrv_rmssd_milli"),
            "spo2": sc.get("spo2_percentage"),
            "temp": sc.get("skin_temp_celsius"),
            "strain": cyc.get("strain"),
            "kcal": cyc.get("kcal"),
            "sleepH": slp.get("sleepH"), "remH": slp.get("remH"), "swsH": slp.get("swsH"),
            "sleepPerf": slp.get("sleepPerf"), "sleepEff": slp.get("sleepEff"),
            "resp": slp.get("resp"),
            "wakeHour": None,
        }
        end = slp.get("end")
        if end:
            m = re.search(r"T(\d{2}):(\d{2})", end)
            if m:
                rows[date]["wakeHour"] = int(m.group(1)) + int(m.group(2)) / 60

    dates = sorted(rows)
    _write_json(os.path.join(DATA, "whoop_cache.json"),
                {"rows": rows, "at": time.time()})
    return {
        "ok": True, "rows": rows, "count": len(rows),
        "from": dates[0] if dates else None,
        "to": dates[-1] if dates else None,
        "at": time.time(),
    }


def cache_path(code):
    return os.path.join(CACHE, f"{code}.json")


def lookup(code):
    p = cache_path(code)
    if os.path.exists(p):
        try:
            with open(p) as fh:
                d = json.load(fh)
            d["cached"] = True
            return d
        except (OSError, ValueError):
            pass

    url = f"{OFF_BASE}/api/v2/product/{urllib.parse.quote(code)}.json?fields={FIELDS}"
    try:
        raw = _fetch(url)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        return {"found": False, "offline": True, "error": str(e), "barcode": code}

    if raw.get("status") != 1 or not raw.get("product"):
        # Cache the miss too — no point re-asking for a barcode OFF doesn't have.
        miss = {"found": False, "barcode": code}
        with open(p, "w") as fh:
            json.dump(miss, fh)
        return miss

    food = normalize(raw["product"], code)
    food["found"] = True
    with open(p, "w") as fh:
        json.dump(food, fh, ensure_ascii=False)
    return food


def search(q, page=1, india_first=True):
    params = {
        "search_terms": q,
        "page_size": "24",
        "page": str(page),
        "fields": FIELDS,
        "json": "1",
    }
    if india_first:
        params["countries_tags_en"] = "india"
    url = f"{OFF_BASE}/cgi/search.pl?" + urllib.parse.urlencode(params)
    try:
        raw = _fetch(url)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        return {"products": [], "offline": True, "error": str(e)}

    out = []
    for p in raw.get("products", []):
        code = p.get("code") or ""
        f = normalize(p, code)
        if f["complete"]:
            out.append(f)
            if code:
                try:
                    with open(cache_path(code), "w") as fh:
                        json.dump({**f, "found": True}, fh, ensure_ascii=False)
                except OSError:
                    pass
    return {"products": out, "count": raw.get("count", len(out))}


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=WEB, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            sys.stderr.write("  %s\n" % (fmt % args))

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _html(self, title, body):
        page = f"""<!doctype html><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>
 body{{background:#0E1216;color:#E9EEF3;font:16px/1.55 -apple-system,system-ui,sans-serif;
 display:grid;place-items:center;height:100vh;margin:0;padding:24px;text-align:center}}
 h1{{font-size:20px;margin:0 0 8px}} p{{color:#A6B2BE;max-width:34em;margin:0}}
</style><h1>{title}</h1><p>{body}</p>"""
        raw = page.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def end_headers(self):
        # Service worker + camera need a tightly-scoped policy, not a lax one.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Permissions-Policy", "camera=(self)")
        super().end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)

        if u.path.startswith("/api/product/"):
            code = u.path.rsplit("/", 1)[-1]
            if not re.fullmatch(r"\d{6,14}", code):
                return self._json({"found": False, "error": "bad barcode"}, 400)
            return self._json(lookup(code))

        if u.path == "/api/search":
            q = (qs.get("q") or [""])[0].strip()
            if len(q) < 2:
                return self._json({"products": []})
            page = int((qs.get("page") or ["1"])[0] or 1)
            india = (qs.get("all") or ["0"])[0] != "1"
            return self._json(search(q, page, india))

        # ── Whoop endpoints ──────────────────────────────────────────
        if u.path == "/api/whoop/status":
            cid, _ = whoop_creds()
            tok = _read_json(WHOOP_TOKENS)
            cached = _read_json(os.path.join(DATA, "whoop_cache.json")) or {}
            return self._json({
                "configured": bool(cid),
                "connected": bool(tok),
                "expires_at": (tok or {}).get("expires_at"),
                "last_sync": cached.get("at"),
                "cached_days": len(cached.get("rows") or {}),
                "redirect_uri": whoop_redirect(),
            })

        if u.path == "/api/whoop/connect":
            cid, _ = whoop_creds()
            if not cid:
                return self._json({"error": "no credentials"}, 400)
            state = os.urandom(12).hex()
            _write_json(os.path.join(DATA, "whoop_state.json"), {"state": state})
            q = urllib.parse.urlencode({
                "client_id": cid,
                "response_type": "code",
                "scope": WHOOP_SCOPES,
                "state": state,
                "redirect_uri": whoop_redirect(),
            })
            self.send_response(302)
            self.send_header("Location", f"{WHOOP_AUTH}?{q}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if u.path == "/api/whoop/callback":
            code = (qs.get("code") or [""])[0]
            state = (qs.get("state") or [""])[0]
            saved = (_read_json(os.path.join(DATA, "whoop_state.json")) or {}).get("state")
            if not code or not state or state != saved:
                return self._html("Authorisation failed", "That callback did not match the request this machine started. Try connecting again.")
            cid, secret = whoop_creds()
            try:
                tok = whoop_post({
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": cid,
                    "client_secret": secret,
                    "redirect_uri": whoop_redirect(),
                })
            except urllib.error.HTTPError as e:
                detail = e.read().decode("utf-8", "replace")[:200]
                return self._html("Whoop refused the exchange", f"{e.code}: {detail}")
            tok["expires_at"] = time.time() + int(tok.get("expires_in", 3600))
            _write_json(WHOOP_TOKENS, tok)
            return self._html("Whoop connected",
                              "You can close this tab. Basal will keep itself up to date from now on.")

        if u.path == "/api/whoop/sync":
            return self._json(whoop_sync(int((qs.get("days") or ["120"])[0])))

        if u.path == "/api/whoop/disconnect":
            for f in (WHOOP_TOKENS, os.path.join(DATA, "whoop_cache.json")):
                try:
                    os.remove(f)
                except OSError:
                    pass
            return self._json({"ok": True})

        if u.path == "/api/health":
            return self._json({"ok": True, "cached": len(os.listdir(CACHE))})

        if u.path == "/api/backup" and os.path.exists(os.path.join(DATA, "backup.json")):
            with open(os.path.join(DATA, "backup.json")) as fh:
                return self._json(json.load(fh))

        return super().do_GET()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"

        # A nightly snapshot onto the Mac, so a cleared Safari cache
        # can never take the log with it.
        if u.path == "/api/backup":
            try:
                payload = json.loads(raw.decode("utf-8"))
            except ValueError:
                return self._json({"ok": False, "error": "bad json"}, 400)
            with open(os.path.join(DATA, "backup.json"), "w") as fh:
                json.dump(payload, fh, ensure_ascii=False)
            stamp = time.strftime("%Y-%m-%d")
            with open(os.path.join(DATA, f"backup-{stamp}.json"), "w") as fh:
                json.dump(payload, fh, ensure_ascii=False)
            return self._json({"ok": True, "at": time.time()})

        return self._json({"error": "not found"}, 404)


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def ensure_cert(ip):
    """Self-signed cert covering localhost and the current LAN IP."""
    if os.path.exists(CERT) and os.path.exists(KEY):
        with open(CERT) as fh:
            text = subprocess.run(
                ["openssl", "x509", "-noout", "-text"],
                input=fh.read(), capture_output=True, text=True
            ).stdout
        # openssl prints SANs as "IP Address:1.2.3.4". Matching the wrong
        # spelling here reissues the cert on every launch, which throws away
        # the trust exception you granted in Safari last time.
        if f"IP Address:{ip}" in text:
            return True
        print("  LAN IP changed — reissuing the certificate.")
        print("  Safari will ask you to trust it once more.")

    conf = f"""
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = Basal
[ext]
subjectAltName = DNS:localhost, IP:127.0.0.1, IP:{ip}
basicConstraints = critical, CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
"""
    conf_path = os.path.join(DATA, "cert.cnf")
    with open(conf_path, "w") as fh:
        fh.write(conf)
    r = subprocess.run([
        "openssl", "req", "-x509", "-nodes", "-newkey", "rsa:2048",
        "-keyout", KEY, "-out", CERT, "-days", "3650", "-config", conf_path,
    ], capture_output=True, text=True)
    if r.returncode != 0:
        print("  Could not create a certificate:", r.stderr.strip()[:300])
        return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8443)
    ap.add_argument("--http", action="store_true", help="serve without TLS")
    args = ap.parse_args()

    os.environ.setdefault("BASAL_PORT", str(args.port))
    ip = lan_ip()
    use_tls = not args.http and ensure_cert(ip)
    scheme = "https" if use_tls else "http"

    httpd = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    if use_tls:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(CERT, KEY)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

    cached = len(os.listdir(CACHE))
    print(f"""
  BASAL  ready.

  On this Mac      {scheme}://localhost:{args.port}
  On your iPhone   {scheme}://{ip}:{args.port}

  {cached} barcode{'' if cached == 1 else 's'} cached.""")
    if use_tls:
        print("""
  Safari will warn about the certificate the first time.
  Tap Show Details → visit this website. That's what lets
  the camera scanner run.""")
    else:
        print("\n  Running without TLS — barcode scanning will not work on iPhone.")
    print("\n  Add to Home Screen for the full-screen app. Ctrl-C to stop.\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.\n")


if __name__ == "__main__":
    main()
