/*
 * Show timing and volley generation. A volley is built as a chain tree (each shell placed within reach
 * of an earlier one), then checked with the model: every shell is tried as the opening at its crest with
 * a Perfect. Generation depends only on the seed, the volley index and the config, never on play.
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};
  var req = typeof require === 'function' ? require : null;
  var rngLib = Sky.rng || req('./rng.js');
  var M = Sky.model || req('./model.js');

  var SHOW_SECONDS = 60;
  var MAX_CANDIDATES = 8;

  function plan(def, opts) {
    opts = opts || {};
    var beat = 60 / def.bpm;
    var leadIn = 4 * beat;
    var volleyLen = 8 * beat;
    var count = Math.floor((SHOW_SECONDS - leadIn) / volleyLen + 1e-9); // 116 BPM is exactly 14, not 13.999
    var diff = (def.diff || 0) + (opts.daily ? 0.1 : 0);
    return {
      bpm: def.bpm, beat: beat, leadIn: leadIn, volleyLen: volleyLen, count: count, diff: diff,
      windowStart: function (v) { return leadIn + v * volleyLen; }
    };
  }

  function difficulty(pl, v) {
    var d = (pl.count > 1 ? v / (pl.count - 1) : 0) + pl.diff;
    return d > 1 ? 1 : d;
  }

  function sizeFor(d, r) {
    var n = Math.round(5 + 4 * d + (r.float() - 0.5));
    return n < 5 ? 5 : n > 9 ? 9 : n;
  }

  function pickType(r, d, allowed) {
    if (d < 0.15 || allowed.length === 1) return 0;
    var weights = [3, 2, 1.6, 1.6];
    var total = 0, i;
    for (i = 0; i < allowed.length; i++) total += weights[allowed[i]];
    var x = r.float() * total;
    for (i = 0; i < allowed.length; i++) {
      x -= weights[allowed[i]];
      if (x < 0) return allowed[i];
    }
    return allowed[allowed.length - 1];
  }

  /** The first direction index a burst of this seed uses (the jets of a crossette follow from it). */
  function burstRotation(seed) {
    return rngLib.create(seed).int(M.NDIR);
  }

  function inBounds(x, y) { return x >= 8 && x <= 92 && y >= 58 && y <= 150; }

  function farEnough(list, x, y, min) {
    for (var i = 0; i < list.length; i++) {
      var dx = list[i].cx - x, dy = list[i].cy - y;
      if (dx * dx + dy * dy < min * min) return false;
    }
    return true;
  }

  function halfBeats(x) { return Math.round(x * 2) / 2; }

  /** One candidate layout. */
  function candidate(seed, v, pl, cfg, d) {
    var r = rngLib.create(seed);
    var n = sizeFor(d, r);
    var spread = 0.5 + 2.5 * d;
    var lo = halfBeats(4 - spread / 2), hi = halfBeats(4 + spread / 2);
    if (lo < 3) lo = 3;
    if (hi > 6.5) hi = 6.5;
    var deltas = d < 0.25 ? [0, 0, 0.5] : [0, 0.5, 0.5, 1];
    var w0 = pl.windowStart(v);
    var placed = [];
    var rootSpec = {
      cx: 30 + 40 * r.float(), cy: 88 + 34 * r.float(), beat: lo, type: pickType(r, d, cfg.types),
      seed: rngLib.mix(seed, 1001)
    };
    placed.push(rootSpec);
    var guard = 0;
    while (placed.length < n && guard < 400) {
      guard++;
      var pi = placed.length > 3 && r.chance(0.6) ? placed.length - 1 - r.int(3) : r.int(placed.length);
      var parent = placed[pi];
      var tp = M.TYPES[parent.type];
      var dist = tp.reach * (0.58 + 0.38 * d) * (0.9 + 0.1 * r.float());
      var dir;
      if (parent.type === 2) {
        // along one of the crossette's four jets, a little off axis
        var rot = burstRotation(parent.seed);
        dir = (rot + 60 * r.int(4) + r.int(5) - 2 + M.NDIR) % M.NDIR;
        dist = tp.reach * (0.5 + 0.4 * d) * (0.85 + 0.15 * r.float());
      } else if (parent.type === 3) {
        dir = r.int(M.NDIR);
        dist = tp.reach * (0.62 + 0.3 * r.float());
      } else if (parent.type === 1) {
        // willow sparks hang and fall: children sit to the sides and below
        dir = (120 + r.int(120)) % M.NDIR; // 180 to 360 degrees
        dist = tp.reach * (0.45 + 0.4 * d) * (0.9 + 0.1 * r.float());
      } else {
        dir = r.int(M.NDIR);
      }
      var cx = parent.cx + M.DIRS[dir * 2] * dist;
      var cy = parent.cy + M.DIRS[dir * 2 + 1] * dist;
      if (!inBounds(cx, cy) || !farEnough(placed, cx, cy, guard > 240 ? 6 : 7.5)) continue;
      var beat = parent.beat + deltas[r.int(deltas.length)];
      if (beat > hi) beat = hi;
      placed.push({ cx: cx, cy: cy, beat: beat, type: pickType(r, d, cfg.types), seed: rngLib.mix(seed, 1001 + placed.length) });
    }
    var specs = [];
    for (var i = 0; i < placed.length; i++) {
      var p = placed[i];
      specs.push({
        id: v * 16 + i, volley: v, index: i, type: p.type, seed: p.seed,
        cx: p.cx, cy: p.cy, crestT: w0 + p.beat * pl.beat, vx: (r.float() - 0.5) * 6, beat: p.beat
      });
    }
    return specs;
  }

  /**
   * The guaranteed opening volley of a player's first show: a centre peony and five around it, cresting
   * together. The five sit on a hexagon whose directions match the bursts' rays (every burst seed is
   * picked with its rotation on the same 30 degree grid), so the centre reaches all of them. The show
   * routes any tap on this volley to the centre. attempt picks other burst seeds.
   */
  var TUTORIAL_DIRS = [20, 60, 100, 140, 220]; // 30, 90, 150, 210 and 330 degrees
  var TUTORIAL_RADIUS = 6;
  function tutorialVolley(v, pl, seed, attempt) {
    attempt = attempt | 0;
    var w0 = pl.windowStart(v);
    var specs = [{ cx: 50, cy: 104 }];
    for (var k = 0; k < TUTORIAL_DIRS.length; k++) {
      var idx = TUTORIAL_DIRS[k];
      specs.push({ cx: 50 + M.DIRS[idx * 2] * TUTORIAL_RADIUS, cy: 104 + M.DIRS[idx * 2 + 1] * TUTORIAL_RADIUS });
    }
    var j = attempt * 1000;
    for (var i = 0; i < specs.length; i++) {
      var s = specs[i];
      var sd;
      do { sd = rngLib.mix(seed, 2000 + j); j++; } while (burstRotation(sd) % 20 !== 0);
      s.id = v * 16 + i; s.volley = v; s.index = i; s.type = 0; s.seed = sd;
      s.crestT = w0 + 4 * pl.beat; s.vx = 0; s.beat = 4;
    }
    return specs;
  }

  function crestStep(spec) { return Math.round(spec.crestT / M.DT); }

  /**
   * Generates volley v. A generator function: it yields between trials so the caller can spread the work
   * over frames. Returns the volley.
   */
  function* generate(seed, v, pl, cfg) {
    var d = difficulty(pl, v);
    var vs = rngLib.mix(seed, v + 1);
    if (cfg.tutorial && v === 0) {
      // Keep the first layout whose centre clears all six from any tap in the Good window (13 steps).
      var keep = null;
      for (var at = 0; at < 8; at++) {
        var t = tutorialVolley(v, pl, vs, at);
        var worst = t.length;
        for (var off = -13; off <= 13; off++) {
          var lt = M.trialOpening(t, 0, crestStep(t[0]) + off, M.gradeFor(off * M.DT));
          if (lt < worst) worst = lt;
          if (off % 4 === 0) yield 1;
        }
        if (!keep || worst > keep.worst) keep = { specs: t, worst: worst, at: at };
        if (worst === t.length) break;
      }
      var lits = [];
      for (var ti = 0; ti < keep.specs.length; ti++) lits.push(ti === 0 ? keep.worst : M.trialOpening(keep.specs, ti, crestStep(keep.specs[ti]), 'good'));
      return finish(v, keep.specs, lits, 0, false, d, keep.at);
    }
    var best = null;
    for (var c = 0; c < MAX_CANDIDATES; c++) {
      var specs = candidate(rngLib.mix(vs, c + 1), v, pl, cfg, d);
      var n = specs.length;
      var lits = [];
      var top = 0, topIndex = 0, full = 0;
      for (var i = 0; i < n; i++) {
        var lit = M.trialOpening(specs, i, crestStep(specs[i]), 'perfect');
        lits.push(lit);
        if (lit > top) { top = lit; topIndex = i; }
        if (lit === n) full++;
        yield 1;
      }
      var needsPerfect = false;
      var score;
      if (top < n) {
        score = top - n - 10;
      } else {
        var target = 1 - 0.8 * d;
        score = -Math.abs(full / n - target);
        // Early volleys must forgive a Good tap a little early or late; later ones prefer a Perfect.
        var cs = crestStep(specs[topIndex]);
        var good = M.trialOpening(specs, topIndex, cs, 'good');
        yield 1;
        needsPerfect = good < n;
        if (d < 0.4) {
          var early = M.trialOpening(specs, topIndex, cs - 9, 'good');
          var late = M.trialOpening(specs, topIndex, cs + 9, 'good');
          yield 1;
          score -= (n - good) * 0.5 + (n - early) * 0.25 + (n - late) * 0.25;
        } else if (!needsPerfect) {
          score -= 0.3 * d;
        }
      }
      if (!best || score > best.score) best = { specs: specs, lits: lits, top: topIndex, needsPerfect: needsPerfect, score: score, c: c };
      if (top === n && score > -0.15) break;
    }
    return finish(v, best.specs, best.lits, best.top, best.needsPerfect, d, best.c);
  }

  function finish(v, specs, lits, top, needsPerfect, d, c) {
    var first = Infinity, last = 0;
    for (var i = 0; i < specs.length; i++) {
      var rise = Math.sqrt(2 * (specs[i].cy - M.LAUNCH_Y) / M.G);
      var launch = specs[i].crestT - rise;
      if (launch < first) first = launch;
      var dead = specs[i].crestT + M.LIVE_AFTER;
      if (dead > last) last = dead;
    }
    return {
      index: v, size: specs.length, specs: specs, openings: lits, best: top, bestLit: lits[top],
      needsPerfect: needsPerfect, difficulty: d, candidate: c, firstLaunch: first, lastDead: last
    };
  }

  /** Runs a generator to the end (tests, and when a volley is needed at once). */
  function runAll(gen) {
    var step = gen.next();
    while (!step.done) step = gen.next();
    return step.value;
  }

  /** Keeps volleys generated ahead of play, a slice at a time. */
  function Provider(seed, pl, cfg) {
    this.seed = seed >>> 0;
    this.plan = pl;
    this.cfg = cfg;
    this.done = [];
    this.gen = null;
    this.next = 0;
  }

  Provider.prototype.work = function (budgetMs, now) {
    var start = now();
    while (this.next < this.plan.count) {
      if (!this.gen) this.gen = generate(this.seed, this.next, this.plan, this.cfg);
      var st = this.gen.next();
      if (st.done) {
        this.done[this.next] = st.value;
        this.gen = null;
        this.next++;
      }
      if (now() - start >= budgetMs) return;
    }
  };

  Provider.prototype.get = function (v) {
    while (this.next <= v && this.next < this.plan.count) {
      if (!this.gen) this.gen = generate(this.seed, this.next, this.plan, this.cfg);
      this.done[this.next] = runAll(this.gen);
      this.gen = null;
      this.next++;
    }
    return this.done[v] || null;
  };

  var api = {
    SHOW_SECONDS: SHOW_SECONDS, plan: plan, difficulty: difficulty, generate: generate, runAll: runAll,
    Provider: Provider, crestStep: crestStep, tutorialVolley: tutorialVolley
  };
  Sky.volleys = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
