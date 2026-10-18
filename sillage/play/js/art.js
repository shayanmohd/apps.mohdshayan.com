/* Sillage. Everything drawn rather than photographed: the trail that is the app's
   whole mark, the tab icons, the empty-state scenes, the emotion wheel, the bottle
   silhouettes on the shelf, and the charts on the skill page.
   All SVG built in JavaScript so it inherits the theme, and so the app needs
   no camera permission and no image files to look like something. */
const Art = (() => {

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h);
  }

  /* ---------- the trail ----------
     One ribbon of scent leaving its source and curling upward: thick and plum at the
     bottom, magenta through the middle, gold where it disappears. It is the launcher
     icon, so drawing it here from the same spine is what makes the first screen and the
     home screen feel like the same object.

     The taper is done by drawing the one spine four times with pathLength="100" and a
     dash window over each quarter, each a little narrower than the last. Round caps make
     the joins invisible, and a stroke can carry a gradient where a tapered fill cannot. */
  const SPINE = 'M54 84 C42 76 42 66 54 58 C66 50 66 40.5 55.5 34 C50.5 30.8 50.5 26.5 56 24.5';
  const seg = (from, to) => ' pathLength="100" stroke-dasharray="' + (to - from) + ' 200" stroke-dashoffset="' + (-from) + '"';

  /* The same substance lying down: the rule under every screen head is the trail
     leaving to the right and lifting off, so the masthead is drawn rather than ruled. */
  const RULE = 'M-8 26C46 26 66 13.5 118 15c50 1.4 68 12 120 9 50-3 62-14 110-20';
  function trailRule(o) {
    o = o || {};
    const u = 'sr' + (o.id || 'r');
    const halo = o.halo !== false;
    let d = '<defs>' +
      '<linearGradient id="' + u + 'a" x1="0" y1="0" x2="1" y2="0">' +
        '<stop class="g-plum" offset="0"/><stop class="g-accent" offset="1"/></linearGradient>' +
      '<linearGradient id="' + u + 'b" x1="0" y1="0" x2="1" y2="0">' +
        '<stop class="g-accent" offset="0"/><stop class="g-gold" offset="1"/></linearGradient>';
    if (halo) d += '<filter id="' + u + 'h" filterUnits="userSpaceOnUse" x="-20" y="-20" width="380" height="80">' +
      '<feGaussianBlur stdDeviation="3.4"/></filter>' +
      '<radialGradient id="' + u + 'g"><stop class="g-gold" offset="0" stop-opacity="0.9"/>' +
      '<stop class="g-gold" offset="1" stop-opacity="0"/></radialGradient>';
    d += '</defs>';
    let g = '<g class="t-drift">';
    if (halo) g += '<path class="t-halo t-accent" d="' + RULE + '" fill="none" stroke-width="10" ' +
      'stroke-linecap="round" filter="url(#' + u + 'h)"/>';
    g += '<path d="' + RULE + '" fill="none" stroke="url(#' + u + 'a)" stroke-width="8.6" stroke-linecap="round"' + seg(0, 42) + '/>';
    g += '<path class="t-accent" d="' + RULE + '" fill="none" stroke-width="6.2" stroke-linecap="round"' + seg(38, 74) + '/>';
    g += '<path d="' + RULE + '" fill="none" stroke="url(#' + u + 'b)" stroke-width="3.9" stroke-linecap="round"' + seg(70, 92) + '/>';
    g += '<path class="t-gold" d="' + RULE + '" fill="none" stroke-width="2.3" stroke-linecap="round"' + seg(89, 100) + '/>';
    g += '<path class="t-edge" d="M6 22.6C50 22.6 70 10.6 118 12" fill="none" stroke-width="1.3" ' +
         'stroke-linecap="round" opacity="0.3"/>';
    if (halo) g += '<circle class="t-tip" cx="340" cy="4" r="9" fill="url(#' + u + 'g)"/>';
    g += '</g>';
    g += '<g class="t-motes">' +
      '<circle class="t-mote" cx="300" cy="8" r="1.5" opacity="0.7"/>' +
      '<circle class="t-mote" cx="256" cy="14" r="1.1" opacity="0.5"/>' +
      '<circle class="t-mote" cx="326" cy="16" r="1" opacity="0.45"/></g>';
    return '<svg class="trail rule" viewBox="0 0 340 34" preserveAspectRatio="xMidYMid slice" ' +
      'aria-hidden="true" focusable="false">' + d + g + '</svg>';
  }

  /** o: { id, halo, motes, drift, plain } */
  function trail(o) {
    o = o || {};
    const u = 'sg' + (o.id || 'm');
    const halo = o.halo !== false;
    const motes = o.motes !== false;
    const cls = (o.drift === false) ? '' : ' class="t-drift"';
    let d = '<defs>' +
      '<linearGradient id="' + u + 'a" x1="0.5" y1="1" x2="0.5" y2="0">' +
        '<stop class="g-plum" offset="0"/><stop class="g-accent" offset="1"/></linearGradient>' +
      '<linearGradient id="' + u + 'b" x1="0.5" y1="1" x2="0.5" y2="0">' +
        '<stop class="g-accent" offset="0"/><stop class="g-gold" offset="1"/></linearGradient>';
    if (halo) d += '<filter id="' + u + 'h" filterUnits="userSpaceOnUse" x="0" y="0" width="108" height="108">' +
      '<feGaussianBlur stdDeviation="4.2"/></filter>' +
      '<radialGradient id="' + u + 'g"><stop class="g-gold" offset="0" stop-opacity="0.95"/>' +
      '<stop class="g-gold" offset="1" stop-opacity="0"/></radialGradient>';
    d += '</defs>';

    let g = '<g' + cls + '>';
    if (halo) g += '<path class="t-halo t-accent" d="' + SPINE + '" fill="none" ' +
      'stroke-width="13" stroke-linecap="round" filter="url(#' + u + 'h)"/>';
    g += '<path d="' + SPINE + '" fill="none" stroke="url(#' + u + 'a)" stroke-width="11.6" stroke-linecap="round"' + seg(0, 44) + '/>';
    g += '<path class="t-accent" d="' + SPINE + '" fill="none" stroke-width="8.4" stroke-linecap="round"' + seg(40, 76) + '/>';
    g += '<path d="' + SPINE + '" fill="none" stroke="url(#' + u + 'b)" stroke-width="5.2" stroke-linecap="round"' + seg(72, 93) + '/>';
    g += '<path class="t-gold" d="' + SPINE + '" fill="none" stroke-width="3" stroke-linecap="round"' + seg(90, 100) + '/>';
    /* the lit edge on the windward side, which is what stops it reading as a flat noodle */
    g += '<path class="t-edge" d="M50.4 80.6 C41.6 73.6 42.6 65.6 51.6 58.8" fill="none" ' +
         'stroke-width="1.5" stroke-linecap="round" opacity="0.34"/>';
    if (halo) g += '<circle class="t-tip" cx="56" cy="24.5" r="7" fill="url(#' + u + 'g)"/>';
    g += '</g>';
    if (motes) {
      g += '<g class="t-motes">' +
        '<circle class="t-mote" cx="66" cy="30" r="1.5" opacity="0.75"/>' +
        '<circle class="t-mote" cx="44" cy="38" r="1.1" opacity="0.6"/>' +
        '<circle class="t-mote" cx="63" cy="47" r="0.9" opacity="0.5"/></g>';
    }
    return '<svg class="trail' + (o.cls ? ' ' + o.cls : '') + '" viewBox="0 0 108 108" ' +
      'aria-hidden="true" focusable="false">' + d + g + '</svg>';
  }

  /* ---------- the icon set ----------
     One grid, one stroke width, one corner language. Stroke colour comes from the
     element, so an icon is the colour of the text it sits under. */
  const ICONS = {
    journal: '<path d="M5 20.4h14"/><path d="M12 20.4C8.1 17 8.1 13.7 12 11.1c3.9-2.6 3.9-5.6.6-7.4"/>',
    train: '<path d="M8 21.2h8a1.7 1.7 0 0 0 1.7-1.7v-8.6a1.7 1.7 0 0 0-1.7-1.7H8a1.7 1.7 0 0 0-1.7 1.7v8.6A1.7 1.7 0 0 0 8 21.2Z"/>' +
           '<path d="M9.1 9.2V7.1h5.8v2.1"/><path d="M12 5.2c-1.5-1-1.5-1.9 0-2.8"/>',
    shelf: '<path d="M3.6 20.6h16.8"/><path d="M6 20.6v-6.2c0-.7.4-1.3 1-1.6v-1.7h2v1.7c.6.3 1 .9 1 1.6v6.2"/>' +
           '<path d="M12.4 20.6v-8.9c0-.7.4-1.3 1-1.6V7.4h2v2.7c.6.3 1 .9 1 1.6v8.9"/>',
    lexicon: '<path d="M4.6 7.2a1.7 1.7 0 0 1 1.7-1.7h11.4a1.7 1.7 0 0 1 1.7 1.7v10.6a1.7 1.7 0 0 1-1.7 1.7H6.3a1.7 1.7 0 0 1-1.7-1.7Z"/>' +
             '<path d="M9.2 5.5V3.4h5.6v2.1"/><path d="M8.2 10.4h7.6"/><path d="M8.2 14h4.6"/>',
    close: '<path d="M4 4 12 12M12 4 4 12"/>'
  };
  function icon(name, cls) {
    const box = name === 'close' ? '0 0 16 16' : '0 0 24 24';
    return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="' + box + '" aria-hidden="true" focusable="false">' +
      (ICONS[name] || '') + '</svg>';
  }

  /* ---------- empty states ----------
     A drawn figure of the thing that is missing, rather than a sentence apologising
     for its absence. Same stroke language as the icons, same trail as the mark. */
  const SCENES = {
    /* an unopened flacon with the first wisp just leaving it */
    journal:
      '<path class="s-soft" d="M120 132c-34 0-58-5-58-11s24-11 58-11 58 5 58 11-24 11-58 11Z"/>' +
      '<path class="s-fill" d="M100 128V72c0-7 5-13 12-15V46h16v11c7 2 12 8 12 15v55Z"/>' +
      '<path class="s-line" d="M100 128V72c0-7 5-13 12-15V46h16v11c7 2 12 8 12 15v56"/>' +
      '<path class="s-line" d="M112 46h16"/><path class="s-line" d="M114 38h12v8h-12Z"/>' +
      '<path class="s-accent" d="M120 36c-9-7-9-13 0-19 9-6 9-12 1-17"/>' +
      '<circle class="s-gold" cx="128" cy="8" r="2.6"/><circle class="s-gold" cx="108" cy="20" r="1.8" opacity="0.6"/>',
    /* a rail with room on it */
    shelf:
      '<path class="s-soft" d="M28 128h184v6H28Z"/>' +
      '<path class="s-line" d="M28 128h184"/>' +
      '<path class="s-line" d="M60 128V78c0-6 4-11 9-13V54h14v11c5 2 9 7 9 13v50" opacity="0.32"/>' +
      '<path class="s-fill" d="M108 128V66c0-7 5-13 11-15V38h16v13c6 2 11 8 11 15v62Z"/>' +
      '<path class="s-line" d="M108 128V66c0-7 5-13 11-15V38h16v13c6 2 11 8 11 15v62"/>' +
      /* the same double curl as the mark, leaving the open bottle: a single quarter turn
         floating clear of the stopper read as a stray bracket rather than as scent */
      '<path class="s-accent" d="M127 36c-8-6-8-12 0-17 8-5 8-10 1-14"/>' +
      '<circle class="s-gold" cx="135" cy="10" r="2.2"/>' +
      '<circle class="s-gold" cx="116" cy="22" r="1.6" opacity="0.55"/>' +
      '<path class="s-line" d="M166 128V88c0-5 3-9 7-11V66h12v11c4 2 7 6 7 11v40" opacity="0.32"/>',
    /* cards, the top one still face down */
    lexicon:
      '<rect class="s-fill" x="52" y="40" width="112" height="76" rx="8" transform="rotate(-6 108 78)"/>' +
      '<rect class="s-line" x="52" y="40" width="112" height="76" rx="8" transform="rotate(-6 108 78)"/>' +
      '<rect class="s-fill" x="66" y="52" width="112" height="76" rx="8" transform="rotate(4 122 90)"/>' +
      '<rect class="s-line" x="66" y="52" width="112" height="76" rx="8" transform="rotate(4 122 90)"/>' +
      '<path class="s-accent" d="M96 100c-8-6-8-12 0-17 8-5 8-11 1-15"/>' +
      '<path class="s-line" d="M120 106h40M120 118h26" opacity="0.5"/>' +
      '<circle class="s-gold" cx="99" cy="63" r="2.4"/>',
    /* an axis waiting for a curve */
    skill:
      '<path class="s-line" d="M36 118h164"/><path class="s-line" d="M36 118V30"/>' +
      '<path class="s-line" d="M36 90h164M36 60h164" opacity="0.28"/>' +
      '<path class="s-accent" d="M36 106c26 0 26 0 26 0" opacity="0.9"/>' +
      '<circle class="s-gold" cx="62" cy="106" r="4"/>' +
      '<path class="s-line" d="M62 106c30-4 56-16 76-34s34-26 60-30" stroke-dasharray="3 7" opacity="0.45"/>',
    /* a wisp that came to nothing */
    nothing:
      '<path class="s-accent" d="M120 120c-14-11-14-22 0-33 14-11 14-22 2-31" opacity="0.35"/>' +
      '<circle class="s-gold" cx="122" cy="48" r="2.2" opacity="0.6"/>' +
      '<circle class="s-gold" cx="103" cy="66" r="1.6" opacity="0.45"/>' +
      '<circle class="s-gold" cx="136" cy="74" r="1.4" opacity="0.4"/>'
  };
  function scene(name) {
    return '<svg class="scene" viewBox="0 0 240 140" aria-hidden="true" focusable="false">' +
      (SCENES[name] || SCENES.nothing) + '</svg>';
  }

  /** An empty screen: a drawn figure, a line that says what is missing, and a way out. */
  function blank(name, head, body, action) {
    return '<div class="blank">' + scene(name) +
      '<h3>' + esc(head) + '</h3><p>' + esc(body) + '</p>' +
      (action ? '<button class="btn accent" ' + action.attr + '>' + esc(action.label) + '</button>' : '') +
      '</div>';
  }

  /* ---------- the emotion wheel ----------
     Eight wedges around a still centre. The selected wedge grows a little and
     takes its full hue; the rest sit at a third of it. */
  function wheel(selected, size) {
    const S = size || 240, c = S / 2;
    const F = Content.FEELINGS, n = F.length;
    const step = 360 / n;
    let out = '<svg class="wheel" viewBox="0 0 ' + S + ' ' + S + '" width="' + S + '" height="' + S + '" role="radiogroup" aria-label="How it felt">';
    F.forEach((f, i) => {
      const on = f.id === selected;
      const a0 = (i * step - 90 - step / 2) * Math.PI / 180;
      const a1 = ((i + 1) * step - 90 - step / 2) * Math.PI / 180;
      const rIn = S * 0.20, rOut = on ? S * 0.475 : S * 0.435;
      const p = (r, a) => (c + r * Math.cos(a)).toFixed(2) + ',' + (c + r * Math.sin(a)).toFixed(2);
      const d = 'M' + p(rIn, a0) + ' L' + p(rOut, a0) +
                ' A' + rOut + ',' + rOut + ' 0 0 1 ' + p(rOut, a1) +
                ' L' + p(rIn, a1) + ' A' + rIn + ',' + rIn + ' 0 0 0 ' + p(rIn, a0) + ' Z';
      const am = (a0 + a1) / 2;
      const tr = (rIn + rOut) / 2;
      out += '<g class="wedge' + (on ? ' on' : '') + '" data-feel="' + f.id + '" role="radio" tabindex="0"' +
             ' aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(f.label) + '">' +
             '<path d="' + d + '" fill="' + f.hue + '" fill-opacity="' + (on ? 1 : 0.32) + '"/>' +
             '<text x="' + (c + tr * Math.cos(am)).toFixed(1) + '" y="' + (c + tr * Math.sin(am) + 4).toFixed(1) + '"' +
             ' text-anchor="middle" class="wlab' + (on ? ' won' : '') + '">' + esc(f.label) + '</text></g>';
    });
    const sel = Content.feeling(selected);
    out += '<circle cx="' + c + '" cy="' + c + '" r="' + (S * 0.185) + '" class="whub"/>';
    out += '<text x="' + c + '" y="' + (c + 5) + '" text-anchor="middle" class="whubtext">' +
           esc(sel ? sel.label : 'Feel') + '</text>';
    out += '</svg>';
    return out;
  }

  /* ---------- bottles ----------
     Six silhouettes and two stoppers, chosen from a hash of the name so a bottle
     always looks like itself. The glass takes the hue of its dominant note family.
     Nothing here is a photograph, which is why the app asks for no camera. */
  const SHAPES = [
    'M11,97 L11,42 Q11,31 19,27 L41,27 Q49,31 49,42 L49,97 Z',
    'M15,97 L15,31 Q15,28 18,28 L42,28 Q45,28 45,31 L45,97 Z',
    'M7,97 L7,52 Q7,43 16,41 L44,41 Q53,43 53,52 L53,97 Z',
    'M13,97 L19,33 L41,33 L47,97 Z',
    'M8,68 C8,45 18,32 30,32 C42,32 52,45 52,68 L52,97 L8,97 Z',
    'M10,97 L10,46 L18,29 L42,29 L50,46 L50,97 Z'
  ];
  const TOPS = [
    '<rect x="23" y="5" width="14" height="13" rx="2"/><rect x="25.5" y="17" width="9" height="11"/>',
    '<circle cx="30" cy="12" r="7.5"/><rect x="25.5" y="17" width="9" height="12"/>'
  ];

  function bottleHue(b) {
    const fams = {};
    for (const t of (b.notes || [])) {
      const n = Lexicon.get(t); if (!n) continue;
      fams[n.f] = (fams[n.f] || 0) + 1;
    }
    const top = Object.keys(fams).sort((a, b2) => fams[b2] - fams[a])[0];
    if (top) return (Lexicon.family(top) || {}).hue || '#8A6A34';
    const pool = ['#9C6427', '#7A6242', '#8A5A24', '#6B6250', '#4B7666', '#A0423A'];
    return pool[hash(b.name + b.house) % pool.length];
  }

  /** level 0..1 of glass filled. Sample and decant are drawn small on purpose. */
  function bottleMark(b, opts) {
    const o = opts || {};
    const h = hash((b.name || '') + '|' + (b.house || ''));
    const shape = SHAPES[h % SHAPES.length];
    const top = TOPS[(h >> 3) % TOPS.length];
    const hue = bottleHue(b);
    const small = b.status === 'decant' || b.status === 'sample';
    const empty = b.status === 'empty' || b.status === 'rehomed';
    const level = empty ? 0 : (b.status === 'sample' ? 0.55 : b.status === 'decant' ? 0.7 : 0.86);
    const cid = 'bc' + h.toString(36) + (o.tag || '');
    const y = 97 - level * (97 - 30);
    const sc = small ? 0.66 : 1;
    let s = '<svg class="bottle" viewBox="0 0 60 104" preserveAspectRatio="xMidYMax meet" aria-hidden="true">';
    s += '<defs><clipPath id="' + cid + '"><path d="' + shape + '"/></clipPath></defs>';
    s += '<g transform="translate(' + (30 - 30 * sc) + ',' + (104 - 104 * sc) + ') scale(' + sc + ')">';
    s += '<ellipse class="bshadow" cx="30" cy="98.5" rx="26" ry="4"/>';
    s += '<g class="bcap">' + top + '</g>';
    s += '<path d="' + shape + '" class="bglass"/>';
    if (level > 0) s += '<rect x="0" y="' + y.toFixed(1) + '" width="60" height="' + (97 - y).toFixed(1) +
                        '" fill="' + hue + '" clip-path="url(#' + cid + ')" opacity="0.62"/>';
    s += '<path d="' + shape + '" class="bline"/>';
    s += '</g></svg>';
    return s;
  }

  /* ---------- charts ---------- */
  function chartShell(w, h, inner, label) {
    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' +
           esc(label || '') + '">' +
           inner + '</svg>';
  }

  /** Accuracy per scored session, oldest left. A naturalist's chart, not a HUD. */
  function accuracyCurve(series) {
    const W = 320, H = 132, P = 10, B = 16;
    if (!series.length) return '';
    const n = series.length;
    const x = i => n === 1 ? W / 2 : P + i * (W - 2 * P) / (n - 1);
    const y = p => (H - B) - (p / 100) * (H - B - P);
    let g = '';
    for (const p of [0, 50, 100]) {
      g += '<line x1="0" x2="' + W + '" y1="' + y(p) + '" y2="' + y(p) + '" class="grid"/>';
    }
    let d = '';
    series.forEach((s, i) => { d += (i ? ' L' : 'M') + x(i).toFixed(1) + ',' + y(s.pct).toFixed(1); });
    let area = d + ' L' + x(n - 1).toFixed(1) + ',' + (H - B) + ' L' + x(0).toFixed(1) + ',' + (H - B) + ' Z';
    let dots = '';
    series.forEach((s, i) => {
      dots += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(s.pct).toFixed(1) + '" r="3" class="dot"/>';
    });
    return chartShell(W, H, g + '<path d="' + area + '" class="area"/><path d="' + d + '" class="line"/>' + dots,
      'Accuracy across ' + n + ' scored sessions');
  }

  /** Cumulative distinct terms, one step per week. */
  function growthChart(series) {
    const W = 320, H = 132, P = 10, B = 16;
    if (series.length < 2) return '';
    const max = Math.max(8, series[series.length - 1].n);
    const x = i => P + i * (W - 2 * P) / (series.length - 1);
    const y = v => (H - B) - (v / max) * (H - B - P);
    let d = '';
    series.forEach((s, i) => {
      if (i === 0) d += 'M' + x(i).toFixed(1) + ',' + y(s.n).toFixed(1);
      else d += ' L' + x(i).toFixed(1) + ',' + y(series[i - 1].n).toFixed(1) + ' L' + x(i).toFixed(1) + ',' + y(s.n).toFixed(1);
    });
    const area = d + ' L' + x(series.length - 1).toFixed(1) + ',' + (H - B) + ' L' + x(0).toFixed(1) + ',' + (H - B) + ' Z';
    return chartShell(W, H,
      '<line x1="0" x2="' + W + '" y1="' + (H - B) + '" y2="' + (H - B) + '" class="grid"/>' +
      '<path d="' + area + '" class="area"/><path d="' + d + '" class="line"/>',
      'Vocabulary growth to ' + max + ' terms');
  }

  /** Twelve months of wears, for the shelf and for a bottle page. */
  function monthStrip(months, label) {
    const W = 320, H = 60, B = 14;
    const max = Math.max(1, ...months);
    const bw = (W - 11 * 4) / 12;
    let s = '';
    months.forEach((v, i) => {
      const h = Math.max(v ? 3 : 1, (v / max) * (H - B - 4));
      s += '<rect x="' + (i * (bw + 4)).toFixed(1) + '" y="' + (H - B - h).toFixed(1) +
           '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" class="' + (v ? 'bar' : 'bar off') + '"/>';
    });
    ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].forEach((m, i) => {
      s += '<text x="' + (i * (bw + 4) + bw / 2).toFixed(1) + '" y="' + (H - 2) + '" text-anchor="middle" class="tick">' + m + '</text>';
    });
    return chartShell(W, H, s, label || 'Wears by month');
  }

  /** Per shelf accuracy, as rows rather than a bar chart with an axis. */
  function shelfBars(rows) {
    let s = '';
    for (const r of rows) {
      const pct = r.pct === null ? 0 : r.pct;
      s += '<div class="sbrow"><span class="sbname">' + esc(r.name) + '</span>' +
           '<span class="sbtrack"><span class="sbfill" style="width:' + pct + '%"></span></span>' +
           '<span class="sbval">' + (r.pct === null ? 'not yet' : r.pct + '%') + '</span></div>';
    }
    return s;
  }

  /** A single wedge of the lexicon atlas, used as the family badge. */
  function familyBadge(fam, filled, total) {
    const S = 44, c = S / 2, r = 17;
    const pct = total ? filled / total : 0;
    const a = pct * Math.PI * 2 - Math.PI / 2;
    const large = pct > 0.5 ? 1 : 0;
    let d = '';
    if (pct > 0.999) d = 'M' + c + ',' + (c - r) + ' A' + r + ',' + r + ' 0 1 1 ' + (c - 0.01) + ',' + (c - r) + ' Z';
    else if (pct > 0) d = 'M' + c + ',' + c + ' L' + c + ',' + (c - r) +
      ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + (c + r * Math.cos(a)).toFixed(2) + ',' + (c + r * Math.sin(a)).toFixed(2) + ' Z';
    return '<svg class="fbadge" viewBox="0 0 ' + S + ' ' + S + '" aria-hidden="true">' +
      '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="' + fam.hue + '" fill-opacity="0.2"/>' +
      (d ? '<path d="' + d + '" fill="' + fam.hue + '" fill-opacity="0.9"/>' : '') +
      '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="' + fam.hue + '" stroke-opacity="0.72" stroke-width="1.5"/>' +
      '</svg>';
  }

  return { esc, hash, trail, trailRule, icon, scene, blank, wheel, bottleMark, bottleHue,
           accuracyCurve, growthChart, monthStrip, shelfBars, familyBadge };
})();
