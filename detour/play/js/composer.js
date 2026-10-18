/* The composer. Detour has no street graph, so it does not plan a route: it chooses the next bearing
   and the next distance, from where you actually are, every time you finish a leg.

   A candidate bearing is scored on four things.
     novelty  how much of the ground it crosses you have never stood in
     grain    whether it suits the mood, and whether it lines up with the street grid you have been
              walking, which is inferred from your own trail rather than from any map
     variety  whether it repeats what the last two legs already did
     homing   how well it points back at your start, weighted by how little time is left
   Homing starts at nothing and ends at everything, which is what closes a loop without ever
   announcing that it is closing one. */
const Composer = (() => {

  const MOOD = {
    surprise: { leg: 270, spread: 0.45, turnPeak: 72, turnWidth: 78, novelty: 0.50, temp: 0.95, grid: 0.10 },
    quiet:    { leg: 340, spread: 0.30, turnPeak: 22, turnWidth: 46, novelty: 0.34, temp: 0.55, grid: 0.18 },
    lively:   { leg: 165, spread: 0.35, turnPeak: 86, turnWidth: 44, novelty: 0.30, temp: 0.70, grid: 0.34 },
    grid:     { leg: 230, spread: 0.28, turnPeak: 78, turnWidth: 60, novelty: 0.32, temp: 0.50, grid: 0.90 },
    slow:     { leg: 430, spread: 0.26, turnPeak: 14, turnWidth: 40, novelty: 0.30, temp: 0.45, grid: 0.14 }
  };
  const cfg = m => MOOD[m] || MOOD.surprise;

  /* A small deterministic generator, so a walk's shape is reproducible from its seed. */
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  /** The dominant orientation of the streets you have actually walked, in degrees 0 to 89, or null. */
  function grain(trail) {
    if (!trail || trail.length < 6) return null;
    const pts = trail.slice(-80);
    let sx = 0, sy = 0, w = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = [pts[i - 1][0], pts[i - 1][1]], b = [pts[i][0], pts[i][1]];
      const m = Store.dist(a, b);
      if (m < 12) continue;
      const th = Store.bearing(a, b) * 4 * Math.PI / 180;   // fold 90 degrees onto a full turn
      sx += Math.cos(th) * m; sy += Math.sin(th) * m; w += m;
    }
    if (w < 120) return null;
    const ang = Math.atan2(sy, sx) * 180 / Math.PI / 4;
    return ((ang % 90) + 90) % 90;
  }

  /** How new the ground along this bearing is: 1 means never stood in, 0 means walked to death. */
  function novelty(from, brg, len) {
    const step = Store.CELL_M;
    const n = Math.max(2, Math.min(16, Math.round(len / step)));
    let sum = 0;
    for (let i = 1; i <= n; i++) {
      const p = Store.project(from, brg, (len * i) / n);
      sum += 1 / (1 + Store.cellVisits(p[0], p[1]) * 1.6);
    }
    return sum / n;
  }

  /** Penalty for walking back over the trail you have just laid down. */
  function retrace(from, brg, len, trail) {
    if (!trail || trail.length < 4) return 0;
    const recent = trail.slice(-70);
    const n = 4;
    let hits = 0;
    for (let i = 1; i <= n; i++) {
      const p = Store.project(from, brg, (len * i) / n);
      let best = 1e9;
      for (let j = 0; j < recent.length; j += 2) {
        const d = Store.dist(p, [recent[j][0], recent[j][1]]);
        if (d < best) best = d;
        if (best < 18) break;
      }
      if (best < 28) hits++;
    }
    return hits / n;
  }

  function bell(x, peak, width) { return Math.exp(0 - Math.pow((x - peak) / width, 2)); }

  /**
   * The next leg.
   *   pos        [lat, lon] where you are now
   *   start      [lat, lon] where the walk began
   *   heading    the bearing of the leg you have just walked, or null on the first leg
   *   remainingS seconds left in the budget
   *   pace       metres per second, measured
   *   mood, loop, trail, blocked, seed, legIndex
   * Returns { bearing, distM, turn, closing } where turn is one of
   *   'straight' | 'left' | 'right' | 'about' | 'first' | 'home'
   */
  function nextLeg(o) {
    const c = cfg(o.mood);
    const rnd = rng((o.seed || 1) + (o.legIndex || 0) * 2654435761);
    const pos = o.pos, start = o.start;
    const paceMs = Math.min(2.0, Math.max(0.7, o.pace || 1.32));
    const budgetM = Math.max(0, (o.remainingS || 0) * paceMs);
    const dHome = start ? Store.dist(pos, start) : 0;

    /* How pressed for time we are. Walking home is never a straight line, so the budget it needs
       is padded by a third before urgency is measured against it. */
    let urgency = 0;
    if (o.loop && start) {
      const needed = dHome * 1.34 + 60;
      const slack = budgetM - needed;
      const scale = Math.max(160, budgetM * 0.5);
      urgency = Math.min(1, Math.max(0, 1 - slack / scale));
    }

    /* Leg length: the mood sets the base, the budget caps it, urgency shortens it. */
    let len = c.leg * (1 + (rnd() - 0.5) * 2 * c.spread);
    len *= 1 - 0.45 * urgency;
    len = Math.max(70, Math.min(650, len, Math.max(70, budgetM * 0.45)));
    if (urgency > 0.9 && dHome > 40) len = Math.max(70, Math.min(len, dHome));

    const homeBrg = start ? Store.bearing(pos, start) : 0;
    const g = c.grid > 0.05 ? grain(o.trail) : null;
    const blocked = o.blocked || [];

    let best = [], bestScore = -1e9;
    const cands = [];
    for (let b = 0; b < 360; b += 10) {
      if (blocked.some(x => Math.abs(Store.angDiff(x, b)) < 32)) continue;

      const delta = o.heading === null || o.heading === undefined ? null : Math.abs(Store.angDiff(o.heading, b));

      let turn;
      if (delta === null) turn = 0.7 + 0.3 * rnd();
      else {
        turn = bell(delta, c.turnPeak, c.turnWidth);
        if (delta > 150) turn *= 0.05;          // a walk that doubles back is not a walk
        else if (delta > 125) turn *= 0.35;
      }

      let gridFit = 1;
      if (g !== null) {
        const off = Math.min(...[0, 90, 180, 270].map(k => Math.abs(Store.angDiff(g + k, b))));
        gridFit = 1 - c.grid * Math.min(1, off / 42);
      }

      const nov = novelty(pos, b, len);
      const back = retrace(pos, b, len, o.trail);
      const home = (Math.cos((Store.angDiff(b, homeBrg)) * Math.PI / 180) + 1) / 2;

      const wander = c.novelty * nov + (0.62 - c.novelty * 0.5) * turn * gridFit
                   + 0.10 * rnd() - 0.30 * back;
      const score = (1 - urgency) * wander + urgency * (home * 0.92 + nov * 0.08);

      cands.push({ b, score, nov, home });
      if (score > bestScore) { bestScore = score; best = [{ b, score }]; }
    }
    if (!cands.length) {
      /* Every bearing was refused. Take a fresh one well away from the last, rather than
         `o.heading || 0 + 137`, which reads as `o.heading || 137` and handed out due north
         whenever the last leg pointed at zero. */
      const base = (typeof o.heading === 'number' ? o.heading : 0) + 137;
      return { bearing: ((base % 360) + 360) % 360, distM: Math.round(len), turn: 'about', closing: urgency > 0.85 };
    }

    let pick;
    if (urgency > 0.82) {
      pick = cands.reduce((a, b) => (b.score > a.score ? b : a));
    } else {
      // Softmax over the field, so the walk has an opinion without being predictable.
      const T = Math.max(0.08, c.temp * 0.22);
      const mx = Math.max(...cands.map(x => x.score));
      const ws = cands.map(x => Math.exp((x.score - mx) / T));
      const tot = ws.reduce((a, b) => a + b, 0);
      let r = rnd() * tot, i = 0;
      for (; i < cands.length; i++) { r -= ws[i]; if (r <= 0) break; }
      pick = cands[Math.min(i, cands.length - 1)];
    }

    // Nudge off the ten degree lattice so bearings do not read as machine output.
    const bearing = (pick.b + (rnd() - 0.5) * 8 + 360) % 360;

    let turnKind = 'first';
    if (o.heading !== null && o.heading !== undefined) {
      const d = Store.angDiff(o.heading, bearing);
      const a = Math.abs(d);
      turnKind = a < 25 ? 'straight' : a > 135 ? 'about' : d < 0 ? 'left' : 'right';
    }
    const closing = urgency > 0.82;
    if (closing) turnKind = 'home';

    return { bearing, distM: Math.round(len), turn: turnKind, closing, urgency };
  }

  /** The direct way back, for the moment somebody wants out. */
  function homeLeg(pos, start) {
    if (!start) return null;
    return { bearing: Store.bearing(pos, start), distM: Math.round(Store.dist(pos, start)), turn: 'home', closing: true };
  }

  /** How far through a leg you are, measured as displacement along the bearing rather than
      distance walked, so going round a block still counts as progress. */
  function legProgress(leg, pos) {
    const d = Store.dist(leg.from, pos);
    const b = Store.bearing(leg.from, pos);
    const along = d * Math.cos(Store.angDiff(leg.bearing, b) * Math.PI / 180);
    return { along, remaining: Math.max(0, leg.distM - along), off: d * Math.sin(Store.angDiff(leg.bearing, b) * Math.PI / 180) };
  }

  return { nextLeg, homeLeg, legProgress, grain, novelty, MOOD };
})();
