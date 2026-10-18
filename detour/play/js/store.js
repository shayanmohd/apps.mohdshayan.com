/* Detour. Every byte of state is one localStorage record on this device. Nothing is transmitted,
   and the Android build has no internet permission, so nothing can be. */
const Store = (() => {
  const KEY = 'detour.v1';
  const CELL_M = 40;           // the walked-ground grid, roughly a short block face
  const MAX_WALKS = 400;
  const MAX_CELLS = 30000;

  const MOOD_IDS = ['surprise', 'quiet', 'lively', 'grid', 'slow'];

  const DEFAULTS = {
    walks: [],        // finished walks, oldest first
    live: null,       // the walk in progress, or null
    cells: {},        // "latIdx:lonIdx" -> { n, first }
    deck: { done: {}, loved: [], seen: {} },
    settings: {
      minutes: 45,
      mood: 'surprise',
      loop: true,
      haptics: true,
      strength: 0.7,
      rate: 'some',     // few | some | many
      units: 'km',      // km | mi
      awake: true,
      seenIntro: false
    }
  };

  let db = load();

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* One reader for both jobs: the record on this device, and a record handed back from an export
     file. Anything unrecognised falls back to the default rather than throwing. */
  function normalise(d) {
    d = d || {};
    const s = Object.assign(clone(DEFAULTS.settings), d.settings || {});
    s.minutes = clampMinutes(s.minutes);
    s.strength = Math.min(1, Math.max(0.2, Number(s.strength) || 0.7));
    if (!['few', 'some', 'many'].includes(s.rate)) s.rate = 'some';
    if (!['km', 'mi'].includes(s.units)) s.units = 'km';
    s.loop = s.loop !== false;
    s.haptics = s.haptics !== false;
    s.awake = s.awake !== false;
    s.seenIntro = !!s.seenIntro;
    if (!MOOD_IDS.includes(s.mood)) s.mood = 'surprise';
    const deck = d.deck || {};
    return {
      walks: (Array.isArray(d.walks) ? d.walks : []).filter(w => w && w.id && Array.isArray(w.trail)),
      live: d.live && d.live.id && Array.isArray(d.live.trail) ? d.live : null,
      cells: (d.cells && typeof d.cells === 'object' && !Array.isArray(d.cells)) ? d.cells : {},
      deck: {
        done: (deck.done && typeof deck.done === 'object') ? deck.done : {},
        loved: Array.isArray(deck.loved) ? deck.loved : [],
        seen: (deck.seen && typeof deck.seen === 'object') ? deck.seen : {}
      },
      settings: s
    };
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return clone(DEFAULTS); }
    if (!raw) return clone(DEFAULTS);
    try { return normalise(JSON.parse(raw)); }
    catch (e) {
      /* Falling back to the defaults means the very next save writes them straight over whatever
         is here, and a walk journal is not something to overwrite quietly. Keep the text that
         could not be read to one side first, so nothing anybody walked is thrown away. */
      try { localStorage.setItem(KEY + '.unreadable', raw); } catch (e2) {}
      return clone(DEFAULTS);
    }
  }

  let saveTimer = null, saveDue = 0;
  function save() {
    saveDue = 0;
    clearTimeout(saveTimer); saveTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) {
      // Out of quota: the oldest trails are the fattest thing here, so thin them before giving up.
      for (let i = 0; i < db.walks.length && i < 40; i++) {
        if (db.walks[i].trail.length > 40) db.walks[i].trail = simplify(db.walks[i].trail, 12);
      }
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e2) {}
    }
  }
  /* A plain debounce starves under a steady stream of fixes: every one pushes the write further
     away and the live walk is never written down. This one still coalesces, but it will not wait
     longer than four seconds, so a walk survives the app being killed mid-stride. */
  function saveSoon() {
    const now = Date.now();
    if (!saveDue) saveDue = now + 4000;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, Math.max(0, Math.min(900, saveDue - now)));
  }

  function clampMinutes(m) {
    // `Number(m) || 45` turned a zero into three quarters of an hour, so a zero is tested for.
    const n = Number(m);
    m = Math.round((isFinite(n) ? n : 45) / 5) * 5;
    return Math.min(180, Math.max(20, m));
  }

  /* ---------- geometry, in plain metres ---------- */
  const R = 6371000, D2R = Math.PI / 180, R2D = 180 / Math.PI;

  function dist(a, b) {
    const dLat = (b[0] - a[0]) * D2R;
    const dLon = (b[1] - a[1]) * D2R;
    const la1 = a[0] * D2R, la2 = b[0] * D2R;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function bearing(a, b) {
    const la1 = a[0] * D2R, la2 = b[0] * D2R, dLon = (b[1] - a[1]) * D2R;
    const y = Math.sin(dLon) * Math.cos(la2);
    const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
    return (Math.atan2(y, x) * R2D + 360) % 360;
  }

  /** Point `m` metres from `a` along compass bearing `brg`. */
  function project(a, brg, m) {
    const d = m / R, t = brg * D2R, la1 = a[0] * D2R, lo1 = a[1] * D2R;
    const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(t));
    const lo2 = lo1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la1),
                                 Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    return [la2 * R2D, ((lo2 * R2D + 540) % 360) - 180];
  }

  /** Signed smallest angle from a to b, in degrees, in (-180, 180]. */
  function angDiff(a, b) { return ((b - a + 540) % 360) - 180; }

  /* ---------- the walked-ground grid ---------- */
  const LAT_STEP = CELL_M / 111320;
  function cellKey(lat, lon) {
    const li = Math.floor(lat / LAT_STEP);
    const bandLat = (li + 0.5) * LAT_STEP;
    const lonStep = CELL_M / (111320 * Math.max(0.02, Math.cos(bandLat * D2R)));
    return li + ':' + Math.floor(lon / lonStep);
  }
  const cellVisits = (lat, lon) => (db.cells[cellKey(lat, lon)] || { n: 0 }).n;
  function touchCell(lat, lon, at) {
    const k = cellKey(lat, lon);
    const c = db.cells[k];
    if (c) { c.n++; return false; }
    if (Object.keys(db.cells).length >= MAX_CELLS) return false;
    db.cells[k] = { n: 1, first: at || Date.now() };
    return true;   // true means this cell is new ground
  }
  const cellCount = () => Object.keys(db.cells).length;
  /** Every walked square as [lat, lon, visits], at its centre, so the coverage view can draw them. */
  function cellList() {
    const out = [];
    for (const k in db.cells) {
      const bits = k.split(':');
      const li = Number(bits[0]), loi = Number(bits[1]);
      if (!isFinite(li) || !isFinite(loi)) continue;
      const bandLat = (li + 0.5) * LAT_STEP;
      const lonStep = CELL_M / (111320 * Math.max(0.02, Math.cos(bandLat * D2R)));
      out.push([bandLat, (loi + 0.5) * lonStep, db.cells[k].n || 1]);
    }
    return out;
  }

  /* ---------- trail thinning ---------- */
  /** Ramer-Douglas-Peucker on lat/lon treated as a local plane. Trails are what fills the quota. */
  function simplify(pts, tolM) {
    if (pts.length < 3) return pts.slice();
    const lat0 = pts[0][0] * D2R;
    const kx = 111320 * Math.cos(lat0), ky = 110540;
    const P = pts.map(p => [p[1] * kx, p[0] * ky]);
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop();
      if (j - i < 2) continue;
      const ax = P[i][0], ay = P[i][1], bx = P[j][0], by = P[j][1];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      let best = -1, bi = -1;
      for (let k = i + 1; k < j; k++) {
        const d = Math.abs((P[k][0] - ax) * dy - (P[k][1] - ay) * dx) / len;
        if (d > best) { best = d; bi = k; }
      }
      if (best > tolM) { keep[bi] = 1; stack.push([i, bi], [bi, j]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  /* ---------- the live walk ---------- */
  function startWalk(o) {
    db.live = {
      id: 'w' + Date.now().toString(36),
      at: Date.now(),
      minutes: o.minutes,
      mood: o.mood,
      loop: !!o.loop,
      seed: (Math.random() * 4294967296) >>> 0,
      start: null,          // [lat, lon], set by the first fix
      trail: [],            // [lat, lon, tSec, accuracy]
      legs: [],             // { at, bearing, distM, from:[lat,lon], turn }
      prompts: [],          // { id, at, state, note, pt }
      distM: 0,
      movingS: 0,
      pausedS: 0,
      newCells: 0,
      endedAt: null,
      noticed: ''
    };
    save();
    return db.live;
  }
  const live = () => db.live;
  function saveLive() { saveSoon(); }
  function discardLive() { db.live = null; save(); }

  function finishWalk(noticed) {
    const w = db.live;
    if (!w) return null;
    w.endedAt = Date.now();
    w.noticed = (noticed || '').slice(0, 240);
    w.trail = simplify(w.trail, 6).map(p => [round5(p[0]), round5(p[1]), p[2]]);
    db.walks.push(w);
    if (db.walks.length > MAX_WALKS) db.walks = db.walks.slice(-MAX_WALKS);
    db.live = null;
    save();
    return w;
  }
  const round5 = n => Math.round(n * 1e5) / 1e5;

  const walks = () => db.walks.slice().sort((a, b) => b.at - a.at);
  const walk = id => db.walks.find(w => w.id === id) || null;
  function deleteWalk(id) { db.walks = db.walks.filter(w => w.id !== id); save(); }
  function setNoticed(id, text) {
    const w = walk(id); if (!w) return;
    w.noticed = (text || '').slice(0, 240); save();
  }

  /* ---------- the deck's memory ---------- */
  const deck = () => db.deck;
  function markSeen(id) { db.deck.seen[id] = (db.deck.seen[id] || 0) + 1; saveSoon(); }
  function markDone(id) { db.deck.done[id] = (db.deck.done[id] || 0) + 1; saveSoon(); }
  const doneCount = id => db.deck.done[id] || 0;
  const seenCount = id => db.deck.seen[id] || 0;
  const isLoved = id => db.deck.loved.includes(id);
  function toggleLove(id) {
    const i = db.deck.loved.indexOf(id);
    if (i < 0) db.deck.loved.push(id); else db.deck.loved.splice(i, 1);
    save();
    return i < 0;
  }
  const questsDone = () => Object.values(db.deck.done).reduce((a, b) => a + b, 0);

  /* ---------- settings ---------- */
  const settings = () => db.settings;
  function set(k, v) {
    if (k === 'minutes') v = clampMinutes(v);
    db.settings[k] = v; save();
  }

  /* ---------- formatting ---------- */
  function fmtDist(m) {
    if (db.settings.units === 'mi') {
      const yd = m * 1.09361;
      if (yd < 800) return Math.round(yd / 10) * 10 + ' yd';
      return (m / 1609.34).toFixed(m < 16093 ? 1 : 0) + ' mi';
    }
    if (m < 950) return Math.round(m / 10) * 10 + ' m';
    return (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
  }
  function fmtShort(m) {
    if (db.settings.units === 'mi') {
      const yd = Math.round(m * 1.09361 / 10) * 10;
      return yd + ' yd';
    }
    return Math.round(m / 10) * 10 + ' m';
  }
  function fmtMins(s) {
    if (s < 60) return 'under a minute';
    const m = Math.max(0, Math.round(s / 60));
    // "47m" next to "2.2 km" reads as metres, so under an hour the word is spelled out.
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
  }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];
  const SHORTM = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayLabel(ts) {
    const d = new Date(ts), n = new Date();
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, n)) return 'Today';
    const y = new Date(n); y.setDate(y.getDate() - 1);
    if (same(d, y)) return 'Yesterday';
    return d.getDate() + ' ' + SHORTM[d.getMonth()];
  }
  function longDate(ts) {
    const d = new Date(ts);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function clock(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ---------- compass words ---------- */
  const POINTS = ['North', 'North north east', 'North east', 'East north east', 'East',
                  'East south east', 'South east', 'South south east', 'South',
                  'South south west', 'South west', 'West south west', 'West',
                  'West north west', 'North west', 'North north west'];
  const SHORTP = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const compassWord = b => POINTS[Math.round(((b % 360) + 360) % 360 / 22.5) % 16];
  const compassShort = b => SHORTP[Math.round(((b % 360) + 360) % 360 / 22.5) % 16];

  /* ---------- export ---------- */
  function exportJson() {
    return JSON.stringify({
      app: 'Detour', version: 1, exported: new Date().toISOString(),
      note: 'Written on your device. Nothing was uploaded to produce this file.',
      walks: db.walks, cells: db.cells, deck: db.deck, settings: db.settings
    }, null, 1);
  }

  function exportText() {
    const L = [];
    L.push('Detour, a wander journal');
    L.push('Exported ' + new Date().toLocaleString());
    L.push('Written on your device. Nothing was uploaded to produce this file.');
    L.push('');
    const list = walks();
    if (!list.length) L.push('No walks kept yet.');
    for (const w of list) {
      const durS = Math.round(((w.endedAt || w.at) - w.at) / 1000);
      L.push(longDate(w.at) + ', ' + clock(w.at));
      L.push('  ' + Moods.label(w.mood) + ', ' + fmtMins(durS) + ', ' + fmtDist(w.distM));
      L.push('  Bearings taken: ' + w.legs.length + '. New ground: ' + w.newCells + ' squares.');
      const done = (w.prompts || []).filter(p => p.state === 'done');
      for (const p of done) {
        const q = Deck.byId(p.id);
        L.push('  Quest: ' + (q ? q.t : p.id));
        if (p.note) L.push('    "' + p.note + '"');
      }
      if (w.noticed) L.push('  Noticed: ' + w.noticed);
      L.push('');
    }
    L.push('Ground covered in all: ' + cellCount() + ' squares of about forty metres.');
    L.push('Quests completed: ' + questsDone() + '.');
    return L.join('\n');
  }

  function eraseAll() { db = clone(DEFAULTS); save(); }

  /** Read an export file without changing anything, so the app can say what is in it first. */
  function readImport(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { return { ok: false, why: 'That file is not readable as JSON.' }; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, why: 'That file is not a Detour export.' };
    if (!Array.isArray(d.walks)) return { ok: false, why: 'That file has no walks in it, so it is not a Detour export.' };
    const rec = normalise(d);
    return { ok: true, rec, walks: rec.walks.length, cells: Object.keys(rec.cells).length,
             quests: Object.values(rec.deck.done).reduce((a, b) => a + b, 0) };
  }
  /** Put a read copy back in place of everything here. */
  function restore(rec) { db = clone(rec); save(); }

  /* ---------- moods ---------- */
  const Moods = {
    list: [
      { id: 'surprise', label: 'Surprise me',
        note: 'Wide turns, long odds, and a hard lean toward ground you have never stood in.' },
      { id: 'quiet', label: 'Quiet',
        note: 'Long legs, gentle turns. Fewer decisions, more room to think.' },
      { id: 'lively', label: 'Lively',
        note: 'Short legs and frequent corners, the shape of a walk through busy streets.' },
      { id: 'grid', label: 'Architectural',
        note: 'Bearings snap to the grain of the streets you have actually walked. Right angles, mostly.' },
      { id: 'slow', label: 'Melancholy',
        note: 'The longest legs of all, barely turning. A walk that lets you stop paying attention to it.' }
    ],
    label: id => (Moods.list.find(m => m.id === id) || { label: id }).label,
    note: id => (Moods.list.find(m => m.id === id) || { note: '' }).note,
    has: id => Moods.list.some(m => m.id === id)
  };

  return {
    KEY, CELL_M,
    dist, bearing, project, angDiff, simplify,
    cellKey, cellVisits, touchCell, cellCount, cellList,
    startWalk, live, saveLive, discardLive, finishWalk,
    walks, walk, deleteWalk, setNoticed,
    deck, markSeen, markDone, doneCount, seenCount, isLoved, toggleLove, questsDone,
    settings, set, clampMinutes, flush: save,
    fmtDist, fmtShort, fmtMins, dayLabel, longDate, clock,
    compassWord, compassShort,
    exportJson, exportText, eraseAll, readImport, restore, Moods,
    _cells: () => db.cells
  };
})();
