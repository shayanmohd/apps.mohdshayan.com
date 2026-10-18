/* Rucksack: the continent of Elsewhere.
   Everything here is authored data. The route, the weather and the camps are
   worked out from it on the phone, with no connection of any kind. */
var Content = (function () {
  'use strict';

  var TOTAL_KM = 3500;
  var STEPS_PER_KM = 1300;

  /* ---------------------------------------------------------------- regions
     `spine` is the road drawn in world coordinates on a 1000 x 2240 map.
     Each region owns its stretch of road, so its share of the map matches its
     share of the kilometres. */
  var REGIONS = [
    { id: 'reed', n: 1, name: 'The Reedlands', from: 0, to: 320,
      line: 'Water country. Windmills, ferries and a horizon you can see all of.',
      terrain: 'reed', land: '#CFD8BE', wash: 'rgba(122,146,104,0.20)',
      climate: [['drizzle',3],['mist',3],['highcloud',3],['rain',2],['clear',2],['wind',2]],
      kit: [['reed',120],['mill',5],['tree',22],['pool',26],['hut',9]],
      spine: [[500,2160],[430,2110],[470,2055],[400,2010],[430,1975]] },

    { id: 'wood', n: 2, name: 'Ashford Wood', from: 320, to: 620,
      line: 'Old forest. Charcoal smoke, green light, and deer that let you pass.',
      terrain: 'wood', land: '#C2CDAB', wash: 'rgba(96,124,82,0.22)',
      climate: [['mist',4],['highcloud',3],['rain',3],['drizzle',3],['clear',2],['thunder',1]],
      kit: [['tree',210],['hut',8],['pool',10],['stone',12]],
      spine: [[430,1975],[360,1930],[395,1880],[330,1840],[365,1800]] },

    { id: 'salt', n: 3, name: 'The Salt Road', from: 620, to: 1000,
      line: 'White flats and caravans. The wind here has been travelling longer than you.',
      terrain: 'salt', land: '#E4DCC4', wash: 'rgba(176,160,120,0.16)',
      climate: [['clear',5],['haze',4],['wind',4],['highcloud',2],['thunder',1]],
      kit: [['salt',90],['cairn',22],['tent',12],['dune',34]],
      spine: [[365,1800],[440,1760],[520,1730],[590,1685],[640,1630],[610,1580]] },

    { id: 'downs', n: 4, name: 'Kell Downs', from: 1000, to: 1320,
      line: 'Chalk hills and sheep. Larks all morning, and stones older than the road.',
      terrain: 'downs', land: '#D6D9BC', wash: 'rgba(140,150,108,0.18)',
      climate: [['clear',4],['wind',4],['highcloud',3],['rain',2],['drizzle',2],['mist',2]],
      kit: [['hill',48],['stone',26],['sheep',40],['tree',18]],
      spine: [[610,1580],[555,1540],[590,1490],[530,1450],[560,1395]] },

    { id: 'lake', n: 5, name: 'Lake Ithra', from: 1320, to: 1650,
      line: 'A flooded valley. The bell towers of the old town still stand out of the water.',
      terrain: 'lake', land: '#C4D2CE', wash: 'rgba(96,132,140,0.24)',
      climate: [['mist',5],['highcloud',3],['clear',3],['rain',2],['drizzle',2],['frost',1]],
      kit: [['water',130],['tower',9],['boat',14],['reed',40]],
      spine: [[560,1395],[625,1355],[690,1310],[650,1260],[600,1225],[560,1200]] },

    { id: 'pass', n: 6, name: 'The Sighing Pass', from: 1650, to: 1980,
      line: 'The mountain. Thin air, long silences, and a wind that sounds like breathing.',
      terrain: 'pass', land: '#D2CFC8', wash: 'rgba(112,112,124,0.22)',
      climate: [['snow',4],['wind',5],['frost',3],['clear',3],['mist',3],['downpour',1]],
      kit: [['peak',44],['scree',60],['snowline',18]],
      spine: [[560,1200],[505,1160],[540,1110],[480,1070],[510,1010]] },

    { id: 'steppe', n: 7, name: 'Verrow Steppe', from: 1980, to: 2330,
      line: 'Grass to every edge of the world. The sky does most of the talking.',
      terrain: 'steppe', land: '#DBD8B2', wash: 'rgba(158,152,96,0.18)',
      climate: [['clear',5],['wind',5],['highcloud',3],['thunder',2],['haze',2],['rain',1]],
      kit: [['grass',150],['tent',14],['horse',24],['cairn',10]],
      spine: [[510,1010],[430,975],[360,930],[300,880],[335,840],[390,805]] },

    { id: 'fen', n: 8, name: 'The Amber Fen', from: 2330, to: 2600,
      line: 'Peat and standing water. Lanterns on posts mark the only dry line across.',
      terrain: 'fen', land: '#C9C7A6', wash: 'rgba(126,116,72,0.24)',
      climate: [['mist',5],['drizzle',4],['rain',3],['highcloud',3],['frost',2],['clear',1]],
      kit: [['bog',110],['lamp',24],['reed',60],['tree',10]],
      spine: [[390,805],[440,765],[400,720],[450,685],[420,650]] },

    { id: 'coast', n: 9, name: 'Lantern Coast', from: 2600, to: 2950,
      line: 'Cliffs above a working sea. Every headland keeps a light, and every light has a keeper.',
      terrain: 'coast', land: '#CBD3C9', wash: 'rgba(92,124,132,0.22)',
      climate: [['wind',5],['clear',4],['rain',3],['mist',3],['downpour',2],['highcloud',3]],
      kit: [['cliff',40],['light',7],['water',90],['boat',12]],
      spine: [[420,650],[350,615],[290,570],[250,520],[300,485],[360,450]] },

    { id: 'orchard', n: 10, name: 'The Quiet Orchards', from: 2950, to: 3250,
      line: 'Terraces of fruit on a warm slope. Ladders left in the trees overnight.',
      terrain: 'orchard', land: '#D5D9AF', wash: 'rgba(140,158,88,0.20)',
      climate: [['clear',5],['haze',4],['highcloud',3],['drizzle',2],['rain',2],['mist',2]],
      kit: [['orchard',120],['hut',12],['hill',20],['bee',18]],
      spine: [[360,450],[430,415],[490,375],[450,330],[500,275]] },

    { id: 'cael', n: 11, name: 'Cael-on-the-Mountain', from: 3250, to: 3500,
      line: 'The last climb, and the city at the top of it. This is the end of the road.',
      terrain: 'cael', land: '#D8D2C4', wash: 'rgba(124,110,96,0.22)',
      climate: [['clear',5],['highcloud',3],['wind',3],['mist',3],['frost',2],['snow',1]],
      kit: [['peak',26],['step',40],['city',1],['light',4]],
      spine: [[500,275],[555,235],[520,190],[560,150],[530,110]] }
  ];

  /* --------------------------------------------------------------- waypoints
     Every place on the road has a kilometre. Names appear on the map once you
     have walked far enough to have seen them. */
  var WAYPOINTS = [
    { km: 0, name: "Fenwarden's Gate", kind: 'town', note: 'Where the road starts, and where you did.' },
    { km: 12, name: 'The Low Mill', kind: 'mill' },
    { km: 34, name: 'Ash Ford', kind: 'ferry', note: 'A rope ferry, a bell, and a woman who has heard every excuse.' },
    { km: 58, name: 'Heron Stand', kind: 'lookout' },
    { km: 82, name: 'Willowbrake', kind: 'village' },
    { km: 108, name: 'The Slow Cut', kind: 'canal' },
    { km: 140, name: 'Marsh Chapel', kind: 'shrine', note: 'Four walls, no roof, and a floor of clean water.' },
    { km: 172, name: 'Ditchmouth', kind: 'village' },
    { km: 205, name: 'The Eel Steps', kind: 'landmark' },
    { km: 240, name: 'Sallow Bridge', kind: 'bridge' },
    { km: 276, name: "Reedcutter's Row", kind: 'village' },
    { km: 308, name: 'The Last Windmill', kind: 'mill', note: 'After this one the country stands up and grows trees.' },

    { km: 330, name: 'Underbough', kind: 'gate' },
    { km: 356, name: "Collier's Clearing", kind: 'camp' },
    { km: 388, name: 'The Bent Oak', kind: 'landmark' },
    { km: 418, name: 'Stagwater', kind: 'pool' },
    { km: 452, name: 'Kindle Row', kind: 'village' },
    { km: 488, name: 'The Green Chapel', kind: 'ruin', note: 'A chapel the wood took back. The wood was gentle about it.' },
    { km: 522, name: 'Longshadow', kind: 'track' },
    { km: 556, name: 'Bark Market', kind: 'market' },
    { km: 590, name: 'Woodsend', kind: 'village' },
    { km: 616, name: 'The Eaves', kind: 'gate' },

    { km: 630, name: 'Saltgate', kind: 'town' },
    { km: 664, name: 'The First Pan', kind: 'saltpan' },
    { km: 700, name: 'Dry Wells', kind: 'well' },
    { km: 738, name: 'Caravanserai Ost', kind: 'inn', note: 'Shade, water, and forty people who all left at four in the morning.' },
    { km: 776, name: 'The Bone Mile', kind: 'landmark' },
    { km: 812, name: 'Windward Post', kind: 'post' },
    { km: 850, name: 'Half-Moon Pan', kind: 'saltpan' },
    { km: 888, name: 'Thirst Cairn', kind: 'cairn' },
    { km: 924, name: 'The White Mile', kind: 'flats', note: 'Salt so flat it holds the sky upside down after rain.' },
    { km: 962, name: 'Saltend', kind: 'town' },
    { km: 994, name: 'The Green Line', kind: 'boundary' },

    { km: 1010, name: 'Kell Foot', kind: 'village' },
    { km: 1042, name: "The Shepherd's Cut", kind: 'track' },
    { km: 1078, name: 'Nine Sisters', kind: 'stones', note: 'Nine stones. Someone counted wrong once and the name stuck.' },
    { km: 1112, name: 'Lark Hill', kind: 'hill' },
    { km: 1148, name: 'Chalkwater', kind: 'spring' },
    { km: 1184, name: 'Ewesbourne', kind: 'village' },
    { km: 1220, name: 'The White Horse', kind: 'landmark' },
    { km: 1256, name: 'Barrow Row', kind: 'barrows' },
    { km: 1292, name: 'Downsend', kind: 'village' },
    { km: 1316, name: 'Ithra Sight', kind: 'lookout', note: 'The first place the water shows, still an hour away.' },

    { km: 1330, name: 'Ithra Shore', kind: 'harbour' },
    { km: 1362, name: 'The First Bell', kind: 'tower' },
    { km: 1396, name: 'Cormorant Rock', kind: 'rock' },
    { km: 1432, name: 'Drowned Vesper', kind: 'tower', note: 'The tower still rings in a swell. Nobody has ever agreed on why.' },
    { km: 1468, name: 'The Long Jetty', kind: 'jetty' },
    { km: 1504, name: 'Ninefathom', kind: 'deep' },
    { km: 1540, name: "Bell-Diver's Hut", kind: 'hut' },
    { km: 1576, name: 'The Third Bell', kind: 'tower' },
    { km: 1612, name: 'Ithra North', kind: 'harbour' },
    { km: 1642, name: 'Mountain Gate', kind: 'gate' },

    { km: 1660, name: 'The Approach', kind: 'track' },
    { km: 1692, name: 'Roped Bridge', kind: 'bridge' },
    { km: 1726, name: 'Silence Camp', kind: 'camp' },
    { km: 1760, name: 'The Scree', kind: 'slope' },
    { km: 1796, name: 'The Sighing Gate', kind: 'pass', note: 'Two rocks and the wind between them. You will hear it before you see it.' },
    { km: 1830, name: 'Windmouth', kind: 'notch' },
    { km: 1862, name: 'The Cold Step', kind: 'step' },
    { km: 1896, name: 'Summit Cairn', kind: 'summit', note: 'The highest thing on the road. Everything after this leans downhill.' },
    { km: 1930, name: 'The Long Down', kind: 'slope' },
    { km: 1968, name: 'Snowmelt', kind: 'spring' },

    { km: 1990, name: 'Grasshead', kind: 'boundary' },
    { km: 2024, name: 'Horsewater', kind: 'well' },
    { km: 2060, name: 'The Kite Ground', kind: 'field', note: 'Flat, windy, and belonging entirely to the children of Verrow.' },
    { km: 2096, name: 'Verrow Camp', kind: 'camp' },
    { km: 2132, name: 'The Long Grass', kind: 'plain' },
    { km: 2168, name: 'Nine Winds Post', kind: 'post' },
    { km: 2204, name: "Mare's Rest", kind: 'village' },
    { km: 2240, name: 'The Singing Fence', kind: 'landmark' },
    { km: 2276, name: "Steppe's End", kind: 'boundary' },
    { km: 2318, name: 'Fenfoot', kind: 'landing' },

    { km: 2340, name: 'Peat Landing', kind: 'landing' },
    { km: 2368, name: 'The Lantern Line', kind: 'causeway', note: 'Two hundred posts, two hundred lamps, one dry way across.' },
    { km: 2398, name: 'Amber Cut', kind: 'dig' },
    { km: 2428, name: 'Sunkfoot', kind: 'bog' },
    { km: 2458, name: 'The Dry Island', kind: 'island' },
    { km: 2490, name: 'Wisp Reach', kind: 'reach' },
    { km: 2522, name: "Bogwalker's Post", kind: 'post' },
    { km: 2554, name: 'The Last Lantern', kind: 'lamp' },
    { km: 2588, name: 'Fen Gate', kind: 'gate' },

    { km: 2610, name: 'First Sight of Sea', kind: 'lookout', note: 'You smell it about a kilometre before you see it.' },
    { km: 2642, name: 'Gullstair', kind: 'stair' },
    { km: 2678, name: 'The Low Light', kind: 'lighthouse' },
    { km: 2712, name: 'Cove of Nets', kind: 'cove' },
    { km: 2748, name: 'Sealwatch', kind: 'point' },
    { km: 2784, name: 'The High Light', kind: 'lighthouse', note: 'Ninety one steps, and a keeper who counts them out loud for you.' },
    { km: 2820, name: 'Wreckbeach', kind: 'beach' },
    { km: 2856, name: "Lampmaker's Row", kind: 'village' },
    { km: 2892, name: 'Harbour Ede', kind: 'harbour' },
    { km: 2934, name: "Coast's End", kind: 'point' },

    { km: 2960, name: 'Orchard Gate', kind: 'gate' },
    { km: 2992, name: 'Ladder Row', kind: 'terrace' },
    { km: 3026, name: 'The Cider Barn', kind: 'barn', note: 'Warm, dim, and loud. Nobody has walked out of it in a hurry.' },
    { km: 3058, name: 'Beeyard', kind: 'apiary' },
    { km: 3092, name: 'Windfall', kind: 'hollow' },
    { km: 3126, name: 'The Grafted Tree', kind: 'tree' },
    { km: 3160, name: 'Pressing Floor', kind: 'floor' },
    { km: 3194, name: "Orchard's Head", kind: 'lookout' },
    { km: 3228, name: 'The Mountain Road', kind: 'road' },

    { km: 3260, name: 'First Step', kind: 'step' },
    { km: 3294, name: 'The Pilgrim Stair', kind: 'stair' },
    { km: 3328, name: 'Lampless Turn', kind: 'turn' },
    { km: 3362, name: 'The Middle Gate', kind: 'gate' },
    { km: 3396, name: 'Bell Terrace', kind: 'terrace' },
    { km: 3430, name: 'The Long Stair', kind: 'stair' },
    { km: 3464, name: 'The Last Gate', kind: 'gate', note: 'Open. It has been open the whole time.' },
    { km: 3500, name: 'Cael-on-the-Mountain', kind: 'city', note: 'The end of the road.' }
  ];

  /* ----------------------------------------------------------------- weather
     Elsewhere keeps its own weather. It is worked out from the date and the
     region you are standing in, which is why it needs no connection. */
  var WEATHER = {
    clear:     { name: 'Clear',        camp: 'Clear sky. The fire has to do all the work of the light.',
                 journal: ['a clear sky', 'weather that asked nothing of anybody', 'sun the whole way and no wind to speak of'],
                 particles: null, dark: 0.00, wind: 0.1 },
    highcloud: { name: 'High cloud',   camp: 'High cloud, moving too slowly to watch.',
                 journal: ['high cloud all day', 'a flat white sky', 'cloud too high to mean anything'],
                 particles: null, dark: 0.10, wind: 0.2 },
    drizzle:   { name: 'Drizzle',      camp: 'Drizzle. Not enough to shelter from, enough to soak you.',
                 journal: ['a drizzle that never committed', 'the sort of rain you only notice at lunch', 'thin rain from about ten'],
                 particles: 'rain', dark: 0.22, wind: 0.2 },
    rain:      { name: 'Rain',         camp: 'Rain, steady and companionable once you stop fighting it.',
                 journal: ['rain from midday', 'steady rain and no hurry about it', 'proper rain, and warm enough not to mind'],
                 particles: 'rain', dark: 0.30, wind: 0.3 },
    downpour:  { name: 'Downpour',     camp: 'A downpour that arrived like an opinion.',
                 journal: ['a downpour', 'rain that came down like a decision', 'an hour of rain worth two of anything else'],
                 particles: 'rain', dark: 0.42, wind: 0.5 },
    wind:      { name: 'Wind',         camp: 'Wind. It found the one gap in your collar and stayed there.',
                 journal: ['a wind with an argument in it', 'wind on the left cheek all day', 'a headwind that took its work seriously'],
                 particles: null, dark: 0.06, wind: 0.9 },
    mist:      { name: 'Mist',         camp: 'Mist. The world shrank to about forty paces and got friendlier.',
                 journal: ['mist that never lifted', 'forty paces of visibility and no more', 'a soft grey morning that lasted all day'],
                 particles: 'mist', dark: 0.18, wind: 0.1 },
    frost:     { name: 'Frost',        camp: 'Frost. Everything you own is stiff and honest.',
                 journal: ['a hard frost', 'frost until eleven and cold after', 'white grass and a very clean sky'],
                 particles: null, dark: 0.14, wind: 0.2 },
    snow:      { name: 'Snow',         camp: 'Snow, falling straight down, taking its time.',
                 journal: ['snow, patient about it', 'snow falling straight down', 'a slow snow that settled on the pack'],
                 particles: 'snow', dark: 0.20, wind: 0.3 },
    haze:      { name: 'Warm haze',    camp: 'Warm haze. The far country went the colour of weak tea.',
                 journal: ['a warm haze', 'a haze that ate the far country', 'warm air and a soft horizon'],
                 particles: null, dark: 0.05, wind: 0.1 },
    thunder:   { name: 'Thunder',      camp: 'Thunder somewhere behind you, never quite catching up.',
                 journal: ['thunder in the west', 'thunder that never arrived', 'a storm going on somewhere else'],
                 particles: 'rain', dark: 0.34, wind: 0.6 }
  };

  /* -------------------------------------------------------------------- gear
     Forged by walking on consecutive days. Never taken away once forged. */
  var GEAR = [
    { id: 'cup',     days: 3,   name: 'Ash-Handled Cup',   from: 'The Reedlands',
      line: 'Cut from a stick you were going to burn.', flourish: 'The cup earns its keep every morning.' },
    { id: 'cloak',   days: 7,   name: 'Reed Cloak',        from: 'The Reedlands',
      line: 'Woven in a week of evenings. It sheds rain and smells of the river.', flourish: 'The reed cloak is stiff with river smell.' },
    { id: 'boots',   days: 14,  name: 'Salt-Cured Boots',  from: 'Ashford Wood',
      line: 'Resoled twice. The left one still complains on hills.', flourish: 'The left boot complained on the hills again.' },
    { id: 'staff',   days: 21,  name: 'Chalk-Marked Staff', from: 'Kell Downs',
      line: 'One notch a week, cut at the hearth, never counted out loud.', flourish: 'Another notch in the staff.' },
    { id: 'lantern', days: 30,  name: 'The Far-Lantern',   from: 'Lake Ithra',
      line: 'Throws light further than it has any right to. Nobody explains it.', flourish: "The far-lantern held the dark off at arm's length." },
    { id: 'bell',    days: 45,  name: 'Ithra Bell-Charm',  from: 'Lake Ithra',
      line: 'A finger of bronze off a drowned bell. It hums when the wind is right.', flourish: 'The bell-charm hummed on the wind.' },
    { id: 'pin',     days: 60,  name: 'Pass-Iron Pin',     from: 'The Sighing Pass',
      line: 'Cold-forged from a nail out of the roped bridge.', flourish: 'The iron pin has gone the colour of the mountain.' },
    { id: 'compass', days: 75,  name: 'Steppe Compass',    from: 'Verrow Steppe',
      line: 'Points north, mostly. The Verrow say it points at whatever you have decided.', flourish: 'The compass agreed with the road for once.' },
    { id: 'amber',   days: 90,  name: 'Fen Amber Bead',    from: 'The Amber Fen',
      line: 'Something small and dead is in it, forty million years into a good rest.', flourish: 'The amber bead caught the firelight.' },
    { id: 'lens',    days: 120, name: 'Coast Glass Lens',  from: 'Lantern Coast',
      line: 'A cracked lamp lens. Holds the sun in a white dot the size of a seed.', flourish: 'The lens made a white seed of the sun.' },
    { id: 'coat',    days: 150, name: 'Orchard Wax Coat',  from: 'The Quiet Orchards',
      line: 'Waxed with orchard tallow. It creaks. You will not part with it.', flourish: 'The wax coat creaked all the way up.' },
    { id: 'token',   days: 200, name: 'Cael Road-Token',   from: 'Cael-on-the-Mountain',
      line: 'Given to walkers who kept going for two hundred days. There are not many.', flourish: 'The road-token is warm in a pocket.' }
  ];

  /* --------------------------------------------------------- journal phrases */
  var OPENERS = [
    'Walked', 'Made', 'Covered', 'Put down', 'Got through', 'Managed'
  ];
  var CLOSERS = {
    reed:    ['Camped on dry ground, which took some finding.', 'Frogs all night. No complaints.',
              'The water was doing its slow business in the dark.', 'A ferryman shouted something friendly across the cut and I never worked out what.',
              'Fire made of reed and old fencing. It burned like a rumour.', 'Herons standing about like people waiting for a bus.'],
    wood:    ['Camped under something enormous and patient.', 'The wood ticked and settled for an hour after dark.',
              'Smoke went straight up, so nothing was coming.', 'Two deer watched me eat and then thought better of it.',
              'Green light all afternoon. Hard to tell what time anything was.', 'Slept badly and could not say why. The wood was not to blame.'],
    salt:    ['Camped where the wind had built a wall for me.', 'The salt went blue at dusk and then went nowhere.',
              'Water rationed. Fire made of almost nothing.', 'A cart passed at midnight without stopping, and neither of us minded.',
              'Boots white to the ankle. Everything white to the ankle.', 'The horizon did not move all day, which is its way of being difficult.'],
    downs:   ['Camped in the lee of a bank, out of the lark noise.', 'Sheep watched the fire until they got bored.',
              "The chalk holds the day's warmth. Good ground.", 'Wind all day from the same quarter. Right ear still complaining.',
              'Found a flint with a hole in it and kept it for no reason.', 'The turf up here is springy enough to make a slow day quick.'],
    lake:    ['Camped on the shore. Something rang once, far out.', 'The lake was flat enough to walk on, if you were lying.',
              'Mist came in over the water and stayed for the night.', 'A boat went by with one lamp and no conversation.',
              'The water is very cold and very clear and full of a whole town.', 'Slept to the sound of small waves being extremely regular.'],
    pass:    ['Camped in a hollow, out of the worst of it.', 'The mountain kept breathing all night.',
              'Too cold to write much. Fire kept small and close.', 'Everything in the pack is now the same temperature as the pack.',
              'Snow squeaked underfoot, which apparently means it is properly cold.', 'Nothing lives up here and it is not being rude about it.'],
    steppe:  ['Camped with nothing to lean on for a hundred kilometres.', 'Grass moved all night like water thinking about it.',
              'Every star in the inventory was out.', 'Heard horses long before I saw them and long after they had gone.',
              'The sky did all the weather in one afternoon and then apologised.', 'No shade, no shelter, and no reason to hurry.'],
    fen:     ['Camped on the only dry hummock going.', 'A lantern down the line was lit by somebody I never saw.',
              'The fen made its noises. I let it.', 'Boards underfoot all day. You learn to trust them by about noon.',
              'Peat smoke, which smells like a hundred years of somebody else.', 'Something moved in the water and I decided it was an otter.'],
    coast:   ['Camped above the beach, out of the spray.', 'The light came round every eleven seconds. I counted.',
              'Sea all night. It never once repeated itself.', 'Salt on everything, including the bread. Especially the bread.',
              'Gulls conducting an argument that has been running for generations.', 'Watched the tide take the day back out with it.'],
    orchard: ['Camped between two rows, on windfall.', 'Bees quiet, birds not.',
              'The whole slope smelled of cider and it was not even pressing week.', 'Somebody left a ladder up. Somebody always leaves a ladder up.',
              'Ate two apples that were not mine and left a coin on the post.', 'Warm ground, low branches, and no wind at all.'],
    cael:    ['Camped on a step, of all things.', 'City lights above me now, not ahead of me.',
              'Short sleep. Too close to the end for a long one.', 'The stair goes on. It has gone on for four hundred years.',
              'Bells from somewhere above, at an hour that made no sense.', 'Looked back once. The whole road was down there in the dark.']
  };


  /* ---------------------------------------------------------------- helpers */
  function regionAt(km) {
    for (var i = REGIONS.length - 1; i >= 0; i--) if (km >= REGIONS[i].from) return REGIONS[i];
    return REGIONS[0];
  }
  function regionById(id) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
    return null;
  }
  function nextWaypoint(km) {
    for (var i = 0; i < WAYPOINTS.length; i++) if (WAYPOINTS[i].km > km + 0.0001) return WAYPOINTS[i];
    return null;
  }
  function lastWaypoint(km) {
    var w = WAYPOINTS[0];
    for (var i = 0; i < WAYPOINTS.length; i++) if (WAYPOINTS[i].km <= km + 0.0001) w = WAYPOINTS[i];
    return w;
  }
  function waypointsBetween(a, b) {
    var out = [];
    for (var i = 0; i < WAYPOINTS.length; i++) {
      if (WAYPOINTS[i].km > a + 0.0001 && WAYPOINTS[i].km <= b + 0.0001) out.push(WAYPOINTS[i]);
    }
    return out;
  }

  /* A small stable hash, so the same day gives the same weather in every copy. */
  function hash(s) {
    var h = 2166136261, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function weatherFor(dateStr, km) {
    var r = regionAt(km);
    var h = hash('elsewhere' + dateStr + r.id);
    var total = 0, i;
    for (i = 0; i < r.climate.length; i++) total += r.climate[i][1];
    var pick = h % total, id = 'clear';
    for (i = 0; i < r.climate.length; i++) {
      pick -= r.climate[i][1];
      if (pick < 0) { id = r.climate[i][0]; break; }
    }
    var w = WEATHER[id];
    return { id: id, name: w.name, camp: w.camp,
             journal: w.journal[(h >>> 9) % w.journal.length],
             particles: w.particles, dark: w.dark, wind: w.wind };
  }

  function gearFor(streakDays) {
    var out = [];
    for (var i = 0; i < GEAR.length; i++) if (GEAR[i].days <= streakDays) out.push(GEAR[i]);
    return out;
  }
  function gearById(id) {
    for (var i = 0; i < GEAR.length; i++) if (GEAR[i].id === id) return GEAR[i];
    return null;
  }
  function nextGear(streakDays) {
    for (var i = 0; i < GEAR.length; i++) if (GEAR[i].days > streakDays) return GEAR[i];
    return null;
  }

  var fmtKm = function (km) {
    if (km >= 100) return Math.round(km).toLocaleString();
    return (Math.round(km * 10) / 10).toFixed(1);
  };

  return {
    TOTAL_KM: TOTAL_KM, STEPS_PER_KM: STEPS_PER_KM,
    REGIONS: REGIONS, WAYPOINTS: WAYPOINTS, WEATHER: WEATHER, GEAR: GEAR,
    OPENERS: OPENERS, CLOSERS: CLOSERS,
    regionAt: regionAt, regionById: regionById,
    nextWaypoint: nextWaypoint, lastWaypoint: lastWaypoint, waypointsBetween: waypointsBetween,
    weatherFor: weatherFor, hash: hash,
    gearFor: gearFor, gearById: gearById, nextGear: nextGear, fmtKm: fmtKm
  };
})();
