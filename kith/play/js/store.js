/* Kith. One localStorage record holds everything. Nothing leaves the device.
   This file is also the warmth engine and the nudge engine: both are pure
   functions over the ledger, which is what makes the whole app auditable. */
const Store = (() => {
  const KEY = 'kith.v1';

  const RINGS = [
    { id: 'hearth',  name: 'Hearth',  rhythm: 14,  note: 'The people you would call from a hospital.' },
    { id: 'table',   name: 'Table',   rhythm: 30,  note: 'Close friends. The ones you would tell first.' },
    { id: 'village', name: 'Village', rhythm: 90,  note: 'Real friendships that need tending.' },
    { id: 'horizon', name: 'Horizon', rhythm: 365, note: 'People worth not losing touch with.' }
  ];
  const RING_ORDER = RINGS.map(r => r.id);

  const CHIPS = [
    { id: 'hard',      label: 'Hard season' },
    { id: 'celebrate', label: 'Celebrating' },
    { id: 'health',    label: 'Health' },
    { id: 'work',      label: 'Work' },
    { id: 'kids',      label: 'Kids' },
    { id: 'moving',    label: 'Moving' }
  ];

  const KINDS = [
    { id: 'call',      label: 'Call' },
    { id: 'message',   label: 'Message' },
    { id: 'in_person', label: 'In person' },
    { id: 'letter',    label: 'Letter' }
  ];

  const CHANNELS = [
    { id: 'call',      label: 'A call' },
    { id: 'message',   label: 'A message' },
    { id: 'voice',     label: 'A voice note' },
    { id: 'in_person', label: 'In person' }
  ];

  const DATE_KINDS = [
    { id: 'birthday', label: 'Birthday',    lead: 3 },
    { id: 'tender',   label: 'Tender date', lead: 3 },
    { id: 'custom',   label: 'Anniversary', lead: 1 }
  ];

  // Warm, mid-dark inks for the monogram chips. Paper-coloured letters sit on all of
  // them at 4.5:1 or better, in both themes.
  const HUES = ['#AC4A29', '#55705A', '#8A5C29', '#7C6A46', '#8A5B72', '#4F6B7A', '#7A5C4E', '#5F6B8C'];

  const DEFAULTS = {
    people: [],
    events: [],
    moments: [],
    dates: [],
    nudges: [],          // { personId, week, shownAt, action }
    settings: {
      weeklyCap: 3,
      windowDay: 0,      // 0 = Sunday
      windowTime: '10:00',
      tone: 'gentle',
      discreetNotes: false,
      discreetView: false,
      leadBirthday: 3,
      leadTender: 3
    },
    onboarded: false,
    installed: null
  };

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const d = JSON.parse(raw);
      return repair({
        people: Array.isArray(d.people) ? d.people : [],
        events: Array.isArray(d.events) ? d.events : [],
        moments: Array.isArray(d.moments) ? d.moments : [],
        dates: Array.isArray(d.dates) ? d.dates : [],
        nudges: Array.isArray(d.nudges) ? d.nudges : [],
        settings: Object.assign({}, DEFAULTS.settings, d.settings || {}),
        onboarded: !!d.onboarded,
        installed: d.installed || null
      });
    } catch (e) { return structuredClone(DEFAULTS); }
  }
  /**
   * Read anything an older build could have written and hand back something this one can
   * trust. The key and the shape are unchanged, so this is a repair rather than a migration:
   * nothing is dropped, values that could render as nonsense are brought back into range.
   * 1.0.0 accepted a typed year of 99999, which showed as "-97972 years since" on a date.
   */
  function repair(d) {
    for (const p of d.people) {
      p.easing = Math.min(3, Math.max(0, Number(p.easing) || 0));
      p.quietUntil = Number.isFinite(p.quietUntil) ? p.quietUntil : null;
      if (!RING_ORDER.includes(p.ring)) p.ring = 'table';
      if (p.rhythmDays !== null && p.rhythmDays !== undefined) {
        const r = Number(p.rhythmDays);
        p.rhythmDays = Number.isFinite(r) && r >= 1 && r <= 3650 ? Math.round(r) : null;
      }
    }
    for (const x of d.dates) {
      x.month = Math.min(12, Math.max(1, Number(x.month) || 1));
      x.day = Math.min(31, Math.max(1, Number(x.day) || 1));
      x.year = validYear(x.year);
    }
    for (const m of d.moments) if (!Array.isArray(m.chips)) m.chips = [];
    const cap = Number(d.settings.weeklyCap);
    d.settings.weeklyCap = Number.isFinite(cap) ? Math.min(7, Math.max(1, Math.round(cap))) : 3;
    return d;
  }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  /* ---------- dates and time ---------- */
  const DAY = 86400000;
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY); }

  function longDate(t) { const d = new Date(t); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
  function shortDate(t) { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; }

  /** "today", "yesterday", "6 days ago", "7 weeks ago", "over a year ago" */
  function ago(t, now = Date.now()) {
    const n = daysBetween(t, now);
    if (n <= 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 14) return `${n} days ago`;
    if (n < 60) return `${Math.round(n / 7)} weeks ago`;
    if (n < 365) return `${Math.round(n / 30)} months ago`;
    const y = n / 365;
    return y < 1.4 ? 'about a year ago' : `${Math.round(y)} years ago`;
  }

  /** A duration with no direction: "6 weeks", "a year". */
  function span(days) {
    if (days <= 0) return 'no time at all';
    if (days === 1) return 'a day';
    if (days < 14) return `${days} days`;
    if (days < 60) return `${Math.round(days / 7)} weeks`;
    if (days < 365) return `${Math.round(days / 30)} months`;
    const y = days / 365;
    return y < 1.4 ? 'a year' : `${Math.round(y)} years`;
  }

  /** "in 3 days", "tomorrow", "today" */
  function until(t, now = Date.now()) {
    const n = daysBetween(now, t);
    if (n <= 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n < 21) return `in ${n} days`;
    if (n < 60) return `in ${Math.round(n / 7)} weeks`;
    return `in ${Math.round(n / 30)} months`;
  }

  /* ---------- ids ---------- */
  let seq = Date.now() % 100000;
  const uid = p => `${p}${(seq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

  /* ---------- people ---------- */
  const people = () => db.people.slice();
  const person = id => db.people.find(p => p.id === id) || null;

  function ring(id) { return RINGS.find(r => r.id === id) || RINGS[1]; }

  function hueFor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return HUES[h % HUES.length];
  }

  function initials(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function addPerson(fields) {
    const name = String(fields.name || '').trim().slice(0, 60);
    if (!name) return null;
    const p = {
      id: uid('p'),
      name,
      ring: RING_ORDER.includes(fields.ring) ? fields.ring : 'table',
      rhythmDays: fields.rhythmDays || null,
      channel: fields.channel || 'message',
      phone: String(fields.phone || '').trim().slice(0, 32),
      note: String(fields.note || '').trim().slice(0, 200),
      // A restore has to bring a paused person back paused, and the restraint the engine
      // learnt back with it, so both are read from the fields when they are offered.
      quietUntil: Number.isFinite(fields.quietUntil) ? fields.quietUntil : null,
      easing: Math.min(3, Math.max(0, Number(fields.easing) || 0)),
      createdAt: fields.createdAt || Date.now()
    };
    db.people.push(p);
    if (!db.installed) db.installed = Date.now();
    save();
    return p;
  }

  function updatePerson(id, patch) {
    const p = person(id);
    if (!p) return null;
    if (patch.name !== undefined) p.name = String(patch.name).trim().slice(0, 60) || p.name;
    if (patch.ring !== undefined && RING_ORDER.includes(patch.ring)) p.ring = patch.ring;
    if (patch.rhythmDays !== undefined) p.rhythmDays = patch.rhythmDays || null;
    if (patch.channel !== undefined) p.channel = patch.channel;
    if (patch.phone !== undefined) p.phone = String(patch.phone).trim().slice(0, 32);
    if (patch.note !== undefined) p.note = String(patch.note).trim().slice(0, 200);
    if (patch.quietUntil !== undefined) p.quietUntil = patch.quietUntil;
    if (patch.easing !== undefined) p.easing = patch.easing;
    save();
    return p;
  }

  function removePerson(id) {
    db.people = db.people.filter(p => p.id !== id);
    db.events = db.events.filter(e => e.personId !== id);
    db.moments = db.moments.filter(m => m.personId !== id);
    db.dates = db.dates.filter(d => d.personId !== id);
    db.nudges = db.nudges.filter(n => n.personId !== id);
    save();
  }

  /* ---------- the ledger ---------- */
  function logContact(personId, kind, meaningful, at) {
    if (!person(personId)) return null;
    const e = {
      id: uid('e'), personId,
      kind: KINDS.some(k => k.id === kind) ? kind : 'message',
      at: at || Date.now(),
      meaningful: meaningful !== false
    };
    db.events.push(e);
    const p = person(personId);
    // Logistics is logged and nothing else. The app promises it does not reset the
    // rhythm, so it must not cancel a quiet season or the restraint the engine learnt.
    if (p && e.meaningful) { p.easing = 0; p.quietUntil = null; }
    save();
    return e;
  }

  const eventsFor = id => db.events.filter(e => e.personId === id).sort((a, b) => b.at - a.at);

  function lastContact(id, meaningfulOnly) {
    const list = eventsFor(id).filter(e => !meaningfulOnly || e.meaningful);
    return list[0] || null;
  }

  /** Effort, counted over a rolling month so the number means the same thing on the 1st and the 28th. */
  function reachOutsRecently(now = Date.now(), days = 30) {
    return db.events.filter(e => e.at >= now - days * DAY).length;
  }

  /* ---------- moments ---------- */
  function addMoment(personId, text, chips, at) {
    const t = String(text || '').trim().slice(0, 400);
    const c = (chips || []).filter(x => CHIPS.some(k => k.id === x));
    if (!t && !c.length) return null;
    const m = { id: uid('m'), personId, text: t, chips: c, at: at || Date.now() };
    db.moments.push(m);
    save();
    return m;
  }
  function removeMoment(id) { db.moments = db.moments.filter(m => m.id !== id); save(); }
  const momentsFor = id => db.moments.filter(m => m.personId === id).sort((a, b) => b.at - a.at);
  const lastMoment = id => momentsFor(id)[0] || null;

  /** Every moment carrying `chip` inside the window, newest first. */
  function momentsWithChip(chip, withinDays, now = Date.now()) {
    const cut = now - withinDays * DAY;
    return db.moments
      .filter(m => m.chips.includes(chip) && m.at >= cut && person(m.personId))
      .sort((a, b) => b.at - a.at);
  }

  /* ---------- dates ---------- */
  /** A year only means something inside the range a person can have lived in. */
  function validYear(y) {
    const n = Number(y);
    return Number.isFinite(n) && n >= 1900 && n <= 2100 ? Math.round(n) : null;
  }

  function addDate(personId, kind, month, day, year, label, leadDays) {
    if (!person(personId)) return null;
    const d = {
      id: uid('d'), personId,
      kind: DATE_KINDS.some(k => k.id === kind) ? kind : 'custom',
      month: Math.min(12, Math.max(1, Number(month) || 1)),
      day: Math.min(31, Math.max(1, Number(day) || 1)),
      year: validYear(year),
      label: String(label || '').trim().slice(0, 80),
      leadDays: leadDays === undefined ? null : Number(leadDays)
    };
    db.dates.push(d);
    save();
    return d;
  }
  function removeDate(id) { db.dates = db.dates.filter(d => d.id !== id); save(); }
  const datesFor = id => db.dates.filter(d => d.personId === id);

  function leadFor(d) {
    if (d.leadDays !== null && d.leadDays !== undefined) return d.leadDays;
    const s = db.settings;
    if (d.kind === 'birthday') return s.leadBirthday;
    if (d.kind === 'tender') return s.leadTender;
    return 1;
  }

  /** Next time this date comes round, as an epoch ms at local midnight. */
  function nextOccurrence(d, now = Date.now()) {
    const base = new Date(now);
    // 29 February in a common year falls on the 28th rather than sliding into March.
    const on = y => {
      const last = new Date(y, d.month, 0).getDate();
      return new Date(y, d.month - 1, Math.min(d.day, last), 0, 0, 0, 0);
    };
    for (let y = 0; y <= 1; y++) {
      const t = on(base.getFullYear() + y);
      if (startOfDay(t.getTime()) >= startOfDay(now)) return t.getTime();
    }
    return on(base.getFullYear() + 1).getTime();
  }

  /** All dates in the next `days`, soonest first, each with its person and count. */
  function upcomingDates(days = 365, now = Date.now()) {
    return db.dates
      .map(d => {
        const at = nextOccurrence(d, now);
        const p = person(d.personId);
        return p ? { date: d, person: p, at, days: daysBetween(now, at), years: d.year ? new Date(at).getFullYear() - d.year : null } : null;
      })
      .filter(x => x && x.days <= days)
      .sort((a, b) => a.at - b.at);
  }

  /* ---------- the warmth engine ---------- */
  const STATES = {
    close:    { label: 'Close',      note: 'recently in touch' },
    steady:   { label: 'In rhythm',  note: 'about where you meant to be' },
    drifting: { label: 'Drifting',   note: 'a little longer than your rhythm' },
    far:      { label: 'Far off',    note: 'a good while now' }
  };

  function rhythmOf(p) { return p.rhythmDays || ring(p.ring).rhythm; }

  /** Pure function of the ledger. No side effects, no stored score. */
  function warmth(p, now = Date.now()) {
    const last = lastContact(p.id, true);
    const since = last ? last.at : p.createdAt;
    const days = Math.max(0, daysBetween(since, now));
    const rhythm = rhythmOf(p);
    const ratio = days / rhythm;
    let state = 'close';
    if (ratio > 1.6) state = 'far';
    else if (ratio > 1.0) state = 'drifting';
    else if (ratio > 0.55) state = 'steady';
    return {
      days, rhythm, ratio, state,
      label: STATES[state].label,
      everLogged: !!last,
      quiet: !!(p.quietUntil && p.quietUntil > now)
    };
  }

  /* ---------- the nudge engine ---------- */
  /** Monday-or-whichever-day the user picked, as the epoch ms starting this week. */
  function weekStart(now = Date.now()) {
    const s = db.settings;
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    const back = (d.getDay() - s.windowDay + 7) % 7;
    d.setDate(d.getDate() - back);
    return d.getTime();
  }
  const weekKey = (now = Date.now()) => ymd(new Date(weekStart(now)));

  /** The next time the user's chosen window comes round. */
  function nextWindow(now = Date.now()) {
    const s = db.settings;
    const [h, m] = (s.windowTime || '10:00').split(':').map(Number);
    const d = new Date(now); d.setHours(h, m, 0, 0);
    const fwd = (s.windowDay - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + fwd);
    if (d.getTime() <= now) d.setDate(d.getDate() + 7);
    return d.getTime();
  }

  /** Everyone who has drifted past their rhythm, most adrift first. */
  function candidates(now = Date.now()) {
    const hard = new Set(momentsWithChip('hard', 90, now).map(m => m.personId));
    return db.people
      .map(p => {
        const w = warmth(p, now);
        // Dismissals stretch the threshold. The engine learns restraint, not escalation.
        const threshold = 1 + 0.25 * Math.min(3, p.easing || 0);
        return { person: p, warmth: w, threshold, hard: hard.has(p.id) };
      })
      .filter(c => !c.warmth.quiet && c.warmth.ratio >= c.threshold)
      .map(c => {
        const ringWeight = 1 + (3 - RING_ORDER.indexOf(c.person.ring)) * 0.12;
        return Object.assign(c, { weight: c.warmth.ratio * ringWeight * (c.hard ? 1.6 : 1) });
      })
      .sort((a, b) => b.weight - a.weight);
  }

  const usedThisWeek = (now = Date.now()) => db.nudges.filter(n => n.week === weekKey(now)).length;

  const nudgeThisWeek = (personId, now) => db.nudges.find(n => n.personId === personId && n.week === weekKey(now));

  /**
   * The Hearth's whole agenda. Stable within a week: whoever was surfaced this
   * week stays surfaced until acted on, and the cap is never exceeded.
   */
  function nudges(now = Date.now()) {
    const wk = weekKey(now);
    const cap = Math.max(1, Math.min(7, db.settings.weeklyCap));
    const open = db.nudges.filter(n => n.week === wk && !n.action);
    const out = [];
    for (const n of open) {
      const p = person(n.personId);
      if (!p) continue;
      const w = warmth(p, now);
      if (w.quiet) continue;
      out.push({ person: p, warmth: w, moment: lastMoment(p.id) });
    }
    const used = db.nudges.filter(n => n.week === wk).length;
    if (used < cap) {
      const taken = new Set(db.nudges.filter(n => n.week === wk).map(n => n.personId));
      let room = cap - used;
      for (const c of candidates(now)) {
        if (room <= 0) break;
        if (taken.has(c.person.id)) continue;
        db.nudges.push({ personId: c.person.id, week: wk, shownAt: now, action: null });
        out.push({ person: c.person, warmth: c.warmth, moment: lastMoment(c.person.id) });
        taken.add(c.person.id);
        room--;
      }
      if (db.nudges.length > 400) db.nudges = db.nudges.slice(-400);
      save();
    }
    return out.slice(0, cap);
  }

  function resolveNudge(personId, action, now = Date.now()) {
    const n = nudgeThisWeek(personId, now);
    if (n) { n.action = action; }
    const p = person(personId);
    if (p) {
      if (action === 'dismissed') p.easing = Math.min(3, (p.easing || 0) + 1);
      if (action === 'acted') p.easing = 0;
      if (action === 'snoozed') p.quietUntil = now + 7 * DAY;
    }
    save();
  }

  /* ---------- tone ---------- */
  const TONES = ['gentle', 'plain', 'minimal'];

  /** One line about the drift, in the voice the user chose. Never a debt, never a badge. */
  function driftLine(p, w, tone = db.settings.tone) {
    const first = String(p.name).trim().split(/\s+/)[0];
    if (!w.everLogged) {
      if (tone === 'minimal') return 'No contact logged yet.';
      if (tone === 'plain') return `Nothing logged with ${first} yet.`;
      return `You have not marked a catch up with ${first} yet.`;
    }
    const gap = span(w.days);
    if (tone === 'minimal') return `${w.days} days.`;
    if (tone === 'plain') return `Last talked ${ago(Date.now() - w.days * DAY)}.`;
    if (w.state === 'far') return `It has been ${gap} since you and ${first} talked.`;
    return `About ${gap} since you and ${first} caught up.`;
  }

  /**
   * A plain first line to start from. Kith never tries to fold your note into the
   * sentence: it puts the note beside the box and lets you write the real thing.
   */
  function opener(p, tone = db.settings.tone) {
    const first = String(p.name).trim().split(/\s+/)[0];
    if (tone === 'minimal') return `Hi ${first}.`;
    if (tone === 'plain') return `Hi ${first}, how are you doing?`;
    return `Hi ${first}, you have been on my mind this week. How are things?`;
  }

  /** Digits a dialler will accept, so tel: and sms: links behave. */
  function dialable(phone) { return String(phone || '').replace(/[^0-9+*#,;]/g, ''); }

  /* ---------- settings ---------- */
  function settings(patch) {
    if (patch) { Object.assign(db.settings, patch); save(); }
    return db.settings;
  }
  function onboarded(v) {
    if (v !== undefined) { db.onboarded = !!v; if (!db.installed) db.installed = Date.now(); save(); }
    return db.onboarded;
  }

  /* ---------- export, import, erase ---------- */
  function exportJson() {
    return JSON.stringify({
      app: 'kith', version: 1, exportedAt: new Date().toISOString(),
      people: db.people, events: db.events, moments: db.moments, dates: db.dates,
      // The nudge ledger travels too. Without it a restore hands the user a fresh
      // week's worth of nudges on a week they had already spent.
      nudges: db.nudges, settings: db.settings
    }, null, 2);
  }

  function exportCsv() {
    const esc = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
    const lines = ['type,person,ring,when,detail'];
    for (const p of db.people) {
      lines.push(['person', esc(p.name), p.ring, '', esc(`${rhythmOf(p)} day rhythm`)].join(','));
    }
    for (const e of db.events.slice().sort((a, b) => a.at - b.at)) {
      const p = person(e.personId); if (!p) continue;
      lines.push(['contact', esc(p.name), p.ring, ymd(new Date(e.at)),
                  esc(`${e.kind}${e.meaningful ? '' : ', logistics'}`)].join(','));
    }
    for (const m of db.moments.slice().sort((a, b) => a.at - b.at)) {
      const p = person(m.personId); if (!p) continue;
      lines.push(['moment', esc(p.name), p.ring, ymd(new Date(m.at)),
                  esc(m.text + (m.chips.length ? ` [${m.chips.join(' ')}]` : ''))].join(','));
    }
    for (const d of db.dates) {
      const p = person(d.personId); if (!p) continue;
      lines.push(['date', esc(p.name), p.ring, `${d.year || ''}-${pad(d.month)}-${pad(d.day)}`,
                  esc(`${d.kind}: ${d.label}`)].join(','));
    }
    return lines.join('\n') + '\n';
  }

  /** Accepts a file this app wrote. Merges by name, never duplicates a person. */
  function importJson(raw) {
    let j;
    try { j = JSON.parse(raw); } catch (e) { return { ok: false, message: 'That file is not a Kith export.' }; }
    if (!j || j.app !== 'kith' || !Array.isArray(j.people)) {
      return { ok: false, message: 'That file is not a Kith export.' };
    }
    const wasEmpty = db.people.length === 0;
    const map = {};
    // One person in the file lands on at most one person here. Without that, two friends
    // who share a name both matched the same row: a restore of your own backup gave back
    // one of them, carrying both timelines, and the other was gone for good.
    const claimed = new Set();
    let addedPeople = 0, addedRest = 0;
    for (const p of j.people) {
      // Identity first, since a file this app wrote carries the same ids.
      const byId = db.people.find(x => x.id === p.id && !claimed.has(x.id));
      const existing = byId || db.people.find(x =>
        !claimed.has(x.id) && x.name.toLowerCase() === String(p.name || '').toLowerCase());
      if (existing) { map[p.id] = existing.id; claimed.add(existing.id); continue; }
      const np = addPerson(p);
      if (np) { map[p.id] = np.id; claimed.add(np.id); addedPeople++; }
    }
    const seen = new Set(db.events.map(e => `${e.personId}|${e.at}`));
    for (const e of (j.events || [])) {
      const pid = map[e.personId]; if (!pid) continue;
      const k = `${pid}|${e.at}`; if (seen.has(k)) continue;
      db.events.push({ id: uid('e'), personId: pid, kind: e.kind, at: e.at, meaningful: e.meaningful !== false });
      seen.add(k); addedRest++;
    }
    const seenM = new Set(db.moments.map(m => `${m.personId}|${m.at}`));
    for (const m of (j.moments || [])) {
      const pid = map[m.personId]; if (!pid) continue;
      const k = `${pid}|${m.at}`; if (seenM.has(k)) continue;
      db.moments.push({ id: uid('m'), personId: pid, text: m.text || '', chips: m.chips || [], at: m.at });
      seenM.add(k); addedRest++;
    }
    const seenD = new Set(db.dates.map(d => `${d.personId}|${d.month}|${d.day}|${d.kind}`));
    for (const d of (j.dates || [])) {
      const pid = map[d.personId]; if (!pid) continue;
      const k = `${pid}|${d.month}|${d.day}|${d.kind}`; if (seenD.has(k)) continue;
      db.dates.push({ id: uid('d'), personId: pid, kind: d.kind, month: d.month, day: d.day,
                      year: d.year || null, label: d.label || '', leadDays: d.leadDays ?? null });
      seenD.add(k); addedRest++;
    }
    const seenN = new Set(db.nudges.map(n => `${n.personId}|${n.week}`));
    for (const n of (j.nudges || [])) {
      const pid = map[n.personId]; if (!pid) continue;
      const k = `${pid}|${n.week}`; if (seenN.has(k)) continue;
      db.nudges.push({ personId: pid, week: n.week, shownAt: n.shownAt || 0, action: n.action || null });
      seenN.add(k);
    }
    if (db.nudges.length > 400) db.nudges = db.nudges.slice(-400);
    // A restore into an empty notebook brings the settings back too; a merge leaves them alone.
    if (wasEmpty && j.settings) Object.assign(db.settings, j.settings);
    save();
    const nP = `${addedPeople} ${addedPeople === 1 ? 'person' : 'people'}`;
    const nR = `${addedRest} ${addedRest === 1 ? 'entry' : 'entries'}`;
    return { ok: true, message: (addedPeople || addedRest)
      ? `${nP} and ${nR} added.`
      : 'Nothing new in that file. Everything in it was already here.' };
  }

  function erase() { db = structuredClone(DEFAULTS); try { localStorage.removeItem(KEY); } catch (e) {} }

  function counts() {
    return { people: db.people.length, moments: db.moments.length, events: db.events.length, dates: db.dates.length };
  }

  return {
    RINGS, RING_ORDER, CHIPS, KINDS, CHANNELS, DATE_KINDS, HUES, TONES, MONTHS, DAYS, DAY,
    people, person, ring, addPerson, updatePerson, removePerson, hueFor, initials, rhythmOf,
    logContact, eventsFor, lastContact, reachOutsRecently,
    addMoment, removeMoment, momentsFor, lastMoment, momentsWithChip,
    addDate, removeDate, datesFor, upcomingDates, nextOccurrence, leadFor,
    warmth, candidates, nudges, resolveNudge, usedThisWeek, weekKey, weekStart, nextWindow, driftLine, opener, dialable,
    settings, onboarded, exportJson, exportCsv, importJson, erase, counts,
    ago, span, until, longDate, shortDate, daysBetween, startOfDay, ymd
  };
})();
