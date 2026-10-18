/* The viewfinder. A live stream, cropped to the geometry of a 135 frame, and a
   capture path that takes the picture from the raw stream rather than from the
   preview. The preview carries a hint of the loaded stock; the negative does not.
   Nothing the shutter produces is ever shown until the roll develops. */
const Cam = (() => {
  const AR = 2 / 3;             // 24mm by 36mm, held upright
  const LONG = 1800;

  let stream = null, track = null, video = null, starting = null;
  let state = 'idle';           // idle | starting | ready | denied | missing | error
  let torchOn = false, hasTorch = false;
  const listeners = [];

  function on(fn) { listeners.push(fn); }
  function set(s) { state = s; listeners.forEach(f => f(state)); }

  function attach(el) { video = el; }

  function start(facing) {
    if (starting) return starting;
    starting = open(facing).finally(() => { starting = null; });
    return starting;
  }

  async function open(facing) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { set('missing'); return state; }
    stop();
    set('starting');
    const want = {
      audio: false,
      video: {
        facingMode: facing === 'user' ? 'user' : { ideal: 'environment' },
        width: { ideal: 2560 }, height: { ideal: 1440 }
      }
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia(want);
    } catch (e) {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
      catch (e2) {
        set(/NotAllowed|Permission|Security/i.test(e2 && e2.name || '') ? 'denied' : 'missing');
        return state;
      }
    }
    track = stream.getVideoTracks()[0] || null;
    hasTorch = false; torchOn = false;
    try { hasTorch = !!(track && track.getCapabilities && track.getCapabilities().torch); } catch (e) {}
    if (video) {
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      video.setAttribute('playsinline', '');
      try { await video.play(); } catch (e) {}
      if (!video.videoWidth) await ready(video, 3000);
    }
    set('ready');
    return state;
  }

  /** A stream is not a picture until the element has dimensions. */
  function ready(el, ms) {
    return new Promise(res => {
      let done = false;
      const fin = () => { if (!done) { done = true; clean(); res(); } };
      const clean = () => {
        el.removeEventListener('loadedmetadata', fin);
        el.removeEventListener('loadeddata', fin);
        el.removeEventListener('playing', fin);
      };
      el.addEventListener('loadedmetadata', fin);
      el.addEventListener('loadeddata', fin);
      el.addEventListener('playing', fin);
      setTimeout(fin, ms);
    });
  }

  function stop() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; track = null; torchOn = false;
    if (video) video.srcObject = null;
    if (state === 'ready') set('idle');
  }

  async function torch(want) {
    if (!track || !hasTorch) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: !!want }] });
      torchOn = !!want;
      return true;
    } catch (e) { return false; }
  }

  /** One frame off the live stream, cropped to 2:3 and never shown to anybody. */
  async function capture(facing) {
    const src = video;
    if (src && !src.videoWidth) await ready(src, 900);
    const vw = src && (src.videoWidth || src.width), vh = src && (src.videoHeight || src.height);
    if (!vw || !vh) return null;
    let cw = vw, chh = Math.round(vw / AR);
    if (chh > vh) { chh = vh; cw = Math.round(vh * AR); }
    const sx = Math.round((vw - cw) / 2), sy = Math.round((vh - chh) / 2);
    const outH = Math.min(LONG, chh), outW = Math.round(outH * AR);
    const cv = document.createElement('canvas');
    cv.width = outW; cv.height = outH;
    const ctx = cv.getContext('2d');
    if (facing === 'user') { ctx.translate(outW, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, sx, sy, cw, chh, 0, 0, outW, outH);
    return new Promise(r => cv.toBlob(r, 'image/jpeg', 0.94));
  }

  return { AR, attach, start, stop, torch, capture, on,
           get state() { return state; },
           get hasTorch() { return hasTorch; },
           get torchOn() { return torchOn; },
           get live() { return state === 'ready'; } };
})();
