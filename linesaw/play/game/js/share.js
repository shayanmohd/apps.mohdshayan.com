/*
 * The Daily share card. Wordless apart from the name: the day number, a row of cut kites, kites lost, the
 * longest duel in seconds and a mark for any rewarded help (a plus kite for Spare kite, a loop for a
 * second sky). The text works anywhere; the PNG is drawn on its own 600 x 600 canvas, far under 1 MB,
 * and shows nothing of the sky's layout.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.LS = root.LS || {}).share = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KITE = '🪁';      // kite
  var DUEL = '⚔️';      // crossed swords: the longest duel
  var LOST = '💔';      // a broken heart: kites lost
  var SPARE = '➕' + KITE;    // plus a kite: Spare kite was taken
  var SECOND = '🔁';    // a loop: a second sky was flown
  var MAX_ROW = 12;

  /** r: {cuts, lost, duel, spare}; second: a second sky was flown today. */
  function text(day, r, second) {
    var cuts = r.cuts | 0;
    var row = '';
    for (var i = 0; i < Math.min(cuts, MAX_ROW); i++) row += KITE;
    if (cuts > MAX_ROW) row += '+' + (cuts - MAX_ROW);
    if (!cuts) row = '0';
    var lines = ['Linesaw ' + day, row, DUEL + ' ' + (Math.round((r.duel || 0) * 10) / 10).toFixed(1) + 's  ' + LOST + ' ' + (r.lost | 0)];
    var marks = [];
    if (r.spare) marks.push(SPARE);
    if (second) marks.push(SECOND);
    if (marks.length) lines.push(marks.join(' '));
    return lines.join('\n');
  }

  /** Draws the card and returns its PNG data URL (null without a DOM). LS.art draws the kites. */
  function png(day, r, second, pattern, font) {
    if (typeof document === 'undefined') return null;
    var art = (typeof self !== 'undefined' ? self : this).LS.art;
    var size = 600;
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var x = c.getContext('2d');
    x.direction = 'ltr'; // wordless numbers, never mirrored in a right-to-left language
    art.sky(x, size, 0, 470, size, 0.35, false);
    art.sun(x, 420, 430, 34, 0.35);
    // rooftops
    x.fillStyle = '#151b2e';
    var tops = [446, 428, 452, 436, 448, 424, 444];
    for (var i = 0; i < tops.length; i++) x.fillRect(i * 90 - 20, tops[i], 96, size);
    x.fillStyle = '#0b0f1a';
    x.fillRect(0, 472, size, size);
    x.fillRect(60, 462, 120, 12);
    x.fillRect(430, 466, 110, 10);
    // your kite and its line from the left roof
    x.strokeStyle = 'rgba(239, 230, 210, 0.8)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(110, 466);
    x.quadraticCurveTo(250, 330, 430, 170);
    x.stroke();
    art.kite(x, 430, 170, 0.35, 44, { color: art.C.marigold, pattern: pattern | 0 });

    x.textBaseline = 'alphabetic';
    x.fillStyle = '#efe6d2';
    x.font = '700 46px ' + font;
    x.textAlign = 'left';
    x.fillText('Linesaw', 40, 84);
    x.fillStyle = art.C.marigold;
    x.fillRect(42, 100, 110, 4);
    x.fillStyle = '#efe6d2';
    x.textAlign = 'right';
    x.font = '700 96px ' + font;
    x.fillText(String(day), size - 40, 100);

    // the row of cut kites
    var cuts = r.cuts | 0;
    var shown = Math.min(cuts, 10);
    for (var k = 0; k < shown; k++) {
      var cx = 58 + (k % 5) * 56, cy = 190 + Math.floor(k / 5) * 70;
      art.kite(x, cx, cy, -0.25 + (k % 3) * 0.2, 20, { color: art.RIVALS[k % 3], pattern: k % 3 });
      x.strokeStyle = '#efe6d2';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(cx - 14, cy + 30);
      x.lineTo(cx + 14, cy + 20);
      x.stroke();
    }
    x.textAlign = 'left';
    x.fillStyle = '#efe6d2';
    x.font = '700 64px ' + font;
    x.fillText(String(cuts), 40, cuts > 5 ? 400 : cuts ? 330 : 240);

    // kites lost, longest duel, rewarded marks
    var y = 540;
    x.font = '700 30px ' + font;
    x.textAlign = 'left';
    var lost = r.lost | 0;
    x.save();
    x.translate(56, y - 10);
    x.beginPath();
    x.moveTo(0, -20); x.lineTo(13, -2); x.lineTo(0, 16); x.lineTo(-13, -2); x.closePath();
    x.strokeStyle = 'rgba(239, 230, 210, 0.7)';
    x.lineWidth = 3;
    x.stroke();
    x.restore();
    x.fillStyle = '#efe6d2';
    x.fillText(String(lost), 80, y);
    // the duel mark: two crossing lines with a spark
    x.strokeStyle = '#efe6d2';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(160, y - 26); x.lineTo(196, y + 4);
    x.moveTo(196, y - 26); x.lineTo(160, y + 4);
    x.stroke();
    x.fillStyle = '#ffd27a';
    x.beginPath();
    x.arc(178, y - 11, 5, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#efe6d2';
    x.fillText((Math.round((r.duel || 0) * 10) / 10).toFixed(1) + ' s', 208, y);
    var mx = 360;
    if (r.spare) {
      x.fillStyle = art.C.marigold;
      x.fillText('+', mx, y);
      art.kite(x, mx + 34, y - 12, 0, 14, { color: art.C.marigold, pattern: 0 });
      mx += 70;
    }
    if (second) {
      x.strokeStyle = art.C.marigold;
      x.lineWidth = 3.5;
      x.beginPath();
      x.arc(mx + 14, y - 11, 13, -0.4, Math.PI * 1.5);
      x.stroke();
      x.beginPath();
      x.moveTo(mx + 22, y - 32); x.lineTo(mx + 15, y - 24); x.lineTo(mx + 24, y - 20);
      x.stroke();
    }
    x.font = '400 20px ' + font;
    x.fillStyle = 'rgba(239, 230, 210, 0.7)';
    x.textAlign = 'right';
    x.fillText('apps.mohdshayan.com/linesaw', size - 36, size - 22);
    return c.toDataURL('image/png');
  }

  return { text: text, png: png, KITE: KITE };
});
