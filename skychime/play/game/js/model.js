/*
 * The chain model: shells, sparks and ignition, run at a fixed step of 1/60 s.
 *
 * Deterministic on purpose. Shell positions are closed-form functions of time; sparks are integrated with
 * + - * / only; directions come from the table below (decimal literals parse to the same doubles in every
 * engine), and the only other function used is Math.sqrt, which IEEE 754 rounds exactly. The renderer
 * draws these same sparks, so a spark never visibly touches a shell that does not light.
 *
 * World: 100 x 170 units, y up, the ground line at y = 0.
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};
  var rngLib = Sky.rng || (typeof require === 'function' ? require('./rng.js') : null);

  var DT = 1 / 60;
  var G = 64;
  var LAUNCH_Y = 4;
  var ARM_Y = 24; // shells arm above the rooftops: below it nothing lights them, and a falling shell is a dud
  var LIVE_AFTER = 1.5;
  var FUSE_STEPS = 7; // 0.117 s
  var HIT_R = 3.0;
  var HIT_R2 = HIT_R * HIT_R;
  var NEAR_R2 = 14 * 14;
  var WORLD_W = 100;
  var WORLD_H = 170;

  // 240 unit vectors, cos and sin of i * 1.5 degrees, rounded to 10 places.
  var DIRS = [
    1,0, 0.999657325,0.0261769483, 0.9986295348,0.0523359562, 0.9969173337,0.0784590957, 0.9945218954,0.1045284633, 0.9914448614,0.1305261922,
    0.9876883406,0.156434465, 0.9832549076,0.1822355255, 0.9781476007,0.2079116908, 0.9723699204,0.2334453639, 0.9659258263,0.2588190451, 0.9588197349,0.2840153447,
    0.9510565163,0.3090169944, 0.9426414911,0.3338068592, 0.9335804265,0.3583679495, 0.9238795325,0.3826834324, 0.9135454576,0.4067366431, 0.9025852843,0.4305110968,
    0.8910065242,0.4539904997, 0.8788171127,0.4771587603, 0.8660254038,0.5, 0.8526401644,0.5224985647, 0.8386705679,0.544639035, 0.8241261886,0.5664062369,
    0.8090169944,0.5877852523, 0.7933533403,0.608761429, 0.7771459615,0.629320391, 0.7604059656,0.6494480483, 0.7431448255,0.6691306064, 0.725374371,0.6883545757,
    0.7071067812,0.7071067812, 0.6883545757,0.725374371, 0.6691306064,0.7431448255, 0.6494480483,0.7604059656, 0.629320391,0.7771459615, 0.608761429,0.7933533403,
    0.5877852523,0.8090169944, 0.5664062369,0.8241261886, 0.544639035,0.8386705679, 0.5224985647,0.8526401644, 0.5,0.8660254038, 0.4771587603,0.8788171127,
    0.4539904997,0.8910065242, 0.4305110968,0.9025852843, 0.4067366431,0.9135454576, 0.3826834324,0.9238795325, 0.3583679495,0.9335804265, 0.3338068592,0.9426414911,
    0.3090169944,0.9510565163, 0.2840153447,0.9588197349, 0.2588190451,0.9659258263, 0.2334453639,0.9723699204, 0.2079116908,0.9781476007, 0.1822355255,0.9832549076,
    0.156434465,0.9876883406, 0.1305261922,0.9914448614, 0.1045284633,0.9945218954, 0.0784590957,0.9969173337, 0.0523359562,0.9986295348, 0.0261769483,0.999657325,
    0,1, -0.0261769483,0.999657325, -0.0523359562,0.9986295348, -0.0784590957,0.9969173337, -0.1045284633,0.9945218954, -0.1305261922,0.9914448614,
    -0.156434465,0.9876883406, -0.1822355255,0.9832549076, -0.2079116908,0.9781476007, -0.2334453639,0.9723699204, -0.2588190451,0.9659258263, -0.2840153447,0.9588197349,
    -0.3090169944,0.9510565163, -0.3338068592,0.9426414911, -0.3583679495,0.9335804265, -0.3826834324,0.9238795325, -0.4067366431,0.9135454576, -0.4305110968,0.9025852843,
    -0.4539904997,0.8910065242, -0.4771587603,0.8788171127, -0.5,0.8660254038, -0.5224985647,0.8526401644, -0.544639035,0.8386705679, -0.5664062369,0.8241261886,
    -0.5877852523,0.8090169944, -0.608761429,0.7933533403, -0.629320391,0.7771459615, -0.6494480483,0.7604059656, -0.6691306064,0.7431448255, -0.6883545757,0.725374371,
    -0.7071067812,0.7071067812, -0.725374371,0.6883545757, -0.7431448255,0.6691306064, -0.7604059656,0.6494480483, -0.7771459615,0.629320391, -0.7933533403,0.608761429,
    -0.8090169944,0.5877852523, -0.8241261886,0.5664062369, -0.8386705679,0.544639035, -0.8526401644,0.5224985647, -0.8660254038,0.5, -0.8788171127,0.4771587603,
    -0.8910065242,0.4539904997, -0.9025852843,0.4305110968, -0.9135454576,0.4067366431, -0.9238795325,0.3826834324, -0.9335804265,0.3583679495, -0.9426414911,0.3338068592,
    -0.9510565163,0.3090169944, -0.9588197349,0.2840153447, -0.9659258263,0.2588190451, -0.9723699204,0.2334453639, -0.9781476007,0.2079116908, -0.9832549076,0.1822355255,
    -0.9876883406,0.156434465, -0.9914448614,0.1305261922, -0.9945218954,0.1045284633, -0.9969173337,0.0784590957, -0.9986295348,0.0523359562, -0.999657325,0.0261769483,
    -1,0, -0.999657325,-0.0261769483, -0.9986295348,-0.0523359562, -0.9969173337,-0.0784590957, -0.9945218954,-0.1045284633, -0.9914448614,-0.1305261922,
    -0.9876883406,-0.156434465, -0.9832549076,-0.1822355255, -0.9781476007,-0.2079116908, -0.9723699204,-0.2334453639, -0.9659258263,-0.2588190451, -0.9588197349,-0.2840153447,
    -0.9510565163,-0.3090169944, -0.9426414911,-0.3338068592, -0.9335804265,-0.3583679495, -0.9238795325,-0.3826834324, -0.9135454576,-0.4067366431, -0.9025852843,-0.4305110968,
    -0.8910065242,-0.4539904997, -0.8788171127,-0.4771587603, -0.8660254038,-0.5, -0.8526401644,-0.5224985647, -0.8386705679,-0.544639035, -0.8241261886,-0.5664062369,
    -0.8090169944,-0.5877852523, -0.7933533403,-0.608761429, -0.7771459615,-0.629320391, -0.7604059656,-0.6494480483, -0.7431448255,-0.6691306064, -0.725374371,-0.6883545757,
    -0.7071067812,-0.7071067812, -0.6883545757,-0.725374371, -0.6691306064,-0.7431448255, -0.6494480483,-0.7604059656, -0.629320391,-0.7771459615, -0.608761429,-0.7933533403,
    -0.5877852523,-0.8090169944, -0.5664062369,-0.8241261886, -0.544639035,-0.8386705679, -0.5224985647,-0.8526401644, -0.5,-0.8660254038, -0.4771587603,-0.8788171127,
    -0.4539904997,-0.8910065242, -0.4305110968,-0.9025852843, -0.4067366431,-0.9135454576, -0.3826834324,-0.9238795325, -0.3583679495,-0.9335804265, -0.3338068592,-0.9426414911,
    -0.3090169944,-0.9510565163, -0.2840153447,-0.9588197349, -0.2588190451,-0.9659258263, -0.2334453639,-0.9723699204, -0.2079116908,-0.9781476007, -0.1822355255,-0.9832549076,
    -0.156434465,-0.9876883406, -0.1305261922,-0.9914448614, -0.1045284633,-0.9945218954, -0.0784590957,-0.9969173337, -0.0523359562,-0.9986295348, -0.0261769483,-0.999657325,
    0,-1, 0.0261769483,-0.999657325, 0.0523359562,-0.9986295348, 0.0784590957,-0.9969173337, 0.1045284633,-0.9945218954, 0.1305261922,-0.9914448614,
    0.156434465,-0.9876883406, 0.1822355255,-0.9832549076, 0.2079116908,-0.9781476007, 0.2334453639,-0.9723699204, 0.2588190451,-0.9659258263, 0.2840153447,-0.9588197349,
    0.3090169944,-0.9510565163, 0.3338068592,-0.9426414911, 0.3583679495,-0.9335804265, 0.3826834324,-0.9238795325, 0.4067366431,-0.9135454576, 0.4305110968,-0.9025852843,
    0.4539904997,-0.8910065242, 0.4771587603,-0.8788171127, 0.5,-0.8660254038, 0.5224985647,-0.8526401644, 0.544639035,-0.8386705679, 0.5664062369,-0.8241261886,
    0.5877852523,-0.8090169944, 0.608761429,-0.7933533403, 0.629320391,-0.7771459615, 0.6494480483,-0.7604059656, 0.6691306064,-0.7431448255, 0.6883545757,-0.725374371,
    0.7071067812,-0.7071067812, 0.725374371,-0.6883545757, 0.7431448255,-0.6691306064, 0.7604059656,-0.6494480483, 0.7771459615,-0.629320391, 0.7933533403,-0.608761429,
    0.8090169944,-0.5877852523, 0.8241261886,-0.5664062369, 0.8386705679,-0.544639035, 0.8526401644,-0.5224985647, 0.8660254038,-0.5, 0.8788171127,-0.4771587603,
    0.8910065242,-0.4539904997, 0.9025852843,-0.4305110968, 0.9135454576,-0.4067366431, 0.9238795325,-0.3826834324, 0.9335804265,-0.3583679495, 0.9426414911,-0.3338068592,
    0.9510565163,-0.3090169944, 0.9588197349,-0.2840153447, 0.9659258263,-0.2588190451, 0.9723699204,-0.2334453639, 0.9781476007,-0.2079116908, 0.9832549076,-0.1822355255,
    0.9876883406,-0.156434465, 0.9914448614,-0.1305261922, 0.9945218954,-0.1045284633, 0.9969173337,-0.0784590957, 0.9986295348,-0.0523359562, 0.999657325,-0.0261769483
  ];
  var NDIR = 240;

  var WAIT = 0, AIR = 1, FUSE = 2, BURST = 3, DUD = 4;

  // speed units/s, drag 1/s, fall units/s^2, life s, hot after s (ring: hollow centre)
  var TYPES = [
    { name: 'peony', count: 12, speed: 34, drag: 2.2, fall: 10, life: 1.15, hot: 0, jitter: 0.12 },
    { name: 'willow', count: 10, speed: 26, drag: 1.1, fall: 22, life: 2.0, hot: 0, jitter: 0.12 },
    { name: 'crossette', count: 4, speed: 64, drag: 1.7, fall: 6, life: 1.0, hot: 0, jitter: 0.04 },
    { name: 'ring', count: 16, speed: 44, drag: 1.9, fall: 6, life: 1.1, hot: 0.3, jitter: 0.03 }
  ];
  var TYPE_INDEX = { peony: 0, willow: 1, crossette: 2, ring: 3 };
  for (var ti = 0; ti < TYPES.length; ti++) {
    var tp = TYPES[ti];
    tp.dm = 1 - tp.drag * DT;
    tp.fallStep = tp.fall * DT;
    tp.lifeSteps = Math.round(tp.life / DT);
    tp.hotSteps = Math.round(tp.hot / DT);
    tp.dirStep = NDIR / tp.count;
    // Reach of a Good burst, by stepping one spark the way the model does (for generation and drawing).
    var vx = tp.speed, x = 0;
    for (var s = 0; s < tp.lifeSteps; s++) { vx *= tp.dm; x += vx * DT; }
    tp.reach = x;
  }

  var GRADE = { perfect: 1.25, good: 1.0, off: 0.85 };
  var PERFECT_WINDOW = 0.075;
  var GOOD_WINDOW = 0.22;

  function gradeFor(dt) {
    var a = dt < 0 ? -dt : dt;
    if (a <= PERFECT_WINDOW) return 'perfect';
    if (a <= GOOD_WINDOW) return 'good';
    return 'off';
  }

  /**
   * A shell from its crest: cx, cy (crest position), crestT (show seconds), vx (units/s), type index,
   * seed. Launch time and speed follow from the crest.
   */
  function makeShell(spec) {
    var rise = Math.sqrt(2 * (spec.cy - LAUNCH_Y) / G);
    return {
      id: spec.id | 0,
      volley: spec.volley | 0,
      index: spec.index | 0,
      type: spec.type | 0,
      seed: spec.seed >>> 0,
      cx: spec.cx, cy: spec.cy, crestT: spec.crestT, vx: spec.vx,
      rise: rise,
      launchT: spec.crestT - rise,
      x0: spec.cx - spec.vx * rise,
      vy0: G * rise,
      deadT: spec.crestT + LIVE_AFTER,
      state: WAIT,
      fuseStep: 0, chain: -1, chainPos: 0, litStep: -1, burstStep: -1, burstX: 0, burstY: 0,
      final: false, opening: false, grade: null,
      minD2: 1e9, nearX: 0, nearY: 0, dudStep: -1
    };
  }

  function shellX(sh, t) { return sh.x0 + sh.vx * (t - sh.launchT); }
  function shellY(sh, t) { var d = t - sh.launchT; return LAUNCH_Y + sh.vy0 * d - 0.5 * G * d * d; }
  function shellVY(sh, t) { return sh.vy0 - G * (t - sh.launchT); }

  /** The sparks of one burst. Same input, same sparks: replays and postcards use this too. */
  function burstSparks(b, out) {
    var tp = TYPES[b.type];
    var r = rngLib.create(b.seed);
    var rot = r.int(NDIR);
    var list = out || [];
    for (var k = 0; k < tp.count; k++) {
      var idx = (rot + k * tp.dirStep) % NDIR;
      var j = 1 - tp.jitter * 0.5 + tp.jitter * r.float();
      var sp = tp.speed * b.factor * j;
      list.push({
        x: b.x, y: b.y, px: b.x, py: b.y,
        vx: DIRS[idx * 2] * sp + b.svx * 0.25,
        vy: DIRS[idx * 2 + 1] * sp + b.svy * 0.25,
        age: 0, life: tp.lifeSteps, hot: tp.hotSteps, dm: tp.dm, fall: tp.fallStep,
        type: b.type, chain: b.chain, shell: b.shell, born: b.step
      });
    }
    return list;
  }

  function stepSpark(p) {
    p.px = p.x; p.py = p.y;
    p.vx *= p.dm;
    p.vy = p.vy * p.dm - p.fall;
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    p.age += 1;
  }

  function Model(options) {
    options = options || {};
    this.step = options.step | 0;
    this.shells = [];
    this.sparks = [];
    this.chains = [];
    this.events = [];
    this.pending = null;
    this.track = !!options.track;
    this.keepBursts = options.keepBursts !== false;
  }

  Model.prototype.time = function () { return this.step * DT; };

  Model.prototype.add = function (shell) { this.shells.push(shell); return shell; };

  /** Open a chain from this shell at the next step. Returns false if the shell cannot be lit. */
  Model.prototype.open = function (shell, grade) {
    if (!shell || shell.state !== AIR && shell.state !== WAIT) return false;
    this.pending = { shell: shell, grade: grade || 'good' };
    return true;
  };

  Model.prototype.burst = function (sh, t, factor, chainId) {
    var x = shellX(sh, t), y = shellY(sh, t);
    sh.state = BURST;
    sh.burstStep = this.step;
    sh.burstX = x; sh.burstY = y;
    var b = { x: x, y: y, type: sh.type, factor: factor, seed: sh.seed, svx: sh.vx, svy: shellVY(sh, t),
      chain: chainId, shell: sh.id, step: this.step };
    burstSparks(b, this.sparks);
    var ch = this.chains[chainId];
    if (ch && this.keepBursts) ch.bursts.push(b);
    this.events.push({ k: 'burst', shell: sh, chain: chainId, x: x, y: y, factor: factor, opening: sh.opening, grade: sh.grade, final: sh.final });
    return b;
  };

  /** One fixed step. Returns this step's events (the array is reused). */
  Model.prototype.advance = function () {
    var ev = this.events;
    ev.length = 0;
    this.step += 1;
    var t = this.step * DT;
    var shells = this.shells;
    var i, sh;

    for (i = 0; i < shells.length; i++) {
      sh = shells[i];
      if (sh.state === WAIT) {
        if (t >= sh.launchT) { sh.state = AIR; ev.push({ k: 'launch', shell: sh }); }
      }
      if (sh.state === AIR) {
        if (t >= sh.deadT || (t > sh.crestT && shellY(sh, t) < ARM_Y)) {
          sh.state = DUD;
          sh.dudStep = this.step;
          ev.push({ k: 'dud', shell: sh });
        }
      } else if (sh.state === FUSE && this.step >= sh.fuseStep) {
        this.burst(sh, t, GRADE.good, sh.chain);
      }
    }

    if (this.pending) {
      var p = this.pending;
      this.pending = null;
      sh = p.shell;
      if ((sh.state === AIR || (sh.state === WAIT && t >= sh.launchT)) && shellY(sh, t) >= ARM_Y) {
        var id = this.chains.length;
        this.chains.push({ id: id, opening: sh.id, volley: sh.volley, length: 1, carries: 0, bursts: [], grade: p.grade, step: this.step });
        sh.chain = id; sh.chainPos = 1; sh.litStep = this.step; sh.opening = true; sh.grade = p.grade;
        ev.push({ k: 'open', shell: sh, chain: id, grade: p.grade });
        this.burst(sh, t, GRADE[p.grade] || 1, id);
      }
    }

    var sparks = this.sparks;
    var n = sparks.length;
    var track = this.track;
    for (var si = 0; si < n; si++) {
      var q = sparks[si];
      stepSpark(q);
      if (q.age < q.hot) continue;
      var minx = q.px < q.x ? q.px : q.x, maxx = q.px < q.x ? q.x : q.px;
      var miny = q.py < q.y ? q.py : q.y, maxy = q.py < q.y ? q.y : q.py;
      for (i = 0; i < shells.length; i++) {
        sh = shells[i];
        if (sh.state !== AIR) continue;
        var sx = sh.x0 + sh.vx * (t - sh.launchT);
        var dl = t - sh.launchT;
        var sy = LAUNCH_Y + sh.vy0 * dl - 0.5 * G * dl * dl;
        if (sy < ARM_Y) continue;
        if (sx < minx - 14 || sx > maxx + 14 || sy < miny - 14 || sy > maxy + 14) continue;
        var dx = q.x - q.px, dy = q.y - q.py;
        var fx = sx - q.px, fy = sy - q.py;
        var l2 = dx * dx + dy * dy;
        var u = l2 > 0 ? (fx * dx + fy * dy) / l2 : 0;
        if (u < 0) u = 0; else if (u > 1) u = 1;
        var cx = q.px + u * dx, cy = q.py + u * dy;
        var ex = sx - cx, ey = sy - cy;
        var d2 = ex * ex + ey * ey;
        if (d2 <= HIT_R2) {
          var ch = this.chains[q.chain];
          sh.state = FUSE;
          sh.fuseStep = this.step + FUSE_STEPS;
          sh.chain = q.chain;
          sh.litStep = this.step;
          if (ch) {
            ch.length += 1;
            sh.chainPos = ch.length;
            if (sh.volley !== ch.volley) ch.carries += 1;
          }
          ev.push({ k: 'ignite', shell: sh, chain: q.chain, x: sx, y: sy, by: q.shell });
        } else if (track && d2 < sh.minD2 && d2 < NEAR_R2) {
          sh.minD2 = d2; sh.nearX = cx; sh.nearY = cy;
        }
      }
    }
    // Remove spent sparks, keeping order (order decides ties, so it must not depend on removal).
    var w = 0;
    for (var ri = 0; ri < sparks.length; ri++) {
      var sp = sparks[ri];
      if (sp.age < sp.life) sparks[w++] = sp;
    }
    sparks.length = w;
    return ev;
  };

  /** True while any spark is alive or any shell waits on its fuse. */
  Model.prototype.busy = function () {
    if (this.sparks.length || this.pending) return true;
    for (var i = 0; i < this.shells.length; i++) if (this.shells[i].state === FUSE) return true;
    return false;
  };

  /** Drop shells that are gone for good, to keep the per-step loops short. */
  Model.prototype.prune = function (keepAfterStep) {
    var w = 0, list = this.shells;
    for (var i = 0; i < list.length; i++) {
      var sh = list[i];
      var done = (sh.state === BURST && sh.burstStep < keepAfterStep) || (sh.state === DUD && sh.dudStep < keepAfterStep);
      if (!done) list[w++] = sh;
    }
    list.length = w;
  };

  /**
   * The validation used by the generator: open one shell of an isolated volley at a step and count the
   * shells lit. specs are shell specs (makeShell input).
   */
  function trialOpening(specs, index, step, grade) {
    var m = new Model({ step: step - 1, keepBursts: false });
    for (var i = 0; i < specs.length; i++) m.add(makeShell(specs[i]));
    var target = m.shells[index];
    // Bring the volley to the step before the opening without sparks (states only).
    var t0 = (step - 1) * DT;
    for (i = 0; i < m.shells.length; i++) {
      var sh = m.shells[i];
      if (t0 >= sh.launchT) sh.state = t0 >= sh.deadT ? DUD : AIR;
    }
    if (!m.open(target, grade)) return 0;
    var guard = 0;
    do {
      m.advance();
      guard++;
    } while (m.busy() && guard < 600);
    var lit = 0;
    for (i = 0; i < m.shells.length; i++) if (m.shells[i].state === BURST) lit++;
    return lit;
  }

  var api = {
    DT: DT, G: G, LAUNCH_Y: LAUNCH_Y, ARM_Y: ARM_Y, LIVE_AFTER: LIVE_AFTER, FUSE_STEPS: FUSE_STEPS, HIT_R: HIT_R,
    WORLD_W: WORLD_W, WORLD_H: WORLD_H, DIRS: DIRS, NDIR: NDIR,
    WAIT: WAIT, AIR: AIR, FUSE: FUSE, BURST: BURST, DUD: DUD,
    TYPES: TYPES, TYPE_INDEX: TYPE_INDEX, GRADE: GRADE, PERFECT_WINDOW: PERFECT_WINDOW, GOOD_WINDOW: GOOD_WINDOW,
    gradeFor: gradeFor, makeShell: makeShell, shellX: shellX, shellY: shellY, shellVY: shellVY,
    burstSparks: burstSparks, stepSpark: stepSpark, Model: Model, trialOpening: trialOpening
  };
  Sky.model = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
