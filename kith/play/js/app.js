/* Kith. Four screens, two pushed pages, four sheets. Nothing here talks to a network. */
const App = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const N = window.Native || null;
  const esc = Rings.esc;

  let view = 'hearth';
  let previous = 'hearth';
  let currentPerson = null;
  let peopleMode = 'rings';
  let logTarget = null, logKind = 'call', logChips = [];
  let personEditing = null, personRing = 'table';
  let dateKind = 'birthday';

  /* ---------- small helpers ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function tap(ms = 14, amp = 110) {
    try { if (N && N.vibrate) N.vibrate(ms, amp); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }
  function first(name) { return String(name).trim().split(/\s+/)[0]; }

  /**
   * A tap on a phone often arrives twice. Every button that writes to the notebook goes
   * through this, so a double tap on Save writes one entry rather than three.
   */
  function once(fn) {
    let busy = false;
    return function (...args) {
      if (busy) return;
      busy = true;
      let wrote = true;
      try { wrote = fn.apply(this, args) !== false; }
      finally {
        // A save that was refused leaves the button live, so a corrected entry saves at once.
        if (wrote) setTimeout(() => { busy = false; }, 500); else busy = false;
      }
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

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied. Paste it wherever you talk.'); return; }
    catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      toast('Copied. Paste it wherever you talk.');
    } catch (e) { toast('Could not copy that.'); }
  }

  /* ---------- notifications ---------- */
  /** Cut long text for a notification without stranding half a word. */
  function clip(s, n) {
    const t = String(s).replace(/\s+/g, ' ').trim();
    if (t.length <= n) return t;
    const cut = t.slice(0, n);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    if (stop > n * 0.4) return cut.slice(0, stop + 1);
    return cut.replace(/\s+\S*$/, '') + '...';
  }

  /** Warmth is a pure function of the ledger and the clock, so future windows are computable. */
  function buildPlan(now = Date.now()) {
    const s = Store.settings();
    const plan = [];
    let id = 1;

    let w = Store.nextWindow(now);
    // Whoever a window named is set aside for the next one, so eight weeks of notifications
    // do not all say the same name. If everyone has had a turn the list starts again,
    // skipping the name the last window used so no two in a row are the same.
    const named = new Set();
    let lastNamed = null;
    for (let i = 0; i < 8 && id < 40; i++) {
      // Stepping by calendar days rather than by 7 x 86400000 keeps the hour the user chose
      // when the clocks change.
      const step = new Date(w); step.setDate(step.getDate() + 7);
      const at = w; w = step.getTime();
      const c = Store.candidates(at);
      if (!c.length) continue;
      let top = c.find(x => !named.has(x.person.id));
      if (!top) { named.clear(); top = c.find(x => x.person.id !== lastNamed) || c[0]; }
      named.add(top.person.id);
      lastNamed = top.person.id;
      const others = c.length - 1;
      const title = s.discreetNotes ? 'Kith' : `${first(top.person.name)} has drifted a little`;
      let body;
      if (s.discreetNotes) body = 'A few people to think about, when you have a minute.';
      else {
        const m = Store.lastMoment(top.person.id);
        const parts = [Store.driftLine(top.person, top.warmth)];
        if (m && m.text) parts.push(clip(m.text, 110));
        if (others === 1) parts.push('One other person has drifted too.');
        else if (others > 1) parts.push(`${others} others have drifted too.`);
        body = parts.join(' ');
      }
      plan.push({ id: id++, at, title, body });
    }

    const [h, m0] = (s.windowTime || '10:00').split(':').map(Number);
    for (const u of Store.upcomingDates(150, now)) {
      if (id >= 60) break;
      const lead = Store.leadFor(u.date);
      const fire = new Date(u.at); fire.setDate(fire.getDate() - lead); fire.setHours(h, m0, 0, 0);
      if (fire.getTime() <= now) continue;
      const word = lead === 0 ? 'today' : lead === 1 ? 'tomorrow' : `in ${lead} days`;
      const Word = word.charAt(0).toUpperCase() + word.slice(1);
      const nm = first(u.person.name);
      let title, body;
      if (s.discreetNotes) { title = 'Kith'; body = `A date you marked is ${word}.`; }
      else if (u.date.kind === 'birthday') {
        title = `${nm} has a birthday ${word}`;
        body = u.date.label || 'A message on the day is worth more than a late one.';
      } else if (u.date.kind === 'tender') {
        title = `${Word}: ${u.date.label || 'a date that matters'}`;
        body = `${u.person.name}. Even one line means a lot.`;
      } else {
        title = `${Word}: ${u.date.label || 'a date you marked'}`;
        body = u.person.name;
      }
      plan.push({ id: id++, at: fire.getTime(), title, body });
    }
    return plan.sort((a, b) => a.at - b.at).slice(0, 60);
  }

  function schedule() {
    if (!N || !N.scheduleNotifications) return;
    try { N.scheduleNotifications(JSON.stringify(buildPlan())); } catch (e) {}
  }
  function askNotify() {
    if (N && N.notificationsAllowed && N.requestNotificationPermission && !N.notificationsAllowed()) {
      N.requestNotificationPermission();
    }
  }

  /* ---------- Hearth ---------- */
  function renderHearth() {
    const now = Date.now();
    const d = new Date(now);
    $('#hearthDay').textContent = `${Store.DAYS[d.getDay()]} ${d.getDate()} ${Store.MONTHS[d.getMonth()]}`;

    const people = Store.people();
    const list = people.length ? Store.nudges(now) : [];
    const lede = $('#hearthLede');

    /* The mark reads the week. Everyone in rhythm and the two rings sit close and warm;
       as people drift they walk apart, which is the same picture a person's page draws. */
    const adrift = people.filter(p => Store.warmth(p, now).ratio > 1).length;
    const share = people.length ? adrift / people.length : 0;
    Rings.mark($('#hearthMark'), { sep: 0.94 + 0.78 * share, warm: 1 - 0.8 * share, label: 'Kith' });

    if (!people.length) {
      lede.textContent = 'Kith is empty so far. Add the people you actually want to keep, and it will do the remembering.';
    } else if (!list.length && Store.reachOutsRecently(now, 3650) === 0) {
      lede.textContent = 'Kith is set. Nothing has drifted yet, which is exactly right on the first day. Log a catch up whenever one happens and the rhythms start from there.';
    } else if (!list.length) {
      const waiting = Store.candidates(now).length;
      const cap = Store.settings().weeklyCap;
      lede.textContent = (waiting && Store.usedThisWeek(now) >= cap)
        ? `That is your ${cap} for this week. ${waiting === 1 ? 'One other person has' : waiting + ' others have'} drifted, and Kith will hold ${waiting === 1 ? 'them' : 'them'} until ${Store.DAYS[Store.settings().windowDay]}.`
        : 'Everyone is about where you meant them to be. Nothing to do today.';
    } else {
      // Say the true number, not just the number on screen. The cap holds the rest back.
      const onScreen = new Set(list.map(n => n.person.id));
      const held = Store.candidates(now).filter(c => !onScreen.has(c.person.id)).length;
      const total = list.length + held;
      const base = total === 1
        ? 'One person has drifted past the rhythm you set with them.'
        : `${total} of your people have drifted past their rhythm.`;
      lede.textContent = held
        ? `${base} Kith is raising ${list.length === 1 ? 'one' : list.length} this week and will hold the ${held === 1 ? 'other' : 'others'} until ${Store.DAYS[Store.settings().windowDay]}.`
        : base;
    }

    $('#nudgeList').innerHTML = list.map((n, i) => {
      const p = n.person;
      const m = n.moment;
      return `<article class="nudge" data-id="${p.id}" style="--i:${i}">
        <div class="nudge-head">
          ${Rings.avatar(p, 42)}
          <span class="who"><span class="nm">${esc(p.name)}</span>
            <span class="rg">${esc(Store.ring(p.ring).name)} &middot; every ${Store.rhythmOf(p)} days</span></span>
        </div>
        <p class="drift">${esc(Store.driftLine(p, n.warmth))}</p>
        ${m && m.text ? `<p class="detail">${esc(m.text)}</p>` : ''}
        <div class="actions">
          <button class="btn small ember" data-act="reach" data-id="${p.id}">${p.channel === 'call' ? 'Call' : 'Say something'}</button>
          <button class="btn ghost small" data-act="talked" data-id="${p.id}">We talked</button>
          <span class="spacer"></span>
          <button class="btn bare" data-act="snooze" data-id="${p.id}">Not this week</button>
          <button class="btn bare" data-act="dismiss" data-id="${p.id}">Set aside</button>
        </div>
      </article>`;
    }).join('');

    const soon = Store.upcomingDates(30, now).slice(0, 4);
    $('#ribbon').hidden = soon.length === 0;
    $('#ribbonList').innerHTML = soon.map(u => `
      <button class="daterow ${u.date.kind === 'tender' ? 'tender' : ''}" data-person="${u.person.id}">
        <span class="dd">${u.days === 0 ? 'today' : u.days === 1 ? 'tmrw' : u.days + 'd'}</span>
        <span class="dl"><span class="who">${esc(u.person.name)}</span>
          <span class="lb">${esc(dateLine(u))}</span></span>
      </button>`).join('');

    const shown = new Set(list.map(n => n.person.id));
    const seenHard = new Set();
    const hard = Store.momentsWithChip('hard', 90, now).filter(m => {
      if (shown.has(m.personId) || seenHard.has(m.personId)) return false;
      seenHard.add(m.personId); return true;
    }).slice(0, 2);
    $('#tideHint').hidden = hard.length === 0;
    $('#tideHintList').innerHTML = hard.map(m => {
      const p = Store.person(m.personId);
      return `<button class="shelfrow" data-person="${p.id}">
        ${Rings.avatar(p, 36)}
        <span class="who"><span class="nm">${esc(p.name)}</span>
          <span class="ctx">${esc(m.text || 'Marked a hard season.')}</span></span>
        <span class="when">${esc(Store.ago(m.at))}</span>
      </button>`;
    }).join('');

    // The quiet screens are drawn, not blank.
    const rest = $('#hearthRest');
    if (!list.length) {
      // The lede becomes the caption under a drawn scene, so the screen says one thing once.
      rest.hidden = false;
      rest.innerHTML = Rings.scene(people.length ? 'together' : 'people', lede.textContent);
      lede.hidden = true;
    } else {
      rest.hidden = true; rest.innerHTML = '';
      lede.hidden = false;
    }

    const n = Store.reachOutsRecently(now);
    $('#effortLine').textContent = n === 0
      ? 'Nothing logged in the last thirty days. The first entry is the hardest one.'
      : `You reached out ${n} ${n === 1 ? 'time' : 'times'} in the last thirty days. Kith counts what you give, never what came back.`;
  }

  function dateLine(u) {
    const d = u.date;
    if (d.kind === 'birthday') {
      const age = u.years ? `, turning ${u.years}` : '';
      return `Birthday${age}`;
    }
    if (d.kind === 'tender') {
      const y = u.years ? `${u.years} ${u.years === 1 ? 'year' : 'years'} since ` : '';
      return d.label ? `${y}${d.label}` : 'A tender date';
    }
    if (!d.label) return 'A date you marked';
    return u.years ? `${d.label}, ${u.years} ${u.years === 1 ? 'year' : 'years'} on` : d.label;
  }

  /* ---------- People ---------- */
  function renderPeople() {
    const people = Store.people();
    const q = $('#search').hidden ? '' : $('#search').value.trim().toLowerCase();
    $('#peopleCount').textContent = people.length === 0 ? 'Nobody yet'
      : `${people.length} ${people.length === 1 ? 'person' : 'people'} in four rings`;
    const pe = $('#peopleEmpty');
    pe.hidden = people.length > 0;
    if (!pe.hidden && !pe.firstChild) {
      pe.innerHTML = Rings.scene('people', 'Nobody here yet. Start with one person you have been meaning to call.');
    }
    $('#viewToggle').textContent = peopleMode === 'rings' ? 'List' : 'Rings';
    $('#viewToggle').hidden = people.length === 0;
    const searchEl = $('#search');
    searchEl.hidden = people.length < 5;
    // A hidden box that still holds a word would keep the map hidden with no way to clear it.
    if (searchEl.hidden && searchEl.value) searchEl.value = '';

    const showList = peopleMode === 'list' || q.length > 0;
    $('#ringWrap').hidden = showList || people.length === 0;
    $('#peopleList').hidden = !showList;

    if (!showList && people.length) Rings.map($('#ringWrap'), openPerson);

    if (showList) {
      const matched = people.filter(p => !q || p.name.toLowerCase().includes(q));
      let html = '';
      for (const r of Store.RINGS) {
        const inRing = matched.filter(p => p.ring === r.id)
          .sort((a, b) => Store.warmth(b).ratio - Store.warmth(a).ratio);
        if (!inRing.length) continue;
        html += `<p class="groupname">${esc(r.name)}</p>`;
        html += inRing.map((p, i) => {
          const w = Store.warmth(p);
          return `<button class="prow" data-person="${p.id}" style="--i:${i}">
            ${Rings.avatar(p, 40)}
            <span class="who"><span class="nm">${esc(p.name)}</span>
              <span class="sec">${esc(w.everLogged ? 'Last talked ' + Store.ago(Date.now() - w.days * Store.DAY) : 'Nothing logged yet')}</span></span>
            <span class="state${w.ratio > 1 ? ' adrift' : ''}">${esc(w.quiet ? 'Paused' : w.label)}</span>
          </button>`;
        }).join('');
      }
      $('#peopleList').innerHTML = html || '<p class="empty">No name here matches that.</p>';
    }
  }

  /* ---------- Tides ---------- */
  function shelf(chip, emptyText, emptyScene) {
    const seen = new Set();
    const rows = [];
    for (const m of Store.momentsWithChip(chip, 90)) {
      if (seen.has(m.personId)) continue;
      seen.add(m.personId);
      const p = Store.person(m.personId);
      rows.push(`<button class="shelfrow" data-person="${p.id}" style="--i:${rows.length}">
        ${Rings.avatar(p, 42)}
        <span class="who"><span class="nm">${esc(p.name)}</span>
          <span class="ctx">${esc(m.text || '')}</span></span>
        <span class="when">${esc(Store.ago(m.at))}</span>
      </button>`);
    }
    return rows.length ? rows.join('') : Rings.scene(emptyScene, emptyText);
  }

  function renderTides() {
    $('#tideHard').innerHTML = shelf('hard',
      'Nobody you know is marked as having a hard time. That is a good thing to be able to read.', 'calm');
    $('#tideGood').innerHTML = shelf('celebrate',
      'No celebrations marked in the last three months.', 'quietgood');
  }

  /* ---------- Dates ---------- */
  function renderDates() {
    const up = Store.upcomingDates(400);
    $('#datesCount').textContent = up.length ? `${up.length} in the year ahead` : 'The year ahead';
    const de = $('#datesEmpty');
    de.hidden = up.length > 0;
    if (!de.hidden && !de.firstChild) {
      de.innerHTML = Rings.scene('river',
        'Birthdays, yes. Also the day her father died, the day he got sober, the day you met. Kith reminds you a few days early, so a line arrives before the day does.');
    }
    let html = '', month = '', i = 0;
    for (const u of up) {
      const d = new Date(u.at);
      const key = `${Store.MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      if (key !== month) {
        if (month) html += '</div></div>';
        month = key;
        html += `<div class="month"><p class="monthname">${esc(key)}</p><div class="stones">`;
      }
      const lead = Store.leadFor(u.date);
      html += `<div class="stone ${u.date.kind === 'tender' ? 'tender' : ''}" data-person="${u.person.id}" data-date="${u.date.id}" style="--i:${i++}">
        <p class="d1">${d.getDate()} ${esc(Store.MONTHS[d.getMonth()].slice(0, 3))} &middot; ${esc(Store.until(u.at))}</p>
        <p class="d2">${esc(u.person.name)}</p>
        <p class="d3">${esc(dateLine(u))}${lead ? ` &middot; you will hear from Kith ${lead} ${lead === 1 ? 'day' : 'days'} before` : ' &middot; on the day'}</p>
      </div>`;
    }
    if (month) html += '</div></div>';
    $('#dateRiver').innerHTML = html;
  }

  /* ---------- Person page ---------- */
  function openPerson(id) {
    const p = Store.person(id);
    if (!p) return;
    currentPerson = id;
    if (view !== 'person') previous = view;
    renderPerson();
    setView('person');
  }

  function renderPerson() {
    const p = Store.person(currentPerson);
    if (!p) { setView(previous); return; }
    const w = Store.warmth(p);
    const last = Store.lastContact(p.id, false);
    const lastReal = Store.lastContact(p.id, true);
    const m = Store.lastMoment(p.id);
    const dts = Store.datesFor(p.id).map(d => ({ date: d, person: p, at: Store.nextOccurrence(d), days: Store.daysBetween(Date.now(), Store.nextOccurrence(d)), years: d.year ? new Date(Store.nextOccurrence(d)).getFullYear() - d.year : null }))
      .sort((a, b) => a.at - b.at);
    const moments = Store.momentsFor(p.id);
    const kindLabel = k => (Store.KINDS.find(x => x.id === k) || { label: 'Contact' }).label;

    let html = `
      <div class="phead">${Rings.avatar(p, 58)}
        <div class="who"><h1 class="nm">${esc(p.name)}</h1>
          <p class="rg">${esc(Store.ring(p.ring).name)} ring &middot; every ${Store.rhythmOf(p)} days &middot; prefers ${esc((Store.CHANNELS.find(c => c.id === p.channel) || Store.CHANNELS[1]).label.toLowerCase())}</p></div>
      </div>
      <div class="lensbox" id="lensBox"></div>
      <p class="warmline"><span><b>${esc(w.quiet ? 'Paused' : w.label)}</b></span>
        <span>${esc(w.everLogged ? `${w.days} ${w.days === 1 ? 'day' : 'days'} on a ${w.rhythm} day rhythm` : 'no catch up logged yet')}</span></p>`;

    if (p.note) html += `<p class="lasttime"><span class="q">${esc(p.note)}</span></p>`;

    if (lastReal && m) {
      html += `<p class="lasttime">Last time, ${Store.ago(lastReal.at)}: <span class="q">${esc(m.text)}</span></p>`;
    } else if (last) {
      html += `<p class="lasttime">Last logged ${Store.ago(last.at)}, ${esc(kindLabel(last.kind).toLowerCase())}.</p>`;
    } else {
      html += `<p class="lasttime">Nothing logged yet. The first entry is the hardest one.</p>`;
    }

    html += `<div class="btnrow">
        <button class="btn ember" data-act="talked" data-id="${p.id}">We talked</button>
        <button class="btn ghost small" data-act="reach" data-id="${p.id}">What to say</button>
      </div>`;

    html += `<h2 class="sub">Dates</h2>`;
    html += dts.length ? dts.map(u => `
      <div class="daterow ${u.date.kind === 'tender' ? 'tender' : ''}">
        <span class="dd">${new Date(u.at).getDate()} ${esc(Store.MONTHS[new Date(u.at).getMonth()].slice(0, 3))}</span>
        <span class="dl"><span class="who">${esc(dateLine(u))}</span>
          <span class="lb">${esc(Store.until(u.at))}</span></span>
        <button class="btn bare" data-act="deldate" data-id="${u.date.id}">Remove</button>
      </div>`).join('')
      : '<p class="help">No dates yet. Birthdays, and the days that are harder than birthdays.</p>';
    html += `<div class="btnrow"><button class="btn ghost small" data-act="adddate" data-id="${p.id}">Add a date</button></div>`;

    html += `<h2 class="sub">Moments</h2>`;
    html += moments.length ? moments.map((mm, i) => `
      <div class="moment" style="--i:${i}">
        <button class="btn bare del" data-act="delmoment" data-id="${mm.id}">Remove</button>
        <span class="when">${esc(Store.shortDate(mm.at))} &middot; ${esc(Store.ago(mm.at))}</span>
        ${mm.text ? `<p class="txt">${esc(mm.text)}</p>` : ''}
        ${mm.chips.length ? `<div class="tags">${mm.chips.map(c => {
          const label = (Store.CHIPS.find(x => x.id === c) || {}).label || c;
          return `<span class="tag${c === 'hard' || c === 'celebrate' ? ' warm' : ''}">${esc(label)}</span>`;
        }).join('')}</div>` : ''}
      </div>`).join('')
      : Rings.scene('card', 'Nothing written down about ' + esc(first(p.name)) +
          ' yet. Fifteen seconds after a call is all this takes.');

    html += `<h2 class="sub">Quiet season</h2>`;
    if (w.quiet) {
      html += `<p class="help long">Nudges are paused until ${esc(Store.shortDate(p.quietUntil))}. Everything is still here, nothing is lost.</p>
        <div class="btnrow"><button class="btn ghost small" data-act="unquiet" data-id="${p.id}">Start nudging again</button></div>`;
    } else {
      html += `<p class="help long">She asked for space. He is in exam season. You are the one who needs a month off. Pausing changes nothing except whether Kith raises their name.</p>
        <div class="btnrow">
          <button class="btn ghost small" data-act="quiet" data-days="30" data-id="${p.id}">Pause a month</button>
          <button class="btn ghost small" data-act="quiet" data-days="90" data-id="${p.id}">Pause three months</button>
        </div>`;
    }

    const body = $('#personBody');
    body.innerHTML = html;
    body.scrollTop = 0;
    Rings.lens($('#lensBox'), w, p);
  }

  /* ---------- Settings ---------- */
  function renderSettings() {
    const s = Store.settings();
    $('#setDay').value = String(s.windowDay);
    $('#setTime').value = s.windowTime;
    $('#setCap').value = String(s.weeklyCap);
    $('#setTone').value = s.tone;
    $('#setDiscreet').checked = !!s.discreetNotes;
    $('#setBlur').checked = !!s.discreetView;
    $('#setLeadB').value = String(s.leadBirthday);
    $('#setLeadT').value = String(s.leadTender);
    const c = Store.counts();
    const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    $('#countLine').textContent =
      `${n(c.people, 'person', 'people')}, ${n(c.moments, 'moment', 'moments')}, ` +
      `${c.events} logged ${c.events === 1 ? 'catch up' : 'catch ups'} and ${n(c.dates, 'date', 'dates')}, ` +
      `all of it on this device.`;
    tonePreview();
  }

  function tonePreview() {
    const tone = $('#setTone').value;
    const sample = { name: 'Amir' };
    const w = { days: 44, rhythm: 30, ratio: 1.47, state: 'drifting', everLogged: true };
    $('#tonePreview').textContent = 'For example: ' + Store.driftLine(sample, w, tone);
  }

  /* ---------- log sheet ---------- */
  function openLog(personId) {
    const p = Store.person(personId);
    if (!p) return;
    logTarget = personId;
    logKind = p.channel === 'in_person' ? 'in_person' : (p.channel === 'call' ? 'call' : 'message');
    logChips = [];
    $('#logTitle').textContent = `You and ${first(p.name)}`;
    $('#logReal').checked = true;
    $('#logText').value = '';
    paintLogChips();
    $('#sheetLog').hidden = false;
  }
  function paintLogChips() {
    $('#logKinds').innerHTML = Store.KINDS.map(k =>
      `<button class="chip${k.id === logKind ? ' on' : ''}" data-kind="${k.id}" role="radio" aria-checked="${k.id === logKind}">${esc(k.label)}</button>`).join('');
    $('#logChips').innerHTML = Store.CHIPS.map(c =>
      `<button class="chip${logChips.includes(c.id) ? ' on' : ''}${(c.id === 'hard' || c.id === 'celebrate') ? ' warm' : ''}" data-chip="${c.id}" aria-pressed="${logChips.includes(c.id)}">${esc(c.label)}</button>`).join('');
  }
  function saveLog() {
    const p = Store.person(logTarget);
    if (!p) return false;
    const real = $('#logReal').checked;
    Store.logContact(p.id, logKind, real);
    Store.addMoment(p.id, $('#logText').value, logChips);
    Store.resolveNudge(p.id, 'acted');
    $('#sheetLog').hidden = true;
    tap(16, 150);
    toast(`Logged. ${first(p.name)} is back in rhythm.`);
    schedule();
    refresh();
  }

  /* ---------- person sheet ---------- */
  function openPersonSheet(id) {
    personEditing = id || null;
    const p = id ? Store.person(id) : null;
    $('#personSheetTitle').textContent = p ? `Edit ${first(p.name)}` : 'Add someone';
    $('#pName').value = p ? p.name : '';
    personRing = p ? p.ring : 'table';
    $('#pPhone').value = p ? (p.phone || '') : '';
    $('#pNote').value = p ? (p.note || '') : '';
    paintRingPick($('#pRing'), $('#pRingNote'));
    paintRhythm(p);
    $('#pChannel').innerHTML = Store.CHANNELS.map(c =>
      `<option value="${c.id}">${esc(c.label)}</option>`).join('');
    $('#pChannel').value = p ? p.channel : 'message';
    fieldError('#pNameErr', '', '#pName');
    $('#pDelete').hidden = !p;
    $('#sheetPerson').hidden = false;
    if (!p) setTimeout(() => $('#pName').focus(), 80);
  }
  function paintRingPick(el, noteEl) {
    el.innerHTML = Store.RINGS.map(r =>
      `<button class="rb${r.id === personRing ? ' on' : ''}" data-ring="${r.id}" role="radio" aria-checked="${r.id === personRing}">${esc(r.name)}</button>`).join('');
    if (noteEl) noteEl.textContent = Store.ring(personRing).note + ` Kith will suggest reaching out every ${Store.ring(personRing).rhythm} days.`;
  }
  function paintRhythm(p) {
    const def = Store.ring(personRing).rhythm;
    const opts = [7, 14, 21, 30, 45, 60, 90, 120, 180, 365];
    // A rhythm restored from a file need not be one of the ten. Keeping it in the list is
    // what stops opening Edit and pressing Save from quietly resetting it to the ring default.
    if (p && p.rhythmDays && !opts.includes(p.rhythmDays)) opts.push(p.rhythmDays);
    opts.sort((a, b) => a - b);
    $('#pRhythm').innerHTML = `<option value="">Their ring's rhythm (${def} days)</option>` +
      opts.map(d => `<option value="${d}">${d} days</option>`).join('');
    $('#pRhythm').value = p && p.rhythmDays ? String(p.rhythmDays) : '';
  }
  function savePersonSheet() {
    const name = $('#pName').value.trim();
    if (!name) { fieldError('#pNameErr', 'A name is the only thing Kith needs.', '#pName'); return false; }
    fieldError('#pNameErr', '');
    const fields = {
      name, ring: personRing,
      rhythmDays: $('#pRhythm').value ? Number($('#pRhythm').value) : null,
      channel: $('#pChannel').value,
      phone: $('#pPhone').value,
      note: $('#pNote').value
    };
    if (personEditing) Store.updatePerson(personEditing, fields);
    else { const np = Store.addPerson(fields); if (np) currentPerson = currentPerson || np.id; }
    $('#sheetPerson').hidden = true;
    tap();
    schedule();
    refresh();
  }

  /** Errors belong beside the field that caused them, never in a toast and never in an alert. */
  function fieldError(sel, message, focusSel) {
    const el = $(sel);
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
    const field = focusSel && $(focusSel);
    if (field) {
      field.setAttribute('aria-invalid', message ? 'true' : 'false');
      field.classList.toggle('bad', !!message);
      if (message) field.focus();
    }
  }

  /* ---------- date sheet ---------- */
  function openDateSheet(personId) {
    const people = Store.people();
    if (!people.length) { toast('Add a person first, then a date to remember.'); return; }
    dateKind = 'birthday';
    $('#dPerson').innerHTML = people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    if (personId) $('#dPerson').value = personId;
    $('#dMonth').innerHTML = Store.MONTHS.map((m, i) => `<option value="${i + 1}">${esc(m)}</option>`).join('');
    const now = new Date();
    $('#dMonth').value = String(now.getMonth() + 1);
    $('#dDay').value = String(now.getDate());
    $('#dYear').value = '';
    $('#dLabel').value = '';
    $('#dLead').value = '';
    fieldError('#dDayErr', '', '#dDay'); fieldError('#dYearErr', '', '#dYear');
    syncDayMax();
    paintDateKinds();
    $('#sheetDate').hidden = false;
  }
  function paintDateKinds() {
    $('#dKind').innerHTML = Store.DATE_KINDS.map(k =>
      `<button class="chip${k.id === dateKind ? ' on' : ''}${k.id === 'tender' ? ' warm' : ''}" data-datekind="${k.id}" role="radio" aria-checked="${k.id === dateKind}">${esc(k.label)}</button>`).join('');
    const ph = { birthday: 'Birthday', tender: 'The day her father died', custom: 'The day we met' };
    $('#dLabel').placeholder = ph[dateKind];
  }
  // February keeps 29 so a leap-year birthday can be entered; the year is optional here.
  const daysInMonth = m => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] || 31;
  function syncDayMax() {
    const month = Number($('#dMonth').value) || 1;
    const max = daysInMonth(month);
    $('#dDay').max = String(max);
    if (Number($('#dDay').value) > max) $('#dDay').value = String(max);
  }
  function saveDateSheet() {
    const pid = $('#dPerson').value;
    const day = Number($('#dDay').value), month = Number($('#dMonth').value);
    if (!pid || !month || !Number.isFinite(day) || day < 1) {
      fieldError('#dDayErr', 'Kith needs a day and a month.', '#dDay'); return false;
    }
    if (day > daysInMonth(month)) {
      fieldError('#dDayErr', `${Store.MONTHS[month - 1]} does not have ${day} days.`, '#dDay'); return false;
    }
    const yr = $('#dYear').value.trim();
    if (yr && !(Number(yr) >= 1900 && Number(yr) <= 2100)) {
      fieldError('#dYearErr', 'A year between 1900 and 2100.', '#dYear'); return false;
    }
    fieldError('#dDayErr', ''); fieldError('#dYearErr', '');
    const lead = $('#dLead').value === '' ? undefined : Number($('#dLead').value);
    Store.addDate(pid, dateKind, month, day, yr || null, $('#dLabel').value, lead);
    $('#sheetDate').hidden = true;
    tap();
    schedule();
    toast('Kith will tell you before it arrives.');
    refresh();
  }

  /* ---------- opener sheet ---------- */
  function openOpener(personId) {
    const p = Store.person(personId);
    if (!p) return;
    const m = Store.lastMoment(p.id);
    $('#openTitle').textContent = `Writing to ${first(p.name)}`;
    $('#openRemember').innerHTML = m && m.text
      ? `<p class="sheet-sub">What you wrote down ${esc(Store.ago(m.at))}</p><p class="detail">${esc(m.text)}</p>`
      : `<p class="sheet-sub">Nothing written down about ${esc(first(p.name))} yet, so this is a plain hello.</p>`;
    const box = $('#openText');
    box.value = Store.opener(p);

    const tel = Store.dialable(p.phone);
    let acts = `<button class="btn ember" id="openCopy">Copy the line</button>`;
    if (tel) {
      acts += `<a class="btn ghost small" id="openSms" href="#">Open messages</a>`;
      acts += `<a class="btn ghost small" id="openTel" href="tel:${tel}">Call</a>`;
    } else {
      acts += `<button class="btn ghost small" data-act="addnumber" data-id="${p.id}">Add a number</button>`;
    }
    acts += `<button class="btn ghost small" data-act="talked" data-id="${p.id}">We talked</button>`;
    $('#openActions').innerHTML = acts;

    const sync = () => {
      const sms = $('#openSms');
      if (sms) sms.href = `sms:${tel}?body=${encodeURIComponent(box.value)}`;
    };
    sync();
    box.oninput = sync;
    const cp = $('#openCopy');
    if (cp) cp.onclick = () => copy(box.value);
    $('#sheetOpen').hidden = false;
  }

  /* ---------- navigation ---------- */
  function setView(v) {
    view = v;
    $$('.view').forEach(el => { el.hidden = el.id !== 'v-' + v; });
    $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.view === v));
    const s = document.querySelector('#v-' + v + ' .scroller');
    if (s) s.scrollTop = 0;
  }

  function show(v) {
    if (['hearth', 'people', 'tides', 'dates'].includes(v)) previous = v;
    setView(v);
    if (v === 'hearth') renderHearth();
    if (v === 'people') renderPeople();
    if (v === 'tides') renderTides();
    if (v === 'dates') renderDates();
    if (v === 'settings') renderSettings();
    if (v === 'person') renderPerson();
  }

  function refresh() {
    if (view === 'person') { renderPerson(); return; }
    show(view);
  }

  function anySheetOpen() { return $$('.sheet').some(s => !s.hidden); }
  function closeSheets() { $$('.sheet').forEach(s => { s.hidden = true; }); }

  /* ---------- onboarding ---------- */
  let obStep = 0;
  let obRing = 'hearth';
  function renderOb() {
    $$('.ob-card').forEach(c => { c.hidden = Number(c.dataset.step) !== obStep; });
    if (obStep === 0 && !$('#obMark').firstChild) Rings.mark($('#obMark'), { sep: 0.9, warm: 1 });
    $('#obDots').innerHTML = [0, 1, 2, 3].map(i => `<span class="ob-dot${i === obStep ? ' on' : ''}"></span>`).join('');
    $('#obNext').textContent = obStep === 3 ? 'Begin' : 'Next';
    $('#obBack').hidden = obStep === 0;
    if (obStep === 1) paintObRing();
    if (obStep === 2) paintObPreview();
    $('.ob-track').scrollTop = 0;
  }
  function paintObRing() {
    $('#obRing').innerHTML = Store.RINGS.map(r =>
      `<button class="rb${r.id === obRing ? ' on' : ''}" data-obring="${r.id}" role="radio" aria-checked="${r.id === obRing}">${esc(r.name)}</button>`).join('');
    $('#obRingNote').textContent = Store.ring(obRing).note + ` Every ${Store.ring(obRing).rhythm} days.`;
    paintObList();
  }
  function paintObList() {
    const people = Store.people();
    $('#obList').innerHTML = people.map(p => `
      <li>${Rings.avatar(p, 30)}<span class="nm">${esc(p.name)}</span>
      <span class="rg">${esc(Store.ring(p.ring).name)}</span>
      <button class="x" data-obdel="${p.id}" aria-label="Remove ${esc(p.name)}">Remove</button></li>`).join('');
  }
  function paintObPreview() {
    const people = Store.people();
    const p = people[0] || { id: '', name: 'Amir', ring: 'table', channel: 'message' };
    const w = { days: 44, rhythm: Store.rhythmOf(p), ratio: 1.4, state: 'drifting', everLogged: true, quiet: false };
    $('#obPreview').innerHTML = `<article class="nudge">
      <div class="nudge-head">${Rings.avatar(p, 42)}
        <span class="who"><span class="nm">${esc(p.name)}</span>
          <span class="rg">${esc(Store.ring(p.ring).name)}</span></span></div>
      <p class="drift">${esc(Store.driftLine(p, w, 'gentle'))}</p>
      <p class="detail">The new job was rocky. Said the second month would tell.</p>
      <div class="actions">
        <span class="btn small ember" aria-hidden="true">Say something</span>
        <span class="btn ghost small" aria-hidden="true">We talked</span>
      </div>
    </article>
    <p class="help">That detail comes from something you wrote down after the last call. Kith never invents one.</p>`;
  }
  function obAdd() {
    const name = $('#obName').value.trim();
    if (!name) return;
    Store.addPerson({ name, ring: obRing });
    $('#obName').value = '';
    $('#obName').focus();
    tap(10, 80);
    paintObList();
  }
  function obNext() {
    if (obStep === 1 && !Store.people().length) { toast('Add at least one person, even if it is only one.'); return; }
    if (obStep < 3) { obStep++; renderOb(); return; }
    Store.settings({
      weeklyCap: Number($('#obCap').value),
      windowDay: Number($('#obDay').value),
      windowTime: $('#obTime').value || '10:00'
    });
    Store.onboarded(true);
    startApp();
    askNotify();
  }

  /* ---------- boot ---------- */
  function startApp() {
    $('#onboard').hidden = true;
    $('#tabs').hidden = false;
    document.body.classList.add('has-tabs');
    applyDiscreet();
    show('hearth');
    schedule();
  }

  function applyDiscreet() {
    document.body.classList.toggle('discreet', !!Store.settings().discreetView);
    if (!Store.settings().discreetView) $$('.revealed').forEach(e => e.classList.remove('revealed'));
  }

  function fillDaySelects() {
    const opts = Store.DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('');
    $('#obDay').innerHTML = opts; $('#setDay').innerHTML = opts;
    $('#obDay').value = '0';
  }

  /* ---------- one delegated click handler for everything data-act ---------- */
  function actions(e) {
    const blurEl = e.target.closest('.detail, .moment .txt, .lasttime .q, .ctx');
    if (blurEl && document.body.classList.contains('discreet') && !blurEl.classList.contains('revealed')) {
      blurEl.classList.add('revealed');
      e.preventDefault();
      return;
    }

    const act = e.target.closest('[data-act]');
    if (act) {
      e.stopPropagation();
      const id = act.dataset.id;
      switch (act.dataset.act) {
        case 'reach': openOpener(id); return;
        case 'talked': closeSheets(); openLog(id); return;
        case 'snooze': Store.resolveNudge(id, 'snoozed'); toast('Set aside for a week.'); schedule(); refresh(); return;
        case 'dismiss': Store.resolveNudge(id, 'dismissed'); toast('Noted. Kith will wait longer next time.'); schedule(); refresh(); return;
        case 'adddate': openDateSheet(id); return;
        case 'deldate': Store.removeDate(id); schedule(); renderPerson(); return;
        case 'delmoment': Store.removeMoment(id); renderPerson(); return;
        case 'quiet': Store.updatePerson(id, { quietUntil: Date.now() + Number(act.dataset.days) * Store.DAY }); schedule(); renderPerson(); toast('Paused. Nothing is lost.'); return;
        case 'unquiet': Store.updatePerson(id, { quietUntil: null }); schedule(); renderPerson(); return;
        case 'addnumber': closeSheets(); openPersonSheet(id); return;
      }
    }

    const row = e.target.closest('[data-person]');
    if (row) { closeSheets(); openPerson(row.dataset.person); return; }

    const card = e.target.closest('.nudge[data-id]');
    if (card) { openPerson(card.dataset.id); }
  }

  function bind() {
    fillDaySelects();

    // onboarding
    $('#obNext').onclick = obNext;
    $('#obBack').onclick = () => { if (obStep > 0) { obStep--; renderOb(); } };
    $('#obAdd').onclick = obAdd;
    $('#obName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); obAdd(); } });
    $('#obRing').addEventListener('click', e => {
      const b = e.target.closest('[data-obring]'); if (!b) return;
      obRing = b.dataset.obring; paintObRing();
    });
    $('#obRestore').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const res = Store.importJson(String(r.result));
        $('#obRestoreNote').textContent = res.message;
        if (res.ok) { Store.onboarded(true); startApp(); askNotify(); }
      };
      r.onerror = () => { $('#obRestoreNote').textContent = 'That file could not be read.'; };
      r.readAsText(f);
      e.target.value = '';
    };
    $('#obList').addEventListener('click', e => {
      const b = e.target.closest('[data-obdel]'); if (!b) return;
      Store.removePerson(b.dataset.obdel); paintObList();
    });

    // tabs and pushed views
    $$('.tab').forEach(t => { t.onclick = () => show(t.dataset.view); });
    $('#toSettings').onclick = () => { previous = view; show('settings'); };
    $('#settingsBack').onclick = () => show(previous === 'settings' ? 'hearth' : previous);
    $('#personBack').onclick = () => show(previous === 'person' ? 'people' : previous);
    $('#personEdit').onclick = () => openPersonSheet(currentPerson);

    // people
    $('#viewToggle').onclick = () => { peopleMode = peopleMode === 'rings' ? 'list' : 'rings'; renderPeople(); };
    $('#search').addEventListener('input', renderPeople);
    $('#addPerson').onclick = () => openPersonSheet(null);
    $('#addDate').onclick = () => openDateSheet(null);

    // sheets
    $$('.sheet').forEach(sh => {
      sh.addEventListener('click', e => { if (e.target === sh) sh.hidden = true; });
    });
    $('#logCancel').onclick = () => { $('#sheetLog').hidden = true; };
    $('#logSave').onclick = once(saveLog);
    $('#logKinds').addEventListener('click', e => {
      const b = e.target.closest('[data-kind]'); if (!b) return;
      logKind = b.dataset.kind; paintLogChips();
    });
    $('#logChips').addEventListener('click', e => {
      const b = e.target.closest('[data-chip]'); if (!b) return;
      const c = b.dataset.chip;
      logChips = logChips.includes(c) ? logChips.filter(x => x !== c) : logChips.concat(c);
      paintLogChips();
    });

    $('#pCancel').onclick = () => { $('#sheetPerson').hidden = true; };
    $('#pSave').onclick = once(savePersonSheet);
    $('#pRing').addEventListener('click', e => {
      const b = e.target.closest('[data-ring]'); if (!b) return;
      personRing = b.dataset.ring;
      paintRingPick($('#pRing'), $('#pRingNote'));
      paintRhythm(personEditing ? Store.person(personEditing) : null);
    });
    $('#pDelete').onclick = () => {
      const btn = $('#pDelete');
      if (btn.dataset.armed) {
        const id = personEditing;
        Store.removePerson(id);
        delete btn.dataset.armed; btn.textContent = 'Remove';
        $('#sheetPerson').hidden = true;
        currentPerson = null;
        show('people');
      } else {
        btn.dataset.armed = '1'; btn.textContent = 'Tap again to remove';
        setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Remove'; }, 4000);
      }
    };

    $('#dCancel').onclick = () => { $('#sheetDate').hidden = true; };
    $('#dMonth').onchange = syncDayMax;
    $('#dSave').onclick = once(saveDateSheet);
    $('#dKind').addEventListener('click', e => {
      const b = e.target.closest('[data-datekind]'); if (!b) return;
      dateKind = b.dataset.datekind; paintDateKinds();
    });
    $('#openClose').onclick = () => { $('#sheetOpen').hidden = true; };

    // settings
    $('#setDay').onchange = e => { Store.settings({ windowDay: Number(e.target.value) }); schedule(); };
    $('#setTime').onchange = e => { Store.settings({ windowTime: e.target.value || '10:00' }); schedule(); };
    $('#setCap').onchange = e => { Store.settings({ weeklyCap: Number(e.target.value) }); };
    $('#setTone').onchange = e => { Store.settings({ tone: e.target.value }); tonePreview(); schedule(); };
    $('#setDiscreet').onchange = e => { Store.settings({ discreetNotes: e.target.checked }); schedule(); };
    $('#setBlur').onchange = e => { Store.settings({ discreetView: e.target.checked }); applyDiscreet(); };
    $('#setLeadB').onchange = e => { Store.settings({ leadBirthday: Number(e.target.value) }); schedule(); };
    $('#setLeadT').onchange = e => { Store.settings({ leadTender: Number(e.target.value) }); schedule(); };

    $('#exJson').onclick = () => download('kith-export.json', 'application/json', Store.exportJson());
    $('#exCsv').onclick = () => download('kith-export.csv', 'text/csv', Store.exportCsv());
    $('#importFile').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const res = Store.importJson(String(r.result));
        $('#ioNote').textContent = res.message;
        if (res.ok) { schedule(); renderSettings(); }
      };
      r.onerror = () => { $('#ioNote').textContent = 'That file could not be read.'; };
      r.readAsText(f);
      e.target.value = '';
    };
    $('#eraseBtn').onclick = () => {
      const b = $('#eraseBtn');
      if (b.dataset.armed) { Store.erase(); if (N && N.cancelNotifications) { try { N.cancelNotifications(); } catch (e) {} } location.reload(); }
      else {
        b.dataset.armed = '1'; b.textContent = 'Tap again to erase everything';
        setTimeout(() => { delete b.dataset.armed; b.textContent = 'Erase everything'; }, 4000);
      }
    };

    document.addEventListener('click', actions);
  }

  function init() {
    bind();
    if (Store.onboarded()) startApp();
    else { $('#onboard').hidden = false; renderOb(); }
  }

  /* ---------- the Android shell calls these ---------- */
  function back() {
    if (anySheetOpen()) { closeSheets(); return true; }
    // Mid onboarding the gesture belongs to the steps. Letting it fall through drops the
    // user out of the app and loses the people they have just typed.
    if (!$('#onboard').hidden) {
      if (obStep > 0) { obStep--; renderOb(); return true; }
      return false;
    }
    if (view === 'person' || view === 'settings') { show(previous === view ? 'hearth' : previous); return true; }
    if (view !== 'hearth' && !$('#tabs').hidden) { show('hearth'); return true; }
    return false;
  }
  function onPause() {
    // Nothing here plays or records. What it does hold is the drawn mark's animation and a
    // toast timer, and neither should run while the app is off screen.
    clearTimeout(toast._t);
    $('#toast').hidden = true;
    document.body.classList.add('paused');
  }
  function onResume() {
    document.body.classList.remove('paused');
    if (!Store.onboarded()) return;
    applyDiscreet();
    refresh();
    schedule();
  }

  document.addEventListener('DOMContentLoaded', init);
  return { back, onPause, onResume, show, openPerson, openLog, openDateSheet, openPersonSheet, toast, schedule, buildPlan };
})();

// A top-level const in a classic script is not on window, and the shell looks for window.App.
window.App = App;
