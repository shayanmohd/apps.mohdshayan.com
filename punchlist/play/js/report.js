/* Report layout. Produces a list of pages, each a list of drawing operations, plus the image
   assets they reference. The same page list is handed to the PDF writer and to the on-screen
   preview, so what you scroll through is what gets sent. */
const Report = (() => {
  const A4 = { w: 595.28, h: 841.89 };
  const M = 42;                       // page margin
  const CW = A4.w - M * 2;            // content width
  const TOP = M + 30;                 // first baseline area under the running head
  const BOT = A4.h - 46;              // floor above the running foot

  const INK = '#14161A', MUTED = '#4F555C', HAIR = '#D3CEC0', SOFT = '#EDEBE3', ACCENT = '#FFC400';

  const SEVHEX = { safety: '#A4161A', major: '#C2410C', normal: '#33404A', minor: '#5F676E' };
  const SEVNAME = { safety: 'Safety', major: 'Major', normal: 'Normal', minor: 'Minor' };
  const STNAME = { open: 'Open', assigned: 'Assigned', claimed: 'Fixed claimed', verified: 'Verified', closed: 'Closed' };

  function esc(s) { return PDF.ascii(s == null ? '' : s); }

  /* Hi-vis label: yellow is a block the eye lands on, never small yellow type on white. */
  function tag(cur, x, y, text, size) {
    const sz = size || 9, t = text.toUpperCase(), tr = 1.4;
    const w = PDF.advance(t, sz, true, tr) + 20;
    cur.push({ op: 'rect', x, y: y - sz - 2, w, h: sz + 8, fill: ACCENT });
    cur.push({ op: 'text', s: t, x: x + 10, y, size: sz, bold: true, color: INK, tracking: tr });
    return w;
  }

  /* ── assets ── */
  function makeImage(bytes) {
    return new Promise(res => {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
      // the decoded image outlives the blob URL, so the URL goes back either way
      const done = img => { URL.revokeObjectURL(url); res(img); };
      const img = new Image();
      img.onload = () => done(img);
      img.onerror = () => done(null);
      img.src = url;
    });
  }

  async function build(project, opts, onProgress) {
    const o = Object.assign({
      title: 'Snag list', conditions: '', grouping: 'room',
      cover: true, planmap: true, photos: true, crops: true, closed: false, trade: null
    }, opts || {});
    const org = Store.org();
    const prog = onProgress || (() => {});

    let list = Store.forProject(project.id, { includeClosed: o.closed, trade: o.trade });
    const assets = {};

    async function addMedia(key, mediaId) {
      if (assets[key] || !mediaId) return assets[key] || null;
      const rec = await Media.get(mediaId);
      if (!rec) return null;
      const el = await makeImage(rec.bytes);
      // stored, but not a decodable image: leave it out rather than embed broken bytes
      if (!el) return null;
      assets[key] = { bytes: rec.bytes, el, w: rec.w, h: rec.h };
      return assets[key];
    }
    async function addCanvas(key, cv) {
      if (!cv) return null;
      assets[key] = { bytes: Media.canvasBytes(cv, .78), el: cv, w: cv.width, h: cv.height };
      return assets[key];
    }

    /* gather what the pages need */
    const steps = 1 + (o.planmap ? project.plans.length : 0) + list.length;
    let step = 0;
    const tick = () => prog(Math.min(0.98, ++step / Math.max(1, steps)));

    if (org.logo) await addMedia('logo', org.logo);
    tick();

    const planById = {};
    for (const pl of project.plans) planById[pl.id] = pl;
    if (o.planmap) {
      for (const pl of project.plans) { await addMedia('plan:' + pl.id, pl.media); tick(); }
    }
    for (const d of list) {
      if (o.photos) {
        for (let i = 0; i < Math.min(4, d.photos.length); i++) await addMedia('ph:' + d.photos[i].media, d.photos[i].media);
      }
      if (o.crops) {
        const pl = planById[d.planId];
        if (pl && pl.media) {
          const cv = await Media.cropAround(pl.media, d.x, d.y, .33, 380);
          if (cv) await addCanvas('crop:' + d.id, cv);
        }
      }
      tick();
    }

    /* ── page flow ── */
    const pages = [];
    let cur = null, y = 0;

    function newPage(head) {
      cur = [];
      pages.push(cur);
      y = TOP;
      if (head !== false) runningHead();
    }
    function runningHead() {
      const left = esc(org.name || project.name);
      cur.push({ op: 'text', s: left.toUpperCase(), x: M, y: M - 10, size: 7.5, bold: true, color: MUTED, tracking: .8 });
      cur.push({ op: 'text', s: esc(o.title), x: A4.w - M, y: M - 10, size: 7.5, color: MUTED, align: 'r', tracking: .5 });
      cur.push({ op: 'line', x1: M, y1: M - 4, x2: A4.w - M, y2: M - 4, stroke: HAIR, lw: .7 });
    }
    function need(h) { if (y + h > BOT) newPage(); }

    /* ── cover ── */
    if (o.cover) {
      newPage(false);
      let cy = M + 6;
      const logo = assets.logo;
      if (logo) {
        const maxW = 150, maxH = 60;
        const k = Math.min(maxW / logo.w, maxH / logo.h);
        const lw = logo.w * k, lh = logo.h * k;
        cur.push({ op: 'image', k: 'logo', x: M, y: cy, w: lw, h: lh });
        cy += lh + 14;
      }
      if (org.name) {
        cur.push({ op: 'text', s: esc(org.name), x: M, y: cy + 12, size: 13, bold: true, color: INK });
        cy += 20;
      }
      cy += 10;
      cur.push({ op: 'line', x1: M, y1: cy, x2: A4.w - M, y2: cy, stroke: INK, lw: 2 });
      cy += 54;

      tag(cur, M, cy, esc(o.title), 9);
      cy += 34;
      for (const ln of PDF.wrap(project.name, 30, true, CW, 3)) {
        cur.push({ op: 'text', s: ln, x: M, y: cy, size: 30, bold: true, color: INK });
        cy += 35;
      }
      cy += 6;
      if (project.address) {
        for (const ln of PDF.wrap(project.address, 12.5, false, CW * .8, 2)) {
          cur.push({ op: 'text', s: ln, x: M, y: cy, size: 12.5, color: MUTED });
          cy += 17;
        }
      }

      cy += 34;
      const rows = [
        ['Client', project.client || 'Not recorded'],
        ['Reference', project.ref || 'Not recorded'],
        ['Report date', Store.longDate(Store.today())],
        ['Conditions', o.conditions || 'Not recorded'],
        ['Prepared by', org.name || 'Not recorded']
      ];
      for (const [k, v] of rows) {
        cur.push({ op: 'line', x1: M, y1: cy - 13, x2: A4.w - M, y2: cy - 13, stroke: HAIR, lw: .7 });
        cur.push({ op: 'text', s: k.toUpperCase(), x: M, y: cy, size: 7.5, bold: true, color: MUTED, tracking: .9 });
        cur.push({ op: 'text', s: esc(v), x: M + 130, y: cy, size: 11, color: INK });
        cy += 26;
      }
      cur.push({ op: 'line', x1: M, y1: cy - 13, x2: A4.w - M, y2: cy - 13, stroke: HAIR, lw: .7 });

      /* count blocks */
      cy += 34;
      cur.push({ op: 'text', s: 'DEFECTS IN THIS REPORT', x: M, y: cy, size: 7.5, bold: true, color: MUTED, tracking: .9 });
      cy += 18;
      const counts = {};
      for (const d of list) counts[d.severity] = (counts[d.severity] || 0) + 1;
      const order = ['safety', 'major', 'normal', 'minor'];
      const bw = (CW - 3 * 10) / 4;
      order.forEach((k, i) => {
        const x = M + i * (bw + 10);
        cur.push({ op: 'rect', x, y: cy, w: bw, h: 58, fill: SOFT });
        cur.push({ op: 'rect', x, y: cy, w: bw, h: 4, fill: SEVHEX[k] });
        cur.push({ op: 'text', s: String(counts[k] || 0), x: x + 12, y: cy + 38, size: 26, bold: true, color: INK });
        cur.push({ op: 'text', s: SEVNAME[k].toUpperCase(), x: x + 12, y: cy + 52, size: 7, bold: true, color: MUTED, tracking: .7 });
      });
      cy += 58 + 24;
      const openN = list.filter(d => !Store.isDone(d.status)).length;
      cur.push({ op: 'text', s: `${list.length} defect${list.length === 1 ? '' : 's'} listed, ${openN} still open.`,
                 x: M, y: cy, size: 11, color: INK });
      if (o.trade) {
        cy += 17;
        cur.push({ op: 'text', s: `Filtered to ${esc(o.trade)} only. Numbers match the full report.`, x: M, y: cy, size: 10, color: MUTED });
      }

      /* cover foot */
      const fy = A4.h - 58;
      cur.push({ op: 'line', x1: M, y1: fy, x2: A4.w - M, y2: fy, stroke: HAIR, lw: .7 });
      if (org.footer) cur.push({ op: 'text', s: esc(org.footer), x: M, y: fy + 16, size: 9, color: MUTED });
      if (project.ref) cur.push({ op: 'text', s: esc(project.ref), x: A4.w - M, y: fy + 16, size: 9, color: MUTED, align: 'r' });
    }

    /* ── pin maps ── */
    if (o.planmap) {
      for (const pl of project.plans) {
        const a = assets['plan:' + pl.id];
        if (!a) continue;
        const pins = list.filter(d => d.planId === pl.id);
        newPage();
        tag(cur, M, y + 4, 'Pin map', 7.5);
        cur.push({ op: 'text', s: esc(pl.label), x: M, y: y + 28, size: 19, bold: true, color: INK });
        cur.push({ op: 'text', s: `${pins.length} defect${pins.length === 1 ? '' : 's'} on this plan`,
                   x: A4.w - M, y: y + 28, size: 10, color: MUTED, align: 'r' });
        let py = y + 48;

        const boxH = BOT - py - 40;
        const k = Math.min(CW / a.w, boxH / a.h);
        const iw = a.w * k, ih = a.h * k;
        const ix = M + (CW - iw) / 2, iy = py;
        cur.push({ op: 'rect', x: ix, y: iy, w: iw, h: ih, fill: '#FFFFFF', stroke: HAIR, lw: .7 });
        cur.push({ op: 'image', k: 'plan:' + pl.id, x: ix, y: iy, w: iw, h: ih });

        for (const d of pins) {
          const cx = ix + d.x * iw, cy2 = iy + d.y * ih;
          const done = Store.isDone(d.status);
          cur.push({ op: 'circle', cx, cy: cy2, r: 8.5,
                     fill: done ? '#FFFFFF' : SEVHEX[d.severity], stroke: done ? '#33404A' : '#FFFFFF', lw: 1.4 });
          cur.push({ op: 'text', s: String(d.n), x: cx, y: cy2 + 2.9, size: 7.5, bold: true,
                     color: done ? '#33404A' : '#FFFFFF', align: 'c' });
        }

        const ly = iy + ih + 20;
        let lx = M;
        for (const s of ['safety', 'major', 'normal', 'minor']) {
          cur.push({ op: 'circle', cx: lx + 5, cy: ly - 3, r: 5, fill: SEVHEX[s] });
          cur.push({ op: 'text', s: SEVNAME[s], x: lx + 14, y: ly, size: 8.5, color: MUTED });
          lx += 14 + PDF.width(SEVNAME[s], 8.5, false) + 18;
        }
        cur.push({ op: 'circle', cx: lx + 5, cy: ly - 3, r: 5, fill: '#FFFFFF', stroke: '#33404A', lw: 1 });
        cur.push({ op: 'text', s: 'Closed out', x: lx + 14, y: ly, size: 8.5, color: MUTED });
      }
    }

    /* ── grouped entries ── */
    const groups = groupBy(list, o.grouping, project);
    newPage();

    for (const g of groups) {
      need(210);
      cur.push({ op: 'rect', x: M, y: y - 2, w: CW, h: 24, fill: SOFT });
      cur.push({ op: 'rect', x: M, y: y - 2, w: 3, h: 24, fill: g.hex || ACCENT });
      cur.push({ op: 'text', s: esc(g.label).toUpperCase(), x: M + 12, y: y + 14, size: 8.5, bold: true, color: INK, tracking: 1 });
      cur.push({ op: 'text', s: `${g.items.length}`, x: A4.w - M - 10, y: y + 14, size: 8.5, bold: true, color: MUTED, align: 'r' });
      y += 34;

      for (const d of g.items) {
        // the note goes in whole: a defect cut off at three lines is an argument on site
        const noteLines = PDF.wrap(d.note || 'No note recorded', 11, true, CW - 46);
        const photoIds = o.photos ? d.photos.slice(0, 3).map(p => 'ph:' + p.media).filter(k => assets[k]) : [];
        const cropKey = o.crops && assets['crop:' + d.id] ? 'crop:' + d.id : null;
        const imgH = (photoIds.length || cropKey) ? 96 : 0;
        const cardH = 22 + noteLines.length * 14 + 16 + (imgH ? imgH + 12 : 0) + 14;
        need(cardH);

        const top = y;
        /* number badge */
        const bw2 = Math.max(30, PDF.width(String(d.n), 13, true) + 16);
        cur.push({ op: 'rect', x: M, y: top, w: bw2, h: 22, fill: SEVHEX[d.severity] });
        cur.push({ op: 'text', s: String(d.n), x: M + bw2 / 2, y: top + 16, size: 13, bold: true, color: '#FFFFFF', align: 'c' });

        let ty = top + 15;
        for (const ln of noteLines) {
          cur.push({ op: 'text', s: ln, x: M + bw2 + 12, y: ty, size: 11, bold: true, color: INK });
          ty += 14;
        }

        /* meta line */
        const bits = [];
        bits.push(d.trade || 'Unassigned');
        if (d.room) bits.push(d.room);
        bits.push(SEVNAME[d.severity]);
        bits.push(STNAME[d.status]);
        if (d.due) bits.push('Due ' + Store.shortDate(d.due));
        const who = d.assignee ? Store.contact(d.assignee) : null;
        if (who) bits.push(who.name || who.company);
        ty += 3;
        // one line, cut to the column rather than allowed to run off the sheet
        const meta = PDF.wrap(bits.join('   /   '), 8.5, false, CW - bw2 - 12, 1)[0] || '';
        cur.push({ op: 'text', s: meta, x: M + bw2 + 12, y: ty, size: 8.5, color: MUTED });
        ty += 12;

        /* images */
        if (imgH) {
          let ix = M + bw2 + 12;
          const slotW = 128;
          for (const key of photoIds) {
            const a = assets[key];
            const k2 = Math.min(slotW / a.w, imgH / a.h);
            const w = a.w * k2, h = a.h * k2;
            cur.push({ op: 'rect', x: ix, y: ty, w: slotW, h: imgH, fill: '#FFFFFF', stroke: HAIR, lw: .5 });
            cur.push({ op: 'image', k: key, x: ix + (slotW - w) / 2, y: ty + (imgH - h) / 2, w, h });
            ix += slotW + 8;
          }
          if (cropKey) {
            cur.push({ op: 'rect', x: ix, y: ty, w: imgH, h: imgH, fill: '#FFFFFF', stroke: HAIR, lw: .5 });
            cur.push({ op: 'image', k: cropKey, x: ix, y: ty, w: imgH, h: imgH });
            cur.push({ op: 'text', s: 'LOCATION', x: ix + imgH / 2, y: ty + imgH + 9, size: 6.5, bold: true, color: MUTED, align: 'c', tracking: .6 });
          }
          const roles = d.photos.slice(0, 3).map(p => p.role);
          if (roles.includes('after')) {
            let lx2 = M + bw2 + 12;
            for (let i = 0; i < photoIds.length; i++) {
              cur.push({ op: 'text', s: roles[i] === 'after' ? 'AFTER' : 'BEFORE',
                         x: lx2 + slotW / 2, y: ty + imgH + 9, size: 6.5, bold: true, color: MUTED, align: 'c', tracking: .6 });
              lx2 += slotW + 8;
            }
          }
          ty += imgH + 12;
        }

        y = Math.max(ty, top + 30) + 12;
        cur.push({ op: 'line', x1: M, y1: y - 6, x2: A4.w - M, y2: y - 6, stroke: '#E4E1DA', lw: .6 });
      }
      y += 12;
    }

    if (!list.length) {
      cur.push({ op: 'text', s: 'No defects match this report.', x: M, y: y + 6, size: 12, color: MUTED });
    }

    /* ── running feet ── */
    const n = pages.length;
    pages.forEach((pg, i) => {
      if (i === 0 && o.cover) return;
      const fy = A4.h - 30;
      pg.push({ op: 'line', x1: M, y1: fy - 12, x2: A4.w - M, y2: fy - 12, stroke: HAIR, lw: .7 });
      pg.push({ op: 'text', s: esc(project.name), x: M, y: fy, size: 8, color: MUTED });
      pg.push({ op: 'text', s: `Page ${i + 1} of ${n}`, x: A4.w - M, y: fy, size: 8, color: MUTED, align: 'r' });
    });

    prog(1);
    return { pages, assets, count: list.length, title: o.title, project };
  }

  function groupBy(list, mode, project) {
    if (mode === 'none' || !mode) return [{ label: 'All defects', items: list }];
    if (mode === 'severity') {
      return ['safety', 'major', 'normal', 'minor'].map(k => ({
        label: SEVNAME[k] + ' defects', hex: SEVHEX[k], items: list.filter(d => d.severity === k)
      })).filter(g => g.items.length);
    }
    const key = mode === 'trade' ? (d => d.trade || 'Unassigned')
              : mode === 'plan' ? (d => { const p = project.plans.find(x => x.id === d.planId); return p ? p.label : 'No plan'; })
              : (d => d.room || 'Location not recorded');
    const map = new Map();
    for (const d of list) {
      const k = key(d);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(d);
    }
    const keys = [...map.keys()].sort((a, b) => {
      const au = /not recorded|unassigned/i.test(a), bu = /not recorded|unassigned/i.test(b);
      if (au !== bu) return au ? 1 : -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
    return keys.map(k => ({ label: k, items: map.get(k) }));
  }

  function toBytes(doc) {
    return PDF.build(doc.pages, {
      assets: doc.assets, title: doc.title,
      author: Store.org().name || 'Punchlist', width: A4.w, height: A4.h
    });
  }

  return { build, toBytes, A4 };
})();
