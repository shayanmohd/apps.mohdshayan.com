/* Every mark in Punchlist, drawn here and nowhere else: one 24 unit grid, one 1.9 stroke,
   round caps and joins, and the same 2 unit corner everywhere. The pin with a tick in its
   head is the app's own mark; it is the launcher icon, the onboarding animation and the
   thing that lands on the plan when you tap it. */
const Icons = (() => {

  const wrap = (body, o) => {
    const a = o || {};
    return `<svg class="ic${a.cls ? ' ' + a.cls : ''}" viewBox="0 0 24 24" width="${a.size || 24}" height="${a.size || 24}" ` +
      `fill="none" stroke="currentColor" stroke-width="${a.w || 1.9}" stroke-linecap="round" ` +
      `stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  };

  /* ── interface icons ── */
  const ICON = {
    projects: '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="1.4"/>' +
              '<path d="M7.4 15.8V9.2h5.2v3.2h4.4v3.4Z"/><path d="M12.6 9.2h2.6"/>',
    walk:     '<path d="M12 21.2s6.4-6.1 6.4-10.6A6.4 6.4 0 0 0 5.6 10.6C5.6 15.1 12 21.2 12 21.2Z"/>' +
              '<path d="M9.4 10.6l1.9 1.9 3.4-3.6"/>',
    report:   '<path d="M7 3.6h6.6L18 8v11.4a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.6a1 1 0 0 1 1-1Z"/>' +
              '<path d="M13.2 3.8V8H18"/><path d="M9 12.4h6M9 15.6h4"/>',
    setup:    '<path d="M4.6 8.2h9.2M17.6 8.2h1.8M4.6 15.8h2.2M10.6 15.8h8.8"/>' +
              '<circle cx="15.6" cy="8.2" r="2.2"/><circle cx="8.4" cy="15.8" r="2.2"/>',
    plus:     '<path d="M12 5.6v12.8M5.6 12h12.8"/>',
    close:    '<path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6"/>',
    tick:     '<path d="M5.4 12.6 10 17.2 18.6 7.4"/>',
    camera:   '<path d="M4 8.6h3.1l1.6-2.4h6.6l1.6 2.4H20a1 1 0 0 1 1 1v8.2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.6a1 1 0 0 1 1-1Z"/>' +
              '<circle cx="12" cy="13.4" r="3.5"/>',
    flip:     '<path d="M4.6 12a7.4 7.4 0 0 1 12.7-5.2"/><path d="M19.4 12a7.4 7.4 0 0 1-12.7 5.2"/>' +
              '<path d="M17.6 3.4v3.6H14"/><path d="M6.4 20.6V17h3.6"/>',
    fit:      '<path d="M4.4 9V5.4a1 1 0 0 1 1-1H9M15 4.4h3.6a1 1 0 0 1 1 1V9"/>' +
              '<path d="M19.6 15v3.6a1 1 0 0 1-1 1H15M9 19.6H5.4a1 1 0 0 1-1-1V15"/>',
    filter:   '<path d="M4.4 6.6h15.2M7 12h10M10 17.4h4"/>',
    files:    '<path d="M4.6 6.4h5l1.7 2h8.1a1 1 0 0 1 1 1v8.2a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1V7.4a1 1 0 0 1 1-1Z"/>',
    trash:    '<path d="M5.6 7h12.8M9.6 7V5.2a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1V7"/>' +
              '<path d="M7.2 7l.8 11.4a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9L16.8 7"/>',
    share:    '<path d="M12 15.4V4.2"/><path d="M8.2 7.6 12 3.8l3.8 3.8"/>' +
              '<path d="M5.6 13.4v5.6a1 1 0 0 0 1 1h10.8a1 1 0 0 0 1-1v-5.6"/>',
    down:     '<path d="M12 4.2v11.2"/><path d="M8.2 11.6 12 15.4l3.8-3.8"/>' +
              '<path d="M5.6 15.4V19a1 1 0 0 0 1 1h10.8a1 1 0 0 0 1-1v-3.6"/>',
    person:   '<circle cx="12" cy="8.4" r="3.6"/><path d="M5.2 20.2c.7-3.6 3.4-5.6 6.8-5.6s6.1 2 6.8 5.6"/>',
    grid:     '<path d="M4.4 4.4h15.2v15.2H4.4z"/><path d="M4.4 11.2h15.2M11.6 4.4v15.2"/>'
  };

  const icon = (name, o) => wrap(ICON[name] || '', o);

  /* ── the mark: a pin dropped on a plan, a tick inside it ──
     Drawn in its own 64 unit box so it can be set at any size without restating the geometry. */
  function mark(size, o) {
    const a = o || {};
    const id = 'm' + Math.random().toString(36).slice(2, 8);
    return `<svg class="mark${a.cls ? ' ' + a.cls : ''}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${id}g" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stop-color="#FFD84A"/><stop offset="1" stop-color="#F0B000"/>
        </linearGradient>
      </defs>
      ${a.plate === false ? '' : `<g opacity=".9">
        <path d="M6 47h52" stroke="#C9C3B4" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M13 52.4h12M31 52.4h5M42 52.4h9" stroke="#DAD5C7" stroke-width="1.4" stroke-linecap="round"/>
      </g>`}
      <ellipse cx="32" cy="47" rx="10.6" ry="3" fill="#14161A" opacity=".16"/>
      <path d="M32 47.4 24.6 34.8a13.2 13.2 0 1 1 14.8 0Z" fill="url(#${id}g)"/>
      <path d="M32 47.4 24.6 34.8a13.2 13.2 0 1 1 14.8 0Z" fill="none" stroke="#14161A" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M25.4 26.6 30.4 31.6 39.2 21.4" fill="none" stroke="#14161A" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M22.8 15.6a13 13 0 0 1 8.4-4.4" stroke="#FFF3C4" stroke-width="2" stroke-linecap="round" fill="none" opacity=".85"/>
    </svg>`;
  }

  /* ── drawn empty states ──
     Same world as the mark: a sheet of drawing, a pin, hi-vis where the eye should land. */
  const SHEET = `
    <rect x="14" y="16" width="152" height="104" rx="3" fill="#FFFFFF" stroke="#CFC9BA" stroke-width="1.6"/>
    <g stroke="#E6E1D4" stroke-width="1">
      <path d="M14 40h152M14 64h152M14 88h152M46 16v104M78 16v104M110 16v104M138 16v104"/>
    </g>
    <g stroke="#171A1E" stroke-width="3.4" fill="none" stroke-linejoin="round">
      <path d="M30 100V34h56v30h50v36Z"/>
      <path d="M86 64h20"/>
    </g>
    <g stroke="#171A1E" stroke-width="1.4" fill="none">
      <path d="M52 34v-6M52 100v6"/><path d="M30 78h-6M136 78h6"/>
    </g>`;

  function emptyProjects() {
    return `<svg class="scene" viewBox="0 0 180 136" width="180" height="136" role="img" aria-label="A floorplan with a defect pinned to it">
      ${SHEET}
      <ellipse cx="104" cy="86" rx="9" ry="2.6" fill="#14161A" opacity=".18"/>
      <g transform="translate(104 86) scale(0.62) translate(-32 -47)">
        <path d="M32 47.4 24.6 34.8a13.2 13.2 0 1 1 14.8 0Z" fill="#FFC400" stroke="#14161A" stroke-width="3.6" stroke-linejoin="round"/>
        <path d="M25.4 26.6 30.4 31.6 39.2 21.4" fill="none" stroke="#14161A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <circle cx="56" cy="52" r="7" fill="#A4161A" stroke="#FFFFFF" stroke-width="2.4"/>
      <circle cx="126" cy="48" r="7" fill="#33404A" stroke="#FFFFFF" stroke-width="2.4"/>
    </svg>`;
  }

  function emptyPlan() {
    return `<svg class="scene" viewBox="0 0 180 136" width="180" height="136" role="img" aria-label="A phone photographing a paper plan">
      <g transform="rotate(-4 90 68)">${SHEET}</g>
      <g transform="translate(96 40)">
        <rect x="0" y="0" width="62" height="88" rx="7" fill="#1B1F24" stroke="#14161A" stroke-width="2"/>
        <rect x="5" y="6" width="52" height="70" rx="3" fill="#F1EFE8"/>
        <g stroke="#FFC400" stroke-width="3" fill="none" stroke-linecap="round">
          <path d="M12 18v-6h7M50 18v-6h-7M12 64v6h7M50 64v6h-7"/>
        </g>
        <circle cx="31" cy="41" r="8" fill="none" stroke="#14161A" stroke-width="2.4"/>
        <rect x="24" y="79" width="14" height="3" rx="1.5" fill="#4A4F55"/>
      </g>
    </svg>`;
  }

  function emptyContacts() {
    return `<svg class="scene" viewBox="0 0 180 110" width="180" height="110" role="img" aria-label="A trade contact card">
      <rect x="22" y="18" width="136" height="74" rx="4" fill="#FFFFFF" stroke="#CFC9BA" stroke-width="1.6"/>
      <rect x="22" y="18" width="136" height="9" fill="#FFC400"/>
      <circle cx="52" cy="58" r="13" fill="none" stroke="#171A1E" stroke-width="2.6"/>
      <path d="M46.5 54.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z" fill="#171A1E"/>
      <path d="M43 70c2-4.6 5.2-6.8 9-6.8s7 2.2 9 6.8" fill="none" stroke="#171A1E" stroke-width="2.6" stroke-linecap="round"/>
      <g stroke="#D8D3C5" stroke-width="3.4" stroke-linecap="round">
        <path d="M78 50h56M78 62h38"/>
      </g>
    </svg>`;
  }

  /* The pins are still numbered and placed; the drawing under them is gone. */
  function emptyMissingPlan() {
    return `<svg class="scene" viewBox="0 0 180 136" width="180" height="136" role="img" aria-label="An empty sheet where the plan should be, with its pins still on it">
      <rect x="14" y="16" width="152" height="104" rx="3" fill="#FBFAF6" stroke="#CFC9BA" stroke-width="1.6" stroke-dasharray="7 6"/>
      <g stroke="#E6E1D4" stroke-width="1">
        <path d="M14 40h152M14 64h152M14 88h152M46 16v104M78 16v104M110 16v104M138 16v104"/>
      </g>
      <ellipse cx="72" cy="88" rx="9" ry="2.6" fill="#14161A" opacity=".16"/>
      <g transform="translate(72 88) scale(0.62) translate(-32 -47)">
        <path d="M32 47.4 24.6 34.8a13.2 13.2 0 1 1 14.8 0Z" fill="#FFC400" stroke="#14161A" stroke-width="3.6" stroke-linejoin="round"/>
        <path d="M25.4 26.6 30.4 31.6 39.2 21.4" fill="none" stroke="#14161A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <circle cx="118" cy="50" r="7" fill="#A4161A" stroke="#FFFFFF" stroke-width="2.4"/>
      <circle cx="44" cy="60" r="7" fill="#33404A" stroke="#FFFFFF" stroke-width="2.4"/>
    </svg>`;
  }

  function emptyReport() {
    return `<svg class="scene" viewBox="0 0 180 120" width="180" height="120" role="img" aria-label="A report ready to send">
      <rect x="34" y="10" width="98" height="96" rx="3" fill="#F3F1EA" stroke="#CFC9BA" stroke-width="1.4" transform="rotate(-5 83 58)"/>
      <rect x="44" y="14" width="98" height="96" rx="3" fill="#FFFFFF" stroke="#CFC9BA" stroke-width="1.6"/>
      <rect x="44" y="14" width="98" height="16" fill="#14161A"/>
      <rect x="52" y="19" width="26" height="6" rx="1" fill="#FFC400"/>
      <g stroke="#D8D3C5" stroke-width="3.2" stroke-linecap="round">
        <path d="M56 44h74M56 56h74M56 68h50"/>
      </g>
      <rect x="56" y="80" width="30" height="20" rx="2" fill="#EDEAE1" stroke="#CFC9BA" stroke-width="1.4"/>
      <circle cx="112" cy="90" r="10" fill="#FFC400" stroke="#14161A" stroke-width="2.2"/>
      <path d="M107.4 90.2l3.2 3.2 6-7" fill="none" stroke="#14161A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  return { icon, mark, emptyProjects, emptyPlan, emptyContacts, emptyReport, emptyMissingPlan };
})();
window.Icons = Icons;
