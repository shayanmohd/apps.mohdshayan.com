/*
 * The fixed-step clock: real frame time in, a whole number of 1/120 s simulation steps out, plus the
 * fraction left over for render interpolation. The flight therefore behaves the same at 30, 60, 90, 120
 * or 144 frames per second.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).clock = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DT = 1 / 120;
  var MAX_STEPS = 30; // a quarter second: after a long stall the game skips time rather than spiral

  function create() {
    return { acc: 0 };
  }

  /** Adds rdt seconds of real time at the given time scale; returns how many steps to run now. */
  function advance(clock, rdt, scale) {
    clock.acc += rdt * (scale == null ? 1 : scale);
    var n = Math.floor(clock.acc / DT + 1e-9);
    if (n > MAX_STEPS) {
      clock.acc = 0;
      return MAX_STEPS;
    }
    clock.acc = Math.max(0, clock.acc - n * DT);
    return n;
  }

  /** How far the render sits between the last two steps, 0 to 1. */
  function alpha(clock) {
    return Math.min(1, clock.acc / DT);
  }

  function reset(clock) {
    clock.acc = 0;
  }

  return { DT: DT, MAX_STEPS: MAX_STEPS, create: create, advance: advance, alpha: alpha, reset: reset };
});
