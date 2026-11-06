/*
 * The share card: text only, so it works in every messenger. The day number, the tries, one row of
 * marks per try (hits, then nears, then soil, so it shows progress and gives nothing away), an icon for
 * rewarded help, and the link to the web daily.
 */
(function (root) {
  'use strict';
  var URL = 'https://apps.mohdshayan.com/sherd/play/';
  var HIT = String.fromCodePoint(0x1F7E6);   // blue square: glaze
  var NEAR = String.fromCodePoint(0x1F7EB);  // brown square: oxide rim
  var MISS = String.fromCodePoint(0x2B1C);   // white square: soil
  var MENDED = String.fromCodePoint(0x1FA79); // a streak kept with a repair
  var ARCHIVE = String.fromCodePoint(0x1F5C2) + '️';

  /**
   * opts: { day, rows: [[hits, nears], ...], won, maxTries, n, mended, archive }
   * The card for Shell.share: the lines as text and the link as url (the shell and the browser add it).
   */
  function card(opts) {
    var n = opts.n || 5;
    var score = (opts.won ? opts.rows.length : 'X') + '/' + opts.maxTries;
    var head = 'Sherd #' + opts.day + ' ' + score;
    if (opts.archive) head += ' ' + ARCHIVE;
    if (opts.mended && !opts.archive) head += ' ' + MENDED;
    var lines = opts.rows.map(function (r) {
      var h = Math.max(0, Math.min(n, r[0] | 0));
      var nr = Math.max(0, Math.min(n - h, r[1] | 0));
      return repeat(HIT, h) + repeat(NEAR, nr) + repeat(MISS, n - h - nr);
    });
    return { text: [head].concat(lines).join('\n'), url: URL };
  }

  /** The whole card as one text, link last: what a messenger shows. */
  function text(opts) {
    return card(opts).text + '\n' + URL;
  }

  function repeat(s, k) {
    var out = '';
    for (var i = 0; i < k; i++) out += s;
    return out;
  }

  var api = { URL: URL, card: card, text: text, HIT: HIT, NEAR: NEAR, MISS: MISS, MENDED: MENDED };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Sherd = root.Sherd || {}).share = api;
})(this);
