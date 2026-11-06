/*
 * The save: one versioned object. sanitize() turns anything (a missing, corrupt, older or hand-edited
 * save) into a valid progress object, so loading can never crash the game.
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var pieces = node ? require('./pieces.js') : root.Pawnfare.pieces;
  var eras = node ? require('./eras.js') : root.Pawnfare.eras;

  var VERSION = 1;

  function fresh() {
    return {
      settings: { sound: true, haptics: true, motion: 'auto' },
      stats: { boardsFinished: 0, boardsWon: 0, runs: 0, eraWins: { shatranj: 0, madqueen: 0 }, bestRun: { shatranj: 0, madqueen: 0 } },
      unlocked: [],
      eras: { madqueen: false },
      mastery: { shatranj: [false, false, false], madqueen: [false, false, false] },
      seen: [],
      tutorialDone: false,
      draftHintDone: false,
      removeAdsOffered: false,
      ads: { winsSinceAd: 0 },
      run: null,
      daily: null,
      archivePlay: null,
      dailyLog: {},
      streak: { count: 0, lastDay: 0 },
      archive: { date: '', used: 0 }
    };
  }

  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
  function int(v, min, max) {
    var n = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 0;
    if (n < min) n = min;
    if (max != null && n > max) n = max;
    return n;
  }
  function bool(v) { return v === true; }
  function typeList(v, max) {
    if (!Array.isArray(v)) return null;
    var out = v.filter(function (t) { return typeof t === 'string' && pieces.isValid(t) && !pieces.isRoyal(t); });
    return out.slice(0, max || 12);
  }

  function board(v) {
    var b = obj(v);
    if (!b) return null;
    var W = int(b.W, 0, 6);
    if (W < 5) return null;
    if (!Array.isArray(b.pieces)) return null;
    var seen = {};
    var list = [];
    for (var i = 0; i < b.pieces.length; i++) {
      var p = b.pieces[i];
      if (!Array.isArray(p) || (p[0] !== 1 && p[0] !== 2) || typeof p[1] !== 'string' || !pieces.isValid(p[1])) return null;
      var sq = int(p[2], 0, W * W - 1);
      if (seen[sq]) return null;
      seen[sq] = true;
      list.push([p[0], p[1], sq]);
    }
    var kings = list.filter(function (p) { return p[0] === 2 && pieces.isRoyal(p[1]); }).length;
    if (kings !== 1) return null;
    return {
      W: W, H: W, pieces: list, promo: b.promo === 'queen' ? 'queen' : 'ferz', seed: int(b.seed, 0) >>> 0,
      par: int(b.par, 1, 9), limit: int(b.limit, 1, 12),
      line: Array.isArray(b.line) ? b.line.map(function (m) { return int(m, 0, 4095); }) : []
    };
  }

  function moveList(v) {
    return Array.isArray(v) ? v.map(function (m) { return int(m, -1, 4095); }) : [];
  }

  function runState(v) {
    var r = obj(v);
    if (!r || !eras.ERAS[r.era]) return null;
    var army = typeList(r.army, eras.ARMY_MAX);
    if (!army) return null;
    var flags = obj(r.flags) || {};
    var out = {
      era: r.era, seed: int(r.seed, 0) >>> 0, index: int(r.index, 0, 7), army: army,
      wins: int(r.wins, 0, 8), lostPieces: int(r.lostPieces, 0), allAtPar: r.allAtPar !== false,
      results: Array.isArray(r.results) ? r.results.filter(obj).slice(0, 8) : [],
      flags: { secondWind: bool(flags.secondWind), fourth: bool(flags.fourth), takeBacks: int(flags.takeBacks, 0, 3) },
      drafted: typeList(r.drafted, 16) || [],
      board: board(r.board),
      moves: moveList(r.moves),
      boardTookBack: bool(r.boardTookBack),
      rewardedOnBoard: bool(r.rewardedOnBoard),
      phase: ['board', 'draft', 'lost'].indexOf(r.phase) >= 0 ? r.phase : 'board',
      draftOptions: draftOptions(r.draftOptions),
      fallen: typeList(r.fallen, 40) || [],
      newUnlocks: (typeList(r.newUnlocks, 10) || []).filter(function (t) { return t.indexOf('+') < 0; }),
      eraUnlocked: bool(r.eraUnlocked)
    };
    // A run between boards (board not built yet) is kept: the app builds the board again.
    if (out.phase === 'draft' && !out.draftOptions) out.phase = 'board';
    if (out.phase === 'lost' && !out.board) out.phase = 'board';
    if (!out.army.length) return null;
    return out;
  }

  function draftOptions(v) {
    if (!Array.isArray(v) || !v.length) return null;
    var out = [];
    for (var i = 0; i < v.length && i < 4; i++) {
      var o = obj(v[i]);
      if (!o) return null;
      var ok = (o.kind === 'piece' && pieces.isValid(o.type)) ||
        (o.kind === 'promote' && pieces.isValid(o.from) && pieces.isValid(o.to)) ||
        (o.kind === 'fuse' && pieces.isValid(o.a) && pieces.isValid(o.b) && pieces.isValid(o.result));
      if (!ok) return null;
      out.push(o.kind === 'piece' ? { kind: 'piece', type: o.type } : o.kind === 'promote' ? { kind: 'promote', from: o.from, to: o.to } :
        { kind: 'fuse', a: o.a, b: o.b, result: o.result, weight: int(o.weight, 0, 9) });
    }
    return out;
  }

  /** A Daily's per board results, clamped (they size the result rows and the share card). */
  function boardResults(v) {
    return Array.isArray(v) ? v.filter(obj).slice(0, 5).map(function (x) {
      return { won: bool(x.won), moves: int(x.moves, 0, 20), par: int(x.par, 0, 9), survivors: int(x.survivors, 0, 9), army: int(x.army, 0, 9) };
    }) : [];
  }

  function dailyState(v) {
    var d = obj(v);
    if (!d) return null;
    var day = int(d.day, 1);
    var results = boardResults(d.results);
    // The board index is the number of boards played, so it can never point past board 5.
    return {
      day: day, archive: bool(d.archive), index: results.length, results: results,
      moves: moveList(d.moves), done: bool(d.done) || results.length >= 5
    };
  }

  /** Any input to a valid progress object. */
  function sanitize(input) {
    var base = fresh();
    var p = obj(input);
    if (!p) return base;
    var s = obj(p.settings) || {};
    base.settings.sound = s.sound !== false;
    base.settings.haptics = s.haptics !== false;
    base.settings.motion = s.motion === 'reduced' ? 'reduced' : 'auto';
    var st = obj(p.stats) || {};
    base.stats.boardsFinished = int(st.boardsFinished, 0);
    base.stats.boardsWon = int(st.boardsWon, 0);
    base.stats.runs = int(st.runs, 0);
    ['shatranj', 'madqueen'].forEach(function (e) {
      base.stats.eraWins[e] = int((obj(st.eraWins) || {})[e], 0);
      base.stats.bestRun[e] = int((obj(st.bestRun) || {})[e], 0, 8);
      var m = (obj(p.mastery) || {})[e];
      base.mastery[e] = [0, 1, 2].map(function (i) { return Array.isArray(m) && m[i] === true; });
    });
    base.unlocked = (typeList(p.unlocked, 20) || []).filter(function (t) { return t.indexOf('+') < 0; });
    base.eras.madqueen = bool((obj(p.eras) || {}).madqueen);
    base.seen = Array.isArray(p.seen) ? p.seen.filter(function (x) { return typeof x === 'string' && x.length < 40; }).slice(0, 64) : [];
    base.tutorialDone = bool(p.tutorialDone);
    base.draftHintDone = bool(p.draftHintDone);
    base.removeAdsOffered = bool(p.removeAdsOffered);
    base.ads.winsSinceAd = int((obj(p.ads) || {}).winsSinceAd, 0, 99);
    base.run = runState(p.run);
    base.daily = dailyState(p.daily);
    base.archivePlay = dailyState(p.archivePlay);
    if (base.daily && base.daily.archive) {
      // An archive day saved in the old shared slot moves to its own slot.
      if (!base.archivePlay) base.archivePlay = base.daily;
      base.daily = null;
    }
    if (base.archivePlay) base.archivePlay.archive = true;
    var log = obj(p.dailyLog) || {};
    Object.keys(log).slice(-400).forEach(function (k) {
      var e = obj(log[k]);
      if (!e || !/^\d+$/.test(k)) return;
      base.dailyLog[k] = { done: bool(e.done), archive: bool(e.archive), won: int(e.won, 0, 5), results: boardResults(e.results) };
    });
    var sk = obj(p.streak) || {};
    base.streak = { count: int(sk.count, 0), lastDay: int(sk.lastDay, 0) };
    var ar = obj(p.archive) || {};
    base.archive = { date: typeof ar.date === 'string' ? ar.date.slice(0, 10) : '', used: int(ar.used, 0, 3) };
    return base;
  }

  /** Shell.configureSave's migrate: every older version goes through sanitize. */
  function migrate(data) { return sanitize(data); }

  var api = { VERSION: VERSION, fresh: fresh, sanitize: sanitize, migrate: migrate };
  if (node) module.exports = api;
  else (root.Pawnfare = root.Pawnfare || {}).save = api;
})(this);
