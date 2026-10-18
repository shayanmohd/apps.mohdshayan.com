/* Ferment. Five places: the Kitchen ward round, the ladder of recipes, the cultures and their
   family trees, the safety guide, and the camera. Everything is rendered from the store. */

const App = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
  // Authored recipe prose writes temperatures as {18C}. Convert them to the reader's unit here, in the
  // one helper every string passes through, so a Fahrenheit user never sees "64F to 72F" in a chip
  // beside "between 18C and 22C" in the task under it.
  const esc = (s) => Charts.esc(String(s).replace(/\{(\d+(?:\.\d+)?)C\}/g,
    (_, c) => Store.showTemp(parseFloat(c), 0)));

  let view = 'kitchen';
  let stack = [];               // pushed pages, most recent last
  let sheetState = null;
  let eraseArmed = false;
  let calcAmount = null;

  const VIEWS = ['kitchen', 'recipes', 'cultures', 'guide'];
  const PAGES = { batch: '#s-batch', culture: '#s-culture', recipe: '#s-recipe',
                  topic: '#s-topic', settings: '#s-settings' };

  /* One stroke language for every icon in the app: 1.6 units, round caps, round joins. */
  const ICON = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true" class="ic"><path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true" class="ic"><path d="M6 12h12"/></svg>',
    plus:  '<svg viewBox="0 0 24 24" aria-hidden="true" class="ic"><path d="M12 6v12M6 12h12"/></svg>'
  };

  const GUIDE_GLYPH =
    '<path d="M4.4 4.4h5.9c1 0 1.7.8 1.7 1.8v13.4c0-1-.7-1.8-1.7-1.8H4.4z"/>' +
    '<path d="M19.6 4.4h-5.9c-1 0-1.7.8-1.7 1.8v13.4c0-1 .7-1.8 1.7-1.8h5.9z"/>';

  /* ---------- native bridge, all optional ---------- */
  const native = () => !!(window.Native && Native.isNative && Native.isNative());
  function buzz(ms, amp) {
    if (!Store.settings().haptics) return;
    if (window.Native && Native.vibrate) { try { Native.vibrate(ms || 14, amp || 110); } catch (e) {} }
    else if (navigator.vibrate) { try { navigator.vibrate(ms || 14); } catch (e) {} }
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function download(name, mime, text) {
    const b64 = btoa(unescape(encodeURIComponent(text)));
    if (window.Native && Native.saveFile) {
      let uri = '';
      try { uri = Native.saveFile(name, mime, b64); } catch (e) { uri = ''; }
      if (uri) { toast('Saved to Downloads as ' + name); return; }
    }
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('Saved as ' + name);
    } catch (e) { toast('This device would not let the app write a file.'); }
  }
  function syncReminders() {
    if (!(window.Native && Native.scheduleNotifications)) return;
    try {
      if (!Store.settings().notify) { Native.cancelNotifications(); return; }
      Native.scheduleNotifications(JSON.stringify(Store.reminderPlan()));
    } catch (e) {}
  }

  /* ---------- navigation ---------- */
  function setView(v) {
    view = v;
    // Switching tab always returns to the top of that tab: a detail page left open underneath
    // would otherwise keep covering the view you just asked for.
    if (stack.length) { stack = []; hideAllPages(); }
    $('#tabs').hidden = false;
    document.body.classList.add('has-tabs');
    VIEWS.forEach(k => { $('#v-' + k).hidden = k !== v; });
    $$('#tabs .tab').forEach(b => b.classList.toggle('is-on', b.dataset.view === v));
    if (v === 'kitchen') renderKitchen();
    if (v === 'recipes') renderRecipes();
    if (v === 'cultures') renderCultures();
    if (v === 'guide') renderGuide();
    const sc = $('#v-' + v + ' .scroller');
    if (sc) sc.scrollTop = 0;
  }
  function hideAllPages() { Object.keys(PAGES).forEach(k => { $(PAGES[k]).hidden = true; }); }
  function push(p) {
    stack.push(p);
    showTop();
  }
  function pop() {
    stack.pop();
    showTop();
    return true;
  }
  function replace(p) { stack[stack.length - 1] = p; showTop(); }
  function showTop() {
    hideAllPages();
    const p = stack[stack.length - 1];
    if (!p) { $('#tabs').hidden = false; document.body.classList.add('has-tabs'); return; }
    const node = $(PAGES[p.screen]);
    node.hidden = false;
    const sc = node.querySelector('.scroller');
    if (sc) sc.scrollTop = 0;
    if (p.screen === 'batch') renderBatch(p.id);
    if (p.screen === 'culture') renderCulture(p.id);
    if (p.screen === 'recipe') renderRecipe(p.id);
    if (p.screen === 'topic') renderTopic(p);
    if (p.screen === 'settings') renderSettings();
  }
  /** Re-render whatever is on top without disturbing the stack. */
  function refresh() {
    const p = stack[stack.length - 1];
    if (p) {
      if (p.screen === 'batch') renderBatch(p.id);
      else if (p.screen === 'culture') renderCulture(p.id);
      else if (p.screen === 'recipe') renderRecipe(p.id);
      else if (p.screen === 'settings') renderSettings();
    }
    if (view === 'kitchen') renderKitchen();
    if (view === 'cultures') renderCultures();
    syncReminders();
  }

  /* ---------- the sheet ---------- */
  let sheetSeq = 0;
  function openSheet(o) {
    sheetState = o;
    const mine = ++sheetSeq;
    $('#sheetTitle').textContent = o.title;
    $('#sheetBody').innerHTML = o.body || '';
    const foot = $('#sheetFoot');
    foot.innerHTML = '';
    (o.actions || []).forEach((a, i) => {
      const b = document.createElement('button');
      b.className = 'btn' + (a.kind === 'ghost' ? ' ghost' : a.kind === 'danger' ? ' ghost danger' : '');
      b.textContent = a.label;
      // A fast double tap delivers both taps before the closing sheet has left the screen, which
      // used to start two batches from one form. An action that closed the sheet cannot run twice.
      b.addEventListener('click', () => {
        if (sheetSeq !== mine || $('#sheet').hidden) return;
        if (a.on) a.on();
      });
      foot.appendChild(b);
    });
    $('#sheet').hidden = false;
    if (o.onOpen) o.onOpen($('#sheetBody'));
  }
  function closeSheet() { $('#sheet').hidden = true; sheetState = null; }

  /** True at most once per window for a given key, so a repeated tap writes one entry. */
  const lastTap = {};
  function firstTap(key, ms) {
    const t = Date.now();
    if (lastTap[key] && t - lastTap[key] < (ms || 700)) return false;
    lastTap[key] = t;
    return true;
  }

  const vessel = (glyph, cls) =>
    '<svg class="' + (cls || 'vessel') + '" viewBox="0 0 24 24" aria-hidden="true">' + Content.glyph(glyph) + '</svg>';

  /* ============================================================
     KITCHEN
     ============================================================ */
  function renderKitchen() {
    const now = new Date();
    $('#kDate').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const body = $('#kBody');
    const bs = Store.activeBatches();
    const cs = Store.liveCultures();
    const ag = Store.agenda(9 * Store.DAY).slice(0, 6);

    /* The shelf. The jar here is the app's mark, the same object as the launcher icon, so it
       is drawn the same way every time. What is actually due is said in words beside it. */
    let line;
    if (!bs.length && !cs.length) {
      line = 'Nothing is alive in here yet.';
    } else {
      const soon = ag[0];
      if (!soon) line = countLine(bs.length, cs.length) + ' Nothing needs you in the next few days.';
      else if (soon.at < Date.now()) line = countLine(bs.length, cs.length) + ' ' + soon.owner + ' is overdue.';
      else line = countLine(bs.length, cs.length) + ' Next up, ' + soon.owner + ' ' + Store.relative(soon.at) + '.';
    }
    if (!$('#kJar').firstChild) $('#kJar').innerHTML = Charts.jarHero(0.58, { seed: 3, label: 'The Ferment jar' });
    $('#kLine').textContent = line;

    if (!bs.length && !cs.length) {
      body.innerHTML =
        '<div class="empty settle">' + Charts.illus('shelf') +
        '<h3>Nothing under your care yet</h3>' +
        '<p>Start a jar from the ladder, or tell Ferment about a starter or a SCOBY you already keep alive.</p>' +
        '<div class="btnrow"><button class="btn" data-act="goladder">Open the ladder</button>' +
        '<button class="btn ghost" data-act="newculture">Add a culture</button></div></div>' +
        '<div class="card flat" style="margin-top:18px"><h3 class="serif">Read the guide first</h3>' +
        '<p class="help">Salt percentages, what mold actually looks like next to the things that are not mold, ' +
        'and the categories this app deliberately stays out of.</p>' +
        '<div class="btnrow"><button class="btn ghost" data-act="goguide">Open the guide</button></div></div>';
      return;
    }

    let h = '';
    if (ag.length) {
      h += '<p class="eyebrow">Up next</p><div class="agenda">';
      ag.forEach((a, i) => {
        const late = a.at < Date.now();
        h += '<button class="ag-row settle' + (late ? ' is-late' : '') + '" style="--i:' + i + '" data-ag-owner="' + esc(a.ownerId) +
             '" data-ag-type="' + a.ownerType + '" data-ag-kind="' + a.kind + '"' +
             (a.ackKey ? ' data-ag-ack="' + esc(a.ackKey) + '"' : '') + '>' +
             '<span class="ag-when">' + esc(Store.relative(a.at)) + '</span>' +
             '<span class="ag-what"><b>' + esc(a.owner) + '</b><i>' + esc(a.line) + '</i></span>' +
             (a.kind === 'stage' ? '' :
               '<span class="ag-do">' + (a.kind === 'feed' ? 'Fed it' : 'Done') + '</span>') +
             '</button>';
      });
      h += '</div>';
    }

    let i = 0;
    if (bs.length) {
      h += '<div class="sec-title"><h2 class="serif">Batches</h2><span class="count mono">' + bs.length + ' active</span></div>';
      for (const b of bs) h += batchCard(b, i++);
    }
    if (cs.length) {
      h += '<div class="sec-title"><h2 class="serif">Cultures</h2><span class="count mono">' + cs.length + '</span></div>';
      for (const c of cs) h += cultureCard(c, i++);
    }
    h += '<div class="btnrow"><button class="btn ghost" data-act="goladder">Start something new</button>' +
         '<button class="btn ghost" data-act="newculture">Add a culture</button></div>';
    body.innerHTML = h;
  }

  function countLine(nb, nc) {
    const p = [];
    if (nb) p.push(nb + (nb === 1 ? ' batch' : ' batches'));
    if (nc) p.push(nc + (nc === 1 ? ' culture' : ' cultures'));
    return p.join(' and ') + ' under your care.';
  }
  /**
   * How full the jar is drawn. A batch fills as its stage runs, because that is progress.
   * A culture empties as its feed runs out, because that is what the jar is actually doing:
   * full and glowing just after a feed, low and dull when it is hungry.
   */
  /* Both gauges keep a floor: a jar drawn nearly empty reads as broken rather than as low,
     and the number beside it is what carries the precision anyway. */
  const FLOOR = 0.28;
  const gauge = v => FLOOR + (1 - FLOOR) * Math.max(0, Math.min(1, v));
  function cultureFill(f) { return gauge(1 - Math.min(1, f.frac)); }
  function gaugeOf(type, o) {
    if (type === 'culture') return cultureFill(Store.feedState(o));
    const r = Content.recipe(o.recipeId);
    const st = r && r.stages[o.stageIndex];
    if (!st) return gauge(0.5);
    const days = (Date.now() - o.stageStartedAt) / Store.DAY;
    return gauge(days / Math.max(0.02, st.days[1]));
  }

  function batchCard(b, idx) {
    const r = Content.recipe(b.recipeId);
    if (!r) return '';
    const st = r.stages[b.stageIndex];
    const day = Store.dayOf(b.startedAt);
    const inStage = (Date.now() - b.stageStartedAt) / Store.DAY;
    const soft = st.days[0], hard = st.days[1];
    let next, late = false;
    if (inStage >= soft) {
      next = st.name + ' is in its window, day ' + Math.max(1, Math.round(inStage)) + ' of about ' + Math.round(hard);
      if (inStage > hard) { next = st.name + ' has run past its window. Check it.'; late = true; }
    } else {
      // "in 10 days" is right on its own but reads badly inside "... to the window".
      next = st.name + ', ' + Store.relative(b.stageStartedAt + soft * Store.DAY).replace(/^in /, '') +
             ' to the window';
    }
    let pips = '';
    for (let i = 0; i < r.stages.length; i++)
      pips += '<span class="pip' + (i < b.stageIndex ? ' is-done' : i === b.stageIndex ? ' is-now' : '') + '"></span>';
    return '<button class="thing settle" style="--i:' + (idx || 0) + '" data-batch="' + esc(b.id) + '">' +
      '<span class="thing-top">' +
      Charts.jar(gaugeOf('batch', b), { late: late, seed: hash(b.id), label: st.name + ', day ' + day }) +
      '<span class="thing-id"><b>' + esc(b.title) + '</b>' +
      '<i>' + vessel(Content.family(b.family).glyph, 'kindmark') + esc(st.name) + ', stage ' + (b.stageIndex + 1) +
      ' of ' + r.stages.length + '</i><span class="pips">' + pips + '</span></span>' +
      '<span class="thing-badge mono">day ' + day + '</span></span>' +
      '<span class="thing-next' + (late ? ' is-late' : '') + '"><b>' + (late ? 'Overdue' : 'Now') + '</b>' + esc(next) + '</span>' +
      '</button>';
  }

  function cultureCard(c, idx) {
    const k = Content.cultureKind(c.kind);
    const retired = c.state === 'retired';
    const f = Store.feedState(c);
    // A retired jar is not hungry. It stopped being fed on purpose, and saying otherwise
    // put a red overdue reading on every jar anyone had ever given away.
    const line = retired
      ? 'Kept for its history and its place in the family tree'
      : f.overdue
        ? 'Feed overdue by ' + Store.spanText((Date.now() - f.due) / Store.HOUR)
        : 'Feed due ' + Store.relative(f.due);
    const tail = retired ? '' :
      ', every ' + esc(Store.spanText(f.hours)) + ' at ' + esc(Store.showTemp(f.tempC, 0));
    return '<button class="thing settle' + (retired ? ' is-retired' : '') + '" style="--i:' + (idx || 0) +
      '" data-culture="' + esc(c.id) + '">' +
      '<span class="thing-top">' +
      Charts.jar(retired ? 0.34 : cultureFill(f),
                 { late: !retired && f.overdue, bubbles: retired ? 0 : 5, seed: hash(c.id),
                   label: k.label + ', ' + line }) +
      '<span class="thing-id"><b>' + esc(c.name) + '</b>' +
      '<i>' + vessel(k.glyph, 'kindmark') + esc(k.label) + ', ' + esc(Store.ageText(c.bornAt)) + '</i></span>' +
      '</span>' +
      '<span class="thing-next' + (!retired && f.overdue ? ' is-late' : '') + '"><b>' +
      (retired ? 'Retired' : f.overdue ? 'Hungry' : 'Fed') + '</b>' + esc(line) + tail + '</span>' +
      '</button>';
  }

  /** A stable small number from an id, so a jar's bubbles look the same every render. */
  function hash(id) {
    let h = 5381;
    for (let i = 0; i < String(id).length; i++) h = ((h << 5) + h + String(id).charCodeAt(i)) >>> 0;
    return h % 9973;
  }

  /* ============================================================
     RECIPES
     ============================================================ */
  function renderRecipes() {
    let h = '<p class="lede">Twelve recipes written as stage plans rather than paragraphs, so a batch ' +
            'started from one arrives with its own timeline and its own reminders.</p>';
    for (const t of Content.TIERS) {
      h += '<div class="tier"><div class="tier-head"><h2>' + esc(t.title) + '</h2><p>' + esc(t.note) + '</p></div>';
      Content.RECIPES.filter(r => r.tier === t.n).forEach((r, i) => {
        h += '<button class="rung settle" style="--i:' + i + '" data-recipe="' + esc(r.id) + '">' +
             '<span class="num mono">' + String(r.rung).padStart(2, '0') + '</span>' +
             '<span><b>' + esc(r.title) + '</b><i>' + esc(r.subtitle) + '</i>' +
             '<span class="meta mono">' + esc(r.span) + '  /  ' + r.stages.length + ' stages</span></span>' +
             vessel(Content.family(r.family).glyph, 'rungmark') + '</button>';
      });
      h += '</div>';
    }
    $('#rBody').innerHTML = h;
  }

  function renderRecipe(id) {
    const r = Content.recipe(id);
    if (!r) return pop();
    $('#recipeTop').textContent = r.title;
    if (calcAmount === null || calcAmount.id !== r.id) calcAmount = { id: r.id, v: r.basis.def };
    const amount = calcAmount.v;

    let h = '<div class="rhero">' + '<span class="specimen">' + vessel(Content.family(r.family).glyph) + '</span>' +
      '<h1>' + esc(r.title) + '</h1><p class="sub">' + esc(r.subtitle) + '</p>' +
      '<p class="blurb">' + esc(r.blurb) + '</p>' +
      '<div class="factrow"><div><span>Takes</span><b>' + esc(r.span) + '</b></div>' +
      '<div><span>Stages</span><b>' + r.stages.length + '</b></div>' +
      '<div><span>Family</span><b>' + esc(Content.family(r.family).label) + '</b></div></div></div>';

    h += '<div class="calc"><p class="lbl">' + esc(r.basis.label) + ' (' + r.basis.unit + ')</p>' +
      '<div class="calcrow"><button class="stepper" data-calc="-" aria-label="Less">' + ICON.minus + '</button>' +
      '<input type="number" id="calcIn" inputmode="decimal" value="' + amount + '" min="1" step="' + r.basis.step + '">' +
      '<button class="stepper" data-calc="+" aria-label="More">' + ICON.plus + '</button></div>' +
      '<p class="help">' + esc(r.pctLabel) + '. Change the number and the whole table moves with it.</p></div>';

    h += '<table class="lab"><thead><tr><th>Ingredient</th><th class="pct" style="text-align:right">%</th>' +
         '<th class="u" style="text-align:right">' + esc(r.basis.unit) + '</th></tr></thead><tbody>';
    for (const i of Store.scaled(r, amount)) {
      h += '<tr' + (i.amount === null ? ' class="zero"' : '') + '><td>' + esc(i.name) +
           (i.note ? '<em class="ingnote">' + esc(i.note) + '</em>' : '') + '</td>' +
           '<td class="pct">' + (i.pct ? i.pct : '') + '</td>' +
           '<td class="n">' + (i.amount === null ? 'one' : esc(Store.fmtAmount(i.amount))) + '</td></tr>';
    }
    h += '</tbody></table>';

    h += '<p class="eyebrow mt">The plan</p><div class="rail">';
    for (const s of r.stages) h += stageBlock(s, null, null, false);
    h += '</div>';

    if (r.safety.length) {
      h += '<p class="eyebrow mt">Read before you start</p>';
      for (const key of r.safety) {
        const g = Content.guide(key);
        if (g) h += '<button class="topic" data-topic="' + esc(g.id) + '"><b>' + esc(g.title) + '</b><i>' +
                    esc(g.body[0].slice(0, 96)) + '</i></button>';
      }
    }
    if (r.source) h += '<p class="source">' + esc(r.source) + '</p>';
    h += '<div class="btnrow" style="margin-top:24px"><button class="btn wide" data-act="startbatch" data-recipe="' +
         esc(r.id) + '">Start a batch from this</button></div>';
    $('#recipeBody').innerHTML = h;

    const inp = $('#calcIn');
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      if (!(v > 0)) return;
      calcAmount.v = v;
      updateTable(r, v);
    });
  }

  function updateTable(r, amount) {
    const rows = $$('#recipeBody table.lab tbody tr');
    const sc = Store.scaled(r, amount);
    rows.forEach((tr, i) => {
      const cell = tr.querySelector('td.n');
      if (cell && sc[i]) cell.textContent = sc[i].amount === null ? 'one' : Store.fmtAmount(sc[i].amount);
    });
  }

  function stageBlock(s, state, batch, live) {
    const dayTxt = stageWindow(s.days[0], s.days[1]);
    let h = '<div class="stg' + (state === 'done' ? ' is-done' : state === 'now' ? ' is-now' : '') + '">' +
      '<h3>' + esc(s.name) + '</h3><p class="when">' + esc(dayTxt) + '</p>' +
      '<p class="sum">' + esc(s.summary) + '</p>';
    if (s.targets) {
      const t = [];
      if (s.targets.temp) t.push(Store.showTemp(s.targets.temp[0], 0) + ' to ' + Store.showTemp(s.targets.temp[1], 0));
      if (s.targets.ph) t.push('pH ' + s.targets.ph[0] + ' to ' + s.targets.ph[1]);
      if (s.targets.gravity) t.push('SG ' + s.targets.gravity[0] + ' to ' + s.targets.gravity[1]);
      if (s.targets.salinity) t.push(s.targets.salinity[0] + '% to ' + s.targets.salinity[1] + '% brine');
      if (s.targets.rise) t.push('rise ' + s.targets.rise[0] + 'x to ' + s.targets.rise[1] + 'x');
      if (t.length) h += '<div class="targets">' + t.map(x => '<span class="target">' + esc(x) + '</span>').join('') + '</div>';
    }
    if (live && batch) {
      const si = batch.stageIndex;
      h += '<div style="margin-top:8px">';
      s.tasks.forEach((t, ti) => {
        const done = Store.taskDone(batch, si, ti);
        h += '<button class="task' + (done ? ' is-done' : '') + '" data-task="' + ti + '">' +
             '<span class="box"></span><span>' + esc(t) + '</span></button>';
      });
      h += '</div>';
    } else {
      h += '<ul>' + s.tasks.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>';
    }
    if (s.watch) h += '<p class="watch">' + esc(s.watch) + '</p>';
    h += '</div>';
    return h;
  }
  function hstr(h) {
    if (h < 0.9) return Math.max(15, Math.round(h * 4) * 15) + ' minutes';
    if (h < 24) { const n = Math.round(h); return n + (n === 1 ? ' hour' : ' hours'); }
    const d = Math.round(h / 24);
    return d + (d === 1 ? ' day' : ' days');
  }
  /** "4 to 7 hours", "1 to 3 days", "30 minutes to 2 hours". */
  function stageWindow(d0, d1) {
    const a = hstr(d0 * 24), b = hstr(d1 * 24);
    if (a === b) return a;
    const ua = a.split(' ')[1].replace(/s$/, ''), ub = b.split(' ')[1].replace(/s$/, '');
    return ua === ub ? a.split(' ')[0] + ' to ' + b : a + ' to ' + b;
  }

  /* ============================================================
     BATCH
     ============================================================ */
  function renderBatch(id) {
    const b = Store.batch(id);
    if (!b) return pop();
    const r = Content.recipe(b.recipeId);
    $('#batchTop').textContent = b.title;
    if (!r) {
      // Only reachable from a restored backup that carries a recipe this build does not have.
      $('#batchBody').innerHTML =
        '<div class="card"><h3>This batch refers to a recipe that is not in this app</h3>' +
        '<p class="help">Its log is intact and the export still contains it. Nothing here can be ' +
        'edited, because the stage plan it was started from is missing.</p></div>' +
        b.logs.slice().sort((x, y) => y.at - x.at).map(logRow).join('') +
        '<div class="btnrow" style="margin-top:26px"><button class="btn ghost danger" ' +
        'data-act="deletebatch">Delete</button></div>';
      return;
    }
    const st = r.stages[b.stageIndex];
    const last = b.stageIndex === r.stages.length - 1;

    const inWindow = (Date.now() - b.stageStartedAt) / Store.DAY > st.days[1];
    let h = '<div class="rhero">' +
      (b.state === 'active'
        ? '<span class="herojar">' + Charts.jar(gaugeOf('batch', b), { late: inWindow, seed: hash(b.id),
            cls: 'jar-feed', label: st.name + ', day ' + Store.dayOf(b.startedAt) }) + '</span>'
        : '<span class="specimen">' + vessel(Content.family(b.family).glyph) + '</span>') +
      '<h1>' + esc(b.title) + '</h1><p class="sub">' + vessel(Content.family(b.family).glyph, 'kindmark') + esc(r.title) +
      (b.cultureId && Store.culture(b.cultureId) ? ', with ' + esc(Store.culture(b.cultureId).name) : '') + '</p>' +
      '<div class="factrow"><div><span>Day</span><b>' + Store.dayOf(b.startedAt) + '</b></div>' +
      '<div><span>Stage</span><b>' + (b.stageIndex + 1) + ' of ' + r.stages.length + '</b></div>' +
      '<div><span>Scale</span><b>' + esc(Store.fmtScale(b.scale.amount, r.basis.unit)) + '</b></div></div></div>';

    if (b.state !== 'active') {
      h += '<div class="card"><h3>' + (b.state === 'done' ? 'Closed out' : 'Binned') + '</h3>' +
        '<p class="help">' + esc(Store.dateLine(b.finishedAt)) + '</p>' +
        (b.outcome && b.outcome.rating ? '<p style="margin:8px 0 0"><b class="mono">' + b.outcome.rating + ' of 5</b></p>' : '') +
        (b.outcome && b.outcome.notes ? '<p class="help">' + esc(b.outcome.notes) + '</p>' : '') +
        (b.outcome && b.outcome.next ? '<p class="help">Next time: ' + esc(b.outcome.next) + '</p>' : '') +
        '<div class="btnrow"><button class="btn ghost" data-act="reopen">Reopen it</button></div></div>';
    } else {
      h += '<p class="eyebrow">Right now</p><div class="rail">' +
        stageBlock(st, 'now', b, true) + '</div>';
      h += '<div class="btnrow">' +
        (last
          ? '<button class="btn" data-act="outcome">Record how it turned out</button>'
          : '<button class="btn" data-act="advance">Move on to ' + esc(r.stages[b.stageIndex + 1].name) + '</button>') +
        (b.stageIndex > 0 ? '<button class="btn ghost" data-act="backstage">Step back</button>' : '') +
        '</div>';
    }

    const kinds = relevantKinds(r);
    h += '<p class="eyebrow mt">Log something</p><div class="chips" style="margin-top:8px">' +
      kinds.log.map(k => '<button class="chip" data-log="' + k + '">' +
        esc(Content.LOG_KINDS[k].label) + '</button>').join('') +
      '<button class="chip" data-act="photo">Photo</button>' +
      (kinds.rise ? '<button class="chip" data-act="risecheck">Rise check</button>' : '') + '</div>';

    /* charts for anything with two or more readings */
    const chartKinds = [
      { k: 'temp', label: 'Temperature', band: st.targets && st.targets.temp, fmt: v => Store.showTemp(v, 1) },
      { k: 'ph', label: 'pH', band: st.targets && st.targets.ph, fmt: v => Store.round(v, 1) },
      { k: 'gravity', label: 'Specific gravity', band: st.targets && st.targets.gravity, fmt: v => Store.round(v, 3) },
      { k: 'salinity', label: 'Brine strength', band: st.targets && st.targets.salinity, fmt: v => Store.round(v, 1) + '%' }
    ];
    let charts = '';
    for (const c of chartKinds) {
      const pts = Store.logsOfKind(b, c.k).map(l => ({ at: l.at, value: l.value }));
      if (pts.length < 2) continue;
      const note = c.band ? 'target ' + c.fmt(c.band[0]) + ' to ' + c.fmt(c.band[1])
                          : pts.length + ' readings';
      charts += '<div class="chartwrap"><div class="cap"><b>' + esc(c.label) + '</b><span>' + esc(note) +
        '</span></div>' +
        Charts.series(pts, { band: c.band || null, fmt: c.fmt, label: c.label }) + '</div>';
    }
    const rs = Store.riseSeries(b);
    if (rs.length) {
      const pk = Store.risePeak(b);
      charts += '<div class="chartwrap"><div class="cap"><b>Rise</b><span>peak ' + esc(Store.round(pk.ratio, 2)) +
        'x at ' + esc(Store.spanText(pk.hours)) + '</span></div>' + Charts.rise(rs) + '</div>';
    }
    if (b.recipeId === 'mead') {
      const g = Store.logsOfKind(b, 'gravity');
      if (g.length >= 2) {
        const a = Store.abv(g[0].value, g[g.length - 1].value);
        if (a) charts += '<p class="help mono">Estimated ' + esc(a) + '% alcohol by volume from ' +
          esc(Store.round(g[0].value, 3)) + ' down to ' + esc(Store.round(g[g.length - 1].value, 3)) + '.</p>';
      }
    }
    if (charts) h += '<p class="eyebrow mt">Readings</p>' + charts;

    const shots = Store.photoLogs(b);
    if (shots.length) {
      h += '<p class="eyebrow mt">Photo journal</p><div class="strip">' +
        shots.map(l => '<button class="shotbtn" data-shot="' + esc(l.id) + '"><img alt="" data-pid="' +
          esc(l.photoId) + '"><i>' + esc(Store.dayLabel(l.at)) +
          (l.kind === 'rise' ? ' ' + Store.round(l.value, 2) + 'x' : '') + '</i></button>').join('') +
        '</div>';
    }

    h += '<p class="eyebrow mt">Everything logged</p>';
    const logs = b.logs.slice().sort((a, c) => c.at - a.at);
    if (!logs.length) h += '<p class="help">Nothing yet. The chips above write into this list.</p>';
    for (const l of logs) h += logRow(l);

    h += '<div class="btnrow" style="margin-top:26px">' +
      (b.state === 'active' ? '<button class="btn ghost danger" data-act="bin">Bin this batch</button>' : '') +
      '<button class="btn ghost danger" data-act="deletebatch">Delete</button></div>' +
      '<p class="help">Deleting removes the batch, its readings and its photographs from this device.</p>';

    $('#batchBody').innerHTML = h;
    hydratePhotos($('#batchBody'));
  }

  /** Only offer the readings this recipe actually asks anyone to take. */
  function relevantKinds(r) {
    const log = ['temp'];
    const has = f => r.stages.some(s => s.targets && s.targets[f]);
    if (has('ph')) log.push('ph');
    if (has('gravity')) { log.push('gravity'); log.push('rack'); }
    if (has('salinity')) log.push('salinity');
    if (r.stages.some(s => (s.checks || []).some(c => /urp/.test(c.text)))) log.push('burp');
    log.push('taste', 'note');
    return { log: log, rise: has('rise') || r.family === 'sourdough' || r.family === 'bread' };
  }

  function logRow(l) {
    const k = Content.LOG_KINDS[l.kind] || { label: l.kind, unit: '' };
    let val = '';
    if (l.value !== null && l.value !== undefined)
      val = ' <span class="v">' + esc(l.kind === 'temp' ? Store.showTemp(l.value, 1) : l.value + (k.unit ? k.unit : '')) + '</span>';
    return '<div class="logrow"><span class="t"><b>' + esc(Store.dayLabel(l.at)) + '</b>' + esc(Store.clock(l.at)) + '</span>' +
      '<span class="k"><b>' + esc(k.label) + '</b>' + val + (l.text ? '<em>' + esc(l.text) + '</em>' : '') + '</span>' +
      '<button class="x" data-dellog="' + esc(l.id) + '" aria-label="Delete this entry">' + ICON.close + '</button></div>';
  }

  function hydratePhotos(root) {
    root.querySelectorAll('img[data-pid]').forEach(img => Photos.attach(img, img.dataset.pid));
  }

  /* ============================================================
     CULTURES
     ============================================================ */
  function renderCultures() {
    const cs = Store.cultures();
    let h = '';
    if (!cs.length) {
      h = '<div class="empty settle">' + Charts.illus('split') + '<h3>No cultures yet</h3>' +
        '<p>A culture is the thing that outlives the batch: a starter, a SCOBY, kefir grains. ' +
        'Give it a name and a feeding rhythm and Ferment keeps its age, its history and its family tree.</p>' +
        '<div class="btnrow"><button class="btn" data-act="newculture">Add a culture</button>' +
        '<button class="btn ghost" data-act="claim">I have a culture card</button></div></div>';
    } else {
      const live = cs.filter(c => c.state !== 'retired');
      const gone = cs.filter(c => c.state === 'retired');
      live.forEach((c, i) => { h += cultureCard(c, i); });
      if (gone.length) {
        h += '<div class="sec-title"><h2 class="serif">Retired</h2><span class="count mono">' + gone.length + '</span></div>';
        gone.forEach((c, i) => { h += cultureCard(c, live.length + i); });
      }
      h += '<div class="btnrow"><button class="btn ghost" data-act="newculture">Add a culture</button>' +
        '<button class="btn ghost" data-act="claim">Claim a culture card</button></div>';
    }
    $('#cBody').innerHTML = h;
  }

  function renderCulture(id) {
    const c = Store.culture(id);
    if (!c) return pop();
    const k = Content.cultureKind(c.kind);
    const f = Store.feedState(c);
    $('#cultureTop').textContent = c.name;

    let h = '<div class="rhero">' + '<span class="specimen">' + vessel(k.glyph) + '</span>' +
      '<h1>' + esc(c.name) + '</h1><p class="sub">' + esc(k.label) + ', ' + esc(Store.ageText(c.bornAt)) + '</p>' +
      (c.origin ? '<p class="blurb">' + esc(c.origin) + '</p>' : '') + '</div>';

    const shots = Store.photoLogs(c);
    if (shots.length) {
      const latest = shots[shots.length - 1];
      h += '<img class="bigshot" alt="The most recent photograph of ' + esc(c.name) + '" data-pid="' +
        esc(latest.photoId) + '" style="margin-bottom:14px">';
    }

    const retired = c.state === 'retired';
    h += '<div class="card"><div class="feedrow">' +
      Charts.jar(retired ? 0.34 : cultureFill(f),
                 { late: !retired && f.overdue, bubbles: retired ? 0 : 6, seed: hash(c.id), cls: 'jar-feed',
                   label: retired ? 'Retired' : f.overdue ? 'Feed overdue' : 'Feed due ' + Store.relative(f.due) }) +
      '<div style="flex:1"><b>' + (retired
        ? 'Retired, and no longer fed'
        : f.overdue
          ? 'Hungry, overdue by ' + esc(Store.spanText((Date.now() - f.due) / Store.HOUR))
          : 'Feed due ' + esc(Store.relative(f.due))) + '</b>' +
      '<p class="help">' + (f.everFed ? 'Last fed ' + esc(Store.dateLine(f.lastAt)) : 'Never fed through the app') + '</p></div></div>' +
      (retired ? '<p class="help">Its history, photographs and family tree are all still here.</p>'
               : '<p class="help">' + esc(tempReason(c, f)) + '</p>' +
                 (c.feed.ratio ? '<p class="help">' + esc(c.feed.ratio) + '</p>' : '')) +
      (retired ? ''
               : '<div class="btnrow"><button class="btn" data-act="feed">Fed it just now</button>' +
                 '<button class="btn ghost" data-act="schedule">Change the rhythm</button></div>') +
      '</div>';

    h += '<div class="chips" style="margin-top:6px">' +
      '<button class="chip" data-act="risecheck">Rise check</button>' +
      '<button class="chip" data-act="photo">Photo</button>' +
      '<button class="chip" data-log="temp">Temperature</button>' +
      '<button class="chip" data-log="note">Note</button></div>';

    const rs = Store.riseSeries(c);
    const pk = Store.risePeak(c);
    h += '<div class="chartwrap"><div class="cap"><b>Rise since the feed line</b><span>' +
      (pk ? esc(Store.round(pk.ratio, 2)) + 'x at ' + esc(Store.spanText(pk.hours)) : 'no marks yet') + '</span></div>' +
      (rs.length ? Charts.rise(rs) : '') + '</div>';
    if (!rs.length)
      h += '<div class="empty">' + Charts.illus('measure') +
           '<h3>No rise marks yet</h3>' +
           '<p>A rise check is a photograph with two lines on it: the bottom of the jar contents, and the ' +
           'level right after a feed. You place the lines, the app does the arithmetic. There is no camera ' +
           'analysis here and none is claimed.</p>' +
           '<div class="btnrow"><button class="btn ghost" data-act="risecheck">Set the lines</button></div></div>';

    const temps = Store.logsOfKind(c, 'temp').map(l => ({ at: l.at, value: l.value }));
    if (temps.length >= 2) {
      h += '<div class="chartwrap"><div class="cap"><b>Kitchen temperature</b><span>' + temps.length + ' readings</span></div>' +
        Charts.series(temps, { fmt: v => Store.showTemp(v, 1), label: 'Temperature' }) + '</div>';
    }

    /* lineage */
    const tree = Store.lineage(c.id);
    const kids = Store.descendantCount(c.id);
    h += '<p class="eyebrow mt">Family tree</p>';
    if (tree.ancestors.length || tree.root.children.length || c.parentId) {
      h += Charts.tree(tree.root, c.id, tree.ancestors);
      h += '<p class="help">' + (kids ? kids + (kids === 1 ? ' descendant' : ' descendants') + ' on this device. ' : '') +
        (tree.ancestors.length ? 'Ancestry came with the culture card that started this jar.' : '') + '</p>';
    } else {
      h += '<div class="empty">' + Charts.illus('split') +
        '<h3>Just this jar so far</h3>' +
        '<p>Split off a second jar, or hand one to a friend with a culture card, and the family tree starts ' +
        'here.</p></div>';
    }
    h += '<div class="btnrow"><button class="btn ghost" data-act="split">Split off a jar</button>' +
      '<button class="btn ghost" data-act="gift">Make a culture card</button></div>';
    if (c.gifted.length)
      h += '<p class="help">Given to ' + esc(c.gifted.map(g => g.name).join(', ')) + '.</p>';

    if (shots.length) {
      h += '<p class="eyebrow mt">Photo journal</p><div class="strip">' +
        shots.map(l => '<button class="shotbtn" data-shot="' + esc(l.id) + '"><img alt="" data-pid="' +
          esc(l.photoId) + '"><i>' + esc(Store.dayLabel(l.at)) +
          (l.kind === 'rise' ? ' ' + Store.round(l.value, 2) + 'x' : '') + '</i></button>').join('') + '</div>';
    }

    h += '<p class="eyebrow mt">Everything logged</p>';
    const logs = c.logs.slice().sort((a, b) => b.at - a.at).slice(0, 80);
    if (!logs.length) h += '<p class="help">Nothing yet.</p>';
    for (const l of logs) h += logRow(l);

    h += '<div class="btnrow" style="margin-top:26px">' +
      (c.state === 'retired'
        ? '<button class="btn ghost" data-act="unretire">Bring it back</button>'
        : '<button class="btn ghost" data-act="retire">Retire it</button>') +
      '<button class="btn ghost danger" data-act="deleteculture">Delete</button></div>';

    $('#cultureBody').innerHTML = h;
    hydratePhotos($('#cultureBody'));
  }

  function tempReason(c, f) {
    const base = c.feed.hours, bt = c.feed.tempC;
    const src = f.tempFrom === 'log' ? 'the temperature you last logged here' : 'the kitchen temperature in settings';
    if (Math.abs(f.hours - base) < 0.4)
      return 'Every ' + Store.spanText(base) + ', which is what this schedule says at ' + Store.showTemp(bt, 0) + '.';
    const dir = f.hours < base ? 'faster' : 'slower';
    return 'The schedule says every ' + Store.spanText(base) + ' at ' + Store.showTemp(bt, 0) + '. At ' +
      Store.showTemp(f.tempC, 0) + ', from ' + src + ', metabolism runs ' + dir +
      ', so the suggestion is every ' + Store.spanText(f.hours) + '. Roughly double the pace per ten degrees warmer.';
  }

  /* ============================================================
     GUIDE
     ============================================================ */
  function renderGuide() {
    let h = '<p class="lede">Fermentation is safe because of salt, acid and keeping things under the ' +
      'liquid, not because of luck. This is the short version of all three, plus the pictures that ' +
      'settle the only question anyone ever asks.</p>';

    h += '<p class="eyebrow mt">Is this mold?</p>' +
      '<p class="help" style="margin-bottom:12px">Six plates, drawn rather than photographed, so the ' +
      'differences are the ones that matter: texture, edge, and whether it sits on the surface or grows out of it.</p>' +
      '<div class="plates">';
    for (const t of Content.TRIAGE) {
      h += '<button class="platebtn" data-triage="' + esc(t.id) + '">' + Charts.plate(t.art) +
        '<b>' + esc(t.title) + '</b><span class="verdict ' + t.verdict + '">' +
        (t.verdict === 'ok' ? 'Carry on' : 'Throw it out') + '</span></button>';
    }
    h += '</div>';

    h += '<p class="eyebrow mt">The rules</p>';
    for (const g of Content.GUIDE)
      h += '<button class="topic" data-topic="' + esc(g.id) + '"><b>' + esc(g.title) + '</b><i>' +
        esc(g.body[0].slice(0, 110)) + '</i></button>';

    h += '<div class="card flat" style="margin-top:26px"><h3 class="serif">When in doubt, throw it out</h3>' +
      '<p class="help">Ferment is a notebook for a hobby. It is not a food safety authority, it makes no ' +
      'health claims of any kind, and it cannot see your jar. If something looks wrong and this guide has ' +
      'not settled it, the answer is the bin. A jar of cabbage is cheap.</p></div>';
    $('#gBody').innerHTML = h;
  }

  function renderTopic(p) {
    let h = '';
    if (p.kind === 'triage') {
      const t = Content.TRIAGE.find(x => x.id === p.id);
      if (!t) return pop();
      $('#topicTop').textContent = t.title;
      h = '<div style="max-width:280px;margin:0 auto 6px">' + Charts.plate(t.art) + '</div>' +
        '<h1 class="serif xl" style="margin-top:10px">' + esc(t.title) + '</h1>' +
        '<span class="verdict ' + t.verdict + '">' + (t.verdict === 'ok' ? 'Carry on' : 'Throw it out') + '</span>' +
        '<div class="prose" style="margin-top:16px">' +
        '<p><b>What you are looking at.</b> ' + esc(t.seen) + '</p>' +
        '<p><b>What it is.</b> ' + esc(t.is) + '</p>' +
        '<p><b>What to do.</b> ' + esc(t.do) + '</p></div>' +
        '<p class="source">Drawn in code from the visual signatures fermenters actually use to tell these ' +
        'apart. If your jar does not clearly match one of these six, treat it as the conservative case and ' +
        'throw it out.</p>';
    } else {
      const g = Content.guide(p.id);
      if (!g) return pop();
      $('#topicTop').textContent = g.title;
      h = '<h1 class="serif xl">' + esc(g.title) + '</h1><div class="prose" style="margin-top:14px">' +
        g.body.map(b => '<p>' + esc(b) + '</p>').join('') + '</div>';
    }
    $('#topicBody').innerHTML = h;
  }

  /* ============================================================
     SETTINGS
     ============================================================ */
  function renderSettings() {
    const s = Store.settings();
    const allowed = !(window.Native && Native.notificationsAllowed) || Native.notificationsAllowed();
    let h = '<h1 class="serif xl">Settings</h1>';

    h += '<div class="card" style="margin-top:16px"><h3>Kitchen temperature</h3>' +
      '<p class="help">Used to stretch or shorten feeding suggestions when you have not logged a reading ' +
      'against a culture. Fermentation roughly doubles in pace for every ten degrees warmer.</p>' +
      '<div class="field" style="margin-top:12px"><label for="ktemp">Usually about ' +
      esc(Store.showTemp(s.kitchenTempC, 0)) + '</label>' +
      '<input type="range" id="ktemp" min="10" max="34" step="1" value="' + s.kitchenTempC + '"></div>' +
      '<div class="segbtns"><button data-unit="C" class="' + (s.unit === 'C' ? 'is-on' : '') + '">Celsius</button>' +
      '<button data-unit="F" class="' + (s.unit === 'F' ? 'is-on' : '') + '">Fahrenheit</button></div></div>';

    h += '<div class="card"><h3>Reminders</h3>' +
      '<div class="field row" style="margin-top:10px"><div><label for="notifChk">Stage and feeding reminders</label>' +
      '<p class="help">Computed from your own batches and schedules, on this device. Nothing is fetched.</p></div>' +
      '<label class="tapbox"><input type="checkbox" id="notifChk" ' + (s.notify ? 'checked' : '') + '></label></div>' +
      (native() && !allowed
        ? '<p class="help warn">Android has not granted notification permission yet.</p>' +
          '<div class="btnrow"><button class="btn ghost" data-act="asknotif">Ask for permission</button></div>'
        : '') +
      '<div class="field row"><div><label for="hapChk">Haptics</label>' +
      '<p class="help">A short tap when something is saved.</p></div>' +
      '<label class="tapbox"><input type="checkbox" id="hapChk" ' + (s.haptics ? 'checked' : '') + '></label></div>' +
      '<p class="help" id="nextNote"></p></div>';

    h += '<div class="card"><h3>Your notebook</h3>' +
      '<p class="help">Everything Ferment knows sits on this phone. Take a copy whenever you want one.</p>' +
      '<div class="btnrow"><button class="btn ghost" data-act="exporttext">Export as text</button>' +
      '<button class="btn ghost" data-act="exportjson">Export a backup</button></div>' +
      '<div class="btnrow"><label class="btn ghost wide">Restore from a backup' +
      '<input type="file" id="restoreFile" accept="application/json,.json" hidden></label></div>' +
      '<p class="help" id="storeNote">Counting the photographs.</p>' +
      '<div class="btnrow"><button class="btn ghost danger" data-act="erase" id="eraseBtn">Erase everything</button></div>' +
      '<p class="help" id="ioNote"></p></div>';

    h += '<div class="card flat"><h3 class="serif">About Ferment</h3>' +
      '<p class="help">Free and complete. No account, no subscription, no advertising, and no internet ' +
      'permission, which you can check on the Play listing before you install.</p>' +
      '<p class="help">Ferment is a notebook for a hobby. It makes no health claims, it is not a food ' +
      'safety authority, and it cannot see inside your jar. Where a category carries real hazard, such as ' +
      'cured meats or low acid canning, the app stays out of it and says so.</p>' +
      '<p class="help">There is no computer vision in this app. Rise measurement is you dragging two lines ' +
      'across a photograph you took.</p></div>';

    $('#settingsBody').innerHTML = h;

    const plan = Store.reminderPlan();
    $('#nextNote').textContent = s.notify
      ? plan.length ? plan.length + (plan.length === 1 ? ' reminder is' : ' reminders are') +
                      ' scheduled ahead, the first ' + Store.relative(plan[0].at) + '.'
                    : 'Nothing is scheduled yet, because nothing is active.'
      : 'Reminders are off. The Kitchen screen still shows what is next.';

    Photos.size().then(z => {
      const el = $('#storeNote');
      if (!el) return;
      el.textContent = z.n
        ? z.n + (z.n === 1 ? ' photograph' : ' photographs') + ' stored, about ' +
          Math.max(1, Math.round(z.bytes / 1024)) + ' KB. Text exports do not include them.'
        : 'No photographs stored yet.';
    });

    $('#ktemp').addEventListener('input', e => {
      Store.setSetting('kitchenTempC', parseInt(e.target.value, 10));
      const lab = $('#settingsBody label[for="ktemp"]');
      if (lab) lab.textContent = 'Usually about ' + Store.showTemp(Store.settings().kitchenTempC, 0);
    });
    $('#ktemp').addEventListener('change', () => { syncReminders(); });
    $('#notifChk').addEventListener('change', e => {
      Store.setSetting('notify', e.target.checked);
      if (e.target.checked && window.Native && Native.requestNotificationPermission && !Native.notificationsAllowed())
        Native.requestNotificationPermission();
      syncReminders(); renderSettings();
    });
    $('#hapChk').addEventListener('change', e => { Store.setSetting('haptics', e.target.checked); buzz(20); });
    $('#restoreFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        if (Store.importJSON(fr.result)) { toast('Notebook restored.'); refresh(); renderSettings(); }
        else $('#ioNote').textContent = 'That file was not a Ferment backup.';
      };
      fr.onerror = () => { $('#ioNote').textContent = 'That file could not be read.'; };
      fr.readAsText(f);
    });
  }

  /* ============================================================
     ACTIONS
     ============================================================ */
  function currentOwner() {
    const p = stack[stack.length - 1];
    if (!p) return null;
    if (p.screen === 'batch') return { type: 'batch', o: Store.batch(p.id) };
    if (p.screen === 'culture') return { type: 'culture', o: Store.culture(p.id) };
    return null;
  }

  function openLogSheet(kind) {
    const cur = currentOwner();
    if (!cur || !cur.o) return;
    const k = Content.LOG_KINDS[kind];
    let body = '';
    if (k.numeric) {
      const unitHint = kind === 'temp' ? (Store.settings().unit === 'F' ? 'F' : 'C')
        : kind === 'salinity' ? '%' : kind === 'gravity' ? 'SG' : '';
      body = '<div class="field"><label for="lv">' + esc(k.label) + (unitHint ? ' (' + esc(unitHint) + ')' : '') + '</label>' +
        '<input type="number" id="lv" inputmode="decimal" step="' + k.step + '" autofocus></div>';
    }
    body += '<div class="field"><label for="lt">Note, if you want one</label><textarea id="lt" rows="2"></textarea></div>';
    openSheet({
      title: 'Log ' + k.label.toLowerCase(),
      body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost', on: closeSheet },
        { label: 'Save', on: () => {
            const vEl = $('#lv');
            let v = null;
            if (vEl) {
              v = parseFloat(vEl.value);
              if (isNaN(v)) { toast('That needs a number.'); return; }
              if (kind === 'temp' && Store.settings().unit === 'F') v = Store.fromF(v);
              v = Number(Store.round(v, kind === 'gravity' ? 3 : 2));
              if (v < k.min || v > k.max) { toast('That is outside the range this app will record.'); return; }
            }
            const text = ($('#lt').value || '').trim();
            const entry = { kind: kind, value: v, text: text };
            if (cur.type === 'batch') Store.addBatchLog(cur.o.id, entry);
            else Store.addCultureLog(cur.o.id, entry);
            buzz(16); closeSheet(); refresh();
          } }
      ]
    });
  }

  function openCapture(mode) {
    const cur = currentOwner();
    if (!cur || !cur.o) { toast('Open a batch or a culture first.'); return; }
    Capture.open({
      owner: cur.o, ownerType: cur.type, mode: mode,
      onDone: entry => { if (entry) toast(entry.kind === 'rise' ? 'Rise mark saved.' : 'Photo saved.'); refresh(); }
    });
  }

  function newCultureSheet() {
    const opts = Content.CULTURE_KINDS.map(k =>
      '<option value="' + k.id + '">' + esc(k.label) + '</option>').join('');
    openSheet({
      title: 'Add a culture',
      body: '<div class="field"><label for="cn">Name it</label>' +
        '<input type="text" id="cn" placeholder="Brenda, Gary, the jar" autocomplete="off"></div>' +
        '<div class="field"><label for="ck">What is it</label><select id="ck">' + opts + '</select></div>' +
        '<div class="field"><label for="cb">Roughly when did it start</label>' +
        '<input type="date" id="cb" value="' + Store.isoDay(Date.now()) + '"></div>' +
        '<div class="field"><label for="co">Where it came from, if you know</label>' +
        '<textarea id="co" rows="2" placeholder="A jar from my neighbour, who got it from her mother"></textarea></div>' +
        '<p class="sheet-note">The feeding rhythm starts at the usual one for that kind and you can change it later.</p>',
      actions: [
        { label: 'Cancel', kind: 'ghost', on: closeSheet },
        { label: 'Add it', on: () => {
            const name = $('#cn').value.trim();
            if (!name) { toast('It needs a name.'); return; }
            const d = $('#cb').value ? new Date($('#cb').value + 'T09:00:00').getTime() : Date.now();
            const id = Store.addCulture({ name: name, kind: $('#ck').value, bornAt: d, origin: $('#co').value });
            buzz(20); closeSheet();
            setView('cultures'); push({ screen: 'culture', id: id });
            syncReminders();
          } }
      ]
    });
  }

  function claimSheet() {
    openSheet({
      title: 'Claim a culture card',
      body: '<p class="sheet-note" style="margin-top:0">Someone who gave you a jar can make a card in ' +
        'their copy of Ferment. Paste the code here and the jar arrives with its ancestry attached.</p>' +
        '<div class="field"><label for="gc">The code</label><textarea id="gc" rows="3" placeholder="FRMT1..."></textarea></div>' +
        '<div class="field"><label for="gn">What you will call it</label><input type="text" id="gn" autocomplete="off"></div>',
      actions: [
        { label: 'Cancel', kind: 'ghost', on: closeSheet },
        { label: 'Claim it', on: () => {
            const code = $('#gc').value;
            const read = Store.readCode(code);
            if (!read) { toast('That code could not be read.'); return; }
            const id = Store.claimCode(code, $('#gn').value);
            buzz(24); closeSheet();
            setView('cultures'); push({ screen: 'culture', id: id });
            const gens = read.ancestors.length;
            toast(gens === 1 ? 'Claimed, with one generation of ancestry.'
                             : 'Claimed, with ' + gens + ' generations of ancestry.');
            syncReminders();
          } }
      ],
      onOpen: b => {
        const gc = b.querySelector('#gc'), gn = b.querySelector('#gn');
        gc.addEventListener('input', () => {
          const r = Store.readCode(gc.value);
          if (r && !gn.value) gn.value = r.name;
        });
      }
    });
  }

  function giftSheet(c) {
    openSheet({
      title: 'Make a culture card',
      body: '<p class="sheet-note" style="margin-top:0">A card is a short code carrying the name, ' +
        'kind, birthday and family line. Hand it over with the jar. There is no network involved, so it ' +
        'travels however you like: a message, a note in the lid, or read out loud.</p>' +
        '<div class="field"><label for="gw">Who is getting it</label>' +
        '<input type="text" id="gw" placeholder="Maria" autocomplete="off"></div>' +
        '<div class="field" id="codeField" hidden><label for="gout">The card</label>' +
        '<textarea id="gout" rows="4" readonly></textarea></div>',
      actions: [
        { label: 'Close', kind: 'ghost', on: () => { closeSheet(); refresh(); } },
        { label: 'Make the card', on: () => {
            if (!$('#codeField').hidden) return;
            const who = $('#gw').value;
            const code = Store.giftCode(c.id, who);
            $('#codeField').hidden = false;
            $('#gout').value = code;
            $('#gout').select();
            const foot = $('#sheetFoot');
            foot.innerHTML = '';
            const share = document.createElement('button');
            share.className = 'btn';
            share.textContent = window.Native && Native.shareText ? 'Share the card' : 'Copy the card';
            share.addEventListener('click', () => {
              const text = c.name + ' is coming to live with you.\n\nPaste this into Ferment to claim it, ' +
                'with its family line attached:\n\n' + code;
              if (window.Native && Native.shareText) { try { Native.shareText('A culture card for ' + c.name, text); } catch (e) {} }
              else if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => toast('Copied.'), () => {});
              else toast('Select the code and copy it.');
            });
            const done = document.createElement('button');
            done.className = 'btn ghost';
            done.textContent = 'Done';
            done.addEventListener('click', () => { closeSheet(); refresh(); });
            foot.appendChild(done); foot.appendChild(share);
            buzz(20);
          } }
      ]
    });
  }

  function splitSheet(c) {
    openSheet({
      title: 'Split off a jar',
      body: '<p class="sheet-note" style="margin-top:0">A second jar from the same culture. It gets its own ' +
        'feeding rhythm and its own log, and it appears under ' + esc(c.name) + ' in the family tree.</p>' +
        '<div class="field"><label for="sn">Name the new jar</label><input type="text" id="sn" autocomplete="off"></div>',
      actions: [
        { label: 'Cancel', kind: 'ghost', on: closeSheet },
        { label: 'Split it', on: () => {
            const n = $('#sn').value.trim();
            if (!n) { toast('The new jar needs a name.'); return; }
            const id = Store.splitCulture(c.id, n);
            buzz(20); closeSheet();
            // Pushed, not replaced: backing out of a new offshoot belongs on the jar it came from.
            push({ screen: 'culture', id: id });
            syncReminders();
          } }
      ]
    });
  }

  function scheduleSheet(c) {
    openSheet({
      title: 'Feeding rhythm',
      body: '<div class="field"><label for="fh">Feed every, in hours</label>' +
        '<input type="number" id="fh" inputmode="numeric" min="2" max="336" step="1" value="' + c.feed.hours + '"></div>' +
        '<div class="field"><label for="ft">At what temperature that holds true</label>' +
        '<input type="number" id="ft" inputmode="decimal" min="4" max="38" step="1" value="' + c.feed.tempC + '"></div>' +
        '<div class="field"><label for="fr">The ratio, in your own words</label>' +
        '<input type="text" id="fr" value="' + esc(c.feed.ratio || '') + '" autocomplete="off"></div>' +
        '<p class="sheet-note">Ferment stretches this interval when your kitchen is colder than the ' +
        'temperature above, and shortens it when it is warmer.</p>',
      actions: [
        { label: 'Cancel', kind: 'ghost', on: closeSheet },
        { label: 'Save', on: () => {
            const h = parseFloat($('#fh').value), t = parseFloat($('#ft').value);
            if (!(h >= 2 && h <= 336)) { toast('Between 2 and 336 hours.'); return; }
            if (!(t >= 4 && t <= 38)) { toast('Between 4 and 38 degrees.'); return; }
            Store.patchCulture(c.id, { feed: { hours: h, tempC: t, ratio: $('#fr').value.trim() } });
            closeSheet(); refresh(); toast('Rhythm updated.');
          } }
      ]
    });
  }

  function startBatchSheet(recipeId) {
    const r = Content.recipe(recipeId);
    const cs = Store.liveCultures();
    const amount = (calcAmount && calcAmount.id === r.id) ? calcAmount.v : r.basis.def;
    let cultureField = '';
    if (cs.length) {
      cultureField = '<div class="field"><label for="bc">Made with a culture</label><select id="bc">' +
        '<option value="">None</option>' +
        cs.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select></div>';
    }
    openSheet({
      title: 'Start a batch',
      body: '<div class="field"><label for="bn">Call it something</label>' +
        '<input type="text" id="bn" value="' + esc(r.title) + '" autocomplete="off"></div>' +
        '<div class="field"><label for="ba">' + esc(r.basis.label) + ' (' + esc(r.basis.unit) + ')</label>' +
        '<input type="number" id="ba" inputmode="decimal" min="1" step="' + r.basis.step + '" value="' + amount + '"></div>' +
        cultureField +
        '<p class="sheet-note">The stage timeline and its reminders start now. You can step stages back and ' +
        'forward at any time, because fermentation does not read the clock.</p>',
      actions: [
        { label: 'Cancel', kind: 'ghost', on: closeSheet },
        { label: 'Start it', on: () => {
            const a = parseFloat($('#ba').value);
            if (!(a > 0)) { toast('That needs an amount.'); return; }
            const id = Store.startBatch(r.id, {
              title: $('#bn').value, amount: a,
              cultureId: $('#bc') ? $('#bc').value : null
            });
            buzz(24); closeSheet();
            setView('kitchen');
            push({ screen: 'batch', id: id });
            syncReminders();
          } }
      ]
    });
  }

  function outcomeSheet(b) {
    openSheet({
      title: 'How did it turn out',
      body: '<div class="field"><label>Rating</label><div class="segbtns" id="rateRow">' +
        [1, 2, 3, 4, 5].map(n => '<button data-rate="' + n + '">' + n + '</button>').join('') + '</div></div>' +
        '<div class="field"><label for="on">Tasting notes</label><textarea id="on" rows="3"></textarea></div>' +
        '<div class="field"><label for="ox">What you would change next time</label><textarea id="ox" rows="2"></textarea></div>',
      actions: [
        { label: 'Cancel', kind: 'ghost', on: closeSheet },
        { label: 'Close the batch', on: () => {
            const sel = $('#rateRow .is-on');
            Store.finishBatch(b.id, {
              rating: sel ? parseInt(sel.dataset.rate, 10) : null,
              notes: $('#on').value.trim(), next: $('#ox').value.trim()
            });
            buzz(26); closeSheet(); refresh();
            toast('Closed out. It stays in the notebook.');
          } }
      ],
      onOpen: body => {
        body.querySelector('#rateRow').addEventListener('click', e => {
          const b2 = e.target.closest('button[data-rate]');
          if (!b2) return;
          body.querySelectorAll('#rateRow button').forEach(x => x.classList.remove('is-on'));
          b2.classList.add('is-on');
        });
      }
    });
  }

  function confirm(title, note, label, on) {
    openSheet({
      title: title,
      body: '<p class="sheet-note" style="margin-top:0">' + esc(note) + '</p>',
      actions: [
        { label: 'Keep it', kind: 'ghost', on: closeSheet },
        { label: label, kind: 'danger', on: () => { closeSheet(); on(); } }
      ]
    });
  }

  function openShot(logId) {
    const cur = currentOwner();
    if (!cur || !cur.o) return;
    const l = cur.o.logs.find(x => x.id === logId);
    if (!l) return;
    openSheet({
      title: Store.dateLine(l.at),
      body: '<img class="bigshot" alt="Journal photograph" data-pid="' + esc(l.photoId) + '">' +
        (l.kind === 'rise' ? '<p class="sheet-note"><b class="mono">' + esc(Store.round(l.value, 2)) + 'x</b>. ' +
          esc(l.text) + '</p>' : l.text ? '<p class="sheet-note">' + esc(l.text) + '</p>' : ''),
      actions: [
        { label: 'Close', kind: 'ghost', on: closeSheet },
        { label: 'Delete photo', kind: 'danger', on: () => {
            Photos.del(l.photoId);
            Store.removeLog(cur.o, l.id);
            closeSheet(); refresh();
          } }
      ],
      onOpen: b => hydratePhotos(b)
    });
  }

  /* ============================================================
     WIRING
     ============================================================ */
  function wire() {
    $$('#tabs .tab').forEach(b => b.addEventListener('click', () => { setView(b.dataset.view); buzz(10); }));
    $('#capFab').addEventListener('click', () => {
      const cur = currentOwner();
      if (cur && cur.o) { openCapture('journal'); return; }
      const bs = Store.activeBatches(), cs = Store.liveCultures();
      if (!bs.length && !cs.length) { toast('Start a batch or add a culture first.'); return; }
      openSheet({
        title: 'Photograph what',
        body: '<div class="stack" style="margin-top:0">' +
          cs.map(c => '<button class="bigchoice" data-pick-c="' + esc(c.id) + '"><b>' + esc(c.name) +
            '</b><i>' + esc(Content.cultureKind(c.kind).label) + '</i></button>').join('') +
          bs.map(b => '<button class="bigchoice" data-pick-b="' + esc(b.id) + '"><b>' + esc(b.title) +
            '</b><i>day ' + Store.dayOf(b.startedAt) + '</i></button>').join('') + '</div>',
        actions: [{ label: 'Cancel', kind: 'ghost', on: closeSheet }],
        onOpen: body => body.addEventListener('click', e => {
          const c = e.target.closest('[data-pick-c]'), b = e.target.closest('[data-pick-b]');
          if (c) { closeSheet(); setView('cultures'); push({ screen: 'culture', id: c.dataset.pickC }); openCapture('journal'); }
          if (b) { closeSheet(); setView('kitchen'); push({ screen: 'batch', id: b.dataset.pickB }); openCapture('journal'); }
        })
      });
    });

    $('#sheetX').addEventListener('click', closeSheet);
    $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
    $('#settingsBtn').addEventListener('click', () => push({ screen: 'settings' }));

    document.addEventListener('click', e => {
      const back = e.target.closest('[data-back]');
      if (back) { pop(); return; }

      const b = e.target.closest('[data-batch]');
      if (b) { push({ screen: 'batch', id: b.dataset.batch }); return; }
      const c = e.target.closest('[data-culture]');
      if (c) {
        if (stack.length && stack[stack.length - 1].screen === 'culture') replace({ screen: 'culture', id: c.dataset.culture });
        else push({ screen: 'culture', id: c.dataset.culture });
        return;
      }
      const r = e.target.closest('[data-recipe]:not([data-act])');
      if (r) { push({ screen: 'recipe', id: r.dataset.recipe }); return; }
      const t = e.target.closest('[data-topic]');
      if (t) { push({ screen: 'topic', kind: 'guide', id: t.dataset.topic }); return; }
      const tr = e.target.closest('[data-triage]');
      if (tr) { push({ screen: 'topic', kind: 'triage', id: tr.dataset.triage }); return; }

      const ag = e.target.closest('[data-ag-owner]');
      if (ag) {
        const d = ag.dataset;
        if (e.target.closest('.ag-do')) {
          if (d.agKind === 'feed') {
            if (firstTap('feed:' + d.agOwner)) { Store.addCultureLog(d.agOwner, { kind: 'feed' }); buzz(18); toast('Fed.'); refresh(); }
            return;
          }
          if (d.agKind === 'check') {
            if (firstTap('ack:' + d.agOwner + d.agAck)) { Store.ackCheck(d.agOwner, d.agAck); buzz(14); refresh(); }
            return;
          }
        }
        if (d.agType === 'culture') push({ screen: 'culture', id: d.agOwner });
        else push({ screen: 'batch', id: d.agOwner });
        return;
      }

      const lg = e.target.closest('[data-log]');
      if (lg) { openLogSheet(lg.dataset.log); return; }
      const shot = e.target.closest('[data-shot]');
      if (shot) { openShot(shot.dataset.shot); return; }
      const dl = e.target.closest('[data-dellog]');
      if (dl) {
        const cur = currentOwner();
        if (!cur || !cur.o) return;
        const entry = cur.o.logs.find(x => x.id === dl.dataset.dellog);
        if (entry && entry.photoId) Photos.del(entry.photoId);
        Store.removeLog(cur.o, dl.dataset.dellog);
        refresh();
        return;
      }
      const task = e.target.closest('[data-task]');
      if (task) {
        const cur = currentOwner();
        if (cur && cur.type === 'batch') {
          Store.toggleTask(cur.o.id, cur.o.stageIndex, parseInt(task.dataset.task, 10));
          // Toggle in place: a checkbox that redraws the whole page under your thumb feels broken.
          task.classList.toggle('is-done');
          buzz(10);
        }
        return;
      }
      const calc = e.target.closest('[data-calc]');
      if (calc) {
        const p = stack[stack.length - 1];
        const rec = Content.recipe(p.id);
        const step = rec.basis.step * (calc.dataset.calc === '+' ? 1 : -1);
        calcAmount.v = Math.max(rec.basis.step, Math.round((calcAmount.v + step) * 100) / 100);
        $('#calcIn').value = calcAmount.v;
        updateTable(rec, calcAmount.v);
        return;
      }
      const unit = e.target.closest('[data-unit]');
      if (unit) { Store.setSetting('unit', unit.dataset.unit); renderSettings(); return; }

      const act = e.target.closest('[data-act]');
      if (act) handleAct(act.dataset.act, act);
    });
  }

  function handleAct(a, node) {
    const cur = currentOwner();
    switch (a) {
      case 'goladder': setView('recipes'); break;
      case 'goguide': setView('guide'); break;
      case 'newculture': newCultureSheet(); break;
      case 'claim': claimSheet(); break;
      case 'startbatch': startBatchSheet(node.dataset.recipe); break;
      case 'photo': openCapture('journal'); break;
      case 'risecheck': openCapture(cur && cur.o && cur.o.riseRef ? 'rise' : 'mark'); break;
      case 'advance':
        // Guarded: a double tap on this used to skip a whole stage of the ferment.
        if (cur && cur.type === 'batch' && firstTap('advance:' + cur.o.id)) {
          Store.advanceStage(cur.o.id); buzz(24); refresh(); toast('Stage moved on.');
        }
        break;
      case 'backstage':
        if (cur && cur.type === 'batch' && firstTap('backstage:' + cur.o.id)) { Store.backStage(cur.o.id); refresh(); }
        break;
      case 'outcome': if (cur && cur.type === 'batch') outcomeSheet(cur.o); break;
      case 'reopen': if (cur && cur.type === 'batch') { Store.reopenBatch(cur.o.id); refresh(); } break;
      case 'bin':
        if (cur && cur.type === 'batch') confirm('Bin this batch', 'It stays in the notebook marked as binned, ' +
          'so the next attempt can learn from it.', 'Bin it', () => { Store.binBatch(cur.o.id, ''); refresh(); });
        break;
      case 'deletebatch':
        if (cur && cur.type === 'batch') confirm('Delete this batch', 'The batch, its readings and its ' +
          'photographs go for good. This cannot be undone.', 'Delete', () => {
            cur.o.logs.forEach(l => { if (l.photoId) Photos.del(l.photoId); });
            Store.deleteBatch(cur.o.id); pop(); refresh();
          });
        break;
      case 'feed':
        if (cur && cur.type === 'culture' && firstTap('feed:' + cur.o.id)) {
          Store.addCultureLog(cur.o.id, { kind: 'feed' }); buzz(20); refresh(); toast('Fed.');
        }
        break;
      case 'schedule': if (cur && cur.type === 'culture') scheduleSheet(cur.o); break;
      case 'split': if (cur && cur.type === 'culture') splitSheet(cur.o); break;
      case 'gift': if (cur && cur.type === 'culture') giftSheet(cur.o); break;
      case 'retire': if (cur && cur.type === 'culture') { Store.retireCulture(cur.o.id); refresh(); } break;
      case 'unretire': if (cur && cur.type === 'culture') { Store.patchCulture(cur.o.id, { state: 'active' }); refresh(); } break;
      case 'deleteculture':
        if (cur && cur.type === 'culture') confirm('Delete this culture', 'Its history, photographs and place ' +
          'in the family tree go with it. Any jars split from it stay, without a parent.', 'Delete', () => {
            cur.o.logs.forEach(l => { if (l.photoId) Photos.del(l.photoId); });
            Store.deleteCulture(cur.o.id); pop(); refresh();
          });
        break;
      case 'asknotif':
        if (window.Native && Native.requestNotificationPermission) Native.requestNotificationPermission();
        break;
      case 'exporttext': download('ferment-notebook.txt', 'text/plain', Store.exportText()); break;
      case 'exportjson': download('ferment-backup.json', 'application/json', Store.exportJSON()); break;
      case 'erase': {
        const btn = $('#eraseBtn');
        if (!eraseArmed) {
          eraseArmed = true;
          btn.textContent = 'Tap again to erase everything';
          $('#ioNote').textContent = 'This removes every batch, culture, reading and photograph from this ' +
            'device. There is no copy anywhere else.';
          setTimeout(() => {
            eraseArmed = false;
            if ($('#eraseBtn')) { $('#eraseBtn').textContent = 'Erase everything'; $('#ioNote').textContent = ''; }
          }, 6000);
          return;
        }
        eraseArmed = false;
        Store.eraseAll();
        Photos.clear();
        setView('kitchen');
        toast('Erased.');
        syncReminders();
        break;
      }
    }
  }

  /* ---------- first run ---------- */
  function renderWelcome() {
    $('#wm').innerHTML = Charts.jarHero(0.62, { seed: 11, label: 'The Ferment jar' });
    $('#welcomePaths').innerHTML = Content.START_PATHS.map(p =>
      '<button class="bigchoice" data-path="' + p.id + '"><b>' + esc(p.title) + '</b><i>' + esc(p.sub) + '</i></button>'
    ).join('');
    $('#welcomePaths').addEventListener('click', e => {
      const b = e.target.closest('[data-path]');
      if (!b) return;
      Store.setSetting('onboarded', true);
      $('#s-welcome').hidden = true;
      $('#tabs').hidden = false;
      document.body.classList.add('has-tabs');
      buzz(18);
      if (b.dataset.path === 'have') { setView('cultures'); newCultureSheet(); }
      else if (b.dataset.path === 'fresh') { setView('recipes'); }
      else if (b.dataset.path === 'gift') { setView('cultures'); claimSheet(); }
      else { setView('guide'); }
    });
  }

  /* ---------- the shell's three hooks ---------- */
  function back() {
    if (Capture.isOpen()) { Capture.close(); return true; }
    if (!$('#sheet').hidden) { closeSheet(); return true; }
    if (stack.length) { pop(); return true; }
    if (view !== 'kitchen') { setView('kitchen'); return true; }
    return false;
  }
  function onPause() { if (Capture.isOpen()) Capture.stop(); syncReminders(); }
  function onResume() {
    // Android stops the camera when the app goes away. Without this the viewfinder came back
    // frozen and the shutter fell through to the file picker.
    if (Capture.isOpen()) Capture.resume();
    if (view === 'kitchen') renderKitchen();
    if (view === 'cultures') renderCultures();
    syncReminders();
  }

  /* ---------- go ---------- */
  function init() {
    $('#ti-kitchen').innerHTML = Content.glyph('crock');
    $('#ti-recipes').innerHTML = Content.glyph('loaf');
    $('#ti-cultures').innerHTML = Content.glyph('starter');
    $('#ti-guide').innerHTML = GUIDE_GLYPH;
    Capture.init();
    wire();
    renderWelcome();

    if (!Store.settings().onboarded && Store.isEmpty()) {
      $('#s-welcome').hidden = false;
      $('#tabs').hidden = true;
    } else {
      $('#tabs').hidden = false;
      document.body.classList.add('has-tabs');
      setView('kitchen');
    }
    syncReminders();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) onResume(); });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { back, onPause, onResume, setView, push, buzz, refresh, toast };
})();

/* A top-level const is not a window property, and the shell reaches for window.App. */
window.App = App;
