/* A sample high street, so the app can be understood before you have surveyed anything.
   Every place in here is invented. The names are not real businesses, the numbers are not
   measurements of anywhere, and the whole pack can be removed in one tap from Settings.
   It is labelled as a sample everywhere it appears. */
const Sample = (() => {
  const DAY = 86400000;
  const PACK = 'Harbourgate sample pack';

  // A fictional stretch of street. If the device has given a position, the sample sits near it
  // so distance sorting can be seen working; otherwise it keeps these coordinates.
  const ANCHOR = { lat: 53.4012, lng: -2.9885 };

  const PLACES = [
    { id: 'smp-coffee', name: 'Harbourgate Coffee', kind: 'Cafe', area: 'Sample: Harbourgate Street',
      d: [40, 20], note: 'Counter is low on the left hand side.' },
    { id: 'smp-library', name: 'Marlow Street Library', kind: 'Library', area: 'Sample: Marlow Street',
      d: [-90, 140], note: '' },
    { id: 'smp-ledger', name: 'The Ledger', kind: 'Bar', area: 'Sample: Harbourgate Street',
      d: [120, -60], note: 'Side door on Quay Lane is sometimes unlocked, ask.' },
    { id: 'smp-kettle', name: 'Kettle and Crumb', kind: 'Cafe', area: 'Sample: Quay Lane',
      d: [-160, -40], note: '' },
    { id: 'smp-pharm', name: 'Wickstead Pharmacy', kind: 'Pharmacy', area: 'Sample: Marlow Street',
      d: [210, 180], note: '' },
    { id: 'smp-orangery', name: 'The Orangery', kind: 'Restaurant', area: 'Sample: Granby Park',
      d: [-320, 380], note: 'Ramp is round the side, past the bins.' },
    { id: 'smp-sable', name: 'Sable Fish Bar', kind: 'Restaurant', area: 'Sample: Quay Lane',
      d: [90, -240], note: '' },
    { id: 'smp-clinic', name: 'Ivy Court Clinic', kind: 'Clinic', area: 'Sample: Ivy Court',
      d: [-540, 60], note: '' }
  ];

  const SURVEYS = [
    { p: 'smp-coffee', by: 'you', days: 11, slot: 'morning', secs: 96, f: {
      'entrance.steps': 0, 'entrance.door_width_cm': 86, 'entrance.door_type': 'light',
      'entrance.threshold': 'flush', 'entrance.route': 'level',
      'bathroom.exists': 'yes', 'bathroom.step_free': 'yes', 'bathroom.accessible': 'yes',
      'bathroom.grab_bars': 'both', 'bathroom.turning_space': 'roomy', 'bathroom.door_width_cm': 82,
      'inside.circulation': 'okay', 'inside.floor': 'level', 'inside.seating': 'movable',
      'inside.table_height': 'varied', 'inside.wait_seat': 'yes',
      'sensory.noise': 'quiet', 'sensory.music': 'background', 'sensory.lighting': 'soft',
      'sensory.crowding': 'calm', 'sensory.retreat': 'yes', 'vision.print': 'standard',
      'staff.response': 'knew', 'staff.assistance': 'yes' } },
    { p: 'smp-coffee', by: PACK, days: 64, slot: 'evening', secs: 88, f: {
      'entrance.steps': 0, 'entrance.door_width_cm': 85, 'entrance.threshold': 'flush',
      'bathroom.accessible': 'yes', 'bathroom.grab_bars': 'both',
      'sensory.noise': 'moderate', 'sensory.crowding': 'busy', 'sensory.music': 'background',
      'hearing.loop': 'no' } },

    { p: 'smp-library', by: PACK, days: 26, slot: 'afternoon', secs: 104, f: {
      'entrance.steps': 0, 'entrance.door_width_cm': 104, 'entrance.door_type': 'auto',
      'entrance.threshold': 'flush', 'entrance.route': 'level',
      'bathroom.exists': 'yes', 'bathroom.step_free': 'yes', 'bathroom.accessible': 'yes',
      'bathroom.grab_bars': 'both', 'bathroom.turning_space': 'roomy', 'bathroom.door_width_cm': 90,
      'inside.circulation': 'generous', 'inside.floor': 'level', 'inside.seating': 'movable',
      'inside.table_height': 'varied', 'inside.wait_seat': 'yes',
      'sensory.noise': 'quiet', 'sensory.music': 'none', 'sensory.lighting': 'bright',
      'sensory.crowding': 'calm', 'sensory.retreat': 'yes',
      'vision.print': 'large', 'vision.markings': 'yes', 'hearing.loop': 'yes',
      'staff.response': 'knew', 'staff.assistance': 'yes' } },

    { p: 'smp-ledger', by: 'you', days: 38, slot: 'evening', secs: 79, f: {
      'entrance.steps': 1, 'entrance.step_height_cm': 14, 'entrance.ramp': 'none',
      'entrance.door_width_cm': 74, 'entrance.door_type': 'heavy', 'entrance.threshold': 'lip',
      'entrance.route': 'level',
      'bathroom.exists': 'yes', 'bathroom.step_free': 'no', 'bathroom.accessible': 'no',
      'bathroom.grab_bars': 'none', 'bathroom.turning_space': 'tight',
      'inside.circulation': 'tight', 'inside.floor': 'level', 'inside.seating': 'fixed',
      'inside.table_height': 'high', 'inside.wait_seat': 'no',
      'sensory.noise': 'loud', 'sensory.music': 'loud', 'sensory.lighting': 'dim',
      'sensory.crowding': 'packed', 'sensory.retreat': 'no', 'vision.print': 'small',
      'vision.markings': 'no', 'hearing.loop': 'no', 'staff.response': 'willing' } },
    { p: 'smp-ledger', by: PACK, days: 150, slot: 'afternoon', secs: 71, f: {
      'entrance.steps': 1, 'entrance.step_height_cm': 15, 'entrance.ramp': 'none',
      'entrance.door_width_cm': 75, 'sensory.noise': 'moderate', 'sensory.crowding': 'calm',
      'sensory.music': 'background' } },

    { p: 'smp-kettle', by: 'you', days: 5, slot: 'midday', secs: 112, f: {
      'entrance.steps': 1, 'entrance.step_height_cm': 9, 'entrance.ramp': 'portable',
      'entrance.door_width_cm': 79, 'entrance.door_type': 'light', 'entrance.threshold': 'lip',
      'entrance.route': 'level',
      'bathroom.exists': 'yes', 'bathroom.step_free': 'yes', 'bathroom.accessible': 'no',
      'bathroom.grab_bars': 'one', 'bathroom.turning_space': 'tight', 'bathroom.door_width_cm': 66,
      'inside.circulation': 'tight', 'inside.floor': 'level', 'inside.seating': 'mixed',
      'inside.table_height': 'varied', 'inside.wait_seat': 'no',
      'sensory.noise': 'moderate', 'sensory.music': 'background', 'sensory.lighting': 'bright',
      'sensory.crowding': 'busy', 'sensory.retreat': 'no', 'vision.print': 'standard',
      'staff.response': 'helped', 'staff.assistance': 'yes' } },

    { p: 'smp-pharm', by: PACK, days: 47, slot: 'morning', secs: 68, f: {
      'entrance.steps': 0, 'entrance.door_width_cm': 92, 'entrance.door_type': 'auto',
      'entrance.threshold': 'flush', 'entrance.route': 'level',
      'bathroom.exists': 'no',
      'inside.circulation': 'okay', 'inside.floor': 'level', 'inside.wait_seat': 'yes',
      'sensory.noise': 'quiet', 'sensory.music': 'none', 'sensory.lighting': 'harsh',
      'sensory.crowding': 'calm', 'vision.print': 'small', 'hearing.loop': 'yes',
      'staff.response': 'knew' } },

    { p: 'smp-orangery', by: PACK, days: 19, slot: 'evening', secs: 121, f: {
      'entrance.steps': 2, 'entrance.step_height_cm': 12, 'entrance.ramp': 'fixed',
      'entrance.door_width_cm': 88, 'entrance.door_type': 'heavy', 'entrance.threshold': 'flush',
      'entrance.route': 'slope',
      'bathroom.exists': 'yes', 'bathroom.step_free': 'yes', 'bathroom.accessible': 'yes',
      'bathroom.grab_bars': 'one', 'bathroom.turning_space': 'tight', 'bathroom.door_width_cm': 78,
      'inside.circulation': 'generous', 'inside.floor': 'level', 'inside.seating': 'movable',
      'inside.table_height': 'varied', 'inside.wait_seat': 'yes',
      'sensory.noise': 'loud', 'sensory.music': 'background', 'sensory.lighting': 'dim',
      'sensory.crowding': 'busy', 'sensory.retreat': 'no', 'vision.print': 'small',
      'vision.markings': 'yes', 'staff.response': 'helped', 'staff.assistance': 'yes' } },

    { p: 'smp-sable', by: 'you', days: 3, slot: 'evening', secs: 41, f: {
      'entrance.steps': 2, 'entrance.step_height_cm': 16, 'entrance.ramp': 'none',
      'entrance.route': 'level' } },

    { p: 'smp-clinic', by: PACK, days: 424, slot: 'morning', secs: 133, f: {
      'entrance.steps': 0, 'entrance.door_width_cm': 96, 'entrance.door_type': 'auto',
      'entrance.threshold': 'flush', 'entrance.route': 'level',
      'bathroom.exists': 'yes', 'bathroom.step_free': 'yes', 'bathroom.accessible': 'yes',
      'bathroom.grab_bars': 'both', 'bathroom.turning_space': 'roomy', 'bathroom.door_width_cm': 86,
      'inside.circulation': 'generous', 'inside.floor': 'level', 'inside.seating': 'mixed',
      'inside.wait_seat': 'yes', 'sensory.noise': 'quiet', 'sensory.music': 'none',
      'sensory.lighting': 'bright', 'sensory.crowding': 'calm', 'vision.print': 'large',
      'vision.markings': 'yes', 'hearing.loop': 'yes', 'staff.response': 'knew' } }
  ];

  const CONFIRMS = [
    { p: 'smp-library', by: 'you', days: 8 },
    { p: 'smp-coffee', by: 'you', days: 4 },
    { p: 'smp-orangery', by: 'you', days: 12 }
  ];

  const LISTS = [
    { id: 'smp-list-1', title: 'Sample: places that work on a bad day',
      ids: ['smp-coffee', 'smp-library', 'smp-pharm'] }
  ];

  /* The flag, not the id, is what makes a place part of the sample. A pack from somebody who had
     the sample loaded arrives with the same ids but without the flag, so removing your sample can
     never take their places with it. */
  function installed() {
    return Store.places().some(p => p.sample);
  }

  function install() {
    if (installed()) return false;
    const haveP = new Set(Store.db().places.map(p => p.id));
    // Every sample id can already be here, out of a pack somebody sent or a restored backup.
    // Flagging those as the sample would claim records that are not ours to remove, so the
    // honest answer is that there is nothing to install.
    if (!PLACES.some(p => !haveP.has(p.id))) return false;
    const haveS = new Set(Store.db().surveys.map(s => s.id));
    const haveC = new Set(Store.db().confirms.map(c => c.id));
    const haveL = new Set(Store.db().lists.map(l => l.id));
    const fix = Geo.last();
    const base = fix ? { lat: fix.lat, lng: fix.lng } : ANCHOR;
    const db = Store.db();
    for (const p of PLACES) {
      if (haveP.has(p.id)) continue;
      db.places.push({
        id: p.id, name: p.name, kind: p.kind, area: p.area, note: p.note,
        lat: base.lat + p.d[1] / 111320,
        lng: base.lng + p.d[0] / (111320 * Math.cos(base.lat * Math.PI / 180)),
        at: Date.now() - 200 * DAY, sample: true
      });
    }
    for (let i = 0; i < SURVEYS.length; i++) {
      const s = SURVEYS[i];
      if (haveS.has('smp-s' + i) || !db.places.some(p => p.id === s.p)) continue;
      db.surveys.push({
        id: 'smp-s' + i, placeId: s.p, at: Date.now() - s.days * DAY, by: s.by,
        slot: s.slot, seconds: s.secs, facts: s.f, photos: []
      });
    }
    for (let i = 0; i < CONFIRMS.length; i++) {
      const c = CONFIRMS[i];
      if (haveC.has('smp-c' + i)) continue;
      db.confirms.push({ id: 'smp-c' + i, placeId: c.p, at: Date.now() - c.days * DAY, by: c.by });
    }
    for (const l of LISTS) {
      if (haveL.has(l.id)) continue;
      db.lists.push({ id: l.id, title: l.title, placeIds: l.ids.slice(), at: Date.now() - 30 * DAY });
    }
    Store.set('sample', true);
    Store.saveNow();
    return true;
  }

  function remove() {
    const db = Store.db();
    const mine = new Set(db.places.filter(p => p.sample).map(p => p.id));
    db.places = db.places.filter(p => !mine.has(p.id));
    db.surveys = db.surveys.filter(s => !mine.has(s.placeId));
    db.confirms = db.confirms.filter(c => !mine.has(c.placeId));
    db.lists = db.lists.filter(l => l.id.indexOf('smp-list') !== 0);
    db.lists.forEach(l => { l.placeIds = l.placeIds.filter(x => !mine.has(x)); });
    Store.set('sample', false);
    Store.saveNow();
  }

  return { install, remove, installed, PACK };
})();
