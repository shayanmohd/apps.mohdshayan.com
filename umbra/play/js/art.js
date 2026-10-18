/* Umbra's drawn pieces. The eclipse ring is the app's one mark: a dark disc with light bleeding
   round its edge. On the Tonight screen the corona is as bright as the night is good, so the
   launcher icon and the first screen are the same picture. Everything here is inline SVG,
   one stroke width, no images, so it recolours itself in red light mode with the rest.     */
const Art = (() => {
  let seq = 0;
  const P = (deg, r, cx, cy) => [(cx || 60) + r * Math.cos(deg * Math.PI / 180), (cy || 60) + r * Math.sin(deg * Math.PI / 180)];
  const f = n => (Math.round(n * 100) / 100).toString();

  /** The eclipse ring. k runs 0 to 1 and sets how much corona there is. */
  function eclipse(k, cls) {
    k = Math.max(0, Math.min(1, k == null ? 1 : k));
    const id = 'ecl' + (seq++);
    const glow = 0.22 + 0.78 * k;
    const rim = 0.30 + 0.70 * k;
    // Streamers: tapered wedges from the rim outward, longer where the light bleeds.
    const streams = [[-62, 26, 2.4], [-28, 18, 1.8], [-100, 15, 1.6], [18, 12, 1.4], [158, 10, 1.2], [212, 13, 1.3], [118, 8, 1.0]];
    const wedges = streams.map(([a, len, wd]) => {
      const [x1, y1] = P(a - wd, 36.5), [x2, y2] = P(a + wd, 36.5), [x3, y3] = P(a, 36.5 + len * (0.5 + 0.5 * k));
      return '<polygon points="' + f(x1) + ',' + f(y1) + ' ' + f(x2) + ',' + f(y2) + ' ' + f(x3) + ',' + f(y3) + '"/>';
    }).join('');
    const bead = P(-58, 36.5);
    const arc = (a0, a1, r) => { const [x0, y0] = P(a0, r), [x1, y1] = P(a1, r); return 'M' + f(x0) + ' ' + f(y0) + ' A' + r + ' ' + r + ' 0 0 1 ' + f(x1) + ' ' + f(y1); };
    return '<svg class="ecl' + (cls ? ' ' + cls : '') + '" viewBox="0 0 120 120" aria-hidden="true">' +
      '<defs>' +
      '<radialGradient id="' + id + 'g" cx="0.56" cy="0.44" r="0.5">' +
        '<stop offset="0.28" style="stop-color:var(--corona);stop-opacity:' + f(0.95 * glow) + '"/>' +
        '<stop offset="0.36" style="stop-color:var(--accent);stop-opacity:' + f(0.55 * glow) + '"/>' +
        '<stop offset="0.62" style="stop-color:var(--accent);stop-opacity:' + f(0.14 * glow) + '"/>' +
        '<stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/>' +
      '</radialGradient>' +
      '<radialGradient id="' + id + 'd" cx="0.62" cy="0.34" r="0.8">' +
        '<stop offset="0" style="stop-color:var(--disc-hi)"/>' +
        '<stop offset="0.55" style="stop-color:var(--disc)"/>' +
        '<stop offset="1" style="stop-color:var(--disc-lo)"/>' +
      '</radialGradient>' +
      '</defs>' +
      '<g class="ecl-corona" style="--k:' + f(k) + '">' +
        '<circle cx="60" cy="60" r="60" fill="url(#' + id + 'g)"/>' +
        '<g fill="var(--accent)" opacity="' + f(0.10 + 0.32 * k) + '">' + wedges + '</g>' +
      '</g>' +
      '<circle cx="60" cy="60" r="36.5" fill="none" stroke="var(--accent)" stroke-width="2.2" opacity="' + f(rim) + '"/>' +
      '<path d="' + arc(-150, -10, 36.6) + '" fill="none" stroke="var(--corona)" stroke-width="2.6" stroke-linecap="round" opacity="' + f(0.35 + 0.65 * k) + '"/>' +
      '<circle cx="60" cy="60" r="35.4" fill="url(#' + id + 'd)"/>' +
      '<circle class="ecl-bead" cx="' + f(bead[0]) + '" cy="' + f(bead[1]) + '" r="' + f(1.8 + 2.2 * k) + '" fill="var(--corona)" opacity="' + f(0.45 + 0.55 * k) + '"/>' +
      '</svg>';
  }

  /* Small scenes for the empty states. 200 by 110, stroke 1.6, the accent for one warm thing. */
  const open = (cls) => '<svg class="scene' + (cls ? ' ' + cls : '') + '" viewBox="0 0 200 110" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';
  const stars = pts => pts.map(([x, y, r]) => '<circle cx="' + x + '" cy="' + y + '" r="' + (r || 1.3) + '" fill="currentColor" stroke="none" opacity="' + (r > 1.4 ? 0.9 : 0.55) + '"/>').join('');
  const spark = (x, y, s) => '<path d="M' + x + ' ' + (y - s) + 'v' + (2 * s) + 'M' + (x - s) + ' ' + y + 'h' + (2 * s) + '" opacity="0.8"/>';

  /** A hill under a crescent: a night with nothing on the calendar, still worth standing in. */
  function hill() {
    return open() +
      '<path d="M8 92 C50 70 90 66 130 74 S180 92 194 96" opacity="0.7"/>' +
      '<path d="M8 100 H192" opacity="0.25"/>' +
      '<path d="M146 22 a17 17 0 1 0 12 30 a13 13 0 0 1 -12 -30z" fill="var(--accent-soft)" stroke="var(--accent)"/>' +
      stars([[30, 28, 1.6], [56, 46, 1.1], [88, 22, 1.4], [112, 40, 1.0], [178, 50, 1.2], [70, 60, 0.9], [22, 58, 1.0]]) +
      spark(100, 56, 3) +
      '<path d="M60 88 l4 -8 M60 88 l-4 -8" opacity="0.5"/>' +
      '</svg>';
  }

  /** A dashed orbit with one planet on it: nothing in this stretch of the calendar. */
  function orbit() {
    return open() +
      '<ellipse cx="100" cy="58" rx="78" ry="28" stroke-dasharray="3 5" opacity="0.55"/>' +
      '<ellipse cx="100" cy="58" rx="46" ry="16" stroke-dasharray="3 5" opacity="0.35"/>' +
      '<circle cx="100" cy="58" r="9" fill="var(--accent-soft)" stroke="var(--accent)"/>' +
      '<circle cx="100" cy="58" r="3" fill="var(--accent)" stroke="none"/>' +
      '<circle cx="168" cy="72" r="4.5" fill="var(--surface)" />' +
      '<circle cx="58" cy="43" r="3" fill="var(--surface)" />' +
      stars([[28, 20, 1.2], [176, 22, 1.4], [150, 14, 0.9], [40, 92, 1.0], [186, 96, 1.1]]) +
      '</svg>';
  }

  /** The Earth with the shadow falling on the far side: an eclipse that belongs to someone else. */
  function farSide() {
    return open() +
      '<circle cx="100" cy="58" r="34"/>' +
      '<path d="M100 24 a20 34 0 0 0 0 68 M100 24 a20 34 0 0 1 0 68 M66 58 h68 M72 40 h56 M72 76 h56" opacity="0.4"/>' +
      '<path d="M100 24 a34 34 0 0 1 0 68 a14 34 0 0 0 0 -68z" fill="currentColor" opacity="0.16" stroke="none"/>' +
      '<circle cx="164" cy="30" r="7" fill="var(--accent-soft)" stroke="var(--accent)"/>' +
      '<path d="M150 46 l-10 6" stroke="var(--accent)" opacity="0.6"/>' +
      stars([[24, 24, 1.2], [40, 86, 1.0], [176, 84, 1.3], [18, 60, 0.9]]) +
      '</svg>';
  }

  /** A telescope on a tripod pointing up: a log with nothing in it yet. */
  function telescope() {
    return open() +
      '<path d="M8 100 H192" opacity="0.25"/>' +
      '<path d="M72 78 L142 30" stroke-width="7" opacity="0.9"/>' +
      '<path d="M138 33 L150 25" stroke="var(--accent)" stroke-width="7"/>' +
      '<path d="M96 62 L86 100 M96 62 L112 100 M96 62 L82 92" opacity="0.7"/>' +
      '<path d="M98 66 l-8 5" opacity="0.7"/>' +
      '<circle cx="164" cy="16" r="2.2" fill="var(--accent)" stroke="none"/>' +
      stars([[30, 30, 1.5], [52, 18, 1.0], [178, 40, 1.1], [24, 70, 1.0], [126, 12, 0.9]]) +
      spark(44, 52, 3) +
      '</svg>';
  }

  /** Placeholder rows while the year is being worked out. */
  function skeleton(n) {
    let h = '<div class="skel" aria-hidden="true">';
    for (let i = 0; i < (n || 6); i++) h += '<div class="skel-row" style="--i:' + i + '"><i></i><b style="width:' + (46 + (i * 17) % 40) + '%"></b><b style="width:' + (60 + (i * 23) % 30) + '%"></b></div>';
    return h + '</div>';
  }

  return { eclipse, hill, orbit, farSide, telescope, skeleton };
})();
