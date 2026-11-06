/*
 * The Daily's share text: spoiler free (no positions), one line per board with a coloured square, the
 * moves against par and the survivors as pawn glyphs. The card picture is drawn by art.js.
 */
(function (root) {
  'use strict';

  var GREEN = '🟩';
  var YELLOW = '🟨';
  var RED = '🟥';
  var PAWN = '♟';

  /** A board's mark against par: 'par', '+1', '-1', or '' for a lost board. */
  function versusPar(r) {
    if (!r || !r.won) return '';
    var d = r.moves - r.par;
    return d === 0 ? 'par' : (d > 0 ? '+' : '') + d;
  }

  function square(r) {
    if (!r || !r.won) return RED;
    return r.moves <= r.par ? GREEN : YELLOW;
  }

  /**
   * entry: the Daily (daily.entry), results: up to 5 { won, moves, par, survivors, army }, archive: true
   * for a past day. text: { title(day, won, archive), place(armyDef) } from the strings table.
   */
  function dailyText(entry, results, archive, text) {
    var won = results.filter(function (r) { return r && r.won; }).length;
    var lines = [];
    lines.push(text.title ? text.title(entry.day, won, archive) : 'Pawnfare #' + entry.day + ' ' + won + '/5' + (archive ? ' (archive)' : ''));
    lines.push(text.place(entry.army));
    for (var i = 0; i < 5; i++) {
      var r = results[i];
      var survivors = r ? Math.max(0, Math.min(9, r.survivors | 0)) : 0;
      lines.push(square(r) + ' ' + (versusPar(r) ? versusPar(r) + ' ' : '') + new Array(survivors + 1).join(PAWN));
    }
    return lines.join('\n');
  }

  var api = { dailyText: dailyText, versusPar: versusPar };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).share = api;
})(this);
