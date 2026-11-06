/*
 * The Daily: its number comes from the player's local calendar date (as Wordle does) and indexes the
 * precomputed, solver-checked table (daily-table.js). The same number is the same Daily everywhere.
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var codec = node ? require('./codec.js') : root.Pawnfare.codec;
  var eras = node ? require('./eras.js') : root.Pawnfare.eras;
  var table = node ? require('./daily-table.js') : root.Pawnfare.dailyTable;

  var DAY_MS = 86400000;
  var parts = table.epoch.split('-');
  var EPOCH_UTC = Date.UTC(+parts[0], +parts[1] - 1, +parts[2]);
  var days = null;

  /** The day number of a local date (default now). Day 1 is the epoch; earlier dates give 1. */
  function dayNumber(date) {
    var d = date || new Date();
    var utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    var n = Math.round((utc - EPOCH_UTC) / DAY_MS) + 1;
    return n < 1 ? 1 : n;
  }

  /** The local date key 'YYYY-MM-DD' (the archive's daily allowance resets with it). */
  function dateKey(date) {
    var d = date || new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function count() {
    if (!days) days = table.data.split('|');
    return days.length;
  }

  /** The Daily of a day number: { day, army: { id, year, promo, army }, boards: [5 board definitions] }. */
  function entry(day) {
    var n = count();
    var idx = ((day - 1) % n + n) % n;
    var text = days[idx];
    var army = eras.DAILY_ARMIES[+text[0]];
    var boards = text.slice(1).split(',').map(function (b) { return codec.decode(b, army.promo); });
    return { day: day, army: army, boards: boards };
  }

  var api = { dayNumber: dayNumber, dateKey: dateKey, entry: entry, count: count, epoch: table.epoch };
  if (node) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).daily = api;
})(this);
