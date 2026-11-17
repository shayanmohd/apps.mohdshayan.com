/*
 * Share lines and Beat my over links. Pure functions, tested in tests/share.test.js.
 *
 * Daily: spoiler free, the ball by ball line only ("Slogstop #41: defended 11, W . 1 4 . W"), R after
 * the number when the second try was used, and a link to the Daily: ?d=41.
 * Beat my over: ?c=<mode><target>.<wickets>.<player>.<seed base 36>.<line>, for example
 * ?c=d11.2.3.k2j9x.W0140W (a dot is 0 in a link). The friend plays the same over in the browser.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.SS = root.SS || {}).share = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PLAY_URL = 'https://apps.mohdshayan.com/slogstop/play/';
  var CODE_RE = /^([dc])(\d{1,2})\.([1-3])\.([0-5])\.([0-9a-z]{1,7})\.([W012346]{0,6})$/;

  function format(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }

  /** A line of symbols (W . 1 4) from an over's entries; solo overs have no no-balls. */
  function lineOf(entries) {
    var parts = [];
    for (var i = 0; i < entries.length; i++) parts.push(entries[i].s);
    return parts.join(' ');
  }

  /** The challenge code of a finished solo over, or '' when it cannot be sent (a no-ball in it). */
  function encode(o) {
    var line = '';
    for (var i = 0; i < o.entries.length; i++) {
      var s = o.entries[i].s;
      if (s === '.') line += '0';
      else if (/^[W12346]$/.test(s)) line += s;
      else return '';
    }
    if (line.length > 6) return '';
    var seed = (o.seed >>> 0).toString(36);
    if (seed.length > 7) return '';
    return (o.mode === 'chase' ? 'c' : 'd') + (o.target | 0) + '.' + (o.wickets | 0) + '.' + (o.player | 0) + '.' + seed + '.' + line;
  }

  /** The over a code describes, or null for anything malformed. */
  function decode(code) {
    var m = CODE_RE.exec(String(code || ''));
    if (!m) return null;
    var target = parseInt(m[2], 10);
    if (!(target >= 1 && target <= 40)) return null;
    var seed = parseInt(m[5], 36);
    if (!(seed >= 0) || seed > 0xffffffff) return null;
    var line = m[6].split('').map(function (c) { return c === '0' ? '.' : c; }).join(' ');
    return { mode: m[1] === 'c' ? 'chase' : 'defend', target: target, wickets: parseInt(m[3], 10), player: parseInt(m[4], 10), seed: seed >>> 0, line: line };
  }

  /** The code in a query string such as "?c=...". */
  function fromQuery(search) {
    var m = /[?&]c=([0-9a-zW.]{5,40})(?:&|$)/.exec(String(search || ''));
    return m ? decode(m[1]) : null;
  }

  function challengeUrl(code) {
    return PLAY_URL + '?c=' + code;
  }

  function dailyUrl(day) {
    return PLAY_URL + '?d=' + (day | 0);
  }

  /** The Daily's share text in the player's language: t is the strings table. */
  function dailyText(t, r) {
    return format(r.won ? t.shareDaily.won : t.shareDaily.lost, { n: r.day, r: r.second ? ' R' : '', t: r.target, line: r.line });
  }

  /** A solo over's share text (Defend, Chase, a rung or a shared over). */
  function soloText(t, r) {
    var key = r.mode === 'defend' ? (r.won ? 'defended' : 'notDefended') : (r.won ? 'chased' : 'notChased');
    return format(t.shareSolo[key], { t: r.target, line: r.line });
  }

  /** The duel's share text: both sides' totals and lines. */
  function duelText(t, d) {
    return format(t.shareDuel, { a: d.a, b: d.b });
  }

  return {
    PLAY_URL: PLAY_URL, lineOf: lineOf, encode: encode, decode: decode, fromQuery: fromQuery,
    challengeUrl: challengeUrl, dailyUrl: dailyUrl, dailyText: dailyText, soloText: soloText, duelText: duelText,
    format: format
  };
});
