/* The listening half of Loopwright. Nothing here is a model and nothing here
   phones anywhere: it is the classical signal processing that turns a hum into
   notes and a mouth-drum into hits, on this phone, in about a fifth of a second.

   Pitch is YIN (a normalised difference function with the octave trap that plain
   autocorrelation falls into removed). Drums are spectral flux onsets sorted by
   where their energy sits. Key is a Krumhansl style profile correlation. Tempo
   is a grid search that asks which pulse the take fits with the least argument.

   The whole design principle is forgiveness: the grid is fitted to you, not the
   other way round, and quantisation is a pull towards the grid rather than a
   snap onto it, so timing keeps its character while losing its accidents. */

const DSP = (() => {

  /* --------------------------------------------------------------- helpers */
  function resample(x, srIn, srOut) {
    if (Math.abs(srIn - srOut) < 1) return x;
    const ratio = srIn / srOut;
    const n = Math.floor(x.length / ratio);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i * ratio, i0 = t | 0, f = t - i0;
      const a = x[i0] || 0, b = x[i0 + 1] !== undefined ? x[i0 + 1] : a;
      out[i] = a + (b - a) * f;
    }
    return out;
  }

  function median(a) {
    if (!a.length) return 0;
    const s = Array.prototype.slice.call(a).sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  const midiOf = f => 69 + 12 * Math.log2(f / 440);
  const hzOf = m => 440 * Math.pow(2, (m - 69) / 12);

  function rmsOf(x, from, n) {
    let s = 0;
    for (let i = 0; i < n; i++) { const v = x[from + i] || 0; s += v * v; }
    return Math.sqrt(s / n);
  }

  /** Peak level of a take, used to decide whether anything was said at all. */
  function peak(x) {
    let p = 0;
    for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > p) p = v; }
    return p;
  }

  /* ------------------------------------------------------------------ FFT */
  // Iterative radix 2. Real input, in-place on the supplied buffers.
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }

  /* ------------------------------------------------------- pitch, the hum */
  const PSR = 11025;          // plenty for a voice, and four times faster to search
  const W = 800;              // 72ms window
  const HOP = 160;            // 14.5ms steps
  const TAU_MIN = 12;         // 918 Hz
  const TAU_MAX = 170;        // 65 Hz

  /** Frame by frame fundamental, with a confidence for each frame. */
  function pitchTrack(x0, sr) {
    const x = resample(x0, sr, PSR);
    const frames = [];
    const d = new Float32Array(TAU_MAX + 1);
    const cm = new Float32Array(TAU_MAX + 1);
    let loud = 0;
    for (let pos = 0; pos + W < x.length; pos += HOP) {
      const rms = rmsOf(x, pos, W);
      if (rms > loud) loud = rms;
      frames.push({ t: pos / PSR, rms, f: 0, clarity: 0 });
    }
    let fi = 0;
    for (let pos = 0; pos + W < x.length; pos += HOP, fi++) {
      const fr = frames[fi];
      if (fr.rms < 0.004) continue;
      const N = W - TAU_MAX;
      for (let tau = 1; tau <= TAU_MAX; tau++) {
        let s = 0;
        for (let j = 0; j < N; j++) { const dd = x[pos + j] - x[pos + j + tau]; s += dd * dd; }
        d[tau] = s;
      }
      let run = 0;
      cm[0] = 1;
      for (let tau = 1; tau <= TAU_MAX; tau++) {
        run += d[tau];
        cm[tau] = run > 0 ? d[tau] * tau / run : 1;
      }
      let best = -1;
      for (let tau = TAU_MIN; tau <= TAU_MAX; tau++) {
        if (cm[tau] < 0.14) {
          while (tau + 1 <= TAU_MAX && cm[tau + 1] < cm[tau]) tau++;
          best = tau; break;
        }
      }
      if (best < 0) {
        let m = 1e9;
        for (let tau = TAU_MIN; tau <= TAU_MAX; tau++) if (cm[tau] < m) { m = cm[tau]; best = tau; }
      }
      if (best <= TAU_MIN || best >= TAU_MAX) continue;
      // Parabolic refinement on the difference curve.
      const a = d[best - 1], b = d[best], c = d[best + 1];
      const den = a - 2 * b + c;
      const shift = den !== 0 ? 0.5 * (a - c) / den : 0;
      const tau = best + Math.max(-1, Math.min(1, shift));
      fr.f = PSR / tau;
      fr.clarity = Math.max(0, 1 - cm[best]);
    }
    const gate = Math.max(0.006, loud * 0.13);
    frames.forEach(fr => { fr.voiced = fr.f > 0 && fr.clarity > 0.72 && fr.rms > gate; });
    // A five frame median tidies the wobble at the edges of a note.
    const m = frames.map(fr => (fr.voiced ? midiOf(fr.f) : null));
    for (let i = 0; i < frames.length; i++) {
      if (m[i] === null) continue;
      const win = [];
      for (let k = i - 2; k <= i + 2; k++) if (m[k] !== undefined && m[k] !== null) win.push(m[k]);
      frames[i].m = median(win);
    }
    return { frames, loud, hop: HOP / PSR };
  }

  /** Runs of steady pitch become notes; the gaps and the leaps end them. */
  function segmentNotes(track) {
    const { frames, hop, loud } = track;
    const notes = [];
    let cur = null;
    let gap = 0, drift = 0, driftAt = -1;

    const close = endIdx => {
      if (!cur) return;
      const ms = cur.ms, dur = (endIdx - cur.i0) * hop;
      if (ms.length >= 3 && dur >= 0.075) {
        notes.push({
          p: median(ms), t: cur.i0 * hop, d: dur,
          v: Math.max(0.35, Math.min(1, cur.rms / (loud || 1)))
        });
      }
      cur = null; drift = 0; driftAt = -1;
    };

    for (let i = 0; i < frames.length; i++) {
      const fr = frames[i];
      if (!fr.voiced || fr.m === undefined) {
        gap++;
        if (cur && gap * hop > 0.07) close(i - gap + 1);
        continue;
      }
      gap = 0;
      if (!cur) { cur = { i0: i, ms: [fr.m], rms: fr.rms }; continue; }
      const ref = median(cur.ms.slice(-9));
      if (Math.abs(fr.m - ref) > 0.68) {
        if (driftAt < 0) driftAt = i;
        drift++;
        if (drift >= 3) {
          const start = driftAt;
          const keep = frames.slice(start, i + 1).filter(f => f.m !== undefined).map(f => f.m);
          close(start);
          cur = { i0: start, ms: keep, rms: fr.rms };
        }
      } else {
        drift = 0; driftAt = -1;
        cur.ms.push(fr.m);
        cur.rms = Math.max(cur.rms, fr.rms);
      }
    }
    close(frames.length);
    return notes;
  }

  /** A hum in, a melody out. Times are seconds from the top of the take. */
  function hearMelody(samples, sr) {
    if (peak(samples) < 0.02) return { notes: [], quiet: true };
    const track = pitchTrack(samples, sr);
    const notes = segmentNotes(track);
    return { notes, quiet: false };
  }

  /* --------------------------------------------------- onsets, the drums */
  const DSR = 22050, N = 512, DHOP = 128;

  function spectra(x0, sr) {
    const x = resample(x0, sr, DSR);
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const out = [];
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let pos = 0; pos + N < x.length; pos += DHOP) {
      for (let i = 0; i < N; i++) { re[i] = x[pos + i] * win[i]; im[i] = 0; }
      fft(re, im);
      const mag = new Float32Array(N / 2);
      for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
      out.push({ t: pos / DSR, mag });
    }
    return out;
  }

  const binOf = hz => Math.round(hz * N / DSR);

  function bands(mag) {
    let low = 0, mid = 0, high = 0, num = 0, den = 0;
    const b1 = binOf(240), b2 = binOf(2000), b3 = binOf(9500), b0 = binOf(28);
    for (let k = b0; k < b3 && k < mag.length; k++) {
      const e = mag[k] * mag[k];
      if (k < b1) low += e; else if (k < b2) mid += e; else high += e;
      num += e * k * DSR / N; den += e;
    }
    return { low, mid, high, total: low + mid + high + 1e-12, cen: den > 0 ? num / den : 0 };
  }

  /** Where a hit starts, and which of the three sounds it is. */
  function hearDrums(samples, sr) {
    if (peak(samples) < 0.02) return { hits: [], quiet: true };
    const sp = spectra(samples, sr);
    if (sp.length < 4) return { hits: [], quiet: true };
    const flux = new Float32Array(sp.length);
    let fmax = 0;
    for (let i = 1; i < sp.length; i++) {
      let s = 0;
      const a = sp[i].mag, b = sp[i - 1].mag;
      for (let k = 2; k < a.length; k++) { const dd = a[k] - b[k]; if (dd > 0) s += dd; }
      flux[i] = s;
      if (s > fmax) fmax = s;
    }
    if (fmax <= 0) return { hits: [], quiet: true };

    const spanFrames = Math.round(0.11 / (DHOP / DSR));
    const hits = [];
    let lastT = -1;
    for (let i = 2; i < flux.length - 1; i++) {
      const win = [];
      for (let k = Math.max(0, i - spanFrames); k < Math.min(flux.length, i + spanFrames); k++) win.push(flux[k]);
      const thr = median(win) * 1.9 + fmax * 0.055;
      if (flux[i] < thr) continue;
      if (flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
      const t = sp[i].t;
      if (lastT >= 0 && t - lastT < 0.055) continue;
      lastT = t;
      // Read the colour just after the transient, where the body of the sound is.
      const b1 = bands(sp[Math.min(i + 1, sp.length - 1)].mag);
      const b2 = bands(sp[Math.min(i + 3, sp.length - 1)].mag);
      const low = (b1.low + b2.low) / (b1.total + b2.total);
      const mid = (b1.mid + b2.mid) / (b1.total + b2.total);
      const high = (b1.high + b2.high) / (b1.total + b2.total);
      const cen = (b1.cen + b2.cen) / 2;
      // Three mouth sounds, three places the energy sits. The centroid bonuses only
      // break ties: b and p are all bottom, ts and ch are all top, and everything
      // in the speech band between them is a snare.
      const kick = low * 2.4 + (cen < 520 ? 0.55 : 0);
      const hat = high * 2.2 + (cen > 5400 ? 0.5 : 0);
      const snare = mid * 1.6 + 0.40 + (cen > 1100 && cen < 4800 ? 0.32 : 0);
      const lane = kick >= hat && kick >= snare ? 0 : (hat >= snare ? 2 : 1);
      hits.push({ lane, t, v: Math.max(0.4, Math.min(1, flux[i] / fmax)) });
    }
    return { hits, quiet: hits.length === 0 };
  }

  /* --------------------------------------------------------------- tempo */
  /** How badly a set of times argues with a grid of the given step, best phase wins.
      The error is a fraction of a step, so the measure is free of scale. */
  function gridCost(times, step) {
    let cost = 1e9;
    for (let ph = 0; ph < 12; ph++) {
      const off = ph * step / 12;
      let c = 0;
      for (let i = 0; i < times.length; i++) {
        let r = ((times[i] + off) / step) % 1;
        if (r < 0) r += 1;
        const dd = Math.min(r, 1 - r);
        c += dd * dd;
      }
      if (c < cost) cost = c;
    }
    return cost / times.length;
  }

  /** Which pulse does this take argue with least. Returns beats per minute or 0.

      Sixteenths alone are not enough: half and double a tempo fit them equally
      well, so the eighth and the beat are weighed in too, and a log-normal prior
      around a walking pulse settles the octave. Choosing between 70 and 140 is
      genuinely ambiguous in the signal; people are not, and they mostly mean the
      one nearer their own footsteps. */
  const TEMPO_CENTRE = 112, TEMPO_SPREAD = 2.4;

  function inferTempo(times) {
    if (times.length < 3) return 0;
    let best = 0, bestCost = 1e9;
    for (let bpm = 58; bpm <= 184; bpm += 0.5) {
      const beat = 60 / bpm;
      const lg = Math.log2(bpm / TEMPO_CENTRE);
      const cost = (gridCost(times, beat / 4) +
                    0.50 * gridCost(times, beat / 2) +
                    0.20 * gridCost(times, beat)) *
                   Math.exp(TEMPO_SPREAD * lg * lg);
      if (cost < bestCost) { bestCost = cost; best = bpm; }
    }
    return best;
  }

  const BAR_CHOICES = [2, 3, 4, 6, 8, 12, 16, 24, 32];

  /** A take of D seconds becomes an exact number of beats, so the loop is seamless. */
  function fitLoop(duration, times) {
    const est = inferTempo(times) || 102;
    let bestN = 8, bestErr = 1e9;
    for (const n of BAR_CHOICES) {
      const bpm = 60 * n / duration;
      if (bpm < 55 || bpm > 190) continue;
      const err = Math.abs(Math.log2(bpm / est));
      if (err < bestErr) { bestErr = err; bestN = n; }
    }
    let bpm = 60 * bestN / duration;
    while (bpm > 190) { bpm /= 2; bestN /= 2; }
    while (bpm < 55) { bpm *= 2; bestN *= 2; }
    return { bpm: Math.round(bpm * 10) / 10, beats: Math.max(2, Math.round(bestN)) };
  }

  /* ----------------------------------------------------------------- key */
  // Krumhansl and Kessler's tone profiles: how much each degree belongs.
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  function corr(a, b) {
    const ma = a.reduce((x, y) => x + y, 0) / 12, mb = b.reduce((x, y) => x + y, 0) / 12;
    let num = 0, da = 0, dbv = 0;
    for (let i = 0; i < 12; i++) {
      const x = a[i] - ma, y = b[i] - mb;
      num += x * y; da += x * x; dbv += y * y;
    }
    return da > 0 && dbv > 0 ? num / Math.sqrt(da * dbv) : -1;
  }

  /** The key a melody implies, weighted by how long each pitch class was held. */
  function inferKey(notes) {
    const h = new Array(12).fill(0);
    let tot = 0;
    notes.forEach(n => {
      const pc = ((Math.round(n.p) % 12) + 12) % 12;
      h[pc] += n.d; tot += n.d;
    });
    if (tot <= 0) return null;
    let best = null;
    for (let t = 0; t < 12; t++) {
      for (const mode of ['major', 'minor']) {
        const prof = mode === 'major' ? MAJ : MIN;
        const rot = new Array(12);
        for (let i = 0; i < 12; i++) rot[i] = prof[(i - t + 12) % 12];
        const c = corr(h, rot);
        if (!best || c > best.c) best = { tonic: t, mode, c };
      }
    }
    return best;
  }

  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

  /** The nearest note that belongs to the key. Ties fall downward, which sings better. */
  function snapToKey(midi, tonic, mode) {
    const sc = SCALES[mode] || SCALES.minor;
    const r = Math.round(midi);
    const pc = ((r - tonic) % 12 + 12) % 12;
    if (sc.indexOf(pc) >= 0) return r;
    for (let step = 1; step <= 2; step++) {
      const down = ((pc - step) % 12 + 12) % 12;
      if (sc.indexOf(down) >= 0) return r - step;
      const up = (pc + step) % 12;
      if (sc.indexOf(up) >= 0) return r + step;
    }
    return r;
  }

  /** The third and fifth above a note, inside the key. Long low hums become chords. */
  function chordOn(midi, tonic, mode) {
    const sc = SCALES[mode] || SCALES.minor;
    const pc = ((midi - tonic) % 12 + 12) % 12;
    let deg = sc.indexOf(pc);
    if (deg < 0) return [midi];
    const at = i => {
      const d = sc[(deg + i) % 7] + 12 * Math.floor((deg + i) / 7);
      return midi + (d - sc[deg]);
    };
    return [midi, at(2), at(4)];
  }

  /* ---------------------------------------------------------- quantising */
  /** How far the whole take should slide so it sits on the grid. This absorbs both
      the phone's input delay and the human habit of playing slightly ahead. */
  function bestShift(beats, subdiv) {
    if (!beats.length) return 0;
    const step = 1 / subdiv;
    let best = 0, bestCost = 1e9;
    for (let sh = -0.4; sh <= 0.4001; sh += 0.005) {
      let c = 0;
      for (let i = 0; i < beats.length; i++) {
        const r = ((beats[i] + sh) / step) % 1;
        const dd = Math.min(Math.abs(r), Math.abs(1 - r));
        c += dd * dd;
      }
      if (c < bestCost) { bestCost = c; best = sh; }
    }
    return best;
  }

  /** Does this take swing. Returns the lateness of the offbeats, in beats. */
  function detectSwing(beats) {
    const offs = [];
    beats.forEach(b => {
      const eighth = Math.round(b * 2);
      if (eighth % 2 === 0) return;
      const d = b - eighth / 2;
      if (Math.abs(d) < 0.24) offs.push(d);
    });
    if (offs.length < 3) return 0;
    const m = median(offs);
    return m > 0.045 ? Math.min(0.17, m) : 0;
  }

  function gridSnap(b, swing) {
    if (!swing) return Math.round(b * 4) / 4;
    const eighth = Math.round(b * 2);
    const base = eighth / 2;
    const target = eighth % 2 ? base + swing : base;
    const alt = Math.round(b * 4) / 4;
    return Math.abs(b - target) <= Math.abs(b - alt) ? target : alt;
  }

  /** Pull towards the grid rather than snap onto it. Strength 1 is a machine. */
  function quantise(beats, strength, swing, loopBeats) {
    const sh = bestShift(beats, swing ? 2 : 4);
    return beats.map(b => {
      const x = b + sh;
      const q = gridSnap(x, swing);
      let out = x + strength * (q - x);
      out = ((out % loopBeats) + loopBeats) % loopBeats;
      return out;
    });
  }

  return {
    hearMelody, hearDrums, inferTempo, fitLoop, inferKey, snapToKey, chordOn,
    quantise, detectSwing, bestShift, midiOf, hzOf, median, resample, peak, SCALES
  };
})();

window.DSP = DSP;
