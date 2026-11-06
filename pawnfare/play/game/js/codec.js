/*
 * A compact text form of a board, for the Daily table and the starter boards:
 *   W, par, limit (one character each), the AI seed (7 base-36 characters), the piece count (base 36),
 *   then per piece its type code (lower case for the player, upper case for the rival) and its square
 *   (base 36), then '.', then the planted line as pairs of squares (from, to).
 * Boards are square (H = W).
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var pieces = node ? require('./pieces.js') : root.Pawnfare.pieces;

  var B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

  function seed36(n) {
    var s = (n >>> 0).toString(36);
    while (s.length < 7) s = '0' + s;
    return s;
  }

  function encode(def) {
    var s = String(def.W) + def.par + def.limit + seed36(def.seed) + B36[def.pieces.length];
    def.pieces.forEach(function (p) {
      if (p[1].indexOf('+') >= 0) throw new Error('compounds are not stored in tables');
      var code = pieces.BASE[p[1]].code;
      s += (p[0] === 1 ? code : code.toUpperCase()) + B36[p[2]];
    });
    s += '.';
    (def.line || []).forEach(function (mv) { s += B36[mv >> 6] + B36[mv & 63]; });
    return s;
  }

  function decode(text, promo) {
    var W = +text[0];
    var def = { W: W, H: W, par: +text[1], limit: +text[2], seed: parseInt(text.slice(3, 10), 36) >>> 0, promo: promo, pieces: [], line: [] };
    var n = B36.indexOf(text[10]);
    var i = 11;
    for (var k = 0; k < n; k++) {
      var c = text[i];
      var side = c === c.toLowerCase() ? 1 : 2;
      def.pieces.push([side, pieces.byCode[c.toLowerCase()], B36.indexOf(text[i + 1])]);
      i += 2;
    }
    if (text[i] === '.') {
      for (i = i + 1; i + 1 < text.length; i += 2) def.line.push(B36.indexOf(text[i]) * 64 + B36.indexOf(text[i + 1]));
    }
    return def;
  }

  var api = { encode: encode, decode: decode };
  if (node) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).codec = api;
})(this);
