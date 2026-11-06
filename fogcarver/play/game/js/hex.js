/*
 * Hex geometry. Pointy-top hexes in axial coordinates (q, r), screen y pointing down.
 * Direction d (0 to 5) runs clockwise from east: E, SE, SW, W, NW, NE; edge d of a hex faces direction d
 * and lies between corners d*60-30 and d*60+30 degrees. The opposite of d is (d + 3) % 6.
 */
(function (root) {
  'use strict';
  var FC = root.FC || (root.FC = {});

  var DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  var SQRT3 = Math.sqrt(3);

  function key(q, r) { return q + ',' + r; }
  function opp(d) { return (d + 3) % 6; }

  /** Centre of hex (q, r) for hexes of size s (centre to corner), origin at hex (0, 0). */
  function center(q, r, s) {
    return { x: s * SQRT3 * (q + r / 2), y: s * 1.5 * r };
  }

  /** Corner k (0 to 5) of a hex at the origin: angle k*60+30 degrees, so edge d lies between corners d-1 and d. */
  function corner(k, s) {
    var a = (k * 60 + 30) * Math.PI / 180;
    return { x: s * Math.cos(a), y: s * Math.sin(a) };
  }

  /** The two corners of edge d, in clockwise order. */
  function edgeCorners(d, s) {
    return [corner((d + 5) % 6, s), corner(d, s)];
  }

  /** Midpoint of edge d of a hex at the origin. */
  function edgeMid(d, s) {
    var a = d * 60 * Math.PI / 180;
    var r = s * SQRT3 / 2;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  }

  /** The nearest hex to a pixel point (x, y) for hexes of size s. */
  function pixelToHex(x, y, s) {
    var q = (SQRT3 / 3 * x - y / 3) / s;
    var r = (2 / 3 * y) / s;
    return roundAxial(q, r);
  }

  function roundAxial(q, r) {
    var x = q, z = r, y = -x - z;
    var rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    var dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy <= dz) rz = -rx - ry;
    return { q: rx + 0, r: rz + 0 };
  }

  function distance(a, b) {
    var dq = a[0] - b[0], dr = a[1] - b[1];
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }

  /** Turn a cell 60 degrees clockwise about the origin, n times. */
  function rotateCell(c, n) {
    var q = c[0], r = c[1];
    n = ((n % 6) + 6) % 6;
    for (var i = 0; i < n; i++) {
      var nq = 0 - r, nr = q + r;
      q = nq; r = nr;
    }
    return [q, r];
  }

  /** Mirror a cell left to right (x becomes -x). Direction d becomes (3 - d) mod 6. */
  function mirrorCell(c) {
    return [0 - c[0] - c[1], c[1]];
  }

  /** Width in hex columns and height in rows of a set of cells, and the offsets that centre it. */
  function bounds(cells) {
    var minX = Infinity, maxX = -Infinity, minR = Infinity, maxR = -Infinity;
    for (var i = 0; i < cells.length; i++) {
      var x = cells[i][0] + cells[i][1] / 2;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (cells[i][1] < minR) minR = cells[i][1];
      if (cells[i][1] > maxR) maxR = cells[i][1];
    }
    return { minX: minX, maxX: maxX, minR: minR, maxR: maxR, cols: maxX - minX + 1, rows: maxR - minR + 1 };
  }

  var api = {
    DIRS: DIRS, SQRT3: SQRT3, key: key, opp: opp, center: center, corner: corner, edgeCorners: edgeCorners,
    edgeMid: edgeMid, pixelToHex: pixelToHex, distance: distance, rotateCell: rotateCell, mirrorCell: mirrorCell,
    bounds: bounds
  };
  FC.hex = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
