/*
 * Every sound is synthesized with Web Audio: paper, wood, pen, water and small bells. No sound files.
 * The context starts on the first tap (browsers need a gesture) and is suspended while the app is away.
 */
(function (root) {
  'use strict';
  var FC = root.FC || (root.FC = {});

  var ctx = null, master = null, noiseBuf = null;
  var muted = false;
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
      return null;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.02);
  }

  function ready() {
    return !muted && ctx && ctx.state === 'running';
  }

  function noise(t0, dur, type, freq, q, gain, sweepTo) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    f.Q.value = q;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  function tone(t0, freq, dur, type, gain, attack, endFreq) {
    var o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + (attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function hz(semi) { return 392 * Math.pow(2, semi / 12); } // from G4

  var sfx = {
    pick: function () { var t = ctx.currentTime; noise(t, 0.12, 'bandpass', 2400, 0.9, 0.12, 1200); },
    turn: function () {
      var t = ctx.currentTime;
      tone(t, 1150, 0.05, 'triangle', 0.16, 0.002, 700);
      noise(t, 0.04, 'highpass', 3000, 0.7, 0.08);
    },
    place: function () {
      var t = ctx.currentTime;
      tone(t, 150, 0.16, 'sine', 0.32, 0.004, 90);
      noise(t, 0.09, 'lowpass', 900, 0.6, 0.18);
      noise(t + 0.02, 0.5, 'bandpass', 1400, 0.6, 0.07, 420); // the fog's whoosh
    },
    tick: function (n) {
      var t = ctx.currentTime;
      var f = hz(PENTA[Math.min(PENTA.length - 1, n)] + 12);
      tone(t, f, 0.11, 'triangle', 0.09, 0.002);
      noise(t, 0.025, 'highpass', 5000, 0.8, 0.05);
    },
    closure: function () {
      var t = ctx.currentTime;
      tone(t, hz(0), 0.9, 'sine', 0.14, 0.04);
      tone(t + 0.07, hz(7), 0.9, 'sine', 0.11, 0.04);
      tone(t + 0.14, hz(12), 0.8, 'sine', 0.07, 0.05);
    },
    bell: function () {
      var t = ctx.currentTime;
      var base = hz(19);
      [1, 2.76, 5.4, 8.93].forEach(function (m, i) { tone(t, base * m, 1.4 - i * 0.25, 'sine', 0.08 / (i + 1), 0.002); });
    },
    river: function () {
      var t = ctx.currentTime;
      tone(t, hz(4), 0.6, 'sine', 0.08, 0.05, hz(16));
      noise(t, 0.8, 'bandpass', 700, 1.4, 0.06, 1800);
    },
    undo: function () {
      var t = ctx.currentTime;
      noise(t, 0.3, 'bandpass', 500, 0.7, 0.08, 1600);
      tone(t, 220, 0.12, 'sine', 0.12, 0.01, 300);
    },
    refuse: function () {
      var t = ctx.currentTime;
      tone(t, 140, 0.08, 'square', 0.05, 0.002);
      tone(t + 0.09, 120, 0.08, 'square', 0.05, 0.002);
    },
    finish: function (atPar) {
      var t = ctx.currentTime;
      var notes = atPar ? [0, 4, 7, 12] : [0, 4, 7];
      notes.forEach(function (n, i) { tone(t + i * 0.16, hz(n + 7), 0.7, 'triangle', 0.1, 0.01); });
    },
    ui: function () { var t = ctx.currentTime; tone(t, 880, 0.04, 'sine', 0.05, 0.002); }
  };

  function play(name, arg) {
    if (!ready() || !sfx[name]) return;
    try { sfx[name](arg); } catch (e) { /* audio is optional */ }
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  FC.audio = { unlock: unlock, play: play, setMuted: setMuted, suspend: suspend, resume: resume };
})(window);
