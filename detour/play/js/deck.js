/* The deck. Three hundred observational quests, written to be done in under a minute, in public,
   without spending anything, without going indoors and without pointing a camera at a stranger.

   m: which moods a card suits.  s surprise, q quiet, l lively, a architectural, m melancholy
   c: when it suits.  dawn day dusk night near far early late.  Blank means always. */
const Deck = (() => {
  const ALL = [];
  function g(m, c, list) { for (const t of list) ALL.push({ t: t, m: m, c: c }); }

  /* ---- doors and thresholds ---- */
  g('sqla', '', [
    'Find a door that looks like it has a secret behind it.',
    'Find the oldest door on this street and work out how you know.',
    'Find a door that has been painted more than three times.',
    'Find two doors side by side that were clearly the same door once.',
    'Find a doorway with a step worn into a curve by feet.',
    'Find a letterbox that has given up.',
    'Find a door handle worth touching, and touch it.',
    'Find a door that is too grand for the building behind it.',
    'Find a bricked-up doorway and decide what it used to lead to.',
    'Count the doorbells on the busiest door you pass.',
    'Find a door with a name on it that is no longer anyone here.',
    'Find the smallest door on this walk.',
    'Find a threshold with something left on it: a shoe, a plant, a note.',
    'Find a doorway deep enough to shelter in.',
    'Find a door colour you would never have chosen and admit it works.',
    'Find a gate that has been left open long enough to rust that way.',
    'Find a house number rendered in a way that took someone an afternoon.',
    'Find a door with a cat flap and no visible cat.',
    'Find a front step someone has recently swept.',
    'Find a doorway where the paint has bubbled into a landscape.'
  ]);

  /* ---- windows ---- */
  g('sqam', '', [
    'Find a window with more plants in it than a person could water.',
    'Find a window that has not been opened this decade.',
    'Find a window with something on the sill that is not for you.',
    'Find a curved window and stand where it makes sense.',
    'Find a window shaped for a room that no longer exists.',
    'Find a pane of old glass and look for the ripple.',
    'Sit for three minutes where you can see thirty windows.',
    'Find the highest window you can see into from the ground.',
    'Find a window with a sticker that has outlived its message.',
    'Find a window where someone has arranged things for passers-by.',
    'Find the only lit window on an unlit wall.',
    'Find a window filled in with the wrong brick.',
    'Find a shop window that is more interesting than the shop.',
    'Find a window with a fan in it and no summer.',
    'Find a bay window and stand where the person in it would be looking.',
    'Find two identical windows treated completely differently.',
    'Find a window that is really a mirror at this hour.',
    'Count the windows with curtains closed at this time of day.'
  ]);

  /* ---- walls and material ---- */
  g('sqam', '', [
    'Find a wall built of at least three different things.',
    'Put your hand flat on a wall older than your grandmother.',
    'Find a wall where the mortar is doing more work than the brick.',
    'Find a wall that changes colour halfway up and work out why.',
    'Find bricks laid by someone having a bad day.',
    'Find a wall with a scar from something that was attached to it.',
    'Find a corner that has been clipped by a vehicle more than once.',
    'Find a wall that is holding back earth, and think about that.',
    'Find the most recent repair on the oldest wall you can see.',
    'Find a stone with a fossil, a shell or a hole in it.',
    'Find a wall that has been washed by rain on one side only.',
    'Find a surface that was smooth when it was made.',
    'Find a wall that leans.',
    'Find a boundary between two owners written in brick.',
    'Find a wall where three eras of paint are all visible at once.',
    'Find something built to last a season that has lasted years.',
    'Find a wall with a hole deliberately left in it.',
    'Find the ugliest cladding on this street and defend it out loud in your head.',
    'Find where a building was cut off from its neighbour.',
    'Find a wall that someone clearly loves.'
  ]);

  /* ---- the ground ---- */
  g('sqlam', '', [
    'Find a manhole cover with a foundry name and read the whole thing.',
    'Find the oldest paving slab you can stand on.',
    'Find a kerb worn down by a wheel that comes here often.',
    'Find a patch of road that has been dug up and filled three times.',
    'Find a drain with a story running out of it.',
    'Walk on only the dark paving stones for twenty paces.',
    'Find a crack in the pavement with a whole ecosystem in it.',
    'Find an arrow painted on the ground and follow it as far as it goes.',
    'Find where the pavement changes material and stop on the seam.',
    'Find a desire path: the route people take rather than the one built.',
    'Find handwriting in dried concrete.',
    'Find a paving repair someone was proud of.',
    'Find a grating and work out what is under it.',
    'Find the point on this street where water would collect.',
    'Find something in the gutter that was once expensive.',
    'Find a stretch of pavement where you can hear your own footsteps change.',
    'Find a cellar hatch in a pavement.',
    'Find the shiniest metal thing set into the ground here.',
    'Find a cobble that has come loose and is going to keep coming loose.',
    'Find a road marking that stops for no reason.'
  ]);

  /* ---- signs and lettering ---- */
  g('sqla', '', [
    'Find hand-painted lettering that has survived.',
    'Find a sign for a shop that is not there.',
    'Find a sign nobody has obeyed today.',
    'Find the oldest street name sign on this walk.',
    'Find a sign with a spelling mistake nobody has fixed.',
    'Find a sign that has been corrected by hand.',
    'Find a warning about something that is no longer dangerous.',
    'Find a notice with the tear-off strips all gone.',
    'Find lettering carved rather than printed.',
    'Find a sign in a language you cannot read and guess the trade.',
    'Find an arrow pointing at nothing.',
    'Find a sign so faded it has become an abstract painting.',
    'Find a sign that assumes you already know something.',
    'Find a plaque and read it whether or not it interests you.',
    'Find a sign that was funny by accident.',
    'Find a shop name with a pun in it and rate the pun honestly.',
    'Find a sticker that has been scraped at and survived.',
    'Find the smallest piece of official writing you can find.',
    'Find a sign fixed with the wrong screws.',
    'Find a number painted on something for someone who is not you.'
  ]);

  /* ---- plants nobody planted ---- */
  g('sqm', '', [
    'Find a plant growing where no soil was offered.',
    'Find a tree that has grown around something.',
    'Find the tallest weed on this street and give it a moment.',
    'Find a buddleia and say hello, because it will outlast the building.',
    'Find moss growing on the north side of something.',
    'Find a garden escaping over a wall.',
    'Find a plant somebody has watered in a place nobody owns.',
    'Find a tree root winning against pavement.',
    'Find the only green thing on an entirely grey stretch.',
    'Find a hedge cut by two different people with two different opinions.',
    'Find a fallen leaf worth putting in a pocket.',
    'Find a flower growing out of a wall above your head.',
    'Find a stump and count what you can of the rings.',
    'Find ivy that has become structural.',
    'Find a plant in a container that was not made for plants.',
    'Find seeds travelling by wind, water or shoe.'
  ]);

  /* ---- animals ---- */
  g('sqlm', '', [
    'Follow a cat for one block if a cat appears.',
    'Find where the pigeons have decided the good spot is.',
    'Find evidence of an animal you cannot see.',
    'Watch one bird until it does something you did not expect.',
    'Find a place built to keep animals out, and admire the effort.',
    'Find a spider web with the day caught in it.',
    'Find a dog and work out its opinion of this street.',
    'Find the nest nearest to you.',
    'Find snail trails and follow one backwards.',
    'Find a bird singing from the highest point it could have chosen.',
    'Find an insect doing something completely absorbing.',
    'Find a window with a cat in it.',
    'Find gull or crow behaviour that is clearly a plan.',
    'Find a bowl of water put out for something.',
    'Count the different bird sounds you can separate from here.',
    'Find a fox print, a feather or a shell, and leave it there.'
  ]);

  /* ---- people, at a respectful distance ---- */
  g('lsq', '', [
    'Find someone doing their job extremely well and notice how.',
    'Find the busiest doorway within sight and time one minute of it.',
    'Notice who is not hurrying.',
    'Find a bench and work out who it is really for.',
    'Find two people who have obviously done this together for years.',
    'Notice the exact moment a stranger decides to cross the road.',
    'Find the place on this street where people naturally stop.',
    'Find a queue and work out what it believes in.',
    'Say a proper thank you to someone today, out loud.',
    'Find something a person has left for other people on purpose.',
    'Find a window someone works behind all day and consider the view.',
    'Notice a stranger being kind and let it count.',
    'Find where the smokers stand and what they can see from there.',
    'Find the spot a busker would choose and hear why.',
    'Notice how many people are looking up.',
    'Find something that only exists because somebody complained.',
    'Find a shortcut and see whether anyone else uses it.',
    'Give directions properly if anyone asks. If nobody does, work out where you would send them.'
  ]);

  /* ---- sound ---- */
  g('sqlm', '', [
    'Stand still and separate five sounds.',
    'Find the quietest place within a minute of here.',
    'Find where two sounds meet and stand exactly on the line.',
    'Find a sound you cannot identify and stay with it.',
    'Find the loudest thing here that nobody is complaining about.',
    'Find a place where you can hear water.',
    'Listen to a street with your eyes closed for thirty seconds.',
    'Find a sound that only happens at this hour.',
    'Find the rhythm in the traffic and count it.',
    'Find a door that makes a good noise.',
    'Find the sound of somebody else practising something.',
    'Find a place where your own footsteps come back to you.',
    'Find a machine having a conversation with itself.',
    'Notice the exact moment the sound of the street changes.',
    'Find a bell, a chime or a horn and wait for it to happen again.',
    'Find the hum of a building and follow it to its source.',
    'Find a sound your parents would recognise and one they would not.',
    'Stand under something that changes the sound of everything.'
  ]);

  /* ---- smell ---- */
  g('sqlm', '', [
    'Stand where two smells meet.',
    'Find the best smell on this street and stay in it for ten seconds.',
    'Find a smell that belongs to a trade.',
    'Find the smell of rain even if it is not raining.',
    'Find a smell that takes you somewhere else entirely.',
    'Find where somebody is cooking.',
    'Find a smell that only exists in the morning.',
    'Find the smell of a garden from outside it.',
    'Find a smell you would have hated as a child.',
    'Find the smell of cold, or the smell of hot, whichever this is.',
    'Find something that smells of the sea, or of a river, or of neither.',
    'Find a doorway that smells of the building rather than the street.',
    'Notice how far a bakery, a laundry or a workshop carries.',
    'Find a plant you can smell without touching it.'
  ]);

  /* ---- light and shadow ---- */
  g('sqam', '', [
    'Find the best shadow within sight and work out what is casting it.',
    'Find a shaft of light that will not be there in an hour.',
    'Find a wall the sun has bleached unevenly.',
    'Stand in the last sunlit spot on this street.',
    'Find a reflection that improves a building.',
    'Find a window catching the light from a place you cannot see.',
    'Find the sharpest shadow line and put your hand on it.',
    'Find a place that is dark at midday.',
    'Find where a lamp will be doing its job in three hours.',
    'Find a puddle with a whole building in it.',
    'Find a colour that only exists at this angle of light.',
    'Find a shadow that looks nothing like the thing making it.',
    'Find where the light comes through leaves and stand under it.',
    'Find the brightest thing in your field of view and defend it.',
    'Watch a shadow move enough to notice.',
    'Find a surface that changes completely when you move two steps.',
    'Find glass that is doing something unintended with the sun.',
    'Find the warmest square metre on this street.'
  ]);

  /* ---- age and time ---- */
  g('sqam', '', [
    'Find something older than you.',
    'Find something older than anyone alive.',
    'Find the newest thing on the oldest building here.',
    'Find a date carved, cast or painted into something.',
    'Find three eras of building on one street and put them in order.',
    'Find something that has been repaired for longer than it was new.',
    'Find the oldest thing you could pick up.',
    'Find something that will not be here in five years.',
    'Find something that was modern once and is now simply itself.',
    'Find a material nobody uses any more.',
    'Find where a street was widened and the buildings remember it.',
    'Find the join between two centuries.',
    'Find something built for a vehicle that no longer exists.',
    'Find a wall that has been rebuilt from the middle up.',
    'Find something that has aged better than expected.',
    'Find something that has aged worse.',
    'Find the oldest tree within sight and estimate badly.',
    'Find a modern thing pretending to be old, and be generous about it.',
    'Find an old thing pretending to be modern.',
    'Find a surface that records exactly how many people have touched it.'
  ]);

  /* ---- absence and ghosts ---- */
  g('sqm', '', [
    'Find evidence of a former shop.',
    'Find the outline of something that has been taken away.',
    'Find a building that is clearly waiting.',
    'Find a gap in a terrace and imagine what filled it.',
    'Find a phone box, a post box or a pillar doing nothing much.',
    'Find something that has been boarded up hopefully.',
    'Find a step that leads nowhere.',
    'Find a chimney with no fire under it.',
    'Find hooks, brackets or fixings with nothing hanging from them.',
    'Find a space that was a garden.',
    'Find a road that was a river, or a river that was a road.',
    'Find lettering under paint.',
    'Find an empty plinth, shelf or frame.',
    'Find something abandoned mid-task.',
    'Find where a tree used to be.',
    'Find a place that was clearly loved and then was not.'
  ]);

  /* ---- water ---- */
  g('sqm', '', [
    'Find water you did not expect.',
    'Find where the rain goes from here.',
    'Find a puddle worth photographing and do not photograph it.',
    'Find a tap, fountain or standpipe in public.',
    'Find the highest water mark on something.',
    'Find a drip and time it.',
    'Find water moving faster than you are walking.',
    'Find a bridge over something with no water in it.',
    'Find where a gutter has been leaking for years.',
    'Find a reflection you have to crouch to see.',
    'Find ice, condensation or steam.',
    'Follow water downhill for a hundred paces.'
  ]);

  /* ---- repairs and improvisations ---- */
  g('sqla', '', [
    'Find a repair made with the wrong material and admire the nerve.',
    'Find something held together by one screw.',
    'Find a fix that has become permanent.',
    'Find gaffer tape doing structural work.',
    'Find a bollard that has been hit and replaced.',
    'Find where a professional and an amateur worked on the same thing.',
    'Find something propped up.',
    'Find a solution somebody invented on the spot.',
    'Find a hinge that has been moved.',
    'Find a pipe that goes somewhere unlikely.',
    'Find a lock that is no longer locking anything.',
    'Find a wire that clearly used to matter.',
    'Find something painted to hide a repair, badly.',
    'Find something painted to hide a repair, well.',
    'Find a thing that has been made bigger since it was built.',
    'Find a temporary measure that has been temporary for a decade.'
  ]);

  /* ---- colour ---- */
  g('sqla', '', [
    'Find the only red thing on this street.',
    'Find two colours that should not work together and do.',
    'Find a colour that was chosen by law.',
    'Find the exact same colour on three different things.',
    'Find a colour that has faded into something better.',
    'Find the most confident colour within sight.',
    'Find a whole street in four colours and name them.',
    'Find a colour that is doing a job: warning, welcoming, hiding.',
    'Find the greenest thing that is not a plant.',
    'Find a colour you would live inside.',
    'Find a colour that has been repainted the same shade for decades.',
    'Find something that used to be a brighter colour.',
    'Find the darkest thing here and get close to it.',
    'Find a colour you have no word for.'
  ]);

  /* ---- counting ---- */
  g('sqla', '', [
    'Count the chimneys you can see from one spot.',
    'Count the cameras pointed at the street here.',
    'Count how many steps it takes to cross this junction.',
    'Count the aerials, dishes and masts on one roofline.',
    'Count the bicycles locked to things that are not bicycle racks.',
    'Count the plaques, notices and stickers on one pole.',
    'Count the trees on this street and then count them again.',
    'Count how many buildings you can see the whole of.',
    'Count the different roof shapes in one view.',
    'Count the bins waiting to be somewhere else.',
    'Count the shades of brick on one wall.',
    'Count how many paces the longest straight bit of this walk was.',
    'Count the things above head height that could fall.',
    'Count the places you could sit down without being asked to leave.'
  ]);

  /* ---- your own body ---- */
  g('sqlm', '', [
    'Walk twenty paces slower than everyone else.',
    'Take the next set of steps rather than the flat way round.',
    'Change which side of the street you are on for no reason.',
    'Walk the next stretch without looking at anything below shoulder height.',
    'Notice your hands and put them somewhere better.',
    'Walk the next hundred metres in step with a sound.',
    'Stop where you are and turn a full circle.',
    'Take a route you can only take on foot.',
    'Walk under something rather than round it.',
    'Notice how your breathing has changed since you set out.',
    'Take the uphill option once.',
    'Stand still until somebody overtakes you twice.',
    'Walk backwards for five safe paces and see what was behind you.',
    'Put your phone away entirely for the next five minutes.'
  ]);

  /* ---- reframing ---- */
  g('sqam', '', [
    'Pick a building and decide what it would be in another century.',
    'Look at this street as if you had arrived from far away today.',
    'Decide which building here is the kindest.',
    'Choose the flat you would live in and pick the room.',
    'Find the view a painter would have chosen and stand in it.',
    'Decide what this street smells of in July.',
    'Work out where the money went on this street.',
    'Find the thing here that would be in a museum in two hundred years.',
    'Pick the building that will still be standing longest.',
    'Decide what this place was before anything was built on it.',
    'Find something ordinary and look at it for a full thirty seconds.',
    'Choose the best doorway to shelter in during a downpour.',
    'Decide who this street was designed for and whether it worked.',
    'Find the thing here you would miss if it went.',
    'Name this street something truer than its name.',
    'Find a detail nobody was paid enough to add.'
  ]);

  /* ---- sky and weather ---- */
  g('sqm', '', [
    'Find the biggest piece of sky on this walk and stand under it.',
    'Find where the wind is coming from without looking at anything moving.',
    'Find a cloud and follow it until a building takes it.',
    'Notice what the weather is doing to the colour of the brick.',
    'Find a gap between buildings framing something worth framing.',
    'Find the highest point you can see and orient yourself by it.',
    'Notice whether the air smells of what is coming.',
    'Find a rooftop you would like to stand on.',
    'Find the piece of sky with the most going on in it.',
    'Watch a plane, a bird or a crane cross a gap between roofs.',
    'Find shelter you could reach in ten seconds.',
    'Notice the temperature change as you turn a corner.',
    'Find where the sun is without looking at it.',
    'Find the first star, if there is one.'
  ]);

  /* ---- time of day, tagged ---- */
  g('sqm', 'dawn', [
    'Find what has been delivered and not yet collected.',
    'Find somebody who has been awake much longer than you.',
    'Find the first shop light of the day.',
    'Notice how different this street sounds before it fills up.',
    'Find frost, dew or damp on one thing and not its neighbour.'
  ]);
  g('sqlm', 'dusk', [
    'Watch the streetlights decide it is time.',
    'Find the first window to light up on a whole facade.',
    'Find the colour the sky is doing behind the roofline and hold it.',
    'Find a building that looks better now than it did at noon.',
    'Notice how the crowd changes direction at this hour.'
  ]);
  g('sqm', 'night', [
    'Find the best-lit thing that nobody is looking at.',
    'Find a light left on in an empty room.',
    'Find where the dark is deepest and decide whether to go there.',
    'Find a sign that is only alive at night.',
    'Find the quietest lit street within reach.',
    'Notice which windows have their curtains open and what that says.'
  ]);
  g('sqlam', 'early', [
    'Set a direction in your head for this walk: a colour, a shape, a word. Keep it.',
    'Decide now which of your senses is doing the work today.',
    'Look back at where you started and fix it in your memory.'
  ]);
  g('sqlam', 'late', [
    'Find one thing to take home in your head rather than your pocket.',
    'Pick the single best thing you have seen so far and say why.',
    'Find the moment this walk turned into a good one.',
    'Look back the way you came and see it as a stranger would.'
  ]);
  g('sqlam', 'far', [
    'You are further from home than you have been today. Look around properly.',
    'Find something here that does not exist near where you live.',
    'Work out which direction home is before the app tells you.'
  ]);
  g('sqlam', 'near', [
    'Find something on your own street you have never looked at.',
    'Find the thing nearest home that you could not describe to somebody.'
  ]);

  /* ---- stable ids from the text, so the deck can grow without losing your history ---- */
  function hash(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  }
  const seen = new Set();
  for (const p of ALL) {
    p.id = 'q' + hash(p.t);
    if (seen.has(p.id)) console.warn('duplicate prompt', p.t);
    seen.add(p.id);
  }

  const byId = id => ALL.find(p => p.id === id) || null;

  /** Cards eligible for a mood and a context, best first. Unseen beats seen; seen once beats seen twice. */
  function pool(mood, ctx) {
    const letter = { surprise: 's', quiet: 'q', lively: 'l', grid: 'a', slow: 'm' }[mood] || 's';
    return ALL.filter(p => p.m.includes(letter))
              .filter(p => !p.c || ctx.includes(p.c));
  }

  /** Pick one card, avoiding `exclude` ids, weighted hard toward cards you have never met. */
  function draw(mood, ctx, exclude, rnd) {
    let cand = pool(mood, ctx).filter(p => !exclude.includes(p.id));
    if (!cand.length) cand = ALL.filter(p => !exclude.includes(p.id));
    if (!cand.length) return null;
    const scored = cand.map(p => {
      const s = Store.seenCount(p.id), d = Store.doneCount(p.id);
      const loved = Store.isLoved(p.id) ? 1.8 : 1;
      return { p, w: loved / (1 + s * 2.2 + d * 3.4) };
    });
    const total = scored.reduce((a, b) => a + b.w, 0);
    let r = (rnd ? rnd() : Math.random()) * total;
    for (const s of scored) { r -= s.w; if (r <= 0) return s.p; }
    return scored[scored.length - 1].p;
  }

  /** The context tags true right now, for a walk that is `frac` of the way through. */
  function context(frac, nearStart, when) {
    const h = (when || new Date()).getHours();
    const c = [];
    if (h >= 4 && h < 8) c.push('dawn');
    else if (h >= 8 && h < 17) c.push('day');
    else if (h >= 17 && h < 21) c.push('dusk');
    else c.push('night');
    if (frac < 0.34) c.push('early');
    if (frac > 0.66) c.push('late');
    c.push(nearStart ? 'near' : 'far');
    return c;
  }

  const MOODNAME = { s: 'Surprise me', q: 'Quiet', l: 'Lively', a: 'Architectural', m: 'Melancholy' };

  return { ALL, byId, draw, pool, context, size: ALL.length, MOODNAME };
})();
