/*
 * Keeping the log somewhere iOS will not throw away.
 *
 * The web app keeps everything in localStorage, which is the right answer on
 * the web and the wrong one inside an app. Web storage in a WKWebView is
 * evictable: iOS is entitled to reclaim it when the phone runs short of
 * space, and it does. It is also not what a device backup captures reliably.
 * So a year of logging sits in the one place on the phone that is explicitly
 * disposable.
 *
 * Moving it to a file in the app's Documents folder fixes both at once, and
 * fixes them without a server, an account or a subscription:
 *
 *   iOS backs up an app's Documents to iCloud automatically, as part of the
 *   ordinary nightly device backup. Restore a new phone and the log is
 *   there. Nobody has to have set anything up, and nothing of theirs was
 *   ever sent anywhere I control.
 *
 *   A file is not evictable. It is there until the app is deleted.
 *
 * The design constraint worth naming: store.js is synchronous and two dozen
 * modules depend on that. Filesystem access is not. Rather than make the
 * whole app async for this, the file is read once before app.js loads and
 * poured into localStorage, which then behaves exactly as it always has;
 * every save writes back out to the file. localStorage becomes a cache of
 * the file rather than the record itself.
 */

const FILE = 'basal.json';
const BACKUP_DIR = 'backups';
const KEEP_BACKUPS = 7;

/*
 * The Filesystem plugin, without a bundler.
 *
 * @capacitor/filesystem is an npm package and this repo has no build step,
 * so its JavaScript wrapper cannot be imported. It does not need to be: the
 * wrapper only forwards to the native side, and the bridge will hand back a
 * proxy that does the same thing if asked for the plugin by name. The
 * Directory values are plain strings in the same protocol.
 */
const Directory = { Data: 'DATA', Documents: 'DOCUMENTS', Library: 'LIBRARY' };

let fs = null;
function plugin() {
  if (fs) return fs;
  const C = globalThis.Capacitor;
  if (!C?.isNativePlatform?.()) return null;
  fs = C.Plugins?.Filesystem
    || (typeof C.registerPlugin === 'function' ? C.registerPlugin('Filesystem') : null);
  return fs;
}

export const isNativeStore = () => !!globalThis.Capacitor?.isNativePlatform?.();

/*
 * Read the file into localStorage before the app starts.
 *
 * Deliberately one-directional and deliberately cautious: the file wins only
 * when it has content and localStorage does not, or when the file is newer.
 * A first launch after the storage move has a populated localStorage and no
 * file, and must not be wiped by an empty read.
 */
export async function hydrate() {
  const f = plugin();
  if (!f) return { ok: false, reason: 'not native' };

  try {
    const res = await f.readFile({
      path: FILE, directory: Directory.Documents, encoding: 'utf8',
    });
    const text = typeof res.data === 'string' ? res.data : '';
    if (!text) return { ok: true, empty: true };

    const parsed = JSON.parse(text);          // throws if truncated
    if (!parsed || typeof parsed !== 'object' || !('days' in parsed)) {
      return { ok: false, reason: 'file is not a Basal log' };
    }

    const local = localStorage.getItem('basal.v1');
    if (local) {
      /* Both exist. Take whichever was written last — the file is the record,
         but a session that ran before hydrate finished would have written
         only to localStorage, and that edit is real. */
      try {
        const l = JSON.parse(local);
        const fileTime = parsed.savedAt || 0;
        const localTime = l.savedAt || 0;
        if (localTime > fileTime) return { ok: true, keptLocal: true };
      } catch { /* corrupt local, prefer the file */ }
    }

    localStorage.setItem('basal.v1', text);
    return { ok: true, restored: true, days: Object.keys(parsed.days || {}).length };
  } catch (e) {
    /* No file yet is the normal first-run case, not an error. */
    return { ok: true, empty: true, note: e.message };
  }
}

/*
 * Write the log out, at most once every few seconds.
 *
 * Every keystroke in a weight field commits, and writing a 200 KB file on
 * each one would be both slow and pointless. The debounce is short enough
 * that anything worth keeping is on disk before the app can be killed.
 */
let timer = null;
let pending = null;

export function save(json) {
  if (!isNativeStore()) return;
  pending = json;
  clearTimeout(timer);
  timer = setTimeout(flush, 1200);
}

export async function flush() {
  clearTimeout(timer);
  const json = pending;
  pending = null;
  if (!json) return;

  const f = plugin();
  if (!f) return;
  try {
    await f.writeFile({
      /* Documents, explicitly. It is the directory iOS includes in a device
         backup — Library/NoCloud, which is the other obvious choice, is
         excluded from backup by definition and would quietly undo the whole
         point of moving off web storage. */
      path: FILE, directory: Directory.Documents, encoding: 'utf8',
      data: json, recursive: true,
    });
  } catch (e) {
    console.warn('Could not write the log file', e);
  }
}

/*
 * A dated copy, once a day, kept in the app's own folder.
 *
 * This is the layer that survives what a device backup does not: deleting
 * the app on purpose, or restoring onto a phone whose backup is older than
 * this morning. It is also the copy a person can see and move themselves —
 * the files show up under Basal in the Files app, so they can AirDrop one,
 * mail it, or drop it into whatever cloud they already trust. Their data,
 * their choice, still nothing of mine in the middle.
 */
export async function writeDailyBackup(json) {
  const f = plugin();
  if (!f) return { ok: false };

  const today = new Date().toISOString().slice(0, 10);
  const path = `${BACKUP_DIR}/basal-${today}.json`;

  try {
    await f.writeFile({
      path, directory: Directory.Documents, encoding: 'utf8',
      data: json, recursive: true,
    });
    await prune(f);
    return { ok: true, path };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function prune(f) {
  try {
    const { files } = await f.readdir({ path: BACKUP_DIR, directory: Directory.Documents });
    const names = files.map(x => (typeof x === 'string' ? x : x.name))
      .filter(n => /^basal-\d{4}-\d{2}-\d{2}\.json$/.test(n))
      .sort();
    for (const old of names.slice(0, Math.max(0, names.length - KEEP_BACKUPS))) {
      await f.deleteFile({ path: `${BACKUP_DIR}/${old}`, directory: Directory.Documents });
    }
  } catch { /* nothing to prune */ }
}

/* What is on disk, newest first, for the restore screen. */
export async function listBackups() {
  const f = plugin();
  if (!f) return [];
  try {
    const { files } = await f.readdir({ path: BACKUP_DIR, directory: Directory.Documents });
    return files
      .map(x => (typeof x === 'string' ? { name: x } : x))
      .filter(x => /^basal-\d{4}-\d{2}-\d{2}\.json$/.test(x.name))
      .map(x => ({ name: x.name, date: x.name.slice(6, 16), size: x.size || 0 }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

export async function readBackup(name) {
  const f = plugin();
  if (!f) return null;
  const res = await f.readFile({
    path: `${BACKUP_DIR}/${name}`, directory: Directory.Documents, encoding: 'utf8',
  });
  return typeof res.data === 'string' ? res.data : null;
}
