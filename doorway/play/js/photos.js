/* Photographs. Captured from the camera or picked from the gallery, downscaled to a sane
   size, stored as JPEG bytes in IndexedDB and keyed from the survey record.
   Doorway has no face detection: it cannot honestly claim to find people in a picture.
   What it has instead is a blur brush you drag over anything you do not want to keep,
   applied before the photograph is ever written to storage. */
const Photos = (() => {
  const DB_NAME = 'doorway-photos';
  const STORE = 'blobs';
  const MAX = 1400;
  let dbp = null, memOnly = false;
  const mem = new Map();
  const urls = new Map();

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(res => {
      let req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (e) { memOnly = true; return res(null); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => { memOnly = true; res(null); };
      req.onblocked = () => { memOnly = true; res(null); };
    });
    return dbp;
  }

  function tx(mode) {
    return open().then(d => d ? d.transaction(STORE, mode).objectStore(STORE) : null);
  }

  function hash(u8) {
    let h = 0x811c9dc5;
    const step = Math.max(1, Math.floor(u8.length / 4096));
    for (let i = 0; i < u8.length; i += step) {
      h ^= u8[i];
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return (h >>> 0).toString(36) + '-' + u8.length.toString(36);
  }

  async function putBytes(u8, w, h) {
    const id = hash(u8);
    const rec = { id, bytes: u8, w, h, at: Date.now() };
    const s = await tx('readwrite');
    if (!s) { mem.set(id, rec); return { id, w, h }; }
    await new Promise(res => {
      const r = s.put(rec);
      r.onsuccess = res;
      r.onerror = () => { mem.set(id, rec); res(); };
    });
    return { id, w, h };
  }

  async function get(id) {
    if (!id) return null;
    if (mem.has(id)) return mem.get(id);
    const s = await tx('readonly');
    if (!s) return null;
    return new Promise(res => {
      const r = s.get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
  }

  async function url(id) {
    if (!id) return null;
    if (urls.has(id)) return urls.get(id);
    const r = await get(id);
    if (!r) return null;
    const u = URL.createObjectURL(new Blob([r.bytes], { type: 'image/jpeg' }));
    urls.set(id, u);
    return u;
  }

  async function base64(id) {
    const r = await get(id);
    if (!r) return null;
    let s = '';
    const b = r.bytes;
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return btoa(s);
  }

  async function putBase64(b64) {
    try {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const img = await loadImage(URL.createObjectURL(new Blob([u8], { type: 'image/jpeg' })));
      return putBytes(u8, img.naturalWidth, img.naturalHeight);
    } catch (e) { return null; }
  }

  async function del(ids) {
    const list = [].concat(ids || []).filter(Boolean);
    const s = await tx('readwrite');
    for (const id of list) {
      mem.delete(id);
      if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
      if (s) try { s.delete(id); } catch (e) {}
    }
  }

  async function clear() {
    for (const u of urls.values()) URL.revokeObjectURL(u);
    urls.clear(); mem.clear();
    const s = await tx('readwrite');
    if (s) try { s.clear(); } catch (e) {}
  }

  async function usage() {
    let n = 0, b = 0;
    for (const r of mem.values()) { n++; b += r.bytes.length; }
    const s = await tx('readonly');
    if (s) await new Promise(res => {
      const req = s.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return res();
        if (!mem.has(c.value.id)) { n++; b += c.value.bytes.length; }
        c.continue();
      };
      req.onerror = () => res();
    });
    return { count: n, bytes: b };
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('That image could not be read.'));
      img.src = src;
    });
  }

  function fit(w, h, max) {
    if (w <= max && h <= max) return [Math.round(w), Math.round(h)];
    const k = max / Math.max(w, h);
    return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
  }

  /* A working copy the blur brush can paint on before anything is stored. */
  function draft(src) {
    const sw = src.naturalWidth || src.videoWidth || src.width;
    const sh = src.naturalHeight || src.videoHeight || src.height;
    const [w, h] = fit(sw, sh, MAX);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return cv;
  }

  async function fromFile(file) {
    const fr = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('That file could not be read.'));
      r.readAsDataURL(file);
    });
    return draft(await loadImage(fr));
  }

  /* Square mosaic over a round brush footprint. Destructive on purpose: the pixels are
     gone before the JPEG is written, so there is nothing to recover from storage. */
  function blur(cv, x, y, radius) {
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const r = Math.max(8, radius);
    const x0 = Math.max(0, Math.floor(x - r)), y0 = Math.max(0, Math.floor(y - r));
    const x1 = Math.min(cv.width, Math.ceil(x + r)), y1 = Math.min(cv.height, Math.ceil(y + r));
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const im = ctx.getImageData(x0, y0, w, h);
    const d = im.data;
    const cell = Math.max(6, Math.round(r / 2.6));
    for (let by = 0; by < h; by += cell) {
      for (let bx = 0; bx < w; bx += cell) {
        let rr = 0, gg = 0, bb = 0, n = 0;
        const mx = Math.min(bx + cell, w), my = Math.min(by + cell, h);
        for (let yy = by; yy < my; yy++) for (let xx = bx; xx < mx; xx++) {
          const i = (yy * w + xx) * 4;
          rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++;
        }
        rr = rr / n; gg = gg / n; bb = bb / n;
        for (let yy = by; yy < my; yy++) for (let xx = bx; xx < mx; xx++) {
          const px = x0 + xx, py = y0 + yy;
          if ((px - x) * (px - x) + (py - y) * (py - y) > r * r) continue;
          const i = (yy * w + xx) * 4;
          d[i] = rr; d[i + 1] = gg; d[i + 2] = bb;
        }
      }
    }
    ctx.putImageData(im, x0, y0);
  }

  function bytesOf(cv, quality) {
    const u = cv.toDataURL('image/jpeg', quality || 0.72);
    const bin = atob(u.slice(u.indexOf(',') + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function commit(cv, quality) {
    return putBytes(bytesOf(cv, quality), cv.width, cv.height);
  }

  return { draft, fromFile, blur, commit, url, base64, putBase64, del, clear, usage, loadImage,
           get memOnly() { return memOnly; } };
})();
