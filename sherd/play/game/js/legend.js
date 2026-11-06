/*
 * The wordless legend: three scenes that play in turn and teach the two rules that matter.
 *   glaze: a probed cell on the (normally hidden) shard turns to glaze;
 *   rim:   a cell beside the shard rims, and the edge it shares with the shard glows;
 *   soil:  a cell away from it turns to soil, and a plus opens round it: none of those five cells holds it.
 * Also the small strip under the board that recalls the same three pictures.
 */
(function (root) {
  'use strict';
  var art = root.Sherd.art;
  var PAL = art.PAL;
  var CYCLE = 7600;

  var SCENES = [
    { shard: [[1, 1], [2, 1], [2, 0]], probe: [1, 1], mark: 'hit' },
    { shard: [[1, 1], [2, 1], [2, 0]], probe: [1, 2], mark: 'near', edge: [[1, 2], [2, 2]] },
    { shard: [[3, 0], [3, 1], [3, 2]], probe: [1, 1], mark: 'miss' }
  ];

  var tex = [];
  for (var i = 0; i < 16; i++) tex.push(art.cellTexture(500 + i));

  function mark(ctx, kind, x, y, s, k) {
    if (kind === 'hit') art.drawHit(ctx, x, y, s, tex[k % 16]);
    else if (kind === 'near') { art.drawEmpty(ctx, x, y, s); art.drawNear(ctx, x, y, s); }
    else art.drawMiss(ctx, x, y, s, tex[k % 16]);
  }

  function shardCells(scene) { return scene.shard.map(function (c) { return c[1] * 4 + c[0]; }); }

  function scene(ctx, sc, x0, y0, s, lt, reduced, row) {
    var cols = 4;
    var rows = 3;
    ctx.fillStyle = 'rgba(212,216,209,0.6)';
    art.rr(ctx, x0 - 4, y0 - 4, cols * s + 8, rows * s + 8, 6);
    ctx.fill();
    var probeAt = 350;
    var stampAt = 750;
    var afterAt = 1050;
    var p = sc.probe;
    for (var yy = 0; yy < rows; yy++) {
      for (var xx = 0; xx < cols; xx++) {
        var cx = x0 + xx * s;
        var cy = y0 + yy * s;
        var isProbe = xx === p[0] && yy === p[1];
        if (isProbe && lt >= stampAt) {
          var q = reduced ? 1 : Math.min(1, (lt - stampAt) / 220);
          var sc2 = reduced ? 1 : 1.3 - 0.3 * art.easeBack(q);
          ctx.save();
          ctx.globalAlpha = Math.min(1, q * 2);
          ctx.translate(cx + s / 2, cy + s / 2);
          ctx.scale(sc2, sc2);
          ctx.translate(-cx - s / 2, -cy - s / 2);
          mark(ctx, sc.mark, cx, cy, s, row * 4 + xx);
          ctx.restore();
          continue;
        }
        art.drawEmpty(ctx, cx, cy, s);
        if (sc.mark === 'miss' && lt >= afterAt && Math.abs(xx - p[0]) + Math.abs(yy - p[1]) === 1) {
          art.drawCleared(ctx, cx, cy, s, tex[(xx + yy) % 16], reduced ? 1 : Math.min(1, (lt - afterAt) / 300));
        }
      }
    }
    // the shard, shown here so the rule can be seen
    var cells = shardCells(sc);
    ctx.save();
    ctx.setLineDash([4, 3]);
    art.shapePath(ctx, cells, 4, x0, y0, s, 3, s * 0.12);
    ctx.fillStyle = 'rgba(43,76,140,0.13)';
    ctx.fill();
    ctx.strokeStyle = PAL.cobalt;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    // the probe being painted
    if (lt >= probeAt && lt < stampAt) {
      var px = x0 + p[0] * s;
      var py = y0 + p[1] * s;
      art.drawProbe(ctx, [p[1] * 4 + p[0]], 4, x0, y0, s, false);
      ctx.fillStyle = 'rgba(31,42,49,0.2)';
      ctx.beginPath();
      ctx.arc(px + s / 2, py + s / 2, s * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
    if (sc.edge && lt >= afterAt) {
      var e = reduced ? 1 : Math.min(1, (lt - afterAt) / 300);
      var glow = reduced ? 1 : 0.65 + 0.35 * Math.sin(lt / 180);
      ctx.strokeStyle = PAL.oxide;
      ctx.globalAlpha = e * glow;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0 + sc.edge[0][0] * s + 4, y0 + sc.edge[0][1] * s);
      ctx.lineTo(x0 + sc.edge[1][0] * s - 4, y0 + sc.edge[1][1] * s);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (sc.mark === 'miss' && lt >= afterAt) {
      // the plus: an ink outline round the five cleared cells
      var a = reduced ? 1 : Math.min(1, (lt - afterAt) / 360);
      ctx.save();
      ctx.globalAlpha = a;
      art.shapePath(ctx, [p[1] * 4 + p[0], p[1] * 4 + p[0] - 1, p[1] * 4 + p[0] + 1, (p[1] - 1) * 4 + p[0], (p[1] + 1) * 4 + p[0]], 4, x0, y0, s, 1.5, s * 0.1);
      ctx.strokeStyle = PAL.soilDeep;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  /** The full legend: three rows, each scene then its mark. */
  function render(ctx, w, h, now, start, reduced) {
    ctx.clearRect(0, 0, w, h);
    var t = reduced ? 99999 : (now - start) % CYCLE;
    var rowH = Math.min(h / 3.4, w * 0.45, 200);
    var s = Math.floor(rowH / 3.5);
    var sceneW = s * 4;
    var tile = Math.round(s * 1.6);
    var total = sceneW + 40 + tile;
    var x0 = Math.round((w - total) / 2);
    var top = Math.round((h - rowH * 3) / 2);
    for (var r = 0; r < 3; r++) {
      var lt = t - r * 1450;
      var y0 = top + r * rowH + (rowH - s * 3) / 2;
      var alpha = reduced ? 1 : Math.max(0.28, Math.min(1, (lt + 300) / 300));
      ctx.save();
      ctx.globalAlpha = alpha;
      scene(ctx, SCENES[r], x0, y0, s, reduced ? 9999 : lt, reduced, r);
      // the equals sign, drawn in ink
      var ex = x0 + sceneW + 14;
      var ey = y0 + s * 1.5;
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex, ey - 4); ctx.lineTo(ex + 14, ey - 4);
      ctx.moveTo(ex, ey + 4); ctx.lineTo(ex + 14, ey + 4);
      ctx.stroke();
      var tx = x0 + sceneW + 40;
      var ty = y0 + s * 1.5 - tile / 2;
      mark(ctx, SCENES[r].mark, tx, ty, tile, r);
      ctx.restore();
    }
    return !reduced;
  }

  /** The strip under the board: each mark next to a tiny picture of its rule. */
  function strip(canvas, dpr) {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var tile = Math.min(30, h - 12);
    var mini = Math.round(tile / 2.6);
    var groupW = tile + 8 + mini * 3;
    var gap = (w - groupW * 3) / 4;
    var y = (h - tile) / 2;
    ['hit', 'near', 'miss'].forEach(function (kind, k) {
      var x = gap + k * (groupW + gap);
      mark(ctx, kind, x, y, tile, k);
      var px = x + tile + 8;
      var py = h / 2 - mini * 1.5;
      if (kind === 'miss') {
        [[1, 0], [0, 1], [2, 1], [1, 2]].forEach(function (c) { art.drawCleared(ctx, px + c[0] * mini, py + c[1] * mini, mini, tex[k], 1); });
        art.drawMiss(ctx, px + mini, py + mini, mini, tex[3]);
        art.shapePath(ctx, [1, 3, 4, 5, 7], 3, px, py, mini, 0.5, 2);
        ctx.strokeStyle = PAL.soilDeep;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        var shard = [0, 1, 4];
        ctx.save();
        ctx.setLineDash([2, 2]);
        art.shapePath(ctx, shard, 3, px, py + mini * 0.5, mini, 1, 2);
        ctx.strokeStyle = PAL.cobalt;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
        if (kind === 'hit') art.drawHit(ctx, px + mini, py + mini * 0.5, mini, tex[5]);
        else { art.drawEmpty(ctx, px + mini * 2, py + mini * 0.5, mini); art.drawNear(ctx, px + mini * 2, py + mini * 0.5, mini); }
      }
    });
  }

  root.Sherd.legend = { render: render, strip: strip };
})(this);
