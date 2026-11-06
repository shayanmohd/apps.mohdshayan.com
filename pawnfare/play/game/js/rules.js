/*
 * The rules of a Pawnfare board, with no drawing and no browser APIs, so node --test checks every one.
 *
 * A board is W by H (5 or 6). Squares are numbered sq = y * W + x, row 0 at the top. Side 1 is the player
 * (bottom, forward is up), side 2 the rival (top, forward is down). The player wins by capturing the rival
 * king (shah); there is no check and the player has no king. A piece that promotes (the baidaq) becomes
 * the board's promotion type on reaching the far row, for either side.
 *
 * Integer only: positions, moves (from * 64 + to), hashes and values are all integers.
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var pieces = node ? require('./pieces.js') : root.Pawnfare.pieces;
  var rng = node ? require('./rng.js') : root.Pawnfare.rng;

  var PLAYER = 1;
  var RIVAL = 2;
  var MAX_KINDS = 32;
  var MAX_SQ = 64;

  // Zobrist keys for (owner, kind, square), from a fixed integer stream.
  var Z1 = new Int32Array(3 * MAX_KINDS * MAX_SQ);
  var Z2 = new Int32Array(3 * MAX_KINDS * MAX_SQ);
  (function () {
    var r = rng.create(0x5eed1234);
    for (var i = 0; i < Z1.length; i++) { Z1[i] = r.next() | 0; Z2[i] = r.next() | 0; }
  })();

  var tableCache = {};

  /** Movement tables of one type for one side on a W by H board: per square, its targets by kind. */
  function tablesFor(type, side, W, H) {
    var key = type + '|' + side + '|' + W + 'x' + H;
    if (tableCache[key]) return tableCache[key];
    var list = pieces.moveList(type, side);
    var out = [];
    for (var sq = 0; sq < W * H; sq++) {
      var x = sq % W;
      var y = (sq / W) | 0;
      var t = { lb: [], lm: [], lc: [], rb: [], rm: [], rc: [], hp: [] };
      for (var i = 0; i < list.length; i++) {
        var mv = list[i];
        if (mv.k === 'leap') {
          var nx = x + mv.dx;
          var ny = y + mv.dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          var to = ny * W + nx;
          (mv.m === 'both' ? t.lb : mv.m === 'move' ? t.lm : t.lc).push(to);
        } else {
          var ray = [];
          var rx = x + mv.dx;
          var ry = y + mv.dy;
          while (rx >= 0 && ry >= 0 && rx < W && ry < H) {
            ray.push(ry * W + rx);
            rx += mv.dx;
            ry += mv.dy;
          }
          if (!ray.length) continue;
          if (mv.k === 'hop') t.hp.push(ray);
          else (mv.m === 'both' ? t.rb : mv.m === 'move' ? t.rm : t.rc).push(ray);
        }
      }
      out.push(t);
    }
    tableCache[key] = out;
    return out;
  }

  /**
   * A position from a board definition: { W, H, pieces: [[side, type, sq], ...], promo, seed }.
   * promo is the type a baidaq becomes on the far row ('ferz' or 'queen'); seed feeds the AI tie-breaks.
   */
  function createPosition(def) {
    var W = def.W | 0;
    var H = def.H | 0;
    var N = W * H;
    var pos = {
      W: W, H: H, N: N,
      owner: new Int8Array(N),
      kind: new Int8Array(N),
      types: [], values: [], royal: [], promotes: [], tables: [],
      promoKind: -1,
      kingSq: -1,
      mat: 0,
      counts: [0, 0, 0],
      z1: 0, z2: 0,
      stack: [],
      seed: def.seed >>> 0,
      promo: def.promo || 'ferz'
    };
    var list = def.pieces || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var side = p[0];
      var sq = p[2];
      if (sq < 0 || sq >= N || pos.owner[sq]) throw new Error('bad square ' + sq);
      var k = kindIndex(pos, p[1]);
      pos.owner[sq] = side;
      pos.kind[sq] = k;
      pos.counts[side]++;
      if (pos.royal[k] && side === RIVAL) pos.kingSq = sq;
      if (!pos.royal[k]) pos.mat += side === RIVAL ? pos.values[k] : -pos.values[k];
      pos.z1 ^= Z1[(side * MAX_KINDS + k) * MAX_SQ + sq];
      pos.z2 ^= Z2[(side * MAX_KINDS + k) * MAX_SQ + sq];
    }
    pos.promoKind = kindIndex(pos, pos.promo);
    return pos;
  }

  /** The index of a type in this position's registry, adding it (with its tables) when new. */
  function kindIndex(pos, type) {
    var i = pos.types.indexOf(type);
    if (i >= 0) return i;
    if (!pieces.isValid(type)) throw new Error('unknown piece ' + type);
    i = pos.types.length;
    if (i >= MAX_KINDS) throw new Error('too many piece kinds');
    pos.types.push(type);
    pos.values.push(pieces.value(type));
    pos.royal.push(pieces.isRoyal(type));
    pos.promotes.push(pieces.promotes(type));
    pos.tables[i * 3 + PLAYER] = tablesFor(type, PLAYER, pos.W, pos.H);
    pos.tables[i * 3 + RIVAL] = tablesFor(type, RIVAL, pos.W, pos.H);
    return i;
  }

  /** Pushes every move of the piece on sq onto out (from * 64 + to). */
  function movesFrom(pos, sq, out) {
    var owner = pos.owner;
    var side = owner[sq];
    if (!side) return out;
    var enemy = 3 - side;
    var t = pos.tables[pos.kind[sq] * 3 + side][sq];
    var base = sq * 64;
    var i, j, to, ray;
    for (i = 0; i < t.lb.length; i++) { to = t.lb[i]; if (owner[to] !== side) out.push(base + to); }
    for (i = 0; i < t.lm.length; i++) { to = t.lm[i]; if (!owner[to]) out.push(base + to); }
    for (i = 0; i < t.lc.length; i++) { to = t.lc[i]; if (owner[to] === enemy) out.push(base + to); }
    for (i = 0; i < t.rb.length; i++) {
      ray = t.rb[i];
      for (j = 0; j < ray.length; j++) {
        to = ray[j];
        if (!owner[to]) { out.push(base + to); continue; }
        if (owner[to] === enemy) out.push(base + to);
        break;
      }
    }
    for (i = 0; i < t.rm.length; i++) {
      ray = t.rm[i];
      for (j = 0; j < ray.length; j++) {
        to = ray[j];
        if (owner[to]) break;
        out.push(base + to);
      }
    }
    for (i = 0; i < t.rc.length; i++) {
      ray = t.rc[i];
      for (j = 0; j < ray.length; j++) {
        to = ray[j];
        if (!owner[to]) continue;
        if (owner[to] === enemy) out.push(base + to);
        break;
      }
    }
    for (i = 0; i < t.hp.length; i++) {
      ray = t.hp[i];
      var screened = false;
      for (j = 0; j < ray.length; j++) {
        to = ray[j];
        if (!owner[to]) continue;
        if (!screened) { screened = true; continue; }
        if (owner[to] === enemy) out.push(base + to);
        break;
      }
    }
    return out;
  }

  /** Every move of a side. */
  function moves(pos, side) {
    var out = [];
    for (var sq = 0; sq < pos.N; sq++) if (pos.owner[sq] === side) movesFrom(pos, sq, out);
    return out;
  }

  /**
   * The best capture value a side has right now (KING_VALUE when the king can be taken), without
   * building a move list. Used by the AI's second ply and by the solver's king check.
   */
  function bestCapture(pos, side) {
    var owner = pos.owner;
    var enemy = 3 - side;
    var best = 0;
    var KV = pieces.KING_VALUE;
    for (var sq = 0; sq < pos.N; sq++) {
      if (owner[sq] !== side) continue;
      var t = pos.tables[pos.kind[sq] * 3 + side][sq];
      var i, j, to, ray, v;
      for (i = 0; i < t.lb.length; i++) {
        to = t.lb[i];
        if (owner[to] === enemy) { v = pos.values[pos.kind[to]]; if (v > best) { best = v; if (v >= KV) return v; } }
      }
      for (i = 0; i < t.lc.length; i++) {
        to = t.lc[i];
        if (owner[to] === enemy) { v = pos.values[pos.kind[to]]; if (v > best) { best = v; if (v >= KV) return v; } }
      }
      for (i = 0; i < t.rb.length; i++) {
        ray = t.rb[i];
        for (j = 0; j < ray.length; j++) {
          to = ray[j];
          if (!owner[to]) continue;
          if (owner[to] === enemy) { v = pos.values[pos.kind[to]]; if (v > best) { best = v; if (v >= KV) return v; } }
          break;
        }
      }
      for (i = 0; i < t.rc.length; i++) {
        ray = t.rc[i];
        for (j = 0; j < ray.length; j++) {
          to = ray[j];
          if (!owner[to]) continue;
          if (owner[to] === enemy) { v = pos.values[pos.kind[to]]; if (v > best) { best = v; if (v >= KV) return v; } }
          break;
        }
      }
      for (i = 0; i < t.hp.length; i++) {
        ray = t.hp[i];
        var screened = false;
        for (j = 0; j < ray.length; j++) {
          to = ray[j];
          if (!owner[to]) continue;
          if (!screened) { screened = true; continue; }
          if (owner[to] === enemy) { v = pos.values[pos.kind[to]]; if (v > best) { best = v; if (v >= KV) return v; } }
          break;
        }
      }
    }
    return best;
  }

  /** The player's move that captures the rival king now, or -1. */
  function kingCapture(pos) {
    var k = pos.kingSq;
    if (k < 0) return -1;
    var list = [];
    for (var sq = 0; sq < pos.N; sq++) {
      if (pos.owner[sq] !== PLAYER) continue;
      list.length = 0;
      movesFrom(pos, sq, list);
      for (var i = 0; i < list.length; i++) if ((list[i] & 63) === k) return list[i];
    }
    return -1;
  }

  function lastRow(pos, side, sq) {
    var y = (sq / pos.W) | 0;
    return side === PLAYER ? y === 0 : y === pos.H - 1;
  }

  function zkey(side, k, sq) { return (side * MAX_KINDS + k) * MAX_SQ + sq; }

  /** Makes a move; undoMove takes it back. Returns the captured kind index + 1 (0 for none). */
  function doMove(pos, mv) {
    var from = mv >> 6;
    var to = mv & 63;
    var owner = pos.owner;
    var kind = pos.kind;
    var side = owner[from];
    var k = kind[from];
    var capO = owner[to];
    var capK = kind[to];
    pos.stack.push(from, to, capO, capK, k, pos.kingSq, pos.mat);
    var zi = zkey(side, k, from);
    pos.z1 ^= Z1[zi]; pos.z2 ^= Z2[zi];
    if (capO) {
      zi = zkey(capO, capK, to);
      pos.z1 ^= Z1[zi]; pos.z2 ^= Z2[zi];
      pos.counts[capO]--;
      if (pos.royal[capK]) {
        if (capO === RIVAL) pos.kingSq = -1;
      } else {
        pos.mat += capO === RIVAL ? -pos.values[capK] : pos.values[capK];
      }
    }
    var nk = k;
    if (pos.promotes[k] && lastRow(pos, side, to)) {
      nk = pos.promoKind;
      var gain = pos.values[nk] - pos.values[k];
      pos.mat += side === RIVAL ? gain : -gain;
    }
    owner[to] = side;
    kind[to] = nk;
    owner[from] = 0;
    kind[from] = 0;
    zi = zkey(side, nk, to);
    pos.z1 ^= Z1[zi]; pos.z2 ^= Z2[zi];
    if (pos.royal[k] && side === RIVAL) pos.kingSq = to;
    return capO ? capK + 1 : 0;
  }

  function undoMove(pos) {
    var s = pos.stack;
    var mat = s.pop();
    var kingSq = s.pop();
    var k = s.pop();
    var capK = s.pop();
    var capO = s.pop();
    var to = s.pop();
    var from = s.pop();
    var owner = pos.owner;
    var kind = pos.kind;
    var side = owner[to];
    var nk = kind[to];
    var zi = zkey(side, nk, to);
    pos.z1 ^= Z1[zi]; pos.z2 ^= Z2[zi];
    owner[from] = side;
    kind[from] = k;
    zi = zkey(side, k, from);
    pos.z1 ^= Z1[zi]; pos.z2 ^= Z2[zi];
    owner[to] = capO;
    kind[to] = capO ? capK : 0;
    if (capO) {
      zi = zkey(capO, capK, to);
      pos.z1 ^= Z1[zi]; pos.z2 ^= Z2[zi];
      pos.counts[capO]++;
    }
    pos.kingSq = kingSq;
    pos.mat = mat;
  }

  /** A 53-bit key of the position for Maps (two 32-bit Zobrist hashes). */
  function key(pos) {
    return (pos.z1 >>> 0) * 2097152 + (pos.z2 >>> 11);
  }

  /** The pieces as [[side, type, sq], ...] in square order: the shape saves and boards use. */
  function snapshot(pos) {
    var out = [];
    for (var sq = 0; sq < pos.N; sq++) {
      if (pos.owner[sq]) out.push([pos.owner[sq], pos.types[pos.kind[sq]], sq]);
    }
    return out;
  }

  function pieceAt(pos, sq) {
    return pos.owner[sq] ? { side: pos.owner[sq], type: pos.types[pos.kind[sq]] } : null;
  }

  /** Squares a side could capture on if an enemy stood there (for the danger notches). */
  function attackedBy(pos, side) {
    var set = new Uint8Array(pos.N);
    var enemy = 3 - side;
    var owner = pos.owner;
    for (var sq = 0; sq < pos.N; sq++) {
      if (owner[sq] !== side) continue;
      var t = pos.tables[pos.kind[sq] * 3 + side][sq];
      var i, j, to, ray;
      for (i = 0; i < t.lb.length; i++) set[t.lb[i]] = 1;
      for (i = 0; i < t.lc.length; i++) set[t.lc[i]] = 1;
      var rides = t.rb.concat(t.rc);
      for (i = 0; i < rides.length; i++) {
        ray = rides[i];
        for (j = 0; j < ray.length; j++) {
          to = ray[j];
          set[to] = 1;
          if (owner[to]) break;
        }
      }
      for (i = 0; i < t.hp.length; i++) {
        ray = t.hp[i];
        var screened = false;
        for (j = 0; j < ray.length; j++) {
          to = ray[j];
          if (screened) set[to] = 1;
          if (!owner[to]) continue;
          if (!screened) { screened = true; continue; }
          break;
        }
      }
    }
    for (var s2 = 0; s2 < pos.N; s2++) if (owner[s2] === side) set[s2] = 0;
    void enemy;
    return set;
  }

  /** True when the player's move from-to would leave that piece capturable by the rival's reply. */
  function hangs(pos, mv) {
    doMove(pos, mv);
    var to = mv & 63;
    var list = moves(pos, RIVAL);
    var hit = false;
    for (var i = 0; i < list.length; i++) if ((list[i] & 63) === to) { hit = true; break; }
    undoMove(pos);
    return hit;
  }

  var api = {
    PLAYER: PLAYER, RIVAL: RIVAL,
    createPosition: createPosition, kindIndex: kindIndex, movesFrom: movesFrom, moves: moves,
    bestCapture: bestCapture, kingCapture: kingCapture, doMove: doMove, undoMove: undoMove, key: key,
    snapshot: snapshot, pieceAt: pieceAt, attackedBy: attackedBy, hangs: hangs, tablesFor: tablesFor
  };
  if (node) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).rules = api;
})(this);
