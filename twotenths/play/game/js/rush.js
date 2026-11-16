/*
 * Stop Rush: an endless ladder of stops at a rising tempo. Rung k (from 1) fills its rings faster and
 * narrows the clean zone; its target time falls with the tempo and the allowance shrinks. A stop slower
 * than its rung's target, or an unsafe release, ends the run. Each run takes its own seed.
 */
(function (root, factory) {
  var m = factory(root.TT && root.TT.rng ? root.TT.rng : require('./rng.js'),
    root.TT && root.TT.race ? root.TT.race : require('./race.js'));
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.TT = root.TT || {}).rush = m;
})(typeof self !== 'undefined' ? self : this, function (rng, race) {
  'use strict';

  function fillAt(k) {
    return Math.max(0.22, 0.40 - 0.009 * (k - 1));
  }

  function zoneAt(k) {
    return Math.max(0.12, 0.30 - 0.008 * (k - 1));
  }

  function allowance(k) {
    return Math.max(0.20, 1.00 - 0.05 * (k - 1));
  }

  function round2(x) {
    return Math.round(x * 100) / 100;
  }

  /** The stop for rung k of the run with this seed, and its target time. */
  function rung(seed, k) {
    var r = rng.make(rng.mix32((seed ^ Math.imul(k, 0x9e3779b1)) >>> 0));
    var fill = fillAt(k);
    var rivalP = Math.min(0.6, k < 3 ? 0 : 0.30 + 0.015 * (k - 3));
    var hasRival = r.chance(rivalP);
    var cross = k >= 5 && r.chance(0.25) ? r.int(0, 3) : -1;
    var orders = race.ORDERS;
    var order = orders[r.int(0, Math.min(orders.length, 4 + Math.floor(k / 3)) - 1)];
    var first = race.expectedClean(fill) + r.range(-0.30, 0.40);
    var rivals = hasRival ? [Math.round(first * 1000) / 1000] : [];
    if (hasRival && k >= 10 && r.chance(0.35)) rivals.push(Math.round((first + 0.97 + r.range(0, 0.2)) * 1000) / 1000);
    var target = 0.14 + 4 * fill + allowance(k) + (hasRival ? 0.55 * rivals.length : 0) + (cross >= 0 ? 0.25 : 0);
    return {
      k: k, target: round2(target),
      stop: { approach: Math.max(0.8, 1.15 - 0.01 * k), fill: Math.round(fill * 1000) / 1000, zone: Math.round(zoneAt(k) * 1000) / 1000, order: order.slice(), cross: cross, rivals: rivals, wet: Math.floor((k - 1) / 8) % 2 === 1 }
    };
  }

  /** True when a stop clears its rung. */
  function cleared(result, target) {
    return !result.unsafe && result.time <= target + 1e-9;
  }

  var OVERTIME = 0.3;

  /**
   * True when a stop still running can no longer clear its rung: its stopwatch is OVERTIME past the
   * target (a stop's time only grows). The run ends there instead of waiting for a lost stop to finish.
   */
  function lost(watch, target) {
    return watch > target + OVERTIME;
  }

  return { OVERTIME: OVERTIME, fillAt: fillAt, zoneAt: zoneAt, allowance: allowance, rung: rung, cleared: cleared, lost: lost };
});
