/* Photo mode. Renders the valley into a shareable card. The footer shows what
   grew, never what was lost, because a picture of your own screen time posted
   in public should not be a confession. */
const Card = (() => {
  const W = 1080, H = 1350, VH = 900;

  const HOURS = [
    { h: 6,  label: 'First light' },
    { h: 9,  label: 'Morning' },
    { h: 13, label: 'Midday' },
    { h: 18, label: 'Evening' },
    { h: 21, label: 'Dusk' },
    { h: 23, label: 'Night' }
  ];

  function render(state, opt) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    const d = new Date();
    d.setHours(opt.hour, opt.hour === 6 ? 40 : 10, 0, 0);

    g.save();
    g.beginPath(); g.rect(0, 0, W, VH); g.clip();
    Valley.renderTo(g, W, VH, { wide: opt.wide, x: opt.x, date: d, t: 7.3 });
    g.restore();

    const paper = '#F2EDE1', ink = '#1F2419', soft = '#5E6353', hair = '#D3CCBA';
    g.fillStyle = paper; g.fillRect(0, VH, W, H - VH);
    g.fillStyle = hair; g.fillRect(0, VH, W, 3);

    const weeks = Almanac.weeks(state);
    const w = weeks[0];
    const pad = 74;
    let y = VH + 92;

    g.fillStyle = soft;
    g.font = '500 25px Archivo, system-ui, sans-serif';
    g.letterSpacing = '3px';
    g.fillText('WILDERGARDEN', pad, y);
    const dl = Store.longDate(state.today).toUpperCase();
    g.textAlign = 'right'; g.fillText(dl, W - pad, y); g.textAlign = 'left';
    g.letterSpacing = '0px';

    y += 78;
    g.fillStyle = ink;
    g.font = '600 62px Literata, Georgia, serif';
    const head = opt.caption || headline(state);
    for (const line of wrap(g, head, W - pad * 2).slice(0, 2)) { g.fillText(line, pad, y); y += 72; }

    y += 14;
    g.strokeStyle = hair; g.lineWidth = 2;
    g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke();

    y += 62;
    const stats = [
      [String(state.residentCount), state.residentCount === 1 ? 'species here' : 'species here'],
      [w ? `${w.clean}/${w.logged || 0}` : '0/0', 'clean days this week'],
      [String(state.cleanDays), state.cleanDays === 1 ? 'clean day in all' : 'clean days in all']
    ];
    const colw = (W - pad * 2) / 3;
    for (let i = 0; i < stats.length; i++) {
      const x = pad + i * colw;
      g.fillStyle = ink; g.font = '600 46px Literata, Georgia, serif';
      g.fillText(stats[i][0], x, y);
      g.fillStyle = soft; g.font = '400 24px Archivo, system-ui, sans-serif';
      g.fillText(stats[i][1], x, y + 34);
    }
    return c;
  }

  function headline(state) {
    const last = state.arrivals[state.arrivals.length - 1];
    if (last && Store.diffDays(last.date, state.today) <= 6) {
      return `${Species.get(last.id).name} came back to the valley.`;
    }
    if (state.blight > 20) return 'The far ends are grey. The middle is holding.';
    if (state.streak >= 5) return `${state.streak} days under the line, and the valley shows it.`;
    if (state.residentCount >= 20) return 'Grown entirely out of hours nobody was watching.';
    return 'It grows when the phone is down.';
  }

  function wrap(g, text, max) {
    const words = String(text).split(' ');
    const lines = []; let cur = '';
    for (const wd of words) {
      const t = (cur + ' ' + wd).trim();
      if (g.measureText(t).width > max && cur) { lines.push(cur); cur = wd; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  return { render, HOURS, W, H, headline };
})();
