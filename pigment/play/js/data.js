/* Pigment. The box of paint, the paper stocks, the brushes and the lessons.

   Colour here is a material, not a value. Every pigment is described the way a
   manufacturer describes one: a masstone, a scattering strength, and how much it
   granulates, stains and lifts. The renderer turns masstone plus scattering into
   Kubelka-Munk absorption and scattering coefficients, so mixing two of these
   behaves subtractively. Blue and yellow make green because the arithmetic says so,
   not because a lookup table was written by hand. */

const Data = (() => {

  /* sRGB -> linear reflectance. Masstones below are written as the colour you see. */
  function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function hexLin(h) {
    const n = parseInt(h.slice(1), 16);
    return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)];
  }

  /* K/S from a target masstone: R = 1 + x - sqrt(x^2 + 2x) inverts to x = (1-R)^2 / 2R.

     The exponent is the one piece of honest fudge in the model. Three broad bands
     are not spectral samples, and real particles shade each other as a wash gets
     stronger, so absorption does not keep climbing at the rate a naive inversion
     predicts. Without the compression a diluted ultramarine turns cyan and a blue
     plus a yellow turns grey. With it, wash charts and mixes both land where a
     painter expects them. */
  const CONTRAST = 0.74, FLOOR = 0.006, CEIL = 0.965;
  function coeffs(hex, S) {
    const r = hexLin(hex);
    return r.map(v => {
      const R = Math.min(CEIL, Math.max(FLOOR, v));
      const x = ((1 - R) * (1 - R)) / (2 * R);
      return S * Math.pow(x, CONTRAST);
    });
  }

  const RAW = [
    // id, name, code, family, masstone, scattering, granulation, staining, note
    ['ultramarine', 'Ultramarine Blue', 'PB29', 'blue', '#17337F', 0.11, 0.85, 0.15,
      'Ground from lapis lazuli, it once cost more by weight than gold.'],
    ['phthaloblue', 'Phthalo Blue', 'PB15:3', 'blue', '#063A55', 0.045, 0.02, 0.95,
      'A laboratory accident from the 1930s. One brush load will colour a whole jar of water.'],
    ['cerulean', 'Cerulean Blue', 'PB35', 'blue', '#2F7FA8', 1.10, 0.90, 0.05,
      'A sky blue made with tin, heavy enough that you can watch it settle.'],
    ['cobalt', 'Cobalt Blue', 'PB28', 'blue', '#2A55A8', 0.55, 0.55, 0.10,
      'Invented in 1802 and adopted almost immediately for its clean, cool light.'],
    ['prussian', 'Prussian Blue', 'PB27', 'blue', '#092E38', 0.05, 0.05, 0.85,
      'The first modern synthetic pigment, made by accident in a Berlin dye works in 1706.'],

    ['quinrose', 'Quinacridone Rose', 'PV19', 'red', '#9C1049', 0.05, 0.02, 0.90,
      'Developed for car paint. It turned out to glaze like a jewel.'],
    ['pyrrol', 'Pyrrol Scarlet', 'PR255', 'red', '#D63220', 0.90, 0.05, 0.50,
      'A red from the 1980s bright enough to retire cadmium without the heavy metal.'],
    ['perylene', 'Perylene Maroon', 'PR179', 'red', '#6B1D1A', 0.35, 0.05, 0.60,
      'Quiet and dark. It reads as brick in a thin wash and as dried blood in a puddle.'],
    ['pottersp', "Potter's Pink", 'PR233', 'red', '#C08A8C', 1.40, 0.95, 0.02,
      'A tin pink from the English potteries, so coarse that a wash looks dusted on.'],

    ['hansa', 'Hansa Yellow Light', 'PY3', 'yellow', '#F5D316', 0.075, 0.02, 0.40,
      'A cool lemon yellow, transparent enough to leave green rather than mud.'],
    ['nickelazo', 'Nickel Azo Yellow', 'PY150', 'yellow', '#B58415', 0.05, 0.03, 0.85,
      'Weak on its own and transformative in a mix. Painters treat it as liquid ochre.'],
    ['ochre', 'Yellow Ochre', 'PY43', 'yellow', '#C89442', 0.75, 0.50, 0.05,
      'Dug out of the ground and painted on cave walls before anybody wrote anything down.'],
    ['transorange', 'Transparent Orange', 'PO71', 'yellow', '#D2601A', 0.05, 0.03, 0.70,
      'Glazes like stained glass, and turns any blue into a convincing shadow.'],

    ['phthalogreen', 'Phthalo Green', 'PG7', 'green', '#023C2F', 0.045, 0.02, 0.95,
      'Strong enough that most painters keep the tube at the back of the box on purpose.'],
    ['viridian', 'Viridian', 'PG18', 'green', '#17705E', 0.50, 0.75, 0.05,
      'A chromium green that separates in water and dries with the texture of moss.'],
    ['cobaltteal', 'Cobalt Teal', 'PG50', 'green', '#2FA5A8', 1.50, 0.65, 0.02,
      'Opaque, chalky and startling. One of the few watercolours that will sit on top.'],

    ['burntsienna', 'Burnt Sienna', 'PBr7', 'earth', '#9A4A26', 0.40, 0.45, 0.10,
      'Raw sienna, roasted. The oldest recipe there is for a warm brown.'],
    ['rawumber', 'Raw Umber', 'PBr7', 'earth', '#6B5433', 0.60, 0.55, 0.08,
      'Named for Umbria, where the earth it is made from is still dug today.'],
    ['venetian', 'Venetian Red', 'PR101', 'earth', '#9C4232', 1.30, 0.35, 0.05,
      'An opaque iron oxide that behaves more like gouache than like watercolour.'],
    ['goethite', 'Goethite', 'PY43', 'earth', '#96703C', 1.00, 1.00, 0.02,
      'Natural iron ore, coarsely ground. It settles into paper tooth like silt in a riverbed.'],

    ['lampblack', 'Lamp Black', 'PBk6', 'neutral', '#141416', 0.09, 0.03, 0.65,
      'Soot collected from burning oil, the same black that is on Roman walls.'],
    ['lunarblack', 'Lunar Black', 'PBk11', 'neutral', '#2B2B2E', 0.85, 1.00, 0.02,
      'A magnetic iron black so coarse that a wash cracks into craters as it dries.'],
    ['titanium', 'Titanium White', 'PW6', 'neutral', '#F3F2ED', 2.20, 0.05, 0.05,
      'The most opaque white ever made. In watercolour it is a decision, never a default.'],
    ['bufftitanium', 'Buff Titanium', 'PW6:1', 'neutral', '#E0D2B8', 1.80, 0.25, 0.05,
      'A warm chalky off white that turns anything it touches into a pastel.']
  ];

  const PIGMENTS = RAW.map(r => {
    const [id, name, code, family, hex, S, gran, stain, note] = r;
    const K = coeffs(hex, S);
    return {
      id, name, code, family, hex, note,
      S, gran, stain,
      lift: Math.round((1 - stain * 0.92) * 100) / 100,
      opacity: Math.min(1, S / 1.9),
      K
    };
  });

  const BY_ID = {};
  PIGMENTS.forEach((p, i) => { BY_ID[p.id] = p; p.index = i; });

  const FAMILIES = [
    { id: 'blue', label: 'Blues' },
    { id: 'red', label: 'Reds' },
    { id: 'yellow', label: 'Yellows and oranges' },
    { id: 'green', label: 'Greens' },
    { id: 'earth', label: 'Earths' },
    { id: 'neutral', label: 'Blacks and whites' }
  ];

  /* Paper. Tooth is the height of the grain, sizing is how long water sits on the
     surface before the sheet drinks it, wick is how far a wet edge crawls. */
  const PAPERS = [
    {
      id: 'cold', name: 'Cold press', weight: '300gsm rough',
      tone: '#FCFAF3', tooth: 1.0, grain: 0.30, absorb: 0.55, wick: 0.165, buckle: 0,
      blurb: 'Hills and valleys. Pigment settles in the low ground, a dry brush skips over the high ground.',
      short: 'Tooth you can feel'
    },
    {
      id: 'hot', name: 'Hot press', weight: '300gsm smooth',
      tone: '#FEFDF9', tooth: 0.22, grain: 0.85, absorb: 0.42, wick: 0.215, buckle: 0,
      blurb: 'Pressed flat under hot rollers. Washes slide, edges stay hard, and every mark shows.',
      short: 'Nothing to hide behind'
    },
    {
      id: 'student', name: 'Student cartridge', weight: '190gsm',
      tone: '#F8F5EA', tooth: 0.62, grain: 0.5, absorb: 1.30, wick: 0.105, buckle: 1,
      blurb: 'Lightly sized and thin. It drinks a wash before you have finished it, and it buckles when soaked.',
      short: 'Buckles, and that matters'
    }
  ];
  const PAPER_BY_ID = {}; PAPERS.forEach(p => PAPER_BY_ID[p.id] = p);

  const SIZES = [
    { id: 'tall', name: 'Tall sheet', ratio: 2 / 3, blurb: 'Portraits, trees, a single stem' },
    { id: 'sheet', name: 'Quarter sheet', ratio: 3 / 4, blurb: 'The default. Landscapes and studies' },
    { id: 'square', name: 'Square panel', ratio: 1, blurb: 'Colour studies and swatch work' }
  ];
  const SIZE_BY_ID = {}; SIZES.forEach(s => SIZE_BY_ID[s.id] = s);

  /* Brushes. radius is in canvas units, water and load are what the brush carries,
     dry is how quickly the load runs out along a stroke. */
  const BRUSHES = [
    { id: 'mop', name: 'Mop', hint: 'Holds a puddle. For skies and first washes.',
      shape: 'round', r: 30, soft: 0.85, water: 1.0, load: 0.85, dry: 0.0016, wob: 0.05 },
    { id: 'round', name: 'Round 12', hint: 'The one you reach for without thinking.',
      shape: 'round', r: 15, soft: 0.5, water: 0.78, load: 1.0, dry: 0.0028, wob: 0.06 },
    { id: 'detail', name: 'Round 4', hint: 'Small, springy, for the last five percent.',
      shape: 'round', r: 6, soft: 0.32, water: 0.6, load: 1.0, dry: 0.0042, wob: 0.05 },
    { id: 'flat', name: 'Flat wash 25mm', hint: 'A straight edge. Skies, walls, water lines.',
      shape: 'flat', r: 25, aspect: 0.24, soft: 0.35, water: 0.95, load: 0.95, dry: 0.0022, wob: 0.02 },
    { id: 'angle', name: 'Angled flat 12mm', hint: 'Cuts a clean corner, then a hairline on its tip.',
      shape: 'flat', r: 14, aspect: 0.3, angle: 0.7, soft: 0.3, water: 0.8, load: 1.0, dry: 0.0032, wob: 0.03 },
    { id: 'rigger', name: 'Rigger', hint: 'Long hair, tiny point. Rope, rigging, branches.',
      shape: 'round', r: 3.2, soft: 0.18, water: 0.7, load: 1.0, dry: 0.0034, wob: 0.14, taper: 1 },
    { id: 'fan', name: 'Fan', hint: 'Splayed bristles. Grass, spray, dry texture.',
      shape: 'fan', r: 19, tufts: 7, soft: 0.3, water: 0.42, load: 0.85, dry: 0.0060, wob: 0.1 },
    { id: 'sponge', name: 'Sponge', hint: 'Broken, random, never twice the same.',
      shape: 'sponge', r: 21, dabs: 9, soft: 0.42, water: 0.5, load: 0.8, dry: 0.0055, wob: 0.2 }
  ];
  const BRUSH_BY_ID = {}; BRUSHES.forEach(b => BRUSH_BY_ID[b.id] = b);

  const TOOLS = [
    { id: 'paint', name: 'Paint', hint: 'Water and pigment together, the way a loaded brush works.' },
    { id: 'water', name: 'Clean water', hint: 'Wets the paper without adding colour. Wet the sheet first and the next wash blooms.' },
    { id: 'lift', name: 'Lift', hint: 'A thirsty brush. Pulls colour back out of a wash that is still damp.' },
    { id: 'mask', name: 'Masking fluid', hint: 'Rubbery, and it keeps the paper white until you take it off.' },
    { id: 'heat', name: 'Heat', hint: 'A hairdryer. Dries where you point it, and hardens the edge you were softening.' }
  ];
  const TOOL_BY_ID = {}; TOOLS.forEach(t => TOOL_BY_ID[t.id] = t);

  /* Guided washes. Each step is one instruction; most advance when you have actually
     done the thing, which is why the condition is named rather than timed. */
  const LESSONS = [
    {
      id: 'flat', title: 'A flat wash', sub: 'The one every painter learns first',
      paper: 'cold', size: 'sheet', pigment: 'ultramarine', brush: 'mop', water: 0.58,
      steps: [
        { say: 'Load the mop and drag one band across the top of the paper.', sub: 'Left to right, do not lift.', on: 'stroke' },
        { say: 'Now a second band, overlapping the wet bottom edge of the first.', sub: 'The bead of water at the bottom is what you are chasing.', on: 'stroke' },
        { say: 'Keep going to the bottom of the sheet.', sub: 'Three or four more bands. Speed matters less than not stopping.', on: 'strokes', n: 3 },
        { say: 'Stop. Watch it dry for a moment.', sub: 'The wash flattens as the water leaves. Nothing you do now improves it.', on: 'tap' }
      ],
      end: 'A flat wash is not flat while it is wet. It becomes flat because you left it alone.'
    },
    {
      id: 'graded', title: 'A graded wash', sub: 'Dark at the top, paper at the bottom',
      paper: 'cold', size: 'sheet', pigment: 'prussian', brush: 'mop', water: 0.28,
      steps: [
        { say: 'Full strength band across the top.', sub: 'Water slider near the dry end, one confident pass.', on: 'stroke' },
        { say: 'Push the water slider up two notches and lay the next band.', sub: 'More water on the brush means the same paint arrives thinner.', on: 'water-up' },
        { say: 'Band by band, keep adding water until the brush leaves almost nothing.', sub: 'The gradient happens in the slider, not in the wrist.', on: 'strokes', n: 3 },
        { say: 'Tilt the phone forward if you want the top to run down into the bottom.', sub: 'Turn on tilt flow from the menu, or just leave it.', on: 'tap' }
      ],
      end: 'That fade is gravity and evaporation arguing. You set the terms and then got out of the way.'
    },
    {
      id: 'wetinwet', title: 'Wet into wet', sub: 'Where the blooms live',
      paper: 'cold', size: 'square', pigment: 'quinrose', brush: 'round', water: 0.62,
      steps: [
        { say: 'Switch to clean water and wet a patch in the middle of the sheet.', sub: 'It is in the tools button. Wet an area about the size of a plum.', on: 'tool-water' },
        { say: 'Now go back to paint and touch one spot inside the wet patch.', sub: 'One touch. Do not brush it around.', on: 'tool-paint-stroke' },
        { say: 'Watch it spread on its own, then touch a second colour beside it.', sub: 'Open the drawer and pick a yellow. They will meet in the middle.', on: 'stroke' },
        { say: 'Do not fix anything.', sub: 'Wet into wet is a negotiation. Interrupting it is how you get mud.', on: 'tap' }
      ],
      end: 'The soft edge you just made cannot be drawn. It can only be allowed.'
    },
    {
      id: 'backrun', title: 'The backrun', sub: 'Learning to want the mistake',
      paper: 'cold', size: 'square', pigment: 'burntsienna', brush: 'round', water: 0.58,
      steps: [
        { say: 'Lay a wet patch of colour and wait until the shine has just gone.', sub: 'Turn on the moisture view from the top bar if you want to see the sheen.', on: 'stroke' },
        { say: 'Now drop clean water into the middle of it.', sub: 'Switch to clean water, one heavy touch.', on: 'tool-water' },
        { say: 'Leave it completely alone.', sub: 'The clean water pushes the pigment outward into a ragged rim.', on: 'tap' },
        { say: 'That ragged rim is a backrun.', sub: 'Painters spend years learning to stop calling it a mistake.', on: 'tap' }
      ],
      end: 'Every cauliflower edge in a gallery was made by somebody who stopped panicking about them.'
    },
    {
      id: 'drybrush', title: 'Drybrush', sub: 'Paper tooth doing the drawing',
      paper: 'cold', size: 'sheet', pigment: 'rawumber', brush: 'fan', water: 0.12,
      steps: [
        { say: 'Water slider almost all the way dry, then drag the fan sideways.', sub: 'Fast, and barely touching.', on: 'stroke' },
        { say: 'Again, faster.', sub: 'The faster you go the more paper shows through.', on: 'stroke' },
        { say: 'Switch to hot press in your next painting and try the same stroke.', sub: 'On smooth paper this mark barely exists.', on: 'tap' }
      ],
      end: 'Drybrush is not a brush setting. It is a conversation between a dry brush and a rough sheet.'
    },
    {
      id: 'lifting', title: 'Lifting out', sub: 'Taking colour back off the paper',
      paper: 'cold', size: 'square', pigment: 'cerulean', brush: 'mop', water: 0.60,
      steps: [
        { say: 'Fill most of the sheet with a wet wash.', sub: 'Two or three overlapping passes.', on: 'strokes', n: 2 },
        { say: 'Switch to the lift tool and pull a cloud out of it.', sub: 'It is in the tools button. Cerulean lifts easily; it barely stains.', on: 'tool-lift' },
        { say: 'Now try lifting a stroke of phthalo blue.', sub: 'Open the drawer, paint a stripe, then try to take it off.', on: 'tap' },
        { say: 'It will not come off.', sub: 'Staining is a real property of a pigment, printed on the tube and honoured here.', on: 'tap' }
      ],
      end: 'Which colours will come back off is half of what a painter actually memorises.'
    }
  ];
  const LESSON_BY_ID = {}; LESSONS.forEach((l, i) => { LESSON_BY_ID[l.id] = l; l.index = i; });

  /* A pigment's swatch, drawn with the same Kubelka-Munk arithmetic the canvas uses,
     so the card in the drawer is not an illustration of the paint. It is the paint. */
  function swatch(ctx, pig, w, h, seed) {
    const img = ctx.createImageData(w, h);
    const d = img.data;
    let s = (seed || 7) >>> 0;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const grain = new Float32Array(w * h);
    for (let i = 0; i < grain.length; i++) grain[i] = rnd();
    // cheap 2-tap smoothing so the grain reads as paper, not television snow
    const g2 = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      g2[i] = (grain[i] + grain[y * w + Math.min(w - 1, x + 1)] +
               grain[Math.min(h - 1, y + 1) * w + x] + grain[i]) / 4;
    }
    const paper = [0.96, 0.95, 0.93];
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);
      const mass = 0.05 + Math.pow(1 - t, 2.1) * 3.3;   // full strength at the top
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const gn = (g2[i] - 0.5) * pig.gran * 1.5;
        const m = Math.max(0, mass * (1 + gn));
        const S = Math.max(1e-4, m * pig.S);
        const o = i * 4;
        for (let c = 0; c < 3; c++) {
          const K = m * pig.K[c];
          const xr = K / S;
          const Rinf = 1 + xr - Math.sqrt(xr * xr + 2 * xr);
          const T2 = Math.exp(-2 * (K + S));
          let R = Rinf * (1 - T2) + paper[c] * T2;
          R = 0.026 + 0.955 * R;
          d[o + c] = Math.round(255 * (R <= 0.0031308 ? R * 12.92 : 1.055 * Math.pow(R, 1 / 2.4) - 0.055));
        }
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* The same paint at one strength, for the small square that tells you what is on
     the brush. A tube's chip has to look like paint on paper at full body, so the
     mass is held rather than graded, and the granulation still shows. */
  function chip(ctx, pig, w, h, seed) {
    const img = ctx.createImageData(w, h);
    const d = img.data;
    let s = (seed || 11) >>> 0;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const paper = [0.96, 0.95, 0.93];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4;
        const n = (rnd() + rnd() + rnd()) / 3;
        const gn = (n - 0.5) * pig.gran * 1.15;
        // a chip is a puddle, so it is darkest where it pooled at the bottom edge
        const pool = 0.86 + 0.30 * (y / (h - 1));
        const m = Math.max(0, 2.35 * pool * (1 + gn));
        const S = Math.max(1e-4, m * pig.S);
        for (let c = 0; c < 3; c++) {
          const K = m * pig.K[c];
          const xr = K / S;
          const Rinf = 1 + xr - Math.sqrt(xr * xr + 2 * xr);
          const T2 = Math.exp(-2 * (K + S));
          let R = Rinf * (1 - T2) + paper[c] * T2;
          R = 0.026 + 0.955 * R;
          d[o + c] = Math.round(255 * (R <= 0.0031308 ? R * 12.92 : 1.055 * Math.pow(R, 1 / 2.4) - 0.055));
        }
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  return { PIGMENTS, BY_ID, FAMILIES, PAPERS, PAPER_BY_ID, SIZES, SIZE_BY_ID,
           BRUSHES, BRUSH_BY_ID, TOOLS, TOOL_BY_ID, LESSONS, LESSON_BY_ID, swatch, chip };
})();

window.Data = Data;
