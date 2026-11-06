/*
 * Every sound is synthesized with Web Audio: a soft wind bed that swells with gusts, a line zip when a
 * pull starts, the saw buzz while lines are crossed, the line snap and a drum hit on a cut (its pitch
 * rising with the run of cuts), a low thud for a lost kite, a plucked chime and UI ticks. No crowd
 * cheer and no sound files. The cut is carried by visuals and haptics first: Web Audio can lag on Android.
 */
(function (root) {
  'use strict';
  var rng = root.LS.rng;

  var ctx = null, master = null, muted = false, noiseBuf = null;
  var wind = null, saw = null;

  function now() { return ctx.currentTime; }

  function makeNoise() {
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    var r = rng.make(0x5eed1e55);
    for (var i = 0; i < len; i++) data[i] = r.next() * 2 - 1;
    return buf;
  }

  function noiseSource() {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    return src;
  }

  function build() {
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = makeNoise();

    var ws = noiseSource();
    var wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 420;
    wf.Q.value = 0.6;
    var wg = ctx.createGain();
    wg.gain.value = 0;
    ws.connect(wf); wf.connect(wg); wg.connect(master);
    ws.start();
    wind = { filter: wf, gain: wg };

    var so = ctx.createOscillator();
    so.type = 'sawtooth';
    so.frequency.value = 110;
    var sn = noiseSource();
    var sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 1800;
    sf.Q.value = 1.4;
    var sg = ctx.createGain();
    sg.gain.value = 0;
    var og = ctx.createGain();
    og.gain.value = 0.25;
    so.connect(og); og.connect(sf);
    sn.connect(sf); sf.connect(sg); sg.connect(master);
    so.start(); sn.start();
    saw = { osc: so, filter: sf, gain: sg };
  }

  /** Call from a user gesture: browsers start audio only then. */
  function unlock() {
    try {
      if (!ctx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        build();
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      ctx = null;
    }
  }

  function ready() { return !!ctx && ctx.state === 'running' && !muted; }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, now(), 0.02);
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended' && !muted) ctx.resume(); }

  /** Per frame: wind 0 to 1, gust 0 to 1, saw 0 to 2 (both lines' saw while crossed), active. */
  function update(s) {
    if (!ctx || !wind) return;
    var t = now();
    var wv = s.active ? 0.05 + 0.1 * Math.min(1, s.wind) + 0.12 * Math.min(1, s.gust) : 0.03;
    wind.gain.gain.setTargetAtTime(wv, t, 0.25);
    wind.filter.frequency.setTargetAtTime(360 + 380 * Math.min(1, s.gust + s.wind * 0.3), t, 0.3);
    var sv = s.active && s.saw > 0 ? 0.05 + 0.09 * Math.min(2, s.saw) : 0;
    saw.gain.gain.setTargetAtTime(sv, t, 0.04);
    saw.osc.frequency.setTargetAtTime(90 + 60 * Math.min(2, s.saw) + (s.hot ? 40 : 0), t, 0.05);
    saw.filter.frequency.setTargetAtTime(1500 + 900 * Math.min(2, s.saw), t, 0.05);
  }

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  /** A short rising whirr of line through the hand when a pull starts. */
  function zip(level) {
    if (!ready()) return;
    var t = now();
    var src = noiseSource();
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.12);
    var g = ctx.createGain();
    env(g, t, 0.01, 0.07 * (level || 1), 0.12);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.2);
  }

  /** The line snapping: a crack of noise and a high pluck falling away. */
  function snap() {
    if (!ready()) return;
    var t = now();
    var src = noiseSource();
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    var g = ctx.createGain();
    env(g, t, 0.002, 0.5, 0.09);
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t, 0.3);
    src.stop(t + 0.14);
    var o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1400, t);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.25);
    var og = ctx.createGain();
    env(og, t, 0.003, 0.18, 0.28);
    o.connect(og); og.connect(master);
    o.start(t);
    o.stop(t + 0.32);
  }

  /** A drum hit (dhol-like): a pitched body that drops, with a slap on top. pitch 1 is the base. */
  function drum(pitch, level) {
    if (!ready()) return;
    var t = now();
    var p = pitch || 1;
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150 * p, t);
    o.frequency.exponentialRampToValueAtTime(58 * p, t + 0.22);
    var g = ctx.createGain();
    env(g, t, 0.004, 0.75 * (level || 1), 0.42);
    o.connect(g); g.connect(master);
    o.start(t);
    o.stop(t + 0.5);
    var src = noiseSource();
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 * p;
    bp.Q.value = 1.2;
    var sg = ctx.createGain();
    env(sg, t, 0.002, 0.22 * (level || 1), 0.07);
    src.connect(bp); bp.connect(sg); sg.connect(master);
    src.start(t, 0.7);
    src.stop(t + 0.1);
  }

  /** Your kite is lost: a low, dull thud. */
  function thud() {
    if (!ready()) return;
    var t = now();
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    var g = ctx.createGain();
    env(g, t, 0.006, 0.6, 0.4);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(t);
    o.stop(t + 0.5);
  }

  /** A plucked chime (a ring reached, a record). */
  function chime(steps) {
    if (!ready()) return;
    var t = now();
    var notes = steps || [0, 7];
    for (var i = 0; i < notes.length; i++) {
      var o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 660 * Math.pow(2, notes[i] / 12);
      var g = ctx.createGain();
      env(g, t + i * 0.07, 0.004, 0.16, 0.5);
      o.connect(g); g.connect(master);
      o.start(t + i * 0.07);
      o.stop(t + i * 0.07 + 0.6);
    }
  }

  function click() {
    if (!ready()) return;
    var t = now();
    var o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1900;
    var g = ctx.createGain();
    env(g, t, 0.001, 0.04, 0.03);
    o.connect(g); g.connect(master);
    o.start(t);
    o.stop(t + 0.05);
  }

  /** Sunset: two drum hits. */
  function sunset() {
    drum(0.8, 0.8);
    if (!ctx) return;
    setTimeout(function () { drum(1.0, 0.9); }, 180);
  }

  root.LS.audio = {
    unlock: unlock, setMuted: setMuted, suspend: suspend, resume: resume, update: update,
    zip: zip, snap: snap, drum: drum, thud: thud, chime: chime, click: click, sunset: sunset
  };
})(typeof self !== 'undefined' ? self : this);
