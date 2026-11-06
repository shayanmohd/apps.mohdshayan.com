/*
 * The Daily Show: the day number comes from the player's local date (as Wordle does), so the same number
 * is the same show on Android and the web. Also the streak, the calendar and the wordless share text.
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};
  var rngLib = Sky.rng || (typeof require === 'function' ? require('./rng.js') : null);

  var EPOCH = Date.UTC(2026, 10, 1); // 1 Nov 2026 is day 1
  var DAY_MS = 86400000;
  var PLAY_URL = 'https://apps.mohdshayan.com/skychime/play/';
  var ROTATION = ['harbour', 'desert', 'snow'];
  var MARK = ['·', '✧', '✦']; // none, partial, full clear

  /** Day number of a local calendar date (a Date, read in local time). */
  function dayNumber(date) {
    var utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor((utc - EPOCH) / DAY_MS) + 1;
  }

  /** {y, m (0..11), d} of a day number. */
  function dateOf(day) {
    var t = new Date(EPOCH + (day - 1) * DAY_MS);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
  }

  function seed(day) { return rngLib.hash32('skychime-daily-' + day); }

  /** The festival night on a local date, from the date table, or null. */
  var FESTIVALS = [{ id: 'newyear', from: [11, 26], to: [0, 6] }];
  function festivalOn(m, d) {
    for (var i = 0; i < FESTIVALS.length; i++) {
      var f = FESTIVALS[i];
      var after = m > f.from[0] || (m === f.from[0] && d >= f.from[1]);
      var before = m < f.to[0] || (m === f.to[0] && d <= f.to[1]);
      var wraps = f.from[0] > f.to[0];
      if (wraps ? (after || before) : (after && before)) return f.id;
    }
    return null;
  }

  function skylineFor(day) {
    var dt = dateOf(day);
    if ((dt.m === 11 && dt.d === 31) || (dt.m === 0 && dt.d === 1)) return 'newyear';
    return ROTATION[((day % 3) + 3) % 3];
  }

  /** Consecutive days played, ending today, or yesterday when today is not played yet. */
  function streak(history, today) {
    var n = 0;
    var d = history[today] ? today : today - 1;
    while (history[d]) { n++; d--; }
    return n;
  }

  /** The last [count] days, oldest first, for the calendar. */
  function calendar(history, today, count) {
    var list = [];
    for (var d = today - count + 1; d <= today; d++) {
      var r = history[d];
      list.push({ day: d, played: !!r, second: !!(r && r.second), today: d === today });
    }
    return list;
  }

  /**
   * Wordless share text: day number, volley marks, longest chain, Perfects, a mark for a second try.
   * The play link goes separately as Shell.share's url.
   */
  function shareText(day, rec) {
    var marks = '';
    for (var i = 0; i < rec.marks.length; i++) marks += MARK[rec.marks[i]] || MARK[0];
    return 'Skychime #' + day + (rec.second ? ' ↻' : '') + '\n' + marks + '\n' +
      '✺ ' + rec.chain + '   ◎ ' + rec.perfects;
  }

  var api = {
    EPOCH: EPOCH, PLAY_URL: PLAY_URL, MARK: MARK, dayNumber: dayNumber, dateOf: dateOf, seed: seed,
    skylineFor: skylineFor, festivalOn: festivalOn, streak: streak, calendar: calendar, shareText: shareText
  };
  Sky.daily = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
