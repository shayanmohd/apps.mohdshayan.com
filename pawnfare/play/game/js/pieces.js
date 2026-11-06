/*
 * Every piece as data. One move system covers them all:
 *   leap  jump straight to an offset, over anything in between
 *   ride  slide along a direction until blocked (captures the first enemy met)
 *   hop   the cannon's capture: slide along a direction, jump exactly one piece (the screen) and capture
 *         the first enemy beyond it
 * Offsets are written for the player, whose forward is up the board (dy = -1); the rival's are mirrored.
 * Each move has a mode: 'both' (move or capture), 'move' (only to an empty square), 'cap' (only a capture).
 *
 * Sources for the moves: H. J. R. Murray, A History of Chess (1913), chapters on chaturanga, shatranj,
 * Timur's great chess, courier chess and the new queen; and the standard rules of xiangqi, shogi and makruk.
 */
(function (root) {
  'use strict';

  var ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  var KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  var CAMEL = [[1, 3], [3, 1], [3, -1], [1, -3], [-1, -3], [-3, -1], [-3, 1], [-1, 3]];

  function times(list, n) {
    return list.map(function (d) { return [d[0] * n, d[1] * n]; });
  }

  var KING_VALUE = 100000;

  /**
   * code: one character for the daily table. value: the AI's material value. pin: [longitude, latitude]
   * for the museum map. era: where the museum files it. Names, places and history lines live in strings.js.
   */
  var BASE = {
    baidaq: { code: 'a', value: 100, pin: [44.4, 33.3], year: 850, promotes: true,
      moves: [{ k: 'leap', d: [[0, -1]], m: 'move' }, { k: 'leap', d: [[-1, -1], [1, -1]], m: 'cap' }] },
    ferz: { code: 'b', value: 150, pin: [52.5, 32.4], year: 600,
      moves: [{ k: 'leap', d: DIAG, m: 'both' }] },
    fil: { code: 'c', value: 130, pin: [44.4, 33.3], year: 850,
      moves: [{ k: 'leap', d: times(DIAG, 2), m: 'both' }] },
    faras: { code: 'd', value: 300, pin: [44.4, 33.3], year: 850,
      moves: [{ k: 'leap', d: KNIGHT, m: 'both' }] },
    rukh: { code: 'e', value: 500, pin: [44.4, 33.3], year: 850,
      moves: [{ k: 'ride', d: ORTH, m: 'both' }] },
    wazir: { code: 'f', value: 150, pin: [66.97, 39.65], year: 1400,
      moves: [{ k: 'leap', d: ORTH, m: 'both' }] },
    dabbaba: { code: 'g', value: 140, pin: [66.97, 39.65], year: 1400,
      moves: [{ k: 'leap', d: times(ORTH, 2), m: 'both' }] },
    jamal: { code: 'h', value: 250, pin: [66.97, 39.65], year: 1400,
      moves: [{ k: 'leap', d: CAMEL, m: 'both' }] },
    pao: { code: 'i', value: 380, pin: [114.3, 34.8], year: 1100,
      moves: [{ k: 'ride', d: ORTH, m: 'move' }, { k: 'hop', d: ORTH, m: 'cap' }] },
    kyosha: { code: 'j', value: 230, pin: [135.77, 35.0], year: 1200,
      moves: [{ k: 'ride', d: [[0, -1]], m: 'both' }] },
    khon: { code: 'k', value: 240, pin: [100.57, 14.35], year: 1600,
      moves: [{ k: 'leap', d: DIAG.concat([[0, -1]]), m: 'both' }] },
    gin: { code: 'l', value: 240, pin: [135.77, 35.0], year: 1200,
      moves: [{ k: 'leap', d: DIAG.concat([[0, -1]]), m: 'both' }] },
    kin: { code: 'm', value: 260, pin: [135.77, 35.0], year: 1200,
      moves: [{ k: 'leap', d: ORTH.concat([[1, -1], [-1, -1]]), m: 'both' }] },
    bishop: { code: 'n', value: 330, pin: [-0.38, 39.47], year: 1475,
      moves: [{ k: 'ride', d: DIAG, m: 'both' }] },
    queen: { code: 'o', value: 900, pin: [-0.38, 39.47], year: 1475,
      moves: [{ k: 'ride', d: ORTH.concat(DIAG), m: 'both' }] },
    shah: { code: 'p', value: 0, royal: true, pin: [52.5, 32.4], year: 600,
      moves: [{ k: 'leap', d: ORTH.concat(DIAG), m: 'both' }] }
  };

  /** The canonical order of the base pieces: compounds list their parts in this order. */
  var ORDER = ['baidaq', 'ferz', 'fil', 'faras', 'rukh', 'wazir', 'dabbaba', 'jamal', 'pao', 'kyosha',
    'khon', 'gin', 'kin', 'bishop', 'queen', 'shah'];

  /** Compounds with a real historical name (looked up by their parts, in canonical order). */
  var NAMED = {
    'faras+rukh': { id: 'champion', pin: [14.79, 37.27], year: 1617 },
    'faras+bishop': { id: 'centaur', pin: [14.79, 37.27], year: 1617 },
    'faras+queen': { id: 'amazon', pin: [37.6, 55.75], year: 1750 },
    'ferz+wazir': { id: 'mann', pin: [10.95, 51.92], year: 1200 }
  };

  var byCode = {};
  ORDER.forEach(function (id) { byCode[BASE[id].code] = id; });

  /** The parts of a type string ('rukh' or 'faras+rukh'), canonical and without duplicates. */
  function parts(type) {
    var list = String(type).split('+').filter(function (p) { return BASE[p]; });
    var seen = {};
    list = list.filter(function (p) { if (seen[p]) return false; seen[p] = true; return true; });
    list.sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); });
    return list;
  }

  /**
   * A fused type: the parts of both, with queen-equivalents simplified (rukh and bishop together are the
   * queen's move, so they become 'queen').
   */
  function fuse(a, b) {
    var list = parts(a + '+' + b);
    if (list.indexOf('rukh') >= 0 && list.indexOf('bishop') >= 0) {
      list = list.filter(function (p) { return p !== 'rukh' && p !== 'bishop'; });
      if (list.indexOf('queen') < 0) list.push('queen');
    }
    if (list.indexOf('queen') >= 0) list = list.filter(function (p) { return p !== 'rukh' && p !== 'bishop'; });
    // The khon and the gin are one move; keep the first.
    if (list.indexOf('khon') >= 0) list = list.filter(function (p) { return p !== 'gin'; });
    return parts(list.join('+')).join('+');
  }

  function isValid(type) {
    var p = String(type).split('+');
    return p.length > 0 && p.every(function (x) { return !!BASE[x]; });
  }

  /** Every move of a type as a flat list of { k, dx, dy, m }, mirrored for the rival (side 2). */
  function moveList(type, side) {
    var out = [];
    var flip = side === 2 ? -1 : 1;
    var seen = {};
    parts(type).forEach(function (p) {
      BASE[p].moves.forEach(function (mv) {
        mv.d.forEach(function (d) {
          var key = mv.k + ':' + d[0] + ':' + d[1] * flip;
          if (seen[key]) {
            // Same geometry from two parts: the union of the modes.
            var prev = seen[key];
            if (prev.m !== mv.m) prev.m = 'both';
            return;
          }
          var entry = { k: mv.k, dx: d[0], dy: d[1] * flip, m: mv.m };
          seen[key] = entry;
          out.push(entry);
        });
      });
    });
    return out;
  }

  /** The AI's value of a type: compounds are worth a little less than the sum of their parts. */
  function value(type) {
    var list = parts(type);
    if (list.indexOf('shah') >= 0) return KING_VALUE;
    var sum = 0;
    list.forEach(function (p) { sum += BASE[p].value; });
    return list.length > 1 ? Math.round(sum * 0.9) : sum;
  }

  function isRoyal(type) { return parts(type).indexOf('shah') >= 0; }
  function promotes(type) { var p = parts(type); return p.length === 1 && !!BASE[p[0]].promotes; }

  /** The museum id of a type: a base id, a named compound id, or null for an unnamed compound. */
  function namedId(type) {
    var list = parts(type);
    if (list.length === 1) return list[0];
    var named = NAMED[list.join('+')];
    return named ? named.id : null;
  }

  var api = {
    BASE: BASE, ORDER: ORDER, NAMED: NAMED, KING_VALUE: KING_VALUE, byCode: byCode,
    parts: parts, fuse: fuse, isValid: isValid, moveList: moveList, value: value, isRoyal: isRoyal,
    promotes: promotes, namedId: namedId
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).pieces = api;
})(this);
