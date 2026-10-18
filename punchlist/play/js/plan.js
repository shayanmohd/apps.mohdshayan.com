/* The plan canvas: pan, pinch zoom, numbered pins that stay thumb sized at every zoom,
   and clustering when they crowd. Pins live in 0..1 plan coordinates so a plan can be
   re-imported at a different resolution without moving a single defect. */
const Plan = (() => {
  let stage, wrapEl, imgEl, layer;
  let iw = 0, ih = 0;
  let scale = 1, tx = 0, ty = 0, fitScale = 1;
  let pins = [], selected = null, walk = false;
  let onTap = null, onPin = null;
  let ready = false, needsFit = false;

  const pointers = new Map();
  let startDist = 0, startScale = 1, startMid = null, moved = 0, downAt = 0, panStart = null;

  function mount(els) {
    stage = els.stage; wrapEl = els.canvas; imgEl = els.img; layer = els.layer;
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('resize', () => { if (ready) { if (needsFit) draw(); else clampAndDraw(); } });
  }

  function size() { return { w: stage.clientWidth, h: stage.clientHeight }; }

  async function load(mediaId, w, h) {
    ready = false;
    const url = await Media.url(mediaId);
    if (!url) return false;
    await new Promise(res => {
      imgEl.onload = res;
      imgEl.onerror = res;
      imgEl.src = url;
    });
    if (!imgEl.naturalWidth) { imgEl.removeAttribute('src'); return false; }   // stored, but not decodable
    iw = w || imgEl.naturalWidth; ih = h || imgEl.naturalHeight;
    imgEl.width = iw; imgEl.height = ih;
    ready = true;
    fit();
    return true;
  }

  function unload() {
    ready = false;
    imgEl.removeAttribute('src');
    pins = [];
    layer.innerHTML = '';
  }

  /* The walk controls and the tab bar sit over the bottom of the stage, so the plan is
     centred in the band that is actually visible rather than in the whole element. */
  const HUD = 108;
  function fit() {
    if (!ready) return;
    const s = size();
    // a hidden stage measures 0x0; fitting against it leaves the plan at scale 0, so wait
    // for the next draw on a visible stage instead
    if (s.w < 40 || s.h < 40) { needsFit = true; return; }
    needsFit = false;
    const usableH = Math.max(120, s.h - HUD);
    fitScale = Math.min(s.w / iw, usableH / ih) * .96;
    scale = fitScale;
    tx = (s.w - iw * scale) / 2;
    ty = (usableH - ih * scale) / 2;
    draw();
  }

  function clamp() {
    const s = size();
    const minS = fitScale * .6, maxS = fitScale * 9;
    scale = Math.min(maxS, Math.max(minS, scale));
    const w = iw * scale, h = ih * scale;
    const padX = Math.min(s.w * .5, w * .5), padY = Math.min(s.h * .5, h * .5);
    tx = Math.min(s.w - padX, Math.max(padX - w, tx));
    ty = Math.min(s.h - padY, Math.max(padY - h, ty));
  }
  function clampAndDraw() { clamp(); draw(); }

  function draw() {
    if (!ready) return;
    if (needsFit) { fit(); if (needsFit) return; }
    wrapEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    drawPins();
  }

  function screenOf(nx, ny) { return { x: tx + nx * iw * scale, y: ty + ny * ih * scale }; }
  function planOf(sx, sy) { return { x: (sx - tx) / (iw * scale), y: (sy - ty) / (ih * scale) }; }

  function setPins(list, opts) {
    pins = list || [];
    const o = opts || {};
    if ('selected' in o) selected = o.selected;
    if (o.onPin) onPin = o.onPin;
    if (o.onTap) onTap = o.onTap;
    drawPins();
  }
  function select(id) { selected = id; drawPins(); }

  function drawPins() {
    if (!layer) return;
    layer.innerHTML = '';
    if (!ready || !pins.length) return;
    const s = size();
    const cell = 36;
    const buckets = new Map();
    const placed = [];
    for (const d of pins) {
      const p = screenOf(d.x, d.y);
      if (p.x < -60 || p.y < -60 || p.x > s.w + 60 || p.y > s.h + 60) continue;
      const key = Math.round(p.x / cell) + ':' + Math.round(p.y / cell);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ d, p });
    }
    for (const group of buckets.values()) {
      // the pin you just set, or just opened, never disappears into a cluster
      const picked = group.filter(g => g.d.id === selected);
      const rest = group.filter(g => g.d.id !== selected);
      placed.push(...picked);
      if (rest.length === 1 || scale > fitScale * 2.2 || (picked.length && rest.length < 2)) {
        for (const g of rest) placed.push(g);
      } else if (rest.length) {
        const group = rest;
        const mx = group.reduce((a, g) => a + g.p.x, 0) / group.length;
        const my = group.reduce((a, g) => a + g.p.y, 0) / group.length;
        const el = document.createElement('button');
        el.className = 'pin-cluster';
        el.style.left = mx + 'px';
        el.style.top = my + 'px';
        el.textContent = group.length;
        el.setAttribute('aria-label', `${group.length} defects here, zoom in`);
        el.addEventListener('click', ev => {
          ev.stopPropagation();
          zoomTo(planOf(mx, my), fitScale * 3);
        });
        layer.appendChild(el);
      }
    }
    for (const { d, p } of placed) {
      const el = document.createElement('button');
      const done = Store.isDone(d.status);
      el.className = 'pin' + (done ? ' done' : '') + (d.status === 'claimed' ? ' claim' : '') +
                     (d.id === selected ? ' is-sel' : '');
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.style.background = Store.SEV[d.severity].hex;
      if (d.status === 'claimed') el.style.color = Store.SEV[d.severity].hex;
      if (d.status === 'claimed') el.style.borderColor = Store.SEV[d.severity].hex;
      el.textContent = d.n;
      el.setAttribute('aria-label', `Defect ${d.n}, ${Store.SEV[d.severity].label}, ${Store.ST[d.status].label}`);
      el.addEventListener('click', ev => { ev.stopPropagation(); if (onPin) onPin(d); });
      layer.appendChild(el);
    }
  }

  function zoomTo(planPt, target) {
    const s = size();
    // clamp the scale before the translation is worked out, or the centring is off by the clamp
    scale = Math.min(fitScale * 9, Math.max(fitScale * .6, target));
    tx = s.w / 2 - planPt.x * iw * scale;
    ty = s.h / 2 - planPt.y * ih * scale;
    clampAndDraw();
  }

  /* ── gestures ── */
  function local(e) {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e) {
    if (!ready) return;
    if (e.target.closest('.pin, .pin-cluster')) return;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) {
      moved = 0; downAt = Date.now();
      panStart = { ...local(e), tx, ty };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      startScale = scale;
      startMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      startMid.plan = planOf(startMid.x, startMid.y);
    }
  }
  function move(e) {
    if (!ready || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      scale = startScale * (d / startDist);
      const minS = fitScale * .6, maxS = fitScale * 9;
      scale = Math.min(maxS, Math.max(minS, scale));
      tx = mid.x - startMid.plan.x * iw * scale;
      ty = mid.y - startMid.plan.y * ih * scale;
      moved = 99;
      clampAndDraw();
    } else if (panStart) {
      const p = local(e);
      const dx = p.x - panStart.x, dy = p.y - panStart.y;
      moved = Math.max(moved, Math.hypot(dx, dy));
      tx = panStart.tx + dx;
      ty = panStart.ty + dy;
      clampAndDraw();
    }
  }
  function up(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
    if (pointers.size === 1) {
      const only = [...pointers.values()][0];
      panStart = { x: only.x, y: only.y, tx, ty };
      return;
    }
    if (pointers.size > 0) return;
    const wasTap = moved < 9 && Date.now() - downAt < 500;
    panStart = null;
    if (!wasTap || !ready) return;
    const pt = planOf(p.x, p.y);
    if (pt.x < 0 || pt.y < 0 || pt.x > 1 || pt.y > 1) return;
    if (walk && onTap) onTap(pt);
  }
  function wheel(e) {
    if (!ready) return;
    e.preventDefault();
    const p = local(e);
    const before = planOf(p.x, p.y);
    scale *= e.deltaY < 0 ? 1.14 : 1 / 1.14;
    const minS = fitScale * .6, maxS = fitScale * 9;
    scale = Math.min(maxS, Math.max(minS, scale));
    tx = p.x - before.x * iw * scale;
    ty = p.y - before.y * ih * scale;
    clampAndDraw();
  }

  function walkMode(on) { walk = !!on; }
  const isReady = () => ready;

  return { mount, load, unload, fit, setPins, select, walkMode, isReady, zoomTo, screenOf, draw };
})();
