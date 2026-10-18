/* The weekly review, written as nature writing with the numbers underneath.
   Sentences are chosen by a hash of the week, so a given week always reads the
   same way and the prose is not a slot machine. */
const Almanac = (() => {

  const fmt = m => {
    m = Math.round(m);
    if (m < 60) return m + ' minutes';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h}h ${r}m` : `${h} hours`;
  };
  /* hash32 returns an unsigned 32-bit value, so the callers' right shifts can go
     negative and index off the front of the array. Wrap it. */
  const pick = (arr, n) => arr[((n % arr.length) + arr.length) % arr.length];

  /** Groups the ledger into Monday weeks, newest first. */
  function weeks(state) {
    const map = new Map();
    for (const d of state.history) {
      const k = Store.weekOf(d.date);
      if (!map.has(k)) map.set(k, { start: k, days: [] });
      map.get(k).days.push(d);
    }
    const out = [];
    for (const w of map.values()) {
      const logged = w.days.filter(d => d.logged);
      const clean = logged.filter(d => d.clean);
      const feed = logged.reduce((a, d) => a + d.feed, 0);
      const still = w.days.reduce((a, d) => a + d.still, 0);
      const arrivals = [].concat(...w.days.map(d => d.arrivals));
      const withdrawals = [].concat(...w.days.map(d => d.withdrawals));
      const worst = logged.slice().sort((a, b) => b.feed - a.feed)[0] || null;
      const best = logged.slice().sort((a, b) => a.feed - b.feed)[0] || null;
      out.push({
        start: w.start, days: w.days,
        logged: logged.length, clean: clean.length, feed, still,
        arrivals, withdrawals, worst, best,
        graced: w.days.some(d => d.graced),
        endBlight: w.days[w.days.length - 1].blight
      });
    }
    out.sort((a, b) => a.start < b.start ? 1 : -1);
    for (let i = 0; i < out.length; i++) out[i].prev = out[i + 1] || null;
    return out;
  }

  const nm = id => Species.get(id) ? Species.get(id).name : id;

  function listNames(ids) {
    const names = ids.map(nm);
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  /** Three or four sentences about one week. */
  function prose(w) {
    const n = Paint.hash32(w.start);
    const out = [];

    if (w.logged === 0) {
      return ['Nothing was written down this week, so the valley has no record of it. It kept whatever it already had and waited.'];
    }

    /* A week with a day or two in it is usually the current week on a Monday. Calling that
       "almost the whole week" is a lie the reader can check against the seven cells above. */
    const ratio = w.clean / w.logged;
    if (w.logged <= 2) {
      const many = w.logged === 2;
      const held = w.clean === w.logged
        ? (many ? 'and both came in under the line' : 'and it came in under the line')
        : w.clean === 0
          ? (many ? 'and both went over it' : 'and it went over')
          : 'and one of the two came in under the line';
      out.push(`${many ? 'Two days' : 'One day'} of this week ${many ? 'are' : 'is'} written down, ${held}. ` +
               'There is not enough here yet to call it a week.');
    } else if (ratio >= 0.85) {
      out.push(pick([
        `${w.clean} clean days out of ${w.logged}. The meadow widened by roughly an afternoon and nothing had to be undone.`,
        `Almost the whole week stayed under the line. Ground that was bare in the spring is closing over, slowly, the way ground does.`,
        `${w.clean} of ${w.logged} days came in under the limit. A week like this is not dramatic. It is just how a valley fills.`
      ], n));
    } else if (ratio >= 0.5) {
      out.push(pick([
        `${w.clean} clean days out of ${w.logged}, which is the shape most weeks take. The growth was patchy and honest.`,
        `A mixed week. Some evenings the valley got the whole of you and some evenings it got what was left.`,
        `${w.clean} of ${w.logged} days held. The rest slid, and the edges of the valley show it.`
      ], n));
    } else {
      out.push(pick([
        `A hard week. ${w.clean} of ${w.logged} days came in under the line and the colour went out of the far ends of the valley.`,
        `The feeds took most of this week. That is worth writing down plainly, because the valley wrote it down too.`,
        `Only ${w.clean} clean ${w.clean === 1 ? 'day' : 'days'} in ${w.logged}. Nothing here is ruined. It is just quieter than it was.`
      ], n));
    }

    if (w.arrivals.length) {
      out.push(pick([
        `${listNames(w.arrivals)} arrived. Look for ${w.arrivals.length > 1 ? 'them' : 'it'} the next time you open the valley.`,
        `New this week: ${listNames(w.arrivals)}.`,
        `${listNames(w.arrivals)} came in, which means the conditions for ${w.arrivals.length > 1 ? 'them' : 'it'} finally held.`
      ], n >> 3));
    } else if (w.withdrawals.length === 0 && w.logged >= 4) {
      out.push(pick([
        'Nothing new arrived. Most weeks nothing new arrives, and the valley is still a little further on than it was.',
        'No arrivals this week. Things are still gathering under the surface where you cannot see them.',
        'Nobody new. That is the ordinary state of a wild place.'
      ], n >> 5));
    }

    if (w.withdrawals.length) {
      out.push(pick([
        `${listNames(w.withdrawals)} withdrew. Two clean days is usually enough to bring ${w.withdrawals.length > 1 ? 'them' : 'it'} back.`,
        `The valley lost ${listNames(w.withdrawals)} this week. Nothing is gone for good; the ledger still has the first-arrival date.`
      ], n >> 7));
    }

    if (w.graced) {
      out.push(pick([
        'Grace covered the first slip, as it does once a week. It is there because everybody has one.',
        'One day went over and grace took it. Nothing greyed, and nothing is owed.',
        'The week had its slip and grace absorbed it, which is what grace is for.'
      ], n >> 9));
    }

    const prev = w.prev;
    if (prev && prev.logged >= 3 && w.logged >= 3) {
      const a = w.feed / w.logged, b = prev.feed / prev.logged;
      const d = Math.round(a - b);
      if (Math.abs(d) >= 6) {
        out.push(d < 0
          ? `Daily average in the feeds: ${fmt(a)}, down ${fmt(-d)} on last week.`
          : `Daily average in the feeds: ${fmt(a)}, up ${fmt(d)} on last week.`);
      } else {
        out.push(`Daily average in the feeds: ${fmt(a)}, about the same as last week.`);
      }
    } else {
      out.push(`Daily average in the feeds: ${fmt(w.feed / Math.max(1, w.logged))}.`);
    }
    // last line stands alone; it is the only number in the piece
    return [out.slice(0, -1).join(' '), out[out.length - 1]];
  }

  function title(w) {
    const d = Store.parse(w.start);
    const end = Store.parse(Store.addDays(w.start, 6));
    const m1 = Store.MONTHS[d.getMonth()].slice(0, 3), m2 = Store.MONTHS[end.getMonth()].slice(0, 3);
    return m1 === m2 ? `${d.getDate()} to ${end.getDate()} ${m1}` : `${d.getDate()} ${m1} to ${end.getDate()} ${m2}`;
  }

  /** The hedgerow: one stem per day, dense where the week held. */
  function hedgerow(canvas, state, nWeeks) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const days = state.history.slice(-nWeeks * 7);
    if (!days.length) return;
    const base = h - 10;
    const step = w / days.length;
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      const x = i * step + step / 2;
      let v = 0.14, col = '#B9B4A4';
      if (d.logged) {
        v = Math.max(0.14, Math.min(1, 1 - d.feed / (state.limit * 2.2)));
        col = d.clean ? '#5E7C42' : '#A08A55';
      }
      const len = 10 + v * (base - 14);
      const lean = ((i % 5) - 2) * 1.1;
      g.strokeStyle = col; g.lineWidth = 2.1; g.lineCap = 'round';
      g.globalAlpha = d.logged ? 0.92 : 0.4;
      g.beginPath(); g.moveTo(x, base);
      g.quadraticCurveTo(x + lean * 0.4, base - len * 0.6, x + lean, base - len);
      g.stroke();
      if (d.arrivals.length) {
        g.globalAlpha = 1; g.fillStyle = '#C0872F';
        g.beginPath(); g.arc(x + lean, base - len - 3, 2.4, 0, 6.2832); g.fill();
      }
    }
    g.globalAlpha = 0.5; g.strokeStyle = '#C8C2B2'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, base + 0.5); g.lineTo(w, base + 0.5); g.stroke();
    g.globalAlpha = 1;
  }

  return { weeks, prose, title, hedgerow, fmt, listNames };
})();
