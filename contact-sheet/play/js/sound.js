/* The camera's voice, synthesised. No audio files ship with this app: every click,
   ratchet and motor is built from noise and a filter at the moment it is needed,
   which is also why the whole app is a few hundred kilobytes.

   Volume follows the shutter setting. Discreet is genuinely silent, and a roll
   shot that way is stamped DISCREET on its sheet, because the deal is honesty. */
const Sound = (() => {
  let ctx = null;
  let noiseBuf = null;

  const GAINS = { full: 1, quiet: 0.34, discreet: 0 };
  function level() { return GAINS[Store.settings().sound] ?? 1; }

  function ac() {
    if (ctx) return ctx;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    const n = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  /** Browsers start the clock suspended; the first tap on the app wakes it. */
  function wake() { const c = ac(); if (c && c.state === 'suspended') c.resume(); }

  function noise(at, dur, type, freq, q, gain, curve) {
    const c = ac(); if (!c || gain <= 0) return;
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + (curve || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f); f.connect(g); g.connect(c.destination);
    s.start(at); s.stop(at + dur + 0.02);
  }

  function tone(at, dur, freq, freq2, gain, type) {
    const c = ac(); if (!c || gain <= 0) return;
    const o = c.createOscillator();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, at);
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(c.destination);
    o.start(at); o.stop(at + dur + 0.02);
  }

  /* --- the parts --- */
  function shutter() {
    const c = ac(); if (!c) return;
    const v = level(); if (v <= 0) return;
    const t = c.currentTime;
    noise(t, 0.014, 'bandpass', 3200, 1.2, 0.42 * v, 0.001);      // blade
    noise(t + 0.012, 0.055, 'bandpass', 520, 0.9, 0.30 * v, 0.002); // body
    tone(t + 0.010, 0.05, 340, 190, 0.10 * v, 'triangle');          // the thunk
  }

  /** The 1.2 seconds that change the pacing of the whole app. */
  function windOn(ms) {
    const c = ac(); if (!c) return;
    const v = level();
    const t = c.currentTime;
    const steps = 9, span = (ms || 1200) / 1000 * 0.86;
    for (let i = 0; i < steps; i++) {
      const p = i / (steps - 1);
      const at = t + span * (p * p * 0.55 + p * 0.45);
      if (v > 0) noise(at, 0.010, 'bandpass', 2300 + i * 130, 2.4, (0.13 + p * 0.10) * v, 0.001);
    }
    if (v > 0) {
      noise(t + span + 0.03, 0.05, 'bandpass', 420, 1.0, 0.22 * v, 0.002);
      tone(t + span + 0.03, 0.05, 240, 150, 0.07 * v, 'triangle');
    }
  }

  function rewind() {
    const c = ac(); if (!c) return;
    const v = level(); if (v <= 0) return;
    const t = c.currentTime;
    noise(t, 1.9, 'bandpass', 900, 3.5, 0.16 * v, 0.12);
    tone(t, 1.75, 120, 300, 0.055 * v, 'sawtooth');
    tone(t + 1.75, 0.22, 300, 90, 0.05 * v, 'sawtooth');
    noise(t + 1.96, 0.06, 'bandpass', 600, 1.0, 0.26 * v, 0.002);
  }

  function cartridge() {
    const c = ac(); if (!c) return;
    const v = level(); if (v <= 0) return;
    const t = c.currentTime;
    noise(t, 0.07, 'lowpass', 380, 0.7, 0.34 * v, 0.002);
    tone(t + 0.005, 0.09, 190, 96, 0.10 * v, 'triangle');
    noise(t + 0.20, 0.03, 'bandpass', 2600, 2.0, 0.16 * v, 0.001);  // the back clicking shut
  }

  /** An envelope of prints sliding across a counter. */
  function envelope() {
    const c = ac(); if (!c) return;
    const v = level(); if (v <= 0) return;
    const t = c.currentTime;
    noise(t, 0.42, 'bandpass', 1700, 0.8, 0.13 * v, 0.14);
    noise(t + 0.30, 0.20, 'bandpass', 900, 0.7, 0.09 * v, 0.06);
  }

  function tick() {
    const c = ac(); if (!c) return;
    const v = level(); if (v <= 0) return;
    noise(c.currentTime, 0.008, 'bandpass', 2800, 2.5, 0.10 * v, 0.001);
  }

  /* --- haptics: the same mechanics, felt --- */
  const N = () => (window.Native && Store.settings().haptics) ? window.Native : null;
  function buzz(ms, amp) {
    const n = N();
    if (n) { try { n.vibrate(ms, amp); return; } catch (e) {} }
    if (Store.settings().haptics && navigator.vibrate) navigator.vibrate(ms);
  }
  function pattern(arr, amp) {
    const n = N();
    if (n) { try { n.vibratePattern(JSON.stringify(arr), amp); return; } catch (e) {} }
    if (Store.settings().haptics && navigator.vibrate) navigator.vibrate(arr);
  }

  const hShutter = () => buzz(26, 220);
  const hWind = () => pattern([7, 118, 7, 112, 7, 104, 7, 96, 7, 88, 7, 82, 7, 78, 7, 74, 14], 150);
  const hRewind = () => pattern([260, 60, 420, 60, 640, 90, 40], 130);
  const hTap = () => buzz(9, 90);
  const hLoad = () => pattern([16, 70, 30], 200);

  return { wake, shutter, windOn, rewind, cartridge, envelope, tick,
           hShutter, hWind, hRewind, hTap, hLoad, buzz, pattern };
})();
