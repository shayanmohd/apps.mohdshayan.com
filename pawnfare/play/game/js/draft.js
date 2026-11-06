/*
 * The draft after a won board: 1 of 3 (a 4th with the rewarded Fourth option). An option is a new piece,
 * a historical promotion of a piece the army has, or a Fuse of two of its pieces into one compound that
 * moves as both. Seeded, so the same run gives the same draft.
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var pieces = node ? require('./pieces.js') : root.Pawnfare.pieces;
  var eras = node ? require('./eras.js') : root.Pawnfare.eras;
  var rng = node ? require('./rng.js') : root.Pawnfare.rng;

  var STRONG = ['rukh', 'faras', 'pao', 'bishop', 'jamal'];

  /** The pieces this era's drafts may offer, given the unlocked pieces. */
  function poolFor(eraId, unlocked) {
    var era = eras.ERAS[eraId];
    var list = era.pool.slice();
    (unlocked || []).forEach(function (p) {
      if (list.indexOf(p) < 0 && pieces.BASE[p] && !pieces.BASE[p].royal) list.push(p);
    });
    return list;
  }

  /** Every fuse the army allows: two pieces whose compound is new and has at most three parts. */
  function fuses(army) {
    var out = [];
    var seen = {};
    for (var i = 0; i < army.length; i++) {
      for (var j = i + 1; j < army.length; j++) {
        var a = army[i];
        var b = army[j];
        if (a === b) continue;
        var result = pieces.fuse(a, b);
        if (result === pieces.parts(a).join('+') || result === pieces.parts(b).join('+')) continue;
        if (pieces.parts(result).length > 3) continue;
        var k = [a, b].sort().join('|');
        if (seen[k]) continue;
        seen[k] = true;
        var named = pieces.parts(result).length > 1 && !!pieces.namedId(result);
        var pawn = pieces.parts(a).indexOf('baidaq') >= 0 || pieces.parts(b).indexOf('baidaq') >= 0;
        out.push({ kind: 'fuse', a: a, b: b, result: result, weight: named ? 6 : pawn ? 1 : 3 });
      }
    }
    return out;
  }

  /** Every historical promotion the army allows in this era. */
  function promotions(eraId, army) {
    var out = [];
    eras.ERAS[eraId].promotions.forEach(function (p) {
      if (army.indexOf(p.from) >= 0) out.push({ kind: 'promote', from: p.from, to: p.to });
    });
    return out;
  }

  function weighted(list, r) {
    var total = 0;
    list.forEach(function (o) { total += o.weight || 1; });
    var x = r.int(total);
    for (var i = 0; i < list.length; i++) {
      x -= list[i].weight || 1;
      if (x < 0) return list[i];
    }
    return list[list.length - 1];
  }

  function sameOption(a, b) {
    // A new piece and a promotion to that same piece read as one choice: never both.
    if (a.kind === 'piece' && b.kind === 'promote') return a.type === b.to;
    if (a.kind === 'promote' && b.kind === 'piece') return a.to === b.type;
    if (a.kind !== b.kind) return false;
    if (a.kind === 'piece') return a.type === b.type;
    if (a.kind === 'promote') return a.from === b.from && a.to === b.to;
    return a.result === b.result;
  }

  /**
   * The draft's options. count: 3, or 4 with Fourth option (the 4th is new, never a repeat).
   * An army under 3 pieces is offered pieces only, one of them strong, so it can rebuild.
   */
  function options(eraId, army, unlocked, seed, count) {
    count = count || 3;
    var r = rng.create(seed);
    var pool = poolFor(eraId, unlocked);
    var out = [];
    function add(o) {
      if (!o) return false;
      for (var i = 0; i < out.length; i++) if (sameOption(out[i], o)) return false;
      out.push(o);
      return true;
    }
    function piece(strongOnly) {
      var list = pool.filter(function (p) { return !strongOnly || STRONG.indexOf(p) >= 0; });
      if (!list.length) list = pool;
      for (var tries = 0; tries < 20; tries++) {
        if (add({ kind: 'piece', type: r.pick(list) })) return true;
      }
      return false;
    }
    var roomForPiece = army.length < eras.ARMY_MAX;
    if (army.length < 3) {
      piece(true);
      while (out.length < count && piece(false)) { /* fill with pieces */ }
      return out.slice(0, count);
    }
    var proms = promotions(eraId, army);
    var fs = fuses(army);
    // Slot 1: a piece (or, with a full army, a fuse). Slot 2: a promotion when one exists. Slot 3: a fuse.
    if (roomForPiece) piece(false);
    else if (fs.length) add(weighted(fs, r));
    if (proms.length) add(r.pick(proms));
    if (fs.length) {
      for (var t = 0; t < 10 && out.length < 3; t++) if (add(weighted(fs, r))) break;
    }
    var guard = 0;
    while (out.length < count && guard++ < 40) {
      var roll = r.int(3);
      if (roll === 0 && roomForPiece) piece(false);
      else if (roll === 1 && proms.length) add(r.pick(proms));
      else if (fs.length) add(weighted(fs, r));
      else if (roomForPiece) piece(false);
    }
    return out.slice(0, count);
  }

  /** The army after taking an option (a new array). */
  function apply(army, option) {
    var next = army.slice();
    if (option.kind === 'piece') {
      if (next.length < eras.ARMY_MAX) next.push(option.type);
    } else if (option.kind === 'promote') {
      var i = next.indexOf(option.from);
      if (i >= 0) next[i] = option.to;
    } else if (option.kind === 'fuse') {
      var ia = next.indexOf(option.a);
      if (ia >= 0) next.splice(ia, 1);
      var ib = next.indexOf(option.b);
      if (ib >= 0) next.splice(ib, 1);
      next.push(option.result);
    }
    return next;
  }

  var api = { options: options, apply: apply, fuses: fuses, promotions: promotions, poolFor: poolFor, STRONG: STRONG };
  if (node) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).draft = api;
})(this);
