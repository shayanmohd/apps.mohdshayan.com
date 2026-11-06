/*
 * The board generator. Boards are built, not sampled blindly: a seeded placement is kept only when the
 * solver proves its shortest win against the real rival lies inside the board's band. A cheap search
 * below the band rejects trivial wins first; the search to the band's top proves a win exists and gives
 * the planted line (the par and the tutorial's moves). Integer only, so a seed is the same board
 * everywhere.
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var rules = node ? require('./rules.js') : root.Pawnfare.rules;
  var solver = node ? require('./solver.js') : root.Pawnfare.solver;
  var rng = node ? require('./rng.js') : root.Pawnfare.rng;
  var eras = node ? require('./eras.js') : root.Pawnfare.eras;

  var PLAYER = rules.PLAYER;
  var RIVAL = rules.RIVAL;

  /** The guard types for a board: the era's tier lists up to the board's tier, the strongest last. */
  function guardTypes(guardTiers, tier, count, r) {
    var pool = [];
    for (var t = 0; t <= tier && t < guardTiers.length; t++) pool = pool.concat(guardTiers[t]);
    var out = [];
    // From tier 2 one guard is from the board's own tier, so late boards always carry a strong piece.
    if (tier >= 2 && count > 0) out.push(r.pick(guardTiers[Math.min(tier, guardTiers.length - 1)]));
    while (out.length < count) out.push(r.pick(pool));
    return out;
  }

  /**
   * A seeded placement. mode 0: the army on the bottom two rows, the king on the top two, guards on the
   * top rows. mode 1 and up (fallbacks for weak armies): the king on the top edge with its guards packed
   * beside it, so a short attack can finish it, and the army may start one (mode 1) or two (mode 2+)
   * rows further up; mode 3 puts the king in a top corner.
   */
  function place(spec, army, guards, r, mode) {
    var W = spec.W;
    var H = spec.H;
    var reach = mode >= 2 ? 4 : mode === 1 ? 3 : 2;
    var playerSquares = [];
    for (var y = H - reach; y < H; y++) for (var x = 0; x < W; x++) playerSquares.push(y * W + x);
    r.shuffle(playerSquares);
    var kingSquares = [];
    var kingRows = mode ? 1 : 2;
    for (var ky = 0; ky < kingRows; ky++) for (var kx = 0; kx < W; kx++) kingSquares.push(ky * W + kx);
    if (mode >= 3) kingSquares = [0, W - 1];
    var king = r.pick(kingSquares);
    var guardSquares = [];
    var guardRows = H >= 6 ? 3 : 2;
    var near = [];
    var far = [];
    for (var gy = 0; gy < guardRows; gy++) {
      for (var gx = 0; gx < W; gx++) {
        var sq = gy * W + gx;
        if (sq === king) continue;
        var d = Math.max(Math.abs(gx - (king % W)), Math.abs(gy - ((king / W) | 0)));
        (d === 1 ? near : far).push(sq);
      }
    }
    r.shuffle(near);
    r.shuffle(far);
    guardSquares = mode ? near.concat(far) : r.shuffle(near.concat(far));
    var used = {};
    used[king] = true;
    var list = [[RIVAL, 'shah', king]];
    for (var g = 0; g < guards.length; g++) { list.push([RIVAL, guards[g], guardSquares[g]]); used[guardSquares[g]] = true; }
    // The army goes on squares the rival does not attack first (a fair start), then anywhere left.
    var danger = rules.attackedBy(rules.createPosition({ W: W, H: H, pieces: list, promo: spec.promo, seed: 0 }), RIVAL);
    playerSquares.sort(function (p, q) { return danger[p] - danger[q]; });
    var placed = 0;
    for (var a = 0; a < playerSquares.length && placed < army.length; a++) {
      if (used[playerSquares[a]]) continue;
      list.push([PLAYER, army[placed], playerSquares[a]]);
      used[playerSquares[a]] = true;
      placed++;
    }
    list.sort(function (p, q) { return p[2] - q[2]; });
    return list;
  }

  /**
   * Builds one board. spec: { W, H, guards, band: [lo, hi], slack, tier, guardTiers, promo }. army: the
   * player's types. Returns a board { W, H, pieces, promo, seed, par, limit, line, attempts, evals }.
   * opts: { attempts (default 160), budget (rival evaluations per search, default 60000) }.
   */
  function generate(spec, army, seed, opts) {
    opts = opts || {};
    var maxAttempts = opts.attempts || 160;
    var budget = opts.budget || 60000;
    var r = rng.create(seed);
    var lo = spec.band[0];
    var hi = spec.band[1];
    var guardsCount = spec.guards;
    var totalEvals = 0;
    var attempts = 0;
    for (var round = 0; round < 4; round++) {
      // The last round (king in a corner) is cheap for the small armies that reach it: try it longer.
      var roundAttempts = round === 3 ? maxAttempts * 5 : maxAttempts;
      for (var i = 0; i < roundAttempts; i++) {
        attempts++;
        var aiSeed = r.next();
        var guards = guardTypes(spec.guardTiers, Math.max(0, spec.tier - round), guardsCount, r);
        var def = { W: spec.W, H: spec.H, pieces: place(spec, army, guards, r, round), promo: spec.promo, seed: aiSeed };
        var pos = rules.createPosition(def);
        // Fair start: the rival threatens nothing and the king is not already en prise.
        if (rules.bestCapture(pos, RIVAL) > 0 || rules.kingCapture(pos) >= 0) { if (opts.stats) opts.stats.unfair++; continue; }
        if (lo > 2) {
          var quick = solver.solve(pos, lo - 1, { budget: budget });
          totalEvals += quick.evals || 0;
          if (quick.aborted || quick.depth > 0) { if (opts.stats) opts.stats.easy++; continue; }
        }
        var full = solver.solve(pos, hi, { minDepth: Math.max(2, lo), budget: budget });
        totalEvals += full.evals || 0;
        if (full.aborted || !full.depth || full.depth < lo) { if (opts.stats) opts.stats[full.aborted ? 'aborted' : full.depth ? 'easy' : 'nowin']++; continue; }
        def.par = full.depth;
        def.limit = full.depth + spec.slack;
        def.line = full.line;
        def.attempts = attempts;
        def.evals = Math.round(totalEvals);
        def.relaxed = round;
        return def;
      }
      // Not found: widen the band, step the guards down a tier and box the king in with them (one more
      // guard each round from the second), so even a weak army gets a board proved winnable.
      lo = Math.max(2, lo - 1);
      hi = 4;
      if (round >= 1) guardsCount = Math.min(guardsCount + 1, spec.W + 1);
    }
    return null;
  }

  /** The generator settings for board index (0 to 7) of a run in an era. */
  function runSpec(eraId, index) {
    return specFrom(eras.RUN_BOARDS[Math.max(0, Math.min(eras.RUN_BOARDS.length - 1, index))], eraId);
  }

  /** The generator settings from a table row (RUN_BOARDS or DAILY_BOARDS) for an era. */
  function specFrom(b, eraId) {
    var era = eras.ERAS[eraId];
    return { W: b.W, H: b.H, guards: b.guards, band: b.band.slice(), slack: b.slack, tier: b.tier,
      guardTiers: era.guards, promo: era.promo };
  }

  /** A board's seed: from the run seed, the board index and the army, so a draft changes the board. */
  function boardSeed(runSeed, index, army) {
    return rng.seed('board:' + army.join(','), runSeed, index);
  }

  var api = { generate: generate, runSpec: runSpec, specFrom: specFrom, boardSeed: boardSeed, guardTypes: guardTypes };
  if (node) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).gen = api;
})(this);
