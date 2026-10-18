/* The valley's food web. Forty species, four biomes, arriving in dependency order.
   `req` is cumulative stillness. `deps` must be resident. `rule` is the extra
   condition that makes the rare ones rare. `tol` is how much blight a species
   will put up with before it withdraws. */
const Species = (() => {

  const BIOMES = [
    { id: 'meadow', name: 'The Meadow',   unlock: 0,    x0: 0,    x1: 620,
      blurb: 'Open ground, thin soil, everything begins here.' },
    { id: 'brook',  name: 'Brookside',    unlock: 1600,  x0: 620,  x1: 1240,
      blurb: 'A stream runs the width of the valley. Clear water is the whole test.' },
    { id: 'forest', name: 'Old Forest',   unlock: 5200, x0: 1240, x1: 1860,
      blurb: 'Slow wood. Nothing here arrives in a week.' },
    { id: 'ridge',  name: 'The Ridge',    unlock: 11000, x0: 1860, x1: 2480,
      blurb: 'Bare rock and wind. The last of the valley to come back.' }
  ];

  const LIST = [
    /* ---------------- The Meadow ---------------- */
    { id: 'meadow-grass', name: 'Meadow grass', biome: 'meadow', family: 'tuft',
      req: 4, deps: [], tol: 0.95, n: 26, scale: 1, pal: ['#7E9A5A', '#93AC66'],
      note: 'The first thing to come back is always grass. It asks for nothing except to be left alone, which is the only thing this valley has ever needed from you.' },

    { id: 'yarrow', name: 'Yarrow', biome: 'meadow', family: 'flower',
      req: 260, deps: ['meadow-grass'], tol: 0.9, n: 12, scale: 1, pal: ['#7F9457', '#F2EEE0'],
      note: 'Flat white heads on a wiry stem, standing in the places nothing else wants. Yarrow is what open ground does when it stops being disturbed.' },

    { id: 'sheeps-sorrel', name: "Sheep's sorrel", biome: 'meadow', family: 'flower',
      req: 420, deps: ['meadow-grass'], tol: 0.9, n: 11, scale: 0.9, pal: ['#7B914F', '#B4643F'],
      note: 'Rust-coloured spires, sour to chew, the plant that says the soil here is thin and acid and honest about it.' },

    { id: 'red-clover', name: 'Red clover', biome: 'meadow', family: 'flower',
      req: 620, deps: ['meadow-grass'], tol: 0.85, n: 12, scale: 1, pal: ['#6F8C4E', '#C4708C'],
      note: 'Clover puts nitrogen into the ground it stands in. The meadow is quietly feeding itself now, and it will be greener next month than it is today.' },

    { id: 'bumblebee', name: 'Bumblebee', biome: 'meadow', family: 'insect',
      req: 820, deps: ['red-clover'], tol: 0.62, n: 5, scale: 1, pal: ['#3A3226', '#D9A94A'],
      note: 'She found the clover within a day of it opening. Bees hold a map of the valley in their heads and update it constantly, which is a kind of attention worth envying.' },

    { id: 'meadow-brown', name: 'Meadow brown', biome: 'meadow', family: 'butterfly',
      req: 980, deps: ['yarrow'], tol: 0.6, n: 4, scale: 1, pal: ['#8A6237', '#C88A4C', '#2C2620'],
      note: 'The commonest butterfly in the country and still worth stopping for. It flies in dull weather when the showier ones will not, which is most of the year.' },

    { id: 'field-vole', name: 'Field vole', biome: 'meadow', family: 'critter',
      req: 1180, deps: ['meadow-grass'], tol: 0.5, n: 2, scale: 0.8, pal: ['#8A7A5C', '#C2B392'],
      note: 'Voles cut runways through the grass at ground level, a whole road network under the seed heads. You will almost never see one. Everything above them can.' },

    { id: 'skylark', name: 'Skylark', biome: 'meadow', family: 'flyer',
      req: 1400, deps: ['meadow-grass', 'bumblebee'], tol: 0.48, n: 2, scale: 0.85, pal: ['#8E7E62', '#E4DAC6'],
      note: 'It goes straight up and sings without stopping for minutes at a time, then drops silently into the grass. Nobody has ever explained the singing to my satisfaction.' },

    { id: 'harebell', name: 'Harebell', biome: 'meadow', family: 'flower',
      req: 1560, deps: ['sheeps-sorrel'], tol: 0.8, n: 9, scale: 0.95, pal: ['#7D9152', '#8FA8C6'],
      note: 'Pale blue bells on stems too thin to hold them still. In Scotland it is the bluebell, which has caused two hundred years of polite argument.' },

    { id: 'kestrel', name: 'Kestrel', biome: 'meadow', family: 'flyer',
      req: 1900, deps: ['field-vole'], tol: 0.4, n: 1, scale: 1.1, pal: ['#9C6E49', '#6B7688'],
      note: 'It hangs in one spot with its head perfectly still while the rest of it works hard against the wind. A kestrel over your meadow means the voles below have been left in peace long enough to breed.' },

    /* ---------------- Brookside ---------------- */
    { id: 'soft-rush', name: 'Soft rush', biome: 'brook', family: 'reed',
      req: 1650, deps: [], tol: 0.9, n: 16, scale: 1, pal: ['#68824A', '#8C9A5E'],
      note: 'Dark green quills at the water margin, the first thing to hold a wet bank together. Split one open and it is full of white pith like a candle wick, which is exactly what it used to be.' },

    { id: 'water-crowfoot', name: 'Water crowfoot', biome: 'brook', family: 'flower',
      req: 1820, deps: [], rule: { water: 0.4 }, tol: 0.7, n: 10, scale: 0.85, pal: ['#5D7F52', '#F3F0E4'],
      note: 'White flowers lying flat on the current with their leaves streaming out underneath. It only grows where the water actually moves, so its presence is a small certificate.' },

    { id: 'marsh-marigold', name: 'Marsh marigold', biome: 'brook', family: 'flower',
      req: 2050, deps: ['soft-rush'], tol: 0.78, n: 9, scale: 1.05, pal: ['#5F8047', '#E2B93F'],
      note: 'The oldest flower in the valley by lineage, older than the last ice. It opens before almost anything else and the bank goes gold overnight.' },

    { id: 'caddisfly', name: 'Caddisfly', biome: 'brook', family: 'insect',
      req: 2350, deps: ['water-crowfoot'], rule: { water: 0.6 }, tol: 0.5, n: 5, scale: 0.85, pal: ['#4C4436', '#B4A88A'],
      note: 'The larva builds itself a case out of grit and stick and lives inside it on the streambed. Anglers read caddis the way other people read weather. Clean water, or nothing.' },

    { id: 'banded-demoiselle', name: 'Banded demoiselle', biome: 'brook', family: 'insect',
      req: 2650, deps: ['soft-rush'], tol: 0.52, n: 4, scale: 1.2, pal: ['#1F5F6B', '#3E8FA0'],
      note: 'A damselfly the colour of oil on water, flying like a butterfly rather than a dart. The males hold a patch of bank and display over it all afternoon.' },

    { id: 'brown-trout', name: 'Brown trout', biome: 'brook', family: 'fish',
      req: 3000, deps: ['caddisfly'], rule: { water: 0.7 }, tol: 0.42, n: 3, scale: 1, pal: ['#7A6440', '#C6A167', '#B04A3A'],
      note: 'Holding station in the fastest part of the run, facing upstream, spending almost nothing. A trout is a very efficient argument for clean water.' },

    { id: 'dipper', name: 'Dipper', biome: 'brook', family: 'bird',
      req: 3350, deps: ['caddisfly'], tol: 0.44, n: 1, scale: 0.95, pal: ['#3C332B', '#F0EBDD'],
      note: 'A round brown bird with a white bib that walks into the stream and keeps walking, underwater, along the bottom. It is the only songbird in Europe that does this.' },

    { id: 'water-mint', name: 'Water mint', biome: 'brook', family: 'flower',
      req: 3700, deps: ['soft-rush'], tol: 0.75, n: 10, scale: 0.9, pal: ['#63834F', '#9E86B0'],
      note: 'You smell it before you see it, usually because you trod on it. Purple pom-poms and a scent that gets into your boots for the rest of the day.' },

    { id: 'grey-heron', name: 'Grey heron', biome: 'brook', family: 'wader',
      req: 4200, deps: ['brown-trout'], rule: { water: 0.75 }, tol: 0.28, n: 1, scale: 1, pal: ['#8C949C', '#E6E3DA', '#2E3238'],
      note: 'Herons do not fish so much as wait, and they can wait longer than you can watch. When one starts using your stream it has decided the fish are reliable.' },

    { id: 'otter', name: 'Otter', biome: 'brook', family: 'mammal',
      req: 4900, deps: ['brown-trout', 'grey-heron'], rule: { streak: 5 }, tol: 0.3, n: 1, scale: 1.05, pal: ['#6B5842', '#A08A6C'],
      note: 'Otters vanished from most of these rivers within living memory and came back only where the water did. Five clean days running is the least they will accept, and they are right to hold out.' },

    /* ---------------- Old Forest ---------------- */
    { id: 'bramble', name: 'Bramble', biome: 'forest', family: 'shrub',
      req: 5250, deps: [], tol: 0.92, n: 12, scale: 1, pal: ['#4F6B41', '#6E8752', '#3B2438'],
      note: 'Everyone wants to cut it out. Leave it and it becomes the nursery the whole wood grows up inside, thorn-fenced against everything that eats seedlings.' },

    { id: 'hazel', name: 'Hazel', biome: 'forest', family: 'tree',
      req: 5500, deps: [], tol: 0.88, n: 7, scale: 0.72, pal: ['#5C7044', '#6E5A3E'],
      note: 'Multi-stemmed and patient, the understorey that arrives before the canopy. Cut hazel to the ground and it comes back thicker, which is a trick oak never learned.' },

    { id: 'harts-tongue', name: "Hart's tongue fern", biome: 'forest', family: 'fern',
      req: 5800, deps: ['hazel'], tol: 0.82, n: 11, scale: 1, pal: ['#4E7040', '#6D8F52'],
      note: 'Undivided strap-shaped fronds, glossy, wrong-looking for a fern. It wants shade and lime and stillness, and it is the plant that tells you a wood is properly old.' },

    { id: 'wood-anemone', name: 'Wood anemone', biome: 'forest', family: 'flower',
      req: 6150, deps: ['hazel'], tol: 0.78, n: 14, scale: 0.8, pal: ['#5C7A44', '#F4F1E6'],
      note: 'Spreads about two metres a century, so a good carpet of it is older than the country it stands in. It flowers early, in the few weeks before the canopy closes over.' },

    { id: 'bluebell', name: 'Bluebell', biome: 'forest', family: 'flower',
      req: 6550, deps: ['wood-anemone'], tol: 0.7, n: 16, scale: 0.9, pal: ['#587A42', '#5C6FAE'],
      note: 'Half the world population grows on this one island and almost all of it in ancient woodland. The smell in late April is the strongest argument for leaving a wood alone.' },

    { id: 'wren', name: 'Wren', biome: 'forest', family: 'bird',
      req: 7000, deps: ['bramble'], tol: 0.55, n: 2, scale: 0.7, pal: ['#8A6642', '#C8AE84'],
      note: 'Nine grams, and the loudest bird per gram in the wood. It sings from inside the bramble where nothing can reach it, at a volume that seems like a mistake.' },

    { id: 'pedunculate-oak', name: 'Pedunculate oak', biome: 'forest', family: 'tree',
      req: 7500, deps: ['hazel'], tol: 0.85, n: 4, scale: 1.35, pal: ['#4A6739', '#5B4A34'],
      note: 'An oak supports more other species than any other tree here, somewhere near three hundred of them. It is less a tree than an address.' },

    { id: 'wood-mouse', name: 'Wood mouse', biome: 'forest', family: 'critter',
      req: 8000, deps: ['hazel'], tol: 0.5, n: 2, scale: 0.75, pal: ['#8B7350', '#D6C9A8'],
      note: 'It opens a hazelnut with a neat round hole and a rim of tooth marks. Once you learn to read the shells you find its winter stores everywhere.' },

    { id: 'chanterelle', name: 'Chanterelle', biome: 'forest', family: 'mushroom',
      req: 8500, deps: ['pedunculate-oak'], tol: 0.72, n: 9, scale: 0.9, pal: ['#C98A3A', '#E0AE5C'],
      note: 'It is not really the organism. The organism is a mesh through the soil, wrapped around the oak roots, trading sugar for minerals. This is only the part that shows.' },

    { id: 'red-fox', name: 'Red fox', biome: 'forest', family: 'mammal',
      req: 9100, deps: ['wood-mouse'], rule: { streak: 3 }, tol: 0.38, n: 1, scale: 1, pal: ['#B0562E', '#E8DFCB', '#332B26'],
      note: 'Three clean days running and she came back to the hollow at the wood edge. Foxes hold a territory by walking it every night, so the valley now has a boundary drawn by something living.' },

    { id: 'tawny-owl', name: 'Tawny owl', biome: 'forest', family: 'bird',
      req: 9900, deps: ['wood-mouse', 'pedunculate-oak'], rule: { evenings: 3 }, tol: 0.33, n: 1, scale: 1.5, pal: ['#7A6042', '#C3AC84', '#2A241E'],
      note: 'It needs your evenings, not your days. Three long still evenings in a week and it takes the hollow oak, and after that you hear it more often than you see it.' },

    /* ---------------- The Ridge ---------------- */
    { id: 'sheeps-fescue', name: "Sheep's fescue", biome: 'ridge', family: 'tuft',
      req: 11100, deps: [], tol: 0.95, n: 20, scale: 0.72, pal: ['#8B9463', '#A3A87A'],
      note: 'Fine blue-green grass growing in tight cushions where there is barely any soil at all. Almost the only green thing on the tops, and it holds the rest of the hill down.' },

    { id: 'map-lichen', name: 'Map lichen', biome: 'ridge', family: 'moss',
      req: 11500, deps: [], tol: 0.98, n: 14, scale: 1, pal: ['#A6B36B', '#2E2B25'],
      note: 'Yellow-green patches edged in black on bare rock, like countries on a chart. It grows about a millimetre a year, so geologists use it to date rockfalls.' },

    { id: 'ling-heather', name: 'Ling heather', biome: 'ridge', family: 'shrub',
      req: 12000, deps: ['sheeps-fescue'], tol: 0.86, n: 15, scale: 0.85, pal: ['#5F6B48', '#79855A', '#9E7C9E'],
      note: 'In August the whole ridge turns the colour of weak wine for about three weeks. The rest of the year it is a low grey-green mat that nothing much notices.' },

    { id: 'bilberry', name: 'Bilberry', biome: 'ridge', family: 'shrub',
      req: 12600, deps: ['ling-heather'], tol: 0.8, n: 12, scale: 0.75, pal: ['#5A7444', '#74885C', '#3A4A6E'],
      note: 'Low, wiry, and hiding fruit the colour of a bruise under its own leaves. You have to kneel to pick it, which is part of why so few people do.' },

    { id: 'rowan', name: 'Rowan', biome: 'ridge', family: 'tree',
      req: 13300, deps: ['ling-heather'], tol: 0.75, n: 4, scale: 0.95, pal: ['#5D7A4C', '#6A5B48', '#B2452F'],
      note: 'It grows out of crevices where no tree has any business growing, usually one to a crag. Every old rowan on a hill was planted by a bird that stopped to rest there.' },

    { id: 'ring-ouzel', name: 'Ring ouzel', biome: 'ridge', family: 'bird',
      req: 14100, deps: ['bilberry'], tol: 0.4, n: 1, scale: 0.95, pal: ['#33302C', '#EDE6D6'],
      note: 'A blackbird with a white crescent at the throat that will only nest high and only where it is quiet. It comes for the bilberries in autumn and it is gone again by November.' },

    { id: 'mountain-hare', name: 'Mountain hare', biome: 'ridge', family: 'critter',
      req: 15000, deps: ['sheeps-fescue'], tol: 0.42, n: 1, scale: 1.25, pal: ['#9A9382', '#E7E2D4'],
      note: 'It turns white in winter whether or not the snow arrives, which is a gamble it has been making for ten thousand years and is starting to lose.' },

    { id: 'golden-eagle', name: 'Golden eagle', biome: 'ridge', family: 'flyer',
      req: 16200, deps: ['mountain-hare'], rule: { streak: 7 }, tol: 0.28, n: 1, scale: 1.9, pal: ['#6B563B', '#B79764'],
      note: 'A pair holds a range you could walk across in a day and they will not tolerate being watched. Seven clean days running before it will even cross the ridge.' },

    { id: 'white-stag', name: 'The white stag', biome: 'ridge', family: 'stag',
      req: 17500, deps: ['rowan', 'pedunculate-oak'], rule: { offline: true }, tol: 0.25, n: 1, scale: 1, pal: ['#F2EFE4', '#C9C2AE', '#8A7F66'],
      note: 'One whole day with the feeds untouched. Not fewer minutes. None. He stands at the top of the ridge for as long as that lasts and there is no other way to bring him down.' }
  ];

  const BY_ID = {};
  for (const s of LIST) BY_ID[s.id] = s;

  const byBiome = b => LIST.filter(s => s.biome === b);
  const get = id => BY_ID[id] || null;
  const biome = id => BIOMES.find(b => b.id === id);

  /** Plain-English reason a species is not here yet. */
  function hint(s, state) {
    const missing = (s.deps || []).filter(d => !state.species[d] || state.species[d].status !== 'resident');
    if (missing.length) {
      const names = missing.map(d => BY_ID[d].name.toLowerCase());
      return `Waiting on ${names.join(' and ')}.`;
    }
    const b = biome(s.biome);
    if (state.growth < b.unlock) return `${b.name} has not opened yet.`;
    const r = s.rule || {};
    if (r.water && state.water < r.water) return 'The stream is not clear enough for it yet.';
    if (r.streak && state.streak < r.streak) return `Needs ${r.streak} clean days in a row. You are on ${state.streak}.`;
    if (r.evenings) return `Needs ${r.evenings} long still evenings inside one week.`;
    if (r.offline) return 'Needs one whole day with no feed minutes at all. None, not fewer.';
    if (state.growth < s.req) return 'Not enough stillness has gathered here yet.';
    return 'Everything it needs is here. Any day now.';
  }

  return { LIST, BIOMES, get, byBiome, biome, hint, count: LIST.length };
})();
