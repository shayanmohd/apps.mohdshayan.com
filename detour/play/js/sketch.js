/* Everything drawn on a canvas: the compass card, the live trace, the finished ink sketch and the
   ground you have covered. All of it is drawn from primitives here, so nothing in this app is an
   imported picture. */
const Sketch = (() => {
  /* SOFT carries the cardinal letters, the north mark and the scale bar, so it is dark enough to
     clear AA against every ground it is drawn on, not merely light enough to stay quiet. */
  const INK = '#1B1E17', SOFT = '#65685A', ACCENT = '#B8420E', PAPER = '#F8F1E2', HAIR = '#D9CEB5';
  const FLAME = '#F4762A', EMBER = '#FFBE78', CREAM = '#F2E7D4';

  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fit(canvas, cssW, cssH) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return ctx;
  }

  /* A stable pseudo-random in [-1, 1] from an integer, so a sketch redraws identically. */
  function nz(i, salt) {
    let h = (i * 374761393 + (salt || 0) * 668265263) >>> 0;
    h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
    return ((h >>> 8) / 8388608) - 1;
  }

  /** Lat/lon to canvas coordinates, north up, equal scale on both axes. */
  function projector(trails, w, h, pad) {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180, n = 0;
    for (const t of trails) for (const p of t) {
      if (p[0] < minLat) minLat = p[0];
      if (p[0] > maxLat) maxLat = p[0];
      if (p[1] < minLon) minLon = p[1];
      if (p[1] > maxLon) maxLon = p[1];
      n++;
    }
    if (!n) return null;
    const lat0 = (minLat + maxLat) / 2;
    const kx = Math.cos(lat0 * Math.PI / 180);
    let spanX = Math.max(1e-7, (maxLon - minLon) * kx);
    let spanY = Math.max(1e-7, maxLat - minLat);
    const aw = w - pad * 2, ah = h - pad * 2;
    const s = Math.min(aw / spanX, ah / spanY);
    const cx = (minLon + maxLon) / 2, cy = (minLat + maxLat) / 2;
    const metresPerDegLat = 110540;
    return {
      x: (lat, lon) => w / 2 + (lon - cx) * kx * s,
      y: (lat, lon) => h / 2 - (lat - cy) * s,
      pxPerMetre: s / metresPerDegLat,
      spanM: Math.max(spanY * metresPerDegLat, spanX * metresPerDegLat)
    };
  }

  /** One pass of a wobbling ink line. */
  function stroke(ctx, pts, salt, amp, width, alpha, colour) {
    if (pts.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 1)];
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      const nxr = -dy / len, nyr = dx / len;
      const wob = (nz(i, salt) * 0.7 + nz(i >> 1, salt + 7) * 0.5) * amp;
      const x = p[0] + nxr * wob, y = p[1] + nyr * wob;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function inkLine(ctx, pts, opts) {
    const o = opts || {};
    const w = o.width || 2.2;
    const c = o.colour || INK;
    stroke(ctx, pts, 3, w * 0.9, w * 1.5, (o.alpha || 1) * 0.16, c);
    stroke(ctx, pts, 11, w * 0.45, w, (o.alpha || 1) * 0.9, c);
    stroke(ctx, pts, 29, w * 0.3, w * 0.55, (o.alpha || 1) * 0.5, c);
  }

  function roundRect(ctx, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
  }

  /** Warm paper with a little tooth, so a sketch sits on a surface rather than on a white box. */
  function paper(ctx, w, h, r) {
    ctx.save();
    roundRect(ctx, w, h, r);
    ctx.clip();
    const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
    g.addColorStop(0, '#FBF5E8');
    g.addColorStop(1, '#F1E8D5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#7A5C34';
    for (let i = 0; i < Math.round(w * h / 320); i++) {
      const x = ((nz(i, 5) + 1) / 2) * w, y = ((nz(i, 91) + 1) / 2) * h;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
    ctx.save();
    roundRect(ctx, w, h, r);
    ctx.strokeStyle = HAIR; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  function northArrow(ctx, x, y, size) {
    ctx.save();
    ctx.strokeStyle = SOFT; ctx.fillStyle = SOFT; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y + size); ctx.lineTo(x, y - size * 0.35); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - size); ctx.lineTo(x - size * 0.28, y - size * 0.3);
    ctx.lineTo(x + size * 0.28, y - size * 0.3); ctx.closePath(); ctx.fill();
    ctx.font = '600 9px "Work Sans", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', x, y + size + 9);
    ctx.restore();
  }

  function scaleBar(ctx, x, y, pxPerMetre, units) {
    const targets = units === 'mi' ? [100, 200, 400, 800, 1600] : [100, 200, 500, 1000, 2000];
    let m = targets[0];
    for (const t of targets) { if (t * pxPerMetre < 78) m = t; }
    const w = m * pxPerMetre;
    if (!(w > 10) || !isFinite(w)) return;
    ctx.save();
    ctx.strokeStyle = SOFT; ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
    ctx.moveTo(x, y); ctx.lineTo(x + w, y);
    ctx.moveTo(x + w, y - 3); ctx.lineTo(x + w, y + 3);
    ctx.stroke();
    ctx.fillStyle = SOFT;
    ctx.font = '9px "Work Sans", sans-serif'; ctx.textAlign = 'left';
    const label = units === 'mi'
      ? (m >= 1600 ? (m / 1609.34).toFixed(1) + ' mi' : Math.round(m * 1.09361) + ' yd')
      : (m >= 1000 ? (m / 1000) + ' km' : m + ' m');
    ctx.fillText(label, x + w + 6, y + 3);
    ctx.restore();
  }

  /* ---------- the finished sketch ---------- */
  /** opts: { progress 0..1, marks:[[lat,lon]], units, plain } */
  function trailSketch(canvas, trail, cssW, cssH, opts) {
    const o = opts || {};
    const ctx = fit(canvas, cssW, cssH);
    if (!o.plain) paper(ctx, cssW, cssH, 10);
    if (!trail || trail.length < 2) {
      ctx.fillStyle = SOFT;
      ctx.font = '13px "Work Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Not enough of a walk to draw yet.', cssW / 2, cssH / 2);
      return;
    }
    const pad = Math.max(18, Math.min(cssW, cssH) * 0.11);
    const pr = projector([trail], cssW, cssH, pad);
    const pts = trail.map(p => [pr.x(p[0], p[1]), pr.y(p[0], p[1])]);
    const prog = o.progress === undefined ? 1 : Math.max(0, Math.min(1, o.progress));
    const cut = Math.max(2, Math.round(pts.length * prog));
    const shown = pts.slice(0, cut);

    inkLine(ctx, shown, { width: Math.max(1.6, Math.min(3.4, cssW / 150)), colour: ACCENT, alpha: 1 });

    // start: an open circle. end: a filled nib.
    ctx.save();
    ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 4.2, 0, 7); ctx.stroke();
    if (prog >= 0.999) {
      const e = pts[pts.length - 1];
      ctx.beginPath(); ctx.arc(e[0], e[1], 3.1, 0, 7); ctx.fill();
    }
    ctx.restore();

    // quest marks
    for (const m of (o.marks || [])) {
      const x = pr.x(m[0], m[1]), y = pr.y(m[0], m[1]);
      if (pts.length && prog < 0.999) {
        // only reveal marks the drawn line has reached
        const last = shown[shown.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) > cssW) continue;
      }
      ctx.save();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
      ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4);
      ctx.stroke();
      ctx.restore();
    }

    if (!o.plain) {
      northArrow(ctx, cssW - pad * 0.62, pad * 0.72, 9);
      scaleBar(ctx, pad * 0.5, cssH - pad * 0.42, pr.pxPerMetre, o.units || 'km');
    }
  }

  /* ---------- the live trace on the walk screen ---------- */
  function liveTrace(canvas, trail, cssW, cssH, opts) {
    const o = opts || {};
    const ctx = fit(canvas, cssW, cssH);
    if (!trail || trail.length < 2) {
      ctx.strokeStyle = HAIR; ctx.lineWidth = 1.4; ctx.setLineDash([3, 6]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(14, cssH / 2); ctx.lineTo(cssW - 14, cssH / 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = SOFT; ctx.font = '11px "Work Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('your trail draws itself as you walk', cssW / 2, cssH / 2 + 20);
      return;
    }
    const pad = 16;
    const pr = projector([trail], cssW, cssH, pad);
    const pts = trail.map(p => [pr.x(p[0], p[1]), pr.y(p[0], p[1])]);
    inkLine(ctx, pts, { width: 2, colour: ACCENT, alpha: 0.95 });
    const e = pts[pts.length - 1];
    ctx.save();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(e[0], e[1], 3, 0, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 3.4, 0, 7); ctx.stroke();
    ctx.restore();
    if (o.units) scaleBar(ctx, 8, cssH - 8, pr.pxPerMetre, o.units);
  }

  /* ---------- the compass card ---------- */
  /** The instruments only: the ink disc behind them is painted by the stylesheet.
      opts: { target (deg), facing (deg or null) } */
  function rose(canvas, cssW, cssH, opts) {
    const o = opts || {};
    const ctx = fit(canvas, cssW, cssH);
    const cx = cssW / 2, cy = cssH / 2;
    const R = Math.min(cssW, cssH) / 2 - 8;
    const rot = o.facing === null || o.facing === undefined ? 0 : -o.facing;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot * Math.PI / 180);

    ctx.strokeStyle = CREAM;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;

    // ticks, every 7.5 degrees, the cardinals longest
    for (let a = 0; a < 360; a += 7.5) {
      const major = a % 90 === 0, mid = a % 45 === 0, small = a % 15 === 0;
      const len = major ? R * 0.16 : mid ? R * 0.11 : small ? R * 0.075 : R * 0.045;
      const t = (a - 90) * Math.PI / 180;
      ctx.strokeStyle = CREAM;
      ctx.globalAlpha = major ? 0.72 : mid ? 0.36 : small ? 0.24 : 0.14;
      ctx.lineWidth = major ? 1.9 : 1.1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(t) * R, Math.sin(t) * R);
      ctx.lineTo(Math.cos(t) * (R - len), Math.sin(t) * (R - len));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // the north marker of a real card: a small filled triangle, not another tick
    {
      const t = -Math.PI / 2;
      const ux = Math.cos(t), uy = Math.sin(t), px = -uy, py = ux;
      const tipR = R * 0.99, baseR = R * 0.875, hw = R * 0.032;
      ctx.fillStyle = CREAM; ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(ux * tipR, uy * tipR);
      ctx.lineTo(ux * baseR + px * hw, uy * baseR + py * hw);
      ctx.lineTo(ux * baseR - px * hw, uy * baseR - py * hw);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // cardinals, kept upright against the rotation
    const letters = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
    ctx.font = '600 13px "Work Sans", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [ch, a] of letters) {
      const t = (a - 90) * Math.PI / 180;
      const x = Math.cos(t) * (R * 0.72), y = Math.sin(t) * (R * 0.72);
      ctx.save(); ctx.translate(x, y); ctx.rotate(-rot * Math.PI / 180);
      ctx.fillStyle = ch === 'N' ? EMBER : CREAM;
      ctx.globalAlpha = ch === 'N' ? 1 : 0.62;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // the needle, the same shape the launcher icon shows: certain, with a lit edge
    if (o.target !== null && o.target !== undefined) {
      const t = (o.target - 90) * Math.PI / 180;
      const ux = Math.cos(t), uy = Math.sin(t), px = -uy, py = ux;
      // a long rhombus, widest just past the pivot: the launcher icon's blade at arm's length
      const tail = -R * 0.58, tip = R * 0.88, hw = R * 0.098;
      const shoulderF = R * 0.06, shoulderB = -R * 0.02;
      ctx.save();
      ctx.shadowColor = 'rgba(255, 138, 60, .55)';
      ctx.shadowBlur = R * 0.14;
      const g = ctx.createLinearGradient(ux * tail, uy * tail, ux * tip, uy * tip);
      g.addColorStop(0, '#D2450C');
      g.addColorStop(0.52, FLAME);
      g.addColorStop(1, '#FFCE96');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ux * tail, uy * tail);
      ctx.lineTo(ux * shoulderB + px * hw, uy * shoulderB + py * hw);
      ctx.lineTo(ux * tip, uy * tip);
      ctx.lineTo(ux * shoulderF - px * hw, uy * shoulderF - py * hw);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // lit edge
      ctx.save();
      ctx.strokeStyle = '#FFE7CC'; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ux * shoulderF * 0.6 - px * hw * 0.7, uy * shoulderF * 0.6 - py * hw * 0.7);
      ctx.lineTo(ux * tip * 0.92, uy * tip * 0.92);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // the pivot, and a soft well under the words so the needle passes behind them
    /* The words sit in the middle of the card, so the glass is smoked under them and the needle
       passes behind. Painted in screen space, so it stays put while the card turns. */
    const g2 = ctx.createRadialGradient(cx, cy, R * 0.04, cx, cy, R * 0.5);
    g2.addColorStop(0, 'rgba(13, 16, 9, 0.86)');
    g2.addColorStop(0.52, 'rgba(15, 18, 11, 0.7)');
    g2.addColorStop(1, 'rgba(15, 18, 11, 0)');
    ctx.save();
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, 7); ctx.fill();
    ctx.restore();
  }

  /* Nothing walked yet. An empty panel says nothing, so draw the thing that is going to fill it:
     a grid of forty metre squares, a ghost of a wander across it, and the squares it would warm. */
  function emptyGround(ctx, w, h) {
    const step = Math.max(26, Math.min(w, h) / 9);
    ctx.save();
    roundRect(ctx, w, h, 10); ctx.clip();
    ctx.strokeStyle = HAIR; ctx.lineWidth = 1; ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    const pts = [];
    for (let i = 0; i <= 9; i++) {
      const t = i / 9;
      pts.push([w * (0.13 + t * 0.74), h * (0.76 - t * 0.5 + Math.sin(t * 5.4) * 0.085)]);
    }
    ctx.fillStyle = FLAME;
    ctx.globalAlpha = 0.17;
    const seen = {};
    for (const p of pts) {
      const cx = Math.floor(p[0] / step), cy = Math.floor(p[1] / step);
      const k = cx + ':' + cy;
      if (seen[k]) continue;
      seen[k] = 1;
      ctx.fillRect(cx * step + 1, cy * step + 1, step - 2, step - 2);
    }
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.6;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], 3.6, 0, 7); ctx.stroke();
    ctx.restore();
  }

  /* ---------- ground covered ---------- */
  /** The squares are the point of this view, so they are drawn, not merely counted.
      opts: { units, cells: [[lat, lon, visits]] } */
  function coverage(canvas, trails, cssW, cssH, opts) {
    const o = opts || {};
    const ctx = fit(canvas, cssW, cssH);
    paper(ctx, cssW, cssH, 10);
    const usable = trails.filter(t => t && t.length > 1);
    const cells = o.cells || [];
    if (!usable.length && !cells.length) { emptyGround(ctx, cssW, cssH); return; }

    const pad = 24;
    const frame = usable.length ? usable.slice() : [];
    if (cells.length) frame.push(cells.map(c => [c[0], c[1]]));
    const pr = projector(frame, cssW, cssH, pad);
    if (!pr) return;

    // the walked squares, warmer where you have been back more than once
    if (cells.length) {
      const side = Math.max(3, (o.cellM || 40) * pr.pxPerMetre);
      const gap = side > 7 ? 1 : 0;
      ctx.save();
      roundRect(ctx, cssW, cssH, 10); ctx.clip();
      ctx.fillStyle = FLAME;
      for (const c of cells) {
        const x = pr.x(c[0], c[1]), y = pr.y(c[0], c[1]);
        const n = c[2] || 1;
        ctx.globalAlpha = Math.min(0.62, 0.26 + Math.log(1 + n) * 0.13);
        ctx.fillRect(Math.round(x - side / 2), Math.round(y - side / 2), side - gap, side - gap);
      }
      ctx.restore();
    }

    /* The routes go on as plain hairlines, not the wobbling ink of a single walk: ten trails drawn
       three times each with a jitter turn the whole picture to mush and hide the squares under it. */
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    usable.forEach((t, i) => {
      const recent = i >= usable.length - 1;
      ctx.beginPath();
      for (let k = 0; k < t.length; k++) {
        const x = pr.x(t[k][0], t[k][1]), y = pr.y(t[k][0], t[k][1]);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = recent ? ACCENT : INK;
      ctx.globalAlpha = recent ? 0.9 : 0.26;
      ctx.lineWidth = recent ? 1.6 : 0.9;
      ctx.stroke();
    });
    ctx.restore();
    northArrow(ctx, cssW - pad * 0.7, pad * 0.8, 9);
    scaleBar(ctx, pad * 0.5, cssH - pad * 0.4, pr.pxPerMetre, o.units || 'km');
  }

  return { trailSketch, liveTrace, rose, coverage, fit, reduced, INK, ACCENT, PAPER, FLAME };
})();
