/*
 * The computer's players, the 30 ladder rungs and the quick overs. Every player is fictional: a style
 * and a shirt number, never a name of a real cricketer, team or league.
 *
 * Batter bias: where he likes to hit, [long off, cover, third man, fine leg, midwicket, long on, block].
 * Bowler bias: what he likes to bowl, [yorker, wide yorker, slower ball, bouncer], with his own field.
 * read: how much the over so far moves him (0 to 3). field: how much open zones pull a batter (1 to 3).
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.SS = root.SS || {}).scenarios = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BATTERS = [
    { id: 'slogger', shirt: 7, bias: [10, 8, 6, 14, 26, 24, 4], read: 3, field: 2 },
    { id: 'cutter', shirt: 11, bias: [14, 28, 24, 6, 8, 8, 6], read: 3, field: 2 },
    { id: 'scooper', shirt: 23, bias: [6, 8, 24, 30, 10, 6, 6], read: 3, field: 2 },
    { id: 'straight', shirt: 4, bias: [24, 12, 6, 6, 14, 26, 4], read: 3, field: 2 },
    { id: 'nudger', shirt: 18, bias: [12, 14, 12, 12, 14, 12, 24], read: 3, field: 2 },
    { id: 'finisher', shirt: 9, bias: [14, 14, 12, 14, 16, 14, 6], read: 3, field: 3 }
  ];

  var BOWLERS = [
    { id: 'yorkers', shirt: 31, bias: [34, 14, 8, 6], read: 1, shape: 1 },
    { id: 'wide', shirt: 15, bias: [10, 34, 10, 8], read: 1, shape: 2 },
    { id: 'slower', shirt: 27, bias: [8, 8, 34, 12], read: 2, shape: 3 },
    { id: 'bouncer', shirt: 5, bias: [8, 6, 12, 34], read: 2, shape: 4 },
    { id: 'death', shirt: 99, bias: [20, 16, 18, 12], read: 3, shape: 0 },
    { id: 'mixer', shirt: 44, bias: [14, 14, 14, 14], read: 3, shape: 5 }
  ];

  // The ladder: D = Defend (you bowl), C = Chase (you bat). [mode, target, wickets, player].
  // Rungs 1 to 6 teach, 7 to 20 climb, 21 to 30 are hard; measured per rung in GAME-DESIGN.md section 9.
  var LADDER = [
    ['D', 20, 3, 0], ['C', 6, 3, 0], ['D', 16, 2, 3], ['C', 7, 3, 1], ['D', 15, 2, 1], ['C', 7, 2, 2],
    ['D', 13, 2, 2], ['C', 8, 2, 3], ['D', 12, 2, 0], ['C', 8, 2, 0], ['D', 11, 2, 3], ['C', 9, 3, 1],
    ['D', 11, 2, 4], ['C', 8, 2, 4], ['D', 10, 2, 1], ['C', 9, 2, 2], ['D', 10, 2, 2], ['C', 8, 2, 5],
    ['D', 10, 2, 5], ['C', 10, 3, 3], ['D', 9, 3, 0], ['C', 10, 2, 0], ['D', 8, 2, 4], ['C', 10, 3, 4],
    ['D', 8, 3, 3], ['C', 11, 2, 1], ['D', 7, 2, 5], ['C', 10, 2, 5], ['D', 7, 3, 1], ['C', 12, 3, 4]
  ];

  function rung(i) {
    var r = LADDER[i];
    if (!r) return null;
    return { kind: 'ladder', rung: i, mode: r[0] === 'D' ? 'defend' : 'chase', target: r[1], wickets: r[2], player: r[3] };
  }

  /** A quick over: Defend or Chase with a target from the seed. */
  function quick(mode, seed) {
    var s = seed >>> 0;
    var player = s % 6;
    var target = mode === 'defend' ? 9 + ((s >>> 3) % 6) : 7 + ((s >>> 3) % 6);
    return { kind: 'quick', mode: mode, target: target, wickets: 2, player: player, seed: s };
  }

  /** Stars for a finished solo over: 0 for a loss, then the rules in GAME-DESIGN.md section 2. */
  function stars(mode, o) {
    if (mode === 'defend') {
      if (o.result !== 'bowling') return 0;
      var s = 1;
      if (o.out > 0) s = 2;
      if (o.out > 0 && o.runs * 2 <= o.target) s = 3;
      return s;
    }
    if (o.result !== 'batting') return 0;
    var spare = 6 - o.legal;
    if (spare >= 1 && o.out === 0) return 3;
    if (spare >= 1) return 2;
    return 1;
  }

  return { BATTERS: BATTERS, BOWLERS: BOWLERS, LADDER: LADDER, rung: rung, quick: quick, stars: stars };
});
