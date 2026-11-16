/*
 * One pit stop, as pure logic with no drawing. Every moving part is a closed-form function of time
 * (the car's approach, each ring's fill, the rivals in the fast lane), so a tap is judged exactly at its
 * own instant, taken from the pointer event's timestamp, even between frames. step() advances the stop
 * on the fixed 120 Hz clock and applies the transitions that fall due (a nut that cross-threads on its
 * own, a lockout ending, the car rolling long, the car leaving), emitting events for the renderer, the
 * sound and the haptics.
 *
 * Corners: 0 front left, 1 front right, 2 rear left, 3 rear right. The stopwatch runs from the catch
 * (the car halted on the front jack) to the moment the car moves.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.TT = root.TT || {}).stop = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ENTRY = 9;           // metres from the marker where the car starts its approach
  var MARKER_SPEED = 2.2;  // m/s as the nose meets the marker
  var OVERSHOOT = 0.6;     // metres past the marker where an uncaught car stops by itself
  var ROLL = 2 * OVERSHOOT / MARKER_SPEED; // seconds from the marker to that stop
  var EARLY_IGNORE = 0.35; // taps earlier than this before the marker are ignored
  var JACK_UP = 0.14;
  var DROP = 0.10;
  var CROSS_LOCK = 0.12;   // lockout after an early tap cross-threads a nut
  var CROSS_BACK = 0.40;   // the fill the ring falls back to after that
  var STUCK_AT = 0.55;     // where a scripted nut cross-threads by itself
  var UNSAFE = 5;          // seconds added for an unsafe release
  var DANGER_BEFORE = 0.50;
  var DANGER_AFTER = 0.12;
  var EXIT = 1.0;          // seconds the car takes to leave the box after it moves
  var RIVAL_SPEED = 12;    // m/s in the fast lane
  var PERFECT_RING = 0.03;

  // Catch grades: [largest |error| in seconds, penalty seconds, grade].
  var CATCH = [[0.035, 0, 'perfect'], [0.08, 0.06, 'good'], [0.15, 0.15, 'off'], [Infinity, 0.30, 'wide']];
  var LONG_PENALTY = 0.40;

  function create(cfg) {
    var c = {
      approach: cfg.approach || 1.1,
      fill: cfg.fill || 0.34,
      zone: cfg.zone == null ? 0.22 : cfg.zone,
      order: (cfg.order || [0, 1, 3, 2]).slice(),
      cross: cfg.cross == null ? -1 : cfg.cross,
      rivals: (cfg.rivals || []).slice(),
      lessonRival: cfg.lessonRival || 0
    };
    var dec = 2 * (ENTRY - MARKER_SPEED * c.approach) / (c.approach * c.approach);
    var rings = [];
    for (var i = 0; i < 4; i++) {
      rings.push({ corner: c.order[i], state: 'wait', start: 0, base: 0, lockUntil: 0, doneAt: 0, scripted: c.cross === i, stuckDone: false, grade: null, late: 0, crosses: 0 });
    }
    return {
      cfg: c, t: 0, dec: Math.max(0.5, dec), phase: 'approach', events: [],
      tCatch: -1, catchErr: 0, catchGrade: null, catchPenalty: 0, haltPos: 0, tJackUp: -1,
      rings: rings, wheel: 0, tArmed: -1, tPress: -1, tDown: -1, held: false,
      tLift: -1, tGo: -1, downed: false, unsafe: false, time: 0, red: false, crosses: 0
    };
  }

  // ---- closed forms ----

  /** The car's nose, in metres relative to the marker (negative before it), at time t on the approach. */
  function approachPos(s, t) {
    var A = s.cfg.approach;
    if (t <= A) {
      var u = A - t;
      return -(MARKER_SPEED * u + 0.5 * s.dec * u * u);
    }
    var v = Math.min(t - A, ROLL);
    var a = MARKER_SPEED / ROLL;
    return MARKER_SPEED * v - 0.5 * a * v * v;
  }

  /** The car's nose position at any time: the approach, the halt, then the exit. */
  function nose(s, t) {
    if (s.tCatch < 0 || t < s.tCatch) return Math.max(-ENTRY - 4, approachPos(s, t));
    if (s.tGo >= 0 && t > s.tGo) {
      var u = t - s.tGo;
      return 0.5 * 9 * u * u + 0.5 * u; // pulls away
    }
    // During the catch penalty the crew shuffles the car onto the marker.
    var settle = s.catchPenalty > 0 ? Math.min(1, (t - s.tCatch) / Math.max(0.05, s.catchPenalty)) : 1;
    var e = settle * settle * (3 - 2 * settle);
    return s.haltPos * (1 - e);
  }

  /** Sideways move into the fast lane after release, 0 to 1. */
  function exitSide(s, t) {
    if (s.tGo < 0 || t <= s.tGo) return 0;
    var u = Math.min(1, (t - s.tGo) / EXIT);
    return u * u * (3 - 2 * u);
  }

  function ringFill(r, fill, t) {
    if (r.state === 'done' || r.state === 'finishing') return 1;
    if (r.state === 'wait') return 0;
    if (r.state === 'stuck') return STUCK_AT;
    if (r.state === 'cross') return CROSS_BACK;
    return Math.min(1, r.base + Math.max(0, t - r.start) / fill);
  }

  function fullTime(r, fill) {
    return r.start + (1 - r.base) * fill;
  }

  /** Absolute times at which each rival's nose passes our box (needs the catch). */
  function rivalPasses(s) {
    if (s.tCatch < 0) return [];
    var out = [];
    for (var i = 0; i < s.cfg.rivals.length; i++) out.push(s.tCatch + s.cfg.rivals[i]);
    return out;
  }

  /** A rival's nose in metres relative to our box marker at time t (fast lane). */
  function rivalPos(pass, t) {
    return (t - pass) * RIVAL_SPEED;
  }

  function dangerAt(s, t) {
    var passes = rivalPasses(s);
    for (var i = 0; i < passes.length; i++) {
      if (t >= passes[i] - DANGER_BEFORE && t <= passes[i] + DANGER_AFTER) return true;
    }
    return false;
  }

  /** The end of the danger window that holds t, or t itself when the lane is clear. */
  function clearAfter(s, t) {
    var passes = rivalPasses(s).sort(function (a, b) { return a - b; });
    var x = t;
    for (var i = 0; i < passes.length; i++) {
      if (x >= passes[i] - DANGER_BEFORE && x <= passes[i] + DANGER_AFTER) x = passes[i] + DANGER_AFTER + 1e-6;
    }
    return x;
  }

  // ---- transitions ----

  function emit(s, type, t, extra) {
    var e = extra || {};
    e.type = type;
    e.t = t;
    s.events.push(e);
  }

  function doCatch(s, t, auto) {
    s.tCatch = t;
    s.haltPos = approachPos(s, t);
    s.catchErr = auto ? ROLL : t - s.cfg.approach;
    if (auto) {
      s.catchPenalty = LONG_PENALTY;
      s.catchGrade = 'long';
    } else {
      var a = Math.abs(s.catchErr);
      for (var i = 0; i < CATCH.length; i++) {
        if (a <= CATCH[i][0]) { s.catchPenalty = CATCH[i][1]; s.catchGrade = CATCH[i][2]; break; }
      }
    }
    s.tJackUp = t + s.catchPenalty + JACK_UP;
    s.phase = 'jackup';
    emit(s, 'catch', t, { grade: s.catchGrade, err: s.catchErr });
  }

  function startRing(s, i, t) {
    var r = s.rings[i];
    r.state = 'fill';
    r.start = t;
    r.base = 0;
    emit(s, 'ringStart', t, { i: i, corner: r.corner });
  }

  function finishRing(s, i, t) {
    var r = s.rings[i];
    r.state = 'done';
    r.doneAt = t;
    emit(s, 'wheel', t, { i: i, corner: r.corner, grade: r.grade });
    // The lesson's one rival is timed from the third wheel, so it meets a newcomer at the lamp.
    if (i === 2 && s.cfg.lessonRival) s.cfg.rivals.push(t - s.tCatch + s.cfg.fill + s.cfg.lessonRival);
    s.wheel = i + 1;
    if (s.wheel < 4) {
      startRing(s, s.wheel, t);
    } else {
      s.tArmed = t;
      s.phase = 'armed';
      emit(s, 'armed', t);
    }
  }

  /** Applies every scheduled transition due at or before time t, in order. */
  function settle(s, t) {
    for (var guard = 0; guard < 32; guard++) {
      if (s.phase === 'approach') {
        if (t >= s.cfg.approach + ROLL) { doCatch(s, s.cfg.approach + ROLL, true); continue; }
        return;
      }
      if (s.phase === 'jackup') {
        if (t >= s.tJackUp) {
          s.phase = 'wheels';
          emit(s, 'jackup', s.tJackUp);
          startRing(s, 0, s.tJackUp);
          continue;
        }
        return;
      }
      if (s.phase === 'wheels') {
        var i = s.wheel;
        var r = s.rings[i];
        if (r.state === 'finishing' && t >= r.doneAt) { finishRing(s, i, r.doneAt); continue; }
        if (r.state === 'cross' && t >= r.lockUntil) {
          r.state = 'fill';
          r.base = CROSS_BACK;
          r.start = r.lockUntil;
          continue;
        }
        if (r.state === 'fill' && r.scripted && !r.stuckDone && r.base < STUCK_AT) {
          var at = r.start + (STUCK_AT - r.base) * s.cfg.fill;
          if (t >= at) {
            r.state = 'stuck';
            r.stuckDone = true;
            emit(s, 'stuck', at, { i: i, corner: r.corner });
            s.crosses++;
            continue;
          }
        }
        return;
      }
      if (s.phase === 'armed' || s.phase === 'drop') {
        var red = dangerAt(s, t);
        if (red !== s.red) { s.red = red; emit(s, red ? 'redOn' : 'redOff', t); }
        if (s.phase === 'drop' && s.tDown >= 0 && !s.downed && t >= s.tDown) {
          s.downed = true;
          emit(s, 'down', s.tDown);
          continue;
        }
        if (s.phase === 'drop' && s.tLift >= 0 && t >= s.tGo) { go(s); continue; }
        return;
      }
      if (s.phase === 'gone') {
        if (t >= s.tGo + EXIT) { s.phase = 'done'; emit(s, 'done', s.tGo + EXIT); }
        return;
      }
      return;
    }
  }

  function go(s) {
    s.phase = 'gone';
    s.unsafe = dangerAt(s, s.tGo);
    s.time = s.tGo - s.tCatch + (s.unsafe ? UNSAFE : 0);
    emit(s, 'go', s.tGo, { unsafe: s.unsafe, time: s.time });
  }

  /** Runs the stop forward by dt seconds of simulation time. */
  function step(s, dt) {
    s.t += dt;
    settle(s, s.t);
  }

  /**
   * A press at time t (seconds of simulation time, from the event's timestamp) on a target:
   * 'any' (the catch), 'ring' with a corner, or 'lamp'. Returns what it did.
   */
  function press(s, t, target, corner) {
    t = Math.max(t, s.tCatch >= 0 ? s.tCatch : 0);
    settle(s, t);
    if (s.phase === 'approach') {
      if (t < s.cfg.approach - EARLY_IGNORE) return { what: 'ignored' };
      doCatch(s, t, false);
      return { what: 'catch', grade: s.catchGrade };
    }
    if (s.phase === 'wheels') {
      var i = s.wheel;
      var r = s.rings[i];
      if (target === 'ring' && corner !== r.corner) return { what: 'miss' };
      if (target !== 'ring' && target !== 'active') return { what: 'ignored' };
      if (r.state === 'stuck') {
        r.state = 'fill';
        r.base = STUCK_AT;
        r.start = t;
        emit(s, 'reseat', t, { i: i, corner: r.corner });
        return { what: 'reseat' };
      }
      if (r.state !== 'fill') return { what: 'ignored' };
      var f = ringFill(r, s.cfg.fill, t);
      if (f < 1 - s.cfg.zone) {
        r.state = 'cross';
        r.lockUntil = t + CROSS_LOCK;
        r.crosses++;
        s.crosses++;
        emit(s, 'cross', t, { i: i, corner: r.corner });
        return { what: 'cross' };
      }
      var full = fullTime(r, s.cfg.fill);
      r.grade = Math.abs(t - full) <= PERFECT_RING ? 'perfect' : t < full ? 'early' : 'late';
      r.late = Math.max(0, t - full);
      if (t < full) {
        r.state = 'finishing';
        r.doneAt = full;
        emit(s, 'gun', t, { i: i, corner: r.corner });
        settle(s, t);
      } else {
        emit(s, 'gun', t, { i: i, corner: r.corner });
        finishRing(s, i, t);
      }
      return { what: 'wheel', grade: r.grade };
    }
    if (s.phase === 'armed') {
      if (target !== 'lamp' && target !== 'active') return { what: 'ignored' };
      s.phase = 'drop';
      s.tPress = t;
      s.tDown = t + DROP;
      s.held = true;
      emit(s, 'drop', t);
      return { what: 'drop' };
    }
    return { what: 'ignored' };
  }

  /** The finger lifts at time t: in the drop phase this releases the car. */
  function lift(s, t) {
    if (s.phase !== 'drop' || !s.held) return { what: 'ignored' };
    t = Math.max(t, s.tPress);
    s.held = false;
    s.tLift = t;
    s.tGo = Math.max(t, s.tDown);
    settle(s, t);
    return { what: 'lift' };
  }

  /** The active target's kind, for keyboard play and the hints. */
  function active(s) {
    if (s.phase === 'approach') return 'catch';
    if (s.phase === 'wheels') return 'ring';
    if (s.phase === 'armed' || s.phase === 'drop') return 'lamp';
    return 'none';
  }

  /** The stopwatch reading at time t, in seconds (0 before the catch). */
  function watch(s, t) {
    if (s.tCatch < 0) return 0;
    if (s.tGo >= 0 && t >= s.tGo) return s.time;
    return Math.max(0, t - s.tCatch);
  }

  /** A summary of the finished stop. */
  function result(s) {
    var late = 0, perfect = 0;
    for (var i = 0; i < 4; i++) {
      late += s.rings[i].late || 0;
      if (s.rings[i].grade === 'perfect') perfect++;
    }
    return {
      time: Math.round(s.time * 1000) / 1000, unsafe: s.unsafe, catchGrade: s.catchGrade,
      catchErr: s.catchErr, crosses: s.crosses, perfectRings: perfect, late: late,
      waited: s.tGo >= 0 && s.tArmed >= 0 ? Math.max(0, s.tGo - s.tArmed - DROP) : 0
    };
  }

  return {
    ENTRY: ENTRY, ROLL: ROLL, JACK_UP: JACK_UP, DROP: DROP, UNSAFE: UNSAFE, EXIT: EXIT,
    DANGER_BEFORE: DANGER_BEFORE, DANGER_AFTER: DANGER_AFTER, RIVAL_SPEED: RIVAL_SPEED,
    CROSS_LOCK: CROSS_LOCK, CROSS_BACK: CROSS_BACK, STUCK_AT: STUCK_AT, EARLY_IGNORE: EARLY_IGNORE,
    create: create, step: step, press: press, lift: lift, settle: settle, active: active, watch: watch,
    result: result, nose: nose, exitSide: exitSide, ringFill: ringFill, fullTime: fullTime,
    rivalPasses: rivalPasses, rivalPos: rivalPos, dangerAt: dangerAt, clearAfter: clearAfter
  };
});
