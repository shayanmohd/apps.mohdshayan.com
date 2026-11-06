/*
 * Dates, with no network: the daily number from the player's local date, the Ramadan table with the
 * player's one day shift, which lantern a date brings, and the daily streak.
 *
 * Ramadan table (Umm al-Qura; the brief's date_table): 1 Ramadan 1448 is 8 Feb 2027, a 29 day month
 * projected, so Eid al-Fitr is 9 Mar 2027 (10 Mar if the month runs 30 days). Ramadan 1449 begins about
 * 28 Jan 2028. The shift moves only the Ramadan numbering, never the daily.
 */
(function (root) {
  'use strict';
  var LC = root.LC || (root.LC = {});

  var DAY_MS = 86400000;
  var EPOCH_UTC = Date.UTC(2026, 10, 1); // day 1 = 1 November 2026
  var LANTERNS = 30;
  var RAMADAN = [
    { year: 1448, start: [2027, 2, 8], days: 29 },
    { year: 1449, start: [2028, 1, 28], days: 29 }
  ];

  /** Day number of a calendar date (month 1 to 12). Day 1 is 1 November 2026. */
  function dayNumber(y, m, d) {
    return Math.round((Date.UTC(y, m - 1, d) - EPOCH_UTC) / DAY_MS) + 1;
  }

  /** Today's day number from the player's local date. */
  function today(now) {
    var t = now || new Date();
    return dayNumber(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }

  /** The calendar date of a day number: { y, m, d } (month 1 to 12). */
  function dateOf(day) {
    var t = new Date(EPOCH_UTC + (day - 1) * DAY_MS);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  /** The shift setting, clamped to -1, 0 or 1. */
  function cleanShift(shift) {
    shift = shift | 0;
    return shift < -1 ? -1 : shift > 1 ? 1 : shift;
  }

  /**
   * What a day is in the Ramadan calendar, or null outside it:
   *   { year, phase: 'ramadan', n, lantern }  n Ramadan (1 to 30); lantern n becomes available
   *   { year, phase: 'eid', lantern }         Eid morning; in a 29 day month it brings lantern 30
   */
  function ramadan(day, shift) {
    shift = cleanShift(shift);
    for (var i = 0; i < RAMADAN.length; i++) {
      var r = RAMADAN[i];
      var s = dayNumber(r.start[0], r.start[1], r.start[2]) + shift;
      if (day >= s && day < s + r.days) return { year: r.year, phase: 'ramadan', n: day - s + 1, lantern: day - s + 1 };
      if (day === s + r.days) return { year: r.year, phase: 'eid', n: 0, lantern: r.days < LANTERNS ? LANTERNS : 0 };
    }
    return null;
  }

  /** The most recent Ramadan year that has begun on or before this day (for the home string), or 0. */
  function lastSeason(day, shift) {
    shift = cleanShift(shift);
    var y = 0;
    for (var i = 0; i < RAMADAN.length; i++) {
      var r = RAMADAN[i];
      if (day >= dayNumber(r.start[0], r.start[1], r.start[2]) + shift) y = r.year;
    }
    return y;
  }

  /** Days until the next 1 Ramadan (with the shift), or -1 when the table has none ahead. */
  function daysToRamadan(day, shift) {
    shift = cleanShift(shift);
    for (var i = 0; i < RAMADAN.length; i++) {
      var r = RAMADAN[i];
      var s = dayNumber(r.start[0], r.start[1], r.start[2]) + shift;
      if (s > day) return s - day;
    }
    return -1;
  }

  /** The first day number of a Ramadan year (with the shift). */
  function seasonStart(year, shift) {
    for (var i = 0; i < RAMADAN.length; i++) {
      var r = RAMADAN[i];
      if (r.year === year) return dayNumber(r.start[0], r.start[1], r.start[2]) + cleanShift(shift);
    }
    return 0;
  }

  // ---- the daily streak: { last, count, best, repairs: [days a repair was used] } ----

  function cleanStreak(s) {
    s = s && typeof s === 'object' ? s : {};
    var out = { last: s.last | 0, count: Math.max(0, s.count | 0), best: Math.max(0, s.best | 0), repairs: [] };
    if (Array.isArray(s.repairs)) for (var i = 0; i < s.repairs.length && i < 60; i++) out.repairs.push(s.repairs[i] | 0);
    if (out.best < out.count) out.best = out.count;
    return out;
  }

  /** The streak after lighting the daily of `day` (today). Lighting twice in a day changes nothing. */
  function recordStreak(s, day) {
    s = cleanStreak(s);
    if (s.last === day) return s;
    s.count = s.last === day - 1 ? s.count + 1 : 1;
    s.last = day;
    if (s.count > s.best) s.best = s.count;
    return s;
  }

  /** The streak to show today: it still counts until a whole day has been missed. */
  function currentStreak(s, day) {
    s = cleanStreak(s);
    return s.last >= day - 1 ? s.count : 0;
  }

  /** Exactly one day missed, a streak worth keeping, and no repair used in the last 7 days. */
  function canRepair(s, day) {
    s = cleanStreak(s);
    if (s.count < 2 || s.last !== day - 2) return false;
    for (var i = 0; i < s.repairs.length; i++) if (s.repairs[i] > day - 7) return false;
    return true;
  }

  /** Keeps the streak over the one missed day: yesterday counts as kept. */
  function repairStreak(s, day) {
    s = cleanStreak(s);
    if (!canRepair(s, day)) return s;
    s.last = day - 1;
    s.repairs.push(day);
    s.repairs = s.repairs.filter(function (d) { return d > day - 30; });
    return s;
  }

  var api = {
    LANTERNS: LANTERNS, RAMADAN: RAMADAN, dayNumber: dayNumber, today: today, dateOf: dateOf,
    cleanShift: cleanShift, ramadan: ramadan, lastSeason: lastSeason, daysToRamadan: daysToRamadan,
    seasonStart: seasonStart, cleanStreak: cleanStreak, recordStreak: recordStreak,
    currentStreak: currentStreak, canRepair: canRepair, repairStreak: repairStreak
  };
  LC.calendar = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
