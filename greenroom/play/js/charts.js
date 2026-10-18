/* Every picture in the app. They share one rule: silence is drawn as empty
   space rather than as a colour, because the point being made about pauses is
   that they are room to breathe, and a chart that fills them in argues the
   opposite. There is one accent here and there is no second hue. */

const Charts = (() => {

  const ACCENT = '#F5B44C';
  const SOFT = '#FFD79A';
  const FG = '#EAF4EC';

  function setup(cv, h) {
    const d = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || cv.parentNode.clientWidth || 320;
    const hh = h || cv.clientHeight || 80;
    cv.width = Math.round(w * d);
    cv.height = Math.round(hh * d);
    const c = cv.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, w, hh);
    return { c, w, h: hh };
  }

  const inRuns = (runs, t) => !!(runs || []).find(r => t >= r.at && t < r.at + r.len);

  /** The stored envelope spans a whole take's range, silence included, so speech
      sits in the top quarter of it and every waveform would look like a fence.
      Stretch it over the speaking range instead, and a quiet passage reads as
      quiet rather than as one more bar. */
  function envRange(env) {
    const v = [];
    for (let i = 0; i < env.length; i++) if (env[i] > 0) v.push(env[i]);
    if (v.length < 8) return { lo: 0, hi: 100 };
    const s = Float64Array.from(v).sort();
    const at = q => s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)))];
    let lo = at(0.04), hi = at(0.99);
    if (hi - lo < 14) { const m = (hi + lo) / 2; lo = m - 7; hi = m + 7; }
    return { lo: lo, hi: hi };
  }
  const stretch = (v, r) => Math.max(0, Math.min(1, (v - r.lo) / Math.max(1, r.hi - r.lo)));

  /* ---------------------------------------------------------- the waveform */

  /** The transport picture: loudness mirrored about a centre line, with every
      pause left as a literal gap and the marks you tapped shown as ticks. */
  function wave(cv, sig, opts) {
    opts = opts || {};
    const { c, w, h } = setup(cv);
    const env = sig.env || [];
    const fps = 4;
    const dur = sig.dur || (env.length / fps) || 1;
    const mid = h / 2;
    const bw = 2, gap = 1;
    const n = Math.max(1, Math.floor(w / (bw + gap)));

    c.strokeStyle = 'rgba(157,184,168,0.22)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, mid + 0.5); c.lineTo(w, mid + 0.5); c.stroke();

    const range = envRange(env);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * dur;
      if (inRuns(sig.pauses, t)) continue;
      const a = Math.floor((i / n) * env.length), b = Math.max(a + 1, Math.floor(((i + 1) / n) * env.length));
      let v = 0;
      for (let k = a; k < b && k < env.length; k++) v = Math.max(v, env[k]);
      if (v <= 0) continue;
      const hh = Math.max(1.5, (0.10 + 0.90 * stretch(v, range)) * (h * 0.42));
      const played = opts.pos !== undefined && t <= opts.pos;
      if (played) {
        const gg = c.createLinearGradient(0, mid - hh, 0, mid + hh);
        gg.addColorStop(0, SOFT); gg.addColorStop(0.5, ACCENT); gg.addColorStop(1, SOFT);
        c.fillStyle = gg;
      } else c.fillStyle = 'rgba(157,184,168,0.5)';
      c.fillRect(i * (bw + gap), mid - hh, bw, hh * 2);
    }

    (opts.marks || []).forEach(t => {
      const x = (t / dur) * w;
      c.fillStyle = FG;
      c.fillRect(x - 0.5, 2, 1.5, 6);
      c.fillRect(x - 0.5, h - 8, 1.5, 6);
    });
  }

  /* -------------------------------------------------------------- the pace */

  function pace(cv, sig) {
    const { c, w, h } = setup(cv, 84);
    const curve = DSP.paceCurve(sig.syl || []);
    const a = Math.floor(sig.t0), b = Math.min(curve.length - 1, Math.ceil(sig.t1));
    if (b <= a) return;
    const lo = 60, hi = 220;
    const Y = v => h - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * h;

    // the comfortable band, drawn as ground rather than as a line, with its
    // edges named so the curve can be read against something
    c.fillStyle = 'rgba(245,180,76,0.07)';
    c.fillRect(0, Y(160), w, Y(110) - Y(160));
    c.strokeStyle = 'rgba(157,184,168,0.22)';
    c.lineWidth = 1;
    c.setLineDash([3, 3]);
    [110, 160].forEach(v => { c.beginPath(); c.moveTo(0, Y(v) + 0.5); c.lineTo(w, Y(v) + 0.5); c.stroke(); });
    c.setLineDash([]);
    c.fillStyle = 'rgba(157,184,168,0.7)';
    c.font = '600 9.5px Archivo, sans-serif';
    c.fillText('160', 3, Y(160) - 3);
    c.fillText('110', 3, Y(110) + 10);

    c.strokeStyle = ACCENT;
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = a; i <= b; i++) {
      const x = ((i - a) / (b - a)) * w;
      const y = Y(curve[i]);
      if (i === a) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();

    (sig.fast || []).forEach(r => {
      const x0 = ((r.at - a) / (b - a)) * w, x1 = ((r.at + r.len - a) / (b - a)) * w;
      c.fillStyle = 'rgba(245,180,76,0.16)';
      c.fillRect(x0, 0, Math.max(2, x1 - x0), h);
    });
  }

  /* ------------------------------------------------------------- the pauses */

  /** Speech as ink, silence as nothing. The taller the block, the longer the
      breath you took after it. */
  function pauses(cv, sig) {
    const { c, w, h } = setup(cv, 84);
    const t0 = sig.t0, t1 = sig.t1, span = Math.max(0.1, t1 - t0);
    const X = t => ((t - t0) / span) * w;
    const base = h - 16;

    c.fillStyle = 'rgba(157,184,168,0.34)';
    c.fillRect(0, base - 7, w, 7);

    (sig.pauses || []).forEach(p => {
      const x0 = X(p.at), x1 = X(p.at + p.len);
      c.clearRect(x0, base - 7, Math.max(1, x1 - x0), 7);
      const tall = Math.min(1, p.len / 2.5);
      c.fillStyle = p.len >= 0.8 ? SOFT : 'rgba(245,180,76,0.38)';
      const hh = 8 + tall * (base - 22);
      c.fillRect(x0, base - 7 - hh, Math.max(1.5, x1 - x0), hh);
    });

    c.fillStyle = 'rgba(157,184,168,0.7)';
    c.font = '600 9.5px Archivo, sans-serif';
    c.fillText('taller means longer', 3, 11);
  }

  /* ------------------------------------------------------------- the pitch */

  function pitch(cv, sig) {
    const { c, w, h } = setup(cv, 84);
    const p = sig.pitch || [];
    if (!p.length) return;
    const fps = 4;
    const lo = -9, hi = 9;
    const Y = v => h / 2 - (Math.max(lo, Math.min(hi, v)) / (hi - lo)) * h;

    c.strokeStyle = 'rgba(157,184,168,0.20)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, h / 2 + 0.5); c.lineTo(w, h / 2 + 0.5); c.stroke();

    (sig.mono || []).forEach(m => {
      const x0 = (m.at / sig.dur) * w, x1 = ((m.at + m.len) / sig.dur) * w;
      c.fillStyle = 'rgba(157,184,168,0.13)';
      c.fillRect(x0, 0, Math.max(2, x1 - x0), h);
    });

    c.strokeStyle = ACCENT;
    c.lineWidth = 1.8;
    c.lineJoin = 'round';
    let open = false;
    c.beginPath();
    for (let i = 0; i < p.length; i++) {
      const t = i / fps;
      if (t < sig.t0 || t > sig.t1) continue;
      const x = (t / sig.dur) * w;
      if (p[i] === 999) { open = false; continue; }
      const y = Y(p[i] / 10);
      if (!open) { c.moveTo(x, y); open = true; } else c.lineTo(x, y);
    }
    c.stroke();
  }

  /* ------------------------------------------------------------- the level */

  function level(cv, sig) {
    const { c, w, h } = setup(cv, 84);
    const env = sig.env || [];
    const fps = 4;
    const n = env.length;
    if (!n) return;

    (sig.quiet || []).forEach(q => {
      const x0 = (q.at / sig.dur) * w, x1 = ((q.at + q.len) / sig.dur) * w;
      c.fillStyle = 'rgba(245,180,76,0.14)';
      c.fillRect(x0, 0, Math.max(2, x1 - x0), h);
    });

    const range = envRange(env);
    c.beginPath();
    c.moveTo(0, h);
    for (let i = 0; i < n; i++) {
      const t = i / fps;
      const x = (t / sig.dur) * w;
      const y = h - (env[i] > 0 ? 0.08 + 0.92 * stretch(env[i], range) : 0) * (h - 6);
      c.lineTo(x, y);
    }
    c.lineTo(w, h);
    c.closePath();
    c.fillStyle = 'rgba(245,180,76,0.22)';
    c.fill();
    c.strokeStyle = ACCENT;
    c.lineWidth = 1.2;
    c.stroke();
  }

  /* -------------------------------------------------------------- sparkline */

  function spark(cv, vals, opts) {
    opts = opts || {};
    const { c, w, h } = setup(cv, opts.h || 26);
    if (!vals || vals.length < 2) return;
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1e-6) { hi = lo + 1; lo -= 1; }
    const pad = (hi - lo) * 0.15;
    lo -= pad; hi += pad;
    const X = i => (i / (vals.length - 1)) * (w - 6) + 3;
    const Y = v => h - 3 - ((v - lo) / (hi - lo)) * (h - 6);
    c.strokeStyle = opts.color || 'rgba(245,180,76,0.85)';
    c.lineWidth = 1.6;
    c.lineJoin = 'round';
    c.beginPath();
    vals.forEach((v, i) => { i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)); });
    c.stroke();
    c.fillStyle = opts.color || ACCENT;
    c.beginPath();
    c.arc(X(vals.length - 1), Y(vals[vals.length - 1]), 2.4, 0, 6.2832);
    c.fill();
  }

  /* --------------------------------------------------------------- compare */

  function two(cv, sigA, sigB) {
    const { c, w, h } = setup(cv, 86);
    const draw = (sig, color, width) => {
      const curve = DSP.paceCurve(sig.syl || []);
      const a = Math.floor(sig.t0), b = Math.min(curve.length - 1, Math.ceil(sig.t1));
      if (b <= a) return;
      const lo = 60, hi = 220;
      c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round';
      c.beginPath();
      for (let i = a; i <= b; i++) {
        const x = ((i - a) / (b - a)) * w;
        const y = h - ((Math.max(lo, Math.min(hi, curve[i])) - lo) / (hi - lo)) * h;
        if (i === a) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    };
    c.strokeStyle = 'rgba(157,184,168,0.16)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, h * 0.5); c.lineTo(w, h * 0.5); c.stroke();
    draw(sigB, 'rgba(157,184,168,0.75)', 1.6);
    draw(sigA, ACCENT, 2.2);
  }

  return { wave, pace, pauses, pitch, level, spark, two };
})();
