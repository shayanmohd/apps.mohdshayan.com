/*
 * The board view: one full-screen canvas. It draws the lapis ground, the inlaid board, move hints and the
 * discs, runs the tweens and particles, and turns taps and drags into move requests. It never changes the
 * position itself: the app applies moves and tells the view what to animate.
 */
(function (root) {
  'use strict';
  var P = root.Pawnfare;
  var rules = P.rules;
  var art = P.art;
  var PAL = art.PAL;

  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
  function easeInOut(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

  function create(canvas) {
    var g = canvas.getContext('2d');
    var dpr = 1;
    var vw = 0;
    var vh = 0;
    var ground = null;

    var v = {
      pos: null,
      rect: null, // { x, y, size, cell }
      show: false, // the board is drawn only during play
      dim: 0, // 0 to 1: the board under a sheet
      pieces: [], // display list: { id, type, side, sq, x, y, s, a, flip }
      selected: -1,
      targets: [], // { mv, to, capture, danger }
      inspect: -1,
      inspectTargets: [],
      lastRival: null, // { from, to }
      interactive: false,
      hint: null, // { sq, kind: 'from' | 'to' }
      tweens: [],
      particles: [],
      shake: { amp: 0, t0: 0, dur: 1 },
      flash: null,
      lostTint: 0,
      reduced: false,
      onMove: null,
      onSelect: null,
      onIllegal: null,
      frames: [],
      drag: null,
      enterT0: 0
    };

    var nextId = 1;
    var raf = 0;
    var dirty = true;

    function resize() {
      dpr = Math.min(2, root.devicePixelRatio || 1);
      vw = root.innerWidth;
      vh = root.innerHeight;
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      ground = art.groundPattern(g);
      request();
    }

    function sqCenter(sq) {
      var r = v.rect;
      var W = v.pos.W;
      return { x: r.x + ((sq % W) + 0.5) * r.cell, y: r.y + (((sq / W) | 0) + 0.5) * r.cell };
    }

    function sqAt(x, y) {
      var r = v.rect;
      if (!r || !v.pos) return -1;
      var cx = Math.floor((x - r.x) / r.cell);
      var cy = Math.floor((y - r.y) / r.cell);
      if (cx < 0 || cy < 0 || cx >= v.pos.W || cy >= v.pos.H) return -1;
      return cy * v.pos.W + cx;
    }

    /** Rebuilds the display list from the position (no animation, or the board's entrance). */
    function sync(enter) {
      v.pieces = [];
      if (!v.pos) return;
      for (var sq = 0; sq < v.pos.N; sq++) {
        if (!v.pos.owner[sq]) continue;
        var c = sqCenter(sq);
        v.pieces.push({ id: nextId++, type: v.pos.types[v.pos.kind[sq]], side: v.pos.owner[sq], sq: sq, x: c.x, y: c.y, s: 1, a: 1 });
      }
      if (enter) {
        v.enterT0 = performance.now();
        v.pieces.forEach(function (p, i) {
          var delay = v.reduced ? 0 : i * 28;
          p.a = 0;
          p.s = v.reduced ? 1 : 0.72;
          tween(v.reduced ? 160 : 300, function (k) { p.a = k; p.s = v.reduced ? 1 : 0.72 + 0.28 * easeOut(k); }, null, delay);
        });
      }
      request();
    }

    function pieceOn(sq) {
      for (var i = 0; i < v.pieces.length; i++) if (v.pieces[i].sq === sq && !v.pieces[i].dead) return v.pieces[i];
      return null;
    }

    function tween(dur, update, done, delay) {
      var t = { t0: performance.now() + (delay || 0), dur: Math.max(1, dur), update: update, done: done };
      v.tweens.push(t);
      request();
      return t;
    }

    function layout(rect) {
      v.rect = rect;
      if (v.pos) {
        v.pieces.forEach(function (p) {
          if (p.dead) return;
          var c = sqCenter(p.sq);
          p.x = c.x;
          p.y = c.y;
        });
      }
      request();
    }

    function setPosition(pos, opts) {
      opts = opts || {};
      v.pos = pos;
      v.selected = -1;
      v.targets = [];
      v.inspect = -1;
      v.inspectTargets = [];
      v.lastRival = opts.lastRival || null;
      v.lostTint = 0;
      v.flash = null;
      v.particles = [];
      sync(!!opts.enter);
    }

    // ---- selection and hints ----

    function select(sq) {
      v.selected = sq;
      v.inspect = -1;
      v.inspectTargets = [];
      v.targets = [];
      if (sq >= 0 && v.pos) {
        var list = [];
        rules.movesFrom(v.pos, sq, list);
        v.targets = list.map(function (mv) {
          var to = mv & 63;
          return { mv: mv, to: to, capture: v.pos.owner[to] === rules.RIVAL, danger: to !== v.pos.kingSq && rules.hangs(v.pos, mv) };
        });
      }
      if (v.onSelect) v.onSelect(sq);
      request();
    }

    function inspectRival(sq) {
      v.selected = -1;
      v.targets = [];
      v.inspect = sq;
      var list = [];
      rules.movesFrom(v.pos, sq, list);
      v.inspectTargets = list.map(function (mv) { return mv & 63; });
      request();
    }

    function clearSelection() {
      v.selected = -1;
      v.targets = [];
      v.inspect = -1;
      v.inspectTargets = [];
      request();
    }

    function targetFor(to) {
      for (var i = 0; i < v.targets.length; i++) if (v.targets[i].to === to) return v.targets[i];
      return null;
    }

    function shakePiece(sq) {
      var p = pieceOn(sq);
      if (!p || v.reduced) return;
      var c = sqCenter(sq);
      tween(220, function (k) { p.x = c.x + Math.sin(k * Math.PI * 6) * 4 * (1 - k); }, function () { p.x = c.x; });
    }

    // ---- input: tap a piece then a square, or drag ----

    function local(e) {
      var b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (!v.interactive || !v.pos || !v.show) return;
      var p = local(e);
      var sq = sqAt(p.x, p.y);
      if (sq < 0) { clearSelection(); return; }
      var owner = v.pos.owner[sq];
      if (owner === rules.PLAYER && v.selected !== sq) {
        select(sq);
        if (P.audio) P.audio.play('select');
        v.drag = { sq: sq, x0: p.x, y0: p.y, moving: false, pointer: e.pointerId, fresh: true };
      } else if (owner === rules.PLAYER) {
        v.drag = { sq: sq, x0: p.x, y0: p.y, moving: false, pointer: e.pointerId, fresh: false };
      } else {
        v.drag = null;
        tap(sq);
      }
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    });

    canvas.addEventListener('pointermove', function (e) {
      var d = v.drag;
      if (!d || e.pointerId !== d.pointer) return;
      var p = local(e);
      if (!d.moving && Math.abs(p.x - d.x0) + Math.abs(p.y - d.y0) > 8) d.moving = true;
      if (d.moving) {
        var piece = pieceOn(d.sq);
        if (piece) { piece.x = p.x; piece.y = p.y - (v.rect.cell * 0.25); piece.dragging = true; }
        d.over = sqAt(p.x, p.y - v.rect.cell * 0.25);
        request();
      }
    });

    function endDrag(e, cancelled) {
      var d = v.drag;
      if (!d || e.pointerId !== d.pointer) return;
      v.drag = null;
      var piece = pieceOn(d.sq);
      if (d.moving) {
        if (piece) piece.dragging = false;
        var t = cancelled ? null : targetFor(d.over);
        if (t && v.onMove) {
          v.onMove(t.mv, true);
        } else if (piece) {
          var c = sqCenter(d.sq);
          var x0 = piece.x;
          var y0 = piece.y;
          tween(140, function (k) { piece.x = x0 + (c.x - x0) * easeOut(k); piece.y = y0 + (c.y - y0) * easeOut(k); });
        }
        return;
      }
      // A tap on the selected piece itself: a second tap deselects it.
      if (!d.fresh) clearSelection();
    }
    canvas.addEventListener('pointerup', function (e) { endDrag(e, false); });
    canvas.addEventListener('pointercancel', function (e) { endDrag(e, true); });

    function tap(sq) {
      if (v.selected >= 0) {
        var t = targetFor(sq);
        if (t) { if (v.onMove) v.onMove(t.mv, false); return; }
        if (v.pos.owner[sq] === rules.RIVAL) { inspectRival(sq); return; }
        var from = v.selected;
        clearSelection();
        shakePiece(from);
        if (v.onIllegal) v.onIllegal();
        return;
      }
      if (v.pos.owner[sq] === rules.RIVAL) inspectRival(sq);
      else clearSelection();
    }

    // ---- animations the app asks for ----

    /** Slides the piece of a move (already applied to v.pos) and resolves when it lands. */
    function animateMove(mv, side, info) {
      info = info || {};
      var from = mv >> 6;
      var to = mv & 63;
      var piece = pieceOn(from);
      var victim = pieceOn(to);
      clearSelection();
      if (side === rules.RIVAL) v.lastRival = { from: from, to: to };
      else v.lastRival = null;
      if (!piece) { sync(false); return Promise.resolve(); }
      var a = { x: piece.x, y: piece.y };
      var b = sqCenter(to);
      var dur = info.dragged ? 90 : v.reduced ? 120 : side === rules.RIVAL ? 210 : 180;
      return new Promise(function (resolve) {
        piece.sq = to;
        tween(dur, function (k) {
          var e = easeOut(k);
          piece.x = a.x + (b.x - a.x) * e;
          piece.y = a.y + (b.y - a.y) * e;
          piece.lift = v.reduced ? 0 : Math.sin(Math.PI * k) * 0.06;
        }, function () {
          piece.x = b.x;
          piece.y = b.y;
          piece.lift = 0;
          if (victim && victim !== piece) {
            victim.dead = true;
            shatter(b.x, b.y, victim.side, victim.side === rules.RIVAL && info.king ? 26 : 12);
            v.pieces.splice(v.pieces.indexOf(victim), 1);
            shake(info.king ? 5 : 2, info.king ? 360 : 160);
          }
          var newType = v.pos.types[v.pos.kind[to]];
          if (newType !== piece.type) promote(piece, newType);
          resolve();
        });
      });
    }

    function promote(piece, newType) {
      if (v.reduced) { piece.type = newType; request(); return; }
      var swapped = false;
      tween(300, function (k) {
        piece.flip = Math.abs(Math.cos(Math.PI * k));
        if (k >= 0.5 && !swapped) { swapped = true; piece.type = newType; }
      }, function () { piece.flip = 1; piece.type = newType; });
      if (P.audio) P.audio.play('promote');
    }

    function shake(amp, dur) {
      if (v.reduced) return;
      v.shake = { amp: amp, t0: performance.now(), dur: dur };
      request();
    }

    function shatter(x, y, side, n) {
      if (v.reduced) return;
      var colour = side === rules.PLAYER ? PAL.ivory : PAL.carnelian;
      for (var i = 0; i < n; i++) {
        var a = (Math.PI * 2 * i) / n + (i % 3) * 0.37;
        var sp = 70 + ((i * 53) % 90);
        v.particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.55, age: 0, size: 3 + (i % 4), colour: colour, rot: a, vr: (i % 2 ? 1 : -1) * 6, shard: true });
      }
      request();
    }

    /** The king's capture: gilt sparks, a ring and the bell. */
    function kingFall(sq) {
      var c = sqCenter(sq);
      if (!v.reduced) {
        for (var i = 0; i < 30; i++) {
          var a = (Math.PI * 2 * i) / 30;
          var sp = 110 + ((i * 37) % 120);
          v.particles.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.9, age: 0, size: 2 + (i % 3), colour: PAL.gilt, spark: true });
        }
      }
      v.flash = { x: c.x, y: c.y, t0: performance.now(), dur: v.reduced ? 500 : 800 };
      request();
      return new Promise(function (resolve) { setTimeout(resolve, v.reduced ? 500 : 900); });
    }

    function lostBeat() {
      return new Promise(function (resolve) {
        tween(v.reduced ? 200 : 520, function (k) { v.lostTint = easeInOut(k); }, function () { setTimeout(resolve, 220); });
      });
    }

    // ---- drawing ----

    function request() {
      dirty = true;
      if (!raf) raf = root.requestAnimationFrame(frame);
    }

    var lastFrame = 0;
    function frame(now) {
      raf = 0;
      if (lastFrame) {
        v.frames.push(now - lastFrame);
        if (v.frames.length > 240) v.frames.shift();
      }
      var dt = Math.min(0.05, lastFrame ? (now - lastFrame) / 1000 : 0.016);
      lastFrame = now;
      // Tweens.
      // Tweens a finishing tween starts (a promotion after a slide) land in the new list.
      var list = v.tweens;
      v.tweens = [];
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (now < t.t0) { v.tweens.push(t); continue; }
        var k = Math.min(1, (now - t.t0) / t.dur);
        t.update(k);
        if (k < 1) v.tweens.push(t);
        else if (t.done) t.done();
      }
      // Particles.
      v.particles = v.particles.filter(function (p) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy = p.vy * 0.94 + (p.spark ? 20 : 260) * dt;
        p.rot = (p.rot || 0) + (p.vr || 0) * dt;
        return p.age < p.life;
      });
      draw(now);
      var busy = v.tweens.length || v.particles.length || v.drag || (v.flash && now - v.flash.t0 < v.flash.dur) ||
        (now - v.shake.t0 < v.shake.dur) || v.hint;
      if (busy) raf = root.requestAnimationFrame(frame);
      else lastFrame = 0;
      dirty = false;
    }

    function draw(now) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = ground || PAL.night;
      g.fillRect(0, 0, vw, vh);
      if (!v.show || !v.pos || !v.rect) return;
      var sx = 0;
      var sy = 0;
      var st = now - v.shake.t0;
      if (st < v.shake.dur) {
        var fall = 1 - st / v.shake.dur;
        sx = Math.sin(st * 0.09) * v.shake.amp * fall;
        sy = Math.cos(st * 0.11) * v.shake.amp * fall * 0.6;
      }
      g.save();
      g.translate(sx, sy);
      drawBoard();
      drawMarks(now);
      drawPieces();
      drawParticles();
      drawFlash(now);
      drawHint(now);
      g.restore();
      if (v.lostTint > 0) {
        g.fillStyle = 'rgba(14,21,48,' + (0.5 * v.lostTint) + ')';
        g.fillRect(0, 0, vw, vh);
        var rg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
        rg.addColorStop(0, 'rgba(181,67,47,0)');
        rg.addColorStop(1, 'rgba(181,67,47,' + (0.28 * v.lostTint) + ')');
        g.fillStyle = rg;
        g.fillRect(0, 0, vw, vh);
      }
      if (v.dim > 0) {
        g.fillStyle = 'rgba(9,13,32,' + (0.55 * v.dim) + ')';
        g.fillRect(0, 0, vw, vh);
      }
    }

    function drawBoard() {
      var r = v.rect;
      var W = v.pos.W;
      var H = v.pos.H;
      var c = r.cell;
      g.fillStyle = 'rgba(6,9,24,0.85)';
      art.roundRect(g, r.x - 8, r.y - 8, c * W + 16, c * H + 16, 10);
      g.fill();
      g.strokeStyle = 'rgba(237,228,207,0.16)';
      g.lineWidth = 1;
      art.roundRect(g, r.x - 4.5, r.y - 4.5, c * W + 9, c * H + 9, 7);
      g.stroke();
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var px = r.x + x * c;
          var py = r.y + y * c;
          g.fillStyle = (x + y) % 2 ? PAL.lapisA : PAL.lapisB;
          g.fillRect(px, py, c, c);
          g.fillStyle = 'rgba(255,255,255,0.035)';
          g.fillRect(px, py, c, 1);
          g.fillRect(px, py, 1, c);
          g.fillStyle = 'rgba(0,0,0,0.22)';
          g.fillRect(px, py + c - 1, c, 1);
          g.fillRect(px + c - 1, py, 1, c);
        }
      }
    }

    function sqRect(sq) {
      var r = v.rect;
      var W = v.pos.W;
      return { x: r.x + (sq % W) * r.cell, y: r.y + ((sq / W) | 0) * r.cell, c: r.cell };
    }

    function drawMarks(now) {
      var c = v.rect.cell;
      if (v.lastRival) {
        [v.lastRival.from, v.lastRival.to].forEach(function (sq) {
          var q = sqRect(sq);
          g.fillStyle = 'rgba(181,67,47,0.17)';
          g.fillRect(q.x, q.y, c, c);
        });
      }
      if (v.selected >= 0) {
        var s = sqRect(v.selected);
        g.fillStyle = 'rgba(79,183,168,0.16)';
        g.fillRect(s.x, s.y, c, c);
      }
      v.targets.forEach(function (t) {
        var q = sqRect(t.to);
        var cx = q.x + c / 2;
        var cy = q.y + c / 2;
        if (t.capture) {
          g.strokeStyle = PAL.turquoise;
          g.lineWidth = 3;
          var L = c * 0.22;
          var m = 4;
          g.beginPath();
          g.moveTo(q.x + m, q.y + m + L); g.lineTo(q.x + m, q.y + m); g.lineTo(q.x + m + L, q.y + m);
          g.moveTo(q.x + c - m - L, q.y + m); g.lineTo(q.x + c - m, q.y + m); g.lineTo(q.x + c - m, q.y + m + L);
          g.moveTo(q.x + c - m, q.y + c - m - L); g.lineTo(q.x + c - m, q.y + c - m); g.lineTo(q.x + c - m - L, q.y + c - m);
          g.moveTo(q.x + m + L, q.y + c - m); g.lineTo(q.x + m, q.y + c - m); g.lineTo(q.x + m, q.y + c - m - L);
          g.stroke();
        } else {
          g.fillStyle = PAL.turquoise;
          g.beginPath();
          g.arc(cx, cy, c * 0.11, 0, Math.PI * 2);
          g.fill();
        }
        if (t.danger) {
          g.fillStyle = PAL.carnelian;
          g.beginPath();
          g.moveTo(q.x + c - 3, q.y + 3);
          g.lineTo(q.x + c - 3 - c * 0.24, q.y + 3);
          g.lineTo(q.x + c - 3, q.y + 3 + c * 0.24);
          g.closePath();
          g.fill();
        }
      });
      v.inspectTargets.forEach(function (to) {
        var q = sqRect(to);
        g.strokeStyle = 'rgba(181,67,47,0.9)';
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(q.x + c / 2, q.y + c / 2, c * 0.13, 0, Math.PI * 2);
        g.stroke();
      });
      if (v.inspect >= 0) {
        var iq = sqRect(v.inspect);
        g.fillStyle = 'rgba(181,67,47,0.14)';
        g.fillRect(iq.x, iq.y, c, c);
      }
      void now;
    }

    function drawPieces() {
      var r = v.rect.cell * 0.4;
      var list = v.pieces.slice().sort(function (a, b) {
        return (a.dragging || a.sq === v.selected ? 1 : 0) - (b.dragging || b.sq === v.selected ? 1 : 0) || a.y - b.y;
      });
      list.forEach(function (p) {
        var s = p.s * (1 + (p.lift || 0)) * (p.sq === v.selected || p.dragging ? 1.08 : 1);
        var lift = p.sq === v.selected || p.dragging ? -3 : 0;
        if (p.flip != null && p.flip !== 1) {
          g.save();
          g.translate(p.x, p.y + lift);
          g.scale(Math.max(0.02, p.flip), 1);
          art.drawCached(g, p.type, p.side, 0, 0, Math.round(r), dpr, s, p.a);
          g.restore();
        } else {
          art.drawCached(g, p.type, p.side, p.x, p.y + lift, Math.round(r), dpr, s, p.a);
        }
        if (p.sq === v.selected && !p.dragging) {
          g.strokeStyle = PAL.turquoise;
          g.lineWidth = 2.5;
          g.beginPath();
          g.arc(p.x, p.y + lift, r * s + 4, 0, Math.PI * 2);
          g.stroke();
        }
      });
    }

    function drawParticles() {
      v.particles.forEach(function (p) {
        var k = 1 - p.age / p.life;
        g.globalAlpha = Math.max(0, k);
        g.fillStyle = p.colour;
        if (p.shard) {
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.beginPath();
          g.moveTo(-p.size, -p.size * 0.6);
          g.lineTo(p.size, 0);
          g.lineTo(-p.size * 0.4, p.size * 0.8);
          g.closePath();
          g.fill();
          g.restore();
        } else {
          g.beginPath();
          g.arc(p.x, p.y, p.size * k + 0.5, 0, Math.PI * 2);
          g.fill();
        }
      });
      g.globalAlpha = 1;
    }

    function drawFlash(now) {
      var f = v.flash;
      if (!f) return;
      var k = (now - f.t0) / f.dur;
      if (k >= 1) { v.flash = null; return; }
      var rr = v.rect.cell * (0.4 + (v.reduced ? 0.6 : 2.4) * easeOut(k));
      g.strokeStyle = 'rgba(214,177,96,' + (0.9 * (1 - k)) + ')';
      g.lineWidth = 3 * (1 - k) + 1;
      g.beginPath();
      g.arc(f.x, f.y, rr, 0, Math.PI * 2);
      g.stroke();
    }

    function drawHint(now) {
      var h = v.hint;
      if (!h || h.sq < 0) return;
      var q = sqRect(h.sq);
      var c = v.rect.cell;
      var cx = q.x + c / 2;
      var cy = q.y + c / 2;
      var k = v.reduced ? 0.4 : (now % 1100) / 1100;
      // Turquoise, the touch colour: a steady ring just outside a disc and a pulse running out from it.
      g.strokeStyle = 'rgba(79,183,168,' + (0.95 * (1 - k)) + ')';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, c * (0.46 + 0.16 * easeOut(k)), 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = 'rgba(79,183,168,0.85)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, c * 0.45, 0, Math.PI * 2);
      g.stroke();
      if (h.kind === 'to' && !v.pos.owner[h.sq]) {
        g.fillStyle = PAL.turquoise;
        g.beginPath();
        g.arc(cx, cy, c * 0.12, 0, Math.PI * 2);
        g.fill();
      }
    }

    function setHint(sq, kind) {
      v.hint = sq >= 0 ? { sq: sq, kind: kind } : null;
      request();
    }

    function fps() {
      if (!v.frames.length) return null;
      var sorted = v.frames.slice().sort(function (a, b) { return a - b; });
      var mean = v.frames.reduce(function (s, x) { return s + x; }, 0) / v.frames.length;
      return { frames: v.frames.length, meanMs: mean, p95Ms: sorted[Math.floor(sorted.length * 0.95)], fps: 1000 / mean };
    }

    root.addEventListener('resize', resize);
    resize();

    v.resize = resize;
    v.layout = layout;
    v.setPosition = setPosition;
    v.sync = sync;
    v.select = select;
    v.clearSelection = clearSelection;
    v.animateMove = animateMove;
    v.kingFall = kingFall;
    v.lostBeat = lostBeat;
    v.setHint = setHint;
    v.request = request;
    v.shakePiece = shakePiece;
    v.sqCenter = sqCenter;
    v.fps = fps;
    v.tween = tween;
    return v;
  }

  P.board = { create: create };
})(this);
