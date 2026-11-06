/*
 * One show: volleys on the beat, one spark per volley, lights, multiplier and score. Pure and
 * deterministic: the same seed and the same taps (shell and step) give the same show. The presentation
 * reads the events each step returns.
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};
  var req = typeof require === 'function' ? require : null;
  var M = Sky.model || req('./model.js');
  var V = Sky.volleys || req('./volleys.js');

  var LIGHTS = 10;
  var MAX_MULT = 8;
  var TAP_RADIUS = 9;
  var TAIL_SECONDS = 1.2;

  /**
   * opts: def (skyline), seed, daily (bool), types (allowed type indexes), tutorial (first show ever),
   * provider (optional, for tests).
   */
  function Show(opts) {
    this.def = opts.def;
    this.seed = opts.seed >>> 0;
    this.daily = !!opts.daily;
    this.tutorial = !!opts.tutorial;
    this.types = opts.types || [0];
    this.plan = V.plan(this.def, { daily: this.daily });
    this.provider = opts.provider || new V.Provider(this.seed, this.plan, { types: this.types, tutorial: this.tutorial });
    this.model = new M.Model({ track: true });
    this.lights = LIGHTS;
    this.mult = 1;
    this.score = 0;
    this.state = 'play';
    this.encoreUsed = false;
    this.endStep = -1;
    this.volleys = [];
    for (var v = 0; v < this.plan.count; v++) {
      this.volleys.push({ index: v, spawned: false, data: null, size: 0, lit: 0, duds: 0, sparkUsed: false,
        resolved: false, fullClear: false, skipped: false, mark: -1 });
    }
    this.stats = { perfects: 0, goods: 0, offs: 0, fullClears: 0, duds: 0, lit: 0, maxChain: 0, carries: 0,
      perfectRun: 0, bestPerfectRun: 0, unusedSparks: 0, bigClear: false, playerClear: false };
    this.out = [];
    this.longest = null;
    this.lightsOutSeen = false;
  }

  Show.prototype.time = function () { return this.model.step * M.DT; };
  Show.prototype.beat = function (t) { return t / this.plan.beat; };

  Show.prototype.spawnTime = function (v) { return this.plan.windowStart(v) - 2.5 * this.plan.beat; };

  /** The next volley that has not launched a shell yet (for Encore and progress). */
  Show.prototype.nextOpenVolley = function () {
    var t = this.time();
    for (var v = 0; v < this.volleys.length; v++) {
      var vs = this.volleys[v];
      if (vs.resolved || vs.skipped) continue;
      if (!vs.spawned) return v;
      if (vs.data && vs.data.firstLaunch > t + M.DT) return v;
    }
    return this.volleys.length;
  };

  Show.prototype.spawn = function (v) {
    var vs = this.volleys[v];
    var data = this.provider.get(v);
    vs.data = data;
    vs.size = data.size;
    vs.spawned = true;
    vs.shells = [];
    for (var i = 0; i < data.specs.length; i++) vs.shells.push(this.model.add(M.makeShell(data.specs[i])));
  };

  /** One fixed step. Returns high level events (array reused). */
  Show.prototype.step = function () {
    var out = this.out;
    out.length = 0;
    if (this.state !== 'play') return out;
    var t = (this.model.step + 1) * M.DT;
    for (var v = 0; v < this.volleys.length; v++) {
      var vs0 = this.volleys[v];
      if (!vs0.spawned && !vs0.skipped && t >= this.spawnTime(v)) this.spawn(v);
    }
    var ev = this.model.advance();
    for (var i = 0; i < ev.length; i++) this.handle(ev[i], out);
    if (this.state === 'play') this.resolve(out);
    if (this.model.step % 120 === 0) this.model.prune(this.model.step - 180);
    return out;
  };

  Show.prototype.markLit = function (sh, out) {
    var vs = this.volleys[sh.volley];
    vs.lit += 1;
    this.stats.lit += 1;
    var ch = this.model.chains[sh.chain];
    if (ch && ch.length > this.stats.maxChain) {
      this.stats.maxChain = ch.length;
      this.longest = ch;
    }
    if (vs.lit === vs.size) {
      sh.final = true;
      vs.fullClear = true;
      this.stats.fullClears += 1;
      if (vs.size >= 8) this.stats.bigClear = true;
      if (!(this.tutorial && sh.volley === 0)) this.stats.playerClear = true;
      this.score += 100 * this.mult;
      this.mult = Math.min(MAX_MULT, this.mult + 1);
      this.lights = Math.min(LIGHTS, this.lights + 1);
      out.push({ k: 'fullclear', volley: sh.volley, shell: sh, mult: this.mult, lights: this.lights });
    }
  };

  Show.prototype.handle = function (e, out) {
    var sh = e.shell;
    switch (e.k) {
      case 'launch':
        out.push(e);
        break;
      case 'open':
        var g = e.grade;
        if (g === 'perfect') {
          this.stats.perfects += 1;
          this.stats.perfectRun += 1;
          if (this.stats.perfectRun > this.stats.bestPerfectRun) this.stats.bestPerfectRun = this.stats.perfectRun;
        } else {
          this.stats.perfectRun = 0;
          if (g === 'good') this.stats.goods += 1; else this.stats.offs += 1;
        }
        this.markLit(sh, out);
        out.push(e);
        break;
      case 'ignite':
        var ch = this.model.chains[e.chain];
        if (ch && sh.volley !== ch.volley) this.stats.carries += 1;
        this.markLit(sh, out);
        out.push(e);
        break;
      case 'burst':
        var chain = this.model.chains[e.chain];
        var pts = 10 * Math.min(sh.chainPos, 20) * this.mult;
        if (sh.opening && sh.grade === 'perfect') pts += 50 * this.mult;
        if (chain && sh.volley !== chain.volley) pts += 25 * this.mult;
        this.score += pts;
        e.points = pts;
        e.chainPos = sh.chainPos;
        out.push(e);
        break;
      case 'dud':
        var vs = this.volleys[sh.volley];
        if (vs.skipped) break;
        vs.duds += 1;
        this.stats.duds += 1;
        this.lights = Math.max(0, this.lights - 1);
        out.push({ k: 'dud', shell: sh, lights: this.lights });
        if (this.lights === 0) {
          this.state = 'lightsOut';
          this.lightsOutSeen = true;
          out.push({ k: 'lightsOut' });
        }
        break;
    }
  };

  Show.prototype.resolve = function (out) {
    var t = this.time();
    var allDone = true;
    for (var v = 0; v < this.volleys.length; v++) {
      var vs = this.volleys[v];
      if (vs.resolved || vs.skipped) continue;
      if (!vs.spawned) { allDone = false; continue; }
      var open = false;
      for (var i = 0; i < vs.shells.length; i++) {
        var st = vs.shells[i].state;
        if (st !== M.BURST && st !== M.DUD) { open = true; break; }
      }
      if (open) { allDone = false; continue; }
      vs.resolved = true;
      vs.mark = vs.fullClear ? 2 : vs.lit > 0 ? 1 : 0;
      if (!vs.sparkUsed) {
        this.stats.unusedSparks += 1;
        if (vs.duds > 0) { this.mult = 1; this.stats.perfectRun = 0; }
      }
      out.push({ k: 'volleyEnd', volley: v, mark: vs.mark });
    }
    if (allDone && !this.model.busy()) {
      if (this.endStep < 0) this.endStep = this.model.step + Math.round(TAIL_SECONDS / M.DT);
      if (this.model.step >= this.endStep) {
        this.state = 'over';
        out.push({ k: 'over' });
      }
    }
    return t;
  };

  /** Shells a tap at this visual time could light: live, and their volley's spark unused. */
  Show.prototype.tapCandidates = function (t) {
    var list = [];
    for (var v = 0; v < this.volleys.length; v++) {
      var vs = this.volleys[v];
      if (!vs.spawned || vs.sparkUsed || vs.resolved || vs.skipped) continue;
      for (var i = 0; i < vs.shells.length; i++) {
        var sh = vs.shells[i];
        if (sh.state !== M.AIR) continue;
        if (t < sh.launchT || t + M.DT >= sh.deadT || M.shellY(sh, t) < M.ARM_Y) continue;
        list.push(sh);
      }
    }
    return list;
  };

  /**
   * The nearest candidate shell to a world point at time t, within the tap radius, or null. In the first
   * volley of the first show any tap on the cluster opens its centre, so the first tap always clears it.
   */
  Show.prototype.pick = function (wx, wy, t) {
    var list = this.tapCandidates(t);
    var best = null, bestD = TAP_RADIUS * TAP_RADIUS;
    for (var i = 0; i < list.length; i++) {
      var sh = list[i];
      var dx = M.shellX(sh, t) - wx, dy = M.shellY(sh, t) - wy;
      var d2 = dx * dx + dy * dy;
      if (d2 <= bestD) { bestD = d2; best = sh; }
    }
    if (best && this.tutorial && best.volley === 0) {
      var centre = this.volleys[0].shells && this.volleys[0].shells[0];
      if (centre && list.indexOf(centre) >= 0) best = centre;
    }
    return best;
  };

  /** The player's tap at world (wx, wy) seen at show time t. */
  Show.prototype.tap = function (wx, wy, t) {
    if (this.state !== 'play') return { ok: false, reason: 'state' };
    var sh = this.pick(wx, wy, t);
    if (!sh) return { ok: false, reason: 'none' };
    return this.openShell(sh, M.gradeFor(t - sh.crestT));
  };

  /** Opens a chain from this shell with a grade (also used by bots and replays). */
  Show.prototype.openShell = function (sh, grade) {
    var vs = this.volleys[sh.volley];
    if (!vs || vs.sparkUsed) return { ok: false, reason: 'spent' };
    if (!this.model.open(sh, grade)) return { ok: false, reason: 'gone' };
    vs.sparkUsed = true;
    return { ok: true, shell: sh, grade: grade };
  };

  Show.prototype.canEncore = function () {
    return this.state === 'lightsOut' && !this.daily && !this.encoreUsed && this.nextOpenVolley() < this.volleys.length;
  };

  /** Encore: all lights back, multiplier kept, the show goes on from the next volley. */
  Show.prototype.encore = function () {
    if (!this.canEncore()) return false;
    var next = this.nextOpenVolley();
    this.encoreUsed = true;
    this.lights = LIGHTS;
    var m = this.model;
    // Everything still in the air leaves quietly; no penalty.
    for (var v = 0; v < next; v++) {
      var vs = this.volleys[v];
      if (!vs.resolved) { vs.skipped = true; vs.resolved = true; vs.mark = vs.fullClear ? 2 : vs.lit > 0 ? 1 : 0; }
    }
    var keep = [];
    for (var i = 0; i < m.shells.length; i++) {
      var sh = m.shells[i];
      if (sh.volley >= next) keep.push(sh);
    }
    m.shells = keep;
    m.sparks.length = 0;
    m.pending = null;
    var resume = Math.round((this.plan.windowStart(next) - 3 * this.plan.beat) / M.DT);
    if (resume > m.step) m.step = resume;
    this.state = 'play';
    return true;
  };

  /** Ends the show now (Encore declined, or the player left). */
  Show.prototype.finish = function () {
    this.state = 'over';
  };

  /** Fraction of the show done, for the progress line. */
  Show.prototype.progress = function () {
    var total = this.plan.windowStart(this.plan.count) + 1;
    var p = this.time() / total;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  };

  /** The volley strip for the share card: 2 full clear, 1 partial, 0 none, for each played volley. */
  Show.prototype.marks = function () {
    var list = [];
    for (var v = 0; v < this.volleys.length; v++) if (this.volleys[v].mark >= 0) list.push(this.volleys[v].mark);
    return list;
  };

  /** The volley the guide ring points into during the first show (best opening), or null. */
  Show.prototype.guide = function (t) {
    if (!this.tutorial) return null;
    for (var v = 0; v < 3 && v < this.volleys.length; v++) {
      var vs = this.volleys[v];
      if (!vs.spawned || vs.sparkUsed || vs.resolved) continue;
      var sh = vs.shells[vs.data.best];
      if (sh && sh.state === M.AIR && t >= sh.launchT) return sh;
    }
    return null;
  };

  /** A summary for results, progression and saves. */
  Show.prototype.summary = function () {
    var s = this.stats;
    var completed = this.state === 'over' && this.nextOpenVolley() >= this.volleys.length;
    var allPlayed = true;
    for (var v = 0; v < this.volleys.length; v++) if (!this.volleys[v].resolved) allPlayed = false;
    return {
      score: this.score, maxChain: s.maxChain, perfects: s.perfects, fullClears: s.fullClears, duds: s.duds,
      lit: s.lit, carries: s.carries, bestPerfectRun: s.bestPerfectRun, bigClear: s.bigClear,
      playerClear: s.playerClear, encoreUsed: this.encoreUsed, lightsOut: this.lightsOutSeen,
      finished: completed && allPlayed, noDud: completed && allPlayed && s.duds === 0 && !this.encoreUsed,
      volleys: this.marks(), skyline: this.def.id, daily: this.daily
    };
  };

  var api = { Show: Show, LIGHTS: LIGHTS, MAX_MULT: MAX_MULT, TAP_RADIUS: TAP_RADIUS };
  Sky.show = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
