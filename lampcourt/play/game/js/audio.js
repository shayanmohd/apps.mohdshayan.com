/*
 * Synthesised sound, Web Audio only, no files: a glass chime on placing (pitch rises with the count), a
 * soft tick as the counter rolls, a low bloom on Light, a three note brass figure on PERFECT, a dull
 * knock when a lantern goes back. Sound is on by default with a mute toggle; the night ambience
 * (filtered wind and a low drone) is off by default, as the brief asks, with its own toggle.
 */
(function (root) {
  'use strict';
  var LC = root.LC || (root.LC = {});

  var ctx = null, master = null, sfx = null, amb = null, ambNodes = null;
  var soundOn = true, ambienceOn = false, lastTick = 0;
  // A pentatonic ladder for the chime, so any count sounds settled.
  var LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

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
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = soundOn ? 1 : 0;
    sfx.connect(master);
    amb = ctx.createGain();
    amb.gain.value = 0;
    amb.connect(master);
    return ctx;
  }

  /** Call from a user gesture: creates or resumes the context. */
  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') c.resume();
    if (c && ambienceOn) startAmbience();
  }

  function now() { return ctx.currentTime; }

  function tone(freq, type, t0, attack, hold, release, gain, dest) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
    o.connect(g);
    g.connect(dest || sfx);
    o.start(t0);
    o.stop(t0 + attack + hold + release + 0.05);
    return o;
  }

  function ready() { return soundOn && ctx && ctx.state === 'running'; }

  function chime(step) {
    if (!ready()) return;
    var semis = LADDER[Math.max(0, Math.min(LADDER.length - 1, step | 0))];
    var f = 523.25 * Math.pow(2, semis / 12);
    var t = now();
    tone(f, 'sine', t, 0.004, 0.02, 0.9, 0.16);
    tone(f * 2.76, 'sine', t, 0.002, 0.0, 0.35, 0.04);
    tone(f * 5.4, 'sine', t, 0.002, 0.0, 0.15, 0.015);
  }

  function tick() {
    if (!ready()) return;
    var t = now();
    if (t - lastTick < 0.035) return;
    lastTick = t;
    tone(1900, 'triangle', t, 0.001, 0.0, 0.03, 0.025);
  }

  function knock() {
    if (!ready()) return;
    var t = now();
    tone(140, 'sine', t, 0.002, 0.0, 0.12, 0.18);
  }

  function bloom() {
    if (!ready()) return;
    var t = now();
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.5);
    f.frequency.exponentialRampToValueAtTime(500, t + 1.6);
    f.connect(sfx);
    tone(110, 'sawtooth', t, 0.25, 0.2, 1.2, 0.05, f);
    tone(165, 'sawtooth', t, 0.3, 0.2, 1.1, 0.04, f);
    tone(220, 'sine', t, 0.2, 0.3, 1.2, 0.07, f);
  }

  function perfect() {
    if (!ready()) return;
    var t = now() + 0.05;
    var notes = [293.66, 440, 587.33];
    for (var i = 0; i < notes.length; i++) {
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1800;
      f.Q.value = 2;
      f.connect(sfx);
      tone(notes[i], 'sawtooth', t + i * 0.16, 0.03, 0.12, 0.6, 0.05, f);
      tone(notes[i] * 2, 'sine', t + i * 0.16, 0.01, 0.1, 0.5, 0.04);
    }
  }

  function noiseBuffer() {
    var len = ctx.sampleRate * 2;
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0);
    var r = LC.rng.make(99);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var white = (r.next() / 4294967296) * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brown noise
      d[i] = last * 3.5;
    }
    return b;
  }

  function startAmbience() {
    if (!ctx || ambNodes) return;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.6;
    var lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);
    var windGain = ctx.createGain();
    windGain.gain.value = 0.35;
    src.connect(bp);
    bp.connect(windGain);
    windGain.connect(amb);
    var drone = ctx.createOscillator(), droneGain = ctx.createGain();
    drone.type = 'sine';
    drone.frequency.value = 55;
    droneGain.gain.value = 0.05;
    drone.connect(droneGain);
    droneGain.connect(amb);
    src.start();
    lfo.start();
    drone.start();
    ambNodes = [src, lfo, drone];
    amb.gain.setTargetAtTime(ambienceOn ? 0.5 : 0, ctx.currentTime, 0.8);
  }

  function stopAmbience() {
    if (!ambNodes) return;
    var nodes = ambNodes;
    ambNodes = null;
    amb.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(function () { nodes.forEach(function (n) { try { n.stop(); } catch (e) { /* stopped */ } }); }, 1500);
  }

  function setSound(on) {
    soundOn = !!on;
    if (sfx) sfx.gain.setTargetAtTime(soundOn ? 1 : 0, ctx.currentTime, 0.02);
  }

  function setAmbience(on) {
    ambienceOn = !!on;
    if (!ctx) return;
    if (ambienceOn) startAmbience(); else stopAmbience();
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  LC.audio = { unlock: unlock, chime: chime, tick: tick, knock: knock, bloom: bloom, perfect: perfect, setSound: setSound, setAmbience: setAmbience, suspend: suspend, resume: resume };
})(typeof window !== 'undefined' ? window : globalThis);
