/*
 * Photosensitivity guard (WCAG 2.3.1): every burst lights only its own patch of sky, and a large flash
 * is allowed at most [max] times in any one second. Bursts past the limit are drawn without their flash.
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};

  function Limiter(max, windowSeconds) {
    this.max = max || 3;
    this.window = windowSeconds || 1;
    this.times = [];
  }

  /** Asks for one large flash at time t (seconds). True when it may be drawn. */
  Limiter.prototype.allow = function (t) {
    var list = this.times;
    while (list.length && list[0] <= t - this.window) list.shift();
    if (list.length >= this.max) return false;
    list.push(t);
    return true;
  };

  Limiter.prototype.reset = function () { this.times.length = 0; };

  /** How strong a burst's flash is, from the settings: full, or dimmed and softened. */
  function flashStrength(reducedFlash, factor) {
    var base = factor > 1.1 ? 1 : 0.8;
    return reducedFlash ? base * 0.35 : base;
  }

  var api = { Limiter: Limiter, flashStrength: flashStrength };
  Sky.flash = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
