/* Detour. Screens, the walk loop and the wiring between them. */
const App = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  let mode = 'main';            // intro | main | walk | finish | settings | entry
  let view = 'setout';          // setout | journal | deck
  let jseg = 'walks';
  let entryId = null;
  let deckFilter = 'all';
  let jFilterMood = 'all';

  /* ---------- little helpers ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.hidden = true;                       // restart the entry, do not stack two messages
    t.textContent = msg;
    /* The walk screen's footer is one button taller when you are walking by bearings alone, and a
       stylesheet cannot know that. Sit the message on top of the footer that is actually there,
       so it never lands on the primary button. */
    const foot = $('#walkFoot');
    t.style.bottom = (mode === 'walk' && !foot.hidden)
      ? (Math.round(foot.getBoundingClientRect().height) + 14) + 'px'
      : '';
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function hideToast() { clearTimeout(toastTimer); $('#toast').hidden = true; }
  /* A sheet covers the bottom of the screen, which is exactly where a toast sits, so anything
     already showing is cleared before the sheet slides up over it. */
  function openSheet(sel) { hideToast(); $(sel).hidden = false; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nat = () => (window.Native && window.Native.isNative && window.Native.isNative()) ? window.Native : null;

  function download(name, mime, text) {
    const N = nat();
    if (N && N.saveFile) {
      try {
        const b64 = btoa(unescape(encodeURIComponent(text)));
        const uri = N.saveFile(name, mime, b64);
        if (uri) { toast('Saved to Downloads as ' + name); return; }
      } catch (e) {}
    }
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
      toast('Saved as ' + name);
    } catch (e) { toast('Could not write the file.'); }
  }

  function shareText(subject, text) {
    const N = nat();
    if (N && N.shareText) { try { N.shareText(subject, text); return; } catch (e) {} }
    if (navigator.share) { navigator.share({ title: subject, text }).catch(() => {}); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => toast('Copied to the clipboard.'), () => toast('Could not share.'));
      return;
    }
    toast('Sharing is not available here.');
  }

  /* ---------- haptics ---------- */
  /* [on, off, on, ...] in milliseconds. These have to match the alphabet the trainer in settings
     teaches, word for word, or the trainer is teaching the wrong thing. */
  const PATTERNS = {
    first:    [70, 110, 70, 110, 220],        // two taps and a long one
    straight: [70],                           // one short pulse
    left:     [55, 120, 55],                  // two short pulses
    right:    [240],                          // one long pulse
    about:    [45, 70, 45, 70, 45, 70, 45, 70, 45],   // five quick pulses
    home:     [200, 110, 60, 110, 200],       // long, short, long
    prompt:   [28, 80, 28],                   // a soft double
    finish:   [190, 130, 60, 130, 190],
    tap:      [18]
  };
  function buzz(kind) {
    if (!Store.settings().haptics) return;
    const p = PATTERNS[kind];
    if (!p) return;
    const amp = Math.round(Math.min(255, Math.max(30, Store.settings().strength * 255)));
    const N = nat();
    if (N && N.vibratePattern) { try { N.vibratePattern(JSON.stringify(p), amp); return; } catch (e) {} }
    if (navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} }
  }
  function keepAwake(on) {
    const N = nat();
    if (N && N.keepAwake) { try { N.keepAwake(!!on); } catch (e) {} }
  }

  /* ---------- screens ---------- */
  const SCREENS = ['s-intro', 'v-setout', 'v-journal', 'v-deck', 's-settings', 's-walk', 's-finish', 's-entry'];
  function paint() {
    const showTabs = mode === 'main';
    for (const id of SCREENS) $('#' + id).hidden = true;
    if (mode === 'intro') $('#s-intro').hidden = false;
    else if (mode === 'main') $('#v-' + view).hidden = false;
    else if (mode === 'settings') $('#s-settings').hidden = false;
    else if (mode === 'walk') $('#s-walk').hidden = false;
    else if (mode === 'finish') $('#s-finish').hidden = false;
    else if (mode === 'entry') $('#s-entry').hidden = false;
    $('#tabs').hidden = !showTabs;
    document.body.classList.toggle('has-tabs', showTabs);
    $$('#tabs .tab').forEach(b => b.classList.toggle('is-on', b.dataset.view === view));
  }
  function go(m) { mode = m; paint(); }
  function setView(v) {
    view = v; mode = 'main';
    if (v === 'setout') renderSetOut();
    if (v === 'journal') renderJournal();
    if (v === 'deck') renderDeck();
    paint();
    const sc = $('#v-' + v + ' .scroller'); if (sc) sc.scrollTop = 0;
  }

  /* ================= SET OUT ================= */
  const MINS = [];
  for (let m = 20; m <= 180; m += 5) MINS.push(m);
  const TICK_W = 16;
  let rulerLock = false;
  let pendingMinutes = null;

  const MOOD_ART = {
    surprise: '<path d="M3.5 19c3.4-3.6 2.6-8.4 6.6-9.6 3.9-1.2 4.1 3.4 7.4 2.6"/><circle cx="20.4" cy="10.8" r="1.5"/>',
    quiet:    '<path d="M3.5 17.5C8 11.5 16 11.5 20.5 17.5"/><path d="M8 17.5c2.4-3.2 5.6-3.2 8 0"/>',
    lively:   '<path d="M4.5 19.5V12M9.5 19.5V5.5M14.5 19.5v-9M19.5 19.5V8.5"/>',
    grid:     '<path d="M4 20V8.5l7-3.5V20"/><path d="M11 12l9 3.5V20"/><path d="M3 20h18"/>',
    slow:     '<path d="M3 16.5h18"/><circle cx="16.5" cy="9" r="2.8"/>'
  };

  function buildRuler() {
    $('#rulerInner').innerHTML = MINS.map(m =>
      '<span class="tick' + (m % 15 === 0 ? ' maj' : '') + '"></span>').join('');
    /* A scroll fires dozens of times a second and Store.set writes synchronously, so the number
       is painted at once and written down when the thumb settles. */
    let rulerWrite = null;
    $('#ruler').addEventListener('scroll', () => {
      if (rulerLock) return;
      const i = Math.max(0, Math.min(MINS.length - 1, Math.round($('#ruler').scrollLeft / TICK_W)));
      if (MINS[i] === pendingMinutes) return;
      pendingMinutes = MINS[i];
      paintDial(MINS[i]);
      clearTimeout(rulerWrite);
      rulerWrite = setTimeout(() => { Store.set('minutes', pendingMinutes); paintDial(); }, 140);
    }, { passive: true });
  }
  function scrollRulerTo(m) {
    const i = Math.max(0, MINS.indexOf(Store.clampMinutes(m)));
    rulerLock = true;
    $('#ruler').scrollLeft = i * TICK_W;
    setTimeout(() => { rulerLock = false; }, 60);
  }
  function paintDial(preview) {
    const m = preview === undefined ? Store.settings().minutes : preview;
    $('#dialValue').textContent = m < 60 ? String(m) : Store.fmtMins(m * 60);
    $('#dialValue').nextElementSibling.textContent = m < 60 ? 'minutes' : 'on foot';
    $('#ruler').setAttribute('aria-valuenow', String(m));
    const pace = 1.32;
    const km = m * 60 * pace;
    $('#dialNote').textContent = 'About ' + Store.fmtDist(km) + ' at an unhurried pace, if you keep moving.';
  }
  function setMinutes(m) { Store.set('minutes', m); pendingMinutes = Store.settings().minutes; paintDial(); scrollRulerTo(m); }

  function renderSetOut() {
    const s = Store.settings();
    paintDial();
    $('#moodRow').innerHTML = Store.Moods.list.map(x =>
      '<button class="mood' + (x.id === s.mood ? ' is-on' : '') + '" data-mood="' + x.id + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + MOOD_ART[x.id] + '</svg><span>' + esc(x.label) + '</span></button>'
    ).join('');
    $('#moodNote').textContent = Store.Moods.note(s.mood);
    $('#loopChk').checked = s.loop;
    $('#loopNote').textContent = s.loop
      ? 'The last bearings will close the loop toward where you started.'
      : 'No loop. Detour will keep pointing outward until you say when.';

    const live = Store.live();
    $('#resumeCard').hidden = !live;
    if (live) {
      const secs = Math.max(0, Math.round((Date.now() - live.at) / 1000));
      $('#resumeTitle').textContent = Store.Moods.label(live.mood) + ' walk, still running';
      $('#resumeSub').textContent = Store.fmtMins(secs) + ' in, ' + Store.fmtDist(live.distM) + ' walked.';
    }

    const walks = Store.walks();
    $('#setEyebrow').textContent = walks.length ? 'Set out again' : 'Set out';
    const t = pickTeaser();
    $('#teaser').hidden = !t;
    if (t) $('#teaserText').textContent = t.t;

    if (walks.length) {
      const totalM = walks.reduce((a, w) => a + w.distM, 0);
      $('#tally').hidden = false;
      $('#tally').innerHTML =
        row(walks.length, walks.length === 1 ? 'walk kept' : 'walks kept') +
        row(Store.fmtDist(totalM), 'on foot') +
        row(Store.cellCount(), 'squares of ground') +
        row(Store.questsDone(), 'quests done');
    } else $('#tally').hidden = true;

    requestAnimationFrame(() => scrollRulerTo(Store.settings().minutes));
    disarmWander();
    $('#setFine').textContent = Store.live()
      ? 'A walk is still running. Starting a new one discards it.'
      : 'Detour will ask for your location when you press this, and only then.';
    function row(v, l) { return '<div><b>' + esc(String(v)) + '</b><i>' + esc(l) + '</i></div>'; }
  }

  /* A walk still running is somebody's afternoon, and startWalk replaces it outright. So the
     button arms first, the way erasing and deleting already do here. */
  let wanderArmed = false, wanderTimer = null;
  function disarmWander() {
    wanderArmed = false;
    clearTimeout(wanderTimer);
    $('#wanderBtn').textContent = 'Wander';
  }
  function wander() {
    if (Store.live() && !wanderArmed) {
      wanderArmed = true;
      $('#wanderBtn').textContent = 'Tap again to start a new walk';
      $('#setFine').textContent = 'That will discard the walk still running. Pick it up above to keep it.';
      clearTimeout(wanderTimer);
      wanderTimer = setTimeout(() => renderSetOut(), 6000);
      return;
    }
    disarmWander();
    startWalk();
  }

  function pickTeaser() {
    const day = Math.floor(Date.now() / 86400000);
    const pool = Deck.ALL;
    if (!pool.length) return null;
    let h = (day * 2654435761) >>> 0;
    h = ((h ^ (h >>> 15)) * 2246822507) >>> 0;
    return pool[h % pool.length];
  }

  /* ================= THE WALK ================= */
  let W = null;                 // the live walk record
  let curLeg = null;            // { at, bearing, distM, from, turn }
  let blocked = [];             // bearings the walker has refused, this walk
  let promptTimes = [];         // seconds from the start
  let promptOpen = false;
  let tickTimer = null, roseRaf = null, roseKey = '';
  let paperMode = false;
  let paperPos = null;          // dead reckoned position in paper mode
  let lastLegAt = 0;

  const PAPER_ORIGIN = [51.5074, -0.1278];   // a virtual origin: paper walks never touch real ground

  function startWalk() {
    const s = Store.settings();
    W = Store.startWalk({ minutes: s.minutes, mood: s.mood, loop: s.loop });
    curLeg = null; blocked = []; promptOpen = false; paperMode = false; paperPos = null;
    planPrompts();
    openWalkScreen();
    beginLocating();
  }

  function resumeWalk() {
    W = Store.live();
    if (!W) { setView('setout'); return; }
    paperMode = !!W.paper;
    blocked = [];
    promptOpen = false;
    // A card that was on screen when the app was killed is neither done nor refused; it is over.
    const open = (W.prompts || []).filter(x => x.state === 'open');
    if (open.length) { open.forEach(x => { x.state = 'skipped'; }); Store.saveLive(); }
    curLeg = W.legs.length ? W.legs[W.legs.length - 1] : null;
    // Picking a walk back up counts as a fresh bearing: no card lands on the screen you just opened.
    lastLegAt = Date.now();
    planPrompts();
    openWalkScreen();
    if (paperMode) {
      paperPos = W.trail.length ? [W.trail[W.trail.length - 1][0], W.trail[W.trail.length - 1][1]] : PAPER_ORIGIN;
      enterPaper(true);
    } else beginLocating();
  }

  function planPrompts() {
    const base = { few: 2, some: 4, many: 6 }[Store.settings().rate] || 4;
    const scale = Math.min(1.9, Math.max(0.55, W.minutes / 60));
    const n = Math.max(1, Math.min(9, Math.round(base * scale)));
    const total = W.minutes * 60;
    const done = (W.prompts || []).length;
    promptTimes = [];
    for (let i = 1; i <= n; i++) {
      const jitter = (Math.sin((W.seed + i * 97) % 1000) * 0.5) * total * 0.09;
      promptTimes.push(Math.max(240, total * (i / (n + 1)) + jitter));
    }
    promptTimes = promptTimes.slice(done);
  }

  function openWalkScreen() {
    go('walk');
    $('#gate').hidden = false;
    $('#roseWrap').hidden = true;
    $('#legLine').hidden = true;
    $('#traceWrap').hidden = true;
    $('#walkFoot').hidden = true;
    $('#promptSheet').hidden = true;
    $('#walkMenu').hidden = true;
    $('#paperNext').hidden = !paperMode;
    $('#menuMaps').hidden = !nat();
    keepAwake(Store.settings().awake);
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 1000);
    tick();
    startRose();
  }

  let stallTimer = null;
  function beginLocating() {
    $('#gateMsg').textContent = 'Finding you.';
    $('#gateSub').textContent = 'Standing still and outdoors helps. This can take half a minute.';
    $('#gateRetry').hidden = true;
    $('#gate').classList.remove('bad');
    showPaperOption(false);
    clearTimeout(stallTimer);
    // Indoors, on a phone given only approximate location, or with a sulking receiver, the fix
    // simply never arrives. After a fair wait, offer the way that does not need one.
    stallTimer = setTimeout(() => {
      if (mode !== 'walk' || curLeg || paperMode) return;
      $('#gateMsg').textContent = 'Still looking.';
      $('#gateSub').textContent = 'Thick walls, a covered street or approximate location will all do this. ' +
        'Stepping outside usually fixes it. If it does not, you can walk by bearings alone and Detour ' +
        'will draw the shape you were given rather than the one you took.';
      $('#gateRetry').hidden = false;
      $('#gateRetry').textContent = 'Keep looking';
      showPaperOption(true);
    }, 35000);
    Geo.start(onFix, onGeoState);
  }

  function onGeoState(state, detail) {
    if (mode !== 'walk' || paperMode) return;
    const gate = $('#gate');
    if (state === 'denied') {
      gate.classList.add('bad');
      $('#gateMsg').textContent = 'Detour cannot see where you are.';
      $('#gateSub').innerHTML = 'Location is switched off for this app. Detour needs it to know that you walked, ' +
        'and it has no internet permission, so nothing it reads can go anywhere.' +
        '<br><br>You can still walk by bearings alone: Detour will hand you directions and distances and ' +
        'you tell it when you have walked each one. It will draw the shape you were given rather than the one you took.';
      $('#gateRetry').hidden = false;
      $('#gateRetry').textContent = 'Ask again';
      showPaperOption(true);
    } else if (state === 'unavailable') {
      gate.classList.add('bad');
      $('#gateMsg').textContent = 'No location on this device.';
      $('#gateSub').textContent = 'Nothing here can read a position. You can still walk by bearings alone.';
      $('#gateRetry').hidden = true;
      showPaperOption(true);
    } else if (state === 'poor' && !curLeg) {
      $('#gateSub').textContent = 'A rough fix, give or take ' + (detail || '?') + ' metres. Waiting for a better one.';
    }
  }

  function showPaperOption(on) {
    let b = document.getElementById('paperBtn');
    if (!on) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement('button');
    b.id = 'paperBtn'; b.className = 'btn primary'; b.textContent = 'Walk by bearings only';
    b.addEventListener('click', () => enterPaper(false));
    $('#gateBtns').appendChild(b);
  }

  /* ---- paper mode: no position, dead reckoned from the bearings you were handed ---- */
  function enterPaper(resuming) {
    paperMode = true;
    clearTimeout(stallTimer);
    W.paper = true;
    Geo.stop();
    if (!paperPos) paperPos = PAPER_ORIGIN;
    if (!W.start) { W.start = PAPER_ORIGIN.slice(); W.trail.push([PAPER_ORIGIN[0], PAPER_ORIGIN[1], 0]); }
    $('#gate').hidden = true;
    $('#roseWrap').hidden = false;
    $('#legLine').hidden = false;
    $('#traceWrap').hidden = false;
    $('#walkFoot').hidden = false;
    document.body.classList.add('paper-mode');
    $('#paperNext').hidden = false;
    if (!curLeg && !resuming) issueLeg();
    else drawRose();
    Store.saveLive();
    renderWalk();
  }

  function paperAdvance() {
    if (!curLeg) { issueLeg(); return; }
    const to = Store.project(paperPos, curLeg.bearing, curLeg.distM);
    paperPos = to;
    W.distM += curLeg.distM;
    W.trail.push([to[0], to[1], Math.round((Date.now() - W.at) / 1000)]);
    Store.saveLive();
    issueLeg();
  }

  /* ---- real fixes ---- */
  function revealWalk() {
    if ($('#roseWrap').hidden === false) return;
    $('#gate').hidden = true;
    $('#roseWrap').hidden = false;
    $('#legLine').hidden = false;
    $('#traceWrap').hidden = false;
    $('#walkFoot').hidden = false;
    $('#gateRetry').hidden = true;
    clearTimeout(stallTimer);
    showPaperOption(false);
  }

  function onFix(fix, metres) {
    if (!W || paperMode) return;
    const now = Math.round((Date.now() - W.at) / 1000);
    if (!W.start) {
      // The first fix of the walk is the anchor everything else is measured from.
      W.start = [fix.lat, fix.lon];
      W.trail.push([fix.lat, fix.lon, now]);
      Store.touchCell(fix.lat, fix.lon, Date.now());
    } else if (metres > 0) {
      W.distM += metres;
      W.trail.push([fix.lat, fix.lon, now]);
      if (Store.touchCell(fix.lat, fix.lon, Date.now())) W.newCells++;
      if (W.trail.length > 900) W.trail = Store.simplify(W.trail, 4);
      Store.saveLive();
    }
    // Reveal on any usable fix, not only the first one, so picking a walk back up after the
    // app was closed does not leave you staring at the searching screen forever.
    revealWalk();
    if (!curLeg) issueLeg();
    else if (Composer.legProgress(curLeg, [fix.lat, fix.lon]).remaining <= 25) issueLeg();
    else renderWalk();
  }

  function here() {
    if (paperMode) return paperPos;
    const f = Geo.current();
    return f ? [f.lat, f.lon] : (W.start || null);
  }

  function elapsedS() { return Math.max(0, Math.round((Date.now() - W.at) / 1000) - (W.pausedS || 0)); }
  function remainingS() { return W.minutes * 60 - elapsedS(); }

  function issueLeg() {
    const pos = here();
    if (!pos) return;
    const prev = curLeg ? curLeg.bearing : null;
    const leg = Composer.nextLeg({
      pos, start: W.start, heading: prev, remainingS: Math.max(30, remainingS()),
      pace: paperMode ? 1.32 : Geo.pace(), mood: W.mood, loop: W.loop,
      trail: W.trail, blocked, seed: W.seed, legIndex: W.legs.length
    });
    curLeg = { at: Date.now(), bearing: leg.bearing, distM: leg.distM, from: pos, turn: leg.turn, closing: !!leg.closing };
    W.legs.push(curLeg);
    lastLegAt = Date.now();
    if (blocked.length && W.legs.length % 2 === 0) blocked = [];
    buzz(W.legs.length === 1 ? 'first' : (leg.closing ? 'home' : leg.turn));
    Store.saveLive();
    renderWalk();
  }

  function blockThisWay() {
    if (!curLeg) return;
    const pos = here();
    if (!pos) return;                       // nowhere to compose from: keep the leg you have
    blocked.push(curLeg.bearing);
    if (blocked.length > 5) blocked.shift();
    W.legs.pop();
    const under = W.legs.length ? W.legs[W.legs.length - 1] : null;
    const prevB = under ? under.bearing : null;
    curLeg = null;
    const leg = Composer.nextLeg({
      pos, start: W.start, heading: prevB, remainingS: Math.max(30, remainingS()),
      pace: paperMode ? 1.32 : Geo.pace(), mood: W.mood, loop: W.loop,
      trail: W.trail, blocked, seed: W.seed + 7919, legIndex: W.legs.length
    });
    curLeg = { at: Date.now(), bearing: leg.bearing, distM: leg.distM, from: pos, turn: leg.turn, closing: !!leg.closing };
    W.legs.push(curLeg);
    buzz(leg.turn);
    Store.saveLive();
    renderWalk();
    toast('Another way, then.');
  }

  function takeMeBack() {
    const pos = here();
    if (!pos || !W.start) return;
    const leg = Composer.homeLeg(pos, W.start);
    if (!leg) return;
    // The straight way back is the same instruction however many times it is asked for.
    if (curLeg && curLeg.direct && W.legs[W.legs.length - 1] === curLeg) W.legs.pop();
    curLeg = { at: Date.now(), bearing: leg.bearing, distM: leg.distM, from: pos, turn: 'home', closing: true, direct: true };
    W.legs.push(curLeg);
    buzz('home');
    Store.saveLive();
    renderWalk();
    toast('Straight line to where you started. Streets permitting.');
  }

  const TURN_WORD = {
    first: 'Set off',
    straight: 'Keep going',
    left: 'Bear left',
    right: 'Bear right',
    about: 'Turn about',
    home: 'Toward where you started'
  };

  function renderWalk() {
    if (mode !== 'walk' || !W) return;
    if (!curLeg) {   // nothing has begun, so a clock and a distance would be theatre
      $('#walkLeft').textContent = '';
      $('#walkDist').textContent = '';
      return;
    }
    const left = remainingS();
    $('#walkLeft').textContent = left > 90 ? Store.fmtMins(left) + ' left'
      : left > 0 ? 'Under a minute left'
      : 'Time is up. Finish when you like.';
    $('#walkDist').textContent = Store.fmtDist(W.distM);

    {
      $('#bearingWord').textContent = Store.compassWord(curLeg.bearing);
      const pos = here();
      let rem = curLeg.distM;
      if (pos && !paperMode) rem = Math.max(0, Math.round(Composer.legProgress(curLeg, pos).remaining));
      $('#legDist').textContent = Store.fmtShort(rem);
      const src = Geo.facingSource();
      let line = TURN_WORD[curLeg.turn] || 'Onward';
      if (curLeg.direct) line = 'The straight way back';
      else if (curLeg.closing) line = 'The long way round, closing toward the start';
      const hint = paperMode ? 'Walk it, then tell Detour.'
        : src === 'compass' ? 'The rose is turning with you.'
        : src === 'course' ? 'Held to the way you are moving.'
        : 'North is up. Turn yourself until it makes sense.';
      $('#legLine').innerHTML = '<b>' + esc(line) + '</b><span>' + esc(hint) + '</span>';
    }
    drawTrace();
  }

  /* The words on the walk screen change on every fix, the rose used to change once a second, and a
     compass that lags its own label is worse than no compass. This redraws whenever the bearing or
     the way you are facing has actually moved, and does nothing at all when neither has. */
  function roseFrame() {
    roseRaf = requestAnimationFrame(roseFrame);
    if (mode !== 'walk' || $('#roseWrap').hidden) return;
    const t = curLeg ? Math.round(curLeg.bearing * 2) / 2 : null;
    const f = paperMode ? null : Geo.facing();
    const key = t + '|' + (f === null ? 'x' : Math.round(f * 2) / 2);
    if (key === roseKey) return;
    roseKey = key;
    drawRose();
  }
  function startRose() { if (roseRaf === null) roseFrame(); }
  function stopRose() {
    if (roseRaf !== null) cancelAnimationFrame(roseRaf);
    roseRaf = null; roseKey = '';
  }

  function drawRose() {
    if (mode !== 'walk') return;
    const c = $('#rose');
    const box = c.parentElement.getBoundingClientRect();
    const size = Math.max(120, Math.min(box.width, box.height));
    let target = curLeg ? curLeg.bearing : null;
    const facing = paperMode ? null : Geo.facing();
    Sketch.rose(c, size, size, { target, facing });
  }

  function drawTrace() {
    const c = $('#trace');
    if (!c || $('#traceWrap').hidden) return;
    const box = c.parentElement.getBoundingClientRect();
    if (!box.width) return;
    Sketch.liveTrace(c, W.trail.map(p => [p[0], p[1]]), box.width, box.height, { units: Store.settings().units });
  }

  function tick() {
    if (mode !== 'walk' || !W) return;
    renderWalk();
    drawRose();
    const el = elapsedS();
    if (!promptOpen && promptTimes.length && el >= promptTimes[0] && Date.now() - lastLegAt > 12000) {
      promptTimes.shift();
      firePrompt();
    }
  }

  /* ---- the deck arriving ---- */
  let curQuest = null;
  function firePrompt() {
    // closePrompt answers the last card pushed, so only ever have one open.
    if (promptOpen) return;
    const frac = Math.min(1, elapsedS() / (W.minutes * 60));
    const pos = here();
    const near = pos && W.start ? Store.dist(pos, W.start) < 350 : true;
    const ctx = Deck.context(frac, near);
    const seen = (W.prompts || []).map(p => p.id);
    const q = Deck.draw(W.mood, ctx, seen);
    if (!q) return;
    curQuest = q;
    Store.markSeen(q.id);
    W.prompts.push({ id: q.id, at: Date.now(), state: 'open', note: '', pt: pos ? [pos[0], pos[1]] : null });
    Store.saveLive();
    $('#questKind').textContent = ['A small quest', 'Something to notice', 'One for the road', 'A card'][W.prompts.length % 4];
    $('#questText').textContent = q.t;
    $('#noteBox').hidden = true;
    $('#noteText').value = '';
    openSheet('#promptSheet');
    promptOpen = true;
    buzz('prompt');
  }
  function closePrompt(state, note) {
    if (!promptOpen) return;
    const rec = W.prompts[W.prompts.length - 1];
    if (rec) {
      rec.state = state;
      if (note) rec.note = note.slice(0, 240);
      const pos = here();
      if (pos) rec.pt = [pos[0], pos[1]];
    }
    if (state === 'done' && curQuest) Store.markDone(curQuest.id);
    $('#promptSheet').hidden = true;
    promptOpen = false;
    Store.saveLive();
  }

  /* ---- ending ---- */
  const NOTICED = [
    'Today the city was', 'The one thing I will keep', 'It smelled of', 'Nobody else saw',
    'I would come back for', 'The best five minutes were'
  ];
  function finishWalk() {
    if (!W) return;
    clearInterval(tickTimer);
    clearTimeout(stallTimer);
    stopRose();
    Geo.stop();
    keepAwake(false);
    buzz('finish');
    document.body.classList.remove('paper-mode');
    const durS = Math.max(1, Math.round((Date.now() - W.at) / 1000) - (W.pausedS || 0));
    const done = W.prompts.filter(p => p.state === 'done');
    $('#finishEyebrow').textContent = W.paper ? 'The bearings you were given' : 'The walk you took';
    $('#finishStats').textContent = [
      Store.fmtMins(durS),
      Store.fmtDist(W.distM),
      W.legs.length + (W.legs.length === 1 ? ' bearing' : ' bearings'),
      done.length + (done.length === 1 ? ' quest' : ' quests'),
      W.paper ? 'drawn from the bearings' : W.newCells + ' new squares'
    ].join('  ·  ');
    $('#finishQuests').innerHTML = done.map(p => {
      const q = Deck.byId(p.id);
      return '<div class="qdone"><p class="quest">' + esc(q ? q.t : '') + '</p>' +
             (p.note ? '<p class="qnote">' + esc(p.note) + '</p>' : '') + '</div>';
    }).join('');
    const ph = NOTICED[Math.floor(Math.random() * NOTICED.length)];
    $('#noticedLabel').textContent = ph;
    $('#noticedInput').placeholder = ph + '...';
    $('#noticedInput').value = '';
    go('finish');
    animateSketch();
  }

  /** The sketch card takes the shape of the walk, so a long flat wander is not marooned in a
      tall empty box. Clamped, because a walk up one street should not become a letterbox. */
  function shapeSketchBox(canvas, trail) {
    const box = canvas.parentElement;
    if (!trail || trail.length < 2) { box.style.aspectRatio = '1 / 1'; return; }
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const p of trail) {
      if (p[0] < minLat) minLat = p[0];
      if (p[0] > maxLat) maxLat = p[0];
      if (p[1] < minLon) minLon = p[1];
      if (p[1] > maxLon) maxLon = p[1];
    }
    const kx = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    const w = Math.max(1e-7, (maxLon - minLon) * kx), h = Math.max(1e-7, maxLat - minLat);
    box.style.aspectRatio = Math.max(0.78, Math.min(1.45, w / h)).toFixed(3) + ' / 1';
  }

  let sketchRaf = null;
  function animateSketch() {
    cancelAnimationFrame(sketchRaf);
    const c = $('#finishSketch');
    const trail = W.trail.map(p => [p[0], p[1]]);
    shapeSketchBox(c, trail);
    const box = c.parentElement.getBoundingClientRect();
    const w = box.width, h = box.height;
    const marks = W.prompts.filter(p => p.state === 'done' && p.pt).map(p => p.pt);
    if (Sketch.reduced()) {
      // Stop the travel, keep the drawing: the whole trail, at once.
      Sketch.trailSketch(c, trail, w, h, { progress: 1, marks, units: Store.settings().units });
      return;
    }
    const t0 = performance.now();
    const dur = 1700;
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 2.2);
      Sketch.trailSketch(c, trail, w, h, { progress: eased, marks, units: Store.settings().units });
      if (k < 1) sketchRaf = requestAnimationFrame(step);
    })(t0);
  }

  function keepWalk() {
    const noticed = $('#noticedInput').value.trim();
    const w = Store.finishWalk(noticed);
    W = null; curLeg = null;
    if (w) toast('Kept.');
    setView('journal');
  }

  function binWalk() {
    clearInterval(tickTimer);
    clearTimeout(stallTimer);
    stopRose();
    Geo.stop();
    keepAwake(false);
    document.body.classList.remove('paper-mode');
    Store.discardLive();
    W = null; curLeg = null;
    toast('Gone. No trace of it.');
    setView('setout');
  }

  function shareWalk(w) {
    const durS = Math.max(1, Math.round(((w.endedAt || Date.now()) - w.at) / 1000));
    const done = (w.prompts || []).filter(p => p.state === 'done');
    const L = [];
    L.push('A ' + Store.fmtMins(durS) + ' ' + Store.Moods.label(w.mood).toLowerCase() + ' walk.');
    L.push(Store.fmtDist(w.distM) + ', ' + w.legs.length + ' bearings' +
      (w.paper ? '.' : ', ' + w.newCells + ' squares of ground I had never stood in.'));
    if (done.length) {
      const q = Deck.byId(done[0].id);
      if (q) L.push('Quest: ' + q.t);
      if (done[0].note) L.push('"' + done[0].note + '"');
    }
    if (w.noticed) L.push(w.noticed);
    L.push('');
    L.push('Walked with Detour.');
    shareText('A walk', L.join('\n'));
  }

  /* ================= JOURNAL ================= */
  function renderJournal() {
    const all = Store.walks();
    $('#journalTitle').textContent = all.length ? 'Your atlas of noticing' : 'Nothing walked yet';
    $$('#journalSegs .seg').forEach(b => b.classList.toggle('is-on', b.dataset.jseg === jseg));
    $('#jWalks').hidden = jseg !== 'walks';
    $('#jGround').hidden = jseg !== 'ground';
    if (jseg === 'walks') renderShelf(all); else renderCoverage(all);
  }

  function renderShelf(all) {
    const moods = ['all'].concat(Store.Moods.list.map(m => m.id));
    $('#jFilter').innerHTML = moods.map(m =>
      '<button class="chip' + (m === jFilterMood ? ' is-on' : '') + '" data-jmood="' + m + '">' +
      esc(m === 'all' ? 'Everything' : Store.Moods.label(m)) + '</button>').join('');
    const list = jFilterMood === 'all' ? all : all.filter(w => w.mood === jFilterMood);
    $('#walkEmpty').hidden = list.length > 0;
    $('#walkEmptyText').textContent = all.length
      ? 'No walks kept under ' + Store.Moods.label(jFilterMood) + ' yet.'
      : 'No walks yet. The first one is the hard one, and it is forty five minutes long.';
    $('#walkShelf').innerHTML = list.map((w, i) => {
      const durS = Math.max(1, Math.round(((w.endedAt || w.at) - w.at) / 1000));
      return '<button class="tile" data-walk="' + w.id + '" style="--i:' + Math.min(i, 9) + '">' +
        '<canvas class="tilecanvas" data-trail="' + w.id + '"></canvas>' +
        '<p class="tiletop">' + esc(Store.dayLabel(w.at)) + '<i>' + esc(Store.Moods.label(w.mood)) + '</i></p>' +
        '<p class="tilesub">' + esc(Store.fmtMins(durS) + ', ' + Store.fmtDist(w.distM)) + '</p>' +
        (w.noticed ? '<p class="tilenote">' + esc(w.noticed) + '</p>' : '') +
        '</button>';
    }).join('');
    requestAnimationFrame(() => {
      for (const c of $$('#walkShelf .tilecanvas')) {
        const w = Store.walk(c.dataset.trail);
        if (!w) continue;
        const b = c.getBoundingClientRect();
        if (!b.width) continue;
        Sketch.trailSketch(c, w.trail.map(p => [p[0], p[1]]), b.width, b.height,
          { units: Store.settings().units, plain: false });
      }
    });
  }

  function renderCoverage(all) {
    const real = all.filter(w => !w.paper);
    const c = $('#coverCanvas');
    requestAnimationFrame(() => {
      const b = c.parentElement.getBoundingClientRect();
      if (!b.width) return;
      Sketch.coverage(c, real.map(w => w.trail.map(p => [p[0], p[1]])), b.width, b.height,
        { units: Store.settings().units, cells: Store.cellList(), cellM: Store.CELL_M });
    });
    const cells = Store.cellCount();
    const areaKm = (cells * Store.CELL_M * Store.CELL_M) / 1e6;
    $('#coverLede').textContent = cells
      ? 'Every square is about forty metres across. You have stood in ' + cells +
        ' of them, which is roughly ' + areaKm.toFixed(2) + ' square kilometres of ground.'
      : 'Ground fills in as you walk it. Nothing here is a target and nothing is ever missing.';
    const totalM = real.reduce((a, w) => a + w.distM, 0);
    const legs = real.reduce((a, w) => a + w.legs.length, 0);
    $('#coverStats').innerHTML =
      st(real.length, 'walks with a trail') + st(Store.fmtDist(totalM), 'walked in all') +
      st(legs, 'bearings taken') + st(Store.questsDone(), 'quests completed');
    function st(v, l) { return '<div><b>' + esc(String(v)) + '</b><i>' + esc(l) + '</i></div>'; }
  }

  function openEntry(id) {
    const w = Store.walk(id);
    if (!w) return;
    entryId = id;
    const durS = Math.max(1, Math.round(((w.endedAt || w.at) - w.at) / 1000));
    $('#entryDate').textContent = Store.longDate(w.at) + ', ' + Store.clock(w.at);
    $('#entryTitle').textContent = Store.Moods.label(w.mood) + (w.paper ? ', by bearings' : '');
    $('#entryStats').textContent = [
      Store.fmtMins(durS), Store.fmtDist(w.distM),
      w.legs.length + ' bearings',
      w.paper ? 'drawn from the bearings' : w.newCells + ' new squares'
    ].join('  ·  ');
    $('#entryNoticed').textContent = w.noticed || '';
    $('#entryNoticed').hidden = !w.noticed;
    const done = (w.prompts || []).filter(p => p.state === 'done');
    $('#entryQuests').innerHTML = done.length ? done.map(p => {
      const q = Deck.byId(p.id);
      return '<div class="qdone"><p class="quest">' + esc(q ? q.t : '') + '</p>' +
             (p.note ? '<p class="qnote">' + esc(p.note) + '</p>' : '') + '</div>';
    }).join('') : '<p class="help">No quests completed on this one.</p>';
    go('entry');
    requestAnimationFrame(() => {
      const c = $('#entrySketch');
      shapeSketchBox(c, w.trail.map(p => [p[0], p[1]]));
      const b = c.parentElement.getBoundingClientRect();
      Sketch.trailSketch(c, w.trail.map(p => [p[0], p[1]]), b.width, b.height, {
        marks: done.filter(p => p.pt).map(p => p.pt), units: Store.settings().units
      });
    });
  }

  /* ================= DECK ================= */
  function renderDeck() {
    const filters = [['all', 'All'], ['loved', 'Starred'], ['done', 'Done'], ['new', 'Not yet met']]
      .concat(Store.Moods.list.map(m => [m.id, m.label]));
    $('#deckFilter').innerHTML = filters.map(([id, label]) =>
      '<button class="chip' + (id === deckFilter ? ' is-on' : '') + '" data-deck="' + id + '">' +
      esc(label) + '</button>').join('');
    let list = Deck.ALL;
    if (deckFilter === 'loved') list = list.filter(p => Store.isLoved(p.id));
    else if (deckFilter === 'done') list = list.filter(p => Store.doneCount(p.id) > 0);
    else if (deckFilter === 'new') list = list.filter(p => Store.seenCount(p.id) === 0);
    else if (deckFilter !== 'all') list = Deck.pool(deckFilter, ['dawn', 'day', 'dusk', 'night', 'early', 'late', 'near', 'far']);
    $('#deckCount').textContent = list.length + ' of ' + Deck.size + ' cards.  ' +
      Object.keys(Store.deck().done).length + ' met and done.  ' + Store.deck().loved.length + ' starred.';
    $('#deckEmpty').hidden = list.length > 0;
    $('#deckEmptyText').textContent =
      deckFilter === 'loved' ? 'No cards starred yet. Tap a star on any card and it will come back to you more often.'
      : deckFilter === 'done' ? 'No cards finished yet. They arrive on a walk, a few at a time.'
      : deckFilter === 'new' ? 'You have met every card in the deck. That is a lot of walking.'
      : 'Nothing in this part of the deck.';
    $('#deckList').innerHTML = list.map((p, i) => {
      const d = Store.doneCount(p.id), loved = Store.isLoved(p.id);
      return '<div class="dcard' + (d ? ' is-done' : '') + '" style="--i:' + Math.min(i, 11) + '">' +
        '<p class="quest">' + esc(p.t) + '</p>' +
        '<div class="drow"><span class="dmeta">' +
        (d ? 'Done ' + d + (d > 1 ? ' times' : ' time') : Store.seenCount(p.id) ? 'Met, not done' : 'Not yet met') +
        '</span><button class="star' + (loved ? ' is-on' : '') + '" data-star="' + p.id + '" ' +
        'aria-label="Star this card"><svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M12 4.2l2.3 5 5.4.6-4 3.7 1.1 5.3L12 16.2 7.2 18.8l1.1-5.3-4-3.7 5.4-.6z"/></svg></button></div></div>';
    }).join('');
  }

  /* ================= SETTINGS ================= */
  const TRAIN = [
    ['first', 'Set off', 'Two taps and a long one. The walk has begun.'],
    ['left', 'Bear left', 'Two short pulses.'],
    ['right', 'Bear right', 'One long pulse.'],
    ['straight', 'Keep going', 'One short pulse.'],
    ['about', 'Turn about', 'Five quick pulses. Rare, and it means it.'],
    ['home', 'Toward the start', 'Long, short, long.'],
    ['prompt', 'A card has arrived', 'A soft double, quieter than the rest.']
  ];
  function renderSettings() {
    const s = Store.settings();
    pending = null; clearTimeout(importTimer);
    $('#importBtn').textContent = 'Put a copy back';
    $('#hapticChk').checked = s.haptics;
    $('#strengthRange').value = Math.round(s.strength * 100);
    $('#rateSel').value = s.rate;
    $('#unitSel').value = s.units;
    $('#awakeChk').checked = s.awake;
    $('#trainer').innerHTML = TRAIN.map(([k, label, note]) =>
      '<button class="trainbtn" data-buzz="' + k + '"><b>' + esc(label) + '</b><i>' + esc(note) + '</i></button>').join('');
    const N = nat();
    $('#ampNote').textContent = N && N.hasAmplitudeControl && N.hasAmplitudeControl()
      ? 'This phone can vary the strength of a pulse, so the slider does real work.'
      : N ? 'This phone only has one vibration strength, so the slider changes very little.'
          : 'Haptics land properly in the installed app. A browser can only buzz if the device lets it.';
    $('#aboutLine').textContent = Deck.size + ' cards in the deck. No account, no ads, no analytics, no internet permission.';
  }

  /* ================= WIRING ================= */
  let eraseArmed = false, deleteArmed = false;
  let pending = null, importTimer = null;

  /* An export you cannot put back is a one way door, so the file you wrote is readable again.
     It is read and described first, and only replaces anything on a second, deliberate tap. */
  function offerImport(text) {
    const r = Store.readImport(text);
    clearTimeout(importTimer);
    if (!r.ok) {
      pending = null;
      $('#importBtn').textContent = 'Put a copy back';
      $('#ioNote').textContent = r.why + ' Choose the detour-walks.json file you exported.';
      return;
    }
    pending = r.rec;
    $('#importBtn').textContent = 'Replace everything with it';
    $('#ioNote').textContent = 'That copy holds ' + r.walks + (r.walks === 1 ? ' walk, ' : ' walks, ') +
      r.cells + (r.cells === 1 ? ' square of ground and ' : ' squares of ground and ') +
      r.quests + (r.quests === 1 ? ' finished quest' : ' finished quests') +
      '. Putting it back replaces everything on this phone. Tap again within ten seconds to do it.';
    importTimer = setTimeout(() => {
      pending = null;
      $('#importBtn').textContent = 'Put a copy back';
      $('#ioNote').textContent = '';
    }, 10000);
  }

  function doImport() {
    if (!pending) { $('#importFile').click(); return; }
    const rec = pending;
    pending = null;
    clearTimeout(importTimer);
    Store.restore(rec);
    W = null; curLeg = null;
    $('#importBtn').textContent = 'Put a copy back';
    $('#ioNote').textContent = 'Put back. Everything in that copy is here now.';
    renderSettings();
  }

  function wire() {
    $$('#tabs .tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

    $('#introGo').addEventListener('click', () => {
      Store.set('seenIntro', true);
      setView('setout');
    });

    /* set out */
    buildRuler();
    $('#dialUp').addEventListener('click', () => { setMinutes(Store.settings().minutes + 5); buzz('tap'); });
    $('#dialDown').addEventListener('click', () => { setMinutes(Store.settings().minutes - 5); buzz('tap'); });
    $('#ruler').addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setMinutes(Store.settings().minutes + 5); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setMinutes(Store.settings().minutes - 5); e.preventDefault(); }
    });
    $('#moodRow').addEventListener('click', e => {
      const b = e.target.closest('[data-mood]');
      if (!b) return;
      Store.set('mood', b.dataset.mood);
      buzz('tap');
      renderSetOut();
    });
    $('#loopChk').addEventListener('change', e => { Store.set('loop', e.target.checked); renderSetOut(); });
    $('#wanderBtn').addEventListener('click', () => wander());
    $('#resumeBtn').addEventListener('click', () => resumeWalk());
    $('#settingsBtn').addEventListener('click', () => { renderSettings(); go('settings'); });
    $('#settingsClose').addEventListener('click', () => setView('setout'));

    /* the walk */
    $('#gateRetry').addEventListener('click', () => { Geo.stop(); beginLocating(); });
    $('#blockBtn').addEventListener('click', () => blockThisWay());
    $('#homeBtn').addEventListener('click', () => takeMeBack());
    $('#paperNext').addEventListener('click', () => { paperAdvance(); buzz('tap'); });
    $('#walkMenuBtn').addEventListener('click', () => openSheet('#walkMenu'));
    $('#menuBack').addEventListener('click', () => { $('#walkMenu').hidden = true; });
    $('#menuFinish').addEventListener('click', () => { $('#walkMenu').hidden = true; finishWalk(); });
    $('#menuBin').addEventListener('click', () => { $('#walkMenu').hidden = true; binWalk(); });
    $('#menuMaps').addEventListener('click', () => {
      if (!W || !W.start) return;
      try { window.location.href = 'geo:' + W.start[0].toFixed(6) + ',' + W.start[1].toFixed(6) + '?q=' +
        W.start[0].toFixed(6) + ',' + W.start[1].toFixed(6) + '(Where this walk started)'; }
      catch (e) { toast('No maps app answered.'); }
    });

    $('#questDone').addEventListener('click', () => { closePrompt('done'); buzz('tap'); toast('Stamped into the walk.'); });
    $('#questLater').addEventListener('click', () => closePrompt('skipped'));
    $('#questNote').addEventListener('click', () => {
      $('#noteBox').hidden = false;
      $('#noteText').focus();
    });
    $('#noteSave').addEventListener('click', () => {
      closePrompt('done', $('#noteText').value.trim());
      toast('Kept, with a line.');
    });

    /* finish */
    $('#finishSave').addEventListener('click', () => keepWalk());
    $('#finishShare').addEventListener('click', () => { if (W) shareWalk(W); });

    /* journal */
    $('#journalSegs').addEventListener('click', e => {
      const b = e.target.closest('[data-jseg]');
      if (!b) return;
      jseg = b.dataset.jseg;
      renderJournal();
    });
    $('#jFilter').addEventListener('click', e => {
      const b = e.target.closest('[data-jmood]');
      if (!b) return;
      jFilterMood = b.dataset.jmood;
      renderJournal();
    });
    $('#walkShelf').addEventListener('click', e => {
      const b = e.target.closest('[data-walk]');
      if (b) openEntry(b.dataset.walk);
    });
    $('#entryClose').addEventListener('click', () => setView('journal'));
    $('#entryShare').addEventListener('click', () => { const w = Store.walk(entryId); if (w) shareWalk(w); });
    $('#entryDelete').addEventListener('click', () => {
      const b = $('#entryDelete');
      if (!deleteArmed) {
        deleteArmed = true; b.textContent = 'Tap again to delete it';
        setTimeout(() => { deleteArmed = false; b.textContent = 'Delete this walk'; }, 5000);
        return;
      }
      deleteArmed = false; b.textContent = 'Delete this walk';
      Store.deleteWalk(entryId);
      toast('Deleted.');
      setView('journal');
    });

    /* deck */
    $('#deckFilter').addEventListener('click', e => {
      const b = e.target.closest('[data-deck]');
      if (!b) return;
      deckFilter = b.dataset.deck;
      renderDeck();
    });
    $('#deckList').addEventListener('click', e => {
      const b = e.target.closest('[data-star]');
      if (!b) return;
      const on = Store.toggleLove(b.dataset.star);
      b.classList.toggle('is-on', on);
      buzz('tap');
      $('#deckCount').textContent = $('#deckCount').textContent.replace(/\d+ starred/, Store.deck().loved.length + ' starred');
    });

    /* settings */
    $('#hapticChk').addEventListener('change', e => { Store.set('haptics', e.target.checked); if (e.target.checked) buzz('tap'); });
    $('#strengthRange').addEventListener('change', e => { Store.set('strength', Number(e.target.value) / 100); buzz('right'); });
    $('#rateSel').addEventListener('change', e => Store.set('rate', e.target.value));
    $('#unitSel').addEventListener('change', e => Store.set('units', e.target.value));
    $('#awakeChk').addEventListener('change', e => Store.set('awake', e.target.checked));
    $('#trainer').addEventListener('click', e => {
      const b = e.target.closest('[data-buzz]');
      if (b) buzz(b.dataset.buzz);
    });
    $('#exportJson').addEventListener('click', () => download('detour-walks.json', 'application/json', Store.exportJson()));
    $('#importBtn').addEventListener('click', () => doImport());
    $('#importFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      $('#ioNote').textContent = 'Reading that copy.';
      const fr = new FileReader();
      fr.onload = () => offerImport(String(fr.result || ''));
      fr.onerror = () => { $('#ioNote').textContent = 'That file could not be opened.'; };
      fr.readAsText(f);
    });
    $('#exportText').addEventListener('click', () => download('detour-journal.txt', 'text/plain', Store.exportText()));
    $('#eraseBtn').addEventListener('click', () => {
      const b = $('#eraseBtn');
      pending = null; clearTimeout(importTimer); $('#importBtn').textContent = 'Put a copy back';
      if (!eraseArmed) {
        eraseArmed = true;
        b.textContent = 'Tap again to erase it all';
        $('#ioNote').textContent = 'This removes every walk, every square of ground and every preference from this phone. It cannot be undone.';
        setTimeout(() => { eraseArmed = false; b.textContent = 'Erase everything'; $('#ioNote').textContent = ''; }, 6000);
        return;
      }
      eraseArmed = false;
      Store.eraseAll();
      W = null; curLeg = null;
      b.textContent = 'Erase everything';
      $('#ioNote').textContent = 'Erased.';
      renderSettings();
    });

    window.addEventListener('resize', () => {
      if (mode === 'walk') { roseKey = ''; drawRose(); drawTrace(); }
      if (mode === 'main' && view === 'journal') renderJournal();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onPause(); else onResume();
    });
    /* saveSoon coalesces, which means up to four seconds of a live walk is still only in memory.
       A page being taken away is the last chance to write it down. */
    window.addEventListener('pagehide', () => { try { Store.flush(); } catch (e) {} });
  }

  /* ---------- the shell's three hooks ---------- */
  function back() {
    if (!$('#promptSheet').hidden) { closePrompt('skipped'); return true; }
    if (!$('#walkMenu').hidden) { $('#walkMenu').hidden = true; return true; }
    if (mode === 'walk') { openSheet('#walkMenu'); return true; }
    if (mode === 'finish') { keepWalk(); return true; }
    if (mode === 'entry') { setView('journal'); return true; }
    if (mode === 'settings') { setView('setout'); return true; }
    if (mode === 'main' && view !== 'setout') { setView('setout'); return true; }
    return false;
  }

  let pauseAt = 0, wasWatching = false;
  function onPause() {
    pauseAt = Date.now();
    if (W) Store.flush();
    cancelAnimationFrame(sketchRaf);
    stopRose();
    clearInterval(tickTimer); tickTimer = null;
    /* The intro promises Detour reads location only while a walk is open on your screen. It is not
       open now, so the receiver goes off and comes back when you do. */
    wasWatching = Geo.isRunning();
    if (wasWatching) Geo.stop();
  }
  function onResume() {
    if (mode === 'walk' && W) {
      if (pauseAt) {
        const gap = Math.round((Date.now() - pauseAt) / 1000);
        if (gap > 25) { W.pausedS = (W.pausedS || 0) + gap; Store.saveLive(); }
      }
      if (wasWatching && !paperMode) {
        Geo.start(onFix, onGeoState);
        Geo.resync();
      }
      clearInterval(tickTimer);
      tickTimer = setInterval(tick, 1000);
      renderWalk(); drawRose(); startRose();
    }
    wasWatching = false;
    pauseAt = 0;
  }

  /* ---------- go ---------- */
  function init() {
    wire();
    const c = $('#introCount');
    if (c) c.textContent = String(Deck.size);
    if (!Store.settings().seenIntro) { go('intro'); }
    else if (Store.live()) { setView('setout'); }
    else { setView('setout'); }
    scrollRulerTo(Store.settings().minutes);
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    back, onPause, onResume,
    setView, go, setMinutes, startWalk, resumeWalk, finishWalk, keepWalk, binWalk,
    openEntry, renderSetOut, renderJournal, renderDeck, renderSettings, firePrompt,
    enterPaper: () => enterPaper(false), paperAdvance,
    _walk: () => W, _leg: () => curLeg, _mode: () => mode,
    setSeg: s => { jseg = s; renderJournal(); },
    setDeckFilter: f => { deckFilter = f; renderDeck(); }
  };
})();

/* A top-level const is not a window property, and the shell reaches for window.App. */
window.App = App;
window.Store = Store;
window.Deck = Deck;
window.Geo = Geo;
window.Composer = Composer;
window.Sketch = Sketch;
