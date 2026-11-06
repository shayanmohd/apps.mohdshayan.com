/*
 * The newcomer pulse lesson. A player still in the newcomer skies (solo skies 1 to 3, or the Daily and a
 * friend's sky before solo sky 4) who ended the last sky with no cut, or who pulls the line HOLD seconds
 * on end without a cut, sees the steering hint again with a short wordless demonstration: a ghost thumb
 * presses and lifts beside a small kite whose nose turns while the thumb is up and which darts along its
 * nose while it is down. Once per sky, never in the lesson or a two-player match, and never once the
 * player has cut a rival in that sky.
 *
 * It only watches: nothing here feeds back into the sky, so a sky plays exactly the same with or without
 * it (the Daily and two-player fingerprints in tests/sky.test.js hold). Pure; main.js steps it after
 * sky.step and draws what pose() says.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.LS = root.LS || {}).coach = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NEWCOMER_SKIES = 3; // solo skies 1 to 3
  var HOLD = 4;           // s of unbroken pull, with no cut yet in the sky, that bring the lesson
  var UP = 1.0;           // s of each round with the thumb up: the nose turns
  var DOWN = 0.8;         // s with the thumb down: the kite darts along its nose
  var ROUNDS = 2;
  var SHOW = ROUNDS * (UP + DOWN) + 0.4;

  /** o: {mode: 'solo', 'daily' or 'friend', number: the solo sky, reached: the save's next solo sky}. */
  function newcomer(o) {
    if (!o) return false;
    if (o.mode === 'solo') return (o.number | 0) <= NEWCOMER_SKIES;
    if (o.mode === 'daily' || o.mode === 'friend') return (o.reached | 0) <= NEWCOMER_SKIES;
    return false;
  }

  /** A finished one-player sky (sky.result) by a newcomer that cut nothing: the next sky opens with the lesson. */
  function after(result, reached) {
    return !!result && (result.cuts | 0) === 0 && result.mode !== 'lesson' &&
      newcomer({ mode: result.mode, number: result.number, reached: reached });
  }

  /** opts: as newcomer(), plus armed: the last sky ended with no cut (after()). */
  function create(opts) {
    opts = opts || {};
    var on = newcomer(opts);
    return { on: on, armed: on && !!opts.armed, held: 0, at: -1, why: null };
  }

  /** After each sky step: hold is the player's input that step, dt the step in seconds. */
  function step(c, sky, hold, dt) {
    if (!c.on || c.at >= 0) return c;
    if (sky.cuts > 0) { c.on = false; return c; }
    var k = sky.world.kites[0];
    c.held = hold && k ? c.held + dt : 0;
    if (c.armed && k && !k.parked) start(c, sky.world.t, 'retry');
    else if (c.held >= HOLD) start(c, sky.world.t, 'hold');
    return c;
  }

  function start(c, t, why) {
    c.at = t;
    c.why = why;
  }

  /** Seconds since the demonstration began while it plays, else -1. t: the sky's clock. */
  function age(c, t) {
    return c && c.at >= 0 && t >= c.at && t - c.at < SHOW ? t - c.at : -1;
  }

  /** The demonstration at a given age: thumb down or up, the nose's turn and the dart, each 0 to 1. */
  function pose(a) {
    var p = Math.min(a, ROUNDS * (UP + DOWN) - 1e-6) % (UP + DOWN);
    if (p < UP) return { down: false, turn: p / UP, dart: 0 };
    return { down: true, turn: 1, dart: (p - UP) / DOWN };
  }

  return {
    NEWCOMER_SKIES: NEWCOMER_SKIES, HOLD: HOLD, SHOW: SHOW,
    newcomer: newcomer, after: after, create: create, step: step, age: age, pose: pose
  };
});
