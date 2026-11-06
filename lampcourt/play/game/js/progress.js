/*
 * The player's progress (one save slot), the star rule, and the game's own ad counts. Everything here
 * is pure: a corrupt or old save is cleaned field by field into the current shape, never trusted.
 *
 * Ad rules the game keeps itself (GAME-DESIGN.md section 6; the shell's cap is separate):
 *   interstitial  Night walk only, on Next or before a chapter card; none until 3
 *                 Night walk breaks (Next presses) after install; at most one per 2 (the count resets
 *                 only when an ad really showed); none at a break where a rewarded ad was watched
 *   archive       3 rewarded archive nights a day (unlimited when ad free)
 *   offer         Remove ads on its own at most once, after the first PERFECT
 */
(function (root) {
  'use strict';
  var LC = root.LC || (root.LC = {});

  var VERSION = 1;
  var WALK_SIZE = 24;
  var ARCHIVE_PER_DAY = 3;
  var LANGS = ['ar', 'id', 'ms', 'en'];

  function int(v, lo, hi, dflt) {
    var n = typeof v === 'number' && isFinite(v) ? Math.floor(v) : dflt;
    if (n < lo) n = lo;
    if (n > hi) n = hi;
    return n;
  }
  function bool(v, dflt) { return typeof v === 'boolean' ? v : dflt; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function cellList(v, max) {
    var out = [];
    if (!Array.isArray(v)) return out;
    for (var i = 0; i < v.length && i < max; i++) {
      if (typeof v[i] === 'number' && isFinite(v[i]) && v[i] >= 0 && v[i] < 400) out.push(Math.floor(v[i]));
      else if (v[i] === null) out.push(null);
    }
    return out;
  }

  function fresh() {
    return {
      lang: null,
      sound: true,
      ambience: false,
      motion: 'auto',
      shift: 0,
      daily: {},
      streak: { last: 0, count: 0, best: 0, repairs: [] },
      lanterns: {},
      walk: { stars: zeros(), hint: zeros(), lit: zeros(), open: 1 },
      ads: { walkDone: 0, sinceAd: 0, archiveDay: 0, archiveUsed: 0, archiveOpen: [] },
      offer: { shown: false },
      tutorial: false,
      coach: false,
      installDay: 0,
      current: null
    };
  }

  function zeros() {
    var a = [];
    for (var i = 0; i < WALK_SIZE; i++) a.push(0);
    return a;
  }

  function fixedArray(v, lo, hi) {
    var a = zeros();
    if (Array.isArray(v)) for (var i = 0; i < WALK_SIZE; i++) a[i] = int(v[i], lo, hi, 0);
    return a;
  }

  /** Any value (a parsed save, garbage, null) into a valid progress object. */
  function sanitize(raw) {
    var p = fresh();
    var r = obj(raw);
    p.lang = LANGS.indexOf(r.lang) >= 0 ? r.lang : null;
    p.sound = bool(r.sound, true);
    p.ambience = bool(r.ambience, false);
    p.motion = r.motion === 'reduce' || r.motion === 'full' ? r.motion : 'auto';
    p.shift = r.shift === -1 || r.shift === 1 ? r.shift : 0; // anything else is not a choice the player made
    var daily = obj(r.daily);
    var days = Object.keys(daily);
    for (var i = 0; i < days.length && i < 4000; i++) {
      var d = parseInt(days[i], 10);
      var e = obj(daily[days[i]]);
      if (!(d > 0 && d < 100000)) continue;
      if (typeof e.lit !== 'number' || typeof e.best !== 'number' || !(e.lit >= 0 && e.best >= 1 && e.lit <= e.best && e.best <= 400)) continue;
      var lit = Math.floor(e.lit), best = Math.floor(e.best);
      p.daily[d] = { lit: lit, best: best, cells: cellList(e.cells, 8).filter(function (c) { return c !== null; }), how: e.how === 'archive' ? 'archive' : 'today' };
    }
    var s = obj(r.streak);
    p.streak = { last: int(s.last, 0, 100000, 0), count: int(s.count, 0, 100000, 0), best: int(s.best, 0, 100000, 0), repairs: [] };
    if (Array.isArray(s.repairs)) for (var j = 0; j < s.repairs.length && j < 60; j++) p.streak.repairs.push(int(s.repairs[j], 0, 100000, 0));
    if (p.streak.best < p.streak.count) p.streak.best = p.streak.count;
    var lan = obj(r.lanterns);
    Object.keys(lan).forEach(function (y) {
      if (!/^1[45][0-9]{2}$/.test(y) || !Array.isArray(lan[y])) return;
      var got = [];
      lan[y].forEach(function (n) { if (typeof n === 'number' && n % 1 === 0 && n >= 1 && n <= 30 && got.indexOf(n) < 0) got.push(n); });
      got.sort(function (a, b) { return a - b; });
      p.lanterns[y] = got;
    });
    var w = obj(r.walk);
    p.walk.stars = fixedArray(w.stars, 0, 3);
    p.walk.hint = fixedArray(w.hint, 0, 1);
    p.walk.lit = fixedArray(w.lit, 0, 400);
    p.walk.open = int(w.open, 1, WALK_SIZE, 1);
    var a = obj(r.ads);
    p.ads.walkDone = int(a.walkDone, 0, 1e7, 0);
    p.ads.sinceAd = int(a.sinceAd, 0, 1e7, 0);
    p.ads.archiveDay = int(a.archiveDay, 0, 100000, 0);
    p.ads.archiveUsed = int(a.archiveUsed, 0, ARCHIVE_PER_DAY, 0);
    p.ads.archiveOpen = Array.isArray(a.archiveOpen) ? a.archiveOpen.map(function (d) { return int(d, 0, 100000, 0); }).filter(Boolean).slice(-200) : [];
    p.offer.shown = bool(obj(r.offer).shown, false);
    p.tutorial = bool(r.tutorial, false);
    p.coach = bool(r.coach, false);
    p.installDay = int(r.installDay, 0, 100000, 0);
    var c = obj(r.current);
    if ((c.mode === 'daily' || c.mode === 'walk' || c.mode === 'archive') && typeof c.id === 'number') {
      p.current = { mode: c.mode, id: int(c.id, 0, 100000, 0), cells: cellList(c.cells, 5), hinted: bool(c.hinted, false), rewarded: bool(c.rewarded, false) };
    }
    return p;
  }

  /** Version 0 never shipped; the hook exists so a later shape can migrate from 1. */
  function migrate(data) {
    return sanitize(data);
  }

  /** Stars for a Night walk result: 90, 97 and 100 percent of the best, rounded up, in integers. */
  function thresholds(best) {
    return [Math.floor((90 * best + 99) / 100), Math.floor((97 * best + 99) / 100), best];
  }
  function stars(lit, best) {
    var t = thresholds(best);
    return lit >= t[2] ? 3 : lit >= t[1] ? 2 : lit >= t[0] ? 1 : 0;
  }
  function percent(lit, best) {
    return best > 0 ? Math.floor((100 * lit) / best) : 0;
  }

  /** Records a Night walk Light. Returns the progress (changed in place). */
  function recordWalk(p, index, lit, best, hinted) {
    var st = stars(lit, best);
    if (st > p.walk.stars[index] || (st === p.walk.stars[index] && !hinted && p.walk.hint[index])) {
      p.walk.stars[index] = st;
      p.walk.hint[index] = hinted ? 1 : 0;
    }
    if (lit > p.walk.lit[index]) p.walk.lit[index] = lit;
    if (p.walk.open < Math.min(WALK_SIZE, index + 2)) p.walk.open = Math.min(WALK_SIZE, index + 2);
    return p;
  }

  /**
   * One Night walk break: the player pressed Next on a lit courtyard. Only these count toward the
   * interstitial rules, so Light, Try again, Light, Next is one courtyard, not two.
   */
  function walkBreak(p) {
    p.ads.walkDone += 1;
    p.ads.sinceAd += 1;
    return p;
  }

  /** Whether this Night walk break may ask the shell for an interstitial. */
  function interstitialDue(p, rewardedHere, adFree) {
    if (adFree || rewardedHere) return false;
    return p.ads.walkDone > 3 && p.ads.sinceAd >= 2;
  }

  /** After asking: the count resets only when an ad really showed. */
  function afterInterstitial(p, shown) {
    if (shown) p.ads.sinceAd = 0;
    return p;
  }

  function archiveLeft(p, day, adFree) {
    if (adFree) return Infinity;
    return p.ads.archiveDay === day ? Math.max(0, ARCHIVE_PER_DAY - p.ads.archiveUsed) : ARCHIVE_PER_DAY;
  }

  function useArchive(p, day, target) {
    if (p.ads.archiveDay !== day) { p.ads.archiveDay = day; p.ads.archiveUsed = 0; }
    p.ads.archiveUsed = Math.min(ARCHIVE_PER_DAY, p.ads.archiveUsed + 1);
    if (p.ads.archiveOpen.indexOf(target) < 0) p.ads.archiveOpen.push(target);
    return p;
  }

  /**
   * The Remove ads offer on its own: once, after the first PERFECT, only where Play sells it, and never
   * inside the first three Night walk courtyards (the first minute teaches, it does not sell).
   */
  function offerDue(p, perfect, caps, mode, index) {
    if (mode === 'walk' && index < 3) return false;
    return !!(perfect && caps && caps.removeAds && !caps.adFree && !p.offer.shown);
  }

  function collectLantern(p, year, n) {
    var key = String(year);
    var got = p.lanterns[key] || (p.lanterns[key] = []);
    if (n >= 1 && n <= 30 && got.indexOf(n) < 0) { got.push(n); got.sort(function (a, b) { return a - b; }); return true; }
    return false;
  }

  var api = {
    VERSION: VERSION, WALK_SIZE: WALK_SIZE, ARCHIVE_PER_DAY: ARCHIVE_PER_DAY, LANGS: LANGS,
    fresh: fresh, sanitize: sanitize, migrate: migrate, thresholds: thresholds, stars: stars,
    percent: percent, recordWalk: recordWalk, walkBreak: walkBreak, interstitialDue: interstitialDue,
    afterInterstitial: afterInterstitial, archiveLeft: archiveLeft, useArchive: useArchive,
    offerDue: offerDue, collectLantern: collectLantern
  };
  LC.progress = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
