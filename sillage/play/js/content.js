/* Sillage. Authored content that never changes at runtime: the training
   curriculum, the pantry shelves, the emotion wheel and the anchor scaffolds.
   Tracks are data so a new track needs new writing, not new code. */
const Content = (() => {

  /* ---------- the emotion wheel ----------
     Eight feelings, each with a hue that tints the entry card. The hues are
     mid-dark inks chosen so paper-coloured text sits on them at 4.5:1 or better. */
  const FEELINGS = [
    { id: 'calm',       label: 'Calm',       hue: '#4B7666', line: 'Settled. Nothing asked of you.' },
    { id: 'joy',        label: 'Joy',        hue: '#8B6410', line: 'Bright, immediate, uncomplicated.' },
    { id: 'longing',    label: 'Longing',    hue: '#87527F', line: 'Wanting something that is not here.' },
    { id: 'comfort',    label: 'Comfort',    hue: '#8A5622', line: 'Safe. Known. Somebody looked after you.' },
    { id: 'desire',     label: 'Desire',     hue: '#A0423A', line: 'Warm, close, a little dangerous.' },
    { id: 'melancholy', label: 'Melancholy', hue: '#476581', line: 'Sad in a way you would not trade.' },
    { id: 'alert',      label: 'Alert',      hue: '#5D6A24', line: 'Awake. Sharpened. Paying attention.' },
    { id: 'unease',     label: 'Unease',     hue: '#655C51', line: 'Something is wrong and you cannot place it.' }
  ];

  /* ---------- the anchor scaffolds ----------
     Rotating placeholders in the anchor field. Articulating a smell is what
     encodes it, so the app hands you a sentence shape rather than a lecture. */
  const SCAFFOLDS = [
    'It is like ____, but ____',
    'Closest thing: ____. Wrong because ____',
    'If ____ and ____ were in the same room',
    'Somewhere between ____ and ____',
    'It arrives like ____ and leaves like ____',
    'Under it, faintly, ____',
    'The temperature of it is ____',
    'Warmer than ____, drier than ____',
    'It smells the way ____ sounds',
    'A ____ version of ____',
    'Nine parts ____, one part ____',
    'The colour of it would be ____'
  ];

  /* ---------- the pantry shelves ----------
     Sixty four things almost every kitchen or bathroom already has. lex links
     the material to its lexicon card so a miss can teach you a word. */
  const SHELVES = [
    { id: 'peel', name: 'The peel drawer', note: 'Bright, volatile, gone in a minute. Smell these first, while your nose is fresh.' },
    { id: 'herb', name: 'The herb shelf', note: 'Dried herbs are quieter than fresh. Crush them between your fingers first.' },
    { id: 'warm', name: 'Warm spices', note: 'The confusing shelf. Cinnamon, clove and allspice overlap on purpose.' },
    { id: 'seed', name: 'Seeds and pods', note: 'Crack or crush every one. A whole seed gives you almost nothing.' },
    { id: 'roast', name: 'Roast and bean', note: 'Roasting makes new molecules. These smell nothing like their raw forms.' },
    { id: 'sweet', name: 'Sweet and baking', note: 'Liquids. One drop on a paper strip, never the open bottle.' },
    { id: 'ferment', name: 'Ferment and dairy', note: 'The shelf people avoid. It is where half of deliciousness lives.' },
    { id: 'house', name: 'Around the house', note: 'The non-food shelf, and the one that triggers the oldest memories.' }
  ];

  const MATS = [];
  const mat = (shelf, list) => { for (const m of list) MATS.push({ id: m[0], name: m[1], shelf, lex: m[2] || null }); };

  mat('peel', [
    ['lemon-peel', 'Lemon peel', 'lemon'], ['orange-peel', 'Orange peel', 'sweet-orange'],
    ['lime-peel', 'Lime peel', 'lime'], ['grapefruit-peel', 'Grapefruit peel', 'grapefruit'],
    ['earl-grey', 'Earl Grey tea', 'bergamot'], ['mandarin-peel', 'Mandarin peel', 'mandarin'],
    ['lemongrass-stalk', 'Lemongrass', 'lemongrass'], ['dried-lime', 'Dried lime', 'lime']
  ]);
  mat('herb', [
    ['thyme-dried', 'Dried thyme', 'thyme'], ['rosemary-sprig', 'Rosemary', 'rosemary'],
    ['bay', 'Bay leaf', 'bay-leaf'], ['mint-dried', 'Dried mint', 'peppermint'],
    ['basil-leaf', 'Basil', 'basil'], ['oregano-dried', 'Dried oregano', 'oregano'],
    ['sage-dried', 'Dried sage', 'sage'], ['lavender-dried', 'Dried lavender', 'lavender']
  ]);
  mat('warm', [
    ['cinnamon-stick', 'Cinnamon stick', 'cinnamon'], ['clove-whole', 'Whole cloves', 'clove'],
    ['nutmeg-whole', 'Nutmeg', 'nutmeg'], ['cardamom-pod', 'Green cardamom', 'cardamom'],
    ['ginger-ground', 'Ground ginger', 'ginger'], ['allspice-berry', 'Allspice', 'allspice'],
    ['star-anise-whole', 'Star anise', 'star-anise'], ['peppercorn', 'Black peppercorns', 'black-pepper']
  ]);
  mat('seed', [
    ['cumin-seed', 'Cumin seed', 'cumin'], ['coriander-whole', 'Coriander seed', 'coriander-seed'],
    ['fennel-whole', 'Fennel seed', 'fennel-seed'], ['caraway-seed', 'Caraway seed', 'caraway'],
    ['mustard-seed', 'Mustard seed', null], ['fenugreek-seed', 'Fenugreek', 'fenugreek'],
    ['celery-seed', 'Celery seed', null], ['vanilla-pod', 'Vanilla pod', 'vanilla']
  ]);
  mat('roast', [
    ['coffee-bean', 'Whole coffee beans', 'coffee'], ['coffee-ground', 'Ground coffee', 'coffee'],
    ['cocoa-powder', 'Cocoa powder', 'cocoa'], ['black-tea', 'Black tea', 'tea-note'],
    ['green-tea-leaf', 'Green tea', 'green-tea'], ['peanut-butter', 'Peanut butter', 'roasted-almond'],
    ['sesame-oil', 'Toasted sesame oil', null], ['almond-toasted', 'Toasted almonds', 'roasted-almond']
  ]);
  mat('sweet', [
    ['vanilla-extract', 'Vanilla extract', 'vanillin'], ['honey-jar', 'Honey', 'honey'],
    ['maple-syrup', 'Maple syrup', 'maple'], ['brown-sugar', 'Brown sugar', 'burnt-sugar'],
    ['almond-extract', 'Almond extract', 'marzipan'], ['coconut-dried', 'Desiccated coconut', 'coconut'],
    ['orange-water', 'Orange blossom water', 'orange-blossom'], ['rose-water', 'Rose water', 'rose-damascena']
  ]);
  mat('ferment', [
    ['white-vinegar', 'White vinegar', 'fermented'], ['balsamic', 'Balsamic vinegar', 'fermented'],
    ['soy-sauce', 'Soy sauce', 'fermented'], ['fish-sauce', 'Fish sauce', 'brine'],
    ['dried-yeast', 'Dried yeast', 'fresh-bread'], ['cheese-rind', 'A hard cheese rind', 'goaty'],
    ['yoghurt', 'Plain yoghurt', 'milk-note'], ['pickle-brine', 'Pickle brine', 'brine']
  ]);
  mat('house', [
    ['pencil-shaving', 'Pencil shavings', 'pencil-shavings'], ['bar-soap', 'A bar of soap', 'soap-accord'],
    ['struck-match', 'A struck match', 'matchstick'], ['wet-pebble', 'A wet pebble', 'wet-stone'],
    ['old-book', 'An old book', 'paper'], ['olive-oil', 'Olive oil', null],
    ['shoe-polish', 'Shoe polish', 'leather-accord'], ['candle-wax', 'A blown-out candle', 'candle-snuff']
  ]);

  const MAT_BY_ID = {};
  for (const m of MATS) MAT_BY_ID[m.id] = m;
  const shelfMats = id => MATS.filter(m => m.shelf === id);

  /* ---------- Foundations ----------
     Fourteen sessions on four household anchors. The structure is the one used
     in smell-training protocols, written here as skill practice rather than
     therapy. The early ones take four minutes; the last of them take eight. */
  const F = (day, title, kind, mins, mats, brief, teach) =>
    ({ id: 'f' + day, track: 'foundations', day, title, kind, mins, mats, brief, teach });

  const FOUNDATIONS = [
    F(1, 'Four jars, twenty seconds each', 'attend', 4, ['coffee-ground', 'lemon-peel', 'clove-whole', 'mint-dried'],
      'Smell each one for twenty seconds with your eyes closed. Do not try to describe it yet. Just stay with it until the timer stops.',
      'Twenty seconds is longer than you think. Most people stop smelling after two.'),
    F(2, 'Name three things in each', 'describe', 5, ['coffee-ground', 'lemon-peel', 'clove-whole', 'mint-dried'],
      'Same four. This time say three separate things about each one out loud before you move on.',
      'Out loud matters. Saying it is what files it.'),
    F(3, 'Warm or cold', 'describe', 4, ['coffee-ground', 'lemon-peel', 'clove-whole', 'mint-dried'],
      'One question only, for each jar: does this smell warm or cold? Answer fast and do not argue with yourself.',
      'Temperature is the easiest axis to feel and the fastest way into a vocabulary.'),
    F(4, 'The first blind round', 'id', 5, ['coffee-ground', 'lemon-peel', 'clove-whole', 'mint-dried'],
      'Cover the four jars, shuffle them without looking, then name each one before you check.',
      'You will get four out of four. That is the point: your nose already works.'),
    F(5, 'Intensity ladder', 'ladder', 5, ['coffee-ground', 'clove-whole', 'mint-dried'],
      'Rank these three from quietest to loudest, then check yourself by smelling them in that order.',
      'Ranking forces comparison, and comparison is where discrimination is trained.'),
    F(6, 'Sixty seconds later', 'recall', 5, ['lemon-peel', 'orange-peel', 'grapefruit-peel'],
      'Smell one citrus. Wait sixty seconds doing nothing. Then find it again among all three.',
      'This is working memory for smell, and it is trainable like any other kind.'),
    F(7, 'Two greens', 'describe', 4, ['mint-dried', 'rosemary-sprig'],
      'Smell both. Write one sentence about how they differ. Not which you prefer: how they differ.',
      'Two similar things teach you more than ten different ones.'),
    F(8, 'Blind, with a decoy', 'id', 6, ['coffee-ground', 'lemon-peel', 'clove-whole', 'mint-dried', 'cinnamon-stick'],
      'Five jars now, one of them new. Shuffle, then name each before checking.',
      'The new one is the test. The four you know are the control.'),
    F(9, 'The anchor sentence', 'describe', 5, ['clove-whole', 'cinnamon-stick'],
      'For each: write one comparison sentence in your journal, using a scaffold. Do it before you look anything up.',
      'This is the technique the whole app is built on. Comparison encodes; adjectives do not.'),
    F(10, 'Ninety seconds later', 'recall', 6, ['cinnamon-stick', 'clove-whole', 'cardamom-pod'],
      'Smell one warm spice. Wait ninety seconds. Then find it among the three.',
      'Warm spices overlap, so this is genuinely harder than the citrus round.'),
    F(11, 'Loudest to quietest', 'ladder', 5, ['lemon-peel', 'coffee-ground', 'vanilla-extract', 'mint-dried'],
      'Four now. Rank by how far each one carries, not by how much you like it.',
      'You are ranking projection. It is the same judgement you make about a fragrance.'),
    F(12, 'Six blind', 'id', 7, ['coffee-ground', 'lemon-peel', 'clove-whole', 'mint-dried', 'cinnamon-stick', 'cardamom-pod'],
      'Six jars. Shuffle properly, take a break halfway through, and name each before checking.',
      'Take the break. Olfactory fatigue is real and it is why round six is always the worst.'),
    F(13, 'Describe without the noun', 'describe', 6, ['coffee-ground', 'cardamom-pod', 'vanilla-extract'],
      'Describe each one without naming it or anything it is made of. Only textures, temperatures and comparisons.',
      'Removing the noun is what forces the actual vocabulary to grow.'),
    F(14, 'The graduation round', 'id', 8, ['coffee-ground', 'lemon-peel', 'clove-whole', 'mint-dried', 'cinnamon-stick', 'cardamom-pod', 'vanilla-extract', 'rosemary-sprig'],
      'Eight jars, blind, with a two minute break in the middle. Then look at your accuracy curve.',
      'Compare this to day four. That difference is the only reason to keep a record.')
  ];

  // The two timed kinds carry their own clock, so the runner never guesses.
  FOUNDATIONS.forEach(s => {
    if (s.kind === 'recall') s.wait = s.day >= 10 ? 90 : 60;
    if (s.kind === 'attend') s.hold = 20;
  });

  /* ---------- The Pantry Conservatory ----------
     Three rounds per shelf, widening. Materials are chosen by the shelf and the
     round rather than at random, so a session is the same every time you repeat it. */
  const CONSERVATORY = [];
  SHELVES.forEach((s, si) => {
    const ms = shelfMats(s.id);
    [[1, 4], [2, 6], [3, 8]].forEach(([round, n]) => {
      CONSERVATORY.push({
        id: 'c' + s.id + round,
        track: 'conservatory',
        shelf: s.id,
        day: si * 3 + round,
        round,
        title: s.name + ', round ' + round,
        kind: 'id',
        mins: 4 + n,
        mats: ms.slice(0, n).map(m => m.id),
        brief: 'Set out these ' + n + ' in identical containers. Cover them, shuffle without looking, then name each one before you check the label.',
        teach: s.note
      });
    });
  });

  const TRACKS = [
    { id: 'foundations', name: 'Foundations', sessions: FOUNDATIONS,
      blurb: 'Fourteen sessions on four things in your kitchen. Attention first, then description, then blind identification.',
      needs: 'Coffee, a lemon, cloves and mint to begin with. Cinnamon, cardamom, vanilla and rosemary by the end.' },
    { id: 'conservatory', name: 'The Pantry Conservatory', sessions: CONSERVATORY,
      blurb: 'Twenty four sessions across eight shelves of your own kitchen, widening from four jars to eight.',
      needs: 'Whatever is already in your cupboards. Eight small identical containers make it much easier.' }
  ];
  const TRACK_BY_ID = {};
  for (const t of TRACKS) TRACK_BY_ID[t.id] = t;

  const KIND_LABEL = {
    attend: 'Attention', describe: 'Description', id: 'Blind identification',
    ladder: 'Intensity ladder', recall: 'Memory span'
  };

  /* ---------- collection vocabulary ---------- */
  const SILLAGE_SCALE = [
    { id: 'intimate', label: 'Intimate', note: 'Only somebody leaning in will find it.' },
    { id: 'arm', label: "Arm's length", note: 'A handshake distance. Most days, this is what you want.' },
    { id: 'room', label: 'Room', note: 'People notice when you walk in.' },
    { id: 'announcement', label: 'Announcement', note: 'It arrives before you do and stays after you leave.' }
  ];
  const SEASONS = [
    { id: 'spring', label: 'Spring' }, { id: 'summer', label: 'Summer' },
    { id: 'autumn', label: 'Autumn' }, { id: 'winter', label: 'Winter' }
  ];
  const CONTEXTS = [
    { id: 'everyday', label: 'Everyday' }, { id: 'work', label: 'Work' },
    { id: 'evening', label: 'Evening' }, { id: 'occasion', label: 'Occasion' },
    { id: 'travel', label: 'Travel' }, { id: 'home', label: 'Home alone' }
  ];
  const STATUSES = [
    { id: 'bottle', label: 'Bottle' }, { id: 'decant', label: 'Decant' },
    { id: 'sample', label: 'Sample' }, { id: 'empty', label: 'Emptied' },
    { id: 'rehomed', label: 'Rehomed' }
  ];

  return {
    FEELINGS, SCAFFOLDS, SHELVES, MATS, MAT_BY_ID, shelfMats,
    TRACKS, TRACK_BY_ID, KIND_LABEL, FOUNDATIONS, CONSERVATORY,
    SILLAGE_SCALE, SEASONS, CONTEXTS, STATUSES,
    feeling: id => FEELINGS.find(f => f.id === id) || null,
    material: id => MAT_BY_ID[id] || null,
    shelf: id => SHELVES.find(s => s.id === id) || null
  };
})();
