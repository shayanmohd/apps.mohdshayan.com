/* The lens engine. One set of facts, several ways of reading it.
   A module is a need, its parameters are your thresholds, and its rules turn composed facts
   into a verdict with the reasons written out. Nothing here is a score: every line a lens
   produces names the fact it came from, so you can disagree with it. */
const Lens = (() => {

  const LEVELS = { ok: 0, unknown: 1, check: 2, blocked: 3 };
  const VERDICT = {
    ok:      { label: 'Works for you',  mark: 'ok',      short: 'Works' },
    check:   { label: 'Check first',    mark: 'check',   short: 'Check' },
    blocked: { label: 'Does not work',  mark: 'blocked', short: 'No' },
    unknown: { label: 'Not enough yet', mark: 'unknown', short: 'Thin' }
  };

  const num = v => (v === undefined || v === null || v === '' ? null : Number(v));

  const MODULES = [
    {
      type: 'wheeled',
      name: 'Wheeled mobility',
      blurb: 'Wheelchair, powerchair or scooter. Thresholds, widths and the toilet.',
      params: [
        { k: 'maxStep', label: 'A step I can get over', type: 'choice', def: 0, opts: [
          { v: 0, label: 'None at all' }, { v: 2, label: 'Up to 2 cm' },
          { v: 5, label: 'Up to 5 cm' }, { v: 10, label: 'Up to 10 cm' }] },
        { k: 'minDoor', label: 'Narrowest door I fit through', type: 'choice', def: 75, opts: [
          { v: 70, label: '70 cm' }, { v: 75, label: '75 cm' }, { v: 80, label: '80 cm' }, { v: 85, label: '85 cm' }] },
        { k: 'toilet', label: 'An accessible toilet', type: 'choice', def: 'must', opts: [
          { v: 'must', label: 'I need one' }, { v: 'prefer', label: 'Prefer one' },
          { v: 'skip', label: 'Not a factor' }] }
      ],
      decisive: ['entrance.steps', 'entrance.door_width_cm', 'bathroom.accessible'],
      run(v, p, r) {
        const steps = num(v('entrance.steps'));
        const ramp = v('entrance.ramp');
        const h = num(v('entrance.step_height_cm'));
        if (steps === null) r('unknown', 'entrance.steps', 'Nobody has surveyed the way in.');
        else if (steps === 0) r('ok', 'entrance.steps', 'Level in at the door.');
        else if (ramp === 'fixed' || ramp === 'lift') {
          r('ok', 'entrance.ramp', (ramp === 'fixed' ? 'A permanent ramp' : 'A platform lift') + ' gets you past the ' + (steps === 1 ? 'step' : steps + ' steps') + '.');
        } else if (ramp === 'portable') {
          r('check', 'entrance.ramp', 'A portable ramp, so somebody has to be there to put it out.');
        } else if (h !== null && h <= p.maxStep) {
          r('check', 'entrance.step_height_cm', 'One ' + h + ' cm step, inside the ' + p.maxStep + ' cm you set.');
        } else if (h !== null) {
          r('blocked', 'entrance.step_height_cm', (steps === 1 ? 'One step' : steps + ' steps') + ', ' + h + ' cm, no ramp.');
        } else {
          r('check', 'entrance.steps', (steps === 1 ? 'One step' : steps + ' steps') + ' and no ramp. Nobody measured the height.');
        }

        const w = num(v('entrance.door_width_cm'));
        if (w === null) r('unknown', 'entrance.door_width_cm', 'The door has not been measured.');
        else if (w + 2 < p.minDoor) r('blocked', 'entrance.door_width_cm', 'The opening is about ' + w + ' cm, under the ' + p.minDoor + ' cm you need.');
        else if (w < p.minDoor + 3) r('check', 'entrance.door_width_cm', 'About ' + w + ' cm at the door, which is tight against your ' + p.minDoor + ' cm.');

        const route = v('entrance.route');
        if (route === 'stairs') r('blocked', 'entrance.route', 'Stairs on the way from the street.');
        else if (route === 'steep') r('check', 'entrance.route', 'A steep slope up to the door.');
        if (v('entrance.threshold') === 'high') r('check', 'entrance.threshold', 'A raised threshold over 2 cm in the doorway.');
        if (v('entrance.door_type') === 'revolving') r('check', 'entrance.door_type', 'A revolving door. Look for the side door.');

        if (p.toilet !== 'skip') {
          const hard = p.toilet === 'must';
          const ex = v('bathroom.exists');
          const acc = v('bathroom.accessible');
          if (ex === 'no') r('check', 'bathroom.exists', 'No customer toilet at all.');
          else if (acc === 'no') r(hard ? 'blocked' : 'check', 'bathroom.accessible', 'No cubicle built for wheelchair use.');
          else if (acc === 'yes') {
            if (v('bathroom.step_free') === 'no') r(hard ? 'blocked' : 'check', 'bathroom.step_free', 'The toilet has steps on the way to it.');
            else if (v('bathroom.turning_space') === 'no') r(hard ? 'blocked' : 'check', 'bathroom.turning_space', 'No room to turn inside the toilet.');
            else if (v('bathroom.turning_space') === 'tight') r('check', 'bathroom.turning_space', 'The toilet is tight to turn in.');
            else r('ok', 'bathroom.accessible', 'An accessible toilet, turning space and all.');
            const bw = num(v('bathroom.door_width_cm'));
            if (bw !== null && bw + 2 < p.minDoor) r('check', 'bathroom.door_width_cm', 'The toilet door is about ' + bw + ' cm.');
          } else r('unknown', 'bathroom.accessible', 'The toilet has not been surveyed.');
        }

        const circ = v('inside.circulation');
        if (circ === 'tight') r('check', 'inside.circulation', 'Tight between the tables inside.');
        else if (circ === 'generous') r('ok', 'inside.circulation', 'Generous room to move inside.');
        if (v('inside.floor') === 'steps') r('check', 'inside.floor', 'Steps between areas inside.');
        if (v('inside.table_height') === 'high') r('check', 'inside.table_height', 'High tables only.');
      }
    },

    {
      type: 'ambulatory',
      name: 'Walking, with limits',
      blurb: 'Sticks, crutches, painful joints, a bad day. Steps, rails and somewhere to sit.',
      params: [
        { k: 'steps', label: 'Steps I can manage', type: 'choice', def: 'few', opts: [
          { v: 'none', label: 'None' }, { v: 'few', label: 'One or two' }, { v: 'flight', label: 'A short flight' }] },
        { k: 'seat', label: 'Somewhere to sit soon after arriving', type: 'choice', def: 'yes', opts: [
          { v: 'yes', label: 'I need one' }, { v: 'no', label: 'Not a factor' }] }
      ],
      decisive: ['entrance.steps', 'inside.seating'],
      run(v, p, r) {
        const steps = num(v('entrance.steps'));
        const cap = p.steps === 'none' ? 0 : p.steps === 'few' ? 2 : 3;
        if (steps === null) r('unknown', 'entrance.steps', 'Nobody has surveyed the way in.');
        else if (steps === 0) r('ok', 'entrance.steps', 'Level in at the door.');
        else if (steps > cap) r(p.steps === 'none' ? 'blocked' : 'check', 'entrance.steps', (steps >= 3 ? 'Three or more steps' : steps + ' steps') + ' at the door, more than you set.');
        else r('check', 'entrance.steps', (steps === 1 ? 'One step' : steps + ' steps') + ' at the door, within what you set.');

        if (v('entrance.route') === 'steep') r('check', 'entrance.route', 'A steep slope up to the door.');
        if (v('entrance.door_type') === 'heavy') r('check', 'entrance.door_type', 'A heavy door to push.');
        if (v('inside.floor') === 'steps') r('check', 'inside.floor', 'Steps between areas inside.');

        if (p.seat === 'yes') {
          const seat = v('inside.seating');
          if (seat === undefined) r('unknown', 'inside.seating', 'The seating has not been surveyed.');
          else if (seat === 'fixed') r('check', 'inside.seating', 'Fixed benches only, so no choosing where you sit.');
          else r('ok', 'inside.seating', seat === 'movable' ? 'Chairs that move.' : 'Some loose chairs among the fixed seats.');
          if (v('inside.wait_seat') === 'no') r('check', 'inside.wait_seat', 'Nowhere to sit while you wait.');
          if (v('bathroom.grab_bars') === 'both') r('ok', 'bathroom.grab_bars', 'Grab bars on both sides in the toilet.');
        }
      }
    },

    {
      type: 'sensory',
      name: 'Sound and crowding',
      blurb: 'Noise, music, lighting and how packed it gets. What a survey found, and when.',
      params: [
        { k: 'noise', label: 'Noise I can be in', type: 'choice', def: 'moderate', opts: [
          { v: 'quiet', label: 'Quiet only' }, { v: 'moderate', label: 'Moderate is fine' },
          { v: 'loud', label: 'Loud is fine' }] },
        { k: 'crowd', label: 'Crowding I can be in', type: 'choice', def: 'busy', opts: [
          { v: 'calm', label: 'Calm only' }, { v: 'busy', label: 'Busy is fine' }, { v: 'packed', label: 'Anything' }] },
        { k: 'light', label: 'Harsh or flickering light', type: 'choice', def: 'avoid', opts: [
          { v: 'avoid', label: 'A problem for me' }, { v: 'ok', label: 'Not a factor' }] }
      ],
      decisive: ['sensory.noise', 'sensory.crowding'],
      run(v, p, r, c) {
        const rank = { quiet: 0, moderate: 1, loud: 2, very: 3 };
        const cap = { quiet: 0, moderate: 1, loud: 2 }[p.noise];
        const n = v('sensory.noise');
        if (n === undefined) r('unknown', 'sensory.noise', 'Nobody has recorded how loud it is.');
        else if (rank[n] <= cap) r('ok', 'sensory.noise', Store.say('sensory.noise', n) + '.');
        else {
          const kinder = (c.facts['sensory.noise'] && c.facts['sensory.noise'].slots || [])
            .filter(s => rank[s.v] <= cap);
          if (kinder.length) r('check', 'sensory.noise', Store.say('sensory.noise', n) + ' when it was surveyed, but ' + Store.slotLabel(kinder[0].slot).toLowerCase() + ' was ' + Store.say('sensory.noise', kinder[0].v).toLowerCase() + '.');
          else r(rank[n] - cap > 1 ? 'blocked' : 'check', 'sensory.noise', Store.say('sensory.noise', n) + ', over what you set.');
        }

        const crank = { calm: 0, busy: 1, packed: 2 };
        const ccap = { calm: 0, busy: 1, packed: 2 }[p.crowd];
        const cr = v('sensory.crowding');
        if (cr === undefined) r('unknown', 'sensory.crowding', 'Nobody has recorded how busy it gets.');
        else if (crank[cr] > ccap) r('check', 'sensory.crowding', Store.say('sensory.crowding', cr) + ' when it was surveyed.');

        if (v('sensory.music') === 'loud') r('check', 'sensory.music', 'Loud music.');
        if (p.light === 'avoid') {
          const l = v('sensory.lighting');
          if (l === 'harsh') r('check', 'sensory.lighting', 'Harsh or flickering light.');
          else if (l === 'soft') r('ok', 'sensory.lighting', 'Soft, even light.');
        }
        if (v('sensory.retreat') === 'yes') r('ok', 'sensory.retreat', 'There is a quieter corner.');
      }
    },

    {
      type: 'lowvision',
      name: 'Low vision',
      blurb: 'Light levels, print size and whether step edges are marked.',
      params: [
        { k: 'print', label: 'Large print menus and signs', type: 'choice', def: 'need', opts: [
          { v: 'need', label: 'I need them' }, { v: 'prefer', label: 'Prefer them' }] },
        { k: 'dim', label: 'Dim rooms', type: 'choice', def: 'avoid', opts: [
          { v: 'avoid', label: 'Hard for me' }, { v: 'ok', label: 'Not a factor' }] }
      ],
      decisive: ['sensory.lighting', 'vision.print'],
      run(v, p, r) {
        const l = v('sensory.lighting');
        if (l === undefined) r('unknown', 'sensory.lighting', 'The lighting has not been surveyed.');
        else if (l === 'dim' && p.dim === 'avoid') r('check', 'sensory.lighting', 'A dim room.');
        else if (l === 'bright' || l === 'soft') r('ok', 'sensory.lighting', Store.say('sensory.lighting', l) + '.');
        else if (l === 'harsh') r('check', 'sensory.lighting', 'Harsh or flickering light, hard to read under.');

        const pr = v('vision.print');
        if (pr === undefined) r('unknown', 'vision.print', 'Nobody has noted the menus or the signs.');
        else if (pr === 'small') r(p.print === 'need' ? 'check' : 'ok', 'vision.print', 'Small or low contrast print.');
        else if (pr === 'large') r('ok', 'vision.print', 'Large, high contrast print.');

        const steps = num(v('entrance.steps'));
        if (steps > 0 && v('vision.markings') === 'no') r('check', 'vision.markings', 'Step edges are not marked.');
        else if (v('vision.markings') === 'yes') r('ok', 'vision.markings', 'Step edges are marked.');
      }
    },

    {
      type: 'hearing',
      name: 'Hearing',
      blurb: 'Loops, background noise and whether you can lip read across a counter.',
      params: [
        { k: 'loop', label: 'A hearing loop', type: 'choice', def: 'want', opts: [
          { v: 'want', label: 'I look for one' }, { v: 'skip', label: 'Not a factor' }] },
        { k: 'lipread', label: 'Quiet enough to lip read', type: 'choice', def: 'need', opts: [
          { v: 'need', label: 'I need it' }, { v: 'skip', label: 'Not a factor' }] }
      ],
      decisive: ['hearing.loop', 'sensory.noise'],
      run(v, p, r) {
        if (p.loop === 'want') {
          const lp = v('hearing.loop');
          if (lp === 'yes') r('ok', 'hearing.loop', 'A signed hearing loop at the counter.');
          else if (lp === 'no') r('check', 'hearing.loop', 'No hearing loop was seen.');
          else r('unknown', 'hearing.loop', 'Nobody has looked for a hearing loop.');
        }
        if (p.lipread === 'need') {
          const n = v('sensory.noise');
          if (n === 'very' || n === 'loud') r('check', 'sensory.noise', Store.say('sensory.noise', n) + ', hard to follow a face across a counter.');
          else if (n === 'quiet') r('ok', 'sensory.noise', 'Quiet enough to follow a conversation.');
          if (v('sensory.music') === 'loud') r('check', 'sensory.music', 'Loud music over the top of it.');
          if (v('sensory.lighting') === 'dim') r('check', 'sensory.lighting', 'A dim room, harder to read a face in.');
        }
      }
    }
  ];

  const MOD = Object.fromEntries(MODULES.map(m => [m.type, m]));

  function defaults(type) {
    const m = MOD[type]; if (!m) return {};
    return Object.fromEntries(m.params.map(p => [p.k, p.def]));
  }

  function active(lens) {
    const l = lens || Store.lens();
    if (l.everyone) return [];
    return (l.modules || []).filter(m => MOD[m.type]);
  }

  /* The verdict for one place under one lens. */
  function verdict(composed, lens) {
    const mods = active(lens);
    if (!mods.length) return null;
    const v = k => (composed.facts[k] ? composed.facts[k].v : undefined);
    const reasons = [];
    for (const m of mods) {
      const def = MOD[m.type];
      const params = Object.assign(defaults(m.type), m.params || {});
      def.run(v, params, (level, k, text) => reasons.push({ level, k, text, module: def.type }), composed);
    }
    let level = 'ok';
    for (const r of reasons) if (LEVELS[r.level] > LEVELS[level]) level = r.level;
    if (!reasons.length) level = 'unknown';
    // Freshness decay: an answer nobody has seen for a year is not an answer you can walk on.
    if (level === 'ok' && composed.age !== null && composed.age > 365 * 86400000) {
      level = 'check';
      reasons.unshift({ level: 'check', k: 'freshness', module: 'freshness',
        text: 'Everything here was last seen over a year ago. Worth confirming before you rely on it.' });
    }
    const order = { blocked: 0, check: 1, unknown: 2, ok: 3 };
    reasons.sort((a, b) => order[a.level] - order[b.level]);
    return {
      level, label: VERDICT[level].label, short: VERDICT[level].short, mark: VERDICT[level].mark,
      reasons,
      blockers: reasons.filter(r => r.level === 'blocked'),
      missing: reasons.filter(r => r.level === 'unknown').map(r => r.k)
    };
  }

  /* What this lens still needs from a place, for the check queue. */
  function gaps(composed, lens) {
    const mods = active(lens);
    const want = new Set();
    for (const m of mods) for (const k of MOD[m.type].decisive) want.add(k);
    return Array.from(want).filter(k => !composed.facts[k]);
  }

  /* Chip filters. Deliberately independent of the lens: they work before you build one. */
  const FILTERS = [
    { k: 'stepfree', label: 'Step free', test: f => {
      const s = f['entrance.steps'], r = f['entrance.ramp'];
      if (!s) return false;
      return Number(s.v) === 0 || (r && (r.v === 'fixed' || r.v === 'lift'));
    } },
    { k: 'toilet', label: 'Accessible toilet', test: f => f['bathroom.accessible'] && f['bathroom.accessible'].v === 'yes' },
    { k: 'quiet', label: 'Quiet', test: f => f['sensory.noise'] && (f['sensory.noise'].v === 'quiet' || f['sensory.noise'].v === 'moderate') },
    { k: 'light', label: 'Even light', test: f => f['sensory.lighting'] && (f['sensory.lighting'].v === 'soft' || f['sensory.lighting'].v === 'bright') },
    { k: 'seating', label: 'Loose seating', test: f => f['inside.seating'] && f['inside.seating'].v !== 'fixed' },
    { k: 'loop', label: 'Hearing loop', test: f => f['hearing.loop'] && f['hearing.loop'].v === 'yes' }
  ];

  return { MODULES, MOD, LEVELS, VERDICT, defaults, active, verdict, gaps, FILTERS };
})();
