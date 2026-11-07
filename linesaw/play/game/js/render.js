/*
 * The canvas renderer: the dusk sky whose sun is the clock, the rooftops, lines, kites, the saw point of
 * a duel, cut kites floating away, sparks and paper flecks, and the wordless HUD. World units map to
 * screen px with one scale; the world is centred and the sky and roofs run on past it on wide screens.
 * Particles and debris use their own generator and never touch the simulation.
 */
(function (root) {
  'use strict';
  var LS = root.LS;
  var art = LS.art, physics = LS.physics, rng = LS.rng;
  var C = art.C;
  var FONT = 'Barlow, "Segoe UI", Roboto, system-ui, sans-serif';
  var MAX_PARTICLES = 160;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function ease(t) { return t * t * (3 - 2 * t); }

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var R = {
      w: 1, h: 1, d: 1, s: 4, ox: 0, roofY: 0, insets: { top: 0, right: 0, bottom: 0, left: 0 },
      reduced: false, scene: null, layers: null, stars: [], streaks: [], far: [],
      particles: [], debris: [], shake: 0, flash: 0, fx: rng.make(0xfeed5),
      pops: [], dir: 'ltr'
    };

    // The backing store and the three skyline layers are sized once, before Shell.ready(), and in the app
    // never again: the ads SDK's hidden WebView makes WebView 156 draw every canvas created or resized after
    // it on the CPU (WEBGAME-RECIPE.md section 2b). A window change there lowers the scale to fit instead.
    // On the web there is no such WebView, so the canvases still follow the window.
    var BW = 1, BH = 1, follow = true, layerSet = null;
    function layerCanvas(pw, ph) {
      var c = document.createElement('canvas');
      c.width = pw;
      c.height = ph;
      return { c: c, x: c.getContext('2d') };
    }
    function allocate(pw, ph) {
      BW = Math.max(1, pw); BH = Math.max(1, ph);
      canvas.width = BW;
      canvas.height = BH;
      layerSet = { far: layerCanvas(BW, BH), near: layerCanvas(BW, BH), lit: layerCanvas(BW, BH) };
      R.layers = null;
    }

    /** Once, before Shell.ready(): w and h in CSS px, fixed true in the app (never resized afterwards). */
    R.alloc = function (w, h, d, fixed) {
      var dd = Math.min(2, d || 1);
      allocate(Math.round(w * dd), Math.round(h * dd));
      follow = !fixed;
    };

    R.resize = function (w, h, d, insets) {
      R.w = w; R.h = h; R.d = Math.min(2, d || 1);
      R.insets = insets || R.insets;
      var pw = Math.max(1, Math.round(w * R.d)), ph = Math.max(1, Math.round(h * R.d));
      if (follow && (pw !== BW || ph !== BH)) allocate(pw, ph);
      R.d = Math.min(R.d, BW / w, BH / h);
      canvas.style.width = BW / R.d + 'px';
      canvas.style.height = BH / R.d + 'px';
      var bottomBand = Math.max(64, h * 0.085) + R.insets.bottom;
      R.roofY = h - bottomBand;
      var topRoom = Math.max(96, h * 0.12) + R.insets.top;
      R.s = Math.min(w / physics.W, (R.roofY - topRoom) / physics.H);
      R.ox = (w - physics.W * R.s) / 2;
      R.layers = null;
      fitCache = {};
      var r = rng.make(0x57a25);
      R.stars = [];
      for (var i = 0; i < 70; i++) R.stars.push({ x: r.next() * w, y: r.next() * R.roofY * 0.7, a: 0.3 + 0.7 * r.next(), z: r.next() < 0.15 ? 1.6 : 1 });
      R.streaks = [];
      for (var j = 0; j < 16; j++) R.streaks.push({ x: r.next() * w, y: R.roofY * (0.15 + 0.75 * r.next()), l: 18 + 40 * r.next(), v: 0.6 + 0.8 * r.next() });
      buildFar();
    };

    R.setReduced = function (v) { R.reduced = !!v; };

    /** The words' direction: rtl for Urdu. Only words follow it; numbers, the field and the halves never mirror. */
    R.setDir = function (d) { R.dir = d === 'rtl' ? 'rtl' : 'ltr'; };

    /** scene: {seed, festival, hands: [left x, right x] in world units}. Rebuilds the roofs when it changes. */
    R.setScene = function (scene) {
      var key = scene ? scene.seed + '|' + scene.festival + '|' + scene.hands.join(',') : '';
      if (R.scene && R.scene.key === key && R.layers) return;
      R.scene = scene ? { seed: scene.seed, festival: scene.festival, hands: scene.hands.slice(), key: key } : null;
      R.layers = null;
      buildFar();
    };

    function buildFar() {
      var r = rng.make(((R.scene && R.scene.seed) || 3) ^ 0xabc);
      var n = R.scene && R.scene.festival ? 34 : 5;
      var cols = ['#e7a1b0', '#f0d38a', '#8fd0c6', '#efe6d2', '#e88a6a', '#b9a3e3'];
      R.far = [];
      for (var i = 0; i < n; i++) {
        R.far.push({ x: r.next(), y: 0.08 + 0.55 * r.next(), s: 3 + 4 * r.next(), c: cols[i % cols.length], ph: r.next() * 6.28, a: 0.25 + 0.35 * r.next() });
      }
    }

    function ensureLayers() {
      if (R.layers || !R.scene) return;
      var hands = R.scene.hands.map(function (x) { return R.ox + x * R.s; });
      R.layers = art.skyline(R.w, R.h, R.roofY, R.d, R.scene.seed, hands, layerSet);
    }

    R.sx = function (x) { return R.ox + x * R.s; };
    R.sy = function (y) { return R.roofY - y * R.s; };

    // ---- effects the game asks for ----

    function particle(p) {
      if (R.particles.length >= (R.reduced ? MAX_PARTICLES / 2 : MAX_PARTICLES)) R.particles.shift();
      R.particles.push(p);
    }

    /** A line cut: the loser's kite floats off with its piece of line, the rest falls; sparks and flecks. */
    R.cut = function (d, color, wind) {
      var f = R.fx;
      var cut = d.seg + 1;
      var line = d.line;
      var tail = [];
      for (var i = cut; i < line.px.length; i++) tail.push({ x: line.px[i], y: line.py[i], ox: line.px[i], oy: line.py[i] });
      tail.unshift({ x: d.x, y: d.y, ox: d.x, oy: d.y });
      var fall = [];
      for (var j = 0; j < cut; j++) fall.push({ x: line.px[j], y: line.py[j], ox: line.px[j], oy: line.py[j] });
      fall.push({ x: d.x, y: d.y, ox: d.x, oy: d.y });
      var k = d.kite;
      R.debris.push({
        kind: 'kite', x: k.x, y: k.y, vx: k.vx * 0.4 + (wind || 0) * 0.6 + (k.side === 0 ? -2 : 2), vy: Math.max(4, k.vy * 0.3 + 6),
        th: k.th, om: (k.om || 0) * 0.3 + (f.next() < 0.5 ? -3 : 3), color: color, pattern: k.pattern, age: 0, life: 3.4, tail: tail.reverse()
      });
      R.debris.push({ kind: 'fall', pts: fall, age: 0, life: 1.6 });
      var n = R.reduced ? 10 : 22;
      for (var p = 0; p < n; p++) {
        var a = f.next() * Math.PI * 2, sp = 8 + f.next() * 26;
        particle({ kind: 'spark', x: d.x, y: d.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.35 + f.next() * 0.35, size: 1.6, c: '#fff1c7' });
      }
      var m = R.reduced ? 6 : 14;
      for (var q = 0; q < m; q++) {
        var b = f.next() * Math.PI * 2, sq = 5 + f.next() * 14;
        particle({ kind: 'fleck', x: k.x, y: k.y, vx: Math.cos(b) * sq + (wind || 0) * 0.5, vy: Math.sin(b) * sq + 4, age: 0, life: 1.2 + f.next() * 0.8, size: 0.9 + f.next() * 0.9, c: color, rot: f.next() * 6, vr: (f.next() - 0.5) * 12 });
      }
      if (!R.reduced) R.shake = Math.max(R.shake, 4);
      R.flash = 1;
    };

    /** A small burst of paper colour (rings, launch). */
    R.burst = function (x, y, color, n) {
      var f = R.fx;
      n = R.reduced ? Math.ceil((n || 10) / 2) : (n || 10);
      for (var i = 0; i < n; i++) {
        var a = f.next() * Math.PI * 2, sp = 6 + f.next() * 12;
        particle({ kind: 'fleck', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.8 + f.next() * 0.5, size: 0.8, c: color, rot: 0, vr: (f.next() - 0.5) * 10 });
      }
    };

    /** A floating number or mark at a world point: {text, color}. */
    R.pop = function (x, y, text, color, big) {
      R.pops.push({ x: x, y: y, text: text, color: color || C.cotton, age: 0, life: 1.3, big: !!big });
    };

    R.clearFx = function () {
      R.particles.length = 0;
      R.debris.length = 0;
      R.pops.length = 0;
      R.shake = 0;
    };

    function stepFx(dt, wind) {
      for (var i = R.particles.length - 1; i >= 0; i--) {
        var p = R.particles[i];
        p.age += dt;
        if (p.age >= p.life) { R.particles.splice(i, 1); continue; }
        if (p.kind === 'spark') {
          p.vx *= Math.exp(-dt * 3); p.vy = p.vy * Math.exp(-dt * 3) - 20 * dt;
        } else {
          p.vx += ((wind || 0) * 0.8 - p.vx) * dt * 1.5;
          p.vy += (-6 - p.vy) * dt * 1.2;
          p.rot += p.vr * dt;
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (var j = R.debris.length - 1; j >= 0; j--) {
        var d = R.debris[j];
        d.age += dt;
        if (d.age >= d.life) { R.debris.splice(j, 1); continue; }
        if (d.kind === 'kite') {
          d.vx += ((wind || 0) * 1.3 + (d.vx > 0 ? 3 : -3) - d.vx) * dt * 0.8;
          d.vy += (-2.5 - d.vy) * dt * 0.6;
          d.x += d.vx * dt; d.y += d.vy * dt;
          d.th += d.om * dt;
          chain(d.tail, d.x, d.y, dt, 2.2);
        } else {
          // the free end falls, then the line is reeled in from the top
          chain(d.pts, null, null, dt, 2.2, true);
          if (d.age > 0.6 && d.pts.length > 2 && R.fx.next() < dt * 14) d.pts.pop();
        }
      }
      for (var k = R.pops.length - 1; k >= 0; k--) {
        R.pops[k].age += dt;
        if (R.pops[k].age >= R.pops[k].life) R.pops.splice(k, 1);
      }
      R.shake *= Math.exp(-dt / 0.09);
      if (R.shake < 0.2) R.shake = 0;
      R.flash *= Math.exp(-dt / 0.18);
    }

    // A loose verlet chain: pinned at its first point (to a kite) or at the hand (fromHand).
    function chain(pts, px, py, dt, seg, fromHand) {
      if (!pts.length) return;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if ((i === 0 && !fromHand) || (fromHand && i === 0)) continue;
        var vx = (p.x - p.ox) * 0.98, vy = (p.y - p.oy) * 0.98;
        p.ox = p.x; p.oy = p.y;
        p.x += vx; p.y += vy - 30 * dt * dt;
        if (p.y < 0) p.y = 0;
      }
      if (!fromHand && px != null) { pts[0].x = px; pts[0].y = py; }
      for (var it = 0; it < 3; it++) {
        for (var j = 0; j < pts.length - 1; j++) {
          var a = pts[j], b = pts[j + 1];
          var dx = b.x - a.x, dy = b.y - a.y;
          var dl = Math.sqrt(dx * dx + dy * dy) || 1e-6;
          if (dl <= seg * 4) continue;
          var diff = (dl - seg * 4) / dl;
          if (j === 0) { b.x -= dx * diff; b.y -= dy * diff; }
          else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
        }
      }
    }

    // ---- drawing ----

    // A smooth curve through the line's nodes (quadratic segments between midpoints).
    function polyline(xs, ys, n) {
      ctx.beginPath();
      ctx.moveTo(R.sx(xs[0]), R.sy(ys[0]));
      for (var i = 1; i < n - 1; i++) {
        var mx = (xs[i] + xs[i + 1]) / 2, my = (ys[i] + ys[i + 1]) / 2;
        ctx.quadraticCurveTo(R.sx(xs[i]), R.sy(ys[i]), R.sx(mx), R.sy(my));
      }
      ctx.lineTo(R.sx(xs[n - 1]), R.sy(ys[n - 1]));
    }

    var bufX = [new Float64Array(physics.SEGS + 1), new Float64Array(physics.SEGS + 1)];
    var bufY = [new Float64Array(physics.SEGS + 1), new Float64Array(physics.SEGS + 1)];

    function lerpLine(side, k, snap, a) {
      var xs = bufX[side], ys = bufY[side];
      var n = physics.SEGS + 1;
      var use = snap && snap.k === k;
      for (var i = 0; i < n; i++) {
        xs[i] = use ? snap.px[i] + (k.px[i] - snap.px[i]) * a : k.px[i];
        ys[i] = use ? snap.py[i] + (k.py[i] - snap.py[i]) * a : k.py[i];
      }
      return use;
    }

    function drawSkyAndRoofs(v) {
      var p = clamp(v.p, 0, 1);
      art.sky(ctx, R.w, 0, R.roofY, R.h, p, R.scene && R.scene.festival);
      // stars after the sun is down
      var sa = clamp((p - 0.55) / 0.4, 0, 1);
      if (sa > 0) {
        ctx.fillStyle = '#efe6d2';
        for (var i = 0; i < R.stars.length; i++) {
          var st = R.stars[i];
          ctx.globalAlpha = sa * st.a * (R.reduced ? 1 : 0.75 + 0.25 * Math.sin(v.realT * 1.7 + i));
          ctx.fillRect(st.x, st.y, st.z, st.z);
        }
        ctx.globalAlpha = 1;
      }
      // the sun is the clock: it sets behind the roofs over the sky
      var worldH = physics.H * R.s;
      var sr = Math.max(14, R.s * 7);
      var sxp = R.ox + physics.W * R.s * 0.66;
      var syp = v.sunLift != null ? R.roofY - worldH * v.sunLift : R.roofY - worldH * 0.28 + (worldH * 0.28 + sr * 1.6) * ease(p);
      art.sun(ctx, sxp, syp, sr, p);
      // distant kites
      for (var j = 0; j < R.far.length; j++) {
        var f = R.far[j];
        var bob = R.reduced ? 0 : Math.sin(v.realT * 0.6 + f.ph) * 3;
        art.kite(ctx, f.x * R.w, f.y * R.roofY + bob, Math.sin(v.realT * 0.3 + f.ph) * 0.25, f.s, { color: f.c, pattern: j % 3, alpha: f.a * (1 - 0.4 * p) });
      }
      // wind streaks
      var wind = v.wind || 0;
      var gust = Math.abs(v.gust || 0);
      ctx.strokeStyle = 'rgba(239, 230, 210, ' + (0.05 + Math.min(0.12, gust * 0.02)) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var k = 0; k < R.streaks.length; k++) {
        var s = R.streaks[k];
        if (!R.reduced) s.x += wind * R.s * s.v * (v.rdt || 0) * 1.6;
        if (s.x > R.w + s.l) s.x = -s.l;
        if (s.x < -s.l) s.x = R.w + s.l;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + s.l * (wind >= 0 ? 1 : -1), s.y + 0.6);
      }
      ctx.stroke();
      ensureLayers();
      if (R.layers) {
        // The layers are the backing store's size; only the window's part of them is drawn.
        var lw = R.w * R.d, lh = R.h * R.d;
        ctx.drawImage(R.layers.far, 0, 0, lw, lh, 0, 0, R.w, R.h);
        ctx.drawImage(R.layers.near, 0, 0, lw, lh, 0, 0, R.w, R.h);
        ctx.globalAlpha = 0.2 + 0.8 * clamp((p - 0.15) / 0.6, 0, 1);
        ctx.drawImage(R.layers.lit, 0, 0, lw, lh, 0, 0, R.w, R.h);
        ctx.globalAlpha = 1;
      }
    }

    function lineColor(k, v) {
      return k.hold ? 'rgba(244, 236, 220, 0.95)' : 'rgba(239, 230, 210, 0.72)';
    }

    function drawLines(v) {
      var w = v.world;
      for (var side = 0; side < 2; side++) {
        var k = w.kites[side];
        if (!k) continue;
        lerpLine(side, k, v.snaps && v.snaps[side], v.alpha);
        ctx.lineWidth = k.hold ? 1.6 : 1.3;
        ctx.strokeStyle = lineColor(k, v);
        polyline(bufX[side], bufY[side], physics.SEGS + 1);
        ctx.stroke();
      }
      var duel = w.duel;
      if (!duel || !w.kites[0] || !w.kites[1]) return;
      var cx = R.sx(duel.x), cy = R.sy(duel.y);
      var a = w.kites[0], b = w.kites[1];
      // the winning line glows gold near the saw point
      var lead = a.wear + 0.06 < b.wear ? 0 : b.wear + 0.06 < a.wear ? 1 : -1;
      if (lead >= 0) {
        var gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R.s * 22);
        gg.addColorStop(0, 'rgba(255, 214, 120, 0.55)');
        gg.addColorStop(1, 'rgba(255, 214, 120, 0)');
        ctx.strokeStyle = gg;
        ctx.lineWidth = 6;
        polyline(bufX[lead], bufY[lead], physics.SEGS + 1);
        ctx.stroke();
      }
      // a hot line turns red from the saw point outwards
      for (var s2 = 0; s2 < 2; s2++) {
        var kk = w.kites[s2];
        if (kk.heat < 0.08) continue;
        var hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R.s * (5 + kk.heat * 18));
        hg.addColorStop(0, 'rgba(255, 86, 54, ' + Math.min(1, kk.heat * 1.2) + ')');
        hg.addColorStop(1, 'rgba(255, 86, 54, 0)');
        ctx.strokeStyle = hg;
        ctx.lineWidth = 2.6;
        polyline(bufX[s2], bufY[s2], physics.SEGS + 1);
        ctx.stroke();
      }
    }

    function drawDuel(v) {
      var w = v.world;
      var duel = w.duel;
      if (!duel || !w.kites[0] || !w.kites[1]) return;
      var cx = R.sx(duel.x), cy = R.sy(duel.y);
      var pulse = R.reduced ? 1 : 0.85 + 0.15 * Math.sin(v.realT * 40);
      var r = R.s * 3.2 * pulse;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4);
      g.addColorStop(0, 'rgba(255, 246, 220, 1)');
      g.addColorStop(0.25, 'rgba(255, 200, 110, 0.85)');
      g.addColorStop(1, 'rgba(255, 160, 70, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      if (!R.reduced) {
        ctx.strokeStyle = 'rgba(255, 241, 199, 0.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        var rot = v.realT * 9;
        for (var i = 0; i < 4; i++) {
          var an = rot + i * Math.PI / 2;
          ctx.moveTo(cx + Math.cos(an) * r * 0.9, cy + Math.sin(an) * r * 0.9);
          ctx.lineTo(cx + Math.cos(an) * r * 1.9, cy + Math.sin(an) * r * 1.9);
        }
        ctx.stroke();
      }
      // sparks fly from the saw point while the lines saw
      var saw = (duel.sawA || 0) + (duel.sawB || 0);
      var n = (v.rdt || 0) * saw * (R.reduced ? 14 : 34);
      while (n > 0) {
        if (n < 1 && R.fx.next() > n) break;
        n -= 1;
        var an2 = R.fx.next() * Math.PI * 2, sp = 6 + R.fx.next() * 16;
        particle({ kind: 'spark', x: duel.x, y: duel.y, vx: Math.cos(an2) * sp, vy: Math.sin(an2) * sp, age: 0, life: 0.2 + R.fx.next() * 0.25, size: 1.2, c: '#ffd58a' });
      }
      // a fraying icon on each line, a little way down it towards its own rooftop
      for (var s = 0; s < 2; s++) {
        var k = w.kites[s];
        var seg = s === 0 ? duel.ia : duel.ib;
        var pt = downLine(k, seg == null ? 1 : seg + 1, duel.x, duel.y, 9);
        var ix = R.sx(pt.x), iy = R.sy(pt.y);
        var size = Math.max(7, R.s * 2.1);
        ctx.fillStyle = 'rgba(14, 20, 36, 0.78)';
        ctx.beginPath();
        ctx.arc(ix, iy, size * 1.45, 0, Math.PI * 2);
        ctx.fill();
        art.fray(ctx, ix, iy, size, k.wear, v.colors[s], 0);
      }
    }

    // The point dist units from (x, y) back along the line towards the hand, from node i down.
    function downLine(k, i, x, y, dist) {
      var px = x, py = y, left = dist;
      for (var j = Math.min(i, physics.SEGS); j >= 0; j--) {
        var dx = k.px[j] - px, dy = k.py[j] - py;
        var dl = Math.sqrt(dx * dx + dy * dy);
        if (dl >= left && dl > 0) return { x: px + dx / dl * left, y: py + dy / dl * left };
        left -= dl;
        px = k.px[j]; py = k.py[j];
      }
      return { x: px, y: py };
    }

    function drawKites(v) {
      var w = v.world;
      var ks = R.s * 5.2;
      for (var side = 0; side < 2; side++) {
        var k = w.kites[side];
        if (!k) continue;
        var snap = v.snaps && v.snaps[side];
        var use = snap && snap.k === k;
        var x = use ? snap.x + (k.x - snap.x) * v.alpha : k.x;
        var y = use ? snap.y + (k.y - snap.y) * v.alpha : k.y;
        var th = k.th;
        if (use) th = snap.th + physics.wrap(k.th - snap.th) * v.alpha;
        var X = R.sx(x), Y = R.sy(y);
        if (v.aim && v.aim[side] && !k.parked && !k.hold) {
          // where a pull would send the kite
          var nx = Math.sin(th), ny = Math.cos(th);
          ctx.fillStyle = v.colors[side];
          var dots = v.aimLen ? clamp(Math.round((v.aimLen - 3) / 3.2), 6, 24) : 6;
          for (var i = 1; i <= dots; i++) {
            var dd = (3 + i * 3.2) * R.s;
            ctx.globalAlpha = 0.65 * (1 - i / (dots + 1));
            ctx.beginPath();
            ctx.arc(X + nx * dd, Y - ny * dd, Math.max(1.4, R.s * 0.38), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        art.kite(ctx, X, Y, th, ks, { color: v.colors[side], pattern: k.pattern });
      }
    }

    function drawDebris() {
      for (var i = 0; i < R.debris.length; i++) {
        var d = R.debris[i];
        var fade = 1 - clamp((d.age - d.life * 0.55) / (d.life * 0.45), 0, 1);
        ctx.globalAlpha = fade;
        if (d.kind === 'kite') {
          ctx.strokeStyle = 'rgba(239, 230, 210, 0.6)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (var j = 0; j < d.tail.length; j++) {
            var p = d.tail[j];
            if (j === 0) ctx.moveTo(R.sx(p.x), R.sy(p.y)); else ctx.lineTo(R.sx(p.x), R.sy(p.y));
          }
          ctx.stroke();
          art.kite(ctx, R.sx(d.x), R.sy(d.y), d.th, R.s * 5.2, { color: d.color, pattern: d.pattern });
        } else {
          ctx.strokeStyle = 'rgba(239, 230, 210, 0.55)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (var q = 0; q < d.pts.length; q++) {
            var pt = d.pts[q];
            if (q === 0) ctx.moveTo(R.sx(pt.x), R.sy(pt.y)); else ctx.lineTo(R.sx(pt.x), R.sy(pt.y));
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawParticles() {
      for (var i = 0; i < R.particles.length; i++) {
        var p = R.particles[i];
        var a = 1 - p.age / p.life;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.c;
        var X = R.sx(p.x), Y = R.sy(p.y);
        if (p.kind === 'spark') {
          ctx.fillRect(X - p.size, Y - p.size, p.size * 2, p.size * 2);
        } else {
          var sz = p.size * R.s;
          ctx.save();
          ctx.translate(X, Y);
          ctx.rotate(p.rot);
          ctx.fillRect(-sz, -sz * 0.6, sz * 2, sz * 1.2);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawPops() {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var i = 0; i < R.pops.length; i++) {
        var p = R.pops[i];
        var t = p.age / p.life;
        var rise = (R.reduced ? 0 : 18 * ease(Math.min(1, t * 1.5)));
        var scale = R.reduced ? 1 : 1 + 0.35 * Math.max(0, 1 - t * 5);
        ctx.globalAlpha = 1 - clamp((t - 0.6) / 0.4, 0, 1);
        ctx.font = '700 ' + Math.round((p.big ? 30 : 22) * scale) + 'px ' + FONT;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(14, 20, 36, 0.8)';
        var X = R.sx(p.x), Y = R.sy(p.y) - 26 - rise;
        ctx.strokeText(p.text, X, Y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, X, Y);
      }
      ctx.globalAlpha = 1;
    }

    function drawRing(v) {
      var g = v.ring;
      if (!g) return;
      var X = R.sx(g.x), Y = R.sy(g.y);
      var pr = R.reduced ? 0 : Math.sin(v.realT * 4) * 0.08;
      var r = g.r * R.s * (1 + pr);
      ctx.strokeStyle = 'rgba(255, 214, 120, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -v.realT * 20;
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 214, 120, 0.12)';
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 214, 120, 0.9)';
      ctx.beginPath();
      ctx.arc(X, Y, Math.max(2, R.s * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }

    function drawSpools(v) {
      var hands = R.scene ? R.scene.hands : [];
      for (var i = 0; i < hands.length; i++) art.spool(ctx, R.sx(hands[i]), R.roofY, Math.max(10, R.s * 3), v.colors[i]);
    }

    // ---- HUD ----

    function kiteIcon(x, y, size, color, filled) {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.66, -size * 0.12);
      ctx.lineTo(0, size * 0.78);
      ctx.lineTo(-size * 0.66, -size * 0.12);
      ctx.closePath();
      if (filled) { ctx.fillStyle = color; ctx.fill(); }
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = filled ? 'rgba(20, 14, 26, 0.9)' : 'rgba(239, 230, 210, 0.45)';
      ctx.stroke();
      ctx.restore();
    }
    R.kiteIcon = kiteIcon;

    function text(str, x, y, size, color, align, weight) {
      ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
      ctx.textAlign = align || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color || C.cotton;
      ctx.fillText(str, x, y);
    }
    R.text = text;

    // Words on the canvas never run off it, in any language: the largest size from size down to 70
    // percent at which the text fits maxW, else two lines split at the space nearest the middle (between
    // any two characters in a script written without spaces), else the smallest two lines (over: true).
    // Cached, since the hints redraw every frame; resize() clears it.
    var fitCache = {};
    var NO_BREAK_BEFORE = /[\u3001\u3002\uff01\uff1f\uff09\u300d\u30fc\u3099\u309a\u0300-\u036f\udc00-\udfff]/;
    function fit(str, size, maxW, weight) {
      weight = weight || 700;
      var key = weight + '|' + size + '|' + Math.round(maxW) + '|' + str;
      if (fitCache[key]) return fitCache[key];
      var min = Math.max(12, Math.round(size * 0.7));
      var res = null, s;
      for (s = size; s >= min && !res; s--) {
        ctx.font = weight + ' ' + s + 'px ' + FONT;
        if (ctx.measureText(str).width <= maxW) res = { size: s, lines: [str], over: false };
      }
      if (!res) {
        var cuts = [];
        for (var i = 1; i < str.length; i++) if (str.charAt(i) === ' ') cuts.push(i);
        if (!cuts.length) for (var j = 1; j < str.length; j++) if (!NO_BREAK_BEFORE.test(str.charAt(j))) cuts.push(j);
        for (s = size; s >= min && !res; s--) {
          ctx.font = weight + ' ' + s + 'px ' + FONT;
          var best = null, bw = Infinity;
          for (var c = 0; c < cuts.length; c++) {
            var a = str.slice(0, cuts[c]).trim(), b = str.slice(cuts[c]).trim();
            var w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
            if (w < bw) { bw = w; best = [a, b]; }
          }
          if (best && (bw <= maxW || s === min)) res = { size: s, lines: best, over: bw > maxW };
        }
        if (!res) res = { size: min, lines: [str], over: true };
      }
      ctx.font = weight + ' ' + res.size + 'px ' + FONT;
      res.widths = res.lines.map(function (l) { return ctx.measureText(l).width; });
      fitCache[key] = res;
      return res;
    }
    R.fit = fit;

    /** The room the centred hints have: the screen less 20 px and the insets on each side. */
    R.hintRoom = function () { return R.w - 40 - R.insets.left - R.insets.right; };

    // Fitted words with a dark outline, centred on x; the first line at y, further lines below
    // (up: above). Words follow the language's direction.
    function words(str, x, y, size, color, maxW, outline, up) {
      var f = fit(str, size, maxW);
      var lh = Math.round(f.size * 1.25);
      var y0 = up ? y - (f.lines.length - 1) * lh : y;
      ctx.direction = R.dir;
      ctx.font = '700 ' + f.size + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = outline;
      // Round joins: the default miter join draws long spikes off the sharp corners of Devanagari
      // and Nastaliq glyphs (seen on the S22+ in the Hindi and Urdu hints).
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(14, 20, 36, 0.85)';
      ctx.fillStyle = color;
      for (var i = 0; i < f.lines.length; i++) {
        ctx.strokeText(f.lines[i], x, y0 + i * lh);
        ctx.fillText(f.lines[i], x, y0 + i * lh);
      }
      ctx.direction = 'ltr';
    }

    function drawHud(v) {
      var h = v.hud;
      if (!h) return;
      var top = R.insets.top + 30;
      var L = R.insets.left + 20, Rr = R.w - R.insets.right - 20;
      if (h.mode === 'solo') {
        // kites left, top left
        for (var i = 0; i < h.kitesTotal; i++) kiteIcon(L + 8 + i * 22, top, 10, C.marigold, i < h.kitesLeft);
        // score, centred
        text(String(h.score), R.w / 2, top + 2, 34, C.cotton);
        if (h.mult >= 2) {
          ctx.font = '700 34px ' + FONT;
          var sw = ctx.measureText(String(h.score)).width;
          text('×' + h.mult, R.w / 2 + sw / 2 + 8, top + 4, 20, C.marigold, 'left');
        }
        if (h.secondsLeft != null && h.secondsLeft <= 10) text(String(Math.ceil(h.secondsLeft)), R.w / 2, top + 34, 18, '#ffb36b');
        if (h.overtime) text('+', R.w / 2, top + 34, 18, '#ffb36b');
      } else if (h.mode === 'match') {
        for (var s = 0; s < 2; s++) {
          var col = v.colors[s];
          for (var j = 0; j < h.firstTo; j++) {
            var x = s === 0 ? L + 12 + j * 30 : Rr - 12 - j * 30;
            kiteIcon(x, top + 2, 13, col, j < h.score[s]);
          }
        }
        if (h.count != null) {
          var n = Math.ceil(h.count);
          var fr = h.count - Math.floor(h.count);
          var sc = R.reduced ? 1 : 1 + 0.4 * fr;
          ctx.globalAlpha = 0.35 + 0.65 * fr;
          text(String(n), R.w / 2, R.roofY * 0.42, Math.round(84 * sc), C.cotton);
          ctx.globalAlpha = 1;
        }
      }
    }

    function drawHalves(v) {
      // two-player countdown: each half shows its colour and a hand that says hold
      if (!v.halves) return;
      var a = v.halves.alpha;
      ctx.globalAlpha = a;
      var mid = R.w / 2;
      ctx.fillStyle = art.rgba(C.marigold, 0.10);
      ctx.fillRect(0, 0, mid - 1, R.h);
      ctx.fillStyle = art.rgba(C.jade, 0.10);
      ctx.fillRect(mid + 1, 0, R.w - mid - 1, R.h);
      ctx.fillStyle = 'rgba(239, 230, 210, 0.25)';
      ctx.fillRect(mid - 1, R.h * 0.22, 2, R.roofY - R.h * 0.22);
      var hy = R.roofY - Math.max(70, R.h * 0.12);
      hand(R.w * 0.25, hy, 30, C.marigold, false, v.realT);
      hand(R.w * 0.75, hy, 30, C.jade, false, v.realT);
      if (v.halves.label) {
        // above the hand, clear of the kites parked on the roofs, outlined like the lesson's hints;
        // each half keeps its side whatever the language's direction
        var room = R.w / 2 - 24;
        words(v.halves.label, R.w * 0.25, hy - 46, 16, C.marigold, room, 4, true);
        words(v.halves.label, R.w * 0.75, hy - 46, 16, C.jade, room, 4, true);
      }
      ctx.globalAlpha = 1;
    }

    function hand(x, y, size, color, up, t) {
      var paths = LS.icons.path('hand-tap');
      var bob = R.reduced ? 0 : (up ? -6 - 3 * Math.sin(t * 5) : 3 * Math.sin(t * 6));
      ctx.save();
      ctx.translate(x - size, y - size + bob);
      ctx.scale(size * 2 / 256, size * 2 / 256);
      ctx.fillStyle = color;
      for (var i = 0; i < paths.length; i++) ctx.fill(paths[i]);
      ctx.restore();
    }

    function drawHint(v) {
      var h = v.hint;
      if (!h) return;
      var y = R.roofY - Math.max(84, R.h * 0.14);
      var x = R.w / 2;
      ctx.globalAlpha = h.alpha == null ? 1 : h.alpha;
      if (h.hand) {
        var down = h.hand === 'hold';
        var pulse = R.reduced ? 0 : (down ? 0.25 + 0.25 * Math.sin(v.realT * 6) : 0);
        ctx.fillStyle = 'rgba(255, 214, 120, ' + (0.18 + pulse) + ')';
        if (down) {
          ctx.beginPath();
          ctx.arc(x - 4, y - 18, 22 + pulse * 20, 0, Math.PI * 2);
          ctx.fill();
        }
        hand(x, y, 30, C.cotton, !down, v.realT);
      }
      if (h.text) words(h.text, x, y + 48, 20, C.cotton, R.hintRoom(), 5);
      if (h.arrowTo && h.arrowFrom) {
        var ax = R.sx(h.arrowFrom.x), ay = R.sy(h.arrowFrom.y), bx = R.sx(h.arrowTo.x), by = R.sy(h.arrowTo.y);
        ctx.strokeStyle = 'rgba(255, 214, 120, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 6]);
        ctx.lineDashOffset = -v.realT * 24;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 40, bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 214, 120, 0.9)';
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // The newcomer pulse lesson (coach.js): a ghost thumb presses and lifts beside a small kite on its
    // line, whose nose turns while the thumb is up and which darts along its nose while it is down,
    // over the steering hint. Drawn where the lesson's hints sit, on a dark card; never mirrored.
    function drawCoach(v) {
      var c = v.coach;
      if (!c) return;
      var fade = clamp(Math.min(c.age / 0.25, (c.show - c.age) / 0.4), 0, 1);
      if (fade <= 0) return;
      var y = R.roofY - Math.max(84, R.h * 0.14);
      var x = R.w / 2;
      // a dark card behind the demonstration, so it reads over the sun and the roofs alike
      ctx.globalAlpha = fade * 0.6;
      ctx.fillStyle = 'rgba(14, 20, 36, 1)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - 78, y - 78, 156, 104, 18); else ctx.rect(x - 78, y - 78, 156, 104);
      ctx.fill();
      // the kite on its line, left: its nose sweeps clockwise while the thumb is up, then it darts
      var th = -0.7 + 1.4 * ease(c.turn);
      var d = 24 * ease(c.dart);
      var ax = x - 34, ay = y + 18;
      var kx = ax + Math.sin(th) * d, ky = y - 34 - Math.cos(th) * d;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = 'rgba(239, 230, 210, 0.75)';
      ctx.lineWidth = c.down ? 1.6 : 1.2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      if (c.down) ctx.lineTo(kx, ky);
      else ctx.quadraticCurveTo((ax + kx) / 2 + 10, (ay + ky) / 2 + 8, kx, ky);
      ctx.stroke();
      if (!c.down) {
        ctx.fillStyle = C.marigold;
        for (var i = 1; i <= 4; i++) {
          ctx.globalAlpha = fade * 0.75 * (1 - i / 5);
          ctx.beginPath();
          ctx.arc(kx + Math.sin(th) * (8 + i * 6), ky - Math.cos(th) * (8 + i * 6), 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = fade;
      art.kite(ctx, kx, ky, th, 12, { color: C.marigold, pattern: 0 });
      // the thumb, right: pressed with a glow, or lifted
      var hx = x + 42;
      if (c.down) {
        ctx.fillStyle = 'rgba(255, 214, 120, 0.38)';
        ctx.beginPath();
        ctx.arc(hx - 4, y - 14, 22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = fade * 0.9;
      hand(hx, y + (c.down ? 4 : -8), 24, C.cotton, false, 0);
      ctx.globalAlpha = fade;
      if (c.text) words(c.text, x, y + 48, 20, C.cotton, R.hintRoom(), 5);
      ctx.globalAlpha = 1;
    }

    /**
     * One frame. v: {world, snaps, alpha, p (sunset 0 to 1), realT, rdt, dt (sim time this frame),
     * colors [left, right], aim [left, right], aimLen (the aim line's length in world units, the lesson
     * only), hud, hint, coach (the newcomer pulse lesson: age, show, down, turn, dart, text), ring,
     * halves, wind, gust, dim, sunLift (the
     * menu's sun height over the roofs, as a share of the sky; otherwise the sun sets with p)}.
     */
    R.draw = function (v) {
      stepFx(v.dt || 0, v.wind);
      ctx.setTransform(R.d, 0, 0, R.d, 0, 0);
      ctx.direction = 'ltr';
      var sh = R.shake;
      if (sh) ctx.translate((R.fx.next() - 0.5) * sh * 2, (R.fx.next() - 0.5) * sh * 2);
      drawSkyAndRoofs(v);
      drawSpools(v);
      drawRing(v);
      if (v.world) {
        drawLines(v);
        drawDebris();
        drawKites(v);
        drawDuel(v);
      } else {
        drawDebris();
      }
      drawParticles();
      drawPops();
      if (R.flash > 0.02 && !R.reduced) {
        ctx.fillStyle = 'rgba(255, 240, 210, ' + (R.flash * 0.12) + ')';
        ctx.fillRect(-10, -10, R.w + 20, R.h + 20);
      }
      ctx.setTransform(R.d, 0, 0, R.d, 0, 0);
      drawHalves(v);
      drawHint(v);
      drawCoach(v);
      drawHud(v);
      if (v.dim) {
        ctx.fillStyle = 'rgba(10, 13, 24, ' + (v.dim * 0.55) + ')';
        ctx.fillRect(0, 0, R.w, R.h);
      }
    };

    return R;
  }

  LS.render = { create: create, FONT: FONT };
})(typeof self !== 'undefined' ? self : this);
