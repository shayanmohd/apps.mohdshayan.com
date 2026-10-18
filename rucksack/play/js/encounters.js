/* Rucksack: the people on the road.
   Encounters are gated by walked kilometres, never by taps. Characters recur and
   remember. Nothing here needs a connection; it is all authored text. */
var Encounters = (function () {
  'use strict';

  var PEOPLE = {
    marn:   { name: 'Marn',      role: 'a tinker with a loaded cart',        glyph: 'cart' },
    oro:    { name: 'Oro',       role: 'a pilgrim walking the other way',    glyph: 'staff' },
    sef:    { name: 'Sef',       role: 'the ferrywoman at Ash Ford',         glyph: 'boat' },
    dog:    { name: 'Biscuit',   role: 'a dog with his own opinions',        glyph: 'dog' },
    halda:  { name: 'Halda',     role: 'a charcoal burner',                  glyph: 'smoke' },
    ivo:    { name: 'Ivo',       role: 'a salt carter out of Saltgate',      glyph: 'sack' },
    ket:    { name: 'Ket',       role: 'a shepherd on the chalk',            glyph: 'crook' },
    bel:    { name: 'Bel',       role: 'a bell-diver on Lake Ithra',         glyph: 'bell' },
    runa:   { name: 'Runa',      role: 'the warden of the Sighing Pass',     glyph: 'lamp' },
    tamsin: { name: 'Tamsin',    role: 'a horsewoman of Verrow',             glyph: 'horse' },
    mab:    { name: 'Mab',       role: 'the fen lamplighter',                glyph: 'lamp' },
    tobias: { name: 'Tobias',    role: 'a keeper on the Lantern Coast',      glyph: 'light' },
    yon:    { name: 'Yon',       role: 'an orchardist above the terraces',   glyph: 'tree' },
    ansel:  { name: 'Ansel',     role: 'the gatekeeper of Cael',             glyph: 'gate' }
  };

  /* Keepsakes go in the pack. They are given, not earned by streaks. */
  var KEEPS = {
    button:  { name: 'Brass button',      line: "Off Marn's coat. She had four and could spare one." },
    rope:    { name: 'Two fathoms of rope', line: 'Sef says a walker without rope is a walker with a story coming.' },
    charcoal:{ name: 'Stick of charcoal',  line: 'Halda burned it herself. It writes on anything.' },
    salt:    { name: 'Salt in a twist of cloth', line: 'From the first pan. Enough for a month of suppers.' },
    fleece:  { name: 'Scrap of fleece',    line: 'Grease still in it. Rubbed on boots it keeps the wet out.' },
    bronze:  { name: 'Sliver of bell bronze', line: 'Cold in the hand, whatever the weather is doing.' },
    nail:    { name: 'Bridge nail',        line: 'Runa pulls one a year and gives it to whoever is passing.' },
    horsehair:{ name: 'Braid of horsehair', line: 'Tamsin plaited it while talking about something else.' },
    wick:    { name: 'Fen lamp wick',      line: 'Dry, waxed, and good for one long night.' },
    glass:   { name: 'Green sea glass',    line: 'Tumbled for years. Tobias has a jar of the rejected ones.' },
    seed:    { name: 'Grafting knife',     line: 'Yon has three. He says two is one and one is none.' },
    token:   { name: 'Road stone',         line: 'Picked up at the gate. It has been carried a long way.' }
  };

  /* `km` triggers on absolute route distance. `follows` triggers that many
     kilometres after the named encounter was met. */
  var LIST = [
    { id: 'road', km: 3, who: null, title: 'The road out of Fenwarden',
      lines: ["The gate is a gate in name only. Two posts, a hinge that lost its door before you were born, and a road that goes north until it stops being a road and starts being a story people tell.",
              "A board nailed to the left post gives distances. The last line reads: CAEL, 3500. Somebody has scratched underneath it, in a different hand, LONG WAY. It does not say impossible. It says long."],
      journal: 'Left Fenwarden. The board at the gate says three thousand five hundred.' },

    { id: 'marn1', km: 22, who: 'marn', title: 'A cart with three wheels',
      lines: ["The fourth wheel is in the reeds, and Marn is in the mud beside it, explaining to the cart exactly what she thinks of it.",
              "\"Hold the axle,\" she says, without looking up. \"Not there. There. You have done this before.\" You have not. Between you the wheel goes back on, and she sits down on the bank as if the whole business had been her idea.",
              "\"Going far?\" she asks. You tell her. She whistles once, low. \"Then I will see you again. Everyone going that way passes me twice.\""],
      journal: "Levered a tinker's cart out of the mud at the ford road.",
      gift: 'button', gives: "She cuts a button off her own coat and puts it in your hand.",
      after: { id: 'marn2', km: 96 } },

    { id: 'sef1', km: 34, who: 'sef', title: 'The rope ferry at Ash Ford',
      lines: ["Sef pulls the ferry hand over hand and does not hurry for anybody. The river is forty paces of brown water with an opinion.",
              "\"Walkers,\" she says, when you say where you are going. \"I get four a year. Two turn back at the wood. One I never hear about. One sends me a letter from Cael eventually, and I keep them all in a tin.\"",
              "She looks at you the way you look at weather. \"Tin has room.\""],
      journal: 'Crossed at Ash Ford. Sef keeps letters from walkers in a tin.',
      gift: 'rope', gives: "She coils two fathoms of rope and drops it in your pack before you can refuse." },

    { id: 'oro1', km: 61, who: 'oro', title: 'Somebody going the other way',
      lines: ["A man with a staff and a hat that has been rained on for a living. He stops when you stop, which is what people do out here.",
              "\"Oro,\" he says. \"Walking south.\" You ask what is south. He thinks about it properly, the way a man does when he intends to answer.",
              "\"Everything you have already walked. Which is worth walking again, but not yet.\" He nods at the road behind you and then the road ahead. \"You will meet me twice more, if you keep at it. I am slower than I look.\""],
      journal: 'Met Oro, walking the other way. He says we will meet again.',
      after: { id: 'oro2', km: 940 } },

    { id: 'marn2', who: 'marn', follows: 'marn1', km: 96, title: 'Marn, ahead of you again',
      lines: ["The cart is parked in the shade of the last stand of willow and Marn is asleep under it with her hat over her face.",
              "\"You are quicker than you look,\" she says, from under the hat. \"Sit. Do not talk yet.\" You sit. A kettle is already on. Somewhere behind you the river is doing the same thing it was doing this morning.",
              "After a while she says, \"Most people ask me how far it is. You have not.\" You tell her you know how far it is. \"Good,\" she says. \"Then you have got the hard part out of the way.\""],
      journal: 'Marn had the kettle on before I arrived.',
      after: { id: 'marn3', km: 640 } },

    { id: 'chapel', km: 140, who: null, title: 'Marsh Chapel',
      lines: ["Four walls, no roof, and a floor of clean standing water that reflects whatever the sky is doing. Somebody keeps it swept, which is a strange thing to say about water.",
              "There is a shelf at head height with candle stubs, a dry box of matches, and a slate. On the slate, in a hundred hands: names, and after each name, a number. 340. 1,200. 2,875. Two entries read 3,500 and both have been gone over with the chalk twice, as if the writer wanted to be sure.",
              "There is a stub of chalk. You write your number. It is a small number. It is not nothing."],
      journal: 'Wrote my number on the slate at Marsh Chapel. It was a small number.' },

    { id: 'ferry2', km: 205, who: null, title: 'The Eel Steps',
      lines: ["Stone steps going down into the water and, presumably, up again on the far side. Between them, four hundred years of eels have gone about their business.",
              "An old man fishing here tells you the trick to a long walk, unasked. \"Do not think about the end of it. Think about the next place you can sit down.\" He indicates the step he is sitting on. \"This is one. You are welcome to it.\""],
      journal: 'Sat on the Eel Steps with a man who had good advice about sitting.' },

    { id: 'mill', km: 308, who: null, title: 'The Last Windmill',
      lines: ["It still turns, but slowly, and only to keep the bearings honest. The miller shows you the view from the cap: reeds behind you all the way to the horizon, and ahead, a dark line that is not cloud.",
              "\"Wood,\" he says. \"Two weeks of it, at your pace. It is not as bad as they say. It is only dark.\""],
      journal: 'Saw the wood from the cap of the last windmill. It is a dark line, not a cloud.' },

    /* ---- Ashford Wood ---- */
    { id: 'halda1', km: 356, who: 'halda', title: "Collier's Clearing",
      lines: ["A dome of turf and smoke with a woman walking round it slowly, listening. Halda has burned charcoal for thirty one years and can hear a stack going wrong from the far side of the clearing.",
              "\"Sit downwind and you will smell of this for a week,\" she says. \"Sit upwind and you will be cold. Choose.\" You choose downwind. She looks pleased about it.",
              "She talks while she works. The wood is not haunted, she says, but it is old, and old things have habits, and a habit looks a great deal like a ghost if you arrive at the wrong hour."],
      journal: 'Sat downwind of a charcoal stack and smelled of it for days.',
      gift: 'charcoal', gives: "She gives you a stick of her own charcoal for the journal." },

    { id: 'dog1', km: 430, who: 'dog', title: 'A dog, keeping his distance',
      lines: ["He is brown, mostly, with one ear that has an argument with the other. He has been forty paces behind you since the pool at Stagwater and he is trying very hard to look like a dog who happens to be going the same way.",
              "You stop. He stops. You walk. He walks. When you sit down to eat he sits down at exactly the distance he has decided is polite, and looks at the middle distance with enormous dignity.",
              "He is not yours. Dogs like this belong to whoever keeps going. Walk tomorrow, and the day after, and the day after that, and see what he decides."],
      journal: 'A brown dog has been walking behind me since Stagwater.' },

    { id: 'dog2', streakAfter: { id: 'dog1', days: 3 }, who: 'dog', title: 'Biscuit',
      lines: ["Three days. On the third evening he does not sit at his polite distance. He walks up, turns around twice, and lies down against your leg with the finality of a decision taken at a higher level.",
              "You call him Biscuit, because that is what he came over for on the first night and it seems dishonest to pretend otherwise.",
              "He is yours now. Not because you fed him. Because you kept going, and that is the only credential he checks."],
      journal: 'The dog has a name now. Biscuit walked in and lay down and that was that.' },

    { id: 'chapel2', km: 488, who: null, title: 'The Green Chapel',
      lines: ["The wood took this one back. A beech is standing where the altar was, and the roof came off so long ago that the trees have grown up through the nave and made a better one.",
              "It is not sad in here. That is the surprising part. Somebody has left a jar of hedgerow flowers on a stone, and they are fresh."],
      journal: 'The Green Chapel has a beech where the altar was, and fresh flowers.' },

    { id: 'oroA', km: 556, who: null, title: 'Bark Market',
      lines: ["Six stalls and a dog fight that resolves itself. They sell bark here, which sounds absurd until you understand that everything in this region is made of the wood or comes out of it.",
              "A woman selling boot grease takes one look at your boots and refuses your money. \"Come back through in a year and pay me then,\" she says. \"That is how I know you made it.\""],
      journal: 'A woman at Bark Market gave me boot grease on credit until next year.' },

    /* ---- The Salt Road ---- */
    { id: 'ivo1', km: 664, who: 'ivo', title: 'The First Pan',
      lines: ["White to the horizon, and a man raking it into ridges as if the whole plain were a garden. Ivo carts salt for a living and has views about roads.",
              "\"Yours is a good road,\" he allows. \"Flat. Boring. Boring is a compliment. Interesting roads have got holes in.\"",
              "He tells you to drink before you are thirsty and to walk the first hour before the sun is properly up. Then he says it again, so you will remember it, and then a third time so you will be annoyed enough to remember it."],
      journal: 'Ivo told me three times to drink before I was thirsty.',
      gift: 'salt', gives: "He twists a handful of salt into a scrap of cloth for you." },

    { id: 'caravan', km: 738, who: null, title: 'Caravanserai Ost',
      lines: ["Shade, a well, forty people, and a rule that nobody explains because everybody keeps it: you do not ask a stranger where they are going until the second night.",
              "So on the first night you eat, and listen to somebody's brother-in-law being discussed at length, and sleep better than you have in a fortnight. On the second morning they all leave at four, together, and the courtyard is yours and the well is yours and the silence is enormous."],
      journal: 'Slept at Caravanserai Ost. They all left at four in the morning.' },

    { id: 'bone', km: 776, who: null, title: 'The Bone Mile',
      lines: ["A mile of cattle bones set in cairns along the verge, bleached white, going back further than anybody's grandmother. Not a graveyard. A distance marker, for a road that has no other landmarks at all.",
              "You count them for a while and then stop counting, which is the correct thing to do with the Bone Mile and probably with a great deal else."],
      journal: 'Walked the Bone Mile. Stopped counting the cairns about halfway.' },

    { id: 'white', km: 924, who: null, title: 'The White Mile after rain',
      lines: ["Two centimetres of water on perfectly flat salt, and the sky lands on it and stays there. You walk across the clouds for an hour. Biscuit refuses at first and then discovers he can bite the sky.",
              "Nobody has ever taken a picture of this that worked. Everybody tries."],
      journal: 'Crossed the White Mile with the sky underfoot. It has not been photographed properly and will not be.' },

    { id: 'oro2', who: 'oro', follows: 'oro1', km: 940, title: 'Oro, as promised',
      lines: ["Same hat. Rather more rain has happened to it. He recognises you from a long way off, which is either good eyesight or good memory, and puts a hand up.",
              "\"You have got a dog,\" he observes. Or, if you have not: \"You have got the walk. It is in how you put your feet down. You did not have it in the Reedlands.\"",
              "He asks how far. You tell him, and the number is large enough now that saying it out loud does something to your chest. \"That is the middle,\" he says. \"The middle is the hard part. Nobody writes songs about the middle.\""],
      journal: 'Met Oro again on the Salt Road. He says nobody writes songs about the middle.',
      after: { id: 'oro3', km: 1580 } },

    /* ---- Kell Downs ---- */
    { id: 'ket1', km: 1042, who: 'ket', title: "The Shepherd's Cut",
      lines: ["Ket has four hundred sheep and one dog and takes both personally. The dog and Biscuit conduct negotiations. The negotiations go well.",
              "\"Chalk under you now,\" Ket says. \"Best walking in Elsewhere. Drains in an hour, holds the sun, and it is quiet enough up here to hear yourself deciding things.\""],
      journal: 'Ket says chalk is the best walking there is and I am starting to agree.',
      gift: 'fleece', gives: "She pulls a scrap of greasy fleece off a thorn and hands it over. It is for your boots." },

    { id: 'stones', km: 1078, who: null, title: 'Nine Sisters',
      lines: ["There are eleven stones. There have always been eleven stones. Somebody counted wrong four hundred years ago and the name has outlived every person who could have corrected it.",
              "Ket says the sensible view is that two are late arrivals. Ket also says nobody has ever moved a stone in this county for a sensible reason."],
      journal: 'Counted eleven stones at the Nine Sisters. The name is older than the count.' },

    { id: 'horse', km: 1220, who: null, title: 'The White Horse',
      lines: ["Cut into the chalk on the far slope, and so large that from the road you can only see a leg. To see the horse you have to climb the opposite hill, which is one kilometre and four hundred years of people deciding it was worth it.",
              "It is worth it."],
      journal: 'Climbed the wrong hill on purpose to see the White Horse. Correct decision.' },

    /* ---- Lake Ithra ---- */
    { id: 'bel1', km: 1362, who: 'bel', title: 'The First Bell',
      lines: ["The tower stands out of the water to the height of two men and the rest of the town is underneath it, in order, streets and all. Bel dives it for bronze in the summer and for the pleasure of it the rest of the year.",
              "\"Third bell still rings,\" she says. \"Not often. Big swell, right direction, and you have to be on the shore at the right hour with nothing else going on. I have heard it nine times in twenty years.\"",
              "She does not offer to explain it, which you appreciate."],
      journal: 'Bel has heard the drowned bell ring nine times in twenty years.',
      after: { id: 'bel2', km: 214 } },

    { id: 'vesper', km: 1432, who: null, title: 'Drowned Vesper',
      lines: ["You camp on the shore because the light goes and there is nowhere else, and at some point in the night the water changes its mind about something and a bell rings, once, out in the dark.",
              "Biscuit lifts his head. You both listen for a long time. It does not ring again."],
      journal: 'The bell rang once in the night. Biscuit heard it too, so I did not imagine it.' },

    { id: 'bel2', who: 'bel', follows: 'bel1', km: 214, title: "Bel-Diver's Hut",
      lines: ["She is drying kit on a line and does not seem surprised to see you. When you tell her about the bell she stops what she is doing entirely.",
              "\"Which hour?\" You tell her. She nods slowly. \"Ten,\" she says, to herself, and goes back to the line."],
      journal: 'Told Bel about the bell. She counted it as her tenth.',
      gift: 'bronze', gives: "She gives you a sliver of bell bronze off the workbench without discussion." },

    /* ---- The Sighing Pass ---- */
    { id: 'runa1', km: 1692, who: 'runa', title: 'The roped bridge',
      lines: ["Runa keeps the bridge, the weather book, and the list of people who have gone up in the last month with the dates they came down beside them. There are two names without dates. She does not talk about those.",
              "\"You will hear it before the gate,\" she says. \"Everyone thinks it is going to be frightening. It is not frightening. It is only very large and completely uninterested in you, and people find that harder.\""],
      journal: 'Runa keeps a list of who went up and when they came down.',
      gift: 'nail', gives: "She works a nail out of the bridge planking and gives it to you. She does this once a year." },

    { id: 'gate', km: 1796, who: null, title: 'The Sighing Gate',
      lines: ["Two rocks the size of houses, and the wind between them, and the sound is exactly what it is called. Not a howl. A breath, drawn and let out, at the pace of something enormous asleep.",
              "You stand in it longer than you meant to. Biscuit does not like it and will not say why."],
      journal: 'Stood in the Sighing Gate. It breathes. That is the only honest word for it.' },

    { id: 'summit', km: 1896, who: null, title: 'Summit Cairn',
      lines: ["Every stone in this cairn was carried up by somebody who did not have to. You add one, because now you understand why.",
              "From here the road behind you is a thread and the road ahead is a thread and there is no difference between them at all, except that you know what one of them tastes like.",
              "Everything after today leans downhill for a while. It will not feel like it. It is true anyway."],
      journal: 'Put a stone on the Summit Cairn. Highest ground on the whole road.' },

    /* ---- Verrow Steppe ---- */
    { id: 'tamsin1', km: 2024, who: 'tamsin', title: 'Horsewater',
      lines: ["Tamsin arrives at the well the way weather arrives, with eleven horses and no obvious effort, and is off and drinking before the dust settles.",
              "\"You are walking to Cael,\" she says. It is not a question. \"On foot. Past all these horses.\" She looks at you for a while and then decides something in your favour. \"Good. A horse would not understand it.\""],
      journal: 'Tamsin says a horse would not understand walking to Cael on purpose.',
      gift: 'horsehair', gives: "She plaits horsehair while talking about something else and hands it over without looking.",
      after: { id: 'tamsin2', km: 190 } },

    { id: 'kite', km: 2060, who: null, title: 'The Kite Ground',
      lines: ["Flat, windy, and belonging entirely to the children of Verrow, who have thirty kites up and a system you cannot follow.",
              "One of them puts a line in your hand for a minute. The pull of it goes all the way down your arm into your feet. You give it back. You think about it for the next two days."],
      journal: 'Held a kite line for a minute at the Kite Ground and thought about it for two days.' },

    { id: 'tamsin2', who: 'tamsin', follows: 'tamsin1', km: 190, title: 'The Singing Fence',
      lines: ["Four hundred kilometres of wire on posts, and in the right wind the whole thing hums one long note that changes when the wind changes. Tamsin is leaning on it with her eyes shut.",
              "\"Ninety kilometres of this,\" she says, \"and then it stops, and the quiet afterwards is the loudest thing on the steppe.\""],
      journal: 'The Singing Fence hums. Tamsin says the quiet after it is louder.' },

    /* ---- The Amber Fen ---- */
    { id: 'mab1', km: 2368, who: 'mab', title: 'The Lantern Line',
      lines: ["Two hundred posts across the fen and a lamp on every one, and Mab walks the line at dusk and again at three in the morning, because a lamp that goes out at three is a lamp that kills somebody at four.",
              "\"Stay on the boards,\" she says. \"The fen is not malicious. It is only deep, and it does not care, and those two together are enough.\""],
      journal: 'Mab walks two hundred lamps at dusk and again at three in the morning.',
      gift: 'wick', gives: "She gives you a waxed wick, good for one long night." },

    { id: 'wisp', km: 2490, who: null, title: 'Wisp Reach',
      lines: ["A light out on the water that is not one of Mab's, moving at walking pace, keeping level with you for twenty minutes.",
              "In the morning Mab says it was gas. She says it without much conviction and then changes the subject to boots."],
      journal: 'A light kept pace with me across Wisp Reach. Mab says gas.' },

    { id: 'lastlamp', km: 2554, who: null, title: 'The Last Lantern',
      lines: ["The final post on the line, and beyond it, dry ground going up. Somebody has scratched a tally into the post: hundreds of marks, in dozens of hands, each one a person who got across.",
              "You add yours. It takes four seconds and it is one of the better things you have done."],
      journal: 'Cut my mark into the last lantern post with the rest of them.' },

    /* ---- Lantern Coast ---- */
    { id: 'sea', km: 2610, who: null, title: 'First sight of the sea',
      lines: ["You smell it a kilometre before you see it, and then the road turns and there it is, doing what it has been doing the whole time you have been walking, without once needing you to know about it.",
              "You sit down on the verge. Not tired. Just not able to walk and look at that at the same time."],
      journal: 'Smelled the sea before I saw it. Sat down on the verge for a while.' },

    { id: 'tobias1', km: 2784, who: 'tobias', title: 'The High Light',
      lines: ["Ninety one steps, and Tobias counts them out loud for you on the way up because he counts them out loud for everybody and has done for nineteen years.",
              "At the top: the lamp, the brass, the enormous patience of the room. \"People think it is lonely,\" he says. \"It is the opposite. Everything out there is looking at me.\""],
      journal: 'Tobias counted all ninety one steps out loud on the way up.',
      gift: 'glass', gives: "He fishes a piece of green sea glass out of a jar and gives you the best one." },

    { id: 'wreck', km: 2820, who: null, title: 'Wreckbeach',
      lines: ["Timber, mostly, and rope, and one entire ship's door standing upright in the shingle where the sea put it, which somebody has hung a knocker on.",
              "You knock. Obviously you knock. Everybody knocks."],
      journal: 'Knocked on the door standing in the shingle at Wreckbeach. Everybody does.' },

    /* ---- The Quiet Orchards ---- */
    { id: 'yon1', km: 2992, who: 'yon', title: 'Ladder Row',
      lines: ["Ladders left standing in the trees overnight, which tells you more about this region than a week of asking questions would.",
              "Yon grafts by hand and talks about the trees the way Ket talks about sheep and Mab talks about lamps: as a long argument that both sides are enjoying.",
              "\"You are near the end,\" he says. \"People go strange near the end. They start walking faster. Do not. You will want to have arrived, and that is different from arriving.\""],
      journal: 'Yon warned me not to start walking faster near the end.',
      gift: 'seed', gives: "He gives you a grafting knife. He says two is one and one is none." },

    { id: 'barn', km: 3026, who: null, title: 'The Cider Barn',
      lines: ["Warm, dim, loud, and nobody in the history of the building has left it in a hurry. You mean to stop for an hour.",
              "You stop for an hour."],
      journal: 'Meant to stop at the Cider Barn for an hour. Stopped for an hour.' },

    /* ---- Cael-on-the-Mountain ---- */
    { id: 'stair', km: 3294, who: null, title: 'The Pilgrim Stair',
      lines: ["Cut into the rock, worn into dishes by feet, with a rope on the seaward side that has been replaced so many times that the anchor rings are the only original part.",
              "There are people on it. Not many. All going up. Nobody talks."],
      journal: 'On the Pilgrim Stair. Everyone going up, nobody talking.' },

    { id: 'ansel1', km: 3464, who: 'ansel', title: 'The Last Gate',
      lines: ["It is open. Ansel says it has been open the whole time, all his life and his mother's before him, and that the hinges would probably not survive being asked to close.",
              "\"They ask me what is in there,\" he says. \"I tell them: a city. Streets, and a market, and people arguing about drains. That is all. The walking was the thing. You have done the thing.\"",
              "He steps aside. There are thirty six kilometres left and they are all uphill and you know exactly how you are going to spend them."],
      journal: "Ansel says the gate has been open the whole time. Thirty six kilometres left.",
      gift: 'token', gives: "He picks a stone off the wall top and gives it to you." },

    { id: 'cael', km: 3500, who: null, title: 'Cael-on-the-Mountain',
      lines: ["You arrive on an ordinary morning, because they are all ordinary mornings, and that turns out to be the point.",
              "The road stops in a square with a well in it. There is no ceremony. A woman selling bread asks where you have come from and you say Fenwarden, and she stops what she is doing and looks at you properly, and then gives you the bread.",
              "Three thousand five hundred kilometres. Every one of them under your own feet, on ordinary days, in the gaps of an ordinary life. The map is finished. You are not."],
      journal: 'Arrived at Cael-on-the-Mountain. Three thousand five hundred kilometres, all of them walked.' }
  ];

  var BY_ID = {};
  for (var i = 0; i < LIST.length; i++) BY_ID[LIST[i].id] = LIST[i];

  function byId(id) { return BY_ID[id] || null; }
  function person(id) { return PEOPLE[id] || null; }
  function keep(id) { return KEEPS[id] || null; }

  /** Route kilometre at which `e` becomes available, or null when it is not yet reachable. */
  function triggerKm(e, met) {
    if (e.follows) {
      var m = met[e.follows];
      if (!m) return null;
      return m.km + e.km;
    }
    if (typeof e.km === 'number') return e.km;
    return null;
  }

  return { PEOPLE: PEOPLE, KEEPS: KEEPS, LIST: LIST,
           byId: byId, person: person, keep: keep, triggerKm: triggerKm };
})();
