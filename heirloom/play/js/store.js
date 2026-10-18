/* Heirloom store. Metadata lives in one localStorage record under heirloom.v1.
   Audio is far too big for localStorage, so recordings live in IndexedDB in the
   same origin, keyed by story id. Nothing here ever touches a network. */

const Store = (() => {
  const KEY = 'heirloom.v1';
  const DB = 'heirloom-audio';
  const WEEK = 604800000;

  const DEFAULTS = {
    v: 1,
    onboarded: false,
    family: '',
    tellers: [],
    people: [],
    queue: [],
    stories: [],
    settings: { haptics: true, notify: true, speak: true, sound: true, reactAs: null }
  };

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULTS));
      const d = JSON.parse(raw);
      return {
        v: 1,
        onboarded: !!d.onboarded,
        family: d.family || '',
        tellers: d.tellers || [],
        people: d.people || [],
        queue: d.queue || [],
        stories: d.stories || [],
        settings: Object.assign({}, DEFAULTS.settings, d.settings || {})
      };
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULTS)); }
  }
  /** True when the record reached the disk. Callers that would otherwise show something as
      kept check it; everything else is a change the person can simply make again. */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { return false; }
  }
  const all = () => db;
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ----------------------------------------------------------- dates ---- */
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  function longDate(ms) { const d = new Date(ms); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function shortDate(ms) { const d = new Date(ms); return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear(); }
  function relDate(ms) {
    const days = Math.floor((Date.now() - ms) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return days + ' days ago';
    if (days < 14) return 'Last week';
    if (days < 60) return Math.floor(days / 7) + ' weeks ago';
    return shortDate(ms);
  }
  function dur(s) {
    s = Math.max(0, Math.round(s));
    const m = Math.floor(s / 60);
    return m + ':' + pad(s % 60);
  }
  function durWords(s) {
    const m = Math.round(s / 60);
    if (s < 60) return Math.round(s) + ' seconds';
    return m + (m === 1 ? ' minute' : ' minutes');
  }

  /** Next occurrence of the teller's ritual slot, as epoch ms. */
  function nextRitual(t, from) {
    const now = new Date(from || Date.now());
    const [hh, mm] = (t.ritual && t.ritual.time || '15:00').split(':').map(Number);
    const day = (t.ritual && typeof t.ritual.day === 'number') ? t.ritual.day : 0;
    const d = new Date(now);
    d.setHours(hh, mm, 0, 0);
    let delta = (day - d.getDay() + 7) % 7;
    if (delta === 0 && d.getTime() <= now.getTime()) delta = 7;
    d.setDate(d.getDate() + delta);
    return d.getTime();
  }
  /** The ritual slot the next question belongs to, given one was answered at `at`.
      A story kept on the ritual morning must not deal another question the same
      afternoon, so a slot landing on the day of the answer is passed over. */
  function nextDue(t, at) {
    at = at == null ? t.answeredAt : at;
    if (!at) return nextRitual(t);
    let d = nextRitual(t, at);
    const a = new Date(at), n = new Date(d);
    if (a.getFullYear() === n.getFullYear() && a.getMonth() === n.getMonth() && a.getDate() === n.getDate()) d = nextRitual(t, d);
    return d;
  }
  function weekIndex(t, now) {
    return Math.floor(((now || Date.now()) - (t.startedAt || Date.now())) / WEEK);
  }

  /* --------------------------------------------------------- tellers ---- */
  const tellers = () => db.tellers;
  const teller = id => db.tellers.find(t => t.id === id) || null;

  /** A birth year the app will believe: four digits, not in the future, not before 1880. */
  function validYear(y) {
    y = parseInt(y, 10);
    return (y >= 1880 && y <= new Date().getFullYear()) ? y : null;
  }
  function addTeller(o) {
    const t = {
      id: uid('t'), name: o.name.trim().slice(0, 40), relation: (o.relation || '').trim().slice(0, 30),
      birthYear: validYear(o.birthYear), place: (o.place || '').trim().slice(0, 40),
      packs: o.packs || [], consent: null,
      ritual: { day: o.day == null ? 0 : o.day, time: /^\d\d:\d\d$/.test(o.time || '') ? o.time : '15:00' },
      startedAt: Date.now(), current: null, used: [], skipped: []
    };
    db.tellers.push(t); save();
    return t;
  }
  function updateTeller(id, patch) {
    const t = teller(id); if (!t) return null;
    Object.assign(t, patch); save(); return t;
  }
  function giveConsent(id, note) {
    const t = teller(id); if (!t) return null;
    t.consent = { at: Date.now(), note: note || '' }; save(); return t;
  }
  function removeTeller(id) {
    db.stories.filter(s => s.tellerId === id).forEach(s => dropAudio(s.id));
    db.stories = db.stories.filter(s => s.tellerId !== id);
    db.queue = db.queue.filter(q => q.tellerId !== id);
    db.tellers = db.tellers.filter(t => t.id !== id);
    save();
  }

  /* ---------------------------------------------------------- people ---- */
  const people = () => db.people;
  const person = id => db.people.find(p => p.id === id) || null;
  function addPerson(name, role) {
    const p = { id: uid('p'), name: name.trim(), role: role || 'listener' };
    db.people.push(p);
    if (!db.settings.reactAs) db.settings.reactAs = p.id;
    save(); return p;
  }
  function removePerson(id) {
    db.people = db.people.filter(p => p.id !== id);
    db.queue = db.queue.filter(q => q.fromId !== id);
    if (db.settings.reactAs === id) db.settings.reactAs = db.people.length ? db.people[0].id : null;
    save();
  }

  /* --------------------------------------------------------- prompts ---- */
  /** Counts of the subjects already in the archive. This is the biography boost. */
  function tagWeights(tellerId) {
    const w = {};
    for (const s of db.stories) {
      if (tellerId && s.tellerId !== tellerId) continue;
      const p = s.promptId && Content.byId(s.promptId);
      if (p) for (const t of p.tags) w[t] = (w[t] || 0) + 1;
      for (const t of s.tags || []) {
        const k = t.label.toLowerCase();
        w[k] = (w[k] || 0) + 1;
      }
    }
    return w;
  }

  /** The question this teller is on right now. Family questions jump the queue. */
  function current(id) {
    const t = teller(id); if (!t) return null;
    const wk = weekIndex(t);
    if (t.current && t.current.week === wk) return t.current;
    const q = db.queue.find(x => x.tellerId === id && !(x.deferUntil > Date.now()));
    if (q) {
      t.current = { week: wk, promptId: null, text: q.text, label: '',
                    fromId: q.fromId, queueId: q.id };
    } else {
      const p = Content.pick(t, wk, t.used, t.skipped, tagWeights(id));
      t.current = p ? { week: wk, promptId: p.id, text: p.text, label: p.label, fromId: null }
                    : { week: wk, promptId: null, text: '', label: '', fromId: null, empty: true };
    }
    save();
    return t.current;
  }
  /** Put a specific prompt in front of a teller now, replacing this week's pick. */
  function setPrompt(id, promptId) {
    const t = teller(id), p = Content.byId(promptId);
    if (!t || !p) return null;
    t.current = { week: weekIndex(t), promptId: p.id, text: p.text, label: p.label, fromId: null };
    save(); return t.current;
  }
  function skipWeek(id, rest) {
    const t = teller(id); if (!t) return;
    const c = current(id);
    if (c && c.promptId && t.skipped.indexOf(c.promptId) < 0) t.skipped.push(c.promptId);
    if (c && c.queueId) {
      const q = db.queue.find(x => x.id === c.queueId);
      if (q) q.deferUntil = Date.now() + WEEK;
    }
    t.current = null;
    /* From the big button screen, "not this week" means exactly that: the week is done, and a
       different question waits at the next ritual. From the keeper's side it just deals again. */
    if (rest) { t.answeredAt = Date.now(); t.skippedAt = Date.now(); }
    save();
  }
  function askQuestion(tellerId, text, fromId) {
    const q = { id: uid('q'), tellerId, text: text.trim().slice(0, 220), fromId: fromId || null, at: Date.now() };
    db.queue.push(q);
    const t = teller(tellerId);
    if (t && !db.stories.some(s => s.tellerId === tellerId && s.at > Date.now() - 6 * 86400000)) t.current = null;
    save(); return q;
  }
  const queueFor = id => db.queue.filter(q => q.tellerId === id);
  function dropQuestion(qid) { db.queue = db.queue.filter(q => q.id !== qid); save(); }

  /* --------------------------------------------------- audio (IndexedDB) */
  let idb = null;
  function open() {
    if (idb) return Promise.resolve(idb);
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('audio'); };
      r.onsuccess = () => { idb = r.result; res(idb); };
      r.onerror = () => rej(r.error);
    });
  }
  function putAudio(id, blob) {
    return open().then(d => new Promise((res, rej) => {
      const tx = d.transaction('audio', 'readwrite');
      tx.objectStore('audio').put(blob, id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    }));
  }
  function getAudio(id) {
    return open().then(d => new Promise((res, rej) => {
      const r = d.transaction('audio', 'readonly').objectStore('audio').get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    }));
  }
  function dropAudio(id) {
    return open().then(d => new Promise(res => {
      const tx = d.transaction('audio', 'readwrite');
      tx.objectStore('audio').delete(id);
      tx.oncomplete = res; tx.onerror = res;
    })).catch(() => {});
  }

  /* -------------------------------------------------------- stories ----- */
  const stories = () => db.stories.slice().sort((a, b) => b.at - a.at);
  const story = id => db.stories.find(s => s.id === id) || null;
  const storiesOf = id => db.stories.filter(s => s.tellerId === id).sort((a, b) => b.at - a.at);

  function addStory(o, blob) {
    const t = teller(o.tellerId);
    const s = {
      id: uid('s'), tellerId: o.tellerId,
      promptId: o.promptId || null,
      question: o.question, label: o.label || '', title: '',
      askedBy: o.fromId || null,
      at: Date.now(), dur: o.dur, mime: o.mime, size: blob ? blob.size : 0,
      tags: [], moments: [], notes: '',
      visibility: 'family', sealUntil: null,
      plays: 0, reactions: []
    };
    const keep = () => {
      const was = t ? { used: t.used.slice(), current: t.current, startedAt: t.startedAt,
                        answeredAt: t.answeredAt, skippedAt: t.skippedAt } : null;
      const queue = db.queue;
      db.stories.push(s);
      if (t) {
        if (o.promptId && t.used.indexOf(o.promptId) < 0) t.used.push(o.promptId);
        if (o.queueId) db.queue = db.queue.filter(q => q.id !== o.queueId);
        t.current = null;
        t.startedAt = Date.now();
        t.answeredAt = Date.now();
        t.skippedAt = null;
      }
      if (save()) return s;
      /* The phone refused the write. A story the record does not hold is not kept, so put
         everything back and say so, rather than show the word Kept over nothing. */
      db.stories.pop();
      db.queue = queue;
      if (t) Object.assign(t, was);
      dropAudio(s.id);
      throw new Error('nostore');
    };
    return blob ? putAudio(s.id, blob).then(keep) : Promise.resolve().then(keep);
  }
  function updateStory(id, patch) {
    const s = story(id); if (!s) return null;
    Object.assign(s, patch); save(); return s;
  }
  function removeStory(id) {
    db.stories = db.stories.filter(s => s.id !== id);
    save();
    return dropAudio(id);
  }
  function played(id) { const s = story(id); if (s) { s.plays++; save(); } }
  function react(id, personId) {
    const s = story(id); if (!s) return;
    const last = s.reactions[s.reactions.length - 1];
    if (last && last.personId === personId && Date.now() - last.at < 3000) return;
    s.reactions.push({ personId, at: Date.now() });
    db.settings.reactAs = personId; save();
  }
  function addMoment(id, t, note) {
    const s = story(id); if (!s) return;
    s.moments.push({ t: Math.round(t * 10) / 10, note: (note || '').trim() });
    s.moments.sort((a, b) => a.t - b.t); save();
  }
  function removeMoment(id, i) { const s = story(id); if (s) { s.moments.splice(i, 1); save(); } }
  function addTag(id, type, label) {
    const s = story(id); if (!s) return;
    label = label.trim().slice(0, 32); if (!label) return;
    if (s.tags.some(t => t.type === type && t.label.toLowerCase() === label.toLowerCase())) return;
    s.tags.push({ type, label }); save();
  }
  function removeTag(id, i) { const s = story(id); if (s) { s.tags.splice(i, 1); save(); } }

  /** A sealed story stays shut until its date. This is a promise kept by the app,
      not encryption, and the app says so wherever it is offered. */
  function sealed(s, now) {
    if (s.visibility !== 'sealed' || !s.sealUntil) return false;
    return new Date(s.sealUntil + 'T00:00:00').getTime() > (now || Date.now());
  }
  /** Marked sealed, but the date has come and gone. */
  function sealOpened(s) {
    return s.visibility === 'sealed' && !!s.sealUntil && !sealed(s);
  }

  /* ------------------------------------------------------- the threads -- */
  function threads() {
    const map = {};
    for (const s of db.stories) {
      for (const t of s.tags) {
        const k = t.type + '|' + t.label.toLowerCase();
        if (!map[k]) map[k] = { type: t.type, label: t.label, ids: [] };
        map[k].ids.push(s.id);
      }
    }
    return Object.values(map).sort((a, b) => b.ids.length - a.ids.length || a.label.localeCompare(b.label));
  }
  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) return stories();
    return stories().filter(s => {
      const t = teller(s.tellerId);
      const hay = [s.question, s.label, s.title, s.notes, t ? t.name : '',
                   s.tags.map(x => x.label).join(' '),
                   s.moments.map(m => m.note).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  /* ------------------------------------------------------- reminders ---- */
  /** Twelve weeks of ritual reminders, recomputed and re-sent on every app open.
      Everything is generated first and the soonest sixty kept, so a sixth teller
      is not silently dropped off the end of the plan. */
  const CAP = 60;
  function schedule() {
    const out = [];
    for (const t of db.tellers) {
      if (!t.consent) continue;
      /* The slot they have already answered is not worth a reminder. */
      let at = Math.max(nextRitual(t), nextDue(t));
      for (let i = 0; i < 12; i++) {
        out.push({ at, title: 'A question for ' + t.name,
                   body: 'Hand ' + t.name + ' the phone when you are both sitting down. One question, a few minutes, kept in their own voice.' });
        /* Stepping a week is not adding 604800000: a clock that goes back in October would
           move every reminder after it to two in the afternoon. Ask for the next slot instead. */
        at = nextRitual(t, at);
      }
    }
    return out.sort((a, b) => a.at - b.at).slice(0, CAP).map((n, i) => ({ id: i + 1, at: n.at, title: n.title, body: n.body }));
  }

  /* ------------------------------------------------------- the export --- */
  const CRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  function crc32(b) {
    let c = -1;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }
  /** A stored (uncompressed) zip. Audio is already compressed, so this costs nothing. */
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const lh = new Uint8Array(30 + name.length);
      const v = new DataView(lh.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0, true);
      v.setUint16(8, 0, true); v.setUint16(10, dosTime, true); v.setUint16(12, dosDate, true);
      v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
      v.setUint16(26, name.length, true); v.setUint16(28, 0, true);
      lh.set(name, 30);
      parts.push(lh, data);
      const ch = new Uint8Array(46 + name.length);
      const c = new DataView(ch.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint16(8, 0, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      ch.set(name, 46);
      central.push(ch);
      offset += lh.length + data.length;
    }
    let cdLen = 0;
    for (const c of central) cdLen += c.length;
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdLen, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  function extFor(mime) {
    if (!mime) return 'bin';
    if (mime.indexOf('webm') >= 0) return 'webm';
    if (mime.indexOf('ogg') >= 0) return 'ogg';
    if (mime.indexOf('mp4') >= 0 || mime.indexOf('aac') >= 0) return 'm4a';
    if (mime.indexOf('mpeg') >= 0) return 'mp3';
    if (mime.indexOf('wav') >= 0) return 'wav';
    return 'bin';
  }
  /** A file name safe piece of a sentence, cut back to a whole word rather than mid syllable. */
  function slug(s, n) {
    n = n || 40;
    const t = (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (t.length <= n) return t;
    const cut = t.slice(0, n), back = cut.lastIndexOf('-');
    return (back > n / 2 ? cut.slice(0, back) : cut).replace(/-$/, '');
  }
  /** who said it, then what it was about, then the id. Both halves are cut separately so a
      long name cannot push the subject out of the file name altogether. */
  const audioName = (t, s) => [slug(t ? t.name : '', 22), slug(s.label || s.question, 30) || 'story']
    .filter(Boolean).join('-');

  function manifest(list) {
    return {
      archive: 'Heirloom',
      family: db.family,
      exported: new Date().toISOString(),
      note: 'Audio files are named in the stories list below. A story whose file is null had no recording left on the phone when this was written. Nothing here was uploaded anywhere; this file was written on the device that made the recordings.',
      tellers: db.tellers.map(t => ({
        id: t.id, name: t.name, relation: t.relation, born: t.birthYear, place: t.place,
        packs: t.packs, ritual: t.ritual,
        consentGiven: t.consent ? new Date(t.consent.at).toISOString() : null
      })),
      people: db.people.map(p => ({ id: p.id, name: p.name, role: p.role })),
      stories: list.map(s => {
        const t = teller(s.tellerId);
        return {
          id: s.id, tellerId: s.tellerId, promptId: s.promptId, label: s.label,
          file: 'audio/' + audioName(t, s) + '-' + s.id + '.' + extFor(s.mime),
          teller: t ? t.name : '', question: s.question, title: s.title || s.label || null,
          recorded: new Date(s.at).toISOString(), seconds: Math.round(s.dur), mime: s.mime,
          visibility: s.visibility, sealedUntil: s.sealUntil,
          tags: s.tags, moments: s.moments, notes: s.notes, plays: s.plays,
          askedBy: s.askedBy ? (person(s.askedBy) || {}).name || null : null,
          reactions: (s.reactions || []).map(r => ({ by: (person(r.personId) || {}).name || null, at: new Date(r.at).toISOString() }))
        };
      })
    };
  }

  /** Everything, in one zip: a JSON manifest, a plain readme and the audio.
      The readme is written last, once the audio is gathered, so its count is the number of
      recordings actually in the folder rather than the number of stories in the record. */
  function exportArchive(list) {
    list = list || stories().slice().reverse();
    const m = manifest(list);
    const enc = new TextEncoder();
    const audio = [];
    return list.reduce((chain, s, i) => chain.then(() => getAudio(s.id).then(b => {
      if (!b) return;
      return b.arrayBuffer().then(ab => { audio.push({ name: m.stories[i].file, data: new Uint8Array(ab), i: i }); });
    })), Promise.resolve()).then(() => {
      const have = new Set(audio.map(a => a.i));
      /* A manifest that names a file the zip does not hold sends somebody looking for it.
         The story stays, with its question and its tags; only the promise of a file goes. */
      m.stories.forEach((x, i) => { if (!have.has(i)) x.file = null; });
      const n = audio.length;
      const readme =
        'HEIRLOOM ARCHIVE\n\n' +
        (db.family ? db.family + '\n' : '') +
        'Exported ' + longDate(Date.now()) + '\n\n' +
        'This folder holds ' + n + ' recording' + (n === 1 ? '' : 's') +
        ' and a manifest that says who told each one, which question it answers, when it\n' +
        'was recorded and how it was tagged. The audio files play in any media player.\n\n' +
        (n < list.length
          ? 'Some stories in the manifest have no audio file here. Their recordings were no longer on\nthe phone this was exported from; the questions, tags and notes are still kept below.\n\n'
          : '') +
        'Keep a copy somewhere that is not a phone.\n\n' +
        m.stories.map((s, i) => (i + 1) + '. ' + s.teller + ': ' + s.question + '\n   ' +
          (have.has(i) ? s.file : '(no recording in this export)')).join('\n\n') + '\n';
      return zip([{ name: 'manifest.json', data: enc.encode(JSON.stringify(m, null, 2)) },
                  { name: 'README.txt', data: enc.encode(readme) }]
                 .concat(audio.map(a => ({ name: a.name, data: a.data }))));
    });
  }

  function exportStory(id) {
    const s = story(id); if (!s) return Promise.resolve(null);
    const t = teller(s.tellerId);
    return getAudio(id).then(b => b && {
      blob: b,
      name: audioName(t, s) + '.' + extFor(s.mime)
    });
  }

  /* ------------------------------------------------------- bringing it back */
  function mimeFor(name) {
    const e = (name.split('.').pop() || '').toLowerCase();
    return { webm: 'audio/webm', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav' }[e] || 'application/octet-stream';
  }
  /** Reads a zip's central directory. Stored entries are sliced; deflated ones are inflated. */
  function unzip(buf) {
    const b = new Uint8Array(buf), v = new DataView(buf);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('notzip');
    const count = v.getUint16(eocd + 10, true);
    let off = v.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const entries = [];
    for (let i = 0; i < count; i++) {
      if (v.getUint32(off, true) !== 0x02014b50) throw new Error('notzip');
      const method = v.getUint16(off + 10, true);
      const csize = v.getUint32(off + 20, true), usize = v.getUint32(off + 24, true);
      const nlen = v.getUint16(off + 28, true), xlen = v.getUint16(off + 30, true), clen = v.getUint16(off + 32, true);
      const lho = v.getUint32(off + 42, true);
      const name = dec.decode(b.subarray(off + 46, off + 46 + nlen));
      const lnlen = v.getUint16(lho + 26, true), lxlen = v.getUint16(lho + 28, true);
      const start = lho + 30 + lnlen + lxlen;
      entries.push({ name, method, data: b.subarray(start, start + csize), usize });
      off += 46 + nlen + xlen + clen;
    }
    return Promise.all(entries.map(e => {
      if (e.method === 0) return Promise.resolve({ name: e.name, bytes: e.data });
      if (e.method === 8 && typeof DecompressionStream === 'function') {
        return new Response(new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw')))
          .arrayBuffer().then(ab => ({ name: e.name, bytes: new Uint8Array(ab) }));
      }
      return Promise.reject(new Error('method'));
    }));
  }
  /**
   * Brings a Heirloom export back into this phone. Stories already here (by id) are left alone,
   * tellers and listeners are matched by id or name, the audio goes back into IndexedDB.
   * Resolves { stories, tellers, people, skipped }.
   */
  function importArchive(buf) {
    return unzip(buf).then(files => {
      const mf = files.find(f => f.name === 'manifest.json');
      if (!mf) throw new Error('notheirloom');
      let m;
      try { m = JSON.parse(new TextDecoder().decode(mf.bytes)); } catch (e) { throw new Error('notheirloom'); }
      if (!m || m.archive !== 'Heirloom' || !Array.isArray(m.stories)) throw new Error('notheirloom');
      const out = { stories: 0, tellers: 0, people: 0, skipped: 0 };
      if (!db.family && m.family) db.family = String(m.family).slice(0, 46);
      const byName = (list, name) => list.find(x => x.name.toLowerCase() === String(name || '').toLowerCase());
      for (const p of m.people || []) {
        if (!p || !p.name) continue;
        if (!(p.id && person(p.id)) && !byName(db.people, p.name)) {
          db.people.push({ id: p.id && !person(p.id) ? p.id : uid('p'), name: String(p.name).slice(0, 32), role: p.role === 'keeper' ? 'keeper' : 'listener' });
          out.people++;
        }
      }
      const tellerFor = mt => {
        if (!mt) return null;
        let t = (mt.id && teller(mt.id)) || byName(db.tellers, mt.name);
        if (t) return t;
        t = {
          id: mt.id && !teller(mt.id) ? mt.id : uid('t'), name: String(mt.name || 'Unknown').slice(0, 40),
          relation: String(mt.relation || '').slice(0, 30), birthYear: validYear(mt.born), place: String(mt.place || '').slice(0, 40),
          packs: Array.isArray(mt.packs) ? mt.packs.filter(x => Content.PACKS.some(p => p.id === x)) : [],
          consent: mt.consentGiven ? { at: Date.parse(mt.consentGiven) || Date.now(), note: '' } : null,
          ritual: { day: mt.ritual && typeof mt.ritual.day === 'number' ? mt.ritual.day : 0,
                    time: mt.ritual && /^\d\d:\d\d$/.test(mt.ritual.time || '') ? mt.ritual.time : '15:00' },
          startedAt: Date.now(), current: null, used: [], skipped: [], answeredAt: null
        };
        db.tellers.push(t); out.tellers++;
        return t;
      };
      for (const mt of m.tellers || []) tellerFor(mt);
      const writes = [];
      for (const ms of m.stories) {
        if (!ms || !ms.question) { out.skipped++; continue; }
        if (ms.id && story(ms.id)) { out.skipped++; continue; }
        const t = tellerFor((m.tellers || []).find(x => (ms.tellerId && x.id === ms.tellerId) || x.name === ms.teller) || { name: ms.teller });
        const file = files.find(f => f.name === ms.file);
        const asked = ms.askedBy ? byName(db.people, ms.askedBy) : null;
        const s = {
          id: ms.id && !story(ms.id) ? ms.id : uid('s'), tellerId: t.id,
          promptId: ms.promptId && Content.byId(ms.promptId) ? ms.promptId : null,
          question: String(ms.question).slice(0, 300), label: String(ms.label || '').slice(0, 60),
          title: String(ms.title && ms.title !== ms.label ? ms.title : '').slice(0, 70),
          askedBy: asked ? asked.id : null,
          at: Date.parse(ms.recorded) || Date.now(), dur: Math.max(0, +ms.seconds || 0),
          mime: ms.mime || (file ? mimeFor(file.name) : 'audio/webm'), size: file ? file.bytes.length : 0,
          tags: Array.isArray(ms.tags) ? ms.tags.filter(x => x && x.label).map(x => ({ type: x.type || 'person', label: String(x.label).slice(0, 32) })) : [],
          moments: Array.isArray(ms.moments) ? ms.moments.filter(x => x && typeof x.t === 'number').map(x => ({ t: x.t, note: String(x.note || '').slice(0, 80) })) : [],
          notes: String(ms.notes || '').slice(0, 600),
          visibility: ['family', 'private', 'sealed'].indexOf(ms.visibility) >= 0 ? ms.visibility : 'family',
          sealUntil: /^\d{4}-\d\d-\d\d$/.test(ms.sealedUntil || '') ? ms.sealedUntil : null,
          plays: +ms.plays || 0,
          reactions: Array.isArray(ms.reactions) ? ms.reactions.map(r => { const p = byName(db.people, r.by); return p ? { personId: p.id, at: Date.parse(r.at) || Date.now() } : null; }).filter(Boolean) : []
        };
        if (s.promptId && t.used.indexOf(s.promptId) < 0) t.used.push(s.promptId);
        db.stories.push(s); out.stories++;
        if (file) writes.push(putAudio(s.id, new Blob([file.bytes], { type: s.mime })));
      }
      save();
      return Promise.all(writes).then(() => out);
    });
  }

  /** Erase means erase: the whole audio store goes, not only the recordings this record
      still knows the ids of. A write that landed while the record did not would otherwise
      sit in the database forever with nothing pointing at it. */
  function erase() {
    db = JSON.parse(JSON.stringify(DEFAULTS));
    localStorage.removeItem(KEY);
    return open().then(d => new Promise(res => {
      const tx = d.transaction('audio', 'readwrite');
      tx.objectStore('audio').clear();
      tx.oncomplete = res; tx.onerror = res;
    })).catch(() => {});
  }

  function onboarded(v) {
    if (v !== undefined) { db.onboarded = !!v; save(); }
    return db.onboarded;
  }
  function settings(patch) { if (patch) { Object.assign(db.settings, patch); save(); } return db.settings; }
  function family(v) { if (v !== undefined) { db.family = v.trim(); save(); } return db.family; }

  return {
    all, save, uid, onboarded, settings, family,
    tellers, teller, addTeller, updateTeller, giveConsent, removeTeller,
    people, person, addPerson, removePerson,
    current, setPrompt, skipWeek, askQuestion, queueFor, dropQuestion, tagWeights,
    stories, story, storiesOf, addStory, updateStory, removeStory, played, react,
    addMoment, removeMoment, addTag, removeTag, sealed, sealOpened, threads, search,
    getAudio, schedule, exportArchive, exportStory, importArchive, extFor, erase, validYear,
    nextRitual, nextDue, weekIndex, longDate, shortDate, relDate, dur, durWords, ymd, DAYS, MONTHS
  };
})();
