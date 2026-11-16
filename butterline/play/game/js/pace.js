/*
 * Frame pacing and timed input. The game draws at most about 60 frames a second on any display (a 120 Hz
 * phone skips every other frame; 90 Hz alternates one and two frames apart, which still averages 60), and
 * the thumb is judged by each event's own time, never by the frame's, so a flare flies the same at any
 * frame rate (WEBGAME-RECIPE.md section 2b).
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).pace = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EARLY_MS = 4; // a vsync this close before the due time still draws

  /** Says which rAF timestamps (ms) draw, for about fps frames a second. */
  function Pacer(fps) {
    this.interval = 1000 / fps;
    this.next = -Infinity;
  }
  Pacer.prototype.due = function (ms) {
    if (ms < this.next - EARLY_MS) return false;
    // After a stall, start again from now rather than drawing a burst of late frames.
    this.next = Math.max(this.next + this.interval, ms);
    return true;
  };

  /** The held state as a timeline of edges at event times (ms); read it with at() in time order. */
  function Hold() {
    this.reset();
  }
  Hold.prototype.reset = function () {
    this.edges = [];
    this.on = false;
    this.last = false;
  };
  Hold.prototype.set = function (on, ms) {
    on = !!on;
    if (on === this.last) return;
    this.last = on;
    this.edges.push({ ms: ms, on: on });
  };
  Hold.prototype.at = function (ms) {
    while (this.edges.length && this.edges[0].ms <= ms) this.on = this.edges.shift().on;
    return this.on;
  };

  /**
   * The real time (ms) at which step i of the n steps just taken ends, for a frame at nowMs whose clock
   * kept accLeft seconds over, at the given time scale: the steps are spread over the time they used.
   */
  function stepTime(nowMs, i, n, accLeft, DT, scale) {
    if (!(scale > 0.01)) return nowMs;
    return nowMs - ((accLeft + (n - 1 - i) * DT) / scale) * 1000;
  }

  return { Pacer: Pacer, Hold: Hold, stepTime: stepTime };
});
