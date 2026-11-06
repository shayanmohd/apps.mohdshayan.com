/*
 * The Expedition: an endless run of digs across four sites that grow from 6 by 6 to 7 by 7 with six-cell
 * shards, then add bedrock. Tries and par come from tools/solver.js (GAME-DESIGN.md section 3).
 */
(function (root) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var rules = node ? require('./rules.js') : root.Sherd.rules;
  var rng = node ? require('./rng.js') : root.Sherd.rng;

  var SITES = [
    { id: 1, first: 1, last: 8, W: 6, n: 5, bedrock: [0, 0], tries: 7, par: 4 },
    { id: 2, first: 9, last: 20, W: 7, n: 6, bedrock: [0, 0], tries: 8, par: 5 },
    { id: 3, first: 21, last: 34, W: 7, n: 6, bedrock: [4, 6], tries: 7, par: 5 },
    { id: 4, first: 35, last: Infinity, W: 7, n: 6, bedrock: [7, 9], tries: 6, par: 4 }
  ];

  // Dig 1 teaches: a fixed shard and a suggested first probe that returns all three marks.
  //   . . . . . .
  //   . . . # . .
  //   o o o # o .     o = the suggested probe: miss, miss, near, hit, near
  //   . . . # # #
  var TUTORIAL = { target: [9, 15, 21, 22, 23], probe: [12, 13, 14, 15, 16] };

  function siteFor(digNo) {
    for (var i = 0; i < SITES.length; i++) if (digNo <= SITES[i].last) return SITES[i];
    return SITES[SITES.length - 1];
  }

  /** Bedrock for one dig: small clusters, no 2 by 2 block, the open cells left in one piece. */
  function bedrockLayout(site, rnd) {
    var W = site.W;
    var want = site.bedrock[0] + rnd.int(site.bedrock[1] - site.bedrock[0] + 1);
    for (var attempt = 0; attempt < 60; attempt++) {
      var rock = {};
      var list = [];
      while (list.length < want) {
        var c;
        if (list.length && rnd() < 0.45) {
          var from = list[rnd.int(list.length)];
          var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          var d = dirs[rnd.int(4)];
          var x = from % W + d[0];
          var y = ((from / W) | 0) + d[1];
          if (x < 0 || y < 0 || x >= W || y >= W) continue;
          c = y * W + x;
        } else {
          c = rnd.int(W * W);
        }
        if (rock[c]) continue;
        rock[c] = true;
        list.push(c);
      }
      if (hasSquare(rock, W)) continue;
      var open = [];
      for (var i = 0; i < W * W; i++) if (!rock[i]) open.push(i);
      if (!rules.connected(open, W)) continue;
      return list.sort(function (a, b) { return a - b; });
    }
    return [];
  }

  function hasSquare(rock, W) {
    for (var y = 0; y < W - 1; y++) {
      for (var x = 0; x < W - 1; x++) {
        var i = y * W + x;
        if (rock[i] && rock[i + 1] && rock[i + W] && rock[i + W + 1]) return true;
      }
    }
    return false;
  }

  /** The dig for a dig number and attempt, drawn from the install's seed. */
  function makeDig(installSeed, digNo, attempt) {
    var site = siteFor(digNo);
    if (digNo === 1 && !attempt) {
      return { site: site, digNo: 1, attempt: 0, tutorial: true, par: site.par,
        dig: rules.createDig({ W: site.W, n: site.n, maxTries: site.tries, target: TUTORIAL.target, blocked: [] }) };
    }
    var rnd = rng.create(rng.seed(installSeed | 0, 'dig', digNo, attempt | 0));
    var blocked = site.bedrock[1] > 0 ? bedrockLayout(site, rnd) : [];
    var all = rules.placements(site.n, site.W, blocked);
    var target = all[rnd.int(all.length)];
    return { site: site, digNo: digNo, attempt: attempt | 0, tutorial: false, par: site.par,
      dig: rules.createDig({ W: site.W, n: site.n, maxTries: site.tries, target: target, blocked: blocked }) };
  }

  /** 3 stars at or under par, 2 at par + 1, 1 for a later win, 0 for a loss. */
  function stars(won, tries, par) {
    if (!won) return 0;
    if (tries <= par) return 3;
    if (tries === par + 1) return 2;
    return 1;
  }

  var api = { SITES: SITES, TUTORIAL: TUTORIAL, siteFor: siteFor, bedrockLayout: bedrockLayout, makeDig: makeDig, stars: stars };
  if (node) module.exports = api;
  else (root.Sherd = root.Sherd || {}).expedition = api;
})(this);
