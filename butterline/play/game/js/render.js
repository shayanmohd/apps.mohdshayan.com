/*
 * The world renderer: sky, the visible air, terrain and runway, the aircraft and its shadow, effects
 * and the in-flight HUD. Height is drawn on a logarithmic scale above the runway, so the glide path reads
 * on a tall screen and the flare gets the most pixels; the horizontal scale zooms into the flare.
 */
(function (root) {
  'use strict';
  var BL = root.BL;
  var art = BL.art, wind = BL.wind, airports = BL.airports, sim = BL.sim, rng = BL.rng, C = BL.art.C;

  var FONT = '"Sofia Sans Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif';
  var KT = 1.943844;
  var FT = 3.28084;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function hexMix(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    function ch(sh) { return Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t); }
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function create(canvas) {
    var ctx = canvas.getContext('2d', { alpha: false });
    var W = 1, H = 1, DPR = 1, ui = 1;
    var insets = { top: 0, right: 0, bottom: 0, left: 0 };
    var reduced = false;
    var scene = null;
    var cam = { x: 0, sx: 1, sv: 11, zy: 1, anchor: 0.27, dip: 0, shake: 0 };
    var parts = [];
    var smoke = [];
    var pops = [];
    var vr = rng.make(0xb1e55ed);
    var sample = {};
    var skyCache = null;
    var groundCache = null;
    var stars = [];
    var hills = null;

    function resize(w, h, dpr, ins) {
      W = Math.max(1, w);
      H = Math.max(1, h);
      DPR = Math.min(2, dpr || 1);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ui = clamp(Math.min(W / 412, H / 860), 0.72, 1.35);
      if (ins) insets = ins;
      skyCache = null;
      groundCache = null;
    }

    function setInsets(ins) { insets = ins; }
    function setReduced(r) { reduced = !!r; }

    function groundLine() { return H * 0.79; }
    function topY() { return insets.top + H * 0.2; }

    /** A new flight: palette, particles, hills. */
    function setScene(f) {
      var first = !scene || scene.ap !== f.ap || scene.ac !== f.ac;
      scene = { f: f, ap: f.ap, ac: f.ac, rw: f.rw, h0: Math.max(3.5, f.ac.geSpan * 0.45), hTop: f.h0 * 1.06 };
      cam.x = f.x;
      cam.sv = 11;
      cam.zy = 1;
      cam.anchor = 0.27;
      cam.dip = 0;
      cam.shake = 0;
      cam.sx = sxFor(cam.sv);
      smoke.length = 0;
      pops.length = 0;
      if (first) {
        skyCache = null;
        hills = makeHills(f.ap);
        stars = [];
        var sr = rng.make(0x57a25);
        for (var i = 0; i < 70; i++) stars.push([sr.next(), sr.next() * 0.6, sr.range(0.4, 1.3), sr.next()]);
      }
      parts.length = 0;
      var n = Math.round(clamp(W * H / 1300, 150, 330) * (reduced ? 0.6 : 1));
      for (i = 0; i < n; i++) parts.push(spawn({}, true));
    }

    function sxFor(sv) {
      return (W * 0.73) / (scene.ac.vref * sv);
    }

    // Below the runway the scale is compressed too, so the sea and the valley sit close under the horizon.
    function L(u) { return u >= 0 ? Math.log(1 + u) : -0.4 * Math.log(1 - u); }
    function Linv(v) { return v >= 0 ? Math.exp(v) - 1 : 1 - Math.exp(-v / 0.4); }
    function A() {
      return (groundLine() - topY()) / L(scene.hTop / scene.h0) * cam.zy;
    }
    function X(x) { return W * cam.anchor + (x - cam.x) * cam.sx; }
    // Heights on screen are above the runway plane (flat on screen), so an uphill strip stays readable;
    // its slope shows as a gentle tilt of the world layers against the horizon (see slopeTilt).
    function Y(h) { return groundLine() - A() * L(h / scene.h0); }
    function rwBase(x) { return scene.ap.slope * clamp(x, 0, scene.rw.end); }
    function slopeAngAt(x) {
      var rw = scene.rw;
      return Math.atan(scene.ap.slope) * smoothstep(-20, 0, x) * (1 - smoothstep(rw.end, rw.end + 20, x));
    }
    /** A sloped strip tilts the world layers a little against the horizon, pivoting on the aircraft. */
    function slopeTilt() {
      var k = scene.ap.slope * 2;
      if (k) ctx.transform(1, -k, 0, 1, 0, k * W * cam.anchor);
    }
    function worldX(px) { return cam.x + (px - W * cam.anchor) / cam.sx; }
    function worldH(py) { return scene.h0 * Linv((groundLine() - py) / A()); }

    function spawn(p, anywhere) {
      var x0 = worldX(-30), x1 = worldX(W + 80);
      p.x = anywhere ? lerp(x0, x1, vr.next()) : lerp(worldX(W + 10), x1, vr.next());
      var vmax = (groundLine() - (insets.top + H * 0.08)) / A();
      p.h = scene.h0 * Linv(lerp(0.06, vmax, vr.next()));
      p.life = vr.range(2.4, 5.5);
      p.age = anywhere ? vr.range(0, p.life) : 0;
      p.w = vr.range(0.8, 1.6);
      return p;
    }

    function makeHills(ap) {
      var r = rng.make(rng.hashString('hills-' + ap.id));
      var far = [], near = [];
      for (var i = 0; i <= 64; i++) {
        far.push(r.range(0.2, 1));
        near.push(r.range(0.1, 1));
      }
      return { far: far, near: near, turbines: [r.range(0.1, 0.3), r.range(0.45, 0.6), r.range(0.75, 0.9)] };
    }

    // ---- camera ----

    function updateCamera(v, dt) {
      var f = v.f;
      var hr = Math.max(0, v.h - airports.groundAt(f.ap, f.rw, v.x));
      var onGround = f.phase === 'ground' || (f.done && hr < 0.05);
      var svTarget = onGround ? 5.2 : 3.8 + (11 - 3.8) * smoothstep(2, scene.hTop * 0.75, hr);
      var k = 1 - Math.exp(-dt / 0.45);
      cam.sv += (svTarget - cam.sv) * k;
      cam.sx = sxFor(cam.sv);
      var zyTarget = (onGround ? 1.18 : 1 + 0.32 * (1 - smoothstep(0, 9, hr))) + cam.dip;
      cam.zy += (zyTarget - cam.zy) * k;
      var anchorTarget = onGround ? 0.33 : 0.27;
      cam.anchor += (anchorTarget - cam.anchor) * (1 - Math.exp(-dt / 0.8));
      cam.x = v.x;
      cam.dip *= Math.exp(-dt / 0.35);
      cam.shake *= Math.exp(-dt / 0.12);
    }

    // ---- layers ----

    function drawSky() {
      var sky = scene.ap.sky;
      var gl = groundLine();
      if (!skyCache || skyCache.w !== W || skyCache.h !== H || skyCache.id !== scene.ap.id) {
        var g = ctx.createLinearGradient(0, 0, 0, gl);
        g.addColorStop(0, sky.top);
        g.addColorStop(0.55, sky.mid);
        g.addColorStop(1, sky.horizon);
        var sun = ctx.createRadialGradient(W * 0.78, H * 0.17, 0, W * 0.78, H * 0.17, H * 0.32);
        sun.addColorStop(0, hexA(sky.sun, sky.night ? 0.32 : 0.55));
        sun.addColorStop(0.12, hexA(sky.sun, sky.night ? 0.08 : 0.18));
        sun.addColorStop(1, hexA(sky.sun, 0));
        skyCache = { w: W, h: H, id: scene.ap.id, g: g, sun: sun };
      }
      ctx.fillStyle = skyCache.g;
      ctx.fillRect(0, 0, W, gl + 2);
      ctx.fillStyle = skyCache.sun;
      ctx.fillRect(0, 0, W, gl);
      if (sky.night) {
        ctx.fillStyle = '#e9eef8';
        for (var i = 0; i < stars.length; i++) {
          var s = stars[i];
          ctx.globalAlpha = 0.25 + 0.5 * s[3];
          ctx.fillRect(s[0] * W, s[1] * gl, s[2], s[2]);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#eef2fa';
        ctx.beginPath();
        ctx.arc(W * 0.78, H * 0.17, 13 * ui, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = hexA(sky.sun, 0.9);
        ctx.beginPath();
        ctx.arc(W * 0.78, H * 0.17, 16 * ui, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function hillLine(list, scroll, base, amp, color, kind) {
      var gl = groundLine();
      // Fewer control points for ridges than for soft hills: peaks, not teeth.
      var n = kind === 'ridge' ? 18 : 28;
      var span = W * 1.6;
      var off = ((scroll % span) + span) % span;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-10, gl + 2);
      for (var px = -10; px <= W + 10; px += 8) {
        var u = ((px + off) / span) * n;
        var i = Math.floor(u) % n;
        var t = u - Math.floor(u);
        var a = list[i], b = list[(i + 1) % n];
        var hgt = lerp(a, b, t * t * (3 - 2 * t));
        if (kind === 'ridge') hgt = Math.pow(hgt, 1.6);
        ctx.lineTo(px, gl - base - amp * hgt);
      }
      ctx.lineTo(W + 10, gl + 2);
      ctx.closePath();
      ctx.fill();
    }

    function drawHills() {
      var sky = scene.ap.sky;
      var id = scene.ap.id;
      var scrollFar = cam.x * cam.sx * 0.05;
      var scrollNear = cam.x * cam.sx * 0.14;
      if (id === 'island') {
        hillLine(hills.far, scrollFar, 0, 26 * ui, hexA(sky.far, 0.55), 'soft');
      } else if (id === 'mountain') {
        hillLine(hills.far, scrollFar, 10 * ui, 150 * ui, hexA(sky.far, 0.75), 'ridge');
        hillLine(hills.near, scrollNear, 0, 90 * ui, hexA(sky.near, 0.9), 'ridge');
      } else if (id === 'night') {
        hillLine(hills.far, scrollFar, 0, 34 * ui, sky.far, 'soft');
      } else {
        hillLine(hills.far, scrollFar, 0, 22 * ui, hexA(sky.far, 0.7), 'soft');
        // Distant wind turbines: the plain is known for its wind.
        var gl = groundLine();
        ctx.strokeStyle = hexA('#dfe5e8', 0.55);
        ctx.lineWidth = 1.2;
        for (var i = 0; i < hills.turbines.length; i++) {
          var span = W * 1.6;
          var px = (((hills.turbines[i] * span - scrollNear) % span) + span) % span - 20;
          var top = gl - 48 * ui;
          ctx.beginPath();
          ctx.moveTo(px, gl - 6 * ui);
          ctx.lineTo(px, top);
          var a0 = (scene.f.t * 1.4 + i * 2) % (Math.PI * 2);
          for (var b = 0; b < 3; b++) {
            var a = a0 + b * Math.PI * 2 / 3;
            ctx.moveTo(px, top);
            ctx.lineTo(px + Math.cos(a) * 16 * ui, top + Math.sin(a) * 16 * ui);
          }
          ctx.stroke();
        }
      }
    }

    function drawAir(v, dt, t) {
      var air = scene.f.air;
      var night = scene.ap.sky.night;
      var base = scene.ap.streak;
      var gl = groundLine();
      var kx = 4.6 * ui, kz = 15 * ui;
      // Band boundaries: hairlines with each band's wind at the right edge.
      ctx.font = '500 ' + Math.round(12 * ui) + 'px ' + FONT;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (var i = 0; i < air.bands.length; i++) {
        var b = air.bands[i];
        var yb = Y(b.top);
        if (i < air.bands.length - 1 && yb > topY() - 40 * ui && yb < gl - 8) {
          ctx.strokeStyle = hexA(base, 0.08);
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 6]);
          ctx.beginPath();
          ctx.moveTo(0, yb);
          ctx.lineTo(W, yb);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        var mid = Y((b.bottom + Math.min(b.top, b.bottom + 22)) / 2);
        if (mid > insets.top + 120 * ui && mid < gl - 10 * ui) {
          var wv = wind.bandWind(air, (b.bottom + Math.min(b.top, b.bottom + 22)) / 2) * (i === 0 ? 1 - air.shear * 0.4 : 1);
          var kt = Math.round(Math.abs(wv) * KT);
          var xr = W - insets.right - 10 * ui;
          ctx.fillStyle = hexA(base, 0.62);
          ctx.fillText(String(kt), xr, mid);
          var tw = ctx.measureText(String(kt)).width;
          var ax = xr - tw - 6 * ui;
          var dir = wv < 0 ? -1 : 1;
          ctx.strokeStyle = hexA(base, 0.62);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(ax - 12 * ui, mid);
          ctx.lineTo(ax, mid);
          var tip = dir < 0 ? ax - 12 * ui : ax;
          ctx.moveTo(tip - dir * 4 * ui, mid - 3.5 * ui);
          ctx.lineTo(tip, mid);
          ctx.lineTo(tip - dir * 4 * ui, mid + 3.5 * ui);
          ctx.stroke();
        }
      }

      // Streaks: buckets by kind and brightness, one path each.
      var paths = [[], [], [], [], [], [], [], [], []];
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        wind.sample(air, p.x, p.h, t, sample);
        p.x += sample.wx * dt;
        p.h += sample.wz * dt;
        p.age += dt;
        var sx = X(p.x), sy = Y(p.h);
        var gH = airports.groundAt(scene.ap, scene.rw, p.x) - rwBase(p.x);
        if (p.age > p.life || sx < -40 || sx > W + 90 || sy < insets.top + H * 0.06 || p.h < gH + 0.15) {
          spawn(p, sx < -40 ? false : true);
          if (sx < -40) p.age = 0;
          continue;
        }
        var env = Math.min(1, p.age / 0.6, (p.life - p.age) / 0.8);
        var gust = Math.min(1, Math.abs(sample.gust) / 3.5);
        var kind = sample.wz < -0.35 ? 1 : sample.wz > 0.35 ? 2 : 0;
        var lvl = env * (0.5 + 0.5 * gust) > 0.66 ? 2 : env > 0.45 ? 1 : 0;
        var len = 1 + gust * 0.7;
        paths[kind * 3 + lvl].push(sx, sy, sx - sample.wx * kx * len * p.w, sy + sample.wz * kz * p.w);
      }
      var colors = [base, '#8fb3ff', '#ffd59a'];
      var alphas = night ? [0.1, 0.22, 0.42] : [0.12, 0.26, 0.5];
      ctx.lineCap = 'round';
      if (night) ctx.globalCompositeOperation = 'lighter';
      for (var kk = 0; kk < 9; kk++) {
        var list = paths[kk];
        if (!list.length) continue;
        var lv = kk % 3;
        ctx.strokeStyle = hexA(colors[Math.floor(kk / 3)], alphas[lv]);
        ctx.lineWidth = (lv === 2 ? 1.9 : 1.4) * ui;
        ctx.beginPath();
        for (var j = 0; j < list.length; j += 4) {
          ctx.moveTo(list[j], list[j + 1]);
          ctx.lineTo(list[j + 2], list[j + 3]);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawButterLine(v) {
      var f = scene.f;
      var hr = Math.max(0, v.h - airports.groundAt(f.ap, f.rw, v.x));
      var fade = smoothstep(0.5, 7, hr);
      if (fade <= 0.01 || f.phase === 'ground') return;
      var x0 = worldX(-10);
      var x1 = f.rw.aim;
      if (x1 < x0) return;
      ctx.save();
      ctx.lineWidth = 2 * ui;
      ctx.setLineDash([9 * ui, 7 * ui]);
      ctx.lineDashOffset = -X(0);
      var steps = 28;
      var px = v.x;
      ctx.strokeStyle = hexA(C.butter, 0.22 * fade);
      ctx.beginPath();
      for (var i = 0; i <= steps; i++) {
        var x = lerp(x0, Math.min(px, x1), i / steps);
        var y = Y(sim.glideAt(f, x) - rwBase(x));
        if (i === 0) ctx.moveTo(X(x), y); else ctx.lineTo(X(x), y);
      }
      ctx.stroke();
      ctx.strokeStyle = hexA(C.butter, 0.75 * fade);
      ctx.beginPath();
      for (i = 0; i <= steps; i++) {
        var xa = lerp(Math.min(px, x1), x1, i / steps);
        var ya = Y(sim.glideAt(f, xa) - rwBase(xa));
        if (i === 0) ctx.moveTo(X(xa), ya); else ctx.lineTo(X(xa), ya);
      }
      ctx.stroke();
      ctx.restore();
    }

    function drawGround(t) {
      var f = scene.f, ap = scene.ap, rw = scene.rw;
      var gl = groundLine();
      var sky = ap.sky;
      // The far plane under the horizon (sea or haze-softened land), then the near terrain over it.
      if (!groundCache || groundCache.w !== W || groundCache.h !== H || groundCache.id !== ap.id) {
        var fg = ctx.createLinearGradient(0, gl, 0, H);
        if (sky.water) {
          fg.addColorStop(0, sky.near);
          fg.addColorStop(1, '#0d2333');
        } else {
          fg.addColorStop(0, sky.far);
          fg.addColorStop(0.35, sky.ground);
          fg.addColorStop(1, sky.ground);
        }
        var ng = ctx.createLinearGradient(0, gl, 0, H);
        ng.addColorStop(0, sky.ground);
        ng.addColorStop(1, hexMix(sky.ground, '#05080c', 0.45));
        groundCache = { w: W, h: H, id: ap.id, far: fg, near: ng };
      }
      ctx.fillStyle = groundCache.far;
      ctx.fillRect(0, gl - 1, W, H - gl + 1);
      ctx.fillStyle = groundCache.near;
      ctx.beginPath();
      ctx.moveTo(-10, H + 60);
      var stepPx = 6;
      for (var px = -10; px <= W + 10; px += stepPx) {
        var wx = worldX(px);
        ctx.lineTo(px, Math.min(H + 60, Y(airports.groundAt(ap, rw, wx) - rwBase(wx))));
      }
      ctx.lineTo(W + 10, H + 60);
      ctx.closePath();
      ctx.fill();
      // Furrows in the ground that stream past at the speed of the ground: the speed cue in the flare.
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = sky.night ? 'rgba(160, 190, 230, 0.07)' : 'rgba(238, 243, 247, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      var top = Y(0) + 7 * ui + 6;
      for (var row = 0; row < 7; row++) {
        var depth = (row + 1) / 7;
        var ry = top + (H - top) * depth * depth;
        if (ry > H) break;
        var gap = 70 * ui * (0.6 + depth * 1.6);
        var len = gap * 0.45;
        var shift = (((cam.x * cam.sx * (0.35 + depth * 0.9)) % gap) + gap) % gap;
        for (var dx = -shift; dx < W; dx += gap) {
          ctx.moveTo(dx, ry);
          ctx.lineTo(dx + len, ry);
        }
      }
      ctx.stroke();
      ctx.restore();
      if (sky.water) {
        // The sea before the beach and past the far end.
        var wy = Y(-2.2);
        ctx.fillStyle = groundCache.far;
        var xs = X(-40), xe = X(rw.end + 60);
        if (xs > 0) ctx.fillRect(0, wy, xs, H - wy);
        if (xe < W) ctx.fillRect(xe, wy, W - xe, H - wy);
        ctx.strokeStyle = 'rgba(232, 240, 245, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var k = 0; k < 7; k++) {
          var yy = wy + 6 + k * 9 * ui;
          var off = ((t * (12 + k * 3) + k * 37) % 60);
          for (var sx = -60 + off; sx < W; sx += 60) {
            if ((sx > 0 && sx < xs) || sx > xe) {
              ctx.moveTo(sx, yy);
              ctx.lineTo(sx + 18, yy);
            }
          }
        }
        ctx.stroke();
      }
      // Runway: the top face drawn as a thin band with its markings.
      var x0 = X(0), x1 = X(rw.end);
      var th = 7 * ui;
      ctx.fillStyle = C.asphalt;
      ctx.beginPath();
      ctx.moveTo(x0, Y(0));
      ctx.lineTo(x1, Y(0));
      ctx.lineTo(x1, Y(0) + th);
      ctx.lineTo(x0, Y(0) + th);
      ctx.closePath();
      ctx.fill();
      function mark(x, w, color, inset) {
        var a = X(x), b = X(x + w);
        if (b < -5 || a > W + 5) return;
        var ya = Y(0), yb = ya;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(a, ya + inset);
        ctx.lineTo(b, yb + inset);
        ctx.lineTo(b, yb + th - inset);
        ctx.lineTo(a, ya + th - inset);
        ctx.closePath();
        ctx.fill();
      }
      // Threshold bars, centreline dashes, aim point, touchdown zone, end bar.
      for (var i = 0; i < 4; i++) mark(2 + i * 3.2, 1.6, 'rgba(238,243,247,0.85)', 1.2 * ui);
      for (var d = 22; d < rw.end - 12; d += 18) mark(d, 9, 'rgba(238,243,247,0.42)', 3 * ui);
      mark(rw.aim - rw.length * 0.02, rw.length * 0.04, C.butter, 0.6 * ui);
      mark(rw.aim + rw.length * 0.08, rw.length * 0.015, 'rgba(238,243,247,0.6)', 1.6 * ui);
      mark(rw.aim + rw.length * 0.14, rw.length * 0.015, 'rgba(238,243,247,0.6)', 1.6 * ui);
      mark(rw.end - 2, 2, C.red, 0.4 * ui);
      // Lights: edge lights at night, end lights always.
      if (sky.night) {
        for (var e = 0; e <= rw.end; e += 20) {
          var lx = X(e);
          if (lx < -4 || lx > W + 4) continue;
          ctx.fillStyle = 'rgba(255, 244, 214, 0.95)';
          ctx.fillRect(lx - 1.2, Y(0) - 2.4, 2.4, 2.4);
        }
        // Approach lights before the threshold with the sequenced flasher.
        var seq = (t * 2.2) % 1;
        for (var a = 1; a <= 9; a++) {
          var ax = X(-a * 12);
          if (ax < -4 || ax > W + 4) continue;
          var ay = Y(airports.groundAt(ap, rw, -a * 12));
          ctx.fillStyle = 'rgba(255, 236, 190, 0.8)';
          ctx.fillRect(ax - 1.5, ay - 6 * ui, 3, 3);
          var on = Math.abs((1 - seq) * 9 - (a - 1)) < 0.6;
          if (on) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.beginPath();
            ctx.arc(ax, ay - 4.5 * ui, 4 * ui, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.fillStyle = 'rgba(110, 230, 150, 0.9)';
        ctx.fillRect(x0 - 2, Y(0) - 2.5, 3, 3);
      }
      ctx.fillStyle = 'rgba(255, 90, 80, 0.95)';
      ctx.fillRect(x1 - 1.5, Y(0) - 3, 3, 3);
      // PAPI box beside the aim point.
      var papi = sim.papi(f);
      var bx = X(rw.aim - rw.length * 0.035);
      if (bx > -20 && bx < W + 20) {
        var by = Y(0) - 7 * ui;
        ctx.fillStyle = '#20262d';
        ctx.fillRect(bx - 9 * ui, by - 3 * ui, 18 * ui, 6 * ui);
        drawPapiLights(bx, by, 2.4 * ui, papi, 5 * ui);
      }
      // Windsock at the threshold: the surface wind.
      var wsx = X(-6);
      if (wsx > -30 && wsx < W + 30) {
        wind.sample(f.air, -6, 3, f.t, sample);
        var gy = Y(airports.groundAt(ap, rw, -6));
        var pole = 22 * ui;
        ctx.strokeStyle = '#c8d0d6';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(wsx, gy);
        ctx.lineTo(wsx, gy - pole);
        ctx.stroke();
        var droop = 1 - clamp(Math.abs(sample.wx) / 10, 0, 1);
        var dir = sample.wx < 0 ? -1 : 1;
        var sl = 16 * ui;
        var ang = droop * 1.2;
        var tx = wsx + dir * Math.cos(ang) * sl, ty = gy - pole + Math.sin(ang) * sl;
        ctx.strokeStyle = '#ff8a3d';
        ctx.lineWidth = 4 * ui;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(wsx, gy - pole);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = '#f2f2f2';
        ctx.lineWidth = 4 * ui;
        ctx.beginPath();
        ctx.moveTo(lerp(wsx, tx, 0.33), lerp(gy - pole, ty, 0.33));
        ctx.lineTo(lerp(wsx, tx, 0.55), lerp(gy - pole, ty, 0.55));
        ctx.stroke();
        ctx.lineCap = 'round';
      }
    }

    function drawPapiLights(cx, cy, r, papi, gap) {
      // Two lights: 2 white = high, 1 white + 1 red = on slope, 2 red = low.
      var left = papi >= 1 ? '#f6f3ea' : C.red;
      var right = papi >= 2 ? '#f6f3ea' : C.red;
      ctx.fillStyle = left;
      ctx.beginPath();
      ctx.arc(cx - gap / 2 - r * 0.2, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = right;
      ctx.beginPath();
      ctx.arc(cx + gap / 2 + r * 0.2, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    function planeScale() {
      var id = scene.ac.id;
      return ui * (id === 'bush' ? 0.78 : id === 'turboprop' ? 0.84 : 0.9);
    }

    function drawPlane(v, t) {
      var f = scene.f;
      var gH = airports.groundAt(f.ap, f.rw, v.x);
      var hr = Math.max(0, v.h - gH);
      var px = X(v.x), py = Y(v.h - rwBase(v.x));
      var sc = planeScale();
      // Shadow: converges with the wheels near the ground.
      var sa = 0.38 * (1 - smoothstep(0, 16, hr));
      if (sa > 0.01) {
        var sw = 46 * sc * (1 - 0.35 * smoothstep(0, 16, hr));
        ctx.fillStyle = 'rgba(8, 12, 18, ' + sa + ')';
        ctx.beginPath();
        ctx.ellipse(px - 4 * sc - hr * 0.6 * sc, Y(gH - rwBase(v.x)) + 2 * ui, sw, 3.2 * ui, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      var night = scene.ap.sky.night;
      if (night && f.phase !== 'done') {
        // Landing light on the runway ahead.
        // An elliptical pool of light, drawn whole so it has no hard edges.
        var lx = px + 70 * sc, lyG = Y(gH - rwBase(v.x));
        var R = 120 * ui;
        ctx.save();
        ctx.translate(lx, lyG);
        ctx.scale(1, 0.3);
        var beam = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        beam.addColorStop(0, 'rgba(255, 246, 220, ' + (0.32 * (1 - smoothstep(4, 30, hr))) + ')');
        beam.addColorStop(1, 'rgba(255, 246, 220, 0)');
        ctx.fillStyle = beam;
        ctx.fillRect(-R, -R, 2 * R, 2 * R);
        ctx.restore();
      }
      var shx = 0, shy = 0;
      if (cam.shake > 0.05 && !reduced) {
        shx = (vr.next() * 2 - 1) * cam.shake;
        shy = (vr.next() * 2 - 1) * cam.shake;
      }
      var shaking = f.shaker && !reduced ? Math.sin(t * 90) * 0.012 : 0;
      art.drawAircraft(ctx, scene.ac.id, px, py, {
        scale: sc, pitch: (v.theta - slopeAngAt(v.x)) * 1.6 + shaking, prop: (t * 7) % 1, night: night,
        lights: true, blink: (t % 1.2) < 0.12, shakeX: shx, shakeY: shy
      });
    }

    function drawSmoke(dt) {
      for (var i = smoke.length - 1; i >= 0; i--) {
        var s = smoke[i];
        s.age += dt;
        if (s.age > s.life) { smoke.splice(i, 1); continue; }
        s.x += s.vx * dt;
        s.h += s.vh * dt;
        var k = s.age / s.life;
        var r = (s.r0 + s.grow * k) * ui;
        ctx.fillStyle = hexA(s.color, s.a * (1 - k) * (1 - k));
        ctx.beginPath();
        ctx.arc(X(s.x), Y(s.h - rwBase(s.x)), r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function puff(x, h, n, strength, color) {
      var count = reduced ? Math.ceil(n / 2) : n;
      for (var i = 0; i < count; i++) {
        smoke.push({
          x: x - vr.range(0, 2), h: h + vr.range(0, 0.2), vx: vr.range(-6, -1), vh: vr.range(0.1, 0.6),
          r0: vr.range(2, 4), grow: vr.range(8, 18) * strength, life: vr.range(0.6, 1.3) * (0.6 + strength * 0.6),
          age: 0, a: 0.55, color: color || '#e9ecef'
        });
      }
    }

    // ---- HUD ----

    function drawHud(v, hud) {
      var f = scene.f;
      var l = insets.left + 16 * ui;
      var tp = insets.top + 14 * ui;
      var gH = airports.groundAt(f.ap, f.rw, v.x);
      var hr = Math.max(0, v.h - gH);
      var slope = f.ap.slope && v.x >= 0 && v.x <= f.rw.end ? f.ap.slope : 0;
      var vs = f.phase === 'ground' ? 0 : Math.round((f.vz - f.vx * slope) * 196.85);
      var sink = Math.max(0, -vs);
      var near = hr < 8;
      var col = C.air;
      if (near && sink < 60 && f.phase === 'air') col = C.butter;
      if (near && sink >= 360 && f.phase === 'air') col = C.red;
      ctx.fillStyle = col;
      ctx.font = '600 ' + Math.round(50 * ui) + 'px ' + FONT;
      var shown = f.contact ? f.fpm : sink;
      var w = art.drawNumber(ctx, String(shown), l + 18 * ui, tp + 44 * ui, 50 * ui, { cell: 0.48 });
      // Chevron: sinking or climbing.
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.4 * ui;
      ctx.beginPath();
      var cy = tp + 26 * ui;
      if (vs <= 0) {
        ctx.moveTo(l, cy - 5 * ui); ctx.lineTo(l + 6 * ui, cy + 3 * ui); ctx.lineTo(l + 12 * ui, cy - 5 * ui);
      } else {
        ctx.moveTo(l, cy + 3 * ui); ctx.lineTo(l + 6 * ui, cy - 5 * ui); ctx.lineTo(l + 12 * ui, cy + 3 * ui);
      }
      ctx.stroke();
      ctx.font = '500 ' + Math.round(14 * ui) + 'px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillStyle = hexA(C.air, 0.7);
      ctx.fillText(hud.units.fpm, l + 22 * ui + w, tp + 44 * ui);

      // Airspeed and height above the ground.
      var kt = Math.round(f.airspeed * KT);
      ctx.font = '600 ' + Math.round(24 * ui) + 'px ' + FONT;
      ctx.fillStyle = f.shaker ? (Math.floor(v.realT * 10) % 2 ? C.red : C.air) : C.air;
      var w2 = art.drawNumber(ctx, String(kt), l, tp + 76 * ui, 24 * ui, { cell: 0.5 });
      ctx.font = '500 ' + Math.round(13 * ui) + 'px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillStyle = hexA(C.air, 0.65);
      ctx.fillText(hud.units.kt, l + w2 + 4 * ui, tp + 76 * ui);
      var ft = Math.round(hr * FT);
      ctx.font = '600 ' + Math.round(24 * ui) + 'px ' + FONT;
      ctx.fillStyle = C.air;
      var x3 = l + w2 + 34 * ui;
      var w3 = art.drawNumber(ctx, String(ft), x3, tp + 76 * ui, 24 * ui, { cell: 0.5 });
      ctx.font = '500 ' + Math.round(13 * ui) + 'px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillStyle = hexA(C.air, 0.65);
      ctx.fillText(hud.units.ft, x3 + w3 + 4 * ui, tp + 76 * ui);

      // PAPI repeated under the pause button.
      var rx = W - insets.right - 34 * ui;
      if (f.phase === 'air' && !f.contact) drawPapiLights(rx, tp + 62 * ui, 5 * ui, sim.papi(f), 9 * ui);

      // Mode line, top centre: Daily slots or the Circuits count and wind step.
      var cx = W / 2;
      if (hud.mode === 'daily') {
        for (var i = 0; i < 5; i++) {
          var sx = cx + (i - 2) * 22 * ui;
          var r = hud.results[i];
          if (r) {
            ctx.fillStyle = art.stampColor(r.stamp);
            ctx.beginPath();
            ctx.arc(sx, tp + 10 * ui, 6 * ui, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.strokeStyle = hexA(C.air, i === hud.k ? 0.95 : 0.45);
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(sx, tp + 10 * ui, 5.5 * ui, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      } else if (hud.mode === 'circuits') {
        ctx.font = '600 ' + Math.round(26 * ui) + 'px ' + FONT;
        ctx.fillStyle = C.air;
        ctx.textAlign = 'center';
        ctx.fillText(String(hud.landings), cx, tp + 22 * ui);
        // Wind step as a row of small bars.
        var steps = Math.min(12, hud.step);
        for (var s2 = 0; s2 < Math.max(steps, 1); s2++) {
          ctx.fillStyle = s2 < steps ? hexA(C.air, 0.85) : hexA(C.air, 0.25);
          ctx.fillRect(cx - (Math.max(steps, 1) * 7 * ui) / 2 + s2 * 7 * ui, tp + 32 * ui, 4.5 * ui, 3 * ui);
        }
      }
    }

    function addPop(kind, data, t) {
      pops.push({ kind: kind, data: data, t0: t });
    }

    function drawPops(rt) {
      var f = scene.f;
      for (var i = pops.length - 1; i >= 0; i--) {
        var p = pops[i];
        var age = rt - p.t0;
        if (p.kind === 'callout') {
          if (age > 0.9) { pops.splice(i, 1); continue; }
          ctx.globalAlpha = 1 - age / 0.9;
          ctx.fillStyle = C.air;
          ctx.font = '600 ' + Math.round(18 * ui) + 'px ' + FONT;
          ctx.textAlign = 'center';
          var pv = p.data;
          ctx.fillText(String(pv.ft), X(pv.x) - 74 * ui, Y(pv.h - rwBase(pv.x)) + 24 * ui - age * 14 * ui);
          ctx.globalAlpha = 1;
        } else if (p.kind === 'stamp') {
          var keep = p.data.hold || 2.2;
          if (age > keep && !p.data.sticky) { pops.splice(i, 1); continue; }
          var a = p.data.sticky ? 1 : 1 - smoothstep(keep - 0.35, keep, age);
          var cx = W / 2, cy = insets.top + H * 0.3;
          var r = 58 * ui;
          var k = reduced ? 1 : clamp(age / 0.24, 0, 1);
          var scale = reduced ? 1 : lerp(1.9, 1, easeOutBack(k));
          if (p.data.stamp) {
            ctx.globalAlpha = a * (reduced ? 1 : clamp(age / 0.08, 0, 1));
            art.drawStamp(ctx, p.data.stamp, cx, cy, r * scale, { rotate: -0.14, fill: 'rgba(12, 22, 38, 0.38)' });
            ctx.globalAlpha = 1;
          }
          ctx.globalAlpha = a;
          ctx.fillStyle = p.data.stamp ? art.stampColor(p.data.stamp) : C.air;
          ctx.font = '600 ' + Math.round(56 * ui) + 'px ' + FONT;
          art.drawNumber(ctx, String(p.data.fpm), cx, cy + r + 52 * ui, 56 * ui, { align: 'center', cell: 0.48 });
          ctx.font = '500 ' + Math.round(15 * ui) + 'px ' + FONT;
          ctx.textAlign = 'center';
          ctx.fillStyle = hexA(C.air, 0.7);
          ctx.fillText(p.data.unit || 'fpm', cx, cy + r + 72 * ui);
          if (p.data.score != null && p.data.stamp && (p.data.stamp === 'butter' || p.data.stamp === 'firm')) {
            ctx.font = '600 ' + Math.round(22 * ui) + 'px ' + FONT;
            ctx.fillStyle = C.air;
            ctx.fillText('+' + p.data.score, cx, cy + r + 102 * ui);
          }
          ctx.globalAlpha = 1;
        }
      }
    }

    function drawGhostThumb(g, rt) {
      if (!g) return;
      var x = W / 2, y = Math.min(H - insets.bottom - 70 * ui, groundLine() + (H - groundLine()) * 0.55);
      art.drawThumb(ctx, x, y, 26 * ui, g.press, rt);
      if (g.brake) {
        // Brake glyph: two arcs around a disc.
        ctx.strokeStyle = C.air;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 54 * ui, y, 9 * ui, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + 54 * ui, y, 15 * ui, -0.9, 0.9);
        ctx.moveTo(x + 54 * ui - 15 * ui * Math.cos(0.9), y - 15 * ui * Math.sin(0.9));
        ctx.arc(x + 54 * ui, y, 15 * ui, Math.PI - 0.9, Math.PI + 0.9);
        ctx.stroke();
      } else if (g.nose) {
        // Nose up arc arrow next to the thumb.
        ctx.strokeStyle = C.air;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 50 * ui, y + 6 * ui, 14 * ui, Math.PI * 1.05, Math.PI * 1.7);
        ctx.stroke();
        var ex = x + 50 * ui + Math.cos(Math.PI * 1.7) * 14 * ui, ey = y + 6 * ui + Math.sin(Math.PI * 1.7) * 14 * ui;
        ctx.beginPath();
        ctx.moveTo(ex - 6 * ui, ey - 1 * ui);
        ctx.lineTo(ex, ey);
        ctx.lineTo(ex - 2 * ui, ey + 6 * ui);
        ctx.stroke();
      }
    }

    /**
     * One frame. v: {f, x, h, theta (interpolated), t (sim time), realT, dt (sim dt for the air),
     * rdt (real dt), hud (null for the attract scene), ghost, flash}.
     */
    function draw(v) {
      if (!scene) return;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      updateCamera(v, v.rdt);
      drawSky();
      drawHills();
      ctx.save();
      slopeTilt();
      drawAir(v, v.dt, v.t);
      drawButterLine(v);
      drawGround(v.realT);
      drawSmoke(v.dt);
      drawPlane(v, v.realT);
      ctx.restore();
      if (v.hud) drawHud(v, v.hud);
      drawPops(v.realT);
      drawGhostThumb(v.ghost, v.realT);
      if (v.flash > 0) {
        ctx.fillStyle = 'rgba(243, 210, 122, ' + (0.18 * v.flash) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      if (v.dim > 0) {
        ctx.fillStyle = 'rgba(8, 14, 24, ' + v.dim + ')';
        ctx.fillRect(0, 0, W, H);
      }
    }

    return {
      resize: resize,
      setInsets: setInsets,
      setReduced: setReduced,
      setScene: setScene,
      draw: draw,
      puff: puff,
      addPop: addPop,
      clearPops: function () { pops.length = 0; },
      dip: function (amount) { if (!reduced) cam.dip = amount; },
      shake: function (px) { if (!reduced) cam.shake = px * ui; },
      get ui() { return ui; },
      get font() { return FONT; }
    };
  }

  BL.render = { create: create, FONT: FONT };
})(typeof self !== 'undefined' ? self : this);
