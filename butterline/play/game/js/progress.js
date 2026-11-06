/*
 * The save: settings, logbook, unlocks, the day's Daily, the ad counters. sanitize() rebuilds a valid
 * save from anything (null, a string, an old or partial object, wrong types), so a corrupt or old save
 * never crashes the game.
 */
(function (root, factory) {
  var node = typeof require === 'function' && typeof module === 'object';
  var m = factory(
    node ? require('./aircraft.js') : root.BL.aircraft,
    node ? require('./airports.js') : root.BL.airports,
    node ? require('./grade.js') : root.BL.grade
  );
  if (node && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).progress = m;
})(typeof self !== 'undefined' ? self : this, function (aircraft, airports, grade) {
  'use strict';

  var VERSION = 1;
  var STAMPS = ['butter', 'firm', 'hard', 'bounce', 'stall', 'short', 'overrun', 'missed'];
  var GENTLE_LANDINGS = 3;

  function defaults() {
    return {
      settings: { sound: true, haptics: true },
      tutorialDone: false,
      ghostThumb: 0,
      ads: { finished: 0, landingsSinceAd: 0 },
      removeAdsPrompted: false,
      sel: { airport: 'island', aircraft: 'bush' },
      log: { attempts: 0, landings: 0, butters: 0, smoothest: null, bestRun: 0, bestRunScore: 0, butterRun: 0, bestButterRun: 0 },
      ghosts: {},
      daily: emptyDaily(0),
      streak: { last: 0, count: 0, best: 0, bestScore: 0 }
    };
  }

  function emptyDaily(day) {
    return { day: day, results: [], done: false, goAroundUsed: false, secondUsed: false, second: null, adUsed: false, keepRuns: 0, flying: null };
  }

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function num(v, fallback, lo, hi) {
    if (typeof v !== 'number' || !isFinite(v)) return fallback;
    if (lo != null && v < lo) return lo;
    if (hi != null && v > hi) return hi;
    return v;
  }
  function int(v, fallback) { return Math.floor(num(v, fallback, 0, 1e9)); }
  function bool(v, fallback) { return typeof v === 'boolean' ? v : fallback; }

  function cleanResult(r) {
    if (!isObj(r)) return null;
    var stamp = STAMPS.indexOf(r.stamp) >= 0 ? r.stamp : 'missed';
    return { stamp: stamp, fpm: int(r.fpm, 0), score: Math.min(100, int(r.score, 0)), ga: bool(r.ga, false) };
  }

  function cleanResults(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length && out.length < 5; i++) {
      var r = cleanResult(list[i]);
      if (r) out.push(r);
    }
    return out;
  }

  function cleanGhost(g) {
    if (!isObj(g) || !Array.isArray(g.pts)) return null;
    var pts = [];
    for (var i = 0; i < g.pts.length && i < 600; i++) {
      var v = g.pts[i];
      if (typeof v !== 'number' || !isFinite(v)) return null;
      pts.push(v);
    }
    if (pts.length % 3) pts.length -= pts.length % 3;
    return { fpm: int(g.fpm, 0), pts: pts };
  }

  /** A valid save from any input. */
  function sanitize(raw) {
    var s = defaults();
    if (!isObj(raw)) return s;
    if (isObj(raw.settings)) {
      s.settings.sound = bool(raw.settings.sound, true);
      s.settings.haptics = bool(raw.settings.haptics, true);
    }
    s.tutorialDone = bool(raw.tutorialDone, false);
    s.ghostThumb = int(raw.ghostThumb, 0);
    if (isObj(raw.ads)) {
      s.ads.finished = int(raw.ads.finished, 0);
      s.ads.landingsSinceAd = int(raw.ads.landingsSinceAd, 0);
    }
    s.removeAdsPrompted = bool(raw.removeAdsPrompted, false);
    if (isObj(raw.sel)) {
      if (airports.ids.indexOf(raw.sel.airport) >= 0) s.sel.airport = raw.sel.airport;
      if (aircraft.ids.indexOf(raw.sel.aircraft) >= 0) s.sel.aircraft = raw.sel.aircraft;
    }
    if (isObj(raw.log)) {
      var l = raw.log;
      s.log.attempts = int(l.attempts, 0);
      s.log.landings = int(l.landings, 0);
      s.log.butters = int(l.butters, 0);
      s.log.smoothest = l.smoothest == null ? null : int(l.smoothest, null);
      s.log.bestRun = int(l.bestRun, 0);
      s.log.bestRunScore = int(l.bestRunScore, 0);
      s.log.butterRun = int(l.butterRun, 0);
      s.log.bestButterRun = int(l.bestButterRun, 0);
    }
    if (isObj(raw.ghosts)) {
      aircraft.ids.forEach(function (id) {
        var g = cleanGhost(raw.ghosts[id]);
        if (g) s.ghosts[id] = g;
      });
    }
    if (isObj(raw.daily)) {
      var d = raw.daily;
      s.daily = emptyDaily(int(d.day, 0));
      s.daily.results = cleanResults(d.results);
      s.daily.done = bool(d.done, false) && s.daily.results.length >= 5;
      s.daily.goAroundUsed = bool(d.goAroundUsed, false);
      s.daily.secondUsed = bool(d.secondUsed, false);
      s.daily.adUsed = bool(d.adUsed, false);
      s.daily.keepRuns = Math.min(9, int(d.keepRuns, 0));
      if (isObj(d.second) && aircraft.ids.indexOf(d.second.aircraft) >= 0) {
        var res = cleanResults(d.second.results);
        s.daily.second = { aircraft: d.second.aircraft, results: res, done: bool(d.second.done, false) && res.length >= 5 };
      }
      if (isObj(d.flying)) s.daily.flying = { round: d.flying.round === 2 ? 2 : 1, ga: bool(d.flying.ga, false) };
    }
    if (isObj(raw.streak)) {
      s.streak.last = int(raw.streak.last, 0);
      s.streak.count = int(raw.streak.count, 0);
      s.streak.best = Math.max(s.streak.count, int(raw.streak.best, 0));
      s.streak.bestScore = Math.min(500, int(raw.streak.bestScore, 0));
    }
    if (s.log.smoothest != null && s.log.landings === 0) s.log.smoothest = null;
    return s;
  }

  /** Shell.configureSave's migrate: there is only version 1, so any older shape is sanitized. */
  function migrate(data) {
    return sanitize(data);
  }

  /** One finished touchdown attempt (any outcome). landing: {stamp, fpm, score, aircraft, flare}. */
  function recordLanding(s, landing) {
    var clean = grade.isClean(landing.stamp);
    s.log.attempts += 1;
    s.ads.landingsSinceAd += 1;
    if (clean) {
      s.log.landings += 1;
      if (s.log.smoothest == null || landing.fpm < s.log.smoothest) s.log.smoothest = landing.fpm;
      var ghost = s.ghosts[landing.aircraft];
      if (landing.flare && landing.flare.length >= 6 && (!ghost || landing.fpm < ghost.fpm)) {
        s.ghosts[landing.aircraft] = { fpm: landing.fpm, pts: landing.flare.slice(0, 600) };
      }
    }
    if (landing.stamp === 'butter') {
      s.log.butters += 1;
      s.log.butterRun += 1;
      if (s.log.butterRun > s.log.bestButterRun) s.log.bestButterRun = s.log.butterRun;
    } else {
      s.log.butterRun = 0;
    }
    return s;
  }

  /**
   * The flare assist (sim opts.gentle) flies a newcomer's Circuits approaches until the logbook holds
   * three clean landings. Never the Daily, which must fly the same for everyone.
   */
  function gentle(s, mode) {
    return mode === 'circuits' && s.log.landings < GENTLE_LANDINGS;
  }

  /** A finished run or Daily approach, for the "3 since install" ad rule. */
  function recordFinished(s) {
    s.ads.finished += 1;
    return s;
  }

  function recordRun(s, run) {
    if (run.landings > s.log.bestRun) s.log.bestRun = run.landings;
    if (run.score > s.log.bestRunScore) s.log.bestRunScore = run.score;
    return s;
  }

  function unlockAt(kind, id) {
    var item = kind === 'aircraft' ? aircraft.get(id) : airports.get(id);
    return item ? item.unlock : 0;
  }

  function isUnlocked(s, kind, id) {
    return s.log.landings >= unlockAt(kind, id);
  }

  /** Landings still needed for a locked item (0 when unlocked). */
  function landingsToUnlock(s, kind, id) {
    return Math.max(0, unlockAt(kind, id) - s.log.landings);
  }

  /** Makes sure the Daily slot belongs to day n. */
  function ensureDay(s, n) {
    if (s.daily.day !== n) s.daily = emptyDaily(n);
    return s.daily;
  }

  /** Records one Daily approach result; on the fifth, closes the day and updates the streak. */
  function recordDaily(s, n, result) {
    var d = ensureDay(s, n);
    if (d.done) return d;
    d.results.push(cleanResult(result));
    if (d.results.length >= 5) {
      d.done = true;
      var total = dailyTotal(d.results);
      s.streak.count = s.streak.last === n - 1 ? s.streak.count + 1 : (s.streak.last === n ? s.streak.count : 1);
      s.streak.last = n;
      if (s.streak.count > s.streak.best) s.streak.best = s.streak.count;
      if (total > s.streak.bestScore) s.streak.bestScore = total;
    }
    return d;
  }

  /** Replaces the last Daily approach after a go-around (the rewarded retry, marked on the card). */
  function replaceLastDaily(s, n, result) {
    var d = ensureDay(s, n);
    if (!d.results.length) return d;
    var wasDone = d.done;
    var r = cleanResult(result);
    r.ga = true;
    d.results[d.results.length - 1] = r;
    if (wasDone) {
      var total = dailyTotal(d.results);
      if (total > s.streak.bestScore) s.streak.bestScore = total;
    }
    return d;
  }

  function recordSecond(s, n, result) {
    var d = ensureDay(s, n);
    if (!d.second || d.second.done) return d;
    d.second.results.push(cleanResult(result));
    if (d.second.results.length >= 5) d.second.done = true;
    return d;
  }

  /** A Daily approach is in the air: kept in the save, so closing the game mid-approach is no free retry. */
  function startFlying(s, n, round, ga) {
    ensureDay(s, n).flying = { round: round === 2 ? 2 : 1, ga: !!ga };
    return s;
  }

  /**
   * At launch: a Daily approach left in the air (the game was closed or reloaded mid-approach) counts as
   * missed, as leaving it from the pause panel does. Returns true when it settled one.
   */
  function settleAbandoned(s) {
    var d = s.daily;
    var fl = d.flying;
    if (!fl) return false;
    d.flying = null;
    var miss = { stamp: 'missed', fpm: 0, score: 0 };
    if (fl.round === 2) {
      if (!d.second || d.second.done) return false;
      if (fl.ga && d.second.results.length) {
        var r = cleanResult(miss);
        r.ga = true;
        d.second.results[d.second.results.length - 1] = r;
      } else {
        recordSecond(s, d.day, miss);
      }
    } else if (d.done) {
      return false;
    } else if (fl.ga && d.results.length) {
      replaceLastDaily(s, d.day, miss);
    } else {
      recordDaily(s, d.day, miss);
    }
    recordFinished(s);
    return true;
  }

  function dailyTotal(results) {
    var t = 0;
    for (var i = 0; i < results.length; i++) t += results[i].score | 0;
    return t;
  }

  /** The streak as it stands today: it survives until the end of the day after the last daily. */
  function currentStreak(s, n) {
    return s.streak.last === n || s.streak.last === n - 1 ? s.streak.count : 0;
  }

  return {
    VERSION: VERSION,
    defaults: defaults,
    sanitize: sanitize,
    migrate: migrate,
    GENTLE_LANDINGS: GENTLE_LANDINGS,
    recordLanding: recordLanding,
    gentle: gentle,
    recordFinished: recordFinished,
    recordRun: recordRun,
    isUnlocked: isUnlocked,
    landingsToUnlock: landingsToUnlock,
    ensureDay: ensureDay,
    recordDaily: recordDaily,
    replaceLastDaily: replaceLastDaily,
    recordSecond: recordSecond,
    startFlying: startFlying,
    settleAbandoned: settleAbandoned,
    dailyTotal: dailyTotal,
    currentStreak: currentStreak
  };
});
