/* Pigment. The bloom.

   Three pigments dropped into one wet patch: ultramarine, quinacridone rose and
   hansa yellow, bleeding into each other and drying with a ragged rim. It is the
   app's mark, the picture on the first screen, the empty drawer and the launcher
   icon, and it is not an illustration of the paint. Every pixel below is the same
   Kubelka-Munk arithmetic the sheet uses, reading the same absorption numbers off
   the same three tubes, so the greens and the violets in it are mixed rather than
   chosen.

   Everything is drawn into a small buffer and scaled up. Watercolour has no hard
   detail to lose, and it keeps the mark cheap enough to animate. */

const Bloom = (() => {

/* Three touches of a loaded brush into one wet patch, arranged so that every pair
   overlaps and all three only just meet. The pairs are the whole point: ultramarine
   into hansa is the green, ultramarine into quinacridone is the violet, quinacridone
   into hansa is the orange, and none of those three colours is written down anywhere
   in this file. Offsets are in units of the short side, so the arrangement holds at
   any aspect ratio. */
  const LOBES = [
    { id: 'ultramarine', dx: -0.163, dy: -0.058, r: 0.250, ph: 0.6, mass: 1.95 },
    { id: 'quinrose',    dx:  0.152, dy: -0.136, r: 0.234, ph: 2.4, mass: 1.50 },
    { id: 'hansa',       dx:  0.012, dy:  0.172, r: 0.240, ph: 4.1, mass: 2.30 }
  ];
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function valueNoise(w, h, scale, rnd) {
    const nw = Math.ceil(w / scale) + 2, nh = Math.ceil(h / scale) + 2;
    const g = new Float32Array(nw * nh);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = y / scale, y0 = fy | 0, ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = x / scale, x0 = fx | 0, tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const a = g[y0 * nw + x0], b = g[y0 * nw + x0 + 1];
        const c = g[(y0 + 1) * nw + x0], d = g[(y0 + 1) * nw + x0 + 1];
        out[y * w + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
      }
    }
    return out;
  }

  const cache = {};
  function fields(w, h, seed) {
    const key = w + 'x' + h + '.' + seed;
    if (cache[key]) return cache[key];
    const rnd = Sim.rng(seed);
    const f = {
      tooth: valueNoise(w, h, Math.max(1.4, w / 46), rnd),
      grain: valueNoise(w, h, Math.max(1.8, w / 46), rnd),
      warp: valueNoise(w, h, Math.max(2.0, w / 9), rnd)
    };
    const keys = Object.keys(cache);
    if (keys.length > 8) delete cache[keys[0]];
    cache[key] = f;
    return f;
  }

  /* One frame of the bloom into an ImageData sized bw x bh.
     t is how far the wash has spread, 0 to 1. */
  function buffer(bw, bh, t, seed, paperHex) {
    const f = fields(bw, bh, seed || 20259);
    const tone = Sim.hexLin(paperHex || '#FBF7EC');
    const img = new ImageData(bw, bh);
    const d = img.data;
    const S = Math.min(bw, bh);
    const grow = 0.34 + 0.66 * t;
    const lobes = LOBES.map(l => {
      const p = Data.BY_ID[l.id];
      return { p, cx: bw / 2 + l.dx * S * grow, cy: bh / 2 + l.dy * S * grow,
               r: l.r * S * grow, ph: l.ph, mass: l.mass * (0.40 + 0.60 * t) };
    });

    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        const warp = (f.warp[i] - 0.5);
        let Kr = 0, Kg = 0, Kb = 0, Sc = 0, wet = 0;

        for (let k = 0; k < 3; k++) {
          const L = lobes[k];
          const dx = x - L.cx, dy = y - L.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > L.r * 1.5) continue;
          const ang = Math.atan2(dy, dx);
          // a drying edge is never a circle: a slow wobble with a finer crawl on it
          const edge = 1 + 0.105 * Math.sin(ang * 3 + L.ph) + 0.062 * Math.sin(ang * 5 - L.ph * 1.7)
                         + 0.038 * Math.sin(ang * 9 + L.ph * 2.3) + warp * 0.17;
          const u = dist / (L.r * edge);
          if (u >= 1.26) continue;
          wet = Math.max(wet, 1 - smooth(0.9, 1.26, u));
          // the wash feathers out rather than stopping, and the rim is where the
          // water left first and dragged the colour with it
          const env = 1 - smooth(0.78, 1.24, u);
          if (env <= 0.002) continue;
          const body = 0.56 + 0.44 * (1 - smooth(0.05, 0.98, u));
          const rr = (u - 0.94) / 0.17;
          const rim = 0.52 * Math.exp(-rr * rr);
          const g = 1 + (f.grain[i] - 0.5) * L.p.gran * 0.92;
          const m = L.mass * env * (body + rim) * (g > 0 ? g : 0);
          if (m <= 0.0004) continue;
          Kr += m * L.p.K[0]; Kg += m * L.p.K[1]; Kb += m * L.p.K[2];
          Sc += m * L.p.S;
        }

        // the paper: tooth under the wash, and a damp halo just outside it
        const tooth = 0.975 + f.tooth[i] * 0.042;
        const damp = 1 - wet * 0.038;
        const pt = [tone[0] * tooth * damp, tone[1] * tooth * damp, tone[2] * tooth * damp * 0.998];
        const rgb = Sim.km(Kr, Kg, Kb, Sc, pt);
        const o = i << 2;
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
      }
    }
    return img;
  }

  const scratch = document.createElement('canvas');

  /* Paint the bloom into a visible canvas. The canvas keeps its CSS size; the
     backing store is set from the device ratio, and the bloom itself is computed
     at `res` across and stretched, because a wash has no edge to lose. */
  function paint(cv, opts) {
    const o = opts || {};
    const cssW = o.w || cv.clientWidth || cv.width;
    const cssH = o.h || cv.clientHeight || cv.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    const res = Math.max(28, Math.min(o.res || 210, cv.width));
    const bw = Math.round(res), bh = Math.max(12, Math.round(res * cssH / cssW));
    scratch.width = bw; scratch.height = bh;
    const sx = scratch.getContext('2d');
    sx.putImageData(buffer(bw, bh, o.t === undefined ? 1 : o.t, o.seed, o.paper), 0, 0);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(scratch, 0, 0, bw, bh, 0, 0, cv.width, cv.height);
  }

  /* The wash arriving, once, when a screen opens. Reduced motion gets the finished
     bloom rather than a missing one. */
  function grow(cv, opts) {
    const o = opts || {};
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { paint(cv, Object.assign({}, o, { t: 1 })); return null; }
    const ms = o.ms || 1100;
    const t0 = performance.now();
    let raf = 0;
    const step = now => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 2.4);
      paint(cv, Object.assign({}, o, { t: 0.06 + 0.94 * e }));
      if (k < 1) raf = requestAnimationFrame(step); else raf = 0;
    };
    raf = requestAnimationFrame(step);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }

  return { paint, grow };
})();

window.Bloom = Bloom;
