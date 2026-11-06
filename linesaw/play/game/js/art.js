/*
 * Drawing: the tailless fighter kite and its paper patterns, the spool on each roof, the rooftop skyline
 * (flat roofs, water tanks, stair huts, parapets and antennas as silhouettes; no flags, signs or named
 * places), the sun and the dusk sky. Everything is vector, drawn on the canvas; no images.
 */
(function (root) {
  'use strict';
  var rng = root.LS.rng;

  var C = {
    night: '#0e1424',
    dusk: '#1f2b4a',
    haze: '#5a3a52',
    ember: '#e48a3c',
    roof: '#0b0f1a',
    roofFar: '#151b2e',
    cotton: '#efe6d2',
    ink: '#1a1424',
    marigold: '#f5b335',
    jade: '#37c4a4',
    vermilion: '#e5484d',
    window: '#ffc46b'
  };

  // Rival papers rotate through these so consecutive rivals differ a little; all read as "not you".
  var RIVALS = ['#e5484d', '#d9604a', '#c9476f'];

  // Sky colour stops at the start of a sky (dusk) and at sunset (blue night).
  var SKY_A = [[0, '#182746'], [0.48, '#2c3a62'], [0.8, '#6e4a63'], [1, '#e48a3c']];
  var SKY_B = [[0, '#0a0f1e'], [0.48, '#151e38'], [0.8, '#2f2742'], [1, '#7a4436']];

  function hex(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mixHex(a, b, t) {
    var x = hex(a), y = hex(b);
    var out = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(x[i] + (y[i] - x[i]) * t).toString(16);
      out += v.length < 2 ? '0' + v : v;
    }
    return out;
  }
  function mix(a, b, t) {
    return mixHex(a, b, t);
  }
  function rgba(h, a) {
    var x = hex(h);
    return 'rgba(' + x[0] + ',' + x[1] + ',' + x[2] + ',' + a + ')';
  }

  /** Fills the sky between y0 (top) and y1 (the roofline) for sunset progress p (0 to 1). */
  function sky(ctx, w, y0, y1, h, p, warm) {
    var g = ctx.createLinearGradient(0, y0, 0, y1);
    for (var i = 0; i < SKY_A.length; i++) {
      var c = mixHex(SKY_A[i][1], SKY_B[i][1], Math.min(1, p));
      if (warm && i >= 2) c = mixHex(c, '#f0a050', 0.18);
      g.addColorStop(SKY_A[i][0], c);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** The sun: a disc with a soft glow, centre (x, y), radius r. */
  function sun(ctx, x, y, r, p) {
    var glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 5);
    glow.addColorStop(0, 'rgba(255, 170, 90, ' + (0.42 - 0.25 * p) + ')');
    glow.addColorStop(1, 'rgba(255, 140, 70, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 5, 0, Math.PI * 2);
    ctx.fill();
    var disc = ctx.createLinearGradient(0, y - r, 0, y + r);
    disc.addColorStop(0, mix('#ffd27a', '#ff9a52', p));
    disc.addColorStop(1, mix('#f39a45', '#e0603a', p));
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * A kite at screen (x, y), heading th (0 up, clockwise), size s (px from the bridle to the nose).
   * opts: color, pattern (0 moon, 1 split, 2 band), alpha.
   */
  function kite(ctx, x, y, th, s, opts) {
    opts = opts || {};
    var color = opts.color || C.marigold;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(th);
    ctx.scale(s, s);
    if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
    // paper
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(0.66, -0.12);
    ctx.lineTo(0, 0.78);
    ctx.lineTo(-0.66, -0.12);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(26, 20, 36, 0.86)';
    var pat = opts.pattern | 0;
    if (pat === 0) {
      ctx.beginPath();
      ctx.arc(0, -0.4, 0.21, 0, Math.PI * 2);
      ctx.fill();
    } else if (pat === 1) {
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.lineTo(-0.7, -0.12);
      ctx.lineTo(0, 0.8);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-0.75, -0.62);
      ctx.lineTo(-0.48, -0.86);
      ctx.lineTo(0.75, 0.32);
      ctx.lineTo(0.48, 0.56);
      ctx.closePath();
      ctx.fill();
    }
    // the light side of the paper
    ctx.fillStyle = 'rgba(255, 248, 230, 0.12)';
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(0.7, -0.12);
    ctx.lineTo(0, 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // edge, spine and bowed spar
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(20, 14, 26, 0.9)';
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(0.66, -0.12);
    ctx.lineTo(0, 0.78);
    ctx.lineTo(-0.66, -0.12);
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 0.075;
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(0, 0.78);
    ctx.moveTo(-0.66, -0.12);
    ctx.quadraticCurveTo(0, -0.62, 0.66, -0.12);
    ctx.stroke();
    // the small tab at the tail
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0.74);
    ctx.lineTo(-0.17, 0.98);
    ctx.lineTo(0.17, 0.98);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** The spool on a roof, at screen (x, y) (the hand point on the roofline), size s px. */
  function spool(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#2a2230';
    ctx.fillRect(-s * 0.08, -s * 0.55, s * 0.16, s * 0.55);
    ctx.fillStyle = '#4a3a3a';
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.7, s * 0.55, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.globalAlpha *= 0.85;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.7, s * 0.4, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * The skyline below and around the roofline, pre-rendered once per size and sky. Returns
   * {far, near, lit}: canvases the size of the screen (in device px, scale d). hands: screen x of the two
   * rooftops whose roof sits exactly on the roofline.
   */
  function skyline(width, height, roofY, d, seed, hands) {
    var r = rng.make(seed >>> 0 || 7);
    function layer() {
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(width * d));
      c.height = Math.max(1, Math.round(height * d));
      var x = c.getContext('2d');
      x.scale(d, d);
      return { c: c, x: x };
    }
    var far = layer(), near = layer(), lit = layer();
    var unit = Math.max(3, Math.min(width / 90, 6));

    // far layer: taller, lighter blocks with tanks
    var x = -r.range(0, 30);
    far.x.fillStyle = C.roofFar;
    while (x < width) {
      var bw = unit * r.range(9, 20);
      var top = roofY - unit * r.range(2, 13);
      far.x.fillRect(x, top, bw, height - top);
      if (r.chance(0.5)) far.x.fillRect(x + bw * r.range(0.2, 0.6), top - unit * 2.4, unit * 3, unit * 2.4);
      if (r.chance(0.3)) far.x.fillRect(x + bw * 0.7, top - unit * 5, unit * 0.25, unit * 5);
      x += bw + unit * r.range(0, 3);
    }

    // near layer: the roofs we fly from, flat, with parapets, tanks, stair huts and antennas
    x = -r.range(0, 20);
    var blocks = [];
    while (x < width) {
      var w = unit * r.range(12, 22);
      var cx = x + w / 2;
      var onHand = hands.some(function (hx) { return hx >= x - unit && hx <= x + w + unit; });
      var t = onHand ? roofY : roofY + unit * r.range(-3, 6);
      blocks.push({ x: x, w: w, top: t, hand: onHand });
      x += w + (r.chance(0.3) ? unit * r.range(1, 3) : 0);
    }
    // make sure each hand stands on a roof at the roofline
    hands.forEach(function (hx) {
      var on = blocks.some(function (b) { return hx >= b.x && hx <= b.x + b.w && b.top === roofY; });
      if (!on) blocks.push({ x: hx - unit * 8, w: unit * 16, top: roofY, hand: true });
    });
    var g = near.x;
    blocks.forEach(function (b) {
      g.fillStyle = C.roof;
      g.fillRect(b.x, b.top, b.w, height - b.top);
      // parapet
      g.fillRect(b.x - unit * 0.3, b.top - unit * 0.9, b.w + unit * 0.6, unit * 0.9);
      if (!b.hand) {
        if (r.chance(0.55)) {
          // water tank on legs
          var tx = b.x + b.w * r.range(0.15, 0.7);
          g.fillRect(tx, b.top - unit * 4.2, unit * 3.4, unit * 2.6);
          g.fillRect(tx + unit * 0.3, b.top - unit * 1.8, unit * 0.3, unit * 1.8);
          g.fillRect(tx + unit * 2.8, b.top - unit * 1.8, unit * 0.3, unit * 1.8);
        }
        if (r.chance(0.45)) {
          // stair hut
          var sx = b.x + b.w * r.range(0.05, 0.55);
          g.fillRect(sx, b.top - unit * 3.6, unit * 4.6, unit * 3.6);
        }
        if (r.chance(0.35)) {
          var ax = b.x + b.w * r.range(0.2, 0.9);
          g.fillRect(ax, b.top - unit * 7, unit * 0.22, unit * 7);
          g.fillRect(ax - unit * 1.2, b.top - unit * 6, unit * 2.6, unit * 0.22);
        }
      } else {
        // the fliers' roofs keep clear above the spool; a low railing only
        g.fillRect(b.x + unit, b.top - unit * 1.6, unit * 0.2, unit * 0.8);
        g.fillRect(b.x + b.w - unit * 1.2, b.top - unit * 1.6, unit * 0.2, unit * 0.8);
      }
      // windows, some lit
      var cols = Math.max(2, Math.floor(b.w / (unit * 3.2)));
      var rows = Math.floor((height - b.top - unit * 2) / (unit * 4));
      for (var i = 0; i < cols; i++) {
        for (var j = 0; j < rows; j++) {
          if (!r.chance(0.4)) continue;
          var wx = b.x + unit * 1.2 + i * (b.w - unit * 2.4) / Math.max(1, cols - 1) - unit * 0.6;
          var wy = b.top + unit * 2.5 + j * unit * 4;
          lit.x.fillStyle = r.chance(0.8) ? 'rgba(255, 196, 107, 0.85)' : 'rgba(255, 228, 170, 0.75)';
          lit.x.fillRect(wx, wy, unit * 1.2, unit * 1.6);
        }
      }
    });
    return { far: far.c, near: near.c, lit: lit.c, unit: unit };
  }

  /** A strand-fraying icon: three strands, broken ones drawn split. wear 0 to 1. */
  function fray(ctx, x, y, s, wear, color, angle) {
    var broken = Math.min(3, Math.floor(wear * 3.0001));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle || 0);
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, s * 0.16);
    for (var i = 0; i < 3; i++) {
      var yy = (i - 1) * s * 0.38;
      var isBroken = i >= 3 - broken;
      ctx.strokeStyle = isBroken ? 'rgba(255, 120, 80, 0.95)' : color;
      ctx.beginPath();
      if (isBroken) {
        ctx.moveTo(-s, yy);
        ctx.lineTo(-s * 0.25, yy + s * 0.12);
        ctx.moveTo(s * 0.25, yy - s * 0.12);
        ctx.lineTo(s, yy);
      } else {
        ctx.moveTo(-s, yy);
        ctx.lineTo(s, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  root.LS.art = {
    C: C, RIVALS: RIVALS, mix: mix, rgba: rgba,
    sky: sky, sun: sun, kite: kite, spool: spool, skyline: skyline, fray: fray
  };
})(typeof self !== 'undefined' ? self : this);
