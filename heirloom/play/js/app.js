/* Heirloom. Two interfaces in one app: Elder Mode, which is one screen with one
   button, and the keeper's side, which is everything else. Nothing here talks to
   a network; there is no network to talk to. */

const App = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const VIEWS = ['archive', 'ask', 'family', 'keepsake'];
  let view = 'archive';
  let mode = 'timeline';
  let filter = { teller: null, tag: null, showPrivate: false };
  let query = '';
  let elder = null;                 // { tellerId, stage }
  let sheets = [];                  // stack of { kind, arg }
  let step = 0;                     // onboarding
  let obPacks = [], obPacksTouched = false;
  let player = { audio: null, id: null, url: null, raf: 0, loading: null };
  let waveRaf = 0, tick = 0, recTimer = 0, finishing = false;
  let wave = null;                  // the ring being drawn by the voice

  /* ------------------------------------------------------------ effects - */
  let ac = null;
  function audioCtx() {
    if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  /** The one sound in the app: a tape head meeting a spool. */
  function tape(up) {
    if (!Store.settings().sound) return;
    const c = audioCtx(); if (!c) return;
    try {
      const t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = up ? 1400 : 900; f.Q.value = 1.1;
      o.type = 'square'; o.frequency.setValueAtTime(up ? 220 : 160, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
      o.connect(f); f.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.1);
    } catch (e) {}
  }
  function buzz(ms, amp) {
    if (!Store.settings().haptics) return;
    try {
      if (window.Native && Native.vibrate) Native.vibrate(ms, amp || 150);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {}
  }

  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /** An error next to the field it belongs to. Never alert(), never only a toast. */
  function fieldErr(sel, msg) {
    const inp = typeof sel === 'string' ? $(sel) : sel;
    if (!inp) { toast(msg); return; }
    const fld = inp.closest('.fld') || inp.parentElement;
    let e = fld.querySelector('.fld-err');
    if (!e) { e = document.createElement('p'); e.className = 'fld-err'; fld.appendChild(e); }
    e.textContent = msg;
    inp.classList.add('bad');
    try { inp.focus({ preventScroll: false }); } catch (err) {}
    inp.addEventListener('input', () => { e.remove(); inp.classList.remove('bad'); }, { once: true });
  }
  /** A button that is doing something slow says so and cannot be tapped again. */
  function busy(el, label) {
    if (!el || el.disabled) return () => {};
    const was = el.innerHTML;
    el.disabled = true; el.classList.add('busy'); el.textContent = label;
    return () => { el.disabled = false; el.classList.remove('busy'); el.innerHTML = was; };
  }

  const TTS = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
  function speak(text, onEnd) {
    if (!TTS) { toast('This device has no built in voice.'); if (onEnd) onEnd(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.86; u.pitch = 1;
      u.onend = () => { if (onEnd) onEnd(); };
      u.onerror = () => { toast('This device has no built in voice.'); if (onEnd) onEnd(); };
      speechSynthesis.speak(u);
    } catch (e) { toast('This device has no built in voice.'); if (onEnd) onEnd(); }
  }

  /* -------------------------------------------------------------- icons - */
  const ICONS = {
    archive: '<path d="M3.5 5.5h15M3.5 11h15M3.5 16.5h9"/>',
    close: '<path d="M6.5 6.5l9 9M15.5 6.5l-9 9"/>',
    speak: '<path d="M4 8.5h3.2L12 4.8v12.4l-4.8-3.7H4z"/><path d="M15 8.2a4 4 0 0 1 0 5.6M17.4 6a7.4 7.4 0 0 1 0 10"/>',
    tick: '<path d="M5 11.5l4 4 8-9"/>',
    out: '<path d="M11 14V4M7 8l4-4 4 4"/><path d="M4.5 13.5v3a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
    into: '<path d="M11 4v10M7 10l4 4 4-4"/><path d="M4.5 13.5v3a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
    exit: '<rect x="6" y="6" width="10" height="10" rx="2"/>',
    ask: '<path d="M4 4.5h14v10H9l-4.2 3.2V14.5H4z"/><path d="M11 11.4v-.7c0-1.2 1.7-1.3 1.7-2.7 0-1-.8-1.6-1.8-1.6-.9 0-1.6.5-1.8 1.3"/>',
    family: '<circle cx="8" cy="7.6" r="2.8"/><circle cx="15.4" cy="9.2" r="2.1"/><path d="M2.8 17.4c0-2.8 2.3-4.4 5.2-4.4s5.2 1.6 5.2 4.4"/><path d="M14.6 13.2c2.4 0 4.6 1.1 4.6 3.6"/>',
    keepsake: '<rect x="3.2" y="7.4" width="15.6" height="10.4" rx="1.4"/><path d="M3.2 11.2h15.6M11 7.4v10.4"/><path d="M6.4 7.4c0-2 1.4-3.2 2.8-3.2 1.5 0 2 1.3 1.8 3.2M15.6 7.4c0-2-1.4-3.2-2.8-3.2-1.5 0-2 1.3-1.8 3.2"/>'
  };
  const icon = (name, cls) => '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 22 22" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  function paintIcons() {
    document.querySelectorAll('.tab-i, [data-icon]').forEach(el => {
      el.innerHTML = icon(el.dataset.i || el.dataset.icon);
    });
  }

  /* ------------------------------------------------------------- the rings - */
  /** The wobble of a voice, the same shape on every ring and growing outward, which is what
      makes a stack of them read as one sound spreading. It is the launcher icon's own curve. */
  const MARK_SEED = 2.1;
  function wobble(a, seed) {
    const s = seed == null ? MARK_SEED : seed;
    const sector = 0.30 + 0.70 * Math.pow(Math.max(0, Math.cos(a - 4.05)), 1.15);
    return (Math.sin(a * 4 + s) * 0.52 + Math.sin(a * 7 + s * 1.7) * 0.34 + Math.sin(a * 13 + s * 2.3) * 0.17) * sector;
  }
  function ringPath(cx, cy, r, amp, seed) {
    const pts = 72; let d = '';
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rr = r + wobble(a, seed) * amp;
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ' ' + (cy + Math.sin(a) * rr).toFixed(2);
    }
    return d + 'Z';
  }
  /** n rings in a box, out of max positions, in the current colour. The app's mark. */
  function ringsSvg(n, o) {
    o = o || {};
    const size = o.size || 64, cx = size / 2, cy = size / 2, max = Math.max(o.max || n, 1);
    const R = size * 0.46, step = R / (max + 0.8);
    let h = '<svg class="rings' + (o.cls ? ' ' + o.cls : '') + '" viewBox="0 0 ' + size + ' ' + size +
      '" width="' + size + '" height="' + size + '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="' +
      (o.sw || 1.5) + '" stroke-linejoin="round">';
    const seed = o.seed == null ? MARK_SEED : MARK_SEED + o.seed;
    const ampAt = i => Math.min(step * 0.42, step * 0.16 * (i + 1));
    for (let i = 1; i <= n; i++) {
      h += '<path d="' + ringPath(cx, cy, step * (i + 0.8), ampAt(i), seed) + '"' +
        (o.fade ? ' opacity="' + (0.45 + 0.55 * i / n).toFixed(2) + '"' : '') + '/>';
    }
    if (o.ghost) for (let i = n + 1; i <= max; i++) {
      h += '<path d="' + ringPath(cx, cy, step * (i + 0.8), ampAt(i), seed) + '" opacity="0.16"/>';
    }
    if (!o.nodot) h += '<circle cx="' + cx + '" cy="' + cy + '" r="' +
      (Math.min(Math.max(step * 0.5, size * 0.03), size * 0.06)).toFixed(2) + '" fill="currentColor" stroke="none"/>';
    return h + '</svg>';
  }
  /** A drawn empty state: the rings, a line, a way forward. */
  function emptyHtml(rings, title, body, action) {
    return '<div class="empty"><div class="empty-art">' +
      ringsSvg(rings, { size: 120, max: 6, sw: 1.5, fade: true, ghost: true }) + '</div>' +
      '<p class="q">' + title + '</p><p>' + body + '</p>' + (action || '') + '</div>';
  }

  /* --------------------------------------------------------- navigation - */
  function setView(v) {
    view = v;
    elder = null;
    document.body.classList.add('has-tabs');
    $('#elder').hidden = true;
    $('#onboard').hidden = true;
    VIEWS.forEach(x => { $('#v-' + x).hidden = x !== v; });
    const cur = $('#v-' + v); cur.classList.remove('enter'); void cur.offsetWidth; cur.classList.add('enter');
    $('#tabs').hidden = false;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    stopPlayer();
    render();
    const sc = $('#v-' + v + ' .scroller'); if (sc) sc.scrollTop = 0;
  }

  function render() {
    if (view === 'archive') renderArchive();
    else if (view === 'ask') renderAsk();
    else if (view === 'family') renderFamily();
    else if (view === 'keepsake') renderKeepsake();
  }

  /* ---------------------------------------------------------- first run - */
  const STEPS = 4;
  function showOnboard() {
    document.body.classList.remove('has-tabs');
    $('#tabs').hidden = true;
    VIEWS.forEach(x => { $('#v-' + x).hidden = true; });
    $('#elder').hidden = true;
    $('#onboard').hidden = false;
    const sel = $('#obDay');
    if (!sel.options.length) {
      Store.DAYS.forEach((d, i) => sel.add(new Option(d, i)));
      sel.value = 0;
    }
    $('#obPlate').innerHTML = ringsSvg(9, { size: 620, max: 9, sw: 1.4, seed: 2, nodot: true });
    renderObPacks();
    paintOnboard();
  }
  function renderObPacks() {
    const y = Store.validYear($('#obYear').value);
    if (!obPacksTouched && y) obPacks = y <= 1945 ? ['prewar'] : (y <= 1968 ? ['midcentury'] : []);
    $('#obPacks').innerHTML = Content.PACKS.filter(p => p.id !== 'core').map(p =>
      '<button class="chip' + (obPacks.indexOf(p.id) >= 0 ? ' on' : '') + '" data-act="obpack" data-id="' +
      p.id + '">' + esc(p.name) + '</button>').join('');
  }
  function paintOnboard() {
    document.querySelectorAll('.ob-step').forEach(el => { el.hidden = +el.dataset.step !== step; });
    /* The plate is a backdrop for the three cards that are all words. It comes off behind the
       form, where the space is needed and a texture behind a field is only noise. */
    $('#obPlate').hidden = step === STEPS - 1;
    $('#obDots').innerHTML = Array.from({ length: STEPS },
      (_, i) => '<span class="dot' + (i === step ? ' on' : '') + '"></span>').join('');
    $('#obNext').textContent = step === STEPS - 1 ? 'Start the archive' : 'Next';
  }
  /* Twice on Next is once: without this a thumb that bounces skips a card of the explanation,
     and on the last card the second tap lands on the tab bar of the app that just appeared. */
  let lastNext = 0;
  function obNext() {
    if (Date.now() - lastNext < 340) return;
    lastNext = Date.now();
    if (step < STEPS - 1) {
      step++;
      if (step === STEPS - 1) renderObPacks();
      paintOnboard();
      $('.ob-scroll').scrollTop = 0;
      return;
    }
    holdTaps();
    const name = $('#obName').value.trim();
    if (!name) { fieldErr('#obName', 'Their name, first. It is how every story will be filed.'); return; }
    const yRaw = $('#obYear').value.trim();
    if (yRaw && !Store.validYear(yRaw)) { fieldErr('#obYear', 'A four digit year, or leave it blank.'); return; }
    Store.addTeller({
      name, relation: $('#obRel').value, birthYear: yRaw, place: $('#obPlace').value,
      packs: obPacks.slice(), day: +$('#obDay').value, time: $('#obTime').value || '15:00'
    });
    Store.onboarded(true);
    reschedule();
    askNotifyPermission();
    setView('ask');
    toast(name + ' is in the archive.');
  }
  /** Asked at the moments a person has just shown they want the reminder, never on every open. */
  function askNotifyPermission() {
    if (!(window.Native && Native.notificationsAllowed && Native.requestNotificationPermission)) return;
    if (!Store.settings().notify) return;
    try { if (!Native.notificationsAllowed()) Native.requestNotificationPermission(); } catch (e) {}
  }

  /* ------------------------------------------------------------ archive - */
  function visibleStories() {
    let list = query ? Store.search(query) : Store.stories();
    if (filter.teller) list = list.filter(s => s.tellerId === filter.teller);
    if (filter.tag) list = list.filter(s => s.tags.some(t => t.label.toLowerCase() === filter.tag));
    if (!filter.showPrivate) list = list.filter(s => s.visibility !== 'private');
    return list;
  }

  function renderArchive() {
    const all = Store.stories();
    const secs = all.reduce((a, s) => a + s.dur, 0);
    /* Nothing to search and nothing to sort: the empty archive is one sentence, not a
       search box and two tabs over a blank page. */
    const bare = !all.length;
    $('#archSeg').hidden = bare;
    $('.searchwrap').hidden = bare;
    $('#archSub').textContent = all.length
      ? all.length + (all.length === 1 ? ' story, ' : ' stories, ') + Store.durWords(secs) + ' of them talking.'
      : 'Nothing kept yet.';
    $('#archMark').innerHTML = ringsSvg(Math.min(all.length, 9), { size: 56, max: 9, sw: 1.3, ghost: true });
    document.querySelectorAll('#archSeg .seg-b').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));

    const chips = [];
    if (mode === 'timeline') {
      chips.push('<button class="chip' + (!filter.teller && !filter.tag ? ' on' : '') +
                 '" data-act="filt" data-k="all">Everyone</button>');
      Store.tellers().forEach(t => chips.push('<button class="chip' + (filter.teller === t.id ? ' on' : '') +
        '" data-act="filt" data-k="teller" data-id="' + t.id + '">' + esc(t.name) + '</button>'));
      if (filter.tag) chips.push('<button class="chip on" data-act="filt" data-k="all">' +
        esc(filter.tag) + icon('close', 'x') + '</button>');
      if (all.some(s => s.visibility === 'private'))
        chips.push('<button class="chip' + (filter.showPrivate ? ' on' : '') +
          '" data-act="filt" data-k="private">Show private</button>');
    }
    $('#archChips').innerHTML = chips.join('');
    $('#archChips').hidden = bare || !chips.length;

    if (mode === 'threads' && !bare) { $('#archList').innerHTML = threadsHtml(); return; }

    const list = visibleStories();
    if (!list.length) {
      $('#archList').innerHTML = all.length
        ? emptyHtml(3, 'Nothing matches that.', 'Try a name, a place or a word from a moment you marked.')
        : emptyHtml(1, 'The archive is empty, for now.', 'One question, answered once, and this page stops being empty forever. Every story adds a ring.',
            '<button class="btn" data-act="go" data-v="ask">Go to this week' + "'" + 's question</button>');
      return;
    }
    let html = '', lastMonth = '', i = 0;
    for (const s of list) {
      const d = new Date(s.at);
      const m = Store.MONTHS[d.getMonth()] + ' ' + d.getFullYear();
      if (m !== lastMonth) { html += '<p class="month">' + m + '</p>'; lastMonth = m; }
      html += storyCard(s, i++);
    }
    $('#archList').innerHTML = html;
  }

  function storyCard(s, i) {
    const t = Store.teller(s.tellerId);
    const isSealed = Store.sealed(s);
    const hearts = s.reactions.length;
    const badges = [];
    if (isSealed) badges.push('<span class="badge seal">Sealed until ' + esc(Store.longDate(new Date(s.sealUntil + 'T00:00:00').getTime())) + '</span>');
    if (s.visibility === 'private') badges.push('<span class="badge">Private</span>');
    if (hearts) badges.push('<span class="badge hearts">' + hearts + (hearts === 1 ? ' heart' : ' hearts') + '</span>');
    s.tags.slice(0, 3).forEach(tg => badges.push('<span class="badge">' + esc(tg.label) + '</span>'));
    return '<button class="story rise" style="--i:' + (i || 0) + '" data-act="story" data-id="' + s.id + '">' +
      '<p class="sq">' + esc(s.title || s.question) + '</p>' +
      '<div class="meta"><span class="who">' + esc(t ? t.name : 'Unknown') + '</span>' +
      '<span class="bar"></span><span>' + esc(Store.relDate(s.at)) + '</span>' +
      '<span>' + Store.dur(s.dur) + '</span></div>' +
      (badges.length ? '<div class="badges">' + badges.join('') + '</div>' : '') +
      '</button>';
  }

  function threadsHtml() {
    let th = Store.threads();
    /* The search box sits above both modes, so it has to mean something in this one:
       a thread matches on its own label or on any story it holds. */
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hits = new Set(Store.search(query).map(s => s.id));
      th = th.filter(t => t.label.toLowerCase().indexOf(q) >= 0 || t.ids.some(id => hits.has(id)));
      if (!th.length) return emptyHtml(2, 'No threads match that.',
        'Threads are the people, the places and the decades you have tagged. Try one of those names.');
    }
    if (!th.length) return emptyHtml(2, 'No threads yet.',
      'Tag a story with a person, a place or a decade and the family starts to join up. Tap a thread to hear everything it touches.');
    return th.map((t, i) => '<button class="thread rise" style="--i:' + i + '" data-act="thread" data-l="' + esc(t.label.toLowerCase()) + '">' +
      '<span class="tl">' + esc(t.label) + '</span><span class="tt">' + t.type + '</span>' +
      '<span class="tn">' + t.ids.length + '</span></button>').join('');
  }

  /* ---------------------------------------------------------------- ask - */
  function renderAsk() {
    const ts = Store.tellers();
    if (!ts.length) {
      $('#askList').innerHTML = emptyHtml(1, 'Nobody to ask yet.', 'Add the person whose voice you want to keep.',
        '<button class="btn" data-act="newteller">Add someone</button>');
      return;
    }
    let html = '';
    for (const t of ts) {
      const rest = resting(t);
      html += '<div class="askcard">';
      html += '<p class="when">' + esc(t.name) + (t.relation ? ' &middot; ' + esc(t.relation) : '') + '</p>';
      if (rest) {
        const skipped = t.skippedAt && t.skippedAt >= (t.answeredAt || 0);
        html += '<p class="aq">' + (skipped ? 'Skipped this week.' : 'Answered this week.') + '</p>' +
          '<p class="note" style="margin-top:-8px">The next question comes on ' +
          esc(Store.DAYS[t.ritual.day]) + ', ' + esc(Store.longDate(Store.nextDue(t))) + '.</p>' +
          '<div class="acts"><button class="btn quiet" data-act="asknow" data-id="' + t.id +
          '">Ask another now</button></div>';
      } else {
        const c = Store.current(t.id);
        if (c && c.empty) {
          html += '<p class="aq">Every question in their packs has been answered.</p>' +
            '<div class="acts"><button class="btn quiet" data-act="teller" data-id="' + t.id +
            '">Add another pack</button></div>';
        } else {
          if (c.fromId) {
            const p = Store.person(c.fromId);
            html += '<p class="from">' + esc(p ? p.name : 'The family') + ' asks:</p>';
          }
          html += '<p class="aq">' + esc(c.text) + '</p>';
          html += '<div class="acts">' +
            '<button class="btn" data-act="hand" data-id="' + t.id + '">Hand them the phone</button>' +
            '<button class="btn quiet" data-act="swap" data-id="' + t.id + '">Swap the question</button>' +
            '<button class="btn quiet" data-act="skip" data-id="' + t.id + '">Not this week</button>' +
            '</div>';
        }
      }
      html += '</div>';
    }

    html += '<h2>Questions from the family</h2>';
    const qs = Store.tellers().map(t => Store.queueFor(t.id).map(q => ({ q, t }))).reduce((a, b) => a.concat(b), []);
    if (qs.length) {
      html += qs.map(({ q, t }) => {
        const p = q.fromId && Store.person(q.fromId);
        return '<div class="qitem"><span class="qt">' + esc(q.text) +
          '<br><span class="tiny">' + (p ? esc(p.name) + ' asks ' : 'For ') + esc(t.name) + '</span></span>' +
          '<button class="btn quiet sm" data-act="dropq" data-id="' + q.id + '">Remove</button></div>';
      }).join('');
    } else {
      html += '<p class="note" style="margin-top:0">Nothing waiting. A question asked by name is the one they answer fastest.</p>';
    }
    html += '<div style="margin-top:14px"><button class="btn ghost wide" data-act="askform">Add a question</button></div>';

    html += '<h2>Question packs</h2>';
    html += Content.PACKS.map(p => '<button class="packrow" data-act="pack" data-id="' + p.id + '">' +
      '<span class="pn">' + esc(p.name) + '</span><p class="pb">' + esc(p.blurb) + '</p></button>').join('');
    $('#askList').innerHTML = html;
  }

  function resting(t) {
    return !!(t.answeredAt && Date.now() < Store.nextDue(t));
  }

  /* ------------------------------------------------------------- family - */
  function renderFamily() {
    const fam = Store.family();
    $('#famTitle').textContent = fam || 'Family';
    const st = Store.settings();
    let h = '';

    h += '<h2>Telling</h2>';
    for (const t of Store.tellers()) {
      const n = Store.storiesOf(t.id).length;
      const secs = Store.storiesOf(t.id).reduce((a, s) => a + s.dur, 0);
      h += '<button class="tellcard" data-act="teller" data-id="' + t.id + '">' +
        '<span class="tn">' + esc(t.name) + '</span>' +
        '<p class="td">' + esc([t.relation, t.birthYear ? 'born ' + t.birthYear : '', t.place]
          .filter(Boolean).join(' \u00B7 ')) + '</p>' +
        '<span class="ts"><span><b>' + n + '</b>' + (n === 1 ? 'story' : 'stories') + '</span>' +
        '<span><b>' + Math.round(secs / 60) + '</b>minutes</span>' +
        '<span><b>' + (t.consent ? 'Yes' : 'Not yet') + '</b>consent</span></span></button>';
    }
    h += '<button class="btn ghost wide" data-act="newteller">Add someone to record</button>';

    h += '<h2>Listening</h2>';
    const ppl = Store.people();
    if (ppl.length) {
      h += ppl.map(p => '<div class="person"><span class="grow"><span class="nm">' + esc(p.name) +
        '</span><br><span class="rl">' + (p.role === 'keeper' ? 'Keeper' : 'Listener') + '</span></span>' +
        '<button class="btn quiet sm" data-act="delperson" data-id="' + p.id + '">Remove</button></div>').join('');
    } else {
      h += '<p class="note" style="margin-top:0">Add the people who will listen. Their names are what the elder sees when somebody plays a story, and what a follow up question is signed with.</p>';
    }
    h += '<div style="margin-top:14px"><button class="btn ghost wide" data-act="newperson">Add a family member</button></div>';

    h += '<h2>This phone</h2>';
    h += tog('haptics', 'Haptics', 'A short tap when a story is kept.', st.haptics);
    h += tog('sound', 'Tape click', 'The one sound in the app, at the start and end of a recording.', st.sound);
    h += tog('speak', 'Read questions aloud', 'Shows a button in Elder Mode that speaks the question using this phone' + "'" + 's own voice.', st.speak);
    h += tog('notify', 'Weekly reminder', 'A notification at the ritual time, computed and stored on this phone.', st.notify);
    h += '<label class="fld" style="margin-top:18px"><span>Family name</span>' +
      '<input class="inp" id="famName" type="text" maxlength="46" placeholder="The Kapoor family" value="' + esc(fam) + '"></label>';

    h += '<h2>Getting it out</h2>';
    h += '<p class="note" style="margin-top:0">Export writes a zip into this phone' + "'" + 's Downloads folder: every recording, plus a manifest listing who told what and when. Android' + "'" + 's own automatic backup is switched off in this app on purpose, so nothing is copied to a cloud drive behind your back. That makes exporting the only copy. Keep one somewhere that is not a phone.</p>';
    h += '<div style="margin-top:12px"><button class="btn wide" data-act="export">' + icon('out') + 'Export the archive</button></div>';

    h += '<h2>What Heirloom does not do</h2>';
    h += '<p class="note" style="margin-top:0">It does not transcribe. Voices are the record; your titles, tags and marked moments are the index. ' +
      'It has no account, no cloud and no internet permission, so it cannot sync between phones or share a family space. ' +
      'Sharing happens by exporting files and sending them yourself. Sealed stories are held shut by this app on this phone, which is a promise rather than a lock.</p>';
    h += '<div style="margin-top:16px"><button class="btn danger wide" data-act="erase">Erase everything</button></div>';

    $('#famBody').innerHTML = h;
  }
  function tog(key, label, sub, on) {
    return '<div class="toggle"><span class="grow"><span class="tl">' + esc(label) + '</span>' +
      '<span class="ts">' + esc(sub) + '</span></span>' +
      '<button class="sw' + (on ? ' on' : '') + '" data-act="tog" data-k="' + key + '" aria-label="' +
      esc(label) + '"></button></div>';
  }

  /* ----------------------------------------------------------- keepsake - */
  function renderKeepsake() {
    const all = Store.stories();
    const year = new Date().getFullYear();
    const thisYear = all.filter(s => new Date(s.at).getFullYear() === year);
    const secs = all.reduce((a, s) => a + s.dur, 0);
    let h = '';
    const rings = Math.min(all.length, Content.TARGET);
    h += '<div class="meter"><div class="meter-art">' +
      ringsSvg(rings, { size: 190, max: Math.max(8, Math.min(rings + 2, Content.TARGET)),
                        sw: rings > 24 ? 0.85 : rings > 12 ? 1.05 : 1.3,
                        fade: true, ghost: true, seed: 3, nodot: true }) +
      '<p class="big"><span>' + all.length + '</span></p></div>' +
      '<p class="of">' + (all.length === 1 ? 'Story' : 'Stories') + ' kept, a ring for each. ' +
      (all.length >= Content.TARGET
        ? 'Past forty, which is enough to listen through end to end.'
        : 'Forty makes a keepsake you can listen to end to end.') + '</p></div>';

    h += '<h2>What is here</h2>';
    const longest = all.slice().sort((a, b) => b.dur - a.dur)[0];
    const w = Store.tagWeights();
    const topKey = Object.keys(w).sort((a, b) => w[b] - w[a])[0];
    let top = topKey;
    for (const st of all) {
      const hit = st.tags.find(tg => tg.label.toLowerCase() === topKey);
      if (hit) { top = hit.label; break; }
    }
    h += stat('Voices kept', new Set(all.map(x => x.tellerId)).size || 'None yet');
    h += stat('Total listening time', Store.durWords(secs));
    h += stat('This year', thisYear.length + (thisYear.length === 1 ? ' story' : ' stories'));
    h += stat('Longest story', longest ? Store.dur(longest.dur) : 'None yet');
    h += stat('Threads', Store.threads().length);
    h += stat('Subject that keeps coming back', top ? top.charAt(0).toUpperCase() + top.slice(1) : 'Too early to tell');

    h += '<h2>Milestones</h2>';
    h += Content.MILESTONES.map(m => '<div class="mile' + (all.length >= m.n ? ' hit' : '') + '">' +
      '<span class="n">' + m.n + '</span><span class="l">' + esc(m.label) + '</span></div>').join('');

    h += '<h2>Threads</h2>';
    const th = Store.threads().slice(0, 12);
    h += th.length
      ? '<div class="chiprow" style="flex-wrap:wrap;overflow:visible">' + th.map(t =>
          '<button class="chip tag" data-act="thread" data-l="' + esc(t.label.toLowerCase()) + '">' +
          esc(t.label) + ' ' + t.ids.length + '</button>').join('') + '</div>'
      : '<p class="note" style="margin-top:0">Tag a few stories with the people and places in them. Tap a thread later and the family assembles itself out of several voices.</p>';

    h += '<h2>Take it with you</h2>';
    h += '<p class="note" style="margin-top:0">The export is a zip holding every recording plus a manifest with the question, the teller, the date, the tags and the moments you marked. It includes private and sealed stories, because it is meant for keeping rather than showing.</p>';
    h += '<div style="margin-top:12px"><button class="btn wide" data-act="export">' + icon('out') + 'Export the archive</button></div>';
    if (Store.tellers().length > 1) h += '<div style="margin-top:10px"><button class="btn ghost wide" data-act="exportwho">Export one person</button></div>';
    h += '<h2>Bring one back</h2>';
    h += '<p class="note" style="margin-top:0">A new phone, or a copy from a sibling: restore a Heirloom zip and its stories join this archive. Stories already here are left alone.</p>';
    h += '<div style="margin-top:12px"><button class="btn ghost wide" data-act="import">' + icon('into') + 'Restore from an export</button></div>';
    h += '<p class="fld-note" id="importNote" hidden></p>';
    $('#keepBody').innerHTML = h;
  }
  const stat = (k, v) => '<div class="stat"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';

  /* -------------------------------------------------------- elder mode -- */
  function openElder(id) {
    const t = Store.teller(id); if (!t) return;
    elder = { tellerId: id, stage: t.consent ? 'home' : 'consent' };
    document.body.classList.remove('has-tabs');
    $('#tabs').hidden = true;
    VIEWS.forEach(x => { $('#v-' + x).hidden = true; });
    $('#onboard').hidden = true;
    $('#elder').hidden = false;
    renderElder();
  }
  /* Consent, home, recording, kept and the error screen replace each other under the same thumb,
     and their buttons are all near the middle. A tap that swaps the panel holds the next one off
     for the same moment a sheet does, so agreeing to be recorded cannot also start the recording. */
  let elderPanelShown = '';
  function elderPanel(which) {
    if (which !== elderPanelShown) { elderPanelShown = which; holdTaps(); }
    ['elderHome', 'elderConsent', 'elderRecording', 'elderDone', 'elderErr']
      .forEach(p => { $('#' + p).hidden = p !== which; });
  }
  function renderElder() {
    const t = Store.teller(elder.tellerId); if (!t) { setView('family'); return; }
    $('#elderFor').textContent = 'For ' + (t.relation || t.name);
    if (elder.stage === 'consent') { elderPanel('elderConsent'); return; }
    if (elder.stage === 'rec') { elderPanel('elderRecording'); return; }
    if (elder.stage === 'done') { elderPanel('elderDone'); return; }
    if (elder.stage === 'err') {
      $('#errSettings').hidden = !(elder.errRefused && micBlocked());
      elderPanel('elderErr'); return;
    }

    elderPanel('elderHome');
    const rest = resting(t);
    const c = rest ? null : Store.current(t.id);
    const from = c && c.fromId ? Store.person(c.fromId) : null;
    $('#elderFrom').hidden = !from;
    if (from) $('#elderFrom').textContent = from.name + ' asks:';
    if (rest) {
      const skipped = t.skippedAt && t.skippedAt >= (t.answeredAt || 0);
      $('#elderQ').textContent = skipped
        ? 'No question this week, then. There will be another on ' + Store.DAYS[t.ritual.day] + '.'
        : 'That is this week done. Thank you.';
      $('#elderRec').hidden = true;
      $('#elderSkip').hidden = true;
    } else if (c && c.empty) {
      $('#elderQ').textContent = 'No question waiting today.';
      $('#elderRec').hidden = true;
      $('#elderSkip').hidden = true;
    } else {
      $('#elderQ').textContent = c.text;
      $('#elderRec').hidden = false;
      $('#elderSkip').hidden = false;
    }
    /* No button means no hole: the rings they have already earned stand in its place. */
    const idle = $('#elderRec').hidden;
    $('#elderRest').hidden = !idle;
    if (idle) {
      const n = Store.storiesOf(t.id).length;
      $('#elderRest').innerHTML = ringsSvg(Math.min(n, 9),
        { size: 224, max: 9, sw: 1.5, fade: true, ghost: true, seed: 1 });
    }
    $('#elderQ').classList.toggle('long', ($('#elderQ').textContent || '').length > 118);
    const sp = $('#elderSpeak');
    sp.hidden = !(TTS && Store.settings().speak && !rest && c && !c.empty);
    sp.classList.remove('on');
    $('#elderReact').innerHTML = reactionLine(t);
  }

  function reactionLine(t) {
    const last = Store.storiesOf(t.id)[0];
    if (!last) return 'Your first story is the one everybody waits for.';
    const names = {};
    last.reactions.forEach(r => {
      const p = Store.person(r.personId);
      const n = p ? p.name : 'Someone';
      names[n] = (names[n] || 0) + 1;
    });
    const who = Object.keys(names);
    let out = '';
    if (last.plays > 0) {
      out += 'Your last story has been listened to ' +
        (last.plays === 1 ? 'once' : last.plays === 2 ? 'twice' : last.plays + ' times') + '. ';
    } else {
      out += 'Your last story is kept and waiting for them. ';
    }
    if (who.length) {
      out += '<b>' + who.map(esc).join(' and ') + '</b> left a heart.';
    }
    return out;
  }

  /* ------------------------------------------------------- recording --- */
  /* Android stops showing the microphone dialog after a second refusal, so from then on
     Try again can never succeed. When that has happened the card offers the one route left:
     this app's own settings page, where the switch still is. */
  function micBlocked() {
    try { return !!(window.Native && Native.micBlocked && Native.micBlocked()); } catch (e) { return false; }
  }

  /* One card carries three different failures, so it says which one it is. Telling somebody
     the microphone did not start when what happened is that they pressed Done too early is
     the kind of thing that stops an eighty year old trying again. */
  function elderError(line, msg, refused) {
    elder.stage = 'err'; finishing = false;
    elder.errRefused = !!refused;
    $('#errLine').textContent = line;
    $('#errMsg').textContent = msg;
    renderElder();
  }

  function startRecording() {
    if (!elder || elder.stage === 'rec' || Recorder.getState() !== 'idle') return;
    const t = Store.teller(elder.tellerId);
    const c = Store.current(t.id);
    if (!c || c.empty) return;
    elder.prompt = c;
    tape(true); buzz(24, 190);
    elder.stage = 'rec'; finishing = false; renderElder();
    $('#recQ').textContent = c.text;
    $('#recState').textContent = 'Opening the microphone'; $('#recState').classList.remove('paused');
    $('#recPause').textContent = 'Pause';
    $('#recTime').textContent = '0:00';
    wave = null;
    Recorder.start(() => { toast('Thirty minutes is the limit.'); finishRecording(); }).then(ok => {
      if (!ok) return;
      $('#recState').textContent = 'Recording';
      if (window.Native && Native.keepAwake) { try { Native.keepAwake(true); } catch (e) {} }
      loopWave();
      recTimer = setInterval(() => { $('#recTime').textContent = Store.dur(Recorder.elapsed()); }, 250);
    }).catch(err => {
      elderError('The microphone did not start.', err.message, err && err.refused);
    });
  }

  /* The voice draws a ring. One turn of the ring is a minute, and each minute starts a new
     ring further out, so a ten minute story is ten rings, like the ones on the launcher icon.
     The disc rescales as the rings accumulate so that even a thirty minute story stays inside
     it; finished rings are kept as points and re-struck onto an offscreen layer only when the
     scale changes, so the frame loop draws one ring, not thirty. */
  const RING = { turn: 60, base: 0.15, span: 0.34, min: 8, amp: 0.055, step: Math.PI / 120 };
  const ringScale = n => Math.max(RING.min, n + 1);

  function paintRings(w, M) {
    const o = w.off.getContext('2d');
    o.clearRect(0, 0, w.w, w.h);
    o.strokeStyle = w.gold; o.lineWidth = 2; o.lineJoin = 'round'; o.globalAlpha = 0.9;
    w.done.forEach((pts, r) => {
      if (pts.length < 2) return;
      o.beginPath();
      pts.forEach((p, i) => { const q = ringPoint(w, r, M, p[0], p[1]); i ? o.lineTo(q[0], q[1]) : o.moveTo(q[0], q[1]); });
      o.closePath(); o.stroke();
    });
    w.scale = M;
  }
  function ringRadius(w, r, M) { return w.R * (RING.base + RING.span * (r + 1) / (M + 1)); }
  function ringPoint(w, r, M, ang, lv) {
    const amp = Math.min(w.R * RING.amp, w.R * RING.span / (M + 1) * 0.8);
    const rr = ringRadius(w, r, M) + lv * amp * (0.55 + 0.45 * Math.abs(wobble(ang, MARK_SEED + r)));
    return [w.w / 2 + Math.cos(ang - Math.PI / 2) * rr, w.h / 2 + Math.sin(ang - Math.PI / 2) * rr];
  }

  function loopWave() {
    const c = $('#recWave');
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = c.clientWidth || 264, h = c.clientHeight || 264;
    if (!wave || wave.w !== w || wave.dpr !== dpr) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const off = document.createElement('canvas');
      off.width = c.width; off.height = c.height;
      off.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      const st = getComputedStyle(document.documentElement);
      const kept = wave ? wave.done : [];
      wave = { w, h, dpr, off, R: Math.min(w, h), done: kept, pts: [], ring: kept.length, ang: -9, scale: 0,
               gold: st.getPropertyValue('--gold-deep').trim() || '#A56F14',
               ink: st.getPropertyValue('--accent').trim() || '#7C4F12' };
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = w / 2, cy = h / 2;
    const t = Recorder.elapsed();
    const ring = Math.floor(t / RING.turn);
    const level = Recorder.getState() === 'recording' ? Recorder.level() : 0;

    /* A ring finished since the last frame is filed away. */
    let filed = false;
    while (ring > wave.ring) { wave.done.push(wave.pts); wave.pts = []; wave.ring++; wave.ang = -9; filed = true; }
    const M = ringScale(ring);
    if (filed || M !== wave.scale) paintRings(wave, M);

    const ang = ((t % RING.turn) / RING.turn) * Math.PI * 2;
    if (ang - wave.ang >= RING.step) { wave.pts.push([ang, level]); wave.ang = ang; }

    ctx.clearRect(0, 0, w, h);
    /* the rings still to come, so the disc reads as a disc from the first second */
    ctx.strokeStyle = wave.ink; ctx.globalAlpha = 0.14; ctx.lineWidth = 1;
    for (let r = 0; r < M; r++) { ctx.beginPath(); ctx.arc(cx, cy, ringRadius(wave, r, M), 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.drawImage(wave.off, 0, 0, w, h);
    if (wave.pts.length > 1) {
      ctx.strokeStyle = wave.gold; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      wave.pts.forEach((p, i) => { const q = ringPoint(wave, ring, M, p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
      ctx.stroke();
      const head = ringPoint(wave, ring, M, ang, level);
      /* the arm that is cutting the ring, so the disc is visibly being written from the first second */
      ctx.strokeStyle = wave.ink; ctx.globalAlpha = 0.28; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(head[0], head[1]); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = wave.ink; ctx.beginPath(); ctx.arc(head[0], head[1], 3.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = wave.ink; ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill();
    waveRaf = requestAnimationFrame(loopWave);
  }
  function stopWave() {
    if (waveRaf) cancelAnimationFrame(waveRaf); waveRaf = 0;
    if (recTimer) clearInterval(recTimer); recTimer = 0;
    if (window.Native && Native.keepAwake) { try { Native.keepAwake(false); } catch (e) {} }
  }

  function togglePause() {
    if (Recorder.getState() === 'recording') {
      Recorder.pause();
      $('#recState').textContent = 'Paused'; $('#recState').classList.add('paused');
      $('#recPause').textContent = 'Carry on';
    } else {
      Recorder.resume();
      $('#recState').textContent = 'Recording'; $('#recState').classList.remove('paused');
      $('#recPause').textContent = 'Pause';
    }
    buzz(14, 120);
  }

  function finishRecording() {
    if (finishing || !elder || elder.stage !== 'rec') return;
    finishing = true;
    stopWave(); tape(false);
    $('#recState').textContent = 'Keeping it'; $('#recState').classList.add('paused');
    $('#recDone').disabled = true; $('#recPause').disabled = true;
    Recorder.stop().then(out => {
      $('#recDone').disabled = false; $('#recPause').disabled = false;
      if (!out || !out.blob || out.blob.size < 500 || out.dur < 1) {
        elderError('That was too short to keep.',
          'Press the button, then talk for a little while before pressing Done.');
        return;
      }
      const t = Store.teller(elder.tellerId);
      const c = elder.prompt || Store.current(t.id);
      return Store.addStory({
        tellerId: t.id, promptId: c.promptId, question: c.text, label: c.label,
        fromId: c.fromId, queueId: c.queueId, dur: out.dur, mime: out.mime
      }, out.blob).then(s => {
        Store.updateTeller(t.id, { answeredAt: Date.now() });
        buzz(18, 200);
        setTimeout(() => buzz(26, 220), 130);
        elder.stage = 'done'; elder.lastStory = s.id; finishing = false;
        $('#doneMark').innerHTML = ringsSvg(Math.min(Store.storiesOf(t.id).length, 7), { size: 96, max: 7, sw: 1.6, fade: true });
        $('#doneLine').textContent = 'Kept.';
        $('#doneSub').textContent = Store.durWords(out.dur) + ' of ' + t.name +
          ', saved on this phone. The family will hear it.';
        renderElder();
        reschedule();
      });
    }).catch(() => {
      $('#recDone').disabled = false; $('#recPause').disabled = false;
      elderError('It could not be saved.',
        'There was no room on this phone to keep the recording, so nothing was kept. Try again once there is space.');
    });
  }

  function discardRecording() {
    stopWave();
    Recorder.cancel();
    finishing = false;
    elder.stage = 'home';
    renderElder();
  }

  /* --------------------------------------------------------- the sheet - */
  /* A sheet moving under a thumb that is already tapping again must not let the second tap
     land on whatever is underneath, whether that is the screen the sheet covered or, when a
     short sheet replaces a tall one, the scrim beside it. Only a tap arms this; opening or
     closing a sheet from the shell or from code does not. */
  let swallowUntil = 0, inTap = false;
  const holdTaps = () => { if (inTap) swallowUntil = Date.now() + 280; };
  function openSheet(kind, arg) {
    sheets.push({ kind, arg });
    holdTaps();
    paintSheet();
  }
  function closeSheet(all) {
    if (all) sheets = []; else sheets.pop();
    painted = '';
    holdTaps();
    if (!sheets.length) { $('#sheet').hidden = true; stopPlayer(); }
    else paintSheet();
    if (!sheets.length) render();
  }
  let painted = '';
  function paintSheet() {
    const s = sheets[sheets.length - 1];
    const panel = $('.sheet-panel');
    /* Adding a tag repaints the sheet. Keeping the scroll position means the tag row
       does not jump back to the top of a long story every time. */
    const id = s.kind + '|' + (s.arg && s.arg.id ? s.arg.id : String(s.arg));
    const keep = id === painted ? panel.scrollTop : 0;
    painted = id;
    $('#sheet').hidden = false;
    $('#sheetBody').innerHTML = SHEETS[s.kind](s.arg);
    panel.scrollTop = keep;
    if (s.kind === 'story') {
      if (player.id !== s.arg) mountPlayer(s.arg);
      else if (player.audio) playClass(!player.audio.paused);
    }
  }

  const SHEETS = {
    story: id => {
      const s = Store.story(id); if (!s) return '';
      const t = Store.teller(s.tellerId);
      const isSealed = Store.sealed(s);
      let h = '<p class="sheet-q">' + esc(s.question) + '</p>';
      h += '<p class="sheet-meta">' + esc(t ? t.name : '') + ' &middot; ' + esc(Store.longDate(s.at)) +
        ' &middot; ' + Store.dur(s.dur) +
        (s.askedBy && Store.person(s.askedBy) ? ' &middot; asked by ' + esc(Store.person(s.askedBy).name) : '') + '</p>';

      if (Store.sealOpened(s)) {
        h += '<p class="note seal-open">The seal opened on ' + esc(Store.longDate(new Date(s.sealUntil + 'T00:00:00').getTime())) + '. It plays like any other story now.</p>';
      }
      if (isSealed) {
        h += '<div class="card"><p class="q" style="font-size:20px;margin:0 0 8px">Sealed until ' +
          esc(Store.longDate(new Date(s.sealUntil + 'T00:00:00').getTime())) + '.</p>' +
          '<p class="tiny" style="margin:0">This app will not play it before then. That is a promise kept by this app on this phone, not encryption: the file is in the export like any other.</p>' +
          '<div style="margin-top:14px"><button class="btn quiet sm" data-act="unseal" data-id="' + s.id + '">Unseal it now</button></div></div>';
      } else {
        h += '<div class="player"><div class="prow">' +
          '<button class="play" id="playBtn" data-act="play" data-id="' + s.id + '" aria-label="Play"></button>' +
          '<div class="scrub" id="scrub" data-act="seek" data-id="' + s.id + '">' +
          '<span class="line"></span><span class="fill" id="fill"></span>' +
          s.moments.map(m => '<span class="tick" style="left:' +
            Math.min(99, (m.t / Math.max(1, s.dur)) * 100) + '%"></span>').join('') +
          '</div></div>' +
          '<div class="ptime"><span id="pnow">0:00</span><span>' + Store.dur(s.dur) + '</span></div>' +
          '<p class="fld-err" id="playErr" hidden></p>' +
          '<div style="margin-top:12px"><button class="btn ghost sm" data-act="mark" data-id="' + s.id +
          '">Mark this moment</button></div></div>';
      }

      if (s.moments.length) {
        h += '<h2>Moments</h2>';
        h += s.moments.map((m, i) => '<div class="moment">' +
          '<span class="mt" data-act="jump" data-t="' + m.t + '">' + Store.dur(m.t) + '</span>' +
          '<span class="mn">' + esc(m.note || 'Marked') + '</span>' +
          '<button class="btn quiet sm iconbtn" data-act="delmoment" data-id="' + s.id + '" data-i="' + i + '" aria-label="Remove this moment">' + icon('close') + '</button>' +
          '</div>').join('');
      }

      h += '<h2>Title and notes</h2>';
      h += '<label class="fld"><span>Title</span><input class="inp" data-act="title" data-id="' + s.id +
        '" type="text" maxlength="70" placeholder="' + esc(s.label || 'A title for the archive') +
        '" value="' + esc(s.title) + '"></label>';
      h += '<label class="fld"><span>Notes</span><textarea class="inp" data-act="notes" data-id="' + s.id +
        '" maxlength="600" placeholder="Who is in it, what he meant, anything you want the next generation to know.">' + esc(s.notes) + '</textarea></label>';

      h += '<h2>Tags</h2>';
      h += '<div class="chiprow" style="flex-wrap:wrap;overflow:visible">' +
        (s.tags.length ? s.tags.map((tg, i) => '<button class="chip tag" data-act="deltag" data-id="' + s.id +
          '" data-i="' + i + '">' + esc(tg.label) + icon('close', 'x') + '</button>').join('')
          : '<span class="tiny">No tags yet. A person, a place and a decade is enough.</span>') + '</div>';
      h += '<div class="fld-row" style="margin-top:12px">' +
        '<select class="inp" id="tagType"><option value="person">Person</option>' +
        '<option value="place">Place</option><option value="decade">Decade</option></select>' +
        '<input class="inp" id="tagLabel" type="text" maxlength="32" placeholder="Uncle Dev"></div>' +
        '<div style="margin-top:10px"><button class="btn ghost sm" data-act="addtag" data-id="' + s.id + '">Add tag</button></div>';
      h += '<div class="chiprow" style="flex-wrap:wrap;overflow:visible;margin-top:10px">' +
        Content.DECADES.map(d => '<button class="chip" data-act="quicktag" data-id="' + s.id +
          '" data-l="' + d + '">' + d + '</button>').join('') + '</div>';

      h += '<h2>Who this is for</h2>';
      h += '<div class="chiprow" style="flex-wrap:wrap;overflow:visible">' +
        vis(s, 'family', 'The family') + vis(s, 'private', 'Private') + vis(s, 'sealed', 'Sealed') + '</div>';
      if (s.visibility === 'sealed') {
        h += '<label class="fld" style="margin-top:12px"><span>Open on</span>' +
          '<input class="inp" type="date" data-act="sealdate" data-id="' + s.id + '" value="' +
          esc(s.sealUntil || '') + '"></label>';
      }
      h += '<p class="tiny">Private hides it from the timeline until you switch private stories back on. It is a curtain, not a lock.</p>';

      h += '<h2>Reactions</h2>';
      const ppl = Store.people();
      if (ppl.length) {
        h += '<div class="chiprow" style="flex-wrap:wrap;overflow:visible">' + ppl.map(p =>
          '<button class="chip" data-act="heart" data-id="' + s.id + '" data-p="' + p.id + '">' +
          esc(p.name) + ' left a heart</button>').join('') + '</div>';
      } else {
        h += '<p class="note" style="margin-top:0">Add family members on the Family screen and their hearts show up on the elder' + "'" + 's own screen.</p>';
      }
      if (s.reactions.length) {
        h += '<p class="tiny" style="margin-top:10px">' + esc(s.reactions.map(r =>
          (Store.person(r.personId) || { name: 'Someone' }).name).join(', ')) + '</p>';
      }

      h += '<h2>Keep the thread going</h2>';
      h += '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<button class="btn ghost sm" data-act="followup" data-id="' + s.id + '">Ask a follow up</button>' +
        '<button class="btn ghost sm" data-act="exportone" data-id="' + s.id + '">Export this story</button>' +
        '<button class="btn danger sm" data-act="delstory" data-id="' + s.id + '">Delete</button></div>';
      return h;
    },

    teller: id => {
      const t = Store.teller(id); if (!t) return '';
      const n = Store.storiesOf(id).length;
      let h = '<p class="sheet-q">' + esc(t.name) + '</p>';
      h += '<p class="sheet-meta">' + esc([t.relation, t.birthYear ? 'born ' + t.birthYear : '', t.place]
        .filter(Boolean).join(' · ')) + '</p>';
      h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">' +
        '<button class="btn" data-act="hand" data-id="' + id + '">Hand them the phone</button>' +
        (n ? '<button class="btn quiet sm" data-act="filtteller" data-id="' + id + '">See their ' + n + ' stories</button>' : '') +
        '</div>';
      h += '<label class="fld"><span>Name</span><input class="inp" data-act="tset" data-k="name" data-id="' +
        id + '" value="' + esc(t.name) + '" maxlength="40"></label>';
      h += '<label class="fld"><span>What the family calls them</span><input class="inp" data-act="tset" data-k="relation" data-id="' +
        id + '" value="' + esc(t.relation) + '" maxlength="30"></label>';
      h += '<div class="fld-row"><label class="fld"><span>Born</span><input class="inp" type="number" data-act="tset" data-k="birthYear" data-id="' +
        id + '" value="' + (t.birthYear || '') + '"></label>' +
        '<label class="fld"><span>Grew up in</span><input class="inp" data-act="tset" data-k="place" data-id="' +
        id + '" value="' + esc(t.place) + '" maxlength="40"></label></div>';
      h += '<div class="fld"><span>Question packs</span><div class="chiprow" style="flex-wrap:wrap;overflow:visible">' +
        Content.PACKS.filter(p => p.id !== 'core').map(p => '<button class="chip' +
          (t.packs.indexOf(p.id) >= 0 ? ' on' : '') + '" data-act="tpack" data-id="' + id + '" data-p="' +
          p.id + '">' + esc(p.name) + '</button>').join('') + '</div></div>';
      h += '<div class="fld-row"><label class="fld"><span>Ask them on</span><select class="inp" data-act="tday" data-id="' +
        id + '">' + Store.DAYS.map((d, i) => '<option value="' + i + '"' +
          (t.ritual.day === i ? ' selected' : '') + '>' + d + '</option>').join('') + '</select></label>' +
        '<label class="fld"><span>At</span><input class="inp" type="time" data-act="ttime" data-id="' +
        id + '" value="' + esc(t.ritual.time) + '"></label></div>';
      h += '<h2>Consent</h2>';
      h += t.consent
        ? '<p class="note" style="margin-top:0">' + esc(t.name) + ' agreed to be recorded on ' +
          esc(Store.longDate(t.consent.at)) + '. It is shown again on their screen whenever you want, and they can withdraw it by asking you to delete a story or all of them.</p>'
        : '<p class="note" style="margin-top:0">Not given yet. The consent card is the first thing they see in Elder Mode, in large type, and nothing records until they agree.</p>';
      h += '<div style="margin-top:20px"><button class="btn danger wide" data-act="delteller" data-id="' + id +
        '">Remove ' + esc(t.name) + ' and their stories</button></div>';
      return h;
    },

    newteller: () => {
      let h = '<p class="sheet-q">Who else should be asked?</p>';
      h += '<label class="fld"><span>Their name</span><input class="inp" id="ntName" maxlength="40" placeholder="Sarla"></label>';
      h += '<label class="fld"><span>What the family calls them</span><input class="inp" id="ntRel" maxlength="30" placeholder="Nani"></label>';
      h += '<div class="fld-row"><label class="fld"><span>Born</span><input class="inp" id="ntYear" type="number" placeholder="1941"></label>' +
        '<label class="fld"><span>Grew up in</span><input class="inp" id="ntPlace" maxlength="40" placeholder="Lucknow"></label></div>';
      h += '<div class="fld"><span>Question packs</span><div class="chiprow" id="ntPacks" style="flex-wrap:wrap;overflow:visible">' +
        Content.PACKS.filter(p => p.id !== 'core').map(p => '<button class="chip" data-act="ntpack" data-p="' +
          p.id + '">' + esc(p.name) + '</button>').join('') + '</div></div>';
      h += '<p class="tiny">Two people can be asked the same question in the same week. Hearing both answers to how they met is the thing families keep forever.</p>';
      h += '<div style="margin-top:18px"><button class="btn wide" data-act="ntsave">Add them</button></div>';
      return h;
    },

    newperson: () => '<p class="sheet-q">Who is listening?</p>' +
      '<p class="sheet-meta">Names only. Nothing is sent anywhere and there is nothing to sign up for.</p>' +
      '<label class="fld"><span>Name</span><input class="inp" id="npName" maxlength="32" placeholder="Zoe"></label>' +
      '<div class="fld"><span>Role</span><div class="chiprow" id="npRole" style="overflow:visible">' +
      '<button class="chip on" data-act="nprole" data-r="listener">Listener</button>' +
      '<button class="chip" data-act="nprole" data-r="keeper">Keeper</button></div></div>' +
      '<p class="tiny">A keeper looks after the archive. A listener hears the stories and can ask questions by name.</p>' +
      '<div style="margin-top:18px"><button class="btn wide" data-act="npsave">Add them</button></div>',

    marknote: arg => '<p class="sheet-q">Mark this moment</p>' +
      '<p class="sheet-meta">At ' + Store.dur(arg.t) + '. A few words is plenty. Marked moments are searchable.</p>' +
      '<label class="fld"><span>What happens here</span><input class="inp" id="mkNote" maxlength="80" placeholder="He laughs about the puppy"></label>' +
      '<div style="margin-top:16px"><button class="btn wide" data-act="marksave" data-id="' + arg.id +
      '" data-t="' + arg.t + '">Mark it</button></div>',

    packs: id => {
      const p = Content.PACKS.find(x => x.id === id);
      const ts = Store.tellers();
      if (!sheetTeller && ts.length === 1) sheetTeller = ts[0].id;
      const t = Store.teller(sheetTeller);
      const list = Content.PROMPTS.filter(x => x.pack === id);
      let h = '<p class="sheet-q">' + esc(p.name) + '</p><p class="sheet-meta">' + esc(p.blurb) +
        ' ' + list.length + ' questions.</p>';
      if (!t && ts.length > 1) {
        h += '<div class="fld"><span>Ask which of them</span><div class="chiprow" style="flex-wrap:wrap;overflow:visible">' +
          ts.map(x => '<button class="chip" data-act="pickteller" data-id="' + x.id + '">' + esc(x.name) +
            '</button>').join('') + '</div></div>';
      }
      if (t) h += '<p class="tiny" style="margin-bottom:14px">Tap one and it becomes the question waiting for ' +
        esc(t.name) + '.</p>';
      h += list.map(x => '<button class="promptrow" data-act="setprompt" data-id="' + x.id + '">' +
        esc(x.text) + '</button>').join('');
      return h;
    },

    swap: id => {
      const t = Store.teller(id);
      const w = Store.tagWeights(id);
      const pool = Content.eligible(t).filter(p => t.used.indexOf(p.id) < 0);
      const picks = [];
      for (let i = 1; i <= 6 && picks.length < 6; i++) {
        const p = Content.pick(t, Store.weekIndex(t) + i * 37, t.used.concat(picks.map(x => x.id)), t.skipped, w);
        if (p) picks.push(p);
      }
      const firsts = Store.storiesOf(id).length === 0
        ? Content.FIRST_QUESTIONS.map(Content.byId).filter(p => t.used.indexOf(p.id) < 0)
        : [];
      let h = '<p class="sheet-q">A different question for ' + esc(t.name) + '</p>';
      if (firsts.length) {
        h += '<h2>Good first questions</h2>' + firsts.map(p =>
          '<button class="promptrow" data-act="setprompt" data-id="' + p.id + '">' + esc(p.text) + '</button>').join('');
      }
      h += '<h2>Suggested for them</h2>';
      h += picks.length
        ? picks.map(p => '<button class="promptrow" data-act="setprompt" data-id="' + p.id + '">' +
            esc(p.text) + '</button>').join('')
        : '<p class="note" style="margin-top:0">' + esc(t.name) + ' has answered every question in the packs they are on. Add another pack below, or write one yourself on the Ask screen.</p>';
      h += '<h2>All packs</h2>';
      h += Content.PACKS.filter(p => p.id === 'core' || t.packs.indexOf(p.id) >= 0).map(p =>
        '<button class="packrow" data-act="pack" data-id="' + p.id + '"><span class="pn">' + esc(p.name) +
        '</span><p class="pb">' + esc(p.blurb) + '</p></button>').join('');
      h += '<p class="tiny" style="margin-top:14px">' + pool.length + ' questions left for ' + esc(t.name) + '.</p>';
      return h;
    },

    askform: arg => {
      const ts = Store.tellers(), ppl = Store.people();
      let h = '<p class="sheet-q">Ask them something</p>';
      h += '<p class="sheet-meta">A question with a name on it gets answered. Theirs will say who asked.</p>';
      h += '<label class="fld"><span>The question</span><textarea class="inp" id="qText" maxlength="220" placeholder="What music did you dance to?"></textarea></label>';
      h += '<div class="fld"><span>Ask</span><div class="chiprow" id="qWho" style="flex-wrap:wrap;overflow:visible">' +
        ts.map((t, i) => '<button class="chip' + (i === 0 ? ' on' : '') + '" data-act="qwho" data-id="' +
          t.id + '">' + esc(t.name) + '</button>').join('') + '</div></div>';
      if (ppl.length) {
        h += '<div class="fld"><span>From</span><div class="chiprow" id="qFrom" style="flex-wrap:wrap;overflow:visible">' +
          ppl.map((p, i) => '<button class="chip' + (i === 0 ? ' on' : '') + '" data-act="qfrom" data-id="' +
            p.id + '">' + esc(p.name) + '</button>').join('') + '</div></div>';
      } else {
        h += '<p class="tiny">Add family members on the Family screen and their names appear on the question.</p>';
      }
      h += '<div style="margin-top:18px"><button class="btn wide" data-act="qsave">Put it at the front of the queue</button></div>';
      return h;
    },

    followup: id => {
      const s = Store.story(id);
      const t = Store.teller(s.tellerId);
      const ppl = Store.people();
      let h = '<p class="sheet-q">Ask ' + esc(t.name) + ' more</p>';
      h += '<p class="sheet-meta">Following: ' + esc(s.question) + '</p>';
      h += '<label class="fld"><span>The follow up</span><textarea class="inp" id="fuText" maxlength="220" placeholder="You mentioned the dance hall. What music did you dance to?"></textarea></label>';
      if (ppl.length) {
        h += '<div class="fld"><span>From</span><div class="chiprow" id="fuFrom" style="flex-wrap:wrap;overflow:visible">' +
          ppl.map((p, i) => '<button class="chip' + (i === 0 ? ' on' : '') + '" data-act="qfrom" data-id="' +
            p.id + '">' + esc(p.name) + '</button>').join('') + '</div></div>';
      }
      h += '<div style="margin-top:18px"><button class="btn wide" data-act="fusave" data-id="' + id +
        '">Add it to the queue</button></div>';
      return h;
    },

    exportwho: () => '<p class="sheet-q">Export one person</p>' +
      '<p class="sheet-meta">A smaller zip, one voice in it.</p>' +
      Store.tellers().map(t => { const n = Store.storiesOf(t.id).length;
        return '<button class="packrow" data-act="exportteller" data-id="' + t.id +
          '"><span class="pn">' + esc(t.name) + '</span><p class="pb">' + n +
          (n === 1 ? ' story' : ' stories') + '</p></button>'; }).join(''),

    confirm: arg => '<p class="sheet-q">' + esc(arg.title) + '</p>' +
      '<p class="sheet-meta">' + esc(arg.body) + '</p>' +
      '<div style="display:flex;gap:10px;margin-top:10px">' +
      '<button class="btn quiet grow" data-act="cancel">' + esc(arg.no || 'Keep it') + '</button>' +
      '<button class="btn ' + (arg.danger ? 'danger' : '') + ' grow" data-act="confirmyes">' +
      esc(arg.yes) + '</button></div>'
  };
  let sheetTeller = null;
  let ntPacks = [], npRole = 'listener', qWho = null, qFrom = null, confirmFn = null;

  /* --------------------------------------------------------- the player - */
  /* One tap can only ask for one load. Without this a second tap while the recording is
     still being read off the database arrives as a pause on top of the first tap's play. */
  let pendingPlay = null;
  function stopPlayer() {
    if (player.raf) cancelAnimationFrame(player.raf);
    if (player.audio) { player.audio.pause(); player.audio.src = ''; }
    if (player.url) URL.revokeObjectURL(player.url);
    player = { audio: null, id: null, url: null, raf: 0, loading: null };
    pendingPlay = null;
  }
  /* The button follows the audio element rather than the tap, so it can never say
     playing while the recording is stopped. */
  function playClass(on) { const b = $('#playBtn'); if (b) b.classList.toggle('playing', on); }
  function playErr(msg) {
    const e = $('#playErr'); if (!e) return;
    e.textContent = msg; e.hidden = false;
  }
  /** Loads the story's audio once. Resolves with the element, or null when the recording is gone. */
  function mountPlayer(id) {
    const s = Store.story(id);
    if (!s || Store.sealed(s)) return Promise.resolve(null);
    if (player.id === id && player.loading) return player.loading;
    stopPlayer();
    const loading = Store.getAudio(id).then(blob => {
      if (player.id !== id) return null;
      if (!blob) { playErr('The recording for this story is not on this phone. Only its notes and tags are.'); player.loading = null; return null; }
      const url = URL.createObjectURL(blob);
      const a = new Audio();
      a.src = url; a.preload = 'metadata';
      a.addEventListener('loadedmetadata', () => {
        if (!isFinite(a.duration)) {
          a.currentTime = 1e6;
          const fix = () => { a.removeEventListener('timeupdate', fix); try { a.currentTime = 0; } catch (e) {} };
          a.addEventListener('timeupdate', fix);
        }
      });
      a.addEventListener('play', () => {
        playClass(true);
        const e = $('#playErr'); if (e) e.hidden = true;
        if (a.currentTime < 1) Store.played(id);
      });
      a.addEventListener('pause', () => playClass(false));
      a.addEventListener('ended', () => playClass(false));
      a.addEventListener('error', () => playErr('That recording could not be played.'));
      player = { audio: a, id, url, raf: 0, loading: null };
      loopPlayer();
      return a;
    }).catch(() => { playErr('That recording could not be read.'); return null; });
    player = { audio: null, id, url: null, raf: 0, loading };
    return loading;
  }
  function loopPlayer() {
    const s = Store.story(player.id);
    const f = $('#fill'), n = $('#pnow');
    if (f && player.audio && s) {
      const d = isFinite(player.audio.duration) && player.audio.duration > 0 ? player.audio.duration : s.dur;
      f.style.width = Math.min(100, (player.audio.currentTime / Math.max(0.1, d)) * 100) + '%';
      if (n) n.textContent = Store.dur(player.audio.currentTime);
    }
    player.raf = requestAnimationFrame(loopPlayer);
  }
  /* Two taps inside the same third of a second are one tap, the way they are everywhere else in
     this app. Without it a nervous thumb started the recording and stopped it again, and the
     pause cancelled the play, which the browser reports as a failure the person never caused. */
  let lastToggle = 0;
  function togglePlay(id) {
    if (!player.audio || player.id !== id) {
      if (pendingPlay === id) return;
      pendingPlay = id;
      const b = $('#playBtn'); if (b) b.classList.add('loading');
      mountPlayer(id).then(a => {
        if (pendingPlay === id) pendingPlay = null;
        const btn = $('#playBtn'); if (btn) btn.classList.remove('loading');
        if (a && player.id === id) { lastToggle = 0; togglePlay(id); }
      });
      return;
    }
    if (Date.now() - lastToggle < 320) return;
    lastToggle = Date.now();
    if (player.audio.paused) {
      player.audio.play().catch(err => {
        if (err && err.name === 'AbortError') return;
        playErr('That recording could not be played.');
      });
    } else player.audio.pause();
  }

  /* -------------------------------------------------------------- files - */
  function b64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] || '');
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  function saveOut(blob, name, mime) {
    if (window.Native && Native.saveFile) {
      if (blob.size > 60 * 1024 * 1024) {
        toast('That is too big to hand to Android in one piece. Export one person, or one story.');
        return;
      }
      b64(blob).then(data => {
        let uri = '';
        try { uri = Native.saveFile(name, mime, data); } catch (e) { uri = ''; }
        if (!uri) { toast('The file could not be written.'); return; }
        toast('Saved to Downloads as ' + name);
        if (Native.shareUri) { try { Native.shareUri(uri, mime); } catch (e) {} }
      }).catch(() => toast('The file could not be written.'));
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Downloaded ' + name);
    }
  }
  function exportAll(list, label, btn) {
    if (!(list || Store.stories()).length) { toast('Nothing to export yet.'); return; }
    const done = busy(btn, 'Building the archive');
    Store.exportArchive(list).then(zip => {
      saveOut(zip, 'heirloom-' + (label || 'archive') + '-' + Store.ymd(new Date()) + '.zip', 'application/zip');
    }).catch(() => toast('The archive could not be built.')).then(done);
  }
  function importFile(file) {
    if (!file) return;
    const say = (msg, bad) => { const n = $('#importNote'); if (n) { n.textContent = msg; n.hidden = false; n.classList.toggle('fld-err', !!bad); } };
    const done = busy($('[data-act="import"]'), 'Reading the export');
    file.arrayBuffer().then(buf => Store.importArchive(buf)).then(r => {
      done();
      reschedule();
      renderKeepsake();
      const n = r.stories;
      say(n ? n + (n === 1 ? ' story' : ' stories') + ' restored' + (r.tellers ? ', ' + r.tellers + (r.tellers === 1 ? ' teller' : ' tellers') : '') +
        (r.skipped ? '. ' + r.skipped + ' already here, left as they were.' : '.')
        : 'Nothing new in that file. ' + (r.skipped ? 'Every story in it is already here.' : 'It holds no stories.'));
      if (n) toast(n + (n === 1 ? ' story is' : ' stories are') + ' back in the archive.');
    }).catch(e => {
      done();
      const why = e && e.message;
      say(why === 'notheirloom' ? 'That file is not a Heirloom export. It needs the manifest the app writes.'
        : why === 'method' ? 'That zip was re-packed with compression this app cannot read. Export it from Heirloom again.'
        : 'That file could not be read as an export.', true);
    });
  }

  /* ------------------------------------------------------- reminders ---- */
  function reschedule() {
    const st = Store.settings();
    if (!(window.Native && Native.scheduleNotifications)) return;
    try {
      if (!st.notify) { Native.cancelNotifications(); return; }
      Native.scheduleNotifications(JSON.stringify(Store.schedule()));
    } catch (e) {}
  }

  /* --------------------------------------------------------- delegation - */
  const ACTS = {
    go: (el) => setView(el.dataset.v),
    filt: (el) => {
      const k = el.dataset.k;
      if (k === 'all') { filter.teller = null; filter.tag = null; }
      else if (k === 'teller') { filter.teller = el.dataset.id; filter.tag = null; }
      else if (k === 'private') filter.showPrivate = !filter.showPrivate;
      renderArchive();
    },
    thread: (el) => { filter.tag = el.dataset.l; filter.teller = null; mode = 'timeline'; closeSheet(true); setView('archive'); },
    story: (el) => openSheet('story', el.dataset.id),
    teller: (el) => openSheet('teller', el.dataset.id),
    newteller: () => { ntPacks = []; openSheet('newteller'); },
    newperson: () => { npRole = 'listener'; openSheet('newperson'); },
    hand: (el) => { closeSheet(true); openElder(el.dataset.id); },
    asknow: (el) => { holdTaps(); Store.updateTeller(el.dataset.id, { answeredAt: null }); renderAsk(); },
    swap: (el) => { sheetTeller = el.dataset.id; openSheet('swap', el.dataset.id); },
    skip: (el) => {
      const t = Store.teller(el.dataset.id);
      const c = Store.current(t.id);
      confirmFn = () => { Store.skipWeek(t.id); renderAsk(); toast('Skipped. A different question is waiting.'); };
      openSheet('confirm', { title: 'Skip this question?', yes: 'Skip it', no: 'Keep it',
        body: c && c.queueId
          ? 'A question from the family waits a week and comes back. A different one comes up now.'
          : 'This one goes to the back and a different one comes up. Skipping is information, not failure: the engine notices what does not land.' });
    },
    pack: (el) => { if (!sheets.length) sheetTeller = null; openSheet('packs', el.dataset.id); },
    pickteller: (el) => { sheetTeller = el.dataset.id; paintSheet(); },
    setprompt: (el) => {
      const tid = sheetTeller || (Store.tellers().length === 1 ? Store.tellers()[0].id : null);
      if (!tid) { toast('Choose who to ask first.'); return; }
      Store.setPrompt(tid, el.dataset.id);
      Store.updateTeller(tid, { answeredAt: null });
      closeSheet(true); setView('ask'); toast('That is the question waiting for them.');
    },
    askform: () => { qWho = null; qFrom = null; openSheet('askform'); },
    qwho: (el) => { qWho = el.dataset.id; sel(el, '#qWho'); },
    qfrom: (el) => { qFrom = el.dataset.id; sel(el, el.closest('.chiprow') ? '#' + el.closest('.chiprow').id : '#qFrom'); },
    qsave: () => {
      const txt = $('#qText').value.trim();
      if (!txt) { fieldErr('#qText', 'Write the question first.'); return; }
      const tid = qWho || (Store.tellers()[0] || {}).id;
      const from = qFrom || (Store.people()[0] || {}).id;
      Store.askQuestion(tid, txt, from);
      closeSheet(true); setView('ask'); toast('It jumps the queue.');
    },
    dropq: (el) => { Store.dropQuestion(el.dataset.id); renderAsk(); },
    followup: (el) => { qFrom = null; openSheet('followup', el.dataset.id); },
    fusave: (el) => {
      const s = Store.story(el.dataset.id);
      const txt = $('#fuText').value.trim();
      if (!txt) { fieldErr('#fuText', 'Write the follow up first.'); return; }
      Store.askQuestion(s.tellerId, txt, qFrom || (Store.people()[0] || {}).id);
      closeSheet(true); setView('ask'); toast('Next time they open Elder Mode, that is what they see.');
    },
    ntpack: (el) => {
      const p = el.dataset.p;
      const i = ntPacks.indexOf(p);
      if (i < 0) ntPacks.push(p); else ntPacks.splice(i, 1);
      el.classList.toggle('on');
    },
    ntsave: () => {
      const name = $('#ntName').value.trim();
      if (!name) { fieldErr('#ntName', 'Their name, first.'); return; }
      if (Store.tellers().some(t => t.name.toLowerCase() === name.toLowerCase())) {
        fieldErr('#ntName', name + ' is already here. Add something to tell them apart, like a surname.'); return;
      }
      const y = $('#ntYear').value.trim();
      if (y && !Store.validYear(y)) { fieldErr('#ntYear', 'A four digit year, or leave it blank.'); return; }
      Store.addTeller({
        name, relation: $('#ntRel').value, birthYear: y,
        place: $('#ntPlace').value, packs: ntPacks.slice(), day: 0, time: '15:00'
      });
      reschedule(); closeSheet(true); setView('family'); toast(name + ' added.');
    },
    nprole: (el) => { npRole = el.dataset.r; sel(el, '#npRole'); },
    npsave: () => {
      const name = $('#npName').value.trim();
      if (!name) { fieldErr('#npName', 'A name, first.'); return; }
      if (Store.people().some(p => p.name.toLowerCase() === name.toLowerCase())) {
        fieldErr('#npName', name + ' is already listening.'); return;
      }
      Store.addPerson(name, npRole);
      closeSheet(true); renderFamily(); toast(name + ' can listen now.');
    },
    delperson: (el) => { Store.removePerson(el.dataset.id); renderFamily(); },
    tpack: (el) => {
      const t = Store.teller(el.dataset.id);
      const p = el.dataset.p;
      const i = t.packs.indexOf(p);
      if (i < 0) t.packs.push(p); else t.packs.splice(i, 1);
      t.current = null;
      Store.save(); el.classList.toggle('on');
    },
    delteller: (el) => {
      const t = Store.teller(el.dataset.id);
      confirmFn = () => {
        Store.removeTeller(t.id); reschedule(); closeSheet(true); setView('family');
        toast(t.name + ' removed.');
      };
      openSheet('confirm', { title: 'Remove ' + t.name + '?', yes: 'Remove everything', danger: true,
        body: 'Their stories and recordings are deleted from this phone and cannot be recovered. Export first if you want to keep them.' });
    },
    filtteller: (el) => { filter.teller = el.dataset.id; filter.tag = null; closeSheet(true); setView('archive'); },
    play: (el) => togglePlay(el.dataset.id),
    seek: (el, e) => {
      const s = Store.story(el.dataset.id);
      if (!player.audio || player.id !== s.id) return;
      const r = el.getBoundingClientRect();
      const x = ((e.clientX || 0) - r.left) / r.width;
      const d = isFinite(player.audio.duration) && player.audio.duration > 0 ? player.audio.duration : s.dur;
      try { player.audio.currentTime = Math.max(0, Math.min(d - 0.1, x * d)); } catch (err) {}
    },
    jump: (el) => { if (player.audio) { try { player.audio.currentTime = +el.dataset.t; } catch (e) {} } },
    mark: (el) => {
      if (!player.audio) { playErr('Play it first, then mark the moment where you are.'); return; }
      openSheet('marknote', { id: el.dataset.id, t: player.audio.currentTime });
    },
    marksave: (el) => {
      const note = $('#mkNote').value.trim();
      Store.addMoment(el.dataset.id, +el.dataset.t, note);
      buzz(12, 130);
      closeSheet();
      toast('Marked at ' + Store.dur(+el.dataset.t) + '.');
    },
    delmoment: (el) => { Store.removeMoment(el.dataset.id, +el.dataset.i); paintSheet(); },
    addtag: (el) => {
      const type = $('#tagType').value, label = $('#tagLabel').value.trim();
      if (!label) { fieldErr('#tagLabel', 'Type the tag first.'); return; }
      Store.addTag(el.dataset.id, type, label);
      paintSheet();
    },
    quicktag: (el) => { Store.addTag(el.dataset.id, 'decade', el.dataset.l); paintSheet(); },
    deltag: (el) => { Store.removeTag(el.dataset.id, +el.dataset.i); paintSheet(); },
    vis: (el) => {
      const s = Store.story(el.dataset.id);
      const v = el.dataset.v;
      const patch = { visibility: v };
      if (v === 'sealed' && !s.sealUntil) {
        const d = new Date(); d.setFullYear(d.getFullYear() + 5);
        patch.sealUntil = Store.ymd(d);
      }
      Store.updateStory(s.id, patch);
      paintSheet();
    },
    unseal: (el) => { Store.updateStory(el.dataset.id, { visibility: 'family', sealUntil: null }); paintSheet(); },
    heart: (el) => { Store.react(el.dataset.id, el.dataset.p); buzz(14, 150); paintSheet(); toast('Heart left.'); },
    exportone: (el) => {
      Store.exportStory(el.dataset.id).then(o => {
        if (!o) { toast('That recording is missing.'); return; }
        saveOut(o.blob, o.name, o.blob.type || 'audio/webm');
      });
    },
    exportteller: (el) => {
      const t = Store.teller(el.dataset.id);
      closeSheet(true);
      exportAll(Store.storiesOf(t.id).slice().reverse(), t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), $('#keepBody [data-act="export"]'));
    },
    export: (el) => exportAll(null, 'archive', el),
    import: () => { const f = $('#importFile'); if (f) { f.value = ''; f.click(); } },
    obpack: (el) => {
      const p = el.dataset.id, i = obPacks.indexOf(p);
      if (i < 0) obPacks.push(p); else obPacks.splice(i, 1);
      obPacksTouched = true;
      el.classList.toggle('on', i < 0);
    },
    exportwho: () => openSheet('exportwho'),
    delstory: (el) => {
      const s = Store.story(el.dataset.id);
      confirmFn = () => {
        /* The record is written the moment this returns; erasing the audio behind it is
           housekeeping, and nobody should watch a sheet sit still while a database
           forgets a file. */
        Store.removeStory(s.id);
        closeSheet(true); setView('archive'); toast('Deleted.');
      };
      openSheet('confirm', { title: 'Delete this story?', yes: 'Delete it', danger: true,
        body: 'The recording is removed from this phone for good. If the teller asked you to delete it, this is the button.' });
    },
    erase: () => {
      confirmFn = () => {
        Store.erase().then(() => { closeSheet(true); location.reload(); });
      };
      openSheet('confirm', { title: 'Erase everything?', yes: 'Erase it all', danger: true,
        body: 'Every recording, every tag and every name goes. There is no copy anywhere else, because there is no anywhere else.' });
    },
    tog: (el) => {
      const k = el.dataset.k;
      const st = Store.settings();
      const on = !st[k];
      Store.settings({ [k]: on });
      el.classList.toggle('on', on);
      if (k === 'notify') {
        if (on) askNotifyPermission();
        reschedule();
      }
      if (k === 'haptics' && on) buzz(16, 150);
    },
    cancel: () => closeSheet(),
    confirmyes: () => { const f = confirmFn; confirmFn = null; if (f) f(); else closeSheet(); }
  };
  function sel(el, scope) {
    const box = scope ? document.querySelector(scope) : el.parentElement;
    if (box) box.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
    el.classList.add('on');
  }
  function vis(s, v, label) {
    return '<button class="chip' + (s.visibility === v ? ' on' : '') + '" data-act="vis" data-id="' +
      s.id + '" data-v="' + v + '">' + label + '</button>';
  }

  /* Caught before anything else so it covers the tab bar, the scrim and the elder buttons
     too, and so every handler below runs knowing it is inside a real tap. */
  document.addEventListener('click', e => {
    if (Date.now() < swallowUntil) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      e.stopPropagation(); e.preventDefault();
      return;
    }
    inTap = true;
    setTimeout(() => { inTap = false; }, 0);
  }, true);

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACTS[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
    e.preventDefault();
    fn(el, e);
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'famName') { Store.family(e.target.value.slice(0, 46)); $('#famTitle').textContent = Store.family() || 'Family'; }
    if (e.target.id === 'obYear') { if (!obPacksTouched) obPacks = []; renderObPacks(); }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const a = el.dataset.act;
    if (a === 'title') Store.updateStory(el.dataset.id, { title: el.value.slice(0, 70) });
    else if (a === 'notes') Store.updateStory(el.dataset.id, { notes: el.value });
    else if (a === 'tset') {
      const k = el.dataset.k;
      const v = k === 'birthYear' ? Store.validYear(el.value) : el.value.trim();
      if (k === 'name' && !v) return;
      Store.updateTeller(el.dataset.id, { [k]: v });
      if (k === 'name') reschedule();
    } else if (a === 'tday') {
      const t = Store.teller(el.dataset.id); t.ritual.day = +el.value; Store.save(); reschedule();
    } else if (a === 'ttime') {
      const t = Store.teller(el.dataset.id);
      if (/^\d\d:\d\d$/.test(el.value)) { t.ritual.time = el.value; Store.save(); reschedule(); }
    } else if (a === 'sealdate') {
      Store.updateStory(el.dataset.id, { sealUntil: el.value || null });
    }
  });

  /* ---------------------------------------------------------- wiring ---- */
  function wire() {
    $('#obNext').addEventListener('click', obNext);
    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    document.querySelectorAll('#archSeg .seg-b').forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.mode; renderArchive();
    }));
    $('#archSearch').addEventListener('input', e => { query = e.target.value; renderArchive(); });
    $('#sheetScrim').addEventListener('click', () => closeSheet(true));

    $('#elderRec').addEventListener('click', startRecording);
    $('#elderSkip').addEventListener('click', () => {
      holdTaps();
      Store.skipWeek(elder.tellerId, true);
      renderElder();
    });
    $('#importFile').addEventListener('change', e => importFile(e.target.files && e.target.files[0]));
    $('#elderSpeak').addEventListener('click', () => {
      const b = $('#elderSpeak');
      b.classList.add('on');
      speak($('#elderQ').textContent, () => b.classList.remove('on'));
    });
    $('#consentYes').addEventListener('click', () => {
      Store.giveConsent(elder.tellerId);
      buzz(18, 170);
      elder.stage = 'home'; renderElder(); reschedule(); askNotifyPermission();
    });
    $('#consentNo').addEventListener('click', leaveElder);
    $('#recPause').addEventListener('click', togglePause);
    $('#recDone').addEventListener('click', finishRecording);
    $('#recRedo').addEventListener('click', () => {
      confirmFn = () => { closeSheet(true); discardRecording(); setTimeout(startRecording, 120); };
      openSheet('confirm', { title: 'Start again?', yes: 'Start again', no: 'Carry on', danger: true,
        body: 'What has been recorded so far is thrown away and the recording starts from the beginning.' });
    });
    $('#doneOk').addEventListener('click', () => { elder.stage = 'home'; renderElder(); });
    $('#errSettings').addEventListener('click', () => {
      try { Native.openAppSettings(); } catch (e) {}
    });
    $('#errRetry').addEventListener('click', startRecording);
    $('#errBack').addEventListener('click', () => { elder.stage = 'home'; renderElder(); });

    /* Elder Mode is left by holding the corner mark, so it cannot be left by accident. */
    const exit = $('#elderExit');
    let holdT = 0;
    const down = () => {
      exit.classList.add('holding');
      holdT = setTimeout(() => {
        exit.classList.remove('holding');
        if (Recorder.getState() !== 'idle') { back(); return; }
        leaveElder();
      }, 1100);
    };
    const up = () => { clearTimeout(holdT); exit.classList.remove('holding'); };
    exit.addEventListener('pointerdown', down);
    exit.addEventListener('pointerup', up);
    exit.addEventListener('pointerleave', up);
    exit.addEventListener('pointercancel', up);
  }

  function leaveElder() {
    if (Recorder.getState() !== 'idle') { stopWave(); Recorder.cancel(); }
    if (TTS) { try { speechSynthesis.cancel(); } catch (e) {} }
    setView('ask');
  }

  /* ------------------------------------------------------------- shell -- */
  function back() {
    if (sheets.length) { closeSheet(); return true; }
    if (elder) {
      if (elder.stage === 'rec') {
        confirmFn = () => { closeSheet(true); discardRecording(); };
        openSheet('confirm', { title: 'Throw this recording away?', yes: 'Throw it away', no: 'Carry on', danger: true,
          body: 'It has not been kept yet. Press Done instead if you want it.' });
        return true;
      }
      confirmFn = () => { closeSheet(true); leaveElder(); };
      openSheet('confirm', { title: 'Leave the big button screen?', yes: 'Leave', no: 'Stay',
        body: 'This is the screen made for the person telling the stories. The rest of the app is for whoever looks after the archive.' });
      return true;
    }
    if (!Store.onboarded()) { if (step > 0) { step--; paintOnboard(); return true; } return false; }
    if (view !== 'archive') { setView('archive'); return true; }
    return false;
  }

  function onPause() {
    if (Recorder.getState() === 'recording') {
      togglePause();
      toast('Paused. Press Carry on when you come back.');
    }
    if (player.audio && !player.audio.paused) player.audio.pause();
    if (TTS) { try { speechSynthesis.cancel(); } catch (e) {} }
  }
  /* Coming back after the weekend has turned over: the plan is recomputed, and the screen is
     redrawn so a card that said the week was answered now offers this week's question. */
  function onResume() {
    reschedule();
    if (!elder && Store.onboarded()) render();
    // Coming back from the settings page: if the microphone was allowed there, the card
    // stops offering settings and Try again is worth pressing again.
    else if (elder && elder.stage === 'err') renderElder();
  }

  function boot() {
    paintIcons();
    $('#obMark').innerHTML = ringsSvg(5, { size: 88, max: 5, sw: 1.7, fade: true });
    $('#elderRings').innerHTML = ringsSvg(7, { size: 200, max: 7, sw: 1.4, seed: 1, nodot: true });
    wire();
    if (!Store.onboarded()) showOnboard();
    else { setView(Store.stories().length ? 'archive' : 'ask'); }
    reschedule();
  }

  boot();

  return { back, onPause, onResume, setView, openElder, openSheet, closeSheet, render, toast,
           playing: () => !!(player.audio && !player.audio.paused),
           /* what the recording disc currently looks like, for the drive scripts */
           ringGeometry: () => wave && {
             ring: wave.ring, done: wave.done.length, scale: wave.scale,
             outer: ringRadius(wave, wave.ring, wave.scale), half: Math.min(wave.w, wave.h) / 2 } };
})();

window.App = App;
