/*
 * A simple autopilot that flies the same one input a player has. It flies the menu's attract scene and
 * the unit tests (every aircraft must be landable at every airport). It reads only what a player can
 * see: height, sink, speed, the glide path, the stall shaker.
 *
 * The input is on or off, so the pilot works out the pitch command it wants and holds while the real
 * command is below it, as a player feathering the thumb does.
 */
(function (root, factory) {
  var node = typeof require === 'function' && typeof module === 'object';
  var m = factory(node ? require('./sim.js') : root.BL.sim);
  if (node && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).pilot = m;
})(typeof self !== 'undefined' ? self : this, function (sim) {
  'use strict';

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /**
   * opts: flare (seconds: the flare follows a sink of height / flare), touch (m/s of sink it aims to
   * touch with), brakeDelay (s after the nose is down), late (m: flares this much lower, a sloppy pilot).
   */
  function make(opts) {
    opts = opts || {};
    var flareTau = opts.flare || 0.9;
    var touch = opts.touch == null ? 0.12 : opts.touch;
    var brakeDelay = opts.brakeDelay == null ? 0.1 : opts.brakeDelay;
    var late = opts.late || 0;
    var noseAt = -1;
    var integ = 0;
    var flaring = false;
    var lastT = -1;
    return function decide(f) {
      var ac = f.ac;
      var dt = lastT < 0 ? 1 / 120 : Math.max(0, f.t - lastT);
      lastT = f.t;
      if (f.phase === 'ground' || f.contact) {
        if (!f.noseDown) return false;
        if (noseAt < 0) noseAt = f.t;
        return f.t - noseAt >= brakeDelay;
      }
      noseAt = -1;
      var sinkGlide = f.vx * Math.tan(ac.glide);
      var flareH = Math.max(1.2, sinkGlide * flareTau * 1.5) - late;
      var want;
      if (!flaring && f.hr > flareH) {
        var err = f.h - sim.glideAt(f, f.x);
        want = -sinkGlide - 0.35 * err;
        if (f.airspeed < ac.vref * 0.88) want -= 1;
      } else {
        if (!flaring) { flaring = true; integ = 0; }
        want = -Math.max(touch, f.hr / flareTau);
      }
      var slope = f.x >= 0 && f.x <= f.rw.end ? f.ap.slope : 0;
      var e = want - (flaring ? f.vz - f.vx * slope : f.vz);
      integ = clamp(integ + e * dt, -1, 2);
      var pWant = clamp(ac.pTrim + 0.45 * e + (flaring ? 0.35 * integ : 0.1 * integ), 0, 1);
      if (f.alpha > ac.alphaStall - 3 * Math.PI / 180) return false;
      return f.p < pWant;
    };
  }

  return { make: make };
});
