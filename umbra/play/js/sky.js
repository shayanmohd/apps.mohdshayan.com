/* Umbra: the model layer. Turns the ephemeris kernel and the authored tables into the
   things a person actually asks: how dark does it get, what is up, and is tonight worth it.

   Every number here is computed on the device when you look at it. Nothing is fetched,
   and nothing is stored in a table of pre-baked answers.                                */
const Sky = (() => {
  const A = Astro, D = Data;
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const jdOf = t => A.jdFromMs(t);
  const msOf = jd => A.msFromJd(jd);

  /* The Moon's apparent rise happens when its centre is 0.125 degrees above the geometric
     horizon: refraction lifts it 34 arcminutes, its own parallax and semidiameter give the
     rest back. Meeus, chapter 15. */
  const MOON_H0 = 0.125, SUN_H0 = -0.833;

  /* ---------------- clocks ----------------
     A night has to be anchored on the place, not on the phone. For the place you are standing
     in they are the same thing and the device clock wins, daylight saving included. For a place
     on the other side of the world the phone's midday is the middle of their night, so Umbra
     falls back to mean solar time from the longitude and says plainly that it is approximate. */

  function offsetFor(place, t) {
    const dev = -new Date(t || Date.now()).getTimezoneOffset() * 60000;
    const solar = Math.round(place.lon / 15) * HOUR;
    if (Math.abs(dev - solar) <= 3 * HOUR) return { ms: dev, approx: false };
    return { ms: solar, approx: true };
  }
  /** Fractional hour of the day at the place, 0 to 24. */
  function hourAt(t, place) {
    const off = offsetFor(place, t).ms;
    const d = new Date(t + off);
    return d.getUTCHours() + d.getUTCMinutes() / 60;
  }

  /* ---------------- the night ---------------- */

  /** The local noon that starts the night containing t. Before midday, the night began yesterday. */
  function anchorFor(t, place) {
    const off = place ? offsetFor(place, t).ms : -new Date(t).getTimezoneOffset() * 60000;
    const local = t + off;
    let anchor = Math.floor(local / DAY) * DAY + 12 * HOUR;
    if (local < anchor) anchor -= DAY;
    return anchor - off;
  }
  const dayKey = (t, place) => {
    const off = place ? offsetFor(place, t).ms : 0;
    return new Date(t + off).toISOString().slice(0, 10);
  };

  function sunCrossings(place, j0, j1, h) {
    return A.crossings(A.sun, j0, j1, place.lat, place.lon, h, 8);
  }
  const firstFall = list => { const c = list.find(c => !c.rising); return c ? msOf(c.jd) : null; };
  const lastRise = list => { const c = list.slice().reverse().find(c => c.rising); return c ? msOf(c.jd) : null; };

  /** Everything about one night at one place. Pure, and cached by the caller. */
  function night(place, whenMs) {
    const t0 = anchorFor(whenMs, place), t1 = t0 + DAY;
    const j0 = jdOf(t0), j1 = jdOf(t1);
    const lat = place.lat, lon = place.lon;

    const bands = {};
    for (const [name, h] of [['day', SUN_H0], ['civil', -6], ['nautical', -12], ['astro', -18]]) {
      const cr = sunCrossings(place, j0, j1, h);
      bands[name] = { end: firstFall(cr), start: lastRise(cr) };
    }
    const midnight = t0 + 12 * HOUR;
    const sunAltMid = A.altaz(A.sun(jdOf(midnight)).ra, A.sun(jdOf(midnight)).dec, jdOf(midnight), lat, lon).alt;

    // The darkest state the night reaches, and the window that state lasts.
    let dark = null, quality = 'none';
    if (bands.astro.end && bands.astro.start) { dark = { from: bands.astro.end, to: bands.astro.start }; quality = 'astronomical'; }
    else if (sunAltMid < -18) { dark = { from: t0 + 6 * HOUR, to: t0 + 18 * HOUR }; quality = 'astronomical'; }
    else if (bands.nautical.end && bands.nautical.start) { dark = { from: bands.nautical.end, to: bands.nautical.start }; quality = 'nautical'; }
    else if (sunAltMid < -12) { dark = { from: t0 + 6 * HOUR, to: t0 + 18 * HOUR }; quality = 'nautical'; }
    else if (bands.civil.end && bands.civil.start) { dark = { from: bands.civil.end, to: bands.civil.start }; quality = 'civil'; }
    if (dark && dark.to <= dark.from) { dark = null; quality = 'none'; }
    const darkHours = dark ? (dark.to - dark.from) / HOUR : 0;

    // The Moon across the same window.
    const mcr = A.crossings(A.moon, j0, j1, lat, lon, MOON_H0, 8);
    const mrise = mcr.filter(c => c.rising).map(c => msOf(c.jd));
    const mset = mcr.filter(c => !c.rising).map(c => msOf(c.jd));
    const ph = A.moonPhase(jdOf(midnight));
    let upFrac = 0, meanSin = 0, maxAlt = -90;
    if (dark) {
      const N = 24;
      for (let i = 0; i <= N; i++) {
        const t = dark.from + (dark.to - dark.from) * i / N, j = jdOf(t);
        const m = A.moon(j), a = A.altaz(m.ra, m.dec, j, lat, lon).alt;
        if (a > maxAlt) maxAlt = a;
        if (a > 0) { upFrac += 1 / (N + 1); meanSin += Math.sin(a * A.D2R) / (N + 1); }
      }
    }
    /* Moonlight costs you magnitudes. A full Moon high in the sky takes about three off the
       naked eye limit at a dark site; this scales that with phase and altitude. It is an
       approximation, and the app says so on the Method screen. */
    const penalty = ph.illum > 0 && meanSin > 0
      ? 3.0 * Math.pow(ph.illum, 1.6) * Math.pow(meanSin, 0.5) : 0;
    const bortle = D.BORTLE[place.bortle] || D.BORTLE[6];
    const lm = clamp(bortle.lm - penalty, 2, 8);

    const moon = { rise: mrise[0] || null, set: mset[0] || null, allRises: mrise, allSets: mset,
                   illum: ph.illum, name: ph.name, waxing: ph.waxing, upFrac, maxAlt,
                   penalty, dist: A.moon(jdOf(midnight)).dist };

    return { place, t0, t1, midnight, bands, dark, quality, darkHours, moon, bortle, lm,
             sunAltMid, off: offsetFor(place, midnight), key: place.id + '|' + dayKey(t0, place) };
  }

  /* ---------------- meteors ---------------- */

  /** Radiant, drifted zenithal rate and the rate you would actually see, at one instant. */
  function showerAt(sh, tMs, place, lm) {
    const jd = jdOf(tMs);
    const dl = A.norm180(A.solarLongitude(jd) - sh.lam);
    const zhr = sh.zhr * Math.pow(10, -sh.B * Math.abs(dl));
    const ra = A.norm(sh.ra + sh.dra * dl), dec = clamp(sh.dec + sh.ddec * dl, -89.9, 89.9);
    const aa = A.altaz(ra, dec, jd, place.lat, place.lon);
    const rate = aa.alt <= 3 ? 0 : zhr * Math.sin(aa.alt * A.D2R) * Math.pow(sh.r, lm - 6.5);
    return { zhr, rate, alt: aa.alt, az: aa.az, ra, dec, dl };
  }

  const showerActive = (sh, tMs) => {
    const l = A.solarLongitude(jdOf(tMs));
    return A.norm180(l - sh.from) >= 0 && A.norm180(l - sh.to) <= 0;
  };

  /** The best moment of one night for one shower, sampled across the usable dark hours. */
  function showerBest(sh, n) {
    const win = n.dark || { from: n.bands.civil.end || n.t0 + 8 * HOUR, to: n.bands.civil.start || n.t0 + 16 * HOUR };
    let best = null;
    const N = 20;
    for (let i = 0; i <= N; i++) {
      const t = win.from + (win.to - win.from) * i / N;
      const s = showerAt(sh, t, n.place, n.lm);
      if (!best || s.rate > best.rate) best = { ...s, at: t };
    }
    return best;
  }

  /** The time within a year when a shower peaks, as a real instant rather than a calendar note. */
  function showerPeak(sh, nearMs) {
    return msOf(A.whenSolarLongitude(sh.lam, jdOf(nearMs)));
  }

  /** A peak lands at some hour of some day; the two nights around it are rarely equal.
      Returns both, better first, so the app can name the night rather than the instant. */
  function showerNights(sh, peakMs, place) {
    const a = anchorFor(peakMs, place), out = [];
    for (const t0 of [a - DAY, a, a + DAY]) {
      const n = night(place, t0 + 18 * HOUR);
      const best = showerBest(sh, n);
      out.push({ ...best, night: n });
    }
    out.sort((x, y) => y.rate - x.rate);
    return out.slice(0, 2);
  }

  /* ---------------- planets, targets, the galaxy ---------------- */

  const PLANET_KEYS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus'];

  function planetsFor(n) {
    const win = n.dark || { from: n.bands.civil.end || n.t0 + 8 * HOUR, to: n.bands.civil.start || n.t0 + 16 * HOUR };
    const out = [];
    for (const key of PLANET_KEYS) {
      const fn = t => A.planet(key, t);
      let best = { alt: -90, at: win.from }, mag = 0, elong = 0, sample = null;
      const N = 24;
      /* The best moment is judged between civil dusk and civil dawn: an object at its highest
         two minutes before sunrise is not a thing anyone can look at, and Venus and Mercury
         genuinely do live in civil twilight. */
      const from = n.bands.civil.end || n.bands.day.end || win.from;
      const to = n.bands.civil.start || n.bands.day.start || win.to;
      for (let i = 0; i <= N; i++) {
        const t = from + (to - from) * i / N, j = jdOf(t);
        const p = A.planet(key, j);
        const aa = A.altaz(p.ra, p.dec, j, n.place.lat, n.place.lon);
        if (aa.alt > best.alt) { best = { alt: aa.alt, az: aa.az, at: t }; sample = p; }
        mag = p.mag; elong = p.elong;
      }
      const cr = A.crossings(fn, jdOf(n.t0), jdOf(n.t1), n.place.lat, n.place.lon, 0, 12);
      const rise = cr.find(c => c.rising), set = cr.find(c => !c.rising);
      const visible = best.alt > 8 && elong > (key === 'mercury' ? 12 : key === 'venus' ? 12 : 8);
      const naked = key !== 'uranus';
      out.push({ key, name: A.PLANETS[key].name, mag: sample ? sample.mag : mag, elong,
                 alt: best.alt, az: best.az, at: best.at, naked,
                 rise: rise ? msOf(rise.jd) : null, set: set ? msOf(set.jd) : null,
                 visible, verdict: planetVerdict(key, best, elong, n) });
    }
    return out;
  }
  function planetVerdict(key, best, elong, n) {
    if (elong < 10) return 'Too close to the Sun this month';
    if (best.alt < 5) return 'Below the horizon all night';
    if (best.alt < 12) return 'Very low, and only briefly';
    const dawn = n.bands.astro.start || n.bands.nautical.start || n.t1;
    const dusk = n.bands.astro.end || n.bands.nautical.end || n.t0;
    if (best.at > n.midnight + 2 * HOUR) return 'A morning object, best before dawn';
    if (best.at < dusk + 30 * MIN) return 'Low in the evening, sets early';
    return 'Well placed';
  }

  const GALACTIC_CORE = { ra: 266.4, dec: -28.9 };
  function coreFor(n) {
    if (!n.dark) return { alt: -90, at: n.midnight, visible: false };
    let best = { alt: -90, at: n.dark.from };
    for (let i = 0; i <= 16; i++) {
      const t = n.dark.from + (n.dark.to - n.dark.from) * i / 16, j = jdOf(t);
      const aa = A.altaz(GALACTIC_CORE.ra, GALACTIC_CORE.dec, j, n.place.lat, n.place.lon);
      if (aa.alt > best.alt) best = { alt: aa.alt, az: aa.az, at: t };
    }
    return { ...best, visible: best.alt > 15 && n.place.bortle <= 5 };
  }

  function targetsFor(n) {
    if (!n.dark) return [];
    const out = [];
    for (const tg of D.TARGETS) {
      let best = { alt: -90, at: n.dark.from };
      for (let i = 0; i <= 12; i++) {
        const t = n.dark.from + (n.dark.to - n.dark.from) * i / 12, j = jdOf(t);
        const aa = A.altaz(tg.ra, tg.dec, j, n.place.lat, n.place.lon);
        if (aa.alt > best.alt) best = { alt: aa.alt, az: aa.az, at: t };
      }
      if (best.alt < 18) continue;
      const easy = n.place.bortle <= tg.maxB;
      out.push({ ...tg, alt: best.alt, az: best.az, at: best.at, easy });
    }
    return out.sort((a, b) => (b.easy - a.easy) || (b.alt - a.alt));
  }

  /* ---------------- conjunctions ---------------- */

  /** Close approaches between naked eye planets, and between the Moon and a planet. */
  function conjunctions(place, fromMs, days, limitDeg) {
    const keys = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
    const step = 6 * HOUR, n = Math.ceil(days * DAY / step);
    const series = [];
    for (let i = 0; i <= n; i++) {
      const t = fromMs + i * step, j = jdOf(t);
      const pos = {};
      for (const k of keys) pos[k] = A.planet(k, j);
      pos.moon = A.moon(j);
      series.push({ t, j, pos });
    }
    const pairs = [];
    for (let a = 0; a < keys.length; a++)
      for (let b = a + 1; b < keys.length; b++) pairs.push([keys[a], keys[b]]);
    for (const k of keys) pairs.push(['moon', k]);

    const out = [];
    for (const [x, y] of pairs) {
      let prev = null, prevPrev = null;
      for (const s of series) {
        const d = A.sep(s.pos[x], s.pos[y]);
        if (prev && prevPrev && prev.d < prevPrev.d && prev.d <= d) {
          const lim = x === 'moon' ? Math.max(limitDeg, 2.5) : limitDeg;
          if (prev.d < lim) {
            // Refine the minimum by golden section over the bracketing six hour steps.
            let lo = prevPrev.t, hi = s.t;
            const f = t => { const j = jdOf(t); return A.sep(x === 'moon' ? A.moon(j) : A.planet(x, j), y === 'moon' ? A.moon(j) : A.planet(y, j)); };
            for (let i = 0; i < 40; i++) {
              const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618;
              if (f(m1) < f(m2)) hi = m2; else lo = m1;
            }
            const at = (lo + hi) / 2;
            out.push({ a: x, b: y, at, sep: f(at) });
          }
        }
        prevPrev = prev; prev = { t: s.t, d };
      }
    }
    return out.sort((p, q) => p.at - q.at);
  }

  /* ---------------- what is happening tonight ---------------- */

  /** The ranked list of reasons to go outside tonight. weight runs 0 to 1. */
  function happenings(n) {
    const list = [];
    const win = n.dark || { from: n.bands.civil.end || n.t0 + 8 * HOUR, to: n.bands.civil.start || n.t0 + 16 * HOUR };

    // Eclipses inside this night, and a solar eclipse during the day that follows the night.
    for (const e of A.eclipses(jdOf(n.t0), jdOf(n.t1), n.place.lat, n.place.lon)) {
      if (e.kind === 'lunar' && e.local) {
        const w = e.local.type === 'Total' ? 1 : e.local.type === 'Partial' ? 0.86 : 0.4;
        list.push({ type: 'lunar-eclipse', weight: w, at: msOf(e.jd), lunar: true,
                    title: e.local.type + ' lunar eclipse', detail: e.local, moonIsTheEvent: true,
                    sub: 'Greatest at ' + '{t}' });
      } else if (e.kind === 'solar' && e.local) {
        const w = e.local.type === 'Total' ? 1 : e.local.type === 'Annular' ? 0.95 : 0.6 * e.local.magnitude;
        list.push({ type: 'solar-eclipse', weight: w, at: msOf(e.jd), daytime: true,
                    title: e.local.type === 'Partial'
                      ? 'Partial solar eclipse, ' + Math.round(e.local.obscuration * 100) + ' per cent'
                      : e.local.type + ' solar eclipse',
                    detail: e.local, sub: 'During daylight, not tonight' });
      }
    }

    // Meteor showers with any real activity.
    for (const sh of D.SHOWERS) {
      if (!showerActive(sh, n.midnight)) continue;
      const best = showerBest(sh, n);
      if (best.rate < 0.6) continue;
      const w = clamp(Math.log10(1 + best.rate) / Math.log10(81), 0, 1);
      list.push({ type: 'shower', weight: w, at: best.at, shower: sh, best,
                  title: sh.name, sub: Math.round(best.rate) + ' an hour at best' });
    }

    // The galaxy itself.
    const core = coreFor(n);
    if (core.visible) {
      const w = clamp(0.26 + (core.alt / 60) * 0.22 + (5 - n.place.bortle) * 0.05, 0, 0.62);
      list.push({ type: 'core', weight: w, at: core.at, core,
                  title: 'The Milky Way core', sub: Math.round(core.alt) + ' degrees up, ' + D.compass(core.az) });
    }

    // Planets worth walking outside for.
    const planets = planetsFor(n);
    for (const p of planets) {
      if (!p.visible || !p.naked) continue;
      if (p.mag > 1.6) continue;
      const w = clamp(0.20 + (-p.mag + 1) * 0.055 + (p.alt / 90) * 0.13, 0, 0.44);
      list.push({ type: 'planet', weight: w, at: p.at, planet: p,
                  title: p.name, sub: 'magnitude ' + p.mag.toFixed(1) + ', ' + Math.round(p.alt) + ' degrees up' });
    }

    // A close pass between two bright things, judged at the moment you could look at it.
    for (const c of conjunctions(n.place, n.t0 - DAY, 3, 3.2)) {
      if (c.at < n.t0 - 12 * HOUR || c.at > n.t1) continue;
      const seen = conjunctionSeen(c, n);
      if (!seen) continue;
      const withMoon = c.a === 'moon';
      const base = withMoon ? 0.52 : 0.74;
      const w = clamp((base - seen.sep * 0.09) * clamp(seen.alt / 22, 0.3, 1), 0.18, 0.8);
      list.push({ type: 'conjunction', weight: w, at: seen.at, conj: c, seen,
                  title: pairName(c), sub: seen.sep.toFixed(1) + ' degrees apart, ' + Math.round(seen.alt) + ' degrees up' });
    }

    // Earthshine is a real thing to go and look at, and it happens on a schedule.
    if (n.moon.illum < 0.22 && n.moon.illum > 0.02 && n.moon.maxAlt > 5) {
      list.push({ type: 'earthshine', weight: 0.34, at: n.bands.civil.end || win.from,
                  title: 'Earthshine on the crescent', sub: 'The dark side of the Moon, lit by our planet' });
    }

    list.sort((a, b) => b.weight - a.weight);
    return { list, planets, core };
  }
  /** Where a pair sits, and how far apart it is, at the best watchable moment of one night. */
  function conjunctionSeen(c, n) {
    const from = n.bands.day.end || n.t0 + 7 * HOUR, to = n.bands.day.start || n.t1 - 7 * HOUR;
    if (to <= from) return null;
    const pos = (who, j) => who === 'moon' ? A.moon(j) : A.planet(who, j);
    let best = null;
    for (let i = 0; i <= 20; i++) {
      const t = from + (to - from) * i / 20, j = jdOf(t);
      const pa = pos(c.a, j), pb = pos(c.b, j);
      const aa = A.altaz(pa.ra, pa.dec, j, n.place.lat, n.place.lon);
      const ab = A.altaz(pb.ra, pb.dec, j, n.place.lat, n.place.lon);
      const alt = Math.min(aa.alt, ab.alt);
      if (!best || alt > best.alt) best = { alt, at: t, sep: A.sep(pa, pb), az: aa.az };
    }
    return best && best.alt > 4 && best.sep < 12 ? best : null;
  }
  /* How good a pairing looks on a given night: close first, then high. */
  const pairQuality = c => (12 - Math.min(12, c.sep)) * 2 + Math.min(40, c.alt) / 10;

  const NICE = { moon: 'The Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' };
  const pairName = c => NICE[c.a] + ' and ' + NICE[c.b];

  /* ---------------- the score ---------------- */

  /* Four things decide whether tonight is worth the coat: what is on, how dark it gets,
     what the Moon is doing to that darkness, and whether the good hour is a civilised one.
     Umbra cannot see your weather, and it never pretends otherwise.                     */
  function score(n, hap) {
    const top = hap.list[0] || null;
    const eventV = top ? clamp(top.weight, 0, 1) : 0.22;

    const lengthV = clamp(n.darkHours / 4.5, 0, 1);
    const bortleV = clamp((n.bortle.lm - 4.0) / 3.4, 0, 1);
    const darkV = n.quality === 'none' ? 0.05 : (0.55 * lengthV + 0.45 * bortleV) * (n.quality === 'astronomical' ? 1 : 0.82);

    const moonIsEvent = !!(top && top.moonIsTheEvent) || (top && top.type === 'earthshine');
    const moonV = moonIsEvent ? 1 : clamp(1 - n.moon.penalty / 3, 0, 1);

    const bestAt = top ? top.at : (n.dark ? (n.dark.from + n.dark.to) / 2 : n.midnight);
    const h = hourAt(bestAt, n.place);
    let timeV;
    if (h >= 20 && h < 23.5) timeV = 1;
    else if (h >= 18 && h < 20) timeV = 0.92;
    else if (h >= 23.5 || h < 1) timeV = 0.78;
    else if (h < 2.5) timeV = 0.6;
    else if (h < 4.5) timeV = 0.44;
    else timeV = 0.34;
    const lenBonus = clamp(n.darkHours / 3, 0, 1) * 0.12;
    const timingV = clamp(timeV * 0.88 + lenBonus, 0, 1);

    /* The event decides the size of the night; the sky decides how much of it survives.
       A sum would let a merely dark night masquerade as an occasion, so the two multiply. */
    const skyV = 0.42 * darkV + 0.32 * moonV + 0.26 * timingV;
    const raw = Math.pow(eventV, 0.7) * (0.30 + 0.70 * skyV);
    const value = Math.round(clamp(raw * 10, 0, 10) * 10) / 10;

    const parts = [
      { key: 'event', label: 'What is on', v: eventV, note: top ? top.title : 'Nothing scheduled, which is most nights' },
      { key: 'dark', label: 'Darkness', v: darkV, note: darkNote(n) },
      { key: 'moon', label: 'The Moon', v: moonV, note: moonNote(n, moonIsEvent) },
      { key: 'timing', label: 'The hour', v: timingV, note: timingNote(bestAt, n) }
    ];
    return { value, parts, top, bestAt, verdict: verdictFor(value, n, top) };
  }

  function darkNote(n) {
    if (n.quality === 'none') return 'The sun never gets far enough down tonight';
    const hrs = n.darkHours;
    const label = n.quality === 'astronomical' ? 'of true darkness' : n.quality === 'nautical' ? 'of nautical twilight, the darkest it gets' : 'of civil twilight only';
    return (hrs < 1 ? Math.round(hrs * 60) + ' minutes ' : hrs.toFixed(1) + ' hours ') + label + ', Bortle ' + n.place.bortle;
  }
  function moonNote(n, isEvent) {
    if (isEvent) return 'The Moon is the reason to go out tonight';
    if (!n.dark) return 'There is no dark window tonight for it to spoil';
    if (n.moon.upFrac < 0.02) return 'Down for the whole dark window';
    const pct = Math.round(n.moon.illum * 100);
    if (n.moon.penalty < 0.4) return pct + ' per cent lit, and low or brief';
    if (n.moon.penalty < 1.2) return pct + ' per cent lit, costing about ' + n.moon.penalty.toFixed(1) + ' a magnitude';
    return pct + ' per cent lit and high: about ' + n.moon.penalty.toFixed(1) + ' magnitudes of sky lost';
  }
  function timingNote(at, n) {
    const h = Math.floor(hourAt(at, n.place));
    if (h >= 18 && h < 23) return 'The best of it lands in the evening';
    if (h >= 23 || h < 1) return 'Around midnight';
    if (h < 3) return 'After midnight, before the small hours';
    if (h < 5) return 'The small hours, which is a real cost';
    return 'Close to dawn';
  }
  function verdictFor(v, n, top) {
    if (n.quality === 'none') return 'No real night tonight. The sky stays in twilight.';
    if (v >= 8.5) return 'Go. This is one of the good ones.';
    if (v >= 7) return 'Worth your coat, if the sky is clear.';
    if (v >= 5.5) return 'A good ordinary night. Worth half an hour outside.';
    if (v >= 4) return 'Nothing scheduled, but the sky is still there.';
    if (v >= 2.5) return 'A poor night for it. Rest, and check tomorrow.';
    return 'Skip it. Nothing here is worth losing sleep over.';
  }

  /** Is there anything in this stretch of nights a person would want told about? */
  function notable(rows) {
    for (const r of rows) {
      const top = r.score.top;
      if (!top) continue;
      if (top.type === 'lunar-eclipse' || top.type === 'solar-eclipse') return { row: r, why: top.title };
      if (top.type === 'shower' && top.best && top.best.rate >= 8) return { row: r, why: top.title };
      if (top.type === 'conjunction' && top.seen && top.seen.sep < 1.2) return { row: r, why: top.title };
    }
    return null;
  }

  /** Everything the Tonight screen needs, in one call. */
  function tonight(place, whenMs) {
    const n = night(place, whenMs || Date.now());
    const hap = happenings(n);
    return { n, ...hap, score: score(n, hap), targets: targetsFor(n) };
  }

  /* ---------------- the strip ---------------- */

  /** A sampled series across the night for drawing: sun altitude, moon altitude, moon light. */
  function strip(n, steps) {
    steps = steps || 96;
    const from = (n.bands.day.end || n.t0 + 6 * HOUR) - 40 * MIN;
    const to = (n.bands.day.start || n.t1 - 6 * HOUR) + 40 * MIN;
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const t = from + (to - from) * i / steps, j = jdOf(t);
      const s = A.sun(j), m = A.moon(j);
      out.push({ t,
        sun: A.altaz(s.ra, s.dec, j, n.place.lat, n.place.lon).alt,
        moon: A.altaz(m.ra, m.dec, j, n.place.lat, n.place.lon).alt });
    }
    return { from, to, points: out };
  }

  /* ---------------- the year ahead ---------------- */

  /** Everything Umbra can put a date on, for one place, over the next `days` days. */
  function feed(place, fromMs, days) {
    const out = [];
    const toMs = fromMs + days * DAY;

    // Meteor shower peaks.
    for (const sh of D.SHOWERS) {
      for (const anchor of [fromMs, fromMs + 182 * DAY, fromMs + 364 * DAY]) {
        const at = showerPeak(sh, anchor);
        if (at < fromMs || at > toMs) continue;
        if (out.some(e => e.kind === 'shower' && e.shower.code === sh.code && Math.abs(e.at - at) < 10 * DAY)) continue;
        out.push({ kind: 'shower', at, shower: sh, title: sh.name,
                   key: 'sh' + sh.code + Math.round(at / DAY) });
      }
    }

    // Eclipses, with the circumstances for this place.
    for (const e of A.eclipses(jdOf(fromMs), jdOf(toMs), place.lat, place.lon)) {
      const at = msOf(e.jd);
      out.push({ kind: e.kind === 'solar' ? 'solar-eclipse' : 'lunar-eclipse', at,
                 ecl: e, title: (e.global.type || 'Partial') + ' ' + (e.kind === 'solar' ? 'solar' : 'lunar') + ' eclipse',
                 key: 'ec' + Math.round(at / 1000) });
    }

    // Planet oppositions and the greatest elongations of the two inner planets.
    const step = 12 * HOUR;
    const track = {};
    for (const k of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus']) track[k] = [];
    for (let t = fromMs; t <= toMs; t += step) {
      const j = jdOf(t);
      for (const k in track) track[k].push({ t, e: A.planet(k, j).elong });
    }
    for (const k in track) {
      const s = track[k];
      for (let i = 1; i < s.length - 1; i++) {
        if (s[i].e > s[i - 1].e && s[i].e >= s[i + 1].e) {
          if (k === 'mercury' || k === 'venus') {
            const j = jdOf(s[i].t), p = A.planet(k, j);
            const east = A.norm180(p.ra - A.sun(j).ra) > 0;
            out.push({ kind: 'elongation', at: s[i].t, planet: k, elong: s[i].e, east,
                       title: A.PLANETS[k].name + ' at greatest ' + (east ? 'evening' : 'morning') + ' elongation',
                       key: 'el' + k + Math.round(s[i].t / DAY) });
          } else if (s[i].e > 175) {
            out.push({ kind: 'opposition', at: s[i].t, planet: k,
                       title: A.PLANETS[k].name + ' at opposition',
                       key: 'op' + k + Math.round(s[i].t / DAY) });
          }
        }
      }
    }

    // Close conjunctions.
    for (const c of conjunctions(place, fromMs, days, 2.2)) {
      out.push({ kind: 'conjunction', at: c.at, conj: c, title: pairName(c),
                 key: 'cj' + c.a + c.b + Math.round(c.at / DAY) });
    }

    // Full and new Moons, with the perigee ones marked.
    const k0 = Math.floor((jdOf(fromMs) - 2451550.09766) / 29.530588861) - 1;
    const k1 = Math.ceil((jdOf(toMs) - 2451550.09766) / 29.530588861) + 1;
    for (let k = k0; k <= k1; k++) {
      for (const [ph, name] of [[0, 'New Moon'], [2, 'Full Moon']]) {
        const jd = A.trueSyzygy(A.meanPhase(k, ph), ph === 2);
        const at = msOf(jd);
        if (at < fromMs || at > toMs) continue;
        const dist = A.moon(jd).dist;
        out.push({ kind: 'moon', at, phase: ph, dist,
                   title: name + (ph === 2 && dist < 360000 ? ', close to perigee' : ''),
                   key: 'mn' + Math.round(at / 1000) });
      }
    }

    // The four turns of the year, because they are what the almanac is for.
    for (const [deg, name] of [[0, 'March equinox'], [90, 'June solstice'], [180, 'September equinox'], [270, 'December solstice']]) {
      for (const anchor of [fromMs, fromMs + 182 * DAY, fromMs + 364 * DAY]) {
        const at = msOf(A.whenSolarLongitude(deg, jdOf(anchor)));
        if (at < fromMs || at > toMs) continue;
        if (out.some(e => e.kind === 'season' && Math.abs(e.at - at) < DAY)) continue;
        out.push({ kind: 'season', at, title: name, key: 'se' + Math.round(at / DAY) });
      }
    }

    for (const e of out) e.hi = isHighlight(e);
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  /** The shortlist an almanac would print in bold. */
  function isHighlight(e) {
    switch (e.kind) {
      case 'shower': return e.shower.zhr >= 10;
      case 'solar-eclipse': case 'lunar-eclipse': case 'opposition': case 'elongation': case 'season': return true;
      case 'conjunction': return e.conj.sep < (e.conj.a === 'moon' ? 1.0 : 1.3);
      case 'moon': return e.phase === 2 && e.dist < 360000;
      default: return false;
    }
  }

  /* How good is one dated event, from here? Computed lazily, one event at a time. */
  function rate(ev, place) {
    if (ev.rating) return ev.rating;
    let r = null;
    if (ev.kind === 'shower') {
      const opts = showerNights(ev.shower, ev.at, place);
      const best = opts[0];
      r = { rate: best.rate, alt: best.alt, at: best.at, moon: best.night.moon.illum,
            night: best.night, nights: opts,
            label: best.rate < 1 ? 'Nothing much from here' :
                   best.rate < 5 ? 'A few an hour' :
                   Math.round(best.rate) + ' an hour' };
      ev.nightAt = best.night.t0;
    } else if (ev.kind === 'solar-eclipse') {
      const l = ev.ecl.local;
      r = l ? { label: l.type === 'Partial'
                  ? Math.round(l.obscuration * 100) + ' per cent here'
                  : l.type + ' from here', local: l }
            : { label: 'Not visible here', local: null };
    } else if (ev.kind === 'lunar-eclipse') {
      const l = ev.ecl.local;
      r = l ? { label: l.type + ', Moon ' + Math.round(l.moonAlt) + '\u00B0 up', local: l }
            : { label: 'Moon below the horizon', local: null };
    } else if (ev.kind === 'conjunction') {
      // The interesting moment is not the exact minimum, which is often at noon, but the
      // best moment you could stand outside and see the pair.
      const nights = [night(place, ev.at - 8 * HOUR), night(place, ev.at + 16 * HOUR)];
      let seen = null, on = null;
      for (const n of nights) {
        const c = conjunctionSeen(ev.conj, n);
        if (c && (!seen || pairQuality(c) > pairQuality(seen))) { seen = c; on = n; }
      }
      r = seen
        ? { alt: seen.alt, at: seen.at, sep: seen.sep, night: on,
            label: seen.alt < 8 ? 'Low, ' + Math.round(seen.alt) + '\u00B0 up'
                                : Math.round(seen.alt) + '\u00B0 up' }
        : { alt: 0, at: ev.at, sep: ev.conj.sep, label: 'Not visible here' };
    } else if (ev.kind === 'opposition' || ev.kind === 'elongation') {
      const n = night(place, ev.at);
      const key = ev.planet;
      let best = -90, at = ev.at;
      const from = n.bands.day.end || n.t0 + 7 * HOUR, to = n.bands.day.start || n.t1 - 7 * HOUR;
      for (let i = 0; i <= 20; i++) {
        const t = from + (to - from) * i / 20, jj = jdOf(t);
        const p = A.planet(key, jj);
        const aa = A.altaz(p.ra, p.dec, jj, place.lat, place.lon);
        if (aa.alt > best) { best = aa.alt; at = t; }
      }
      r = { alt: best, at, label: best < 8 ? 'Barely clears' : Math.round(best) + '\u00B0 up' };
    }
    ev.rating = r;
    return r;
  }

  return { night, anchorFor, offsetFor, hourAt, tonight, happenings, score, strip, feed, rate, conjunctionSeen, notable,
           showerAt, showerBest, showerActive, showerPeak, showerNights, planetsFor, targetsFor,
           coreFor, conjunctions, pairName, PLANET_KEYS, GALACTIC_CORE };
})();
if (typeof module !== 'undefined') module.exports = Sky;
