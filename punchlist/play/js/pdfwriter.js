/* A small PDF 1.4 writer, and a canvas renderer for the same page description.
   Pages are lists of drawing operations in points, y measured down from the top of the sheet.
   Text uses the two base fonts every reader already has, so no font is embedded; images are
   embedded as their original JPEG bytes with DCTDecode, so nothing is re-compressed. */
const PDF = (() => {

  const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,
    667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,
    278,278,278,469,556,333,
    556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,
    334,260,334,584];
  const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,
    722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,
    333,278,333,584,556,333,
    556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,
    389,280,389,584];

  /* The base fonts are WinAnsi; anything outside it is folded to a plain equivalent
     rather than dropped, so a stray character never silently deletes a word. */
  const FOLD = {
    0x2018: "'", 0x2019: "'", 0x201C: '"', 0x201D: '"', 0x2013: '-', 0x2014: '-',
    0x2026: '...', 0x00A0: ' ', 0x00B0: ' deg', 0x00D7: 'x', 0x2022: '-', 0x2192: '->',
    0x00E9: 'e', 0x00E8: 'e', 0x00FC: 'u', 0x00F6: 'o', 0x00E4: 'a', 0x00DF: 'ss', 0x00F1: 'n'
  };
  function ascii(s) {
    let out = '';
    for (const ch of String(s == null ? '' : s)) {
      const c = ch.codePointAt(0);
      if (c >= 32 && c <= 126) out += ch;
      else if (FOLD[c]) out += FOLD[c];
      else if (c === 10 || c === 13) out += ' ';
      else out += ' ';
    }
    return out;
  }

  function width(s, size, bold) {
    const t = ascii(s), tbl = bold ? W_BOLD : W_REG;
    let w = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      w += (c >= 32 && c <= 126) ? tbl[c - 32] : 556;
    }
    return w * size / 1000;
  }

  /* Tc adds its tracking after every glyph, so a tracked run is wider than its glyph widths.
     Centring and right alignment have to measure the run the way the page will set it, or a
     tracked right aligned line walks off the margin one glyph at a time. */
  function advance(s, size, bold, tracking) {
    return width(s, size, bold) + (tracking ? tracking * ascii(s).length : 0);
  }

  /** Greedy wrap. Words longer than the measure are broken rather than allowed to overflow. */
  function wrap(s, size, bold, maxW, maxLines) {
    const words = ascii(s).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (let w of words) {
      while (width(w, size, bold) > maxW && w.length > 1) {
        let cut = w.length;
        while (cut > 1 && width(w.slice(0, cut), size, bold) > maxW) cut--;
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const t = cur ? cur + ' ' + w : w;
      if (cur && width(t, size, bold) > maxW) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      let last = kept[maxLines - 1];
      while (last.length > 1 && width(last + '...', size, bold) > maxW) last = last.slice(0, -1);
      kept[maxLines - 1] = last.replace(/[ ,.;:]+$/, '') + '...';
      return kept;
    }
    return lines;
  }

  const hex = c => {
    const h = String(c || '#000000').replace('#', '');
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  };
  const f = n => (Math.round(n * 100) / 100).toString();
  const esc = s => ascii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  /** Baseline width and height of a JPEG, plus its component count. */
  function jpegInfo(u8) {
    let i = 2;
    while (i < u8.length - 9) {
      if (u8[i] !== 0xFF) { i++; continue; }
      const m = u8[i + 1];
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      const len = (u8[i + 2] << 8) | u8[i + 3];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { h: (u8[i + 5] << 8) | u8[i + 6], w: (u8[i + 7] << 8) | u8[i + 8], n: u8[i + 9] };
      }
      i += 2 + len;
    }
    return null;
  }

  /* ── PDF assembly ── */

  function build(pages, opts) {
    const o = opts || {};
    const assets = o.assets || {};
    const PW = o.width || 595.28, PH = o.height || 841.89;

    // one XObject per image actually used
    const used = [];
    const seen = new Map();
    for (const pg of pages) for (const op of pg) {
      if (op.op === 'image' && assets[op.k] && assets[op.k].bytes && !seen.has(op.k)) {
        seen.set(op.k, 'Im' + used.length);
        used.push(op.k);
      }
    }

    const streams = pages.map(pg => content(pg, PH, seen));

    const objs = [];                       // 1-indexed on output
    const push = body => { objs.push(body); return objs.length; };

    const catalogId = 1, pagesId = 2;
    objs.push(null, null);                 // reserve 1 and 2

    const fontReg = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBold = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    const imgIds = {};
    for (const k of used) {
      const a = assets[k];
      const info = jpegInfo(a.bytes) || { w: a.w || 1, h: a.h || 1, n: 3 };
      const cs = info.n === 1 ? '/DeviceGray' : info.n === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      imgIds[k] = push({
        dict: `<< /Type /XObject /Subtype /Image /Width ${info.w} /Height ${info.h} ` +
              `/ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${a.bytes.length} >>`,
        stream: a.bytes
      });
    }

    let res = '<< /Font << /F1 ' + fontReg + ' 0 R /F2 ' + fontBold + ' 0 R >>';
    if (used.length) {
      res += ' /XObject << ' + used.map(k => '/' + seen.get(k) + ' ' + imgIds[k] + ' 0 R').join(' ') + ' >>';
    }
    res += ' >>';
    const resId = push(res);

    const pageIds = [];
    for (const s of streams) {
      const cid = push({ dict: `<< /Length ${s.length} >>`, stream: s });
      pageIds.push(push(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f(PW)} ${f(PH)}] ` +
                        `/Resources ${resId} 0 R /Contents ${cid} 0 R >>`));
    }

    objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] >>`;

    const now = new Date();
    const p2 = n => String(n).padStart(2, '0');
    const stamp = `D:${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}` +
                  `${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
    const infoId = push(`<< /Title (${esc(o.title || 'Report')}) /Author (${esc(o.author || '')}) ` +
                        `/Creator (Punchlist) /Producer (Punchlist) /CreationDate (${stamp}) >>`);

    /* serialise */
    const parts = [];
    let len = 0;
    const put = x => {
      if (typeof x === 'string') { const u = latin1(x); parts.push(u); len += u.length; }
      else { parts.push(x); len += x.length; }
    };
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const offsets = [0];
    for (let i = 0; i < objs.length; i++) {
      offsets[i + 1] = len;
      const b = objs[i];
      if (typeof b === 'string') put(`${i + 1} 0 obj\n${b}\nendobj\n`);
      else {
        put(`${i + 1} 0 obj\n${b.dict}\nstream\n`);
        put(b.stream);
        put('\nendstream\nendobj\n');
      }
    }
    const xref = len;
    let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objs.length; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    put(x);
    put(`trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

    const out = new Uint8Array(len);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  function latin1(s) {
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xFF;
    return u;
  }

  function content(ops, PH, imgNames) {
    const Y = y => PH - y;
    let s = '';
    let lastFill = null, lastStroke = null, lastLw = null;
    const setFill = c => { const k = c || '#000000'; if (k !== lastFill) { const [r, g, b] = hex(k); s += `${f(r)} ${f(g)} ${f(b)} rg\n`; lastFill = k; } };
    const setStroke = c => { const k = c || '#000000'; if (k !== lastStroke) { const [r, g, b] = hex(k); s += `${f(r)} ${f(g)} ${f(b)} RG\n`; lastStroke = k; } };
    const setLw = w => { if (w !== lastLw) { s += `${f(w)} w\n`; lastLw = w; } };

    for (const op of ops) {
      switch (op.op) {
        case 'rect': {
          const r = `${f(op.x)} ${f(Y(op.y + op.h))} ${f(op.w)} ${f(op.h)} re\n`;
          if (op.fill && op.stroke) { setFill(op.fill); setStroke(op.stroke); setLw(op.lw || .6); s += r + 'B\n'; }
          else if (op.fill) { setFill(op.fill); s += r + 'f\n'; }
          else if (op.stroke) { setStroke(op.stroke); setLw(op.lw || .6); s += r + 'S\n'; }
          break;
        }
        case 'line': {
          setStroke(op.stroke || '#000000'); setLw(op.lw || .6);
          s += `${f(op.x1)} ${f(Y(op.y1))} m ${f(op.x2)} ${f(Y(op.y2))} l S\n`;
          break;
        }
        case 'circle': {
          const k = op.r * 0.5523;
          const cx = op.cx, cy = Y(op.cy), r = op.r;
          s += `${f(cx - r)} ${f(cy)} m ` +
               `${f(cx - r)} ${f(cy + k)} ${f(cx - k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c ` +
               `${f(cx + k)} ${f(cy + r)} ${f(cx + r)} ${f(cy + k)} ${f(cx + r)} ${f(cy)} c ` +
               `${f(cx + r)} ${f(cy - k)} ${f(cx + k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c ` +
               `${f(cx - k)} ${f(cy - r)} ${f(cx - r)} ${f(cy - k)} ${f(cx - r)} ${f(cy)} c `;
          if (op.fill && op.stroke) { setFill(op.fill); setStroke(op.stroke); setLw(op.lw || .6); s += 'B\n'; }
          else if (op.fill) { setFill(op.fill); s += 'f\n'; }
          else { setStroke(op.stroke || '#000'); setLw(op.lw || .6); s += 'S\n'; }
          break;
        }
        case 'text': {
          const size = op.size || 10;
          const fnt = op.bold ? '/F2' : '/F1';
          const adv = advance(op.s, size, op.bold, op.tracking);
          let x = op.x;
          if (op.align === 'c') x -= adv / 2;
          else if (op.align === 'r') x -= adv;
          setFill(op.color || '#15181B');
          s += `BT ${fnt} ${f(size)} Tf`;
          if (op.tracking) s += ` ${f(op.tracking)} Tc`;
          s += ` 1 0 0 1 ${f(x)} ${f(Y(op.y))} Tm (${esc(op.s)}) Tj`;
          if (op.tracking) s += ' 0 Tc';
          s += ' ET\n';
          break;
        }
        case 'image': {
          const nm = imgNames.get(op.k);
          if (!nm) break;
          s += `q ${f(op.w)} 0 0 ${f(op.h)} ${f(op.x)} ${f(Y(op.y + op.h))} cm /${nm} Do Q\n`;
          break;
        }
      }
    }
    return latin1(s);
  }

  /* ── the same page, drawn to a canvas for the on-screen preview ── */
  function toCanvas(ops, cv, scale, assets) {
    const ctx = cv.getContext('2d');
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width / scale, cv.height / scale);
    ctx.textBaseline = 'alphabetic';
    for (const op of ops) {
      switch (op.op) {
        case 'rect':
          if (op.fill) { ctx.fillStyle = op.fill; ctx.fillRect(op.x, op.y, op.w, op.h); }
          if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = op.lw || .6; ctx.strokeRect(op.x, op.y, op.w, op.h); }
          break;
        case 'line':
          ctx.strokeStyle = op.stroke || '#000'; ctx.lineWidth = op.lw || .6;
          ctx.beginPath(); ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); ctx.stroke();
          break;
        case 'circle':
          ctx.beginPath(); ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
          if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(); }
          if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = op.lw || .6; ctx.stroke(); }
          break;
        case 'text': {
          const size = op.size || 10;
          ctx.font = `${op.bold ? '700' : '400'} ${size}px Helvetica, Arial, sans-serif`;
          ctx.fillStyle = op.color || '#15181B';
          const w = advance(op.s, size, op.bold, op.tracking);
          let x = op.x;
          if (op.align === 'c') x -= w / 2;
          else if (op.align === 'r') x -= w;
          const native = ctx.measureText(ascii(op.s)).width;
          // keep the preview honest: squeeze to the width the PDF will actually use
          if (native > 0.1 && Math.abs(native - w) / w > 0.02) {
            ctx.save(); ctx.translate(x, op.y); ctx.scale(w / native, 1);
            ctx.fillText(ascii(op.s), 0, 0); ctx.restore();
          } else ctx.fillText(ascii(op.s), x, op.y);
          break;
        }
        case 'image': {
          const a = assets[op.k];
          if (a && a.el) { try { ctx.drawImage(a.el, op.x, op.y, op.w, op.h); } catch (e) {} }
          break;
        }
      }
    }
    ctx.restore();
  }

  return { build, toCanvas, width, advance, wrap, ascii, jpegInfo, A4: { w: 595.28, h: 841.89 } };
})();
