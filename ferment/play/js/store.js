/* Ferment. Every batch, culture and log line lives in one localStorage record on this device.
   Photographs live in IndexedDB next to it. Nothing is transmitted, because the app has no network. */

const Store = (() => {
  const KEY = 'ferment.v1';
  const HOUR = 3600000, DAY = 86400000;

  const DEFAULTS = {
    v: 1,
    batches: [],
    cultures: [],
    settings: {
      kitchenTempC: 21,
      unit: 'C',            // C | F, display only
      notify: true,
      haptics: true,
      onboarded: false
    },
    createdAt: null
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      const d = JSON.parse(raw);
      return {
        v: 1,
        batches: Array.isArray(d.batches) ? d.batches.map(fixBatch) : [],
        cultures: Array.isArray(d.cultures) ? d.cultures.map(fixCulture) : [],
        settings: Object.assign(clone(DEFAULTS.settings), d.settings || {}),
        createdAt: d.createdAt || null
      };
    } catch (e) { return clone(DEFAULTS); }
  }
  function fixBatch(b) {
    b.logs = Array.isArray(b.logs) ? b.logs : [];
    b.doneTasks = b.doneTasks || {};
    b.acks = b.acks || {};
    b.riseRef = b.riseRef || null;
    // A restored backup is the one record this app does not write itself, so the fields every
    // screen reads are filled in rather than trusted.
    b.startedAt = b.startedAt || Date.now();
    b.stageStartedAt = b.stageStartedAt || b.startedAt;
    b.stageIndex = Math.max(0, parseInt(b.stageIndex, 10) || 0);
    b.state = b.state === 'done' || b.state === 'binned' ? b.state : 'active';
    const rec = Content.recipe(b.recipeId);
    // A stage number past the end of the plan is a stage the screens would read as undefined.
    if (rec && b.stageIndex > rec.stages.length - 1) b.stageIndex = rec.stages.length - 1;
    if (!b.scale || typeof b.scale.amount !== 'number' || !(b.scale.amount > 0)) {
      b.scale = { key: rec ? rec.basis.key : 'amount', amount: rec ? rec.basis.def : 1000 };
    }
    if (!b.title) b.title = (Content.recipe(b.recipeId) || {}).title || 'Batch';
    return b;
  }
  function fixCulture(c) {
    c.logs = Array.isArray(c.logs) ? c.logs : [];
    c.ancestors = Array.isArray(c.ancestors) ? c.ancestors : [];
    c.gifted = Array.isArray(c.gifted) ? c.gifted : [];
    c.riseRef = c.riseRef || null;
    return c;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { return false; }
  }
  function touch() { if (!db.createdAt) db.createdAt = Date.now(); }
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- settings ---------- */
  const settings = () => db.settings;
  function setSetting(k, v) { db.settings[k] = v; save(); }

  /* ---------- temperature ---------- */
  const toF = c => c * 9 / 5 + 32;
  const fromF = f => (f - 32) * 5 / 9;
  function showTemp(c, dp) {
    if (c === null || c === undefined || isNaN(c)) return '';
    if (db.settings.unit === 'F') return round(toF(c), dp === undefined ? 0 : dp) + 'F';
    return round(c, dp === undefined ? 1 : dp) + 'C';
  }
  function round(n, dp) {
    const m = Math.pow(10, dp || 0);
    const r = Math.round(n * m) / m;
    return String(r);
  }

  /**
   * Fermentation roughly doubles in pace for every 10 degrees warmer, so a feeding interval
   * set at one temperature can be scaled to the kitchen you actually have. Clamped hard,
   * because the rule stops being true far from the middle.
   */
  function adjustHours(baseHours, baseTemp, tempC) {
    if (tempC === null || tempC === undefined || isNaN(tempC)) return baseHours;
    const t = Math.max(4, Math.min(38, tempC));
    const raw = baseHours * Math.pow(2, (baseTemp - t) / 10);
    return Math.max(baseHours * 0.35, Math.min(baseHours * 3, Math.max(2, Math.min(336, raw))));
  }

  /* ---------- cultures ---------- */
  const cultures = () => db.cultures.slice();
  const liveCultures = () => db.cultures.filter(c => c.state !== 'retired');
  const culture = id => db.cultures.find(c => c.id === id) || null;

  function addCulture(o) {
    touch();
    const kind = Content.cultureKind(o.kind || 'starter');
    const c = {
      id: uid('c'),
      name: (o.name || '').trim() || 'Unnamed culture',
      kind: kind.id,
      bornAt: o.bornAt || Date.now(),
      createdAt: Date.now(),
      parentId: o.parentId || null,
      origin: (o.origin || '').trim(),
      feed: { hours: o.feedHours || kind.feedHours, tempC: o.feedTemp || kind.feedTemp, ratio: o.ratio || kind.ratio },
      logs: [],
      ancestors: o.ancestors || [],
      gifted: [],
      riseRef: null,
      photoId: null,
      state: 'active'
    };
    db.cultures.push(c);
    save();
    return c.id;
  }
  function patchCulture(id, o) { const c = culture(id); if (!c) return; Object.assign(c, o); save(); }
  function retireCulture(id) { patchCulture(id, { state: 'retired' }); }
  function deleteCulture(id) {
    const gone = culture(id);
    const kids = db.cultures.filter(c => c.parentId === id);
    // A deleted jar must not erase its children's ancestry, so it is written into them.
    const inherited = gone ? ancestryOf(gone).concat([{ n: gone.name, k: gone.kind, b: gone.bornAt }]) : [];
    for (const k of kids) { k.parentId = null; k.ancestors = inherited.concat(k.ancestors || []); }
    db.cultures = db.cultures.filter(c => c.id !== id);
    for (const b of db.batches) if (b.cultureId === id) b.cultureId = null;
    save();
  }
  /** Take an offshoot: a real second jar, and the reason a lineage tree exists for one person. */
  function splitCulture(id, name) {
    const p = culture(id); if (!p) return null;
    const kid = addCulture({
      name: name, kind: p.kind, bornAt: Date.now(), parentId: p.id,
      origin: 'Split from ' + p.name, feedHours: p.feed.hours, feedTemp: p.feed.tempC, ratio: p.feed.ratio
    });
    logTo(p, { kind: 'note', text: 'Split off a new jar: ' + name });
    return kid;
  }

  /* ---------- batches ---------- */
  const batches = () => db.batches.slice();
  const activeBatches = () => db.batches.filter(b => b.state === 'active');
  const batch = id => db.batches.find(b => b.id === id) || null;

  function startBatch(recipeId, o) {
    touch();
    const r = Content.recipe(recipeId);
    if (!r) return null;
    const now = Date.now();
    const b = {
      id: uid('b'),
      recipeId: r.id,
      title: (o && o.title || '').trim() || r.title,
      family: r.family,
      cultureId: (o && o.cultureId) || null,
      startedAt: now,
      stageIndex: 0,
      stageStartedAt: now,
      scale: { key: r.basis.key, amount: (o && o.amount) || r.basis.def },
      state: 'active',
      finishedAt: null,
      outcome: null,
      logs: [],
      doneTasks: {},
      acks: {},
      riseRef: null
    };
    db.batches.push(b);
    save();
    return b.id;
  }
  function patchBatch(id, o) { const b = batch(id); if (!b) return; Object.assign(b, o); save(); }
  function deleteBatch(id) { db.batches = db.batches.filter(b => b.id !== id); save(); }

  function advanceStage(id) {
    const b = batch(id); if (!b) return;
    const r = Content.recipe(b.recipeId); if (!r) return;
    const name = r.stages[b.stageIndex] ? r.stages[b.stageIndex].name : '';
    if (b.stageIndex >= r.stages.length - 1) { return; }
    b.stageIndex++;
    b.stageStartedAt = Date.now();
    b.logs.push(mkLog({ kind: 'stage', text: 'Finished ' + name + ', started ' + r.stages[b.stageIndex].name }));
    save();
  }
  function backStage(id) {
    const b = batch(id); if (!b || b.stageIndex === 0) return;
    b.stageIndex--;
    b.stageStartedAt = Date.now();
    save();
  }
  function finishBatch(id, outcome) {
    const b = batch(id); if (!b) return;
    b.state = 'done';
    b.finishedAt = Date.now();
    b.outcome = { rating: outcome.rating || null, notes: outcome.notes || '', next: outcome.next || '' };
    save();
  }
  function binBatch(id, why) {
    const b = batch(id); if (!b) return;
    b.state = 'binned';
    b.finishedAt = Date.now();
    b.outcome = { rating: null, notes: why || '', next: '' };
    save();
  }
  function reopenBatch(id) {
    const b = batch(id); if (!b) return;
    b.state = 'active'; b.finishedAt = null; b.outcome = null; save();
  }
  function toggleTask(id, stageIdx, taskIdx) {
    const b = batch(id); if (!b) return;
    const k = stageIdx + ':' + taskIdx;
    if (b.doneTasks[k]) delete b.doneTasks[k]; else b.doneTasks[k] = Date.now();
    save();
  }
  const taskDone = (b, s, t) => !!(b.doneTasks && b.doneTasks[s + ':' + t]);

  /* ---------- logs, shared by batches and cultures ---------- */
  function mkLog(o) {
    return { id: uid('l'), at: o.at || Date.now(), kind: o.kind, value: (o.value === undefined ? null : o.value),
             text: o.text || '', photoId: o.photoId || null, meta: o.meta || null };
  }
  function logTo(owner, o) {
    if (!owner) return null;
    const l = mkLog(o);
    owner.logs.push(l);
    owner.logs.sort((a, b) => a.at - b.at);
    save();
    return l;
  }
  function addBatchLog(id, o) { const b = batch(id); return b ? logTo(b, o) : null; }
  function addCultureLog(id, o) { const c = culture(id); return c ? logTo(c, o) : null; }
  function removeLog(owner, logId) {
    if (!owner) return null;
    const l = owner.logs.find(x => x.id === logId);
    owner.logs = owner.logs.filter(x => x.id !== logId);
    save();
    return l;
  }
  const logsOfKind = (owner, kind) => owner.logs.filter(l => l.kind === kind).sort((a, b) => a.at - b.at);
  const lastLog = (owner, kind) => {
    const l = logsOfKind(owner, kind);
    return l.length ? l[l.length - 1] : null;
  };
  const photoLogs = owner => owner.logs.filter(l => l.photoId).sort((a, b) => a.at - b.at);

  /** The last temperature anyone actually measured for this thing, falling back to the kitchen setting. */
  function tempFor(owner) {
    const t = owner ? lastLog(owner, 'temp') : null;
    if (t && t.at > Date.now() - 7 * DAY) return { c: t.value, from: 'log', at: t.at };
    return { c: db.settings.kitchenTempC, from: 'kitchen', at: null };
  }

  /* ---------- feeding rhythm ---------- */
  function feedState(c) {
    const last = lastLog(c, 'feed');
    const t = tempFor(c);
    const hours = adjustHours(c.feed.hours, c.feed.tempC, t.c);
    const lastAt = last ? last.at : c.createdAt || c.bornAt;
    const due = lastAt + hours * HOUR;
    const span = hours * HOUR;
    const frac = Math.max(0, Math.min(1.35, (Date.now() - lastAt) / span));
    return { lastAt, due, hours, frac, overdue: Date.now() > due, tempC: t.c, tempFrom: t.from,
             baseHours: c.feed.hours, baseTemp: c.feed.tempC, everFed: !!last };
  }

  /* ---------- rise marks: the digital rubber band ---------- */
  /** Ratio of the current dough height to the height it was at the feed, from three screen lines. */
  function riseRatio(ref, y) {
    if (!ref) return null;
    const h0 = ref.bottomY - ref.baseY;
    const h1 = ref.bottomY - y;
    if (h0 <= 0.001) return null;
    return Math.max(0.1, Math.min(9, h1 / h0));
  }
  function setRiseRef(owner, ref) { owner.riseRef = { bottomY: ref.bottomY, baseY: ref.baseY, at: Date.now() }; save(); }
  function riseSeries(owner) {
    if (!owner.riseRef) return [];
    return owner.logs.filter(l => l.kind === 'rise' && l.at >= owner.riseRef.at)
      .sort((a, b) => a.at - b.at)
      .map(l => ({ at: l.at, hours: (l.at - owner.riseRef.at) / HOUR, ratio: l.value, photoId: l.photoId }));
  }
  function risePeak(owner) {
    const s = riseSeries(owner);
    if (!s.length) return null;
    let best = s[0];
    for (const p of s) if (p.ratio > best.ratio) best = p;
    return best;
  }

  /* ---------- what happens next ---------- */
  /** Every pending item across every active thing, soonest first. Drives the Kitchen, and the alarms. */
  function agenda(limitMs, opts) {
    const now = Date.now();
    const horizon = now + (limitMs || 14 * DAY);
    /* The Kitchen wants the next occurrence of each thing. The alarm plan wants the whole run,
       because a phone that is not opened for three days must still get its feeds. */
    const maxPer = (opts && opts.repeat) ? 8 : 1;
    const out = [];

    for (const c of liveCultures()) {
      const f = feedState(c);
      const span = f.hours * HOUR;
      let at = f.due;
      while (at < now - span) at += span;
      for (let k = 0; k < maxPer && at < horizon; k++, at += span) {
        out.push({ at, kind: 'feed', ownerType: 'culture', ownerId: c.id, owner: c.name,
                   title: 'Feed ' + c.name,
                   body: c.feed.ratio ? c.feed.ratio : 'Time for a feed.',
                   line: f.everFed ? 'Feed due' : 'First feed due' });
        if (maxPer === 1) break;
      }
    }

    for (const b of activeBatches()) {
      const r = Content.recipe(b.recipeId);
      if (!r) continue;
      const st = r.stages[b.stageIndex];
      if (!st) continue;
      const stageEnd = b.stageStartedAt + st.days[1] * DAY;
      const stageSoft = b.stageStartedAt + st.days[0] * DAY;
      for (let ci = 0; ci < (st.checks || []).length; ci++) {
        const ch = st.checks[ci];
        const span = ch.every * HOUR;
        const until = b.stageStartedAt + (ch.firstDays || 3) * DAY;
        let slot = 1;
        let at = b.stageStartedAt + span;
        while (at < now - span) { at += span; slot++; }
        if (at > until) continue;
        const key = b.stageIndex + ':' + ci + ':' + slot;
        if (b.acks && b.acks[key]) { at += span; slot++; if (at > until) continue; }
        for (let k = 0; k < maxPer && at <= until && at < horizon; k++, at += span, slot++) {
          out.push({ at, kind: 'check', ownerType: 'batch', ownerId: b.id, owner: b.title,
                     title: b.title, body: ch.text, line: ch.text,
                     ackKey: b.stageIndex + ':' + ci + ':' + slot });
        }
      }
      /* A stage that is simply running is not an action. Only the two edges of the window are. */
      if (b.stageIndex === r.stages.length - 1) {
        out.push({ at: stageSoft, kind: 'stage', ownerType: 'batch', ownerId: b.id, owner: b.title,
                   title: b.title, body: 'The last stage has reached its window. Taste it and record how it turned out.',
                   line: 'Ready to close out' });
      } else if (now < stageSoft) {
        out.push({ at: stageSoft, kind: 'stage', ownerType: 'batch', ownerId: b.id, owner: b.title,
                   title: b.title, body: st.name + ' has reached its expected window. Check it, and move it on when it is ready.',
                   line: st.name + ' reaches its window' });
      } else if (now > stageEnd) {
        out.push({ at: stageEnd, kind: 'stage', ownerType: 'batch', ownerId: b.id, owner: b.title,
                   title: b.title, body: st.name + ' has run past its expected window. Taste it and move it on.',
                   line: 'Past the window for ' + st.name.toLowerCase() });
      }
    }
    return out.filter(x => x.at < horizon).sort((a, b) => a.at - b.at);
  }

  function ackCheck(batchId, key) {
    const b = batch(batchId); if (!b) return;
    b.acks[key] = Date.now();
    save();
  }

  /** The pre-computed alarm plan the shell schedules. Replaces the whole plan every time. */
  function reminderPlan() {
    if (!db.settings.notify) return [];
    const now = Date.now();
    return agenda(21 * DAY, { repeat: true })
      .filter(a => a.at > now + 60000)
      .slice(0, 60)
      .map((a, i) => ({ id: i + 1, at: Math.round(a.at), title: a.title, body: a.body }));
  }

  /** Oldest first: what came with the card, then every local jar this one was split from. */
  function ancestryOf(c) {
    const chain = [];
    const seen = {};
    let n = c;
    while (n && n.parentId && culture(n.parentId) && !seen[n.id]) {
      seen[n.id] = 1;
      n = culture(n.parentId);
      chain.unshift({ n: n.name, k: n.kind, b: n.bornAt });
    }
    return ((n && n.ancestors) || []).concat(chain);
  }

  /* ---------- culture cards ---------- */
  const B64 = {
    enc(s) { return btoa(unescape(encodeURIComponent(s))).replace(/=+$/, ''); },
    dec(s) { return decodeURIComponent(escape(atob(s.replace(/[^A-Za-z0-9+/=]/g, '')))); }
  };
  function giftCode(id, toWhom) {
    const c = culture(id); if (!c) return '';
    const chain = ancestryOf(c).concat([{ n: c.name, k: c.kind, b: c.bornAt }]);
    const payload = { v: 1, n: c.name, k: c.kind, b: c.bornAt, o: c.origin, a: chain.slice(-12) };
    c.gifted.push({ name: (toWhom || '').trim() || 'someone', at: Date.now() });
    save();
    return 'FRMT1.' + B64.enc(JSON.stringify(payload));
  }
  function readCode(code) {
    try {
      const s = String(code || '').trim();
      const i = s.indexOf('FRMT1.');
      if (i < 0) return null;
      const p = JSON.parse(B64.dec(s.slice(i + 6).split(/\s/)[0]));
      if (!p || !p.n) return null;
      return { name: p.n, kind: Content.cultureKind(p.k).id, bornAt: p.b || Date.now(),
               origin: p.o || '', ancestors: Array.isArray(p.a) ? p.a.map(x => ({ n: x.n, k: x.k, b: x.b })) : [] };
    } catch (e) { return null; }
  }
  function claimCode(code, myName) {
    const g = readCode(code); if (!g) return null;
    return addCulture({
      name: (myName || '').trim() || g.name,
      kind: g.kind, bornAt: g.bornAt, origin: g.origin,
      ancestors: g.ancestors
    });
  }

  /* ---------- lineage ---------- */
  /** A tree of the local cultures, with any inherited ancestors shown above the root. */
  function lineage(id) {
    const c = culture(id); if (!c) return null;
    let root = c;
    const seen = {};
    while (root.parentId && culture(root.parentId) && !seen[root.id]) { seen[root.id] = 1; root = culture(root.parentId); }
    const build = n => ({ id: n.id, name: n.name, kind: n.kind, bornAt: n.bornAt, state: n.state,
                          children: db.cultures.filter(x => x.parentId === n.id).map(build) });
    return { ancestors: root.ancestors || [], root: build(root), focus: id };
  }
  function descendantCount(id) {
    let n = 0;
    const walk = pid => { for (const c of db.cultures) if (c.parentId === pid) { n++; walk(c.id); } };
    walk(id);
    return n;
  }

  /* ---------- dates ---------- */
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const LONGM = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const pad = n => String(n).padStart(2, '0');
  const clock = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  function dayLabel(ts) {
    const d = new Date(ts), n = new Date();
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, n)) return 'Today';
    const y = new Date(n); y.setDate(y.getDate() - 1);
    if (same(d, y)) return 'Yesterday';
    const t = new Date(n); t.setDate(t.getDate() + 1);
    if (same(d, t)) return 'Tomorrow';
    return d.getDate() + ' ' + MON[d.getMonth()] + (d.getFullYear() !== n.getFullYear() ? ' ' + d.getFullYear() : '');
  }
  const dateLine = ts => dayLabel(ts) + ', ' + clock(ts);
  function isoDay(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /** "in 4h", "in 3 days", "9h ago". Coarse on purpose: fermentation does not care about minutes. */
  function relative(ts, now) {
    const ms = ts - (now || Date.now());
    const a = Math.abs(ms);
    let s;
    if (a < 45 * 60000) s = Math.max(1, Math.round(a / 60000)) + ' min';
    else if (a < 36 * HOUR) s = Math.round(a / HOUR) + 'h';
    else if (a < 60 * DAY) s = Math.round(a / DAY) + ' days';
    else s = Math.round(a / (30 * DAY)) + ' months';
    return ms >= 0 ? 'in ' + s : s + ' ago';
  }
  /** Whole months between two dates, counted on the calendar rather than divided out of days. */
  function monthsApart(a, b) {
    const x = new Date(a), y = new Date(b);
    let m = (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth());
    if (y.getDate() < x.getDate()) m--;
    return m;
  }
  function ageText(ts) {
    const now = Date.now();
    const d = Math.floor((now - ts) / DAY);
    if (d < 1) return 'started today';
    if (d < 60) return d + (d === 1 ? ' day old' : ' days old');
    // Counted on the calendar: dividing days by 30.44 called a jar on its first birthday
    // eleven months old, and could land on "1 year and 12 months".
    const mo = Math.max(2, monthsApart(ts, now));
    if (mo < 24) return mo + (mo === 1 ? ' month old' : ' months old');
    const y = Math.floor(mo / 12), rm = mo % 12;
    return y + (y === 1 ? ' year' : ' years') +
           (rm ? ' and ' + rm + (rm === 1 ? ' month' : ' months') : '') + ' old';
  }
  const dayOf = (startedAt) => Math.floor((Date.now() - startedAt) / DAY) + 1;
  function spanText(hours) {
    if (hours < 1) return Math.round(hours * 60) + ' min';
    if (hours < 48) return (hours < 10 ? round(hours, 1) : Math.round(hours)) + 'h';
    return round(hours / 24, 1) + ' days';
  }

  /* ---------- scaling ---------- */
  function scaled(recipe, amount) {
    return recipe.ingredients.map(i => ({
      name: i.name, pct: i.pct, note: i.note,
      amount: i.pct === 0 ? null : amount * i.pct / 100
    }));
  }
  /** Table cells stay in the recipe's own unit so the column stays comparable. */
  function fmtAmount(g) {
    if (g === null) return '';
    if (g >= 100) return String(Math.round(g));
    if (g >= 1) return round(g, 1);
    return round(g, 2);
  }
  /** One headline figure, where kilograms and litres read better than four digits. */
  function fmtScale(amount, unit) {
    if (unit === 'g' && amount >= 1000) return round(amount / 1000, 2) + ' kg';
    if (unit === 'ml' && amount >= 1000) return round(amount / 1000, 2) + ' L';
    return Math.round(amount) + ' ' + unit;
  }
  /** (OG - FG) * 131.25 is the usual home estimate for alcohol by volume. */
  function abv(og, fg) {
    if (!og || !fg || og <= fg) return null;
    return round((og - fg) * 131.25, 1);
  }

  /* ---------- export ---------- */
  function exportText() {
    const L = [];
    L.push('FERMENT LAB NOTEBOOK');
    L.push('Exported ' + new Date().toLocaleString());
    L.push('Written on this device. Nothing was uploaded to produce this file.');
    L.push('');
    L.push('CULTURES (' + db.cultures.length + ')');
    L.push('');
    for (const c of db.cultures) {
      const k = Content.cultureKind(c.kind);
      L.push(c.name + ', ' + k.label + (c.state === 'retired' ? ', retired' : ''));
      L.push('  Born ' + isoDay(c.bornAt) + ', ' + ageText(c.bornAt).toLowerCase());
      if (c.origin) L.push('  Origin: ' + c.origin);
      const anc = ancestryOf(c);
      if (anc.length) L.push('  Lineage: ' + anc.map(a => a.n).join(' > ') + ' > ' + c.name);
      L.push('  Schedule: every ' + c.feed.hours + 'h at ' + c.feed.tempC + 'C. ' + (c.feed.ratio || ''));
      const feeds = logsOfKind(c, 'feed');
      L.push('  Feeds logged: ' + feeds.length + (feeds.length ? ', last ' + isoDay(feeds[feeds.length - 1].at) : ''));
      const peak = risePeak(c);
      if (peak) L.push('  Best rise since the current mark: ' + round(peak.ratio, 2) + 'x at ' + spanText(peak.hours) + ' after the feed');
      for (const l of c.logs) L.push('    ' + isoDay(l.at) + ' ' + clock(l.at) + '  ' + logLine(l));
      L.push('');
    }
    L.push('BATCHES (' + db.batches.length + ')');
    L.push('');
    for (const b of db.batches) {
      const r = Content.recipe(b.recipeId);
      L.push(b.title + ' [' + (r ? r.title : b.recipeId) + ']  ' + b.state);
      L.push('  Started ' + isoDay(b.startedAt) + (b.finishedAt ? ', ended ' + isoDay(b.finishedAt) : ''));
      if (r) L.push('  Stage: ' + (r.stages[b.stageIndex] ? r.stages[b.stageIndex].name : '') +
                    ' (' + (b.stageIndex + 1) + ' of ' + r.stages.length + ')');
      if (r) L.push('  Scale: ' + fmtScale(b.scale.amount, r.basis.unit) + ' ' + r.basis.label.toLowerCase());
      if (b.cultureId && culture(b.cultureId)) L.push('  Culture: ' + culture(b.cultureId).name);
      if (b.outcome) {
        L.push('  Outcome: ' + (b.outcome.rating ? b.outcome.rating + ' of 5' : 'not rated'));
        if (b.outcome.notes) L.push('    Notes: ' + b.outcome.notes);
        if (b.outcome.next) L.push('    Next time: ' + b.outcome.next);
      }
      for (const l of b.logs) L.push('    ' + isoDay(l.at) + ' ' + clock(l.at) + '  ' + logLine(l));
      L.push('');
    }
    L.push('Kitchen temperature setting: ' + db.settings.kitchenTempC + 'C');
    L.push('Photographs are not included in this text file. They stay on the device.');
    return L.join('\n');
  }
  function logLine(l) {
    const k = Content.LOG_KINDS[l.kind] || { label: l.kind, unit: '' };
    let s = k.label;
    if (l.value !== null && l.value !== undefined) s += ' ' + l.value + (k.unit ? ' ' + k.unit : '');
    if (l.text) s += (l.value !== null && l.value !== undefined ? '. ' : ': ') + l.text;
    if (l.photoId) s += ' [photo]';
    return s;
  }
  const exportJSON = () => JSON.stringify(db, null, 1);
  function importJSON(text) {
    try {
      const d = JSON.parse(text);
      if (!d || !Array.isArray(d.batches) || !Array.isArray(d.cultures)) return false;
      db = {
        v: 1,
        batches: d.batches.map(fixBatch),
        cultures: d.cultures.map(fixCulture),
        settings: Object.assign(clone(DEFAULTS.settings), d.settings || {}),
        createdAt: d.createdAt || Date.now()
      };
      return save();
    } catch (e) { return false; }
  }
  function eraseAll() { db = clone(DEFAULTS); save(); }
  const all = () => db;
  const isEmpty = () => !db.batches.length && !db.cultures.length;

  return {
    KEY, HOUR, DAY,
    settings, setSetting, showTemp, toF, fromF, round, adjustHours,
    cultures, liveCultures, culture, addCulture, patchCulture, retireCulture, deleteCulture, splitCulture,
    batches, activeBatches, batch, startBatch, patchBatch, deleteBatch,
    advanceStage, backStage, finishBatch, binBatch, reopenBatch, toggleTask, taskDone,
    addBatchLog, addCultureLog, removeLog, logsOfKind, lastLog, photoLogs, logLine, tempFor,
    feedState, riseRatio, setRiseRef, riseSeries, risePeak,
    agenda, ackCheck, reminderPlan,
    giftCode, readCode, claimCode, lineage, descendantCount, ancestryOf,
    dayLabel, dateLine, clock, isoDay, relative, ageText, dayOf, spanText,
    scaled, fmtAmount, fmtScale, abv,
    exportText, exportJSON, importJSON, eraseAll, all, isEmpty, save
  };
})();

window.Store = Store;
