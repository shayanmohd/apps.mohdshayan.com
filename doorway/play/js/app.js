/* Doorway: the screens. Reading order in this file follows the app: shell and navigation,
   the place list, the place page, the survey, the camera, lists, the check queue, you. */
const App = (() => {
  const $ = id => document.getElementById(id);
  const VIEWS = ['places', 'lists', 'check', 'you'];

  let view = 'places';
  let sheetStack = [];
  let filters = new Set();
  let searchTerm = '';
  let placeId = null;          // the place sheet's subject
  let survey = null;           // the survey in progress
  let cam = null;              // camera session
  let confirmCb = null;
  let toastTimer = null;

  /* ══ small helpers ══ */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function on(id, ev, fn) { const n = $(id); if (n) n.addEventListener(ev, fn); }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
  }

  function ask(head, body, yes, cb) {
    $('confirmH').textContent = head;
    $('confirmP').textContent = body;
    $('confirmYes').textContent = yes || 'Confirm';
    $('confirm').hidden = false;
    confirmCb = cb;
  }
  function closeConfirm(ok) {
    $('confirm').hidden = true;
    const cb = confirmCb; confirmCb = null;
    if (cb) cb(!!ok);
  }

  /* Two marks, both drawn. The tick, bang, cross and query say what kind of thing a line is.
     The door says the same thing in the app's own language: open, part open, shut, or an
     outline nobody has filled in. Both always sit beside words, never instead of them. */
  const MARK_ICON = { ok: 'tick', check: 'bang', blocked: 'cross', unknown: 'query' };
  const DOOR_STATE = { ok: 'open', check: 'ajar', blocked: 'shut', unknown: 'faint' };

  function mark(level) {
    const s = el('span', 'mk mk-' + level);
    s.appendChild(Icons.icon(MARK_ICON[level] || 'query', 18, 2.4));
    return s;
  }

  function doorMark(level, size, warm) {
    return Icons.threshold(size || 22, DOOR_STATE[level] || 'faint',
      { ink: 'currentColor', light: warm ? 'var(--light)' : 'currentColor' });
  }

  function verdictBadge(v, full) {
    const b = el('span', 'verdict v-' + v.level);
    b.appendChild(doorMark(v.level, 26, true));
    b.appendChild(el('span', null, full ? v.label : v.short));
    return b;
  }

  /* Fills every data-icon slot in the markup, once, at start. */
  function paintIcons(root) {
    for (const slot of (root || document).querySelectorAll('span.ico[data-icon]')) {
      if (slot.firstChild) continue;
      slot.appendChild(Icons.icon(slot.dataset.icon, 22, 2.2));
    }
  }

  function btn(cls, label, iconName) {
    const b = el('button', cls);
    if (iconName) b.appendChild(Icons.icon(iconName, 18, 2.2));
    b.appendChild(el('span', null, label));
    return b;
  }

  function freshLabel(c) {
    const f = Store.freshness(c.lastAt);
    const s = el('span', 'fresh f-' + f.k, f.k === 'none' ? 'Not surveyed' : f.short);
    return s;
  }

  /* ══ navigation ══ */
  function show(v) {
    view = v;
    for (const x of VIEWS) $('v-' + x).hidden = (x !== v);
    for (const t of document.querySelectorAll('.tab')) {
      const on = t.dataset.view === v;
      t.classList.toggle('is-on', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    }
    $('tabs').hidden = false;
    render(v);
  }

  function render(v) {
    if (v === 'places') renderPlaces();
    else if (v === 'lists') renderLists();
    else if (v === 'check') renderCheck();
    else if (v === 'you') renderYou();
  }

  function openSheet(id) {
    const s = $(id);
    if (!s || sheetStack.includes(id)) return;
    s.hidden = false;
    sheetStack.push(id);
    const h = s.querySelector('.sheet-title, h1, h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  function closeSheet(id) {
    const s = $(id); if (!s) return;
    s.hidden = true;
    sheetStack = sheetStack.filter(x => x !== id);
    if (id === 'sh-camera') stopCam();
  }
  function topSheet() { return sheetStack[sheetStack.length - 1] || null; }

  /* ══ the place list ══ */
  function decorate(p) {
    const c = Store.compose(p.id);
    const v = Lens.verdict(c, Store.lens());
    const fix = Geo.last();
    const d = fix && typeof p.lat === 'number' ? Geo.distance(fix, p) : null;
    return { p, c, v, d };
  }

  function passesFilters(c) {
    for (const k of filters) {
      const f = Lens.FILTERS.find(x => x.k === k);
      if (f && !f.test(c.facts)) return false;
    }
    return true;
  }

  function sortRows(rows, mode) {
    if (mode === 'distance' && Geo.last()) {
      rows.sort((a, b) => {
        if (a.d === null && b.d === null) return a.p.name.localeCompare(b.p.name);
        if (a.d === null) return 1;
        if (b.d === null) return -1;
        return a.d - b.d;
      });
    } else if (mode === 'checked') {
      rows.sort((a, b) => (b.c.lastAt || 0) - (a.c.lastAt || 0));
    } else {
      rows.sort((a, b) => a.p.name.localeCompare(b.p.name));
    }
    return rows;
  }

  function placeRow(r) {
    const b = el('button', 'prow');
    b.dataset.id = r.p.id;
    b.setAttribute('aria-label', r.p.name + '. ' + (r.v ? r.v.label + '. ' : '') +
      (r.c.lastAt ? Store.freshness(r.c.lastAt).label : 'Not surveyed yet'));
    const top = el('div', 'prow-top');
    top.appendChild(el('span', 'prow-name', r.p.name));
    if (r.d !== null) top.appendChild(el('span', 'prow-dist', Geo.fmt(r.d)));
    b.appendChild(top);
    const meta = [r.p.kind, r.p.area].filter(Boolean).join(', ');
    if (meta) b.appendChild(el('p', 'prow-meta', meta));
    const tags = el('div', 'prow-tags');
    if (r.v) tags.appendChild(verdictBadge(r.v));
    tags.appendChild(freshLabel(r.c));
    const f = r.c.facts;
    const quick = [];
    if (f['entrance.steps'] && Number(f['entrance.steps'].v) === 0) quick.push('Level in');
    else if (f['entrance.ramp'] && (f['entrance.ramp'].v === 'fixed' || f['entrance.ramp'].v === 'lift')) quick.push('Ramp');
    else if (f['entrance.steps']) quick.push(Number(f['entrance.steps'].v) === 1 ? '1 step' : f['entrance.steps'].v + ' steps');
    if (f['bathroom.accessible']) quick.push(f['bathroom.accessible'].v === 'yes' ? 'Accessible toilet' : 'No accessible toilet');
    if (f['sensory.noise']) quick.push(Store.say('sensory.noise', f['sensory.noise'].v).split(',')[0]);
    for (const q of quick.slice(0, 2)) tags.appendChild(el('span', 'tag', q));
    b.appendChild(tags);
    return b;
  }

  function renderPlaces() {
    const list = $('placeList');
    clear(list);
    const all = Store.places();
    $('placesEmpty').hidden = all.length > 0;
    // Nothing to search, filter or sort until there is something to search, filter or sort.
    const bar = document.querySelector('#v-places .filterbar');
    if (bar) bar.hidden = all.length === 0;
    const term = searchTerm.trim().toLowerCase();
    let rows = all.map(decorate).filter(r => passesFilters(r.c));
    if (term) rows = rows.filter(r => (r.p.name + ' ' + r.p.area + ' ' + r.p.kind).toLowerCase().includes(term));
    sortRows(rows, Store.settings().sort);
    rows.forEach((r, i) => {
      const row = placeRow(r);
      if (i < 12) { row.classList.add('rise'); row.style.animationDelay = (i * 28) + 'ms'; }
      list.appendChild(row);
    });

    const lens = Lens.active();
    const lensName = lens.length ? lens.map(m => Lens.MOD[m.type].name).join(' and ') : 'Everyone view';
    $('placesSub').textContent = all.length
      ? rows.length + (rows.length === 1 ? ' place, ' : ' places, ') + 'lens: ' + lensName
      : 'Nothing surveyed yet';
    if (all.length && !rows.length) {
      const e = el('p', 'note', term
        ? 'Nothing matches that search.'
        : 'No place passes every filter yet. Turn one off, or survey somewhere new.');
      list.appendChild(e);
    }
    const foot = $('placesFoot');
    if (all.length) {
      foot.hidden = false;
      foot.textContent = 'Facts are what somebody saw on the date shown. Doorway records evidence, it does not promise that a place has not changed since.';
    } else foot.hidden = true;

    renderFilterChips();
    renderSortChips();
    renderGeoNote();
    if (!all.length) {
      const art = $('placesEmptyArt');
      if (art && !art.firstChild) art.appendChild(Icons.scene(268, 168, { animate: true }));
    }
  }

  function renderFilterChips() {
    const box = $('filterChips');
    clear(box);
    for (const f of Lens.FILTERS) {
      const c = el('button', 'chip' + (filters.has(f.k) ? ' is-on' : ''), f.label);
      c.setAttribute('aria-pressed', filters.has(f.k) ? 'true' : 'false');
      c.addEventListener('click', () => {
        if (filters.has(f.k)) filters.delete(f.k); else filters.add(f.k);
        N.buzz(8, 120);
        renderPlaces();
      });
      box.appendChild(c);
    }
  }

  const SORTS = [{ k: 'distance', label: 'Nearest' }, { k: 'checked', label: 'Recently checked' }, { k: 'name', label: 'Name' }];

  function renderSortChips() {
    const box = $('sortChips');
    clear(box);
    const cur = Store.settings().sort;
    for (const s of SORTS) {
      const c = el('button', 'chip' + (cur === s.k ? ' is-on' : ''), s.label);
      c.setAttribute('aria-pressed', cur === s.k ? 'true' : 'false');
      c.addEventListener('click', () => {
        Store.set('sort', s.k);
        if (s.k === 'distance' && !Geo.last()) locate();
        else renderPlaces();
      });
      box.appendChild(c);
    }
  }

  function renderGeoNote() {
    const n = $('geoNote');
    const msg = Geo.MESSAGES[Geo.state] || '';
    const fix = Geo.last();
    n.className = 'note';
    if (Store.settings().sort !== 'distance') { n.hidden = true; $('geoBtn').hidden = true; return; }
    $('geoBtn').hidden = false;
    $('geoBtn').textContent = fix ? 'Update' : 'Use my position';
    $('geoBtn').setAttribute('aria-label', fix ? 'Update my position' : 'Use my position');
    if (Geo.state === 'asking') {
      // A fix can take several seconds indoors, which is exactly where it gets asked for.
      n.hidden = false; n.className = 'loading'; n.textContent = Geo.MESSAGES.asking;
    } else if (fix) {
      n.hidden = false;
      n.textContent = 'From your position ' + Store.ago(fix.at) +
        (fix.acc ? ', about ' + fix.acc + ' m accurate.' : '.');
    } else if (msg) { n.hidden = false; n.textContent = msg; }
    else n.hidden = true;
  }

  function locate() {
    renderGeoNote();
    Geo.locate().then(fix => {
      if (fix) N.buzz(10, 120);
      renderPlaces();
      if (!fix && Geo.state === 'denied') Store.set('sort', 'name');
    });
  }

  /* ══ the place page ══ */
  function openPlace(id) {
    placeId = id;
    openSheet('sh-place');
    renderPlace();
    $('placeBody').scrollTop = 0;
  }

  function drawWidth() { return Math.max(232, Math.min(window.innerWidth - 62, 430)); }

  function provenance(fact) {
    const bits = [];
    if (fact.n > 1) bits.push(fact.n + ' surveys agree');
    else bits.push(fact.by === 'you' ? 'your survey' : fact.by);
    bits.push(Store.ago(fact.seen));
    if (fact.reconfirmed) bits.push('confirmed since then');
    return bits.join(', ');
  }

  function factRow(f, fact) {
    const row = el('div', 'frow');
    const top = el('div', 'frow-top');
    top.appendChild(el('span', 'frow-l', f.label));
    top.appendChild(el('span', 'frow-v', Store.say(f.k, fact.v)));
    row.appendChild(top);
    // Where the answer came from sits under it on its own line. Right aligning it against a
    // wrapping label turned every long provenance into a staircase.
    row.appendChild(el('p', 'frow-p', provenance(fact)));
    return row;
  }

  function groupCard(g, c, p) {
    const rows = Store.FACTS.filter(f => f.g === g.g && c.facts[f.k]);
    const missing = Store.FACTS.filter(f => f.g === g.g && !c.facts[f.k] &&
      (!f.showIf || f.showIf(Object.fromEntries(Object.entries(c.facts).map(([k, v]) => [k, v.v])))));
    const card = el('div', 'card');
    const head = el('div', 'card-h');
    head.appendChild(el('h3', null, g.title));
    if (rows.length) {
      const newest = Math.max.apply(null, rows.map(f => c.facts[f.k].seen));
      const fr = Store.freshness(newest);
      head.appendChild(el('span', 'fresh f-' + fr.k, fr.short));
    }
    card.appendChild(head);

    if (!rows.length) {
      card.appendChild(el('p', 'miss', 'Nobody has surveyed this part yet.'));
      const b = el('button', 'btn small', 'Survey ' + g.title.toLowerCase());
      b.addEventListener('click', () => startSurvey(p.id, g.g));
      const row = el('div', 'btnrow'); row.appendChild(b); card.appendChild(row);
      return card;
    }

    for (const f of rows) {
      card.appendChild(factRow(f, c.facts[f.k]));
      const fact = c.facts[f.k];
      const slotSplit = f.slotted && fact.slots &&
        new Set(fact.slots.map(x => x.slot)).size > 1 &&
        new Set(fact.slots.map(x => String(x.v))).size > 1;
      if (fact.differs.length && !slotSplit) {
        const d = el('p', 'frow-differ');
        const other = fact.differs[0];
        d.textContent = 'An earlier survey said ' + Store.say(f.k, other.v) + ', ' + Store.ago(other.at) +
          '. The newest answer is shown.';
        card.appendChild(d);
      }
      if (f.slotted && fact.slots && fact.slots.length > 1) {
        const byslot = {};
        for (const s of fact.slots) if (!byslot[s.slot]) byslot[s.slot] = s.v;
        const keys = Object.keys(byslot);
        if (keys.length > 1) {
          const d = el('p', 'frow-differ');
          d.textContent = keys.map(k => Store.slotLabel(k) + ': ' + Store.say(f.k, byslot[k]).toLowerCase()).join('. ') + '.';
          card.appendChild(d);
        }
      }
    }

    if (g.g === 'entrance' || (g.g === 'bathroom' && c.facts['bathroom.exists'] && c.facts['bathroom.exists'].v !== 'no')) {
      const cv = document.createElement('canvas');
      cv.setAttribute('role', 'img');
      const w = drawWidth();
      if (g.g === 'entrance') {
        cv.setAttribute('aria-label', 'Scale drawing of the way in, made from the surveyed numbers.');
        card.appendChild(cv);
        Diagram.entrance(cv, c.facts, { width: w, height: 210 });
      } else {
        cv.setAttribute('aria-label', 'Plan of the toilet, made from the surveyed answers.');
        card.appendChild(cv);
        Diagram.bathroom(cv, c.facts, { width: w, height: 180 });
      }
      card.appendChild(el('p', 'hero-cap', 'Drawn from the numbers above. Not a photograph.'));
    }

    if (missing.length) {
      const m = el('p', 'miss', missing.length === 1
        ? 'One thing here has not been surveyed: ' + missing[0].label.toLowerCase() + '.'
        : missing.length + ' things here have not been surveyed yet.');
      card.appendChild(m);
      const b = el('button', 'btn small', 'Add what is missing');
      b.addEventListener('click', () => startSurvey(p.id, g.g));
      const row = el('div', 'btnrow'); row.appendChild(b); card.appendChild(row);
    }
    return card;
  }

  function renderPlace() {
    const p = Store.place(placeId);
    if (!p) { closeSheet('sh-place'); return; }
    const c = Store.compose(p.id);
    const v = Lens.verdict(c, Store.lens());
    const body = $('placeBody');
    const keepTop = body.scrollTop;
    clear(body);
    body.classList.add('flush');
    $('placeHeadTitle').textContent = p.name;

    /* hero: the newest photograph if there is one, otherwise the scale drawing */
    const hero = el('div', 'hero');
    const drawHero = (lost) => {
      clear(hero);
      const wrap = el('div', 'hero-draw');
      const cv = document.createElement('canvas');
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', 'Scale drawing of the way in, made from the surveyed numbers.');
      wrap.appendChild(cv);
      hero.appendChild(wrap);
      hero.appendChild(el('p', 'hero-cap', lost
        ? 'The photograph is no longer on this phone. This is drawn from the surveyed numbers.'
        : (c.facts['entrance.steps'] || c.facts['entrance.door_width_cm']
          ? 'No photograph yet. This is drawn from the surveyed numbers.'
          : 'No photograph and no measurements yet.')));
      Diagram.entrance(cv, c.facts, { width: Math.min(window.innerWidth - 32, 460), height: 208 });
    };
    const photo = c.photos.filter(x => x.role === 'entrance').sort((a, b) => b.at - a.at)[0] || c.photos[0];
    if (photo) {
      const img = el('img');
      img.alt = 'Photograph of ' + p.name + ', taken ' + Store.ago(photo.at) + '.';
      hero.appendChild(img);
      // A picture whose bytes have gone (storage cleared, a restore that brought back the
      // notes and not the album) must not leave a grey band where the evidence was.
      Photos.url(photo.media).then(u => {
        if (u) { img.src = u; img.onerror = () => drawHero(true); } else drawHero(true);
      }).catch(() => drawHero(true));
    } else drawHero();
    body.appendChild(hero);

    if (c.photos.length > 1) {
      const strip = el('div', 'photo-strip');
      for (const ph of c.photos) {
        const img = el('img');
        const role = (Store.PHOTO_ROLES.find(r => r.v === ph.role) || {}).label || 'Photograph';
        img.alt = role + ', ' + Store.ago(ph.at);
        strip.appendChild(img);
        Photos.url(ph.media).then(u => { if (u) img.src = u; else img.remove(); })
          .catch(() => img.remove());
      }
      body.appendChild(strip);
    }

    const head = el('div', 'pl-head');
    const h = el('h2', 'pl-name', p.name);
    h.id = 'placeName';
    head.appendChild(h);
    const fix = Geo.last();
    const d = fix && typeof p.lat === 'number' ? Geo.distance(fix, p) : null;
    const meta = [p.kind, p.area, d !== null ? Geo.fmt(d) + ' away' : null].filter(Boolean).join(', ');
    head.appendChild(el('p', 'pl-meta', meta));
    body.appendChild(head);

    const main = el('div', 'pl-body');

    if (v) {
      const panel = el('div', 'vpanel');
      const ph = el('div', 'vpanel-h vp-' + v.level);
      ph.appendChild(doorMark(v.level, 40, v.level === 'ok' || v.level === 'check'));
      ph.appendChild(el('span', 'big', v.label));
      ph.appendChild(el('span', 'lens-name', Lens.active().map(m => Lens.MOD[m.type].name).join(', ')));
      panel.appendChild(ph);
      const ul = el('ul', 'reasons');
      for (const r of v.reasons) {
        const li = el('li', 'r-' + r.level);
        li.appendChild(mark(r.level));
        const t = el('span', null, r.text);
        li.appendChild(t);
        ul.appendChild(li);
      }
      panel.appendChild(ul);
      main.appendChild(panel);
    } else {
      const note = el('p', 'note', 'Everyone view: the facts are shown without a verdict. Build a lens in You to have them read against your own thresholds.');
      main.appendChild(note);
    }

    /* freshness and the two second contribution */
    const fr = Store.freshness(c.lastAt);
    const sum = el('p', 'note tight');
    sum.textContent = c.surveyCount === 0
      ? 'No survey yet.'
      : c.surveyCount + (c.surveyCount === 1 ? ' survey' : ' surveys') +
        (c.confirmCount ? ', ' + c.confirmCount + ' still accurate ' + (c.confirmCount === 1 ? 'tap' : 'taps') : '') +
        '. ' + fr.label + '. Surveyed by ' + c.surveyors.map(s => s === 'you' ? 'you' : s).join(' and ') + '.';
    main.appendChild(sum);
    if (fr.k === 'stale') {
      const w = el('p', 'note');
      w.innerHTML = '';
      w.appendChild(el('span', 'fresh f-stale', 'Over a year old. '));
      w.appendChild(document.createTextNode('Renovations happen quietly. Worth a fresh look before you rely on it.'));
      main.appendChild(w);
    }

    if (p.note) {
      const c2 = el('div', 'card');
      c2.appendChild(el('h3', null, 'Your note'));
      c2.appendChild(el('p', 'note tight', p.note));
      main.appendChild(c2);
    }

    for (const g of Store.GROUPS) main.appendChild(groupCard(g, c, p));

    /* lists */
    const inLists = Store.listsWith(p.id);
    if (inLists.length) {
      const lc = el('div', 'card');
      lc.appendChild(el('h3', null, 'On your lists'));
      lc.appendChild(el('p', 'note tight', inLists.map(l => l.title).join(', ')));
      main.appendChild(lc);
    }

    /* actions */
    const act = el('div', 'card');
    act.id = 'placeActions';
    act.appendChild(el('h3', null, 'This place'));
    const row = el('div', 'btnrow');
    const bList = btn('btn small', 'Add to a list', 'lists');
    bList.addEventListener('click', () => openListPicker(p.id));
    const bSend = btn('btn small', 'Send this place', 'send');
    bSend.addEventListener('click', () => sendPlace(p));
    const bEdit = btn('btn small', 'Edit details', 'edit');
    bEdit.addEventListener('click', () => editPlace(p));
    const bDel = btn('btn small danger', 'Remove', 'trash');
    bDel.addEventListener('click', () => {
      ask('Remove ' + p.name + '?', 'Its surveys and photographs go with it. This cannot be undone.', 'Remove', ok => {
        if (!ok) return;
        const media = Store.compose(p.id).photos.map(x => x.media);
        Photos.del(media);
        Store.removePlace(p.id);
        closeSheet('sh-place');
        render(view);
        toast('Removed.');
      });
    });
    row.appendChild(bList); row.appendChild(bSend); row.appendChild(bEdit); row.appendChild(bDel);
    act.appendChild(row);
    main.appendChild(act);

    body.appendChild(main);
    body.scrollTop = keepTop;

    $('stillBtn').disabled = c.surveyCount === 0;
    const stillLbl = $('stillBtn').querySelector('.lbl');
    if (stillLbl) stillLbl.textContent = c.surveyCount === 0 ? 'Nothing to confirm' : 'Still accurate';
  }

  function stillAccurate() {
    const p = Store.place(placeId); if (!p) return;
    const fresh = Store.confirm(p.id);
    N.pattern([14, 60, 22], 170);
    toast(fresh ? 'Marked as still accurate today. That is the whole contribution.'
                : 'Already dated today. One tap a day is all it needs.');
    renderPlace();
    render(view);
  }

  function sendPlace(p) {
    const text = Share.placeText(p);
    if (!N.shareText(p.name + ' access notes', text)) {
      navigator.clipboard && navigator.clipboard.writeText(text)
        .then(() => toast('Copied the notes for ' + p.name + '.'))
        .catch(() => toast('Sharing is not available here.'));
    }
  }

  function editPlace(p) {
    const body = $('placeBody');
    const card = el('div', 'card');
    card.appendChild(el('h3', null, 'Edit details'));
    const mk = (label, value, kind) => {
      const f = el('div', 'field');
      const l = el('label', null, label);
      const id = 'ed-' + kind;
      l.setAttribute('for', id);
      const i = kind === 'note' ? el('textarea') : el('input');
      if (kind !== 'note') i.type = 'text';
      i.id = id; i.value = value || '';
      f.appendChild(l); f.appendChild(i);
      card.appendChild(f);
      return i;
    };
    const name = mk('Name', p.name, 'name');
    const area = mk('Street or area', p.area, 'area');
    const kindSel = el('select');
    kindSel.id = 'ed-kind';
    for (const k of Store.KINDS) {
      const o = el('option', null, k); o.value = k;
      if (k === p.kind) o.selected = true;
      kindSel.appendChild(o);
    }
    const kf = el('div', 'field');
    const kl = el('label', null, 'Kind of place'); kl.setAttribute('for', 'ed-kind');
    kf.appendChild(kl); kf.appendChild(kindSel);
    card.appendChild(kf);
    const note = mk('Your note', p.note, 'note');
    const row = el('div', 'btnrow');
    const save = el('button', 'btn primary small', 'Save');
    save.addEventListener('click', () => {
      Store.updatePlace(p.id, { name: name.value.trim() || p.name, area: area.value.trim(),
        kind: kindSel.value, note: note.value.trim() });
      toast('Saved.');
      renderPlace(); render(view);
    });
    const cancel = el('button', 'btn small ghost', 'Cancel');
    cancel.addEventListener('click', renderPlace);
    const here = el('button', 'btn small', 'Set position to here');
    here.addEventListener('click', () => {
      Geo.locate().then(fix => {
        if (!fix) { toast('No position available.'); return; }
        Store.updatePlace(p.id, { lat: fix.lat, lng: fix.lng });
        toast('Position saved for ' + p.name + '.');
        renderPlace();
      });
    });
    row.appendChild(save); row.appendChild(here); row.appendChild(cancel);
    card.appendChild(row);
    const target = $('placeActions');
    if (target && target.parentNode) target.parentNode.replaceChild(card, target);
    else body.appendChild(card);
    card.scrollIntoView({ block: 'center' });
    name.focus();
  }

  /* ══ the survey ══ */
  const STEP_TITLES = { place: 'The place', entrance: 'The way in', bathroom: 'The toilet',
                        inside: 'Inside', sensory: 'Sound and light', staff: 'Staff', review: 'Check and save' };

  function startSurvey(existingId, onlyGroup) {
    const groups = onlyGroup ? [onlyGroup] : Store.GROUPS.map(g => g.g);
    survey = {
      placeId: existingId || null,
      newPlace: existingId ? null : { name: '', kind: 'Cafe', area: '', note: '', lat: null, lng: null },
      facts: {}, photos: [], slot: Store.slotNow(), started: Date.now(), step: 0,
      steps: (existingId ? [] : ['place']).concat(groups).concat(['review']),
      focus: onlyGroup || null
    };
    if (existingId) {
      // Adding detail: show what is already known so nobody re-answers the same question.
      survey.known = Store.compose(existingId).facts;
    }
    openSheet('sh-survey');
    lastStepKey = null;
    renderStep(false);
  }

  function currentStep() { return survey.steps[survey.step]; }

  let lastStepKey = null;
  function renderStep(keepScroll) {
    if (!survey) return;
    const s = currentStep();
    const body = $('surveyBody');
    // Answering a question rebuilds the step, because one answer can reveal the next question.
    // Rebuilding it must not throw you back to the top of a screen you were half way down.
    const key = survey.step + ':' + (survey.placeId || 'new');
    const keep = keepScroll !== false && key === lastStepKey ? body.scrollTop : 0;
    lastStepKey = key;
    clear(body);
    body.scrollTop = keep;
    const place = survey.placeId ? Store.place(survey.placeId) : null;
    $('surveyTitle').textContent = place ? place.name : 'New place';

    const dots = $('surveySteps');
    clear(dots);
    survey.steps.forEach((x, i) => {
      const d = el('i', i < survey.step ? 'done' : i === survey.step ? 'now' : '');
      dots.appendChild(d);
    });

    if (s === 'place') renderPlaceStep(body);
    else if (s === 'review') renderReviewStep(body);
    else renderGroupStep(body, s);

    body.scrollTop = keep;
    $('surveyBack').hidden = survey.step === 0;
    $('surveySkip').hidden = s === 'review' || s === 'place';
    $('surveyNext').textContent = s === 'review' ? 'Save survey' : 'Next';
    tickClock();
  }

  function renderPlaceStep(body) {
    const np = survey.newPlace;
    body.appendChild(el('h2', 'step-h', 'Where are you?'));
    body.appendChild(el('p', 'step-lead', 'The name is all that is needed. Everything else can wait.'));

    const f1 = el('div', 'field');
    const l1 = el('label', null, 'Name of the place'); l1.setAttribute('for', 'npName');
    const i1 = el('input'); i1.type = 'text'; i1.id = 'npName'; i1.value = np.name;
    i1.placeholder = 'The name over the door';
    i1.maxLength = 80;
    i1.addEventListener('input', () => {
      np.name = i1.value;
      const e = $('npNameErr');
      if (e && i1.value.trim()) { e.remove(); i1.removeAttribute('aria-invalid'); }
    });
    f1.appendChild(l1); f1.appendChild(i1);
    if (survey.nameError) f1.appendChild(nameError());
    body.appendChild(f1);

    const f2 = el('div', 'field');
    f2.appendChild(el('p', 'flabel', 'Kind of place'));
    const chips = el('div', 'chips');
    for (const k of Store.KINDS) {
      const c = el('button', 'chip' + (np.kind === k ? ' is-on' : ''), k);
      c.setAttribute('aria-pressed', np.kind === k ? 'true' : 'false');
      c.addEventListener('click', () => { np.kind = k; N.buzz(7, 110); renderStep(); });
      chips.appendChild(c);
    }
    f2.appendChild(chips);
    body.appendChild(f2);

    const f3 = el('div', 'field');
    const l3 = el('label', null, 'Street or area'); l3.setAttribute('for', 'npArea');
    const i3 = el('input'); i3.type = 'text'; i3.id = 'npArea'; i3.value = np.area;
    i3.placeholder = 'Enough to find it again';
    i3.maxLength = 80;
    i3.addEventListener('input', () => { np.area = i3.value; });
    f3.appendChild(l3); f3.appendChild(i3);
    body.appendChild(f3);

    const f4 = el('div', 'field');
    f4.appendChild(el('p', 'flabel', 'Position'));
    const b = btn('btn', np.lat === null ? 'Pin where I am standing' : 'Position saved, pin again', 'pin');
    b.addEventListener('click', () => {
      b.disabled = true;
      const wait = el('p', 'loading', Geo.MESSAGES.asking);
      f4.appendChild(wait);
      Geo.locate().then(fix => {
        b.disabled = false;
        wait.remove();
        if (!fix) {
          const err = el('p', 'inline-err');
          err.appendChild(Icons.icon('bang', 16, 2.4));
          err.appendChild(el('span', null, Geo.MESSAGES[Geo.state] || 'No position available.'));
          f4.appendChild(err);
          return;
        }
        np.lat = fix.lat; np.lng = fix.lng;
        N.buzz(10, 130);
        renderStep();
      });
    });
    f4.appendChild(b);
    f4.appendChild(el('p', 'note tight', np.lat === null
      ? 'Optional. A pin lets Doorway sort by how far away a place is. It stays on this phone.'
      : 'Pinned, accurate to about ' + (Geo.last() ? Geo.last().acc : 0) + ' m.'));
    body.appendChild(f4);
  }

  function factValue(k) {
    if (survey.facts[k] !== undefined) return survey.facts[k];
    return undefined;
  }
  function knownValue(k) {
    return survey.known && survey.known[k] ? survey.known[k] : null;
  }

  function setFact(k, v) {
    if (v === undefined || v === null) delete survey.facts[k];
    else survey.facts[k] = v;
    N.buzz(8, 120);
    renderStep();
  }

  function renderGroupStep(body, g) {
    const group = Store.GROUPS.find(x => x.g === g);
    body.appendChild(el('h2', 'step-h', group.title));
    body.appendChild(el('p', 'step-lead', group.lead));

    if (g === 'entrance' || g === 'bathroom' || g === 'inside') {
      const role = g === 'inside' ? 'inside' : g;
      const taken = survey.photos.filter(p => p.role === role).length;
      const row = el('div', 'btnrow');
      const b = btn('btn' + (taken ? '' : ' primary'),
        taken ? 'Photograph again, ' + taken + ' taken' : 'Photograph ' + group.title.toLowerCase(), 'camera');
      b.addEventListener('click', () => openCamera(role));
      row.appendChild(b);
      body.appendChild(row);
      body.appendChild(el('p', 'note tight', g === 'entrance'
        ? 'A photograph of the doorway settles arguments no checkbox can. Blur anything you do not want to keep before you save it.'
        : 'Optional, and only if it is yours to take. Blur anything you do not want to keep.'));
    }

    if (g === 'sensory') {
      const f = el('div', 'field');
      f.appendChild(el('p', 'flabel', 'When were you there?'));
      const chips = el('div', 'chips');
      for (const s of Store.SLOTS) {
        const c = el('button', 'chip' + (survey.slot === s.v ? ' is-on' : ''), s.label);
        c.setAttribute('aria-pressed', survey.slot === s.v ? 'true' : 'false');
        c.addEventListener('click', () => { survey.slot = s.v; N.buzz(7, 110); renderStep(); });
        chips.appendChild(c);
      }
      f.appendChild(chips);
      f.appendChild(el('p', 'note tight', 'Noise and crowding are kept against the time of day, because that is the only way they mean anything.'));
      body.appendChild(f);
    }

    const shown = Object.assign({}, survey.facts);
    for (const k of Object.keys(survey.known || {})) if (shown[k] === undefined) shown[k] = survey.known[k].v;

    for (const f of Store.FACTS) {
      if (f.g !== g) continue;
      if (f.showIf && !f.showIf(shown)) continue;
      body.appendChild(question(f));
    }
  }

  function question(f) {
    const q = el('div', 'q');
    q.appendChild(el('p', 'q-h', f.q));
    const known = knownValue(f.k);
    if (f.hint) q.appendChild(el('p', 'q-hint', f.hint));
    if (known && factValue(f.k) === undefined) {
      q.appendChild(el('p', 'q-known', 'Already recorded as ' + Store.say(f.k, known.v) + ' (' + Store.ago(known.seen) + '). Answer only if it has changed.'));
    }
    if (f.type === 'choice') {
      const chips = el('div', 'chips');
      const cur = factValue(f.k);
      for (const o of f.opts) {
        const c = el('button', 'chip' + (String(cur) === String(o.v) ? ' is-on' : ''), o.label);
        c.setAttribute('aria-pressed', String(cur) === String(o.v) ? 'true' : 'false');
        c.addEventListener('click', () => setFact(f.k, String(cur) === String(o.v) ? undefined : o.v));
        chips.appendChild(c);
      }
      q.appendChild(chips);
    } else {
      const cur = factValue(f.k);
      const chips = el('div', 'chips');
      for (const v of (f.chips || [])) {
        const c = el('button', 'chip' + (Number(cur) === v ? ' is-on' : ''), v + ' ' + f.unit);
        c.setAttribute('aria-pressed', Number(cur) === v ? 'true' : 'false');
        c.addEventListener('click', () => setFact(f.k, Number(cur) === v ? undefined : v));
        chips.appendChild(c);
      }
      q.appendChild(chips);
      if (cur !== undefined) {
        const st = el('div', 'stepper');
        st.style.marginTop = '10px';
        const minus = el('button');
        minus.appendChild(Icons.icon('minus', 20, 2.4));
        minus.setAttribute('aria-label', 'One ' + f.unit + ' less');
        const val = el('div', 'val');
        const num = el('span', null, String(cur));
        val.appendChild(num);
        val.appendChild(el('small', null, f.unit));
        const plus = el('button');
        plus.appendChild(Icons.icon('plus', 20, 2.4));
        plus.setAttribute('aria-label', 'One ' + f.unit + ' more');
        // A number is the one answer that never changes which questions follow it, so it is
        // written straight into the record and straight onto the screen. No rebuild, no jump.
        const nudge = d => {
          const now = Number(survey.facts[f.k]);
          const next = Math.min(f.max, Math.max(f.min, now + d));
          if (next === now) return;
          survey.facts[f.k] = next;
          num.textContent = String(next);
          for (const c of q.querySelectorAll('.chip')) {
            const on = parseFloat(c.textContent) === next;
            c.classList.toggle('is-on', on);
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
          }
          N.buzz(6, 100);
        };
        minus.addEventListener('click', () => nudge(-1));
        plus.addEventListener('click', () => nudge(1));
        st.appendChild(minus); st.appendChild(val); st.appendChild(plus);
        q.appendChild(st);
      }
    }
    return q;
  }

  function renderReviewStep(body) {
    const keys = Object.keys(survey.facts);
    const secs = Math.round((Date.now() - survey.started) / 1000);
    body.appendChild(el('h2', 'step-h', keys.length ? 'That is ' + keys.length + (keys.length === 1 ? ' fact' : ' facts') + '.' : 'Nothing answered yet.'));
    body.appendChild(el('p', 'step-lead', keys.length
      ? 'It took ' + secs + ' seconds. Partial is fine: it composes with whatever anyone else recorded.'
      : 'Go back and answer whatever you did see. Even one answer is worth keeping.'));

    if (survey.photos.length) {
      const strip = el('div', 'photo-strip');
      strip.style.padding = '10px 0';
      for (const ph of survey.photos) {
        const img = el('img');
        img.alt = 'Photograph you took, ' + ((Store.PHOTO_ROLES.find(r => r.v === ph.role) || {}).label || '');
        strip.appendChild(img);
        Photos.url(ph.media).then(u => { if (u) img.src = u; });
      }
      body.appendChild(strip);
    }

    for (const g of Store.GROUPS) {
      const rows = Store.FACTS.filter(f => f.g === g.g && survey.facts[f.k] !== undefined);
      if (!rows.length) continue;
      const card = el('div', 'card');
      card.appendChild(el('h3', null, g.title));
      for (const f of rows) {
        const r = el('div', 'review-row');
        r.appendChild(el('span', null, f.label));
        r.appendChild(el('b', null, Store.say(f.k, survey.facts[f.k])));
        card.appendChild(r);
      }
      body.appendChild(card);
    }

    if (survey.newPlace && !survey.newPlace.name.trim()) {
      body.appendChild(el('p', 'note', 'This place still needs a name. Go back to the first step.'));
    }
    body.appendChild(el('p', 'note', 'Saved on this phone. Nothing is uploaded, because Doorway has no way to reach a network.'));
  }

  function tickClock() {
    if (!survey || !$('surveyClock')) return;
    const secs = Math.round((Date.now() - survey.started) / 1000);
    $('surveyClock').textContent = secs < 600 ? secs + 's' : '';
  }

  function nameError() {
    const e = el('p', 'inline-err');
    e.id = 'npNameErr';
    e.appendChild(Icons.icon('bang', 16, 2.4));
    e.appendChild(el('span', null, 'A name is the one thing a place cannot do without. Anything you would recognise it by will do.'));
    return e;
  }

  function saveSurvey() {
    if (!survey) return;
    const keys = Object.keys(survey.facts);
    if (survey.newPlace && !survey.newPlace.name.trim()) {
      survey.nameError = true;
      survey.step = 0; renderStep(false);
      const i = $('npName'); if (i) { i.setAttribute('aria-invalid', 'true'); i.focus(); }
      return;
    }
    if (!keys.length && !survey.photos.length) {
      toast('Nothing to save yet.');
      return;
    }
    let pid = survey.placeId;
    if (!pid) {
      const np = survey.newPlace;
      const p = Store.addPlace(np);
      pid = p.id;
    }
    Store.addSurvey({
      placeId: pid, facts: survey.facts, photos: survey.photos, slot: survey.slot,
      seconds: Math.round((Date.now() - survey.started) / 1000)
    });
    N.pattern([18, 70, 28], 180);
    const n = keys.length;
    survey = null;
    closeSheet('sh-survey');
    render(view);
    openPlace(pid);
    toast(n + (n === 1 ? ' fact' : ' facts') + ' saved. That is one less ambush for somebody.');
  }

  function nextStep() {
    // The save closes the sheet and drops the survey. A second tap landing after that used to
    // reach in for a step that no longer existed and take the whole page down with it.
    if (!survey) return;
    if (currentStep() === 'review') { saveSurvey(); return; }
    if (currentStep() === 'place' && !survey.newPlace.name.trim()) {
      survey.nameError = true;
      renderStep(false);
      const i = $('npName'); if (i) { i.setAttribute('aria-invalid', 'true'); i.focus(); }
      return;
    }
    survey.nameError = false;
    survey.step = Math.min(survey.steps.length - 1, survey.step + 1);
    renderStep(false);
  }
  function prevStep() {
    if (!survey) return;
    survey.step = Math.max(0, survey.step - 1);
    renderStep(false);
  }

  function abandonSurvey() {
    if (!survey) { closeSheet('sh-survey'); return; }
    const any = Object.keys(survey.facts).length || survey.photos.length ||
      (survey.newPlace && survey.newPlace.name.trim());
    if (!any) { survey = null; closeSheet('sh-survey'); return; }
    ask('Leave this survey?', 'What you have answered so far will not be kept.', 'Leave', ok => {
      if (!ok) return;
      Photos.del(survey.photos.map(p => p.media));
      survey = null;
      closeSheet('sh-survey');
    });
  }

  /* ══ camera ══ */
  function openCamera(role) {
    cam = { role, facing: 'environment', canvas: null, stream: null, brushing: false };
    const title = (Store.PHOTO_ROLES.find(r => r.v === role) || {}).label || 'Photograph';
    $('camTitle').textContent = title;
    $('camHint').textContent = role === 'entrance'
      ? 'Stand back far enough to show the whole doorway and the ground in front of it.'
      : role === 'bathroom'
        ? 'Show the whole cubicle if you can, door open, bars in shot.'
        : 'Show the route through the room, not the people in it.';
    $('camFootShoot').hidden = false;
    $('camFootReview').hidden = true;
    $('camShot').hidden = true;
    $('camVideo').hidden = false;
    $('camGuide').hidden = false;
    openSheet('sh-camera');
    startCam();
  }

  function showCamOff(msg) {
    const box = $('camOff');
    box.hidden = false;
    if (!box.querySelector('svg')) box.insertBefore(Icons.icon('camera', 40, 1.8), box.firstChild);
    $('camOffMsg').textContent = msg;
    $('camVideo').style.visibility = 'hidden';
  }

  async function startCam() {
    stopCam();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCamOff('This device has no camera Doorway can open. You can still add a picture from the gallery.');
      return;
    }
    try {
      cam.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: cam.facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false
      });
      const v = $('camVideo');
      v.srcObject = cam.stream;
      v.style.visibility = 'visible';
      $('camOff').hidden = true;
      await v.play().catch(() => {});
    } catch (e) {
      showCamOff(e && e.name === 'NotAllowedError'
        ? 'Camera access was declined. You can add a picture from the gallery instead, or carry on without one.'
        : 'The camera could not be opened. You can add a picture from the gallery instead.');
    }
  }

  function stopCam() {
    if (cam && cam.stream) { for (const t of cam.stream.getTracks()) t.stop(); cam.stream = null; }
    const v = $('camVideo');
    if (v) v.srcObject = null;
  }

  function toReview(canvas) {
    cam.canvas = canvas;
    const shot = $('camShot');
    shot.width = canvas.width; shot.height = canvas.height;
    shot.getContext('2d').drawImage(canvas, 0, 0);
    shot.hidden = false;
    $('camVideo').hidden = true;
    $('camGuide').hidden = true;
    $('camFootShoot').hidden = true;
    $('camFootReview').hidden = false;
    $('camHint').textContent = 'Blur anything you do not want to keep. It is painted out before the picture is stored.';
    stopCam();
  }

  function shoot() {
    const v = $('camVideo');
    if (!cam.stream || !v.videoWidth) { toast('The camera is not running.'); return; }
    N.buzz(14, 190);
    toReview(Photos.draft(v));
  }

  function paintBlur(ev) {
    if (!cam || !cam.brushing || !cam.canvas) return;
    const shot = $('camShot');
    const r = shot.getBoundingClientRect();
    if (!r.width) return;
    const x = (ev.clientX - r.left) / r.width * shot.width;
    const y = (ev.clientY - r.top) / r.height * shot.height;
    if (x < 0 || y < 0 || x > shot.width || y > shot.height) return;
    const radius = Math.max(18, shot.width * 0.055);
    Photos.blur(cam.canvas, x, y, radius);
    shot.getContext('2d').drawImage(cam.canvas, 0, 0);
  }

  async function keepPhoto() {
    if (!cam || !cam.canvas) return;
    const rec = await Photos.commit(cam.canvas, 0.72);
    if (survey) survey.photos.push({ media: rec.id, role: cam.role, at: Date.now() });
    N.buzz(12, 160);
    closeSheet('sh-camera');
    cam = null;
    renderStep();
    toast('Photograph kept with this survey.');
  }

  /* ══ lists ══ */
  function compactRow(p) {
    const c = Store.compose(p.id);
    const v = Lens.verdict(c, Store.lens());
    const b = el('button', 'prow');
    b.dataset.id = p.id;
    const top = el('div', 'prow-top');
    top.appendChild(el('span', 'prow-name', p.name));
    b.appendChild(top);
    const tags = el('div', 'prow-tags');
    if (v) tags.appendChild(verdictBadge(v));
    tags.appendChild(freshLabel(c));
    b.appendChild(tags);
    return b;
  }

  function renderLists() {
    const box = $('listIndex');
    clear(box);
    const ls = Store.lists();
    $('listsEmpty').hidden = ls.length > 0;
    if (!ls.length) {
      const art = $('listsEmptyArt');
      if (art && !art.firstChild) art.appendChild(Icons.terrace(240, 96));
    }
    for (const l of ls) {
      const card = el('div', 'card');
      const head = el('div', 'card-h');
      head.appendChild(el('h3', null, l.title));
      head.appendChild(el('span', 'fresh f-none', l.placeIds.length + (l.placeIds.length === 1 ? ' place' : ' places')));
      card.appendChild(head);
      const inner = el('div', 'stack');
      inner.style.marginTop = '10px';
      const places = l.placeIds.map(id => Store.place(id)).filter(Boolean);
      if (!places.length) inner.appendChild(el('p', 'note tight', 'Nothing on this list yet. Open a place and add it.'));
      for (const p of places) inner.appendChild(compactRow(p));
      card.appendChild(inner);
      const row = el('div', 'btnrow');
      const send = btn('btn small', 'Send this list', 'send');
      send.addEventListener('click', () => openShare(l.id));
      const ren = btn('btn small', 'Rename', 'edit');
      ren.addEventListener('click', () => renameList(l));
      const del = btn('btn small danger', 'Delete list', 'trash');
      del.addEventListener('click', () => {
        ask('Delete ' + l.title + '?', 'The places stay, only the list goes.', 'Delete', ok => {
          if (!ok) return;
          Store.removeList(l.id); renderLists(); toast('List deleted.');
        });
      });
      row.appendChild(send); row.appendChild(ren); row.appendChild(del);
      card.appendChild(row);
      box.appendChild(card);
    }
  }

  function renameList(l) {
    const card = el('div', 'card');
    card.appendChild(el('h3', null, 'Rename list'));
    const f = el('div', 'field');
    const lab = el('label', null, 'Title'); lab.setAttribute('for', 'renameInput');
    const i = el('input'); i.type = 'text'; i.id = 'renameInput'; i.value = l.title;
    f.appendChild(lab); f.appendChild(i);
    card.appendChild(f);
    const row = el('div', 'btnrow');
    const ok = el('button', 'btn small primary', 'Save');
    ok.addEventListener('click', () => { Store.renameList(l.id, i.value || l.title); renderLists(); });
    const no = el('button', 'btn small ghost', 'Cancel');
    no.addEventListener('click', renderLists);
    row.appendChild(ok); row.appendChild(no);
    card.appendChild(row);
    clear($('listIndex'));
    $('listIndex').appendChild(card);
    i.focus();
  }

  function newList() {
    const l = Store.addList('New list');
    renderLists();
    renameList(l);
  }

  function openListPicker(id) {
    const body = $('listPickBody');
    clear(body);
    const ls = Store.lists();
    if (!ls.length) body.appendChild(el('p', 'note tight', 'You have no lists yet. Make one and this place goes straight on it.'));
    for (const l of ls) {
      const on = Store.inList(l.id, id);
      const c = el('button', 'chip wide' + (on ? ' is-on' : ''), (on ? 'On: ' : 'Add to: ') + l.title);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
      c.addEventListener('click', () => {
        const added = Store.toggleInList(l.id, id);
        N.buzz(9, 130);
        toast(added ? 'Added to ' + l.title + '.' : 'Taken off ' + l.title + '.');
        openListPicker(id);
        renderPlace();
      });
      body.appendChild(c);
      body.appendChild(el('div', null, ' ')).style.height = '8px';
    }
    const row = el('div', 'btnrow');
    const nb = el('button', 'btn small', 'New list with this place');
    nb.addEventListener('click', () => newListHere(id));
    row.appendChild(nb);
    body.appendChild(row);
    openSheet('sh-lists');
  }

  /* Naming a new list used to happen on the Lists screen, underneath the place sheet that
     opened the picker, so the field nobody could see was the field being typed into.
     It happens here instead, in the sheet the tap came from. */
  function newListHere(id) {
    const body = $('listPickBody');
    clear(body);
    const card = el('div', 'card');
    card.appendChild(el('h3', null, 'A new list with this place on it'));
    const f = el('div', 'field');
    const lab = el('label', null, 'Title'); lab.setAttribute('for', 'newListTitle');
    const i = el('input'); i.type = 'text'; i.id = 'newListTitle'; i.maxLength = 60;
    i.placeholder = 'What you would plan by';
    f.appendChild(lab); f.appendChild(i);
    card.appendChild(f);
    const row = el('div', 'btnrow');
    const ok = el('button', 'btn small primary', 'Make the list');
    ok.addEventListener('click', () => {
      const l = Store.addList(i.value);
      Store.toggleInList(l.id, id);
      N.buzz(9, 130);
      openListPicker(id);
      renderPlace();
      toast('Added to ' + l.title + '.');
    });
    const no = el('button', 'btn small ghost', 'Cancel');
    no.addEventListener('click', () => openListPicker(id));
    row.appendChild(ok); row.appendChild(no);
    card.appendChild(row);
    body.appendChild(card);
    i.focus();
  }

  /* ══ check ══ */
  function renderCheck() {
    const box = $('checkBody');
    clear(box);
    const all = Store.places();
    if (!all.length) {
      const e = el('div', 'empty');
      const art = el('div', 'empty-art');
      art.appendChild(Icons.terrace(240, 96));
      e.appendChild(art);
      e.appendChild(el('p', 'empty-h', 'Nothing to check yet.'));
      e.appendChild(el('p', 'empty-p', 'Once you have surveyed a place, this is where Doorway tells you what has aged and what your lens still needs from it.'));
      box.appendChild(e);
      return;
    }

    const rows = all.map(p => ({ p, c: Store.compose(p.id) }));
    const aged = rows.filter(r => {
      const f = Store.freshness(r.c.lastAt);
      return f.k === 'aging' || f.k === 'stale' || f.k === 'none';
    }).sort((a, b) => (a.c.lastAt || 0) - (b.c.lastAt || 0));

    box.appendChild(el('p', 'h2', 'Worth a fresh look'));
    if (!aged.length) box.appendChild(el('p', 'note tight', 'Nothing has aged past three months. Come back later.'));
    for (const r of aged) {
      const card = el('div', 'card');
      const head = el('div', 'card-h');
      head.appendChild(el('h3', null, r.p.name));
      const f = Store.freshness(r.c.lastAt);
      head.appendChild(el('span', 'fresh f-' + f.k, f.k === 'none' ? 'never surveyed' : f.short));
      card.appendChild(head);
      card.appendChild(el('p', 'note tight', r.c.lastAt
        ? 'Last touched ' + Store.dateLabel(r.c.lastAt) + '. If it is the same as it was, one tap says so.'
        : 'This place has no survey at all yet.'));
      const row = el('div', 'btnrow');
      if (r.c.surveyCount) {
        const s = el('button', 'btn small', 'Still accurate');
        s.addEventListener('click', () => {
          const fresh = Store.confirm(r.p.id);
          N.pattern([14, 60, 22], 170);
          renderCheck();
          toast(fresh ? 'Dated today.' : 'Already dated today.');
        });
        row.appendChild(s);
      }
      const o = el('button', 'btn small primary', 'Open');
      o.addEventListener('click', () => openPlace(r.p.id));
      row.appendChild(o);
      card.appendChild(row);
      box.appendChild(card);
    }

    const lensOn = Lens.active().length > 0;
    box.appendChild(el('p', 'h2', 'What your lens still needs'));
    if (!lensOn) {
      box.appendChild(el('p', 'note tight', 'You are in everyone view, so nothing is missing. Build a lens in You and this fills with the questions that would settle your own decisions.'));
    } else {
      const gaps = rows.map(r => ({ r, g: Lens.gaps(r.c, Store.lens()) })).filter(x => x.g.length);
      if (!gaps.length) box.appendChild(el('p', 'note tight', 'Every place has the facts your lens reads. That is unusual and good.'));
      for (const x of gaps.slice(0, 12)) {
        const card = el('div', 'card');
        const h = el('div', 'card-h');
        const nm = el('h3', null, x.r.p.name);
        h.appendChild(nm);
        // The outline of a door nobody has filled in: the same mark, in its unknown state.
        const gapMark = el('span', 'mk-gap');
        gapMark.appendChild(doorMark('unknown', 30));
        h.appendChild(gapMark);
        card.appendChild(h);
        card.appendChild(el('p', 'note tight', 'Missing: ' +
          x.g.map(k => Store.FACT[k].label.toLowerCase()).join(', ') + '.'));
        const row = el('div', 'btnrow');
        const b = el('button', 'btn small', 'Add these');
        b.addEventListener('click', () => {
          const g = Store.FACT[x.g[0]].g;
          openPlace(x.r.p.id);
          startSurvey(x.r.p.id, g);
        });
        row.appendChild(b);
        card.appendChild(row);
        box.appendChild(card);
      }
    }

    const st = Store.stats();
    box.appendChild(el('p', 'h2', 'Your record'));
    const grid = el('div', 'stat-grid');
    const stat = (n, label) => {
      const s = el('div', 'stat');
      s.appendChild(el('b', null, String(n)));
      s.appendChild(el('span', null, label));
      return s;
    };
    grid.appendChild(stat(st.surveys, st.surveys === 1 ? 'survey' : 'surveys'));
    grid.appendChild(stat(st.confirms, 'still accurate taps'));
    grid.appendChild(stat(st.places, st.places === 1 ? 'place' : 'places'));
    box.appendChild(grid);
    if (st.median) box.appendChild(el('p', 'note', 'Your median survey takes ' + st.median + ' seconds.'));
    if (st.imported) box.appendChild(el('p', 'note tight', st.imported + (st.imported === 1 ? ' survey came' : ' surveys came') + ' from packs somebody sent you.'));
  }

  /* ══ you ══ */
  function renderYou() {
    const box = $('youBody');
    clear(box);
    const s = Store.settings();
    const mods = Lens.active();
    $('youSub').textContent = mods.length
      ? 'Reading every place through ' + mods.map(m => Lens.MOD[m.type].name.toLowerCase()).join(' and ') + '.'
      : 'Everyone view. No verdicts, just the facts.';

    box.appendChild(el('p', 'h2', 'Your lens'));
    const lensCard = el('div', 'card');
    if (mods.length) {
      for (const m of mods) {
        const def = Lens.MOD[m.type];
        const params = Object.assign(Lens.defaults(m.type), m.params || {});
        const r = el('div', 'srow');
        const l = el('div', 'srow-l');
        l.appendChild(el('b', null, def.name));
        l.appendChild(el('span', null, def.params.map(p => {
          const o = p.opts.find(o => String(o.v) === String(params[p.k]));
          return p.label + ': ' + (o ? o.label : 'not set');
        }).join('. ') + '.'));
        r.appendChild(l);
        lensCard.appendChild(r);
      }
    } else {
      lensCard.appendChild(el('p', 'note tight', 'No modules chosen. Places show their facts without a verdict.'));
    }
    const lrow = el('div', 'btnrow');
    const eb = el('button', 'btn small primary', mods.length ? 'Edit your lens' : 'Build a lens');
    eb.addEventListener('click', openLensEditor);
    lrow.appendChild(eb);
    lensCard.appendChild(lrow);
    const ev = el('div', 'srow');
    const evl = el('div', 'srow-l');
    evl.appendChild(el('b', null, 'Everyone view'));
    evl.appendChild(el('span', null, 'Turn the verdicts off and read the raw facts. Useful when you are looking on behalf of somebody else.'));
    const evb = el('button', 'toggle');
    evb.setAttribute('aria-pressed', Store.lens().everyone ? 'true' : 'false');
    evb.setAttribute('aria-label', 'Everyone view');
    evb.addEventListener('click', () => {
      Store.setLens({ everyone: !Store.lens().everyone });
      N.buzz(9, 130); renderYou();
    });
    ev.appendChild(evl); ev.appendChild(evb);
    lensCard.appendChild(ev);
    box.appendChild(lensCard);

    box.appendChild(el('p', 'h2', 'Reading'));
    const rc = el('div', 'card');
    const tr = el('div', 'srow');
    const trl = el('div', 'srow-l');
    trl.appendChild(el('b', null, 'Text size'));
    trl.appendChild(el('span', null, 'Everything scales, including the labels on the drawings.'));
    tr.appendChild(trl);
    rc.appendChild(tr);
    const chips = el('div', 'chips');
    for (const opt of [{ v: 1, label: 'Standard' }, { v: 1.15, label: 'Larger' }, { v: 1.3, label: 'Largest' }]) {
      const c = el('button', 'chip' + (Math.abs(s.textScale - opt.v) < 0.01 ? ' is-on' : ''), opt.label);
      c.setAttribute('aria-pressed', Math.abs(s.textScale - opt.v) < 0.01 ? 'true' : 'false');
      c.addEventListener('click', () => { Store.set('textScale', opt.v); applyScale(); renderYou(); });
      chips.appendChild(c);
    }
    rc.appendChild(chips);
    const hr = el('div', 'srow');
    const hrl = el('div', 'srow-l');
    hrl.appendChild(el('b', null, 'Haptics'));
    hrl.appendChild(el('span', null, 'A short tap when an answer lands or a place is confirmed.'));
    const hb = el('button', 'toggle');
    hb.setAttribute('aria-pressed', s.haptics ? 'true' : 'false');
    hb.setAttribute('aria-label', 'Haptics');
    hb.addEventListener('click', () => { Store.set('haptics', !Store.settings().haptics); N.buzz(12, 150); renderYou(); });
    hr.appendChild(hrl); hr.appendChild(hb);
    rc.appendChild(hr);
    box.appendChild(rc);

    box.appendChild(el('p', 'h2', 'Pooling what you know'));
    const sc = el('div', 'card');
    sc.appendChild(el('p', 'note tight', 'Doorway has no server and no account, so places travel as a file. Send one to a friend, open theirs, and the two sets of surveys compose into one.'));
    const nf = el('div', 'field');
    const nl = el('label', null, 'Name to sign your packs with'); nl.setAttribute('for', 'youName');
    const ni = el('input'); ni.type = 'text'; ni.id = 'youName'; ni.value = s.name || '';
    ni.placeholder = 'Optional, for example: the Tuesday group';
    ni.addEventListener('change', () => Store.set('name', ni.value.trim().slice(0, 40)));
    nf.appendChild(nl); nf.appendChild(ni);
    sc.appendChild(nf);
    const srow = el('div', 'btnrow');
    const sb = btn('btn small primary', 'Send a pack', 'send');
    sb.addEventListener('click', () => openShare(null));
    const ib = btn('btn small', 'Add a pack', 'receive');
    ib.addEventListener('click', openImport);
    srow.appendChild(sb); srow.appendChild(ib);
    sc.appendChild(srow);
    box.appendChild(sc);

    box.appendChild(el('p', 'h2', 'Data on this phone'));
    const dc = el('div', 'card');
    const usage = el('p', 'note tight', 'Counting what is stored.');
    dc.appendChild(usage);
    Photos.usage().then(u => {
      usage.textContent = Store.places().length + ' places, ' + Store.db().surveys.length + ' surveys, ' +
        u.count + (u.count === 1 ? ' photograph' : ' photographs') +
        (u.bytes ? ' taking about ' + Math.max(1, Math.round(u.bytes / 1048576 * 10) / 10) + ' MB' : '') + '.';
    });
    const sr = el('div', 'srow');
    const srl = el('div', 'srow-l');
    srl.appendChild(el('b', null, 'Sample high street'));
    srl.appendChild(el('span', null, 'Eight invented places, clearly labelled, so the app can be understood before you survey anything. Nothing in it is a real business.'));
    const stg = el('button', 'toggle');
    const has = Sample.installed();
    stg.setAttribute('aria-pressed', has ? 'true' : 'false');
    stg.setAttribute('aria-label', 'Sample high street');
    stg.addEventListener('click', () => {
      if (Sample.installed()) {
        ask('Remove the sample?', 'The eight invented places and their surveys go. Anything you surveyed yourself stays.', 'Remove', ok => {
          if (!ok) return;
          Sample.remove(); renderYou(); toast('Sample removed.');
        });
      } else if (Sample.install()) { renderYou(); toast('Sample high street added.'); }
      else { renderYou(); toast('Those places are already on this phone, from a pack or a restored backup.'); }
    });
    sr.appendChild(srl); sr.appendChild(stg);
    dc.appendChild(sr);
    const drow = el('div', 'btnrow');
    const eb2 = btn('btn small', 'Export everything', 'send');
    eb2.addEventListener('click', () => openShare(null, true));
    const wipe = btn('btn small danger', 'Delete everything', 'trash');
    wipe.addEventListener('click', () => {
      ask('Delete everything?', 'Every place, survey, photograph and list on this phone. There is no copy anywhere else, so export first if you want one.', 'Delete it all', ok => {
        if (!ok) return;
        Photos.clear();
        Geo.clear();
        Store.wipe();
        applyScale();
        toast('Everything deleted.');
        show('places');
      });
    });
    drow.appendChild(eb2); drow.appendChild(wipe);
    dc.appendChild(drow);
    box.appendChild(dc);

    box.appendChild(el('p', 'h2', 'What Doorway is not'));
    const ac = el('div', 'card');
    const limits = [
      ['There is no map.', 'Map tiles need a network, and Doorway has none. Places are a list, sorted by how far away they are when you let it read your position.'],
      ['There is no crowd.', 'Nothing you record is uploaded, because the app cannot reach a network at all. Pooling happens when you send somebody a pack and they open it.'],
      ['Noise is a judgement, not a measurement.', 'Doorway never opens the microphone. Loudness is what a person thought at the time, kept against the time of day.'],
      ['Faces are not detected for you.', 'Automatic blurring needs a model this app does not carry. You get a blur brush instead, and it paints the pixels out before the picture is stored.'],
      ['Facts are evidence, not a promise.', 'Every answer carries who recorded it and when. Places change. That is why the dates are everywhere and why one tap can re-date them.']
    ];
    for (const [h, b] of limits) {
      const r = el('div', 'srow');
      const l = el('div', 'srow-l');
      l.appendChild(el('b', null, h));
      l.appendChild(el('span', null, b));
      r.appendChild(l);
      ac.appendChild(r);
    }
    box.appendChild(ac);
    box.appendChild(el('p', 'note', 'Doorway by SocialSure. No account, no ads, no analytics, no internet permission.'));
  }

  function applyScale() {
    document.documentElement.style.setProperty('--fs', String(Store.settings().textScale || 1));
  }

  /* ══ the lens editor ══ */
  function setModule(type, on) {
    const lens = Store.lens();
    const mods = (lens.modules || []).slice();
    const i = mods.findIndex(m => m.type === type);
    if (on && i < 0) mods.push({ type, params: Lens.defaults(type) });
    if (!on && i >= 0) mods.splice(i, 1);
    Store.setLens({ modules: mods, everyone: false });
  }
  function setParam(type, k, v) {
    const lens = Store.lens();
    const mods = (lens.modules || []).slice();
    const m = mods.find(m => m.type === type);
    if (!m) return;
    m.params = Object.assign(Lens.defaults(type), m.params || {});
    m.params[k] = v;
    Store.setLens({ modules: mods });
  }

  function renderLensModules(container) {
    clear(container);
    const lens = Store.lens();
    for (const def of Lens.MODULES) {
      const cur = (lens.modules || []).find(m => m.type === def.type);
      const card = el('div', 'mod-card' + (cur ? ' on' : ''));
      const head = el('div', 'mod-head');
      const l = el('div', 'srow-l');
      l.appendChild(el('b', null, def.name));
      l.appendChild(el('span', null, def.blurb));
      const t = el('button', 'toggle');
      t.setAttribute('aria-pressed', cur ? 'true' : 'false');
      t.setAttribute('aria-label', def.name);
      t.addEventListener('click', () => {
        setModule(def.type, !cur);
        N.buzz(10, 140);
        renderLensModules(container);
      });
      head.appendChild(l); head.appendChild(t);
      card.appendChild(head);
      if (cur) {
        const params = Object.assign(Lens.defaults(def.type), cur.params || {});
        const box = el('div', 'mod-params');
        for (const p of def.params) {
          const pw = el('div', 'mod-param');
          pw.appendChild(el('p', 'flabel', p.label));
          const chips = el('div', 'chips');
          for (const o of p.opts) {
            const on = String(params[p.k]) === String(o.v);
            const c = el('button', 'chip' + (on ? ' is-on' : ''), o.label);
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
            c.addEventListener('click', () => {
              setParam(def.type, p.k, o.v);
              N.buzz(7, 110);
              renderLensModules(container);
            });
            chips.appendChild(c);
          }
          pw.appendChild(chips);
          box.appendChild(pw);
        }
        card.appendChild(box);
      }
      container.appendChild(card);
    }
    const note = el('p', 'note', 'Nothing here leaves the phone. Needs are health adjacent, so Doorway keeps them local by design rather than by promise.');
    container.appendChild(note);
  }

  function openLensEditor() {
    openSheet('sh-lens');
    renderLensModules($('lensBody'));
  }

  /* ══ packs ══ */
  let shareState = { listId: null, photos: false };

  function openShare(listId, everything) {
    shareState = { listId: listId || null, photos: false };
    openSheet('sh-share');
    renderShare(everything);
  }

  function renderShare(everything) {
    const body = $('shareBody');
    clear(body);
    const list = shareState.listId ? Store.lists().find(l => l.id === shareState.listId) : null;
    const ids = list ? list.placeIds.slice() : Store.places().map(p => p.id);
    body.appendChild(el('p', 'note tight', list
      ? 'Sending the list "' + list.title + '": ' + ids.length + (ids.length === 1 ? ' place' : ' places') + ' with every survey behind them.'
      : (everything ? 'A copy of everything on this phone: ' : 'Sending everything you have: ') + ids.length +
        (ids.length === 1 ? ' place' : ' places') + ', ' + Store.db().surveys.length + ' surveys' +
        (Store.lists().length ? ' and ' + Store.lists().length + (Store.lists().length === 1 ? ' list.' : ' lists.') : '.')));

    const r = el('div', 'srow');
    const rl = el('div', 'srow-l');
    rl.appendChild(el('b', null, 'Include photographs'));
    rl.appendChild(el('span', null, 'Photographs are the trustworthy part and also the heavy part. Leave them out for a small file that still carries every fact.'));
    const t = el('button', 'toggle');
    t.setAttribute('aria-pressed', shareState.photos ? 'true' : 'false');
    t.setAttribute('aria-label', 'Include photographs');
    t.addEventListener('click', () => { shareState.photos = !shareState.photos; renderShare(everything); });
    r.appendChild(rl); r.appendChild(t);
    body.appendChild(r);

    const size = el('p', 'note tight', 'Working out the size.');
    body.appendChild(size);
    Share.buildPack({ placeIds: ids, listId: shareState.listId, photos: shareState.photos })
      .then(res => {
        const kb = res.bytes / 1024;
        size.textContent = 'The file will be about ' + (kb > 900 ? (kb / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(kb)) + ' KB') + '.';
      });

    const row = el('div', 'btnrow');
    const b = el('button', 'btn primary', 'Save the file');
    b.addEventListener('click', async () => {
      b.disabled = true;
      const res = await Share.buildPack({ placeIds: ids, listId: shareState.listId, photos: shareState.photos });
      const out = await Share.deliver(res.json, list ? list.title : 'atlas');
      b.disabled = false;
      if (!out.ok) { toast('The file could not be written.'); return; }
      closeSheet('sh-share');
      toast(out.native ? 'Saved to Downloads as ' + out.name + ', and offered to your share sheet.'
                       : 'Downloaded as ' + out.name + '.');
    });
    row.appendChild(b);
    body.appendChild(row);
    body.appendChild(el('p', 'note', 'A pack is plain JSON. Anyone can read it, and nothing in it identifies you beyond the name you chose to sign with.'));
  }

  function openImport() {
    openSheet('sh-import');
    const body = $('importBody');
    clear(body);
    body.appendChild(el('p', 'note tight', 'Open a pack somebody sent you. Places you already have keep their own surveys, and the new ones compose alongside them.'));

    const lab = el('label', 'btn primary filelabel wide');
    lab.appendChild(document.createTextNode('Choose a pack file'));
    const inp = el('input', 'vh');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const text = await Share.readFile(f);
        await absorb(text);
      } catch (e) { toast(e.message); }
    });
    lab.appendChild(inp);
    body.appendChild(lab);

    const f = el('div', 'field');
    const fl = el('label', null, 'Or paste the contents of a pack');
    fl.setAttribute('for', 'importText');
    const ta = el('textarea'); ta.id = 'importText'; ta.placeholder = 'Paste here';
    f.appendChild(fl); f.appendChild(ta);
    body.appendChild(f);
    const row = el('div', 'btnrow');
    const b = el('button', 'btn', 'Add what is pasted');
    b.addEventListener('click', async () => {
      if (!ta.value.trim()) { toast('Nothing pasted yet.'); return; }
      try { await absorb(ta.value); } catch (e) { toast(e.message); }
    });
    row.appendChild(b);
    body.appendChild(row);
  }

  async function absorb(text) {
    let res;
    try { res = await Share.ingest(text); }
    catch (e) { toast(e.message); return; }
    closeSheet('sh-import');
    render(view);
    const bits = [];
    if (res.places) bits.push(res.places + (res.places === 1 ? ' new place' : ' new places'));
    if (res.surveys) bits.push(res.surveys + (res.surveys === 1 ? ' survey' : ' surveys'));
    if (res.confirms) bits.push(res.confirms + ' confirmations');
    if (res.lists) bits.push(res.lists + (res.lists === 1 ? ' list' : ' lists'));
    toast(bits.length ? 'Added ' + bits.join(', ') + '.' : 'Nothing new in that pack: you already had all of it.');
  }

  /* ══ onboarding ══ */
  let obIndex = 0;
  function renderOnboard() {
    const mk = $('obMark');
    if (mk && !mk.firstChild) mk.appendChild(Icons.scene(300, 188, { animate: true }));
    const cards = $('obTrack').children;
    for (let i = 0; i < cards.length; i++) cards[i].hidden = (i !== obIndex);
    const dots = $('obDots');
    clear(dots);
    for (let i = 0; i < cards.length; i++) dots.appendChild(el('i', i === obIndex ? 'on' : ''));
    const shown = cards[obIndex];
    if (shown) { shown.classList.remove('rise'); void shown.offsetWidth; shown.classList.add('rise'); }
    $('obNext').textContent = obIndex === cards.length - 1 ? 'Set up your lens' : 'Next';
  }

  function finishOnboarding() {
    Store.set('onboarded', true);
    $('lensSetup').hidden = true;
    $('onboard').hidden = true;
    show('places');
  }

  /* ══ wiring ══ */
  function wire() {
    paintIcons();
    for (const t of document.querySelectorAll('.tab')) {
      t.insertBefore(Icons.icon(t.dataset.icon, 24, 2), t.firstChild);
      t.addEventListener('click', () => { N.buzz(7, 110); show(t.dataset.view); });
    }
    // The mark sits on the first screen, the same opening the launcher icon shows.
    const h = document.querySelector('#v-places .tb-title h1');
    if (h) h.insertBefore(Icons.threshold(30, 'open', { ink: 'var(--ink)', light: 'var(--light)', gradient: true }), h.firstChild);
    const srch = $('srchBox');
    if (srch) srch.insertBefore(Icons.icon('search', 22, 2.2), srch.firstChild);
    for (const [id, name] of [['surveyNewBtn', 'add'], ['surveyNewBtn2', 'add'], ['stillBtn', 'tick'],
                              ['addDetailBtn', 'add'], ['newListBtn', 'add'], ['newListBtn2', 'add']]) {
      const b = $(id);
      if (!b) continue;
      const lbl = el('span', 'lbl', b.textContent.trim());
      clear(b);
      b.appendChild(Icons.icon(name, 18, 2.2));
      b.appendChild(lbl);
    }
    for (const b of document.querySelectorAll('[data-close]')) {
      b.addEventListener('click', () => {
        const sheet = b.closest('.sheet');
        if (!sheet) return;
        if (sheet.id === 'sh-survey') abandonSurvey();
        else closeSheet(sheet.id);
      });
    }

    $('placeList').addEventListener('click', e => {
      const row = e.target.closest('.prow');
      if (row) openPlace(row.dataset.id);
    });
    $('listIndex').addEventListener('click', e => {
      const row = e.target.closest('.prow');
      if (row) openPlace(row.dataset.id);
    });

    on('placeSearch', 'input', e => { searchTerm = e.target.value; renderPlaces(); });
    on('geoBtn', 'click', locate);
    on('surveyNewBtn', 'click', () => startSurvey(null, null));
    on('surveyNewBtn2', 'click', () => startSurvey(null, null));
    on('sampleBtn', 'click', () => {
      const added = Sample.install();
      renderPlaces();
      const sc = document.querySelector('#v-places .scroller');
      if (sc) sc.scrollTop = 0;
      toast(added ? 'Eight invented places added, all labelled as a sample.'
                  : 'Those places are already on this phone.');
    });
    on('newListBtn', 'click', newList);
    on('newListBtn2', 'click', newList);

    on('placeMoreBtn', 'click', () => {
      const a = $('placeActions');
      if (a) { a.scrollIntoView({ block: 'center' }); const b = a.querySelector('button'); if (b) b.focus(); }
    });
    on('stillBtn', 'click', stillAccurate);
    on('addDetailBtn', 'click', () => { if (placeId) startSurvey(placeId, null); });

    on('surveyNext', 'click', nextStep);
    on('surveyBack', 'click', prevStep);
    on('surveySkip', 'click', () => {
      if (!survey) return;
      survey.step = Math.min(survey.steps.length - 1, survey.step + 1);
      renderStep(false);
    });

    on('camShoot', 'click', shoot);
    on('camRetake', 'click', () => {
      cam.canvas = null;
      $('camShot').hidden = true;
      $('camVideo').hidden = false;
      $('camGuide').hidden = false;
      $('camFootShoot').hidden = false;
      $('camFootReview').hidden = true;
      $('camBlur').setAttribute('aria-pressed', 'false');
      cam.brushing = false;
      $('camStage').classList.remove('brushing');
      startCam();
    });
    on('camKeep', 'click', keepPhoto);
    on('camFlip', 'click', () => {
      if (!cam) return;
      cam.facing = cam.facing === 'environment' ? 'user' : 'environment';
      startCam();
    });
    on('camBlur', 'click', () => {
      if (!cam) return;
      cam.brushing = !cam.brushing;
      $('camBlur').setAttribute('aria-pressed', cam.brushing ? 'true' : 'false');
      $('camStage').classList.toggle('brushing', cam.brushing);
      if (cam.brushing) toast('Drag over anything you want painted out.');
    });
    on('camFile', 'change', async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try { toReview(await Photos.fromFile(f)); }
      catch (err) { toast(err.message); }
      e.target.value = '';
    });
    const stage = $('camStage');
    stage.addEventListener('pointerdown', e => {
      if (!cam || !cam.brushing) return;
      stage.setPointerCapture(e.pointerId);
      paintBlur(e);
    });
    stage.addEventListener('pointermove', e => { if (e.buttons) paintBlur(e); });

    on('obNext', 'click', () => {
      const n = $('obTrack').children.length;
      if (obIndex < n - 1) { obIndex++; N.buzz(8, 120); renderOnboard(); return; }
      $('onboard').hidden = true;
      $('lensSetup').hidden = false;
      renderLensModules($('lensModules'));
    });
    on('lensSkip', 'click', () => { Store.setLens({ modules: [], everyone: true }); finishOnboarding(); });
    on('lensDone', 'click', () => {
      if (!Lens.active().length) Store.setLens({ everyone: true });
      finishOnboarding();
    });
    on('lensSave', 'click', () => {
      closeSheet('sh-lens');
      renderYou();
      render(view);
      toast('Lens updated. Every place is read against it now.');
    });

    on('confirmYes', 'click', () => closeConfirm(true));
    on('confirmNo', 'click', () => closeConfirm(false));
    $('confirm').addEventListener('click', e => { if (e.target.id === 'confirm') closeConfirm(false); });

    window.addEventListener('storage-full', () => {
      toast('This phone will not take any more. Export a pack, then delete what you no longer need.');
    });
    setInterval(tickClock, 1000);
  }

  /* ══ lifecycle ══ */
  function back() {
    if (!$('confirm').hidden) { closeConfirm(false); return true; }
    const top = topSheet();
    if (top === 'sh-camera') { closeSheet('sh-camera'); cam = null; return true; }
    if (top === 'sh-survey') { abandonSurvey(); return true; }
    if (top) { closeSheet(top); return true; }
    if (!$('lensSetup').hidden) { $('lensSetup').hidden = true; $('onboard').hidden = false; renderOnboard(); return true; }
    if (!$('onboard').hidden) return false;
    if (view !== 'places') { show('places'); return true; }
    return false;
  }
  function onPause() { stopCam(); }
  function onResume() {
    if (view) render(view);
    // The shell pauses us for a call or a switch to another app, and stopCam() drops the
    // stream. Coming back to a black rectangle and a shutter that answers "the camera is not
    // running" is not an answer, so the preview is picked up again where it was left.
    if (cam && !cam.canvas && sheetStack.includes('sh-camera')) startCam();
  }

  function start() {
    applyScale();
    wire();
    if (!Store.settings().onboarded) {
      $('onboard').hidden = false;
      $('tabs').hidden = true;
      renderOnboard();
    } else {
      show('places');
      // A position is asked for when it is asked for. Refresh quietly for somebody who has
      // already given one; otherwise the link on the list is what opens the system dialog,
      // rather than having it appear before the app has been touched.
      if (Store.settings().sort === 'distance' && Store.places().length && Geo.last()) locate();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  return { back, onPause, onResume, show, toast, openPlace, startSurvey, renderPlaces,
           _store: () => Store, _lens: () => Lens };
})();

window.App = App;
