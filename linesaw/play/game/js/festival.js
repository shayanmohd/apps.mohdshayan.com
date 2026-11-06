/*
 * Festival skies from a date table, by the player's local date. Uttarayan (Makar Sankranti) at launch: the
 * background fills with distant kites and the light warms. The Basant sky (12 to 14 March 2027) is the
 * first update and is not in this table yet.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.LS = root.LS || {}).festival = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // month 1 is January; days inclusive
  var TABLE = [
    { id: 'uttarayan', from: { m: 1, d: 10 }, to: { m: 1, d: 16 } }
  ];

  function key(m, d) { return m * 100 + d; }

  /** The festival on a local date, or null. */
  function on(date) {
    var d = date || new Date();
    var k = key(d.getMonth() + 1, d.getDate());
    for (var i = 0; i < TABLE.length; i++) {
      var f = TABLE[i];
      if (k >= key(f.from.m, f.from.d) && k <= key(f.to.m, f.to.d)) return f.id;
    }
    return null;
  }

  return { TABLE: TABLE, on: on };
});
