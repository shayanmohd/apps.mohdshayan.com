'use strict';
// EchoDepths procedural chambers.
// Grid of 0.5 m cells -> cellular-automata cave -> guaranteed spawn->exit connectivity ->
// marching-squares wall segments (what pings reveal, what the body collides with) ->
// Dijkstra "sound fields" so pings and predator hearing travel AROUND corners, not through rock.
const Procgen = (() => {
  const CELL = 0.5;
  const ARCH = {
    nursery: { w: 34, h: 46, fill: 0.36, iters: 5, pillars: 0, predators: [], otoliths: 2, currents: 0, size: 'small', label: 'nursery' },
    hall:    { w: 44, h: 60, fill: 0.40, iters: 5, pillars: 2, predators: ['bristlemaw'], otoliths: 3, currents: 1, size: 'large', label: 'hall' },
    tangle:  { w: 44, h: 62, fill: 0.43, iters: 4, pillars: 16, predators: ['bristlemaw', 'angler'], otoliths: 3, currents: 1, size: 'medium', label: 'tangle' },
    throat:  { w: 40, h: 74, fill: 0.57, iters: 3, pillars: 0, predators: ['angler', 'angler', 'bristlemaw'], otoliths: 4, currents: 2, size: 'small', label: 'throat' },
    vault:   { w: 52, h: 64, fill: 0.34, iters: 5, pillars: 5, predators: ['warden', 'angler'], otoliths: 5, currents: 1, size: 'large', label: 'vault' },
  };

  function generate(seed, archName, tier) {
    const A = ARCH[archName] || ARCH.hall;
    const rng = U.mulberry32(seed);
    const w = A.w, h = A.h, N = w * h;
    let grid = new Uint8Array(N);
    const idx = (x, y) => y * w + x;
    const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;

    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      grid[idx(x, y)] = (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) ? 1 : (rng() < A.fill ? 1 : 0);
    for (let it = 0; it < A.iters; it++) {
      const g2 = new Uint8Array(N);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; c += inb(xx, yy) ? grid[idx(xx, yy)] : 1; }
        g2[idx(x, y)] = (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) ? 1 : c >= 5 ? 1 : c <= 3 ? 0 : grid[idx(x, y)];
      }
      grid = g2;
    }
    const fillDisk = (cx, cy, r, v) => { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (x >= 2 && y >= 2 && x < w - 2 && y < h - 2 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) grid[idx(x, y)] = v; };
    for (let p = 0; p < A.pillars; p++) fillDisk(3 + Math.floor(rng() * (w - 6)), 6 + Math.floor(rng() * (h - 12)), 1 + rng() * 1.8, 1);

    const spawnC = { x: Math.round(w / 2 + (rng() - 0.5) * w * 0.4), y: 5 };
    const exitC = { x: Math.round(w / 2 + (rng() - 0.5) * w * 0.5), y: h - 6 };
    fillDisk(spawnC.x, spawnC.y, 2.6, 0); fillDisk(exitC.x, exitC.y, 2.3, 0);

    function flood(sx, sy) {
      const seen = new Uint8Array(N); const q = [idx(sx, sy)]; seen[q[0]] = 1; let head = 0;
      while (head < q.length) { const i = q[head++]; const x = i % w, y = (i / w) | 0; const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]]; for (const [dx, dy] of nb) { const xx = x + dx, yy = y + dy; if (!inb(xx, yy)) continue; const j = idx(xx, yy); if (seen[j] || grid[j]) continue; seen[j] = 1; q.push(j); } }
      return { seen, count: q.length };
    }
    function carvePath(ax, ay, bx, by, width) {
      let x = ax, y = ay; let guard = 0;
      while ((x !== bx || y !== by) && guard++ < 4000) {
        fillDisk(x, y, width, 0);
        const r = rng();
        if (r < 0.55) { if (Math.abs(bx - x) > Math.abs(by - y)) x += Math.sign(bx - x); else y += Math.sign(by - y); }
        else if (r < 0.8) { x += Math.sign(bx - x) || (rng() < 0.5 ? 1 : -1); }
        else { y += Math.sign(by - y) || (rng() < 0.5 ? 1 : -1); }
        x = U.clamp(x, 3, w - 4); y = U.clamp(y, 3, h - 4);
      }
      fillDisk(bx, by, width, 0);
    }
    let fl = flood(spawnC.x, spawnC.y);
    if (!fl.seen[idx(exitC.x, exitC.y)]) { carvePath(spawnC.x, spawnC.y, exitC.x, exitC.y, 1.6); fl = flood(spawnC.x, spawnC.y); }
    // throats want winding side-tunnels; every chamber wants enough open volume
    const extraTunnels = archName === 'throat' ? 3 : (fl.count < N * 0.22 ? 2 : 0);
    for (let t = 0; t < extraTunnels; t++) { carvePath(spawnC.x, spawnC.y, 4 + Math.floor(rng() * (w - 8)), 6 + Math.floor(rng() * (h - 12)), 1.3 + rng() * 0.6); }
    if (extraTunnels) fl = flood(spawnC.x, spawnC.y);
    for (let i = 0; i < N; i++) if (!grid[i] && !fl.seen[i]) grid[i] = 1; // seal unreachable pockets
    const reach = fl.seen;

    // ---- marching squares on cell centers ----
    const segs = []; // {ax,ay,bx,by,air,mx,my}
    const P = (u, v) => [(u + 0.5) * CELL, (v + 0.5) * CELL];
    const jit = (kind, x, y) => { const j1 = (U.hash2(x, y, kind) - 0.5) * 0.14, j2 = (U.hash2(x + 7, y + 13, kind + 5) - 0.5) * 0.14; return [j1, j2]; };
    // edge midpoints with consistent jitter: top of (x,y) == horizontal edge id (x,y); bottom == (x,y+1); left == vertical (x,y); right == (x+1,y)
    const top = (x, y) => { const [j1, j2] = jit(1, x, y); const [px, py] = P(x + 0.5, y); return [px + j1, py + j2]; };
    const bot = (x, y) => top(x, y + 1);
    const lef = (x, y) => { const [j1, j2] = jit(2, x, y); const [px, py] = P(x, y + 0.5); return [px + j1, py + j2]; };
    const rig = (x, y) => lef(x + 1, y);
    const TABLE = { 1: [['L', 'B']], 2: [['B', 'R']], 3: [['L', 'R']], 4: [['T', 'R']], 5: [['T', 'R'], ['L', 'B']], 6: [['T', 'B']], 7: [['T', 'L']], 8: [['T', 'L']], 9: [['T', 'B']], 10: [['T', 'L'], ['B', 'R']], 11: [['T', 'R']], 12: [['L', 'R']], 13: [['B', 'R']], 14: [['L', 'B']] };
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const a = grid[idx(x, y)], b = grid[idx(x + 1, y)], c = grid[idx(x + 1, y + 1)], d = grid[idx(x, y + 1)];
      const cs = a * 8 + b * 4 + c * 2 + d; if (!cs || cs === 15) continue;
      const pt = { T: top(x, y), B: bot(x, y), L: lef(x, y), R: rig(x, y) };
      const corners = [[a, x, y], [b, x + 1, y], [c, x + 1, y + 1], [d, x, y + 1]];
      for (const [e1, e2] of TABLE[cs]) {
        const [ax, ay] = pt[e1], [bx, by] = pt[e2]; const mx = (ax + bx) / 2, my = (ay + by) / 2;
        let air = -1, best = 1e9;
        for (const [solid, cx, cy] of corners) { if (solid) continue; const [px, py] = P(cx, cy); const dd = (px - mx) ** 2 + (py - my) ** 2; if (dd < best) { best = dd; air = idx(cx, cy); } }
        segs.push({ ax, ay, bx, by, mx, my, air, b: 0 });
      }
    }
    // spatial buckets for collision
    const buckets = new Array(N); for (let i = 0; i < N; i++) buckets[i] = null;
    segs.forEach((s, i) => { const cx = U.clamp(Math.floor(s.mx / CELL), 0, w - 1), cy = U.clamp(Math.floor(s.my / CELL), 0, h - 1); const k = idx(cx, cy); (buckets[k] || (buckets[k] = [])).push(i); });

    const spawn = { x: (spawnC.x + 0.5) * CELL, y: (spawnC.y + 0.5) * CELL };
    const exit = { x: (exitC.x + 0.5) * CELL, y: (exitC.y + 0.5) * CELL };
    const ch = { w, h, cell: CELL, grid, reach, segs, buckets, spawn, exit, size: A.size, name: archName, label: A.label, predators: [], otoliths: [], currents: [], wm: w * CELL, hm: h * CELL };
    ch.cellOf = (x, y) => { const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); return inb(cx, cy) ? cy * w + cx : -1; };
    ch.center = (i) => ({ x: ((i % w) + 0.5) * CELL, y: (((i / w) | 0) + 0.5) * CELL });

    // ---- placement using the sound field from spawn ----
    const dsp = distField(ch, spawn.x, spawn.y);
    const reachable = []; for (let i = 0; i < N; i++) if (reach[i] && dsp[i] < 1e9) reachable.push(i);
    const pickCell = (pred) => { const c = reachable.filter(pred); return c.length ? c[Math.floor(rng() * c.length)] : null; };
    const narrowness = (i) => { const x = i % w, y = (i / w) | 0; let s = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; s += inb(xx, yy) ? grid[idx(xx, yy)] : 1; } return s; };
    const exitD = (i) => { const c = ch.center(i); return U.dist(c.x, c.y, exit.x, exit.y); };
    let preds = A.predators.slice();
    if (tier >= 1 && (archName === 'hall' || archName === 'tangle')) preds.push('bristlemaw');
    if (tier >= 2 && archName === 'throat') preds.push('bristlemaw');
    if (archName === 'nursery') preds.push('bristlemaw:dormant');
    const used = [];
    const farFrom = (i, r) => used.every(u => { const a = ch.center(i), b = ch.center(u); return U.dist(a.x, a.y, b.x, b.y) > r; });
    for (const p of preds) {
      const [type, flag] = p.split(':'); let cell = null;
      if (type === 'bristlemaw') cell = pickCell(i => dsp[i] > (flag ? 13 : 9) && dsp[i] < 40 && exitD(i) > 3 && farFrom(i, 3)) || pickCell(i => dsp[i] > 6);
      else if (type === 'angler') { const nar = reachable.filter(i => dsp[i] > 7 && exitD(i) > 2.5 && narrowness(i) >= 11 && farFrom(i, 3.5)); cell = nar.length ? nar[Math.floor(rng() * nar.length)] : pickCell(i => dsp[i] > 7 && farFrom(i, 3.5)); }
      else if (type === 'warden') cell = pickCell(i => exitD(i) > 4 && exitD(i) < 10 && dsp[i] > 8) || pickCell(i => dsp[i] > 8);
      if (cell == null) continue; used.push(cell); const c = ch.center(cell);
      ch.predators.push({ type, x: c.x, y: c.y, dormant: flag === 'dormant' });
    }
    for (let k = 0; k < A.otoliths + (tier >= 2 ? 1 : 0); k++) { const cell = pickCell(i => dsp[i] > 4.5 && farFrom(i, 2)); if (cell == null) break; used.push(cell); const c = ch.center(cell); ch.otoliths.push({ x: c.x, y: c.y, taken: false }); }
    for (let k = 0; k < A.currents; k++) { const cell = pickCell(i => dsp[i] > 5 && narrowness(i) <= 8 && farFrom(i, 4)); if (cell == null) break; used.push(cell); const c = ch.center(cell); const ang = rng() * U.TAU; const sp = 0.5 + rng() * 0.5; ch.currents.push({ x: c.x, y: c.y, r: 2.4 + rng() * 1.6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp }); }
    // warden patrol waypoints
    ch.waypoints = []; for (let k = 0; k < 4; k++) { const cell = pickCell(i => dsp[i] > 6 && exitD(i) < 14 && farFrom(i, 3)); if (cell != null) { used.push(cell); ch.waypoints.push(ch.center(cell)); } }
    if (!ch.waypoints.length) ch.waypoints.push({ x: exit.x, y: exit.y - 3 });
    ch.spawnField = dsp;
    return ch;
  }

  // Dijkstra over empty cells, 8-connected. Returns Float32Array of path-distance in meters (1e9 = unreachable/solid).
  function distField(ch, sx, sy) {
    const { w, h, grid } = ch; const N = w * h; const D = new Float64Array(N); D.fill(1e9);
    let s = ch.cellOf(sx, sy); if (s < 0) return D;
    if (grid[s]) { // origin inside rock (e.g., pebble on a wall): find nearest empty
      let best = -1, bd = 1e9; const sx0 = s % w, sy0 = (s / w) | 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = sx0 + dx, y = sy0 + dy; if (x < 0 || y < 0 || x >= w || y >= h) continue; const i = y * w + x; if (!grid[i] && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = i; } }
      if (best < 0) return D; s = best;
    }
    const heap = new U.Heap(); D[s] = 0; heap.push(0, s);
    const C = ch.cell, CD = ch.cell * Math.SQRT2;
    while (heap.size) {
      const [d, i] = heap.pop(); if (d > D[i]) continue;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (grid[j]) continue;
        if (dx && dy && (grid[y * w + xx] || grid[yy * w + x])) continue; // no corner cutting through rock
        const nd = d + ((dx && dy) ? CD : C); if (nd < D[j]) { D[j] = nd; heap.push(nd, j); }
      }
    }
    return D;
  }

  // circle vs wall segments: returns {x,y,hit,nx,ny}
  function collide(ch, x, y, r) {
    let hit = false, nx = 0, ny = 0;
    for (let pass = 0; pass < 2; pass++) {
      const cx = Math.floor(x / ch.cell), cy = Math.floor(y / ch.cell);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = cx + dx, yy = cy + dy; if (xx < 0 || yy < 0 || xx >= ch.w || yy >= ch.h) continue;
        const b = ch.buckets[yy * ch.w + xx]; if (!b) continue;
        for (const si of b) {
          const s = ch.segs[si]; const c = U.segClosest(x, y, s.ax, s.ay, s.bx, s.by);
          if (c.d < r) {
            let px = x - c.cx, py = y - c.cy, l = Math.hypot(px, py);
            if (l < 1e-4) { px = x - s.mx; py = y - s.my; l = Math.hypot(px, py) || 1; }
            // push toward the air side (segment's air cell) if the normal points the wrong way
            const ac = ch.center(s.air); const toAir = (ac.x - c.cx) * px + (ac.y - c.cy) * py; if (toAir < 0) { px = -px; py = -py; }
            const push = r - c.d + 0.002; x += px / l * push; y += py / l * push; hit = true; nx += px / l; ny += py / l;
          }
        }
      }
    }
    // safety: never remain inside rock
    const ci = ch.cellOf(x, y);
    if (ci < 0 || ch.grid[ci]) {
      let best = null, bd = 1e9; const cx = Math.floor(x / ch.cell), cy = Math.floor(y / ch.cell);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = cx + dx, yy = cy + dy; if (xx < 0 || yy < 0 || xx >= ch.w || yy >= ch.h) continue; const j = yy * ch.w + xx; if (ch.grid[j]) continue; const c = ch.center(j); const dd = U.dist(x, y, c.x, c.y); if (dd < bd) { bd = dd; best = c; } }
      if (best) { x = best.x; y = best.y; hit = true; }
    }
    const l = Math.hypot(nx, ny) || 1;
    return { x, y, hit, nx: nx / l, ny: ny / l };
  }

  return { generate, distField, collide, CELL, ARCH };
})();
