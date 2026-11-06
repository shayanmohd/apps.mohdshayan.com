/*
 * Two players on one phone: best of five pench (first to 3), the left rooftop against the right one, the
 * same kite and handling for both and wind with no lean either way. After 20 s without a cut the breeze
 * slowly gathers the two kites across each other, so every pench ends.
 *
 * Also the menu's attract sky: two AI kites fighting forever behind the menu.
 *
 * Phases: count (3, 2, 1 with both kites parked), play, between (a cut; the next pench starts soon) and
 * over. Pure and deterministic, like sky.js.
 */
(function (root, factory) {
  var node = typeof require === 'function' && typeof module === 'object';
  var m = factory(
    node ? require('./rng.js') : root.LS.rng,
    node ? require('./physics.js') : root.LS.physics,
    node ? require('./ai.js') : root.LS.ai
  );
  if (node && module.exports) module.exports = m;
  else (root.LS = root.LS || {}).match = m;
})(typeof self !== 'undefined' ? self : this, function (rng, physics, ai) {
  'use strict';

  var FIRST_TO = 3;
  var COUNT = 3;
  var BETWEEN = 2.4;
  var GATHER_AFTER = 20;
  var GATHER_MAX = 5;
  var HANDS = [22, 68];

  function emit(m, type, data) {
    m.events.push({ type: type, t: m.t, data: data || null });
  }

  /** opts: seed, patterns [left, right]. */
  function create(opts) {
    opts = opts || {};
    var m = {
      seed: (opts.seed >>> 0) || 1, firstTo: FIRST_TO, score: [0, 0], pench: 0,
      phase: 'count', count: COUNT, t: 0, penchT: 0, between: 0, winner: -1, longest: 0,
      patterns: opts.patterns || [0, 0], world: null, events: [], cuts: []
    };
    startPench(m);
    return m;
  }

  function startPench(m) {
    m.pench++;
    m.world = physics.createWorld({
      seed: rng.mix32(m.seed + 0x1b873593 * m.pench),
      wind: { base: 0, amp: 5, gustEvery: 9, gustMag: 5, symmetric: true }
    });
    physics.addKite(m.world, 0, { hand: HANDS[0], pattern: m.patterns[0] });
    physics.addKite(m.world, 1, { hand: HANDS[1], pattern: m.patterns[1] });
    m.phase = 'count';
    m.count = COUNT;
    m.penchT = 0;
    emit(m, 'pench', { pench: m.pench });
  }

  /** One fixed step. holds: [left, right]. */
  function step(m, holds) {
    var dt = physics.DT;
    m.t += dt;
    if (m.phase === 'over') return m;
    var w = m.world;
    if (m.phase === 'count') {
      var before = Math.ceil(m.count);
      m.count -= dt;
      physics.step(w, [false, false]);
      w.events.length = 0;
      if (Math.ceil(m.count) !== before && m.count > 0) emit(m, 'tick', { n: Math.ceil(m.count) });
      if (m.count <= 0) { m.phase = 'play'; emit(m, 'go', null); }
      return m;
    }
    if (m.phase === 'play') {
      m.penchT += dt;
      w.converge = m.penchT > GATHER_AFTER ? Math.min(GATHER_MAX, (m.penchT - GATHER_AFTER) / 20 * GATHER_MAX) : 0;
    }
    var h = m.phase === 'play' ? holds : [holds && holds[0] && w.kites[0] ? holds[0] : false, holds && holds[1] && w.kites[1] ? holds[1] : false];
    physics.step(w, h);
    var evs = w.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.type === 'cut' && m.phase === 'play') {
        var d = e.data;
        m.score[d.winner]++;
        m.longest = Math.max(m.longest, d.time);
        m.cuts.push({ winner: d.winner, time: d.time });
        physics.removeKite(w, d.loser);
        m.phase = 'between';
        m.between = BETWEEN;
        emit(m, 'penchWon', { winner: d.winner, score: m.score.slice(), time: d.time, cut: d });
      } else if (e.type === 'duelStart' || e.type === 'duelEnd' || e.type === 'launch') {
        if (e.type === 'duelEnd') m.longest = Math.max(m.longest, e.data.time);
        emit(m, e.type, e.data);
      }
    }
    evs.length = 0;
    if (m.phase === 'between') {
      m.between -= dt;
      if (m.between <= 0) {
        var top = Math.max(m.score[0], m.score[1]);
        if (top >= m.firstTo) {
          m.phase = 'over';
          m.winner = m.score[0] > m.score[1] ? 0 : 1;
          emit(m, 'over', { winner: m.winner, score: m.score.slice() });
        } else {
          startPench(m);
        }
      }
    }
    return m;
  }

  function result(m) {
    return { winner: m.winner, score: m.score.slice(), pench: m.pench, duel: Math.round(m.longest * 10) / 10 };
  }

  // ---- the menu's attract sky ----

  function createAttract(seed) {
    var a = { seed: seed >>> 0, n: 0, world: null, brains: [null, null], respawn: [0, 0], events: [] };
    a.world = physics.createWorld({ seed: a.seed, liftBelow: 62, wind: { base: 1.5, amp: 4, gustEvery: 10, gustMag: 4, symmetric: true } });
    spawnAttract(a, 0);
    spawnAttract(a, 1);
    return a;
  }

  function spawnAttract(a, side) {
    a.n++;
    var style = ai.STYLES[(a.n * 7 + side) % 3];
    a.brains[side] = ai.create({ style: style, d: 0.45 + 0.1 * ((a.n + side) % 4), side: side, seed: rng.mix32(a.seed + a.n * 977) });
    physics.addKite(a.world, side, { hand: HANDS[side], saw: 1, pattern: (a.n + side) % 3 });
    a.respawn[side] = -1;
  }

  function stepAttract(a) {
    var w = a.world;
    for (var s = 0; s < 2; s++) if (!w.kites[s] && a.respawn[s] >= 0 && w.t >= a.respawn[s]) spawnAttract(a, s);
    var holds = [w.kites[0] ? ai.decide(a.brains[0], w) : false, w.kites[1] ? ai.decide(a.brains[1], w) : false];
    physics.step(w, holds);
    var evs = w.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.type === 'cut') {
        physics.removeKite(w, e.data.loser);
        a.respawn[e.data.loser] = w.t + 1.6;
      }
      a.events.push(e);
    }
    evs.length = 0;
    return a;
  }

  return {
    FIRST_TO: FIRST_TO, COUNT: COUNT, BETWEEN: BETWEEN, GATHER_AFTER: GATHER_AFTER, HANDS: HANDS,
    create: create, step: step, result: result, createAttract: createAttract, stepAttract: stepAttract
  };
});
