/*
 * Seeded integer randomness (mulberry32) and a string hash. The same seed gives the same numbers in
 * every JavaScript engine, so generated content and per-tile ink jitter are identical everywhere.
 */
(function (root) {
  'use strict';
  var FC = root.FC || (root.FC = {});

  /** A 32-bit FNV-1a hash of a string. */
  function hash(str) {
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /** A generator returning floats in [0, 1). */
  function make(seed) {
    var a = seed >>> 0;
    function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      /** An integer in [0, n). */
      int: function (n) { return Math.floor(next() * n); },
      /** A float in [a, b). */
      range: function (lo, hi) { return lo + next() * (hi - lo); },
      /** An index picked by weight. */
      pick: function (weights) {
        var total = 0;
        for (var i = 0; i < weights.length; i++) total += weights[i];
        var x = next() * total;
        for (var j = 0; j < weights.length; j++) {
          x -= weights[j];
          if (x < 0) return j;
        }
        return weights.length - 1;
      },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(next() * (i + 1));
          var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      }
    };
  }

  var api = { hash: hash, make: make };
  FC.rng = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
