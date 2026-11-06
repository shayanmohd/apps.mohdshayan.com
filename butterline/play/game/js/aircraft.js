/*
 * The three generic aircraft. Speeds and distances are game scale (metres, seconds); the HUD shows knots
 * and feet. derive() solves each aircraft's trim on its glide path, so tuning one number never breaks
 * the approach.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).aircraft = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var G = 9.81;
  var DEG = Math.PI / 180;

  var LIST = [
    {
      id: 'bush',
      vref: 26, glideDeg: 5.0,
      clMax: 2.0, clRef: 1.2, alpha0Deg: -6, cla: 5.2,
      cd0: 0.05, k: 0.05,
      pitchRangeDeg: 14, pTrim: 0.04, pUp: 1.6, pDown: 1.3, tauPitch: 0.12,
      geSpan: 9, geLift: 0.3, geDrag: 0.4, spool: 0.6,
      retardH: 6, brake: 5.0, roll: 0.03, baseRunway: 300,
      tailDeg: 12, dumpers: 1, unlock: 0
    },
    {
      id: 'turboprop',
      vref: 34, glideDeg: 3.5,
      clMax: 2.3, clRef: 1.35, alpha0Deg: -5, cla: 5.5,
      cd0: 0.045, k: 0.05,
      pitchRangeDeg: 12, pTrim: 0.06, pUp: 1.35, pDown: 1.1, tauPitch: 0.18,
      geSpan: 13, geLift: 0.12, geDrag: 0.4, spool: 1.0,
      retardH: 8, brake: 5.5, roll: 0.025, baseRunway: 480,
      tailDeg: 11, dumpers: 1, unlock: 10
    },
    {
      id: 'jet',
      vref: 44, glideDeg: 3.0,
      clMax: 2.4, clRef: 1.4, alpha0Deg: -3, cla: 5.8,
      cd0: 0.035, k: 0.045,
      pitchRangeDeg: 11, pTrim: 0.08, pUp: 1.0, pDown: 0.85, tauPitch: 0.25,
      geSpan: 15, geLift: 0.14, geDrag: 0.45, spool: 1.8,
      retardH: 10, brake: 6.0, roll: 0.02, baseRunway: 700,
      tailDeg: 10, dumpers: 0.6, unlock: 25
    }
  ];

  function liftCoef(ac, alpha) {
    if (alpha <= ac.alphaStall) return ac.cla * (alpha - ac.alpha0);
    // Past the critical angle the lift falls away quickly, to 60 percent of the maximum.
    return Math.max(ac.clMax * 0.6, ac.clMax - (alpha - ac.alphaStall) * ac.cla * 1.5);
  }

  /**
   * Trim for a steady descent at flight path angle gammaAir (to the air mass) at the approach speed:
   * angle of attack, pitch and the thrust that holds it.
   */
  function trim(ac, gammaAir) {
    var q = ac.kL * ac.vref * ac.vref;
    var cl = ac.clRef;
    var thrust = 0;
    var alpha = ac.alpha0 + cl / ac.cla;
    for (var i = 0; i < 30; i++) {
      alpha = ac.alpha0 + cl / ac.cla;
      var drag = q * (ac.cd0 + ac.k * cl * cl);
      thrust = (drag + G * Math.sin(gammaAir)) / Math.cos(alpha);
      cl = (G * Math.cos(gammaAir) - thrust * Math.sin(alpha)) / q;
    }
    var theta = gammaAir + alpha;
    return { alpha: alpha, cl: cl, thrust: Math.max(0, thrust), theta: theta, thetaLo: theta - ac.pTrim * ac.pitchRange };
  }

  /** Fills in the derived numbers: lift factor, stall angle and the still-air trim. */
  function derive(base) {
    var ac = {};
    for (var key in base) if (Object.prototype.hasOwnProperty.call(base, key)) ac[key] = base[key];
    ac.glide = ac.glideDeg * DEG;
    ac.alpha0 = ac.alpha0Deg * DEG;
    ac.pitchRange = ac.pitchRangeDeg * DEG;
    ac.alphaStall = ac.alpha0 + ac.clMax / ac.cla;
    ac.tail = ac.tailDeg * DEG;
    ac.kL = G / (ac.vref * ac.vref * ac.clRef);
    var t = trim(ac, -ac.glide);
    ac.alphaTrim = t.alpha;
    ac.clTrim = t.cl;
    ac.thrustApp = t.thrust;
    ac.thetaTrim = t.theta;
    ac.thetaLo = t.thetaLo;
    ac.vstall = ac.vref * Math.sqrt(ac.clRef / ac.clMax);
    return ac;
  }

  var BY_ID = {};
  var DERIVED = LIST.map(function (a) {
    var d = derive(a);
    BY_ID[d.id] = d;
    return d;
  });

  return {
    G: G,
    DEG: DEG,
    list: DERIVED,
    ids: DERIVED.map(function (a) { return a.id; }),
    get: function (id) { return BY_ID[id] || DERIVED[0]; },
    liftCoef: liftCoef,
    trim: trim,
    derive: derive
  };
});
