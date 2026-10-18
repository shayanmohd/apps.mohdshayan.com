/* Pigment. Screens, drawers and the wiring between the paint and the interface. */

const App = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));

  let mode = 'library';               // library | picker | studio | well | intro
  let view = 'flatfile';
  let openSheets = [];
  let current = null;                 // the painting record being worked on
  let lesson = null;                  // { l, i, n, waterAt, finished }
  let saveTimer = 0;
  let lapseSpeed = 'standard';
  let tiltBase = null, lastTiltSent = 0;

  const WATER_WORDS = [
    [0.12, 'Bone dry'], [0.28, 'Thirsty'], [0.46, 'Damp'],
    [0.66, 'Wet'], [0.89, 'Loaded'], [1.01, 'Flooded']
  ];
  const waterWord = v => (WATER_WORDS.find(w => v < w[0]) || WATER_WORDS[5])[1];

  /* The dock has room for a name, not for a catalogue entry. "Ultramarine Blue"
     becomes "Ultramarine"; a mix keeps whatever the painter called it. */
  function shortPigment(name) {
    return String(name || '')
      .replace(/ (Blue|Yellow Light|Yellow|Green|Rose|Scarlet|Maroon|Sienna|Umber|Red|Black|White|Teal|Pink|Orange)$/, '')
      .trim() || String(name || '');
  }
  /* Two brushes are named after millimetres of ferrule, which the dock cannot fit. */
  const BRUSH_SHORT = { flat: 'Flat 25', angle: 'Angled 12' };
  const shortBrush = b => BRUSH_SHORT[b.id] || b.name;

  /* ------------------------------------------------------------------ toast */
  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }

  /* Whatever is on the brush, painted rather than swatched: the dock chip, the
     drawer's saved mixes and the mixing well's readout all read through this. */
  function paintChip(cv, col, px) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(6, Math.round(px * dpr));
    cv.width = w; cv.height = w;
    cv.style.width = px + 'px'; cv.style.height = px + 'px';
    Data.chip(cv.getContext('2d'), col, w, w, (col.name || 'x').length * 7919 + 13);
  }

  function buzz(ms, amp) {
    if (!Store.settings().haptics) return;
    if (window.Native && Native.vibrate) { try { Native.vibrate(ms, amp || 60); } catch (e) {} }
  }

  /* ------------------------------------------------------------ navigation */
  function setChrome() {
    const lib = mode === 'library';
    $('#tabs').hidden = !lib;
    document.body.classList.toggle('has-tabs', lib);
  }

  function show(id) {
    ['#v-flatfile', '#v-lessons', '#v-pigments', '#s-picker', '#s-studio', '#s-well', '#s-intro']
      .forEach(s => { $(s).hidden = s !== id; });
  }

  function setView(v) {
    view = v; mode = 'library';
    show('#v-' + v);
    setChrome();
    $$('#tabs .tab').forEach(b => b.classList.toggle('is-on', b.dataset.view === v));
    if (v === 'flatfile') renderFlatfile();
    if (v === 'lessons') renderLessons();
    if (v === 'pigments') renderPigments();
    const sc = $('#' + 'v-' + v).querySelector('.scroller');
    if (sc) sc.scrollTop = 0;
  }

  function openSheet(id) {
    const el = $('#' + id);
    if (!el || !el.hidden) return;
    el.hidden = false;
    openSheets.push(id);
    document.body.classList.add('sheeting');
  }
  function closeSheet(id) {
    const which = id || openSheets[openSheets.length - 1];
    if (!which) return false;
    const el = $('#' + which);
    if (el) el.hidden = true;
    openSheets = openSheets.filter(s => s !== which);
    if (!openSheets.length) document.body.classList.remove('sheeting');
    return true;
  }
  function closeAllSheets() { while (openSheets.length) closeSheet(); }

  /* ------------------------------------------------------------- flatfile */
  let markPainted = false;
  function renderFlatfile() {
    const list = Store.paintings();
    const grid = $('#sheetGrid');
    grid.innerHTML = '';
    const empty = $('#flatEmpty');
    empty.hidden = list.length > 0;
    if (!markPainted) { markPainted = true; Bloom.paint($('#flatMark'), { w: 44, h: 44, res: 76, seed: 20259 }); }
    if (!empty.hidden && !empty.dataset.painted) {
      empty.dataset.painted = '1';
      Bloom.grow($('#emptyBloom'), { w: 158, h: 208, res: 128, seed: 4477, ms: 900 });
    }
    const done = Store.lessonsDone();
    $('#flatSub').textContent = list.length
      ? list.length + (list.length === 1 ? ' sheet' : ' sheets') +
        (done ? ', ' + done + ' of 6 washes done' : '')
      : 'Paper, water and twenty four pigments';

    for (const p of list) {
      const paper = Data.PAPER_BY_ID[p.paper] || Data.PAPERS[0];
      const size = Data.SIZE_BY_ID[p.size] || Data.SIZES[1];
      const b = document.createElement('button');
      b.className = 'sheetcard';
      const pic = document.createElement('span');
      pic.className = 'pic';
      pic.style.aspectRatio = size.ratio + ' / 1';
      pic.style.background = paper.tone;
      if (p.thumb) {
        const im = document.createElement('img');
        // a thumbnail that will not decode is a blank sheet, not a broken picture
        im.addEventListener('error', () => { if (im.parentNode) im.parentNode.removeChild(im); });
        im.src = p.thumb; im.alt = p.name; pic.appendChild(im);
      }
      const t = document.createElement('b'); t.textContent = p.name;
      const s = document.createElement('i');
      // a sheet whose log was dropped to make room says so rather than claiming strokes
      s.textContent = paper.name + ', ' + Store.dayLabel(p.updated) +
        (p.trimmed ? ' - strokes dropped for space'
          : p.strokes ? ' - ' + p.strokes + (p.strokes === 1 ? ' stroke' : ' strokes') : '');
      b.append(pic, t, s);
      b.style.setProperty('--i', Math.min(11, grid.children.length));
      b.addEventListener('click', () => openPainting(p.id));
      grid.appendChild(b);
    }
  }

  /* -------------------------------------------------------------- lessons */
  function renderLessons() {
    const wrap = $('#lessonList');
    wrap.innerHTML = '';
    const done = Store.lessonsDone();
    $('#lessonSub').textContent = done ? done + ' of 6 finished' : 'Six exercises in water control';
    Data.LESSONS.forEach((l, i) => {
      const b = document.createElement('button');
      b.className = 'lesson';
      const n = document.createElement('span'); n.className = 'num'; n.textContent = (i + 1);
      const body = document.createElement('span');
      const t = document.createElement('b'); t.textContent = l.title;
      const s = document.createElement('i'); s.textContent = l.sub;
      body.append(t, s);
      if (Store.lessonDone(l.id)) {
        const d = document.createElement('span'); d.className = 'done'; d.textContent = 'Finished';
        body.appendChild(d);
      }
      b.append(n, body);
      b.style.setProperty('--i', i);
      b.addEventListener('click', () => startLesson(l));
      wrap.appendChild(b);
    });
  }

  /* ------------------------------------------------------------- the box */
  function propRow(label, v) {
    const row = document.createElement('div'); row.className = 'prop';
    const l = document.createElement('span'); l.textContent = label;
    const track = document.createElement('span'); track.className = 'track';
    const fill = document.createElement('span'); fill.className = 'fill';
    fill.style.width = Math.round(v * 100) + '%';
    track.appendChild(fill);
    row.append(l, track);
    return row;
  }

  function renderPigments() {
    const wrap = $('#pigList');
    if (wrap.dataset.built) return;
    wrap.dataset.built = '1';
    for (const fam of Data.FAMILIES) {
      const h = document.createElement('h2'); h.className = 'famhead'; h.textContent = fam.label;
      wrap.appendChild(h);
      for (const p of Data.PIGMENTS.filter(x => x.family === fam.id)) {
        const card = document.createElement('div'); card.className = 'pigcard';
        const cv = document.createElement('canvas'); cv.width = 54; cv.height = 74;
        Data.swatch(cv.getContext('2d'), p, 54, 74, p.index * 977 + 13);
        const body = document.createElement('div'); body.className = 'body';
        const n = document.createElement('b'); n.textContent = p.name;
        const c = document.createElement('span'); c.className = 'code'; c.textContent = p.code;
        const note = document.createElement('p'); note.className = 'note'; note.textContent = p.note;
        const props = document.createElement('div'); props.className = 'props';
        props.append(propRow('Granulation', p.gran), propRow('Staining', p.stain),
                     propRow('Opacity', p.opacity), propRow('Lifts back off', p.lift));
        body.append(n, c, note, props);
        card.append(cv, body);
        wrap.appendChild(card);
      }
    }
  }

  /* --------------------------------------------------------- paper picker */
  let pick = { paper: 'cold', size: 'sheet' };

  function paperPreview(cv, paper) {
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const rnd = Sim.rng(9001);
    const scale = Math.max(1.2, 4.4 - paper.grain * 3.2);
    const nw = Math.ceil(w / scale) + 2, nh = Math.ceil(h / scale) + 2;
    const g = new Float32Array(nw * nh);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const tone = parseInt(paper.tone.slice(1), 16);
    const tr = (tone >> 16) & 255, tg = (tone >> 8) & 255, tb = tone & 255;
    const amp = 26 + paper.tooth * 40;
    for (let y = 0; y < h; y++) {
      const fy = y / scale, y0 = fy | 0, ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = x / scale, x0 = fx | 0, tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const a = g[y0 * nw + x0], b = g[y0 * nw + x0 + 1];
        const c = g[(y0 + 1) * nw + x0], e = g[(y0 + 1) * nw + x0 + 1];
        const n = (a + (b - a) * sx) * (1 - sy) + (c + (e - c) * sx) * sy;
        const k = (n - 0.5) * amp;
        const o = (y * w + x) << 2;
        d[o] = tr + k; d[o + 1] = tg + k; d[o + 2] = tb + k * 0.9; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function renderPicker() {
    const list = $('#paperList');
    list.innerHTML = '';
    for (const p of Data.PAPERS) {
      const b = document.createElement('button');
      b.className = 'papercard' + (pick.paper === p.id ? ' is-on' : '');
      const cv = document.createElement('canvas'); cv.width = 124; cv.height = 124;
      paperPreview(cv, p);
      const body = document.createElement('span');
      const n = document.createElement('b'); n.textContent = p.name;
      const u = document.createElement('u'); u.textContent = p.weight;
      const i = document.createElement('i'); i.textContent = p.blurb;
      body.append(n, u, i);
      b.append(cv, body);
      b.addEventListener('click', () => { pick.paper = p.id; renderPicker(); buzz(8, 40); });
      list.appendChild(b);
    }
    const sizes = $('#sizeList');
    sizes.innerHTML = '';
    for (const s of Data.SIZES) {
      const c = document.createElement('button');
      c.className = 'chip' + (pick.size === s.id ? ' is-on' : '');
      const n = document.createElement('span'); n.textContent = s.name;
      const i = document.createElement('i'); i.textContent = s.blurb;
      c.append(n, i);
      c.addEventListener('click', () => { pick.size = s.id; renderPicker(); buzz(8, 40); });
      sizes.appendChild(c);
    }
    const p = Data.PAPER_BY_ID[pick.paper];
    $('#pickerNote').textContent = p.id === 'student'
      ? 'Student paper is the cheap sheet on purpose. It drinks a wash fast and it buckles, and both of those change how the next wash pools.'
      : p.id === 'hot'
        ? 'Hot press hides nothing. Every hard edge stays hard, which is why illustrators like it and beginners do not.'
        : 'Cold press is where most watercolour lives. The tooth catches a dry brush and collects granulating pigment in its valleys.';
  }

  function openPicker() {
    mode = 'picker'; show('#s-picker'); setChrome(); renderPicker();
    $('#pickGo').disabled = false;
  }

  /* ------------------------------------------------------------- the studio */
  function hostSize() {
    const wrap = $('#canvasWrap');
    const r = wrap.getBoundingClientRect();
    return { w: Math.max(120, r.width - 28), h: Math.max(120, r.height - 28) };
  }

  function openPainting(id, opts) {
    const rec = Store.find(id);
    if (!rec) { toast('That sheet is gone.'); return; }
    current = rec;
    Store.touch(id);
    mode = 'studio'; show('#s-studio'); setChrome();
    closeAllSheets();

    const paper = Data.PAPER_BY_ID[rec.paper] || Data.PAPERS[0];
    const size = Data.SIZE_BY_ID[rec.size] || Data.SIZES[1];
    $('#studioName').textContent = rec.name;
    $('#studioSub').textContent = paper.name + ', ' + size.name.toLowerCase();

    const cv = $('#sheet');
    cv._locked = true;
    $('#canvasVeil').hidden = false;
    $('#veilText').textContent = rec.ops && rec.ops.length ? 'Replaying your strokes' : 'Stretching the paper';

    const s = Store.settings();
    Studio.setBrush(s.brush); Studio.setTool(s.tool); Studio.setWater(s.water);
    Studio.setColour(colourRefFromSettings());
    Studio.setMoisture(false);
    $('#btnMoist').classList.remove('is-on');
    syncDock();

    /* The guide card takes a row of its own above the sheet, so it has to be on the
       screen before the canvas is measured, or the sheet is laid out for a space it
       does not have. */
    lesson = (opts && opts.lesson)
      ? (opts.resume || { l: opts.lesson, i: 0, n: 0, waterAt: s.water, finished: false })
      : null;
    if (lesson) reserveGuide(lesson.l); else $('#guide').style.height = '';
    paintGuide();

    // let the veil paint before the replay hogs the thread
    requestAnimationFrame(() => requestAnimationFrame(() => {
      Studio.open(rec, hostSize(), cv,
        { onChange: onStudioChange, onDry: onWashDry },
        () => {
          cv._locked = false;
          $('#canvasVeil').hidden = true;
          Studio.tiltEnabled(!!s.tilt);
          $('#tiltNote').hidden = !s.tilt;
          if (s.tilt) startTilt();
          if (opts && opts.resume) paintGuide();
          else if (opts && opts.lesson) beginGuide(opts.lesson);
          else { lesson = null; $('#guide').hidden = true; }
        },
        pr => { $('#veilText').textContent = 'Replaying your strokes, ' + Math.round(pr * 100) + ' percent'; });
    }));
  }

  function colourRefFromSettings() {
    const s = Store.settings();
    if (s.pigment && s.pigment.indexOf('mix:') === 0) {
      const m = Store.findMix(s.pigment.slice(4));
      if (m) return { m };
    }
    return { p: Data.BY_ID[s.pigment] ? s.pigment : 'ultramarine' };
  }

  function onStudioChange(evt) {
    syncDock();
    scheduleSave();
    if (evt && evt.type === 'stroke') lessonEvent('stroke', evt.tool);
  }

  function onWashDry() {
    if (Store.settings().haptics) buzz(16, 70);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCurrent, 1500);
  }

  function saveCurrent() {
    if (!current || mode === 'library') return;
    clearTimeout(saveTimer);
    const ops = Studio.ops();
    let thumb = current.thumb;
    try { thumb = Studio.thumb(320); } catch (e) {}
    const ok = Store.update(current.id, {
      ops, dur: Studio.duration(), strokes: Studio.strokeCount(), thumb
    });
    const err = $('#saveErr');
    if (!ok || Store.error()) {
      err.querySelector('span').textContent = Store.error() ||
        'This sheet could not be written to the phone.';
      err.hidden = false;
    } else if (err) err.hidden = true;
  }

  function closeStudio() {
    if (recording) cancelLapse();
    saveCurrent();
    Studio.abandon();
    stopTilt();
    lesson = null;
    $('#guide').hidden = true;
    current = null;
    setView('flatfile');
  }

  /* ---------------------------------------------------------------- the dock */
  function syncDock() {
    const col = Studio.getColour();
    paintChip($('#pigDot'), col, 22);
    $('#pigLabel').textContent = shortPigment(col.name);
    $('#btnPig').setAttribute('aria-label', 'Paint: ' + col.name);
    const br = Studio.getBrush();
    $('#brushLabel').textContent = shortBrush(br);
    $('#btnBrush').setAttribute('aria-label', 'Brush: ' + br.name);
    const t = Data.TOOL_BY_ID[Studio.getTool()];
    $('#toolLabel').textContent = t ? t.name : 'Paint';
    $('#btnUndo').disabled = !Studio.canUndo();
    $('#btnRedo').disabled = !Studio.canRedo();
    const w = Studio.getWater();
    $('#waterRange').value = Math.round(w * 100);
    $('#waterLabel').textContent = waterWord(w);
    $('#btnUnmask').hidden = !Studio.hasMask();
  }

  /* -------------------------------------------------------- pigment drawer */
  let drawerTab = 'tubes';

  function renderDrawer() {
    const body = $('#pigDrawer');
    body.innerHTML = '';
    $$('#pigTabs .seg').forEach(b => b.classList.toggle('is-on', b.dataset.tab === drawerTab));
    const ref = Studio.getColourRef();

    if (drawerTab === 'tubes') {
      for (const fam of Data.FAMILIES) {
        const row = document.createElement('div'); row.className = 'tuberow';
        const p = document.createElement('p'); p.textContent = fam.label;
        row.appendChild(p);
        body.appendChild(row);
        const grid = document.createElement('div'); grid.className = 'tubegrid';
        for (const pig of Data.PIGMENTS.filter(x => x.family === fam.id)) {
          const b = document.createElement('button');
          b.className = 'tube' + (ref.p === pig.id ? ' is-on' : '');
          const cv = document.createElement('canvas'); cv.width = 96; cv.height = 96;
          Data.swatch(cv.getContext('2d'), pig, 96, 96, pig.index * 977 + 41);
          const n = document.createElement('span'); n.textContent = pig.name;
          b.append(cv, n);
          b.addEventListener('click', () => {
            if (b.dataset.lp) { delete b.dataset.lp; return; }
            Studio.setColour({ p: pig.id });
            Store.set('pigment', pig.id);
            syncDock(); buzz(9, 45);
            closeSheet('sh-pig');
          });
          longPress(b, () => { buzz(12, 60); showPigmentInfo(pig); });
          grid.appendChild(b);
        }
        body.appendChild(grid);
      }
      const note = document.createElement('p');
      note.className = 'help';
      note.textContent = 'Press and hold a tube for its pigment number and what it does. The whole box is here; nothing in this app is locked.';
      body.appendChild(note);
      return;
    }

    const mixes = Store.mixes();
    if (!mixes.length) {
      const p = document.createElement('p'); p.className = 'help';
      p.textContent = 'No mixes yet. Open the mixing well, squeeze out two gobs and drag one into the other.';
      body.appendChild(p);
      return;
    }
    for (const m of mixes) {
      const row = document.createElement('div'); row.className = 'mixrow';
      const dot = document.createElement('canvas'); dot.className = 'chip-sw big';
      paintChip(dot, m, 34);
      const bod = document.createElement('div'); bod.className = 'body';
      const n = document.createElement('b'); n.textContent = m.name;
      const i = document.createElement('i');
      i.textContent = 'Granulation ' + Math.round(m.gran * 100) + ', staining ' + Math.round(m.stain * 100);
      bod.append(n, i);
      const use = document.createElement('button'); use.className = 'chip'; use.textContent = 'Use';
      use.addEventListener('click', () => {
        Studio.setColour({ m });
        Store.set('pigment', 'mix:' + m.id);
        syncDock(); buzz(9, 45); closeSheet('sh-pig');
      });
      const del = document.createElement('button'); del.className = 'iconbtn';
      del.setAttribute('aria-label', 'Delete ' + m.name);
      del.innerHTML = '<svg><use href="#i-close"/></svg>';
      del.addEventListener('click', () => { Store.removeMix(m.id); renderDrawer(); });
      row.append(dot, bod, use, del);
      body.appendChild(row);
    }
  }

  /* A WebView with user-select: none does not reliably raise contextmenu on a long
     press, and the pigment card is the only thing behind one, so the press is also
     timed by hand. The click that follows is swallowed through data-lp. */
  function longPress(el, fn) {
    let t = 0, x = 0, y = 0;
    const stop = () => { if (t) { clearTimeout(t); t = 0; } };
    el.addEventListener('pointerdown', e => {
      x = e.clientX; y = e.clientY; stop(); delete el.dataset.lp;
      t = setTimeout(() => { t = 0; el.dataset.lp = '1'; fn(); }, 460);
    });
    el.addEventListener('pointermove', e => {
      if (t && (Math.abs(e.clientX - x) > 12 || Math.abs(e.clientY - y) > 12)) stop();
    });
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('contextmenu', e => {
      e.preventDefault(); stop();
      if (!el.dataset.lp) { el.dataset.lp = '1'; fn(); }
    });
  }

  function showPigmentInfo(pig) {
    $('#infoTitle').textContent = pig.name;
    const b = $('#infoBody');
    b.innerHTML = '';
    const cv = document.createElement('canvas'); cv.width = 260; cv.height = 96;
    cv.style.cssText = 'width:100%;height:auto;border-radius:8px;border:1px solid var(--hair);display:block';
    Data.swatch(cv.getContext('2d'), pig, 260, 96, pig.index * 31 + 5);
    const code = document.createElement('p'); code.className = 'eyebrow';
    code.style.marginTop = '14px'; code.textContent = pig.code + ' - ' + pig.family;
    const note = document.createElement('p'); note.className = 'lede'; note.textContent = pig.note;
    const props = document.createElement('div'); props.className = 'props';
    props.append(propRow('Granulation', pig.gran), propRow('Staining', pig.stain),
                 propRow('Opacity', pig.opacity), propRow('Lifts back off', pig.lift));
    b.append(cv, code, note, props);
    openSheet('sh-info');
  }

  /* --------------------------------------------------------- brush and tool */
  function renderBrushes() {
    const b = $('#brushList'); b.innerHTML = '';
    const cur = Studio.getBrush().id;
    for (const br of Data.BRUSHES) {
      const el = document.createElement('button');
      el.className = 'listbtn';
      if (br.id === cur) el.style.borderColor = 'var(--accent)';
      const n = document.createElement('b'); n.textContent = br.name;
      const i = document.createElement('i'); i.textContent = br.hint;
      el.append(n, i);
      el.addEventListener('click', () => {
        Studio.setBrush(br.id); Store.set('brush', br.id); syncDock(); buzz(9, 45); closeSheet('sh-brush');
      });
      b.appendChild(el);
    }
  }

  function renderTools() {
    const b = $('#toolList'); b.innerHTML = '';
    const cur = Studio.getTool();
    for (const t of Data.TOOLS) {
      const el = document.createElement('button');
      el.className = 'listbtn';
      if (t.id === cur) el.style.borderColor = 'var(--accent)';
      const n = document.createElement('b'); n.textContent = t.name;
      const i = document.createElement('i'); i.textContent = t.hint;
      el.append(n, i);
      el.addEventListener('click', () => {
        Studio.setTool(t.id); Store.set('tool', t.id); syncDock(); buzz(9, 45); closeSheet('sh-tool');
        lessonEvent('tool', t.id);
      });
      b.appendChild(el);
    }
    $('#btnUnmask').hidden = !Studio.hasMask();
  }

  /* ------------------------------------------------------------ mixing well */
  let wellSample = null;

  function openWell() {
    closeAllSheets();
    saveCurrent();
    Studio.stop();                       // nothing on the sheet changes while you mix
    mode = 'well'; show('#s-well'); setChrome();
    const wrap = $('#wellWrap');
    const r = wrap.getBoundingClientRect();
    const w = Math.min(r.width - 28, 480), h = Math.min(r.height - 28, w * 1.15);
    Well.mount($('#wellCanvas'), w, h, (sample, suggest) => {
      wellSample = sample;
      const dot = $('#mixDot'), name = $('#mixName'), props = $('#mixProps');
      if (!sample) {
        dot.width = dot.width;
        name.textContent = 'Nothing picked up yet';
        props.textContent = 'Drag across two gobs to mix them';
        $('#wellTake').disabled = true;
        return;
      }
      paintChip(dot, sample, 34);
      name.textContent = suggest || 'Your mix';
      props.textContent = 'Granulation ' + Math.round(sample.gran * 100) +
                          ', staining ' + Math.round(sample.stain * 100);
      $('#wellTake').disabled = false;
    });
    renderTray();
  }

  function renderTray() {
    const tray = $('#wellTubes'); tray.innerHTML = '';
    let first = null;
    for (const p of Data.PIGMENTS) {
      const b = document.createElement('button');
      b.className = 'traytube';
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = p.hex;
      const n = document.createElement('span'); n.textContent = p.name;
      b.append(dot, n);
      b.addEventListener('click', () => {
        $$('.traytube').forEach(x => x.classList.remove('is-on'));
        b.classList.add('is-on');
        Well.setPigment(p);
        buzz(8, 40);
      });
      if (!first) first = b;
      tray.appendChild(b);
    }
    const ref = Studio.getColourRef();
    const startId = ref.p || 'ultramarine';
    const idx = Data.PIGMENTS.findIndex(p => p.id === startId);
    const chosen = tray.children[idx >= 0 ? idx : 0];
    if (chosen) { chosen.classList.add('is-on'); Well.setPigment(Data.PIGMENTS[idx >= 0 ? idx : 0]); }
  }

  /* --------------------------------------------------------------- export */
  function renderExport() {
    const cv = Studio.flatten($('#paperChk').checked, 1);
    $('#exportImg').src = cv.toDataURL('image/png');
    const chips = $('#speedChips'); chips.innerHTML = '';
    [['slow', 'Unhurried'], ['standard', 'Standard'], ['fast', 'Brisk']].forEach(([id, label]) => {
      const c = document.createElement('button');
      c.className = 'chip' + (lapseSpeed === id ? ' is-on' : '');
      c.textContent = label;
      c.addEventListener('click', () => { lapseSpeed = id; renderExport(); });
      chips.appendChild(c);
    });
    const n = Studio.strokeCount();
    $('#lapseEst').textContent = n
      ? 'About ' + Studio.estimateSeconds(lapseSpeed) + ' seconds from ' + n +
        (n === 1 ? ' stroke.' : ' strokes.')
      : 'Nothing painted yet, so there is nothing to replay.';
    $('#exportLapse').disabled = !n;
    $('#exportNote').textContent = '';
  }

  function fileStem() {
    const n = (current && current.name ? current.name : 'pigment')
      .replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
    return (n || 'pigment') + '-' + new Date().toISOString().slice(0, 10);
  }

  function deliver(name, mime, blobOrDataUrl, b64) {
    if (window.Native && Native.saveFile && b64) {
      try {
        const uri = Native.saveFile(name, mime, b64);
        if (uri) {
          toast('Saved to Downloads as ' + name);
          if (Native.shareUri) setTimeout(() => { try { Native.shareUri(uri, mime); } catch (e) {} }, 350);
          return true;
        }
      } catch (e) {}
      toast('Android would not let the file be written.');
      return false;
    }
    const url = blobOrDataUrl instanceof Blob ? URL.createObjectURL(blobOrDataUrl) : blobOrDataUrl;
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    if (blobOrDataUrl instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Saved as ' + name);
    return true;
  }

  function exportPng() {
    const cv = Studio.flatten($('#paperChk').checked, 1);
    const url = cv.toDataURL('image/png');
    deliver(fileStem() + '.png', 'image/png', url, url.split(',')[1]);
  }

  let recording = false;
  /* The replay runs on requestAnimationFrame, which the system stops when the screen
     dims, so a recording left alone would stall halfway through. */
  function awake(on) {
    if (window.Native && Native.keepAwake) { try { Native.keepAwake(on); } catch (e) {} }
  }
  /* Recording blanks the sheet and repaints it over several seconds, so it has to say
     so on the sheet: the drawer it was started from closes on the first frame. While
     it runs the dock and the sheet menu are out, and Back stops it. */
  function lapseChrome(on) {
    document.body.classList.toggle('recording', on);
    $('#lapseCard').hidden = !on;
    if (on) $('#lapseBar').style.width = '0%';
  }
  function cancelLapse() {
    if (!recording) return false;
    Studio.cancelRecord();
    return true;
  }
  function exportLapse() {
    if (recording) return;
    recording = true;
    awake(true);
    // the name is fixed now: this recording belongs to the sheet it started on
    const stem = fileStem();
    $('#exportLapse').disabled = true;
    lapseChrome(true);
    $('#exportNote').textContent = '';
    closeSheet('sh-export');
    const done = () => { recording = false; awake(false); lapseChrome(false); $('#exportLapse').disabled = false; };
    Studio.record(lapseSpeed, pr => { $('#lapseBar').style.width = Math.round(pr * 100) + '%'; })
      .then(blob => {
        $('#lapseBar').style.width = '100%';
        done();
        if (mode !== 'studio') { toast('The timelapse is ready in the export drawer.'); return; }
        openSheet('sh-export');
        const mb = blob.size / 1048576;
        const r = new FileReader();
        r.onloadend = () => {
          const b64 = String(r.result).split(',')[1];
          deliver(stem + '-timelapse.webm', 'video/webm', blob, b64);
          const n = mb < 1 ? 1 : Math.round(mb);
          $('#exportNote').textContent = 'The file is about ' + n + (n === 1 ? ' megabyte.' : ' megabytes.');
        };
        r.readAsDataURL(blob);
      })
      .catch(e => {
        done();
        if (e && e.cancelled) { toast('Timelapse stopped. Nothing was saved.'); return; }
        if (mode !== 'studio') return;
        openSheet('sh-export');
        $('#exportNote').textContent = 'This browser will not record a canvas, so the timelapse is not available here. The picture export still works.';
      });
  }

  /* --------------------------------------------------------------- lessons */
  function startLesson(l) {
    const rec = Store.create(l.paper, l.size, l.title);
    Store.set('brush', l.brush); Store.set('pigment', l.pigment);
    Store.set('water', l.water); Store.set('tool', 'paint');
    openPainting(rec.id, { lesson: l });
  }

  /* The sheet is measured once, when the painting opens, so the row the guide sits
     in must not change height as the lesson moves on: a taller card later would push
     the paper under the dock. Every card this lesson can show is measured up front
     and the row is held at the tallest of them. */
  const GUIDE_END_SUB = 'The sheet stays in your flatfile. Keep going on it if you like.';
  function reserveGuide(l) {
    const g = $('#guide'), say = $('#guideSay'), sub = $('#guideSub'), cnt = $('#guideCount');
    const wasHidden = g.hidden;
    g.style.height = ''; g.hidden = false;
    cnt.textContent = 'Step 1 of ' + l.steps.length;
    let max = 0;
    const cards = l.steps.map(st => [st.say, st.sub || '']).concat([[l.end, GUIDE_END_SUB]]);
    for (const [a, b] of cards) {
      say.textContent = a; sub.textContent = b;
      max = Math.max(max, g.getBoundingClientRect().height);
    }
    g.style.height = Math.ceil(max) + 'px';
    g.hidden = wasHidden;
  }

  function beginGuide(l) {
    lesson = { l, i: 0, n: 0, waterAt: Studio.getWater(), finished: false };
    Studio.setBrush(l.brush); Studio.setTool('paint');
    Studio.setWater(l.water); Studio.setColour({ p: l.pigment });
    syncDock();
    paintGuide();
  }

  function paintGuide() {
    const g = $('#guide');
    if (!lesson) { g.hidden = true; return; }
    g.hidden = false;
    if (lesson.finished) {
      $('#guideSay').textContent = lesson.l.end;
      $('#guideSub').textContent = GUIDE_END_SUB;
      $('#guideCount').textContent = 'Finished';
      $('#guideSkip').textContent = 'Close';
      return;
    }
    const st = lesson.l.steps[lesson.i];
    $('#guideSay').textContent = st.say;
    $('#guideSub').textContent = st.sub || '';
    $('#guideCount').textContent = st.on === 'tap'
      ? 'Tap this card to go on'
      : 'Step ' + (lesson.i + 1) + ' of ' + lesson.l.steps.length;
    $('#guideSkip').textContent = 'End the lesson';
  }

  function nextStep() {
    if (!lesson) return;
    lesson.i++; lesson.n = 0; lesson.waterAt = Studio.getWater();
    buzz(12, 55);
    if (lesson.i >= lesson.l.steps.length) {
      lesson.finished = true;
      Store.markLesson(lesson.l.id);
    }
    paintGuide();
  }

  function lessonEvent(kind, data) {
    if (!lesson || lesson.finished) return;
    const st = lesson.l.steps[lesson.i];
    if (!st) return;
    let ok = false;
    switch (st.on) {
      case 'stroke': ok = kind === 'stroke'; break;
      case 'strokes':
        if (kind === 'stroke') lesson.n++;
        ok = lesson.n >= (st.n || 1); break;
      case 'tap': ok = kind === 'tap'; break;
      case 'water-up': ok = kind === 'water' && data > lesson.waterAt + 0.07; break;
      case 'tool-water': ok = kind === 'stroke' && data === 'water'; break;
      case 'tool-lift': ok = kind === 'stroke' && data === 'lift'; break;
      case 'tool-paint-stroke': ok = kind === 'stroke' && data === 'paint'; break;
    }
    if (ok) nextStep();
  }

  /* ------------------------------------------------------------------ tilt */
  function onOrient(e) {
    if (!Studio.isTilt() || mode !== 'studio') return;
    if (e.beta === null || e.gamma === null) return;
    if (!tiltBase) tiltBase = { b: e.beta, g: e.gamma };
    const gx = Math.max(-1, Math.min(1, (e.gamma - tiltBase.g) / 26));
    const gy = Math.max(-1, Math.min(1, (e.beta - tiltBase.b) / 26));
    const now = Date.now();
    if (now - lastTiltSent < 120) return;
    lastTiltSent = now;
    Studio.setTilt(gx, gy, true);
  }
  function startTilt() { tiltBase = null; window.addEventListener('deviceorientation', onOrient); }
  function stopTilt() { window.removeEventListener('deviceorientation', onOrient); Studio.setTilt(0, 0, false); }

  /* ------------------------------------------------------------- intro art */
  /* The bloom that is also the launcher icon: three pigments dropped into one wet
     patch and left alone. It arrives by spreading, the way the real thing does. */
  function drawIntroArt() {
    const cv = $('#introArt');
    const host = cv.parentNode.getBoundingClientRect();
    Bloom.grow(cv, {
      w: Math.round(host.width), h: Math.max(180, Math.round(host.height)),
      res: 230, seed: 20259, ms: 1250
    });
  }

  /* ----------------------------------------------------------------- wiring */
  function wire() {
    $$('#tabs .tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $$('[data-close]').forEach(b => b.addEventListener('click', () => closeSheet()));
    $$('.sheetlayer').forEach(l => l.addEventListener('click', e => { if (e.target === l) closeSheet(l.id); }));

    $('#btnNew').addEventListener('click', openPicker);
    $('#pickBack').addEventListener('click', () => setView('flatfile'));
    $('#pickGo').addEventListener('click', e => {
      // a double tap on a primary button is one intention, not two sheets
      const b = e.currentTarget;
      if (b.disabled) return;
      b.disabled = true;
      buzz(14, 60);
      const rec = Store.create(pick.paper, pick.size);
      openPainting(rec.id);
    });

    $('#studioBack').addEventListener('click', () => { if (cancelLapse()) return; closeStudio(); });
    $('#btnUndo').addEventListener('click', () => { if (Studio.undo()) buzz(9, 45); });
    $('#btnRedo').addEventListener('click', () => { if (Studio.redo()) buzz(9, 45); });
    $('#btnMoist').addEventListener('click', () => {
      const on = !Studio.isMoisture();
      Studio.setMoisture(on);
      $('#btnMoist').classList.toggle('is-on', on);
      toast(on ? 'Moisture view. Bright is wet, dark is dry.' : 'Back to the paint.', 1800);
    });
    $('#btnPig').addEventListener('click', () => { renderDrawer(); openSheet('sh-pig'); });
    $('#btnBrush').addEventListener('click', () => { renderBrushes(); openSheet('sh-brush'); });
    $('#btnTool').addEventListener('click', () => { renderTools(); openSheet('sh-tool'); });
    $('#btnUnmask').addEventListener('click', () => {
      if (Studio.removeMask()) { toast('Masking fluid rubbed off.'); buzz(16, 70); }
      closeSheet('sh-tool');
    });

    $('#waterRange').addEventListener('input', e => {
      const v = e.target.value / 100;
      Studio.setWater(v);
      Store.set('water', v);
      $('#waterLabel').textContent = waterWord(v);
      lessonEvent('water', v);
    });

    $$('#pigTabs .seg').forEach(b => b.addEventListener('click', () => { drawerTab = b.dataset.tab; renderDrawer(); }));
    $('#openWell').addEventListener('click', openWell);
    $('#wellBack').addEventListener('click', () => { mode = 'studio'; show('#s-studio'); setChrome(); Studio.kick(); });
    $('#wellWipe').addEventListener('click', () => { Well.wipe(); toast('Palette wiped.'); });
    $('#wellTake').addEventListener('click', () => {
      const s = Well.sample();
      if (!s) return;
      paintChip($('#saveDot'), s, 34);
      $('#saveProps').textContent = 'Granulation ' + Math.round(s.gran * 100) +
        ', staining ' + Math.round(s.stain * 100);
      $('#mixNameIn').value = Well.suggestName() || 'My mix';
      openSheet('sh-mixname');
    });
    $('#mixSave').addEventListener('click', () => {
      const s = Well.sample();
      if (!s) { closeSheet('sh-mixname'); return; }
      const name = ($('#mixNameIn').value || '').trim() || 'My mix';
      const id = Store.addMix({ name, K: s.K, S: s.S, gran: s.gran, stain: s.stain, hex: s.hex });
      const m = Store.findMix(id);
      Studio.setColour({ m });
      Store.set('pigment', 'mix:' + id);
      closeSheet('sh-mixname');
      syncDock();
      if (current) { mode = 'studio'; show('#s-studio'); setChrome(); Studio.kick(); }
      toast('Saved. ' + shortPigment(name) + ' is on the brush.');
      buzz(16, 70);
    });

    $('#btnMenu').addEventListener('click', () => {
      if (!current) return;
      $('#menuTitle').textContent = current.name;
      $('#renameIn').value = current.name;
      $('#tiltChk').checked = !!Store.settings().tilt;
      $('#hapticChk').checked = !!Store.settings().haptics;
      const n = Studio.strokeCount();
      $('#menuExportSub').textContent = n
        ? 'Save a picture, or replay ' + n + (n === 1 ? ' stroke' : ' strokes') + ' as a video'
        : 'Save a picture of the sheet';
      openSheet('sh-menu');
    });
    $('#renameIn').addEventListener('change', e => {
      if (!current) return;
      const v = (e.target.value || '').trim().slice(0, 40);
      if (!v) { e.target.value = current.name; return; }
      Store.update(current.id, { name: v });
      current.name = v;
      e.target.value = v;
      $('#studioName').textContent = v;
      $('#menuTitle').textContent = v;
    });
    $('#tiltChk').addEventListener('change', e => {
      Store.set('tilt', e.target.checked);
      Studio.tiltEnabled(e.target.checked);
      $('#tiltNote').hidden = !e.target.checked;
      if (e.target.checked) { startTilt(); toast('Hold the phone level, then lean it.'); }
      else stopTilt();
    });
    $('#hapticChk').addEventListener('change', e => { Store.set('haptics', e.target.checked); });
    $('#menuExport').addEventListener('click', () => { closeSheet('sh-menu'); renderExport(); openSheet('sh-export'); });
    $('#menuDelete').addEventListener('click', e => {
      const b = e.currentTarget;
      if (b.dataset.armed) {
        const id = current.id;
        closeSheet('sh-menu');
        if (recording) cancelLapse();
        Studio.abandon(); stopTilt(); lesson = null; $('#guide').hidden = true;
        current = null;
        Store.remove(id);
        setView('flatfile');
        toast('Sheet thrown away.');
        return;
      }
      b.dataset.armed = '1';
      b.querySelector('b').textContent = 'Tap again to throw it away';
      setTimeout(() => { delete b.dataset.armed; b.querySelector('b').textContent = 'Throw this sheet away'; }, 5000);
    });

    $('#paperChk').addEventListener('change', renderExport);
    $('#exportPng').addEventListener('click', exportPng);
    $('#exportLapse').addEventListener('click', exportLapse);

    $('#guideSkip').addEventListener('click', e => {
      e.stopPropagation();
      lesson = null; $('#guide').hidden = true;
    });
    $('#guide').addEventListener('click', () => lessonEvent('tap'));

    $('#btnSettings').addEventListener('click', () => {
      const s = Store.settings();
      $('#leftyChk').checked = !!s.lefty;
      $('#hapticChk2').checked = !!s.haptics;
      $('#settingsNote').textContent = '';
      openSheet('sh-settings');
    });
    $('#leftyChk').addEventListener('change', e => {
      Store.set('lefty', e.target.checked);
      document.body.classList.toggle('lefty', e.target.checked);
    });
    $('#hapticChk2').addEventListener('change', e => Store.set('haptics', e.target.checked));
    $('#btnExportAll').addEventListener('click', () => {
      const text = Store.exportJSON();
      const b64 = btoa(unescape(encodeURIComponent(text)));
      deliver('pigment-archive-' + new Date().toISOString().slice(0, 10) + '.json',
              'application/json', new Blob([text], { type: 'application/json' }), b64);
    });
    $('#btnErase').addEventListener('click', e => {
      const b = e.currentTarget;
      if (b.dataset.armed) {
        Store.eraseAll();
        delete b.dataset.armed;
        b.querySelector('b').textContent = 'Erase everything';
        $('#settingsNote').textContent = 'Erased.';
        closeSheet('sh-settings');
        setView('flatfile');
        return;
      }
      b.dataset.armed = '1';
      b.querySelector('b').textContent = 'Tap again to erase everything';
      $('#settingsNote').textContent = 'This removes every sheet, mix and setting from this phone. It cannot be undone.';
      setTimeout(() => {
        delete b.dataset.armed;
        b.querySelector('b').textContent = 'Erase everything';
        $('#settingsNote').textContent = '';
      }, 6000);
    });

    $('#introStart').addEventListener('click', () => {
      Store.markIntro();
      startLesson(Data.LESSONS[0]);
    });
    $('#introSkip').addEventListener('click', () => { Store.markIntro(); setView('flatfile'); });

    /* Opening the keyboard resizes an Android WebView, and the sheet the keyboard
       belongs to is usually a rename field. Re-laying out the canvas would close
       that sheet and throw away what was being typed, so the canvas is only rebuilt
       when the space it has actually changed and nothing is open over it. */
    window.addEventListener('resize', () => {
      if (mode !== 'studio' || !current) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (mode !== 'studio' || !current) return;
        if (openSheets.length) return;
        const a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
        const g = Studio.grid(), h = hostSize();
        if (Math.abs(g.dispW - h.w) < 12 && Math.abs(g.dispH - h.h) < 12) return;
        const keep = lesson;
        saveCurrent();
        openPainting(current.id, keep ? { lesson: keep.l, resume: keep } : null);
      }, 400);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onPause(); else onResume();
    });
  }
  let resizeTimer = 0;

  /* ------------------------------------------------------- the shell's hooks */
  function back() {
    if (openSheets.length) { closeSheet(); return true; }
    if (recording) { cancelLapse(); return true; }
    if (mode === 'well') { mode = 'studio'; show('#s-studio'); setChrome(); Studio.kick(); return true; }
    if (mode === 'studio') { closeStudio(); return true; }
    if (mode === 'picker') { setView('flatfile'); return true; }
    if (mode === 'intro') return false;
    if (view !== 'flatfile') { setView('flatfile'); return true; }
    return false;
  }
  function onPause() {
    // a recording is frames off a canvas that stops being painted the moment the app
    // is backgrounded, so it is stopped rather than left to record a still image
    if (recording) { cancelLapse(); awake(false); }
    if (mode === 'studio' || mode === 'well') { saveCurrent(); Studio.stop(); }
  }
  function onResume() { if (mode === 'studio') Studio.kick(); }

  /* --------------------------------------------------------------------- go */
  function init() {
    const s = Store.settings();
    document.body.classList.toggle('lefty', !!s.lefty);
    wire();
    if (!Store.seenIntro()) {
      mode = 'intro'; show('#s-intro'); setChrome();
      drawIntroArt();
    } else {
      setView('flatfile');
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  return { back, onPause, onResume, setView, openPainting, openPicker, startLesson,
           openWell, toast, renderExport, openSheet, closeSheet,
           state: () => ({ mode, view, current, lesson }) };
})();

/* A top level const is not a window property, and the Android shell reaches for
   window.App to hand it the Back gesture. */
window.App = App;
