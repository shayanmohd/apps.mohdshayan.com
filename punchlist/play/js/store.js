/* Punchlist. One localStorage record holds every structured fact; photographs and plan
   images are blobs and live in IndexedDB (media.js), keyed from here by id. */
const Store = (() => {
  const KEY = 'punchlist.v1';

  const DEFAULTS = () => ({
    v: 1,
    org: { name: '', footer: '', logo: null },
    projects: [],
    defects: [],
    contacts: [],
    reports: [],
    settings: { haptics: true, keepAwake: true, grouping: 'room', onboarded: false, activeProject: null }
  });

  const SEVERITY = [
    { k: 'safety', label: 'Safety',  hex: '#A4161A', short: 'SAF' },
    { k: 'major',  label: 'Major',   hex: '#C2410C', short: 'MAJ' },
    { k: 'normal', label: 'Normal',  hex: '#33404A', short: 'NOR' },
    { k: 'minor',  label: 'Minor',   hex: '#5F676E', short: 'MIN' }
  ];
  const SEV = Object.fromEntries(SEVERITY.map(s => [s.k, s]));

  const STATUS = [
    { k: 'open',     label: 'Open',          verb: 'Reopen' },
    { k: 'assigned', label: 'Assigned',      verb: 'Assign' },
    { k: 'claimed',  label: 'Fixed claimed', verb: 'Mark fixed' },
    { k: 'verified', label: 'Verified',      verb: 'Verify' },
    { k: 'closed',   label: 'Closed',        verb: 'Close' }
  ];
  const ST = Object.fromEntries(STATUS.map(s => [s.k, s]));
  const isDone = s => s === 'verified' || s === 'closed';

  const TRADES = ['Bricklayer', 'Carpenter', 'Decorator', 'Drylining', 'Electrician', 'Flooring',
    'Glazier', 'Groundworks', 'Joiner', 'Landscaper', 'Mechanical', 'Plasterer', 'Plumbing',
    'Roofer', 'Steelwork', 'Tiler', 'Ventilation', 'General building', 'Site tidy', 'Unassigned'];

  /* Typed once, tapped forever. This is what replaces dictation: snag notes are formulaic,
     and a tap is faster and quieter than a sentence in a stairwell. */
  const PHRASES = {
    'Bricklayer':  ['Perp joint not filled', 'Mortar smeared on face', 'Course out of level', 'Cavity not clear', 'Brick chipped'],
    'Carpenter':   ['Door binds on frame', 'Architrave gap at mitre', 'Skirting not scribed', 'Hinge not adjusted', 'Handle loose'],
    'Decorator':   ['Paint touch up required', 'Poor coverage on second coat', 'Overspray on frame', 'Filler visible through paint', 'Cut line to ceiling not straight'],
    'Drylining':   ['Board joint showing', 'Screw head proud', 'Corner bead damaged', 'Board not fixed to stud'],
    'Electrician': ['Socket not terminated', 'Faceplate loose', 'Light fitting not level', 'No power to circuit', 'Cable not clipped', 'Blank plate missing'],
    'Flooring':    ['Hollow underfoot', 'Threshold strip missing', 'Scratch to finished floor', 'Expansion gap not covered'],
    'Glazier':     ['Scratch to glass', 'Seal not continuous', 'Trickle vent missing', 'Glazing bead loose'],
    'Groundworks': ['Standing water', 'Levels not to drawing', 'Gully cover damaged', 'Backfill not compacted'],
    'Joiner':      ['Drawer front misaligned', 'Panel damaged', 'Worktop joint open', 'Soft close not adjusted'],
    'Landscaper':  ['Turf not knitted', 'Edging not straight', 'Planting bed not cleared'],
    'Mechanical':  ['Leak at connection', 'Waste not sealed', 'Trap not fitted', 'Isolation valve missing', 'Pipe not clipped', 'Radiator not level'],
    'Plasterer':   ['Crack in skim', 'Blown patch', 'Bead showing through', 'Internal angle not straight', 'Trowel mark visible'],
    'Plumbing':    ['Leak at connection', 'Waste not sealed', 'Silicone finish poor', 'Isolation valve missing', 'Tap not secure'],
    'Roofer':      ['Flashing not dressed', 'Tile slipped', 'Gutter not falling', 'Mortar bedding cracked'],
    'Steelwork':   ['Weld not painted', 'Bolt missing', 'Fire protection damaged'],
    'Tiler':       ['Cracked tile', 'Grout missing', 'Lippage between tiles', 'Silicone finish poor', 'Cut untidy at edge'],
    'Ventilation': ['Grille not fixed', 'Duct not sealed', 'Extract not running', 'Fan noisy'],
    'General building': ['Damage to finished surface', 'Not built to drawing', 'Protection not reinstated', 'Access blocked', 'Fire stopping missing'],
    'Site tidy':   ['Debris left in room', 'Packaging not removed', 'Materials stored in escape route'],
    'Unassigned':  ['Damage to finished surface', 'Incomplete work', 'Not built to drawing', 'Requires further inspection']
  };

  const ROOMS = ['Entrance', 'Hallway', 'Kitchen', 'Living room', 'Dining room', 'Bedroom 1', 'Bedroom 2',
    'Bedroom 3', 'Bathroom', 'En suite', 'WC', 'Utility', 'Store', 'Stair', 'Landing', 'Plant room',
    'Roof', 'External', 'Car park', 'Office', 'Retail floor', 'Back of house', 'Communal corridor'];

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULTS();
      const d = JSON.parse(raw);
      const base = DEFAULTS();
      return {
        v: 1,
        org: Object.assign(base.org, d.org || {}),
        projects: Array.isArray(d.projects) ? d.projects : [],
        defects: Array.isArray(d.defects) ? d.defects : [],
        contacts: Array.isArray(d.contacts) ? d.contacts : [],
        reports: Array.isArray(d.reports) ? d.reports : [],
        settings: Object.assign(base.settings, d.settings || {})
      };
    } catch (e) { return DEFAULTS(); }
  }

  let saveTimer = null;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { return false; }
  }
  function touch() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 60); }

  const uid = p => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  /* ── dates ── */
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => ymd(new Date());
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function shortDate(s) {
    if (!s) return '';
    const [y, m, d] = s.split('-').map(Number);
    return `${d} ${MON[m - 1]} ${y}`;
  }
  function longDate(s) {
    if (!s) return '';
    const [y, m, d] = s.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  function addDays(s, n) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d + n); return ymd(t); }
  /** Next occurrence of a weekday index (0 Sun .. 6 Sat), never today. */
  function nextWeekday(idx) {
    const now = new Date();
    let n = (idx - now.getDay() + 7) % 7;
    if (n === 0) n = 7;
    return addDays(today(), n);
  }
  function relDue(s) {
    if (!s) return '';
    const diff = Math.round((new Date(s + 'T00:00') - new Date(today() + 'T00:00')) / 86400000);
    if (diff < 0) return `${shortDate(s)} (${-diff} day${diff === -1 ? '' : 's'} late)`;
    if (diff === 0) return `${shortDate(s)} (today)`;
    if (diff === 1) return `${shortDate(s)} (tomorrow)`;
    return shortDate(s);
  }

  /* ── projects ── */
  const projects = () => db.projects;
  const project = id => db.projects.find(p => p.id === id) || null;
  function activeProject() {
    const id = db.settings.activeProject;
    return project(id) || null;
  }
  function setActive(id) { db.settings.activeProject = id; touch(); }

  function addProject(fields) {
    const p = Object.assign({
      id: uid('p'), name: 'Untitled project', client: '', address: '', ref: '',
      createdAt: Date.now(), lastWalked: null, plans: [], seq: 0
    }, fields);
    db.projects.unshift(p);
    touch();
    return p;
  }
  function updateProject(id, fields) {
    const p = project(id);
    if (!p) return null;
    Object.assign(p, fields);
    touch();
    return p;
  }
  function deleteProject(id) {
    const p = project(id);
    if (!p) return [];
    const media = [];
    for (const pl of p.plans) if (pl.media) media.push(pl.media);
    for (const d of db.defects.filter(d => d.projectId === id)) media.push(...d.photos.map(ph => ph.media));
    db.defects = db.defects.filter(d => d.projectId !== id);
    db.reports = db.reports.filter(r => r.projectId !== id);
    db.projects = db.projects.filter(x => x.id !== id);
    if (db.settings.activeProject === id) db.settings.activeProject = db.projects[0] ? db.projects[0].id : null;
    touch();
    return media;
  }

  function addPlan(projectId, plan) {
    const p = project(projectId);
    if (!p) return null;
    const pl = Object.assign({ id: uid('pl'), label: `Plan ${p.plans.length + 1}`, media: null, w: 0, h: 0 }, plan);
    p.plans.push(pl);
    touch();
    return pl;
  }
  function removePlan(projectId, planId) {
    const p = project(projectId);
    if (!p) return [];
    const pl = p.plans.find(x => x.id === planId);
    const media = pl && pl.media ? [pl.media] : [];
    for (const d of db.defects.filter(d => d.planId === planId)) media.push(...d.photos.map(ph => ph.media));
    db.defects = db.defects.filter(d => d.planId !== planId);
    p.plans = p.plans.filter(x => x.id !== planId);
    touch();
    return media;
  }

  /* ── defects ── */
  const defects = () => db.defects;
  const defect = id => db.defects.find(d => d.id === id) || null;
  function forProject(projectId, opts) {
    const o = opts || {};
    let list = db.defects.filter(d => d.projectId === projectId);
    if (o.planId) list = list.filter(d => d.planId === o.planId);
    if (!o.includeClosed) list = list.filter(d => d.status !== 'closed');
    if (o.trade) list = list.filter(d => (d.trade || 'Unassigned') === o.trade);
    return list.sort((a, b) => a.n - b.n);
  }

  function addDefect(fields) {
    const p = project(fields.projectId);
    if (!p) return null;
    p.seq = (p.seq || 0) + 1;
    p.lastWalked = today();
    const d = Object.assign({
      id: uid('d'), projectId: p.id, planId: null, x: .5, y: .5, n: p.seq,
      photos: [], note: '', trade: 'Unassigned', severity: 'normal',
      room: '', due: null, assignee: null, status: 'open',
      history: [{ at: Date.now(), status: 'open', text: 'Raised on the walk' }],
      createdAt: Date.now(), updatedAt: Date.now()
    }, fields);
    db.defects.push(d);
    touch();
    return d;
  }
  function updateDefect(id, fields) {
    const d = defect(id);
    if (!d) return null;
    Object.assign(d, fields, { updatedAt: Date.now() });
    touch();
    return d;
  }
  function setStatus(id, status, text) {
    const d = defect(id);
    if (!d || d.status === status) return d;
    d.status = status;
    d.history.unshift({ at: Date.now(), status, text: text || ST[status].label });
    d.updatedAt = Date.now();
    touch();
    return d;
  }
  function deleteDefect(id) {
    const d = defect(id);
    if (!d) return [];
    const media = d.photos.map(p => p.media);
    db.defects = db.defects.filter(x => x.id !== id);
    touch();
    return media;
  }

  function tally(projectId) {
    const out = { safety: 0, major: 0, normal: 0, minor: 0, open: 0, done: 0, total: 0 };
    for (const d of db.defects) {
      if (d.projectId !== projectId) continue;
      out.total++;
      if (isDone(d.status)) { out.done++; continue; }
      out.open++;
      out[d.severity] = (out[d.severity] || 0) + 1;
    }
    return out;
  }

  /* ── contacts ── */
  const contacts = () => db.contacts;
  const contact = id => db.contacts.find(c => c.id === id) || null;
  function saveContact(fields) {
    if (fields.id) {
      const c = contact(fields.id);
      if (c) { Object.assign(c, fields); touch(); return c; }
    }
    const c = Object.assign({ id: uid('c'), name: '', company: '', trade: 'Unassigned', phone: '', email: '' }, fields);
    db.contacts.push(c);
    db.contacts.sort((a, b) => a.name.localeCompare(b.name));
    touch();
    return c;
  }
  function deleteContact(id) {
    db.contacts = db.contacts.filter(c => c.id !== id);
    for (const d of db.defects) if (d.assignee === id) d.assignee = null;
    touch();
  }

  /* ── org and settings ── */
  function org(patch) { if (patch) { Object.assign(db.org, patch); touch(); } return db.org; }
  function settings(patch) { if (patch) { Object.assign(db.settings, patch); touch(); } return db.settings; }

  /* ── reports ── */
  const reports = projectId => db.reports.filter(r => r.projectId === projectId).sort((a, b) => b.at - a.at);
  function logReport(r) {
    db.reports.unshift(Object.assign({ id: uid('r'), at: Date.now() }, r));
    db.reports = db.reports.slice(0, 60);
    touch();
  }

  /* ── backup ── */
  function snapshot() { return JSON.parse(JSON.stringify(db)); }
  function restore(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.projects)) return false;
    /* A project without a plans array crashes every screen that counts them, and a backup
       can arrive hand edited or truncated. Give every project the shape the app expects. */
    for (const p of obj.projects) if (!Array.isArray(p.plans)) p.plans = [];
    db = {
      v: 1,
      org: Object.assign(DEFAULTS().org, obj.org || {}),
      projects: obj.projects,
      defects: Array.isArray(obj.defects) ? obj.defects : [],
      contacts: Array.isArray(obj.contacts) ? obj.contacts : [],
      reports: Array.isArray(obj.reports) ? obj.reports : [],
      settings: Object.assign(DEFAULTS().settings, obj.settings || {})
    };
    return save();
  }
  function erase() {
    db = DEFAULTS();
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  function csv(projectId) {
    const p = project(projectId);
    if (!p) return '';
    const esc = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
    const planLabel = id => { const pl = p.plans.find(x => x.id === id); return pl ? pl.label : ''; };
    const who = id => { const c = contact(id); return c ? (c.name || c.company) : ''; };
    const rows = forProject(projectId, { includeClosed: true }).map(d => [
      d.n, esc(planLabel(d.planId)), esc(d.room), esc(d.trade), d.severity, d.status,
      d.due || '', esc(who(d.assignee)), d.photos.length, esc(d.note)
    ].join(','));
    return 'number,plan,room,trade,severity,status,due,assignee,photos,note\n' + rows.join('\n') + '\n';
  }

  return {
    SEVERITY, SEV, STATUS, ST, TRADES, PHRASES, ROOMS, isDone,
    projects, project, activeProject, setActive, addProject, updateProject, deleteProject,
    addPlan, removePlan,
    defects, defect, forProject, addDefect, updateDefect, setStatus, deleteDefect, tally,
    contacts, contact, saveContact, deleteContact,
    org, settings, reports, logReport,
    snapshot, restore, erase, csv, save,
    uid, today, ymd, shortDate, longDate, addDays, nextWeekday, relDue
  };
})();
