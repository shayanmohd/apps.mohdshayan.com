/* The only share surface: a typeset card of one sentence. Rendered on device, saved by the user. */
const Card = (() => {
  const W = 1080, H = 1350;

  /* word wrap; a word wider than the measure is broken by character so nothing runs off the card */
  function wrap(ctx, text, maxW) {
    const words = [];
    for (const w of text.split(/\s+/)) {
      if (ctx.measureText(w).width <= maxW) { words.push(w); continue; }
      let piece = '';
      for (const ch of w) {
        if (ctx.measureText(piece + ch).width > maxW && piece) { words.push(piece); piece = ch; }
        else piece += ch;
      }
      if (piece) words.push(piece);
    }
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  async function render(date, text) {
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const paper = dark ? '#171612' : '#F3EFE5';
    const ink = dark ? '#ECE6D6' : '#1C1B17';
    const soft = dark ? '#B3AC9A' : '#5A574D';
    const cobalt = dark ? '#9DB3FF' : '#1F3FBF';

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(W * .15, -H * .1, 0, W * .15, -H * .1, H * 1.3);
    g.addColorStop(0, dark ? '#1D1B15' : '#FAF7EF');
    g.addColorStop(.5, paper);
    g.addColorStop(1, dark ? '#12110C' : '#EBE5D6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // paper tooth, deterministic so the card is the same every time it is made
    let seed = 1337;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    ctx.globalAlpha = dark ? 0.035 : 0.05;
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = rnd() > 0.5 ? '#000' : '#fff';
      ctx.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    const M = 108;
    ctx.fillStyle = soft;
    ctx.font = '600 26px "Source Serif 4", Georgia, serif';
    ctx.letterSpacing = '4px';
    ctx.fillText(Store.longDate(date).toUpperCase(), M, 190);
    ctx.letterSpacing = '0px';

    // the mark under the date: the launcher icon's line and full stop, at `scale` canvas px per icon unit
    const mark = (x, y, scale) => {
      ctx.save();
      ctx.translate(x, y); ctx.scale(scale, scale); ctx.translate(-22, -47.7);
      ctx.fillStyle = cobalt;
      ctx.fill(new Path2D('M25.5 56.9 C36 51.3 52 47.7 70.5 49.1 A3.9 3.9 0 0 1 69.9 56.9 C52 55.7 36 59.5 26.5 64.6 A3.9 3.9 0 0 1 25.5 56.9 Z'));
      ctx.beginPath(); ctx.arc(81.6, 57.4, 4.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(80.3, 55.9, 1.25, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    mark(M, 214, 3.4);

    let size = 62;
    let lines = [];
    do {
      ctx.font = `400 ${size}px "Source Serif 4", Georgia, serif`;
      lines = wrap(ctx, text, W - M * 2);
      if (lines.length * size * 1.42 < H - 520) break;
      size -= 4;
    } while (size > 30);

    ctx.fillStyle = ink;
    let y = 340;
    for (const l of lines) { ctx.fillText(l, M, y); y += size * 1.42; }

    mark(M, H - 160, 1.5);
    ctx.fillStyle = soft;
    ctx.font = '400 24px "Source Serif 4", Georgia, serif';
    ctx.letterSpacing = '3px';
    ctx.fillText('SENTENCE', M + 122, H - 138);
    ctx.letterSpacing = '0px';

    return new Promise(res => c.toBlob(res, 'image/png'));
  }

  return { render };
})();
