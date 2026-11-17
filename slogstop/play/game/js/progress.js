/*
 * The player's progress and the game's own ad counts. clean() turns anything (an old save, a broken
 * one, someone's hand edit) into a valid progress object, so a bad save can never stop the game.
 *
 * Ad counts (GAME-DESIGN.md section 5): finished solo overs and duels are counted at the moment they
 * finish; an interstitial is asked for only at Next on a result card, only after 3 finished overs or
 * duels since install, only when 2 solo overs (or 2 duels) have finished since the last ad that was
 * actually shown, and never when a rewarded ad was watched in that over. The Daily never counts toward
 * a break and never gets one.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.SS = root.SS || {}).progress = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;
  var RUNGS = 30;
  var KEEP_DAYS = 400;
  var LANGS = ['auto', 'en', 'hi', 'ur', 'bn', 'ta', 'te', 'mr', 'si'];

  function fresh() {
    return {
      lang: 'auto',
      sound: true,
      motion: 'auto',
      ladder: zeros(RUNGS),
      played: { solo: 0, duel: 0, daily: 0 },
      ads: { solo: 0, duel: 0 },
      daily: { results: {}, streak: 0, best: 0, lastDay: 0, secondDay: 0, repairDay: 0 },
      duels: { played: 0, top: 0, bottom: 0, ties: 0 },
      seen: { intro: false, chaseIntro: false, duelTop: false, duelBottom: false, removeAdsOffer: false }
    };
  }

  function zeros(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(0);
    return a;
  }

  function int(v, lo, hi, dflt) {
    if (typeof v !== 'number' || !isFinite(v)) return dflt;
    v = Math.floor(v);
    return v < lo ? lo : v > hi ? hi : v;
  }

  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function bool(v, dflt) { return typeof v === 'boolean' ? v : dflt; }

  var LINE_RE = /^(W|\.|[0-9]|nb[0-9]?)( (W|\.|[0-9]|nb[0-9]?)){0,11}$/;

  /** A valid progress object from anything. */
  function clean(raw) {
    var p = fresh();
    var r = obj(raw);
    p.lang = LANGS.indexOf(r.lang) >= 0 ? r.lang : 'auto';
    p.sound = bool(r.sound, true);
    p.motion = r.motion === 'reduce' ? 'reduce' : 'auto';
    if (Array.isArray(r.ladder)) for (var i = 0; i < RUNGS; i++) p.ladder[i] = int(r.ladder[i], 0, 3, 0);
    var pl = obj(r.played);
    p.played = { solo: int(pl.solo, 0, 1e9, 0), duel: int(pl.duel, 0, 1e9, 0), daily: int(pl.daily, 0, 1e9, 0) };
    var ad = obj(r.ads);
    p.ads = { solo: int(ad.solo, 0, 1000, 0), duel: int(ad.duel, 0, 1000, 0) };
    var d = obj(r.daily);
    p.daily.streak = int(d.streak, 0, 100000, 0);
    p.daily.best = Math.max(p.daily.streak, int(d.best, 0, 100000, 0));
    p.daily.lastDay = int(d.lastDay, 0, 1e6, 0);
    p.daily.secondDay = int(d.secondDay, 0, 1e6, 0);
    p.daily.repairDay = int(d.repairDay, 0, 1e6, 0);
    var res = obj(d.results);
    var days = Object.keys(res).map(Number).filter(function (n) { return n >= 1 && n <= 1e6 && (n | 0) === n; }).sort(function (a, b) { return b - a; });
    for (var k = 0; k < days.length && k < KEEP_DAYS; k++) {
      var e = obj(res[days[k]]);
      if (typeof e.line !== 'string' || !LINE_RE.test(e.line)) continue;
      p.daily.results[days[k]] = {
        won: bool(e.won, false), runs: int(e.runs, 0, 99, 0), target: int(e.target, 1, 99, 1),
        line: e.line, second: bool(e.second, false), archive: bool(e.archive, false)
      };
    }
    var du = obj(r.duels);
    p.duels = { played: int(du.played, 0, 1e9, 0), top: int(du.top, 0, 1e9, 0), bottom: int(du.bottom, 0, 1e9, 0), ties: int(du.ties, 0, 1e9, 0) };
    var s = obj(r.seen);
    p.seen = { intro: bool(s.intro, false), chaseIntro: bool(s.chaseIntro, false), duelTop: bool(s.duelTop, false), duelBottom: bool(s.duelBottom, false), removeAdsOffer: bool(s.removeAdsOffer, false) };
    return p;
  }

  /** Shell.configureSave's migrate: there is only version 1 so far; anything older is cleaned. */
  function migrate(data) {
    return clean(data);
  }

  // ---- the ladder ----

  /** The highest rung index the player may play: one past the last won rung. */
  function openRung(p) {
    var i = 0;
    while (i < RUNGS - 1 && p.ladder[i] > 0) i++;
    return i;
  }

  function starsTotal(p) {
    var n = 0;
    for (var i = 0; i < RUNGS; i++) n += p.ladder[i];
    return n;
  }

  function recordRung(p, i, stars) {
    if (i >= 0 && i < RUNGS && stars > p.ladder[i]) p.ladder[i] = stars;
  }

  // ---- the Daily ----

  /** The current streak as of today: it lapses when yesterday's Daily was not finished. */
  function streak(p, today) {
    return p.daily.lastDay >= today - 1 ? p.daily.streak : 0;
  }

  /** Today's Daily state: { done, result, canSecond, missedOne, canRepair }. */
  function dailyState(p, today) {
    var res = p.daily.results[today];
    var done = !!(res && !res.archive);
    var missedOne = !done && p.daily.streak > 0 && p.daily.lastDay === today - 2;
    return {
      done: done,
      result: done ? res : null,
      canSecond: done && p.daily.secondDay !== today,
      secondUsed: p.daily.secondDay === today,
      missedOne: missedOne,
      canRepair: missedOne && (p.daily.repairDay === 0 || today - p.daily.repairDay >= 7)
    };
  }

  /** Records a finished Daily. A second attempt replaces the first; the streak counts the day once. */
  function finishDaily(p, today, r) {
    var second = p.daily.secondDay === today;
    p.daily.results[today] = { won: !!r.won, runs: r.runs | 0, target: r.target | 0, line: String(r.line), second: second, archive: false };
    if (p.daily.lastDay !== today) {
      p.daily.streak = p.daily.lastDay === today - 1 ? p.daily.streak + 1 : 1;
      p.daily.lastDay = today;
      p.played.daily += 1;
    }
    if (p.daily.streak > p.daily.best) p.daily.best = p.daily.streak;
  }

  /** A past day played from the archive: kept for the record, never counted in the streak. */
  function finishArchive(p, day, r) {
    var old = p.daily.results[day];
    if (old && !old.archive) return; // the real result stays
    p.daily.results[day] = { won: !!r.won, runs: r.runs | 0, target: r.target | 0, line: String(r.line), second: false, archive: true };
  }

  /** The rewarded second attempt was granted for today. */
  function grantSecond(p, today) {
    p.daily.secondDay = today;
  }

  /** Streak repair: the missed day counts as played, so today's Daily continues the streak. */
  function repairStreak(p, today) {
    if (p.daily.lastDay === today - 2 && p.daily.streak > 0) {
      p.daily.lastDay = today - 1;
      p.daily.repairDay = today;
    }
  }

  // ---- the game's own ad counts ----

  /** A solo over (Defend, Chase, a rung, a shared over) or a duel finished. */
  function noteFinished(p, kind) {
    if (kind !== 'solo' && kind !== 'duel') return;
    p.played[kind] += 1;
    p.ads[kind] += 1;
  }

  /** Whether Next on this result card may ask the shell for an interstitial. */
  function shouldAskInterstitial(p, kind, rewardedInOver) {
    if (kind !== 'solo' && kind !== 'duel') return false;
    if (rewardedInOver) return false;
    if (p.played.solo + p.played.duel < 3) return false;
    return p.ads[kind] >= 2;
  }

  /** The shell actually showed one: the count starts again. */
  function noteInterstitialShown(p, kind) {
    if (kind === 'solo' || kind === 'duel') p.ads[kind] = 0;
  }

  return {
    VERSION: VERSION, RUNGS: RUNGS, LANGS: LANGS, fresh: fresh, clean: clean, migrate: migrate,
    openRung: openRung, starsTotal: starsTotal, recordRung: recordRung,
    streak: streak, dailyState: dailyState, finishDaily: finishDaily, finishArchive: finishArchive,
    grantSecond: grantSecond, repairStreak: repairStreak,
    noteFinished: noteFinished, shouldAskInterstitial: shouldAskInterstitial, noteInterstitialShown: noteInterstitialShown
  };
});
