/* Paper. The two things this app hands back to the world: a contact sheet, and a
   single frame with its colophon. Both are drawn here at print size and written
   through the native file bridge when there is one, or downloaded when there is not. */
const Export = (() => {
  const PAPER = '#0D0C0B';     // a contact sheet is mostly black: clear film prints dark
  const EDGE = '#CFC6B6';      // edge printing reads light on the print
  const FAINT = '#7E7568';
  const ACCENT = '#F2A62B';   // the app's one accent, so a print and a screen agree

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const k = Math.min(r, w / 2, h / 2);
      this.moveTo(x + k, y);
      this.arcTo(x + w, y, x + w, y + h, k);
      this.arcTo(x + w, y + h, x, y + h, k);
      this.arcTo(x, y + h, x, y, k);
      this.arcTo(x, y, x + w, y, k);
      this.closePath();
    };
  }

  function face(size, weight, spacing) {
    return { font: `${weight} ${size}px Archivo, "Helvetica Neue", Arial, sans-serif`, spacing: spacing || 0 };
  }
  function text(ctx, s, x, y, f, colour, align) {
    ctx.font = f.font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = f.spacing + 'px';
    ctx.fillStyle = colour;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  const load = url => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });

  /** Sprocket run and frame numbers, printed the way a rebate edge prints. */
  function rebate(ctx, x, y, w, h, label, keeper) {
    const pitch = w / 5.2;
    ctx.fillStyle = FAINT;
    for (let i = 0; i < 5; i++) {
      const sx = x + 6 + i * pitch;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.roundRect(sx, y + h / 2 - 4, pitch * 0.52, 8, 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    text(ctx, label, x + w - 4, y + h / 2 + 5, face(15, 600, 1.4), keeper ? ACCENT : EDGE, 'right');
  }

  /** The whole roll as one sheet: six strips of six, header, colophon. */
  async function sheet(roll) {
    const s = Stocks.get(roll.stock);
    const FW = 300, FH = Math.round(FW / Cam.AR), GUT = 12, REB = 30, M = 46;
    const W = M * 2 + FW * 6 + GUT * 5;
    const HEAD = 168, FOOT = 104;
    const rowH = FH + REB;
    const H = HEAD + rowH * 6 + GUT * 5 + FOOT;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);

    text(ctx, s.name.toUpperCase(), M, 78, face(46, 700, 1), EDGE);
    const meta = `ROLL ${Store.pad(roll.no)}  ${roll.frames.length} EXPOSURES  ${Store.dateSpan(roll).toUpperCase()}`;
    text(ctx, meta, M, 116, face(20, 500, 2.6), FAINT);
    const marks = [];
    if (roll.push > 0) marks.push('PUSH +1');
    if (roll.push < 0) marks.push('PULL -1');
    if (roll.discreet) marks.push('DISCREET');
    if (marks.length) text(ctx, marks.join('   '), W - M, 116, face(20, 600, 2.6), ACCENT, 'right');
    ctx.strokeStyle = '#2A251E'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(M, HEAD - 34); ctx.lineTo(W - M, HEAD - 34); ctx.stroke();

    for (let i = 0; i < 36; i++) {
      const col = i % 6, row = (i / 6) | 0;
      const x = M + col * (FW + GUT);
      const y = HEAD + row * (rowH + GUT);
      const f = roll.frames.find(fr => fr.n === i + 1);
      if (!f) {
        ctx.fillStyle = '#141210';
        ctx.fillRect(x, y, FW, FH);
        continue;
      }
      const url = await DB.url(DB.frmKey(roll.id, f.n));
      if (url) {
        try { ctx.drawImage(await load(url), x, y, FW, FH); }
        catch (e) { ctx.fillStyle = '#141210'; ctx.fillRect(x, y, FW, FH); }
      }
      if (f.keeper) {
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 5; ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.ellipse(x + FW / 2, y + FH / 2, FW * 0.53, FH * 0.44, -0.06, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      rebate(ctx, x, y + FH, FW, REB, String(f.n), f.keeper);
    }

    text(ctx, 'CONTACT SHEET', M, H - 44, face(21, 600, 3.4), FAINT);
    const kept = Store.keepers(roll).length;
    text(ctx, kept ? `${kept} KEPT` : 'NONE KEPT YET', W - M, H - 44, face(21, 600, 3.4), kept ? ACCENT : FAINT, 'right');
    return Film.toBlob(cv, 0.9);
  }

  /** One frame, bordered, with the colophon that says where it came from. */
  async function frameCard(roll, n) {
    const s = Stocks.get(roll.stock);
    const f = roll.frames.find(x => x.n === n);
    const M = 64, FW = 1080, FH = Math.round(FW / Cam.AR);
    const W = FW + M * 2, H = M + FH + 232;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    const url = await DB.url(DB.frmKey(roll.id, n));
    if (url) { try { ctx.drawImage(await load(url), M, M, FW, FH); } catch (e) {} }

    const base = M + FH + 78;
    text(ctx, s.name.toUpperCase(), M, base, face(38, 700, 1), EDGE);
    const when = f ? Store.longDate(f.at) : Store.longDate(roll.loadedAt);
    text(ctx, `FRAME ${Store.pad(n)} OF 36   ROLL ${Store.pad(roll.no)}   ${when.toUpperCase()}`,
         M, base + 42, face(20, 500, 2.6), FAINT);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(W - M - 96, base - 26, 96, 5);
    text(ctx, 'CONTACT SHEET', W - M, base + 42, face(20, 600, 3), FAINT, 'right');
    return Film.toBlob(cv, 0.92);
  }

  const b64 = blob => new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.readAsDataURL(blob);
  });

  /** Writes the file where the user can find it. Returns a uri, 'download', or ''. */
  async function save(name, blob) {
    if (window.Native && window.Native.saveFile) {
      try { return window.Native.saveFile(name, blob.type || 'image/jpeg', await b64(blob)) || ''; }
      catch (e) { return ''; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    return 'download';
  }

  async function share(name, blob, subject) {
    if (window.Native && window.Native.saveFile && window.Native.shareUri) {
      const uri = await save(name, blob);
      if (uri && uri !== 'download') { try { window.Native.shareUri(uri, blob.type || 'image/jpeg'); return 'shared'; } catch (e) {} }
      return uri ? 'saved' : '';
    }
    if (navigator.canShare) {
      try {
        const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: subject }); return 'shared'; }
      } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    return (await save(name, blob)) ? 'saved' : '';
  }

  return { sheet, frameCard, save, share };
})();
