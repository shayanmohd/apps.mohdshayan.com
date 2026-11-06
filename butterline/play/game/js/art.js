/*
 * Vector art drawn on a 2D canvas: the three generic aircraft in side view, the wordless grading stamps,
 * small HUD glyphs. No images, no fonts needed except the bundled one for numbers.
 */
(function (root) {
  'use strict';

  var C = {
    ink: '#0c1626', sky: '#17304e', haze: '#d5dee6', air: '#eef3f7', butter: '#f3d27a', red: '#e5544b',
    asphalt: '#343a41', hull: '#e4e9ee', hullShade: '#aeb9c3', glass: '#22374f', metal: '#7d8a96'
  };

  var STAMP_COLOR = {
    butter: C.butter, firm: C.air, hard: C.red, bounce: C.red, stall: C.red, short: C.red, overrun: C.red, missed: '#93a1ae'
  };

  // Each aircraft in a frame of 100 units long, x forward (to the right), y down, origin at the main
  // wheel's contact patch. len: drawn length in px per unit scale.
  var SHAPES = {
    bush: {
      len: 1,
      body: [[-52, -18], [-47, -19], [-40, -21], [-8, -27], [4, -30], [18, -24], [34, -21], [44, -19], [47, -16], [46, -12], [36, -9], [12, -8], [-10, -10], [-36, -14], [-52, -16]],
      wing: { x: -10, y: -31, chord: 26, thick: 3.2 },
      strut: [[-2, -29], [2, -10]],
      fin: [[-52, -18], [-58, -38], [-49, -38], [-38, -21]],
      stab: { x: -58, y: -18, chord: 15, thick: 2 },
      windows: [[-4, -26], [14, -24], [16, -18], [-4, -18]],
      gearMain: { x: 2, top: -9, r: 4.4 },
      gearNose: { x: 34, top: -9, r: 3.4 },
      prop: { x: 48, y: -15, h: 22 },
      cheat: [[-48, -16], [44, -13]]
    },
    turboprop: {
      len: 1,
      body: [[-56, -20], [-50, -21], [-36, -25], [-6, -27], [26, -27], [38, -25], [46, -21], [51, -16], [50, -12], [40, -9], [0, -8], [-30, -11], [-50, -15], [-56, -18]],
      wing: { x: -6, y: -30, chord: 24, thick: 3.4 },
      nacelle: [[-2, -30], [16, -30], [22, -26], [16, -21], [0, -22]],
      fin: [[-50, -21], [-60, -48], [-50, -48], [-34, -25]],
      stab: { x: -62, y: -48, chord: 14, thick: 2 },
      windowRow: { x0: -30, x1: 32, y: -21, n: 8 },
      cockpit: [[36, -25], [44, -22], [43, -20], [35, -21]],
      gearMain: { x: 2, top: -9, r: 4.6 },
      gearNose: { x: 40, top: -10, r: 3.4 },
      prop: { x: 23, y: -26, h: 20 },
      cheat: [[-50, -16], [48, -14]]
    },
    jet: {
      len: 1,
      body: [[-58, -20], [-50, -22], [-36, -26], [20, -26], [36, -25], [46, -22], [53, -17], [52, -13], [42, -9], [0, -8], [-30, -10], [-50, -14], [-58, -17]],
      wing: { x: -10, y: -11, chord: 30, thick: 3.2 },
      nacelle: [[2, -12], [22, -12], [25, -8], [22, -4], [2, -4], [0, -8]],
      fin: [[-50, -22], [-62, -50], [-53, -50], [-36, -26]],
      stab: { x: -60, y: -21, chord: 14, thick: 2 },
      windowRow: { x0: -36, x1: 34, y: -20, n: 12 },
      cockpit: [[38, -24], [47, -20], [46, -18], [37, -19]],
      gearMain: { x: 2, top: -8, r: 4.2 },
      gearNose: { x: 42, top: -9, r: 3.2 },
      cheat: [[-52, -15], [50, -13]]
    }
  };

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function airfoil(ctx, x, y, chord, thick) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + chord * 0.3, y - thick, x + chord, y - thick * 0.15);
    ctx.quadraticCurveTo(x + chord * 0.4, y + thick * 0.55, x, y);
    ctx.closePath();
  }

  /**
   * opts: scale (px per unit), pitch (radians, nose up positive), gear (0 up, 1 down), prop (0..1 blur
   * phase), night (bool), lights (bool), shake (px), alpha.
   */
  function drawAircraft(ctx, id, x, y, opts) {
    var s = SHAPES[id] || SHAPES.bush;
    var sc = opts.scale || 0.7;
    ctx.save();
    ctx.translate(x + (opts.shakeX || 0), y + (opts.shakeY || 0));
    ctx.rotate(-(opts.pitch || 0));
    ctx.scale(sc, sc);
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    var night = !!opts.night;
    var hull = night ? '#9fadbb' : C.hull;
    var shade = night ? '#5f6d7b' : C.hullShade;

    // Gear first, behind the body.
    ctx.strokeStyle = night ? '#4b5662' : C.metal;
    ctx.lineWidth = 1.8;
    var gm = s.gearMain, gn = s.gearNose;
    ctx.beginPath();
    ctx.moveTo(gm.x, gm.top);
    ctx.lineTo(gm.x, -gm.r);
    ctx.moveTo(gn.x, gn.top);
    ctx.lineTo(gn.x, -gn.r);
    ctx.stroke();
    ctx.fillStyle = '#1b2129';
    ctx.beginPath();
    ctx.arc(gm.x, -gm.r, gm.r, 0, Math.PI * 2);
    ctx.arc(gn.x, -gn.r, gn.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#58626d';
    ctx.beginPath();
    ctx.arc(gm.x, -gm.r, gm.r * 0.42, 0, Math.PI * 2);
    ctx.arc(gn.x, -gn.r, gn.r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // Tail.
    ctx.fillStyle = shade;
    poly(ctx, s.fin);
    ctx.fill();
    airfoil(ctx, s.stab.x, s.stab.y, s.stab.chord, s.stab.thick);
    ctx.fill();

    // Body with a soft belly shade.
    var g = ctx.createLinearGradient(0, -30, 0, -8);
    g.addColorStop(0, hull);
    g.addColorStop(0.62, hull);
    g.addColorStop(1, shade);
    ctx.fillStyle = g;
    poly(ctx, s.body);
    ctx.fill();

    // The one accent: a thin butter cheatline.
    ctx.strokeStyle = C.butter;
    ctx.globalAlpha = (opts.alpha != null ? opts.alpha : 1) * 0.9;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(s.cheat[0][0], s.cheat[0][1]);
    ctx.lineTo(s.cheat[1][0], s.cheat[1][1]);
    ctx.stroke();
    ctx.globalAlpha = opts.alpha != null ? opts.alpha : 1;

    ctx.fillStyle = night ? '#33485f' : C.glass;
    if (s.windows) { poly(ctx, s.windows); ctx.fill(); }
    if (s.cockpit) { poly(ctx, s.cockpit); ctx.fill(); }
    if (s.windowRow) {
      var wr = s.windowRow;
      var step = (wr.x1 - wr.x0) / (wr.n - 1);
      for (var i = 0; i < wr.n; i++) {
        ctx.beginPath();
        ctx.arc(wr.x0 + i * step, wr.y, 1.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Wing (side view shows its section), strut, nacelle.
    ctx.fillStyle = shade;
    if (s.strut) {
      ctx.strokeStyle = shade;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(s.strut[0][0], s.strut[0][1]);
      ctx.lineTo(s.strut[1][0], s.strut[1][1]);
      ctx.stroke();
    }
    ctx.fillStyle = hull;
    airfoil(ctx, s.wing.x, s.wing.y, s.wing.chord, s.wing.thick);
    ctx.fill();
    ctx.strokeStyle = shade;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (s.nacelle) {
      ctx.fillStyle = id === 'jet' ? '#c9d1d8' : hull;
      poly(ctx, s.nacelle);
      ctx.fill();
      ctx.strokeStyle = shade;
      ctx.stroke();
    }

    // Propeller disc: a faint blur, never a cartoon spinner.
    if (s.prop) {
      ctx.fillStyle = 'rgba(30, 38, 48, 0.16)';
      ctx.beginPath();
      ctx.ellipse(s.prop.x, s.prop.y, 1.6, s.prop.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      var ph = opts.prop || 0;
      ctx.strokeStyle = 'rgba(30, 38, 48, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      var yb = s.prop.y + Math.sin(ph * Math.PI * 2) * s.prop.h * 0.48;
      ctx.moveTo(s.prop.x, s.prop.y);
      ctx.lineTo(s.prop.x, yb);
      ctx.stroke();
    }

    if (opts.lights) {
      var blink = opts.blink ? 1 : 0.25;
      ctx.fillStyle = 'rgba(255, 80, 70, ' + (0.6 + 0.4 * blink) + ')';
      ctx.beginPath();
      ctx.arc(s.fin[1][0] + 2, s.fin[1][1] + 1, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function stampColor(kind) {
    return STAMP_COLOR[kind] || C.air;
  }

  /** The wordless grading stamp: two rings and a glyph of what happened. */
  function drawStamp(ctx, kind, cx, cy, r, opts) {
    opts = opts || {};
    var col = opts.color || stampColor(kind);
    ctx.save();
    ctx.translate(cx, cy);
    if (opts.rotate) ctx.rotate(opts.rotate);
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.fill) {
      ctx.fillStyle = opts.fill;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.5, r * 0.075);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    var u = r / 10;
    var gy = 2.6 * u;
    ctx.lineWidth = Math.max(1.4, r * 0.07);
    function ground(x0, x1) {
      ctx.beginPath();
      ctx.moveTo(x0 * u, gy);
      ctx.lineTo(x1 * u, gy);
      ctx.stroke();
    }
    ctx.beginPath();
    switch (kind) {
      case 'butter':
        ground(-5.5, 5.5);
        ctx.beginPath();
        ctx.moveTo(-5.2 * u, -3.8 * u);
        ctx.bezierCurveTo(-2.5 * u, 0.6 * u, -0.5 * u, gy, 2.4 * u, gy);
        ctx.stroke();
        ctx.lineWidth = Math.max(1, r * 0.045);
        ctx.beginPath();
        ctx.moveTo(2.4 * u, gy - 1.6 * u); ctx.lineTo(2.4 * u, gy - 3.0 * u);
        ctx.moveTo(3.6 * u, gy - 1.2 * u); ctx.lineTo(4.6 * u, gy - 2.2 * u);
        ctx.moveTo(1.2 * u, gy - 1.2 * u); ctx.lineTo(0.2 * u, gy - 2.2 * u);
        ctx.stroke();
        break;
      case 'firm':
        ground(-5.5, 5.5);
        ctx.beginPath();
        ctx.moveTo(-5 * u, -4.2 * u);
        ctx.quadraticCurveTo(-1 * u, -0.6 * u, 1.2 * u, gy);
        ctx.lineTo(4.8 * u, gy);
        ctx.stroke();
        break;
      case 'hard':
        ground(-5.5, 5.5);
        ctx.beginPath();
        ctx.moveTo(-3.6 * u, -5 * u);
        ctx.lineTo(0.6 * u, gy);
        ctx.stroke();
        ctx.lineWidth = Math.max(1, r * 0.05);
        ctx.beginPath();
        ctx.moveTo(2.0 * u, gy - 1.4 * u); ctx.lineTo(3.6 * u, gy - 3.4 * u);
        ctx.moveTo(-0.8 * u, gy - 1.6 * u); ctx.lineTo(-1.6 * u, gy - 3.6 * u);
        ctx.moveTo(2.4 * u, gy + 0.2 * u); ctx.lineTo(4.4 * u, gy - 0.8 * u);
        ctx.stroke();
        break;
      case 'bounce':
        ground(-5.5, 5.5);
        ctx.beginPath();
        ctx.moveTo(-5.4 * u, -3.4 * u);
        ctx.quadraticCurveTo(-3.6 * u, gy, -2.6 * u, gy);
        ctx.quadraticCurveTo(-0.6 * u, -3.8 * u, 1.6 * u, gy);
        ctx.quadraticCurveTo(3 * u, -0.8 * u, 4.6 * u, gy);
        ctx.stroke();
        break;
      case 'stall':
        ctx.save();
        ctx.rotate(-0.5);
        ctx.beginPath();
        ctx.moveTo(-4.6 * u, -0.6 * u);
        ctx.quadraticCurveTo(-1 * u, -2.6 * u, 4.6 * u, -0.6 * u);
        ctx.quadraticCurveTo(0, 0.6 * u, -4.6 * u, -0.6 * u);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(0, 0.6 * u);
        ctx.lineTo(0, 5 * u);
        ctx.moveTo(-1.6 * u, 3.4 * u);
        ctx.lineTo(0, 5 * u);
        ctx.lineTo(1.6 * u, 3.4 * u);
        ctx.stroke();
        break;
      case 'short':
        ground(-5.5, 5.5);
        ctx.beginPath();
        ctx.moveTo(1.6 * u, gy - 2.6 * u);
        ctx.lineTo(1.6 * u, gy + 0.01);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-5 * u, -4 * u);
        ctx.quadraticCurveTo(-2.2 * u, -0.4 * u, -1.4 * u, gy);
        ctx.stroke();
        break;
      case 'overrun':
        ground(-5.5, 1.4);
        ctx.beginPath();
        ctx.moveTo(1.4 * u, gy - 2.8 * u);
        ctx.lineTo(1.4 * u, gy + 0.01);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-4.4 * u, gy - 1.4 * u);
        ctx.lineTo(4.6 * u, gy - 1.4 * u);
        ctx.moveTo(3.0 * u, gy - 2.9 * u);
        ctx.lineTo(4.6 * u, gy - 1.4 * u);
        ctx.lineTo(3.0 * u, gy + 0.1 * u);
        ctx.stroke();
        break;
      default:
        ctx.beginPath();
        ctx.moveTo(-3.4 * u, -3.4 * u); ctx.lineTo(3.4 * u, 3.4 * u);
        ctx.moveTo(3.4 * u, -3.4 * u); ctx.lineTo(-3.4 * u, 3.4 * u);
        ctx.stroke();
    }
    ctx.restore();
  }

  /** Numbers in fixed cells so they never jitter while they change. */
  function drawNumber(ctx, text, x, y, size, opts) {
    opts = opts || {};
    text = String(text);
    var cell = size * (opts.cell || 0.5);
    var w = 0;
    for (var i = 0; i < text.length; i++) w += /[0-9]/.test(text[i]) ? cell : cell * 0.6;
    var cx = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x;
    ctx.textAlign = 'center';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    for (i = 0; i < text.length; i++) {
      var cw = /[0-9]/.test(text[i]) ? cell : cell * 0.6;
      ctx.fillText(text[i], cx + cw / 2, y);
      cx += cw;
    }
    return w;
  }

  /** A thumb pad for the first approach: pressed shows a filled ring, released an open one. */
  function drawThumb(ctx, x, y, r, pressed, t) {
    ctx.save();
    var pulse = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = C.air;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * (pressed ? 0.9 : 1.15 + 0.15 * pulse), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = pressed ? 0.42 + 0.2 * pulse : 0.14;
    ctx.fillStyle = C.air;
    ctx.beginPath();
    ctx.ellipse(x, y + (pressed ? 0 : -r * 0.5), r * 0.62, r * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  (root.BL = root.BL || {}).art = {
    C: C,
    SHAPES: SHAPES,
    stampColor: stampColor,
    drawAircraft: drawAircraft,
    drawStamp: drawStamp,
    drawNumber: drawNumber,
    drawThumb: drawThumb
  };
})(typeof self !== 'undefined' ? self : this);
