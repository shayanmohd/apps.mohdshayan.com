/*
 * Islands at runtime: the daily number from the local date, table entries decoded into islands, the
 * hand-made tutorial, and the Atlas (pages of three islands; past the table, turned and mirrored copies).
 *
 * Table entry: "<cells>|<spring>|<ruin>|<tiles>|<par>|<gold>"
 *   cells   two digits per cell, q + 4 then r + 4
 *   spring  base-36 cell index, or - for none (ruin the same)
 *   tiles   three base-36 characters per tile code, in deal order
 */
(function (root) {
  'use strict';
  var FC = root.FC || (root.FC = {});
  var hex = FC.hex || (typeof require === 'function' ? require('./hex.js') : null);
  var rules = FC.rules || (typeof require === 'function' ? require('./rules.js') : null);

  var DAY_ONE = Date.UTC(2026, 10, 1); // 2026-11-01 is day 1
  var PAGE_SIZE = 3;

  /** The daily number for a local date (a Date, default now). Before day 1 it is day 1. */
  function dayNumber(date) {
    var d = date || new Date();
    var n = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - DAY_ONE) / 86400000) + 1;
    return n < 1 ? 1 : n;
  }

  /** The local calendar date of day n, as { y, m (1 to 12), d }. */
  function dateOfDay(n) {
    var t = new Date(DAY_ONE + (n - 1) * 86400000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  function encode(island, par, gold) {
    var cells = '';
    for (var i = 0; i < island.cells.length; i++) cells += String(island.cells[i][0] + 4) + String(island.cells[i][1] + 4);
    var tiles = '';
    for (var k = 0; k < island.tiles.length; k++) {
      var s = island.tiles[k].toString(36);
      while (s.length < 3) s = '0' + s;
      tiles += s;
    }
    var idx = function (x) { return x == null || x < 0 ? '-' : x.toString(36); };
    return [cells, idx(island.spring), idx(island.ruin), tiles, par, gold].join('|');
  }

  /** An island from a table entry, or null when the entry is broken. */
  function decode(entry) {
    if (typeof entry !== 'string') return null;
    var p = entry.split('|');
    if (p.length !== 6 || p[0].length % 2 || p[3].length % 3) return null;
    var cells = [];
    for (var i = 0; i < p[0].length; i += 2) cells.push([+p[0].charAt(i) - 4, +p[0].charAt(i + 1) - 4]);
    var tiles = [];
    for (var k = 0; k < p[3].length; k += 3) tiles.push(parseInt(p[3].substr(k, 3), 36));
    var idx = function (s) { return s === '-' ? -1 : parseInt(s, 36); };
    var island = { cells: cells, spring: idx(p[1]), ruin: idx(p[2]), tiles: tiles, par: +p[4], gold: +p[5] };
    if (island.tiles.length !== island.cells.length) return null;
    return island;
  }

  // ---- the tutorial: Atlas island 1 ----
  // Cells: 0 NW (0,-1), 1 NE (1,-1), 2 W (-1,0), 3 centre, 4 E (1,0), 5 SW (-1,1), 6 SE (0,1).
  // Tile 1 goes to the centre as dealt; tile 2 must be turned twice to fit the east cell; tile 3 fits the
  // north-east cell as dealt and closes a three-tile forest (a watchtower).
  var TUTORIAL = {
    cells: [[0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1]],
    spring: -1,
    ruin: -1,
    tiles: ['fmmmmf', 'mffccc', 'cffmcc', 'mmcccm', 'cmmmcc', 'mcccmm', 'mmcccm'],
    steps: [{ cell: 3, turn: 0 }, { cell: 4, turn: 2 }, { cell: 1, turn: 0 }]
  };

  function tutorialIsland() {
    var tiles = TUTORIAL.tiles.map(function (s) { return rules.parse(s); });
    return { cells: TUTORIAL.cells.map(function (c) { return c.slice(); }), spring: -1, ruin: -1, tiles: tiles };
  }

  // ---- whole-island transforms (they keep par and gold exact) ----

  /** Turn an island n * 60 degrees and mirror it first when [mirror]. */
  function transform(island, n, mirror) {
    var cells = island.cells.map(function (c) {
      var x = mirror ? hex.mirrorCell(c) : c;
      return hex.rotateCell(x, n);
    });
    var tiles = island.tiles.map(function (t) { return mirror ? rules.mirrorCode(t) : t; });
    var out = { cells: cells, spring: island.spring, ruin: island.ruin, tiles: tiles, par: island.par, gold: island.gold };
    return out;
  }

  /** The transforms of an island that still fit a portrait screen (5 columns, 7 rows), identity first. */
  function fittingTransforms(island) {
    var out = [];
    for (var m = 0; m < 2; m++) {
      for (var n = 0; n < 6; n++) {
        var b = hex.bounds(transform(island, n, m === 1).cells);
        if (b.cols <= 5 && b.rows <= 7) out.push({ n: n, mirror: m === 1 });
      }
    }
    return out;
  }

  function table(name) {
    var t = FC[name];
    if (!t && typeof require === 'function') {
      try { t = require(name === 'DAILY_TABLE' ? './daily-table.js' : './atlas-table.js'); } catch (e) { t = null; }
    }
    return t;
  }

  /** The daily island for day n (wraps past the table), or null without a table. */
  function daily(n) {
    var t = table('DAILY_TABLE');
    if (!t || !t.days || !t.days.length) return null;
    var k = ((n - 1) % t.days.length + t.days.length) % t.days.length;
    var island = decode(t.days[k]);
    if (!island) return null;
    island.id = 'd' + n;
    island.kind = 'daily';
    island.day = n;
    return island;
  }

  function atlasCount() {
    var t = table('ATLAS_TABLE');
    return t && t.islands ? t.islands.length : 0;
  }

  /** Atlas island n (from 1). Past the table: turned or mirrored copies of islands 2 to the end. */
  function atlas(n) {
    var t = table('ATLAS_TABLE');
    if (!t || !t.islands || n < 1) return null;
    var count = t.islands.length;
    var island;
    if (n <= count) {
      island = decode(t.islands[n - 1]);
      if (!island) return null;
      if (n === 1) {
        var tut = tutorialIsland();
        tut.par = island.par;
        tut.gold = island.gold;
        island = tut;
        island.tutorial = true;
      }
    } else {
      var span = count - 1;
      var k = n - count - 1;
      var base = decode(t.islands[1 + (k % span)]);
      if (!base) return null;
      var variants = fittingTransforms(base).slice(1);
      if (!variants.length) variants = [{ n: 0, mirror: false }];
      var v = variants[Math.floor(k / span) % variants.length];
      island = transform(base, v.n, v.mirror);
    }
    island.id = 'a' + n;
    island.kind = 'atlas';
    island.atlas = n;
    island.page = pageOf(n);
    return island;
  }

  function pageOf(n) { return Math.floor((n - 1) / PAGE_SIZE) + 1; }
  function firstOfPage(p) { return (p - 1) * PAGE_SIZE + 1; }

  var api = {
    DAY_ONE: DAY_ONE, PAGE_SIZE: PAGE_SIZE, TUTORIAL: TUTORIAL, dayNumber: dayNumber, dateOfDay: dateOfDay,
    encode: encode, decode: decode, tutorialIsland: tutorialIsland, transform: transform,
    fittingTransforms: fittingTransforms, daily: daily, atlas: atlas, atlasCount: atlasCount, pageOf: pageOf,
    firstOfPage: firstOfPage
  };
  FC.islands = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
