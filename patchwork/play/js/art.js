/* Patchwork's drawings. Everything the app shows that is not text is written here:
   the quilt, the mark, and one illustration for every empty screen. No images, no fonts,
   no network. The quilt is the app's own picture of itself, so it is built from the book. */
const Art = (() => {
  /* Eight fabrics, one bolt of cloth. A person takes the next fabric off the bolt when they join
     the roster, so the first eight people in a book never share a colour and the quilt can be read
     at a glance. Somebody who has left the roster keeps a colour derived from their id, because
     their patches are still in the book and the book is never rewritten. */
  const FABRIC = ['make', 'teach', 'grow', 'repair', 'admin', 'care', 'move', 'other'];
  function fabricOf(id, index) {
    const i = (index === undefined && typeof Store !== 'undefined') ? Store.rosterIndex(id) : index;
    if (i >= 0) return FABRIC[i % FABRIC.length];
    const s = String(id || '');
    let h = 2166136261;
    for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
    return FABRIC[h % FABRIC.length];
  }
  /* A deterministic small tilt, so the quilt reads as hand sewn rather than as a grid. */
  function tiltOf(id, i) {
    const s = String(id || '') + ':' + i;
    let h = 0;
    for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0;
    return ((h % 9) - 4) * 0.55;             // about -2.2 to +2.2 degrees, hand sewn not askew
  }

  /* The tilt lives on an inner group: `.patch` carries a CSS transform for the stitch-in
     animation, and CSS transform-box would otherwise reinterpret the rotate centre below. */
  const patch = (x, y, w, tilt, cat, cls) => {
    const c = x + w / 2, m = y + w / 2, i = w * 0.19;
    return `<g class="patch${cls ? ' ' + cls : ''}"><g transform="rotate(${tilt.toFixed(2)} ${c} ${m})">`
      + `<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="${(w * 0.14).toFixed(2)}" fill="var(--c-${cat})"/>`
      + `<rect x="${(x + i).toFixed(2)}" y="${(y + i).toFixed(2)}" width="${(w - 2 * i).toFixed(2)}"`
      + ` height="${(w - 2 * i).toFixed(2)}" rx="${(w * 0.08).toFixed(2)}" fill="none" stroke="var(--thread)"`
      + ` stroke-width="${(w * 0.075).toFixed(2)}" stroke-dasharray="${(w * 0.16).toFixed(2)} ${(w * 0.14).toFixed(2)}"`
      + ` stroke-linecap="round"/></g></g>`;
  };
  const ghost = (x, y, w) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="${(w * 0.14).toFixed(2)}" fill="none"`
    + ` stroke="var(--stitch)" stroke-width="${(w * 0.07).toFixed(2)}"`
    + ` stroke-dasharray="${(w * 0.2).toFixed(2)} ${(w * 0.18).toFixed(2)}" stroke-linecap="round"/>`;

  /* One patch per exchange, in the order they were written, coloured by whoever gave the hour.
     The newest is turned, which is the mark on the launcher icon growing out of real data. */
  function quilt(entries, opts) {
    const cols = opts.cols, rows = opts.rows, w = opts.cell, gap = opts.gap;
    const cap = cols * rows;
    const shown = entries.slice(-cap);
    const pad = w * 0.22;
    const side = cols * w + (cols - 1) * gap;
    const tall = rows * w + (rows - 1) * gap;
    let out = '';
    for (let i = 0; i < cap; i++) {
      const x = (i % cols) * (w + gap), y = Math.floor(i / cols) * (w + gap);
      const e = shown[i];
      if (!e) { out += ghost(x, y, w); continue; }
      const last = i === shown.length - 1;
      out += patch(x, y, w, last ? 18 : tiltOf(e.id, i), fabricOf(e.giverId), last && opts.animate ? 'new' : '');
    }
    const size = opts.width ? `width="${opts.width}"` : `width="${side}" height="${tall}"`;
    // label: null means the thing around it already says what this is, so say nothing twice
    const a11y = opts.label === null ? 'aria-hidden="true"' : `role="img" aria-label="${opts.label || 'The quilt'}"`;
    return `<svg class="${opts.cls || ''}" ${size}`
      + ` viewBox="${-pad} ${-pad} ${side + pad * 2} ${tall + pad * 2}"`
      + ` ${a11y} xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
  }

  /* The mark: four patches, one turned. The launcher icon, drawn in the app's own colours. */
  function mark(size) {
    const w = 26, g = 4;
    let out = '';
    out += patch(0, 0, w, -2.5, 'make');
    out += patch(w + g, 0, w, 2, 'teach');
    out += patch(0, w + g, w, 1.8, 'grow');
    out += patch(w + g + 1, w + g + 1, w, 18, 'repair');
    const side = 2 * w + g;
    return `<svg width="${size}" height="${size}" viewBox="-7 -7 ${side + 14} ${side + 14}"`
      + ` role="img" aria-label="Patchwork" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
  }

  /* Illustrations. Same stroke language as the icons: one weight, round caps, no fill. */
  const S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  const frame = (h, body) =>
    `<svg width="150" height="${h}" viewBox="0 0 180 ${Math.round(h * 180 / 150)}" aria-hidden="true"`
    + ` style="color: var(--stitch)" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

  /* A needle driving the seam between two patches, with the stitches already made below it. */
  const needleAndThread = frame(108, `
    <g ${S}>
      <rect x="14" y="46" width="56" height="56" rx="8"/>
      <rect x="82" y="46" width="56" height="56" rx="8"/>
      <path d="M76 60v44" stroke-dasharray="9 8"/>
      <path d="M148 10 92 52" stroke-width="3.4"/>
      <circle cx="145.5" cy="12" r="3.6" stroke-width="1.8"/>
      <path d="M152 15c11 10 6 24-8 26" stroke-dasharray="8 7" stroke-width="1.9"/>
    </g>`);

  /* Two patches held apart, with the thread between them not yet pulled tight. */
  const notYetJoined = frame(104, `
    <g ${S}>
      <rect x="10" y="32" width="58" height="58" rx="8" transform="rotate(-6 39 61)"/>
      <rect x="112" y="32" width="58" height="58" rx="8" transform="rotate(6 141 61)"/>
      <path d="M72 56c10-12 26-12 36 0" stroke-dasharray="8 8"/>
      <path d="M72 74c10 10 26 10 36 0" stroke-dasharray="8 8"/>
    </g>`);

  /* The book, open and still ruled but empty. */
  const openBook = frame(100, `
    <g ${S}>
      <path d="M90 34v66"/>
      <path d="M90 34c-11-9-25-13-43-13H26v66h21c18 0 32 4 43 13"/>
      <path d="M90 34c11-9 25-13 43-13h21v66h-21c-18 0-32 4-43 13"/>
      <path d="M40 40h32M40 54h32M40 68h22" stroke-dasharray="6 6" stroke-width="1.8"/>
      <path d="M108 40h32M108 54h32M108 68h22" stroke-dasharray="6 6" stroke-width="1.8"/>
    </g>`);

  /* An empty roster: cloth cut but nobody has claimed a square. */
  const emptyRoster = frame(96, `
    <g ${S}>
      <rect x="16" y="36" width="44" height="44" rx="6" stroke-dasharray="7 7"/>
      <rect x="68" y="36" width="44" height="44" rx="6" stroke-dasharray="7 7"/>
      <rect x="120" y="36" width="44" height="44" rx="6" stroke-dasharray="7 7"/>
      <circle cx="38" cy="18" r="8"/><circle cx="90" cy="18" r="8"/><circle cx="142" cy="18" r="8"/>
    </g>`);

  return { quilt, mark, fabricOf, needleAndThread, notYetJoined, openBook, emptyRoster };
})();
