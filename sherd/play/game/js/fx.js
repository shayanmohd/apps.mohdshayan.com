/*
 * The overlay above everything: glaze chips, rings and the found shard's flight into its vessel.
 * Idle most of the time; it clears itself and stops drawing when nothing moves.
 */
(function (root) {
  'use strict';
  var art = root.Sherd.art;
  var PAL = art.PAL;

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var w = 0;
    var h = 0;
    var dpr = 1;
    var parts = [];
    var rings = [];
    var flights = [];
    var wasActive = false;
    var reduced = false;

    function resize() {
      dpr = Math.min(2.5, root.devicePixelRatio || 1);
      w = root.innerWidth;
      h = root.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    function burst(x, y, opts) {
      if (reduced) return;
      opts = opts || {};
      var n = opts.count || 14;
      var colors = opts.colors || [PAL.cobalt, PAL.cobaltLight, PAL.cobaltDeep, PAL.ink];
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2;
        var sp = (opts.speed || 260) * (0.4 + Math.random() * 0.8);
        parts.push({
          x: x + (Math.random() - 0.5) * (opts.spread || 10), y: y + (Math.random() - 0.5) * (opts.spread || 10),
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.lift || 120), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
          size: (opts.size || 5) * (0.6 + Math.random() * 0.8), life: 0, max: 0.7 + Math.random() * 0.5,
          color: colors[i % colors.length]
        });
      }
    }

    function ring(x, y, color, max) {
      if (reduced) return;
      rings.push({ x: x, y: y, t: 0, max: max || 46, color: color || PAL.cobalt });
    }

    /**
     * Flies the shard (cells of a W grid) from its board box to a point, shrinking to [toSize] px a cell.
     * from: { x, y, s } page px of the shard box's top-left and cell size.
     */
    function flight(cells, W, from, to, toSize, ms, onArrive) {
      var xs = cells.map(function (i) { return i % W; });
      var ys = cells.map(function (i) { return (i / W) | 0; });
      var minX = Math.min.apply(null, xs);
      var minY = Math.min.apply(null, ys);
      var spanX = Math.max.apply(null, xs) - minX + 1;
      var spanY = Math.max.apply(null, ys) - minY + 1;
      flights.push({ cells: cells, W: W, minX: minX, minY: minY, spanX: spanX, spanY: spanY, from: from, to: to, toSize: toSize,
        start: performance.now(), ms: reduced ? 1 : ms, done: onArrive });
    }

    function active() { return parts.length || rings.length || flights.length; }

    function render(now, dt) {
      var any = active();
      if (!any && !wasActive) return false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      wasActive = !!any;
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.life += dt;
        if (p.life > p.max) { parts.splice(i, 1); continue; }
        p.vy += 900 * dt;
        p.vx *= 0.985;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.globalAlpha = 1 - Math.pow(p.life / p.max, 2);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-p.size, -p.size * 0.5);
        ctx.lineTo(p.size * 0.8, -p.size * 0.7);
        ctx.lineTo(p.size * 0.5, p.size * 0.6);
        ctx.lineTo(-p.size * 0.6, p.size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      for (var r = rings.length - 1; r >= 0; r--) {
        var g = rings[r];
        g.t += dt / 0.6;
        if (g.t >= 1) { rings.splice(r, 1); continue; }
        ctx.strokeStyle = g.color;
        ctx.globalAlpha = 1 - g.t;
        ctx.lineWidth = 2.5 * (1 - g.t) + 0.5;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 6 + g.max * art.ease(g.t), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      for (var f = flights.length - 1; f >= 0; f--) {
        var fl = flights[f];
        var t = Math.min(1, (now - fl.start) / fl.ms);
        var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        var s = fl.from.s + (fl.toSize - fl.from.s) * e;
        // the shard's centre travels on a curve, rising first
        var c0x = fl.from.x + fl.spanX * fl.from.s / 2;
        var c0y = fl.from.y + fl.spanY * fl.from.s / 2;
        var c1x = fl.to.x;
        var c1y = fl.to.y;
        var mx = (c0x + c1x) / 2 + (c1x - c0x) * 0.1;
        var my = Math.min(c0y, c1y) - 80;
        var cx = (1 - e) * (1 - e) * c0x + 2 * (1 - e) * e * mx + e * e * c1x;
        var cy = (1 - e) * (1 - e) * c0y + 2 * (1 - e) * e * my + e * e * c1y;
        var ox = cx - fl.spanX * s / 2 - fl.minX * s;
        var oy = cy - fl.spanY * s / 2 - fl.minY * s;
        ctx.save();
        art.drawShard(ctx, fl.cells, fl.W, ox, oy, s, 1 - e * 0.7, -1, 1 - Math.max(0, (t - 0.85) / 0.15) * 0.6);
        ctx.restore();
        if (t >= 1) {
          flights.splice(f, 1);
          if (fl.done) fl.done(c1x, c1y);
        }
      }
      return true;
    }

    return { resize: resize, burst: burst, ring: ring, flight: flight, render: render, active: active,
      setReduced: function (v) { reduced = !!v; } };
  }

  root.Sherd.fx = { create: create };
})(this);
