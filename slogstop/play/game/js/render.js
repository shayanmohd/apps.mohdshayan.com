/*
 * Drawing for Slogstop: the floodlit ground, the field, the heat map, the ball and its trace, the
 * stamps and the sparks, and the share card.
 *
 * Rendering budget (GAME-DESIGN.md section 7, WEBGAME-RECIPE.md section 2b):
 *   - The view canvas, the 0.6 scale fallback canvas and the ground layer are created and sized in
 *     init(), before the game calls Shell.ready(), and their backing stores are never sized again on
 *     a phone: they are made as large as the screen, and layout changes move the drawing, not the
 *     canvas. Only a desktop window grown past its first size enlarges them (no ads SDK runs there).
 *   - The ground (oval, stripes, ring, rope, pitch, floodlights) is drawn once per layout to the layer.
 *   - Frames are drawn only while something moves, at most about 60 a second (frames are skipped by
 *     the rAF timestamp on 120 Hz screens). Nothing is drawn on a still screen.
 *   - No per-frame shadowBlur and no big gradients: glows are pre-drawn sprites. At most 60 sparks.
 *   - Slow frames switch drawing to the 0.6 scale canvas, scaled up with drawImage.
 */
(function (root) {
  'use strict';
  var SS = root.SS || (root.SS = {});
  var model = SS.model;

  var C = {
    turf: '#0E2B21', stripe: '#12352A', chalk: '#E9EFE6', muted: '#9BB0A4', pitch: '#C8B78F',
    amber: '#FFB23E', coral: '#FF6A55', ink: '#06160F'
  };
  var MAX_SPARKS = 60;
  var FRAME_MS = 1000 / 60; // the draw rate cap: 60 frames a second whatever the screen refreshes at
  var RING_K = 0.52, DEEP_K = 0.86;

  var view, vctx, low, lctx, layer, gctx;
  var R = 1; // backing pixels per CSS px
  var LOW = 0.6;
  var bw = 0, bh = 0; // backing store size in CSS px
  var vw = 0, vh = 0; // the window in CSS px
  var lowMode = false;
  var reduce = false;
  var font = 'Archivo, system-ui, sans-serif';
  var words = { nb: 'NB' }; // the only text drawn on the ground, from the strings table (setWords)

  // geometry of the ground in CSS px
  var G = null;
  var layoutKey = '';
  var deco = null; // a decorative wagon wheel for the menu ground

  // scene
  var scene = {
    show: false, // draw the ground at all
    dim: 0,
    slots: [], // fielder places
    fielders: [], // { slot, x, y, hx, hy, tx, ty, t, dur }
    heat: null, // 7 weights (Defend): tints the zones
    labels: null, // 6 strings drawn in the zones
    labelKind: '',
    hot: -1, // a zone lit (the batter's pick on reveal)
    traces: [], // { pts, runs, kind, out, age }
    ball: null,
    stamp: null,
    sparks: [],
    shake: 0,
    drag: null, // { slot, x, y, target }
    badge: '',
    ends: true
  };

  var raf = 0;
  var lastDraw = 0;
  var nextDraw = 0; // when the next frame is due (rAF time), 0 while the loop is idle
  var slowFrames = 0;
  var frameTimes = [];
  var drawn = 0, drawMs = 0, maxMs = 0; // counters for the test bots
  var glowSprite = null, ballSprite = null;

  // ---------------------------------------------------------------- setup

  function init(canvas) {
    view = canvas;
    vctx = view.getContext('2d');
    var coarse = false;
    try { coarse = root.matchMedia && root.matchMedia('(pointer: coarse)').matches; } catch (e) { coarse = false; }
    R = Math.min(2, root.devicePixelRatio || 1);
    vw = Math.max(1, root.innerWidth || 1);
    vh = Math.max(1, root.innerHeight || 1);
    var sw = (root.screen && root.screen.width) || 0, sh = (root.screen && root.screen.height) || 0;
    bw = Math.ceil(coarse ? Math.max(vw, Math.min(sw, 1400)) : vw);
    bh = Math.ceil(coarse ? Math.max(vh, Math.min(sh, 1400)) : vh);
    view.width = Math.round(bw * R);
    view.height = Math.round(bh * R);
    sizeStyle();
    low = document.createElement('canvas');
    low.width = Math.round(bw * R * LOW);
    low.height = Math.round(bh * R * LOW);
    lctx = low.getContext('2d');
    layer = document.createElement('canvas');
    layer.width = view.width;
    layer.height = view.height;
    gctx = layer.getContext('2d');
    glowSprite = sprite(64, 'rgba(255,178,62,0.55)', 'rgba(255,178,62,0)');
    ballSprite = sprite(32, 'rgba(255,248,230,0.95)', 'rgba(255,220,150,0)');
  }

  function sizeStyle() {
    view.style.width = bw + 'px';
    view.style.height = bh + 'px';
  }

  /** The window changed size. Grows the backing stores only past their first size (a desktop window). */
  function resize() {
    vw = Math.max(1, root.innerWidth || 1);
    vh = Math.max(1, root.innerHeight || 1);
    if (vw > bw || vh > bh) {
      bw = Math.max(bw, Math.ceil(vw));
      bh = Math.max(bh, Math.ceil(vh));
      view.width = Math.round(bw * R);
      view.height = Math.round(bh * R);
      layer.width = view.width;
      layer.height = view.height;
      low.width = Math.round(bw * R * LOW);
      low.height = Math.round(bh * R * LOW);
      sizeStyle();
      layoutKey = '';
    }
  }

  function sprite(size, inner, outer) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function setReduced(v) { reduce = !!v; }
  function setFont(f) { font = f; }
  function setWords(w) { if (w && w.nb) words.nb = String(w.nb); }

  /**
   * Where the ground goes: { x, y, w, h } in CSS px, flip (1: the batter at the bottom end, -1: at the
   * top), dim (0 to 1, darker for a background), deco (draw the menu's wagon wheel).
   */
  function setLayout(o) {
    var key = [vw, vh, o.x, o.y, o.w, o.h, o.flip, o.dim || 0, o.deco ? 1 : 0, o.upright ? 1 : 0, R].join(',');
    var w = Math.max(60, o.w), h = Math.max(60, o.h);
    var size = Math.min(w, h);
    G = {
      x: o.x, y: o.y, w: w, h: h, size: size,
      cx: o.x + w / 2, cy: o.y + h / 2,
      rx: w * 0.47, ry: h * 0.475,
      flip: o.flip === -1 ? -1 : 1,
      upright: !!o.upright // text stays upright even for a batter at the top end (desktop: nobody sits opposite)
    };
    G.ph = G.size * 0.08;
    G.bx = G.cx;
    G.by = G.cy + G.flip * G.ph;
    scene.dim = o.dim || 0;
    scene.show = true;
    if (key !== layoutKey) {
      layoutKey = key;
      if (o.deco && !deco) deco = makeDeco();
      drawLayer(o.deco);
      placeFielders(false);
      rebuildTraces();
    }
    request();
  }

  function hide() {
    scene.show = false;
    request();
  }

  // ---------------------------------------------------------------- geometry

  function dirOf(angleDeg) {
    var a = angleDeg * Math.PI / 180;
    return { x: G.flip * Math.sin(a), y: -G.flip * Math.cos(a) };
  }

  /** The point where a ray from the batter at [angle] meets the ellipse scaled by k. */
  function rayTo(angleDeg, k) {
    var d = dirOf(angleDeg);
    var a = G.rx * k, b = G.ry * k;
    var px = G.bx - G.cx, py = G.by - G.cy;
    var A = (d.x * d.x) / (a * a) + (d.y * d.y) / (b * b);
    var B = 2 * ((px * d.x) / (a * a) + (py * d.y) / (b * b));
    var Cc = (px * px) / (a * a) + (py * py) / (b * b) - 1;
    var disc = Math.max(0, B * B - 4 * A * Cc);
    var t = (-B + Math.sqrt(disc)) / (2 * A);
    return { x: G.bx + d.x * t, y: G.by + d.y * t, t: t };
  }

  function slotPoint(s) {
    var z = model.slotZone(s);
    var deep = model.slotDeep(s);
    // ring and deep places sit a little either side of the zone's middle, clear of its label
    var ang = model.ZONES[z].angle + (deep ? 11 : -11);
    return rayTo(ang, deep ? DEEP_K : RING_K);
  }

  function zoneOfPoint(x, y) {
    if (!G) return -1;
    var dx = (x - G.bx) * G.flip, dy = (y - G.by) * G.flip;
    var ang = Math.atan2(dx, -dy) * 180 / Math.PI; // 0 straight, positive to the off side
    var best = -1, bd = 999;
    for (var z = 0; z < 6; z++) {
      var diff = Math.abs(((ang - model.ZONES[z].angle + 540) % 360) - 180);
      if (diff < bd) { bd = diff; best = z; }
    }
    return best;
  }

  // ---------------------------------------------------------------- the ground layer

  function drawLayer(withDeco) {
    var g = gctx;
    g.setTransform(R, 0, 0, R, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = C.turf;
    g.fillRect(0, 0, bw, bh);
    if (!G) return;
    // floodlight pools: four soft lights outside the oval, drawn once
    var corners = [[-0.9, -0.95], [0.9, -0.95], [-0.9, 0.95], [0.9, 0.95]];
    for (var i = 0; i < corners.length; i++) {
      var lx = G.cx + corners[i][0] * G.rx * 1.25, ly = G.cy + corners[i][1] * G.ry * 1.2;
      var gr = g.createRadialGradient(lx, ly, 0, lx, ly, G.size * 0.55);
      gr.addColorStop(0, 'rgba(210,235,215,0.10)');
      gr.addColorStop(1, 'rgba(210,235,215,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, bw, bh);
    }
    // the oval with mown stripes
    g.save();
    g.beginPath();
    g.ellipse(G.cx, G.cy, G.rx * 1.06, G.ry * 1.05, 0, 0, Math.PI * 2);
    g.fillStyle = '#0B241B';
    g.fill();
    g.beginPath();
    g.ellipse(G.cx, G.cy, G.rx, G.ry, 0, 0, Math.PI * 2);
    g.clip();
    var bands = 14;
    var bhgt = (G.ry * 2) / bands;
    for (var k = 0; k < bands; k++) {
      g.fillStyle = k % 2 ? C.stripe : '#103226';
      g.fillRect(G.cx - G.rx, G.cy - G.ry + k * bhgt, G.rx * 2, bhgt + 0.5);
    }
    var cg = g.createRadialGradient(G.cx, G.cy, G.ry * 0.2, G.cx, G.cy, G.ry * 1.05);
    cg.addColorStop(0, 'rgba(190,230,200,0.09)');
    cg.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = cg;
    g.fillRect(G.cx - G.rx, G.cy - G.ry, G.rx * 2, G.ry * 2);
    // the 30 yard ring
    g.setLineDash([5, 7]);
    g.lineWidth = 1.4;
    g.strokeStyle = 'rgba(233,239,230,0.38)';
    g.beginPath();
    g.ellipse(G.cx, G.cy, G.rx * RING_K * 1.06, G.ry * RING_K * 1.02, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    // the pitch
    var pw = G.rx * 0.075, pl = G.ph * 1.25;
    g.fillStyle = C.pitch;
    g.globalAlpha = 0.9;
    roundRect(g, G.cx - pw / 2, G.cy - pl, pw, pl * 2, 3);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 1;
    for (var e = -1; e <= 1; e += 2) {
      var cy = G.cy + e * G.ph;
      g.beginPath();
      g.moveTo(G.cx - pw * 0.9, cy + e * pl * 0.1);
      g.lineTo(G.cx + pw * 0.9, cy + e * pl * 0.1);
      g.stroke();
    }
    g.restore();
    // the rope: a chalk line with a glow (drawn once, so the blur is fine here)
    g.save();
    g.shadowColor = 'rgba(233,239,230,0.55)';
    g.shadowBlur = 10;
    g.lineWidth = 2.2;
    g.strokeStyle = 'rgba(240,246,238,0.92)';
    g.beginPath();
    g.ellipse(G.cx, G.cy, G.rx, G.ry, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    if (withDeco && deco) drawDeco(g);
    if (scene.dim > 0) {
      g.fillStyle = 'rgba(4,16,11,' + scene.dim + ')';
      g.fillRect(0, 0, bw, bh);
    }
  }

  function makeDeco() {
    // a fixed wagon wheel of a good over, for the menu
    return [[-84, 1.05, 6], [22, 1.0, 4], [138, 0.5, 1], [-36, 1.06, 6], [-158, 1.0, 4], [97, 0.72, 2], [-64, 0.47, 1]];
  }

  function drawDeco(g) {
    for (var i = 0; i < deco.length; i++) {
      var d = deco[i];
      strokeTrace(g, tracePoints({ angle: d[0], k: d[1], aerial: d[2] === 6 }), d[2], 0.75, d[2] === 6);
    }
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  // ---------------------------------------------------------------- the field

  /** Sets the fielders' places. animate: fielders walk to new places (when a shape is picked). */
  function setField(slots, animate) {
    scene.slots = slots.slice();
    placeFielders(animate);
    request();
  }

  function placeFielders(animate) {
    if (!G) return;
    var old = scene.fielders;
    var next = [];
    for (var i = 0; i < scene.slots.length; i++) {
      var p = slotPoint(scene.slots[i]);
      var f = { slot: scene.slots[i], x: p.x, y: p.y, hx: p.x, hy: p.y, fx: p.x, fy: p.y, t: 1, dur: 1 };
      if (animate && old[i] && !reduce) {
        f.fx = old[i].x;
        f.fy = old[i].y;
        f.x = f.fx;
        f.y = f.fy;
        f.t = 0;
        f.dur = 0.42;
      }
      next.push(f);
    }
    scene.fielders = next;
  }

  /** The fielder under a point (CSS px), as an index into the slots, or -1. */
  function fielderAt(x, y) {
    var best = -1, bd = 26 * 26;
    for (var i = 0; i < scene.fielders.length; i++) {
      var f = scene.fielders[i];
      var d = (f.x - x) * (f.x - x) + (f.y - y) * (f.y - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** The nearest place to a point (CSS px), or -1 when the point is far from any place. */
  function slotAt(x, y) {
    var best = -1, bd = 44 * 44;
    for (var s = 0; s < 12; s++) {
      var p = slotPoint(s);
      var d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  function setDrag(d) {
    scene.drag = d;
    request();
  }

  function setBadge(text) {
    scene.badge = text || '';
    request();
  }

  function setHeat(w) {
    scene.heat = w ? w.slice() : null;
    request();
  }

  function setLabels(list, kind) {
    scene.labels = list ? list.slice() : null;
    scene.labelKind = kind || '';
    request();
  }

  function setHot(z) {
    scene.hot = z;
    request();
  }

  // ---------------------------------------------------------------- traces and the ball

  function clearTraces() {
    scene.traces = [];
    scene.stamp = null;
    scene.ball = null; // a cleared ball's done is dropped on purpose: the over it belonged to is gone
    request();
  }

  function rebuildTraces() {
    for (var i = 0; i < scene.traces.length; i++) scene.traces[i].pts = tracePoints(scene.traces[i].spec);
  }

  /** The points a ball travels after the bat, from a spec { angle, k, aerial, toward }. */
  function tracePoints(spec) {
    if (spec.toward != null) {
      var f = scene.fielders[spec.toward];
      var hx = f ? f.hx : G.cx, hy = f ? f.hy : G.cy;
      return [{ x: G.bx, y: G.by }, { x: hx, y: hy }];
    }
    var end = rayTo(spec.angle, spec.k);
    if (spec.aerial) {
      var mx = (G.bx + end.x) / 2, my = (G.by + end.y) / 2;
      var len = Math.hypot(end.x - G.bx, end.y - G.by);
      var pts = [];
      for (var i = 0; i <= 14; i++) {
        var t = i / 14;
        // the shadow path is straight; the ball rises off it (drawn offset upward on screen)
        var lift = Math.sin(t * Math.PI) * len * 0.15;
        pts.push({ x: G.bx + (end.x - G.bx) * t, y: G.by + (end.y - G.by) * t - lift, sx: G.bx + (end.x - G.bx) * t, sy: G.by + (end.y - G.by) * t });
      }
      pts.mx = mx;
      pts.my = my;
      return pts;
    }
    return [{ x: G.bx, y: G.by }, end];
  }

  function hash01(n) {
    var h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /**
   * The flight of one ball. e: the over's entry ({ d, pick, outcome, runs, extra, out, fullToss }),
   * idx: the ball's number (for a steady jitter), done: called when the ball has settled.
   * Returns a short description { kind, fielder } the why line can use.
   */
  function playBall(e, idx, done) {
    var j = hash01(idx * 7919 + 13);
    var jitter = (j - 0.5) * 34;
    var spec = null;
    var kind = 'shot';
    var fielderIdx = -1;
    var zone = e.pick >= 0 && e.pick < 6 ? e.pick : -1;
    var open = zone >= 0 && (e.fullToss || (e.d >= 0 && model.OPEN[e.d][zone]));
    var catcher = function (z) {
      // the fielder who takes it in zone z: deep if there is one, else the ring fielder
      var ringI = -1, deepI = -1;
      for (var i = 0; i < scene.fielders.length; i++) {
        var s = scene.fielders[i].slot;
        if (model.slotZone(s) !== z) continue;
        if (model.slotDeep(s)) deepI = i; else ringI = i;
      }
      return deepI >= 0 ? deepI : ringI;
    };
    if (e.pick === 7) { // left alone
      kind = 'leave';
    } else if (e.pick === model.BLOCK) {
      kind = 'block';
      spec = { angle: jitter * 2, k: e.runs ? 0.46 : 0.14 };
    } else if (!open) {
      if (e.out) {
        kind = e.d === 0 ? 'bowled' : 'caughtBehind';
      } else if (e.runs > 0) {
        kind = 'edge';
        spec = { angle: j < 0.5 ? 150 + jitter * 0.4 : -150 + jitter * 0.4, k: e.runs >= 4 ? 1.0 : 0.5 };
      } else {
        kind = 'beaten';
      }
    } else if (e.out) {
      kind = 'caught';
      fielderIdx = catcher(zone);
      spec = fielderIdx >= 0 ? { toward: fielderIdx } : { angle: model.ZONES[zone].angle + jitter, k: 0.8 };
    } else {
      var ang = model.ZONES[zone].angle + jitter;
      var runs = e.runs;
      if (runs === 6) spec = { angle: ang, k: 1.08, aerial: true };
      else if (runs === 4) spec = { angle: ang, k: 1.0 };
      else if (runs === 2) spec = { angle: ang, k: 0.76 };
      else if (runs === 1) spec = { angle: ang, k: 0.48 };
      else {
        fielderIdx = catcher(zone);
        spec = fielderIdx >= 0 ? { toward: fielderIdx } : { angle: ang, k: 0.3 };
      }
      if (runs > 0 && runs < 4) fielderIdx = catcher(zone);
    }
    var b = {
      t: 0, e: e, kind: kind, spec: spec, fielder: fielderIdx, done: done,
      runUp: reduce ? 0.01 : 0.36, flight: reduce ? 0.01 : (e.runs === 6 ? 0.62 : 0.44), settle: reduce ? 0.5 : 0.75,
      stamped: false, pts: spec ? tracePoints(spec) : null
    };
    scene.ball = b;
    scene.hot = zone;
    request();
    return { kind: kind, fielder: fielderIdx };
  }

  function stampFor(e) {
    if (e.out) return { text: 'W', color: C.coral };
    if (e.runs === 6) return { text: '6', color: C.amber };
    if (e.runs === 4) return { text: '4', color: C.amber };
    if (e.runs > 0) return { text: String(e.runs), color: C.chalk };
    return { text: '0', color: C.muted };
  }

  function stepBall(dt) {
    var b = scene.ball;
    if (!b) return;
    b.t += dt;
    var tHit = b.runUp;
    var tEnd = b.runUp + b.flight;
    if (!b.stamped && b.t >= (b.pts ? tEnd : tHit + 0.12)) {
      b.stamped = true;
      var st = stampFor(b.e);
      if (b.e.extra) st.sub = words.nb;
      scene.stamp = { text: st.text, color: st.color, sub: st.sub || '', t: 0 };
      if (!reduce) {
        if (b.e.out) scene.shake = 4;
        else if (b.e.runs >= 4) scene.shake = 2;
      }
      if (b.pts) {
        var end = b.pts[b.pts.length - 1];
        if (b.e.runs >= 4) sparks(end.x, end.y, b.e.runs === 6 ? 40 : 20, C.amber);
        if (b.e.out && b.kind === 'caught') sparks(end.x, end.y, 12, C.coral);
        scene.traces.push({ spec: b.spec, pts: b.pts, runs: b.e.runs, out: b.e.out, age: 0 });
      }
      if (b.kind === 'bowled') sparks(G.bx, G.by + G.flip * 6, 18, C.coral);
      if (b.fielder >= 0) dive(b.fielder, b.pts ? b.pts[b.pts.length - 1] : null);
    }
    if (b.t >= tEnd + b.settle) {
      scene.ball = null;
      if (b.done) b.done();
    }
  }

  function dive(i, to) {
    var f = scene.fielders[i];
    if (!f || !to || reduce) return;
    // the fielder runs a little toward the ball, then walks back before the next ball
    f.fx = f.x;
    f.fy = f.y;
    f.tx = f.hx + (to.x - f.hx) * 0.55;
    f.ty = f.hy + (to.y - f.hy) * 0.55;
    f.diveT = 0;
  }

  function sparks(x, y, n, color) {
    if (reduce) return;
    for (var i = 0; i < n && scene.sparks.length < MAX_SPARKS; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 40 + Math.random() * 120;
      scene.sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, t: 0, c: color });
    }
  }

  // ---------------------------------------------------------------- the frame loop

  function request() {
    if (!raf) raf = root.requestAnimationFrame(frame);
  }

  /** Whether anything moves: the loop runs only then. Worked out from the scene, never counted. */
  function active() {
    if (scene.ball || scene.drag || scene.sparks.length > 0 || scene.shake > 0.05) return true;
    if (scene.stamp && scene.stamp.t < 1.1) return true;
    for (var i = 0; i < scene.fielders.length; i++) {
      var f = scene.fielders[i];
      if (f.t < 1 || f.diveT != null) return true;
    }
    return false;
  }

  function frame(now) {
    // While this frame runs, raf holds a non-zero marker: a request() made by a callback inside update()
    // (the end of a ball re-renders the deck) must not start a second loop beside this one. Whatever
    // such a callback changed is drawn by this same frame, which draws after update().
    raf = -1;
    var again = false;
    try {
      again = step(now);
    } finally {
      raf = again ? root.requestAnimationFrame(frame) : 0;
    }
  }

  /** One frame. Returns whether the loop goes on. */
  function step(now) {
    // Skip frames by the rAF timestamp against a 60 a second schedule (so a 90, 120 or 144 Hz screen
    // draws 60 times a second, not half or a third of its rate, and a 60 Hz screen never skips).
    if (lastDraw && now < nextDraw - 1 && active()) return true;
    var dt = lastDraw ? Math.min(0.05, (now - lastDraw) / 1000) : 1 / 60;
    var gap = lastDraw ? now - lastDraw : 16;
    lastDraw = now;
    nextDraw = nextDraw && now - nextDraw < FRAME_MS * 2 ? nextDraw + FRAME_MS : now + FRAME_MS;
    update(dt);
    var t0 = root.performance ? root.performance.now() : 0;
    draw();
    var cost = (root.performance ? root.performance.now() : 0) - t0;
    drawn++;
    drawMs += cost;
    if (cost > maxMs) maxMs = cost;
    watchSpeed(gap, cost);
    if (active()) return true;
    lastDraw = 0;
    nextDraw = 0;
    return false;
  }

  /**
   * Slow frames: when the median frame of two windows of 40 running frames in a row takes over 24 ms,
   * drawing moves to the 0.6 scale canvas. Gaps over 100 ms (a stall, a screenshot, a tab switch) are
   * not frames and are skipped.
   */
  function watchSpeed(gap, cost) {
    if (lowMode || !active()) return;
    var ms = Math.max(gap, cost);
    if (ms > 100) return;
    frameTimes.push(ms);
    if (frameTimes.length < 40) return;
    var sorted = frameTimes.slice().sort(function (a, b) { return a - b; });
    var median = sorted[20];
    frameTimes.length = 0;
    if (median > 24) {
      slowFrames++;
      if (slowFrames >= 2) lowMode = true;
    } else {
      slowFrames = 0;
    }
  }

  function update(dt) {
    // fielders walking to a new shape, or diving and walking back
    for (var i = 0; i < scene.fielders.length; i++) {
      var f = scene.fielders[i];
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / f.dur);
        var e = ease(f.t);
        f.x = f.fx + (f.hx - f.fx) * e;
        f.y = f.fy + (f.hy - f.fy) * e;
      } else if (f.diveT != null) {
        f.diveT += dt;
        var dv = 0.28, back = 0.9;
        if (f.diveT < dv) {
          var e1 = ease(f.diveT / dv);
          f.x = f.fx + (f.tx - f.fx) * e1;
          f.y = f.fy + (f.ty - f.fy) * e1;
        } else if (f.diveT < dv + back) {
          var e2 = ease((f.diveT - dv) / back);
          f.x = f.tx + (f.hx - f.tx) * e2;
          f.y = f.ty + (f.hy - f.ty) * e2;
        } else {
          f.x = f.hx;
          f.y = f.hy;
          f.diveT = null;
        }
      }
    }
    stepBall(dt);
    if (scene.stamp) scene.stamp.t += dt;
    for (var s = scene.sparks.length - 1; s >= 0; s--) {
      var p = scene.sparks[s];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.93;
      p.vy *= 0.93;
      if (p.t >= p.life) scene.sparks.splice(s, 1);
    }
    if (scene.shake > 0) scene.shake = Math.max(0, scene.shake - dt * 14);
  }

  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function easeBack(t) { var c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  function draw() {
    var useLow = lowMode;
    var g = useLow ? lctx : vctx;
    var scale = useLow ? R * LOW : R;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.direction = 'ltr'; // numbers and symbols on the ground read left to right in every language
    if (useLow) g.drawImage(layer, 0, 0, layer.width, layer.height, 0, 0, low.width, low.height);
    else g.drawImage(layer, 0, 0);
    g.setTransform(scale, 0, 0, scale, 0, 0);
    if (scene.show && G) {
      if (scene.shake > 0.05) g.translate((Math.random() - 0.5) * scene.shake * 2, (Math.random() - 0.5) * scene.shake * 2);
      drawZones(g);
      drawTraces(g);
      drawEnds(g);
      drawFielders(g);
      drawBall(g);
      drawSparks(g);
      drawStamp(g);
      drawBadge(g);
    }
    if (useLow) {
      vctx.setTransform(1, 0, 0, 1, 0, 0);
      vctx.drawImage(low, 0, 0, low.width, low.height, 0, 0, view.width, view.height);
    }
  }

  function wedge(g, z, k) {
    var a0 = model.ZONES[z].angle - 30, a1 = model.ZONES[z].angle + 30;
    g.beginPath();
    g.moveTo(G.bx, G.by);
    for (var i = 0; i <= 8; i++) {
      var p = rayTo(a0 + (a1 - a0) * i / 8, k);
      g.lineTo(p.x, p.y);
    }
    g.closePath();
  }

  function drawZones(g) {
    // faint sector lines
    g.strokeStyle = 'rgba(233,239,230,0.08)';
    g.lineWidth = 1;
    for (var z = 0; z < 6; z++) {
      var p = rayTo(model.ZONES[z].angle - 30, 1);
      g.beginPath();
      g.moveTo(G.bx, G.by);
      g.lineTo(p.x, p.y);
      g.stroke();
    }
    if (scene.heat) {
      var tot = 0, mx = 0;
      for (var i = 0; i < 6; i++) { tot += scene.heat[i]; mx = Math.max(mx, scene.heat[i]); }
      tot += scene.heat[6] || 0;
      for (var zz = 0; zz < 6; zz++) {
        var share = tot ? scene.heat[zz] / tot : 0;
        if (share <= 0.005) continue;
        wedge(g, zz, 0.985);
        g.fillStyle = 'rgba(255,178,62,' + (0.03 + 0.24 * (mx ? scene.heat[zz] / mx : 0)).toFixed(3) + ')';
        g.fill();
      }
    }
    if (scene.hot >= 0 && scene.hot < 6) {
      wedge(g, scene.hot, 0.985);
      g.strokeStyle = 'rgba(255,178,62,0.85)';
      g.lineWidth = 2;
      g.stroke();
    }
    if (scene.labels) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (var l = 0; l < 6; l++) {
        var text = scene.labels[l];
        if (!text) continue;
        var pt = rayTo(model.ZONES[l].angle, 0.7);
        g.font = '800 ' + Math.round(G.size * 0.05) + 'px ' + font;
        try { g.fontStretch = 'extra-condensed'; } catch (e) { /* older canvas */ }
        g.fillStyle = 'rgba(6,22,16,0.72)';
        var w = g.measureText(text).width + 12;
        // labels face the batter: upside down for a batter at the top end of a face to face duel
        g.save();
        g.translate(pt.x, pt.y);
        if (G.flip === -1 && !G.upright) g.rotate(Math.PI);
        roundRect(g, -w / 2, -G.size * 0.034, w, G.size * 0.068, 7);
        g.fill();
        g.fillStyle = scene.labelKind === 'heat' ? C.amber : C.chalk;
        g.fillText(text, 0, 1);
        g.restore();
        try { g.fontStretch = 'normal'; } catch (e2) { /* older canvas */ }
      }
    }
  }

  function strokeTrace(g, pts, runs, alpha, aerial) {
    var col = runs >= 4 ? '255,178,62' : '233,239,230';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (aerial && pts[0].sx != null) {
      // the shadow on the grass
      g.strokeStyle = 'rgba(0,0,0,' + (0.25 * alpha).toFixed(3) + ')';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(pts[0].sx, pts[0].sy);
      g.lineTo(pts[pts.length - 1].sx, pts[pts.length - 1].sy);
      g.stroke();
    }
    // a wide faint stroke under a thin bright one: a glow without shadowBlur
    g.strokeStyle = 'rgba(' + col + ',' + (0.18 * alpha).toFixed(3) + ')';
    g.lineWidth = runs >= 4 ? 7 : 4;
    path(g, pts);
    g.stroke();
    g.strokeStyle = 'rgba(' + col + ',' + (0.95 * alpha).toFixed(3) + ')';
    g.lineWidth = runs >= 4 ? 2.4 : 1.6;
    path(g, pts);
    g.stroke();
  }

  function path(g, pts) {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  }

  /** The first part of a path, as a fraction t of its length. */
  function partial(pts, t) {
    if (t >= 1) return pts;
    var n = pts.length - 1;
    var f = t * n;
    var i = Math.floor(f);
    var out = pts.slice(0, i + 1);
    var a = pts[i], b = pts[Math.min(n, i + 1)];
    var u = f - i;
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, sx: a.sx != null ? a.sx + (b.sx - a.sx) * u : undefined, sy: a.sy != null ? a.sy + (b.sy - a.sy) * u : undefined });
    return out;
  }

  function drawTraces(g) {
    for (var i = 0; i < scene.traces.length; i++) {
      var tr = scene.traces[i];
      var last = i === scene.traces.length - 1 && scene.ball == null;
      strokeTrace(g, tr.pts, tr.runs, last ? 1 : 0.55, tr.spec && tr.spec.aerial);
      if (tr.out) {
        var end = tr.pts[tr.pts.length - 1];
        g.strokeStyle = C.coral;
        g.lineWidth = 2;
        var s = 5;
        g.beginPath();
        g.moveTo(end.x - s, end.y - s); g.lineTo(end.x + s, end.y + s);
        g.moveTo(end.x + s, end.y - s); g.lineTo(end.x - s, end.y + s);
        g.stroke();
      }
    }
  }

  function drawEnds(g) {
    // stumps at both ends, the batter's crease mark brighter
    for (var e = -1; e <= 1; e += 2) {
      var y = G.cy + e * G.ph;
      var batting = e === G.flip;
      var b = scene.ball;
      var flying = batting && b && b.kind === 'bowled' && b.stamped;
      g.fillStyle = batting ? C.chalk : 'rgba(233,239,230,0.6)';
      for (var s = -1; s <= 1; s++) {
        var x = G.cx + s * 3;
        if (flying) {
          var tt = Math.min(1, (b.t - b.runUp - 0.12) * 2);
          g.save();
          g.translate(x + s * tt * 14, y + G.flip * tt * 16);
          g.rotate(s * tt * 1.2 + tt * 0.6);
          g.fillRect(-1, -4, 2, 8);
          g.restore();
        } else {
          g.fillRect(x - 1, y - 4, 2, 8);
        }
      }
    }
    // the batter: a chalk ring at the crease (never a figure)
    g.strokeStyle = 'rgba(233,239,230,0.9)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(G.bx + G.flip * 9, G.by, 5, 0, Math.PI * 2);
    g.stroke();
  }

  function drawFielders(g) {
    var r = Math.max(5, G.size * 0.018);
    for (var i = 0; i < scene.fielders.length; i++) {
      var f = scene.fielders[i];
      var dragging = scene.drag && scene.drag.index === i;
      var x = dragging ? scene.drag.x : f.x, y = dragging ? scene.drag.y : f.y;
      g.fillStyle = 'rgba(0,0,0,0.32)';
      g.beginPath();
      g.arc(x + 1, y + 2, r + 1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = model.slotDeep(f.slot) ? C.chalk : '#CFE0D3';
      g.beginPath();
      g.arc(x, y, dragging ? r * 1.35 : r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = C.ink;
      g.lineWidth = 1.5;
      g.stroke();
    }
    if (scene.drag && scene.drag.target >= 0) {
      var p = slotPoint(scene.drag.target);
      g.strokeStyle = scene.drag.ok ? C.amber : C.coral;
      g.lineWidth = 2;
      g.setLineDash([3, 3]);
      g.beginPath();
      g.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
  }

  function drawBall(g) {
    var b = scene.ball;
    if (!b) return;
    var bowlerY = G.cy - G.flip * G.ph * 1.15;
    var x, y;
    if (b.t < b.runUp) {
      var t = ease(b.t / b.runUp);
      x = G.cx;
      y = bowlerY + (G.by - bowlerY) * t;
    } else if (b.pts) {
      var tf = Math.min(1, (b.t - b.runUp) / b.flight);
      var te = ease(tf);
      var pts = partial(b.pts, te);
      strokeTrace(g, pts, b.e.runs, 1, b.spec && b.spec.aerial);
      var tip = pts[pts.length - 1];
      x = tip.x;
      y = tip.y;
      if (tf >= 1 && b.stamped) return;
    } else if (b.kind === 'beaten' || b.kind === 'leave' || b.kind === 'caughtBehind') {
      var tb = Math.min(1, (b.t - b.runUp) / 0.25);
      x = G.cx + (b.kind === 'caughtBehind' ? 6 : 0) * tb;
      y = G.by + G.flip * G.ph * 0.9 * ease(tb);
      if (tb >= 1) return;
    } else {
      return;
    }
    var s = 18;
    g.drawImage(glowSprite, x - s, y - s, s * 2, s * 2);
    g.drawImage(ballSprite, x - 6, y - 6, 12, 12);
    g.fillStyle = '#FFF8EA';
    g.beginPath();
    g.arc(x, y, 2.6, 0, Math.PI * 2);
    g.fill();
  }

  function drawSparks(g) {
    for (var i = 0; i < scene.sparks.length; i++) {
      var p = scene.sparks[i];
      var a = 1 - p.t / p.life;
      g.globalAlpha = a;
      g.fillStyle = p.c;
      g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    g.globalAlpha = 1;
  }

  function drawStamp(g) {
    var st = scene.stamp;
    if (!st) return;
    var t = st.t;
    var a = t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.3);
    if (a <= 0) return;
    var sc = reduce ? 1 : (t < 0.28 ? easeBack(t / 0.28) : 1);
    var size = Math.round(G.size * 0.2);
    g.save();
    g.globalAlpha = a;
    g.translate(G.cx, G.cy - G.flip * G.size * 0.02);
    if (G.flip === -1 && !G.upright) g.rotate(Math.PI);
    g.scale(sc, sc);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 ' + size + 'px ' + font;
    try { g.fontStretch = 'extra-condensed'; } catch (e) { /* older canvas */ }
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(6,22,16,0.85)';
    g.strokeText(st.text, 0, 0);
    g.fillStyle = st.color;
    g.fillText(st.text, 0, 0);
    if (st.sub) {
      g.font = '800 ' + Math.round(size * 0.3) + 'px ' + font;
      g.fillStyle = C.chalk;
      g.fillText(st.sub, 0, size * 0.62);
    }
    try { g.fontStretch = 'normal'; } catch (e2) { /* older canvas */ }
    g.restore();
  }

  function drawBadge(g) {
    if (!scene.badge) return;
    g.font = '700 ' + Math.max(12, Math.round(G.size * 0.036)) + 'px ' + font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    var w = g.measureText(scene.badge).width + 18;
    var x = G.x + w / 2 + 2, y = G.y + 14;
    g.fillStyle = 'rgba(6,22,16,0.8)';
    roundRect(g, x - w / 2, y - 12, w, 24, 12);
    g.fill();
    g.strokeStyle = 'rgba(233,239,230,0.25)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = C.chalk;
    g.fillText(scene.badge, x, y + 1);
  }

  // ---------------------------------------------------------------- share card

  /**
   * A 720 by 960 share card: the over's wagon wheel on the oval, the result, the ball line as chips.
   * data: { title, big, line, lineLabel, line2, line2Label, traces: [{ angle, k, runs, aerial }], field: slots or null }.
   * Drawn on its own canvas (a one-off, fine after Shell.ready()). Spoiler free for a Daily: the caller
   * passes no field and no deliveries.
   */
  function shareCard(data) {
    var W = 720, H = 960;
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var g = c.getContext('2d');
    g.direction = 'ltr';
    g.fillStyle = C.turf;
    g.fillRect(0, 0, W, H);
    var vg = g.createRadialGradient(W / 2, 480, 120, W / 2, 480, 620);
    vg.addColorStop(0, 'rgba(190,230,200,0.07)');
    vg.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    var saveG = G;
    var size = 500;
    G = { x: 110, y: 250, w: size, h: size, size: size, cx: 360, cy: 250 + size / 2, rx: size * 0.47, ry: size * 0.475, flip: 1 };
    G.ph = G.size * 0.08;
    G.bx = G.cx;
    G.by = G.cy + G.ph;
    g.save();
    g.beginPath();
    g.ellipse(G.cx, G.cy, G.rx, G.ry, 0, 0, Math.PI * 2);
    g.clip();
    for (var k = 0; k < 14; k++) {
      g.fillStyle = k % 2 ? C.stripe : '#103226';
      g.fillRect(G.cx - G.rx, G.cy - G.ry + k * (G.ry * 2 / 14), G.rx * 2, G.ry * 2 / 14 + 1);
    }
    g.restore();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(240,246,238,0.9)';
    g.beginPath();
    g.ellipse(G.cx, G.cy, G.rx, G.ry, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([8, 10]);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(233,239,230,0.35)';
    g.beginPath();
    g.ellipse(G.cx, G.cy, G.rx * RING_K * 1.06, G.ry * RING_K * 1.02, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = C.pitch;
    roundRect(g, G.cx - 10, G.cy - G.ph * 1.25, 20, G.ph * 2.5, 4);
    g.fill();
    var tr = data.traces || [];
    for (var i = 0; i < tr.length; i++) strokeTrace(g, tracePoints(tr[i]), tr[i].runs, 1, tr[i].aerial);
    if (data.field) {
      for (var f = 0; f < data.field.length; f++) {
        var p = slotPoint(data.field[f]);
        g.fillStyle = C.chalk;
        g.beginPath();
        g.arc(p.x, p.y, 8, 0, Math.PI * 2);
        g.fill();
      }
    }
    G = saveG;
    // header: the name, the title, the result sized to fit (right to left words keep their own order)
    g.direction = data.rtl ? 'rtl' : 'ltr';
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    var nameW = condensed(g, 900, 64, 'SLOGSTOP', C.chalk, 48, 96);
    if (data.title) {
      g.font = '600 30px ' + font;
      g.fillStyle = C.muted;
      var tw = Math.min(W - 48 - (48 + nameW + 20), g.measureText(data.title).width);
      g.fillText(data.title, 48 + nameW + 20, 94, tw);
    }
    var size2 = 112;
    var w2 = measureCond(g, 900, size2, data.big || '');
    if (w2 > W - 96) size2 = Math.floor(size2 * (W - 96) / w2);
    condensed(g, 900, size2, data.big || '', C.amber, 48, 96 + 24 + size2 * 0.82);
    g.direction = 'ltr';
    // the ball by ball lines, as chips like the ones in play
    if (data.line2) {
      chipRow(g, data.line, 802, 22, data.lineLabel);
      chipRow(g, data.line2, 884, 17, data.line2Label);
    } else {
      chipRow(g, data.line, 852, 26, data.lineLabel);
    }
    return c.toDataURL('image/png');
  }

  function measureCond(g, weight, px, text) {
    g.font = weight + ' ' + px + 'px ' + font;
    try { g.fontStretch = 'extra-condensed'; } catch (e) { /* older canvas */ }
    var w = g.measureText(text).width;
    try { g.fontStretch = 'normal'; } catch (e2) { /* older canvas */ }
    return w;
  }

  /** Draws condensed text at (x, y) and returns its width. Setting g.font resets the stretch, so it is set after. */
  function condensed(g, weight, px, text, color, x, y) {
    g.font = weight + ' ' + px + 'px ' + font;
    try { g.fontStretch = 'extra-condensed'; } catch (e) { /* older canvas */ }
    g.fillStyle = color;
    g.textAlign = 'left';
    g.fillText(text, x, y);
    var w = g.measureText(text).width;
    try { g.fontStretch = 'normal'; } catch (e2) { /* older canvas */ }
    return w;
  }

  /** A centred row of ball chips from a line such as "W . 1 4 . 6" (a dot is an empty chip). */
  function chipRow(g, line, cy, r, label) {
    var parts = line ? String(line).split(' ') : [];
    if (label) {
      g.font = '600 24px ' + font;
      g.fillStyle = C.muted;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.fillText(label, 360, cy - r - 12);
    }
    var gap = Math.round(r * 0.35);
    var x = 360 - (parts.length * (r * 2 + gap) - gap) / 2 + r;
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i];
      var hot = s === '4' || s === '6';
      var out = s === 'W';
      g.beginPath();
      g.arc(x, cy, r, 0, Math.PI * 2);
      if (hot || out) {
        g.fillStyle = out ? C.coral : C.amber;
        g.fill();
      } else {
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(233,239,230,0.45)';
        g.stroke();
      }
      g.font = '800 ' + Math.round(r * 1.05) + 'px ' + font;
      try { g.fontStretch = 'extra-condensed'; } catch (e) { /* older canvas */ }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = hot || out ? '#1C1405' : (s === '.' ? C.muted : C.chalk);
      g.fillText(s === 'W' ? 'W' : s, x, cy + 1);
      try { g.fontStretch = 'normal'; } catch (e2) { /* older canvas */ }
      x += r * 2 + gap;
    }
    g.textBaseline = 'alphabetic';
  }

  function stats() {
    return { lowMode: lowMode, R: R, backing: [view.width, view.height], css: [bw, bh], active: active(), looping: !!raf, drawn: drawn, drawMs: drawMs, maxMs: maxMs };
  }

  SS.render = {
    C: C, init: init, resize: resize, setLayout: setLayout, hide: hide, setReduced: setReduced, setFont: setFont, setWords: setWords,
    setField: setField, fielderAt: fielderAt, slotAt: slotAt, slotPoint: function (s) { return slotPoint(s); },
    setDrag: setDrag, setBadge: setBadge, setHeat: setHeat, setLabels: setLabels, setHot: setHot,
    clearTraces: clearTraces, playBall: playBall, zoneOfPoint: zoneOfPoint, request: request,
    shareCard: shareCard, stats: stats, geometry: function () { return G; },
    forceLow: function (v) { lowMode = !!v; request(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
