/*
 * The one rule set of Slogstop, shared by the duel, Defend, Chase, the ladder, the Daily Last Over, the
 * offline solver and the tests. Integer tables only, so every device resolves a ball the same way.
 *
 * A ball is two hidden picks against a public field:
 *   the bowler picks a delivery (yorker, wide yorker, slower ball, bouncer);
 *   the batter picks one of six scoring zones or a block.
 * Each delivery leaves three zones open and shuts the other three (OPEN below). A shot into an open zone
 * is middled and the field decides how far it goes (the zone's cover: no fielder, a ring fielder, a deep
 * fielder or both). A shot into a shut zone is beaten: mostly dots, a fifth of them out. A block never
 * gets out and scores a single about half the time. Yorkers slip into a full toss one ball in twelve,
 * and a full toss opens every zone.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.SS = root.SS || {}).model = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Zones clockwise from straight down the ground on the off side, for a right-handed batter facing up
  // the screen (the off side is on his right). Angle in degrees from straight, positive to the off side.
  var ZONES = [
    { id: 'loff', angle: 30 },   // long off
    { id: 'cover', angle: 90 },  // cover and point
    { id: 'third', angle: 150 }, // third man
    { id: 'fine', angle: -150 }, // fine leg
    { id: 'mid', angle: -90 },   // midwicket and square leg
    { id: 'lon', angle: -30 }    // long on
  ];
  var NZ = 6;
  var BLOCK = 6; // the batter's seventh pick

  var DELIVERIES = ['yorker', 'wide', 'slower', 'bouncer'];
  var ND = 4;
  var FULL_TOSS = 4; // what a slipped yorker becomes

  // OPEN[d][z]: 1 when delivery d leaves zone z open.
  //   yorker: the leg side (flick fine, whip through midwicket, dig it down to long on)
  //   wide yorker: the off side (drive, slice to cover, steer to third man)
  //   slower ball: in front (wait for it and hit straight or through cover)
  //   bouncer: square and behind (upper cut to third man, hook fine, pull to midwicket)
  var OPEN = [
    [0, 0, 0, 1, 1, 1],
    [1, 1, 1, 0, 0, 0],
    [1, 1, 0, 0, 0, 1],
    [0, 0, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1] // full toss
  ];

  // A yorker or wide yorker slips into a full toss SLIP in SLIP_OF balls.
  var SLIP_OF = 1200;
  var SLIP = [100, 100, 0, 0];

  // Outcomes, in this order everywhere: out, dot, 1, 2, 4, 6.
  var W = 0, DOT = 1;
  var RUNS = [0, 0, 1, 2, 4, 6];
  var SYMBOL = ['W', '.', '1', '2', '4', '6'];

  // Cover classes of a zone: 0 open (no fielder), 1 ring fielder, 2 deep fielder, 3 both.
  var OPEN_C = 0, RING_C = 1, DEEP_C = 2, BOTH_C = 3;

  // Percent rows [W, 0, 1, 2, 4, 6].
  var MIDDLED = [
    [0, 0, 5, 10, 35, 50],  // open: boundary 85
    [5, 5, 25, 5, 25, 35],  // ring: boundary 60, the ring fielder takes the odd catch
    [8, 0, 25, 27, 20, 20], // deep: boundary 40, caught in the deep 8
    [8, 7, 35, 25, 12, 13]  // both: boundary 25
  ];
  // Beaten, by delivery: the yorker hits the stumps most, the bouncer and wide yorker take the edge.
  var BEATEN = [
    [22, 58, 15, 0, 5, 0], // yorker: bowled or LBW
    [14, 60, 18, 0, 8, 0], // wide yorker: edged
    [18, 57, 18, 0, 7, 0], // slower ball: mistimed and caught
    [14, 60, 17, 0, 9, 0], // bouncer: top edged
    [0, 0, 0, 0, 0, 0]     // full toss: never beaten
  ];
  var BLOCKED = [0, 55, 45, 0, 0, 0];

  // ---- the field ----

  // Twelve places: 0 to 5 on the ring in zone order, 6 to 11 on the boundary. Nine fielders (the bowler
  // and the keeper are not placed), at most five outside the ring (the T20 limit at the death).
  var FIELDERS = 9;
  var MAX_DEEP = 5;
  function slotZone(s) { return s % NZ; }
  function slotDeep(s) { return s >= NZ; }

  // Six shapes, each a list of nine places. Ring r(z) = z, deep d(z) = 6 + z.
  var r = function (z) { return z; };
  var dp = function (z) { return NZ + z; };
  var Z = { loff: 0, cover: 1, third: 2, fine: 3, mid: 4, lon: 5 };
  var SHAPES = [
    // death: five on the rope, third man left to the ring
    { id: 'death', slots: [dp(Z.loff), dp(Z.cover), dp(Z.fine), dp(Z.mid), dp(Z.lon), r(Z.cover), r(Z.third), r(Z.mid), r(Z.lon)] },
    // leg side: for yorkers
    { id: 'leg', slots: [dp(Z.fine), dp(Z.mid), dp(Z.lon), dp(Z.third), r(Z.fine), r(Z.mid), r(Z.lon), r(Z.cover), r(Z.loff)] },
    // off side: for wide yorkers
    { id: 'off', slots: [dp(Z.loff), dp(Z.cover), dp(Z.third), dp(Z.fine), r(Z.loff), r(Z.cover), r(Z.third), r(Z.mid), r(Z.lon)] },
    // in front: for slower balls
    { id: 'front', slots: [dp(Z.loff), dp(Z.cover), dp(Z.lon), dp(Z.mid), r(Z.loff), r(Z.cover), r(Z.lon), r(Z.third), r(Z.fine)] },
    // behind: for bouncers
    { id: 'behind', slots: [dp(Z.third), dp(Z.fine), dp(Z.mid), dp(Z.cover), r(Z.third), r(Z.fine), r(Z.mid), r(Z.loff), r(Z.lon)] },
    // straight: five on the rope, fine leg left to the ring
    { id: 'straight', slots: [dp(Z.loff), dp(Z.lon), dp(Z.cover), dp(Z.mid), dp(Z.third), r(Z.loff), r(Z.lon), r(Z.fine), r(Z.cover)] }
  ];

  /** A field from a shape and an optional single move { from, to } (places). Never invalid. */
  function makeField(shapeIndex, move) {
    var shape = SHAPES[shapeIndex] || SHAPES[0];
    var slots = shape.slots.slice();
    if (move && canMove(slots, move.from, move.to)) {
      slots[slots.indexOf(move.from)] = move.to;
    }
    return { shape: shape === SHAPES[shapeIndex] ? shapeIndex : 0, move: move && canMove(shape.slots, move.from, move.to) ? { from: move.from, to: move.to } : null, slots: slots };
  }

  function deepCount(slots) {
    var n = 0;
    for (var i = 0; i < slots.length; i++) if (slotDeep(slots[i])) n++;
    return n;
  }

  /** Whether a fielder at place [from] may go to the empty place [to] within the five-out limit. */
  function canMove(slots, from, to) {
    if (from === to || !(from >= 0 && from < 12) || !(to >= 0 && to < 12)) return false;
    if (slots.indexOf(from) < 0 || slots.indexOf(to) >= 0) return false;
    var deep = deepCount(slots) - (slotDeep(from) ? 1 : 0) + (slotDeep(to) ? 1 : 0);
    return deep <= MAX_DEEP;
  }

  function validSlots(slots) {
    if (!Array.isArray(slots) || slots.length !== FIELDERS) return false;
    var seen = {};
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (!(s >= 0 && s < 12) || (s | 0) !== s || seen[s]) return false;
      seen[s] = true;
    }
    return deepCount(slots) <= MAX_DEEP;
  }

  /** The cover class of each zone for a list of places. */
  function covers(slots) {
    var c = [0, 0, 0, 0, 0, 0];
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      c[slotZone(s)] |= slotDeep(s) ? 2 : 1;
    }
    return c;
  }

  // ---- one ball ----

  /** The percent row for a non-slipped delivery or a full toss against a pick. */
  function row(d, pick, cover) {
    if (pick === BLOCK) return BLOCKED;
    if (!OPEN[d][pick]) return BEATEN[d];
    return MIDDLED[cover[pick]];
  }

  /**
   * The exact chances of each outcome, as integers out of TOTAL (120000): delivery d (0 to 3), pick
   * (zone 0 to 5 or BLOCK), the zones' covers, and flags: freeHit (an out counts as a dot), noBall (a
   * late bowler: the ball comes as a full toss).
   */
  var TOTAL = 100 * SLIP_OF;
  function dist(d, pick, cover, flags) {
    flags = flags || {};
    var out = [0, 0, 0, 0, 0, 0];
    var slip = flags.noBall ? SLIP_OF : SLIP[d];
    var a = row(flags.noBall ? FULL_TOSS : d, pick, cover);
    var b = row(FULL_TOSS, pick, cover);
    for (var k = 0; k < 6; k++) out[k] = a[k] * (SLIP_OF - slip) + b[k] * slip;
    if (flags.freeHit || flags.noBall) {
      out[DOT] += out[W];
      out[W] = 0;
    }
    return out;
  }

  /** Picks from a percent row with a 32-bit draw. */
  function fromRow(rowPct, u32) {
    var x = Math.floor((u32 >>> 0) / 4294967296 * 100);
    var acc = 0;
    for (var k = 0; k < 6; k++) {
      acc += rowPct[k];
      if (x < acc) return k;
    }
    return 5;
  }

  /**
   * Resolves one ball with two 32-bit draws: uSlip decides a slipped yorker, uOut the outcome. Returns
   * { outcome, slip }. Matches dist() exactly: P(slip) = SLIP/SLIP_OF, then the row.
   */
  function resolve(d, pick, cover, flags, uSlip, uOut) {
    flags = flags || {};
    var slip = flags.noBall || Math.floor((uSlip >>> 0) / 4294967296 * SLIP_OF) < SLIP[d];
    var rr = row(slip ? FULL_TOSS : d, pick, cover);
    var o = fromRow(rr, uOut);
    if (o === W && (flags.freeHit || flags.noBall)) o = DOT;
    return { outcome: o, slip: !!(slip && !flags.noBall), fullToss: !!slip };
  }

  /** Expected runs (times TOTAL) and chances of out and of a boundary, from a dist. */
  function summary(dd) {
    var runs = 0;
    for (var k = 0; k < 6; k++) runs += dd[k] * RUNS[k];
    return { runs: runs / TOTAL, out: dd[W] / TOTAL, boundary: (dd[4] + dd[5]) / TOTAL, dot: dd[DOT] / TOTAL };
  }

  /** Mixes dists by integer weights: sum over i of w[i] * dists[i], normalised to TOTAL (floats). */
  function mix(weights, dists) {
    var sum = 0;
    for (var i = 0; i < weights.length; i++) sum += weights[i];
    var out = [0, 0, 0, 0, 0, 0];
    if (!sum) return out;
    for (var j = 0; j < weights.length; j++) {
      if (!weights[j]) continue;
      for (var k = 0; k < 6; k++) out[k] += weights[j] * dists[j][k] / sum;
    }
    return out;
  }

  return {
    ZONES: ZONES, NZ: NZ, BLOCK: BLOCK, DELIVERIES: DELIVERIES, ND: ND, FULL_TOSS: FULL_TOSS,
    OPEN: OPEN, SLIP: SLIP, SLIP_OF: SLIP_OF, RUNS: RUNS, SYMBOL: SYMBOL, W: W, DOT: DOT,
    MIDDLED: MIDDLED, BEATEN: BEATEN, BLOCKED: BLOCKED, TOTAL: TOTAL,
    OPEN_C: OPEN_C, RING_C: RING_C, DEEP_C: DEEP_C, BOTH_C: BOTH_C,
    FIELDERS: FIELDERS, MAX_DEEP: MAX_DEEP, SHAPES: SHAPES, slotZone: slotZone, slotDeep: slotDeep,
    makeField: makeField, canMove: canMove, validSlots: validSlots, deepCount: deepCount, covers: covers,
    row: row, dist: dist, resolve: resolve, summary: summary, mix: mix, fromRow: fromRow
  };
});
