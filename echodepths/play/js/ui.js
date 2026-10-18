'use strict';
// EchoDepths screens, save data, grotto, options. DOM overlays keep menus TalkBack-navigable.
const Save = (() => {
  const KEY = 'echodepths.save.v1';
  // Shape is unchanged since 1.0.0; only the default palette moved to the bioluminescent cyan. A saved palette always wins.
  const def = () => ({ v: 1, otoliths: 0, evolutions: [], settings: { palette: 'ice', haptics: true, hapticStrength: 1, audio: true, ambience: 0.7, eyesClosed: false, calm: false }, stats: { runs: 0, maxDepth: 0, shouts: 0, silentClears: 0, tutorialDone: false, deaths: {} }, daily: {} });
  let data = def();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      data = Object.assign(def(), parsed);
      data.settings = Object.assign(def().settings, parsed.settings || {});
      data.stats = Object.assign(def().stats, parsed.stats || {});
      if (!Array.isArray(data.evolutions)) data.evolutions = [];
      if (!data.daily || typeof data.daily !== 'object') data.daily = {};
      if (!data.stats.deaths || typeof data.stats.deaths !== 'object') data.stats.deaths = {};
      const num = (o, k, d) => { if (typeof o[k] !== 'number' || !isFinite(o[k])) o[k] = d; };
      num(data, 'otoliths', 0); ['runs', 'maxDepth', 'shouts', 'silentClears'].forEach(k => num(data.stats, k, 0));
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  function reset() { data = def(); save(); }
  return { get: () => data, save, reset };
})();

const EVOS = [
  { id: 'lateral', branch: 'sense', name: 'lateral line', cost: 12, desc: 'feel moving creatures within 8 m as bearing pulses (was 4 m). ticks appear at the screen edge.', preview: [28, 70, 28, 200, 28, 70, 28] },
  { id: 'heat', branch: 'sense', name: 'heat pits', cost: 30, desc: 'predators within 6 m glow faint red. no ping required.', preview: [15, 40, 15, 40, 15, 40, 60] },
  { id: 'fat', branch: 'body', name: 'fat reserves', cost: 15, desc: 'one extra hit before the dark keeps you.', preview: [120, 80, 120] },
  { id: 'slick', branch: 'body', name: 'slick skin', cost: 20, desc: 'wall brushes make no noise. you glide farther.', preview: [40, 30, 30, 30, 20, 30, 10] },
  { id: 'vocal', branch: 'voice', name: 'vocal sac', cost: 18, desc: 'your tap becomes a whisper: shorter reach, a third of the noise.', preview: [8, 60, 8] },
  { id: 'lungs', branch: 'voice', name: 'deep lungs', cost: 25, desc: 'shouts stop echoing so long: lingering noise halved.', preview: [60, 50, 40, 50, 25, 300, 20] },
];

const App = (() => {
  const $ = id => document.getElementById(id);
  const D = Save.get();
  const screens = [...document.querySelectorAll('#screens .screen')];
  const hud = $('hud'), hintEl = $('hint'), floatEl = $('float'), sr = $('sr');
  let floatT = null, hintT = null, deathT = null, shareT = null, hapT = null;

  function disarm() {
    const r = $('opt-reset'); delete r.dataset.arm; r.textContent = 'erase save'; r.classList.remove('arm');
    const s = $('pm-surface'); delete s.dataset.arm; s.textContent = 'surface (abandon run)'; s.classList.remove('arm');
  }
  function show(id) {
    screens.forEach(s => { s.hidden = s.id !== id; });
    disarm();
    const h = document.querySelector('#' + id + ' h1, #' + id + ' h2');
    if (h) { try { h.focus({ preventScroll: true }); } catch (e) {} }
  }
  function hideScreens() { screens.forEach(s => { s.hidden = true; }); disarm(); }
  function current() { const s = screens.find(x => !x.hidden); return s ? s.id : null; }
  function todayKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function applySettings() { Game.setSettings(D.settings); Game.setEvolutions(D.evolutions); }
  function refreshTitle() {
    $('title-stats').textContent = D.stats.runs ? `deepest ${U.fmtDepth(D.stats.maxDepth)} · ${D.otoliths} otoliths · ${D.stats.runs} ${D.stats.runs === 1 ? 'dive' : 'dives'}` : 'no dives yet. the first one teaches you.';
    const dailyBtn = document.querySelector('[data-go="daily"]'); dailyBtn.textContent = D.daily[todayKey()] ? 'daily descent · done' : 'daily descent';
  }

  // ---- navigation ----
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go]'); if (!b) return; Sfx.resume(); Sfx.uiTick();
    const go = b.dataset.go;
    if (go === 'dive') startRun({ firstRun: !D.stats.tutorialDone });
    else if (go === 'daily') { openDaily(); }
    else if (go === 'grotto') { renderGrotto(true); show('grotto'); }
    else if (go === 'options') { show('options'); }
    else if (go === 'title') { show('title'); refreshTitle(); }
  });
  document.addEventListener('pointerdown', () => Sfx.resume(), { passive: true });

  function startRun(opts) {
    if (Game.state() !== 'idle') return; // a second tap on dive must not restart the run
    hideScreens(); hud.hidden = false; hintEl.textContent = ''; hintEl.classList.add('hide');
    applySettings(); Game.startRun(opts);
  }
  function surface() {
    clearTimeout(deathT); deathT = null;
    Game.toTitle(); hud.hidden = true; refreshTitle(); show('title');
  }

  // ---- HUD ----
  Game.on('hud', h => {
    $('depth').textContent = U.fmtDepth(h.depth); $('biome').textContent = h.biome;
    $('hp').innerHTML = Array.from({ length: h.maxHp }, (_, i) => `<i class="${i < h.hp ? '' : 'lost'}"></i>`).join('');
    const pb = $('pebble'); $('pebble-n').textContent = h.pebbles; pb.disabled = h.pebbles <= 0;
    pb.setAttribute('aria-label', h.pebbles ? `throw pebble, ${h.pebbles} left` : 'no pebbles');
  });
  Game.on('hint', t => { clearTimeout(hintT); if (!t) { hintEl.classList.add('hide'); hintT = setTimeout(() => { hintEl.textContent = ''; }, 900); return; } hintEl.textContent = t; hintEl.classList.remove('hide'); });
  Game.on('float', t => { clearTimeout(floatT); floatEl.textContent = t; floatEl.classList.add('show'); floatT = setTimeout(() => floatEl.classList.remove('show'), 1800); });
  Game.on('announce', t => { sr.textContent = ''; setTimeout(() => { sr.textContent = t; }, 30); });
  $('pebble').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Game.throwPebble(); });
  $('pause').addEventListener('click', e => { e.stopPropagation(); Game.pause(); });
  Game.on('paused', () => { show('pausemenu'); });
  $('pm-resume').addEventListener('click', () => { hideScreens(); Game.resume(); });
  $('pm-surface').addEventListener('click', () => {
    const b = $('pm-surface');
    if (b.dataset.arm) { hideScreens(); Game.abandon(); return; }
    b.dataset.arm = '1'; b.classList.add('arm'); b.textContent = 'tap again to surface. the run ends.'; Sfx.uiTick();
  });
  window.addEventListener('keydown', e => { if (e.code === 'Escape') { if (Game.state() === 'run') Game.pause(); else if (Game.state() === 'paused') { hideScreens(); Game.resume(); } } if (e.code === 'KeyP' && Game.state() === 'run') Game.throwPebble(); });

  // ---- death ----
  Game.on('death', r => {
    hud.hidden = true;
    D.stats.runs++; D.stats.maxDepth = Math.max(D.stats.maxDepth, r.depth); D.stats.shouts += r.shouts; D.stats.silentClears += r.silentClears;
    if (r.tutorialDone) D.stats.tutorialDone = true;
    D.otoliths += r.oto; D.stats.deaths[r.cause] = (D.stats.deaths[r.cause] || 0) + 1;
    if (r.daily) D.daily[todayKey()] = { depth: r.depth, chambers: r.chambers, shouts: r.shouts, calm: r.calm };
    Save.save();
    $('death-title').textContent = r.cause === 'you surfaced' ? 'you surfaced.' : 'the dark kept you.';
    $('death-cause').textContent = r.cause === 'you surfaced' ? 'the cave will be here.' : `${r.cause} found you at ${U.fmtDepth(r.depth)}.`;
    $('d-depth').textContent = U.fmtDepth(r.depth); $('d-chambers').textContent = r.chambers; $('d-oto').textContent = '+' + r.oto; $('d-shouts').textContent = r.shouts;
    clearTimeout(deathT); deathT = setTimeout(() => { deathT = null; if (Game.state() === 'dead') show('death'); }, 1400);
  });
  $('d-surface').addEventListener('click', surface);

  // ---- daily ----
  function openDaily() {
    const k = todayKey(); $('daily-date').textContent = k;
    const res = D.daily[k]; const card = $('daily-result');
    if (res) { card.hidden = false; card.innerHTML = `<b>today's descent</b><br>reached ${U.fmtDepth(res.depth)} · ${res.chambers} ${res.chambers === 1 ? 'chamber' : 'chambers'} · ${res.shouts} ${res.shouts === 1 ? 'shout' : 'shouts'}${res.calm ? ' · calm (unranked)' : ''}`; $('daily-dive').hidden = true; $('daily-share').hidden = false; $('daily-illo').hidden = true; }
    else { card.hidden = true; $('daily-dive').hidden = false; $('daily-share').hidden = true; $('daily-illo').hidden = false; }
    show('daily');
  }
  $('daily-dive').addEventListener('click', () => { const seed = U.hashStr('echodepths-daily-' + todayKey()); startRun({ seed, daily: true, firstRun: false }); });
  $('daily-share').addEventListener('click', async () => {
    const r = D.daily[todayKey()]; if (!r) return; const b = $('daily-share');
    const text = `echodepths · daily descent ${todayKey()}\nreached ${U.fmtDepth(r.depth)} · ${r.chambers} chambers · ${r.shouts} shouts\nto see is to be seen.`;
    const said = t => { b.lastChild.textContent = ' ' + t; clearTimeout(shareT); shareT = setTimeout(() => { b.lastChild.textContent = ' share result'; }, 1800); };
    try {
      if (window.Native && typeof Native.shareText === 'function') { Native.shareText('echodepths daily descent', text); return; }
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text); said('copied');
    } catch (e) { said('could not share'); }
  });

  // ---- grotto ----
  function renderGrotto(animate, justBought) {
    $('oto-count').textContent = D.otoliths;
    const list = $('evo-list'); list.innerHTML = '';
    let n = 0;
    ['sense', 'body', 'voice'].forEach(branch => {
      const col = document.createElement('div'); col.className = 'evo-branch'; col.innerHTML = `<h3>${branch}</h3>`;
      EVOS.filter(e => e.branch === branch).forEach(e => {
        const owned = D.evolutions.includes(e.id); const poor = !owned && D.otoliths < e.cost;
        const b = document.createElement('button'); b.className = 'evo' + (owned ? ' owned' : '') + (poor ? ' poor' : '') + (animate ? '' : ' still') + (justBought === e.id ? ' just' : '');
        b.style.animationDelay = (n++ * 45) + 'ms';
        b.setAttribute('aria-label', `${e.name}. ${e.desc} ${owned ? 'evolved' : e.cost + ' otoliths'}`);
        b.innerHTML = `<b>${owned ? '<svg class="ic"><use href="#i-check"/></svg>' : ''}${e.name}</b><small>${e.desc}</small><span class="cost">${owned ? 'evolved' : e.cost + ' otoliths'}</span>`;
        const cost = b.querySelector('.cost');
        let pressT = null, previewed = false, shortT = null;
        const label = () => owned ? 'evolved' : e.cost + ' otoliths';
        b.addEventListener('pointerdown', () => { previewed = false; b.classList.add('pressing'); pressT = setTimeout(() => { previewed = true; Haptics.preview(e.preview); Sfx.uiTick(); cost.textContent = 'feel it?'; }, 450); });
        const end = () => { clearTimeout(pressT); b.classList.remove('pressing'); if (!shortT) cost.textContent = label(); };
        b.addEventListener('pointerup', end); b.addEventListener('pointerleave', end); b.addEventListener('pointercancel', end);
        b.addEventListener('click', () => {
          if (previewed || D.evolutions.includes(e.id)) return; // live, not the captured flag: a stale card must never sell twice
          if (D.otoliths < e.cost) { // inline, never an alert
            Sfx.uiTick(); cost.textContent = `need ${e.cost - D.otoliths} more`; cost.classList.add('short');
            clearTimeout(shortT); shortT = setTimeout(() => { shortT = null; cost.textContent = label(); cost.classList.remove('short'); }, 1500); return;
          }
          D.otoliths -= e.cost; D.evolutions.push(e.id); Save.save(); Sfx.otolith(); Haptics.preview(e.preview); renderGrotto(false, e.id);
        });
        col.appendChild(b);
      });
      list.appendChild(col);
    });
  }

  // ---- options ----
  function seg(id, key, parse) {
    const el = $(id); const cur = String(parse ? (D.settings[key] ? 1 : 0) : D.settings[key]);
    [...el.querySelectorAll('button')].forEach(b => { b.classList.toggle('on', b.dataset.v === cur); b.addEventListener('click', () => { [...el.querySelectorAll('button')].forEach(x => x.classList.remove('on')); b.classList.add('on'); D.settings[key] = parse ? b.dataset.v === '1' : b.dataset.v; Save.save(); applySettings(); Sfx.uiTick(); }); });
  }
  seg('opt-palette', 'palette'); seg('opt-haptics', 'haptics', true); seg('opt-audio', 'audio', true); seg('opt-eyes', 'eyesClosed', true); seg('opt-calm', 'calm', true);
  const fill = el => { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); };
  $('opt-hstr').value = D.settings.hapticStrength; fill($('opt-hstr')); $('opt-hstr').addEventListener('input', e => { fill(e.target); D.settings.hapticStrength = +e.target.value; Save.save(); applySettings(); Haptics.tick(); });
  $('opt-amb').value = D.settings.ambience; fill($('opt-amb')); $('opt-amb').addEventListener('input', e => { fill(e.target); D.settings.ambience = +e.target.value; Save.save(); applySettings(); });
  $('opt-haptest').addEventListener('click', () => { const b = $('opt-haptest'); Haptics.preview([40, 200, 28, 70, 28, 300, 120, 60, 60]); b.textContent = Haptics.available() ? 'wall · bearing · damage' : 'no haptics on this device'; clearTimeout(hapT); hapT = setTimeout(() => { b.textContent = 'test haptics'; }, 2200); });
  $('opt-reset').addEventListener('click', () => {
    const b = $('opt-reset');
    if (b.dataset.arm) { Save.reset(); location.reload(); return; }
    b.dataset.arm = '1'; b.classList.add('arm'); b.textContent = 'tap again to erase everything';
  });

  applySettings(); refreshTitle(); show('title');

  // ---- the shell contract: Back, and the activity lifecycle ----
  return {
    back() {
      const st = Game.state();
      if (st === 'run') { Game.pause(); return true; }
      if (st === 'paused') { hideScreens(); Game.resume(); return true; }
      if (st === 'dead') { surface(); return true; }
      const cur = current();
      if (cur && cur !== 'title') { show('title'); refreshTitle(); return true; }
      return false;
    },
    onPause() { try { Game.pause(); Sfx.suspend(); } catch (e) {} },
    // the cave stays silent behind the pause menu; the player's own resume tap lets it breathe again
    onResume() { try { if (Game.state() !== 'paused') Sfx.release(); } catch (e) {} },
  };
})();
window.App = App;
