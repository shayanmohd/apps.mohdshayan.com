/* Greenroom. Three tabs, one overlay for the take itself, and a notes screen
   that is really an audio player with reasons attached.

   Navigation is a stack rather than a router: tabs reset it, everything else
   pushes onto it, and the Android Back gesture pops it. The shell asks
   window.App.back() first and only closes the app when this says it did not
   consume the press. */

const App = (() => {

  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));

  const TABS = ['stage', 'speeches', 'progress'];
  let stack = ['stage'];
  let ctxSpeech = null;      // speech id being looked at
  let ctxTake = null;        // take id on the notes screen
  let cmp = null;            // compare state

  /* ------------------------------------------------------------------ util */

  function mmss(t) {
    t = Math.max(0, Math.floor(t));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }
  function dur(t) {
    t = Math.round(t);
    return t < 60 ? t + 's' : Math.floor(t / 60) + 'm ' + String(t % 60).padStart(2, '0') + 's';
  }
  function ago(ts) {
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d <= 0) {
      const h = Math.floor((Date.now() - ts) / 3600000);
      if (h < 1) return 'just now';
      return h + (h === 1 ? ' hour ago' : ' hours ago');
    }
    if (d === 1) return 'yesterday';
    if (d < 30) return d + ' days ago';
    const m = Math.round(d / 30);
    return m + (m === 1 ? ' month ago' : ' months ago');
  }
  function daysTo(iso) {
    if (!iso) return null;
    const t = new Date(iso + 'T12:00:00').getTime();
    if (isNaN(t)) return null;
    return Math.round((t - Date.now()) / 86400000);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** One inline icon, from the sprite at the top of index.html. */
  const icon = id => '<svg aria-hidden="true"><use href="#i-' + id + '"/></svg>';
  const SIGNAL_ICON = { pace: 'pace', pause: 'pausesig', pitch: 'pitch', level: 'level', shape: 'shape', filler: 'filler' };

  function buzz(ms, amp) {
    if (!Store.settings().haptics) return;
    try {
      if (window.Native && window.Native.vibrate) window.Native.vibrate(ms, amp || 150);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* a phone without a motor is not an error */ }
  }
  function awake(on) {
    try { if (window.Native && window.Native.keepAwake) window.Native.keepAwake(!!on); } catch (e) {}
  }

  /* The example take is drawn from the app's own arithmetic rather than from a
     microphone. It is allowed everywhere, and labelled everywhere, and it is
     never counted as something the user did. */
  const isDemo = x => !!(x && x.demo);
  const realTakes = () => Store.takes().filter(t => !isDemo(t));
  const demoSpeech = () => Store.speeches().find(isDemo) || null;
  const demoTake = () => Store.takes().find(isDemo) || null;

  /* ----------------------------------------------------------------- busy */

  /* Anything that takes longer than a blink puts this in front of the app, so a
     tap is never answered by a screen that sits there looking the same. */
  let busyCancelFn = null;
  function busy(text, opts) {
    opts = opts || {};
    $('#busyText').textContent = text;
    $('#busyBarWrap').hidden = !opts.bar;
    if (opts.bar) $('#busyBar').style.width = '3%';
    $('#busyCancel').hidden = !opts.onCancel;
    busyCancelFn = opts.onCancel || null;
    $('#busy').hidden = false;
  }
  function busySay(text) { if (!$('#busy').hidden) $('#busyText').textContent = text; }
  function busyAt(p) { $('#busyBar').style.width = Math.round(Math.max(0.02, Math.min(1, p)) * 100) + '%'; }
  function busyOff() { $('#busy').hidden = true; busyCancelFn = null; }

  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ---------------------------------------------------------------- sheets */

  let openSheet = null;
  function sheet(id, on) {
    const el = $(id);
    if (on) {
      if (openSheet && openSheet !== id) sheet(openSheet, false);
      el.hidden = false;
      $('#scrim').hidden = false;
      openSheet = id;
    } else {
      el.hidden = true;
      if (openSheet === id) { openSheet = null; $('#scrim').hidden = true; }
    }
  }
  function closeSheets() {
    // Dismissing the intro any way at all counts as having seen it. It used to
    // come back on every launch unless an occasion was picked, which reads as
    // the dismissal not having worked.
    if (openSheet === '#introSheet') Store.markSeen('intro', true);
    if (openSheet) sheet(openSheet, false);
  }

  let confirmFn = null;
  function confirmSheet(title, body, label, fn) {
    $('#cfTitle').textContent = title;
    $('#cfBody').textContent = body;
    $('#cfGo').textContent = label;
    confirmFn = fn;
    sheet('#confirmSheet', true);
  }

  /* -------------------------------------------------------------- routing */

  function setView(name, opts) {
    opts = opts || {};
    if (TABS.indexOf(name) >= 0) stack = [name];
    else if (stack[stack.length - 1] !== name || opts.force) stack.push(name);
    render();
  }

  function pop() {
    if (stack.length > 1) { stack.pop(); render(); return true; }
    if (stack[0] !== 'stage') { stack = ['stage']; render(); return true; }
    return false;
  }

  function current() { return stack[stack.length - 1]; }

  function render() {
    const v = current();
    stopPlayback();
    $$('.view').forEach(s => s.classList.remove('on'));
    const el = $('#v-' + v);
    if (el) el.classList.add('on');
    const full = !!(el && el.classList.contains('full'));
    document.body.classList.toggle('fullview', full);
    document.body.classList.toggle('hasplayer', v === 'notes' || v === 'compare');
    $('#topBack').hidden = stack.length <= 1;
    $('#topSettings').hidden = stack.length > 1;
    $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === v));
    window.scrollTo(0, 0);

    if (v === 'stage') { $('#topTitle').textContent = 'Greenroom'; renderStage(); }
    if (v === 'speeches') { $('#topTitle').textContent = 'Speeches'; renderSpeeches(); }
    if (v === 'progress') { $('#topTitle').textContent = 'Progress'; renderProgress(); }
    if (v === 'speech') { renderSpeech(); }
    if (v === 'notes') { renderNotes(); }
    if (v === 'compare') { renderCompare(); }
  }

  /* ----------------------------------------------------------------- stage */

  function activeSpeech() {
    // Recording never lands in the example speech: it is a demonstration, not a
    // folder for your takes.
    const list = Store.speeches().filter(x => !isDemo(x));
    if (!list.length) return null;
    const s = ctxSpeech ? Store.speech(ctxSpeech) : null;
    return (s && !isDemo(s)) ? s : list[0];
  }

  function renderStage() {
    const list = Store.speeches().filter(x => !isDemo(x));
    const active = activeSpeech();
    if (active) ctxSpeech = active.id;

    // the warm-up prompt, offered until two takes exist
    const takes = realTakes().length;
    const pc = $('#promptCard');
    if (takes < 2) {
      const p = Content.promptFor(Math.floor(Store.firstRun() / 86400000) + takes);
      pc.hidden = false;
      $('#promptText').textContent = p.text;
      $('#promptSub').textContent = takes === 0
        ? p.sub + ' Nothing is uploaded and you can delete it straight after.'
        : 'Same prompt, one change: put one deliberate pause in it.';
      // The second take is the same prompt again, so the change asked for is
      // the only thing that differs between them.
      if (takes === 1) {
        $('#promptText').textContent = Content.promptFor(Math.floor(Store.firstRun() / 86400000)).text;
      }
    } else pc.hidden = true;

    const cr = $('#speechChips');
    cr.innerHTML = '';
    if (!list.length) {
      // No speech yet: name the one the record button is about to make. It is a
      // label, so it is dressed as a label. A chip that cannot be pressed and
      // looks exactly like one that can is a button that does nothing.
      const b = document.createElement('span');
      b.className = 'chip placeholder';
      b.textContent = defaultTitle('freeform') + ', once you record';
      cr.appendChild(b);
    }
    list.slice(0, 6).forEach(s => {
      const b = document.createElement('button');
      b.className = 'chip' + (active && s.id === active.id ? ' on' : '');
      b.textContent = s.title;
      b.onclick = () => { ctxSpeech = s.id; renderStage(); };
      cr.appendChild(b);
    });

    // audiences
    const g = $('#audienceGrid');
    const chosen = Store.settings().audience;
    if (!g.dataset.built) {
      g.innerHTML = '';
      Content.AUDIENCES.forEach(a => {
        const b = document.createElement('button');
        b.className = 'aud';
        b.dataset.aud = a.id;
        b.innerHTML = '<canvas></canvas><span class="audname"></span>';
        b.querySelector('.audname').textContent = a.name;
        b.onclick = () => { Store.set('audience', a.id); renderStage(); buzz(10, 90); };
        g.appendChild(b);
      });
      g.dataset.built = '1';
      requestAnimationFrame(() => {
        $$('#audienceGrid .aud').forEach(b => Room.preview(b.querySelector('canvas'), b.dataset.aud));
      });
    }
    $$('#audienceGrid .aud').forEach(b => b.classList.toggle('on', b.dataset.aud === chosen));
    $('#audienceNote').textContent = Content.aud(chosen).blurb;

    // script
    const mode = Store.settings().scroll;
    $$('#scriptSeg button').forEach(b => b.classList.toggle('on', b.dataset.scroll === mode));
    const hasScript = !!(active && active.script && active.script.trim());
    $('#editScriptBtn').textContent = !active ? 'New speech' : hasScript ? 'Edit script' : 'Write script';
    $('#scriptHint').textContent = !active
      ? 'A script belongs to a speech. Make one first and the teleprompter opens with it.'
      : !hasScript
      ? 'No script saved for this speech yet. The teleprompter needs one.'
      : mode === 'off' ? 'Script saved. The teleprompter stays off until you turn it on.'
      : mode === 'pace' ? 'The lines move at the speed you are actually speaking, not at a set rate.'
      : 'The lines move at ' + Store.settings().scrollWpm + ' words a minute, whatever you do.';

    // the record button
    const all = realTakes();
    const last = all.length ? all[all.length - 1] : null;
    $('#recSub').textContent = last
      ? 'Last take ' + ago(last.at) + ', ' + dur(last.dur) + '.'
      : 'Tap to record. Everything stays on this phone.';

    // Until there is a take of your own, the first screen keeps a labelled way
    // into the worked example, so no reviewer or borrowed phone is ever one
    // failed microphone away from an app with nothing in it.
    const rd = $('#recDemo');
    rd.hidden = all.length > 0;
    rd.textContent = demoTake() ? 'Open the example take' : 'No microphone? See an example take';
  }

  /** A take with no measurements cannot be drawn or opened. Nothing this app
      writes is shaped that way, but a hand-edited store or a half-written
      record should hide one row rather than take the screen down with it. */
  const sound = t => !!(t && t.sig && t.sig.stats);

  /* -------------------------------------------------------------- speeches */

  function renderSpeeches() {
    const list = Store.speeches();
    const wrap = $('#speechList');
    wrap.innerHTML = '';
    $('#speechEmpty').hidden = list.length > 0;
    list.forEach(s => {
      const takes = Store.takesOf(s.id).filter(sound);
      const b = document.createElement('button');
      b.className = 'row';
      const d = daysTo(s.eventDate);
      let right = takes.length ? takes.length + (takes.length === 1 ? ' take' : ' takes') : 'no takes';
      b.innerHTML =
        '<div class="row-top"><span class="row-title">' + esc(s.title) +
        (isDemo(s) ? '<span class="demotag">Example</span>' : '') + '</span>' +
        '<span class="row-right">' + right + '</span></div>' +
        '<div class="row-meta">' + esc(Content.occ(s.occasion).name) +
        (takes.length ? ' \u00b7 last ' + ago(takes[takes.length - 1].at) : '') + '</div>' +
        (d !== null ? '<div class="deadline">' + (d > 0 ? 'In ' + d + (d === 1 ? ' day' : ' days')
          : d === 0 ? 'Today' : 'Was ' + (-d) + (d === -1 ? ' day' : ' days') + ' ago') + '</div>' : '') +
        (takes.length > 2 ? '<div class="row-spark"><span class="sparklab">Pace, take by take</span><canvas></canvas></div>' : '');
      b.onclick = () => { ctxSpeech = s.id; setView('speech'); };
      wrap.appendChild(b);
      const cv = b.querySelector('canvas');
      if (cv) requestAnimationFrame(() => Charts.spark(cv, takes.map(t => t.sig.stats.wpm)));
    });
  }

  /* --------------------------------------------------------- speech detail */

  function renderSpeech() {
    const s = Store.speech(ctxSpeech);
    if (!s) { pop(); return; }
    $('#topTitle').textContent = s.title;
    const takes = Store.takesOf(s.id).filter(sound);
    const d = daysTo(s.eventDate);

    const head = $('#speechHead');
    head.innerHTML =
      (isDemo(s) ? '<div class="demobar">' + icon('ear') + '<span>' + esc(Demo.NOTE) + '</span></div>' : '') +
      '<div class="card">' +
        '<div class="row-meta">' + esc(Content.occ(s.occasion).name) +
        (s.targetMin ? ' \u00b7 target ' + s.targetMin + (s.targetMin === 1 ? ' minute' : ' minutes') : '') + '</div>' +
        (d !== null ? '<div class="deadline">' + (d > 0 ? d + (d === 1 ? ' day to go' : ' days to go')
          : d === 0 ? 'Today' : 'Was ' + (-d) + (d === -1 ? ' day' : ' days') + ' ago') + '</div>' : '') +
        '<div class="stat">' +
          '<div><b>' + takes.length + '</b><span>takes</span></div>' +
          '<div><b>' + dur(takes.reduce((n, t) => n + t.dur, 0)) + '</b><span>rehearsed</span></div>' +
          (takes.length ? '<div><b>' + takes[takes.length - 1].sig.stats.wpm + '</b><span>wpm last</span></div>' : '') +
        '</div>' +
      '</div>' +
      (isDemo(s)
        ? '<div class="actions" style="margin-top:2px">' +
            '<button class="btn danger wide" id="spDemoGone">Remove the example</button>' +
          '</div>'
        : '<div class="actions" style="margin-top:2px">' +
            '<button class="btn" id="spRehearse">Rehearse this</button>' +
            '<button class="btn ghost" id="spScript">' + (s.script ? 'Script' : 'Add script') + '</button>' +
            '<button class="btn ghost" id="spEdit">Details</button>' +
          '</div>') +
      (takes.length >= 2 ? '<div class="actions" style="margin-top:8px"><button class="btn ghost wide" id="spCompare">Compare two takes</button></div>' : '') +
      '<div class="card" style="margin-top:22px">' +
        '<div class="label" style="margin-bottom:10px">Worth remembering</div>' +
        Content.structure(s.occasion).map(x => '<p style="font-size:14.5px;color:var(--muted);line-height:1.5;margin-bottom:8px">' + esc(x) + '</p>').join('') +
      '</div>' +
      '<div class="label" style="display:block;margin:26px 0 10px">Takes</div>';

    if ($('#spRehearse')) $('#spRehearse').onclick = () => { ctxSpeech = s.id; startTake(); };
    if ($('#spScript')) $('#spScript').onclick = () => openScript(s);
    if ($('#spEdit')) $('#spEdit').onclick = () => openSpeechSheet(s);
    if ($('#spDemoGone')) $('#spDemoGone').onclick = () => confirmSheet('Remove the example?',
      'It can be built again from Settings at any time.', 'Remove', () => { closeSheets(); removeExample(); });
    if ($('#spCompare')) $('#spCompare').onclick = () => pickCompare(takes);

    const tl = $('#takeList');
    tl.innerHTML = '';
    if (!takes.length) {
      tl.innerHTML = '<p class="hint">No takes yet. The first one is always the worst one, which is exactly why it is worth having.</p>';
    }
    takes.slice().reverse().forEach(t => {
      const n = Store.takeNumber(t);
      const st = t.sig.stats;
      const b = document.createElement('button');
      b.className = 'row';
      b.innerHTML =
        '<div class="row-top"><span class="row-title">' + (isDemo(t) ? 'The example' : 'Take ' + n) + '</span>' +
        '<span class="row-right">' + dur(t.dur) + '</span></div>' +
        '<div class="row-meta">' + ago(t.at) + ' \u00b7 ' + Content.aud(t.audience).short + '</div>' +
        '<div class="stat">' +
          '<div><b>' + st.wpm + '</b><span>wpm</span></div>' +
          '<div><b>' + st.braveCount + '</b><span>pauses 1s+</span></div>' +
          '<div><b>' + (st.semiSd === null ? '-' : st.semiSd.toFixed(1)) + '</b><span>semitones</span></div>' +
        '</div>';
      b.onclick = () => { ctxTake = t.id; setView('notes'); };
      tl.appendChild(b);
    });
  }

  /* ---------------------------------------------------------------- sheets */

  let editingSpeech = null;
  let spOcc = 'freeform';

  function openSpeechSheet(s) {
    editingSpeech = s || null;
    $('#speechSheetTitle').textContent = s ? 'Speech details' : 'New speech';
    $('#spTitle').value = s ? s.title : '';
    $('#spDate').value = s && s.eventDate ? s.eventDate : '';
    $('#spTarget').value = s && s.targetMin ? s.targetMin : '';
    spOcc = s ? s.occasion : 'talk';
    const g = $('#spOcc');
    g.innerHTML = '';
    Content.OCCASIONS.forEach(o => {
      const b = document.createElement('button');
      b.className = 'chip' + (o.id === spOcc ? ' on' : '');
      b.textContent = o.name;
      b.onclick = () => {
        spOcc = o.id;
        $$('#spOcc .chip').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        if (!$('#spTitle').value.trim()) $('#spTitle').placeholder = defaultTitle(o.id);
      };
      g.appendChild(b);
    });
    $('#spErr').hidden = true;
    $('#spDelete').hidden = !s;
    sheet('#speechSheet', true);
    setTimeout(() => $('#spTitle').focus(), 120);
  }

  function defaultTitle(occ) {
    return { talk: 'The talk', toast: 'The toast', defense: 'The defence', interview: 'Interview answers', freeform: 'Practice' }[occ] || 'Practice';
  }

  function saveSpeechSheet() {
    const title = ($('#spTitle').value || '').trim() || defaultTitle(spOcc);
    const dateV = $('#spDate').value || null;
    const tgt = parseInt($('#spTarget').value, 10);
    const patch = {
      title: title.slice(0, 60), occasion: spOcc, eventDate: dateV,
      targetMin: isFinite(tgt) && tgt > 0 ? Math.min(120, tgt) : null
    };
    if (editingSpeech) Store.updateSpeech(editingSpeech.id, patch);
    // A second tap before the sheet closes must edit the speech the first tap
    // made rather than make another one with the same name.
    else { const s = Store.addSpeech(patch); ctxSpeech = s.id; editingSpeech = s; }
    if (!Store.save()) { $('#spErr').textContent = Store.error(); $('#spErr').hidden = false; return; }
    closeSheets();
    render();
  }

  function openScript(s) {
    editingSpeech = s;
    $('#scriptText').value = s.script || '';
    $('#scriptSheetSub').textContent = s.script
      ? 'Edit what the teleprompter shows while you record. It is stored with this speech and nowhere else.'
      : 'Paste or type what you plan to say. The teleprompter shows it a few lines at a time while you record.';
    sheet('#scriptSheet', true);
  }

  /* -------------------------------------------------------------- the take */

  let rec = { on: false, t0: 0, raf: 0, speechId: null, cancelled: false, scrollY: 0, words: 0, pxPerWord: 0, drag: null, warned: false, note: '', noteUntil: 0, stopReady: false };

  /* ------------------------------------------------- when the take cannot start */

  /** What Android says about the microphone right now: granted, ask, or blocked
      because the system will not show the dialog again. */
  function micState() {
    try {
      if (window.Native && window.Native.micPermission) return window.Native.micPermission();
    } catch (e) {}
    return 'ask';
  }

  function hideMicCard() { $('#micCard').hidden = true; }

  /** A failure that stops the app doing its one job is stated on the screen and
      stays stated, with the way out attached. A message that disappears after
      two seconds is indistinguishable from a button that did nothing. */
  function showMicCard(kind, msg, detail) {
    const perm = micState();
    let title, body;
    const acts = [];

    if (kind === 'denied' && perm === 'blocked') {
      title = 'The microphone is switched off for Greenroom';
      body = 'Android will not ask again from inside the app, so it has to be turned back on in '
           + 'settings: open Permissions, then Microphone, then Allow. Nothing leaves this phone either way.';
      acts.push({ label: 'Open settings', kind: 'primary', go: openSettingsPage });
    } else if (kind === 'denied') {
      title = 'Greenroom needs permission to use the microphone';
      body = 'It is the only thing the app listens with, and the recording stays on this phone: '
           + 'there is no internet permission in Greenroom at all.';
      acts.push({ label: 'Ask again', kind: 'primary', go: () => { hideMicCard(); startTake(); } });
    } else if (kind === 'missing') {
      title = 'This device is not offering a microphone';
      body = 'Nothing is listed as an audio input, so there is nothing to record with. '
           + 'A headset or an external microphone would give Greenroom one.';
    } else if (kind === 'timeout') {
      title = 'The microphone did not open';
      body = 'Something else may be holding it. Close any call, recorder or camera that is running and try again.';
      acts.push({ label: 'Try again', kind: 'primary', go: () => { hideMicCard(); startTake(); } });
    } else {
      title = 'Android would not hand Greenroom a microphone';
      body = 'The permission is in place, but the system refused the audio input'
           + (detail ? ' (' + detail + ')' : '') + '. This happens on devices and emulators with no working audio in. '
           + 'The example below shows every screen without recording anything.';
      acts.push({ label: 'Try again', kind: 'primary', go: () => { hideMicCard(); startTake(); } });
    }

    acts.push({ label: demoTake() ? 'Open the example take' : 'See an example take', go: buildExample });
    acts.push({ label: 'Hide this', go: hideMicCard });

    $('#micCardTitle').textContent = title;
    $('#micCardBody').textContent = body;
    const box = $('#micCardActions');
    box.innerHTML = '';
    acts.forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn' + (a.kind === 'primary' ? '' : ' ghost');
      b.textContent = a.label;
      b.onclick = a.go;
      box.appendChild(b);
    });
    $('#micCard').hidden = false;
    if (current() !== 'stage') setView('stage');
    $('#micCard').scrollIntoView({ block: 'nearest' });
  }

  function openSettingsPage() {
    let ok = false;
    try { ok = !!(window.Native && window.Native.openAppSettings && window.Native.openAppSettings()); } catch (e) {}
    if (!ok) toast('This build cannot open the settings app. Open Android settings, Apps, Greenroom, Permissions.');
  }

  /* Every path into a take goes through here, and two of them are ordinary
     buttons that stay tappable while the microphone opens. One attempt at a
     time, or the second tap arms a second microphone. */
  let starting = false;
  let armCancelled = false;
  async function startTake() {
    if (starting || rec.on || !$('#rehearse').hidden) return;
    starting = true;
    armCancelled = false;
    buzz(8, 80);
    // The feedback goes in front of the whole app rather than into #recBtn,
    // which is inside a view that may not even be on screen.
    busy('Opening the microphone.', {
      onCancel: () => { armCancelled = true; Recorder.release(); busyOff(); toast('Stopped opening the microphone.'); }
    });
    try { await beginTake(); }
    catch (e) {
      closeStage();
      showMicCard('blocked', 'Greenroom could not start a take.', String((e && e.name) || e));
    }
    finally { starting = false; busyOff(); }
  }

  async function beginTake() {
    let s = activeSpeech();
    if (!s) s = Store.addSpeech({ title: 'Practice', occasion: 'freeform' });
    ctxSpeech = s.id;

    let armed;
    try { armed = await Recorder.arm(); }
    finally { busyOff(); }

    if (armCancelled) { Recorder.release(); renderStage(); return; }
    if (!armed.ok) {
      if (armed.kind === 'cancelled') { renderStage(); return; }
      renderStage();
      showMicCard(armed.kind || 'blocked', armed.error, armed.detail);
      return;
    }
    hideMicCard();
    renderStage();

    rec.speechId = s.id;
    rec.cancelled = false;
    rec.warned = false;
    rec.note = '';
    rec.noteUntil = 0;
    rec.stopReady = false;

    const mood = Store.settings().audience;
    const stage = $('#rehearse');
    stage.hidden = false;
    $('#takeResult').hidden = true;
    $('#silentBanner').hidden = true;
    setStopButton(6);
    document.body.style.overflow = 'hidden';

    const useScript = Store.settings().scroll !== 'off' && s.script && s.script.trim();
    stage.classList.toggle('hasprompter', !!useScript);
    $('#prompter').hidden = !useScript;
    if (useScript) buildPrompter(s.script);

    // Every mood is drawn, the empty room included: a bare stage is a cone of
    // light with one microphone in it, and the light answers your voice. The
    // crowd starts lower when the teleprompter is holding the top of the
    // screen, so the back row never sits behind the words.
    Room.open($('#roomCanvas'), mood, () => Recorder.state(), { top: useScript ? 0.50 : 0.36 });

    $('#meters').classList.toggle('hidden', !Store.settings().meters);
    $('#metersToggle').textContent = Store.settings().meters ? 'Hide meters' : 'Show meters';
    $('#analysing').hidden = true;

    if (Store.settings().countdown) await countdown();
    if (rec.cancelled) { closeStage(); return; }

    Recorder.begin();
    rec.on = true;
    rec.t0 = performance.now();
    awake(true);
    buzz(24, 200);
    loop();
  }

  function countdown() {
    return new Promise(resolve => {
      const el = $('#countdown'), num = $('#countNum');
      el.hidden = false;
      let n = 3;
      num.textContent = n;
      buzz(30, 140);
      const iv = setInterval(() => {
        n--;
        if (rec.cancelled) { clearInterval(iv); el.hidden = true; resolve(); return; }
        if (n <= 0) { clearInterval(iv); el.hidden = true; resolve(); return; }
        num.textContent = n;
        buzz(30, 140);
      }, 800);
    });
  }

  function buildPrompter(text) {
    const inner = $('#prompterInner');
    inner.innerHTML = '';
    const words = text.trim().split(/\s+/);
    inner.textContent = words.join(' ');
    rec.words = words.length;
    rec.scrollY = 0;
    inner.style.transform = 'translateY(0px)';
    requestAnimationFrame(() => {
      const h = inner.scrollHeight;
      rec.pxPerWord = rec.words ? h / rec.words : 0;
    });
  }

  /** The stop button counts itself in. Under six seconds there is nothing in a
      take to read, so rather than letting the button quietly bin one, it shows
      how long is left and says so when it is tapped early. */
  function setStopButton(left) {
    const b = $('#stopBtn');
    if (left > 0) {
      if (!b.classList.contains('waiting') || b.dataset.left !== String(left)) {
        b.innerHTML = '<b class="wait">' + left + '</b>';
        b.dataset.left = String(left);
      }
      b.classList.add('waiting');
      b.setAttribute('aria-label', 'Stop, available in ' + left + ' seconds');
      rec.stopReady = false;
    } else if (!rec.stopReady) {
      b.innerHTML = '<span></span>';
      b.classList.remove('waiting');
      b.dataset.left = '0';
      b.setAttribute('aria-label', 'Stop recording');
      rec.stopReady = true;
    }
  }

  /** One line of live explanation inside the take screen. Persistent while it is
      true, rather than a toast that has gone by the time it is read. */
  function recNote(msg, forSec) {
    rec.note = msg;
    rec.noteUntil = performance.now() + (forSec || 5) * 1000;
    paintNote(true);
  }
  function paintNote(force) {
    const el = $('#silentBanner');
    const msg = rec.note && (force || performance.now() < rec.noteUntil) ? rec.note : '';
    if (!msg) { el.hidden = true; return; }
    if (el.textContent !== msg) el.textContent = msg;
    el.hidden = false;
  }

  function loop() {
    rec.raf = requestAnimationFrame(loop);
    if (!rec.on) return;
    const s = Recorder.state();
    // The clock runs on wall time, not on captured samples: if the audio graph
    // ever stalls, a frozen clock would be the only thing telling you, and it
    // would tell you far too late.
    const t = (performance.now() - rec.t0) / 1000;
    $('#mTime').textContent = mmss(t);
    setStopButton(Math.max(0, Math.ceil(6 - t)));

    // Nothing arriving at all is worth saying out loud, and worth keeping said.
    if (t > 3.5 && s.t < 0.5) {
      rec.warned = true;
      rec.note = 'No sound is reaching Greenroom. Check that nothing else is using the microphone, and that this device has one.';
      rec.noteUntil = performance.now() + 2000;
    } else if (rec.warned && s.t >= 0.5) {
      rec.warned = false;
      rec.note = '';
      rec.noteUntil = 0;
    }
    paintNote(false);

    $('#levelFill').style.width = Math.round(Math.min(1, s.level * 1.25) * 100) + '%';

    const pace = $('#mPace');
    if (s.wpm === null) { pace.textContent = 'listening'; pace.classList.remove('live'); }
    else { pace.textContent = s.wpm + ' wpm'; pace.classList.add('live'); }

    const q = $('#mPause');
    q.classList.toggle('on', s.silentFor > 0.7);
    q.textContent = s.silentFor > 0.7 ? s.silentFor.toFixed(1) + 's silent' : '';

    if ($('#rehearse').classList.contains('hasprompter') && !rec.drag) {
      const mode = Store.settings().scroll;
      const wpm = mode === 'fixed' ? Store.settings().scrollWpm : (s.wpm || 0);
      const dy = rec.pxPerWord * (wpm / 60) / 60;
      rec.scrollY += dy;
      $('#prompterInner').style.transform = 'translateY(' + (-rec.scrollY) + 'px)';
    }

    if (t > Recorder.MAX_SEC - 1) finishTake().catch(e => showTakeResult('error', String((e && e.name) || e)));
  }

  function closeStage() {
    rec.on = false;
    if (rec.raf) cancelAnimationFrame(rec.raf);
    rec.raf = 0;
    rec.note = '';
    Room.close();
    Recorder.release();
    awake(false);
    $('#rehearse').hidden = true;
    $('#countdown').hidden = true;
    $('#analysing').hidden = true;
    $('#takeResult').hidden = true;
    $('#silentBanner').hidden = true;
    document.body.style.overflow = '';
  }

  /** Stopping a take always lands somewhere. When there was nothing in it to
      read, this says what happened and offers the next move, rather than
      dropping the user back on the first screen with a message that fades. */
  function showTakeResult(kind, detail) {
    $('#analysing').hidden = true;
    $('#silentBanner').hidden = true;
    let title, body;
    const acts = [];
    if (kind === 'silent') {
      title = 'No speech was found in that take';
      body = 'The microphone opened and Greenroom listened, but nothing in the recording has the shape of '
           + 'someone speaking. That is usually a muted or covered microphone, another app holding it, or a '
           + 'device with no real audio input. Nothing was saved, so nothing was lost.';
      acts.push({ label: 'Record again', kind: 'primary', go: () => { closeStage(); startTake(); } });
      acts.push({ label: demoTake() ? 'Open the example take' : 'See an example take', go: () => { closeStage(); buildExample(); } });
    } else if (kind === 'short') {
      title = 'That take was under six seconds';
      body = 'Pace, pauses and pitch all need a stretch of speech before they mean anything, so nothing was saved. '
           + 'Six seconds is the floor, and a minute is where the notes get interesting.';
      acts.push({ label: 'Record again', kind: 'primary', go: () => { closeStage(); startTake(); } });
    } else {
      title = 'Greenroom could not finish reading that take';
      body = 'Something went wrong during the analysis' + (detail ? ' (' + detail + ')' : '')
           + '. The take was not saved. Trying again usually works.';
      acts.push({ label: 'Record again', kind: 'primary', go: () => { closeStage(); startTake(); } });
    }
    acts.push({ label: 'Back to the stage', go: () => { closeStage(); setView('stage'); } });

    $('#trTitle').textContent = title;
    $('#trBody').textContent = body;
    const box = $('#trActions');
    box.innerHTML = '';
    acts.forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn' + (a.kind === 'primary' ? '' : ' ghost');
      b.textContent = a.label;
      b.onclick = a.go;
      box.appendChild(b);
    });
    $('#takeResult').hidden = false;
  }

  async function finishTake() {
    if (!rec.on) {
      // Tapped during the countdown, before there is a take to stop. Do the
      // honest thing rather than nothing at all.
      if (!$('#rehearse').hidden && $('#takeResult').hidden) discardTake();
      return;
    }
    const wall = (performance.now() - rec.t0) / 1000;
    if (wall < 6) {
      recNote('A take needs six seconds before there is anything to read in it. Keep going, or tap Discard.', 4);
      buzz(14, 90);
      return;
    }

    rec.on = false;
    if (rec.raf) cancelAnimationFrame(rec.raf);
    rec.raf = 0;
    buzz(60, 120);
    const out = Recorder.end();
    Recorder.release();
    Room.close();
    awake(false);
    $('#silentBanner').hidden = true;

    try {
      if (out.dur < 6) { showTakeResult('short'); return; }

      $('#analysing').hidden = false;
      $('#anText').textContent = 'Listening back.';
      $('#anFill').style.width = '8%';
      await frame();

      const f32 = new Float32Array(out.pcm.length);
      for (let i = 0; i < out.pcm.length; i++) f32[i] = out.pcm[i] / 32768;

      // DSP.quick returns null only for digital silence. Room tone, a muted
      // microphone and an emulator's noise floor all get past it and then
      // produce a take of nought words a minute, which is a worse screen than
      // an honest one. No speech means no syllables, at any level.
      const fast = DSP.quick(f32, out.sr);
      if (!fast || fast.stats.sylTotal < 5 || fast.stats.artRate < 1.0) { showTakeResult('silent'); return; }
      $('#anFill').style.width = '35%';
      $('#anText').textContent = 'Pace and pauses done. Following your pitch.';
      await frame();

      const pit = await DSP.pitch(fast, p => {
        $('#anFill').style.width = Math.round(35 + p * 60) + '%';
      });
      const sig = DSP.merge(fast, pit);
      $('#anFill').style.width = '100%';

      const speech = Store.speech(rec.speechId);
      const prevList = Store.takesOf(rec.speechId).filter(sound);
      const prev = prevList.length ? prevList[prevList.length - 1] : null;
      const notes = Coach.notes(sig, { speech, prev, takeNumber: prevList.length + 1, marks: [] });

      const t = Store.addTake({ speechId: rec.speechId, dur: sig.dur, audience: Store.settings().audience, sig, notes });
      if (!Store.save()) toast(Store.error());

      if (Store.settings().keepAudio) {
        const ok = await Store.putAudio(t.id, out.pcm, out.sr);
        if (ok) Store.updateTake(t.id, { hasAudio: true });
      }

      closeStage();
      ctxTake = t.id;
      buzz(40, 170);
      setView('notes');
    } catch (e) {
      // A throw in here used to leave the analysing panel over the whole app
      // with no control on it at all.
      showTakeResult('error', String((e && e.name) || e));
    }
  }

  const frame = () => new Promise(r => setTimeout(r, 24));

  function discardTake() {
    rec.cancelled = true;
    if (rec.on) { rec.on = false; Recorder.end(); }
    closeStage();
    toast('Discarded. Nothing was written down.');
  }

  /* ---------------------------------------------------------- the example */

  /* Everything past the first screen used to need a working microphone. It does
     not any more: Greenroom can generate a speech-shaped sound on the phone and
     then measure it with exactly the same analysis it runs on a real take, so
     every screen, chart and note is reachable with no recording at all. The
     numbers on those screens are genuinely computed. It is labelled as an
     example wherever it appears, and it can be removed in one tap. */
  let buildingDemo = false;
  async function buildExample() {
    if (buildingDemo) return;
    const had = demoTake();
    if (had) { ctxTake = had.id; setView('notes'); return; }
    buildingDemo = true;
    busy('Building the example take.', { bar: true });
    try {
      const o = await Demo.build(p => busyAt(p * 0.62));
      busySay('Measuring it, exactly as it measures you.');
      const f32 = new Float32Array(o.pcm.length);
      for (let i = 0; i < o.pcm.length; i++) f32[i] = o.pcm[i] / 32768;
      await frame();
      const fast = DSP.quick(f32, o.sr);
      if (!fast) throw new Error('analysis');
      busyAt(0.7);
      const pit = await DSP.pitch(fast, p => busyAt(0.7 + p * 0.28));
      const sig = DSP.merge(fast, pit);

      let sp = demoSpeech();
      if (!sp) {
        sp = Store.addSpeech({ title: Demo.TITLE, occasion: 'talk' });
        Store.updateSpeech(sp.id, { demo: true });
      }
      const notes = Coach.notes(sig, { speech: sp, prev: null, takeNumber: 1, marks: [] });
      const t = Store.addTake({ speechId: sp.id, dur: sig.dur, audience: 'none', sig, notes });
      Store.updateTake(t.id, { demo: true });
      const ok = await Store.putAudio(t.id, o.pcm, o.sr);
      if (ok) Store.updateTake(t.id, { hasAudio: true });

      busyOff();
      hideMicCard();
      ctxTake = t.id;
      setView('notes');
    } catch (e) {
      busyOff();
      toast('The example could not be built on this device.');
    } finally {
      buildingDemo = false;
    }
  }

  function removeExample() {
    const sp = demoSpeech();
    Store.takes().filter(isDemo).forEach(t => Store.removeTake(t.id));
    if (sp) Store.removeSpeech(sp.id);
    if (ctxSpeech && !Store.speech(ctxSpeech)) ctxSpeech = null;
    ctxTake = null;
    stack = ['stage'];
    render();
    toast('The example is gone.');
  }

  /* ----------------------------------------------------------------- notes */

  function renderNotes() {
    try { renderNotesInner(); }
    catch (e) {
      // A half built screen with a live looking transport bar on it is worse
      // than an honest dead end with a way back.
      $('#notesHead').innerHTML = '<h2 class="notes-head">This take will not open</h2>' +
        '<p class="notes-sub">Its measurements are incomplete, so there is nothing to draw. The take itself is still listed.</p>';
      $('#notesBody').innerHTML = '';
      const b = document.createElement('button');
      b.className = 'btn ghost wide';
      b.textContent = 'Back';
      b.onclick = () => pop();
      $('#notesBody').appendChild(b);
      document.body.classList.remove('hasplayer');
    }
  }

  function renderNotesInner() {
    const t = Store.take(ctxTake);
    if (!sound(t)) { pop(); return; }
    // Set before anything can throw, so the play button and the scrubber are
    // never live looking controls pointing at nothing.
    play.takeId = t.id;
    const s = Store.speech(t.speechId);
    const st = t.sig.stats;
    const n = Store.takeNumber(t);
    $('#topTitle').textContent = (s ? s.title : 'Take') + (isDemo(t) ? '' : ', take ' + n);

    const nt = t.notes || Coach.notes(t.sig, { speech: s, takeNumber: n, marks: t.marks });
    $('#notesHead').innerHTML =
      (isDemo(t) ? '<div class="demobar">' + icon('ear') + '<span>' + esc(Demo.NOTE) + '</span></div>' : '') +
      '<p class="notes-kicker">' + icon('ear') + 'Coach\'s notes</p>' +
      '<h2 class="notes-head">' + esc(nt.headline) + '</h2>' +
      '<p class="notes-sub">' + esc(nt.sub) + '</p>' +
      '<div class="notes-rule"></div>';

    const body = $('#notesBody');
    body.innerHTML = '';
    panels = [];

    nt.priorities.forEach(p => {
      const d = document.createElement('div');
      d.className = 'pri';
      d.innerHTML =
        '<div class="prihead">' + icon(SIGNAL_ICON[p.family] || 'ear') + '<h3>' + esc(p.title) + '</h3></div>' +
        '<p>' + esc(p.body) + '</p>' +
        '<button class="evi">' + icon('play') + 'Hear it at ' + mmss(p.at) + '</button>';
      d.querySelector('.evi').onclick = () => seekTo(p.at, true);
      body.appendChild(d);
    });
    if (!nt.priorities.length) {
      const d = document.createElement('div');
      d.className = 'pri';
      d.innerHTML = '<div class="prihead">' + icon('ear') + '<h3>Nothing to correct in this one</h3></div>' +
        '<p>Pace, pauses, pitch and level all sit inside the ranges a room follows comfortably. Do it again and see whether it repeats.</p>';
      body.appendChild(d);
    }

    const k = document.createElement('p');
    k.className = 'keep';
    k.innerHTML = '<b>Keep: ' + esc(nt.keepTitle) + '</b> ' + esc(nt.keepBody);
    body.appendChild(k);

    panel(body, 'pace', 'Pace', st.wpm + ' wpm',
      'A syllable a fifth of a second apart is the fastest a room can follow. This curve is words a minute across the take, estimated from ' + st.sylTotal + ' syllable peaks at ' + DSP.SYL_PER_WORD + ' syllables a word. The shaded band is the range most audiences follow without effort.',
      cv => Charts.pace(cv, t.sig),
      [mmss(t.sig.t0), mmss(t.sig.t1)],
      [st.artWpm <= 400 ? 'Articulation ' + st.artWpm + ' wpm' : 'Articulation too broken up to read',
       st.sylTotal + ' syllables', Math.round(st.speechSec) + 's of speech'],
      st.sylTotal > 1 ? null : 'There were not enough syllable peaks in this take to draw a curve from.');

    panel(body, 'pause', 'Pauses', st.braveCount + ' over a second',
      'Every silence longer than three tenths of a second, drawn as a gap in the line you were speaking on. The bars above it are how long each one lasted. Around two a minute is a speaker who trusts the room.',
      cv => Charts.pauses(cv, t.sig),
      [mmss(t.sig.t0), mmss(t.sig.t1)],
      [st.pauseCount + ' pauses', st.bravePerMin.toFixed(1) + ' a minute over 1s', 'longest ' + st.longestPause.toFixed(1) + 's']);

    if (t.sig.pitch) {
      panel(body, 'pitch', 'Pitch', (st.semiSd === null ? '-' : st.semiSd.toFixed(1)) + ' semitones',
        'How far your voice moved either side of its own centre, measured on the recording rather than compared to anyone else. Shaded blocks are stretches of ten seconds or more where it barely moved.',
        cv => Charts.pitch(cv, t.sig),
        [mmss(t.sig.t0), mmss(t.sig.t1)],
        [st.voicedPct + '% voiced', (st.monoSec || 0) + 's flat', (st.semiSd >= 2.2 ? 'lively' : st.semiSd >= 1.5 ? 'steady' : 'close to level')],
        st.voicedPct > 0 ? null : 'Nothing in this take held a pitch long enough to follow. That usually means a whisper, a very noisy room, or a microphone that was covered.');
    }

    panel(body, 'level', 'Level', st.dynRange.toFixed(0) + ' dB range',
      'Loudness across the take, in your own units. Absolute volume depends on how far you held the phone, so Greenroom only compares you to yourself. Shaded blocks are stretches at least eight decibels under your own middle.',
      cv => Charts.level(cv, t.sig),
      [mmss(t.sig.t0), mmss(t.sig.t1)],
      [Math.round(st.quietSec) + 's quiet',
       Math.abs(st.endDrop) < 0.5 ? 'ending at the same level'
         : st.endDrop > 0 ? 'ending ' + st.endDrop.toFixed(0) + ' dB down'
         : 'ending ' + (-st.endDrop).toFixed(0) + ' dB up'],
      (t.sig.env && t.sig.env.length) ? null : 'The loudness contour for this take was not stored.');

    const acts = document.createElement('div');
    acts.className = 'actions';
    acts.innerHTML =
      (isDemo(t) ? '' : '<button class="btn ghost" id="nCompare">Compare</button>') +
      '<button class="btn ghost" id="nExport">Export audio</button>' +
      '<button class="btn danger" id="nDelete">' + (isDemo(t) ? 'Remove the example' : 'Delete take') + '</button>';
    body.appendChild(acts);
    if ($('#nCompare')) $('#nCompare').onclick = () => pickCompare(Store.takesOf(t.speechId).filter(sound), t.id);
    $('#nExport').onclick = () => exportTake(t);
    $('#nDelete').onclick = () => isDemo(t)
      ? confirmSheet('Remove the example?', 'It can be built again from Settings at any time.', 'Remove', () => {
          closeSheets(); removeExample();
        })
      : confirmSheet('Delete take ' + n + '?',
      'The recording and its notes go with it. Nothing here is recoverable.', 'Delete', () => {
        Store.removeTake(t.id);
        closeSheets();
        pop();
      });

    const nn = document.createElement('p');
    nn.className = 'plain';
    nn.textContent = 'Greenroom counts syllables, silences, pitch and level. It does not transcribe you, so it cannot count filler words on its own. Play the take back and tap Mark every time you hear one, and the notes will use them.';
    body.appendChild(nn);

    updateMarkBtn(t);
    setupPlayer(t);
  }

  /** One expandable signal. `empty` replaces the chart with a sentence when
      there is genuinely nothing to draw, so a panel never opens onto a void. */
  function panel(parent, key, title, value, blurb, drawFn, axis, pills, empty) {
    const d = document.createElement('div');
    d.className = 'panel';
    d.innerHTML =
      '<button class="panel-head">' + icon(SIGNAL_ICON[key] || 'ear') + '<b>' + esc(title) + '</b>' +
      '<span class="pvwrap"><span class="pv">' + esc(value) + '</span>' + icon('chev') + '</span></button>' +
      '<div class="panel-body">' +
      (empty ? '<p class="nochart">' + esc(empty) + '</p>'
             : '<div class="chart"><canvas></canvas>' +
               '<div class="axis"><span>' + esc(axis[0]) + '</span><span>' + esc(axis[1]) + '</span></div></div>') +
      '<p>' + esc(blurb) + '</p>' +
      '<div class="pillrow">' + pills.map(p => '<span class="tpill">' + esc(p) + '</span>').join('') + '</div></div>';
    parent.appendChild(d);
    const cv = d.querySelector('canvas');
    d.querySelector('.panel-head').onclick = () => {
      const wasOpen = d.classList.contains('open');
      d.classList.toggle('open');
      if (!wasOpen && cv) requestAnimationFrame(() => drawFn(cv));
    };
    // Rotating the phone changes every canvas width, so an open panel keeps a
    // way to redraw itself rather than showing a stretched bitmap.
    panels.push(() => { if (cv && d.classList.contains('open')) drawFn(cv); });
    return d;
  }
  let panels = [];

  /* ---------------------------------------------------------------- player */

  let play = { takeId: null, pcm: null, sr: 16000, raf: 0, pos: 0, dur: 0 };
  let ab = { pcmA: null, pcmB: null, on: 'a', frac: 0, raf: 0, token: null };

  async function setupPlayer(t) {
    play = { takeId: t.id, pcm: null, sr: 16000, raf: 0, pos: 0, dur: t.dur };
    updateMarkBtn(t);
    drawWave(t);
    const a = await Store.getAudio(t.id);
    if (play.takeId !== t.id) return;
    if (a) { play.pcm = a.pcm; play.sr = a.sr; }
  }

  function drawWave(t) {
    const cv = $('#waveCanvas');
    Charts.wave(cv, t.sig, { pos: play.pos, marks: t.marks });
    const w = cv.clientWidth || 1;
    $('#playhead').style.left = Math.round((play.pos / Math.max(0.1, t.sig.dur)) * w) + 'px';
    $('#tNow').textContent = mmss(play.pos);
  }

  function stopPlayback() {
    Recorder.stop();
    if (play.raf) cancelAnimationFrame(play.raf);
    play.raf = 0;
    // The compare screen runs a second loop against the same audio context, and
    // leaving it running kept a frame callback alive for the life of the app.
    if (ab.raf) cancelAnimationFrame(ab.raf);
    ab.raf = 0;
    const b = $('#playBtn');
    if (b) b.innerHTML = '<svg><use href="#i-play"/></svg>';
  }

  function togglePlay() {
    const t = Store.take(play.takeId);
    if (!t) { toast('There is no take open to play.'); return; }
    if (Recorder.playing()) { stopPlayback(); afterPause(t); return; }
    if (!play.pcm) {
      toast(t.hasAudio ? 'That audio is still loading.' : 'The audio for this take is not on this phone any more. The notes stay.');
      return;
    }
    if (play.pos >= play.dur - 0.2) play.pos = t.sig.t0;
    if (!Recorder.play(play.pcm, play.sr, play.pos, () => { stopPlayback(); play.pos = 0; drawWave(t); afterPause(t); })) {
      toast('This device would not play the take back.');
      return;
    }
    $('#playBtn').innerHTML = '<svg><use href="#i-pause"/></svg>';
    const step = () => {
      play.raf = requestAnimationFrame(step);
      play.pos = Recorder.position();
      drawWave(t);
    };
    step();
  }

  function seekTo(t0, andPlay) {
    const t = Store.take(play.takeId);
    if (!t) { toast('There is no take open.'); return; }
    play.pos = Math.max(0, Math.min(play.dur - 0.2, t0));
    drawWave(t);
    if (andPlay) {
      if (Recorder.playing()) stopPlayback();
      if (play.pcm) togglePlay();
      else toast('The audio for this take is not on this phone any more. The timings below still hold.');
    }
  }

  let pendingMarks = false;
  let markT = 0;
  function afterPause(t) {
    if (!pendingMarks) return;
    pendingMarks = false;
    const s = Store.speech(t.speechId);
    const list = Store.takesOf(t.speechId);
    const i = list.findIndex(x => x.id === t.id);
    const notes = Coach.notes(t.sig, {
      speech: s, prev: i > 0 ? list[i - 1] : null, takeNumber: i + 1, marks: t.marks
    });
    Store.updateTake(t.id, { notes });
    if (current() === 'notes') renderNotes();
    toast('Notes updated with your ' + t.marks.length + ' marks.');
  }

  function updateMarkBtn(t) {
    const b = $('#markBtn');
    b.innerHTML = t.marks.length ? 'Mark<br><small>' + t.marks.length + ' so far</small>' : 'Mark<br><small>filler</small>';
  }

  function markFiller() {
    const t = Store.take(play.takeId);
    if (!t) { toast('There is no take open to mark.'); return; }
    if (!play.pcm) {
      toast(t.hasAudio ? 'The audio is still loading. Marking needs it.'
                       : 'Marking needs the recording, and this one is not on the phone any more.');
      return;
    }
    const at = +play.pos.toFixed(2);
    if (t.marks.some(m => Math.abs(m - at) < 0.4)) {
      toast('There is already a mark at ' + mmss(at) + '. Play on and mark the next one.');
      return;
    }
    t.marks.push(at);
    Store.updateTake(t.id, { marks: t.marks });
    pendingMarks = true;
    updateMarkBtn(t);
    drawWave(t);
    buzz(12, 110);
    // Marking while the take is paused is how you audit one passage. Fold those
    // marks in once the tapping stops, rather than only after the next play.
    clearTimeout(markT);
    if (!Recorder.playing()) markT = setTimeout(() => { const c = Store.take(t.id); if (c) afterPause(c); }, 1400);
  }

  /* --------------------------------------------------------------- compare */

  function pickCompare(takes, fixedId) {
    if (takes.length < 2) { toast('Compare needs two takes of the same speech.'); return; }
    $('#pickTitle').textContent = 'Compare with';
    const body = $('#pickBody');
    body.innerHTML = '';
    const base = fixedId ? Store.take(fixedId) : takes[takes.length - 1];
    takes.slice().reverse().forEach(t => {
      if (base && t.id === base.id) return;
      const b = document.createElement('button');
      b.className = 'pickrow';
      b.innerHTML = 'Take ' + Store.takeNumber(t) +
        '<small>' + ago(t.at) + ' \u00b7 ' + dur(t.dur) + ' \u00b7 ' + t.sig.stats.wpm + ' wpm</small>';
      b.onclick = () => {
        cmp = { a: base.id, b: t.id };
        closeSheets();
        setView('compare');
      };
      body.appendChild(b);
    });
    sheet('#pickSheet', true);
  }

  function renderCompare() {
    if (!cmp) { pop(); return; }
    const A = Store.take(cmp.a), B = Store.take(cmp.b);
    if (!A || !B) { pop(); return; }
    const s = Store.speech(A.speechId);
    $('#topTitle').textContent = 'Take ' + Store.takeNumber(A) + ' and take ' + Store.takeNumber(B);

    const rows = [
      ['Words a minute', A.sig.stats.wpm, B.sig.stats.wpm, 'toward130'],
      ['Pauses over a second', A.sig.stats.braveCount, B.sig.stats.braveCount, 'up'],
      ['Pitch movement, semitones', A.sig.stats.semiSd, B.sig.stats.semiSd, 'up'],
      ['Quiet stretches, seconds', Math.round(A.sig.stats.quietSec), Math.round(B.sig.stats.quietSec), 'down'],
      ['Length', A.dur, B.dur, 'none']
    ];

    const fmt = (v, k) => (k === 'Length' ? dur(v) : (v === null || v === undefined ? '-' : (typeof v === 'number' && v % 1 ? v.toFixed(1) : v)));

    $('#compareBody').innerHTML =
      (s && s.title ? '<p class="label" style="display:block;margin:0 0 12px">' + esc(s.title) + '</p>' : '') +
      '<div class="cmp">' +
        '<div class="cl"><i></i>Take ' + Store.takeNumber(A) + ', ' + ago(A.at) + '</div>' +
        '<div class="cl b"><i></i>Take ' + Store.takeNumber(B) + ', ' + ago(B.at) + '</div>' +
        '<h3 style="margin-top:12px">Pace across the take</h3><canvas id="cmpCv"></canvas>' +
        '<p class="hint">The two takes are stretched to the same width. Greenroom does not transcribe, so it lines them up by position rather than by word.</p>' +
      '</div>' +
      '<div class="card">' +
        rows.map(r => '<div class="delta"><span>' + esc(r[0]) + '</span><b>' + fmt(r[1], r[0]) +
          '<em>then</em>' + fmt(r[2], r[0]) + '</b></div>').join('') +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn" id="abPlay">Play take ' + Store.takeNumber(A) + '</button>' +
        '<button class="btn ghost" id="abFlip">Switch</button>' +
      '</div>' +
      '<p class="hint" style="margin-top:14px">Switch keeps your place. If you are a third of the way through one take, you land a third of the way through the other.</p>';

    requestAnimationFrame(() => Charts.two($('#cmpCv'), A.sig, B.sig));

    // Each compare screen gets a token: audio that arrives after you have moved
    // on belongs to the pair that asked for it, not to whatever is on screen.
    const token = {};
    ab = { pcmA: null, pcmB: null, on: 'a', frac: 0, raf: 0, token: token };
    Store.getAudio(A.id).then(r => { if (r && ab.token === token) ab.pcmA = r; });
    Store.getAudio(B.id).then(r => { if (r && ab.token === token) ab.pcmB = r; });

    $('#abPlay').onclick = () => abPlay(A, B);
    $('#abFlip').onclick = () => { ab.on = ab.on === 'a' ? 'b' : 'a'; abPlay(A, B, true); };
  }

  function abPlay(A, B, keep) {
    const which = ab.on === 'a' ? { t: A, a: ab.pcmA } : { t: B, a: ab.pcmB };
    if (Recorder.playing() && !keep) {
      Recorder.stop();
      if (ab.raf) cancelAnimationFrame(ab.raf);
      ab.raf = 0;
      $('#abPlay').textContent = 'Play take ' + Store.takeNumber(which.t);
      return;
    }
    if (!which.a) { toast('That take has no audio on this phone any more.'); return; }
    const span = which.t.sig.t1 - which.t.sig.t0;
    const from = which.t.sig.t0 + ab.frac * span;
    Recorder.stop();
    if (ab.raf) cancelAnimationFrame(ab.raf);
    Recorder.play(which.a.pcm, which.a.sr, from, () => {
      if (ab.raf) cancelAnimationFrame(ab.raf);
      ab.raf = 0;
      $('#abPlay').textContent = 'Play take ' + Store.takeNumber(which.t);
    });
    $('#abPlay').textContent = 'Playing take ' + Store.takeNumber(which.t);
    const step = () => {
      ab.raf = requestAnimationFrame(step);
      const p = Recorder.position();
      ab.frac = Math.max(0, Math.min(1, (p - which.t.sig.t0) / Math.max(0.1, span)));
    };
    step();
  }

  /* -------------------------------------------------------------- progress */

  function renderProgress() {
    const all = realTakes().filter(sound).slice().sort((a, b) => a.at - b.at);
    const body = $('#progressBody');
    if (all.length < 2) {
      body.innerHTML =
        '<div class="empty">' + PROGRESS_ART +
        '<p class="empty-title">Two takes and this fills in.</p>' +
        '<p class="empty-body">Progress compares takes across every speech: how your pace settles, whether you get braver with silence, and how much life stays in your voice. It needs a couple of takes before it can say anything true.</p></div>';
      return;
    }
    const recent = all.slice(-14);
    const totalSec = all.reduce((n, t) => n + t.dur, 0);
    const marks = all.filter(t => t.marks.length);

    const series = [
      { k: 'Pace', v: recent.map(t => t.sig.stats.wpm), unit: ' wpm',
        note: 'A settled speaker lands between 110 and 160. The number matters less than the line going flat.' },
      { k: 'Pauses over a second, per minute', v: recent.map(t => t.sig.stats.bravePerMin), unit: '',
        note: 'The bravery metric. Going up is the single fastest change an audience notices.' },
      { k: 'Pitch movement, semitones', v: recent.map(t => t.sig.stats.semiSd === null ? 0 : t.sig.stats.semiSd), unit: '',
        note: 'How far your voice travels either side of its own centre. Two to four keeps a room looking up.' },
      { k: 'Quiet stretches, seconds', v: recent.map(t => t.sig.stats.quietSec), unit: 's',
        note: 'Seconds spent well under your own middle. Down is good.' }
    ];
    if (marks.length >= 2) {
      series.push({
        k: 'Marked fillers per minute',
        v: marks.slice(-14).map(t => +(t.marks.length / (t.dur / 60)).toFixed(2)), unit: '',
        note: 'Only from takes where you played back and tapped Mark. Greenroom never counts these by itself.'
      });
    }

    const first = all[0], last = all[all.length - 1];
    body.innerHTML =
      '<div class="card">' +
        '<div class="stat">' +
          '<div><b>' + all.length + '</b><span>takes</span></div>' +
          '<div><b>' + dur(totalSec) + '</b><span>rehearsed</span></div>' +
          '<div><b>' + Store.speeches().filter(x => !isDemo(x)).length + '</b><span>speeches</span></div>' +
        '</div>' +
        '<p class="hint">First take ' + ago(first.at) + '. Most recent ' + ago(last.at) + '.</p>' +
      '</div>' +
      series.map((s, i) => {
        const a = s.v[0], b = s.v[s.v.length - 1];
        const d = b - a;
        return '<div class="card"><div class="row-top"><span class="row-title" style="font-size:15.5px">' + esc(s.k) + '</span>' +
          '<span class="row-right">' + (d === 0 ? 'level' : (d > 0 ? '+' : '') + (Math.abs(d) < 10 ? d.toFixed(1) : Math.round(d))) + '</span></div>' +
          '<div class="row-spark" style="margin-top:12px"><canvas data-series="' + i + '" style="height:44px"></canvas></div>' +
          '<p class="hint">' + esc(s.note) + '</p></div>';
      }).join('') +
      milestones(all);

    requestAnimationFrame(() => {
      $$('#progressBody canvas[data-series]').forEach(cv => {
        Charts.spark(cv, series[+cv.dataset.series].v, { h: 44 });
      });
    });
  }

  /* Two takes of the same speech drawn as waveforms, with the line the second
     one drew across the first. It is the picture the screen makes once there
     is data, so the empty state promises the real thing. */
  const PROGRESS_ART =
    '<svg viewBox="0 0 190 130" role="img" aria-label="Two takes drawn side by side with a rising line between them">' +
    '<defs>' +
    '<linearGradient id="pg-a" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#2E6247"/><stop offset="1" stop-color="#1B4230"/></linearGradient>' +
    '<linearGradient id="pg-b" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#FFD79A"/><stop offset="1" stop-color="#F5B44C"/></linearGradient>' +
    '</defs>' +
    '<g fill="url(#pg-a)">' +
    [7, 15, 24, 11, 19, 9, 21, 13].map((h, i) =>
      '<rect x="' + (17 + i * 9) + '" y="' + (48 - h) + '" width="4.6" height="' + (h * 2) + '" rx="2.3"/>').join('') +
    '</g>' +
    '<g fill="url(#pg-b)">' +
    [11, 22, 15, 27, 18, 25, 13, 20].map((h, i) =>
      '<rect x="' + (105 + i * 9) + '" y="' + (48 - h) + '" width="4.6" height="' + (h * 2) + '" rx="2.3"/>').join('') +
    '</g>' +
    '<path d="M14 88h162" stroke="#1E4A35" stroke-width="1.4" stroke-linecap="round" fill="none"/>' +
    '<path d="M24 108 L68 104 L112 97 L166 88" stroke="#F5B44C" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
    '<circle cx="166" cy="88" r="4" fill="#FFD79A"/>' +
    '<text x="17" y="126" fill="#7FA08D" font-size="9.5" font-weight="700" letter-spacing="1.6">TAKE 1</text>' +
    '<text x="105" y="126" fill="#9DB8A8" font-size="9.5" font-weight="700" letter-spacing="1.6">TAKE 8</text>' +
    '</svg>';

  function milestones(all) {
    const out = [];
    const brave = all.find(t => t.sig.stats.braveCount >= 5);
    if (brave) out.push('First take with five pauses over a second: take ' + Store.takeNumber(brave) + ', ' + ago(brave.at) + '.');
    const long = all.slice().sort((a, b) => b.dur - a.dur)[0];
    if (long) out.push('Longest take so far: ' + dur(long.dur) + '.');
    const steady = all.filter(t => t.sig.stats.wpm >= 110 && t.sig.stats.wpm <= 160).length;
    if (steady) out.push(steady + ' of ' + all.length + ' takes landed in the comfortable pace band.');
    const days = new Set(all.map(t => new Date(t.at).toDateString())).size;
    out.push('You have rehearsed on ' + days + (days === 1 ? ' day.' : ' separate days.'));
    return '<div class="card"><div class="label" style="margin-bottom:10px">Along the way</div>' +
      out.map(x => '<p style="font-size:14.5px;color:var(--muted);line-height:1.5;margin-bottom:8px">' + esc(x) + '</p>').join('') + '</div>';
  }

  /* -------------------------------------------------------------- settings */

  function renderSettings() {
    const s = Store.settings();
    const body = $('#settingsBody');
    const rows = [
      ['haptics', 'Haptics', 'A pulse on the countdown, on stop, and when you mark a filler.'],
      ['countdown', 'Three second countdown', 'Time to get the phone where you want it before the take starts.'],
      ['meters', 'Live meters while recording', 'Clock, pace and a silence light. Turn them off if watching numbers changes how you speak.'],
      ['keepAudio', 'Keep the recording', 'Off means Greenroom analyses the take and throws the audio away. The notes and charts stay either way.']
    ];
    body.innerHTML =
      rows.map(r => '<div class="setrow"><div><div class="st">' + r[1] + '</div><div class="sd">' + r[2] + '</div></div>' +
        '<button class="tog' + (s[r[0]] ? ' on' : '') + '" data-set="' + r[0] + '" role="switch" aria-checked="' + !!s[r[0]] + '"><i></i></button></div>').join('') +
      '<div class="setrow"><div><div class="st">Fixed teleprompter speed</div><div class="sd">Used when the prompter is set to a fixed rate.</div></div>' +
        '<input class="input" id="setWpm" type="number" min="60" max="220" value="' + s.scrollWpm + '" style="width:96px;text-align:center"></div>' +
      '<div class="setrow"><div><div class="st">Stored recordings</div><div class="sd" id="setBytes">counting</div></div>' +
        '<button class="btn ghost" id="setTrim" style="padding:9px 14px;font-size:13.5px" disabled>Clear audio</button></div>' +
      '<div class="setrow"><div><div class="st">Example take</div><div class="sd">' +
        'A speech-shaped sound Greenroom builds on this phone and then measures with the same analysis it runs on you. ' +
        'It is how every screen can be seen without recording anything. It is not a recording of a person.</div></div>' +
        '<button class="btn ghost" id="setDemo" style="padding:9px 14px;font-size:13.5px">' +
        (demoTake() ? 'Remove' : 'Build it') + '</button></div>' +
      '<div class="setrow"><div><div class="st">Export everything</div><div class="sd">Your speeches, takes and every measurement, as one JSON file.</div></div>' +
        '<button class="btn ghost" id="setExport" style="padding:9px 14px;font-size:13.5px">Export</button></div>' +
      '<div class="setrow"><div><div class="st">Delete everything</div><div class="sd">Speeches, takes, recordings and settings. There is no copy anywhere else.</div></div>' +
        '<button class="btn danger" id="setWipe" style="padding:9px 14px;font-size:13.5px">Delete</button></div>' +
      '<p class="setnote"><b>What Greenroom measures.</b> Syllable peaks in the loudness contour, every silence over three tenths of a second, the pitch of your voice against its own centre, and how steady your level stayed. All of it on this phone, from the recording, with no network permission in the app at all.</p>' +
      '<p class="setnote"><b>What it does not do.</b> It does not transcribe you, so it cannot count filler words, spot repeated phrases or read your structure. Play a take back and tap Mark to count fillers yourself. It has no camera feature, so it says nothing about eye contact. Words a minute is an estimate from syllable count at ' + DSP.SYL_PER_WORD + ' syllables a word, not a transcript.</p>' +
      '<p class="setnote">Greenroom is a practice tool, not therapy and not a medical device. If speaking in public is causing you real distress, that is worth taking to a person rather than an app.</p>';

    $$('#settingsBody .tog').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.set;
        Store.set(k, !Store.settings()[k]);
        b.classList.toggle('on');
        b.setAttribute('aria-checked', String(Store.settings()[k]));
        buzz(10, 90);
      };
    });
    $('#setWpm').onchange = e => {
      const v = parseInt(e.target.value, 10);
      Store.set('scrollWpm', isFinite(v) ? Math.max(60, Math.min(220, v)) : 130);
      e.target.value = Store.settings().scrollWpm;
    };
    // A live looking button over an empty set is a button that does nothing.
    Store.audioBytes().then(n => {
      const held = Store.takes().filter(t => t.hasAudio).length;
      $('#setBytes').textContent = n > 0
        ? (n / 1048576).toFixed(1) + ' MB across ' + held + (held === 1 ? ' take' : ' takes')
        : 'No recordings stored';
      const trim = $('#setTrim');
      if (trim) trim.disabled = !(n > 0);
    });
    $('#setDemo').onclick = () => {
      if (demoTake()) {
        confirmSheet('Remove the example?', 'It can be built again here at any time.', 'Remove', () => {
          closeSheets(); removeExample();
        });
      } else {
        closeSheets();
        buildExample();
      }
    };
    $('#setTrim').onclick = () => confirmSheet('Clear stored audio?',
      'Every recording is deleted from this phone. The notes, the charts and the numbers all stay.', 'Clear audio', async () => {
        for (const t of Store.takes()) { if (t.hasAudio) { await Store.dropAudio(t.id); Store.updateTake(t.id, { hasAudio: false }); } }
        closeSheets();
        toast('Recordings cleared. The notes are still here.');
      });
    $('#setExport').onclick = () => exportAll();
    $('#setWipe').onclick = () => confirmSheet('Delete everything?',
      'Every speech, take, recording and setting on this phone. Export first if you want a copy.', 'Delete it all', () => {
        Store.wipe();
        closeSheets();
        ctxSpeech = ctxTake = null;
        stack = ['stage'];
        render();
        toast('All clear.');
      });
  }

  /* ---------------------------------------------------------------- export */

  function b64(buf) {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return btoa(s);
  }

  function deliver(name, mime, buf) {
    // In the app, the shell is the only thing that can write a file. Claiming a
    // download the shell never made is worse than saying it did not work.
    if (window.Native && window.Native.saveFile) {
      let uri = '';
      try { uri = window.Native.saveFile(name, mime, b64(buf)); } catch (e) { uri = ''; }
      if (uri) toast('Saved to Downloads as ' + name);
      else toast('Android would not let Greenroom write to Downloads, so nothing was saved.');
      return;
    }
    const blob = new Blob([buf], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Saved ' + name);
  }

  async function exportTake(t) {
    const a = await Store.getAudio(t.id);
    if (!a) { toast('There is no audio stored for this take.'); return; }
    const s = Store.speech(t.speechId);
    const name = (s ? s.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() : 'take') + '-take-' + Store.takeNumber(t) + '.wav';
    deliver(name, 'audio/wav', Recorder.wav(a.pcm, a.sr));
  }

  function exportAll() {
    const text = Store.exportAll();
    const buf = new TextEncoder().encode(text);
    deliver('greenroom-export.json', 'application/json', buf.buffer);
  }

  /* ------------------------------------------------------------------ intro */

  function showIntro() {
    const g = $('#occGrid');
    g.innerHTML = '';
    Content.OCCASIONS.forEach(o => {
      const b = document.createElement('button');
      b.innerHTML = '<b>' + esc(o.name) + '</b><span>' + esc(o.blurb) + '</span>';
      b.onclick = () => {
        const s = Store.addSpeech({ title: defaultTitle(o.id), occasion: o.id });
        ctxSpeech = s.id;
        Store.markSeen('intro', true);
        closeSheets();
        render();
        toast('Made a speech called ' + s.title + '. Rename it any time.');
      };
      g.appendChild(b);
    });
    sheet('#introSheet', true);
  }

  /* ------------------------------------------------------------------ wiring */

  function wire() {
    $$('#tabs button').forEach(b => b.onclick = () => setView(b.dataset.tab));
    $('#busyCancel').onclick = () => { const f = busyCancelFn; busyOff(); if (f) f(); };
    $('#introSkip').onclick = () => { Store.markSeen('intro', true); closeSheets(); render(); };
    $('#introDemo').onclick = () => { Store.markSeen('intro', true); closeSheets(); buildExample(); };
    $('#topBack').onclick = () => pop();
    $('#topSettings').onclick = () => { renderSettings(); sheet('#settingsSheet', true); };
    $('#scrim').onclick = () => closeSheets();
    $$('[data-close]').forEach(b => b.onclick = () => closeSheets());

    $('#recBtn').onclick = () => startTake();
    $('#recDemo').onclick = () => buildExample();
    $('#stopBtn').onclick = () => { finishTake().catch(e => showTakeResult('error', String((e && e.name) || e))); };
    $('#cancelBtn').onclick = () => discardTake();
    $('#metersToggle').onclick = () => {
      const on = !Store.settings().meters;
      Store.set('meters', on);
      $('#meters').classList.toggle('hidden', !on);
      $('#metersToggle').textContent = on ? 'Hide meters' : 'Show meters';
    };

    $('#newSpeechBtn').onclick = () => openSpeechSheet(null);
    $('#emptyNewBtn').onclick = () => openSpeechSheet(null);
    $('#spSave').onclick = () => saveSpeechSheet();
    $('#spDelete').onclick = () => {
      const s = editingSpeech;
      if (!s) return;
      const n = Store.takesOf(s.id).length;
      confirmSheet('Delete ' + s.title + '?',
        n ? 'Its ' + n + (n === 1 ? ' take goes' : ' takes go') + ' with it, recordings and notes included. Nothing here is recoverable.'
          : 'There are no takes in it yet. Nothing else goes with it.',
        'Delete', () => {
          Store.removeSpeech(s.id);
          editingSpeech = null;
          if (ctxSpeech === s.id) ctxSpeech = null;
          closeSheets();
          stack = ['speeches'];
          render();
          toast('Deleted ' + s.title + '.');
        });
    };
    $('#editScriptBtn').onclick = () => {
      const s = activeSpeech();
      // With no speech there is nothing to attach a script to, so the link does
      // the only useful thing instead of telling the user off.
      if (!s) { openSpeechSheet(null); return; }
      openScript(s);
    };
    $('#scriptSave').onclick = () => {
      if (!editingSpeech) return;
      Store.updateSpeech(editingSpeech.id, { script: $('#scriptText').value });
      closeSheets();
      render();
      toast('Script saved.');
    };
    $$('#scriptSeg button').forEach(b => b.onclick = () => { Store.set('scroll', b.dataset.scroll); renderStage(); });

    $('#cfGo').onclick = () => { const f = confirmFn; confirmFn = null; if (f) f(); };

    $('#playBtn').onclick = () => togglePlay();
    $('#markBtn').onclick = () => markFiller();
    $('#waveCanvas').onclick = e => {
      const r = e.currentTarget.getBoundingClientRect();
      const t = Store.take(play.takeId);
      if (!t) return;
      const frac = (e.clientX - r.left) / r.width;
      seekTo(frac * t.sig.dur, Recorder.playing());
    };

    // The prompter can be dragged back if the auto scroll drifts off your place.
    const pr = $('#prompter');
    let dragY = 0;
    pr.addEventListener('touchstart', e => { rec.drag = true; dragY = e.touches[0].clientY; }, { passive: true });
    pr.addEventListener('touchmove', e => {
      if (!rec.drag) return;
      const dy = e.touches[0].clientY - dragY;
      dragY = e.touches[0].clientY;
      rec.scrollY = Math.max(0, rec.scrollY - dy);
      $('#prompterInner').style.transform = 'translateY(' + (-rec.scrollY) + 'px)';
    }, { passive: true });
    pr.addEventListener('touchend', () => { setTimeout(() => { rec.drag = false; }, 400); }, { passive: true });

    window.addEventListener('resize', () => {
      if (current() === 'notes') {
        const t = Store.take(play.takeId);
        if (t) drawWave(t);
        panels.forEach(f => f());
      }
      if (current() === 'compare' && cmp) {
        const A = Store.take(cmp.a), B = Store.take(cmp.b);
        if (A && B && $('#cmpCv')) Charts.two($('#cmpCv'), A.sig, B.sig);
      }
    });
  }

  /* ------------------------------------------------------------------ shell */

  function back() {
    // Back during a wait cancels the wait rather than moving the screen behind it.
    if (!$('#busy').hidden) {
      const f = busyCancelFn;
      busyOff();
      if (f) f();
      return true;
    }
    if (!$('#rehearse').hidden) {
      if (rec.on) { toast('Tap the square to finish, or Discard to bin it.'); return true; }
      discardTake();
      return true;
    }
    if (openSheet) { closeSheets(); return true; }
    return pop();
  }

  function onPause() {
    if (rec.on) {
      // Going to the background ends the take. Android stops handing the
      // microphone to a page that is not on screen, so a take left running
      // would keep a clock and a meter moving over nothing. Under six seconds
      // there is nothing in it to read, so it goes rather than waits.
      if ((performance.now() - rec.t0) / 1000 < 6) { discardTake(); return; }
      finishTake().catch(() => closeStage());
      return;
    }
    // Backgrounded during the countdown: there is no take yet, so bin the
    // attempt rather than start recording into a pocket.
    if (!$('#rehearse').hidden) { discardTake(); return; }
    stopPlayback();
  }

  function onResume() { /* nothing to restore: state is written as it happens */ }

  /* ------------------------------------------------------------------- init */

  function init() {
    wire();
    render();
    // Tell the inline boot guard the app is live, so any tap taken during the
    // load is replayed rather than lost.
    if (window.__grReady) window.__grReady();
    if (!Store.seen().intro && !Store.speeches().length) setTimeout(showIntro, 260);
  }

  function boot() {
    try { init(); }
    catch (e) {
      if (window.__grFailed) window.__grFailed((e && e.message) || String(e));
      else throw e;
    }
  }

  // A rejection that reaches here means some await threw with nobody listening.
  // Whatever it was, the record button must not stay dead because of it.
  window.addEventListener('unhandledrejection', () => {
    const b = $('#recBtn');
    if (b) b.disabled = false;
    busyOff();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return {
    back, onPause, onResume,
    setView, showIntro, renderStage, renderNotes, renderProgress,
    openSpeechSheet, pickCompare, seekTo, togglePlay, markFiller,
    startTake, finishTake, discardTake, toast,
    // The shell stops the arming clock while a system permission dialog is up,
    // so reading the dialog is never charged against the app's patience.
    _micPrompt: on => {
      try { Recorder.promptOpen(!!on); } catch (e) {}
      busySay(on ? 'Waiting for your answer to the microphone request.' : 'Opening the microphone.');
    },
    _saveFailed: () => toast('Android would not let Greenroom write that file.'),
    buildExample, removeExample,
    _open: (id) => { ctxTake = id; setView('notes'); },
    _speech: (id) => { ctxSpeech = id; setView('speech'); },
    _cmp: (a, b) => { cmp = { a: a, b: b }; setView('compare'); },
    _settings: () => { renderSettings(); sheet('#settingsSheet', true); },
    _sheet: sheet
  };
})();

/* A top-level const is not a window property, and the Android shell reaches for
   window.App to hand it the Back gesture. */
window.App = App;
