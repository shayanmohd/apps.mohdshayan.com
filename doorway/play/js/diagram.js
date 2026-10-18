/* Scale drawings made from the surveyed numbers, not from a photograph.
   A drawing appears wherever a photograph has not been taken, and beside one where it has.
   Everything drawn is a number somebody entered: if a number is missing, the drawing says so
   rather than guessing. The sheet under it is a blueprint grid and the doorway throws the same
   warm light the app's mark does, so a measured elevation still belongs to the same world. */
const Diagram = (() => {
  const INK = '#0F1A22', HAIR = '#CFDAE6', ACCENT = '#0B63C5', PAPER = 'rgba(255,255,255,0.94)',
        MUTED = '#46586B', WARN = '#8A5300', STOP = '#A32316',
        LIGHT = '#F6B25C', LIGHT_HI = '#FFE9C6', TREAD = '#DCE5EF';

  function fscale() {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs'));
    return v > 0 ? v : 1;
  }

  function setup(cv, w, h, fs) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    // The label type scales with the app's text size setting, which is the whole point of
    // offering one in an app about reading things.
    ctx.font = '700 ' + Math.round(11 * fs) + 'px "Atkinson Hyperlegible", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.__type = Math.round(11 * fs);
    return ctx;
  }

  /* The sheet: a faint grid, so a drawing reads as a measured thing rather than a picture. */
  function sheet(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = ACCENT; ctx.globalAlpha = 0.07; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 16) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (let y = 0; y <= h; y += 16) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();
    ctx.restore();
  }

  function chip(ctx, x, y, label, col) {
    const pad = 5;
    const w = ctx.measureText(label).width + pad * 2;
    const hh = (ctx.__type || 11) + 8;
    ctx.fillStyle = PAPER;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x - w / 2, y - hh / 2, w, hh, 4); ctx.fill(); }
    else ctx.fillRect(x - w / 2, y - hh / 2, w, hh);
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 1);
  }

  function dimH(ctx, x0, x1, y, label, col) {
    ctx.strokeStyle = col || MUTED; ctx.fillStyle = col || MUTED; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y - 4); ctx.lineTo(x0, y + 4);
    ctx.moveTo(x1, y - 4); ctx.lineTo(x1, y + 4);
    ctx.moveTo(x0, y); ctx.lineTo(x1, y);
    ctx.stroke();
    chip(ctx, (x0 + x1) / 2, y, label, col || MUTED);
  }

  function dimV(ctx, x, y0, y1, label, col) {
    ctx.strokeStyle = col || MUTED; ctx.fillStyle = col || MUTED; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 4, y0); ctx.lineTo(x + 4, y0);
    ctx.moveTo(x - 4, y1); ctx.lineTo(x + 4, y1);
    ctx.moveTo(x, y0); ctx.lineTo(x, y1);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 7, (y0 + y1) / 2);
  }

  /* Elevation of the way in. Vertical scale is real: a 200 cm doorway and a 14 cm step
     are drawn in the same units, which is the point of drawing it at all. */
  function entrance(cv, facts, opts) {
    const o = opts || {};
    const fs = o.fs || fscale();
    const W = o.width || 300, H = o.height || 220;
    const ctx = setup(cv, W, H, fs);
    const f = k => (facts[k] ? facts[k].v : undefined);

    sheet(ctx, W, H);

    const steps = f('entrance.steps') === undefined ? null : Number(f('entrance.steps'));
    const rise = f('entrance.step_height_cm') === undefined ? null : Number(f('entrance.step_height_cm'));
    const doorW = f('entrance.door_width_cm') === undefined ? null : Number(f('entrance.door_width_cm'));
    const ramp = f('entrance.ramp');
    const threshold = f('entrance.threshold');

    const DOOR_H = 203;
    const nSteps = steps === null ? 0 : Math.min(3, steps);
    const totalRise = nSteps ? (rise !== null ? rise * nSteps : 16 * nSteps) : 0;
    const sceneH = DOOR_H + totalRise + 34;
    const sceneW = 210;
    const k = Math.min((H - 30 - 12 * fs) / sceneH, (W - 30) / sceneW);
    const px = cm => cm * k;
    const baseY = H - 18 - 10 * fs;
    const cx = W / 2;

    const landing = baseY - px(totalRise);
    const dW = px(doorW !== null ? doorW : 78);
    const wallL = cx - dW / 2, wallR = cx + dW / 2;
    const head = landing - px(DOOR_H);

    // the light standing in the opening and landing on the ground in front of it
    const grad = ctx.createLinearGradient(0, head, 0, landing);
    grad.addColorStop(0, LIGHT_HI); grad.addColorStop(1, LIGHT);
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = grad;
    ctx.fillRect(wallL, head, dW, landing - head);
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.moveTo(wallL, landing); ctx.lineTo(wallR, landing);
    ctx.lineTo(wallR + px(46), baseY + 8); ctx.lineTo(wallL - px(46), baseY + 8);
    ctx.closePath();
    ctx.fillStyle = LIGHT; ctx.fill();
    ctx.globalAlpha = 1;

    // ground
    ctx.strokeStyle = HAIR; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(8, baseY); ctx.lineTo(W - 8, baseY); ctx.stroke();

    // steps, drawn as treads of 30 cm
    if (nSteps) {
      ctx.fillStyle = TREAD; ctx.strokeStyle = HAIR; ctx.lineWidth = 1;
      for (let i = 0; i < nSteps; i++) {
        const h = px(totalRise) * ((i + 1) / nSteps);
        const inset = px(30) * i;
        const x0 = cx - dW / 2 - px(26) + inset, x1 = cx + dW / 2 + px(26) - inset;
        ctx.fillRect(x0, baseY - h, x1 - x0, h);
        ctx.strokeRect(x0, baseY - h, x1 - x0, h);
      }
    }

    // ramp, drawn at the 1:12 gradient a permanent ramp is built to
    if (nSteps && (ramp === 'fixed' || ramp === 'portable')) {
      // Drawn at the 1:12 a permanent ramp is built to, or as much of it as the sheet holds.
      const run = px(totalRise) * 12;
      const toe = Math.max(8, cx - dW / 2 - px(26) - run);
      const top = cx - dW / 2 - px(4);
      ctx.fillStyle = ACCENT; ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.moveTo(toe, baseY); ctx.lineTo(top, landing); ctx.lineTo(top, baseY); ctx.closePath();
      ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 3.2;
      if (ramp === 'portable') ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(toe, baseY); ctx.lineTo(top, landing);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // wall and opening
    ctx.strokeStyle = INK; ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(wallL, landing); ctx.lineTo(wallL, head);
    ctx.lineTo(wallR, head); ctx.lineTo(wallR, landing);
    ctx.stroke();
    ctx.strokeStyle = HAIR; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wallL, head + 2); ctx.lineTo(Math.max(6, wallL - px(34)), head + 2);
    ctx.moveTo(wallR, head + 2); ctx.lineTo(Math.min(W - 6, wallR + px(34)), head + 2);
    ctx.stroke();

    // threshold lip
    if (threshold === 'high' || threshold === 'lip') {
      ctx.fillStyle = threshold === 'high' ? WARN : MUTED;
      const t = threshold === 'high' ? Math.max(2.5, px(3)) : 2;
      ctx.fillRect(wallL, landing - t, wallR - wallL, t);
    }

    // dimensions
    if (doorW !== null) dimH(ctx, wallL, wallR, head + px(DOOR_H) * 0.42, doorW + ' cm', INK);
    else {
      ctx.setLineDash([4, 3]);
      dimH(ctx, wallL, wallR, head + px(DOOR_H) * 0.42, 'not measured', MUTED);
      ctx.setLineDash([]);
    }
    if (nSteps) {
      const col = ramp === 'fixed' || ramp === 'lift' ? ACCENT : (rise === null ? MUTED : STOP);
      dimV(ctx, Math.min(W - 66 * fs, wallR + px(30)), baseY, landing,
        rise === null ? 'height unknown' : (nSteps > 1 ? totalRise + ' cm total' : rise + ' cm'), col);
    }
    if (ramp === 'lift' && nSteps) {
      ctx.fillStyle = ACCENT; ctx.textAlign = 'left';
      ctx.fillText('platform lift', 10, landing - 8);
    }

    // scale bar
    ctx.strokeStyle = MUTED; ctx.lineWidth = 1;
    const sy = H - 8;
    ctx.beginPath();
    ctx.moveTo(10, sy); ctx.lineTo(10 + px(100), sy);
    ctx.moveTo(10, sy - 4); ctx.lineTo(10, sy + 4);
    ctx.moveTo(10 + px(100), sy - 4); ctx.lineTo(10 + px(100), sy + 4);
    ctx.stroke();
    ctx.fillStyle = MUTED; ctx.textAlign = 'left';
    ctx.fillText('1 m', 14 + px(100), sy);
    return true;
  }

  /* Plan of the toilet. The 150 cm circle is the turning space a manual chair needs;
     whether it fits is the surveyor's judgement, and the drawing says which. */
  function bathroom(cv, facts, opts) {
    const o = opts || {};
    const fs = o.fs || fscale();
    const W = o.width || 300, H = o.height || 200;
    const ctx = setup(cv, W, H, fs);
    const f = k => (facts[k] ? facts[k].v : undefined);
    const bars = f('bathroom.grab_bars');
    const turn = f('bathroom.turning_space');
    const doorW = f('bathroom.door_width_cm');

    sheet(ctx, W, H);

    const room = { x: 26, y: 16, w: W - 52, h: H - 46 - 12 * fs };
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(room.x, room.y, room.w, room.h);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.8;
    ctx.strokeRect(room.x, room.y, room.w, room.h);

    // door opening on the near wall
    const dW = Math.min(room.w * 0.42, 96);
    const dx = room.x + room.w - dW - 14;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(dx, room.y + room.h); ctx.lineTo(dx + dW, room.y + room.h); ctx.stroke();
    ctx.strokeStyle = LIGHT; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(dx, room.y + room.h); ctx.lineTo(dx + dW, room.y + room.h); ctx.stroke();
    ctx.strokeStyle = HAIR; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(dx + dW, room.y + room.h, dW, Math.PI, Math.PI * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dx + dW, room.y + room.h); ctx.lineTo(dx + dW, room.y + room.h - dW); ctx.stroke();
    ctx.fillStyle = MUTED; ctx.textAlign = 'center';
    ctx.fillText(doorW !== undefined ? doorW + ' cm door' : 'door not measured', dx + dW / 2, room.y + room.h + 12 + 3 * fs);

    // pan against the left wall
    const px0 = room.x + 16, py0 = room.y + room.h * 0.34;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.fillStyle = '#EDF1F6';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px0, py0, 26, 38, 9); else ctx.rect(px0, py0, 26, 38);
    ctx.fill(); ctx.stroke();

    // grab bars
    const drawBar = (y, on) => {
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = on ? ACCENT : HAIR;
      if (!on) ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(px0 - 4, y); ctx.lineTo(px0 + 44, y); ctx.stroke();
      ctx.setLineDash([]);
    };
    if (bars !== undefined) {
      drawBar(py0 - 8, bars === 'both' || bars === 'one');
      drawBar(py0 + 46, bars === 'both');
      ctx.fillStyle = bars === 'none' ? STOP : MUTED; ctx.textAlign = 'left';
      ctx.fillText(bars === 'both' ? 'bars both sides' : bars === 'one' ? 'one bar' : 'no grab bars',
        px0, room.y + room.h - 12);
    }

    // turning circle
    if (turn !== undefined) {
      const r = Math.min(room.w, room.h) * (turn === 'roomy' ? 0.36 : turn === 'tight' ? 0.3 : 0.24);
      const ccx = room.x + room.w * 0.62, ccy = room.y + room.h * 0.46;
      const col = turn === 'roomy' ? ACCENT : turn === 'tight' ? WARN : STOP;
      ctx.globalAlpha = 0.08; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(ccx, ccy, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.setLineDash([6, 5]); ctx.lineWidth = 1.8; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(ccx, ccy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.textAlign = 'center';
      chip(ctx, ccx, ccy, turn === 'roomy' ? 'room to turn' : turn === 'tight' ? 'tight to turn' : 'no room to turn', col);
    }
    return true;
  }

  return { entrance, bathroom };
})();
