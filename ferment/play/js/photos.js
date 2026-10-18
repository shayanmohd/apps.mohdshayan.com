/* Journal photographs. Thumbnails live in IndexedDB on this device, beside the notebook.
   They are never put in localStorage, because a year of jar photos does not fit there. */

const Photos = (() => {
  const NAME = 'ferment-photos', STORE = 'thumbs', VER = 1;
  const cache = new Map();
  let opening = null;

  function open() {
    if (opening) return opening;
    opening = new Promise(resolve => {
      let req;
      try { req = indexedDB.open(NAME, VER); }
      catch (e) { resolve(null); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return opening;
  }

  function tx(mode) {
    return open().then(d => (d ? d.transaction(STORE, mode).objectStore(STORE) : null));
  }

  function put(id, dataUrl) {
    cache.set(id, dataUrl);
    return tx('readwrite').then(s => new Promise(res => {
      if (!s) return res(false);
      const r = s.put(dataUrl, id);
      r.onsuccess = () => res(true);
      r.onerror = () => res(false);
    }));
  }

  function get(id) {
    if (!id) return Promise.resolve(null);
    if (cache.has(id)) return Promise.resolve(cache.get(id));
    return tx('readonly').then(s => new Promise(res => {
      if (!s) return res(null);
      const r = s.get(id);
      r.onsuccess = () => { if (r.result) cache.set(id, r.result); res(r.result || null); };
      r.onerror = () => res(null);
    }));
  }

  function del(id) {
    cache.delete(id);
    return tx('readwrite').then(s => new Promise(res => {
      if (!s) return res(false);
      const r = s.delete(id);
      r.onsuccess = () => res(true);
      r.onerror = () => res(false);
    }));
  }

  function keys() {
    return tx('readonly').then(s => new Promise(res => {
      if (!s) return res([]);
      const r = s.getAllKeys();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    }));
  }

  function clear() {
    cache.clear();
    return tx('readwrite').then(s => new Promise(res => {
      if (!s) return res(false);
      const r = s.clear();
      r.onsuccess = () => res(true);
      r.onerror = () => res(false);
    }));
  }

  /** Throws away anything no batch or culture still refers to. */
  function sweep(liveIds) {
    const live = new Set(liveIds);
    return keys().then(ks => Promise.all(ks.filter(k => !live.has(k)).map(del)));
  }

  function size() {
    return tx('readonly').then(s => new Promise(res => {
      if (!s) return res({ n: 0, bytes: 0 });
      const r = s.getAll();
      r.onsuccess = () => {
        const v = r.result || [];
        res({ n: v.length, bytes: v.reduce((a, b) => a + (b ? b.length : 0), 0) * 0.75 });
      };
      r.onerror = () => res({ n: 0, bytes: 0 });
    }));
  }

  /* A restored backup carries the notebook but not the photographs, which live in this
     device's own IndexedDB. Rather than a broken image, those slots get a drawn jar. */
  const MISSING = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150">' +
    '<rect width="120" height="150" fill="#F0E7D5"/>' +
    '<g transform="translate(38 43)" fill="none" stroke="#A4501B" stroke-opacity="0.42" ' +
    'stroke-width="1.7" stroke-linejoin="round">' +
    '<path d="M9 15c0 4-7 5.5-7 13v22a11 11 0 0 0 11 11h18a11 11 0 0 0 11-11V28c0-7.5-7-9-7-13z"/>' +
    '<rect x="8" y="3" width="28" height="7.4" rx="3"/></g></svg>');

  /** Fill an <img> once the record arrives, without blocking the render. */
  function attach(img, id) {
    if (!img) return;
    const blank = () => { img.src = MISSING; img.classList.add('is-blank'); img.classList.remove('is-loading'); };
    if (!id) { blank(); return; }
    if (cache.has(id)) { img.src = cache.get(id); img.classList.remove('is-blank', 'is-loading'); return; }
    img.src = MISSING;
    img.classList.add('is-loading');
    get(id).then(d => {
      img.classList.remove('is-loading');
      if (d) { img.src = d; img.classList.remove('is-blank'); }
      else blank();
    });
  }

  /** Downscale a video frame or an image element to a journal thumbnail. */
  function fromSource(src, w, h, maxEdge) {
    const max = maxEdge || 900;
    const scale = Math.min(1, max / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    c.getContext('2d').drawImage(src, 0, 0, cw, ch);
    return c.toDataURL('image/jpeg', 0.74);
  }

  function fromFile(file, maxEdge) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => { try { res(fromSource(im, im.naturalWidth, im.naturalHeight, maxEdge)); } catch (e) { rej(e); } };
        im.onerror = () => rej(new Error('unreadable image'));
        im.src = fr.result;
      };
      fr.onerror = () => rej(new Error('unreadable file'));
      fr.readAsDataURL(file);
    });
  }

  return { put, get, del, keys, clear, sweep, size, attach, fromSource, fromFile };
})();

window.Photos = Photos;
