/* Everything Greenroom says that was written rather than measured: the
   occasions, the warm-up prompts, the structure notes per occasion, and the
   plain descriptions of the four rooms. All of it ships inside the app. */

const Content = (() => {

  const OCCASIONS = [
    { id: 'talk',    name: 'A talk',     blurb: 'Conference, all-hands, lecture' },
    { id: 'toast',   name: 'A toast',    blurb: 'Wedding, birthday, leaving do' },
    { id: 'defense', name: 'A defence',  blurb: 'Thesis, viva, review panel' },
    { id: 'interview', name: 'An answer', blurb: 'Interview question, pitch' },
    { id: 'freeform', name: 'Just practice', blurb: 'No occasion, just reps' }
  ];

  const occ = id => OCCASIONS.find(o => o.id === id) || OCCASIONS[4];

  const AUDIENCES = [
    { id: 'none',     name: 'Empty room', short: 'no audience',     blurb: 'A bare stage and a light. Nothing to read, nothing to please.' },
    { id: 'friendly', name: 'Friendly',   short: 'friendly room',   blurb: 'They want you to do well. They nod early and forgive a stumble.' },
    { id: 'bored',    name: 'Bored',      short: 'bored room',      blurb: 'The four o clock room. Attention has to be earned, and it drifts back to phones.' },
    { id: 'hostile',  name: 'Sceptical',  short: 'sceptical room',  blurb: 'Arms folded, waiting to be convinced. They lean in only when you land something.' }
  ];

  const aud = id => AUDIENCES.find(a => a.id === id) || AUDIENCES[0];

  /* Warm-up prompts for a first take, or for a day with no speech to work on. */
  const PROMPTS = [
    { text: 'Tell me about a place you love.', sub: 'Sixty seconds. No preparation, no script.' },
    { text: 'Explain what you do to a clever twelve year old.', sub: 'Sixty seconds. Plain words only.' },
    { text: 'Describe the last time you changed your mind about something.', sub: 'Sixty seconds. Start in the middle.' },
    { text: 'Argue for a food you love that other people find strange.', sub: 'Sixty seconds. Commit to it.' },
    { text: 'Tell the story of a small thing that went wrong today.', sub: 'Sixty seconds. Find the turn.' },
    { text: 'Say why the work you are doing now matters.', sub: 'Sixty seconds. No jargon.' }
  ];

  function promptFor(n) { return PROMPTS[Math.abs(n | 0) % PROMPTS.length]; }

  /* Structure notes, shown on the speech screen. Written as reminders, not rules. */
  const STRUCTURE = {
    talk: [
      'Open on the thing that surprised you, not on your name and title.',
      'One idea per section, and say the idea out loud before the evidence.',
      'Slow down where the material is hardest. That is where a room drops out.',
      'Land the close before you thank anyone.'
    ],
    toast: [
      'Name the couple, name yourself, and get out of the introduction in twenty seconds.',
      'One story, told properly, beats three told quickly.',
      'Put the laugh before the turn, and let the turn be short.',
      'Raise the glass on a full stop, not on a trailing sentence.'
    ],
    defense: [
      'State the question, the claim and the contribution in the first ninety seconds.',
      'Say the limitation before the panel does.',
      'When you reach a result you know cold, resist the urge to speed up.',
      'End on what you would do next, not on an apology.'
    ],
    interview: [
      'Set the situation in two sentences. No more.',
      'Say what you did, in the first person, not what the team did.',
      'The result is the part everyone rushes. Give it a number and a beat.',
      'Stop when you are finished. Silence is the job of the person asking.'
    ],
    freeform: [
      'Start before you feel ready. The first thirty seconds are always the worst.',
      'Aim for one deliberate pause per minute.',
      'Say the last word of a sentence as clearly as the first.'
    ]
  };

  const structure = id => STRUCTURE[id] || STRUCTURE.freeform;

  return { OCCASIONS, occ, AUDIENCES, aud, PROMPTS, promptFor, structure };
})();
