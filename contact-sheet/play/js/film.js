/* Development. Everything a stock claims on its box happens here, on the device,
   at the moment the roll comes back from the lab.

   Order of operations, which is the order a real process runs in:
     exposure and lab push  ->  per-channel response curve  ->  saturation or silver
     ->  grain, synthesised and weighted to the midtones  ->  halation off the highlights
     ->  falloff at the corners  ->  whatever light got in that should not have. */
const Film = (() => {

  const REF_W = 1200;        // grain sizes are quoted against this width
  const NOISE = 256;         // noise tile edge, power of two so wrapping is a mask

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* --- grain tile: white noise, clumped by roughness, normalised to unit spread --- */
  const tiles = new Map();
  function blurWrap(src, n, r) {
    const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
    const span = r * 2 + 1;
    for (let y = 0; y < n; y++) {
      const row = y * n;
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += src[row + ((x + k + n) & (n - 1))];
        tmp[row + x] = s / span;
      }
    }
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += tmp[(((y + k + n) & (n - 1)) * n) + x];
        out[y * n + x] = s / span;
      }
    }
    return out;
  }
  function grainTile(rough) {
    const key = Math.round(rough * 20);
    if (tiles.has(key)) return tiles.get(key);
    const n = NOISE, rnd = mulberry32(0x5EED1 + key);
    let a = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) a[i] = rnd() * 2 - 1;
    const r = Math.round(rough * 2.4);
    if (r > 0) a = blurWrap(a, n, r);
    let m = 0; for (let i = 0; i < n * n; i++) m += a[i]; m /= n * n;
    let v = 0; for (let i = 0; i < n * n; i++) { const d = a[i] - m; v += d * d; }
    v = Math.sqrt(v / (n * n)) || 1;
    for (let i = 0; i < n * n; i++) a[i] = (a[i] - m) / v;
    tiles.set(key, a);
    return a;
  }

  /* --- response curve: one 256 entry lookup per channel ---
     Below the knee the film is linear. Above it the shoulder leaves at exactly the
     same slope and bends over from there, so there is no step in the gradient where
     the two meet. `roll` sets how hard the shoulder is: a slide film barely bends and
     clips, a colour negative gives way early and holds detail for another stop. */
  function lut(p, exposure, extraGamma, fog) {
    const out = new Float32Array(256);
    const k = p.knee;
    const c = Math.min(0.38, Math.max(0.04, 0.48 / p.roll));   // shoulder strength
    const tmax = 1 / (2 * c);                                   // where the shoulder flattens
    const gamma = p.gamma * (extraGamma || 1);
    const lift = Math.min(0.35, p.lift + (fog || 0));
    for (let i = 0; i < 256; i++) {
      let v = (i / 255) * p.gain * exposure;
      if (v < 0) v = 0;
      v = Math.pow(v, gamma);
      if (v > k) {
        const t = Math.min(tmax, (v - k) / (1 - k));
        v = k + (1 - k) * t * (1 - c * t);
      }
      v = lift + v * (1 - lift);
      out[i] = v < 0 ? 0 : v > 1 ? 255 : v * 255;
    }
    return out;
  }

  /* --- midtone weight: grain sits where the silver is, not in paper white or black --- */
  const MIDW = (() => {
    const t = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const d = Math.abs(2 * (i / 255) - 1);
      t[i] = Math.pow(1 - d, 1.4);
    }
    return t;
  })();

  function boxBlurRGBA(d, w, h, r) {
    const tmp = new Float32Array(w * h * 4);
    const span = r * 2 + 1;
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += d[(y * w + Math.min(w - 1, Math.max(0, k))) * 4 + c];
        for (let x = 0; x < w; x++) {
          tmp[(y * w + x) * 4 + c] = s / span;
          const add = Math.min(w - 1, x + r + 1), sub = Math.max(0, x - r);
          s += d[(y * w + add) * 4 + c] - d[(y * w + sub) * 4 + c];
        }
      }
    }
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += tmp[(Math.min(h - 1, Math.max(0, k)) * w + x) * 4 + c];
        for (let y = 0; y < h; y++) {
          d[(y * w + x) * 4 + c] = s / span;
          const add = Math.min(h - 1, y + r + 1), sub = Math.max(0, y - r);
          s += tmp[(add * w + x) * 4 + c] - tmp[(sub * w + x) * 4 + c];
        }
      }
    }
  }

  /** Develops one frame onto `canvas`. `src` is an ImageBitmap or canvas. */
  function renderTo(canvas, src, stock, opt) {
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, W, H);

    const push = opt.push || 0;
    const rnd = mulberry32((opt.seed | 0) ^ 0x9E3779B9);
    let exposure = Math.pow(2, push * 0.55);
    let extraG = 1 - push * 0.06;
    let fog = 0;
    const drift = { r: 1, g: 1, b: 1 };

    for (const q of stock.quirks) {
      if (q.k === 'under' && rnd() < q.p) exposure *= (1 - q.stops * 0.55);
      if (q.k === 'drift') {
        drift.r = 1 + (rnd() * 2 - 1) * q.gain;
        drift.g = 1 + (rnd() * 2 - 1) * q.gain * 0.6;
        drift.b = 1 + (rnd() * 2 - 1) * q.gain;
        extraG *= 1 + (rnd() * 2 - 1) * q.gamma;
        fog += rnd() * q.fog;
      }
    }

    const c = stock.curve;
    const lr = lut({ ...c.r, gain: c.r.gain * drift.r }, exposure, extraG, fog);
    const lg = lut({ ...c.g, gain: c.g.gain * drift.g }, exposure, extraG, fog);
    const lb = lut({ ...c.b, gain: c.b.gain * drift.b }, exposure, extraG, fog);

    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;

    /* grain index tables, so the inner loop does no division */
    const g = stock.grain;
    const scale = Math.max(0.6, g.size * (W / REF_W));
    const tile = grainTile(g.rough);
    const ox = (rnd() * NOISE) | 0, oy = (rnd() * NOISE) | 0;
    const M = NOISE - 1;
    const col0 = new Int32Array(W), col1 = new Int32Array(W), col2 = new Int32Array(W), col3 = new Int32Array(W);
    for (let x = 0; x < W; x++) {
      const q = ((x / scale) | 0);
      col0[x] = (q + ox) & M;
      col1[x] = (q + ox + 53) & M;
      col2[x] = (q + ox + 127) & M;
      col3[x] = (q + ox + 199) & M;
    }
    const amp = g.amp * 255 * (1 + Math.max(0, push) * 0.5);
    const ch = g.chroma, luma = 1 - ch;
    const mono = stock.mono, mw = stock.monoWeights || [0.26, 0.64, 0.10];
    const sat = stock.sat;

    for (let y = 0; y < H; y++) {
      const q = ((y / scale) | 0);
      const r0 = ((q + oy) & M) * NOISE;
      const r1 = ((q + oy + 31) & M) * NOISE;
      const r2 = ((q + oy + 97) & M) * NOISE;
      const r3 = ((q + oy + 163) & M) * NOISE;
      let i = y * W * 4;
      for (let x = 0; x < W; x++, i += 4) {
        let r = lr[d[i]], gg = lg[d[i + 1]], b = lb[d[i + 2]];
        if (mono) {
          const v = mw[0] * r + mw[1] * gg + mw[2] * b;
          r = gg = b = v;
        } else if (sat !== 1) {
          const v = 0.299 * r + 0.587 * gg + 0.114 * b;
          r = v + (r - v) * sat; gg = v + (gg - v) * sat; b = v + (b - v) * sat;
        }
        let L = (0.299 * r + 0.587 * gg + 0.114 * b) | 0;
        if (L < 0) L = 0; else if (L > 255) L = 255;
        const w = MIDW[L] * amp;
        const n = tile[r0 + col0[x]];
        if (ch > 0) {
          d[i]     = r  + (n * luma + tile[r1 + col1[x]] * ch) * w;
          d[i + 1] = gg + (n * luma + tile[r2 + col2[x]] * ch) * w;
          d[i + 2] = b  + (n * luma + tile[r3 + col3[x]] * ch) * w;
        } else {
          const nv = n * w;
          d[i] = r + nv; d[i + 1] = gg + nv; d[i + 2] = b + nv;
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    /* halation: highlights bloom and bleed a red edge into what is next to them */
    const hal = stock.halation;
    if (hal.bleed > 0.01) {
      const sw = 200, sh = Math.max(8, Math.round(sw * H / W));
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const sx = sc.getContext('2d', { willReadFrequently: true });
      sx.drawImage(canvas, 0, 0, sw, sh);
      const sd = sx.getImageData(0, 0, sw, sh), p = sd.data;
      const thr = hal.threshold, inv = 1 / Math.max(0.05, 1 - thr);
      for (let i = 0; i < p.length; i += 4) {
        const L = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255;
        let e = (L - thr) * inv;
        e = e > 0 ? e * e : 0;
        p[i] = 255 * e * hal.tint[0];
        p[i + 1] = 255 * e * hal.tint[1];
        p[i + 2] = 255 * e * hal.tint[2];
        p[i + 3] = 255;
      }
      boxBlurRGBA(p, sw, sh, 5);
      sx.putImageData(sd, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(1, hal.bleed);
      ctx.drawImage(sc, 0, 0, W, H);
      ctx.restore();
    }

    /* falloff */
    if (stock.vignette > 0.01) {
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.30, W / 2, H / 2, Math.hypot(W, H) / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.62, `rgba(255,255,255,${1 - stock.vignette * 0.35})`);
      gr.addColorStop(1, `rgba(255,255,255,${1 - stock.vignette})`);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    /* light that got in */
    let leak = 0;
    for (const q of stock.quirks) {
      if (q.k !== 'leak') continue;
      if (q.frames && q.frames.includes(opt.frameNo)) leak = q.strength;
      else if (q.p && rnd() < q.p) leak = q.strength * (0.5 + rnd() * 0.5);
    }
    if (leak > 0) {
      const edge = (rnd() * 4) | 0;
      const horiz = edge < 2;
      const from = edge % 2 === 0;
      const gr = horiz
        ? ctx.createLinearGradient(from ? 0 : W, 0, from ? W * 0.62 : W * 0.38, 0)
        : ctx.createLinearGradient(0, from ? 0 : H, 0, from ? H * 0.55 : H * 0.45);
      gr.addColorStop(0, `rgba(255,168,72,${leak})`);
      gr.addColorStop(0.35, `rgba(240,96,48,${leak * 0.45})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    return canvas;
  }

  const toBlob = (canvas, q) => new Promise(r => canvas.toBlob(r, 'image/jpeg', q));

  /** Reads one negative, develops it, writes the frame and its contact-sheet size copy. */
  async function developFrame(roll, frame, stock) {
    const neg = await DB.get(DB.negKey(roll.id, frame.n));
    if (!neg) return false;
    const bmp = await createImageBitmap(neg);
    const long = 1800;
    const s = Math.min(1, long / Math.max(bmp.width, bmp.height));
    const W = Math.round(bmp.width * s), H = Math.round(bmp.height * s);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    renderTo(cv, bmp, stock, { seed: frame.seed, frameNo: frame.n, push: roll.push });
    bmp.close && bmp.close();

    const full = await toBlob(cv, 0.9);
    const tw = 480, th = Math.round(tw * H / W);
    const tc = document.createElement('canvas');
    tc.width = tw; tc.height = th;
    tc.getContext('2d').drawImage(cv, 0, 0, tw, th);
    const thumb = await toBlob(tc, 0.85);

    await DB.put(DB.frmKey(roll.id, frame.n), full);
    await DB.put(DB.thmKey(roll.id, frame.n), thumb);
    await DB.del(DB.negKey(roll.id, frame.n));
    return true;
  }

  /** The whole roll, frame by frame, yielding so the counter keeps ticking. */
  async function developRoll(roll, onProgress) {
    const stock = Stocks.get(roll.stock);
    let done = 0;
    for (const f of roll.frames) {
      try { await developFrame(roll, f, stock); }
      catch (e) { console.warn('frame ' + f.n + ' did not develop', e); }
      done++;
      if (onProgress) onProgress(done, roll.frames.length);
      await new Promise(r => setTimeout(r, 0));
    }
    await DB.delPrefix('neg:' + roll.id + ':');
    Store.markDeveloped(roll.id);
    return done;
  }

  /** The response curve as points in 0..1, for the box back. */
  function curvePoints(stock, n) {
    const N = n || 32;
    const mk = p => {
      const l = lut(p, 1, 1, 0), out = [];
      for (let i = 0; i <= N; i++) out.push(l[Math.round(i / N * 255)] / 255);
      return out;
    };
    if (stock.mono) return { y: mk(stock.curve.g) };
    return { r: mk(stock.curve.r), g: mk(stock.curve.g), b: mk(stock.curve.b) };
  }

  return { renderTo, developRoll, developFrame, toBlob, mulberry32, curvePoints };
})();
