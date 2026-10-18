/* Umbra: the ephemeris kernel. Everything the app claims about the sky is computed here,
   on the device, from published algorithms. No data is downloaded and no table of results
   is shipped; only the series coefficients are.

   Sources: Jean Meeus, Astronomical Algorithms (2nd ed.) for the Sun (ch. 25), the Moon
   (ch. 47), sidereal time (ch. 12), parallax (ch. 40) and eclipse geometry (ch. 54);
   JPL's Keplerian elements for the major planets (Standish, valid 1800 to 2050).      */
const Astro = (() => {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const sin = a => Math.sin(a * D2R), cos = a => Math.cos(a * D2R), tan = a => Math.tan(a * D2R);
  const asin = x => Math.asin(Math.max(-1, Math.min(1, x))) * R2D;
  const atan2 = (y, x) => Math.atan2(y, x) * R2D;
  const norm = a => { const r = a % 360; return r < 0 ? r + 360 : r; };
  const norm180 = a => { const r = norm(a); return r > 180 ? r - 360 : r; };

  const AU_KM = 149597870.7;
  const R_EARTH = 6378.14;          // km, equatorial
  const R_MOON = 1737.4;            // km
  const R_SUN = 696000;             // km

  /* ---------------- time ---------------- */
  const J2000 = 2451545.0;
  const jdFromMs = ms => ms / 86400000 + 2440587.5;
  const msFromJd = jd => (jd - 2440587.5) * 86400000;
  const dateFromJd = jd => new Date(msFromJd(jd));

  /** Difference between Terrestrial Time and UT, seconds. Espenak and Meeus polynomials. */
  function deltaT(year) {
    let t;
    if (year >= 2005 && year < 2050) { t = year - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
    if (year >= 2050 && year < 2150) { const u = (year - 1820) / 100; return -20 + 32 * u * u - 0.5628 * (2150 - year); }
    if (year >= 1986 && year < 2005) { t = year - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t + 0.000651814 * t * t * t * t + 0.00002373599 * Math.pow(t, 5); }
    const u = (year - 1820) / 100; return -20 + 32 * u * u;
  }
  /** Julian Ephemeris Day from a Julian Day in UT. */
  function jde(jd) {
    const y = dateFromJd(jd).getUTCFullYear();
    return jd + deltaT(y) / 86400;
  }

  /** Greenwich mean sidereal time in degrees, from a UT Julian Day. */
  function gmst(jd) {
    const T = (jd - J2000) / 36525;
    return norm(280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * T * T - T * T * T / 38710000);
  }
  const lst = (jd, lon) => norm(gmst(jd) + lon);

  /** Mean obliquity of the ecliptic, degrees. */
  function obliquity(T) {
    return 23.439291111 - 0.0130041667 * T - 1.638889e-7 * T * T + 5.036111e-7 * T * T * T;
  }

  /* ---------------- the Sun ---------------- */
  /** Apparent geocentric position. jd is UT. */
  function sun(jd) {
    const T = (jde(jd) - J2000) / 36525;
    const L0 = norm(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
    const M = norm(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
    const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M)
            + (0.019993 - 0.000101 * T) * sin(2 * M)
            + 0.000289 * sin(3 * M);
    const trueLon = L0 + C;
    const v = M + C;
    const R = 1.000001018 * (1 - e * e) / (1 + e * cos(v));      // AU
    const om = 125.04 - 1934.136 * T;
    const lambda = trueLon - 0.00569 - 0.00478 * sin(om);
    const eps = obliquity(T) + 0.00256 * cos(om);
    const ra = norm(atan2(cos(eps) * sin(lambda), cos(lambda)));
    const dec = asin(sin(eps) * sin(lambda));
    return { ra, dec, dist: R * AU_KM, lambda: norm(lambda), R, eps };
  }

  /* ---------------- the Moon (Meeus ch. 47, truncated) ---------------- */
  // [D, M, M', F, sigmaL (1e-6 deg), sigmaR (1e-3 km)]
  const LR = [
    [0,0,1,0,6288774,-20905355],[2,0,-1,0,1274027,-3699111],[2,0,0,0,658314,-2955968],
    [0,0,2,0,213618,-569925],[0,1,0,0,-185116,48888],[0,0,0,2,-114332,-3149],
    [2,0,-2,0,58793,246158],[2,-1,-1,0,57066,-152138],[2,0,1,0,53322,-170733],
    [2,-1,0,0,45758,-204586],[0,1,-1,0,-40923,-129620],[1,0,0,0,-34720,108743],
    [0,1,1,0,-30383,104755],[2,0,0,-2,15327,10321],[0,0,1,2,-12528,0],
    [0,0,1,-2,10980,79661],[4,0,-1,0,10675,-34782],[0,0,3,0,10034,-23210],
    [4,0,-2,0,8548,-21636],[2,1,-1,0,-7888,24208],[2,1,0,0,-6766,30824],
    [1,0,-1,0,-5163,-8379],[1,1,0,0,4987,-16675],[2,-1,1,0,4036,-12831],
    [2,0,2,0,3994,-10445],[4,0,0,0,3861,-11650],[2,0,-3,0,3665,14403],
    [0,1,-2,0,-2689,-7003],[2,0,-1,2,-2602,0],[2,-1,-2,0,2390,10056],
    [1,0,1,0,-2348,6322],[2,-2,0,0,2236,-9884],[0,1,2,0,-2120,5751],
    [0,2,0,0,-2069,0],[2,-2,-1,0,2048,-4950],[2,0,1,-2,-1773,4130],
    [2,0,0,2,-1595,0],[4,-1,-1,0,1215,-3958],[0,0,2,2,-1110,0],
    [3,0,-1,0,-892,3258],[2,1,1,0,-810,2616],[4,-1,-2,0,759,-1897],
    [0,2,-1,0,-713,-2117],[2,2,-1,0,-700,2354],[2,1,-2,0,691,0],
    [2,-1,0,-2,596,0],[4,0,1,0,549,-1423],[0,0,4,0,537,-1117],
    [4,-1,0,0,520,-1571],[1,0,-2,0,-487,-1739],[2,1,0,-2,-399,0],
    [0,0,2,-2,-381,-4421],[1,1,1,0,351,0],[3,0,-2,0,-340,0],
    [4,0,-3,0,330,0],[2,-1,2,0,327,0],[0,2,1,0,-323,1165],
    [1,1,-1,0,299,0],[2,0,3,0,294,0],[2,0,-1,-2,0,8752]
  ];
  // [D, M, M', F, sigmaB (1e-6 deg)]
  const BT = [
    [0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],
    [2,0,-1,1,55413],[2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],
    [2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],
    [2,0,1,1,4200],[2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],
    [2,-1,-1,-1,2065],[0,1,-1,-1,-1870],[4,0,-1,-1,1828],[0,1,0,1,-1794],
    [0,0,0,3,-1749],[0,1,-1,1,-1565],[1,0,0,1,-1491],[0,1,1,1,-1475],
    [0,1,1,-1,-1410],[0,1,0,-1,-1344],[1,0,0,-1,-1335],[0,0,3,1,1107],
    [4,0,0,-1,1021],[4,0,-1,1,833],[0,0,1,-3,777],[4,0,-2,1,671],
    [2,0,0,-3,607],[2,0,2,-1,596],[2,-1,1,-1,491],[2,0,-2,1,-451],
    [0,0,3,-1,439],[2,0,2,1,422],[2,0,-3,-1,421],[2,1,-1,1,-366],
    [2,1,0,1,-351],[4,0,0,1,331],[2,-1,1,1,315],[2,-2,0,-1,302],
    [0,0,1,3,-283],[2,1,1,-1,-229],[1,1,0,-1,223],[1,1,0,1,223],
    [0,1,-2,-1,-220],[2,1,-1,-1,-220],[1,0,1,1,-185],[2,-1,-2,-1,181],
    [0,1,2,1,-177],[4,0,-2,-1,176],[4,-1,-1,-1,166],[1,0,1,-1,-164],
    [4,0,1,-1,132],[1,0,-1,-1,-119],[4,-1,0,-1,115],[2,-2,0,1,107]
  ];

  /** Apparent geocentric position of the Moon. jd is UT. */
  function moon(jd) {
    const T = (jde(jd) - J2000) / 36525;
    const Lp = norm(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + T * T * T / 538841 - T * T * T * T / 65194000);
    const D  = norm(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T * T * T / 545868 - T * T * T * T / 113065000);
    const M  = norm(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + T * T * T / 24490000);
    const Mp = norm(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T * T * T / 69699 - T * T * T * T / 14712000);
    const F  = norm(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T - T * T * T / 3526000 + T * T * T * T / 863310000);
    const A1 = norm(119.75 + 131.849 * T);
    const A2 = norm(53.09 + 479264.290 * T);
    const A3 = norm(313.45 + 481266.484 * T);
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;

    let sl = 0, sr = 0, sb = 0;
    for (const [d, m, mp, f, cl, cr] of LR) {
      const arg = d * D + m * M + mp * Mp + f * F;
      const e = m === 0 ? 1 : (Math.abs(m) === 1 ? E : E * E);
      sl += cl * e * sin(arg);
      sr += cr * e * cos(arg);
    }
    for (const [d, m, mp, f, cb] of BT) {
      const arg = d * D + m * M + mp * Mp + f * F;
      const e = m === 0 ? 1 : (Math.abs(m) === 1 ? E : E * E);
      sb += cb * e * sin(arg);
    }
    sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
    sb += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F)
        + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);

    const lambda = norm(Lp + sl / 1e6);
    const beta = sb / 1e6;
    const dist = 385000.56 + sr / 1000;                  // km
    const eps = obliquity(T);
    const ra = norm(atan2(sin(lambda) * cos(eps) - tan(beta) * sin(eps), cos(lambda)));
    const dec = asin(sin(beta) * cos(eps) + cos(beta) * sin(eps) * sin(lambda));
    const parallax = asin(R_EARTH / dist);               // equatorial horizontal parallax, degrees
    return { ra, dec, dist, lambda, beta, parallax, eps };
  }

  /** Illuminated fraction and phase angle of the Moon, plus the age in the synodic month. */
  function moonPhase(jd) {
    const s = sun(jd), m = moon(jd);
    const psi = Math.acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra)) * R2D;
    const i = atan2(s.dist * sin(psi), m.dist - s.dist * cos(psi));
    const k = (1 + cos(i)) / 2;
    // Waxing when the Moon is east of the Sun.
    const elong = norm180(m.lambda - s.lambda);
    return { illum: k, phaseAngle: i, elongation: elong, waxing: elong > 0,
             name: phaseName(norm(elong)) };
  }
  function phaseName(e) {
    if (e < 11.25 || e >= 348.75) return 'New moon';
    if (e < 78.75) return 'Waxing crescent';
    if (e < 101.25) return 'First quarter';
    if (e < 168.75) return 'Waxing gibbous';
    if (e < 191.25) return 'Full moon';
    if (e < 258.75) return 'Waning gibbous';
    if (e < 281.25) return 'Last quarter';
    return 'Waning crescent';
  }

  /* ---------------- planets: JPL Keplerian elements ---------------- */
  // name, a, e, I, L, longPeri, longNode  then the same six as rates per Julian century.
  const PLANETS = {
    mercury: { name: 'Mercury',
      el: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
      rt: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081], V: -0.36 },
    venus: { name: 'Venus',
      el: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
      rt: [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418], V: -4.29 },
    earth: { name: 'Earth',
      el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
      rt: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0], V: 0 },
    mars: { name: 'Mars',
      el: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
      rt: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], V: -1.52 },
    jupiter: { name: 'Jupiter',
      el: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
      rt: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], V: -9.40 },
    saturn: { name: 'Saturn',
      el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
      rt: [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], V: -8.88 },
    uranus: { name: 'Uranus',
      el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
      rt: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589], V: -7.19 }
  };

  /** Heliocentric ecliptic rectangular coordinates, AU, J2000 ecliptic. */
  function helio(key, T) {
    const p = PLANETS[key];
    const a = p.el[0] + p.rt[0] * T, e = p.el[1] + p.rt[1] * T, I = p.el[2] + p.rt[2] * T;
    const L = p.el[3] + p.rt[3] * T, wbar = p.el[4] + p.rt[4] * T, om = p.el[5] + p.rt[5] * T;
    const w = wbar - om;
    let M = norm180(L - wbar);
    let E = M + (e * R2D) * sin(M);
    for (let i = 0; i < 8; i++) {
      const dM = M - (E - (e * R2D) * sin(E));
      E += dM / (1 - e * cos(E));
    }
    const xp = a * (cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * sin(E);
    const x = (cos(w) * cos(om) - sin(w) * sin(om) * cos(I)) * xp + (-sin(w) * cos(om) - cos(w) * sin(om) * cos(I)) * yp;
    const y = (cos(w) * sin(om) + sin(w) * cos(om) * cos(I)) * xp + (-sin(w) * sin(om) + cos(w) * cos(om) * cos(I)) * yp;
    const z = (sin(w) * sin(I)) * xp + (cos(w) * sin(I)) * yp;
    return { x, y, z, r: Math.sqrt(x * x + y * y + z * z) };
  }

  /** Apparent geocentric position and visual magnitude of a planet. */
  function planet(key, jd) {
    const T = (jde(jd) - J2000) / 36525;
    const e3 = helio('earth', T);
    let pv = helio(key, T), dx, dy, dz, delta;
    for (let i = 0; i < 2; i++) {                        // one light-time iteration
      dx = pv.x - e3.x; dy = pv.y - e3.y; dz = pv.z - e3.z;
      delta = Math.sqrt(dx * dx + dy * dy + dz * dz);
      pv = helio(key, T - (delta * 0.0057755183 / 36525));
    }
    const lambda = norm(atan2(dy, dx));
    const beta = asin(dz / delta);
    const eps = obliquity(T);
    const ra = norm(atan2(sin(lambda) * cos(eps) - tan(beta) * sin(eps), cos(lambda)));
    const dec = asin(sin(beta) * cos(eps) + cos(beta) * sin(eps) * sin(lambda));

    const r = pv.r, R = e3.r;
    const cosPh = Math.max(-1, Math.min(1, (r * r + delta * delta - R * R) / (2 * r * delta)));
    const ph = Math.acos(cosPh) * R2D;                   // phase angle at the planet
    const base = PLANETS[key].V + 5 * Math.log10(r * delta);
    let mag = base;
    if (key === 'mercury') mag = base + 0.038 * ph - 0.000273 * ph * ph + 2.0e-6 * ph * ph * ph;
    else if (key === 'venus') mag = base + 0.0009 * ph + 2.39e-4 * ph * ph - 6.5e-7 * ph * ph * ph;
    else if (key === 'mars') mag = base + 0.016 * ph;
    else if (key === 'jupiter') mag = base + 0.005 * ph;
    else if (key === 'saturn') mag = base + 0.044 * ph;   // rings not modelled
    const sunLambda = norm(atan2(-e3.y, -e3.x));
    return { ra, dec, dist: delta * AU_KM, mag, elong: Math.abs(norm180(lambda - sunLambda)),
             name: PLANETS[key].name, key };
  }

  /* ---------------- frames ---------------- */
  /** Horizontal coordinates. az measured from north, through east. */
  function altaz(ra, dec, jd, lat, lon) {
    const H = norm(lst(jd, lon) - ra);
    const alt = asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H));
    const az = norm(atan2(sin(H), cos(H) * sin(lat) - tan(dec) * cos(lat)) + 180);
    return { alt, az, ha: norm180(H) };
  }

  /** Apparent altitude including standard atmospheric refraction. */
  function refract(alt) {
    if (alt < -1) return alt;
    const r = 1.02 / tan(alt + 10.3 / (alt + 5.11)) / 60;
    return alt + r;
  }

  /** Observer's geocentric rectangular vector, km, in the equatorial frame of date. */
  function observerVec(jd, lat, lon, elevM = 0) {
    const u = Math.atan(0.99664719 * tan(lat)) * R2D;
    const rsp = 0.99664719 * sin(u) + (elevM / 6378140) * sin(lat);
    const rcp = cos(u) + (elevM / 6378140) * cos(lat);
    const th = lst(jd, lon);
    return { x: R_EARTH * rcp * cos(th), y: R_EARTH * rcp * sin(th), z: R_EARTH * rsp };
  }

  /** Convert a geocentric position to topocentric for an observer. */
  function topo(pos, jd, lat, lon, elevM = 0) {
    const o = observerVec(jd, lat, lon, elevM);
    const x = pos.dist * cos(pos.dec) * cos(pos.ra) - o.x;
    const y = pos.dist * cos(pos.dec) * sin(pos.ra) - o.y;
    const z = pos.dist * sin(pos.dec) - o.z;
    const d = Math.sqrt(x * x + y * y + z * z);
    return { ra: norm(atan2(y, x)), dec: asin(z / d), dist: d };
  }

  /** Angular separation between two equatorial positions, degrees. */
  function sep(a, b) {
    const c = sin(a.dec) * sin(b.dec) + cos(a.dec) * cos(b.dec) * cos(a.ra - b.ra);
    return Math.acos(Math.max(-1, Math.min(1, c))) * R2D;
  }

  /* ---------------- rise, set and altitude crossings ---------------- */
  /** All times in [jd0, jd1] where a body's altitude crosses h0, by sampling and bisection. */
  function crossings(bodyFn, jd0, jd1, lat, lon, h0, stepMin = 10) {
    const step = stepMin / 1440;
    const f = t => { const p = bodyFn(t); return altaz(p.ra, p.dec, t, lat, lon).alt - h0; };
    const out = [];
    let t = jd0, prev = f(t);
    while (t < jd1) {
      const next = Math.min(t + step, jd1);
      const cur = f(next);
      if ((prev < 0) !== (cur < 0)) {
        let lo = t, hi = next, flo = prev;
        for (let i = 0; i < 26; i++) {
          const mid = (lo + hi) / 2, fm = f(mid);
          if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else hi = mid;
        }
        out.push({ jd: (lo + hi) / 2, rising: prev < 0 });
      }
      prev = cur; t = next;
    }
    return out;
  }

  /** Highest altitude a body reaches inside a window, and when. */
  function culmination(bodyFn, jd0, jd1, lat, lon, stepMin = 6) {
    const step = stepMin / 1440;
    let best = { jd: jd0, alt: -90 };
    for (let t = jd0; t <= jd1; t += step) {
      const p = bodyFn(t);
      const a = altaz(p.ra, p.dec, t, lat, lon).alt;
      if (a > best.alt) best = { jd: t, alt: a };
    }
    return best;
  }

  /* ---------------- eclipses ---------------- */
  const SYNODIC = 29.530588861;
  /** Julian Day (UT) of the mean new moon nearest lunation k counted from 2000 Jan 6. */
  function meanPhase(k, phase) {
    const kk = k + phase / 4;
    const T = kk / 1236.85;
    const jdeVal = 2451550.09766 + 29.530588861 * kk + 0.00015437 * T * T
      - 0.000000150 * T * T * T + 0.00000000073 * T * T * T * T;
    const y = 2000 + kk / 12.3685;
    return jdeVal - deltaT(y) / 86400;
  }

  /** Refine to the exact time of a syzygy: minimum, or maximum, elongation in ecliptic longitude. */
  function trueSyzygy(jdGuess, wantFull) {
    const f = t => {
      const d = norm180(moon(t).lambda - sun(t).lambda - (wantFull ? 180 : 0));
      return d;
    };
    let lo = jdGuess - 0.7, hi = jdGuess + 0.7;
    let flo = f(lo);
    if (flo * f(hi) > 0) return jdGuess;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2, fm = f(mid);
      if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }

  const semiSun = distKm => asin(R_SUN / distKm);
  const semiMoon = distKm => asin(R_MOON / distKm);

  /** Local circumstances of a solar eclipse for one observer. Returns null if nothing is seen. */
  function solarLocal(jdMax, lat, lon, elevM = 0) {
    const f = t => {
      const s = topo(sun(t), t, lat, lon, elevM);
      const m = topo(moon(t), t, lat, lon, elevM);
      return { d: sep(s, m), ss: semiSun(s.dist), sm: semiMoon(m.dist), s, m, t };
    };
    // Coarse then fine search for the minimum separation within four hours of greatest eclipse.
    let best = null;
    for (let dt = -0.18; dt <= 0.18; dt += 0.18 / 36) {
      const r = f(jdMax + dt);
      if (!best || r.d < best.d) best = r;
    }
    for (let i = 0; i < 30; i++) {
      const h = 0.18 / 36 / Math.pow(2, i / 6);
      const a = f(best.t - h), b = f(best.t + h);
      if (a.d < best.d) best = a; else if (b.d < best.d) best = b;
      if (h < 1e-6) break;
    }
    const mag = (best.ss + best.sm - best.d) / (2 * best.ss);
    if (mag <= 0) return null;
    let type = 'Partial';
    if (best.d < Math.abs(best.sm - best.ss)) type = best.sm >= best.ss ? 'Total' : 'Annular';
    // Obscuration: overlapping area of two discs, as a fraction of the Sun's disc.
    const obsc = discOverlap(best.d, best.ss, best.sm) / (Math.PI * best.ss * best.ss);
    const contacts = [];
    for (const sgn of [-1, 1]) {
      let lo = best.t, hi = best.t + sgn * 0.2;
      const g = t => { const r = f(t); return r.d - (r.ss + r.sm); };
      if (g(hi) < 0) continue;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (g(mid) < 0) lo = mid; else hi = mid; }
      contacts.push((lo + hi) / 2);
    }
    const aa = altaz(best.s.ra, best.s.dec, best.t, lat, lon);
    return { type, magnitude: mag, obscuration: obsc, jd: best.t,
             start: contacts[0], end: contacts[1], sunAlt: aa.alt, sunAz: aa.az };
  }

  function discOverlap(d, r1, r2) {
    if (d >= r1 + r2) return 0;
    if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) * Math.min(r1, r2);
    const a1 = Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
    const a2 = Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
    return r1 * r1 * (a1 - Math.sin(2 * a1) / 2) + r2 * r2 * (a2 - Math.sin(2 * a2) / 2);
  }

  /** Geocentric circumstances of a lunar eclipse, plus whether the Moon is up where you are. */
  function lunarLocal(jdMax, lat, lon) {
    const f = t => {
      const s = sun(t), m = moon(t);
      const anti = { ra: norm(s.ra + 180), dec: -s.dec };
      const pm = asin(R_EARTH / m.dist);                     // Moon parallax
      const ps = asin(R_EARTH / s.dist);                     // Sun parallax
      const ssun = semiSun(s.dist);
      const umbra = 1.02 * (pm + ps - ssun);
      const penumbra = 1.02 * (pm + ps + ssun);
      const sm = semiMoon(m.dist);
      return { d: sep(anti, m), umbra, penumbra, sm, m, t };
    };
    let best = null;
    for (let dt = -0.2; dt <= 0.2; dt += 0.2 / 40) {
      const r = f(jdMax + dt);
      if (!best || r.d < best.d) best = r;
    }
    for (let i = 0; i < 30; i++) {
      const h = 0.2 / 40 / Math.pow(2, i / 6);
      const a = f(best.t - h), b = f(best.t + h);
      if (a.d < best.d) best = a; else if (b.d < best.d) best = b;
      if (h < 1e-6) break;
    }
    if (best.d >= best.penumbra + best.sm) return null;
    let type = 'Penumbral';
    if (best.d < best.umbra + best.sm) type = 'Partial';
    if (best.d < best.umbra - best.sm) type = 'Total';
    const umbralMag = (best.umbra + best.sm - best.d) / (2 * best.sm);
    const penMag = (best.penumbra + best.sm - best.d) / (2 * best.sm);
    const edge = type === 'Penumbral' ? 'penumbra' : 'umbra';
    const contacts = [];
    for (const sgn of [-1, 1]) {
      let lo = best.t, hi = best.t + sgn * 0.25;
      const g = t => { const r = f(t); return r.d - ((edge === 'umbra' ? r.umbra : r.penumbra) + r.sm); };
      if (g(hi) < 0) continue;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (g(mid) < 0) lo = mid; else hi = mid; }
      contacts.push((lo + hi) / 2);
    }
    const aa = altaz(best.m.ra, best.m.dec, best.t, lat, lon);
    return { type, umbralMag, penumbralMag: penMag, jd: best.t,
             start: contacts[0], end: contacts[1], moonAlt: aa.alt, moonAz: aa.az };
  }

  /** Every solar and lunar eclipse between two Julian Days, with local circumstances. */
  function eclipses(jd0, jd1, lat, lon) {
    const out = [];
    const k0 = Math.floor((jd0 - 2451550.09766) / SYNODIC) - 1;
    const k1 = Math.ceil((jd1 - 2451550.09766) / SYNODIC) + 1;
    for (let k = k0; k <= k1; k++) {
      // Solar: at new moon, an eclipse happens somewhere if the geocentric separation is small.
      const jn = trueSyzygy(meanPhase(k, 0), false);
      if (jn >= jd0 && jn <= jd1) {
        const s = sun(jn), m = moon(jn);
        if (sep(s, m) < 1.6) {
          const loc = solarLocal(jn, lat, lon);
          out.push({ kind: 'solar', jd: jn, local: loc && loc.sunAlt > -0.5 ? loc : null,
                     global: globalSolarType(jn) });
        }
      }
      const jf = trueSyzygy(meanPhase(k, 2), true);
      if (jf >= jd0 && jf <= jd1) {
        const g = lunarLocal(jf, lat, lon);
        if (g) out.push({ kind: 'lunar', jd: g.jd, local: g.moonAlt > 0 ? g : null, global: g });
      }
    }
    out.sort((a, b) => a.jd - b.jd);
    return out;
  }

  /** Classify a solar eclipse as seen from the Earth as a whole, using the shadow axis. */
  function globalSolarType(jd) {
    // Gamma: least distance of the shadow axis from Earth's centre, in equatorial radii.
    let best = null;
    for (let dt = -0.2; dt <= 0.2; dt += 0.2 / 60) {
      const t = jd + dt;
      const s = sun(t), m = moon(t);
      const sv = { x: s.dist * cos(s.dec) * cos(s.ra), y: s.dist * cos(s.dec) * sin(s.ra), z: s.dist * sin(s.dec) };
      const mv = { x: m.dist * cos(m.dec) * cos(m.ra), y: m.dist * cos(m.dec) * sin(m.ra), z: m.dist * sin(m.dec) };
      const ax = { x: mv.x - sv.x, y: mv.y - sv.y, z: mv.z - sv.z };
      const L = Math.sqrt(ax.x * ax.x + ax.y * ax.y + ax.z * ax.z);
      ax.x /= L; ax.y /= L; ax.z /= L;
      const dot = mv.x * ax.x + mv.y * ax.y + mv.z * ax.z;
      const px = mv.x - dot * ax.x, py = mv.y - dot * ax.y, pz = mv.z - dot * ax.z;
      const gamma = Math.sqrt(px * px + py * py + pz * pz) / R_EARTH;
      if (!best || gamma < best.gamma) best = { gamma, t, mv, sv, dot };
    }
    // Distance from the Moon to the umbral apex tells total from annular.
    const s = sun(best.t), m = moon(best.t);
    const apex = m.dist * R_SUN / (R_SUN - R_MOON) * 0 + (m.dist);
    const umbraLen = R_MOON * (s.dist) / (R_SUN - R_MOON);   // km, from the Moon to the cone tip
    const surfaceDist = m.dist - R_EARTH * Math.sqrt(Math.max(0, 1 - best.gamma * best.gamma));
    let type = 'Partial';
    if (best.gamma < 0.9972 + 0.0055) {
      type = surfaceDist < umbraLen ? 'Total' : 'Annular';
    }
    return { type, gamma: best.gamma, jd: best.t };
  }

  /* ---------------- solar longitude, for meteor shower peaks ---------------- */
  /** Julian Day when the Sun's apparent longitude equals `deg`, nearest to jdNear. */
  function whenSolarLongitude(deg, jdNear) {
    let t = jdNear;
    for (let i = 0; i < 40; i++) {
      const cur = sun(t).lambda;
      let diff = norm180(deg - cur);
      t += diff * 365.2422 / 360;
      if (Math.abs(diff) < 1e-6) break;
    }
    return t;
  }
  const solarLongitude = jd => sun(jd).lambda;

  return { D2R, R2D, sin, cos, tan, asin, atan2, norm, norm180,
           AU_KM, R_EARTH, R_MOON, R_SUN,
           jdFromMs, msFromJd, dateFromJd, jde, deltaT, gmst, lst, obliquity,
           sun, moon, moonPhase, planet, PLANETS, helio,
           altaz, refract, topo, observerVec, sep, crossings, culmination,
           eclipses, solarLocal, lunarLocal, meanPhase, trueSyzygy, semiSun, semiMoon,
           whenSolarLongitude, solarLongitude };
})();
if (typeof module !== 'undefined') module.exports = Astro;
