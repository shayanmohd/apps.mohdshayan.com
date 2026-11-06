/*
 * Lampcourt: screens, input, drawing on demand and the shell calls.
 *
 * Ad rules (GAME-DESIGN.md section 6, WEBGAME-RECIPE.md section 3):
 *   no banner in the app; on the web Shell.banner(true) only on menus and Night walk results
 *   interstitials only on Next between Night walk courtyards or before a chapter card, under the game's
 *     own counts in progress.js; never on launch, Back, Play, Retry, Light, or around a daily
 *   rewarded only from a button that states the reward, only while caps.rewardedReady or ad free
 *   Remove ads from Settings, and on its own at most once after the first PERFECT
 * Rendering: nothing is drawn unless something changed; at most 60 fps during play (frames skipped by
 * rAF timestamp); the flicker redraws small rectangles about 12 times a second; devicePixelRatio capped
 * at 2, with a drop to a lower resolution when frames run slow.
 */
(function () {
  'use strict';
  var L = LC.light, S = LC.strings, cal = LC.calendar, prog = LC.progress, art = LC.art;
  var au = LC.audio, lan = LC.lanterns, icons = LC.icons, shareLib = LC.share;
  var DAILY = LC.DAILY, WALK = LC.WALK;
  var t = S.t;
  var SLOT = 'progress';
  var LIFT = 46; // CSS px a dragged lantern floats above a finger
  var $ = function (id) { return document.getElementById(id); };

  // ---- save ----
  Shell.configureSave({ prefix: 'lampcourt', version: prog.VERSION, migrate: function (d) { return prog.migrate(d); } });
  var P = prog.sanitize(Shell.load(SLOT, null));
  function persist() { Shell.save(SLOT, P); }

  var caps = Shell.caps;
  var today = Math.max(1, cal.today());
  if (!P.installDay) P.installDay = today;
  S.setLang(P.lang || S.detect(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]));

  var mql = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return P.motion === 'reduce' || (P.motion === 'auto' && !!(mql && mql.matches)); }

  // ---- state ----
  var screen = 'boot';
  var game = null;
  var sheetOpen = null;
  var drag = null;
  var tutor = null;
  var particles = [];
  var shake = { until: 0, mag: 0 };
  var counter = { from: 0, to: 0, t0: 0, shown: 0 };
  var bannerWanted = false;
  var archiveMonth = null;
  var busy = false;

  // ---- canvas, layers, layout ----
  var canvas = $('c');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, R = 1, quality = 1;
  var lay = null;
  var bgLayer = null, planLayer = null, litLayer = null, homeLayer = null, sprites = null;
  var litValid = false, litPath = null;

  function dpr() { return Math.min(2, window.devicePixelRatio || 1) * quality; }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    R = Math.max(1, dpr());
    canvas.width = Math.round(W * R);
    canvas.height = Math.round(H * R);
    bgLayer = null;
    homeLayer = null;
    relayout();
  }

  function insets() { return caps.insets || { top: 0, right: 0, bottom: 0, left: 0 }; }

  function relayout() {
    if (game && (screen === 'play' || screen === 'result')) layoutCourt();
    planLayer = null;
    litValid = false;
    litPath = null; // the glow clip is in screen coordinates, so it follows the layout
    requestDraw();
  }

  function layoutCourt() {
    var ins = insets();
    var plan = game.plan;
    var hudH = game.mode === 'walk' ? 86 : 80;
    var top = ins.top + hudH;
    var bottom;
    if (screen === 'result') {
      var panel = $('result');
      bottom = (panel.offsetHeight || 260) + 10;
    } else {
      bottom = ins.bottom + 104;
    }
    var mx = Math.max(32, ins.left + 16), mxr = Math.max(32, ins.right + 16);
    var availW = W - mx - mxr, availH = H - top - bottom;
    var cs = Math.floor(Math.min(availW / (plan.w + 0.5), availH / (plan.h + 0.5), 56));
    cs = Math.max(12, cs);
    var pw = plan.w * cs, ph = plan.h * cs;
    var slack = availH - ph - cs;
    var hangH = game.mode !== 'walk' && screen === 'play' ? Math.max(0, Math.min(86, slack - 40)) : 0;
    if (hangH < 40) hangH = 0;
    var px = Math.round(mx + (availW - pw) / 2);
    var py = Math.round(top + hangH + (availH - hangH - ph) / 2);
    var frame = Math.max(3, Math.round(cs * 0.24));
    var trayY = H - ins.bottom - 52;
    var rtl = S.dir() === 'rtl';
    var lightX = rtl ? mx + 32 : W - mxr - 32;
    var xs = [];
    var spacing = Math.min(56, (W - mx - mxr - 90) / Math.max(1, game.k));
    for (var i = 0; i < game.k; i++) {
      var off = 28 + i * spacing;
      xs.push(rtl ? W - mxr - off : mx + off);
    }
    lay = { cs: cs, px: px, py: py, pw: pw, ph: ph, frame: frame, trayY: trayY, trayXs: xs, lightX: lightX, hangH: hangH, top: top };
    var lb = $('lightBtn');
    lb.style.left = (lightX - 32) + 'px';
    lb.style.top = (trayY - 32) + 'px';
  }

  // ---- drawing ----

  function buildBg() {
    bgLayer = art.layer(W * R, H * R);
    var g = bgLayer.getContext('2d');
    g.setTransform(R, 0, 0, R, 0, 0);
    g.fillStyle = art.C.ink;
    g.fillRect(0, 0, W, H);
    var v = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H * 0.45, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(20, 38, 50, 0.55)');
    v.addColorStop(1, 'rgba(4, 9, 12, 0.6)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  }

  function buildPlanLayer() {
    var cs = lay.cs, f = lay.frame, plan = game.plan;
    sprites = art.cellSprites(cs * R);
    var w = plan.w * cs + 2 * f, h = plan.h * cs + 2 * f;
    planLayer = art.layer(w * R, h * R);
    var g = planLayer.getContext('2d');
    g.setTransform(R, 0, 0, R, 0, 0);
    art.drawPlan(g, plan, f, f, cs, { sprites: sprites });
    litLayer = art.layer(w * R, h * R);
    litValid = false;
  }

  function cellXY(cell) {
    var w = game.plan.w;
    return { x: lay.px + (cell % w + 0.5) * lay.cs, y: lay.py + (((cell / w) | 0) + 0.5) * lay.cs };
  }

  /** The lit set shown now: the player's, or the best placement's on the result toggle. */
  function shownCells() {
    return game.showBest ? game.bestCells : game.cells.filter(function (c) { return c != null; });
  }

  // Per cell fade: alpha from, to, start time; cells light outward from the lantern that moved.
  var fade = null;
  function resetFade() {
    var n = game.model.n;
    fade = { from: new Float32Array(n), to: new Float32Array(n), t0: new Float64Array(n), level: new Uint8Array(n), end: 0 };
  }

  function alphaAt(i, now) {
    var a = fade.from[i], b = fade.to[i];
    if (a === b) return b;
    var k = (now - fade.t0[i]) / 150;
    if (k <= 0) return a;
    if (k >= 1) { fade.from[i] = b; return b; }
    return a + (b - a) * k;
  }

  function computeLevels(list) {
    var model = game.model, w = model.w;
    for (var i = 0; i < model.n; i++) fade.level[i] = 2;
    for (var j = 0; j < list.length; j++) {
      var c = list[j], s = model.slot[c];
      if (s < 0) continue;
      var lx = c % w, ly = (c / w) | 0;
      for (var k = 0; k < model.n; k++) {
        if (!(model.vis[s * model.words + (k >>> 5)] & (1 << (k & 31)))) continue;
        var dx = k % w - lx, dy = ((k / w) | 0) - ly, d2 = dx * dx + dy * dy;
        var lv = d2 <= 2 ? 0 : d2 <= 5 ? 1 : 2;
        if (lv < fade.level[k]) fade.level[k] = lv;
      }
    }
  }

  /** Recomputes the lit set and starts the fades. origin: the cell to spread from, or -1. */
  function relight(origin, quick) {
    var list = shownCells();
    var bits = L.litBits(game.model, list);
    var now = performance.now();
    var instant = reduced();
    var w = game.model.w;
    if (!fade) resetFade();
    computeLevels(list);
    for (var i = 0; i < game.model.n; i++) {
      var on = L.isLit(bits, i) ? 1 : 0;
      var cur = alphaAt(i, now);
      if (fade.to[i] === on) continue;
      fade.from[i] = instant ? on : cur;
      fade.to[i] = on;
      var delay = 0;
      if (on && origin >= 0 && !quick && !instant) {
        var dx = i % w - origin % w, dy = ((i / w) | 0) - ((origin / w) | 0);
        delay = Math.sqrt(dx * dx + dy * dy) * 30;
      }
      fade.t0[i] = now + delay;
      if (!instant) fade.end = Math.max(fade.end, now + delay + 160);
    }
    game.bits = bits;
    var count = L.countBits(bits);
    if (count !== game.count) {
      setCounter(count);
      game.count = count;
    }
    litValid = false;
    litPath = null;
    requestDraw();
  }

  function buildLitPath() {
    var p = new Path2D(), w = game.plan.w, cs = lay.cs;
    for (var i = 0; i < game.model.n; i++) if (fade.to[i] > 0) p.rect(lay.px + (i % w) * cs, lay.py + ((i / w) | 0) * cs, cs, cs);
    litPath = p;
  }

  function bakeLit() {
    stats.bakes++;
    var g = litLayer.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, litLayer.width, litLayer.height);
    g.setTransform(R, 0, 0, R, 0, 0);
    var w = game.plan.w, cs = lay.cs, f = lay.frame;
    for (var i = 0; i < game.model.n; i++) {
      if (fade.to[i] > 0) g.drawImage(sprites.lit[fade.level[i]], f + (i % w) * cs, f + ((i / w) | 0) * cs, cs, cs);
    }
    litValid = true;
  }

  function drawCourt(g, now) {
    if (!planLayer) buildPlanLayer();
    var cs = lay.cs, f = lay.frame;
    var sx = 0, sy = 0;
    if (now < shake.until) {
      var k = (shake.until - now) / 300;
      sx = Math.sin(now / 17) * shake.mag * k;
      sy = Math.cos(now / 23) * shake.mag * k;
    }
    g.save();
    g.translate(sx, sy);
    if (lay.hangH) drawHanging(g);
    g.drawImage(planLayer, lay.px - f, lay.py - f, planLayer.width / R, planLayer.height / R);
    // While cells fade or a lantern is being dragged, draw the cells directly; bake the light layer
    // only once nothing changes, so a drag never re-rasterises an offscreen canvas per cell.
    var animating = fade && (now < fade.end || (drag && drag.moved));
    if (animating) {
      var w = game.plan.w;
      for (var i = 0; i < game.model.n; i++) {
        var a = alphaAt(i, now);
        if (a <= 0) continue;
        g.globalAlpha = a;
        g.drawImage(sprites.lit[fade.level[i]], lay.px + (i % w) * cs, lay.py + ((i / w) | 0) * cs, cs, cs);
      }
      g.globalAlpha = 1;
    } else if (fade) {
      if (!litValid) bakeLit();
      g.drawImage(litLayer, lay.px - f, lay.py - f, litLayer.width / R, litLayer.height / R);
    }
    // The soft glow: decoration only, clipped to the lit cells.
    var list = shownCells();
    if (list.length && fade) {
      if (!litPath) buildLitPath();
      g.save();
      g.clip(litPath);
      g.globalCompositeOperation = 'lighter';
      var gr = cs * 3.3;
      var glow = art.glowSprite(gr * R, 0.2);
      var flare = game.flareT0 ? Math.max(0, 1 - (now - game.flareT0) / 700) : 0;
      for (var j = 0; j < list.length; j++) {
        var p = cellXY(list[j]);
        var flick = flickerOn() ? 0.88 + 0.12 * Math.sin(now / 260 + j * 1.7) * Math.sin(now / 410 + j) : 1;
        g.globalAlpha = Math.min(1, flick + flare * 0.6);
        var rr = gr * (1 + flare * 0.25);
        g.drawImage(glow, p.x - rr, p.y - rr, rr * 2, rr * 2);
      }
      g.restore();
    }
    // Best placement ghosts on the daily result, the hint spot in Night walk.
    if (game.done && game.mode !== 'walk' && !game.showBest) {
      for (var b = 0; b < game.bestCells.length; b++) {
        if (game.cells.indexOf(game.bestCells[b]) >= 0) continue;
        drawToken(g, cellXY(game.bestCells[b]), cs * 0.7, 'ghost');
        drawRing(g, game.bestCells[b], 'rgba(10, 21, 28, 0.85)', true);
      }
    }
    if (game.spot >= 0 && !game.done) { drawRing(g, game.spot, '#EBC67A', false); drawRing(g, game.spot, 'rgba(235, 198, 122, 0.5)', false, 0, 0.3); }
    // Lanterns on the plan.
    var cellsDrawn = game.showBest ? game.bestCells : game.cells;
    for (var q = 0; q < cellsDrawn.length; q++) {
      var cell = cellsDrawn[q];
      if (cell == null) continue;
      if (drag && drag.moved && drag.idx === q && !game.showBest) continue;
      var lifted = !game.showBest && game.sel === q;
      drawToken(g, cellXY(cell), cs * 0.84 * (lifted ? 1.12 : 1), lifted ? 'lifted' : '');
    }
    g.restore();
    if (!game.done) drawTray(g, now);
    if (drag && drag.moved) drawDragged(g);
    if (tutor) drawTutor(g, now);
    drawParticles(g, now);
  }

  function drawHanging(g) {
    var d = game.design;
    var h = lay.hangH;
    var sp = art.lanternSprite(d, h * R, true);
    var cx = W / 2, top = lay.top + 6;
    g.strokeStyle = art.C.brass;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx, lay.top - 6);
    g.lineTo(cx, top + 2);
    g.stroke();
    g.drawImage(sp.canvas, cx - sp.w / R / 2, top, sp.w / R, sp.h / R);
  }

  function drawToken(g, p, d, state) {
    var tok = art.tokenSprite(game.glass, d * R, state);
    var s = tok.canvas.width / R;
    g.drawImage(tok.canvas, p.x - s / 2, p.y - s / 2, s, s);
  }

  function drawRing(g, cell, color, dashed, unused, radius) {
    var p = cellXY(cell), cs = lay.cs;
    g.save();
    g.strokeStyle = color;
    g.lineWidth = Math.max(1.5, cs / 14);
    if (dashed) g.setLineDash([cs / 7, cs / 9]);
    g.beginPath();
    g.arc(p.x, p.y, cs * (radius || 0.42), 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  function drawTray(g, now) {
    var r = 19;
    g.save();
    g.strokeStyle = 'rgba(201, 154, 72, 0.35)';
    g.lineWidth = 1;
    var ins = insets();
    var x0 = Math.max(32, ins.left + 16), x1 = W - Math.max(32, ins.right + 16);
    g.beginPath();
    g.moveTo(x0, lay.trayY + 30);
    g.lineTo(x1, lay.trayY + 30);
    g.stroke();
    for (var i = 0; i < game.k; i++) {
      var x = lay.trayXs[i], y = lay.trayY;
      var placed = game.cells[i] != null;
      var dragging = drag && drag.moved && drag.hit.kind === 'tray' && drag.hit.idx === i;
      if (placed || dragging) {
        g.strokeStyle = 'rgba(143, 164, 175, 0.35)';
        g.setLineDash([3, 4]);
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      } else {
        var sel = game.sel === i;
        drawToken(g, { x: x, y: y - (sel ? 6 : 0) }, r * 2 * (sel ? 1.1 : 1), sel ? 'lifted' : '');
      }
    }
    g.restore();
  }

  function drawDragged(g) {
    var p = { x: drag.x, y: drag.y - (drag.touch ? LIFT : 0) };
    if (drag.target >= 0) {
      var c = cellXY(drag.target), cs = lay.cs;
      g.save();
      g.strokeStyle = '#FFE3A3';
      g.lineWidth = 2;
      g.strokeRect(c.x - cs / 2 + 1, c.y - cs / 2 + 1, cs - 2, cs - 2);
      g.restore();
    }
    drawToken(g, p, Math.max(34, lay.cs * 0.95), 'lifted');
  }

  function drawTutor(g, now) {
    if (!tutor) return;
    var period = 1900, k = ((now - tutor.t0) % period) / period;
    var from = { x: lay.trayXs[tutor.idx], y: lay.trayY };
    var to = tutor.cell >= 0 ? cellXY(tutor.cell) : from;
    var x, y, a;
    if (tutor.phase === 0) {
      var m = k < 0.15 ? 0 : k > 0.7 ? 1 : (k - 0.15) / 0.55;
      m = m < 0.5 ? 2 * m * m : 1 - Math.pow(-2 * m + 2, 2) / 2;
      x = from.x + (to.x - from.x) * m;
      y = from.y + (to.y - from.y) * m;
      a = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1;
      g.save();
      g.globalAlpha = a * 0.55;
      drawToken(g, { x: x, y: y }, lay.cs * 0.84, 'ghost');
      g.restore();
    } else {
      x = from.x; y = from.y;
      a = 0.5 + 0.5 * Math.sin(k * Math.PI * 2);
    }
    g.save();
    g.strokeStyle = 'rgba(255, 227, 163, ' + (0.85 * a).toFixed(3) + ')';
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(x, y + 4, 24, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255, 227, 163, ' + (0.18 * a).toFixed(3) + ')';
    g.fill();
    g.restore();
  }

  function spawnEmbers(p) {
    if (reduced()) return;
    for (var i = 0; i < 10 && particles.length < 40; i++) {
      particles.push({ x: p.x + (Math.random() - 0.5) * 10, y: p.y, vx: (Math.random() - 0.5) * 0.04, vy: -0.04 - Math.random() * 0.06, t0: performance.now(), life: 600 + Math.random() * 400, s: 1.5 + Math.random() * 1.5 });
    }
  }

  function spawnRing(p) {
    if (reduced()) return;
    for (var i = 0; i < 24 && particles.length < 40; i++) {
      var a = (i / 24) * Math.PI * 2;
      particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * 0.16, vy: Math.sin(a) * 0.16, t0: performance.now(), life: 700, s: 2.2 });
    }
  }

  function drawParticles(g, now) {
    if (!particles.length) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i], age = now - p.t0;
      if (age > p.life) { particles.splice(i, 1); continue; }
      var k = age / p.life;
      g.globalAlpha = (1 - k) * 0.9;
      g.fillStyle = '#FFD58A';
      g.fillRect(p.x + p.vx * age - p.s / 2, p.y + p.vy * age - p.s / 2, p.s, p.s);
    }
    g.restore();
  }

  // The home: sky with the lantern string at the top, today's plan in its slot.
  function buildHome() {
    homeLayer = art.layer(W * R, H * R);
    var g = homeLayer.getContext('2d');
    g.setTransform(R, 0, 0, R, 0, 0);
    var day = today, ram = cal.ramadan(day, P.shift);
    var daylight = !!(ram && ram.phase === 'eid');
    document.body.classList.toggle('daylight', daylight);
    art.drawSky(g, W, H, daylight, 1448);
    if (!daylight) {
      var v = g.createLinearGradient(0, H * 0.3, 0, H);
      v.addColorStop(0, 'rgba(14, 27, 36, 0)');
      v.addColorStop(1, 'rgba(10, 21, 28, 0.9)');
      g.fillStyle = v;
      g.fillRect(0, 0, W, H);
    }
    var sky = $('skySlot').getBoundingClientRect();
    var rtl = S.dir() === 'rtl';
    var inSeason = !!cal.lastSeason(today, P.shift);
    art.drawCrescent(g, rtl ? sky.left + 40 : sky.right - 40, sky.top + insets().top + (inSeason ? 14 : Math.min(70, sky.height * 0.42)), inSeason ? 10 : 15, daylight ? '#FFF6DE' : art.C.moon);
    drawString(g, sky, daylight);
    var slot = $('homePlan').getBoundingClientRect();
    var entry = dailyEntry(today);
    var plan = L.parse(entry.plan);
    var res = P.daily[today];
    var cs = Math.floor(Math.min((slot.width - 16) / plan.w, (slot.height - 16) / plan.h, 22));
    if (cs >= 5) {
      var ox = Math.round(slot.left + (slot.width - plan.w * cs) / 2), oy = Math.round(slot.top + (slot.height - plan.h * cs) / 2);
      var sp = art.cellSprites(cs * R);
      art.drawPlan(g, plan, ox, oy, cs, { sprites: sp });
      if (res) {
        var model = modelFor(entry.plan);
        var bits = L.litBits(model, res.cells);
        for (var i = 0; i < model.n; i++) if (L.isLit(bits, i)) g.drawImage(sp.lit[1], ox + (i % plan.w) * cs, oy + ((i / plan.w) | 0) * cs, cs, cs);
        var glass = designFor(today).glass[0];
        res.cells.forEach(function (c) {
          var tok = art.tokenSprite(glass, cs * 0.8 * R, '');
          var s = tok.canvas.width / R;
          g.drawImage(tok.canvas, ox + (c % plan.w + 0.5) * cs - s / 2, oy + (((c / plan.w) | 0) + 0.5) * cs - s / 2, s, s);
        });
      }
    }
  }

  /** The string of lanterns over the player's courtyard: this season's, or three house lanterns. */
  function drawString(g, rect, daylight) {
    var season = cal.lastSeason(today, P.shift);
    var top = rect.top + insets().top;
    var x0 = rect.left + 12, x1 = rect.right - 12;
    if (!season) {
      swag(g, x0, x1, top + 10, 22);
      var hd = lan.house();
      var big = Math.max(50, Math.min(120, rect.height - insets().top - 40));
      [0.27, 0.5, 0.73].forEach(function (f, i) {
        hang(g, hd, x0 + (x1 - x0) * f, top + 10 + sag(f, 22), big * [0.62, 0.86, 0.62][i], !daylight);
      });
      return;
    }
    var designs = lan.season(season);
    var got = P.lanterns[String(season)] || [];
    var start = cal.seasonStart(season, P.shift);
    // Three strings of ten: collected lanterns lit, dates already reached but not lit as dim
    // silhouettes (the archive can bring them back), dates still to come as bare hooks.
    var rows = 3, per = 10;
    var avail = rect.height - insets().top - 36;
    var rowGap = Math.max(26, avail / rows);
    var lh = Math.min(38, rowGap * 0.95, (x1 - x0) / per * 1.6);
    for (var r = 0; r < rows; r++) {
      var y = top + 30 + r * rowGap * 0.86;
      var dip = 12;
      swag(g, x0, x1, y, dip);
      for (var i = 0; i < per; i++) {
        var n = r * per + i + 1;
        var f = (i + 0.5) / per;
        var x = S.dir() === 'rtl' ? x1 - (x1 - x0) * f : x0 + (x1 - x0) * f, hy = y + sag(f, dip);
        if (got.indexOf(n) >= 0) {
          hang(g, designs[n - 1], x, hy, lh, !daylight);
        } else if (today >= start + n - 1) {
          g.save();
          g.globalAlpha = 0.32;
          hang(g, designs[n - 1], x, hy, lh, false);
          g.restore();
        } else {
          g.strokeStyle = 'rgba(201, 154, 72, 0.6)';
          g.lineWidth = 1;
          g.beginPath();
          g.arc(x, hy + 3, 2.5, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }
  }

  function sag(f, dip) { return dip * 4 * f * (1 - f); }

  function swag(g, x0, x1, y, dip) {
    g.save();
    g.strokeStyle = 'rgba(201, 154, 72, 0.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x0, y);
    g.quadraticCurveTo((x0 + x1) / 2, y + dip * 2, x1, y);
    g.stroke();
    g.restore();
  }

  function hang(g, d, x, y, h, lit) {
    var sp = art.lanternSprite(d, h * R, lit);
    if (lit) {
      var gl = art.glowSprite(h * 0.9 * R, 0.3);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.drawImage(gl, x - h * 0.9, y + h * 0.55 - h * 0.9, h * 1.8, h * 1.8);
      g.restore();
    }
    g.drawImage(sp.canvas, x - sp.w / R / 2, y, sp.w / R, sp.h / R);
  }

  var stats = { frames: 0, partial: 0, ms: 0, bakes: 0, idle: 0, skip: 0 };
  function drawScene(clips, now) {
    var t0 = performance.now();
    drawSceneInner(clips, now);
    stats.frames++;
    if (clips) stats.partial++;
    stats.ms += performance.now() - t0;
  }
  function drawSceneInner(clips, now) {
    var g = ctx;
    g.setTransform(R, 0, 0, R, 0, 0);
    if (clips) {
      g.save();
      g.beginPath();
      for (var i = 0; i < clips.length; i++) g.rect(clips[i][0], clips[i][1], clips[i][2], clips[i][3]);
      g.clip();
    }
    if (screen === 'home') {
      if (!homeLayer) buildHome();
      g.drawImage(homeLayer, 0, 0, W, H);
    } else {
      if (!bgLayer) buildBg();
      g.drawImage(bgLayer, 0, 0, W, H);
      if (game && (screen === 'play' || screen === 'result')) drawCourt(g, now);
    }
    if (clips) g.restore();
  }

  // ---- the frame scheduler: on demand, 60 fps cap, a slow timer for the flicker alone ----
  var rafId = 0, lastDraw = 0, lastDrawWall = 0, dirty = false, flickTimer = 0;
  var slow = { n: 0, sum: 0, last: 0 };

  function flickerOn() {
    return screen === 'play' && game && !game.done && !reduced() && !sheetOpen && !document.hidden &&
      game.cells.some(function (c) { return c != null; });
  }

  function busyAnim(now) {
    return !!(drag && drag.moved) || (fade && now < fade.end) || now < shake.until || particles.length > 0 ||
      !!tutor || counterRolling(now) || (game && game.flareT0 && now - game.flareT0 < 700);
  }

  function requestDraw() {
    dirty = true;
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function loop(ts) {
    rafId = 0;
    if (document.hidden) return;
    var now = performance.now();
    var active = busyAnim(now);
    if (!dirty && !active) {
      stats.idle++;
      if (flickerOn() && !flickTimer) flickTimer = setTimeout(function () { flickTimer = 0; flickFrame(); }, 80);
      return;
    }
    // The 60 fps cap: skip a frame only when both the rAF timestamp and the clock say less than 13 ms
    // passed since the last draw. A 120 Hz display draws every second frame; a 60 Hz one never skips,
    // even when a busy main thread delivers frames with stale timestamps.
    if (ts - lastDraw < 13 && now - lastDrawWall < 13) {
      stats.skip++;
      rafId = requestAnimationFrame(loop);
      return;
    }
    watchSpeed(ts, active);
    lastDraw = ts;
    lastDrawWall = now;
    dirty = false;
    tickCounter(now);
    drawScene(null, now);
    rafId = requestAnimationFrame(loop);
  }

  function flickFrame() {
    if (rafId || !flickerOn()) return;
    rafId = requestAnimationFrame(function (ts) {
      rafId = 0;
      if (dirty || busyAnim(performance.now())) { requestDraw(); return; }
      if (!flickerOn()) return;
      var clips = [], cs = lay.cs;
      game.cells.forEach(function (c) {
        if (c == null) return;
        var p = cellXY(c), r = cs * 3.6;
        clips.push([p.x - r, p.y - r, r * 2, r * 2]);
      });
      lastDraw = ts;
      drawScene(clips, performance.now());
      flickTimer = setTimeout(function () { flickTimer = 0; flickFrame(); }, 80);
    });
  }

  /** Dynamic resolution: if animated frames keep arriving late, draw at a lower resolution. */
  function watchSpeed(ts, active) {
    if (!active || !slow.last || ts - slow.last > 200) { slow.last = ts; slow.n = 0; slow.sum = 0; return; }
    slow.sum += ts - slow.last;
    slow.n++;
    slow.last = ts;
    if (slow.n >= 45) {
      var avg = slow.sum / slow.n;
      slow.n = 0; slow.sum = 0;
      if (avg > 26 && quality > 0.6 && dpr() > 1.01) {
        quality = quality > 0.8 ? 0.75 : 0.5;
        resize();
      }
    }
  }

  // ---- the counter ----
  function setCounter(to) {
    counter.from = counter.shown;
    counter.to = to;
    counter.t0 = performance.now();
    if (reduced()) { counter.from = to; counter.shown = to; }
    showCount(counter.shown);
    var el = $('hudCount');
    el.classList.remove('pop');
    void el.offsetWidth;
    if (!reduced()) el.classList.add('pop');
  }
  function counterRolling(now) { return counter.shown !== counter.to && now - counter.t0 < 600; }
  function tickCounter(now) {
    if (counter.shown === counter.to) return;
    var k = Math.min(1, (now - counter.t0) / 260);
    var v = Math.round(counter.from + (counter.to - counter.from) * k);
    if (v !== counter.shown) { counter.shown = v; showCount(v); au.tick(); }
  }
  function showCount(v) {
    $('hudCount').textContent = String(v);
    $('counter').setAttribute('aria-label', t('aria.lit', { n: v }));
    if (game && game.mode === 'walk') {
      var th = prog.thresholds(game.best);
      var els = $('hudTargets').children;
      for (var i = 0; i < els.length; i++) els[i].classList.toggle('on', v >= th[i]);
    }
    canvas.setAttribute('aria-label', t('aria.board') + '. ' + t('aria.lit', { n: v }));
  }

  // ---- data ----
  var modelCache = {};
  function modelFor(planStr) {
    if (!modelCache[planStr]) modelCache[planStr] = L.build(L.parse(planStr));
    return modelCache[planStr];
  }
  function dailyEntry(day) {
    var rows = DAILY.days, n = rows.length;
    var r = rows[(((day - 1) % n) + n) % n];
    return { plan: r[0], best: r[1], cells: r[2] };
  }
  function designFor(day) {
    var ram = cal.ramadan(day, P.shift);
    return ram && ram.lantern ? lan.forDate(ram.year, ram.lantern) : lan.house();
  }

  function locale() {
    var l = S.getLang();
    return l === 'ar' ? 'ar-u-nu-latn' : l === 'en' ? 'en-GB' : l;
  }
  function gregorian(day, withWeekday) {
    var d = cal.dateOf(day);
    try {
      var o = { day: 'numeric', month: 'long', timeZone: 'UTC' };
      if (withWeekday) o.weekday = 'long';
      return new Intl.DateTimeFormat(locale(), o).format(new Date(Date.UTC(d.y, d.m - 1, d.d)));
    } catch (e) {
      return d.d + '/' + d.m + '/' + d.y;
    }
  }
  function dateLabel(day) {
    var ram = cal.ramadan(day, P.shift);
    if (ram && ram.phase === 'ramadan') return t('ramadanDay', { n: ram.n });
    if (ram && ram.phase === 'eid') return t('eidDay');
    return gregorian(day, false);
  }
  function monthName(y, m) {
    try {
      return new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
    } catch (e) {
      return m + ' / ' + y;
    }
  }

  // ---- strings into the DOM ----
  function applyStrings() {
    var root = document.documentElement;
    root.lang = S.getLang();
    root.dir = S.dir();
    var els = document.querySelectorAll('[data-t]');
    for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-t'));
    var ar = document.querySelectorAll('[data-aria]');
    for (var j = 0; j < ar.length; j++) ar[j].setAttribute('aria-label', t(ar[j].getAttribute('data-aria')));
    icons.hydrate();
  }

  // ---- screens ----
  var SCREENS = ['home', 'walk', 'archive', 'settings'];
  function setScreen(next) {
    screen = next;
    document.body.setAttribute('data-screen', next);
    SCREENS.forEach(function (s) { $(s).hidden = s !== next; });
    var court = next === 'play' || next === 'result';
    $('hud').hidden = !court;
    $('result').hidden = next !== 'result';
    $('lightBtn').hidden = next !== 'play';
    if (next !== 'play') { $('coach').hidden = true; tutor = null; }
    if (!court) document.body.classList.remove('daylight');
    syncBanner();
    if (next === 'home') { homeLayer = null; renderHome(); }
    relayout();
  }

  /** Web only: the side slot on menus and Night walk results; never in the app, never in play. */
  function syncBanner() {
    if (caps.platform !== 'web') return;
    var want = screen === 'home' || screen === 'walk' || screen === 'archive' || screen === 'settings' ||
      (screen === 'result' && game && game.mode === 'walk');
    if (want !== bannerWanted) {
      bannerWanted = want;
      Shell.banner(want);
    }
  }

  function renderHome() {
    var ram = cal.ramadan(today, P.shift);
    $('homeDate').textContent = ram ? dateLabel(today) : gregorian(today, true);
    $('homeGreg').textContent = ram ? gregorian(today, false) : '';
    var soon = cal.daysToRamadan(today, P.shift);
    $('homeSoon').hidden = !(ram || (soon > 0 && soon <= 120));
    if (ram) $('homeSoon').textContent = ram.phase === 'eid' ? t('greetEid') : t('greetRamadan');
    else if (soon > 0) $('homeSoon').textContent = t('ramadanSoon', { date: gregorian(today + soon, false) });
    var res = P.daily[today];
    var cur = P.current && P.current.mode === 'daily' && P.current.id === today && P.current.cells.some(function (c) { return c != null; });
    if (res) {
      $('homeResult').hidden = false;
      $('homeResult').textContent = '';
      var b = document.createElement('b');
      b.textContent = t('litOf', { lit: res.lit, best: res.best });
      $('homeResult').appendChild(b);
      $('homeResult').appendChild(document.createTextNode('  ' + (res.lit >= res.best ? t('perfect') : t('percentOfBest', { p: prog.percent(res.lit, res.best) }))));
      $('playBtn').textContent = t('seeResult');
      $('playBtn').className = 'secondary';
    } else {
      $('homeResult').hidden = true;
      $('playBtn').textContent = cur ? t('continueToday') : t('lightToday');
      $('playBtn').className = 'primary';
    }
    var streak = cal.currentStreak(P.streak, today);
    $('homeStreak').textContent = streak > 0 ? t('streak', { n: streak }) : '';
    var repair = !res && cal.canRepair(P.streak, today) && (caps.rewardedReady || caps.adFree);
    $('repair').hidden = !repair;
    if (repair) {
      $('repairLine').textContent = t('repairLine', { n: P.streak.count });
      setRewardLabel($('repairBtn'), caps.adFree ? t('repairTake') : t('repairWatch'));
    }
    var stars = P.walk.stars.reduce(function (a, b) { return a + b; }, 0);
    $('walkStars').textContent = stars ? String(stars) + ' ★' : '';
    $('archiveBtn').hidden = !(caps.rewarded || caps.adFree);
    // The home layer is placed from the DOM's sky and plan slots, which move with insets and with the
    // lines above: draw it again from the new layout.
    homeLayer = null;
    requestDraw();
  }

  function setRewardLabel(btn, text) {
    btn.textContent = '';
    if (!caps.adFree) btn.appendChild(icons.icon('ad'));
    var s = document.createElement('span');
    s.textContent = text;
    btn.appendChild(s);
  }

  // ---- starting a courtyard ----
  function startCourt(mode, id) {
    closeSheet();
    var entry, k, design;
    if (mode === 'walk') {
      var r = WALK[id];
      entry = { plan: r[2], best: r[3], cells: r[4] };
      k = r[1];
      design = lan.house();
    } else {
      entry = dailyEntry(id);
      k = DAILY.lanterns;
      design = designFor(id);
    }
    var model = modelFor(entry.plan);
    game = {
      mode: mode, id: id, plan: model.plan, model: model, k: k, best: entry.best, bestCells: entry.cells.slice(),
      cells: [], history: [], sel: -1, hinted: false, rewardedHere: false, spot: -1, done: false, showBest: false,
      design: design, glass: design.glass[0], bits: null, count: 0, flareT0: 0
    };
    for (var i = 0; i < k; i++) game.cells.push(null);
    var cur = P.current;
    if (cur && cur.mode === mode && cur.id === id) {
      for (var j = 0; j < k; j++) {
        var c = cur.cells[j];
        if (c != null && model.slot[c] >= 0 && game.cells.indexOf(c) < 0) game.cells[j] = c;
      }
      game.hinted = cur.hinted;
      game.rewardedHere = cur.rewarded;
      if (game.hinted) game.spot = pickSpot();
    }
    fade = null;
    resetFade();
    counter.shown = 0; counter.to = 0; counter.from = 0;
    game.count = -1;
    setupHud();
    setScreen('play');
    relight(-1, true);
    updateLight();
    if (mode === 'walk' && id === 0 && !P.tutorial && game.cells.every(function (x) { return x == null; })) {
      tutor = { phase: 0, idx: 0, cell: game.bestCells[0], t0: performance.now() };
    }
    if (mode !== 'walk' && !P.coach) {
      showCoach(t('how4'));
      P.coach = true;
      persist();
    }
    requestDraw();
  }

  function setupHud() {
    var tg = $('hudTargets');
    tg.textContent = '';
    if (game.mode === 'walk') {
      var th = prog.thresholds(game.best);
      for (var i = 0; i < 3; i++) {
        var s = document.createElement('span');
        s.className = 't';
        for (var j = 0; j <= i; j++) s.appendChild(icons.icon('star'));
        s.appendChild(document.createTextNode(String(th[i])));
        tg.appendChild(s);
      }
    } else {
      var d = document.createElement('span');
      d.textContent = dateLabel(game.id);
      tg.appendChild(d);
    }
    $('hintBtn').hidden = !hintOffered();
    showCount(0);
  }

  function hintOffered() {
    return !!(game && game.mode === 'walk' && P.tutorial && !game.done && !game.hinted && (caps.rewardedReady || caps.adFree));
  }

  function showCoach(text) {
    var el = $('coach');
    el.textContent = text;
    el.hidden = false;
    // In the larger free gap: under the plan above the tray, or under the HUD.
    if (lay) {
      var below = lay.trayY - 34 - (lay.py + lay.ph + lay.frame);
      var above = lay.py - lay.frame - lay.top - lay.hangH;
      el.style.top = below >= above ? 'auto' : (lay.top + lay.hangH + 4) + 'px';
      el.style.bottom = below >= above ? (H - lay.trayY + 34 + Math.max(0, (below - el.offsetHeight) / 2)) + 'px' : 'auto';
    }
    el.style.opacity = '1';
    clearTimeout(showCoach.timer);
    showCoach.timer = setTimeout(hideCoach, 6500);
  }
  function hideCoach() {
    var el = $('coach');
    if (el.hidden) return;
    el.style.opacity = '0';
    setTimeout(function () { el.hidden = true; }, 400);
  }

  function updateLight() {
    var lb = $('lightBtn');
    var all = game && !game.done && game.cells.every(function (c) { return c != null; });
    lb.disabled = !all;
    lb.classList.toggle('ready', !!all);
    $('undoBtn').disabled = !game || game.done || !game.history.length;
  }

  // ---- input ----
  function hitTest(x, y) {
    if (!game.done) {
      for (var i = 0; i < game.k; i++) {
        if (game.cells[i] != null) continue;
        var dx = x - lay.trayXs[i], dy = y - lay.trayY;
        if (dx * dx + dy * dy <= 30 * 30) return { kind: 'tray', idx: i };
      }
    }
    var cell = cellAtPoint(x, y);
    if (cell < 0) return null;
    var li = game.cells.indexOf(cell);
    if (li >= 0) return { kind: 'lantern', idx: li, cell: cell };
    return { kind: 'cell', cell: cell };
  }

  function cellAtPoint(x, y) {
    var cx = Math.floor((x - lay.px) / lay.cs), cy = Math.floor((y - lay.py) / lay.cs);
    if (cx < 0 || cy < 0 || cx >= game.plan.w || cy >= game.plan.h) return -1;
    return cy * game.plan.w + cx;
  }

  function validTarget(cell, idx) {
    if (cell < 0 || game.model.slot[cell] < 0) return false;
    var at = game.cells.indexOf(cell);
    return at < 0 || at === idx;
  }

  canvas.addEventListener('pointerdown', function (e) {
    au.unlock();
    if (screen !== 'play' || !game || game.done || sheetOpen || drag) return;
    if (tutor) { tutor = null; }
    hideCoach();
    var hit = hitTest(e.clientX, e.clientY);
    if (!hit) {
      if (game.sel >= 0) { game.sel = -1; requestDraw(); }
      return;
    }
    drag = { pid: e.pointerId, hit: hit, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false, touch: e.pointerType !== 'mouse', target: -1, preview: null };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* old WebView */ }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    var dx = drag.x - drag.sx, dy = drag.y - drag.sy;
    if (!drag.moved && (drag.hit.kind === 'tray' || drag.hit.kind === 'lantern') && dx * dx + dy * dy > 64) {
      drag.moved = true;
      drag.idx = drag.hit.idx;
      drag.origin = game.cells[drag.idx];
      game.sel = -1;
    }
    if (!drag.moved) return;
    var cell = cellAtPoint(drag.x, drag.y - (drag.touch ? LIFT : 0));
    var target = validTarget(cell, drag.idx) ? cell : -1;
    if (target !== drag.target) {
      drag.target = target;
      // Live preview: the light follows the lantern cell by cell.
      game.cells[drag.idx] = target >= 0 ? target : null;
      relight(target, true);
    }
    requestDraw();
  });

  function endDrag(e, cancelled) {
    if (!drag || (e && e.pointerId !== drag.pid)) return;
    var d = drag;
    drag = null;
    if (d.moved) {
      var before = game.cells.slice();
      before[d.idx] = d.origin;
      if (cancelled) {
        game.cells[d.idx] = d.origin;
        relight(-1, true);
      } else if (d.target >= 0) {
        game.cells[d.idx] = d.target;
        if (d.target !== d.origin) committed(before, d.idx);
        else relight(-1, true);
      } else {
        game.cells[d.idx] = null;
        if (d.origin != null) { committed(before, d.idx); au.knock(); } else relight(-1, true);
      }
    } else if (!cancelled) {
      tap(d.hit);
    }
    requestDraw();
  }
  canvas.addEventListener('pointerup', function (e) { endDrag(e, false); });
  canvas.addEventListener('pointercancel', function (e) { endDrag(e, true); });
  canvas.addEventListener('lostpointercapture', function (e) { if (drag && drag.pid === e.pointerId) endDrag(e, false); });

  function tap(hit) {
    if (hit.kind === 'tray') {
      game.sel = game.sel === hit.idx ? -1 : hit.idx;
      return;
    }
    if (hit.kind === 'lantern') {
      game.sel = game.sel === hit.idx ? -1 : hit.idx;
      return;
    }
    if (!validTarget(hit.cell, -1)) { game.sel = -1; return; }
    var idx = game.sel >= 0 ? game.sel : game.cells.indexOf(null);
    if (idx < 0) return;
    var before = game.cells.slice();
    game.cells[idx] = hit.cell;
    game.sel = -1;
    committed(before, idx);
  }

  /** A move happened: history, light, sound, embers, coaching. */
  function committed(before, idx) {
    game.history.push(before);
    if (game.history.length > 200) game.history.shift();
    var cell = game.cells[idx];
    relight(cell != null ? cell : -1, false);
    if (cell != null) {
      var frac = game.best ? game.count / game.best : 0;
      au.chime(Math.round(frac * 10));
      Shell.haptic('tap');
      spawnEmbers(cellXY(cell));
    }
    P.current = { mode: game.mode, id: game.id, cells: game.cells.slice(), hinted: game.hinted, rewarded: game.rewardedHere };
    if (game.mode === 'walk' && game.id === 0 && !P.tutorial) {
      var left = game.cells.indexOf(null);
      tutor = left >= 0 && game.cells.some(function (c) { return c != null; }) ? { phase: 1, idx: left, cell: -1, t0: performance.now() } : null;
    }
    updateLight();
  }

  function undo() {
    if (!game || game.done || !game.history.length) return;
    game.cells = game.history.pop();
    game.sel = -1;
    relight(-1, true);
    P.current = { mode: game.mode, id: game.id, cells: game.cells.slice(), hinted: game.hinted, rewarded: game.rewardedHere };
    updateLight();
  }

  window.addEventListener('keydown', function (e) {
    if (screen !== 'play' || sheetOpen) return;
    if (e.key === 'z' || e.key === 'Z') undo();
    else if (e.key === 'Enter') doLight();
  });

  $('undoBtn').addEventListener('click', undo);
  $('pauseBtn').addEventListener('click', openPause);
  $('lightBtn').addEventListener('click', doLight);
  $('hintBtn').addEventListener('click', openHint);

  // ---- Light and results ----
  function doLight() {
    if (!game || game.done || game.cells.some(function (c) { return c == null; })) return;
    game.done = true;
    game.sel = -1;
    tutor = null;
    hideCoach();
    game.flareT0 = performance.now();
    if (!reduced()) { shake.until = performance.now() + 300; shake.mag = 2; }
    au.bloom();
    Shell.haptic('medium');
    var lit = game.count, best = game.best;
    game.collected = false;
    if (game.mode === 'walk') {
      prog.recordWalk(P, game.id, lit, best, game.hinted);
      P.tutorial = true;
    } else {
      P.daily[game.id] = { lit: lit, best: best, cells: game.cells.slice(), how: game.mode === 'archive' ? 'archive' : 'today' };
      // Recorded for the day the daily belongs to, so one finished just after midnight still counts.
      if (game.mode === 'daily') P.streak = cal.recordStreak(P.streak, game.id);
      var ram = cal.ramadan(game.id, P.shift);
      if (ram && ram.lantern) game.collected = prog.collectLantern(P, ram.year, ram.lantern);
    }
    P.current = null;
    persist();
    updateLight();
    $('lightBtn').hidden = true;
    requestDraw();
    setTimeout(showResult, reduced() ? 150 : 650);
  }

  function showResult() {
    if (!game || !game.done) return;
    var lit = game.count, best = game.best, perfect = lit >= best;
    var walk = game.mode === 'walk';
    $('resLit').textContent = String(lit);
    $('resOf').textContent = '/ ' + best;
    var st = $('resStars');
    st.textContent = '';
    st.hidden = !walk;
    if (walk) {
      var n = prog.stars(lit, best);
      for (var i = 0; i < 3; i++) {
        var ic = icons.icon('star', i < n ? 'on' : '');
        st.appendChild(ic);
      }
      if (game.hinted) { var hm = document.createElement('span'); hm.className = 'hintmark'; hm.title = t('aria.hinted'); st.appendChild(hm); }
      st.setAttribute('aria-label', t('starsOf', { n: n, m: 3 }));
    }
    $('resPerfect').hidden = !perfect;
    $('resLine').textContent = walk ? t('ch' + WALK[game.id][0]) + ', ' + t('courtyardN', { n: game.id + 1 }) :
      (perfect ? '' : t('percentOfBest', { p: prog.percent(lit, best) }));
    $('resLine').hidden = !$('resLine').textContent;
    $('resToggle').hidden = walk;
    setSeg(false);
    var note = '';
    if (!walk && game.collected) note = t('lanternJoined');
    else if (game.mode === 'daily' && game.id === today) note = t('newTomorrow');
    $('resNote').hidden = !note;
    $('resNote').textContent = note;
    // Buttons: Night walk leads with Next; a daily leads to Night walk; an archive day back to the archive.
    var next = $('resNext');
    next.textContent = '';
    if (walk) {
      next.appendChild(document.createTextNode(t('next')));
      next.appendChild(icons.icon('next'));
      next.setAttribute('data-icon', 'next');
    } else if (game.mode === 'archive') {
      next.removeAttribute('data-icon');
      next.appendChild(icons.icon('archive'));
      next.appendChild(document.createTextNode(t('archive')));
    } else {
      next.removeAttribute('data-icon');
      next.appendChild(icons.icon('moon'));
      next.appendChild(document.createTextNode(t('nightWalk')));
    }
    $('resRetry').hidden = !walk;
    $('resShare').hidden = !(caps.share && typeof Shell.share === 'function');
    setScreen('result');
    requestAnimationFrame(function () { relayout(); });
    if (perfect && game.justLit !== false) {
      au.perfect();
      Shell.haptic('success');
      spawnRing(cellXY(game.cells[0]));
    }
    // Remove ads on its own: once, inline in this panel (no pop-in that could catch a tap meant for Next).
    var offer = game.justLit !== false && prog.offerDue(P, perfect, caps, game.mode, game.id);
    $('resOffer').hidden = !offer;
    if (offer) {
      P.offer.shown = true;
      persist();
      $('resBuy').textContent = caps.removeAdsPrice ? t('buy', { price: priceText() }) : t('buyPlain');
    }
  }

  function setSeg(best) {
    game.showBest = best;
    $('segYours').setAttribute('aria-pressed', String(!best));
    $('segBest').setAttribute('aria-pressed', String(best));
    relight(-1, true);
    setCounterNow(best ? game.best : L.count(game.model, game.cells));
  }
  function setCounterNow(v) { counter.from = counter.to = counter.shown = v; showCount(v); }

  $('segYours').addEventListener('click', function () { setSeg(false); });
  $('segBest').addEventListener('click', function () { setSeg(true); });
  $('resHome').addEventListener('click', goHome);
  $('resRetry').addEventListener('click', function () {
    if (!game || game.mode !== 'walk') return;
    // A spot already paid for stays on Try again: no second ad for the same courtyard.
    if (game.hinted) P.current = { mode: 'walk', id: game.id, cells: [], hinted: true, rewarded: false };
    startCourt('walk', game.id);
  });
  $('resNext').addEventListener('click', function () {
    if (!game || busy) return;
    if (game.mode === 'walk') walkNext();
    else if (game.mode === 'archive') openArchive();
    else openWalk(true);
  });
  $('resShare').addEventListener('click', shareResult);

  /** Night walk Next: an interstitial only when the game's own counts allow, then the next courtyard. */
  function walkNext() {
    var idx = game.id + 1;
    var chapterBreak = idx < WALK.length && WALK[idx][0] !== WALK[game.id][0];
    var go = function () {
      busy = false;
      if (idx >= WALK.length) openWalk(false);
      else if (chapterBreak) openChapter(idx);
      else startCourt('walk', idx);
    };
    prog.walkBreak(P);
    persist();
    if (caps.platform === 'android' && caps.interstitial && prog.interstitialDue(P, game.rewardedHere, caps.adFree)) {
      busy = true;
      $('resNext').disabled = true;
      Shell.interstitial(chapterBreak ? 'walk_chapter' : 'walk_next').then(function (r) {
        $('resNext').disabled = false;
        prog.afterInterstitial(P, !!r.shown);
        persist();
        go();
      });
    } else {
      go();
    }
  }

  function viewResult(mode, day) {
    var res = P.daily[day];
    if (!res) return;
    startCourt(mode, day);
    game.cells = res.cells.slice(0, game.k);
    while (game.cells.length < game.k) game.cells.push(null);
    game.done = true;
    game.justLit = false;
    tutor = null;
    $('coach').hidden = true;
    relight(-1, true);
    setCounterNow(res.lit);
    showResult();
  }

  // ---- share ----
  function shareResult() {
    if (!game || !game.done) return;
    var lit = L.count(game.model, game.cells), best = game.best;
    var rtl = S.dir() === 'rtl';
    var png, label, link;
    if (game.mode === 'daily' && game.id === today) {
      var ram = cal.ramadan(game.id, P.shift);
      var greeting = ram ? (ram.phase === 'eid' ? t('greetEid') : t('greetRamadan')) : '';
      label = dateLabel(game.id);
      png = shareLib.dailyCard({ plan: game.plan, design: game.design, greeting: greeting, dateLabel: label, lit: lit, best: best, perfectWord: t('perfect'), rtl: rtl });
      link = shareLib.url(game.id);
    } else {
      var bits = L.litBits(game.model, game.cells);
      label = game.mode === 'walk' ? t('courtyardN', { n: game.id + 1 }) : dateLabel(game.id);
      png = shareLib.courtCard({ plan: game.plan, model: game.model, cells: game.cells, bits: bits, glass: game.glass, title: label, lit: lit, best: best, perfectWord: t('perfect'), rtl: rtl, stars: game.mode === 'walk' ? prog.stars(lit, best) : -1 });
      link = game.mode === 'walk' ? shareLib.url(0) : shareLib.url(game.id);
    }
    // Straight from the tap, no await before it.
    Shell.share({ text: shareLib.text(label, lit, best, t('perfect')), url: link, png: png }).then(function (r) {
      if (r.reason === 'copied') toast(t('share.copied'));
      else if (!r.ok && r.reason !== 'cancelled' && r.reason !== 'busy') toast(t('share.failed'));
    });
  }

  // ---- Night walk list and chapter card ----
  function openWalk(continueNext) {
    if (continueNext) {
      // From the daily result: straight into the newest open courtyard not yet lit, else the list.
      var next = P.walk.open - 1;
      if (next < WALK.length && !P.walk.stars[next] && !P.walk.lit[next]) { startCourt('walk', next); return; }
    }
    var box = $('chapters');
    box.textContent = '';
    for (var ch = 1; ch <= 3; ch++) {
      var sec = document.createElement('section');
      sec.className = 'chapter';
      var h = document.createElement('h3');
      h.textContent = t('ch' + ch);
      var sub = document.createElement('p');
      sub.className = 'minor';
      var got = 0;
      var grid = document.createElement('div');
      grid.className = 'yards';
      WALK.forEach(function (row, idx) {
        if (row[0] !== ch) return;
        got += P.walk.stars[idx];
        var b = document.createElement('button');
        b.className = 'yard';
        var open = idx < P.walk.open;
        if (!open) {
          b.disabled = true;
          b.appendChild(icons.icon('lock'));
          b.setAttribute('aria-label', t('courtyardN', { n: idx + 1 }) + ', ' + t('aria.locked'));
        } else {
          var num = document.createElement('span');
          num.textContent = String(idx + 1);
          b.appendChild(num);
          var s = document.createElement('span');
          s.className = 's';
          for (var k = 0; k < 3; k++) s.appendChild(icons.icon('star', k < P.walk.stars[idx] ? 'on' : ''));
          b.appendChild(s);
          b.setAttribute('aria-label', t('courtyardN', { n: idx + 1 }) + ', ' + t('starsOf', { n: P.walk.stars[idx], m: 3 }));
          if (idx === P.walk.open - 1 && !P.walk.lit[idx]) b.classList.add('next');
          b.addEventListener('click', function () { startCourt('walk', idx); });
        }
        grid.appendChild(b);
      });
      sub.textContent = t('chapter', { n: ch });
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.setAttribute('aria-label', t('starsOf', { n: got, m: 24 }));
      badge.appendChild(icons.icon('star'));
      badge.appendChild(document.createTextNode(got + ' / 24'));
      sub.appendChild(badge);
      sec.appendChild(h);
      sec.appendChild(sub);
      sec.appendChild(grid);
      box.appendChild(sec);
    }
    setScreen('walk');
  }

  function openChapter(idx) {
    var ch = WALK[idx][0];
    openSheet(function (s) {
      el(s, 'p', 'eyebrow', t('chapter', { n: ch }));
      el(s, 'h2', 'big', t('ch' + ch));
      el(s, 'p', 'minor', t('courtyardN', { n: idx + 1 }));
      var bt = el(s, 'div', 'buttons');
      button(bt, 'primary', t('next'), function () { closeSheet(); startCourt('walk', idx); }, 'next');
    }, function () { openWalk(false); });
  }

  // ---- archive ----
  function openArchive() {
    if (!archiveMonth) { var d = cal.dateOf(today); archiveMonth = { y: d.y, m: d.m }; }
    renderArchive();
    setScreen('archive');
  }

  function renderArchive() {
    var y = archiveMonth.y, m = archiveMonth.m;
    $('monName').textContent = monthName(y, m);
    var first = cal.dayNumber(y, m, 1);
    var days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var grid = $('calendar');
    grid.textContent = '';
    var any = false;
    for (var d = 1; d <= days; d++) {
      var day = first + d - 1;
      var b = document.createElement('button');
      b.className = 'day';
      var num = document.createElement('span');
      num.textContent = String(d);
      b.appendChild(num);
      var res = P.daily[day];
      var ram = cal.ramadan(day, P.shift);
      if (ram && ram.lantern) b.classList.add('ram');
      if (day < 1 || day >= today) {
        b.disabled = true;
      } else {
        any = true;
        var small = document.createElement('small');
        if (res) {
          b.classList.add('done');
          if (res.lit >= res.best) { b.classList.add('perfect'); small.textContent = '★'; }
          else small.textContent = prog.percent(res.lit, res.best) + '%';
        }
        b.appendChild(small);
        (function (dd) { b.addEventListener('click', function () { archiveDay(dd); }); })(day);
      }
      b.setAttribute('aria-label', gregorian(day, false) + (res ? ', ' + t('litOf', { lit: res.lit, best: res.best }) : ''));
      grid.appendChild(b);
    }
    $('archiveEmpty').hidden = any;
    var left = prog.archiveLeft(P, today, caps.adFree);
    $('archiveLeft').textContent = caps.adFree || !caps.rewarded ? '' : t('archiveLeft', { n: left });
    var minM = cal.dateOf(1), maxM = cal.dateOf(today);
    $('monPrev').disabled = y * 12 + m <= minM.y * 12 + minM.m;
    $('monNext').disabled = y * 12 + m >= maxM.y * 12 + maxM.m;
  }

  $('monPrev').addEventListener('click', function () { archiveMonth.m--; if (archiveMonth.m < 1) { archiveMonth.m = 12; archiveMonth.y--; } renderArchive(); });
  $('monNext').addEventListener('click', function () { archiveMonth.m++; if (archiveMonth.m > 12) { archiveMonth.m = 1; archiveMonth.y++; } renderArchive(); });

  function archiveDay(day) {
    if (P.daily[day]) { viewResult('archive', day); return; }
    var open = P.ads.archiveOpen.indexOf(day) >= 0;
    if (open || caps.adFree) { startCourt('archive', day); return; }
    var left = prog.archiveLeft(P, today, caps.adFree);
    var ram = cal.ramadan(day, P.shift);
    var missing = ram && ram.lantern && (P.lanterns[String(ram.year)] || []).indexOf(ram.lantern) < 0;
    openSheet(function (s) {
      el(s, 'h2', '', gregorian(day, true));
      if (ram) el(s, 'p', 'eyebrow', dateLabel(day));
      if (missing) el(s, 'p', 'minor', t('archiveRecover'));
      if (left <= 0) el(s, 'p', '', t('archiveNone'));
      else if (caps.rewardedReady) el(s, 'p', 'minor', t('archiveLeft', { n: left }));
      else el(s, 'p', 'minor', t('adNotReady'));
      var bt = el(s, 'div', 'buttons');
      if (left > 0 && caps.rewardedReady) {
        var rb = button(bt, 'reward', '', function () {
          rb.disabled = true;
          Shell.rewarded('archive_night').then(function (r) {
            rb.disabled = false;
            if (r.granted) {
              prog.useArchive(P, today, day);
              persist();
              startCourt('archive', day);
            } else {
              rewardFailed(r);
            }
          });
        });
        setRewardLabel(rb, t('archiveWatch'));
      }
      button(bt, 'secondary', t('close'), closeSheet);
    });
  }

  function rewardFailed(r) {
    if (r.reason === 'skipped') toast(t('adSkipped'));
    else if (r.reason !== 'unavailable') toast(t('adNotReady'));
    refreshCaps();
  }

  // ---- rewarded: hint and streak repair ----
  function pickSpot() {
    var free = game.bestCells.filter(function (c) { return game.cells.indexOf(c) < 0; });
    return free.length ? free[0] : game.bestCells[0];
  }

  function openHint() {
    if (!hintOffered()) return;
    openSheet(function (s) {
      el(s, 'h2', '', t('hint'));
      el(s, 'p', 'minor', t('hintBody'));
      var bt = el(s, 'div', 'buttons');
      var rb = button(bt, caps.adFree ? 'primary' : 'reward', '', function () {
        rb.disabled = true;
        Shell.rewarded('show_spot').then(function (r) {
          rb.disabled = false;
          if (r.granted) {
            closeSheet();
            game.hinted = true;
            if (r.reason === 'watched') game.rewardedHere = true;
            game.spot = pickSpot();
            P.current = { mode: game.mode, id: game.id, cells: game.cells.slice(), hinted: true, rewarded: game.rewardedHere };
            $('hintBtn').hidden = true;
            requestDraw();
          } else {
            rewardFailed(r);
          }
        });
      });
      if (caps.adFree) rb.textContent = t('hint'); else setRewardLabel(rb, t('hintWatch'));
      button(bt, 'secondary', t('close'), closeSheet);
    });
  }

  $('repairBtn').addEventListener('click', function () {
    var b = $('repairBtn');
    b.disabled = true;
    Shell.rewarded('streak_repair').then(function (r) {
      b.disabled = false;
      if (r.granted) {
        P.streak = cal.repairStreak(P.streak, today);
        persist();
        toast(t('repairDone'));
        renderHome();
      } else {
        rewardFailed(r);
      }
    });
  });

  // ---- Remove ads ----
  // Play's price string in a bidi isolate, so Arabic shows "$1.99" whole, not "1.99$".
  function priceText() { return '⁨' + caps.removeAdsPrice + '⁩'; }
  var BUY_SAYS = { owned: 'buy.owned', pending: 'buy.pending', cancelled: 'buy.cancelled', unavailable: 'buy.unavailable', notOffered: 'buy.notOffered', offline: 'buy.offline' };
  function buy() {
    $('buyBtn').disabled = true;
    Shell.buyRemoveAds().then(function (r) {
      $('buyBtn').disabled = false;
      if (r.ok && r.adFree) toast(r.reason === 'owned' ? t('buy.owned') : t('adFreeOn'));
      else if (r.ok) toast(t('buy.pending'));
      else toast(t(BUY_SAYS[r.reason] || 'buy.failed'));
      refreshCaps();
    });
  }
  $('buyBtn').addEventListener('click', buy);
  $('resBuy').addEventListener('click', function () { $('resOffer').hidden = true; buy(); relayout(); });
  $('restoreBtn').addEventListener('click', function () {
    $('restoreBtn').disabled = true;
    Shell.restore().then(function (r) {
      $('restoreBtn').disabled = false;
      if (r.ok) toast(r.adFree ? t('restore.found') : t('restore.none'));
      else toast(t(BUY_SAYS[r.reason] || 'buy.failed'));
      refreshCaps();
    });
  });

  // ---- settings ----
  function openSettings() {
    renderSettings();
    setScreen('settings');
  }

  function seg(box, options, current, onPick) {
    box.textContent = '';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.textContent = o[1];
      b.setAttribute('aria-pressed', String(o[0] === current));
      b.addEventListener('click', function () { onPick(o[0]); });
      box.appendChild(b);
    });
  }

  function renderSettings() {
    seg($('langSeg'), S.LANGS.map(function (l) { return [l, S.NAMES[l]]; }), S.getLang(), function (l) {
      P.lang = l;
      S.setLang(l);
      persist();
      applyStrings();
      renderSettings();
      homeLayer = null;
    });
    toggle($('soundBtn'), P.sound);
    toggle($('ambBtn'), P.ambience);
    seg($('motionSeg'), [['auto', t('auto')], ['reduce', t('on')], ['full', t('off')]], P.motion, function (v) {
      P.motion = v; persist(); applyMotion(); renderSettings();
    });
    seg($('shiftSeg'), [[-1, t('shiftEarlier')], [0, t('shiftNone')], [1, t('shiftLater')]], P.shift, function (v) {
      P.shift = v; persist(); homeLayer = null; renderSettings();
    });
    $('buyRow').hidden = !caps.removeAds && !caps.adFree;
    $('buyBtn').hidden = !!caps.adFree || !caps.removeAds;
    $('adFreeLine').hidden = !caps.adFree;
    $('restoreBtn').hidden = !caps.removeAds && !caps.adFree;
    $('buyBtn').textContent = caps.removeAdsPrice ? t('buy', { price: priceText() }) : t('buyPlain');
    $('privacyBtn').hidden = !caps.privacyOptions;
  }

  function toggle(btn, on) {
    btn.setAttribute('aria-checked', String(!!on));
    btn.textContent = on ? t('on') : t('off');
  }

  $('soundBtn').addEventListener('click', function () { P.sound = !P.sound; au.setSound(P.sound); persist(); renderSettings(); });
  $('ambBtn').addEventListener('click', function () { au.unlock(); P.ambience = !P.ambience; au.setAmbience(P.ambience); persist(); renderSettings(); });
  $('privacyBtn').addEventListener('click', function () { Shell.privacyOptions().then(function () { refreshCaps(); }); });
  $('howBtn').addEventListener('click', openHow);

  function applyMotion() { document.body.classList.toggle('reduce-motion', reduced()); }

  function openHow() {
    openSheet(function (s) {
      el(s, 'h2', '', t('howToPlay'));
      var st = el(s, 'div', 'steps');
      [['flame', 'how1'], ['moon', 'how2'], ['star', 'how3'], ['archive', 'how4']].forEach(function (r) {
        var p = el(st, 'p', '', '');
        p.appendChild(icons.icon(r[0]));
        var sp = document.createElement('span');
        sp.textContent = t(r[1]);
        p.appendChild(sp);
      });
      var bt = el(s, 'div', 'buttons');
      button(bt, 'secondary', t('close'), closeSheet);
    });
  }

  // ---- pause ----
  function openPause() {
    if (screen !== 'play') return;
    saveCurrent();
    openSheet(function (s) {
      el(s, 'h2', '', t('paused'));
      var bt = el(s, 'div', 'buttons');
      button(bt, 'primary', t('resume'), closeSheet, 'play');
      button(bt, 'secondary', t('restart'), function () {
        closeSheet();
        var before = game.cells.slice();
        if (before.some(function (c) { return c != null; })) {
          game.history.push(before);
          game.cells = game.cells.map(function () { return null; });
          relight(-1, true);
          P.current = null;
          updateLight();
        }
      }, 'retry');
      button(bt, 'secondary', t('home'), function () { closeSheet(); goHome(); }, 'home');
    });
  }

  function saveCurrent() {
    if (game && !game.done && screen === 'play') {
      P.current = { mode: game.mode, id: game.id, cells: game.cells.slice(), hinted: game.hinted, rewarded: game.rewardedHere };
    }
    persist();
  }

  function goHome() {
    saveCurrent();
    closeSheet();
    game = null;
    fade = null;
    setScreen('home');
  }

  // ---- sheets and toasts ----
  function el(parent, tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    parent.appendChild(e);
    return e;
  }
  function button(parent, cls, text, onClick, iconName) {
    var b = document.createElement('button');
    b.className = cls;
    var after = iconName === 'next';
    if (iconName && !after) b.appendChild(icons.icon(iconName));
    if (text) { var s = document.createElement('span'); s.textContent = text; b.appendChild(s); }
    if (after) { b.setAttribute('data-icon', 'next'); b.appendChild(icons.icon('next')); }
    b.addEventListener('click', onClick);
    parent.appendChild(b);
    return b;
  }

  function openSheet(build, onClose) {
    var s = $('sheet');
    s.textContent = '';
    build(s);
    sheetOpen = { onClose: onClose || null };
    $('scrim').hidden = false;
    s.hidden = false;
    var f = s.querySelector('button');
    if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* old */ }
    requestDraw();
  }
  function closeSheet() {
    if (!sheetOpen) return;
    var cb = sheetOpen.onClose;
    sheetOpen = null;
    $('sheet').hidden = true;
    $('scrim').hidden = true;
    requestDraw();
    return cb;
  }
  $('scrim').addEventListener('click', function () { var cb = closeSheet(); if (cb) cb(); });

  function toast(text) {
    var el2 = $('toast');
    el2.textContent = text;
    el2.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el2.hidden = true; }, 2800);
  }

  // ---- home buttons ----
  $('playBtn').addEventListener('click', function () {
    au.unlock();
    if (P.daily[today]) viewResult('daily', today);
    else startCourt('daily', today);
  });
  $('walkBtn').addEventListener('click', function () { au.unlock(); openWalk(false); });
  $('archiveBtn').addEventListener('click', openArchive);
  $('settingsBtn').addEventListener('click', openSettings);
  $('walkBack').addEventListener('click', goHome);
  $('archiveBack').addEventListener('click', goHome);
  $('settingsBack').addEventListener('click', goHome);

  // ---- the shell ----
  function refreshCaps() {
    caps = Shell.caps;
    if (screen === 'home') renderHome();
    if (screen === 'settings') renderSettings();
    if (screen === 'archive') renderArchive();
    if (screen === 'play' && game) $('hintBtn').hidden = !hintOffered();
    if (screen === 'result' && game) $('resShare').hidden = !(caps.share && typeof Shell.share === 'function');
    relayout();
  }

  Shell.onChange(function () { refreshCaps(); });
  Shell.onPause(function () {
    if (drag) endDrag(null, true);
    saveCurrent();
    au.suspend();
  });
  Shell.onResume(function () {
    au.resume();
    var now = Math.max(1, cal.today());
    if (now !== today) {
      today = now;
      if (screen === 'home') { homeLayer = null; renderHome(); }
    }
    requestDraw();
  });
  Shell.onBack(function () {
    if (sheetOpen) { var cb = closeSheet(); if (cb) cb(); return true; }
    if (drag) { endDrag(null, true); return true; }
    if (screen === 'play') { openPause(); return true; }
    if (screen === 'result') {
      if (game && game.mode === 'walk') openWalk(false);
      else if (game && game.mode === 'archive') { game = null; openArchive(); }
      else goHome();
      return true;
    }
    if (screen === 'walk' || screen === 'archive' || screen === 'settings') { goHome(); return true; }
    return false;
  });

  document.addEventListener('pointerdown', function () { au.unlock(); }, true);
  window.addEventListener('resize', resize);
  if (mql && mql.addEventListener) mql.addEventListener('change', function () { applyMotion(); requestDraw(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) requestDraw(); });

  // ---- boot ----
  au.setSound(P.sound);
  applyStrings();
  applyMotion();
  resize();
  persist();
  if (!P.tutorial) startCourt('walk', 0);
  else setScreen('home');
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('400 16px "Readex Pro"'), document.fonts.load('600 16px "Readex Pro"')]).then(function () {
      homeLayer = null;
      requestDraw();
    }, function () { /* the fallback font is fine */ });
  }
  Shell.ready().then(function (c) {
    caps = c;
    refreshCaps();
    if (P.ambience) au.setAmbience(true);
  });

  // A tiny hook for the test harness (never used by the game itself).
  window.__lampcourt = {
    state: function () { return { screen: screen, today: today, mode: game && game.mode, id: game && game.id, cells: game && game.cells.slice(), count: game && game.count, best: game && game.best, done: game && game.done, lay: lay, sheet: !!sheetOpen, quality: quality }; },
    progress: function () { return JSON.parse(JSON.stringify(P)); },
    stats: function () { return { frames: stats.frames, partial: stats.partial, ms: stats.ms, bakes: stats.bakes, idle: stats.idle, skip: stats.skip, quality: quality, R: R }; }
  };
})();
