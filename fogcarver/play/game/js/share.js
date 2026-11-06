/*
 * The share card: a 1080 by 1080 framed ink map with the day number and the score against par, drawn on
 * its own canvas (never a screenshot), plus one text line that reads in any chat. The map shows the
 * shared coast with this player's interior; nothing about the player and never the tile order.
 */
(function (root) {
  'use strict';
  var FC = root.FC || (root.FC = {});
  var art = FC.art, t = FC.t;

  var SIZE = 1080;
  var PLAY_URL = 'https://apps.mohdshayan.com/fogcarver/play/';

  /** info: { day, score, par, gold, second } */
  function card(island, board, info) {
    var c = art.canvas(SIZE, SIZE);
    var g = c.getContext('2d');
    var u = 2.4;
    g.fillStyle = art.P.paper;
    g.fillRect(0, 0, SIZE, SIZE);
    // the chart area inside the frame
    var m = 70;
    var top = 150, bottom = 190;
    var inner = art.canvas(SIZE - 2 * m, SIZE - top - bottom);
    var ig = inner.getContext('2d');
    var L = art.fit(island, 70, 64, inner.width - 140, inner.height - 128);
    art.drawMap(ig, island, board, L, u, { rings: 4, grain: false });
    g.drawImage(inner, m, top);
    art.drawFrame(g, m, top, SIZE - 2 * m, SIZE - top - bottom, u);

    g.fillStyle = art.P.ink;
    g.textBaseline = 'alphabetic';
    g.font = 'italic 600 64px ' + art.FONT;
    g.textAlign = 'left';
    g.fillText(t('title'), m, 108);
    g.font = '600 52px ' + art.FONT;
    g.textAlign = 'right';
    g.fillText(t('day', { n: info.day }), SIZE - m, 106);

    // score against par along the bottom
    var y = SIZE - 92;
    g.textAlign = 'left';
    g.font = '600 96px ' + art.FONT;
    var scoreText = String(info.score);
    g.fillText(scoreText, m, y + 22);
    var sw = g.measureText(scoreText).width;
    art.pennant(g, m + sw + 44, y - 10, 52, info.score >= info.par);
    g.font = '500 54px ' + art.FONT;
    g.fillText(String(info.par), m + sw + 90, y + 6);
    if (info.gold) {
      var px = m + sw + 90 + g.measureText(String(info.par)).width + 70;
      art.laurel(g, px, y - 10, 56, info.score >= info.gold);
      g.fillText(String(info.gold), px + 44, y + 6);
    }
    if (info.second) {
      g.textAlign = 'right';
      g.font = 'italic 500 40px ' + art.FONT;
      g.fillStyle = art.P.pencil;
      g.fillText(t('secondTry'), SIZE - m, y + 4);
    }
    return c;
  }

  function line(info) {
    return t('shareLine', { n: info.day, score: info.score, par: info.par }) + (info.second ? t('shareSecond') : '');
  }

  FC.share = { card: card, line: line, PLAY_URL: PLAY_URL, SIZE: SIZE };
})(window);
