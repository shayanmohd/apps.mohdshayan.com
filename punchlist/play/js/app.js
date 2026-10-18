/* Punchlist. Screens, the walk, the capture sheet and everything that turns pins into a PDF. */
const App = (() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  let view = 'projects';
  const sheets = [];
  let confirmResolve = null;
  let camStream = null, camFacing = 'environment', camWasOn = false;
  let cap = null;
  let editProjectId = null, editContactId = null, curDefectId = null;
  let planDraft = null;
  let doc = null, docOpts = null;
  let filterMode = 0;
  let justSaved = null;
  let walking = false;
  const FILTERS = [
    { label: 'All pins', fn: () => true },
    { label: 'Open only', fn: d => !Store.isDone(d.status) },
    { label: 'Safety and major', fn: d => d.severity === 'safety' || d.severity === 'major' }
  ];

  /* ── native bridge, every call optional ── */
  const N = {
    is: () => { try { return !!(window.Native && Native.isNative && Native.isNative()); } catch (e) { return false; } },
    buzz(ms, amp) {
      if (!Store.settings().haptics) return;
      try { if (window.Native && Native.vibrate) return Native.vibrate(ms, amp || 170); } catch (e) {}
      try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
    },
    awake(on) { try { if (window.Native && Native.keepAwake) Native.keepAwake(!!on); } catch (e) {} },
    save(name, mime, b64) { try { return (window.Native && Native.saveFile) ? Native.saveFile(name, mime, b64) : ''; } catch (e) { return ''; } },
    shareUri(uri, mime) { try { if (window.Native && Native.shareUri) Native.shareUri(uri, mime); } catch (e) {} }
  };

  function b64(u8) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }

  /** Writes a file the user can find, and optionally opens the share sheet on it. */
  function deliver(name, mime, bytes, share) {
    if (N.is()) {
      const uri = N.save(name, mime, b64(bytes));
      if (uri) {
        if (share) N.shareUri(uri, mime);
        else toast('Saved to Downloads as ' + name);
        return true;
      }
      toast('This phone would not let the file be written.');
      return false;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Downloaded ' + name);
    return true;
  }

  function fieldError(fieldId, msgId, on) {
    $(fieldId).classList.toggle('is-bad', !!on);
    $(msgId).hidden = !on;
    if (on) N.buzz(24, 140);
  }

  /** The trimmed value of a text field, never longer than the field says it accepts. */
  function capped(id) {
    const e = $(id);
    const max = +e.getAttribute('maxlength') || 0;
    const v = e.value.trim();
    return max ? v.slice(0, max) : v;
  }

  /* ── chrome helpers ── */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function busy(msg, frac) {
    const b = $('busy');
    if (msg === false) { b.hidden = true; return; }
    $('busyMsg').textContent = msg;
    $('busyBar').style.width = Math.round((frac || 0) * 100) + '%';
    b.hidden = false;
  }
  function ask(h, p, yes) {
    $('confirmH').textContent = h;
    $('confirmP').textContent = p;
    $('confirmYes').textContent = yes || 'Confirm';
    $('confirm').hidden = false;
    return new Promise(res => { confirmResolve = res; });
  }
  function closeConfirm(v) {
    $('confirm').hidden = true;
    shield();
    if (confirmResolve) { confirmResolve(v); confirmResolve = null; }
  }

  /* A thumb that taps a full width button twice sends the second tap to whatever the closing
     sheet was covering, which on this layout is the tab bar. Swallow that one. */
  let shieldTimer = null;
  function shield() {
    const s = $('tapShield');
    if (!s) return;
    s.hidden = false;
    clearTimeout(shieldTimer);
    shieldTimer = setTimeout(() => { s.hidden = true; }, 320);
  }

  function openSheet(id) {
    if (sheets.includes(id)) return;
    sheets.push(id);
    $(id).hidden = false;
  }
  function closeSheet(id) {
    const i = sheets.lastIndexOf(id);
    if (i >= 0) sheets.splice(i, 1);
    $(id).hidden = true;
    shield();
    if (id === 'sh-capture') stopCam();
    // a sheet that edits data leaves the screen under it showing what was true before it opened
    if (!sheets.length && (id === 'sh-project' || id === 'sh-contact' || id === 'sh-plan')) render(view);
  }
  function topSheet() { return sheets[sheets.length - 1] || null; }

  function show(v) {
    view = v;
    for (const k of ['projects', 'walk', 'report', 'setup']) $('v-' + k).hidden = k !== v;
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('is-on', t.dataset.view === v);
    $('tabs').hidden = false;
    render(v);
  }
  function render(v) {
    if (v === 'projects') renderProjects();
    if (v === 'walk') renderWalk();
    if (v === 'report') renderReport();
    if (v === 'setup') renderSetup();
  }

  /* ══ PROJECTS ══ */
  async function renderProjects() {
    const list = Store.projects();
    const box = $('projList');
    box.innerHTML = '';
    $('projEmpty').hidden = list.length > 0;
    $('projFoot').hidden = list.length === 0;
    const open = list.reduce((a, p) => a + Store.tally(p.id).open, 0);
    $('projSub').textContent = list.length
      ? `${list.length} project${list.length === 1 ? '' : 's'}, ${open} defect${open === 1 ? '' : 's'} open`
      : 'Nothing on the books yet';

    for (const p of list) {
      const t = Store.tally(p.id);
      const card = el('div', 'card');
      const h = el('div', 'card-h');
      h.appendChild(el('b', null, p.name));
      const ed = el('button', 'icon-btn', 'Edit');
      ed.style.padding = '0 0 0 10px';
      ed.style.minHeight = '0';
      ed.addEventListener('click', e => { e.stopPropagation(); openProject(p.id); });
      h.appendChild(ed);
      card.appendChild(h);
      const bits = [p.client || 'No client recorded'];
      bits.push(`${p.plans.length} plan${p.plans.length === 1 ? '' : 's'}`);
      bits.push(p.lastWalked ? 'Walked ' + Store.shortDate(p.lastWalked) : 'Not walked yet');
      card.appendChild(el('p', 'card-meta', bits.join('  /  ')));

      const tally = el('div', 'tally');
      let any = false;
      for (const s of Store.SEVERITY) {
        if (!t[s.k]) continue;
        any = true;
        const b = el('b', null, `${t[s.k]} ${s.label.toLowerCase()}`);
        b.style.background = s.hex;
        tally.appendChild(b);
      }
      if (t.done) { const b = el('b', 'zero', `${t.done} closed out`); tally.appendChild(b); }
      if (!any && !t.done) tally.appendChild(el('b', 'zero', 'No defects yet'));
      card.appendChild(tally);

      if (p.plans[0] && p.plans[0].media) {
        const img = el('img', 'card-thumb');
        img.alt = '';
        Media.url(p.plans[0].media).then(u => { if (u) img.src = u; });
        card.appendChild(img);
      }
      card.addEventListener('click', () => { Store.setActive(p.id); show('walk'); });
      box.appendChild(card);
    }
  }

  function openProject(id) {
    editProjectId = id;
    const p = id ? Store.project(id) : null;
    $('projSheetTitle').textContent = p ? 'Project' : 'New project';
    $('pfName').value = p ? p.name : '';
    $('pfClient').value = p ? p.client : '';
    $('pfAddress').value = p ? p.address : '';
    $('pfRef').value = p ? p.ref : '';
    $('projDeleteRow').hidden = !p;
    fieldError('pfNameField', 'pfNameErr', false);
    renderPlanRows();
    openSheet('sh-project');
  }

  function renderPlanRows() {
    const box = $('pfPlans');
    box.innerHTML = '';
    const p = editProjectId ? Store.project(editProjectId) : null;
    if (!p) { box.appendChild(el('p', 'help', 'Save the project first, then add its plans.')); return; }
    if (!p.plans.length) { box.appendChild(el('p', 'help', 'No plans yet.')); return; }
    for (const pl of p.plans) {
      const row = el('div', 'card');
      const h = el('div', 'card-h');
      h.appendChild(el('b', null, pl.label));
      const rm = el('button', 'icon-btn', 'Remove');
      rm.style.padding = '0 0 0 10px';
      rm.style.minHeight = '0';
      rm.addEventListener('click', async e => {
        e.stopPropagation();
        const n = Store.forProject(p.id, { includeClosed: true, planId: pl.id }).length;
        const ok = await ask('Remove this plan?',
          n ? `${n} defect${n === 1 ? '' : 's'} pinned to it are removed too. This cannot be undone.`
            : 'The plan image is deleted from this phone.', 'Remove');
        if (!ok) return;
        await Media.del(Store.removePlan(p.id, pl.id));
        renderPlanRows();
      });
      h.appendChild(rm);
      row.appendChild(h);
      const n = Store.forProject(p.id, { includeClosed: true, planId: pl.id }).length;
      row.appendChild(el('p', 'card-meta', `${n} defect${n === 1 ? '' : 's'} pinned`));
      box.appendChild(row);
    }
  }

  /* ══ WALK ══ */
  function activePlan() {
    const p = Store.activeProject();
    if (!p || !p.plans.length) return null;
    const s = Store.settings();
    return p.plans.find(pl => pl.id === s.activePlan) || p.plans[0];
  }

  async function renderWalk() {
    // the stage has no size while another view is showing; it is drawn when Walk is opened
    if (view !== 'walk') return;
    const p = Store.activeProject();
    $('walkNoProject').hidden = !!p;
    $('walkHud').hidden = !p;
    if (!p) {
      $('walkTitle').textContent = 'Walk';
      $('walkSub').textContent = 'No project open';
      $('planEmpty').hidden = true;
      $('planSwitchBtn').hidden = true;
      showPlanMissing(false);
      setWalking(false);
      Plan.currentMedia = null;
      Plan.unload();
      return;
    }
    const pl = activePlan();
    $('walkTitle').textContent = p.name;
    $('planSwitchBtn').hidden = p.plans.length < 2;
    $('planEmpty').hidden = !!pl;

    if (!pl) {
      $('walkSub').textContent = 'No plan imported';
      $('walkHud').hidden = true;
      showPlanMissing(false);
      setWalking(false);
      Plan.currentMedia = null;
      Plan.unload();
      return;
    }
    const t = Store.tally(p.id);
    $('walkSub').textContent = `${pl.label}  /  ${t.open} open, ${t.done} closed out`;
    if (Plan.currentMedia !== pl.media) {
      Plan.currentMedia = pl.media;
      const ok = await Plan.load(pl.media, pl.w, pl.h);
      if (!ok) { Plan.currentMedia = null; showPlanMissing(true); return; }
      if (Plan.currentMedia !== pl.media) return;      // another plan was picked while this one loaded
    }
    showPlanMissing(false);
    Plan.draw();
    paintPins();
  }

  /* The plan record is in the store but its image is not on this phone (a restore of the wrong
     backup, or storage the system cleared). Say so instead of showing an empty grey stage. */
  function showPlanMissing(on) {
    const box = $('planMissing');
    if (box) box.hidden = !on;
    $('walkHud').hidden = on || !Store.activeProject() || !activePlan();
  }

  function paintPins() {
    const p = Store.activeProject();
    const pl = activePlan();
    if (!p || !pl) return;
    const f = FILTERS[filterMode];
    const list = Store.forProject(p.id, { includeClosed: true, planId: pl.id }).filter(f.fn);
    Plan.setPins(list, { selected: justSaved, onPin: d => openDefect(d.id), onTap: dropPin });
    $('filterBtn').innerHTML = Icons.icon('filter', { size: 17 });
    $('filterBtn').appendChild(el('span', null, f.label));
  }

  function setWalking(on) {
    walking = !!on;
    Plan.walkMode(walking);
    $('planStage').classList.toggle('is-walking', walking);
    const fab = $('walkFab');
    fab.setAttribute('aria-pressed', walking ? 'true' : 'false');
    fab.querySelector('.wf-label').textContent = walking ? 'Walking' : 'Start walk';
    $('walkHint').hidden = !walking;
    if (Store.settings().keepAwake) N.awake(walking);
  }

  function dropPin(pt) {
    const p = Store.activeProject();
    const pl = activePlan();
    if (!p || !pl) return;
    N.buzz(18, 210);
    openCapture(null, { projectId: p.id, planId: pl.id, x: pt.x, y: pt.y });
  }

  /* ══ CAPTURE ══ */
  function openCapture(defectId, seed) {
    const d = defectId ? Store.defect(defectId) : null;
    const p = Store.project(d ? d.projectId : seed.projectId);
    cap = d
      ? { id: d.id, projectId: d.projectId, planId: d.planId, x: d.x, y: d.y,
          photos: d.photos.slice(), note: d.note, trade: d.trade, severity: d.severity,
          room: d.room, due: d.due, assignee: d.assignee, n: d.n }
      : { id: null, projectId: seed.projectId, planId: seed.planId, x: seed.x, y: seed.y,
          photos: [], note: '', trade: 'Unassigned', severity: 'normal', room: lastRoom(p),
          due: null, assignee: null, n: (p.seq || 0) + 1 };

    $('capTitle').textContent = (d ? 'Defect ' : 'New defect ') + cap.n;
    $('capSave').textContent = d ? 'Delete' : '';
    $('capSave').style.visibility = d ? 'visible' : 'hidden';
    $('capSaveNext').textContent = d ? 'Save changes' : 'Save and keep walking';
    $('capNote').value = cap.note;
    $('capRoom').value = cap.room;
    $('capDueDate').value = cap.due || '';
    $('capBody').scrollTop = 0;

    const rooms = $('roomList');
    rooms.innerHTML = '';
    for (const r of Store.ROOMS) rooms.appendChild(el('option')).value = r;

    buildTradeChips();
    buildSevChips();
    buildDueChips();
    buildPhrases();
    buildAssignees();
    renderThumbs();
    openSheet('sh-capture');
    if (!d) startCam(); else showCamOff('Camera is off. Turn it on to add another photo.');
  }

  function lastRoom(p) {
    if (!p) return '';
    const list = Store.forProject(p.id, { includeClosed: true });
    return list.length ? (list[list.length - 1].room || '') : '';
  }

  function chipRow(box, items, isOn, onPick, cls) {
    box.innerHTML = '';
    for (const it of items) {
      const b = el('button', 'chip' + (cls ? ' ' + cls : ''), it.label);
      if (it.hex) b.style.setProperty('--sev', it.hex);
      if (isOn(it)) b.classList.add('is-on');
      b.addEventListener('click', () => onPick(it));
      box.appendChild(b);
    }
  }
  function buildTradeChips() {
    chipRow($('capTrades'), Store.TRADES.map(t => ({ label: t, k: t })),
      it => it.k === cap.trade, it => { cap.trade = it.k; buildTradeChips(); buildPhrases(); buildAssignees(); });
  }
  function buildSevChips() {
    chipRow($('capSeverity'), Store.SEVERITY.map(s => ({ label: s.label, k: s.k, hex: s.hex })),
      it => it.k === cap.severity, it => { cap.severity = it.k; buildSevChips(); }, 'sev');
  }
  function buildDueChips() {
    const opts = [
      { label: 'No date', k: null },
      { label: 'Today', k: Store.today() },
      { label: 'Tomorrow', k: Store.addDays(Store.today(), 1) },
      { label: 'Friday', k: Store.nextWeekday(5) },
      { label: 'Next week', k: Store.addDays(Store.today(), 7) }
    ];
    chipRow($('capDue'), opts, it => it.k === cap.due, it => { cap.due = it.k; $('capDueDate').value = it.k || ''; buildDueChips(); });
  }
  function buildPhrases() {
    const box = $('capPhrases');
    const list = Store.PHRASES[cap.trade] || Store.PHRASES['Unassigned'];
    box.innerHTML = '';
    for (const ph of list) {
      const b = el('button', 'chip phrase', ph);
      b.addEventListener('click', () => {
        const t = $('capNote').value.trim();
        $('capNote').value = t ? t.replace(/[.\s]+$/, '') + '. ' + ph : ph;
        cap.note = $('capNote').value;
        N.buzz(8, 120);
      });
      box.appendChild(b);
    }
  }
  function buildAssignees() {
    const sel = $('capAssignee');
    sel.innerHTML = '';
    sel.appendChild(el('option', null, 'Nobody yet')).value = '';
    const cs = Store.contacts();
    const pref = cs.filter(c => c.trade === cap.trade).concat(cs.filter(c => c.trade !== cap.trade));
    for (const c of pref) {
      const o = el('option', null, `${c.name || c.company}${c.trade && c.trade !== 'Unassigned' ? ' (' + c.trade + ')' : ''}`);
      o.value = c.id;
      sel.appendChild(o);
    }
    sel.value = cap.assignee || '';
  }

  async function renderThumbs() {
    const box = $('capThumbs');
    box.innerHTML = '';
    for (let i = 0; i < cap.photos.length; i++) {
      const ph = cap.photos[i];
      const t = el('div', 'thumb');
      const img = el('img');
      img.alt = '';
      Media.url(ph.media).then(u => { if (u) img.src = u; });
      t.appendChild(img);
      const x = el('button');
      x.innerHTML = Icons.icon('close', { size: 15, w: 2.4 });
      x.setAttribute('aria-label', 'Remove photo ' + (i + 1));
      x.addEventListener('click', () => { cap.photos.splice(i, 1); renderThumbs(); });
      t.appendChild(x);
      const role = el('span', 'role', ph.role === 'after' ? 'After' : ph.role === 'before' ? 'Before' : '');
      if (ph.role && ph.role !== 'general') t.appendChild(role);
      box.appendChild(t);
    }
    if (!cap.photos.length) {
      const p = el('p', 'help', 'No photos yet. A defect without a photograph is an argument waiting to happen.');
      box.appendChild(p);
    }
  }

  /* camera */
  function showCamOff(msg) {
    $('camOff').hidden = false;
    $('camOffMsg').textContent = msg;
    $('camVideo').style.visibility = 'hidden';
  }
  async function startCam() {
    stopCam();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCamOff('This device has no camera the app can open. Use Files to add a photo instead.');
      return;
    }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: camFacing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false
      });
      const v = $('camVideo');
      v.srcObject = camStream;
      v.style.visibility = 'visible';
      $('camOff').hidden = true;
      await v.play().catch(() => {});
    } catch (e) {
      showCamOff(e && e.name === 'NotAllowedError'
        ? 'Camera access was declined. You can still add photos from Files.'
        : 'The camera could not be opened. You can still add photos from Files.');
    }
  }
  function stopCam() {
    if (camStream) { for (const t of camStream.getTracks()) t.stop(); camStream = null; }
    const v = $('camVideo');
    if (v) { v.srcObject = null; }
  }
  async function shoot() {
    const v = $('camVideo');
    if (!camStream || !v.videoWidth) { toast('The camera is not running.'); return; }
    N.buzz(14, 190);
    const rec = await Media.store(v, 1600, .72);
    cap.photos.push({ media: rec.id, role: photoRole(), at: Date.now() });
    renderThumbs();
  }
  /* A photograph added to a defect that is already claimed or closed is the evidence it was
     put right, so it is labelled as such in the report. Everything else is just a photograph. */
  function photoRole() {
    if (!cap.id) return 'general';
    const d = Store.defect(cap.id);
    return d && (d.status === 'claimed' || d.status === 'verified' || d.status === 'closed') ? 'after' : 'general';
  }

  function saveCapture() {
    cap.note = capped('capNote');
    cap.room = capped('capRoom');
    cap.assignee = $('capAssignee').value || null;
    cap.due = $('capDueDate').value || null;
    if (!cap.note && !cap.photos.length) { toast('Add a photo or a note before saving.'); return; }

    if (cap.id) {
      Store.updateDefect(cap.id, {
        photos: cap.photos, note: cap.note, trade: cap.trade, severity: cap.severity,
        room: cap.room, due: cap.due, assignee: cap.assignee
      });
      if (cap.assignee && Store.defect(cap.id).status === 'open') Store.setStatus(cap.id, 'assigned', 'Assigned');
      toast('Defect ' + cap.n + ' updated');
    } else {
      const d = Store.addDefect({
        projectId: cap.projectId, planId: cap.planId, x: cap.x, y: cap.y,
        photos: cap.photos, note: cap.note, trade: cap.trade, severity: cap.severity,
        room: cap.room, due: cap.due, assignee: cap.assignee
      });
      if (cap.assignee) Store.setStatus(d.id, 'assigned', 'Assigned on the walk');
      toast('Defect ' + d.n + ' pinned');
      justSaved = d.id;
    }
    if (cap.id) justSaved = cap.id;
    N.buzz(26, 200);
    Store.save();
    closeSheet('sh-capture');
    paintPins();
    Plan.select(justSaved);
    renderWalk();
  }

  /* ══ DEFECT DETAIL ══ */
  async function openDefect(id) {
    const d = Store.defect(id);
    if (!d) return;
    curDefectId = id;
    Plan.select(id);
    $('defTitle').textContent = 'Defect ' + d.n;
    const body = $('defBody');
    body.innerHTML = '';

    const p = Store.project(d.projectId);
    const pl = p.plans.find(x => x.id === d.planId);

    if (d.photos.length) {
      const hero = el('div', 'def-hero');
      const pager = el('div', 'def-pager');
      for (const ph of d.photos) {
        const img = el('img');
        img.alt = 'Photograph of defect ' + d.n;
        Media.url(ph.media).then(u => { if (u) img.src = u; });
        pager.appendChild(img);
      }
      hero.appendChild(pager);
      if (d.photos.length > 1) {
        const dots = el('div', 'def-dots');
        for (let i = 0; i < d.photos.length; i++) dots.appendChild(el('i', i === 0 ? 'is-on' : null));
        hero.appendChild(dots);
        pager.addEventListener('scroll', () => {
          const i = Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth));
          [...dots.children].forEach((c, k) => c.classList.toggle('is-on', k === i));
        }, { passive: true });
      }
      body.appendChild(hero);
    }

    const head = el('div', 'def-head');
    const num = el('span', 'def-num', String(d.n));
    num.style.background = Store.SEV[d.severity].hex;
    head.appendChild(num);
    head.appendChild(el('p', null, d.note || 'No note recorded.'));
    body.appendChild(head);

    const who = d.assignee ? Store.contact(d.assignee) : null;
    const dl = el('dl', 'meta-grid');
    const row = (k, v) => { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); };
    row('Location', [pl ? pl.label : 'No plan', d.room].filter(Boolean).join('  /  ') || 'Not recorded');
    row('Trade', d.trade || 'Unassigned');
    row('Severity', Store.SEV[d.severity].label);
    row('Status', Store.ST[d.status].label);
    row('Due', d.due ? Store.relDue(d.due) : 'No date set');
    row('Assigned to', who ? `${who.name || who.company}${who.phone ? '  /  ' + who.phone : ''}` : 'Nobody yet');
    row('Raised', Store.shortDate(Store.ymd(new Date(d.createdAt))));
    body.appendChild(dl);

    if (pl && pl.media) {
      const cv = await Media.cropAround(pl.media, d.x, d.y, .3, 420);
      if (cv) {
        const img = el('img', 'crop-shot');
        img.alt = 'Where defect ' + d.n + ' sits on the plan';
        img.src = cv.toDataURL('image/jpeg', .8);
        body.appendChild(el('p', 'label', 'On the plan'));
        body.appendChild(img);
      }
    }

    body.appendChild(el('p', 'label', 'Move it along'));
    const sr = el('div', 'status-row');
    for (const s of Store.STATUS) {
      const b = el('button', 'chip' + (s.k === d.status ? ' is-on' : ''), s.label);
      b.addEventListener('click', () => {
        if (s.k === d.status) return;
        Store.setStatus(d.id, s.k);
        N.buzz(16, 170);
        openDefect(d.id);
        paintPins();
        renderWalk();
      });
      sr.appendChild(b);
    }
    body.appendChild(sr);

    const acts = el('div', 'btnrow');
    const addPh = el('button', 'btn small', d.status === 'claimed' || Store.isDone(d.status) ? 'Add an after photo' : 'Add a photo');
    addPh.addEventListener('click', () => { closeSheet('sh-defect'); openCapture(d.id); setTimeout(startCam, 60); });
    acts.appendChild(addPh);
    const del = el('button', 'btn small ghost danger', 'Delete defect');
    del.addEventListener('click', async () => {
      const ok = await ask('Delete defect ' + d.n + '?', 'The pin, its note and its photographs go with it. This cannot be undone.', 'Delete');
      if (!ok) return;
      await Media.del(Store.deleteDefect(d.id));
      closeSheet('sh-defect');
      paintPins();
      renderWalk();
      toast('Defect ' + d.n + ' deleted');
    });
    acts.appendChild(del);
    body.appendChild(acts);

    body.appendChild(el('p', 'label', 'History'));
    const ul = el('ul', 'timeline');
    for (const h of d.history) {
      const li = el('li');
      const b = el('b', null, h.text || Store.ST[h.status].label);
      li.appendChild(b);
      li.appendChild(document.createTextNode('  ' + new Date(h.at).toLocaleString(undefined,
        { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
      ul.appendChild(li);
    }
    body.appendChild(ul);
    body.scrollTop = 0;
    openSheet('sh-defect');
  }

  /* ══ PLAN IMPORT ══ */
  function openPlanSheet() {
    const p = editProjectId ? Store.project(editProjectId) : Store.activeProject();
    if (!p) { toast('Open a project first.'); return; }
    planDraft = { projectId: p.id, img: null, corners: null, square: true, clean: false };
    $('planLabel').value = 'Level ' + (p.plans.length + 1);
    $('deskewHandles').innerHTML = '';
    const cv = $('deskewCanvas');
    cv.width = 10; cv.height = 10;
    syncPlanChips();
    openSheet('sh-plan');
    setTimeout(() => $('planPick').click(), 120);
  }

  function syncPlanChips() {
    for (const b of $('planTweaks').children) {
      const on = b.dataset.k === 'square' ? planDraft.square : planDraft.clean;
      b.classList.toggle('is-on', on);
    }
  }

  async function loadPlanFile(file) {
    if (!file) return;
    busy('Reading the image', .2);
    try {
      const img = await Media.fileToImage(file);
      planDraft.img = img;
      const wrap = $('deskewWrap');
      const dispW = Math.max(200, wrap.clientWidth || 320);
      const k = dispW / img.naturalWidth;
      const cv = $('deskewCanvas');
      cv.width = Math.round(img.naturalWidth * k);
      cv.height = Math.round(img.naturalHeight * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const ix = cv.width * .045, iy = cv.height * .045;
      planDraft.corners = [[ix, iy], [cv.width - ix, iy], [cv.width - ix, cv.height - iy], [ix, cv.height - iy]];
      planDraft.dispScale = k;
      drawHandles();
      busy(false);
    } catch (e) {
      busy(false);
      toast(e.message || 'That image could not be read.');
    }
  }

  function drawHandles() {
    const box = $('deskewHandles');
    box.innerHTML = '';
    if (!planDraft || !planDraft.corners) return;
    const cv = $('deskewCanvas');
    const shown = cv.getBoundingClientRect().width / cv.width;
    planDraft.shown = shown;
    planDraft.corners.forEach((c, i) => {
      const h = el('div', 'dh');
      h.style.left = (c[0] * shown) + 'px';
      h.style.top = (c[1] * shown) + 'px';
      h.dataset.i = i;
      box.appendChild(h);
    });
  }

  function handleDrag(e) {
    if (!planDraft || !planDraft.corners) return;
    const h = e.target.closest('.dh');
    if (!h) return;
    e.preventDefault();
    const i = +h.dataset.i;
    const box = $('deskewHandles');
    const cv = $('deskewCanvas');
    const shown = cv.getBoundingClientRect().width / cv.width;
    const rect = box.getBoundingClientRect();
    const move = ev => {
      const x = Math.max(0, Math.min(cv.width, (ev.clientX - rect.left) / shown));
      const y = Math.max(0, Math.min(cv.height, (ev.clientY - rect.top) / shown));
      planDraft.corners[i] = [x, y];
      h.style.left = (x * shown) + 'px';
      h.style.top = (y * shown) + 'px';
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  async function applyPlan() {
    if (!planDraft || !planDraft.img) { toast('Pick an image of the plan first.'); return; }
    busy('Straightening the plan', .3);
    await new Promise(r => setTimeout(r, 30));
    try {
      const img = planDraft.img;
      let cv;
      if (planDraft.square) {
        const k = 1 / planDraft.dispScale;
        const src = planDraft.corners.map(c => [c[0] * k, c[1] * k]);
        cv = Media.deskew(img, src, 1900);
      } else {
        const [w, h] = Media.fit(img.naturalWidth, img.naturalHeight, 1900);
        cv = Media.drawTo(img, w, h);
      }
      busy('Cleaning it up', .7);
      await new Promise(r => setTimeout(r, 20));
      if (planDraft.clean) Media.inkAndPaper(cv);
      const rec = await Media.storeCanvas(cv, .86);
      const label = $('planLabel').value.trim() || 'Plan';
      const added = Store.addPlan(planDraft.projectId, { label, media: rec.id, w: rec.w, h: rec.h });
      Store.settings({ activePlan: added ? added.id : null });
      Store.save();
      busy(false);
      closeSheet('sh-plan');
      renderPlanRows();
      Plan.currentMedia = null;
      renderWalk();
      toast('Plan added');
    } catch (e) {
      busy(false);
      toast('That plan could not be processed.');
    }
  }

  /* ══ CONTACTS ══ */
  function renderContacts() {
    const box = $('contactList');
    box.innerHTML = '';
    const cs = Store.contacts();
    $('contactEmpty').hidden = cs.length > 0;
    for (const c of cs) {
      const card = el('div', 'card');
      const h = el('div', 'card-h');
      h.appendChild(el('b', null, c.name || c.company || 'Unnamed'));
      h.appendChild(el('span', 'card-meta', c.trade));
      card.appendChild(h);
      const bits = [c.company, c.phone, c.email].filter(Boolean);
      card.appendChild(el('p', 'card-meta', bits.join('  /  ') || 'No details'));
      card.addEventListener('click', () => openContact(c.id));
      box.appendChild(card);
    }
  }
  function openContact(id) {
    editContactId = id;
    const c = id ? Store.contact(id) : null;
    $('contactSheetTitle').textContent = c ? 'Contact' : 'New contact';
    $('cfName').value = c ? c.name : '';
    $('cfCompany').value = c ? c.company : '';
    $('cfPhone').value = c ? c.phone : '';
    $('cfEmail').value = c ? c.email : '';
    const sel = $('cfTrade');
    sel.innerHTML = '';
    for (const t of Store.TRADES) sel.appendChild(el('option', null, t)).value = t;
    sel.value = c ? c.trade : 'Unassigned';
    $('contactDeleteRow').hidden = !c;
    fieldError('cfNameField', 'cfNameErr', false);
    $('cfCompanyField').classList.remove('is-bad');
    openSheet('sh-contact');
  }

  /* ══ REPORT ══ */
  const repState = { grouping: null, cover: true, planmap: true, photos: true, crops: true, closed: false, trade: null };

  function renderReport() {
    const p = Store.activeProject();
    $('repForm').hidden = !p;
    $('repFoot').hidden = !p;
    $('repEmpty').hidden = !!p;
    if (!p) { $('repSub').textContent = 'No project open'; return; }
    $('repSub').textContent = p.name;
    if (!$('repTitle').value) $('repTitle').value = 'Snag list';
    if (!repState.grouping) repState.grouping = Store.settings().grouping || 'room';

    for (const b of $('repGroup').children) b.classList.toggle('is-on', b.dataset.g === repState.grouping);
    for (const b of $('repInclude').children) b.classList.toggle('is-on', !!repState[b.dataset.k]);

    const trades = [...new Set(Store.forProject(p.id, { includeClosed: repState.closed }).map(d => d.trade || 'Unassigned'))].sort();
    if (repState.trade && !trades.includes(repState.trade)) repState.trade = null;
    const box = $('repTrades');
    box.innerHTML = '';
    const mk = (label, val) => {
      const b = el('button', 'chip' + (repState.trade === val ? ' is-on' : ''), label);
      b.addEventListener('click', () => { repState.trade = val; renderReport(); });
      box.appendChild(b);
    };
    mk('Every trade', null);
    for (const t of trades) mk(t, t);

    const list = Store.forProject(p.id, { includeClosed: repState.closed, trade: repState.trade });
    const photos = list.reduce((a, d) => a + Math.min(3, d.photos.length), 0);
    const sum = $('repSummary');
    sum.innerHTML = '';
    const l1 = el('p');
    l1.appendChild(el('b', null, `${list.length} defect${list.length === 1 ? '' : 's'}`));
    l1.appendChild(document.createTextNode(` will be listed, with ${photos} photograph${photos === 1 ? '' : 's'}.`));
    sum.appendChild(l1);
    const open = list.filter(d => !Store.isDone(d.status)).length;
    sum.appendChild(el('p', null, `${open} still open. ${list.length - open} closed out.` +
      (repState.closed ? '' : ' Closed defects are left out; switch on Closed defects to include them.')));
    $('repPreviewBtn').disabled = false;

    const hist = Store.reports(p.id);
    const hb = $('repHistory');
    hb.innerHTML = '';
    $('repHistoryEmpty').hidden = hist.length > 0;
    for (const r of hist.slice(0, 12)) {
      const c = el('div', 'card');
      const h = el('div', 'card-h');
      h.appendChild(el('b', null, r.title));
      h.appendChild(el('span', 'card-meta', new Date(r.at).toLocaleDateString()));
      c.appendChild(h);
      c.appendChild(el('p', 'card-meta',
        `${r.count} defect${r.count === 1 ? '' : 's'}${r.trade ? ', ' + r.trade + ' only' : ''}  /  ${r.pages} page${r.pages === 1 ? '' : 's'}`));
      hb.appendChild(c);
    }
  }

  async function assemble(tradeOverride) {
    const p = Store.activeProject();
    if (!p) return null;
    const opts = {
      title: $('repTitle').value.trim() || 'Snag list',
      conditions: $('repConditions').value.trim(),
      grouping: repState.grouping,
      cover: repState.cover, planmap: repState.planmap, photos: repState.photos,
      crops: repState.crops, closed: repState.closed,
      trade: tradeOverride === undefined ? repState.trade : tradeOverride
    };
    busy('Assembling the report', .05);
    /* The progress overlay swallows Back while it is up, so nothing may leave it up. */
    try {
      const d = await Report.build(p, opts, f => busy('Assembling the report', f));
      busy(false);
      docOpts = opts;
      return d;
    } catch (e) {
      busy(false);
      toast('The report could not be assembled from this project.');
      return null;
    }
  }

  async function previewReport() {
    doc = await assemble();
    if (!doc) return;
    $('prevTitle').textContent = doc.title;
    $('prevCount').textContent =
      `${doc.pages.length} page${doc.pages.length === 1 ? '' : 's'}, ${doc.count} defect${doc.count === 1 ? '' : 's'}.`;
    const box = $('prevPages');
    box.innerHTML = '';
    openSheet('sh-preview');
    const w = Math.min(560, box.clientWidth || 340);
    const scale = w / Report.A4.w;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    doc.pages.forEach((pg, i) => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(Report.A4.w * scale * dpr);
      cv.height = Math.round(Report.A4.h * scale * dpr);
      cv.style.aspectRatio = `${Report.A4.w} / ${Report.A4.h}`;
      box.appendChild(cv);
      setTimeout(() => {
        PDF.toCanvas(pg, cv, scale * dpr, doc.assets);
        cv.classList.add('in');
      }, 90 + i * 130);
    });

    const p = Store.activeProject();
    const trades = [...new Set(Store.forProject(p.id, { includeClosed: repState.closed }).map(d => d.trade || 'Unassigned'))].sort();
    const sp = $('prevSplitList');
    sp.innerHTML = '';
    $('prevSplit').hidden = trades.length < 2 || !!repState.trade;
    for (const t of trades) {
      const n = Store.forProject(p.id, { includeClosed: repState.closed, trade: t }).length;
      const c = el('div', 'card');
      const h = el('div', 'card-h');
      h.appendChild(el('b', null, t));
      h.appendChild(el('span', 'card-meta', `${n} defect${n === 1 ? '' : 's'}`));
      c.appendChild(h);
      c.appendChild(el('p', 'card-meta', 'Send only these pages'));
      c.addEventListener('click', async () => {
        const d2 = await assemble(t);
        if (d2) sendDoc(d2, true, t);
      });
      sp.appendChild(c);
    }
  }

  function fileName(d, trade) {
    const p = d.project;
    const clean = s => String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return `${clean(p.name)}-${clean(d.title)}${trade ? '-' + clean(trade) : ''}-${Store.today()}.pdf`;
  }

  function sendDoc(d, share, trade) {
    busy('Writing the PDF', .6);
    setTimeout(() => {
      try {
        const bytes = Report.toBytes(d);
        busy(false);
        deliver(fileName(d, trade), 'application/pdf', bytes, share);
        Store.logReport({ projectId: d.project.id, title: d.title, count: d.count, pages: d.pages.length, trade: trade || null });
        renderReport();
      } catch (e) {
        busy(false);
        toast('The PDF could not be written.');
      }
    }, 30);
  }

  /* ══ SETUP ══ */
  async function renderSetup() {
    const o = Store.org();
    $('orgName').value = o.name || '';
    $('orgFooter').value = o.footer || '';
    $('setHaptics').checked = !!Store.settings().haptics;
    $('setKeepAwake').checked = !!Store.settings().keepAwake;
    const img = $('logoImg'), ph = $('logoPlaceholder');
    if (o.logo) {
      const u = await Media.url(o.logo);
      if (u) { img.src = u; img.hidden = false; ph.hidden = true; $('logoClear').hidden = false; }
    } else { img.hidden = true; ph.hidden = false; $('logoClear').hidden = true; }
    renderContacts();
    const u = await Media.usage();
    const mb = (u.bytes / 1048576).toFixed(1);
    $('dataNote').textContent =
      `${Store.projects().length} project${Store.projects().length === 1 ? '' : 's'}, ` +
      `${Store.defects().length} defect${Store.defects().length === 1 ? '' : 's'}, ` +
      `${u.count} image${u.count === 1 ? '' : 's'} using about ${mb} MB on this phone.`;
  }

  async function backup() {
    busy('Packing everything up', .1);
    await new Promise(r => setTimeout(r, 20));
    const snap = Store.snapshot();
    const ids = new Set();
    if (snap.org.logo) ids.add(snap.org.logo);
    for (const p of snap.projects) for (const pl of p.plans) if (pl.media) ids.add(pl.media);
    for (const d of snap.defects) for (const ph of d.photos) if (ph.media) ids.add(ph.media);
    const media = {};
    let i = 0;
    for (const id of ids) {
      const rec = await Media.get(id);
      if (rec) media[id] = { w: rec.w, h: rec.h, b: b64(rec.bytes) };
      busy('Packing everything up', .1 + .8 * (++i / Math.max(1, ids.size)));
    }
    const json = JSON.stringify({ app: 'punchlist', version: 1, at: Date.now(), data: snap, media });
    const bytes = new TextEncoder().encode(json);
    busy(false);
    deliver(`punchlist-backup-${Store.today()}.json`, 'application/json', bytes, false);
  }

  async function restore(file) {
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch (e) { toast('That file is not a Punchlist backup.'); return; }
    if (!parsed || parsed.app !== 'punchlist' || !parsed.data) { toast('That file is not a Punchlist backup.'); return; }
    const ok = await ask('Replace everything?', 'Restoring a backup removes the projects, defects and photos on this phone and puts the backup in their place.', 'Restore');
    if (!ok) return;
    busy('Restoring', .1);
    await Media.clear();
    const media = parsed.media || {};
    const keys = Object.keys(media);
    let i = 0, dropped = 0;
    for (const id of keys) {
      // one unreadable image in the file must not cost the user the rest of the backup
      try {
        const bin = atob(media[id].b);
        const u8 = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
        await Media.putBytes(u8, media[id].w, media[id].h);
      } catch (e) { dropped++; }
      busy('Restoring', .1 + .85 * (++i / Math.max(1, keys.length)));
    }
    Store.restore(parsed.data);
    busy(false);
    toast(dropped ? `Backup restored, ${dropped} image${dropped === 1 ? '' : 's'} could not be read` : 'Backup restored');
    Plan.currentMedia = null;
    show('projects');
  }

  /* ══ ONBOARDING ══ */
  let obIndex = 0;
  function renderOnboard() {
    const cards = $('obTrack').children;
    for (let i = 0; i < cards.length; i++) cards[i].classList.toggle('is-on', i === obIndex);
    const dots = $('obDots');
    dots.innerHTML = '';
    for (let i = 0; i < cards.length; i++) dots.appendChild(el('i', i === obIndex ? 'is-on' : null));
    $('obNext').textContent = obIndex === cards.length - 1 ? 'Start' : 'Next';
  }

  /* ══ WIRING ══ */
  function on(id, ev, fn) { const e = $(id); if (e) e.addEventListener(ev, fn); }

  function wire() {
    for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => show(t.dataset.view));
    for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => closeSheet(b.dataset.close));

    on('obNext', 'click', () => {
      const n = $('obTrack').children.length;
      if (obIndex < n - 1) { obIndex++; renderOnboard(); return; }
      Store.settings({ onboarded: true });
      Store.save();
      $('onboard').hidden = true;
      show('projects');
    });

    on('newProjBtn', 'click', () => openProject(null));
    on('newProjBtn2', 'click', () => openProject(null));
    on('sampleBtn', 'click', async () => {
      busy('Drawing the sample plan', .05);
      await new Promise(r => setTimeout(r, 30));
      await Demo.install(f => busy('Drawing the sample plan', f));
      busy(false);
      Plan.currentMedia = null;
      show('walk');
      toast('Sample project ready. Tap a pin, or start a walk.');
    });

    on('projSave', 'click', () => {
      const name = capped('pfName');
      if (!name) { fieldError('pfNameField', 'pfNameErr', true); $('pfName').focus(); return; }
      fieldError('pfNameField', 'pfNameErr', false);
      const fields = { name, client: capped('pfClient'), address: capped('pfAddress'), ref: capped('pfRef') };
      if (editProjectId) Store.updateProject(editProjectId, fields);
      else { const p = Store.addProject(fields); editProjectId = p.id; Store.setActive(p.id); }
      Store.save();
      const p = Store.project(editProjectId);
      if (!p.plans.length) {
        $('projSheetTitle').textContent = 'Project';
        $('projDeleteRow').hidden = false;
        renderPlanRows();
        toast('Saved. Add a plan to start walking.');
        return;
      }
      closeSheet('sh-project');
      renderProjects();
      renderWalk();
      toast('Project saved');
    });
    on('projDelete', 'click', async () => {
      const p = Store.project(editProjectId);
      if (!p) return;
      const ok = await ask('Delete ' + p.name + '?', 'Its plans, defects and photographs are removed from this phone. This cannot be undone.', 'Delete');
      if (!ok) return;
      await Media.del(Store.deleteProject(p.id));
      Store.save();
      closeSheet('sh-project');
      Plan.currentMedia = null;
      show('projects');
      toast('Project deleted');
    });

    on('addPlanBtn', 'click', openPlanSheet);
    on('addPlanBtn2', 'click', () => { editProjectId = Store.settings().activeProject; openPlanSheet(); });
    on('planPick', 'change', e => { const f = e.target.files[0]; e.target.value = ''; loadPlanFile(f); });
    on('planApply', 'click', applyPlan);
    $('deskewHandles').addEventListener('pointerdown', handleDrag);
    for (const b of $('planTweaks').children) {
      b.addEventListener('click', () => {
        if (b.dataset.k === 'square') planDraft.square = !planDraft.square;
        else planDraft.clean = !planDraft.clean;
        syncPlanChips();
      });
    }

    on('planSwitchBtn', 'click', () => {
      const p = Store.activeProject();
      if (!p) return;
      const box = $('planPickList');
      box.innerHTML = '';
      const cur = activePlan();
      for (const pl of p.plans) {
        const c = el('div', 'card');
        const h = el('div', 'card-h');
        h.appendChild(el('b', null, pl.label));
        if (cur && pl.id === cur.id) h.appendChild(el('span', 'card-meta', 'Showing'));
        c.appendChild(h);
        const n = Store.forProject(p.id, { includeClosed: true, planId: pl.id }).length;
        c.appendChild(el('p', 'card-meta', `${n} defect${n === 1 ? '' : 's'}`));
        c.addEventListener('click', () => {
          Store.settings({ activePlan: pl.id });
          Plan.currentMedia = null;
          closeSheet('sh-plans');
          renderWalk();
        });
        box.appendChild(c);
      }
      openSheet('sh-plans');
    });

    on('walkFab', 'click', () => {
      const pl = activePlan();
      if (!pl) { toast('Add a plan to this project first.'); return; }
      setWalking(!walking);
      N.buzz(12, 150);
    });
    on('fitBtn', 'click', () => { Plan.fit(); paintPins(); });
    on('filterBtn', 'click', () => { filterMode = (filterMode + 1) % FILTERS.length; paintPins(); });

    on('shutterBtn', 'click', shoot);
    on('camStart', 'click', startCam);
    on('camFlip', 'click', () => { camFacing = camFacing === 'environment' ? 'user' : 'environment'; startCam(); });
    on('camPick', 'change', async e => {
      const files = [...e.target.files];
      e.target.value = '';
      if (!files.length) return;
      busy('Adding photos', .3);
      for (const f of files.slice(0, 5)) {
        try { const rec = await Media.fromFile(f, 1600, .72); cap.photos.push({ media: rec.id, role: photoRole(), at: Date.now() }); }
        catch (err) { toast('One file could not be read.'); }
      }
      busy(false);
      renderThumbs();
    });
    on('capNote', 'input', e => { cap.note = e.target.value; });
    on('capDueDate', 'change', e => { cap.due = e.target.value || null; buildDueChips(); });
    on('capSaveNext', 'click', saveCapture);
    on('capSave', 'click', async () => {
      if (!cap || !cap.id) return;
      const ok = await ask('Delete defect ' + cap.n + '?', 'The pin, its note and its photographs go with it.', 'Delete');
      if (!ok) return;
      await Media.del(Store.deleteDefect(cap.id));
      closeSheet('sh-capture');
      paintPins();
      renderWalk();
      toast('Defect deleted');
    });
    on('defEdit', 'click', () => { const id = curDefectId; closeSheet('sh-defect'); openCapture(id); });

    for (const b of $('repGroup').children) b.addEventListener('click', () => { repState.grouping = b.dataset.g; Store.settings({ grouping: b.dataset.g }); renderReport(); });
    for (const b of $('repInclude').children) b.addEventListener('click', () => { repState[b.dataset.k] = !repState[b.dataset.k]; renderReport(); });
    on('repPreviewBtn', 'click', previewReport);
    on('prevShare', 'click', () => { if (doc) sendDoc(doc, true, repState.trade); });
    on('prevSave', 'click', () => { if (doc) sendDoc(doc, false, repState.trade); });

    on('newContactBtn', 'click', () => openContact(null));
    on('contactSave', 'click', () => {
      const name = capped('cfName'), company = capped('cfCompany');
      if (!name && !company) {
        fieldError('cfNameField', 'cfNameErr', true);
        $('cfCompanyField').classList.add('is-bad');
        $('cfName').focus();
        return;
      }
      fieldError('cfNameField', 'cfNameErr', false);
      $('cfCompanyField').classList.remove('is-bad');
      Store.saveContact({
        id: editContactId, name, company, trade: $('cfTrade').value,
        phone: capped('cfPhone'), email: capped('cfEmail')
      });
      Store.save();
      closeSheet('sh-contact');
      renderContacts();
      toast('Contact saved');
    });
    on('contactDelete', 'click', async () => {
      const ok = await ask('Delete this contact?', 'Defects assigned to them go back to nobody.', 'Delete');
      if (!ok) return;
      Store.deleteContact(editContactId);
      Store.save();
      closeSheet('sh-contact');
      renderContacts();
    });

    on('orgName', 'input', e => Store.org({ name: e.target.value.trim() }));
    on('orgFooter', 'input', e => Store.org({ footer: e.target.value.trim() }));
    on('setHaptics', 'change', e => Store.settings({ haptics: e.target.checked }));
    on('setKeepAwake', 'change', e => { Store.settings({ keepAwake: e.target.checked }); if (!e.target.checked) N.awake(false); });
    on('logoBtn', 'click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.addEventListener('change', async () => {
        const f = inp.files[0];
        if (!f) return;
        busy('Adding the logo', .4);
        try {
          const old = Store.org().logo;
          const rec = await Media.fromFile(f, 700, .9);
          Store.org({ logo: rec.id });
          if (old && old !== rec.id) await Media.del(old);
          Store.save();
        } catch (e) { toast('That image could not be read.'); }
        busy(false);
        renderSetup();
      });
      inp.click();
    });
    on('logoClear', 'click', async () => {
      const old = Store.org().logo;
      Store.org({ logo: null });
      if (old) await Media.del(old);
      Store.save();
      renderSetup();
    });

    on('backupBtn', 'click', backup);
    on('restoreFile', 'change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) restore(f); });
    on('csvBtn', 'click', () => {
      const p = Store.activeProject();
      if (!p) { toast('Open a project first.'); return; }
      const bytes = new TextEncoder().encode(Store.csv(p.id));
      deliver(`${p.name.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40)}-defects.csv`, 'text/csv', bytes, false);
    });
    on('eraseBtn', 'click', async () => {
      const ok = await ask('Erase everything?', 'Every project, defect and photograph on this phone is deleted. There is no server copy. This cannot be undone.', 'Erase');
      if (!ok) return;
      busy('Erasing', .5);
      await Media.clear();
      Store.erase();
      busy(false);
      location.reload();
    });

    on('confirmYes', 'click', () => closeConfirm(true));
    on('confirmNo', 'click', () => closeConfirm(false));
    $('confirm').addEventListener('click', e => { if (e.target.id === 'confirm') closeConfirm(false); });
  }

  /* ══ LIFECYCLE ══ */
  function back() {
    if (!$('confirm').hidden) { closeConfirm(false); return true; }
    if (!$('busy').hidden) return true;
    if (!$('onboard').hidden) {
      if (obIndex === 0) return false;
      obIndex--; renderOnboard(); return true;
    }
    const top = topSheet();
    if (top) { closeSheet(top); return true; }
    if (walking) { setWalking(false); return true; }
    if (view !== 'projects') { show('projects'); return true; }
    return false;
  }
  function onPause() {
    camWasOn = !!camStream;
    stopCam();
    N.awake(false);
    Store.save();                      // a debounced write must not die with the process
  }
  function onResume() {
    if (walking && Store.settings().keepAwake) N.awake(true);
    if (camWasOn && sheets.includes('sh-capture')) startCam();
    camWasOn = false;
  }

  /* Every glyph in the app comes from icons.js so the launcher mark, the tab bar and the
     drawn empty states are one drawing rather than four. */
  function paintChrome() {
    const tabIcon = { projects: 'projects', walk: 'walk', report: 'report', setup: 'setup' };
    for (const t of document.querySelectorAll('.tab')) t.insertAdjacentHTML('afterbegin', Icons.icon(tabIcon[t.dataset.view], { size: 23 }));
    $('brandMark').innerHTML = Icons.mark(36, { plate: false });
    $('obMark').innerHTML = Icons.mark(128);
    $('artProjects').innerHTML = Icons.emptyProjects();
    $('artPlan').innerHTML = Icons.emptyPlan();
    $('artReport').innerHTML = Icons.emptyReport();
    $('artMissing').innerHTML = Icons.emptyMissingPlan();
    $('artNoProject').innerHTML = Icons.emptyProjects();
    $('artContacts').innerHTML = Icons.emptyContacts();
    $('shutterBtn').innerHTML = Icons.icon('camera', { size: 30, w: 2 });
    $('walkFab').querySelector('.wf-icon').innerHTML = Icons.icon('walk', { size: 20 });
    $('fitBtn').innerHTML = Icons.icon('fit', { size: 17 }) + '<span>Fit</span>';
    $('camFlip').insertAdjacentHTML('afterbegin', Icons.icon('flip', { size: 17 }));
    $('camPickLabel').insertAdjacentHTML('afterbegin', Icons.icon('files', { size: 17 }));
    $('repPreviewBtn').insertAdjacentHTML('afterbegin', Icons.icon('report', { size: 19 }));
    $('prevSave').insertAdjacentHTML('afterbegin', Icons.icon('down', { size: 19 }));
    $('backupBtn').insertAdjacentHTML('afterbegin', Icons.icon('down', { size: 17 }));
    $('csvBtn').insertAdjacentHTML('afterbegin', Icons.icon('grid', { size: 17 }));
    $('newProjBtn').insertAdjacentHTML('afterbegin', Icons.icon('plus', { size: 17 }));
    $('newContactBtn').insertAdjacentHTML('afterbegin', Icons.icon('person', { size: 17 }));
    $('eraseBtn').insertAdjacentHTML('afterbegin', Icons.icon('trash', { size: 17 }));
  }

  function start() {
    Plan.mount({ stage: $('planStage'), canvas: $('planCanvas'), img: $('planImg'), layer: $('pinLayer') });
    paintChrome();
    wire();
    if (!Store.settings().onboarded) {
      $('onboard').hidden = false;
      $('tabs').hidden = true;
      renderOnboard();
    } else {
      show('projects');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  return { back, onPause, onResume, show, toast, _store: () => Store };
})();

window.App = App;
