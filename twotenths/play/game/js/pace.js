/*
 * Frame pacing (Skychime's fix): draw at most about 60 frames a second on any display. On a 120 Hz phone
 * every other frame is skipped; on 90 Hz the draws alternate one and two frames apart, which still
 * averages 60. Taps never wait for a frame: they carry their own event time.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.TT = root.TT || {}).pace = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EARLY_MS = 4; // a vsync this close before the due time still draws

  function create(fps) {
    return { interval: 1000 / fps, next: -Infinity };
  }

  /** True when the frame at timestamp ms should draw. */
  function due(p, ms) {
    if (ms < p.next - EARLY_MS) return false;
    // After a stall, start again from now rather than drawing a burst of late frames.
    p.next = Math.max(p.next + p.interval, ms + p.interval - EARLY_MS);
    return true;
  }

  return { create: create, due: due };
});
