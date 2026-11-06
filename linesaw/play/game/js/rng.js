/*
 * Seeded randomness for Linesaw (Butterline's approach). Every random choice the sky makes (wind, gusts,
 * rival order, every rival decision) comes from here with integer maths only, so the same seed gives the
 * same sky on every device and in every browser. The renderer's sparks use their own generator.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.LS = root.LS || {}).rng = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** A 32-bit hash of a string (FNV-1a with a final avalanche). */
  function hashString(str) {
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return mix32(h);
  }

  function mix32(h) {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /** Hash of a seed and an integer, as a float in [0, 1). */
  function hash01(seed, i) {
    return mix32((seed ^ Math.imul(i | 0, 0x9e3779b1)) >>> 0) / 4294967296;
  }

  /** mulberry32: small, fast and identical in every JS engine (integer maths only). */
  function make(seed) {
    var a = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x2545f491;
    function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      range: function (lo, hi) { return lo + (hi - lo) * next(); },
      int: function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
      chance: function (p) { return next() < p; },
      pick: function (list) { return list[Math.floor(next() * list.length)]; },
      sign: function () { return next() < 0.5 ? -1 : 1; },
      state: function () { return a; }
    };
  }

  function smooth(t) { return t * t * (3 - 2 * t); }

  /** Smooth 1D value noise in [-1, 1]: the same (seed, x) always gives the same value. */
  function noise1(seed, x) {
    var i = Math.floor(x);
    var f = x - i;
    var a = hash01(seed, i) * 2 - 1;
    var b = hash01(seed, i + 1) * 2 - 1;
    return a + (b - a) * smooth(f);
  }

  return { hashString: hashString, mix32: mix32, hash01: hash01, make: make, noise1: noise1 };
});
