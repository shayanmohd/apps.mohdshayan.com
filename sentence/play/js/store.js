/* Sentence. All state is one localStorage record. Nothing leaves the device. */
const Store = (() => {
  const KEY = 'sentence.v1';
  const DEFAULTS = {
    entries: {},                 // 'YYYY-MM-DD' -> { t, savedAt, late }
    settings: { notifyTime: '08:00', discreet: true, typoWindow: 10, theme: 'letterpress' },
    onboarded: false,
    installed: null,             // ISO date of first run, for the early resurfacing ramp
    draft: null                  // a line in progress, { date, text }, so a killed app cannot eat it
  };

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const d = JSON.parse(raw);
      return {
        entries: d.entries || {},
        settings: Object.assign({}, DEFAULTS.settings, d.settings || {}),
        onboarded: !!d.onboarded,
        installed: d.installed || null,
        draft: d.draft && d.draft.text ? { date: String(d.draft.date), text: String(d.draft.text) } : null
      };
    } catch (e) { return structuredClone(DEFAULTS); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  /* --- dates --- */
  const CLOSE_HOUR = 3;                       // the honest midnight
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const addYears = (s, n) => { const d = parse(s); d.setFullYear(d.getFullYear() + n); return ymd(d); };

  function journalDate(now = new Date()) {
    const d = new Date(now);
    if (d.getHours() < CLOSE_HOUR) d.setDate(d.getDate() - 1);
    return ymd(d);
  }

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const longDate = s => { const d = parse(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const shortDate = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0,3)} ${d.getFullYear()}`; };
  const monthLabel = s => { const d = parse(s); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

  /* --- entries --- */
  const get = date => db.entries[date] || null;
  const dates = () => Object.keys(db.entries).sort();

  function windowMs() { return (db.settings.typoWindow || 0) * 60000; }

  /** Can this date still be written or corrected right now? */
  function editable(date, now = Date.now()) {
    const today = journalDate(new Date(now));
    const e = get(date);
    if (date === today) {
      if (!e) return true;
      if (db.settings.typoWindow >= 1440) return true;          // open until the day closes
      return now - e.savedAt < windowMs();
    }
    // yesterday can be filled in once, never corrected
    if (date === addDays(today, -1) && !e) return true;
    return false;
  }

  function put(date, text, now = Date.now()) {
    const t = String(text).replace(/\s+/g, ' ').trim().slice(0, 280);   // one line, no line breaks
    if (!t) return false;
    if (!editable(date, now)) return false;
    const late = date !== journalDate(new Date(now));
    const prev = get(date);
    db.entries[date] = { t, savedAt: prev ? prev.savedAt : now, late: prev ? prev.late : late };
    if (!db.installed) db.installed = date;
    save();
    return true;
  }

  function remaining(date, now = Date.now()) {
    const e = get(date);
    if (!e || db.settings.typoWindow >= 1440 || db.settings.typoWindow === 0) return 0;
    return Math.min(windowMs(), Math.max(0, e.savedAt + windowMs() - now));
  }

  /* --- chapters: unbroken runs, no streak flames --- */
  function chapters() {
    const ds = dates();
    const out = [];
    for (const d of ds) {
      const last = out[out.length - 1];
      if (last && addDays(last.end, 1) === d) { last.end = d; last.length++; }
      else out.push({ start: d, end: d, length: 1 });
    }
    return out;
  }
  function currentChapter(today = journalDate()) {
    const chs = chapters();
    const last = chs[chs.length - 1];
    if (!last) return { number: 1, length: 0, fresh: true };
    const live = last.end === today || last.end === addDays(today, -1);
    if (!live) return { number: chs.length + 1, length: 0, fresh: true };
    return { number: chs.length, length: last.length, fresh: false };
  }

  /* --- resurfacing: the whole reward loop --- */
  function ageDays(today = journalDate()) {
    if (!db.installed) return 0;
    return Math.round((parse(today) - parse(db.installed)) / 86400000);
  }

  /** Entries worth showing on `date`, newest memory first. */
  function resurfaced(date = journalDate()) {
    const out = [];
    const age = ageDays(date);
    const push = (d, label) => { const e = get(d); if (e) out.push({ date: d, label, text: e.t, late: e.late }); };
    for (let y = 1; y <= 20; y++) {
      const d = addYears(date, -y);
      if (parse(d) < parse(db.installed || date)) break;
      push(d, y === 1 ? 'One year ago today' : `${y} years ago today`);
    }
    if (out.length === 0 && age >= 28) push(addDays(date, -28), 'Four weeks ago');
    if (out.length === 0 && age >= 8) push(addDays(date, -7), 'One week ago');
    return out;
  }

  /** Same calendar day across every year the book covers, newest first. */
  function yearStack(date) {
    const d = parse(date);
    const years = [];
    const first = dates()[0];
    const startYear = first ? parse(first).getFullYear() : d.getFullYear();
    for (let y = d.getFullYear(); y >= startYear; y--) {
      const key = `${y}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      years.push({ year: y, date: key, entry: get(key) });
    }
    return years;
  }

  /* --- settings --- */
  function settings(patch) {
    if (patch) { Object.assign(db.settings, patch); save(); }
    return db.settings;
  }
  function onboarded(v) { if (v !== undefined) { db.onboarded = !!v; if (!db.installed) db.installed = journalDate(); save(); } return db.onboarded; }

  /** The line being typed right now, if any. Kept in the record so leaving the app cannot lose it. */
  function draft(v) {
    if (v !== undefined) { db.draft = v && v.text ? { date: v.date, text: v.text } : null; save(); }
    return db.draft;
  }

  /* --- import / export --- */
  function exportText() {
    return dates().map(d => `${longDate(d)}\n${db.entries[d].t.replace(/\s+/g, ' ')}\n`).join('\n');
  }
  function exportCsv() {
    const esc = s => `"${String(s).replace(/"/g, '""')}"`;
    return 'date,sentence,written_late\n' +
      dates().map(d => [d, esc(db.entries[d].t.replace(/\s+/g, ' ')), db.entries[d].late ? 'yes' : 'no'].join(',')).join('\n') + '\n';
  }
  function exportJson() { return JSON.stringify({ app: 'sentence', version: 1, entries: db.entries }, null, 2); }

  /** Accepts our own JSON, our CSV, our text export (a long date line, then the sentence),
      or one "YYYY-MM-DD text" per line. */
  const LONG_DATE = new RegExp(`^(?:${DAYS.join('|')}) (\\d{1,2}) (${MONTHS.join('|')}) (\\d{4})$`);
  function importText(raw) {
    let added = 0;
    const take = (date, text) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const t = String(text).replace(/\s+/g, ' ').trim().replace(/^"|"$/g, '').replace(/""/g, '"').slice(0, 280);
      if (!t || db.entries[date]) return;
      db.entries[date] = { t, savedAt: parse(date).getTime(), late: false };
      added++;
    };
    try {
      const j = JSON.parse(raw);
      const src = j.entries || j;
      for (const k of Object.keys(src)) take(k, typeof src[k] === 'string' ? src[k] : (src[k] && src[k].t) || '');
    } catch (e) {
      const lines = String(raw).split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const m = line.match(/^(\d{4}-\d{2}-\d{2})[,\t ]+(.*)$/);
        if (m) { take(m[1], m[2].replace(/,(yes|no)\s*$/i, '')); continue; }
        const l = line.match(LONG_DATE);
        if (l) {
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length) { take(`${l[3]}-${pad(MONTHS.indexOf(l[2]) + 1)}-${pad(Number(l[1]))}`, lines[j]); i = j; }
        }
      }
    }
    if (added) {
      const ds = dates();
      if (ds.length) db.installed = ds[0];
      save();
    }
    return added;
  }

  function erase() { db = structuredClone(DEFAULTS); localStorage.removeItem(KEY); }

  return { get, put, dates, editable, remaining, chapters, currentChapter, resurfaced, yearStack,
           settings, onboarded, draft, exportText, exportCsv, exportJson, importText, erase, ageDays,
           journalDate, ymd, parse, addDays, addYears, longDate, shortDate, monthLabel, MONTHS, DAYS };
})();
