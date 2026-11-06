/*
 * Seeded randomness for Sherd. Every dig, bedrock layout and vessel is drawn from a seed, so the same
 * seed gives the same content on Android, on the web and in the node tests.
 */
(function (root) {
  'use strict';

  /** A 32-bit FNV-1a hash of a string, finished with a murmur-style mix. */
  function hashString(text) {
    var h = 0x811c9dc5;
    text = String(text);
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return finish(h);
  }

  function finish(h) {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /** Combines any number of integers or strings into one 32-bit seed. */
  function seed() {
    var h = 0x9e3779b9;
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      var x = typeof v === 'number' ? (v | 0) : hashString(v);
      h = finish((h ^ x) + 0x6d2b79f5 + (h << 6) + (h >>> 2));
    }
    return h >>> 0;
  }

  /** mulberry32: small, fast and good enough for puzzles. Returns floats in [0, 1). */
  function create(s) {
    var a = s >>> 0;
    function next() {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    next.int = function (n) { return Math.floor(next() * n); };
    next.range = function (lo, hi) { return lo + next() * (hi - lo); };
    next.pick = function (list) { return list[Math.floor(next() * list.length)]; };
    next.shuffle = function (list) {
      for (var i = list.length - 1; i > 0; i--) {
        var j = Math.floor(next() * (i + 1));
        var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
      }
      return list;
    };
    return next;
  }

  var api = { hashString: hashString, seed: seed, create: create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Sherd = root.Sherd || {}).rng = api;
})(this);
