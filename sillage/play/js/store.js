/* Sillage. One localStorage record holds everything, and nothing leaves the device.
   This file is also the resurfacing engine, the vocabulary counter and the shelf
   statistics. All three are pure functions over the record, so nothing is cached,
   nothing drifts, and the whole thing can be audited by reading it. */
const Store = (() => {
  const KEY = 'sillage.v1';
  const DAY = 86400000;

  const DEFAULTS = {
    entries: [],
    bottles: [],
    wears: [],
    sessions: [],
    settings: {
      remindOn: false,
      remindTime: '07:00',
      remindEvery: 1,          // days between training reminders
      resurfaceOn: true,
      hemisphere: 'north',
      currency: '$',
      showPrices: true
    },
    onboarded: false,
    installed: null
  };

  let db = load();
  if (repair()) save();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const d = JSON.parse(raw);
      const s = Object.assign(structuredClone(DEFAULTS.settings), d.settings || {});
      return {
        entries: Array.isArray(d.entries) ? d.entries : [],
        bottles: Array.isArray(d.bottles) ? d.bottles : [],
        wears: Array.isArray(d.wears) ? d.wears : [],
        sessions: Array.isArray(d.sessions) ? d.sessions : [],
        settings: s,
        onboarded: !!d.onboarded,
        installed: d.installed || Date.now()
      };
    } catch (e) {
      return structuredClone(DEFAULTS);
    }
  }

  /* 1.0.0 wrote whatever the form handed it, so a shelf restored from that version can still
     hold a price of -40, a five thousand millilitre bottle, a wear dated in 2099 and a status
     no screen knows how to name. 1.0.1 refuses all four on the way in, which does nothing for
     the records already on the phone: this runs the same rules over them once, at boot, and
     only writes if something actually moved. Nothing is deleted; every value is pulled back
     into the range the app can draw, and the only thing dropped is a wear pointing at a
     bottle that is no longer on the shelf, which nothing can show. */
  function repair() {
    const now = Date.now();
    let changed = false;
    const set = (o, k, v) => { if (o[k] !== v) { o[k] = v; changed = true; } };
    for (const b of db.bottles) {
      set(b, 'price', cleanPrice(b.price));
      set(b, 'sizeMl', cleanSize(b.sizeMl));
      set(b, 'status', cleanStatus(b.status));
      const acq = Number(b.acquiredAt);
      set(b, 'acquiredAt', isFinite(acq) && acq > 0 ? Math.min(acq, now) : now);
    }
    const live = new Set(db.bottles.map(b => b.id));
    for (const w of db.wears) {
      const at = Number(w.at);
      set(w, 'at', isFinite(at) && at > 0 ? Math.min(at, now) : now);
      set(w, 'sprays', cleanSprays(w.sprays));
    }
    const keep = db.wears.filter(w => live.has(w.bottleId));
    if (keep.length !== db.wears.length) { db.wears = keep; changed = true; }
    for (const e of db.entries) {
      if (e.bottleId && !live.has(e.bottleId)) set(e, 'bottleId', null);
    }
    return changed;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { return false; }
  }

  const uid = p => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  /* ---------- dates ---------- */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const ymd = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
  const dayOfYear = t => { const d = new Date(t); return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / DAY); };

  function longDate(t) { const d = new Date(t); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function shortDate(t) { const d = new Date(t); return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); }

  function ago(t) {
    const n = daysBetween(t, Date.now());
    if (n <= 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 14) return n + ' days ago';
    if (n < 60) return Math.round(n / 7) + ' weeks ago';
    if (n < 400) return Math.round(n / 30) + ' months ago';
    const y = Math.round(n / 365);
    return y === 1 ? 'a year ago' : y + ' years ago';
  }

  function seasonOf(t) {
    const m = new Date(t).getMonth();
    const north = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer',
                   'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][m];
    if (db.settings.hemisphere === 'south') {
      const flip = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' };
      return flip[north];
    }
    return north;
  }
  const seasonLabel = id => ({ spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' })[id] || id;

  /* ---------- entries ---------- */
  function entries() { return db.entries.slice().sort((a, b) => b.at - a.at); }
  function entry(id) { return db.entries.find(e => e.id === id) || null; }

  function addEntry(o) {
    const text = String(o.text || '').trim();
    if (!text) return null;
    const e = {
      id: uid('e'),
      at: o.at || Date.now(),
      text,
      anchor: String(o.anchor || '').trim(),
      tags: Array.isArray(o.tags) ? o.tags.slice(0, 12) : [],
      feeling: o.feeling || null,
      place: String(o.place || '').trim(),
      people: Array.isArray(o.people) ? o.people : [],
      bottleId: o.bottleId || null
    };
    db.entries.push(e);
    save();
    return e;
  }

  function updateEntry(id, patch) {
    const e = entry(id); if (!e) return null;
    if (patch.text !== undefined) e.text = String(patch.text).trim();
    if (patch.anchor !== undefined) e.anchor = String(patch.anchor).trim();
    if (patch.tags !== undefined) e.tags = patch.tags.slice(0, 12);
    if (patch.feeling !== undefined) e.feeling = patch.feeling;
    if (patch.place !== undefined) e.place = String(patch.place).trim();
    if (patch.people !== undefined) e.people = patch.people;
    if (patch.bottleId !== undefined) e.bottleId = patch.bottleId;
    save();
    return e;
  }

  function removeEntry(id) { db.entries = db.entries.filter(e => e.id !== id); save(); }

  function searchEntries(q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return entries();
    return entries().filter(e => {
      if ((e.text + ' ' + e.anchor + ' ' + e.place + ' ' + (e.people || []).join(' ')).toLowerCase().includes(s)) return true;
      if (e.feeling && e.feeling.toLowerCase().includes(s)) return true;
      return (e.tags || []).some(t => {
        const n = Lexicon.get(t);
        return n && n.t.toLowerCase().includes(s);
      });
    });
  }

  /* ---------- the resurfacing engine ----------
     Two ways an old entry comes back. An anniversary is the same day of the year,
     at least ten months ago. A season match is the same part of the year, give or
     take five days, in an earlier year. There is no third way, and no network:
     the weather hook the app was designed around would need a live forecast, so
     it is not here and the listing does not claim it. */
  function resurfaced(now) {
    if (!db.settings.resurfaceOn) return null;
    const t = now || Date.now();
    const doy = dayOfYear(t);
    const cands = [];
    for (const e of db.entries) {
      const age = daysBetween(e.at, t);
      if (age < 300) continue;
      const d1 = new Date(e.at), d2 = new Date(t);
      const years = d2.getFullYear() - d1.getFullYear();
      if (d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()) {
        cands.push({ entry: e, kind: 'anniversary', years, gap: 0 });
        continue;
      }
      let gap = Math.abs(dayOfYear(e.at) - doy);
      if (gap > 182) gap = 365 - gap;
      if (gap <= 5) cands.push({ entry: e, kind: 'season', years, gap });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'anniversary' ? -1 : 1;
      if (a.gap !== b.gap) return a.gap - b.gap;
      return b.years - a.years;
    });
    const pick = cands[0];
    pick.line = pick.kind === 'anniversary'
      ? (pick.years === 1 ? 'One year ago today' : pick.years + ' years ago today')
      : 'This time in ' + seasonLabel(seasonOf(pick.entry.at)) + ', ' + (pick.years === 1 ? 'last year' : pick.years + ' years ago');
    return pick;
  }

  /** Days in the next 30 that carry an anniversary, for the notification plan. */
  function upcomingResurfaces(fromT, days) {
    const out = [];
    const from = startOfDay(fromT || Date.now());
    for (let i = 1; i <= (days || 30); i++) {
      const t = from + i * DAY;
      const r = resurfaced(t);
      if (r && r.kind === 'anniversary') out.push({ at: t, entry: r.entry, years: r.years });
    }
    return out;
  }

  /* ---------- vocabulary ----------
     A term counts when it appears as a tag, or as a whole word in an entry, an
     anchor or a written take. Nothing is stored: the count is recomputed from the
     text every time, so deleting an entry takes its words with it. */
  function vocabUses() {
    const uses = {};
    const bump = (id, at) => {
      if (!id || !Lexicon.get(id)) return;
      const u = uses[id] || (uses[id] = { id, count: 0, firstAt: at, lastAt: at });
      u.count++;
      if (at < u.firstAt) u.firstAt = at;
      if (at > u.lastAt) u.lastAt = at;
    };
    for (const e of db.entries) {
      for (const t of (e.tags || [])) bump(t, e.at);
      for (const t of Lexicon.termsIn(e.text + ' ' + e.anchor)) bump(t, e.at);
    }
    for (const b of db.bottles) {
      const tk = b.take || {};
      const txt = [tk.opening, tk.heart, tk.drydown, b.story].filter(Boolean).join(' ');
      const at = b.acquiredAt || b.addedAt || Date.now();
      for (const t of Lexicon.termsIn(txt)) bump(t, at);
      for (const t of (b.notes || [])) bump(t, at);
    }
    for (const s of db.sessions) {
      for (const t of Lexicon.termsIn(s.note || '')) bump(t, s.at);
    }
    return uses;
  }

  function vocab() {
    const uses = vocabUses();
    const list = Object.values(uses).sort((a, b) => b.count - a.count || a.firstAt - b.firstAt);
    const byFamily = {};
    for (const u of list) {
      const n = Lexicon.get(u.id);
      byFamily[n.f] = (byFamily[n.f] || 0) + 1;
    }
    return { list, total: list.length, byFamily };
  }

  /** Cumulative distinct terms, one point per week, for the growth chart.
      The window starts at the week of the first word rather than a fixed sixteen weeks
      back, because a chart of fourteen flat zeroes and one vertical jump is a chart of
      nothing. Under three weeks of history there is no curve to draw, so it returns none. */
  function vocabGrowth(weeks) {
    const uses = Object.values(vocabUses());
    if (!uses.length) return [];
    const now = startOfDay(Date.now());
    const first = Math.min(...uses.map(u => u.firstAt));
    const span = Math.ceil((now - startOfDay(first)) / (7 * DAY)) + 1;
    if (span < 3) return [];
    const w = Math.min(weeks || 16, Math.max(3, span));
    const out = [];
    for (let i = w - 1; i >= 0; i--) {
      const cut = now - i * 7 * DAY + DAY;
      out.push({ at: cut, n: uses.filter(u => u.firstAt < cut).length });
    }
    return out;
  }

  /* ---------- drills ---------- */
  function sessions() { return db.sessions.slice().sort((a, b) => b.at - a.at); }

  function addSession(o) {
    const s = {
      id: uid('s'),
      at: o.at || Date.now(),
      track: o.track,
      sessionId: o.sessionId,
      kind: o.kind,
      results: o.results || [],
      correct: o.correct || 0,
      total: o.total || 0,
      durationS: o.durationS || 0,
      note: String(o.note || '').trim()
    };
    db.sessions.push(s);
    save();
    return s;
  }

  const doneIds = () => new Set(db.sessions.map(s => s.sessionId));

  function nextSession(trackId) {
    const track = Content.TRACK_BY_ID[trackId];
    if (!track) return null;
    const done = doneIds();
    return track.sessions.find(s => !done.has(s.id)) || null;
  }

  function trackProgress(trackId) {
    const track = Content.TRACK_BY_ID[trackId];
    if (!track) return { done: 0, total: 0 };
    const done = doneIds();
    return { done: track.sessions.filter(s => done.has(s.id)).length, total: track.sessions.length };
  }

  /** Accuracy per scored session, oldest first, for the curve. */
  function accuracySeries() {
    return db.sessions
      .filter(s => s.total > 0)
      .sort((a, b) => a.at - b.at)
      .map(s => ({ at: s.at, pct: Math.round(100 * s.correct / s.total), n: s.total, track: s.track }));
  }

  /** Per-material record, so a miss can point at a lexicon card. */
  function materialRecord() {
    const rec = {};
    for (const s of db.sessions) {
      for (const r of (s.results || [])) {
        const m = rec[r.mat] || (rec[r.mat] = { mat: r.mat, seen: 0, got: 0 });
        m.seen++;
        if (r.ok) m.got++;
      }
    }
    return rec;
  }

  function shelfAccuracy() {
    const rec = materialRecord();
    const out = [];
    for (const sh of Content.SHELVES) {
      let seen = 0, got = 0;
      for (const m of Content.shelfMats(sh.id)) {
        const r = rec[m.id]; if (!r) continue;
        seen += r.seen; got += r.got;
      }
      out.push({ shelf: sh.id, name: sh.name, seen, got, pct: seen ? Math.round(100 * got / seen) : null });
    }
    return out;
  }

  /** Longest delay you have carried a smell across in a recall drill. */
  function memorySpan() {
    let best = 0;
    for (const s of db.sessions) {
      if (s.kind !== 'recall' || !s.total || s.correct < s.total) continue;
      const secs = s.durationS || 0;
      if (secs > best) best = secs;
    }
    return best;
  }

  function weakMaterials(n) {
    const rec = materialRecord();
    return Object.values(rec)
      .filter(r => r.seen >= 1 && r.got < r.seen)
      .sort((a, b) => (a.got / a.seen) - (b.got / b.seen) || b.seen - a.seen)
      .slice(0, n || 5);
  }

  /* ---------- the shelf ---------- */
  function bottles() {
    return db.bottles.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
  function bottle(id) { return db.bottles.find(b => b.id === id) || null; }

  /** A price is never negative and never NaN; an empty field means the user did not say. */
  function cleanPrice(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    if (!isFinite(n)) return null;
    return Math.max(0, n);
  }

  /** One of the five kinds the shelf knows how to name. An import is a hand editable text
      file, and a status nothing recognises used to leave the shelf with no label to print. */
  function cleanStatus(v) {
    return ['bottle', 'decant', 'sample', 'empty', 'rehomed'].indexOf(v) < 0 ? 'bottle' : v;
  }

  /** 1 to 1000 ml, or nothing said. */
  function cleanSize(v) {
    const n = Number(v);
    return n > 0 ? Math.max(1, Math.min(1000, Math.round(n))) : null;
  }
  /** A wear happened, so it cannot be in the future; a bottle was acquired, so nor can that. */
  function pastOnly(v) {
    const n = Number(v);
    return isFinite(n) && n > 0 ? Math.min(n, Date.now()) : Date.now();
  }
  /* A function declaration, not a const arrow: repair() runs while this module is still
     being evaluated, so an arrow assigned further down is in its temporal dead zone and
     the whole store throws on any device that has ever logged a wear. */
  function cleanSprays(v) { const n = Number(v); return n > 0 ? Math.min(99, Math.round(n)) : null; }

  function addBottle(o) {
    const name = String(o.name || '').trim();
    if (!name) return null;
    const b = {
      id: uid('b'),
      name,
      house: String(o.house || '').trim(),
      sizeMl: cleanSize(o.sizeMl),
      status: cleanStatus(o.status),
      acquiredAt: pastOnly(o.acquiredAt),
      addedAt: Date.now(),
      price: cleanPrice(o.price),
      notes: Array.isArray(o.notes) ? o.notes : [],
      take: o.take || { opening: '', heart: '', drydown: '' },
      sillage: o.sillage || null,
      seasons: Array.isArray(o.seasons) ? o.seasons : [],
      story: String(o.story || '').trim()
    };
    db.bottles.push(b);
    save();
    return b;
  }

  function updateBottle(id, patch) {
    const b = bottle(id); if (!b) return null;
    Object.assign(b, patch);
    b.price = cleanPrice(b.price);
    b.sizeMl = cleanSize(b.sizeMl);
    b.acquiredAt = pastOnly(b.acquiredAt);
    b.status = cleanStatus(b.status);
    save();
    return b;
  }

  function removeBottle(id) {
    db.bottles = db.bottles.filter(b => b.id !== id);
    db.wears = db.wears.filter(w => w.bottleId !== id);
    for (const e of db.entries) if (e.bottleId === id) e.bottleId = null;
    save();
  }

  /* A wear is a record of something that already happened. A date picker will happily
     hand back the year 2099, and one of those poisons every statistic on the page:
     days-since goes negative, the month strip lights up January, and "unworn" inverts. */
  function logWear(bottleId, o) {
    if (!bottle(bottleId)) return null;
    const w = {
      id: uid('w'),
      bottleId,
      at: pastOnly(o && o.at),
      contexts: (o && o.contexts) || [],
      sprays: cleanSprays(o && o.sprays)
    };
    db.wears.push(w);
    save();
    return w;
  }

  function removeWear(id) { db.wears = db.wears.filter(w => w.id !== id); save(); }
  function wearsFor(id) { return db.wears.filter(w => w.bottleId === id).sort((a, b) => b.at - a.at); }
  function wornToday(id) {
    const t = startOfDay(Date.now());
    return db.wears.some(w => w.bottleId === id && startOfDay(w.at) === t);
  }

  /** Everything the shelf screen and a bottle page need, computed from the wear log. */
  function bottleStats(id) {
    const b = bottle(id);
    const ws = wearsFor(id);
    const total = db.wears.length;
    const months = new Array(12).fill(0);
    const seasons = { spring: 0, summer: 0, autumn: 0, winter: 0 };
    for (const w of ws) {
      months[new Date(w.at).getMonth()]++;
      seasons[seasonOf(w.at)]++;
    }
    const last = ws.length ? ws[0].at : null;
    const owned = b ? Math.max(1, daysBetween(b.acquiredAt, Date.now())) : 1;
    return {
      wears: ws.length,
      last,
      daysSince: last === null ? null : daysBetween(last, Date.now()),
      reachRate: total ? ws.length / total : 0,
      perMonth: ws.length / Math.max(1, owned / 30),
      costPerWear: (b && b.price && ws.length) ? b.price / ws.length : null,
      months,
      seasons,
      topSeason: Object.keys(seasons).sort((a, b2) => seasons[b2] - seasons[a])[0],
      contexts: ws.reduce((acc, w) => { for (const c of (w.contexts || [])) acc[c] = (acc[c] || 0) + 1; return acc; }, {})
    };
  }

  function shelfSummary() {
    const bs = db.bottles.filter(b => b.status !== 'rehomed');
    const spend = bs.reduce((n, b) => n + (b.price || 0), 0);
    const wears = db.wears.length;
    const neglected = bs
      .filter(b => b.status !== 'empty')
      .map(b => ({ b, s: bottleStats(b.id) }))
      .filter(x => x.s.daysSince === null ? daysBetween(x.b.acquiredAt, Date.now()) > 120 : x.s.daysSince > 120)
      .sort((a, b) => (b.s.daysSince || 9999) - (a.s.daysSince || 9999));
    const ranked = bs.map(b => ({ b, s: bottleStats(b.id) })).sort((a, b) => b.s.wears - a.s.wears);
    return {
      count: bs.length,
      decants: bs.filter(b => b.status === 'decant' || b.status === 'sample').length,
      wears,
      spend,
      costPerWear: wears ? spend / wears : null,
      neglected,
      mostWorn: ranked[0] || null,
      ranked
    };
  }

  /** The month a wear happened, across the whole shelf, for the seasonality strip. */
  function shelfSeasonality() {
    const months = new Array(12).fill(0);
    for (const w of db.wears) months[new Date(w.at).getMonth()]++;
    return months;
  }

  /* ---------- the north star ---------- */
  function weekCount(now) {
    const t = (now || Date.now()) - 7 * DAY;
    return db.entries.filter(e => e.at >= t).length
         + db.wears.filter(w => w.at >= t).length
         + db.sessions.filter(s => s.at >= t).length;
  }

  function counts() {
    return {
      entries: db.entries.length,
      bottles: db.bottles.length,
      wears: db.wears.length,
      sessions: db.sessions.length,
      terms: vocab().total
    };
  }

  /* ---------- settings ---------- */
  function settings(patch) {
    if (patch) { Object.assign(db.settings, patch); save(); }
    return db.settings;
  }
  function onboarded(v) {
    if (v !== undefined) {
      db.onboarded = !!v;
      if (!db.installed) db.installed = Date.now();
      save();
    }
    return db.onboarded;
  }

  /* ---------- export, import, erase ---------- */
  function exportJson() {
    return JSON.stringify({
      app: 'sillage', version: 1, exportedAt: new Date().toISOString(),
      entries: db.entries, bottles: db.bottles, wears: db.wears,
      sessions: db.sessions, settings: db.settings
    }, null, 2);
  }

  function csvCell(v) {
    const s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    const rows = [['date', 'what', 'anchor', 'notes', 'feeling', 'place', 'people', 'wearing']];
    for (const e of entries()) {
      rows.push([
        ymd(e.at), e.text, e.anchor,
        (e.tags || []).map(t => (Lexicon.get(t) || {}).t || t).join('; '),
        e.feeling || '', e.place || '', (e.people || []).join('; '),
        e.bottleId ? ((bottle(e.bottleId) || {}).name || '') : ''
      ]);
    }
    return rows.map(r => r.map(csvCell).join(',')).join('\n');
  }

  function exportShelfCsv() {
    const rows = [['name', 'house', 'size ml', 'status', 'acquired', 'price', 'wears', 'last worn', 'cost per wear', 'sillage', 'seasons']];
    for (const b of bottles()) {
      const s = bottleStats(b.id);
      rows.push([
        b.name, b.house, b.sizeMl || '', b.status, ymd(b.acquiredAt),
        b.price === null ? '' : b.price, s.wears, s.last ? ymd(s.last) : '',
        s.costPerWear === null ? '' : s.costPerWear.toFixed(2),
        b.sillage || '', (b.seasons || []).join('; ')
      ]);
    }
    return rows.map(r => r.map(csvCell).join(',')).join('\n');
  }

  function importJson(text) {
    let j;
    try { j = JSON.parse(text); } catch (e) { return { ok: false, message: 'That file is not readable JSON.' }; }
    if (!j || j.app !== 'sillage' || !Array.isArray(j.entries)) {
      return { ok: false, message: 'That file is not a Sillage export.' };
    }
    const wasEmpty = db.entries.length === 0 && db.bottles.length === 0;
    let added = 0;
    /* Bottles first: an entry and a wear both point at one by id, and the ids are
       reissued on the way in. Restoring a backup used to drop every "wearing" link
       on the floor because the entries were rebuilt before this map existed. */
    const map = {};
    /* Matching on house and name keeps a second import of the same file from doubling the
       shelf. Matching on it as a set threw away the second of two bottles that genuinely
       share a name, which a shelf with two unhoused decants really does have, so the match
       is counted: the nth "Rose" in the file pairs with the nth "Rose" already here, and
       any beyond that are new. */
    const bkey = b => ((b.house || '') + '|' + (b.name || '')).toLowerCase();
    const have = {};
    for (const b of db.bottles) (have[bkey(b)] || (have[bkey(b)] = [])).push(b.id);
    const taken = {};
    for (const b of (j.bottles || [])) {
      const k = bkey(b);
      const i = (taken[k] = (taken[k] || 0) + 1) - 1;
      const ex = (have[k] || [])[i];
      if (ex) { map[b.id] = ex; continue; }
      const nb = addBottle(b);
      if (nb) { map[b.id] = nb.id; (have[k] || (have[k] = []))[i] = nb.id; added++; }
    }
    const seenE = new Set(db.entries.map(e => e.at + '|' + e.text));
    for (const e of j.entries) {
      const k = e.at + '|' + e.text;
      if (seenE.has(k)) continue;
      db.entries.push({
        id: uid('e'), at: e.at, text: e.text || '', anchor: e.anchor || '',
        tags: e.tags || [], feeling: e.feeling || null, place: e.place || '',
        people: e.people || [], bottleId: map[e.bottleId] || null
      });
      seenE.add(k); added++;
    }
    const seenW = new Set(db.wears.map(w => w.bottleId + '|' + w.at));
    for (const w of (j.wears || [])) {
      const bid = map[w.bottleId]; if (!bid) continue;
      const k = bid + '|' + w.at; if (seenW.has(k)) continue;
      db.wears.push({ id: uid('w'), bottleId: bid, at: w.at, contexts: w.contexts || [], sprays: w.sprays || null });
      seenW.add(k); added++;
    }
    const seenS = new Set(db.sessions.map(s => s.sessionId + '|' + s.at));
    for (const s of (j.sessions || [])) {
      const k = s.sessionId + '|' + s.at; if (seenS.has(k)) continue;
      db.sessions.push({
        id: uid('s'), at: s.at, track: s.track, sessionId: s.sessionId, kind: s.kind,
        results: s.results || [], correct: s.correct || 0, total: s.total || 0,
        durationS: s.durationS || 0, note: s.note || ''
      });
      seenS.add(k); added++;
    }
    if (wasEmpty && j.settings) Object.assign(db.settings, j.settings);
    save();
    return { ok: true, message: added
      ? added + (added === 1 ? ' record added.' : ' records added.')
      : 'Nothing new in that file. All of it was already here.' };
  }

  function erase() {
    db = structuredClone(DEFAULTS);
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  return {
    MONTHS, DAY,
    entries, entry, addEntry, updateEntry, removeEntry, searchEntries,
    resurfaced, upcomingResurfaces,
    vocab, vocabGrowth,
    sessions, addSession, nextSession, trackProgress, accuracySeries,
    materialRecord, shelfAccuracy, memorySpan, weakMaterials,
    bottles, bottle, addBottle, updateBottle, removeBottle,
    logWear, removeWear, wearsFor, wornToday, bottleStats, shelfSummary, shelfSeasonality,
    weekCount, counts, settings, onboarded,
    exportJson, exportCsv, exportShelfCsv, importJson, erase,
    ago, longDate, shortDate, ymd, daysBetween, startOfDay, seasonOf, seasonLabel, dayOfYear
  };
})();
