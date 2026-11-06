/*
 * The save: one versioned record through Shell.save / Shell.load. sanitize() rebuilds it field by field
 * from whatever was stored, so a corrupt, partial or old save never breaks the game.
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};

  var VERSION = 1;
  var SKYLINE_IDS = ['harbour', 'desert', 'snow', 'newyear', 'river'];
  var HISTORY_DAYS = 70;
  var MAX_BURSTS = 48;

  function defaults() {
    return {
      settings: { sound: true, haptics: true, reducedFlash: false, reducedMotion: 'auto' },
      stats: { shows: 0, normalShows: 0, showsSinceAd: 0, firstShowDone: false },
      best: {},
      postcards: {},
      unlocks: { willow: false, crossette: false, ring: false, desert: false, snow: false },
      goals: { chain: 0, noDud: false, perfectRun: 0 },
      daily: { history: {} },
      previews: { day: 0, left: {} },
      offers: { removeAdsShown: false },
      lastSkyline: 'harbour'
    };
  }

  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function bool(v, d) { return typeof v === 'boolean' ? v : d; }
  function int(v, d, lo, hi) {
    if (typeof v !== 'number' || !isFinite(v)) return d;
    v = Math.floor(v);
    if (lo != null && v < lo) v = lo;
    if (hi != null && v > hi) v = hi;
    return v;
  }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function cleanBursts(list) {
    if (!Array.isArray(list)) return null;
    var out = [];
    for (var i = 0; i < list.length && out.length < MAX_BURSTS; i++) {
      var b = obj(list[i]);
      var x = num(b.x, NaN), y = num(b.y, NaN);
      if (isNaN(x) || isNaN(y)) continue;
      out.push({
        x: x, y: y, type: int(b.type, 0, 0, 3), factor: num(b.factor, 1), seed: int(b.seed, 0, 0, 4294967295),
        svx: num(b.svx, 0), svy: num(b.svy, 0), step: int(b.step, 0, 0)
      });
    }
    return out.length ? out : null;
  }

  function sanitize(data) {
    var d = defaults();
    var src = obj(data);
    var s = obj(src.settings);
    d.settings.sound = bool(s.sound, true);
    d.settings.haptics = bool(s.haptics, true);
    d.settings.reducedFlash = bool(s.reducedFlash, false);
    d.settings.reducedMotion = s.reducedMotion === 'on' || s.reducedMotion === 'off' ? s.reducedMotion : 'auto';

    var st = obj(src.stats);
    d.stats.shows = int(st.shows, 0, 0);
    d.stats.normalShows = int(st.normalShows, 0, 0);
    d.stats.showsSinceAd = int(st.showsSinceAd, 0, 0, 1000);
    d.stats.firstShowDone = bool(st.firstShowDone, d.stats.shows > 0);

    var best = obj(src.best), cards = obj(src.postcards);
    SKYLINE_IDS.forEach(function (id) {
      var b = int(best[id], 0, 0);
      if (b > 0) d.best[id] = b;
      var c = obj(cards[id]);
      var bursts = cleanBursts(c.bursts);
      if (bursts) d.postcards[id] = { length: int(c.length, bursts.length, 1, 999), bursts: bursts, day: int(c.day, 0) };
    });

    var u = obj(src.unlocks);
    for (var k in d.unlocks) if (Object.prototype.hasOwnProperty.call(d.unlocks, k)) d.unlocks[k] = bool(u[k], false);

    var g = obj(src.goals);
    d.goals.chain = int(g.chain, 0, 0, 999);
    d.goals.noDud = bool(g.noDud, false);
    d.goals.perfectRun = int(g.perfectRun, 0, 0, 999);

    var h = obj(obj(src.daily).history);
    var days = Object.keys(h).map(Number).filter(function (n) { return isFinite(n) && Math.floor(n) === n; });
    days.sort(function (a, b) { return b - a; });
    days.slice(0, HISTORY_DAYS).forEach(function (day) {
      var r = obj(h[day]);
      var marks = Array.isArray(r.marks) ? r.marks.filter(function (m) { return m === 0 || m === 1 || m === 2; }).slice(0, 20) : [];
      d.daily.history[day] = {
        score: int(r.score, 0, 0), chain: int(r.chain, 0, 0), perfects: int(r.perfects, 0, 0), marks: marks,
        tries: int(r.tries, 1, 0, 2), second: bool(r.second, false), done: bool(r.done, true),
        bursts: cleanBursts(r.bursts)
      };
    });

    var p = obj(src.previews);
    d.previews.day = int(p.day, 0);
    var left = obj(p.left);
    ['desert', 'snow'].forEach(function (id) {
      var n = int(left[id], 0, 0, 3);
      if (n > 0) d.previews.left[id] = n;
    });

    d.offers.removeAdsShown = bool(obj(src.offers).removeAdsShown, false);
    d.lastSkyline = SKYLINE_IDS.indexOf(src.lastSkyline) >= 0 ? src.lastSkyline : 'harbour';
    return d;
  }

  /** Shell.configureSave migrate hook: older versions are rebuilt into the current shape. */
  function migrate(data) {
    return sanitize(data);
  }

  var api = { VERSION: VERSION, defaults: defaults, sanitize: sanitize, migrate: migrate, SKYLINE_IDS: SKYLINE_IDS };
  Sky.save = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
