/* Patchwork. One localStorage record: the people, the board, the bookings and the book.
   Balances are never stored, only derived from the ledger, so the book is the single truth.
   The two invariants this file exists to hold:
     1. a ledger line is written only when both people say the hour happened, and
     2. nobody is carried past the floor, checked when the line is written, not only when
        the booking is arranged. */
const Store = (() => {
  const KEY = 'patchwork.v1';
  const START = 2;        // the node fronts everyone two hours
  const FLOOR = -3;       // and carries them to minus three
  const MAX_H = 12;       // one exchange is at most a working day

  const CATEGORIES = [
    { id: 'repair', name: 'Repair and fix' },
    { id: 'teach', name: 'Teach and explain' },
    { id: 'grow', name: 'Garden and grow' },
    { id: 'care', name: 'Care and company' },
    { id: 'make', name: 'Make and mend' },
    { id: 'move', name: 'Lift and move' },
    { id: 'admin', name: 'Forms and admin' },
    { id: 'other', name: 'Something else' }
  ];
  const CAT_IDS = CATEGORIES.map(c => c.id);

  const blank = () => ({
    v: 1, onboarded: false, node: '', me: null,
    people: [],      // { id, name, note, offers:[{id,cat,text}], asks:[{id,cat,text}] }
    bookings: [],    // { id, giverId, receiverId, what, hours, on, state, gaveOk, gotOk }
    entries: []      // { id, at, giverId, receiverId, hours, what, source }
  });

  /* ---------- shapes ---------- */
  const str = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
  const quarter = h => Math.round(Number(h) * 4) / 4;
  const isId = v => typeof v === 'string' && v.length > 0 && v.length <= 64;
  /** An amount of hours the book can hold: a finite quarter-hour between 0.25 and 12. */
  function goodHours(h) {
    const n = Number(h);
    if (!isFinite(n)) return null;
    const q = quarter(n);
    if (!(q >= 0.25) || q > MAX_H) return null;
    return q;
  }
  const goodEntry = e => e && typeof e === 'object' && isId(e.id) && isId(e.giverId) && isId(e.receiverId)
    && e.giverId !== e.receiverId && goodHours(e.hours) !== null;
  const goodPerson = p => p && typeof p === 'object' && isId(p.id) && typeof p.name === 'string' && p.name.trim() !== '';
  const goodBooking = b => b && typeof b === 'object' && isId(b.id) && isId(b.giverId) && isId(b.receiverId)
    && b.giverId !== b.receiverId && goodHours(b.hours) !== null;

  /** A person read back from a file, trimmed to the fields this app knows about. */
  function cleanPerson(p) {
    const list = (arr) => (Array.isArray(arr) ? arr : []).filter(l => l && isId(l.id) && typeof l.text === 'string')
      .map(l => ({ id: l.id, cat: CAT_IDS.indexOf(l.cat) >= 0 ? l.cat : 'other', text: str(l.text, 120) }))
      .filter(l => l.text);
    return { id: p.id, name: str(p.name, 60), note: str(p.note, 200), offers: list(p.offers), asks: list(p.asks) };
  }
  const cleanEntry = e => ({ id: e.id, at: isFinite(Number(e.at)) ? Number(e.at) : Date.now(),
    giverId: e.giverId, receiverId: e.receiverId, hours: goodHours(e.hours),
    what: str(e.what, 140), source: e.source === 'booking' ? 'booking' : 'direct' });
  const cleanBooking = b => ({ id: b.id, giverId: b.giverId, receiverId: b.receiverId,
    what: str(b.what, 140), hours: goodHours(b.hours),
    on: typeof b.on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.on) ? b.on : null,
    state: b.state === 'done' ? 'done' : 'arranged', gaveOk: !!b.gaveOk, gotOk: !!b.gotOk });

  let repaired = 0;       // ledger lines dropped by the last load, reported once
  let dropped = false;    // anything at all dropped, which means the stored record is now wrong
  let db = load();
  /* Repair the stored book, not just the copy in memory. Without this the unreadable line stays
     on disk and the app re-diagnoses it, with the same message, at every single launch. */
  if (dropped) save();

  /* A book written by 1.0.0 loads unchanged: the shape has not moved. What load() does do is
     refuse to keep a ledger line that carries no usable number of hours, because one of those
     turns every balance in the app into NaN and there is no way back from inside the app.
     1.0.0 could accept such a line from a malformed merge; this build cannot write one. */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return blank();
      const d = Object.assign(blank(), parsed);
      const people = (Array.isArray(d.people) ? d.people : []);
      d.people = people.filter(goodPerson).map(cleanPerson);
      const entries = (Array.isArray(d.entries) ? d.entries : []);
      d.entries = entries.filter(goodEntry).map(cleanEntry);
      repaired = entries.length - d.entries.length;
      const bookings = (Array.isArray(d.bookings) ? d.bookings : []);
      d.bookings = bookings.filter(goodBooking).map(cleanBooking);
      dropped = repaired > 0 || d.people.length !== people.length || d.bookings.length !== bookings.length;
      d.node = str(d.node, 40);
      d.onboarded = !!d.onboarded;
      d.me = isId(d.me) ? d.me : null;
      d.v = 1;
      return d;
    } catch (e) { return blank(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  const uid = (p) => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const person = id => db.people.find(p => p.id === id) || null;
  const nameOf = id => (person(id) || {}).name || 'someone who left';
  const exists = id => !!person(id);
  /** Where this person sits in the roster, or -1 if they have left it. The quilt reads this. */
  const rosterIndex = id => db.people.findIndex(p => p.id === id);

  /* ---------- people ---------- */
  function addPerson(name, note) {
    const p = { id: uid('p'), name: str(name, 60), note: str(note, 200), offers: [], asks: [] };
    if (!p.name) return null;
    db.people.push(p); save(); return p;
  }
  function updatePerson(id, patch) { const p = person(id); if (p) { Object.assign(p, patch); save(); } return p; }
  /** How many other people already answer to this name. */
  const namesake = (name, exceptId) => db.people
    .filter(p => p.id !== exceptId && p.name.toLowerCase() === str(name, 60).toLowerCase()).length;

  function removePerson(id) {
    // the book is not rewritten: past hours stay, the person simply leaves the roster
    db.people = db.people.filter(p => p.id !== id);
    db.bookings = db.bookings.filter(b => (b.giverId !== id && b.receiverId !== id) || b.state === 'done');
    save();
  }
  function addListing(personId, kind, cat, text) {
    const p = person(personId); if (!p) return null;
    const item = { id: uid('l'), cat: CAT_IDS.indexOf(cat) >= 0 ? cat : 'other', text: str(text, 120) };
    if (!item.text) return null;
    (kind === 'ask' ? p.asks : p.offers).push(item); save(); return item;
  }
  function removeListing(personId, kind, listingId) {
    const p = person(personId); if (!p) return;
    const key = kind === 'ask' ? 'asks' : 'offers';
    p[key] = p[key].filter(l => l.id !== listingId); save();
  }

  /* ---------- the book ---------- */
  function balance(id) {
    let h = START;
    for (const e of db.entries) {
      if (e.giverId === id) h += e.hours;
      if (e.receiverId === id) h -= e.hours;
    }
    return quarter(h);
  }
  const balances = () => db.people.map(p => ({ id: p.id, name: p.name, hours: balance(p.id) }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

  /** Can this person receive `hours` without falling through the floor? */
  function canReceive(id, hours) {
    const h = Number(hours);
    if (!isFinite(h)) return false;
    return quarter(balance(id) - h) >= FLOOR;
  }
  /** How many hours this person can still receive before they reach the floor. */
  const headroom = id => quarter(balance(id) - FLOOR);

  function post(giverId, receiverId, hours, what, source) {
    if (!isId(giverId) || !isId(receiverId) || giverId === receiverId) return null;
    if (!exists(giverId) || !exists(receiverId)) return null;
    const h = goodHours(hours);
    if (h === null) return null;
    const e = { id: uid('e'), at: Date.now(), giverId, receiverId, hours: h,
                what: str(what, 140), source: source === 'booking' ? 'booking' : 'direct' };
    db.entries.push(e); save(); return e;
  }

  /* ---------- bookings ---------- */
  function addBooking(giverId, receiverId, what, hours, on) {
    if (!isId(giverId) || !isId(receiverId) || giverId === receiverId) return null;
    if (!exists(giverId) || !exists(receiverId)) return null;
    const h = goodHours(hours);
    if (h === null) return null;
    const b = { id: uid('b'), giverId, receiverId, what: str(what, 140), hours: h,
                on: typeof on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : null,
                state: 'arranged', gaveOk: false, gotOk: false };
    db.bookings.push(b); save(); return b;
  }

  /** Either side confirms; the ledger line is written only when both have, and only if the
      receiver can still take the hours. Two bookings that each fitted when they were arranged
      can no longer both fit by the time they are confirmed, and the book must not pretend
      otherwise: it returns { blocked: true } and the booking stays arranged. */
  function confirm(bookingId, side) {
    const b = db.bookings.find(x => x.id === bookingId);
    if (!b) return null;
    if (b.state === 'done') return { booking: b, done: true, blocked: false };
    if (side === 'giver') b.gaveOk = true; else b.gotOk = true;
    if (b.gaveOk && b.gotOk) {
      if (!canReceive(b.receiverId, b.hours)) {
        save();
        return { booking: b, done: false, blocked: true, headroom: headroom(b.receiverId) };
      }
      const e = post(b.giverId, b.receiverId, b.hours, b.what, 'booking');
      if (!e) { save(); return { booking: b, done: false, blocked: true, headroom: headroom(b.receiverId) }; }
      b.state = 'done';
      save();
      return { booking: b, done: true, blocked: false };
    }
    save();
    return { booking: b, done: false, blocked: false };
  }
  function cancelBooking(id) { db.bookings = db.bookings.filter(b => b.id !== id); save(); }
  const openBookings = () => db.bookings.filter(b => b.state !== 'done')
    .sort((a, b) => (a.on || '9999-99-99').localeCompare(b.on || '9999-99-99'));
  const pastBookings = () => db.bookings.filter(b => b.state === 'done').slice().reverse();

  /* ---------- the board ---------- */
  function board(kind, q) {
    const needle = String(q || '').trim().toLowerCase();
    const out = [];
    for (const p of db.people) {
      for (const l of (kind === 'asks' ? p.asks : p.offers)) {
        if (needle && !(l.text + ' ' + p.name).toLowerCase().includes(needle)) continue;
        out.push({ person: p, listing: l, hours: balance(p.id) });
      }
    }
    return out;
  }

  /* ---------- settings and io ---------- */
  function settings(patch) { if (patch) { Object.assign(db, patch); save(); } return db; }
  function onboarded(v) { if (v !== undefined) { db.onboarded = !!v; save(); } return db.onboarded; }

  function exportJson() { return JSON.stringify({ app: 'patchwork', version: 1, node: db.node,
    people: db.people, bookings: db.bookings, entries: db.entries }, null, 2); }

  function exportCsv() {
    const esc = s => `"${String(s).replace(/"/g, '""')}"`;
    const rows = db.entries.map(e => [new Date(e.at).toISOString().slice(0, 10),
      esc(nameOf(e.giverId)), esc(nameOf(e.receiverId)), e.hours, esc(e.what)].join(','));
    return 'date,gave,received,hours,what\n' + (rows.length ? rows.join('\n') + '\n' : '');
  }

  /** Merges another keeper's book. Rows are matched by id, so a merge is safe to repeat, and
      every row is checked before it is let in: a file that is not a book, or a book with a
      line that carries no readable number of hours, must never reach the ledger. */
  function importJson(raw) {
    let d;
    try { d = JSON.parse(raw); } catch (e) { return { ok: false, why: 'That file is not a book.' }; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, why: 'That file is not a book.' };
    if (d.app !== 'patchwork') return { ok: false, why: 'That file was not written by Patchwork.' };
    const arr = v => (Array.isArray(v) ? v : []);
    let people = 0, entries = 0, bookings = 0, skipped = 0;
    for (const p of arr(d.people)) {
      if (!goodPerson(p)) { skipped++; continue; }
      if (!db.people.some(x => x.id === p.id)) { db.people.push(cleanPerson(p)); people++; }
    }
    for (const e of arr(d.entries)) {
      if (!goodEntry(e)) { skipped++; continue; }
      if (!db.entries.some(x => x.id === e.id)) { db.entries.push(cleanEntry(e)); entries++; }
    }
    for (const b of arr(d.bookings)) {
      if (!goodBooking(b)) { skipped++; continue; }
      if (!db.bookings.some(x => x.id === b.id)) { db.bookings.push(cleanBooking(b)); bookings++; }
    }
    db.entries.sort((a, b) => a.at - b.at);
    save();
    return { ok: true, people, entries, bookings, skipped };
  }

  function erase() { db = blank(); try { localStorage.removeItem(KEY); } catch (e) {} }

  return { CATEGORIES, START, FLOOR, MAX_H, people: () => db.people, person, nameOf, exists, namesake, rosterIndex,
           addPerson, updatePerson, removePerson, addListing, removeListing,
           balance, balances, canReceive, headroom, post, entries: () => db.entries,
           addBooking, confirm, cancelBooking, openBookings, pastBookings,
           board, settings, onboarded, exportJson, exportCsv, importJson, erase,
           repairedOnLoad: () => repaired, goodHours };
})();
