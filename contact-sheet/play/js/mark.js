/* The film edge: this app's one drawn idea, in real 135 geometry.
   A perforation is 2.79mm by 1.98mm on a 4.75mm pitch, eight of them to a 36mm frame,
   on stock 35mm wide with a 24mm image between two rebate strips. Everything drawn here
   uses those numbers as SVG units, so a strip in the app and the mark on the icon are the
   same object at different sizes. It is the header, the counter chrome, the empty state,
   the rules between sections and the launcher icon, all one thing. */
const Mark = (() => {
  const PITCH = 4.75, PW = 2.79, PH = 1.98, PR = 0.5;
  const FILM_H = 35, IMG_H = 24, IMG_TOP = (FILM_H - IMG_H) / 2;   // 5.5
  const FRAME_W = 36;
  const PERF_MID_TOP = 2.75, PERF_MID_BOT = FILM_H - 2.75;

  /** One run of perforations along an edge, as a single path. */
  function perfRun(x0, x1, cy, phase) {
    let d = '';
    const start = x0 + ((phase || 0) % PITCH);
    for (let x = start; x + PW <= x1; x += PITCH) {
      const y = cy - PH / 2;
      d += `M${(x + PR).toFixed(2)} ${y.toFixed(2)}` +
           `h${(PW - 2 * PR).toFixed(2)}a${PR} ${PR} 0 0 1 ${PR} ${PR}` +
           `v${(PH - 2 * PR).toFixed(2)}a${PR} ${PR} 0 0 1 ${-PR} ${PR}` +
           `h${-(PW - 2 * PR).toFixed(2)}a${PR} ${PR} 0 0 1 ${-PR} ${-PR}` +
           `v${-(PH - 2 * PR).toFixed(2)}a${PR} ${PR} 0 0 1 ${PR} ${-PR}z`;
    }
    return d;
  }

  /** Both runs, for a strip `w` units wide. */
  function perfPath(w, phase) {
    return perfRun(0, w, PERF_MID_TOP, phase) + perfRun(0, w, PERF_MID_BOT, phase);
  }

  let uid = 0;
  /** A length of film. `frames` gates, an optional light leak, optional edge printing. */
  function strip(opt) {
    const o = Object.assign({ frames: 3, lead: 2, leak: 0.9, numbers: true, id: '' }, opt || {});
    const w = o.lead * 2 + o.frames * FRAME_W;
    const id = o.id || ('m' + (++uid));
    let gates = '', nums = '';
    for (let i = 0; i < o.frames; i++) {
      const x = o.lead + i * FRAME_W;
      gates += `<rect x="${x + 0.6}" y="${IMG_TOP}" width="${FRAME_W - 1.2}" height="${IMG_H}" rx="0.6"/>`;
      if (o.numbers) {
        nums += `<text x="${x + 1.6}" y="${FILM_H - 0.9}" class="mk-no">${String(o.from ? o.from + i : i + 1).padStart(2, '0')}A</text>`;
      }
    }
    return `<svg class="mk" viewBox="0 0 ${w} ${FILM_H}" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="${id}base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A241E"/><stop offset="0.5" stop-color="#1D1915"/><stop offset="1" stop-color="#151210"/>
    </linearGradient>
    <linearGradient id="${id}leak" x1="1" y1="0.1" x2="0" y2="0.9">
      <stop offset="0" stop-color="#FFF0C8" stop-opacity="1"/>
      <stop offset="0.09" stop-color="#FFD37A" stop-opacity="0.96"/>
      <stop offset="0.22" stop-color="#F2A62B" stop-opacity="0.80"/>
      <stop offset="0.40" stop-color="#E4552B" stop-opacity="0.42"/>
      <stop offset="0.62" stop-color="#8E2E17" stop-opacity="0.16"/>
      <stop offset="0.86" stop-color="#E4552B" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="${id}gates">${gates}</clipPath>
  </defs>
  <rect width="${w}" height="${FILM_H}" rx="0.8" fill="url(#${id}base)"/>
  <g clip-path="url(#${id}gates)">
    <rect width="${w}" height="${FILM_H}" fill="#0D0B0A"/>
    ${o.leak > 0 ? `<rect width="${w}" height="${FILM_H}" fill="url(#${id}leak)" opacity="${o.leak}"/>` : ''}
  </g>
  <g fill="none" stroke="#3A332A" stroke-width="0.35">${gates}</g>
  <path d="${perfPath(w, o.phase || 0)}" fill="#0A0908"/>
  <path d="${perfPath(w, o.phase || 0)}" fill="none" stroke="#3E362C" stroke-width="0.22"/>
  <g class="mk-edge">${nums}</g>
</svg>`;
  }

  /** The counter gate on the camera: one frame's worth of film with the number in it.
      The run is drawn a pitch wider than the gate at each end so it can travel through
      it during the wind-on without leaving a gap. */
  const GATE_W = 26;
  function gate() {
    const d = perfRun(-PITCH, GATE_W + PITCH, PERF_MID_TOP, 0) +
              perfRun(-PITCH, GATE_W + PITCH, PERF_MID_BOT, 0);
    return `<svg class="gate" viewBox="0 0 ${GATE_W} ${FILM_H}" aria-hidden="true" preserveAspectRatio="none">
  <path class="gate-perf" d="${d}"/>
</svg>`;
  }
  /** One perforation, in gate pixels: what a single wind-on advances the run by. */
  const gatePitchPx = boxW => PITCH / GATE_W * boxW;

  /* --- the icon set: one stroke width, one corner language, no glyphs --- */
  const S = (body, extra) =>
    `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra || ''}>${body}</svg>`;

  const ICONS = {
    back:    S('<path d="M14.5 5 8 12l6.5 7"/>'),
    flash:   S('<path d="M13.4 2.8 5.6 13.1h5.2l-.6 8.1 8-10.4h-5.4z"/>'),
    flashOff: S('<path d="M13.4 2.8 5.6 13.1h5.2l-.6 8.1 8-10.4h-5.4z"/><path d="M3.4 3.4 20.6 20.6"/>'),
    lens:    S('<rect x="2.8" y="6" width="18.4" height="13.4" rx="2.2"/><circle cx="12" cy="12.7" r="3.9"/><path d="M8.6 6 10 3.3h4L15.4 6"/>'),
    sheets:  S('<rect x="3" y="4.4" width="18" height="15.2" rx="1.6"/><path d="M9 4.4v15.2M15 4.4v15.2M3 9.5h18M3 14.5h18"/>'),
    stocks:  S('<rect x="4.2" y="5.6" width="15.6" height="13.4" rx="1.8"/><path d="M4.2 10.4h15.6"/><path d="M9.4 5.6V3.6h5.2v2"/>'),
    settings: S('<path d="M3.6 7.6h16.8M3.6 16.4h16.8"/><circle cx="9" cy="7.6" r="2.5"/><circle cx="15.4" cy="16.4" r="2.5"/>'),
    more:    S('<circle cx="5.6" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="18.4" cy="12" r="1.25" fill="currentColor" stroke="none"/>'),
    keep:    S('<ellipse cx="12" cy="12" rx="8.2" ry="9.1" transform="rotate(-8 12 12)"/>'),
    save:    S('<path d="M12 3.4v11.2"/><path d="M7.6 10.4 12 14.8l4.4-4.4"/><path d="M4.4 16.4v2.4a1.8 1.8 0 0 0 1.8 1.8h11.6a1.8 1.8 0 0 0 1.8-1.8v-2.4"/>'),
    share:   S('<path d="M12 15.2V3.8"/><path d="M7.8 8 12 3.8 16.2 8"/><path d="M4.4 14v4.8a1.8 1.8 0 0 0 1.8 1.8h11.6a1.8 1.8 0 0 0 1.8-1.8V14"/>'),
    loupe:   S('<circle cx="10.6" cy="10.6" r="6.6"/><path d="M15.4 15.4 20.6 20.6"/>'),
    erase:   S('<path d="M4.6 6.6h14.8"/><path d="M9 6.6V4.4h6v2.2"/><path d="M6.4 6.6l1 12.2a1.8 1.8 0 0 0 1.8 1.6h5.6a1.8 1.8 0 0 0 1.8-1.6l1-12.2"/>'),
    bell:    S('<path d="M18 9.6a6 6 0 1 0-12 0c0 5-2 6.4-2 6.4h16s-2-1.4-2-6.4"/><path d="M13.7 19.6a2 2 0 0 1-3.4 0"/>')
  };

  return { strip, gate, gatePitchPx, perfPath, perfRun, ICONS, PITCH, FILM_H, FRAME_W };
})();
