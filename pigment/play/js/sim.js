/* Pigment. The shallow water engine.

   One grid, three things happening at once.

   Water has a height and a velocity. It runs downhill, it wicks sideways into dry
   paper, and it leaves faster at the edges than the middle, which is why a wash
   dries into a hard rim instead of a soft one.

   Pigment is suspended in that water and moves with it, but slightly slower, so
   the water always arrives first and the colour piles up behind it. Suspended
   pigment settles onto the sheet, faster in the valleys of the paper than on the
   hills, which is granulation. Deposited pigment can be picked back up by fresh
   water unless it stains, which is where backruns come from.

   Colour is Kubelka-Munk in three bands. Every cell holds an absorption vector and
   a scattering scalar, both accumulated by mass, so two pigments in one cell mix
   the way two pigments in one puddle mix. Nothing here averages RGB.

   Only tiles with something happening in them are stepped or recomposited, so a
   drying sheet with one wet corner costs almost nothing. */

const Sim = (() => {

  const T = 12;                 // tile edge, in cells
  const CH = 6;                 // Kr Kg Kb S granMass stainMass

  const WET = 0.0035;           // below this a cell counts as dry
  const PRESS = 0.42;           // how hard a height difference pushes
  const GRAV = 0.030;           // tilt contribution
  const VISC = 0.30;            // velocity lost per step
  const TOOTHDRAG = 0.22;       // extra drag from paper grain
  const EDGE = 0.150;           // outward pull at a drying rim: the coffee ring
  const FLOW = 0.55;            // velocity to flux
  const MAXOUT = 0.34;          // most of a cell's water that may leave in one step
  const PIGLAG = 0.62;          // pigment carried by diffusion, relative to water
  const EVAP = 0.00034;
  const RIMEVAP = 0.55;         // extra drying per dry neighbour
  const DEPO = 0.007;           // settling rate
  const REWET = 0.007;          // deposited pigment picked back up by fresh water
  const PDIFF = 0.145;          // pigment spreading through standing water: the bloom
  const HEAT = 0.055;
  const LIFTRATE = 0.55;
  const VMAX = 2.2;
  const SURF = 0.026, SGAIN = 0.955;   // surface reflection off the dried film

  const EXPN = new Float32Array(1025);
  for (let i = 0; i <= 1024; i++) EXPN[i] = Math.exp(-(i / 1024) * 12);
  function expneg(x) {           // exp(-x) for x >= 0, saturating past 12
    if (x >= 12) return 0;
    const t = x * (1024 / 12);
    const i = t | 0;
    const f = t - i;
    return EXPN[i] + (EXPN[i + 1] - EXPN[i]) * f;
  }
  const GAM = new Uint8ClampedArray(2049);
  for (let i = 0; i <= 2048; i++) {
    const v = i / 2048;
    GAM[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  }
  const gam = v => GAM[v <= 0 ? 0 : (v >= 1 ? 2048 : (v * 2048) | 0)];

  function srgbToLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function hexLin(h) {
    const n = parseInt(h.slice(1), 16);
    return [srgbToLin(((n >> 16) & 255) / 255), srgbToLin(((n >> 8) & 255) / 255), srgbToLin((n & 255) / 255)];
  }

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  function noise(gw, gh, scale, rnd) {
    const nw = Math.ceil(gw / scale) + 2, nh = Math.ceil(gh / scale) + 2;
    const g = new Float32Array(nw * nh);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const out = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      const fy = y / scale, y0 = fy | 0, ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < gw; x++) {
        const fx = x / scale, x0 = fx | 0, tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = g[y0 * nw + x0], b = g[y0 * nw + x0 + 1];
        const c = g[(y0 + 1) * nw + x0], d = g[(y0 + 1) * nw + x0 + 1];
        out[y * gw + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
      }
    }
    return out;
  }

  function create(gw, gh, paper, seed) {
    const N = gw * gh;
    const TW = Math.ceil(gw / T), TH = Math.ceil(gh / T);
    const rnd = rng(seed || 12345);

    const s = {
      gw, gh, N, TW, TH, paper,
      wa: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N),
      P: new Float32Array(N * CH), D: new Float32Array(N * CH),
      wa2: new Float32Array(N), P2: new Float32Array(N * CH),
      ph: new Float32Array(N), abs: new Float32Array(N),
      fix: new Float32Array(N), bk: new Float32Array(N),
      act: new Uint8Array(TW * TH), work: new Uint8Array(TW * TH), dirty: new Uint8Array(TW * TH),
      rgb: null, img: null,
      gx: 0, gy: 0,
      wetCells: 0, maskCells: 0,
      dx0: 0, dy0: 0, dx1: -1, dy1: -1,
      tone: hexLin(paper.tone)
    };

    // Paper. Three octaves of value noise; the grain figure sets how fine it is.
    const sc = 1.35 - paper.grain;
    const a = noise(gw, gh, Math.max(1.6, 7.5 * sc), rnd);
    const b = noise(gw, gh, Math.max(1.2, 3.4 * sc), rnd);
    const c = noise(gw, gh, Math.max(1.0, 1.7 * sc), rnd);
    const blot = noise(gw, gh, 26, rnd);
    for (let i = 0; i < N; i++) {
      const n = 0.40 * a[i] + 0.29 * b[i] + 0.31 * c[i];
      s.ph[i] = Math.min(1, Math.max(0, 0.5 + (n - 0.5) * (0.40 + paper.tooth * 0.72)));
      s.abs[i] = paper.absorb * (1 + (paper.buckle ? 0.55 : 0.14) * (blot[i] - 0.5));
    }
    return s;
  }

  function reset(s) {
    s.wa.fill(0); s.vx.fill(0); s.vy.fill(0);
    s.P.fill(0); s.D.fill(0); s.fix.fill(0); s.bk.fill(0);
    s.act.fill(0); s.dirty.fill(1);
    s.wetCells = 0; s.maskCells = 0;
    s.dx0 = 0; s.dy0 = 0; s.dx1 = s.TW - 1; s.dy1 = s.TH - 1;
  }

  function markTile(s, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= s.TW || ty >= s.TH) return;
    const t = ty * s.TW + tx;
    s.act[t] = 1; s.dirty[t] = 1;
    if (tx < s.dx0) s.dx0 = tx; if (tx > s.dx1) s.dx1 = tx;
    if (ty < s.dy0) s.dy0 = ty; if (ty > s.dy1) s.dy1 = ty;
  }

  function markBox(s, x0, y0, x1, y1) {
    const tx0 = Math.max(0, (x0 / T) | 0), tx1 = Math.min(s.TW - 1, (x1 / T) | 0);
    const ty0 = Math.max(0, (y0 / T) | 0), ty1 = Math.min(s.TH - 1, (y1 / T) | 0);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) markTile(s, tx, ty);
  }

  /* ---------------------------------------------------------------- the brush */

  /* One elliptical touch of a brush, a sponge tuft or a thumb.
     spec: cx cy rx ry ang soft mode water mass K Sc gran stain tooth */
  function dab(s, sp) {
    const { gw, gh } = s;
    const rx = Math.max(0.55, sp.rx), ry = Math.max(0.55, sp.ry);
    const rad = Math.max(rx, ry) + 1.5;
    const x0 = Math.max(0, Math.floor(sp.cx - rad)), x1 = Math.min(gw - 1, Math.ceil(sp.cx + rad));
    const y0 = Math.max(0, Math.floor(sp.cy - rad)), y1 = Math.min(gh - 1, Math.ceil(sp.cy + rad));
    if (x1 < x0 || y1 < y0) return;
    const ca = Math.cos(sp.ang || 0), sa = Math.sin(sp.ang || 0);
    const soft = sp.soft === undefined ? 0.5 : sp.soft;
    const inner = 1 - Math.min(0.95, soft);
    const tooth = sp.tooth || 0;
    const mode = sp.mode;
    const K = sp.K;

    for (let y = y0; y <= y1; y++) {
      const dy = y - sp.cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - sp.cx;
        const u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
        const d = Math.sqrt(u * u + v * v);
        if (d >= 1) continue;
        let f = d <= inner ? 1 : 1 - (d - inner) / (1 - inner);
        f = f * f * (3 - 2 * f);
        if (f <= 0.002) continue;
        const i = y * gw + x;

        if (tooth > 0) {                        // a dry brush only touches the hills
          const hit = (s.ph[i] - tooth * 0.62) * 5.5;
          if (hit <= 0) continue;
          f *= Math.min(1, hit);
        }

        if (mode === 'heat') { s.wa[i] = Math.max(0, s.wa[i] - f * HEAT); continue; }

        if (mode === 'mask') {
          if (s.fix[i] < f) { if (s.fix[i] < 0.35 && f >= 0.35) s.maskCells++; s.fix[i] = f; }
          continue;
        }

        const open = 1 - s.fix[i];
        if (open <= 0.02) continue;

        if (mode === 'lift') {
          const o = i * CH;
          const dm = s.D[o + 3] + (s.D[o] + s.D[o + 1] + s.D[o + 2]) / 3;
          const stain = dm > 1e-5 ? s.D[o + 5] / dm : 0;
          const wet = Math.min(1, s.wa[i] * 9);
          const kD = 1 - f * LIFTRATE * (1 - stain * 0.92) * (0.25 + 0.75 * wet) * open;
          const pm = s.P[o + 3] + (s.P[o] + s.P[o + 1] + s.P[o + 2]) / 3;
          const pstain = pm > 1e-5 ? s.P[o + 5] / pm : 0;
          const kP = 1 - f * LIFTRATE * 1.3 * (1 - pstain * 0.6) * open;
          for (let c = 0; c < CH; c++) { s.D[o + c] *= kD; s.P[o + c] *= kP; }
          s.wa[i] = Math.max(0, s.wa[i] - f * 0.028);
          continue;
        }

        const wAdd = sp.water * f * open;
        if (wAdd > 0) s.wa[i] += wAdd;

        if (mode === 'paint' && sp.mass > 0) {
          const m = sp.mass * f * open;
          const o = i * CH;
          const mu = sp.Sc + (K[0] + K[1] + K[2]) / 3;
          s.P[o] += m * K[0]; s.P[o + 1] += m * K[1]; s.P[o + 2] += m * K[2];
          s.P[o + 3] += m * sp.Sc;
          s.P[o + 4] += m * mu * sp.gran;
          s.P[o + 5] += m * mu * sp.stain;
        }
      }
    }
    markBox(s, x0, y0, x1, y1);
  }

  /* ------------------------------------------------------------------ the step */

  function step(s) {
    const { gw, gh, TW, TH, wa, vx, vy, P, D, wa2, P2, ph, fix, bk, abs } = s;

    // Water can only reach a tile from a neighbour, so grow the working set by one.
    const work = s.work; work.fill(0);
    let any = false;
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      if (!s.act[ty * TW + tx]) continue;
      any = true;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const nx = tx + i, ny = ty + j;
        if (nx >= 0 && ny >= 0 && nx < TW && ny < TH) work[ny * TW + nx] = 1;
      }
    }
    if (!any) return false;

    const buckling = s.paper.buckle;
    const gx = s.gx, gy = s.gy;
    let wet = 0;

    for (let ty = 0; ty < TH; ty++) {
      const cy0 = ty * T, cy1 = Math.min(gh, cy0 + T);
      for (let tx = 0; tx < TW; tx++) {
        if (!work[ty * TW + tx]) continue;
        s.dirty[ty * TW + tx] = 1;
        if (tx < s.dx0) s.dx0 = tx; if (tx > s.dx1) s.dx1 = tx;
        if (ty < s.dy0) s.dy0 = ty; if (ty > s.dy1) s.dy1 = ty;
        const cx0 = tx * T, cx1 = Math.min(gw, cx0 + T);

        // ---- velocities
        for (let y = cy0; y < cy1; y++) {
          const up = y > 0 ? -gw : 0, dn = y < gh - 1 ? gw : 0;
          for (let x = cx0; x < cx1; x++) {
            const i = y * gw + x;
            const w = wa[i];
            if (w < WET) { vx[i] = 0; vy[i] = 0; continue; }
            const lf = x > 0 ? -1 : 0, rt = x < gw - 1 ? 1 : 0;
            const hc = w - bk[i];
            const hl = wa[i + lf] - bk[i + lf], hr = wa[i + rt] - bk[i + rt];
            const hu = wa[i + up] - bk[i + up], hd = wa[i + dn] - bk[i + dn];
            let nvx = vx[i] + (hl - hr) * PRESS + gx * GRAV;
            let nvy = vy[i] + (hu - hd) * PRESS + gy * GRAV;
            // a rim that is drying pulls liquid outward into itself
            if (wa[i + rt] < WET && hc > WET) nvx += EDGE;
            if (wa[i + lf] < WET && hc > WET) nvx -= EDGE;
            if (wa[i + dn] < WET && hc > WET) nvy += EDGE;
            if (wa[i + up] < WET && hc > WET) nvy -= EDGE;
            const drag = 1 - VISC - ph[i] * TOOTHDRAG;
            nvx *= drag; nvy *= drag;
            vx[i] = nvx > VMAX ? VMAX : (nvx < -VMAX ? -VMAX : nvx);
            vy[i] = nvy > VMAX ? VMAX : (nvy < -VMAX ? -VMAX : nvy);
          }
        }
      }
    }

    // ---- transport: water and the pigment it is carrying
    const wick = s.paper.wick;
    for (let ty = 0; ty < TH; ty++) {
      const cy0 = ty * T, cy1 = Math.min(gh, cy0 + T);
      for (let tx = 0; tx < TW; tx++) {
        if (!work[ty * TW + tx]) continue;
        const cx0 = tx * T, cx1 = Math.min(gw, cx0 + T);
        for (let y = cy0; y < cy1; y++) {
          for (let x = cx0; x < cx1; x++) {
            const i = y * gw + x;
            const w = wa[i];
            if (w < WET) continue;
            const hc = w - bk[i];
            const lf = x > 0 ? i - 1 : -1, rt = x < gw - 1 ? i + 1 : -1;
            const up = y > 0 ? i - gw : -1, dn = y < gh - 1 ? i + gw : -1;

            let fL = 0, fR = 0, fU = 0, fD = 0, adv = 0, sum = 0;
            if (lf >= 0) {
              const d = hc - (wa[lf] - bk[lf]);
              const av = vx[i] < 0 ? -vx[i] * FLOW : 0;
              fL = ((d > 0 ? d * wick * (1.3 - ph[lf] * 0.6) : 0) + av) * (1 - fix[lf]); adv += av; sum += fL;
            }
            if (rt >= 0) {
              const d = hc - (wa[rt] - bk[rt]);
              const av = vx[i] > 0 ? vx[i] * FLOW : 0;
              fR = ((d > 0 ? d * wick * (1.3 - ph[rt] * 0.6) : 0) + av) * (1 - fix[rt]); adv += av; sum += fR;
            }
            if (up >= 0) {
              const d = hc - (wa[up] - bk[up]);
              const av = vy[i] < 0 ? -vy[i] * FLOW : 0;
              fU = ((d > 0 ? d * wick * (1.3 - ph[up] * 0.6) : 0) + av) * (1 - fix[up]); adv += av; sum += fU;
            }
            if (dn >= 0) {
              const d = hc - (wa[dn] - bk[dn]);
              const av = vy[i] > 0 ? vy[i] * FLOW : 0;
              fD = ((d > 0 ? d * wick * (1.3 - ph[dn] * 0.6) : 0) + av) * (1 - fix[dn]); adv += av; sum += fD;
            }
            // Pigment spreads through standing water whether or not the water is
            // going anywhere. This term alone is the difference between a bloom
            // and a felt tip pen, so it runs before the flow does.
            if (w > 0.02) {
              const o0 = i * CH;
              // masking fluid is a physical barrier: nothing crosses it, not even
              // colour arriving sideways through a puddle
              let dl = 0, dr = 0, du = 0, dd = 0, dsum = 0;
              if (lf >= 0 && wa[lf] > WET) { dl = 1 - fix[lf]; dsum += dl; }
              if (rt >= 0 && wa[rt] > WET) { dr = 1 - fix[rt]; dsum += dr; }
              if (up >= 0 && wa[up] > WET) { du = 1 - fix[up]; dsum += du; }
              if (dn >= 0 && wa[dn] > WET) { dd = 1 - fix[dn]; dsum += dd; }
              if (dsum > 0.01) {
                const each = PDIFF * (w < 0.5 ? w * 2 : 1) / 4;
                for (let c = 0; c < CH; c++) {
                  const p = P[o0 + c];
                  if (p <= 0) continue;
                  const m = p * each;
                  P2[o0 + c] -= m * dsum;
                  if (dl) P2[lf * CH + c] += m * dl;
                  if (dr) P2[rt * CH + c] += m * dr;
                  if (du) P2[up * CH + c] += m * du;
                  if (dd) P2[dn * CH + c] += m * dd;
                }
              }
            }

            if (sum <= 1e-6) continue;

            const frac = Math.min(MAXOUT, sum);
            const amt = w * frac;
            const k = amt / sum;
            // Pigment is heavier than the water carrying it, so a wicking edge
            // outruns its own colour. Advected flow carries far more of it.
            const share = adv / sum;
            const pf = frac * (PIGLAG + (1 - PIGLAG) * share);
            const o = i * CH;

            wa2[i] -= amt; if (fL) wa2[lf] += fL * k; if (fR) wa2[rt] += fR * k;
            if (fU) wa2[up] += fU * k; if (fD) wa2[dn] += fD * k;

            for (let c = 0; c < CH; c++) {
              const p = P[o + c];
              if (p <= 0) continue;
              const move = p * pf;
              P2[o + c] -= move;
              const q = move / sum;
              if (fL) P2[lf * CH + c] += fL * q;
              if (fR) P2[rt * CH + c] += fR * q;
              if (fU) P2[up * CH + c] += fU * q;
              if (fD) P2[dn * CH + c] += fD * q;
            }
          }
        }
      }
    }

    // ---- apply transport, then dry, settle and re-wet
    s.act.fill(0);
    for (let ty = 0; ty < TH; ty++) {
      const cy0 = ty * T, cy1 = Math.min(gh, cy0 + T);
      for (let tx = 0; tx < TW; tx++) {
        if (!work[ty * TW + tx]) continue;
        const cx0 = tx * T, cx1 = Math.min(gw, cx0 + T);
        let live = 0;
        for (let y = cy0; y < cy1; y++) {
          for (let x = cx0; x < cx1; x++) {
            const i = y * gw + x, o = i * CH;
            let w = wa[i] + wa2[i];
            wa2[i] = 0;
            for (let c = 0; c < CH; c++) { P[o + c] += P2[o + c]; P2[o + c] = 0; }
            if (w < 0) w = 0;

            const pm = P[o + 3] + (P[o] + P[o + 1] + P[o + 2]) / 3;
            if (w < WET && pm < 1e-6) { wa[i] = 0; continue; }

            if (w >= WET) {
              // drying: the rim of a wash loses water faster than its middle
              let dryN = 0;
              if (x === 0 || wa[i - 1] < WET) dryN++;
              if (x === gw - 1 || wa[i + 1] < WET) dryN++;
              if (y === 0 || wa[i - gw] < WET) dryN++;
              if (y === gh - 1 || wa[i + gw] < WET) dryN++;
              w -= EVAP * abs[i] * (1 + dryN * RIMEVAP);
              if (w < 0) w = 0;
              if (buckling && w > 0.42 && bk[i] < 0.30) bk[i] += 0.00055;
            }

            if (pm > 1e-6) {
              const gran = P[o + 4] / pm;
              // A settling grain does not stop where it was floating: it rolls off the
              // hill it is over and into the nearest pit in the paper. That is what
              // granulation is, and it has to happen at the moment of settling or the
              // whole effect washes out again when the sheet finishes drying.
              let jj = i, slope = 0;
              if (gran > 0.10) {
                let low = ph[i];
                if (x > 0 && ph[i - 1] < low) { low = ph[i - 1]; jj = i - 1; }
                if (x < gw - 1 && ph[i + 1] < low) { low = ph[i + 1]; jj = i + 1; }
                if (y > 0 && ph[i - gw] < low) { low = ph[i - gw]; jj = i - gw; }
                if (y < gh - 1 && ph[i + gw] < low) { low = ph[i + gw]; jj = i + gw; }
                slope = Math.min(0.38, gran * (ph[i] - low) * 3.4);
              }
              const oj = jj * CH;
              if (w < WET) {                       // the sheet is dry: everything settles
                for (let c = 0; c < CH; c++) {
                  const m = P[o + c]; P[o + c] = 0;
                  if (slope > 0) { D[o + c] += m * (1 - slope); D[oj + c] += m * slope; }
                  else D[o + c] += m;
                }
                w = 0;
              } else {
                // thin water drops its load fastest, and valleys collect faster than hills
                const gf = 1 + gran * (0.55 - ph[i]) * 2.6;
                let dep = DEPO * (gf > 0.05 ? gf : 0.05) / (0.30 + w);
                if (dep > 0.55) dep = 0.55;
                for (let c = 0; c < CH; c++) {
                  const m = P[o + c] * dep; P[o + c] -= m;
                  if (slope > 0) { D[o + c] += m * (1 - slope); D[oj + c] += m * slope; }
                  else D[o + c] += m;
                }
              }
            }

            if (w >= WET) {
              const dm = D[o + 3] + (D[o] + D[o + 1] + D[o + 2]) / 3;
              if (dm > 1e-5) {                     // fresh water picks dry colour back up
                const stain = D[o + 5] / dm;
                const re = REWET * (1 - stain * 0.94) * Math.min(1, w * 3.2);
                if (re > 0.0005) for (let c = 0; c < CH; c++) { const m = D[o + c] * re; D[o + c] -= m; P[o + c] += m; }
              }
              live = 1;
              wet++;
            } else if (P[o + 3] > 0 || P[o] > 0) live = 1;
            wa[i] = w;
          }
        }
        if (live) s.act[ty * TW + tx] = 1;
      }
    }
    s.wetCells = wet;
    return true;
  }

  /* ------------------------------------------------------------- the composite */

  function ensureImage(s, ctx) {
    if (!s.img) { s.img = ctx.createImageData(s.gw, s.gh); s.rgb = s.img.data; s.dirty.fill(1);
                  s.dx0 = 0; s.dy0 = 0; s.dx1 = s.TW - 1; s.dy1 = s.TH - 1; }
    return s.img;
  }

  /* mode 0 = paint, 1 = moisture view */
  function composite(s, mode) {
    const { gw, gh, TW, TH, wa, P, D, fix, bk, ph, rgb, tone } = s;
    if (s.dx1 < s.dx0) return null;
    const t0 = tone[0], t1 = tone[1], t2 = tone[2];
    for (let ty = s.dy0; ty <= s.dy1; ty++) {
      const cy0 = ty * T, cy1 = Math.min(gh, cy0 + T);
      for (let tx = s.dx0; tx <= s.dx1; tx++) {
        if (!s.dirty[ty * TW + tx]) continue;
        s.dirty[ty * TW + tx] = 0;
        const cx0 = tx * T, cx1 = Math.min(gw, cx0 + T);
        for (let y = cy0; y < cy1; y++) {
          for (let x = cx0; x < cx1; x++) {
            const i = y * gw + x, o = i * CH, q = i << 2;
            const w = wa[i];

            if (mode === 1) {
              // moisture view: read the sheen the way a painter reads glare
              const sh = Math.min(1, w * 5.5);
              const base = 0.16 + ph[i] * 0.05;
              const r = base + sh * 0.30, g = base + sh * 0.62, b = base + sh * 0.80;
              rgb[q] = gam(r); rgb[q + 1] = gam(g); rgb[q + 2] = gam(b); rgb[q + 3] = 255;
              continue;
            }

            const Kr = D[o] + P[o], Kg = D[o + 1] + P[o + 1], Kb = D[o + 2] + P[o + 2];
            const Sc = D[o + 3] + P[o + 3];
            const ts = 0.962 + ph[i] * 0.052;      // the tooth, seen through the wash
            const p0 = t0 * ts, p1 = t1 * ts, p2 = t2 * ts;
            let r, g, b;
            if (Sc + Kr + Kg + Kb < 2e-4) { r = p0; g = p1; b = p2; }
            else {
              const S = Sc > 1e-4 ? Sc : 1e-4;
              let x0 = Kr / S; let Ri = 1 + x0 - Math.sqrt(x0 * x0 + 2 * x0);
              let T2 = expneg(2 * (Kr + Sc)); r = Ri * (1 - T2) + p0 * T2;
              x0 = Kg / S; Ri = 1 + x0 - Math.sqrt(x0 * x0 + 2 * x0);
              T2 = expneg(2 * (Kg + Sc)); g = Ri * (1 - T2) + p1 * T2;
              x0 = Kb / S; Ri = 1 + x0 - Math.sqrt(x0 * x0 + 2 * x0);
              T2 = expneg(2 * (Kb + Sc)); b = Ri * (1 - T2) + p2 * T2;
            }

            // Light bouncing off the surface of the film never enters the paint at
            // all, so no wash on paper is ever as dark as its own absorption.
            r = SURF + SGAIN * r; g = SURF + SGAIN * g; b = SURF + SGAIN * b;
            // wet paper is darker than dry paper, and a buckle throws a shadow
            const shade = 1 - Math.min(1, w * 2.4) * 0.11 - bk[i] * 0.22;
            r *= shade; g *= shade; b *= shade;

            const m = fix[i];
            if (m > 0.02) { const k = m * 0.82; r += (0.79 - r) * k; g += (0.72 - g) * k; b += (0.34 - b) * k; }

            rgb[q] = gam(r); rgb[q + 1] = gam(g); rgb[q + 2] = gam(b); rgb[q + 3] = 255;
          }
        }
      }
    }
    const box = { x: s.dx0 * T, y: s.dy0 * T,
                  w: Math.min(gw, (s.dx1 + 1) * T) - s.dx0 * T,
                  h: Math.min(gh, (s.dy1 + 1) * T) - s.dy0 * T };
    s.dx0 = TW; s.dy0 = TH; s.dx1 = -1; s.dy1 = -1;
    return box;
  }

  function markAllDirty(s) {
    s.dirty.fill(1); s.dx0 = 0; s.dy0 = 0; s.dx1 = s.TW - 1; s.dy1 = s.TH - 1;
  }

  function clearMask(s) {
    if (!s.maskCells) return false;
    s.fix.fill(0); s.maskCells = 0;
    markAllDirty(s);
    return true;
  }

  function isSettled(s) {
    for (let i = 0; i < s.act.length; i++) if (s.act[i]) return false;
    return true;
  }

  /* Undo snapshots. Float32 would be four megabytes a step, so the state is
     quantised to unsigned 16 bit, which is finer than anything the eye reads back. */
  const QW = 12000, QP = 5200;
  function snapshot(s) {
    const N = s.N;
    const w = new Uint16Array(N), p = new Uint16Array(N * CH), d = new Uint16Array(N * CH);
    const f = new Uint16Array(N), b = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
      w[i] = Math.min(65535, s.wa[i] * QW);
      f[i] = Math.min(65535, s.fix[i] * 65000);
      b[i] = Math.min(65535, s.bk[i] * 65000);
    }
    for (let i = 0; i < N * CH; i++) {
      p[i] = Math.min(65535, s.P[i] * QP);
      d[i] = Math.min(65535, s.D[i] * QP);
    }
    return { w, p, d, f, b, mask: s.maskCells };
  }
  function restore(s, snap) {
    const N = s.N;
    for (let i = 0; i < N; i++) {
      s.wa[i] = snap.w[i] / QW; s.fix[i] = snap.f[i] / 65000; s.bk[i] = snap.b[i] / 65000;
      s.vx[i] = 0; s.vy[i] = 0;
    }
    for (let i = 0; i < N * CH; i++) { s.P[i] = snap.p[i] / QP; s.D[i] = snap.d[i] / QP; }
    s.maskCells = snap.mask;
    s.act.fill(1);
    markAllDirty(s);
  }

  /* The same arithmetic the canvas uses, for one sample. The mixing well, the
     swatch cards and the pigment library all read colour through this, so nothing
     in the interface can drift away from what the paper would actually do. */
  const PAPERLIN = hexLin('#FCFAF3');
  function km(Kr, Kg, Kb, Sc, tone) {
    const t = tone || PAPERLIN;
    if (Sc + Kr + Kg + Kb < 2e-4) return [gam(t[0]), gam(t[1]), gam(t[2])];
    const S = Sc > 1e-4 ? Sc : 1e-4;
    const out = [0, 0, 0], K = [Kr, Kg, Kb];
    for (let c = 0; c < 3; c++) {
      const x = K[c] / S;
      const Ri = 1 + x - Math.sqrt(x * x + 2 * x);
      const T2 = expneg(2 * (K[c] + Sc));
      out[c] = gam(SURF + SGAIN * (Ri * (1 - T2) + t[c] * T2));
    }
    return out;
  }

  return { create, reset, dab, step, composite, ensureImage, markAllDirty, markBox,
           clearMask, isSettled, snapshot, restore, km, hexLin, CH, TILE: T, rng };
})();

window.Sim = Sim;
