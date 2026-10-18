/* Rucksack: the continent of Elsewhere, drawn from the route outwards.
   Nothing here is an image file. The coast, the land, the ink glyphs and the
   road are all computed from the region spines in content.js. */
var Atlas = (function () {
  'use strict';

  var SUB = 12;                 // curve samples per control segment
  var SAMPLES = [];             // { x, y, km, r, ri } along the whole road
  var BOUNDS = { x0: 0, y0: 0, x1: 1000, y1: 2240 };
  var PATH_LEN = 0;

  /* ------------------------------------------------------------ route build */
  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      y: 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
    };
  }

  function landRadius(km) {
    var r = 84 + 11 * Math.sin(km * 0.0041 + 0.7) + 14 * Math.sin(km * 0.0113 + 2.4) +
            17 * Math.sin(km * 0.0270 + 5.1) + 11 * Math.sin(km * 0.0690 + 1.1) +
            7 * Math.sin(km * 0.1490 + 3.6);
    return Math.max(46, Math.min(132, r));
  }
  function landDrift(km) {
    return 16 * Math.sin(km * 0.0067 + 1.3) + 13 * Math.sin(km * 0.0310 + 3.9) +
           8 * Math.sin(km * 0.0820 + 0.4);
  }

  function build() {
    var cp = [], seg = [], i, j, r;
    for (i = 0; i < Content.REGIONS.length; i++) {
      var sp = Content.REGIONS[i].spine;
      for (j = (i === 0 ? 0 : 1); j < sp.length; j++) {
        cp.push(sp[j]);
        if (cp.length > 1) seg.push(i);
      }
    }
    // seg[k] is the region owning the segment cp[k] -> cp[k+1]
    var raw = [];
    for (i = 0; i < seg.length; i++) {
      var p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)];
      var last = (i === seg.length - 1);
      for (j = 0; j < SUB + (last ? 1 : 0); j++) {
        var pt = catmull(p0, p1, p2, p3, j / SUB);
        raw.push({ x: pt.x, y: pt.y, ri: seg[i] });
      }
    }

    // arc length inside each region, then kilometres spread along it
    var byRegion = {};
    for (i = 0; i < raw.length; i++) {
      var ri = raw[i].ri;
      if (!byRegion[ri]) byRegion[ri] = [];
      byRegion[ri].push(i);
    }
    for (var key in byRegion) {
      var idx = byRegion[key], reg = Content.REGIONS[+key];
      var acc = [0], total = 0;
      for (i = 1; i < idx.length; i++) {
        var a = raw[idx[i - 1]], b = raw[idx[i]];
        total += Math.hypot(b.x - a.x, b.y - a.y);
        acc.push(total);
      }
      for (i = 0; i < idx.length; i++) {
        var f = total > 0 ? acc[i] / total : 0;
        raw[idx[i]].km = reg.from + f * (reg.to - reg.from);
      }
    }

    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (i = 0; i < raw.length; i++) {
      r = landRadius(raw[i].km);
      var d = landDrift(raw[i].km);
      var nx = 0, ny = 0;
      var pa = raw[Math.max(0, i - 1)], pb = raw[Math.min(raw.length - 1, i + 1)];
      var tx = pb.x - pa.x, ty = pb.y - pa.y, tl = Math.hypot(tx, ty) || 1;
      nx = -ty / tl; ny = tx / tl;
      var s = { x: raw[i].x, y: raw[i].y, cx: raw[i].x + nx * d, cy: raw[i].y + ny * d,
                km: raw[i].km, r: r, ri: raw[i].ri, nx: nx, ny: ny };
      SAMPLES.push(s);
      minx = Math.min(minx, s.cx - r); maxx = Math.max(maxx, s.cx + r);
      miny = Math.min(miny, s.cy - r); maxy = Math.max(maxy, s.cy + r);
      if (i > 0) PATH_LEN += Math.hypot(s.x - SAMPLES[i - 1].x, s.y - SAMPLES[i - 1].y);
    }
    BOUNDS = { x0: minx - 40, y0: miny - 40, x1: maxx + 40, y1: maxy + 40 };
  }
  build();

  /** World point at a route kilometre, with the road's direction there. */
  function at(km) {
    km = Math.max(0, Math.min(Content.TOTAL_KM, km));
    var lo = 0, hi = SAMPLES.length - 1;
    while (lo < hi - 1) {
      var mid = (lo + hi) >> 1;
      if (SAMPLES[mid].km <= km) lo = mid; else hi = mid;
    }
    var a = SAMPLES[lo], b = SAMPLES[hi];
    var span = b.km - a.km;
    var t = span > 0 ? (km - a.km) / span : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
             ang: Math.atan2(b.y - a.y, b.x - a.x), r: a.r + (b.r - a.r) * t,
             nx: a.nx, ny: a.ny };
  }

  /* --------------------------------------------------------------- glyphs
     Small ink marks. Every one is strokes and fills, no images. */
  function rnd(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function glyph(c, type, x, y, s, R, ink) {
    c.strokeStyle = ink; c.fillStyle = ink;
    c.lineWidth = Math.max(0.6, s * 0.13);
    c.lineCap = 'round'; c.lineJoin = 'round';
    var i, h;
    switch (type) {
      case 'tree':
      case 'orchard':
        c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - s * 0.55); c.stroke();
        c.beginPath();
        for (i = 0; i < 3; i++) {
          h = s * (0.55 + i * 0.22);
          c.moveTo(x - s * (0.42 - i * 0.11), y - h);
          c.lineTo(x, y - h - s * 0.3);
          c.lineTo(x + s * (0.42 - i * 0.11), y - h);
        }
        c.stroke();
        break;
      case 'reed':
      case 'grass':
        c.beginPath();
        for (i = 0; i < 3; i++) {
          var dx = (i - 1) * s * 0.28;
          c.moveTo(x + dx, y);
          c.quadraticCurveTo(x + dx + s * 0.1, y - s * 0.5, x + dx + s * 0.26, y - s * 0.8);
        }
        c.stroke();
        break;
      case 'hill':
      case 'dune':
        c.beginPath(); c.moveTo(x - s * 0.8, y);
        c.quadraticCurveTo(x - s * 0.3, y - s * 0.7, x + s * 0.15, y);
        c.moveTo(x - s * 0.05, y);
        c.quadraticCurveTo(x + s * 0.4, y - s * 0.5, x + s * 0.85, y);
        c.stroke();
        break;
      case 'peak':
      case 'cliff':
        c.beginPath(); c.moveTo(x - s * 0.8, y); c.lineTo(x - s * 0.1, y - s * 1.1);
        c.lineTo(x + s * 0.75, y); c.stroke();
        c.beginPath(); c.moveTo(x - s * 0.36, y - s * 0.52); c.lineTo(x - s * 0.1, y - s * 1.1);
        c.lineTo(x + s * 0.16, y - s * 0.55); c.stroke();
        break;
      case 'snowline':
        c.beginPath(); c.moveTo(x - s * 0.6, y); c.lineTo(x - s * 0.1, y - s * 0.8);
        c.lineTo(x + s * 0.55, y); c.closePath();
        c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1;
        break;
      case 'stone':
      case 'cairn':
      case 'scree':
        c.beginPath(); c.moveTo(x - s * 0.45, y); c.lineTo(x - s * 0.3, y - s * 0.72);
        c.lineTo(x + s * 0.28, y - s * 0.62); c.lineTo(x + s * 0.46, y); c.closePath();
        c.globalAlpha = 0.62; c.fill(); c.globalAlpha = 1; c.stroke();
        break;
      case 'pool':
      case 'water':
      case 'bog':
        c.beginPath();
        for (i = 0; i < 2; i++) {
          c.moveTo(x - s * 0.7, y + i * s * 0.34);
          c.quadraticCurveTo(x - s * 0.2, y + i * s * 0.34 - s * 0.2, x + s * 0.2, y + i * s * 0.34);
          c.quadraticCurveTo(x + s * 0.5, y + i * s * 0.34 + s * 0.18, x + s * 0.75, y + i * s * 0.34);
        }
        c.stroke();
        break;
      case 'salt':
        c.globalAlpha = 0.55;
        c.beginPath(); c.moveTo(x - s * 0.7, y); c.lineTo(x + s * 0.7, y); c.stroke();
        c.globalAlpha = 1;
        break;
      case 'hut':
      case 'tent':
        c.beginPath(); c.moveTo(x - s * 0.55, y); c.lineTo(x, y - s * 0.75); c.lineTo(x + s * 0.55, y);
        c.closePath(); c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1; c.stroke();
        break;
      case 'mill':
        c.beginPath(); c.moveTo(x - s * 0.3, y); c.lineTo(x - s * 0.16, y - s * 0.8);
        c.lineTo(x + s * 0.16, y - s * 0.8); c.lineTo(x + s * 0.3, y); c.closePath(); c.stroke();
        c.beginPath();
        c.moveTo(x - s * 0.62, y - s * 1.08); c.lineTo(x + s * 0.62, y - s * 0.52);
        c.moveTo(x + s * 0.62, y - s * 1.08); c.lineTo(x - s * 0.62, y - s * 0.52);
        c.stroke();
        break;
      case 'tower':
      case 'light':
        c.beginPath(); c.moveTo(x - s * 0.26, y); c.lineTo(x - s * 0.18, y - s * 1.05);
        c.lineTo(x + s * 0.18, y - s * 1.05); c.lineTo(x + s * 0.26, y); c.closePath(); c.stroke();
        c.beginPath(); c.arc(x, y - s * 1.2, s * 0.16, 0, 6.284); c.fill();
        break;
      case 'boat':
        c.beginPath(); c.moveTo(x - s * 0.6, y); c.quadraticCurveTo(x, y + s * 0.3, x + s * 0.6, y);
        c.stroke();
        c.beginPath(); c.moveTo(x, y - s * 0.02); c.lineTo(x, y - s * 0.7); c.stroke();
        break;
      case 'sheep':
      case 'horse':
      case 'bee':
        c.beginPath(); c.ellipse(x, y - s * 0.3, s * 0.34, s * 0.24, 0, 0, 6.284);
        c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
        c.beginPath();
        c.moveTo(x - s * 0.2, y - s * 0.1); c.lineTo(x - s * 0.2, y + s * 0.16);
        c.moveTo(x + s * 0.2, y - s * 0.1); c.lineTo(x + s * 0.2, y + s * 0.16);
        c.stroke();
        break;
      case 'lamp':
        c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - s * 0.9); c.stroke();
        c.beginPath(); c.arc(x, y - s * 1.02, s * 0.2, 0, 6.284); c.stroke();
        break;
      case 'step':
        c.beginPath();
        c.moveTo(x - s * 0.7, y); c.lineTo(x - s * 0.2, y); c.lineTo(x - s * 0.2, y - s * 0.32);
        c.lineTo(x + s * 0.3, y - s * 0.32); c.lineTo(x + s * 0.3, y - s * 0.64); c.lineTo(x + s * 0.75, y - s * 0.64);
        c.stroke();
        break;
      case 'city':
        for (i = 0; i < 5; i++) {
          var bh = s * (0.5 + ((i * 37) % 5) * 0.16);
          c.beginPath(); c.rect(x - s * 1.1 + i * s * 0.46, y - bh, s * 0.36, bh);
          c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1; c.stroke();
        }
        break;
      default:
        c.beginPath(); c.arc(x, y, s * 0.22, 0, 6.284); c.fill();
    }
  }

  /* Deterministic scatter of the region kits, kept off the road itself. */
  var SCATTER = null;
  function scatter() {
    if (SCATTER) return SCATTER;
    SCATTER = [];
    for (var i = 0; i < Content.REGIONS.length; i++) {
      var reg = Content.REGIONS[i];
      var R = rnd(Content.hash(reg.id + 'kit'));
      for (var k = 0; k < reg.kit.length; k++) {
        var type = reg.kit[k][0], n = reg.kit[k][1];
        for (var j = 0; j < n; j++) {
          var km = reg.from + ((j + R() * 0.9) / n) * (reg.to - reg.from);
          var p = at(km);
          var side = R() < 0.5 ? -1 : 1;
          var t = (0.2 + R() * 0.74) * side;
          var rad = landRadius(km) * 0.94;
          var drift = landDrift(km);
          SCATTER.push({
            x: p.x + p.nx * (drift + t * rad),
            y: p.y + p.ny * (drift + t * rad),
            type: type, s: 4.6 + R() * 3.4, km: km, ri: i
          });
        }
      }
    }
    return SCATTER;
  }

  /* --------------------------------------------------------- base rendering */
  function pathFor(from, to, grow) {
    var p = new Path2D();
    for (var i = 0; i < SAMPLES.length; i++) {
      var s = SAMPLES[i];
      if (s.km < from || s.km > to) continue;
      p.moveTo(s.cx + s.r + grow, s.cy);
      p.arc(s.cx, s.cy, s.r + grow, 0, 6.2832);
    }
    return p;
  }

  var LAND_ALL = null;
  function landPath() { if (!LAND_ALL) LAND_ALL = pathFor(-1, 1e9, 0); return LAND_ALL; }

  /** Draw the whole map into `c`, which is already transformed into world space. */
  function drawBase(c, rect, ink, paper) {
    var i, s;
    var x0 = rect.x0 - 200, x1 = rect.x1 + 200, y0 = rect.y0 - 200, y1 = rect.y1 + 200;
    function inRect(px, py, pad) {
      return px > x0 - pad && px < x1 + pad && py > y0 - pad && py < y1 + pad;
    }

    // coastal haloes, then the coastline, filled once so overlaps do not stack
    var halo = new Path2D(), coast = new Path2D();
    var perRegion = [];
    for (i = 0; i < Content.REGIONS.length; i++) perRegion.push(new Path2D());
    for (i = 0; i < SAMPLES.length; i++) {
      s = SAMPLES[i];
      if (!inRect(s.cx, s.cy, s.r + 30)) continue;
      halo.moveTo(s.cx + s.r + 17, s.cy); halo.arc(s.cx, s.cy, s.r + 17, 0, 6.2832);
      coast.moveTo(s.cx + s.r + 3, s.cy); coast.arc(s.cx, s.cy, s.r + 3, 0, 6.2832);
      var pr = perRegion[s.ri];
      pr.moveTo(s.cx + s.r, s.cy); pr.arc(s.cx, s.cy, s.r, 0, 6.2832);
    }
    c.fillStyle = 'rgba(90,104,96,0.10)'; c.fill(halo);
    c.fillStyle = 'rgba(46,44,38,0.55)'; c.fill(coast);
    for (i = 0; i < Content.REGIONS.length; i++) {
      c.fillStyle = Content.REGIONS[i].land;
      c.fill(perRegion[i]);
    }

    // watercolour blotches, held inside the land
    c.save();
    c.clip(landPath());
    for (i = 0; i < Content.REGIONS.length; i++) {
      var reg = Content.REGIONS[i], R = rnd(Content.hash(reg.id + 'wash'));
      for (var w = 0; w < 16; w++) {
        var km = reg.from + R() * (reg.to - reg.from);
        var p = at(km);
        var off = (R() * 2 - 1) * landRadius(km) * 0.9 + landDrift(km);
        var bx = p.x + p.nx * off, by = p.y + p.ny * off;
        if (!inRect(bx, by, 140)) continue;
        var rr = 46 + R() * 78;
        var g = c.createRadialGradient(bx, by, rr * 0.1, bx, by, rr);
        g.addColorStop(0, reg.wash);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(bx, by, rr, 0, 6.2832); c.fill();
      }
    }
    c.restore();

    // the ink kit
    var sc = scatter();
    for (i = 0; i < sc.length; i++) {
      var it = sc[i];
      if (!inRect(it.x, it.y, 20)) continue;
      c.globalAlpha = 0.72;
      glyph(c, it.type, it.x, it.y, it.s, it.s, ink);
      c.globalAlpha = 1;
    }

    // the road
    c.strokeStyle = 'rgba(46,44,38,0.5)';
    c.lineWidth = 2.2; c.setLineDash([7, 5]); c.lineCap = 'butt';
    c.beginPath();
    for (i = 0; i < SAMPLES.length; i++) {
      s = SAMPLES[i];
      if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
    }
    c.stroke();
    c.setLineDash([]);

    // waypoint marks
    for (i = 0; i < Content.WAYPOINTS.length; i++) {
      var wp = Content.WAYPOINTS[i], q = at(wp.km);
      if (!inRect(q.x, q.y, 16)) continue;
      mark(c, wp.kind, q.x, q.y, ink);
    }
  }

  var BIG = { town: 1, city: 1, harbour: 1 };
  function mark(c, kind, x, y, ink) {
    c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 1.3;
    if (BIG[kind]) {
      c.beginPath(); c.arc(x, y, 5.4, 0, 6.2832); c.stroke();
      c.beginPath(); c.arc(x, y, 2.4, 0, 6.2832); c.fill();
    } else if (kind === 'gate' || kind === 'pass' || kind === 'summit') {
      c.beginPath(); c.moveTo(x - 4.6, y + 3); c.lineTo(x, y - 3.4); c.lineTo(x + 4.6, y + 3); c.stroke();
    } else if (kind === 'tower' || kind === 'lighthouse' || kind === 'mill') {
      c.beginPath(); c.moveTo(x, y + 3.4); c.lineTo(x, y - 4.6); c.stroke();
      c.beginPath(); c.arc(x, y - 5.6, 1.7, 0, 6.2832); c.fill();
    } else {
      c.beginPath(); c.arc(x, y, 2.9, 0, 6.2832); c.fill();
    }
  }

  return {
    SAMPLES: SAMPLES, BOUNDS: BOUNDS, PATH_LEN: PATH_LEN,
    at: at, landRadius: landRadius, landDrift: landDrift, landPath: landPath,
    drawBase: drawBase, glyph: glyph, mark: mark, pathFor: pathFor, rnd: rnd
  };
})();
