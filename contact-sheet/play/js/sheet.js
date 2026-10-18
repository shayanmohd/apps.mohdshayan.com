/* The sheet itself: thirty-six frames in six strips, the grease pencil, and the
   loupe. The loupe reads from the full frame when it has finished decoding and
   from the contact-sheet copy until then, so it is never empty under the finger. */
const Sheet = (() => {

  /** A circle drawn by a hand holding a chinagraph pencil, not by a compass. */
  function pencilPath(seed) {
    const rnd = Film.mulberry32((seed | 0) + 17);
    const cx = 100, cy = 150, rx = 84, ry = 124;
    const start = -0.7 + rnd() * 0.8;
    const end = start + Math.PI * 2 + 0.30 + rnd() * 0.45;
    const N = 46;
    const wob = 2 + ((seed | 0) % 3);
    let d = '';
    for (let i = 0; i <= N; i++) {
      const t = start + (end - start) * i / N;
      const k = 1 + Math.sin(t * wob + seed) * 0.024 + (rnd() - 0.5) * 0.014;
      const x = cx + Math.cos(t) * rx * k, y = cy + Math.sin(t) * ry * k;
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d;
  }

  function pencilSvg(seed, cls) {
    return `<svg class="pencil ${cls || ''}" viewBox="0 0 200 300" aria-hidden="true"><path d="${pencilPath(seed)}"/></svg>`;
  }

  /** Six frames from a roll, for the archive card. */
  async function strip(roll, count) {
    const out = [];
    for (let i = 0; i < (count || 6); i++) {
      const f = roll.frames[i];
      out.push(f ? (await DB.url(DB.thmKey(roll.id, f.n))) || '' : '');   // '' means clear film
    }
    return out;
  }

  /** Builds the 6 by 6 grid into `el`. */
  async function renderGrid(roll, el) {
    el.innerHTML = '';
    for (let i = 1; i <= 36; i++) {
      const f = roll.frames.find(x => x.n === i);
      const cell = document.createElement('div');
      cell.className = 'cell' + (f && f.keeper ? ' keeper' : '');
      cell.dataset.n = i;
      cell.style.setProperty('--row', String(Math.ceil(i / 6) - 1));
      const url = f ? await DB.url(DB.thmKey(roll.id, i)) : null;
      // A frame that was never shot is clear film, and clear film prints black. Never a
      // broken picture: a 12 exposure roll used to show 24 broken image icons.
      cell.innerHTML =
        (url ? `<img class="im" alt="Frame ${i}" src="${url}">` : `<div class="im blank"></div>`) +
        (f && f.keeper ? pencilSvg(i) : '') +
        `<div class="reb"><span class="spro"></span><span class="no">${i}</span></div>`;
      if (!f) cell.classList.add('unshot');
      el.appendChild(cell);
    }
  }

  /** Keeps the whole sheet on one screen where the screen allows it. */
  function fitGrid(el, scroller, reserve) {
    if (!el || !scroller) return;
    const availH = scroller.clientHeight - (reserve || 150);
    const availW = scroller.clientWidth - 40;
    const cellH = Math.max(28, (availH - 8 * 5) / 6 - 7);   // rebate strip takes 7
    const byH = cellH / 1.5 * 6 + 4 * 5;
    el.style.maxWidth = Math.max(180, Math.min(availW, byH)) + 'px';
    el.style.marginLeft = 'auto';
    el.style.marginRight = 'auto';
  }

  /* --- the loupe --- */
  const MAG = 3.4;
  const ready = new Map();      // key -> decoded full frame
  const pending = new Map();    // key -> promise, so a fast finger asks once

  function fullFor(roll, n) {
    const key = roll.id + ':' + n;
    if (ready.has(key)) return Promise.resolve(ready.get(key));
    if (pending.has(key)) return pending.get(key);
    const p = DB.url(DB.frmKey(roll.id, n)).then(url => {
      if (!url) return null;
      return new Promise(res => {
        const im = new Image();
        im.onload = () => { ready.set(key, im); res(im); };
        im.onerror = () => res(null);
        im.src = url;
      });
    }).finally(() => pending.delete(key));
    pending.set(key, p);
    return p;
  }
  function forget() { ready.clear(); pending.clear(); }

  function attachLoupe(grid, loupe, canvas, getRoll) {
    const ctx = canvas.getContext('2d');
    let live = false, pid = null, startX = 0, startY = 0, moved = false, timer = null, current = null;

    function cellAt(x, y) {
      const el = document.elementFromPoint(x, y);
      const cell = el && el.closest ? el.closest('.cell') : null;
      if (!cell || !grid.contains(cell)) return null;
      const img = cell.querySelector('img.im');
      if (!img || !img.src) return null;
      return { cell, img, n: Number(cell.dataset.n), rect: img.getBoundingClientRect() };
    }

    function draw(hit, x, y) {
      const D = canvas.width;
      ctx.fillStyle = '#0B0A09';
      ctx.fillRect(0, 0, D, D);
      const roll = getRoll();
      const key = roll ? roll.id + ':' + hit.n : null;
      const cached = key && ready.get(key);
      const src = cached || hit.img;
      const nw = src.naturalWidth || src.width;
      if (!nw) return;
      const scale = nw / hit.rect.width;
      const cssRegion = (loupe.clientWidth || 156) / MAG;
      const sw = cssRegion * scale;
      const sx = (x - hit.rect.left) * scale - sw / 2;
      const sy = (y - hit.rect.top) * scale - sw / 2;
      ctx.imageSmoothingEnabled = true;
      try { ctx.drawImage(src, sx, sy, sw, sw, 0, 0, D, D); } catch (e) {}
    }

    /* The loupe is fixed, so the shell's insets do not move it: clamp it out from under
       the status bar and the navigation bar by hand. */
    const inset = name => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name);
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    };
    function place(x, y) {
      const w = loupe.offsetWidth || 156;
      const sat = inset('--sat'), sab = inset('--sab');
      const left = Math.max(6, Math.min(window.innerWidth - w - 6, x - w / 2));
      const top = Math.max(sat + 6, Math.min(window.innerHeight - sab - w - 6, y - w - 26));
      loupe.style.left = left + 'px';
      loupe.style.top = top + 'px';
    }

    function show(x, y) {
      const hit = cellAt(x, y);
      if (!hit) return;
      current = hit;
      live = true;
      loupe.hidden = false;
      place(x, y);
      draw(hit, x, y);
      const roll = getRoll();
      if (roll) fullFor(roll, hit.n).then(im => {
        if (im && live && current && current.n === hit.n) draw(current, x, y);
      });
    }

    function hide() {
      live = false; current = null; loupe.hidden = true;
      clearTimeout(timer); timer = null;
    }

    grid.addEventListener('pointerdown', e => {
      if (pid !== null) return;
      pid = e.pointerId; startX = e.clientX; startY = e.clientY; moved = false;
      try { grid.setPointerCapture(pid); } catch (err) {}
      timer = setTimeout(() => { if (!moved) { Sound.tick(); show(e.clientX, e.clientY); } }, 170);
    });

    grid.addEventListener('pointermove', e => {
      if (e.pointerId !== pid) return;
      if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) moved = true;
      if (!live) { if (moved) { clearTimeout(timer); timer = null; } return; }
      const hit = cellAt(e.clientX, e.clientY);
      if (hit) { current = hit; place(e.clientX, e.clientY); draw(hit, e.clientX, e.clientY); }
    });

    function end(e) {
      if (e.pointerId !== pid) return;
      const wasLive = live;
      clearTimeout(timer); timer = null;
      try { grid.releasePointerCapture(pid); } catch (err) {}
      pid = null;
      hide();
      if (!wasLive && !moved) {
        const hit = cellAt(e.clientX, e.clientY);
        if (hit && grid.__onOpen) grid.__onOpen(hit.n);
      }
    }
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);
  }

  return { pencilPath, pencilSvg, renderGrid, fitGrid, attachLoupe, strip, forget };
})();
