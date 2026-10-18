'use strict';
// EchoDepths core: the three-way economy of information, noise and time.
// Everything the player sees is a fading memory of a sound.
const Game = (() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { alpha: false });
  let W = 0, H = 0, DPR = 1, ppm = 36;
  // phos is the fresh reveal, dim is what it fades through before the dark takes it back. One hue family per palette;
  // the warm ember is reserved for danger: damage, the noise ring, heat pits.
  const PAL = { ice: { phos: [110, 240, 255], dim: [36, 150, 172] }, green: { phos: [125, 255, 156], dim: [52, 150, 88] }, amber: { phos: [255, 179, 71], dim: [176, 110, 38] } };
  const EMBER = [255, 122, 61];
  const BG = '#050d16';
  let pal = PAL.ice;
  const listeners = {};
  const on = (ev, fn) => { (listeners[ev] || (listeners[ev] = [])).push(fn); };
  const emit = (ev, d) => { (listeners[ev] || []).forEach(f => f(d)); };

  const PING = {
    whisper: { radius: 2.6, dur: 1.6, speed: 9, noise: 0.3, intensity: 0.8 },
    click:   { radius: 3.2, dur: 2.2, speed: 10, noise: 1, intensity: 0.9 },
    chirp:   { radius: 8, dur: 4, speed: 12, noise: 3, intensity: 1 },
    shout:   { radius: 40, dur: 6, speed: 16, noise: 8, intensity: 1 },
    pebble:  { radius: 4.5, dur: 3, speed: 11, noise: 3, intensity: 0.85 },
    touch:   { radius: 0.8, dur: 1.2, speed: 8, noise: 0, intensity: 0.6 },
    self:    { radius: 1.4, dur: 0.9, speed: 8, noise: 0, intensity: 0.4 },
    lash:    { radius: 2.6, dur: 0.8, speed: 14, noise: 0, intensity: 0.7 },
    bellow:  { radius: 6, dur: 2.5, speed: 12, noise: 0, intensity: 0.5 },
  };
  const BIOMES = ['rootwater shallows', 'chimney forest', 'the still black', "the warden's throat", 'the sunless sea'];
  const SEQ = ['hall', 'tangle', 'throat', 'vault'];

  let state = 'idle'; // idle | run | paused | dead
  let run = null, ch = null, player = null;
  let settings = { palette: 'green', haptics: true, hapticStrength: 1, audio: true, ambience: 0.7, eyesClosed: false, calm: false };
  let evo = new Set();
  const cam = { x: 0, y: 0 };
  let time = 0, lastT = 0, raf = 0;
  let playerField = null, playerFieldT = -1;
  let transition = 0, transitionText = '';
  let deathAnim = 0;
  const ptr = { down: false, sx: 0, sy: 0, x: 0, y: 0, t0: 0, moved: false, id: null, tick1: false, tick2: false };
  let lastAnnounce = 0;

  // ---------- setup ----------
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ppm = U.clamp(W / 11, 30, 64);
  }
  window.addEventListener('resize', resize); resize();

  function setSettings(s) {
    Object.assign(settings, s);
    pal = PAL[settings.palette] || PAL.ice;
    Haptics.setEnabled(settings.haptics); Haptics.setStrength(settings.hapticStrength);
    Sfx.setEnabled(settings.audio); Sfx.setMix('ambience', settings.ambience);
    document.body.classList.toggle('eyes-closed', !!settings.eyesClosed);
    document.body.className = document.body.className.replace(/pal-\w+/, '') + ' pal-' + settings.palette;
  }
  function setEvolutions(set) { evo = new Set(set); }

  // ---------- run lifecycle ----------
  function startRun(opts) {
    opts = opts || {};
    const seed = opts.seed == null ? (Math.random() * 2 ** 31) | 0 : opts.seed;
    run = {
      seed, rng: U.mulberry32(seed ^ 0x9E3779B9), daily: !!opts.daily, firstRun: !!opts.firstRun,
      chamber: 0, cleared: 0, depth: 1000, tier: 0, wardenEsc: 0,
      pebbles: opts.firstRun ? 0 : 2, oto: 0, shouts: 0, chamberShouts: 0, silentClears: 0,
      pings: [], noiseTimers: [], path: [], pingLog: [], noiseLevel: 0, moveNoise: 0, pathT: 0,
      tut: opts.firstRun ? { step: 0, t: 0, dist: 0, shown: false } : null,
      hp: 2 + (evo.has('fat') ? 1 : 0) + (settings.calm ? 1 : 0), maxHp: 2 + (evo.has('fat') ? 1 : 0) + (settings.calm ? 1 : 0),
      invuln: 0, dmgPulse: 0, lastBrush: -9, facing: { x: 0, y: -1 }, pebble: null, cause: '', t: 0,
      dripT: 1.5, heartT: 0, titleCard: 0, lastHint: '',
    };
    player = { x: 0, y: 0, vx: 0, vy: 0, r: 0.28 };
    state = 'run'; transition = 0; time = 0; lastT = performance.now();
    newChamber(true);
    emit('hud', hud());
    Sfx.resume();
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function hud() { return { depth: run.depth, hp: run.hp, maxHp: run.maxHp, pebbles: run.pebbles, biome: BIOMES[Math.min(4, run.tier)] }; }

  function newChamber(first) {
    if (ch) { (ch.hums || []).forEach(h => h.stop()); }
    const ci = run.chamber; run.tier = Math.floor(ci / 4);
    const arch = (run.firstRun && ci === 0) ? 'nursery' : SEQ[ci % 4];
    ch = Procgen.generate((run.seed + ci * 7919) >>> 0, arch, run.tier);
    player.x = ch.spawn.x; player.y = ch.spawn.y; player.vx = player.vy = 0;
    run.pings = []; run.noiseTimers = []; run.chamberShouts = 0; run.pebble = null;
    run.path = run.path.filter(p => p.c !== ci); run.pingLog = run.pingLog.filter(p => p.c !== ci);
    playerField = null; playerFieldT = -1;
    ch.preds = ch.predators.map(p => ({
      type: p.type, x: p.x, y: p.y, vx: 0, vy: 0, r: p.type === 'warden' ? 1.2 : p.type === 'angler' ? 0.5 : 0.42,
      awareness: 0, state: 'idle', target: null, field: null, fieldT: 0, targetDirty: false, stun: 0, cool: 0, lash: null, wp: 0,
      nextClick: 1 + Math.random() * 2, wanderT: 0, wvx: 0, wvy: 0, dormant: !!p.dormant, timid: !!p.dormant, hum: p.type === 'angler' ? Sfx.makeHum('angler') : null,
      lure: Math.random() * U.TAU,
    }));
    ch.hums = ch.preds.filter(p => p.hum).map(p => p.hum);
    ch.exitHum = Sfx.makeHum('exit'); ch.hums.push(ch.exitHum);
    ch.currents.forEach(c => { c.hum = Sfx.makeHum('current'); ch.hums.push(c.hum); });
    if (arch === 'vault') { ch.drone = Sfx.makeHum('drone'); ch.hums.push(ch.drone); }
    ch.otoliths.forEach(o => { o.nextTick = Math.random() * 3; });
    cam.x = player.x; cam.y = player.y;
    if (!first) { transition = 1.4; }
  }

  // ---------- pings & noise ----------
  function emitPing(x, y, type, extra) {
    const def = Object.assign({}, PING[type], extra || {});
    const field = Procgen.distField(ch, x, y);
    const fadeMul = (settings.calm ? 1.6 : 1) * Math.max(0.7, 1 - 0.06 * run.tier);
    run.pings.push({ x, y, t0: time, type, radius: def.radius, dur: def.dur * fadeMul, speed: def.speed, intensity: def.intensity, field, pred: !!extra && !!extra.pred });
    if (run.pings.length > 14) run.pings.splice(0, run.pings.length - 14);
    if (def.noise > 0) addNoise(x, y, def.noise, field, type);
    if (!extra || !extra.pred) run.pingLog.push({ x, y, type, c: run.chamber, t: run.t });
    return field;
  }
  function addNoise(x, y, amount, field, type) {
    if (!field) field = Procgen.distField(ch, x, y);
    const nearPlayer = U.dist(x, y, player.x, player.y) < 1.5;
    if (nearPlayer) run.noiseLevel = Math.max(run.noiseLevel, amount / 8);
    for (const p of ch.preds) {
      const c = ch.cellOf(p.x, p.y); if (c < 0) continue; const pd = field[c]; if (pd >= 1e9) continue;
      if (p.type === 'angler') {
        const trig = 2.2 + amount * 0.55;
        if (pd <= trig && p.cool <= 0 && !p.lash) triggerLash(p, x, y);
        continue;
      }
      const range = 3 + amount * 3.2 * (p.type === 'warden' ? 1.3 : 1);
      const fall = U.clamp(1 - pd / range, 0, 1); if (fall <= 0) continue;
      const heard = amount * fall;
      if (p.dormant) { if (amount >= 3) { p.dormant = false; p.awareness = 0.45; p.target = { x, y }; p.targetDirty = true; p.nextClick = 0.7; emit('woke'); } continue; }
      p.awareness = Math.min(p.timid ? 0.45 : 1, p.awareness + heard * 0.14 + fall * 0.08);
      if (heard > 0.2 || !p.target) { p.target = { x, y }; p.targetDirty = true; }
    }
  }
  function triggerLash(p, tx, ty) { p.lash = { t: 0.28, tx, ty, done: false, show: null }; p.cool = 2.8; }
  function ping(type) {
    if (state !== 'run' || transition > 0) return;
    if (type === 'click' && evo.has('vocal')) type = 'whisper';
    if (type === 'shout') {
      run.shouts++; run.chamberShouts++;
      ch.preds.forEach(p => { if (p.type === 'warden') run.wardenEsc++; });
      const echoMul = evo.has('lungs') ? 0.5 : 1;
      [[0.8, 3], [1.6, 2], [2.4, 1]].forEach(([dt, amt]) => run.noiseTimers.push({ t: time + dt, x: player.x, y: player.y, amt: amt * echoMul }));
    }
    emitPing(player.x, player.y, type);
    Sfx.ping(type);
    if (type === 'shout') Haptics.pingShout(); else if (type === 'chirp') Haptics.pingChirp(); else Haptics.pingClick();
    emit('ping', type);
    if (run.tut) tutEvent('ping', type);
  }
  function throwPebble() {
    if (state !== 'run' || transition > 0 || run.pebbles <= 0 || run.pebble) return;
    run.pebbles--;
    const f = run.facing; let x = player.x, y = player.y, tx = x, ty = y;
    for (let s = 0; s < 6; s += 0.15) { const nx = player.x + f.x * s, ny = player.y + f.y * s; const c = ch.cellOf(nx, ny); if (c < 0 || ch.grid[c]) break; tx = nx; ty = ny; }
    run.pebble = { x, y, tx, ty, t: 0, dur: 0.15 + U.dist(x, y, tx, ty) * 0.09 };
    Sfx.pebbleFly(); Haptics.tick();
    emit('hud', hud());
  }

  // ---------- damage / death ----------
  function damage(n, cause) {
    if (run.invuln > 0 || state !== 'run') return;
    run.hp -= n; run.invuln = 1.5; run.dmgPulse = 1;
    Haptics.damage(); Sfx.damage(); announce('hit. ' + cause + '.');
    emit('hud', hud());
    if (run.hp <= 0) die(cause);
  }
  function die(cause) {
    state = 'dead'; run.cause = cause; deathAnim = 0;
    Sfx.release(); Sfx.death(); Haptics.death(); Sfx.stopAllHums();
    const earned = run.oto + run.cleared * 2 + Math.floor(run.cleared / 4) * 5;
    emit('death', { cause, depth: run.depth, chambers: run.cleared, oto: earned, collected: run.oto, shouts: run.shouts, silentClears: run.silentClears, daily: run.daily, calm: settings.calm, tutorialDone: run.tut ? run.tut.step >= 5 : true });
  }
  function abandon() { if (!run || state === 'idle') return; die('you surfaced'); }
  function pause() { if (state === 'run') { state = 'paused'; Sfx.suspend(); emit('paused'); } }
  function resume() { if (state === 'paused') { state = 'run'; lastT = performance.now(); Sfx.release(); } }
  function toTitle() { state = 'idle'; Sfx.release(); Sfx.stopAllHums(); if (ch) (ch.hums || []).forEach(h => h.stop()); run = null; ch = null; }

  function descend() {
    run.cleared++; run.chamber++;
    if (run.chamberShouts === 0) run.silentClears++;
    const drop = 30 + Math.floor(run.rng() * 18); run.depth += drop;
    if (run.firstRun && run.chamber === 1) { run.pebbles = 1; run.titleCard = 3.5; }
    if (run.chamber % 4 === 0) run.pebbles = Math.min(3, run.pebbles + 1);
    Sfx.sink(); Haptics.sink();
    const prevTier = run.tier; newChamber(false);
    transitionText = '−' + drop + ' m';
    if (run.tier !== prevTier) { emit('float', BIOMES[Math.min(4, run.tier)]); announce('deeper. ' + BIOMES[Math.min(4, run.tier)] + '.'); }
    else emit('float', transitionText);
    emit('hud', hud());
    if (run.tut) tutEvent('exit');
  }

  // ---------- tutorial hints (first run only) ----------
  function hint(text) { if (run.lastHint === text) return; run.lastHint = text; emit('hint', text); }
  function tutEvent(kind, arg) {
    const t = run.tut; if (!t) return;
    if (t.step === 0 && kind === 'ping') { t.step = 1; t.t = 0; hint(''); }
    else if (t.step === 1 && kind === 'ping' && (arg === 'chirp' || arg === 'shout')) { t.step = 2; t.t = 0; hint(''); }
    else if (t.step === 2 && kind === 'woke') { t.t = 0; hint('something heard that.'); t.woke = true; }
    else if (kind === 'exit') { t.step = 6; hint(''); }
  }
  on('woke', () => tutEvent('woke'));
  function tutUpdate(dt) {
    const t = run.tut; if (!t) return; t.t += dt;
    if (t.step === 0 && t.t > 0.7) hint('tap.');
    else if (t.step === 1 && t.t > 1.2) hint('hold.');
    else if (t.step === 2 && t.woke && t.t > 3.2) { t.step = 3; t.t = 0; t.x0 = player.x; t.y0 = player.y; hint('drag to swim. release to glide.'); }
    else if (t.step === 2 && !t.woke && t.t > 6) { t.step = 3; t.t = 0; t.x0 = player.x; t.y0 = player.y; hint('drag to swim. release to glide.'); }
    else if (t.step === 3 && U.dist(player.x, player.y, t.x0, t.y0) > 4) { t.step = 4; t.t = 0; hint('walls fade. remember them.'); }
    else if (t.step === 4 && t.t > 3.5) { t.step = 5; t.t = 0; hint('find the sink. it hums.'); }
    else if (t.step === 5 && t.t > 5) { hint(''); }
  }

  // ---------- screen reader / eyes-closed ----------
  function announce(text) {
    if (!settings.eyesClosed) return; const now = performance.now(); if (now - lastAnnounce < 1800) return; lastAnnounce = now; emit('announce', text);
  }
  function announceP(verb, dx, dy, d) { if (d > 12) return; announce(verb + ', ' + U.bearingWord(dx, dy) + ', ' + U.nearWord(d) + '.'); }

  // ---------- input ----------
  function pos(e) { return { x: e.clientX, y: e.clientY }; }
  canvas.addEventListener('pointerdown', e => {
    Sfx.resume();
    if (state !== 'run' || ptr.down) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = pos(e); ptr.down = true; ptr.id = e.pointerId; ptr.sx = ptr.x = p.x; ptr.sy = ptr.y = p.y; ptr.t0 = performance.now(); ptr.moved = false; ptr.tick1 = ptr.tick2 = false;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptr.down || e.pointerId !== ptr.id) return; const p = pos(e); ptr.x = p.x; ptr.y = p.y;
    if (!ptr.moved && Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > 12) ptr.moved = true;
  });
  function release(e) {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return; ptr.down = false;
    if (state !== 'run') return;
    if (!ptr.moved) { const hold = (performance.now() - ptr.t0) / 1000; ping(hold < 0.25 ? 'click' : hold < 0.9 ? 'chirp' : 'shout'); }
  }
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  window.addEventListener('keydown', e => { if (state !== 'run') return; if (e.code === 'Space' && !e.repeat) { ptr.kdown = performance.now(); } });
  window.addEventListener('keyup', e => { if (state !== 'run' || ptr.kdown == null) return; if (e.code === 'Space') { const hold = (performance.now() - ptr.kdown) / 1000; ptr.kdown = null; ping(hold < 0.25 ? 'click' : hold < 0.9 ? 'chirp' : 'shout'); } });
  const keys = {}; window.addEventListener('keydown', e => { keys[e.code] = true; }); window.addEventListener('keyup', e => { keys[e.code] = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // ---------- update ----------
  function update(dt) {
    run.t += dt; time += dt;
    if (transition > 0) { transition -= dt; return; }
    if (run.titleCard > 0) run.titleCard -= dt;
    run.invuln = Math.max(0, run.invuln - dt); run.dmgPulse = Math.max(0, run.dmgPulse - dt * 1.2);
    run.noiseLevel = Math.max(0, run.noiseLevel - dt * 0.22);

    // player movement
    let dvx = 0, dvy = 0, moving = false;
    if (ptr.down && ptr.moved) { const dx = ptr.x - ptr.sx, dy = ptr.y - ptr.sy; const l = Math.hypot(dx, dy) || 1; const m = Math.min(1, l / 80); dvx = dx / l * m * 3; dvy = dy / l * m * 3; moving = true; }
    else { let kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0), ky = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0); if (kx || ky) { const l = Math.hypot(kx, ky); dvx = kx / l * 3; dvy = ky / l * 3; moving = true; } }
    if (moving) { const k = Math.min(1, dt * 5); player.vx += (dvx - player.vx) * k; player.vy += (dvy - player.vy) * k; }
    else { const dr = Math.exp(-dt * (evo.has('slick') ? 0.55 : 1.1)); player.vx *= dr; player.vy *= dr; }
    // currents
    let inCurrent = false;
    for (const c of ch.currents) {
      const d = U.dist(c.x, c.y, player.x, player.y);
      if (d < c.r) { const f = 1 - d / c.r; player.vx += c.vx * f * dt * 2.2; player.vy += c.vy * f * dt * 2.2; inCurrent = true; }
      c.hum.set(c.x - player.x, c.y - player.y);
    }
    if (inCurrent) Haptics.current();
    const sp = Math.hypot(player.vx, player.vy);
    if (sp > 0.25) { run.facing.x = player.vx / sp; run.facing.y = player.vy / sp; }
    player.x += player.vx * dt; player.y += player.vy * dt;
    const col = Procgen.collide(ch, player.x, player.y, player.r);
    player.x = col.x; player.y = col.y;
    if (col.hit) {
      const vn = player.vx * col.nx + player.vy * col.ny; if (vn < 0) { player.vx -= col.nx * vn * 0.9; player.vy -= col.ny * vn * 0.9; }
      if (time - run.lastBrush > 0.3 && sp > 0.3) {
        run.lastBrush = time; Haptics.wallBrush(); Sfx.ping('touch');
        const f = emitPing(player.x - col.nx * player.r, player.y - col.ny * player.r, 'touch');
        if (!evo.has('slick')) addNoise(player.x, player.y, 0.25, f);
      }
    }
    if (sp > 2.0) { run.moveNoise += dt; if (run.moveNoise > 0.5) { run.moveNoise = 0; addNoise(player.x, player.y, 0.15); } } else run.moveNoise = 0;
    // hold-charge haptic ticks
    if (ptr.down && !ptr.moved) { const hold = (performance.now() - ptr.t0) / 1000; if (hold > 0.25 && !ptr.tick1) { ptr.tick1 = true; Haptics.charge(1); } if (hold > 0.9 && !ptr.tick2) { ptr.tick2 = true; Haptics.charge(2); } }

    // shout echoes
    for (let i = run.noiseTimers.length - 1; i >= 0; i--) { const n = run.noiseTimers[i]; if (time >= n.t) { addNoise(n.x, n.y, n.amt); run.noiseTimers.splice(i, 1); } }
    // expire pings
    run.pings = run.pings.filter(p => time - p.t0 < p.dur + p.radius / p.speed);
    // shared player sound field for predators (throttled)
    if (time - playerFieldT > 0.3) { playerField = Procgen.distField(ch, player.x, player.y); playerFieldT = time; }

    // pebble
    if (run.pebble) { const pb = run.pebble; pb.t += dt; if (pb.t >= pb.dur) { emitPing(pb.tx, pb.ty, 'pebble'); Sfx.ping('pebble'); run.pebble = null; } }

    // predators
    for (const p of ch.preds) updatePredator(p, dt);

    // otoliths
    for (const o of ch.otoliths) {
      if (o.taken) continue; const d = U.dist(o.x, o.y, player.x, player.y);
      if (d < 0.6) { o.taken = true; run.oto++; Sfx.otolith(); Haptics.otolith(); emit('float', '+1 otolith'); announce('otolith.'); continue; }
      o.nextTick -= dt; if (o.nextTick <= 0) { o.nextTick = 2 + Math.random() * 2; if (d < 7) Sfx.otolithTick(o.x - player.x, o.y - player.y); }
    }
    // exit
    ch.exitHum.set(ch.exit.x - player.x, ch.exit.y - player.y);
    if (U.dist(ch.exit.x, ch.exit.y, player.x, player.y) < 0.75) { descend(); return; }

    // ambience
    run.dripT -= dt; if (run.dripT <= 0) { run.dripT = 1.5 + Math.random() * 3.5; Sfx.drip(ch.size); }
    if (ch.drone) { const w = ch.preds.find(p => p.type === 'warden'); const d = w ? U.dist(w.x, w.y, player.x, player.y) : 20; const rate = U.clamp(1 - d / 18, 0, 1); ch.drone.set(0, 0, 0.4 + rate); run.heartT -= dt; if (run.heartT <= 0) { run.heartT = U.lerp(1.1, 0.45, rate); Sfx.heartbeat(0.5 + rate); } }

    // path record
    run.pathT += dt; if (run.pathT > 0.12) { run.pathT = 0; run.path.push({ x: player.x, y: player.y, c: run.chamber }); }
    tutUpdate(dt);
    // camera
    const k = Math.min(1, dt * 3.5); cam.x += (player.x - cam.x) * k; cam.y += (player.y - cam.y) * k;
  }

  function updatePredator(p, dt) {
    const dx = p.x - player.x, dy = p.y - player.y, d = Math.hypot(dx, dy);
    const pcell = ch.cellOf(p.x, p.y); const pathToPlayer = (playerField && pcell >= 0) ? playerField[pcell] : 1e9;
    p.awareness = Math.max(0, p.awareness - dt * (p.type === 'warden' ? 0.04 : 0.07));
    if (p.stun > 0) p.stun -= dt;
    const calm = settings.calm ? 0.7 : 1, tierMul = 1 + 0.1 * run.tier;
    if (p.type === 'angler') {
      p.lure += dt; p.hum.set(dx, dy); p.cool -= dt;
      if (p.lash) {
        const L = p.lash; L.t -= dt;
        if (L.t <= 0 && !L.done) { L.done = true; L.show = 0.35; Sfx.lash(dx, dy); emitPing(p.x, p.y, 'lash', { pred: true }); if (d < 2.4) damage(1, 'an angler'); announceP('lashes', dx, dy, d); }
        if (L.done) { L.show -= dt; if (L.show <= 0) p.lash = null; }
      } else if (p.cool <= 0 && d < 1.1) triggerLash(p, player.x, player.y);
      return;
    }
    // vocalizations (they reveal themselves by their own sound)
    p.nextClick -= dt;
    if (p.nextClick <= 0) {
      if (p.type === 'bristlemaw') {
        if (!p.dormant) { Sfx.bristleClick(dx, dy); emitPing(p.x, p.y, 'self', { pred: true }); const closeness = U.clamp(1 - d / (evo.has('lateral') ? 8 : 4), 0, 1); if (closeness > 0) Haptics.bearing(closeness); announceP('clicks', dx, dy, d); }
        p.nextClick = p.state === 'hunt' ? 0.35 : p.state === 'investigate' ? 0.7 : 1.4;
      } else {
        Sfx.bellow(dx, dy); emitPing(p.x, p.y, 'bellow', { pred: true }); Haptics.bellow(U.clamp(1 - d / 14, 0, 1)); announceP('bellows', dx, dy, d);
        p.nextClick = 4 + Math.random() * 3;
      }
    }
    if (p.dormant) return;
    let speed = 0, dirx = 0, diry = 0;
    if (p.type === 'bristlemaw') {
      if (p.awareness > 0.5 && pathToPlayer < 3.5) { p.state = 'hunt'; p.target = { x: player.x, y: player.y }; p.targetDirty = true; speed = 2.1; }
      else if (p.target && p.awareness > 0.05) { p.state = 'investigate'; speed = 1.0 + p.awareness * 0.9; }
      else { p.state = 'idle'; speed = 0.45; }
    } else {
      const base = 0.9 + run.wardenEsc * 0.3;
      if (p.awareness > 0.4 && pathToPlayer < 6) { p.state = 'hunt'; p.target = { x: player.x, y: player.y }; p.targetDirty = true; speed = base + 1.0; }
      else if (p.target && p.awareness > 0.05 && p.state !== 'patrol') { p.state = 'investigate'; speed = base + 0.4; }
      else { p.state = 'patrol'; p.target = ch.waypoints[p.wp % ch.waypoints.length]; speed = base; }
    }
    speed *= calm * tierMul * (p.timid ? 0.7 : 1); if (p.stun > 0) speed *= 0.2;
    if (p.state === 'idle') {
      p.wanderT -= dt; if (p.wanderT <= 0) { const a = Math.random() * U.TAU; p.wvx = Math.cos(a); p.wvy = Math.sin(a); p.wanderT = 2 + Math.random() * 3; }
      dirx = p.wvx; diry = p.wvy;
    } else if (p.target) {
      if (!p.field || p.targetDirty || (p.state === 'hunt' && time - p.fieldT > 0.35) || (p.state === 'patrol' && time - p.fieldT > 2)) { p.field = Procgen.distField(ch, p.target.x, p.target.y); p.fieldT = time; p.targetDirty = false; }
      const here = pcell >= 0 ? p.field[pcell] : 1e9;
      if (here < 0.55) {
        if (p.state === 'investigate') { p.target = null; p.awareness *= 0.5; p.state = 'idle'; p.wanderT = 0; }
        else if (p.state === 'patrol') { p.wp++; p.target = null; p.targetDirty = true; }
      } else if (pcell >= 0) {
        const x = pcell % ch.w, y = (pcell / ch.w) | 0; let best = here, bx = x, by = y;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { if (!ox && !oy) continue; const xx = x + ox, yy = y + oy; if (xx < 0 || yy < 0 || xx >= ch.w || yy >= ch.h) continue; const v = p.field[yy * ch.w + xx]; if (v < best) { best = v; bx = xx; by = yy; } }
        const c = ch.center(by * ch.w + bx); const l = Math.hypot(c.x - p.x, c.y - p.y) || 1; dirx = (c.x - p.x) / l; diry = (c.y - p.y) / l;
        if (best >= 1e9 || best === here) { dirx = -dx / (d || 1); diry = -dy / (d || 1); }
      }
    }
    const k = Math.min(1, dt * 4); p.vx += (dirx * speed - p.vx) * k; p.vy += (diry * speed - p.vy) * k;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const col = Procgen.collide(ch, p.x, p.y, p.r); p.x = col.x; p.y = col.y;
    if (col.hit && p.state === 'idle') p.wanderT = 0;
    if (d < p.r + 0.4 && p.stun <= 0 && p.state !== 'idle' && p.state !== 'patrol') {
      damage(p.type === 'warden' ? 2 : 1, p.type === 'warden' ? 'the warden' : 'a bristlemaw');
      p.stun = 1.4; const l = d || 1; player.vx -= dx / l * 4; player.vy -= dy / l * 4; p.target = null; p.awareness = 0.3; p.state = 'idle';
    }
  }

  // ---------- rendering ----------
  const sx = x => (x - cam.x) * ppm + W / 2, sy = y => (y - cam.y) * ppm + H / 2;
  function brightAt(cell) {
    if (cell < 0) return 0; let b = 0;
    for (const p of run.pings) {
      const d = p.field[cell]; if (d >= 1e9 || d > p.radius) continue;
      const el = time - p.t0, arr = d / p.speed; if (el < arr) continue; const age = el - arr; if (age > p.dur) continue;
      const fall = 1 - (d / p.radius) * (d / p.radius); const fade = Math.pow(1 - age / p.dur, 1.5);
      const v = fall * fade * p.intensity; if (v > b) b = v;
    }
    return b;
  }
  function colorFor(b) {
    const t = U.clamp(b, 0, 1); let r, g, bl, a;
    if (t > 0.45) { const m = (t - 0.45) / 0.55; r = U.lerp(pal.dim[0], pal.phos[0], m); g = U.lerp(pal.dim[1], pal.phos[1], m); bl = U.lerp(pal.dim[2], pal.phos[2], m); a = 0.4 + 0.6 * m; }
    else { r = pal.dim[0]; g = pal.dim[1]; bl = pal.dim[2]; a = 0.4 * Math.pow(t / 0.45, 1.2); }
    return [r | 0, g | 0, bl | 0, a];
  }
  const NB = 14; const bins = []; for (let i = 0; i < NB; i++) bins.push([]);
  function drawSegBins(chamber, fixed, brightFn) {
    for (let i = 0; i < NB; i++) bins[i].length = 0;
    const bf = brightFn || brightAt;
    for (const s of chamber.segs) { const b = fixed != null ? fixed : bf(s.air); if (b < 0.015) continue; bins[Math.min(NB - 1, (b * NB) | 0)].push(s); }
    ctx.lineCap = 'round';
    for (let i = 0; i < NB; i++) {
      const arr = bins[i]; if (!arr.length) continue; const [r, g, b, a] = colorFor((i + 0.5) / NB);
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath(); for (const s of arr) { ctx.moveTo(sx(s.ax), sy(s.ay)); ctx.lineTo(sx(s.bx), sy(s.by)); }
        ctx.strokeStyle = `rgba(${r},${g},${b},${pass ? a : a * 0.22})`; ctx.lineWidth = pass ? 1.5 : 5; ctx.stroke();
      }
    }
  }
  function phos(a) { return `rgba(${pal.phos[0]},${pal.phos[1]},${pal.phos[2]},${a})`; }
  function ember(a) { return `rgba(${EMBER[0]},${EMBER[1]},${EMBER[2]},${a})`; }
  function lampGlow(x, y, r, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, phos(a)); g.addColorStop(0.4, phos(a * 0.3)); g.addColorStop(1, phos(0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function drawPredator(p, b, heat) {
    if (b < 0.02 && !heat) return;
    const x = sx(p.x), y = sy(p.y), r = p.r * ppm;
    ctx.save(); ctx.translate(x, y);
    const [cr, cg, cb, ca] = colorFor(b);
    ctx.strokeStyle = heat && b < 0.2 ? ember(0.28) : `rgba(${cr},${cg},${cb},${ca})`; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
    const ang = Math.atan2(p.vy, p.vx) || 0;
    if (p.type === 'bristlemaw') {
      ctx.rotate(ang); ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.8, 0, 0, U.TAU); ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = (i / 12) * U.TAU; const bx = Math.cos(a) * r * 1.3, by = Math.sin(a) * r * 0.8; ctx.moveTo(bx, by); ctx.lineTo(bx * 1.55, by * 1.55); } ctx.stroke();
    } else if (p.type === 'angler') {
      ctx.beginPath(); ctx.moveTo(-r, -r * 0.6); ctx.quadraticCurveTo(r * 1.2, -r * 1.1, r * 1.1, 0); ctx.quadraticCurveTo(r * 1.2, r * 1.1, -r, r * 0.6); ctx.quadraticCurveTo(-r * 1.6, 0, -r, -r * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.2, 0); ctx.lineTo(r * 1.1, r * 0.25); ctx.stroke();
    } else {
      ctx.beginPath(); for (let i = 0; i <= 28; i++) { const a = (i / 28) * U.TAU; const rr = r * (1 + 0.12 * Math.sin(a * 7 + time)); const px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, U.TAU); ctx.stroke();
    }
    ctx.restore();
  }
  function drawPlayer() {
    const x = sx(player.x), y = sy(player.y);
    const ang = Math.atan2(run.facing.y, run.facing.x); const sp = Math.hypot(player.vx, player.vy);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const L = 0.6 * ppm; const ph = time * (5 + sp * 5); const amp = 0.06 * ppm * (0.35 + sp / 3);
    const a = run.invuln > 0 ? 0.25 + 0.3 * Math.abs(Math.sin(time * 14)) : 0.62;
    // the salamander is the lamp: a faint bioluminescent bloom that marks you without revealing anything
    lampGlow(0, 0, ppm * 1.1, 0.16 * (a / 0.62));
    ctx.strokeStyle = phos(a); ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // salamander: blunt wedge head, tapering body, long swaying tail
    const w1 = Math.sin(ph) * amp, w2 = Math.sin(ph - 1.6) * amp * 1.8, w3 = Math.sin(ph - 3.2) * amp * 2.6;
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0);
    ctx.quadraticCurveTo(L * 0.42, -0.11 * ppm, L * 0.2, -0.1 * ppm + w1 * 0.3);
    ctx.quadraticCurveTo(-L * 0.1, -0.08 * ppm + w2 * 0.4, -L * 0.4, -0.04 * ppm + w2);
    ctx.quadraticCurveTo(-L * 0.75, w3 * 0.8, -L * 1.05, w3);
    ctx.quadraticCurveTo(-L * 0.75, w3 * 0.8 + 0.03 * ppm, -L * 0.4, 0.04 * ppm + w2);
    ctx.quadraticCurveTo(-L * 0.1, 0.08 * ppm + w2 * 0.4, L * 0.2, 0.1 * ppm + w1 * 0.3);
    ctx.quadraticCurveTo(L * 0.42, 0.11 * ppm, L * 0.5, 0);
    ctx.stroke();
    // four small legs, splayed
    ctx.strokeStyle = phos(a * 0.75); ctx.lineWidth = 1.1;
    const legs = [[0.16, 1, 0.6], [0.16, -1, -0.6], [-0.3, 1, 1.2], [-0.3, -1, -1.2]];
    for (const [lx, side, swing] of legs) { const kx = lx * L, ky = side * 0.09 * ppm; const ex = kx - 0.06 * ppm + Math.sin(ph + swing) * 0.03 * ppm, ey = ky + side * 0.14 * ppm; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(ex, ey); ctx.stroke(); }
    ctx.restore();
    // noise meter ring
    if (run.noiseLevel > 0.01) { ctx.beginPath(); ctx.arc(x, y, (0.5 + run.noiseLevel * 1.6) * ppm, 0, U.TAU); ctx.strokeStyle = ember(0.06 + run.noiseLevel * 0.25); ctx.lineWidth = 1; ctx.stroke(); }
    // charge arc while holding still
    if (ptr.down && !ptr.moved) { const hold = (performance.now() - ptr.t0) / 1000; const lvl = hold < 0.25 ? hold / 0.25 : hold < 0.9 ? 1 + (hold - 0.25) / 0.65 : 2 + Math.min(1, (hold - 0.9) / 0.6); ctx.beginPath(); ctx.arc(x, y, 0.5 * ppm + lvl * 0.16 * ppm, -Math.PI / 2, -Math.PI / 2 + U.TAU * Math.min(1, lvl / 3)); ctx.strokeStyle = phos(0.35); ctx.lineWidth = 1.2; ctx.stroke(); for (let i = 1; i <= 3; i++) { const aa = -Math.PI / 2 + U.TAU * i / 3; ctx.beginPath(); ctx.arc(x, y, 0.5 * ppm + lvl * 0.16 * ppm, aa - 0.02, aa + 0.02); ctx.strokeStyle = phos(0.7); ctx.lineWidth = 3; ctx.stroke(); } }
    if (run.dmgPulse > 0) { ctx.beginPath(); ctx.arc(x, y, (1 - run.dmgPulse) * 2.2 * ppm + 0.4 * ppm, 0, U.TAU); ctx.strokeStyle = ember(run.dmgPulse * 0.6); ctx.lineWidth = 2; ctx.stroke(); }
    // first run, before the first tap: the app's mark breathes out of the salamander, the same ring the launcher icon shows
    if (run.tut && run.tut.step === 0 && !ptr.down) {
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) { const ph = REDUCE ? (i + 1) / 3.5 : ((time / 2.6) + i / 3) % 1; const rr = (0.45 + ph * 2.2) * ppm; ctx.beginPath(); ctx.arc(x, y, rr, 0, U.TAU); ctx.strokeStyle = phos(0.5 * (1 - ph) * (1 - ph)); ctx.stroke(); }
    }
  }
  function drawWavefronts() {
    ctx.fillStyle = phos(1);
    for (const p of run.pings) {
      if (p.pred && p.type === 'self') continue;
      const el = time - p.t0; const front = el * p.speed; if (front > p.radius + 0.5) continue;
      const a = 0.55 * Math.max(0, 1 - front / p.radius) * p.intensity; if (a < 0.02) continue;
      ctx.fillStyle = phos(a); const F = p.field, N = ch.w * ch.h;
      for (let i = 0; i < N; i++) { const d = F[i]; if (d >= 1e9) continue; if (Math.abs(d - front) < 0.3) { const c = ch.center(i); ctx.fillRect(sx(c.x) - 1, sy(c.y) - 1, 2, 2); } }
    }
  }
  function drawWorld() {
    drawSegBins(ch);
    drawWavefronts();
    // exit: ring of dots
    const eb = brightAt(ch.cellOf(ch.exit.x, ch.exit.y));
    if (eb > 0.02) { const [r, g, b, a] = colorFor(eb); ctx.fillStyle = `rgba(${r},${g},${b},${a})`; for (let i = 0; i < 14; i++) { const an = i / 14 * U.TAU + time * 0.6; ctx.fillRect(sx(ch.exit.x + Math.cos(an) * 0.55) - 1, sy(ch.exit.y + Math.sin(an) * 0.55) - 1, 2.5, 2.5); } }
    for (const o of ch.otoliths) { if (o.taken) continue; const b = brightAt(ch.cellOf(o.x, o.y)); if (b < 0.02) continue; const [r, g, bl, a] = colorFor(Math.max(b, 0.5)); ctx.strokeStyle = `rgba(${r},${g},${bl},${a})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx(o.x), sy(o.y) - 4); ctx.lineTo(sx(o.x) + 3.5, sy(o.y)); ctx.lineTo(sx(o.x), sy(o.y) + 4); ctx.lineTo(sx(o.x) - 3.5, sy(o.y)); ctx.closePath(); ctx.stroke(); }
    for (const c of ch.currents) { const d = U.dist(c.x, c.y, player.x, player.y); if (d < c.r + 2) { ctx.strokeStyle = phos(0.07 * U.clamp(1 - d / (c.r + 2), 0, 1) + 0.02); ctx.lineWidth = 1; for (let i = 0; i < 9; i++) { const a = U.hash2(i, 3, 1) * U.TAU, rr = U.hash2(i, 5, 2) * c.r; const ph = ((time * 0.5 + U.hash2(i, 9, 3)) % 1); const px = c.x + Math.cos(a) * rr + c.vx * (ph * 3 - 1.5), py = c.y + Math.sin(a) * rr + c.vy * (ph * 3 - 1.5); ctx.beginPath(); ctx.moveTo(sx(px), sy(py)); ctx.lineTo(sx(px + c.vx * 0.5), sy(py + c.vy * 0.5)); ctx.stroke(); } } }
    for (const p of ch.preds) {
      const d = U.dist(p.x, p.y, player.x, player.y);
      const heat = evo.has('heat') && d < 6;
      const b = brightAt(ch.cellOf(p.x, p.y));
      drawPredator(p, b, heat);
      if (p.type === 'angler') { const la = 0.04 + 0.05 * (0.5 + 0.5 * Math.sin(p.lure * 1.7)); ctx.fillStyle = phos(la); ctx.beginPath(); ctx.arc(sx(p.x + 1.1), sy(p.y + 0.25), 2, 0, U.TAU); ctx.fill(); }
      if (p.type === 'angler' && p.lash && p.lash.done && p.lash.show > 0) { ctx.strokeStyle = phos(p.lash.show * 2); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx(p.x), sy(p.y)); ctx.lineTo(sx(p.lash.tx), sy(p.lash.ty)); ctx.stroke(); }
      if (evo.has('lateral') && d < 8 && d > 1 && !p.dormant && p.type !== 'angler') { const ang = Math.atan2(p.y - player.y, p.x - player.x); const R = Math.min(W, H) * 0.42; const cx = W / 2 + Math.cos(ang) * R, cy = H / 2 + Math.sin(ang) * R; ctx.strokeStyle = phos(0.25 * (1 - d / 8)); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - Math.cos(ang) * 10, cy - Math.sin(ang) * 10); ctx.lineTo(cx, cy); ctx.stroke(); }
    }
    if (run.pebble) { const pb = run.pebble; const t = pb.t / pb.dur; const px = U.lerp(pb.x, pb.tx, t), py = U.lerp(pb.y, pb.ty, t); ctx.fillStyle = phos(0.5); ctx.fillRect(sx(px) - 1.5, sy(py) - 1.5, 3, 3); }
    drawPlayer();
  }
  function drawDeath() {
    // sonar art of the final chamber: faint full geometry + the path you swam + every sound you made
    const fit = Math.min(W / ch.wm, H / ch.hm) * 0.88; const savedPpm = ppm; ppm = fit; const sc = { x: cam.x, y: cam.y }; cam.x = ch.wm / 2; cam.y = ch.hm / 2;
    drawSegBins(ch, 0.3);
    const path = run.path.filter(p => p.c === run.chamber); const n = Math.floor(path.length * Math.min(1, deathAnim / 3));
    if (n > 1) { ctx.strokeStyle = phos(0.7); ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.beginPath(); for (let i = 0; i < n; i++) { const p = path[i]; if (i) ctx.lineTo(sx(p.x), sy(p.y)); else ctx.moveTo(sx(p.x), sy(p.y)); } ctx.stroke(); }
    const logs = run.pingLog.filter(p => p.c === run.chamber); const m = Math.floor(logs.length * Math.min(1, deathAnim / 3));
    for (let i = 0; i < m; i++) { const p = logs[i]; const R = (p.type === 'shout' ? 3 : p.type === 'chirp' ? 1.6 : p.type === 'pebble' ? 1.2 : 0.7) * ppm; ctx.strokeStyle = phos(p.type === 'shout' ? 0.35 : 0.25); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), R, 0, U.TAU); ctx.stroke(); }
    if (path.length) { const p = path[path.length - 1]; if (deathAnim > 3) { ctx.strokeStyle = ember(0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), 5 + Math.sin(time * 3) * 1.5, 0, U.TAU); ctx.stroke(); } }
    ppm = savedPpm; cam.x = sc.x; cam.y = sc.y;
  }
  // ---------- title: the signature. A lamp hangs in a real chamber; every few seconds a ring of sound leaves it
  // and the cave walls light up as the sound reaches them, around corners, then fade. The same mechanic as the game.
  let tl = null;
  const T_SPEED = 6, T_RAD = 17, T_DUR = 4.2, T_PERIOD = 3.4;
  const REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function titleInit() {
    const chamber = Procgen.generate(0x5EA7ED, 'hall', 0);
    let best = -1, bd = 1e9; const cx = chamber.wm / 2, cy = chamber.hm * 0.46;
    for (let i = 0; i < chamber.w * chamber.h; i++) { if (chamber.grid[i] || !chamber.reach[i]) continue; const c = chamber.center(i); const d = U.dist(c.x, c.y, cx, cy); if (d < bd) { bd = d; best = i; } }
    const lamp = chamber.center(best);
    tl = { chamber, lamp, field: Procgen.distField(chamber, lamp.x, lamp.y), t: 0, pings: [], next: 0.5, reduce: REDUCE, anchorT: -9, lampY: H * 0.34 };
  }
  function drawTitle(dt) {
    if (!tl) titleInit();
    tl.t += dt; const T = tl.t; const { chamber, lamp, field } = tl;
    const savedPpm = ppm, scx = cam.x, scy = cam.y;
    // the lamp hangs just above the wordmark, so the scene and the name read as one thing on any screen height
    if (T - tl.anchorT > 0.5) { tl.anchorT = T; const wm = document.querySelector('#title .wordmark'); const r = wm && !document.getElementById('title').hidden ? wm.getBoundingClientRect() : null; tl.lampY = r ? U.clamp(r.top - 96, 64, H * 0.5) : H * 0.34; }
    ppm = Math.min(W / chamber.wm, H / chamber.hm) * 1.08; cam.x = lamp.x; cam.y = lamp.y + (H / 2 - tl.lampY) / ppm;
    if (!tl.reduce && T >= tl.next) { tl.pings.push({ t0: T }); tl.next = T + T_PERIOD; Sfx.titlePulse(); }
    tl.pings = tl.pings.filter(p => T - p.t0 < T_DUR + T_RAD / T_SPEED);
    const bright = cell => {
      const d = field[cell]; if (d >= 1e9 || d > T_RAD) return 0;
      if (tl.reduce) return 0.7 * (1 - (d / T_RAD) * (d / T_RAD));
      let b = 0;
      for (const p of tl.pings) { const el = T - p.t0, arr = d / T_SPEED; if (el < arr) continue; const age = el - arr; if (age > T_DUR) continue; const v = (1 - (d / T_RAD) * (d / T_RAD)) * Math.pow(1 - age / T_DUR, 1.5); if (v > b) b = v; }
      return b;
    };
    drawSegBins(chamber, null, bright);
    // the wavefront itself, following the sound field so it bends into side passages
    const N = chamber.w * chamber.h;
    for (const p of tl.pings) {
      const front = (T - p.t0) * T_SPEED; if (front > T_RAD) continue; const a = 0.55 * (1 - front / T_RAD); if (a < 0.02) continue;
      ctx.fillStyle = phos(a);
      for (let i = 0; i < N; i++) { const d = field[i]; if (d >= 1e9 || Math.abs(d - front) > 0.3) continue; const c = chamber.center(i); ctx.fillRect(sx(c.x) - 1, sy(c.y) - 1, 2, 2); }
    }
    // the lamp: a bioluminescent point, breathing
    const lx = sx(lamp.x), ly = sy(lamp.y); const pulse = tl.reduce ? 0.5 : 0.5 + 0.5 * Math.sin(T * 1.8);
    lampGlow(lx, ly, ppm * 2.6, 0.34 + 0.08 * pulse);
    ctx.fillStyle = phos(0.55); ctx.beginPath(); ctx.arc(lx, ly, 5.5 + pulse * 1.5, 0, U.TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.8 + 0.2 * pulse})`; ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, U.TAU); ctx.fill();
    // marine snow drifting down through the chamber
    ctx.fillStyle = phos(0.16);
    for (let i = 0; i < 30; i++) { const px = U.hash2(i, 1, 7) * W, py = ((U.hash2(i, 2, 7) + (tl.reduce ? 0 : T * 0.008 * (0.5 + U.hash2(i, 3, 7)))) % 1) * H; ctx.fillRect(px, py, 1.5, 1.5); }
    ppm = savedPpm; cam.x = scx; cam.y = scy;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0); lastT = now;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    if (state === 'idle') { drawTitle(dt); return; }
    if (state === 'run') update(dt);
    if (state === 'dead') { deathAnim += dt; time += dt; drawDeath(); return; }
    if (settings.eyesClosed) return;
    if (transition > 0) { ctx.fillStyle = phos(Math.min(1, transition) * 0.8); ctx.font = `${18}px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = 'center'; ctx.fillText(transitionText, W / 2, H / 2); return; }
    drawWorld();
    if (run.titleCard > 0) { const a = Math.min(1, run.titleCard, 3.5 - run.titleCard) * 0.9; ctx.fillStyle = phos(a); ctx.font = `300 ${Math.min(64, W * 0.14)}px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = 'center'; ctx.fillText('echodepths', W / 2, H * 0.36); }
  }
  raf = requestAnimationFrame(frame);

  // dev-only hooks (add ?debug to the url): jump chambers / take damage without playing them out
  const debug = /debug/.test(location.search) ? { descend: () => { if (state === 'run') descend(); }, hurt: (n, cause) => damage(n || 1, cause || 'the debugger') } : null;
  return { on, startRun, pause, resume, abandon, toTitle, throwPebble, setSettings, setEvolutions, state: () => state, run: () => run, ping, debug };
})();

// The Android shell drives pause and back through window.Game.
window.Game = Game;
