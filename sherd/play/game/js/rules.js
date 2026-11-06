/*
 * The rules of a Sherd dig, with no drawing and no browser APIs, so node --test can check every one.
 *
 * A shard of n connected cells (any rotation or reflection) lies hidden in a W by W grid. Each try the
 * player paints n connected cells; every probed cell comes back as HIT (part of the shard), NEAR (not
 * part of it but touching it on a side) or MISS. Bedrock cells can never be probed and never hold the
 * shard. A try that covers the shard exactly wins.
 */
(function (root) {
  'use strict';

  var MISS = 0;
  var NEAR = 1;
  var HIT = 2;
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // ---- shapes and placements ----

  function normalise(cells) {
    var mx = Infinity;
    var my = Infinity;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i][0] < mx) mx = cells[i][0];
      if (cells[i][1] < my) my = cells[i][1];
    }
    var out = cells.map(function (c) { return [c[0] - mx, c[1] - my]; });
    out.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
    return out;
  }

  function shapeKey(cells) {
    return cells.map(function (c) { return c[0] + ',' + c[1]; }).join(';');
  }

  var shapeCache = {};

  /** Every fixed polyomino of n cells (rotations and reflections counted apart), in a stable order. */
  function fixedShapes(n) {
    if (shapeCache[n]) return shapeCache[n];
    var current = { '0,0': [[0, 0]] };
    for (var k = 1; k < n; k++) {
      var next = {};
      Object.keys(current).forEach(function (key) {
        var cells = current[key];
        var taken = {};
        cells.forEach(function (c) { taken[c[0] + ',' + c[1]] = true; });
        cells.forEach(function (c) {
          DIRS.forEach(function (d) {
            var x = c[0] + d[0];
            var y = c[1] + d[1];
            if (taken[x + ',' + y]) return;
            var grown = normalise(cells.concat([[x, y]]));
            next[shapeKey(grown)] = grown;
          });
        });
      });
      current = next;
    }
    shapeCache[n] = Object.keys(current).sort().map(function (key) { return current[key]; });
    return shapeCache[n];
  }

  var TRANSFORMS = [
    function (x, y) { return [x, y]; }, function (x, y) { return [-x, y]; },
    function (x, y) { return [x, -y]; }, function (x, y) { return [-x, -y]; },
    function (x, y) { return [y, x]; }, function (x, y) { return [-y, x]; },
    function (x, y) { return [y, -x]; }, function (x, y) { return [-y, -x]; }
  ];

  /** The free shape (rotations and reflections counted together) as a canonical key. */
  function freeKey(cellsXY) {
    var best = null;
    TRANSFORMS.forEach(function (t) {
      var key = shapeKey(normalise(cellsXY.map(function (c) { return t(c[0], c[1]); })));
      if (best === null || key < best) best = key;
    });
    return best;
  }

  var placementCache = {};

  /**
   * Every placement of an n-cell shard in a W by W grid that avoids the blocked cells. Each placement is
   * a sorted array of cell indices (y * W + x). The order is stable: the daily table depends on it.
   */
  function placements(n, W, blocked) {
    var key = n + ':' + W + ':' + (blocked ? blocked.join(',') : '');
    if (placementCache[key]) return placementCache[key];
    var isBlocked = blockedMask(W, blocked);
    var out = [];
    fixedShapes(n).forEach(function (shape) {
      var w = 0;
      var h = 0;
      shape.forEach(function (c) { if (c[0] + 1 > w) w = c[0] + 1; if (c[1] + 1 > h) h = c[1] + 1; });
      for (var oy = 0; oy <= W - h; oy++) {
        for (var ox = 0; ox <= W - w; ox++) {
          var cells = shape.map(function (c) { return (c[1] + oy) * W + c[0] + ox; });
          if (cells.some(function (i) { return isBlocked[i]; })) continue;
          cells.sort(numeric);
          out.push(cells);
        }
      }
    });
    if (!blocked || !blocked.length) placementCache[key] = out; // bedrock layouts change every dig
    return out;
  }

  function numeric(a, b) { return a - b; }

  function blockedMask(W, blocked) {
    var mask = new Uint8Array(W * W);
    (blocked || []).forEach(function (i) { if (i >= 0 && i < W * W) mask[i] = 1; });
    return mask;
  }

  // ---- marks ----

  /** What every cell would report if probed, for a shard on [cells]. */
  function statusMap(cells, W) {
    var s = new Uint8Array(W * W);
    cells.forEach(function (i) {
      var x = i % W;
      var y = (i / W) | 0;
      DIRS.forEach(function (d) {
        var nx = x + d[0];
        var ny = y + d[1];
        if (nx >= 0 && ny >= 0 && nx < W && ny < W) s[ny * W + nx] = NEAR;
      });
    });
    cells.forEach(function (i) { s[i] = HIT; });
    return s;
  }

  function marksFor(probe, status) {
    return probe.map(function (i) { return status[i]; });
  }

  function sameCells(a, b) {
    if (a.length !== b.length) return false;
    var x = a.slice().sort(numeric);
    var y = b.slice().sort(numeric);
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  // ---- geometry used by the probe input ----

  function adjacent(a, b, W) {
    var ax = a % W;
    var ay = (a / W) | 0;
    var bx = b % W;
    var by = (b / W) | 0;
    return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
  }

  function touches(cells, i, W) {
    for (var k = 0; k < cells.length; k++) if (adjacent(cells[k], i, W)) return true;
    return false;
  }

  function connected(cells, W) {
    if (cells.length === 0) return true;
    var inSet = {};
    cells.forEach(function (i) { inSet[i] = true; });
    var seen = {};
    var stack = [cells[0]];
    seen[cells[0]] = true;
    var count = 0;
    while (stack.length) {
      var c = stack.pop();
      count++;
      var x = c % W;
      var y = (c / W) | 0;
      for (var d = 0; d < 4; d++) {
        var nx = x + DIRS[d][0];
        var ny = y + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
        var j = ny * W + nx;
        if (inSet[j] && !seen[j]) { seen[j] = true; stack.push(j); }
      }
    }
    return count === cells.length;
  }

  /** Why cell i cannot join the probe, or '' when it can. */
  function addRefusal(selection, i, dig) {
    if (i < 0 || i >= dig.W * dig.W) return 'outside';
    if (dig.blockedMask[i]) return 'bedrock';
    if (selection.indexOf(i) >= 0) return 'taken';
    if (selection.length >= dig.n) return 'full';
    if (selection.length > 0 && !touches(selection, i, dig.W)) return 'apart';
    return '';
  }

  /** Whether removing cell i keeps the rest of the probe in one piece. */
  function canRemove(selection, i, W) {
    var k = selection.indexOf(i);
    if (k < 0) return false;
    var rest = selection.slice(0, k).concat(selection.slice(k + 1));
    return connected(rest, W);
  }

  // ---- a dig ----

  /**
   * opts: { W, n, maxTries, target: [cell indices], blocked: [cell indices] }.
   * The dig is plain JSON apart from blockedMask, which fromJSON rebuilds.
   */
  function createDig(opts) {
    var dig = {
      W: opts.W | 0,
      n: opts.n | 0,
      maxTries: opts.maxTries | 0,
      target: opts.target.slice().sort(numeric),
      blocked: (opts.blocked || []).slice().sort(numeric),
      tries: [],
      survey: null,
      won: false,
      done: false
    };
    attach(dig);
    return dig;
  }

  function attach(dig) {
    Object.defineProperty(dig, 'blockedMask', { value: blockedMask(dig.W, dig.blocked), enumerable: false, configurable: true });
    Object.defineProperty(dig, 'status', { value: statusMap(dig.target, dig.W), enumerable: false, configurable: true });
    return dig;
  }

  /** Checks a probe without playing it. Returns '' when it is a legal try. */
  function probeRefusal(dig, cells) {
    if (dig.done) return 'done';
    if (!Array.isArray(cells) || cells.length !== dig.n) return 'size';
    var seen = {};
    for (var k = 0; k < cells.length; k++) {
      var i = cells[k];
      if (typeof i !== 'number' || i !== (i | 0) || i < 0 || i >= dig.W * dig.W) return 'outside';
      if (seen[i]) return 'taken';
      if (dig.blockedMask[i]) return 'bedrock';
      seen[i] = true;
    }
    if (!connected(cells, dig.W)) return 'apart';
    return '';
  }

  /** Plays one try. Returns { ok, reason, marks, won, done }. */
  function play(dig, cells) {
    var why = probeRefusal(dig, cells);
    if (why) return { ok: false, reason: why };
    var probe = cells.slice().sort(numeric);
    var marks = marksFor(probe, dig.status);
    dig.tries.push({ cells: probe, marks: marks });
    dig.won = sameCells(probe, dig.target);
    dig.done = dig.won || dig.tries.length >= dig.maxTries;
    return { ok: true, reason: '', marks: marks, won: dig.won, done: dig.done };
  }

  /** The 3 by 3 block whose centre is nearest (cx, cy) while staying inside the grid. */
  function surveyBlock(W, cx, cy) {
    var x0 = Math.max(0, Math.min(W - 3, cx - 1));
    var y0 = Math.max(0, Math.min(W - 3, cy - 1));
    var cells = [];
    for (var y = y0; y < y0 + 3; y++) for (var x = x0; x < x0 + 3; x++) cells.push(y * W + x);
    return { x0: x0, y0: y0, cells: cells };
  }

  /** The rewarded survey: marks every open cell of one 3 by 3 block without spending a try. Once per dig. */
  function survey(dig, cx, cy) {
    if (dig.survey || dig.done) return { ok: false, reason: dig.done ? 'done' : 'used' };
    var block = surveyBlock(dig.W, cx, cy);
    var cells = block.cells.filter(function (i) { return !dig.blockedMask[i]; });
    dig.survey = { x0: block.x0, y0: block.y0, cells: cells, marks: marksFor(cells, dig.status) };
    return { ok: true, cells: cells, marks: dig.survey.marks };
  }

  /** Every observation so far: tries, then the survey if any. */
  function observations(dig, uptoTries) {
    var list = dig.tries.slice(0, uptoTries == null ? dig.tries.length : uptoTries);
    if (dig.survey) list = list.concat([dig.survey]);
    return list;
  }

  /**
   * What the board shows. mark[i] is -1 (never probed) or the cell's mark; cleared[i] is 1 for a cell
   * that a miss rules out (the plus shape around every miss) without it being probed.
   */
  function knowledge(dig) {
    var size = dig.W * dig.W;
    var mark = new Int8Array(size).fill(-1);
    var cleared = new Uint8Array(size);
    observations(dig).forEach(function (o) {
      o.cells.forEach(function (i, k) { mark[i] = o.marks[k]; });
    });
    for (var i = 0; i < size; i++) {
      if (mark[i] !== MISS) continue;
      var x = i % dig.W;
      var y = (i / dig.W) | 0;
      DIRS.forEach(function (d) {
        var nx = x + d[0];
        var ny = y + d[1];
        if (nx < 0 || ny < 0 || nx >= dig.W || ny >= dig.W) return;
        var j = ny * dig.W + nx;
        if (mark[j] === -1 && !dig.blockedMask[j]) cleared[j] = 1;
      });
    }
    return { mark: mark, cleared: cleared };
  }

  /** Placements still consistent with every observation (optionally only the first k tries). */
  function candidates(dig, uptoTries) {
    var all = placements(dig.n, dig.W, dig.blocked);
    var obs = observations(dig, uptoTries);
    var out = [];
    for (var p = 0; p < all.length; p++) {
      var s = statusMap(all[p], dig.W);
      var ok = true;
      for (var o = 0; o < obs.length && ok; o++) {
        var cells = obs[o].cells;
        var marks = obs[o].marks;
        for (var k = 0; k < cells.length; k++) {
          if (s[cells[k]] !== marks[k]) { ok = false; break; }
        }
      }
      if (ok) out.push(all[p]);
    }
    return out;
  }

  /** How many placements were possible before the first try and after each one: the narrowing line. */
  function narrowing(dig) {
    var all = placements(dig.n, dig.W, dig.blocked);
    var statuses = all.map(function (p) { return statusMap(p, dig.W); });
    var alive = statuses.map(function (s, k) { return k; });
    var counts = [alive.length];
    var obs = dig.survey ? [dig.survey] : [];
    obs.forEach(function (o) { alive = alive.filter(function (k) { return consistent(statuses[k], o); }); });
    dig.tries.forEach(function (t) {
      alive = alive.filter(function (k) { return consistent(statuses[k], t); });
      counts.push(alive.length);
    });
    return counts;
  }

  function consistent(status, obs) {
    for (var k = 0; k < obs.cells.length; k++) if (status[obs.cells[k]] !== obs.marks[k]) return false;
    return true;
  }

  function toJSON(dig) {
    return {
      W: dig.W, n: dig.n, maxTries: dig.maxTries, target: dig.target.slice(), blocked: dig.blocked.slice(),
      tries: dig.tries.map(function (t) { return { cells: t.cells.slice(), marks: t.marks.slice() }; }),
      survey: dig.survey ? { x0: dig.survey.x0, y0: dig.survey.y0, cells: dig.survey.cells.slice(), marks: dig.survey.marks.slice() } : null,
      won: dig.won, done: dig.done
    };
  }

  /** Rebuilds a saved dig, replaying its tries so a tampered save cannot claim a false result. Null if broken. */
  function fromJSON(data) {
    try {
      if (!data || typeof data !== 'object') return null;
      var W = data.W | 0;
      var n = data.n | 0;
      if (W < 4 || W > 9 || n < 3 || n > 7) return null;
      var target = intList(data.target, W * W);
      var blocked = intList(data.blocked || [], W * W);
      if (!target || !blocked || target.length !== n || !connected(target, W)) return null;
      if (target.some(function (i) { return blocked.indexOf(i) >= 0; })) return null;
      var dig = createDig({ W: W, n: n, maxTries: Math.max(1, Math.min(12, data.maxTries | 0)), target: target, blocked: blocked });
      if (data.survey && typeof data.survey === 'object') {
        survey(dig, (data.survey.x0 | 0) + 1, (data.survey.y0 | 0) + 1);
      }
      var tries = Array.isArray(data.tries) ? data.tries : [];
      for (var t = 0; t < tries.length && !dig.done; t++) {
        var cells = tries[t] && intList(tries[t].cells, W * W);
        if (!cells || !play(dig, cells).ok) return null;
      }
      return dig;
    } catch (e) {
      return null;
    }
  }

  function intList(list, limit) {
    if (!Array.isArray(list)) return null;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (typeof v !== 'number' || v !== (v | 0) || v < 0 || v >= limit) return null;
    }
    return list.slice();
  }

  /** The shard's cells as [x, y] pairs, for drawing. */
  function cellsXY(cells, W) {
    return cells.map(function (i) { return [i % W, (i / W) | 0]; });
  }

  var api = {
    MISS: MISS, NEAR: NEAR, HIT: HIT,
    fixedShapes: fixedShapes, freeKey: freeKey, placements: placements, statusMap: statusMap,
    marksFor: marksFor, sameCells: sameCells, adjacent: adjacent, touches: touches, connected: connected,
    addRefusal: addRefusal, canRemove: canRemove, createDig: createDig, probeRefusal: probeRefusal,
    play: play, surveyBlock: surveyBlock, survey: survey, knowledge: knowledge, candidates: candidates,
    narrowing: narrowing, toJSON: toJSON, fromJSON: fromJSON, cellsXY: cellsXY, blockedMask: blockedMask
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Sherd = root.Sherd || {}).rules = api;
})(this);
