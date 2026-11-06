/*
 * The ink renderer. Everything is drawn by code: flat washes, wobbling ink lines, tree crowns, roofs,
 * tufts, sand stipple, rivers between edge midpoints, a waterlined coast, fog puffs and the landmarks.
 *
 * Tiles: the run of edges with the most land fills the hex; every other run is a lobe that spans its
 * edges corner to corner and curves inward, so neighbouring tiles with matching edges join into one
 * continuous wash and only real terrain borders keep a line. Each tile is drawn once per size and turn
 * into a cached canvas.
 */
(function (root) {
  'use strict';
  var FC = root.FC || (root.FC = {});
  var hex = FC.hex, rules = FC.rules, rng = FC.rng;

  var P = {
    sea: '#A8BEBB',
    seaDeep: '#9AB2AF',
    waterline: '#6E8D8A',
    fog: '#F2F3EE',
    paper: '#E8EAE1',
    paperShade: '#D9DCD1',
    ink: '#1F2B2A',
    pencil: '#7D8A86',
    vermilion: '#C2432D',
    vermilionDark: '#9E3322',
    meadow: '#CBD3A0',
    meadowInk: '#5F6E3F',
    forest: '#7F976A',
    forestCrown: '#5E7A4F',
    forestInk: '#2E4231',
    village: '#D9BE91',
    villageInk: '#7A5B33',
    river: '#6E98A8',
    riverLight: '#9DBDC8',
    coast: '#E3D6AE',
    coastInk: '#8C7F5A'
  };
  var FILL = [P.meadow, P.forest, P.village, P.meadow, P.coast];
  var FONT = '"Fog Serif", "EB Garamond", Georgia, serif';

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // ---- wobbling ink lines ----

  /** A hand-drawn polyline through pts (closed when [closed]), jittered by [amp] px with [r]. */
  function wobblePath(g, pts, amp, r, closed) {
    if (!pts.length) return;
    var j = function () { return (r.next() - 0.5) * 2 * amp; };
    g.moveTo(pts[0].x + j(), pts[0].y + j());
    var n = closed ? pts.length + 1 : pts.length;
    for (var i = 1; i < n; i++) {
      var a = pts[(i - 1) % pts.length], b = pts[i % pts.length];
      var mx = (a.x + b.x) / 2 + j(), my = (a.y + b.y) / 2 + j();
      g.quadraticCurveTo(mx, my, b.x + j() * 0.5, b.y + j() * 0.5);
    }
  }

  function hexPath(g, s, cx, cy) {
    for (var k = 0; k < 6; k++) {
      var c = hex.corner(k, s);
      if (k === 0) g.moveTo(cx + c.x, cy + c.y); else g.lineTo(cx + c.x, cy + c.y);
    }
    g.closePath();
  }

  // ---- tile geometry ----

  /** Terrain per direction for a tile turned t. */
  function dirEdges(code, t) {
    var e = [];
    for (var d = 0; d < 6; d++) e.push(rules.edgeAt(code, t, d));
    return e;
  }

  /** Runs of contiguous land terrain (river edges count as meadow banks). [{t, dirs: [...]}] */
  function landRuns(e) {
    var land = e.map(function (x) { return x === rules.R ? rules.M : x; });
    var start = -1;
    for (var d = 0; d < 6; d++) if (land[d] !== land[(d + 5) % 6]) { start = d; break; }
    if (start < 0) return [{ t: land[0], dirs: [0, 1, 2, 3, 4, 5], whole: true }];
    var runs = [];
    var cur = null;
    for (var k = 0; k < 6; k++) {
      var dd = (start + k) % 6;
      if (!cur || land[dd] !== cur.t) { cur = { t: land[dd], dirs: [] }; runs.push(cur); }
      cur.dirs.push(dd);
    }
    return runs;
  }

  /** The inward curve of a lobe: from the run's last corner back to its first, bulging toward the centre. */
  function lobePoints(dirs, s) {
    var k = dirs.length;
    var ri = s * hex.SQRT3 / 2;
    var depth = k === 1 ? 0.5 : k === 2 ? 0.36 : 0.24; // fraction of the inner radius left to the centre
    var pts = [];
    for (var i = 0; i < k; i++) {
      var a = dirs[i] * Math.PI / 3;
      pts.push({ x: Math.cos(a) * ri * depth, y: Math.sin(a) * ri * depth });
    }
    return pts;
  }

  function lobePath(dirs, s) {
    var p = new Path2D();
    var first = dirs[0], last = dirs[dirs.length - 1];
    var c0 = hex.corner((first + 5) % 6, s);
    p.moveTo(c0.x, c0.y);
    for (var i = 0; i < dirs.length; i++) {
      var c = hex.corner(dirs[i], s);
      p.lineTo(c.x, c.y);
    }
    // back inward through the lobe's inner points, smoothly
    var inner = lobePoints(dirs, s).reverse();
    var cl = hex.corner(last, s);
    var prev = cl;
    for (var j = 0; j < inner.length; j++) {
      var q = inner[j];
      var mid = { x: (prev.x + q.x) / 2, y: (prev.y + q.y) / 2 };
      p.quadraticCurveTo(prev === cl ? (cl.x * 0.6 + q.x * 0.4) : prev.x, prev === cl ? (cl.y * 0.6 + q.y * 0.4) : prev.y, mid.x, mid.y);
      prev = q;
    }
    p.quadraticCurveTo(prev.x, prev.y, (prev.x + c0.x * 0.4) / 1.4, (prev.y + c0.y * 0.4) / 1.4);
    p.lineTo(c0.x, c0.y);
    p.closePath();
    return p;
  }

  function innerCurve(dirs, s) {
    // the same inward curve as lobePath, as an open path for the ink border
    var p = new Path2D();
    var first = dirs[0], last = dirs[dirs.length - 1];
    var c0 = hex.corner((first + 5) % 6, s);
    var cl = hex.corner(last, s);
    var inner = lobePoints(dirs, s).reverse();
    p.moveTo(cl.x, cl.y);
    var prev = cl;
    for (var j = 0; j < inner.length; j++) {
      var q = inner[j];
      var mid = { x: (prev.x + q.x) / 2, y: (prev.y + q.y) / 2 };
      p.quadraticCurveTo(prev === cl ? (cl.x * 0.6 + q.x * 0.4) : prev.x, prev === cl ? (cl.y * 0.6 + q.y * 0.4) : prev.y, mid.x, mid.y);
      prev = q;
    }
    p.quadraticCurveTo(prev.x, prev.y, (prev.x + c0.x * 0.4) / 1.4, (prev.y + c0.y * 0.4) / 1.4);
    p.lineTo(c0.x, c0.y);
    return p;
  }

  function riverPath(e, s) {
    var dirs = [];
    for (var d = 0; d < 6; d++) if (e[d] === rules.R) dirs.push(d);
    if (dirs.length < 2) return null;
    var a = hex.edgeMid(dirs[0], s), b = hex.edgeMid(dirs[1], s);
    var p = new Path2D();
    p.moveTo(a.x, a.y);
    // ease the curve: control points pulled toward the centre from each mouth
    p.bezierCurveTo(a.x * 0.35, a.y * 0.35, b.x * 0.35, b.y * 0.35, b.x, b.y);
    return p;
  }

  // ---- glyphs ----

  function tree(g, x, y, r, u) {
    g.beginPath();
    g.ellipse(x, y, r, r * 0.92, 0, 0, Math.PI * 2);
    g.fillStyle = P.forestCrown;
    g.fill();
    g.beginPath();
    g.arc(x - r * 0.22, y - r * 0.2, r * 0.45, 0, Math.PI * 2);
    g.fillStyle = 'rgba(232,234,225,0.22)';
    g.fill();
    g.beginPath();
    g.arc(x, y, r, Math.PI * 0.05, Math.PI * 1.15);
    g.strokeStyle = P.forestInk;
    g.lineWidth = u * 0.9;
    g.stroke();
    g.beginPath();
    g.moveTo(x, y + r * 0.85);
    g.lineTo(x, y + r * 1.5);
    g.lineWidth = u * 0.8;
    g.stroke();
  }

  function house(g, x, y, w, u, roof) {
    var h = w * 0.62;
    g.fillStyle = P.paper;
    g.fillRect(x - w / 2, y - h / 2, w, h);
    g.strokeStyle = P.ink;
    g.lineWidth = u * 0.8;
    g.strokeRect(x - w / 2, y - h / 2, w, h);
    g.beginPath();
    g.moveTo(x - w / 2 - w * 0.12, y - h / 2);
    g.lineTo(x, y - h / 2 - w * 0.5);
    g.lineTo(x + w / 2 + w * 0.12, y - h / 2);
    g.closePath();
    g.fillStyle = roof;
    g.fill();
    g.stroke();
  }

  function tuft(g, x, y, r, u) {
    g.beginPath();
    g.moveTo(x - r * 0.6, y); g.lineTo(x - r * 0.9, y - r);
    g.moveTo(x, y); g.lineTo(x, y - r * 1.2);
    g.moveTo(x + r * 0.6, y); g.lineTo(x + r * 0.9, y - r);
    g.strokeStyle = P.meadowInk;
    g.lineWidth = u * 0.7;
    g.stroke();
  }

  /** Ploughed field strips across a village: broken parallel rows at one angle per tile. */
  function fields(g, s, u, ang, r) {
    var ca = Math.cos(ang), sa = Math.sin(ang);
    g.save();
    g.strokeStyle = P.villageInk;
    g.globalAlpha = 0.32;
    g.lineWidth = u * 0.8;
    g.setLineDash([s * 0.3, s * 0.07, s * 0.16, s * 0.07]);
    var step = s * 0.1;
    for (var k = -12; k <= 12; k++) {
      var ox = -sa * k * step, oy = ca * k * step;
      g.lineDashOffset = r.next() * s * 0.6;
      g.beginPath();
      g.moveTo(ox - ca * s * 1.2, oy - sa * s * 1.2);
      g.lineTo(ox + ca * s * 1.2, oy + sa * s * 1.2);
      g.stroke();
    }
    g.setLineDash([]);
    g.restore();
  }

  /** Points on a jittered grid inside the hex, kept [margin] px from its edges. */
  function samples(s, step, margin, r) {
    var out = [];
    var ri = s * hex.SQRT3 / 2 - margin;
    for (var y = -s; y <= s; y += step * 0.87) {
      var row = Math.round(y / (step * 0.87));
      for (var x = -s; x <= s; x += step) {
        var px = x + (row % 2 ? step / 2 : 0) + (r.next() - 0.5) * step * 0.55;
        var py = y + (r.next() - 0.5) * step * 0.5;
        // inside the hex (inner radius test on the six edge normals)
        var inside = true;
        for (var d = 0; d < 6 && inside; d++) {
          var a = d * Math.PI / 3;
          if (px * Math.cos(a) + py * Math.sin(a) > ri) inside = false;
        }
        if (inside) out.push({ x: px, y: py });
      }
    }
    return out;
  }

  /**
   * Draw a tile centred on (0, 0) of size s (px) into g. [u] is one CSS pixel in g's units.
   */
  function drawTile(g, code, t, s, u, seedExtra) {
    var e = dirEdges(code, t);
    var r = rng.make(code * 7 + t * 131 + (seedExtra | 0) * 9973 + 17);
    var runs = landRuns(e);
    // the dominant run: most edges, forest before village before meadow before coast on ties
    var order = [rules.F, rules.V, rules.M, rules.C];
    var dom = runs[0];
    for (var i = 1; i < runs.length; i++) {
      var a = runs[i];
      if (a.dirs.length > dom.dirs.length || (a.dirs.length === dom.dirs.length && order.indexOf(a.t) < order.indexOf(dom.t))) dom = a;
    }
    g.save();
    var clip = new Path2D();
    hexPath(clip, s * 1.002, 0, 0);
    g.clip(clip);
    g.fillStyle = FILL[dom.t];
    g.fill(clip);
    var fieldAngle = (r.int(3) * 60 + 30 + (r.next() - 0.5) * 16) * Math.PI / 180;
    if (dom.t === rules.V) fields(g, s, u, fieldAngle, r);
    var lobes = [];
    for (var k = 0; k < runs.length; k++) {
      if (runs[k] === dom) continue;
      var lp = lobePath(runs[k].dirs, s);
      g.fillStyle = FILL[runs[k].t];
      g.fill(lp);
      if (runs[k].t === rules.V) {
        g.save();
        g.clip(lp);
        fields(g, s, u, fieldAngle, r);
        g.restore();
      }
      lobes.push({ t: runs[k].t, path: lp, dirs: runs[k].dirs });
    }
    var rp = riverPath(e, s);

    // which terrain a point shows
    function terrainAt(x, y) {
      for (var m = lobes.length - 1; m >= 0; m--) if (g.isPointInPath(lobes[m].path, x, y)) return lobes[m].t;
      return dom.t;
    }
    function nearRiver(x, y, w) {
      if (!rp) return false;
      g.lineWidth = w;
      return g.isPointInStroke(rp, x, y);
    }
    // isPointInPath applies the current transform to the path: the device-space paths below are tested
    // with an identity transform, set around each test (the drawing transform stays in place otherwise)
    var tf = g.getTransform();
    var toDev = function (p) { return { x: tf.a * p.x + tf.c * p.y + tf.e, y: tf.b * p.x + tf.d * p.y + tf.f }; };
    var scale = tf.a;
    var lobesDev = lobes.map(function (L) {
      var p2 = new Path2D();
      p2.addPath(L.path, tf);
      return { t: L.t, path: p2 };
    });
    var rpDev = null;
    if (rp) { rpDev = new Path2D(); rpDev.addPath(rp, tf); }
    terrainAt = function (x, y) {
      var dp = toDev({ x: x, y: y });
      var found = dom.t;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      for (var m = lobesDev.length - 1; m >= 0; m--) if (g.isPointInPath(lobesDev[m].path, dp.x, dp.y)) { found = lobesDev[m].t; break; }
      g.restore();
      return found;
    };
    nearRiver = function (x, y, w) {
      if (!rpDev) return false;
      var dp = toDev({ x: x, y: y });
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.lineWidth = w * scale;
      var hit = g.isPointInStroke(rpDev, dp.x, dp.y);
      g.restore();
      return hit;
    };

    // textures
    var pts = samples(s, s * 0.21, s * 0.1, r);
    var villagePts = [];
    for (var pi = 0; pi < pts.length; pi++) {
      var pt = pts[pi];
      var tt = terrainAt(pt.x, pt.y);
      if (nearRiver(pt.x, pt.y, s * 0.36)) continue;
      if (tt === rules.F) {
        tree(g, pt.x, pt.y, s * (0.075 + r.next() * 0.02), u);
      } else if (tt === rules.V) {
        villagePts.push(pt);
      } else if (tt === rules.M) {
        if (r.next() < 0.42) tuft(g, pt.x, pt.y, s * 0.045, u);
      } else if (tt === rules.C) {
        g.fillStyle = P.coastInk;
        g.globalAlpha = 0.5;
        for (var dd = 0; dd < 4; dd++) {
          g.beginPath();
          g.arc(pt.x + (r.next() - 0.5) * s * 0.18, pt.y + (r.next() - 0.5) * s * 0.18, u * (0.5 + r.next() * 0.5), 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      }
    }
    // houses spread evenly through the village (samples run top to bottom), at most four a tile
    var nHouses = Math.min(4, Math.round(villagePts.length * 0.3));
    for (var hi = 0; hi < nHouses; hi++) {
      var hp = villagePts[Math.floor((hi + 0.5) * villagePts.length / nHouses)];
      house(g, hp.x, hp.y, s * (0.14 + r.next() * 0.04), u, r.next() < 0.5 ? '#5B4636' : P.ink);
    }

    // lobe borders
    g.strokeStyle = P.ink;
    g.globalAlpha = 0.55;
    g.lineWidth = u * 0.9;
    for (var b = 0; b < lobes.length; b++) g.stroke(innerCurve(lobes[b].dirs, s));
    g.globalAlpha = 1;

    // river: ink banks, water, a light thread
    if (rp) {
      g.lineCap = 'round';
      g.strokeStyle = P.ink;
      g.lineWidth = s * 0.2 + u * 2;
      g.stroke(rp);
      g.strokeStyle = P.river;
      g.lineWidth = s * 0.2;
      g.stroke(rp);
      g.strokeStyle = P.riverLight;
      g.lineWidth = s * 0.05;
      g.globalAlpha = 0.8;
      g.setLineDash([s * 0.12, s * 0.09]);
      g.stroke(rp);
      g.setLineDash([]);
      g.globalAlpha = 1;
      g.lineCap = 'butt';
    }
    g.restore();
  }

  var cache = {};
  var cacheCount = 0;

  /** A cached canvas of a tile at size s device px (u = device px per CSS px). */
  function tileCanvas(code, t, s, u) {
    var k = code + ':' + t + ':' + Math.round(s * 10) + ':' + Math.round(u * 100);
    var c = cache[k];
    if (c) return c;
    if (cacheCount > 400) { cache = {}; cacheCount = 0; }
    var pad = Math.ceil(u * 2);
    c = canvas(s * 2 + pad * 2, s * 2 + pad * 2);
    var g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2);
    drawTile(g, code, t, s, u, 0);
    cache[k] = c;
    cacheCount++;
    return c;
  }

  // Device pixels per drawing unit: the board draws in CSS px on a context scaled by devicePixelRatio,
  // while tiles are cached at device resolution.
  var RES = 1;
  function setRes(r) { RES = r > 0 ? r : 1; }

  function drawCachedTile(g, code, t, s, u, x, y, alpha) {
    var c = tileCanvas(code, t, s * RES, u * RES);
    var w = c.width / RES, h = c.height / RES;
    var px = Math.round((x - w / 2) * RES) / RES, py = Math.round((y - h / 2) * RES) / RES;
    if (alpha != null) g.globalAlpha = alpha;
    g.drawImage(c, px, py, w, h);
    if (alpha != null) g.globalAlpha = 1;
  }

  // ---- paper grain and fog textures ----

  var grainTex = null;
  function grain() {
    if (grainTex) return grainTex;
    var n = 192;
    grainTex = canvas(n, n);
    var g = grainTex.getContext('2d');
    var img = g.createImageData(n, n);
    var r = rng.make(4242);
    for (var i = 0; i < n * n; i++) {
      var v = r.next();
      var a = v < 0.5 ? Math.floor(v * 2 * 22) : 0;
      img.data[i * 4] = 40; img.data[i * 4 + 1] = 52; img.data[i * 4 + 2] = 50; img.data[i * 4 + 3] = a;
    }
    g.putImageData(img, 0, 0);
    // a few fibres
    g.strokeStyle = 'rgba(40,52,50,0.06)';
    g.lineWidth = 1;
    for (var f = 0; f < 26; f++) {
      g.beginPath();
      var x = r.next() * n, y = r.next() * n, a2 = r.next() * Math.PI;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a2) * 9, y + Math.sin(a2) * 9 + 3, x + Math.cos(a2) * 18, y + Math.sin(a2) * 18);
      g.stroke();
    }
    return grainTex;
  }

  var puffTex = null;
  function puff() {
    if (puffTex) return puffTex;
    puffTex = canvas(128, 128);
    var g = puffTex.getContext('2d');
    var grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(242,243,238,1)');
    grd.addColorStop(0.55, 'rgba(242,243,238,0.96)');
    grd.addColorStop(0.8, 'rgba(242,243,238,0.5)');
    grd.addColorStop(1, 'rgba(242,243,238,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return puffTex;
  }

  var cloudTex = null;
  /**
   * A tileable soft cloud texture that drifts over the fog: two octaves of value noise on a lattice that
   * wraps, so the pattern has no seams. Light patches brighten the fog, dark ones shade it.
   */
  function cloud() {
    if (cloudTex) return cloudTex;
    var n = 128;
    cloudTex = canvas(n, n);
    var g = cloudTex.getContext('2d');
    var img = g.createImageData(n, n);
    var r = rng.make(99);
    function lattice(m) {
      var v = [];
      for (var i = 0; i < m * m; i++) v.push(r.next());
      return function (x, y) {
        var fx = x / n * m, fy = y / n * m;
        var x0 = Math.floor(fx), y0 = Math.floor(fy);
        var tx = fx - x0, ty = fy - y0;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        var a = v[(y0 % m) * m + (x0 % m)], b = v[(y0 % m) * m + ((x0 + 1) % m)];
        var c = v[((y0 + 1) % m) * m + (x0 % m)], d = v[((y0 + 1) % m) * m + ((x0 + 1) % m)];
        return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
      };
    }
    var o1 = lattice(4), o2 = lattice(8), o3 = lattice(16);
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var v = o1(x, y) * 0.55 + o2(x, y) * 0.3 + o3(x, y) * 0.15;
        var k = (y * n + x) * 4;
        if (v >= 0.5) {
          img.data[k] = 255; img.data[k + 1] = 255; img.data[k + 2] = 255;
          img.data[k + 3] = Math.min(255, Math.round((v - 0.5) * 2 * 150));
        } else {
          img.data[k] = 138; img.data[k + 1] = 154; img.data[k + 2] = 151;
          img.data[k + 3] = Math.min(255, Math.round((0.5 - v) * 2 * 120));
        }
      }
    }
    g.putImageData(img, 0, 0);
    return cloudTex;
  }

  // ---- board-level drawing ----

  /**
   * A map layout: island cells laid out at hex size s (px in the target context), origin (ox, oy) is the
   * pixel position of axial (0, 0).
   */
  function cellXY(L, i) {
    var c = L.cells[i];
    var p = hex.center(c[0], c[1], L.s);
    return { x: L.ox + p.x, y: L.oy + p.y };
  }

  /** Engraved waterlines round the island: scalloped rings fading out to sea. */
  function drawWaterlines(g, L, u, rings) {
    rings = rings || 4;
    var w = g.canvas.width, h = g.canvas.height;
    var tmp = canvas(w, h);
    var t = tmp.getContext('2d');
    var ri = L.s * hex.SQRT3 / 2;
    for (var k = rings; k >= 1; k--) {
      var off = ri * (0.16 + 0.2 * (k - 1)) + u * 1;
      t.clearRect(0, 0, w, h);
      t.globalCompositeOperation = 'source-over';
      t.fillStyle = P.waterline;
      t.beginPath();
      for (var i = 0; i < L.cells.length; i++) {
        var c = cellXY(L, i);
        t.moveTo(c.x + ri + off, c.y);
        t.arc(c.x, c.y, ri + off, 0, Math.PI * 2);
      }
      t.fill();
      t.globalCompositeOperation = 'destination-out';
      t.beginPath();
      var lw = u * (k === 1 ? 1.4 : 1.1);
      for (var j = 0; j < L.cells.length; j++) {
        var c2 = cellXY(L, j);
        t.moveTo(c2.x + ri + off - lw, c2.y);
        t.arc(c2.x, c2.y, ri + off - lw, 0, Math.PI * 2);
      }
      t.fill();
      g.globalAlpha = 0.75 * Math.pow(0.68, k - 1);
      g.drawImage(tmp, 0, 0);
    }
    g.globalAlpha = 1;
    t.globalCompositeOperation = 'source-over';
  }

  /** Boundary edges of the island (cell, direction) facing the sea. */
  function coastEdges(L) {
    var set = {};
    for (var i = 0; i < L.cells.length; i++) set[L.cells[i][0] + ',' + L.cells[i][1]] = true;
    var out = [];
    for (var j = 0; j < L.cells.length; j++) {
      for (var d = 0; d < 6; d++) {
        var q = L.cells[j][0] + hex.DIRS[d][0], r2 = L.cells[j][1] + hex.DIRS[d][1];
        if (!set[q + ',' + r2]) out.push([j, d]);
      }
    }
    return out;
  }

  function drawLandBase(g, L) {
    g.fillStyle = P.paper;
    g.beginPath();
    for (var i = 0; i < L.cells.length; i++) {
      var c = cellXY(L, i);
      hexPath(g, L.s * 1.01, c.x, c.y);
    }
    g.fill();
  }

  function drawCoastline(g, L, u, alpha) {
    var r = rng.make(31337);
    g.strokeStyle = P.ink;
    g.lineWidth = Math.max(1, u * 1.9);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.globalAlpha = alpha == null ? 1 : alpha;
    var edges = coastEdges(L);
    g.beginPath();
    for (var k = 0; k < edges.length; k++) {
      var c = cellXY(L, edges[k][0]);
      var ec = hex.edgeCorners(edges[k][1], L.s);
      var a = { x: c.x + ec[0].x, y: c.y + ec[0].y }, b = { x: c.x + ec[1].x, y: c.y + ec[1].y };
      wobblePath(g, [a, { x: (a.x * 2 + b.x) / 3, y: (a.y * 2 + b.y) / 3 }, { x: (a.x + b.x * 2) / 3, y: (a.y + b.y * 2) / 3 }, b], u * 0.6, r, false);
    }
    g.stroke();
    g.globalAlpha = 1;
    g.lineCap = 'butt';
  }

  /** Ink lines on seams whose terrains differ (both tiles placed). */
  function drawBrokenSeams(g, L, board, u) {
    var r = rng.make(777);
    g.strokeStyle = P.ink;
    g.globalAlpha = 0.6;
    g.lineWidth = u * 1.1;
    g.beginPath();
    for (var i = 0; i < board.n; i++) {
      if (board.code[i] < 0) continue;
      for (var d = 0; d < 3; d++) {
        // each seam once: directions E, SE, SW from this cell
        var j = board.nb[i * 6 + d];
        if (j < 0 || board.code[j] < 0) continue;
        if (board.e[i * 6 + d] === board.e[j * 6 + (d + 3) % 6]) continue;
        var c = cellXY(L, i);
        var ec = hex.edgeCorners(d, L.s);
        var a = { x: c.x + ec[0].x, y: c.y + ec[0].y }, b = { x: c.x + ec[1].x, y: c.y + ec[1].y };
        wobblePath(g, [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b], u * 0.5, r, false);
      }
    }
    g.stroke();
    g.globalAlpha = 1;
  }

  function drawTiles(g, L, board, u) {
    for (var i = 0; i < board.n; i++) {
      if (board.code[i] < 0) continue;
      var c = cellXY(L, i);
      drawCachedTile(g, board.code[i], board.turn[i], L.s, u, c.x, c.y);
    }
  }

  // ---- features and landmarks ----

  function drawSpring(g, x, y, s, u) {
    g.save();
    g.strokeStyle = P.ink;
    g.lineWidth = u * 1.1;
    g.fillStyle = P.river;
    g.beginPath();
    g.arc(x, y, s * 0.11, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.globalAlpha = 0.7;
    for (var k = 1; k <= 2; k++) {
      g.beginPath();
      g.arc(x, y, s * (0.11 + k * 0.09), -0.3 + k * 0.4, Math.PI * 1.4 + k * 0.4);
      g.stroke();
    }
    g.restore();
  }

  function drawRuin(g, x, y, s, u) {
    g.save();
    g.strokeStyle = P.ink;
    g.fillStyle = P.paperShade;
    g.lineWidth = u * 1.1;
    var r = rng.make(55);
    var n = 7;
    for (var k = 0; k < n; k++) {
      if (k === 2 || k === 5) continue; // gaps in the broken wall
      var a = k / n * Math.PI * 2 - Math.PI / 2;
      var bx = x + Math.cos(a) * s * 0.24, by = y + Math.sin(a) * s * 0.24;
      var hgt = s * (0.08 + r.next() * 0.08);
      g.save();
      g.translate(bx, by);
      g.rotate(a + Math.PI / 2);
      g.fillRect(-s * 0.07, -hgt / 2, s * 0.14, hgt);
      g.strokeRect(-s * 0.07, -hgt / 2, s * 0.14, hgt);
      g.restore();
    }
    g.beginPath();
    g.arc(x, y, s * 0.04, 0, Math.PI * 2);
    g.fillStyle = P.ink;
    g.fill();
    g.restore();
  }

  /** Landmarks: 'watchtower', 'mill', 'lighthouse', stamped in vermilion. k is the size unit. */
  function drawLandmark(g, kind, x, y, k, u, scale) {
    g.save();
    g.translate(x, y);
    var sc = scale == null ? 1 : scale;
    g.scale(sc, sc);
    g.lineWidth = u * 1.2;
    g.strokeStyle = P.ink;
    g.lineJoin = 'round';
    // a paper halo so the stamp reads on any terrain
    g.beginPath();
    g.ellipse(0, k * 0.1, k * 0.62, k * 0.7, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(232,234,225,0.72)';
    g.fill();
    if (kind === 'watchtower') {
      g.beginPath();
      g.moveTo(-k * 0.2, k * 0.45); g.lineTo(-k * 0.13, -k * 0.25); g.lineTo(k * 0.13, -k * 0.25); g.lineTo(k * 0.2, k * 0.45);
      g.closePath();
      g.fillStyle = P.vermilion; g.fill(); g.stroke();
      g.beginPath();
      g.rect(-k * 0.22, -k * 0.42, k * 0.44, k * 0.17);
      g.fillStyle = P.vermilion; g.fill(); g.stroke();
      g.fillStyle = P.paper;
      g.fillRect(-k * 0.11, -k * 0.42, k * 0.07, k * 0.07);
      g.fillRect(k * 0.04, -k * 0.42, k * 0.07, k * 0.07);
      g.beginPath();
      g.moveTo(0, -k * 0.42); g.lineTo(0, -k * 0.62); g.lineTo(k * 0.16, -k * 0.56); g.lineTo(0, -k * 0.5);
      g.stroke();
      g.fillStyle = P.ink;
      g.fillRect(-k * 0.04, k * 0.12, k * 0.08, k * 0.14);
    } else if (kind === 'mill') {
      g.beginPath();
      g.moveTo(-k * 0.2, k * 0.45); g.lineTo(-k * 0.12, -k * 0.12); g.lineTo(k * 0.12, -k * 0.12); g.lineTo(k * 0.2, k * 0.45);
      g.closePath();
      g.fillStyle = P.vermilion; g.fill(); g.stroke();
      g.beginPath();
      g.moveTo(-k * 0.14, -k * 0.12); g.lineTo(0, -k * 0.28); g.lineTo(k * 0.14, -k * 0.12);
      g.fillStyle = P.vermilionDark; g.fill(); g.stroke();
      for (var sI = 0; sI < 4; sI++) {
        g.save();
        g.translate(0, -k * 0.2);
        g.rotate(Math.PI / 4 + sI * Math.PI / 2);
        g.beginPath();
        g.rect(-k * 0.045, -k * 0.5, k * 0.09, k * 0.42);
        g.fillStyle = P.paper; g.fill(); g.stroke();
        g.restore();
      }
      g.beginPath(); g.arc(0, -k * 0.2, k * 0.04, 0, Math.PI * 2); g.fillStyle = P.ink; g.fill();
    } else {
      // lighthouse
      g.beginPath();
      g.moveTo(-k * 0.15, k * 0.45); g.lineTo(-k * 0.09, -k * 0.28); g.lineTo(k * 0.09, -k * 0.28); g.lineTo(k * 0.15, k * 0.45);
      g.closePath();
      g.fillStyle = P.paper; g.fill();
      g.save(); g.clip();
      g.fillStyle = P.vermilion;
      for (var b2 = 0; b2 < 3; b2++) g.fillRect(-k * 0.3, -k * 0.2 + b2 * k * 0.24, k * 0.6, k * 0.11);
      g.restore();
      g.stroke();
      g.beginPath();
      g.rect(-k * 0.1, -k * 0.44, k * 0.2, k * 0.16);
      g.fillStyle = '#F4E3A1'; g.fill(); g.stroke();
      g.beginPath();
      g.moveTo(-k * 0.12, -k * 0.44); g.lineTo(0, -k * 0.56); g.lineTo(k * 0.12, -k * 0.44);
      g.fillStyle = P.ink; g.fill();
      g.globalAlpha = 0.7;
      g.beginPath();
      g.moveTo(k * 0.14, -k * 0.38); g.lineTo(k * 0.42, -k * 0.48);
      g.moveTo(-k * 0.14, -k * 0.38); g.lineTo(-k * 0.42, -k * 0.48);
      g.stroke();
    }
    g.restore();
  }

  /** Where a closed region's landmark stands: the centre of its member edges on its busiest tile. */
  function regionAnchor(L, region) {
    var per = {};
    var best = -1, bestN = 0;
    for (var k = 0; k < region.slots.length; k++) {
      var i = Math.floor(region.slots[k] / 6);
      per[i] = (per[i] || 0) + 1;
      if (per[i] > bestN) { bestN = per[i]; best = i; }
    }
    var c = cellXY(L, best);
    var sx = 0, sy = 0, n = 0;
    for (var m = 0; m < region.slots.length; m++) {
      if (Math.floor(region.slots[m] / 6) !== best) continue;
      var em = hex.edgeMid(region.slots[m] % 6, L.s);
      sx += em.x; sy += em.y; n++;
    }
    return { x: c.x + sx / n * 0.45, y: c.y + sy / n * 0.45 + L.s * 0.05, cell: best };
  }

  function riverAnchor(L, info) {
    var i = Math.floor(info.mouth / 6), d = info.mouth % 6;
    var c = cellXY(L, i);
    var em = hex.edgeMid(d, L.s);
    var side = hex.edgeMid((d + 1) % 6, L.s);
    return { x: c.x + em.x * 0.62 + side.x * 0.22, y: c.y + em.y * 0.62 + side.y * 0.22, cell: i };
  }

  /** Landmarks for a scored board. */
  function landmarks(L, sc) {
    var out = [];
    if (!sc || !sc.regions) return out;
    for (var k = 0; k < sc.regions.length; k++) {
      var rg = sc.regions[k];
      if (!rg.landmark) continue;
      var a = regionAnchor(L, rg);
      out.push({ kind: rg.terrain === rules.F ? 'watchtower' : 'mill', x: a.x, y: a.y, key: 'r' + rg.slots[0], cell: a.cell });
    }
    if (sc.riverInfo && sc.riverInfo.mouth >= 0) {
      var ra = riverAnchor(L, sc.riverInfo);
      out.push({ kind: 'lighthouse', x: ra.x, y: ra.y, key: 'l' + sc.riverInfo.mouth, cell: ra.cell });
    }
    return out;
  }

  function drawFeatures(g, L, island, u, alpha) {
    g.save();
    if (alpha != null) g.globalAlpha = alpha;
    if (island.spring >= 0) {
      var c = cellXY(L, island.spring);
      drawSpring(g, c.x, c.y, L.s, u);
    }
    if (island.ruin >= 0) {
      var c2 = cellXY(L, island.ruin);
      drawRuin(g, c2.x, c2.y, L.s, u);
    }
    g.restore();
  }

  function fillGrain(g, w, h, alpha) {
    var pat = g.createPattern(grain(), 'repeat');
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.fillStyle = pat;
    g.fillRect(0, 0, w, h);
    g.restore();
  }

  /** Fit an island into a box: hex size and origin. */
  function fit(island, x, y, w, h, maxS) {
    var b = hex.bounds(island.cells);
    var s = Math.min(w / (b.cols * hex.SQRT3), h / (b.rows * 1.5 + 0.5));
    if (maxS) s = Math.min(s, maxS);
    var midX = (b.minX + b.maxX) / 2, midR = (b.minR + b.maxR) / 2;
    return {
      cells: island.cells, s: s,
      ox: x + w / 2 - s * hex.SQRT3 * midX,
      oy: y + h / 2 - s * 1.5 * midR
    };
  }

  /**
   * A finished (or partial) map drawn whole into g: sea, waterlines, land, tiles, seams, coast, features,
   * landmarks. For the result card, the Atlas pages and the share card.
   */
  function drawMap(g, island, board, L, u, opts) {
    opts = opts || {};
    var w = g.canvas.width, h = g.canvas.height;
    if (!opts.noSea) {
      g.fillStyle = P.sea;
      g.fillRect(0, 0, w, h);
      if (opts.grain !== false) fillGrain(g, w, h, 0.8);
    }
    drawWaterlines(g, L, u, opts.rings);
    drawLandBase(g, L);
    drawTiles(g, L, board, u);
    drawBrokenSeams(g, L, board, u);
    if (opts.fogUnplaced) {
      for (var i = 0; i < board.n; i++) {
        if (board.code[i] >= 0) continue;
        var c = cellXY(L, i);
        var R = L.s * 1.2;
        g.drawImage(puff(), c.x - R, c.y - R, R * 2, R * 2);
      }
    }
    drawCoastline(g, L, u);
    drawFeatures(g, L, island, u);
    var sc = board.score();
    var lm = landmarks(L, sc);
    for (var k = 0; k < lm.length; k++) drawLandmark(g, lm[k].kind, lm[k].x, lm[k].y, L.s * 0.62, u);
    return sc;
  }

  /** The map's frame: a double neatline with corner squares. */
  function drawFrame(g, x, y, w, h, u) {
    g.save();
    g.strokeStyle = P.ink;
    g.lineWidth = u * 2.2;
    g.strokeRect(x, y, w, h);
    g.lineWidth = u * 0.8;
    var m = u * 6;
    g.strokeRect(x + m, y + m, w - 2 * m, h - 2 * m);
    var cs = u * 6;
    g.fillStyle = P.ink;
    [[x, y], [x + w - cs, y], [x, y + h - cs], [x + w - cs, y + h - cs]].forEach(function (p) { g.fillRect(p[0], p[1], cs, cs); });
    // tick marks along the neatline, like a chart's graticule
    g.lineWidth = u * 0.8;
    g.beginPath();
    var step = Math.max(u * 18, w / 14);
    for (var tx = x + m + step; tx < x + w - m - step / 2; tx += step) {
      g.moveTo(tx, y + m); g.lineTo(tx, y + m - u * 3);
      g.moveTo(tx, y + h - m); g.lineTo(tx, y + h - m + u * 3);
    }
    for (var ty = y + m + step; ty < y + h - m - step / 2; ty += step) {
      g.moveTo(x + m, ty); g.lineTo(x + m - u * 3, ty);
      g.moveTo(x + w - m, ty); g.lineTo(x + w - m + u * 3, ty);
    }
    g.stroke();
    g.restore();
  }

  /** Small icons drawn in the ink line: pennant (par) and laurel (gold). */
  function pennant(g, x, y, k, filled) {
    g.save();
    g.lineWidth = Math.max(1, k * 0.09);
    g.strokeStyle = P.ink;
    g.beginPath();
    g.moveTo(x, y + k * 0.5); g.lineTo(x, y - k * 0.5);
    g.stroke();
    g.beginPath();
    g.moveTo(x, y - k * 0.5); g.lineTo(x + k * 0.62, y - k * 0.3); g.lineTo(x, y - k * 0.1);
    g.closePath();
    g.fillStyle = filled ? P.vermilion : 'rgba(0,0,0,0)';
    g.fill();
    g.stroke();
    g.restore();
  }

  /** The gold mark: a medal with two ribbon tails. */
  function laurel(g, x, y, k, filled) {
    g.save();
    g.lineWidth = Math.max(1, k * 0.08);
    g.strokeStyle = P.ink;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(x - k * 0.15, y + k * 0.05); g.lineTo(x - k * 0.27, y + k * 0.5); g.lineTo(x - k * 0.12, y + k * 0.42); g.lineTo(x - k * 0.04, y + k * 0.55);
    g.moveTo(x + k * 0.15, y + k * 0.05); g.lineTo(x + k * 0.27, y + k * 0.5); g.lineTo(x + k * 0.12, y + k * 0.42); g.lineTo(x + k * 0.04, y + k * 0.55);
    g.stroke();
    g.beginPath();
    g.arc(x, y - k * 0.14, k * 0.26, 0, Math.PI * 2);
    g.fillStyle = filled ? P.vermilion : 'rgba(0,0,0,0)';
    g.fill();
    g.stroke();
    g.restore();
  }

  FC.art = {
    P: P, FILL: FILL, FONT: FONT, canvas: canvas, drawTile: drawTile, tileCanvas: tileCanvas,
    drawCachedTile: drawCachedTile, setRes: setRes, grain: grain, puff: puff, cloud: cloud, cellXY: cellXY,
    drawWaterlines: drawWaterlines, drawLandBase: drawLandBase, drawCoastline: drawCoastline,
    drawBrokenSeams: drawBrokenSeams, drawTiles: drawTiles, drawSpring: drawSpring, drawRuin: drawRuin,
    drawLandmark: drawLandmark, landmarks: landmarks, drawFeatures: drawFeatures, fillGrain: fillGrain,
    fit: fit, drawMap: drawMap, drawFrame: drawFrame, pennant: pennant, laurel: laurel, hexPath: hexPath,
    dirEdges: dirEdges, coastEdges: coastEdges, wobblePath: wobblePath
  };
})(window);
