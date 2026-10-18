/* Umbra. The screens.

   The app holds one idea: tell people the truth about tonight, and interrupt them only when
   the truth is worth it. Everything on these screens is computed from the ephemeris kernel
   when it is drawn, for the place the user chose, on the device, with no network.        */
const App = (() => {
  const $ = s => document.querySelector(s);
  const HOUR = 3600000, DAY = 86400000;
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                 'August', 'September', 'October', 'November', 'December'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let view = 'tonight';
  let nightCache = {};
  let feed = null, feedFor = null, feedFilter = 'hi';
  let page = null;              // { title, render, key }
  let pageStack = [];           // the pages underneath the open one, so Back retraces steps
  let quietUntil = 0;           // ignore taps for a moment after a sheet or page closes
  let sheetShownAt = -1e9;      // the backdrop does not close a sheet the same thumb just opened
  let onboardStep = 0, onboardDraft = {};
  let redAuto = false;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- clocks, always on the place's own ---------------- */

  const offOf = (place, t) => Sky.offsetFor(place, t).ms;
  function P(t, place) { const d = new Date(t + offOf(place, t)); return d; }
  function clock(t, place) {
    if (t == null) return 'none';
    const d = P(t, place), h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, '0');
    if (Store.settings().clock24) return String(h).padStart(2, '0') + ':' + m;
    return (h % 12 === 0 ? 12 : h % 12) + ':' + m + (h < 12 ? ' am' : ' pm');
  }
  const dayNum = (t, place) => P(t, place).getUTCDate();
  const monShort = (t, place) => MON[P(t, place).getUTCMonth()];
  const wdayName = (t, place) => WDAY[P(t, place).getUTCDay()];
  const dateLong = (t, place) => dayNum(t, place) + ' ' + MONTH[P(t, place).getUTCMonth()];
  const monthKey = (t, place) => MONTH[P(t, place).getUTCMonth()] + ' ' + P(t, place).getUTCFullYear();
  const deg = v => Math.round(v) + '\u00B0';

  function hoursText(h) {
    if (h <= 0) return 'none';
    if (h < 1) return Math.round(h * 60) + ' min';
    const w = Math.floor(h), m = Math.round((h - w) * 60);
    return m ? w + ' h ' + m + ' min' : w + ' h';
  }

  /* ---------------- shared bits of markup ---------------- */

  const CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  const card = (inner, cls) => '<div class="card' + (cls ? ' ' + cls : '') + '">' + inner + '</div>';
  const emptyState = (art, title, sub) =>
    '<div class="empty">' + art + '<b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div>';

  /** Lists arrive one card after another rather than all at once. */
  function stagger(root) {
    if (!root) return;
    let i = 0;
    for (const el of root.children) { el.style.setProperty('--i', i++); el.classList.add('in'); }
  }

  /** An error belongs next to the thing that caused it, not in a toast that vanishes. */
  function inlineErr(scope, msg) {
    const box = $(scope);
    if (!box) return;
    let el = box.querySelector('.err');
    if (!msg) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('p'); el.className = 'err'; el.setAttribute('role', 'alert'); }
    el.textContent = msg;
    const anchor = [...box.children].find(c => c.matches('.btnrow, [data-act="saveplace"], [data-act="ob-next"]'));
    if (anchor) box.insertBefore(el, anchor); else box.appendChild(el);
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    buzz(20, 120);
  }

  function partRow(p) {
    return '<div class="part"><span class="lab">' + esc(p.label) + '</span>' +
      '<span class="pct num">' + Math.round(p.v * 100) + '</span>' +
      '<span class="track"><i style="--v:' + Math.round(p.v * 100) + '%"></i></span>' +
      '<span class="sub">' + esc(p.note) + '</span></div>';
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function buzz(ms, amp) {
    try { if (window.Native && window.Native.vibrate) window.Native.vibrate(ms || 12, amp || 90); } catch (e) {}
  }

  /* ---------------- the night model, cached per place and date ---------------- */

  function tonightModel(place, when) {
    const t = when || Date.now();
    const key = place.id + '|' + Sky.anchorFor(t, place);
    if (nightCache[key]) return nightCache[key];
    const m = Sky.tonight(place, t);
    nightCache = { [key]: m, ...nightCache };
    const keys = Object.keys(nightCache);
    if (keys.length > 12) delete nightCache[keys[keys.length - 1]];
    return m;
  }

  /* ================= TONIGHT ================= */

  function renderTonight() {
    const place = Store.home();
    if (!place) return;
    const m = tonightModel(place);
    const n = m.n, s = m.score;
    const H = [];

    H.push('<h1 class="h1">' + wdayName(n.t0, place) + ' night</h1>');
    let lede = dateLong(n.t0, place) + ' into ' + dateLong(n.t1, place) + '.';
    if (n.off.approx) lede += ' Times use this place\'s solar clock, not your phone\'s.';
    H.push('<p class="lede">' + esc(lede) + '</p>');

    /* the score */
    let sc = '<div class="hero"><div class="hero-ring">' + Art.eclipse(s.value / 10) +
      '<span class="val num">' + s.value.toFixed(1) + '</span></div>' +
      '<div class="hero-t"><span class="of">Tonight, out of ten</span>' +
      '<p class="verdict">' + esc(s.verdict) + '</p></div></div>' +
      '<div class="parts">' + s.parts.map(partRow).join('') + '</div>' +
      '<p class="note">Umbra cannot see your weather. It scores the sky, and the clouds are still your call.</p>';
    H.push(card(sc));

    /* the strip */
    H.push(card('<canvas class="strip" id="stripCv"></canvas><div class="striprow" id="stripRow"></div>', 'flush'));

    /* the Moon */
    const mo = n.moon;
    let moon = '<div class="moonrow"><canvas id="moonCv"></canvas><div>' +
      '<h3>' + esc(mo.name) + '</h3>' +
      '<p class="tiny">' + Math.round(mo.illum * 100) + ' per cent lit, ' +
      Math.round(mo.dist).toLocaleString() + ' km away.</p>' +
      '<p class="tiny">' + esc(moonTimes(n, place)) + '</p>' +
      '</div></div>' +
      '<p class="note">' + esc(moonLine(n)) + '</p>';
    H.push(card(moon));

    /* what is on */
    H.push('<p class="h2">Reasons to go out</p>');
    const rows = m.list.slice(0, 7).map((h, i) => happeningRow(h, place, i)).join('');
    H.push(card(rows || emptyState(Art.hill(), 'Nothing scheduled tonight', 'The sky is still open, and the Moon always counts.')));

    /* planets */
    const vis = m.planets.filter(p => p.alt > 5 && p.elong > 10);
    if (vis.length) {
      H.push('<p class="h2">Planets tonight</p>');
      H.push(card(vis.map(p =>
        '<div class="row static">' +
        '<span class="when"><b>' + (p.mag > 0 ? '+' : '') + p.mag.toFixed(1) + '</b>mag</span>' +
        '<span class="t"><b>' + esc(p.name) + '</b><i>' + esc(p.verdict) + ', ' + deg(p.alt) + ' up in the ' +
        esc(Data.compass(p.az)) + ' around ' + clock(p.at, place) + '</i></span>' +
        '<span class="r quiet">' + (p.naked ? '' : 'binoculars') + '</span></div>').join('')));
    }

    /* targets */
    if (m.targets.length) {
      H.push('<p class="h2">Worth pointing at</p>');
      H.push(card(m.targets.slice(0, 6).map(t =>
        '<button class="row" data-act="target" data-id="' + t.id + '">' +
        '<span class="when"><b>' + deg(t.alt) + '</b>up</span>' +
        '<span class="t"><b>' + esc(t.name) + '</b><i>' + esc(t.kind) + ', ' + esc(Data.compass(t.az)) +
        ' at ' + clock(t.at, place) + (t.easy ? '' : ', needs a darker sky than yours') + '</i></span>' +
        CHEV + '</button>').join('')));
    }

    H.push('<div class="btnrow"><button class="btn" data-act="log-new">Log what you saw</button>' +
           '<button class="btn ghost" data-act="tomorrow">Look at tomorrow</button></div>');
    H.push('<p class="note">Numbers here are computed on this phone from published algorithms. ' +
           'The method, and what it cannot do, is written out in Settings.</p>');

    $('#tonightBody').innerHTML = H.join('');
    stagger($('#tonightBody'));
    drawTonight(m);
  }

  /** Moon events inside this night, in the order they actually happen. */
  function moonTimes(n, place) {
    const ev = [];
    for (const t of n.moon.allRises || []) ev.push({ t, up: true });
    for (const t of n.moon.allSets || []) ev.push({ t, up: false });
    ev.sort((a, b) => a.t - b.t);
    const from = (n.bands.day.end || n.t0 + 7 * HOUR) - HOUR;
    const to = (n.bands.day.start || n.t1) + HOUR;
    const near = ev.filter(e => e.t > from && e.t < to);
    if (!near.length) return n.moon.maxAlt > 0 ? 'Up all night.' : 'Below the horizon all night.';
    return near.map(e => (e.up ? 'Rises ' : 'Sets ') + clock(e.t, place)).join('. ') + '.';
  }

  function moonLine(n) {
    if (n.moon.penalty < 0.15) return 'The Moon costs you almost nothing tonight.';
    if (n.moon.penalty < 1) return 'Moonlight takes roughly ' + n.moon.penalty.toFixed(1) +
      ' of a magnitude off your sky, so faint things get harder.';
    return 'Moonlight takes about ' + n.moon.penalty.toFixed(1) + ' magnitudes off your sky. ' +
      'Good for craters, poor for meteors and galaxies.';
  }

  function happeningRow(h, place, i) {
    const id = 'h' + i;
    return '<button class="row" data-act="happening" data-i="' + i + '">' +
      '<span class="when"><b>' + clock(h.at, place).split(' ')[0] + '</b>' + (h.daytime ? 'day' : 'best') + '</span>' +
      '<span class="t"><b>' + esc(h.title) + '</b><i>' + esc(h.sub || '') + '</i></span>' +
      '<span class="r">' + Math.round(h.weight * 10) + '/10</span></button>';
  }

  function drawTonight(m) {
    const place = m.n.place, n = m.n;
    const cv = $('#stripCv');
    if (cv) {
      const s = Sky.strip(n, 120);
      const hourOf = t => P(t, place).getUTCHours() + P(t, place).getUTCMinutes() / 60;
      Draw.nightStrip(cv, n, {
        strip: s, now: Date.now(), best: m.score.bestAt, height: 132,
        hourOf,
        timeOfHour: hh => {
          const d = P(s.from, place);
          const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0) - offOf(place, s.from);
          return base + hh * HOUR;
        },
        fmtHour: t => clock(t, place).replace(':00', '').replace(' am', '').replace(' pm', '')
      });
      const b = n.bands;
      const bits = [];
      let low = s.points[0], high = s.points[0];
      for (const p of s.points) { if (p.sun < low.sun) low = p; if (p.sun > high.sun) high = p; }
      if (b.day.end) bits.push('<div>Sunset <b>' + clock(b.day.end, place) + '</b></div>');
      else if (!b.day.start) bits.push('<div><b>' + (n.sunAltMid > 0 ? 'The sun does not set' : 'The sun does not rise') + '</b></div>');
      if (b.civil.end) bits.push('<div>Dusk <b>' + clock(b.civil.end, place) + '</b></div>');
      if (n.dark) bits.push('<div>' + (n.quality === 'astronomical' ? 'Dark' : 'Darkest') +
        ' <b>' + clock(n.dark.from, place) + ' to ' + clock(n.dark.to, place) + '</b></div>');
      if (n.quality === 'none')
        bits.push('<div>Sun lowest <b>' + deg(low.sun) + ' at ' + clock(low.t, place) + '</b></div>');
      else
        bits.push('<div>' + (n.quality === 'astronomical' ? 'True darkness' :
          n.quality === 'nautical' ? 'Nautical twilight' : 'Civil twilight') +
          ' <b>' + hoursText(n.darkHours) + '</b></div>');
      if (b.day.start) bits.push('<div>Sunrise <b>' + clock(b.day.start, place) + '</b></div>');
      $('#stripRow').innerHTML = bits.join('');
    }
    const mc = $('#moonCv');
    if (mc) Draw.moonDisc(mc, n.moon.illum, n.moon.waxing, 76);
  }

  /* ================= EVENTS ================= */

  const FILTERS = [
    { id: 'hi', label: 'Highlights' }, { id: 'shower', label: 'Meteors' },
    { id: 'eclipse', label: 'Eclipses' }, { id: 'planet', label: 'Planets' },
    { id: 'moon', label: 'Moon' }, { id: 'all', label: 'Everything' }
  ];

  function renderEvents() {
    const place = Store.home();
    if (!place) return;
    $('#eventFilters').innerHTML = FILTERS.map(f =>
      '<button class="chip' + (f.id === feedFilter ? ' on' : '') + '" data-act="filter" data-id="' + f.id + '">' +
      f.label + '</button>').join('');

    if (!ensureFeed()) {
      $('#eventsBody').innerHTML = '<h1 class="h1">The year ahead</h1>' +
        '<p class="lede">Working out the sky for ' + esc(place.name) + '. This takes a moment.</p>' +
        card(Art.skeleton(7), 'flush');
      return;
    }

    const list = feed.filter(e => matches(e, feedFilter));
    const H = ['<h1 class="h1">The year ahead</h1>',
      '<p class="lede">Every date here is computed for ' + esc(place.name) +
      '. Nothing is downloaded, so the calendar works with the phone in flight mode.</p>'];
    let month = '';
    for (const e of list) {
      const k = monthKey(e.at, place);
      if (k !== month) { month = k; H.push('<p class="h2">' + esc(k) + '</p><div class="card">'); }
      H.push(eventRow(e, place));
      const next = list[list.indexOf(e) + 1];
      if (!next || monthKey(next.at, place) !== month) H.push('</div>');
    }
    if (!list.length) H.push(card(emptyState(Art.orbit(), 'Nothing in this category', 'Not over the next year, from ' + place.name + '.')));
    $('#eventsBody').innerHTML = H.join('');
    stagger($('#eventsBody'));
  }

  function matches(e, f) {
    if (f === 'all') return true;
    if (f === 'hi') return !!e.hi;
    if (f === 'shower') return e.kind === 'shower';
    if (f === 'eclipse') return e.kind === 'solar-eclipse' || e.kind === 'lunar-eclipse';
    if (f === 'planet') return e.kind === 'opposition' || e.kind === 'elongation' || e.kind === 'conjunction';
    if (f === 'moon') return e.kind === 'moon' || (e.kind === 'conjunction' && e.conj.a === 'moon');
    return true;
  }

  function eventRow(e, place) {
    const r = Sky.rate(e, place);
    const when = e.kind === 'shower' && e.nightAt ? e.nightAt : e.at;
    const sub = eventSub(e, place);
    return '<button class="row" data-act="event" data-key="' + esc(e.key) + '">' +
      '<span class="when"><b>' + dayNum(when, place) + '</b>' + monShort(when, place) + '</span>' +
      '<span class="t"><b>' + esc(e.title) + '</b><i>' + esc(sub) + '</i></span>' +
      (r && r.label ? '<span class="r' + (dim(e, r) ? ' quiet' : '') + '">' + esc(r.label) + '</span>' : CHEV) +
      '</button>';
  }
  function dim(e, r) {
    if (e.kind === 'shower') return r.rate < 5;
    if (e.kind === 'solar-eclipse' || e.kind === 'lunar-eclipse') return !r.local;
    return (r.alt || 0) < 15;
  }
  function eventSub(e, place) {
    switch (e.kind) {
      case 'shower': {
        const r = Sky.rate(e, place);
        return 'Best on ' + wdayName(e.nightAt || e.at, place) + ' night' +
          (r && r.rate >= 1 ? ', radiant highest ' + clock(r.at, place) : '');
      }
      case 'solar-eclipse': return 'Greatest eclipse ' + clock(e.at, place);
      case 'lunar-eclipse': return 'Greatest ' + clock(e.at, place);
      case 'opposition': return 'Closest and brightest for the year, up all night';
      case 'elongation': return 'Furthest from the Sun, ' + Math.round(e.elong) + ' degrees';
      case 'conjunction': {
        const r = Sky.rate(e, place);
        return r && r.alt > 5
          ? r.sep.toFixed(1) + ' degrees apart when you can see them, ' + clock(r.at, place)
          : e.conj.sep.toFixed(1) + ' degrees apart at closest';
      }
      case 'moon': return clock(e.at, place) + ', ' + Math.round(e.dist).toLocaleString() + ' km away';
      case 'season': return clock(e.at, place);
    }
    return '';
  }

  /* ================= EVENT DETAIL ================= */

  function openEvent(key) {
    const place = Store.home();
    const e = (feed || []).find(x => x.key === key);
    if (!e) return;
    openPage(e.title, () => eventPage(e, place), 'ev' + key);
  }

  function eventPage(e, place) {
    const r = Sky.rate(e, place);
    const H = [];
    const when = e.kind === 'shower' && e.nightAt ? e.nightAt : e.at;
    H.push('<h1 class="h1">' + esc(e.title) + '</h1>');
    H.push('<p class="lede">' + esc(wdayName(when, place) + ' ' + dateLong(when, place) +
      (e.kind === 'shower' ? ', from ' : ', ') + place.name) + '</p>');

    if (e.kind === 'shower') H.push(showerBody(e, place, r));
    else if (e.kind === 'solar-eclipse') H.push(solarBody(e, place, r));
    else if (e.kind === 'lunar-eclipse') H.push(lunarBody(e, place, r));
    else H.push(simpleBody(e, place, r));

    const on = Store.reminded(e.key);
    H.push('<div class="btnrow">' +
      '<button class="btn ' + (on ? 'ghost' : '') + '" data-act="remind" data-key="' + esc(e.key) + '">' +
      (on ? 'Reminder set' : 'Remind me') + '</button>' +
      '<button class="btn ghost" data-act="log-new">Log an observation</button></div>');
    if (on) H.push('<p class="note">' + (Store.settings().alerts.on
      ? 'Umbra will raise this on the evening of that night, and again three quarters of an hour ' +
        'before it starts if it is an eclipse you can see from here.'
      : 'Alerts are switched off, so this is only a marker for now. Turn on the evening heads up in ' +
        'Settings and Umbra will raise it on the evening of that night.') + '</p>');
    return H.join('');
  }

  function showerBody(e, place, r) {
    const sh = e.shower, best = r.nights[0], other = r.nights[1];
    const n = best.night;
    const H = [];
    H.push(card(
      '<h3>Your night</h3>' +
      '<dl class="kv">' +
      '<dt>Best night</dt><dd>' + wdayName(n.t0, place) + ' ' + dateLong(n.t0, place) + '</dd>' +
      '<dt>Best hour</dt><dd class="num">' + clock(best.at, place) + '</dd>' +
      '<dt>Radiant then</dt><dd>' + deg(best.alt) + ' up, ' + Data.compass(best.az) + '</dd>' +
      '<dt>Meteors an hour</dt><dd class="num">' + (best.rate < 1 ? 'under 1' : Math.round(best.rate)) + '</dd>' +
      '<dt>Moon</dt><dd>' + Math.round(n.moon.illum * 100) + ' per cent' +
        (n.moon.penalty > 0.8 ? ', a real problem' : n.moon.penalty > 0.3 ? ', a small tax' : ', out of the way') + '</dd>' +
      '<dt>Sky limit</dt><dd class="num">magnitude ' + n.lm.toFixed(1) + '</dd>' +
      '</dl>' +
      '<p class="note">' + esc(rateSentence(best, other, place)) + '</p>'));

    H.push('<p class="h2">The radiant, across the night</p>');
    H.push(card('<canvas id="curveCv"></canvas>', 'flush'));
    H.push('<p class="h2">About this shower</p>');
    H.push(card('<p class="prose">' + esc(sh.note) + '</p>' +
      '<dl class="kv gap">' +
      '<dt>Parent body</dt><dd>' + esc(sh.parent) + '</dd>' +
      '<dt>Speed</dt><dd>' + sh.v + ' km a second</dd>' +
      '<dt>Rate at best, from a perfect sky</dt><dd class="num">' + sh.zhr + ' an hour</dd>' +
      '<dt>Maximum</dt><dd>solar longitude ' + sh.lam.toFixed(1) + '</dd>' +
      '</dl>'));
    H.push('<p class="h2">How to watch</p>');
    H.push(card('<p class="prose">' +
      'Face about half way up the sky, roughly 40 degrees away from the radiant rather than straight at it: ' +
      'meteors near the radiant are foreshortened and look short. Lie back if you can. Give your eyes twenty ' +
      'minutes without a screen, and use red light after that. The rate above assumes you can see the whole sky; ' +
      'a hedge, a house or a streetlight will take a large bite out of it.</p>'));
    return H.join('');
  }
  function rateSentence(best, other, place) {
    if (best.rate < 1) return 'From this latitude the radiant barely clears the horizon while it is dark, so this shower is not really yours. It is worth knowing rather than staying up for.';
    const diff = other && other.rate > 0 ? Math.abs(best.rate - other.rate) / Math.max(best.rate, 0.1) : 0;
    let s = 'On a clear night from a sky like yours, expect around ' + Math.round(best.rate) +
      ' an hour at best, not the headline figure.';
    if (other && diff > 0.25) s += ' The night of ' + dateLong(other.night.t0, place) + ' gives about ' +
      Math.round(other.rate) + ', so the choice matters.';
    else if (other) s += ' The night either side is much the same, so pick the clearer sky.';
    return s;
  }

  function solarBody(e, place, r) {
    const l = e.ecl.local, g = e.ecl.global;
    const H = [];
    if (!l) {
      H.push(card(Art.farSide() + '<h3>Not from here</h3><p class="note">This eclipse happens while the Sun is below your horizon, ' +
        'or the Moon misses the Sun as seen from this place. It is ' + (/^[aeiou]/i.test(g.type) ? 'an ' : 'a ') +
        esc(g.type.toLowerCase()) + ' eclipse somewhere else on Earth.</p>'));
    } else {
      const edge = l.magnitude > 0.975 && l.magnitude < 1.03;
      H.push(card('<canvas id="eclCv"></canvas>' +
        '<dl class="kv gap-sm">' +
        '<dt>From here</dt><dd>' + esc(l.type) + '</dd>' +
        '<dt>Sun covered</dt><dd class="num">' + (l.obscuration >= 0.9995 ? '100' : (l.obscuration * 100).toFixed(1)) + ' per cent</dd>' +
        '<dt>Starts</dt><dd class="num">' + (l.start ? clock(Astro.msFromJd(l.start), place) : 'in progress at sunrise') + '</dd>' +
        '<dt>Greatest</dt><dd class="num">' + clock(Astro.msFromJd(l.jd), place) + '</dd>' +
        '<dt>Ends</dt><dd class="num">' + (l.end ? clock(Astro.msFromJd(l.end), place) : 'still going at sunset') + '</dd>' +
        '<dt>Sun then</dt><dd>' + deg(l.sunAlt) + ' up, ' + Data.compass(l.sunAz) + '</dd>' +
        '</dl>', 'flush'));
      if (edge) H.push(card('<h3>You are near the edge</h3><p class="note">Umbra computes eclipse geometry from the ' +
        'Moon\'s mean limb, which is good to a fraction of a per cent but not to the last kilometre. At this ' +
        'magnitude you are within a few kilometres of the edge of the path, so check an official path map before ' +
        'you travel for totality.</p>'));
      H.push(card('<h3>Do not look at the Sun</h3><p class="note">A partial or annular phase is bright enough to ' +
        'burn a hole in your retina without hurting at the time. Use an ISO 12312-2 filter, a welding shade 14, or ' +
        'a pinhole projection. Only the few moments of a genuine total eclipse are safe to watch directly.</p>'));
    }
    H.push('<p class="h2">Elsewhere on Earth</p>');
    H.push(card('<dl class="kv"><dt>Type</dt><dd>' + esc(g.type) + '</dd>' +
      '<dt>Greatest eclipse</dt><dd class="num">' + clock(Astro.msFromJd(g.jd), place) + '</dd>' +
      '<dt>Gamma</dt><dd class="num">' + g.gamma.toFixed(3) + '</dd></dl>' +
      '<p class="note">Gamma is how close the Moon\'s shadow axis passes to the centre of the Earth, in Earth radii. ' +
      'Under 0.9 or so and the shadow lands squarely on the planet.</p>'));
    return H.join('');
  }

  function lunarBody(e, place, r) {
    const l = e.ecl.local || e.ecl.global;
    const seen = !!e.ecl.local;
    const H = [];
    H.push(card('<canvas id="eclCv"></canvas>' +
      '<dl class="kv gap-sm">' +
      '<dt>Type</dt><dd>' + esc(l.type) + '</dd>' +
      '<dt>Greatest</dt><dd class="num">' + clock(Astro.msFromJd(l.jd), place) + '</dd>' +
      '<dt>Starts</dt><dd class="num">' + (l.start ? clock(Astro.msFromJd(l.start), place) : 'before it rises') + '</dd>' +
      '<dt>Ends</dt><dd class="num">' + (l.end ? clock(Astro.msFromJd(l.end), place) : 'after it sets') + '</dd>' +
      (l.type === 'Penumbral'
        ? '<dt>Penumbral magnitude</dt><dd class="num">' + l.penumbralMag.toFixed(2) + '</dd>'
        : '<dt>Umbral magnitude</dt><dd class="num">' + l.umbralMag.toFixed(2) + '</dd>') +
      '<dt>Moon from here</dt><dd>' + (seen ? deg(l.moonAlt) + ' up, ' + Data.compass(l.moonAz) : 'below the horizon') + '</dd>' +
      '</dl>', 'flush'));
    H.push(card('<p class="note">' + (seen
      ? (l.type === 'Total'
        ? 'Totality turns the Moon copper: the only light reaching it is sunlight bent through the whole ring of ' +
          'Earth\'s sunrises and sunsets. No equipment, no filter, no danger. Binoculars help.'
        : l.type === 'Partial'
          ? 'You will see Earth\'s shadow with a hard curved edge crossing the Moon. That curve is the shape of ' +
            'the planet you are standing on.'
          : 'A penumbral eclipse is subtle: the Moon dims slightly on one side. Worth knowing, easy to miss.')
      : 'The Moon is below your horizon while this happens, so it belongs to the other side of the world.') + '</p>'));
    return H.join('');
  }

  function simpleBody(e, place, r) {
    const H = [];
    const copy = {
      opposition: 'Opposition is the night a planet sits opposite the Sun from us: it rises at sunset, is highest ' +
        'around midnight, sets at sunrise, and is as close and as bright as it gets this year.',
      elongation: 'Greatest elongation is the furthest an inner planet gets from the Sun in our sky, which makes it ' +
        'the easiest few evenings, or mornings, to actually find it.',
      conjunction: 'A conjunction is a line of sight, not a meeting: the two are still hundreds of millions of ' +
        'kilometres apart. It is worth looking at anyway, because it is the one time you can hold up a thumb and ' +
        'cover both.',
      moon: 'Full and new are the two ends of the month. New moon is the dark fortnight\'s centre and the best time ' +
        'for everything faint; a full moon near perigee is the brightest the sky gets without the Sun.',
      season: 'The solstices and equinoxes are the turn of the year for an observer: they set how long your nights ' +
        'are for the months either side.'
    }[e.kind];
    if (r) {
      H.push(card('<dl class="kv">' +
        '<dt>Date</dt><dd>' + wdayName(e.at, place) + ' ' + dateLong(e.at, place) + '</dd>' +
        '<dt>Time</dt><dd class="num">' + clock(e.at, place) + '</dd>' +
        (r.alt != null ? '<dt>Best altitude</dt><dd>' + deg(r.alt) + ' at ' + clock(r.at, place) + '</dd>' : '') +
        (e.kind === 'conjunction' ? '<dt>Separation</dt><dd class="num">' + e.conj.sep.toFixed(2) + ' degrees</dd>' : '') +
        (e.kind === 'elongation' ? '<dt>Elongation</dt><dd class="num">' + Math.round(e.elong) + ' degrees</dd>' : '') +
        (e.kind === 'moon' ? '<dt>Distance</dt><dd class="num">' + Math.round(e.dist).toLocaleString() + ' km</dd>' : '') +
        '</dl>'));
    }
    if (e.kind !== 'season' && e.kind !== 'moon') {
      H.push('<p class="h2">Where to look</p>');
      H.push(card('<canvas id="dialCv"></canvas>', 'flush'));
    }
    H.push(card('<p class="note">' + esc(copy || '') + '</p>'));
    return H.join('');
  }

  /** Canvases inside the detail page, drawn once the markup is in the document. */
  function drawEventPage(e, place) {
    const r = e.rating || Sky.rate(e, place);
    if (e.kind === 'shower' && $('#curveCv')) {
      const n = r.nights[0].night;
      const from = (n.bands.day.end || n.t0 + 7 * HOUR), to = (n.bands.day.start || n.t1 - 7 * HOUR);
      const series = [];
      for (let i = 0; i <= 60; i++) {
        const t = from + (to - from) * i / 60;
        series.push({ t, alt: Sky.showerAt(e.shower, t, place, n.lm).alt });
      }
      Draw.altitudeCurve($('#curveCv'), series, {
        dark: n.dark, height: 160,
        ticks: [{ t: from, label: clock(from, place) },
                { t: (from + to) / 2, label: clock((from + to) / 2, place) },
                { t: to, label: clock(to, place) }]
      });
    }
    if ($('#eclCv')) {
      const l = e.ecl.local || e.ecl.global;
      if (e.kind === 'solar-eclipse') {
        const mag = l.magnitude != null ? l.magnitude : 0.5;
        Draw.eclipseDisc($('#eclCv'), { kind: 'solar', ratio: 1.0, sep: Math.max(0, 1 - mag) * 1.4, height: 150 });
      } else {
        Draw.eclipseDisc($('#eclCv'), { kind: 'lunar', shadow: 2.6, sep: Math.max(0, 2.6 - l.umbralMag * 1.4), height: 150 });
      }
    }
    if ($('#dialCv')) {
      const key = e.planet || (e.conj && (e.conj.a === 'moon' ? e.conj.b : e.conj.a));
      const marks = [];
      if (key) {
        const j = Astro.jdFromMs(r.at || e.at);
        const p = key === 'moon' ? Astro.moon(j) : Astro.planet(key, j);
        const aa = Astro.altaz(p.ra, p.dec, j, place.lat, place.lon);
        marks.push({ az: aa.az, alt: aa.alt, label: A_NAME(key) });
        if (e.conj) {
          const q = e.conj.a === 'moon' ? Astro.moon(j) : Astro.planet(e.conj.a, j);
          const ab = Astro.altaz(q.ra, q.dec, j, place.lat, place.lon);
          marks.push({ az: ab.az, alt: ab.alt, label: A_NAME(e.conj.a), dim: true });
        }
      }
      if (marks.length) Draw.skyDial($('#dialCv'), marks, { height: 160 });
    }
  }
  const A_NAME = k => k === 'moon' ? 'Moon' : (Astro.PLANETS[k] ? Astro.PLANETS[k].name : k);

  /* ================= PLACES ================= */

  function renderPlaces() {
    const places = Store.places(), home = Store.home(), cmp = Store.compare();
    const H = ['<h1 class="h1">Places</h1>',
      '<p class="lede">Umbra never asks the phone where you are. You tell it, once, and you can add a dark ' +
      'site to compare against your own back garden.</p>'];

    for (const p of places) {
      const isHome = home && p.id === home.id;
      const b = Data.BORTLE[p.bortle];
      H.push(card(
        '<div class="placehead">' +
        '<div><h3>' + esc(p.name) + (isHome ? ' <span class="badge">Home</span>' : '') +
        (cmp && cmp.id === p.id ? ' <span class="badge quiet">Compared</span>' : '') + '</h3>' +
        '<p class="tiny">' + p.lat.toFixed(3) + ', ' + p.lon.toFixed(3) + '</p>' +
        '<p class="tiny">Bortle ' + p.bortle + ', ' + esc(b.label.toLowerCase()) +
        '. Stars to magnitude ' + b.lm.toFixed(1) + '.</p></div></div>' +
        '<div class="btnrow">' +
        (isHome ? '' : '<button class="btn ghost sm" data-act="sethome" data-id="' + p.id + '">Make home</button>') +
        (isHome ? '' : '<button class="btn ghost sm" data-act="compare" data-id="' + p.id + '">' +
          (cmp && cmp.id === p.id ? 'Stop comparing' : 'Compare') + '</button>') +
        '<button class="btn ghost sm" data-act="editplace" data-id="' + p.id + '">Edit</button>' +
        (places.length > 1 ? '<button class="btn ghost sm danger" data-act="delplace" data-id="' + p.id + '">Remove</button>' : '') +
        '</div>'));
    }

    H.push('<div class="btnrow"><button class="btn" data-act="addplace">Add a place</button></div>');

    if (home && cmp) {
      const a = tonightModel(home), b = tonightModel(cmp);
      H.push('<p class="h2">Tonight, side by side</p>');
      H.push(card('<div class="cols">' + [a, b].map(m =>
        '<div><h4>' + esc(m.n.place.name) + '</h4><dl>' +
        '<dt>Score</dt><dd class="num">' + m.score.value.toFixed(1) + '</dd>' +
        '<dt>Sky limit</dt><dd class="num">mag ' + m.n.lm.toFixed(1) + '</dd>' +
        '<dt>True darkness</dt><dd>' + hoursText(m.n.darkHours) + '</dd>' +
        '<dt>Best thing</dt><dd>' + esc(m.list[0] ? m.list[0].title : 'nothing on') + '</dd>' +
        '</dl></div>').join('') + '</div>' +
        '<p class="note">' + esc(compareLine(a, b)) + '</p>'));
    } else if (home && Store.places().length > 1) {
      H.push('<p class="note">Pick Compare on a second place to see tonight from both, side by side.</p>');
    }

    H.push('<p class="h2">What Bortle means</p>');
    H.push(card(Data.BORTLE.slice(1).map(b =>
      '<div class="row static"><span class="when"><b>' + b.n + '</b></span>' +
      '<span class="t"><b>' + esc(b.label) + '</b><i>' + esc(b.blurb) + '</i></span>' +
      '<span class="r quiet num">mag ' + b.lm.toFixed(1) + '</span></div>').join('')));
    $('#placesBody').innerHTML = H.join('');
    stagger($('#placesBody'));
  }

  function compareLine(a, b) {
    const sa = a.list.find(h => h.type === 'shower'), sb = b.list.find(h => h.type === 'shower');
    if (sa && sb && sb.best && sa.best && Math.abs(sa.best.rate - sb.best.rate) > 2)
      return 'Tonight that difference is worth about ' + Math.round(Math.abs(sb.best.rate - sa.best.rate)) +
        ' meteors an hour on the ' + sa.title + '.';
    const d = (b.n.lm - a.n.lm);
    if (Math.abs(d) < 0.3) return 'The two skies are close enough tonight that the drive is not buying you much.';
    return 'About ' + Math.abs(d).toFixed(1) + ' of a magnitude between them tonight, which is roughly ' +
      (Math.abs(d) > 1 ? 'two or three times' : 'half again') + ' as many stars from the darker one.';
  }

  function placeSheet(id) {
    const p = id ? Store.place(id) : null;
    const draft = p ? { ...p } : { name: '', lat: '', lon: '', bortle: 6 };
    openSheet(p ? 'Edit place' : 'Add a place', () =>
      '<div class="field"><label for="pName">Name</label>' +
      '<input type="text" id="pName" maxlength="40" placeholder="Home, the field by the lake" value="' + esc(draft.name) + '"></div>' +
      '<div class="field"><label for="pCity">Find a city</label>' +
      '<input type="text" id="pCity" placeholder="Type a few letters" autocomplete="off"></div>' +
      '<div id="cityHits" class="picks"></div>' +
      '<div class="two"><div class="field"><label for="pLat">Latitude</label>' +
      '<input type="text" inputmode="decimal" id="pLat" value="' + esc(draft.lat) + '" placeholder="57.7089"></div>' +
      '<div class="field"><label for="pLon">Longitude</label>' +
      '<input type="text" inputmode="decimal" id="pLon" value="' + esc(draft.lon) + '" placeholder="11.9746"></div></div>' +
      '<p class="tiny">South and west are negative. Anywhere within about fifty kilometres gives the same answers.</p>' +
      '<div class="field"><label>How dark is this sky?</label><div class="picks" id="bortlePicks">' +
      Data.SKY_CHECK.map(c => '<button class="pick' + (c.b === draft.bortle ? ' on' : '') +
        '" data-act="bortle" data-b="' + c.b + '"><b>' + esc(c.label) + '</b><i>' + esc(c.sub) +
        ', Bortle ' + c.b + '</i></button>').join('') + '</div></div>' +
      '<div class="field"><label for="bSlider">Fine tune: Bortle <span id="bVal">' + draft.bortle + '</span></label>' +
      '<input type="range" id="bSlider" min="1" max="9" step="1" value="' + draft.bortle + '"></div>' +
      '<button class="btn" data-act="saveplace" data-id="' + (p ? p.id : '') + '">' +
      (p ? 'Save place' : 'Add place') + '</button>',
      () => wirePlaceSheet(draft));
  }

  function wirePlaceSheet(draft) {
    const hits = $('#cityHits'), city = $('#pCity');
    city.addEventListener('input', () => {
      const q = city.value.trim().toLowerCase();
      if (q.length < 2) { hits.innerHTML = ''; return; }
      const found = Data.CITIES.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6);
      hits.innerHTML = found.length ? found.map(c =>
        '<button class="pick" data-act="city" data-lat="' + c.lat + '" data-lon="' + c.lon + '" data-name="' + esc(c.name) + '">' +
        '<b>' + esc(c.name) + '</b><i>' + esc(c.cc) + ', ' + c.lat.toFixed(2) + ' ' + c.lon.toFixed(2) + '</i></button>').join('')
        : '<p class="tiny pad-s">No match. Type the coordinates below instead.</p>';
    });
    const sl = $('#bSlider');
    sl.addEventListener('input', () => {
      $('#bVal').textContent = sl.value;
      document.querySelectorAll('#bortlePicks .pick').forEach(b =>
        b.classList.toggle('on', b.dataset.b === sl.value));
    });
  }

  /* ================= LOG ================= */

  function renderLog() {
    const t = Store.ticks(), st = Store.stats(), entries = Store.log(), place = Store.home();
    const H = ['<h1 class="h1">The log</h1>',
      '<p class="lede">A life list is a naturalist\'s habit: you are not collecting points, you are ' +
      'keeping track of what the sky has actually shown you.</p>'];

    H.push(card('<dl class="kv">' +
      '<dt>Life list</dt><dd class="num">' + st.got + ' of ' + st.total + '</dd>' +
      '<dt>Nights out this year</dt><dd class="num">' + st.nights + '</dd>' +
      '<dt>Entries</dt><dd class="num">' + st.entries + '</dd></dl>' +
      '<div class="btnrow"><button class="btn" data-act="log-new">Log an observation</button></div>'));

    for (const g of Data.LIFE) {
      H.push('<p class="h2">' + esc(g.g) + '</p>');
      H.push('<div class="card"><div class="life">' + g.items.map(it => {
        const got = t[it.id];
        return '<button class="lifeitem' + (got ? ' got' : '') + '" data-act="life" data-id="' + it.id + '">' +
          '<span class="tickbox"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span>' +
          '<span><b>' + esc(it.name) + '</b><i>' + esc(got ?
            ('first on ' + dateLong(got.first, place) + ' ' + P(got.first, place).getUTCFullYear()) : it.hint) + '</i></span>' +
          '<span class="cnt">' + (got ? (got.count > 1 ? got.count + ' times' : 'seen') : '') + '</span></button>';
      }).join('') + '</div></div>');
    }

    if (entries.length) {
      H.push('<p class="h2">Entries</p>');
      H.push('<div class="card">' + entries.slice(0, 40).map(e => {
        const known = Store.place(e.placeId), pl = known || place;
        const names = e.phenomena.map(id => (Data.LIFE_INDEX[id] || {}).name || id).join(', ');
        const where = known ? known.name : '';
        return '<button class="row" data-act="entry" data-id="' + e.id + '">' +
          '<span class="when"><b>' + dayNum(e.at, pl) + '</b>' + monShort(e.at, pl) + '</span>' +
          '<span class="t"><b>' + esc(names || 'A night out') + '</b><i>' +
          esc(where + (e.note ? (where ? ' \u00B7 ' : '') + e.note.slice(0, 60) : '')) + '</i></span>' + CHEV + '</button>';
      }).join('') + '</div>');
      H.push('<div class="btnrow"><button class="btn ghost" data-act="export">Export everything</button></div>');
      H.push('<p class="note">The export is a JSON file written to your Downloads folder. It is the whole log, ' +
        'the places and the life list, and it never leaves the phone unless you send it somewhere.</p>');
    } else {
      H.push(card(emptyState(Art.telescope(), 'Nothing logged yet', 'The first entry is usually the Moon, and that counts.')));
    }
    $('#logBody').innerHTML = H.join('');
    stagger($('#logBody'));
  }

  function logSheet(entryId) {
    const place = Store.home();
    const existing = entryId ? Store.log().find(e => e.id === entryId) : null;
    const m = existing ? null : tonightModel(place);
    const picked = new Set(existing ? existing.phenomena : []);
    openSheet(existing ? 'Edit entry' : 'Log an observation', () =>
      '<p class="tiny">' + (existing ? 'Logged ' + dateLong(existing.at, place) + '.'
        : 'Tonight from ' + esc(place.name) + '. Umbra attaches the conditions it computed, so the entry ' +
          'remembers what the sky was actually like.') + '</p>' +
      '<div class="field"><label>What did you see?</label><div class="picks" id="phPicks">' +
      Data.LIFE.map(g => '<p class="grp">' + esc(g.g) + '</p>' +
        g.items.map(it => '<button class="pick' + (picked.has(it.id) ? ' on' : '') +
          '" data-act="ph" data-id="' + it.id + '"><b>' + esc(it.name) + '</b></button>').join('')).join('') +
      '</div></div>' +
      '<div class="field"><label for="lgNote">A line about it</label>' +
      '<textarea id="lgNote" maxlength="600" placeholder="Cold, clear, three bright ones in twenty minutes.">' +
      esc(existing ? existing.note : '') + '</textarea></div>' +
      (m ? '<p class="tiny">Attached: score ' + m.score.value.toFixed(1) + ', sky limit magnitude ' +
        m.n.lm.toFixed(1) + ', Moon ' + Math.round(m.n.moon.illum * 100) + ' per cent.</p>' : '') +
      '<div class="btnrow stick"><button class="btn" data-act="save-log" data-id="' + (existing ? existing.id : '') + '">' +
      (existing ? 'Save' : 'Save entry') + '</button>' +
      (existing ? '<button class="btn ghost danger" data-act="del-log" data-id="' + existing.id + '">Delete</button>' : '') +
      '</div>', () => { logSheet.picked = picked; logSheet.model = m; });
  }

  /* ================= SETTINGS ================= */

  function settingsPage() {
    const s = Store.settings(), a = s.alerts, place = Store.home();
    const H = [];
    H.push('<p class="h2">Alerts</p>');
    H.push(card(
      toggleRow('alerts-on', 'Evening heads up', 'One notification on the evening of a night that clears your score.', a.on) +
      '<div class="field"><label for="minS">Tell me when a night scores <b class="num" id="minV">' +
      a.min.toFixed(1) + '</b> or better</label>' +
      '<input type="range" id="minS" min="5" max="9.5" step="0.5" value="' + a.min + '">' +
      '<p class="tiny" id="ceilNote">Working out what your sky can actually reach.</p></div>' +
      '<div class="field"><label for="hourS">Send it at <b class="num" id="hourV">' + a.hour + ':00</b></label>' +
      '<input type="range" id="hourS" min="12" max="22" step="1" value="' + a.hour + '"></div>' +
      toggleRow('alerts-ecl', 'Eclipses', 'Three days ahead, and again three quarters of an hour before it ' +
        'starts, whatever the hour. A penumbral eclipse stays in the calendar.', a.eclipses) +
      toggleRow('alerts-dig', 'Sunday digest', 'The best night of the coming week, once a week.', a.digest)));
    if (a.on) H.push(card('<h3>What is scheduled</h3><div id="planBox">' + Art.skeleton(3) + '</div>'));

    H.push('<p class="h2">Display</p>');
    H.push(card(
      toggleRow('clock', 'Twenty four hour clock', 'Off gives am and pm.', s.clock24) +
      '<div class="field"><label>Red light</label><div class="picks">' +
      [['off', 'Off', 'The normal palette'],
       ['on', 'On', 'Everything in red, to protect dark adapted eyes'],
       ['auto', 'After dusk', 'Red once the sun is more than six degrees down']].map(([v, t, sub]) =>
        '<button class="pick' + (s.red === v ? ' on' : '') + '" data-act="red" data-v="' + v + '"><b>' +
        t + '</b><i>' + sub + '</i></button>').join('') + '</div></div>'));

    H.push('<p class="h2">Your data</p>');
    H.push(card('<p class="tiny">Everything Umbra knows is one record in this app\'s own storage: your places, ' +
      'your log, your settings. There is no account, no sync and no network permission.</p>' +
      '<div class="btnrow"><button class="btn ghost" data-act="export">Export as JSON</button>' +
      '<button class="btn ghost" data-act="import">Import a backup</button></div>' +
      '<input type="file" id="importFile" accept="application/json,.json" hidden>' +
      '<p class="tiny" id="importNote"></p>' +
      '<div class="btnrow"><button class="btn ghost danger" data-act="erase">Erase everything</button></div>'));

    H.push('<p class="h2">About</p>');
    H.push(card('<button class="row" data-act="method"><span class="t"><b>How the numbers are made</b>' +
      '<i>The algorithms, the approximations and the limits</i></span>' + CHEV + '</button>' +
      '<div class="row static"><span class="t"><b>Umbra</b>' +
      '<i>An offline sky almanac. No network, no account, no adverts, nothing to buy.</i></span></div>'));
    return H.join('');
  }

  const toggleRow = (id, title, sub, on) =>
    '<div class="toggle"><div class="t"><b>' + esc(title) + '</b><i>' + esc(sub) + '</i></div>' +
    '<button class="sw' + (on ? ' on' : '') + '" data-act="toggle" data-id="' + id + '" ' +
    'role="switch" aria-checked="' + (!!on) + '" aria-label="' + esc(title) + '"></button></div>';

  function methodPage() {
    return '<div class="method">' +
      card('<h3>What Umbra computes</h3>' +
        '<p>Positions of the Sun, the Moon and the planets come from standard published series: Meeus\' ' +
        'Astronomical Algorithms for the Sun, the Moon, sidereal time and eclipse geometry, and JPL\'s Keplerian ' +
        'elements for the planets. They run on this phone in a few milliseconds. Sunrise, twilight and moonrise are ' +
        'found by sampling altitude and bisecting the crossing, with the usual refraction allowance.</p>') +
      card('<h3>Meteor rates</h3>' +
        '<p>Shower elements follow the IMO working list. The number you see is the standard rate formula: the ' +
        'zenithal hourly rate, cut by how high the radiant is and by how much of the sky your light pollution and ' +
        'the Moon have taken away. It assumes a clear sky and an unobstructed view. A hedge, a house or a ' +
        'streetlight will take a large bite out of it.</p>') +
      card('<h3>The three honest approximations</h3>' +
        '<p><b>Moonlight.</b> The magnitudes lost to the Moon are modelled from its phase and altitude, not from a ' +
        'full scattering model. Treat it as a good guide rather than a measurement.</p>' +
        '<p><b>Eclipse edges.</b> Local circumstances use the Moon\'s mean limb, so magnitude is good to a fraction ' +
        'of a per cent. Within a few kilometres of the edge of a path of totality, check an official map.</p>' +
        '<p><b>Your sky.</b> Bortle is your own judgement, not a measurement. If the app feels optimistic, move ' +
        'yourself a class brighter and it will agree with you.</p>') +
      card('<h3>What Umbra cannot do</h3>' +
        '<p>It has no network permission, so it cannot see clouds, and a sky score is not a forecast. It does not ' +
        'predict aurora: that needs live solar wind data from a server, and an aurora alert that cannot see the ' +
        'Kp index would be a lie. It does not track satellites, because their orbits change faster than an offline ' +
        'app could keep up with. It will never ask for your location, an account or a payment.</p>') +
      card('<h3>The alert rule</h3>' +
        '<p>Umbra sends at most one notification a day, in the evening, and only for a night that clears the ' +
        'score you set yourself. The one exception is an eclipse you can see from here: that gets a warning ' +
        'three quarters of an hour before it starts, even in the small hours, and the Eclipses switch turns it ' +
        'off. It would rather stay silent than waste a clear evening of your attention on a marginal one.</p>') + '</div>';
  }

  /* ================= onboarding ================= */

  function renderOnboard() {
    const B = $('#onboardBody');
    if (onboardStep === 0) {
      const d = onboardDraft;
      B.innerHTML = '<div class="obmark">' + Art.eclipse(1, 'live') + '</div>' +
        '<h1 class="h1">Umbra</h1>' +
        '<p class="lede">A sky almanac that runs entirely on this phone. It works out what is happening above ' +
        'your head tonight, how dark it will get, and whether that is worth going outside for.</p>' +
        card('<h3>Where do you watch from?</h3>' +
          '<div class="field"><label for="obCity">Find a city near you</label>' +
          '<input type="text" id="obCity" placeholder="Type a few letters" autocomplete="off" value="' + esc(d.name || '') + '"></div>' +
          '<div id="obHits" class="picks"></div>' +
          '<div class="two"><div class="field"><label for="obLat">Latitude</label>' +
          '<input type="text" inputmode="decimal" id="obLat" placeholder="51.5074" value="' + esc(d.lat != null ? d.lat : '') + '"></div>' +
          '<div class="field"><label for="obLon">Longitude</label>' +
          '<input type="text" inputmode="decimal" id="obLon" placeholder="-0.1278" value="' + esc(d.lon != null ? d.lon : '') + '"></div></div>' +
          '<p class="tiny">Umbra never asks the phone for your position. Anywhere within fifty kilometres ' +
          'gives the same answers.</p>') +
        '<button class="btn" data-act="ob-next">Continue</button>';
      const city = $('#obCity'), hits = $('#obHits');
      city.addEventListener('input', () => {
        const q = city.value.trim().toLowerCase();
        if (q.length < 2) { hits.innerHTML = ''; return; }
        const found = Data.CITIES.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6);
        hits.innerHTML = found.map(c => '<button class="pick" data-act="ob-city" data-lat="' + c.lat +
          '" data-lon="' + c.lon + '" data-name="' + esc(c.name) + '"><b>' + esc(c.name) + '</b><i>' +
          esc(c.cc) + '</i></button>').join('') ||
          '<p class="tiny pad-s">No match. Coordinates work too.</p>';
      });
    } else if (onboardStep === 1) {
      B.innerHTML = '<h1 class="h1">How dark is your sky?</h1>' +
        '<p class="lede">This one answer changes almost every number in the app. Go outside on the next clear ' +
        'night if you are not sure, and change it later in Places.</p>' +
        '<div class="picks">' + Data.SKY_CHECK.map(c =>
          '<button class="pick' + (onboardDraft.bortle === c.b ? ' on' : '') + '" data-act="ob-bortle" data-b="' + c.b + '">' +
          '<b>' + esc(c.label) + '</b><i>' + esc(c.sub) + '</i></button>').join('') + '</div>' +
        '<div class="btnrow"><button class="btn ghost" data-act="ob-back">Back</button>' +
        '<button class="btn" data-act="ob-next">Continue</button></div>';
    } else {
      B.innerHTML = '<h1 class="h1">The promise</h1>' +
        '<p class="lede">Most sky apps lose people by crying wolf. Umbra is built the other way round.</p>' +
        card('<p class="note fg">It sends at most one notification a day, in the evening, and only for a ' +
          'night that clears a score you set yourself. The one thing allowed to wake you is an eclipse you can ' +
          'see from here, and you can switch that off. It has no network permission, so it cannot see clouds ' +
          'and it will never claim to. Everything else it tells you is computed here, from the same algorithms ' +
          'an observatory uses.</p>') +
        card('<h3>Evening heads up</h3><p class="tiny">On the evening of a night worth going out for. You can ' +
          'change the bar, or turn this off, at any time in Settings.</p>' +
          '<div class="btnrow"><button class="btn" data-act="ob-alerts">Turn alerts on</button>' +
          '<button class="btn ghost" data-act="ob-done">Not now</button></div>');
    }
  }

  /* ================= chrome ================= */

  function setView(v) {
    view = v;
    for (const id of ['tonight', 'events', 'places', 'log'])
      $('#v-' + id).hidden = id !== v;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.view === v));
    if (v === 'tonight') renderTonight();
    if (v === 'events') renderEvents();
    if (v === 'places') renderPlaces();
    if (v === 'log') renderLog();
  }

  function openPage(title, render, key) {
    const same = page && page.key === key;
    if (page && !same) pageStack.push(page);
    page = { title, render, key };
    $('#pageTitle').textContent = title;
    $('#pageBody').innerHTML = render();
    stagger($('#pageBody'));
    const wasHidden = $('#page').hidden;
    $('#page').hidden = false;
    $('#page').classList.toggle('stacked', pageStack.length > 0);
    if (!same) $('#page').querySelector('.pagescroll').scrollTop = 0;
    // The slow pieces of Settings land after the page has slid in, not before it can.
    if (key === 'set') setTimeout(fillPlan, wasHidden ? 380 : 40);
    if (key && key.startsWith('ev')) {
      const e = (feed || []).find(x => 'ev' + x.key === key);
      if (e) drawEventPage(e, Store.home());
    }
  }
  function closePage() {
    const prev = pageStack.pop();
    page = null;
    if (prev) { openPage(prev.title, prev.render, prev.key); return; }
    $('#page').hidden = true;
    $('#page').classList.remove('stacked');
  }

  /** The schedule card and the ceiling note, computed once the page is on screen. */
  function fillPlan() {
    if (!page || page.key !== 'set') return;
    const box = $('#planBox'), place = Store.home();
    if (box && place) {
      const plan = Notify.plan(null, reminderAlerts());
      box.innerHTML = plan.length
        ? '<p class="tiny">' + plan.length + ' notification' + (plan.length === 1 ? '' : 's') +
          ' over the next six weeks. Umbra sends at most one a day.</p>' +
          plan.slice(0, 6).map(o => '<div class="row static">' +
            '<span class="when"><b>' + dayNum(o.at, place) + '</b>' + monShort(o.at, place) + '</span>' +
            '<span class="t"><b>' + esc(o.title) + '</b><i>' + esc(o.body.slice(0, 90)) + '</i></span></div>').join('')
        : '<p class="tiny">Nothing clears your bar in the next six weeks. That is the app working, not failing.</p>';
    }
    fillCeiling();
  }

  /** How good does it get here? Without this the threshold slider is a guess. */
  function fillCeiling() {
    const el = $('#ceilNote');
    if (!el) return;
    const c = Notify.ceiling(42);
    const place = Store.home();
    if (!c) { el.textContent = ''; return; }
    const lead = 'The best night from ' + place.name + ' over the next six weeks scores ' +
      c.value.toFixed(1) + ', on ' + wdayName(c.t0, place) + ' ' + dateLong(c.t0, place) + '.';
    el.textContent = Store.settings().alerts.min > c.value
      ? lead + ' Your bar sits above that, so no evening heads up goes out in the next six weeks. ' +
        'That is what a bar set for the best nights of the year looks like from this sky.'
      : lead + ' Anything at or above your bar reaches you that evening.';
  }

  let sheetWire = null;
  function openSheet(title, render, wire) {
    $('#sheetTitle').textContent = title;
    $('#sheetBody').innerHTML = render();
    $('#sheet').hidden = false;
    $('#sheet').querySelector('.sheet-panel').scrollTop = 0;
    sheetWire = wire || null;
    if (wire) wire();
  }
  function closeSheet() { $('#sheet').hidden = true; sheetWire = null; }

  function applyRed() {
    const s = Store.settings();
    let on = s.red === 'on';
    if (s.red === 'auto') {
      const p = Store.home();
      if (p) {
        const j = Astro.jdFromMs(Date.now()), su = Astro.sun(j);
        on = Astro.altaz(su.ra, su.dec, j, p.lat, p.lon).alt < -6;
      }
    }
    document.documentElement.setAttribute('data-red', on ? 'on' : 'off');
    $('#redBtn').classList.toggle('on', on);
    redAuto = s.red === 'auto';
  }

  function refreshTop() {
    const p = Store.home();
    if (!p) return;
    $('#placeName').textContent = p.name;
    $('#placeSub').textContent = 'Bortle ' + p.bortle + ' \u00B7 ' + p.lat.toFixed(2) + ', ' + p.lon.toFixed(2);
  }

  function invalidate() {
    nightCache = {}; feed = null; feedFor = null;
  }

  /** True when the year of events for the home place is in hand. Otherwise it starts
      working one out and calls `then` when it lands. */
  function ensureFeed(then) {
    const place = Store.home();
    if (!place) return false;
    if (feedFor === place.id) return true;
    // Two frames first, so the placeholder rows are on screen before the year is worked out.
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      feed = Sky.feed(place, Date.now() - 6 * HOUR, 365);
      feedFor = place.id;
      if (view === 'events') renderEvents();
      if (then) then();
    }, 0)));
    return false;
  }

  /** The reminders the user set by hand, turned into an evening alert on the night the
      event belongs to. Without this the Remind me button would only store a flag. */
  function reminderAlerts() {
    const place = Store.home();
    if (!place || !feed) return [];
    const a = Store.settings().alerts;
    const now = Date.now();
    const out = [];
    for (const e of feed) {
      if (!Store.reminded(e.key)) continue;
      if (e.kind === 'shower' && !e.nightAt) Sky.rate(e, place);
      const when = e.kind === 'shower' && e.nightAt ? e.nightAt : e.at;
      // The night is anchored at noon, so the alert time is what decides whether it has passed.
      const at = Notify.atHour(Sky.anchorFor(when, place), place, a.hour);
      if (at < now) continue;
      out.push({
        at, kind: 'remind', score: 9.5,
        title: e.title + ', from ' + place.name,
        body: eventSub(e, place) + '. You asked Umbra to remind you. Clouds are the one thing it cannot see.'
      });
    }
    return out;
  }

  /** Recompute the whole schedule. Reminders need the year of events, so a cold start
      works that out first and comes back here. */
  function syncNotify() {
    if (!Store.home()) return;
    if (Object.keys(Store.raw.reminders).length && !ensureFeed(syncNotify)) return;
    Notify.sync(reminderAlerts());
  }

  /** Put the alert bar where this sky can actually reach, once, and never over the top
      of a bar the user has set for themselves. */
  let tuning = false;
  const skyKey = p => p ? p.id + ':' + p.bortle : null;
  function tuneAlertBar() {
    const a = Store.settings().alerts, home = Store.home();
    if (!home || tuning || a.minSet) return;
    const key = skyKey(home);
    if (a.tunedFor === key) return;
    tuning = true;
    Notify.calibrate(v => {
      tuning = false;
      if (v == null) return;
      if (Store.settings().alerts.minSet) return;
      Store.setAlert('min', v);
      Store.setAlert('tunedFor', key);
      if (skyKey(Store.home()) !== key) { tuneAlertBar(); return; }
      /* Calibration lands seconds after the page was drawn. Move the slider in place rather
         than redrawing Settings, which would wipe an import result or an inline error the
         user is still reading. */
      if (page && page.key === 'set' && $('#minS')) {
        $('#minS').value = v;
        $('#minV').textContent = v.toFixed(1);
        fillPlan();
      }
      syncNotify();
    });
  }

  /* ================= actions ================= */

  function act(name, ds, target, ev) {
    /* A second tap on the same switch inside a third of a second is the same thumb, not a
       change of mind: Compare, Remind me and the toggles all redraw under the finger. Event
       time, not wall time, so a slow redraw after the first tap cannot stretch the window. */
    if (name === 'compare' || name === 'remind' || name === 'toggle') {
      const k = name + ':' + (ds.id || ds.key || ''), t = ev && ev.timeStamp ? ev.timeStamp : performance.now();
      if (k === act.flip && t - act.flipAt < 350) return;
      act.flip = k; act.flipAt = t;
    }
    const place = Store.home();
    switch (name) {
      case 'happening': {
        const m = tonightModel(place), h = m.list[+ds.i];
        if (!h) return;
        openPage(h.title, () => happeningPage(h, m, place), 'hap');
        break;
      }
      case 'target': {
        const t = Data.TARGETS.find(x => x.id === ds.id);
        const m = tonightModel(place);
        const found = m.targets.find(x => x.id === ds.id) || t;
        openSheet(t.name, () => '<p class="note fg">' + esc(t.blurb) + '</p>' +
          '<dl class="kv gap">' +
          '<dt>Best tonight</dt><dd>' + deg(found.alt || 0) + ' up, ' + Data.compass(found.az || 0) +
          ', ' + clock(found.at || Date.now(), place) + '</dd>' +
          (t.mag != null ? '<dt>Magnitude</dt><dd class="num">' + t.mag.toFixed(1) + '</dd>' : '') +
          '<dt>How to see it</dt><dd>' + esc(t.kind) + '</dd>' +
          '<dt>Needs</dt><dd>Bortle ' + t.maxB + ' or darker</dd></dl>' +
          (found.easy === false ? '<p class="note">Your sky is brighter than this one usually wants. ' +
            'Binoculars close most of that gap.</p>' : ''));
        break;
      }
      case 'tomorrow': {
        const m = tonightModel(place, Date.now() + DAY);
        openPage('Tomorrow night', () => nightPage(m, place), 'tom');
        break;
      }
      case 'filter': feedFilter = ds.id; renderEvents(); break;
      case 'event': openEvent(ds.key); break;
      case 'remind': {
        const on = Store.toggleReminder(ds.key);
        buzz(12, 80);
        toast(on ? 'Reminder set for that night' : 'Reminder removed');
        if (page) openPage(page.title, page.render, page.key);
        syncNotify();
        break;
      }
      case 'addplace': placeSheet(null); break;
      case 'editplace': placeSheet(ds.id); break;
      case 'city': {
        $('#pLat').value = ds.lat; $('#pLon').value = ds.lon;
        if (!$('#pName').value.trim()) $('#pName').value = ds.name;
        $('#cityHits').innerHTML = ''; $('#pCity').value = '';
        break;
      }
      case 'bortle': {
        $('#bSlider').value = ds.b; $('#bVal').textContent = ds.b;
        document.querySelectorAll('#bortlePicks .pick').forEach(b => b.classList.toggle('on', b.dataset.b === ds.b));
        break;
      }
      case 'saveplace': {
        const name = $('#pName').value.trim() || 'My sky';
        const lat = parseFloat($('#pLat').value), lon = parseFloat($('#pLon').value);
        const bortle = parseInt($('#bSlider').value, 10);
        if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          inlineErr('#sheetBody', 'Those coordinates do not look right. Latitude runs from -90 to 90 and longitude from -180 to 180.');
          return;
        }
        const dup = Store.places().find(p => p.id !== ds.id && p.name.toLowerCase() === name.toLowerCase());
        if (dup) { inlineErr('#sheetBody', 'You already have a place called ' + dup.name + '. Give this one its own name.'); return; }
        if (ds.id) Store.patchPlace(ds.id, { name, lat: +lat.toFixed(4), lon: +lon.toFixed(4), bortle });
        else Store.addPlace({ name, lat, lon, bortle });
        invalidate(); closeSheet(); refreshTop(); setView('places');
        tuneAlertBar(); syncNotify();
        toast(ds.id ? 'Place saved' : 'Place added');
        break;
      }
      case 'sethome': Store.setHome(ds.id); invalidate(); refreshTop(); renderPlaces();
        tuneAlertBar(); syncNotify(); break;
      case 'compare': Store.setCompare(ds.id); renderPlaces(); break;
      case 'delplace': {
        if (Store.places().length < 2) return;
        const p = Store.place(ds.id);
        if (!p) return;
        const n = Store.log().filter(e => e.placeId === p.id).length;
        openSheet('Remove ' + p.name, () => '<p class="note fg">' +
          (n ? n + ' log ' + (n === 1 ? 'entry keeps its' : 'entries keep their') + ' conditions but the place name comes off ' +
               (n === 1 ? 'it' : 'them') + '. ' : '') + 'There is no undo.</p>' +
          '<div class="btnrow"><button class="btn ghost" data-act="close-sheet">Keep it</button>' +
          '<button class="btn danger" data-act="delplace-yes" data-id="' + p.id + '">Remove</button></div>');
        break;
      }
      case 'delplace-yes': {
        if (Store.places().length < 2) return;
        Store.removePlace(ds.id); closeSheet(); invalidate(); refreshTop(); renderPlaces();
        tuneAlertBar(); syncNotify();
        toast('Place removed');
        break;
      }
      case 'log-new': closeSheet(); logSheet(null); break;
      case 'entry': logSheet(ds.id); break;
      case 'ph': {
        const set = logSheet.picked;
        if (set.has(ds.id)) set.delete(ds.id); else set.add(ds.id);
        target.classList.toggle('on');
        buzz(8, 60);
        break;
      }
      case 'save-log': {
        const set = logSheet.picked, note = $('#lgNote').value.trim();
        if (!set.size && !note) { inlineErr('#sheetBody', 'Pick something you saw, or write a line about the night.'); return; }
        const m = logSheet.model;
        if (ds.id) Store.patchEntry(ds.id, { phenomena: [...set], note });
        else Store.addEntry({
          at: Date.now(), nightOf: m ? m.n.t0 : Date.now(), placeId: place.id,
          phenomena: [...set], note,
          ctx: m ? { score: m.score.value, lm: +m.n.lm.toFixed(1), moon: +m.n.moon.illum.toFixed(2),
                     bortle: place.bortle, top: m.list[0] ? m.list[0].title : null } : {}
        });
        closeSheet(); buzz(18, 120); renderLog();
        toast(ds.id ? 'Entry saved' : 'Logged');
        break;
      }
      case 'del-log': Store.removeEntry(ds.id); closeSheet(); renderLog(); toast('Entry deleted'); break;
      case 'life': {
        const it = Data.LIFE_INDEX[ds.id];
        const got = Store.ticks()[ds.id];
        openSheet(it.name, () => '<p class="note fg">' + esc(it.hint) + '</p>' +
          (got ? '<dl class="kv gap"><dt>First seen</dt><dd>' +
            dateLong(got.first, place) + ' ' + P(got.first, place).getUTCFullYear() + '</dd>' +
            '<dt>Times</dt><dd class="num">' + got.count + '</dd></dl>'
            : '<p class="note">Not on your list yet.</p>') +
          '<div class="btnrow"><button class="btn" data-act="log-new">Log an observation</button></div>');
        break;
      }
      case 'toggle': {
        const s = Store.settings();
        if (ds.id === 'alerts-on') {
          const on = !s.alerts.on;
          Store.setAlert('on', on);
          if (on) { Notify.request(); syncNotify(); } else Notify.cancel();
        }
        if (ds.id === 'alerts-ecl') Store.setAlert('eclipses', !s.alerts.eclipses);
        if (ds.id === 'alerts-dig') Store.setAlert('digest', !s.alerts.digest);
        if (ds.id === 'clock') { Store.set('clock24', !s.clock24); setView(view); }
        syncNotify();
        openPage('Settings', settingsPage, 'set');
        break;
      }
      case 'red': Store.set('red', ds.v); applyRed(); openPage('Settings', settingsPage, 'set');
        renderTonight(); break;
      case 'method': openPage('Method', methodPage, 'meth'); break;
      case 'noop': break;
      case 'export': doExport(); break;
      case 'import': { const f = $('#importFile'); if (f) { inlineErr('#pageBody', ''); f.value = ''; f.click(); } break; }
      case 'erase': {
        openSheet('Erase everything', () =>
          '<p class="note fg">This removes your places, your log and your life list from ' +
          'this phone. There is no copy anywhere else, so it cannot be undone.</p>' +
          '<div class="btnrow"><button class="btn ghost" data-act="close-sheet">Keep it</button>' +
          '<button class="btn danger" data-act="erase-yes">Erase</button></div>');
        break;
      }
      case 'erase-yes': {
        Store.eraseAll(); Notify.cancel(); invalidate(); closeSheet(); pageStack = []; closePage();
        onboardStep = 0; onboardDraft = {}; $('#app').hidden = true; $('#onboard').hidden = false;
        renderOnboard();
        break;
      }
      case 'close-sheet': closeSheet(); break;
      case 'ob-city': onboardDraft = { ...onboardDraft, lat: +ds.lat, lon: +ds.lon, name: ds.name };
        $('#obLat').value = ds.lat; $('#obLon').value = ds.lon; $('#obHits').innerHTML = '';
        $('#obCity').value = ds.name; inlineErr('#onboardBody', ''); break;
      case 'ob-bortle': onboardDraft.bortle = +ds.b; renderOnboard(); break;
      case 'ob-back': onboardStep--; renderOnboard(); break;
      case 'ob-next': {
        if (onboardStep === 0) {
          const lat = parseFloat($('#obLat').value), lon = parseFloat($('#obLon').value);
          if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            inlineErr('#onboardBody', 'Pick a city from the list, or type coordinates: latitude -90 to 90, longitude -180 to 180.');
            return;
          }
          onboardDraft.lat = lat; onboardDraft.lon = lon;
          onboardDraft.name = onboardDraft.name || ($('#obCity').value.trim() || 'My sky');
          onboardStep = 1;
        } else if (onboardStep === 1) {
          if (!onboardDraft.bortle) { inlineErr('#onboardBody', 'Pick the one closest to your sky. You can change it later in Places.'); return; }
          onboardStep = 2;
        }
        renderOnboard();
        break;
      }
      case 'ob-alerts': case 'ob-done': {
        if (Store.home()) return;
        Store.addPlace(onboardDraft);
        Store.set('seenIntro', true);
        if (name === 'ob-alerts') { Store.setAlert('on', true); Notify.request(); }
        $('#onboard').hidden = true; $('#app').hidden = false;
        invalidate(); refreshTop(); applyRed(); setView('tonight');
        setTimeout(() => { tuneAlertBar(); syncNotify(); }, 200);
        break;
      }
    }
  }

  function happeningPage(h, m, place) {
    const H = [];
    H.push('<h1 class="h1">' + esc(h.title) + '</h1>');
    H.push('<p class="lede">' + esc(h.sub || '') + '</p>');
    if (h.type === 'shower') {
      const sh = h.shower;
      H.push(card('<dl class="kv">' +
        '<dt>Best hour tonight</dt><dd class="num">' + clock(h.best.at, place) + '</dd>' +
        '<dt>Radiant</dt><dd>' + deg(h.best.alt) + ' up, ' + Data.compass(h.best.az) + '</dd>' +
        '<dt>Meteors an hour</dt><dd class="num">' + (h.best.rate < 1 ? 'under 1' : Math.round(h.best.rate)) + '</dd>' +
        '<dt>Sky limit</dt><dd class="num">magnitude ' + m.n.lm.toFixed(1) + '</dd></dl>' +
        '<p class="note">' + esc(sh.note) + '</p>'));
    } else if (h.type === 'planet' || h.type === 'conjunction') {
      const marks = [];
      const j = Astro.jdFromMs(h.at);
      if (h.type === 'planet') {
        marks.push({ az: h.planet.az, alt: h.planet.alt, label: h.planet.name });
      } else {
        for (const k of [h.conj.a, h.conj.b]) {
          const p = k === 'moon' ? Astro.moon(j) : Astro.planet(k, j);
          const aa = Astro.altaz(p.ra, p.dec, j, place.lat, place.lon);
          marks.push({ az: aa.az, alt: aa.alt, label: A_NAME(k), dim: k !== h.conj.a });
        }
      }
      H.push(card('<canvas id="dialCv"></canvas>', 'flush'));
      H.push(card('<dl class="kv"><dt>Best at</dt><dd class="num">' + clock(h.at, place) + '</dd>' +
        (h.planet ? '<dt>Magnitude</dt><dd class="num">' + h.planet.mag.toFixed(1) + '</dd>' +
          '<dt>Rises</dt><dd class="num">' + (h.planet.rise ? clock(h.planet.rise, place) : 'up already') + '</dd>' +
          '<dt>Sets</dt><dd class="num">' + (h.planet.set ? clock(h.planet.set, place) : 'stays up') + '</dd>' : '') +
        (h.conj ? '<dt>Separation</dt><dd class="num">' + h.seen.sep.toFixed(1) + ' degrees</dd>' : '') +
        '</dl>'));
      setTimeout(() => { if ($('#dialCv')) Draw.skyDial($('#dialCv'), marks, { height: 160 }); }, 0);
    } else if (h.type === 'core') {
      H.push(card('<p class="note fg">The bright centre of our own galaxy, in Sagittarius. ' +
        'It needs a dark sky, a low southern horizon and about twenty minutes of dark adaptation. Once you have ' +
        'seen it properly you will notice it every clear summer night for the rest of your life.</p>' +
        '<dl class="kv gap"><dt>Highest tonight</dt><dd>' + deg(h.core.alt) + ' at ' +
        clock(h.core.at, place) + '</dd><dt>Direction</dt><dd>' + Data.compass(h.core.az) + '</dd></dl>'));
    } else if (h.type === 'lunar-eclipse' || h.type === 'solar-eclipse') {
      H.push(card('<p class="note fg">Open the Events tab for the full circumstances of ' +
        'this eclipse from your place.</p>'));
    } else {
      H.push(card('<p class="note fg">The dark side of a crescent Moon is lit by sunlight ' +
        'bounced off the Earth. Binoculars make it obvious, and it is at its best in the few days either side ' +
        'of a new moon.</p>'));
    }
    return H.join('');
  }

  function nightPage(m, place) {
    const H = ['<h1 class="h1">' + wdayName(m.n.t0, place) + ' night</h1>',
      '<p class="lede">' + dateLong(m.n.t0, place) + '</p>',
      card('<div class="hero"><div class="hero-ring">' + Art.eclipse(m.score.value / 10) +
        '<span class="val num">' + m.score.value.toFixed(1) + '</span></div>' +
        '<div class="hero-t"><span class="of">Out of ten</span><p class="verdict">' + esc(m.score.verdict) + '</p></div></div>' +
        '<div class="parts">' + m.score.parts.map(partRow).join('') + '</div>')];
    H.push(card(m.list.slice(0, 6).map((h, i) => '<div class="row static">' +
      '<span class="when"><b>' + clock(h.at, place).split(' ')[0] + '</b>best</span>' +
      '<span class="t"><b>' + esc(h.title) + '</b><i>' + esc(h.sub || '') + '</i></span>' +
      '<span class="r">' + Math.round(h.weight * 10) + '/10</span></div>').join('') ||
      emptyState(Art.hill(), 'Nothing scheduled', 'An ordinary night, which is most of them.')));
    return H.join('');
  }

  function doExport() {
    // A double tap on Export must not write the same file twice.
    if (performance.now() - (doExport.last || -9e9) < 1200) return;
    doExport.last = performance.now();
    const json = Store.exportJson();
    const name = 'umbra-log-' + new Date().toISOString().slice(0, 10) + '.json';
    try {
      if (window.Native && window.Native.saveFile) {
        const b64 = btoa(unescape(encodeURIComponent(json)));
        const uri = window.Native.saveFile(name, 'application/json', b64);
        toast(uri ? 'Saved to Downloads' : 'Could not write the file');
        return;
      }
    } catch (e) {}
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Downloaded ' + name);
    } catch (e) { toast('Export failed on this device'); }
  }

  function doImport(file) {
    if (!file) return;
    const note = $('#importNote');
    const say = (msg, bad) => {
      if (bad) { inlineErr('#pageBody', msg); if (note) note.textContent = ''; }
      else { inlineErr('#pageBody', ''); if (note) note.textContent = msg; }
    };
    if (file.size > 20 * 1024 * 1024) { say('That file is too large to be an Umbra export.', true); return; }
    const rd = new FileReader();
    rd.onerror = () => say('That file could not be read.', true);
    rd.onload = () => {
      const r = Store.importJson(String(rd.result || ''));
      if (r.error) { say(r.error, true); return; }
      invalidate(); refreshTop(); syncNotify(); tuneAlertBar();
      buzz(18, 120);
      say('Imported ' + r.entries + ' ' + (r.entries === 1 ? 'entry' : 'entries') + ' and ' + r.places + ' ' +
          (r.places === 1 ? 'place' : 'places') + '. Anything already here was left alone.', false);
    };
    rd.readAsText(file);
  }

  /* ================= wiring ================= */

  /** A tap that closes a sheet or a page opens a short quiet window, because the second half
      of a double tap lands on whatever was underneath. The Back gesture is not a tap, so it
      never starts one. */
  function guarded(fn) {
    return ev => {
      // Event time, not wall time: a handler that takes a while must not stretch the window.
      if (ev.timeStamp < quietUntil && !ev.target.closest('#sheet')) return;
      const sheetOpen = !$('#sheet').hidden, pageOpen = !$('#page').hidden, depth = pageStack.length;
      fn(ev);
      if (!sheetOpen && !$('#sheet').hidden) sheetShownAt = ev.timeStamp;
      // A page closing counts whether it revealed the screen underneath or the page beneath it.
      if ((sheetOpen && $('#sheet').hidden) || (pageOpen && ($('#page').hidden || pageStack.length < depth))) quietUntil = ev.timeStamp + 300;
    };
  }

  function wire() {
    document.addEventListener('click', guarded(ev => {
      const t = ev.target.closest('[data-act]');
      if (t) { act(t.dataset.act, t.dataset, t, ev); return; }
      if (ev.target.closest('.tab')) return;
      // The second half of a double tap on a row that opened a short sheet lands on the backdrop.
      if (ev.target === $('#sheet') && ev.timeStamp - sheetShownAt > 300) closeSheet();
    }));
    // The tab bar and the top bar sit exactly where a sheet's bottom button and a page's Back
    // button were a moment ago, so they take the same quiet window as everything else.
    document.querySelectorAll('.tab').forEach(b =>
      b.addEventListener('click', guarded(() => { buzz(8, 60); setView(b.dataset.view); })));
    $('#setBtn').addEventListener('click', guarded(() => openPage('Settings', settingsPage, 'set')));
    $('#placeBtn').addEventListener('click', guarded(() => setView('places')));
    $('#redBtn').addEventListener('click', guarded(() => {
      const s = Store.settings();
      Store.set('red', s.red === 'on' ? 'off' : 'on');
      applyRed(); buzz(10, 70);
      if (view === 'tonight') renderTonight();
      if (page) $('#pageBody').innerHTML = page.render();
    }));
    $('#pageBack').addEventListener('click', guarded(closePage));
    $('#sheetClose').addEventListener('click', guarded(closeSheet));

    document.addEventListener('input', ev => {
      if (ev.target.id === 'minS') {
        Store.setAlert('min', parseFloat(ev.target.value));
        Store.setAlert('minSet', true);
        $('#minV').textContent = parseFloat(ev.target.value).toFixed(1);
        fillCeiling();
      }
      if (ev.target.id === 'hourS') {
        Store.setAlert('hour', parseInt(ev.target.value, 10));
        $('#hourV').textContent = ev.target.value + ':00';
      }
    });
    document.addEventListener('change', ev => {
      if (ev.target.id === 'minS' || ev.target.id === 'hourS') syncNotify();
      if (ev.target.id === 'importFile') doImport(ev.target.files && ev.target.files[0]);
    });
    window.addEventListener('resize', () => {
      const p = Store.home();
      if (p && view === 'tonight' && !$('#app').hidden) drawTonight(tonightModel(p));
    });
  }

  /* ================= lifecycle ================= */

  function back() {
    if (!$('#sheet').hidden) { closeSheet(); return true; }
    if (!$('#page').hidden) { closePage(); return true; }
    if (!$('#onboard').hidden) {
      if (onboardStep > 0) { onboardStep--; renderOnboard(); return true; }
      return false;
    }
    if (view !== 'tonight') { setView('tonight'); return true; }
    return false;
  }
  function onResume() {
    if (Store.home()) {
      // The clock has moved and the year is thrown away, so whatever tab is showing is
      // drawn again: a stale Events list would hold rows the feed no longer knows.
      invalidate(); applyRed(); setView(view);
      setTimeout(syncNotify, 300);
    }
  }
  function onPause() { }

  function init() {
    wire();
    if (!Store.home()) {
      $('#onboard').hidden = false;
      onboardDraft = {};
      renderOnboard();
    } else {
      $('#app').hidden = false;
      refreshTop(); applyRed(); setView('tonight');
      setTimeout(() => { syncNotify(); tuneAlertBar(); }, 900);
    }
    setInterval(() => { if (redAuto) applyRed(); }, 120000);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { back, onResume, onPause, setView, openPage, act, toast, applyRed,
           renderTonight, renderEvents, renderPlaces, renderLog };
})();

/* A top level const is not a window property, and the Android shell reaches for window.App
   when the Back gesture fires. Without this line Back silently closes the app. */
window.App = App;
window.Store = Store;
window.Sky = Sky;
