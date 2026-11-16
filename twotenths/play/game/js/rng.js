/*
 * Seeded randomness (Butterline's and Linesaw's approach). Every random choice a race or a Rush rung
 * makes comes from here with integer maths only, so the same seed gives the same lights, calls and stops
 * on every device and in every browser. The renderer's sparks use their own generator.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.TT = root.TT || {}).rng = m;
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
      shuffle: function (list) {
        var out = list.slice();
        for (var i = out.length - 1; i > 0; i--) {
          var j = Math.floor(next() * (i + 1));
          var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
        }
        return out;
      }
    };
  }

  return { hashString: hashString, mix32: mix32, make: make };
});
