/* Sway. The crisis layer is one screen with no navigation. Everything else is behind
   a deliberate door, and the app opens straight into the rhythm every single time. */
const App = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const N = window.Native || null;

  const SCREENS = { session: 's-session', fork: 's-fork', tools: 's-tools', step: 's-step',
                    tap: 's-tap', log: 's-log', closing: 's-closing' };
  let screen = 'session';
  let view = 'shelter';

  let stormId = null;
  let sessionStart = 0;
  let rehearsing = false;
  let hintTimer = null, phaseTimer = null, autoTimer = null, dimTimer = null, phaseTick = null;
  let stepList = null, stepIx = 0, stepTool = null, tapLineTimer = null;
  let draft = { wave: null, chips: [] };
  let eraseArmed = false;

  /* ---------- helpers ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function tap(v) { try { Engine.buzz(v == null ? 0.45 : v, 26); } catch (e) {} }

  /** Every icon in the app comes out of the one symbol sheet, so the stroke language cannot drift. */
  const icon = id => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-' + id + '"/></svg>';
  /** Lists arrive rather than appear: each child is given its place in the stagger. */
  function stagger(el) {
    el.classList.add('stagger');
    Array.from(el.children).forEach((c, i) => c.style.setProperty('--i', Math.min(i, 9)));
  }

  function download(name, mime, text) {
    if (N && N.saveFile) {
      try {
        const uri = N.saveFile(name, mime, btoa(unescape(encodeURIComponent(text))));
        toast(uri ? 'Saved to your Downloads folder' : 'Could not write the file');
      } catch (e) { toast('Could not write the file'); }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Exported');
  }

  const cleanNumber = n => String(n || '').replace(/[^0-9+*#]/g, '');

  function dial(number) {
    const clean = cleanNumber(number);
    if (!clean) return;
    try { window.location.href = 'tel:' + clean; }
    catch (e) { toast('This device cannot place calls. The number is ' + clean + '.'); }
  }

  /** Text lines are shortcodes. Dialling one reaches nobody, so they open a message instead. */
  function sendText(number, body) {
    const clean = cleanNumber(number);
    if (!clean) return;
    try { window.location.href = 'sms:' + clean + (body ? '?body=' + encodeURIComponent(body) : ''); }
    catch (e) { toast('This device cannot send messages. The number is ' + clean + '.'); }
  }

  /* ---------- screens ---------- */
  function go(name) {
    screen = name;
    Object.entries(SCREENS).forEach(([k, id]) => { $('#' + id).hidden = (k !== name); });
    const calm = name === 'calm';
    ['shelter', 'almanac', 'learn'].forEach(v => { $('#v-' + v).hidden = !(calm && v === view); });
    $('#tabs').hidden = !calm;
    document.body.classList.toggle('has-tabs', calm);
    if (calm) $$('.tab').forEach(b => b.classList.toggle('is-on', b.dataset.view === view));
  }
  function setView(v) {
    view = v;
    if (v === 'almanac') renderAlmanac();
    if (v === 'shelter') renderShelter();
    if (v === 'learn') renderLearn();
    go('calm');
    const sc = $('#v-' + v + ' .scroller');
    if (sc) { sc.scrollTop = 0; sc.classList.remove('viewin'); void sc.offsetWidth; sc.classList.add('viewin'); }
  }

  /* ---------- the session ---------- */
  function startSession(opts) {
    opts = opts || {};
    // A second tap on a button that starts a session must not open a second storm record.
    if (Engine.isRunning() && screen === 'session' && !opts.resume && !!opts.rehearse === rehearsing) return;
    rehearsing = !!opts.rehearse;
    if (!opts.resume) {
      sessionStart = Date.now();
      if (!rehearsing) stormId = Store.openStorm();
    }
    go('session');
    Water.resize(); Water.play();
    Engine.start(!!opts.resume);
    Engine.audioResume();
    if (!rehearsing && stormId) Store.addTool(stormId, 'breathing');

    const hint = $('#hint');
    hint.classList.remove('gone');
    hint.textContent = rehearsing
      ? 'A rehearsal. Three minutes, and nothing gets logged.'
      : 'Breathe with the water. You can close your eyes.';
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.add('gone'), rehearsing ? 7000 : 6000);

    const ph = $('#phase');
    ph.classList.remove('on'); ph.textContent = '';
    clearTimeout(phaseTimer); clearInterval(phaseTick);
    // The blueprint's rule: no words on the screen for the first minute.
    phaseTimer = setTimeout(() => {
      ph.classList.add('on');
      phaseTick = setInterval(() => { ph.textContent = Engine.phase(performance.now()); }, 220);
    }, rehearsing ? 12000 : 60000);

    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => { rehearsing ? finishRehearsal() : endSession(); },
                           rehearsing ? 180000 : 360000);
    armDim();
  }

  function stopSessionClock() {
    clearTimeout(hintTimer); clearTimeout(phaseTimer); clearInterval(phaseTick);
    clearTimeout(autoTimer); clearTimeout(dimTimer);
    undim();
    Engine.stop(); Water.halt();
  }

  function endSession() {
    stopSessionClock();
    if (stormId) Store.patch(stormId, { durS: Math.round((Date.now() - sessionStart) / 1000),
                                        endedAt: Date.now(), launchMs: Engine.launchMs() });
    go('fork');
  }
  function finishRehearsal() {
    stopSessionClock();
    rehearsing = false;
    setView('shelter');
    toast('Rehearsal done. Your body knows the shape a little better.');
  }
  /** A rehearsal is entered from the Shelter, so it is a nested screen: Back leaves it quietly. */
  function cancelRehearsal() {
    stopSessionClock();
    rehearsing = false;
    setView('shelter');
  }
  function abandonSession() {
    stopSessionClock();
    if (stormId) { Store.discard(stormId); stormId = null; }
    rehearsing = false;
    setView('shelter');
  }

  /* pocket dim: the screen goes almost black, the rhythm keeps running */
  function armDim() {
    clearTimeout(dimTimer);
    if (!Store.settings().pocketDim) return;
    dimTimer = setTimeout(() => {
      if (Store.settings().pocketDim && screen === 'session' && Engine.isRunning()) {
        $('#pocketVeil').hidden = false;
        if (stormId && !rehearsing) Store.patch(stormId, { pocket: true });
      }
    }, 45000);
  }
  function undim() { $('#pocketVeil').hidden = true; }

  /* ---------- grounding ---------- */
  function openTool(tool) {
    stepTool = tool;
    if (stormId) Store.addTool(stormId, tool);
    if (tool === 'tapping') {
      go('tap');
      $('#tapHow').textContent = Store.settings().haptics
        ? 'Your phone has one motor, so it keeps the beat. Your hands do the alternating.'
        : 'Haptics are switched off, so the two lights keep the beat instead. Your hands do the alternating.';
      let i = 0;
      $('#tapLine').textContent = Content.TAPPING[0];
      clearInterval(tapLineTimer);
      tapLineTimer = setInterval(() => {
        i = (i + 1) % Content.TAPPING.length;
        $('#tapLine').textContent = Content.TAPPING[i];
      }, 9000);
      resumeTapping();
      return;
    }
    stepList = tool === 'senses' ? Content.SENSES : Content.COLD;
    stepIx = 0;
    go('step');
    renderStep();
  }
  function renderStep() {
    const s = stepList[stepIx];
    $('#stepBig').textContent = s.big;
    $('#stepSmall').textContent = s.small;
    $('#stepAdvance').textContent = stepIx === stepList.length - 1 ? 'Tap anywhere to finish' : 'Tap anywhere when you have';
  }
  function nextStep() {
    tap(0.3);
    if (stepIx < stepList.length - 1) { stepIx++; renderStep(); return; }
    go('fork');
  }
  function stopTool() { Engine.tapStop(); clearInterval(tapLineTimer); }
  /** The beat is what the screen is for, so returning to the app has to restart it. */
  function resumeTapping() {
    Engine.tapStart(side => {
      $('#dotL').classList.toggle('lit', side === 0);
      $('#dotR').classList.toggle('lit', side === 1);
    });
  }

  /* ---------- the log ---------- */
  function openLog() {
    draft = { wave: null, chips: [] };
    renderLog();
    go('log');
  }
  function waveSvg(i) {
    const a = 2 + i * 3.4, pts = [];
    for (let x = 0; x <= 40; x += 2) pts.push(x + ' ' + (20 - a * Math.sin(x / 40 * Math.PI * 2)).toFixed(1));
    return '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M' + pts.join(' L') + '"/></svg>';
  }
  function renderLog() {
    const row = $('#waveRow');
    row.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.className = 'wavebtn' + (draft.wave === i ? ' on' : '');
      b.innerHTML = waveSvg(i) + '<span>' + i + '</span>';
      b.setAttribute('aria-label', 'Wave size ' + i + ' of 5');
      b.addEventListener('click', () => { draft.wave = i; tap(0.35); renderLog(); });
      row.appendChild(b);
    }
    $('#waveHint').textContent = draft.wave
      ? ['A ripple.', 'Small, and you felt it.', 'A real one.', 'A big one.', 'As bad as they get.'][draft.wave - 1]
      : 'Tap a wave, or skip. Nothing here is scored.';
    const cr = $('#chipRow');
    cr.innerHTML = '';
    Store.CHIPS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'chip' + (draft.chips.includes(c.id) ? ' on' : '');
      b.textContent = c.label;
      b.addEventListener('click', () => {
        draft.chips = draft.chips.includes(c.id) ? draft.chips.filter(x => x !== c.id) : draft.chips.concat(c.id);
        tap(0.3); renderLog();
      });
      cr.appendChild(b);
    });
  }
  function saveLog() {
    if (stormId) Store.patch(stormId, { wave: draft.wave, chips: draft.chips, logged: true });
    showClosing(true);
  }
  function skipLog() {
    if (stormId) { Store.discard(stormId); stormId = null; }
    showClosing(false);
  }
  function showClosing(saved) {
    const s = stormId ? Store.find(stormId) : null;
    $('#closingLine').textContent = 'That was hard. You rode it.';
    const dur = s && s.durS ? Store.mmss(s.durS) : null;
    $('#closingSub').textContent = saved && dur
      ? 'You stayed with it for ' + dur + '. That is in your Almanac now, and nowhere else.'
      : 'Nothing was recorded. The rhythm is still here whenever you want it.';
    go('closing');
  }

  /* ---------- night shelf ---------- */
  function openShelf() {
    const st = Store.settings();
    const c = st.contact;
    const dialable = cleanNumber(c.phone);
    $('#shelfContactName').textContent = dialable ? 'Call ' + (c.name || 'your person') : 'Your person is not set';
    $('#shelfContactSub').textContent = dialable
      ? c.phone
      : c.phone ? 'The saved number has no digits in it. Fix it on the Shelter screen.'
                : 'Add one on the Shelter screen so it is one tap next time';
    $('#shelfContact').disabled = !dialable;

    const r = Content.region(st.region || 'other');
    const box = $('#shelfLines');
    box.innerHTML = '';
    const add = (title, sub, number, smsBody, glyph) => {
      const b = document.createElement('button');
      b.className = 'shelf-item';
      b.innerHTML = icon(glyph) + '<span><b></b><i></i></span>';
      b.querySelector('b').textContent = title;
      b.querySelector('i').textContent = sub;
      b.addEventListener('click', () => smsBody ? sendText(number, smsBody) : dial(number));
      box.appendChild(b);
    };
    r.lines.forEach(l => add(l.name + ' ' + (l.disp || l.number), l.hours, l.number, l.sms, l.sms ? 'text' : 'call'));
    add('Emergency services ' + r.emergency, 'If this is more than panic, or you are not safe', r.emergency, null, 'ring');
    stagger(box.parentElement);
    $('#shelfNote').textContent = r.lines.length
      ? 'Lines for ' + r.label + ', checked ' + Content.LINES_CHECKED + '. Numbers do change. Set your region on ' +
        'the Shelter screen, and keep your own person saved as well.'
      : 'No local line is bundled for your region yet. 112 reaches emergency services on most mobile networks. ' +
        'Pick your country on the Shelter screen if it is listed, and save your own person there too.';
    $('#shelf').hidden = false;
  }
  function openBystander() {
    const c = Store.settings().contact;
    $('#bysLead').textContent = Content.BYSTANDER[0];
    const ul = $('#bysList');
    ul.innerHTML = '';
    Content.BYSTANDER.slice(1).forEach(t => {
      const li = document.createElement('li'); li.textContent = t; ul.appendChild(li);
    });
    $('#bysName').textContent = c.name && c.phone
      ? 'If you need to call someone for me: ' + c.name + ', ' + c.phone + '.'
      : 'Thank you for staying.';
    $('#shelf').hidden = true;
    $('#s-bystander').hidden = false;
  }

  /* ---------- shelter ---------- */
  function renderShelter() {
    const s = Store.settings();
    const sc = $('#v-shelter .scroller');
    if (!sc.dataset.staggered) { stagger(sc); sc.dataset.staggered = '1'; }
    $('#cName').value = s.contact.name;
    $('#cPhone').value = s.contact.phone;
    const st = $('#contactState');
    const dialable = cleanNumber(s.contact.phone);
    st.classList.toggle('err', !!s.contact.phone && !dialable);
    st.textContent = !s.contact.phone
      ? 'One person you would want on the phone at 3am. The number stays on this device and is only ever dialled by you.'
      : !dialable
        ? 'That number has no digits in it, so nothing would be dialled. Add the digits and save again.'
        : 'One tap from the night shelf reaches ' + (s.contact.name || 'them') + '.';

    const sel = $('#regionSel');
    if (!sel.options.length) {
      Content.REGIONS.forEach(r => {
        const o = document.createElement('option');
        o.value = r.id; o.textContent = r.label;
        sel.appendChild(o);
      });
    }
    sel.value = s.region || 'other';
    const r = Content.region(sel.value);
    $('#regionPreview').textContent = (r.lines.length
      ? r.lines.map(l => l.name + ', ' + (l.disp || l.number)).join('. ') + '. '
      : 'No local line is bundled for this one yet. ') +
      'Emergency services, ' + r.emergency + '. Checked ' + Content.LINES_CHECKED + '.';

    $('#strengthRange').value = Math.round(s.strength * 100);
    $('#protoSel').value = s.protocol;
    $('#hapticsChk').checked = s.haptics;
    $('#audioChk').checked = s.audio;
    $('#dimChk').checked = s.pocketDim;
    let amps = 'Haptics are simulated in a browser. On a phone this sets the real motor.';
    if (N) {
      try { amps = N.hasAmplitudeControl && N.hasAmplitudeControl()
        ? 'This phone can vary vibration strength, so the swell will be a real ramp.'
        : 'This phone vibrates at one fixed strength, so the swell is carried by pulse length instead.'; } catch (e) {}
    }
    // Nothing here can do anything while the motor is switched off, so it says so and steps aside.
    $('#strengthRange').disabled = !s.haptics;
    $('#testSwell').disabled = !s.haptics;
    $('#calibPanel').classList.toggle('off', !s.haptics);
    $('#ampNote').textContent = s.haptics ? amps : 'Haptics are switched off in Settings below, so nothing will vibrate.';
    if (!eraseArmed) $('#eraseBtn').textContent = 'Erase everything';
  }

  /* ---------- almanac ---------- */
  /* A month of nights with nothing written on it yet: the same warm breath over the same cool
     water as the session screen, and the marks along the bottom waiting to be filled in. */
  const EMPTY_ART =
    '<svg class="emptyart" viewBox="0 0 320 148" role="img" aria-label="An almanac page with nothing ' +
    'written on it yet: a warm breath over calm water under stars, and month marks waiting below.">' +
    '<defs>' +
    '<linearGradient id="ea-sea" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#1A3C63"/><stop offset="1" stop-color="#0B1B31"/></linearGradient>' +
    '<linearGradient id="ea-edge" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#6FB2CE" stop-opacity=".2"/>' +
    '<stop offset=".5" stop-color="#8FD0E6" stop-opacity="1"/>' +
    '<stop offset="1" stop-color="#6FB2CE" stop-opacity=".2"/></linearGradient>' +
    '<linearGradient id="ea-warm" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#F2B45C" stop-opacity=".25"/>' +
    '<stop offset=".5" stop-color="#FFD08A" stop-opacity="1"/>' +
    '<stop offset="1" stop-color="#F2B45C" stop-opacity=".25"/></linearGradient>' +
    '<radialGradient id="ea-halo" cx=".5" cy=".5" r=".5">' +
    '<stop offset="0" stop-color="#FFD08A" stop-opacity=".30"/>' +
    '<stop offset=".45" stop-color="#F0A44A" stop-opacity=".08"/>' +
    '<stop offset="1" stop-color="#E28430" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="ea-sheen" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#FFCD82" stop-opacity=".18"/>' +
    '<stop offset="1" stop-color="#FFCD82" stop-opacity="0"/></linearGradient>' +
    '<clipPath id="ea-clip"><path d="M0 78c40-9 78-9 118 0s126 9 202 0v70H0z"/></clipPath>' +
    '</defs>' +
    '<g fill="#FFF3D9">' +
    '<circle cx="44" cy="17" r="1.3" opacity=".6"/><circle cx="118" cy="11" r="1" opacity=".42"/>' +
    '<circle cx="196" cy="20" r="1.5" opacity=".62"/><circle cx="262" cy="13" r="1" opacity=".4"/>' +
    '<circle cx="292" cy="29" r="1.1" opacity=".32"/><circle cx="82" cy="31" r=".9" opacity=".32"/>' +
    '<circle cx="150" cy="34" r=".9" opacity=".26"/><circle cx="228" cy="30" r="1.1" opacity=".3"/></g>' +
    '<ellipse cx="160" cy="50" rx="150" ry="46" fill="url(#ea-halo)"/>' +
    '<path d="M0 78c40-9 78-9 118 0s126 9 202 0v70H0z" fill="url(#ea-sea)"/>' +
    '<g clip-path="url(#ea-clip)"><rect x="0" y="74" width="320" height="34" fill="url(#ea-sheen)"/></g>' +
    '<path d="M0 78c40-9 78-9 118 0s126 9 202 0" fill="none" stroke="url(#ea-edge)" stroke-width="2.6"/>' +
    '<g fill="none" stroke-linecap="round">' +
    '<path d="M0 52c38-16 78-16 118 0s126 16 202 0" stroke="url(#ea-warm)" stroke-width="9" opacity=".2"/>' +
    '<path d="M0 52c38-16 78-16 118 0s126 16 202 0" stroke="url(#ea-warm)" stroke-width="4"/>' +
    '<path d="M0 50.6c38-16 78-16 118 0s126 16 202 0" stroke="#FFF3DC" stroke-width="1" opacity=".38"/></g>' +
    '<g stroke="#3C5C82" stroke-width="1.6" stroke-linecap="round">' +
    '<path d="M14 132h292"/><path d="M56 132v7"/><path d="M104 132v7"/><path d="M152 132v7"/>' +
    '<path d="M200 132v7"/><path d="M248 132v7"/></g>' +
    '<g fill="none" stroke="#5A80AC" stroke-width="1.5" stroke-dasharray="2.4 3.8">' +
    '<circle cx="104" cy="123" r="5.4"/><circle cx="152" cy="123" r="5.4"/><circle cx="200" cy="123" r="5.4"/></g>' +
    '</svg>';

  function bar(k, n, max) {
    const pct = max ? Math.round(100 * n / max) : 0;
    return '<div class="barrow"><span class="k">' + esc(k) + '</span>' +
           '<span class="track"><span class="fill" style="width:' + Math.max(n ? 6 : 0, pct) + '%"></span></span>' +
           '<span class="n">' + n + '</span></div>';
  }
  function esc(t) { return String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function renderAlmanac() {
    const a = Store.almanac();
    const head = Store.headline();
    $('#almHead').textContent = a.n
      ? (head || 'Storms you have saved, and what they have had in common so far.')
      : 'Nothing saved yet. When you log a storm, its shape turns up here.';
    const el = $('#almBody');
    if (!a.n) {
      el.innerHTML = '<div class="panel">' + EMPTY_ART +
        '<p class="empty">This screen fills itself in over months, not days. ' +
        'It counts storms, not streaks, and there is no number here you can fail.</p></div>';
      stagger(el);
      return;
    }
    let h = '';
    h += '<div class="panel"><div class="stat"><b>' + a.n + '</b><span>' +
         (a.n === 1 ? 'storm saved' : 'storms saved') + '</span></div>';
    if (a.waveAvg) h += '<p class="help">Average size, in your own marking: ' + a.waveAvg.toFixed(1) + ' of 5.</p>';
    h += '</div>';

    const bmax = Math.max.apply(null, a.bands.map(b => b.count));
    h += '<div class="panel"><h2 class="h2">' + icon('clock') + 'When they arrive</h2>' +
         a.bands.map(b => bar(b.label, b.count, bmax)).join('') + '</div>';

    if (a.chips.length) {
      const cmax = a.chips[0].count;
      h += '<div class="panel"><h2 class="h2">' + icon('place') + 'Where you were</h2>' +
           a.chips.map(c => bar(c.label, c.count, cmax)).join('') + '</div>';
    }

    if (a.trend.length >= 2) {
      const tmax = Math.max.apply(null, a.trend);
      const cut = Math.max(1, a.trend.length - Math.ceil(a.trend.length / 2));
      h += '<div class="panel"><h2 class="h2">' + icon('almanac') + 'How long you ride them out</h2><div class="spark">' +
           a.trend.map((d, i) => '<i class="' + (i >= cut ? 'recent' : '') + '" style="height:' +
             Math.max(4, Math.round(100 * d / tmax)) + '%"></i>').join('') + '</div>';
      if (a.avgFirst && a.avgRecent) {
        const down = a.avgRecent < a.avgFirst;
        h += '<p class="trendline">Your earlier storms averaged <b>' + Store.mmss(a.avgFirst) +
             '</b>. Your recent ones average <b>' + Store.mmss(a.avgRecent) + '</b>. ' +
             (down ? 'They are getting shorter.' : 'No shorter yet, and that is allowed.') + '</p>';
      } else {
        h += '<p class="help">A few more, and this will start comparing your earlier storms with your recent ones.</p>';
      }
      h += '</div>';
    }

    const p = Store.pulseStats();
    if (p) {
      h += '<div class="panel"><h2 class="h2">' + icon('pulse') + 'Receipts</h2>' +
           '<p class="help">Sway promises the rhythm arrives fast. Here is what it actually did on this phone, ' +
           'measured from the app screen opening to the first pulse.</p>' +
           bar('Typical', p.median, p.worst) + bar('Slowest', p.worst, p.worst) +
           '<p class="help">Milliseconds, over ' + p.n + (p.n === 1 ? ' session.' : ' sessions.') + '</p></div>';
    }

    const recent = Store.logged().slice(-8).reverse();
    h += '<div class="panel"><h2 class="h2">' + icon('card') + 'Recent</h2>' + recent.map(s =>
      '<div class="logrow"><div><div class="d">' + esc(Store.dayLabel(s.at)) + ', ' + Store.clock(s.at) + '</div>' +
      '<div class="m">' + (s.durS ? esc(Store.mmss(s.durS)) : 'not timed') +
      (s.chips.length ? ' &middot; ' + esc(s.chips.map(Store.chipLabel).join(', ')) : '') +
      (s.tools.length ? ' &middot; ' + esc(s.tools.map(t => Store.TOOLS[t] || t).join(', ')) : '') + '</div></div>' +
      '<div class="w">' + (s.wave ? 'wave ' + s.wave : '') + '</div></div>').join('') +
      '<p class="help">Export or erase all of this from the Shelter screen.</p></div>';

    el.innerHTML = h;
    stagger(el);
  }

  /* ---------- learn ---------- */
  function renderLearn() {
    const list = $('#cardList');
    list.innerHTML = '';
    Content.CARDS.forEach(c => {
      const b = document.createElement('button');
      const read = Store.learnSeen(c.id);
      b.className = 'cardbtn' + (read ? ' read' : '');
      b.innerHTML = '<span><b></b><i></i></span>' +
        '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><use href="#g-' + (read ? 'check' : 'chev') + '"/></svg>';
      b.querySelector('b').textContent = c.title;
      b.querySelector('i').textContent = c.body[0].slice(0, 74).replace(/\s+\S*$/, '') + '...';
      if (read) b.setAttribute('aria-label', c.title + ', read');
      b.addEventListener('click', () => openCard(c));
      list.appendChild(b);
    });
    stagger(list);
  }
  function openCard(c) {
    $('#readerTitle').textContent = c.title;
    const body = $('#readerBody');
    body.innerHTML = '';
    c.body.forEach(t => { const p = document.createElement('p'); p.textContent = t; body.appendChild(p); });
    Store.markLearn(c.id);
    $('#reader').hidden = false;
  }

  /* ---------- first run: a local guess at the region, from the device language ---------- */
  function guessRegion() {
    if (Store.settings().region) return;
    const l = (navigator.language || '').toLowerCase();
    const map = { 'en-gb': 'uk', 'en-ie': 'ie', 'en-in': 'in', 'hi': 'in', 'en-au': 'au', 'en-nz': 'nz',
                  'en-ca': 'ca', 'fr-ca': 'ca', 'de': 'de', 'fr': 'fr', 'es': 'es', 'nl': 'nl',
                  'pt-br': 'br', 'en-za': 'za', 'en-us': 'us' };
    const pick = map[l] || map[l.split('-')[0]] || (l.startsWith('en') ? 'us' : 'other');
    Store.setSetting('region', pick);
  }

  /* ---------- wiring ---------- */
  function wire() {
    $('#endBtn').addEventListener('click', () => { tap(0.3); rehearsing ? finishRehearsal() : endSession(); });
    $('#calmBtn').addEventListener('click', abandonSession);
    $('#shelfBtn').addEventListener('click', () => { tap(0.3); openShelf(); });
    $('#pocketVeil').addEventListener('click', () => { undim(); armDim(); });
    $('#s-session').addEventListener('pointerdown', () => { if (!$('#pocketVeil').hidden) return; armDim(); Engine.audioResume(); });

    $('#forkStorm').addEventListener('click', () => { tap(0.35); go('tools'); });
    $('#forkPass').addEventListener('click', () => { tap(0.35); openLog(); });
    $('#forkBack').addEventListener('click', () => startSession({ resume: true }));

    $$('[data-tool]').forEach(b => b.addEventListener('click', () => openTool(b.dataset.tool)));
    $('#toolsBack').addEventListener('click', () => startSession({ resume: true }));

    $('#s-step').addEventListener('click', nextStep);
    $('#tapDone').addEventListener('click', () => { stopTool(); go('fork'); });

    $('#logSave').addEventListener('click', saveLog);
    $('#logSkip').addEventListener('click', skipLog);
    $('#closeAgain').addEventListener('click', () => { stormId = null; startSession({}); });
    $('#closeDone').addEventListener('click', () => { stormId = null; setView('shelter'); });

    $('#shelfClose').addEventListener('click', () => { $('#shelf').hidden = true; });
    $('#shelf').addEventListener('click', e => { if (e.target === $('#shelf')) $('#shelf').hidden = true; });
    $('#shelfContact').addEventListener('click', () => dial(Store.settings().contact.phone));
    $('#shelfCard').addEventListener('click', openBystander);
    $('#bysClose').addEventListener('click', () => { $('#s-bystander').hidden = true; });
    $('#learnBystander').addEventListener('click', openBystander);
    $('#readerClose').addEventListener('click', () => { $('#reader').hidden = true; });
    $('#reader').addEventListener('click', e => { if (e.target === $('#reader')) $('#reader').hidden = true; });

    $$('.tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

    $('#rehearseBtn').addEventListener('click', () => startSession({ rehearse: true }));
    $('#cSave').addEventListener('click', () => {
      Store.setContact({ name: $('#cName').value.trim(), phone: $('#cPhone').value.trim() });
      renderShelter();
      toast('Saved on this device.');
    });
    $('#regionSel').addEventListener('change', e => { Store.setSetting('region', e.target.value); renderShelter(); });
    $('#strengthRange').addEventListener('change', e => { Store.setSetting('strength', e.target.value / 100); Engine.buzz(1, 120); });
    $('#testSwell').addEventListener('click', () => {
      const p = Engine.phasesAt(0);
      let d = 0;
      const steps = 22;
      for (let i = 0; i < steps; i++) {
        const v = 0.16 + 0.84 * (0.5 - 0.5 * Math.cos(Math.PI * i / (steps - 1)));
        setTimeout(() => Engine.buzz(v, 120), d); d += p.inh * 1000 / steps;
      }
      Store.setSetting('calibrated', true);
      toast('That is one inhale at this strength.');
    });
    $('#protoSel').addEventListener('change', e => Store.setSetting('protocol', e.target.value));
    $('#hapticsChk').addEventListener('change', e => { Store.setSetting('haptics', e.target.checked); renderShelter(); });
    $('#audioChk').addEventListener('change', e => {
      Store.setSetting('audio', e.target.checked);
      if (e.target.checked) Engine.audioResume(); else Engine.audioStop();
    });
    $('#dimChk').addEventListener('change', e => Store.setSetting('pocketDim', e.target.checked));

    $('#exportBtn').addEventListener('click', () => download('sway-storm-log.txt', 'text/plain', Store.exportText()));
    $('#eraseBtn').addEventListener('click', () => {
      const b = $('#eraseBtn');
      if (!eraseArmed) {
        eraseArmed = true;
        b.textContent = 'Tap again to erase it all';
        $('#ioNote').textContent = 'This removes every storm, your person and your settings from this phone. It cannot be undone.';
        setTimeout(() => { eraseArmed = false; b.textContent = 'Erase everything'; $('#ioNote').textContent = ''; }, 6000);
        return;
      }
      eraseArmed = false;
      Store.eraseAll();
      guessRegion();          // erasing must not silently drop you back to the no-local-line fallback
      stormId = null;
      b.textContent = 'Erase everything';
      $('#ioNote').textContent = 'Erased.';
      renderShelter();
    });
  }

  /* ---------- the shell's three hooks ---------- */
  function back() {
    if (!$('#s-bystander').hidden) { $('#s-bystander').hidden = true; return true; }
    if (!$('#reader').hidden) { $('#reader').hidden = true; return true; }
    if (!$('#shelf').hidden) { $('#shelf').hidden = true; return true; }
    if (!$('#pocketVeil').hidden) { undim(); armDim(); return true; }
    switch (screen) {
      case 'step': case 'tap': stopTool(); go('tools'); return true;
      case 'tools': go('fork'); return true;
      case 'log': go('fork'); return true;
      case 'fork': startSession({ resume: true }); return true;
      case 'closing': stormId = null; setView('shelter'); return true;
      case 'calm': if (view !== 'shelter') { setView('shelter'); return true; } return false;
      case 'session': if (rehearsing) { cancelRehearsal(); return true; } return false;
      default: return false;
    }
  }
  function onPause() {
    if (screen === 'session') { Engine.pause(); Water.halt(); }   // the animation frame is a timer too
    else Engine.tapStop();
  }
  function onResume() {
    if (screen === 'session' && Engine.isRunning()) { Engine.resume(); Water.play(); Engine.audioResume(); }
    else if (screen === 'tap') resumeTapping();
  }

  /* ---------- go ---------- */
  function init() {
    guessRegion();
    Water.mount($('#water'));
    wire();
    startSession({});
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onPause(); else onResume();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  return { back, onPause, onResume, startSession, setView, go, openTool, openLog, openShelf, openBystander };
})();

/* A top-level const is not a window property, and the shell reaches for window.App. */
window.App = App;
window.Store = Store;
window.Engine = Engine;
