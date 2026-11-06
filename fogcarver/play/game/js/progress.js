/*
 * The save: its shape, a sanitizer that turns anything (old, corrupt, hand-edited) into a valid save,
 * and the pure rules for the streak, the archive, Second try, the Atlas pages and Preview island.
 * Days are daily numbers (islands.dayNumber); nothing here reads the clock itself.
 */
(function (root) {
  'use strict';
  var FC = root.FC || (root.FC = {});
  var islands = FC.islands || (typeof require === 'function' ? require('./islands.js') : null);

  var VERSION = 1;
  var ARCHIVE_PER_DAY = 3;
  var REPAIR_EVERY_DAYS = 7;
  var MAP_RE = /^(?:[0-9a-z][0-5]){0,40}$/;

  function fresh() {
    return {
      sound: true,
      reduced: false,
      tutorialDone: false,
      installDay: 0,
      daily: {},
      streak: { count: 0, lastDay: 0, best: 0, repairedOn: 0 },
      atlas: { done: {}, finished: 0, sinceAd: 0, previewDay: 0, previewIsland: 0 },
      archive: { day: 0, used: 0, open: {} },
      secondTryDay: 0,
      offerShown: false,
      undoHinted: false,
      run: null,
      dailyRun: null
    };
  }

  function int(v, min, max, def) {
    if (typeof v !== 'number' || !isFinite(v)) return def;
    v = Math.floor(v);
    if (v < min) return def;
    if (max != null && v > max) return max;
    return v;
  }
  function bool(v, def) { return typeof v === 'boolean' ? v : def; }
  function map(v) { return typeof v === 'string' && MAP_RE.test(v) ? v : ''; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

  /** Placements to the compact save form: two characters each, the cell in base 36 then the turn. */
  function packMap(placements) {
    var s = '';
    for (var i = 0; i < placements.length && i < 40; i++) {
      var p = placements[i];
      if (p.cell > 35 || p.cell < 0) break;
      s += p.cell.toString(36) + String(((p.turn % 6) + 6) % 6);
    }
    return s;
  }
  function unpackMap(s) {
    var out = [];
    if (typeof s !== 'string' || !MAP_RE.test(s)) return out;
    for (var i = 0; i < s.length; i += 2) out.push({ cell: parseInt(s.charAt(i), 36), turn: +s.charAt(i + 1) });
    return out;
  }

  var MAX_DAY = 100000;

  /** Any value in, a valid save out. Unknown keys are dropped; bad fields fall back to defaults. */
  function sanitize(raw) {
    var p = fresh();
    var r = obj(raw);
    p.sound = bool(r.sound, true);
    p.reduced = bool(r.reduced, false);
    p.tutorialDone = bool(r.tutorialDone, false);
    p.installDay = int(r.installDay, 0, MAX_DAY, 0);
    var daily = obj(r.daily);
    for (var k in daily) {
      if (!Object.prototype.hasOwnProperty.call(daily, k)) continue;
      var day = +k;
      if (!(day >= 1 && day <= MAX_DAY && Math.floor(day) === day)) continue;
      var d = obj(daily[k]);
      var s1 = int(d.s1, 0, 9999, -1);
      if (s1 < 0) continue;
      var rec = { s1: s1, map1: map(d.map1), par: int(d.par, 0, 9999, 0), gold: int(d.gold, 0, 9999, 0), archive: bool(d.archive, false) };
      var s2 = int(d.s2, 0, 9999, -1);
      if (s2 >= 0) { rec.s2 = s2; rec.map2 = map(d.map2); }
      p.daily[day] = rec;
    }
    var st = obj(r.streak);
    p.streak = {
      count: int(st.count, 0, MAX_DAY, 0),
      lastDay: int(st.lastDay, 0, MAX_DAY, 0),
      best: int(st.best, 0, MAX_DAY, 0),
      repairedOn: int(st.repairedOn, 0, MAX_DAY, 0)
    };
    if (p.streak.best < p.streak.count) p.streak.best = p.streak.count;
    var at = obj(r.atlas);
    var done = obj(at.done);
    p.atlas = {
      done: {},
      finished: int(at.finished, 0, 1e7, 0),
      sinceAd: int(at.sinceAd, 0, 1e7, 0),
      previewDay: int(at.previewDay, 0, MAX_DAY, 0),
      previewIsland: int(at.previewIsland, 0, 1e6, 0)
    };
    for (var n in done) {
      if (!Object.prototype.hasOwnProperty.call(done, n)) continue;
      var num = +n;
      if (!(num >= 1 && num <= 1e6 && Math.floor(num) === num)) continue;
      var a = obj(done[n]);
      var best = int(a.best, 0, 9999, -1);
      if (best < 0) continue;
      p.atlas.done[num] = { best: best, stars: int(a.stars, 1, 3, 1), map: map(a.map) };
    }
    var ar = obj(r.archive);
    var open = obj(ar.open);
    p.archive = { day: int(ar.day, 0, MAX_DAY, 0), used: int(ar.used, 0, ARCHIVE_PER_DAY, 0), open: {} };
    for (var o in open) {
      if (Object.prototype.hasOwnProperty.call(open, o) && open[o] === true && +o >= 1 && +o <= MAX_DAY) p.archive.open[+o] = true;
    }
    p.secondTryDay = int(r.secondTryDay, 0, MAX_DAY, 0);
    p.offerShown = bool(r.offerShown, false);
    p.undoHinted = bool(r.undoHinted, false);
    var dr = obj(r.dailyRun);
    var drDay = int(dr.day, 1, MAX_DAY, 0);
    if (drDay && typeof dr.map === 'string' && MAP_RE.test(dr.map)) {
      p.dailyRun = { day: drDay, map: dr.map, second: bool(dr.second, false) };
    }
    var run = obj(r.run);
    if (typeof run.id === 'string' && /^(?:d|a)[0-9]{1,7}$/.test(run.id) && typeof run.map === 'string' && MAP_RE.test(run.map)) {
      p.run = { id: run.id, map: run.map, second: bool(run.second, false), archive: bool(run.archive, false), preview: bool(run.preview, false) };
    }
    return p;
  }

  /** Save migration for Shell.configureSave: every older shape goes through the sanitizer. */
  function migrate(data) {
    return sanitize(data);
  }

  // ---- streak ----

  /**
   * What the home screen shows for the streak on [today]: the count still alive, and whether a repair can
   * be offered (exactly one missed day, a streak to keep, today's island not yet finished, and no repair
   * in the last 7 days).
   */
  function streakStatus(p, today) {
    var s = p.streak;
    var doneToday = !!(p.daily[today] && !p.daily[today].archive);
    if (s.count > 0 && s.lastDay >= today - 1) return { count: s.count, repair: false, best: s.best };
    var repairable = s.count > 0 && s.lastDay === today - 2 && !doneToday &&
      (s.repairedOn === 0 || today - s.repairedOn >= REPAIR_EVERY_DAYS);
    return { count: repairable ? s.count : 0, repair: repairable, best: s.best };
  }

  /** The repair, once granted: the missed day counts. */
  function repairStreak(p, today) {
    var st = streakStatus(p, today);
    if (!st.repair) return false;
    p.streak.lastDay = today - 1;
    p.streak.repairedOn = today;
    return true;
  }

  // ---- daily and archive ----

  /**
   * Record a finished daily. [today] is the date's own day number; only today's island moves the streak.
   * A second try keeps the first score and adds the second. Returns the record.
   */
  function finishDaily(p, day, today, score, placements, opts) {
    opts = opts || {};
    var rec = p.daily[day];
    var mapStr = packMap(placements || []);
    if (rec && opts.second) {
      rec.s2 = score;
      rec.map2 = mapStr;
    } else if (!rec) {
      rec = { s1: score, map1: mapStr, par: opts.par | 0, gold: opts.gold | 0, archive: day !== today };
      p.daily[day] = rec;
      if (day === today) {
        var s = p.streak;
        if (s.lastDay === today - 1 && s.count > 0) s.count += 1;
        else if (s.lastDay !== today) s.count = 1;
        s.lastDay = today;
        if (s.count > s.best) s.best = s.count;
      } else {
        delete p.archive.open[day];
      }
    }
    return rec;
  }

  function bestOf(rec) {
    if (!rec) return -1;
    return rec.s2 != null && rec.s2 > rec.s1 ? rec.s2 : rec.s1;
  }

  /** The map of the better score. */
  function bestMap(rec) {
    if (!rec) return '';
    return rec.s2 != null && rec.s2 > rec.s1 ? rec.map2 : rec.map1;
  }

  function secondTryAvailable(p, today) {
    var rec = p.daily[today];
    return !!rec && !rec.archive && rec.s2 == null && p.secondTryDay !== today;
  }

  function archiveLeft(p, today) {
    return ARCHIVE_PER_DAY - (p.archive.day === today ? p.archive.used : 0);
  }

  /** An archive day the player may open now without an ad: already unlocked or (owners) any past day. */
  function archiveOpen(p, day, today, adFree) {
    if (day < 1 || day >= today) return false;
    return !!adFree || !!p.archive.open[day];
  }

  /** Count one rewarded archive unlock. False when today's three are used. */
  function unlockArchive(p, day, today) {
    if (day < 1 || day >= today || p.daily[day]) return false;
    if (archiveLeft(p, today) <= 0) return false;
    if (p.archive.day !== today) { p.archive.day = today; p.archive.used = 0; }
    p.archive.used += 1;
    p.archive.open[day] = true;
    return true;
  }

  // ---- Atlas ----

  function stars(score, par, gold) {
    return 1 + (score >= par ? 1 : 0) + (gold > 0 && score >= gold ? 1 : 0);
  }

  function pageDone(p, page) {
    var first = islands.firstOfPage(page);
    for (var n = first; n < first + islands.PAGE_SIZE; n++) if (!p.atlas.done[n]) return false;
    return true;
  }

  /** The highest open page: page 1, and each page after one whose three islands are all finished. */
  function openPage(p) {
    var page = 1;
    while (pageDone(p, page) && page < 1e5) page++;
    return page;
  }

  function islandOpen(p, n) {
    return islands.pageOf(n) <= openPage(p) || !!p.atlas.done[n];
  }

  /** The island Preview island would open today: the first unfinished island of the first locked page. */
  function previewTarget(p) {
    var page = openPage(p) + 1;
    var first = islands.firstOfPage(page);
    for (var n = first; n < first + islands.PAGE_SIZE; n++) if (!p.atlas.done[n]) return n;
    return 0;
  }

  function previewAvailable(p, today) {
    return p.atlas.previewDay !== today && previewTarget(p) > 0;
  }

  function usePreview(p, today) {
    if (!previewAvailable(p, today)) return 0;
    p.atlas.previewDay = today;
    p.atlas.previewIsland = previewTarget(p);
    return p.atlas.previewIsland;
  }

  /** Record a finished Atlas island (any replay counts as a finish for the ad counter). */
  function finishAtlas(p, n, score, par, gold, placements) {
    var st = stars(score, par, gold);
    var prev = p.atlas.done[n];
    if (!prev || score > prev.best) p.atlas.done[n] = { best: score, stars: Math.max(st, prev ? prev.stars : 1), map: packMap(placements || []) };
    else if (st > prev.stars) prev.stars = st;
    p.atlas.finished += 1;
    p.atlas.sinceAd += 1;
    if (n === 1) p.tutorialDone = true;
    return p.atlas.done[n];
  }

  /** The next Atlas island to offer: the first unfinished island of the open pages. */
  function nextAtlas(p) {
    var last = islands.firstOfPage(openPage(p)) + islands.PAGE_SIZE - 1;
    for (var n = 1; n <= last; n++) if (!p.atlas.done[n]) return n;
    return last + 1;
  }

  var api = {
    VERSION: VERSION, ARCHIVE_PER_DAY: ARCHIVE_PER_DAY, REPAIR_EVERY_DAYS: REPAIR_EVERY_DAYS,
    fresh: fresh, sanitize: sanitize, migrate: migrate, packMap: packMap, unpackMap: unpackMap,
    streakStatus: streakStatus, repairStreak: repairStreak, finishDaily: finishDaily, bestOf: bestOf,
    bestMap: bestMap, secondTryAvailable: secondTryAvailable, archiveLeft: archiveLeft, archiveOpen: archiveOpen,
    unlockArchive: unlockArchive, stars: stars, pageDone: pageDone, openPage: openPage, islandOpen: islandOpen,
    previewTarget: previewTarget, previewAvailable: previewAvailable, usePreview: usePreview,
    finishAtlas: finishAtlas, nextAtlas: nextAtlas
  };
  FC.progress = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
