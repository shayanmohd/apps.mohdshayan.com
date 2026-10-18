/* Greenroom state. One localStorage record holds everything you can read:
   speeches, takes, the analysis of each take and your settings. The recorded
   audio is the only thing kept elsewhere, in IndexedDB beside it, because it is
   large and because you are allowed to throw it away without losing the notes. */

const Store = (() => {
  const KEY = 'greenroom.v1';
  const DB = 'greenroom-audio';
  const SHELF = 'takes';

  const DEFAULTS = {
    speeches: [],
    takes: [],
    settings: {
      haptics: true,
      countdown: true,
      meters: true,
      audience: 'none',
      scroll: 'off',
      scrollWpm: 130,
      keepAudio: true
    },
    seen: { intro: false, guided: 0 },
    firstRun: 0
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  let db = load();
  let lastError = '';

  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') { const f = clone(DEFAULTS); f.firstRun = Date.now(); return f; }
    return {
      speeches: Array.isArray(d.speeches) ? d.speeches : [],
      takes: Array.isArray(d.takes) ? d.takes : [],
      settings: Object.assign(clone(DEFAULTS.settings), d.settings || {}),
      seen: Object.assign(clone(DEFAULTS.seen), d.seen || {}),
      firstRun: d.firstRun || Date.now()
    };
  }

  function save() {
    lastError = '';
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) {
      lastError = 'This phone has no room left for another take. Delete an old one to make space.';
      return false;
    }
  }
  const error = () => lastError;

  /* ------------------------------------------------------------------- ids */
  let seq = 0;
  function uid(p) {
    seq++;
    return p + Date.now().toString(36) + seq.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  /* -------------------------------------------------------------- settings */
  const settings = () => db.settings;
  function set(k, v) { db.settings[k] = v; save(); }
  const seen = () => db.seen;
  function markSeen(k, v) { db.seen[k] = (v === undefined ? true : v); save(); }
  const firstRun = () => db.firstRun;

  /* -------------------------------------------------------------- speeches */
  const speeches = () => db.speeches.slice().sort((a, b) => (b.lastAt || b.createdAt) - (a.lastAt || a.createdAt));
  const speech = id => db.speeches.find(s => s.id === id) || null;

  function addSpeech(o) {
    const s = {
      id: uid('s'),
      title: (o.title || 'Untitled').slice(0, 60),
      occasion: o.occasion || 'freeform',
      eventDate: o.eventDate || null,
      targetMin: o.targetMin || null,
      script: '',
      createdAt: Date.now(),
      lastAt: Date.now()
    };
    db.speeches.unshift(s);
    save();
    return s;
  }

  function updateSpeech(id, patch) {
    const s = speech(id);
    if (!s) return null;
    Object.assign(s, patch);
    save();
    return s;
  }

  function removeSpeech(id) {
    db.takes.filter(t => t.speechId === id).forEach(t => dropAudio(t.id));
    db.takes = db.takes.filter(t => t.speechId !== id);
    db.speeches = db.speeches.filter(s => s.id !== id);
    save();
  }

  /* ----------------------------------------------------------------- takes */
  const takes = () => db.takes;
  const take = id => db.takes.find(t => t.id === id) || null;
  const takesOf = id => db.takes.filter(t => t.speechId === id).sort((a, b) => a.at - b.at);

  function takeNumber(t) {
    const list = takesOf(t.speechId);
    return list.findIndex(x => x.id === t.id) + 1;
  }

  function addTake(o) {
    const t = {
      id: uid('t'),
      speechId: o.speechId,
      at: Date.now(),
      dur: o.dur,
      audience: o.audience || 'none',
      sig: o.sig,
      notes: o.notes || null,
      marks: [],
      hasAudio: false
    };
    db.takes.push(t);
    const s = speech(o.speechId);
    if (s) s.lastAt = t.at;
    save();
    return t;
  }

  function updateTake(id, patch) {
    const t = take(id);
    if (!t) return null;
    Object.assign(t, patch);
    save();
    return t;
  }

  function removeTake(id) {
    db.takes = db.takes.filter(t => t.id !== id);
    save();
    dropAudio(id);
  }

  /* ------------------------------------------------------- audio, in IndexedDB */
  let idb = null, idbTried = false;

  function open() {
    return new Promise(resolve => {
      if (idb) return resolve(idb);
      if (idbTried && !idb) return resolve(null);
      idbTried = true;
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(SHELF)) d.createObjectStore(SHELF);
      };
      req.onsuccess = () => { idb = req.result; resolve(idb); };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }

  /** pcm is an Int16Array at `sr` hz, mono. Resolves true when it is safely down. */
  async function putAudio(id, pcm, sr) {
    const d = await open();
    if (!d) return false;
    return new Promise(resolve => {
      let tx;
      try { tx = d.transaction(SHELF, 'readwrite'); } catch (e) { return resolve(false); }
      tx.objectStore(SHELF).put({ sr: sr, pcm: pcm.buffer }, id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  }

  async function getAudio(id) {
    const d = await open();
    if (!d) return null;
    return new Promise(resolve => {
      let tx;
      try { tx = d.transaction(SHELF, 'readonly'); } catch (e) { return resolve(null); }
      const r = tx.objectStore(SHELF).get(id);
      r.onsuccess = () => {
        const v = r.result;
        if (!v || !v.pcm) return resolve(null);
        resolve({ sr: v.sr, pcm: new Int16Array(v.pcm) });
      };
      r.onerror = () => resolve(null);
    });
  }

  async function dropAudio(id) {
    const d = await open();
    if (!d) return;
    try {
      const tx = d.transaction(SHELF, 'readwrite');
      tx.objectStore(SHELF).delete(id);
    } catch (e) { /* nothing to delete */ }
  }

  async function audioBytes() {
    let n = 0;
    for (const t of db.takes) {
      if (!t.hasAudio) continue;
      n += Math.round(t.dur * 16000 * 2);
    }
    return n;
  }

  /* ---------------------------------------------------------------- export */
  function exportAll() {
    return JSON.stringify({
      app: 'Greenroom',
      version: 1,
      exportedAt: new Date().toISOString(),
      speeches: db.speeches,
      takes: db.takes.map(t => ({
        id: t.id, speechId: t.speechId, at: t.at, dur: t.dur,
        audience: t.audience, marks: t.marks,
        stats: t.sig && t.sig.stats, notes: t.notes
      }))
    }, null, 2);
  }

  function wipe() {
    db.takes.forEach(t => dropAudio(t.id));
    db = clone(DEFAULTS);
    db.firstRun = Date.now();
    save();
  }

  return {
    settings, set, seen, markSeen, firstRun, error, save,
    speeches, speech, addSpeech, updateSpeech, removeSpeech,
    takes, take, takesOf, takeNumber, addTake, updateTake, removeTake,
    putAudio, getAudio, dropAudio, audioBytes,
    exportAll, wipe, uid
  };
})();
