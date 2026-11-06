/*
 * Integer seeded randomness, identical in Node, Chrome and the Android WebView: 32 bit integer maths
 * only (Math.imul and unsigned shifts), so a seed always gives the same courtyard and the same lantern.
 */
(function (root) {
  'use strict';
  var LC = root.LC || (root.LC = {});

  /** FNV-1a over the UTF-16 code units, then a final avalanche. Returns an unsigned 32 bit integer. */
  function hash(str) {
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /** mulberry32: a small, fast generator with a full 32 bit state. */
  function make(seed) {
    var s = seed >>> 0;
    function next() {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    }
    return {
      next: next,
      /** An integer in [0, n). */
      int: function (n) { return n > 0 ? next() % n : 0; },
      /** An integer in [a, b]. */
      range: function (a, b) { return a + (b >= a ? next() % (b - a + 1) : 0); },
      /** True with probability num / den. */
      chance: function (num, den) { return next() % den < num; },
      pick: function (arr) { return arr[next() % arr.length]; },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = next() % (i + 1);
          var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
      state: function () { return s; }
    };
  }

  var api = { hash: hash, make: make };
  LC.rng = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
