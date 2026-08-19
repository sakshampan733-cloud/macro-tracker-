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
      const msg = e.name === 'NotAllowedError'
        ? 'Camera access was declined. Allow it in Safari settings for this site, or type the digits.'
        : e.name === 'NotFoundError'
          ? 'No camera found on this device.'
          : `Camera did not start: ${e.message}`;
      this.onError(msg);
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
