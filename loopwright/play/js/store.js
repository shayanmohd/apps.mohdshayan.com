/* Loopwright. Everything you make lives on this device: the songs in one
   localStorage record, the original hums in IndexedDB beside them.

   A layer is stored as what was heard, not as audio: a short list of notes or
   hits with their raw, unquantized times. The quantized version is derived on
   demand, which is why the tighter/looser slider can change its mind forever
   without ever losing your timing. */

const Store = (() => {
  const KEY = 'loopwright.v1';

  const DEFAULTS = {
    projects: [],
    lastOpen: null,
    seenIntro: false,
    guide: 0,               // 0..4, 5 means finished or skipped
    settings: {
      voice: 'felt',
      countIn: 4,           // beats of count-in before an overdub
      haptics: true,
      click: true,          // metronome while recording
      tighten: 0.85,
      headphones: false     // has the headphones note been shown
    }
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      const d = JSON.parse(raw);
      return {
        projects: Array.isArray(d.projects) ? d.projects : [],
        lastOpen: d.lastOpen || null,
        seenIntro: !!d.seenIntro,
        guide: typeof d.guide === 'number' ? d.guide : 0,
        settings: Object.assign(clone(DEFAULTS.settings), d.settings || {})
      };
    } catch (e) { return clone(DEFAULTS); }
  }

  let lastError = '';
  // Derived data hangs off the objects under _keys; it must never be written down.
  const strip = (k, v) => (k.charAt(0) === '_' ? undefined : v);

  function save() {
    lastError = '';
    try { localStorage.setItem(KEY, JSON.stringify(db, strip)); return true; }
    catch (e) {
      lastError = 'This device has no room left. Delete a song to make space.';
      return false;
    }
  }
  const error = () => lastError;

  /* ------------------------------------------------------------- settings */
  const settings = () => db.settings;
  function set(k, v) { db.settings[k] = v; save(); }

  const seenIntro = () => db.seenIntro;
  function markIntro() { db.seenIntro = true; save(); }
  const guide = () => db.guide;
  function setGuide(n) { db.guide = n; save(); }

  /* ------------------------------------------------------------------- id */
  let seq = 0;
  function uid(p) {
    seq = (seq + 1) % 1296;
    return p + Date.now().toString(36) + seq.toString(36);
  }

  /* ------------------------------------------------------------- projects */
  const projects = () => db.projects.slice().sort((a, b) => b.updated - a.updated);
  const find = id => db.projects.find(p => p.id === id) || null;
  const count = () => db.projects.length;

  function newScene(name) {
    return { id: uid('s'), name: name || 'A', layers: [] };
  }

  function create() {
    const sc = newScene('A');
    const p = {
      id: uid('p'),
      title: '',
      tonic: 5, mode: 'minor',       // provisional until the first hum is heard
      bpm: 100, beats: 8,
      keyLocked: false,
      scenes: [sc],
      strip: [],
      openScene: sc.id,
      created: Date.now(), updated: Date.now()
    };
    db.projects.push(p);
    db.lastOpen = p.id;
    save();
    return p;
  }

  function touch(p) { if (p) { p.updated = Date.now(); save(); } }

  function remove(id) {
    const p = find(id);
    if (p) p.scenes.forEach(s => s.layers.forEach(l => Hums.drop(l.hum)));
    db.projects = db.projects.filter(x => x.id !== id);
    if (db.lastOpen === id) db.lastOpen = db.projects.length ? db.projects[db.projects.length - 1].id : null;
    save();
  }

  function open(id) { db.lastOpen = id; save(); }
  const lastOpen = () => db.lastOpen;

  /* --------------------------------------------------------------- scenes */
  const scene = (p, id) => (p ? p.scenes.find(s => s.id === id) : null) || null;
  function current(p) { return scene(p, p.openScene) || p.scenes[0]; }

  const LETTERS = 'ABCDEFGH';
  function addScene(p, copyOf) {
    const name = LETTERS[p.scenes.length] || String(p.scenes.length + 1);
    const s = newScene(name);
    if (copyOf) {
      s.layers = copyOf.layers.map(l => Object.assign({}, l, { id: uid('l') }));
      // The copies point at the same hum recording; it is never deleted twice.
      s.layers.forEach(l => { l._d = null; });
    }
    p.scenes.push(s);
    p.openScene = s.id;
    touch(p);
    return s;
  }

  function removeScene(p, id) {
    if (p.scenes.length < 2) return false;
    p.scenes = p.scenes.filter(s => s.id !== id);
    p.strip = p.strip.filter(b => b.scene !== id);
    if (p.openScene === id) p.openScene = p.scenes[0].id;
    touch(p);
    return true;
  }

  /* --------------------------------------------------------------- layers */
  function addLayer(p, sc, layer) {
    const l = Object.assign({
      id: uid('l'),
      kind: 'melodic',
      voice: 'felt',
      src: [],            // raw, as heard: melodic {p,t,d,v} in beats, drums {lane,t,v}
      vol: 0.85,
      muted: false,
      tighten: db.settings.tighten,
      swing: 0,
      chords: false,
      ab: false,
      octave: 0,
      hum: null,
      humDur: 0,
      created: Date.now()
    }, layer);
    sc.layers.push(l);
    touch(p);
    return l;
  }

  function removeLayer(p, sc, id) {
    const l = sc.layers.find(x => x.id === id);
    if (l) {
      const used = p.scenes.some(s => s.layers.some(x => x !== l && x.hum === l.hum));
      if (!used) Hums.drop(l.hum);
    }
    sc.layers = sc.layers.filter(x => x.id !== id);
    touch(p);
  }

  function layerPatch(p, l, patch) {
    Object.assign(l, patch);
    l._d = null;
    touch(p);
  }

  /* ----------------------------------------------------------------- name */
  const TONICS = ['C', 'C sharp', 'D', 'E flat', 'E', 'F', 'F sharp', 'G', 'A flat', 'A', 'B flat', 'B'];
  const SHORT = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const keyName = p => SHORT[p.tonic] + ' ' + p.mode;
  const keyLong = p => TONICS[p.tonic] + ' ' + p.mode;

  /** A name made of what the song actually is, which people keep more often than not. */
  function suggestTitle(p) {
    if (!layerCount(p)) return 'Untitled loop';
    let lead = null;
    p.scenes.forEach(s => s.layers.forEach(l => {
      if (!lead && l.kind === 'melodic') lead = l;
    }));
    if (!lead) return 'Beat in ' + TONICS[p.tonic] + ' ' + p.mode;
    return Voices.get(lead.voice).name + ' in ' + TONICS[p.tonic] + ' ' + p.mode;
  }
  const title = p => p.title || suggestTitle(p);

  function eraseAll() {
    db.projects.forEach(p => p.scenes.forEach(s => s.layers.forEach(l => Hums.drop(l.hum))));
    db = clone(DEFAULTS);
    save();
  }

  /* ----------------------------------------------------------------- misc */
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
  function clock(sec) {
    const s = Math.max(0, Math.round(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  const loopSeconds = p => p.beats * 60 / p.bpm;
  function songSeconds(p) {
    if (!p.strip.length) return loopSeconds(p) * 2;
    return p.strip.reduce((n, b) => n + b.repeats, 0) * loopSeconds(p);
  }
  const layerCount = p => p.scenes.reduce((n, s) => n + s.layers.length, 0);

  return {
    settings, set, seenIntro, markIntro, guide, setGuide, uid,
    projects, find, count, create, remove, open, lastOpen, touch,
    scene, current, addScene, removeScene,
    addLayer, removeLayer, layerPatch,
    keyName, keyLong, title, suggestTitle, eraseAll,
    dayLabel, clock, loopSeconds, songSeconds, layerCount, save, error,
    TONICS, SHORT
  };
})();

window.Store = Store;

/* The hums themselves. They are the one heavy thing the app keeps, so they live
   in IndexedDB as plain 16 bit samples rather than in the settings record. */
const Hums = (() => {
  const DB = 'loopwright', STORE = 'hums';
  let dbp = null;

  /* A blocked or disabled IndexedDB must never leave a caller waiting: an upgrade
     held open by another tab fires neither success nor error, and a private
     window can refuse the store outright. Both resolve to null, and the app
     carries on without the recording rather than freezing on it. */
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(res => {
      let done = false;
      const finish = v => { if (!done) { done = true; res(v); } };
      const timer = setTimeout(() => finish(null), 4000);
      const settle = v => { clearTimeout(timer); finish(v); };
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { return settle(null); }
      req.onupgradeneeded = () => {
        try { req.result.createObjectStore(STORE); } catch (e) {}
      };
      req.onsuccess = () => settle(req.result);
      req.onerror = () => settle(null);
      req.onblocked = () => settle(null);
    });
    return dbp;
  }

  async function tx(mode, fn) {
    const d = await open();
    if (!d) return null;
    return new Promise(res => {
      let out = null, done = false;
      const finish = v => { if (!done) { done = true; res(v); } };
      const timer = setTimeout(() => finish(null), 6000);
      const settle = v => { clearTimeout(timer); finish(v); };
      try {
        const t = d.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        if (r) r.onsuccess = () => { out = r.result; };
        t.oncomplete = () => settle(out);
        t.onerror = () => settle(null);
        t.onabort = () => settle(null);
      } catch (e) { settle(null); }
    });
  }

  /** Float samples in, a compact record out. Returns the key, or null. */
  async function put(key, samples, sr) {
    const d = await open();
    if (!d) return null;
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const v = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = v < 0 ? v * 32768 : v * 32767;
    }
    await tx('readwrite', st => st.put({ sr, pcm }, key));
    return (await get(key)) ? key : null;
  }

  const get = key => (key ? tx('readonly', st => st.get(key)) : Promise.resolve(null));

  function drop(key) { if (key) tx('readwrite', st => st.delete(key)); }

  const cache = new Map();
  /** The hum as an AudioBuffer in the given context, decoded once and kept. */
  async function buffer(ctx, key) {
    if (!key) return null;
    const ck = key + '@' + ctx.sampleRate;
    if (cache.has(ck)) return cache.get(ck);
    const rec = await get(key);
    if (!rec || !rec.pcm) return null;
    const src = rec.pcm, n = src.length;
    const ratio = rec.sr / ctx.sampleRate;
    const out = ctx.createBuffer(1, Math.max(1, Math.round(n / ratio)), ctx.sampleRate);
    const ch = out.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      const x = i * ratio, i0 = x | 0, f = x - i0;
      const a = src[Math.min(i0, n - 1)] / 32768, b = src[Math.min(i0 + 1, n - 1)] / 32768;
      ch[i] = a + (b - a) * f;
    }
    cache.set(ck, out);
    return out;
  }

  return { put, get, drop, buffer };
})();

window.Hums = Hums;
