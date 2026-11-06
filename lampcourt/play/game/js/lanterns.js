/*
 * The lantern generator: one seeded design per Ramadan date (brass filigree, coloured glass, shape),
 * plus the house lantern used outside Ramadan. A design is a look only; it never changes the light.
 * art.js draws a design; this file only chooses it, so the choice is unit tested.
 */
(function (root) {
  'use strict';
  var LC = root.LC || (root.LC = {});
  var rng = LC.rng || (typeof require === 'function' ? require('./rng.js') : null);

  var GLASS = ['#C63D4C', '#2E9B73', '#3E6CCF', '#E2992C', '#CF6A8C', '#2AA5A0'];
  var BODIES = ['hex', 'oct', 'drum', 'bulb', 'tall'];
  // No six-pointed star: in a Ramadan game it could read as another faith's symbol.
  var FILIGREE = ['star8', 'rings', 'arches', 'lattice', 'drops'];
  var CAPS = ['dome', 'onion', 'spire', 'tiered'];
  var FINIALS = ['ring', 'crescent', 'ball'];

  function design(seed) {
    var r = rng.make(seed);
    var g1 = r.int(GLASS.length);
    var g2 = (g1 + 1 + r.int(GLASS.length - 1)) % GLASS.length;
    return {
      body: BODIES[r.int(BODIES.length)],
      glass: [GLASS[g1], GLASS[g2]],
      two: r.chance(1, 2), // alternate the two glass colours pane by pane
      filigree: FILIGREE[r.int(FILIGREE.length)],
      cap: CAPS[r.int(CAPS.length)],
      finial: FINIALS[r.int(FINIALS.length)],
      ratio: 13 + r.int(6), // height to width in tenths: 1.3 to 1.8
      bands: 1 + r.int(3)
    };
  }

  function key(d) {
    return [d.body, d.glass[0], d.two ? d.glass[1] : '', d.filigree, d.cap, d.finial].join('|');
  }

  var cache = {};
  /** The 30 lanterns of a Ramadan year, all different from each other. */
  function season(year) {
    if (cache[year]) return cache[year];
    var list = [], seen = {};
    for (var n = 1; n <= 30; n++) {
      var d = null;
      for (var salt = 0; salt < 64; salt++) {
        d = design(rng.hash('lampcourt-lantern-' + year + '-' + n + (salt ? '-' + salt : '')));
        if (!seen[key(d)]) break;
      }
      if (n === 30) d = eid(d);
      seen[key(d)] = true;
      list.push(d);
    }
    cache[year] = list;
    return list;
  }

  /** The Eid lantern: the 30th, always brass with saffron and clear gold glass and a crescent finial. */
  function eid(d) {
    return { body: d.body, glass: ['#E2992C', '#F3D58A'], two: true, filigree: d.filigree, cap: 'onion', finial: 'crescent', ratio: d.ratio, bands: 3, eid: true };
  }

  function forDate(year, n) {
    if (!(n >= 1 && n <= 30)) return house();
    return season(year)[n - 1];
  }

  var HOUSE = { body: 'oct', glass: ['#E2992C', '#C63D4C'], two: false, filigree: 'star8', cap: 'dome', finial: 'ring', ratio: 15, bands: 2 };
  function house() { return HOUSE; }

  var api = { GLASS: GLASS, BODIES: BODIES, FILIGREE: FILIGREE, CAPS: CAPS, FINIALS: FINIALS, design: design, key: key, season: season, forDate: forDate, house: house };
  LC.lanterns = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
