/* Sway. The breath clock, the haptic wave vocabulary, the tide underlay and the horizon.
   Nothing here touches the network; the audio is synthesised on the device. */
const Engine = (() => {
  const N = window.Native || null;

  let startedAt = 0, cycleAt = 0, cur = null, cycleNo = 0, pausedElapsed = 0;
  let cycleTimer = null, timers = [], running = false;
  let firstPulseAt = null;
  let onPhase = null;

  /* ---------- protocols ---------- */
  /** Sessions open a little quicker than comfortable and decelerate on a fixed gentle curve. */
  function phasesAt(t) {
    const p = Store.settings().protocol;
    if (p === 'even') return { inh: 4, h1: 4, exh: 4, h2: 4 };
    if (p === 'long') return { inh: 4, h1: 7, exh: 8, h2: 0 };
    const u = Math.min(1, t / 180);
    const e = u * u * (3 - 2 * u);
    return { inh: 3.6 + 0.4 * e, h1: 2.0 * e, exh: 5.0 + 2.0 * e, h2: 0 };
  }
  const total = p => p.inh + p.h1 + p.exh + p.h2;
  const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));

  /* ---------- haptics ---------- */
  // Browsers refuse vibration before the page has been touched; asking anyway logs an intervention.
  const canWebVibrate = () =>
    !!navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive);

  /** One gate for every vibration in the app, so the haptics switch silences the motor completely
      rather than only the breathing rhythm. */
  function fire(ms, amp) {
    if (!Store.settings().haptics) return;
    try {
      if (N && N.vibrate) N.vibrate(ms, amp);
      else if (canWebVibrate()) navigator.vibrate(ms);
    } catch (e) {}
  }
  function at(delay, ms, amp) { timers.push(setTimeout(() => fire(ms, amp), delay)); }
  function clearHaptics() {
    timers.forEach(clearTimeout); timers = [];
    try { if (N && N.cancelVibration) N.cancelVibration(); else if (canWebVibrate()) navigator.vibrate(0); } catch (e) {}
  }

  function amp(v) {
    const s = Store.settings().strength || 0.7;
    return Math.max(1, Math.min(255, Math.round(255 * s * v)));
  }

  /** A gathering swell for the inhale, stillness for the hold, a fading train for the exhale. */
  function scheduleHaptics(p) {
    if (!Store.settings().haptics) return;
    const slot = 150;
    const steps = Math.max(4, Math.round(p.inh * 1000 / slot));
    for (let i = 0; i < steps; i++) {
      const v = 0.16 + 0.84 * ease(i / (steps - 1));
      at(i * slot, Math.round(40 + 110 * v), amp(v));
    }
    let t = (p.inh + p.h1) * 1000;
    const end = t + p.exh * 1000;
    while (t < end - 80) {
      const x = (t - (p.inh + p.h1) * 1000) / (p.exh * 1000);
      const v = 0.12 + 0.80 * (1 - x);
      const dur = Math.round(60 + 70 * (1 - x));
      at(t, dur, amp(v));
      t += dur + 70 + 320 * x;
    }
  }

  /* ---------- the tide underlay, synthesised ---------- */
  let ctx = null, gain = null, filt = null, sleepTimer = null;
  function initAudio() {
    if (ctx) return true;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return false;
    try {
      ctx = new C();
      const len = Math.floor(ctx.sampleRate * 3);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.022 * w) / 1.022; d[i] = last * 3.4; }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 240; filt.Q.value = 0.6;
      gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      src.start();
      return true;
    } catch (e) { ctx = null; return false; }
  }
  /** Browsers refuse an AudioContext before a gesture and warn if you ask; the shell has no such rule. */
  function audioAllowed() {
    if (N) return true;
    return !navigator.userActivation || navigator.userActivation.hasBeenActive;
  }
  function audioResume() {
    if (!Store.settings().audio || !audioAllowed()) return;
    if (!initAudio()) return;
    clearTimeout(sleepTimer);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  /** True only while the tide should actually be sounding: wanted by the setting, in a session, and
      that session not paused. `running` alone stays true across a pause, which is not the same thing. */
  const audioWanted = () => !!(Store.settings().audio && running && cycleTimer);
  /** Fade out, then hand the audio hardware back: a silent context left running costs battery all
      night on a phone that was opened once at 3am. Leaving the app releases it at once, because a
      backgrounded WebView freezes its timers and a deferred release would never arrive. */
  function audioStop(immediate) {
    if (!ctx) return;
    try { gain.gain.setTargetAtTime(0, ctx.currentTime, immediate ? 0.04 : 0.15); } catch (e) {}
    clearTimeout(sleepTimer);
    const release = () => { if (ctx && !audioWanted() && ctx.state === 'running') ctx.suspend().catch(() => {}); };
    if (immediate) release(); else sleepTimer = setTimeout(release, 900);
  }
  const audioState = () => (ctx ? ctx.state : 'none');
  function audioFollow(level) {
    if (!ctx || !gain || ctx.state !== 'running') return;
    const on = Store.settings().audio && running;
    try {
      gain.gain.setTargetAtTime(on ? 0.015 + 0.10 * level : 0, ctx.currentTime, 0.09);
      filt.frequency.setTargetAtTime(180 + 260 * level, ctx.currentTime, 0.12);
    } catch (e) {}
  }

  /* ---------- session ---------- */
  function cycle() {
    const t = (performance.now() - startedAt) / 1000;
    cur = phasesAt(t);
    cycleAt = performance.now();
    cycleNo++;
    clearHaptics();
    scheduleHaptics(cur);
    cycleTimer = setTimeout(cycle, total(cur) * 1000);
  }

  function start(resume) {
    if (running) return;
    running = true;
    startedAt = performance.now() - (resume ? pausedElapsed * 1000 : 0);
    if (!resume) pausedElapsed = 0;
    cycleNo = 0;
    fire(90, amp(0.55));                 // the covenant: something arrives before anything is drawn
    if (firstPulseAt === null) {
      firstPulseAt = performance.now();
      Store.recordPulse(firstPulseAt);
    }
    cycle();
    try { if (N && N.keepAwake) N.keepAwake(true); } catch (e) {}
  }

  function stop() {
    pausedElapsed = elapsed();
    running = false;
    clearTimeout(cycleTimer); cycleTimer = null;
    clearHaptics();
    audioStop();
    try { if (N && N.keepAwake) N.keepAwake(false); } catch (e) {}
  }

  function pause() { clearTimeout(cycleTimer); cycleTimer = null; clearHaptics(); audioStop(true); }
  function resume() { if (running && !cycleTimer) { cycle(); audioResume(); } }

  function level(now) {
    if (!cur) return 0;
    const u = (now - cycleAt) / 1000;
    if (u < cur.inh) return ease(u / cur.inh);
    if (u < cur.inh + cur.h1) return 1;
    if (u < cur.inh + cur.h1 + cur.exh) return 1 - ease((u - cur.inh - cur.h1) / cur.exh);
    return 0;
  }
  function phase(now) {
    if (!cur) return '';
    const u = (now - cycleAt) / 1000;
    if (u < cur.inh) return 'Breathe in';
    if (u < cur.inh + cur.h1) return 'Hold, gently';
    if (u < cur.inh + cur.h1 + cur.exh) return 'Breathe out, slowly';
    return 'Rest';
  }
  const elapsed = () => (running ? (performance.now() - startedAt) / 1000 : pausedElapsed);
  const isRunning = () => running;
  const launchMs = () => firstPulseAt;

  /* ---------- bilateral tapping: the phone keeps time, your hands alternate ---------- */
  let tapTimer = null, tapSide = 0, tapCb = null;
  function tapStart(cb) {
    tapStop();
    tapCb = cb;
    const beat = () => {
      tapSide = 1 - tapSide;
      fire(tapSide ? 55 : 90, amp(tapSide ? 0.55 : 0.9));
      if (tapCb) tapCb(tapSide);
      tapTimer = setTimeout(beat, 520);
    };
    beat();
  }
  function tapStop() { clearTimeout(tapTimer); tapTimer = null; tapCb = null; }

  function buzz(v, ms) { fire(ms || 40, amp(v == null ? 0.5 : v)); }

  return { start, stop, pause, resume, level, phase, elapsed, isRunning, launchMs,
           audioResume, audioFollow, audioStop, audioState, initAudio, tapStart, tapStop, buzz, phasesAt };
})();

/* The signature: the launcher icon, alive. A warm breath wave rides over cool water, exactly the two
   strokes on the icon, and the warm one carries the rhythm. One continuous oscillation, nothing else. */
const Water = (() => {
  let cv = null, g = null, raf = null, w = 0, h = 0, dpr = 1, t0 = 0;
  let stars = null, glow = null;                    // painted once per resize, then blitted
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shown = 0;

  function mount(canvas) {
    cv = canvas; g = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  /** A fixed handful of stars, same every launch, so the field is a place rather than noise. */
  function paintStars() {
    stars = document.createElement('canvas');
    stars.width = Math.max(1, Math.round(w * dpr)); stars.height = Math.max(1, Math.round(h * dpr));
    const s = stars.getContext('2d');
    s.setTransform(dpr, 0, 0, dpr, 0, 0);
    let seed = 20260907;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 34; i++) {
      const x = rnd() * w, y = rnd() * h * 0.56;
      const r = 0.5 + rnd() * 1.0;
      s.globalAlpha = 0.2 + rnd() * 0.55;
      s.fillStyle = '#FFF3D9';
      s.beginPath(); s.arc(x, y, r, 0, Math.PI * 2); s.fill();
    }
    s.globalAlpha = 1;
  }

  /** The amber halo behind the breath, drawn once and moved, because a gradient a frame is not free. */
  function paintGlow() {
    const R = Math.max(110, Math.round(w * 0.60));
    glow = document.createElement('canvas');
    glow.width = Math.round(R * 2 * dpr); glow.height = Math.round(R * 2 * dpr);
    const s = glow.getContext('2d');
    s.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gr = s.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0, 'rgba(255, 209, 138, 0.40)');
    gr.addColorStop(0.22, 'rgba(240, 164, 74, 0.14)');
    gr.addColorStop(0.55, 'rgba(226, 132, 48, 0.035)');
    gr.addColorStop(1, 'rgba(226, 132, 48, 0)');
    s.fillStyle = gr;
    s.fillRect(0, 0, R * 2, R * 2);
    glow.r = R;
  }

  function resize() {
    if (!cv) return;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const nw = cv.clientWidth, nh = cv.clientHeight;
    if (!nw || !nh) return;
    w = nw; h = nh;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintStars(); paintGlow();
  }
  function css(v, d) { return (getComputedStyle(document.documentElement).getPropertyValue(v) || '').trim() || d; }

  function trace(yAt, step) {
    g.beginPath();
    for (let x = 0; x <= w; x += step) { const y = yAt(x); x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!g || !w) return;
    if (!t0) t0 = now;
    const target = Engine.level(now);
    shown += (target - shown) * 0.2;
    Engine.audioFollow(shown);

    // Reduced motion stops the wave TRAVELLING; it must not flatten it. Zeroing the amplitude, which is
    // what this used to do, turned the breath and the water into two straight bars on any device with
    // animations switched off, and that wave is the whole app.
    const ph = reduce ? 0 : (now - t0) / 1000;
    const deep = css('--water', '#1A3C63');
    const abyss = css('--water-deep', '#081527');
    const warm = css('--accent', '#F2B45C');

    g.clearRect(0, 0, w, h);
    if (stars) g.drawImage(stars, 0, 0, w, h);

    // The breath: it gathers high on the inhale and settles onto the water on the exhale.
    const warmBase = h * 0.645 - (h * 0.352) * shown;
    const warmAmp = 9 + 15 * shown;
    const yWarm = x => warmBase
      + warmAmp * Math.sin((x / w) * Math.PI * 2 + ph * 0.42)
      + warmAmp * 0.28 * Math.sin((x / w) * Math.PI * 3.6 - ph * 0.29);

    // The water: the same gesture, slower and smaller, a beat behind.
    const seaBase = h * 0.775 - (h * 0.065) * shown;
    const seaAmp = 4.5 + 4.5 * shown;
    const ySea = x => seaBase
      + seaAmp * Math.sin((x / w) * Math.PI * 2 + ph * 0.42 + 0.95)
      + seaAmp * 0.5 * Math.sin((x / w) * Math.PI * 3.1 - ph * 0.23);

    // 1. the halo behind the breath
    if (glow) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.42 + 0.48 * shown;
      g.drawImage(glow, w / 2 - glow.r, warmBase - glow.r, glow.r * 2, glow.r * 2);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    // 2. the sea body
    const grad = g.createLinearGradient(0, seaBase - 30, 0, h);
    grad.addColorStop(0, deep);
    grad.addColorStop(1, abyss);
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, ySea(x));
    g.lineTo(w, h);
    g.closePath();
    g.fillStyle = grad; g.fill();

    // 3. the breath lying on the water: a sheen that hugs the surface, brightest when the two are close
    g.save();
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) g.lineTo(x, ySea(x));
    g.lineTo(w, h); g.closePath(); g.clip();
    const sheen = g.createLinearGradient(0, seaBase - 12, 0, seaBase + 92);
    const lit = 0.20 * (1 - shown) + 0.06;
    sheen.addColorStop(0, 'rgba(255, 205, 130, ' + lit.toFixed(3) + ')');
    sheen.addColorStop(1, 'rgba(255, 205, 130, 0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = sheen;
    g.fillRect(0, seaBase - 40, w, 150);
    g.restore();
    g.globalAlpha = 1;

    // 4. the cool line: the water's own edge
    trace(ySea, 3);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.globalCompositeOperation = 'lighter';
    g.lineWidth = 9; g.strokeStyle = css('--cool', '#6FB2CE'); g.globalAlpha = 0.14 + 0.08 * shown; g.stroke();
    g.globalCompositeOperation = 'source-over';
    g.lineWidth = 3; g.globalAlpha = 0.9; g.stroke();
    g.globalAlpha = 1;

    // 5. the warm line, with the same lit top edge the icon has
    g.lineCap = 'round'; g.lineJoin = 'round';
    trace(yWarm, 3);
    g.globalCompositeOperation = 'lighter';
    g.lineWidth = 26; g.strokeStyle = warm; g.globalAlpha = 0.075 + 0.075 * shown; g.stroke();
    g.lineWidth = 12; g.globalAlpha = 0.20 + 0.16 * shown; g.stroke();
    g.globalCompositeOperation = 'source-over';
    g.lineWidth = 5.5; g.globalAlpha = 1; g.stroke();
    trace(x => yWarm(x) - 1.5, 3);
    g.lineWidth = 1.4; g.strokeStyle = '#FFF3DC'; g.globalAlpha = 0.42; g.stroke();
    g.globalAlpha = 1;
  }

  function play() { if (!raf) raf = requestAnimationFrame(frame); }
  function halt() { if (raf) cancelAnimationFrame(raf); raf = null; }
  return { mount, play, halt, resize };
})();
