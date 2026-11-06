/*
 * The solver: the shortest win against the real rival. The rival is deterministic, so a win is one line
 * of player moves; iterative deepening over the player's moves (the rival's reply computed, never
 * searched) finds the shortest. A depth is the number of player moves including the king's capture.
 * A transposition table remembers positions already shown to have no win within a depth, and the
 * rival's replies are memoised per position.
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var rules = node ? require('./rules.js') : root.Pawnfare.rules;
  var ai = node ? require('./ai.js') : root.Pawnfare.ai;

  var pieces = node ? require('./pieces.js') : root.Pawnfare.pieces;
  var PLAYER = rules.PLAYER;
  var RIVAL = rules.RIVAL;
  var KING_VALUE = pieces.KING_VALUE;

  /**
   * Searches for a win within maxDepth player moves, from minDepth up. Returns
   * { depth, line } (line: the player's moves), { depth: 0 } when there is none within maxDepth, or
   * { aborted: true } when the node budget ran out. opts: { minDepth, budget (rival evaluations) }.
   */
  function solve(pos, maxDepth, opts) {
    opts = opts || {};
    var ctx = {
      tt: new Map(),
      memo: new Map(),
      budget: opts.budget || Infinity,
      evals: 0,
      aborted: false
    };
    var start = Math.max(1, opts.minDepth || 1);
    // Wins shorter than minDepth still count when asked (so callers can reject trivial boards cheaply).
    for (var d = start; d <= maxDepth; d++) {
      var line = [];
      if (search(pos, d, line, ctx)) return { depth: d, line: line, evals: ctx.evals };
      if (ctx.aborted) return { aborted: true, evals: ctx.evals };
    }
    return { depth: 0, evals: ctx.evals };
  }

  function rivalReply(pos, ctx) {
    var k = rules.key(pos);
    var hit = ctx.memo.get(k);
    if (hit !== undefined) return hit;
    ctx.evals++;
    var mv = ai.move(pos);
    ctx.memo.set(k, mv);
    return mv;
  }

  /**
   * True when the rival, to move, cannot keep its king: every move it has leaves the king capturable
   * (its AI scores those moves at minus WIN, so it picks one only when all are), or it has no move and
   * the king is already capturable. A move that takes the player's last piece keeps the king.
   */
  function rivalLost(pos) {
    var list = rules.moves(pos, RIVAL);
    if (!list.length) return rules.kingCapture(pos) >= 0;
    for (var i = 0; i < list.length; i++) {
      rules.doMove(pos, list[i]);
      var safe = pos.counts[PLAYER] === 0 || rules.bestCapture(pos, PLAYER) < KING_VALUE;
      rules.undoMove(pos);
      if (safe) return false;
    }
    return true;
  }

  function search(pos, d, line, ctx) {
    var cap = rules.kingCapture(pos);
    if (cap >= 0) { line.push(cap); return true; }
    if (d <= 1) return false;
    var k = rules.key(pos);
    var known = ctx.tt.get(k);
    if (known !== undefined && known >= d) return false;
    if (ctx.evals > ctx.budget) { ctx.aborted = true; return false; }
    var list = order(pos, rules.moves(pos, PLAYER));
    for (var i = 0; i < list.length; i++) {
      var mv = list[i];
      rules.doMove(pos, mv);
      var ok = false;
      if (d === 2) {
        // Exact and cheap: a win in two needs the rival to be lost whatever it plays.
        ctx.evals += 0.1;
        if (pos.kingSq >= 0 && rivalLost(pos)) {
          var reply = rivalReply(pos, ctx);
          if (reply >= 0) rules.doMove(pos, reply);
          var last = rules.kingCapture(pos);
          if (reply >= 0) rules.undoMove(pos);
          if (last >= 0) { line.push(last); ok = true; }
        }
      } else {
        var r = rivalReply(pos, ctx);
        if (r >= 0) rules.doMove(pos, r);
        ok = pos.counts[PLAYER] > 0 && pos.kingSq >= 0 && search(pos, d - 1, line, ctx);
        if (r >= 0) rules.undoMove(pos);
      }
      rules.undoMove(pos);
      if (ok) { line.unshift(mv); return true; }
      if (ctx.aborted) return false;
    }
    ctx.tt.set(k, d);
    return false;
  }

  /** Moves toward the king first: a cheap ordering that finds wins sooner. */
  function order(pos, list) {
    var k = pos.kingSq;
    if (k < 0) return list;
    var W = pos.W;
    var kx = k % W;
    var ky = (k / W) | 0;
    var scored = list.map(function (mv) {
      var to = mv & 63;
      var d = Math.max(Math.abs((to % W) - kx), Math.abs(((to / W) | 0) - ky));
      return { mv: mv, s: (pos.owner[to] ? -10 : 0) + d };
    });
    scored.sort(function (a, b) { return a.s - b.s || a.mv - b.mv; });
    return scored.map(function (o) { return o.mv; });
  }

  /**
   * Replays a line of player moves against the rival from a fresh copy of the definition: true when it
   * captures the king within the line. Used to check stored boards.
   */
  function replays(def, line) {
    var pos = rules.createPosition(def);
    for (var i = 0; i < line.length; i++) {
      var legal = rules.moves(pos, PLAYER);
      if (legal.indexOf(line[i]) < 0) return false;
      var target = line[i] & 63;
      var wasKing = target === pos.kingSq;
      rules.doMove(pos, line[i]);
      if (wasKing) return i === line.length - 1;
      var reply = ai.move(pos);
      if (reply >= 0) rules.doMove(pos, reply);
      if (!pos.counts[PLAYER]) return false;
    }
    return false;
  }

  var api = { solve: solve, replays: replays };
  if (node) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).solver = api;
})(this);
