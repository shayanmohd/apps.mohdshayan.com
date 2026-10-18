/* Contact Sheet. Every setting, roll and frame record lives in one localStorage
   record. The frame images themselves are too big for localStorage, so they live
   in IndexedDB (db.js); this module holds the ledger that points at them. */
const Store = (() => {
  const KEY = 'contact-sheet.v1';
  const TOTAL = 36;               // a roll is 36 exposures. Not configurable, ever.
  const LAB_CLOSES = 20;          // the counter shuts at 8pm, like a real one-hour lab

  const DEFAULTS = {
    onboarded: false,
    settings: { developHour: 8, sound: 'full', haptics: true, facing: 'environment' },
    roll: null,
    rolls: [],
    seq: 0
  };

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const d = JSON.parse(raw);
      return {
        onboarded: !!d.onboarded,
        settings: Object.assign({}, DEFAULTS.settings, d.settings || {}),
        roll: d.roll || null,
        rolls: Array.isArray(d.rolls) ? d.rolls : [],
        seq: d.seq || 0
      };
    } catch (e) { return structuredClone(DEFAULTS); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  /* --- dates --- */
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const pad = n => String(n).padStart(2, '0');

  function shortDate(ms) { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0,3)}`; }
  function longDate(ms) { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
  function clockTime(ms) { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

  /** When a roll handed in at `sentAt` comes back. One batch a day; the counter shuts at 8pm. */
  function developTime(sentAt, hour) {
    const h = hour == null ? db.settings.developHour : hour;
    const d = new Date(sentAt);
    const missedToday = d.getHours() >= LAB_CLOSES;
    const t = new Date(sentAt);
    t.setHours(h, 0, 0, 0);
    if (t.getTime() <= sentAt) t.setDate(t.getDate() + 1);
    if (missedToday) t.setDate(t.getDate() + 1);
    return t.getTime();
  }

  /** "tomorrow at 8:00" / "Wednesday at 8:00" / "in 4 hours" as a human line. */
  function backLine(at, now = Date.now()) {
    const d = new Date(at), n = new Date(now);
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
                             new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
    const time = clockTime(at);
    if (days <= 0) return `today at ${time}`;
    if (days === 1) return `tomorrow at ${time}`;
    return `${DAYS[d.getDay()]} at ${time}`;
  }

  function countdown(at, now = Date.now()) {
    let s = Math.max(0, Math.round((at - now) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h >= 24) { const d = Math.floor(h / 24); return `${d}d ${h % 24}h`; }
    if (h >= 1) return `${h}h ${pad(m)}m`;
    return `${m}m`;
  }

  /* --- rolls --- */
  function newRollId() { db.seq += 1; return db.seq; }

  /** An unexposed roll just comes back out of the camera. There is nothing to develop. */
  function unload() { db.roll = null; save(); }

  function loadRoll(stockId, now = Date.now()) {
    if (db.roll && db.roll.frames.length) sendToLab(now);   // a half-shot roll still goes to the lab
    else if (db.roll) unload();
    const no = newRollId();
    db.roll = {
      id: 'r' + no, no, stock: stockId, total: TOTAL, loadedAt: now,
      state: 'loaded', push: 0, discreet: false, shared: false,
      frames: []
    };
    save();
    return db.roll;
  }

  function recordFrame(meta, now = Date.now()) {
    const r = db.roll;
    if (!r || r.frames.length >= r.total) return null;
    const n = r.frames.length + 1;
    const f = { n, at: now, flash: !!meta.flash, seed: (Math.random() * 1e9) | 0, keeper: false };
    r.frames.push(f);
    if (meta.discreet) r.discreet = true;
    save();
    return f;
  }

  function left() { return db.roll ? db.roll.total - db.roll.frames.length : 0; }

  /** Hands the loaded roll over the counter. Returns it, now at the lab. */
  function sendToLab(now = Date.now()) {
    const r = db.roll;
    if (!r) return null;
    r.state = 'lab';
    r.sentAt = now;
    r.developAt = developTime(now);
    db.rolls.unshift(r);
    db.roll = null;
    save();
    return r;
  }

  /** Lab instructions are given blind, before development, exactly like the real thing. */
  function setPush(rollId, push) {
    const r = byId(rollId);
    if (!r || r.state !== 'lab') return false;
    r.push = Math.max(-1, Math.min(1, push | 0));
    save();
    return true;
  }

  const byId = id => (db.roll && db.roll.id === id) ? db.roll : db.rolls.find(r => r.id === id) || null;
  const due = (now = Date.now()) => db.rolls.filter(r => r.state === 'lab' && r.developAt <= now);
  const atLab = () => db.rolls.filter(r => r.state === 'lab');
  const developed = () => db.rolls.filter(r => r.state === 'developed');

  function markDeveloped(rollId, now = Date.now()) {
    const r = byId(rollId);
    if (!r) return;
    r.state = 'developed';
    r.developedAt = now;
    save();
  }

  function toggleKeeper(rollId, n) {
    const r = byId(rollId); if (!r) return false;
    const f = r.frames.find(x => x.n === n); if (!f) return false;
    f.keeper = !f.keeper;
    save();
    return f.keeper;
  }
  function keepers(r) { return r.frames.filter(f => f.keeper); }

  function markShared(rollId, n) {
    const r = byId(rollId); if (!r) return;
    r.shared = n;
    save();
  }

  function forgetRoll(rollId) {
    db.rolls = db.rolls.filter(r => r.id !== rollId);
    save();
  }

  function dateSpan(r) {
    if (!r.frames.length) return longDate(r.loadedAt);
    const a = new Date(r.frames[0].at), b = new Date(r.frames[r.frames.length - 1].at);
    if (a.toDateString() === b.toDateString()) return longDate(a.getTime());
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
      return `${a.getDate()} to ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
    if (a.getFullYear() === b.getFullYear())
      return `${a.getDate()} ${MONTHS[a.getMonth()]} to ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
    return `${longDate(a.getTime())} to ${longDate(b.getTime())}`;
  }

  /* --- settings --- */
  function settings(patch) { if (patch) { Object.assign(db.settings, patch); save(); } return db.settings; }
  function onboarded(v) { if (v !== undefined) { db.onboarded = !!v; save(); } return db.onboarded; }

  function all() { return db; }
  function erase() { db = structuredClone(DEFAULTS); localStorage.removeItem(KEY); }

  /** What the shell should schedule. One notification per roll at the lab. */
  function notifications(now = Date.now()) {
    return atLab().filter(r => r.developAt > now)
      .sort((a, b) => a.developAt - b.developAt).slice(0, 16).map((r, i) => ({
      id: 100 + i,
      at: r.developAt,
      title: 'Your roll is back.',
      body: `Roll ${pad(r.no)}. ${r.frames.length} exposure${r.frames.length === 1 ? '' : 's'} on ${Stocks.get(r.stock).name}, ${dateSpan(r)}.`
    }));
  }

  return { TOTAL, LAB_CLOSES, all, save, settings, onboarded, erase,
           loadRoll, unload, recordFrame, left, sendToLab, setPush, byId, due, atLab, developed,
           markDeveloped, toggleKeeper, keepers, markShared, forgetRoll,
           developTime, backLine, countdown, dateSpan, shortDate, longDate, clockTime, pad,
           notifications,
           get roll() { return db.roll; }, get rolls() { return db.rolls; } };
})();
