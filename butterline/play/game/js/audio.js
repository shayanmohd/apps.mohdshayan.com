/*
 * Every sound is synthesized with Web Audio: engine, wind, rollout rumble, tyre chirp, touchdown thump,
 * the butter chime, the stall shaker, callout ticks and UI clicks. No sound files.
 */
(function (root) {
  'use strict';
  var rng = root.BL.rng;

  var ctx = null;
  var master = null;
  var muted = false;
  var noiseBuf = null;
  var engine = null;
  var wind = null;
  var rumble = null;
  var shaker = null;
  var current = 'bush';
  var offsets = rng.make(0x0ff5e7);

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

  function loopNoise(type, freq, q) {
    var src = noiseSource();
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q || 0.7;
    var g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
    return { src: src, filter: f, gain: g };
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

    var o1 = ctx.createOscillator();
    var o2 = ctx.createOscillator();
    var whine = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    whine.type = 'sine';
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.Q.value = 1.2;
    var eg = ctx.createGain();
    eg.gain.value = 0;
    var wg = ctx.createGain();
    wg.gain.value = 0;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(eg);
    eg.connect(master);
    whine.connect(wg);
    wg.connect(master);
    o1.start();
    o2.start();
    whine.start();
    var jetHiss = loopNoise('bandpass', 900, 0.6);
    engine = { o1: o1, o2: o2, whine: whine, lp: lp, gain: eg, whineGain: wg, hiss: jetHiss };

    wind = loopNoise('bandpass', 600, 0.5);
    rumble = loopNoise('lowpass', 140, 0.8);
    var sh = ctx.createOscillator();
    sh.type = 'square';
    sh.frequency.value = 26;
    var shg = ctx.createGain();
    shg.gain.value = 0;
    var shf = ctx.createBiquadFilter();
    shf.type = 'lowpass';
    shf.frequency.value = 260;
    sh.connect(shf);
    shf.connect(shg);
    shg.connect(master);
    sh.start();
    shaker = { gain: shg };
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

  function ramp(param, value, time) {
    var t = now();
    param.cancelScheduledValues(t);
    param.setTargetAtTime(value, t, time || 0.08);
  }

  function setMuted(m) {
    muted = !!m;
    if (master) ramp(master.gain, muted ? 0 : 0.8, 0.05);
  }

  function setAircraft(id) {
    current = id;
  }

  /**
   * Continuous sounds for one frame. s: {active, thrust (0..1), airspeed (0..1), gust (0..1),
   * ground (0..1 rolling speed), shaker (bool)}.
   */
  function update(s) {
    if (!ctx || !engine) return;
    var on = s.active ? 1 : 0;
    var th = s.thrust;
    var base = current === 'bush' ? 44 : current === 'turboprop' ? 62 : 38;
    engine.o1.frequency.setTargetAtTime(base * (1 + 0.28 * th), now(), 0.15);
    engine.o2.frequency.setTargetAtTime(base * 0.5 * (1 + 0.28 * th), now(), 0.15);
    engine.lp.frequency.setTargetAtTime(260 + 700 * th, now(), 0.15);
    var propGain = current === 'jet' ? 0.012 : 0.05 + 0.06 * th;
    ramp(engine.gain.gain, on * propGain, 0.12);
    var wf = current === 'turboprop' ? 1150 : current === 'jet' ? 2300 : 0;
    if (wf) engine.whine.frequency.setTargetAtTime(wf * (0.92 + 0.14 * th), now(), 0.2);
    ramp(engine.whineGain.gain, on * (wf ? 0.008 + 0.012 * th : 0), 0.2);
    ramp(engine.hiss.gain.gain, on * (current === 'jet' ? 0.04 + 0.08 * th : 0), 0.2);
    wind.filter.frequency.setTargetAtTime(380 + 900 * s.airspeed + 500 * s.gust, now(), 0.2);
    ramp(wind.gain.gain, on * (0.03 + 0.07 * s.airspeed + 0.08 * s.gust), 0.2);
    ramp(rumble.gain.gain, on * 0.16 * s.ground, 0.08);
    ramp(shaker.gain.gain, on && s.shaker ? 0.05 : 0, 0.03);
  }

  function burst(type, freq, q, gain, dur, sweepTo) {
    if (!ctx) return;
    var src = noiseSource();
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, now() + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, now());
    g.gain.linearRampToValueAtTime(gain, now() + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, now() + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(now(), offsets.next() * 1.5);
    src.stop(now() + dur + 0.05);
  }

  function tone(type, freq, gain, attack, dur, toFreq) {
    if (!ctx) return;
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now());
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, now() + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, now());
    g.gain.linearRampToValueAtTime(gain, now() + attack);
    g.gain.exponentialRampToValueAtTime(0.0006, now() + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(now() + dur + 0.05);
  }

  /** The tyre chirp: a short band of noise with a falling tone; soft for a butter landing. */
  function chirp(strength) {
    var k = Math.max(0.25, Math.min(1, strength));
    burst('bandpass', 2600, 4, 0.22 * k, 0.12 + 0.08 * k, 1300);
    tone('sine', 1900, 0.05 * k, 0.004, 0.14, 900);
  }

  function thump(strength) {
    var k = Math.max(0.2, Math.min(1.2, strength));
    tone('sine', 90, 0.45 * k, 0.004, 0.32, 40);
    burst('lowpass', 300, 1, 0.3 * k, 0.25);
  }

  function chime() {
    tone('sine', 659.25, 0.07, 0.02, 1.1);
    setTimeout(function () { tone('sine', 987.77, 0.06, 0.02, 1.3); }, 120);
  }

  function stamp(clean) {
    tone('triangle', clean ? 150 : 110, 0.22, 0.003, 0.22, clean ? 120 : 70);
    burst('lowpass', 900, 0.8, 0.16, 0.09);
  }

  function tick() {
    tone('sine', 1320, 0.035, 0.002, 0.06);
  }

  function click() {
    tone('sine', 880, 0.04, 0.002, 0.05, 660);
  }

  function suspend() {
    if (ctx && ctx.state === 'running') ctx.suspend();
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  root.BL.audio = {
    unlock: unlock,
    setMuted: setMuted,
    setAircraft: setAircraft,
    update: update,
    chirp: chirp,
    thump: thump,
    chime: chime,
    stamp: stamp,
    tick: tick,
    click: click,
    suspend: suspend,
    resume: resume,
    get ready() { return !!ctx; }
  };
})(typeof self !== 'undefined' ? self : this);
