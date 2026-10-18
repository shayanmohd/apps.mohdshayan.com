/* Kith. Every drawn thing in the app, in one place and one language.

   The idea the whole app is built on: two rings that overlap, and the shape where they
   meet is the warm part. It is the launcher icon, it is the mark on the Hearth, it is the
   warmth reading on a person's page, and it is the shape of the tab that takes you home.

   All of it is plain SVG built in JS, so it inherits the theme and stays crisp at any size.
   One stroke language throughout: 2.4 units on the mark, 2 on the small scenes, round caps,
   round joins, no fill except the lens where the two rings agree. */
const Rings = (() => {

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let uidSeq = 0;
  const gid = p => `${p}${(uidSeq++).toString(36)}`;

  /** A monogram chip. There are no photos in Kith, so the letters carry the colour. */
  function avatar(p, size) {
    const s = size || 40;
    return `<span class="mono" style="--mono:${Store.hueFor(p.name)};width:${s}px;height:${s}px;font-size:${Math.round(s * 0.36)}px"
                  aria-hidden="true">${esc(Store.initials(p.name))}</span>`;
  }

  /* ---------- the mark ---------- */

  /**
   * Two rings on a 120 by 72 field, `sep` apart as a fraction of one radius.
   *   sep 0.35  the rings almost sit on each other, the lens is nearly the whole ring
   *   sep 1.0   the classic overlap, the lens a tall leaf
   *   sep 1.9   the rings barely kiss, the lens a sliver
   * `warm` from 0 to 1 sets how strongly the lens glows.
   * Options: `alive` breathes, `you` labels the left ring, `initials` fills the right one.
   */
  function markSvg(sep, warm, opt) {
    const o = opt || {};
    const W = 132, H = 90, r = 23, cy = 37;
    const d = r * Math.min(1.92, Math.max(0.3, sep));
    const ax = W / 2 - d / 2, bx = W / 2 + d / 2;
    const clip = gid('c'), grad = gid('g'), soft = gid('s');
    const glow = 0.2 + 0.62 * Math.min(1, Math.max(0, warm));

    return `<svg class="kithmark${o.alive ? ' alive' : ''}" viewBox="0 0 ${W} ${H}"
                 preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(o.label || 'Two rings overlapping')}">
      <defs>
        <clipPath id="${clip}"><circle cx="${ax.toFixed(2)}" cy="${cy}" r="${r}"/></clipPath>
        <radialGradient id="${grad}" cx="0.5" cy="0.42" r="0.62">
          <stop offset="0" style="stop-color:var(--coral);stop-opacity:${(glow * 1.15).toFixed(3)}"/>
          <stop offset="1" style="stop-color:var(--coral);stop-opacity:${(glow * 0.5).toFixed(3)}"/>
        </radialGradient>
        <radialGradient id="${soft}" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style="stop-color:var(--coral);stop-opacity:${(glow * 0.42).toFixed(3)}"/>
          <stop offset="1" style="stop-color:var(--coral);stop-opacity:0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${W / 2}" cy="${cy}" rx="${(d / 2 + r * 0.5).toFixed(2)}" ry="${(r * 0.95).toFixed(2)}" fill="url(#${soft})"/>
      <g class="gB"><g clip-path="url(#${clip})">
        <circle cx="${bx.toFixed(2)}" cy="${cy}" r="${r}" class="lensfill" fill="url(#${grad})"/>
      </g></g>
      <g class="gA"><circle cx="${ax.toFixed(2)}" cy="${cy}" r="${r}" class="ringA"/></g>
      <g class="gB"><circle cx="${bx.toFixed(2)}" cy="${cy}" r="${r}" class="ringB"/>
        ${o.initials ? `<text x="${bx.toFixed(2)}" y="${cy + 4.8}" class="markinitials">${esc(o.initials)}</text>` : ''}</g>
      ${o.you ? `<text x="${ax.toFixed(2)}" y="${cy + r + 15}" class="marklabel">you</text>` : ''}
    </svg>`;
  }

  /** The mark as it appears on the Hearth and in onboarding: alive, mid overlap. */
  function mark(el, opts) {
    const o = opts || {};
    el.innerHTML = markSvg(o.sep === undefined ? 0.96 : o.sep, o.warm === undefined ? 0.85 : o.warm,
      { alive: o.alive !== false, label: o.label || 'Kith' });
  }

  /**
   * A person's warmth, drawn as the same two rings. In rhythm, the rings sit almost on
   * each other and the lens is wide and warm. As the gap grows past their rhythm the rings
   * walk apart and the warm part narrows. It never becomes a debt and it never turns red.
   */
  function lens(el, w, person) {
    const ratio = Math.min(1.9, Math.max(0, w.ratio));
    const sep = 0.74 + 1.13 * (ratio / 1.9);
    const warm = 1 - Math.min(1, ratio / 1.7);
    el.innerHTML = markSvg(sep, warm, {
      alive: true, you: true,
      initials: person ? Store.initials(person.name) : '',
      label: `${person ? person.name : 'This person'}: ${w.label}`
    });
  }

  /* ---------- drawn empty states ---------- */
  const SCENES = {
    // Nobody added yet: one ring drawn, one still waiting to be filled.
    people: `<circle cx="48" cy="46" r="20" class="s-ink"/>
             <circle cx="74" cy="46" r="20" class="s-line s-dash"/>
             <path d="M80 39v14M73 46h14" class="s-warm"/>`,
    // Nobody in a hard season: the water level and quiet, which is the good reading.
    calm: `<path d="M10 32c9-5 18-5 27 0s18 5 27 0 18-5 27 0" class="s-line"/>
           <path d="M10 50c9-5 18-5 27 0s18 5 27 0 18-5 27 0" class="s-ink"/>
           <path d="M10 68c9-5 18-5 27 0s18 5 27 0 18-5 27 0" class="s-line"/>`,
    // Nothing marked as a celebration: the same water, with nothing risen out of it yet.
    quietgood: `<circle cx="60" cy="26" r="10" class="s-warm s-dash"/>
                <path d="M10 52c9-5 18-5 27 0s18 5 27 0 18-5 27 0" class="s-ink"/>
                <path d="M10 70c9-5 18-5 27 0s18 5 27 0 18-5 27 0" class="s-line"/>`,
    // No dates: the river, centred, with one stone already marked.
    river: `<path d="M40 10v70" class="s-line"/>
            <circle cx="40" cy="32" r="6" class="s-line"/>
            <circle cx="40" cy="58" r="6" class="s-warm"/>
            <path d="M56 29h40M56 38h26M56 55h36M56 64h22" class="s-line"/>`,
    // Nothing written down about this person yet: a card with room on it.
    card: `<rect x="14" y="16" width="92" height="58" rx="8" class="s-line"/>
           <path d="M28 38h42M28 52h58" class="s-ink"/>`,
    // Everyone is where you meant them to be: the mark itself, warm.
    together: `<ellipse cx="60" cy="46" rx="11" ry="19" class="s-fill"/>
               <circle cx="50" cy="46" r="21" class="s-ink"/>
               <circle cx="70" cy="46" r="21" class="s-warm"/>`
  };

  /** A drawn empty state. Always paired with a sentence, never a picture on its own. */
  function scene(name, text) {
    return `<div class="emptybox"><svg class="scene" viewBox="0 0 120 88" role="img" aria-hidden="true">
      ${SCENES[name] || SCENES.calm}
    </svg><p class="empty">${esc(text)}</p></div>`;
  }

  /* ---------- the ring map ---------- */
  const RADII = { hearth: 46, table: 84, village: 120, horizon: 156 };
  // A different starting rotation per ring, so small rings do not line up radially.
  const PHASE = { hearth: 0, table: 0.37, village: 0.68, horizon: 0.21 };
  const MAXDOTS = 16;

  /**
   * The rings as a map: you at the centre, the horizon at the edge. The bands warm toward
   * the middle so the picture reads as a hearth rather than a target. Dots are spread evenly
   * across the arc that avoids the ring's own label, so nothing collides.
   */
  function map(el, onSelect) {
    const people = Store.people();
    const S = 372, c = S / 2;
    let bands = '', circles = '', labels = '', dots = '';

    Store.RINGS.slice().reverse().forEach(r => {
      bands += `<circle cx="${c}" cy="${c}" r="${RADII[r.id]}" class="ringband b-${r.id}"/>`;
      circles += `<circle cx="${c}" cy="${c}" r="${RADII[r.id]}" class="ringline r-${r.id}"/>`;
    });

    Store.RINGS.forEach(r => {
      const rad = RADII[r.id];
      const list = people.filter(p => p.ring === r.id);
      const w = r.name.length * 6.3 + 18;
      labels += `<rect x="${c - w / 2}" y="${c - rad - 9}" width="${w}" height="18" rx="9" class="ringlabelbg"/>
                 <text x="${c}" y="${c - rad + 3.4}" class="ringlabel">${esc(r.name)}</text>`;

      const shown = list.slice(0, MAXDOTS);
      const n = shown.length;
      shown.forEach((p, i) => {
        // Spread across the arc that avoids the label at the top, rotated per ring.
        const t = 22 + (((i + 0.5) / n + PHASE[r.id]) % 1) * 316;
        const a = t * Math.PI / 180;
        const x = c + rad * Math.sin(a), y = c - rad * Math.cos(a);
        const adrift = Store.warmth(p).ratio > 1;
        const dr = r.id === 'horizon' ? 13 : 15;
        dots += `<g class="dot${adrift ? ' adrift' : ''}" data-id="${p.id}" tabindex="0" role="button"
                    aria-label="${esc(p.name)}, ${esc(r.name)} ring${adrift ? ', drifting' : ''}">
                   <ellipse cx="${x}" cy="${y + 2.4}" rx="${dr + 1}" ry="${dr * 0.72}" class="dotshadow" opacity="0.14"/>
                   <circle cx="${x}" cy="${y}" r="${dr + 3}" class="dothalo"/>
                   <circle cx="${x}" cy="${y}" r="${dr}" fill="${Store.hueFor(p.name)}" class="dotfill"/>
                   <circle cx="${x}" cy="${y}" r="${dr - 0.8}" class="dotring"/>
                   <text x="${x}" y="${y + dr * 0.34}" class="dotletters" style="font-size:${dr * 0.8}px">${esc(Store.initials(p.name))}</text>
                 </g>`;
      });
      if (list.length > MAXDOTS) {
        dots += `<text x="${c}" y="${c - rad + 22}" class="ringmore">and ${list.length - MAXDOTS} more</text>`;
      }
    });

    el.innerHTML = `<svg viewBox="0 0 ${S} ${S}" class="ringmap" role="img"
                         aria-label="Your rings: ${people.length} people placed around you.">
      ${bands}
      ${circles}
      <circle cx="${c}" cy="${c}" r="15" class="youglow"/>
      <circle cx="${c}" cy="${c}" r="8" class="youring"/>
      <text x="${c}" y="${c + 24}" class="youlabel">you</text>
      ${labels}
      ${dots}
    </svg>
    <p class="help mapnote">Tap a name to open it. The faded ones have drifted past their rhythm.</p>`;

    el.querySelectorAll('.dot').forEach(g => {
      const go = () => onSelect(g.dataset.id);
      g.addEventListener('click', go);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  return { avatar, map, mark, markSvg, lens, scene, esc };
})();
