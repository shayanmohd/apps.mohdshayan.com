/* Umbra: the authored tables. Nothing here is downloaded and nothing here changes at runtime.

   Meteor stream elements follow the IMO Working List of Visual Meteor Showers and the activity
   slopes B published by Jenniskens (1994). Radiants are given for the night of maximum with a
   daily drift in solar longitude. Limiting magnitudes per Bortle class follow Bortle (2001).  */
const Data = (() => {

  /* ---------------- meteor streams ----------------
     lam   solar longitude of maximum, degrees (J2000)
     ra/dec radiant at maximum, degrees; dra/ddec drift per degree of solar longitude
     zhr   zenithal hourly rate at maximum, meteors per hour
     r     population index; B activity slope per degree of solar longitude
     v     geocentric velocity, km/s;  from/to  activity limits in solar longitude       */
  const SHOWERS = [
    { code: 'QUA', name: 'Quadrantids', lam: 283.15, ra: 230.1, dec: 48.5, dra: 0.40, ddec: -0.20,
      zhr: 110, r: 2.1, B: 2.2, v: 41, from: 281.0, to: 284.5, parent: '2003 EH1',
      note: 'A famously narrow peak. The good hours are few, and the radiant only climbs after midnight.' },
    { code: 'LYR', name: 'Lyrids', lam: 32.32, ra: 271.4, dec: 33.6, dra: 1.10, ddec: 0.00,
      zhr: 18, r: 2.1, B: 0.22, v: 49, from: 28.0, to: 36.0, parent: 'C/1861 G1 Thatcher',
      note: 'Modest but reliable, with the occasional bright one that leaves a train.' },
    { code: 'ETA', name: 'Eta Aquariids', lam: 45.5, ra: 338.0, dec: -1.0, dra: 0.90, ddec: 0.40,
      zhr: 50, r: 2.4, B: 0.08, v: 66, from: 35.0, to: 62.0, parent: '1P/Halley',
      note: 'Halley dust, arriving fast and low. A morning shower, and much better from the south.' },
    { code: 'SDA', name: 'Southern Delta Aquariids', lam: 125.0, ra: 339.0, dec: -16.4, dra: 0.80, ddec: 0.20,
      zhr: 25, r: 3.2, B: 0.091, v: 41, from: 115.0, to: 142.0, parent: '96P/Machholz',
      note: 'A long, flat plateau that overlaps the start of the Perseids. Faint meteors, so darkness matters.' },
    { code: 'CAP', name: 'Alpha Capricornids', lam: 127.0, ra: 306.6, dec: -8.2, dra: 0.90, ddec: 0.30,
      zhr: 5, r: 2.5, B: 0.037, v: 23, from: 110.0, to: 140.0, parent: '169P/NEAT',
      note: 'Slow and often very bright. Few per hour, but the ones you get are worth the wait.' },
    { code: 'PER', name: 'Perseids', lam: 140.0, ra: 48.2, dec: 58.1, dra: 1.35, ddec: 0.12,
      zhr: 100, r: 2.2, B: 0.05, v: 59, from: 120.0, to: 155.0, parent: '109P/Swift-Tuttle',
      note: 'The one most people mean. Warm nights in the north, a radiant that never sets, a broad peak.' },
    { code: 'KCG', name: 'Kappa Cygnids', lam: 145.0, ra: 286.0, dec: 59.0, dra: 0.60, ddec: 0.10,
      zhr: 3, r: 3.0, B: 0.068, v: 25, from: 138.0, to: 152.0, parent: '2008 ED69',
      note: 'Slow fireballs in some years, nothing at all in others.' },
    { code: 'AUR', name: 'Alpha Aurigids', lam: 158.6, ra: 84.6, dec: 39.9, dra: 1.10, ddec: 0.00,
      zhr: 6, r: 2.6, B: 0.19, v: 66, from: 156.0, to: 161.0, parent: 'C/1911 N1 Kiess',
      note: 'A short, sharp shower with a history of outbursts.' },
    { code: 'SPE', name: 'September Epsilon Perseids', lam: 166.7, ra: 47.6, dec: 39.6, dra: 1.00, ddec: 0.10,
      zhr: 5, r: 3.0, B: 0.19, v: 64, from: 160.0, to: 172.0, parent: 'unknown',
      note: 'Fast meteors from a radiant that rises late in the evening.' },
    { code: 'DRA', name: 'Draconids', lam: 195.4, ra: 262.1, dec: 55.9, dra: 0.00, ddec: 0.00,
      zhr: 5, r: 2.6, B: 0.90, v: 20, from: 194.5, to: 196.2, parent: '21P/Giacobini-Zinner',
      note: 'The unpredictable one. Usually quiet, occasionally a storm, and best in the early evening rather than after midnight.' },
    { code: 'ORI', name: 'Orionids', lam: 208.0, ra: 95.5, dec: 15.8, dra: 1.20, ddec: 0.10,
      zhr: 20, r: 2.5, B: 0.12, v: 66, from: 195.0, to: 220.0, parent: '1P/Halley',
      note: 'Halley again, on the other side of the orbit. Fast, with a broad shoulder either side of the peak.' },
    { code: 'LMI', name: 'Leonis Minorids', lam: 209.7, ra: 162.0, dec: 37.0, dra: 1.00, ddec: -0.30,
      zhr: 2, r: 3.0, B: 0.14, v: 62, from: 205.0, to: 214.0, parent: 'C/1739 K1',
      note: 'A minor stream worth knowing about when the Orionids are running.' },
    { code: 'STA', name: 'Southern Taurids', lam: 223.0, ra: 50.0, dec: 13.0, dra: 0.80, ddec: 0.20,
      zhr: 5, r: 2.3, B: 0.026, v: 27, from: 190.0, to: 240.0, parent: '2P/Encke',
      note: 'Weeks of low, steady activity with a strong fireball reputation in swarm years.' },
    { code: 'NTA', name: 'Northern Taurids', lam: 230.0, ra: 58.0, dec: 22.3, dra: 0.80, ddec: 0.15,
      zhr: 5, r: 2.3, B: 0.026, v: 29, from: 200.0, to: 245.0, parent: '2P/Encke',
      note: 'The northern branch of the same dust, peaking a fortnight after the southern one.' },
    { code: 'LEO', name: 'Leonids', lam: 235.27, ra: 152.3, dec: 21.8, dra: 0.70, ddec: -0.40,
      zhr: 15, r: 2.5, B: 0.55, v: 71, from: 230.0, to: 240.0, parent: '55P/Tempel-Tuttle',
      note: 'The fastest meteors in the calendar. Storm years come roughly every 33 years; this is not one of them.' },
    { code: 'HYD', name: 'Sigma Hydrids', lam: 255.0, ra: 127.0, dec: 2.0, dra: 0.90, ddec: -0.20,
      zhr: 7, r: 3.0, B: 0.10, v: 58, from: 248.0, to: 262.0, parent: 'unknown',
      note: 'A quiet stream running underneath the Geminids.' },
    { code: 'MON', name: 'December Monocerotids', lam: 260.9, ra: 102.0, dec: 8.0, dra: 1.00, ddec: -0.10,
      zhr: 3, r: 3.0, B: 0.25, v: 42, from: 255.0, to: 266.0, parent: 'C/1917 F1 Mellish',
      note: 'Small numbers, but the radiant is up all night in December.' },
    { code: 'GEM', name: 'Geminids', lam: 262.2, ra: 113.5, dec: 32.3, dra: 1.02, ddec: -0.10,
      zhr: 150, r: 2.6, B: 0.39, v: 35, from: 255.0, to: 268.0, parent: '3200 Phaethon',
      note: 'The richest shower of the year, from an asteroid rather than a comet. Medium speed, often yellow.' },
    { code: 'URS', name: 'Ursids', lam: 270.7, ra: 217.0, dec: 75.4, dra: 0.30, ddec: -0.10,
      zhr: 10, r: 3.0, B: 0.90, v: 33, from: 268.0, to: 274.0, parent: '8P/Tuttle',
      note: 'A northern circumpolar radiant a few days before Christmas, usually observed by almost nobody.' },
    { code: 'PAU', name: 'Piscis Austrinids', lam: 125.0, ra: 341.0, dec: -30.0, dra: 0.90, ddec: 0.20,
      zhr: 5, r: 3.2, B: 0.20, v: 35, from: 118.0, to: 133.0, parent: 'unknown',
      note: 'Southern hemisphere company for the Delta Aquariids.' },
    { code: 'JBO', name: 'June Bootids', lam: 85.5, ra: 224.0, dec: 48.0, dra: 0.00, ddec: 0.00,
      zhr: 2, r: 2.2, B: 0.50, v: 18, from: 84.0, to: 87.0, parent: '7P/Pons-Winnecke',
      note: 'Nothing most years, then an outburst without warning. Very slow meteors.' },
    { code: 'PPU', name: 'Pi Puppids', lam: 27.0, ra: 110.0, dec: -45.0, dra: 0.00, ddec: 0.00,
      zhr: 2, r: 2.0, B: 0.40, v: 18, from: 25.5, to: 28.5, parent: '26P/Grigg-Skjellerup',
      note: 'Southern, slow, and tied to its comet returning. Evening shower.' },
    { code: 'ELY', name: 'Eta Lyrids', lam: 48.0, ra: 287.0, dec: 44.0, dra: 0.60, ddec: 0.10,
      zhr: 3, r: 3.0, B: 0.20, v: 43, from: 44.0, to: 52.0, parent: 'C/1983 H1 IRAS-Araki-Alcock',
      note: 'A small stream from a comet that once passed very close to Earth.' }
  ];

  /* ---------------- Bortle classes ---------------- */
  const BORTLE = [
    null,
    { n: 1, label: 'Excellent dark sky', lm: 7.8, blurb: 'The zodiacal light is obvious and the Milky Way casts shadows.' },
    { n: 2, label: 'Truly dark sky', lm: 7.5, blurb: 'The Milky Way is highly structured. Clouds are dark holes in the sky.' },
    { n: 3, label: 'Rural sky', lm: 7.0, blurb: 'Light domes sit on the horizon. The Milky Way still shows detail overhead.' },
    { n: 4, label: 'Rural and suburban edge', lm: 6.5, blurb: 'The Milky Way is there but flat. Light domes are noticeable.' },
    { n: 5, label: 'Suburban sky', lm: 6.0, blurb: 'The Milky Way is faint or missing near the horizon.' },
    { n: 6, label: 'Bright suburban sky', lm: 5.5, blurb: 'The Milky Way is only visible near the zenith, if at all.' },
    { n: 7, label: 'Suburban and urban edge', lm: 5.0, blurb: 'The whole sky has a greyish glow. No Milky Way.' },
    { n: 8, label: 'City sky', lm: 4.5, blurb: 'You can read a newspaper outside. Constellations are missing their fainter stars.' },
    { n: 9, label: 'Inner city sky', lm: 4.0, blurb: 'Only the Moon, the planets and a few dozen stars get through.' }
  ];

  /* Self-assessment used at first run, because most people do not know their Bortle number. */
  const SKY_CHECK = [
    { b: 2, label: 'The Milky Way is a bright, structured band', sub: 'A properly dark site' },
    { b: 4, label: 'I can see the Milky Way, faintly', sub: 'Countryside, or a small town' },
    { b: 6, label: 'Plenty of stars, but no Milky Way', sub: 'Suburbs, or a village near a city' },
    { b: 7, label: 'The main constellations and not much else', sub: 'A town or a bright suburb' },
    { b: 9, label: 'A handful of stars on a good night', sub: 'City centre' }
  ];

  /* ---------------- naked eye and binocular targets ---------------- */
  const TARGETS = [
    { id: 'mw', name: 'The Milky Way core', ra: 266.4, dec: -28.9, mag: null, maxB: 5, kind: 'naked eye',
      blurb: 'The centre of the galaxy, in Sagittarius. Needs a genuinely dark sky and a clear southern horizon.' },
    { id: 'm31', name: 'Andromeda Galaxy', ra: 10.7, dec: 41.3, mag: 3.4, maxB: 6, kind: 'naked eye',
      blurb: 'The furthest thing a person can see without help. Two and a half million years old by the time it lands.' },
    { id: 'm42', name: 'Orion Nebula', ra: 83.8, dec: -5.4, mag: 4.0, maxB: 7, kind: 'binoculars',
      blurb: 'The middle star of Orion sword is not a star. Binoculars show the fuzz; any telescope shows the wings.' },
    { id: 'm45', name: 'The Pleiades', ra: 56.6, dec: 24.1, mag: 1.6, maxB: 9, kind: 'naked eye',
      blurb: 'Six stars to most eyes, seven to good ones, and a field of dozens in binoculars.' },
    { id: 'hyades', name: 'The Hyades', ra: 66.7, dec: 15.9, mag: 0.5, maxB: 9, kind: 'naked eye',
      blurb: 'The V of Taurus. The nearest open cluster to us, and it fills a pair of binoculars.' },
    { id: 'dbl', name: 'The Double Cluster', ra: 34.8, dec: 57.1, mag: 4.3, maxB: 5, kind: 'binoculars',
      blurb: 'Two open clusters side by side between Perseus and Cassiopeia. Better in binoculars than in most telescopes.' },
    { id: 'm44', name: 'The Beehive', ra: 130.1, dec: 19.7, mag: 3.7, maxB: 6, kind: 'naked eye',
      blurb: 'A smudge in Cancer to the eye, a swarm of stars in binoculars.' },
    { id: 'm13', name: 'Hercules Cluster', ra: 250.4, dec: 36.5, mag: 5.8, maxB: 4, kind: 'binoculars',
      blurb: 'Half a million stars in a ball, on the western side of the Keystone.' },
    { id: 'm22', name: 'M22 in Sagittarius', ra: 279.1, dec: -23.9, mag: 5.1, maxB: 4, kind: 'binoculars',
      blurb: 'A globular cluster brighter than M13, if your southern horizon is low enough.' },
    { id: 'm7', name: 'Ptolemy Cluster', ra: 268.5, dec: -34.8, mag: 3.3, maxB: 6, kind: 'naked eye',
      blurb: 'Catalogued in the second century. Sits in the brightest part of the summer Milky Way.' },
    { id: 'omc', name: 'Omega Centauri', ra: 201.7, dec: -47.5, mag: 3.9, maxB: 6, kind: 'naked eye',
      blurb: 'The largest globular cluster in the galaxy, and a southern sky privilege.' },
    { id: 'lmc', name: 'Large Magellanic Cloud', ra: 80.9, dec: -69.8, mag: 0.9, maxB: 5, kind: 'naked eye',
      blurb: 'A whole satellite galaxy, visible from the south as a detached piece of Milky Way.' },
    { id: 'smc', name: 'Small Magellanic Cloud', ra: 13.2, dec: -72.8, mag: 2.7, maxB: 4, kind: 'naked eye',
      blurb: 'The fainter companion, with the globular 47 Tucanae beside it.' },
    { id: 'cru', name: 'The Southern Cross and the Coalsack', ra: 187.0, dec: -60.0, mag: 1.3, maxB: 7, kind: 'naked eye',
      blurb: 'The smallest constellation, with a dark nebula next to it that looks like a hole.' },
    { id: 'alb', name: 'Albireo', ra: 292.7, dec: 28.0, mag: 3.1, maxB: 9, kind: 'binoculars',
      blurb: 'The head of the swan splits into gold and blue in almost any optics.' },
    { id: 'miz', name: 'Mizar and Alcor', ra: 201.0, dec: 54.9, mag: 2.2, maxB: 8, kind: 'naked eye',
      blurb: 'The bend in the Plough handle. Splitting the pair by eye was once an eyesight test.' },
    { id: 'm81', name: 'M81 and M82', ra: 148.9, dec: 69.1, mag: 6.9, maxB: 3, kind: 'binoculars',
      blurb: 'Two galaxies in one binocular field, high in the northern sky most of the year.' }
  ];

  /* ---------------- the life list ---------------- */
  const LIFE = [
    { g: 'Sun and Moon', items: [
      { id: 'tse', name: 'Total solar eclipse', hint: 'Two minutes that reorganise your priorities.' },
      { id: 'ase', name: 'Annular eclipse', hint: 'The ring of fire, when the Moon is too far away to cover the Sun.' },
      { id: 'pse', name: 'Partial solar eclipse', hint: 'Safe projection only. Never look at the Sun directly.' },
      { id: 'tle', name: 'Total lunar eclipse', hint: 'The Moon turned copper by every sunrise on Earth at once.' },
      { id: 'ple', name: 'Partial lunar eclipse', hint: 'Earth shadow with a hard curved edge.' },
      { id: 'earth', name: 'Earthshine', hint: 'The dark part of a crescent Moon, lit by our own planet.' },
      { id: 'halo', name: 'A lunar halo', hint: 'A 22 degree ring around the Moon, drawn by ice crystals.' },
      { id: 'occ', name: 'A lunar occultation', hint: 'The Moon passing in front of a planet or a bright star.' }
    ]},
    { g: 'Planets and comets', items: [
      { id: 'five', name: 'All five naked eye planets in one night', hint: 'Mercury is the one that makes it hard.' },
      { id: 'vday', name: 'Venus in daylight', hint: 'Possible with a clear blue sky and a good idea of where to look.' },
      { id: 'jmoons', name: 'The moons of Jupiter', hint: 'Binoculars, braced against a wall. Galileo used less.' },
      { id: 'rings', name: 'The rings of Saturn', hint: 'The smallest telescope in the world still does this.' },
      { id: 'conj', name: 'A conjunction under one degree', hint: 'Two planets close enough to cover with a fingernail.' },
      { id: 'comet', name: 'A comet with the naked eye', hint: 'Rare, and never on schedule.' }
    ]},
    { g: 'Meteors', items: [
      { id: 'peak', name: 'A shower at its peak', hint: 'Out for a full hour, no phone, eyes adapted.' },
      { id: 'fire', name: 'A fireball', hint: 'Brighter than Venus. You will not need to ask whether it counted.' },
      { id: 'train', name: 'A persistent train', hint: 'The glowing trail that hangs in the air afterwards.' },
      { id: 'grazer', name: 'An Earth grazer', hint: 'A meteor entering at a shallow angle, crossing half the sky slowly.' }
    ]},
    { g: 'Deep sky', items: [
      { id: 'mwcore', name: 'The Milky Way core', hint: 'The galaxy centre, structured and obvious, from a dark site.' },
      { id: 'and', name: 'Andromeda with the naked eye', hint: 'The furthest object visible without help.' },
      { id: 'orion', name: 'The Orion Nebula', hint: 'A star nursery you can find in a city.' },
      { id: 'glob', name: 'A globular cluster', hint: 'M13 in the north, Omega Centauri in the south.' },
      { id: 'mag', name: 'The Magellanic Clouds', hint: 'Two galaxies, southern skies only.' }
    ]},
    { g: 'Air and light', items: [
      { id: 'zodi', name: 'Zodiacal light', hint: 'A faint cone of sunlight on dust, after dusk in spring or before dawn in autumn.' },
      { id: 'nlc', name: 'Noctilucent clouds', hint: 'Electric blue clouds at the edge of space, summer twilight, mid latitudes.' },
      { id: 'aurora', name: 'Aurora', hint: 'Umbra cannot forecast this. It has no network. Log it when you catch it.' },
      { id: 'pillar', name: 'A sun pillar or a green flash', hint: 'Horizon phenomena that reward watching the Sun set properly.' }
    ]}
  ];
  const LIFE_INDEX = {};
  for (const g of LIFE) for (const it of g.items) LIFE_INDEX[it.id] = { ...it, group: g.g };

  /* ---------------- a starting place list ----------------
     Coordinates only. Umbra never guesses how dark your sky is; you tell it that yourself. */
  const CITIES = [
    ['Auckland', 'NZ', -36.85, 174.76], ['Adelaide', 'AU', -34.93, 138.60], ['Amsterdam', 'NL', 52.37, 4.90],
    ['Ankara', 'TR', 39.93, 32.86], ['Athens', 'GR', 37.98, 23.73], ['Atlanta', 'US', 33.75, -84.39],
    ['Austin', 'US', 30.27, -97.74], ['Bangalore', 'IN', 12.97, 77.59],
    ['Bangkok', 'TH', 13.76, 100.50], ['Barcelona', 'ES', 41.39, 2.17], ['Beijing', 'CN', 39.90, 116.41],
    ['Belfast', 'GB', 54.60, -5.93], ['Bergen', 'NO', 60.39, 5.32], ['Berlin', 'DE', 52.52, 13.40],
    ['Bogota', 'CO', 4.71, -74.07], ['Boston', 'US', 42.36, -71.06], ['Brisbane', 'AU', -27.47, 153.03],
    ['Brussels', 'BE', 50.85, 4.35], ['Bucharest', 'RO', 44.43, 26.10], ['Budapest', 'HU', 47.50, 19.04],
    ['Buenos Aires', 'AR', -34.60, -58.38], ['Cairo', 'EG', 30.04, 31.24], ['Calgary', 'CA', 51.05, -114.07],
    ['Cape Town', 'ZA', -33.92, 18.42], ['Chennai', 'IN', 13.08, 80.27], ['Chicago', 'US', 41.88, -87.63],
    ['Christchurch', 'NZ', -43.53, 172.64], ['Copenhagen', 'DK', 55.68, 12.57], ['Dallas', 'US', 32.78, -96.80],
    ['Delhi', 'IN', 28.61, 77.21], ['Denver', 'US', 39.74, -104.99], ['Dubai', 'AE', 25.20, 55.27],
    ['Dublin', 'IE', 53.35, -6.26], ['Edinburgh', 'GB', 55.95, -3.19], ['Edmonton', 'CA', 53.55, -113.49],
    ['Fairbanks', 'US', 64.84, -147.72], ['Frankfurt', 'DE', 50.11, 8.68], ['Gothenburg', 'SE', 57.71, 11.97],
    ['Halifax', 'CA', 44.65, -63.58], ['Hamburg', 'DE', 53.55, 9.99], ['Helsinki', 'FI', 60.17, 24.94],
    ['Hobart', 'AU', -42.88, 147.33], ['Hong Kong', 'HK', 22.32, 114.17], ['Honolulu', 'US', 21.31, -157.86],
    ['Houston', 'US', 29.76, -95.37], ['Hyderabad', 'IN', 17.39, 78.49], ['Istanbul', 'TR', 41.01, 28.98],
    ['Jakarta', 'ID', -6.21, 106.85], ['Johannesburg', 'ZA', -26.20, 28.05], ['Kolkata', 'IN', 22.57, 88.36],
    ['Kuala Lumpur', 'MY', 3.14, 101.69], ['Lagos', 'NG', 6.52, 3.38], ['Las Vegas', 'US', 36.17, -115.14],
    ['Lima', 'PE', -12.05, -77.04], ['Lisbon', 'PT', 38.72, -9.13], ['London', 'GB', 51.51, -0.13],
    ['Los Angeles', 'US', 34.05, -118.24], ['Madrid', 'ES', 40.42, -3.70], ['Manchester', 'GB', 53.48, -2.24],
    ['Manila', 'PH', 14.60, 120.98], ['Melbourne', 'AU', -37.81, 144.96], ['Mexico City', 'MX', 19.43, -99.13],
    ['Miami', 'US', 25.76, -80.19], ['Milan', 'IT', 45.46, 9.19], ['Minneapolis', 'US', 44.98, -93.27],
    ['Montreal', 'CA', 45.50, -73.57], ['Moscow', 'RU', 55.76, 37.62], ['Mumbai', 'IN', 19.08, 72.88],
    ['Munich', 'DE', 48.14, 11.58], ['Nairobi', 'KE', -1.29, 36.82], ['Naples', 'IT', 40.85, 14.27],
    ['New York', 'US', 40.71, -74.01], ['Oslo', 'NO', 59.91, 10.75], ['Ottawa', 'CA', 45.42, -75.70],
    ['Paris', 'FR', 48.86, 2.35], ['Perth', 'AU', -31.95, 115.86], ['Phoenix', 'US', 33.45, -112.07],
    ['Portland', 'US', 45.52, -122.68], ['Prague', 'CZ', 50.08, 14.44], ['Pune', 'IN', 18.52, 73.86],
    ['Quebec City', 'CA', 46.81, -71.21], ['Reykjavik', 'IS', 64.15, -21.94], ['Riga', 'LV', 56.95, 24.11],
    ['Rio de Janeiro', 'BR', -22.91, -43.17], ['Riyadh', 'SA', 24.71, 46.68], ['Rome', 'IT', 41.90, 12.50],
    ['Salt Lake City', 'US', 40.76, -111.89], ['San Diego', 'US', 32.72, -117.16], ['San Francisco', 'US', 37.77, -122.42],
    ['Santiago', 'CL', -33.45, -70.67], ['Sao Paulo', 'BR', -23.55, -46.63], ['Sapporo', 'JP', 43.06, 141.35],
    ['Seattle', 'US', 47.61, -122.33], ['Seoul', 'KR', 37.57, 126.98], ['Shanghai', 'CN', 31.23, 121.47],
    ['Singapore', 'SG', 1.35, 103.82], ['Sofia', 'BG', 42.70, 23.32], ['St Petersburg', 'RU', 59.93, 30.34],
    ['Stockholm', 'SE', 59.33, 18.07], ['Sydney', 'AU', -33.87, 151.21], ['Taipei', 'TW', 25.03, 121.57],
    ['Tallinn', 'EE', 59.44, 24.75], ['Tehran', 'IR', 35.69, 51.39], ['Tel Aviv', 'IL', 32.08, 34.78],
    ['Tokyo', 'JP', 35.68, 139.65], ['Toronto', 'CA', 43.65, -79.38], ['Tromso', 'NO', 69.65, 18.96],
    ['Vancouver', 'CA', 49.28, -123.12], ['Vienna', 'AT', 48.21, 16.37], ['Warsaw', 'PL', 52.23, 21.01],
    ['Wellington', 'NZ', -41.29, 174.78], ['Winnipeg', 'CA', 49.90, -97.14], ['Yellowknife', 'CA', 62.45, -114.37],
    ['Zurich', 'CH', 47.38, 8.54]
  ].map(c => ({ name: c[0], cc: c[1], lat: c[2], lon: c[3] }));

  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const compass = az => COMPASS[Math.round(((az % 360) + 360) % 360 / 22.5) % 16];

  return { SHOWERS, BORTLE, SKY_CHECK, TARGETS, LIFE, LIFE_INDEX, CITIES, COMPASS, compass };
})();
if (typeof module !== 'undefined') module.exports = Data;
