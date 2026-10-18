/* The app's own mark and its icon set, drawn as inline SVG.

   The seal is the launcher icon made live: warm light behind, a sprout unfurling
   out of dark soil, and a ring that fills with the stillness gathered today. It is
   the one shape that belongs to this app, and it appears on the first screen, on
   the notebook handle, in onboarding and in every empty state.

   Icons are one language: a 24 box, 1.75 stroke, round caps and joins, no fills. */
const Mark = (() => {

  const SOIL = '#2A2318', SOIL_HI = '#3D3423';
  const LEAF = '#4E7A32', LEAF_HI = '#7DA84B', STEM = '#5C8A36';
  const SUN = '#E8B33C', SUN_HI = '#F6D77A';

  let uid = 0;

  /** The seal. `fill` 0 to 1 draws the light arc; `leaves` 0 to 3 opens the sprout. */
  function seal(opts) {
    const o = Object.assign({ size: 48, fill: 0, leaves: 2, live: false, ring: true }, opts || {});
    const id = 'sl' + (++uid);
    const R = 20.5, C = 2 * Math.PI * R;
    const dash = Math.max(0, Math.min(1, o.fill)) * C;
    const cls = 'seal' + (o.live ? ' live' : '');
    return `
<svg class="${cls}" viewBox="0 0 48 48" width="${o.size}" height="${o.size}" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${id}g" cx="50%" cy="42%" r="52%">
      <stop offset="0" stop-color="${SUN_HI}" stop-opacity=".85"/>
      <stop offset="0.55" stop-color="${SUN}" stop-opacity=".28"/>
      <stop offset="1" stop-color="${SUN}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}s" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${STEM}"/><stop offset="1" stop-color="${LEAF_HI}"/>
    </linearGradient>
    <clipPath id="${id}c"><circle cx="24" cy="24" r="21.5"/></clipPath>
  </defs>
  <g clip-path="url(#${id}c)">
    <circle class="seal-glow" cx="24" cy="20" r="21" fill="url(#${id}g)"/>
    <path d="M0 33 C 9 30.4 16 30 24 30 C 32 30 39 30.4 48 33 L48 48 L0 48 Z" fill="${SOIL}"/>
    <path d="M0 33 C 9 30.4 16 30 24 30 C 32 30 39 30.4 48 33" fill="none" stroke="${SOIL_HI}" stroke-width="1.4"/>
    <g class="seal-sprout">
      <path d="M24 31.5 C 24 26 24.4 21.5 26.6 17.4" fill="none" stroke="url(#${id}s)"
            stroke-width="2.6" stroke-linecap="round"/>
      ${o.leaves >= 1 ? `<path d="M24.6 25.4 C 20.4 25.6 17.6 23.4 17 20.2 C 21.2 19.6 24.2 21.6 24.6 25.4 Z" fill="${LEAF}"/>` : ''}
      ${o.leaves >= 2 ? `<path d="M24.9 22.4 C 28.8 21.4 30.8 18.4 30.6 15.1 C 26.7 16 24.8 18.9 24.9 22.4 Z" fill="${LEAF_HI}"/>` : ''}
      ${o.leaves >= 3 ? `<path d="M26.6 17.4 C 26.1 14.6 27.6 12.4 30.2 11.9 C 30.7 14.2 29.3 16.6 26.6 17.4 Z" fill="${LEAF_HI}"/>` : ''}
      <path d="M26.6 17.4 C 26.2 15.4 27.1 14.1 28.7 13.9" fill="none" stroke="${LEAF_HI}"
            stroke-width="2.2" stroke-linecap="round"/>
    </g>
  </g>
  ${o.ring ? `<circle cx="24" cy="24" r="${R}" fill="none" stroke="#CFC6B0" stroke-width="1.6"/>
  <circle class="seal-arc" cx="24" cy="24" r="${R}" fill="none" stroke="${SUN}" stroke-width="2.4"
          stroke-linecap="round" transform="rotate(-90 24 24)"
          stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}"/>` : ''}
</svg>`;
  }

  /* ---------- icons ---------- */
  const I = (d, extra) => `<svg class="ic" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${d}</g>${extra || ''}</svg>`;

  const ICONS = {
    // a pressed leaf with its midrib: the field guide
    guide: I('<path d="M19 4c0 8-4.6 12.4-11 12.4-1.6 0-2.7-.3-3.4-.6C4 9 8.6 4.4 15 4.4c1.7 0 3 .2 4 .6Z"/><path d="M17 6.4 5.6 19.6"/>'),
    // stems of unequal height with one seed head: the hedgerow
    almanac: I('<path d="M5 20V9.6"/><path d="M9.7 20V5.6"/><path d="M14.3 20v-9"/><path d="M19 20V7.4"/><circle cx="9.7" cy="4" r="1.5"/>'),
    // five tally marks
    tally: I('<path d="M5 6.5v11"/><path d="M9.4 6.5v11"/><path d="M13.8 6.5v11"/><path d="M18.2 6.5v11"/><path d="M3.6 18.4 19.6 5.6"/>'),
    // a frame around a horizon and a low sun
    photo: I('<rect x="3.2" y="5" width="17.6" height="14" rx="2.4"/><path d="M3.2 14.6h17.6"/><circle cx="15.6" cy="10.4" r="2"/>'),
    // two sliders
    settings: I('<path d="M4 8.4h9"/><path d="M17.4 8.4H20"/><path d="M4 15.6h3"/><path d="M11.4 15.6H20"/><circle cx="15.2" cy="8.4" r="2.2"/><circle cx="9.2" cy="15.6" r="2.2"/>'),
    // the seal reduced to a line: the pledge
    pledge: I('<circle cx="12" cy="12" r="8.4"/><path d="M12 16.6v-4.2c0-1.9.9-3.4 2.6-4.4"/><path d="M11.9 13c-2 .1-3.4-1-3.7-2.9 2-.3 3.5.7 3.7 2.9Z"/>'),
    back: I('<path d="M14.6 5.4 8 12l6.6 6.6"/>'),
    close: I('<path d="M6.4 6.4 17.6 17.6"/><path d="M17.6 6.4 6.4 17.6"/>'),
    add: I('<path d="M12 5.4v13.2"/><path d="M5.4 12h13.2"/>'),
    // widen and narrow the view
    wide: I('<path d="M9.6 4.6H5.4a.8.8 0 0 0-.8.8v4.2"/><path d="M14.4 4.6h4.2a.8.8 0 0 1 .8.8v4.2"/><path d="M9.6 19.4H5.4a.8.8 0 0 1-.8-.8v-4.2"/><path d="M14.4 19.4h4.2a.8.8 0 0 0 .8-.8v-4.2"/>'),
    near: I('<path d="M4.6 9.6h4.2a.8.8 0 0 0 .8-.8V4.6"/><path d="M19.4 9.6h-4.2a.8.8 0 0 1-.8-.8V4.6"/><path d="M4.6 14.4h4.2a.8.8 0 0 1 .8.8v4.2"/><path d="M19.4 14.4h-4.2a.8.8 0 0 0-.8.8v4.2"/>'),
    chevron: I('<path d="M6.6 9.4 12 14.8l5.4-5.4"/>'),
    // the pull for the notebook: a sheet corner turning
    notebook: I('<path d="M5.2 4.6h9l4.6 4.6v10.2H5.2Z"/><path d="M14.2 4.6v4.6h4.6"/>')
  };

  const icon = name => ICONS[name] || '';

  /* ---------- empty state drawings ----------
     Not decoration: each one shows the thing the screen would hold. */

  /** Bare ground with one seed in it, waiting. */
  function emptyGround(w) {
    const q = 'eg' + (++uid);
    return `
<svg class="drawn" viewBox="0 0 240 120" width="${w || 240}" height="${Math.round((w || 240) * 0.5)}" role="img" aria-label="Bare ground with one seed under it, and low sun above">
  <defs>
    <linearGradient id="${q}Sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#EFE3C4"/><stop offset="0.62" stop-color="#F6EED9"/><stop offset="1" stop-color="#E9E2C9"/>
    </linearGradient>
    <radialGradient id="${q}Sun" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${SUN_HI}" stop-opacity=".95"/>
      <stop offset="0.42" stop-color="${SUN}" stop-opacity=".38"/>
      <stop offset="1" stop-color="${SUN}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${q}Soil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3E3626"/><stop offset="1" stop-color="#231D14"/>
    </linearGradient>
  </defs>
  <rect width="240" height="120" fill="url(#${q}Sky)" rx="10"/>
  <circle cx="181" cy="36" r="44" fill="url(#${q}Sun)"/>
  <circle cx="181" cy="36" r="11" fill="${SUN_HI}"/>
  <circle cx="181" cy="36" r="11" fill="none" stroke="${SUN}" stroke-width="1.6" opacity=".8"/>
  <path d="M0 70 C 40 62 76 60 118 61 C 162 62 202 66 240 72 L240 120 L0 120 Z" fill="#D6CDAE" opacity=".85"/>
  <path d="M0 80 C 44 72 82 70 124 71 C 168 72 206 76 240 82 L240 120 L0 120 Z" fill="#A79A73"/>
  <path d="M0 89 C 46 81 86 79 126 80 C 170 81 208 85 240 90 L240 120 L0 120 Z" fill="#6E6346"/>
  <path d="M0 97 C 46 90 88 88 128 89 C 172 90 208 93 240 98 L240 120 L0 120 Z" fill="url(#${q}Soil)"/>
  <g transform="translate(118 100)">
    <ellipse cx="0" cy="4" rx="7.4" ry="5.2" fill="#CDBE92" transform="rotate(-16)"/>
    <path d="M0 1 C 0 -6 1 -11 3.6 -15.4" fill="none" stroke="${STEM}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M0.6 -7 C -4 -7.2 -6.8 -9.8 -7.2 -13.6 C -2.6 -14 0.4 -11.4 0.6 -7 Z" fill="${LEAF}"/>
    <path d="M3.6 -15.4 C 3.1 -18.4 4.7 -20.6 7.4 -21.2 C 7.9 -18.6 6.4 -16.2 3.6 -15.4 Z" fill="${LEAF_HI}"/>
  </g>
  <path d="M8 118 h224" stroke="#00000000"/>
</svg>`;
  }

  /** A hedgerow of stems: what the almanac becomes once there is a week to review. */
  function emptyHedge(w) {
    let stems = '';
    const h = [22, 34, 18, 41, 27, 46, 30, 38, 21, 44, 26, 35, 19, 40];
    for (let i = 0; i < h.length; i++) {
      const x = 16 + i * 15.4, lean = ((i % 5) - 2) * 2.4;
      stems += `<path d="M${x} 96 Q ${x + lean * 0.4} ${96 - h[i] * 0.6} ${x + lean} ${96 - h[i]}" fill="none" stroke="${i % 3 === 0 ? '#A79A6B' : '#5E7C42'}" stroke-width="2.2" stroke-linecap="round" opacity="${i % 3 === 0 ? 0.5 : 0.85}"/>`;
      if (i === 5 || i === 11) stems += `<circle cx="${x + lean}" cy="${96 - h[i] - 3.4}" r="2.4" fill="#C0872F"/>`;
    }
    return `
<svg class="drawn" viewBox="0 0 240 110" width="${w || 240}" height="${Math.round((w || 240) * 110 / 240)}" role="img" aria-label="A hedgerow of stems, one for each day">
  <rect width="240" height="110" fill="#EEE9DA" rx="10"/>
  ${stems}
  <path d="M8 96.5h224" stroke="#C8C2B2" stroke-width="1.2" opacity=".7"/>
</svg>`;
  }

  return { seal, icon, ICONS, emptyGround, emptyHedge };
})();
