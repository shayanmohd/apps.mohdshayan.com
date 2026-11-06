/*
 * The four made-up airports: runway geometry, terrain under the approach, the character of their air
 * and the colours of their sky. x is metres along the approach with 0 at the runway threshold; heights
 * are metres above the threshold.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).airports = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIST = [
    {
      id: 'island', lengthFactor: 1.0, slope: 0, unlock: 0,
      wind: { base: 3, shear: 0.3, ridge: 0, tailAloft: false, gustBias: 0 },
      sky: { top: '#24507e', mid: '#5f8db4', horizon: '#e8d8bf', sun: '#fff1cf', ground: '#2c3a33', far: '#3d6a86', near: '#1d4560', water: true, night: false },
      streak: '#f2f6f9'
    },
    {
      id: 'mountain', lengthFactor: 0.8, slope: 0.03, unlock: 5,
      wind: { base: 4, shear: 0.4, ridge: 1, tailAloft: false, gustBias: 0.5 },
      sky: { top: '#2a4b6e', mid: '#7a9cb8', horizon: '#dbe4ea', sun: '#fff6e2', ground: '#33392f', far: '#5a6e82', near: '#3b4a59', water: false, night: false },
      streak: '#f4f7fa'
    },
    {
      id: 'night', lengthFactor: 1.1, slope: 0, unlock: 15,
      wind: { base: 4, shear: 0.35, ridge: 0, tailAloft: false, gustBias: 0 },
      sky: { top: '#060c18', mid: '#0d1a30', horizon: '#1f3150', sun: '#e9eef8', ground: '#0b0f14', far: '#111c2c', near: '#0a121e', water: false, night: true },
      streak: '#c9dcff'
    },
    {
      id: 'shear', lengthFactor: 0.95, slope: 0, unlock: 30,
      wind: { base: 6, shear: 0.55, ridge: 0, tailAloft: true, gustBias: 1 },
      sky: { top: '#43566a', mid: '#7d8e9c', horizon: '#b9c3ca', sun: '#eef1f2', ground: '#36402f', far: '#5e6b6c', near: '#465246', water: false, night: false },
      streak: '#f7f9fa'
    }
  ];

  var BY_ID = {};
  LIST.forEach(function (a) { BY_ID[a.id] = a; });

  /** Runway for one airport and aircraft: length, aim point, end. */
  function runway(airport, aircraft) {
    var length = Math.round(aircraft.baseRunway * airport.lengthFactor);
    return { length: length, aim: Math.round(length * 0.22), end: length, slope: airport.slope };
  }

  /** Height of the ground (or water) under x. */
  function groundAt(airport, rw, x) {
    if (x >= 0 && x <= rw.end) return airport.slope * x;
    var top = airport.slope * rw.end;
    switch (airport.id) {
      case 'island':
        if (x < 0) return x > -40 ? -2.2 * smoothstep(0, -40, x) : -2.2;
        return x < rw.end + 60 ? 0 : -2.2;
      case 'mountain':
        if (x < 0) return -Math.min(70, 0.0025 * x * x + 0.03 * -x);
        return top + (x - rw.end) * 0.3;
      default:
        return x < 0 ? -0.3 : top;
    }
  }

  /** Height of the runway plane under x (flat past either end): the reference the air follows. */
  function baseAt(airport, rw, x) {
    return airport.slope * Math.max(0, Math.min(rw.end, x));
  }

  function isRunway(rw, x) {
    return x >= 0 && x <= rw.end;
  }

  function smoothstep(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  return {
    list: LIST,
    ids: LIST.map(function (a) { return a.id; }),
    get: function (id) { return BY_ID[id] || LIST[0]; },
    runway: runway,
    groundAt: groundAt,
    baseAt: baseAt,
    isRunway: isRunway
  };
});
