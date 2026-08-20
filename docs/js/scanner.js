/*
 * Camera barcode scanning.
 *
 * Safari has no BarcodeDetector, so ZXing is bundled locally as a fallback.
 * Chrome and Android get the native detector, which is faster and lighter.
 *
 * A single frame can misread. Every scan is confirmed by requiring the same
 * code twice before it's accepted — the difference between logging the
 * right product and the one next to it on the shelf.
 */

let zxingPromise = null;

function loadZXing() {
  if (zxingPromise) return zxingPromise;
  zxingPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/zxing.min.js';
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => reject(new Error('Scanner engine failed to load.'));
    document.head.appendChild(s);
  });
  return zxingPromise;
}

const FORMAT_NAMES = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

/* Food packaging is EAN/UPC. Narrowing to those formats and asking the
   decoder to work harder is worth far more than scanning for QR codes. */
function zxingHints(ZXing) {
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
    ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.ITF,
  ]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  return hints;
}

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/*
 * Why the camera isn't working, in terms that lead somewhere.
 *
 * "Camera failed" is useless. Denied permission, an insecure origin and an
 * old iOS are three completely different problems with three different
 * fixes, and iOS in particular never re-prompts once refused — the only
 * way back is through Settings, which nobody guesses.
 */
export function diagnose(err) {
  const iOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  if (!secureEnough()) {
    return { title: 'Needs a secure connection',
      body: 'The camera only works over https. Open the https:// address rather than http://.' };
  }
  if (!cameraSupported()) {
    return { title: 'This browser will not allow camera access',
      body: 'Type the barcode digits instead, or pick a photo of the barcode.' };
  }
  if (err && err.name === 'NotAllowedError') {
    return {
      title: 'Camera permission was refused',
      body: iOS
        ? (standalone
            ? 'iOS will not ask twice. Delete this app from your Home Screen, open the site in Safari, allow the camera when asked, then add it to the Home Screen again.'
            : 'iOS will not ask twice. Tap the ⚙ or “AA” icon in Safari’s address bar, choose Website Settings, and set Camera to Allow — then reopen this.')
        : 'Your browser is blocking the camera for this site. Click the padlock in the address bar and allow camera access.',
    };
  }
  if (err && err.name === 'NotFoundError') {
    return { title: 'No camera found', body: 'This device has no camera the browser can reach.' };
  }
  if (err && err.name === 'NotReadableError') {
    return { title: 'The camera is busy',
      body: 'Another app is using it. Close that app and try again.' };
  }
  return { title: 'The camera did not start',
    body: (err && err.message) || 'Unknown reason. Use a photo or type the digits instead.' };
}

/*
 * Read a barcode out of a still image.
 *
 * The fallback that keeps working when the live camera does not — a
 * screenshot, a photo taken earlier, or a picture of the packet someone
 * sent you. Uses the native detector where there is one and the bundled
 * decoder otherwise.
 */
export async function decodeImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That file could not be opened as an image.'));
      i.src = url;
    });

    if ('BarcodeDetector' in window) {
      const supported = await window.BarcodeDetector.getSupportedFormats().catch(() => []);
      const formats = FORMAT_NAMES.filter(f => supported.includes(f));
      if (formats.length) {
        const det = new window.BarcodeDetector({ formats });
        const found = await det.detect(img);
        if (found.length) return found[0].rawValue;
      }
    }

    const ZXing = await loadZXing();
    const reader = new ZXing.BrowserMultiFormatReader(zxingHints(ZXing));

    // A photo of a packet is mostly not-barcode. Downscaling huge images and
    // retrying on a centre crop catches the common case where the code is
    // small in frame.
    const attempts = [1, 0.6, 0.4];
    for (const crop of attempts) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const sw = img.naturalWidth * crop, sh = img.naturalHeight * crop;
      const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
      const scale = Math.min(1, 1600 / Math.max(sw, sh));
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      try {
        const res = reader.decodeFromCanvas(canvas);
        if (res) return res.getText();
      } catch { /* try the next crop */ }
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function secureEnough() {
  return window.isSecureContext || location.hostname === 'localhost';
}

export class Scanner {
  constructor(video, { onResult, onError, confirmations = 2 } = {}) {
    this.video = video;
    this.onResult = onResult || (() => {});
    this.onError = onError || (() => {});
    this.confirmations = confirmations;
    this.stream = null;
    this.running = false;
    this.votes = new Map();
    this.track = null;
  }

  async start() {
    if (!secureEnough()) {
      this.onError('The camera needs a secure connection. Open the https:// address, not http://.');
      return false;
    }
    if (!cameraSupported()) {
      this.onError('This browser will not give a page camera access. Enter the barcode digits instead.');
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (e) {
      const d = diagnose(e);
      this.failure = d;
      this.onError(d.body, d);
      return false;
    }

    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play().catch(() => {});
    this.track = this.stream.getVideoTracks()[0];
    this.running = true;

    if ('BarcodeDetector' in window) {
      const supported = await window.BarcodeDetector.getSupportedFormats().catch(() => []);
      const formats = FORMAT_NAMES.filter(f => supported.includes(f));
      if (formats.length) {
        this.detector = new window.BarcodeDetector({ formats });
        this.engine = 'native';
        this._nativeLoop();
        return true;
      }
    }

    try {
      const ZXing = await loadZXing();
      // Hints only take effect through the constructor: it forwards them to
      // the underlying MultiFormatReader. Assigning .hints later is a no-op,
      // which silently leaves QR, Aztec and PDF417 decoding on every frame.
      this.reader = new ZXing.BrowserMultiFormatReader(zxingHints(ZXing));
      this.engine = 'zxing';
      this._zxingLoop(ZXing);
      return true;
    } catch (e) {
      this.onError(e.message);
      this.stop();
      return false;
    }
  }

  _vote(code) {
    if (!code || !/^\d{8,14}$/.test(code)) return;
    const n = (this.votes.get(code) || 0) + 1;
    this.votes.set(code, n);
    if (n >= this.confirmations) {
      this.votes.clear();
      if (navigator.vibrate) navigator.vibrate(18);
      this.onResult(code);
    }
  }

  async _nativeLoop() {
    while (this.running) {
      try {
        const codes = await this.detector.detect(this.video);
        if (codes.length) this._vote(codes[0].rawValue);
      } catch { /* transient decode failures are normal */ }
      await new Promise(r => setTimeout(r, 120));
    }
  }

  async _zxingLoop(ZXing) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    while (this.running) {
      const vw = this.video.videoWidth, vh = this.video.videoHeight;
      if (vw && vh) {
        // Decode only the middle band. It's where the barcode is held, and
        // a quarter of the pixels means roughly four times the frame rate.
        const bandH = Math.round(vh * 0.42);
        const y0 = Math.round((vh - bandH) / 2);
        canvas.width = vw; canvas.height = bandH;
        ctx.drawImage(this.video, 0, y0, vw, bandH, 0, 0, vw, bandH);
        try {
          const res = this.reader.decodeFromCanvas(canvas);
          if (res) this._vote(res.getText());
        } catch { /* NotFoundException on most frames, by design */ }
      }
      await new Promise(r => setTimeout(r, 90));
    }
  }

  async torch(on) {
    if (!this.track) return false;
    const caps = this.track.getCapabilities?.() || {};
    if (!caps.torch) return false;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: on }] });
      return true;
    } catch { return false; }
  }

  hasTorch() {
    return !!(this.track?.getCapabilities?.().torch);
  }

  stop() {
    this.running = false;
    this.votes.clear();
    try { this.reader?.reset?.(); } catch {}
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.track = null;
    if (this.video) this.video.srcObject = null;
  }
}
