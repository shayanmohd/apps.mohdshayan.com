/* One drawing language for the whole app. Every icon here is a stroke of 2 units in a 24 unit
   box, round cap, round join, 2 unit corner radius, so a tick and a door and a camera all look
   like they were cut by the same tool. Nothing is an emoji and nothing is a font glyph.
   The threshold, at the bottom, is the app's own mark: an opening with light coming through it.
   It is the launcher icon, the onboarding mark, the empty states and the verdict badges. */
const Icons = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  /* Paths are written for a 24x24 box and stroked, never filled, unless `fill` says otherwise. */
  const D = {
    back:     'M15 5 L8 12 L15 19',
    close:    'M6 6 L18 18 M18 6 L6 18',
    more:     'M12 5.6 v.1 M12 12 v.1 M12 18.4 v.1',
    flip:     'M4 8.5 a1.5 1.5 0 0 1 1.5-1.5 h2.2 l1.3-2 h6 l1.3 2 h2.2 A1.5 1.5 0 0 1 20 8.5 v8 a1.5 1.5 0 0 1-1.5 1.5 h-13 A1.5 1.5 0 0 1 4 16.5 z',
    lens:     'M12 15.2 a3.2 3.2 0 1 0 0-6.4 a3.2 3.2 0 0 0 0 6.4',
    plus:     'M12 6 v12 M6 12 h12',
    minus:    'M6 12 h12',
    tick:     'M5 12.6 L9.7 17.3 L19 7.6',
    bang:     'M12 5 v9 M12 18.2 v.1',
    cross:    'M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5',
    query:    'M8.6 9.1 a3.4 3.4 0 1 1 3.9 3.35 V15 M12.5 18.4 v.1',
    search:   'M10.8 17.1 a6.3 6.3 0 1 0 0-12.6 a6.3 6.3 0 0 0 0 12.6 M15.4 15.6 L20 20.2',
    place:    'M6 20 V7.2 a1.2 1.2 0 0 1 .9-1.16 l8-2.1 A1.2 1.2 0 0 1 16.4 5.1 V20 M4 20 h16 M13.6 13 v.1',
    lists:    'M9 6.5 h11 M9 12 h11 M9 17.5 h11 M4.6 6.5 v.1 M4.6 12 v.1 M4.6 17.5 v.1',
    clock:    'M12 20.2 a8.2 8.2 0 1 0 0-16.4 a8.2 8.2 0 0 0 0 16.4 M12 7.4 V12 l3.2 2.2',
    you:      'M12 11.6 a3.6 3.6 0 1 0 0-7.2 a3.6 3.6 0 0 0 0 7.2 M4.8 20.2 a7.2 7.2 0 0 1 14.4 0',
    camera:   'M4 8.6 a1.6 1.6 0 0 1 1.6-1.6 h2.6 l1.2-2 h5.2 l1.2 2 h2.6 A1.6 1.6 0 0 1 20 8.6 v8.2 a1.6 1.6 0 0 1-1.6 1.6 H5.6 A1.6 1.6 0 0 1 4 16.8 z M12 15.6 a3 3 0 1 0 0-6 a3 3 0 0 0 0 6',
    send:     'M12 19 V5 M6.4 10.6 L12 5 l5.6 5.6 M4.5 20.5 h15',
    receive:  'M12 5 v14 M17.6 13.4 L12 19 l-5.6-5.6 M4.5 20.5 h15',
    trash:    'M5.5 7.5 h13 M9.5 7.5 V5.4 h5 V7.5 M7.4 7.5 l.9 12 h7.4 l.9-12',
    edit:     'M5 19 h3.6 L19 8.6 a1.7 1.7 0 0 0-2.4-2.4 L6.2 16.6 z M14.6 8.2 l2.4 2.4',
    pin:      'M12 21 s6.4-6.1 6.4-10.4 a6.4 6.4 0 1 0-12.8 0 C5.6 14.9 12 21 12 21 z M12 13.2 a2.6 2.6 0 1 0 0-5.2 a2.6 2.6 0 0 0 0 5.2',
    star:     'M12 4.4 v3 M12 16.6 v3 M4.4 12 h3 M16.6 12 h3 M6.6 6.6 l2.1 2.1 M15.3 15.3 l2.1 2.1 M17.4 6.6 l-2.1 2.1 M8.7 15.3 l-2.1 2.1',
    add:      'M12 6 v12 M6 12 h12',
    blur:     'M7.4 15.6 a4.6 4.6 0 0 0 9.2 0 C16.6 11.2 12 4.6 12 4.6 S7.4 11.2 7.4 15.6 z',
    door:     'M8 20 V5.4 a1 1 0 0 1 1-1 h6 a1 1 0 0 1 1 1 V20 M5.6 20 h12.8 M13.6 12.6 v.1'
  };

  function svg(w, h, vb) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('width', w); s.setAttribute('height', h);
    s.setAttribute('viewBox', vb || '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    return s;
  }
  function path(d, attrs) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    for (const k of Object.keys(attrs || {})) p.setAttribute(k, attrs[k]);
    return p;
  }

  /* An icon: currentColor, so it takes the colour of whatever it sits in. */
  function icon(name, size, weight) {
    const d = D[name];
    const s = svg(size || 24, size || 24);
    s.classList.add('ic');
    if (!d) return s;
    s.appendChild(path(d, {
      stroke: 'currentColor', 'stroke-width': weight || 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));
    return s;
  }

  /* ── the threshold ──
     The app's mark. An opening, the light behind it, and the light landing on the floor in
     front. `state` bends the same drawing into the four answers a lens can give, so a place
     that works is a door standing open and a place that does not is a door with a step at it.
        open   the way is clear, light across the floor
        ajar   a blade of light, something to check first
        shut   closed, with the step that closes it drawn at the foot
        faint  an outline: nobody has surveyed enough to say
     Drawn in a 64x64 box. Colours come from the caller so the same mark works on paper,
     on ink and inside a coloured badge. */
  function threshold(size, state, opts) {
    const o = opts || {};
    // Small renders need a heavier line or the frame disappears into the fill.
    const bold = o.bold || (size < 30 ? 1.35 : 1);
    const s = svg(size, size, '0 0 64 64');
    s.classList.add('thr', 'thr-' + state);
    const ink = o.ink || 'currentColor';
    const light = o.light || 'var(--light)';
    const uid = 'thr' + Math.random().toString(36).slice(2, 8);

    const floorY = 50;
    const jambL = 20, jambR = 44, head = 10;

    if (o.gradient) {
      const defs = document.createElementNS(NS, 'defs');
      const g = document.createElementNS(NS, 'linearGradient');
      g.setAttribute('id', uid); g.setAttribute('x1', '0'); g.setAttribute('y1', '0');
      g.setAttribute('x2', '0'); g.setAttribute('y2', '1');
      for (const [off, col, op] of [[0, o.lightTop || '#FFE9C6', 1], [1, light, 0.75]]) {
        const st = document.createElementNS(NS, 'stop');
        st.setAttribute('offset', off); st.setAttribute('stop-color', col);
        st.setAttribute('stop-opacity', op);
        g.appendChild(st);
      }
      defs.appendChild(g); s.appendChild(defs);
    }
    const fillLight = o.gradient ? 'url(#' + uid + ')' : light;

    if (state === 'open' || state === 'ajar') {
      // the light on the floor, thrown forward out of the opening
      const spread = state === 'open' ? 15 : 5;
      const inner = state === 'open' ? jambL : 36;
      const outer = state === 'open' ? jambR : 43;
      s.appendChild(path(
        'M' + inner + ' ' + floorY + ' H' + outer +
        ' L' + (outer + spread) + ' 61 H' + (inner - spread) + ' Z',
        { fill: fillLight, opacity: state === 'open' ? 0.55 : 0.4 }));
      // the light in the opening
      s.appendChild(path(state === 'open'
        ? 'M' + jambL + ' ' + floorY + ' V' + head + ' H' + jambR + ' V' + floorY + ' Z'
        : 'M36 ' + floorY + ' V' + head + ' H' + jambR + ' V' + floorY + ' Z',
        { fill: fillLight, opacity: 0.92 }));
    }
    if (state === 'shut') {
      // the leaf, closed, and the step that shuts it
      s.appendChild(path('M' + jambL + ' ' + floorY + ' V' + head + ' H' + jambR + ' V' + floorY + ' Z',
        { fill: ink, opacity: 0.1 }));
      s.appendChild(path('M14 61 H50 V54 H' + (jambL - 2) + ' V' + floorY + ' H14 Z',
        { fill: ink, opacity: 0.62 }));
    }
    if (state === 'faint') {
      s.appendChild(path('M' + jambL + ' ' + floorY + ' V' + head + ' H' + jambR + ' V' + floorY,
        { fill: 'none', stroke: ink, 'stroke-width': 3.4 * bold, 'stroke-dasharray': '5 5',
          'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.65 }));
    }

    // the frame, always drawn, always the same weight: the constant in all four states
    if (state !== 'faint') {
      s.appendChild(path('M' + jambL + ' ' + floorY + ' V' + head + ' H' + jambR + ' V' + floorY,
        { fill: 'none', stroke: ink, 'stroke-width': 4.2 * bold, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    }
    if (state === 'ajar') {
      // the leaf standing part way open, swung into the room
      s.appendChild(path('M36 ' + head + ' L24 16 V56 L36 ' + floorY + ' Z',
        { fill: ink, opacity: 0.16, stroke: ink, 'stroke-width': 2.8 * bold, 'stroke-linejoin': 'round' }));
    }
    // the floor
    s.appendChild(path('M8 ' + floorY + ' H56',
      { stroke: ink, 'stroke-width': 3.2 * bold, 'stroke-linecap': 'round' }));
    return s;
  }

  /* The big one. The same threshold, drawn for a screen rather than a badge: a wall, an open
     door, light pouring out across the floor toward you, and the ground of the street below.
     Used on the first screen, in onboarding and wherever a screen is empty. */
  function scene(width, height, opts) {
    const o = opts || {};
    const W = 320, H = 200;
    const s = svg(width, height, '0 0 ' + W + ' ' + H);
    s.classList.add('scene');
    if (o.animate) s.classList.add('scene-live');
    const uid = 'sc' + Math.random().toString(36).slice(2, 8);
    const defs = document.createElementNS(NS, 'defs');

    const grad = (id, stops, attrs) => {
      const g = document.createElementNS(NS, attrs.r ? 'radialGradient' : 'linearGradient');
      g.setAttribute('id', id);
      for (const k of Object.keys(attrs)) if (k !== 'r') g.setAttribute(k, attrs[k]);
      for (const [off, col, op] of stops) {
        const st = document.createElementNS(NS, 'stop');
        st.setAttribute('offset', off); st.setAttribute('stop-color', col);
        if (op !== undefined) st.setAttribute('stop-opacity', op);
        g.appendChild(st);
      }
      defs.appendChild(g);
    };
    grad(uid + 'sky', [[0, '#DCE7F2'], [1, '#F2F5F8']], { x1: '0', y1: '0', x2: '0', y2: '1' });
    grad(uid + 'glow', [[0, '#FFE7BE', 0.95], [0.5, '#F6B25C', 0.34], [1, '#F6B25C', 0]],
      { r: 1, cx: '0.5', cy: '0.44', 'r': '0.44' });
    grad(uid + 'beam', [[0, '#FFEDD2', 0.95], [1, '#F6B25C', 0.1]], { x1: '0', y1: '0', x2: '0', y2: '1' });
    grad(uid + 'door', [[0, '#FFF3DD', 1], [1, '#F7BE72', 1]], { x1: '0', y1: '0', x2: '0', y2: '1' });
    s.appendChild(defs);

    const g = document.createElementNS(NS, 'g');
    s.appendChild(g);

    // the wall the door is set into
    g.appendChild(path('M0 0 H' + W + ' V150 H0 Z', { fill: 'url(#' + uid + 'sky)' }));
    // brick courses, faint: it is a building, not a diagram
    for (let y = 22; y < 150; y += 18) {
      g.appendChild(path('M0 ' + y + ' H' + W, { stroke: '#0F1A22', 'stroke-width': 1, opacity: 0.05 }));
    }
    // the glow behind the opening
    const glow = path('M20 0 H300 V200 H20 Z', { fill: 'url(#' + uid + 'glow)', opacity: 0.9 });
    glow.setAttribute('class', 'sc-glow');
    g.appendChild(glow);

    // the light landing on the floor
    const beam = path('M118 150 H202 L262 196 H58 Z', { fill: 'url(#' + uid + 'beam)' });
    beam.setAttribute('class', 'sc-beam');
    g.appendChild(beam);

    // the floor
    g.appendChild(path('M0 150 H' + W, { stroke: '#0F1A22', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    g.appendChild(path('M0 150 H' + W + ' V' + H + ' H0 Z', { fill: '#0F1A22', opacity: 0.06 }));

    // the opening
    g.appendChild(path('M118 150 V40 H202 V150 Z', { fill: 'url(#' + uid + 'door)' }));
    // the leaf, swung in, catching a little of the light down its front edge
    g.appendChild(path('M118 40 L88 54 V162 L118 150 Z',
      { fill: '#C9D6E4', opacity: 0.9, stroke: '#0F1A22', 'stroke-width': 3.5, 'stroke-linejoin': 'round' }));
    g.appendChild(path('M118 40 V150', { stroke: '#0F1A22', 'stroke-width': 2, opacity: 0.35 }));
    // the frame
    g.appendChild(path('M118 150 V40 H202 V150',
      { fill: 'none', stroke: '#0F1A22', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    // the handle on the leaf
    g.appendChild(path('M97 104 v12', { stroke: '#0F1A22', 'stroke-width': 3.5, 'stroke-linecap': 'round', opacity: 0.7 }));
    // one level threshold, drawn flat: the thing the app is about
    g.appendChild(path('M110 150 H210', { stroke: '#0B63C5', 'stroke-width': 4, 'stroke-linecap': 'round' }));
    return s;
  }

  /* Three doorways on one floor: open, part open, shut. The row a survey turns into.
     Used where a screen is empty and the app has to say what it would hold. */
  function terrace(width, height) {
    const s = svg(width, height, '0 0 240 96');
    s.classList.add('terrace');
    const states = ['open', 'ajar', 'shut'];
    for (let i = 0; i < 3; i++) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', 'translate(' + (i * 80 + 8) + ' 12) scale(1)');
      const t = threshold(64, states[i], { ink: '#0F1A22', light: '#F6B25C' });
      while (t.firstChild) g.appendChild(t.firstChild);
      g.setAttribute('transform', 'translate(' + (i * 80 + 8) + ' 12)');
      s.appendChild(g);
    }
    return s;
  }

  return { icon, threshold, scene, terrace, D };
})();
