/*
 * Every sound in Slogstop is made here with Web Audio: no files. The context starts on the first touch
 * (browsers require a gesture). A shared noise buffer feeds the crowd, the bat and the stumps.
 */
(function (root) {
  'use strict';
  var SS = root.SS || (root.SS = {});
  var ctx = null;
  var master = null;
  var noise = null;
  var on = true;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return;
    }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
      return;
    }
    master = ctx.createGain();
    master.gain.value = on ? 0.8 : 0;
    master.connect(ctx.destination);
    var len = Math.floor(ctx.sampleRate * 1.5);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noise.getChannelData(0);
    var seed = 12345;
    for (var i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = seed / 0x3fffffff - 1;
    }
  }

  function setOn(v) {
    on = !!v;
    if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.02);
  }

  function ready() { return ctx && on && ctx.state !== 'closed'; }

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function tone(freq, type, peak, a, d, when, bend) {
    if (!ready()) return;
    var t = ctx.currentTime + (when || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(freq * bend, t + a + d);
    env(g, t, a, peak, d);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + a + d + 0.05);
  }

  function burst(filterType, freq, q, peak, a, d, when, rate) {
    if (!ready()) return;
    var t = ctx.currentTime + (when || 0);
    var s = ctx.createBufferSource();
    s.buffer = noise;
    s.playbackRate.value = rate || 1;
    var f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    var g = ctx.createGain();
    env(g, t, a, peak, d);
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + a + d + 0.05);
  }

  var sfx = {
    tap: function () { tone(880, 'triangle', 0.08, 0.002, 0.05); },
    tick: function (n) { tone(n === 1 ? 660 : 520, 'square', 0.06, 0.002, 0.07); },
    lock: function () { tone(300, 'triangle', 0.07, 0.002, 0.06); },
    go: function () { tone(990, 'square', 0.07, 0.002, 0.12); },
    bowl: function () { burst('bandpass', 900, 0.8, 0.05, 0.01, 0.25); },
    /** The bat: a woody crack, brighter for a bigger hit (power 0 to 1). */
    crack: function (power) {
      var p = Math.max(0, Math.min(1, power || 0));
      burst('bandpass', 1800 + 1600 * p, 2.5, 0.35 + 0.3 * p, 0.001, 0.06);
      tone(240 + 140 * p, 'triangle', 0.25, 0.001, 0.12, 0, 0.6);
    },
    thud: function () { tone(140, 'sine', 0.2, 0.004, 0.16, 0, 0.7); burst('lowpass', 500, 0.7, 0.08, 0.004, 0.1); },
    /** The crowd swells: level 1 for a four, 2 for a six. */
    crowd: function (level) {
      var l = level || 1;
      burst('bandpass', 1100, 0.6, 0.12 * l, 0.25, 1.1 + 0.5 * l, 0.05, 0.9);
      burst('bandpass', 2600, 0.9, 0.05 * l, 0.3, 0.9 + 0.4 * l, 0.1, 1.1);
    },
    horn: function () {
      tone(392, 'sawtooth', 0.05, 0.03, 0.55, 0.12);
      tone(494, 'sawtooth', 0.04, 0.03, 0.55, 0.12);
      tone(587, 'sawtooth', 0.04, 0.03, 0.6, 0.12);
    },
    stumps: function () {
      burst('highpass', 2500, 1, 0.3, 0.001, 0.09);
      tone(1250, 'square', 0.06, 0.001, 0.05, 0.02);
      tone(940, 'square', 0.05, 0.001, 0.05, 0.07);
      burst('bandpass', 700, 0.6, 0.1, 0.2, 0.9, 0.15, 0.8);
    },
    win: function () { tone(523, 'triangle', 0.12, 0.01, 0.25); tone(659, 'triangle', 0.12, 0.01, 0.25, 0.12); tone(784, 'triangle', 0.14, 0.01, 0.45, 0.24); },
    lose: function () { tone(330, 'triangle', 0.1, 0.01, 0.3); tone(247, 'triangle', 0.1, 0.01, 0.5, 0.18); },
    noBall: function () { tone(700, 'square', 0.06, 0.002, 0.08); tone(700, 'square', 0.06, 0.002, 0.08, 0.14); }
  };

  SS.audio = { unlock: unlock, setOn: setOn, isOn: function () { return on; }, sfx: sfx };
})(typeof window !== 'undefined' ? window : globalThis);
