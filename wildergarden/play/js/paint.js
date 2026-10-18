/* Everything you see in the valley is drawn here from paths and fills.
   No images, no sprite sheets, no network. Gouache is faked with soft
   overlapping shapes, a warm light wash and a paper grain on top. */
const Paint = (() => {

  /* ---------- colour ---------- */
  const hx = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const rgb = a => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
  const rgba = (a, al) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = a => 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2];
  const desat = (a, t) => { const g = lum(a); return mix(a, [g * 0.98 + 6, g * 0.99 + 4, g * 0.96 + 8], t); };
  const shade = (a, t) => t < 0 ? mix(a, [12, 14, 16], -t) : mix(a, [255, 252, 240], t);

  /* ---------- deterministic noise ---------- */
  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rngFrom(seedInt) {
    let a = seedInt >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const smooth = t => t * t * (3 - 2 * t);
  /* value noise, one dimension, good enough for hills */
  function noise1(x, seed) {
    const i = Math.floor(x), f = x - i;
    const r = n => rngFrom(hash32(seed + ':' + n))();
    return r(i) + (r(i + 1) - r(i)) * smooth(f);
  }

  /* ---------- the sky through a day ---------- */
  const KEYS = [
    { h: 0,  sky: ['#0E1626', '#182437', '#26354A'], light: '#8FA6C4', amb: 0.30, night: 1 },
    { h: 5,  sky: ['#243149', '#4A5570', '#96827E'], light: '#C7A896', amb: 0.46, night: 0.6 },
    { h: 7,  sky: ['#5E7BA6', '#A7A2A6', '#E8B98A'], light: '#F0C89A', amb: 0.76, night: 0 },
    { h: 10, sky: ['#7CA3CE', '#A9C6DE', '#DCE7E6'], light: '#F5EFDC', amb: 0.94, night: 0 },
    { h: 13, sky: ['#6E9BCB', '#9DC0DB', '#D6E4E4'], light: '#FFF8E6', amb: 1.00, night: 0 },
    { h: 16, sky: ['#7195BE', '#A9BCCE', '#E2D8C4'], light: '#FBE9C8', amb: 0.95, night: 0 },
    { h: 18, sky: ['#5C7098', '#9B92A0', '#E6B27C'], light: '#F0BE84', amb: 0.80, night: 0 },
    { h: 20, sky: ['#31405F', '#5A5C76', '#B9805E'], light: '#C99A72', amb: 0.54, night: 0.4 },
    { h: 22, sky: ['#141F33', '#1C2A3E', '#2A3A50'], light: '#93A9C6', amb: 0.34, night: 1 },
    { h: 24, sky: ['#0E1626', '#182437', '#26354A'], light: '#8FA6C4', amb: 0.30, night: 1 }
  ];

  /* Chlorophyll, not olive. The greens carry the brand, so they are saturated on
     purpose; the haze is what keeps distance readable, not a wash over everything. */
  const SEASONS = {
    spring: { grass: '#79A24A', dry: '#AFB566', wood: '#547C34', haze: '#C7D6CE', snow: 0,   name: 'Spring' },
    summer: { grass: '#699642', dry: '#BCAC59', wood: '#477232', haze: '#D1D9C7', snow: 0,   name: 'Summer' },
    autumn: { grass: '#8A9847', dry: '#B78B44', wood: '#6B7237', haze: '#CFCEB8', snow: 0,   name: 'Autumn' },
    winter: { grass: '#77876D', dry: '#979681', wood: '#586551', haze: '#CBD4DC', snow: 0.7, name: 'Winter' }
  };

  function seasonOf(date, hemisphere) {
    const m = date.getMonth();
    let s = m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
    if (hemisphere === 'south') s = { winter: 'summer', spring: 'autumn', summer: 'winter', autumn: 'spring' }[s];
    return s;
  }

  /** The full look of the valley at a moment. */
  function env(date, hemisphere, blightNorm) {
    const h = date.getHours() + date.getMinutes() / 60;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = (h - a.h) / (b.h - a.h);
    const sky = [0, 1, 2].map(k => mix(hx(a.sky[k]), hx(b.sky[k]), t));
    const light = mix(hx(a.light), hx(b.light), t);
    const amb = a.amb + (b.amb - a.amb) * t;
    const night = a.night + (b.night - a.night) * t;
    const season = SEASONS[seasonOf(date, hemisphere)];
    return { sky, light, amb, night, season, hour: h, blight: blightNorm || 0,
             sunFrac: Math.max(0, Math.min(1, (h - 5.5) / 13)) };
  }

  /** Applies ambient light and blight to any base colour. */
  function tone(hex, e, localBlight) {
    let c = typeof hex === 'string' ? hx(hex) : hex.slice();
    c = mix(c, e.light, (1 - e.amb) * 0.45);
    c = mix(c, [c[0] * 0.55, c[1] * 0.6, c[2] * 0.78], e.night * 0.55);
    if (localBlight > 0) c = desat(c, Math.min(0.92, localBlight));
    return c;
  }

  /* Autumn and winter pull the greens over without repainting every species. */
  function seasonal(hex, e) {
    const c = hx(hex);
    const g = c[1] - Math.max(c[0], c[2]);
    if (g <= 6) return c;                       // not a green, leave it alone
    if (e.season === SEASONS.autumn) return mix(c, hx('#B0813C'), 0.34);
    if (e.season === SEASONS.winter) return mix(c, hx('#87897A'), 0.42);
    if (e.season === SEASONS.spring) return mix(c, hx('#9BB55E'), 0.22);
    return c;
  }

  /* ---------- paper grain, rendered once ---------- */
  let grainTile = null;
  function grain(ctx, w, h, alpha) {
    if (!grainTile) {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const g = c.getContext('2d');
      const img = g.createImageData(96, 96);
      const r = rngFrom(90210);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (r() - 0.5) * 96;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      grainTile = c;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'overlay';
    const p = ctx.createPattern(grainTile, 'repeat');
    ctx.fillStyle = p;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /* ---------- ground profile, in world coordinates ---------- */
  const WORLD_W = 2480;
  const BROOK_X = 930, BROOK_HALF = 120, BROOK_DEEP = 13;

  /* `chan` scales the brook's channel. It is a landform 240 units across, so once the
     camera pulls back far enough that 240 units is forty pixels, cutting it to its full
     depth carves a gorge into the hillside instead of a stream bed. The caller says how
     much of it should still show. */
  function groundY(x, base, seed, chan) {
    let y = base;
    y += 9 * Math.sin(x / 137 + 0.6) + 5 * Math.sin(x / 53 + 2.1);
    y += (noise1(x / 210, 'g' + seed) - 0.5) * 16;
    if (x > 1180) y -= smooth(Math.min(1, (x - 1180) / 420)) * 16;                    // wood rises
    if (x > 1820) y -= smooth(Math.min(1, (x - 1820) / 560)) * 96;                    // ridge climbs
    const d = Math.abs(x - BROOK_X);
    const k = chan === undefined ? 1 : chan;
    if (d < BROOK_HALF) y += BROOK_DEEP * k * Math.cos((d / BROOK_HALF) * Math.PI / 2); // the channel
    return y;
  }
  const waterY = (base, seed) => groundY(BROOK_X, base, seed) - BROOK_DEEP * 0.42;

  /* ---------- family drawings ----------
     Every one takes (ctx, x, y, s, cols, t, ph) where y is the ground contact
     point, s is height in pixels and cols are already toned. */

  const soft = (ctx, x, y, rx, ry, col, al) => {
    ctx.globalAlpha = al; ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.2832); ctx.fill();
  };

  function blade(ctx, x, y, len, lean, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.35, y - len * 0.62, x + lean, y - len);
    ctx.stroke();
  }

  const F = {};

  F.tuft = (ctx, x, y, s, c, t, ph) => {
    const sway = Math.sin(t * 0.5 + ph) * s * 0.12;
    mass(ctx, [[x, y - s * 0.05, s * 0.3, s * 0.07]], c[0], 0.42);
    for (let i = 0; i < 9; i++) {
      const o = (i - 4) * s * 0.075;
      const len = s * (0.56 + ((i * 37 % 13) / 13) * 0.5);
      ctx.globalAlpha = 0.88;
      blade(ctx, x + o, y, len, o * 1.7 + sway, Math.max(0.9, s * 0.05), i % 2 ? c[1] : c[0]);
    }
  };

  F.flower = (ctx, x, y, s, c, t, ph) => {
    const sway = Math.sin(t * 0.42 + ph) * s * 0.1;
    // a low skirt of leaves so the stems have somewhere to come from
    mass(ctx, [[x - s * 0.14, y - s * 0.05, s * 0.2, s * 0.07],
               [x + s * 0.15, y - s * 0.04, s * 0.18, s * 0.065]], c[0], 0.7);
    for (let i = 0; i < 3; i++) {
      const o = (i - 1) * s * 0.15;
      const len = s * (0.66 + (i === 1 ? 0.24 : i * 0.08));
      const lean = o * 1.1 + sway;
      ctx.globalAlpha = 0.92;
      blade(ctx, x + o, y, len, lean, Math.max(1.1, s * 0.055), c[0]);
      const hx2 = x + o + lean, hy = y - len;
      ctx.globalAlpha = 0.96; ctx.fillStyle = c[1];
      ctx.beginPath(); ctx.ellipse(hx2, hy, s * 0.15, s * 0.12, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.ellipse(hx2 - s * 0.04, hy - s * 0.06, s * 0.1, s * 0.075, 0, 0, 6.2832); ctx.fill();
    }
  };

  F.fern = (ctx, x, y, s, c, t, ph) => {
    const sway = Math.sin(t * 0.36 + ph) * 0.08;
    ctx.lineCap = 'round';
    for (let f = 0; f < 6; f++) {
      const a = -1.5708 + (f - 2.5) * 0.3 + sway;
      const len = s * (0.7 + ((f * 7) % 5) / 5 * 0.32);
      const bend = 0.22 * (f < 3 ? -1 : 1);
      const col = f % 2 ? c[1] : c[0];
      // midrib
      ctx.globalAlpha = 0.9; ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.9, s * 0.045);
      const cx = x + Math.cos(a) * len * 0.55 - Math.sin(a) * len * bend;
      const cy = y + Math.sin(a) * len * 0.55 + Math.cos(a) * len * bend;
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
      // pinnae along it
      ctx.lineWidth = Math.max(0.7, s * 0.032);
      for (let k = 1; k <= 6; k++) {
        const u = k / 7;
        const mx = (1 - u) * (1 - u) * x + 2 * (1 - u) * u * cx + u * u * ex;
        const my = (1 - u) * (1 - u) * y + 2 * (1 - u) * u * cy + u * u * ey;
        const w = s * 0.16 * (1 - u * 0.7);
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(mx - Math.cos(a + 1.1) * w, my - Math.sin(a + 1.1) * w);
        ctx.lineTo(mx + Math.cos(a + 1.1) * w, my + Math.sin(a + 1.1) * w);
        ctx.stroke();
      }
    }
  };

  /* One compound path filled once: overlaps merge instead of stacking up. */
  function mass(ctx, parts, col, al) {
    ctx.globalAlpha = al; ctx.fillStyle = col;
    ctx.beginPath();
    for (const p of parts) { ctx.moveTo(p[0] + p[2], p[1]); ctx.ellipse(p[0], p[1], p[2], p[3], 0, 0, 6.2832); }
    ctx.fill();
  }

  F.shrub = (ctx, x, y, s, c, t, ph) => {
    const sway = Math.sin(t * 0.3 + ph) * s * 0.03;
    const back = [], front = [];
    for (let i = 0; i < 8; i++) {
      const r = rngFrom(hash32('sh' + i))();
      const ox = (i - 3.5) * s * 0.16 + sway, oy = -s * (0.22 + r * 0.44);
      (i % 2 ? front : back).push([x + ox, y + oy, s * (0.25 + r * 0.15), s * (0.2 + r * 0.11)]);
    }
    mass(ctx, back, c[0], 0.9);
    mass(ctx, front, c[1], 0.6);
    if (c[2]) for (let i = 0; i < 6; i++) {
      const r = rngFrom(hash32('sb' + i));
      soft(ctx, x + (r() - 0.5) * s * 0.95 + sway, y - s * (0.18 + r() * 0.52), s * 0.05, s * 0.05, c[2], 0.92);
    }
  };

  F.tree = (ctx, x, y, s, c, t, ph) => {
    const sway = Math.sin(t * 0.22 + ph) * s * 0.018;
    const trunk = c[1], leaf = c[0];
    const CY = y - s * 0.74;
    ctx.globalAlpha = 0.94; ctx.fillStyle = trunk;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.06, y);
    ctx.quadraticCurveTo(x - s * 0.028, y - s * 0.34, x - s * 0.02 + sway, y - s * 0.62);
    ctx.lineTo(x + s * 0.022 + sway, y - s * 0.62);
    ctx.quadraticCurveTo(x + s * 0.032, y - s * 0.34, x + s * 0.062, y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = trunk; ctx.lineWidth = Math.max(1, s * 0.024); ctx.lineCap = 'round';
    for (const a of [-0.8, 0.7, -0.35, 0.4]) {
      ctx.globalAlpha = 0.85; ctx.beginPath();
      ctx.moveTo(x + sway * 0.6, y - s * 0.56);
      ctx.quadraticCurveTo(x + sway + Math.sin(a) * s * 0.12, y - s * 0.66,
                           x + sway + Math.sin(a) * s * 0.26, y - s * 0.74);
      ctx.stroke();
    }
    const rr = rngFrom(hash32('tree' + Math.round(s)));
    const under = [], mid = [], lit = [];
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * 6.2832 + rr() * 0.4;
      const q = 0.42 + rr() * 0.58;
      const bx = x + sway + Math.cos(a) * s * 0.3 * q;
      const by = CY + Math.sin(a) * s * 0.2 * q;
      const e = [bx, by, s * (0.16 + rr() * 0.11), s * (0.13 + rr() * 0.085)];
      if (by > CY + s * 0.03) under.push(e);
      else if (bx < x - s * 0.04) lit.push(e);
      else mid.push(e);
    }
    under.push([x + sway, CY + s * 0.05, s * 0.31, s * 0.16]);
    mid.push([x + sway, CY - s * 0.02, s * 0.3, s * 0.18]);
    mass(ctx, under, shadeStr(leaf, -0.26), 0.96);
    mass(ctx, mid, leaf, 0.96);
    mass(ctx, lit, shadeStr(leaf, 0.12), 0.9);
    if (c[2]) for (let i = 0; i < 8; i++) {
      const r = rngFrom(hash32('brr' + i));
      soft(ctx, x + sway + (r() - 0.5) * s * 0.52, CY + (r() - 0.5) * s * 0.3, s * 0.028, s * 0.028, c[2], 0.95);
    }
  };
  const shadeStr = (col, t) => rgb(shade(typeof col === 'string' && col[0] === '#' ? hx(col) : parseRGB(col), t));
  function parseRGB(s) { const m = s.match(/\d+/g); return m ? [ +m[0], +m[1], +m[2] ] : [0, 0, 0]; }

  F.reed = (ctx, x, y, s, c, t, ph) => {
    const sway = Math.sin(t * 0.55 + ph) * s * 0.1;
    for (let i = 0; i < 6; i++) {
      const o = (i - 2.5) * s * 0.07;
      const len = s * (0.7 + ((i * 29 % 11) / 11) * 0.45);
      ctx.globalAlpha = 0.9;
      blade(ctx, x + o, y, len, o * 0.5 + sway, Math.max(0.9, s * 0.05), i % 2 ? c[1] : c[0]);
      if (i % 3 === 1) soft(ctx, x + o + o * 0.5 + sway, y - len, s * 0.035, s * 0.075, c[1], 0.85);
    }
  };

  F.moss = (ctx, x, y, s, c) => {
    const a = [], b = [];
    for (let i = 0; i < 10; i++) {
      const r = rngFrom(hash32('mo' + i));
      const e = [x + (r() - 0.5) * s * 2.6, y - r() * s * 0.45, s * (0.24 + r() * 0.32), s * (0.13 + r() * 0.15)];
      (i % 3 === 0 ? b : a).push(e);
    }
    mass(ctx, a, c[0], 0.72); mass(ctx, b, c[1], 0.5);
  };

  F.mushroom = (ctx, x, y, s, c) => {
    ctx.globalAlpha = 0.9; ctx.fillStyle = c[1];
    ctx.fillRect(x - s * 0.08, y - s * 0.5, s * 0.16, s * 0.5);
    ctx.fillStyle = c[0];
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.52, s * 0.34, s * 0.24, 0, Math.PI, 0); ctx.fill();
    soft(ctx, x - s * 0.1, y - s * 0.58, s * 0.12, s * 0.07, c[1], 0.5);
  };

  F.insect = (ctx, x, y, s, c, t, ph) => {
    const bob = Math.sin(t * 2.1 + ph) * s * 0.5;
    const dx = Math.sin(t * 0.7 + ph * 2) * s * 1.4;
    const cx = x + dx, cy = y - s * 2.2 + bob;
    ctx.globalAlpha = 0.4; ctx.fillStyle = c[1];
    const w = Math.abs(Math.cos(t * 9 + ph)) * 0.6 + 0.4;
    ctx.beginPath(); ctx.ellipse(cx - s * 0.5, cy - s * 0.2, s * 0.55 * w, s * 0.22, -0.5, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + s * 0.5, cy - s * 0.2, s * 0.55 * w, s * 0.22, 0.5, 0, 6.2832); ctx.fill();
    soft(ctx, cx, cy, s * 0.4, s * 0.3, c[0], 0.95);
    soft(ctx, cx, cy - s * 0.05, s * 0.18, s * 0.16, c[1], 0.9);
  };

  F.butterfly = (ctx, x, y, s, c, t, ph) => {
    const dx = Math.sin(t * 0.55 + ph) * s * 3;
    const dy = Math.sin(t * 0.9 + ph * 1.7) * s * 1.6;
    const cx = x + dx, cy = y - s * 3.4 + dy;
    const open = 0.35 + Math.abs(Math.sin(t * 4 + ph)) * 0.65;
    ctx.globalAlpha = 0.9;
    for (const sgn of [-1, 1]) {
      ctx.fillStyle = c[1];
      ctx.beginPath(); ctx.ellipse(cx + sgn * s * 0.42 * open, cy - s * 0.12, s * 0.46 * open, s * 0.36, sgn * 0.35, 0, 6.2832); ctx.fill();
      ctx.fillStyle = c[0];
      ctx.beginPath(); ctx.ellipse(cx + sgn * s * 0.34 * open, cy + s * 0.24, s * 0.32 * open, s * 0.24, sgn * -0.3, 0, 6.2832); ctx.fill();
    }
    ctx.fillStyle = c[2] || c[0]; ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.08, s * 0.34, 0, 0, 6.2832); ctx.fill();
  };

  F.bird = (ctx, x, y, s, c, t, ph) => {
    const hop = Math.abs(Math.sin(t * 0.5 + ph)) * s * 0.06;
    const cy = y - s * 0.42 - hop;
    ctx.globalAlpha = 0.94;
    soft(ctx, x, cy, s * 0.38, s * 0.31, c[0], 0.95);
    soft(ctx, x - s * 0.1, cy + s * 0.1, s * 0.24, s * 0.17, c[1], 0.75);
    soft(ctx, x + s * 0.3, cy - s * 0.24, s * 0.2, s * 0.19, c[0], 0.98);
    ctx.fillStyle = c[2] || '#3A3229'; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(x + s * 0.46, cy - s * 0.26);
    ctx.lineTo(x + s * 0.64, cy - s * 0.21); ctx.lineTo(x + s * 0.46, cy - s * 0.17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c[0];
    ctx.beginPath(); ctx.moveTo(x - s * 0.28, cy + s * 0.02);
    ctx.lineTo(x - s * 0.78, cy - s * 0.24); ctx.lineTo(x - s * 0.3, cy - s * 0.16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c[2] || '#4A4038'; ctx.lineWidth = Math.max(0.7, s * 0.045);
    ctx.beginPath(); ctx.moveTo(x - s * 0.04, cy + s * 0.28); ctx.lineTo(x - s * 0.04, y); ctx.stroke();
  };

  F.wader = (ctx, x, y, s, c, t, ph) => {
    const lean = Math.sin(t * 0.18 + ph) * 0.05;
    ctx.strokeStyle = c[2] || '#4A4A46'; ctx.lineWidth = Math.max(1, s * 0.028); ctx.lineCap = 'round';
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x - s * 0.04, y); ctx.lineTo(x - s * 0.02, y - s * 0.38); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s * 0.06, y); ctx.lineTo(x + s * 0.02, y - s * 0.38); ctx.stroke();
    const by = y - s * 0.48;
    ctx.globalAlpha = 0.95;
    soft(ctx, x, by, s * 0.2, s * 0.14, c[0], 0.95);
    soft(ctx, x - s * 0.12, by + s * 0.02, s * 0.14, s * 0.1, c[1], 0.6);
    ctx.strokeStyle = c[0]; ctx.lineWidth = Math.max(1.2, s * 0.06);
    ctx.beginPath(); ctx.moveTo(x + s * 0.06, by - s * 0.06);
    ctx.quadraticCurveTo(x + s * 0.24 + lean * s, by - s * 0.2, x + s * 0.1 + lean * s, by - s * 0.36);
    ctx.stroke();
    soft(ctx, x + s * 0.1 + lean * s, by - s * 0.4, s * 0.07, s * 0.06, c[1], 0.95);
    ctx.strokeStyle = c[2] || '#3A3E44'; ctx.lineWidth = Math.max(0.9, s * 0.03);
    ctx.beginPath(); ctx.moveTo(x + s * 0.14 + lean * s, by - s * 0.41);
    ctx.lineTo(x + s * 0.38 + lean * s, by - s * 0.44); ctx.stroke();
  };

  /* A bird on the wing, seen from below: two tapered wings and a small body.
     `y` is where it flies, not where it stands. */
  F.flyer = (ctx, x, y, s, c, t, ph) => {
    const cx = x + Math.sin(t * 0.11 + ph) * s * 4.2;
    const cy = y + Math.sin(t * 0.19 + ph * 1.3) * s * 1.1;
    const flap = Math.sin(t * 1.7 + ph) * 0.26;
    ctx.globalAlpha = 0.88; ctx.fillStyle = c[0];
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + sgn * s * 0.09, cy - s * 0.06);
      ctx.quadraticCurveTo(cx + sgn * s * 0.62, cy - s * (0.24 + flap * 0.8),
                           cx + sgn * s * 1.18, cy - s * (0.06 + flap * 1.2));
      ctx.quadraticCurveTo(cx + sgn * s * 0.58, cy + s * (0.07 - flap * 0.25),
                           cx + sgn * s * 0.09, cy + s * 0.11);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = c[1] || c[0]; ctx.globalAlpha = 0.94;
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.02, s * 0.16, s * 0.095, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.1, cy - s * 0.02);
    ctx.lineTo(cx - s * 0.46, cy + s * 0.09);
    ctx.lineTo(cx - s * 0.1, cy + s * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + s * 0.19, cy - s * 0.04, s * 0.075, s * 0.065, 0, 0, 6.2832); ctx.fill();
  };

  F.fish = (ctx, x, y, s, c, t, ph) => {
    const dx = Math.sin(t * 0.33 + ph) * s * 1.6;
    const cx = x + dx, cy = y;
    ctx.globalAlpha = 0.62;
    soft(ctx, cx, cy, s * 0.5, s * 0.19, c[0], 0.62);
    ctx.fillStyle = c[1]; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(cx - s * 0.44, cy);
    ctx.lineTo(cx - s * 0.72, cy - s * 0.17); ctx.lineTo(cx - s * 0.72, cy + s * 0.17); ctx.closePath(); ctx.fill();
    if (c[2]) { ctx.globalAlpha = 0.45; soft(ctx, cx + s * 0.1, cy, s * 0.06, s * 0.05, c[2], 0.45); }
  };

  F.critter = (ctx, x, y, s, c, t, ph) => {
    const hop = Math.abs(Math.sin(t * 0.6 + ph)) * s * 0.08;
    const cy = y - s * 0.32 - hop;
    ctx.globalAlpha = 0.94;
    soft(ctx, x, cy, s * 0.42, s * 0.3, c[0], 0.95);
    soft(ctx, x + s * 0.38, cy - s * 0.12, s * 0.22, s * 0.2, c[0], 0.96);
    soft(ctx, x + s * 0.42, cy - s * 0.3, s * 0.07, s * 0.13, c[1], 0.9);
    soft(ctx, x + s * 0.3, cy - s * 0.32, s * 0.07, s * 0.13, c[1], 0.9);
    ctx.strokeStyle = c[1]; ctx.lineWidth = Math.max(0.8, s * 0.05); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - s * 0.4, cy + s * 0.06);
    ctx.quadraticCurveTo(x - s * 0.7, cy - s * 0.02, x - s * 0.72, cy - s * 0.2); ctx.stroke();
  };

  F.mammal = (ctx, x, y, s, c, t, ph) => {
    const step = Math.sin(t * 0.5 + ph) * s * 0.04;
    const cy = y - s * 0.42;
    ctx.strokeStyle = c[0]; ctx.lineWidth = Math.max(1, s * 0.08); ctx.lineCap = 'round';
    ctx.globalAlpha = 0.9;
    for (const o of [-0.3, -0.16, 0.2, 0.34]) {
      ctx.beginPath(); ctx.moveTo(x + s * o, cy + s * 0.1);
      ctx.lineTo(x + s * o + step * (o < 0 ? 1 : -1), y); ctx.stroke();
    }
    ctx.globalAlpha = 0.95;
    soft(ctx, x, cy, s * 0.46, s * 0.21, c[0], 0.96);
    soft(ctx, x + s * 0.42, cy - s * 0.14, s * 0.2, s * 0.16, c[0], 0.96);
    ctx.fillStyle = c[0]; ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.moveTo(x + s * 0.5, cy - s * 0.16);
    ctx.lineTo(x + s * 0.72, cy - s * 0.1); ctx.lineTo(x + s * 0.5, cy - s * 0.04); ctx.closePath(); ctx.fill();
    for (const o of [0.34, 0.48]) {
      ctx.beginPath(); ctx.moveTo(x + s * o, cy - s * 0.24);
      ctx.lineTo(x + s * (o + 0.03), cy - s * 0.4); ctx.lineTo(x + s * (o + 0.1), cy - s * 0.24); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = c[1]; ctx.lineWidth = Math.max(1.4, s * 0.15);
    ctx.beginPath(); ctx.moveTo(x - s * 0.4, cy + s * 0.02);
    ctx.quadraticCurveTo(x - s * 0.78, cy - s * 0.02, x - s * 0.86, cy - s * 0.22); ctx.stroke();
    if (c[2]) { ctx.globalAlpha = 0.8; soft(ctx, x - s * 0.84, cy - s * 0.24, s * 0.07, s * 0.07, c[1], 0.8); }
  };

  F.stag = (ctx, x, y, s, c, t, ph) => {
    const br = Math.sin(t * 0.3 + ph) * s * 0.012;
    const cy = y - s * 0.62;
    ctx.strokeStyle = c[1]; ctx.lineWidth = Math.max(1.2, s * 0.055); ctx.lineCap = 'round';
    ctx.globalAlpha = 0.92;
    for (const o of [-0.26, -0.14, 0.16, 0.28]) {
      ctx.beginPath(); ctx.moveTo(x + s * o, cy + s * 0.14); ctx.lineTo(x + s * o * 1.05, y); ctx.stroke();
    }
    soft(ctx, x, cy + br, s * 0.4, s * 0.2, c[0], 0.97);
    ctx.strokeStyle = c[0]; ctx.lineWidth = Math.max(1.6, s * 0.11);
    ctx.beginPath(); ctx.moveTo(x + s * 0.3, cy - s * 0.02 + br);
    ctx.quadraticCurveTo(x + s * 0.48, cy - s * 0.22, x + s * 0.5, cy - s * 0.44 + br); ctx.stroke();
    soft(ctx, x + s * 0.54, cy - s * 0.5 + br, s * 0.13, s * 0.09, c[0], 0.98);
    ctx.strokeStyle = c[2] || c[1]; ctx.lineWidth = Math.max(1, s * 0.04);
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * 0.5, cy - s * 0.56 + br);
      ctx.quadraticCurveTo(x + s * (0.5 + sgn * 0.06), cy - s * 0.78 + br, x + s * (0.52 + sgn * 0.2), cy - s * 0.92 + br);
      ctx.stroke();
      for (const k of [0.3, 0.55, 0.8]) {
        ctx.beginPath();
        ctx.moveTo(x + s * (0.5 + sgn * 0.06 * k), cy - s * (0.58 + 0.3 * k) + br);
        ctx.lineTo(x + s * (0.5 + sgn * (0.06 * k + 0.13)), cy - s * (0.64 + 0.34 * k) + br);
        ctx.stroke();
      }
    }
  };

  const SIZE = { tuft: 22, flower: 25, fern: 28, shrub: 33, tree: 80, reed: 34, moss: 11, mushroom: 15,
                 insect: 8, butterfly: 10, bird: 15, wader: 44, flyer: 12, fish: 17, critter: 14,
                 mammal: 22, stag: 46 };

  function draw(ctx, family, x, y, s, cols, t, ph) {
    const f = F[family] || F.tuft;
    ctx.save();
    f(ctx, x, y, s, cols, t, ph);
    ctx.restore();
  }

  return { hx, rgb, rgba, mix, desat, shade, tone, seasonal, env, seasonOf, SEASONS, mass, soft,
           grain, groundY, waterY, WORLD_W, BROOK_X, BROOK_HALF, noise1, rngFrom, hash32,
           draw, SIZE, families: F };
})();
