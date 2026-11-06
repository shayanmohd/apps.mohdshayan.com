/*
 * Rival kites. A brain decides hold or let go each fixed step, from the world and its own seeded
 * generator only, so the same seed and the same player give the same rival everywhere.
 *
 * Styles (GAME-DESIGN.md section 3), each beatable by timing alone:
 *   climber  climbs above your kite, then dives across your line; slow, even pulses in a duel
 *   diver    darts straight at your line again and again; holds too long in a duel and burns its line
 *   drifter  hangs slack and drifts across your line; barely saws
 *   train    the first launch's practice rival: drifts and hardly pulls
 */
(function (root, factory) {
  var node = typeof require === 'function' && typeof module === 'object';
  var m = factory(node ? require('./rng.js') : root.LS.rng, node ? require('./physics.js') : root.LS.physics);
  if (node && module.exports) module.exports = m;
  else (root.LS = root.LS || {}).ai = m;
})(typeof self !== 'undefined' ? self : this, function (rng, physics) {
  'use strict';

  var STYLES = ['climber', 'diver', 'drifter'];
  var DEG = Math.PI / 180;
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Below 0 is the newcomer range of the first solo skies (sky.js difficulty): every parameter keeps its
  // line past d = 0, so the rival reacts later, aims wider, saws softer and pulses further from the ideal.
  var MIN_D = -0.6;

  /** Everything about a rival that follows from its style and difficulty d (MIN_D to 1). */
  function params(style, d) {
    d = clamp(d, MIN_D, 1);
    var p = {
      style: style, d: d,
      react: 0.5 - 0.32 * d,
      tol: (28 - 18 * d) * DEG,
      aimErr: (1 - d) * 0.35,
      hesitate: (1 - d) * 0.25,
      saw: 0.7 + 0.35 * d,
      heatLimit: d > 0.5 ? 1.3 - 0.6 * d : 2,
      P: 0.75 - 0.25 * d, Q: 0.6 - 0.2 * d,
      replan: [0.8, 1.6]
    };
    if (style === 'diver') { p.P = 1.2 - 0.45 * d; p.Q = 0.25 + 0.05 * d; p.replan = [0.6, 1.1]; }
    else if (style === 'drifter') { p.P = 0.25 + 0.1 * d; p.Q = 1.0 - 0.45 * d; p.replan = [1.2, 2.2]; }
    else if (style === 'train') {
      p.P = 0.15; p.Q = 2.2; p.saw = 0.5; p.react = 0.6; p.tol = 30 * DEG; p.aimErr = 0.25; p.hesitate = 0.3;
      p.heatLimit = 2; p.replan = [1.4, 2.4];
    }
    return p;
  }

  /** opts: style, seed, d, side (1 for the right-hand rooftop), tune (parameter overrides, for test bots). */
  function create(opts) {
    var p = params(opts.style, opts.d);
    if (opts.tune) for (var key in opts.tune) if (Object.prototype.hasOwnProperty.call(opts.tune, key)) p[key] = opts.tune[key];
    return {
      p: p, side: opts.side == null ? 1 : opts.side, r: rng.make(opts.seed >>> 0),
      mode: 'climb', target: null, nextPlan: 0, pullUntil: 0, aimErr: 0,
      launchAt: null, duelPhase: null, duelUntil: 0, passState: 0
    };
  }

  function jitter(b, v) {
    return v * (0.8 + 0.4 * b.r.next());
  }

  /** The point a fraction f along the foe's line from its hand. */
  function linePoint(foe, f) {
    var s = clamp(f, 0, 1) * physics.SEGS;
    var i = Math.min(physics.SEGS - 1, Math.floor(s));
    var u = s - i;
    return { x: foe.px[i] + (foe.px[i + 1] - foe.px[i]) * u, y: foe.py[i] + (foe.py[i + 1] - foe.py[i]) * u };
  }

  function distToLine(me, foe) {
    var best = 1e9;
    for (var i = 0; i < physics.SEGS; i++) {
      var ax = foe.px[i], ay = foe.py[i], bx = foe.px[i + 1], by = foe.py[i + 1];
      var dx = bx - ax, dy = by - ay;
      var l2 = dx * dx + dy * dy;
      var t = l2 > 0 ? clamp(((me.x - ax) * dx + (me.y - ay) * dy) / l2, 0, 1) : 0;
      var ex = ax + dx * t - me.x, ey = ay + dy * t - me.y;
      best = Math.min(best, ex * ex + ey * ey);
    }
    return Math.sqrt(best);
  }

  function setTarget(b, x, y, mode) {
    b.target = { x: clamp(x, 10, physics.W - 10), y: clamp(y, 16, 138) };
    b.mode = mode;
  }

  function attack(b, me, foe, lo, hi) {
    var P = linePoint(foe, b.r.range(lo, hi));
    var dx = P.x - me.x, dy = P.y - me.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    // Fly through the line, not to it.
    setTarget(b, P.x + dx / d * 16, P.y + dy / d * 16, 'attack');
  }

  function plan(b, world, me, foe) {
    var p = b.p;
    b.nextPlan = world.t + b.r.range(p.replan[0], p.replan[1]);
    b.aimErr = (b.r.next() * 2 - 1) * p.aimErr;
    b.passState = 0;
    if (me.y < 28) return setTarget(b, me.x + (b.side === 1 ? -6 : 6), me.y + 42, 'climb');
    if (!foe || foe.parked) return setTarget(b, b.side === 1 ? 64 : 26, 96 + b.r.range(-10, 14), 'wait');
    if (p.style === 'climber') {
      if (me.y < foe.y + 22 && me.y < 128) return setTarget(b, clamp(me.x, 20, 70), Math.min(140, foe.y + 34), 'climb');
      return attack(b, me, foe, 0.55, 0.8);
    }
    if (p.style === 'diver') return attack(b, me, foe, 0.45, 0.72);
    // drifter and train: let the wind work, cross only when the line is close, climb back when low
    if (distToLine(me, foe) < 20) return attack(b, me, foe, 0.5, 0.75);
    if (me.y < 52) return setTarget(b, me.x, me.y + 30, 'climb');
    return setTarget(b, me.x, me.y, 'hang');
  }

  function duelDecide(b, world, me) {
    var t = world.t, p = b.p;
    if (b.duelPhase == null) {
      // The first reaction keeps whatever the kite was doing when the lines caught.
      b.duelPhase = me.hold ? 'pull' : 'slack';
      b.duelUntil = t + p.react;
    }
    if (t >= b.duelUntil) {
      if (b.duelPhase === 'pull') { b.duelPhase = 'slack'; b.duelUntil = t + jitter(b, p.Q); }
      else { b.duelPhase = 'pull'; b.duelUntil = t + jitter(b, p.P); }
    }
    if (b.duelPhase === 'pull' && me.heat > p.heatLimit) {
      b.duelPhase = 'slack';
      b.duelUntil = t + jitter(b, p.Q);
    }
    return b.duelPhase === 'pull';
  }

  function flyDecide(b, world, me, foe) {
    var t = world.t;
    if (t >= b.nextPlan || !b.target) plan(b, world, me, foe);
    if (b.mode === 'hang') {
      // Hanging: slack, with a short pull up only when the nose points up and the kite sinks low.
      if (me.hold && t < b.pullUntil) return true;
      if (me.y < 60 && Math.abs(me.th) < 0.45) { b.pullUntil = t + 0.25; return true; }
      return false;
    }
    var tx = b.target.x, ty = b.target.y;
    var dx = tx - me.x, dy = ty - me.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var want = physics.headingTo(me.x, me.y, tx, ty) + b.aimErr;
    var diff = physics.wrap(want - me.th);
    if (me.hold) {
      if (t < b.pullUntil && Math.abs(diff) < 0.9 && dist > 5) return true;
      if (dist <= 5 || b.mode === 'attack') b.nextPlan = Math.min(b.nextPlan, t + 0.15);
      return false;
    }
    if (Math.abs(diff) < b.p.tol) {
      if (b.passState === 0) b.passState = b.r.next() < b.p.hesitate ? 2 : 1;
      if (b.passState === 2) return false; // lets this pass go by and waits for the nose to come round
      b.pullUntil = t + Math.min(1.3, dist / physics.DART + 0.15);
      return true;
    }
    if (b.passState) b.passState = 0;
    return false;
  }

  /** Hold (true) or let go this step. */
  function decide(b, world) {
    var me = world.kites[b.side], foe = world.kites[1 - b.side];
    if (!me) return false;
    var t = world.t;
    if (me.parked) {
      if (b.launchAt == null) b.launchAt = t + b.r.range(0.35, 0.9);
      if (t < b.launchAt) return false;
      b.target = null;
      b.pullUntil = t + 0.9;
      return true;
    }
    b.launchAt = null;
    if (world.duel && foe) return duelDecide(b, world, me);
    b.duelPhase = null;
    return flyDecide(b, world, me, foe);
  }

  return { STYLES: STYLES, MIN_D: MIN_D, params: params, create: create, decide: decide, linePoint: linePoint, distToLine: distToLine };
});
