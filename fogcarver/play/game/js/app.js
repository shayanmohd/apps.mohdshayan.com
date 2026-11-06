/*
 * Fogcarver: the game controller. Screens, input, the frame loop, saves and every Shell call.
 *
 * Ad rules this file follows (WEBGAME-RECIPE.md section 3, GAME-DESIGN.md section 5):
 *   no ad of any kind inside an island; no banner in the app (web: the side slot on menus and results);
 *   one interstitial placement, atlas_next, decided by ads.interstitialDue; rewarded only from buttons
 *   that state the reward, shown only while caps.rewardedReady (or ad free); Remove ads only while
 *   caps.removeAds. Sharing only from the Share button, synchronously in its tap, and never rewarded.
 */
(function () {
  'use strict';
  var FC = window.FC;
  var hex = FC.hex, rules = FC.rules, islands = FC.islands, progress = FC.progress, ads = FC.ads;
  var art = FC.art, audio = FC.audio, share = FC.share, t = FC.t;
  var P = art.P;

  var POLICY_URL = 'https://apps.mohdshayan.com/privacy-policies/fogcarver-privacy-policy.html';
  var ABOUT_URL = 'https://apps.mohdshayan.com/fogcarver/';

  var $ = function (id) { return document.getElementById(id); };
  var cv = $('c');
  var ctx = cv.getContext('2d');

  // ---- saves ----
  Shell.configureSave({ prefix: 'fogcarver', version: progress.VERSION, migrate: progress.migrate });
  var prog = progress.sanitize(Shell.load('progress', null));
  var caps = Shell.caps;
  var today = islands.dayNumber();
  if (!prog.installDay) prog.installDay = today;

  function persist() { Shell.save('progress', prog); }

  var systemReduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return prog.reduced || !!(systemReduced && systemReduced.matches); }
  audio.setMuted(!prog.sound);

  // ---- view state ----
  var W = 0, H = 0, DPR = 1;
  var screen = 'home';      // home, play, result, atlas, archive
  var sheet = null;         // settings, pause, unlock, null
  var game = null;          // the island being played
  var view = null;          // what the canvas shows: { island, board, box, fog, tray, frame }
  var layers = { bg: null, land: null, coast: null, fog: null, fogMask: null, box: null };
  var dirty = true;
  var anims = [];           // { t0, dur, draw(p, now), done }
  var parts = [];           // wisps and specks
  var pops = [];            // floating "+n"
  var flashes = [];         // region flashes
  var stamps = {};          // landmark key -> start time
  var shakeT0 = 0;
  var veil = { t0: 0, dur: 0 };
  var lastResult = null;    // what the result screen shows
  var busy = false;         // an ad or purchase is open

  // ---- debug hook for tests (read only, plus a frame counter) ----
  var frames = { n: 0, slow: 0, last: 0, worst: 0, list: [] };

  function now() { return performance.now(); }

  // =====================================================================================
  // Layout
  // =====================================================================================

  function insets() {
    var c = Shell.caps;
    return c.insets || { top: 0, right: 0, bottom: 0, left: 0 };
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    art.setRes(DPR);
    layoutView();
  }

  /** The column the UI uses on wide screens (the board may use more). */
  function column() {
    var ins = insets();
    var w = Math.min(W - ins.left - ins.right, 520);
    return { x: (W - w) / 2, w: w };
  }

  function playLayout(island) {
    var ins = insets();
    var top = ins.top + 8;
    var hudH = 52;
    var trayH = Math.max(124, Math.min(168, H * 0.2));
    var bottom = H - ins.bottom - 8;
    var trayTop = bottom - trayH;
    var bx = ins.left + 8, bw = W - ins.left - ins.right - 16;
    var by = top + hudH + 4, bh = trayTop - by - 6;
    var L = art.fit(island, bx, by, bw, bh, island.cells.length >= 16 ? 46 : 56);
    // the tray (undo, current tile, the next two) must fit the width with room to spare at the edges
    var sT = Math.min(L.s, trayH * 0.4, 46, (W / 2 - 18) / 3.9);
    return {
      L: L,
      box: { x: bx, y: by, w: bw, h: bh },
      tray: { x: W / 2, y: trayTop + trayH / 2, s: sT, top: trayTop, h: trayH },
      next: [
        { x: W / 2 + sT * 2.35, y: trayTop + trayH / 2 - sT * 0.5, s: sT * 0.48 },
        { x: W / 2 + sT * 2.35 + sT * 1.0, y: trayTop + trayH / 2 - sT * 0.5, s: sT * 0.48 }
      ],
      undo: { x: W / 2 - sT * 2.5, y: trayTop + trayH / 2 }
    };
  }

  function boxLayout(island, box, maxS) {
    return { L: art.fit(island, box.x, box.y, box.w, box.h, maxS || 46), box: box };
  }

  /** The canvas area each screen leaves for its map, from the DOM placeholder of that screen. */
  function slotBox(id) {
    var el = $(id);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  function layoutView() {
    if (!view) { buildLayers(); return; }
    if (view.kind === 'play') {
      view.lay = playLayout(view.island);
      positionTrayButtons();
    } else if (view.kind === 'home' || view.kind === 'result') {
      var b = slotBox(view.kind === 'home' ? 'homeMap' : 'resultMap');
      if (b) {
        var pad = view.kind === 'result' ? 14 : 0;
        view.lay = boxLayout(view.island, { x: b.x + pad, y: b.y + pad, w: b.w - 2 * pad, h: b.h - 2 * pad }, view.kind === 'home' ? 44 : 44);
        view.frameBox = view.kind === 'result' ? b : null;
      } else {
        view.lay = null;
      }
    }
    buildLayers();
  }

  // =====================================================================================
  // Layers
  // =====================================================================================

  function layerCanvas(w, h) {
    var c = art.canvas(w * DPR, h * DPR);
    var g = c.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { c: c, g: g };
  }

  function buildLayers() {
    var bg = layerCanvas(W, H);
    var g = bg.g;
    g.fillStyle = P.sea;
    g.fillRect(0, 0, W, H);
    // the grain is drawn at device resolution so it stays fine
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    art.fillGrain(g, bg.c.width, bg.c.height, 0.9);
    g.restore();
    layers.bg = bg.c;
    layers.land = null;
    layers.coast = null;
    layers.box = null;
    if (view && view.lay) {
      var L = view.lay.L;
      art.drawWaterlines(g, L, 1, 4);
      art.drawLandBase(g, L);
      if (view.kind === 'play') drawTrayBed(g, view.lay.tray);
      var b = islandBox(L);
      layers.box = b;
      buildLand();
      var co = layerCanvas(b.w, b.h);
      co.g.translate(-b.x, -b.y);
      art.drawCoastline(co.g, L, 1);
      art.drawFeatures(co.g, L, view.island, 1);
      layers.coast = co.c;
      var fw = Math.max(8, Math.round(b.w / 2)), fh = Math.max(8, Math.round(b.h / 2));
      layers.fog = art.canvas(fw, fh);
      layers.fogMask = null;
    }
    dirty = true;
  }

  function islandBox(L) {
    var b = hex.bounds(L.cells);
    var pad = L.s * 1.4;
    var x0 = L.ox + L.s * hex.SQRT3 * b.minX - pad;
    var x1 = L.ox + L.s * hex.SQRT3 * b.maxX + pad;
    var y0 = L.oy + L.s * 1.5 * b.minR - pad;
    var y1 = L.oy + L.s * 1.5 * b.maxR + pad;
    return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - x0) + 1, h: Math.ceil(y1 - y0) + 1 };
  }

  function buildLand() {
    if (!view || !view.lay || !layers.box) return;
    var b = layers.box;
    var la = layerCanvas(b.w, b.h);
    la.g.translate(-b.x, -b.y);
    art.drawTiles(la.g, view.lay.L, view.board, 1);
    art.drawBrokenSeams(la.g, view.lay.L, view.board, 1);
    layers.land = la.c;
    view.sc = view.board.score();
    view.marks = art.landmarks(view.lay.L, view.sc);
    dirty = true;
  }

  function drawTrayBed(g, tray) {
    var w = Math.min(W - 24, tray.s * 9.5), h = tray.h - 8;
    var x = W / 2 - w / 2, y = tray.top + 4;
    g.save();
    g.beginPath();
    roundRect(g, x, y, w, h, 18);
    g.fillStyle = 'rgba(232,234,225,0.92)';
    g.shadowColor = 'rgba(31,43,42,0.18)';
    g.shadowBlur = 14;
    g.shadowOffsetY = 3;
    g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(31,43,42,0.35)';
    g.lineWidth = 1;
    g.stroke();
    // a faint socket under the current tile
    g.beginPath();
    art.hexPath(g, tray.s * 1.06, tray.x, tray.y);
    g.fillStyle = 'rgba(31,43,42,0.06)';
    g.fill();
    g.restore();
  }

  function roundRect(g, x, y, w, h, r) {
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // =====================================================================================
  // Views (what the canvas shows)
  // =====================================================================================

  function setView(kind, island, board, opts) {
    opts = opts || {};
    view = { kind: kind, island: island, board: board, fogA: new Float32Array(board.n), fogAnim: {}, lay: null };
    for (var i = 0; i < board.n; i++) view.fogA[i] = board.code[i] >= 0 ? 0 : 1;
    if (opts.noFog) for (var j = 0; j < board.n; j++) view.fogA[j] = 0;
    stamps = {};
    anims = []; parts = []; pops = []; flashes = [];
    layoutView();
    var sc = view.sc;
    // landmarks already standing are not stamped again
    if (view.marks) view.marks.forEach(function (m) { stamps[m.key] = -1e9; });
    return sc;
  }

  function clearView() {
    view = null;
    buildLayers();
  }

  // =====================================================================================
  // Islands and runs
  // =====================================================================================

  function islandById(id) {
    if (typeof id !== 'string') return null;
    var n = parseInt(id.slice(1), 10);
    if (!(n >= 1)) return null;
    return id.charAt(0) === 'd' ? islands.daily(n) : islands.atlas(n);
  }

  function saveRun() {
    if (!game) return;
    var map = progress.packMap(game.board.history);
    if (game.mode === 'daily') {
      prog.dailyRun = { day: game.day, map: map, second: !!game.second };
    } else {
      prog.run = { id: game.island.id, map: map, second: false, archive: game.mode === 'archive', preview: !!game.preview };
    }
    persist();
  }

  function clearRun() {
    if (!game) return;
    if (game.mode === 'daily') prog.dailyRun = null; else prog.run = null;
  }

  /** The saved daily run for today, if any. */
  function todayRun() {
    var r = prog.dailyRun;
    return r && r.day === today ? r : null;
  }

  // =====================================================================================
  // Playing an island
  // =====================================================================================

  function startIsland(island, mode, opts) {
    opts = opts || {};
    if (!island) return;
    var placements = progress.unpackMap(opts.map || '');
    var board = rules.replay(island, placements);
    game = {
      island: island, board: board, mode: mode, day: island.day || 0, atlas: island.atlas || 0,
      second: !!opts.second, preview: !!opts.preview, turn: 0, pending: -1, drag: null,
      lastUndoable: false, tutorial: island.tutorial && board.history.length < 3 ? islands.TUTORIAL.steps : null,
      finished: false, startTotal: 0, hintUndo: false, trayTurnAnim: 0, rotFrom: 0
    };
    showScreen('play');
    setView('play', island, board);
    game.startTotal = view.sc.total;
    veil = { t0: now(), dur: reduced() ? 250 : 800 };
    updateHud(true);
    saveRun();
    if (Shell.caps.platform === 'web') Shell.banner(false);
    if (board.done()) finishIsland();
  }

  function startDaily(second) {
    var island = islands.daily(today);
    if (!island) return;
    var run = todayRun();
    var rec = prog.daily[today];
    if (run) { startIsland(island, 'daily', { map: run.map, second: run.second }); return; }
    if (rec && !rec.archive && !second) { showResultFor(today); return; }
    startIsland(island, 'daily', { second: !!second });
  }

  function startAtlas(n, preview) {
    var island = islands.atlas(n);
    if (!island) return;
    var map = prog.run && prog.run.id === island.id ? prog.run.map : '';
    startIsland(island, 'atlas', { map: map, preview: preview || (prog.run && prog.run.id === island.id && prog.run.preview) });
  }

  function startArchive(day) {
    var island = islands.daily(day);
    if (!island) return;
    var map = prog.run && prog.run.id === island.id ? prog.run.map : '';
    startIsland(island, 'archive', { map: map });
  }

  function currentTile() { return game ? game.board.current() : -1; }

  function placeAt(cell, turn) {
    var b = game.board;
    if (game.finished || !b.isOpen(cell)) return false;
    if (game.tutorial && b.history.length < game.tutorial.length) {
      var step = game.tutorial[b.history.length];
      if (cell !== step.cell || turn !== step.turn) { refuse(cell); return false; }
    }
    var before = view.sc;
    var beforeKeys = {};
    (view.marks || []).forEach(function (m) { beforeKeys[m.key] = true; });
    var regionsBefore = {};
    (before.regions || []).forEach(function (r) { regionsBefore[r.slots.join(',')] = true; });
    var riverBefore = before.riverInfo && before.riverInfo.mouth >= 0;
    if (!b.place(cell, turn)) return false;
    game.lastUndoable = true;
    game.pending = -1;
    game.turn = 0;
    buildLand();
    var sc = view.sc;
    var gain = sc.total - before.total;
    carve(cell);
    audio.play('place');
    Shell.haptic('light');
    // seams and shores this tile made, ticked in one by one
    var ticks = [];
    for (var d = 0; d < 6; d++) {
      var s = cell * 6 + d, j = b.nb[s], e = b.e[s];
      if (j < 0) { if (e === rules.C || e === rules.R) ticks.push(d); }
      else if (b.code[j] >= 0 && b.e[j * 6 + (d + 3) % 6] === e) ticks.push(d);
    }
    ticks.forEach(function (dd, k) { addTick(cell, dd, k); });
    var c = art.cellXY(view.lay.L, cell);
    var bonus = 0;
    var newRegions = (sc.regions || []).filter(function (r) { return !regionsBefore[r.slots.join(',')]; });
    newRegions.forEach(function (r) {
      bonus += r.points;
      flashSlots(r.slots, r.terrain === rules.F ? 'rgba(244,246,236,0.55)' : 'rgba(250,236,205,0.6)');
    });
    var riverNow = sc.riverInfo && sc.riverInfo.mouth >= 0;
    if (riverNow && !riverBefore) {
      bonus += sc.river;
      flashSlots(sc.riverInfo.slots, 'rgba(210,232,240,0.7)');
      audio.play('river');
    }
    if (newRegions.length) {
      setTimeout(function () { audio.play('closure'); }, 120);
      Shell.haptic('success');
    }
    var t0 = now();
    (view.marks || []).forEach(function (m) {
      if (!beforeKeys[m.key]) {
        stamps[m.key] = t0 + 260;
        setTimeout(function () { audio.play('bell'); Shell.haptic('medium'); if (!reduced()) shakeT0 = now(); }, 260);
      }
    });
    if (gain > 0) addPop(c.x, c.y - view.lay.L.s * 0.5, '+' + gain, bonus > 0);
    if (gain === 0 && !prog.undoHinted && !game.tutorial) {
      prog.undoHinted = true;
      game.hintUndo = true;
      $('undoBtn').classList.add('hint');
      setTimeout(function () { $('undoBtn').classList.remove('hint'); }, 2400);
    }
    if (game.tutorial && b.history.length >= game.tutorial.length) game.tutorial = null;
    updateHud();
    saveRun();
    if (b.done()) {
      game.finished = true;
      setTimeout(finishIsland, reduced() ? 500 : 1100);
    }
    return true;
  }

  function undo() {
    if (!game || game.finished || !game.lastUndoable || !game.board.history.length) return;
    if (game.tutorial || (game.island.tutorial && game.board.history.length <= 3)) return;
    var last = game.board.undo();
    game.lastUndoable = false;
    game.pending = -1;
    game.turn = last.turn;
    view.fogAnim[last.cell] = { t0: now(), from: 0, to: 1, dur: reduced() ? 150 : 320 };
    buildLand();
    // drop stamps for landmarks that went away
    var keys = {};
    (view.marks || []).forEach(function (m) { keys[m.key] = true; });
    Object.keys(stamps).forEach(function (k) { if (!keys[k]) delete stamps[k]; });
    audio.play('undo');
    Shell.haptic('tap');
    updateHud();
    saveRun();
  }

  function refuse(cell) {
    audio.play('refuse');
    Shell.haptic('error');
    if (cell >= 0 && view && view.lay) {
      var c = art.cellXY(view.lay.L, cell);
      anims.push({ t0: now(), dur: 300, draw: function (p) {
        ctx.strokeStyle = P.vermilion;
        ctx.globalAlpha = 1 - p;
        ctx.lineWidth = 2;
        ctx.beginPath();
        art.hexPath(ctx, view.lay.L.s * 0.9, c.x + Math.sin(p * 18) * 3 * (1 - p), c.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } });
    }
  }

  function rotate() {
    if (!game || game.finished || currentTile() < 0) return;
    game.turn = (game.turn + 1) % 6;
    game.trayTurnAnim = now();
    audio.play('turn');
    Shell.haptic('tap');
    dirty = true;
  }

  // =====================================================================================
  // Effects
  // =====================================================================================

  function carve(cell) {
    var dur = reduced() ? 180 : 460;
    view.fogAnim[cell] = { t0: now(), from: 1, to: 0, dur: dur };
    if (reduced()) return;
    var c = art.cellXY(view.lay.L, cell);
    var s = view.lay.L.s;
    for (var k = 0; k < 14; k++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 30 + Math.random() * 70;
      parts.push({
        kind: 'wisp', x: c.x + Math.cos(a) * s * 0.3, y: c.y + Math.sin(a) * s * 0.3,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 12, spin: (Math.random() - 0.5) * 2.4,
        r: s * (0.28 + Math.random() * 0.3), t0: now(), life: 700 + Math.random() * 500
      });
    }
    for (var m = 0; m < 6; m++) {
      var a2 = Math.random() * Math.PI * 2;
      parts.push({
        kind: 'speck', x: c.x, y: c.y, vx: Math.cos(a2) * (50 + Math.random() * 60), vy: Math.sin(a2) * (50 + Math.random() * 60),
        r: 1 + Math.random() * 1.2, t0: now(), life: 420 + Math.random() * 200
      });
    }
  }

  function addTick(cell, d, k) {
    var t0 = now() + 90 + k * 70;
    setTimeout(function () { audio.play('tick', k); }, 90 + k * 70);
    anims.push({ t0: t0, dur: 1300, draw: function (p) {
      if (!view || !view.lay) return;
      var L = view.lay.L;
      var c = art.cellXY(L, cell);
      var m = hex.edgeMid(d, L.s);
      var ex = c.x + m.x, ey = c.y + m.y;
      var a = d * Math.PI / 3;
      var nx = Math.cos(a), ny = Math.sin(a);
      var grow = Math.min(1, p * 6);
      var fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      var len = L.s * 0.22 * grow;
      ctx.beginPath();
      ctx.moveTo(ex - nx * len, ey - ny * len);
      ctx.lineTo(ex + nx * len, ey + ny * len);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex, ey, 2.4 * grow, 0, Math.PI * 2);
      ctx.fillStyle = P.vermilion;
      ctx.fill();
      ctx.restore();
    } });
  }

  function addPop(x, y, text, big) {
    pops.push({ x: x, y: y, text: text, big: big, t0: now() + 120, dur: big ? 1400 : 1000 });
  }

  function flashSlots(slots, color) {
    flashes.push({ slots: slots.slice(), color: color, t0: now() + 80, dur: reduced() ? 400 : 900 });
  }

  // =====================================================================================
  // Finishing
  // =====================================================================================

  function finishIsland() {
    if (!game) return;
    var b = game.board;
    var score = b.total();
    var island = game.island;
    var par = island.par, gold = island.gold;
    var info = { mode: game.mode, score: score, par: par, gold: gold, island: island, board: b, second: false };
    if (game.mode === 'daily') {
      var rec = progress.finishDaily(prog, game.day, today, score, b.history, { second: game.second, par: par, gold: gold });
      info.day = game.day;
      info.second = rec.s2 != null;
      info.best = progress.bestOf(rec);
      prog.dailyRun = null;
    } else if (game.mode === 'archive') {
      progress.finishDaily(prog, game.day, today, score, b.history, { par: par, gold: gold });
      info.day = game.day;
      prog.run = null;
    } else {
      var prev = prog.atlas.done[game.atlas];
      var wasBest = prev ? prev.best : -1;
      progress.finishAtlas(prog, game.atlas, score, par, gold, b.history);
      info.atlas = game.atlas;
      info.stars = progress.stars(score, par, gold);
      info.newBest = wasBest >= 0 && score > wasBest;
      info.preview = game.preview;
      prog.run = null;
    }
    info.reachedPar = score >= par;
    // the one standalone Remove ads offer waits for a par on a real island, never the tutorial
    info.offer = ads.removeAdsOfferDue(Shell.caps, prog, info.reachedPar && !island.tutorial);
    if (info.offer) prog.offerShown = true;
    persist();
    audio.play('finish', info.reachedPar);
    Shell.haptic('success');
    game = null;
    lastResult = info;
    showResult(info);
  }

  /** The result card of a finished day from the save (Today's map, the archive). */
  function showResultFor(day) {
    var rec = prog.daily[day];
    var island = islands.daily(day);
    if (!rec || !island) return;
    var b = rules.replay(island, progress.unpackMap(progress.bestMap(rec)));
    var info = {
      mode: rec.archive ? 'archive' : 'daily', day: day, score: progress.bestOf(rec), par: island.par, gold: island.gold,
      island: island, board: b, second: rec.s2 != null, view: true
    };
    info.reachedPar = info.score >= info.par;
    lastResult = info;
    showResult(info);
  }

  function showAtlasResult(n) {
    var rec = prog.atlas.done[n];
    var island = islands.atlas(n);
    if (!rec || !island) return;
    var b = rules.replay(island, progress.unpackMap(rec.map));
    var info = { mode: 'atlas', atlas: n, score: rec.best, par: island.par, gold: island.gold, island: island, board: b, stars: rec.stars, view: true };
    info.reachedPar = info.score >= info.par;
    lastResult = info;
    showResult(info);
  }

  // =====================================================================================
  // Screens (DOM)
  // =====================================================================================

  var SCREENS = ['home', 'result', 'atlas', 'archive'];

  function showScreen(name) {
    screen = name;
    SCREENS.forEach(function (s) { $(s).hidden = s !== name; });
    $('hud').hidden = name !== 'play';
    $('undoBtn').hidden = name !== 'play';
    closeSheet();
    document.body.setAttribute('data-screen', name);
    if (name !== 'play') {
      game = null;
      if (Shell.caps.platform === 'web') Shell.banner(true);
    }
  }

  function setText(id, s) { var el = $(id); if (el) el.textContent = s; }

  // ---- home ----

  function showHome() {
    showScreen('home');
    today = islands.dayNumber();
    setText('homeDay', t('day', { n: today }));
    var st = progress.streakStatus(prog, today);
    setText('homeStreak', st.count ? t('streak', { n: st.count }) : (st.best ? t('streakBest', { n: st.best }) : t('streakNone')));
    var rec = prog.daily[today] && !prog.daily[today].archive ? prog.daily[today] : null;
    var run = todayRun();
    var island = islands.daily(today);
    var playBtn = $('playBtn');
    var doneLine = $('homeDone');
    if (rec && !(run && run.second)) {
      playBtn.textContent = t('viewToday');
      doneLine.hidden = false;
      renderScoreLine(doneLine, progress.bestOf(rec), island.par, island.gold);
    } else {
      playBtn.textContent = run ? t('continueToday') : t('playToday');
      doneLine.hidden = true;
    }
    // the streak repair offer: only while a rewarded ad is ready (or ad free)
    var offer = ads.rewardedOffer(Shell.caps);
    var repair = $('repairBtn');
    repair.hidden = !(st.repair && offer.show);
    repair.textContent = offer.take ? t('takeRepair', { n: st.count }) : t('watchRepair', { n: st.count });
    // continue an Atlas or archive island left half way
    var cont = $('continueBtn');
    var other = prog.run && islandById(prog.run.id);
    cont.hidden = !other;
    if (other) cont.textContent = t('continueIsland') + ': ' + (other.kind === 'daily' ? t('day', { n: other.day }) : t('island', { n: other.atlas }));
    // the canvas shows today's island: fogged, half carved or finished
    var b;
    if (rec && !(run && run.second)) b = rules.replay(island, progress.unpackMap(progress.bestMap(rec)));
    else b = rules.replay(island, progress.unpackMap(run ? run.map : ''));
    requestAnimationFrame(function () {
      if (screen !== 'home') return;
      setView('home', island, b);
    });
    setView('home', island, b);
  }

  function renderScoreLine(el, score, par, gold) {
    el.textContent = '';
    var s = document.createElement('span');
    s.className = 'big';
    s.textContent = String(score);
    el.appendChild(s);
    el.appendChild(icon(score >= par ? 'pennantOn' : 'pennant'));
    var p = document.createElement('span');
    p.textContent = String(par);
    p.setAttribute('aria-label', t('par', { n: par }));
    el.appendChild(p);
    if (gold) {
      el.appendChild(icon(score >= gold ? 'laurelOn' : 'laurel'));
      var g = document.createElement('span');
      g.textContent = String(gold);
      g.setAttribute('aria-label', t('gold', { n: gold }));
      el.appendChild(g);
    }
  }

  function icon(name) {
    var tpl = $('icon-' + name);
    var el = tpl ? tpl.content.firstElementChild.cloneNode(true) : document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  // ---- result ----

  function showResult(info) {
    showScreen('result');
    var title = info.mode === 'atlas' ? t('island', { n: info.atlas }) : t('day', { n: info.day });
    setText('resultTitle', title);
    var sub = [];
    if (info.second) sub.push(t('secondTry'));
    if (info.preview) sub.push(t('previewMark'));
    if (info.newBest) sub.push(t('newBest'));
    setText('resultSub', sub.join('. '));
    renderScoreLine($('resultScore'), info.score, info.par, info.gold);
    var starsEl = $('resultStars');
    starsEl.textContent = '';
    starsEl.hidden = info.mode !== 'atlas';
    if (info.mode === 'atlas') {
      var n = info.stars || progress.stars(info.score, info.par, info.gold);
      starsEl.setAttribute('aria-label', t('aria.stars', { n: n }));
      for (var k = 0; k < 3; k++) starsEl.appendChild(icon(k < n ? 'starOn' : 'star'));
    }
    var sc = info.board.score();
    setText('bdSeams', String(sc.seams + sc.shores));
    setText('bdClosures', String(sc.closures));
    setText('bdRiver', String(sc.river));
    $('bdRiverWrap').hidden = info.island.spring < 0;

    var c = Shell.caps;
    var offer = ads.rewardedOffer(c);
    var isToday = info.mode === 'daily' && info.day === today;
    $('shareBtn').hidden = !(info.mode !== 'atlas' && typeof Shell.share === 'function' && c.share);
    $('nextBtn').hidden = info.mode !== 'atlas';
    $('againBtn').hidden = info.mode !== 'atlas';
    $('todayBtn').hidden = !(info.mode === 'atlas' && !prog.daily[today]);
    $('archiveBackBtn').hidden = info.mode !== 'archive';
    $('resultAtlas').hidden = info.mode !== 'daily';
    var second = $('secondBtn');
    second.hidden = !(isToday && progress.secondTryAvailable(prog, today) && offer.show);
    second.textContent = offer.take ? t('takeSecond') : t('watchSecond');
    var offerBox = $('offerBox');
    offerBox.hidden = !info.offer;
    if (info.offer) $('offerBuyBtn').textContent = t('removeAdsPrice', { price: c.removeAdsPrice || '' }).replace(/, $/, '');
    var b = info.board;
    setView('result', info.island, b, { noFog: true });
    if (!info.view && !reduced()) frameAnim = now();
    else frameAnim = 0;
  }

  var frameAnim = 0;

  // ---- Atlas ----

  var thumbCache = {};

  function thumb(island, mapStr, size, state) {
    var key = island.id + ':' + mapStr + ':' + size + ':' + state + ':' + DPR;
    if (thumbCache[key]) return thumbCache[key];
    var c = art.canvas(size * DPR, size * DPR);
    var g = c.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    var b = rules.replay(island, progress.unpackMap(mapStr));
    var L = art.fit(island, 6, 6, size - 12, size - 12);
    var oldRes = DPR;
    art.setRes(DPR);
    if (state === 'locked') {
      g.globalAlpha = 0.45;
      art.drawLandBase(g, L);
      art.drawCoastline(g, L, 0.8, 0.6);
      g.globalAlpha = 1;
    } else {
      g.fillStyle = P.sea;
      g.fillRect(0, 0, size, size);
      art.drawMap(g, island, b, L, 0.8, { noSea: true, rings: 2, fogUnplaced: true });
    }
    art.setRes(oldRes);
    thumbCache[key] = c;
    return c;
  }

  function showAtlas() {
    showScreen('atlas');
    clearView();
    renderAtlas();
  }

  /** The Atlas pages; also redrawn in place (sheets and scroll kept) when the caps change. */
  // Thumbnails are drawn as they scroll into view, so a long Atlas opens at once.
  var thumbWatch = null;
  function watchThumb(c) {
    if (typeof IntersectionObserver !== 'function') { c.fcDraw(); return; }
    if (!thumbWatch) {
      thumbWatch = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          thumbWatch.unobserve(en.target);
          var draw = en.target.fcDraw;
          en.target.fcDraw = null;
          if (draw) draw();
        });
      }, { root: $('atlasList'), rootMargin: '400px 0px' });
    }
    thumbWatch.observe(c);
  }

  function renderAtlas() {
    var list = $('atlasList');
    if (thumbWatch) thumbWatch.disconnect();
    list.textContent = '';
    var open = progress.openPage(prog);
    var cont = $('atlasContinue');
    var runIsland = prog.run && !prog.run.archive && islandById(prog.run.id);
    cont.hidden = !runIsland;
    if (runIsland) cont.textContent = t('continueIsland') + ': ' + t('island', { n: runIsland.atlas });
    var offer = ads.rewardedOffer(Shell.caps);
    var previewN = progress.previewAvailable(prog, today) ? progress.previewTarget(prog) : 0;
    for (var p = open + 1; p >= 1; p--) {
      var page = document.createElement('div');
      page.className = 'page' + (p > open ? ' locked' : '');
      var h = document.createElement('h3');
      h.textContent = t('page', { n: p });
      page.appendChild(h);
      var row = document.createElement('div');
      row.className = 'isles';
      var first = islands.firstOfPage(p);
      for (var n = first; n < first + islands.PAGE_SIZE; n++) row.appendChild(atlasSlot(n, p > open && !prog.atlas.done[n]));
      page.appendChild(row);
      if (p > open) {
        var note = document.createElement('p');
        note.className = 'note';
        note.textContent = t('lockedPage', { n: open });
        page.appendChild(note);
        if (previewN && offer.show && islands.pageOf(previewN) === p) {
          var btn = document.createElement('button');
          btn.className = 'reward';
          btn.id = 'previewBtn';
          btn.textContent = offer.take ? t('takePreview') : t('watchPreview');
          btn.addEventListener('click', onPreview);
          page.appendChild(btn);
        }
      }
      list.appendChild(page);
    }
  }

  function atlasSlot(n, locked) {
    var island = islands.atlas(n);
    var done = prog.atlas.done[n];
    // the island a Preview island ad opened stays open on its locked page until it is finished
    var preview = locked && n === prog.atlas.previewIsland;
    if (preview) locked = false;
    var b = document.createElement('button');
    b.className = 'isle' + (done ? ' done' : '') + (locked ? ' locked' : '');
    b.disabled = locked;
    b.setAttribute('aria-label', t('island', { n: n }));
    var size = 92;
    var mapStr = done ? done.map : (prog.run && prog.run.id === island.id ? prog.run.map : '');
    var c = document.createElement('canvas');
    c.width = c.height = Math.max(1, Math.ceil(size * DPR));
    c.fcDraw = function () { c.getContext('2d').drawImage(thumb(island, mapStr, size, locked ? 'locked' : 'open'), 0, 0); };
    b.appendChild(c);
    watchThumb(c);
    var label = document.createElement('span');
    label.className = 'num';
    label.textContent = String(n);
    b.appendChild(label);
    if (done) {
      var st = document.createElement('span');
      st.className = 'stars';
      for (var k = 0; k < 3; k++) st.appendChild(icon(k < done.stars ? 'starOn' : 'star'));
      b.appendChild(st);
    }
    if (!locked) {
      b.addEventListener('click', function () {
        audio.play('ui');
        if (done && !(prog.run && prog.run.id === island.id)) showAtlasResult(n);
        else startAtlas(n, preview);
      });
    }
    return b;
  }

  function onPreview(e) {
    var btn = e.currentTarget;
    if (busy) return;
    busy = true;
    btn.disabled = true;
    Shell.rewarded('preview_island').then(function (r) {
      busy = false;
      btn.disabled = false;
      if (r.granted) {
        var n = progress.usePreview(prog, today);
        persist();
        if (n) startAtlas(n, true);
      } else {
        toast(r.reason === 'skipped' ? t('rewardSkipped') : t('rewardNo'));
        if (screen === 'atlas') keepScroll('atlasList', renderAtlas);
      }
    });
  }

  // ---- Archive ----

  var MONTHS = FC.strings.months;

  function showArchive() {
    showScreen('archive');
    clearView();
    renderArchive();
  }

  /** The archive days; also redrawn in place (sheets and scroll kept) when the caps change. */
  function renderArchive() {
    today = islands.dayNumber();
    var c = Shell.caps;
    var android = c.platform === 'android';
    var left = $('archiveLeft');
    left.hidden = !android || c.adFree;
    left.textContent = progress.archiveLeft(prog, today) > 0 ? t('archiveLeft', { n: progress.archiveLeft(prog, today) }) : t('archiveNoneLeft');
    $('archiveWeb').hidden = android;
    var list = $('archiveList');
    list.textContent = '';
    var month = null, grid = null;
    for (var d = today - 1; d >= 1; d--) {
      var date = islands.dateOfDay(d);
      var mk = date.y + '-' + date.m;
      if (mk !== month) {
        month = mk;
        var h = document.createElement('h3');
        h.textContent = MONTHS[date.m - 1] + ' ' + date.y;
        list.appendChild(h);
        grid = document.createElement('div');
        grid.className = 'days';
        list.appendChild(grid);
      }
      grid.appendChild(archiveDay(d, date));
    }
    if (today <= 1) {
      var p = document.createElement('p');
      p.className = 'note';
      p.textContent = t('day', { n: 1 });
      list.appendChild(p);
    }
  }

  function archiveDay(d, date) {
    var rec = prog.daily[d];
    var island = islands.daily(d);
    var b = document.createElement('button');
    b.className = 'day' + (rec ? ' played' : '') + (rec && progress.bestOf(rec) >= island.par ? ' par' : '') + (prog.archive.open[d] ? ' open' : '');
    b.setAttribute('aria-label', t('day', { n: d }));
    var n = document.createElement('span');
    n.className = 'dnum';
    n.textContent = String(date.d);
    b.appendChild(n);
    var s = document.createElement('span');
    s.className = 'dscore';
    s.textContent = rec ? String(progress.bestOf(rec)) : '#' + d;
    b.appendChild(s);
    b.addEventListener('click', function () { audio.play('ui'); openArchiveDay(d); });
    return b;
  }

  function openArchiveDay(d) {
    if (prog.daily[d]) { showResultFor(d); return; }
    var c = Shell.caps;
    var run = prog.run && prog.run.id === 'd' + d;
    if (run || progress.archiveOpen(prog, d, today, c.adFree && c.platform === 'android')) { startArchive(d); return; }
    openSheet('unlock', d);
  }

  // ---- sheets ----

  function openSheet(kind, arg) {
    sheet = kind;
    var el = $('sheet');
    el.hidden = false;
    ['settingsPanel', 'pausePanel', 'unlockPanel'].forEach(function (id) { $(id).hidden = true; });
    if (kind === 'settings') { fillSettings(); $('settingsPanel').hidden = false; }
    if (kind === 'pause') { fillPause(); $('pausePanel').hidden = false; }
    if (kind === 'unlock') { fillUnlock(arg); $('unlockPanel').hidden = false; }
    var first = el.querySelector('.panel:not([hidden]) button');
    if (first && first.focus) first.focus({ preventScroll: true });
  }

  function closeSheet() {
    sheet = null;
    $('sheet').hidden = true;
  }

  function fillSettings() {
    var c = Shell.caps;
    $('soundToggle').setAttribute('aria-pressed', prog.sound ? 'true' : 'false');
    setText('soundState', prog.sound ? t('on') : t('off'));
    $('motionToggle').setAttribute('aria-pressed', prog.reduced ? 'true' : 'false');
    setText('motionState', prog.reduced ? t('on') : t('off'));
    var showBuy = ads.removeAdsVisible(c);
    $('buyBtn').hidden = !showBuy;
    $('buyWhat').hidden = !showBuy;
    $('buyBtn').textContent = c.removeAdsPrice ? t('removeAdsPrice', { price: c.removeAdsPrice }) : t('removeAds');
    $('restoreBtn').hidden = !c.removeAds;
    $('adFreeLine').hidden = !(c.adFree && c.platform === 'android');
    // Privacy options: only while the consent SDK says the entry is required
    $('privacyBtn').hidden = !c.privacyOptions;
  }

  function fillPause() {
    $('pauseSound').setAttribute('aria-pressed', prog.sound ? 'true' : 'false');
    setText('pauseSoundState', prog.sound ? t('on') : t('off'));
  }

  function fillUnlock(d) {
    var c = Shell.caps;
    var offer = ads.rewardedOffer(c);
    setText('unlockTitle', t('day', { n: d }));
    var btn = $('unlockBtn');
    var left = progress.archiveLeft(prog, today);
    var android = c.platform === 'android';
    btn.hidden = !(android && offer.show && left > 0);
    btn.textContent = t('watchArchive');
    btn.setAttribute('data-day', String(d));
    var note = $('unlockNote');
    if (!android) note.textContent = t('archiveWeb');
    else if (left <= 0) note.textContent = t('archiveNoneLeft');
    else note.textContent = offer.show ? t('archiveLeft', { n: left }) : t('adNotReady');
    $('unlockAbout').hidden = android;
  }

  /** Redraw a scrolling list without moving it. */
  function keepScroll(id, render) {
    var el = $(id);
    var top = el ? el.scrollTop : 0;
    render();
    if (el) el.scrollTop = top;
  }

  var toastTimer = 0;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); }, 3200);
  }

  // ---- HUD ----

  var shownScore = 0;
  function updateHud(instant) {
    if (!game) return;
    var b = game.board;
    var total = view && view.sc ? view.sc.total : b.total();
    var left = b.island.tiles.length - b.history.length;
    setText('hudLeft', String(left));
    setText('hudPar', String(game.island.par));
    $('hudPennant').classList.toggle('on', total >= game.island.par);
    if (instant) { shownScore = total; setText('hudScore', String(total)); }
    $('undoBtn').disabled = !game.lastUndoable || !!game.tutorial || game.finished ||
      (!!game.island.tutorial && b.history.length <= 3);
  }

  function tickHud() {
    if (screen !== 'play' || !view || !view.sc) return;
    var target = view.sc.total;
    if (shownScore !== target) {
      shownScore += shownScore < target ? 1 : -1;
      setText('hudScore', String(shownScore));
      dirty = true;
    }
  }

  function positionTrayButtons() {
    if (!view || !view.lay || view.kind !== 'play') return;
    var u = view.lay.undo;
    var btn = $('undoBtn');
    btn.style.left = Math.round(u.x - 26) + 'px';
    btn.style.top = Math.round(u.y - 26) + 'px';
  }

  // =====================================================================================
  // Input on the board and tray
  // =====================================================================================

  var ptr = null; // { id, x0, y0, t0, kind: 'tray'|'board'|'none', moved, cell }

  function trayHit(x, y) {
    if (!view || view.kind !== 'play') return false;
    var tr = view.lay.tray;
    var dx = x - tr.x, dy = y - tr.y;
    return dx * dx + dy * dy <= Math.pow(tr.s * 1.25, 2);
  }

  function cellAt(x, y) {
    if (!view || !view.lay) return -1;
    var L = view.lay.L;
    var h = hex.pixelToHex(x - L.ox, y - L.oy, L.s);
    var i = view.board.index[hex.key(h.q, h.r)];
    return i === undefined ? -1 : i;
  }

  /** The open cell nearest to a lifted tile at (x, y), within reach. */
  function snapCell(x, y) {
    var L = view.lay.L, b = view.board;
    var best = -1, bestD = Infinity;
    for (var i = 0; i < b.n; i++) {
      if (!b.isOpen(i)) continue;
      if (game.tutorial && b.history.length < game.tutorial.length && game.tutorial[b.history.length].cell !== i) continue;
      var c = art.cellXY(L, i);
      var d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return bestD <= L.s * 1.05 ? best : -1;
  }

  function liftOffset() {
    var s = view.lay.L.s;
    return { x: 0, y: -(s * 0.9 + 26) };
  }

  cv.addEventListener('pointerdown', function (e) {
    audio.unlock();
    if (screen !== 'play' || !game || game.finished || sheet || busy) return;
    if (ptr) return;
    var x = e.clientX, y = e.clientY;
    if (trayHit(x, y)) {
      ptr = { id: e.pointerId, x0: x, y0: y, kind: 'tray', moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old WebView */ }
    } else {
      ptr = { id: e.pointerId, x0: x, y0: y, kind: 'board', moved: false, cell: cellAt(x, y) };
    }
    e.preventDefault();
  });

  cv.addEventListener('pointermove', function (e) {
    if (!ptr || e.pointerId !== ptr.id || !game) return;
    var x = e.clientX, y = e.clientY;
    if (ptr.kind === 'tray') {
      if (!ptr.moved && Math.hypot(x - ptr.x0, y - ptr.y0) > 8) {
        ptr.moved = true;
        game.pending = -1;
        audio.play('pick');
      }
      if (ptr.moved) {
        var lo = liftOffset();
        var gx = x + lo.x, gy = y + lo.y;
        var cell = snapCell(gx, gy);
        if (cell !== (game.drag && game.drag.cell)) {
          game.drag = { x: gx, y: gy, cell: cell, gain: cell >= 0 ? game.board.gainIf(cell, game.turn, view.sc.total) : 0 };
        } else {
          game.drag.x = gx; game.drag.y = gy;
        }
        dirty = true;
      }
    } else if (!ptr.moved && Math.hypot(x - ptr.x0, y - ptr.y0) > 12) {
      ptr.moved = true;
    }
  });

  function endPointer(e, cancelled) {
    if (!ptr || e.pointerId !== ptr.id) return;
    var p = ptr;
    ptr = null;
    if (!game) return;
    if (p.kind === 'tray') {
      if (p.moved) {
        var d = game.drag;
        game.drag = null;
        if (!cancelled && d && d.cell >= 0) placeAt(d.cell, game.turn);
        else if (d) returnToTray(d);
      } else if (!cancelled) {
        rotate();
      }
      dirty = true;
      return;
    }
    if (cancelled || p.moved) return;
    // a tap on the board: park the tile on an open cell, tap it again to place
    var cell = cellAt(e.clientX, e.clientY);
    if (cell >= 0 && game.board.isOpen(cell)) {
      if (game.pending === cell) {
        placeAt(cell, game.turn);
      } else {
        if (game.tutorial && game.board.history.length < game.tutorial.length && game.tutorial[game.board.history.length].cell !== cell) {
          refuse(cell);
          return;
        }
        game.pending = cell;
        game.pendingGain = game.board.gainIf(cell, game.turn, view.sc.total);
        audio.play('pick');
        Shell.haptic('tap');
      }
    } else {
      game.pending = -1;
    }
    dirty = true;
  }

  cv.addEventListener('pointerup', function (e) { endPointer(e, false); });
  cv.addEventListener('pointercancel', function (e) { endPointer(e, true); });

  function returnToTray(d) {
    var tr = view.lay.tray;
    var code = currentTile();
    var turn = game.turn;
    anims.push({ t0: now(), dur: 180, draw: function (p) {
      var q = 1 - Math.pow(1 - p, 3);
      var x = d.x + (tr.x - d.x) * q, y = d.y + (tr.y - d.y) * q;
      var s = view.lay.L.s + (tr.s - view.lay.L.s) * q;
      if (code >= 0) art.drawCachedTile(ctx, code, turn, s, 1, x, y, 0.9);
    } });
  }

  cv.addEventListener('wheel', function (e) {
    if (screen === 'play' && !sheet) { e.preventDefault(); rotate(); }
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (screen !== 'play' || sheet || !game) return;
    if (e.key === 'r' || e.key === 'R' || e.key === ' ') { e.preventDefault(); rotate(); }
    else if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); }
  });

  // =====================================================================================
  // The frame
  // =====================================================================================

  function ease(p) { return 1 - Math.pow(1 - p, 3); }
  function easeBack(p) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }

  function fogActive() {
    if (!view || !view.lay) return false;
    for (var i = 0; i < view.board.n; i++) if (view.fogA[i] > 0.01) return true;
    return false;
  }

  // A 120 Hz screen would redraw the whole canvas twice as often as the eye needs, on two busy cores:
  // draw at most 60 times a second while something moves, and 30 while only the fog drifts (it moves
  // well under a pixel a frame). Input is handled in its own events; this only paces the drawing.
  var FRAME_MS = 1000 / 60, DRIFT_MS = 1000 / 30;
  var lastDraw = -1e9;

  function frame(ts) {
    requestAnimationFrame(frame);
    var tnow = now();
    var moving = dirty || anims.length || parts.length || pops.length || flashes.length ||
      (game && (game.drag || game.tutorial || game.pending >= 0)) || veil.t0 + veil.dur > tnow ||
      shakeT0 + 200 > tnow || hasFogAnim() || stampsLive(tnow) || (frameAnim && view && view.kind === 'result' && view.frameBox && layers.box) || (game && game.trayTurnAnim + 200 > tnow) ||
      hudCounting();
    if (!moving && (reduced() || !fogActive())) return;
    var step = moving ? FRAME_MS : DRIFT_MS;
    if (ts - lastDraw + 3 < step) return;
    lastDraw = ts - lastDraw < step + 10 ? lastDraw + step : ts;
    if (frames.last) {
      var dt = tnow - frames.last;
      if (dt > step * 1.5) frames.slow++;
      if (dt > frames.worst && frames.n > 30) frames.worst = dt;
    }
    frames.last = tnow;
    frames.n++;
    tickHud();
    dirty = false;
    draw(tnow);
  }

  function hudCounting() {
    return screen === 'play' && !!view && !!view.sc && shownScore !== view.sc.total;
  }

  function hasFogAnim() {
    return view && Object.keys(view.fogAnim).length > 0;
  }

  function stampsLive(tn) {
    for (var k in stamps) if (stamps[k] + 500 > tn) return true;
    return false;
  }

  function draw(tn) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (layers.bg) ctx.drawImage(layers.bg, 0, 0);
    if (!view || !view.lay || !layers.box) {
      drawVeil(tn);
      return;
    }
    var shake = 0, sx = 0, sy = 0;
    if (shakeT0 + 180 > tn) {
      shake = (1 - (tn - shakeT0) / 180) * 2;
      sx = (Math.random() - 0.5) * 2 * shake;
      sy = (Math.random() - 0.5) * 2 * shake;
    }
    ctx.setTransform(DPR, 0, 0, DPR, sx * DPR, sy * DPR);
    var b = layers.box;
    if (layers.land) ctx.drawImage(layers.land, b.x, b.y, b.w, b.h);
    drawFlashes(tn);
    drawFog(tn);
    if (layers.coast) ctx.drawImage(layers.coast, b.x, b.y, b.w, b.h);
    drawLandmarks(tn);
    drawAnims(tn);
    drawParts(tn);
    drawPops(tn);
    if (view.kind === 'play' && game) {
      drawTargets(tn);
      drawGhost(tn);
      drawTray(tn);
      drawHand(tn);
    }
    if (view.kind === 'result' && view.frameBox) drawResultFrame(tn);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawVeil(tn);
  }

  function drawFlashes(tn) {
    if (!flashes.length) return;
    var L = view.lay.L;
    flashes = flashes.filter(function (f) { return tn < f.t0 + f.dur; });
    flashes.forEach(function (f) {
      var p = (tn - f.t0) / f.dur;
      if (p < 0) return;
      ctx.save();
      ctx.globalAlpha = Math.sin(Math.min(1, p) * Math.PI);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      for (var k = 0; k < f.slots.length; k++) {
        var i = Math.floor(f.slots[k] / 6), d = f.slots[k] % 6;
        var c = art.cellXY(L, i);
        var ec = hex.edgeCorners(d, L.s);
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + ec[0].x, c.y + ec[0].y);
        ctx.lineTo(c.x + ec[1].x, c.y + ec[1].y);
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    });
  }

  var fogPattern = null, fogPattern2 = null;
  function drawFog(tn) {
    var v = view;
    var L = v.lay.L, b = layers.box, fc = layers.fog;
    if (!fc) return;
    var any = false, lifting = false;
    for (var i in v.fogAnim) {
      lifting = true;
      var a = v.fogAnim[i];
      var p = Math.min(1, (tn - a.t0) / a.dur);
      v.fogA[i] = a.from + (a.to - a.from) * (a.to < a.from ? p * p : ease(p));
      if (p >= 1) { v.fogA[i] = a.to; delete v.fogAnim[i]; }
    }
    for (var j = 0; j < v.board.n; j++) if (v.fogA[j] > 0.01) { any = true; break; }
    if (!any) return;
    var k = fc.width / b.w;
    // the fog's shape (one puff per fogged cell) is drawn once and kept until fog lifts or falls again
    var mask = layers.fogMask;
    if (!mask || lifting) {
      if (!mask) mask = layers.fogMask = art.canvas(fc.width, fc.height);
      var mg = mask.getContext('2d');
      mg.clearRect(0, 0, mask.width, mask.height);
      var puff = art.puff();
      for (var m = 0; m < v.board.n; m++) {
        var al = v.fogA[m];
        if (al <= 0.01) continue;
        var c = art.cellXY(L, m);
        var carving = v.fogAnim[m] && v.fogAnim[m].to === 0;
        var R = L.s * 1.22 * (carving && !reduced() ? 1 + (1 - al) * 0.6 : 1) * k;
        mg.globalAlpha = Math.min(1, al);
        mg.drawImage(puff, (c.x - b.x) * k - R, (c.y - b.y) * k - R, R * 2, R * 2);
      }
      mg.globalAlpha = 1;
    }
    var fg = fc.getContext('2d');
    fg.setTransform(1, 0, 0, 1, 0, 0);
    fg.globalCompositeOperation = 'source-over';
    fg.clearRect(0, 0, fc.width, fc.height);
    fg.drawImage(mask, 0, 0);
    {
      // the cloud texture always shades the fog; it only drifts when motion is allowed
      if (!fogPattern) {
        fogPattern = fg.createPattern(art.cloud(), 'repeat');
        fogPattern2 = fg.createPattern(art.cloud(), 'repeat');
      }
      var sec = reduced() ? 7 : tn / 1000;
      fg.globalCompositeOperation = 'source-atop';
      if (fogPattern.setTransform) fogPattern.setTransform(new DOMMatrix().translate(sec * 7 % 128, sec * 2.5 % 128).scale(1.4));
      fg.fillStyle = fogPattern;
      fg.globalAlpha = 0.9;
      fg.fillRect(0, 0, fc.width, fc.height);
      if (fogPattern2.setTransform) fogPattern2.setTransform(new DOMMatrix().translate(-sec * 4.5 % 128, sec * 1.5 % 128).scale(0.9));
      fg.fillStyle = fogPattern2;
      fg.globalAlpha = 0.6;
      fg.fillRect(0, 0, fc.width, fc.height);
      fg.globalAlpha = 1;
      fg.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(fc, b.x, b.y, b.w, b.h);
  }

  function drawLandmarks(tn) {
    var marks = view.marks || [];
    var k = view.lay.L.s * 0.62;
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      var st = stamps[m.key];
      if (st == null) { stamps[m.key] = tn; st = tn; }
      var p = Math.min(1, (tn - st) / 420);
      if (p < 0) continue;
      var sc = reduced() ? 1 : (p < 1 ? 1.9 - 0.9 * easeBack(p) : 1);
      ctx.globalAlpha = reduced() ? Math.min(1, p * 2) : Math.min(1, p * 3);
      art.drawLandmark(ctx, m.kind, m.x, m.y, k, 1, sc);
      ctx.globalAlpha = 1;
      if (p < 1 && !reduced()) {
        ctx.save();
        ctx.strokeStyle = P.vermilion;
        ctx.globalAlpha = 1 - p;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, k * (0.4 + p * 0.9), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawAnims(tn) {
    anims = anims.filter(function (a) { return tn < a.t0 + a.dur; });
    for (var i = 0; i < anims.length; i++) {
      var a = anims[i];
      var p = (tn - a.t0) / a.dur;
      if (p < 0) continue;
      a.draw(p, tn);
    }
  }

  function drawParts(tn) {
    if (!parts.length) return;
    var puff = art.puff();
    parts = parts.filter(function (q) { return tn < q.t0 + q.life; });
    for (var i = 0; i < parts.length; i++) {
      var q = parts[i];
      var age = (tn - q.t0) / 1000;
      var p = (tn - q.t0) / q.life;
      var drag = Math.exp(-age * 2.2);
      var x = q.x + q.vx * (1 - drag) / 2.2, y = q.y + q.vy * (1 - drag) / 2.2;
      if (q.kind === 'wisp') {
        x += Math.sin(age * 3 + q.spin * 4) * 6 * age;
        var r = q.r * (1 + p * 1.2);
        ctx.globalAlpha = 0.75 * (1 - p) * (1 - p);
        ctx.drawImage(puff, x - r, y - r, r * 2, r * 2);
      } else {
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = P.ink;
        ctx.beginPath();
        ctx.arc(x, y, q.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawPops(tn) {
    pops = pops.filter(function (q) { return tn < q.t0 + q.dur; });
    for (var i = 0; i < pops.length; i++) {
      var q = pops[i];
      var p = (tn - q.t0) / q.dur;
      if (p < 0) continue;
      var y = q.y - (reduced() ? 0 : ease(Math.min(1, p * 1.4)) * 30);
      ctx.save();
      ctx.globalAlpha = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
      ctx.font = (q.big ? '600 30px ' : '600 22px ') + art.FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(232,234,225,0.9)';
      ctx.strokeText(q.text, q.x, y);
      ctx.fillStyle = q.big ? P.vermilion : P.ink;
      ctx.fillText(q.text, q.x, y);
      ctx.restore();
    }
  }

  /** Edge marks for a tile that would sit on cell i turned t: matches ticked, clashes marked. */
  function drawEdgeHints(i, turn, code) {
    var L = view.lay.L, b = view.board;
    var c = art.cellXY(L, i);
    for (var d = 0; d < 6; d++) {
      var e = rules.edgeAt(code, turn, d);
      var j = b.nb[i * 6 + d];
      var state = 0;
      if (j < 0) state = (e === rules.C || e === rules.R) ? 1 : 0;
      else if (b.code[j] >= 0) state = b.e[j * 6 + (d + 3) % 6] === e ? 1 : -1;
      if (!state) continue;
      var ec = hex.edgeCorners(d, L.s * 0.97);
      ctx.beginPath();
      ctx.moveTo(c.x + ec[0].x * 0.82 + ec[1].x * 0.18, c.y + ec[0].y * 0.82 + ec[1].y * 0.18);
      ctx.lineTo(c.x + ec[0].x * 0.18 + ec[1].x * 0.82, c.y + ec[0].y * 0.18 + ec[1].y * 0.82);
      ctx.lineCap = 'round';
      if (state > 0) { ctx.strokeStyle = P.ink; ctx.lineWidth = 4; }
      else { ctx.strokeStyle = P.vermilion; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function gainLabel(x, y, gain) {
    var text = '+' + gain;
    ctx.save();
    ctx.font = '600 20px ' + art.FONT;
    var w = ctx.measureText(text).width + 18;
    ctx.beginPath();
    roundRect(ctx, x - w / 2, y - 15, w, 30, 15);
    ctx.fillStyle = gain > 0 ? P.ink : 'rgba(31,43,42,0.55)';
    ctx.fill();
    ctx.fillStyle = P.paper;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  function drawGhost(tn) {
    var code = currentTile();
    if (code < 0) return;
    var L = view.lay.L;
    var d = game.drag;
    if (d) {
      if (d.cell >= 0) {
        var c = art.cellXY(L, d.cell);
        art.drawCachedTile(ctx, code, game.turn, L.s, 1, c.x, c.y, 0.92);
        drawEdgeHints(d.cell, game.turn, code);
        gainLabel(c.x, c.y - L.s * 1.15, d.gain);
      }
      // the lifted tile under the finger
      ctx.save();
      ctx.globalAlpha = d.cell >= 0 ? 0.35 : 0.95;
      ctx.shadowColor = 'rgba(31,43,42,0.35)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;
      ctx.beginPath();
      art.hexPath(ctx, L.s * 0.98, d.x, d.y);
      ctx.fillStyle = P.paper;
      ctx.fill();
      ctx.restore();
      art.drawCachedTile(ctx, code, game.turn, L.s, 1, d.x, d.y, d.cell >= 0 ? 0.35 : 1);
      return;
    }
    if (game.pending >= 0) {
      var cp = art.cellXY(L, game.pending);
      var pulse = reduced() ? 0.85 : 0.75 + 0.15 * Math.sin(tn / 180);
      art.drawCachedTile(ctx, code, game.turn, L.s, 1, cp.x, cp.y, pulse);
      ctx.beginPath();
      art.hexPath(ctx, L.s * 0.99, cp.x, cp.y);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      drawEdgeHints(game.pending, game.turn, code);
      gainLabel(cp.x, cp.y - L.s * 1.15, game.board.gainIf(game.pending, game.turn, view.sc.total));
    }
  }

  function drawTargets(tn) {
    if (!game.tutorial) return;
    var b = game.board;
    var step = game.tutorial[b.history.length];
    if (!step) return;
    var L = view.lay.L;
    var c = art.cellXY(L, step.cell);
    var p = reduced() ? 0.6 : 0.5 + 0.5 * Math.sin(tn / 260);
    ctx.save();
    ctx.strokeStyle = P.vermilion;
    ctx.globalAlpha = 0.45 + 0.45 * p;
    ctx.lineWidth = 3;
    ctx.beginPath();
    art.hexPath(ctx, L.s * (0.84 + 0.06 * p), c.x, c.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawTray(tn) {
    var tr = view.lay.tray;
    var code = currentTile();
    if (code >= 0 && !(game.drag)) {
      var ang = 0;
      if (game.trayTurnAnim && !reduced()) {
        var p = Math.min(1, (tn - game.trayTurnAnim) / 160);
        ang = -(1 - ease(p)) * Math.PI / 3;
      }
      ctx.save();
      ctx.translate(tr.x, tr.y);
      ctx.rotate(ang);
      if (game.pending >= 0) ctx.globalAlpha = 0.45;
      art.drawCachedTile(ctx, code, game.turn, tr.s, 1, 0, 0);
      ctx.restore();
      // turn arrow
      ctx.save();
      ctx.strokeStyle = 'rgba(31,43,42,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.s * 1.12, -Math.PI * 0.42, -Math.PI * 0.12);
      ctx.stroke();
      var ax = tr.x + Math.cos(-Math.PI * 0.12) * tr.s * 1.12, ay = tr.y + Math.sin(-Math.PI * 0.12) * tr.s * 1.12;
      ctx.beginPath();
      ctx.moveTo(ax - 6, ay - 5); ctx.lineTo(ax, ay); ctx.lineTo(ax + 1, ay - 8);
      ctx.stroke();
      ctx.restore();
    }
    for (var k = 0; k < 2; k++) {
      var nc = game.board.upcoming(k + 1);
      if (nc < 0) continue;
      var n = view.lay.next[k];
      art.drawCachedTile(ctx, nc, 0, n.s, 1, n.x, n.y + tr.s * 0.5, k === 0 ? 0.85 : 0.6);
    }
  }

  /** The wordless tutorial hand: a drag from the tray to the glowing cell, or a tap to turn the tile. */
  function drawHand(tn) {
    if (!game.tutorial || game.drag || game.pending >= 0) return;
    var b = game.board;
    var step = game.tutorial[b.history.length];
    if (!step) return;
    var tr = view.lay.tray;
    var L = view.lay.L;
    var target = art.cellXY(L, step.cell);
    var needTurn = game.turn !== step.turn;
    var period = needTurn ? 1100 : 1900;
    var p = ((tn - veil.t0) % period) / period;
    var x, y, press;
    if (needTurn) {
      x = tr.x + tr.s * 0.35; y = tr.y + tr.s * 0.35;
      press = p > 0.35 && p < 0.55;
    } else {
      var q = Math.min(1, Math.max(0, (p - 0.15) / 0.6));
      var e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
      var sx = tr.x, sy = tr.y, ex = target.x, ey = target.y - liftOffset().y;
      x = sx + (ex - sx) * e;
      y = sy + (ey - sy) * e - Math.sin(e * Math.PI) * 40;
      press = p > 0.1 && p < 0.8;
      if (q > 0 && q < 1) art.drawCachedTile(ctx, currentTile(), game.turn, L.s * 0.9, 1, x, y + liftOffset().y, 0.35);
    }
    var fade = p < 0.08 ? p / 0.08 : p > 0.9 ? (1 - p) / 0.1 : 1;
    ctx.save();
    ctx.globalAlpha = 0.9 * fade;
    ctx.beginPath();
    ctx.arc(x, y, press ? 13 : 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232,234,225,0.85)';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = P.ink;
    ctx.stroke();
    if (press) {
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.5 * fade;
      ctx.stroke();
    }
    ctx.restore();
    if (needTurn) {
      // a turning arrow round the tray tile
      ctx.save();
      ctx.strokeStyle = P.vermilion;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(tn / 200);
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.s * 1.18, -Math.PI * 0.7, Math.PI * 0.1);
      ctx.stroke();
      var ax = tr.x + Math.cos(Math.PI * 0.1) * tr.s * 1.18, ay = tr.y + Math.sin(Math.PI * 0.1) * tr.s * 1.18;
      ctx.beginPath();
      ctx.moveTo(ax + 7, ay - 8); ctx.lineTo(ax, ay); ctx.lineTo(ax - 9, ay - 4);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawResultFrame(tn) {
    var f = view.frameBox;
    var p = frameAnim ? Math.min(1, (tn - frameAnim) / 800) : 1;
    ctx.save();
    if (p < 1) {
      var per = 2 * (f.w + f.h);
      ctx.setLineDash([per * ease(p), per]);
    }
    art.drawFrame(ctx, f.x, f.y, f.w, f.h, 1);
    ctx.restore();
    // the loop keeps drawing until the whole frame is down, however slow the device's frames are
    if (p >= 1) frameAnim = 0;
  }

  function drawVeil(tn) {
    if (!(veil.t0 + veil.dur > tn)) return;
    var p = (tn - veil.t0) / veil.dur;
    ctx.save();
    ctx.globalAlpha = 1 - ease(p);
    ctx.fillStyle = P.fog;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // =====================================================================================
  // Buttons
  // =====================================================================================

  function on(id, fn) {
    $(id).addEventListener('click', function (e) {
      audio.unlock();
      if (busy) return;
      audio.play('ui');
      fn(e);
    });
  }

  on('playBtn', function () { startDaily(false); });
  on('continueBtn', function () {
    var r = prog.run;
    if (!r) return;
    var isl = islandById(r.id);
    if (!isl) { prog.run = null; persist(); showHome(); return; }
    if (isl.kind === 'daily') startArchive(isl.day); else startAtlas(isl.atlas, r.preview);
  });
  on('atlasBtn', showAtlas);
  on('archiveBtn', showArchive);
  on('settingsBtn', function () { openSheet('settings'); });
  on('atlasHome', showHome);
  on('archiveHome', showHome);
  on('atlasContinue', function () {
    var r = prog.run;
    var isl = r && islandById(r.id);
    if (isl && isl.kind === 'atlas') startAtlas(isl.atlas, r.preview);
  });
  on('pauseBtn', function () { if (game && !game.finished) openSheet('pause'); });
  $('undoBtn').addEventListener('click', function () { audio.unlock(); undo(); });

  on('resultHome', showHome);
  on('resultAtlas', showAtlas);
  on('archiveBackBtn', showArchive);
  on('todayBtn', function () { startDaily(false); });
  on('againBtn', function () {
    if (!lastResult || lastResult.mode !== 'atlas') return;
    prog.run = null;
    startAtlas(lastResult.atlas);
  });
  on('nextBtn', function () {
    var info = lastResult;
    if (!info || info.mode !== 'atlas') return;
    var next = progress.nextAtlas(prog);
    var go = function () { startAtlas(next); };
    // the one interstitial placement: Next on a finished Atlas island, by the game's own rules
    if (!info.view && ads.interstitialDue(Shell.caps, prog, { kind: 'atlas', rewardedThisBreak: !!info.rewarded, preview: info.preview })) {
      busy = true;
      $('nextBtn').disabled = true;
      Shell.interstitial('atlas_next').then(function (r) {
        busy = false;
        $('nextBtn').disabled = false;
        ads.afterInterstitial(prog, r);
        persist();
        go();
      });
    } else {
      go();
    }
  });

  // Share: straight from the tap, no await before Shell.share (Web Share needs the tap's activation).
  $('shareBtn').addEventListener('click', function () {
    var info = lastResult;
    if (!info || busy) return;
    var data = { day: info.day, score: info.score, par: info.par, gold: info.gold, second: info.second };
    var png = null;
    try {
      art.setRes(1);
      png = share.card(info.island, info.board, data).toDataURL('image/png');
    } catch (e) {
      png = null;
    } finally {
      art.setRes(DPR);
    }
    var payload = { text: share.line(data), url: share.PLAY_URL };
    if (png) payload.png = png;
    Shell.share(payload).then(function (r) {
      toast(t('shared.' + (r.reason || 'failed')));
    });
  });

  on('secondBtn', function () {
    var btn = $('secondBtn');
    busy = true;
    btn.disabled = true;
    Shell.rewarded('second_try').then(function (r) {
      busy = false;
      btn.disabled = false;
      if (lastResult) lastResult.rewarded = true;
      if (r.granted && progress.secondTryAvailable(prog, today)) {
        prog.secondTryDay = today;
        prog.dailyRun = { day: today, map: '', second: true };
        persist();
        startIsland(islands.daily(today), 'daily', { second: true });
      } else if (!r.granted) {
        toast(r.reason === 'skipped' ? t('rewardSkipped') : t('rewardNo'));
        if (lastResult) showResult(lastResult);
      }
    });
  });

  on('repairBtn', function () {
    var btn = $('repairBtn');
    busy = true;
    btn.disabled = true;
    Shell.rewarded('streak_repair').then(function (r) {
      busy = false;
      btn.disabled = false;
      if (r.granted) {
        progress.repairStreak(prog, today);
        persist();
      } else {
        toast(r.reason === 'skipped' ? t('rewardSkipped') : t('rewardNo'));
      }
      showHome();
    });
  });

  on('unlockBtn', function () {
    var d = +$('unlockBtn').getAttribute('data-day');
    var btn = $('unlockBtn');
    busy = true;
    btn.disabled = true;
    Shell.rewarded('archive_day').then(function (r) {
      busy = false;
      btn.disabled = false;
      if (r.granted && progress.unlockArchive(prog, d, today)) {
        persist();
        closeSheet();
        startArchive(d);
      } else if (r.granted && Shell.caps.adFree) {
        closeSheet();
        startArchive(d);
      } else {
        toast(r.reason === 'skipped' ? t('rewardSkipped') : t('rewardNo'));
        fillUnlock(d);
      }
    });
  });
  on('unlockClose', closeSheet);

  function buy(btn) {
    busy = true;
    btn.disabled = true;
    Shell.buyRemoveAds().then(function (r) {
      busy = false;
      btn.disabled = false;
      toast(t('buy.' + (r.reason in FC.strings.buy ? r.reason : 'failed')));
      if (sheet === 'settings') fillSettings();
      if (screen === 'result') $('offerBox').hidden = true;
    });
  }
  on('buyBtn', function () { buy($('buyBtn')); });
  on('offerBuyBtn', function () { buy($('offerBuyBtn')); });
  on('offerNotNow', function () { $('offerBox').hidden = true; });
  on('restoreBtn', function () {
    var btn = $('restoreBtn');
    busy = true;
    btn.disabled = true;
    Shell.restore().then(function (r) {
      busy = false;
      btn.disabled = false;
      toast(r.ok && r.adFree ? t('restored') : r.ok ? t('restoreNone') : t('restoreFailed'));
      fillSettings();
    });
  });
  on('privacyBtn', function () {
    Shell.privacyOptions().then(function () { fillSettings(); });
  });
  on('soundToggle', function () { setSound(!prog.sound); fillSettings(); });
  on('pauseSound', function () { setSound(!prog.sound); fillPause(); });
  on('motionToggle', function () { prog.reduced = !prog.reduced; persist(); applyMotionClass(); fillSettings(); });

  /** The Settings toggle quiets the CSS motion too (the system setting does it through the media query). */
  function applyMotionClass() { document.documentElement.classList.toggle('reduce', !!prog.reduced); }
  on('settingsClose', closeSheet);
  on('tutorialBtn', function () { closeSheet(); prog.run = null; startAtlas(1); });
  on('resumeBtn', function () { closeSheet(); dirty = true; });
  on('pauseHome', function () { saveRun(); closeSheet(); showHome(); });
  $('sheet').addEventListener('click', function (e) {
    if (e.target === $('sheet')) { closeSheet(); dirty = true; }
  });

  function setSound(onOff) {
    prog.sound = onOff;
    audio.setMuted(!onOff);
    persist();
    if (onOff) { audio.unlock(); audio.play('ui'); }
  }

  // =====================================================================================
  // Shell hooks
  // =====================================================================================

  Shell.onBack(function () {
    if (busy) return true;
    if (sheet) { closeSheet(); dirty = true; return true; }
    if (screen === 'play') {
      if (game && !game.finished) { saveRun(); openSheet('pause'); }
      return true;
    }
    if (screen === 'result' && lastResult && lastResult.mode === 'archive') { showArchive(); return true; }
    if (screen !== 'home') { showHome(); return true; }
    return false; // on the home screen the app closes
  });

  Shell.onPause(function () {
    if (screen === 'play' && game && !game.finished && !sheet) openSheet('pause');
    if (game) saveRun();
    persist();
    audio.suspend();
  });

  Shell.onResume(function () {
    audio.resume();
    var d = islands.dayNumber();
    if (d !== today) {
      today = d;
      if (screen === 'home') showHome();
      if (screen === 'archive') showArchive();
    }
    dirty = true;
  });

  Shell.onChange(function () {
    caps = Shell.caps;
    if (screen === 'home') showHomeOffers();
    if (screen === 'result' && lastResult) refreshResultOffers();
    if (screen === 'atlas') keepScroll('atlasList', renderAtlas);
    if (screen === 'archive') keepScroll('archiveList', renderArchive);
    if (sheet === 'settings') fillSettings();
    if (sheet === 'unlock') fillUnlock(+$('unlockBtn').getAttribute('data-day'));
    // relayout only when the safe insets moved: an ad loading mid-island must not cost a frame
    var ins = JSON.stringify(insets());
    if (ins !== lastInsets) { lastInsets = ins; resize(); }
  });
  var lastInsets = '';

  function showHomeOffers() {
    var st = progress.streakStatus(prog, today);
    var offer = ads.rewardedOffer(Shell.caps);
    var repair = $('repairBtn');
    repair.hidden = !(st.repair && offer.show);
    repair.textContent = offer.take ? t('takeRepair', { n: st.count }) : t('watchRepair', { n: st.count });
  }

  function refreshResultOffers() {
    var c = Shell.caps;
    var info = lastResult;
    var offer = ads.rewardedOffer(c);
    var isToday = info.mode === 'daily' && info.day === today;
    var second = $('secondBtn');
    second.hidden = !(isToday && progress.secondTryAvailable(prog, today) && offer.show);
    second.textContent = offer.take ? t('takeSecond') : t('watchSecond');
    $('shareBtn').hidden = !(info.mode !== 'atlas' && typeof Shell.share === 'function' && c.share);
    if (!ads.removeAdsVisible(c)) $('offerBox').hidden = true;
  }

  window.addEventListener('resize', function () { resize(); });

  // =====================================================================================
  // Start
  // =====================================================================================

  function applyStrings() {
    var els = document.querySelectorAll('[data-t]');
    for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-t'));
    var aria = document.querySelectorAll('[data-aria]');
    for (var j = 0; j < aria.length; j++) aria[j].setAttribute('aria-label', t(aria[j].getAttribute('data-aria')));
    $('policyLink').href = POLICY_URL;
    $('aboutLink').href = ABOUT_URL;
  }

  function boot() {
    applyStrings();
    applyMotionClass();
    resize();
    // a first launch goes straight into the tutorial island; otherwise the home screen
    if (!prog.tutorialDone && !prog.atlas.done[1]) {
      $('intro').classList.add('on');
      setTimeout(function () { $('intro').classList.remove('on'); }, 2200);
      startAtlas(1);
    } else {
      showHome();
    }
    requestAnimationFrame(frame);
    Shell.ready().then(function (c) {
      caps = c;
      lastInsets = JSON.stringify(insets());
      resize();
      if (screen === 'home') showHomeOffers();
    });
  }

  var fontsReady = document.fonts && document.fonts.load ? Promise.all([
    document.fonts.load('600 20px "Fog Serif"'), document.fonts.load('italic 600 20px "Fog Serif"')
  ]).catch(function () {}) : Promise.resolve();
  var booted = false;
  function bootOnce() { if (!booted) { booted = true; boot(); } }
  fontsReady.then(bootOnce);
  setTimeout(bootOnce, 1200);

  window.FCDebug = {
    get screen() { return screen; },
    get sheet() { return sheet; },
    get game() { return game; },
    get view() { return view; },
    get prog() { return prog; },
    get today() { return today; },
    get frames() { return frames; },
    get lastResult() { return lastResult; },
    resetFrames: function () { frames.n = 0; frames.slow = 0; frames.worst = 0; frames.last = 0; },
    cellCenter: function (i) { var c = art.cellXY(view.lay.L, i); return { x: c.x, y: c.y }; },
    tray: function () { return view && view.lay && view.lay.tray ? { x: view.lay.tray.x, y: view.lay.tray.y, s: view.lay.tray.s } : null; },
    lift: function () { return liftOffset(); }
  };
})();
