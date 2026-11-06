/*
 * The daily dig: its number comes from the player's local calendar date (as Wordle does), and that
 * number indexes the precomputed, solver-screened table. The same number is the same dig everywhere.
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var rules = node ? require('./rules.js') : root.Sherd.rules;
  var table = node ? require('./daily-table.js') : root.Sherd.dailyTable;

  var DAY_MS = 86400000;
  var parts = table.epoch.split('-');
  var EPOCH_UTC = Date.UTC(+parts[0], +parts[1] - 1, +parts[2]);
  var decoded = null;

  /** The day number for a local date (default now). Day 1 is the table's epoch; earlier dates give 1. */
  function dayNumber(date) {
    var d = date || new Date();
    var utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    var n = Math.round((utc - EPOCH_UTC) / DAY_MS) + 1;
    return n < 1 ? 1 : n;
  }

  /** The calendar date of a day number, as { y, m (1 to 12), d }. */
  function dateOf(day) {
    var t = new Date(EPOCH_UTC + (day - 1) * DAY_MS);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  /** The placement index for a day. */
  function placementIndex(day) {
    if (!decoded) decoded = table.decode();
    var k = ((Math.max(1, day | 0) - 1) % decoded.length + decoded.length) % decoded.length;
    return decoded[k];
  }

  /** The shard for a day, as sorted cell indices in the 6 by 6 grid. */
  function target(day) {
    return rules.placements(table.n, table.W)[placementIndex(day)].slice();
  }

  /** A fresh dig for a day. */
  function createDig(day) {
    return rules.createDig({ W: table.W, n: table.n, maxTries: table.tries, target: target(day), blocked: [] });
  }

  var api = { dayNumber: dayNumber, dateOf: dateOf, placementIndex: placementIndex, target: target, createDig: createDig,
    W: table.W, n: table.n, tries: table.tries, epoch: table.epoch };
  if (node) module.exports = api;
  else (root.Sherd = root.Sherd || {}).daily = api;
})(this);
