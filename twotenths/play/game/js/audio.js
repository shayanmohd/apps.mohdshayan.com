/*
 * Every sound is synthesized with Web Audio, no files: the wheel gun's rattle, the air hiss of the jacks,
 * a short engine note on release, lamp clicks on the start gantry, a two-note chime for Perfect, a low
 * buzz for a cross-thread and a tyre screech for an unsafe release. No crowd (filtered noise reads as
 * static on phone speakers). Visuals and haptics carry every hit first: Web Audio can lag on Android.
 */
(function (root) {
  'use strict';
  var rng = root.TT.rng;

  var ctx = null, master = null, muted = false, noiseBuf = null;

  function now() { return ctx.currentTime; }

  function makeNoise() {
    var len = Math.floor(ctx.sampleRate * 1.5);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    var r = rng.make(0x7e47e475);
    for (var i = 0; i < len; i++) data[i] = r.next() * 2 - 1;
    return buf;
  }

  function build() {
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = makeNoise();
  }

  /** Call from a user gesture: browsers start audio only then. */
  function unlock() {
    try {
      if (!ctx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        ctx = new AC({ latencyHint: 'interactive' });
        build();
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }

  function ready() {
    return !!(ctx && master && !muted && ctx.state === 'running');
  }

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function noise(t, dur, type, freq, q, peak, a) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    var g = ctx.createGain();
    env(g, t, a || 0.004, peak, dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.05);
    return f;
  }

  function tone(t, type, f0, f1, dur, peak, a) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = ctx.createGain();
    env(g, t, a || 0.004, peak, dur);
    o.connect(g); g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  /** The wheel gun: a hammering rattle (a square wave chopped at about 55 Hz) and a metallic whine. */
  function gun(pitch) {
    if (!ready()) return;
    var t = now();
    var p = pitch || 1;
    var o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320 * p, t);
    o.frequency.exponentialRampToValueAtTime(520 * p, t + 0.16);
    var chop = ctx.createOscillator();
    chop.type = 'square';
    chop.frequency.value = 55;
    var chopGain = ctx.createGain();
    chopGain.gain.value = 0.5;
    var amp = ctx.createGain();
    amp.gain.value = 0.5;
    chop.connect(chopGain); chopGain.connect(amp.gain);
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400 * p;
    f.Q.value = 1.2;
    var g = ctx.createGain();
    env(g, t, 0.003, 0.5, 0.17);
    o.connect(amp); amp.connect(f); f.connect(g); g.connect(master);
    o.start(t); chop.start(t);
    o.stop(t + 0.22); chop.stop(t + 0.22);
    noise(t, 0.08, 'highpass', 2500, 0.7, 0.25);
  }

  function hiss() {
    if (!ready()) return;
    var t = now();
    var f = noise(t, 0.32, 'highpass', 3200, 0.5, 0.35, 0.01);
    f.frequency.exponentialRampToValueAtTime(6000, t + 0.3);
    tone(t, 'sine', 95, 60, 0.12, 0.5); // the jack's thud
  }

  function engine() {
    if (!ready()) return;
    var t = now();
    var o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(190, t + 0.55);
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
    var g = ctx.createGain();
    env(g, t, 0.03, 0.45, 0.7);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t);
    o.stop(t + 0.8);
  }

  function idle() {
    if (!ready()) return;
    var t = now();
    var o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(62, t + 1.0);
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    var g = ctx.createGain();
    env(g, t, 0.05, 0.25, 1.0);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t);
    o.stop(t + 1.1);
  }

  function lamp() {
    if (!ready()) return;
    tone(now(), 'square', 180, 180, 0.05, 0.12);
  }

  function perfect() {
    if (!ready()) return;
    var t = now();
    tone(t, 'sine', 1320, 1320, 0.18, 0.18);
    tone(t + 0.06, 'sine', 1980, 1980, 0.22, 0.14);
  }

  function buzz() {
    if (!ready()) return;
    tone(now(), 'square', 110, 92, 0.16, 0.22);
  }

  function screech() {
    if (!ready()) return;
    var t = now();
    var f = noise(t, 0.5, 'bandpass', 2400, 6, 0.4, 0.01);
    f.frequency.exponentialRampToValueAtTime(1200, t + 0.45);
    tone(t, 'square', 640, 560, 0.35, 0.1);
  }

  function click() {
    if (!ready()) return;
    tone(now(), 'triangle', 900, 700, 0.03, 0.08);
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.8;
  }

  function suspend() {
    try { if (ctx && ctx.state === 'running') ctx.suspend(); } catch (e) { /* ignore */ }
  }

  function resume() {
    try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) { /* ignore */ }
  }

  root.TT.audio = {
    unlock: unlock, gun: gun, hiss: hiss, engine: engine, idle: idle, lamp: lamp, perfect: perfect,
    buzz: buzz, screech: screech, click: click, setMuted: setMuted, suspend: suspend, resume: resume
  };
})(typeof self !== 'undefined' ? self : this);
