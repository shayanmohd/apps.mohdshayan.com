/*
 * The rival: a deterministic 2-ply search. For every rival move it assumes the player's best capture in
 * reply and keeps the move that leaves the rival the most material, plus a small king-safety and
 * engagement term, plus a seeded tie-break of at most 7 points (a baidaq is worth 100). The same position
 * and seed always give the same move: integer arithmetic only.
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var rules = node ? require('./rules.js') : root.Pawnfare.rules;
  var rng = node ? require('./rng.js') : root.Pawnfare.rng;
  var pieces = node ? require('./pieces.js') : root.Pawnfare.pieces;

  var PLAYER = rules.PLAYER;
  var RIVAL = rules.RIVAL;
  var WIN = 10000000;

  /** Small positional terms for the rival, after its move. */
  function positional(pos) {
    var W = pos.W;
    var owner = pos.owner;
    var score = 0;
    var k = pos.kingSq;
    var px = [];
    var py = [];
    for (var sq = 0; sq < pos.N; sq++) {
      if (owner[sq] === PLAYER) { px.push(sq % W); py.push((sq / W) | 0); }
    }
    if (k >= 0) {
      var kx = k % W;
      var ky = (k / W) | 0;
      // Fewer of the player's pieces close to the king, and room for the king to step.
      for (var i = 0; i < px.length; i++) {
        var d = Math.max(Math.abs(px[i] - kx), Math.abs(py[i] - ky));
        if (d <= 2) score -= d === 1 ? 18 : 10;
      }
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var nx = kx + dx;
          var ny = ky + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= pos.H) continue;
          if (owner[ny * W + nx] !== RIVAL) score += 3;
        }
      }
    }
    // Guards that stay engaged with the player's pieces, and pawns that advance.
    for (var s = 0; s < pos.N; s++) {
      if (owner[s] !== RIVAL || s === k) continue;
      var gx = s % W;
      var gy = (s / W) | 0;
      for (var j = 0; j < px.length; j++) {
        if (Math.max(Math.abs(px[j] - gx), Math.abs(py[j] - gy)) <= 2) { score += 4; break; }
      }
      if (pos.promotes[pos.kind[s]]) score += gy * 3;
    }
    return score;
  }

  /** The score of the position after a rival move (the rival's point of view). */
  function scoreAfter(pos) {
    if (pos.counts[PLAYER] === 0) return WIN;
    var reply = rules.bestCapture(pos, PLAYER);
    if (reply >= pieces.KING_VALUE) return -WIN + pos.mat;
    return pos.mat - reply + positional(pos);
  }

  function tieBreak(seed, mv) {
    return rng.hash(seed, mv) & 7;
  }

  /** The rival's move in this position (from * 64 + to), or -1 when it has none (it passes). */
  function move(pos) {
    var list = rules.moves(pos, RIVAL);
    if (!list.length) return -1;
    var best = -Infinity;
    var bestMv = -1;
    for (var i = 0; i < list.length; i++) {
      var mv = list[i];
      rules.doMove(pos, mv);
      var s = scoreAfter(pos) + tieBreak(pos.seed, mv);
      rules.undoMove(pos);
      if (s > best) { best = s; bestMv = mv; }
    }
    return bestMv;
  }

  /** Every rival move with its score, best first (for tests and tuning). */
  function ranked(pos) {
    var list = rules.moves(pos, RIVAL);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      rules.doMove(pos, list[i]);
      out.push({ mv: list[i], score: scoreAfter(pos), tie: tieBreak(pos.seed, list[i]) });
      rules.undoMove(pos);
    }
    out.sort(function (a, b) { return (b.score + b.tie) - (a.score + a.tie); });
    return out;
  }

  var api = { move: move, ranked: ranked, scoreAfter: scoreAfter, positional: positional, WIN: WIN };
  if (node) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).ai = api;
})(this);
