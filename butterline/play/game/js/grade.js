/*
 * Touchdown grading and scoring. Thresholds are in GAME-DESIGN.md section 5.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).grade = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BUTTER_FPM = 60;
  var HARD_FPM = 360;
  var FPM_PER_MS = 196.850394;
  var FAILS = ['hard', 'bounce', 'stall', 'short', 'overrun', 'missed'];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /** The touchdown stamp from the sink rate alone (bounce, stall, short and overrun come from the sim). */
  function classify(fpm) {
    if (fpm < BUTTER_FPM) return 'butter';
    if (fpm < HARD_FPM) return 'firm';
    return 'hard';
  }

  function isClean(stamp) {
    return stamp === 'butter' || stamp === 'firm';
  }

  /** 0 to 100: up to 70 for the sink rate, up to 30 for the distance from the aim point. */
  function score(stamp, fpm, dxAim, runwayLength) {
    if (!isClean(stamp)) return 0;
    var sink = 70 * clamp(1 - (fpm - 30) / 330, 0, 1);
    var aim = 30 * clamp(1 - Math.abs(dxAim) / (0.12 * runwayLength), 0, 1);
    return Math.round(sink + aim);
  }

  function fpmFromMs(ms) {
    return Math.max(0, Math.round(ms * FPM_PER_MS));
  }

  return {
    BUTTER_FPM: BUTTER_FPM,
    HARD_FPM: HARD_FPM,
    FPM_PER_MS: FPM_PER_MS,
    FAILS: FAILS,
    classify: classify,
    isClean: isClean,
    score: score,
    fpmFromMs: fpmFromMs
  };
});
