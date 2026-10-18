/* Patchwork. Four screens, one sheet component, and the rule that a ledger line is only
   written when both people say the hour happened. */
const App = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const N = window.Native || null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let view = 'board';
  let boardKind = 'offers';

  /* ---------- words ---------- */
  const num = n => String(Math.round(Number(n) * 4) / 4);
  const hours = n => (Number(n) === 1 ? '1 hour' : num(n) + ' hours');
  const hasHave = n => (Number(n) === 1 ? 'has' : 'have');
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const signed = n => (n >= 0 ? '+' : '') + num(n);

  const MS_DAY = 86400000;
  function dayDelta(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    const now = new Date(); now.setHours(12, 0, 0, 0);
    return { d, days: Math.round((d - now) / MS_DAY) };
  }
  /* A date is only useful if it says which year it is and whether it has already gone by. */
  function dateLabel(s) {
    const t = dayDelta(s);
    if (!t) return 'no date set';
    const thisYear = t.d.getFullYear() === new Date().getFullYear();
    const base = t.d.toLocaleDateString(undefined, thisYear
      ? { weekday: 'short', day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' });
    if (t.days === 0) return base + ', today';
    if (t.days === 1) return base + ', tomorrow';
    if (t.days === -1) return base + ', yesterday';
    if (t.days < -30) return base + ', long past';
    if (t.days < -1) return base + ', ' + Math.abs(t.days) + ' days ago';
    return base;
  }
  const isPast = s => { const t = dayDelta(s); return t !== null && t.days < 0; };

  /* ---------- small pieces of cloth ---------- */
  const swatch = (cat, size) => `<svg class="swatch" width="${size || 24}" height="${size || 24}"
    viewBox="0 0 24 24" aria-hidden="true"><rect x="1.4" y="1.4" width="21.2" height="21.2" rx="4.2"
    fill="var(--c-${cat})"/><rect x="5.2" y="5.2" width="13.6" height="13.6" rx="2.4" fill="none"
    stroke="var(--thread)" stroke-width="1.5" stroke-dasharray="3 2.6" stroke-linecap="round"/></svg>`;
  const icon = (id, size) => `<svg width="${size || 18}" height="${size || 18}" fill="none"
    stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true"><use href="#${id}"/></svg>`;

  /* ---------- feedback ---------- */
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2800);
  }
  function tap(ms, amp) {
    try { if (N && N.vibrate) N.vibrate(ms || 10, amp || 80);
          else if (navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) {}
  }
  /** Rapid taps on a primary button must do the thing once, not three times. A handler that
      returns false did not commit anything (it showed an error, or armed a confirmation), so the
      button re-arms at once and the person's next tap is not swallowed. */
  function once(btn, fn) {
    if (!btn) return;
    btn.onclick = () => {
      if (btn.dataset.busy) return;
      btn.dataset.busy = '1';
      let committed = true;
      try { committed = fn() !== false; }
      finally {
        if (committed) setTimeout(() => { delete btn.dataset.busy; }, 500);
        else delete btn.dataset.busy;
      }
    };
  }
  /** A destructive button asks a second time before it acts. It remembers its resting label so
      that leaving the app cannot strand it reading "Tap again to remove Walter" while disarmed. */
  function arm(btn, label, ms) {
    btn.dataset.rest = btn.dataset.rest || btn.textContent;
    btn.dataset.armed = '1';
    btn.textContent = label;
    setTimeout(() => { if (btn.isConnected && btn.dataset.armed) disarm(btn); }, ms || 4000);
  }
  function disarm(btn) {
    delete btn.dataset.armed;
    if (btn.dataset.rest) btn.textContent = btn.dataset.rest;
  }
  /** Errors belong under the field that caused them, never in a dialog box. */
  function showErr(panel, fieldId, msg) {
    const err = panel.querySelector('#' + fieldId + 'Err');
    const field = panel.querySelector('#' + fieldId);
    if (field && field.closest('.field')) field.closest('.field').classList.toggle('bad', !!msg);
    if (err) { err.textContent = msg || ''; err.hidden = !msg; }
    if (msg && field) field.focus();
  }
  const clearErrs = panel => panel.querySelectorAll('.field.bad').forEach(f => {
    f.classList.remove('bad');
    const e = f.querySelector('.err'); if (e) { e.hidden = true; e.textContent = ''; }
  });

  function download(name, mime, text) {
    if (N && N.saveFile) {
      let uri = '';
      try { uri = N.saveFile(name, mime, btoa(unescape(encodeURIComponent(text)))); } catch (e) { uri = ''; }
      if (uri) { toast('Saved to Downloads'); if (N.shareUri) { try { N.shareUri(uri, mime); } catch (e) {} } }
      else toast('The file could not be saved');
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Exported');
    } catch (e) { toast('The file could not be saved'); }
  }

  /* ---------- sheet ---------- */
  let sheetBack = null;      // what Back should do while this sheet is open
  function openSheet(title, subHtml, bodyHtml, wire, onBack) {
    $('#sheetPanel').innerHTML = `<div class="sheet-grip"></div><h2>${esc(title)}</h2>`
      + (subHtml ? `<p class="sheet-sub">${subHtml}</p>` : '') + bodyHtml;
    $('#sheetPanel').scrollTop = 0;
    $('#sheet').hidden = false;
    sheetBack = onBack || null;
    if (wire) wire($('#sheetPanel'));
  }
  const closeSheet = () => { $('#sheet').hidden = true; sheetBack = null; };

  const peopleOptions = (selected, exclude) => Store.people()
    .filter(p => p.id !== exclude)
    .map(p => `<option value="${p.id}"${p.id === selected ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const catOptions = sel => Store.CATEGORIES
    .map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('');

  const emptyBlock = (art, lead, body, action) =>
    `${art}<p class="lead">${esc(lead)}</p><p>${esc(body)}</p>`
    + (action ? `<div class="btnrow" style="justify-content:center"><button class="btn primary" id="${action.id}">${esc(action.label)}</button></div>` : '');

  /* ---------- the quilt ---------- */
  /* A patch is stitched in once, when it is first sewn. Redrawing the board because somebody typed
     a letter into the search box must not replay the animation. */
  let sewnBoard = null, sewnLedger = null;
  const newestPatch = () => { const es = Store.entries(); return es.length ? es[es.length - 1].id : null; };
  /* The quilt widens as the book grows so it holds the whole book for as long as it can, rather
     than quietly dropping the oldest patches while the caption still counts them. */
  const QUILT_COLS = [8, 12, 16, 20, 24];
  function quiltShape(n) {
    const cols = QUILT_COLS.find(c => Math.ceil(n / c) <= 6) || QUILT_COLS[QUILT_COLS.length - 1];
    const rows = Math.max(1, Math.min(6, Math.ceil(n / cols)));
    return { cols, rows, shown: Math.min(n, cols * rows) };
  }

  /* ---------- board ---------- */
  function renderBoard() {
    const db = Store.settings();
    $('#nodeName').textContent = db.node || 'The node';
    const n = Store.people().length, ex = Store.entries().length;
    $('#boardSub').textContent = n === 0
      ? 'Nobody in the book yet.'
      : plural(n, 'person', 'people') + ', ' + plural(ex, 'exchange', 'exchanges') + ' written down.';

    const newest = newestPatch(), fresh = newest !== sewnBoard;
    sewnBoard = newest;
    $('#quiltMini').innerHTML = Art.quilt(Store.entries(),
      { cols: 4, rows: 4, cell: 12, gap: 3, animate: fresh, label: null });
    renderBoardList();
  }

  /* `settle` false while somebody is typing in the search box: replaying the list animation on
     every keystroke makes the board jitter under the fingers. */
  function renderBoardList(settle) {
    $$('.seg').forEach(s => {
      const on = s.dataset.board === boardKind;
      s.classList.toggle('is-on', on);
      s.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    const q = $('#boardSearch').value;
    const rows = Store.board(boardKind, q);
    const empty = $('#boardEmpty');
    empty.hidden = rows.length > 0;
    if (!rows.length) {
      empty.innerHTML = Store.people().length === 0
        ? emptyBlock(Art.needleAndThread, 'Nothing is stitched yet',
            'Add the people who already meet, then write down what each of them could do for an hour.',
            { id: 'boardAddPerson', label: 'Add the first person' })
        : q.trim()
          ? emptyBlock(Art.needleAndThread, 'Nothing matches that',
              'Try a shorter word, or clear the search to see the whole board.')
          : boardKind === 'offers'
            ? emptyBlock(Art.needleAndThread, 'No offers yet',
                'Open a person and write down what they could do for an hour.',
                { id: 'boardOpenRoster', label: 'Open the roster' })
            : emptyBlock(Art.needleAndThread, 'No asks yet',
                'An ask is the fastest way for someone to spend an hour they have earned.',
                { id: 'boardOpenRoster', label: 'Open the roster' });
    }
    $('#boardList').classList.toggle('stagger', settle !== false);
    $('#boardList').innerHTML = rows.map(r => `
      <button class="entry" data-person="${r.person.id}">
        ${swatch(r.listing.cat)}
        <span class="body">
          <span class="what">${esc(r.listing.text)}</span>
          <span class="who">${esc(r.person.name)}</span>
        </span>
        <span class="bal${r.hours < 0 ? ' neg' : ''}" title="hours in hand">${signed(r.hours)} h</span>
      </button>`).join('');
    $$('#boardList .entry').forEach(b => { b.onclick = () => openPerson(b.dataset.person); });
    const add = $('#boardAddPerson'); if (add) add.onclick = personSheet;
    const roster = $('#boardOpenRoster'); if (roster) roster.onclick = () => show('people');
  }

  /* ---------- people ---------- */
  function renderPeople() {
    const list = Store.people();
    $('#peopleSub').textContent = list.length ? plural(list.length, 'person', 'people') + ' in the book' : 'Nobody yet';
    $('#peopleEmpty').hidden = list.length > 0;
    if (!list.length) {
      $('#peopleEmpty').innerHTML = emptyBlock(Art.emptyRoster, 'The roster is empty',
        'Add the people who already meet. A time bank is a book kept for a group, not a way to meet strangers.',
        { id: 'peopleAddPerson', label: 'Add the first person' });
    }
    $('#peopleList').innerHTML = list.map(p => {
      const b = Store.balance(p.id);
      const off = p.offers.map(o => o.text).join(', ');
      return `<button class="person" data-person="${p.id}">
        ${swatch(Art.fabricOf(p.id), 30)}
        <span class="body">
          <span class="nm">${esc(p.name)}</span>
          <span class="off">${esc(off || 'nothing offered yet')}</span>
        </span>
        <span class="bal${b < 0 ? ' neg' : ''}">${signed(b)} h</span>
      </button>`;
    }).join('');
    $$('#peopleList .person').forEach(el => { el.onclick = () => openPerson(el.dataset.person); });
    const add = $('#peopleAddPerson'); if (add) add.onclick = personSheet;
  }

  /* Below zero the node is carrying somebody. At the floor it has stopped carrying them, and a book
     merged from another keeper can arrive already past it, so say which of the two this is. */
  const coverNote = bal => bal >= 0 ? 'Earned and unspent.'
    : bal > Store.FLOOR ? 'The node has them covered.'
    : 'The next hour has to be one they give.';

  function balanceLine(bal) {
    return `<b${bal < 0 ? ' class="neg"' : ''}>${signed(bal)} hours</b>. ` + coverNote(bal);
  }

  function openPerson(id) {
    const p = Store.person(id); if (!p) return;
    const bal = Store.balance(id);
    const listing = (kind) => {
      const rows = (kind === 'ask' ? p.asks : p.offers);
      if (!rows.length) return `<p class="help">Nothing listed.</p>`;
      return rows.map(l => `
        <div class="entry flat">
          ${swatch(l.cat)}
          <span class="body"><span class="what">${esc(l.text)}</span></span>
          <button class="btn small ghost" data-del="${kind}:${l.id}">Remove</button>
        </div>`).join('');
    };

    openSheet(p.name, balanceLine(bal), `
      ${p.note ? `<p class="help" style="margin:0 0 16px">${esc(p.note)}</p>` : ''}
      <h2 class="h2">Can do for an hour</h2>${listing('offer')}
      <div class="btnrow"><button class="btn small" id="addOffer">${icon('i-plus', 16)} Add an offer</button></div>
      <h2 class="h2">Could use an hour of</h2>${listing('ask')}
      <div class="btnrow"><button class="btn small" id="addAsk">${icon('i-plus', 16)} Add an ask</button></div>
      <hr class="rule">
      <div class="btnrow">
        <button class="btn primary" id="bookWith">Arrange an hour</button>
        <button class="btn ghost" id="closeP">Close</button>
      </div>
      <div class="btnrow"><button class="btn small danger" id="delP">Remove from the book</button></div>
      <p class="help">Removing someone leaves every hour they gave or received in the book. The ledger is
        never rewritten.</p>`, (panel) => {
      panel.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
        const [kind, lid] = b.dataset.del.split(':');
        Store.removeListing(id, kind, lid); openPerson(id); renderBoard(); renderPeople();
      });
      panel.querySelector('#addOffer').onclick = () => listingSheet(id, 'offer');
      panel.querySelector('#addAsk').onclick = () => listingSheet(id, 'ask');
      panel.querySelector('#bookWith').onclick = () => bookingSheet(id);
      panel.querySelector('#closeP').onclick = closeSheet;
      const del = panel.querySelector('#delP');
      del.onclick = () => {
        if (del.dataset.armed) { Store.removePerson(id); closeSheet(); renderAll(); toast(p.name + ' left the roster'); }
        else arm(del, 'Tap again to remove ' + p.name);
      };
    });
  }

  function listingSheet(personId, kind) {
    openSheet(kind === 'ask' ? 'Add an ask' : 'Add an offer',
      kind === 'ask' ? 'One thing an hour of someone else could solve.' : 'One thing they could do for an hour.', `
      <div class="field"><label for="lText">In a few words</label>
        <input id="lText" type="text" maxlength="120" autocomplete="off"
          placeholder="${kind === 'ask' ? 'Explain how the pension form works' : 'Fix a dripping tap'}">
        <span class="err" id="lTextErr" hidden></span></div>
      <div class="field"><label for="lCat">Kind of thing</label><select id="lCat">${catOptions('other')}</select></div>
      <div class="btnrow"><button class="btn primary" id="lSave">Add it</button>
        <button class="btn ghost" id="lCancel">Cancel</button></div>`, (panel) => {
      panel.querySelector('#lCancel').onclick = () => openPerson(personId);
      once(panel.querySelector('#lSave'), () => {
        clearErrs(panel);
        const t = panel.querySelector('#lText').value;
        if (!t.trim()) { showErr(panel, 'lText', 'Write it in a few words first.'); return false; }
        Store.addListing(personId, kind, panel.querySelector('#lCat').value, t);
        tap(); openPerson(personId); renderBoard(); renderPeople();
      });
      setTimeout(() => { const f = panel.querySelector('#lText'); if (f) f.focus(); }, 40);
    }, () => openPerson(personId));
  }

  function personSheet() {
    openSheet('Add a person', 'Someone the group already knows.', `
      <div class="field"><label for="pName">Name</label>
        <input id="pName" type="text" maxlength="60" autocomplete="off" placeholder="Walter">
        <span class="err" id="pNameErr" hidden></span></div>
      <div class="field"><label for="pNote">Anything worth remembering</label>
        <input id="pNote" type="text" maxlength="200" autocomplete="off" placeholder="Flat 3, mornings are best"></div>
      <p class="help">They start at ${Store.START} hours, like everyone.</p>
      <div class="btnrow"><button class="btn primary" id="pSave">Add</button>
        <button class="btn ghost" id="pCancel">Cancel</button></div>`, (panel) => {
      panel.querySelector('#pCancel').onclick = closeSheet;
      const save = panel.querySelector('#pSave');
      once(save, () => {
        clearErrs(panel);
        const name = panel.querySelector('#pName').value;
        if (!name.trim()) { showErr(panel, 'pName', 'A name goes in the book.'); return false; }
        /* Two people with one name make the ledger unreadable, so say so once and let it through
           on the second tap: sometimes a street really does hold two Walters. */
        if (Store.namesake(name) && !save.dataset.dupOk) {
          save.dataset.dupOk = '1';
          showErr(panel, 'pName', 'Somebody in the book is already called that. Tap Add again to keep both, '
            + 'or give this one a surname so the ledger stays readable.');
          return false;
        }
        const p = Store.addPerson(name, panel.querySelector('#pNote').value);
        if (!p) { showErr(panel, 'pName', 'A name goes in the book.'); return false; }
        tap(); closeSheet(); renderAll(); toast(p.name + ' is in the book');
      });
      setTimeout(() => { const f = panel.querySelector('#pName'); if (f) f.focus(); }, 40);
    });
  }

  /* ---------- bookings ---------- */
  function bookingSheet(giverId) {
    if (Store.people().length < 2) {
      toast('Two people are needed to arrange an hour');
      return;
    }
    const g = (giverId && Store.exists(giverId)) ? giverId : Store.people()[0].id;
    openSheet('Arrange an hour', 'One person gives the hour, the other receives it.', `
      <div class="field"><label for="bGiver">Who is giving the hour</label>
        <select id="bGiver">${peopleOptions(g)}</select></div>
      <div class="field"><label for="bReceiver">Who is receiving it</label>
        <select id="bReceiver">${peopleOptions(null, g)}</select>
        <span class="note-inline" id="bRoom"></span></div>
      <div class="field"><label for="bWhat">What is it</label>
        <input id="bWhat" type="text" maxlength="140" autocomplete="off" placeholder="Rewire the hallway lamp">
        <span class="err" id="bWhatErr" hidden></span></div>
      <div class="field"><label for="bHours">How long</label>
        <input id="bHours" type="number" inputmode="decimal" min="0.25" max="${Store.MAX_H}" step="0.25" value="1">
        <span class="err" id="bHoursErr" hidden></span></div>
      <div class="field"><label for="bOn">When</label><input id="bOn" type="date">
        <span class="note-inline" id="bWhen"></span></div>
      <span class="err" id="bFloorErr" hidden></span>
      <div class="btnrow"><button class="btn primary" id="bSave">Arrange it</button>
        <button class="btn ghost" id="bCancel">Cancel</button></div>`, (panel) => {
      const giver = panel.querySelector('#bGiver');
      const recv = panel.querySelector('#bReceiver');
      const hrs = panel.querySelector('#bHours');
      const floorErr = panel.querySelector('#bFloorErr');
      const save = panel.querySelector('#bSave');

      /* Rebuilding the receiver list threw away the chosen person the moment the hours changed,
         which is how an hour ends up booked against the wrong neighbour. Rebuild only when the
         giver moves, and keep the selection when the person is still in the list. */
      function rebuildReceivers() {
        const keep = recv.value;
        recv.innerHTML = peopleOptions(null, giver.value);
        if ([...recv.options].some(o => o.value === keep)) recv.value = keep;
      }
      function check() {
        const h = Number(hrs.value);
        /* A cleared or unreadable field used to disable Arrange it in silence, which leaves a dead
           button and no reason for it. Whatever the field cannot be read as, say so under it. */
        const bad = hrs.value.trim() === '' || !isFinite(h) || Store.goodHours(h) === null;
        hrs.closest('.field').classList.toggle('bad', bad);
        const hErr = panel.querySelector('#bHoursErr');
        hErr.textContent = 'An hour between 0.25 and ' + Store.MAX_H + ', in quarters.';
        hErr.hidden = !bad;

        /* A book merged from another keeper can arrive with somebody already past the floor, and
           "can still receive -3 hours" is not a sentence anyone should be shown. */
        const room = Store.headroom(recv.value);
        panel.querySelector('#bRoom').textContent = !Store.exists(recv.value) ? ''
          : Store.nameOf(recv.value) + ' is at ' + signed(Store.balance(recv.value))
            + (room > 0 ? ' and can still receive ' + hours(room) + '.'
                        : ' and cannot receive another hour until they give one.');
        const ok = !bad && Store.canReceive(recv.value, h);
        if (!bad && !ok) {
          floorErr.textContent = Store.nameOf(recv.value) + ' would fall past ' + Store.FLOOR
            + ' hours. The node carries people to ' + Store.FLOOR + ', not further, so this one waits '
            + 'until they give an hour.';
          floorErr.hidden = false;
        } else { floorErr.hidden = true; }
        save.disabled = !ok;

        const on = panel.querySelector('#bOn').value;
        panel.querySelector('#bWhen').textContent = on
          ? (isPast(on) ? 'That day has gone by. The book will show it as overdue.' : dateLabel(on))
          : 'A date is optional. Without one the booking sits at the end of the list.';
      }
      giver.onchange = () => { rebuildReceivers(); check(); };
      recv.onchange = check;
      hrs.oninput = check;
      panel.querySelector('#bOn').onchange = check;
      check();

      panel.querySelector('#bCancel').onclick = closeSheet;
      once(save, () => {
        clearErrs(panel);
        const what = panel.querySelector('#bWhat').value;
        if (!what.trim()) { showErr(panel, 'bWhat', 'Say what the hour is for.'); return false; }
        const b = Store.addBooking(giver.value, recv.value, what, hrs.value, panel.querySelector('#bOn').value);
        if (!b) { showErr(panel, 'bHours', 'An hour between 0.25 and ' + Store.MAX_H + ', in quarters.'); return false; }
        tap(); closeSheet(); show('bookings'); toast('Arranged');
      });
    });
  }

  function renderBookings() {
    const open = Store.openBookings(), past = Store.pastBookings();
    $('#bookingSub').textContent = open.length
      ? plural(open.length, 'exchange', 'exchanges') + ' arranged, waiting to be confirmed.'
      : 'Arranged, and waiting to be confirmed.';
    const empty = $('#bookingEmpty');
    empty.hidden = open.length + past.length > 0;
    if (empty.hidden === false) {
      empty.innerHTML = emptyBlock(Art.notYetJoined, 'Nothing arranged',
        'An exchange starts as a booking and becomes a ledger line once both people say it happened.',
        Store.people().length >= 2 ? { id: 'bookingsArrange', label: 'Arrange an hour' } : null);
    }
    const card = (b, done) => {
      const gName = esc(Store.nameOf(b.giverId)), rName = esc(Store.nameOf(b.receiverId));
      let pill;
      if (done) pill = `<span class="pill done">${icon('i-check', 14)} In the book</span>`;
      else if (b.gaveOk || b.gotOk) {
        const who = b.gaveOk ? rName : gName;
        pill = `<span class="pill wait">Waiting on ${who}</span>`;
      } else if (isPast(b.on)) pill = `<span class="pill late">Overdue, not confirmed</span>`;
      else pill = `<span class="pill">Arranged</span>`;
      return `<div class="card" data-b="${b.id}">
        <h3>${esc(b.what || 'An hour')}</h3>
        <p class="meta"><b>${gName}</b> ${done ? 'gave' : 'gives'} ${hours(b.hours)} to <b>${rName}</b>, ${esc(dateLabel(b.on))}</p>
        ${pill}
        ${done ? '' : `<div class="btnrow">
            ${b.gaveOk ? `<span class="confirmed">${icon('i-check', 15)} ${gName} confirmed</span>`
                       : `<button class="btn small" data-ok="giver">${gName} gave it</button>`}
            ${b.gotOk ? `<span class="confirmed">${icon('i-check', 15)} ${rName} confirmed</span>`
                      : `<button class="btn small" data-ok="receiver">${rName} got it</button>`}
            <button class="btn small ghost" data-cancel="1">Cancel</button>
          </div>`}
      </div>`;
    };
    const DONE_SHOWN = 30;
    $('#bookingList').innerHTML =
      (open.length ? '<h2 class="h2">Arranged</h2>' + open.map(b => card(b, false)).join('') : '') +
      (past.length ? '<h2 class="h2">Done</h2>' + past.slice(0, DONE_SHOWN).map(b => card(b, true)).join('')
        + (past.length > DONE_SHOWN
          ? `<p class="help">The ${past.length - DONE_SHOWN} older ones are in the ledger.</p>` : '') : '');
    const arr = $('#bookingsArrange'); if (arr) arr.onclick = () => bookingSheet(null);
    $$('#bookingList .card').forEach(c => {
      const id = c.dataset.b;
      c.querySelectorAll('[data-ok]').forEach(btn => once(btn, () => {
        const r = Store.confirm(id, btn.dataset.ok);
        if (!r) return false;
        if (r.blocked) {
          renderAll();
          toast('Both agree, but that would carry ' + Store.nameOf(r.booking.receiverId)
            + ' past ' + Store.FLOOR + ' hours. It stays arranged.');
          return;
        }
        tap(14, 120);
        renderAll();
        toast(r.done ? 'Both agreed. It is in the book.' : 'Noted. Waiting on the other side.');
      }));
      const cancel = c.querySelector('[data-cancel]');
      if (cancel) once(cancel, () => {
        if (cancel.dataset.armed) { Store.cancelBooking(id); renderBookings(); toast('Cancelled'); }
        else { arm(cancel, 'Tap again to cancel'); return false; }
      });
    });
  }

  /* ---------- ledger ---------- */
  function renderLedger() {
    const bal = Store.balances();
    const es = Store.entries();
    const total = es.reduce((s, e) => s + e.hours, 0);
    $('#ledgerSub').textContent = total
      ? hours(total) + ' ' + hasHave(total) + ' changed hands'
      : 'Nothing given yet';

    const q = quiltShape(es.length);        // the quilt is only as big as the book, and no smaller
    const newest = newestPatch(), fresh = newest !== sewnLedger;
    sewnLedger = newest;
    $('#quiltBig').innerHTML = Art.quilt(es, { cols: q.cols, rows: q.rows, cell: 12, gap: 3, animate: fresh,
      cls: 'quilt-big', width: '100%', label: 'The quilt, one patch for every exchange in the book' })
      + `<p class="quilt-cap"><b>${es.length ? plural(es.length, 'patch', 'patches') : 'No patches yet'}</b>`
      + `<span>${!es.length ? 'The first exchange sews the first patch.'
                : q.shown < es.length
                  ? 'The newest ' + q.shown + ' are shown, in the colour of whoever gave the hour.'
                  : 'One for every exchange, in the colour of whoever gave the hour.'}</span></p>`;

    $('#balances').innerHTML = bal.map(b => `
      <div class="bal-card${b.hours < 0 ? ' over' : ''}" style="--fab: var(--c-${Art.fabricOf(b.id)})">
        <p class="n">${signed(b.hours)}</p>
        <p class="who">${esc(b.name)}</p>
        ${b.hours < 0 ? `<p class="note">${coverNote(b.hours)}</p>` : ''}
      </div>`).join('') || '<p class="help">Balances appear once there are people in the book.</p>';

    const list = es.slice().reverse();
    const empty = $('#ledgerEmpty');
    empty.hidden = list.length > 0;
    if (!list.length) {
      empty.innerHTML = emptyBlock(Art.openBook, 'The book is empty',
        'Every hour anyone gives is written here, in plain words, and cannot be quietly edited afterwards.');
    }
    /* Each line wears the patch it put in the quilt, so the picture and the book are one thing. */
    $('#ledgerList').innerHTML = list.map(e => `
      <div class="line">
        ${swatch(Art.fabricOf(e.giverId), 20)}
        <div class="lbody">
          <p>${esc(Store.nameOf(e.giverId))} gave ${hours(e.hours)} to ${esc(Store.nameOf(e.receiverId))}${
            e.what ? ', ' + esc(e.what) : ''}.</p>
          <p class="when">${esc(new Date(e.at).toLocaleDateString(undefined,
            { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
        </div>
      </div>`).join('');
  }

  /* ---------- navigation ---------- */
  function renderAll() { renderBoard(); renderBookings(); renderLedger(); renderPeople(); }
  function show(v) {
    view = v;
    $$('.view').forEach(el => { el.hidden = el.id !== 'v-' + v; });
    $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.view === v));
    const s = $('#v-' + v + ' .scroller'); if (s) s.scrollTop = 0;
    if (v === 'board') renderBoard();
    if (v === 'bookings') renderBookings();
    if (v === 'ledger') renderLedger();
    if (v === 'people') renderPeople();
  }

  /* ---------- onboarding ---------- */
  let obStep = 0;
  function renderOb() {
    const cards = $$('#obTrack .ob-card');
    cards.forEach((c, i) => c.classList.toggle('is-on', i === obStep));
    $('#obDots').innerHTML = cards.map((_, i) => `<i class="${i === obStep ? 'is-on' : ''}"></i>`).join('');
    $('#obNext').textContent = obStep === cards.length - 1 ? 'Open the book' : 'Next';
  }
  let starting = false;
  function obNext() {
    const cards = $$('#obTrack .ob-card');
    if (obStep < cards.length - 1) { obStep++; renderOb(); return; }
    if (starting) return;
    const me = $('#obName').value.trim();
    const node = $('#obNode').value.trim();
    const err = $('#obNameErr'), field = $('#obName').closest('.field');
    if (!me) {
      field.classList.add('bad');
      err.textContent = 'Your name goes in the book too.'; err.hidden = false;
      $('#obName').focus();
      return;
    }
    field.classList.remove('bad'); err.hidden = true;
    starting = true;
    Store.settings({ node: node || 'The node' });
    const p = Store.addPerson(me, '');
    Store.settings({ me: p ? p.id : null });
    Store.onboarded(true);
    startApp();
  }

  function startApp() {
    $('#onboard').hidden = true;
    $('#tabs').hidden = false;
    document.body.classList.add('has-tabs');
    show('board');
  }

  function bind() {
    $('#obMark').innerHTML = Art.mark(76);
    $('#obNext').onclick = obNext;      // paging must stay tappable; the commit guards itself
    $$('.tab').forEach(t => { t.onclick = () => show(t.dataset.view); });
    $$('.seg').forEach(s => { s.onclick = () => { boardKind = s.dataset.board; renderBoardList(true); }; });
    $('#boardSearch').addEventListener('input', () => renderBoardList(false));
    $('#quiltMini').onclick = () => show('ledger');
    $('#addPerson').onclick = personSheet;
    $('#newBookingTop').onclick = () => bookingSheet(null);
    $('#sheet').onclick = e => { if (e.target.id === 'sheet') { if (sheetBack) sheetBack(); else closeSheet(); } };

    $('#exportJson').onclick = () => download('patchwork-book.json', 'application/json', Store.exportJson());
    $('#ledgerExport').onclick = () => download('patchwork-book.json', 'application/json', Store.exportJson());
    $('#exportCsv').onclick = () => download('patchwork-ledger.csv', 'text/csv', Store.exportCsv());
    $('#importFile').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const note = $('#ioNote');
      note.textContent = 'Reading the file.';
      const r = new FileReader();
      r.onerror = () => { note.textContent = 'That file could not be read.'; e.target.value = ''; };
      r.onload = () => {
        const res = Store.importJson(String(r.result));
        note.textContent = res.ok
          ? 'Merged: ' + plural(res.people, 'person', 'people') + ', '
            + plural(res.entries, 'ledger line', 'ledger lines') + ', '
            + plural(res.bookings, 'booking', 'bookings') + '.'
            + (res.skipped ? ' ' + plural(res.skipped, 'row', 'rows') + ' in that file could not be read and '
               + (res.skipped === 1 ? 'was' : 'were') + ' left out.' : '')
          : res.why;
        renderAll();
        e.target.value = '';
      };
      r.readAsText(f);
    };
    $('#eraseBtn').onclick = () => {
      const b = $('#eraseBtn');
      if (b.dataset.armed) { Store.erase(); location.reload(); }
      else arm(b, 'Tap again to erase everything');
    };
  }

  function init() {
    bind();
    if (Store.onboarded()) {
      startApp();
      const lost = Store.repairedOnLoad();
      if (lost) toast(plural(lost, 'ledger line', 'ledger lines') + ' could not be read and ' +
        (lost === 1 ? 'was' : 'were') + ' left out of the book.');
    } else { $('#onboard').hidden = false; renderOb(); }
  }

  /* Called by the Android shell. */
  function back() {
    if (!$('#sheet').hidden) { if (sheetBack) sheetBack(); else closeSheet(); return true; }
    if ($('#tabs').hidden) {                 // still in onboarding
      if (obStep > 0) { obStep--; renderOb(); return true; }
      return false;
    }
    if (view !== 'board') { show('board'); return true; }
    return false;
  }
  /* Nothing here runs a timer, plays audio or records, so pausing only means letting go of the
     armed confirmations and the toast, which should not still be counting down when the app returns. */
  function onPause() {
    clearTimeout(toast._t);
    $('#toast').hidden = true;
    $$('[data-armed]').forEach(disarm);
  }
  function onResume() { if (Store.onboarded()) renderAll(); }

  document.addEventListener('DOMContentLoaded', init);
  return { back, onPause, onResume, show, toast };
})();

// A top-level const does not become a window property in a classic script, and the shell needs this.
window.App = App;
