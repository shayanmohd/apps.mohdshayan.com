/*
 * Lampcourt's one light rule. A courtyard is a grid of cells:
 *
 *   .  floor    light passes, a lantern may stand, counts when lit
 *   a  arch     the same as floor (an opening in a wall, drawn with an arc)
 *   o  column   a round pier: blocks a segment that passes within 0.4 cells of its centre
 *   #  wall     blocks a segment that passes through the inside of the cell
 *   +  lattice  passes light, but each screen crossed doubles the cost of distance
 *
 * A floor or arch cell T is lit by a lantern on cell L when the segment between the two cell centres
 * meets no wall inside and no column disc, and (dx*dx + dy*dy) * 2^k <= REACH2, where k is the number
 * of lattice cells the segment passes through: an open lantern reaches about 3.2 cells, through one
 * screen about 2.2, through two about 1.6 (so a cell beyond two screens is never lit). Every test is integer arithmetic on doubled
 * coordinates (cell x spans 2x..2x+2, its centre is 2x+1), so Node, Chrome and the WebView agree.
 */
(function (root) {
  'use strict';
  var LC = root.LC || (root.LC = {});

  var FLOOR = 0, ARCH = 1, COLUMN = 2, WALL = 3, LATTICE = 4;
  var CHARS = '.ao#+';
  var REACH2 = 10;
  // Column disc radius 0.4 cells = 0.8 doubled units: blocked when cross^2 / len^2 < 0.64 = 16 / 25.
  var COL_NUM = 16, COL_DEN = 25;

  function parse(rows) {
    if (typeof rows === 'string') rows = rows.split('/');
    var h = rows.length;
    var w = rows[0].length;
    var cells = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      if (rows[y].length !== w) throw new Error('ragged plan row ' + y);
      for (var x = 0; x < w; x++) {
        var c = CHARS.indexOf(rows[y].charAt(x));
        if (c < 0) throw new Error('bad plan cell ' + rows[y].charAt(x));
        cells[y * w + x] = c;
      }
    }
    return { w: w, h: h, cells: cells };
  }

  function format(plan) {
    var rows = [];
    for (var y = 0; y < plan.h; y++) {
      var s = '';
      for (var x = 0; x < plan.w; x++) s += CHARS.charAt(plan.cells[y * plan.w + x]);
      rows.push(s);
    }
    return rows.join('/');
  }

  function isOpen(code) { return code === FLOOR || code === ARCH; }

  /**
   * How a segment from the centre of (ax, ay) to the centre of (bx, by) fares: -1 when a wall or a
   * column blocks it, otherwise the number of lattice cells it passes through.
   */
  function trace(plan, ax, ay, bx, by) {
    var w = plan.w, cells = plan.cells;
    var px = 2 * ax + 1, py = 2 * ay + 1;
    var dx = 2 * (bx - ax), dy = 2 * (by - ay);
    var len2 = dx * dx + dy * dy;
    var x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
    var y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    var screens = 0;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if ((x === ax && y === ay) || (x === bx && y === by)) continue;
        var c = cells[y * w + x];
        if (c === FLOOR || c === ARCH) continue;
        if (c === COLUMN) {
          var wx = 2 * x + 1 - px, wy = 2 * y + 1 - py;
          var cross = dx * wy - dy * wx;
          var dot = dx * wx + dy * wy;
          if (dot > 0 && dot < len2 && cross * cross * COL_DEN < COL_NUM * len2) return -1;
          continue;
        }
        // A square cell: inside a cell of the bounding box exactly when its corners lie strictly on
        // both sides of the segment's line (separating axis test; the box axes always overlap here).
        var cx = 2 * x - px, cy = 2 * y - py;
        var a = dx * cy - dy * cx;
        var b = dx * cy - dy * (cx + 2);
        var d = dx * (cy + 2) - dy * cx;
        var e = dx * (cy + 2) - dy * (cx + 2);
        var lo = Math.min(a, b, d, e), hi = Math.max(a, b, d, e);
        if (lo < 0 && hi > 0) {
          if (c === WALL) return -1;
          screens++;
        }
      }
    }
    return screens;
  }

  function lights(plan, ax, ay, bx, by) {
    var ddx = bx - ax, ddy = by - ay;
    var d2 = ddx * ddx + ddy * ddy;
    if (d2 > REACH2) return false;
    if (d2 === 0) return true;
    var k = trace(plan, ax, ay, bx, by);
    if (k < 0) return false;
    return d2 * Math.pow(2, k) <= REACH2;
  }

  /**
   * The model the game and the solver share: the open cells, and for each one the bit set of open
   * cells a lantern there lights (words of 32 bits over all cell indices).
   */
  function build(plan) {
    var w = plan.w, h = plan.h, n = w * h;
    var words = (n + 31) >>> 5;
    var open = [];
    var slot = new Int32Array(n).fill(-1);
    for (var i = 0; i < n; i++) {
      if (isOpen(plan.cells[i])) { slot[i] = open.length; open.push(i); }
    }
    var vis = new Uint32Array(open.length * words);
    var solo = new Int32Array(open.length);
    var reach = Math.floor(Math.sqrt(REACH2));
    for (var s = 0; s < open.length; s++) {
      var ax = open[s] % w, ay = (open[s] / w) | 0;
      var count = 0;
      for (var y = Math.max(0, ay - reach); y <= Math.min(h - 1, ay + reach); y++) {
        for (var x = Math.max(0, ax - reach); x <= Math.min(w - 1, ax + reach); x++) {
          var t = y * w + x;
          if (!isOpen(plan.cells[t])) continue;
          if (lights(plan, ax, ay, x, y)) {
            vis[s * words + (t >>> 5)] |= (1 << (t & 31));
            count++;
          }
        }
      }
      solo[s] = count;
    }
    return { plan: plan, w: w, h: h, n: n, words: words, open: open, slot: slot, vis: vis, solo: solo };
  }

  function popcount(v) {
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    return (Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24);
  }

  /** The lit bit set for lanterns on the given cell indices (cells that are not open are ignored). */
  function litBits(model, cellsList) {
    var out = new Uint32Array(model.words);
    for (var i = 0; i < cellsList.length; i++) {
      var s = cellsList[i] == null ? -1 : model.slot[cellsList[i]];
      if (s < 0) continue;
      var base = s * model.words;
      for (var k = 0; k < model.words; k++) out[k] |= model.vis[base + k];
    }
    return out;
  }

  function countBits(bits) {
    var c = 0;
    for (var k = 0; k < bits.length; k++) c += popcount(bits[k]);
    return c;
  }

  function count(model, cellsList) { return countBits(litBits(model, cellsList)); }

  function isLit(bits, cell) { return (bits[cell >>> 5] & (1 << (cell & 31))) !== 0; }

  function openCount(model) { return model.open.length; }

  var api = {
    FLOOR: FLOOR, ARCH: ARCH, COLUMN: COLUMN, WALL: WALL, LATTICE: LATTICE, CHARS: CHARS, REACH2: REACH2,
    parse: parse, format: format, isOpen: isOpen, trace: trace, lights: lights, build: build,
    popcount: popcount, litBits: litBits, countBits: countBits, count: count, isLit: isLit,
    openCount: openCount
  };
  LC.light = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
