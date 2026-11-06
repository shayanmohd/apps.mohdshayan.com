/*
 * The Daily airport. The daily number comes from the player's local date, as Wordle does, so it flips
 * at local midnight and the same number means the same airport, aircraft and air everywhere.
 */
(function (root, factory) {
  var node = typeof require === 'function' && typeof module === 'object';
  var m = factory(node ? require('./rng.js') : root.BL.rng);
  if (node && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).daily = m;
})(typeof self !== 'undefined' ? self : this, function (rng) {
  'use strict';

  var EPOCH = Date.UTC(2026, 10, 1); // 1 November 2026 is day 1
  var DAY_MS = 86400000;
  var APPROACHES = 5;
  var AIRPORTS = ['island', 'mountain', 'night', 'shear'];
  var AIRCRAFT = ['bush', 'turboprop', 'jet'];

  /** Day number for a local date (a Date, read in the device's own time zone). */
  function dayNumber(date) {
    var d = date || new Date();
    return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / DAY_MS) + 1;
  }

  // Never the same airport two days running: each day moves on from the day before by a seeded step of
  // 1 to 3. The chain starts at day 1 and is kept, so it costs one hash per day once.
  var chain = [0];
  function airportIndex(n) {
    n = Math.min(n, 200000);
    while (chain.length <= n) {
      var k = chain.length;
      var r = rng.make(rng.hashString('butterline-daily-airport-' + k));
      chain.push(k === 1 ? r.int(0, AIRPORTS.length - 1) : (chain[k - 1] + 1 + r.int(0, AIRPORTS.length - 2)) % AIRPORTS.length);
    }
    return chain[n];
  }

  /** Everything about day n that must match on every device. */
  function config(n) {
    n = Math.max(1, n | 0);
    var seed = rng.hashString('butterline-daily-' + n);
    var r = rng.make(seed);
    var airport = AIRPORTS[airportIndex(n)];
    var roll = r.next();
    var aircraft = roll < 0.4 ? 'bush' : roll < 0.75 ? 'turboprop' : 'jet';
    var approaches = [];
    for (var k = 0; k < APPROACHES; k++) {
      approaches.push({ seed: rng.hashString('butterline-daily-' + n + '-' + k), step: 1 + 0.75 * k });
    }
    return { day: n, airport: airport, aircraft: aircraft, approaches: approaches };
  }

  /** Aircraft offered for the second round: the other two. */
  function otherAircraft(n) {
    var main = config(n).aircraft;
    return AIRCRAFT.filter(function (a) { return a !== main; });
  }

  /** Seed of a second-round approach (another aircraft, the same air). */
  function secondSeed(n, k) {
    return config(n).approaches[k].seed;
  }

  return {
    EPOCH: EPOCH,
    APPROACHES: APPROACHES,
    dayNumber: dayNumber,
    config: config,
    otherAircraft: otherAircraft,
    secondSeed: secondSeed
  };
});
