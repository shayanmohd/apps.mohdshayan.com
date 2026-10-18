/* Wildergarden. Views, the two things you actually do (put it down, write it
   down), and the plumbing to the Android shell. */
const App = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  /* Resolved on every call. A shell that attaches the bridge after this file parses
     still gets the native paths, and a browser still gets the fallbacks. */
  const nat = () => window.Native || null;

  let S = null;
  let page = null, sheetOpen = false, noteOpen = false;
  let obIndex = 0, obFeeds = [];
  let tallyDate = null, tallyValue = 45;
  let photo = { hour: 18, wide: true };
  let ticker = 0;

  const PAGES = ['guide', 'almanac', 'tally', 'photo', 'settings', 'pledge'];

  /* Every icon in the static markup is drawn from the one set, so there is a
     single stroke width and corner language in the whole app. */
  function paintIcons(root) {
    for (const el of (root || document).querySelectorAll('[data-ic]')) {
      if (!el.firstChild) el.innerHTML = Mark.icon(el.dataset.ic);
    }
  }

  /** The seal on the notebook handle: today's growth, and how far the valley has come. */
  function renderSeal() {
    const slot = $('#handleSeal');
    if (!slot || !S) return;
    const fill = Math.max(0, Math.min(1, S.todayStill / 130));
    const leaves = S.seenCount === 0 ? 0 : S.seenCount < 8 ? 1 : S.seenCount < 22 ? 2 : 3;
    const key = fill.toFixed(2) + ':' + leaves;
    if (slot.dataset.key === key) return;
    slot.dataset.key = key;
    slot.innerHTML = Mark.seal({ size: 34, fill, leaves, live: true });
  }

  /* ---------- small helpers ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function buzz(ms) {
    if (!Store.settings().haptics) return;
    const N = nat();
    try { if (N && N.vibrate) N.vibrate(ms || 18, 70); else if (navigator.vibrate) navigator.vibrate(ms || 18); } catch (e) {}
  }
  function hm(mins) {
    mins = Math.max(0, Math.round(mins));
    if (mins < 60) return mins + (mins === 1 ? ' minute' : ' minutes');
    const h = Math.floor(mins / 60), r = mins % 60;
    return r ? `${h}h ${r}m` : `${h} ${h === 1 ? 'hour' : 'hours'}`;
  }
  function download(name, mime, text) {
    const N = nat();
    if (N && N.saveFile) {
      const b64 = btoa(unescape(encodeURIComponent(text)));
      const uri = N.saveFile(name, mime, b64);
      toast(uri ? 'Saved to Downloads' : 'Could not save the file');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Exported');
  }

  /* ---------- the one notification ---------- */
  function scheduleReminder() {
    const N = nat();
    if (!N || !N.scheduleNotifications) return;
    const s = Store.settings();
    if (!s.remind) { try { N.cancelNotifications(); } catch (e) {} return; }
    if (N.notificationsAllowed && !N.notificationsAllowed()) {
      try { N.requestNotificationPermission(); } catch (e) {}
    }
    const [h, m] = (s.remindTime || '21:30').split(':').map(Number);
    const plan = [];
    for (let i = 0; i < 7; i++) {
      const day = Store.addDays(Store.today(), i);
      if (i === 0 && Store.dayEntry(day)) continue;
      const at = Store.parse(day); at.setHours(h, m, 0, 0);
      if (at.getTime() <= Date.now()) continue;
      plan.push({ id: i + 1, at: at.getTime(), title: 'Close the day',
                  body: 'How long did the feeds have you?' });
    }
    try { N.scheduleNotifications(JSON.stringify(plan)); } catch (e) {}
  }

  /* ---------- state ---------- */
  function refresh(opts) {
    const live = Store.live();
    if (live && Date.now() - live.s > 14 * 3600000) { Store.end(live.s + 14 * 3600000); }
    S = Sim.compute();
    Valley.setState(S, opts);
    renderTop(); renderDeck(); renderMenu();
    if (page) renderPage(page);
  }

  /* ---------- top strip ---------- */
  function renderTop() {
    $('#tbDate').textContent = Store.longDate(S.today);
    const e = Valley.envNow();
    $('#tbSeason').textContent = e.season.name;
    $('#tbCount').textContent = `${S.residentCount} of ${S.total}`;
    const b = S.blight / Sim.BLIGHT_CAP;
    $('#tbBlight').textContent = b < 0.04 ? 'no blight' : b < 0.3 ? 'edges greying' : b < 0.65 ? 'blight spreading' : 'valley faded';
  }

  /* ---------- deck ---------- */
  function renderDeck() {
    const running = S.running;
    $('#actBtn').textContent = running ? 'Pick it up' : 'Put it down';
    const wideBtn = $('#wideBtn');
    const wideNow = Valley.isWide();
    wideBtn.setAttribute('aria-label', wideNow ? 'Come closer' : 'See the whole valley');
    const wantIc = wideNow ? 'near' : 'wide';
    const slot = wideBtn.firstElementChild;
    if (slot.dataset.ic !== wantIc) { slot.dataset.ic = wantIc; slot.innerHTML = Mark.icon(wantIc); }
    renderSeal();

    let st;
    if (running) {
      const m = S.liveMinutes;
      st = m < 1 ? 'The clock has started. ' : `Still for ${hm(m)}. `;
      st += m < 45 ? 'At 45 minutes it starts to count for more.'
          : m < 120 ? 'Deep still at two hours, and it counts for half again.'
          : m < 240 ? 'Deep still. This one is counting for half again as much.'
          : 'A long still. Counting for nearly double.';
    } else if (S.residentCount === 0) {
      st = 'The valley is bare. Put the phone down for an hour and the grass comes.';
    } else {
      const lastA = S.arrivals[S.arrivals.length - 1];
      const fresh = lastA && Store.diffDays(lastA.date, S.today) <= 1;
      st = fresh ? `${Species.get(lastA.id).name} arrived. ` : '';
      st += S.blight > Sim.BLIGHT_CAP * 0.25
        ? 'The far ends have gone grey. A clean day pulls the colour back.'
        : S.residentCount === 1 ? 'One species is living here. The rest are still coming.'
          : `${S.residentCount} species are living here.`;
    }
    $('#status').textContent = st;

    const p = $('#prompt');
    const missed = S.unlogged.length;
    const hour = new Date().getHours();
    if (missed > 0) {
      p.hidden = false;
      p.innerHTML = `<b>${missed} ${missed === 1 ? 'day is' : 'days are'} not written down.</b> <span class="go">${missed === 1 ? 'Tally it' : 'Tally them'}</span>`;
    } else if (!S.todayLogged && (hour >= 17 || hour < 4)) {
      p.hidden = false;
      p.innerHTML = '<b>Today is not written down yet.</b> <span class="go">Write it down</span>';
    } else {
      p.hidden = true;
    }
  }

  function renderMenu() {
    $('#mGuide').textContent = `${S.seenCount} of ${S.total} found`;
    const w = Almanac.weeks(S)[0];
    $('#mAlmanac').textContent = w ? `${w.clean} clean ${w.clean === 1 ? 'day' : 'days'} this week` : 'This week';
    $('#mTally').textContent = S.todayLogged ? `Today: ${hm(S.todayFeed)}`
      : S.unlogged.length ? `${S.unlogged.length} not written down` : 'Today is blank';
  }

  /* ---------- plates ---------- */
  const PLATE_ENV = Paint.env(new Date(2026, 5, 21, 13, 0), 'north', 0);
  function drawPlate(cv, sp, known) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const P = cv.clientWidth || parseInt(cv.getAttribute('width'), 10) || 52;
    cv.width = Math.round(P * dpr); cv.height = Math.round(P * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, P, P);
    const f = sp.family;
    let s, y;
    if (f === 'insect') { s = P * 0.34; y = P * 0.5 + s * 2.2; }
    else if (f === 'butterfly') { s = P * 0.3; y = P * 0.5 + s * 3.4; }
    else if (f === 'flyer') { s = P * 0.42; y = P * 0.5; }
    else if (f === 'fish') { s = P * 0.36; y = P * 0.55; }
    else if (f === 'tree') { s = P * 0.78; y = P * 0.9; }
    else if (f === 'moss') { s = P * 0.22; y = P * 0.62; }
    else { s = P * 0.6; y = P * 0.88; }
    const cols = sp.pal.map(c => known ? Paint.rgb(Paint.hx(c)) : Paint.rgb(Paint.desat(Paint.hx(c), 0.9)));
    Paint.draw(g, f, P / 2, y, s, cols, 0, 0);
  }

  /* ---------- species note ---------- */
  function showNote(id, isNew) {
    const sp = Species.get(id);
    if (!sp) return;
    const st = S.species[id];
    $('#noteBiome').textContent = isNew ? 'New arrival' : Species.biome(sp.biome).name;
    $('#noteName').textContent = sp.name;
    drawPlate($('#notePlate'), sp, st.seen);
    let when = '';
    if (st.arrivedAt) {
      const d = Store.diffDays(st.arrivedAt, S.today);
      when = `Arrived ${Store.shortDate(st.arrivedAt)}` + (d === 0 ? ', today' : d === 1 ? ', yesterday' : `, ${d} days ago`);
      if (st.status === 'withdrawn') when += '. Withdrawn for now';
    } else {
      when = 'Not here yet';
    }
    $('#noteWhen').textContent = when;
    $('#noteText').textContent = sp.note;
    const dep = $('#noteDep');
    if (st.status === 'resident') { dep.hidden = true; }
    else { dep.hidden = false; dep.textContent = st.status === 'withdrawn'
      ? 'It left when the blight reached this part of the valley. Clean days bring it back.'
      : Species.hint(sp, S); }
    $('#note').hidden = false; noteOpen = true;
  }
  function closeNote() { $('#note').hidden = true; noteOpen = false; }

  function checkArrivals() {
    const fresh = S.arrivals.filter(a => !Store.acked(a.id));
    if (!fresh.length) return false;
    // only something that actually turned up in the last day or two gets a card
    const recent = fresh.filter(a => Store.diffDays(a.date, S.today) <= 2);
    for (const x of fresh) Store.ack(x.id);
    if (!recent.length) return false;
    const a = recent[recent.length - 1];
    const sp = Species.get(a.id);
    if (sp.rule || sp.req > 4000) buzz(26);
    showNote(a.id, true);
    return true;
  }

  /* ---------- sheet + pages ---------- */
  function openSheet() { renderMenu(); $('#sheet').hidden = false; sheetOpen = true; }
  function closeSheet() { $('#sheet').hidden = true; sheetOpen = false; }

  function go(id) {
    closeSheet();
    for (const p of PAGES) $('#p-' + p).hidden = true;
    page = id;
    renderPage(id);
    $('#p-' + id).hidden = false;
    stagger(id);
  }
  /* A list settles in when you open the screen. Re-rendering it later does not
     replay the animation, which would look like a glitch rather than an entrance. */
  function stagger(id) {
    const box = id === 'guide' ? $('#guideBody') : id === 'almanac' ? $('#almanacBody') : null;
    if (!box) return;
    box.classList.add('stagger');
    clearTimeout(stagger._t);
    stagger._t = setTimeout(() => box.classList.remove('stagger'), 800);
  }
  function closePage() {
    if (!page) return;
    $('#p-' + page).hidden = true;
    page = null;
    tallyDate = null;
    refresh();
  }
  function renderPage(id) {
    if (id === 'guide') renderGuide();
    else if (id === 'almanac') renderAlmanac();
    else if (id === 'tally') renderTally();
    else if (id === 'photo') renderPhoto();
    else if (id === 'settings') renderSettings();
  }

  /* ---------- field guide ---------- */
  function renderGuide() {
    $('#guideMeta').textContent = `${S.seenCount} of ${S.total}`;
    const box = $('#guideBody');
    box.innerHTML = '';
    if (S.seenCount === 0) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.innerHTML = Mark.emptyGround() +
        '<p>Nothing has arrived yet. The guide fills itself in as the valley does, and it keeps the ' +
        'date each thing first turned up. Grass comes after your first still hour.</p>';
      box.appendChild(e);
    }
    for (const b of Species.BIOMES) {
      const list = Species.byBiome(b.id);
      const found = list.filter(s => S.species[s.id].seen).length;
      const open = S.growth >= b.unlock;
      const head = document.createElement('div');
      head.className = 'biome-head';
      head.innerHTML = `<h2>${b.name}</h2><span class="n">${found} of ${list.length}</span>`;
      box.appendChild(head);
      const blurb = document.createElement('p');
      blurb.className = 'biome-blurb'; blurb.textContent = b.blurb;
      box.appendChild(blurb);
      if (!open) {
        const l = document.createElement('p');
        l.className = 'locked';
        l.textContent = `Still out of reach. The valley opens this far after more stillness has gathered.`;
        box.appendChild(l);
      }
      for (const sp of list) {
        const st = S.species[sp.id];
        const row = document.createElement('button');
        row.className = 'srow' + (st.status === 'resident' ? '' : st.seen ? ' away' : ' absent');
        const cv = document.createElement('canvas');
        cv.className = 'plate'; cv.width = 52; cv.height = 52;
        const txt = document.createElement('div');
        const away = st.status === 'withdrawn' ? '<span class="tagaway">withdrawn</span>' : '';
        const sub = st.seen
          ? `${st.status === 'withdrawn' ? 'First seen' : 'Here since'} ${Store.shortDate(st.arrivedAt)}`
          : Species.hint(sp, S);
        txt.innerHTML = `<p class="nm">${sp.name}${away}</p><p class="sub">${sub}</p>`;
        row.appendChild(cv); row.appendChild(txt);
        row.onclick = () => showNote(sp.id, false);
        box.appendChild(row);
        drawPlate(cv, sp, st.seen);
      }
    }
  }

  /* ---------- almanac ---------- */
  function renderAlmanac() {
    const ws = Almanac.weeks(S);
    const written = ws.filter(w => w.logged > 0);
    $('#almanacMeta').textContent = written.length
      ? `${written.length} ${written.length === 1 ? 'week' : 'weeks'}` : 'Nothing yet';
    // with nothing written down the live hedgerow would be a blank chart above a drawing of one
    $('#p-almanac .eyebrow').hidden = !written.length;
    $('#p-almanac .hedgewrap').hidden = !written.length;
    if (written.length) requestAnimationFrame(() => Almanac.hedgerow($('#hedge'), S, 12));
    const box = $('#almanacBody');
    box.innerHTML = '';
    if (!written.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.innerHTML = Mark.emptyHedge() +
        '<p>The review turns up once there is a week to review. One stem for every day you write down, ' +
        'and a short piece on the Sunday saying what the week did to the valley.</p>';
      box.appendChild(e);
      return;
    }
    for (const w of ws.slice(0, 26)) {
      const el = document.createElement('div');
      el.className = 'wk';
      const marks = []
        .concat(w.arrivals.map(id => `<span class="mark new">${Species.get(id).name}</span>`))
        .concat(w.withdrawals.map(id => `<span class="mark gone">${Species.get(id).name} left</span>`));
      el.innerHTML = `<h3>${Almanac.title(w)}</h3>` +
        Almanac.prose(w).map(t => `<p class="prose">${t}</p>`).join('') +
        (marks.length ? `<div class="marks">${marks.join('')}</div>` : '');
      box.appendChild(el);
    }
  }

  /* ---------- tally ---------- */
  const QUICK = [0, 15, 30, 45, 60, 90, 120, 180, 240, 360];
  function renderTally() {
    if (!tallyDate) tallyDate = S.unlogged[0] || S.today;
    const known = Store.dayEntry(tallyDate);
    tallyValue = known ? known.blight : (S.todayFeed != null && tallyDate === S.today ? S.todayFeed : Math.min(300, S.limit));
    $('#tallyMeta').textContent = tallyDate === S.today ? 'Today' : Store.shortDate(tallyDate);
    $('#tallyQ').textContent = tallyDate === S.today
      ? 'How long did the feeds have you today?'
      : `How long did the feeds have you on ${Store.longDate(tallyDate)}?`;
    const chips = $('#tallyChips');
    chips.innerHTML = '';
    for (const q of QUICK) {
      const b = document.createElement('button');
      b.className = 'chip' + (q === tallyValue ? ' on' : '');
      b.textContent = q === 0 ? 'None at all' : hm(q);
      b.onclick = () => { tallyValue = q; paintTally(); };
      chips.appendChild(b);
    }
    paintTally();
    renderWeek();
    renderMissed();
  }

  /* The Monday week the chosen day sits in, so a correction is one tap away. */
  function renderWeek() {
    const box = $('#tallyWeek');
    const start = Store.weekOf(tallyDate);
    const today = S.today;
    box.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const d = Store.addDays(start, i);
      const future = Store.diffDays(today, d) > 0;
      const e = Store.dayEntry(d);
      const b = document.createElement('button');
      const cls = ['wcell'];
      if (future) cls.push('future');
      else if (!e) cls.push('blank');
      else cls.push(e.blight <= S.limit ? 'clean' : 'over');
      if (d === tallyDate) cls.push('on');
      b.className = cls.join(' ');
      b.innerHTML = `<span class="wd">${Store.weekdayShort(d)}</span><span class="wv">${e ? (e.blight >= 60 ? Math.round(e.blight / 6) / 10 + 'h' : e.blight) : future ? '' : 'blank'}</span>`;
      if (!future) b.onclick = () => { tallyDate = d; renderTally(); };
      else b.disabled = true;
      box.appendChild(b);
    }
  }

  function paintTally() {
    if (tallyValue < 60) {
      $('#tallyVal').textContent = String(tallyValue);
      $('#tallyUnit').textContent = tallyValue === 1 ? 'minute' : 'minutes';
    } else {
      const h = Math.floor(tallyValue / 60), r = tallyValue % 60;
      $('#tallyVal').textContent = r ? `${h}:${String(r).padStart(2, '0')}` : String(h);
      $('#tallyUnit').textContent = r ? 'hours and minutes' : h === 1 ? 'hour' : 'hours';
    }
    $('#tallyRange').value = String(Math.min(480, tallyValue));
    $$('#tallyChips .chip').forEach((c, i) => c.classList.toggle('on', QUICK[i] === tallyValue));

    const p = Sim.preview(S, tallyValue);
    const v = $('#tallyVerdict');
    let txt;
    if (tallyValue === 0) txt = 'A whole day untouched. That is the one thing the white stag waits for.';
    else if (p.clean) {
      const under = S.limit - tallyValue;
      txt = under === 0 ? 'Exactly on your line. It counts as a clean day.'
          : `${hm(under)} under your line. A clean day, and the valley takes it.`;
    } else if (p.graced) {
      txt = `${hm(tallyValue - S.limit)} over. Grace covers the first slip of the week, so nothing is lost. It will not cover the next one.`;
    } else {
      txt = `${hm(tallyValue - S.limit)} over, and grace is already spent this week. The edges will grey, and about two clean days pull them back.`;
    }
    v.textContent = txt;
    v.classList.toggle('over', !p.clean);
  }

  function renderMissed() {
    const box = $('#tallyMissed');
    const list = S.unlogged.filter(d => d !== tallyDate);
    const offerToday = !S.todayLogged && tallyDate !== S.today;
    // no rows means no section: a heading over nothing is not an empty state
    if (!list.length && !offerToday) { box.innerHTML = ''; return; }
    let h = '<div class="missed"><h2>Still blank</h2><p class="help">A day nobody wrote down grows nothing and costs nothing. It just does not count.</p>';
    for (const d of list.slice(-14)) h += `<button class="mrow" data-d="${d}"><span class="d">${Store.longDate(d)}</span><span class="a">Write it down</span></button>`;
    if (offerToday) h += `<button class="mrow" data-d="${S.today}"><span class="d">Today</span><span class="a">Write it down</span></button>`;
    h += '</div>';
    box.innerHTML = h;
    $$('#tallyMissed .mrow').forEach(b => b.onclick = () => { tallyDate = b.dataset.d; renderTally(); $('.page#p-tally .scroller').scrollTop = 0; });
  }

  let lastSave = 0;
  function saveTally() {
    const now = Date.now();
    if (now - lastSave < 700 || !page) return;
    lastSave = now;
    const was = tallyDate;
    Store.logDay(was, tallyValue);
    S = Sim.compute();
    const next = S.unlogged[0] || (S.todayLogged ? null : S.today);
    if (next && next !== was) {
      tallyDate = next;
      refresh();
      scheduleReminder();
      $('#p-tally .scroller').scrollTop = 0;
      toast(`${was === S.today ? 'Today' : Store.shortDate(was)} written down`);
    } else {
      tallyDate = null;
      closePage();
      scheduleReminder();
      if (!checkArrivals()) toast('Written down');
    }
  }

  /* ---------- photo ---------- */
  let cardBusy = false, cardAgain = false;
  function renderPhoto() {
    const hc = $('#hourChips'); hc.innerHTML = '';
    for (const h of Card.HOURS) {
      const b = document.createElement('button');
      b.className = 'chip' + (h.h === photo.hour ? ' on' : '');
      b.textContent = h.label;
      b.onclick = () => { photo.hour = h.h; renderPhoto(); };
      hc.appendChild(b);
    }
    const fc = $('#frameChips'); fc.innerHTML = '';
    for (const f of [{ w: true, l: 'The whole valley' }, { w: false, l: 'Close in' }]) {
      const b = document.createElement('button');
      b.className = 'chip' + (f.w === photo.wide ? ' on' : '');
      b.textContent = f.l;
      b.onclick = () => { photo.wide = f.w; renderPhoto(); };
      fc.appendChild(b);
    }
    // a second tap while one card is still drawing queues another, it never drops it
    if (cardBusy) { cardAgain = true; return; }
    cardBusy = true;
    const img = $('#cardImg'), skel = $('#cardSkel'), err = $('#cardError');
    err.hidden = true;
    if (!img.src) { skel.hidden = false; img.hidden = true; }
    requestAnimationFrame(() => {
      try {
        const c = Card.render(S, { hour: photo.hour, wide: photo.wide, x: Valley.cam.x });
        img.src = c.toDataURL('image/png');
        img._canvas = c;
        img.hidden = false; skel.hidden = true;
      } catch (e) {
        skel.hidden = true; img.hidden = true;
        err.hidden = false;
        err.textContent = 'The card could not be drawn on this device. Everything else still works.';
      }
      cardBusy = false;
      if (cardAgain) { cardAgain = false; renderPhoto(); }
    });
  }
  async function cardBlob() {
    const c = $('#cardImg')._canvas;
    if (!c) return null;
    return await new Promise(r => c.toBlob(r, 'image/png'));
  }
  async function saveCard(share) {
    const blob = await cardBlob();
    if (!blob) {
      const err = $('#cardError');
      err.hidden = false; err.textContent = 'There is no card to save yet.';
      return;
    }
    const name = `wildergarden-${S.today}.png`;
    const N = nat();
    if (N && N.saveFile) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const uri = N.saveFile(name, 'image/png', btoa(bin));
      if (uri) { toast('Saved to Downloads'); if (share && N.shareUri) N.shareUri(uri, 'image/png'); }
      else toast('Could not save the card');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Card saved');
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    const s = Store.settings();
    $('#setLimit').value = String(s.limit);
    $('#setLimitVal').textContent = hm(s.limit);
    $('#setWorkStart').value = s.workStart || '09:00';
    $('#setWorkEnd').value = s.workEnd || '17:00';
    $('#setRemind').checked = !!s.remind;
    $('#setRemindTime').value = s.remindTime || '21:30';
    $('#remindTimeField').hidden = !s.remind;
    $('#setHemi').value = s.hemisphere || 'north';
    $('#setHaptics').checked = !!s.haptics;
    renderFeedChips($('#feedChips'), Store.feeds(), list => { Store.feeds(list); renderSettings(); });
  }
  function renderFeedChips(box, list, onChange) {
    box.innerHTML = '';
    if (!list.length) {
      const p = document.createElement('span');
      p.className = 'help'; p.textContent = 'None named yet.';
      box.appendChild(p); return;
    }
    list.forEach((f, i) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.setAttribute('aria-label', 'Remove ' + f);
      // the name is whatever the user typed, so it goes in as text, never as markup
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.appendChild(document.createTextNode(f));
      b.appendChild(nm);
      const x = document.createElement('span');
      x.className = 'x'; x.innerHTML = Mark.icon('close');
      b.appendChild(x);
      b.onclick = () => { const n = list.slice(); n.splice(i, 1); onChange(n); };
      box.appendChild(b);
    });
  }

  /* ---------- onboarding ---------- */
  function renderOb() {
    const mark = $('#obMark');
    if (mark && !mark.firstChild) mark.innerHTML = Mark.seal({ size: 124, fill: 0.62, leaves: 2, live: true });
    const scene = $('#obScene');
    if (scene && !scene.firstChild) scene.innerHTML = Mark.emptyGround();
    const cards = $$('#obTrack .ob-card');
    cards.forEach(c => c.style.transform = `translateX(${-100 * obIndex}%)`);
    const dots = $('#obDots');
    dots.innerHTML = '';
    cards.forEach((_, i) => {
      const d = document.createElement('span');
      d.className = 'ob-dot' + (i === obIndex ? ' on' : '');
      dots.appendChild(d);
    });
    $('#obNext').textContent = obIndex === cards.length - 1 ? 'Open the valley' : 'Next';
    renderFeedChips($('#obFeedChips'), obFeeds, list => { obFeeds = list; renderOb(); });
  }
  function obNext() {
    const cards = $$('#obTrack .ob-card');
    if (obIndex < cards.length - 1) { obIndex++; renderOb(); return; }
    Store.onboard({ limit: Number($('#obLimit').value) || 60 });
    Store.feeds(obFeeds);
    $('#onboard').hidden = true;
    startApp(true);
  }

  /* ---------- boot ---------- */
  function startApp(first) {
    $('#topbar').hidden = false;
    $('#deck').hidden = false;
    const away = Store.touch();
    refresh({ mist: first || away > 40 * 60000 });
    Valley.start();
    scheduleReminder();
    if (!first) checkArrivals();
    startTicker();
  }

  function startTicker() {
    clearInterval(ticker);
    ticker = setInterval(() => {
      if (Store.live()) { S.liveMinutes = (Date.now() - Store.live().s) / 60000; renderDeck(); }
      if (S && Store.today() !== S.today) refresh();
    }, 1000);
  }
  function stopTicker() { clearInterval(ticker); ticker = 0; }

  function bind() {
    /* Phones register a double tap on a single intended press more often than anyone
       admits. Without this, tapping twice starts a session and immediately throws it
       away, and tapping the tally twice writes a day the user never looked at. */
    let lastAct = 0;
    $('#actBtn').onclick = () => {
      const t = Date.now();
      if (t - lastAct < 700) return;
      lastAct = t;
      if (Store.live()) {
        const rec = Store.end();
        refresh();
        if (rec) {
          const mins = Math.round((rec.e - rec.s) / 60000);
          if (!checkArrivals()) toast(`${hm(mins)} of stillness, gathered.`);
        } else toast('Too short to count. Try an hour.');
      } else {
        Store.begin();
        refresh();
        toast('The valley is growing. Put the phone down.');
      }
    };
    $('#wideBtn').onclick = () => { Valley.wide(); renderDeck(); };
    $('#handle').onclick = openSheet;
    $('#prompt').onclick = () => { tallyDate = null; go('tally'); };
    $('#sheet').onclick = e => { if (e.target.id === 'sheet') closeSheet(); };
    $('#note').onclick = e => { if (e.target.id === 'note') closeNote(); };
    $('#noteClose').onclick = closeNote;
    $$('.menu button').forEach(b => b.onclick = () => { if (b.dataset.go === 'tally') tallyDate = null; go(b.dataset.go); });
    $$('[data-back]').forEach(b => b.onclick = closePage);

    $('#tallyRange').oninput = e => { tallyValue = Number(e.target.value); paintTally(); };
    $('#tallySave').onclick = saveTally;

    $('#cardSave').onclick = () => saveCard(false);
    $('#cardShare').onclick = () => saveCard(true);

    $('#setLimit').oninput = e => { Store.settings({ limit: Number(e.target.value) }); $('#setLimitVal').textContent = hm(Number(e.target.value)); };
    $('#setLimit').onchange = () => refresh();
    $('#setWorkStart').onchange = e => { Store.settings({ workStart: e.target.value }); refresh(); };
    $('#setWorkEnd').onchange = e => { Store.settings({ workEnd: e.target.value }); refresh(); };
    $('#setRemind').onchange = e => { Store.settings({ remind: e.target.checked }); $('#remindTimeField').hidden = !e.target.checked; scheduleReminder(); };
    $('#setRemindTime').onchange = e => { Store.settings({ remindTime: e.target.value }); scheduleReminder(); };
    $('#setHemi').onchange = e => { Store.settings({ hemisphere: e.target.value }); refresh(); };
    $('#setHaptics').onchange = e => { Store.settings({ haptics: e.target.checked }); };

    const addFeed = (inputSel, get, set) => {
      // the field promises 24 characters; anything longer is trimmed rather than stored
      const v = $(inputSel).value.trim().slice(0, 24);
      if (!v) return;
      const list = get();
      if (list.length >= 12 || list.includes(v)) { $(inputSel).value = ''; return; }
      set(list.concat([v]));
      $(inputSel).value = '';
    };
    $('#feedAdd').onclick = () => addFeed('#feedInput', () => Store.feeds(), l => { Store.feeds(l); renderSettings(); });
    $('#feedInput').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#feedAdd').click(); } };
    $('#obFeedAdd').onclick = () => addFeed('#obFeedInput', () => obFeeds, l => { obFeeds = l; renderOb(); });
    $('#obFeedInput').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#obFeedAdd').click(); } };

    $('#exJson').onclick = () => download('wildergarden.json', 'application/json', Store.exportJson());
    $('#exCsv').onclick = () => download('wildergarden.csv', 'text/csv', Store.exportCsv());
    $('#importFile').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const n = Store.importJson(String(r.result));
        const note = $('#ioNote');
        note.hidden = false;
        note.classList.toggle('bad', n < 0);
        note.textContent = n < 0 ? 'That file is not a Wildergarden export, so nothing was changed.'
          : n ? `${n} ${n === 1 ? 'day' : 'days'} added.` : 'Nothing new to add. Every day in that file was already here.';
        refresh();
      };
      r.readAsText(f); e.target.value = '';
    };
    $('#eraseBtn').onclick = () => {
      const b = $('#eraseBtn');
      if (b.dataset.armed) { Store.erase(); location.reload(); return; }
      b.dataset.armed = '1'; b.textContent = 'Tap again to erase everything';
      setTimeout(() => { delete b.dataset.armed; b.textContent = 'Erase everything'; }, 4000);
    };

    $('#pledgeShare').onclick = () => {
      const text = 'Wildergarden: a valley that only grows while your phone is down. No subscription, no ads, no account, no internet permission, and it never reads which apps you use. It asks you once a day and believes you.';
      const N = nat();
      if (N && N.shareText) N.shareText('Wildergarden', text);
      else if (navigator.share) navigator.share({ title: 'Wildergarden', text }).catch(() => {});
      else { navigator.clipboard && navigator.clipboard.writeText(text); toast('Pledge copied'); }
    };

    $('#obLimit').oninput = e => { $('#obLimitVal').textContent = String(e.target.value); };
    $('#obNext').onclick = obNext;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { Valley.stop(); stopTicker(); }
      else if (Store.onboarded()) { const away = Store.touch(); refresh({ mist: away > 40 * 60000 }); Valley.start(); startTicker(); checkArrivals(); }
    });
  }

  function init() {
    paintIcons();
    Valley.attach($('#valley'), id => { if (id) showNote(id, false); });
    bind();
    if (Store.onboarded()) startApp(false);
    else { $('#onboard').hidden = false; renderOb(); }
  }

  /* ---------- shell bridge ---------- */
  function back() {
    if (!Store.onboarded()) {
      if (obIndex > 0) { obIndex--; renderOb(); return true; }
      return false;
    }
    if (noteOpen) { closeNote(); return true; }
    if (page) { closePage(); return true; }
    if (sheetOpen) { closeSheet(); return true; }
    if (Valley.isWide()) { Valley.wide(false); renderDeck(); return true; }
    return false;
  }
  function onPause() { Valley.stop(); stopTicker(); }
  function onResume() {
    if (!Store.onboarded()) return;
    const away = Store.touch();
    refresh({ mist: away > 40 * 60000 });
    Valley.start(); startTicker(); scheduleReminder(); checkArrivals();
  }

  document.addEventListener('DOMContentLoaded', init);
  return { back, onPause, onResume, go, note: showNote, toast, refresh, get state() { return S; } };
})();

/* The shell looks for window.App by name. A top-level const does not create it. */
window.App = App;
