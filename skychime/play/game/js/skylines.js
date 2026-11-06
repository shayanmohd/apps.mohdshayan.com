/*
 * The skylines: key, tempo, palette and a seeded silhouette for each. Pure data and generation; the
 * renderer turns the shapes into pixels. Units are world units (100 wide); buildings extend past both
 * edges of the world so wide screens still see a city.
 */
(function (root) {
  'use strict';
  var Sky = root.Sky = root.Sky || {};
  var rngLib = Sky.rng || (typeof require === 'function' ? require('./rng.js') : null);

  var LIST = [
    {
      id: 'harbour', bpm: 108, root: 62, scale: [0, 2, 4, 7, 9], diff: 0, bell: { ratio: 3.5, index: 2.2, decay: 1.6, octave: 0 },
      style: 'harbour', seed: 11, water: true,
      sky: ['#060A19', '#0B1226', '#18224A', '#2A3560'], haze: '#3B3466', silhouette: '#04060E', rim: '#3C4C86'
    },
    {
      id: 'desert', bpm: 116, root: 64, scale: [0, 1, 4, 5, 7], diff: 0.15, bell: { ratio: 2.76, index: 2.8, decay: 1.3, octave: 0 },
      style: 'desert', seed: 23, water: false,
      sky: ['#0A0716', '#150E2A', '#2A1C3E', '#4A3048'], haze: '#6A4040', silhouette: '#07040B', rim: '#7A4E5C'
    },
    {
      id: 'snow', bpm: 100, root: 59, scale: [0, 3, 5, 7, 10], diff: 0.25, bell: { ratio: 4, index: 1.6, decay: 2.0, octave: 1 },
      style: 'snow', seed: 37, water: false, snow: true,
      sky: ['#040B14', '#0A1824', '#13283A', '#22404F'], haze: '#3C5A66', silhouette: '#03070C', rim: '#5C7C8C'
    },
    {
      id: 'newyear', bpm: 124, root: 60, scale: [0, 2, 4, 7, 9], diff: 0.3, bell: { ratio: 3.5, index: 2.0, decay: 1.8, octave: 1 },
      style: 'newyear', seed: 53, water: true, festival: 'newyear',
      sky: ['#05060F', '#0C0E22', '#1A1C3C', '#33305A'], haze: '#5A3E5A', silhouette: '#030309', rim: '#5A5288'
    },
    {
      id: 'river', bpm: 112, root: 53, scale: [0, 2, 4, 7, 9], diff: 0.1, bell: { ratio: 1, index: 3.2, decay: 0.9, octave: 1 },
      style: 'river', seed: 71, water: true, paid: true,
      sky: ['#040D10', '#08191E', '#10292E', '#1E4040'], haze: '#3A5248', silhouette: '#020809', rim: '#4C7468'
    }
  ];
  var BY_ID = {};
  for (var i = 0; i < LIST.length; i++) BY_ID[LIST[i].id] = LIST[i];

  // Skill skylines in order; River city is the Remove ads skyline, New Year the festival night.
  var SKILL = ['harbour', 'desert', 'snow'];

  function districtOf(x) {
    var d = Math.floor(x / 10);
    return d < 0 ? 0 : d > 9 ? 9 : d;
  }

  function windowsFor(r, b, density) {
    var list = [];
    var ww = 0.9, wh = 1.1, gx = 2.0, gy = 2.6;
    var cols = Math.max(1, Math.floor((b.w - 1.2) / gx));
    var rows = Math.max(0, Math.floor((b.h - 2.5) / gy));
    var x0 = b.x + (b.w - (cols - 1) * gx - ww) / 2;
    for (var row = 0; row < rows; row++) {
      for (var c = 0; c < cols; c++) {
        if (r.float() < density) list.push({ x: x0 + c * gx, y: 1.4 + row * gy, w: ww, h: wh });
      }
    }
    return list;
  }

  /** The silhouette: buildings (with roofs and windows) and special shapes, from the skyline's seed. */
  function silhouette(def) {
    var r = rngLib.create(def.seed * 7919 + 13);
    var shapes = [];
    var x = -70;
    var tallBias = def.style === 'newyear' ? 1.6 : def.style === 'river' ? 1.25 : 1;
    var specialsAt = {
      harbour: [{ at: 12, kind: 'crane' }, { at: 72, kind: 'crane' }, { at: 96, kind: 'lighthouse' }],
      desert: [{ at: 30, kind: 'minaret' }, { at: 64, kind: 'minaret' }],
      snow: [{ at: 44, kind: 'spire' }],
      newyear: [{ at: 50, kind: 'clock' }],
      river: [{ at: 18, kind: 'bridge' }, { at: 80, kind: 'bridge' }]
    }[def.style] || [];
    var nextSpecial = 0;
    while (x < 170) {
      if (nextSpecial < specialsAt.length && x >= specialsAt[nextSpecial].at - 4) {
        var sp = specialsAt[nextSpecial++];
        var s = { kind: sp.kind, x: sp.at, district: districtOf(sp.at) };
        if (sp.kind === 'crane') { s.h = 26 + r.float() * 6; s.arm = 14 + r.float() * 6; s.dir = r.chance(0.5) ? 1 : -1; }
        if (sp.kind === 'lighthouse') { s.h = 22; s.w = 3.2; }
        if (sp.kind === 'minaret') { s.h = 30 + r.float() * 5; s.w = 2.4; }
        if (sp.kind === 'spire') { s.h = 34; s.w = 4.2; }
        if (sp.kind === 'clock') { s.h = 44; s.w = 7; }
        if (sp.kind === 'bridge') { s.w = 22; s.h = 7; }
        shapes.push(s);
        if (sp.kind !== 'crane' && sp.kind !== 'bridge') x = sp.at + (s.w || 3) / 2 + 0.6;
        continue;
      }
      var b = { kind: 'building', x: x, district: 0 };
      switch (def.style) {
        case 'harbour':
          b.w = 4 + r.float() * 7; b.h = r.chance(0.28) ? 13 + r.float() * 10 : 5 + r.float() * 7;
          b.roof = r.chance(0.25) ? 'saw' : 'flat'; break;
        case 'desert':
          b.w = 4 + r.float() * 8; b.h = 6 + r.float() * 9;
          b.roof = r.chance(0.3) ? 'dome' : r.chance(0.5) ? 'crenel' : 'flat'; break;
        case 'snow':
          b.w = 4 + r.float() * 5; b.h = 5 + r.float() * 8;
          b.roof = r.chance(0.2) ? 'pine' : 'pitch'; break;
        case 'newyear':
          b.w = 3.5 + r.float() * 6; b.h = (8 + r.float() * 22) * (r.chance(0.3) ? tallBias : 1);
          b.roof = r.chance(0.3) ? 'step' : r.chance(0.3) ? 'spire' : 'flat'; break;
        default:
          b.w = 4 + r.float() * 6; b.h = (6 + r.float() * 14) * (r.chance(0.3) ? tallBias : 1);
          b.roof = r.chance(0.3) ? 'step' : 'flat';
      }
      b.district = districtOf(b.x + b.w / 2);
      if (b.roof === 'pine') {
        b.h = 6 + r.float() * 6; b.windows = [];
      } else {
        b.windows = windowsFor(r, b, def.style === 'newyear' ? 0.62 : 0.5);
      }
      shapes.push(b);
      x += b.w + (r.chance(0.3) ? 0.6 + r.float() * 1.6 : 0.2);
    }
    return shapes;
  }

  /** Which skylines can be played now. */
  function available(id, unlocks, opts) {
    var def = BY_ID[id];
    if (!def) return false;
    if (def.paid) return !!(opts && opts.adFree);
    if (def.festival) return !!(opts && opts.festival === def.festival);
    if (id === 'harbour') return true;
    return !!(unlocks && unlocks[id]);
  }

  var api = { LIST: LIST, BY_ID: BY_ID, SKILL: SKILL, silhouette: silhouette, available: available, districtOf: districtOf };
  Sky.skylines = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
