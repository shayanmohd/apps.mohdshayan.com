/* Blob store for plan images and photographs.
   Everything is normalised to baseline JPEG on the way in, which keeps storage sane and lets
   the PDF writer embed the original bytes with no re-encoding. Content addressed, so the same
   shot taken twice, or a plan reused, costs one copy. */
const Media = (() => {
  const DB_NAME = 'punchlist-media';
  const STORE = 'blobs';
  let dbp = null;
  const mem = new Map();          // fallback when IndexedDB is unavailable
  let memOnly = false;
  const urls = new Map();

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
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
    return open().then(d => {
      if (!d) return null;
      return d.transaction(STORE, mode).objectStore(STORE);
    });
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
    if (!s) { mem.set(id, rec); return { id, w, h, bytes: u8.length }; }
    await new Promise((res, rej) => {
      const r = s.put(rec);
      r.onsuccess = res;
      r.onerror = () => { mem.set(id, rec); res(); };
    });
    return { id, w, h, bytes: u8.length };
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

  async function bytes(id) {
    const r = await get(id);
    return r ? r.bytes : null;
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

  /* Deletes have to be awaited to their commit: the erase path reloads the page immediately
     afterwards, and a transaction that has not committed by then is dropped, which used to
     leave every photograph on the phone after "erase everything". */
  function committed(store, work) {
    return new Promise(res => {
      const t = store.transaction;
      t.oncomplete = t.onerror = t.onabort = () => res();
      try { work(); } catch (e) { res(); }
    });
  }

  async function del(ids) {
    const list = [].concat(ids || []).filter(Boolean);
    if (!list.length) return;
    for (const id of list) {
      mem.delete(id);
      if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
    }
    const s = await tx('readwrite');
    if (!s) return;
    await committed(s, () => { for (const id of list) s.delete(id); });
  }

  async function clear() {
    for (const u of urls.values()) URL.revokeObjectURL(u);
    urls.clear();
    mem.clear();
    const s = await tx('readwrite');
    if (!s) return;
    await committed(s, () => s.clear());
  }

  /* ── image helpers ── */

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('That image could not be read.'));
      img.src = src;
    });
  }

  function fileToImage(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => loadImage(fr.result).then(res, rej);
      fr.onerror = () => rej(new Error('That file could not be read.'));
      fr.readAsDataURL(file);
    });
  }

  function fit(w, h, max) {
    if (w <= max && h <= max) return [Math.round(w), Math.round(h)];
    const k = max / Math.max(w, h);
    return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
  }

  function canvasBytes(cv, quality) {
    const url = cv.toDataURL('image/jpeg', quality);
    const b64 = url.slice(url.indexOf(',') + 1);
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function drawTo(src, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return cv;
  }

  /** Store any drawable source as a JPEG, downscaled to `max` on the long edge. */
  async function store(src, max, quality) {
    const sw = src.naturalWidth || src.videoWidth || src.width;
    const sh = src.naturalHeight || src.videoHeight || src.height;
    const [w, h] = fit(sw, sh, max || 1600);
    const cv = drawTo(src, w, h);
    return putBytes(canvasBytes(cv, quality || .72), w, h);
  }

  async function storeCanvas(cv, quality) {
    return putBytes(canvasBytes(cv, quality || .8), cv.width, cv.height);
  }

  async function fromFile(file, max, quality) {
    const img = await fileToImage(file);
    return store(img, max, quality);
  }

  /* ── perspective correction ──
     Solves the homography that maps the output rectangle back onto the four picked corners,
     then inverse maps every output pixel with bilinear sampling. */
  function solve8(A, b) {
    const n = 8;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-12) return null;
      const t = M[c]; M[c] = M[piv]; M[piv] = t;
      const d = M[c][c];
      for (let k = c; k <= n; k++) M[c][k] /= d;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c];
        if (!f) continue;
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map(row => row[n]);
  }

  /** src = [[x,y] x4] in image pixels, clockwise from top left. */
  function homography(dst, src) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [X, Y] = dst[i], [x, y] = src[i];
      A.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]); b.push(x);
      A.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]); b.push(y);
    }
    const h = solve8(A, b);
    return h ? h.concat([1]) : null;
  }

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  /** Straighten `img` given four corners in image pixels. Returns a canvas. */
  function deskew(img, corners, maxDim) {
    const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
    const wTop = dist(corners[0], corners[1]), wBot = dist(corners[3], corners[2]);
    const hL = dist(corners[0], corners[3]), hR = dist(corners[1], corners[2]);
    let ow = Math.round(Math.max(wTop, wBot)), oh = Math.round(Math.max(hL, hR));
    ow = Math.max(32, ow); oh = Math.max(32, oh);
    const cap = maxDim || 1800;
    const k = Math.min(1, cap / Math.max(ow, oh));
    ow = Math.round(ow * k); oh = Math.round(oh * k);

    const H = homography([[0, 0], [ow, 0], [ow, oh], [0, oh]], corners);
    const scv = document.createElement('canvas');
    scv.width = sw; scv.height = sh;
    const sctx = scv.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0);
    const sd = sctx.getImageData(0, 0, sw, sh).data;

    const out = document.createElement('canvas');
    out.width = ow; out.height = oh;
    const octx = out.getContext('2d');
    const od = octx.createImageData(ow, oh);
    const o = od.data;

    if (!H) { octx.drawImage(img, 0, 0, ow, oh); return out; }

    for (let Y = 0; Y < oh; Y++) {
      for (let X = 0; X < ow; X++) {
        const w = H[6] * X + H[7] * Y + 1;
        const sx = (H[0] * X + H[1] * Y + H[2]) / w;
        const sy = (H[3] * X + H[4] * Y + H[5]) / w;
        const i = (Y * ow + X) * 4;
        if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
          o[i] = o[i + 1] = o[i + 2] = 255; o[i + 3] = 255;
          continue;
        }
        const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
        const p00 = (y0 * sw + x0) * 4, p10 = p00 + 4, p01 = p00 + sw * 4, p11 = p01 + 4;
        const a = (1 - fx) * (1 - fy), b2 = fx * (1 - fy), c = (1 - fx) * fy, d = fx * fy;
        o[i]     = sd[p00]     * a + sd[p10]     * b2 + sd[p01]     * c + sd[p11]     * d;
        o[i + 1] = sd[p00 + 1] * a + sd[p10 + 1] * b2 + sd[p01 + 1] * c + sd[p11 + 1] * d;
        o[i + 2] = sd[p00 + 2] * a + sd[p10 + 2] * b2 + sd[p01 + 2] * c + sd[p11 + 2] * d;
        o[i + 3] = 255;
      }
    }
    octx.putImageData(od, 0, 0);
    return out;
  }

  /** Flatten a photographed drawing to something that reads like ink on paper. */
  function inkAndPaper(cv) {
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const im = ctx.getImageData(0, 0, cv.width, cv.height);
    const d = im.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      d[i] = d[i + 1] = d[i + 2] = l;
      hist[l]++;
    }
    const n = d.length / 4;
    let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.10) { hi = i; break; } }
    if (hi - lo < 24) { lo = 0; hi = 255; }
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      let v = (i - lo) / (hi - lo);
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      v = v * v * (3 - 2 * v);                       // gentle S curve: darker lines, cleaner paper
      lut[i] = Math.round(255 * Math.min(1, v * 1.06));
    }
    for (let i = 0; i < d.length; i += 4) {
      const v = lut[d[i]];
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(im, 0, 0);
    return cv;
  }

  /** A square crop of a plan around a pin, for the report's location thumbnails. */
  async function cropAround(mediaId, nx, ny, frac, px) {
    const u = await url(mediaId);
    if (!u) return null;
    /* Stored but not decodable. The caller draws the rest of the page without the crop rather
       than dying half way through a report or a defect sheet. */
    const img = await loadImage(u).catch(() => null);
    if (!img || !img.naturalWidth) return null;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const side = Math.max(80, Math.round(Math.min(iw, ih) * (frac || .28)));
    let sx = Math.round(nx * iw - side / 2), sy = Math.round(ny * ih - side / 2);
    sx = Math.max(0, Math.min(iw - side, sx));
    sy = Math.max(0, Math.min(ih - side, sy));
    const out = px || 420;
    const cv = document.createElement('canvas');
    cv.width = out; cv.height = out;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out, out);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
    /* The same survey target the app draws everywhere: hi-vis under ink, so it reads on a
       white drawing and on a photographed one. */
    const cx = (nx * iw - sx) / side * out, cy = (ny * ih - sy) / side * out;
    const r = out * .085, lw = Math.max(3, out * .013);
    const arms = [[-.17, 0, -.115, 0], [.115, 0, .17, 0], [0, -.17, 0, -.115], [0, .115, 0, .17]];
    const target = (colour, w) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (const [ax, ay, bx, by] of arms) {
        ctx.moveTo(cx + ax * out, cy + ay * out);
        ctx.lineTo(cx + bx * out, cy + by * out);
      }
      ctx.stroke();
    };
    target('#FFC400', lw * 2.6);
    target('#14161A', lw);
    return cv;
  }

  async function usage() {
    let n = 0, b = 0;
    for (const r of mem.values()) { n++; b += r.bytes.length; }
    const s = await tx('readonly');
    if (s) {
      await new Promise(res => {
        const req = s.openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return res();
          if (!mem.has(c.value.id)) { n++; b += c.value.bytes.length; }
          c.continue();
        };
        req.onerror = () => res();
      });
    }
    return { count: n, bytes: b };
  }

  return { putBytes, get, bytes, url, del, clear, store, storeCanvas, fromFile, fileToImage,
           loadImage, deskew, inkAndPaper, cropAround, canvasBytes, drawTo, fit, usage,
           get memOnly() { return memOnly; } };
})();
