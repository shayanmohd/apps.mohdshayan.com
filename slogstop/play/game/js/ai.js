/*
 * The computer's batters and bowlers. Integer maths only, so a seeded over plays the same everywhere.
 *
 * A batter has a bias per zone (where he likes to hit) and reads two things: the field (open zones are
 * worth more) and the deliveries already bowled this over (he expects more of the same). Its pick for a
 * ball is drawn from integer weights, and those weights are what the Defend screen shows as the heat map,
 * so the odds on screen are the real ones.
 *
 * A bowler has a bias per delivery and reads the zones the batter has gone to this over. Its weights are
 * what the Chase screen shows as its plan.
 */
(function (root, factory) {
  var m = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.SS = root.SS || {}).ai = m;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var model = typeof module === 'object' && module.exports ? require('./model.js') : root.SS.model;
  var ND = model.ND, NZ = model.NZ, BLOCK = model.BLOCK, RUNS = model.RUNS, W = model.W;
  var PER = model.TOTAL / 100; // dist units per percent

  /** Centi-runs and percent out of a dist, as integers. */
  function runs100(dd) {
    var s = 0;
    for (var k = 0; k < 6; k++) s += dd[k] * RUNS[k];
    return Math.floor(s * 100 / model.TOTAL);
  }
  function outPct(dd) { return Math.floor(dd[W] / PER); }

  /** How much a wicket costs the batter, in centi-runs per percent of out chance. */
  function wicketCost(need, ballsLeft, wicketsLeft) {
    var rate = ballsLeft > 0 ? Math.floor(need * 100 / ballsLeft) : 999;
    var cost = wicketsLeft <= 1 ? 9 : 4;
    if (rate <= 100) cost += 6;      // a run a ball or less: no need to take risks
    if (rate >= 350) cost = 1;       // must hit boundaries: risk is the price
    return cost;
  }

  /**
   * The batter's weights for the next ball: an array of 7 integers (6 zones, then block).
   * p: { bias: [7 ints], read: 0..3, field: 1..2 }
   * c: { cover, need, ballsLeft, wicketsLeft, bowled: [deliveries so far this over], freeHit, last }
   */
  function batterWeights(p, c) {
    var belief = [];
    var C = 0;
    for (var d = 0; d < ND; d++) {
      var n = 0;
      for (var i = 0; i < c.bowled.length; i++) if (c.bowled[i] === d) n++;
      belief[d] = 4 + 3 * p.read * n;
      C += belief[d];
    }
    var cost = c.freeHit ? 0 : wicketCost(c.need, c.ballsLeft, c.wicketsLeft);
    var rate = c.ballsLeft > 0 ? Math.floor(c.need * 100 / c.ballsLeft) : 999;
    var w = [];
    for (var z = 0; z < NZ; z++) {
      var v = 0, o = 0;
      for (var dd = 0; dd < ND; dd++) {
        var dist = model.dist(dd, z, c.cover, { freeHit: c.freeHit });
        v += belief[dd] * runs100(dist);
        o += belief[dd] * outPct(dist);
      }
      v = Math.floor(v / C);
      o = Math.floor(o / C);
      var u = Math.max(4, v - cost * o);
      w[z] = p.bias[z] * pow(u, p.field);
    }
    // A block scores about half a run and is never out: worth it when the runs needed are few.
    var ub = rate <= 60 ? 140 : rate <= 100 ? 70 : rate >= 250 ? 4 : 30;
    w[BLOCK] = p.bias[BLOCK] * pow(ub, p.field);
    return scale(w);
  }

  /**
   * The bowler's weights for the next ball: an array of 4 integers.
   * p: { bias: [4 ints], read: 0..3 }
   * c: { cover, picks: [batter picks so far this over], need, ballsLeft, wicketsLeft, freeHit, last }
   */
  function bowlerWeights(p, c) {
    var expect = [];
    var E = 0;
    for (var z = 0; z <= BLOCK; z++) {
      var n = 0;
      for (var i = 0; i < c.picks.length; i++) if (c.picks[i] === z) n++;
      expect[z] = (z === BLOCK ? 2 : 4) + 3 * p.read * n;
      E += expect[z];
    }
    var w = [];
    for (var d = 0; d < ND; d++) {
      var v = 0, o = 0;
      for (var zz = 0; zz <= BLOCK; zz++) {
        var dist = model.dist(d, zz, c.cover, { freeHit: c.freeHit });
        v += expect[zz] * runs100(dist);
        o += expect[zz] * outPct(dist);
      }
      v = Math.floor(v / E);
      o = Math.floor(o / E);
      // Lower expected runs and more wickets are better for the bowler. The bias counts twice: a
      // specialist leans on his ball, which is what a batter who reads the plan can use.
      var u = Math.max(4, 330 - v + 4 * o);
      w[d] = p.bias[d] * p.bias[d] * u * u;
    }
    return scale(w);
  }

  function pow(u, k) {
    var r = u;
    for (var i = 1; i < k; i++) r *= u;
    return r;
  }

  /** Scales weights down to integers that sum to about 10000, keeping every non-zero weight non-zero. */
  function scale(w) {
    var s = 0;
    for (var i = 0; i < w.length; i++) s += w[i];
    var out = [];
    for (var j = 0; j < w.length; j++) {
      out[j] = s > 0 ? Math.floor(w[j] * 10000 / s) : 0;
      if (w[j] > 0 && out[j] === 0) out[j] = 1;
    }
    return out;
  }

  /** Draws an index from integer weights with a 32-bit value. */
  function draw(weights, u32) {
    var s = 0;
    for (var i = 0; i < weights.length; i++) s += weights[i];
    var x = Math.floor((u32 >>> 0) / 4294967296 * s);
    var acc = 0;
    for (var j = 0; j < weights.length; j++) {
      acc += weights[j];
      if (x < acc) return j;
    }
    return weights.length - 1;
  }

  return { batterWeights: batterWeights, bowlerWeights: bowlerWeights, draw: draw, scale: scale, runs100: runs100, outPct: outPct };
});
