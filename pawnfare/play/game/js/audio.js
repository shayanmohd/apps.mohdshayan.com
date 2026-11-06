/*
 * Every sound is synthesized with Web Audio: no files. The context starts on the first tap (browsers
 * refuse audio before a gesture) and is suspended while the app is paused.
 */
(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var muted = false;
  var noiseBuf = null;

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
    master.gain.value = muted ? 0 : 0.7;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ctx.destination);
    var len = Math.floor(ctx.sampleRate * 0.4);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    var seed = 22222;
    for (var i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) | 0;
      d[i] = ((seed >>> 16) & 0x7fff) / 16384 - 1;
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
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function now() { return ctx.currentTime + 0.005; }

  function env(gain, t, a, peak, decay) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  function tone(freq, type, t, a, peak, decay, dest) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    env(g, t, a, peak, decay);
    o.connect(g);
    g.connect(dest || master);
    o.start(t);
    o.stop(t + a + decay + 0.05);
    return o;
  }

  function noise(t, freq, q, peak, decay) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    var g = ctx.createGain();
    env(g, t, 0.002, peak, decay);
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start(t);
    s.stop(t + decay + 0.05);
  }

  var sounds = {
    select: function (t) { tone(1760, 'triangle', t, 0.002, 0.08, 0.035); },
    move: function (t) { noise(t, 1300, 3, 0.5, 0.05); tone(220, 'sine', t, 0.003, 0.35, 0.09); },
    rival: function (t) { noise(t, 700, 3, 0.45, 0.06); tone(165, 'sine', t, 0.003, 0.32, 0.1); },
    capture: function (t) {
      noise(t, 2200, 4, 0.55, 0.04);
      noise(t + 0.045, 1800, 4, 0.45, 0.05);
      tone(110, 'sine', t, 0.004, 0.5, 0.18);
    },
    lost: function (t) { tone(196, 'sine', t, 0.02, 0.3, 0.45); tone(147, 'sine', t + 0.22, 0.02, 0.3, 0.6); },
    illegal: function (t) { noise(t, 260, 2, 0.5, 0.05); noise(t + 0.09, 240, 2, 0.4, 0.05); },
    tap: function (t) { tone(1200, 'triangle', t, 0.002, 0.05, 0.03); },
    promote: function (t) { tone(660, 'triangle', t, 0.005, 0.15, 0.2); tone(990, 'triangle', t + 0.07, 0.005, 0.12, 0.25); },
    chime: function (t) {
      [523.25, 659.25, 783.99].forEach(function (f, i) { tone(f, 'sine', t + i * 0.09, 0.006, 0.14, 0.5); });
    },
    fuse: function (t) {
      var a = ctx.createOscillator();
      var b = ctx.createOscillator();
      var g = ctx.createGain();
      a.type = 'sine'; b.type = 'sine';
      a.frequency.setValueAtTime(392, t); a.frequency.exponentialRampToValueAtTime(523.25, t + 0.35);
      b.frequency.setValueAtTime(659.25, t); b.frequency.exponentialRampToValueAtTime(523.25, t + 0.35);
      env(g, t, 0.02, 0.18, 0.6);
      a.connect(g); b.connect(g); g.connect(master);
      a.start(t); b.start(t); a.stop(t + 0.8); b.stop(t + 0.8);
    },
    king: function (t) {
      // An FM bell, with a fifth above.
      [[392, 1.4, 0.32], [587.33, 1.4, 0.18]].forEach(function (p, i) {
        var car = ctx.createOscillator();
        var mod = ctx.createOscillator();
        var mg = ctx.createGain();
        var g = ctx.createGain();
        var tt = t + i * 0.06;
        car.frequency.value = p[0];
        mod.frequency.value = p[0] * p[1];
        mg.gain.setValueAtTime(p[0] * 2.2, tt);
        mg.gain.exponentialRampToValueAtTime(1, tt + 1.4);
        mod.connect(mg); mg.connect(car.frequency);
        env(g, tt, 0.004, p[2], 1.6);
        car.connect(g); g.connect(master);
        car.start(tt); mod.start(tt); car.stop(tt + 1.8); mod.stop(tt + 1.8);
      });
      noise(t, 3000, 1.5, 0.3, 0.08);
    }
  };

  function play(name) {
    if (muted) return;
    var c = ensure();
    if (!c || c.state !== 'running' || !sounds[name]) return;
    try { sounds[name](now()); } catch (e) { /* a sound must never break the game */ }
  }

  var api = { play: play, unlock: unlock, setMuted: setMuted, suspend: suspend, resume: resume };
  (root.Pawnfare = root.Pawnfare || {}).audio = api;
})(this);
