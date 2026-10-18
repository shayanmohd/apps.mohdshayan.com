/* Sway. Every byte of state is one localStorage record on this device. Nothing is transmitted. */
const Store = (() => {
  const KEY = 'sway.v1';

  const DEFAULTS = {
    storms: [],            // { id, at, endedAt, wave, chips[], tools[], durS, launchMs, pocket }
    pulses: [],            // recent launch-to-first-pulse measurements, ms, newest last
    settings: {
      protocol: 'tide',      // tide | even | long
      strength: 0.72,        // 0.15 .. 1, set by the calibration wizard
      haptics: true,
      audio: false,
      pocketDim: true,
      contact: { name: '', phone: '', rel: '' },
      region: '',
      calibrated: false
    },
    learnSeen: [],
    firstRun: null
  };

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      const d = JSON.parse(raw);
      return {
        storms: Array.isArray(d.storms) ? d.storms : [],
        pulses: Array.isArray(d.pulses) ? d.pulses : [],
        settings: Object.assign(clone(DEFAULTS.settings), d.settings || {},
          { contact: Object.assign({ name: '', phone: '', rel: '' }, (d.settings || {}).contact || {}) }),
        learnSeen: Array.isArray(d.learnSeen) ? d.learnSeen : [],
        firstRun: d.firstRun || null
      };
    } catch (e) { return clone(DEFAULTS); }
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  /* ---------- settings ---------- */
  const settings = () => db.settings;
  function setSetting(k, v) { db.settings[k] = v; save(); }
  function setContact(c) { db.settings.contact = { name: c.name || '', phone: c.phone || '', rel: c.rel || '' }; save(); }

  /* ---------- the covenant receipts ---------- */
  function recordPulse(ms) {
    if (!(ms > 0) || ms > 60000) return;
    db.pulses.push(Math.round(ms));
    if (db.pulses.length > 40) db.pulses = db.pulses.slice(-40);
    if (!db.firstRun) db.firstRun = Date.now();
    save();
  }
  function pulseStats() {
    const p = db.pulses.slice().sort((a, b) => a - b);
    if (!p.length) return null;
    const at = q => p[Math.min(p.length - 1, Math.floor(q * p.length))];
    return { n: p.length, median: at(0.5), worst: p[p.length - 1], best: p[0], p90: at(0.9) };
  }

  /* ---------- storms ---------- */
  /** Ids key every later patch, so two storms opened inside the same millisecond must not share one. */
  let lastId = 0;
  function nextId() {
    const t = Math.max(Date.now(), lastId + 1);
    lastId = t;
    return 's' + t.toString(36);
  }
  function openStorm() {
    // An app that opens straight into a session collects abandoned ones; sweep them.
    const cut = Date.now() - 86400000;
    db.storms = db.storms.filter(s => s.logged || s.at > cut);
    const s = { id: nextId(), at: Date.now(), endedAt: null,
                wave: null, chips: [], tools: [], durS: 0, launchMs: null, pocket: false, logged: false };
    db.storms.push(s);
    if (!db.firstRun) db.firstRun = Date.now();
    save();
    return s.id;
  }
  const find = id => db.storms.find(s => s.id === id) || null;
  function patch(id, o) { const s = find(id); if (!s) return; Object.assign(s, o); save(); }
  function addTool(id, tool) {
    const s = find(id); if (!s) return;
    if (!s.tools.includes(tool)) { s.tools.push(tool); save(); }
  }
  function discard(id) { db.storms = db.storms.filter(s => s.id !== id); save(); }
  const storms = () => db.storms.slice().sort((a, b) => a.at - b.at);
  const logged = () => storms().filter(s => s.logged);

  /* ---------- dates ---------- */
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const LONGM = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const pad = n => String(n).padStart(2, '0');
  function dayLabel(ts) {
    const d = new Date(ts), n = new Date();
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, n)) return 'Today';
    const y = new Date(n); y.setDate(y.getDate() - 1);
    if (same(d, y)) return 'Yesterday';
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  const clock = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const monthLabel = ts => { const d = new Date(ts); return LONGM[d.getMonth()] + ' ' + d.getFullYear(); };
  function mmss(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + 'm ' + pad(sec % 60) + 's';
  }

  /* ---------- context vocabulary ---------- */
  const CHIPS = [
    { id: 'home', label: 'Home' }, { id: 'transit', label: 'Transit' },
    { id: 'work', label: 'Work' }, { id: 'night', label: 'Night' },
    { id: 'social', label: 'Social' }, { id: 'unknown', label: 'No idea' }
  ];
  const chipLabel = id => (CHIPS.find(c => c.id === id) || { label: id }).label;
  const TOOLS = { breathing: 'Breathing', senses: '5-4-3-2-1', cold: 'Cold', tapping: 'Tapping' };

  /* ---------- almanac ---------- */
  const HOURBANDS = [
    { id: 'night', label: 'Late night', from: 0, to: 6 },
    { id: 'morning', label: 'Morning', from: 6, to: 12 },
    { id: 'afternoon', label: 'Afternoon', from: 12, to: 18 },
    { id: 'evening', label: 'Evening', from: 18, to: 24 }
  ];
  function almanac() {
    const list = logged();
    const n = list.length;
    const out = { n, bands: HOURBANDS.map(b => ({ ...b, count: 0 })), chips: [], tools: [],
                  avgFirst: null, avgRecent: null, waveAvg: null, months: [], trend: [] };
    if (!n) return out;

    for (const s of list) {
      const h = new Date(s.at).getHours();
      const b = out.bands.find(b => h >= b.from && h < b.to);
      if (b) b.count++;
    }
    const chipCount = {};
    for (const s of list) for (const c of s.chips) chipCount[c] = (chipCount[c] || 0) + 1;
    out.chips = Object.entries(chipCount).map(([id, count]) => ({ id, label: chipLabel(id), count }))
      .sort((a, b) => b.count - a.count);

    const toolCount = {};
    for (const s of list) for (const t of s.tools) toolCount[t] = (toolCount[t] || 0) + 1;
    out.tools = Object.entries(toolCount).map(([id, count]) => ({ id, label: TOOLS[id] || id, count }))
      .sort((a, b) => b.count - a.count);

    const durs = list.filter(s => s.durS > 0);
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    if (durs.length >= 4) {
      const half = Math.floor(durs.length / 2);
      out.avgFirst = mean(durs.slice(0, half).map(s => s.durS));
      out.avgRecent = mean(durs.slice(-half).map(s => s.durS));
    }
    out.trend = durs.slice(-14).map(s => s.durS);
    const waves = list.filter(s => s.wave).map(s => s.wave);
    if (waves.length) out.waveAvg = mean(waves);

    const bym = {};
    for (const s of list) {
      const d = new Date(s.at), k = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      (bym[k] = bym[k] || { key: k, at: s.at, count: 0 }).count++;
    }
    out.months = Object.values(bym).sort((a, b) => a.at - b.at).slice(-8);
    return out;
  }

  /** The one sentence the Almanac leads with, or null when there is not enough to say. */
  function headline() {
    const a = almanac();
    if (a.n < 3) return null;
    const top = a.chips[0];
    if (top && top.count >= 3 && top.count / a.n >= 0.5 && top.id !== 'unknown')
      return top.count + ' of ' + a.n + ' storms began with ' + top.label.toLowerCase() + ' marked.';
    const band = a.bands.slice().sort((x, y) => y.count - x.count)[0];
    if (band && band.count / a.n >= 0.5) return band.count + ' of ' + a.n + ' storms started in the ' + band.label.toLowerCase() + '.';
    return null;
  }

  /* ---------- export ---------- */
  function exportText() {
    const list = logged();
    const L = [];
    L.push('Sway storm log');
    L.push('Exported ' + new Date().toLocaleString());
    L.push('This file was written on your device. Nothing was uploaded to produce it.');
    L.push('');
    if (!list.length) L.push('No storms logged yet.');
    for (const s of list) {
      const d = new Date(s.at);
      L.push(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + clock(s.at));
      L.push('  Wave size: ' + (s.wave ? s.wave + ' of 5' : 'not recorded'));
      L.push('  Rode it out in: ' + (s.durS ? mmss(s.durS) : 'not recorded'));
      L.push('  Context: ' + (s.chips.length ? s.chips.map(chipLabel).join(', ') : 'none marked'));
      L.push('  Tools used: ' + (s.tools.length ? s.tools.map(t => TOOLS[t] || t).join(', ') : 'none'));
      L.push('');
    }
    const p = pulseStats();
    if (p) L.push('Median time from opening Sway to the first pulse: ' + p.median + ' ms over ' + p.n + ' sessions.');
    return L.join('\n');
  }

  function eraseAll() { db = clone(DEFAULTS); save(); }

  const learnSeen = id => db.learnSeen.includes(id);
  function markLearn(id) { if (!db.learnSeen.includes(id)) { db.learnSeen.push(id); save(); } }

  return { settings, setSetting, setContact, recordPulse, pulseStats,
           openStorm, patch, addTool, discard, find, storms, logged,
           dayLabel, clock, monthLabel, mmss, CHIPS, TOOLS, chipLabel,
           almanac, headline, exportText, eraseAll, learnSeen, markLearn };
})();
