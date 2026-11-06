/*
 * Synthesized sound: FM bells for the chain, a soft beat, a drone, burst crackle and small cues.
 * The show clock is AudioContext.currentTime; chain notes are scheduled on the beat grid, so they sound
 * musical even when the WebView adds output latency. No audio files.
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};

  function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function Audio() {
    this.ctx = null;
    this.muted = false;
    this.music = null; // per show segment: { bus, filter, pad }
    this.def = null;
    this.gridStart = 0; // audio time of show time 0
    this.beat = 0.5;
    this.lastSlot = 0;
    this.lastCrackle = 0;
    this.lastLaunch = 0;
    this.noise = null;
  }

  Audio.prototype.available = function () {
    return !!(root.AudioContext || root.webkitAudioContext);
  };

  /** Creates the context (call from a user gesture on the web). Safe to call again. */
  Audio.prototype.init = function () {
    if (this.ctx || !this.available()) return this.ctx;
    var Ctor = root.AudioContext || root.webkitAudioContext;
    try {
      this.ctx = new Ctor({ latencyHint: 'interactive' });
    } catch (e) {
      try { this.ctx = new Ctor(); } catch (e2) { this.ctx = null; return null; }
    }
    var c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(c.destination);
    // An echo across the sky for the bells.
    this.echo = c.createDelay(1.0);
    this.echo.delayTime.value = 0.27;
    var fb = c.createGain(); fb.gain.value = 0.3;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    this.echo.connect(lp); lp.connect(fb); fb.connect(this.echo);
    var wet = c.createGain(); wet.gain.value = 0.5;
    lp.connect(wet); wet.connect(this.master);
    this.bells = c.createGain(); this.bells.gain.value = 1;
    this.bells.connect(this.master);
    var send = c.createGain(); send.gain.value = 0.35;
    this.bells.connect(send); send.connect(this.echo);
    this.sfx = c.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    // One second of white noise, made from a fixed seed.
    var len = c.sampleRate;
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    var s = 12345;
    for (var i = 0; i < len; i++) { s = (Math.imul(s, 1103515245) + 12345) | 0; data[i] = ((s >>> 8) & 0xffff) / 32768 - 1; }
    this.noise = buf;
    return c;
  };

  Audio.prototype.running = function () { return !!(this.ctx && this.ctx.state === 'running'); };

  /** Resumes the context. Resolves true when it runs. */
  Audio.prototype.unlock = function () {
    var self = this;
    if (!this.init()) return Promise.resolve(false);
    if (this.ctx.state === 'running') return Promise.resolve(true);
    var p;
    try { p = this.ctx.resume(); } catch (e) { p = null; }
    return new Promise(function (resolve) {
      var done = false;
      function finish() { if (!done) { done = true; resolve(self.running()); } }
      if (p && typeof p.then === 'function') p.then(finish, finish);
      setTimeout(finish, 400);
    });
  };

  Audio.prototype.suspend = function () {
    if (this.ctx && this.ctx.state === 'running') { try { this.ctx.suspend(); } catch (e) { /* ignore */ } }
  };

  Audio.prototype.now = function () { return this.ctx ? this.ctx.currentTime : 0; };

  /** How far behind the audio clock the picture should run, so sight matches sound. */
  Audio.prototype.visualDelay = function () {
    if (!this.ctx) return 0;
    var d = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    if (!isFinite(d) || d < 0) d = 0;
    return d > 0.3 ? 0.3 : d;
  };

  Audio.prototype.setMuted = function (m) {
    this.muted = !!m;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.03);
  };

  Audio.prototype.live = function () { return this.running() && !this.muted; };

  // ---- the show's music ----

  /** A new music segment for a show (also after a pause). gridStart is the audio time of show time 0. */
  Audio.prototype.startMusic = function (def, beat, gridStart, fromAudio) {
    if (!this.ctx) return;
    this.stopMusic();
    var c = this.ctx;
    this.def = def;
    this.beat = beat;
    this.gridStart = gridStart;
    this.lastSlot = 0;
    var bus = c.createGain();
    bus.gain.setValueAtTime(0, fromAudio);
    bus.gain.linearRampToValueAtTime(1, fromAudio + 0.4);
    var filter = c.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 16000; filter.Q.value = 0.4;
    bus.connect(filter); filter.connect(this.master);
    // Drone: root and fifth, softly beating.
    var pad = [];
    var base = def.root - 24;
    [0, 7, 12].forEach(function (iv, k) {
      var o = c.createOscillator();
      o.type = k === 2 ? 'triangle' : 'sine';
      o.frequency.value = midiToHz(base + iv);
      o.detune.value = k === 1 ? 4 : -3;
      var g = c.createGain();
      g.gain.value = k === 2 ? 0.018 : 0.04;
      o.connect(g); g.connect(bus);
      o.start(fromAudio);
      pad.push(o);
    });
    this.music = { bus: bus, filter: filter, pad: pad };
  };

  Audio.prototype.stopMusic = function (fade) {
    if (!this.music || !this.ctx) return;
    var m = this.music;
    this.music = null;
    var t = this.ctx.currentTime;
    var f = fade || 0.25;
    m.bus.gain.cancelScheduledValues(t);
    m.bus.gain.setValueAtTime(m.bus.gain.value, t);
    m.bus.gain.linearRampToValueAtTime(0, t + f);
    m.pad.forEach(function (o) { try { o.stop(t + f + 0.05); } catch (e) { /* stopped */ } });
    setTimeout(function () { try { m.bus.disconnect(); } catch (e) { /* gone */ } }, (f + 0.3) * 1000);
  };

  /** The lights went out: the music sinks under a closing filter. */
  Audio.prototype.darken = function (on) {
    if (!this.music || !this.ctx) return;
    var f = this.music.filter.frequency;
    var t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(on ? 260 : 16000, t + (on ? 0.9 : 0.4));
  };

  /** Beat sounds for eighth note k (show grid), at audio time at. */
  Audio.prototype.eighth = function (k, at) {
    if (!this.music || !this.live()) return;
    var c = this.ctx, bus = this.music.bus;
    var inBar = ((k % 8) + 8) % 8;
    if (inBar === 0 || inBar === 4) this.kick(at, inBar === 0 ? 0.42 : 0.3, bus);
    if (inBar % 2 === 1) this.shaker(at, 0.03, bus);
    else if (inBar === 2 || inBar === 6) this.shaker(at, 0.05, bus);
    if (inBar === 0) {
      var o = c.createOscillator(); o.type = 'triangle';
      o.frequency.value = midiToHz(this.def.root - 24);
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.16, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
      o.connect(lp); lp.connect(g); g.connect(bus);
      o.start(at); o.stop(at + 0.65);
    }
  };

  Audio.prototype.kick = function (at, vel, bus) {
    var c = this.ctx;
    var o = c.createOscillator();
    o.frequency.setValueAtTime(130, at);
    o.frequency.exponentialRampToValueAtTime(44, at + 0.13);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vel, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    o.connect(g); g.connect(bus || this.sfx);
    o.start(at); o.stop(at + 0.3);
  };

  Audio.prototype.shaker = function (at, vel, bus) {
    var c = this.ctx;
    var src = c.createBufferSource(); src.buffer = this.noise;
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vel, at + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(hp); hp.connect(g); g.connect(bus || this.sfx);
    src.start(at, (at * 7.3) % 0.9, 0.06);
  };

  /** One FM bell. */
  Audio.prototype.bell = function (at, midi, vel, bell) {
    var c = this.ctx;
    var f = midiToHz(midi);
    var dec = bell.decay;
    var car = c.createOscillator(); car.frequency.value = f;
    var mod = c.createOscillator(); mod.frequency.value = f * bell.ratio;
    var mg = c.createGain();
    mg.gain.setValueAtTime(f * bell.index * vel, at);
    mg.gain.exponentialRampToValueAtTime(f * 0.02 + 1, at + dec * 0.45);
    mod.connect(mg); mg.connect(car.frequency);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.2 * vel, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + dec);
    car.connect(g); g.connect(this.bells);
    car.start(at); mod.start(at); car.stop(at + dec + 0.05); mod.stop(at + dec + 0.05);
    if (bell.octave) {
      var o2 = c.createOscillator(); o2.frequency.value = f * 2;
      var g2 = c.createGain();
      g2.gain.setValueAtTime(0.0001, at); g2.gain.linearRampToValueAtTime(0.05 * vel, at + 0.004); g2.gain.exponentialRampToValueAtTime(0.0001, at + dec * 0.6);
      o2.connect(g2); g2.connect(this.bells);
      o2.start(at); o2.stop(at + dec * 0.6 + 0.05);
    }
  };

  /** The note for chain position k (1 based) of a skyline's scale, rising, held in a two octave range. */
  function chainMidi(def, k) {
    var sc = def.scale;
    var i = k - 1;
    if (i > 10) i = 6 + ((i - 6) % 5);
    return def.root + 12 + 12 * Math.floor(i / sc.length) + sc[i % sc.length];
  }

  /**
   * A chain note, snapped to the next eighth note (then the next free sixteenth) of the show's grid.
   * final: the burst that completed a full clear plays the home note with its chord.
   */
  Audio.prototype.chime = function (k, final, perfect) {
    if (!this.music || !this.live()) return;
    var now = this.ctx.currentTime + 0.012;
    var eighth = this.beat / 2, sixteenth = this.beat / 4;
    var at = this.gridStart + Math.ceil((now - this.gridStart) / eighth) * eighth;
    if (at <= this.lastSlot + 0.001) at = this.lastSlot + sixteenth;
    if (at - now > 0.9) at = this.gridStart + Math.ceil((now - this.gridStart) / sixteenth) * sixteenth;
    this.lastSlot = at;
    var def = this.def;
    if (final) {
      var tonic = def.root + 24;
      this.bell(at, tonic, 1, def.bell);
      this.bell(at + 0.002, tonic - 5, 0.6, def.bell);
      this.bell(at + 0.004, tonic - 12, 0.7, def.bell);
      return;
    }
    this.bell(at, chainMidi(def, k), 0.75 + Math.min(0.25, k * 0.02), def.bell);
    if (perfect) this.bell(at, chainMidi(def, k) + 24, 0.3, { ratio: 5.01, index: 0.6, decay: 0.7, octave: 0 });
  };

  Audio.prototype.crackle = function (vel) {
    if (!this.live()) return;
    var c = this.ctx, at = c.currentTime + 0.005;
    if (at - this.lastCrackle < 0.035) return;
    this.lastCrackle = at;
    var src = c.createBufferSource(); src.buffer = this.noise;
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + 900 * vel; bp.Q.value = 0.8;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.16 * vel, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    src.connect(bp); bp.connect(g); g.connect(this.sfx);
    src.start(at, (at * 3.1) % 0.6, 0.35);
    var o = c.createOscillator();
    o.frequency.setValueAtTime(90, at); o.frequency.exponentialRampToValueAtTime(40, at + 0.18);
    var g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, at); g2.gain.linearRampToValueAtTime(0.22 * vel, at + 0.006); g2.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(g2); g2.connect(this.sfx);
    o.start(at); o.stop(at + 0.25);
  };

  Audio.prototype.launch = function () {
    if (!this.live()) return;
    var c = this.ctx, at = c.currentTime + 0.005;
    if (at - this.lastLaunch < 0.06) return;
    this.lastLaunch = at;
    var src = c.createBufferSource(); src.buffer = this.noise;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.12, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    src.connect(lp); lp.connect(g); g.connect(this.sfx);
    src.start(at, (at * 5.7) % 0.8, 0.2);
  };

  Audio.prototype.dud = function () {
    if (!this.live()) return;
    var c = this.ctx, at = c.currentTime + 0.005;
    var o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(52, at + 0.3);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.14, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    o.connect(g); g.connect(this.sfx);
    o.start(at); o.stop(at + 0.36);
    var k = c.createOscillator(); k.type = 'square'; k.frequency.value = 1900;
    var kg = c.createGain();
    kg.gain.setValueAtTime(0.0001, at + 0.12); kg.gain.linearRampToValueAtTime(0.025, at + 0.122); kg.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
    k.connect(kg); kg.connect(this.sfx);
    k.start(at + 0.12); k.stop(at + 0.16);
  };

  Audio.prototype.tick = function () {
    if (!this.live()) return;
    var c = this.ctx, at = c.currentTime + 0.005;
    var o = c.createOscillator(); o.frequency.value = 1320;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.05, at + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    o.connect(g); g.connect(this.sfx);
    o.start(at); o.stop(at + 0.07);
  };

  /** Three rising notes for an unlock, outside the beat grid (results screen). */
  Audio.prototype.fanfare = function (def) {
    if (!this.live()) return;
    var at = this.ctx.currentTime + 0.05;
    var d = def || { root: 62, scale: [0, 2, 4, 7, 9], bell: { ratio: 3.5, index: 2, decay: 1.4, octave: 0 } };
    for (var i = 0; i < 3; i++) this.bell(at + i * 0.14, d.root + 12 + d.scale[(i * 2) % d.scale.length] + (i === 2 ? 12 : 0), 0.7, d.bell);
  };

  var api = { Audio: Audio, chainMidi: chainMidi, midiToHz: midiToHz };
  Sky.audio = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
