/*
 * Fogcarver's rules: tiles, the board and the score. The score is a function of the board alone, so
 * placing, undoing and replaying a saved island all give the same number.
 *
 * A tile is an integer code: six base-5 digits, digit k is the terrain of edge k in the tile's own
 * orientation. Turning a tile by t steps clockwise puts base edge k on direction (k + t) % 6.
 *
 *   seam      an edge meeting the same terrain on a neighbour              1 (double at the ruin)
 *   shore     a coast or river edge meeting the sea                        1 (double at the ruin)
 *   forest    a closed forest (every edge meets forest)                    2 per tile, +3 landmark at 3+ tiles
 *   village   a closed village                                             3 per tile, +3 landmark at 3+ tiles
 *   river     the river through the spring tile reaches the sea            2 per tile on it, +3 lighthouse
 */
(function (root) {
  'use strict';
  var FC = root.FC || (root.FC = {});
  var hex = FC.hex || (typeof require === 'function' ? require('./hex.js') : null);

  var M = 0, F = 1, V = 2, R = 3, C = 4;
  var TERRAINS = 5;
  var NAMES = ['meadow', 'forest', 'village', 'river', 'coast'];
  var LETTERS = 'mfvrc';
  var MAX_CODE = 15625; // 5^6

  var POINTS = {
    seam: 1,
    forestPerTile: 2,
    villagePerTile: 3,
    landmarkAt: 3,
    landmark: 3,
    riverPerTile: 2,
    lighthouse: 3
  };

  function edgesOf(code) {
    var e = [];
    for (var i = 0; i < 6; i++) {
      e.push(code % 5);
      code = Math.floor(code / 5);
    }
    return e;
  }

  function codeOf(edges) {
    var c = 0;
    for (var i = 5; i >= 0; i--) c = c * 5 + edges[i];
    return c;
  }

  /** 'mmffrc' style string to code and back (edge 0 first). */
  function parse(str) {
    var e = [];
    for (var i = 0; i < 6; i++) e.push(LETTERS.indexOf(str.charAt(i)));
    return codeOf(e);
  }
  function format(code) {
    var e = edgesOf(code);
    var s = '';
    for (var i = 0; i < 6; i++) s += LETTERS.charAt(e[i]);
    return s;
  }

  /** Terrain on direction d of a tile turned t steps clockwise. */
  function edgeAt(code, t, d) {
    var k = ((d - t) % 6 + 6) % 6;
    var c = code;
    for (var i = 0; i < k; i++) c = Math.floor(c / 5);
    return c % 5;
  }

  /** The distinct turns of a tile (a tile with symmetry has fewer than six). */
  function distinctTurns(code) {
    var seen = {};
    var out = [];
    for (var t = 0; t < 6; t++) {
      var s = '';
      for (var d = 0; d < 6; d++) s += edgeAt(code, t, d);
      if (!seen[s]) { seen[s] = true; out.push(t); }
    }
    return out;
  }

  /** A mirrored tile (left to right): edge k becomes edge (3 - k) mod 6. */
  function mirrorCode(code) {
    var e = edgesOf(code);
    var m = [];
    for (var k = 0; k < 6; k++) m.push(e[((3 - k) % 6 + 6) % 6]);
    return codeOf(m);
  }

  function riverCount(code) {
    var e = edgesOf(code), n = 0;
    for (var i = 0; i < 6; i++) if (e[i] === R) n++;
    return n;
  }

  // ---- the board ----

  /**
   * island: { cells: [[q, r]...], spring: index or -1, ruin: index or -1, tiles: [codes in deal order] }
   */
  function Board(island) {
    var n = island.cells.length;
    this.island = island;
    this.n = n;
    this.index = {};
    for (var i = 0; i < n; i++) this.index[hex.key(island.cells[i][0], island.cells[i][1])] = i;
    this.nb = new Int16Array(n * 6);
    for (var c = 0; c < n; c++) {
      for (var d = 0; d < 6; d++) {
        var q = island.cells[c][0] + hex.DIRS[d][0];
        var r = island.cells[c][1] + hex.DIRS[d][1];
        var j = this.index[hex.key(q, r)];
        this.nb[c * 6 + d] = j === undefined ? -1 : j;
      }
    }
    this.spring = island.spring == null ? -1 : island.spring;
    this.ruin = island.ruin == null ? -1 : island.ruin;
    this.code = new Int32Array(n).fill(-1);
    this.turn = new Int8Array(n);
    this.e = new Int8Array(n * 6).fill(-1);
    this.history = [];
    // scratch for score()
    this._uf = new Int16Array(n * 6);
    this._ok = new Uint8Array(n * 6);
    this._mark = new Int16Array(n * 6);
    this._cnt = new Int16Array(n * 6);
  }

  Board.prototype.isOpen = function (i) { return i >= 0 && i < this.n && this.code[i] < 0; };
  Board.prototype.placedCount = function () { return this.history.length; };
  Board.prototype.done = function () { return this.history.length >= Math.min(this.n, this.island.tiles.length); };
  Board.prototype.current = function () {
    return this.history.length < this.island.tiles.length ? this.island.tiles[this.history.length] : -1;
  };
  Board.prototype.upcoming = function (k) {
    var i = this.history.length + k;
    return i < this.island.tiles.length ? this.island.tiles[i] : -1;
  };
  Board.prototype.openCells = function () {
    var out = [];
    for (var i = 0; i < this.n; i++) if (this.code[i] < 0) out.push(i);
    return out;
  };

  Board.prototype.set = function (i, code, t) {
    this.code[i] = code;
    this.turn[i] = t;
    for (var d = 0; d < 6; d++) this.e[i * 6 + d] = edgeAt(code, t, d);
  };
  Board.prototype.clear = function (i) {
    this.code[i] = -1;
    this.turn[i] = 0;
    for (var d = 0; d < 6; d++) this.e[i * 6 + d] = -1;
  };

  /** Lay the current tile on open cell i turned t. Returns false when that is not a legal move. */
  Board.prototype.place = function (i, t) {
    var code = this.current();
    if (code < 0 || !this.isOpen(i)) return false;
    t = ((t | 0) % 6 + 6) % 6;
    this.set(i, code, t);
    this.history.push({ cell: i, turn: t });
    return true;
  };

  /** Take back the last tile. */
  Board.prototype.undo = function () {
    var last = this.history.pop();
    if (!last) return null;
    this.clear(last.cell);
    return last;
  };

  /** Score gained by laying the current tile on cell i turned t (the board is left unchanged). */
  Board.prototype.gainIf = function (i, t, before) {
    var base = before == null ? this.score().total : before;
    var code = this.current();
    if (code < 0 || !this.isOpen(i)) return 0;
    this.set(i, code, t);
    var after = this.total();
    this.clear(i);
    return after - base;
  };

  function find(uf, x) {
    while (uf[x] !== x) {
      uf[x] = uf[uf[x]];
      x = uf[x];
    }
    return x;
  }
  function union(uf, a, b) {
    a = find(uf, a); b = find(uf, b);
    if (a !== b) uf[b] = a;
  }

  /** The total only (fast path for searches). */
  Board.prototype.total = function () {
    return this.score(true).total;
  };

  /**
   * The full score. With [fast] only the numbers; otherwise also the matched and broken seams, the
   * closed regions and the river, for drawing.
   */
  Board.prototype.score = function (fast) {
    var n = this.n, e = this.e, nb = this.nb, code = this.code;
    var uf = this._uf, ok = this._ok, mark = this._mark, cnt = this._cnt;
    var ruin = this.ruin;
    var seams = 0, shores = 0;
    var matched = fast ? null : [];
    var broken = fast ? null : [];
    var shoreList = fast ? null : [];
    var i, d, s, t;
    for (s = 0; s < n * 6; s++) { uf[s] = s; ok[s] = 1; mark[s] = -1; cnt[s] = 0; }

    for (i = 0; i < n; i++) {
      if (code[i] < 0) continue;
      var firstR = -1;
      for (d = 0; d < 6; d++) {
        s = i * 6 + d;
        t = e[s];
        if (t === R) {
          if (firstR < 0) firstR = s; else union(uf, firstR, s);
        } else if (e[i * 6 + (d + 1) % 6] === t) {
          union(uf, s, i * 6 + (d + 1) % 6);
        }
      }
    }

    for (i = 0; i < n; i++) {
      if (code[i] < 0) continue;
      for (d = 0; d < 6; d++) {
        s = i * 6 + d;
        t = e[s];
        var j = nb[s];
        if (j < 0) {
          if (t === C || t === R) {
            shores += i === ruin ? 2 : 1;
            if (shoreList) shoreList.push(s);
          }
          ok[s] = 0;
          continue;
        }
        if (code[j] < 0) { ok[s] = 0; continue; }
        var o = j * 6 + (d + 3) % 6;
        if (e[o] === t) {
          if (j > i) {
            seams += (i === ruin || j === ruin) ? 2 : 1;
            union(uf, s, o);
            if (matched) matched.push(s);
          }
        } else {
          ok[s] = 0;
          if (broken && j > i) broken.push(s);
        }
      }
    }

    // regions: sealed when every member edge met the same terrain
    var regionOk = this._regionOk || (this._regionOk = new Uint8Array(n * 6));
    for (s = 0; s < n * 6; s++) regionOk[s] = 1;
    for (i = 0; i < n; i++) {
      if (code[i] < 0) continue;
      for (d = 0; d < 6; d++) {
        s = i * 6 + d;
        var rt = find(uf, s);
        if (!ok[s]) regionOk[rt] = 0;
        if (mark[rt] !== i) { mark[rt] = i; cnt[rt]++; }
      }
    }

    var closures = 0;
    var regions = fast ? null : [];
    var seenRoot = this._seen || (this._seen = new Uint8Array(n * 6));
    for (s = 0; s < n * 6; s++) seenRoot[s] = 0;
    for (i = 0; i < n; i++) {
      if (code[i] < 0) continue;
      for (d = 0; d < 6; d++) {
        s = i * 6 + d;
        t = e[s];
        if (t !== F && t !== V) continue;
        var root2 = find(uf, s);
        if (seenRoot[root2]) continue;
        seenRoot[root2] = 1;
        if (!regionOk[root2]) continue;
        var size = cnt[root2];
        var pts = size * (t === F ? POINTS.forestPerTile : POINTS.villagePerTile);
        var landmark = size >= POINTS.landmarkAt;
        if (landmark) pts += POINTS.landmark;
        closures += pts;
        if (regions) regions.push({ terrain: t, root: root2, size: size, points: pts, landmark: landmark, slots: null });
      }
    }

    var river = 0;
    var riverInfo = null;
    var sp = this.spring;
    if (sp >= 0 && code[sp] >= 0) {
      var rs = -1;
      for (d = 0; d < 6; d++) if (e[sp * 6 + d] === R) { rs = sp * 6 + d; break; }
      if (rs >= 0) {
        var rr = find(uf, rs);
        var mouth = -1;
        for (i = 0; i < n && mouth < 0; i++) {
          if (code[i] < 0) continue;
          for (d = 0; d < 6; d++) {
            s = i * 6 + d;
            if (e[s] === R && nb[s] < 0 && find(uf, s) === rr) { mouth = s; break; }
          }
        }
        if (mouth >= 0) {
          river = cnt[rr] * POINTS.riverPerTile + POINTS.lighthouse;
          if (!fast) riverInfo = { root: rr, mouth: mouth, size: cnt[rr], points: river };
        } else if (!fast) {
          riverInfo = { root: rr, mouth: -1, size: cnt[rr], points: 0 };
        }
      }
    }

    var out = { total: seams + shores + closures + river, seams: seams, shores: shores, closures: closures, river: river };
    if (!fast) {
      // member slots per region, for outlines and landmark anchors
      for (var k = 0; k < regions.length; k++) {
        var list = [];
        for (s = 0; s < n * 6; s++) if (e[s] >= 0 && find(uf, s) === regions[k].root) list.push(s);
        regions[k].slots = list;
      }
      if (riverInfo) {
        var rl = [];
        for (s = 0; s < n * 6; s++) if (e[s] === R && find(uf, s) === riverInfo.root) rl.push(s);
        riverInfo.slots = rl;
      }
      out.matched = matched;
      out.broken = broken;
      out.shoreSlots = shoreList;
      out.regions = regions;
      out.riverInfo = riverInfo;
    }
    return out;
  };

  /** A fresh board with the given placements replayed. Bad placements stop the replay (never throw). */
  function replay(island, placements) {
    var b = new Board(island);
    if (!placements || !placements.length) return b;
    for (var k = 0; k < placements.length; k++) {
      var p = placements[k];
      if (!p || typeof p.cell !== 'number' || typeof p.turn !== 'number') break;
      if (!b.place(p.cell | 0, p.turn | 0)) break;
    }
    return b;
  }

  var api = {
    M: M, F: F, V: V, R: R, C: C, TERRAINS: TERRAINS, NAMES: NAMES, LETTERS: LETTERS, MAX_CODE: MAX_CODE,
    POINTS: POINTS, edgesOf: edgesOf, codeOf: codeOf, parse: parse, format: format, edgeAt: edgeAt,
    distinctTurns: distinctTurns, mirrorCode: mirrorCode, riverCount: riverCount, Board: Board, replay: replay
  };
  FC.rules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
