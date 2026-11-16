/*
 * A race: a lights-out start plus three stops, each after one pit wall call. This module builds a race
 * from a seed (career race N, the Daily Grand Prix of day N, or the lesson), runs the start lights, and
 * turns the start, the calls and the stop times into places with a fixed formula: no AI field, no circuit.
 *
 * Sky cells: 0 sun, 1 cloud (both dry), 2 drizzle (damp), 3 rain (wet). Tyres: 0 Dry, 1 Inter, 2 Wet.
 */
(function (root, factory) {
  var m = factory(root.TT && root.TT.rng ? root.TT.rng : require('./rng.js'));
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.TT = root.TT || {}).race = m;
})(typeof self !== 'undefined' ? self : this, function (rng) {
  'use strict';

  var GRID = 9;
  var FILL = 0.34;          // the standard tempo every race and daily stop uses
  var LIGHT0 = 0.6;         // the first lamp pair lights
  var LIGHT_GAP = 0.7;      // then one more every 0.7 s
  var NO_TAP = 1.0;         // a start with no tap counts as this reaction
  var JUMP_SECONDS = 5;
  var CALL_CLOCK = 4;
  var CELL_TYRE = [0, 0, 1, 2];

  // ---- the formula ----

  function startPlaces(reaction, jump) {
    if (jump) return -3;
    if (reaction < 0.200) return 2;
    if (reaction < 0.280) return 1;
    if (reaction < 0.400) return 0;
    if (reaction < 0.700) return -1;
    return -2;
  }

  function stopPlaces(time) {
    if (time <= 1.80) return 3;
    if (time < 1.90) return 2;
    if (time < 2.00) return 1;
    if (time < 2.40) return 0;
    if (time < 3.00) return -1;
    if (time < 4.50) return -2;
    return -3;
  }

  /** Places for a call answered with choice: a tyre 0..2, or 'box' / 'stay'. */
  function callPlaces(call, choice) {
    if (call.type === 'sc') {
      if (!call.ending) return choice === 'box' ? 2 : 0;
      return choice === 'stay' ? 1 : -1;
    }
    return choice === call.answer ? 1 : -1;
  }

  function callRight(call, choice) {
    return call.type === 'sc' ? choice === call.answer : choice === call.answer;
  }

  function finishFrom(grid, gained) {
    return Math.max(1, Math.min(20, grid - gained));
  }

  // ---- building a race ----

  function expectedClean(fill) {
    return 0.14 + 4 * fill + 0.25;
  }

  function rivalsFor(r, fill, pair) {
    var first = expectedClean(fill) + r.range(-0.30, 0.40);
    var list = [round3(first)];
    if (pair) list.push(round3(first + 0.97 + r.range(0, 0.25)));
    return list;
  }

  function round3(x) {
    return Math.round(x * 1000) / 1000;
  }

  /** Five sky cells whose most common tyre is [tyre], with at least [count] cells of it. */
  function strip(r, tyre, count, from) {
    var cells = [];
    for (var i = 0; i < count; i++) cells.push(tyre);
    var others = [0, 1, 2].filter(function (x) { return x !== tyre; });
    var other = r.pick(others);
    for (var j = count; j < 5; j++) cells.push(r.chance(0.7) ? other : r.pick(others));
    // Make sure no other tyre ties the majority.
    var n = [0, 0, 0];
    cells.forEach(function (c) { n[c]++; });
    for (var k = 0; k < 3; k++) {
      if (k !== tyre && n[k] >= n[tyre]) return strip(r, tyre, count + 1, from);
    }
    // A forecast reads as a trend: wetter or drier lap by lap, in the direction of the change.
    var wetter = tyre >= from;
    cells.sort(function (a, b) { return wetter ? a - b : b - a; });
    return cells.map(function (c) { return c === 0 ? (r.chance(0.5) ? 0 : 1) : c + 1; });
  }

  function tyreOfCells(cells) {
    var n = [0, 0, 0];
    cells.forEach(function (c) { n[CELL_TYRE[c]]++; });
    var best = 0;
    for (var k = 1; k < 3; k++) if (n[k] > n[best]) best = k;
    return best;
  }

  function lesson() {
    return {
      kind: 'career', n: 1, lesson: true, seed: rng.hashString('twotenths:race:1'), grid: GRID,
      lights: { delay: 1.0 },
      calls: [
        { type: 'tyre', cells: [0, 1, 0, 0, 1], answer: 0, clock: 0 },
        { type: 'tyre', cells: [3, 3, 3, 3, 3], answer: 2, clock: 0 },
        { type: 'tyre', cells: [3, 2, 2, 2, 2], answer: 1, clock: 0 }
      ],
      stops: [
        { approach: 1.5, fill: 0.48, zone: 0.40, order: [0, 1, 3, 2], cross: -1, rivals: [], wet: false },
        { approach: 1.4, fill: 0.48, zone: 0.40, order: [1, 0, 2, 3], cross: -1, rivals: [], wet: true },
        { approach: 1.3, fill: 0.48, zone: 0.40, order: [0, 1, 3, 2], cross: -1, rivals: [], lessonRival: 0.5, wet: true }
      ]
    };
  }

  var ORDERS = [
    [0, 1, 3, 2], [1, 0, 2, 3], [0, 2, 3, 1], [1, 3, 2, 0], // around the car
    [0, 1, 2, 3], [1, 0, 3, 2], [2, 3, 1, 0], [3, 2, 0, 1], // front pair, rear pair
    [0, 3, 1, 2], [1, 2, 0, 3]                              // diagonals (harder)
  ];

  function params(kind, n) {
    if (kind === 'daily') {
      return { zone: 0.22, rivalP: 0.35, pairs: true, crossStops: 1, crossP: 0, scP: 0.5, ending: true, bare: 0.4, orders: 10 };
    }
    if (n <= 3) return { zone: 0.28, rivalP: 0.25, pairs: false, crossStops: 0, crossP: 0, scP: n === 2 ? 1 : 0.3, ending: false, bare: 0, orders: 4, forceSc: n === 2 };
    if (n <= 9) return { zone: 0.22, rivalP: 0.35, pairs: n >= 6, crossStops: n % 2 === 0 ? 1 : 0, crossP: 0, scP: 0.35, ending: true, bare: 0.2, orders: 8 };
    return { zone: 0.18, rivalP: 0.45, pairs: true, crossStops: 0, crossP: 0.30, scP: 0.4, ending: true, bare: 0.6, orders: 10 };
  }

  /**
   * A race from its spec: { kind: 'career', n } or { kind: 'daily', day }. Career race 1 is the lesson.
   * The same spec always gives the same race.
   */
  function build(spec) {
    if (spec.kind === 'career' && (spec.n | 0) <= 1) return lesson();
    var kind = spec.kind === 'daily' ? 'daily' : 'career';
    var n = kind === 'daily' ? spec.day | 0 : spec.n | 0;
    var seed = rng.hashString('twotenths:' + kind + ':' + n);
    var r = rng.make(seed);
    var p = params(kind, n);
    var race = { kind: kind, n: kind === 'career' ? n : 0, day: kind === 'daily' ? n : 0, lesson: false, seed: seed, grid: GRID };
    race.lights = { delay: round3(r.range(0.4, 2.6)) };

    // Calls: tyres follow a changing sky; at most one safety car call per race.
    var scAt = -1;
    if (p.forceSc) scAt = 1;
    else if (r.chance(p.scP)) scAt = r.int(0, 2);
    var fitted = 0;
    var calls = [];
    var wet = [];
    for (var i = 0; i < 3; i++) {
      if (i === scAt) {
        var ending = p.ending && !p.forceSc && r.chance(0.5);
        calls.push({ type: 'sc', ending: ending, answer: ending ? 'stay' : 'box', clock: CALL_CLOCK, fitted: fitted });
      } else {
        var tyre = r.chance(0.55) ? r.pick([0, 1, 2].filter(function (x) { return x !== fitted; })) : fitted;
        var count = r.chance(p.bare) ? 3 : r.int(3, 5);
        var cells = strip(r, tyre, count, fitted);
        calls.push({ type: 'tyre', cells: cells, answer: tyre, clock: CALL_CLOCK, fitted: fitted });
        fitted = tyre;
      }
      wet.push(fitted > 0);
    }
    race.calls = calls;

    // Stops.
    var crossStop = p.crossStops ? r.int(0, 2) : -1;
    var rivalStops = [];
    for (var s = 0; s < 3; s++) rivalStops.push(r.chance(p.rivalP));
    if (kind === 'daily' && rivalStops.indexOf(true) < 0) rivalStops[r.int(0, 2)] = true;
    race.stops = [];
    for (var k = 0; k < 3; k++) {
      var order = ORDERS[r.int(0, p.orders - 1)];
      var cross = -1;
      if (k === crossStop || (p.crossP && r.chance(p.crossP))) cross = r.int(0, 3);
      var rivals = rivalStops[k] ? rivalsFor(r, FILL, p.pairs && r.chance(0.4)) : [];
      race.stops.push({
        approach: round3(r.range(1.0, 1.3)), fill: FILL, zone: p.zone, order: order.slice(), cross: cross,
        rivals: rivals, wet: wet[k]
      });
    }
    return race;
  }

  // ---- the start lights ----

  function outTime(race) {
    return LIGHT0 + 4 * LIGHT_GAP + race.lights.delay;
  }

  /** How many lamp pairs are lit at time t (0 to 5); 0 again once they go out. */
  function litAt(race, t) {
    if (t >= outTime(race)) return 0;
    if (t < LIGHT0) return 0;
    return Math.min(5, 1 + Math.floor((t - LIGHT0) / LIGHT_GAP + 1e-9));
  }

  /** A tap at time t during the start: ignored before the first lamp, a jump while lit, else a reaction. */
  function startTap(race, t) {
    if (t < LIGHT0) return { what: 'ignored' };
    var out = outTime(race);
    if (t < out) return { what: 'jump' };
    return { what: 'start', reaction: Math.min(NO_TAP, round3(t - out)) };
  }

  // ---- the result ----

  /**
   * The race result from what happened: { reaction, jump, choices: [3], stops: [3 stop results] }.
   * places: per element; finish: the classified position.
   */
  function score(race, run) {
    var started = run.jump || run.reaction != null;
    var start = started ? startPlaces(run.reaction, run.jump) : 0;
    // Nobody loses places while learning: the lesson counts a slow start or a slow stop as zero.
    if (race.lesson) start = Math.max(0, start);
    var calls = [];
    var callSum = 0;
    for (var i = 0; i < run.choices.length; i++) {
      var c = race.calls[i];
      var ch = run.choices[i];
      var pl = callPlaces(c, ch);
      calls.push({ choice: ch, right: callRight(c, ch), places: pl });
      callSum += pl;
    }
    var stops = [];
    var stopSum = 0;
    var total = 0;
    for (var k = 0; k < run.stops.length; k++) {
      var t = run.stops[k].time;
      // A slower tempo (the lesson) is judged against its own pace: each ring's extra fill comes off.
      var fill = race.stops[k] && race.stops[k].fill ? race.stops[k].fill : FILL;
      var sp = stopPlaces(t - 4 * Math.max(0, fill - FILL));
      if (race.lesson) sp = Math.max(0, sp);
      stops.push({ time: t, places: sp, unsafe: !!run.stops[k].unsafe, redo: !!run.stops[k].redo });
      stopSum += sp;
      total += t;
    }
    var gained = start + callSum + stopSum;
    return {
      kind: race.kind, n: race.n, day: race.day, grid: race.grid,
      reaction: run.jump ? null : run.reaction, jump: !!run.jump,
      start: start, calls: calls, stops: stops, callPlaces: callSum, stopPlaces: stopSum,
      total: Math.round(total * 1000) / 1000, finish: finishFrom(race.grid, gained),
      gained: race.grid - finishFrom(race.grid, gained)
    };
  }

  /** The index of the slowest stop (the first of equals). */
  function slowest(stops) {
    var w = 0;
    for (var i = 1; i < stops.length; i++) if (stops[i].time > stops[w].time) w = i;
    return w;
  }

  return {
    GRID: GRID, FILL: FILL, LIGHT0: LIGHT0, LIGHT_GAP: LIGHT_GAP, NO_TAP: NO_TAP, JUMP_SECONDS: JUMP_SECONDS,
    CALL_CLOCK: CALL_CLOCK, CELL_TYRE: CELL_TYRE, ORDERS: ORDERS,
    build: build, lesson: lesson, params: params, outTime: outTime, litAt: litAt, startTap: startTap,
    startPlaces: startPlaces, stopPlaces: stopPlaces, callPlaces: callPlaces, callRight: callRight,
    finishFrom: finishFrom, score: score, slowest: slowest, tyreOfCells: tyreOfCells, expectedClean: expectedClean
  };
});
