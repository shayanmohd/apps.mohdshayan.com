/* Umbra's instruments. Every picture in the app is drawn here from the numbers the model
   produced: no images ship with the app, so nothing can disagree with the ephemeris. */
const Draw = (() => {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function rgb(c) {
    c = c.trim();
    if (c.startsWith('#')) {
      if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    const m = c.match(/-?\d+(\.\d+)?/g) || [0, 0, 0];
    return [+m[0], +m[1], +m[2]];
  }
  const rgba = (c, a) => { const p = rgb(c); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; };
  const mix = (a, b, t) => {
    const x = rgb(a), y = rgb(b);
    return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' + Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')';
  };

  function fit(cv, h) {
    // The element must be sized by CSS before the backing store is set, or a canvas with a
    // width attribute lays itself out at that many CSS pixels and overflows its card.
    cv.style.width = '100%';
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = cv.clientWidth || cv.parentNode.clientWidth || 320;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.height = h + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    return { g, w, h };
  }

  /* The colour of the sky at a given solar altitude. Four stops, linearly blended. */
  function skyColour(alt) {
    const stops = [[6, css('--sky-day')], [0, css('--sky-set')], [-6, css('--sky-civil')],
                   [-12, css('--sky-naut')], [-18, css('--sky-astro')]];
    if (alt >= stops[0][0]) return stops[0][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const [a1, c1] = stops[i], [a2, c2] = stops[i + 1];
      if (alt <= a1 && alt >= a2) return mix(c1, c2, (a1 - alt) / (a1 - a2));
    }
    return stops[stops.length - 1][1];
  }

  /* ---------------- the night strip ---------------- */
  /** model: Sky.night() result. o: { strip, fmt, now, best, moonName } */
  function nightStrip(cv, model, o) {
    const H = o.height || 132;
    const { g, w, h } = fit(cv, H);
    const s = o.strip, span = s.to - s.from;
    const x = t => ((t - s.from) / span) * w;
    const top = 0, bandH = h - 26, base = bandH;

    // Sky colour, one column per pixel.
    for (let px = 0; px < w; px++) {
      const t = s.from + (px / w) * span;
      const i = Math.min(s.points.length - 1, Math.round((px / w) * (s.points.length - 1)));
      g.fillStyle = skyColour(s.points[i].sun);
      g.fillRect(px, top, 1.5, bandH);
    }
    // Moonlight, as a wash whose weight follows the Moon's altitude and phase.
    const ill = model.moon.illum;
    for (let px = 0; px < w; px++) {
      const i = Math.min(s.points.length - 1, Math.round((px / w) * (s.points.length - 1)));
      const alt = s.points[i].moon;
      if (alt <= 0) continue;
      const a = 0.05 + 0.30 * Math.pow(ill, 1.4) * Math.pow(Math.sin(alt * Math.PI / 180), 0.6);
      g.fillStyle = rgba(css('--moonwash'), Math.min(0.4, a));
      g.fillRect(px, top, 1.5, bandH);
    }
    // The horizon line, and the Moon's own trace above it.
    g.strokeStyle = rgba(css('--moonwash'), 0.55); g.lineWidth = 1.4;
    g.beginPath();
    let started = false;
    for (const p of s.points) {
      const y = base - Math.max(0, Math.min(1, p.moon / 60)) * (bandH - 10);
      if (p.moon <= 0) { started = false; continue; }
      if (!started) { g.moveTo(x(p.t), y); started = true; } else g.lineTo(x(p.t), y);
    }
    g.stroke();

    // The dark window, bracketed.
    if (model.dark) {
      const a = x(model.dark.from), b = x(model.dark.to);
      g.strokeStyle = css('--accent'); g.lineWidth = 2;
      g.beginPath(); g.moveTo(a, bandH - 3); g.lineTo(b, bandH - 3); g.stroke();
      g.beginPath(); g.moveTo(a, bandH - 9); g.lineTo(a, bandH - 3); g.moveTo(b, bandH - 9); g.lineTo(b, bandH - 3); g.stroke();
    }
    // Now.
    if (o.now && o.now > s.from && o.now < s.to) {
      g.strokeStyle = css('--fg'); g.lineWidth = 1;
      g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(x(o.now), 0); g.lineTo(x(o.now), bandH); g.stroke();
      g.setLineDash([]);
    }
    // The best moment.
    if (o.best && o.best > s.from && o.best < s.to) {
      g.fillStyle = css('--accent');
      g.beginPath(); g.arc(x(o.best), 7, 3.5, 0, Math.PI * 2); g.fill();
    }
    // Hour ticks on the place's clock.
    g.font = '11px ' + css('--font');
    g.textAlign = 'center'; g.textBaseline = 'top';
    const stepH = span > 12 * 3600000 ? 3 : 2;
    const first = Math.ceil(o.hourOf(s.from) / stepH) * stepH;
    for (let k = 0; k < 12; k++) {
      const hh = first + k * stepH;
      const t = o.timeOfHour(hh);
      if (t < s.from + 900000 || t > s.to - 900000) continue;
      g.strokeStyle = rgba(css('--fg'), 0.22);
      g.beginPath(); g.moveTo(x(t), bandH); g.lineTo(x(t), bandH + 4); g.stroke();
      g.fillStyle = css('--dim');
      g.fillText(o.fmtHour(t), x(t), bandH + 7);
    }
    return { x };
  }

  /* ---------------- the Moon ---------------- */
  function moonDisc(cv, illum, waxing, size) {
    const { g, w, h } = fit(cv, size);
    const r = size / 2 - 2, cx = w / 2, cy = h / 2;
    g.fillStyle = rgba(css('--fg'), 0.10);
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();

    const k = Math.max(0, Math.min(1, illum));
    g.fillStyle = css('--moonlit');
    g.beginPath();
    // Lit limb plus the terminator, which is a half ellipse of width r*(1-2k).
    const half = Math.PI / 2;
    if (waxing) g.arc(cx, cy, r, -half, half, false);
    else g.arc(cx, cy, r, half, -half, false);
    const xr = Math.abs(r * (1 - 2 * k));
    const sweep = waxing ? (k < 0.5) : (k >= 0.5);
    g.ellipse(cx, cy, xr, r, 0, waxing ? half : -half, waxing ? -half : half, sweep);
    g.closePath(); g.fill();

    g.strokeStyle = rgba(css('--fg'), 0.32); g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  }

  /* ---------------- an altitude curve ---------------- */
  /** series: [{t, alt}], window: {from,to} shaded as darkness. */
  function altitudeCurve(cv, series, o) {
    const H = o.height || 150;
    const { g, w, h } = fit(cv, H);
    const t0 = series[0].t, t1 = series[series.length - 1].t;
    const x = t => ((t - t0) / (t1 - t0)) * w;
    const pad = 20, top = 16, base = h - pad;
    const y = alt => base - (Math.max(0, Math.min(90, alt)) / 90) * (base - top);

    if (o.dark) {
      g.fillStyle = rgba(css('--accent'), 0.09);
      g.fillRect(x(Math.max(t0, o.dark.from)), top, x(Math.min(t1, o.dark.to)) - x(Math.max(t0, o.dark.from)), base - top);
    }
    g.strokeStyle = rgba(css('--fg'), 0.16); g.lineWidth = 1;
    for (const a of [0, 30, 60, 90]) {
      g.beginPath(); g.moveTo(0, y(a)); g.lineTo(w, y(a)); g.stroke();
      g.fillStyle = css('--dim'); g.font = '10px ' + css('--font');
      g.textAlign = 'left'; g.textBaseline = 'bottom';
      if (a) g.fillText(a + '\u00B0', 2, y(a) - 2);
    }
    g.strokeStyle = css('--accent'); g.lineWidth = 2;
    g.beginPath();
    let on = false;
    for (const p of series) {
      if (p.alt <= 0) { on = false; continue; }
      if (!on) { g.moveTo(x(p.t), y(p.alt)); on = true; } else g.lineTo(x(p.t), y(p.alt));
    }
    g.stroke();

    g.font = '11px ' + css('--font'); g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = css('--dim');
    for (const p of o.ticks || []) {
      if (p.t < t0 || p.t > t1) continue;
      g.fillText(p.label, Math.max(14, Math.min(w - 14, x(p.t))), base + 4);
    }
  }

  /* ---------------- where to look ---------------- */
  /** A quarter dome: azimuth across, altitude up, with the compass named underneath. */
  function skyDial(cv, marks, o) {
    const H = o.height || 150;
    const { g, w, h } = fit(cv, H);
    const pad = 18, base = h - 20, top = 10;
    const y = alt => base - (Math.max(0, Math.min(90, alt)) / 90) * (base - top);
    const x = az => pad + ((((az % 360) + 360) % 360) / 360) * (w - pad * 2);

    g.strokeStyle = rgba(css('--fg'), 0.15); g.lineWidth = 1;
    for (const a of [0, 30, 60, 90]) { g.beginPath(); g.moveTo(pad, y(a)); g.lineTo(w - pad, y(a)); g.stroke(); }
    g.font = '10px ' + css('--font'); g.textBaseline = 'bottom'; g.textAlign = 'left';
    g.fillStyle = css('--dim');
    g.fillText('90\u00B0 overhead', pad + 2, y(90) + 12);
    g.fillText('horizon', pad + 2, base - 2);

    g.textAlign = 'center'; g.textBaseline = 'top';
    for (const [az, name] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W'], [359.9, 'N']]) {
      g.strokeStyle = rgba(css('--fg'), 0.15);
      g.beginPath(); g.moveTo(x(az), top); g.lineTo(x(az), base); g.stroke();
      g.fillStyle = css('--dim'); g.font = '11px ' + css('--font');
      g.fillText(name, x(az), base + 4);
    }
    for (const m of marks) {
      const px = x(m.az), py = y(m.alt);
      g.fillStyle = m.dim ? css('--dim') : css('--accent');
      g.beginPath(); g.arc(px, py, m.dim ? 3.5 : 5, 0, Math.PI * 2); g.fill();
      g.font = '11px ' + css('--font'); g.textAlign = 'center';
      g.fillStyle = m.dim ? css('--dim') : css('--fg');
      // A conjunction puts two marks a degree apart: the dimmer label goes below its dot.
      const crowded = m.dim && marks.some(o => o !== m && Math.abs(x(o.az) - px) < 44 && Math.abs(y(o.alt) - py) < 26);
      g.textBaseline = crowded ? 'top' : 'bottom';
      g.fillText(m.label, Math.max(24, Math.min(w - 24, px)), crowded ? py + 7 : py - 8);
    }
  }

  /* ---------------- an eclipse, at its greatest ---------------- */
  function eclipseDisc(cv, o) {
    const H = o.height || 150;
    const { g, w, h } = fit(cv, H);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 16;
    const solar = o.kind === 'solar';
    const rB = solar ? R : R;                       // the body being covered
    const rC = solar ? R * (o.ratio || 1) : R * (o.shadow || 2.6);
    const d = (o.sep != null ? o.sep : 0) * R;      // separation in units of the covered radius

    g.fillStyle = solar ? css('--accent') : css('--moonlit');
    g.beginPath(); g.arc(cx, cy, rB, 0, Math.PI * 2); g.fill();

    if (solar) {
      g.fillStyle = css('--bg');
      g.beginPath(); g.arc(cx + d, cy - d * 0.35, rC, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(css('--fg'), 0.35); g.lineWidth = 1;
      g.beginPath(); g.arc(cx + d, cy - d * 0.35, rC, 0, Math.PI * 2); g.stroke();
    } else {
      g.save();
      g.beginPath(); g.arc(cx, cy, rB, 0, Math.PI * 2); g.clip();
      g.fillStyle = css('--umbra');
      g.beginPath(); g.arc(cx + d, cy - d * 0.35, rC, 0, Math.PI * 2); g.fill();
      g.restore();
      g.strokeStyle = rgba(css('--fg'), 0.28); g.lineWidth = 1;
      g.beginPath(); g.arc(cx + d, cy - d * 0.35, rC, 0, Math.PI * 2); g.stroke();
    }
    g.strokeStyle = rgba(css('--fg'), 0.4); g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, rB, 0, Math.PI * 2); g.stroke();
  }

  /* ---------------- a small bar ---------------- */
  function bar(el, v) {
    el.style.setProperty('--v', Math.max(0, Math.min(1, v)) * 100 + '%');
  }

  return { nightStrip, moonDisc, altitudeCurve, skyDial, eclipseDisc, bar, fit, css, rgba, skyColour };
})();
