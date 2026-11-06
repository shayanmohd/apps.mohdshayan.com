/*
 * Everything a finished dig changes, and every ad cap the game enforces itself (GAME-DESIGN.md section 5).
 * Pure functions over the save object, so the rules are unit tested and the UI only calls them.
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var rules = node ? require('./rules.js') : root.Sherd.rules;
  var expedition = node ? require('./expedition.js') : root.Sherd.expedition;
  var museum = node ? require('./museum.js') : root.Sherd.museum;

  var ARCHIVE_PER_DAY = 3;
  var REPAIR_EVERY_DAYS = 7;
  var DOUBLE_DIGS = 3;
  var DOUBLE_AFTER_DIGS = 3;          // not offered during the first digs, which teach the game
  var INTERSTITIAL_AFTER_DIGS = 4;   // none in the first 3 Expedition digs since install
  var INTERSTITIAL_EVERY_DIGS = 2;   // at most one per 2 Expedition digs

  /** Hits and nears for every try: the share card's rows. */
  function rows(dig) {
    return dig.tries.map(function (t) {
      var h = 0;
      var n = 0;
      t.marks.forEach(function (m) { if (m === rules.HIT) h++; else if (m === rules.NEAR) n++; });
      return [h, n];
    });
  }

  // ---- streak ----

  /** The streak as it stands today: alive while the last solved daily is today's or yesterday's. */
  function streakNow(save, today) {
    return save.streak.lastSolved >= today - 1 ? save.streak.current : 0;
  }

  /** Streak repair: one missed day, today's daily not finished yet, at most once a week. */
  function repairOffered(save, today) {
    var st = save.streak;
    if (st.current < 1 || st.lastSolved !== today - 2) return false;
    if (save.days[today] || save.days[today - 1]) return false;
    return !st.lastRepairOn || today - st.lastRepairOn >= REPAIR_EVERY_DAYS;
  }

  /**
   * The streak the home screen shows. While a missed day can still be repaired (canRepair: an ad can play
   * or the player is ad free), the streak at stake, so it never reads 0 beside "keep your 3 day streak".
   */
  function streakShown(save, today, canRepair) {
    return canRepair && repairOffered(save, today) ? save.streak.current : streakNow(save, today);
  }

  function applyRepair(save, today) {
    if (!repairOffered(save, today)) return false;
    save.streak.lastSolved = today - 1;
    save.streak.lastRepairOn = today;
    save.streak.mended = true;
    return true;
  }

  /** Records a finished daily (live or archive). Returns what it earned. */
  function finishDaily(save, day, dig, isArchive) {
    var record = { w: dig.won ? 1 : 0, t: dig.tries.length, r: rows(dig), a: isArchive ? 1 : 0, c: rules.narrowing(dig) };
    save.days[day] = record;
    var out = { glaze: 0, streak: save.streak.current };
    if (isArchive) {
      save.archive.unlocked = save.archive.unlocked.filter(function (d) { return d !== day; });
      return out;
    }
    var st = save.streak;
    if (dig.won) {
      st.current = st.lastSolved === day - 1 ? st.current + 1 : 1;
      if (st.current === 1) st.mended = false;
      st.lastSolved = day;
      if (st.current > st.best) st.best = st.current;
      save.glaze += 1;
      out.glaze = 1;
    } else {
      st.current = 0;
      st.mended = false;
    }
    out.streak = st.current;
    return out;
  }

  /** A daily left unfinished at midnight moves to the archive, unlocked, so the progress is kept. */
  function rollover(save, today) {
    var a = save.active.daily;
    if (!a || a.day === today) return false;
    if (!save.active.archive) save.active.archive = a;
    if (save.archive.unlocked.indexOf(a.day) < 0) save.archive.unlocked.push(a.day);
    save.active.daily = null;
    return true;
  }

  // ---- Expedition ----

  /** Records a finished Expedition dig and moves the run on. Returns the stars and fragments. */
  function finishExpedition(save, made) {
    var e = save.exp;
    var dig = made.dig;
    var before = museum.progress(e.fragments, save.glaze);
    e.completed += 1;
    save.ads.sinceInterstitial += 1;
    var stars = expedition.stars(dig.won, dig.tries.length, made.par);
    var doubled = false;
    var gained = 0;
    if (dig.won) {
      e.solved += 1;
      if (e.double.left > 0) { doubled = true; e.double.left -= 1; }
      gained = stars * (doubled ? 2 : 1);
      e.fragments += gained;
      if (!e.stars[made.digNo] || e.stars[made.digNo] < stars) e.stars[made.digNo] = stars;
      if (dig.survey) e.surveyed[made.digNo] = 1;
      e.dig = made.digNo + 1;
      e.attempt = 0;
    } else {
      e.attempt = made.attempt + 1;
    }
    var after = museum.progress(e.fragments, save.glaze);
    return { stars: stars, gained: gained, doubled: doubled, before: before, after: after,
      restoredNow: after.restored - before.restored };
  }

  /** Whether Next on a solved Expedition dig may ask the shell for an interstitial. */
  function interstitialDue(save, adFree, rewardedThisBreak) {
    if (adFree || rewardedThisBreak) return false;
    return save.exp.completed >= INTERSTITIAL_AFTER_DIGS && save.ads.sinceInterstitial >= INTERSTITIAL_EVERY_DIGS;
  }

  function interstitialShown(save) {
    save.ads.sinceInterstitial = 0;
    save.ads.shown += 1;
  }

  function doubleOffered(save, today) {
    return save.exp.completed >= DOUBLE_AFTER_DIGS && save.exp.double.lastDay !== today && save.exp.double.left === 0;
  }

  function grantDouble(save, today) {
    if (!doubleOffered(save, today)) return false;
    save.exp.double.lastDay = today;
    save.exp.double.left = DOUBLE_DIGS;
    return true;
  }

  // ---- archive ----

  function archiveOpensLeft(save, today) {
    return save.archive.day === today ? Math.max(0, ARCHIVE_PER_DAY - save.archive.opens) : ARCHIVE_PER_DAY;
  }

  /** 'future', 'today', 'played', 'open' (unlocked, ad free or in progress) or 'locked'. */
  function archiveState(save, day, today, adFree) {
    if (day > today) return 'future';
    if (day === today) return 'today';
    if (save.days[day]) return 'played';
    if (adFree || save.archive.unlocked.indexOf(day) >= 0) return 'open';
    if (save.active.archive && save.active.archive.day === day) return 'open';
    return 'locked';
  }

  function unlockArchive(save, day, today) {
    if (archiveOpensLeft(save, today) < 1) return false;
    if (save.archive.day !== today) { save.archive.day = today; save.archive.opens = 0; }
    save.archive.opens += 1;
    if (save.archive.unlocked.indexOf(day) < 0) save.archive.unlocked.push(day);
    return true;
  }

  var api = {
    ARCHIVE_PER_DAY: ARCHIVE_PER_DAY, REPAIR_EVERY_DAYS: REPAIR_EVERY_DAYS, DOUBLE_DIGS: DOUBLE_DIGS, DOUBLE_AFTER_DIGS: DOUBLE_AFTER_DIGS,
    INTERSTITIAL_AFTER_DIGS: INTERSTITIAL_AFTER_DIGS, INTERSTITIAL_EVERY_DIGS: INTERSTITIAL_EVERY_DIGS,
    rows: rows, streakNow: streakNow, streakShown: streakShown, repairOffered: repairOffered, applyRepair: applyRepair,
    finishDaily: finishDaily, rollover: rollover, finishExpedition: finishExpedition,
    interstitialDue: interstitialDue, interstitialShown: interstitialShown, doubleOffered: doubleOffered,
    grantDouble: grantDouble, archiveOpensLeft: archiveOpensLeft, archiveState: archiveState, unlockArchive: unlockArchive
  };
  if (node) module.exports = api;
  else (root.Sherd = root.Sherd || {}).progress = api;
})(this);
