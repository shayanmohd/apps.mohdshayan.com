/* Wildergarden. One localStorage record, one module, nothing leaves the device.
   The record holds only what the user actually did: logged days, stillness
   sessions and settings. Everything about the valley is recomputed from that
   by sim.js, which is what makes the ledger self-healing and export honest. */
const Store = (() => {
  const KEY = 'wildergarden.v1';

  const DEFAULTS = {
    onboarded: false,
    installed: null,            // 'YYYY-MM-DD' of first run
    settings: {
      limit: 60,                // minutes of feed time allowed per day
      remind: true,
      remindTime: '21:30',
      workStart: '09:00',
      workEnd: '17:00',
      haptics: true,
      hemisphere: 'north',
      seed: 0                   // fixed at first run; shapes this valley's terrain
    },
    feeds: [],                  // labels the user typed, used only in their own prose
    days: {},                   // 'YYYY-MM-DD' -> { blight: <minutes> }
    sessions: [],               // { s: startMs, e: endMs } completed stillness
    live: null,                 // { s: startMs } a session running right now
    ack: [],                    // species ids whose arrival card has been shown
    lastOpen: 0                 // epoch ms, so the valley can show how long it grew unwatched
  };

  function load() {
    const out = read();
    if (!out.settings.seed) out.settings.seed = newSeed();   // every valley has terrain
    return out;
  }
  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      const d = JSON.parse(raw);
      const out = fresh();
      out.onboarded = !!d.onboarded;
      out.installed = isDate(d.installed) ? d.installed : null;
      settle(out.settings, d.settings);
      out.feeds = cleanFeeds(d.feeds);
      out.days = cleanDays(d.days);
      out.sessions = cleanSessions(d.sessions);
      out.live = d.live && isStamp(d.live.s) ? { s: d.live.s } : null;
      out.ack = Array.isArray(d.ack) ? d.ack.filter(x => typeof x === 'string') : [];
      out.lastOpen = Number(d.lastOpen) || 0;
      return out;
    } catch (e) {
      return fresh();
    }
  }
  function fresh() { return JSON.parse(JSON.stringify(DEFAULTS)); }

  /* ---------- shape guards ----------
     Everything that enters the record from a file or an older build goes through
     these. A backup someone edited by hand should be refused a field at a time,
     never allowed to leave the valley in a state the simulation cannot read. */
  const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && ymd(parse(v)) === v;
  const STAMP_MIN = Date.UTC(2015, 0, 1);          // before the first Android this build runs on
  const STAMP_MAX = Date.UTC(2100, 0, 1);
  const isStamp = v => typeof v === 'number' && isFinite(v) && v >= STAMP_MIN && v < STAMP_MAX;
  const num = (v, lo, hi, dflt) => {
    const n = Number(v);
    return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };
  const time = (v, dflt) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) ? v : dflt;

  /** Copies only the settings that are the right shape, over the defaults already in `into`. */
  function settle(into, from) {
    if (!from || typeof from !== 'object') { into.seed = into.seed || newSeed(); return into; }
    into.limit = Math.round(num(from.limit, 5, 600, into.limit));
    into.remind = from.remind === undefined ? into.remind : !!from.remind;
    into.remindTime = time(from.remindTime, into.remindTime);
    into.workStart = time(from.workStart, into.workStart);
    into.workEnd = time(from.workEnd, into.workEnd);
    into.haptics = from.haptics === undefined ? into.haptics : !!from.haptics;
    into.hemisphere = from.hemisphere === 'south' ? 'south' : 'north';
    const s = Math.round(num(from.seed, 1, 1e9, 0));
    into.seed = s || into.seed || newSeed();
    return into;
  }
  function cleanFeeds(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(f => typeof f === 'string' && f.trim()).map(f => f.trim().slice(0, 24)).slice(0, 12);
  }
  function cleanDays(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const k of Object.keys(obj)) {
      if (!isDate(k)) continue;
      const m = Number(obj[k] && obj[k].blight);
      if (!isFinite(m)) continue;
      out[k] = { blight: Math.max(0, Math.min(1440, Math.round(m))) };
    }
    return out;
  }
  function cleanSessions(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const s of list) {
      if (!s || !isStamp(s.s) || !isStamp(s.e) || s.e <= s.s) continue;
      out.push({ s: s.s, e: Math.min(s.e, s.s + 20 * 3600000) });
    }
    out.sort((a, b) => a.s - b.s);
    return out.slice(-4000);
  }
  function newSeed() { return Math.floor(Math.random() * 1e9) + 1; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  /* ---------- the valley day ---------- */
  /* A day turns over at 4am, so a long evening belongs to the evening it felt like. */
  const ROLL_HOUR = 4;
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

  function dayOf(ms) {
    const d = new Date(ms);
    if (d.getHours() < ROLL_HOUR) d.setDate(d.getDate() - 1);
    return ymd(d);
  }
  function today(now = Date.now()) { return dayOf(now); }

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const longDate = s => { const d = parse(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  const shortDate = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; };
  const weekdayShort = s => DAYS[parse(s).getDay()].slice(0, 3);

  /* Monday-start week key, used for Grace. */
  function weekOf(date) {
    const d = parse(date);
    const back = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - back);
    return ymd(d);
  }

  /* The record is read only once the date helpers above exist, because the
     shape guards use them to tell a real date from a plausible looking one. */
  let db = load();

  /* ---------- reading ---------- */
  /* Everything that writes a setting goes through settle(), the same guard an imported
     file passes. A cleared time field or a slider that reports a string can no longer
     leave a value in the record that the next load has to throw away. */
  const settings = patch => {
    if (patch) { settle(db.settings, Object.assign({}, db.settings, patch)); save(); }
    return db.settings;
  };
  const feeds = list => { if (list) { db.feeds = list.slice(0, 12); save(); } return db.feeds; };
  const installed = () => db.installed;
  const live = () => db.live;
  const sessions = () => db.sessions;
  const days = () => db.days;
  const dayEntry = d => db.days[d] || null;

  /** Every day the ledger touches, oldest first, always ending on today.
      A session started at 2am belongs to the previous valley day, which can
      predate the recorded install date, so the earliest day anything touches
      wins. It is floored at MAX_SPAN days back: a phone whose clock was wrong
      for one session must not be able to drag the whole valley into 1970. */
  const MAX_SPAN = 1200;
  function span(now = Date.now()) {
    const t = today(now);
    const floor = addDays(t, -(MAX_SPAN - 1));
    let start = db.installed || t;
    const back = d => { if (d < start && d >= floor) start = d; };
    for (const k in db.days) back(k);
    for (const s of db.sessions) back(dayOf(s.s));
    if (db.live) back(dayOf(db.live.s));
    if (start < floor) start = floor;
    if (start > t) start = t;
    const out = [];
    for (let d = start; diffDays(d, t) >= 0; d = addDays(d, 1)) out.push(d);
    return out;
  }

  /** Past days with no tally yet, oldest first. Today is never "missed". */
  function unlogged(now = Date.now()) {
    const t = today(now);
    return span(now).filter(d => d !== t && !db.days[d]);
  }

  /* ---------- writing ---------- */
  function begin(now = Date.now()) {
    if (!db.onboarded) return false;
    if (db.live) return false;
    db.live = { s: now };
    save();
    return true;
  }

  /** Ends the running session. Returns the completed record, or null. */
  function end(now = Date.now()) {
    if (!db.live) return null;
    const s = db.live.s;
    const e = Math.max(now, s + 1000);
    db.live = null;
    const rec = { s, e: Math.min(e, s + 20 * 3600000) };   // nothing longer than a day counts
    if (rec.e - rec.s >= 60000) { db.sessions.push(rec); trim(); save(); return rec; }
    save();
    return null;
  }
  function discard() { db.live = null; save(); }
  function trim() { if (db.sessions.length > 4000) db.sessions = db.sessions.slice(-4000); }

  /** Records the day's feed minutes. Re-logging a day overwrites it. */
  function logDay(date, minutes) {
    const m = Math.max(0, Math.min(1440, Math.round(Number(minutes) || 0)));
    db.days[date] = { blight: m };
    if (!db.installed) db.installed = date;
    save();
    return m;
  }
  function unlog(date) { delete db.days[date]; save(); }

  function onboard(patch) {
    db.onboarded = true;
    if (!db.installed) db.installed = today();
    if (!db.settings.seed) db.settings.seed = newSeed();
    if (patch) Object.assign(db.settings, patch);
    save();
  }
  const onboarded = () => db.onboarded;

  function ack(id) { if (!db.ack.includes(id)) { db.ack.push(id); save(); } }
  const acked = id => db.ack.includes(id);

  /** Milliseconds since the app was last opened, then stamps now. */
  function touch(now = Date.now()) {
    const away = db.lastOpen ? now - db.lastOpen : 0;
    db.lastOpen = now; save();
    return away;
  }

  /* ---------- export, import, erase ---------- */
  function exportJson() {
    return JSON.stringify({
      app: 'wildergarden', version: 1, exported: new Date().toISOString(),
      installed: db.installed, settings: db.settings, feeds: db.feeds,
      days: db.days, sessions: db.sessions
    }, null, 2);
  }

  function exportCsv() {
    const rows = ['date,feed_minutes,stillness_sessions,stillness_minutes'];
    const byDay = {};
    for (const s of db.sessions) {
      const d = dayOf(s.s);
      byDay[d] = byDay[d] || { n: 0, m: 0 };
      byDay[d].n++; byDay[d].m += Math.round((s.e - s.s) / 60000);
    }
    for (const d of span()) {
      const e = db.days[d];
      const b = byDay[d] || { n: 0, m: 0 };
      rows.push([d, e ? e.blight : '', b.n, b.m].join(','));
    }
    return rows.join('\n') + '\n';
  }

  /** Accepts our own export. Merges days and sessions, never deletes.
      Every field goes through the same shape guards the stored record uses, so
      a truncated or hand-edited backup loses the bad field and nothing else. */
  function importJson(raw) {
    let n = 0;
    try {
      const j = JSON.parse(raw);
      if (!j || typeof j !== 'object') return -1;
      const incoming = cleanDays(j.days);
      for (const k of Object.keys(incoming)) {
        if (db.days[k]) continue;
        db.days[k] = incoming[k];
        n++;
      }
      const have = new Set(db.sessions.map(s => s.s));
      for (const s of cleanSessions(j.sessions)) {
        if (have.has(s.s)) continue;
        have.add(s.s);
        db.sessions.push(s);
      }
      db.sessions.sort((a, b) => a.s - b.s);
      if (isDate(j.installed) && (!db.installed || j.installed < db.installed)) db.installed = j.installed;
      if (Array.isArray(j.feeds)) db.feeds = cleanFeeds(j.feeds);
      // the seed comes back too, so a restored valley is the same valley
      settle(db.settings, j.settings);
      if (Object.keys(db.days).length || db.sessions.length) db.onboarded = true;
      trim(); save();
    } catch (e) { return -1; }
    return n;
  }

  function erase() { localStorage.removeItem(KEY); db = fresh(); db.settings.seed = newSeed(); }

  /* Screenshot and demo seeding go through here so nothing bypasses the schema. */
  function replace(next) { db = Object.assign(fresh(), next); if (!db.settings.seed) db.settings.seed = newSeed(); save(); }
  function raw() { return db; }

  return {
    KEY, ROLL_HOUR,
    settings, feeds, installed, live, sessions, days, dayEntry, span, unlogged,
    begin, end, discard, logDay, unlog, onboard, onboarded, ack, acked, touch,
    exportJson, exportCsv, importJson, erase, replace, raw,
    today, dayOf, ymd, parse, addDays, diffDays, weekOf,
    longDate, shortDate, weekdayShort, MONTHS, DAYS
  };
})();
