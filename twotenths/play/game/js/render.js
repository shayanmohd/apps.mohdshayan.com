/*
 * Drawing. A dark pit lane seen from above, portrait: the fast lane on the left, our box in the working
 * lane, the garage on the right, the release lamp in the thumb zone at the bottom, and the broadcast
 * stopwatch with its timing ruler at the top. Static layers (asphalt, paint, garage, floodlight pools)
 * are drawn once per size and look into offscreen canvases; each frame draws only what moves. No
 * per-frame shadowBlur, particles capped, device pixel ratio capped at 2 (1 after slow frames).
 */
(function (root) {
  'use strict';
  var TT = root.TT;
  var stopM = TT.stop;
  var icons = TT.icons;

  var COL = {
    bg: '#0E1116', bgWet: '#0B1015', lane: '#1A1E25', fast: '#12161C', paint: '#E5C13A', ink: '#EEF1F4',
    muted: '#8C96A4', dim: '#4A525E', purple: '#B07CFF', green: '#35D483', amber: '#F2C14E', red: '#FF3B30',
    body: '#2A2F37', bodyHi: '#3A414C', rival: '#1B1F26', tyre: '#0A0B0D', crew: '#1C222A', panel: 'rgba(16, 20, 26, 0.92)'
  };
  var FONT = '"Archivo Narrow", "Arial Narrow", system-ui, sans-serif';
  var MAX_PARTICLES = 90;
  var EDGE = 32; // touch zones start this far inside the side edges (Android's Back gesture)

  var cv, g, W = 0, H = 0, D = 1, ins = { top: 0, right: 0, bottom: 0, left: 0 };
  var L = null;
  var layers = {};
  var sprites = {};
  var particles = [];
  var popups = [];
  var rain = [];
  var shakeAmp = 0, shakeT = 0;
  var reduced = false;
  var seedN = 1;

  function rnd() {
    seedN = (seedN * 1664525 + 1013904223) >>> 0;
    return seedN / 4294967296;
  }

  // The backing store is sized once, here, before Shell.ready(), and never again: with the ads SDK's
  // WebView in the renderer, a canvas resized later is drawn on the CPU (WEBGAME-RECIPE.md section 2b).
  // It is square, from the screen's longer side, so a rotation or a resized window still fits; resize()
  // only moves the CSS size and the transform.
  var BS = 1, DMAX = 1, sizeKey = '';

  function init(canvas) {
    cv = canvas;
    DMAX = Math.max(1, Math.min(2, root.devicePixelRatio || 1));
    var scr = root.screen || {};
    var side = Math.max(scr.width || 0, scr.height || 0, root.innerWidth || 0, root.innerHeight || 0, 1);
    BS = Math.min(4096, Math.round(side * DMAX));
    cv.width = BS;
    cv.height = BS;
    g = cv.getContext('2d', { alpha: false });
  }

  function setReduced(r) { reduced = !!r; }

  // ---- layout ----

  function resize(w, h, dpr, insets, force) {
    W = Math.max(1, w); H = Math.max(1, h);
    var d = Math.min(Math.max(1, Math.min(DMAX, dpr || 1)), BS / W, BS / H);
    var key = W + 'x' + H + '@' + d + JSON.stringify(insets || ins);
    if (!force && key === sizeKey) return; // nothing moved: keep the layers built before Shell.ready()
    sizeKey = key;
    D = d;
    ins = insets || ins;
    cv.style.width = BS / D + 'px';
    cv.style.height = BS / D + 'px';
    var cw = Math.min(W, 560);
    var left = (W - cw) / 2;
    var top = ins.top + 8;
    var hudH = 112;
    var lampR = Math.max(34, Math.min(46, cw * 0.1));
    var lampY = H - ins.bottom - lampR - 30;
    var pitTop = top + hudH + 6;
    var pitBottom = lampY - lampR - 14;
    var pitH = Math.max(160, pitBottom - pitTop);
    var carLen = Math.min(pitH * 0.6, cw * 0.7, 330);
    var s = carLen / 5.4;
    L = {
      cw: cw, left: left, top: top, hudH: hudH, pitTop: pitTop, pitBottom: pitBottom, pitH: pitH,
      s: s, bx: left + cw * 0.6, fx: left + cw * 0.19, by: pitTop + pitH * 0.53,
      lampX: left + cw * 0.6, lampY: lampY, lampR: lampR, ringR: Math.max(28, Math.min(46, 0.78 * s))
    };
    L.markerY = L.by - 2.7 * s;
    L.divX = L.bx - 1.75 * s;
    L.garageX = L.bx + 2.1 * s;
    layers = {};
    sprites = {};
    glyphs = {};
    rain = [];
  }

  /** Screen position of a corner's wheel (or ring) for a car whose centre is at (cx, cy). */
  function wheelPos(corner, cx, cy, out) {
    var s = L.s;
    var side = corner % 2 === 0 ? -1 : 1;
    var front = corner < 2;
    return { x: cx + side * (0.8 + (out || 0)) * s, y: cy + (front ? -1.55 : 1.75) * s };
  }

  function ringPos(corner) {
    var p = wheelPos(corner, L.bx, L.by, 0.5);
    p.r = L.ringR;
    return p;
  }

  /** The target under a tap: a ring corner, the lamp, the play area ('any'), or nothing (an edge). */
  function hit(x, y) {
    if (!L || x < EDGE || x > W - EDGE) return null;
    var best = null, bestD = Infinity;
    for (var c = 0; c < 4; c++) {
      var p = ringPos(c);
      var d = Math.hypot(x - p.x, y - p.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    var dl = Math.hypot(x - L.lampX, y - L.lampY);
    if (dl <= L.lampR * 1.45 && dl < bestD) return { kind: 'lamp' };
    if (bestD <= L.ringR * 1.35) return { kind: 'ring', corner: best };
    if (y < L.top + 40) return null; // the pause button's row
    return { kind: 'any' };
  }

  // ---- offscreen layers ----

  function offscreen(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * D));
    c.height = Math.max(1, Math.round(h * D));
    var x = c.getContext('2d');
    x.setTransform(D, 0, 0, D, 0, 0);
    return { c: c, x: x };
  }

  function roundRect(x, c, y, w, h, r) {
    x.beginPath();
    x.moveTo(c + r, y);
    x.lineTo(c + w - r, y);
    x.quadraticCurveTo(c + w, y, c + w, y + r);
    x.lineTo(c + w, y + h - r);
    x.quadraticCurveTo(c + w, y + h, c + w - r, y + h);
    x.lineTo(c + r, y + h);
    x.quadraticCurveTo(c, y + h, c, y + h - r);
    x.lineTo(c, y + r);
    x.quadraticCurveTo(c, y, c + r, y);
    x.closePath();
  }

  function buildLane(wet, plain) {
    var o = offscreen(W, H);
    var x = o.x;
    var s = L.s;
    seedN = wet ? 77 : 11;
    x.fillStyle = wet ? COL.bgWet : COL.bg;
    x.fillRect(0, 0, W, H);
    // Asphalt grain.
    for (var i = 0; i < 1400; i++) {
      x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.25)';
      x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
    }
    // Pit wall on the far left, the fast lane, the divider.
    var wallX = Math.max(0, L.fx - 1.9 * s);
    x.fillStyle = '#20252d';
    x.fillRect(wallX - 10, 0, 10, H);
    x.fillStyle = 'rgba(238,241,244,0.5)';
    x.fillRect(wallX, 0, 2, H);
    x.fillStyle = wet ? 'rgba(20,28,38,0.7)' : COL.fast;
    x.fillRect(wallX + 2, 0, L.divX - wallX - 2, H);
    x.fillStyle = 'rgba(238,241,244,0.55)';
    for (var yy = -10; yy < H; yy += 34) x.fillRect(L.divX - 1.5, yy, 3, 18);
    // The working lane and our box.
    x.fillStyle = wet ? 'rgba(30,38,48,0.85)' : COL.lane;
    x.fillRect(L.divX + 1.5, 0, L.garageX - L.divX - 1.5, H);
    if (plain) {
      x.fillStyle = '#07090C';
      x.fillRect(L.garageX, 0, W - L.garageX, H);
      return o.c;
    }
    var bw = 3.0 * s, bh = 6.6 * s;
    var bx0 = L.bx - bw / 2, by0 = L.by - bh / 2 + 0.1 * s;
    x.strokeStyle = COL.paint;
    x.lineWidth = 3;
    x.strokeRect(bx0, by0, bw, bh);
    // The marker: a T across the box where the nose stops.
    x.fillStyle = COL.paint;
    x.fillRect(bx0 + 4, L.markerY - 2, bw - 8, 4);
    x.fillRect(L.bx - 2, L.markerY - 0.5 * s, 4, 0.5 * s);
    // Wheel marks.
    for (var c = 0; c < 4; c++) {
      var p = wheelPos(c, L.bx, L.by, 0);
      x.fillStyle = 'rgba(229,193,58,0.55)';
      x.fillRect(p.x - 0.25 * s, p.y - 0.42 * s, 0.5 * s, 3);
      x.fillRect(p.x - 0.25 * s, p.y + 0.42 * s - 3, 0.5 * s, 3);
    }
    // Box number painted on the ground behind the car.
    x.fillStyle = 'rgba(229,193,58,0.18)';
    x.font = '600 ' + Math.round(0.9 * s) + 'px ' + FONT;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('07', L.bx, by0 + bh + 0.7 * s);
    // The garage: a dark opening with a lit edge, tyre stacks and a gantry.
    x.fillStyle = '#07090C';
    x.fillRect(L.garageX, 0, W - L.garageX, H);
    x.fillStyle = 'rgba(238,241,244,0.12)';
    x.fillRect(L.garageX, 0, 3, H);
    for (var k = 0; k < 3; k++) {
      var ty = L.by - 2.4 * s + k * 1.6 * s;
      var tx = L.garageX + 0.75 * s;
      if (tx + 0.4 * s > W) break;
      for (var j = 0; j < 2; j++) {
        x.beginPath();
        x.arc(tx + j * 0.0, ty + j * 0.62 * s, 0.32 * s, 0, Math.PI * 2);
        x.fillStyle = '#121418';
        x.fill();
        x.lineWidth = 2;
        x.strokeStyle = '#262b33';
        x.stroke();
      }
    }
    // Floodlight pools (night) or wet sheen and reflections.
    var pools = [[L.bx, L.by - 1.5 * s, 4.6 * s], [L.fx, L.by - 5 * s, 3.4 * s], [L.fx, L.by + 4 * s, 3.4 * s]];
    for (var q = 0; q < pools.length; q++) {
      var pl = pools[q];
      var gr = x.createRadialGradient(pl[0], pl[1], 0, pl[0], pl[1], pl[2]);
      gr.addColorStop(0, wet ? 'rgba(150,190,230,0.12)' : 'rgba(255,244,220,0.10)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr;
      x.fillRect(pl[0] - pl[2], pl[1] - pl[2], pl[2] * 2, pl[2] * 2);
    }
    if (wet) {
      for (var r = 0; r < 14; r++) {
        var rx = rnd() * W, ry = rnd() * H;
        var rg = x.createLinearGradient(rx, ry, rx, ry + 60 + rnd() * 80);
        rg.addColorStop(0, 'rgba(160,200,240,0.10)');
        rg.addColorStop(1, 'rgba(160,200,240,0)');
        x.fillStyle = rg;
        x.fillRect(rx, ry, 2 + rnd() * 4, 140);
      }
    }
    return o.c;
  }

  function vignette() {
    if (!layers.vig) {
      var o = offscreen(W, H);
      var vg = o.x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      o.x.fillStyle = vg;
      o.x.fillRect(0, 0, W, H);
      layers.vig = o.c;
    }
    return layers.vig;
  }

  function lane(wet, plain) {
    var k = (wet ? 'wet' : 'night') + (plain ? 'Plain' : '');
    if (!layers[k]) layers[k] = buildLane(wet, plain);
    return layers[k];
  }

  /** The car body (no wheels), nose up, centred, in its own canvas. */
  function buildCar(rival) {
    var s = L.s;
    var w = 2.2 * s, h = 5.6 * s;
    var o = offscreen(w, h);
    var x = o.x;
    x.translate(w / 2, h / 2);
    var body = rival ? COL.rival : COL.body;
    // Rear wing.
    x.fillStyle = '#15181d';
    x.fillRect(-0.72 * s, 2.25 * s, 1.44 * s, 0.32 * s);
    // Floor.
    x.fillStyle = '#0d0f12';
    x.beginPath();
    x.moveTo(-0.6 * s, -0.9 * s); x.lineTo(0.6 * s, -0.9 * s); x.lineTo(0.68 * s, 1.6 * s); x.lineTo(0.4 * s, 2.25 * s);
    x.lineTo(-0.4 * s, 2.25 * s); x.lineTo(-0.68 * s, 1.6 * s); x.closePath(); x.fill();
    // Body.
    var gr = x.createLinearGradient(-0.65 * s, 0, 0.65 * s, 0);
    gr.addColorStop(0, body);
    gr.addColorStop(0.5, rival ? '#262b33' : COL.bodyHi);
    gr.addColorStop(1, body);
    x.fillStyle = gr;
    x.beginPath();
    x.moveTo(0, -2.62 * s);
    x.quadraticCurveTo(0.14 * s, -2.4 * s, 0.17 * s, -1.6 * s);
    x.lineTo(0.3 * s, -0.95 * s);
    x.lineTo(0.62 * s, -0.35 * s);
    x.lineTo(0.62 * s, 1.15 * s);
    x.quadraticCurveTo(0.5 * s, 1.9 * s, 0.24 * s, 2.25 * s);
    x.lineTo(-0.24 * s, 2.25 * s);
    x.quadraticCurveTo(-0.5 * s, 1.9 * s, -0.62 * s, 1.15 * s);
    x.lineTo(-0.62 * s, -0.35 * s);
    x.lineTo(-0.3 * s, -0.95 * s);
    x.lineTo(-0.17 * s, -1.6 * s);
    x.quadraticCurveTo(-0.14 * s, -2.4 * s, 0, -2.62 * s);
    x.closePath();
    x.fill();
    // Front wing.
    x.fillStyle = '#15181d';
    x.fillRect(-0.86 * s, -2.62 * s, 1.72 * s, 0.22 * s);
    x.fillStyle = rival ? '#3a414c' : '#59616d';
    x.fillRect(-0.86 * s, -2.36 * s, 1.72 * s, 0.06 * s);
    // Nose band and centre line: our car's one mark; rivals stay dim.
    x.fillStyle = rival ? '#4b525d' : COL.ink;
    x.fillRect(-0.15 * s, -2.05 * s, 0.3 * s, 0.16 * s);
    if (!rival) {
      x.fillStyle = 'rgba(238,241,244,0.55)';
      x.fillRect(-0.025 * s, -0.9 * s, 0.05 * s, 3.0 * s);
    }
    // Cockpit and helmet.
    x.fillStyle = '#07080a';
    roundRect(x, -0.2 * s, -0.75 * s, 0.4 * s, 0.75 * s, 0.18 * s);
    x.fill();
    x.beginPath();
    x.arc(0, -0.42 * s, 0.16 * s, 0, Math.PI * 2);
    x.fillStyle = rival ? '#7d8693' : '#d8dde4';
    x.fill();
    x.beginPath();
    x.arc(0, -0.42 * s, 0.16 * s, Math.PI * 1.1, Math.PI * 1.9);
    x.lineWidth = 0.07 * s;
    x.strokeStyle = '#0b0d10';
    x.stroke();
    if (rival) {
      x.fillStyle = COL.red;
      x.fillRect(-0.08 * s, 2.5 * s, 0.16 * s, 0.08 * s);
    }
    return { c: o.c, w: w, h: h };
  }

  function buildCrew() {
    var s = L.s;
    var w = 0.9 * s, h = 0.9 * s;
    var o = offscreen(w, h);
    var x = o.x;
    x.translate(w / 2, h / 2);
    // Seen from above, facing up: arms reaching forward, shoulders with a reflective stripe, the helmet
    // with its dark visor. A thin rim light keeps the dark suit readable on the dark lane.
    x.lineWidth = Math.max(1, 0.03 * s);
    x.strokeStyle = 'rgba(238,241,244,0.28)';
    x.fillStyle = '#2b323c';
    x.beginPath();
    x.ellipse(0, 0.06 * s, 0.37 * s, 0.2 * s, 0, 0, Math.PI * 2);
    x.fill();
    x.stroke();
    x.fillStyle = 'rgba(200,208,218,0.6)';
    x.fillRect(-0.3 * s, 0.13 * s, 0.6 * s, 0.04 * s);
    x.beginPath();
    x.arc(0, 0.02 * s, 0.155 * s, 0, Math.PI * 2);
    x.fillStyle = '#d4d9e0';
    x.fill();
    x.beginPath();
    x.arc(0, 0.02 * s, 0.155 * s, Math.PI * 1.12, Math.PI * 1.88);
    x.lineWidth = 0.07 * s;
    x.strokeStyle = '#0b0d10';
    x.stroke();
    return { c: o.c, w: w, h: h };
  }

  function sprite(name) {
    if (!sprites[name]) {
      if (name === 'car') sprites[name] = buildCar(false);
      else if (name === 'rival') sprites[name] = buildCar(true);
      else sprites[name] = buildCrew();
    }
    return sprites[name];
  }

  // ---- effects ----

  function burst(x, y, kind) {
    var n = reduced ? 4 : kind === 'big' ? 18 : 10;
    for (var i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
      var a = rnd() * Math.PI * 2;
      var sp = (kind === 'big' ? 160 : 110) + rnd() * 160;
      particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.22 + rnd() * 0.18, age: 0, col: kind === 'red' ? COL.red : rnd() < 0.6 ? '#fff4d6' : COL.amber });
    }
  }

  function smoke(x, y) {
    for (var i = 0; i < 5 && particles.length < MAX_PARTICLES; i++) {
      particles.push({ x: x + (rnd() - 0.5) * 20, y: y, vx: (rnd() - 0.5) * 30, vy: 20 + rnd() * 40, life: 0.6 + rnd() * 0.4, age: 0, col: 'smoke', r: 6 + rnd() * 6 });
    }
  }

  function popup(text, x, y, col, size) {
    popups.push({ text: text, x: x, y: y, col: col || COL.ink, age: 0, life: 0.9, size: size || 22 });
    if (popups.length > 6) popups.shift();
  }

  function shake(amp) {
    if (reduced) return;
    shakeAmp = Math.max(shakeAmp, amp);
    shakeT = 0;
  }

  function stepEffects(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.9; p.vy *= 0.9;
    }
    for (var j = popups.length - 1; j >= 0; j--) {
      popups[j].age += dt;
      if (popups[j].age >= popups[j].life) popups.splice(j, 1);
    }
    if (shakeAmp > 0) {
      shakeT += dt;
      shakeAmp *= Math.exp(-dt * 14);
      if (shakeAmp < 0.2) shakeAmp = 0;
    }
  }

  function busy() {
    return particles.length > 0 || popups.length > 0 || shakeAmp > 0;
  }

  function clearEffects() {
    particles.length = 0;
    popups.length = 0;
    shakeAmp = 0;
  }

  // ---- drawing helpers ----

  function text(str, x, y, size, col, align, weight) {
    g.font = (weight || 600) + ' ' + size + 'px ' + FONT;
    g.fillStyle = col;
    g.textAlign = align || 'center';
    g.textBaseline = 'middle';
    g.fillText(str, x, y);
  }

  var glyphs = {};
  /** A glowing glyph, drawn once with shadowBlur into its own canvas and reused every frame. */
  function glyph(ch, size, col) {
    var k = ch + '|' + size + '|' + col + '|' + D;
    var gl = glyphs[k];
    if (gl) return gl;
    var pad = Math.ceil(size * 0.35);
    var mx = document.createElement('canvas').getContext('2d');
    mx.font = '600 ' + size + 'px ' + FONT;
    var w = Math.ceil(mx.measureText(ch).width) + pad * 2;
    var h = Math.ceil(size * 1.2) + pad * 2;
    var o = offscreen(w, h);
    o.x.font = '600 ' + size + 'px ' + FONT;
    o.x.textAlign = 'center';
    o.x.textBaseline = 'alphabetic';
    o.x.shadowColor = col;
    o.x.shadowBlur = size * 0.32;
    o.x.fillStyle = col;
    o.x.globalAlpha = 0.55;
    o.x.fillText(ch, w / 2, pad + size);
    o.x.shadowBlur = 0;
    o.x.globalAlpha = 1;
    o.x.fillText(ch, w / 2, pad + size);
    gl = glyphs[k] = { c: o.c, w: w, h: h, pad: pad };
    var keys = Object.keys(glyphs);
    if (keys.length > 160) delete glyphs[keys[0]];
    return gl;
  }

  /** Digits drawn in fixed cells so a running stopwatch never jitters, with a soft glow. */
  /** The width digits() gives a string at this size. */
  function digitsWidth(str, size) {
    g.font = '600 ' + size + 'px ' + FONT;
    var cell = g.measureText('0').width;
    var w = 0;
    for (var i = 0; i < str.length; i++) w += str[i] === '.' ? cell * 0.45 : cell;
    return w;
  }

  function digits(str, cx, y, size, col) {
    g.font = '600 ' + size + 'px ' + FONT;
    var cell = g.measureText('0').width;
    var dot = cell * 0.45;
    var w = 0;
    for (var i = 0; i < str.length; i++) w += str[i] === '.' ? dot : cell;
    var x = cx - w / 2;
    for (var j = 0; j < str.length; j++) {
      var cw = str[j] === '.' ? dot : cell;
      var gl = glyph(str[j], size, col);
      g.drawImage(gl.c, x + cw / 2 - gl.w / 2, y - size - gl.pad, gl.w, gl.h);
      x += cw;
    }
    return w;
  }

  function drawIcon(name, x, y, size, col) {
    var paths = icons.path(name);
    g.save();
    g.translate(x - size / 2, y - size / 2);
    g.scale(size / 256, size / 256);
    g.fillStyle = col;
    for (var i = 0; i < paths.length; i++) g.fill(paths[i]);
    g.restore();
  }

  function pill(str, x, y, size, fg, bg) {
    g.font = '600 ' + size + 'px ' + FONT;
    var w = g.measureText(str).width + size * 1.4;
    var h = size * 1.9;
    g.fillStyle = bg;
    roundRect(g, x - w / 2, y - h / 2, w, h, h / 2);
    g.fill();
    text(str, x, y + 1, size, fg);
  }

  // ---- the scene ----

  function drawCar(spr, cx, cy, angle, lift) {
    var sc = 1 + (lift || 0) * 0.035;
    g.save();
    g.translate(cx, cy);
    if (angle) g.rotate(angle);
    if (lift) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(-spr.w / 2 + 6, -spr.h / 2 + 10, spr.w, spr.h - 12);
    }
    g.scale(sc, sc);
    g.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    g.restore();
  }

  function drawWheel(x, y, front, off, alpha) {
    var s = L.s;
    var w = (front ? 0.34 : 0.4) * s, h = (front ? 0.62 : 0.7) * s;
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.fillStyle = COL.tyre;
    roundRect(g, x - w / 2 + off, y - h / 2, w, h, 0.08 * s);
    g.fill();
    g.fillStyle = '#20242b';
    g.fillRect(x - w / 2 + off + 2, y - 1, w - 4, 2);
    g.globalAlpha = 1;
  }

  /** The four wheels of a car centred at (cx, cy); slide offsets per corner while a wheel is changed. */
  function drawWheels(cx, cy, angle, slide) {
    g.save();
    g.translate(cx, cy);
    if (angle) g.rotate(angle);
    for (var c = 0; c < 4; c++) {
      var p = wheelPos(c, 0, 0, 0);
      var side = c % 2 === 0 ? -1 : 1;
      var off = slide ? slide[c] * side * 0.7 * L.s : 0;
      drawWheel(p.x, p.y, c < 2, off, slide && slide[c] > 0.95 ? 0.4 : 1);
    }
    g.restore();
  }

  function drawCrew(working, phaseT, carCy) {
    var spr = sprite('crew');
    var s = L.s;
    var spots = [];
    for (var c = 0; c < 4; c++) {
      var p = wheelPos(c, L.bx, carCy, 0.95);
      spots.push([p.x, p.y, c % 2 === 0 ? Math.PI / 2 : -Math.PI / 2]);
    }
    spots.push([L.bx, carCy - 3.35 * s, Math.PI]);
    spots.push([L.bx, carCy + 3.3 * s, 0]);
    for (var i = 0; i < spots.length; i++) {
      var sp = spots[i];
      var bob = working ? Math.sin(phaseT * 9 + i) * 0.03 * s : 0;
      g.save();
      g.translate(sp[0], sp[1] + bob);
      g.rotate(sp[2]);
      g.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      if (i < 4) {
        g.fillStyle = '#0b0d10';
        g.fillRect(-0.06 * s, -0.56 * s, 0.12 * s, 0.26 * s); // the wheel gun
      }
      g.restore();
    }
  }

  function drawRing(p, fill, zone, state, label, active, next, now) {
    var r = p.r;
    var a0 = -Math.PI / 2;
    g.lineCap = 'round';
    // A dark disc so the ring reads over the car and the crew, then the track.
    g.beginPath();
    g.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
    g.fillStyle = active ? 'rgba(8,10,13,0.72)' : 'rgba(8,10,13,0.45)';
    g.fill();
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.lineWidth = 7;
    g.strokeStyle = active ? 'rgba(238,241,244,0.2)' : 'rgba(238,241,244,0.1)';
    g.stroke();
    if (active && state !== 'stuck' && state !== 'cross') {
      // The clean zone at the end of the fill.
      g.beginPath();
      g.arc(p.x, p.y, r, a0 + (1 - zone) * Math.PI * 2, a0 + Math.PI * 2);
      g.lineWidth = 12;
      g.strokeStyle = 'rgba(53,212,131,0.30)';
      g.stroke();
    }
    if (fill > 0) {
      var inZone = fill >= 1 - zone;
      g.beginPath();
      g.arc(p.x, p.y, r, a0, a0 + fill * Math.PI * 2);
      g.lineWidth = 8;
      g.strokeStyle = state === 'stuck' || state === 'cross' ? COL.red : fill >= 1 ? COL.green : inZone ? '#bff5d8' : COL.ink;
      g.stroke();
    }
    if (state === 'stuck' || state === 'cross') {
      var pulse = 0.5 + 0.5 * Math.sin(now * 18);
      g.beginPath();
      g.arc(p.x, p.y, r * 0.62, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,59,48,' + (0.25 + 0.35 * pulse).toFixed(3) + ')';
      g.fill();
    } else if (active && fill >= 1) {
      var pz = 0.5 + 0.5 * Math.sin(now * 10);
      g.beginPath();
      g.arc(p.x, p.y, r * (1.12 + 0.06 * pz), 0, Math.PI * 2);
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(53,212,131,0.7)';
      g.stroke();
    }
    if (next) {
      g.setLineDash([4, 6]);
      g.beginPath();
      g.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(238,241,244,0.55)';
      g.stroke();
      g.setLineDash([]);
    }
    if (label) text(label, p.x, p.y + 1, Math.round(r * 0.62), active ? COL.ink : 'rgba(238,241,244,0.5)');
  }

  function drawLamp(state, now) {
    var x = L.lampX, y = L.lampY, r = L.lampR;
    // Housing.
    g.beginPath();
    g.arc(x, y, r + 6, 0, Math.PI * 2);
    g.fillStyle = '#0a0c0f';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = '#2b323c';
    g.stroke();
    var col = state === 'red' ? COL.red : state === 'green' ? COL.green : state === 'armed' ? '#d9dee5' : '#1d2229';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = col;
    g.fill();
    if (state === 'red' || state === 'green') {
      g.beginPath();
      g.arc(x, y, r + 14, 0, Math.PI * 2);
      g.fillStyle = state === 'red' ? 'rgba(255,59,48,0.16)' : 'rgba(53,212,131,0.16)';
      g.fill();
    }
    if (state === 'armed') {
      var pz = 0.5 + 0.5 * Math.sin(now * 8);
      g.beginPath();
      g.arc(x, y, r + 10 + pz * 6, 0, Math.PI * 2);
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(238,241,244,' + (0.35 + 0.4 * pz).toFixed(3) + ')';
      g.stroke();
    }
    drawIcon('hand-tap', x, y + 2, r * 0.9, state === 'idle' ? 'rgba(238,241,244,0.18)' : 'rgba(10,12,15,0.75)');
  }

  function drawRivals(st, t) {
    var passes = stopM.rivalPasses(st);
    var spr = sprite('rival');
    for (var i = 0; i < passes.length; i++) {
      var nose = stopM.rivalPos(passes[i], t);
      var cy = L.markerY - nose * L.s + 2.7 * L.s;
      if (cy < -spr.h || cy > H + spr.h) continue;
      drawWheels(L.fx, cy, 0, null);
      drawCar(spr, L.fx, cy, 0, 0);
    }
  }

  /** Our car's screen centre and heading from its nose position (metres past the marker). */
  function carPose(nose, side) {
    var s = L.s;
    var cy = L.markerY - nose * s + 2.7 * s;
    var x, ang = 0;
    if (side > 0) {
      var u = side;
      x = L.bx + (L.fx - L.bx) * u;
      ang = -Math.sin(u * Math.PI) * 0.35;
    } else if (nose < -3.2) {
      var k = Math.min(1, Math.max(0, (-nose - 3.2) / 6.0));
      var e = k * k * (3 - 2 * k);
      x = L.bx + (L.fx - L.bx) * e;
      ang = Math.sin(k * Math.PI) * 0.32;
    } else {
      x = L.bx;
    }
    return { x: x, y: cy, a: ang };
  }

  function drawGantry(lit, now) {
    var n = 5;
    var pw = Math.min(54, (L.cw - 60) / n);
    var gap = pw * 0.22;
    var total = n * pw + (n - 1) * gap;
    var x0 = L.left + (L.cw - total) / 2;
    var y = L.pitTop + Math.min(120, L.pitH * 0.24);
    g.fillStyle = '#05070a';
    roundRect(g, x0 - 12, y - pw * 1.25, total + 24, pw * 2.5, 10);
    g.fill();
    for (var i = 0; i < n; i++) {
      var cx = x0 + i * (pw + gap) + pw / 2;
      for (var j = 0; j < 2; j++) {
        var cy = y + (j === 0 ? -pw * 0.55 : pw * 0.55);
        var on = j === 1 && i < lit;
        if (on) {
          g.beginPath();
          g.arc(cx, cy, pw * 0.62, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,59,48,0.22)';
          g.fill();
        }
        g.beginPath();
        g.arc(cx, cy, pw * 0.4, 0, Math.PI * 2);
        g.fillStyle = on ? COL.red : '#1a1e24';
        g.fill();
      }
    }
    return y + pw * 1.25;
  }

  function skyIcon(kind, x, y, r) {
    // 0 sun, 1 cloud, 2 drizzle, 3 rain
    if (kind === 0) {
      g.beginPath();
      g.arc(x, y, r * 0.42, 0, Math.PI * 2);
      g.fillStyle = COL.amber;
      g.fill();
      g.strokeStyle = COL.amber;
      g.lineWidth = 2.5;
      for (var i = 0; i < 8; i++) {
        var a = (i * Math.PI) / 4;
        g.beginPath();
        g.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
        g.lineTo(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82);
        g.stroke();
      }
      return;
    }
    var cy = kind === 1 ? y : y - r * 0.2;
    g.fillStyle = kind === 3 ? '#7b8594' : '#c3cad3';
    g.beginPath();
    g.arc(x - r * 0.32, cy + r * 0.05, r * 0.32, 0, Math.PI * 2);
    g.arc(x + r * 0.05, cy - r * 0.15, r * 0.4, 0, Math.PI * 2);
    g.arc(x + r * 0.4, cy + r * 0.08, r * 0.28, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x - r * 0.62, cy + r * 0.05, r * 1.25, r * 0.3);
    if (kind >= 2) {
      g.strokeStyle = '#7cc0ff';
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      var drops = kind === 2 ? 3 : 4;
      for (var d = 0; d < drops; d++) {
        var dx = x - r * 0.45 + d * (r * 0.9 / (drops - 1));
        g.beginPath();
        g.moveTo(dx, cy + r * 0.5);
        g.lineTo(dx - r * 0.12, cy + (kind === 2 ? r * 0.68 : r * 0.92));
        g.stroke();
      }
    }
  }

  function drawCall(call, fittedTyre, now) {
    var y = L.pitTop + Math.min(110, L.pitH * 0.22);
    var w = Math.min(L.cw - 40, 380);
    var x0 = L.left + (L.cw - w) / 2;
    g.fillStyle = COL.panel;
    roundRect(g, x0, y - 54, w, 108, 14);
    g.fill();
    if (call.type === 'sc') {
      var bw = 150, bh = 70;
      var bx = W / 2 - bw / 2;
      g.fillStyle = COL.paint;
      roundRect(g, bx, y - bh / 2, bw, bh, 8);
      g.fill();
      text(call.ending ? 'SC IN' : 'SC', W / 2, y + 2, 40, '#0b0d10', 'center', 700);
      var on = !call.ending && Math.floor(now * 3) % 2 === 0;
      for (var k = 0; k < 2; k++) {
        var lx = k === 0 ? bx - 22 : bx + bw + 22;
        var lon = call.ending ? false : k === 0 ? on : !on;
        g.beginPath();
        g.arc(lx, y, 13, 0, Math.PI * 2);
        g.fillStyle = lon ? COL.amber : '#2b2f36';
        g.fill();
        if (lon) {
          g.beginPath();
          g.arc(lx, y, 22, 0, Math.PI * 2);
          g.fillStyle = 'rgba(242,193,78,0.2)';
          g.fill();
        }
      }
      return;
    }
    var cell = w / 5;
    for (var i = 0; i < 5; i++) {
      var cx = x0 + cell * i + cell / 2;
      if (i > 0) {
        g.fillStyle = 'rgba(238,241,244,0.08)';
        g.fillRect(x0 + cell * i, y - 40, 1, 80);
      }
      skyIcon(call.cells[i], cx, y - 8, Math.min(26, cell * 0.36));
      text(String(i + 1), cx, y + 36, 13, COL.muted);
    }
  }

  function drawHud(h, now) {
    var cx = W / 2;
    var y = L.top + 58;
    // The stopwatch.
    digits(h.watch, cx, y, 62, h.watchCol || COL.ink);
    // The timing ruler: 1.60 to 2.60, the two tenths between the record and 2.00 lit.
    var rw = Math.min(L.cw - 150, 280);
    var rx = cx - rw / 2;
    var ry = L.top + 82;
    var lo = 1.6, hi = 2.6;
    var X = function (v) { return rx + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * rw; };
    g.fillStyle = 'rgba(176,124,255,0.22)';
    g.fillRect(rx, ry - 6, X(1.8) - rx, 12);
    g.fillStyle = 'rgba(53,212,131,0.30)';
    g.fillRect(X(1.8), ry - 6, X(2.0) - X(1.8), 12);
    g.fillStyle = 'rgba(238,241,244,0.10)';
    g.fillRect(X(2.0), ry - 1, rx + rw - X(2.0), 2);
    for (var v = 1.6; v <= 2.6001; v += 0.1) {
      var tx = X(v);
      g.fillStyle = 'rgba(238,241,244,0.4)';
      g.fillRect(tx - 0.5, ry + 7, 1, 5);
    }
    g.fillStyle = COL.purple;
    g.fillRect(X(1.8) - 1, ry - 9, 2, 18);
    g.fillStyle = COL.green;
    g.fillRect(X(2.0) - 1, ry - 9, 2, 18);
    text('1.80', X(1.8), ry + 20, 12, COL.purple);
    text('2.00', X(2.0), ry + 20, 12, COL.green);
    if (h.best) {
      g.fillStyle = COL.ink;
      g.fillRect(X(h.best) - 1, ry + 7, 2, 9);
    }
    if (h.target) {
      g.fillStyle = COL.amber;
      g.fillRect(X(h.target) - 1.5, ry - 11, 3, 22);
    }
    if (h.marker != null) {
      var mx = X(h.marker);
      g.fillStyle = h.marker > hi ? COL.red : COL.ink;
      g.beginPath();
      g.moveTo(mx, ry - 8);
      g.lineTo(mx - 6, ry - 17);
      g.lineTo(mx + 6, ry - 17);
      g.closePath();
      g.fill();
      g.fillRect(mx - 1, ry - 8, 2, 16);
    }
    // Position chip (race) or rung chip (Stop Rush), top left.
    var px = L.left + 16, py = L.top + 4;
    if (h.pos != null || h.rung != null) {
      g.fillStyle = COL.panel;
      roundRect(g, px, py, 64, 40, 6);
      g.fill();
      g.fillStyle = COL.paint;
      g.fillRect(px, py, 4, 40);
      if (h.pos != null) {
        text('P' + h.pos, px + 36, py + 21, 26, COL.ink);
      } else {
        drawIcon('lightning', px + 20, py + 20, 18, COL.amber);
        text(String(h.rung), px + 44, py + 21, 24, COL.ink);
      }
      // Race progress: the start and three stops.
      if (h.steps) {
        for (var i = 0; i < h.steps.length; i++) {
          g.beginPath();
          g.arc(px + 10 + i * 15, py + 52, 4, 0, Math.PI * 2);
          g.fillStyle = h.steps[i] === 2 ? COL.ink : h.steps[i] === 1 ? COL.paint : 'rgba(238,241,244,0.18)';
          g.fill();
        }
      }
      if (h.pos != null && h.posDelta && h.posAge < 1.6) {
        // Places won or lost by the last part, beside the chip: full strength, then a short fade. On a
        // narrow screen the stopwatch reaches the chip's side, so the pill sits under the chip instead.
        var label = (h.posDelta > 0 ? '+' : '') + h.posDelta;
        g.font = '600 16px ' + FONT;
        var pw = g.measureText(label).width + 16 * 1.4;
        var beside = px + 92 + pw / 2 + 6 <= cx - digitsWidth(h.watch, 62) / 2;
        g.globalAlpha = Math.max(0, Math.min(1, (1.6 - h.posAge) / 0.4));
        var slide = Math.min(1, h.posAge / 0.18);
        if (beside) pill(label, px + 92 - (1 - slide) * 10, py + 20, 16, '#0b0d10', h.posDelta > 0 ? COL.green : COL.red);
        else pill(label, px + 32, py + 73 - (1 - slide) * 8, 15, '#0b0d10', h.posDelta > 0 ? COL.green : COL.red);
        g.globalAlpha = 1;
      }
    }
  }

  function drawRain(dt) {
    var n = reduced ? 24 : 70;
    while (rain.length < n) rain.push({ x: rnd() * W, y: rnd() * H, v: 700 + rnd() * 500, l: 10 + rnd() * 16 });
    g.strokeStyle = 'rgba(170,205,240,0.28)';
    g.lineWidth = 1.2;
    g.beginPath();
    for (var i = 0; i < rain.length; i++) {
      var d = rain[i];
      d.y += d.v * dt;
      d.x -= d.v * dt * 0.12;
      if (d.y > H) { d.y = -20; d.x = rnd() * W * 1.1; }
      g.moveTo(d.x, d.y);
      g.lineTo(d.x + d.l * 0.12, d.y - d.l);
    }
    g.stroke();
  }

  function drawEffects() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var k = 1 - p.age / p.life;
      if (p.col === 'smoke') {
        g.globalAlpha = 0.25 * k;
        g.beginPath();
        g.arc(p.x, p.y, p.r * (1.6 - k * 0.6), 0, Math.PI * 2);
        g.fillStyle = '#9aa3ae';
        g.fill();
      } else {
        g.globalAlpha = k;
        g.fillStyle = p.col;
        g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
    }
    g.globalAlpha = 1;
    for (var j = 0; j < popups.length; j++) {
      var q = popups[j];
      var u = q.age / q.life;
      var e = 1 - Math.pow(1 - Math.min(1, u * 3), 3);
      g.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
      pill(q.text, q.x, q.y - e * 22, q.size, '#0b0d10', q.col);
      g.globalAlpha = 1;
    }
  }

  function drawHint(h, now) {
    if (!h) return;
    var y = h.y;
    g.font = '600 16px ' + FONT;
    var maxW = Math.min(L.cw - 40, 360);
    var words = String(h.text).split(' ');
    var lines = [];
    var cur = '';
    for (var i = 0; i < words.length; i++) {
      var tryLine = cur ? cur + ' ' + words[i] : words[i];
      if (g.measureText(tryLine).width > maxW - 28 && cur) { lines.push(cur); cur = words[i]; } else cur = tryLine;
    }
    if (cur) lines.push(cur);
    var lh = 21;
    var w = 0;
    for (var k = 0; k < lines.length; k++) w = Math.max(w, g.measureText(lines[k]).width);
    w += 28;
    var hh = lines.length * lh + 16;
    g.fillStyle = 'rgba(238,241,244,0.94)';
    roundRect(g, W / 2 - w / 2, y - hh / 2, w, hh, 10);
    g.fill();
    for (var j = 0; j < lines.length; j++) text(lines[j], W / 2, y - hh / 2 + 8 + lh / 2 + j * lh, 16, '#0b0d10');
    if (h.thumb) {
      var pz = 0.5 + 0.5 * Math.sin(now * 6);
      g.globalAlpha = 0.55 + 0.35 * pz;
      drawIcon('hand-tap', h.thumb.x + 22, h.thumb.y + 34 + pz * 5, 44, COL.ink);
      g.globalAlpha = 1;
    }
  }

  /**
   * One frame. v: { look: 'night'|'wet', t (scene time), dt, scene: 'menu'|'lights'|'call'|'stop'|'idle',
   * stop, lit, call, hud, hint, lamp, now }.
   */
  function frame(v) {
    if (!L) return;
    stepEffects(v.dt || 0);
    g.setTransform(D, 0, 0, D, 0, 0);
    var sx = 0, sy = 0;
    if (shakeAmp > 0) {
      sx = Math.sin(shakeT * 61) * shakeAmp;
      sy = Math.cos(shakeT * 47) * shakeAmp;
    }
    var oy = v.offsetY || 0;
    var z = v.zoom || 1;
    var bgLayer = lane(v.look === 'wet', !!v.plain);
    g.fillStyle = v.look === 'wet' ? COL.bgWet : COL.bg;
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(sx, sy);
    if (oy || z !== 1) {
      // The menu and result screens move (and on short screens shrink) the parked car into free space.
      g.translate(L.bx, L.by + oy);
      g.scale(z, z);
      g.translate(-L.bx, -L.by);
      var plainLayer = lane(v.look === 'wet', true);
      g.drawImage(plainLayer, 0, -H, W, H);
      g.drawImage(plainLayer, 0, H, W, H);
    }
    g.drawImage(bgLayer, 0, 0, W, H);
    var now = v.now || 0;
    var st = v.stop;
    var carCy = L.by;
    if (st) {
      var t = v.t;
      drawRivals(st, t);
      var nose = stopM.nose(st, t);
      var side = stopM.exitSide(st, t);
      var pose = carPose(nose, side);
      var lift = 0;
      if (st.tJackUp >= 0 && t >= st.tJackUp - stopM.JACK_UP) {
        lift = Math.min(1, (t - (st.tJackUp - stopM.JACK_UP)) / stopM.JACK_UP);
        if (st.tPress >= 0 && t >= st.tPress) lift = Math.max(0, 1 - (t - st.tPress) / stopM.DROP);
      }
      var slide = [0, 0, 0, 0];
      for (var i = 0; i < 4; i++) {
        var r = st.rings[i];
        var f = stopM.ringFill(r, st.cfg.fill, t);
        if (r.state === 'fill' || r.state === 'stuck' || r.state === 'cross') {
          slide[r.corner] = f < 0.5 ? f * 2 : (1 - f) * 2;
        }
      }
      drawCrew(st.phase === 'wheels', now, L.by);
      drawWheels(pose.x, pose.y, pose.a, slide);
      drawCar(sprite('car'), pose.x, pose.y, pose.a, lift);
      if (st.phase === 'wheels') {
        var next = st.wheel + 1 < 4 ? st.rings[st.wheel + 1].corner : -1;
        for (var k = 0; k < 4; k++) {
          var ring = st.rings[k];
          var active = k === st.wheel;
          if (ring.state === 'done' && !active) continue;
          if (!active && k !== st.wheel + 1) continue;
          drawRing(ringPos(ring.corner), active ? stopM.ringFill(ring, st.cfg.fill, t) : 0, st.cfg.zone, ring.state, String(k + 1), active, ring.corner === next && !active, now);
        }
      } else if (st.phase === 'jackup' || st.phase === 'approach') {
        // Show the called order before the wheels start.
        for (var m = 0; m < 4; m++) {
          var rr = ringPos(st.rings[m].corner);
          text(String(m + 1), rr.x, rr.y + 1, Math.round(L.ringR * 0.62), 'rgba(238,241,244,0.42)');
        }
      }
      if (st.phase === 'approach') {
        var pulse = 0.5 + 0.5 * Math.sin(now * 10);
        g.fillStyle = 'rgba(229,193,58,' + (0.4 + 0.5 * pulse).toFixed(3) + ')';
        g.fillRect(L.bx - 1.5 * L.s, L.markerY - 2, 3 * L.s, 4);
      }
    } else if (v.parked || v.scene !== 'menu') {
      drawCrew(false, now, L.by);
      if (v.parked) {
        drawWheels(L.bx, L.by, 0, null);
        drawCar(sprite('car'), L.bx, L.by, 0, 0);
      }
    }
    if (v.look === 'wet' && v.scene !== 'menu') drawRain(Math.min(0.05, v.dt || 0));
    if (v.scene === 'lights') drawGantry(v.lit || 0, now);
    if (v.scene === 'call' && v.call) drawCall(v.call, v.fitted, now);
    if (v.lamp) drawLamp(v.lamp, now);
    drawEffects();
    g.restore();
    g.drawImage(vignette(), 0, 0, W, H);
    if (v.hud) drawHud(v.hud, now);
    if (v.hint) drawHint(v.hint, now);
    if (v.flash) {
      g.fillStyle = v.flash;
      g.fillRect(0, 0, W, H);
    }
  }

  /** A small tyre glyph for the call buttons: 0 Dry (slick), 1 Inter (light grooves), 2 Wet (deep). */
  function tyreGlyph(kind, size) {
    var c = document.createElement('canvas');
    var d = Math.min(2, root.devicePixelRatio || 1);
    c.width = c.height = Math.round(size * d);
    c.style.width = c.style.height = size + 'px';
    var x = c.getContext('2d');
    x.scale(d, d);
    var r = size / 2;
    x.beginPath();
    x.arc(r, r, r - 1, 0, Math.PI * 2);
    x.fillStyle = '#0a0b0d';
    x.fill();
    x.lineWidth = 2;
    x.strokeStyle = '#EEF1F4';
    x.beginPath();
    x.arc(r, r, r * 0.68, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    x.arc(r, r, r * 0.34, 0, Math.PI * 2);
    x.fillStyle = '#5b636f';
    x.fill();
    if (kind > 0) {
      // Grooves cut into the tread band between the sidewall ring and the edge.
      x.save();
      x.beginPath();
      x.arc(r, r, r - 2, 0, Math.PI * 2);
      x.clip();
      x.strokeStyle = '#3a414c';
      x.lineCap = 'round';
      x.lineWidth = kind === 2 ? 3 : 2;
      var n = kind === 2 ? 14 : 8;
      for (var i = 0; i < n; i++) {
        var a = (i * Math.PI * 2) / n;
        x.beginPath();
        x.moveTo(r + Math.cos(a) * r * 0.78, r + Math.sin(a) * r * 0.78);
        x.lineTo(r + Math.cos(a + 0.22) * r * 0.93, r + Math.sin(a + 0.22) * r * 0.93);
        x.stroke();
      }
      x.restore();
    }
    return c;
  }

  /** The sky a tyre is for, as small icons on its call button (Dry: sun and cloud, Inter: drizzle, Wet:
   * rain), so the radar strip reads without a word: a cloud is still a dry lap. */
  function skyGlyph(kinds, size) {
    var c = document.createElement('canvas');
    var d = Math.min(2, root.devicePixelRatio || 1);
    var w = size * kinds.length;
    c.width = Math.round(w * d);
    c.height = Math.round(size * d);
    c.style.width = w + 'px';
    c.style.height = size + 'px';
    c.className = 'sky-glyph';
    var keep = g;
    g = c.getContext('2d');
    g.scale(d, d);
    for (var i = 0; i < kinds.length; i++) skyIcon(kinds[i], size * i + size / 2, size * 0.5, size * 0.48);
    g = keep;
    return c;
  }

  /** Builds the static layers and the stopwatch glyphs ahead of play, so no play frame pays for them. */
  function prewarm() {
    if (!L) return;
    lane(false); lane(true); vignette(); sprite('car'); sprite('rival'); sprite('crew');
    var cols = [COL.ink, COL.purple, COL.green, COL.amber, COL.red];
    for (var c = 0; c < cols.length; c++) {
      var chars = '0123456789.+';
      for (var i = 0; i < chars.length; i++) glyph(chars[i], 62, cols[c]);
    }
  }

  root.TT.render = {
    prewarm: prewarm,
    skyGlyph: skyGlyph,
    COL: COL, FONT: FONT, EDGE: EDGE, init: init, resize: resize, frame: frame, hit: hit, ringPos: ringPos,
    burst: burst, smoke: smoke, popup: popup, shake: shake, busy: busy, clearEffects: clearEffects,
    setReduced: setReduced, tyreGlyph: tyreGlyph, carPose: carPose,
    layout: function () { return L; }, size: function () { return { w: W, h: H, d: D }; }
  };
})(typeof self !== 'undefined' ? self : this);
