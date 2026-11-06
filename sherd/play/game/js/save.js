/*
 * The save: one JSON object, versioned through Shell.configureSave. sanitize() rebuilds it field by
 * field from whatever was stored, so a corrupt, hand-edited or older save never crashes the game: every
 * wrong value falls back to its default.
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var rules = node ? require('./rules.js') : root.Sherd.rules;

  var VERSION = 1;
  var MAX_DAY = 100000;

  function defaults(seed) {
    return {
      settings: { sound: true, haptics: true, reducedMotion: false },
      flags: { legendSeen: false, tutorialDone: false, removeAdsOffered: false },
      streak: { current: 0, best: 0, lastSolved: 0, lastRepairOn: 0, mended: false },
      days: {},
      archive: { day: 0, opens: 0, unlocked: [] },
      exp: {
        seed: (seed >>> 0) || 1, dig: 1, attempt: 0, completed: 0, solved: 0, fragments: 0,
        stars: {}, surveyed: {}, double: { lastDay: 0, left: 0 }
      },
      ads: { sinceInterstitial: 0, shown: 0 },
      glaze: 0,
      active: { daily: null, exp: null, archive: null }
    };
  }

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function bool(v, d) { return typeof v === 'boolean' ? v : d; }
  function int(v, d, lo, hi) {
    if (typeof v !== 'number' || !isFinite(v)) return d;
    v = Math.floor(v);
    return v < lo ? lo : v > hi ? hi : v;
  }

  function dayRecord(r) {
    if (!isObj(r)) return null;
    var tries = int(r.t, 0, 0, 12);
    if (!tries) return null;
    var rows = Array.isArray(r.r) ? r.r.slice(0, 12).filter(function (row) {
      return Array.isArray(row) && row.length === 2 && row.every(function (x) { return typeof x === 'number' && x >= 0 && x <= 7; });
    }).map(function (row) { return [row[0] | 0, row[1] | 0]; }) : [];
    var counts = Array.isArray(r.c) ? r.c.slice(0, 13).filter(function (x) {
      return typeof x === 'number' && x >= 0 && x <= 100000 && x === Math.floor(x);
    }) : [];
    return { w: r.w ? 1 : 0, t: tries, r: rows, a: r.a ? 1 : 0, c: counts };
  }

  function activeDig(a, needDay) {
    if (!isObj(a)) return null;
    var dig = rules.fromJSON(a.dig);
    if (!dig || dig.done) return null;
    var out = { dig: rules.toJSON(dig) };
    if (needDay) {
      out.day = int(a.day, 0, 0, MAX_DAY);
      if (!out.day) return null;
    } else {
      out.digNo = int(a.digNo, 0, 0, 1000000);
      out.attempt = int(a.attempt, 0, 0, 1000000);
      if (!out.digNo) return null;
    }
    return out;
  }

  /** A clean save built from anything. */
  function sanitize(raw, freshSeed) {
    var d = defaults(freshSeed);
    if (!isObj(raw)) return d;
    var s = isObj(raw.settings) ? raw.settings : {};
    d.settings.sound = bool(s.sound, true);
    d.settings.haptics = bool(s.haptics, true);
    d.settings.reducedMotion = bool(s.reducedMotion, false);
    var f = isObj(raw.flags) ? raw.flags : {};
    d.flags.legendSeen = bool(f.legendSeen, false);
    d.flags.tutorialDone = bool(f.tutorialDone, false);
    d.flags.removeAdsOffered = bool(f.removeAdsOffered, false);
    var st = isObj(raw.streak) ? raw.streak : {};
    d.streak.current = int(st.current, 0, 0, MAX_DAY);
    d.streak.best = Math.max(d.streak.current, int(st.best, 0, 0, MAX_DAY));
    d.streak.lastSolved = int(st.lastSolved, 0, 0, MAX_DAY);
    d.streak.lastRepairOn = int(st.lastRepairOn, 0, 0, MAX_DAY);
    d.streak.mended = bool(st.mended, false);
    if (isObj(raw.days)) {
      Object.keys(raw.days).forEach(function (k) {
        var day = Number(k);
        if (!(day >= 1 && day <= MAX_DAY && day === Math.floor(day))) return;
        var rec = dayRecord(raw.days[k]);
        if (rec) d.days[day] = rec;
      });
    }
    var ar = isObj(raw.archive) ? raw.archive : {};
    d.archive.day = int(ar.day, 0, 0, MAX_DAY);
    d.archive.opens = int(ar.opens, 0, 0, 99);
    d.archive.unlocked = Array.isArray(ar.unlocked) ? ar.unlocked.filter(function (x) {
      return typeof x === 'number' && x >= 1 && x <= MAX_DAY && x === Math.floor(x);
    }).slice(0, 5000) : [];
    var e = isObj(raw.exp) ? raw.exp : {};
    d.exp.seed = int(e.seed, d.exp.seed, 1, 4294967295);
    d.exp.dig = int(e.dig, 1, 1, 1000000);
    d.exp.attempt = int(e.attempt, 0, 0, 1000000);
    d.exp.completed = int(e.completed, 0, 0, 10000000);
    d.exp.solved = Math.min(d.exp.completed, int(e.solved, 0, 0, 10000000));
    d.exp.fragments = int(e.fragments, 0, 0, 100000000);
    ['stars', 'surveyed'].forEach(function (key) {
      if (!isObj(e[key])) return;
      Object.keys(e[key]).forEach(function (k) {
        var n = Number(k);
        if (!(n >= 1 && n <= 1000000 && n === Math.floor(n))) return;
        var v = int(e[key][k], 0, 0, 3);
        if (v) d.exp[key][n] = v;
      });
    });
    var dbl = isObj(e.double) ? e.double : {};
    d.exp.double.lastDay = int(dbl.lastDay, 0, 0, MAX_DAY);
    d.exp.double.left = int(dbl.left, 0, 0, 3);
    var ads = isObj(raw.ads) ? raw.ads : {};
    d.ads.sinceInterstitial = int(ads.sinceInterstitial, 0, 0, 1000000);
    d.ads.shown = int(ads.shown, 0, 0, 10000000);
    d.glaze = int(raw.glaze, 0, 0, MAX_DAY);
    var act = isObj(raw.active) ? raw.active : {};
    d.active.daily = activeDig(act.daily, true);
    d.active.archive = activeDig(act.archive, true);
    d.active.exp = activeDig(act.exp, false);
    return d;
  }

  /** Older save shapes into the current one. Version 1 is the first; anything else is sanitized. */
  function migrate(data) {
    return sanitize(data);
  }

  var api = { VERSION: VERSION, defaults: defaults, sanitize: sanitize, migrate: migrate };
  if (node) module.exports = api;
  else (root.Sherd = root.Sherd || {}).save = api;
})(this);
