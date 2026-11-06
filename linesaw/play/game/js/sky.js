/*
 * A solo sky: 75 seconds, three kites, AI rivals one at a time from the right-hand rooftop, scored by cuts
 * with a multiplier for cuts in a row. Also the Daily sky (seeded by the day number, fixed difficulty)
 * and the first launch's lesson (three rings, then a practice rival). Pure and deterministic: the same
 * options and the same hold per step give the same sky.
 *
 * Phases: play, out (the last kite was cut before sunset; the caller offers Spare kite or ends the sky)
 * and over.
 */
(function (root, factory) {
  var node = typeof require === 'function' && typeof module === 'object';
  var m = factory(
    node ? require('./rng.js') : root.LS.rng,
    node ? require('./physics.js') : root.LS.physics,
    node ? require('./ai.js') : root.LS.ai
  );
  if (node && module.exports) module.exports = m;
  else (root.LS = root.LS || {}).sky = m;
})(typeof self !== 'undefined' ? self : this, function (rng, physics, ai) {
  'use strict';

  var DURATION = 75;
  var OVERTIME = 6;
  var KITES = 3;
  var RESPAWN = 1.0;
  var RIVAL_GAP = 1.2;
  var FIRST_RIVAL = 1.4;
  var MULT_CAP = 5;
  var PLAYER_HAND = 24, RIVAL_HAND = 66;
  var RINGS = [{ x: 64, y: 92 }, { x: 26, y: 116 }, { x: 62, y: 132 }];
  var RING_R = 10;
  var CUE_LEAD = 0.25;      // a reaction time: Hold shows this early, so a press on the word lands on the ring
  var CUE_HOLD_MIN = 0.3;   // Hold stays up at least this long, so it reads as a word, not a flicker

  // Rival strength for the k-th rival (from 0) of solo sky n (from 1). Skies 1 to 11 sit in ai.js's
  // newcomer range below 0, so a first-time player lands several cuts; full strength comes at about
  // sky 30.
  function difficulty(number, k) {
    return Math.min(1, -0.6 + 0.055 * (Math.max(1, number) - 1) + 0.02 * k);
  }

  function dailyDifficulty(k) {
    return Math.min(1, 0.3 + 0.04 * k);
  }

  /** The rival styles in order: shuffled rounds of the three, never the same twice running. */
  function rivalOrder(seed, count, startWithDrifter) {
    var r = rng.make(rng.mix32(seed ^ 0x51ed27));
    var out = [];
    while (out.length < count) {
      var round = ai.STYLES.slice();
      for (var i = round.length - 1; i > 0; i--) {
        var j = Math.floor(r.next() * (i + 1));
        var tmp = round[i]; round[i] = round[j]; round[j] = tmp;
      }
      if (out.length && round[0] === out[out.length - 1]) round.push(round.shift());
      out = out.concat(round);
    }
    if (startWithDrifter) {
      var at = out.indexOf('drifter');
      if (at > 0) { out.splice(at, 1); out.unshift('drifter'); }
      for (var k = 1; k < out.length; k++) {
        if (out[k] === out[k - 1]) { var s = out.splice(k, 1)[0]; out.push(s); }
      }
    }
    return out.slice(0, count);
  }

  function skySeed(number) { return rng.hashString('linesaw-sky-' + number); }
  function dailySeed(day) { return rng.hashString('linesaw-daily-' + day); }

  /**
   * opts: number (solo sky n, 1 and up), day (a Daily day number instead), tutorial (bool), pattern
   * (the player's paper).
   */
  function create(opts) {
    opts = opts || {};
    var tutorial = !!opts.tutorial;
    var day = opts.day | 0;
    var number = Math.max(1, opts.number | 0);
    var seed = tutorial ? rng.hashString('linesaw-lesson') : day ? dailySeed(day) : skySeed(number);
    var r = rng.make(seed);
    var wind = tutorial ? { base: -1.5, amp: 0.5, gustMag: 0 } : { base: 3 + 4 * r.next(), amp: 2, gustEvery: 11, gustMag: 6 };
    var world = physics.createWorld({ seed: seed, wind: wind });
    var sky = {
      mode: tutorial ? 'lesson' : day ? 'daily' : 'solo',
      number: number, day: day, seed: seed, world: world,
      duration: tutorial ? Infinity : DURATION,
      phase: 'play', reason: null,
      kitesLeft: KITES, lost: 0, cuts: 0, score: 0, streak: 0, savedStreak: 0,
      longest: 0, duels: 0, wonFromBelow: 0, spareUsed: false, overtime: false,
      rivalIndex: 0, brain: null, rivalStyle: null, rivalD: 0,
      playerAt: -1, rivalAt: tutorial ? -1 : FIRST_RIVAL,
      order: tutorial ? ['train'] : rivalOrder(seed, 40, !day && number === 1),
      pattern: opts.pattern | 0,
      ring: tutorial ? 0 : -1, ringT: 0, rings: RINGS, cue: tutorial ? 'hold' : null, cueUntil: 0,
      events: []
    };
    physics.addKite(world, 0, { hand: PLAYER_HAND, pattern: sky.pattern });
    return sky;
  }

  function emit(sky, type, data) {
    sky.events.push({ type: type, t: sky.world.t, data: data || null });
  }

  function spawnRival(sky) {
    var k = sky.rivalIndex;
    var style = sky.order[k % sky.order.length];
    var d = sky.mode === 'lesson' ? 0 : sky.mode === 'daily' ? dailyDifficulty(k) : difficulty(sky.number, k);
    var p = ai.params(style, d);
    sky.brain = ai.create({ style: style, d: d, side: 1, seed: rng.mix32(sky.seed + 0x2f6b * (k + 1)) });
    sky.rivalStyle = style;
    sky.rivalD = d;
    physics.addKite(sky.world, 1, { hand: RIVAL_HAND, saw: p.saw, pattern: k % 3 });
    sky.rivalAt = -1;
    emit(sky, 'rival', { style: style, d: d, index: k });
  }

  function ringRadius(sky) {
    return RING_R + Math.min(6, sky.ringT / 5);
  }

  /** One fixed step. hold: the player's input this step. */
  function step(sky, hold) {
    if (sky.phase !== 'play') return sky;
    var w = sky.world;
    var t = w.t;
    if (!w.kites[0] && sky.playerAt >= 0 && t >= sky.playerAt) {
      physics.addKite(w, 0, { hand: PLAYER_HAND, pattern: sky.pattern });
      sky.playerAt = -1;
      emit(sky, 'respawn', null);
    }
    if (!w.kites[1] && sky.rivalAt >= 0 && t >= sky.rivalAt) spawnRival(sky);
    var rh = sky.brain && w.kites[1] ? ai.decide(sky.brain, w) : false;
    physics.step(w, [!!hold, rh]);
    var evs = w.events;
    for (var i = 0; i < evs.length; i++) handle(sky, evs[i]);
    evs.length = 0;
    if (sky.phase !== 'play') return sky;

    if (sky.mode === 'lesson') {
      stepLesson(sky);
      return sky;
    }
    if (w.t >= sky.duration) {
      if (w.duel && w.t < sky.duration + OVERTIME) {
        if (!sky.overtime) { sky.overtime = true; emit(sky, 'overtime', null); }
      } else {
        finish(sky, 'sunset');
      }
    }
    return sky;
  }

  function stepLesson(sky) {
    var w = sky.world;
    var k = w.kites[0];
    if (sky.ring >= 0 && sky.ring < sky.rings.length) {
      if (k && !k.parked) sky.ringT += physics.DT;
      var g = sky.rings[sky.ring];
      if (k) {
        var dx = k.x - g.x, dy = k.y - g.y;
        var rr = ringRadius(sky);
        if (dx * dx + dy * dy <= rr * rr) {
          emit(sky, 'ring', { index: sky.ring, x: g.x, y: g.y });
          sky.ring++;
          sky.ringT = 0;
          if (sky.ring >= sky.rings.length) sky.rivalAt = w.t + 0.8;
        }
      }
    }
    sky.cue = lessonCue(sky);
  }

  /**
   * The lesson's hint: hold, letGo, steer (slack, the nose turning), cross (fly across the rival's line),
   * duel, duelLetGo (the line runs hot) or null. Hold is said a reaction time before the nose points at the
   * ring, because a player who waits for the nose to be on it presses too late at 200 degrees a second.
   */
  function lessonCue(sky) {
    var w = sky.world, k = w.kites[0];
    if (!k) return null;
    if (k.parked) return 'hold';
    if (sky.ring >= 0 && sky.ring < sky.rings.length) {
      var g = sky.rings[sky.ring];
      var want = physics.headingTo(k.x, k.y, g.x, g.y);
      if (k.hold) {
        sky.cueUntil = 0;
        // Keep pulling while the kite still heads for the ring; let go once it is clearly off course.
        return k.y > 30 && Math.abs(physics.wrap(want - k.th)) > 0.6 ? 'letGo' : null;
      }
      if (Math.abs(physics.wrap(want - (k.th + k.om * CUE_LEAD))) < 0.3) sky.cueUntil = w.t + CUE_HOLD_MIN;
      return w.t < sky.cueUntil ? 'hold' : 'steer';
    }
    var r = w.kites[1];
    if (w.duel) return k.heat > 0.45 ? 'duelLetGo' : 'duel';
    if (r && !r.parked) return 'cross';
    return null;
  }

  function handle(sky, e) {
    var w = sky.world;
    var d = e.data;
    if (e.type === 'cut') {
      sky.longest = Math.max(sky.longest, d.time);
      if (d.loser === 1) {
        sky.cuts++;
        sky.streak++;
        var mult = Math.min(MULT_CAP, sky.streak);
        sky.score += mult;
        if (d.below === 0) sky.wonFromBelow++;
        physics.removeKite(w, 1);
        sky.brain = null;
        sky.rivalIndex++;
        emit(sky, 'rivalCut', { mult: mult, score: sky.score, cuts: sky.cuts, time: d.time, below: d.below === 0, cut: d });
        if (sky.mode === 'lesson') { finish(sky, 'lesson'); return; }
        sky.rivalAt = w.t + RIVAL_GAP;
      } else {
        physics.removeKite(w, 0);
        sky.lost++;
        sky.savedStreak = sky.streak;
        sky.streak = 0;
        if (sky.mode !== 'lesson') sky.kitesLeft--;
        emit(sky, 'kiteLost', { kitesLeft: sky.kitesLeft, time: d.time, cut: d });
        if (sky.kitesLeft <= 0) {
          sky.phase = 'out';
          emit(sky, 'out', null);
        } else {
          sky.playerAt = w.t + RESPAWN;
        }
      }
    } else if (e.type === 'duelStart') {
      sky.duels++;
      emit(sky, 'duelStart', d);
    } else if (e.type === 'duelEnd') {
      sky.longest = Math.max(sky.longest, d.time);
      emit(sky, 'duelEnd', d);
    } else if (e.type === 'launch') {
      emit(sky, 'launch', d);
    }
  }

  function finish(sky, reason) {
    if (sky.phase === 'over') return;
    sky.phase = 'over';
    sky.reason = reason;
    emit(sky, 'over', { reason: reason });
  }

  /** Spare kite: a fourth kite after the third was cut, keeping the score and the run of cuts. */
  function grantSpare(sky) {
    if (sky.phase !== 'out' || sky.spareUsed) return false;
    sky.spareUsed = true;
    sky.kitesLeft = 1;
    sky.streak = sky.savedStreak;
    sky.phase = 'play';
    sky.playerAt = sky.world.t + 0.6;
    emit(sky, 'spare', null);
    return true;
  }

  /** Ends a sky that is out of kites (Spare kite declined or not offered), or one the player left. */
  function end(sky, reason) {
    finish(sky, reason || (sky.phase === 'out' ? 'kites' : 'left'));
  }

  function timeLeft(sky) {
    return Math.max(0, sky.duration - sky.world.t);
  }

  function result(sky) {
    return {
      mode: sky.mode, number: sky.number, day: sky.day,
      cuts: sky.cuts, score: sky.score, lost: sky.lost,
      duel: Math.round(sky.longest * 10) / 10, spare: sky.spareUsed,
      wonFromBelow: sky.wonFromBelow, reason: sky.reason
    };
  }

  return {
    DURATION: DURATION, OVERTIME: OVERTIME, KITES: KITES, MULT_CAP: MULT_CAP, RINGS: RINGS,
    PLAYER_HAND: PLAYER_HAND, RIVAL_HAND: RIVAL_HAND,
    difficulty: difficulty, dailyDifficulty: dailyDifficulty, rivalOrder: rivalOrder,
    skySeed: skySeed, dailySeed: dailySeed, ringRadius: ringRadius,
    create: create, step: step, grantSpare: grantSpare, end: end, timeLeft: timeLeft, result: result
  };
});
