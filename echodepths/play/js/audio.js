'use strict';
// EchoDepths procedural audio. No samples: every cue is synthesized so the game ships tiny and offline.
// Spatialization: StereoPanner (pan by relative x) + distance gain. A shared feedback-delay "cave" bus adds echo.
const Sfx = (() => {
  let ctx = null, master, cueBus, ambBus, echoIn, noiseBuf;
  const mix = { master: 0.9, ambience: 0.7, cues: 1.0 };
  let enabled = true, held = false;
  const hums = new Set();

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = mix.master; master.connect(ctx.destination);
    // cave echo bus: delay -> lowpass -> feedback
    const delay = ctx.createDelay(1.5); delay.delayTime.value = 0.23;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    echoIn = ctx.createGain(); echoIn.gain.value = 1;
    echoIn.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(wet); wet.connect(master);
    cueBus = ctx.createGain(); cueBus.gain.value = mix.cues; cueBus.connect(master); cueBus.connect(echoIn);
    ambBus = ctx.createGain(); ambBus.gain.value = mix.ambience; ambBus.connect(master);
    // 2s white noise buffer
    const len = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function resume() { if (held || !init()) return; if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } }
  // held breath: nothing hums while the run is paused or the app is in the background. suspend() holds the
  // context until release(); a stray resume() (a tap on the pause menu, the activity coming back) cannot let the cave leak through.
  function suspend() { held = true; if (ctx && ctx.state === 'running') { try { ctx.suspend(); } catch (e) {} } }
  function release() { held = false; resume(); }
  const now = () => ctx ? ctx.currentTime : 0;
  function ok() { return enabled && ctx && ctx.state === 'running'; }

  // spatial chain: source -> gain -> panner -> bus
  function spatialChain(dx, dy, range, bus, base) {
    const g = ctx.createGain(); const p = ctx.createStereoPanner();
    const d = Math.hypot(dx, dy);
    const att = Math.pow(U.clamp(1 - d / range, 0, 1), 1.4);
    g.gain.value = (base == null ? 1 : base) * att;
    p.pan.value = U.clamp(dx / 6, -1, 1);
    g.connect(p); p.connect(bus || cueBus);
    return { g, p, att };
  }
  function osc(type, f0, f1, t0, dur, gainNode, curve) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    o.connect(gainNode); o.start(t0); o.stop(t0 + dur + 0.05); return o;
  }
  function env(g, t0, a, d, peak) { g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
  function noise(t0, dur, filterType, freq, q, gainNode) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q || 1;
    s.connect(f); f.connect(gainNode); s.start(t0); s.stop(t0 + dur + 0.05); return s;
  }

  // ---------- one-shots ----------
  function ping(type) {
    if (!ok()) return; const t = now();
    const g = ctx.createGain(); g.connect(cueBus);
    if (type === 'whisper') { env(g, t, 0.004, 0.05, 0.12); osc('sine', 2400, 1900, t, 0.06, g); }
    else if (type === 'click') { env(g, t, 0.003, 0.09, 0.35); osc('sine', 1500, 950, t, 0.1, g); const n = ctx.createGain(); n.connect(cueBus); env(n, t, 0.002, 0.03, 0.12); noise(t, 0.04, 'bandpass', 2600, 2, n); }
    else if (type === 'chirp') { env(g, t, 0.008, 0.22, 0.5); osc('sine', 980, 520, t, 0.24, g); const g2 = ctx.createGain(); g2.connect(cueBus); env(g2, t + 0.02, 0.01, 0.18, 0.18); osc('triangle', 1460, 780, t + 0.02, 0.2, g2); }
    else if (type === 'shout') {
      env(g, t, 0.03, 0.7, 0.75); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.7); f.connect(g);
      osc('sawtooth', 320, 95, t, 0.72, f); osc('sine', 160, 60, t, 0.75, g);
      const n = ctx.createGain(); n.connect(cueBus); env(n, t, 0.02, 0.4, 0.2); noise(t, 0.45, 'lowpass', 500, 0.7, n);
      // extra echo tail: feed echo bus harder for shouts
      const e = ctx.createGain(); e.connect(echoIn); env(e, t, 0.02, 0.6, 0.6); osc('sine', 260, 80, t, 0.6, e);
    }
    else if (type === 'pebble') { env(g, t, 0.004, 0.16, 0.35); osc('sine', 1100, 600, t, 0.16, g); const n = ctx.createGain(); n.connect(cueBus); env(n, t, 0.003, 0.08, 0.2); noise(t, 0.1, 'bandpass', 1800, 3, n); }
    else if (type === 'touch') { const n = ctx.createGain(); n.connect(cueBus); env(n, t, 0.004, 0.05, 0.06); noise(t, 0.06, 'lowpass', 700, 0.8, n); }
  }
  function pebbleFly() { if (!ok()) return; const t = now(); const n = ctx.createGain(); n.connect(cueBus); env(n, t, 0.05, 0.25, 0.05); noise(t, 0.3, 'bandpass', 900, 0.6, n); }
  function bristleClick(dx, dy) {
    if (!ok()) return; const t = now();
    const c = spatialChain(dx, dy, 13, cueBus, 0.6); if (c.att <= 0) return;
    for (let i = 0; i < 3; i++) { const g = ctx.createGain(); g.connect(c.g); const tt = t + i * 0.055; env(g, tt, 0.002, 0.03, 1); noise(tt, 0.035, 'bandpass', 3200 + i * 300, 4, g); }
  }
  function lash(dx, dy) {
    if (!ok()) return; const t = now();
    const c = spatialChain(dx, dy, 10, cueBus, 0.7); if (c.att <= 0) return;
    const g = ctx.createGain(); g.connect(c.g); env(g, t, 0.01, 0.22, 1);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(4000, t + 0.2); f.connect(g);
    noise(t, 0.25, 'highpass', 800, 0.7, f);
    const g2 = ctx.createGain(); g2.connect(c.g); env(g2, t, 0.005, 0.12, 0.5); osc('sawtooth', 700, 140, t, 0.14, g2);
  }
  function bellow(dx, dy) {
    if (!ok()) return; const t = now();
    const c = spatialChain(dx, dy, 22, cueBus, 0.9); if (c.att <= 0) return;
    const g = ctx.createGain(); g.connect(c.g); env(g, t, 0.12, 1.1, 1);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.connect(g);
    osc('sawtooth', 72, 44, t, 1.2, f); osc('sine', 48, 36, t, 1.25, g);
    const trem = ctx.createOscillator(); trem.frequency.value = 9; const tg = ctx.createGain(); tg.gain.value = 0.35; trem.connect(tg); tg.connect(g.gain); trem.start(t); trem.stop(t + 1.3);
  }
  function damage() {
    if (!ok()) return; const t = now();
    const g = ctx.createGain(); g.connect(master); env(g, t, 0.005, 0.28, 0.9); osc('sine', 110, 40, t, 0.3, g);
    const n = ctx.createGain(); n.connect(master); env(n, t, 0.003, 0.15, 0.4); noise(t, 0.18, 'lowpass', 900, 0.5, n);
  }
  function otolith() {
    if (!ok()) return; const t = now();
    [1760, 2637, 3520].forEach((f, i) => { const g = ctx.createGain(); g.connect(cueBus); env(g, t + i * 0.04, 0.003, 0.25, 0.22); osc('sine', f, f * 0.995, t + i * 0.04, 0.26, g); });
  }
  function otolithTick(dx, dy) {
    if (!ok()) return; const t = now(); const c = spatialChain(dx, dy, 7, ambBus, 0.5); if (c.att <= 0) return;
    const g = ctx.createGain(); g.connect(c.g); env(g, t, 0.002, 0.09, 1); osc('sine', 2900, 2700, t, 0.1, g);
  }
  function drip(size) {
    if (!ok()) return; const t = now();
    const base = size === 'small' ? 1900 : size === 'medium' ? 1150 : 720; // pitch encodes room scale
    const f = base * (0.92 + Math.random() * 0.16);
    const g = ctx.createGain(); g.connect(ambBus); g.connect(echoIn);
    const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; g.disconnect(); g.connect(p); p.connect(ambBus); p.connect(echoIn);
    env(g, t, 0.003, 0.14, 0.16); osc('sine', f * 1.3, f, t, 0.14, g);
  }
  function sink() {
    if (!ok()) return; const t = now();
    const g = ctx.createGain(); g.connect(master); env(g, t, 0.08, 1.4, 0.5);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(90, t + 1.4); f.connect(g);
    noise(t, 1.5, 'lowpass', 1200, 0.5, f); const g2 = ctx.createGain(); g2.connect(master); env(g2, t, 0.1, 1.2, 0.25); osc('sine', 220, 45, t, 1.3, g2);
  }
  function death() {
    if (!ok()) return; const t = now();
    const g = ctx.createGain(); g.connect(master); env(g, t, 0.05, 2.4, 0.5); osc('sine', 180, 32, t, 2.5, g);
    const g2 = ctx.createGain(); g2.connect(echoIn); env(g2, t + 0.2, 0.1, 1.5, 0.3); osc('triangle', 240, 60, t + 0.2, 1.6, g2);
  }
  function uiTick() { if (!ok()) return; const t = now(); const g = ctx.createGain(); g.connect(master); env(g, t, 0.002, 0.04, 0.12); osc('sine', 1200, 900, t, 0.05, g); }
  function titlePulse() { if (!ok()) return; const t = now(); const g = ctx.createGain(); g.connect(cueBus); env(g, t, 0.02, 1.2, 0.08); osc('sine', 520, 180, t, 1.2, g); }
  function heartbeat(rate) { if (!ok()) return; const t = now(); const g = ctx.createGain(); g.connect(master); env(g, t, 0.01, 0.16, 0.22 * rate); osc('sine', 62, 40, t, 0.18, g); const g2 = ctx.createGain(); g2.connect(master); env(g2, t + 0.22, 0.01, 0.14, 0.15 * rate); osc('sine', 56, 38, t + 0.22, 0.16, g2); }

  // ---------- continuous voices (angler lure, exit downdraft, currents) ----------
  // returns {set(dx,dy,extra), stop()}; gains are smoothed with setTargetAtTime.
  function makeHum(kind) {
    if (!init()) return { set() {}, stop() {} };
    const g = ctx.createGain(); g.gain.value = 0; const p = ctx.createStereoPanner(); g.connect(p); p.connect(ambBus);
    const nodes = [];
    let range = 10, base = 0.3;
    if (kind === 'angler') {
      range = 9; base = 0.35;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 96; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.7; const lg = ctx.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
      const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 193; const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(g);
      o.connect(g); o.start(); lfo.start(); o2.start(); nodes.push(o, lfo, o2);
    } else if (kind === 'exit') {
      range = 15; base = 0.5;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 52; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.18; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(g.gain);
      const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140; const ng = ctx.createGain(); ng.gain.value = 0.7; n.connect(f); f.connect(ng); ng.connect(g);
      o.connect(g); o.start(); lfo.start(); n.start(); nodes.push(o, lfo, n);
    } else if (kind === 'current') {
      range = 7; base = 0.28;
      const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.8;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.35; const lg = ctx.createGain(); lg.gain.value = 120; lfo.connect(lg); lg.connect(f.frequency);
      n.connect(f); f.connect(g); n.start(); lfo.start(); nodes.push(n, lfo);
    } else if (kind === 'drone') { // boss chamber heartbeat-synced drone
      range = 1e9; base = 0.12;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 41; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160; o.connect(f); f.connect(g); o.start(); nodes.push(o);
    }
    const h = {
      set(dx, dy, extra) {
        if (!ctx) return; const d = Math.hypot(dx, dy);
        const att = enabled ? Math.pow(U.clamp(1 - d / range, 0, 1), 1.5) * base * (extra == null ? 1 : extra) : 0;
        g.gain.setTargetAtTime(att, ctx.currentTime, 0.08);
        p.pan.setTargetAtTime(U.clamp(dx / 6, -1, 1), ctx.currentTime, 0.08);
      },
      stop() { try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) {} }); try { g.disconnect(); } catch (e) {} }, 300); } catch (e) {} hums.delete(h); },
    };
    hums.add(h); return h;
  }
  function stopAllHums() { [...hums].forEach(h => h.stop()); }
  function setMix(k, v) { mix[k] = U.clamp(v, 0, 1); if (!ctx) return; if (k === 'master') master.gain.value = mix.master; if (k === 'cues') cueBus.gain.value = mix.cues; if (k === 'ambience') ambBus.gain.value = mix.ambience; }
  function setEnabled(v) { enabled = !!v; if (ctx) master.gain.setTargetAtTime(enabled ? mix.master : 0, ctx.currentTime, 0.05); }

  return { init, resume, suspend, release, isHeld: () => held, ping, pebbleFly, bristleClick, lash, bellow, damage, otolith, otolithTick, drip, sink, death, uiTick, titlePulse, heartbeat, makeHum, stopAllHums, setMix, setEnabled, isEnabled: () => enabled, ready: () => !!ctx };
})();
