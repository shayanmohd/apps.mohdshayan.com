/*
 * The Daily sky's number. It comes from the player's local date, as Wordle does, so it flips at local
 * midnight and the same number means the same sky everywhere (sky.js seeds it from the number alone).
 * A shared link carries the day: https://apps.mohdshayan.com/linesaw/play/?day=N.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.LS = root.LS || {}).daily = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPOCH = Date.UTC(2026, 10, 1); // 1 November 2026 is day 1
  var DAY_MS = 86400000;
  var PLAY_URL = 'https://apps.mohdshayan.com/linesaw/play/';

  /** Day number for a local date (a Date, read in the device's own time zone). */
  function dayNumber(date) {
    var d = date || new Date();
    return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / DAY_MS) + 1;
  }

  /** The play link for a day. */
  function link(day) {
    return PLAY_URL + '?day=' + (day | 0);
  }

  /**
   * The day a shared link asks for, from a query string such as "?day=12", or 0. Only days that exist
   * somewhere on Earth now are accepted: 1 up to tomorrow.
   */
  function fromQuery(search, today) {
    var m = /[?&]day=(\d{1,6})(?:&|$)/.exec(String(search || ''));
    if (!m) return 0;
    var n = parseInt(m[1], 10);
    if (!(n >= 1) || n > today + 1) return 0;
    return n;
  }

  return { EPOCH: EPOCH, PLAY_URL: PLAY_URL, dayNumber: dayNumber, link: link, fromQuery: fromQuery };
});
