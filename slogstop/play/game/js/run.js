/*
 * An unfinished solo over, saved so that closing the app (or the system killing it) in the middle of an
 * over does not lose it, and so that leaving a Daily by killing the app is no way to get a second try.
 *
 * An over is a pure function of its seed, its field and the picks made so far (the draws come from the
 * seed and the ball number), so the save holds only those: restore() builds the over again and replays
 * the picks through over.play(). Anything that does not make sense (an old save, a hand edit, a run that
 * had already finished) gives null and the game starts from its menu.
 */
(function (root, factory) {
  var m = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.SS = root.SS || {}).run = m;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var model = node ? require('./model.js') : root.SS.model;
  var over = node ? require('./over.js') : root.SS.over;

  var VERSION = 1;
  var KINDS = ['ladder', 'quick', 'daily', 'archive', 'challenge'];
  var LINE_RE = /^[0-9W. nb]{0,80}$/;

  function isInt(v, lo, hi) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi; }

  /**
   * The saved form of a running session. s: { kind, mode, target, wickets, player, seed, rung, day,
   * theirLine, shape, move, o (the over), freeHitAt (balls bowled when the free hit was granted, or -1),
   * freeHitUsed, rewarded }.
   */
  function snapshot(s) {
    var picks = [];
    for (var i = 0; i < s.o.line.length; i++) picks.push([s.o.line[i].d, s.o.line[i].pick]);
    return {
      v: VERSION, kind: s.kind, mode: s.mode, target: s.target, wickets: s.wickets, player: s.player,
      seed: s.seed >>> 0, rung: s.rung == null ? -1 : s.rung, day: s.day == null ? 0 : s.day,
      line: s.theirLine || '', shape: s.shape, move: s.move ? { from: s.move.from, to: s.move.to } : null,
      picks: picks, fh: s.freeHitAt == null ? -1 : s.freeHitAt, fhUsed: !!s.freeHitUsed, rewarded: !!s.rewarded
    };
  }

  /**
   * The run a save describes, or null. Returns { spec, shape, move, o, freeHitAt, freeHitUsed, rewarded }
   * with the over replayed up to the last saved ball; spec is what startSolo() takes.
   */
  function restore(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
    if (KINDS.indexOf(raw.kind) < 0 || (raw.mode !== 'defend' && raw.mode !== 'chase')) return null;
    if (!isInt(raw.target, 1, 99) || !isInt(raw.wickets, 1, 3) || !isInt(raw.player, 0, 5)) return null;
    if (!isInt(raw.seed, 0, 4294967295) || !isInt(raw.rung, -1, 29) || !isInt(raw.day, 0, 1000000)) return null;
    if (raw.kind === 'ladder' && raw.rung < 0) return null;
    if ((raw.kind === 'daily' || raw.kind === 'archive') && raw.day < 1) return null;
    if (typeof raw.line !== 'string' || !LINE_RE.test(raw.line)) return null;
    if (!isInt(raw.shape, 0, model.SHAPES.length - 1)) return null;
    var move = null;
    if (raw.move) {
      if (typeof raw.move !== 'object' || !isInt(raw.move.from, 0, 11) || !isInt(raw.move.to, 0, 11)) return null;
      if (!model.canMove(model.SHAPES[raw.shape].slots, raw.move.from, raw.move.to)) return null;
      move = { from: raw.move.from, to: raw.move.to };
    }
    if (!Array.isArray(raw.picks) || raw.picks.length > over.BALLS) return null;
    var field = model.makeField(raw.shape, move);
    var o = over.create({ target: raw.target, wickets: raw.wickets, seed: raw.seed, field: field });
    var fh = raw.fh;
    if (!isInt(fh, -1, over.BALLS)) return null;
    for (var i = 0; i < raw.picks.length; i++) {
      var p = raw.picks[i];
      if (!Array.isArray(p) || p.length !== 2 || !isInt(p[0], 0, model.ND - 1) || !isInt(p[1], 0, model.BLOCK)) return null;
      if (o.done) return null; // more picks than the over could take
      if (fh === i) o.freeHit = true;
      over.play(o, p[0], p[1]);
    }
    if (o.done) return null; // it had finished: nothing to resume
    if (fh >= 0 && fh === raw.picks.length) o.freeHit = true;
    return {
      spec: {
        kind: raw.kind, mode: raw.mode, target: raw.target, wickets: raw.wickets, player: raw.player, seed: raw.seed,
        rung: raw.rung < 0 ? undefined : raw.rung, day: raw.day || undefined, line: raw.line, shape: raw.shape
      },
      shape: raw.shape, move: move, o: o, freeHitAt: fh, freeHitUsed: !!raw.fhUsed, rewarded: !!raw.rewarded
    };
  }

  return { VERSION: VERSION, snapshot: snapshot, restore: restore };
});
