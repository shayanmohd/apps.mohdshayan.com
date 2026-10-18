/* The only thing in Detour that reads a sensor. It runs while a walk is on screen and stops the
   moment the walk ends, and nothing it produces leaves this device. */
const Geo = (() => {
  let watchId = null;
  let onFix = null, onState = null;
  let state = 'idle';          // idle | searching | ok | poor | denied | unavailable
  let last = null;             // { lat, lon, acc, t, speed }
  let heading = null, headingSrc = null, headingAt = 0;
  let orientBound = false, absoluteSeen = false, fallbackTimer = null;
  let paceSamples = [];        // { m, s }

  const ACCEPT_ACC = 45;       // metres. Beyond this a fix says more about the sky than about you.
  const MIN_STEP = 7;          // metres. Below this it is jitter, not walking.
  const MAX_SPEED = 7;         // m/s. Faster than this and you are in a vehicle or the fix jumped.

  function setState(s, detail) {
    if (state === s) return;
    state = s;
    if (onState) onState(s, detail);
  }

  /* ---------- heading ---------- */
  function circBlend(a, b, k) {
    if (a == null) return b;
    const d = ((b - a + 540) % 360) - 180;
    return (a + d * k + 360) % 360;
  }
  function pushHeading(h, src) {
    if (h == null || isNaN(h)) return;
    heading = circBlend(heading, (h + 360) % 360, 0.35);
    headingSrc = src;
    headingAt = Date.now();
  }
  function onOrient(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
    else if (e.absolute === true && typeof e.alpha === 'number' && e.alpha !== null) h = (360 - e.alpha) % 360;
    if (h === null) return;
    absoluteSeen = true;
    pushHeading(h, 'compass');
  }
  function bindOrient() {
    if (orientBound || typeof window.addEventListener !== 'function') return;
    orientBound = true;
    try {
      window.addEventListener('deviceorientationabsolute', onOrient, true);
      // Some builds only ever fire the plain event, with absolute set on the payload.
      fallbackTimer = setTimeout(() => {
        if (!absoluteSeen) window.addEventListener('deviceorientation', onOrient, true);
      }, 2500);
    } catch (e) { /* no sensor, the course over ground carries it */ }
  }
  function unbindOrient() {
    if (!orientBound) return;
    orientBound = false;
    clearTimeout(fallbackTimer);
    try {
      window.removeEventListener('deviceorientationabsolute', onOrient, true);
      window.removeEventListener('deviceorientation', onOrient, true);
    } catch (e) {}
  }

  /** The heading to draw with, or null when we genuinely do not know which way you face. */
  function facing() {
    if (heading !== null && Date.now() - headingAt < 12000) return heading;
    return null;
  }
  const facingSource = () => (facing() === null ? null : headingSrc);

  /* ---------- pace ---------- */
  function notePace(m, s) {
    if (s <= 0 || m <= 0) return;
    const v = m / s;
    if (v < 0.4 || v > 3) return;
    paceSamples.push({ m, s });
    if (paceSamples.length > 90) paceSamples.shift();
  }
  function pace() {
    if (paceSamples.length < 6) return 1.32;
    const m = paceSamples.reduce((a, b) => a + b.m, 0);
    const s = paceSamples.reduce((a, b) => a + b.s, 0);
    return Math.min(2.0, Math.max(0.7, m / s));
  }

  /* ---------- the watch ---------- */
  function start(fixCb, stateCb) {
    onFix = fixCb; onState = stateCb;
    last = null; paceSamples = [];
    if (!navigator.geolocation) { setState('unavailable', 'This browser has no location at all.'); return; }
    setState('searching');
    bindOrient();
    try {
      watchId = navigator.geolocation.watchPosition(handle, fail, {
        enableHighAccuracy: true, maximumAge: 2000, timeout: 25000
      });
    } catch (e) { setState('unavailable', String(e && e.message || e)); }
  }

  function handle(pos) {
    const c = pos.coords;
    const t = pos.timestamp || Date.now();
    const acc = typeof c.accuracy === 'number' ? c.accuracy : 999;
    if (typeof c.heading === 'number' && !isNaN(c.heading) && (c.speed || 0) > 0.8) {
      pushHeading(c.heading, headingSrc === 'compass' && Date.now() - headingAt < 4000 ? 'compass' : 'course');
    }
    if (acc > 120) { setState('poor', Math.round(acc)); return; }
    setState(acc > ACCEPT_ACC ? 'poor' : 'ok', Math.round(acc));

    const fix = { lat: c.latitude, lon: c.longitude, acc, t, speed: c.speed || null };
    if (!last) { last = fix; emit(fix, 0, true); return; }

    const dt = (t - last.t) / 1000;
    const m = Store.dist([last.lat, last.lon], [fix.lat, fix.lon]);
    if (dt > 0 && m / dt > MAX_SPEED && dt < 30) return;   // a jump, not a stride
    if (m < MIN_STEP && acc > 12) { last.t = t; return; }  // standing still, or drift inside the error
    if (m < 2) { last.t = t; return; }

    if (dt > 0 && dt < 120) notePace(m, dt);
    last = fix;
    emit(fix, m, false);
  }

  function emit(fix, m, first) { if (onFix) onFix(fix, m, first); }

  function fail(err) {
    if (err && err.code === 1) setState('denied');
    else if (err && err.code === 3) setState('searching');
    else setState('unavailable', err && err.message);
  }

  function stop() {
    if (watchId !== null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(watchId); } catch (e) {}
    }
    watchId = null; onFix = null; onState = null;
    unbindOrient();
    setState('idle');
  }

  /** After the app has been away, the next fix is a new starting point, not a hundred metre stride. */
  function resync() { last = null; }

  const isRunning = () => watchId !== null;
  const current = () => last;
  const status = () => state;

  return { start, stop, resync, isRunning, current, status, facing, facingSource, pace, notePace };
})();
