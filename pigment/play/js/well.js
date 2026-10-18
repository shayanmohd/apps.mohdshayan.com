/* Pigment. The mixing well.

   A ceramic palette with real paint on it. Tap to squeeze out a gob, drag to smear
   two of them together. The smear is the same Kubelka-Munk arithmetic the paper
   uses, which is the point: this screen teaches colour by feel rather than by
   showing you a colour wheel and hoping. */

const Well = (() => {
  const CH = 7;                   // Kr Kg Kb S granMass stainMass mass
  const CELL = 4;                 // canvas pixels per cell
  const PICK = 0.14, DROP = 0.45;

  let cv, ctx, sc, scx, img;
  let gw = 0, gh = 0, dispW = 0, dispH = 0, dpr = 1;
  let M = null;
  let carried = new Float32Array(CH);
  let dragging = false, moved = 0, lastX = 0, lastY = 0;
  let pigment = null, gobs = [];
  let sampleX = 0, sampleY = 0, hasSample = false;
  let onSample = null;

  const CERAMIC = Sim.hexLin('#F5F2EA');

  function mount(cvEl, w, h, cb) {
    cv = cvEl; ctx = cv.getContext('2d', { alpha: false });
    onSample = cb;
    dispW = Math.floor(w); dispH = Math.floor(h);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = dispW + 'px'; cv.style.height = dispH + 'px';
    cv.width = Math.round(dispW * dpr); cv.height = Math.round(dispH * dpr);
    ctx.imageSmoothingEnabled = true;
    gw = Math.max(30, Math.round(dispW / CELL)); gh = Math.max(30, Math.round(dispH / CELL));
    M = new Float32Array(gw * gh * CH);
    sc = document.createElement('canvas'); sc.width = gw; sc.height = gh;
    scx = sc.getContext('2d');
    img = scx.createImageData(gw, gh);
    gobs = [];
    hasSample = false;
    bind();
    render();
  }

  function wipe() { M.fill(0); gobs = []; hasSample = false; carried.fill(0); render(); report(); }

  function setPigment(p) { pigment = p; }

  function gob(cx, cy, r) {
    if (!pigment) return;
    const mu = pigment.S + (pigment.K[0] + pigment.K[1] + pigment.K[2]) / 3;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(gw - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(gh - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      let f = 1 - d; f = f * f * (3 - 2 * f);
      const m = f * 1.5;
      const o = (y * gw + x) * CH;
      M[o] += m * pigment.K[0]; M[o + 1] += m * pigment.K[1]; M[o + 2] += m * pigment.K[2];
      M[o + 3] += m * pigment.S;
      M[o + 4] += m * mu * pigment.gran;
      M[o + 5] += m * mu * pigment.stain;
      M[o + 6] += m;
    }
    gobs.push({ name: pigment.name, x: cx, y: cy });
  }

  const under = new Float32Array(CH);

  /* A knife picks paint up once per touch and lays it down across its whole face.
     Sampling per cell instead would dilute what it is carrying against the bare
     palette within a single touch, and nothing would travel. */
  function smearAt(cx, cy, r) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(gw - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(gh - 1, Math.ceil(cy + r));
    under.fill(0);
    let wsum = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      let f = 1 - d; f = f * f * (3 - 2 * f);
      const o = (y * gw + x) * CH;
      for (let c = 0; c < CH; c++) under[c] += M[o + c] * f;
      wsum += f;
    }
    if (wsum <= 0) return;
    for (let c = 0; c < CH; c++) carried[c] = carried[c] * (1 - PICK) + (under[c] / wsum) * PICK;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      let f = 1 - d; f = f * f * (3 - 2 * f);
      const o = (y * gw + x) * CH, b = f * DROP;
      for (let c = 0; c < CH; c++) M[o + c] = M[o + c] * (1 - b) + carried[c] * b;
    }
  }

  /* The material under a point, expressed the way a tube is expressed. */
  function sampleAt(cx, cy, r) {
    let Kr = 0, Kg = 0, Kb = 0, S = 0, G = 0, T = 0, m = 0, n = 0;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(gw - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(gh - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (Math.hypot(x - cx, y - cy) > r) continue;
      const o = (y * gw + x) * CH;
      Kr += M[o]; Kg += M[o + 1]; Kb += M[o + 2]; S += M[o + 3];
      G += M[o + 4]; T += M[o + 5]; m += M[o + 6]; n++;
    }
    if (!n || m < 0.02) return null;
    const mu = S + (Kr + Kg + Kb) / 3;
    const K = [Kr / m, Kg / m, Kb / m];
    const Su = S / m;
    const rgb = Sim.km(K[0] * 8, K[1] * 8, K[2] * 8, Su * 8, null);
    return {
      K, S: Su,
      gran: mu > 1e-6 ? Math.min(1, G / mu) : 0,
      stain: mu > 1e-6 ? Math.min(1, T / mu) : 0,
      hex: '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('')
    };
  }

  function report() {
    if (!onSample) return;
    onSample(hasSample ? sampleAt(sampleX, sampleY, gw * 0.038) : null, suggestName());
  }

  /* The two tubes squeezed nearest whatever the knife is standing on. It is a
     guess at a name, not a claim about the recipe, so the field stays editable. */
  function suggestName() {
    if (!gobs.length) return '';
    const near = {};
    for (const g of gobs) {
      const d = Math.hypot(g.x - sampleX, g.y - sampleY);
      near[g.name] = Math.min(near[g.name] === undefined ? 1e9 : near[g.name], d);
    }
    const top = Object.entries(near).sort((a, b) => a[1] - b[1])
      .filter(e => e[1] < gw * 0.42).slice(0, 2).map(e => e[0]);
    if (!top.length) return 'Your mix';
    // "Hansa Yellow Light" has to become "Hansa", or the name of a mix of two of
    // them will not fit anywhere the mix is shown.
    const short = s => {
      let v = s;
      for (let i = 0; i < 2; i++) v = v.replace(/ (Blue|Yellow|Red|Green|Rose|Light|White|Scarlet|Maroon|Pink|Teal|Orange|Sienna|Umber|Black)$/, '');
      return v;
    };
    if (top.length === 1) return short(top[0]) + ' mix';
    return short(top[0]) + ' and ' + short(top[1]);
  }

  function render() {
    const d = img.data;
    for (let i = 0; i < gw * gh; i++) {
      const o = i * CH, q = i << 2;
      const rgb = Sim.km(M[o], M[o + 1], M[o + 2], M[o + 3], CERAMIC);
      d[q] = rgb[0]; d[q + 1] = rgb[1]; d[q + 2] = rgb[2]; d[q + 3] = 255;
    }
    scx.putImageData(img, 0, 0);
    ctx.drawImage(sc, 0, 0, cv.width, cv.height);
    if (hasSample) {
      const s = cv.width / gw;
      const cy = sampleY * (cv.height / gh);
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3.2 * dpr;
      ctx.beginPath(); ctx.arc(sampleX * s, cy, 10.5 * dpr, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = 'rgba(30,26,21,.70)'; ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath(); ctx.arc(sampleX * s, cy, 10.5 * dpr, 0, 6.2832); ctx.stroke();
    }
  }

  function bind() {
    if (cv._wellBound) return;
    cv._wellBound = true;
    const pos = e => {
      const r = cv.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width * gw, (e.clientY - r.top) / r.height * gh];
    };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      const [x, y] = pos(e);
      dragging = true; moved = 0; lastX = x; lastY = y;
      carried.fill(0);
    });
    cv.addEventListener('pointermove', e => {
      if (!dragging) return;
      e.preventDefault();
      const [x, y] = pos(e);
      const dist = Math.hypot(x - lastX, y - lastY);
      moved += dist;
      const n = Math.max(1, Math.ceil(dist / 1.4));
      for (let i = 1; i <= n; i++) {
        smearAt(lastX + (x - lastX) * i / n, lastY + (y - lastY) * i / n, gw * 0.078);
      }
      lastX = x; lastY = y;
      sampleX = x; sampleY = y; hasSample = true;
      render(); report();
    });
    const up = e => {
      if (!dragging) return;
      dragging = false;
      e.preventDefault();
      if (moved < 2.2) { gob(lastX, lastY, gw * 0.115); sampleX = lastX; sampleY = lastY; hasSample = true; }
      render(); report();
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }

  return { mount, wipe, setPigment, render, report, suggestName,
           sample: () => (hasSample ? sampleAt(sampleX, sampleY, gw * 0.038) : null) };
})();

window.Well = Well;
