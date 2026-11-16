/*
 * The save: one versioned object in Shell's save slot 'progress'. sanitize() rebuilds it over the
 * defaults, field by field with type checks, so a corrupt, partial or older save never crashes the game.
 * Everything here is pure (no Shell, no DOM) and covered by tests/progress.test.js.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.TT = root.TT || {}).progress = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;
  var ARCHIVE_KEEP = 120;

  function defaults() {
    return {
      race: 1,
      races: 0,
      dailies: 0,
      runs: 0,
      best: { stop: 0, reaction: 0, finish: 0, rush: 0 },
      clubs: { sub200: false, sub190: false, record: false },
      daily: { day: 0, state: 'none', result: null, tries: 0, again: false },
      streak: { count: 0, last: 0 },
      archive: {},
      ads: { sinceShown: 0, offerPending: false, offered: false },
      settings: { sound: true, haptics: true, motion: 'auto' },
      seen: { basics: false, sc: false, scIn: false, rival: false, cross: false, rush: false }
    };
  }

  function num(v, fallback, lo, hi) {
    if (typeof v !== 'number' || !isFinite(v)) return fallback;
    if (lo != null && v < lo) return fallback;
    if (hi != null && v > hi) return fallback;
    return v;
  }

  function bool(v, fallback) {
    return typeof v === 'boolean' ? v : fallback;
  }

  function obj(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  function cleanResult(r) {
    if (!r || typeof r !== 'object') return null;
    var finish = num(r.finish, 0, 1, 20);
    if (!finish) return null;
    var stops = Array.isArray(r.stops) ? r.stops.slice(0, 3).map(function (s) {
      s = obj(s);
      return { time: num(s.time, 0, 0, 999), places: num(s.places, 0, -9, 9), unsafe: bool(s.unsafe, false), redo: bool(s.redo, false) };
    }) : [];
    return {
      finish: finish, grid: num(r.grid, 9, 1, 20), gained: num(r.gained, 0, -20, 20),
      reaction: r.reaction == null ? null : num(r.reaction, null, 0, 10), jump: bool(r.jump, false),
      stops: stops, total: num(r.total, 0, 0, 9999), tries: num(r.tries, 1, 1, 2)
    };
  }

  /** The save rebuilt over the defaults; anything missing or of the wrong type takes the default. */
  function sanitize(data) {
    var d = defaults();
    var s = obj(data);
    d.race = Math.floor(num(s.race, 1, 1, 1e6));
    d.races = Math.floor(num(s.races, 0, 0, 1e7));
    d.dailies = Math.floor(num(s.dailies, 0, 0, 1e7));
    d.runs = Math.floor(num(s.runs, 0, 0, 1e7));
    var b = obj(s.best);
    d.best = { stop: num(b.stop, 0, 0, 99), reaction: num(b.reaction, 0, 0, 10), finish: Math.floor(num(b.finish, 0, 0, 20)), rush: Math.floor(num(b.rush, 0, 0, 1e5)) };
    var c = obj(s.clubs);
    d.clubs = { sub200: bool(c.sub200, false), sub190: bool(c.sub190, false), record: bool(c.record, false) };
    var dl = obj(s.daily);
    var state = ['none', 'started', 'done', 'retired'].indexOf(dl.state) >= 0 ? dl.state : 'none';
    d.daily = { day: Math.floor(num(dl.day, 0, 0, 1e6)), state: state, result: cleanResult(dl.result), tries: Math.floor(num(dl.tries, 0, 0, 2)), again: bool(dl.again, false) };
    if (d.daily.state === 'done' && !d.daily.result) d.daily.state = 'retired';
    var st = obj(s.streak);
    d.streak = { count: Math.floor(num(st.count, 0, 0, 1e6)), last: Math.floor(num(st.last, 0, 0, 1e6)) };
    var ar = obj(s.archive);
    var keys = Object.keys(ar).filter(function (k) { return /^\d{1,6}$/.test(k) && num(ar[k], 0, 1, 20); });
    keys.sort(function (a, b) { return b - a; });
    keys.slice(0, ARCHIVE_KEEP).forEach(function (k) { d.archive[k] = ar[k]; });
    var ad = obj(s.ads);
    d.ads = { sinceShown: Math.floor(num(ad.sinceShown, 0, 0, 1e6)), offerPending: bool(ad.offerPending, false), offered: bool(ad.offered, false) };
    var se = obj(s.settings);
    d.settings = { sound: bool(se.sound, true), haptics: bool(se.haptics, true), motion: ['auto', 'reduced', 'full'].indexOf(se.motion) >= 0 ? se.motion : 'auto' };
    var sn = obj(s.seen);
    for (var k in d.seen) d.seen[k] = bool(sn[k], false);
    return d;
  }

  /** Shell.configureSave's migrate: older or odd saves are rebuilt over the defaults. */
  function migrate(data) {
    return sanitize(data);
  }

  // ---- recording ----

  /**
   * Notes the stops of a race or daily (standard tempo). Returns what changed: { best, clubs: [names] }.
   * The first sub-2.00 stop queues the one Remove ads offer.
   */
  function recordStops(save, stops) {
    var out = { best: false, clubs: [] };
    for (var i = 0; i < stops.length; i++) {
      var s = stops[i];
      if (!s || s.unsafe || !(s.time > 0)) continue;
      if (!save.best.stop || s.time < save.best.stop) { save.best.stop = s.time; out.best = true; }
      if (s.time < 2.00 && !save.clubs.sub200) {
        save.clubs.sub200 = true; out.clubs.push('sub200');
        if (!save.ads.offered) save.ads.offerPending = true;
      }
      if (s.time < 1.90 && !save.clubs.sub190) { save.clubs.sub190 = true; out.clubs.push('sub190'); }
      if (s.time <= 1.80 && !save.clubs.record) { save.clubs.record = true; out.clubs.push('record'); }
    }
    return out;
  }

  function recordReaction(save, reaction) {
    if (reaction == null || !(reaction > 0)) return false;
    if (!save.best.reaction || reaction < save.best.reaction) { save.best.reaction = reaction; return true; }
    return false;
  }

  function recordFinish(save, finish) {
    if (!save.best.finish || finish < save.best.finish) { save.best.finish = finish; return true; }
    return false;
  }

  /** A career race finished (summary from race.score). Moves the career on and counts it for the ads. */
  function finishCareer(save, summary) {
    save.races += 1;
    if (summary.n >= save.race) save.race = summary.n + 1;
    save.ads.sinceShown += 1;
    var stops = recordStops(save, summary.stops);
    return { stops: stops, reaction: recordReaction(save, summary.reaction), finish: recordFinish(save, summary.finish) };
  }

  /** Today's daily state, reset when the day has moved on. */
  function dailyFor(save, today) {
    if (save.daily.day !== today) save.daily = { day: today, state: 'none', result: null, tries: 0, again: false };
    return save.daily;
  }

  function startDaily(save, today, again) {
    var d = dailyFor(save, today);
    if (again) d.again = true;
    d.tries = Math.min(2, d.tries + 1);
    d.state = 'started';
    return d;
  }

  function better(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (b.finish !== a.finish) return b.finish < a.finish ? b : a;
    return b.total < a.total ? b : a;
  }

  function finishDaily(save, today, summary) {
    var d = dailyFor(save, today);
    var res = cleanResult(summary);
    var prev = d.result;
    d.result = better(prev, res);
    d.result.tries = d.tries;
    d.state = 'done';
    save.dailies += 1;
    if (save.streak.last !== today) {
      save.streak.count = save.streak.last === today - 1 ? save.streak.count + 1 : 1;
      save.streak.last = today;
    }
    var stops = recordStops(save, summary.stops);
    return { stops: stops, reaction: recordReaction(save, summary.reaction), finish: recordFinish(save, summary.finish) };
  }

  /** Leaving today's daily mid-race retires it (a done daily stays done). */
  function retireDaily(save, today) {
    var d = dailyFor(save, today);
    if (d.state === 'started') d.state = d.result ? 'done' : 'retired';
    return d;
  }

  /** The streak as it stands today: it lapses when yesterday's daily was missed. */
  function streakNow(save, today) {
    return save.streak.last >= today - 1 ? save.streak.count : 0;
  }

  /** A past daily played from the archive or a link: kept apart, never scored on the streak. */
  function finishArchive(save, day, summary) {
    var prev = save.archive[day];
    if (!prev || summary.finish < prev) save.archive[day] = summary.finish;
    var keys = Object.keys(save.archive).sort(function (a, b) { return b - a; });
    keys.slice(ARCHIVE_KEEP).forEach(function (k) { delete save.archive[k]; });
  }

  /** A Stop Rush run ended with [cleared] stops. */
  function finishRun(save, cleared) {
    save.runs += 1;
    if (cleared > save.best.rush) { save.best.rush = cleared; return true; }
    return false;
  }

  return {
    VERSION: VERSION, defaults: defaults, sanitize: sanitize, migrate: migrate,
    recordStops: recordStops, recordReaction: recordReaction, recordFinish: recordFinish,
    finishCareer: finishCareer, dailyFor: dailyFor, startDaily: startDaily, finishDaily: finishDaily,
    retireDaily: retireDaily, streakNow: streakNow, finishArchive: finishArchive, finishRun: finishRun
  };
});
