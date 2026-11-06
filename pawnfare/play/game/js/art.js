/*
 * The look of Pawnfare, all drawn in code. The memorable element is the disc: every piece is a turned disc
 * of ivory (the player) or carnelian (the rival) whose face is its move diagram cut in like an intaglio
 * seal. Leap targets are drilled dots, rides are grooves running to the rim, the cannon's hop is a groove
 * with a bridge, capture-only moves are small crosses and move-only moves hollow rings. The rival king is
 * the only disc with a gilt rim; a fused piece carries a thin gilt seam. Discs are rendered once per size
 * into an offscreen cache.
 */
(function (root) {
  'use strict';
  var P = root.Pawnfare;
  var pieces = P.pieces;

  var PAL = {
    night: '#0E1530',
    lapisA: '#1B2A4E',
    lapisB: '#22345F',
    ivory: '#EDE4CF',
    carnelian: '#B5432F',
    turquoise: '#4FB7A8',
    gilt: '#D6B160'
  };

  var FACE = {
    1: { hi: '#F7F0DF', mid: '#E6DAC0', lo: '#C7B692', rim: 'rgba(110,88,55,0.55)', cut: 'rgba(78,58,34,0.92)', lip: 'rgba(255,252,240,0.85)' },
    2: { hi: '#D4624A', mid: '#AB3D2A', lo: '#7A2417', rim: 'rgba(55,10,4,0.55)', cut: 'rgba(52,10,4,0.9)', lip: 'rgba(255,190,170,0.42)' }
  };

  var cache = {};

  /** A cached canvas holding one disc: about (r * 2.5) CSS px square, drawn at the device pixel ratio. */
  function disc(type, side, r, dpr) {
    var key = type + '|' + side + '|' + r + '|' + dpr;
    if (cache[key]) return cache[key];
    var pad = Math.ceil(r * 0.28) + 2;
    var size = Math.ceil((r + pad) * 2);
    var c = document.createElement('canvas');
    c.width = Math.ceil(size * dpr);
    c.height = Math.ceil(size * dpr);
    var g = c.getContext('2d');
    g.scale(dpr, dpr);
    drawDisc(g, type, side, size / 2, size / 2, r);
    c.cssSize = size;
    cache[key] = c;
    return c;
  }

  function drawDisc(g, type, side, cx, cy, r) {
    var f = FACE[side];
    var royal = pieces.isRoyal(type);
    var compound = pieces.parts(type).length > 1;
    // Cast shadow, offset down.
    g.save();
    g.fillStyle = 'rgba(4,7,18,0.55)';
    g.beginPath();
    g.ellipse(cx, cy + r * 0.12, r * 1.0, r * 0.98, 0, 0, Math.PI * 2);
    g.filter = 'blur(' + Math.max(1, r * 0.08) + 'px)';
    g.fill();
    g.filter = 'none';
    g.restore();
    // Body, lit from the top left.
    var grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05);
    grad.addColorStop(0, f.hi);
    grad.addColorStop(0.55, f.mid);
    grad.addColorStop(1, f.lo);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    // The turned rim: a darker band and a lit arc.
    g.lineWidth = Math.max(1, r * 0.07);
    g.strokeStyle = f.rim;
    g.beginPath();
    g.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = Math.max(0.8, r * 0.04);
    g.strokeStyle = side === 1 ? 'rgba(255,255,250,0.7)' : 'rgba(255,200,180,0.45)';
    g.beginPath();
    g.arc(cx, cy, r * 0.965, Math.PI * 1.05, Math.PI * 1.65);
    g.stroke();
    if (royal) {
      var gg = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      gg.addColorStop(0, '#F0D48E');
      gg.addColorStop(0.5, PAL.gilt);
      gg.addColorStop(1, '#8F6F2C');
      g.lineWidth = Math.max(1.5, r * 0.13);
      g.strokeStyle = gg;
      g.beginPath();
      g.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = Math.max(0.6, r * 0.025);
      g.strokeStyle = 'rgba(60,40,10,0.6)';
      g.beginPath();
      g.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
      g.stroke();
    } else if (compound) {
      g.lineWidth = Math.max(0.8, r * 0.035);
      g.strokeStyle = PAL.gilt;
      g.beginPath();
      g.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
      g.stroke();
    }
    engrave(g, type, side, cx, cy, r);
    // A soft gloss.
    var gl = g.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx - r * 0.4, cy - r * 0.45, r * 0.7);
    gl.addColorStop(0, 'rgba(255,255,255,0.16)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }

  /** The move diagram, cut into the face: each mark drawn as a light lip below a dark cut. */
  function engrave(g, type, side, cx, cy, r) {
    var f = FACE[side];
    var list = pieces.moveList(type, side);
    // Scale the diagram so the furthest leap sits well inside the face. One-step pieces keep a tighter
    // unit, so a one-square leap (the ferz) sits clearly nearer the centre than a two-square one (the
    // fil), also inside a compound with a ride.
    var maxDist = 1;
    list.forEach(function (m) { if (m.k === 'leap') maxDist = Math.max(maxDist, Math.sqrt(m.dx * m.dx + m.dy * m.dy)); });
    var unit = Math.min(r * 0.31, (r * 0.64) / maxDist);
    var lw = Math.max(1.1, r * 0.06);
    // A faint lattice of the neighbouring squares, so a leap's distance can be counted on the face.
    var n = 1;
    var rides = false;
    var taken = {};
    list.forEach(function (m) {
      if (m.k === 'leap') { n = Math.max(n, Math.abs(m.dx), Math.abs(m.dy)); taken[m.dx + ',' + m.dy] = true; } else rides = true;
    });
    if (rides) n = Math.max(n, 2);
    g.save();
    g.translate(cx, cy);
    g.fillStyle = f.cut;
    g.globalAlpha = 0.32;
    for (var gy = -n; gy <= n; gy++) {
      for (var gx = -n; gx <= n; gx++) {
        if ((!gx && !gy) || taken[gx + ',' + gy]) continue;
        if (Math.sqrt(gx * gx + gy * gy) * unit > r * 0.8) continue;
        g.beginPath();
        g.arc(gx * unit, gy * unit, Math.max(0.55, r * 0.024), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
    var marks = [];
    marks.push({ t: 'center' });
    list.forEach(function (m) { marks.push(m); });
    function pass(color, dy) {
      g.save();
      g.translate(cx, cy + dy);
      g.strokeStyle = color;
      g.fillStyle = color;
      g.lineWidth = lw;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (var i = 0; i < marks.length; i++) mark(g, marks[i], unit, r, lw);
      g.restore();
    }
    pass(f.lip, Math.max(0.6, r * 0.035));
    pass(f.cut, 0);
  }

  function mark(g, m, unit, r, lw) {
    if (m.t === 'center') {
      g.beginPath();
      g.arc(0, 0, r * 0.085, 0, Math.PI * 2);
      g.lineWidth = lw * 0.8;
      g.stroke();
      g.lineWidth = lw;
      return;
    }
    if (m.k === 'leap') {
      var x = m.dx * unit;
      var y = m.dy * unit;
      if (m.m === 'both') {
        g.beginPath();
        g.arc(x, y, r * 0.075, 0, Math.PI * 2);
        g.fill();
      } else if (m.m === 'move') {
        g.beginPath();
        g.arc(x, y, r * 0.07, 0, Math.PI * 2);
        g.lineWidth = lw * 0.75;
        g.stroke();
        g.lineWidth = lw;
      } else {
        var s = r * 0.07;
        g.beginPath();
        g.moveTo(x - s, y - s); g.lineTo(x + s, y + s);
        g.moveTo(x + s, y - s); g.lineTo(x - s, y + s);
        g.stroke();
      }
      return;
    }
    var len = Math.sqrt(m.dx * m.dx + m.dy * m.dy);
    var ux = m.dx / len;
    var uy = m.dy / len;
    var a = r * 0.16;
    var b = r * 0.74;
    if (m.k === 'ride') {
      if (m.m === 'move') g.setLineDash([lw * 1.2, lw * 1.4]);
      g.beginPath();
      g.moveTo(ux * a, uy * a);
      g.lineTo(ux * b, uy * b);
      g.stroke();
      g.setLineDash([]);
      // A small chevron at the end: the ride runs on to the edge.
      var c = r * 0.09;
      var ex = ux * b;
      var ey = uy * b;
      g.beginPath();
      g.moveTo(ex - ux * c - uy * c, ey - uy * c + ux * c);
      g.lineTo(ex, ey);
      g.lineTo(ex - ux * c + uy * c, ey - uy * c - ux * c);
      g.stroke();
      return;
    }
    // hop: a groove, a bridge over the screen, then a capture cross.
    var m1 = r * 0.36;
    var m2 = r * 0.52;
    g.beginPath();
    g.moveTo(ux * a, uy * a);
    g.lineTo(ux * m1, uy * m1);
    var mx = ux * (m1 + m2) / 2;
    var my = uy * (m1 + m2) / 2;
    var rad = (m2 - m1) / 2;
    var ang = Math.atan2(uy, ux);
    g.arc(mx, my, rad, ang + Math.PI, ang, false);
    g.lineTo(ux * (b - r * 0.08), uy * (b - r * 0.08));
    g.stroke();
    var cxp = ux * b;
    var cyp = uy * b;
    var s2 = r * 0.065;
    g.beginPath();
    g.moveTo(cxp - s2, cyp - s2); g.lineTo(cxp + s2, cyp + s2);
    g.moveTo(cxp + s2, cyp - s2); g.lineTo(cxp - s2, cyp + s2);
    g.stroke();
  }

  /** Draws a cached disc centred on (x, y), scaled by s (1 = its own size). */
  function drawCached(g, type, side, x, y, r, dpr, s, alpha) {
    var c = disc(type, side, r, dpr);
    var size = c.cssSize * (s || 1);
    if (alpha != null) g.globalAlpha = alpha;
    g.drawImage(c, x - size / 2, y - size / 2, size, size);
    if (alpha != null) g.globalAlpha = 1;
  }

  /** A disc in a DOM canvas element (draft cards, museum, trays). */
  function discElement(type, side, r, cls) {
    var dpr = Math.min(3, root.devicePixelRatio || 1);
    var c = disc(type, side, r, dpr);
    var el = document.createElement('canvas');
    el.width = c.width;
    el.height = c.height;
    el.style.width = c.cssSize + 'px';
    el.style.height = c.cssSize + 'px';
    el.className = 'disc' + (cls ? ' ' + cls : '');
    el.getContext('2d').drawImage(c, 0, 0);
    return el;
  }

  /** The girih star lattice behind everything, as a repeating pattern at a whisper of contrast. */
  var patternCanvas = null;
  function groundPattern(g) {
    if (!patternCanvas) {
      var T = 88;
      patternCanvas = document.createElement('canvas');
      patternCanvas.width = T;
      patternCanvas.height = T;
      var p = patternCanvas.getContext('2d');
      p.fillStyle = PAL.night;
      p.fillRect(0, 0, T, T);
      p.lineWidth = 1;
      p.strokeStyle = 'rgba(237,228,207,0.05)';
      // An eight-point star (khatam) at the centre and the corners, joined by straight lines.
      [[T / 2, T / 2], [0, 0], [T, 0], [0, T], [T, T]].forEach(function (c) { khatam(p, c[0], c[1], T * 0.2); });
      p.strokeStyle = 'rgba(237,228,207,0.03)';
      p.beginPath();
      p.moveTo(T / 2, T / 2 - T * 0.2); p.lineTo(T / 2, 0);
      p.moveTo(T / 2, T / 2 + T * 0.2); p.lineTo(T / 2, T);
      p.moveTo(T / 2 - T * 0.2, T / 2); p.lineTo(0, T / 2);
      p.moveTo(T / 2 + T * 0.2, T / 2); p.lineTo(T, T / 2);
      p.stroke();
    }
    return g.createPattern(patternCanvas, 'repeat');
  }

  /** Two squares turned 45 degrees from each other. */
  function khatam(p, x, y, r) {
    for (var k = 0; k < 2; k++) {
      p.beginPath();
      for (var i = 0; i < 4; i++) {
        var a = (Math.PI / 2) * i + (k ? Math.PI / 4 : 0);
        var px = x + Math.cos(a) * r;
        var py = y + Math.sin(a) * r;
        if (i) p.lineTo(px, py); else p.moveTo(px, py);
      }
      p.closePath();
      p.stroke();
    }
  }

  // ---- the museum map: the Old World, low poly, longitude -18 to 150, latitude 0 to 66 ----

  var LAND = [
    [[-10, 30], [-6, 36], [-9, 37], [-9, 43], [-2, 43.5], [-1.5, 46], [-4.5, 48.5], [1.5, 50.5], [4, 51.5], [8, 54], [8.5, 57], [5.5, 58.5], [5, 62], [11, 66],
      [150, 66], [150, 59], [140, 59], [138, 54], [141, 52], [135, 48], [132, 43], [129, 41], [129.3, 35.5], [126.5, 34.5], [126, 37.5], [124.5, 40], [122, 40.5],
      [118, 39], [121, 37], [120, 35], [121.5, 31], [122, 29], [119.5, 26], [117, 23.5], [113.5, 22.2], [110, 21], [108, 21.5], [106, 20], [106.5, 17], [109, 12],
      [106, 9], [104.5, 10.5], [100.5, 13.5], [99.5, 10], [101, 7], [103.5, 1.5], [101, 3], [98, 8], [98.5, 16], [94.5, 16], [92, 21], [89, 22], [86.5, 20],
      [80.3, 15.5], [80, 10], [77.5, 8], [76, 10], [73, 17], [72.5, 21], [68, 23.5], [66.5, 25.2], [61, 25.2], [57, 26.5], [56.3, 25.5], [57.5, 23.5], [59.5, 22.5],
      [58.5, 20.5], [55, 17], [52, 15.7], [45, 12.8], [43.3, 12.7], [43.1, 11.5], [51, 11.8], [51, 10.5], [48, 5], [42, 0], [9, 0], [9.5, 4], [6, 4.3], [3, 6.3],
      [-2, 5], [-7.5, 4.5], [-12, 7.5], [-17, 14.7], [-16.5, 19.5], [-17, 21], [-13, 27.5]],
    [[-5.7, 50.0], [1.4, 51.2], [1.7, 52.8], [0, 53.5], [-1.6, 55.6], [-2, 57.6], [-3.1, 58.6], [-5, 58.6], [-6.2, 56.5], [-5, 55], [-3.2, 54.8], [-3, 53.4], [-4.7, 52.8], [-5.2, 51.7]],
    [[-6, 52.1], [-6.2, 54.5], [-7.5, 55.2], [-10, 54.2], [-10.3, 51.6]],
    [[130.9, 33.9], [132.5, 35.4], [135.5, 35.7], [136.9, 37.3], [139.8, 38.3], [140, 40.5], [141.4, 41.4], [141.9, 39], [140.9, 36.9], [139.8, 35.1], [138.5, 34.6], [136.8, 34.3], [135.1, 33.7], [132, 33.1]],
    [[140, 41.6], [141.7, 45.4], [145.5, 43.3], [143.3, 42], [141, 41.8]],
    [[129.8, 33.4], [131.1, 33.9], [131.6, 31.5], [130.2, 31.3]],
    [[79.8, 8], [80.3, 9.8], [81.9, 7.4], [80.6, 5.9]],
    [[95.3, 5.6], [97.5, 5.2], [100.4, 2.2], [103.8, 0], [99.8, 0], [98.8, 1.8]],
    [[109, 1.5], [111, 1.6], [113, 3.2], [115.5, 5.3], [117.4, 7], [119, 5], [117.8, 1], [117.5, 0], [109.2, 0]]
  ];
  var WATER = [
    [[-5.5, 36], [-2, 36.7], [3, 36.8], [10, 37.2], [11, 33.5], [20, 30.5], [29, 31], [34.5, 31.5], [36, 36.5], [30, 36.5], [27, 37], [26, 40], [23, 40.5], [22.5, 38.2],
      [21, 39.5], [19.5, 41.5], [13.7, 45.6], [12.3, 44.8], [13.5, 43.5], [16, 41.8], [18.5, 40.2], [17, 39], [16.5, 38], [15.6, 38.2], [16, 39.5], [14, 41], [12.3, 41.8],
      [10.5, 43.5], [8.8, 44.4], [6, 43.1], [3, 43.3], [0.5, 40.5], [-0.5, 38.3], [-2, 36.7]],
    [[28, 41.2], [28.5, 43.5], [30, 46], [33, 46.2], [35.5, 45.3], [38, 47], [39.5, 47], [37.5, 44.6], [41.5, 41.5], [36, 41.7], [31, 41.1]],
    [[47, 44.5], [49, 46.5], [53, 47], [53, 42], [54, 40.5], [53.5, 37], [50.5, 37], [49, 38.5], [49.5, 40.5], [47.5, 42.5]],
    [[32.6, 29.9], [35.0, 28.2], [39.2, 21.5], [43.4, 12.8], [42.0, 15.5], [38.0, 19.0], [34.5, 25.0], [32.3, 29.5]],
    [[48.0, 30.0], [50.0, 29.0], [51.5, 27.0], [54.5, 26.5], [56.3, 27.0], [56.4, 26.2], [55.5, 25.5], [54.0, 24.2], [51.5, 24.5], [50.5, 25.8], [49.0, 27.5]],
    [[10.8, 54.2], [14, 53.9], [19, 54.4], [21.2, 55.2], [21, 57], [24, 57.6], [23.4, 59.4], [30, 59.9], [23, 60.4], [21.5, 61.5], [21.5, 63.3], [25.3, 65.5], [22, 65.6],
      [18.5, 62.6], [17, 61], [19, 59.8], [16.5, 57], [14.3, 55.5], [12.5, 56], [12, 57.5], [10.5, 56.5]]
  ];
  var SICILY = [[12.5, 38.1], [15.6, 38.2], [15.1, 36.7], [12.5, 37.6]];

  /** Draws the map into a canvas element and pins the place of 'pin' (and every other known place dimly). */
  function drawMap(canvas, pin, others) {
    var dpr = Math.min(3, root.devicePixelRatio || 1);
    var w = canvas.clientWidth || 320;
    var h = Math.round(w / 2.4);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + 'px';
    var g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    function px(lon) { return ((lon + 18) / 168) * w; }
    function py(lat) { return h - (lat / 66) * h; }
    function poly(list) {
      g.beginPath();
      list.forEach(function (p, i) { if (i) g.lineTo(px(p[0]), py(p[1])); else g.moveTo(px(p[0]), py(p[1])); });
      g.closePath();
    }
    g.fillStyle = PAL.night;
    g.fillRect(0, 0, w, h);
    g.lineWidth = 1;
    LAND.concat([SICILY]).forEach(function (l) {
      poly(l);
      g.fillStyle = '#1E2E55';
      g.fill();
    });
    WATER.forEach(function (l) {
      poly(l);
      g.fillStyle = PAL.night;
      g.fill();
    });
    g.strokeStyle = 'rgba(237,228,207,0.28)';
    LAND.concat(WATER, [SICILY]).forEach(function (l) { poly(l); g.stroke(); });
    (others || []).forEach(function (o) {
      g.fillStyle = 'rgba(237,228,207,0.35)';
      g.beginPath();
      g.arc(px(o[0]), py(o[1]), 2, 0, Math.PI * 2);
      g.fill();
    });
    if (pin) {
      var x = px(pin[0]);
      var y = py(pin[1]);
      g.strokeStyle = PAL.turquoise;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = PAL.turquoise;
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  // ---- the Daily share card: 600 by 800, spoiler free ----

  function shareCard(entry, results, archive, S) {
    var W = 600;
    var H = 800;
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var g = c.getContext('2d');
    g.fillStyle = groundPattern(g);
    g.fillRect(0, 0, W, H);
    g.fillStyle = PAL.ivory;
    g.textAlign = 'left';
    g.font = '600 46px Spectral, Georgia, serif';
    g.fillText(S('title'), 48, 92);
    g.font = '500 26px Spectral, Georgia, serif';
    g.fillStyle = 'rgba(237,228,207,0.75)';
    g.fillText((archive ? S('dailyArchived', entry.day) : S('dailyNumber', entry.day)) + '   ' + S('army_' + entry.army.id), 48, 134);
    // The army, as discs.
    var army = entry.army.army;
    army.forEach(function (t, i) { drawCached(g, t, 1, 72 + i * 82, 212, 30, 1); });
    // One row per board.
    for (var b = 0; b < 5; b++) {
      var r = results[b];
      var y = 300 + b * 84;
      g.fillStyle = 'rgba(237,228,207,0.06)';
      roundRect(g, 40, y - 32, W - 80, 68, 14);
      g.fill();
      g.font = '600 28px Spectral, Georgia, serif';
      g.fillStyle = 'rgba(237,228,207,0.6)';
      g.fillText(String(b + 1), 64, y + 11);
      var colour = !r || !r.won ? PAL.carnelian : r.moves <= r.par ? PAL.turquoise : PAL.ivory;
      g.fillStyle = colour;
      roundRect(g, 104, y - 14, 30, 30, 6);
      if (r && r.won && r.moves > r.par) { g.lineWidth = 3; g.strokeStyle = colour; g.stroke(); } else g.fill();
      g.fillStyle = PAL.ivory;
      g.font = '600 26px Spectral, Georgia, serif';
      var mark = r && r.won ? P.share.versusPar(r) : '';
      g.fillText(mark, 154, y + 10);
      var n = r ? r.survivors | 0 : 0;
      for (var k = 0; k < n; k++) {
        g.fillStyle = PAL.ivory;
        g.beginPath();
        g.arc(300 + k * 30, y + 1, 10, 0, Math.PI * 2);
        g.fill();
      }
      var lost = r ? Math.max(0, (r.army | 0) - n) : 0;
      for (var q = 0; q < lost; q++) {
        g.strokeStyle = 'rgba(237,228,207,0.35)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(300 + (n + q) * 30, y + 1, 9, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.font = '500 22px Archivo, system-ui, sans-serif';
    g.fillStyle = 'rgba(237,228,207,0.6)';
    g.fillText('apps.mohdshayan.com/pawnfare/play', 48, H - 44);
    return c.toDataURL('image/png');
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  P.art = {
    PAL: PAL, disc: disc, drawCached: drawCached, discElement: discElement, groundPattern: groundPattern,
    drawMap: drawMap, shareCard: shareCard, roundRect: roundRect
  };
})(this);
