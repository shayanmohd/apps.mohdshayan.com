/*
 * The Daily Grand Prix share card: a stopwatch drawn on its own canvas (never a screenshot), with the
 * two-tenths band on its dial, three hands for the three stops, the start reaction, the stop times and
 * the places, plus one text line with the day's link. Spoiler free: times and places only. Shared with
 * Shell.share straight from the Share button's tap; never rewarded.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.TT = root.TT || {}).share = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var W = 600;
  var H = 760;
  var COL = { bg: '#0E1116', panel: '#151a21', line: '#262d37', ink: '#EEF1F4', muted: '#8C96A4', purple: '#B07CFF', green: '#35D483', amber: '#F2C14E', red: '#FF3B30', paint: '#E5C13A' };

  function fmt(t) {
    return (Math.round(t * 100) / 100).toFixed(2);
  }

  function fmtReaction(r) {
    return (Math.round(r * 1000) / 1000).toFixed(3);
  }

  /** The timing colour of a stop time: purple at record pace, green under 2.00, amber slower, red if unsafe. */
  function colourOf(stop) {
    if (stop.unsafe) return COL.red;
    if (stop.time <= 1.80) return COL.purple;
    if (stop.time < 2.00) return COL.green;
    return COL.amber;
  }

  /** The share text: one line in the player's language, then the day's link. */
  function text(result, day, t, format, link) {
    var r = result.jump ? t.jumpStart : fmtReaction(result.reaction == null ? 0 : result.reaction);
    var s = result.stops.map(function (x) { return fmt(x.time); }).join(' ');
    var line = format(t.shareLine, { n: day, r: r, s: s, g: result.grid, f: result.finish });
    if ((result.tries | 0) > 1) line += ' (' + t.twoTries + ')';
    return { text: line, url: link };
  }

  /** Draws the card and returns its PNG data URL. font: the CSS font family for numbers and words. */
  function card(result, day, t, format, font) {
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var g = c.getContext('2d');
    var F = font || 'sans-serif';
    g.fillStyle = COL.bg;
    g.fillRect(0, 0, W, H);

    // Header: the game's name and the day.
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillStyle = COL.ink;
    g.font = '600 34px ' + F;
    g.fillText('Twotenths', 40, 66);
    g.fillStyle = COL.muted;
    g.font = '600 24px ' + F;
    g.textAlign = 'right';
    g.fillText(t.dailyGp + ' ' + day, W - 40, 64);

    // The stopwatch: crown, bezel and a dial from 1.60 s to 2.60 s over 270 degrees, the same scale as
    // the game's timing ruler, with the two tenths between the record and 2.00 lit.
    var cx = W / 2, cy = 300, R = 178;
    g.fillStyle = COL.line;
    g.fillRect(cx - 24, cy - R - 44, 48, 24);
    g.fillRect(cx - 8, cy - R - 22, 16, 18);
    g.beginPath();
    g.arc(cx, cy, R + 12, 0, Math.PI * 2);
    g.fillStyle = COL.line;
    g.fill();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fillStyle = COL.panel;
    g.fill();
    var A0 = Math.PI * 0.75;
    var SPAN = Math.PI * 1.5;
    function ang(sec) {
      var u = (Math.max(1.6, Math.min(2.6, sec)) - 1.6) / 1.0;
      return A0 + u * SPAN;
    }
    g.lineCap = 'butt';
    g.lineWidth = 18;
    g.beginPath();
    g.arc(cx, cy, R - 20, ang(1.6), ang(1.8));
    g.strokeStyle = 'rgba(176, 124, 255, 0.42)';
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, R - 20, ang(1.8), ang(2.0));
    g.strokeStyle = 'rgba(53, 212, 131, 0.45)';
    g.stroke();
    for (var k = 0; k <= 20; k++) {
      var sec = 1.6 + k * 0.05;
      var a = ang(sec);
      var long = k % 4 === 0;
      var r1 = R - 32, r2 = long ? R - 52 : R - 42;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      g.lineWidth = long ? 4 : 2;
      g.strokeStyle = long ? COL.ink : COL.muted;
      g.stroke();
      if (long) {
        g.fillStyle = Math.abs(sec - 1.8) < 1e-6 ? COL.purple : Math.abs(sec - 2.0) < 1e-6 ? COL.green : COL.muted;
        g.font = '600 22px ' + F;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(sec.toFixed(1), cx + Math.cos(a) * (R - 76), cy + Math.sin(a) * (R - 76));
      }
    }
    // Hands: one per stop, in its timing colour, numbered at the tip.
    for (var i = 0; i < result.stops.length; i++) {
      var st = result.stops[i];
      var ha = ang(st.time);
      g.beginPath();
      g.moveTo(cx - Math.cos(ha) * 16, cy - Math.sin(ha) * 16);
      g.lineTo(cx + Math.cos(ha) * (R - 40), cy + Math.sin(ha) * (R - 40));
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.strokeStyle = colourOf(st);
      g.stroke();
    }
    g.beginPath();
    g.arc(cx, cy, 12, 0, Math.PI * 2);
    g.fillStyle = COL.ink;
    g.fill();
    // Places, under the dial.
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = COL.ink;
    g.font = '600 60px ' + F;
    g.fillText('P' + result.grid + '  \u2192  P' + result.finish, cx, 548);

    // Below: the start and the three stops.
    var y = 640;
    g.textAlign = 'left';
    g.fillStyle = COL.muted;
    g.font = '600 22px ' + F;
    g.fillText(t.start, 40, y - 40);
    g.fillText(t.stops, 230, y - 40);
    g.font = '600 44px ' + F;
    g.fillStyle = result.jump ? COL.red : COL.ink;
    g.fillText(result.jump ? t.jumpStart : fmtReaction(result.reaction || 0), 40, y + 6);
    var x = 230;
    for (var j = 0; j < result.stops.length; j++) {
      g.fillStyle = colourOf(result.stops[j]);
      g.fillText(fmt(result.stops[j].time), x, y + 6);
      x += 118;
    }
    // Footer: the record line, any second try, the link.
    g.fillStyle = COL.muted;
    g.font = '600 20px ' + F;
    if ((result.tries | 0) > 1) {
      g.textAlign = 'right';
      g.fillStyle = COL.amber;
      g.fillText(t.twoTries, W - 40, H - 34);
    }
    g.textAlign = 'left';
    g.fillStyle = COL.paint;
    g.fillRect(40, H - 52, 6, 22);
    g.fillStyle = COL.muted;
    g.fillText('apps.mohdshayan.com/twotenths', 56, H - 34);
    return c.toDataURL('image/png');
  }

  return { W: W, H: H, fmt: fmt, fmtReaction: fmtReaction, colourOf: colourOf, text: text, card: card };
});
