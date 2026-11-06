/*
 * Integer-only seeded randomness, so a seed gives the same boards, drafts and AI tie-breaks on every
 * engine (Android WebView, desktop Chrome, Node). Nothing here uses Math.random or floating point state.
 */
(function (root) {
  'use strict';

  /** A 32-bit hash of any number of integers (murmur3 style finaliser). */
  function hash() {
    var h = 0x811c9dc5 | 0;
    for (var i = 0; i < arguments.length; i++) {
      var k = arguments[i] | 0;
      k = Math.imul(k, 0xcc9e2d51);
      k = (k << 15) | (k >>> 17);
      k = Math.imul(k, 0x1b873593);
      h ^= k;
      h = (h << 13) | (h >>> 19);
      h = (Math.imul(h, 5) + 0xe6546b64) | 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /** A seed from a string (for named streams) and integers. */
  function seed(name) {
    var h = 0;
    var s = String(name);
    for (var i = 0; i < s.length; i++) h = hash(h, s.charCodeAt(i));
    for (var j = 1; j < arguments.length; j++) h = hash(h, arguments[j] | 0);
    return h >>> 0;
  }

  /**
   * A generator: r.next() gives a uint32, r.int(n) an integer in [0, n), r.pick(list), r.shuffle(list).
   * mulberry32, integer only.
   */
  function create(s) {
    var state = s >>> 0;
    function next() {
      state = (state + 0x6d2b79f5) | 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    }
    function int(n) {
      return n <= 1 ? 0 : next() % n;
    }
    return {
      next: next,
      int: int,
      pick: function (list) { return list[int(list.length)]; },
      shuffle: function (list) {
        for (var i = list.length - 1; i > 0; i--) {
          var j = int(i + 1);
          var t = list[i]; list[i] = list[j]; list[j] = t;
        }
        return list;
      },
      state: function () { return state >>> 0; }
    };
  }

  var api = { hash: hash, seed: seed, create: create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).rng = api;
})(this);
