/* Sillage. The lexicon: the words for what you smell.
   Every card is written to be read in ten seconds and remembered for longer.
   f = family, w = what it is, o = where you meet it, r = related cards.
   This file is content, not logic. It never changes at runtime. */
const Lexicon = (() => {

  const FAMILIES = [
    { id: 'citrus',   name: 'The Citrus Grove',   hue: '#B0871B', blurb: 'Peel oils and pith. The bright, short-lived top of almost everything.' },
    { id: 'green',    name: 'The Green Bench',    hue: '#5C7A46', blurb: 'Sap, stem, crushed leaf. The smell of something being broken open.' },
    { id: 'white',    name: 'The White Flowers',  hue: '#9A8E5E', blurb: 'Jasmine, tuberose, orange blossom. Sweetness with an animal shadow.' },
    { id: 'floral',   name: 'The Flower Room',    hue: '#A2607A', blurb: 'Rose, violet, iris and the rest. The oldest vocabulary in perfumery.' },
    { id: 'fruit',    name: 'The Orchard',        hue: '#A85A3C', blurb: 'Flesh rather than peel. Jam, skin, stone and the edge of fermentation.' },
    { id: 'spice',    name: 'The Spice Drawer',   hue: '#96501F', blurb: 'Warm and cold spices, and the line between food and perfume.' },
    { id: 'wood',     name: 'The Timber Yard',    hue: '#7A6242', blurb: 'Heartwood, sawdust, pencil shavings and the long dry finish.' },
    { id: 'resin',    name: 'The Resin Bench',    hue: '#8A5A24', blurb: 'What a tree bleeds. Church, amber, balsam and glue.' },
    { id: 'animal',   name: 'The Animalic Cellar',hue: '#6E4A3A', blurb: 'Leather, skin, fur and the notes that divide a room.' },
    { id: 'musk',     name: 'Musk and Powder',    hue: '#8A7E76', blurb: 'The quiet half. Clean laundry, warm skin, face powder, near-silence.' },
    { id: 'gourmand', name: 'The Sweet Kitchen',  hue: '#8C5B33', blurb: 'Vanilla, caramel, coffee, chocolate. Perfume that smells edible.' },
    { id: 'earth',    name: 'Earth and Stone',    hue: '#6B6250', blurb: 'Soil, root, mushroom, flint, wet concrete. The mineral half of the world.' },
    { id: 'marine',   name: 'Air, Salt, Water',   hue: '#4E7280', blurb: 'Ozone, sea air, rain and the notes that read as cold and open.' },
    { id: 'smoke',    name: 'Smoke and Fire',     hue: '#5E5750', blurb: 'Tar, birch, incense, ash. The most memory-loaded family there is.' },
    { id: 'craft',    name: 'Words of the Craft', hue: '#4F6B60', blurb: 'The vocabulary itself: structure, behaviour, technique and the argument words.' }
  ];

  const N = [];
  const add = (f, list) => { for (const x of list) N.push({ id: x[0], t: x[1], f, w: x[2], o: x[3], r: x[4] || [] }); };

  add('citrus', [
    ['bergamot', 'Bergamot', "A small bitter orange from Calabria whose peel oil is the opening of half of Western perfumery.", "Earl Grey tea, the first three minutes of most colognes, and the top of every chypre ever made.", ['lemon','neroli','chypre']],
    ['lemon', 'Lemon', "The sharpest, most legible citrus. Clean, slightly metallic, gone in ten minutes.", "Peel a lemon and hold the zest under a lamp. That fine spray is the oil leaving.", ['citral','lime','verbena']],
    ['lime', 'Lime', "Greener and more bitter than lemon, with a faint dusty edge that reads as tropical.", "A cut lime, gin and tonic, and the smell of a cola bottle opening.", ['lemon','kaffir','bitter-orange']],
    ['sweet-orange', 'Sweet orange', "Round, juicy, cheerful, and the least serious citrus in the drawer.", "Orange peel thrown on a fire in December. It is the smell most people call happy.", ['mandarin','blood-orange','candied-peel']],
    ['bitter-orange', 'Bitter orange', "The Seville. Harsher and drier than sweet orange, with real bite behind the sugar.", "Marmalade, and the second layer of any cologne that smells expensive.", ['neroli','petitgrain','bergamot']],
    ['grapefruit', 'Grapefruit', "Citrus with sulphur in it. That faint struck-match quality is what makes it read as fresh rather than sweet.", "Pink grapefruit peel, and almost every sports fragrance made since 1995.", ['pomelo','lemon','sulphury']],
    ['pomelo', 'Pomelo', "Grapefruit's larger, softer cousin. Thick white pith, less acid, more floral.", "Asian grocers in winter, and the top of several modern colognes.", ['grapefruit','pith']],
    ['mandarin', 'Mandarin', "Soft, sweet, slightly powdery citrus with none of lemon's aggression.", "A satsuma at Christmas, peeled in a warm room.", ['clementine','sweet-orange','tangerine-leaf']],
    ['clementine', 'Clementine', "Brighter and thinner than mandarin, with a green stem quality behind the sugar.", "The bowl on the table in January that nobody empties.", ['mandarin','sweet-orange']],
    ['yuzu', 'Yuzu', "Japanese citrus: grapefruit bitterness, mandarin sweetness, and a floral top nothing else has.", "Ponzu, yuzu kosho, and a winter bath with the whole fruit floating in it.", ['grapefruit','kaffir','sudachi']],
    ['sudachi', 'Sudachi', "Small, green, savagely sour. Reads herbal rather than fruity.", "Squeezed over grilled fish in autumn in Japan.", ['yuzu','lime']],
    ['calamansi', 'Calamansi', "A tiny Filipino citrus between lime and mandarin, sweeter than either would suggest.", "Calamansi juice, and dipping sauce beside anything fried.", ['lime','mandarin']],
    ['citron', 'Citron', "Mostly pith and peel, barely any juice. The original citrus, and the ancestor of the rest.", "Candied peel in panettone, and the etrog in a synagogue at Sukkot.", ['candied-peel','pith']],
    ['blood-orange', 'Blood orange', "Orange with a raspberry shadow. Slightly fermented, slightly bloody, genuinely different.", "A Sicilian blood orange cut in half, and Campari.", ['sweet-orange','raspberry']],
    ['petitgrain', 'Petitgrain', "Distilled from the leaves and twigs of the bitter orange tree, not the fruit. Green, woody, a little sour.", "The dry, papery citrus in old barbershop colognes.", ['neroli','bitter-orange','green-note']],
    ['neroli', 'Neroli', "Steam-distilled bitter orange blossom. Cool, green, soapy and slightly metallic.", "Traditional baby cologne, and the cleanest smell in the white-flower family.", ['orange-blossom','petitgrain','bitter-orange']],
    ['verbena', 'Lemon verbena', "Lemon crossed with grass. Sharper and more herbal than any real lemon.", "Crush a leaf between your fingers. Southern French soap and iced tea.", ['lemon','lemongrass','green-note']],
    ['lemongrass', 'Lemongrass', "Fatty, waxy lemon with a cut-stem greenness underneath.", "Thai curry paste, and the citronella candle on a summer table.", ['verbena','citral','kaffir']],
    ['kaffir', 'Makrut lime leaf', "The most three-dimensional citrus smell there is: lime peel, soap, and something almost floral.", "Torn into Thai soup. Tear one leaf and you will never confuse it again.", ['lime','lemongrass','yuzu']],
    ['candied-peel', 'Candied peel', "Citrus with the sharpness cooked out and sugar left behind. Warmer, stickier, a little medicinal.", "Christmas cake, and the base of many so-called fresh orientals.", ['citron','sweet-orange','caramel']],
    ['pith', 'Pith', "The white layer under the peel. Bitter, dry, faintly green, and the thing that stops citrus reading as juice.", "Scrape the inside of an orange peel with a nail and smell your thumb.", ['bitter-orange','pomelo','bitter']],
    ['citral', 'Citral', "The molecule that makes lemon smell like lemon. Also present in lemongrass, verbena and litsea.", "Anything labelled lemon-scented is usually mostly this.", ['lemon','lemongrass','verbena']]
  ]);

  add('green', [
    ['galbanum', 'Galbanum', "A resin that smells violently green: crushed stem, bitter sap, cold and unwelcoming at first.", "The opening of many classic green florals. Two drops read as an entire hedge.", ['violet-leaf','green-note','chypre']],
    ['violet-leaf', 'Violet leaf', "Green, wet, slightly metallic, with a cucumber and cut-stalk coolness. Nothing like the flower.", "Modern menswear openings, and the smell of a florist's bin.", ['galbanum','cucumber','violet']],
    ['tomato-leaf', 'Tomato leaf', "Bitter, furry, hot green. Instantly recognisable and almost never sweet.", "Brush a tomato plant in a greenhouse in August and smell your wrist.", ['green-note','fig-leaf']],
    ['fig-leaf', 'Fig leaf', "Milky, coconut-adjacent green with a sappy bitterness behind it.", "A fig tree in the sun, which smells more of leaf and milk than of fruit.", ['fig','coconut','green-note']],
    ['cut-grass', 'Cut grass', "The distress signal of a wounded plant, and one of the most universally liked smells on earth.", "Any mown lawn. The molecule behind it is cis-3-hexenol.", ['hay','green-note']],
    ['hay', 'Hay', "Grass after it dries: sweet, dusty, warm, with coumarin doing most of the work.", "A barn in late summer, and the soft floor of a fougere.", ['coumarin','tonka','cut-grass']],
    ['peppermint', 'Peppermint', "Cold, sharp, medicinal. The cooling is a trick played on your nerves, not your nose.", "Toothpaste, and the reason mint is a good training material: nobody mistakes it.", ['spearmint','camphoraceous']],
    ['spearmint', 'Spearmint', "Softer and sweeter than peppermint, with a slightly bubblegum roundness.", "Mojitos, chewing gum, and mint sauce.", ['peppermint','green-note']],
    ['basil', 'Basil', "Green, peppery, faintly aniseed. Sweet basil and Thai basil are two different smells.", "Tear a leaf. This is the herb that teaches people they can tell varieties apart.", ['star-anise','tarragon','green-note']],
    ['tarragon', 'Tarragon', "Aniseed with a bitter green edge and a whisper of hay.", "Bearnaise sauce, and the herbal top of several classic fougeres.", ['basil','fennel','fougere']],
    ['rosemary', 'Rosemary', "Camphor, pine and resin in a leaf. Cold at first, dusty and warm on the way out.", "Rub a sprig. The camphor top is why beginners often call it medicinal.", ['camphoraceous','pine-needle','thyme']],
    ['thyme', 'Thyme', "Dry, hot, slightly antiseptic. Thymol is a real disinfectant, so the association is honest.", "A Provencal hillside, and the smell of an old-fashioned mouthwash.", ['rosemary','oregano','sage']],
    ['oregano', 'Oregano', "Thyme's louder relative: hotter, sharper, more insistent.", "Dried on a pizza, where it survives the oven better than almost anything.", ['thyme','sage']],
    ['sage', 'Sage', "Dusty, grey, faintly sweaty green. The smell of a dry herb rather than a fresh one.", "Rubbed sage in stuffing, and burning bundles in a room that wants to seem calm.", ['clary-sage','thyme']],
    ['clary-sage', 'Clary sage', "Not the kitchen herb. Musky, ambery, faintly like tobacco and warm skin.", "A workhorse in lavender compositions, where it does the rounding.", ['sage','lavender','ambrette-seed']],
    ['lavender', 'Lavender', "Herbal, camphorous, faintly floral, faintly soapy. English lavender is sharper than French.", "Linen cupboards, and the head of the entire fougere family.", ['fougere','coumarin','camphoraceous']],
    ['geranium', 'Geranium', "Rose crossed with mint and green stem. Sharp, a little sour, unmistakably rosy.", "Rose geranium leaves, and the rose note in most masculine fragrances.", ['rose-damascena','rose-oxide','green-note']],
    ['cucumber', 'Cucumber', "Cool, watery, faintly melon. Reads as fresh air with a green skin on it.", "The peel, not the flesh. Slice one and smell the knife.", ['violet-leaf','melon','aquatic-accord']],
    ['green-tea', 'Green tea', "Grassy, slightly bitter, faintly smoky, with an almost marine edge in the better ones.", "Sencha steeping, and a whole 1990s genre of quiet fragrances.", ['cut-grass','marine','tea-note']],
    ['artemisia', 'Artemisia', "Wormwood. Bitter, cold, herbal, faintly sour. Difficult and very good.", "Absinthe, and the bracing top of some old chypres.", ['galbanum','tarragon','bitter']],
    ['angelica', 'Angelica root', "Earthy, musky, peppery green with a strange animal warmth underneath.", "Gin, and the notes people describe as smelling like a damp forest floor.", ['juniper','earth','musk']],
    ['bamboo', 'Bamboo', "Watery green with a papery, slightly sweet stem quality.", "Fresh bamboo shoots, and a fragrance shorthand for calm since about 1998.", ['green-tea','cut-grass','aquatic-accord']]
  ]);

  add('white', [
    ['jasmine-grandiflorum', 'Jasmine grandiflorum', "The rich, fruity, faintly fatty jasmine. Apricot and tea under the flower.", "Grasse absolute, and the heart of a thousand French perfumes.", ['jasmine-sambac','indole','apricot']],
    ['jasmine-sambac', 'Jasmine sambac', "Cooler, greener and more piercing than grandiflorum, with a leathery edge.", "Jasmine tea, and garlands sold outside temples in south India.", ['jasmine-grandiflorum','green-tea','indole']],
    ['tuberose', 'Tuberose', "Creamy, mentholated, rubbery, enormous. The flower that divides rooms.", "One stem will scent a whole floor. Smell it in the evening, when it is loudest.", ['gardenia','indole','camphoraceous']],
    ['gardenia', 'Gardenia', "Mushroom and coconut inside a white flower. Slightly rotting, entirely beautiful.", "A gardenia going over in a warm room, which is when it is most itself.", ['tuberose','mushroom','coconut']],
    ['orange-blossom', 'Orange blossom', "Warmer, sweeter and more indolic than neroli, which comes from the same flower by another route.", "Spanish streets in April, and orange flower water in pastry.", ['neroli','indole','honey']],
    ['ylang-ylang', 'Ylang ylang', "Banana, custard, clove and rubber. Tropical, oily, and much stranger than its reputation.", "The Comoros export most of it. Smell the first distillation grade if you can.", ['banana','clove','jasmine-grandiflorum']],
    ['frangipani', 'Frangipani', "Plumeria: peach, coconut and white flower, sweeter and simpler than tuberose.", "Hotel lobbies in the tropics, and a flower that keeps its smell after it falls.", ['gardenia','coconut','peach']],
    ['magnolia', 'Magnolia', "Lemon inside a white flower. Fresh, waxy, almost soapy.", "A magnolia grandiflora bloom the size of a plate, which smells of citrus for one day.", ['lemon','champaca','white']],
    ['honeysuckle', 'Honeysuckle', "Nectar-sweet, green-stemmed, thin and bright rather than heavy.", "A hedge at dusk in June. The smell arrives in waves as the air moves.", ['jasmine-sambac','nectar','green-note']],
    ['madonna-lily', 'Lily', "Pollen, green stalk and a peppery sweetness that turns almost plastic up close.", "A florist's bucket of stargazers, which you can smell from the pavement.", ['pollen','honeysuckle']],
    ['muguet', 'Lily of the valley', "Green, watery, faintly soapy, slightly bitter. Nobody has ever extracted it: every muguet is a reconstruction.", "A spring garden, and the most-used accord in twentieth century perfumery.", ['hydroxycitronellal','green-note','soap-accord']],
    ['hydroxycitronellal', 'Hydroxycitronellal', "The molecule that built lily of the valley. Soft, green, sweet, slightly melon.", "In everything floral made between 1910 and 1990.", ['muguet','melon']],
    ['narcissus', 'Narcissus', "Hay, leather, green bitterness and something faintly faecal. A difficult, adult flower.", "Narcissus absolute is one of the strangest things in a perfumer's cabinet.", ['hay','indole','leather-accord']],
    ['champaca', 'Champaca', "Magnolia relative: tea, apricot, dry earth and a golden warmth.", "Temple flowers in India, sold in cones of leaf.", ['magnolia','tea-note','apricot']],
    ['osmanthus', 'Osmanthus', "Apricot skin, leather and tea in a tiny orange flower.", "Autumn in Guilin, where the whole city smells of it for two weeks.", ['apricot','tea-note','leather-accord']],
    ['linden', 'Linden blossom', "Honeyed green with a thin, cool, almost aquatic top.", "Lime trees in a European street in June, and a tisane made from the flowers.", ['honey','green-note','nectar']],
    ['jonquil', 'Jonquil', "Narcissus with the earthiness turned up and the hay turned down.", "A small yellow flower with a smell far bigger than itself.", ['narcissus','hay']],
    ['stephanotis', 'Stephanotis', "Clean, waxy, slightly rubbery white flower with a jasmine backbone.", "Wedding bouquets, which is most of what it is grown for.", ['jasmine-sambac','gardenia']],
    ['queen-of-the-night', 'Queen of the night', "Cestrum nocturnum: a green, honeyed, almost overpowering sweetness that only appears after dark.", "A courtyard in Karachi or Cairo at ten at night.", ['jasmine-sambac','honey','indole']],
    ['mimosa', 'Mimosa', "Powdery, honeyed, faintly cucumber-green. Soft rather than loud.", "Yellow pompoms in a French February, and the powdery half of many florals.", ['heliotropin','violet','powdery']],
    ['indole', 'Indole', "The molecule that gives white flowers their animal shadow. Pure, it smells of mothballs and worse.", "In jasmine at around two percent, and in things that have started to decay.", ['indolic','jasmine-grandiflorum','tuberose']],
    ['pollen', 'Pollen', "Dusty, waxy, slightly bitter and faintly animal. What a flower smells like up close rather than across a room.", "Push your nose into a lily and accept the yellow stain.", ['madonna-lily','honey','powdery']]
  ]);

  add('floral', [
    ['rose-damascena', 'Rose damascena', "The Bulgarian and Turkish rose: honeyed, spicy, slightly green, with a wine-like depth.", "Rose water in a sweet shop, and the more serious half of every rose fragrance.", ['rose-centifolia','rose-oxide','geranium']],
    ['rose-centifolia', 'Rose centifolia', "The Grasse rose: softer, greener, more honeyed, less spicy than damascena.", "Rose de Mai, harvested in May, which is the whole reason for its name.", ['rose-damascena','honey','green-note']],
    ['rose-oxide', 'Rose oxide', "The sharp, metallic, almost lychee-like facet that tells your brain rose in one molecule.", "In lychees, in geranium, and in the top of most modern roses.", ['rose-damascena','lychee','geranium']],
    ['violet', 'Violet', "Powdery, sweet, faintly cold. Ionones exhaust your receptors, so violet seems to vanish and return.", "Parma violet sweets, and the reason people say violet smells like it is disappearing.", ['ionone','orris','powdery']],
    ['ionone', 'Ionone', "The violet molecule, also responsible for a great deal of orris, raspberry and woody softness.", "Smell a violet sweet, wait, smell again. The fading is the molecule, not the flower.", ['violet','orris','raspberry']],
    ['orris', 'Orris', "Iris root aged for years then distilled: cold, powdery, carroty, faintly like raw dough.", "The most expensive raw material in common use, and the reason iris fragrances cost money.", ['orris-butter','carrot-seed','powdery']],
    ['peony', 'Peony', "Another reconstruction: rose, green stem and a watery brightness. The real flower gives almost nothing.", "A florist's peony smells faintly of rose and mostly of green water.", ['rose-damascena','green-note','aquatic-accord']],
    ['carnation', 'Carnation', "Clove and pepper wrapped in a flower. Dry, spicy, old-fashioned in the best way.", "Eugenol is doing the work, which is why carnation and clove confuse people.", ['clove','eugenol','spice']],
    ['heliotrope', 'Heliotrope', "Almond, vanilla and cherry pie in a purple flower.", "The plant is literally nicknamed cherry pie in English gardens.", ['heliotropin','marzipan','vanilla']],
    ['heliotropin', 'Heliotropin', "Piperonal: powdery almond-vanilla sweetness. The backbone of powdery florals.", "In cheap face powder and expensive perfume alike.", ['heliotrope','powdery','vanilla']],
    ['hyacinth', 'Hyacinth', "Green, sappy, faintly rubbery floral with a cold metallic edge.", "A forced bulb indoors in January, which is too loud for a small room.", ['galbanum','green-note','narcissus']],
    ['freesia', 'Freesia', "Peppery, clean, faintly citric floral. Another almost pure reconstruction.", "Supermarket bouquets, and a great many shower gels.", ['peony','black-pepper','soap-accord']],
    ['chamomile', 'Chamomile', "Bitter, hay-like, faintly apple. More herb than flower.", "The tea, which smells of dried grass and warm apples.", ['hay','apple','bitter']],
    ['tagetes', 'Tagetes', "Marigold: hot, bitter, fruity green with an almost tropical rot underneath.", "Indian garlands, and one of the strangest oils on a perfumer's shelf.", ['mango','bitter','green-note']],
    ['immortelle', 'Immortelle', "Helichrysum: maple syrup, curry, hay and dried fruit at once.", "Rub the flower on a Corsican hillside. It smells of pancakes and medicine.", ['maple','hay','fenugreek']],
    ['cherry-blossom', 'Cherry blossom', "Faintly almond, faintly green, mostly quiet. Another flower that is more idea than smell.", "Sakura leaves salted for wagashi carry more scent than the petals.", ['marzipan','green-note']],
    ['lotus', 'Lotus', "Watery, green, faintly powdery. Cold rather than sweet.", "A temple pond at dawn, and a great deal of aquatic perfumery.", ['aquatic-accord','peony','green-note']],
    ['wisteria', 'Wisteria', "Grape, honey and green leaf. A soft, drifting smell that never sits still.", "A pergola in May, where the scent arrives only when the air moves.", ['grape','honeysuckle','nectar']],
    ['lilac', 'Lilac', "Green, powdery, faintly bitter almond behind the sweetness.", "A lilac bush in rain, which is when it is most generous.", ['heliotropin','muguet','green-note']],
    ['sweet-pea', 'Sweet pea', "Light, honeyed, faintly green. Charming and completely unserious.", "A cut bunch on a kitchen table, which fades within a day.", ['honeysuckle','muguet']],
    ['elderflower', 'Elderflower', "Muscat grape, cat and green stem. Beautiful and slightly feral.", "Elderflower cordial, and a hedge in June that smells faintly of urine up close.", ['grape','blackcurrant','indolic']],
    ['cyclamen', 'Cyclamen', "Green, watery, faintly melon and hyacinth. Almost entirely a laboratory idea.", "Cyclamen aldehyde is in a very large share of fresh florals.", ['muguet','melon','aquatic-accord']]
  ]);

  add('fruit', [
    ['fig', 'Fig', "Green skin, milky sap and jammy flesh. Three smells wearing one name.", "A ripe fig split open, then the leaf, then your sticky hands.", ['fig-leaf','coconut','green-note']],
    ['peach', 'Peach', "Fuzzy skin, lactonic flesh, faintly coconut. Warm rather than sharp.", "Gamma-undecalactone was one of the first fruit molecules used in perfume, in 1919.", ['apricot','coconut','lactonic']],
    ['apricot', 'Apricot', "Drier and more leathery than peach, with an osmanthus-like tea facet.", "Dried apricots, which smell of leather and honey more than of fruit.", ['peach','osmanthus','leather-accord']],
    ['pear', 'Pear', "Cool, watery, slightly acetone-sharp at the top. Reads clean rather than sweet.", "A ripe pear held under your nose, and nail varnish, which shares a molecule family.", ['green-apple','aquatic-accord']],
    ['green-apple', 'Green apple', "Tart, thin, faintly sour green. The single most dated fruit note in perfumery, and still useful.", "A cut Granny Smith going brown on a plate.", ['pear','quince','green-note']],
    ['quince', 'Quince', "Apple crossed with rose and pineapple, all of it slightly hard and unripe.", "A bowl of quinces in a cold room will scent it for a fortnight.", ['green-apple','rose-damascena','pineapple']],
    ['blackcurrant', 'Blackcurrant', "Sweet, sharp, and unmistakably catty. A sulphur note sits under the jam.", "Cassis, and the leaf, which smells more feral than the berry.", ['cat-note','raspberry','elderflower']],
    ['raspberry', 'Raspberry', "Sweet, faintly violet, faintly woody. Ionones again.", "Fresh raspberries warm from a garden, which smell more floral than red.", ['ionone','violet','strawberry']],
    ['strawberry', 'Strawberry', "Sweet, green-stemmed, faintly caramelised. The real fruit is far quieter than the sweet-shop version.", "A wild strawberry, which smells almost of rose.", ['raspberry','caramel','green-note']],
    ['blackberry', 'Blackberry', "Wine, earth and sun-warmed sugar, with a bramble-leaf bitterness.", "A hedgerow in September, after a hot afternoon.", ['blackcurrant','wine','earth']],
    ['cherry', 'Cherry', "Almond and syrup. The stone matters more to the smell than the flesh.", "Cough syrup, maraschino, and a cherry pie cooling.", ['marzipan','burnt-sugar','plum']],
    ['plum', 'Plum', "Dark, winey, faintly leathery sweetness with a dusty skin.", "A ripe plum with the bloom still on it, and prune in armagnac.", ['cherry','wine','leather-accord']],
    ['banana', 'Banana', "Creamy, faintly solvent, faintly floral. Isoamyl acetate is also pear drops and nail varnish.", "A very ripe banana, and the top of ylang ylang.", ['ylang-ylang','pear','lactonic']],
    ['pineapple', 'Pineapple', "Sharp, sulphurous, tropical, with a faint burnt-rubber edge if you look for it.", "A pineapple cut open, and the top of many amber fragrances.", ['quince','sulphury','mango']],
    ['mango', 'Mango', "Turpentine, peach and hot sugar. Far more resinous than people expect.", "The skin of an alphonso, which is where most of the smell lives.", ['peach','tagetes','resinous']],
    ['lychee', 'Lychee', "Rose and grape with a faint sulphur bite. Almost entirely rose oxide.", "Peel one and smell your fingers. It is the clearest fruit-flower link there is.", ['rose-oxide','grape','rose-damascena']],
    ['grape', 'Grape', "Muscat: floral, faintly foxy, sweeter in the nose than in the mouth.", "A bunch of muscat grapes in a paper bag in the sun.", ['wisteria','wine','elderflower']],
    ['melon', 'Melon', "Watery, green, slightly plastic. Calone territory as much as fruit.", "A honeydew, which smells mostly of cool water and cucumber skin.", ['calone','cucumber','aquatic-accord']],
    ['coconut', 'Coconut', "Milky, waxy, faintly smoky. Lactones with a wooden shell around them.", "Suncream, and a real coconut, which smells far less sweet than the idea of one.", ['lactonic','fig-leaf','vanilla']],
    ['date', 'Date', "Dark, dried, honeyed sugar with a faint leather and tobacco edge.", "A box of medjools, and the base of many Middle Eastern accords.", ['fig','tobacco-leaf','burnt-sugar']],
    ['tamarind', 'Tamarind', "Sour, dark, fermented fruit with a woody, almost dusty edge.", "Tamarind paste, which smells sour and looks like tar.", ['plum','fermented','bitter']],
    ['rhubarb', 'Rhubarb', "Green, sour, faintly rose-like. Sharp enough to read as almost mineral.", "Forced rhubarb snapped in half, which smells of cold and acid.", ['green-apple','rose-oxide','bitter']]
  ]);

  add('spice', [
    ['black-pepper', 'Black pepper', "Dry, woody heat with a bright terpene sparkle on top.", "Grind some. The first second is citrus and pine, the rest is dust and warmth.", ['pink-pepper','sichuan','wood']],
    ['pink-pepper', 'Pink pepper', "Not a true pepper. Rosy, fruity, sparkling, with far less heat.", "Everywhere in perfumery since about 2005, doing the work grapefruit used to do.", ['black-pepper','rose-damascena','grapefruit']],
    ['sichuan', 'Sichuan pepper', "Citrus peel, numbness and a strange floral buzz.", "The tingling is a physical effect on your nerves, not a smell.", ['black-pepper','lemon']],
    ['cardamom', 'Cardamom', "Eucalyptus, lemon and a warm sweetness. Cold and hot in the same breath.", "Crack a green pod. This is the best single spice for learning to name facets.", ['camphoraceous','lemon','ginger']],
    ['cinnamon', 'Cinnamon', "True Ceylon cinnamon is sweet, thin, papery, with a floral top.", "A cinnamon stick you can crumble in your fingers is the real thing.", ['cassia','clove','gourmand']],
    ['cassia', 'Cassia', "What most of the world calls cinnamon: hotter, sweeter, redder, more aggressive.", "The candy version, and the smell of a bakery in December.", ['cinnamon','burnt-sugar']],
    ['clove', 'Clove', "Hot, numbing, faintly medicinal. Eugenol, which is also the dentist's smell.", "One clove held to the nose is more than enough. A superb training material.", ['eugenol','carnation','cinnamon']],
    ['eugenol', 'Eugenol', "The clove molecule, also large in carnation, basil and bay.", "Once you learn it you will find it in a surprising number of florals.", ['clove','carnation']],
    ['nutmeg', 'Nutmeg', "Warm, woody, faintly soapy, slightly narcotic in a way you can almost feel.", "Grate some fresh. The pre-ground powder is a different, duller thing.", ['mace','wood','coriander-seed']],
    ['mace', 'Mace', "The lacy coat around nutmeg. Brighter, more floral, less woody.", "Used in perfumery more often than nutmeg, for exactly that reason.", ['nutmeg','pink-pepper']],
    ['ginger', 'Ginger', "Fresh ginger is citrus, soap and cut wood. Dried ginger is dusty heat.", "Snap a fresh root. The difference between the two forms is a real lesson.", ['cardamom','lemon','wood']],
    ['saffron', 'Saffron', "Leather, hay, iodine and dried fruit. Barely a spice smell at all.", "Steep a few threads in warm milk and smell the surface.", ['leather-accord','hay','oud-accord']],
    ['cumin', 'Cumin', "Hot, sweaty, faintly animal. The most divisive spice in perfumery.", "In small doses it reads as human skin, which is exactly why it is used.", ['sweat-note','animalic','coriander-seed']],
    ['coriander-seed', 'Coriander seed', "Nothing like the leaf: warm, faintly orange, faintly woody, with a soapy sparkle.", "Crush a few seeds in your palm. It is the seed, not the herb.", ['nutmeg','sweet-orange']],
    ['caraway', 'Caraway', "Sharp, bready, faintly medicinal. Rye bread in a single seed.", "Chew one. It is the smell most people call simply European.", ['fresh-bread','fennel-seed']],
    ['star-anise', 'Star anise', "Sweet, licorice-cold, faintly floral. Bigger and rounder than fennel.", "A pot of pho, and the smell that most children call medicine.", ['licorice','fennel-seed','basil']],
    ['fennel-seed', 'Fennel seed', "Aniseed with more green and less sugar.", "Chewed after a meal in Indian restaurants, which is why the association is so fixed.", ['star-anise','licorice','tarragon']],
    ['juniper', 'Juniper', "Pine, gin, resin and a cold blue bitterness.", "Crush a berry. It is one of the few notes that smells exactly like the drink it makes.", ['pine-needle','angelica','resinous']],
    ['allspice', 'Allspice', "Pimento: clove, cinnamon and nutmeg genuinely at once, plus a peppery back.", "Jerk seasoning, and a spice that makes people distrust their own nose.", ['clove','nutmeg','black-pepper']],
    ['turmeric', 'Turmeric', "Dry, earthy, faintly bitter and carroty, with a musty warmth.", "Fresh turmeric root, which smells much greener than the powder.", ['carrot-seed','earth','ginger']],
    ['fenugreek', 'Fenugreek', "Maple syrup and burnt sugar with a bitter, sweaty edge.", "The smell of a curry house from the street, and of immortelle absolute.", ['immortelle','maple','sweat-note']],
    ['bay-leaf', 'Bay leaf', "Eucalyptus, clove and dry leaf. Sharper raw than cooked.", "Snap a dried bay leaf in half and smell the break.", ['eugenol','camphoraceous']]
  ]);

  add('wood', [
    ['sandalwood', 'Sandalwood', "Creamy, milky, faintly sour wood with a long, calm, almost sweet finish.", "Mysore sandalwood is nearly gone. Australian santalum is what you will usually meet.", ['milk-note','musk','wood']],
    ['atlas-cedar', 'Atlas cedar', "Dry, dusty, faintly camphorous. The cedar of North African forests.", "Cedar chests and old wardrobes, and a great deal of masculine perfumery.", ['virginia-cedar','pencil-shavings','camphoraceous']],
    ['virginia-cedar', 'Virginia cedar', "Sharper and more pencil-like than atlas cedar, with a resinous sweetness.", "It is literally what pencils are made from.", ['atlas-cedar','pencil-shavings']],
    ['pencil-shavings', 'Pencil shavings', "Cedar plus graphite plus a faint waxy sweetness. One of the most reliable memory triggers there is.", "Sharpen a pencil over a bin and put your face in it.", ['virginia-cedar','wood']],
    ['vetiver', 'Vetiver', "A root, not a wood: smoky, earthy, grapefruit-bitter, faintly nutty.", "Haitian vetiver is brighter, Javanese is smokier. Compare two if you ever can.", ['earth','grapefruit','smoke']],
    ['patchouli', 'Patchouli', "Damp earth, dark chocolate, camphor and old bookshops.", "The 1970s ruined its reputation. Modern fractions smell almost nothing like that.", ['earth','cocoa','camphoraceous']],
    ['guaiacwood', 'Guaiacwood', "Smoky, rosy, tar-like wood with a sweetness like burnt caramel.", "Used to give cheap woods a smoky top without real birch tar.", ['smoke','rose-damascena','burnt-sugar']],
    ['agarwood', 'Agarwood', "Oud: mouldy, sweet, animal, medicinal, barnyard, and no two pieces alike.", "Real oud is the resin an infected aquilaria tree makes. Most oud in fragrance is a reconstruction.", ['oud-accord','animalic','cellar']],
    ['oud-accord', 'Oud accord', "The synthetic idea of oud: leather, smoke, dried fruit and a medicinal sweetness.", "In almost every fragrance that says oud on the bottle.", ['agarwood','leather-accord','saffron']],
    ['cypress', 'Cypress', "Dry, cold, green wood with a resinous, almost salty edge.", "A Tuscan graveyard, which is the association it cannot escape.", ['pine-needle','juniper','resinous']],
    ['pine-needle', 'Pine needle', "Cold terpenes and green resin. Sharper than the wood, and much more nostalgic.", "Crush a handful of needles. It is Christmas and disinfectant at once.", ['juniper','cypress','camphoraceous']],
    ['hinoki', 'Hinoki', "Japanese cypress: lemon, damp wood and a clean, faintly medicinal calm.", "A hinoki bath, and the wood used in shrines.", ['cypress','lemon','wet-wood']],
    ['cashmeran', 'Cashmeran', "A molecule, not a plant: musky, woody, warm, slightly powdery and slightly pine.", "Everywhere in modern perfumery. It smells like the word cosy.", ['musk','wood','powdery']],
    ['iso-e-super', 'Iso E Super', "Smooth, transparent, velvety wood that many people can barely smell and everyone wears.", "It is the reason a fragrance can seem to radiate without you smelling it yourself.", ['radiant','wood','anosmia']],
    ['sawdust', 'Sawdust', "Dry cellulose and resin. Warm and slightly sweet, with none of the polish of finished wood.", "A carpentry workshop, or a hamster cage, depending on your childhood.", ['pencil-shavings','wood']],
    ['driftwood', 'Driftwood', "Wood with salt and sun in it. Grey, dry, mineral, faintly smoky.", "A beach after the tide, and a favourite word in coastal marketing copy.", ['sea-salt','wood','wet-stone']],
    ['papyrus', 'Papyrus', "Dry, papery, faintly smoky and bitter. Vetiver's thin cousin.", "Used as a modern replacement for oakmoss in a great many chypres.", ['vetiver','oakmoss','paper']],
    ['rosewood', 'Rosewood', "Sweet, floral wood, high in linalool. Warm and rounded rather than dry.", "Now largely replaced by ho wood for good conservation reasons.", ['wood','rose-damascena']],
    ['birchwood', 'Birchwood', "Pale, dry, faintly leathery wood. The tree behind birch tar, without the smoke.", "A birch sauna before the water hits the stones.", ['birch-tar','leather-accord','wood']],
    ['teak', 'Teak', "Oily, dark, faintly resinous wood with a boat-deck warmth.", "Old furniture and ship decks in the sun.", ['wood','driftwood']],
    ['woody-amber', 'Woody amber', "The family of molecules behind most modern base notes: dry, salty, huge, very persistent.", "If a fragrance seems to last three days on your coat, this is usually why.", ['ambroxan','iso-e-super','longevity']],
    ['wet-wood', 'Wet wood', "Wood after rain: cold, faintly mushroomy, greener and softer than dry wood.", "A garden fence in November.", ['hinoki','mushroom','petrichor']]
  ]);

  add('resin', [
    ['frankincense', 'Frankincense', "Olibanum: lemon, pine, dust and cold air. Less sweet than people expect.", "Burn a grain on charcoal. The first minute is citrus, the rest is church.", ['myrrh','incense-smoke','lemon']],
    ['myrrh', 'Myrrh', "Bitter, medicinal, mushroom-sweet resin with a licorice shadow.", "Older and stranger than frankincense, and much less popular.", ['frankincense','mushroom','bitter']],
    ['opoponax', 'Opoponax', "Sweet myrrh: warm, balsamic, faintly celery-like, with a honeyed base.", "The soft, sweet resin in old orientals.", ['myrrh','benzoin','balsamic']],
    ['labdanum', 'Labdanum', "Cistus resin: leather, honey, tobacco and dried fruit. The backbone of amber.", "Combed off the fur of goats that walked through the bushes, historically.", ['amber-accord','leather-accord','honey']],
    ['benzoin', 'Benzoin', "Sweet, vanillic, balsamic resin with a faint cinnamon warmth.", "The other half of amber, and the reason amber smells edible.", ['vanilla','amber-accord','balsamic']],
    ['styrax', 'Styrax', "Sweet resin with a smoky, plastic, almost petrol edge.", "Used to make leather accords smell tanned rather than clean.", ['leather-accord','birch-tar','balsamic']],
    ['elemi', 'Elemi', "Lemon, pepper and pine in a soft resin. The freshest thing on the resin bench.", "A good bridge between citrus tops and incense hearts.", ['frankincense','lemon','black-pepper']],
    ['tolu-balsam', 'Tolu balsam', "Warm, sweet, cinnamon and vanilla with a faint smoky depth.", "Old cough syrups and old-fashioned sweets.", ['benzoin','peru-balsam','vanilla']],
    ['peru-balsam', 'Peru balsam', "Richer and more animalic than tolu: vanilla, cinnamon and a hint of leather.", "In pharmacy ointments as often as in perfume.", ['tolu-balsam','vanilla','leather-accord']],
    ['fir-balsam', 'Fir balsam', "Pine resin with a jammy, faintly cooked sweetness.", "A Christmas tree bleeding sap where a branch broke.", ['pine-needle','resinous','pine-pitch']],
    ['mastic', 'Mastic', "Chios resin: pine, lemon and a chewy sweetness. Cold and clean.", "Greek chewing gum and mastiha liqueur.", ['frankincense','pine-needle']],
    ['copal', 'Copal', "Young amber resin, burned across Central America. Bright, piney, sweet smoke.", "A Mexican market, or a church where copal replaces frankincense.", ['frankincense','incense-smoke']],
    ['amber-accord', 'Amber accord', "Not a raw material: labdanum plus benzoin plus vanilla. A recipe, invented in the 1880s.", "Nothing called amber in perfumery is fossilised tree resin. That is a different thing entirely.", ['labdanum','benzoin','vanilla']],
    ['pine-pitch', 'Pine pitch', "Sticky, hot, sharp resin. Tar before it becomes tar.", "A pine trunk in strong sun, and a violin bow being rosined.", ['fir-balsam','tar','resinous']],
    ['propolis', 'Propolis', "Bee glue: resin, honey, wax and a faint medicinal bitterness.", "A beekeeper's hands, and the inside of a hive.", ['beeswax','honey','resinous']],
    ['beeswax', 'Beeswax', "Honeyed, hay-like, faintly animal wax. Softer and dustier than honey itself.", "A church full of candles, and the smell of a wax polish tin.", ['honey','hay','propolis']],
    ['shellac', 'Shellac', "Alcohol, resin and a faint sweetness. The smell of furniture being finished.", "A French-polished table, and old records.", ['resinous','solvent']],
    ['sandarac', 'Sandarac', "A pale, brittle resin: dry, faintly bitter, faintly pine.", "Used historically in varnish more than in perfume.", ['mastic','resinous']],
    ['colophony', 'Colophony', "Rosin: what is left after turpentine is distilled off pine resin. Dry, hot, slightly sour.", "The block a violinist drags a bow across.", ['pine-pitch','resinous']],
    ['gurjun-balsam', 'Gurjun balsam', "Dark, peppery, faintly camphorous balsam with a woody bite.", "Used to build smoky woody bases cheaply and well.", ['balsamic','wood','black-pepper']],
    ['galbanum-resin', 'Galbanum resin', "The raw gum before it becomes the green note: bitter, waxy, difficult.", "A perfumer's cabinet, where it sits in a jar nobody opens casually.", ['galbanum','resinous','bitter']],
    ['incense-blend', 'Church incense', "Frankincense plus benzoin plus charcoal smoke. A blend, not a material.", "An Orthodox church, and the most reliable religious memory trigger in the world.", ['frankincense','incense-smoke','ash']]
  ]);

  add('animal', [
    ['civet', 'Civet', "Faecal, hot and unbearable neat. At a thousandth of a percent it makes flowers smell alive.", "Now almost entirely synthetic, for reasons that do not need explaining.", ['civetone','indole','animalic']],
    ['civetone', 'Civetone', "The synthetic civet molecule. Warm, musky, faintly fatty, far kinder than the original.", "In many vintage-style florals, doing the job cruelty used to do.", ['civet','muscone','musk']],
    ['castoreum', 'Castoreum', "Beaver: leather, birch tar, hay and something like warm animal skin.", "The leather note in a great many masculine classics.", ['leather-accord','birch-tar','hay']],
    ['ambergris', 'Ambergris', "Whale intestinal secretion aged for years at sea. Salty, sweet, mineral, animal, and unlike anything else.", "Found on beaches, never taken from an animal. Modern perfumery uses ambroxan instead.", ['ambroxan','sea-salt','musk']],
    ['hyraceum', 'Hyraceum', "Fossilised rock hyrax urine. Animalic, tobacco-like, faintly fruity.", "Collected from cliff middens centuries old. No animal is harmed.", ['castoreum','tobacco-leaf','animalic']],
    ['deer-musk', 'Deer musk', "The original musk, from the gland of the male musk deer. Warm, sweet, powdery, faintly urinous.", "Banned in practice. Every musk you have smelled since 1979 is something else.", ['muscone','musk','powdery']],
    ['muscone', 'Muscone', "The molecule that makes deer musk smell like musk. Now made in a laboratory.", "Warm, sweet, skin-like, and one of the more expensive musks in use.", ['deer-musk','white-musk','skin-musk']],
    ['leather-accord', 'Leather', "Not one smell: birch tar, castoreum, styrax, isobutyl quinoline and smoke, blended to taste.", "A new leather jacket is mostly tanning chemicals. A saddle is mostly wax and animal.", ['birch-tar','suede','castoreum']],
    ['suede', 'Suede', "Soft, powdery, faintly sweet leather with the tar removed.", "The inside of a glove, and a very fashionable note since about 2010.", ['leather-accord','powdery','musk']],
    ['honey', 'Honey', "Sweet, waxy, floral and, past a certain concentration, distinctly urinous.", "Warm honey in a jar, and the reason honey notes divide people so sharply.", ['beeswax','animalic','nectar']],
    ['costus', 'Costus', "Wet hair, wet dog, coconut and violet. Genuinely strange, and restricted for allergy reasons.", "The smell people mean when they say a fragrance smells like scalp.", ['animalic','hair-note','violet']],
    ['para-cresol', 'Para-cresol', "Horse, ink, tar and jasmine, depending on the dose.", "In real jasmine absolute, and in stables.", ['indole','horsehair','tar']],
    ['skin-scent', 'Skin scent', "Not one note but an effect: musk, ambrette and a little sweat, sitting close to the body.", "The category of fragrance people describe as smelling like you, but better.", ['skin-musk','ambrette-seed','sillage']],
    ['lanolin', 'Lanolin', "Wool grease: soft, fatty, faintly sheepy, faintly sweet.", "Raw wool, hand cream, and the inside of a sheepskin.", ['wool','beeswax','animalic']],
    ['wool', 'Wool', "Dry, dusty, faintly animal fibre with lanolin underneath.", "A damp jumper on a radiator.", ['lanolin','dust','animalic']],
    ['horsehair', 'Horsehair', "Warm, dusty, faintly sweet animal with hay and leather around it.", "A stable in summer, which almost nobody dislikes.", ['hay','leather-accord','para-cresol']],
    ['fur-note', 'Fur', "Warm dust, skin and a faint powdery sweetness. More cupboard than animal.", "An old coat taken out in October.", ['dust','musk','animalic']],
    ['goaty', 'Goaty', "Sharp, sour, hircine. A specific fatty acid your nose is very good at finding.", "Goat cheese, and labdanum before it is cleaned up.", ['sweat-note','fermented','labdanum']],
    ['sweat-note', 'Sweat', "Cumin, sour milk and salt. Repellent in isolation, human and warm in a formula.", "Cumin is the usual way perfumers put a body into a bottle.", ['cumin','goaty','skin-scent']],
    ['hide', 'Hide', "Raw animal skin before tanning: sweet, thick, faintly bloody.", "A tannery, which you can smell from several streets away.", ['leather-accord','blood-note']],
    ['blood-note', 'Blood', "Metallic, salty, faintly sweet. Iron doing something odd to the fat on your skin.", "Handling old coins, and the smell of a butcher's counter.", ['rust','sea-salt','flint']],
    ['animalic', 'Animalic', "The word for anything that smells of a body: skin, fur, sweat, urine, hide.", "The dividing line between a pretty fragrance and an interesting one.", ['indolic','civet','skin-scent']]
  ]);

  add('musk', [
    ['white-musk', 'White musk', "The clean, laundered, slightly sweet musk that dominates modern perfumery.", "Fabric softener, most body sprays, and a great deal of shampoo.", ['galaxolide','laundry-musk','soap-accord']],
    ['galaxolide', 'Galaxolide', "The single most produced musk molecule in the world. Sweet, clean, powdery, faintly woody.", "It is in the water supply of most cities, which is a sobering fact about laundry.", ['white-musk','laundry-musk']],
    ['habanolide', 'Habanolide', "A macrocyclic musk: metallic, airy, slightly fatty, very transparent.", "The reason many modern fragrances smell like clean skin and cold air.", ['white-musk','skin-musk']],
    ['ethylene-brassylate', 'Ethylene brassylate', "Soft, sweet, faintly powdery musk with a hint of amber.", "Cheap, kind, and in an enormous number of soaps.", ['white-musk','powdery']],
    ['ambrette-seed', 'Ambrette seed', "A plant musk from hibiscus seeds: warm, nutty, faintly boozy, with a pear top.", "The only natural musk still in real use, and one of the loveliest.", ['musk','pear','skin-scent']],
    ['ambroxan', 'Ambroxan', "The ambergris molecule, made from clary sage. Salty, mineral, dry, enormous.", "Behind nearly every fragrance described as smelling like skin since 2010.", ['ambergris','woody-amber','skin-musk']],
    ['nitro-musk', 'Nitro musk', "The first synthetic musks, from the 1880s. Sweet, powdery, slightly almond, now mostly banned.", "The reason vintage perfume smells vintage.", ['musk','powdery','reformulation']],
    ['musk-anosmia', 'Musk anosmia', "Many people cannot smell one specific musk molecule at all, and can smell the others fine.", "It is why one person calls a fragrance loud and another calls it empty.", ['anosmia','white-musk','skin-chemistry']],
    ['skin-musk', 'Skin musk', "Musk tuned warm and low so it reads as body rather than laundry.", "The close, quiet half of the family.", ['muscone','ambrette-seed','skin-scent']],
    ['laundry-musk', 'Laundry musk', "Clean cotton, warm air and a chemical sweetness. Comforting and entirely artificial.", "A tumble dryer vent on a cold street.", ['galaxolide','cotton-accord','white-musk']],
    ['cotton-accord', 'Cotton', "Dry, papery, faintly sweet. Cotton has almost no smell, so this is pure invention.", "A folded sheet, or the idea of one.", ['laundry-musk','starch','powdery']],
    ['starch', 'Starch', "Hot cotton and cooked wheat. Dry, faintly sweet, slightly dusty.", "Ironing a shirt, which is one of the most specific smells in a house.", ['cotton-accord','fresh-bread']],
    ['soap-accord', 'Soap', "Aldehydes, musk and floral fatty acids. What perfume smells like when it smells clean.", "A bar of soap in a drawer, and the reason muguet exists in commerce.", ['aldehydic','muguet','white-musk']],
    ['talc-accord', 'Talc', "Iris, heliotropin and musk. Powder as a smell rather than a texture.", "A tin of baby powder, which is nearly pure nostalgia.", ['orris','heliotropin','powdery']],
    ['rice-powder', 'Rice powder', "Dry, faintly sweet, faintly cereal. Softer and less floral than talc.", "Old face powder in a compact.", ['talc-accord','powdery','starch']],
    ['orris-butter', 'Orris butter', "The concrete extracted from aged iris rhizomes. Cold, powdery, faintly like raw pastry.", "Three years of ageing per batch, which is why it costs more than gold by weight.", ['orris','powdery','carrot-seed']],
    ['aldehyde-c11', 'Aldehyde C11', "Waxy, green, slightly metallic. One of the sparkling molecules in the aldehydic style.", "Undecylenic, in Chanel No 5 and its many descendants.", ['aldehydic','aldehyde-c12','soap-accord']],
    ['aldehyde-c12', 'Aldehyde C12', "Soapy, citrus-waxy, with a candle-like sweetness.", "Lauric aldehyde, and a large part of what people call the vintage smell.", ['aldehydic','aldehyde-c11','soap-accord']],
    ['powdery', 'Powdery', "Not a note but a texture: iris, heliotropin, musk and vanilla read as soft dust.", "Face powder, old handbags, and your grandmother's dressing table.", ['talc-accord','orris','heliotropin']],
    ['milk-note', 'Milk', "Lactones and a faint sourness. Warm, soft, faintly animal.", "Warm milk in a pan, and the reason sandalwood is called creamy.", ['lactonic','sandalwood','coconut']],
    ['lactonic', 'Lactonic', "The word for creamy, milky, peachy roundness. Lactones are a whole molecular family.", "Peach, coconut, milk and butter all owe their softness to them.", ['peach','coconut','milk-note']],
    ['dust', 'Dust', "Warm paper, mineral and a faint sweetness. The smell of a room nobody has opened.", "Sunlight on a shelf, or a radiator coming on in October.", ['paper','chalk','fur-note']]
  ]);

  add('gourmand', [
    ['vanilla', 'Vanilla', "A cured orchid pod: sweet, boozy, faintly smoky, faintly leathery. Far more complex than vanillin.", "Split a real pod. The rum and tobacco underneath is the part people never expect.", ['vanillin','benzoin','rum']],
    ['vanillin', 'Vanillin', "The single molecule most people mean by vanilla. Sweeter, flatter, more like sugar.", "Ice cream, cheap candles, and the first synthetic to change perfumery, in 1874.", ['vanilla','burnt-sugar','powdery']],
    ['tonka-bean', 'Tonka bean', "Almond, hay, tobacco and vanilla in one seed. Coumarin does most of it.", "Grate a bean. It is the smell of a fougere base laid bare.", ['coumarin','hay','marzipan']],
    ['coumarin', 'Coumarin', "The hay molecule. Sweet, dry, faintly almond, and the founding synthetic of the fougere family.", "New-mown grass drying, and the base of Jicky in 1889.", ['tonka-bean','hay','fougere']],
    ['caramel', 'Caramel', "Cooked sugar: buttery, faintly burnt, faintly milky.", "Sugar in a pan, at the exact moment before it goes too far.", ['burnt-sugar','butter','maple']],
    ['burnt-sugar', 'Burnt sugar', "Caramel taken past pleasure: bitter, smoky, almost tarry.", "The bottom of a creme brulee, and the edge of a bakery tray.", ['caramel','smoke','bitter']],
    ['ethyl-maltol', 'Ethyl maltol', "Candyfloss in a molecule. Sweet, pink, fluffy, and impossible to un-smell once you know it.", "It launched the entire modern gourmand genre in 1992.", ['caramel','gourmand-word','burnt-sugar']],
    ['cocoa', 'Cocoa', "Bitter, dusty, faintly earthy and faintly sour. Nothing like a chocolate bar.", "Open a tin of cocoa powder. The bitterness is most of it.", ['coffee','patchouli','bitter']],
    ['coffee', 'Coffee', "Roasted, sour, smoky, faintly rubbery. Ground beans and brewed coffee are two different smells.", "The best training material there is, because you already know it perfectly.", ['cocoa','smoke','roasted-almond']],
    ['roasted-almond', 'Roasted almond', "Warm, oily, slightly bitter nut with a marzipan sweetness.", "A hot nut stand in a European city in winter.", ['marzipan','burnt-sugar','praline']],
    ['praline', 'Praline', "Almond, caramelised sugar and butter. Very sweet, very specific.", "Nougat, and a whole shelf of gourmand fragrances.", ['roasted-almond','caramel','butter']],
    ['marzipan', 'Marzipan', "Almond and sugar with a faint cherry-stone bitterness.", "Benzaldehyde, which is also in cherry, and in the smell of a nail bar.", ['cherry','roasted-almond','heliotrope']],
    ['butter', 'Butter', "Fatty, milky, faintly cheesy sweetness. Diacetyl, which is also in popcorn.", "A pan of butter just melted, before it browns.", ['milk-note','lactonic','caramel']],
    ['fresh-bread', 'Fresh bread', "Yeast, toasted crust and warm starch. One of the most trusted smells in the world.", "A bakery at six in the morning, which estate agents have been exploiting for decades.", ['brioche','starch','malt']],
    ['brioche', 'Brioche', "Bread with butter and egg in it: rounder, sweeter, faintly custardy.", "A French bakery, and a surprisingly popular perfume note.", ['fresh-bread','butter','vanilla']],
    ['malt', 'Malt', "Toasted cereal, faintly sweet, faintly beery.", "Malted milk, a brewery, and the inside of a cereal box.", ['fresh-bread','whisky','burnt-sugar']],
    ['rum', 'Rum', "Sugar, fruit, wood and alcohol. Warm and slightly rough.", "Dark rum in a glass, and the boozy shadow inside real vanilla.", ['vanilla','whisky','date']],
    ['whisky', 'Whisky', "Grain, oak, vanilla and, in the peated ones, smoke and iodine.", "A single malt is a lesson in how many notes one liquid can hold.", ['malt','oak-cask','smoke']],
    ['oak-cask', 'Oak cask', "Toasted wood, vanilla and tannin. What barrel ageing puts into a drink.", "Inside an empty barrel, which smells almost sweet.", ['whisky','wood','vanillin']],
    ['licorice', 'Licorice', "Sweet, dark, faintly salty and medicinal. Anethole plus something almost tarry.", "Real licorice root, which you can chew, and salty Dutch drop.", ['star-anise','fennel-seed','tar']],
    ['maple', 'Maple', "Burnt sugar with a curry-like edge. Sotolon, which is also in fenugreek.", "Maple syrup, and the reason immortelle confuses everyone.", ['fenugreek','immortelle','burnt-sugar']],
    ['nectar', 'Nectar', "Thin, watery sweetness with a green edge. Flower sugar rather than kitchen sugar.", "Pull the base off a honeysuckle flower and taste it, as every child does.", ['honey','honeysuckle','linden']]
  ]);

  add('earth', [
    ['oakmoss', 'Oakmoss', "Damp forest floor, ink, leather and a bitter green shadow. The soul of the chypre.", "Now heavily restricted for allergy reasons, which changed hundreds of fragrances.", ['chypre','treemoss','reformulation']],
    ['treemoss', 'Treemoss', "Oakmoss's darker, more tarry relative. Smokier, less green.", "Used alongside oakmoss until both were restricted.", ['oakmoss','tar','earth']],
    ['geosmin', 'Geosmin', "The molecule of wet soil. Humans detect it at five parts per trillion, better than sharks smell blood.", "Beetroot, tap water in some cities, and the ground after rain.", ['petrichor','wet-soil','beetroot']],
    ['petrichor', 'Petrichor', "The smell of rain on dry ground: geosmin, plant oils released from stone, and ozone before the storm.", "The word was coined in 1964 by two Australian scientists. It means the blood of stones.", ['geosmin','wet-stone','ozone']],
    ['wet-soil', 'Wet soil', "Cold, mineral, faintly sweet and faintly rotten. Bacteria doing their work.", "A handful of garden earth in spring.", ['geosmin','mushroom','loam']],
    ['loam', 'Loam', "Rich, dark, crumbly earth with more sweetness and less mineral than clay.", "A greenhouse potting bench.", ['wet-soil','peat','mushroom']],
    ['mushroom', 'Mushroom', "Damp, faintly milky, faintly metallic. Octenol, which is also what mosquitoes track you by.", "A punnet of chestnut mushrooms opened in a warm kitchen.", ['truffle','wet-soil','gardenia']],
    ['truffle', 'Truffle', "Garlic, gas, earth and something faintly sexual. Genuinely difficult to describe and impossible to forget.", "Shaved over pasta, which is when most people meet it.", ['mushroom','sulphury','animalic']],
    ['beetroot', 'Beetroot', "Sweet earth. Almost pure geosmin with sugar behind it.", "A raw beetroot cut in half.", ['geosmin','wet-soil']],
    ['carrot-seed', 'Carrot seed', "Earthy, faintly sweet, powdery and iris-adjacent.", "The bridge between the soil and the orris in many fragrances.", ['orris','earth','turmeric']],
    ['flint', 'Flint', "Struck stone: cold, sharp, faintly sulphurous and gunpowdery.", "Two pebbles knocked together hard, and a glass of Chablis.", ['gunpowder','wet-stone','sulphury']],
    ['wet-stone', 'Wet stone', "Cold, mineral, slightly metallic. The smell of a well or a cave mouth.", "A slate roof in rain.", ['flint','slate','petrichor']],
    ['wet-concrete', 'Wet concrete', "Lime, dust and cold water. Sharper and more alkaline than wet stone.", "A pavement in the first minute of summer rain.", ['chalk','petrichor','dust']],
    ['slate', 'Slate', "Dry, grey, faintly metallic mineral. Even quieter than flint.", "A school blackboard, and a Loire white wine.", ['wet-stone','chalk']],
    ['clay', 'Clay', "Damp, dense, faintly sweet mineral. Softer and heavier than soil.", "A pottery studio, or a riverbank.", ['wet-soil','chalk','dust']],
    ['chalk', 'Chalk', "Dry, mineral, faintly powdery and slightly sweet.", "Blackboard chalk in a wooden tray, and the inside of an old classroom.", ['slate','dust','powdery']],
    ['rust', 'Rust', "Iron and damp. Metallic, faintly bloody, faintly sweet.", "An old gate, or a nail left in the rain.", ['blood-note','wet-stone']],
    ['cellar', 'Cellar', "Cold stone, damp wood, mould and old wine. Not unpleasant, entirely specific.", "The stairs down to any basement in an old building.", ['mushroom','wet-stone','wet-wood']],
    ['peat', 'Peat', "Wet, smoky, iodine-tinged earth. Bog turned into fuel.", "Islay whisky, and a turf fire in Ireland.", ['smoke','loam','whisky']],
    ['paper', 'Paper', "Cellulose, sizing and old glue, going faintly vanillic as it ages.", "An old book: the vanilla is lignin breaking down, which is why old paper smells sweet.", ['dust','vanillin','shellac']],
    ['ink', 'Ink', "Iron, tannin and solvent. Sharp, cold and faintly bitter.", "A fountain pen, or a freshly printed newspaper.", ['rust','paper','solvent']],
    ['salt-earth', 'Dry dust', "Hot mineral dust with no moisture in it at all. The opposite of petrichor.", "A dirt road in August, an hour before the rain arrives.", ['dust','chalk','petrichor']]
  ]);

  add('marine', [
    ['calone', 'Calone', "The melon-marine molecule that defined the 1990s. Watery, faintly plastic, faintly cucumber.", "Every aquatic fragrance from 1990 to 2005 leans on it.", ['aquatic-accord','melon','ozone']],
    ['helional', 'Helional', "Airy, green, faintly floral. The smell of clean air rather than of water.", "Used to make a fragrance feel like a window has been opened.", ['ozone','aquatic-accord','muguet']],
    ['dihydromyrcenol', 'Dihydromyrcenol', "Citrus, lavender and soap in one aggressive molecule.", "It is most of what a blue bottle from a supermarket smells like.", ['soap-accord','lime','aquatic-accord']],
    ['aquatic-accord', 'Aquatic', "Water has no smell. Every aquatic note is an invention: melon, ozone and cold air standing in for it.", "Worth knowing, because it explains why they all smell like each other.", ['calone','ozone','melon']],
    ['sea-salt', 'Sea salt', "Mineral, faintly metallic, faintly sweet. Salt itself is odourless, so this is skin and air.", "Dried salt on your forearm after a swim.", ['brine','ambergris','skin-scent']],
    ['brine', 'Brine', "Salt plus something alive: seaweed, shellfish, wet rope.", "A working harbour at low tide.", ['kelp','oyster-shell','sea-salt']],
    ['kelp', 'Kelp', "Iodine, salt and green rot. Heavier and more organic than sea air.", "A beach after a storm, where the weed is piled up.", ['algae','brine','iodine']],
    ['algae', 'Algae', "Green, sulphurous, faintly sweet pond water.", "A garden pond in July.", ['kelp','sulphury','wet-soil']],
    ['oyster-shell', 'Oyster shell', "Cold mineral, salt and a faint metallic sweetness.", "An empty shell rinsed and dried, which keeps the smell for days.", ['sea-salt','flint','blood-note']],
    ['sea-fennel', 'Sea fennel', "Samphire: green, salty, faintly aniseed and carroty.", "Growing on a cliff, or blanched next to fish.", ['fennel-seed','brine','green-note']],
    ['ozone', 'Ozone', "The metallic sharpness before a storm and around old photocopiers. Genuinely a different molecule of oxygen.", "Stand outside as a thunderstorm arrives.", ['storm-air','petrichor','helional']],
    ['rain-note', 'Rain', "Cold water on warm surfaces: petrichor, ozone and whatever the ground is made of.", "Rain on a hot pavement, which is a different smell to rain on soil.", ['petrichor','ozone','wet-concrete']],
    ['storm-air', 'Storm air', "Ozone, dust lifted by wind and a sudden drop in temperature.", "The ten minutes before it breaks.", ['ozone','rain-note','dust']],
    ['cold-air', 'Cold air', "Not a smell so much as the absence of one, plus a mineral sharpness in your sinuses.", "Stepping outside at minus five. Cold air holds fewer molecules, so the world goes quiet.", ['snow-note','ozone','flint']],
    ['snow-note', 'Snow', "Cold, mineral, faintly metallic, faintly sweet. Mostly your own nose reacting to the cold.", "A morning after heavy snowfall, which everyone insists has a smell.", ['cold-air','wet-stone']],
    ['fog', 'Fog', "Damp air carrying whatever the town is made of: smoke, salt, soil.", "A November morning near water.", ['smoke','wet-stone','rain-note']],
    ['sea-spray', 'Sea spray', "Salt, iodine and cold wind. Sharper and cleaner than harbour brine.", "Standing at the front of a boat.", ['sea-salt','ozone','kelp']],
    ['wet-rope', 'Wet rope', "Hemp, salt, tar and damp fibre.", "A mooring line, and one of the most specific harbour smells there is.", ['tar','brine','hemp']],
    ['sand', 'Sand', "Hot mineral dust with salt and sunscreen in it.", "A beach at two in the afternoon.", ['dust','sea-salt','coconut']],
    ['chlorine', 'Chlorine', "Sharp, sweet, chemical. Not actually chlorine but chloramines, made by chlorine meeting skin.", "A public swimming pool, which is one of the strongest childhood triggers there is.", ['solvent','ozone']],
    ['iodine', 'Iodine', "Medicinal, metallic, salty. Halfway between a hospital and the sea.", "Antiseptic on a scraped knee, and an oyster.", ['kelp','oyster-shell','medicinal']],
    ['hemp', 'Hemp rope', "Dry, dusty vegetable fibre with a faint sweetness.", "A ball of garden twine.", ['wet-rope','hay','dust']]
  ]);

  add('smoke', [
    ['birch-tar', 'Birch tar', "Charred wood, leather and creosote. The original leather note, and still the best.", "Russian leather was made by soaking hides in it. Now heavily restricted.", ['leather-accord','cade','creosote']],
    ['cade', 'Cade', "Juniper tar: smoky, medicinal, faintly rubbery.", "Old shampoos for scalp conditions, and campfire in a bottle.", ['birch-tar','juniper','smoke']],
    ['guaiacol', 'Guaiacol', "The molecule of smoked food and of medicinal smoke. Sweet, phenolic, unmistakable.", "Smoked bacon, lapsang tea and old cough medicine.", ['smoke','lapsang','creosote']],
    ['creosote', 'Creosote', "Tar for preserving wood: sharp, sweet, chemical, deeply nostalgic for anyone who had a wooden fence.", "A railway sleeper or a telegraph pole in hot sun.", ['tar','birch-tar','asphalt']],
    ['tar', 'Tar', "Burnt, sticky, sweet and bitter at once. Halfway between smoke and petrol.", "A road being resurfaced.", ['asphalt','creosote','licorice']],
    ['asphalt', 'Asphalt', "Hot tar, dust and mineral. The smell of a city in a heatwave.", "A car park at four in the afternoon in August.", ['tar','dust','petrol']],
    ['petrol', 'Petrol', "Sweet, volatile, faintly floral solvent. Widely and slightly guiltily loved.", "A filling station, which almost everyone admits to enjoying.", ['solvent','asphalt']],
    ['solvent', 'Solvent', "Sharp, sweet, head-filling volatility. Acetone, white spirit and glue live here.", "A nail bar, or a can of lighter fluid.", ['petrol','shellac','chlorine']],
    ['tobacco-leaf', 'Tobacco leaf', "Dry, hay-like, faintly sweet and faintly sour. Unlit and unburnt.", "Open a fresh pouch. It is much closer to hay than to smoke.", ['hay','pipe-tobacco','date']],
    ['pipe-tobacco', 'Pipe tobacco', "Tobacco cured with honey, rum and vanilla. Sweet, thick and warm.", "A tobacconist, which is one of the great remaining smell-shops.", ['tobacco-leaf','rum','honey']],
    ['cigar-box', 'Cigar box', "Cedar, tobacco and a faint sweetness. Wood more than smoke.", "The inside of an empty humidor.", ['virginia-cedar','tobacco-leaf','wood']],
    ['ash', 'Ash', "Dry, mineral, slightly bitter. What is left when the smoke has gone.", "A cold fireplace in the morning.", ['charcoal','dust','smoke']],
    ['campfire', 'Campfire', "Burning wood, resin and a little smoke in your hair for a day afterwards.", "Any fire outdoors, and the reason smoke notes sell so well.", ['smoke','charcoal','fir-balsam']],
    ['charcoal', 'Charcoal', "Dry, dusty, mineral carbon. Almost more texture than smell.", "A barbecue before it is lit.", ['ash','smoke']],
    ['lapsang', 'Lapsang souchong', "Tea smoked over pine. Sweet, tarry, faintly bacon-like.", "The most divisive thing on a tea shelf.", ['guaiacol','smoke','tea-note']],
    ['gunpowder', 'Gunpowder', "Sulphur, saltpetre and hot metal. Sharp, mineral, faintly sweet.", "Fireworks, and a struck match multiplied.", ['matchstick','flint','sulphury']],
    ['matchstick', 'Matchstick', "Sulphur, phosphorus and burnt wood in one second.", "Strike one and hold it. It is the fastest smell lesson available.", ['gunpowder','sulphury','smoke']],
    ['burnt-rubber', 'Burnt rubber', "Sulphur, tar and heat. Present in trace amounts in tuberose and pineapple.", "A tyre workshop, and a note perfumers use deliberately.", ['sulphury','tuberose','tar']],
    ['palo-santo', 'Palo santo', "Sweet, resinous, milky smoke with a citrus top.", "A stick smouldering, which smells more of sugar than of wood.", ['incense-smoke','frankincense','wood']],
    ['incense-smoke', 'Incense smoke', "Resin meeting charcoal: sweet, dusty, faintly bitter, entirely loaded with memory.", "A church, a temple, or a bedroom in 1997.", ['frankincense','incense-blend','ash']],
    ['smoke', 'Smoke', "The family word: burnt cellulose, phenols and particles. Your nose is exceptionally good at it.", "Every human being alive is descended from people who noticed smoke quickly.", ['campfire','guaiacol','ash']],
    ['candle-snuff', 'Candle snuff', "Hot wax, burnt cotton wick and a thread of smoke.", "The last thing you smell in a room before bed.", ['beeswax','smoke','ash']]
  ]);

  add('craft', [
    ['sillage', 'Sillage', "The trail a fragrance leaves behind you. From the French for the wake of a boat.", "Measured here on four steps: intimate, arm's length, room, and announcement.", ['projection','longevity','radiant']],
    ['projection', 'Projection', "How far the scent throws right now, as opposed to the trail it leaves over time.", "Projection is a snapshot. Sillage is the record of where you have been.", ['sillage','radiant']],
    ['drydown', 'Drydown', "What is left after several hours, when the volatile things have gone and the base is alone.", "The part you actually live with. Judge a fragrance here, not in the shop.", ['base-notes','longevity','fixative']],
    ['top-notes', 'Top notes', "The first ten to twenty minutes: citrus, aldehydes, light herbs. The most volatile molecules.", "They are the introduction, and they are not the fragrance.", ['heart-notes','bergamot','aldehydic']],
    ['heart-notes', 'Heart notes', "The middle hours, usually floral or spicy. The part with the personality.", "Also called the middle. Where most of the money goes.", ['top-notes','base-notes']],
    ['base-notes', 'Base notes', "Woods, resins, musks and vanillas. Heavy molecules that evaporate slowly and hold the rest up.", "They are why a fragrance can still be there in the morning.", ['drydown','fixative','woody-amber']],
    ['accord', 'Accord', "Several materials blended until they read as one new smell. Amber and leather are accords, not ingredients.", "The chord, not the note. It is the actual unit of perfumery.", ['amber-accord','leather-accord','soliflore']],
    ['fixative', 'Fixative', "A heavy material that slows the evaporation of lighter ones and holds a composition together.", "Musks, resins and woody ambers do most of this work.", ['base-notes','longevity','woody-amber']],
    ['longevity', 'Longevity', "How long it lasts on skin. Skin, weather and your own nose all change the answer.", "Sillage measures it from your wear log rather than from a guess, when you have logged enough wears.", ['drydown','fixative','skin-chemistry']],
    ['concentration', 'Concentration', "Eau de cologne, eau de toilette, eau de parfum, extrait: roughly increasing oil in the alcohol.", "It changes the balance as much as the strength. An eau de toilette is often a different composition.", ['longevity','maceration']],
    ['indolic', 'Indolic', "The animal shadow inside white flowers: overripe, faintly faecal, faintly narcotic.", "Jasmine has it, tuberose has it, and it is why some people cannot wear either.", ['indole','jasmine-grandiflorum','animalic']],
    ['camphoraceous', 'Camphoraceous', "Cold, medicinal, head-clearing. Camphor, eucalyptus, rosemary and the top of tuberose.", "It reads as cold even though nothing is cold. A good word to own early.", ['rosemary','tuberose','medicinal']],
    ['aldehydic', 'Aldehydic', "Waxy, soapy, metallic sparkle. The style Chanel No 5 made famous in 1921.", "It smells like a very clean candle, or a very expensive shirt.", ['aldehyde-c11','aldehyde-c12','soap-accord']],
    ['chypre', 'Chypre', "A structure, not a note: citrus over floral over oakmoss, labdanum and patchouli.", "Named after Cyprus. Restricted oakmoss has made real ones rare.", ['oakmoss','labdanum','bergamot']],
    ['fougere', 'Fougere', "Lavender, coumarin and oakmoss. Invented in 1882, and the shape of nearly every masculine fragrance since.", "Fougere means fern. Ferns have no smell, which tells you how invented it is.", ['lavender','coumarin','oakmoss']],
    ['amber-family', 'Amber', "The family formerly called oriental: resins, vanilla, spice and warmth.", "Confusingly, also the name of one accord inside it.", ['amber-accord','benzoin','vanilla']],
    ['gourmand-word', 'Gourmand', "Fragrance that smells edible. Born in 1992, and now a third of the market.", "The test is whether it makes you hungry rather than whether it smells sweet.", ['ethyl-maltol','vanilla','caramel']],
    ['soliflore', 'Soliflore', "A fragrance built to smell like one flower, whether or not that flower can be extracted.", "Almost every muguet ever sold is a soliflore of a smell nobody has captured.", ['muguet','accord']],
    ['linear', 'Linear', "A fragrance that smells the same from spray to dry. Not an insult, and often deliberate.", "The opposite is a composition that turns and evolves for hours.", ['drydown','top-notes']],
    ['olfactory-fatigue', 'Olfactory fatigue', "Your receptors stop reporting a constant smell within a minute or two.", "It is why you cannot smell your own house, and why you overspray your own perfume.", ['anosmia','blotter','sillage']],
    ['anosmia', 'Anosmia', "The inability to smell, total or specific to one molecule.", "Specific anosmia is common and normal. Total anosmia is a medical matter for a doctor, not an app.", ['musk-anosmia','olfactory-fatigue']],
    ['proust-effect', 'The Proust effect', "Smell reaches memory and emotion before it reaches language, because of how the nose is wired.", "It is why a smell memory arrives complete, with the room and the year attached.", ['the-anchor','scent-memory']],
    ['scent-memory', 'Scent memory', "A memory retrieved by smell: faster, more emotional and less reliable than one retrieved by sight.", "It also fades less. A smell you have not met for thirty years still lands.", ['proust-effect','the-anchor']],
    ['the-anchor', 'The anchor', "One sentence of comparison written at the moment you smell something.", "You cannot record a smell. You can encode it, and articulation is the encoding. This is the whole technique.", ['scent-memory','proust-effect']],
    ['blotter', 'Blotter', "A paper strip for smelling without skin. Dip, wave, wait, and label it.", "Always label first. Everyone has learned this the hard way.", ['dilution','olfactory-fatigue']],
    ['dilution', 'Dilution', "Almost nothing smells like itself neat. Materials are judged at one to ten percent.", "Neat jasmine absolute smells of petrol. Diluted, it smells of jasmine.", ['blotter','indole']],
    ['headspace', 'Headspace', "Capturing the air around a living flower and analysing it, rather than extracting the flower.", "It is how perfumery learned what lily of the valley actually smells of.", ['muguet','accord']],
    ['maceration', 'Maceration', "Letting a finished fragrance rest for weeks so the materials settle into each other.", "A bottle opened on the day it is bottled is not the same fragrance as the same bottle a month later.", ['concentration']],
    ['skin-chemistry', 'Skin chemistry', "Your skin pH, oil and temperature change what a fragrance does. Dry skin holds less and shorter.", "It is not a myth, but it explains less than people claim. Most disagreement is anosmia.", ['musk-anosmia','longevity']],
    ['layering', 'Layering', "Wearing two fragrances together on purpose.", "Usually one simple and one complex. Two complex ones fight.", ['accord','sillage']],
    ['decant', 'Decant', "A few millilitres transferred into a small bottle, for travel or for trying.", "The community's actual unit of exchange, and worth tracking in a collection like any bottle.", ['concentration']],
    ['reformulation', 'Reformulation', "A fragrance rebuilt because a material was restricted, priced out or discontinued.", "Oakmoss and nitro musks changed hundreds of classics. The name on the bottle did not change.", ['oakmoss','nitro-musk']],
    ['green-note', 'Green', "The word for sap, stem, leaf and anything that smells cut rather than ripe.", "Green is a direction, not a material. Galbanum and violet leaf are two very different greens.", ['galbanum','cut-grass','violet-leaf']],
    ['balsamic', 'Balsamic', "Soft, sweet, resinous warmth. Benzoin, tolu, vanilla and their neighbours.", "It is the texture word for the resin bench.", ['benzoin','tolu-balsam','resinous']],
    ['resinous', 'Resinous', "Sticky, sharp, sappy and dry. What a tree bleeds, before anyone sweetens it.", "Frankincense is resinous. Benzoin is balsamic. The difference is worth holding.", ['frankincense','balsamic','pine-pitch']],
    ['bitter', 'Bitter', "Not a taste here but a smell direction: pith, wormwood, myrrh, cocoa.", "Bitterness is what stops a sweet composition from being sickly.", ['pith','artemisia','myrrh']],
    ['sulphury', 'Sulphurous', "Struck match, blackcurrant bud, grapefruit, truffle, and a great deal of what makes fruit smell real.", "Tiny amounts read as fresh. Slightly more reads as rotten.", ['grapefruit','blackcurrant','truffle']],
    ['medicinal', 'Medicinal', "Phenols, camphor and iodine. The pharmacy end of the spectrum.", "Clove, cade, oud and iodine all live here.", ['camphoraceous','iodine','clove']],
    ['fermented', 'Fermented', "Sour, yeasty, boozy. The edge of decay, which is where a lot of deliciousness lives.", "Wine, sourdough, cheese and overripe fruit.", ['wine','goaty','tamarind']],
    ['wine', 'Wine', "Fruit, yeast, oak and acid. The nearest neighbour to perfumery in everyday life.", "The tasting vocabulary of wine and of perfume are the same vocabulary.", ['fermented','grape','oak-cask']],
    ['radiant', 'Radiant', "A fragrance that seems to fill the space around you without being loud up close.", "Usually woody ambers or transparent musks, doing quiet arithmetic on the air.", ['iso-e-super','sillage','woody-amber']],
    ['tea-note', 'Tea', "Dry, tannic, faintly smoky, faintly floral. Black and green tea are separate notes.", "Osmanthus and champaca both have a real tea facet.", ['green-tea','osmanthus','lapsang']],
    ['cat-note', 'Catty', "The sulphurous, feral edge in blackcurrant bud and some grapefruit.", "Charming in trace, alarming above it. Everyone knows this smell and few can name it.", ['blackcurrant','sulphury']],
    ['hair-note', 'Hair', "Warm scalp, keratin and whatever was on it. Costus, in perfumery.", "Divisive, human, and used deliberately in some very good fragrances.", ['costus','animalic','skin-scent']]
  ]);

  const BY_ID = {};
  for (const n of N) BY_ID[n.id] = n;
  // A related id that never got written would render as a dead chip, so drop it once, here.
  for (const n of N) n.r = n.r.filter(id => BY_ID[id] && id !== n.id);

  const FAM = {};
  for (const f of FAMILIES) FAM[f.id] = f;

  function byFamily(fid) { return N.filter(n => n.f === fid); }
  function get(id) { return BY_ID[id] || null; }
  function family(fid) { return FAM[fid] || null; }
  function all() { return N; }

  /** Fuzzy-free search: term first, then the card body. */
  function search(q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return [];
    const starts = [], has = [], body = [];
    for (const n of N) {
      const t = n.t.toLowerCase();
      if (t.startsWith(s)) starts.push(n);
      else if (t.includes(s)) has.push(n);
      else if ((n.w + ' ' + n.o).toLowerCase().includes(s)) body.push(n);
    }
    return starts.concat(has, body);
  }

  /** Terms that appear in a piece of free text, matched on whole words. */
  function termsIn(text) {
    const s = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const out = [];
    for (const n of N) {
      const t = n.t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (t.length < 4) continue;
      if (s.includes(' ' + t + ' ')) out.push(n.id);
    }
    return out;
  }

  return { FAMILIES, all, get, family, byFamily, search, termsIn, count: N.length };
})();
