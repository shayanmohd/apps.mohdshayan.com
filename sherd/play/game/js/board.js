/*
 * The dig board: draws one dig on its own canvas and turns touches into a probe.
 *
 * Painting: touch a cell and drag through neighbours; dragging back onto the previous cell unpaints the
 * last one. A tap adds a touching cell or removes a painted one if the rest stays in one piece. Anything
 * else (a cell that does not touch, bedrock, a sixth cell) is refused at once with a shake.
 */
(function (root) {
  'use strict';
  var Sherd = root.Sherd;
  var rules = Sherd.rules;
  var art = Sherd.art;
  var PAL = art.PAL;

  var STAMP_GAP = 70;
  var STAMP_TIME = 220;

  function create(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var b = {
      dig: null, selection: [], tex: [], knowledge: null, mode: 'daily', ghost: null, interactive: false,
      stamps: {}, clearedAt: {}, shakes: {}, win: 0, loss: 0, shake: null, survey: null, surveyFrame: null,
      cssSize: 0, s: 0, ox: 0, oy: 0, dpr: 1, reduced: false, hover: -1, dirty: true, lastAnim: 0
    };
    var stroke = null;
    // The backing store is sized once, here, before Shell.ready(): as big as the board can get on this
    // screen. layout() only changes its CSS size and the drawing scale (recipe 2b).
    var scr = art.screenCss();
    var side = Math.max(120, Math.min(560, scr.w, scr.h));
    art.allocate(canvas, side, side, 3);

    // ---- layout ----

    function layout(size) {
      var css = Math.max(120, Math.floor(size));
      b.cssSize = css;
      b.dpr = canvas.width / css;
      canvas.style.width = b.cssSize + 'px';
      canvas.style.height = b.cssSize + 'px';
      fit();
      b.dirty = true;
    }

    function fit() {
      if (!b.dig) return;
      var label = 16;
      var room = b.cssSize - label - 6;
      b.s = Math.floor(room / b.dig.W);
      var grid = b.s * b.dig.W;
      b.ox = label + Math.floor((room - grid) / 2);
      b.oy = label + Math.floor((room - grid) / 2);
    }

    function setDig(dig, opts) {
      opts = opts || {};
      b.dig = dig;
      b.mode = opts.mode || 'daily';
      b.ghost = opts.ghost || null;
      b.interactive = !dig.done;
      b.selection = [];
      b.stamps = {};
      b.clearedAt = {};
      b.shakes = {};
      b.win = dig.won ? -1 : 0;
      b.loss = dig.done && !dig.won ? -1 : 0;
      b.survey = null;
      b.tex = [];
      for (var i = 0; i < dig.W * dig.W; i++) b.tex.push(art.cellTexture(i * 7 + dig.W));
      b.knowledge = rules.knowledge(dig);
      fit();
      b.dirty = true;
      changed();
    }

    function changed() {
      b.dirty = true;
      if (hooks.onSelection) hooks.onSelection(b.selection.slice());
    }

    // ---- input ----

    function cellAt(e, strict) {
      if (!b.dig) return -1;
      var r = canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * (b.cssSize / r.width) - b.ox;
      var y = (e.clientY - r.top) * (b.cssSize / r.height) - b.oy;
      var cx = Math.floor(x / b.s);
      var cy = Math.floor(y / b.s);
      if (cx < 0 || cy < 0 || cx >= b.dig.W || cy >= b.dig.W) return -1;
      if (strict) {
        // While dragging, a cell counts only once the finger is well inside it, so a diagonal slip
        // across a corner does not paint the wrong neighbour.
        var fx = x / b.s - cx - 0.5;
        var fy = y / b.s - cy - 0.5;
        if (Math.abs(fx) > 0.38 || Math.abs(fy) > 0.38) return -2;
      }
      return cy * b.dig.W + cx;
    }

    function refuse(i, why) {
      if (i >= 0) b.shakes[i] = performance.now();
      if (why === 'bedrock' && !b.reduced) b.shake = { start: performance.now(), amp: 2 };
      b.dirty = true;
      if (hooks.onRefuse) hooks.onRefuse(why);
    }

    function tryAdd(i, quietly) {
      var why = rules.addRefusal(b.selection, i, b.dig);
      if (why) {
        if (why !== 'taken') refuse(i, why);
        return false;
      }
      b.selection.push(i);
      if (hooks.onPaint) hooks.onPaint(b.selection.length, true);
      changed();
      return true;
    }

    function down(e) {
      if (!b.dig || !b.interactive) return;
      if (hooks.onTouch) hooks.onTouch();
      var i = cellAt(e, false);
      if (i < 0) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* old WebView */ }
      if (b.survey) {
        moveSurvey(i);
        stroke = { survey: true, id: e.pointerId };
        return;
      }
      var k = b.selection.indexOf(i);
      if (k >= 0) {
        stroke = { id: e.pointerId, start: i, moved: false, tapRemove: k !== b.selection.length - 1 || b.selection.length === 1, refused: {} };
        return;
      }
      var added = tryAdd(i);
      stroke = { id: e.pointerId, start: i, moved: false, tapRemove: false, added: added, refused: {} };
    }

    function move(e) {
      if (!b.dig) return;
      if (!stroke || stroke.id !== e.pointerId) {
        if (e.pointerType === 'mouse' && b.interactive) {
          var h = cellAt(e, false);
          if (h !== b.hover) { b.hover = h; b.dirty = true; }
        }
        return;
      }
      if (stroke.survey) {
        var si = cellAt(e, false);
        if (si >= 0) moveSurvey(si);
        return;
      }
      var i = cellAt(e, true);
      if (i < 0) return;
      if (i === stroke.start && !stroke.moved) return;
      stroke.moved = true;
      var sel = b.selection;
      if (sel.length >= 2 && sel[sel.length - 2] === i) {
        var gone = sel.pop();
        if (hooks.onPaint) hooks.onPaint(sel.length, false);
        changed();
        stroke.refused[gone] = false;
        return;
      }
      if (sel.indexOf(i) >= 0) return;
      if (stroke.refused[i]) return;
      if (!tryAdd(i)) stroke.refused[i] = true;
    }

    function up(e) {
      if (!stroke || stroke.id !== e.pointerId) return;
      var st = stroke;
      stroke = null;
      if (st.survey) return;
      if (!st.moved && st.tapRemove) {
        if (rules.canRemove(b.selection, st.start, b.dig.W)) {
          b.selection.splice(b.selection.indexOf(st.start), 1);
          if (hooks.onPaint) hooks.onPaint(b.selection.length, false);
          changed();
        } else {
          refuse(st.start, 'split');
        }
      }
    }

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', function () { stroke = null; });
    canvas.addEventListener('pointerleave', function () { if (b.hover !== -1) { b.hover = -1; b.dirty = true; } });

    function undo() {
      if (!b.selection.length) return false;
      b.selection.pop();
      changed();
      return true;
    }

    function clear() {
      if (!b.selection.length) return false;
      b.selection = [];
      changed();
      return true;
    }

    // ---- survey placement ----

    function startSurvey() {
      var W = b.dig.W;
      var c = Math.floor(W / 2);
      b.survey = { cx: c, cy: c };
      b.dirty = true;
    }

    function moveSurvey(i) {
      var W = b.dig.W;
      var block = rules.surveyBlock(W, i % W, (i / W) | 0);
      b.survey = { cx: block.x0 + 1, cy: block.y0 + 1 };
      b.dirty = true;
    }

    function stopSurvey() { b.survey = null; b.dirty = true; }

    // ---- results of a try ----

    /** Animates the marks of the newest observation (a try, or the survey when [obs] is given). */
    function reveal(obs) {
      var now = performance.now();
      var before = b.knowledge;
      b.knowledge = rules.knowledge(b.dig);
      var cells = obs.cells;
      var gap = b.reduced ? 30 : STAMP_GAP;
      cells.forEach(function (c, k) { b.stamps[c] = { at: now + k * gap, mark: obs.marks[k] }; });
      // cells cleared by the new misses appear after the miss that clears them
      for (var i = 0; i < b.knowledge.cleared.length; i++) {
        if (b.knowledge.cleared[i] && !before.cleared[i]) {
          var when = now + cells.length * gap;
          for (var k = 0; k < cells.length; k++) {
            if (obs.marks[k] === rules.MISS && rules.adjacent(cells[k], i, b.dig.W)) { when = now + k * gap + 140; break; }
          }
          b.clearedAt[i] = when;
        }
      }
      b.selection = [];
      if (b.dig.done) b.interactive = false;
      b.dirty = true;
      if (hooks.onSelection) hooks.onSelection([]);
      return cells.length * gap + STAMP_TIME;
    }

    function celebrate() { b.win = performance.now(); b.dirty = true; if (!b.reduced) b.shake = { start: b.win + 260, amp: 3 }; }
    function mourn() { b.loss = performance.now(); b.dirty = true; }

    // ---- drawing ----

    function render(now) {
      if (!b.dig) return false;
      var animating = false;
      ctx.setTransform(b.dpr, 0, 0, b.dpr, 0, 0);
      ctx.clearRect(0, 0, b.cssSize, b.cssSize);
      var W = b.dig.W;
      var s = b.s;
      if (b.shake) {
        var st = (now - b.shake.start) / 220;
        if (st >= 0 && st < 1) {
          var a = b.shake.amp * (1 - st);
          ctx.translate(Math.sin(st * 40) * a, Math.cos(st * 33) * a * 0.6);
          animating = true;
        } else if (st >= 1) {
          b.shake = null;
        } else {
          animating = true;
        }
      }
      drawFrame(W, s);
      var k = b.knowledge;
      for (var i = 0; i < W * W; i++) {
        var x = b.ox + (i % W) * s;
        var y = b.oy + ((i / W) | 0) * s;
        var dx = 0;
        if (b.shakes[i]) {
          var t = (now - b.shakes[i]) / 320;
          if (t < 1) { dx = b.reduced ? 0 : Math.sin(t * 28) * 4 * (1 - t); animating = true; } else delete b.shakes[i];
        }
        x += dx;
        if (b.dig.blockedMask[i]) { art.drawBedrock(ctx, x, y, s, b.tex[i]); continue; }
        var stamp = b.stamps[i];
        var mark = k.mark[i];
        if (stamp) {
          var p = (now - stamp.at) / STAMP_TIME;
          if (p < 0) { mark = -1; animating = true; } else if (p < 1) {
            animating = true;
            art.drawEmpty(ctx, x, y, s);
            var sc = b.reduced ? 1 : 1.35 - 0.35 * art.easeBack(p);
            ctx.save();
            ctx.globalAlpha = Math.min(1, p * 2.2);
            ctx.translate(x + s / 2, y + s / 2);
            ctx.scale(sc, sc);
            ctx.translate(-x - s / 2, -y - s / 2);
            drawMark(stamp.mark, x, y, s, i);
            ctx.restore();
            if (dx) { if (b.shakes[i]) ctx.globalAlpha = 1; }
            continue;
          } else {
            delete b.stamps[i];
          }
        }
        if (mark >= 0) { drawMark(mark, x, y, s, i); continue; }
        art.drawEmpty(ctx, x, y, s);
        if (k.cleared[i]) {
          var ca = b.clearedAt[i];
          var amt = 1;
          if (ca) {
            var q = (now - ca) / 260;
            if (q < 0) { amt = 0; animating = true; } else if (q < 1) { amt = art.ease(q); animating = true; } else delete b.clearedAt[i];
          }
          if (amt > 0) art.drawCleared(ctx, x, y, s, b.tex[i], amt);
          if (ca && amt > 0 && amt < 1 && !b.reduced) {
            // the plus ripple: a pencil ring opening out over the cleared cell
            ctx.strokeStyle = 'rgba(142,131,111,' + (0.6 * (1 - amt)).toFixed(3) + ')';
            ctx.lineWidth = 2;
            art.rr(ctx, x + s * (0.5 - 0.5 * amt), y + s * (0.5 - 0.5 * amt), s * amt, s * amt, 4);
            ctx.stroke();
          }
        }
      }
      if (b.interactive && !b.survey) animating = drawHints(now, W, s) || animating;
      if (b.selection.length) art.drawProbe(ctx, b.selection, W, b.ox, b.oy, s, b.selection.length === b.dig.n);
      if (b.survey) drawSurveyFrame(now, W, s);
      if (b.win) animating = drawWin(now, W, s) || animating;
      if (b.loss) animating = drawLoss(now, W, s) || animating;
      b.dirty = false;
      return animating;
    }

    function drawMark(mark, x, y, s, i) {
      if (mark === rules.HIT) art.drawHit(ctx, x, y, s, b.tex[i]);
      else if (mark === rules.NEAR) { art.drawEmpty(ctx, x, y, s); art.drawNear(ctx, x, y, s); }
      else art.drawMiss(ctx, x, y, s, b.tex[i]);
    }

    function drawFrame(W, s) {
      var gx = b.ox;
      var gy = b.oy;
      var g = W * s;
      ctx.fillStyle = 'rgba(212,216,209,0.55)';
      art.rr(ctx, gx - 4, gy - 4, g + 8, g + 8, 6);
      ctx.fill();
      ctx.strokeStyle = PAL.pencil;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = PAL.pencil;
      ctx.font = '500 10px "Sofia Cond", "Roboto Condensed", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.beginPath();
      for (var i = 0; i < W; i++) {
        ctx.fillText(String.fromCharCode(65 + i), gx + (i + 0.5) * s, gy - 11);
        ctx.fillText(String(i + 1), gx - 11, gy + (i + 0.5) * s);
        if (i) {
          ctx.moveTo(gx + i * s, gy - 4);
          ctx.lineTo(gx + i * s, gy - 8);
          ctx.moveTo(gx - 4, gy + i * s);
          ctx.lineTo(gx - 8, gy + i * s);
        }
      }
      ctx.stroke();
    }

    function drawHints(now, W, s) {
      var animating = false;
      var sel = b.selection;
      if (sel.length && sel.length < b.dig.n) {
        ctx.fillStyle = 'rgba(31,42,49,0.32)';
        for (var i = 0; i < W * W; i++) {
          if (rules.addRefusal(sel, i, b.dig)) continue;
          ctx.beginPath();
          ctx.arc(b.ox + (i % W + 0.5) * s, b.oy + (((i / W) | 0) + 0.5) * s, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (b.hover >= 0 && sel.indexOf(b.hover) < 0 && !rules.addRefusal(sel, b.hover, b.dig)) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = PAL.ink;
        ctx.lineWidth = 1.5;
        art.rr(ctx, b.ox + (b.hover % W) * s + 4, b.oy + ((b.hover / W) | 0) * s + 4, s - 8, s - 8, 4);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (b.ghost && b.dig.tries.length === 0) {
        animating = true;
        var pulse = b.reduced ? 0.6 : 0.45 + 0.35 * Math.sin(now / 260);
        ctx.save();
        ctx.globalAlpha = sel.length ? 0.35 : pulse;
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = b.reduced ? 0 : -now / 40;
        art.shapePath(ctx, b.ghost, W, b.ox, b.oy, s, 5, s * 0.14);
        ctx.strokeStyle = PAL.cobalt;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
        if (!sel.length && !b.reduced) {
          // a fingertip tracing the ghost, left to right, then a pause
          var cycle = (now % 2600) / 1700;
          if (cycle <= 1) {
            var f = cycle * (b.ghost.length - 1);
            var a = b.ghost[Math.floor(f)];
            var c = b.ghost[Math.min(b.ghost.length - 1, Math.floor(f) + 1)];
            var u = f - Math.floor(f);
            var fx = b.ox + ((a % W) * (1 - u) + (c % W) * u + 0.5) * s;
            var fy = b.oy + ((((a / W) | 0) * (1 - u)) + (((c / W) | 0) * u) + 0.5) * s;
            ctx.fillStyle = 'rgba(31,42,49,0.22)';
            ctx.beginPath();
            ctx.arc(fx, fy, s * 0.32, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(31,42,49,0.55)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }
      return animating;
    }

    function drawSurveyFrame(now, W, s) {
      var blk = rules.surveyBlock(W, b.survey.cx, b.survey.cy);
      var x = b.ox + blk.x0 * s;
      var y = b.oy + blk.y0 * s;
      ctx.fillStyle = 'rgba(43,76,140,0.12)';
      ctx.fillRect(x, y, s * 3, s * 3);
      ctx.strokeStyle = PAL.cobalt;
      ctx.lineWidth = 3;
      var L = s * 0.5;
      ctx.beginPath();
      [[x, y, 1, 1], [x + 3 * s, y, -1, 1], [x, y + 3 * s, 1, -1], [x + 3 * s, y + 3 * s, -1, -1]].forEach(function (c) {
        ctx.moveTo(c[0] + c[2] * L, c[1]);
        ctx.lineTo(c[0], c[1]);
        ctx.lineTo(c[0], c[1] + c[3] * L);
      });
      ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 1, y + 1, s * 3 - 2, s * 3 - 2);
      ctx.setLineDash([]);
    }

    function drawWin(now, W, s) {
      var t = b.win < 0 ? 10 : (now - b.win) / 1000;
      var lift = b.reduced ? 0.5 : Math.min(1, art.ease(t / 0.45)) * (t < 1.6 ? 1 : Math.max(0.5, 1 - (t - 1.6) * 0.8));
      var sweep = b.reduced ? 0 : (t - 0.25) / 0.9;
      art.drawShard(ctx, b.dig.target, W, b.ox, b.oy, s, lift, sweep, Math.min(1, t * 4));
      return t < 2.3;
    }

    function drawLoss(now, W, s) {
      var t = b.loss < 0 ? 10 : (now - b.loss) / 600;
      art.drawMissedShard(ctx, b.dig.target, W, b.ox, b.oy, s, Math.min(1, t));
      return t < 1;
    }

    /** The shard's box in page coordinates (for the flight to the vessel). */
    function shardRect() {
      var r = canvas.getBoundingClientRect();
      var k = r.width / b.cssSize;
      var W = b.dig.W;
      var xs = b.dig.target.map(function (i) { return i % W; });
      var ys = b.dig.target.map(function (i) { return (i / W) | 0; });
      var x0 = Math.min.apply(null, xs);
      var y0 = Math.min.apply(null, ys);
      return { x: r.left + (b.ox + x0 * b.s) * k, y: r.top + (b.oy + y0 * b.s) * k, s: b.s * k,
        w: (Math.max.apply(null, xs) - x0 + 1) * b.s * k, h: (Math.max.apply(null, ys) - y0 + 1) * b.s * k };
    }

    return {
      state: b, layout: layout, setDig: setDig, undo: undo, clear: clear, reveal: reveal, celebrate: celebrate,
      mourn: mourn, render: render, startSurvey: startSurvey, stopSurvey: stopSurvey, shardRect: shardRect,
      get selection() { return b.selection.slice(); },
      get surveyCentre() { return b.survey ? { cx: b.survey.cx, cy: b.survey.cy } : null; },
      setReduced: function (r) { b.reduced = !!r; b.dirty = true; },
      setGhost: function (g) { b.ghost = g; b.dirty = true; },
      setInteractive: function (on) { b.interactive = !!on && b.dig && !b.dig.done; b.dirty = true; },
      isDirty: function () { return b.dirty; },
      markDirty: function () { b.dirty = true; }
    };
  }

  root.Sherd.board = { create: create };
})(this);
