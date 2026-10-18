/* The six stocks. A stock is not a filter: it is a colour response per channel,
   a grain structure, a halation response and a set of quirks it is honest about
   on the box. Every number here is used by film.js at development time. */
const Stocks = (() => {

  const LIST = [

    { id: 'meridian100', name: 'Meridian 100', iso: 100,
      line: 'Colour as it was.',
      note: 'A fine-grained daylight film with no opinions. Neutral greys, clean skies, highlights that give way slowly instead of clipping. Load this when the light is already doing the work.',
      box: { paper: '#E4DDCC', ink: '#16211F', band: '#2F6B63', style: 'band' },
      hint: 'saturate(1.04) contrast(1.03)',
      curve: { r: { gain: 1.02, gamma: 0.98, knee: 0.72, roll: 1.6, lift: 0.012 },
               g: { gain: 1.00, gamma: 1.00, knee: 0.74, roll: 1.5, lift: 0.014 },
               b: { gain: 0.99, gamma: 1.03, knee: 0.76, roll: 1.4, lift: 0.020 } },
      sat: 1.03, mono: false,
      grain: { amp: 0.030, size: 1.00, rough: 0.45, chroma: 0.25 },
      halation: { threshold: 0.82, bleed: 0.20, tint: [1, 0.52, 0.34] },
      vignette: 0.10,
      quirks: [] },

    { id: 'cornerstore400', name: 'Corner Store 400', iso: 400,
      line: 'Warm, cheap, unreliable.',
      note: 'The film from the rack by the till. Warm, forgiving, a little soft in the corners, and every so often a frame comes back a stop dark for no reason anybody has explained. Frames one and thirty-six catch light from the cassette mouth.',
      box: { paper: '#C93724', ink: '#FFF3D6', band: '#F2B430', style: 'split' },
      hint: 'sepia(0.16) saturate(1.06) contrast(0.97) brightness(1.02)',
      curve: { r: { gain: 1.08, gamma: 0.92, knee: 0.68, roll: 2.0, lift: 0.035 },
               g: { gain: 1.00, gamma: 0.97, knee: 0.70, roll: 1.9, lift: 0.030 },
               b: { gain: 0.90, gamma: 1.10, knee: 0.72, roll: 1.8, lift: 0.055 } },
      sat: 0.95, mono: false,
      grain: { amp: 0.055, size: 1.30, rough: 0.60, chroma: 0.45 },
      halation: { threshold: 0.74, bleed: 0.34, tint: [1, 0.45, 0.26] },
      vignette: 0.28,
      quirks: [ { k: 'leak', frames: [1, 36], strength: 0.55 },
                { k: 'under', p: 0.10, stops: 0.85 } ] },

    { id: 'nightbus1600', name: 'Nightbus 1600', iso: 1600,
      line: 'For the last train home.',
      note: 'Pushed for tungsten and streetlight. Big open grain, blue-green shadows, and halation that lets every bright sign bleed a red edge into the dark around it. It is not a clean film and it is not trying to be.',
      box: { paper: '#14171B', ink: '#D9F26B', band: '#D9F26B', style: 'plate' },
      hint: 'saturate(0.84) contrast(1.10) hue-rotate(-8deg) brightness(0.96)',
      curve: { r: { gain: 0.94, gamma: 1.06, knee: 0.66, roll: 2.2, lift: 0.050 },
               g: { gain: 0.99, gamma: 1.00, knee: 0.68, roll: 2.1, lift: 0.055 },
               b: { gain: 1.10, gamma: 0.94, knee: 0.70, roll: 2.0, lift: 0.075 } },
      sat: 0.84, mono: false,
      grain: { amp: 0.115, size: 1.90, rough: 0.72, chroma: 0.55 },
      halation: { threshold: 0.60, bleed: 0.55, tint: [1, 0.38, 0.22] },
      vignette: 0.22,
      quirks: [] },

    { id: 'gullwing', name: 'Gullwing B&W', iso: 125,
      line: 'Silver, nothing else.',
      note: 'A classic silver emulsion with the old panchromatic weighting: reds go a shade darker than your eye expects, skies hold their tone, skin sits high. Structured grain that sharpens the frame rather than smearing it.',
      box: { paper: '#C9C6BE', ink: '#131313', band: '#131313', style: 'band' },
      hint: 'grayscale(1) contrast(1.12)',
      curve: { r: { gain: 1.03, gamma: 1.06, knee: 0.74, roll: 1.7, lift: 0.018 },
               g: { gain: 1.03, gamma: 1.06, knee: 0.74, roll: 1.7, lift: 0.018 },
               b: { gain: 1.03, gamma: 1.06, knee: 0.74, roll: 1.7, lift: 0.018 } },
      sat: 0, mono: true, monoWeights: [0.26, 0.64, 0.10],
      grain: { amp: 0.070, size: 1.35, rough: 0.62, chroma: 0 },
      halation: { threshold: 0.86, bleed: 0.14, tint: [1, 1, 1] },
      vignette: 0.14,
      quirks: [] },

    { id: 'riviera50', name: 'Riviera 50', iso: 50,
      line: 'Bring sunglasses.',
      note: 'A slide film, so it keeps almost nothing in the shadows and asks you to expose for the light instead. Saturation that would be rude anywhere but a coastline, and grain so fine you have to look for it.',
      box: { paper: '#1B4FA8', ink: '#FFFFFF', band: '#FFCF3F', style: 'split' },
      hint: 'saturate(1.32) contrast(1.10)',
      curve: { r: { gain: 1.04, gamma: 1.12, knee: 0.80, roll: 3.0, lift: 0.004 },
               g: { gain: 1.02, gamma: 1.14, knee: 0.80, roll: 3.0, lift: 0.004 },
               b: { gain: 1.05, gamma: 1.10, knee: 0.80, roll: 3.0, lift: 0.006 } },
      sat: 1.34, mono: false,
      grain: { amp: 0.022, size: 0.90, rough: 0.40, chroma: 0.18 },
      halation: { threshold: 0.88, bleed: 0.12, tint: [1, 0.60, 0.40] },
      vignette: 0.18,
      quirks: [] },

    { id: 'statik', name: 'Statik', iso: 200,
      line: 'Expired. No promises.',
      note: 'A roll that sat in a glovebox for eleven years. Base fog, colour that drifts frame to frame, and light that gets in where it should not. Every frame is developed from its own seed, so no two are wrong the same way.',
      box: { paper: '#B9AC90', ink: '#2A2418', band: '#7C2D2D', style: 'kraft' },
      hint: 'sepia(0.10) saturate(0.90) contrast(1.05) hue-rotate(6deg)',
      curve: { r: { gain: 1.02, gamma: 0.96, knee: 0.66, roll: 2.1, lift: 0.070 },
               g: { gain: 0.98, gamma: 1.00, knee: 0.68, roll: 2.0, lift: 0.060 },
               b: { gain: 0.94, gamma: 1.05, knee: 0.68, roll: 1.9, lift: 0.090 } },
      sat: 0.88, mono: false,
      grain: { amp: 0.090, size: 1.60, rough: 0.68, chroma: 0.60 },
      halation: { threshold: 0.70, bleed: 0.40, tint: [1, 0.42, 0.30] },
      vignette: 0.30,
      quirks: [ { k: 'drift', gain: 0.18, gamma: 0.12, fog: 0.06 },
                { k: 'leak', p: 0.28, strength: 0.7 } ] }
  ];

  const MAP = Object.fromEntries(LIST.map(s => [s.id, s]));
  const get = id => MAP[id] || LIST[0];

  /** Human spec-sheet rows for the box back. */
  function spec(s) {
    const g = s.grain;
    const grainWord = g.amp < 0.03 ? 'very fine' : g.amp < 0.06 ? 'fine' : g.amp < 0.09 ? 'open' : 'coarse';
    const halWord = s.halation.bleed < 0.15 ? 'restrained' : s.halation.bleed < 0.3 ? 'moderate' : s.halation.bleed < 0.45 ? 'generous' : 'heavy';
    const rows = [
      ['Speed', 'ISO ' + s.iso],
      ['Response', s.mono ? 'Panchromatic, red-weighted' : s.sat > 1.2 ? 'Reversal, high saturation' : s.sat < 0.9 ? 'Negative, muted' : 'Negative, neutral'],
      ['Grain', `${grainWord}, ${g.rough > 0.65 ? 'clumped' : g.rough > 0.5 ? 'structured' : 'tight'}`],
      ['Halation', `${halWord}, from ${Math.round(s.halation.threshold * 100)} percent white up`],
      ['Falloff', s.vignette > 0.25 ? 'Soft corners' : s.vignette > 0.15 ? 'Slight corners' : 'Even to the edge']
    ];
    const q = [];
    for (const k of s.quirks) {
      if (k.k === 'leak' && k.frames) q.push(`Light leak on frames ${k.frames.join(' and ')}`);
      if (k.k === 'leak' && k.p) q.push('Light leaks, wherever they feel like it');
      if (k.k === 'under') q.push('Roughly one frame in ten comes back under');
      if (k.k === 'drift') q.push('Colour drifts frame to frame');
    }
    rows.push(['Quirks', q.length ? q.join('. ') : 'None. It behaves.']);
    return rows;
  }

  return { LIST, get, spec };
})();
