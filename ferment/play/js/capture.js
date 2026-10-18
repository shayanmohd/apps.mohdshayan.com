/* The capture screen. A live camera with the last photograph ghosted over it so every shot in a
   series lines up, plus the height marks that turn a jar photo into a rise measurement.
   There is no computer vision here. You place the lines; the app does the arithmetic. */

const Capture = (() => {
  const $ = s => document.querySelector(s);
  let stream = null, owner = null, ctx = null, mode = 'journal', ghostOn = true;
  let marks = { bottom: 0.82, base: 0.55, now: 0.34 };
  let dragging = null, onDone = null, ready = false;
  /* Writing a photograph is asynchronous. Two taps inside that window used to save two copies
     and then throw, because the second landed after the screen had closed and cleared its owner. */
  let saving = false;

  const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const el = {};

  function bind() {
    el.screen = $('#s-capture');
    el.video = $('#camVideo');
    el.ghost = $('#camGhost');
    el.frame = $('#camFrame');
    el.marks = $('#camMarks');
    el.title = $('#capTitle');
    el.sub = $('#capSub');
    el.read = $('#capRead');
    el.shutter = $('#capShoot');
    el.chips = $('#capModes');
    el.fallback = $('#capFallback');
    el.fbNote = $('#capFbNote');
    el.file = $('#capFile');
    el.ghostBtn = $('#capGhostBtn');
    el.stage = $('#capStage');
  }

  /* ---------- open and close ---------- */
  function open(o) {
    bind();
    owner = o.owner; ctx = o; onDone = o.onDone || null;
    mode = o.mode || 'journal';
    ready = false; saving = false;
    if (owner && owner.riseRef) {
      marks.bottom = owner.riseRef.bottomY;
      marks.base = owner.riseRef.baseY;
      marks.now = Math.max(0.04, owner.riseRef.baseY - 0.12);
    } else {
      // Otherwise the lines would open where the last jar left them.
      marks = { bottom: 0.82, base: 0.55, now: 0.34 };
    }
    el.screen.hidden = false;
    document.body.classList.add('is-capturing');
    renderChrome();
    loadGhost();
    start();
  }

  function close() {
    stop();
    if (el.screen) el.screen.hidden = true;
    document.body.classList.remove('is-capturing');
    owner = null; ctx = null; onDone = null; saving = false;
  }

  function start() {
    el.fallback.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      fail('This browser will not give the app a camera. Pick a photo from the device instead.');
      return;
    }
    el.stage.classList.add('is-waiting');
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false
    }).then(s => {
      stream = s;
      el.video.srcObject = s;
      const p = el.video.play();
      if (p && p.catch) p.catch(() => {});
      el.video.onloadedmetadata = () => { ready = true; el.stage.classList.remove('is-waiting'); renderChrome(); };
    }).catch(err => {
      const name = err && err.name || '';
      if (name === 'NotAllowedError')
        fail('The camera was refused. You can allow it in the app settings, or pick a photo from the device.');
      else if (name === 'NotFoundError')
        fail('No camera was found on this device. Pick a photo instead.');
      else
        fail('The camera did not start. Pick a photo from the device instead.');
    });
  }

  function fail(msg) {
    el.stage.classList.remove('is-waiting');
    el.fallback.hidden = false;
    el.fbNote.textContent = msg;
  }

  function stop() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (el.video) { el.video.srcObject = null; }
    ready = false;
  }

  /* ---------- ghost ---------- */
  function loadGhost() {
    const shots = owner ? Store.photoLogs(owner) : [];
    const last = shots.length ? shots[shots.length - 1] : null;
    if (!last) {
      el.ghost.removeAttribute('src');
      el.ghost.hidden = true;
      el.ghostBtn.hidden = true;
      return;
    }
    el.ghostBtn.hidden = false;
    Photos.get(last.photoId).then(d => {
      if (!d) { el.ghost.hidden = true; el.ghostBtn.hidden = true; return; }
      el.ghost.src = d;
      el.ghost.hidden = !ghostOn;
    });
  }
  function toggleGhost() {
    ghostOn = !ghostOn;
    el.ghost.hidden = !ghostOn || !el.ghost.getAttribute('src');
    el.ghostBtn.setAttribute('aria-pressed', String(ghostOn));
    el.ghostBtn.textContent = ghostOn ? 'Ghost on' : 'Ghost off';
  }

  /* ---------- chrome ---------- */
  function renderChrome() {
    const hasRef = !!(owner && owner.riseRef);
    el.chips.querySelectorAll('button').forEach(b => {
      b.classList.toggle('is-on', b.dataset.mode === mode);
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    el.ghostBtn.setAttribute('aria-pressed', String(ghostOn));
    el.ghostBtn.textContent = ghostOn ? 'Ghost on' : 'Ghost off';

    if (mode === 'journal') {
      el.title.textContent = 'Journal photo';
      el.sub.textContent = el.ghost.getAttribute('src')
        ? 'Line the jar up with the ghost so the series matches.'
        : 'The first shot sets the angle. Every later one gets ghosted over this.';
      el.read.hidden = true;
      el.marks.hidden = true;
      el.shutter.querySelector('span').textContent = 'Take the photo';
    } else if (mode === 'mark') {
      el.title.textContent = 'Set the lines';
      el.sub.textContent = 'Drag the lower line to the bottom of the jar contents and the upper line to the level right after a feed.';
      el.read.hidden = false;
      el.read.innerHTML = '<b>Marking a fresh feed</b><i>The next rise checks are measured against these two lines.</i>';
      el.marks.hidden = false;
      el.shutter.querySelector('span').textContent = 'Mark the feed';
    } else {
      el.title.textContent = 'Rise check';
      if (!hasRef) {
        el.sub.textContent = 'No feed line has been set yet. Set the lines first.';
        el.read.hidden = false;
        el.read.innerHTML = '<b>No reference lines</b><i>Switch to Set the lines and mark the level at a feed.</i>';
        el.marks.hidden = true;
        el.shutter.querySelector('span').textContent = 'Set the lines first';
      } else {
        el.sub.textContent = 'Drag the top line to where the level is now. The reference lines are dotted.';
        el.marks.hidden = false;
        el.read.hidden = false;
        updateRead();
        el.shutter.querySelector('span').textContent = 'Save the rise mark';
      }
    }
    layoutMarks();
  }

  function layoutMarks() {
    if (el.marks.hidden) return;
    const showRef = mode === 'mark';
    el.marks.innerHTML =
      (mode === 'rise'
        ? '<div class="mk mk-ref" style="top:' + (marks.bottom * 100) + '%"><i>bottom</i></div>' +
          '<div class="mk mk-ref" style="top:' + (marks.base * 100) + '%"><i>at the feed</i></div>' +
          '<div class="mk mk-live" data-h="now" style="top:' + (marks.now * 100) + '%"><i>now</i><span class="grip"></span></div>'
        : '<div class="mk mk-live" data-h="base" style="top:' + (marks.base * 100) + '%"><i>level at the feed</i><span class="grip"></span></div>' +
          '<div class="mk mk-live" data-h="bottom" style="top:' + (marks.bottom * 100) + '%"><i>bottom of the jar</i><span class="grip"></span></div>');
  }

  function updateRead() {
    if (mode !== 'rise' || !owner || !owner.riseRef) return;
    const ratio = Store.riseRatio(owner.riseRef, marks.now);
    const since = (Date.now() - owner.riseRef.at) / Store.HOUR;
    el.read.innerHTML = '<b>' + (ratio ? Store.round(ratio, 2) + 'x' : '') + '</b><i>' +
      Store.spanText(since) + ' since the feed line was set</i>';
  }

  /* ---------- dragging ---------- */
  function onDown(e) {
    const h = e.target.closest('.mk-live');
    if (!h) return;
    dragging = h.dataset.h;
    h.setPointerCapture && h.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    const r = el.frame.getBoundingClientRect();
    let f = (e.clientY - r.top) / Math.max(1, r.height);
    f = Math.max(0.02, Math.min(0.98, f));
    if (dragging === 'bottom') marks.bottom = Math.max(marks.base + 0.05, f);
    else if (dragging === 'base') marks.base = Math.min(marks.bottom - 0.05, f);
    else marks.now = f;
    const node = el.marks.querySelector('[data-h="' + dragging + '"]');
    if (node) node.style.top = (marks[dragging] * 100) + '%';
    updateRead();
    e.preventDefault();
  }
  function onUp() { dragging = null; }

  /* ---------- shutter ---------- */
  function grabFrame() {
    if (!ready || !el.video.videoWidth) return null;
    try { return Photos.fromSource(el.video, el.video.videoWidth, el.video.videoHeight, 900); }
    catch (e) { return null; }
  }

  function shoot() {
    if (saving) return;
    if (mode === 'rise' && !(owner && owner.riseRef)) { mode = 'mark'; renderChrome(); return; }
    const data = grabFrame();
    if (!data) {
      fail('The camera did not hand over a frame. Pick a photo from the device instead.');
      return;
    }
    commit(data);
  }

  function commit(data) {
    if (saving || !owner || !ctx) return;
    saving = true;
    const pid = uid();
    // Held locally: close() clears all of these before the write comes back.
    const who = owner, type = ctx.ownerType, how = mode, done = onDone;
    const ref = who.riseRef, at = marks.bottom, base = marks.base, now = marks.now;
    Photos.put(pid, data).then(() => {
      let entry;
      if (how === 'mark') {
        Store.setRiseRef(who, { bottomY: at, baseY: base });
        entry = { kind: 'rise', value: 1, photoId: pid, text: 'Level marked at the feed' };
      } else if (how === 'rise') {
        const ratio = Store.riseRatio(ref, now);
        entry = { kind: 'rise', value: Number(Store.round(ratio, 2)), photoId: pid,
                  text: Store.spanText((Date.now() - ref.at) / Store.HOUR) + ' after the feed' };
      } else {
        entry = { kind: 'photo', photoId: pid, text: '' };
      }
      if (type === 'batch') Store.addBatchLog(who.id, entry);
      else Store.addCultureLog(who.id, entry);
      if (window.App && App.buzz) App.buzz(18);
      close();
      if (done) done(entry);
    }).catch(() => {
      saving = false;
      fail('That photograph could not be saved on this device.');
    });
  }

  function pickFile(file) {
    if (!file || saving) return;
    Photos.fromFile(file, 900).then(commit).catch(() => {
      el.fbNote.textContent = 'That file could not be read as a photograph.';
    });
  }

  /* ---------- wiring, once ---------- */
  function init() {
    bind();
    el.chips.addEventListener('click', e => {
      const b = e.target.closest('button[data-mode]');
      if (!b) return;
      mode = b.dataset.mode;
      if (mode === 'rise' && !(owner && owner.riseRef)) mode = 'mark';
      renderChrome();
    });
    el.ghostBtn.addEventListener('click', toggleGhost);
    el.shutter.addEventListener('click', shoot);
    el.marks.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.file.addEventListener('change', e => { pickFile(e.target.files && e.target.files[0]); e.target.value = ''; });
    $('#capBack').addEventListener('click', () => { const d = onDone; close(); if (d) d(null); });
  }

  const isOpen = () => !!(el.screen && !el.screen.hidden);
  /** Called when the app comes back to the foreground with the camera screen still open. */
  function resume() { if (isOpen() && !stream) start(); }

  return { init, open, close, isOpen, stop, resume };
})();

window.Capture = Capture;
