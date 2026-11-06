/*
 * Lampcourt's drawing, all vector, cached to offscreen canvases so a frame is a few drawImage calls:
 *   the plan        an architect's night plan: hatched walls, round columns, brass lattice screens,
 *                   arches as dashed openings, a faint zellige star on every floor cell
 *   the light       every counted cell drawn crisp in lamplight with its zellige star; the soft glow is
 *                   clipped to the lit cells, so nothing looks lit that is not counted
 *   the lanterns    a top-down brass token for the plan, and the elevation (brass, coloured glass,
 *                   filigree, cap, finial) for the sky string, the daily header and the share card
 */
(function (root) {
  'use strict';
  var LC = root.LC || (root.LC = {});

  var C = {
    ink: '#0E1B24', ink2: '#0A151C', line: '#2C4553', plaster: '#1F3039', hatch: '#2E4553', edge: '#3D5868',
    unlit: '#12212A', unlitLine: '#1A2D38', star: '#182A35',
    lit: ['#FFE3A3', '#F6CB78', '#ECB45E'], litLine: ['#E0B465', '#D6A350', '#C98F3E'],
    brass: '#C99A48', brassDark: '#7E5A22', brassLight: '#EBC67A', moon: '#E9E2D0', muted: '#8FA4AF'
  };

  function layer(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // ---- floor cells ----

  /** The zellige motif for one cell: an eight point star and quarter diamonds at the corners. */
  function zellige(g, x, y, s, stroke, width) {
    var cx = x + s / 2, cy = y + s / 2, r = s * 0.31, q = s * 0.19;
    g.strokeStyle = stroke;
    g.lineWidth = width;
    g.beginPath();
    g.rect(cx - r * 0.82, cy - r * 0.82, r * 1.64, r * 1.64);
    g.moveTo(cx, cy - r * 1.16); g.lineTo(cx + r * 1.16, cy); g.lineTo(cx, cy + r * 1.16); g.lineTo(cx - r * 1.16, cy); g.closePath();
    g.moveTo(x, y + q); g.lineTo(x + q, y);
    g.moveTo(x + s - q, y); g.lineTo(x + s, y + q);
    g.moveTo(x + s, y + s - q); g.lineTo(x + s - q, y + s);
    g.moveTo(x + q, y + s); g.lineTo(x, y + s - q);
    g.stroke();
  }

  /** Three lit cell sprites (near, middle, far) and the unlit one, at a device pixel size. */
  function cellSprites(size) {
    var s = Math.max(4, Math.round(size));
    var out = { size: s, lit: [], unlit: null };
    for (var i = 0; i < 3; i++) {
      var c = layer(s, s), g = c.getContext('2d');
      g.fillStyle = C.lit[i];
      g.fillRect(0, 0, s, s);
      zellige(g, 0, 0, s, C.litLine[i], Math.max(1, s / 30));
      g.strokeStyle = 'rgba(120, 78, 24, 0.28)';
      g.lineWidth = Math.max(1, s / 40);
      g.strokeRect(0.5, 0.5, s - 1, s - 1);
      out.lit.push(c);
    }
    var u = layer(s, s), ug = u.getContext('2d');
    ug.fillStyle = C.unlit;
    ug.fillRect(0, 0, s, s);
    zellige(ug, 0, 0, s, C.star, Math.max(1, s / 36));
    ug.strokeStyle = C.unlitLine;
    ug.lineWidth = Math.max(1, s / 36);
    ug.strokeRect(0.5, 0.5, s - 1, s - 1);
    out.unlit = u;
    return out;
  }

  // ---- the plan ----

  function cellAt(plan, x, y) {
    if (x < 0 || y < 0 || x >= plan.w || y >= plan.h) return 3;
    return plan.cells[y * plan.w + x];
  }

  /**
   * Draws a plan with its top left cell corner at (ox, oy) and cells of size cs, in device pixels.
   * opts.sprites (from cellSprites) draws the floor; opts.thumb draws a light line-only version.
   */
  function drawPlan(g, plan, ox, oy, cs, opts) {
    opts = opts || {};
    var w = plan.w, h = plan.h, x, y, i;
    var frame = Math.max(3, Math.round(cs * 0.24));
    // The outer wall frame.
    g.save();
    g.fillStyle = C.plaster;
    g.fillRect(ox - frame, oy - frame, w * cs + 2 * frame, h * cs + 2 * frame);
    g.restore();
    // Floor.
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var c = plan.cells[y * w + x];
        var px = ox + x * cs, py = oy + y * cs;
        if (c === 0 || c === 1 || c === 2) {
          if (opts.sprites) g.drawImage(opts.sprites.unlit, px, py, cs, cs);
          else { g.fillStyle = C.unlit; g.fillRect(px, py, cs, cs); }
        } else if (c === 4) {
          g.fillStyle = '#132530';
          g.fillRect(px, py, cs, cs);
        }
      }
    }
    // Walls: one clipped hatch over every wall cell and the frame.
    g.save();
    g.beginPath();
    g.rect(ox - frame, oy - frame, w * cs + 2 * frame, frame);
    g.rect(ox - frame, oy + h * cs, w * cs + 2 * frame, frame);
    g.rect(ox - frame, oy, frame, h * cs);
    g.rect(ox + w * cs, oy, frame, h * cs);
    for (i = 0; i < w * h; i++) if (plan.cells[i] === 3) g.rect(ox + (i % w) * cs, oy + ((i / w) | 0) * cs, cs, cs);
    g.fillStyle = C.plaster;
    g.fill();
    g.clip();
    g.strokeStyle = C.hatch;
    g.lineWidth = Math.max(1, cs / 22);
    var step = Math.max(4, cs / 4.2);
    var span = (w + h) * cs + 4 * frame;
    g.beginPath();
    for (var d = -span; d < span; d += step) {
      g.moveTo(ox - frame + d, oy - frame);
      g.lineTo(ox - frame + d + span, oy - frame + span);
    }
    g.stroke();
    g.restore();
    // Wall outlines: draw each wall cell edge that faces a non wall.
    g.save();
    g.strokeStyle = C.edge;
    g.lineWidth = Math.max(1, cs / 18);
    g.beginPath();
    for (y = -1; y <= h; y++) {
      for (x = -1; x <= w; x++) {
        var isWall = cellAt(plan, x, y) === 3;
        if (!isWall) continue;
        var px2 = ox + x * cs, py2 = oy + y * cs;
        if (x >= 0 && x < w && y >= 0 && y < h) {
          if (cellAt(plan, x, y - 1) !== 3) { g.moveTo(px2, py2); g.lineTo(px2 + cs, py2); }
          if (cellAt(plan, x, y + 1) !== 3) { g.moveTo(px2, py2 + cs); g.lineTo(px2 + cs, py2 + cs); }
          if (cellAt(plan, x - 1, y) !== 3) { g.moveTo(px2, py2); g.lineTo(px2, py2 + cs); }
          if (cellAt(plan, x + 1, y) !== 3) { g.moveTo(px2 + cs, py2); g.lineTo(px2 + cs, py2 + cs); }
        }
      }
    }
    g.rect(ox - frame, oy - frame, w * cs + 2 * frame, h * cs + 2 * frame);
    g.stroke();
    g.restore();
    // Lattice screens, arches and columns.
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var k = plan.cells[y * w + x];
        var qx = ox + x * cs, qy = oy + y * cs;
        if (k === 4) drawLattice(g, qx, qy, cs);
        else if (k === 1) drawArch(g, plan, x, y, qx, qy, cs);
        else if (k === 2) drawColumn(g, qx + cs / 2, qy + cs / 2, cs);
      }
    }
  }

  function drawLattice(g, x, y, cs) {
    g.save();
    g.beginPath();
    g.rect(x, y, cs, cs);
    g.clip();
    g.strokeStyle = 'rgba(201, 154, 72, 0.75)';
    g.lineWidth = Math.max(1, cs / 20);
    var step = cs / 4;
    g.beginPath();
    for (var d = -cs; d <= cs * 2; d += step) {
      g.moveTo(x + d, y); g.lineTo(x + d + cs, y + cs);
      g.moveTo(x + d + cs, y); g.lineTo(x + d, y + cs);
    }
    g.stroke();
    g.restore();
    g.strokeStyle = C.brassDark;
    g.lineWidth = Math.max(1, cs / 16);
    g.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
  }

  function drawArch(g, plan, gx, gy, x, y, cs) {
    // The wall runs the way the solid neighbours run; the plan's edge counts half.
    function solid(x, y) {
      if (x < 0 || y < 0 || x >= plan.w || y >= plan.h) return 0.5;
      var c = plan.cells[y * plan.w + x];
      return c === 3 || c === 4 || c === 1 ? 1 : 0;
    }
    var horiz = solid(gx - 1, gy) + solid(gx + 1, gy) >= solid(gx, gy - 1) + solid(gx, gy + 1);
    g.save();
    g.strokeStyle = '#5B7A8A';
    g.lineWidth = Math.max(1, cs / 22);
    g.setLineDash([Math.max(2, cs / 9), Math.max(2, cs / 11)]);
    g.beginPath();
    if (horiz) {
      g.moveTo(x, y + cs * 0.12); g.lineTo(x + cs, y + cs * 0.12);
      g.moveTo(x, y + cs * 0.88); g.lineTo(x + cs, y + cs * 0.88);
    } else {
      g.moveTo(x + cs * 0.12, y); g.lineTo(x + cs * 0.12, y + cs);
      g.moveTo(x + cs * 0.88, y); g.lineTo(x + cs * 0.88, y + cs);
    }
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    if (horiz) g.arc(x + cs / 2, y + cs * 0.88, cs * 0.38, Math.PI, 0);
    else g.arc(x + cs * 0.12, y + cs / 2, cs * 0.38, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.restore();
  }

  function drawColumn(g, cx, cy, cs) {
    var r = cs * 0.4;
    g.save();
    g.strokeStyle = '#23394A';
    g.lineWidth = Math.max(1, cs / 30);
    g.strokeRect(cx - cs * 0.44, cy - cs * 0.44, cs * 0.88, cs * 0.88);
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = '#2B404D';
    g.fill();
    g.lineWidth = Math.max(1, cs / 20);
    g.strokeStyle = '#557384';
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    g.strokeStyle = '#3B5566';
    g.lineWidth = Math.max(1, cs / 30);
    g.stroke();
    g.restore();
  }

  /** A line-only plan for thumbnails and the share card: walls filled, columns as rings. */
  function drawPlanOutline(g, plan, ox, oy, cs, color, alpha) {
    var w = plan.w, h = plan.h;
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = Math.max(1, cs / 10);
    g.strokeRect(ox, oy, w * cs, h * cs);
    for (var i = 0; i < w * h; i++) {
      var c = plan.cells[i], x = ox + (i % w) * cs, y = oy + ((i / w) | 0) * cs;
      if (c === 3) g.fillRect(x, y, cs + 0.5, cs + 0.5);
      else if (c === 2) { g.beginPath(); g.arc(x + cs / 2, y + cs / 2, cs * 0.34, 0, Math.PI * 2); g.fill(); }
      else if (c === 4) { g.save(); g.globalAlpha *= 0.45; g.fillRect(x, y, cs + 0.5, cs + 0.5); g.restore(); }
    }
    g.restore();
  }

  // ---- lanterns: the top-down token ----

  var tokenCache = {};
  /** A brass octagon with coloured glass, seen from above, as a sprite of diameter d device px. */
  function tokenSprite(glass, d, state) {
    var key = glass + '|' + Math.round(d) + '|' + (state || '');
    if (tokenCache[key]) return tokenCache[key];
    var pad = Math.ceil(d * 0.35);
    var s = Math.ceil(d) + pad * 2;
    var c = layer(s, s), g = c.getContext('2d');
    var cx = s / 2, cy = s / 2, r = d / 2;
    if (state === 'lifted') {
      g.beginPath();
      g.ellipse(cx + r * 0.18, cy + r * 0.32, r * 1.02, r * 0.9, 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(0, 0, 0, 0.35)';
      g.fill();
    }
    octagon(g, cx, cy, r);
    var mg = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    mg.addColorStop(0, C.brassLight); mg.addColorStop(0.55, C.brass); mg.addColorStop(1, C.brassDark);
    g.fillStyle = mg;
    g.fill();
    octagon(g, cx, cy, r * 0.74);
    var gg = g.createRadialGradient(cx, cy, 0, cx, cy, r * 0.74);
    gg.addColorStop(0, '#FFF4D6'); gg.addColorStop(0.35, lighten(glass, 0.45)); gg.addColorStop(1, glass);
    g.fillStyle = gg;
    g.fill();
    // A small eight point star of brass over the glass.
    g.strokeStyle = 'rgba(126, 90, 34, 0.9)';
    g.lineWidth = Math.max(1, d / 26);
    var sr = r * 0.42;
    g.beginPath();
    g.rect(cx - sr * 0.7, cy - sr * 0.7, sr * 1.4, sr * 1.4);
    g.moveTo(cx, cy - sr); g.lineTo(cx + sr, cy); g.lineTo(cx, cy + sr); g.lineTo(cx - sr, cy); g.closePath();
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
    g.fillStyle = '#FFF8E6';
    g.fill();
    if (state === 'ghost') {
      var gc = layer(s, s), g2 = gc.getContext('2d');
      g2.globalAlpha = 0.5;
      g2.drawImage(c, 0, 0);
      c = gc;
    }
    tokenCache[key] = { canvas: c, half: s / 2 };
    return tokenCache[key];
  }

  function octagon(g, cx, cy, r) {
    g.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = Math.PI / 8 + (i * Math.PI) / 4;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lighten(hex, t) {
    var c = hexToRgb(hex);
    return 'rgb(' + c.map(function (v) { return Math.round(v + (255 - v) * t); }).join(',') + ')';
  }
  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  /** A warm radial glow sprite (cached by size), drawn with 'lighter' over lit cells only. */
  var glowCache = {};
  function glowSprite(radius, strength) {
    var key = Math.round(radius) + '|' + strength;
    if (glowCache[key]) return glowCache[key];
    var s = Math.ceil(radius * 2), c = layer(s, s), g = c.getContext('2d');
    var gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, radius);
    gr.addColorStop(0, 'rgba(255, 236, 190, ' + strength + ')');
    gr.addColorStop(0.4, 'rgba(255, 200, 120, ' + strength * 0.45 + ')');
    gr.addColorStop(1, 'rgba(255, 180, 90, 0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    glowCache[key] = c;
    return c;
  }

  // ---- lanterns: the elevation ----

  var sideCache = {};
  /** The elevation of a design, height h device px, lit or dark, as a cached sprite. */
  function lanternSprite(design, h, lit) {
    var key = JSON.stringify(design) + '|' + Math.round(h) + '|' + (lit ? 1 : 0);
    if (sideCache[key]) return sideCache[key];
    var bodyW = h * 0.62 / (design.ratio / 10) * 1.05;
    var w = Math.ceil(Math.max(bodyW * 1.9, h * 0.6));
    var c = layer(w, Math.ceil(h * 1.08)), g = c.getContext('2d');
    drawLanternSide(g, design, w / 2, h * 0.02, h, lit);
    sideCache[key] = { canvas: c, w: w, h: Math.ceil(h * 1.08) };
    return sideCache[key];
  }

  function brassGrad(g, x0, x1) {
    var mg = g.createLinearGradient(x0, 0, x1, 0);
    mg.addColorStop(0, C.brassDark); mg.addColorStop(0.3, C.brassLight); mg.addColorStop(0.6, C.brass); mg.addColorStop(1, C.brassDark);
    return mg;
  }

  /** Draws a lantern whose hook top is at (cx, top) and whose total height is h. */
  function drawLanternSide(g, d, cx, top, h, lit) {
    var hookH = h * 0.07, finH = h * 0.08, capH = h * 0.2, bodyH = h * 0.47, baseH = h * 0.12;
    var bw = h * 0.62 / (d.ratio / 10);
    if (d.body === 'tall') { bw *= 0.78; }
    if (d.body === 'bulb') { bw *= 1.08; }
    var y = top;
    g.save();
    g.lineJoin = 'round';
    // hook ring
    g.strokeStyle = C.brass;
    g.lineWidth = Math.max(1, h * 0.012);
    g.beginPath();
    g.arc(cx, y + hookH * 0.45, hookH * 0.4, 0, Math.PI * 2);
    g.stroke();
    y += hookH;
    // finial
    g.fillStyle = brassGrad(g, cx - h * 0.05, cx + h * 0.05);
    if (d.finial === 'crescent') {
      var fr = finH * 0.42;
      g.beginPath();
      g.arc(cx, y + finH * 0.45, fr, 0, Math.PI * 2);
      g.arc(cx + fr * 0.45, y + finH * 0.38, fr * 0.82, 0, Math.PI * 2, true);
      g.fill('evenodd');
    } else if (d.finial === 'ball') {
      g.beginPath();
      g.arc(cx, y + finH * 0.5, finH * 0.32, 0, Math.PI * 2);
      g.fill();
    } else {
      g.beginPath();
      g.arc(cx, y + finH * 0.5, finH * 0.3, 0, Math.PI * 2);
      g.lineWidth = Math.max(1, h * 0.014);
      g.strokeStyle = C.brass;
      g.stroke();
    }
    g.fillRect(cx - h * 0.008, y + finH * 0.75, h * 0.016, finH * 0.3);
    y += finH;
    // cap
    var capW = bw * 1.08;
    g.fillStyle = brassGrad(g, cx - capW / 2, cx + capW / 2);
    g.beginPath();
    if (d.cap === 'onion') {
      g.moveTo(cx, y);
      g.bezierCurveTo(cx + capW * 0.08, y + capH * 0.35, cx + capW * 0.62, y + capH * 0.45, cx + capW / 2, y + capH);
      g.lineTo(cx - capW / 2, y + capH);
      g.bezierCurveTo(cx - capW * 0.62, y + capH * 0.45, cx - capW * 0.08, y + capH * 0.35, cx, y);
    } else if (d.cap === 'spire') {
      g.moveTo(cx, y);
      g.lineTo(cx + capW / 2, y + capH);
      g.lineTo(cx - capW / 2, y + capH);
    } else if (d.cap === 'tiered') {
      g.moveTo(cx - capW * 0.18, y);
      g.lineTo(cx + capW * 0.18, y);
      g.lineTo(cx + capW * 0.3, y + capH * 0.45);
      g.lineTo(cx + capW * 0.36, y + capH * 0.45);
      g.lineTo(cx + capW / 2, y + capH);
      g.lineTo(cx - capW / 2, y + capH);
      g.lineTo(cx - capW * 0.36, y + capH * 0.45);
      g.lineTo(cx - capW * 0.3, y + capH * 0.45);
    } else {
      g.moveTo(cx - capW / 2, y + capH);
      g.bezierCurveTo(cx - capW / 2, y + capH * 0.1, cx + capW / 2, y + capH * 0.1, cx + capW / 2, y + capH);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = C.brassDark;
    g.lineWidth = Math.max(1, h * 0.008);
    g.stroke();
    y += capH;
    // body
    var bodyTop = y, bodyBot = y + bodyH;
    var path = bodyPath(d, cx, bodyTop, bodyBot, bw);
    // glass panes
    var panes = paneEdges(d, bw);
    g.save();
    g.clip(path);
    for (var i = 0; i < panes.length - 1; i++) {
      var x0 = cx + panes[i], x1 = cx + panes[i + 1];
      var col = d.two && i % 2 === 1 ? d.glass[1] : d.glass[0];
      var gr = g.createLinearGradient(0, bodyTop, 0, bodyBot);
      if (lit) {
        gr.addColorStop(0, lighten(col, 0.25));
        gr.addColorStop(0.5, lighten(col, 0.62));
        gr.addColorStop(1, col);
      } else {
        gr.addColorStop(0, rgba(col, 0.55));
        gr.addColorStop(1, rgba(col, 0.35));
      }
      g.fillStyle = gr;
      g.fillRect(x0, bodyTop, x1 - x0 + 0.5, bodyH);
    }
    if (lit) {
      var core = g.createRadialGradient(cx, (bodyTop + bodyBot) / 2, 0, cx, (bodyTop + bodyBot) / 2, bodyH * 0.55);
      core.addColorStop(0, 'rgba(255, 246, 220, 0.85)');
      core.addColorStop(1, 'rgba(255, 220, 150, 0)');
      g.fillStyle = core;
      g.fillRect(cx - bw, bodyTop, bw * 2, bodyH);
    }
    // filigree over each pane
    g.strokeStyle = C.brass;
    g.fillStyle = C.brass;
    g.lineWidth = Math.max(1, h * 0.009);
    for (var p = 0; p < panes.length - 1; p++) filigree(g, d.filigree, cx + panes[p], cx + panes[p + 1], bodyTop, bodyBot);
    g.restore();
    // pane frames and outline
    g.strokeStyle = C.brass;
    g.lineWidth = Math.max(1, h * 0.012);
    g.beginPath();
    for (var q = 1; q < panes.length - 1; q++) { g.moveTo(cx + panes[q], bodyTop); g.lineTo(cx + panes[q], bodyBot); }
    g.stroke();
    g.lineWidth = Math.max(1, h * 0.016);
    g.stroke(path);
    // bands
    g.fillStyle = brassGrad(g, cx - bw / 2, cx + bw / 2);
    var bandH = Math.max(1.5, h * 0.022);
    var bandYs = [bodyTop, bodyBot - bandH];
    if (d.bands >= 2) bandYs.push(bodyTop + bodyH * 0.5 - bandH / 2);
    if (d.bands >= 3) { bandYs.push(bodyTop + bodyH * 0.25 - bandH / 2); }
    for (var b = 0; b < bandYs.length; b++) {
      var bwAt = bodyWidthAt(d, bw, (bandYs[b] - bodyTop) / bodyH);
      g.fillRect(cx - bwAt / 2 - h * 0.006, bandYs[b], bwAt + h * 0.012, bandH);
    }
    y = bodyBot;
    // base
    g.fillStyle = brassGrad(g, cx - bw / 2, cx + bw / 2);
    var baseW = bodyWidthAt(d, bw, 1);
    g.beginPath();
    g.moveTo(cx - baseW / 2, y);
    g.lineTo(cx + baseW / 2, y);
    g.lineTo(cx + baseW * 0.22, y + baseH * 0.7);
    g.lineTo(cx - baseW * 0.22, y + baseH * 0.7);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(cx, y + baseH * 0.82, baseH * 0.18, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function bodyWidthAt(d, bw, t) {
    if (d.body === 'bulb') return bw * (0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, Math.max(0, t))));
    if (d.body === 'drum') return bw * 0.96;
    return bw;
  }

  function bodyPath(d, cx, top, bot, bw) {
    var p = new Path2D();
    var hh = bot - top;
    if (d.body === 'bulb') {
      p.moveTo(cx - bw * 0.31, top);
      p.bezierCurveTo(cx - bw * 0.62, top + hh * 0.2, cx - bw * 0.62, bot - hh * 0.2, cx - bw * 0.31, bot);
      p.lineTo(cx + bw * 0.31, bot);
      p.bezierCurveTo(cx + bw * 0.62, bot - hh * 0.2, cx + bw * 0.62, top + hh * 0.2, cx + bw * 0.31, top);
      p.closePath();
    } else if (d.body === 'drum') {
      var r = bw * 0.48;
      p.moveTo(cx - r, top + hh * 0.06);
      p.quadraticCurveTo(cx, top - hh * 0.06, cx + r, top + hh * 0.06);
      p.lineTo(cx + r, bot - hh * 0.06);
      p.quadraticCurveTo(cx, bot + hh * 0.06, cx - r, bot - hh * 0.06);
      p.closePath();
    } else {
      p.rect(cx - bw / 2, top, bw, hh);
    }
    return p;
  }

  /** Pane edges as x offsets from the centre: foreshortened faces of a prism. */
  function paneEdges(d, bw) {
    var f = d.body === 'oct' ? [0, 0.14, 0.5, 0.86, 1] : d.body === 'drum' ? [0, 0.2, 0.5, 0.8, 1] : d.body === 'bulb' ? [0, 0.25, 0.75, 1] : [0, 0.22, 0.78, 1];
    return f.map(function (v) { return (v - 0.5) * bw; });
  }

  function filigree(g, kind, x0, x1, top, bot) {
    var w = x1 - x0, cx = (x0 + x1) / 2, h = bot - top;
    if (w < 3) return;
    var i, y;
    g.beginPath();
    if (kind === 'arches') {
      var aw = w * 0.56, ab = bot - h * 0.12, at = top + h * 0.2;
      g.moveTo(cx - aw / 2, ab);
      g.lineTo(cx - aw / 2, at + aw / 2);
      g.arc(cx, at + aw / 2, aw / 2, Math.PI, 0);
      g.lineTo(cx + aw / 2, ab);
      g.stroke();
    } else if (kind === 'lattice') {
      var st = Math.max(3, w / 3);
      for (var dd = -h; dd < w + h; dd += st) {
        g.moveTo(x0 + dd, top); g.lineTo(x0 + dd + h, bot);
        g.moveTo(x0 + dd + h, top); g.lineTo(x0 + dd, bot);
      }
      g.stroke();
    } else if (kind === 'drops') {
      for (i = 0; i < 3; i++) {
        y = top + h * (0.2 + i * 0.3);
        var r = Math.min(w, h) * 0.1;
        g.moveTo(cx, y - r * 1.8);
        g.quadraticCurveTo(cx + r * 1.2, y, cx, y + r);
        g.quadraticCurveTo(cx - r * 1.2, y, cx, y - r * 1.8);
      }
      g.stroke();
    } else if (kind === 'rings') {
      for (i = 0; i < 3; i++) {
        y = top + h * (0.22 + i * 0.28);
        var rr = Math.min(w * 0.26, h * 0.1);
        g.moveTo(cx + rr, y);
        g.arc(cx, y, rr, 0, Math.PI * 2);
        g.moveTo(cx + rr * 0.45, y);
        g.arc(cx, y, rr * 0.45, 0, Math.PI * 2);
      }
      g.stroke();
    } else {
      for (i = 0; i < 2; i++) {
        y = top + h * (0.3 + i * 0.4);
        star(g, cx, y, Math.min(w * 0.36, h * 0.16), 8);
      }
      g.stroke();
    }
  }

  function star(g, cx, cy, r, n) {
    for (var i = 0; i <= n * 2; i++) {
      var a = -Math.PI / 2 + (i * Math.PI) / n;
      var rr = i % 2 === 0 ? r : r * 0.5;
      var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
  }

  // ---- the sky ----

  /** The night (or Eid daylight) background with a crescent and fixed stars, for a w by h layer. */
  function drawSky(g, w, h, daylight, seedStars) {
    var gr = g.createLinearGradient(0, 0, 0, h);
    if (daylight) {
      gr.addColorStop(0, '#9FC4D3'); gr.addColorStop(0.55, '#E9D3A6'); gr.addColorStop(1, '#F2E3C4');
    } else {
      gr.addColorStop(0, '#081219'); gr.addColorStop(0.6, '#0E1B24'); gr.addColorStop(1, '#0E1B24');
    }
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    if (daylight) return;
    var r = LC.rng.make(seedStars || 1448);
    g.fillStyle = 'rgba(233, 226, 208, 0.7)';
    var n = Math.round((w * h) / 9000);
    for (var i = 0; i < n; i++) {
      var x = r.int(1000) / 1000 * w, y = (r.int(1000) / 1000) * h * 0.55;
      var s = r.chance(1, 6) ? 1.6 : 0.9;
      g.globalAlpha = 0.25 + r.int(60) / 100;
      g.fillRect(x, y, s, s);
    }
    g.globalAlpha = 1;
  }

  function drawCrescent(g, cx, cy, r, color) {
    g.save();
    g.fillStyle = color || C.moon;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.arc(cx + r * 0.42, cy - r * 0.18, r * 0.86, 0, Math.PI * 2, true);
    g.fill('evenodd');
    g.restore();
  }

  LC.art = {
    C: C, layer: layer, cellSprites: cellSprites, drawPlan: drawPlan, drawPlanOutline: drawPlanOutline,
    tokenSprite: tokenSprite, glowSprite: glowSprite, lanternSprite: lanternSprite, drawLanternSide: drawLanternSide,
    drawSky: drawSky, drawCrescent: drawCrescent, zellige: zellige, lighten: lighten, rgba: rgba, octagon: octagon
  };
})(typeof window !== 'undefined' ? window : globalThis);
