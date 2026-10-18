/* Pigment. One localStorage record, on this device, and nothing else anywhere.

   A painting is stored as the log of what you did to it, not as pixels, so a
   finished sheet is a few kilobytes. The only picture kept is a small thumbnail
   for the Flatfile drawer. */

const Store = (() => {
  const KEY = 'pigment.v1';

  const DEFAULTS = {
    paintings: [],
    mixes: [],
    settings: {
      brush: 'round', tool: 'paint', water: 0.72, pigment: 'ultramarine',
      tilt: false, haptics: true, lefty: false, sound: false
    },
    lessons: [],
    firstRun: null,
    lastOpen: null,
    seenIntro: false
  };

  let db = load();

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      const d = JSON.parse(raw);
      return {
        paintings: Array.isArray(d.paintings) ? d.paintings : [],
        mixes: Array.isArray(d.mixes) ? d.mixes : [],
        settings: Object.assign(clone(DEFAULTS.settings), d.settings || {}),
        lessons: Array.isArray(d.lessons) ? d.lessons : [],
        firstRun: d.firstRun || null,
        lastOpen: d.lastOpen || null,
        seenIntro: !!d.seenIntro
      };
    } catch (e) { return clone(DEFAULTS); }
  }

  let lastError = '';
  function save() {
    lastError = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
      catch (e) {
        // Out of room. Drop the stroke logs of the oldest paintings, oldest first,
        // keeping the thumbnail so the sheet is still in the drawer.
        const old = db.paintings.filter(p => !p.trimmed && p.ops && p.ops.length)
          .sort((a, b) => a.updated - b.updated)[0];
        if (!old) { lastError = 'This device has no room left for another painting.'; return false; }
        old.ops = []; old.trimmed = true;
      }
    }
    lastError = 'This device has no room left for another painting.';
    return false;
  }
  const error = () => lastError;

  /* ---------------------------------------------------------------- settings */
  const settings = () => db.settings;
  function set(k, v) { db.settings[k] = v; save(); }

  /* --------------------------------------------------------------- paintings */
  const paintings = () => db.paintings.slice().sort((a, b) => b.updated - a.updated);
  const find = id => db.paintings.find(p => p.id === id) || null;

  function create(paperId, sizeId, name) {
    const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    const p = {
      id, name: name || untitled(), paper: paperId, size: sizeId,
      seed: (Math.random() * 4294967295) >>> 0,
      ops: [], dur: 0, strokes: 0, thumb: '',
      created: Date.now(), updated: Date.now(), trimmed: false
    };
    db.paintings.push(p);
    if (!db.firstRun) db.firstRun = Date.now();
    db.lastOpen = id;
    save();
    return p;
  }

  function untitled() {
    const n = db.paintings.length + 1;
    return 'Sheet ' + n;
  }

  function update(id, patch) {
    const p = find(id); if (!p) return null;
    Object.assign(p, patch, { updated: Date.now() });
    save();
    return p;
  }

  function remove(id) {
    db.paintings = db.paintings.filter(p => p.id !== id);
    if (db.lastOpen === id) db.lastOpen = null;
    save();
  }

  function touch(id) { db.lastOpen = id; save(); }
  const lastOpen = () => db.lastOpen;

  /* ------------------------------------------------------------------ mixes */
  const mixes = () => db.mixes.slice();
  function addMix(m) {
    const id = 'm' + Date.now().toString(36);
    db.mixes.unshift(Object.assign({ id, created: Date.now() }, m));
    if (db.mixes.length > 40) db.mixes.length = 40;
    save();
    return id;
  }
  function removeMix(id) { db.mixes = db.mixes.filter(m => m.id !== id); save(); }
  const findMix = id => db.mixes.find(m => m.id === id) || null;

  /* ---------------------------------------------------------------- lessons */
  const lessonDone = id => db.lessons.indexOf(id) >= 0;
  function markLesson(id) { if (!lessonDone(id)) { db.lessons.push(id); save(); } }
  const lessonsDone = () => db.lessons.length;

  const seenIntro = () => db.seenIntro;
  function markIntro() { db.seenIntro = true; save(); }

  function eraseAll() { db = clone(DEFAULTS); save(); }

  /* ------------------------------------------------------------------ dates */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayLabel(ts) {
    const d = new Date(ts), n = new Date();
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, n)) return 'Today';
    const y = new Date(n); y.setDate(y.getDate() - 1);
    if (same(d, y)) return 'Yesterday';
    const s = d.getDate() + ' ' + MONTHS[d.getMonth()];
    return d.getFullYear() === n.getFullYear() ? s : s + ' ' + d.getFullYear();
  }
  function mins(ms) {
    const m = Math.round(ms / 60000);
    if (m < 1) return 'under a minute';
    if (m === 1) return 'one minute';
    if (m < 60) return m + ' minutes';
    const h = Math.floor(m / 60), r = m % 60;
    return h + (h === 1 ? ' hour ' : ' hours ') + r + ' min';
  }

  /* Everything you made, as one plain text file plus the paintings' logs. */
  function exportJSON() {
    return JSON.stringify({
      app: 'Pigment', exported: new Date().toISOString(),
      note: 'Written on your device. Nothing was uploaded to produce this file.',
      paintings: db.paintings.map(p => ({
        name: p.name, paper: p.paper, size: p.size, seed: p.seed,
        created: p.created, strokes: p.strokes, ops: p.ops
      })),
      mixes: db.mixes
    }, null, 1);
  }

  return { settings, set, paintings, find, create, update, remove, touch, lastOpen,
           mixes, addMix, removeMix, findMix, lessonDone, markLesson, lessonsDone,
           seenIntro, markIntro, eraseAll, dayLabel, mins, exportJSON, save, error };
})();

window.Store = Store;
