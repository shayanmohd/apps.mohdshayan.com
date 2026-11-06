/*
 * The Daily share card: wordless apart from the name. The text works anywhere; the PNG is drawn on an
 * offscreen canvas and kept well under 1 MB.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.BL = root.BL || {}).share = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var URL = 'https://apps.mohdshayan.com/butterline/play/';
  var MARK = { butter: '◆', firm: '◇' };
  var FAIL = '✕';
  var GO_AROUND = '↺';

  function mark(r) {
    return (MARK[r.stamp] || FAIL) + (r.ga ? GO_AROUND : '');
  }

  /** "Butterline 6", the five stamps with their fpm, the total. The link goes separately, as the url. */
  function text(day, results, total) {
    var line = results.map(function (r) {
      return mark(r) + ' ' + (r.stamp === 'missed' ? '0' : r.fpm);
    }).join('  ');
    return 'Butterline ' + day + '\n' + line + '\n' + total + '/500';
  }

  /** Draws the card on a fresh 720 x 720 canvas and returns its PNG data URL (null without a DOM). */
  function png(day, results, total, art, font) {
    if (typeof document === 'undefined') return null;
    var size = 720;
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#0c1626');
    g.addColorStop(0.65, '#17304e');
    g.addColorStop(1, '#2c4a6c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // Air streaks, seeded by the day so the card for a day always looks the same.
    var a = (day * 2654435761) >>> 0;
    function rnd() {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    ctx.lineCap = 'round';
    for (var i = 0; i < 90; i++) {
      var x = rnd() * size, y = 40 + rnd() * (size - 200), len = 20 + rnd() * 60;
      ctx.strokeStyle = 'rgba(238, 243, 247, ' + (0.05 + rnd() * 0.12) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + len * 0.08);
      ctx.stroke();
    }
    // The butter line down to the aim block on the runway, right of the total, with the aircraft on it.
    ctx.strokeStyle = '#f3d27a';
    ctx.setLineDash([14, 10]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(400, 470);
    ctx.quadraticCurveTo(500, 540, 560, 610);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#343a41';
    ctx.fillRect(330, 610, 390, 14);
    ctx.fillStyle = '#f3d27a';
    ctx.fillRect(545, 610, 30, 5);
    art.drawAircraft(ctx, 'bush', 392, 466, { scale: 0.62, pitch: -0.12, lights: true, blink: true });

    ctx.fillStyle = '#eef3f7';
    ctx.font = '600 44px ' + font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Butterline', 48, 92);
    ctx.fillStyle = '#f3d27a';
    ctx.fillRect(50, 108, 120, 4);
    ctx.fillStyle = '#eef3f7';
    ctx.textAlign = 'right';
    ctx.font = '600 92px ' + font;
    ctx.fillText(String(day), size - 48, 110);

    var r = 50;
    var gap = (size - 96) / 5;
    for (i = 0; i < results.length && i < 5; i++) {
      var res = results[i];
      var cx = 48 + gap * i + gap / 2;
      art.drawStamp(ctx, res.stamp, cx, 250, r, { fill: 'rgba(12, 22, 38, 0.55)' });
      ctx.fillStyle = art.stampColor(res.stamp);
      ctx.textAlign = 'center';
      ctx.font = '600 34px ' + font;
      ctx.fillText(res.stamp === 'missed' ? '0' : String(res.fpm), cx, 340);
      if (res.ga) {
        ctx.font = '600 30px ' + font;
        ctx.fillText(GO_AROUND, cx, 380);
      }
    }
    ctx.fillStyle = '#eef3f7';
    ctx.textAlign = 'left';
    ctx.font = '600 120px ' + font;
    ctx.fillText(String(total), 48, 540);
    var w = ctx.measureText(String(total)).width;
    ctx.font = '500 40px ' + font;
    ctx.fillStyle = 'rgba(238, 243, 247, 0.6)';
    ctx.fillText('/500', 56 + w, 540);
    ctx.font = '500 26px ' + font;
    ctx.fillStyle = 'rgba(238, 243, 247, 0.75)';
    ctx.textAlign = 'right';
    ctx.fillText('apps.mohdshayan.com/butterline', size - 40, size - 40);
    return c.toDataURL('image/png');
  }

  return { URL: URL, text: text, png: png, mark: mark };
});
