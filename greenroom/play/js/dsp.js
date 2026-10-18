/* The listening half of Greenroom. No model, no network: this is classical
   signal processing over the recording that is already on the phone.

   Pace comes from syllable nuclei, found the way phoneticians find them: peaks
   in the loudness contour that stand at least 2 dB above the dips on either
   side and sit on a voiced frame. Counting nuclei is not the same as counting
   words, so the app reports syllables per second first and converts to words a
   minute using a stated assumption rather than pretending to transcribe.

   Pauses come from the same contour, with the silence threshold chosen by
   Otsu's method over the loudness histogram rather than a fixed number, so a
   quiet room and a noisy one are both split at the right place.

   Pitch is YIN: the cumulative mean normalised difference function, with the
   parabolic interpolation that gets you sub-sample precision, run on a 4 kHz
   decimation because human speech never goes near the top of the band. */

const DSP = (() => {

  const FR = 100;            // loudness frames per second
  const ENV_FPS = 4;         // stored envelope and pitch resolution
  const PITCH_SR = 4000;
  const SYL_PER_WORD = 1.45; // English conversational speech, used for the wpm estimate

  /* ------------------------------------------------------------- utilities */

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    const i = (sorted.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = Float64Array.from(arr).sort();
    return percentile(s, 0.5);
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /** Box decimation. Crude as a low pass and exactly good enough below 2 kHz. */
  function decimate(x, srIn, srOut) {
    const f = srIn / srOut;
    const n = Math.floor(x.length / f);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * f), b = Math.min(x.length, Math.floor((i + 1) * f));
      let s = 0;
      for (let j = a; j < b; j++) s += x[j];
      out[i] = b > a ? s / (b - a) : 0;
    }
    return out;
  }

  /* -------------------------------------------------------- loudness contour */

  /** dB per 10 ms frame over a 64 ms sliding window. */
  function loudness(x, sr) {
    const hop = Math.max(1, Math.round(sr / FR));
    const win = Math.max(hop, Math.round(sr * 0.064));
    const n = Math.max(1, Math.floor((x.length - win) / hop) + 1);
    const db = new Float32Array(n);
    let acc = 0;
    for (let j = 0; j < win && j < x.length; j++) acc += x[j] * x[j];
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const out0 = (i - 1) * hop, in0 = out0 + win;
        for (let k = 0; k < hop; k++) {
          const o = x[out0 + k] || 0, m = x[in0 + k] || 0;
          acc += m * m - o * o;
        }
      }
      const rms = Math.sqrt(Math.max(acc, 0) / win);
      db[i] = 20 * Math.log10(rms + 1e-10);
    }
    return db;
  }

  /** Otsu's threshold over a dB histogram: the split that best separates the
      quiet class from the loud one, whatever the room noise happens to be. */
  function otsu(db, lo, hi) {
    const BINS = 96;
    const h = new Float64Array(BINS);
    const span = Math.max(1e-6, hi - lo);
    for (let i = 0; i < db.length; i++) {
      const b = clamp(Math.floor(((db[i] - lo) / span) * BINS), 0, BINS - 1);
      h[b]++;
    }
    let total = db.length, sum = 0;
    for (let b = 0; b < BINS; b++) sum += b * h[b];
    let sumB = 0, wB = 0, best = -1, bestB = BINS >> 1;
    for (let b = 0; b < BINS; b++) {
      wB += h[b];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += b * h[b];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; bestB = b; }
    }
    return lo + ((bestB + 0.5) / BINS) * span;
  }

  function smooth(a, w) {
    const n = a.length, half = w >> 1;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - half), hi = Math.min(n - 1, i + half);
      let s = 0;
      for (let k = lo; k <= hi; k++) s += a[k];
      out[i] = s / (hi - lo + 1);
    }
    return out;
  }

  /** Fill holes and drop specks in a boolean mask, both measured in frames. */
  function cleanMask(mask, fillGap, minRun) {
    const n = mask.length;
    let i = 0;
    while (i < n) {
      if (!mask[i]) {
        let j = i; while (j < n && !mask[j]) j++;
        if (i > 0 && j < n && j - i <= fillGap) for (let k = i; k < j; k++) mask[k] = 1;
        i = j;
      } else i++;
    }
    i = 0;
    while (i < n) {
      if (mask[i]) {
        let j = i; while (j < n && mask[j]) j++;
        if (j - i < minRun) for (let k = i; k < j; k++) mask[k] = 0;
        i = j;
      } else i++;
    }
    return mask;
  }

  /* ------------------------------------------------------------- voicing */

  /** Normalised autocorrelation peak over the speech F0 band, at one instant. */
  function voicedAt(p, sr, centre) {
    const W = 512, tauMin = 10, tauMax = 100;
    let a = Math.round(centre * sr) - (W >> 1);
    a = clamp(a, 0, Math.max(0, p.length - W - tauMax - 1));
    if (p.length < W + tauMax + 2) return false;
    let e0 = 0;
    for (let j = 0; j < W; j++) e0 += p[a + j] * p[a + j];
    if (e0 < 1e-9) return false;
    let best = 0;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      let s = 0, e1 = 0;
      for (let j = 0; j < W; j++) { const v = p[a + j + tau]; s += p[a + j] * v; e1 += v * v; }
      if (e1 < 1e-12) continue;
      const r = s / Math.sqrt(e0 * e1);
      if (r > best) best = r;
    }
    return best > 0.32;
  }

  /* --------------------------------------------------------- the fast pass */

  /** Loudness, silence, pauses and syllable nuclei. Milliseconds, not seconds. */
  function quick(x, sr) {
    const db = loudness(x, sr);
    const n = db.length;
    const dur = x.length / sr;
    if (n < 20) return null;

    const sorted = Float32Array.from(db).sort();
    const floorDb = percentile(sorted, 0.05);
    const peakDb = percentile(sorted, 0.97);
    const maxDb = sorted[n - 1];

    let sp = otsu(db, floorDb, maxDb);
    const lowCap = floorDb + 4, highCap = peakDb - 4;
    if (!(sp > lowCap)) sp = lowCap;
    if (sp > highCap) sp = highCap;
    // A recording with no real silence in it should not be cut in half.
    if (peakDb - floorDb < 10) sp = floorDb + (peakDb - floorDb) * 0.3;

    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) mask[i] = db[i] > sp ? 1 : 0;
    cleanMask(mask, 8, 6);

    let f0 = 0; while (f0 < n && !mask[f0]) f0++;
    let f1 = n - 1; while (f1 > f0 && !mask[f1]) f1--;
    if (f1 - f0 < 20) return null;

    const t0 = f0 / FR, t1 = (f1 + 1) / FR;

    // pauses inside the speech
    const pauses = [];
    for (let i = f0; i <= f1; i++) {
      if (mask[i]) continue;
      let j = i; while (j <= f1 && !mask[j]) j++;
      const len = (j - i) / FR;
      if (len >= 0.3) pauses.push({ at: +(i / FR).toFixed(2), len: +len.toFixed(2) });
      i = j;
    }

    // syllable nuclei
    const sdb = smooth(db, 3);
    const pkFloor = Math.max(sp + 1.5, peakDb - 26);
    const cand = [];
    for (let i = f0 + 1; i < f1; i++) {
      if (sdb[i] < pkFloor) continue;
      if (sdb[i] >= sdb[i - 1] && sdb[i] > sdb[i + 1]) cand.push(i);
    }
    // Two nuclei need a 2 dB valley between them, else they are one.
    const kept = [];
    for (let i = 0; i < cand.length; i++) {
      const c = cand[i];
      if (!kept.length) { kept.push(c); continue; }
      const prev = kept[kept.length - 1];
      let dip = Infinity;
      for (let k = prev; k <= c; k++) if (sdb[k] < dip) dip = sdb[k];
      const rise = Math.min(sdb[prev], sdb[c]) - dip;
      if (rise >= 2.0 && c - prev >= 9) kept.push(c);
      else if (sdb[c] > sdb[prev]) kept[kept.length - 1] = c;
    }

    const pit = decimate(x, sr, PITCH_SR);
    const syl = [];
    for (const c of kept) {
      const t = c / FR;
      if (voicedAt(pit, PITCH_SR, t)) syl.push(+t.toFixed(2));
    }

    // per-second syllable counts, which is all the pace curve needs
    const secs = Math.max(1, Math.ceil(dur));
    const sylSec = new Array(secs).fill(0);
    for (const t of syl) sylSec[clamp(Math.floor(t), 0, secs - 1)]++;

    // stored envelope, 4 frames a second, 0..100 of the take's own range
    const envN = Math.max(1, Math.ceil(dur * ENV_FPS));
    const env = new Array(envN).fill(0);
    const range = Math.max(6, peakDb - floorDb);
    for (let i = 0; i < envN; i++) {
      const a = Math.floor(i * FR / ENV_FPS), b = Math.min(n, Math.floor((i + 1) * FR / ENV_FPS));
      let m = -200;
      for (let k = a; k < b; k++) if (db[k] > m) m = db[k];
      env[i] = m <= -200 ? 0 : Math.round(clamp((m - floorDb) / range, 0, 1) * 100);
    }

    // level: how steady you stayed, in your own units rather than absolute ones
    const spFrames = [];
    for (let i = f0; i <= f1; i++) if (mask[i]) spFrames.push(db[i]);
    const spSorted = Float64Array.from(spFrames).sort();
    const medDb = percentile(spSorted, 0.5);
    const dynRange = percentile(spSorted, 0.9) - percentile(spSorted, 0.1);

    // quiet stretches, judged against your own median rather than a meter
    const run = new Float32Array(n);
    {
      const W = 200; // 2 s
      let acc = 0, cnt = 0;
      const q = [];
      for (let i = f0; i <= f1; i++) {
        if (mask[i]) { acc += db[i]; cnt++; q.push(i); }
        while (q.length && i - q[0] > W) { const o = q.shift(); acc -= db[o]; cnt--; }
        run[i] = cnt > 3 ? acc / cnt : medDb;
      }
    }
    const quiet = collectRuns(run, f0, f1, v => v <= medDb - 8, 6.0);
    const mono = [];   // filled by the pitch pass
    const endDrop = (() => {
      const cut = f0 + Math.floor((f1 - f0) * 0.88);
      let a = 0, an = 0, b = 0, bn = 0;
      for (let i = f0; i <= f1; i++) {
        if (!mask[i]) continue;
        if (i < cut) { a += db[i]; an++; } else { b += db[i]; bn++; }
      }
      return an > 20 && bn > 5 ? (a / an) - (b / bn) : 0;
    })();

    const speechSec = t1 - t0;
    const pauseSec = pauses.reduce((s, p) => s + p.len, 0);
    const articSec = Math.max(0.5, speechSec - pauseSec);
    const braveCount = pauses.filter(p => p.len >= 0.8).length;

    const stats = {
      dur: +dur.toFixed(2),
      speechSec: +speechSec.toFixed(2),
      articSec: +articSec.toFixed(2),
      sylTotal: syl.length,
      rate: +(syl.length / speechSec).toFixed(3),
      artRate: +(syl.length / articSec).toFixed(3),
      wpm: Math.round((syl.length / speechSec) * 60 / SYL_PER_WORD),
      artWpm: Math.round((syl.length / articSec) * 60 / SYL_PER_WORD),
      pauseCount: pauses.length,
      braveCount: braveCount,
      bravePerMin: +(braveCount / (speechSec / 60)).toFixed(2),
      pauseSec: +pauseSec.toFixed(2),
      longestPause: pauses.reduce((m, p) => Math.max(m, p.len), 0),
      dynRange: +dynRange.toFixed(1),
      quietSec: +quiet.reduce((s, r) => s + r.len, 0).toFixed(1),
      endDrop: +endDrop.toFixed(1),
      semiSd: null, monoSec: null, voicedPct: null
    };

    return {
      dur: +dur.toFixed(2), t0: +t0.toFixed(2), t1: +t1.toFixed(2),
      env: env, syl: sylSec, sylTimes: syl, pauses: pauses,
      quiet: quiet, mono: mono, fast: paceRuns(sylSec, t0, t1),
      pitch: null, stats: stats,
      _pcm4k: pit
    };
  }

  /** Contiguous runs where `test` holds for at least `minSec`. */
  function collectRuns(series, f0, f1, test, minSec) {
    const out = [];
    let i = f0;
    while (i <= f1) {
      if (!test(series[i])) { i++; continue; }
      let j = i; while (j <= f1 && test(series[j])) j++;
      const len = (j - i) / FR;
      if (len >= minSec) out.push({ at: +(i / FR).toFixed(2), len: +len.toFixed(2) });
      i = j;
    }
    return out;
  }

  /** Words a minute across time, and the stretches where you ran away with it. */
  function paceCurve(sylSec) {
    const W = 6; // +/- 6 s, a 13 second triangular window
    const n = sylSec.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, w = 0;
      for (let k = -W; k <= W; k++) {
        const j = i + k;
        if (j < 0 || j >= n) continue;
        const wt = 1 - Math.abs(k) / (W + 1);
        s += sylSec[j] * wt; w += wt;
      }
      out[i] = w > 0 ? (s / w) * 60 / SYL_PER_WORD : 0;
    }
    return out;
  }

  function paceRuns(sylSec, t0, t1) {
    const c = paceCurve(sylSec);
    const a = Math.floor(t0), b = Math.min(c.length - 1, Math.ceil(t1));
    const vals = [];
    for (let i = a; i <= b; i++) vals.push(c[i]);
    const base = median(vals);
    const trig = Math.max(base * 1.16, 155);
    const out = [];
    let i = a;
    while (i <= b) {
      if (c[i] < trig) { i++; continue; }
      let j = i; while (j <= b && c[j] >= trig * 0.94) j++;
      if (j - i >= 12) {
        let pk = 0; for (let k = i; k < j; k++) pk = Math.max(pk, c[k]);
        out.push({ at: i, len: j - i, wpm: Math.round(pk) });
      }
      i = j;
    }
    return out;
  }

  /* ------------------------------------------------------- the pitch pass */

  /** YIN over the 4 kHz decimation, yielding to the page every few frames. */
  async function pitch(fast, onProgress) {
    const p = fast._pcm4k;
    const sr = PITCH_SR;
    const W = 512, tauMin = 10, tauMax = 100, hop = 160; // 40 ms frames
    const need = W + tauMax + 1;
    const n = Math.max(0, Math.floor((p.length - need) / hop) + 1);
    const f0 = new Float32Array(n);
    const d = new Float32Array(tauMax + 1);
    const cm = new Float32Array(tauMax + 1);

    const envAt = t => {
      const i = clamp(Math.floor(t * ENV_FPS), 0, fast.env.length - 1);
      return fast.env[i];
    };

    for (let i = 0; i < n; i++) {
      if ((i & 255) === 0) {
        if (onProgress) onProgress(i / Math.max(1, n));
        await new Promise(r => setTimeout(r, 0));
      }
      const a = i * hop;
      const t = (a + W / 2) / sr;
      if (envAt(t) < 12) { f0[i] = 0; continue; }

      let e = 0;
      for (let j = 0; j < W; j++) e += p[a + j] * p[a + j];
      if (e < 2e-7) { f0[i] = 0; continue; }

      d[0] = 0;
      for (let tau = 1; tau <= tauMax; tau++) {
        let s = 0;
        for (let j = 0; j < W; j++) { const v = p[a + j] - p[a + j + tau]; s += v * v; }
        d[tau] = s;
      }
      let acc = 0;
      cm[0] = 1;
      for (let tau = 1; tau <= tauMax; tau++) {
        acc += d[tau];
        cm[tau] = acc > 0 ? d[tau] * tau / acc : 1;
      }
      let tau = -1;
      for (let k = tauMin; k <= tauMax; k++) {
        if (cm[k] < 0.15) {
          while (k + 1 <= tauMax && cm[k + 1] < cm[k]) k++;
          tau = k; break;
        }
      }
      if (tau < 0) {
        let best = 1, bi = -1;
        for (let k = tauMin; k <= tauMax; k++) if (cm[k] < best) { best = cm[k]; bi = k; }
        if (best < 0.32) tau = bi;
      }
      if (tau < tauMin) { f0[i] = 0; continue; }
      // parabolic interpolation for sub-sample precision
      let t2 = tau;
      if (tau > tauMin && tau < tauMax) {
        const y0 = cm[tau - 1], y1 = cm[tau], y2 = cm[tau + 1];
        const den = 2 * (2 * y1 - y0 - y2);
        if (Math.abs(den) > 1e-9) t2 = tau + (y2 - y0) / den;
      }
      const hz = sr / t2;
      f0[i] = (hz >= 55 && hz <= 400) ? hz : 0;
    }

    // a 3 point median kills the octave slips YIN still makes at consonants
    const med = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = f0[Math.max(0, i - 1)], b = f0[i], c = f0[Math.min(n - 1, i + 1)];
      med[i] = (a + b + c) - Math.min(a, b, c) - Math.max(a, b, c);
    }

    const voiced = [];
    for (let i = 0; i < n; i++) if (med[i] > 0) voiced.push(med[i]);
    const base = voiced.length > 8 ? median(voiced) : 0;

    // semitones against your own middle, stored at 4 frames a second
    const outN = Math.max(1, Math.ceil(fast.dur * ENV_FPS));
    const semi = new Array(outN).fill(999);
    const per = (sr / hop) / ENV_FPS;
    for (let i = 0; i < outN; i++) {
      const a = Math.floor(i * per), b = Math.min(n, Math.floor((i + 1) * per));
      const vals = [];
      for (let k = a; k < b; k++) if (med[k] > 0) vals.push(med[k]);
      if (!vals.length || !base) continue;
      const hz = median(vals);
      semi[i] = Math.round(12 * Math.log2(hz / base) * 10);
    }

    const sv = [];
    for (const v of semi) if (v !== 999) sv.push(v / 10);
    const sSorted = Float64Array.from(sv).sort();
    const iqr = percentile(sSorted, 0.75) - percentile(sSorted, 0.25);
    const semiSd = sv.length > 12 ? +(iqr / 1.349).toFixed(2) : 0;

    // monotone stretches: ten seconds where the voice barely moves
    const mono = [];
    const WIN = 10 * ENV_FPS;
    let i = 0;
    while (i < outN - WIN) {
      const spread = spreadOf(semi, i, i + WIN);
      if (spread === null || spread > 1.1) { i++; continue; }
      let j = i + WIN;
      while (j < outN) {
        const s2 = spreadOf(semi, j - WIN, j + 1);
        if (s2 === null || s2 > 1.3) break;
        j++;
      }
      mono.push({ at: +(i / ENV_FPS).toFixed(1), len: +((j - i) / ENV_FPS).toFixed(1) });
      i = j + WIN;
    }

    return {
      semi: semi, semiSd: semiSd, mono: mono,
      voicedPct: Math.round(100 * sv.length / Math.max(1, outN)),
      monoSec: +mono.reduce((s, m) => s + m.len, 0).toFixed(1)
    };
  }

  function spreadOf(semi, a, b) {
    const v = [];
    for (let i = a; i < b && i < semi.length; i++) if (semi[i] !== 999) v.push(semi[i] / 10);
    if (v.length < (b - a) * 0.45) return null;
    const s = Float64Array.from(v).sort();
    return (percentile(s, 0.75) - percentile(s, 0.25)) / 1.349;
  }

  /** Fold the pitch pass into the signal set and hand back what gets stored. */
  function merge(fast, pit) {
    const sig = {
      dur: fast.dur, t0: fast.t0, t1: fast.t1,
      env: fast.env, syl: fast.syl, pauses: fast.pauses,
      quiet: fast.quiet, fast: fast.fast,
      pitch: pit ? pit.semi : null,
      mono: pit ? pit.mono : [],
      stats: Object.assign({}, fast.stats, pit ? {
        semiSd: pit.semiSd, monoSec: pit.monoSec, voicedPct: pit.voicedPct
      } : {})
    };
    return sig;
  }

  return { quick, pitch, merge, paceCurve, median, percentile, SYL_PER_WORD, ENV_FPS };
})();
