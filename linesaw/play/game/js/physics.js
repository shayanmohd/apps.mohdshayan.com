/*
 * The sky's physics, stepped at a fixed 120 Hz. Two kites at most (side 0 flies from the left rooftop,
 * side 1 from the right), each a point with a heading on a 14 segment verlet line pinned at the hand and
 * the kite. Crossing lines catch and start a duel (pench); the first line to wear through is cut.
 *
 * Deterministic: the same world options and the same holds per step give the same sky to the last bit.
 * Wind and gusts come from rng.js only. Nothing here reads the screen, the clock or Math.random.
 *
 * World units: the sky is W wide and H tall, y up from the roofline (y 0). Heading 0 points up and grows
 * clockwise, so the nose is (sin th, cos th).
 */
(function (root, factory) {
  var node = typeof require === 'function' && typeof module === 'object';
  var m = factory(node ? require('./rng.js') : root.LS.rng);
  if (node && module.exports) module.exports = m;
  else (root.LS = root.LS || {}).physics = m;
})(typeof self !== 'undefined' ? self : this, function (rng) {
  'use strict';

  var DT = 1 / 120;
  var W = 90, H = 150;
  var WALL = 4, FLOOR = 7, CEIL = 146;
  var DART = 42;            // units per second while pulled
  var DART_ENGAGED = 26;    // while the lines are crossed
  var SINK = 5;             // slack sink rate
  var SPIN = 200 * Math.PI / 180; // slack nose turn rate, radians per second
  var SEGS = 14;            // line segments
  var LINE_G = 40;          // line sag gravity
  var CONTACT_KEEP = 2;     // an engaged duel holds while the lines stay this close
  var SLIP_TIME = 0.3;      // seconds apart before a duel ends without a cut
  var SAW_K = 0.5;          // wear per second at full saw and a square crossing
  var SLACK_SAW = 0.35;
  var HEAT_UP = 1.0;        // seconds of pulling to full heat (only while crossed)
  var HEAT_DOWN = 0.45;     // seconds of slack to cool fully
  var WEAR_HEAL = 0.15;     // wear lost per second out of a duel
  var KITE_SIZE = 7;

  var TWO_PI = Math.PI * 2;
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function wrap(a) {
    a = a % TWO_PI;
    if (a > Math.PI) a -= TWO_PI;
    else if (a <= -Math.PI) a += TWO_PI;
    return a;
  }

  /**
   * opts: seed (uint32), wind {base, amp, gustEvery, gustMag, symmetric}, liftBelow (an updraft below this
   * height, for the menu's sky). symmetric: gusts blow either way at random, for the two-player sky.
   * Gusts are laid out once from the seed.
   */
  function createWorld(opts) {
    opts = opts || {};
    var seed = opts.seed >>> 0;
    var w = opts.wind || {};
    var r = rng.make(rng.mix32(seed ^ 0x9e3779b9));
    var gusts = [];
    var every = w.gustEvery || 11;
    var mag = w.gustMag == null ? 6 : w.gustMag;
    var t = 4 + r.range(0, every);
    while (t < 400) {
      var sign = w.symmetric ? r.sign() : 1;
      gusts.push({ t0: t, dur: 2 + r.range(0, 1.5), mag: sign * mag * (0.7 + 0.6 * r.next()) });
      t += every * (0.7 + 0.6 * r.next());
    }
    return {
      seed: seed, t: 0, steps: 0,
      wind: { base: w.base || 0, amp: w.amp == null ? 2 : w.amp, noiseSeed: rng.mix32(seed + 77), gusts: gusts, now: w.base || 0, gust: 0 },
      kites: [null, null],
      duel: null,
      converge: 0,
      liftBelow: opts.liftBelow || 0,
      events: [],
      contact: { x: 0, y: 0, ia: 0, ib: 0, ua: 0, ub: 0 }
    };
  }

  /** Wind along x at world time t (positive blows to the right). */
  function windAt(world, t) {
    var w = world.wind;
    var g = 0;
    for (var i = 0; i < w.gusts.length; i++) {
      var q = w.gusts[i];
      if (q.t0 > t) break;
      if (t < q.t0 + q.dur) g += q.mag * Math.sin(Math.PI * (t - q.t0) / q.dur);
    }
    return { x: w.base + w.amp * rng.noise1(w.noiseSeed, t / 6) + g, gust: g };
  }

  /**
   * A kite parked on its rooftop at hand (x, y 0). opts: hand (x), saw (strength multiplier, 1 for
   * players), pattern (paper), spin (+1 clockwise or -1; by default the left side turns clockwise and
   * the right side the other way, mirrored so both sides handle alike).
   */
  function addKite(world, side, opts) {
    opts = opts || {};
    var hx = opts.hand == null ? (side === 0 ? 24 : 66) : opts.hand;
    var k = {
      side: side, hx: hx, hy: 0,
      x: hx, y: FLOOR, vx: 0, vy: 0, th: 0, om: 0,
      spinDir: opts.spin || (side === 0 ? 1 : -1),
      parked: true, hold: false, engaged: false,
      heat: 0, wear: 0, saw: opts.saw == null ? 1 : opts.saw, pattern: opts.pattern || 0,
      len: FLOOR + 1,
      px: new Float64Array(SEGS + 1), py: new Float64Array(SEGS + 1),
      qx: new Float64Array(SEGS + 1), qy: new Float64Array(SEGS + 1),
      airTime: 0, held: 0
    };
    for (var i = 0; i <= SEGS; i++) {
      var f = i / SEGS;
      k.px[i] = k.qx[i] = hx;
      k.py[i] = k.qy[i] = FLOOR * f;
    }
    world.kites[side] = k;
    return k;
  }

  function removeKite(world, side) {
    if (world.duel) world.duel = null;
    var other = world.kites[1 - side];
    if (other) other.engaged = false;
    world.kites[side] = null;
  }

  function emit(world, type, data) {
    world.events.push({ type: type, t: world.t, data: data || null });
  }

  function stepKite(world, k, hold, dt, windX) {
    if (k.parked) {
      if (!hold) return;
      k.parked = false;
      k.vy = 18;
      emit(world, 'launch', { side: k.side });
    }
    k.hold = !!hold;
    k.airTime += dt;
    if (hold) k.held += dt;
    var nx = Math.sin(k.th), ny = Math.cos(k.th);
    var conv = world.converge * (k.side === 0 ? 1 : -1);
    var tvx, tvy, tau;
    if (hold) {
      k.om += (0 - k.om) * (1 - Math.exp(-dt / 0.06));
      var sp = k.engaged ? DART_ENGAGED : DART;
      tvx = nx * sp + windX * 0.25 + conv * 0.5;
      tvy = ny * sp;
      tau = 0.16;
    } else {
      k.om += (k.spinDir * SPIN - k.om) * (1 - Math.exp(-dt / 0.25));
      var low = clamp((k.y - FLOOR) / 12, 0, 1);
      tvx = windX * (k.engaged ? 0.4 : 1) + conv;
      tvy = -SINK * low;
      tau = 0.5;
    }
    var a = 1 - Math.exp(-dt / tau);
    k.vx += (tvx - k.vx) * a;
    k.vy += (tvy - k.vy) * a;
    k.th = wrap(k.th + k.om * dt);
    k.x += k.vx * dt;
    k.y += k.vy * dt;
    if (k.x < WALL) { k.x = WALL; if (k.vx < 0) k.vx = 0; }
    if (k.x > W - WALL) { k.x = W - WALL; if (k.vx > 0) k.vx = 0; }
    if (k.y < FLOOR) { k.y = FLOOR; if (k.vy < 0) k.vy = 0; }
    if (k.y > CEIL) { k.y = CEIL; if (k.vy > 0) k.vy = 0; }
    // An updraft (the menu's sky only) keeps kites above the given height.
    if (world.liftBelow && k.y < world.liftBelow) k.vy = Math.max(k.vy, (world.liftBelow - k.y) * 1.5);
  }

  function stepLine(k, dt, windX) {
    var dx = k.x - k.hx, dy = k.y - k.hy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var target = Math.max(dist, 1) * (k.hold ? 1.01 : 1.07) + 1;
    k.len += (target - k.len) * (1 - Math.exp(-dt / 0.12));
    if (k.len < dist) k.len = dist;
    var rest = k.len / SEGS;
    var gx = windX * 0.6 * dt * dt, gy = -LINE_G * dt * dt;
    var px = k.px, py = k.py, qx = k.qx, qy = k.qy;
    for (var i = 1; i < SEGS; i++) {
      var vx = (px[i] - qx[i]) * 0.9, vy = (py[i] - qy[i]) * 0.9;
      qx[i] = px[i]; qy[i] = py[i];
      px[i] += vx + gx;
      py[i] += vy + gy;
    }
    qx[0] = px[0]; qy[0] = py[0];
    qx[SEGS] = px[SEGS]; qy[SEGS] = py[SEGS];
    px[0] = k.hx; py[0] = k.hy;
    px[SEGS] = k.x; py[SEGS] = k.y;
    relax(k, rest, 8);
  }

  function relax(k, rest, iters) {
    var px = k.px, py = k.py;
    for (var it = 0; it < iters; it++) {
      for (var i = 0; i < SEGS; i++) {
        var ax = px[i], ay = py[i], bx = px[i + 1], by = py[i + 1];
        var dx = bx - ax, dy = by - ay;
        var d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        var diff = (d - rest) / d;
        var wa = i === 0 ? 0 : 0.5, wb = i + 1 === SEGS ? 0 : 0.5;
        if (wa === 0 && wb === 0) continue;
        var s = wa + wb;
        var mx = dx * diff, my = dy * diff;
        px[i] += mx * (wa / s);
        py[i] += my * (wa / s);
        px[i + 1] -= mx * (wb / s);
        py[i + 1] -= my * (wb / s);
      }
      px[0] = k.hx; py[0] = k.hy;
      px[SEGS] = k.x; py[SEGS] = k.y;
      // Lines rest on the roofline at worst, never under it.
      for (var j = 1; j < SEGS; j++) if (py[j] < 0) py[j] = 0;
    }
  }

  // ---- crossings ----

  var hit = { u: 0, v: 0 };
  function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
    var rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    var den = rx * sy - ry * sx;
    if (den === 0) return false;
    var qx = cx - ax, qy = cy - ay;
    var u = (qx * sy - qy * sx) / den;
    var v = (qx * ry - qy * rx) / den;
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    hit.u = u; hit.v = v;
    return true;
  }

  /** Where the two lines cross (segment intersection), written into world.contact; false if they do not. */
  function findCross(world, a, b) {
    var c = world.contact;
    for (var i = 0; i < SEGS; i++) {
      var ax = a.px[i], ay = a.py[i], bx = a.px[i + 1], by = a.py[i + 1];
      for (var j = 0; j < SEGS; j++) {
        if (segCross(ax, ay, bx, by, b.px[j], b.py[j], b.px[j + 1], b.py[j + 1])) {
          c.ia = i; c.ib = j; c.ua = hit.u; c.ub = hit.v;
          c.x = ax + (bx - ax) * hit.u;
          c.y = ay + (by - ay) * hit.u;
          return true;
        }
      }
    }
    return false;
  }

  var near = { d2: 0, t: 0 };
  function pointSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    var t = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    var ex = ax + dx * t - px, ey = ay + dy * t - py;
    near.d2 = ex * ex + ey * ey;
    near.t = t;
  }

  /** The closest approach of the two lines, written into world.contact; false past CONTACT_KEEP. */
  function findNear(world, a, b) {
    var best = CONTACT_KEEP * CONTACT_KEEP;
    var found = false;
    var c = world.contact;
    for (var i = 0; i < SEGS; i++) {
      var ax = a.px[i], ay = a.py[i], bx = a.px[i + 1], by = a.py[i + 1];
      for (var j = 0; j < SEGS; j++) {
        var cx = b.px[j], cy = b.py[j], dx = b.px[j + 1], dy = b.py[j + 1];
        // Each pair's closest points lie at an endpoint of one of the two segments (no crossing here).
        pointSeg(ax, ay, cx, cy, dx, dy);
        if (near.d2 < best) { best = near.d2; found = true; c.ia = i; c.ua = 0; c.ib = j; c.ub = near.t; }
        pointSeg(bx, by, cx, cy, dx, dy);
        if (near.d2 < best) { best = near.d2; found = true; c.ia = i; c.ua = 1; c.ib = j; c.ub = near.t; }
        pointSeg(cx, cy, ax, ay, bx, by);
        if (near.d2 < best) { best = near.d2; found = true; c.ib = j; c.ub = 0; c.ia = i; c.ua = near.t; }
        pointSeg(dx, dy, ax, ay, bx, by);
        if (near.d2 < best) { best = near.d2; found = true; c.ib = j; c.ub = 1; c.ia = i; c.ua = near.t; }
      }
    }
    if (found) {
      var pax = a.px[c.ia] + (a.px[c.ia + 1] - a.px[c.ia]) * c.ua;
      var pay = a.py[c.ia] + (a.py[c.ia + 1] - a.py[c.ia]) * c.ua;
      var pbx = b.px[c.ib] + (b.px[c.ib + 1] - b.px[c.ib]) * c.ub;
      var pby = b.py[c.ib] + (b.py[c.ib + 1] - b.py[c.ib]) * c.ub;
      c.x = (pax + pbx) / 2;
      c.y = (pay + pby) / 2;
    }
    return found;
  }

  /** Pulls both lines towards the contact, so engaged lines bend to it and stay caught. */
  function hook(k, i, u, cx, cy) {
    var ax = k.px[i], ay = k.py[i], bx = k.px[i + 1], by = k.py[i + 1];
    var ex = cx - (ax + (bx - ax) * u), ey = cy - (ay + (by - ay) * u);
    if (i > 0) { k.px[i] += ex * (1 - u) * 0.6; k.py[i] += ey * (1 - u) * 0.6; }
    if (i + 1 < SEGS) { k.px[i + 1] += ex * u * 0.6; k.py[i + 1] += ey * u * 0.6; }
  }

  function segAngle(k, i) {
    return Math.atan2(k.py[i + 1] - k.py[i], k.px[i + 1] - k.px[i]);
  }

  /** Saw strength of kite k on the other line this step. */
  function sawPower(k) {
    var sp = Math.sqrt(k.vx * k.vx + k.vy * k.vy);
    return (k.hold ? 1 : SLACK_SAW) * (0.5 + 0.5 * Math.min(1, sp / DART_ENGAGED));
  }

  function selfWear(k) {
    return k.hold ? 0.04 + 0.9 * k.heat * k.heat : 0;
  }

  function stepDuel(world, a, b, dt) {
    var crossed = findCross(world, a, b);
    var d = world.duel;
    if (!d) {
      if (!crossed || a.parked || b.parked) return;
      d = world.duel = {
        t0: world.t, time: 0, apart: 0, x: world.contact.x, y: world.contact.y, angle: 0,
        below: a.y < b.y ? 0 : 1 // the side whose kite was lower when the lines caught
      };
      a.engaged = b.engaged = true;
      emit(world, 'duelStart', { x: d.x, y: d.y, below: d.below });
    } else if (!crossed && !findNear(world, a, b)) {
      d.apart += dt;
      d.time += dt;
      if (d.apart >= SLIP_TIME) {
        world.duel = null;
        a.engaged = b.engaged = false;
        emit(world, 'duelEnd', { time: d.time });
        return;
      }
      wearStep(world, a, b, d, dt);
      return;
    }
    var c = world.contact;
    d.apart = 0;
    d.x = c.x;
    d.y = c.y;
    d.ia = c.ia; d.ib = c.ib;
    d.angle = segAngle(a, c.ia) - segAngle(b, c.ib);
    hook(a, c.ia, c.ua, c.x, c.y);
    hook(b, c.ib, c.ub, c.x, c.y);
    d.time += dt;
    wearStep(world, a, b, d, dt);
  }

  function wearStep(world, a, b, d, dt) {
    var angleF = 0.4 + 0.6 * Math.abs(Math.sin(d.angle));
    var sa = sawPower(a) * a.saw, sb = sawPower(b) * b.saw;
    d.sawA = sa; d.sawB = sb;
    a.heat = a.hold ? Math.min(1, a.heat + dt / HEAT_UP) : Math.max(0, a.heat - dt / HEAT_DOWN);
    b.heat = b.hold ? Math.min(1, b.heat + dt / HEAT_UP) : Math.max(0, b.heat - dt / HEAT_DOWN);
    a.wear += dt * (SAW_K * angleF * sb + selfWear(a));
    b.wear += dt * (SAW_K * angleF * sa + selfWear(b));
    if (a.wear < 1 && b.wear < 1) return;
    var loser;
    if (a.wear >= 1 && b.wear >= 1) {
      // Both through in the same step: the more worn line goes, then the hotter, then the lower kite.
      loser = a.wear !== b.wear ? (a.wear > b.wear ? 0 : 1) : a.heat !== b.heat ? (a.heat > b.heat ? 0 : 1) : (a.y < b.y ? 0 : 1);
    } else {
      loser = a.wear >= 1 ? 0 : 1;
    }
    var lk = loser === 0 ? a : b;
    var wk = loser === 0 ? b : a;
    var seg = loser === 0 ? d.ia : d.ib;
    world.duel = null;
    a.engaged = b.engaged = false;
    // The cut kite leaves the world at once: its worn line never catches again.
    world.kites[loser] = null;
    emit(world, 'cut', {
      loser: loser, winner: 1 - loser, x: d.x, y: d.y, time: d.time, below: d.below,
      seg: seg == null ? Math.floor(SEGS / 2) : seg,
      line: { px: Array.prototype.slice.call(lk.px), py: Array.prototype.slice.call(lk.py) },
      kite: { x: lk.x, y: lk.y, vx: lk.vx, vy: lk.vy, th: lk.th, om: lk.om, pattern: lk.pattern, side: lk.side },
      winnerWear: wk.wear
    });
  }

  /** One fixed step of 1/120 s. holds: [left hold, right hold] this step. Events go to world.events. */
  function step(world, holds) {
    var dt = DT;
    var wind = windAt(world, world.t);
    world.wind.now = wind.x;
    world.wind.gust = wind.gust;
    var a = world.kites[0], b = world.kites[1];
    if (a) stepKite(world, a, holds && holds[0], dt, wind.x);
    if (b) stepKite(world, b, holds && holds[1], dt, wind.x);
    if (a) stepLine(a, dt, wind.x);
    if (b) stepLine(b, dt, wind.x);
    if (a && b) {
      stepDuel(world, a, b, dt);
    } else if (world.duel) {
      world.duel = null;
    }
    // Out of a duel lines cool and slowly mend.
    for (var s = 0; s < 2; s++) {
      var k = world.kites[s];
      if (k && !world.duel) {
        k.heat = Math.max(0, k.heat - dt / HEAT_DOWN);
        k.wear = Math.max(0, k.wear - dt * WEAR_HEAL);
      }
    }
    world.t += dt;
    world.steps++;
    return world;
  }

  function nose(k) {
    return { x: Math.sin(k.th), y: Math.cos(k.th) };
  }

  /** Heading that points from (x, y) towards (tx, ty), in the nose convention. */
  function headingTo(x, y, tx, ty) {
    return Math.atan2(tx - x, ty - y);
  }

  return {
    DT: DT, W: W, H: H, WALL: WALL, FLOOR: FLOOR, CEIL: CEIL, DART: DART, DART_ENGAGED: DART_ENGAGED,
    SPIN: SPIN, SEGS: SEGS, SAW_K: SAW_K, SLACK_SAW: SLACK_SAW, HEAT_UP: HEAT_UP, HEAT_DOWN: HEAT_DOWN,
    SLIP_TIME: SLIP_TIME, KITE_SIZE: KITE_SIZE,
    createWorld: createWorld, addKite: addKite, removeKite: removeKite, step: step, windAt: windAt,
    nose: nose, headingTo: headingTo, wrap: wrap, sawPower: sawPower
  };
});
