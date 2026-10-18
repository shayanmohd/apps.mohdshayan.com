/* Doorway. Every fact about a place comes from a survey somebody filled in.
   This file is the ontology (the fact keys and what their values mean), the persistence,
   and the composition engine that turns several partial surveys into one answer with
   its provenance and its age attached. */
const Store = (() => {
  const KEY = 'doorway.v1';
  const DAY = 86400000;

  /* ── the ontology ──
     One table drives the survey flow, the place page and the lens rules. A key is added here
     and it appears in all three. `tol` is how close two numbers have to be to count as agreeing. */
  const GROUPS = [
    { g: 'entrance', title: 'The way in',      lead: 'The part that decides whether the rest matters.' },
    { g: 'bathroom', title: 'The toilet',      lead: 'The second ambush. Worth the twenty seconds.' },
    { g: 'inside',   title: 'Inside',          lead: 'Room to move, somewhere to sit.' },
    { g: 'sensory',  title: 'Sound and light', lead: 'What you found at the time you were there.' },
    { g: 'staff',    title: 'Staff',           lead: 'One question, four honest answers.' }
  ];

  const FACTS = [
    { k: 'entrance.steps', g: 'entrance', label: 'Steps at the door',
      q: 'How many steps at the door?', type: 'choice', opts: [
        { v: 0, label: 'None, level in' }, { v: 1, label: 'One step' },
        { v: 2, label: 'Two steps' }, { v: 3, label: 'Three or more' }] },
    { k: 'entrance.step_height_cm', g: 'entrance', label: 'Tallest step',
      q: 'How tall is the tallest step?', type: 'number', unit: 'cm', min: 1, max: 45, tol: 2,
      chips: [5, 10, 15, 20], hint: 'A house brick on its side is about 7 cm. Guess if you have to.',
      showIf: f => Number(f['entrance.steps']) > 0 },
    { k: 'entrance.ramp', g: 'entrance', label: 'Ramp',
      q: 'Is there a ramp or a lift?', type: 'choice', opts: [
        { v: 'none', label: 'No ramp' }, { v: 'fixed', label: 'Permanent ramp' },
        { v: 'portable', label: 'Portable ramp, ask staff' }, { v: 'lift', label: 'Platform lift' }],
      showIf: f => Number(f['entrance.steps']) > 0 },
    { k: 'entrance.door_width_cm', g: 'entrance', label: 'Door opening',
      q: 'How wide is the opening?', type: 'number', unit: 'cm', min: 50, max: 140, tol: 3,
      chips: [70, 75, 80, 90], hint: 'A bank card is 8.6 cm long. Nine of them end to end is about 77 cm.' },
    { k: 'entrance.door_type', g: 'entrance', label: 'Door',
      q: 'What is the door like?', type: 'choice', opts: [
        { v: 'open', label: 'Held open or none' }, { v: 'auto', label: 'Automatic' },
        { v: 'light', label: 'Light to push' }, { v: 'heavy', label: 'Heavy' },
        { v: 'revolving', label: 'Revolving' }] },
    { k: 'entrance.threshold', g: 'entrance', label: 'Threshold',
      q: 'What is underfoot in the doorway?', type: 'choice', opts: [
        { v: 'flush', label: 'Flush' }, { v: 'lip', label: 'Small lip under 2 cm' },
        { v: 'high', label: 'Raised over 2 cm' }] },
    { k: 'entrance.route', g: 'entrance', label: 'Approach',
      q: 'Getting to the door from the street?', type: 'choice', opts: [
        { v: 'level', label: 'Level' }, { v: 'slope', label: 'Gentle slope' },
        { v: 'steep', label: 'Steep slope' }, { v: 'stairs', label: 'Stairs on the way' }] },

    { k: 'bathroom.exists', g: 'bathroom', label: 'Toilet',
      q: 'Is there a toilet for customers?', type: 'choice', opts: [
        { v: 'yes', label: 'Yes' }, { v: 'no', label: 'None' }, { v: 'shared', label: 'Shared with the building' }] },
    { k: 'bathroom.step_free', g: 'bathroom', label: 'Step free from the room',
      q: 'Can you get to it without steps?', type: 'choice', opts: [
        { v: 'yes', label: 'Yes, step free' }, { v: 'no', label: 'No, steps on the way' }],
      showIf: f => f['bathroom.exists'] && f['bathroom.exists'] !== 'no' },
    { k: 'bathroom.accessible', g: 'bathroom', label: 'Built for wheelchair use',
      q: 'Is a cubicle built for wheelchair use?', type: 'choice', opts: [
        { v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }],
      showIf: f => f['bathroom.exists'] && f['bathroom.exists'] !== 'no' },
    { k: 'bathroom.grab_bars', g: 'bathroom', label: 'Grab bars',
      q: 'Grab bars beside the toilet?', type: 'choice', opts: [
        { v: 'both', label: 'Both sides' }, { v: 'one', label: 'One side' }, { v: 'none', label: 'None' }],
      showIf: f => f['bathroom.exists'] && f['bathroom.exists'] !== 'no' },
    { k: 'bathroom.turning_space', g: 'bathroom', label: 'Turning space',
      q: 'Room to turn inside?', type: 'choice', opts: [
        { v: 'roomy', label: 'Roomy, could turn a chair' }, { v: 'tight', label: 'Tight' },
        { v: 'no', label: 'No room to turn' }],
      showIf: f => f['bathroom.exists'] && f['bathroom.exists'] !== 'no' },
    { k: 'bathroom.door_width_cm', g: 'bathroom', label: 'Toilet door',
      q: 'How wide is the toilet door?', type: 'number', unit: 'cm', min: 50, max: 130, tol: 3,
      chips: [65, 70, 75, 85],
      showIf: f => f['bathroom.exists'] && f['bathroom.exists'] !== 'no' },

    { k: 'inside.circulation', g: 'inside', label: 'Room to move',
      q: 'How much room between things?', type: 'choice', opts: [
        { v: 'generous', label: 'Generous' }, { v: 'okay', label: 'Workable' }, { v: 'tight', label: 'Tight' }] },
    { k: 'inside.floor', g: 'inside', label: 'Floor',
      q: 'Is the floor all one level?', type: 'choice', opts: [
        { v: 'level', label: 'All one level' }, { v: 'split', label: 'A raised area' },
        { v: 'steps', label: 'Steps between areas' }] },
    { k: 'inside.seating', g: 'inside', label: 'Seating',
      q: 'What is the seating like?', type: 'choice', opts: [
        { v: 'movable', label: 'Chairs that move' }, { v: 'mixed', label: 'Some fixed, some loose' },
        { v: 'fixed', label: 'Fixed benches only' }] },
    { k: 'inside.table_height', g: 'inside', label: 'Tables',
      q: 'Table heights?', type: 'choice', opts: [
        { v: 'varied', label: 'A range of heights' }, { v: 'high', label: 'High tables only' },
        { v: 'low', label: 'Low tables only' }] },
    { k: 'inside.wait_seat', g: 'inside', label: 'Somewhere to wait',
      q: 'Somewhere to sit while you wait?', type: 'choice', opts: [
        { v: 'yes', label: 'Yes, a seat' }, { v: 'no', label: 'Standing only' }] },

    { k: 'sensory.noise', g: 'sensory', label: 'Noise',
      q: 'How loud was it?', type: 'choice', slotted: true, opts: [
        { v: 'quiet', label: 'Quiet, easy to talk' }, { v: 'moderate', label: 'Moderate' },
        { v: 'loud', label: 'Loud, raised voices' }, { v: 'very', label: 'Very loud' }],
      hint: 'Your judgement, not a measurement. Doorway does not use the microphone.' },
    { k: 'sensory.music', g: 'sensory', label: 'Music',
      q: 'Music?', type: 'choice', slotted: true, opts: [
        { v: 'none', label: 'None' }, { v: 'background', label: 'Background' }, { v: 'loud', label: 'Loud' }] },
    { k: 'sensory.lighting', g: 'sensory', label: 'Lighting',
      q: 'How is it lit?', type: 'choice', opts: [
        { v: 'soft', label: 'Soft and even' }, { v: 'bright', label: 'Bright and even' },
        { v: 'harsh', label: 'Harsh or flickering' }, { v: 'dim', label: 'Dim' }] },
    { k: 'sensory.crowding', g: 'sensory', label: 'How busy',
      q: 'How busy was it?', type: 'choice', slotted: true, opts: [
        { v: 'calm', label: 'Calm' }, { v: 'busy', label: 'Busy' }, { v: 'packed', label: 'Packed' }] },
    { k: 'sensory.retreat', g: 'sensory', label: 'Quieter corner',
      q: 'Is there a quieter corner?', type: 'choice', opts: [
        { v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }] },
    { k: 'vision.print', g: 'sensory', label: 'Menus and signs',
      q: 'Menus and signs?', type: 'choice', opts: [
        { v: 'large', label: 'Large, high contrast' }, { v: 'standard', label: 'Standard print' },
        { v: 'small', label: 'Small or low contrast' }] },
    { k: 'vision.markings', g: 'sensory', label: 'Step edges marked',
      q: 'Are step edges marked?', type: 'choice', opts: [
        { v: 'yes', label: 'Marked' }, { v: 'no', label: 'Not marked' }, { v: 'na', label: 'No steps to mark' }] },
    { k: 'hearing.loop', g: 'sensory', label: 'Hearing loop',
      q: 'A hearing loop at the counter?', type: 'choice', opts: [
        { v: 'yes', label: 'Yes, signed' }, { v: 'no', label: 'None seen' }] },

    { k: 'staff.response', g: 'staff', label: 'Asking staff',
      q: 'How did staff respond to an access question?', type: 'choice', opts: [
        { v: 'knew', label: 'Knew the answer' }, { v: 'helped', label: 'Found out and helped' },
        { v: 'willing', label: 'Willing but unsure' }, { v: 'poor', label: 'Unhelpful' },
        { v: 'not-asked', label: 'Did not ask' }] },
    { k: 'staff.assistance', g: 'staff', label: 'Help at the door',
      q: 'Can staff see the door to help?', type: 'choice', opts: [
        { v: 'yes', label: 'Yes, counter faces it' }, { v: 'bell', label: 'There is a bell' },
        { v: 'no', label: 'No, and no bell' }] }
  ];

  const FACT = Object.fromEntries(FACTS.map(f => [f.k, f]));

  const KINDS = ['Cafe', 'Restaurant', 'Bar', 'Shop', 'Grocery', 'Pharmacy', 'Clinic', 'Library',
    'Museum', 'Cinema', 'Theatre', 'Gym', 'Park', 'Toilet', 'Station', 'Bank', 'Salon', 'Other'];

  const SLOTS = [
    { v: 'morning', label: 'Morning' }, { v: 'midday', label: 'Midday' },
    { v: 'afternoon', label: 'Afternoon' }, { v: 'evening', label: 'Evening' }];

  const PHOTO_ROLES = [
    { v: 'entrance', label: 'The way in' }, { v: 'bathroom', label: 'The toilet' },
    { v: 'inside', label: 'Inside' }];

  /* ── state ── */
  const DEFAULTS = () => ({
    v: 1,
    places: [],
    surveys: [],
    confirms: [],
    lists: [],
    lens: { modules: [], everyone: false },
    settings: { haptics: true, textScale: 1, onboarded: false, sort: 'distance', name: '', sample: false }
  });

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULTS();
      const d = JSON.parse(raw);
      const base = DEFAULTS();
      const out = {
        v: 1,
        places: Array.isArray(d.places) ? d.places : [],
        surveys: Array.isArray(d.surveys) ? d.surveys : [],
        confirms: Array.isArray(d.confirms) ? d.confirms : [],
        lists: Array.isArray(d.lists) ? d.lists : [],
        lens: Object.assign(base.lens, d.lens || {}),
        settings: Object.assign(base.settings, d.settings || {})
      };
      /* 1.0.0 let a list be renamed to nothing and a place keep a name of spaces, so a phone
         that has been running it can hold records this build would never write. Give them a
         name on the way in rather than drawing a card with no title on it. */
      for (const l of out.lists) {
        if (!String(l && l.title !== undefined && l.title !== null ? l.title : '').trim()) l.title = 'Untitled list';
        if (!Array.isArray(l.placeIds)) l.placeIds = [];
      }
      for (const p of out.places) {
        if (!String(p && p.name !== undefined && p.name !== null ? p.name : '').trim()) p.name = 'Unnamed place';
      }
      return out;
    } catch (e) { return DEFAULTS(); }
  }

  let saveTimer = null;
  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try { localStorage.setItem(KEY, JSON.stringify(db)); }
      catch (e) { window.dispatchEvent(new CustomEvent('storage-full')); }
    }, 0);
  }
  function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { window.dispatchEvent(new CustomEvent('storage-full')); return false; }
  }

  const uid = p => (p || 'x') + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  /* ── places ── */
  function places() { return db.places; }
  function place(id) { return db.places.find(p => p.id === id) || null; }

  /* Names and notes are capped and trimmed here rather than at the screen, so a place that
     arrives from an import, a pack or a future screen cannot be longer than a card can hold. */
  const text = (v, n) => String(v === undefined || v === null ? '' : v).trim().slice(0, n);

  function addPlace(p) {
    const rec = {
      id: uid('p'), name: text(p.name, 80) || 'Unnamed place', kind: p.kind || 'Other',
      area: text(p.area, 80), note: text(p.note, 400),
      lat: typeof p.lat === 'number' ? p.lat : null,
      lng: typeof p.lng === 'number' ? p.lng : null,
      at: Date.now()
    };
    db.places.push(rec); save();
    return rec;
  }

  function updatePlace(id, patch) {
    const p = place(id); if (!p) return null;
    const clean = Object.assign({}, patch);
    if ('name' in clean) clean.name = text(clean.name, 80) || p.name;
    if ('area' in clean) clean.area = text(clean.area, 80);
    if ('note' in clean) clean.note = text(clean.note, 400);
    Object.assign(p, clean); save(); return p;
  }

  function removePlace(id) {
    db.places = db.places.filter(p => p.id !== id);
    db.surveys = db.surveys.filter(s => s.placeId !== id);
    db.confirms = db.confirms.filter(c => c.placeId !== id);
    db.lists.forEach(l => { l.placeIds = l.placeIds.filter(x => x !== id); });
    save();
  }

  /* ── surveys ── */
  function surveys(placeId) {
    return db.surveys.filter(s => s.placeId === placeId).sort((a, b) => b.at - a.at);
  }

  function addSurvey(s) {
    const rec = {
      id: s.id || uid('s'), placeId: s.placeId, at: s.at || Date.now(),
      by: s.by || 'you', slot: s.slot || slotNow(), seconds: s.seconds || null,
      facts: Object.assign({}, s.facts), photos: (s.photos || []).slice()
    };
    db.surveys.push(rec); save();
    return rec;
  }

  function removeSurvey(id) {
    db.surveys = db.surveys.filter(s => s.id !== id); save();
  }

  /* One confirmation per place per person per day. Tapping "still accurate" twice in a minute
     is a thumb, not a second visit, and a trust count that counts thumbs is worth nothing. */
  function confirm(placeId, by) {
    const who = by || 'you';
    const today = new Date().setHours(0, 0, 0, 0);
    const already = db.confirms.find(c => c.placeId === placeId && c.by === who && c.at >= today);
    if (already) { already.at = Date.now(); save(); return null; }
    const rec = { id: uid('c'), placeId, at: Date.now(), by: who };
    db.confirms.push(rec); save();
    return rec;
  }

  function confirms(placeId) {
    return db.confirms.filter(c => c.placeId === placeId).sort((a, b) => b.at - a.at);
  }

  function slotNow(d) {
    const h = (d || new Date()).getHours();
    if (h < 11) return 'morning';
    if (h < 14) return 'midday';
    if (h < 17) return 'afternoon';
    return 'evening';
  }

  /* ── composition ──
     Newest answer wins, older answers that match it count as confirmations, and an answer
     that contradicts the newest one is kept and shown rather than quietly dropped. A "still
     accurate" tap after the newest survey re-dates every fact that survey carried. */
  function same(k, a, b) {
    const f = FACT[k];
    if (f && f.type === 'number') return Math.abs(Number(a) - Number(b)) <= (f.tol || 2);
    return String(a) === String(b);
  }

  function compose(placeId) {
    const ss = surveys(placeId);
    const cs = confirms(placeId);
    const facts = {};
    for (const f of FACTS) {
      const entries = ss.filter(s => s.facts[f.k] !== undefined && s.facts[f.k] !== null && s.facts[f.k] !== '');
      if (!entries.length) continue;
      const top = entries[0];
      const v = top.facts[f.k];
      const agree = entries.filter(s => same(f.k, s.facts[f.k], v));
      const differ = entries.filter(s => !same(f.k, s.facts[f.k], v));
      const laterConfirm = cs.find(c => c.at >= top.at);
      const seen = laterConfirm ? Math.max(top.at, laterConfirm.at) : top.at;
      facts[f.k] = {
        k: f.k, v, at: top.at, seen, by: top.by, slot: top.slot,
        n: agree.length, differs: differ.map(s => ({ v: s.facts[f.k], at: s.at, by: s.by })),
        reconfirmed: !!laterConfirm,
        slots: f.slotted ? entries.map(s => ({ slot: s.slot, v: s.facts[f.k], at: s.at })) : null
      };
    }
    const lastAt = Math.max(0, ...ss.map(s => s.at), ...cs.map(c => c.at));
    return {
      facts, surveyCount: ss.length, confirmCount: cs.length,
      lastAt: lastAt || 0, age: lastAt ? Date.now() - lastAt : null,
      photos: ss.flatMap(s => s.photos.map(p => Object.assign({ at: s.at, by: s.by }, p))),
      surveyors: Array.from(new Set(ss.map(s => s.by)))
    };
  }

  /* Freshness bands. A personal atlas is used at street level, so these are deliberately short:
     a place you checked last spring is not a place you know today. */
  function freshness(at) {
    if (!at) return { k: 'none', label: 'Never checked', short: 'never' };
    const days = (Date.now() - at) / DAY;
    if (days < 90) return { k: 'fresh', label: 'Checked ' + ago(at), short: ago(at), days };
    if (days < 365) return { k: 'aging', label: 'Checked ' + ago(at), short: ago(at), days };
    return { k: 'stale', label: 'Last checked ' + ago(at), short: ago(at), days };
  }

  function ago(at) {
    const d = Math.floor((Date.now() - at) / DAY);
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 14) return d + ' days ago';
    if (d < 60) return Math.round(d / 7) + ' weeks ago';
    if (d < 365) return Math.round(d / 30) + ' months ago';
    const y = (d / 365);
    return y < 1.6 ? 'over a year ago' : Math.round(y) + ' years ago';
  }

  function dateLabel(at) {
    return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function say(k, v) {
    const f = FACT[k];
    if (!f || v === undefined || v === null || v === '') return '';
    if (f.type === 'number') return v + ' ' + f.unit;
    const o = f.opts.find(o => String(o.v) === String(v));
    return o ? o.label : String(v);
  }

  function slotLabel(v) { const s = SLOTS.find(s => s.v === v); return s ? s.label : ''; }

  /* ── lists ── */
  function lists() { return db.lists; }
  function addList(title) {
    const rec = { id: uid('l'), title: text(title, 60) || 'New list', placeIds: [], at: Date.now() };
    db.lists.push(rec); save(); return rec;
  }
  function renameList(id, title) {
    const l = db.lists.find(l => l.id === id);
    if (l) { l.title = text(title, 60) || l.title || 'New list'; save(); }
    return l;
  }
  function removeList(id) { db.lists = db.lists.filter(l => l.id !== id); save(); }
  function inList(listId, placeId) {
    const l = db.lists.find(l => l.id === listId);
    return !!(l && l.placeIds.includes(placeId));
  }
  function toggleInList(listId, placeId) {
    const l = db.lists.find(l => l.id === listId); if (!l) return false;
    const i = l.placeIds.indexOf(placeId);
    if (i < 0) l.placeIds.push(placeId); else l.placeIds.splice(i, 1);
    save(); return i < 0;
  }
  function listsWith(placeId) { return db.lists.filter(l => l.placeIds.includes(placeId)); }

  /* ── lens and settings ── */
  function lens() { return db.lens; }
  function setLens(l) { db.lens = Object.assign(db.lens, l); save(); }
  function settings() { return db.settings; }
  function set(k, v) { db.settings[k] = v; save(); }

  function stats() {
    const mine = db.surveys.filter(s => s.by === 'you');
    const myConfirms = db.confirms.filter(c => c.by === 'you');
    const placesTouched = new Set(mine.map(s => s.placeId));
    const seconds = mine.filter(s => s.seconds).map(s => s.seconds).sort((a, b) => a - b);
    return {
      surveys: mine.length, confirms: myConfirms.length, places: placesTouched.size,
      imported: db.surveys.length - mine.length,
      median: seconds.length ? seconds[Math.floor(seconds.length / 2)] : null
    };
  }

  /* ── sharing ──
     A pack is the honest offline version of a commons: facts, notes and coordinates,
     carried by hand from one phone to another. Photos ride along only if asked for. */
  function exportPack(opts) {
    const o = opts || {};
    const ids = o.placeIds && o.placeIds.length ? o.placeIds : db.places.map(p => p.id);
    const idSet = new Set(ids);
    const who = (db.settings.name || '').trim() || 'A shared pack';
    const ps = db.places.filter(p => idSet.has(p.id));
    const ss = db.surveys.filter(s => idSet.has(s.placeId)).map(s => ({
      id: s.id, placeId: s.placeId, at: s.at, slot: s.slot, seconds: s.seconds,
      by: s.by === 'you' ? who : s.by,
      facts: s.facts,
      photos: o.photos ? s.photos : []
    }));
    return {
      format: 'doorway.pack', version: 1, at: Date.now(), by: who,
      title: o.title || '',
      places: ps, surveys: ss,
      confirms: db.confirms.filter(c => idSet.has(c.placeId))
        .map(c => ({ id: c.id, placeId: c.placeId, at: c.at, by: c.by === 'you' ? who : c.by })),
      /* One list when one list is being sent, and every list when the whole atlas is.
         "Export everything" is the only backup this app has, and the delete dialog tells you
         to take one first, so it cannot quietly leave the lists behind. */
      lists: (o.listId ? db.lists.filter(l => l.id === o.listId) : db.lists)
        .map(l => ({ id: l.id, title: l.title, placeIds: l.placeIds.filter(x => idSet.has(x)), at: l.at }))
        .filter(l => l.placeIds.length)
    };
  }

  /* Merge rules: a place or survey already here keeps its own copy, anything new is added,
     and imported work never claims to be yours. Returns a count of what changed. */
  function importPack(pack) {
    if (!pack || pack.format !== 'doorway.pack') throw new Error('That file is not a Doorway pack.');
    const who = (pack.by || 'A shared pack').toString().slice(0, 40);
    const out = { places: 0, surveys: 0, confirms: 0, lists: 0, photos: 0 };
    const have = new Set(db.places.map(p => p.id));
    const byName = new Map(db.places.map(p => [(p.name + '|' + (p.area || '')).toLowerCase(), p.id]));
    const remap = {};
    for (const p of (pack.places || [])) {
      const key = ((p.name || '') + '|' + (p.area || '')).toLowerCase();
      if (have.has(p.id)) { remap[p.id] = p.id; continue; }
      if (byName.has(key)) { remap[p.id] = byName.get(key); continue; }
      const rec = {
        id: p.id, name: String(p.name || 'Unnamed place').slice(0, 80), kind: p.kind || 'Other',
        area: String(p.area || '').slice(0, 80), note: String(p.note || '').slice(0, 400),
        lat: typeof p.lat === 'number' ? p.lat : null, lng: typeof p.lng === 'number' ? p.lng : null,
        at: p.at || Date.now()
      };
      // `byName` is deliberately not extended here: it exists to join an incoming place to one
      // you already had, and adding to it would fold two distinct places from the same pack
      // into one whenever their names matched, which is how restoring your own backup used to
      // lose a place.
      db.places.push(rec); have.add(rec.id); remap[p.id] = rec.id; out.places++;
    }
    const haveS = new Set(db.surveys.map(s => s.id));
    for (const s of (pack.surveys || [])) {
      const pid = remap[s.placeId]; if (!pid || haveS.has(s.id)) continue;
      const facts = {};
      for (const k of Object.keys(s.facts || {})) if (FACT[k]) facts[k] = s.facts[k];
      const photos = (s.photos || []).filter(p => p && p.media);
      db.surveys.push({
        id: s.id, placeId: pid, at: s.at || Date.now(), by: (s.by || who).toString().slice(0, 40),
        slot: s.slot || 'midday', seconds: s.seconds || null, facts, photos
      });
      haveS.add(s.id); out.surveys++; out.photos += photos.length;
    }
    const haveC = new Set(db.confirms.map(c => c.id));
    for (const c of (pack.confirms || [])) {
      const pid = remap[c.placeId]; if (!pid || haveC.has(c.id)) continue;
      db.confirms.push({ id: c.id, placeId: pid, at: c.at || Date.now(), by: (c.by || who).toString().slice(0, 40) });
      haveC.add(c.id); out.confirms++;
    }
    for (const l of (pack.lists || [])) {
      const ids = (l.placeIds || []).map(x => remap[x]).filter(Boolean);
      if (!ids.length) continue;
      const existing = db.lists.find(x => x.title.toLowerCase() === String(l.title || '').toLowerCase());
      if (existing) {
        for (const id of ids) if (!existing.placeIds.includes(id)) existing.placeIds.push(id);
      } else {
        db.lists.push({ id: uid('l'), title: String(l.title || 'Shared list').slice(0, 60), placeIds: ids, at: Date.now() });
        out.lists++;
      }
    }
    saveNow();
    return out;
  }

  /* "Delete everything" means the content, not your own setup: the lens, the text size and
     the haptic choice are yours and survive it. */
  function wipe() {
    db.places = []; db.surveys = []; db.confirms = []; db.lists = [];
    db.settings.sample = false;
    // The last position fix is data about you as much as any place is, so it goes with them.
    db.settings.lastFix = null;
    saveNow();
  }

  function replaceAll(next) { db = next; saveNow(); }

  return {
    KEY, GROUPS, FACTS, FACT, KINDS, SLOTS, PHOTO_ROLES,
    db: () => db, save, saveNow, uid, replaceAll, wipe,
    places, place, addPlace, updatePlace, removePlace,
    surveys, addSurvey, removeSurvey, confirm, confirms, slotNow,
    compose, freshness, ago, dateLabel, say, slotLabel, same,
    lists, addList, renameList, removeList, inList, toggleInList, listsWith,
    lens, setLens, settings, set, stats, exportPack, importPack
  };
})();
