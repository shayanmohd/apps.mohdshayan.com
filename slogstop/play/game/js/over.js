/*
 * One over (an innings of six legal balls) in Slogstop: the score, the wickets, the free hit after a
 * no-ball and the ball-by-ball line. Pure state, no drawing and no timers. The seed and
 * the ball number feed every draw, so the same seed and the same picks give the same over.
 *
 * Late picks (the duel only): a bowler who misses the throw bowls a no-ball (one run, the ball does not
 * count, the batter cannot be out off it, it comes as a full toss and the next ball is a free hit); a
 * batter who misses it leaves the ball (a dot, or one run off a no-ball).
 */
(function (root, factory) {
  var m = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.SS = root.SS || {}).over = m;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var model = node ? require('./model.js') : root.SS.model;
  var rng = node ? require('./rng.js') : root.SS.rng;

  var BALLS = 6;
  var LEAVE = 7; // a batter who missed the throw
  var LATE = -1; // a bowler who missed the throw

  // Salts for the per-ball draws.
  var S_SLIP = 1, S_OUT = 2, S_BAT = 3, S_BOWL = 4;

  /**
   * opts: { target (runs the batting side needs; 0 for an open innings such as the duel's first),
   *         wickets (in hand, 1 to 3), seed, field: { shape, move, slots } }
   */
  function create(opts) {
    var field = opts.field && model.validSlots(opts.field.slots) ? opts.field : model.makeField(0, null);
    return {
      target: opts.target | 0,
      wickets: Math.max(1, Math.min(3, opts.wickets | 0 || 2)),
      seed: opts.seed >>> 0,
      field: field,
      cover: model.covers(field.slots),
      runs: 0,
      out: 0,
      legal: 0,
      index: 0, // deliveries bowled, no-balls included: the draw number
      freeHit: false,
      last: -1, // the last legal delivery bowled
      bowled: [], // deliveries this over (no-balls not included)
      picks: [], // the batter's picks this over (leaves not included)
      line: [], // one entry per delivery: { s: symbol, d, pick, outcome, runs, extra, slip, free, out }
      done: false,
      result: null // 'batting' (reached the target), 'bowling' (held it), or 'complete' (no target)
    };
  }

  function ballsLeft(o) { return BALLS - o.legal; }
  function need(o) { return o.target ? Math.max(0, o.target - o.runs) : 0; }
  function wicketsLeft(o) { return o.wickets - o.out; }

  /** The flags dist() and resolve() take for the next ball, for a given delivery. */
  function flags(o, d) {
    return { freeHit: o.freeHit, noBall: d === LATE };
  }

  /** The draws for this ball: two for the outcome, one each for a computer batter and bowler. */
  function draws(o) {
    return {
      slip: rng.derive(o.seed, o.index, S_SLIP),
      out: rng.derive(o.seed, o.index, S_OUT),
      bat: rng.derive(o.seed, o.index, S_BAT),
      bowl: rng.derive(o.seed, o.index, S_BOWL)
    };
  }

  /**
   * Plays one delivery: d is a delivery (0 to 3) or LATE, pick a zone (0 to 5), BLOCK (6) or LEAVE.
   * Returns the entry added to the line.
   */
  function play(o, d, pick) {
    if (o.done) return null;
    var u = draws(o);
    var noBall = d === LATE;
    var f = flags(o, d);
    var entry = { d: d, pick: pick, runs: 0, extra: 0, slip: false, fullToss: noBall, free: o.freeHit, out: false };
    var outcome;
    if (pick === LEAVE) {
      outcome = model.DOT;
    } else {
      var r = model.resolve(noBall ? 0 : d, pick, o.cover, f, u.slip, u.out);
      outcome = r.outcome;
      entry.slip = r.slip;
      entry.fullToss = r.fullToss;
    }
    entry.outcome = outcome;
    entry.runs = model.RUNS[outcome];
    if (noBall) entry.extra = 1;
    if (outcome === model.W) {
      entry.out = true;
      o.out += 1;
    }
    o.runs += entry.runs + entry.extra;
    o.index += 1;
    if (noBall) {
      o.freeHit = true;
    } else {
      o.legal += 1;
      o.freeHit = false;
      o.last = d;
      o.bowled.push(d);
    }
    if (pick !== LEAVE) o.picks.push(pick);
    entry.s = symbol(entry);
    o.line.push(entry);
    settle(o);
    return entry;
  }

  function symbol(e) {
    var base = e.out ? 'W' : model.SYMBOL[e.outcome];
    if (e.extra) return 'nb' + (e.runs ? e.runs : '');
    return base;
  }

  function settle(o) {
    if (o.target && o.runs >= o.target) {
      o.done = true;
      o.result = 'batting';
    } else if (o.out >= o.wickets || o.legal >= BALLS) {
      o.done = true;
      o.result = o.target ? 'bowling' : 'complete';
    }
  }

  /** The context the computer's batter reads. */
  function batterContext(o) {
    return { cover: o.cover, need: o.target ? need(o) : 14, ballsLeft: ballsLeft(o), wicketsLeft: wicketsLeft(o), bowled: o.bowled, freeHit: o.freeHit, last: o.last };
  }

  /** The context the computer's bowler reads. */
  function bowlerContext(o) {
    return { cover: o.cover, picks: o.picks, need: need(o), ballsLeft: ballsLeft(o), wicketsLeft: wicketsLeft(o), freeHit: o.freeHit, last: o.last };
  }

  /** The spoiler-free line: "W . 1 4 . W". */
  function lineText(o) {
    var parts = [];
    for (var i = 0; i < o.line.length; i++) parts.push(o.line[i].s);
    return parts.join(' ');
  }

  /** A copy that can be played on without touching the original (the solver uses it). */
  function clone(o) {
    var c = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k];
    c.bowled = o.bowled.slice();
    c.picks = o.picks.slice();
    c.line = o.line.slice();
    return c;
  }

  return {
    BALLS: BALLS, LEAVE: LEAVE, LATE: LATE, create: create, play: play, draws: draws, flags: flags,
    ballsLeft: ballsLeft, need: need, wicketsLeft: wicketsLeft, batterContext: batterContext,
    bowlerContext: bowlerContext, lineText: lineText, clone: clone
  };
});
