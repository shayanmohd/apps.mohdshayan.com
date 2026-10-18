/* Sentence. Views, the writing ritual, and the resurfacing loop. */
const App = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const N = window.Native || null;

  let view = 'today';
  let yearsDate = Store.journalDate();
  let calOpen = false;
  let writingDate = Store.journalDate();
  let windowTimer = null;
  let noMatch = false;
  let draft = Store.draft() || { date: null, text: '' };   // a line in progress, kept across tab switches, pauses and relaunches
  function setDraft(d) { draft = d; Store.draft(d.text ? d : null); }

  /* ---------- small helpers ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2400);
  }
  function tap(ms = 12, amp = 90) { try { N ? N.vibrate(ms, amp) : navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
  /* restart a CSS animation class */
  function replay(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  const idx = i => Math.min(i, 14);
  /* the line grows with the sentence instead of scrolling inside itself */
  function grow() { const el = $('#line'); el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

  function download(name, mime, text) {
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

  /* ---------- notifications: the app only ever sends your own words ---------- */
  function scheduleNotifications() {
    if (!N || !N.scheduleNotifications) return;
    const s = Store.settings();
    const [h, m] = (s.notifyTime || '08:00').split(':').map(Number);
    const plan = [];
    for (let i = 0; i < 7; i++) {
      const day = Store.addDays(Store.journalDate(), i);
      const found = Store.resurfaced(day);
      if (!found.length) continue;
      const at = Store.parse(day); at.setHours(h, m, 0, 0);
      if (at.getTime() <= Date.now()) continue;
      const first = found[0];
      plan.push({
        id: i + 1,
        at: at.getTime(),
        title: first.label,
        body: s.discreet ? 'Open to read it.' : first.text
      });
    }
    try { N.scheduleNotifications(JSON.stringify(plan)); } catch (e) {}
  }

  /* ---------- today ---------- */
  function renderToday() {
    const today = Store.journalDate();
    writingDate = today;
    const yesterday = Store.addDays(today, -1);

    $('#todayDate').textContent = Store.longDate(today);
    const ch = Store.currentChapter(today);
    $('#chapterLine').textContent = ch.fresh
      ? (Store.dates().length ? `Chapter ${ch.number} begins.` : '')
      : `Chapter ${ch.number}. ${ch.length} ${ch.length === 1 ? 'day' : 'days'}.`;

    const entry = Store.get(today);
    const backfillable = !Store.get(yesterday) && Store.editable(yesterday) && Store.dates().length > 0;
    const keep = !!draft.date && !!draft.text.trim() &&
      (draft.date === today ? Store.editable(today) : (draft.date === yesterday && backfillable));
    if (!keep && draft.date) setDraft({ date: null, text: '' });   // stale: the day it belonged to has closed

    if (keep) {
      openWrite(draft.date, draft.text);
    } else if (entry) {
      $('#writeBlock').hidden = true;
      $('#savedBlock').hidden = false;
      $('#savedText').textContent = entry.t;
      $('#savedText').classList.toggle('late', !!entry.late);
      tickWindow();
    } else {
      openWrite(today, '');
    }
    if (writingDate === yesterday) {
      $('#todayDate').textContent = Store.longDate(yesterday);
      $('#chapterLine').textContent = 'Written late, and marked as such.';
    }
    $('#backfill').hidden = !backfillable || writingDate === yesterday;

    const stack = Store.resurfaced(today);
    $('#stack').hidden = stack.length === 0;
    $('#stackList').innerHTML = stack.map((s, i) => `
      <div class="stack-item" style="--i:${idx(i)}">
        <span class="running">${s.label}</span>
        <p class="entry${s.late ? ' late' : ''}"></p>
      </div>`).join('');
    $$('#stackList .entry').forEach((el, i) => { el.textContent = stack[i].text; });
  }

  /* show the line for `date` with `text` in it */
  function openWrite(date, text) {
    writingDate = date;
    $('#savedBlock').hidden = true;
    $('#writeBlock').hidden = false;
    $('#line').value = text;
    updateCount(); grow();
  }

  function tickWindow() {
    clearInterval(windowTimer);
    const paint = () => {
      const e = Store.get(writingDate);
      if (!e) return;
      const left = Store.remaining(writingDate);
      const editable = Store.editable(writingDate);
      $('#editBtn').hidden = !editable;
      if (left > 0) {
        const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
        $('#windowNote').textContent = `Correctable for ${mm}:${String(ss).padStart(2, '0')}`;
      } else {
        $('#windowNote').textContent = editable ? 'Open until the day closes' : 'Set in type';
        clearInterval(windowTimer);
      }
    };
    paint();
    windowTimer = setInterval(paint, 1000);
  }

  function updateCount() {
    const v = $('#line').value;
    const left = 280 - v.length;
    const c = $('#count');
    c.textContent = left <= 40 ? `${left} left` : '';
    c.classList.toggle('warn', left <= 0);
    $('#saveBtn').disabled = v.trim().length === 0;
  }

  function saveLine() {
    const text = $('#line').value;
    if (!text.trim()) return;
    setDraft({ date: null, text: '' });
    if (!Store.put(writingDate, text)) { toast('That day is closed.'); renderToday(); return; }
    tap(16, 140);
    renderToday();
    replay($('#savedText'), 'pressed');
    replay($('#inkline'), 'stamp');
    scheduleNotifications();
    if (N && N.notificationsAllowed && !N.notificationsAllowed()) N.requestNotificationPermission();
  }

  /* is the writing block open on something that is not simply today's blank line? */
  function editing() {
    return !$('#writeBlock').hidden && (writingDate !== Store.journalDate() || !!Store.get(writingDate));
  }

  /* ---------- book ---------- */
  function applyBookMode() {
    const none = Store.dates().length === 0;
    $('#calWrap').hidden = !calOpen;
    $('#bookList').hidden = calOpen;
    $('#searchWrap').hidden = calOpen;
    $('#bookEmpty').hidden = calOpen || !none;
    $('#calEmpty').hidden = !calOpen || !none;
    $('#bookNone').hidden = calOpen || !noMatch;
    $('#calToggle').textContent = calOpen ? 'Sentences' : 'Calendar';
  }

  function renderBook() {
    const raw = $('#search').value.trim();
    const q = raw.toLowerCase();
    const ds = Store.dates().reverse().filter(d => !q || Store.get(d).t.toLowerCase().includes(q));
    noMatch = !!q && ds.length === 0 && Store.dates().length > 0;
    $('#bookNone').textContent = noMatch ? `No sentence contains "${raw}".` : '';
    let html = '', month = '', i = 0;
    for (const d of ds) {
      const m = Store.monthLabel(d);
      if (m !== month) { month = m; html += `<span class="running">${m}</span>`; }
      const e = Store.get(d);
      html += `<button class="book-entry" data-date="${d}" style="--i:${idx(i++)}">
        <span class="d">${Store.DAYS[Store.parse(d).getDay()].slice(0,3)} ${Store.parse(d).getDate()}</span>
        <span class="entry${e.late ? ' late' : ''}"></span></button>`;
    }
    $('#bookList').innerHTML = html;
    $$('#bookList .book-entry').forEach(b => {
      b.querySelector('.entry').textContent = Store.get(b.dataset.date).t;
      b.onclick = () => openSheet(b.dataset.date);
    });
  }

  function renderCalendar() {
    const ds = Store.dates();
    if (!ds.length) { $('#calWrap').innerHTML = ''; return; }
    const today = Store.journalDate();
    const months = [];
    let cur = ds[0].slice(0, 7);
    const endM = today.slice(0, 7);
    while (cur <= endM) {
      months.push(cur);
      const [y, m] = cur.split('-').map(Number);
      const nx = new Date(y, m, 1);
      cur = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}`;
    }
    $('#calWrap').innerHTML = months.reverse().map((mk, mi) => {
      const [y, m] = mk.split('-').map(Number);
      const days = new Date(y, m, 0).getDate();
      const lead = new Date(y, m - 1, 1).getDay();
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<div></div>';
      for (let d = 1; d <= days; d++) {
        const key = `${mk}-${String(d).padStart(2, '0')}`;
        const e = Store.get(key);
        const cls = (e ? 'written' : (key > today ? 'future' : 'blank')) + (key === today ? ' today' : '');
        cells += e
          ? `<button class="cal-cell ${cls}" data-date="${key}" aria-label="${Store.longDate(key)}"></button>`
          : `<div class="cal-cell ${cls}" title="${key}"></div>`;
      }
      return `<div class="cal-month" style="--i:${idx(mi)}"><span class="running">${Store.monthLabel(mk + '-01')}</span>
        <div class="cal-grid">${cells}</div></div>`;
    }).join('');
    $$('#calWrap .cal-cell.written').forEach(b => { b.onclick = () => openSheet(b.dataset.date); });
  }

  /* ---------- years ---------- */
  function renderYears() {
    const today = Store.journalDate();
    $('#yDate').textContent = Store.shortDate(yearsDate);
    $('#yNext').disabled = yearsDate >= today;
    const rows = Store.yearStack(yearsDate);
    $('#yearsList').innerHTML = rows.map((r, i) => `
      <div class="year-row" style="--i:${idx(i)}">
        <span class="y">${r.year}</span>
        ${r.entry ? `<p class="entry${r.entry.late ? ' late' : ''}"></p>` : '<p class="none"><span>Unprinted.</span></p>'}
      </div>`).join('');
    const els = $$('#yearsList .entry');
    rows.filter(r => r.entry).forEach((r, i) => { els[i].textContent = r.entry.t; });
  }

  /* ---------- sheet ---------- */
  let sheetDate = null;
  function openSheet(date) {
    sheetDate = date;
    $('#sheetDate').textContent = Store.longDate(date);
    $('#sheetText').textContent = Store.get(date).t;
    $('#sheet').hidden = false;
  }
  function closeSheet() { $('#sheet').hidden = true; sheetDate = null; }

  /* ---------- settings ---------- */
  function renderSettings() {
    const s = Store.settings();
    $('#setTime').value = s.notifyTime;
    $('#setDiscreet').checked = !!s.discreet;
    $('#setWindow').value = String(s.typoWindow);
    $('#setTheme').value = s.theme;
  }
  function applyTheme() {
    document.body.className = 'set-' + Store.settings().theme;
    if (document.body.dataset.tabs) document.body.classList.add('has-tabs');
  }

  /* ---------- navigation ---------- */
  function show(v) {
    if (v !== 'today') clearInterval(windowTimer);
    view = v;
    $$('.view').forEach(el => { el.hidden = el.id !== 'v-' + v; });
    $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.view === v));
    if (v === 'today') { renderToday(); replay($('#inkline'), 'draw'); }
    if (v === 'book') { renderBook(); renderCalendar(); applyBookMode(); }
    if (v === 'years') { yearsDate = Store.journalDate(); renderYears(); }
    if (v === 'settings') renderSettings();
    replay($('#v-' + v), 'enter');
  }

  /* ---------- onboarding ---------- */
  let obStep = 0;
  function renderOb() {
    $$('#obTrack .ob-card').forEach(c => { c.style.transform = `translateX(-${obStep * 100}%)`; });
    $('#obDots').innerHTML = [0,1,2,3].map(i => `<span class="ob-dot${i === obStep ? ' on' : ''}"></span>`).join('');
    $('#obNext').textContent = obStep === 3 ? 'Begin' : 'Next';
  }
  function obNext() {
    if ($('#onboard').hidden) return;
    if (obStep < 3) { obStep++; renderOb(); return; }
    Store.settings({ notifyTime: $('#obTime').value || '08:00' });
    Store.onboarded(true);
    startApp();
    if (N && N.notificationsAllowed && !N.notificationsAllowed()) N.requestNotificationPermission();
  }

  /* ---------- boot ---------- */
  function startApp() {
    $('#onboard').hidden = true;
    $('#tabs').hidden = false;
    document.body.dataset.tabs = '1';
    document.body.classList.add('has-tabs');
    show('today');
    scheduleNotifications();
    setTimeout(() => { if (!Store.get(Store.journalDate())) $('#line').focus(); }, 60);
  }

  function bind() {
    $('#obNext').onclick = obNext;
    $('#line').addEventListener('input', () => { setDraft({ date: writingDate, text: $('#line').value }); updateCount(); grow(); });
    $('#line').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveLine(); } });
    $('#saveBtn').onclick = saveLine;
    $('#editBtn').onclick = () => {
      const e = Store.get(writingDate); if (!e) return;
      setDraft({ date: writingDate, text: e.t });
      openWrite(writingDate, e.t); $('#line').focus();
    };
    $('#backfillBtn').onclick = () => {
      const yesterday = Store.addDays(Store.journalDate(), -1);
      setDraft({ date: yesterday, text: '' });
      openWrite(yesterday, '');
      $('#todayDate').textContent = Store.longDate(yesterday);
      $('#chapterLine').textContent = 'Written late, and marked as such.';
      $('#backfill').hidden = true;
      $('#line').focus();
    };

    $('#search').addEventListener('input', () => { renderBook(); applyBookMode(); });
    $('#calToggle').onclick = () => { calOpen = !calOpen; applyBookMode(); };

    $('#yPrev').onclick = () => { yearsDate = Store.addDays(yearsDate, -1); renderYears(); };
    $('#yNext').onclick = () => {
      if (yearsDate >= Store.journalDate()) return;
      yearsDate = Store.addDays(yearsDate, 1); renderYears();
    };

    $('#sheetClose').onclick = closeSheet;
    $('#sheet').onclick = e => { if (e.target.id === 'sheet') closeSheet(); };
    $('#sheetCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(Store.get(sheetDate).t); toast('Copied'); }
      catch (e) { toast('Could not copy'); }
    };
    $('#sheetCard').onclick = async () => {
      const b = $('#sheetCard');
      if (b.disabled) return;
      b.disabled = true; b.textContent = 'Making the card';
      try {
        const blob = await Card.render(sheetDate, Store.get(sheetDate).t);
        if (!blob) { toast('Could not make the card'); return; }
        const name = `sentence-${sheetDate}.png`;
        if (N && N.saveFile) {
          const buf = new Uint8Array(await blob.arrayBuffer());
          let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
          const uri = N.saveFile(name, 'image/png', btoa(bin));
          if (uri) { toast('Card saved to Downloads'); if (N.shareUri) N.shareUri(uri, 'image/png'); }
          else toast('Could not save the card');
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = name; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          toast('Card saved');
        }
      } finally { b.disabled = false; b.textContent = 'Save as card'; }
    };

    $('#setTime').onchange = e => { Store.settings({ notifyTime: e.target.value }); scheduleNotifications(); };
    $('#setDiscreet').onchange = e => { Store.settings({ discreet: e.target.checked }); scheduleNotifications(); };
    $('#setWindow').onchange = e => { Store.settings({ typoWindow: Number(e.target.value) }); };
    $('#setTheme').onchange = e => { Store.settings({ theme: e.target.value }); applyTheme(); };

    $('#exTxt').onclick = () => download('sentence.txt', 'text/plain', Store.exportText());
    $('#exCsv').onclick = () => download('sentence.csv', 'text/csv', Store.exportCsv());
    $('#exJson').onclick = () => download('sentence.json', 'application/json', Store.exportJson());
    $('#importFile').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const n = Store.importText(String(r.result));
        $('#ioNote').textContent = n ? `${n} ${n === 1 ? 'sentence' : 'sentences'} added.` : 'Nothing new to add. The file needs a date and a sentence per line.';
        renderToday();
      };
      r.onerror = () => { $('#ioNote').textContent = 'Could not read that file.'; };
      r.readAsText(f);
      e.target.value = '';
    };
    $('#eraseBtn').onclick = () => {
      if ($('#eraseBtn').dataset.armed) {
        Store.erase(); location.reload();
      } else {
        $('#eraseBtn').dataset.armed = '1';
        $('#eraseBtn').textContent = 'Tap again to erase';
        setTimeout(() => { delete $('#eraseBtn').dataset.armed; $('#eraseBtn').textContent = 'Erase everything'; }, 4000);
      }
    };

    $$('.tab').forEach(t => { t.onclick = () => show(t.dataset.view); });
  }

  function init() {
    applyTheme();
    bind();
    if (Store.onboarded()) startApp();
    else { $('#onboard').hidden = false; renderOb(); replay($('#obMark'), 'draw'); }
  }

  /* Called by the Android shell. */
  function back() {
    if (!$('#onboard').hidden) {
      if (obStep > 0) { obStep--; renderOb(); return true; }
      return false;
    }
    if (!$('#sheet').hidden) { closeSheet(); return true; }
    if (view === 'today' && editing()) { setDraft({ date: null, text: '' }); renderToday(); return true; }
    if (view !== 'today' && !$('#tabs').hidden) { show('today'); return true; }
    return false;
  }
  function onPause() { clearInterval(windowTimer); }
  function onResume() {
    if (!Store.onboarded()) return;
    if (view === 'years') renderYears(); else show(view);   // Years keeps the date you scrubbed to
    scheduleNotifications();
  }

  document.addEventListener('DOMContentLoaded', init);
  return { back, onPause, onResume, show, toast };
})();

// Classic scripts keep top-level const out of window, and the Android shell looks for window.App.
window.App = App;
