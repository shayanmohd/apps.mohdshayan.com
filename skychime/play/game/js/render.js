/*
 * Drawing. Canvas 2D only: prerendered sky and skyline layers, a fading long-exposure layer for spark
 * trails (fade scaled by frame time), glow at quarter resolution, pooled decorative particles in typed
 * arrays, prerendered sprites, no shadowBlur, devicePixelRatio capped at 2.
 *
 * The model's sparks are drawn exactly where the model has them (interpolated between its last two
 * steps); decorative embers only trail behind them and never lead.
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};
  var M = Sky.model;
  var SL = Sky.skylines;
  var R = Sky.rng;

  var COLORS = ['#FFE6B8', '#F6C978', '#D4E3FF', '#FF93AC', '#F2B04C', '#FFF7EA', '#7A7F94'];
  // Trails and embers carry each colour a step deeper, so the long exposure keeps its hue where it adds up.
  var TRAIL = ['#F7C98A', '#E9A94A', '#9FB8F0', '#F26E93', '#E0962E', '#FFE9C9', '#5E6377'];
  var TRAIL_ALPHA = [0.4, 0.7, 0.95, 0.1]; // by age band: old, middle, young, not hot yet
  var TRAIL_WIDTH = [0.42, 0.6, 0.78, 0.5];
  var C_AMBER = 4, C_WHITE = 5, C_SMOKE = 6;
  var TYPE_COLOR = [0, 1, 2, 3];
  var FONT = 'Archivo, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  var DIM_ORDER = [4, 7, 1, 9, 2, 6, 0, 8, 3, 5];
  var MAX_PARTICLES = 1200;
  var TAIL_SECONDS = 0.32; // a rising shell's tail, about what the old 0.885-a-frame fade left visible
  var TAIL_SEGMENTS = 5;

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function hexRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgba(hex, a) {
    var c = hexRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  function sprite(hex, size, hard) {
    var c = makeCanvas(size, size);
    var g = c.getContext('2d');
    var r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    if (hard === 'tint') {
      grad.addColorStop(0, rgba(hex, 1));
      grad.addColorStop(0.35, rgba(hex, 0.55));
      grad.addColorStop(1, rgba(hex, 0));
    } else if (hard) {
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.22, rgba(hex, 1));
      grad.addColorStop(0.5, rgba(hex, 0.35));
      grad.addColorStop(1, rgba(hex, 0));
    } else {
      grad.addColorStop(0, rgba(hex, 0.9));
      grad.addColorStop(0.3, rgba(hex, 0.32));
      grad.addColorStop(0.65, rgba(hex, 0.08));
      grad.addColorStop(1, rgba(hex, 0));
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  // ---- decorative particles: structure of arrays, swap-remove, hard cap ----
  function Particles(cap) {
    this.cap = cap;
    this.n = 0;
    this.x = new Float32Array(cap); this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap);
    this.age = new Float32Array(cap); this.life = new Float32Array(cap);
    this.size = new Float32Array(cap); this.drag = new Float32Array(cap); this.grav = new Float32Array(cap);
    this.col = new Uint8Array(cap);
  }
  Particles.prototype.emit = function (x, y, vx, vy, life, size, col, drag, grav) {
    if (this.n >= this.cap) return false;
    var i = this.n++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.col[i] = col;
    this.drag[i] = drag; this.grav[i] = grav;
    return true;
  };
  Particles.prototype.update = function (dt) {
    var i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        var j = --this.n;
        this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
        this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.size[i] = this.size[j]; this.col[i] = this.col[j];
        this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
        continue;
      }
      var k = 1 - this.drag[i] * dt;
      this.vx[i] *= k;
      this.vy[i] = this.vy[i] * k - this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      i++;
    }
  };
  Particles.prototype.clear = function () { this.n = 0; };

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.w = 1; this.h = 1;
    this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.def = null;
    this.shapes = null;
    this.view = { s: 4, left: 0, ground: 0 };
    this.parts = new Particles(MAX_PARTICLES);
    this.flashes = [];
    this.pops = [];
    this.ripples = [];
    this.marks = [];
    this.districtA = new Float32Array(10);
    this.flicker = new Float32Array(10);
    for (var i = 0; i < 10; i++) this.districtA[i] = 1;
    this.shakeAmp = 0; this.shakeT = 0;
    this.reducedMotion = false;
    this.reducedFlash = false;
    this.limiter = new Sky.flash.Limiter(3, 1);
    this.skyGlow = 0;
    this.quietFor = 0;
    this.frameNo = 0;
    this.sprites = { glow: [], dot: [], tint: [] };
    for (var c = 0; c < COLORS.length; c++) {
      this.sprites.glow.push(sprite(COLORS[c], 64, false));
      this.sprites.dot.push(sprite(COLORS[c], 24, true));
      this.sprites.tint.push(sprite(TRAIL[c], 16, 'tint'));
    }
    this.snow = null;
    this.twinkles = null;
  }

  Renderer.prototype.resize = function (w, h, dpr, insets) {
    this.w = Math.max(1, w); this.h = Math.max(1, h);
    this.dpr = Math.min(2, Math.max(1, dpr || 1));
    this.insets = insets || this.insets;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.trail = makeCanvas(this.w, this.h);
    this.trailCtx = this.trail.getContext('2d');
    this.glow = makeCanvas(this.w / 4, this.h / 4);
    this.glowCtx = this.glow.getContext('2d');
    this.layout();
    if (this.def) this.prerender();
  };

  Renderer.prototype.layout = function () {
    var ins = this.insets;
    var pad = this.def && this.def.water ? 16 : 9;
    var avail = this.h - ins.bottom - ins.top - 64;
    var s = Math.min((this.w - ins.left - ins.right) / M.WORLD_W, avail / (M.WORLD_H + pad));
    if (s < 1) s = 1;
    var left = ins.left + (this.w - ins.left - ins.right - M.WORLD_W * s) / 2;
    var ground = this.h - ins.bottom - pad * s;
    this.view = { s: s, left: left, ground: ground, pad: pad, top: ground - M.WORLD_H * s };
  };

  Renderer.prototype.sx = function (wx) { return this.view.left + wx * this.view.s; };
  Renderer.prototype.sy = function (wy) { return this.view.ground - wy * this.view.s; };
  Renderer.prototype.wx = function (px) { return (px - this.view.left) / this.view.s; };
  Renderer.prototype.wy = function (py) { return (this.view.ground - py) / this.view.s; };

  Renderer.prototype.setSkyline = function (def) {
    if (this.def === def) return;
    this.def = def;
    this.shapes = SL.silhouette(def);
    this.layout();
    this.prerender();
    this.parts.clear();
    this.flashes.length = 0;
    this.clearTrail();
  };

  Renderer.prototype.clearTrail = function () {
    if (this.trailCtx) this.trailCtx.clearRect(0, 0, this.trail.width, this.trail.height);
  };

  /** Sky, stars and haze; the skyline; windows as paths per district. */
  Renderer.prototype.prerender = function () {
    var def = this.def, w = this.w, h = this.h, v = this.view;
    var m = 8;
    this.bg = makeCanvas((w + 2 * m) * this.dpr, (h + 2 * m) * this.dpr);
    var g = this.bg.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, m * this.dpr, m * this.dpr);
    var grad = g.createLinearGradient(0, -m, 0, v.ground);
    grad.addColorStop(0, def.sky[0]);
    grad.addColorStop(0.45, def.sky[1]);
    grad.addColorStop(0.82, def.sky[2]);
    grad.addColorStop(1, def.sky[3]);
    g.fillStyle = grad;
    g.fillRect(-m, -m, w + 2 * m, h + 2 * m);
    // haze over the city
    var hz = g.createRadialGradient(w / 2, v.ground + 40, 10, w / 2, v.ground + 40, Math.max(w, 420) * 0.75);
    hz.addColorStop(0, rgba(def.haze, 0.55));
    hz.addColorStop(1, rgba(def.haze, 0));
    g.fillStyle = hz;
    g.fillRect(-m, -m, w + 2 * m, h + 2 * m);
    // stars
    var r = R.create(def.seed * 31 + 7);
    var count = Math.round(w * h / 2600);
    for (var i = 0; i < count; i++) {
      var x = r.float() * w, y = r.float() * (v.ground - 60);
      var a = 0.15 + 0.5 * r.float() * (1 - y / v.ground);
      var size = r.chance(0.08) ? 1.4 : 0.8;
      g.fillStyle = 'rgba(230,236,255,' + a.toFixed(3) + ')';
      g.fillRect(x, y, size, size);
    }
    this.twinkles = [];
    for (i = 0; i < 18; i++) this.twinkles.push({ x: r.float() * w, y: r.float() * (v.ground * 0.6), p: r.float() * 6.28, s: 0.6 + r.float() });
    if (def.style === 'desert') {
      // a thin crescent moon
      var mx = w * 0.78, my = Math.max(60, v.top + 40), mr = 13;
      g.fillStyle = 'rgba(255,236,200,0.85)';
      g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
      g.fillStyle = def.sky[1];
      g.beginPath(); g.arc(mx + 5, my - 3, mr * 0.92, 0, Math.PI * 2); g.fill();
    }

    // The skyline, in its own layer.
    this.city = makeCanvas(w * this.dpr, h * this.dpr);
    var c = this.city.getContext('2d');
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.rim = makeCanvas(w * this.dpr, h * this.dpr);
    var rc = this.rim.getContext('2d');
    rc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = def.silhouette;
    rc.strokeStyle = def.rim;
    rc.lineWidth = 1;
    var s = v.s;
    var self = this;
    var paths = [];
    for (i = 0; i < 10; i++) paths.push(new Path2D());
    this.shapes.forEach(function (sh) {
      var path = new Path2D();
      self.shapePath(path, sh, s);
      c.fill(path);
      rc.stroke(path);
      if (sh.windows) {
        var dp = paths[sh.district];
        for (var k = 0; k < sh.windows.length; k++) {
          var wn = sh.windows[k];
          dp.rect(self.sx(sh.x + (wn.x - sh.x)), self.sy(wn.y + wn.h), wn.w * s, wn.h * s);
        }
      }
      if (sh.kind === 'lighthouse' || sh.kind === 'clock' || sh.kind === 'minaret') {
        paths[sh.district].rect(self.sx(sh.x) - 0.8 * s, self.sy(sh.h - 2.4), 1.6 * s, 1.2 * s);
      }
    });
    // ground or water below the line
    var gy = v.ground;
    if (def.water) {
      var wg = c.createLinearGradient(0, gy, 0, h);
      wg.addColorStop(0, rgba(def.sky[3], 0.9));
      wg.addColorStop(1, def.sky[0]);
      c.fillStyle = wg;
      c.fillRect(0, gy, w, h - gy);
      c.fillStyle = def.silhouette;
      c.fillRect(0, gy, w, Math.max(1.5, s * 0.5));
    } else {
      c.fillRect(0, gy - 0.5, w, h - gy + 1);
      if (def.style === 'snow') {
        c.fillStyle = 'rgba(214,232,240,0.16)';
        c.fillRect(0, gy, w, Math.max(2, s * 0.8));
      }
    }
    this.windowPaths = paths;
    // ripples over the water reflection
    if (def.water) {
      this.ripple = makeCanvas(w * this.dpr, Math.max(1, (h - gy)) * this.dpr);
      var rp = this.ripple.getContext('2d');
      rp.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      var rr = R.create(def.seed + 5);
      for (var y = 2; y < h - gy; y += 2 + rr.float() * 3) {
        rp.fillStyle = 'rgba(0,0,0,' + (0.25 + 0.35 * rr.float()).toFixed(2) + ')';
        rp.fillRect(0, y, w, 1 + rr.float());
      }
    } else {
      this.ripple = null;
    }
    if (def.snow) {
      var sr = R.create(def.seed + 9);
      this.snow = [];
      for (i = 0; i < 90; i++) this.snow.push({ x: sr.float() * w, y: sr.float() * h, v: 8 + sr.float() * 16, d: sr.float() * 6.28, s: 0.7 + sr.float() * 1.3 });
    } else {
      this.snow = null;
    }
  };

  Renderer.prototype.shapePath = function (p, sh, s) {
    var self = this;
    function X(x) { return self.sx(x); }
    function Y(y) { return self.sy(y); }
    var x0, x1, top;
    switch (sh.kind) {
      case 'building':
        x0 = X(sh.x); x1 = X(sh.x + sh.w); top = Y(sh.h);
        var gy = Y(0) + 1;
        if (sh.roof === 'pine') {
          var cx = (x0 + x1) / 2, hw = (x1 - x0) / 2;
          p.moveTo(cx, Y(sh.h)); p.lineTo(cx + hw, gy); p.lineTo(cx - hw, gy); p.closePath();
          return;
        }
        p.moveTo(x0, gy); p.lineTo(x0, top);
        if (sh.roof === 'pitch') {
          p.lineTo((x0 + x1) / 2, top - (x1 - x0) * 0.42);
        } else if (sh.roof === 'dome') {
          p.lineTo(x0 + (x1 - x0) * 0.15, top);
          p.arc((x0 + x1) / 2, top, (x1 - x0) * 0.35, Math.PI, 0);
        } else if (sh.roof === 'crenel') {
          var n = Math.max(2, Math.round((x1 - x0) / (1.6 * s)));
          var step = (x1 - x0) / (n * 2 - 1);
          for (var i = 0; i < n * 2 - 1; i++) {
            var yy = i % 2 === 0 ? top - 1.1 * s : top;
            p.lineTo(x0 + i * step, yy); p.lineTo(x0 + (i + 1) * step, yy);
          }
        } else if (sh.roof === 'saw') {
          var teeth = 3, tw = (x1 - x0) / teeth;
          for (var k = 0; k < teeth; k++) { p.lineTo(x0 + k * tw + tw * 0.8, top - 1.6 * s); p.lineTo(x0 + (k + 1) * tw, top); }
        } else if (sh.roof === 'step') {
          var q = (x1 - x0) * 0.22;
          p.lineTo(x0 + q, top); p.lineTo(x0 + q, top - 2 * s); p.lineTo(x1 - q, top - 2 * s); p.lineTo(x1 - q, top);
        } else if (sh.roof === 'spire') {
          p.lineTo((x0 + x1) / 2 - 0.3 * s, top); p.lineTo((x0 + x1) / 2, top - 5 * s); p.lineTo((x0 + x1) / 2 + 0.3 * s, top);
        }
        p.lineTo(x1, top); p.lineTo(x1, gy); p.closePath();
        return;
      case 'crane':
        var bx = X(sh.x), base = Y(0) + 1, ht = Y(sh.h);
        p.rect(bx - 0.6 * s, ht, 1.2 * s, base - ht);
        p.rect(Math.min(bx, bx + sh.dir * sh.arm * s) - (sh.dir < 0 ? 0 : 3 * s), ht - 0.5 * s, sh.arm * s + 3 * s, 0.9 * s);
        p.rect(bx + sh.dir * (sh.arm - 1) * s - 0.15 * s, ht, 0.3 * s, 7 * s);
        return;
      case 'lighthouse':
        x0 = X(sh.x - sh.w / 2); x1 = X(sh.x + sh.w / 2); top = Y(sh.h);
        p.moveTo(x0, Y(0) + 1); p.lineTo(x0 + 0.5 * s, top); p.lineTo(x1 - 0.5 * s, top); p.lineTo(x1, Y(0) + 1); p.closePath();
        p.rect(X(sh.x) - 1.1 * s, top - 3 * s, 2.2 * s, 3 * s);
        p.moveTo(X(sh.x) - 1.4 * s, top - 3 * s); p.lineTo(X(sh.x), top - 4.6 * s); p.lineTo(X(sh.x) + 1.4 * s, top - 3 * s); p.closePath();
        return;
      case 'minaret':
        x0 = X(sh.x - sh.w / 2); x1 = X(sh.x + sh.w / 2); top = Y(sh.h);
        p.rect(x0, top, x1 - x0, Y(0) + 1 - top);
        p.rect(x0 - 0.6 * s, Y(sh.h * 0.7), x1 - x0 + 1.2 * s, 0.8 * s);
        p.moveTo(x0, top); p.arc(X(sh.x), top, (x1 - x0) / 2, Math.PI, 0); p.lineTo(X(sh.x), top - 3 * s); p.closePath();
        return;
      case 'spire':
        x0 = X(sh.x - sh.w / 2); x1 = X(sh.x + sh.w / 2); top = Y(sh.h * 0.55);
        p.moveTo(x0, Y(0) + 1); p.lineTo(x0, top); p.lineTo(X(sh.x), Y(sh.h)); p.lineTo(x1, top); p.lineTo(x1, Y(0) + 1); p.closePath();
        return;
      case 'clock':
        x0 = X(sh.x - sh.w / 2); x1 = X(sh.x + sh.w / 2); top = Y(sh.h - 8);
        p.moveTo(x0, Y(0) + 1); p.lineTo(x0, top); p.lineTo(X(sh.x), Y(sh.h)); p.lineTo(x1, top); p.lineTo(x1, Y(0) + 1); p.closePath();
        return;
      case 'bridge':
        x0 = X(sh.x - sh.w / 2); x1 = X(sh.x + sh.w / 2);
        var deck = Y(sh.h), under = Y(0) + 1;
        p.moveTo(x0, under); p.lineTo(x0, deck); p.lineTo(x1, deck); p.lineTo(x1, under);
        var arches = 3, aw = (x1 - x0) / arches;
        for (var a = arches - 1; a >= 0; a--) {
          p.lineTo(x0 + (a + 1) * aw - aw * 0.12, under);
          p.arc(x0 + (a + 0.5) * aw, under, aw * 0.38, 0, Math.PI, true);
        }
        p.closePath();
        return;
    }
  };

  // ---- effects requested by the game ----

  Renderer.prototype.burst = function (e, now) {
    var type = e.shell.type;
    var big = e.factor > 1.1;
    var strength = Sky.flash.flashStrength(this.reducedFlash, e.factor);
    if (!this.limiter.allow(now)) strength = 0;
    if (strength > 0) {
      this.flashes.push({ x: e.x, y: e.y, r: (big ? 14 : 10), col: TYPE_COLOR[type], t0: now, dur: big ? 0.42 : 0.3, k: strength, soft: this.reducedFlash });
    }
    if (e.opening && e.grade === 'perfect') {
      this.pops.push({ x: e.x, y: e.y + 6, text: Sky.strings.t('perfect'), t0: now, dur: 1.0, size: 15, col: '#FFE6B8' });
      this.shake(2.2, now);
    }
    if (e.chainPos > 1) this.pops.push({ x: e.x, y: e.y - 4, text: String(e.chainPos), t0: now, dur: 0.8, size: 12, col: '#F2B04C' });
    // a puff of embers at the core
    for (var i = 0; i < 10; i++) {
      var a = (i / 10) * 6.283 + this.frameNo;
      this.parts.emit(e.x, e.y, Math.cos(a) * 6, Math.sin(a) * 6, 0.35, 1.0, C_WHITE, 3, 2);
    }
  };

  Renderer.prototype.fullClear = function (now) {
    if (!this.reducedFlash && this.limiter.allow(now)) this.skyGlow = 1;
    this.shake(3, now);
  };

  Renderer.prototype.dud = function (sh, t) {
    if (sh.minD2 < 1e8) {
      this.marks.push({ x0: sh.nearX, y0: sh.nearY, x1: M.shellX(sh, t), y1: M.shellY(sh, t), t0: t, gap: Math.sqrt(sh.minD2) - M.HIT_R });
    }
  };

  Renderer.prototype.ripple = null;

  Renderer.prototype.tapRipple = function (px, py, hit, now) {
    this.ripples.push({ x: px, y: py, t0: now, hit: hit });
  };

  Renderer.prototype.shake = function (amp, now) {
    if (this.reducedMotion) return;
    if (amp > this.shakeAmp || now - this.shakeT > 0.2) { this.shakeAmp = amp; this.shakeT = now; }
  };

  Renderer.prototype.reset = function () {
    this.flashes.length = 0; this.pops.length = 0; this.ripples.length = 0; this.marks.length = 0;
    this.parts.clear(); this.clearTrail(); this.skyGlow = 0; this.limiter.reset();
  };

  /** Districts lit for this many lights; the city dims in a scattered order. */
  Renderer.prototype.updateDistricts = function (lights, dt, now) {
    for (var i = 0; i < 10; i++) {
      var d = DIM_ORDER[i];
      var target = i < 10 - lights ? 0.06 : 1;
      var a = this.districtA[d];
      if (target < 0.5 && a > 0.5 && this.flicker[d] <= 0) this.flicker[d] = 0.45;
      if (this.flicker[d] > 0) this.flicker[d] -= dt;
      var rate = target > a ? 3 : 5;
      a += (target - a) * Math.min(1, rate * dt);
      this.districtA[d] = a;
    }
  };

  /**
   * One frame. st: { t (visual show time), alpha (step interpolation), now (seconds), dt, show, sparks,
   * lights, beatPhase, bar, guide, mode, hud }
   */
  Renderer.prototype.frame = function (st) {
    var ctx = this.ctx, dpr = this.dpr, w = this.w, h = this.h, v = this.view, s = v.s;
    var now = st.now, dt = st.dt;
    this.frameNo++;
    var ox = 0, oy = 0;
    var sk = now - this.shakeT;
    if (this.shakeAmp > 0 && sk < 0.25) {
      var fall = 1 - sk / 0.25;
      ox = Math.sin(now * 91) * this.shakeAmp * fall;
      oy = Math.cos(now * 77) * this.shakeAmp * fall;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.bg, -8 + ox, -8 + oy, w + 16, h + 16);
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);

    var pulse = st.beatPhase == null ? 0 : Math.exp(-st.beatPhase * 5) * (st.bar ? 1 : 0.6);
    this.skyGlow = Math.max(0, this.skyGlow - dt * 1.6);

    // horizon breath on the beat, and the warm glow of a full clear
    ctx.globalCompositeOperation = 'lighter';
    var glowA = 0.05 * pulse + 0.22 * this.skyGlow;
    if (glowA > 0.003) {
      var hg = ctx.createLinearGradient(0, v.ground - 160, 0, v.ground);
      hg.addColorStop(0, rgba(this.def.haze, 0));
      hg.addColorStop(1, rgba('#F2B04C', glowA));
      ctx.fillStyle = hg;
      ctx.fillRect(-10, v.ground - 160, w + 20, 160);
    }
    if (this.twinkles && !this.reducedMotion) {
      for (var ti = 0; ti < this.twinkles.length; ti++) {
        var tw = this.twinkles[ti];
        var ta = 0.25 + 0.25 * Math.sin(now * tw.s * 2 + tw.p) + 0.3 * pulse;
        if (ta > 0.02) { ctx.globalAlpha = Math.min(1, ta); ctx.drawImage(this.sprites.dot[C_WHITE], tw.x - 2, tw.y - 2, 4, 4); }
      }
      ctx.globalAlpha = 1;
    }

    var sparks = st.sparks || [];
    var alpha = st.alpha == null ? 1 : st.alpha;
    var t = st.t;

    // ---- the long-exposure trail layer ----
    var tc = this.trailCtx;
    var keep = Math.pow(0.885, dt * 60);
    if (sparks.length === 0 && this.parts.n === 0) this.quietFor += dt; else this.quietFor = 0;
    if (this.quietFor > 1.2) {
      // clear once: an 8-bit fade never quite reaches zero (and a long frame could skip a narrow window)
      if (!this.trailClear) { tc.clearRect(0, 0, this.trail.width, this.trail.height); this.trailClear = true; }
    } else {
      this.trailClear = false;
      tc.globalCompositeOperation = 'destination-out';
      tc.fillStyle = 'rgba(0,0,0,' + (1 - keep).toFixed(4) + ')';
      tc.fillRect(0, 0, this.trail.width, this.trail.height);
    }
    tc.globalCompositeOperation = 'lighter';
    var dots = this.sprites.dot, glows = this.sprites.glow, tints = this.sprites.tint;
    var i, p, x, y;
    // Each spark draws the segment it travelled since the last frame, batched by type and age band
    // (12 strokes a frame), so trails are continuous at any frame rate.
    var paths = [];
    for (i = 0; i < 16; i++) paths.push(null);
    for (i = 0; i < sparks.length; i++) {
      p = sparks[i];
      x = this.sx(p.px + (p.x - p.px) * alpha);
      y = this.sy(p.py + (p.y - p.py) * alpha);
      var life = 1 - p.age / p.life;
      var hot = p.age >= p.hot;
      if (p.lx === undefined || p.lf !== this.frameNo - 1) { p.lx = x; p.ly = y; }
      var band = hot ? (life > 0.66 ? 2 : life > 0.33 ? 1 : 0) : 3;
      var key = p.type * 4 + band;
      var path = paths[key] || (paths[key] = new Path2D());
      path.moveTo(p.lx, p.ly);
      path.lineTo(x, y);
      p.lx = x; p.ly = y; p.lf = this.frameNo;
      // embers trail behind the spark
      if (hot && (this.frameNo + i) % (p.type === 1 ? 2 : 3) === 0) {
        var ex = p.px + (p.x - p.px) * alpha * 0.5, ey = p.py + (p.y - p.py) * alpha * 0.5;
        if (p.type === 1) this.parts.emit(ex, ey, p.vx * 0.05, -1, 1.1 + life * 0.6, 0.9, 1, 1.5, 4);
        else this.parts.emit(ex, ey, p.vx * 0.04, p.vy * 0.04, 0.32, 0.7, TYPE_COLOR[p.type], 2, 6);
      }
    }
    tc.lineCap = 'round';
    for (i = 0; i < 16; i++) {
      if (!paths[i]) continue;
      var ty = i >> 2, bd = i & 3;
      tc.strokeStyle = TRAIL[TYPE_COLOR[ty]];
      tc.globalAlpha = TRAIL_ALPHA[bd];
      tc.lineWidth = s * TRAIL_WIDTH[bd] * (ty === 2 ? 1.2 : 1);
      tc.stroke(paths[i]);
    }
    tc.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.trail, 0, 0, w, h);

    // Rising shells draw a short fading tail from their own closed-form path, straight onto the frame:
    // never onto the long-exposure layer, so a shell's whole climb is never left painted on the sky.
    var shells = st.shells || [];
    var tails = [null, null, null, null, null];
    for (i = 0; i < shells.length; i++) {
      var sh = shells[i];
      if (sh.state !== M.AIR && sh.state !== M.FUSE) continue;
      if (t < sh.launchT) continue;
      var t1 = t;
      for (var seg = 0; seg < TAIL_SEGMENTS; seg++) {
        var t0 = t - (seg + 1) * TAIL_SECONDS / TAIL_SEGMENTS;
        if (t0 < sh.launchT) t0 = sh.launchT;
        if (t0 >= t1) break;
        var tp = tails[seg] || (tails[seg] = new Path2D());
        tp.moveTo(this.sx(M.shellX(sh, t1)), this.sy(M.shellY(sh, t1)));
        tp.lineTo(this.sx(M.shellX(sh, t0)), this.sy(M.shellY(sh, t0)));
        t1 = t0;
      }
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = TRAIL[C_AMBER];
    ctx.lineWidth = 0.45 * s;
    for (i = 0; i < TAIL_SEGMENTS; i++) {
      if (!tails[i]) continue;
      ctx.globalAlpha = 0.55 * (1 - i / TAIL_SEGMENTS);
      ctx.stroke(tails[i]);
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';

    // ---- glow at quarter resolution ----
    var gc = this.glowCtx;
    gc.setTransform(1, 0, 0, 1, 0, 0);
    gc.globalCompositeOperation = 'source-over';
    gc.clearRect(0, 0, this.glow.width, this.glow.height);
    gc.setTransform(0.25, 0, 0, 0.25, 0, 0);
    gc.globalCompositeOperation = 'lighter';
    for (i = this.flashes.length - 1; i >= 0; i--) {
      var f = this.flashes[i];
      var ft = (now - f.t0) / f.dur;
      if (ft >= 1) { this.flashes.splice(i, 1); continue; }
      var env = f.soft ? Math.min(1, ft * 4) * (1 - ft) : (1 - ft) * (1 - ft);
      var fr = f.r * s * (1 + ft * 0.6);
      gc.globalAlpha = Math.max(0, f.k * env);
      gc.drawImage(glows[f.col], this.sx(f.x) - fr, this.sy(f.y) - fr, fr * 2, fr * 2);
      gc.globalAlpha = Math.max(0, f.k * env * 0.8);
      gc.drawImage(glows[C_WHITE], this.sx(f.x) - fr * 0.4, this.sy(f.y) - fr * 0.4, fr * 0.8, fr * 0.8);
    }
    gc.globalAlpha = 0.5;
    for (i = 0; i < sparks.length; i++) {
      p = sparks[i];
      if (p.age < p.hot) continue;
      x = this.sx(p.px + (p.x - p.px) * alpha);
      y = this.sy(p.py + (p.y - p.py) * alpha);
      var gr = 4.5 * s * (1 - 0.6 * p.age / p.life);
      gc.drawImage(glows[TYPE_COLOR[p.type]], x - gr, y - gr, gr * 2, gr * 2);
    }
    gc.globalAlpha = 1;
    ctx.drawImage(this.glow, 0, 0, w, h);

    // ---- embers ----
    var P = this.parts;
    P.update(dt);
    for (i = 0; i < P.n; i++) {
      var pa = 1 - P.age[i] / P.life[i];
      ctx.globalAlpha = pa * pa;
      var pr = P.size[i] * s * 0.6;
      ctx.drawImage(tints[P.col[i]], this.sx(P.x[i]) - pr, this.sy(P.y[i]) - pr, pr * 2, pr * 2);
    }
    ctx.globalAlpha = 1;

    // ---- crisp spark heads (a white pinpoint in the shell's colour) and shells ----
    for (i = 0; i < sparks.length; i++) {
      p = sparks[i];
      if (p.age < p.hot) continue;
      x = this.sx(p.px + (p.x - p.px) * alpha);
      y = this.sy(p.py + (p.y - p.py) * alpha);
      var hr = 0.62 * s * (0.65 + 0.35 * (1 - p.age / p.life));
      ctx.drawImage(dots[TYPE_COLOR[p.type]], x - hr, y - hr, hr * 2, hr * 2);
    }
    this.drawShells(ctx, shells, t, now);

    // ---- the city ----
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.city, 0, 0, w, h);
    ctx.globalAlpha = 0.25 + 0.55 * pulse;
    ctx.drawImage(this.rim, 0, 0, w, h);
    ctx.globalAlpha = 1;
    this.updateDistricts(st.lights == null ? 10 : st.lights, dt, now);
    ctx.fillStyle = '#F2B04C';
    for (i = 0; i < 10; i++) {
      var da = this.districtA[i];
      if (this.flicker[i] > 0) da = ((this.frameNo * 7 + i * 13) % 5) < 2 ? 0.15 : 0.9;
      ctx.globalAlpha = Math.max(0.05, Math.min(1, da * (0.78 + 0.22 * pulse)));
      ctx.fill(this.windowPaths[i]);
    }
    ctx.globalAlpha = 1;

    // ---- water reflection ----
    if (this.def.water) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-10, v.ground + 1, w + 20, h - v.ground + 10);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3;
      ctx.translate(0, v.ground * 2);
      ctx.scale(1, -1);
      ctx.drawImage(this.trail, 0, 0, w, h);
      ctx.drawImage(this.glow, 0, 0, w, h);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (this.ripple) ctx.drawImage(this.ripple, 0, v.ground, w, h - v.ground);
    }

    // ---- snow ----
    if (this.snow) {
      ctx.fillStyle = 'rgba(232,242,248,0.7)';
      for (i = 0; i < this.snow.length; i++) {
        var fl = this.snow[i];
        if (!this.reducedMotion) {
          fl.y += fl.v * dt;
          fl.x += Math.sin(now * 0.7 + fl.d) * 6 * dt;
          if (fl.y > h) { fl.y = -4; }
          if (fl.x > w) fl.x -= w; else if (fl.x < 0) fl.x += w;
        }
        ctx.fillRect(fl.x, fl.y, fl.s, fl.s);
      }
    }

    // ---- guidance and feedback ----
    this.drawOverlays(ctx, st, now);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (st.hud) this.drawHud(ctx, st.hud, now);
  };

  Renderer.prototype.drawShells = function (ctx, shells, t, now) {
    var s = this.view.s, dots = this.sprites.dot, glows = this.sprites.glow;
    for (var i = 0; i < shells.length; i++) {
      var sh = shells[i];
      var st = sh.state;
      if (st === M.WAIT || st === M.BURST) continue;
      if (t < sh.launchT) continue;
      var x = this.sx(M.shellX(sh, t)), y = this.sy(M.shellY(sh, t));
      if (st === M.DUD) {
        var since = t - (sh.dudStep >= 0 ? sh.dudStep * M.DT : sh.deadT);
        if (since > 0.9) continue;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.max(0, 0.8 * (1 - since / 0.9));
        ctx.drawImage(dots[C_SMOKE], x - 1.4 * s, y - 1.4 * s, 2.8 * s, 2.8 * s);
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.globalCompositeOperation = 'lighter';
      var dc = t - sh.crestT;
      var glint = Math.exp(-(dc * dc) / (0.11 * 0.11));
      var col = TYPE_COLOR[sh.type];
      var gr = (2.6 + 2.4 * glint) * s;
      ctx.globalAlpha = 0.55 + 0.45 * glint;
      ctx.drawImage(glows[col], x - gr, y - gr, gr * 2, gr * 2);
      var hr = (1.1 + 0.35 * glint) * s;
      if (st === M.FUSE) hr *= 1.3 + 0.4 * Math.sin(now * 60);
      ctx.globalAlpha = 1;
      ctx.drawImage(dots[C_WHITE], x - hr, y - hr, hr * 2, hr * 2);
      // the type mark, so a shell can be read during its climb
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = COLORS[col];
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = Math.max(1, 0.32 * s);
      var m = 2.3 * s;
      ctx.beginPath();
      if (sh.type === 1) {
        ctx.moveTo(x - m * 0.8, y + m * 0.2); ctx.quadraticCurveTo(x - m * 1.1, y + m * 0.9, x - m * 0.9, y + m * 1.5);
        ctx.moveTo(x + m * 0.8, y + m * 0.2); ctx.quadraticCurveTo(x + m * 1.1, y + m * 0.9, x + m * 0.9, y + m * 1.5);
      } else if (sh.type === 2) {
        ctx.moveTo(x - m * 1.3, y); ctx.lineTo(x - m * 0.6, y); ctx.moveTo(x + m * 0.6, y); ctx.lineTo(x + m * 1.3, y);
        ctx.moveTo(x, y - m * 1.3); ctx.lineTo(x, y - m * 0.6); ctx.moveTo(x, y + m * 0.6); ctx.lineTo(x, y + m * 1.3);
      } else if (sh.type === 3) {
        ctx.arc(x, y, m, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  Renderer.prototype.drawOverlays = function (ctx, st, now) {
    var s = this.view.s, i;
    ctx.globalCompositeOperation = 'source-over';
    var t = st.t;
    // guide ring: closes on the crest
    if (st.guide) {
      var g = st.guide;
      var gx = this.sx(M.shellX(g, t)), gy = this.sy(M.shellY(g, t));
      var left = g.crestT - t;
      var k = Math.max(0, Math.min(1, left / 1.2));
      var rr = (3.4 + 16 * k) * s;
      ctx.strokeStyle = 'rgba(255,230,184,' + (0.35 + 0.5 * (1 - k)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gx, gy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,184,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(gx, gy, 3.4 * s, 0, Math.PI * 2); ctx.stroke();
      // a finger mark under the target
      ctx.fillStyle = 'rgba(255,247,234,' + (0.5 + 0.4 * Math.sin(now * 6)).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(gx + 6 * s, gy + 7 * s, 1.6 * s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,247,234,0.5)';
      ctx.beginPath(); ctx.arc(gx + 6 * s, gy + 7 * s, 3 * s, 0, Math.PI * 2); ctx.stroke();
    }
    // near-miss marks: where the nearest spark passed a shell that fell dark
    for (i = this.marks.length - 1; i >= 0; i--) {
      var mk = this.marks[i];
      var age = t - mk.t0;
      if (age > 1.6 || age < 0) { if (age > 1.6) this.marks.splice(i, 1); continue; }
      var a = 0.7 * (1 - age / 1.6);
      ctx.strokeStyle = 'rgba(212,227,255,' + a.toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      if (ctx.setLineDash) ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(this.sx(mk.x0), this.sy(mk.y0)); ctx.lineTo(this.sx(mk.x1), this.sy(mk.y1)); ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
      var cx = this.sx(mk.x1), cy = this.sy(mk.y1), q = 1.6 * s;
      ctx.beginPath(); ctx.moveTo(cx - q, cy - q); ctx.lineTo(cx + q, cy + q); ctx.moveTo(cx + q, cy - q); ctx.lineTo(cx - q, cy + q); ctx.stroke();
    }
    // tap ripples
    for (i = this.ripples.length - 1; i >= 0; i--) {
      var rp = this.ripples[i];
      // t0 is the tap's own time, which can be later than this frame's timestamp on a slow frame
      var ra = Math.max(0, (now - rp.t0) / 0.35);
      if (ra >= 1) { this.ripples.splice(i, 1); continue; }
      ctx.strokeStyle = rp.hit ? 'rgba(255,230,184,' + (0.8 * (1 - ra)).toFixed(3) + ')' : 'rgba(167,176,204,' + (0.5 * (1 - ra)).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, 6 + ra * (rp.hit ? 26 : 14), 0, Math.PI * 2); ctx.stroke();
    }
    // number and word pops
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = this.pops.length - 1; i >= 0; i--) {
      var pp = this.pops[i];
      var pa = (now - pp.t0) / pp.dur;
      if (pa >= 1) { this.pops.splice(i, 1); continue; }
      var ease = 1 - Math.pow(1 - Math.min(1, pa * 3), 3);
      ctx.globalAlpha = pa < 0.7 ? 1 : (1 - pa) / 0.3;
      ctx.font = '600 ' + Math.round(pp.size * (0.8 + 0.2 * ease)) + 'px ' + FONT;
      ctx.fillStyle = pp.col;
      ctx.fillText(pp.text, this.sx(pp.x), this.sy(pp.y) - ease * 10);
    }
    ctx.globalAlpha = 1;
  };

  /** HUD: score, multiplier, the ten lights, the spark, progress. */
  Renderer.prototype.drawHud = function (ctx, hud, now) {
    var ins = this.insets, w = this.w;
    var x = ins.left + 18, y = ins.top + 16;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if ('fontStretch' in ctx) ctx.fontStretch = 'condensed';
    ctx.font = '600 30px ' + FONT;
    ctx.fillStyle = '#FFF7EA';
    var scoreText = hud.score.toLocaleString('en-US');
    ctx.fillText(scoreText, x, y);
    var sw = ctx.measureText(scoreText).width;
    if (hud.mult > 1) {
      ctx.font = '600 18px ' + FONT;
      ctx.fillStyle = '#F2B04C';
      ctx.fillText('×' + hud.mult, x + sw + 10, y + 9);
    }
    if ('fontStretch' in ctx) ctx.fontStretch = 'normal';
    // lights
    for (var i = 0; i < 10; i++) {
      var on = i < hud.lights;
      ctx.fillStyle = on ? '#F2B04C' : 'rgba(242,176,76,0.18)';
      ctx.fillRect(x + i * 9, y + 40, 5, 5);
    }
    // the spark of the volley in play
    var cx = w - ins.right - 84, cy = ins.top + 38;
    var lit = hud.spark;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = lit ? '#FFE6B8' : 'rgba(255,230,184,0.22)';
    ctx.beginPath();
    for (var k = 0; k < 8; k++) {
      var r = k % 2 === 0 ? 9 : 2.6;
      var a = k * Math.PI / 4 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // progress
    var py = ins.top + 4;
    ctx.fillStyle = 'rgba(255,247,234,0.08)';
    ctx.fillRect(ins.left + 18, py, w - ins.left - ins.right - 36, 2);
    ctx.fillStyle = 'rgba(242,176,76,0.85)';
    ctx.fillRect(ins.left + 18, py, (w - ins.left - ins.right - 36) * hud.progress, 2);
  };

  /** Ambient bursts behind the menu: decorative sparks only, from a seeded sequence. */
  Renderer.prototype.ambientBurst = function (list, rng, now) {
    var type = rng.int(4);
    var b = { x: 18 + rng.float() * 64, y: 80 + rng.float() * 60, type: type, factor: 0.9, seed: rng.u32(), svx: 0, svy: 0, chain: -1, shell: -1, step: 0 };
    M.burstSparks(b, list);
    var e = { shell: { type: type }, x: b.x, y: b.y, factor: 0.9, chainPos: 0 };
    this.flashes.push({ x: e.x, y: e.y, r: 9, col: TYPE_COLOR[type], t0: now, dur: 0.35, k: this.reducedFlash ? 0.25 : 0.55, soft: true });
  };

  /**
   * A still postcard of a chain: a long exposure redrawn from the chain's stored bursts.
   * Returns the canvas.
   */
  function postcard(canvas, def, bursts, opts) {
    opts = opts || {};
    var W = canvas.width, H = canvas.height;
    var g = canvas.getContext('2d');
    // Frame the chain: from the ground to just above its highest burst, centred on its bursts.
    var top = 60, minX = 1e9, maxX = -1e9;
    for (var i = 0; i < bursts.length; i++) {
      top = Math.max(top, bursts[i].y + 24);
      minX = Math.min(minX, bursts[i].x); maxX = Math.max(maxX, bursts[i].x);
    }
    var s = Math.min(W / 70, H / (top + 6));
    var groundY = H - 6 * s;
    var half = W / 2 / s;
    var cxw = bursts.length ? (minX + maxX) / 2 : 50;
    if (half < 120) cxw = Math.max(-70 + half, Math.min(170 - half, cxw)); else cxw = 50;
    function X(x) { return W / 2 + (x - cxw) * s; }
    function Y(y) { return groundY - y * s; }
    var grad = g.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, def.sky[0]); grad.addColorStop(0.5, def.sky[1]); grad.addColorStop(0.85, def.sky[2]); grad.addColorStop(1, def.sky[3]);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    var r = R.create(def.seed * 13 + 3);
    for (i = 0; i < W * H / 1800; i++) {
      g.fillStyle = 'rgba(230,236,255,' + (0.15 + 0.4 * r.float()).toFixed(2) + ')';
      g.fillRect(r.float() * W, r.float() * groundY * 0.9, 1, 1);
    }
    // long exposure of every spark of the chain
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    var list = [];
    for (i = 0; i < bursts.length; i++) {
      var b = bursts[i];
      list.length = 0;
      M.burstSparks({ x: b.x, y: b.y, type: b.type, factor: b.factor, seed: b.seed, svx: b.svx, svy: b.svy, chain: 0, shell: 0, step: 0 }, list);
      var rgb = hexRgb(TRAIL[TYPE_COLOR[b.type]]);
      for (var k = 0; k < list.length; k++) {
        var p = list[k];
        var lx = X(p.x), ly = Y(p.y);
        while (p.age < p.life) {
          M.stepSpark(p);
          var life = 1 - p.age / p.life;
          if (p.age >= p.hot) {
            g.strokeStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (0.08 + 0.42 * life).toFixed(3) + ')';
            g.lineWidth = Math.max(0.8, s * 0.45 * (0.4 + life));
            g.beginPath(); g.moveTo(lx, ly); g.lineTo(X(p.x), Y(p.y)); g.stroke();
          }
          lx = X(p.x); ly = Y(p.y);
        }
      }
      var core = g.createRadialGradient(X(b.x), Y(b.y), 0, X(b.x), Y(b.y), 7 * s);
      core.addColorStop(0, 'rgba(255,247,234,0.55)');
      core.addColorStop(1, 'rgba(255,247,234,0)');
      g.fillStyle = core;
      g.fillRect(X(b.x) - 7 * s, Y(b.y) - 7 * s, 14 * s, 14 * s);
    }
    g.globalCompositeOperation = 'source-over';
    // the skyline
    var shapes = SL.silhouette(def);
    var fake = {
      view: { s: s }, sx: X, sy: Y
    };
    g.fillStyle = def.silhouette;
    var winPath = new Path2D();
    for (i = 0; i < shapes.length; i++) {
      var sh = shapes[i];
      var p2 = new Path2D();
      Renderer.prototype.shapePath.call(fake, p2, sh, s);
      g.fill(p2);
      if (sh.windows) for (var wn = 0; wn < sh.windows.length; wn++) {
        var wd = sh.windows[wn];
        winPath.rect(X(wd.x), Y(wd.y + wd.h), wd.w * s, wd.h * s);
      }
    }
    g.fillRect(0, groundY, W, H - groundY);
    g.fillStyle = '#F2B04C';
    g.globalAlpha = 0.9;
    g.fill(winPath);
    g.globalAlpha = 1;
    if (opts.frame) {
      g.strokeStyle = 'rgba(255,247,234,0.12)';
      g.lineWidth = 1;
      g.strokeRect(0.5, 0.5, W - 1, H - 1);
    }
    return canvas;
  }

  var api = { Renderer: Renderer, postcard: postcard, COLORS: COLORS, FONT: FONT, sprite: sprite };
  Sky.render = api;
})(typeof window !== 'undefined' ? window : globalThis);
