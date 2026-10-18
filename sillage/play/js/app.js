/* Sillage. Four tab screens, six pushed pages, three sheets, a drill runner and
   the notification planner. Nothing in this file talks to a network, because the
   Android shell it runs inside does not hold the permission to. */
const App = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const N = window.Native || null;
  const esc = Art.esc;

  const MAIN = ['journal', 'train', 'shelf', 'lexicon'];
  let view = 'journal';
  let stack = [];
  let editing = null;                       // entry being edited, or null for a new one
  let draft = { tags: [], feeling: null, scaffold: 0 };
  let tagTarget = 'entry';
  let tagPick = [];
  let drill = null;
  let clock = null;                          // the drill interval, held outside the round so it can never outlive it
  let bottleEditing = null;
  let currentBottle = null;
  let currentCard = null;
  let wearTarget = null;
  let wearCtx = [];
  let lex = { family: null, mine: false, q: '' };
  let obStep = 0;

  /* ---------- small helpers ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  /** Browsers refuse navigator.vibrate before the first tap and log a warning for it,
      so only reach for the web API once the document has actually been touched. */
  function webBuzz(pattern) {
    if (!navigator.vibrate) return;
    const ua = navigator.userActivation;
    if (ua && !ua.hasBeenActive) return;
    try { navigator.vibrate(pattern); } catch (e) {}
  }
  function tap(ms = 12, amp = 105) {
    try { if (N && N.vibrate) { N.vibrate(ms, amp); return; } } catch (e) {}
    webBuzz(ms);
  }
  function pulse() {
    try {
      if (N && N.vibratePattern) { N.vibratePattern('[18,120,26]', 120); return; }
      if (N && N.vibrate) { N.vibrate(26, 120); return; }
    } catch (e) {}
    webBuzz([18, 120, 26]);
  }
  const termName = id => (Lexicon.get(id) || {}).t || id;
  /** Cut at a word boundary. No ellipsis: a fragment reads better than a stub. */
  const clip = (s, n) => {
    const t = String(s).replace(/\s+/g, ' ').trim();
    if (t.length <= n) return t;
    const cut = t.slice(0, n);
    const sp = cut.lastIndexOf(' ');
    return (sp > n * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, '');
  };
  const money = v => {
    const n = Math.round(Number(v) * 100) / 100;
    const frac = n % 1 === 0 ? 0 : 2;
    return Store.settings().currency + n.toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: 2 });
  };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
  /** A primary action that writes: swallow the second and third tap of a fast double tap.
      Without this a double tap on Save writes the entry twice, which is the quietest way
      an app can duplicate somebody's day. A refusal (a returned false) does not latch, so
      "write something first" then a real save still works. */
  function once(fn) {
    let busy = false;
    return function (...a) {
      if (busy) return;
      busy = true;
      const r = fn.apply(this, a);
      if (r === false) busy = false;
      else setTimeout(() => { busy = false; }, 700);
      return r;
    };
  }

  function download(name, mime, text) {
    if (N && N.saveFile) {
      const b64 = btoa(unescape(encodeURIComponent(text)));
      const uri = N.saveFile(name, mime, b64);
      toast(uri ? 'Saved to Downloads' : 'Could not write the file');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Exported');
  }

  /* ---------- routing ---------- */
  function show(name, push) {
    if (view === 'drill' && name !== 'drill') stopTimer();
    if (push && name !== view) stack.push(view);
    if (MAIN.includes(name)) stack = [];
    view = name;
    for (const el of $$('.view')) el.hidden = ('v-' + name) !== el.id;
    const onMain = MAIN.includes(name);
    $('#tabs').hidden = !onMain;
    document.body.classList.toggle('has-tabs', onMain);
    $('#newEntry').hidden = name !== 'journal';
    for (const t of $$('.tab')) t.classList.toggle('is-on', t.dataset.view === name);
    const sc = $('#v-' + name + ' .scroller');
    if (sc) sc.scrollTop = 0;
    render(name);
    const el = $('#v-' + name);
    if (el) {
      el.classList.add('is-fresh');
      clearTimeout(show._fresh);
      show._fresh = setTimeout(() => el.classList.remove('is-fresh'), 750);
    }
  }

  function render(name) {
    if (name === 'journal') renderJournal();
    else if (name === 'train') renderTrain();
    else if (name === 'shelf') renderShelf();
    else if (name === 'lexicon') renderLexicon();
    else if (name === 'skill') renderSkill();
    else if (name === 'settings') renderSettings();
    else if (name === 'bottle') renderBottle();
    else if (name === 'card') renderCard();
  }

  function anySheetOpen() { return $$('.sheet').some(s => !s.hidden); }
  function closeSheets() { for (const s of $$('.sheet')) s.hidden = true; }
  /** The note picker opens on top of the bottle editor. Back closes the picker and leaves
      the half written bottle where it was; a second Back closes that. */
  function topSheet() {
    const open = $$('.sheet').filter(s => !s.hidden);
    if (!open.length) return null;
    return open.sort((a, b) => Number(getComputedStyle(b).zIndex || 0) - Number(getComputedStyle(a).zIndex || 0))[0];
  }

  /* ================= JOURNAL ================= */
  function renderJournal() {
    const now = new Date();
    $('#journalDay').textContent = Store.MONTHS[now.getMonth()] + ' ' + now.getDate() + ', ' +
      Store.seasonLabel(Store.seasonOf(Date.now())).toLowerCase();

    const r = Store.resurfaced();
    const box = $('#resurface');
    if (r) {
      const f = Content.feeling(r.entry.feeling);
      box.innerHTML =
        '<article class="resurf" data-entry="' + r.entry.id + '">' +
        '<p class="rk">' + esc(r.line) + '</p>' +
        '<p class="rt">' + esc(clip(r.entry.text, 200)) + '</p>' +
        (r.entry.anchor ? '<p class="ra">' + esc(r.entry.anchor) + '</p>' : '') +
        '<p class="rm">' + esc(Store.longDate(r.entry.at)) +
        (r.entry.place ? ' at ' + esc(r.entry.place) : '') +
        (f ? '. ' + esc(f.label) + '.' : '') + '</p></article>';
      if (box.dataset.last !== r.entry.id + r.line) { pulse(); box.dataset.last = r.entry.id + r.line; }
    } else {
      box.innerHTML = ''; box.dataset.last = '';
    }

    const q = $('#entrySearch').value;
    const list = Store.searchEntries(q);
    const all = Store.entries();
    const blank = $('#journalEmpty');
    blank.hidden = all.length > 0;
    if (!all.length) {
      blank.innerHTML = Art.blank('journal', 'The bottle is still stoppered.',
        'The next thing you smell will do. Coffee counts, so does the bus.',
        { label: 'Write the first one', attr: 'data-newentry=""' });
    }
    $('#entrySearch').parentElement.hidden = all.length < 4;

    $('#entryStream').innerHTML = list.map(e => {
      const f = Content.feeling(e.feeling);
      const b = e.bottleId ? Store.bottle(e.bottleId) : null;
      const meta = [Store.ago(e.at), clip(e.place, 44), b ? 'wearing ' + clip(b.name, 30) : '',
                    clip((e.people || []).join(', '), 40)].filter(Boolean).join(' · ');
      return '<article class="ecard" data-entry="' + e.id + '"' + (f ? ' style="--feel:' + f.hue + '"' : '') + '>' +
        '<p class="em">' + esc(meta) + '</p>' +
        '<p class="et">' + esc(clip(e.text, 260)) + '</p>' +
        (e.anchor ? '<p class="ea">' + esc(e.anchor) + '</p>' : '') +
        ((e.tags || []).length ? '<div class="etags">' + e.tags.slice(0, 6).map(t =>
          '<span class="etag">' + esc(termName(t)) + '</span>').join('') + '</div>' : '') +
        '</article>';
    }).join('');

    if (list.length === 0 && all.length) {
      $('#entryStream').innerHTML = Art.blank('nothing', 'Nothing matches that.',
        'Search runs over what you wrote, the anchor, the place, the people and every note you tagged.');
    }

    const w = Store.weekCount();
    $('#weekLine').textContent = w === 0
      ? (all.length ? 'Nothing this week. The nose forgets faster than the eye.' : '')
      : w + (w === 1 ? ' scent interaction this week.' : ' scent interactions this week.') +
        (w >= 4 ? ' Woven in.' : ' Four a week is where it starts to stick.');
  }

  /* ================= ENTRY FLOW ================= */
  function openEntry(id) {
    editing = id ? Store.entry(id) : null;
    draft = {
      tags: editing ? (editing.tags || []).slice() : [],
      feeling: editing ? editing.feeling : null,
      scaffold: Math.floor(Math.random() * Content.SCAFFOLDS.length)
    };
    $('#eText').value = editing ? editing.text : '';
    $('#eAnchor').value = editing ? editing.anchor : '';
    $('#ePlace').value = editing ? editing.place : '';
    $('#ePeople').value = editing ? (editing.people || []).join(', ') : '';
    $('#entryTitle').textContent = editing ? 'That smell' : 'What did you smell?';
    $('#entryWhen').textContent = editing ? Store.longDate(editing.at) : 'A new entry';
    $('#eDelete').hidden = !editing;
    const sel = $('#eBottle');
    const linked = editing && editing.bottleId;
    sel.innerHTML = '<option value="">Nothing, or not sure</option>' + Store.bottles()
      .filter(b => b.status !== 'rehomed' || b.id === linked)
      .map(b => '<option value="' + b.id + '">' + esc(b.name) + (b.house ? ', ' + esc(b.house) : '') + '</option>').join('');
    sel.value = editing && editing.bottleId ? editing.bottleId : '';
    paintEntry();
    show('entry', true);
    if (!editing) setTimeout(() => $('#eText').focus(), 120);
  }

  function paintEntry() {
    $('#eTags').innerHTML = draft.tags.length
      ? draft.tags.map(t => '<button class="chip on" data-untag="' + t + '">' + esc(termName(t)) +
          Art.icon('close', 'x') + '</button>').join('')
      : '<span class="help">No notes yet.</span>';
    $('#eWheel').innerHTML = Art.wheel(draft.feeling, 250);
    const f = Content.feeling(draft.feeling);
    $('#eFeelNote').textContent = f ? f.line : 'Tap the part of the wheel that fits. It tints the entry in the stream.';
    $('#eAnchor').placeholder = Content.SCAFFOLDS[draft.scaffold];
    const words = $('#eAnchor').value.trim() ? $('#eAnchor').value.trim().split(/\s+/).length : 0;
    $('#eAnchorCount').textContent = words
      ? words + (words === 1 ? ' word' : ' words') + '. That is the entry that will still mean something in a year.'
      : 'One sentence of comparison. This is the part that does the encoding.';
  }

  function saveEntry() {
    const text = $('#eText').value.trim();
    if (!text) { toast('Write what you smelled first.'); $('#eText').focus(); return false; }
    const payload = {
      text,
      anchor: $('#eAnchor').value.trim(),
      tags: draft.tags,
      feeling: draft.feeling,
      place: $('#ePlace').value.trim(),
      people: $('#ePeople').value.split(',').map(s => s.trim()).filter(Boolean),
      bottleId: $('#eBottle').value || null
    };
    if (editing) Store.updateEntry(editing.id, payload);
    else Store.addEntry(payload);
    tap(16, 120);
    editing = null;
    show('journal');
    plan();
    toast(payload.anchor ? 'Kept, with the anchor.' : 'Kept. An anchor would make it last longer.');
  }

  /* ---------- the note picker ---------- */
  function openTags(target) {
    tagTarget = target;
    tagPick = (target === 'entry' ? draft.tags : (bottleEditing.notes || [])).slice();
    $('#tagSearch').value = '';
    paintTagList();
    $('#sheetTags').hidden = false;
    setTimeout(() => $('#tagSearch').focus(), 150);
  }

  function paintTagList() {
    const q = $('#tagSearch').value.trim();
    let list;
    if (q) list = Lexicon.search(q).slice(0, 60);
    else {
      const mine = Store.vocab().list.slice(0, 14).map(u => Lexicon.get(u.id)).filter(Boolean);
      const seed = mine.length >= 6 ? mine : Lexicon.all().filter(n => n.f !== 'craft').slice(0, 0).concat(
        ['bergamot', 'rose-damascena', 'vetiver', 'vanilla', 'petrichor', 'jasmine-sambac', 'oakmoss',
         'sandalwood', 'black-pepper', 'sea-salt', 'incense-smoke', 'fig', 'leather-accord', 'orris']
          .map(id => Lexicon.get(id)).filter(Boolean));
      list = seed;
    }
    const picked = new Set(tagPick);
    $('#tagResults').innerHTML = list.map(n =>
      '<div class="tg' + (picked.has(n.id) ? ' on' : '') + '" data-tag="' + n.id + '">' +
      '<span class="tt">' + esc(n.t) + '</span>' +
      '<span class="tf">' + esc((Lexicon.family(n.f) || {}).name || n.f) + '</span></div>').join('')
      || '<p class="help">No card by that name. Try a shorter word.</p>';
  }

  function commitTags() {
    if (tagTarget === 'entry') { draft.tags = tagPick.slice(); paintEntry(); }
    else { bottleEditing.notes = tagPick.slice(); paintBottleSheet(); }
    $('#sheetTags').hidden = true;
  }

  /* ================= TRAIN ================= */
  function renderTrain() {
    const fp = Store.trackProgress('foundations');
    const cp = Store.trackProgress('conservatory');
    $('#trainEyebrow').textContent = (fp.done + cp.done) + ' of ' + (fp.total + cp.total) + ' sessions done';

    const next = Store.nextSession('foundations') || Store.nextSession('conservatory');
    const box = $('#todaySession');
    if (!next) {
      const acc = Store.accuracySeries();
      box.innerHTML = '<div class="session"><p class="sk">Both tracks complete</p>' +
        '<h3>You have run every session Sillage has.</h3>' +
        '<p class="sb">Repeat any shelf whenever you like. Repeats are scored the same way and keep the curve honest.</p>' +
        (acc.length ? '<p class="sb">Your last round scored ' + acc[acc.length - 1].pct + ' percent.</p>' : '') +
        '<button class="btn accent wide" data-repeat="1">Repeat a shelf</button></div>';
    } else {
      const track = Content.TRACK_BY_ID[next.track];
      box.innerHTML = '<div class="session">' +
        '<p class="sk">' + esc(track.name) + ' · ' + esc(Content.KIND_LABEL[next.kind]) + '</p>' +
        '<h3>' + esc(next.title) + '</h3>' +
        '<p class="sb">' + esc(next.brief) + '</p>' +
        '<div class="mats">' + next.mats.map(m =>
          '<span class="mat">' + esc((Content.material(m) || {}).name || m) + '</span>').join('') + '</div>' +
        '<button class="btn accent wide" data-start="' + next.id + '">Begin, about ' + next.mins + ' minutes</button>' +
        '</div>';
    }

    $('#trackList').innerHTML = Content.TRACKS.map(t => {
      const p = Store.trackProgress(t.id);
      const pct = p.total ? Math.round(100 * p.done / p.total) : 0;
      return '<div class="trow" data-track="' + t.id + '">' +
        '<div><h4>' + esc(t.name) + '</h4><p>' + esc(t.blurb) + '</p>' +
        '<div class="pbar"><span style="width:' + pct + '%"></span></div>' +
        '<p style="margin-top:8px">' + esc(t.needs) + '</p></div>' +
        '<span class="prog">' + p.done + ' / ' + p.total + '</span></div>';
    }).join('');
  }

  function pickRepeat() {
    const done = new Set(Store.sessions().map(s => s.sessionId));
    const options = Content.CONSERVATORY.filter(s => done.has(s.id));
    const s = options[options.length - 1] || Content.CONSERVATORY[0];
    startDrill(s.id);
  }

  /* ---------- the drill runner ---------- */
  function findSession(id) {
    for (const t of Content.TRACKS) { const s = t.sessions.find(x => x.id === id); if (s) return s; }
    return null;
  }

  function startDrill(id) {
    const s = findSession(id);
    if (!s) return;
    stopTimer();
    const order = s.mats.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    drill = {
      s, order, idx: 0, phase: 'brief', results: [], guess: null,
      startedAt: Date.now(), left: 0, timer: null,
      target: s.kind === 'recall' ? order[0] : null
    };
    show('drill', true);
    paintDrill();
  }

  /* The interval handle lives here rather than on the round, because a round that has been
     replaced or left behind still owns a live interval otherwise: it goes on counting down,
     stepping the jar index of whatever round came after it, and buzzing the phone every
     twenty seconds from a screen the user is no longer looking at. */
  function stopTimer() { if (clock) { clearInterval(clock); clock = null; } if (drill) drill.timer = null; }

  function runTimer(secs, onDone) {
    stopTimer();
    drill.left = secs;
    /* The screen is painted before the timer starts, so write the full count
       straight away. Without this the clock reads 0 for its first second. */
    const paintClock = () => { const el = $('#drillClock'); if (el) el.textContent = drill.left; };
    paintClock();
    clock = setInterval(() => {
      drill.left--;
      paintClock();
      if (drill.left <= 0) { stopTimer(); tap(24, 140); onDone(); }
    }, 1000);
    drill.timer = clock;
  }

  function matName(id) { return (Content.material(id) || {}).name || id; }

  /** The jars already named, so the screen shows the round taking shape. */
  function soFar() {
    const done = drill.results.filter(r => r.ok !== undefined);
    if (!done.length) return '';
    return '<div class="sofar">' + done.map((r, i) =>
      '<div class="sf"><span>Jar ' + (i + 1) + '. ' + esc(matName(r.mat)) + '</span>' +
      '<span class="mk ' + (r.ok ? 'hit' : 'miss') + '">' + (r.ok ? 'named' : 'missed') + '</span></div>').join('') +
      '</div>';
  }

  /** Each jar in a blind set is a different material, so a name used once is gone. */
  function remaining() {
    const used = new Set(drill.results.map(r => r.mat));
    return drill.s.mats.filter(m => !used.has(m));
  }

  function paintDrill() {
    if (!drill) return;
    const s = drill.s, b = $('#drillBody');
    const track = Content.TRACK_BY_ID[s.track];
    $('#drillStep').textContent = track.name;

    if (drill.phase === 'brief') {
      b.innerHTML =
        '<p class="runline">' + esc(Content.KIND_LABEL[s.kind]) + '</p>' +
        '<h1 class="drill-big">' + esc(s.title) + '</h1>' +
        '<p class="drill-sub">' + esc(s.brief) + '</p>' +
        '<h2 class="sub">Put out</h2>' +
        '<div class="mats">' + s.mats.map(m => '<span class="mat">' + esc(matName(m)) + '</span>').join('') + '</div>' +
        '<p class="help long ital">' + esc(s.teach) + '</p>' +
        '<button class="btn accent wide" data-drill="go" style="margin-top:22px">Ready</button>';
      return;
    }

    if (drill.phase === 'attend') {
      const m = drill.order[drill.idx];
      b.innerHTML =
        '<p class="runline">Jar ' + (drill.idx + 1) + ' of ' + drill.order.length + '</p>' +
        '<h1 class="drill-big">' + esc(matName(m)) + '</h1>' +
        '<p class="drill-sub">Eyes closed. Stay with it until the clock runs out.</p>' +
        '<p class="timer" id="drillClock">' + drill.left + '</p>' +
        '<p class="help">seconds</p>';
      return;
    }

    if (drill.phase === 'describe') {
      const m = drill.order[drill.idx];
      b.innerHTML =
        '<p class="runline">' + (drill.idx + 1) + ' of ' + drill.order.length + '</p>' +
        '<h1 class="drill-big">' + esc(matName(m)) + '</h1>' +
        '<p class="drill-sub">' + esc(s.brief) + '</p>' +
        '<div class="field"><label for="drillNote">Say it out loud, then write it down</label>' +
        '<textarea id="drillNote" rows="3" maxlength="300" placeholder="' + esc(Content.SCAFFOLDS[drill.idx % Content.SCAFFOLDS.length]) + '"></textarea></div>' +
        '<button class="btn accent wide" data-drill="nextdesc" style="margin-top:16px">' +
        (drill.idx + 1 === drill.order.length ? 'Finish' : 'Next') + '</button>';
      return;
    }

    if (drill.phase === 'ladder') {
      const chosen = drill.results.map(r => r.mat);
      b.innerHTML =
        '<p class="runline">Intensity ladder</p>' +
        '<h1 class="drill-big">Quietest first.</h1>' +
        '<p class="drill-sub">Tap them in the order you think they rank, then smell them in that order to check yourself. Nothing is scored here.</p>' +
        '<div class="guessgrid">' + s.mats.map(m =>
          '<button class="guess' + (chosen.includes(m) ? ' on' : '') + '" data-ladder="' + m + '"' +
          (chosen.includes(m) ? ' disabled' : '') + '>' +
          (chosen.includes(m) ? (chosen.indexOf(m) + 1) + '. ' : '') + esc(matName(m)) + '</button>').join('') + '</div>' +
        (chosen.length === s.mats.length
          ? '<button class="btn accent wide" data-drill="finish" style="margin-top:20px">Done</button>'
          : '');
      return;
    }

    if (drill.phase === 'recall-smell') {
      b.innerHTML =
        '<p class="runline">Memory span</p>' +
        '<h1 class="drill-big">Smell the ' + esc(matName(drill.target).toLowerCase()) + '.</h1>' +
        '<p class="drill-sub">Take a full twenty seconds with it. Then put it back with the others and do not look.</p>' +
        '<button class="btn accent wide" data-drill="wait" style="margin-top:18px">I have it</button>';
      return;
    }

    if (drill.phase === 'recall-wait') {
      b.innerHTML =
        '<p class="runline">Hold it</p>' +
        '<h1 class="drill-big">Do nothing.</h1>' +
        '<p class="drill-sub">Look away from the jars. No smelling, no checking.</p>' +
        '<p class="timer" id="drillClock">' + drill.left + '</p><p class="help">seconds</p>';
      return;
    }

    if (drill.phase === 'recall-find') {
      b.innerHTML =
        '<p class="runline">Now find it</p>' +
        '<h1 class="drill-big">Which one was it?</h1>' +
        '<p class="drill-sub">Smell all of them and choose. Then check the labels.</p>' +
        '<div class="guessgrid">' + drill.order.map(m =>
          '<button class="guess' + (drill.guess === m ? ' on' : '') + '" data-guess="' + m + '">' + esc(matName(m)) + '</button>').join('') + '</div>' +
        (drill.guess ? '<div class="verdict"><button class="btn ghost" data-verdict="miss">I was wrong</button>' +
          '<button class="btn accent" data-verdict="hit">That was it</button></div>' : '');
      return;
    }

    if (drill.phase === 'id-guess') {
      const left = remaining();
      const named = soFar();
      b.innerHTML =
        '<p class="runline">Jar ' + (drill.idx + 1) + ' of ' + drill.order.length + '</p>' +
        '<h1 class="drill-big">What is in it?</h1>' +
        '<p class="drill-sub">' + (left.length === 1
          ? 'One left, so this is the one it has to be. Smell it anyway and see whether you agree.'
          : 'Smell before you read the list. Choose, then check the label.') + '</p>' +
        '<div class="guessgrid">' + left.map(m =>
          '<button class="guess' + (drill.guess === m ? ' on' : '') + '" data-guess="' + m + '">' + esc(matName(m)) + '</button>').join('') + '</div>' +
        (drill.guess ? '<div class="verdict"><button class="btn ghost" data-verdict="miss">Wrong</button>' +
          '<button class="btn accent" data-verdict="hit">Right</button></div>' : '') +
        named + '<p class="teachline">' + esc(s.teach) + '</p>';
      return;
    }

    if (drill.phase === 'id-truth') {
      b.innerHTML =
        '<p class="runline">Jar ' + (drill.idx + 1) + '</p>' +
        '<h1 class="drill-big">What was it actually?</h1>' +
        '<p class="drill-sub">Recording the real answer is what lets the app point you back at the right shelf.</p>' +
        '<div class="guessgrid">' + remaining().filter(m => m !== drill.guess).map(m =>
          '<button class="guess" data-truth="' + m + '">' + esc(matName(m)) + '</button>').join('') + '</div>' +
        soFar();
      return;
    }

    if (drill.phase === 'done') {
      const total = drill.results.filter(r => r.ok !== undefined).length;
      const got = drill.results.filter(r => r.ok).length;
      const misses = drill.results.filter(r => r.ok === false);
      const scored = s.kind === 'id' || s.kind === 'recall';
      b.innerHTML =
        '<p class="runline">' + esc(s.title) + '</p>' +
        (scored
          ? '<p class="scoreline">' + got + ' of ' + total + '</p>' +
            '<p class="help">' + (got === total ? 'Clean round.' : 'A miss is the useful half of a round.') + '</p>'
          : '<h1 class="drill-big">Done.</h1><p class="drill-sub">Nothing scored here. The point was the attention.</p>') +
        (misses.length ? '<h2 class="sub">What got past you</h2>' + misses.map(r => {
          const m = Content.material(r.mat);
          return '<div class="missrow"><span>' + esc(matName(r.mat)) +
            (r.guess ? ' <span class="wc">you said ' + esc(matName(r.guess)) + '</span>' : '') + '</span>' +
            (m && m.lex ? '<a href="#" data-card="' + m.lex + '">' + esc(termName(m.lex)) + '</a>' : '') + '</div>';
        }).join('') : '') +
        '<div class="field"><label for="drillNote2">Anything worth writing down</label>' +
        '<textarea id="drillNote2" rows="3" maxlength="300" placeholder="The rosemary read as camphor, not as herb."></textarea>' +
        '<p class="help">Words you use here count towards your vocabulary.</p></div>' +
        '<button class="btn accent wide" data-drill="save" style="margin-top:18px">Save the session</button>';
      return;
    }
  }

  function advanceDrill(action, value) {
    const s = drill.s;
    if (action === 'go') {
      if (s.kind === 'attend') { drill.phase = 'attend'; drill.idx = 0; paintDrill(); runTimer(s.hold || 20, stepAttend); }
      else if (s.kind === 'describe') { drill.phase = 'describe'; drill.idx = 0; paintDrill(); }
      else if (s.kind === 'ladder') { drill.phase = 'ladder'; paintDrill(); }
      else if (s.kind === 'recall') { drill.phase = 'recall-smell'; paintDrill(); }
      else { drill.phase = 'id-guess'; drill.idx = 0; drill.guess = null; paintDrill(); }
      return;
    }
    if (action === 'nextdesc') {
      const t = $('#drillNote');
      if (t && t.value.trim()) drill.results.push({ mat: drill.order[drill.idx], note: t.value.trim() });
      drill.idx++;
      if (drill.idx >= drill.order.length) finishDrill();
      else paintDrill();
      return;
    }
    if (action === 'wait') {
      drill.phase = 'recall-wait';
      paintDrill();
      runTimer(s.wait || 60, () => { drill.phase = 'recall-find'; drill.guess = null; paintDrill(); });
      return;
    }
    if (action === 'finish') { finishDrill(); return; }
    if (action === 'save') { saveDrillOnce(); return; }
  }

  function stepAttend() {
    drill.idx++;
    if (drill.idx >= drill.order.length) { finishDrill(); return; }
    paintDrill();
    runTimer(drill.s.hold || 20, stepAttend);
  }

  function finishDrill() { stopTimer(); drill.phase = 'done'; paintDrill(); }

  function saveDrill() {
    const note = $('#drillNote2') ? $('#drillNote2').value.trim() : '';
    const scored = drill.results.filter(r => r.ok !== undefined);
    Store.addSession({
      track: drill.s.track,
      sessionId: drill.s.id,
      kind: drill.s.kind,
      results: drill.results.filter(r => r.ok !== undefined).map(r => ({ mat: r.mat, ok: r.ok, guess: r.guess || null })),
      correct: scored.filter(r => r.ok).length,
      total: scored.length,
      durationS: drill.s.kind === 'recall' ? (drill.s.wait || 60) : Math.round((Date.now() - drill.startedAt) / 1000),
      note
    });
    tap(18, 130);
    drill = null;
    show('train');
    plan();
    toast('Session recorded.');
  }
  const saveDrillOnce = once(saveDrill);

  /* ================= SHELF ================= */
  function renderShelf() {
    const s = Store.shelfSummary();
    const bs = Store.bottles();
    $('#shelfCount').textContent = bs.length
      ? bs.length + (bs.length === 1 ? ' bottle' : ' bottles') + (s.decants ? ', ' + s.decants + ' of them small' : '')
      : 'Nothing on it yet';
    const sblank = $('#shelfEmpty');
    sblank.hidden = bs.length > 0;
    if (!bs.length) {
      sblank.innerHTML = Art.blank('shelf', 'Room for everything.',
        'Add the bottle you wore today. About a fortnight later the log starts paying you back.',
        { label: 'Add a bottle', attr: 'data-addbottle="1"' });
    }

    const st = $('#shelfStats');
    if (s.wears >= 3) {
      const cpw = s.costPerWear !== null && Store.settings().showPrices && s.spend > 0;
      const seasons = { spring: 0, summer: 0, autumn: 0, winter: 0 };
      for (const bb of bs) { const s2 = Store.bottleStats(bb.id); for (const k in seasons) seasons[k] += s2.seasons[k]; }
      const topSeason = Object.keys(seasons).sort((a, b2) => seasons[b2] - seasons[a])[0];
      st.innerHTML =
        '<div class="statrow">' +
        '<div class="s"><div class="sv">' + s.wears + '</div><div class="sl">wears</div></div>' +
        '<div class="s"><div class="sv">' + (s.mostWorn ? Math.round(100 * s.mostWorn.s.reachRate) + '%' : '0%') +
          '</div><div class="sl">most worn</div></div>' +
        '<div class="s"><div class="sv">' + (cpw ? money(s.costPerWear) : Store.seasonLabel(topSeason)) +
          '</div><div class="sl">' + (cpw ? 'per wear' : 'busiest') + '</div></div>' +
        '</div>' + Art.monthStrip(Store.shelfSeasonality(), 'Wears by month across the shelf');
    } else if (bs.length) {
      st.innerHTML = '<p class="help long">Log three wears and this becomes a page of statistics: reach-for rate, cost per wear, and which months each bottle actually gets used.</p>';
    } else st.innerHTML = '';

    $('#bottleGrid').innerHTML = bs.map(b => {
      const bs2 = Store.bottleStats(b.id);
      const worn = Store.wornToday(b.id);
      return '<div class="bcell' + (worn ? ' worn' : '') + '" data-bottle="' + b.id + '">' +
        Art.bottleMark(b, { tag: 'g' }) +
        '<p class="bn">' + esc(b.name) + '</p>' +
        '<p class="bh">' + esc(b.house || (Content.STATUSES.find(x => x.id === b.status) || Content.STATUSES[0]).label) + '</p>' +
        '<p class="bw">' + (worn ? 'worn today' : bs2.wears ? bs2.wears + (bs2.wears === 1 ? ' wear' : ' wears') : 'never worn') + '</p>' +
        '</div>';
    }).join('');

    const ng = $('#neglected');
    if (s.neglected.length) {
      ng.innerHTML = '<h2 class="sub">The back of the shelf</h2>' +
        s.neglected.slice(0, 5).map(x =>
          '<div class="rowlink" data-bottle="' + x.b.id + '"><span class="rl">' + esc(x.b.name) + '</span>' +
          '<span class="rr">' + (x.s.last ? 'unworn ' + Store.ago(x.s.last).replace(' ago', '') : 'never worn') + '</span></div>').join('') +
        '<p class="help long">Not a scolding. Sometimes the answer is that you should wear it tomorrow, and sometimes it is that somebody else should have it.</p>';
    } else ng.innerHTML = '';
  }

  function openBottle(id) {
    currentBottle = id;
    show('bottle', true);
  }

  function renderBottle() {
    const b = Store.bottle(currentBottle);
    if (!b) { show('shelf'); return; }
    const s = Store.bottleStats(b.id);
    const ws = Store.wearsFor(b.id);
    const st = Content.STATUSES.find(x => x.id === b.status) || Content.STATUSES[0];
    const sil = Content.SILLAGE_SCALE.find(x => x.id === b.sillage);
    const worn = Store.wornToday(b.id);
    const show$ = Store.settings().showPrices;

    let h = '<div class="bighead">' + Art.bottleMark(b, { tag: 'p' }) +
      '<div>' + (b.house ? '<p class="h">' + esc(b.house) + '</p>' : '') +
      '<h1>' + esc(b.name) + '</h1></div></div>' +
      '<p class="help">' + esc(st.label) + (b.sizeMl ? ', ' + b.sizeMl + ' ml' : '') +
      ' · since ' + esc(Store.longDate(b.acquiredAt)) +
      (b.price !== null && show$ ? ' · ' + esc(money(b.price)) : '') + '</p>' +
      (b.story ? '<p class="lede" style="margin-top:16px">' + esc(b.story) + '</p>' : '');

    h += '<div class="btnrow"><button class="btn accent" data-wear="' + b.id + '">' +
      (worn ? 'Wearing it again' : 'Wearing it today') + '</button>' +
      '<button class="btn ghost small" data-newentry="' + b.id + '">Write an entry</button></div>';

    if (s.wears) {
      h += '<h2 class="sub">What the log says</h2><div class="statrow">' +
        '<div class="s"><div class="sv">' + s.wears + '</div><div class="sl">wears</div></div>' +
        '<div class="s"><div class="sv">' + Math.round(100 * s.reachRate) + '%</div><div class="sl">reach for</div></div>' +
        '<div class="s"><div class="sv">' + (s.costPerWear !== null && show$ ? money(s.costPerWear) : Store.seasonLabel(s.topSeason)) +
          '</div><div class="sl">' + (s.costPerWear !== null && show$ ? 'per wear' : 'season') + '</div></div></div>' +
        Art.monthStrip(s.months, 'Wears by month');
      const ctx = Object.keys(s.contexts).sort((a, b2) => s.contexts[b2] - s.contexts[a]);
      if (ctx.length) {
        /* A context is normally one of the eight chips, but an export is a plain text file
           and comes back in with whatever is in it. Fall back to the raw id rather than
           reading .label off nothing, which took the whole bottle page down. */
        h += '<p class="help">Mostly ' + ctx.slice(0, 2).map(c =>
          esc(((Content.CONTEXTS.find(x => x.id === c) || {}).label || c).toLowerCase())).join(' and ') + '.</p>';
      }
    } else {
      h += '<p class="help long" style="margin-top:20px">No wears logged. One tap a day for a fortnight and this page starts telling you things you did not know about yourself.</p>';
    }

    if ((b.notes || []).length) {
      h += '<h2 class="sub">Notes</h2><div class="chiprow">' +
        b.notes.map(t => '<button class="chip" data-card="' + t + '">' + esc(termName(t)) + '</button>').join('') + '</div>';
    }

    const tk = b.take || {};
    if (tk.opening || tk.heart || tk.drydown) {
      h += '<h2 class="sub">Your take</h2><div class="take">' +
        (tk.opening ? '<p><span>Opening</span>' + esc(tk.opening) + '</p>' : '') +
        (tk.heart ? '<p><span>Heart</span>' + esc(tk.heart) + '</p>' : '') +
        (tk.drydown ? '<p><span>Drydown</span>' + esc(tk.drydown) + '</p>' : '') + '</div>';
      if (sil) h += '<p class="help">Sillage: ' + esc(sil.label.toLowerCase()) + '. ' + esc(sil.note) + '</p>';
      if ((b.seasons || []).length) h += '<p class="help">Works in ' + b.seasons.map(Store.seasonLabel).join(', ').toLowerCase() + '.</p>';
    }

    const ents = Store.entries().filter(e => e.bottleId === b.id);
    if (ents.length) {
      h += '<h2 class="sub">Written while wearing it</h2>' + ents.slice(0, 4).map(e =>
        '<div class="rowlink" data-entry="' + e.id + '"><span class="rl">' + esc(clip(e.text, 60)) + '</span>' +
        '<span class="rr">' + esc(Store.ago(e.at)) + '</span></div>').join('');
    }

    if (ws.length) {
      h += '<h2 class="sub">Wear history</h2>' + ws.slice(0, 14).map(w =>
        '<div class="wearrow"><span>' + esc(Store.longDate(w.at)) +
        (w.sprays ? ' <span class="wc">' + plural(w.sprays, 'spray') + '</span>' : '') + '</span>' +
        '<span class="wc">' + esc((w.contexts || []).map(c =>
          (Content.CONTEXTS.find(x => x.id === c) || {}).label || c).join(', ')) +
        ' <button data-unwear="' + w.id + '">remove</button></span></div>').join('');
      if (ws.length > 14) h += '<p class="help">' + (ws.length - 14) + ' older wears not shown.</p>';
    }

    $('#bottleBody').innerHTML = h;
  }

  /* ---------- bottle editor ---------- */
  function openBottleSheet(id) {
    const b = id ? Store.bottle(id) : null;
    bottleEditing = b
      ? { id: b.id, notes: (b.notes || []).slice(), sillage: b.sillage, seasons: (b.seasons || []).slice() }
      : { id: null, notes: [], sillage: null, seasons: [] };
    $('#bottleSheetTitle').textContent = b ? 'Edit bottle' : 'Add a bottle';
    $('#bName').value = b ? b.name : '';
    $('#bHouse').value = b ? b.house : '';
    $('#bSize').value = b && b.sizeMl ? b.sizeMl : '';
    $('#bPrice').value = b && b.price !== null && b.price !== undefined ? b.price : '';
    $('#bAcquired').value = Store.ymd(b ? b.acquiredAt : Date.now());
    $('#bAcquired').max = Store.ymd(Date.now());
    $('#bStatus').innerHTML = Content.STATUSES.map(s =>
      '<option value="' + s.id + '">' + esc(s.label) + '</option>').join('');
    $('#bStatus').value = b ? b.status : 'bottle';
    const tk = (b && b.take) || {};
    $('#bOpening').value = tk.opening || '';
    $('#bHeart').value = tk.heart || '';
    $('#bDrydown').value = tk.drydown || '';
    $('#bStory').value = b ? b.story : '';
    $('#bDelete').hidden = !b;
    paintBottleSheet();
    $('#sheetBottle').hidden = false;
  }

  function paintBottleSheet() {
    $('#bNotes').innerHTML = bottleEditing.notes.length
      ? bottleEditing.notes.map(t => '<button class="chip on" data-unnote="' + t + '">' + esc(termName(t)) +
          Art.icon('close', 'x') + '</button>').join('')
      : '<span class="help">Optional. Notes decide the colour of the glass on your shelf.</span>';
    $('#bSillage').innerHTML = Content.SILLAGE_SCALE.map(s =>
      '<button class="chip' + (bottleEditing.sillage === s.id ? ' on' : '') + '" data-sil="' + s.id + '">' + esc(s.label) + '</button>').join('');
    $('#bSeasons').innerHTML = Content.SEASONS.map(s =>
      '<button class="chip' + (bottleEditing.seasons.includes(s.id) ? ' on' : '') + '" data-season="' + s.id + '">' + esc(s.label) + '</button>').join('');
  }

  function saveBottleSheet() {
    const name = $('#bName').value.trim();
    if (!name) { toast('It needs a name.'); $('#bName').focus(); return false; }
    const payload = {
      name,
      house: $('#bHouse').value.trim(),
      sizeMl: $('#bSize').value ? Number($('#bSize').value) : null,
      status: $('#bStatus').value,
      price: $('#bPrice').value === '' ? null : Number($('#bPrice').value),
      acquiredAt: $('#bAcquired').value ? new Date($('#bAcquired').value + 'T12:00:00').getTime() : Date.now(),
      notes: bottleEditing.notes,
      sillage: bottleEditing.sillage,
      seasons: bottleEditing.seasons,
      story: $('#bStory').value.trim(),
      take: {
        opening: $('#bOpening').value.trim(),
        heart: $('#bHeart').value.trim(),
        drydown: $('#bDrydown').value.trim()
      }
    };
    if (bottleEditing.id) Store.updateBottle(bottleEditing.id, payload);
    else { const nb = Store.addBottle(payload); currentBottle = nb ? nb.id : currentBottle; }
    tap();
    $('#sheetBottle').hidden = true;
    render(view);
    toast(bottleEditing.id ? 'Updated.' : 'On the shelf.');
  }

  /* ---------- wear sheet ---------- */
  function openWear(id) {
    const b = Store.bottle(id);
    if (!b) return;
    wearTarget = id; wearCtx = [];
    $('#wearTitle').textContent = 'Wearing ' + b.name;
    $('#wearSprays').value = '';
    $('#wearDate').value = Store.ymd(Date.now());
    $('#wearDate').max = Store.ymd(Date.now());
    paintWear();
    $('#sheetWear').hidden = false;
  }
  function paintWear() {
    $('#wearContexts').innerHTML = Content.CONTEXTS.map(c =>
      '<button class="chip' + (wearCtx.includes(c.id) ? ' on' : '') + '" data-ctx="' + c.id + '">' + esc(c.label) + '</button>').join('');
  }
  function saveWear() {
    const d = $('#wearDate').value;
    Store.logWear(wearTarget, {
      at: d ? new Date(d + 'T12:00:00').getTime() : Date.now(),
      contexts: wearCtx,
      sprays: $('#wearSprays').value ? Number($('#wearSprays').value) : null
    });
    tap(16, 120);
    $('#sheetWear').hidden = true;
    render(view);
    toast('Logged.');
  }

  /* ================= LEXICON ================= */
  function renderLexicon() {
    const v = Store.vocab();
    $('#lexEyebrow').textContent = v.total
      ? v.total + (v.total === 1 ? ' word is yours' : ' words are yours') + ' of ' + Lexicon.count
      : Lexicon.count + ' cards';
    $('#lexMode').textContent = lex.mine ? 'All' : 'Yours';

    const q = $('#lexSearch').value.trim();
    const body = $('#lexBody');

    if (q) {
      const res = Lexicon.search(q).slice(0, 80);
      body.innerHTML = res.length
        ? res.map(n => lexRow(n, v)).join('')
        : Art.blank('nothing', 'No card by that name.',
            'Try a shorter word. The search reads the card bodies as well as the terms.');
      return;
    }

    if (lex.mine) {
      if (!v.total) {
        body.innerHTML = Art.blank('lexicon', 'Your side of the atlas is blank.',
          'A word becomes yours the moment you tag an entry with it, or simply write it into one.',
          { label: 'Browse all ' + Lexicon.count + ' cards', attr: 'data-lexall="1"' });
        return;
      }
      const growth = Store.vocabGrowth(16);
      const rising = growth.length > 1 && growth[growth.length - 1].n > growth[0].n;
      body.innerHTML =
        (rising ? '<h2 class="sub">Sixteen weeks</h2>' + Art.growthChart(growth) : '') +
        '<h2 class="sub">Yours, most used first</h2>' +
        v.list.map(u => lexRow(Lexicon.get(u.id), v, u)).join('');
      return;
    }

    if (lex.family) {
      const fam = Lexicon.family(lex.family);
      const nodes = Lexicon.byFamily(lex.family);
      body.innerHTML =
        '<button class="btn bare" data-fam="">All families</button>' +
        '<h2 class="sub">' + esc(fam.name) + '</h2>' +
        '<p class="help long" style="margin-top:0">' + esc(fam.blurb) + '</p>' +
        nodes.map(n => lexRow(n, v)).join('');
      return;
    }

    body.innerHTML = Lexicon.FAMILIES.map(f => {
      const nodes = Lexicon.byFamily(f.id);
      const known = v.byFamily[f.id] || 0;
      return '<div class="famrow" data-fam="' + f.id + '">' +
        Art.familyBadge(f, known, nodes.length) +
        '<div><h4>' + esc(f.name) + '</h4><p>' + esc(f.blurb) + '</p></div>' +
        '<span class="fc">' + known + ' / ' + nodes.length + '</span></div>';
    }).join('');
  }

  function lexRow(n, v, use) {
    if (!n) return '';
    const u = use || (v.list || []).find(x => x.id === n.id);
    return '<div class="lexrow" data-card="' + n.id + '">' +
      '<span class="lt">' + esc(n.t) + '</span>' +
      (u ? '<span class="lu">used ' + u.count + '</span>' : '<span class="lw">' + esc(clip(n.w, 62)) + '</span>') +
      '</div>';
  }

  function openCard(id) {
    if (!Lexicon.get(id)) return;
    currentCard = id;
    show('card', true);
  }

  function renderCard() {
    const n = Lexicon.get(currentCard);
    if (!n) { show('lexicon'); return; }
    const fam = Lexicon.family(n.f);
    $('#cardFamily').textContent = fam.name;
    const v = Store.vocab().list.find(u => u.id === n.id);
    const entries = Store.entries().filter(e =>
      (e.tags || []).includes(n.id) || Lexicon.termsIn(e.text + ' ' + e.anchor).includes(n.id));
    const bottles = Store.bottles().filter(b => (b.notes || []).includes(n.id));

    const famNodes = Lexicon.byFamily(n.f);
    const famKnown = Store.vocab().byFamily[n.f] || 0;
    let h = '<div class="cardview">' +
      Art.familyBadge(fam, famKnown, famNodes.length).replace('class="fbadge"', 'class="fbadge cbadge"') +
      '<h1>' + esc(n.t) + '</h1>' +
      '<p class="cw">' + esc(n.w) + '</p>' +
      '<p class="co">' + esc(n.o) + '</p>';

    if (n.r.length) {
      h += '<h2 class="sub">Nearby</h2><div class="chiprow">' +
        n.r.map(id => '<button class="chip" data-card="' + id + '">' + esc(termName(id)) + '</button>').join('') + '</div>';
    }

    h += '<p class="cmeta">' + (v
      ? 'Yours since ' + esc(Store.longDate(v.firstAt)) + '. Used ' + v.count + (v.count === 1 ? ' time.' : ' times.')
      : 'Not yet one of your words. Use it in an entry and it becomes one.') + '</p>';

    if (entries.length) {
      h += '<h2 class="sub">Where you have used it</h2>' + entries.slice(0, 6).map(e =>
        '<div class="rowlink" data-entry="' + e.id + '"><span class="rl">' + esc(clip(e.text, 58)) + '</span>' +
        '<span class="rr">' + esc(Store.ago(e.at)) + '</span></div>').join('');
    }
    if (bottles.length) {
      h += '<h2 class="sub">On your shelf</h2>' + bottles.map(b =>
        '<div class="rowlink" data-bottle="' + b.id + '"><span class="rl">' + esc(b.name) + '</span>' +
        '<span class="rr">' + esc(b.house || '') + '</span></div>').join('');
    }
    const near = famNodes.filter(x => x.id !== n.id && !n.r.includes(x.id));
    const start = Art.hash(n.id) % Math.max(1, near.length - 6);
    h += '<h2 class="sub">More from ' + esc(fam.name.replace(/^The /, '')) + '</h2>' +
      near.slice(start, start + 6).map(x =>
        '<div class="lexrow" data-card="' + x.id + '"><span class="lt">' + esc(x.t) + '</span>' +
        '<span class="lw">' + esc(clip(x.w, 58)) + '</span></div>').join('');
    h += '</div>';
    $('#cardBody').innerHTML = h;
  }

  /* ================= SKILL DASHBOARD ================= */
  function renderSkill() {
    const acc = Store.accuracySeries();
    const growth = Store.vocabGrowth(16);
    const shelves = Store.shelfAccuracy();
    const span = Store.memorySpan();
    const v = Store.vocab();
    const weak = Store.weakMaterials(5);
    const sess = Store.sessions();

    let h = '';
    if (!sess.length) {
      $('#skillBody').innerHTML = Art.blank('skill', 'No curve yet.',
        'Run one session and this page starts drawing: accuracy, vocabulary, memory span, and the shelf that keeps beating you.',
        { label: 'Go to Train', attr: 'data-goto="train"' });
      return;
    }

    const last5 = acc.slice(-5), first5 = acc.slice(0, 5);
    const avg = a => a.length ? Math.round(a.reduce((n, x) => n + x.pct, 0) / a.length) : null;

    h += '<h2 class="sub">Identification accuracy</h2>';
    if (acc.length > 1) {
      h += Art.accuracyCurve(acc);
      const l = avg(last5), f = avg(first5);
      const recent = acc.length >= 6 ? 'Your last five average ' + l + ' percent, against ' +
                     f + ' percent for your first five.'
                   : 'Across all of them you average ' + avg(acc) + ' percent.';
      h += '<p class="help long">' + plural(acc.length, 'scored session') + '. ' + recent +
        ' You mark yourself, so this number is a record of your honesty as much as your nose.</p>';
    } else {
      h += '<p class="help long">One scored session so far. The curve needs two.</p>';
    }

    h += '<h2 class="sub">Vocabulary</h2>' +
      '<p class="bignum">' + v.total + ' <small>OF ' + Lexicon.count + ' CARDS</small></p>';
    if (growth.length > 1 && growth[growth.length - 1].n > growth[0].n) h += Art.growthChart(growth);
    const fams = Object.keys(v.byFamily).sort((a, b) => v.byFamily[b] - v.byFamily[a]);
    if (fams.length) {
      h += '<p class="help long">Deepest in ' + esc((Lexicon.family(fams[0]) || {}).name.toLowerCase()) +
        (fams.length > 1 ? ', thinnest in ' + esc((Lexicon.family(fams[fams.length - 1]) || {}).name.toLowerCase()) : '') +
        '. Vocabulary is not decoration: naming a thing is most of being able to find it again.</p>';
    }

    h += '<h2 class="sub">Memory span</h2>' +
      '<p class="bignum">' + (span ? span + ' <small>' + (span === 1 ? 'SECOND' : 'SECONDS') + '</small>' : 'not yet');
    h += '</p><p class="help long">' + (span
      ? 'The longest gap you have carried a smell across and still picked it out.'
      : 'Run a recall session and this fills in.') + '</p>';

    h += '<h2 class="sub">By shelf</h2>' + Art.shelfBars(shelves);

    if (weak.length) {
      h += '<h2 class="sub">Send yourself back to these</h2>' +
        weak.map(w => {
          const m = Content.material(w.mat);
          return '<div class="missrow"><span>' + esc(m ? m.name : w.mat) +
            ' <span class="wc">' + w.got + ' of ' + w.seen + '</span></span>' +
            (m && m.lex ? '<a href="#" data-card="' + m.lex + '">' + esc(termName(m.lex)) + '</a>' : '') + '</div>';
        }).join('');
    }

    const notes = sess.filter(s => s.note).slice(0, 5);
    if (notes.length) {
      h += '<h2 class="sub">What you wrote afterwards</h2>' + notes.map(s =>
        '<div class="card"><p class="help" style="margin:0 0 5px">' + esc(Store.longDate(s.at)) + '</p>' +
        '<p style="font-family:var(--serif);font-size:16.5px;line-height:1.45">' + esc(s.note) + '</p></div>').join('');
    }

    $('#skillBody').innerHTML = h;
  }

  /* ================= SETTINGS ================= */
  function renderSettings() {
    const s = Store.settings();
    $('#setRemind').checked = s.remindOn;
    $('#setTime').value = s.remindTime;
    $('#setEvery').value = String(s.remindEvery);
    $('#setResurface').checked = s.resurfaceOn;
    $('#setHemi').value = s.hemisphere;
    $('#setCurrency').value = s.currency;
    $('#setPrices').checked = s.showPrices;
    const c = Store.counts();
    $('#countLine').textContent = c.entries + (c.entries === 1 ? ' entry, ' : ' entries, ') +
      c.bottles + (c.bottles === 1 ? ' bottle, ' : ' bottles, ') +
      c.wears + (c.wears === 1 ? ' wear, ' : ' wears, ') +
      c.sessions + (c.sessions === 1 ? ' session, ' : ' sessions, ') +
      c.terms + (c.terms === 1 ? ' word.' : ' words.');
  }

  /* ================= NOTIFICATIONS ================= */
  function plan() {
    if (!N || !N.scheduleNotifications) return;
    const s = Store.settings();
    if (!s.remindOn) { try { N.cancelNotifications(); } catch (e) {} return; }
    if (N.notificationsAllowed && !N.notificationsAllowed()) return;

    const out = [];
    const [hh, mm] = (s.remindTime || '07:00').split(':').map(Number);
    const step = Math.max(1, Number(s.remindEvery) || 1);
    const next = Store.nextSession('foundations') || Store.nextSession('conservatory');
    let id = 1;
    for (let i = 0; i < 20 && out.length < 40; i++) {
      const d = new Date();
      d.setHours(hh, mm, 0, 0);
      d.setDate(d.getDate() + i * step);
      if (d.getTime() <= Date.now()) continue;
      out.push({
        id: id++,
        at: d.getTime(),
        title: 'A few minutes for your nose',
        body: next
          ? next.title + '. You will need ' + next.mats.slice(0, 3).map(m =>
              ((Content.material(m) || {}).name || m).toLowerCase()).join(', ') + '.'
          : 'Repeat a shelf. Blind, self-scored, four minutes.'
      });
    }

    if (s.resurfaceOn) {
      for (const r of Store.upcomingResurfaces(Date.now(), 30)) {
        if (out.length >= 60) break;
        const d = new Date(r.at);
        d.setHours(Math.max(9, hh), mm, 0, 0);
        if (d.getTime() <= Date.now()) continue;
        out.push({
          id: id++,
          at: d.getTime(),
          title: r.years === 1 ? 'One year ago today' : r.years + ' years ago today',
          body: clip(r.entry.anchor || r.entry.text, 110)
        });
      }
    }

    out.sort((a, b) => a.at - b.at);
    try { N.scheduleNotifications(JSON.stringify(out.slice(0, 60))); } catch (e) {}
  }

  function askNotifications() {
    if (N && N.requestNotificationPermission && N.notificationsAllowed && !N.notificationsAllowed()) {
      try { N.requestNotificationPermission(); } catch (e) {}
    }
  }

  /* ================= ONBOARDING ================= */
  function renderOb() {
    for (const c of $$('.ob-card')) c.classList.toggle('is-on', Number(c.dataset.step) === obStep);
    $('#obDots').innerHTML = [0, 1, 2].map(i => '<i class="' + (i === obStep ? 'on' : '') + '"></i>').join('');
    $('#obBack').hidden = obStep === 0;
    $('#obNext').textContent = obStep === 2 ? 'Begin' : 'Next';
  }

  function finishOb() {
    const anchor = $('#obAnchor').value.trim();
    Store.settings({
      remindOn: $('#obRemind').checked,
      remindTime: $('#obTime').value || '07:00',
      hemisphere: $('#obHemi').value
    });
    if (anchor) {
      Store.addEntry({
        text: 'The first one, written before I knew what I was doing.',
        anchor,
        tags: Lexicon.termsIn(anchor).slice(0, 4),
        feeling: null, place: '', people: []
      });
    }
    Store.onboarded(true);
    if ($('#obRemind').checked) askNotifications();
    $('#onboard').hidden = true;
    startApp();
  }

  function startApp() {
    show('journal');
    plan();
  }

  /* ================= EVENTS ================= */
  function actions(ev) {
    const t = ev.target;

    const card = t.closest('[data-card]');
    if (card) { ev.preventDefault(); closeSheets(); openCard(card.dataset.card); return; }

    const entryEl = t.closest('[data-entry]');
    if (entryEl) { openEntry(entryEl.dataset.entry); return; }

    const bottleEl = t.closest('[data-bottle]');
    if (bottleEl) { openBottle(bottleEl.dataset.bottle); return; }

    const famEl = t.closest('[data-fam]');
    if (famEl) { lex.family = famEl.dataset.fam || null; lex.mine = false; renderLexicon(); return; }

    const startEl = t.closest('[data-start]');
    if (startEl) { startDrill(startEl.dataset.start); return; }

    const repeatEl = t.closest('[data-repeat]');
    if (repeatEl) { pickRepeat(); return; }

    const trackEl = t.closest('[data-track]');
    if (trackEl) {
      const s = Store.nextSession(trackEl.dataset.track);
      if (s) startDrill(s.id);
      else toast('Every session in that track is done. Repeat one from the card above.');
      return;
    }

    const gotoEl = t.closest('[data-goto]');
    if (gotoEl) { show(gotoEl.dataset.goto); return; }

    if (t.closest('[data-addbottle]')) { openBottleSheet(null); return; }
    if (t.closest('[data-lexall]')) { lex.mine = false; lex.family = null; renderLexicon(); return; }

    const wearEl = t.closest('[data-wear]');
    if (wearEl) { openWear(wearEl.dataset.wear); return; }

    const unwearEl = t.closest('[data-unwear]');
    if (unwearEl) { Store.removeWear(unwearEl.dataset.unwear); renderBottle(); toast('Removed.'); return; }

    const newEl = t.closest('[data-newentry]');
    if (newEl) {
      openEntry(null);
      $('#eBottle').value = newEl.dataset.newentry;
      return;
    }

    const untag = t.closest('[data-untag]');
    if (untag) { draft.tags = draft.tags.filter(x => x !== untag.dataset.untag); paintEntry(); return; }

    const unnote = t.closest('[data-unnote]');
    if (unnote) { bottleEditing.notes = bottleEditing.notes.filter(x => x !== unnote.dataset.unnote); paintBottleSheet(); return; }

    const tg = t.closest('[data-tag]');
    if (tg) {
      const id = tg.dataset.tag;
      if (tagPick.includes(id)) tagPick = tagPick.filter(x => x !== id);
      else if (tagPick.length < 12) tagPick.push(id);
      else toast('Twelve notes is plenty for one entry.');
      paintTagList();
      return;
    }

    const feel = t.closest('[data-feel]');
    if (feel) { draft.feeling = draft.feeling === feel.dataset.feel ? null : feel.dataset.feel; tap(10, 90); paintEntry(); return; }

    const sil = t.closest('[data-sil]');
    if (sil) { bottleEditing.sillage = bottleEditing.sillage === sil.dataset.sil ? null : sil.dataset.sil; paintBottleSheet(); return; }

    const sea = t.closest('[data-season]');
    if (sea) {
      const id = sea.dataset.season;
      bottleEditing.seasons = bottleEditing.seasons.includes(id)
        ? bottleEditing.seasons.filter(x => x !== id) : bottleEditing.seasons.concat([id]);
      paintBottleSheet();
      return;
    }

    const ctx = t.closest('[data-ctx]');
    if (ctx) {
      const id = ctx.dataset.ctx;
      wearCtx = wearCtx.includes(id) ? wearCtx.filter(x => x !== id) : wearCtx.concat([id]);
      paintWear();
      return;
    }

    const dr = t.closest('[data-drill]');
    if (dr) { if (!drill) return; advanceDrill(dr.dataset.drill); return; }

    const ld = t.closest('[data-ladder]');
    if (ld) { if (!drill) return; drill.results.push({ mat: ld.dataset.ladder }); tap(8, 80); paintDrill(); return; }

    const gs = t.closest('[data-guess]');
    if (gs) { if (!drill) return; drill.guess = gs.dataset.guess; paintDrill(); return; }

    const vd = t.closest('[data-verdict]');
    if (vd) {
      if (!drill) return;
      const hit = vd.dataset.verdict === 'hit';
      if (drill.s.kind === 'recall') {
        drill.results.push({ mat: drill.target, ok: hit, guess: hit ? null : drill.guess });
        tap(hit ? 14 : 22, hit ? 110 : 150);
        finishDrill();
      } else if (hit) {
        drill.results.push({ mat: drill.guess, ok: true });
        tap(14, 110);
        nextIdRound();
      } else {
        drill.phase = 'id-truth';
        paintDrill();
      }
      return;
    }

    const tr = t.closest('[data-truth]');
    if (tr) {
      if (!drill) return;
      drill.results.push({ mat: tr.dataset.truth, ok: false, guess: drill.guess });
      tap(20, 140);
      nextIdRound();
      return;
    }
  }

  function nextIdRound() {
    drill.idx++;
    drill.guess = null;
    if (drill.idx >= drill.order.length) finishDrill();
    else { drill.phase = 'id-guess'; paintDrill(); }
  }

  /* ---------- binding ---------- */
  function bind() {
    for (const b of $$('.tab')) b.onclick = () => { tap(8, 80); show(b.dataset.view); };

    $('#obNext').onclick = () => { if (obStep === 2) finishOb(); else { obStep++; renderOb(); } };
    $('#obBack').onclick = () => { obStep = Math.max(0, obStep - 1); renderOb(); };
    $('#obRestore').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const res = Store.importJson(String(r.result));
        $('#obRestoreNote').textContent = res.message;
        if (res.ok) { Store.onboarded(true); $('#onboard').hidden = true; startApp(); }
      };
      r.onerror = () => { $('#obRestoreNote').textContent = 'That file could not be read.'; };
      r.readAsText(f);
      e.target.value = '';
    };

    $('#toSettings').onclick = () => show('settings', true);
    $('#settingsBack').onclick = () => back() || show('journal');
    $('#toSkill').onclick = () => show('skill', true);
    $('#skillBack').onclick = () => back() || show('train');
    $('#bottleBack').onclick = () => back() || show('shelf');
    $('#cardBack').onclick = () => back() || show('lexicon');
    $('#bottleEdit').onclick = () => openBottleSheet(currentBottle);

    $('#newEntry').onclick = () => { tap(); openEntry(null); };
    $('#entryCancel').onclick = () => { editing = null; back() || show('journal'); };
    $('#entrySave').onclick = once(saveEntry);
    $('#eAddTag').onclick = () => openTags('entry');
    $('#eSuggest').onclick = () => {
      const found = Lexicon.termsIn($('#eText').value + ' ' + $('#eAnchor').value)
        .filter(id => !draft.tags.includes(id));
      if (!found.length) { toast('No lexicon words in there yet. Add one by hand.'); return; }
      draft.tags = draft.tags.concat(found).slice(0, 12);
      paintEntry();
      toast(found.length === 1 ? 'One word picked up.' : found.length + ' words picked up.');
    };
    $('#eScaffold').onclick = () => {
      draft.scaffold = (draft.scaffold + 1) % Content.SCAFFOLDS.length;
      paintEntry();
    };
    $('#eAnchor').oninput = () => paintEntry();
    $('#eDelete').onclick = () => {
      const b = $('#eDelete');
      if (b.dataset.armed) { Store.removeEntry(editing.id); editing = null; show('journal'); toast('Gone.'); }
      else {
        b.dataset.armed = '1'; b.textContent = 'Tap again to delete';
        setTimeout(() => { delete b.dataset.armed; b.textContent = 'Delete this entry'; }, 4000);
      }
    };

    $('#entrySearch').oninput = () => renderJournal();
    $('#lexSearch').oninput = () => renderLexicon();
    $('#lexMode').onclick = () => { lex.mine = !lex.mine; lex.family = null; renderLexicon(); };
    $('#tagSearch').oninput = () => paintTagList();
    $('#tagDone').onclick = commitTags;

    $('#drillQuit').onclick = () => {
      stopTimer();
      if (drill && drill.results.length && drill.phase !== 'done') {
        const b = $('#drillQuit');
        if (!b.dataset.armed) {
          b.dataset.armed = '1'; b.textContent = 'Leave and lose it';
          setTimeout(() => { delete b.dataset.armed; b.textContent = 'Leave'; }, 4000);
          return;
        }
      }
      $('#drillQuit').textContent = 'Leave';
      delete $('#drillQuit').dataset.armed;
      drill = null;
      back() || show('train');
    };

    $('#addBottle').onclick = () => openBottleSheet(null);
    $('#bSave').onclick = once(saveBottleSheet);
    $('#bCancel').onclick = () => { $('#sheetBottle').hidden = true; };
    $('#bAddNote').onclick = () => openTags('bottle');
    $('#bDelete').onclick = () => {
      const b = $('#bDelete');
      if (b.dataset.armed) {
        Store.removeBottle(bottleEditing.id);
        $('#sheetBottle').hidden = true;
        show('shelf');
        toast('Removed from the shelf.');
      } else {
        b.dataset.armed = '1'; b.textContent = 'Tap again';
        setTimeout(() => { delete b.dataset.armed; b.textContent = 'Remove'; }, 4000);
      }
    };

    $('#wearCancel').onclick = () => { $('#sheetWear').hidden = true; };
    $('#wearSave').onclick = once(saveWear);

    $('#setRemind').onchange = e => {
      Store.settings({ remindOn: e.target.checked });
      if (e.target.checked) askNotifications();
      plan();
    };
    $('#setTime').onchange = e => { Store.settings({ remindTime: e.target.value || '07:00' }); plan(); };
    $('#setEvery').onchange = e => { Store.settings({ remindEvery: Number(e.target.value) }); plan(); };
    $('#setResurface').onchange = e => { Store.settings({ resurfaceOn: e.target.checked }); plan(); };
    $('#setHemi').onchange = e => { Store.settings({ hemisphere: e.target.value }); };
    $('#setCurrency').onchange = e => { Store.settings({ currency: e.target.value.trim() || '$' }); };
    $('#setPrices').onchange = e => { Store.settings({ showPrices: e.target.checked }); };

    $('#exJson').onclick = () => download('sillage-export.json', 'application/json', Store.exportJson());
    $('#exCsv').onclick = () => download('sillage-entries.csv', 'text/csv', Store.exportCsv());
    $('#exShelf').onclick = () => download('sillage-shelf.csv', 'text/csv', Store.exportShelfCsv());
    $('#importFile').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const res = Store.importJson(String(r.result));
        $('#ioNote').textContent = res.message;
        if (res.ok) { renderSettings(); plan(); }
      };
      r.onerror = () => { $('#ioNote').textContent = 'That file could not be read.'; };
      r.readAsText(f);
      e.target.value = '';
    };
    $('#eraseBtn').onclick = () => {
      const b = $('#eraseBtn');
      if (b.dataset.armed) {
        Store.erase();
        if (N && N.cancelNotifications) { try { N.cancelNotifications(); } catch (e) {} }
        location.reload();
      } else {
        b.dataset.armed = '1'; b.textContent = 'Tap again to erase everything';
        setTimeout(() => { delete b.dataset.armed; b.textContent = 'Erase everything'; }, 4000);
      }
    };

    for (const sh of $$('.sheet')) {
      sh.addEventListener('click', e => { if (e.target === sh) sh.hidden = true; });
    }

    document.addEventListener('click', actions);
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const w = e.target.closest && e.target.closest('[data-feel]');
      if (w) { e.preventDefault(); w.click(); }
    });
  }

  /** The one mark, in every place the app introduces itself. */
  function paintMarks() {
    const journal = $('#mastJournal');
    if (journal) journal.innerHTML = Art.trailRule({ id: 'j' });
    for (const [id, key] of [['#mastTrain', 't'], ['#mastShelf', 's'], ['#mastLexicon', 'x']]) {
      const el = $(id);
      if (el) el.innerHTML = Art.trailRule({ id: key, halo: false });
    }
    const ob = $('#obMark');
    if (ob) ob.innerHTML = Art.trail({ id: 'o' });
    const labels = { journal: 'Journal', train: 'Train', shelf: 'Shelf', lexicon: 'Lexicon' };
    for (const b of $$('.tab')) {
      b.innerHTML = Art.icon(b.dataset.view) + '<span class="tlab">' + labels[b.dataset.view] + '</span>';
    }
  }

  function init() {
    paintMarks();
    bind();
    if (Store.onboarded()) startApp();
    else { $('#onboard').hidden = false; renderOb(); }
  }

  /* ---------- the Android shell calls these ---------- */
  function back() {
    const sheet = topSheet();
    if (sheet) { sheet.hidden = true; return true; }
    if (view === 'drill') { stopTimer(); drill = null; show('train'); return true; }
    if (view === 'lexicon' && (lex.family || lex.mine)) { lex.family = null; lex.mine = false; renderLexicon(); return true; }
    if (stack.length) { const prev = stack.pop(); show(prev); return true; }
    if (view !== 'journal' && !$('#tabs').hidden) { show('journal'); return true; }
    return false;
  }

  function onPause() { stopTimer(); }

  /* Coming back to a round in progress keeps it. Answering the phone in the middle of a
     blind set used to throw the whole round away, which is a cruel thing to do to six
     jars of correctly named spice. Only the clock is restarted, from where it stopped. */
  function onResume() {
    if (!Store.onboarded()) return;
    if (drill && !drill.timer) {
      if (drill.phase === 'attend') runTimer(drill.left || drill.s.hold || 20, stepAttend);
      else if (drill.phase === 'recall-wait') {
        runTimer(drill.left || drill.s.wait || 60, () => { drill.phase = 'recall-find'; drill.guess = null; paintDrill(); });
      }
    }
    render(view);
    plan();
  }

  document.addEventListener('DOMContentLoaded', init);
  return { back, onPause, onResume, show, openEntry, openBottle, openCard, startDrill, toast, plan };
})();

// A top-level const in a classic script is not on window, and the shell looks for window.App.
window.App = App;
