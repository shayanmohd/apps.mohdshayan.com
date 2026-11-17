/*
 * The Daily Last Over's number and its over. The number comes from the player's local date, as Wordle
 * does (day 1 is 1 November 2026), so it flips at local midnight and the same number means the same over
 * on Android and the web. The over itself comes from the precomputed, solver-checked table in
 * daily-table.js (tools/build-daily.js). A shared link carries the day: ?d=N.
 */
(function (root, factory) {
  var m = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.SS = root.SS || {}).daily = m;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var table = typeof module === 'object' && module.exports ? require('./daily-table.js') : root.SS.dailyTable;
  var EPOCH = Date.UTC(2026, 10, 1); // 1 November 2026 is day 1
  var DAY_MS = 86400000;
  var PLAY_URL = 'https://apps.mohdshayan.com/slogstop/play/';

  /** Day number for a local date (a Date, read in the device's own time zone). */
  function dayNumber(date) {
    var d = date || new Date();
    return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / DAY_MS) + 1;
  }

  /** The local date of a day number, as a Date at local noon. */
  function dateOf(day) {
    var t = new Date(EPOCH + (day - 1) * DAY_MS);
    return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 12);
  }

  /** The over for a day: { day, target, wickets, player, seed }. After the table ends it wraps. */
  function entry(day) {
    var n = Math.max(1, day | 0);
    var rows = table.days;
    var r = rows[(n - 1) % rows.length];
    return { day: n, target: r[0], wickets: r[1], player: r[2], seed: r[3] >>> 0 };
  }

  function link(day) {
    return PLAY_URL + '?d=' + (day | 0);
  }

  /** The day a link asks for, from a query such as "?d=12", or 0. Only 1 up to tomorrow is accepted. */
  function fromQuery(search, today) {
    var m = /[?&]d=(\d{1,6})(?:&|$)/.exec(String(search || ''));
    if (!m) return 0;
    var n = parseInt(m[1], 10);
    if (!(n >= 1) || n > today + 1) return 0;
    return n;
  }

  return { EPOCH: EPOCH, PLAY_URL: PLAY_URL, dayNumber: dayNumber, dateOf: dateOf, entry: entry, link: link, fromQuery: fromQuery, size: function () { return table.days.length; } };
});
