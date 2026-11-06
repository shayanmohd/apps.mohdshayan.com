/*
 * Sherd's drawing: one palette (drafting film and cobalt), ink lines, and three marks that read by shape
 * and texture before colour: glaze (hit), hatched rim (near), soil (miss). Also the glazed shard, the
 * film texture and the procedural vessels. Every texture is seeded, so nothing flickers between frames.
 */
(function (root) {
  'use strict';
  var Sherd = root.Sherd;
  var rng = Sherd.rng;
  var museum = Sherd.museum;

  var PAL = {
    film: '#E2E5DF', filmShade: '#D4D8D1', filmDeep: '#C8CDC5', pencil: '#8F9A95', pencilLight: '#B5BDB8',
    ink: '#1F2A31', cobalt: '#2B4C8C', cobaltLight: '#5D80C6', cobaltDeep: '#1A3061', oxide: '#A2532E',
    soil: '#A99E8A', soilFill: '#CFC8B9', soilDeep: '#8E836F', bedrock: '#59605F', bedrockLight: '#7A8281'
  };

  // ---- small helpers ----

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function ease(t) { return t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3); }
  function easeBack(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    var c1 = 1.70158;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  // ---- the film ----

  /** Paints the drafting film: grain, a few fibres and a soft edge. Once per resize. */
  function paintFilm(canvas, w, h, dpr) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAL.film;
    ctx.fillRect(0, 0, w, h);
    var tile = document.createElement('canvas');
    tile.width = tile.height = 160;
    var t = tile.getContext('2d');
    var img = t.createImageData(160, 160);
    var r = rng.create(91);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = r();
      var dark = v < 0.5;
      img.data[i] = dark ? 31 : 255;
      img.data[i + 1] = dark ? 42 : 255;
      img.data[i + 2] = dark ? 49 : 255;
      img.data[i + 3] = Math.floor(Math.abs(v - 0.5) * 2 * (dark ? 16 : 22));
    }
    t.putImageData(img, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    var f = rng.create(17);
    ctx.lineCap = 'round';
    for (var k = 0; k < Math.round(w * h / 9000); k++) {
      var x = f() * w;
      var y = f() * h;
      var len = 10 + f() * 40;
      var a = f() * Math.PI * 2;
      ctx.strokeStyle = 'rgba(31,42,49,' + (0.02 + f() * 0.03).toFixed(3) + ')';
      ctx.lineWidth = 0.5 + f() * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (f() - 0.5) * 12, y + Math.sin(a) * len * 0.5 + (f() - 0.5) * 12,
        x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    var g = ctx.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.8);
    g.addColorStop(0, 'rgba(31,42,49,0)');
    g.addColorStop(1, 'rgba(31,42,49,0.07)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // ---- per-cell textures, seeded once ----

  function cellTexture(seed) {
    var r = rng.create(rng.seed('cell', seed));
    var dots = [];
    for (var i = 0; i < 9; i++) dots.push([0.18 + r() * 0.64, 0.18 + r() * 0.64, 0.025 + r() * 0.035]);
    var cracks = [];
    for (var c = 0; c < 3; c++) {
      var pts = [];
      var x = r();
      var y = r();
      var a = r() * Math.PI * 2;
      for (var p = 0; p < 4; p++) {
        pts.push([x, y]);
        a += (r() - 0.5) * 1.6;
        x += Math.cos(a) * 0.28;
        y += Math.sin(a) * 0.28;
      }
      cracks.push(pts);
    }
    var chips = [];
    for (var k = 0; k < 8; k++) chips.push(0.08 + r() * 0.1);
    return { dots: dots, cracks: cracks, chips: chips, tilt: (r() - 0.5) * 0.06 };
  }

  /** An unprobed cell: film with a pencil square. */
  function drawEmpty(ctx, x, y, s) {
    rr(ctx, x + 1.5, y + 1.5, s - 3, s - 3, s * 0.08);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.strokeStyle = PAL.pencilLight;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** A cell a miss has ruled out: a pale wash of sifted soil, no marks. */
  function drawCleared(ctx, x, y, s, tex, amount) {
    rr(ctx, x + 1.5, y + 1.5, s - 3, s - 3, s * 0.08);
    ctx.fillStyle = 'rgba(169,158,138,' + (0.28 * amount).toFixed(3) + ')';
    ctx.fill();
    ctx.fillStyle = 'rgba(142,131,111,' + (0.35 * amount).toFixed(3) + ')';
    for (var i = 0; i < 2; i++) {
      var d = tex.dots[i];
      ctx.beginPath();
      ctx.arc(x + d[0] * s, y + d[1] * s, Math.max(0.6, d[2] * s * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Miss: plain soil. A solid earth fill and stipple, no rim. */
  function drawMiss(ctx, x, y, s, tex) {
    rr(ctx, x + 2, y + 2, s - 4, s - 4, s * 0.1);
    ctx.fillStyle = PAL.soilFill;
    ctx.fill();
    ctx.fillStyle = PAL.soilDeep;
    for (var i = 0; i < tex.dots.length; i++) {
      var d = tex.dots[i];
      ctx.globalAlpha = 0.45 + (i % 3) * 0.15;
      ctx.beginPath();
      ctx.arc(x + d[0] * s, y + d[1] * s, Math.max(0.7, d[2] * s), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Near: an open square rim in oxide with diagonal hatching inside. */
  function drawNear(ctx, x, y, s) {
    var inset = s * 0.13;
    var w = s - inset * 2;
    ctx.save();
    rr(ctx, x + inset, y + inset, w, w, s * 0.08);
    ctx.clip();
    ctx.strokeStyle = PAL.oxide;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    var step = s / 6.5;
    for (var k = -s; k < s * 2; k += step) {
      ctx.moveTo(x + k, y + s);
      ctx.lineTo(x + k + s, y);
    }
    ctx.stroke();
    ctx.restore();
    rr(ctx, x + inset, y + inset, w, w, s * 0.08);
    ctx.strokeStyle = PAL.oxide;
    ctx.lineWidth = Math.max(2, s * 0.075);
    ctx.stroke();
  }

  function glazeFill(ctx, x, y, w, h) {
    var g = ctx.createLinearGradient(x, y, x + w * 0.7, y + h);
    g.addColorStop(0, PAL.cobaltLight);
    g.addColorStop(0.42, PAL.cobalt);
    g.addColorStop(1, PAL.cobaltDeep);
    return g;
  }

  /** Hit: solid cobalt glaze with crackle and a highlight. */
  function drawHit(ctx, x, y, s, tex) {
    rr(ctx, x + 2, y + 2, s - 4, s - 4, s * 0.12);
    ctx.fillStyle = glazeFill(ctx, x, y, s, s);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(214,226,250,0.38)';
    ctx.lineWidth = Math.max(0.6, s * 0.012);
    tex.cracks.forEach(function (pts) {
      ctx.beginPath();
      ctx.moveTo(x + pts[0][0] * s, y + pts[0][1] * s);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(x + pts[i][0] * s, y + pts[i][1] * s);
      ctx.stroke();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.ellipse(x + s * 0.32, y + s * 0.27, s * 0.16, s * 0.07, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    rr(ctx, x + 2, y + 2, s - 4, s - 4, s * 0.12);
    ctx.strokeStyle = 'rgba(16,30,62,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** Bedrock: dark stone, chipped, cross-hatched. Never probed, never the shard. */
  function drawBedrock(ctx, x, y, s, tex) {
    var cx = x + s / 2;
    var cy = y + s / 2;
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      var rad = s * (0.5 - tex.chips[i] * 0.6) * 1.32;
      var px = cx + Math.cos(a) * Math.min(rad, s * 0.48);
      var py = cy + Math.sin(a) * Math.min(rad, s * 0.48);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = PAL.bedrock;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(226,229,223,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var k = -s; k < s * 2; k += s / 5) {
      ctx.moveTo(x + k, y);
      ctx.lineTo(x + k + s, y + s);
      ctx.moveTo(x + k + s, y);
      ctx.lineTo(x + k, y + s);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---- shapes made of cells ----

  /**
   * The outline of a set of cells as closed loops of corner points, pulled in by [inset] and ready for a
   * rounded path. Walks the boundary with the cells on the right; every corner moves inward along both
   * edges' normals, which handles convex and concave corners alike. Sets of up to 6 cells have no holes.
   */
  function loops(cells, W, inset) {
    var set = {};
    cells.forEach(function (i) { set[i] = true; });
    var has = function (x, y) { return x >= 0 && y >= 0 && x < W && y < W && set[y * W + x]; };
    var byStart = {};
    function add(x1, y1, x2, y2, nx, ny) {
      byStart[x1 + ',' + y1] = { x1: x1, y1: y1, x2: x2, y2: y2, nx: nx, ny: ny, dx: x2 - x1, dy: y2 - y1, used: false };
    }
    cells.forEach(function (i) {
      var x = i % W;
      var y = (i / W) | 0;
      if (!has(x, y - 1)) add(x, y, x + 1, y, 0, 1);
      if (!has(x + 1, y)) add(x + 1, y, x + 1, y + 1, -1, 0);
      if (!has(x, y + 1)) add(x + 1, y + 1, x, y + 1, 0, -1);
      if (!has(x - 1, y)) add(x, y + 1, x, y, 1, 0);
    });
    var out = [];
    Object.keys(byStart).forEach(function (k) {
      var e = byStart[k];
      if (e.used) return;
      var chain = [];
      var guard = 0;
      while (e && !e.used && guard++ < 200) {
        e.used = true;
        chain.push(e);
        e = byStart[e.x2 + ',' + e.y2];
      }
      var pts = [];
      for (var j = 0; j < chain.length; j++) {
        var a = chain[j];
        var b = chain[(j + 1) % chain.length];
        if (a.dx === b.dx && a.dy === b.dy) continue;
        pts.push([a.x2 + (a.nx + b.nx) * inset, a.y2 + (a.ny + b.ny) * inset]);
      }
      out.push(pts);
    });
    return out;
  }

  /** A rounded path round a set of cells (pixel space). */
  function shapePath(ctx, cells, W, ox, oy, s, inset, radius) {
    ctx.beginPath();
    loops(cells, W, inset / s).forEach(function (pts) {
      var n = pts.length;
      if (n < 3) return;
      var P = function (k) { var p = pts[(k + n) % n]; return [ox + p[0] * s, oy + p[1] * s]; };
      var start = P(0);
      var prev = P(-1);
      ctx.moveTo((start[0] + prev[0]) / 2, (start[1] + prev[1]) / 2);
      for (var k = 0; k < n; k++) {
        var c = P(k);
        var nx = P(k + 1);
        ctx.arcTo(c[0], c[1], nx[0], nx[1], radius);
      }
      ctx.closePath();
    });
  }

  /** The probe being painted: an inked outline of its shape over a light wash. */
  function drawProbe(ctx, cells, W, ox, oy, s, full) {
    if (!cells.length) return;
    shapePath(ctx, cells, W, ox, oy, s, 3, s * 0.12);
    ctx.fillStyle = full ? 'rgba(43,76,140,0.16)' : 'rgba(31,42,49,0.10)';
    ctx.fill();
    ctx.strokeStyle = full ? PAL.cobalt : PAL.ink;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = full ? PAL.cobalt : PAL.ink;
    cells.forEach(function (i, k) {
      var cx = ox + (i % W + 0.5) * s;
      var cy = oy + (((i / W) | 0) + 0.5) * s;
      ctx.beginPath();
      ctx.arc(cx, cy, k === cells.length - 1 ? 4 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  var shardTexCache = {};

  function shardTexture(key) {
    if (shardTexCache[key]) return shardTexCache[key];
    var r = rng.create(rng.seed('shard', key));
    var lines = [];
    for (var c = 0; c < 9; c++) {
      var pts = [];
      var x = r() * 4;
      var y = r() * 4;
      var a = r() * Math.PI * 2;
      for (var p = 0; p < 6; p++) {
        pts.push([x, y]);
        a += (r() - 0.5) * 1.4;
        x += Math.cos(a) * 0.45;
        y += Math.sin(a) * 0.45;
      }
      lines.push(pts);
    }
    shardTexCache[key] = lines;
    return lines;
  }

  /**
   * The found shard: the cells fused into one glazed piece. lift (0 to 1) raises it with a shadow;
   * sweep (0 to 1) runs a highlight across it.
   */
  function drawShard(ctx, cells, W, ox, oy, s, lift, sweep, alpha) {
    if (!cells.length) return;
    var key = cells.join(',');
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    cells.forEach(function (i) {
      var x = i % W;
      var y = (i / W) | 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    });
    var bx = ox + minX * s;
    var by = oy + minY * s;
    var bw = (maxX - minX + 1) * s;
    var bh = (maxY - minY + 1) * s;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    var up = (lift || 0) * s * 0.12;
    if (lift > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(16,30,62,0.35)';
      ctx.shadowBlur = 18 * lift;
      ctx.shadowOffsetY = 10 * lift;
      shapePath(ctx, cells, W, ox, oy - up, s, 2.5, s * 0.14);
      ctx.fillStyle = PAL.cobalt;
      ctx.fill();
      ctx.restore();
    }
    shapePath(ctx, cells, W, ox, oy - up, s, 2.5, s * 0.14);
    ctx.fillStyle = glazeFill(ctx, bx, by - up, bw, bh);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(214,226,250,0.42)';
    ctx.lineWidth = Math.max(0.7, s * 0.014);
    shardTexture(key).forEach(function (pts) {
      ctx.beginPath();
      ctx.moveTo(bx + pts[0][0] * s, by - up + pts[0][1] * s);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(bx + pts[i][0] * s, by - up + pts[i][1] * s);
      ctx.stroke();
    });
    if (sweep > 0 && sweep < 1) {
      var sx = bx - bw + sweep * bw * 3;
      var g = ctx.createLinearGradient(sx, by, sx + s * 1.2, by + bh);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(bx - s, by - up - s, bw + s * 2, bh + s * 2);
    }
    ctx.restore();
    shapePath(ctx, cells, W, ox, oy - up, s, 2.5, s * 0.14);
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /** The shard a lost dig never found: a dashed cobalt outline over a thin glaze wash. */
  function drawMissedShard(ctx, cells, W, ox, oy, s, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    shapePath(ctx, cells, W, ox, oy, s, 3, s * 0.12);
    ctx.fillStyle = 'rgba(43,76,140,0.22)';
    ctx.fill();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = PAL.cobalt;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  // ---- vessels ----

  function silhouettePath(ctx, v, cx, foot, h, steps) {
    var prof = museum.profile(v, steps || 48);
    ctx.beginPath();
    for (var i = 0; i < prof.length; i++) {
      var px = cx - prof[i][1] * h;
      var py = foot - prof[i][0] * h;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    for (var j = prof.length - 1; j >= 0; j--) ctx.lineTo(cx + prof[j][1] * h, foot - prof[j][0] * h);
    ctx.closePath();
  }

  // Jagged fragment edges: every edge is cut the same way from both sides, keyed on its endpoints.
  function jaggedEdge(a, b, out) {
    var ka = a[0].toFixed(5) + ',' + a[1].toFixed(5);
    var kb = b[0].toFixed(5) + ',' + b[1].toFixed(5);
    var flip = ka > kb;
    var p = flip ? b : a;
    var q = flip ? a : b;
    var r = rng.create(rng.seed('edge', flip ? kb + kb + ka : ka + kb));
    var dx = q[0] - p[0];
    var dy = q[1] - p[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len;
    var ny = dx / len;
    var pts = [];
    var steps = 4;
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var off = (r() - 0.5) * len * 0.22;
      pts.push([p[0] + dx * t + nx * off, p[1] + dy * t + ny * off]);
    }
    if (flip) pts.reverse();
    for (var k = 0; k < pts.length; k++) out.push(pts[k]);
    out.push(b);
  }

  function fragmentPath(ctx, poly, cx, foot, h) {
    var pts = [poly[0]];
    for (var i = 0; i < poly.length; i++) jaggedEdge(poly[i], poly[(i + 1) % poly.length], pts);
    ctx.moveTo(cx + pts[0][0] * h, foot - pts[0][1] * h);
    for (var k = 1; k < pts.length; k++) ctx.lineTo(cx + pts[k][0] * h, foot - pts[k][1] * h);
    ctx.closePath();
  }

  function band(ctx, v, culture, b, cx, foot, h) {
    var y0 = b[0];
    var y1 = b[1];
    var kind = b[2];
    var tilt = 0.07;
    var color = culture.slip;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, h * 0.012);
    function at(y, theta) {
      var r = museum.radiusAt(v, y);
      return [cx + Math.sin(theta) * r * h, foot - y * h + Math.cos(theta) * r * h * tilt];
    }
    function ring(y) {
      ctx.beginPath();
      for (var a = -Math.PI / 2; a <= Math.PI / 2 + 0.001; a += Math.PI / 24) {
        var p = at(y, a);
        if (a === -Math.PI / 2) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
    }
    ring(y0);
    ring(y1);
    var repeats = 14;
    var mid = (y0 + y1) / 2;
    for (var i = 0; i < repeats; i++) {
      var th = -Math.PI + (i + 0.5) * (Math.PI * 2 / repeats);
      if (Math.cos(th) <= 0.05) continue;
      var w = Math.PI / repeats;
      var a0 = th - w * 0.8;
      var a1 = th + w * 0.8;
      var p0;
      var p1;
      var p2;
      if (kind === 'chevron') {
        p0 = at(y1 - (y1 - y0) * 0.15, a0); p1 = at(y0 + (y1 - y0) * 0.15, th); p2 = at(y1 - (y1 - y0) * 0.15, a1);
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      } else if (kind === 'wave') {
        ctx.beginPath();
        for (var s = 0; s <= 8; s++) {
          var aa = a0 + (a1 - a0) * s / 8;
          var yy = mid + Math.sin(s / 8 * Math.PI * 2) * (y1 - y0) * 0.3;
          var p = at(yy, aa);
          if (s) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
        }
        ctx.stroke();
      } else if (kind === 'dots') {
        var c = at(mid, th);
        var rad = (y1 - y0) * h * 0.28;
        ctx.beginPath();
        ctx.ellipse(c[0], c[1], Math.max(0.5, rad * Math.cos(th)), rad, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'ladder') {
        p0 = at(y0, th); p1 = at(y1, th);
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      } else if (kind === 'steps') {
        var q0 = at(y0, a0);
        var q1 = at(y0, a1);
        var q2 = at(y0 + (y1 - y0) * 0.5, a1);
        var q3 = at(y0 + (y1 - y0) * 0.5, th);
        var q4 = at(y1, th);
        var q5 = at(y1, a0);
        ctx.beginPath();
        ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]);
        ctx.lineTo(q3[0], q3[1]); ctx.lineTo(q4[0], q4[1]); ctx.lineTo(q5[0], q5[1]);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function vesselArt(ctx, v, culture, cx, foot, h, glazed) {
    if (v.handles) {
      ctx.strokeStyle = culture.body;
      ctx.lineWidth = h * 0.035;
      ctx.lineCap = 'round';
      [-1, 1].forEach(function (side) {
        var y0 = v.handles - 0.06;
        var y1 = Math.min(0.95, v.handles + 0.12);
        var r0 = museum.radiusAt(v, y0);
        var r1 = museum.radiusAt(v, y1);
        ctx.beginPath();
        ctx.moveTo(cx + side * r0 * h * 0.92, foot - y0 * h);
        ctx.bezierCurveTo(cx + side * (r0 + 0.12) * h, foot - y0 * h, cx + side * (r1 + 0.12) * h, foot - y1 * h,
          cx + side * r1 * h * 0.9, foot - y1 * h);
        ctx.stroke();
      });
      ctx.lineCap = 'butt';
    }
    silhouettePath(ctx, v, cx, foot, h);
    var R = museum.maxRadius(v) * h;
    var g = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    g.addColorStop(0, 'rgba(60,52,44,0.55)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.12)');
    g.addColorStop(0.62, 'rgba(60,52,44,0.1)');
    g.addColorStop(1, 'rgba(40,34,30,0.6)');
    ctx.fillStyle = culture.body;
    ctx.fill();
    ctx.save();
    ctx.clip();
    v.bands.forEach(function (b) { band(ctx, v, culture, b, cx, foot, h); });
    if (glazed) {
      // dipped in cobalt glaze from the rim down, with a few runs at the edge
      var line = foot - h * (0.5 + 0.04 * Math.sin(v.index * 1.7));
      ctx.beginPath();
      ctx.moveTo(cx - R - 2, foot - h - 2);
      ctx.lineTo(cx + R + 2, foot - h - 2);
      for (var gx = 1; gx >= -1.0001; gx -= 0.05) {
        var run = Math.max(0, Math.sin(gx * 9 + v.index * 2.3)) * Math.max(0, Math.sin(gx * 23 + v.index));
        ctx.lineTo(cx + gx * (R + 2), line + h * (0.015 * Math.sin(gx * 7 + v.index) + 0.07 * run * run));
      }
      ctx.closePath();
      var gl = ctx.createLinearGradient(0, foot - h, 0, line + h * 0.08);
      gl.addColorStop(0, 'rgba(26,48,97,0.86)');
      gl.addColorStop(1, 'rgba(43,76,140,0.7)');
      ctx.fillStyle = gl;
      ctx.fill();
    }
    ctx.fillStyle = g;
    ctx.fillRect(cx - R - 2, foot - h - 2, R * 2 + 4, h + 4);
    if (glazed) {
      var s = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
      s.addColorStop(0.18, 'rgba(255,255,255,0)');
      s.addColorStop(0.26, 'rgba(255,255,255,0.42)');
      s.addColorStop(0.34, 'rgba(255,255,255,0)');
      ctx.fillStyle = s;
      ctx.fillRect(cx - R - 2, foot - h - 2, R * 2 + 4, h + 4);
    }
    ctx.restore();
  }

  var vesselCache = {};

  /**
   * One vessel, drawn into a cached canvas: shown pieces in full colour, the rest as a pencil outline.
   * opts: { pieces, glazed, w, h (CSS px), dpr }
   */
  function vesselCanvas(index, opts) {
    var key = [index, opts.pieces, opts.glazed ? 1 : 0, Math.round(opts.w), Math.round(opts.h), opts.dpr].join(':');
    if (vesselCache[key]) return vesselCache[key];
    var keys = Object.keys(vesselCache);
    if (keys.length > 60) keys.slice(0, 20).forEach(function (k) { delete vesselCache[k]; });
    var v = museum.VESSELS[index];
    var culture = museum.CULTURES[v.culture];
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(opts.w * opts.dpr));
    c.height = Math.max(1, Math.round(opts.h * opts.dpr));
    var ctx = c.getContext('2d');
    ctx.setTransform(opts.dpr, 0, 0, opts.dpr, 0, 0);
    var R = museum.maxRadius(v) + (v.handles ? 0.14 : 0);
    var h = Math.min(opts.h * 0.86, opts.w / (2 * R + 0.06));
    var cx = opts.w / 2;
    var foot = opts.h - (opts.h - h) * 0.45;
    // shadow
    ctx.fillStyle = 'rgba(31,42,49,0.12)';
    ctx.beginPath();
    ctx.ellipse(cx, foot + 2, museum.radiusAt(v, 0) * h * 1.6, Math.max(2, h * 0.025), 0, 0, Math.PI * 2);
    ctx.fill();
    var frags = museum.fragments(v);
    var shown = Math.max(0, Math.min(v.need, opts.pieces | 0));
    // the missing part: a pencil outline
    if (shown < v.need) {
      silhouettePath(ctx, v, cx, foot, h);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = PAL.pencil;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (shown > 0) {
      ctx.save();
      ctx.beginPath();
      for (var i = 0; i < shown; i++) fragmentPath(ctx, frags[i].poly, cx, foot, h);
      ctx.clip();
      vesselArt(ctx, v, culture, cx, foot, h, opts.glazed);
      // the joins
      silhouettePath(ctx, v, cx, foot, h);
      ctx.clip();
      ctx.strokeStyle = shown === v.need ? 'rgba(40,34,30,0.32)' : 'rgba(40,34,30,0.5)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (var k = 0; k < shown; k++) fragmentPath(ctx, frags[k].poly, cx, foot, h);
      ctx.stroke();
      ctx.restore();
      // the restored edge in ink
      ctx.save();
      ctx.beginPath();
      for (var j = 0; j < shown; j++) fragmentPath(ctx, frags[j].poly, cx, foot, h);
      ctx.clip();
      silhouettePath(ctx, v, cx, foot, h);
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }
    vesselCache[key] = c;
    return c;
  }

  /** Where fragment k of a vessel sits inside a vesselCanvas of size w by h, in CSS px. */
  function fragmentCentre(index, k, w, hgt) {
    var v = museum.VESSELS[index];
    var R = museum.maxRadius(v) + (v.handles ? 0.14 : 0);
    var h = Math.min(hgt * 0.86, w / (2 * R + 0.06));
    var foot = hgt - (hgt - h) * 0.45;
    var f = museum.fragments(v)[Math.max(0, Math.min(v.need - 1, k))];
    var x = Math.max(-museum.radiusAt(v, f.cy) * 0.7, Math.min(museum.radiusAt(v, f.cy) * 0.7, f.cx));
    return [w / 2 + x * h, foot - f.cy * h];
  }

  /** The hand-inked line drawing of a vessel outline, partly drawn (0 to 1), for the opening. */
  function inkOutline(ctx, index, cx, foot, h, amount) {
    var v = museum.VESSELS[index];
    var prof = museum.profile(v, 60);
    var n = Math.max(2, Math.floor(prof.length * Math.min(1, amount)));
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    [-1, 1].forEach(function (side) {
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var px = cx + side * prof[i][1] * h;
        var py = foot - prof[i][0] * h;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    });
    if (amount > 0.98) {
      var top = prof[prof.length - 1];
      ctx.beginPath();
      ctx.ellipse(cx, foot - h, top[1] * h, top[1] * h * 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  root.Sherd.art = {
    PAL: PAL, rr: rr, ease: ease, easeBack: easeBack, paintFilm: paintFilm, cellTexture: cellTexture,
    drawEmpty: drawEmpty, drawCleared: drawCleared, drawMiss: drawMiss, drawNear: drawNear, drawHit: drawHit,
    drawBedrock: drawBedrock, loops: loops, shapePath: shapePath, drawProbe: drawProbe, drawShard: drawShard,
    drawMissedShard: drawMissedShard, vesselCanvas: vesselCanvas, fragmentCentre: fragmentCentre, inkOutline: inkOutline
  };
})(this);
