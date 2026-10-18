/* Ferment: the authored content. Twelve recipes, the safety guide, the triage reference,
   and the line-drawn vessel glyphs. Nothing here is fetched; it ships inside the app. */

const Content = (() => {

  /* ---------- vessel glyphs, drawn as line art in a 24x24 box ---------- */
  const GLYPH = {
    crock:
      '<path d="M9.2 2.6h5.6"/><path d="M4.6 6.1h14.8"/>' +
      '<path d="M6.2 6.1v10.6c0 2.7 2.4 4.7 5.8 4.7s5.8-2 5.8-4.7V6.1"/>' +
      '<path d="M6.6 12.4h10.8"/>',
    starter:
      '<path d="M7.4 2.7h9.2v2.7H7.4z"/>' +
      '<path d="M6.4 5.4h11.2v13.1a2.8 2.8 0 0 1-2.8 2.8H9.2a2.8 2.8 0 0 1-2.8-2.8z"/>' +
      '<path d="M6.4 9.6h11.2"/><path d="M6.4 14.6h11.2"/>',
    loaf:
      '<path d="M3.4 15.4c0-4.3 3.9-7.6 8.6-7.6s8.6 3.3 8.6 7.6"/>' +
      '<path d="M2.8 15.4h18.4c.9 0 1.4 1 .9 1.8l-1 1.6c-.4.6-1 1-1.7 1H5.6c-.7 0-1.3-.4-1.7-1l-1-1.6c-.5-.8 0-1.8.9-1.8z"/>' +
      '<path d="M8.4 11.9l1.9 2.6"/><path d="M13.1 11.1l2.1 3"/>',
    bottle:
      '<path d="M9.8 2.6h4.4v4.1c0 .6.2 1.2.6 1.7l1.3 1.6c.5.6.8 1.4.8 2.2v6.7a2.7 2.7 0 0 1-2.7 2.7H9.8a2.7 2.7 0 0 1-2.7-2.7v-6.7c0-.8.3-1.6.8-2.2l1.3-1.6c.4-.5.6-1.1.6-1.7z"/>' +
      '<path d="M7.1 13.8h9.8"/>',
    jar:
      '<path d="M8.1 2.6h7.8v2.5H8.1z"/>' +
      '<path d="M6.9 5.1h10.2v11.5c0 2.7-2 4.8-5.1 4.8s-5.1-2.1-5.1-4.8z"/>' +
      '<path d="M6.9 10.9h10.2"/>',
    carboy:
      '<path d="M10.6 2.6h2.8v2.1h-2.8z"/>' +
      '<path d="M9.7 4.7h4.6v3.6l2.8 3.6c.7.9 1.1 2 1.1 3.1v3.5c0 2.2-1.8 3.9-3.9 3.9h-4.6c-2.1 0-3.9-1.7-3.9-3.9V15c0-1.1.4-2.2 1.1-3.1l2.8-3.6z"/>' +
      '<path d="M6.1 14.6h11.8"/>'
  };

  /* ---------- families ---------- */
  const FAMILY = {
    veg:       { label: 'Vegetable ferment', glyph: 'crock' },
    sourdough: { label: 'Sourdough culture', glyph: 'starter' },
    bread:     { label: 'Sourdough bake',    glyph: 'loaf' },
    kombucha:  { label: 'Kombucha',          glyph: 'bottle' },
    sauce:     { label: 'Fermented sauce',   glyph: 'jar' },
    mead:      { label: 'Mead',              glyph: 'carboy' }
  };

  /* ---------- culture kinds ---------- */
  const CULTURE_KINDS = [
    { id: 'starter',    label: 'Sourdough starter', glyph: 'starter', feedHours: 12, feedTemp: 21,
      ratio: '1:5:5 by weight, starter to flour to water' },
    { id: 'scoby',      label: 'Kombucha SCOBY',    glyph: 'bottle',  feedHours: 240, feedTemp: 24,
      ratio: 'A fresh sweet tea brew, or top up the hotel jar' },
    { id: 'milkkefir',  label: 'Milk kefir grains', glyph: 'jar',     feedHours: 24, feedTemp: 21,
      ratio: 'One tablespoon of grains to 250 ml of milk' },
    { id: 'waterkefir', label: 'Water kefir grains',glyph: 'jar',     feedHours: 48, feedTemp: 23,
      ratio: 'Grains into fresh sugar water, roughly 6% sugar' },
    { id: 'gingerbug',  label: 'Ginger bug',        glyph: 'jar',     feedHours: 24, feedTemp: 22,
      ratio: 'A teaspoon each of grated ginger and sugar' },
    { id: 'other',      label: 'Something else',    glyph: 'crock',   feedHours: 24, feedTemp: 21,
      ratio: '' }
  ];

  /* ---------- log kinds ---------- */
  const LOG_KINDS = {
    feed:    { label: 'Feed',        unit: '',    numeric: false },
    temp:    { label: 'Temperature', unit: 'C',   numeric: true,  min: -5, max: 60, step: 0.5 },
    ph:      { label: 'pH',          unit: '',    numeric: true,  min: 2,  max: 9,  step: 0.1 },
    gravity: { label: 'Gravity',     unit: 'SG',  numeric: true,  min: 0.98, max: 1.2, step: 0.001 },
    salinity:{ label: 'Brine',       unit: '%',   numeric: true,  min: 0,  max: 15, step: 0.1 },
    rise:    { label: 'Rise',        unit: 'x',   numeric: true,  min: 0.5, max: 6, step: 0.05 },
    taste:   { label: 'Taste',       unit: '',    numeric: false },
    burp:    { label: 'Burped',      unit: '',    numeric: false },
    rack:    { label: 'Racked',      unit: '',    numeric: false },
    photo:   { label: 'Photo',       unit: '',    numeric: false },
    note:    { label: 'Note',        unit: '',    numeric: false },
    stage:   { label: 'Stage',       unit: '',    numeric: false }
  };

  /* ---------- the twelve ---------- */
  /* stage.days is the expected window. stage.checks are recurring prompts, in hours.
     targets carry the numbers a fermenter actually watches at that stage. */

  const RECIPES = [
  {
    id: 'sauerkraut', family: 'veg', rung: 1, tier: 1,
    title: 'Sauerkraut',
    subtitle: 'The one that is very hard to ruin',
    span: '10 to 21 days',
    blurb: 'Cabbage, salt, and time. No starter, no equipment, no decisions. The salt makes the ' +
           'brine, the brine keeps the air out, and the lactic acid bacteria already on the leaves ' +
           'do the rest. Start here.',
    basis: { key: 'veg', label: 'Cabbage, cored and shredded', unit: 'g', def: 1000, step: 100 },
    pctLabel: 'Percent of cabbage weight',
    ingredients: [
      { name: 'Cabbage, cored and shredded', pct: 100, note: 'Green or white. Keep two outer leaves whole for the cap.' },
      { name: 'Salt, no iodine, no anti caking agent', pct: 2, note: 'Weigh it. Volume measures of salt vary by half.' },
      { name: 'Caraway seed', pct: 0.4, note: 'Optional. Juniper and dill work the same way.' }
    ],
    stages: [
      { name: 'Salt and draw', days: [0.04, 0.08], summary: 'Salt the cabbage and work it until it weeps.',
        tasks: ['Weigh the shredded cabbage, then weigh 2% of that in salt.',
                'Toss and squeeze for about ten minutes until a pool of brine collects.',
                'Pack hard into the jar so the brine rises above the cabbage.',
                'Cap with a whole leaf and a weight. Nothing floats.'],
        targets: { salinity: [1.8, 2.5] },
        watch: 'If no brine covers the cabbage after an hour, top up with a 2% salt solution.' },
      { name: 'Primary ferment', days: [10, 21], summary: 'Bubbles, cloud, then sourness.',
        tasks: ['Keep it out of direct sun, between {18C} and {22C}.',
                'Press the weight down if the cabbage rises.',
                'Taste from day 5 and stop whenever you like it.'],
        checks: [{ every: 24, text: 'Check the brine level and press the cabbage back under.', firstDays: 6 }],
        targets: { temp: [18, 22], ph: [3.2, 4.0] },
        watch: 'A white flat film is kahm yeast. Fuzzy circles are mold. The Guide has both, side by side.' },
      { name: 'Cold store', days: [30, 180], summary: 'The fridge slows it to a crawl.',
        tasks: ['Move to the fridge with the brine still covering everything.',
                'It keeps for months and slowly gets sourer.'],
        targets: { temp: [2, 6] } }
    ],
    safety: ['salt', 'submerged', 'mold'],
    source: 'Salt percentages follow the standard 2% to 2.5% range used for shredded vegetable ferments.'
  },
  {
    id: 'halfsour', family: 'veg', rung: 2, tier: 1,
    title: 'Half sour cucumbers',
    subtitle: 'Crisp in a week, brine only',
    span: '4 to 8 days',
    blurb: 'A brine ferment rather than a dry salt one, which means the maths is on the water ' +
           'instead of the vegetable. Fast, loud, and the first jar that makes people believe a ' +
           'kitchen can bubble.',
    basis: { key: 'water', label: 'Water for the brine', unit: 'ml', def: 1000, step: 100 },
    pctLabel: 'Percent of water weight',
    ingredients: [
      { name: 'Water, unchlorinated', pct: 100, note: 'Chlorine slows the bacteria. Leave tap water out overnight or filter it.' },
      { name: 'Salt, no iodine', pct: 3.5, note: 'A 3.5% brine holds pickling cucumbers firm.' },
      { name: 'Garlic cloves, peeled', pct: 2, note: 'Whole cloves in brine only. Never garlic in oil at room temperature.' },
      { name: 'Dill heads and black peppercorns', pct: 1.5, note: 'Grape or oak leaf adds tannin and keeps them crisp.' }
    ],
    stages: [
      { name: 'Pack and cover', days: [0.02, 0.04], summary: 'Cucumbers in, brine over, nothing floating.',
        tasks: ['Trim the blossom end off every cucumber. It carries the enzyme that softens them.',
                'Pack upright and tight, aromatics between them.',
                'Dissolve the salt in the water, then pour it over until everything is under.',
                'Weight the top so no cucumber breaks the surface.'],
        targets: { salinity: [3.2, 3.8] } },
      { name: 'Primary ferment', days: [4, 8], summary: 'Cloudy brine, steady bubbles, and a smell that turns from grassy to sour.',
        tasks: ['Hold between {18C} and {22C}. Warmer is faster and softer.',
                'Taste one from day 3. Half sour is the point, so stop early.'],
        checks: [{ every: 24, text: 'Open the jar to release pressure and check nothing is above the brine.', firstDays: 6 }],
        targets: { temp: [18, 22], ph: [3.4, 4.2] },
        watch: 'Soft or slimy cucumbers mean it ran too warm or the blossom ends stayed on.' },
      { name: 'Cold store', days: [14, 60], summary: 'Refrigerate and they hold their crunch for weeks.',
        tasks: ['Into the fridge, brine and all.'], targets: { temp: [2, 6] } }
    ],
    safety: ['salt', 'submerged', 'garlic'],
    source: 'A 3.5% brine sits inside the range recommended for cucumber pickles in home fermentation references.'
  },
  {
    id: 'baechu', family: 'veg', rung: 3, tier: 1,
    title: 'Baechu kimchi',
    subtitle: 'Napa cabbage, the everyday one',
    span: '3 to 10 days, then months',
    blurb: 'Two salts and one paste. The cabbage is brined first so it bends without breaking, ' +
           'then dressed and packed. Room temperature only long enough to wake it up, then cold ' +
           'for as long as you can wait.',
    basis: { key: 'veg', label: 'Napa cabbage, quartered', unit: 'g', def: 2000, step: 250 },
    pctLabel: 'Percent of cabbage weight',
    ingredients: [
      { name: 'Napa cabbage, quartered lengthways', pct: 100, note: 'Leave the core in so the quarters hold together.' },
      { name: 'Coarse salt for the brining', pct: 6, note: 'Most of this rinses away. It is not the ferment salt.' },
      { name: 'Korean chilli flakes, gochugaru', pct: 4, note: 'Coarse flakes, not powder.' },
      { name: 'Glutinous rice flour porridge', pct: 6, note: 'Cook 1 part flour to 8 parts water, then cool it completely.' },
      { name: 'Korean radish, julienned', pct: 15, note: 'Mu, or daikon at a push.' },
      { name: 'Spring onion, cut in lengths', pct: 5, note: '' },
      { name: 'Garlic, grated', pct: 2.5, note: '' },
      { name: 'Ginger, grated', pct: 0.8, note: '' },
      { name: 'Fish sauce or salted shrimp', pct: 4, note: 'Leave out for a vegan version and add 1% more salt.' },
      { name: 'Asian pear, grated', pct: 5, note: 'Sweetness for the bacteria, not for you.' }
    ],
    stages: [
      { name: 'Brine the cabbage', days: [0.08, 0.25], summary: 'Salt between the leaves, then wait for it to bend.',
        tasks: ['Salt between every leaf, heavier at the stem end.',
                'Rest 2 to 6 hours, turning the quarters twice.',
                'Rinse three times in cold water, then drain upside down for an hour.',
                'A stem should bend right over without snapping.'],
        watch: 'Under brined cabbage goes watery and dull. Over brined goes limp and too salty to fix.' },
      { name: 'Paste and pack', days: [0.04, 0.08], summary: 'Dress every leaf, then pack it down hard.',
        tasks: ['Mix the cooled porridge with the chilli, aromatics and fish sauce.',
                'Fold in the radish and spring onion, then coat every leaf.',
                'Pack into the jar pressing out air as you go. Leave a hand width of headroom.',
                'Wipe the rim. Kimchi expands and it will climb.'] },
      { name: 'Room temperature wake up', days: [1, 3], summary: 'One to three days out, depending on your kitchen.',
        tasks: ['Leave at {18C} to {22C} on a plate, because it will overflow.',
                'Taste daily. When it fizzes on the tongue, it is ready to go cold.'],
        checks: [{ every: 24, text: 'Burp the kimchi jar and press the cabbage back under its juice.', firstDays: 4 }],
        targets: { temp: [16, 22], ph: [4.2, 4.6] } },
      { name: 'Cold ripening', days: [14, 120], summary: 'The fridge is where kimchi actually becomes kimchi.',
        tasks: ['Refrigerate. It improves for weeks and stays good for months.',
                'Old sour kimchi is a feature. That is what jjigae is for.'],
        targets: { temp: [1, 5], ph: [3.9, 4.4] } }
    ],
    safety: ['salt', 'submerged'],
    source: 'Salting and ripening ranges follow common home kimjang practice.'
  },
  {
    id: 'kkakdugi', family: 'veg', rung: 4, tier: 1,
    title: 'Kkakdugi',
    subtitle: 'Cubed radish kimchi',
    span: '2 to 7 days, then cold',
    blurb: 'Faster than baechu and far less fiddly, because a radish cube does not need to be ' +
           'dressed leaf by leaf. The one to make when the napa looks tired at the market.',
    basis: { key: 'veg', label: 'Korean radish, cut in 2cm cubes', unit: 'g', def: 1500, step: 250 },
    pctLabel: 'Percent of radish weight',
    ingredients: [
      { name: 'Korean radish, cut in 2cm cubes', pct: 100, note: 'Firm and heavy for its size.' },
      { name: 'Salt', pct: 2, note: 'Draws water out before the paste goes on.' },
      { name: 'Sugar', pct: 1.5, note: 'Helps the radish weep and feeds the ferment.' },
      { name: 'Gochugaru', pct: 4, note: '' },
      { name: 'Garlic, grated', pct: 2.5, note: '' },
      { name: 'Ginger, grated', pct: 0.7, note: '' },
      { name: 'Fish sauce', pct: 5, note: '' },
      { name: 'Spring onion', pct: 5, note: '' }
    ],
    stages: [
      { name: 'Salt and drain', days: [0.02, 0.04], summary: 'Thirty minutes of salt and sugar, then keep the liquid.',
        tasks: ['Toss the cubes with the salt and sugar.',
                'Rest 30 minutes, then drain but keep the liquid for the paste.'] },
      { name: 'Paste and pack', days: [0.02, 0.02], summary: 'Everything in one bowl, then into the jar.',
        tasks: ['Mix the paste ingredients with the reserved liquid.',
                'Coat the cubes and pack down with headroom to spare.'] },
      { name: 'Room temperature wake up', days: [1, 3], summary: 'Short. Radish ferments quicker than leaf.',
        tasks: ['{18C} to {22C} for one to three days.', 'Taste daily.'],
        checks: [{ every: 24, text: 'Burp the kkakdugi jar.', firstDays: 3 }],
        targets: { temp: [16, 22] } },
      { name: 'Cold ripening', days: [7, 90], summary: 'Cold, and better every week.',
        tasks: ['Refrigerate.'], targets: { temp: [1, 5] } }
    ],
    safety: ['salt', 'submerged'],
    source: ''
  },
  {
    id: 'starter-new', family: 'sourdough', rung: 5, tier: 2,
    title: 'A sourdough starter from scratch',
    subtitle: 'Flour, water, and about two weeks',
    span: '10 to 21 days',
    blurb: 'The first days smell wrong. That is normal, and the usual mistake is throwing it out ' +
           'on day four. This is a schedule and a set of expectations, so you can tell an ' +
           'awkward adolescent apart from a failure.',
    basis: { key: 'flour', label: 'Flour per feed', unit: 'g', def: 50, step: 5 },
    pctLabel: 'Baker percentage, flour is 100',
    ingredients: [
      { name: 'Wholemeal rye or wheat flour', pct: 100, note: 'Wholemeal for the first week. It carries far more of what you need.' },
      { name: 'Water at about {28C}', pct: 100, note: '100% hydration keeps the maths simple.' },
      { name: 'Starter carried forward', pct: 100, note: 'From day 4 onward, keep 100% and discard the rest.' }
    ],
    stages: [
      { name: 'Days 1 to 3, just wait', days: [3, 3], summary: 'Mix, cover loosely, and leave it alone.',
        tasks: ['Mix equal weights of wholemeal flour and warm water into a thick paste.',
                'Cover loosely. Not airtight.',
                'Keep it warm, {24C} to {28C} is ideal.',
                'Do nothing else for three days.'],
        checks: [{ every: 24, text: 'Look at the new starter. No feeding yet, just look.', firstDays: 3 }],
        targets: { temp: [22, 28] },
        watch: 'Day 2 often bubbles hard and smells of cheese or vomit. That is leuconostoc, and it passes.' },
      { name: 'Days 4 to 7, once a day', days: [4, 4], summary: 'Discard most of it, feed the rest, once every 24 hours.',
        tasks: ['Keep 50g. Discard the rest.',
                'Feed 50g flour and 50g water.',
                'Mark the level. This is the first rubber band.'],
        checks: [{ every: 24, text: 'Feed the starter. Keep 50g, add 50g flour and 50g water.', firstDays: 4 }],
        targets: { temp: [22, 28] },
        watch: 'Days 4 and 5 usually go quiet. The lull is the handover between organisms, not a death.' },
      { name: 'Days 8 onward, twice a day', days: [4, 14], summary: 'Two feeds a day until it doubles on schedule.',
        tasks: ['Feed every 12 hours at 1:1:1 by weight.',
                'Switch to half white flour once it is lively.',
                'Photograph the jar at the feed and again at the peak.'],
        checks: [{ every: 12, text: 'Feed the starter and mark the level.', firstDays: 14 }],
        targets: { temp: [21, 26], rise: [1.8, 3.5] },
        watch: 'Ready means it reliably doubles within 4 to 8 hours and smells of yoghurt and apples.' }
    ],
    safety: ['starter'],
    source: ''
  },
  {
    id: 'starter-revive', family: 'sourdough', rung: 6, tier: 2,
    title: 'Reviving a neglected starter',
    subtitle: 'Three days back from the dead',
    span: '3 to 5 days',
    blurb: 'Grey liquid on top, a smell like nail varnish, and no bubbles at all. That is a hungry ' +
           'starter, not a dead one. Starters forgive. This is the road back, and it is short.',
    basis: { key: 'flour', label: 'Flour per feed', unit: 'g', def: 40, step: 5 },
    pctLabel: 'Baker percentage, flour is 100',
    ingredients: [
      { name: 'Wholemeal rye flour', pct: 60, note: 'Rye restarts a tired culture faster than white.' },
      { name: 'Strong white flour', pct: 40, note: '' },
      { name: 'Water at about {28C}', pct: 100, note: '' },
      { name: 'Old starter carried forward', pct: 25, note: 'A small carry forward dilutes the acid that is holding it back.' }
    ],
    stages: [
      { name: 'Day 1, pour off and reset', days: [1, 1], summary: 'Throw nearly all of it away. That is the whole trick.',
        tasks: ['Pour off the dark liquid and scrape away any crust.',
                'Keep one tablespoon from the middle of the jar. Discard the rest.',
                'Into a clean jar with 40g flour and 40g water at {28C}.',
                'Photograph it and mark the level.'],
        checks: [{ every: 12, text: 'Feed the reviving starter. Small carry forward, warm water.', firstDays: 1 }],
        targets: { temp: [24, 28] },
        watch: 'Acetone smell is hunger. It goes within two feeds.' },
      { name: 'Days 2 and 3, every 12 hours', days: [2, 3], summary: 'Two feeds a day, warm, and mark every level.',
        tasks: ['Keep 20g, feed 40g flour and 40g water.',
                'Keep it at {24C} to {28C}. The airing cupboard, or an oven with only the light on.',
                'Take a rise photo at each feed and again a few hours later.'],
        checks: [{ every: 12, text: 'Feed the reviving starter and mark the level.', firstDays: 3 }],
        targets: { temp: [24, 28], rise: [1.4, 3.0] },
        watch: 'A rise chart that climbs over three days is the proof. One flat day means keep going, not stop.' },
      { name: 'Back in service', days: [1, 3], summary: 'Doubling within 6 hours means it is a starter again.',
        tasks: ['Once it doubles reliably, return it to your usual schedule.',
                'Bake something modest first. A rich dough is not the test.'],
        targets: { rise: [2, 3.5] } }
    ],
    safety: ['starter'],
    source: ''
  },
  {
    id: 'kombucha-f1', family: 'kombucha', rung: 7, tier: 2,
    title: 'Kombucha, first ferment',
    subtitle: 'Sweet tea into sour tea',
    span: '7 to 14 days',
    blurb: 'The whole first ferment is sweet tea plus an acidic starter liquid plus a culture, ' +
           'held warm and covered with cloth. The starter liquid matters more than the pellicle, ' +
           'and the pH is the only number worth trusting in the first three days.',
    basis: { key: 'liquid', label: 'Finished volume', unit: 'ml', def: 2000, step: 250 },
    pctLabel: 'Percent of finished volume',
    ingredients: [
      { name: 'Water', pct: 100, note: 'Unchlorinated. Brew hot, then cool completely.' },
      { name: 'White sugar', pct: 6, note: 'Food for the culture. Most of it is eaten, not drunk.' },
      { name: 'Black or green tea', pct: 0.5, note: 'Plain camellia sinensis. No oils, no earl grey.' },
      { name: 'Mature kombucha as starter liquid', pct: 12, note: 'The acid that protects the first three days. Do not skip it.' },
      { name: 'Pellicle, one', pct: 0, note: 'Helpful, not essential. The liquid does the work.' }
    ],
    stages: [
      { name: 'Brew and cool', days: [0.08, 0.25], summary: 'Steep, sweeten, and cool to room temperature.',
        tasks: ['Steep the tea in a third of the water, hot, for ten minutes.',
                'Stir the sugar in until it dissolves.',
                'Top up with the remaining cold water and cool to under {30C}.',
                'Warm liquid kills the culture. Wait.'],
        watch: 'Hot tea straight onto a pellicle is the most common way to lose one.' },
      { name: 'Primary ferment', days: [7, 14], summary: 'Cloth covered, dark, warm, still.',
        tasks: ['Add the starter liquid, then the pellicle, then cover with tight cloth and a band.',
                'Hold {22C} to {28C}, out of direct sun. Do not move the jar.',
                'Test the pH on day 3 and again on day 7.',
                'Taste from day 7 with a straw down the side.'],
        checks: [{ every: 72, text: 'Test the kombucha pH and taste it with a straw.', firstDays: 14 }],
        targets: { temp: [22, 28], ph: [2.6, 3.5] },
        watch: 'A new pale layer across the top is a new pellicle and it is the point. Dry blue or green fuzz on top of it is mold, and that batch and that culture both go.' },
      { name: 'Decant', days: [0.02, 0.02], summary: 'Bottle it, keep the culture and 12% of the liquid.',
        tasks: ['Reserve 12% of the volume as the starter liquid for the next brew.',
                'Bottle the rest, or go straight to a second ferment.'],
        targets: { ph: [2.6, 3.4] } }
    ],
    safety: ['ph', 'kombucha', 'mold'],
    source: 'The pH target below 4.2 within the first three days is the standard home safety check for kombucha.'
  },
  {
    id: 'kombucha-f2', family: 'kombucha', rung: 8, tier: 2,
    title: 'Kombucha, second ferment',
    subtitle: 'Where the fizz comes from',
    span: '1 to 4 days',
    blurb: 'Sealed bottles, a little sugar from fruit or juice, and a short warm wait. This is the ' +
           'only part of kombucha with a real physical hazard, and it is entirely solved by burping ' +
           'the bottles on a schedule.',
    basis: { key: 'liquid', label: 'Kombucha to bottle', unit: 'ml', def: 1500, step: 250 },
    pctLabel: 'Percent of kombucha volume',
    ingredients: [
      { name: 'Finished first ferment kombucha', pct: 100, note: 'Strained.' },
      { name: 'Fruit, juice or puree', pct: 10, note: 'The sugar that makes the carbonation.' },
      { name: 'Grated ginger', pct: 1, note: 'Optional, and it carbonates hard.' }
    ],
    stages: [
      { name: 'Bottle', days: [0.02, 0.02], summary: 'Pressure rated bottles only. Leave headroom.',
        tasks: ['Use swing top or thick walled bottles made for pressure.',
                'Fill to about 3cm below the top.',
                'Add the fruit, seal, and label with the date.'],
        watch: 'Never use a thin glass bottle. A bottle failure under pressure is a real injury, and this is the one genuine hazard in kombucha.' },
      { name: 'Carbonate', days: [1, 4], summary: 'Warm, dark, and burped every day.',
        tasks: ['Hold at {20C} to {26C} out of the light.',
                'Open one bottle a day to judge the fizz.',
                'Refrigerate as soon as it is right. Cold stops it.'],
        checks: [{ every: 24, text: 'Burp the kombucha bottles. Ginger and berry brews build pressure fastest.', firstDays: 4 }],
        targets: { temp: [20, 26] },
        watch: 'Gushing on opening means the next bottles are overdue for the fridge.' },
      { name: 'Cold store', days: [7, 30], summary: 'Cold holds the carbonation where it is.',
        tasks: ['Refrigerate and drink within a month.'], targets: { temp: [2, 6] } }
    ],
    safety: ['pressure', 'ph'],
    source: ''
  },
  {
    id: 'sourdough-loaf', family: 'bread', rung: 9, tier: 3,
    title: 'Everyday sourdough loaf',
    subtitle: 'One loaf, 72% hydration',
    span: '18 to 26 hours',
    blurb: 'A plain country loaf written in baker percentages, so the calculator can scale it to ' +
           'whatever your tin or banneton holds. The bulk ferment is where the loaf is won or lost, ' +
           'and it is measured by rise and feel rather than by the clock.',
    basis: { key: 'flour', label: 'Total flour', unit: 'g', def: 500, step: 25 },
    pctLabel: 'Baker percentage, flour is 100',
    ingredients: [
      { name: 'Strong white bread flour', pct: 85, note: '' },
      { name: 'Wholemeal flour', pct: 15, note: 'Flavour and a faster bulk.' },
      { name: 'Water', pct: 72, note: 'Hold back 5% and add it during the mix if the flour is thirsty.' },
      { name: 'Active starter at peak', pct: 20, note: 'Peaked, domed, and smelling sweet rather than sharp.' },
      { name: 'Salt', pct: 2, note: '' }
    ],
    stages: [
      { name: 'Autolyse', days: [0.02, 0.08], summary: 'Flour and water only, resting.',
        tasks: ['Mix the flours and all but 5% of the water.',
                'Rest 30 minutes to 2 hours. No salt, no starter yet.'] },
      { name: 'Mix and bulk ferment', days: [0.17, 0.29], summary: 'Four to seven hours at {24C}, until it has risen by half.',
        tasks: ['Add the starter, then the salt with the held back water.',
                'Four sets of stretch and folds, 30 minutes apart.',
                'Bulk until the dough has risen by 50% and is domed and jiggly.',
                'Mark the level on the tub. This is the only reliable measurement.'],
        checks: [{ every: 1, text: 'Stretch and fold the dough.', firstDays: 0.09 }],
        targets: { temp: [23, 26], rise: [1.4, 1.6] },
        watch: 'Rise by half, not double. Doubling in the tub usually means a flat loaf.' },
      { name: 'Shape and cold proof', days: [0.5, 0.75], summary: 'Pre shape, bench rest, shape, then overnight in the fridge.',
        tasks: ['Pre shape, rest 20 minutes uncovered.',
                'Shape tight and into a floured banneton, seam up.',
                'Fridge for 12 to 18 hours at {4C}.'],
        targets: { temp: [3, 6] } },
      { name: 'Bake', days: [0.04, 0.04], summary: 'Very hot, covered, then uncovered.',
        tasks: ['Preheat the pot at {250C} for 45 minutes.',
                'Score cold from the fridge, straight in.',
                'Twenty minutes with the lid on, then 22 to 26 minutes at {220C} with the lid off.',
                'Cool for at least two hours before cutting.'],
        watch: 'Cutting a hot loaf makes it gummy. It is still finishing inside.' }
    ],
    safety: [],
    source: ''
  },
  {
    id: 'focaccia', family: 'bread', rung: 10, tier: 3,
    title: 'Overnight sourdough focaccia',
    subtitle: 'High hydration, no shaping',
    span: '16 to 20 hours',
    blurb: 'The forgiving bake. Eighty percent hydration, no shaping to get wrong, and a long cold ' +
           'night that does all the work while you sleep. The best use of a starter that is lively ' +
           'but not yet strong enough for a boule.',
    basis: { key: 'flour', label: 'Total flour', unit: 'g', def: 500, step: 25 },
    pctLabel: 'Baker percentage, flour is 100',
    ingredients: [
      { name: 'Strong white bread flour', pct: 100, note: '' },
      { name: 'Water', pct: 80, note: 'Wet. Use a wet hand rather than more flour.' },
      { name: 'Active starter at peak', pct: 25, note: '' },
      { name: 'Salt', pct: 2.2, note: '' },
      { name: 'Olive oil, for the tin and the top', pct: 8, note: 'Generous. It fries the base.' }
    ],
    stages: [
      { name: 'Mix', days: [0.02, 0.04], summary: 'Everything in a bowl, no kneading.',
        tasks: ['Mix flour, water, starter and salt to a shaggy wet dough.',
                'Three sets of coil folds, 30 minutes apart.'] },
      { name: 'Cold overnight', days: [0.5, 0.67], summary: 'Twelve to sixteen hours in the fridge.',
        tasks: ['Oil a tub, cover, and refrigerate.'], targets: { temp: [3, 6] } },
      { name: 'Pan and proof', days: [0.08, 0.17], summary: 'Into an oiled tin, then two to four hours warm.',
        tasks: ['Pour into a well oiled tin and let it spread on its own.',
                'Proof at room temperature until pillowy and full of bubbles.',
                'Dimple with oiled fingers right before it goes in.'],
        targets: { temp: [21, 26] } },
      { name: 'Bake', days: [0.02, 0.02], summary: 'Hot, 22 to 26 minutes.',
        tasks: ['{230C} until deep gold, 22 to 26 minutes.',
                'Out of the tin straight away so the base stays crisp.'] }
    ],
    safety: [],
    source: ''
  },
  {
    id: 'hotsauce', family: 'sauce', rung: 11, tier: 3,
    title: 'Fermented hot sauce',
    subtitle: 'Chillies under brine, then blended',
    span: '10 to 28 days',
    blurb: 'A brine ferment that turns raw heat into something rounder and deeper. The ferment is ' +
           'simple. The part worth getting right is what happens after the blender, because a ' +
           'blended sauce needs its acidity checked before it goes in a bottle.',
    basis: { key: 'water', label: 'Water for the brine', unit: 'ml', def: 700, step: 50 },
    pctLabel: 'Percent of water weight',
    ingredients: [
      { name: 'Water, unchlorinated', pct: 100, note: '' },
      { name: 'Salt, no iodine', pct: 3, note: 'A 3% brine on the water.' },
      { name: 'Fresh chillies, stemmed', pct: 90, note: 'Any mix. Halve the fat ones so the brine gets in.' },
      { name: 'Garlic cloves', pct: 6, note: 'In brine only.' },
      { name: 'Carrot or mango, chopped', pct: 20, note: 'Optional. Sweetness and body.' },
      { name: 'Vinegar for the finish', pct: 15, note: 'Added after the blend, to taste and to acidity.' }
    ],
    stages: [
      { name: 'Brine and pack', days: [0.02, 0.04], summary: 'Chillies under a 3% brine, weighted down.',
        tasks: ['Dissolve the salt in the water.',
                'Pack the chillies and aromatics in and pour the brine over.',
                'Weight everything under the surface. Floating chillies mold.'],
        targets: { salinity: [2.8, 3.3] } },
      { name: 'Primary ferment', days: [10, 28], summary: 'Two to four weeks, and it goes quiet at the end.',
        tasks: ['Hold at {20C} to {24C}.',
                'Expect hard bubbling in the first week and calm by the third.',
                'The brine turns cloudy and the chillies lose their gloss.'],
        checks: [{ every: 24, text: 'Burp the chilli jar and press everything back under the brine.', firstDays: 8 }],
        targets: { temp: [20, 24], ph: [3.2, 4.0] },
        watch: 'Anything above the brine will grow mold. Check the weight every time you pass the jar.' },
      { name: 'Blend and bottle', days: [0.02, 0.02], summary: 'Blend, adjust with vinegar, then keep it cold.',
        tasks: ['Blend the solids with enough brine to move.',
                'Add vinegar to taste and to acidity, then check the pH.',
                'Below pH 4.0 and refrigerated is the safe, sensible home target.',
                'Bottle and keep in the fridge.'],
        targets: { ph: [3.0, 4.0] },
        watch: 'A blended sauce is not shelf stable because you fermented it. Keep it in the fridge, and if the pH is above 4.0 add more vinegar or throw it out.' }
    ],
    safety: ['salt', 'submerged', 'ph', 'garlic', 'shelfstable'],
    source: 'The pH 4.0 target and refrigerated storage follow standard home food acidification guidance.'
  },
  {
    id: 'mead', family: 'mead', rung: 12, tier: 3,
    title: 'Traditional mead, one gallon',
    subtitle: 'Honey, water, yeast, and patience',
    span: '3 to 12 months',
    blurb: 'The longest thing in this app and the only one with real arithmetic. Gravity readings ' +
           'tell you where the sugar went, and they are the difference between waiting and guessing. ' +
           'Racking waits on your reading, not on the calendar.',
    basis: { key: 'liquid', label: 'Batch volume', unit: 'ml', def: 3800, step: 500 },
    pctLabel: 'Percent of batch volume',
    ingredients: [
      { name: 'Water, unchlorinated', pct: 100, note: 'The volume you are making.' },
      { name: 'Honey', pct: 32, note: 'About 1.2kg per gallon gives roughly 1.090 starting gravity.' },
      { name: 'Wine or mead yeast', pct: 0.1, note: 'One sachet. Rehydrate as the packet says.' },
      { name: 'Yeast nutrient', pct: 0.15, note: 'Honey has almost no nitrogen. Without nutrient the ferment stalls and smells of sulphur.' }
    ],
    stages: [
      { name: 'Must and pitch', days: [0.02, 0.04], summary: 'Mix, aerate, take the starting gravity, pitch.',
        tasks: ['Stir the honey into warm water until fully dissolved.',
                'Top up to volume and cool to under {25C}.',
                'Take and log the starting gravity. This is the number everything else is measured against.',
                'Aerate hard, add nutrient, then pitch the yeast.'],
        targets: { gravity: [1.08, 1.11], temp: [18, 24] } },
      { name: 'Primary ferment', days: [14, 35], summary: 'Airlock activity, then silence.',
        tasks: ['Hold at {18C} to {22C}, out of the light.',
                'Add nutrient in two more doses over the first week.',
                'Log the gravity weekly. Racking waits on the reading.'],
        checks: [{ every: 168, text: 'Take a gravity reading on the mead.', firstDays: 35 }],
        targets: { temp: [18, 22], gravity: [0.995, 1.02] },
        watch: 'Rack when the gravity has been unchanged for a week, not when the bubbling stops. Airlocks lie.' },
      { name: 'Secondary and clearing', days: [60, 180], summary: 'Off the lees, into a full vessel, and left alone.',
        tasks: ['Rack carefully off the sediment into a vessel filled to the neck.',
                'Headspace is the enemy now. Top up with water or more mead.',
                'Leave it to clear. Two to six months.'],
        checks: [{ every: 720, text: 'Check the mead for clarity and top up any headspace.', firstDays: 180 }],
        targets: { temp: [12, 20], gravity: [0.99, 1.005] } },
      { name: 'Bottle and age', days: [90, 365], summary: 'Bottle clear, then forget about it.',
        tasks: ['Bottle only when it is fully clear and the gravity is stable.',
                'Log the final gravity so the app can work out the strength.',
                'Age at least three months. Six is better.'],
        watch: 'Bottling a mead that is still fermenting makes bottle bombs. Two identical readings a week apart, or do not bottle.' }
    ],
    safety: ['pressure', 'headspace'],
    source: 'Alcohol by volume is estimated as (starting gravity minus final gravity) times 131.25.'
  }
  ];

  const TIERS = [
    { n: 1, title: 'Nothing much can go wrong', note: 'Salt, vegetables, and a weight. No culture to keep alive and no equipment to buy.' },
    { n: 2, title: 'You need a culture first',  note: 'These depend on something living that you feed. Start one, or accept a jar from a friend.' },
    { n: 3, title: 'The long ones',             note: 'Weeks to months, and numbers worth writing down. Worth it.' }
  ];

  /* ---------- the guide ---------- */

  const GUIDE = [
  { id: 'salt', title: 'Salt is the whole safety system',
    body: [
      'Fermenting vegetables safely is not really about cleanliness. It is about salt, and about keeping the air out. Salt at the right percentage holds back the organisms you do not want for the few days it takes the lactic acid bacteria to take over and drop the pH out of their reach.',
      'For shredded vegetables salted directly, weigh the vegetables and use 2% to 2.5% of that weight in salt. For anything sitting in a brine, weigh the water and use 3% to 3.5% of that.',
      'Weigh it. Do not measure salt by spoon. Flake salt and fine salt differ by nearly half for the same volume, and that is the difference between a ferment and a bin.',
      'Use salt with nothing added. Iodine and anti caking agents both interfere. Sea salt, kosher salt and pickling salt are all fine.'
    ] },
  { id: 'submerged', title: 'Under the brine, or it is not fermenting',
    body: [
      'Every problem photo posted to a fermentation forum has the same cause. Something was above the liquid.',
      'Below the surface is an anaerobic, acidic, salty place where almost nothing unwanted survives. Above it is a damp surface open to the air, which is exactly where mold spores want to be.',
      'Use a weight. A glass disc, a smaller jar, a zip bag of brine, or a whole cabbage leaf folded over. Check it every time you walk past.',
      'If you find a single shred floating, take it out. If you find fuzz, read the triage page.'
    ] },
  { id: 'mold', title: 'Mold, and the things that are not mold',
    body: [
      'Most of what alarms people is not mold. Kahm yeast, a new pellicle, brown yeast strands and cloudy brine are all normal. Fuzzy, raised, circular growth is not.',
      'The triage reference on this page shows both kinds side by side, drawn rather than photographed, so the differences are the ones that actually matter: texture, edge, and whether it sits on the surface or grows up out of it.',
      'The rule at the end of every one of them is the same, and it is not hedged. If you are not sure, throw it out. A jar of cabbage costs less than a bad week.'
    ] },
  { id: 'ph', title: 'pH, and the cheap strips',
    body: [
      'pH is the one number that tells you whether the acid has arrived. Strips cost very little and are accurate enough for the decisions you actually make.',
      'Vegetable ferments should be below pH 4.6 within a few days and usually settle between 3.2 and 4.0. Kombucha should be below 4.2 within three days of pitching and finishes between 2.5 and 3.5. A blended hot sauce for the fridge should be at or below 4.0.',
      'Buy strips with a narrow range, roughly 2.5 to 5.0. The wide range ones sold for pools cannot tell 3.4 from 4.4, and that is the only distinction you need.',
      'A pH meter is nicer, and it needs calibrating with buffer solutions to be worth anything. Strips you actually use beat a meter you never calibrate.'
    ] },
  { id: 'garlic', title: 'Garlic in oil, and why this one is different',
    body: [
      'Raw garlic stored in oil at room temperature is the one genuinely dangerous thing a curious home fermenter is likely to try. It is low acid, it is anaerobic under the oil, and it is held at exactly the temperature Clostridium botulinum likes. Botulinum toxin has no smell, no taste and no visible sign.',
      'Garlic in a salt brine is fine, because the ferment acidifies it. Garlic in oil is not fermenting at all. It is just sitting there.',
      'If you want garlic in oil, make it fresh and keep it in the fridge for no more than four days, or freeze it.',
      'This is the clearest example of why the app stays out of low acid canning entirely. Home food preservation authorities such as the National Center for Home Food Preservation publish tested procedures for that work, and untested ones are not worth improvising.'
    ] },
  { id: 'pressure', title: 'Pressure, bottles and bottle bombs',
    body: [
      'A sealed bottle of something still fermenting is a pressure vessel. This is the only part of home fermentation with a real physical hazard rather than a food safety one.',
      'Use bottles built for pressure. Swing top bottles, thick walled beer bottles, or purpose made carbonation bottles. Never a thin glass juice bottle and never a screw top wine bottle.',
      'Burp them. A daily open on a second ferment is not optional, and ginger and berry brews build pressure fastest.',
      'For mead and beer, two identical gravity readings a week apart before bottling. Airlock activity is not a measurement.',
      'If a bottle has been forgotten for a long time, chill it first and open it inside a bag or a sink.'
    ] },
  { id: 'kombucha', title: 'Kombucha, specifically',
    body: [
      'The starter liquid is the safety mechanism, not the pellicle. A brew pitched with 10% to 15% mature acidic kombucha drops below pH 4.2 quickly, and that is what keeps the first three days clean.',
      'Brew in glass or food grade plastic. Not in lead glazed ceramic, and not in unlined metal, because kombucha is acidic enough to leach from both.',
      'Cover with tightly woven cloth and a band, never a sealed lid, during the first ferment.',
      'If mold grows on the pellicle, the batch and the culture both go. Do not rescue a molded pellicle.'
    ] },
  { id: 'starter', title: 'Keeping a starter alive',
    body: [
      'A starter at room temperature wants feeding every 12 hours. A starter in the fridge wants feeding once a week, and forgives a month.',
      'Grey or brown liquid on top is hooch. It is alcohol, it means hunger, and it is not dangerous. Pour it off and feed.',
      'A smell of acetone or nail varnish is hunger too. Two feeds fix it.',
      'Pink, orange or fuzzy growth on a starter is the one that ends it. That is not hooch and it is not normal. Start again.',
      'Keep a dried backup. Smear some starter thin on baking paper, dry it, crumble it into a jar, and put it in a cupboard. It rehydrates years later.'
    ] },
  { id: 'shelfstable', title: 'Fermented does not mean shelf stable',
    body: [
      'A fermented food is preserved while it stays cold, acidic and covered. It is not the same thing as a canned food, which has been through a tested heat process.',
      'Nothing in this app is shelf stable at room temperature in a sealed jar. Everything here belongs in the fridge once it is finished.',
      'Water bath canning a fermented product is a separate, tested procedure with its own rules, and it kills the live cultures. Ferment has nothing to say about it on purpose.'
    ] },
  { id: 'headspace', title: 'Headspace and oxygen',
    body: [
      'Before fermentation gets going, headspace is fine. Afterwards it is a problem. Oxygen turns finished alcohol to vinegar and lets film yeasts grow on wine and mead.',
      'Rack into a vessel that fills to the neck, and top up with water, more mead, or marbles.',
      'Vegetable ferments are the opposite. They want headroom in the jar, because they climb.'
    ] },
  { id: 'scope', title: 'What Ferment deliberately does not cover',
    body: [
      'Cured meats and charcuterie. Nitrite curing, humidity control and water activity are a serious discipline and a bad place to improvise from an app.',
      'Pressure canning and low acid canning. These need tested, published procedures and equipment, not general guidance.',
      'Raw milk cheese ageing, koji at controlled temperature, and anything relying on holding a precise incubation temperature for days.',
      'Any claim about health. Ferment has nothing to say about gut health, immunity or anything medical, and it never will. It is a notebook for a hobby.',
      'For the categories above, the National Center for Home Food Preservation and your national food safety body publish tested procedures. Use those.'
    ] }
  ];

  /* ---------- the triage reference, drawn as line and wash in SVG ---------- */

  const TRIAGE = [
    { id: 't-mold', verdict: 'out', title: 'Fuzzy circular growth',
      seen: 'Round colonies with a raised, hairy or powdery texture. Blue, green, black, grey or bright white. It grows up out of the surface and has a visible edge.',
      is: 'Mold. The visible colony is the top of a much larger network already through the food below it.',
      do: 'Throw the whole batch out, jar contents and all. Do not scoop it off and eat the rest. Wash the vessel in hot soapy water and start again with more salt and a better weight.',
      art: 'mold' },
    { id: 't-kahm', verdict: 'ok', title: 'Flat white wrinkled film',
      seen: 'A thin, flat, cream white film across the surface of the brine. Wrinkled or bubbly like a dried puddle. No colour and no fuzz. It sits on the liquid rather than standing up out of it.',
      is: 'Kahm yeast. Harmless, common, and a sign the ferment ran warm, or the salt was a little low, or something has been above the brine.',
      do: 'Skim it off with a spoon. Check the weight, top up the brine, move the jar somewhere cooler. It can taste slightly off, so skim it promptly rather than leaving it.',
      art: 'kahm' },
    { id: 't-pellicle', verdict: 'ok', title: 'A new pale layer on kombucha',
      seen: 'A smooth, even, translucent to cream layer forming right across the surface of the tea, thickening over days. It may attach to the old pellicle or form above it.',
      is: 'A new pellicle. This is the culture building its own raft of cellulose, and it is the sign the brew is working.',
      do: 'Nothing. Leave it. Pellicles stack up over batches, so peel off and compost the oldest layers when the pile gets deep.',
      art: 'pellicle' },
    { id: 't-strands', verdict: 'ok', title: 'Brown stringy strands',
      seen: 'Dark brown, gelatinous threads hanging below the pellicle, or a layer of brown sediment on the bottom of the kombucha jar.',
      is: 'Yeast. The strands are yeast colonies and the sediment is spent yeast. Both are normal and both are a sign of a healthy, active culture.',
      do: 'Nothing, except strain them out of the bottles if the texture bothers you. Keep a little in the starter liquid.',
      art: 'strands' },
    { id: 't-pink', verdict: 'out', title: 'Pink, orange or slimy patches',
      seen: 'Pink or orange discolouration on the surface or through a vegetable ferment, sometimes with a slimy or ropey texture in the brine.',
      is: 'Either a pink yeast, or Serratia, or a spoilage bacterium taking advantage of low salt. In every case it means the salt was too low or the temperature too high.',
      do: 'Throw it out. This one is outside the range where the conservative rule bends. Next time weigh the salt and keep the jar cooler.',
      art: 'pink' },
    { id: 't-cloudy', verdict: 'ok', title: 'Cloudy brine, sediment, bubbles',
      seen: 'The brine turns from clear to milky over the first few days, with a white powdery sediment settling out and steady small bubbles rising when the jar is tapped.',
      is: 'Lactic acid bacteria doing exactly what they are meant to. The cloud is bacterial mass and the sediment is spent cells.',
      do: 'Nothing. This is the ferment working. A clear brine with no bubbles after three days is the one worth worrying about.',
      art: 'cloudy' }
  ];

  /* ---------- first run choices ---------- */
  const START_PATHS = [
    { id: 'have', title: 'Something is already alive', sub: 'A starter, a SCOBY, kefir grains. Give it a name and a schedule.' },
    { id: 'fresh', title: 'I want to start something', sub: 'The ladder opens at sauerkraut, which is very hard to ruin.' },
    { id: 'gift', title: 'Someone gave me a culture card', sub: 'Paste the code and the family tree comes with it.' },
    { id: 'look', title: 'Just looking', sub: 'Read the recipes and the safety guide first. Nothing gets created.' }
  ];

  function recipe(id) { return RECIPES.find(r => r.id === id) || null; }
  function guide(id) { return GUIDE.find(g => g.id === id) || null; }
  function family(k) { return FAMILY[k] || FAMILY.veg; }
  function cultureKind(id) { return CULTURE_KINDS.find(c => c.id === id) || CULTURE_KINDS[5]; }
  function glyph(name) { return GLYPH[name] || GLYPH.jar; }

  return { GLYPH, FAMILY, CULTURE_KINDS, LOG_KINDS, RECIPES, TIERS, GUIDE, TRIAGE, START_PATHS,
           recipe, guide, family, cultureKind, glyph };
})();

window.Content = Content;
