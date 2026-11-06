/*
 * The board view: one full-screen canvas over the lattice page background. It draws the inlaid board, move
 * hints and the discs, runs the tweens and particles, and turns taps and drags into move requests. It never
 * changes the position itself: the app applies moves and tells the view what to animate.
 *
 * Drawing is kept cheap for phones whose WebView draws the canvas on the CPU (Galaxy S22+, 2026-11-07):
 * the board, the marks and every disc at rest live in an offscreen layer that is redrawn only when they
 * change; a frame copies that layer and draws only what moves, inside the area that changed; frames run at
 * most about 60 per second on 90 to 144 Hz screens; the lost-board tint and the dim under a sheet are CSS
 * veils, not canvas fills; and the resolution drops once when frames stay slow.
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
    var maxDpr = 2; // lowered to 1 once when frames stay slow (see pace)
    var vw = 0;
    var vh = 0;
    // The static layer: board, marks and the discs at rest, in screen CSS px, on the canvas's pixel grid.
    var layer = document.createElement('canvas');
    var lg = layer.getContext('2d');
    var layerOk = false;
    var lx = 0; // the layer's top-left corner in canvas pixels
    var ly = 0;
    // Veils over the canvas (under the HUD): the lost-board tint and the dim under a sheet.
    function veil(cls) {
      var d = document.createElement('div');
      d.className = 'veil ' + cls;
      d.style.display = 'none';
      if (canvas.parentNode) canvas.parentNode.insertBefore(d, canvas.nextSibling);
      return d;
    }
    var dimEl = veil('dim');
    var tintEl = veil('lost');
    var tintShown = -1;
    var dimShown = -1;

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

    function resize() {
      dpr = Math.min(maxDpr, root.devicePixelRatio || 1);
      vw = root.innerWidth;
      vh = root.innerHeight;
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      inkBox = null;
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
          tween(v.reduced ? 160 : 300, function (k) { p.a = k; p.s = v.reduced ? 1 : 0.72 + 0.28 * easeOut(k); }, null, delay, p);
        });
      }
      request();
    }

    function pieceOn(sq) {
      for (var i = 0; i < v.pieces.length; i++) if (v.pieces[i].sq === sq && !v.pieces[i].dead) return v.pieces[i];
      return null;
    }

    /** A tween; with a piece, that piece leaves the static layer until the tween ends. */
    function tween(dur, update, done, delay, piece) {
      var t = { t0: performance.now() + (delay || 0), dur: Math.max(1, dur), update: update, done: done, piece: piece || null };
      if (piece) piece.busy = (piece.busy || 0) + 1;
      v.tweens.push(t);
      request(!piece);
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
      tween(220, function (k) { p.x = c.x + Math.sin(k * Math.PI * 6) * 4 * (1 - k); }, function () { p.x = c.x; }, 0, p);
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
        var lifted = piece && !piece.dragging;
        if (piece) { piece.x = p.x; piece.y = p.y - (v.rect.cell * 0.25); piece.dragging = true; }
        d.over = sqAt(p.x, p.y - v.rect.cell * 0.25);
        request(!lifted);
      }
    });

    function endDrag(e, cancelled) {
      var d = v.drag;
      if (!d || e.pointerId !== d.pointer) return;
      v.drag = null;
      var piece = pieceOn(d.sq);
      if (d.moving) {
        if (piece) { piece.dragging = false; request(); }
        var t = cancelled ? null : targetFor(d.over);
        if (t && v.onMove) {
          v.onMove(t.mv, true);
        } else if (piece) {
          var c = sqCenter(d.sq);
          var x0 = piece.x;
          var y0 = piece.y;
          tween(140, function (k) { piece.x = x0 + (c.x - x0) * easeOut(k); piece.y = y0 + (c.y - y0) * easeOut(k); }, null, 0, piece);
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
        request();
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
        }, 0, piece);
      });
    }

    function promote(piece, newType) {
      if (v.reduced) { piece.type = newType; request(); return; }
      var swapped = false;
      tween(300, function (k) {
        piece.flip = Math.abs(Math.cos(Math.PI * k));
        if (k >= 0.5 && !swapped) { swapped = true; piece.type = newType; }
      }, function () { piece.flip = 1; piece.type = newType; }, 0, piece);
      if (P.audio) P.audio.play('promote');
    }

    function shake(amp, dur) {
      if (v.reduced) return;
      v.shake = { amp: amp, t0: performance.now(), dur: dur };
      request(true);
    }

    function shatter(x, y, side, n) {
      if (v.reduced) return;
      var colour = side === rules.PLAYER ? PAL.ivory : PAL.carnelian;
      for (var i = 0; i < n; i++) {
        var a = (Math.PI * 2 * i) / n + (i % 3) * 0.37;
        var sp = 70 + ((i * 53) % 90);
        v.particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.55, age: 0, size: 3 + (i % 4), colour: colour, rot: a, vr: (i % 2 ? 1 : -1) * 6, shard: true });
      }
      request(true);
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
      request(true);
      return new Promise(function (resolve) { setTimeout(resolve, v.reduced ? 500 : 900); });
    }

    function lostBeat() {
      return new Promise(function (resolve) {
        tween(v.reduced ? 200 : 520, function (k) { v.lostTint = easeInOut(k); }, function () { setTimeout(resolve, 220); });
      });
    }

    // ---- drawing ----

    var MIN_GAP = 1000 / 60 - 6; // ms between drawn frames: every frame up to 90 Hz, every other one at 120 Hz
    var lastFrame = 0; // the time of the last drawn frame, 0 after an idle stretch
    var fullNext = true; // the next frame clears and redraws the whole canvas
    var prevBox = null; // canvas px [x0, y0, x1, y1] the moving things covered in the last frame
    var inkBox = null; // canvas px around everything on the canvas now; null: unknown, clear it all
    var slow = 0;
    var out = g; // the context the draw functions below paint into: the canvas or the static layer

    /** Asks for a frame; without keepLayer the board, marks or resting discs changed. */
    function request(keepLayer) {
      if (!keepLayer) layerOk = false;
      if (!raf) raf = root.requestAnimationFrame(frame);
    }

    /** Drops to 1 canvas pixel per CSS px, once, when drawn frames keep coming late (a CPU-drawn canvas). */
    function pace(gap) {
      if (maxDpr <= 1 || dpr <= 1) return;
      slow = gap > 30 ? slow + 1 : Math.max(0, slow - 2);
      if (slow >= 20) {
        slow = 0;
        maxDpr = 1;
        resize();
      }
    }

    function frame(now) {
      raf = 0;
      if (lastFrame && now - lastFrame < MIN_GAP) {
        raf = root.requestAnimationFrame(frame);
        return;
      }
      if (lastFrame) {
        v.frames.push(now - lastFrame);
        if (v.frames.length > 240) v.frames.shift();
        pace(now - lastFrame);
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
        if (k < 1) { v.tweens.push(t); continue; }
        if (t.piece) { t.piece.busy--; layerOk = false; }
        if (t.done) t.done();
      }
      // Particles, kept in place.
      var n = 0;
      for (var j = 0; j < v.particles.length; j++) {
        var p = v.particles[j];
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy = p.vy * 0.94 + (p.spark ? 20 : 260) * dt;
        p.rot = (p.rot || 0) + (p.vr || 0) * dt;
        if (p.age < p.life) v.particles[n++] = p;
      }
      v.particles.length = n;
      draw(now);
      var busy = v.tweens.length || v.particles.length || v.drag || (v.flash && now - v.flash.t0 < v.flash.dur) ||
        (now - v.shake.t0 < v.shake.dur) || (v.hint && !v.reduced);
      if (busy) raf = root.requestAnimationFrame(frame);
      else lastFrame = 0;
    }

    function syncVeils() {
      var t = v.show ? v.lostTint : 0;
      var d = v.show ? v.dim : 0;
      if (t !== tintShown) {
        tintShown = t;
        tintEl.style.display = t > 0 ? '' : 'none';
        tintEl.style.opacity = String(t);
      }
      if (d !== dimShown) {
        dimShown = d;
        dimEl.style.display = d > 0 ? '' : 'none';
        dimEl.style.opacity = String(d);
      }
    }

    /** Redraws the static layer: the board, the marks and every disc that is not moving. */
    function buildLayer() {
      var r = v.rect;
      var m = 16; // CSS px around the board: its frame, a lifted disc and the selection ring
      var x0 = Math.floor((r.x - m) * dpr);
      var y0 = Math.floor((r.y - m) * dpr);
      var w = Math.ceil((r.x + r.cell * v.pos.W + m) * dpr) - x0;
      var h = Math.ceil((r.y + r.cell * v.pos.H + m) * dpr) - y0;
      if (layer.width !== w || layer.height !== h) {
        layer.width = w;
        layer.height = h;
      } else {
        lg.setTransform(1, 0, 0, 1, 0, 0);
        lg.clearRect(0, 0, w, h);
      }
      lx = x0;
      ly = y0;
      lg.setTransform(dpr, 0, 0, dpr, -x0, -y0);
      out = lg;
      drawBoard();
      drawMarks();
      drawPieces(false);
      out = g;
      layerOk = true;
    }

    function moving(p) { return p.busy > 0 || !!p.dragging; }

    /** The canvas px box around everything drawn this frame on top of the layer, or null. */
    function movingBox(now, ox, oy) {
      var x0 = Infinity;
      var y0 = Infinity;
      var x1 = -Infinity;
      var y1 = -Infinity;
      function add(x, y, rad) {
        if (x - rad < x0) x0 = x - rad;
        if (y - rad < y0) y0 = y - rad;
        if (x + rad > x1) x1 = x + rad;
        if (y + rad > y1) y1 = y + rad;
      }
      var c = v.rect.cell;
      var r = Math.round(c * 0.4);
      var half = r + Math.ceil(r * 0.28) + 2; // half a cached disc (art.disc)
      for (var i = 0; i < v.pieces.length; i++) {
        var p = v.pieces[i];
        if (!moving(p)) continue;
        add(p.x, p.y - 3, half * p.s * (1 + (p.lift || 0)) * 1.08 + 6);
      }
      for (var j = 0; j < v.particles.length; j++) {
        var q = v.particles[j];
        add(q.x, q.y, q.size + 2);
      }
      var f = v.flash;
      if (f && now - f.t0 < f.dur) add(f.x, f.y, c * (0.4 + (v.reduced ? 0.6 : 2.4)) + 5);
      if (v.hint && v.hint.sq >= 0) {
        var hc = sqCenter(v.hint.sq);
        add(hc.x, hc.y, c * 0.62 + 4);
      }
      if (x0 === Infinity) return null;
      return [
        Math.max(0, Math.floor(x0 * dpr) + ox - 2), Math.max(0, Math.floor(y0 * dpr) + oy - 2),
        Math.min(canvas.width, Math.ceil(x1 * dpr) + ox + 2), Math.min(canvas.height, Math.ceil(y1 * dpr) + oy + 2)
      ];
    }

    function union(a, b) {
      if (!a) return b;
      return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
    }

    function clearInk() {
      var k = inkBox || [0, 0, canvas.width, canvas.height];
      g.clearRect(k[0], k[1], k[2] - k[0], k[3] - k[1]);
      inkBox = [0, 0, 0, 0];
    }

    function draw(now) {
      syncVeils();
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (!v.show || !v.pos || !v.rect) {
        clearInk();
        fullNext = true;
        prevBox = null;
        return;
      }
      var sx = 0;
      var sy = 0;
      var st = now - v.shake.t0;
      if (st < v.shake.dur) {
        var fall = 1 - st / v.shake.dur;
        sx = Math.sin(st * 0.09) * v.shake.amp * fall;
        sy = Math.cos(st * 0.11) * v.shake.amp * fall * 0.6;
      }
      // Whole canvas pixels, so copying the layer is a plain copy.
      var ox = Math.round(sx * dpr);
      var oy = Math.round(sy * dpr);
      if (!layerOk) {
        buildLayer();
        fullNext = true;
      }
      var box = movingBox(now, ox, oy);
      var full = fullNext || ox || oy;
      if (full) {
        clearInk();
        g.drawImage(layer, lx + ox, ly + oy);
        inkBox = [lx + ox, ly + oy, lx + ox + layer.width, ly + oy + layer.height];
      } else {
        var d = box ? union(prevBox, box) : prevBox;
        if (!d) return;
        g.save();
        g.beginPath();
        g.rect(d[0], d[1], d[2] - d[0], d[3] - d[1]);
        g.clip();
        g.clearRect(d[0], d[1], d[2] - d[0], d[3] - d[1]);
        g.drawImage(layer, lx, ly);
      }
      g.setTransform(dpr, 0, 0, dpr, ox, oy);
      drawPieces(true);
      drawParticles();
      drawFlash(now);
      drawHint(now);
      if (!full) g.restore();
      g.setTransform(1, 0, 0, 1, 0, 0);
      prevBox = box;
      if (box) inkBox = union(inkBox, box);
      // A shaken frame moved the whole layer: the next one puts it back.
      fullNext = !!(ox || oy);
    }

    function drawBoard() {
      var r = v.rect;
      var W = v.pos.W;
      var H = v.pos.H;
      var c = r.cell;
      out.fillStyle = 'rgba(6,9,24,0.85)';
      art.roundRect(out, r.x - 8, r.y - 8, c * W + 16, c * H + 16, 10);
      out.fill();
      out.strokeStyle = 'rgba(237,228,207,0.16)';
      out.lineWidth = 1;
      art.roundRect(out, r.x - 4.5, r.y - 4.5, c * W + 9, c * H + 9, 7);
      out.stroke();
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var px = r.x + x * c;
          var py = r.y + y * c;
          out.fillStyle = (x + y) % 2 ? PAL.lapisA : PAL.lapisB;
          out.fillRect(px, py, c, c);
          out.fillStyle = 'rgba(255,255,255,0.035)';
          out.fillRect(px, py, c, 1);
          out.fillRect(px, py, 1, c);
          out.fillStyle = 'rgba(0,0,0,0.22)';
          out.fillRect(px, py + c - 1, c, 1);
          out.fillRect(px + c - 1, py, 1, c);
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
          out.fillStyle = 'rgba(181,67,47,0.17)';
          out.fillRect(q.x, q.y, c, c);
        });
      }
      if (v.selected >= 0) {
        var s = sqRect(v.selected);
        out.fillStyle = 'rgba(79,183,168,0.16)';
        out.fillRect(s.x, s.y, c, c);
      }
      v.targets.forEach(function (t) {
        var q = sqRect(t.to);
        var cx = q.x + c / 2;
        var cy = q.y + c / 2;
        if (t.capture) {
          out.strokeStyle = PAL.turquoise;
          out.lineWidth = 3;
          var L = c * 0.22;
          var m = 4;
          out.beginPath();
          out.moveTo(q.x + m, q.y + m + L); out.lineTo(q.x + m, q.y + m); out.lineTo(q.x + m + L, q.y + m);
          out.moveTo(q.x + c - m - L, q.y + m); out.lineTo(q.x + c - m, q.y + m); out.lineTo(q.x + c - m, q.y + m + L);
          out.moveTo(q.x + c - m, q.y + c - m - L); out.lineTo(q.x + c - m, q.y + c - m); out.lineTo(q.x + c - m - L, q.y + c - m);
          out.moveTo(q.x + m + L, q.y + c - m); out.lineTo(q.x + m, q.y + c - m); out.lineTo(q.x + m, q.y + c - m - L);
          out.stroke();
        } else {
          out.fillStyle = PAL.turquoise;
          out.beginPath();
          out.arc(cx, cy, c * 0.11, 0, Math.PI * 2);
          out.fill();
        }
        if (t.danger) {
          out.fillStyle = PAL.carnelian;
          out.beginPath();
          out.moveTo(q.x + c - 3, q.y + 3);
          out.lineTo(q.x + c - 3 - c * 0.24, q.y + 3);
          out.lineTo(q.x + c - 3, q.y + 3 + c * 0.24);
          out.closePath();
          out.fill();
        }
      });
      v.inspectTargets.forEach(function (to) {
        var q = sqRect(to);
        out.strokeStyle = 'rgba(181,67,47,0.9)';
        out.lineWidth = 2.5;
        out.beginPath();
        out.arc(q.x + c / 2, q.y + c / 2, c * 0.13, 0, Math.PI * 2);
        out.stroke();
      });
      if (v.inspect >= 0) {
        var iq = sqRect(v.inspect);
        out.fillStyle = 'rgba(181,67,47,0.14)';
        out.fillRect(iq.x, iq.y, c, c);
      }
      void now;
    }

    /** The discs that are moving (dyn) or at rest (the static layer). */
    function drawPieces(dyn) {
      var r = v.rect.cell * 0.4;
      var list = v.pieces.filter(function (p) { return moving(p) === dyn; });
      if (!list.length) return;
      list.sort(function (a, b) {
        return (a.dragging || a.sq === v.selected ? 1 : 0) - (b.dragging || b.sq === v.selected ? 1 : 0) || a.y - b.y;
      });
      list.forEach(function (p) {
        var s = p.s * (1 + (p.lift || 0)) * (p.sq === v.selected || p.dragging ? 1.08 : 1);
        var lift = p.sq === v.selected || p.dragging ? -3 : 0;
        if (p.flip != null && p.flip !== 1) {
          out.save();
          out.translate(p.x, p.y + lift);
          out.scale(Math.max(0.02, p.flip), 1);
          art.drawCached(out, p.type, p.side, 0, 0, Math.round(r), dpr, s, p.a);
          out.restore();
        } else {
          art.drawCached(out, p.type, p.side, p.x, p.y + lift, Math.round(r), dpr, s, p.a);
        }
        if (p.sq === v.selected && !p.dragging) {
          out.strokeStyle = PAL.turquoise;
          out.lineWidth = 2.5;
          out.beginPath();
          out.arc(p.x, p.y + lift, r * s + 4, 0, Math.PI * 2);
          out.stroke();
        }
      });
    }

    function drawParticles() {
      v.particles.forEach(function (p) {
        var k = 1 - p.age / p.life;
        out.globalAlpha = Math.max(0, k);
        out.fillStyle = p.colour;
        if (p.shard) {
          out.save();
          out.translate(p.x, p.y);
          out.rotate(p.rot);
          out.beginPath();
          out.moveTo(-p.size, -p.size * 0.6);
          out.lineTo(p.size, 0);
          out.lineTo(-p.size * 0.4, p.size * 0.8);
          out.closePath();
          out.fill();
          out.restore();
        } else {
          out.beginPath();
          out.arc(p.x, p.y, p.size * k + 0.5, 0, Math.PI * 2);
          out.fill();
        }
      });
      out.globalAlpha = 1;
    }

    function drawFlash(now) {
      var f = v.flash;
      if (!f) return;
      var k = (now - f.t0) / f.dur;
      if (k >= 1) { v.flash = null; return; }
      var rr = v.rect.cell * (0.4 + (v.reduced ? 0.6 : 2.4) * easeOut(k));
      out.strokeStyle = 'rgba(214,177,96,' + (0.9 * (1 - k)) + ')';
      out.lineWidth = 3 * (1 - k) + 1;
      out.beginPath();
      out.arc(f.x, f.y, rr, 0, Math.PI * 2);
      out.stroke();
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
      out.strokeStyle = 'rgba(79,183,168,' + (0.95 * (1 - k)) + ')';
      out.lineWidth = 3;
      out.beginPath();
      out.arc(cx, cy, c * (0.46 + 0.16 * easeOut(k)), 0, Math.PI * 2);
      out.stroke();
      out.strokeStyle = 'rgba(79,183,168,0.85)';
      out.lineWidth = 2;
      out.beginPath();
      out.arc(cx, cy, c * 0.45, 0, Math.PI * 2);
      out.stroke();
      if (h.kind === 'to' && !v.pos.owner[h.sq]) {
        out.fillStyle = PAL.turquoise;
        out.beginPath();
        out.arc(cx, cy, c * 0.12, 0, Math.PI * 2);
        out.fill();
      }
    }

    function setHint(sq, kind) {
      v.hint = sq >= 0 ? { sq: sq, kind: kind } : null;
      request(true);
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
