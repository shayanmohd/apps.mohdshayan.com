/* Contact Sheet. Camera, counter, lab, sheets, shelf, settings.
   The rule the whole file obeys: nothing that came out of the shutter is drawn
   on screen until its roll has developed. */
const App = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const pad = Store.pad;

  let view = 'camera';
  /* Where Back goes from each screen. A flat map instead of a history stack, so the
     Back gesture always walks towards the camera and always leaves the app, however
     long the user has been wandering. */
  const PARENT = { sheets: 'camera', sheet: 'sheets', frame: 'sheet',
                   stocks: 'camera', stock: 'stocks', settings: 'sheets' };
  let curRoll = null, curFrame = 0, curStock = null;
  let winding = false, developing = false, pendingStock = null, pendingPush = 0;
  let flashWanted = false, grainUrl = '';

  /* One tap is one action. A second tap inside the same gesture is the phone bouncing,
     not the user asking twice, and on this app asking twice costs a roll. */
  function once(fn, ms) {
    let busy = false;
    return async function (...a) {
      if (busy) return;
      busy = true;
      try { return await fn.apply(this, a); }
      finally { setTimeout(() => { busy = false; }, ms || 600); }
    };
  }

  /* ---------- chrome ---------- */
  let toastTimer = null;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }

  const MODALS = ['#rewind', '#rollPanel', '#sheetMenu'];
  function openModal(id) { MODALS.forEach(m => { $(m).hidden = m !== id; }); }
  function closeModals() { MODALS.forEach(m => { $(m).hidden = true; }); }
  const modalOpen = () => MODALS.some(m => !$(m).hidden);

  function show(v) {
    view = v;
    document.body.classList.toggle('on-camera', v === 'camera');
    $$('#stage .screen').forEach(s => { s.hidden = s.id !== 'v-' + v; });
    if (v === 'camera') startCamera(); else Cam.stop();
    if (v === 'sheets') renderSheets();
    if (v === 'sheet') renderSheet();
    if (v === 'stocks') renderShelf();
    if (v === 'settings') renderSettings();
  }

  /* ---------- camera ---------- */
  function makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const d = x.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 90 + ((Math.random() * 76) | 0);
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    return c.toDataURL('image/png');
  }

  function fitViewfinder() {
    const shell = $('#vfShell'), wrap = $('#vfWrap');
    if (!shell || !wrap) return;
    const w = shell.clientWidth, h = shell.clientHeight;
    if (!w || !h) return;
    let vw = w, vh = w * 1.5;
    if (vh > h) { vh = h; vw = h / 1.5; }
    wrap.style.width = Math.round(vw) + 'px';
    wrap.style.height = Math.round(vh) + 'px';
  }

  function applyStockHint() {
    const r = Store.roll;
    const vf = $('#vf'), grain = $('#vfGrain');
    if (!r) { vf.style.filter = 'grayscale(1) brightness(.35)'; grain.style.opacity = 0; return; }
    const s = Stocks.get(r.stock);
    vf.style.filter = s.hint;
    grain.style.backgroundImage = `url(${grainUrl})`;
    grain.style.opacity = String(Math.min(0.30, 0.07 + s.grain.amp * 1.7));
  }

  function camState() {
    const box = $('#vfState'), txt = $('#vfStateText'), retry = $('#vfRetry');
    const s = Cam.state;
    if (!Store.roll) { box.hidden = true; return; }
    if (s === 'ready') { box.hidden = true; return; }
    box.hidden = false;
    retry.hidden = s !== 'denied';
    txt.textContent =
      s === 'starting' ? 'Opening the back.' :
      s === 'denied' ? 'Contact Sheet needs the camera to take a photograph. Nothing it sees leaves this device: there is no internet permission in the app at all.' :
      s === 'missing' ? 'This device has no camera the browser can reach.' :
      'The camera did not open.';
  }

  async function startCamera() {
    fitViewfinder();
    applyStockHint();
    if (!Store.roll) { Cam.stop(); camState(); renderCamera(); return; }
    if (Cam.live) { camState(); return; }
    await Cam.start(Store.settings().facing);
    camState();
    renderCamera();
  }

  function renderCamera() {
    const r = Store.roll;
    const n = Store.left();
    const full = !!r && n === 0;
    $('#cStock').textContent = r ? Stocks.get(r.stock).name.toUpperCase() : 'No roll';
    $('#cNum').textContent = r ? pad(n) : '--';
    $('#cNum').classList.toggle('low', !!r && n <= 6 && n > 0);
    $('#cNum').classList.toggle('spent', full);
    $('#cNum').classList.toggle('none', !r);
    $('#cCap').textContent = r ? (full ? 'roll finished' : n === 1 ? 'frame left' : 'frames left') : 'in the camera';
    $('#emptyCam').hidden = !!r;
    $('#fullCam').hidden = !full;
    $('#controls').hidden = !r || full;
    $('#vfShell').hidden = !r || full;
    const fOn = flashWanted && Cam.torchOn;
    $('#flashBtn').classList.toggle('on', fOn);
    $('#flashBtn').setAttribute('aria-pressed', String(fOn));
    const fIco = $('#flashBtn .ctl-ico');
    if (fIco && fIco.dataset.ico !== (fOn ? 'flash' : 'flashOff')) {
      fIco.dataset.ico = fOn ? 'flash' : 'flashOff';
      fIco.innerHTML = Mark.ICONS[fIco.dataset.ico];
    }
    $('#shutterBtn').disabled = !(r && n > 0 && Cam.live && !winding);
  }

  function bladeFlash() {
    const wrap = $('#vfWrap');
    let el = wrap.querySelector('.shot-flash');
    if (!el) { el = document.createElement('div'); el.className = 'shot-flash'; wrap.appendChild(el); }
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  /** 1.2 seconds of ratchet. The pacing of the whole app lives in this function.
      The bar is real progress through a real wait, not decoration, so it is driven by
      frames rather than a CSS transition: with animations turned off at the system level
      a transition would snap to full and tell the user the wait was over when it was not. */
  function windOn(ms) {
    return new Promise(res => {
      const bar = $('#ratchet'), box = $('#windOn'), gate = $('#counterGate');
      const pitch = Mark.gatePitchPx(gate ? gate.offsetWidth || 78 : 78);
      const dur = ms || 1200, t0 = performance.now();
      box.hidden = false;
      bar.style.width = '0%';
      Sound.windOn(dur);
      Sound.hWind();
      const step = now => {
        const p = Math.min(1, (now - t0) / dur);
        const e = p < 1 ? p * p * 0.55 + p * 0.45 : 1;   // the sprocket bites, then runs on
        bar.style.width = (e * 100).toFixed(2) + '%';
        // the sprocket run in the counter gate advances exactly one perforation per frame
        if (gate) gate.style.setProperty('--wind', (-e * pitch).toFixed(2) + 'px');
        if (p < 1) requestAnimationFrame(step);
        else {
          if (gate) gate.style.setProperty('--wind', '0px');   // one pitch on is back in phase
          setTimeout(() => { box.hidden = true; res(); }, 60);
        }
      };
      requestAnimationFrame(step);
    });
  }

  async function fire() {
    const r = Store.roll;
    if (winding || !r || Store.left() <= 0 || !Cam.live) return;
    winding = true;
    renderCamera();
    Sound.wake();
    Sound.shutter();
    Sound.hShutter();
    bladeFlash();

    let blob = null;
    try { blob = await Cam.capture(Store.settings().facing); } catch (e) { blob = null; }
    if (!blob) {
      winding = false; renderCamera();
      toast('The camera did not give a frame. Nothing was used up.');
      return;
    }
    const f = Store.recordFrame({ flash: flashWanted && Cam.torchOn, discreet: Store.settings().sound === 'discreet' });
    if (!f) { winding = false; renderCamera(); return; }
    try { await DB.put(DB.negKey(r.id, f.n), blob); }
    catch (e) { toast('This device would not store the frame.'); }

    if (Store.left() === 0) {
      winding = false;
      renderCamera();
      handIn(r, 'Rewinding');
      return;
    }
    await windOn(1200);
    winding = false;
    renderCamera();
  }

  /* ---------- the counter at the lab ---------- */
  function handIn(roll, kicker) {
    pendingPush = 0;
    $('#rwK').textContent = kicker;
    $('#rwH').textContent = `Roll ${pad(roll.no)}. ${roll.frames.length} exposure${roll.frames.length === 1 ? '' : 's'} on ${Stocks.get(roll.stock).name}.`;
    $('#rwLab').hidden = true;
    openModal('#rewind');
    Sound.rewind();
    Sound.hRewind();
    setPushSeg(0);
    setTimeout(() => {
      $('#rwK').textContent = 'At the counter';
      $('#rwLab').hidden = false;
    }, 2200);
  }

  const PUSH_HELP = {
    '-1': 'Pull one stop. Gentler contrast, finer grain, and highlights that hold on longer.',
    '0': 'Develop it normally. The stock does what the box says.',
    '1': 'Push one stop. Brighter, harder, grainier. Good for a roll you shot in bad light.'
  };
  function setPushSeg(v) {
    pendingPush = v;
    $$('#pushSeg button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === v));
    $('#pushHelp').textContent = PUSH_HELP[String(v)];
  }

  function commitHandIn() {
    const r = Store.sendToLab();
    closeModals();
    if (!r) return;
    Store.setPush(r.id, pendingPush);
    scheduleNotifications();
    const line = `Roll ${pad(r.no)} is at the lab. Back ${Store.backLine(r.developAt)}.`;
    if (pendingStock) {
      const s = pendingStock; pendingStock = null;
      doLoad(s);
      toast(line, 4200);
    } else {
      show('camera');
      renderCamera();
      toast(line, 4600);
    }
  }

  /* ---------- loading a roll ---------- */
  function requestLoad(stockId) {
    if (Store.roll && Store.roll.frames.length > 0) {
      pendingStock = stockId;
      handIn(Store.roll, 'Rewinding');
      return;
    }
    if (Store.roll) Store.unload();   // an unexposed roll just comes back out
    doLoad(stockId);
  }

  async function doLoad(stockId) {
    Store.loadRoll(stockId);
    scheduleNotifications();
    show('camera');
    renderCamera();
    applyStockHint();
    Sound.wake();
    Sound.cartridge();
    Sound.hLoad();
    setTimeout(() => windOn(900), 260);
    renderCamera();
    toast(`${Stocks.get(stockId).name} loaded. 36 exposures.`, 3200);
  }

  /* ---------- the lab ---------- */
  async function checkLab() {
    if (developing) return false;
    const dueRolls = Store.due();
    if (!dueRolls.length) return false;
    developing = true;
    Cam.stop();
    show('lab');
    let last = dueRolls[0];                       // newest roll: the one to open afterwards
    try {
      for (const r of dueRolls.slice().reverse()) {  // develop oldest first, the way a batch runs
        $('#labRoll').textContent = `Roll ${pad(r.no)}`;
        $('#labN').textContent = `0 of ${r.frames.length}`;
        setLabProgress(0, r.frames.length);
        await new Promise(res => setTimeout(res, 500));
        await Film.developRoll(r, (d, t) => setLabProgress(d, t));
      }
    } catch (e) {
      developing = false;
      console.warn('the batch stopped early', e);
      show('sheets');
      toast('Development stopped early. What did come back is in the archive.', 4600);
      return true;
    }
    developing = false;
    Sheet.forget();
    Sound.wake();
    Sound.envelope();
    scheduleNotifications();
    if (last) {
      curRoll = Store.byId(last.id);
      show('sheet');
      toast(`Roll ${pad(last.no)} is back. ${last.frames.length} exposures.`, 4200);
    } else {
      show('camera');
    }
    return true;
  }

  function setLabProgress(done, total) {
    const pct = total ? Math.round(done / total * 100) : 0;
    $('#labFill').style.width = pct + '%';
    $('#labN').textContent = `${done} of ${total}`;
    const sp = $('#labSpool');
    if (sp) sp.style.setProperty('--turn', (done * 42) + 'deg');
  }

  /* ---------- sheets archive ---------- */
  let renderToken = 0;
  async function renderSheets() {
    const mine = ++renderToken;
    const list = $('#sheetsList');
    const rolls = Store.rolls;
    list.innerHTML = '';
    $('#sheetsEmpty').hidden = rolls.length > 0;
    for (const r of rolls) {
      if (mine !== renderToken) return;
      const s = Stocks.get(r.stock);
      const card = document.createElement('button');
      card.className = 'rollcard' + (r.state === 'lab' ? ' waiting' : '');
      const kept = Store.keepers(r).length;
      if (r.state === 'lab') {
        card.innerHTML =
          `<div class="rc-top"><span class="rc-stock">${s.name}</span><span class="rc-no">Roll ${pad(r.no)}</span></div>` +
          `<p class="rc-meta">${r.frames.length} exposure${r.frames.length === 1 ? '' : 's'}. ${Store.dateSpan(r)}.</p>` +
          `<div class="rc-wait"><span class="rc-back">At the lab</span><span class="dashes"></span>` +
          `<span class="rc-no">${Store.countdown(r.developAt)}</span></div>` +
          `<p class="rc-meta">Back ${Store.backLine(r.developAt)}.</p>`;
        card.onclick = () => toast(`Roll ${pad(r.no)} comes back ${Store.backLine(r.developAt)}. Nothing to see until then.`, 3600);
      } else {
        const urls = await Sheet.strip(r, 6);
        card.innerHTML =
          `<div class="rc-top"><span class="rc-stock">${s.name}</span><span class="rc-no">Roll ${pad(r.no)}</span></div>` +
          `<div class="rc-strip">${urls.map(u => u ? `<img alt="" src="${u}">` : '<span class="blank"></span>').join('')}</div>` +
          `<p class="rc-meta">${r.frames.length} exposures. ${Store.dateSpan(r)}. ` +
          `<span class="${kept ? 'rc-kept' : ''}">${kept ? kept + ' kept' : 'none kept'}</span></p>`;
        card.onclick = () => { curRoll = r; show('sheet'); };
      }
      if (mine !== renderToken) return;
      card.style.setProperty('--i', String(list.children.length));
      list.appendChild(card);
    }
  }

  /* ---------- one sheet ---------- */
  async function renderSheet() {
    const r = curRoll && Store.byId(curRoll.id);
    if (!r) { show('sheets'); return; }
    curRoll = r;
    const s = Stocks.get(r.stock);
    $('#shTitle').textContent = 'Roll ' + pad(r.no);
    $('#shStock').textContent = s.name.toUpperCase();
    $('#shMeta').textContent = `${r.frames.length} exposures. ${Store.dateSpan(r)}. Developed ${Store.clockTime(r.developedAt || r.developAt)}.`;
    const marks = [];
    if (r.push > 0) marks.push('Push +1');
    if (r.push < 0) marks.push('Pull -1');
    if (r.discreet) marks.push('Discreet');
    $('#shMarks').innerHTML = marks.map(m => `<span>${m}</span>`).join('');
    $('#shMarks').hidden = !marks.length;
    updateKept();
    const mine = ++renderToken;
    await Sheet.renderGrid(r, $('#shGrid'));
    if (mine !== renderToken) return;
    requestAnimationFrame(() => Sheet.fitGrid($('#shGrid'), $('#shScroll'), 288));
  }
  function updateKept() {
    const r = curRoll && Store.byId(curRoll.id);
    if (!r) return;
    const k = Store.keepers(r).length;
    const el = $('#shKept');
    el.textContent = k ? `${k} kept of ${r.frames.length}` : 'Nothing kept yet';
    el.classList.toggle('some', k > 0);
  }

  /* ---------- one frame ---------- */
  async function openFrame(n) {
    const r = curRoll && Store.byId(curRoll.id);
    if (!r) return;
    curFrame = n;
    const f = r.frames.find(x => x.n === n);
    if (!f) return;
    const s = Stocks.get(r.stock);
    $('#frTitle').textContent = `Frame ${pad(n)}`;
    $('#frStock').textContent = s.name;
    $('#frMeta').innerHTML = [Store.longDate(f.at), Store.clockTime(f.at), 'Roll ' + pad(r.no)]
      .map(t => `<span>${t}</span>`).join('');
    const url = await DB.url(DB.frmKey(r.id, n));
    $('#frImg').src = url || '';
    $('#frPencilPath').setAttribute('d', Sheet.pencilPath(n));
    paintFrameButtons();
    show('frame');
  }
  function paintFrameButtons() {
    const r = curRoll && Store.byId(curRoll.id);
    if (!r) return;
    const f = r.frames.find(x => x.n === curFrame);
    const kept = !!(f && f.keeper);
    $('#frKeepLab').textContent = kept ? 'Kept' : 'Keep';
    $('#frKeep').classList.toggle('on', kept);
    $('#frKeep').setAttribute('aria-pressed', String(kept));
    $('#frPencil').style.opacity = kept ? '1' : '0';
    const share = $('#frShare');
    const used = r.shared && r.shared !== curFrame;
    share.disabled = false;
    share.classList.toggle('spent', !!used);
    $('#frShareLab').textContent = used ? `Frame ${pad(r.shared)} was sent`
      : (r.shared === curFrame ? 'Send it again' : 'Share this one');
  }

  /* ---------- the shelf ---------- */
  function boxHtml(s, rear) {
    const m = s.name.match(/^(.*?)\s+(\d+)$/);
    const nm = (m ? m[1] : s.name).toUpperCase();
    const num = m ? m[2] : String(s.iso);
    const kind = s.mono ? 'B&W negative' : s.sat > 1.2 ? 'Colour reversal' : 'Colour negative';
    const vars = `--paper:${s.box.paper};--ink:${s.box.ink};--band:${s.box.band}`;
    if (!rear) {
      return `<div class="box" data-style="${s.box.style}" style="${vars}">` +
        `<div class="b-band"></div><div class="b-name">${nm}</div>` +
        `<div class="b-iso">${num}</div>` +
        `<div class="b-foot">36 exp   ${kind}</div></div>`;
    }
    const rows = Stocks.spec(s).map(([k, v]) => `<div class="r-row"><b>${k}</b><span>${v}</span></div>`).join('');
    return `<div class="box rear" data-style="${s.box.style}" style="${vars}">` +
      `<div class="r-h">${nm} ${num}</div>${rows}<div class="r-h">${s.line}</div></div>`;
  }

  function renderShelf() {
    const shelf = $('#shelf');
    shelf.innerHTML = '';
    for (const s of Stocks.LIST) {
      const b = document.createElement('button');
      const inCamera = Store.roll && Store.roll.stock === s.id;
      b.innerHTML = boxHtml(s) +
        `<span class="under${inCamera ? ' loaded' : ''}">${inCamera ? 'In the camera' : s.line}</span>`;
      b.onclick = once(() => { curStock = s; renderStock(); show('stock'); });
      b.style.setProperty('--i', String(shelf.children.length));
      shelf.appendChild(b);
    }
  }

  function renderStock() {
    const s = curStock;
    if (!s) return;
    $('#stTitle').textContent = s.name;
    $('#stIso').textContent = 'ISO ' + s.iso;
    const box = $('#stBox');
    box.classList.remove('flip');
    box.innerHTML = `<div class="face front">${boxHtml(s)}</div><div class="face back">${boxHtml(s, true)}</div>`;
    box.onclick = () => { box.classList.toggle('flip'); Sound.tick(); Sound.hTap(); };
    $('#stNote').textContent = s.note;
    $('#stSpecs').innerHTML = Stocks.spec(s)
      .map(([k, v]) => `<div class="row"><span class="k2">${k}</span><span class="v">${v}</span></div>`).join('');
    drawCurve(s);
    const loaded = Store.roll && Store.roll.stock === s.id;
    const busy = Store.roll && Store.roll.frames.length > 0;
    $('#stLoad').textContent = loaded ? 'Already in the camera' : 'Load this roll';
    $('#stLoad').disabled = !!loaded;
    const warn = $('#stWarn');
    warn.hidden = !(busy && !loaded);
    if (!warn.hidden) {
      warn.textContent = `There is a roll in the camera with ${Store.roll.frames.length} exposure${Store.roll.frames.length === 1 ? '' : 's'} on it. Loading this one hands that roll in as it stands. The frames are not given back.`;
    }
  }

  function drawCurve(s) {
    const W = 260, H = 150, P = 14;
    const pts = Film.curvePoints(s, 40);
    const line = (arr, colour) => {
      const d = arr.map((v, i) => {
        const x = P + (W - P * 2) * (i / (arr.length - 1));
        const y = H - P - (H - P * 2) * v;
        return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      }).join(' ');
      return `<path class="ln" d="${d}" stroke="${colour}"/>`;
    };
    let g = `<line class="ax" x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}"/>` +
            `<line class="ax" x1="${P}" y1="${P}" x2="${P}" y2="${H - P}"/>` +
            `<line class="ax" x1="${P}" y1="${H - P}" x2="${W - P}" y2="${P}" stroke-dasharray="3 4"/>`;
    if (pts.y) g += line(pts.y, '#D6CDBC');
    else {
      g += line(pts.b, '#5C86C8');
      g += line(pts.g, '#69B183');
      g += line(pts.r, '#D4695C');
    }
    $('#stCurve').innerHTML = g;
  }

  /* ---------- settings ---------- */
  async function renderSettings() {
    const st = Store.settings();
    $('#setHour').value = String(st.developHour);
    $$('#setSound button').forEach(b => b.classList.toggle('on', b.dataset.v === st.sound));
    $('#setHaptics').checked = !!st.haptics;
    const hasNotify = !!(window.Native && window.Native.scheduleNotifications);
    $('#notifyField').hidden = !hasNotify;
    if (hasNotify) {
      let ok = true;
      try { ok = window.Native.notificationsAllowed(); } catch (e) {}
      $('#notifyState').textContent = ok
        ? 'On. You get one notice per roll, the morning it comes back.'
        : 'Off. Without it the roll still develops, but only once you open the app.';
      $('#notifyBtn').hidden = ok;
    }
    try {
      const bytes = await DB.usage();
      const mb = bytes / 1048576;
      const rolls = Store.rolls.length + (Store.roll ? 1 : 0);
      $('#usageLine').textContent =
        `${rolls} roll${rolls === 1 ? '' : 's'} on this device, using ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB.`;
    } catch (e) { $('#usageLine').textContent = 'Storage size is not readable here.'; }
  }

  function scheduleNotifications() {
    if (!(window.Native && window.Native.scheduleNotifications)) return;
    try { window.Native.scheduleNotifications(JSON.stringify(Store.notifications())); } catch (e) {}
  }

  /* ---------- wiring ---------- */
  function bind() {
    $$('[data-back]').forEach(b => { b.onclick = () => { if (!back()) show('camera'); }; });

    $('#covGo').onclick = once(() => { Sound.wake(); Store.onboarded(true); show('stocks'); });

    $('#toSheets').onclick = () => show('sheets');
    $('#toStocks').onclick = () => show('stocks');
    $('#toSettings').onclick = () => show('settings');
    $('#emptyLoad').onclick = once(() => { Sound.wake(); show('stocks'); });
    $('#vfRetry').onclick = () => startCamera();
    $('#fullHand').onclick = once(() => { const r = Store.roll; if (r) handIn(r, 'Rewinding'); });

    $('#shutterBtn').onclick = () => fire();
    $('#flashBtn').onclick = async () => {
      if (!Cam.live) return;
      if (!Cam.hasTorch) { toast('This camera has no flash to switch on.'); return; }
      flashWanted = !flashWanted;
      await Cam.torch(flashWanted);
      Sound.hTap();
      renderCamera();
    };
    $('#faceBtn').onclick = async () => {
      const st = Store.settings();
      const next = st.facing === 'user' ? 'environment' : 'user';
      Store.settings({ facing: next });
      flashWanted = false;
      Sound.hTap();
      await Cam.start(next);
      camState(); renderCamera();
    };

    $('#rollBtn').onclick = () => {
      const r = Store.roll;
      if (!r) { show('stocks'); return; }
      const s = Stocks.get(r.stock);
      $('#rpStock').textContent = s.name;
      $('#rpMeta').textContent = r.frames.length
        ? `${r.frames.length} of 36 exposed. Loaded ${Store.longDate(r.loadedAt)}. Handing it in now sends what you have shot, and the rest of the roll is gone.`
        : `Nothing on it yet. Loaded ${Store.longDate(r.loadedAt)}. An unexposed roll simply comes back out of the camera.`;
      $('#rpHand').textContent = r.frames.length ? 'Hand it in unfinished' : 'Take the roll out';
      openModal('#rollPanel');
    };
    $('#rpClose').onclick = closeModals;
    $('#rpNew').onclick = () => { closeModals(); show('stocks'); };
    $('#rpHand').onclick = once(() => {
      const r = Store.roll;
      closeModals();
      if (!r) return;
      if (!r.frames.length) {
        Store.unload();
        show('camera'); renderCamera();
        toast('The roll came out unexposed. Nothing was used up.', 3400);
        return;
      }
      handIn(r, 'Rewinding');
    });

    $$('#pushSeg button').forEach(b => { b.onclick = () => { Sound.hTap(); setPushSeg(Number(b.dataset.v)); }; });
    $('#rwGo').onclick = once(commitHandIn, 1400);

    $('#stLoad').onclick = once(() => { if (curStock) requestLoad(curStock.id); }, 1400);

    $('#shGrid').__onOpen = n => openFrame(n);
    Sheet.attachLoupe($('#shGrid'), $('#loupe'), $('#loupeCv'), () => curRoll);

    $('#shSave').onclick = once(() => saveSheet(), 1200);
    $('#shMenu').onclick = () => {
      const r = curRoll && Store.byId(curRoll.id);
      if (!r) return;
      $('#smTitle').textContent = `Roll ${pad(r.no)}, ${Stocks.get(r.stock).name}`;
      openModal('#sheetMenu');
    };
    $('#smClose').onclick = closeModals;
    $('#smSave').onclick = once(() => { closeModals(); return saveSheet(); }, 1200);
    $('#smDelete').onclick = async () => {
      const btn = $('#smDelete');
      if (!btn.dataset.armed) {
        btn.dataset.armed = '1';
        btn.textContent = 'Tap again. This cannot be undone';
        setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Throw this roll away'; }, 4000);
        return;
      }
      const r = curRoll;
      closeModals();
      delete btn.dataset.armed;
      btn.textContent = 'Throw this roll away';
      await DB.delPrefix('frm:' + r.id + ':');
      await DB.delPrefix('thm:' + r.id + ':');
      await DB.delPrefix('neg:' + r.id + ':');
      Store.forgetRoll(r.id);
      Sheet.forget();
      curRoll = null;
      show('sheets');
      toast(`Roll ${pad(r.no)} is gone.`);
    };

    $('#frKeep').onclick = () => {
      const r = curRoll && Store.byId(curRoll.id);
      if (!r) return;
      const on = Store.toggleKeeper(r.id, curFrame);
      Sound.tick(); Sound.hTap();
      const svg = $('#frPencil');
      svg.classList.remove('draw');
      if (on) { void svg.offsetWidth; svg.classList.add('draw'); }
      paintFrameButtons();
      updateKept();
    };
    $('#frSave').onclick = once(async () => {
      const r = curRoll && Store.byId(curRoll.id);
      if (!r) return;
      const blob = await DB.get(DB.frmKey(r.id, curFrame));
      if (!blob) { toast('That frame is not on the device any more.'); return; }
      const name = `contact-sheet-roll${pad(r.no)}-frame${pad(curFrame)}.jpg`;
      const res = await Export.save(name, blob);
      toast(res ? 'Frame saved at full size.' : 'Saving did not work here.');
    }, 1200);
    $('#frShare').onclick = once(async () => {
      const r = curRoll && Store.byId(curRoll.id);
      if (!r) return;
      if (r.shared && r.shared !== curFrame) {
        toast(`One frame per roll leaves this app, and you already sent frame ${pad(r.shared)}. Save the others instead.`, 4200);
        return;
      }
      toast('Making the frame.');
      const blob = await Export.frameCard(r, curFrame);
      const name = `contact-sheet-roll${pad(r.no)}-frame${pad(curFrame)}-card.jpg`;
      const res = await Export.share(name, blob, 'A frame from Contact Sheet');
      if (res === 'cancelled') return;
      if (res) { Store.markShared(r.id, curFrame); paintFrameButtons(); }
      toast(res === 'shared' ? 'Sent.' : res ? 'Saved where your downloads go.' : 'Sharing did not work here.');
    }, 1200);

    $('#setHour').onchange = e => { Store.settings({ developHour: Number(e.target.value) }); scheduleNotifications(); };
    $$('#setSound button').forEach(b => {
      b.onclick = () => { Store.settings({ sound: b.dataset.v }); Sound.wake(); Sound.tick(); Sound.hTap(); renderSettings(); };
    });
    $('#setHaptics').onchange = e => { Store.settings({ haptics: e.target.checked }); Sound.hTap(); };
    $('#notifyBtn').onclick = () => {
      try { window.Native.requestNotificationPermission(); } catch (e) {}
      setTimeout(renderSettings, 1400);
    };
    $('#eraseBtn').onclick = async () => {
      const btn = $('#eraseBtn');
      if (!btn.dataset.armed) {
        btn.dataset.armed = '1';
        $('#eraseLab').textContent = 'Tap again to erase everything';
        btn.classList.add('armed');
        setTimeout(() => { delete btn.dataset.armed; btn.classList.remove('armed');
                           $('#eraseLab').textContent = 'Erase everything'; }, 4000);
        return;
      }
      await DB.clear();
      Store.erase();
      location.reload();
    };

    window.addEventListener('resize', () => {
      fitViewfinder();
      if (view === 'sheet') Sheet.fitGrid($('#shGrid'), $('#shScroll'), 288);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onPause(); else onResume();
    });
    document.addEventListener('pointerdown', () => Sound.wake(), { once: true });
  }

  async function saveSheet() {
    const r = curRoll && Store.byId(curRoll.id);
    if (!r) return;
    const btn = $('#shSave');
    btn.classList.add('busy');
    btn.disabled = true;
    toast('Printing the sheet.');
    try {
      const blob = await Export.sheet(r);
      const res = await Export.save(`contact-sheet-roll${pad(r.no)}.jpg`, blob);
      toast(res === 'download' ? 'Sheet downloaded.' : res ? 'Sheet saved where your downloads go.' : 'Saving did not work here.');
    } catch (e) {
      toast('The sheet could not be printed on this device.');
    } finally {
      btn.classList.remove('busy');
      btn.disabled = false;
    }
  }

  /* ---------- the drawn parts ---------- */
  function paintGraphics() {
    $$('[data-ico]').forEach(el => { el.innerHTML = Mark.ICONS[el.dataset.ico] || ''; });

    // The mark: three frames of film with the light leak running off the last one.
    $('#covMark').innerHTML = Mark.strip({ frames: 3, leak: 1, numbers: true, from: 34, id: 'cov' });

    // The counter gate: one frame's worth of perforations behind the number.
    $('#counterGate').insertAdjacentHTML('afterbegin', Mark.gate());

    // Nothing back yet: a length of film going into the envelope it comes home in.
    $('#sheetsEmptyArt').innerHTML = emptyArt();

    // The two states of an empty camera, both drawn as a 135 cassette in the same geometry:
    // one with the leader out waiting to be threaded, one wound back in and done with.
    $('#emptyCamArt').innerHTML = cassetteSvg(146, 'csa');
    $('#fullCamArt').innerHTML = cassetteSvg(16, 'csb');

    // The lab spool, and the rewind spool, are the same drawn reel at two sizes.
    $('#labSpool').innerHTML = spoolSvg('lab');
    $('#spool').innerHTML = spoolSvg('rw');
  }

  /** A 135 cassette, with `lead` film units of leader hanging out of the light trap.
      A long leader is a roll waiting to be threaded; a stub is one wound back in. The
      leader is Mark's own perforation geometry, so it is the same film as everywhere else. */
  function cassetteSvg(lead, id) {
    const S = 0.62, FH = Mark.FILM_H;                       // film units to view units
    const L = Math.max(10, lead);
    const tongue = L > 60
      ? `M0 0 H${(L - 34).toFixed(1)} L${L} 13.5 V${FH} H0 Z`
      : `M0 0 H${L} V${FH} H0 Z`;
    const perfs = Mark.perfPath(L, 1.4);
    const x0 = 60, y0 = 58 - (FH * S) / 2;
    return `<svg viewBox="0 0 176 116" aria-hidden="true">
  <defs>
    <linearGradient id="${id}shell" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#40382E"/><stop offset="0.55" stop-color="#241F1A"/><stop offset="1" stop-color="#141110"/>
    </linearGradient>
    <linearGradient id="${id}film" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A241E"/><stop offset="0.5" stop-color="#1D1915"/><stop offset="1" stop-color="#151210"/>
    </linearGradient>
    <clipPath id="${id}lead" clipPathUnits="userSpaceOnUse"><path d="${tongue}"/></clipPath>
  </defs>
  <g transform="translate(${x0} ${y0.toFixed(1)}) scale(${S})">
    <path d="${tongue}" fill="url(#${id}film)"/>
    <g clip-path="url(#${id}lead)">
      <path d="${perfs}" fill="#0A0908"/>
      <path d="${perfs}" fill="none" stroke="#3E362C" stroke-width="0.22"/>
    </g>
    <path d="${tongue}" fill="none" stroke="#4B4136" stroke-width="0.5"/>
  </g>
  <g>
    <rect x="30" y="17" width="17" height="10" rx="2.4" fill="#3A322A" stroke="#544838" stroke-width="1"/>
    <rect x="30" y="89" width="17" height="10" rx="2.4" fill="#3A322A" stroke="#544838" stroke-width="1"/>
    <rect x="12" y="26" width="56" height="64" rx="8" fill="url(#${id}shell)" stroke="#5A4E3F" stroke-width="1.4"/>
    <rect x="12" y="47" width="56" height="19" fill="var(--accent)" opacity="0.9"/>
    <rect x="12" y="47" width="56" height="19" fill="none" stroke="#0F0D0B" stroke-width="0.8" opacity="0.5"/>
    <path d="M20 56.5h22M20 61h13" stroke="#2A1B08" stroke-width="2.2" stroke-linecap="round" opacity="0.75"/>
    <path d="M62 30v56" stroke="#0C0A09" stroke-width="3" opacity="0.55"/>
    <path d="M17 31v54" stroke="#FFE3AC" stroke-width="1" opacity="0.14"/>
  </g>
</svg>`;
  }

  /** A reel of film. `--turn` on the element rotates the core. */
  function spoolSvg(id) {
    let teeth = '';
    for (let i = 0; i < 12; i++) {
      const a = i * 30 * Math.PI / 180;
      teeth += `<rect x="${(31 + Math.cos(a) * 15).toFixed(2)}" y="${(31 + Math.sin(a) * 15).toFixed(2)}" ` +
               `width="4.4" height="2.6" rx="0.8" transform="rotate(${i * 30} ${(33.2 + Math.cos(a) * 15).toFixed(2)} ${(32.3 + Math.sin(a) * 15).toFixed(2)})"/>`;
    }
    return `<svg viewBox="0 0 66 66" aria-hidden="true">
  <defs><radialGradient id="${id}core" cx="0.38" cy="0.32" r="0.78">
    <stop offset="0" stop-color="#3A322A"/><stop offset="1" stop-color="#191512"/></radialGradient></defs>
  <circle cx="33" cy="33" r="30" fill="none" stroke="#2E2A24" stroke-width="1.4"/>
  <g class="sp-turn">
    <circle cx="33" cy="33" r="25.5" fill="url(#${id}core)"/>
    <circle cx="33" cy="33" r="25.5" fill="none" stroke="#453C31" stroke-width="1"/>
    <g fill="#0E0C0B">${teeth}</g>
    <circle cx="33" cy="33" r="8.4" fill="#100E0C" stroke="#5A4E3F" stroke-width="1.2"/>
    <path d="M33 24.6v-4.2M33 41.4v4.2M24.6 33h-4.2M41.4 33h4.2" stroke="#5A4E3F" stroke-width="1.2" stroke-linecap="round"/>
  </g>
  <path class="sp-lead" d="M58.4 33c0 6-3 9.6-8 9.6" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;
  }

  /** The empty archive: the envelope a roll comes home in, with the sheet half out of it
      and the light leak still on the last frame. The same film edge as the mark. */
  function emptyArt() {
    return `<svg viewBox="0 0 210 132" aria-hidden="true">
  <defs>
    <linearGradient id="envg" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#3A322A"/><stop offset="1" stop-color="#231E19"/>
    </linearGradient>
    <linearGradient id="filmg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2C2620"/><stop offset="1" stop-color="#3A322A"/>
    </linearGradient>
    <linearGradient id="artleak" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFE1A6" stop-opacity="0.95"/>
      <stop offset="0.35" stop-color="#F2A62B" stop-opacity="0.6"/>
      <stop offset="0.8" stop-color="#E4552B" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g transform="translate(26 6) rotate(-9)">
    <rect width="126" height="30" rx="1" fill="url(#filmg)"/>
    <rect x="8" y="5" width="30" height="20" rx="0.8" fill="#0C0A09"/>
    <rect x="42" y="5" width="30" height="20" rx="0.8" fill="#0C0A09"/>
    <rect x="76" y="5" width="30" height="20" rx="0.8" fill="#0C0A09"/>
    <rect x="76" y="5" width="30" height="20" rx="0.8" fill="url(#artleak)"/>
    <g fill="#0A0908">${perfBand(126, 30)}</g>
    <g fill="none" stroke="#4B4136" stroke-width="0.5">
      <rect x="8" y="5" width="30" height="20" rx="0.8"/>
      <rect x="42" y="5" width="30" height="20" rx="0.8"/>
      <rect x="76" y="5" width="30" height="20" rx="0.8"/>
    </g>
  </g>
  <g transform="translate(48 44)">
    <path d="M3 0h114a3 3 0 0 1 3 3v76a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3z"
          fill="url(#envg)" stroke="#544838" stroke-width="1.4"/>
    <path d="M0 4 60 40 120 4" fill="none" stroke="#6A5C48" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M16 60h50M16 70h30" stroke="#4A4136" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="100" cy="66" r="9" fill="none" stroke="var(--accent)" stroke-width="1.8" opacity="0.75"/>
    <path d="M95.8 66.2l3.2 3.2 5.6-6.6" fill="none" stroke="var(--accent)" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>
  </g>
</svg>`;
  }
  function perfBand(w, h) {
    let d = '';
    for (let x = 2.4; x + 2.8 < w; x += 4.6) {
      d += `<rect x="${x.toFixed(1)}" y="1.5" width="2.8" height="2" rx="0.5"/>` +
           `<rect x="${x.toFixed(1)}" y="${(h - 3.5).toFixed(1)}" width="2.8" height="2" rx="0.5"/>`;
    }
    return d;
  }

  /* ---------- lifecycle ---------- */
  async function init() {
    paintGraphics();
    grainUrl = makeGrain();
    $('#grainField').style.backgroundImage = `url(${grainUrl})`;
    Cam.attach($('#vf'));
    bind();
    Cam.on(() => { if (view === 'camera') { camState(); renderCamera(); } });
    fitViewfinder();
    if (!Store.onboarded()) { show('covenant'); return; }
    scheduleNotifications();
    if (await checkLab()) return;
    show('camera');
    renderCamera();
  }

  function back() {
    if (modalOpen()) { closeModals(); return true; }
    if (view === 'lab') return true;              // the lab is not a screen you walk out of
    const up = PARENT[view];
    if (up) { show(up); return true; }
    return false;                                  // the camera and the covenant are the root
  }
  function onPause() { Cam.stop(); }
  async function onResume() {
    if (!Store.onboarded()) return;
    scheduleNotifications();
    if (await checkLab()) return;
    if (view === 'camera') startCamera();
    if (view === 'sheets') renderSheets();
  }

  document.addEventListener('DOMContentLoaded', init);
  return { back, onPause, onResume, show, toast, checkLab, openFrame, renderCamera };
})();

// A top-level const does not become a property of window in a classic script, and
// the Android shell looks for window.App to hand the Back gesture to.
window.App = App;
