/* Rucksack: the map screen. Pan, pinch, and a cached painted layer so the
   watercolour is not repainted on every frame. */
var MapView = (function () {
  'use strict';

  var cvs = null, ctx = null, dpr = 1, vw = 0, vh = 0;
  var cam = { cx: 500, cy: 1200, s: 0.4 };
  var minS = 0.18, maxS = 2.2;
  var base = null;                 // { canvas, ctx, rect, S }
  var fog = { near: null, far: null, km: -1 };
  var ink = '#2B2823', paper = '#F1E7D2';
  var onPick = null;
  var raf = 0, dirty = false;

  function px(v) {
    var n = parseFloat(css(v));
    return isNaN(n) ? 0 : n;
  }
  function safeTop() { return px('--sat'); }
  function safeBottom() { return px('--sab'); }

  function css(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  /* The region plate and the waypoint bar float over the canvas, so the part of
     the map you can actually see is shorter than the canvas. Fitting and
     centring both work against this band, otherwise "All" hides the first
     three hundred kilometres behind the bar at the bottom. */
  function band() {
    var top = 96 + safeTop(), bottom = 122 + safeBottom();
    return { top: top, bottom: bottom, h: Math.max(90, vh - top - bottom) };
  }
  function bandOffset() {
    var b = band();
    return b.top + b.h / 2 - vh / 2;
  }

  function init(canvas, pick) {
    cvs = canvas; ctx = cvs.getContext('2d'); onPick = pick;
    ink = css('--ink') || ink; paper = css('--paper') || paper;
    bindGestures();
    resize();
    fit();
  }

  function resize() {
    if (!cvs) return;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    var r = cvs.getBoundingClientRect();
    vw = Math.max(1, Math.round(r.width)); vh = Math.max(1, Math.round(r.height));
    cvs.width = Math.round(vw * dpr); cvs.height = Math.round(vh * dpr);
    var b = Atlas.BOUNDS, bd = band();
    minS = Math.min((vw - 30) / (b.x1 - b.x0), bd.h / (b.y1 - b.y0));
    if (cam.s < minS) cam.s = minS;
    base = null;
    invalidate();
  }

  function fit() {
    var b = Atlas.BOUNDS;
    cam.s = minS;
    cam.cx = (b.x0 + b.x1) / 2;
    cam.cy = (b.y0 + b.y1) / 2 - bandOffset() / cam.s;
    clamp(); base = null; invalidate();
  }

  /** Centre on a route kilometre, in the part of the map that is not covered. */
  function focus(km, scale) {
    var p = Atlas.at(km);
    if (scale) cam.s = Math.max(minS, Math.min(maxS, scale));
    cam.cx = p.x; cam.cy = p.y - bandOffset() / cam.s;
    clamp(); invalidate();
  }

  /** True when the wanderer is off the visible band and worth going back to. */
  function seesKm(km) {
    var p = Atlas.at(km), q = toScreen(p.x, p.y), bd = band();
    return q.x > 24 && q.x < vw - 24 && q.y > bd.top && q.y < vh - bd.bottom;
  }

  function clamp() {
    var b = Atlas.BOUNDS, bd = band();
    var halfW = vw / (2 * cam.s);
    var topW = (bd.top - vh / 2) / cam.s;         // band edges, as offsets from cam.cy
    var botW = (vh - bd.bottom - vh / 2) / cam.s;
    if ((b.x1 - b.x0) * cam.s <= vw) cam.cx = (b.x0 + b.x1) / 2;
    else cam.cx = Math.max(b.x0 + halfW, Math.min(b.x1 - halfW, cam.cx));
    if ((b.y1 - b.y0) <= (botW - topW)) cam.cy = (b.y0 + b.y1) / 2 - (topW + botW) / 2;
    else cam.cy = Math.max(b.y0 - topW, Math.min(b.y1 - botW, cam.cy));
  }

  function viewRect(pad) {
    pad = pad || 0;
    var hw = vw / (2 * cam.s) * (1 + pad), hh = vh / (2 * cam.s) * (1 + pad);
    return { x0: cam.cx - hw, y0: cam.cy - hh, x1: cam.cx + hw, y1: cam.cy + hh };
  }
  function inside(outer, r) {
    return outer.x0 <= r.x0 + 0.5 && outer.y0 <= r.y0 + 0.5 && outer.x1 >= r.x1 - 0.5 && outer.y1 >= r.y1 - 0.5;
  }

  function ensureBase() {
    var want = viewRect(0);
    var S = Math.min(cam.s * dpr, 3);
    if (base && inside(base.rect, want) && Math.abs(base.S - S) / S < 0.18) return;
    var rect = viewRect(0.30);
    var b = Atlas.BOUNDS;
    rect.x0 = Math.max(rect.x0, b.x0 - 20); rect.y0 = Math.max(rect.y0, b.y0 - 20);
    rect.x1 = Math.min(rect.x1, b.x1 + 20); rect.y1 = Math.min(rect.y1, b.y1 + 20);
    var wpx = Math.ceil((rect.x1 - rect.x0) * S), hpx = Math.ceil((rect.y1 - rect.y0) * S);
    var MAX = 3.4e6;
    if (wpx * hpx > MAX) {
      var k = Math.sqrt(MAX / (wpx * hpx));
      S *= k; wpx = Math.ceil((rect.x1 - rect.x0) * S); hpx = Math.ceil((rect.y1 - rect.y0) * S);
    }
    if (!base) base = { canvas: document.createElement('canvas'), ctx: null, rect: rect, S: S };
    base.rect = rect; base.S = S;
    base.canvas.width = Math.max(1, wpx); base.canvas.height = Math.max(1, hpx);
    base.ctx = base.canvas.getContext('2d');
    var c = base.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = paper; c.fillRect(0, 0, base.canvas.width, base.canvas.height);
    c.setTransform(S, 0, 0, S, -rect.x0 * S, -rect.y0 * S);
    Atlas.drawBase(c, rect, ink, paper);
  }

  function ensureFog(frontier) {
    var bucket = Math.round(frontier / 4) * 4;
    if (fog.km === bucket) return;
    fog.km = bucket;
    fog.near = Atlas.pathFor(bucket + 1, bucket + 230, 3);
    fog.far = Atlas.pathFor(bucket + 230, 1e9, 3);
  }

  function world(c) {
    c.translate(vw / 2, vh / 2);
    c.scale(cam.s, cam.s);
    c.translate(-cam.cx, -cam.cy);
  }
  function toScreen(x, y) {
    return { x: (x - cam.cx) * cam.s + vw / 2, y: (y - cam.cy) * cam.s + vh / 2 };
  }
  function toWorld(x, y) {
    return { x: (x - vw / 2) / cam.s + cam.cx, y: (y - vh / 2) / cam.s + cam.cy };
  }

  function invalidate() {
    dirty = true;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame() {
    raf = 0;
    if (!dirty) return;
    dirty = false;
    draw();
  }

  function draw() {
    if (!ctx) return;
    ensureBase();
    var total = Store.totalKm();
    ensureFog(total);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, vw, vh);

    var p0 = toScreen(base.rect.x0, base.rect.y0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base.canvas, p0.x, p0.y,
      (base.rect.x1 - base.rect.x0) * cam.s, (base.rect.y1 - base.rect.y0) * cam.s);

    ctx.save();
    world(ctx);

    // the road you have already put behind you
    ctx.strokeStyle = 'rgba(37,35,30,0.92)';
    ctx.lineWidth = 3.4 / Math.max(0.6, Math.min(1.6, cam.s));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < Atlas.SAMPLES.length; i++) {
      var s = Atlas.SAMPLES[i];
      if (s.km > total) break;
      if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
    }
    if (started) {
      var here = Atlas.at(total);
      ctx.lineTo(here.x, here.y);
      ctx.stroke();
    }

    /* Cartographer's fog over ground you have not reached. Held inside the
       coastline: unclipped it painted bare discs of hatching out on the sea. */
    ctx.save();
    ctx.clip(Atlas.landPath());
    ctx.fillStyle = 'rgba(241,231,210,0.52)';
    if (fog.near) ctx.fill(fog.near);
    ctx.fillStyle = 'rgba(241,231,210,0.80)';
    if (fog.far) ctx.fill(fog.far);
    if (fog.far) {
      ctx.save();
      ctx.clip(fog.far);
      ctx.strokeStyle = 'rgba(120,116,100,0.13)';
      ctx.lineWidth = 1 / cam.s;
      var step = 26;
      var b = Atlas.BOUNDS;
      ctx.beginPath();
      for (var hx = b.x0 - (b.y1 - b.y0); hx < b.x1; hx += step) {
        ctx.moveTo(hx, b.y0);
        ctx.lineTo(hx + (b.y1 - b.y0), b.y1);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.restore();

    drawLabels(total);
    drawPins(total);
  }

  function drawLabels(total) {
    // the chrome that floats over the map keeps its own space
    var placed = [
      { x: 6, y: 0, w: 250, h: 92 + safeTop() },
      { x: vw - 66, y: 0, w: 66, h: 220 + safeTop() },
      { x: 0, y: vh - 118 - safeBottom(), w: vw, h: 118 + safeBottom() }
    ];
    function fits(x, y, w, h) {
      for (var i = 0; i < placed.length; i++) {
        var b = placed[i];
        if (x < b.x + b.w + 4 && x + w + 4 > b.x && y < b.y + b.h + 3 && y + h + 3 > b.y) return false;
      }
      return !(x < 6 || y < 4 || x + w > vw - 6 || y + h > vh - 4);
    }
    function halo(text, x, y) {
      ctx.lineWidth = 3.6;
      ctx.strokeStyle = 'rgba(241,231,210,0.95)';
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }

    ctx.textBaseline = 'middle';

    // region names, once the region is in sight
    var i, r, p, sp, wp, q, tw;
    var rsize = Math.max(11.5, Math.min(20, 9 + cam.s * 9));
    ctx.font = 'italic 500 ' + rsize + 'px Alegreya, Georgia, serif';
    ctx.textAlign = 'center';
    for (i = 0; i < Content.REGIONS.length; i++) {
      r = Content.REGIONS[i];
      if (r.from > total + 120) continue;
      var mid = (r.from + r.to) / 2;
      p = Atlas.at(mid);
      var side = (i % 2 === 0) ? -1 : 1;
      var off = Atlas.landRadius(mid) * 0.72 * side + Atlas.landDrift(mid);
      sp = toScreen(p.x + p.nx * off, p.y + p.ny * off);
      var name = r.name.toUpperCase();
      tw = ctx.measureText(name).width;
      if (!fits(sp.x - tw / 2, sp.y - rsize * 0.7, tw, rsize * 1.4)) continue;
      placed.push({ x: sp.x - tw / 2, y: sp.y - rsize * 0.7, w: tw, h: rsize * 1.4 });
      ctx.fillStyle = 'rgba(43,40,35,0.72)';
      halo(name, sp.x, sp.y);
    }

    if (cam.s < 0.45) return;

    // waypoints: the one ahead first, then the ground behind you, newest back
    var order = [];
    var next = Content.nextWaypoint(total);
    if (next) order.push(next);
    for (i = Content.WAYPOINTS.length - 1; i >= 0; i--) {
      wp = Content.WAYPOINTS[i];
      if (wp.km <= total && wp !== next) order.push(wp);
    }
    ctx.font = '500 12.5px "Alegreya Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    var drawn = 0;
    for (i = 0; i < order.length && drawn < 16; i++) {
      wp = order[i];
      p = Atlas.at(wp.km);
      q = toScreen(p.x, p.y);
      if (q.x < -60 || q.x > vw + 60 || q.y < -20 || q.y > vh + 20) continue;
      tw = ctx.measureText(wp.name).width;
      if (!fits(q.x + 8, q.y - 8, tw, 16)) continue;
      placed.push({ x: q.x + 8, y: q.y - 8, w: tw, h: 16 });
      ctx.fillStyle = (wp === next) ? '#2F5D50' : 'rgba(43,40,35,0.94)';
      halo(wp.name, q.x + 10, q.y);
      drawn++;
    }
  }

  function drawPins(total) {
    var campKm = Store.campKm();
    var c = ctx, p;
    // camp
    if (campKm > 0.05) {
      p = toScreen(Atlas.at(campKm).x, Atlas.at(campKm).y);
      c.save();
      c.strokeStyle = '#8A4A1E'; c.fillStyle = 'rgba(180,84,31,0.22)'; c.lineWidth = 1.7;
      c.beginPath(); c.moveTo(p.x - 7, p.y + 5); c.lineTo(p.x, p.y - 7); c.lineTo(p.x + 7, p.y + 5);
      c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    // you
    p = toScreen(Atlas.at(total).x, Atlas.at(total).y);
    c.save();
    c.beginPath(); c.arc(p.x, p.y, 11, 0, 6.2832);
    c.fillStyle = 'rgba(47,93,80,0.16)'; c.fill();
    c.beginPath(); c.arc(p.x, p.y, 6.2, 0, 6.2832);
    c.fillStyle = '#2F5D50'; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#F1E7D2'; c.stroke();
    c.restore();
  }

  /* ---------------------------------------------------------------- input */
  var pts = {}, lastDist = 0, lastMid = null, moved = false, downAt = 0, lastTap = 0;

  function bindGestures() {
    cvs.style.touchAction = 'none';
    cvs.addEventListener('pointerdown', function (e) {
      cvs.setPointerCapture(e.pointerId);
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      moved = false; downAt = Date.now();
      lastDist = 0; lastMid = null;
    });
    cvs.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      var ids = Object.keys(pts);
      var prev = pts[e.pointerId];
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (ids.length === 1) {
        var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        cam.cx -= dx / cam.s; cam.cy -= dy / cam.s;
        clamp(); invalidate();
      } else if (ids.length >= 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (lastDist > 0) {
          var rect = cvs.getBoundingClientRect();
          zoomAbout(mid.x - rect.left, mid.y - rect.top, d / lastDist);
          if (lastMid) { cam.cx -= (mid.x - lastMid.x) / cam.s; cam.cy -= (mid.y - lastMid.y) / cam.s; clamp(); }
        }
        lastDist = d; lastMid = mid; moved = true;
        invalidate();
      }
    });
    function up(e) {
      var wasSingle = Object.keys(pts).length === 1;
      delete pts[e.pointerId];
      if (Object.keys(pts).length < 2) { lastDist = 0; lastMid = null; }
      if (wasSingle && !moved && Date.now() - downAt < 500) tap(e);
    }
    cvs.addEventListener('pointerup', up);
    cvs.addEventListener('pointercancel', up);
    cvs.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = cvs.getBoundingClientRect();
      zoomAbout(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0016));
      invalidate();
    }, { passive: false });
  }

  function tap(e) {
    var rect = cvs.getBoundingClientRect();
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    var now = Date.now();
    if (now - lastTap < 320) { lastTap = 0; zoomAbout(x, y, 1.9); invalidate(); return; }
    lastTap = now;
    var hit = pick(x, y);
    if (hit && onPick) onPick(hit);
  }

  function pick(x, y) {
    var total = Store.totalKm(), best = null, bd = 26;
    for (var i = 0; i < Content.WAYPOINTS.length; i++) {
      var wp = Content.WAYPOINTS[i];
      if (wp.km > total + 40) continue;
      var q = toScreen(Atlas.at(wp.km).x, Atlas.at(wp.km).y);
      var d = Math.hypot(q.x - x, q.y - y);
      if (d < bd) { bd = d; best = wp; }
    }
    return best;
  }

  function zoomAbout(px, py, k) {
    var before = toWorld(px, py);
    cam.s = Math.max(minS, Math.min(maxS, cam.s * k));
    var after = toWorld(px, py);
    cam.cx += before.x - after.x;
    cam.cy += before.y - after.y;
    clamp();
  }

  function zoomBy(k) {
    zoomAbout(vw / 2, vh / 2, k);
    invalidate();
  }

  function scale() { return cam.s; }

  return { init: init, resize: resize, fit: fit, focus: focus, draw: draw, seesKm: seesKm,
           invalidate: invalidate, zoomBy: zoomBy, scale: scale, maxScale: function () { return maxS; } };
})();
