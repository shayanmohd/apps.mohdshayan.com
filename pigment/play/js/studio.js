/* Pigment. The studio surface.

   Everything a painter does becomes one entry in an append-only log: which brush,
   which paint, how much water, and the points with the milliseconds between them.
   That log is the painting's file format, its undo history and its timelapse, all
   at once. Reopening a painting replays it through the simulation, which is why a
   whole painting is a few kilobytes rather than a few megabytes. */

const Studio = (() => {

  const TICK = 33;            // one simulation step, in milliseconds of painting time
  const CELL = 2.05;          // canvas pixels per simulation cell, before clamping
  const MAXCELLS = 50000;
  const MASSU = 3.0;
  const WATERU = 0.145;
  const SPACING = 0.34;
  const MAXGAP = 25000;       // longest pause replayed, in ms

  let cv, ctx, sim, sc = null;         // sc: scratch canvas at grid resolution
  let tex = null, texCtx = null;
  let gw = 0, gh = 0, dispW = 0, dispH = 0, dpr = 1;
  let paper = null, size = null, seed = 1;

  let ops = [], clock = 0, dur = 0;
  let undoStack = [], redoStack = [];

  let tool = 'paint', brush = Data.BRUSHES[1], water = 0.7, colorRef = { p: 'ultramarine' };
  let moisture = false, tiltOn = false;

  let stroke = null, queue = [], raf = 0, lastFrame = 0, acc = 0;
  let onChange = null, onDry = null;
  /* Replaying a log runs across many timeouts. If the painter walks out halfway
     through and opens another sheet, the old replay would otherwise keep stamping
     its strokes into the new sheet's simulation, which it really did. Every replay
     carries the generation it started in and stops the moment that is stale. */
  let openGen = 0;
  let recActive = false, recCancel = false;
  let wasWet = false;
  let buzzAt = 0;

  /* --------------------------------------------------------------- geometry */

  function layout(cvEl, hostW, hostH) {
    cv = cvEl; ctx = cv.getContext('2d', { alpha: false });
    const ratio = size.ratio;
    let w = hostW, h = w / ratio;
    if (h > hostH) { h = hostH; w = h * ratio; }
    dispW = Math.floor(w); dispH = Math.floor(h);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = dispW + 'px'; cv.style.height = dispH + 'px';
    cv.width = Math.round(dispW * dpr); cv.height = Math.round(dispH * dpr);
    ctx.imageSmoothingEnabled = true;
  }

  function makeGrid() {
    let g = Math.max(1, CELL);
    gw = Math.round(dispW / g); gh = Math.round(dispH / g);
    while (gw * gh > MAXCELLS) { g += 0.25; gw = Math.round(dispW / g); gh = Math.round(dispH / g); }
    gw = Math.max(40, gw); gh = Math.max(40, gh);
  }

  function makeTexture() {
    tex = document.createElement('canvas');
    tex.width = cv.width; tex.height = cv.height;
    texCtx = tex.getContext('2d');
    const W = tex.width, H = tex.height;
    const img = texCtx.createImageData(W, H);
    const d = img.data;
    const rnd = Sim.rng(seed ^ 0x9e37);
    const base = Math.max(2.0, (4.6 - paper.grain * 2.0) * dpr);
    const oct = [[base, 0.58], [base * 0.42, 0.42]].map(([sc, wt]) => {
      const nw = Math.ceil(W / sc) + 2, nh = Math.ceil(H / sc) + 2;
      const g = new Float32Array(nw * nh);
      for (let i = 0; i < g.length; i++) g[i] = rnd();
      return { sc, wt, g, nw };
    });
    const amp = 0.032 + paper.tooth * 0.050;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let n = 0;
        for (const o of oct) {
          const fy = y / o.sc, y0 = fy | 0, ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
          const fx = x / o.sc, x0 = fx | 0, tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
          const a = o.g[y0 * o.nw + x0], b = o.g[y0 * o.nw + x0 + 1];
          const c = o.g[(y0 + 1) * o.nw + x0], e = o.g[(y0 + 1) * o.nw + x0 + 1];
          n += o.wt * ((a + (b - a) * sx) * (1 - sy) + (c + (e - c) * sx) * sy);
        }
        // biased so the sheet reads as scattered tooth rather than an even fog
        const q = (y * W + x) << 2;
        d[q] = 0; d[q + 1] = 0; d[q + 2] = 0;
        d[q + 3] = Math.max(0, Math.min(255, n * n * n * amp * 340));
      }
    }
    texCtx.putImageData(img, 0, 0);
  }

  /* ----------------------------------------------------------------- colour */

  function resolveColour(ref) {
    if (ref && ref.m) {
      const m = ref.m;
      return { K: m.K, S: m.S, gran: m.gran, stain: m.stain, name: m.name, hex: m.hex };
    }
    const p = Data.BY_ID[(ref && ref.p) || 'ultramarine'] || Data.PIGMENTS[0];
    return { K: p.K, S: p.S, gran: p.gran, stain: p.stain, name: p.name, hex: p.hex };
  }

  /* ------------------------------------------------------------------ paint */

  function stampDab(cx, cy, r, ang, pressure, st) {
    const b = st.brush;
    const tooth = st.water < 0.27 ? Math.min(1, (0.27 - st.water) / 0.27) : 0;
    const mode = st.tool === 'paint' ? 'paint' : st.tool;
    // Masking fluid comes off an applicator in a blob, and it dries with a hard
    // rubbery edge. It is never as fine as the brush that laid it.
    if (mode === 'mask') r *= 1.6;
    const wAmt = b.water * st.water * WATERU * st.wload *
                 (mode === 'water' ? 1.5 : mode === 'paint' ? 1 : 0);
    // Water dilutes. Over the slider's range a brush carries roughly ten times more
    // pigment per unit of paper at the dry end than at the flooded end, which is
    // what makes the slider the actual instrument of this app.
    const mass = mode === 'paint'
      ? b.load * MASSU * Math.pow(1 - st.water * 0.97, 1.5) * st.load * pressure : 0;

    const spec = {
      cx, cy, ang, soft: mode === 'mask' ? Math.min(b.soft, 0.22) : b.soft, mode,
      water: wAmt * pressure, mass,
      K: st.col.K, Sc: st.col.S, gran: st.col.gran, stain: st.col.stain,
      tooth: (mode === 'paint' || mode === 'water') ? tooth : 0
    };

    if (b.shape === 'fan') {
      const n = b.tufts, half = r;
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1) - 0.5) * 2;
        const j = (st.rnd() - 0.5) * 0.35;
        spec.cx = cx + Math.cos(ang) * (t + j) * half;
        spec.cy = cy + Math.sin(ang) * (t + j) * half;
        spec.rx = r * 0.16 * (0.5 + st.rnd()); spec.ry = spec.rx;
        spec.tooth = Math.max(spec.tooth, 0.35);
        Sim.dab(sim, spec);
      }
      return;
    }
    if (b.shape === 'sponge') {
      for (let i = 0; i < b.dabs; i++) {
        const a = st.rnd() * 6.2832, d = Math.sqrt(st.rnd()) * r;
        spec.cx = cx + Math.cos(a) * d; spec.cy = cy + Math.sin(a) * d;
        spec.rx = r * (0.10 + st.rnd() * 0.20); spec.ry = spec.rx * (0.6 + st.rnd() * 0.8);
        spec.ang = st.rnd() * 3.14;
        spec.tooth = Math.max(spec.tooth, 0.5);
        Sim.dab(sim, spec);
      }
      return;
    }
    if (b.shape === 'flat') {
      spec.rx = r * (0.94 + st.rnd() * 0.12); spec.ry = r * b.aspect;
      spec.ang = ang + (b.angle === undefined ? Math.PI / 2 : b.angle);
      Sim.dab(sim, spec);
      return;
    }
    // No two touches of a brush are quite the same, but a round brush is round.
    spec.rx = r * (0.95 + st.rnd() * 0.10);
    spec.ry = r * (0.95 + st.rnd() * 0.10);
    Sim.dab(sim, spec);
    if (b.wob > 0.1) {                 // a rigger's hair wanders
      spec.cx = cx + (st.rnd() - 0.5) * r * 1.2;
      spec.cy = cy + (st.rnd() - 0.5) * r * 1.2;
      spec.rx = r * 0.55; spec.ry = r * 0.55;
      Sim.dab(sim, spec);
    }
  }

  function applySegment(st, x0, y0, p0, x1, y1, p1) {
    const b = st.brush;
    const gscale = gw / dispW;
    const baseR = b.r * gscale;
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const ang = dist > 0.01 ? Math.atan2(dy, dx) : st.ang;
    st.ang = ang;
    const rMid = baseR * (0.5 + 0.5 * ((p0 + p1) / 2));
    const spacing = Math.max(0.7, rMid * SPACING);
    const n = Math.max(1, Math.ceil(dist / spacing));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const px = x0 + dx * t, py = y0 + dy * t;
      let pr = p0 + (p1 - p0) * t;
      if (b.taper) {                     // a rigger thins out as it speeds up
        const sp = Math.min(1, dist / (baseR * 6));
        pr *= 1 - sp * 0.45;
      }
      const r = baseR * (0.45 + 0.55 * pr);
      stampDab(px, py, r, ang, 0.25 + 0.75 * pr, st);
      st.load *= 1 - b.dry * (1 + (1 - st.water) * 2.2);
      st.wload *= 1 - b.dry * 0.55;
      if (st.load < 0.03) st.load = 0.03;
      if (st.wload < 0.05) st.wload = 0.05;
    }
    if (st.tool === 'paint' && st.water < 0.2 && dist > rMid * 2 && Date.now() - buzzAt > 260) {
      buzzAt = Date.now();
      if (window.Native && Native.vibrate) { try { Native.vibrate(9, 42); } catch (e) {} }
    }
  }

  /* ------------------------------------------------------------- the strokes */

  function newStrokeState(t, o, w, ref, sseed) {
    return {
      brush: Data.BRUSH_BY_ID[t] || Data.BRUSHES[1], tool: o, water: w,
      col: resolveColour(ref), load: 1, wload: 1, ang: 0,
      rnd: Sim.rng(sseed)
    };
  }

  function begin(x, y, pressure, tnow) {
    if (stroke) return;
    const st = newStrokeState(brush.id, tool, water, colorRef, (seed + ops.length * 7919) >>> 0);
    stroke = {
      st, x, y, p: pressure, t: tnow,
      rec: { k: 's', t: Math.round(clock), b: brush.id, o: tool, w: Math.round(water * 100) / 100,
             c: JSON.parse(JSON.stringify(colorRef)), p: [] }
    };
    pushUndo();
    redoStack.length = 0;
    pushPoint(stroke, x, y, pressure, 0);
    applySegment(st, x, y, pressure, x, y, pressure);
    queue.length = 0;
    kick();
  }

  function pushPoint(s, x, y, pr, dt) {
    s.rec.p.push(Math.round(x * 4), Math.round(y * 4), Math.round(pr * 100), Math.round(dt));
  }

  function move(x, y, pressure, tnow) {
    if (!stroke) return;
    queue.push(x, y, pressure, tnow);
  }

  function end() {
    if (!stroke) return;
    drainQueue();
    const toolUsed = stroke.rec.o;
    let kept = false;
    if (stroke.rec.p.length >= 4) {
      ops.push(stroke.rec);
      dur = Math.max(dur, clock);
      kept = true;
    } else {
      undoStack.pop();
    }
    stroke = null;
    if (onChange) onChange(kept ? { type: 'stroke', tool: toolUsed } : null);
  }

  function drainQueue() {
    if (!stroke || !queue.length) return;
    for (let i = 0; i < queue.length; i += 4) {
      const x = queue[i], y = queue[i + 1], p = queue[i + 2], t = queue[i + 3];
      const dt = Math.max(0, Math.min(400, t - stroke.t));
      applySegment(stroke.st, stroke.x, stroke.y, stroke.p, x, y, p);
      pushPoint(stroke, x, y, p, dt);
      stroke.x = x; stroke.y = y; stroke.p = p; stroke.t = t;
    }
    queue.length = 0;
  }

  /* ------------------------------------------------------------------ replay */

  function replayAll(list, onProgress, done) {
    let idx = 0, cur = null, tvirt = 0;
    let seedIdx = 0;
    const myGen = openGen;
    const step = () => {
      if (myGen !== openGen) return;
      const t0 = performance.now();
      while (performance.now() - t0 < 14) {
        if (!cur) {
          if (idx >= list.length) {
            clock = Math.max(tvirt, dur);
            done();
            return;
          }
          const op = list[idx++];
          if (op.k === 'x') { Sim.clearMask(sim); tvirt = Math.max(tvirt, op.t || 0); continue; }
          if (op.k === 'g') { sim.gx = op.x; sim.gy = op.y; tvirt = Math.max(tvirt, op.t || 0); continue; }
          const gap = Math.min(MAXGAP, Math.max(0, (op.t || 0) - tvirt));
          let n = Math.floor(gap / TICK);
          while (n-- > 0 && performance.now() - t0 < 14) { Sim.step(sim); tvirt += TICK; }
          if (n > 0) { idx--; continue; }
          tvirt = Math.max(tvirt, op.t || 0);
          cur = { op, st: newStrokeState(op.b, op.o, op.w, op.c, (seed + seedIdx++ * 7919) >>> 0),
                  i: 0, x: 0, y: 0, p: 0, first: true, acc: 0 };
        }
        const P = cur.op.p;
        while (cur.i < P.length) {
          const x = P[cur.i] / 4, y = P[cur.i + 1] / 4, pr = P[cur.i + 2] / 100, dt = P[cur.i + 3];
          if (cur.first) { applySegment(cur.st, x, y, pr, x, y, pr); cur.first = false; }
          else applySegment(cur.st, cur.x, cur.y, cur.p, x, y, pr);
          cur.x = x; cur.y = y; cur.p = pr; cur.i += 4;
          cur.acc += dt; tvirt += dt;
          while (cur.acc >= TICK) { Sim.step(sim); cur.acc -= TICK; }
          if (performance.now() - t0 >= 14) break;
        }
        if (cur.i >= P.length) cur = null;
      }
      if (onProgress) onProgress(Math.min(0.99, idx / Math.max(1, list.length)));
      setTimeout(step, 0);
    };
    step();
  }

  /* ------------------------------------------------------------------- frame */

  function blit(box) {
    if (!box) return;
    const sx = cv.width / gw, sy = cv.height / gh;
    const x0 = Math.max(0, box.x - 1), y0 = Math.max(0, box.y - 1);
    const x1 = Math.min(gw, box.x + box.w + 1), y1 = Math.min(gh, box.y + box.h + 1);
    const dx = Math.floor(x0 * sx), dy = Math.floor(y0 * sy);
    const dw = Math.ceil((x1 - x0) * sx), dh = Math.ceil((y1 - y0) * sy);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sc, x0, y0, x1 - x0, y1 - y0, dx, dy, dw, dh);
    if (!moisture) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(tex, dx, dy, dw, dh, dx, dy, dw, dh);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function render() {
    const box = Sim.composite(sim, moisture ? 1 : 0);
    if (!box) return;
    const scx = sc.getContext('2d');
    scx.putImageData(sim.img, 0, 0, box.x, box.y, box.w, box.h);
    blit(box);
  }

  function frame(ts) {
    raf = 0;
    const now = ts || performance.now();
    let dt = lastFrame ? now - lastFrame : TICK;
    lastFrame = now;
    if (dt > 200) dt = 200;

    drainQueue();
    acc += dt;
    let steps = 0;
    while (acc >= TICK && steps < 3) { Sim.step(sim); acc -= TICK; clock += TICK; steps++; }
    if (acc > TICK * 3) acc = TICK;
    render();

    const wet = sim.wetCells > 0;
    if (wasWet && !wet && !stroke) {
      wasWet = false;
      if (onDry) onDry();
      if (window.Native && Native.vibrate) { try { Native.vibrate(16, 70); } catch (e) {} }
    }
    if (wet) wasWet = true;

    if (stroke || !Sim.isSettled(sim)) kick();
    else { lastFrame = 0; acc = 0; }
  }

  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  /* ------------------------------------------------------------------- undo */

  function pushUndo() {
    undoStack.push({ snap: Sim.snapshot(sim), n: ops.length, clock });
    if (undoStack.length > 10) undoStack.shift();
  }

  function undo() {
    if (!undoStack.length) return false;
    const u = undoStack.pop();
    const removed = ops.splice(u.n);
    redoStack.push({ ops: removed, snap: Sim.snapshot(sim), clock });
    if (redoStack.length > 10) redoStack.shift();
    Sim.restore(sim, u.snap);
    clock = u.clock;
    render(); kick();
    if (onChange) onChange();
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    const r = redoStack.pop();
    undoStack.push({ snap: Sim.snapshot(sim), n: ops.length, clock });
    for (const o of r.ops) ops.push(o);
    Sim.restore(sim, r.snap);
    clock = r.clock;
    render(); kick();
    if (onChange) onChange();
    return true;
  }

  /* ------------------------------------------------------------------ public */

  function open(rec, host, cvEl, cbs, onReady, onProgress) {
    openGen++;
    recCancel = false; recActive = false;
    paper = Data.PAPER_BY_ID[rec.paper] || Data.PAPERS[0];
    size = Data.SIZE_BY_ID[rec.size] || Data.SIZES[1];
    seed = rec.seed >>> 0 || 1;
    ops = (rec.ops || []).slice();
    dur = rec.dur || 0;
    clock = 0;
    undoStack = []; redoStack = [];
    stroke = null; queue.length = 0; acc = 0; lastFrame = 0; wasWet = false;
    onChange = cbs.onChange; onDry = cbs.onDry;

    layout(cvEl, host.w, host.h);
    makeGrid();
    makeTexture();
    sim = Sim.create(gw, gh, paper, seed);
    sc = document.createElement('canvas'); sc.width = gw; sc.height = gh;
    Sim.ensureImage(sim, sc.getContext('2d'));
    Sim.markAllDirty(sim);
    render();

    attach(cvEl);

    if (ops.length) {
      replayAll(ops, onProgress, () => {
        // the sheet a painter comes back to is a dry one
        let guard = 2600;
        while (!Sim.isSettled(sim) && guard-- > 0) Sim.step(sim);
        Sim.markAllDirty(sim);
        render();
        onReady();
      });
    } else onReady();
  }

  function attach(el) {
    if (el._pigmentBound) return;
    el._pigmentBound = true;
    const pos = e => {
      const r = el.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width * gw, (e.clientY - r.top) / r.height * gh];
    };
    // A stylus reports real pressure. A finger does not, whatever number it sends.
    const press = e => (e.pointerType === 'pen' && e.pressure > 0) ? Math.max(0.08, e.pressure) : 0.62;
    el.addEventListener('pointerdown', e => {
      if (el._locked) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      const [x, y] = pos(e);
      begin(x, y, press(e), performance.now());
    });
    el.addEventListener('pointermove', e => {
      if (!stroke) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) { const [x, y] = pos(ev); move(x, y, press(ev), performance.now()); }
      kick();
    });
    const up = e => { if (stroke) { e.preventDefault(); end(); kick(); } };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  /* export ---------------------------------------------------------------- */

  function flatten(withPaper, scale) {
    const s = scale || 1;
    const out = document.createElement('canvas');
    out.width = Math.round(cv.width * s); out.height = Math.round(cv.height * s);
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = true;
    const box = Sim.composite(sim, 0);
    if (box) sc.getContext('2d').putImageData(sim.img, 0, 0, box.x, box.y, box.w, box.h);
    else { Sim.markAllDirty(sim); const b2 = Sim.composite(sim, 0);
           if (b2) sc.getContext('2d').putImageData(sim.img, 0, 0, b2.x, b2.y, b2.w, b2.h); }
    o.drawImage(sc, 0, 0, out.width, out.height);
    if (withPaper) {
      o.globalCompositeOperation = 'multiply';
      o.drawImage(tex, 0, 0, out.width, out.height);
      o.globalCompositeOperation = 'source-over';
    }
    Sim.markAllDirty(sim); render();
    return out;
  }

  function thumb(px) {
    const c = flatten(true, 1);
    const out = document.createElement('canvas');
    const r = size.ratio;
    out.width = Math.round(px * r); out.height = px;
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = true;
    o.drawImage(c, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.72);
  }

  /* Timelapse. The op log is replayed into the live canvas while a MediaRecorder
     watches it, so the video is the painting happening, not a slideshow. */
  function estimateSteps(gapCap) {
    let t = 0, total = 0;
    for (const op of ops) {
      const gap = Math.min(gapCap, Math.max(0, (op.t || 0) - t));
      total += Math.floor(gap / TICK);
      t = Math.max(t, op.t || 0);
      if (op.k === 's') { let a = 0; for (let i = 3; i < op.p.length; i += 4) { a += op.p[i]; t += op.p[i]; }
                          total += Math.floor(a / TICK); }
    }
    return total + 40;
  }

  function estimateSeconds(speed) {
    const gapCap = speed === 'slow' ? 3000 : speed === 'fast' ? 600 : 1400;
    const perFrame = speed === 'slow' ? 2 : speed === 'fast' ? 8 : 4;
    return Math.max(2, Math.round(estimateSteps(gapCap) / perFrame / 25));
  }

  function cancelRecord() { if (recActive) recCancel = true; }

  function record(speed, onTick) {
    return new Promise((resolve, reject) => {
      if (!ops.length) { reject(new Error('nothing to replay')); return; }
      if (typeof MediaRecorder === 'undefined' || !cv.captureStream) {
        reject(new Error('no recorder')); return;
      }
      const gapCap = speed === 'slow' ? 3000 : speed === 'fast' ? 600 : 1400;
      const perFrame = speed === 'slow' ? 2 : speed === 'fast' ? 8 : 4;
      const total = estimateSteps(gapCap);

      const savedOps = ops.slice(), savedClock = clock;
      const savedUndo = undoStack, savedRedo = redoStack;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      Sim.reset(sim); render();

      const stream = cv.captureStream(25);
      let mime = '';
      for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
      }
      // The finished file has to cross the JS bridge as one base64 string, so the
      // bitrate is scaled to the length of the replay: a short study stays crisp,
      // a very long painting stays a file the bridge can actually carry.
      const secs = Math.max(2, Math.round(total / perFrame / 25));
      const bps = Math.max(500000, Math.min(2000000, Math.round(6 * 8 * 1048576 / secs)));
      let rec;
      try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: bps }
                                               : { videoBitsPerSecond: bps }); }
      catch (e) { reject(e); return; }
      const chunks = [];
      recActive = true; recCancel = false;
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        ops = savedOps; clock = savedClock; undoStack = savedUndo; redoStack = savedRedo;
        recActive = false;
        Sim.reset(sim);
        replayAll(ops, null, () => {
          let guard = 2600; while (!Sim.isSettled(sim) && guard-- > 0) Sim.step(sim);
          Sim.markAllDirty(sim); render();
        });
        if (recCancel) {
          recCancel = false;
          const e = new Error('cancelled'); e.cancelled = true; reject(e); return;
        }
        resolve(new Blob(chunks, { type: mime || 'video/webm' }));
      };
      rec.start();

      let idx = 0, cur = null, tvirt = 0, doneSteps = 0, seedIdx = 0, tail = 0;
      const myGen = openGen;
      const tick = () => {
        if (recCancel || myGen !== openGen) {
          recCancel = true;
          try { rec.stop(); } catch (e) { recActive = false; reject(e); }
          return;
        }
        let budget = perFrame;
        while (budget > 0) {
          if (cur) {
            const P = cur.op.p;
            let progressed = false;
            while (cur.i < P.length && budget > 0) {
              const x = P[cur.i] / 4, y = P[cur.i + 1] / 4, pr = P[cur.i + 2] / 100, dt = P[cur.i + 3];
              if (cur.first) { applySegment(cur.st, x, y, pr, x, y, pr); cur.first = false; }
              else applySegment(cur.st, cur.x, cur.y, cur.p, x, y, pr);
              cur.x = x; cur.y = y; cur.p = pr; cur.i += 4; cur.acc += dt; tvirt += dt;
              progressed = true;
              while (cur.acc >= TICK && budget > 0) { Sim.step(sim); cur.acc -= TICK; budget--; doneSteps++; }
            }
            if (cur.i >= P.length) { cur = null; }
            else if (!progressed) break;
            continue;
          }
          if (idx >= ops.length) {
            if (tail < 90 && !Sim.isSettled(sim)) { Sim.step(sim); tail++; budget--; doneSteps++; continue; }
            render();
            setTimeout(() => { try { rec.stop(); } catch (e) { reject(e); } }, 260);
            return;
          }
          const op = ops[idx++];
          if (op.k === 'x') { Sim.clearMask(sim); continue; }
          if (op.k === 'g') { sim.gx = op.x; sim.gy = op.y; continue; }
          const gap = Math.min(gapCap, Math.max(0, (op.t || 0) - tvirt));
          let n = Math.floor(gap / TICK);
          while (n-- > 0 && budget > 0) { Sim.step(sim); tvirt += TICK; budget--; doneSteps++; }
          if (n > 0) { idx--; break; }
          tvirt = Math.max(tvirt, op.t || 0);
          cur = { op, st: newStrokeState(op.b, op.o, op.w, op.c, (seed + seedIdx++ * 7919) >>> 0),
                  i: 0, x: 0, y: 0, p: 0, first: true, acc: 0 };
        }
        render();
        if (onTick) onTick(Math.min(0.99, doneSteps / total));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* controls -------------------------------------------------------------- */

  let lastTilt = [0, 0];
  function setTilt(gx, gy, log) {
    if (!sim) return;
    sim.gx = gx; sim.gy = gy;
    if (log && (Math.abs(gx - lastTilt[0]) > 0.12 || Math.abs(gy - lastTilt[1]) > 0.12)) {
      lastTilt = [gx, gy];
      ops.push({ k: 'g', t: Math.round(clock), x: Math.round(gx * 100) / 100, y: Math.round(gy * 100) / 100 });
    }
    kick();
  }
  function tiltEnabled(v) { tiltOn = v; if (!v) setTilt(0, 0, false); }

  return {
    open, attach,
    setTool: v => { tool = v; }, getTool: () => tool,
    setBrush: v => { brush = Data.BRUSH_BY_ID[v] || brush; }, getBrush: () => brush,
    setWater: v => { water = v; }, getWater: () => water,
    setColour: ref => { colorRef = ref; }, getColour: () => resolveColour(colorRef),
    getColourRef: () => colorRef,
    setMoisture: v => { moisture = v; if (sim) { Sim.markAllDirty(sim); render(); } },
    isMoisture: () => moisture,
    setTilt, tiltEnabled, isTilt: () => tiltOn,
    removeMask: () => {
      if (!sim || !sim.maskCells) return false;
      pushUndo(); ops.push({ k: 'x', t: Math.round(clock) });
      Sim.clearMask(sim); render(); if (onChange) onChange(); return true;
    },
    hasMask: () => !!(sim && sim.maskCells),
    undo, redo,
    canUndo: () => undoStack.length > 0, canRedo: () => redoStack.length > 0,
    strokeCount: () => ops.filter(o => o.k === 's').length,
    ops: () => ops, duration: () => dur,
    isBusy: () => !!stroke,
    isWet: () => !!(sim && sim.wetCells > 0),
    wetFraction: () => sim ? sim.wetCells / sim.N : 0,
    flatten, thumb, record, estimateSeconds, cancelRecord,
    isRecording: () => recActive,
    grid: () => ({ gw, gh, dispW, dispH }),
    stop: () => { if (raf) cancelAnimationFrame(raf); raf = 0; },
    /* Leaving a painting for good: stop the frame loop and orphan any replay still
       running, so nothing from this sheet can reach the next one. */
    abandon: () => { openGen++; recCancel = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    kick
  };
})();

window.Studio = Studio;
