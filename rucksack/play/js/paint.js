/* Rucksack: the painted parts. Camp vignettes, the wanderer, gear and keepsakes.
   Every camp is composed from its region's kit, the day's weather and a seed
   taken from the date and the kilometre, so a given camp always looks the same. */
var Paint = (function () {
  'use strict';

  /* Reads '#rrggbb', '#rgb' and the 'rgb(r,g,b)' strings this module makes
     itself. mix() feeds its own output back in constantly, and a parser that
     only understood hex turned every derived colour into flat blue. */
  function hex(h) {
    h = String(h).trim();
    if (h.charAt(0) === '#') {
      h = h.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    var m = h.match(/-?\d*\.?\d+/g);
    if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
    return [0, 0, 0];
  }
  function clamp255(n) { return n < 0 ? 0 : n > 255 ? 255 : Math.round(n); }
  function rgb(a) { return 'rgb(' + clamp255(a[0]) + ',' + clamp255(a[1]) + ',' + clamp255(a[2]) + ')'; }
  function mix(a, b, t) {
    var x = hex(a), y = hex(b);
    return rgb([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
  }
  function rnd(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  /* Dusk skies. Three stops each: high, middle, horizon. */
  var SKY = {
    clear:     ['#2B3A55', '#8A6E78', '#E3AE72'],
    highcloud: ['#3A4459', '#8C7E82', '#D8A784'],
    drizzle:   ['#454C51', '#767A76', '#A8A288'],
    rain:      ['#3B4348', '#666C69', '#96947E'],
    downpour:  ['#31383D', '#545B5A', '#7C7E70'],
    wind:      ['#2E3E56', '#7E717D', '#DDA97C'],
    mist:      ['#4E545A', '#8D9088', '#BCB79F'],
    frost:     ['#2C3752', '#6C7488', '#C6B8AE'],
    snow:      ['#414B59', '#79808A', '#B3B1A6'],
    haze:      ['#3E4453', '#93777A', '#E6BE87'],
    thunder:   ['#262C36', '#4A4F55', '#8E8874']
  };
  var FIRELIGHT = '#FFB061';

  function skyFor(w) { return SKY[w.id] || SKY.clear; }

  /* ---------------------------------------------------------------- shapes */
  function ridge(c, w, y, amp, rough, R, fill, steps) {
    steps = steps || 26;
    c.beginPath();
    c.moveTo(0, y);
    var prev = y;
    for (var i = 0; i <= steps; i++) {
      var x = (i / steps) * w;
      var t = i / steps;
      var h = y - Math.sin(t * 3.1 + R.seedPhase) * amp * 0.6 - (R() - 0.5) * amp * rough;
      h = prev * 0.45 + h * 0.55;
      c.lineTo(x, h);
      prev = h;
    }
    c.lineTo(w, y + 400); c.lineTo(0, y + 400); c.closePath();
    c.fillStyle = fill; c.fill();
  }

  function conifer(c, x, y, h, fill) {
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(x, y - h);
    c.lineTo(x + h * 0.26, y);
    c.lineTo(x - h * 0.26, y);
    c.closePath(); c.fill();
  }
  function broadleaf(c, x, y, h, fill) {
    c.fillStyle = fill;
    c.beginPath(); c.ellipse(x, y - h * 0.72, h * 0.36, h * 0.42, 0, 0, 6.2832); c.fill();
    c.fillRect(x - h * 0.045, y - h * 0.8, h * 0.09, h * 0.8);
  }
  function tower(c, x, y, h, fill) {
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(x - h * 0.11, y); c.lineTo(x - h * 0.085, y - h * 0.86);
    c.lineTo(x - h * 0.13, y - h * 0.86); c.lineTo(x - h * 0.13, y - h * 0.94);
    c.lineTo(x, y - h);
    c.lineTo(x + h * 0.13, y - h * 0.94); c.lineTo(x + h * 0.13, y - h * 0.86);
    c.lineTo(x + h * 0.085, y - h * 0.86); c.lineTo(x + h * 0.11, y);
    c.closePath(); c.fill();
  }
  function windmill(c, x, y, h, fill) {
    c.fillStyle = fill; c.strokeStyle = fill; c.lineWidth = Math.max(1, h * 0.05);
    c.beginPath();
    c.moveTo(x - h * 0.2, y); c.lineTo(x - h * 0.11, y - h * 0.72);
    c.lineTo(x + h * 0.11, y - h * 0.72); c.lineTo(x + h * 0.2, y);
    c.closePath(); c.fill();
    var a = 0.5;
    for (var i = 0; i < 4; i++) {
      var ang = a + i * 1.5708;
      c.beginPath(); c.moveTo(x, y - h * 0.78);
      c.lineTo(x + Math.cos(ang) * h * 0.5, y - h * 0.78 + Math.sin(ang) * h * 0.5);
      c.stroke();
    }
  }
  function peaks(c, w, y, h, fill, R, n) {
    c.fillStyle = fill;
    c.beginPath(); c.moveTo(-10, y);
    var x = -10;
    for (var i = 0; i < n; i++) {
      var pw = w / n * (0.7 + R() * 0.7);
      var ph = h * (0.45 + R() * 0.75);
      c.lineTo(x + pw * 0.5, y - ph);
      x += pw;
      c.lineTo(x, y - ph * (0.15 + R() * 0.3));
    }
    c.lineTo(w + 20, y); c.lineTo(w + 20, y + 300); c.lineTo(-10, y + 300);
    c.closePath(); c.fill();
  }

  /* -------------------------------------------------------- camp vignettes */
  function far(c, w, h, terrain, R, col, horizon) {
    var i, x;
    switch (terrain) {
      case 'reed':
        ridge(c, w, horizon, 8, 0.5, R, col);
        for (i = 0; i < 3; i++) windmill(c, w * (0.14 + i * 0.32 + R() * 0.06), horizon + 1, h * 0.13, col);
        break;
      case 'wood':
        for (i = 0; i < 46; i++) {
          x = R() * w;
          if (R() < 0.55) conifer(c, x, horizon + 2, h * (0.08 + R() * 0.10), col);
          else broadleaf(c, x, horizon + 2, h * (0.07 + R() * 0.08), col);
        }
        break;
      case 'salt':
        ridge(c, w, horizon, 4, 0.3, R, col);
        break;
      case 'downs':
        ridge(c, w, horizon + h * 0.03, h * 0.10, 0.5, R, col);
        ridge(c, w, horizon + h * 0.06, h * 0.07, 0.7, R, mix(col, '#000000', 0.15));
        break;
      case 'lake':
        ridge(c, w, horizon, h * 0.05, 0.4, R, col);
        break;
      case 'pass':
        peaks(c, w, horizon + h * 0.02, h * 0.34, col, R, 6);
        peaks(c, w, horizon + h * 0.09, h * 0.22, mix(col, '#000000', 0.22), R, 5);
        break;
      case 'steppe':
        ridge(c, w, horizon, 3, 0.25, R, col);
        break;
      case 'fen':
        ridge(c, w, horizon, 5, 0.4, R, col);
        break;
      case 'coast':
        c.fillStyle = col; c.fillRect(0, horizon, w, h - horizon);
        break;
      case 'orchard':
        ridge(c, w, horizon + h * 0.02, h * 0.09, 0.4, R, col);
        for (i = 0; i < 26; i++) broadleaf(c, R() * w, horizon + h * 0.05 + R() * h * 0.04, h * (0.05 + R() * 0.03), mix(col, '#000000', 0.18));
        break;
      case 'cael':
        peaks(c, w, horizon + h * 0.04, h * 0.40, col, R, 4);
        break;
      default:
        ridge(c, w, horizon, 8, 0.5, R, col);
    }
  }

  function mid(c, w, h, terrain, R, col, ground, warm) {
    var i, x, y;
    switch (terrain) {
      case 'reed':
      case 'fen':
        for (i = 0; i < 90; i++) {
          x = R() * w; y = ground - R() * h * 0.10;
          c.strokeStyle = col; c.lineWidth = 1.4;
          c.beginPath(); c.moveTo(x, y);
          c.quadraticCurveTo(x + 3, y - h * 0.05, x + 8 + R() * 6, y - h * (0.07 + R() * 0.05));
          c.stroke();
        }
        if (terrain === 'fen') {
          for (i = 0; i < 4; i++) {
            x = w * (0.08 + i * 0.28);
            c.strokeStyle = col; c.lineWidth = 2;
            c.beginPath(); c.moveTo(x, ground - h * 0.02); c.lineTo(x, ground - h * 0.16); c.stroke();
            c.fillStyle = warm; c.beginPath(); c.arc(x, ground - h * 0.175, 2.6, 0, 6.2832); c.fill();
          }
        }
        break;
      case 'wood':
        // near trunks, rooted on the ground and leaning off into the canopy
        for (i = 0; i < 9; i++) {
          x = R() * w;
          var th = h * (0.36 + R() * 0.26), tw = h * (0.007 + R() * 0.008), lean = (R() - 0.5) * h * 0.05;
          c.fillStyle = col;
          c.beginPath();
          c.moveTo(x - tw, ground + h * 0.01);
          c.lineTo(x + tw, ground + h * 0.01);
          c.lineTo(x + tw * 0.55 + lean, ground - th);
          c.lineTo(x - tw * 0.55 + lean, ground - th);
          c.closePath(); c.fill();
          c.beginPath();
          c.ellipse(x + lean, ground - th, tw * 7.5, th * 0.13, 0, 0, 6.2832);
          c.fill();
        }
        break;
      case 'salt':
      case 'steppe':
        for (i = 0; i < 60; i++) {
          x = R() * w; y = ground - R() * h * 0.06;
          c.strokeStyle = col; c.lineWidth = 1.1;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + 2 + R() * 4, y - h * 0.03); c.stroke();
        }
        break;
      case 'downs':
        for (i = 0; i < 5; i++) {
          x = R() * w;
          c.fillStyle = col;
          c.beginPath();
          c.moveTo(x, ground); c.lineTo(x + 3, ground - h * 0.07);
          c.lineTo(x + 11, ground - h * 0.065); c.lineTo(x + 14, ground);
          c.closePath(); c.fill();
        }
        break;
      case 'lake':
      case 'coast':
        break;
      case 'pass':
        // scree: angular chips resting on the ground, not floating balls
        for (i = 0; i < 22; i++) {
          x = R() * w;
          y = ground - R() * h * 0.035;
          var sz = h * (0.012 + R() * 0.026);
          c.fillStyle = mix(col, '#0F0D0A', 0.42);
          c.beginPath();
          c.moveTo(x - sz, y);
          c.lineTo(x - sz * 0.5, y - sz * (0.9 + R() * 0.5));
          c.lineTo(x + sz * 0.7, y - sz * 0.7);
          c.lineTo(x + sz, y);
          c.closePath(); c.fill();
        }
        break;
      case 'orchard':
        for (i = 0; i < 7; i++) broadleaf(c, R() * w, ground - h * 0.01, h * (0.13 + R() * 0.06), col);
        break;
      case 'cael':
        for (i = 0; i < 16; i++) {
          x = w * 0.5 + (R() - 0.5) * w * 0.7;
          y = ground - h * (0.18 + R() * 0.34);
          c.fillStyle = warm; c.globalAlpha = 0.7 + R() * 0.3;
          c.fillRect(x, y, 2, 2.4);
          c.globalAlpha = 1;
        }
        break;
    }
  }

  function water(c, w, h, top, bottom, sky, R, sunx) {
    var g = c.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, mix(sky, '#33414C', 0.62));
    g.addColorStop(0.45, mix(sky, '#232E38', 0.78));
    g.addColorStop(1, '#151C22');
    c.fillStyle = g; c.fillRect(0, top, w, bottom - top);
    var i, y, t;
    if (sunx !== null && sunx !== undefined) {
      for (i = 0; i < 46; i++) {
        t = i / 45;
        y = top + t * (bottom - top) * 0.96;
        var wide = (5 + t * 70) * (0.35 + R() * 0.75);
        c.fillStyle = 'rgba(255,206,150,' + ((1 - t * 0.9) * 0.22 * (0.4 + R())).toFixed(3) + ')';
        c.fillRect(sunx - wide / 2 + (R() - 0.5) * 26, y, wide, 1.2 + t * 1.8);
      }
    }
    c.strokeStyle = 'rgba(226,236,240,0.10)'; c.lineWidth = 1;
    for (i = 0; i < 30; i++) {
      t = R();
      y = top + t * (bottom - top);
      var len = 16 + R() * 110 * (0.3 + t);
      var x = R() * w;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y); c.stroke();
    }
  }

  /** Towers, boats and lights that stand in the water rather than behind it. */
  function onWater(c, w, h, terrain, R, col, top, bottom) {
    var i, x, y, hh;
    if (terrain === 'lake') {
      for (i = 0; i < 3; i++) {
        x = w * (0.16 + i * 0.29 + R() * 0.08);
        y = top + (0.10 + i * 0.20 + R() * 0.06) * (bottom - top);
        hh = h * (0.11 + (y - top) / (bottom - top) * 0.09);
        tower(c, x, y, hh, mix(col, '#0D1216', 0.45));
        var rg = c.createLinearGradient(0, y, 0, y + hh * 0.42);
        rg.addColorStop(0, 'rgba(10,14,18,0.42)');
        rg.addColorStop(1, 'rgba(10,14,18,0)');
        c.fillStyle = rg;
        c.fillRect(x - hh * 0.10, y, hh * 0.20, hh * 0.42);
      }
    } else if (terrain === 'coast') {
      x = w * (0.12 + R() * 0.1);
      y = top + 0.06 * (bottom - top);
      hh = h * 0.19;
      c.fillStyle = mix(col, '#0D1216', 0.5);
      c.beginPath();
      c.moveTo(x - hh * 0.5, y + hh * 0.3);
      c.quadraticCurveTo(x - hh * 0.2, y - hh * 0.08, x + hh * 0.5, y + hh * 0.1);
      c.lineTo(x + hh * 0.5, y + hh * 0.4); c.lineTo(x - hh * 0.5, y + hh * 0.4);
      c.closePath(); c.fill();
      tower(c, x, y + hh * 0.06, hh, mix(col, '#0D1216', 0.55));
      var lg = c.createRadialGradient(x, y + hh * 0.06 - hh, 0, x, y + hh * 0.06 - hh, hh * 0.9);
      lg.addColorStop(0, 'rgba(255,222,160,0.55)');
      lg.addColorStop(1, 'rgba(255,222,160,0)');
      c.fillStyle = lg;
      c.beginPath(); c.arc(x, y + hh * 0.06 - hh, hh * 0.9, 0, 6.2832); c.fill();
      for (i = 0; i < 2; i++) {
        var bx = w * (0.55 + i * 0.22 + R() * 0.08);
        var by = top + (0.3 + R() * 0.3) * (bottom - top);
        var bs = h * 0.035;
        c.fillStyle = 'rgba(14,18,22,0.85)';
        c.beginPath();
        c.moveTo(bx - bs, by); c.quadraticCurveTo(bx, by + bs * 0.55, bx + bs, by);
        c.closePath(); c.fill();
        c.fillRect(bx - bs * 0.08, by - bs * 1.5, bs * 0.16, bs * 1.5);
      }
    }
  }

  function fire(c, x, y, s, t, R) {
    var i;
    // logs
    c.strokeStyle = '#3A2B22'; c.lineCap = 'round'; c.lineWidth = s * 0.16;
    c.beginPath();
    c.moveTo(x - s * 0.55, y + s * 0.06); c.lineTo(x + s * 0.5, y - s * 0.1);
    c.moveTo(x - s * 0.45, y - s * 0.12); c.lineTo(x + s * 0.55, y + s * 0.05);
    c.stroke();
    // flame
    var f = Math.sin(t * 0.006) * 0.5 + Math.sin(t * 0.011 + 1.7) * 0.3 + Math.sin(t * 0.021 + 3.3) * 0.2;
    for (i = 0; i < 3; i++) {
      var hgt = s * (1.0 + i * 0.28) * (0.82 + f * 0.16);
      var wdt = s * (0.42 - i * 0.1);
      c.fillStyle = ['rgba(255,226,160,0.95)', 'rgba(255,163,66,0.85)', 'rgba(214,90,25,0.6)'][i];
      c.beginPath();
      c.moveTo(x - wdt, y);
      c.quadraticCurveTo(x - wdt * 0.7, y - hgt * 0.6, x + f * s * 0.08, y - hgt);
      c.quadraticCurveTo(x + wdt * 0.8, y - hgt * 0.55, x + wdt, y);
      c.closePath(); c.fill();
    }
    // embers
    for (i = 0; i < 7; i++) {
      var ph = (t * 0.00035 + i * 0.137) % 1;
      var ex = x + Math.sin(t * 0.002 + i * 2.1) * s * 0.5;
      var ey = y - ph * s * 2.6;
      c.globalAlpha = (1 - ph) * 0.75;
      c.fillStyle = '#FFC076';
      c.beginPath(); c.arc(ex, ey, s * 0.045 * (1 - ph * 0.5), 0, 6.2832); c.fill();
    }
    c.globalAlpha = 1;
  }

  function seated(c, x, y, s, gear, dark) {
    var cloak = !!(gear.cloak || gear.coat);
    var hood = !!(gear.coat || gear.cloak);
    c.save();
    c.strokeStyle = dark; c.fillStyle = dark;
    c.lineCap = 'round'; c.lineJoin = 'round';

    // the rock she is sitting on
    c.beginPath();
    c.moveTo(x - s * 0.52, y);
    c.quadraticCurveTo(x - s * 0.46, y - s * 0.34, x - s * 0.02, y - s * 0.32);
    c.quadraticCurveTo(x + s * 0.24, y - s * 0.3, x + s * 0.22, y);
    c.closePath(); c.fill();

    var hip = { x: x - s * 0.02, y: y - s * 0.40 };
    var knee = { x: x + s * 0.60, y: y - s * 0.44 };
    var foot = { x: x + s * 0.78, y: y - s * 0.02 };
    var shoulder = { x: x - s * 0.16, y: y - s * 1.02 };

    // legs, the far one first
    c.lineWidth = s * 0.17;
    c.beginPath();
    c.moveTo(hip.x - s * 0.06, hip.y + s * 0.04);
    c.lineTo(knee.x - s * 0.04, knee.y + s * 0.1);
    c.lineTo(foot.x - s * 0.06, foot.y);
    c.stroke();
    c.lineWidth = s * 0.19;
    c.beginPath();
    c.moveTo(hip.x, hip.y);
    c.lineTo(knee.x, knee.y);
    c.lineTo(foot.x, foot.y);
    c.stroke();
    if (gear.boots) {
      c.lineWidth = s * 0.24;
      c.beginPath();
      c.moveTo(foot.x - s * 0.16, foot.y); c.lineTo(foot.x + s * 0.02, foot.y);
      c.stroke();
    }

    // torso
    c.lineWidth = s * 0.34;
    c.beginPath(); c.moveTo(hip.x, hip.y); c.lineTo(shoulder.x, shoulder.y); c.stroke();

    // cloak falling from the shoulders
    if (cloak) {
      c.beginPath();
      c.moveTo(shoulder.x - s * 0.16, shoulder.y + s * 0.02);
      c.quadraticCurveTo(x - s * 0.62, y - s * 0.56, x - s * 0.46, y - s * 0.02);
      c.lineTo(x + s * 0.08, y - s * 0.06);
      c.quadraticCurveTo(x + s * 0.10, y - s * 0.62, shoulder.x + s * 0.12, shoulder.y);
      c.closePath(); c.fill();
    }

    // arm resting on the knee
    c.lineWidth = s * 0.13;
    c.beginPath();
    c.moveTo(shoulder.x + s * 0.06, shoulder.y + s * 0.12);
    c.quadraticCurveTo(x + s * 0.34, y - s * 0.86, knee.x - s * 0.02, knee.y - s * 0.06);
    c.stroke();

    // head, then a hood over it
    c.beginPath();
    c.arc(shoulder.x + s * 0.04, shoulder.y - s * 0.24, s * 0.18, 0, 6.2832);
    c.fill();
    if (hood) {
      c.beginPath();
      c.moveTo(shoulder.x - s * 0.24, shoulder.y + s * 0.04);
      c.quadraticCurveTo(shoulder.x - s * 0.26, shoulder.y - s * 0.56, shoulder.x + s * 0.14, shoulder.y - s * 0.46);
      c.quadraticCurveTo(shoulder.x + s * 0.30, shoulder.y - s * 0.34, shoulder.x + s * 0.20, shoulder.y - s * 0.12);
      c.quadraticCurveTo(shoulder.x + s * 0.02, shoulder.y - s * 0.02, shoulder.x - s * 0.24, shoulder.y + s * 0.04);
      c.closePath(); c.fill();
    }
    if (gear.staff) {
      c.lineWidth = s * 0.055;
      c.beginPath();
      c.moveTo(x - s * 0.60, y + s * 0.02);
      c.lineTo(x - s * 0.34, y - s * 1.44);
      c.stroke();
    }
    c.restore();
  }

  function dog(c, x, y, s, dark) {
    c.save();
    c.fillStyle = dark; c.strokeStyle = dark;
    c.lineCap = 'round'; c.lineJoin = 'round';
    // sitting, facing left
    c.beginPath();
    c.ellipse(x + s * 0.16, y - s * 0.42, s * 0.44, s * 0.42, 0, 0, 6.2832);
    c.fill();
    // chest and back up to the neck
    c.beginPath();
    c.moveTo(x + s * 0.34, y - s * 0.72);
    c.quadraticCurveTo(x - s * 0.22, y - s * 1.02, x - s * 0.42, y - s * 1.10);
    c.lineTo(x - s * 0.30, y - s * 0.52);
    c.quadraticCurveTo(x - s * 0.12, y - s * 0.36, x + s * 0.10, y - s * 0.30);
    c.closePath(); c.fill();
    // front leg
    c.lineWidth = s * 0.15;
    c.beginPath();
    c.moveTo(x - s * 0.28, y - s * 0.60); c.lineTo(x - s * 0.34, y - s * 0.02);
    c.stroke();
    c.lineWidth = s * 0.16;
    c.beginPath();
    c.moveTo(x - s * 0.34, y - s * 0.03); c.lineTo(x - s * 0.52, y - s * 0.03);
    c.stroke();
    // head and muzzle
    c.beginPath();
    c.arc(x - s * 0.52, y - s * 1.16, s * 0.24, 0, 6.2832);
    c.fill();
    c.beginPath();
    c.moveTo(x - s * 0.62, y - s * 1.22);
    c.quadraticCurveTo(x - s * 0.96, y - s * 1.20, x - s * 0.94, y - s * 1.06);
    c.quadraticCurveTo(x - s * 0.76, y - s * 1.00, x - s * 0.58, y - s * 1.04);
    c.closePath(); c.fill();
    // the ear that has an argument with the other
    c.beginPath();
    c.moveTo(x - s * 0.44, y - s * 1.34);
    c.lineTo(x - s * 0.30, y - s * 1.62);
    c.lineTo(x - s * 0.24, y - s * 1.24);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(x - s * 0.62, y - s * 1.36);
    c.quadraticCurveTo(x - s * 0.74, y - s * 1.56, x - s * 0.80, y - s * 1.22);
    c.closePath(); c.fill();
    // tail
    c.lineWidth = s * 0.13;
    c.beginPath();
    c.moveTo(x + s * 0.54, y - s * 0.46);
    c.quadraticCurveTo(x + s * 0.92, y - s * 0.60, x + s * 0.86, y - s * 0.10);
    c.stroke();
    c.restore();
  }

  function tent(c, x, y, s, dark) {
    c.fillStyle = dark;
    c.beginPath();
    c.moveTo(x - s * 0.8, y); c.lineTo(x - s * 0.06, y - s * 0.92);
    c.lineTo(x + s * 0.06, y - s * 0.92); c.lineTo(x + s * 0.8, y);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(20,16,12,0.85)';
    c.beginPath();
    c.moveTo(x - s * 0.2, y); c.lineTo(x + s * 0.02, y - s * 0.56);
    c.lineTo(x + s * 0.2, y); c.closePath(); c.fill();
  }

  function particles(c, w, h, kind, t, R, wind) {
    var i, n, x, y;
    if (kind === 'rain') {
      c.strokeStyle = 'rgba(226,232,235,0.42)'; c.lineWidth = 1;
      n = 90;
      for (i = 0; i < n; i++) {
        x = (R() * w + t * 0.06 * (0.4 + wind)) % w;
        y = (R() * h + t * 0.5) % h;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + 3 + wind * 7, y + 13); c.stroke();
      }
    } else if (kind === 'snow') {
      c.fillStyle = 'rgba(250,250,248,0.72)';
      n = 70;
      for (i = 0; i < n; i++) {
        var sp = 0.03 + R() * 0.04;
        x = (R() * w + Math.sin(t * 0.0007 + i) * 16 + t * 0.01 * wind) % w;
        y = (R() * h + t * sp) % h;
        c.beginPath(); c.arc(x, y, 1 + R() * 1.4, 0, 6.2832); c.fill();
      }
    } else if (kind === 'mist') {
      for (i = 0; i < 5; i++) {
        var my = h * (0.42 + i * 0.09);
        var g = c.createLinearGradient(0, my - 26, 0, my + 26);
        g.addColorStop(0, 'rgba(226,224,214,0)');
        g.addColorStop(0.5, 'rgba(226,224,214,0.24)');
        g.addColorStop(1, 'rgba(226,224,214,0)');
        c.fillStyle = g;
        c.fillRect(0, my - 26, w, 52);
      }
    }
  }

  /** The whole camp plate. */
  function camp(c, w, h, o) {
    var reg = o.region, wx = o.weather;
    var R = rnd(Content.hash('camp' + o.date + Math.round(o.km * 10)));
    R.seedPhase = R() * 6.28;
    var t = o.t || 0;
    var sky = skyFor(wx);
    var horizon = h * (0.50 + (reg.terrain === 'steppe' || reg.terrain === 'salt' ? 0.08 : 0));
    var ground = h * 0.86;

    /* Sky, carried as one gradient all the way down to the ground. Two stacked
       fills left a hard horizontal seam under every open horizon. */
    var gEnd = ground + h * 0.03, hz = (horizon + h * 0.05) / gEnd;
    var g = c.createLinearGradient(0, 0, 0, gEnd);
    g.addColorStop(0, sky[0]);
    g.addColorStop(hz * 0.62, sky[1]);
    g.addColorStop(hz, sky[2]);
    g.addColorStop(1, mix(sky[2], '#3B3527', 0.38));
    c.fillStyle = g;
    c.fillRect(0, 0, w, gEnd);

    // low sun, the same low sun that is in the launcher icon
    var sunAt = null;
    if (wx.dark < 0.25) {
      var sx = w * (0.18 + R() * 0.6), sy = horizon - h * 0.02;
      sunAt = sx;
      var sg = c.createRadialGradient(sx, sy, 0, sx, sy, h * 0.34);
      sg.addColorStop(0, 'rgba(255,220,160,' + (0.5 - wx.dark) + ')');
      sg.addColorStop(1, 'rgba(255,220,160,0)');
      c.fillStyle = sg; c.fillRect(0, 0, w, horizon + h * 0.1);
      // the disc itself, half swallowed by the horizon
      if (wx.dark < 0.12) {
        c.fillStyle = 'rgba(255,232,182,' + (0.72 - wx.dark * 2) + ')';
        c.beginPath(); c.arc(sx, sy + h * 0.012, h * 0.052, 0, 6.2832); c.fill();
      }
    }
    // three soft banks of cloud, so a flat sky has some weather in it
    if (wx.id === 'highcloud' || wx.id === 'haze' || wx.id === 'thunder' || wx.id === 'wind') {
      for (var cb = 0; cb < 3; cb++) {
        var cy = horizon * (0.22 + cb * 0.21) - R() * h * 0.02;
        var cw = w * (0.36 + R() * 0.34), cx = R() * (w - cw * 0.4) - cw * 0.2;
        var ch = h * (0.035 + R() * 0.03);
        c.save();
        c.translate(cx + cw / 2, cy);
        c.scale(1, ch / (cw / 2));
        var cg = c.createRadialGradient(0, 0, 0, 0, 0, cw / 2);
        cg.addColorStop(0, 'rgba(255,244,224,' + (0.13 + R() * 0.08).toFixed(3) + ')');
        cg.addColorStop(0.55, 'rgba(255,244,224,' + (0.06 + R() * 0.04).toFixed(3) + ')');
        cg.addColorStop(1, 'rgba(255,244,224,0)');
        c.fillStyle = cg;
        c.beginPath(); c.arc(0, 0, cw / 2, 0, 6.2832); c.fill();
        c.restore();
      }
    }
    // stars, and a moon, for clear cold skies
    if (wx.id === 'clear' || wx.id === 'frost') {
      c.fillStyle = 'rgba(255,250,235,0.75)';
      for (var i = 0; i < 34; i++) {
        var stx = R() * w, sty = R() * horizon * 0.6;
        c.globalAlpha = 0.3 + R() * 0.6;
        c.beginPath(); c.arc(stx, sty, R() < 0.15 ? 1.3 : 0.8, 0, 6.2832); c.fill();
      }
      c.globalAlpha = 1;
      // a moon only on the nights the sun has already gone, never two lights at once
      if (sunAt === null || wx.dark >= 0.12) {
        var mx = w * (0.14 + R() * 0.72), my = horizon * (0.14 + R() * 0.28), mr = h * 0.032;
        var mg = c.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 4.4);
        mg.addColorStop(0, 'rgba(240,238,226,0.20)');
        mg.addColorStop(1, 'rgba(240,238,226,0)');
        c.fillStyle = mg;
        c.beginPath(); c.arc(mx, my, mr * 4.4, 0, 6.2832); c.fill();
        // the crescent as one even-odd path: punching it out erased the glow with it
        c.fillStyle = 'rgba(246,242,228,0.92)';
        c.beginPath();
        c.arc(mx, my, mr, 0, 6.2832);
        c.arc(mx + mr * 0.66, my - mr * 0.3, mr * 0.95, 0, 6.2832);
        c.fill('evenodd');
      }
    }

    var haze = Math.min(0.7, 0.2 + wx.dark);
    var farCol = mix(sky[2], '#2A3038', 0.55 + wx.dark * 0.2);
    farCol = mix(farCol, sky[1], haze * 0.45);
    far(c, w, h, reg.terrain, R, farCol, horizon);

    if (reg.terrain === 'lake' || reg.terrain === 'coast') {
      water(c, w, h, horizon, ground - h * 0.03, sky[2], R, sunAt);
      onWater(c, w, h, reg.terrain, R, farCol, horizon, ground - h * 0.03);
    }

    // ground
    var gg = c.createLinearGradient(0, ground - h * 0.22, 0, h);
    gg.addColorStop(0, mix('#3A3324', '#1A1712', 0.25 + wx.dark * 0.3));
    gg.addColorStop(1, '#14110D');
    c.fillStyle = gg;
    c.beginPath();
    c.moveTo(0, ground);
    for (var q = 0; q <= 12; q++) {
      c.lineTo(w * q / 12, ground - Math.sin(q * 0.9 + R.seedPhase) * h * 0.012 - h * 0.01);
    }
    c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();

    mid(c, w, h, reg.terrain, R, mix(farCol, '#141310', 0.55), ground, FIRELIGHT);

    /* The camp itself. The whole group is nudged along the ground and sometimes
       mirrored, so two hundred nights are not two hundred identical stagings. */
    var flip = R() < 0.42, shift = (R() - 0.5) * w * 0.14;
    var fx = w * 0.615, fy = ground + h * 0.035, fs = h * 0.125;
    c.save();
    if (flip) { c.translate(w, 0); c.scale(-1, 1); }
    c.translate(shift, 0);

    var fg = c.createRadialGradient(fx, fy, 0, fx, fy, h * 0.42);
    fg.addColorStop(0, 'rgba(255,166,84,0.42)');
    fg.addColorStop(0.5, 'rgba(255,140,60,0.14)');
    fg.addColorStop(1, 'rgba(255,140,60,0)');
    c.fillStyle = fg;
    c.fillRect(-w, ground - h * 0.3, w * 3, h - ground + h * 0.3);

    tent(c, w * 0.19, fy + h * 0.012, h * 0.175, '#241D16');
    seated(c, w * 0.43, fy + h * 0.014, h * 0.19, o.gear || {}, '#1B1610');
    if (o.biscuit) dog(c, w * 0.83, fy + h * 0.012, h * 0.075, '#211A13');
    fire(c, fx, fy, fs, t, R);
    c.restore();

    // a little foreground, so the fire has something to be in front of
    c.fillStyle = 'rgba(10,8,6,0.9)';
    c.beginPath();
    c.moveTo(0, h);
    for (var fg = 0; fg <= 10; fg++) {
      c.lineTo(w * fg / 10, h - h * 0.035 - Math.sin(fg * 1.4 + R.seedPhase) * h * 0.012);
    }
    c.lineTo(w, h); c.closePath(); c.fill();

    if (wx.particles) particles(c, w, h, wx.particles, t, rnd(Content.hash('p' + o.date)), wx.wind);

    // plate edge
    var vg = c.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,14,8,0.34)');
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
  }

  /** The wanderer standing, for the Pack screen. */
  function wanderer(c, w, h, gear, biscuit) {
    c.clearRect(0, 0, w, h);
    var x = w * 0.60, base = h * 0.90, s = h * 0.285;
    var ink = '#2A231B', cloth = gear.coat ? '#5A4526' : '#3C4A34';

    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.fillStyle = 'rgba(42,35,27,0.12)';
    c.beginPath(); c.ellipse(x, base + 2, s * 0.56, s * 0.09, 0, 0, 6.2832); c.fill();

    if (gear.staff) {
      c.strokeStyle = '#6B5230'; c.lineWidth = Math.max(2.4, s * 0.055);
      c.beginPath(); c.moveTo(x - s * 0.56, base + 1); c.lineTo(x - s * 0.44, base - s * 1.92); c.stroke();
    }

    // legs
    c.strokeStyle = ink; c.lineWidth = s * 0.155;
    c.beginPath();
    c.moveTo(x - s * 0.13, base - s * 0.72); c.lineTo(x - s * 0.16, base - s * 0.06);
    c.moveTo(x + s * 0.13, base - s * 0.72); c.lineTo(x + s * 0.17, base - s * 0.06);
    c.stroke();
    c.strokeStyle = gear.boots ? '#5A4227' : ink;
    c.lineWidth = s * 0.19;
    c.beginPath();
    c.moveTo(x - s * 0.22, base - s * 0.05); c.lineTo(x - s * 0.06, base - s * 0.05);
    c.moveTo(x + s * 0.10, base - s * 0.05); c.lineTo(x + s * 0.26, base - s * 0.05);
    c.stroke();

    // the pack, sitting proud of the back
    c.fillStyle = '#5E4728';
    c.beginPath();
    c.moveTo(x + s * 0.22, base - s * 1.32);
    c.quadraticCurveTo(x + s * 0.62, base - s * 1.22, x + s * 0.52, base - s * 0.74);
    c.quadraticCurveTo(x + s * 0.36, base - s * 0.66, x + s * 0.24, base - s * 0.78);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(30,24,16,0.5)'; c.lineWidth = s * 0.035;
    c.beginPath(); c.moveTo(x + s * 0.27, base - s * 1.02); c.lineTo(x + s * 0.53, base - s * 0.98); c.stroke();

    // body, then a cloak over it
    c.fillStyle = ink;
    c.beginPath();
    c.moveTo(x - s * 0.24, base - s * 0.68);
    c.lineTo(x - s * 0.21, base - s * 1.40);
    c.lineTo(x + s * 0.21, base - s * 1.40);
    c.lineTo(x + s * 0.24, base - s * 0.68);
    c.closePath(); c.fill();

    if (gear.cloak || gear.coat) {
      c.fillStyle = cloth;
      c.beginPath();
      c.moveTo(x - s * 0.26, base - s * 1.40);
      c.quadraticCurveTo(x - s * 0.52, base - s * 1.02, x - s * 0.40, base - s * 0.48);
      c.quadraticCurveTo(x, base - s * 0.38, x + s * 0.40, base - s * 0.48);
      c.quadraticCurveTo(x + s * 0.52, base - s * 1.02, x + s * 0.26, base - s * 1.40);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(20,16,10,0.35)'; c.lineWidth = s * 0.025;
      c.beginPath();
      c.moveTo(x - s * 0.12, base - s * 1.32); c.lineTo(x - s * 0.20, base - s * 0.48);
      c.moveTo(x + s * 0.14, base - s * 1.32); c.lineTo(x + s * 0.22, base - s * 0.50);
      c.stroke();
    }

    // arms
    c.strokeStyle = ink; c.lineWidth = s * 0.10;
    c.beginPath();
    c.moveTo(x + s * 0.20, base - s * 1.30); c.lineTo(x + s * 0.34, base - s * 0.86);
    c.stroke();

    // head, hood behind and in front of it
    if (gear.cloak || gear.coat) {
      c.fillStyle = mix(cloth, '#100D08', 0.2);
      c.beginPath();
      c.moveTo(x - s * 0.30, base - s * 1.40);
      c.quadraticCurveTo(x - s * 0.34, base - s * 1.94, x, base - s * 1.96);
      c.quadraticCurveTo(x + s * 0.34, base - s * 1.94, x + s * 0.30, base - s * 1.40);
      c.closePath(); c.fill();
    }
    c.fillStyle = '#C6A886';
    c.beginPath(); c.arc(x, base - s * 1.60, s * 0.165, 0, 6.2832); c.fill();
    if (gear.cloak || gear.coat) {
      c.fillStyle = cloth;
      c.beginPath();
      c.moveTo(x - s * 0.28, base - s * 1.44);
      c.quadraticCurveTo(x - s * 0.30, base - s * 1.86, x + s * 0.04, base - s * 1.84);
      c.quadraticCurveTo(x - s * 0.10, base - s * 1.66, x - s * 0.06, base - s * 1.42);
      c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(x + s * 0.28, base - s * 1.44);
      c.quadraticCurveTo(x + s * 0.30, base - s * 1.86, x - s * 0.02, base - s * 1.84);
      c.quadraticCurveTo(x + s * 0.14, base - s * 1.64, x + s * 0.10, base - s * 1.42);
      c.closePath(); c.fill();
    }

    if (gear.lantern) {
      var lx = x + s * 0.38, ly = base - s * 0.74;
      var lg = c.createRadialGradient(lx, ly, 0, lx, ly, s * 0.62);
      lg.addColorStop(0, 'rgba(255,198,110,0.75)');
      lg.addColorStop(1, 'rgba(255,198,110,0)');
      c.fillStyle = lg;
      c.beginPath(); c.arc(lx, ly, s * 0.62, 0, 6.2832); c.fill();
      c.strokeStyle = '#6A5330'; c.lineWidth = s * 0.03;
      c.beginPath(); c.moveTo(lx, ly - s * 0.22); c.lineTo(lx, ly - s * 0.12); c.stroke();
      c.fillStyle = '#7C5F33';
      c.fillRect(lx - s * 0.075, ly - s * 0.12, s * 0.15, s * 0.2);
      c.fillStyle = '#FFD79A';
      c.fillRect(lx - s * 0.045, ly - s * 0.09, s * 0.09, s * 0.13);
    }

    if (biscuit) dog(c, x - s * 0.92, base - s * 0.02, s * 0.30, '#40311F');
    c.restore();
  }

  /* Small ink drawings for the pack cabinet. */
  function item(c, id, x, y, s, col) {
    c.save();
    c.strokeStyle = col; c.fillStyle = col;
    c.lineWidth = Math.max(1.2, s * 0.08); c.lineCap = 'round'; c.lineJoin = 'round';
    switch (id) {
      case 'cup':
        c.beginPath(); c.moveTo(x - s * 0.34, y - s * 0.3); c.lineTo(x - s * 0.24, y + s * 0.34);
        c.lineTo(x + s * 0.24, y + s * 0.34); c.lineTo(x + s * 0.34, y - s * 0.3); c.closePath(); c.stroke();
        c.beginPath(); c.arc(x + s * 0.44, y, s * 0.18, -1.2, 1.2); c.stroke();
        break;
      case 'cloak':
        c.beginPath(); c.moveTo(x, y - s * 0.5);
        c.quadraticCurveTo(x - s * 0.56, y - s * 0.1, x - s * 0.42, y + s * 0.48);
        c.lineTo(x + s * 0.42, y + s * 0.48);
        c.quadraticCurveTo(x + s * 0.56, y - s * 0.1, x, y - s * 0.5);
        c.closePath(); c.stroke();
        break;
      case 'boots':
        c.beginPath(); c.moveTo(x - s * 0.42, y - s * 0.4); c.lineTo(x - s * 0.42, y + s * 0.2);
        c.lineTo(x - s * 0.06, y + s * 0.36); c.lineTo(x - s * 0.06, y + s * 0.16);
        c.lineTo(x - s * 0.2, y + s * 0.06); c.lineTo(x - s * 0.2, y - s * 0.4); c.closePath(); c.stroke();
        c.beginPath(); c.moveTo(x + s * 0.1, y - s * 0.4); c.lineTo(x + s * 0.1, y + s * 0.2);
        c.lineTo(x + s * 0.46, y + s * 0.36); c.lineTo(x + s * 0.46, y + s * 0.16);
        c.lineTo(x + s * 0.32, y + s * 0.06); c.lineTo(x + s * 0.32, y - s * 0.4); c.closePath(); c.stroke();
        break;
      case 'staff':
        c.beginPath(); c.moveTo(x - s * 0.12, y + s * 0.5); c.lineTo(x + s * 0.1, y - s * 0.5); c.stroke();
        c.lineWidth = Math.max(1, s * 0.05);
        for (var i = 0; i < 4; i++) {
          var ty = y - s * 0.32 + i * s * 0.2;
          c.beginPath(); c.moveTo(x - s * 0.06 + i * s * 0.045, ty); c.lineTo(x + s * 0.08 + i * s * 0.045, ty - s * 0.02); c.stroke();
        }
        break;
      case 'lantern':
        // a bail, a cap, a glass with a flame in it, a foot
        c.beginPath(); c.arc(x, y - s * 0.34, s * 0.19, 3.5, 5.92); c.stroke();
        c.beginPath(); c.moveTo(x - s * 0.28, y - s * 0.24); c.lineTo(x + s * 0.28, y - s * 0.24); c.stroke();
        c.beginPath();
        c.moveTo(x - s * 0.22, y - s * 0.24); c.lineTo(x - s * 0.26, y + s * 0.3);
        c.lineTo(x + s * 0.26, y + s * 0.3); c.lineTo(x + s * 0.22, y - s * 0.24);
        c.stroke();
        c.beginPath(); c.moveTo(x - s * 0.34, y + s * 0.4); c.lineTo(x + s * 0.34, y + s * 0.4); c.stroke();
        c.beginPath();
        c.moveTo(x - s * 0.08, y + s * 0.16);
        c.quadraticCurveTo(x - s * 0.1, y - s * 0.06, x + s * 0.02, y - s * 0.14);
        c.quadraticCurveTo(x + s * 0.1, y - s * 0.02, x + s * 0.08, y + s * 0.16);
        c.closePath(); c.fill();
        break;
      case 'bell':
        c.beginPath(); c.moveTo(x - s * 0.34, y + s * 0.3);
        c.quadraticCurveTo(x - s * 0.3, y - s * 0.36, x, y - s * 0.42);
        c.quadraticCurveTo(x + s * 0.3, y - s * 0.36, x + s * 0.34, y + s * 0.3);
        c.closePath(); c.stroke();
        c.beginPath(); c.arc(x, y + s * 0.4, s * 0.09, 0, 6.2832); c.fill();
        break;
      case 'pin':
        c.beginPath(); c.moveTo(x - s * 0.4, y + s * 0.36); c.lineTo(x + s * 0.34, y - s * 0.36); c.stroke();
        c.beginPath(); c.arc(x + s * 0.38, y - s * 0.4, s * 0.12, 0, 6.2832); c.fill();
        break;
      case 'compass':
        c.beginPath(); c.arc(x, y, s * 0.42, 0, 6.2832); c.stroke();
        c.beginPath(); c.moveTo(x, y - s * 0.3); c.lineTo(x + s * 0.14, y); c.lineTo(x, y + s * 0.3);
        c.lineTo(x - s * 0.14, y); c.closePath(); c.stroke();
        break;
      case 'amber':
        // a drilled bead with something small and very old asleep inside it
        c.beginPath(); c.ellipse(x, y + s * 0.04, s * 0.32, s * 0.38, 0.24, 0, 6.2832); c.stroke();
        c.beginPath(); c.arc(x - s * 0.02, y - s * 0.34, s * 0.08, 0.5, 3.9); c.stroke();
        c.beginPath();
        c.ellipse(x + s * 0.02, y + s * 0.06, s * 0.09, s * 0.14, 0.5, 0, 6.2832);
        c.fill();
        c.lineWidth = Math.max(0.8, s * 0.045);
        c.beginPath();
        c.moveTo(x - s * 0.14, y - s * 0.04); c.lineTo(x - s * 0.02, y + s * 0.02);
        c.moveTo(x + s * 0.16, y + s * 0.14); c.lineTo(x + s * 0.06, y + s * 0.1);
        c.stroke();
        break;
      case 'lens':
        c.beginPath(); c.arc(x, y, s * 0.38, 0, 6.2832); c.stroke();
        c.beginPath(); c.arc(x - s * 0.1, y - s * 0.1, s * 0.16, 2.4, 5.2); c.stroke();
        break;
      case 'coat':
        c.beginPath(); c.moveTo(x - s * 0.36, y - s * 0.36); c.lineTo(x - s * 0.44, y + s * 0.44);
        c.lineTo(x + s * 0.44, y + s * 0.44); c.lineTo(x + s * 0.36, y - s * 0.36);
        c.lineTo(x + s * 0.14, y - s * 0.44); c.lineTo(x - s * 0.14, y - s * 0.44); c.closePath(); c.stroke();
        c.beginPath(); c.moveTo(x, y - s * 0.4); c.lineTo(x, y + s * 0.44); c.stroke();
        break;
      case 'token':
        c.beginPath(); c.arc(x, y, s * 0.4, 0, 6.2832); c.stroke();
        c.beginPath(); c.arc(x, y, s * 0.22, 0, 6.2832); c.stroke();
        break;
      case 'button':
        c.beginPath(); c.arc(x, y, s * 0.34, 0, 6.2832); c.stroke();
        c.beginPath(); c.arc(x - s * 0.11, y - s * 0.06, s * 0.06, 0, 6.2832); c.fill();
        c.beginPath(); c.arc(x + s * 0.11, y - s * 0.06, s * 0.06, 0, 6.2832); c.fill();
        break;
      case 'rope':
        c.beginPath();
        for (var r = 0; r < 3; r++) c.arc(x, y, s * (0.16 + r * 0.11), 0, 6.2832);
        c.stroke();
        break;
      case 'charcoal':
        c.beginPath(); c.moveTo(x - s * 0.36, y + s * 0.3); c.lineTo(x + s * 0.24, y - s * 0.3);
        c.lineTo(x + s * 0.4, y - s * 0.12); c.lineTo(x - s * 0.2, y + s * 0.44); c.closePath(); c.stroke();
        break;
      case 'salt':
        c.beginPath(); c.moveTo(x - s * 0.36, y + s * 0.34); c.lineTo(x, y - s * 0.4);
        c.lineTo(x + s * 0.36, y + s * 0.34); c.closePath(); c.stroke();
        break;
      case 'fleece':
        c.beginPath();
        c.arc(x - s * 0.16, y, s * 0.2, 0, 6.2832);
        c.arc(x + s * 0.16, y - s * 0.06, s * 0.22, 0, 6.2832);
        c.arc(x, y + s * 0.16, s * 0.18, 0, 6.2832);
        c.stroke();
        break;
      case 'bronze':
        c.beginPath(); c.moveTo(x - s * 0.3, y + s * 0.36); c.lineTo(x + s * 0.34, y - s * 0.3);
        c.lineTo(x + s * 0.1, y - s * 0.38); c.lineTo(x - s * 0.36, y + s * 0.2); c.closePath(); c.stroke();
        break;
      case 'nail':
        c.beginPath(); c.moveTo(x, y - s * 0.4); c.lineTo(x, y + s * 0.42); c.stroke();
        c.beginPath(); c.moveTo(x - s * 0.2, y - s * 0.4); c.lineTo(x + s * 0.2, y - s * 0.4); c.stroke();
        break;
      case 'horsehair':
        c.beginPath();
        c.moveTo(x - s * 0.3, y - s * 0.38);
        c.quadraticCurveTo(x + s * 0.2, y - s * 0.1, x - s * 0.2, y + s * 0.18);
        c.quadraticCurveTo(x + s * 0.16, y + s * 0.3, x - s * 0.06, y + s * 0.44);
        c.stroke();
        break;
      case 'wick':
        c.beginPath(); c.moveTo(x - s * 0.34, y + s * 0.3); c.quadraticCurveTo(x, y - s * 0.1, x + s * 0.3, y - s * 0.36); c.stroke();
        c.beginPath(); c.arc(x + s * 0.36, y - s * 0.42, s * 0.1, 0, 6.2832); c.fill();
        break;
      case 'glass':
        c.beginPath(); c.moveTo(x - s * 0.34, y + s * 0.1); c.quadraticCurveTo(x - s * 0.1, y - s * 0.44, x + s * 0.28, y - s * 0.18);
        c.quadraticCurveTo(x + s * 0.42, y + s * 0.26, x - s * 0.02, y + s * 0.4);
        c.quadraticCurveTo(x - s * 0.34, y + s * 0.36, x - s * 0.34, y + s * 0.1);
        c.closePath(); c.stroke();
        break;
      case 'seed':
        c.beginPath(); c.moveTo(x - s * 0.4, y + s * 0.3); c.lineTo(x + s * 0.06, y - s * 0.12); c.stroke();
        c.beginPath(); c.moveTo(x + s * 0.04, y - s * 0.2); c.quadraticCurveTo(x + s * 0.4, y - s * 0.34, x + s * 0.36, y + s * 0.02);
        c.quadraticCurveTo(x + s * 0.2, y + s * 0.1, x + s * 0.04, y - s * 0.2); c.closePath(); c.stroke();
        break;
      default:
        c.beginPath(); c.arc(x, y, s * 0.34, 0, 6.2832); c.stroke();
    }
    c.restore();
  }

  return { camp: camp, wanderer: wanderer, item: item, dog: dog, mix: mix, rnd: rnd, SKY: SKY };
})();
