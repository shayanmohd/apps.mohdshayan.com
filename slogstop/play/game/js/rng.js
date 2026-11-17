/*
 * Seeded randomness for Slogstop. Every random draw in an over (the computer's pick, a yorker slipping
 * into a full toss, the outcome of a ball) comes from here with integer maths only, so the same seed and
 * the same choices give the same over on Android and the web. Effects (sparks, crowd flashes) use their
 * own unseeded generator in the renderer.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.SS = root.SS || {}).rng = m;
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

  /** A seed for one ball and one purpose: the same (seed, ball, salt) always gives the same number. */
  function derive(seed, ball, salt) {
    var h = mix32((seed >>> 0) ^ Math.imul((ball | 0) + 1, 0x9e3779b1));
    return mix32(h ^ Math.imul((salt | 0) + 7, 0x85ebca6b));
  }

  /** An integer in [0, n) from a 32-bit value, by multiply and shift (no modulo bias worth noting). */
  function below(u32, n) {
    // (u32 * n) / 2^32 without leaving the safe integer range.
    return Math.floor((u32 >>> 0) / 4294967296 * n);
  }

  /** mulberry32: small, fast and identical in every JS engine. */
  function make(seed) {
    var a = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x2545f491;
    function u32() {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    }
    return {
      u32: u32,
      next: function () { return u32() / 4294967296; },
      int: function (n) { return below(u32(), n); },
      state: function () { return a; }
    };
  }

  /** A fresh 31-bit seed for an over that is not a daily or a shared one. */
  function freshSeed() {
    var v = 0;
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        var b = new Uint32Array(1);
        crypto.getRandomValues(b);
        v = b[0];
      }
    } catch (e) { v = 0; }
    if (!v) v = Math.floor(Math.random() * 2147483647);
    return (v & 0x7fffffff) || 1;
  }

  return { hashString: hashString, mix32: mix32, derive: derive, below: below, make: make, freshSeed: freshSeed };
});
