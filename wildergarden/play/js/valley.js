/* The valley scene: camera, terrain, and every living thing standing on it.
   The land fills most of the frame and everything is placed by depth, so the
   near edge of the valley is genuinely near. Terrain is cached to an offscreen
   canvas and repainted only when the light, the camera or the blight change. */
const Valley = (() => {
  const W_WORLD = Paint.WORLD_W;
  const BX = Paint.BROOK_X, BW = 340;
  const FPS = 30;

  let cv = null, ctx = null, W = 0, H = 0, DPR = 1;
  let state = null, seed = 1, hemisphere = 'north';
  let cam = { x: 0, wide: false };
  let insts = [], marks = [];
  let terrain = null, tKey = '';
  let raf = 0, last = 0, t0 = performance.now(), running = false;
  let timeOverride = null, mist = 0, onPick = null;

  /* Android reports "animations off" as prefers-reduced-motion, and a great many phones
     are set that way for battery. The valley is then drawn in full and held still at one
     pose rather than deleted: grass stands where it stands, the heron keeps its wings.
     STILL_T is mid stride in every sway cycle, so nothing is frozen at an extreme. */
  const STILL_T = 7.3;
  let motionMQ = null;
  function still() {
    if (!motionMQ && window.matchMedia) motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    return !!(motionMQ && motionMQ.matches);
  }
  /* A held frame has to be repainted by hand whenever the world under it moves. Repaints
     are coalesced onto one animation frame so a drag cannot ask for a hundred of them. */
  let pending = 0;
  function nudge() {
    if (!running || pending || !still()) return;
    pending = requestAnimationFrame(now => { pending = 0; frame(now, true); });
  }

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const BIG = { tree: 1, stag: 1, wader: 1, shrub: 1, reed: 1, fern: 1, mammal: 1, mushroom: 1 };
  const DENSITY = { tuft: 4.2, flower: 2.2, moss: 2, fern: 1.6, reed: 1.15 };

  function attach(el, pick) {
    cv = el; ctx = cv.getContext('2d', { alpha: false }); onPick = pick;
    resize();
    window.addEventListener('resize', resize);
    bindDrag();
  }

  function resize() {
    if (!cv) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    terrain = null; tKey = '';
    if (state) layout();
    frame(performance.now(), true);
  }

  /* ---------- projection ---------- */
  const scale = () => cam.wide ? W / W_WORLD : 1;
  /* Pulled back to the whole valley the land is 2480 units wide in 390 pixels, so the
     ground profile is exaggerated or the ridge reads as a bump and the wood as nothing.
     The distant hill silhouettes keep their own gentler scale: they are drawn at a fixed
     screen frequency, so exaggerating them turns rolling country into a saw. */
  const vscale = () => cam.wide ? 0.86 : 1;
  const hscale = () => clamp(0.6 + 0.4 * scale(), 0.6, 1);
  /* Relief is for landforms whose width is measured in world units and whose height is
     not: the brook's channel and the ridge's rock band. Squash 2480 units into 390 pixels
     and a shallow channel becomes a gorge and a rock band becomes a grey shoulder, because
     only their width shrank. This puts their height back in proportion. */
  const relief = () => clamp(0.34 + 0.66 * scale(), 0.34, 1);
  const horizon = () => H * (cam.wide ? 0.42 : 0.40);
  const gY = wx => horizon() + Paint.groundY(wx, 0, seed, relief()) * vscale();
  const landH = wx => Math.max(30, H - gY(wx));
  /* yf is where a thing stands in the land band: 0 at the horizon, 1 at the
     near edge of the frame. Scale grows with it, which is the whole perspective. */
  const depthY = (wx, yf) => gY(wx) + yf * landH(wx) * 1.02;
  const depthK = yf => 0.5 + yf * 1.9;
  const sx = wx => (wx - cam.x) * scale();
  const wx4 = px => px / scale() + cam.x;
  const maxCam = () => Math.max(0, W_WORLD - W / scale());

  /* The stream lies across the valley floor. Seen from far off it is a thin
     ribbon; up close it is a proper reach with two banks. */
  const BTOP = 0.30;
  /* The reach keeps its own proportions: thickness tracks how wide it is on screen. */
  /* Pulled back, the reach has to stay a ribbon. A short fat band reads as a pond,
     and a pond is not what Brookside is. */
  const bthick = () => clamp((2 * BW * scale() * 0.44 * (cam.wide ? 0.34 : 1)) / landH(BX), 0.03, 0.19);
  /* The meander was a fixed fraction of the land band, so pulled back it was two thirds
     of the ribbon's own thickness and the two banks crossed each other into a lens. It is
     a fraction of the reach instead. */
  const wob = wx => Math.min(0.026, bthick() * 0.17) * Math.sin(((wx - BX + BW) / (2 * BW)) * 7.5);
  /* The water is drawn past the reach the creatures stand in and needled out over a third
     of its length, so both ends thin away instead of meeting in two blunt points. A short
     hard taper turns the whole thing into a lens, and a lens reads as a pond, not a stream. */
  const BW_DRAW = BW * 1.45;
  const taperSpan = () => BW * 1.10;
  const taper = wx => {
    const t = Math.min(1, Math.max(0, (BW_DRAW - Math.abs(wx - BX)) / taperSpan()));
    return t * t * t * (t * (t * 6 - 15) + 10);   // smootherstep: no visible kink at either end
  };
  /* Water lies level. The bed under it rolls by more than the reach is thick, so tying the
     surface to the ground at every point made the stream swoop, and pulled back a swooping
     ribbon with two points on it reads as a pond. It is anchored at the middle of the reach
     and leans only a little with the ground. Everything standing in the water is placed off
     the same line, so a trout is never left on the bank. */
  const B_LEAN = 0.34;
  const bY = wx => gY(BX) + (gY(wx) - gY(BX)) * B_LEAN;
  const bH = () => landH(BX);
  const brookT = wx => bY(wx) + (BTOP + wob(wx) + bthick() * 0.5 * (1 - taper(wx))) * bH();
  const brookB = wx => bY(wx) + (BTOP + bthick() + wob(wx) * 1.2 - bthick() * 0.5 * (1 - taper(wx))) * bH();
  const brookY = (wx, yf) => bY(wx) + yf * bH() * 1.02;

  /* ---------- state ---------- */
  function setState(s, opts) {
    state = s;
    const set = Store.settings();
    seed = set.seed || 1; hemisphere = set.hemisphere || 'north';
    // the mist is a fade, so held still it would simply sit there hazing the valley for good
    if (opts && opts.mist) mist = still() ? 0 : 1;
    layout(); terrain = null; tKey = '';
    nudge();
  }
  function setTime(d) { timeOverride = d; terrain = null; tKey = ''; nudge(); }
  function wide(on) {
    cam.wide = on === undefined ? !cam.wide : !!on;
    cam.x = cam.wide ? 0 : clamp(cam.x, 0, maxCam());
    terrain = null; tKey = ''; layout();
    nudge();
    return cam.wide;
  }
  const isWide = () => cam.wide;
  function focus(biomeId) {
    const b = Species.biome(biomeId);
    if (!b) return;
    cam.wide = false;
    cam.x = clamp((b.x0 + b.x1) / 2 - W / 2, 0, maxCam());
    terrain = null; tKey = ''; layout();
    nudge();
  }

  /* ---------- placing everything ---------- */
  function layout() {
    insts = [];
    if (!state) return;
    for (const s of Species.LIST) {
      const st = state.species[s.id];
      if (!st || st.status !== 'resident') continue;
      const b = Species.biome(s.biome);
      const health = clamp(st.health, 0, 1);
      const dens = cam.wide ? 0.45 : 1;
      const count = Math.max(1, Math.round(s.n * (DENSITY[s.family] || 1) * dens * (0.4 + 0.6 * health)));
      const rnd = Paint.rngFrom(Paint.hash32(seed + ':' + s.id));
      const brook = s.biome === 'brook';
      for (let i = 0; i < count; i++) {
        let x, yf;
        if (brook) {
          x = BX + (rnd() - 0.5) * 2 * BW * 0.94;
          const f = s.family;
          const th = bthick();
          if (f === 'fish') yf = BTOP + th * (0.25 + rnd() * 0.55);
          else if (f === 'wader') yf = BTOP + th * 0.9;
          else if (f === 'bird' || f === 'mammal') yf = BTOP + th + 0.05 + rnd() * 0.12;
          else yf = rnd() < 0.5 ? BTOP - 0.13 + rnd() * 0.1 : BTOP + th + 0.02 + rnd() * 0.14;
        } else {
          x = b.x0 + 24 + rnd() * (b.x1 - b.x0 - 48);
          yf = Math.pow(rnd(), 0.85);
        }
        insts.push({ id: s.id, sp: s, x, yf, ph: rnd() * 6.2832, health, brook });
      }
    }
    insts.sort((a, b) => a.yf - b.yf);
  }

  /* How grey a point in the world is. Blight starts at the two ends. */
  function localBlight(wx) {
    if (!state) return 0;
    const n = state.blight / Sim.BLIGHT_CAP;
    if (n <= 0.001) return 0;
    const edge = Math.min(wx, W_WORLD - wx) / (W_WORLD * 0.5);
    return clamp(n * 1.8 - edge * 1.15, 0, 0.95);
  }

  /* ---------- terrain ---------- */
  function paintTerrain(e) {
    const c = document.createElement('canvas');
    c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
    const g = c.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawTerrain(g, e, W, H);
    return c;
  }

  function drawTerrain(g, e, w, h) {
    const hz = horizon(), sc = scale(), vs = vscale();

    const grd = g.createLinearGradient(0, 0, 0, hz + 8);
    grd.addColorStop(0, Paint.rgb(e.sky[0]));
    grd.addColorStop(0.58, Paint.rgb(e.sky[1]));
    grd.addColorStop(1, Paint.rgb(e.sky[2]));
    g.fillStyle = grd; g.fillRect(0, 0, w, hz + 10);

    if (e.night > 0.12) {
      const r = Paint.rngFrom(Paint.hash32('stars' + seed));
      g.fillStyle = '#F6F2E4';
      for (let i = 0; i < 70; i++) {
        const x = r() * w, y = r() * hz * 0.72, a = r();
        g.globalAlpha = e.night * (0.12 + a * 0.45);
        g.beginPath(); g.arc(x, y, a > 0.9 ? 1.3 : 0.85, 0, 6.2832); g.fill();
      }
      g.globalAlpha = 1;
    }

    // sun or moon
    const px = w * (0.16 + e.sunFrac * 0.7);
    const arc = Math.sin(clamp(e.sunFrac, 0, 1) * Math.PI);
    const py = hz - 24 - arc * (hz * 0.68);
    if (e.night < 0.55) {
      const r0 = 14 + (1 - arc) * 5;
      const gl = g.createRadialGradient(px, py, 0, px, py, r0 * 6);
      gl.addColorStop(0, Paint.rgba(Paint.hx('#FFF1CE'), 0.5));
      gl.addColorStop(1, Paint.rgba(Paint.hx('#FFF1CE'), 0));
      g.fillStyle = gl; g.beginPath(); g.arc(px, py, r0 * 6, 0, 6.2832); g.fill();
      g.globalAlpha = 0.92 * (1 - e.night);
      g.fillStyle = Paint.rgb(Paint.mix(Paint.hx('#FFF7E2'), e.light, 0.45));
      g.beginPath(); g.arc(px, py, r0, 0, 6.2832); g.fill();
      g.globalAlpha = 1;
    } else {
      const mx = w * 0.76, my = hz * 0.2;
      g.globalAlpha = e.night * 0.85; g.fillStyle = '#E9EBE1';
      g.beginPath(); g.arc(mx, my, 12, 0, 6.2832); g.fill();
      g.globalAlpha = e.night * 0.6; g.fillStyle = Paint.rgb(e.sky[0]);
      g.beginPath(); g.arc(mx + 5, my - 3.2, 11, 0, 6.2832); g.fill();
      g.globalAlpha = 1;
    }

    // clouds: three wide banks, each one compound path so the overlaps do not stack
    const cr = Paint.rngFrom(Paint.hash32('cloud' + seed));
    const cloudCol = Paint.rgb(Paint.mix(Paint.hx(e.season.haze), e.light, 0.5));
    for (let i = 0; i < 3; i++) {
      const bx = (cr() * 1.5 - 0.25) * w - cam.x * 0.05 * sc;
      const by = hz * (0.14 + cr() * 0.34);
      const bs = 40 + cr() * 46;
      const parts = [];
      for (let k = 0; k < 6; k++) {
        const ry = bs * (0.13 + (k % 3) * 0.045);
        parts.push([bx + (k - 2.5) * bs * 0.42, by + Math.sin(k * 1.7) * bs * 0.06, bs * (0.34 + (k % 4) * 0.09), ry]);
      }
      Paint.mass(g, parts, cloudCol, 0.16 + cr() * 0.14);
    }
    g.globalAlpha = 1;

    const hazeC = Paint.tone(e.season.haze, e, 0);
    const hs = hscale();
    layerHills(g, w, h, hz, 0.20, 82, 0.55, Paint.mix(hazeC, e.sky[2], 0.34), 'far' + seed, hs);
    layerHills(g, w, h, hz, 0.44, 50, 0.72, Paint.mix(Paint.tone(e.season.wood, e, 0), hazeC, 0.4), 'mid' + seed, hs);

    /* Both washes over the land are anchored to where the land actually starts, not to the
       horizon. Anchored at the horizon, everything the ridge climbed above it fell outside
       the gradients and was painted their first stop flat: a grey slab in the shape of the
       ridge, with a hard seam along the horizon. That is what the whole valley view kept
       looking like. */
    const step = Math.max(2, 5 * sc);
    let gTop = hz;
    for (let p = -4; p <= w + 4; p += step) gTop = Math.min(gTop, gY(wx4(p)));

    // the valley floor, which is most of the frame
    g.beginPath();
    g.moveTo(-4, h + 4);
    for (let p = -4; p <= w + 4; p += step) g.lineTo(p, gY(wx4(p)));
    g.lineTo(w + 4, h + 4); g.closePath();
    const gg = g.createLinearGradient(0, Math.min(hz - 20, gTop - 8), 0, h);
    const near = Paint.tone(e.season.grass, e, 0);
    gg.addColorStop(0, Paint.rgb(Paint.mix(near, hazeC, 0.72)));
    gg.addColorStop(0.14, Paint.rgb(Paint.mix(near, hazeC, 0.26)));
    gg.addColorStop(0.62, Paint.rgb(near));
    gg.addColorStop(1, Paint.rgb(Paint.shade(near, -0.3)));
    g.fillStyle = gg; g.fill();

    g.save();
    g.beginPath();
    g.moveTo(-4, h + 4);
    for (let p = -4; p <= w + 4; p += step) g.lineTo(p, gY(wx4(p)));
    g.lineTo(w + 4, h + 4); g.closePath();
    g.clip();

    // brush strokes across the sward, following the depth
    const tr = Paint.rngFrom(Paint.hash32('tex' + seed));
    for (let i = 0; i < 240; i++) {
      const wxx = cam.wide ? tr() * W_WORLD : cam.x - 60 + tr() * (W / sc + 120);
      const p = sx(wxx);
      if (p < -60 || p > w + 60) continue;
      const yf = tr();
      const y = depthY(wxx, yf);
      const k = depthK(yf) * Math.max(sc, 0.45);
      const lb = localBlight(wxx);
      const dry = tr() > 0.62;
      const col = Paint.tone(dry ? e.season.dry : (tr() > 0.5 ? e.season.wood : e.season.grass), e, lb);
      g.globalAlpha = 0.09 + tr() * 0.17;
      g.fillStyle = Paint.rgb(col);
      g.beginPath();
      g.ellipse(p, y, (12 + tr() * 30) * k, (1.6 + tr() * 3.4) * k, tr() * 0.2 - 0.1, 0, 6.2832);
      g.fill();
    }
    g.globalAlpha = 1;

    // the ridge is rock, not sward: one band under the crest, then loose scree
    const rockCol = Paint.tone('#928F84', e, localBlight(2200));
    const rx0 = Math.max(-8, sx(1860)), rx1 = Math.min(w + 8, sx(W_WORLD));
    if (rx1 > rx0) {
      const rs = Math.max(2, 5 * sc);
      g.beginPath();
      for (let p = rx0; p <= rx1; p += rs) g.lineTo(p, gY(wx4(p)) - 1);
      const rf = relief();
      for (let p = rx1; p >= rx0; p -= rs) {
        const a = clamp((wx4(p) - 1860) / 340, 0, 1);
        g.lineTo(p, gY(wx4(p)) + (14 + 52 * a) * vs * rf);
      }
      g.closePath();
      g.globalAlpha = 0.62; g.fillStyle = Paint.rgb(rockCol); g.fill();
      const sr = Paint.rngFrom(Paint.hash32('scree' + seed));
      for (let i = 0; i < 26; i++) {
        const wxx = 1900 + sr() * 560;
        const p = sx(wxx);
        if (p < -20 || p > w + 20) continue;
        const yf = sr() * 0.5;
        g.globalAlpha = 0.16 + sr() * 0.24;
        g.fillStyle = Paint.rgb(sr() > 0.5 ? Paint.shade(rockCol, -0.22) : Paint.shade(rockCol, 0.14));
        g.beginPath();
        g.ellipse(p, gY(wxx) + (8 + yf * 90) * vs * rf, (6 + sr() * 20) * Math.max(sc, 0.4),
                  (2 + sr() * 5) * Math.max(sc, 0.4), 0, 0, 6.2832);
        g.fill();
      }
      if (e.season.snow > 0) {
        g.beginPath();
        for (let p = rx0; p <= rx1; p += rs) g.lineTo(p, gY(wx4(p)) - 1);
        for (let p = rx1; p >= rx0; p -= rs) {
          const a = clamp((wx4(p) - 1980) / 300, 0, 1);
          g.lineTo(p, gY(wx4(p)) + (1 + 12 * a) * vs * rf);
        }
        g.closePath();
        g.globalAlpha = e.season.snow * 0.85; g.fillStyle = '#EEF0EB'; g.fill();
      }
    }
    g.globalAlpha = 1;

    // the brook, a ribbon lying across the valley floor
    const x0 = sx(BX - BW_DRAW), x1 = sx(BX + BW_DRAW);
    if (x1 > -20 && x0 < w + 20) {
      const clarity = state ? state.water : 1;
      const base = Paint.mix(Paint.hx('#6E93A0'), Paint.hx('#9C9077'), 1 - clarity);
      const wcol = Paint.tone(base, e, 0);
      const st2 = Math.max(2, 6 * sc);
      const reach = () => {
        g.beginPath();
        for (let p = x0; p <= x1; p += st2) g.lineTo(p, brookT(wx4(p)));
        for (let p = x1; p >= x0; p -= st2) g.lineTo(p, brookB(wx4(p)));
        g.closePath();
      };
      /* The surface is level now, so one upright gradient over the reach's own section is
         true everywhere along it: sky on the near water, the far bank's shadow under it. */
      reach();
      const wg = g.createLinearGradient(0, brookT(BX), 0, brookB(BX));
      wg.addColorStop(0, Paint.rgb(Paint.mix(wcol, e.sky[2], 0.55)));
      wg.addColorStop(0.55, Paint.rgb(Paint.mix(wcol, e.sky[1], 0.18)));
      wg.addColorStop(1, Paint.rgb(Paint.shade(wcol, -0.14)));
      g.fillStyle = wg; g.fill();
      // a damp margin so the banks are not a hard cut
      g.strokeStyle = Paint.rgb(Paint.shade(Paint.tone(e.season.wood, e, 0), -0.1));
      g.lineWidth = Math.max(1.5, 5 * Math.max(sc, 0.4)); g.globalAlpha = 0.3;
      g.beginPath();
      for (let p = x0; p <= x1; p += st2) g.lineTo(p, brookT(wx4(p)));
      g.stroke();
      g.beginPath();
      for (let p = x0; p <= x1; p += st2) g.lineTo(p, brookB(wx4(p)));
      g.stroke();
      g.globalAlpha = 1;
      // a few flat highlights so the surface reads as moving water, kept inside the water
      reach();
      g.save(); g.clip();
      g.strokeStyle = Paint.rgb(Paint.mix(wcol, [255, 252, 240], 0.45 * clarity + 0.1));
      for (let i = 0; i < 9; i++) {
        const r = Paint.rngFrom(Paint.hash32('wv' + i + seed));
        const wxx = BX - BW * 0.8 + r() * 1.6 * BW;
        const yy = brookT(wxx) + r() * (brookB(wxx) - brookT(wxx));
        g.globalAlpha = 0.16 + r() * 0.2;
        g.lineWidth = Math.max(1, 2 * Math.max(sc, 0.5));
        g.beginPath(); g.moveTo(sx(wxx) - 22 * Math.max(sc, 0.4), yy);
        g.lineTo(sx(wxx) + 22 * Math.max(sc, 0.4), yy); g.stroke();
      }
      g.restore();
      g.globalAlpha = 1;
    }
    g.restore();

    // colour draining from the two ends of the valley
    if (state && state.blight > 1) {
      const bw = g.createLinearGradient(0, 0, w, 0);
      for (let i = 0; i <= 10; i++) {
        const lb = localBlight(wx4((i / 10) * w));
        bw.addColorStop(i / 10, `rgba(150,148,138,${(lb * 0.52).toFixed(3)})`);
      }
      g.save();
      g.beginPath();
      g.moveTo(-4, h + 4);
      for (let p = -4; p <= w + 4; p += step) g.lineTo(p, gY(wx4(p)));
      g.lineTo(w + 4, h + 4); g.closePath(); g.clip();
      g.fillStyle = bw; g.fillRect(0, 0, w, h);
      g.restore();
    }

    // distance haze, only across the top of the land
    const hg = g.createLinearGradient(0, Math.min(hz - 8, gTop), 0, hz + landH(wx4(w / 2)) * 0.3);
    hg.addColorStop(0, Paint.rgba(hazeC, 0.3 * (1 - e.night * 0.55)));
    hg.addColorStop(1, Paint.rgba(hazeC, 0));
    g.save();
    g.beginPath();
    g.moveTo(-4, h + 4);
    for (let p = -4; p <= w + 4; p += step) g.lineTo(p, gY(wx4(p)));
    g.lineTo(w + 4, h + 4); g.closePath(); g.clip();
    g.fillStyle = hg; g.fillRect(0, Math.min(hz - 10, gTop - 2), w, h);
    g.restore();
  }

  function layerHills(g, w, h, hz, par, amp, alpha, col, tag, vs) {
    const off = cam.x * par * scale();
    g.globalAlpha = alpha; g.fillStyle = Paint.rgb(col);
    g.beginPath();
    g.moveTo(-4, h + 6);
    for (let x = -4; x <= w + 4; x += 6) {
      const n = Paint.noise1((x + off) / 190, tag) * 0.7 + Paint.noise1((x + off) / 62, tag + 'b') * 0.3;
      g.lineTo(x, hz - 8 - n * amp * vs);
    }
    g.lineTo(w + 4, h + 6); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }

  /* ---------- the living layer ---------- */
  function drawLife(g, e, w, h, t) {
    marks = [];
    const sc = scale(), hz = horizon();
    for (const it of insts) {
      const px = sx(it.x);
      if (px < -90 || px > w + 90) continue;
      const fam = it.sp.family;
      const lb = localBlight(it.x);
      let y, k;
      if (fam === 'flyer') {
        y = hz * (0.26 + it.yf * 0.5);
        k = (0.7 + it.yf * 0.9) * Math.max(sc, 0.42);
      } else {
        y = it.brook ? brookY(it.x, it.yf) : depthY(it.x, it.yf);
        k = depthK(it.yf) * (BIG[fam] ? Math.max(sc, 0.3) : Math.max(sc, 0.42));
      }
      const s = (Paint.SIZE[fam] || 16) * (it.sp.scale || 1) * k;
      const cols = it.sp.pal.map(c => Paint.rgb(Paint.tone(Paint.seasonal(c, e), e, lb)));
      g.globalAlpha = 1;
      Paint.draw(g, fam, px, y, s, cols, t, it.ph);
      marks.push({ id: it.id, x: px, y: y - s * 0.45, r: Math.max(15, s * 0.7) });
    }
    g.globalAlpha = 1;
  }

  /* ---------- frame ---------- */
  function envNow() {
    const d = timeOverride || new Date();
    return Paint.env(d, hemisphere, state ? state.blight / Sim.BLIGHT_CAP : 0);
  }

  function frame(now, force) {
    if (!ctx) return;
    const held = still();
    if (!force && !held && now - last < 1000 / FPS) { raf = requestAnimationFrame(frame); return; }
    last = now;
    const t = held ? STILL_T : (now - t0) / 1000;
    const e = envNow();
    const key = [Math.round(cam.x), cam.wide ? 1 : 0, Math.round(e.hour * 10), W, H,
                 state ? Math.round(state.blight) : 0, state ? Math.round(state.water * 20) : 20, e.season.name].join('|');
    if (!terrain || key !== tKey) { terrain = paintTerrain(e); tKey = key; }
    ctx.drawImage(terrain, 0, 0, W, H);
    drawLife(ctx, e, W, H, t);

    if (mist > 0.002 && !held) {
      const mg = ctx.createLinearGradient(0, horizon() - 40, 0, H);
      mg.addColorStop(0, Paint.rgba(Paint.hx('#EFE8D8'), 0.52 * mist));
      mg.addColorStop(0.55, Paint.rgba(Paint.hx('#EFE8D8'), 0.2 * mist));
      mg.addColorStop(1, Paint.rgba(Paint.hx('#EFE8D8'), 0.02 * mist));
      ctx.fillStyle = mg; ctx.fillRect(0, horizon() - 40, W, H);
      mist *= 0.99;
    }
    Paint.grain(ctx, W, H, 0.07);
    if (running && !held) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true; t0 = performance.now() - 4000;
    if (still()) { frame(performance.now(), true); return; }
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (pending) cancelAnimationFrame(pending); pending = 0;
  }

  /* ---------- input ---------- */
  /* Pointer events only. Binding touch as well meant one finger produced two picks
     and two drags, so tapping a creature opened its note twice. */
  function bindDrag() {
    let id = null, sxp = 0, cx0 = 0, moved = 0;
    const begin = ev => {
      if (id !== null || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      id = ev.pointerId; sxp = ev.clientX; cx0 = cam.x; moved = 0;
      try { cv.setPointerCapture(id); } catch (e) {}
    };
    const move = ev => {
      if (id === null || ev.pointerId !== id) return;
      const d = ev.clientX - sxp;
      moved = Math.max(moved, Math.abs(d));
      if (!cam.wide) { cam.x = clamp(cx0 - d / scale(), 0, maxCam()); nudge(); }
    };
    const up = ev => {
      if (id === null || ev.pointerId !== id) return;
      try { cv.releasePointerCapture(id); } catch (e) {}
      id = null;
      if (moved < 6) {
        const r = cv.getBoundingClientRect();
        if (onPick) onPick(pickAt(ev.clientX - r.left, ev.clientY - r.top));
      }
    };
    cv.addEventListener('pointerdown', begin);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { id = null; });
  }

  function pickAt(x, y) {
    let best = null, bd = 1e9;
    for (const m of marks) {
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < m.r && d < bd) { bd = d; best = m.id; }
    }
    return best;
  }

  /** Renders the valley into any 2d context at any size. Photo mode uses this. */
  function renderTo(g, w, h, opt) {
    const sv = { W, H, x: cam.x, wide: cam.wide, DPR, timeOverride };
    W = w; H = h; DPR = 1;
    if (opt && opt.wide !== undefined) cam.wide = opt.wide;
    cam.x = clamp(opt && opt.x !== undefined ? opt.x : cam.x, 0, maxCam());
    if (opt && opt.date) timeOverride = opt.date;
    layout();
    const e = envNow();
    drawTerrain(g, e, w, h);
    drawLife(g, e, w, h, (opt && opt.t) || 6);
    Paint.grain(g, w, h, 0.07);
    W = sv.W; H = sv.H; cam.x = sv.x; cam.wide = sv.wide; DPR = sv.DPR; timeOverride = sv.timeOverride;
    layout(); terrain = null; tKey = '';
  }

  return { attach, setState, setTime, start, stop, wide, isWide, focus, renderTo, resize,
           get cam() { return cam; }, envNow, instances: () => insts.length };
})();
