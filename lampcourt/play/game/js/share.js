/*
 * Share cards and text. The daily card never shows a placement or a lit cell: tonight's lantern drawn
 * large over the courtyard's outline, a typed greeting in Ramadan (an Eid greeting on Eid day, none
 * after), the date and lit against best. The lit courtyard picture is only for Night walk and past days.
 * text() is pure and unit tested; the card functions need a canvas and run only in the browser.
 */
(function (root) {
  'use strict';
  var LC = root.LC || (root.LC = {});

  var PLAY_URL = 'https://apps.mohdshayan.com/lampcourt/play/';
  var W = 720, H = 900;
  var FONT = '"Readex Pro", system-ui, sans-serif';

  /** The link with the day in it. */
  function url(day) {
    return day ? PLAY_URL + '?d=' + (day | 0) : PLAY_URL;
  }

  /** One line: the label (a date or a courtyard), lit/best, and the perfect word when equal. */
  function text(label, lit, best, perfectWord) {
    var s = 'Lampcourt ' + label + ': ' + lit + '/' + best;
    if (lit >= best && perfectWord) s += ' ' + perfectWord;
    return s;
  }

  function setFont(g, weight, size) {
    g.font = weight + ' ' + size + 'px ' + FONT;
  }

  function background(g) {
    LC.art.drawSky(g, W, H, false, 7);
    var v = g.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, W * 0.8);
    v.addColorStop(0, 'rgba(240, 185, 94, 0.10)');
    v.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  }

  function footer(g, rtl) {
    var C = LC.art.C;
    g.direction = 'ltr';
    g.textAlign = 'center';
    g.fillStyle = C.brass;
    setFont(g, 600, 30);
    g.fillText('Lampcourt', W / 2, H - 62);
    g.fillStyle = C.muted;
    setFont(g, 400, 20);
    g.fillText('apps.mohdshayan.com/lampcourt', W / 2, H - 32);
    g.direction = rtl ? 'rtl' : 'ltr';
  }

  /**
   * The daily greeting card. o: { plan, design, greeting (or ''), dateLabel, lit, best, perfectWord,
   * resultLabel, rtl }. Returns a PNG data URL.
   */
  function dailyCard(o) {
    var art = LC.art, C = art.C;
    var c = art.layer(W, H), g = c.getContext('2d');
    background(g);
    // The courtyard's outline, walls and columns only, no light and no lanterns.
    var plan = o.plan;
    var cs = Math.min(440 / plan.w, 300 / plan.h);
    var px = (W - plan.w * cs) / 2, py = 330;
    art.drawPlanOutline(g, plan, px, py, cs, '#3D5868', 0.95);
    // Tonight's lantern, large, hanging from the top edge.
    var lh = 300;
    var sp = art.lanternSprite(o.design, lh, true);
    var glow = art.glowSprite(220, 0.5);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glow, W / 2 - 220, 150 + lh * 0.55 - 220);
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = C.brass;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(W / 2, 0);
    g.lineTo(W / 2, 150);
    g.stroke();
    g.drawImage(sp.canvas, W / 2 - sp.w / 2, 148);
    g.direction = o.rtl ? 'rtl' : 'ltr';
    g.textAlign = 'center';
    if (o.greeting) {
      g.fillStyle = C.moon;
      setFont(g, 600, 50);
      g.fillText(o.greeting, W / 2, 82);
    }
    g.fillStyle = C.moon;
    setFont(g, 500, 34);
    g.fillText(o.dateLabel, W / 2, 668);
    g.fillStyle = '#F0B95E';
    setFont(g, 600, 64);
    g.direction = 'ltr';
    g.fillText(o.lit + ' / ' + o.best, W / 2, 740);
    g.direction = o.rtl ? 'rtl' : 'ltr';
    if (o.lit >= o.best && o.perfectWord) {
      setFont(g, 600, 26);
      var tw = g.measureText(o.perfectWord).width + 36;
      g.strokeStyle = C.brass;
      g.lineWidth = 2;
      roundRect(g, W / 2 - tw / 2, 758, tw, 40, 20);
      g.stroke();
      g.fillStyle = C.brassLight;
      g.fillText(o.perfectWord, W / 2, 787);
    }
    footer(g, o.rtl);
    return c.toDataURL('image/png');
  }

  /**
   * The lit courtyard card (Night walk and past days). o: { plan, model, cells, bits, glass, title,
   * lit, best, perfectWord, rtl, stars (or -1) }.
   */
  function courtCard(o) {
    var art = LC.art, C = art.C;
    var c = art.layer(W, H), g = c.getContext('2d');
    background(g);
    var plan = o.plan;
    var cs = Math.floor(Math.min(560 / plan.w, 560 / plan.h));
    var px = Math.round((W - plan.w * cs) / 2), py = 150 + Math.round((560 - plan.h * cs) / 2);
    var sprites = art.cellSprites(cs);
    art.drawPlan(g, plan, px, py, cs, { sprites: sprites });
    for (var i = 0; i < plan.w * plan.h; i++) {
      if (LC.light.isLit(o.bits, i)) g.drawImage(sprites.lit[1], px + (i % plan.w) * cs, py + ((i / plan.w) | 0) * cs, cs, cs);
    }
    var tok = art.tokenSprite(o.glass, cs * 0.8, '');
    o.cells.forEach(function (cell) {
      if (cell == null) return;
      g.drawImage(tok.canvas, px + (cell % plan.w + 0.5) * cs - tok.half, py + (((cell / plan.w) | 0) + 0.5) * cs - tok.half);
    });
    g.direction = o.rtl ? 'rtl' : 'ltr';
    g.textAlign = 'center';
    g.fillStyle = C.moon;
    setFont(g, 600, 40);
    g.fillText(o.title, W / 2, 92);
    g.direction = 'ltr';
    g.fillStyle = '#F0B95E';
    setFont(g, 600, 56);
    var line = o.lit + ' / ' + o.best;
    if (o.stars >= 0) line = repeat('★', o.stars) + repeat('☆', 3 - o.stars) + '   ' + line;
    g.fillText(line, W / 2, 776);
    footer(g, o.rtl);
    return c.toDataURL('image/png');
  }

  function repeat(s, n) { var o = ''; for (var i = 0; i < n; i++) o += s; return o; }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  var api = { PLAY_URL: PLAY_URL, url: url, text: text, dailyCard: dailyCard, courtCard: courtCard };
  LC.share = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
