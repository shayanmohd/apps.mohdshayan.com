/*
 * Frame pacing: draw at most about 60 frames a second on any display. On a 120 Hz phone every other
 * frame is skipped; on 90 Hz the draws alternate one and two frames apart, which still averages 60.
 * Taps never wait for a frame: they carry their own event time (see main.js and Show.advanceTo).
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};

  var EARLY_MS = 4; // a vsync this close before the due time still draws

  function Pacer(fps) {
    this.interval = 1000 / fps;
    this.next = -Infinity;
  }
  /** True when the frame at timestamp ms (milliseconds) should draw. */
  Pacer.prototype.due = function (ms) {
    if (ms < this.next - EARLY_MS) return false;
    // After a stall, start again from now rather than drawing a burst of late frames.
    this.next = Math.max(this.next + this.interval, ms);
    return true;
  };

  var api = { Pacer: Pacer };
  Sky.pace = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
