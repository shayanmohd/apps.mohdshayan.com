/*
 * The museum: three invented cultures of six vessels each. Every vessel is a lathe profile (radius by
 * height) cut into seeded Voronoi fragments, filled base first as Expedition digs earn fragments. Pure
 * geometry and bookkeeping; art.js draws it.
 *
 * Vessel space: y runs 0 (foot) to 1 (rim), x is -r(y) to r(y), radii are fractions of the height.
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var rng = node ? require('./rng.js') : root.Sherd.rng;

  // Profiles are [y, r] knots joined by a smooth curve. Motifs: bands of a pattern between two heights.
  var CULTURES = [
    {
      id: 'velan', glaze: '#2B4C8C', body: '#C9C1B0', slip: '#B9AE98', line: '#1F2A31',
      vessels: [
        { need: 5, knots: [[0, 0.16], [0.08, 0.2], [0.38, 0.36], [0.62, 0.32], [0.78, 0.15], [0.9, 0.12], [1, 0.17]], bands: [[0.42, 0.5, 'chevron'], [0.66, 0.7, 'line']] },
        { need: 6, knots: [[0, 0.13], [0.1, 0.17], [0.45, 0.33], [0.66, 0.27], [0.8, 0.11], [0.93, 0.1], [1, 0.14]], bands: [[0.3, 0.36, 'wave'], [0.5, 0.58, 'chevron']], handles: 0.7 },
        { need: 7, knots: [[0, 0.18], [0.12, 0.22], [0.5, 0.38], [0.72, 0.3], [0.84, 0.14], [1, 0.2]], bands: [[0.55, 0.64, 'wave'], [0.36, 0.4, 'line']] },
        { need: 8, knots: [[0, 0.1], [0.06, 0.14], [0.35, 0.3], [0.58, 0.35], [0.76, 0.2], [0.88, 0.1], [1, 0.13]], bands: [[0.44, 0.54, 'chevron'], [0.62, 0.66, 'line'], [0.24, 0.28, 'line']], handles: 0.8 },
        { need: 9, knots: [[0, 0.2], [0.14, 0.26], [0.42, 0.4], [0.64, 0.38], [0.8, 0.2], [0.92, 0.16], [1, 0.22]], bands: [[0.46, 0.58, 'wave'], [0.66, 0.72, 'chevron']] },
        { need: 10, knots: [[0, 0.08], [0.06, 0.12], [0.3, 0.27], [0.56, 0.34], [0.74, 0.24], [0.86, 0.1], [0.96, 0.09], [1, 0.15]], bands: [[0.36, 0.44, 'chevron'], [0.5, 0.6, 'wave'], [0.66, 0.7, 'line']], handles: 0.84 }
      ]
    },
    {
      id: 'oru', glaze: '#8E3B24', body: '#C2B39A', slip: '#A2532E', line: '#2A2622',
      vessels: [
        { need: 10, knots: [[0, 0.2], [0.12, 0.36], [0.42, 0.5], [0.72, 0.4], [0.88, 0.26], [1, 0.28]], bands: [[0.48, 0.6, 'dots'], [0.72, 0.76, 'line']] },
        { need: 11, knots: [[0, 0.24], [0.2, 0.46], [0.48, 0.52], [0.76, 0.36], [0.9, 0.24], [1, 0.27]], bands: [[0.4, 0.52, 'ladder'], [0.6, 0.66, 'dots']] },
        { need: 12, knots: [[0, 0.18], [0.16, 0.4], [0.46, 0.56], [0.7, 0.48], [0.86, 0.3], [1, 0.32]], bands: [[0.5, 0.62, 'dots'], [0.3, 0.36, 'ladder']], handles: 0.78 },
        { need: 12, knots: [[0, 0.26], [0.18, 0.5], [0.5, 0.58], [0.78, 0.42], [0.92, 0.3], [1, 0.33]], bands: [[0.56, 0.68, 'ladder'], [0.4, 0.46, 'dots']] },
        { need: 13, knots: [[0, 0.16], [0.14, 0.38], [0.4, 0.5], [0.66, 0.5], [0.84, 0.32], [1, 0.36]], bands: [[0.44, 0.56, 'dots'], [0.62, 0.7, 'ladder'], [0.22, 0.26, 'line']] },
        { need: 14, knots: [[0, 0.22], [0.2, 0.48], [0.52, 0.6], [0.8, 0.44], [0.92, 0.28], [1, 0.3]], bands: [[0.46, 0.6, 'ladder'], [0.66, 0.72, 'dots'], [0.3, 0.34, 'line']], handles: 0.84 }
      ]
    },
    {
      id: 'tesh', glaze: '#2E2A2C', body: '#CFC6B4', slip: '#3A3436', line: '#1E1C1E',
      vessels: [
        { need: 14, knots: [[0, 0.17], [0.08, 0.16], [0.3, 0.22], [0.62, 0.34], [1, 0.46]], bands: [[0.62, 0.78, 'steps'], [0.86, 0.9, 'line']] },
        { need: 15, knots: [[0, 0.2], [0.06, 0.19], [0.22, 0.24], [0.5, 0.42], [0.8, 0.52], [1, 0.56]], bands: [[0.56, 0.72, 'steps'], [0.32, 0.36, 'line']] },
        { need: 15, knots: [[0, 0.14], [0.1, 0.13], [0.4, 0.19], [0.7, 0.3], [1, 0.4]], bands: [[0.5, 0.64, 'steps'], [0.72, 0.84, 'steps']] },
        { need: 16, knots: [[0, 0.24], [0.08, 0.22], [0.3, 0.3], [0.56, 0.46], [0.84, 0.56], [1, 0.6]], bands: [[0.4, 0.56, 'steps'], [0.68, 0.72, 'line'], [0.8, 0.88, 'steps']] },
        { need: 16, knots: [[0, 0.16], [0.12, 0.15], [0.36, 0.2], [0.62, 0.28], [0.86, 0.4], [1, 0.48]], bands: [[0.58, 0.74, 'steps'], [0.4, 0.44, 'line'], [0.88, 0.92, 'line']] },
        { need: 18, knots: [[0, 0.22], [0.08, 0.2], [0.26, 0.26], [0.5, 0.4], [0.76, 0.52], [1, 0.62]], bands: [[0.32, 0.46, 'steps'], [0.56, 0.6, 'line'], [0.66, 0.84, 'steps']] }
      ]
    }
  ];

  var VESSELS = [];
  CULTURES.forEach(function (c, ci) {
    c.vessels.forEach(function (v, vi) {
      VESSELS.push({ index: VESSELS.length, culture: ci, slot: vi, need: v.need, knots: v.knots, bands: v.bands, handles: v.handles || 0 });
    });
  });

  var TOTAL = VESSELS.reduce(function (s, v) { return s + v.need; }, 0);

  /** Where the collection stands for a lifetime fragment total and glaze pieces earned. */
  function progress(fragments, glaze) {
    var left = Math.max(0, fragments | 0);
    var restored = 0;
    var current = -1;
    var have = 0;
    for (var i = 0; i < VESSELS.length; i++) {
      if (left >= VESSELS[i].need) { left -= VESSELS[i].need; restored++; continue; }
      current = i;
      have = left;
      left = 0;
      break;
    }
    var g = Math.max(0, glaze | 0);
    var glazed = Math.min(g, restored);
    return {
      restored: restored, current: current, have: have, need: current >= 0 ? VESSELS[current].need : 0,
      glazed: glazed, glazeStock: g - glazed, spare: current < 0 ? left : 0, total: TOTAL
    };
  }

  /** Fragments shown for vessel i at a lifetime total: 0, a part, or all. */
  function piecesShown(i, fragments) {
    var before = 0;
    for (var k = 0; k < i; k++) before += VESSELS[k].need;
    return Math.max(0, Math.min(VESSELS[i].need, (fragments | 0) - before));
  }

  // ---- profile ----

  /** The radius at height y, a Catmull-Rom curve through the knots. */
  function radiusAt(vessel, y) {
    var k = vessel.knots;
    if (y <= k[0][0]) return k[0][1];
    if (y >= k[k.length - 1][0]) return k[k.length - 1][1];
    var i = 0;
    while (i < k.length - 2 && y > k[i + 1][0]) i++;
    var p0 = k[Math.max(0, i - 1)][1];
    var p1 = k[i][1];
    var p2 = k[i + 1][1];
    var p3 = k[Math.min(k.length - 1, i + 2)][1];
    var t = (y - k[i][0]) / (k[i + 1][0] - k[i][0]);
    var t2 = t * t;
    var t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  /** Samples of the profile, foot to rim. */
  function profile(vessel, steps) {
    var out = [];
    for (var s = 0; s <= steps; s++) {
      var y = s / steps;
      out.push([y, Math.max(0.02, radiusAt(vessel, y))]);
    }
    return out;
  }

  function maxRadius(vessel) {
    var m = 0;
    profile(vessel, 60).forEach(function (p) { if (p[1] > m) m = p[1]; });
    return m;
  }

  // ---- fragments: Voronoi cells of seeded points inside the silhouette ----

  var fragmentCache = {};

  /** The vessel's fragments as polygons in vessel space, in the order they are restored (foot first). */
  function fragments(vessel) {
    if (fragmentCache[vessel.index]) return fragmentCache[vessel.index];
    var rnd = rng.create(rng.seed('sherd-vessel', vessel.index));
    var R = maxRadius(vessel) + 0.02;
    var sites = [];
    var tries = 0;
    // Best-candidate sampling spreads the pieces evenly.
    while (sites.length < vessel.need && tries < 4000) {
      var best = null;
      var bestD = -1;
      for (var c = 0; c < 14; c++) {
        tries++;
        var y = 0.03 + rnd() * 0.94;
        var r = radiusAt(vessel, y) * 0.86;
        var x = (rnd() * 2 - 1) * r;
        var d = Infinity;
        for (var s = 0; s < sites.length; s++) {
          var dx = (sites[s][0] - x) * 1.25;
          var dy = sites[s][1] - y;
          var dd = dx * dx + dy * dy;
          if (dd < d) d = dd;
        }
        if (d > bestD) { bestD = d; best = [x, y]; }
      }
      sites.push(best);
    }
    var box = [[-R, -0.02], [R, -0.02], [R, 1.02], [-R, 1.02]];
    var cells = sites.map(function (p, i) {
      var poly = box;
      for (var j = 0; j < sites.length && poly.length; j++) {
        if (j === i) continue;
        poly = clipHalfPlane(poly, p, sites[j]);
      }
      return { site: p, poly: poly, cy: centroid(poly)[1], cx: centroid(poly)[0] };
    });
    cells.sort(function (a, b) { return (a.cy - b.cy) || (a.cx - b.cx); });
    fragmentCache[vessel.index] = cells;
    return cells;
  }

  // Keeps the part of poly closer to a than to b.
  function clipHalfPlane(poly, a, b) {
    var mx = (a[0] + b[0]) / 2;
    var my = (a[1] + b[1]) / 2;
    var nx = b[0] - a[0];
    var ny = b[1] - a[1];
    function side(p) { return (p[0] - mx) * nx + (p[1] - my) * ny; }
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i];
      var q = poly[(i + 1) % poly.length];
      var sp = side(p);
      var sq = side(q);
      if (sp <= 0) out.push(p);
      if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
        var t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return out;
  }

  function centroid(poly) {
    var x = 0;
    var y = 0;
    poly.forEach(function (p) { x += p[0]; y += p[1]; });
    return poly.length ? [x / poly.length, y / poly.length] : [0, 0];
  }

  var api = { CULTURES: CULTURES, VESSELS: VESSELS, TOTAL: TOTAL, progress: progress, piecesShown: piecesShown,
    radiusAt: radiusAt, profile: profile, maxRadius: maxRadius, fragments: fragments };
  if (node) module.exports = api;
  else (root.Sherd = root.Sherd || {}).museum = api;
})(this);
