'use strict';
// EchoDepths: small shared utilities (seeded RNG, math, formatting)
const U = (() => {
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function hash2(x, y, k) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(k | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const TAU = Math.PI * 2;
  // closest point on segment AB to P; returns {d, cx, cy}
  function segClosest(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    const cx = ax + dx * t, cy = ay + dy * t;
    return { d: Math.hypot(px - cx, py - cy), cx, cy };
  }
  function fmtDepth(m) { return Math.round(m).toLocaleString('en-US') + ' m'; }
  // relative bearing words for screen-reader / eyes-closed mode. dy<0 is "ahead" (up-screen)
  function bearingWord(dx, dy) {
    const a = Math.atan2(dy, dx); // -PI..PI, 0 = right
    const deg = (a * 180 / Math.PI + 360) % 360;
    if (deg >= 337.5 || deg < 22.5) return 'right';
    if (deg < 67.5) return 'behind-right';
    if (deg < 112.5) return 'behind';
    if (deg < 157.5) return 'behind-left';
    if (deg < 202.5) return 'left';
    if (deg < 247.5) return 'ahead-left';
    if (deg < 292.5) return 'ahead';
    return 'ahead-right';
  }
  function nearWord(d) { return d < 2 ? 'very close' : d < 4.5 ? 'close' : d < 8 ? 'near' : 'far'; }
  // tiny binary min-heap keyed on numbers: [key, value]
  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  }
  return { mulberry32, hashStr, hash2, clamp, lerp, dist, TAU, segClosest, fmtDepth, bearingWord, nearWord, Heap };
})();
