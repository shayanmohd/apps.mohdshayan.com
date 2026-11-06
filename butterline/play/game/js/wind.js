/*
 * The air over the approach: stacked bands of wind, a shear near the ground, gust fronts that drift with
 * the wind, sinking (and sometimes rising) pockets, and a little turbulence. buildAir() makes it from a
 * seed; sample() reads it at any (x, h, t). Pure and deterministic.
 *
 * Convention: wx > 0 is air moving down the runway (a tailwind); a headwind is negative. wz > 0 rises.
 */
(function (root, factory) {
  var m = factory(typeof require === 'function' && typeof module === 'object' ? require('./rng.js') : root.BL.rng);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).wind = m;
})(typeof self !== 'undefined' ? self : this, function (rng) {
  'use strict';

  var BAND_TOPS = [5, 14, 28, 50];
  var BAND_SHAPE = [1.0, 1.1, 1.2, 1.25, 1.3];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /** The numbers behind one wind step, before any randomness (unit tested against GAME-DESIGN.md). */
  function stepParams(airport, step, tutorial) {
    var w = airport.wind;
    var s = Math.max(0, step);
    var p = {
      headwind: Math.min(15, w.base + 0.9 * s),
      shear: Math.min(0.75, w.shear + 0.03 * s),
      gusts: s < 1 ? 0 : Math.min(4, 1 + Math.floor((s - 1) / 2) + (w.gustBias >= 1 ? 1 : 0)),
      gustAmp: Math.min(7, 1.5 + 0.7 * s),
      pockets: s < 2 ? 0 : Math.min(3, Math.floor(s / 2)),
      pocketWz: Math.min(2.2, 0.6 + 0.2 * s),
      turb: Math.min(1.1, 0.15 + 0.1 * s),
      tailAloft: !!w.tailAloft || s >= 4,
      ridge: w.ridge ? 0.7 + 0.15 * s : 0
    };
    if (tutorial) {
      p.headwind = 2;
      p.shear = 0.15;
      p.gusts = 0;
      p.pockets = 0;
      p.turb = 0.08;
      p.tailAloft = false;
      p.ridge = 0;
    }
    return p;
  }

  /**
   * opts: seed (uint32), airport, aircraft, rw (runway), step, tutorial, xStart (where the approach
   * starts), groundSpeed (roughly, to place gusts where the aircraft will meet them).
   */
  function buildAir(opts) {
    var r = rng.make(opts.seed >>> 0);
    var ac = opts.aircraft;
    var p = stepParams(opts.airport, opts.step || 0, opts.tutorial);
    var bands = [];
    for (var i = 0; i < BAND_SHAPE.length; i++) {
      var wx = -p.headwind * BAND_SHAPE[i] * (1 + r.range(-0.15, 0.15));
      if (p.tailAloft && i >= 3) wx = p.headwind * (0.1 + 0.03 * Math.min(8, opts.step || 0)) * r.range(0.8, 1.1);
      bands.push({ bottom: i === 0 ? 0 : BAND_TOPS[i - 1], top: i < BAND_TOPS.length ? BAND_TOPS[i] : 90, wx: wx });
    }
    var xStart = opts.xStart;
    var xAim = opts.rw.aim;
    var span = xAim - xStart;
    var vg = Math.max(10, opts.groundSpeed || ac.vref - p.headwind);
    var scale = ac.vref / 30;
    var drift = bands[1].wx;

    function meet(frac) {
      var x = xStart + span * frac;
      var t = (x - xStart) / vg;
      return { x: x, t: t };
    }

    var gusts = [];
    for (i = 0; i < p.gusts; i++) {
      var m = meet(r.range(0.25, 0.97));
      var amp = p.gustAmp * r.range(0.7, 1.1) * (r.chance(0.55) ? -1 : 1);
      gusts.push({ x0: m.x - drift * m.t, c: drift, w: r.range(25, 55) * scale, amp: amp, top: r.range(15, 40) });
    }

    var pockets = [];
    for (i = 0; i < p.pockets; i++) {
      var mp = meet(r.range(0.2, 0.8));
      var lift = r.chance(0.25);
      pockets.push({
        x0: mp.x - drift * mp.t, c: drift, w: r.range(40, 80) * scale,
        wz: (lift ? 0.6 : -1) * p.pocketWz * r.range(0.8, 1.1),
        bottom: (opts.step || 0) >= 6 ? 0 : 2, top: r.range(18, 45)
      });
    }
    if (p.ridge) {
      // The mountain strip: rising air on the far slope, then sink in the lee of the ridge before the threshold.
      pockets.push({ x0: -0.55 * span, c: 0, w: 0.16 * span, wz: 0.5 * p.ridge, bottom: 0, top: 60 });
      pockets.push({ x0: -0.12 * span, c: 0, w: 0.14 * span, wz: -p.ridge, bottom: 0, top: 40 });
    }

    return {
      seed: opts.seed >>> 0,
      step: opts.step || 0,
      params: p,
      bands: bands,
      shear: p.shear,
      shearH: 7,
      gusts: gusts,
      pockets: pockets,
      turb: p.turb,
      drift: drift
    };
  }

  function bandWind(air, h) {
    var b = air.bands;
    var wx = b[0].wx;
    for (var i = 0; i < b.length - 1; i++) {
      var top = b[i].top;
      wx += (b[i + 1].wx - b[i].wx) * smoothstep(top - 2, top + 2, h);
    }
    return wx;
  }

  /** Wind at (x, h) at time t. Writes into out (reused to avoid garbage) and returns it. */
  function sample(air, x, h, t, out) {
    out = out || {};
    var wx = bandWind(air, h);
    var s = clamp(h / air.shearH, 0, 1);
    wx *= 1 - air.shear * (1 - s) * (1 - s);
    var gust = 0;
    for (var i = 0; i < air.gusts.length; i++) {
      var g = air.gusts[i];
      var d = (x - g.x0 - g.c * t) / g.w;
      if (d > -1 && d < 1) {
        var b = 1 - d * d;
        var hf = h < g.top ? 1 : Math.max(0, 1 - (h - g.top) / 8);
        gust += g.amp * b * b * hf;
      }
    }
    wx += gust;
    var wz = 0;
    for (i = 0; i < air.pockets.length; i++) {
      var pk = air.pockets[i];
      var dp = (x - pk.x0 - pk.c * t) / pk.w;
      if (dp > -1 && dp < 1) {
        var bp = 1 - dp * dp;
        var vf = smoothstep(pk.bottom, pk.bottom + 3, h) * (1 - smoothstep(pk.top - 5, pk.top, h));
        wz += pk.wz * bp * bp * vf;
      }
    }
    var u = x - air.drift * t;
    var near = smoothstep(0, 4, h);
    wx += air.turb * rng.noise1(air.seed, u / 16) * (0.4 + 0.6 * near);
    wz = (wz + air.turb * 0.5 * rng.noise1(air.seed ^ 0x5bd1e995, u / 9)) * near;
    out.wx = wx;
    out.wz = wz;
    out.gust = gust;
    return out;
  }

  return { BAND_TOPS: BAND_TOPS, stepParams: stepParams, buildAir: buildAir, sample: sample, bandWind: bandWind };
});
