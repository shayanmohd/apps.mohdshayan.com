/*
 * Every sound in Sherd is synthesized with Web Audio: no files, nothing to load. Brush, soil, wood,
 * ceramic and bell voices, all quiet and short. The context starts on the first touch (autoplay rules)
 * and is suspended while the app is in the background.
 */
(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var muted = false;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    master.connect(comp);
    comp.connect(ctx.destination);
    var len = Math.floor(ctx.sampleRate * 1.2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noiseBuf.getChannelData(0);
    var seed = 12345;
    for (var i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x3fffffff) - 1;
    }
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.02);
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended' && !muted) ctx.resume(); }

  function ready() {
    if (muted) return null;
    var c = ensure();
    if (!c || c.state !== 'running') return null;
    return c;
  }

  function env(gain, t, attack, decay, peak) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function noise(c, t, dur, type, freq, q, peak, attack) {
    var src = c.createBufferSource();
    src.buffer = noiseBuf;
    var f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    var g = c.createGain();
    env(g, t, attack || 0.004, dur, peak);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
    return f;
  }

  function tone(c, t, freq, dur, type, peak, attack, bend) {
    var o = c.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(freq * bend, t + dur);
    var g = c.createGain();
    env(g, t, attack || 0.003, dur, peak);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + (attack || 0.003) + dur + 0.05);
  }

  var voices = {
    // A soft brush stroke, a step brighter for every painted cell.
    paint: function (c, t, step) {
      noise(c, t, 0.05, 'bandpass', 1800 + (step || 0) * 260, 1.4, 0.32);
      tone(c, t, 420 + (step || 0) * 38, 0.05, 'triangle', 0.035);
    },
    unpaint: function (c, t) { noise(c, t, 0.05, 'bandpass', 1100, 1.2, 0.22); },
    refuse: function (c, t) {
      tone(c, t, 150, 0.07, 'sine', 0.28, 0.002, 0.8);
      tone(c, t + 0.085, 120, 0.08, 'sine', 0.24, 0.002, 0.8);
    },
    dig: function (c, t) {
      var f = noise(c, t, 0.16, 'bandpass', 900, 0.9, 0.3, 0.02);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
    },
    miss: function (c, t) { noise(c, t, 0.09, 'lowpass', 380, 0.7, 0.42); },
    near: function (c, t) {
      tone(c, t, 540, 0.07, 'triangle', 0.2);
      tone(c, t, 1310, 0.03, 'sine', 0.05);
    },
    hit: function (c, t) {
      [1840, 2963, 4211, 5390].forEach(function (f, i) { tone(c, t, f, 0.22 - i * 0.04, 'sine', 0.09 / (i + 1)); });
      noise(c, t, 0.02, 'highpass', 5000, 0.7, 0.06);
    },
    win: function (c, t) {
      [659.3, 784, 987.8, 1318.5].forEach(function (f, i) {
        var at = t + i * 0.11;
        tone(c, at, f, 1.2, 'sine', 0.12, 0.004);
        tone(c, at, f * 2.76, 0.5, 'sine', 0.03, 0.002);
      });
    },
    lose: function (c, t) {
      tone(c, t, 196, 0.9, 'sine', 0.16, 0.03, 0.94);
      tone(c, t, 233, 0.9, 'sine', 0.07, 0.05, 0.94);
    },
    settle: function (c, t) {
      voices.hit(c, t);
      tone(c, t + 0.05, 110, 0.18, 'sine', 0.2, 0.004, 0.7);
    },
    restore: function (c, t) {
      [523.3, 659.3, 784, 1046.5, 1568].forEach(function (f, i) {
        var at = t + i * 0.16;
        tone(c, at, f, 1.6, 'sine', 0.1, 0.006);
        tone(c, at, f * 3.01, 0.6, 'sine', 0.02, 0.003);
      });
    },
    tap: function (c, t) { tone(c, t, 880, 0.03, 'triangle', 0.06); },
    page: function (c, t) { noise(c, t, 0.12, 'bandpass', 2400, 0.6, 0.12, 0.03); }
  };

  function play(name, arg, delay) {
    var c = ready();
    if (!c || !voices[name]) return;
    try {
      voices[name](c, c.currentTime + (delay || 0) + 0.005, arg);
    } catch (e) { /* a missing node type on an old WebView: stay silent */ }
  }

  root.Sherd = root.Sherd || {};
  root.Sherd.audio = { unlock: unlock, play: play, setMuted: setMuted, suspend: suspend, resume: resume };
})(this);
