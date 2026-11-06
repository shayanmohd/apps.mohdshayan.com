/*
 * The save: settings, the next solo sky, records, paper patterns, the Daily and its streak, and the ad
 * counts. sanitize() turns anything (a corrupt, foreign or old save) into a valid save with defaults, so
 * loading never crashes the game. Pure; main.js reads and writes it through Shell.save and Shell.load.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.LS = root.LS || {}).progress = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;
  var PATTERNS = 3;                 // moon, split, band
  var BAND_CUTS = 5;                // five cuts in one sky unlock the band

  function defaults() {
    return {
      settings: { sound: true, haptics: true },
      tutorialDone: false,
      sky: 1,
      pattern: 0,
      patterns: [true, false, false],
      records: { cuts: 0, score: 0, duel: 0 },
      stats: { skies: 0, matches: 0, cuts: 0 },
      daily: freshDaily(0, 0, 0),
      ads: { finished: 0, skiesSinceAd: 0, matchesSinceAd: 0 },
      removeAdsPrompted: false
    };
  }

  function freshDaily(day, streak, lastDay) {
    return { day: day, started: false, done: false, result: null, partial: null, second: null, secondStarted: false, streak: streak, lastDay: lastDay };
  }

  function int(v, lo, hi, dflt) {
    if (typeof v !== 'number' || !isFinite(v)) return dflt;
    v = Math.floor(v);
    return v < lo ? lo : v > hi ? hi : v;
  }

  function num(v, lo, hi, dflt) {
    if (typeof v !== 'number' || !isFinite(v)) return dflt;
    return v < lo ? lo : v > hi ? hi : v;
  }

  function bool(v, dflt) {
    return typeof v === 'boolean' ? v : dflt;
  }

  function obj(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  function cleanResult(r) {
    if (!r || typeof r !== 'object') return null;
    return {
      cuts: int(r.cuts, 0, 999, 0), score: int(r.score, 0, 99999, 0), lost: int(r.lost, 0, 99, 0),
      duel: Math.round(num(r.duel, 0, 999, 0) * 10) / 10, spare: bool(r.spare, false)
    };
  }

  /** Any value in, a complete valid save out. */
  function sanitize(raw) {
    var s = defaults();
    var r = obj(raw);
    var st = obj(r.settings);
    s.settings.sound = bool(st.sound, true);
    s.settings.haptics = bool(st.haptics, true);
    s.tutorialDone = bool(r.tutorialDone, false);
    s.sky = int(r.sky, 1, 100000, 1);
    if (Array.isArray(r.patterns)) {
      for (var i = 0; i < PATTERNS; i++) s.patterns[i] = i === 0 ? true : r.patterns[i] === true;
    }
    s.pattern = int(r.pattern, 0, PATTERNS - 1, 0);
    if (!s.patterns[s.pattern]) s.pattern = 0;
    var rec = obj(r.records);
    s.records.cuts = int(rec.cuts, 0, 999, 0);
    s.records.score = int(rec.score, 0, 99999, 0);
    s.records.duel = Math.round(num(rec.duel, 0, 999, 0) * 10) / 10;
    var sts = obj(r.stats);
    s.stats.skies = int(sts.skies, 0, 1e7, 0);
    s.stats.matches = int(sts.matches, 0, 1e7, 0);
    s.stats.cuts = int(sts.cuts, 0, 1e8, 0);
    var d = obj(r.daily);
    s.daily = freshDaily(int(d.day, 0, 1e6, 0), int(d.streak, 0, 1e6, 0), int(d.lastDay, 0, 1e6, 0));
    s.daily.started = bool(d.started, false);
    s.daily.done = bool(d.done, false);
    s.daily.result = cleanResult(d.result);
    s.daily.partial = cleanResult(d.partial);
    s.daily.second = cleanResult(d.second);
    s.daily.secondStarted = bool(d.secondStarted, false);
    if (s.daily.done && !s.daily.result) s.daily.result = { cuts: 0, score: 0, lost: 0, duel: 0, spare: false };
    var ads = obj(r.ads);
    s.ads.finished = int(ads.finished, 0, 1e7, 0);
    s.ads.skiesSinceAd = int(ads.skiesSinceAd, 0, 1e7, 0);
    s.ads.matchesSinceAd = int(ads.matchesSinceAd, 0, 1e7, 0);
    s.removeAdsPrompted = bool(r.removeAdsPrompted, false);
    return s;
  }

  /** Shell.configureSave's migrate: an older save becomes the current shape (version 1 is the first). */
  function migrate(data) {
    return sanitize(data);
  }

  /**
   * A finished solo sky or Daily: records, stats and pattern unlocks. Returns {records: [names beaten],
   * unlocked: [pattern indexes]}. A cleared solo sky moves the next sky on; one that ran out of kites,
   * was left or cut nothing keeps it, so Retry and the menu offer the same sky again (Next sky moves on).
   */
  function recordSky(save, result) {
    var out = { records: [], unlocked: [] };
    save.stats.skies++;
    save.stats.cuts += result.cuts | 0;
    if ((result.cuts | 0) > save.records.cuts) { save.records.cuts = result.cuts | 0; out.records.push('cuts'); }
    if ((result.score | 0) > save.records.score) { save.records.score = result.score | 0; out.records.push('score'); }
    if ((result.duel || 0) > save.records.duel) { save.records.duel = Math.round(result.duel * 10) / 10; out.records.push('duel'); }
    if (result.mode === 'solo' && cleared(result)) reachSky(save, (result.number | 0) + 1);
    unlock(save, result, out);
    return out;
  }

  /** A solo sky is cleared when a kite was still flying at sunset and at least one rival was cut. */
  function cleared(result) {
    return result.reason === 'sunset' && (result.cuts | 0) > 0;
  }

  /** Next sky, or a cleared sky: the menu's solo sky becomes n unless it is already further on. */
  function reachSky(save, n) {
    if ((n | 0) > save.sky) save.sky = Math.min(100000, n | 0);
  }

  function unlock(save, result, out) {
    if (!save.patterns[1] && (result.wonFromBelow | 0) > 0) { save.patterns[1] = true; out.unlocked.push(1); }
    if (!save.patterns[2] && (result.cuts | 0) >= BAND_CUTS) { save.patterns[2] = true; out.unlocked.push(2); }
  }

  /** A duel won from below during the lesson or a match also unlocks the split pattern. */
  function wonFromBelow(save) {
    var out = { records: [], unlocked: [] };
    unlock(save, { wonFromBelow: 1, cuts: 0 }, out);
    return out;
  }

  function recordMatch(save, result) {
    save.stats.matches++;
    var out = { records: [], unlocked: [] };
    if ((result.duel || 0) > save.records.duel) { save.records.duel = Math.round(result.duel * 10) / 10; out.records.push('duel'); }
    return out;
  }

  /** Rolls the Daily over to today when the date changed; the streak and the last day played stay. */
  function ensureDay(save, today) {
    if (save.daily.day !== today) save.daily = freshDaily(today, save.daily.streak, save.daily.lastDay);
    return save.daily;
  }

  /** The streak to show today: it lapses once a whole day goes by without a Daily. */
  function streak(save, today) {
    var d = save.daily;
    return d.lastDay >= today - 1 && d.lastDay <= today ? d.streak : 0;
  }

  /** The Daily (or its second sky) starts: from now on leaving it counts as played. */
  function startDaily(save, today, second) {
    var d = ensureDay(save, today);
    if (second) d.secondStarted = true;
    else d.started = true;
    d.partial = null;
    return d;
  }

  /** Keeps what an unfinished Daily has, so a closed app records it. */
  function notePartial(save, result) {
    save.daily.partial = cleanResult(result);
  }

  /** A Daily sky finished (or left). The first sky sets the streak; the second is kept beside it. */
  function finishDaily(save, today, result, second) {
    var d = ensureDay(save, today);
    var r = cleanResult(result);
    d.partial = null;
    if (second) {
      d.second = r;
      return d;
    }
    d.result = r;
    d.done = true;
    if (d.lastDay === today - 1) d.streak += 1;
    else if (d.lastDay !== today) d.streak = 1;
    d.lastDay = today;
    return d;
  }

  /** At launch: a Daily started but never finished (the app was closed) is recorded with what it had. */
  function settleAbandoned(save, today) {
    var d = save.daily;
    var changed = false;
    if (d.day && d.started && !d.done) {
      var keep = d.day;
      finishDaily(save, keep, d.partial || { cuts: 0, score: 0, lost: 0, duel: 0, spare: false }, false);
      changed = true;
    }
    if (d.day && d.secondStarted && !d.second) {
      d.second = d.partial || { cuts: 0, score: 0, lost: 0, duel: 0, spare: false };
      d.partial = null;
      changed = true;
    }
    if (d.day !== today) ensureDay(save, today);
    return changed;
  }

  /** The day's counted result: the better of the two skies when a second was flown. */
  function dailyBest(d) {
    if (!d || !d.result) return null;
    if (d.second && d.second.score > d.result.score) return d.second;
    return d.result;
  }

  return {
    VERSION: VERSION, PATTERNS: PATTERNS, BAND_CUTS: BAND_CUTS,
    defaults: defaults, sanitize: sanitize, migrate: migrate,
    recordSky: recordSky, cleared: cleared, reachSky: reachSky, recordMatch: recordMatch, wonFromBelow: wonFromBelow,
    ensureDay: ensureDay, streak: streak, startDaily: startDaily, notePartial: notePartial,
    finishDaily: finishDaily, settleAbandoned: settleAbandoned, dailyBest: dailyBest
  };
});
