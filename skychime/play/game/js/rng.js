/*
 * Seeded randomness for Skychime. Integer arithmetic only (Math.imul, shifts), so a seed gives the same
 * numbers in every JavaScript engine. Nothing in the game's model calls Math.random.
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};

  /** 32-bit FNV-1a over a string, or over the decimal text of a number. */
  function hash32(value) {
    var text = String(value);
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** Mixes two 32-bit values into one (for per-volley and per-shell seeds). */
  function mix(a, b) {
    var h = Math.imul((a >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ (b >>> 0);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }

  /** sfc32: small, fast and well tested. Returns an object with float, int, range, pick, chance. */
  function create(seed) {
    var a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = seed >>> 0;
    function next() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return t >>> 0;
    }
    for (var i = 0; i < 12; i++) next(); // warm up so close seeds diverge
    var r = {
      u32: next,
      /** [0, 1) with 32 bits of resolution. */
      float: function () { return next() / 4294967296; },
      /** integer in [0, n) */
      int: function (n) { return Math.floor((next() / 4294967296) * n); },
      range: function (lo, hi) { return lo + (hi - lo) * (next() / 4294967296); },
      pick: function (list) { return list[Math.floor((next() / 4294967296) * list.length)]; },
      chance: function (p) { return next() / 4294967296 < p; }
    };
    return r;
  }

  var api = { hash32: hash32, mix: mix, create: create };
  Sky.rng = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
