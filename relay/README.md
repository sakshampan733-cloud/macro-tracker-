# Whoop relay

A browser cannot call Whoop. Their API sends no CORS headers at all, so any
request from a web page is blocked before it leaves — true of any website,
not just this one. Something server-side has to sit in between.

This is the smallest thing that can. It does two jobs:

1. Holds the Whoop **client secret**, which cannot live in a public page,
   and uses it for the two exchanges that require it.
2. Forwards API calls and adds the CORS headers Whoop leaves off.

It stores **nothing**. Your tokens go back to your phone and live there with
the rest of your log. Losing the relay costs you a reconnection, nothing more.

## Setup

You need a free Cloudflare account and a Whoop developer app. About 15
minutes. No credit card, no command line, no Node.

### 1 — Whoop developer app

1. Go to **developer.whoop.com** and sign in with your Whoop account.
2. Create an app. Any name.
3. Leave the redirect URI blank for now — you get the real one in step 3.
4. Copy the **Client ID** and **Client Secret**.

### 2 — Deploy the worker

1. Go to **dash.cloudflare.com** → Workers & Pages → **Create** → **Create Worker**.
2. Name it something like `basal-whoop`. Deploy the placeholder.
3. **Edit code**, delete what is there, paste all of `worker.js`, and deploy.
4. Copy the address it gives you, e.g. `https://basal-whoop.yourname.workers.dev`.

### 3 — Credentials and redirect URI

1. In the worker: **Settings → Variables and Secrets**.
2. Add two **Secrets** (not plain text):
   - `WHOOP_CLIENT_ID`
   - `WHOOP_CLIENT_SECRET`
3. Deploy again so the secrets take effect.
4. Open `https://<your-worker>/health` in a browser. It prints the exact
   `redirect_uri` to register.
5. Paste that back into your Whoop app's redirect URI field. It must match
   **character for character**, including `https://` and `/callback`.

### 4 — Connect

In Basal: **Body → Connect Whoop**, paste the worker address, **Save and
test**, then **Authorise with Whoop**.

## If it fails

- **"redirect_uri does not match"** — the address registered at Whoop is not
  byte-identical to the one `/health` prints. Usually a trailing slash or
  `http` instead of `https`.
- **"relay is deployed but has no Whoop credentials"** — the secrets were
  added but not redeployed.
- **Could not reach that address** — the worker is not deployed, or the
  address has a typo.

## Origins

By default the relay accepts requests from the GitHub Pages app and from
`localhost:8765`. To allow another address, add an `ALLOWED_ORIGINS`
variable, comma-separated.
