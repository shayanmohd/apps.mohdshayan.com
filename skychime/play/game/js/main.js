/*
 * Skychime: wiring. Screens, the show clock, input, the shell (ads, purchase, haptics, saves, back),
 * and the frame loop. The rules live in the pure modules; this file only connects them.
 *
 * Ad rules this game follows (WEBGAME-RECIPE.md section 3, GAME-DESIGN.md section 5): no ad of any kind
 * during a show; the interstitial only from Next show on a normal show's result card, under the game's
 * own count rules; rewarded only from a button that states the reward, offered while caps.rewardedReady
 * (or ad free); a banner only on the web, only on menus and result screens.
 */
(function () {
  'use strict';
  var Sky = window.Sky;
  var T = Sky.strings.t;
  var M = Sky.model, SL = Sky.skylines, P = Sky.progress, D = Sky.daily;

  function $(id) { return document.getElementById(id); }

  // ---- save ----
  Shell.configureSave({ prefix: 'skychime', version: Sky.save.VERSION, migrate: Sky.save.migrate });
  var save = Sky.save.sanitize(Shell.load('main', null));
  function persist() { Shell.save('main', save); }

  // ---- state ----
  var renderer = new Sky.render.Renderer($('sky'));
  var audio = new Sky.audio.Audio();
  audio.muted = !save.settings.sound;
  var caps = Shell.caps;
  var screen = 'boot';
  var show = null;
  var ctx = null; // the running show's context: { skyline, daily, day, tryIndex, preview, seed }
  var lastSummary = null;
  var lastSeed = 0;
  var selected = save.lastSkyline;
  var rewardedSinceEnd = false; // a rewarded ad played since the last show started: no interstitial in this break
  var busy = false;
  var bannerWanted = null;
  var nextEighth = 0;
  var lastBeat = -1;
  var lightsOutAt = 0;
  var ambient = { sparks: [], acc: 0, next: 0, rng: Sky.rng.create(Sky.rng.hash32('ambient')) };
  var systemReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var seedCounter = Sky.rng.hash32(String(Date.now()));

  function today() { return D.dayNumber(new Date()); }
  function festival() { var n = new Date(); return D.festivalOn(n.getMonth(), n.getDate()); }

  // ---- the show clock: AudioContext time when sound runs, else performance time ----
  var clock = {
    src: 'perf', anchorShow: 0, anchorSrc: 0, delay: 0, running: false,
    raw: function () { return this.src === 'audio' ? audio.now() : performance.now() / 1000; },
    show: function () { return this.running ? this.anchorShow + (this.raw() - this.anchorSrc) : this.anchorShow; },
    visual: function () { return this.show() - this.delay; },
    audioAt: function (ts) { return this.anchorSrc + (ts - this.anchorShow); },
    begin: function (visualT, lead) {
      this.src = audio.running() ? 'audio' : 'perf';
      this.delay = this.src === 'audio' ? audio.visualDelay() : 0;
      this.anchorShow = visualT + this.delay;
      this.anchorSrc = this.raw() + lead;
      this.running = true;
      this.seenAudio = audio.now();
      this.seenAt = performance.now() / 1000;
    },
    freeze: function () { this.anchorShow = this.show(); this.running = false; },
    /**
     * Once a frame: an audio clock that stops moving (its output lost after the app went to the background
     * and came back) would freeze the show. After 1 s without progress the show carries on, silent, on
     * performance time from the picture it shows now.
     */
    watch: function () {
      if (!this.running || this.src !== 'audio') return false;
      var a = audio.now(), p = performance.now() / 1000;
      if (a !== this.seenAudio) { this.seenAudio = a; this.seenAt = p; return false; }
      if (p - this.seenAt < 1) return false;
      this.anchorShow = this.visual();
      this.delay = 0;
      this.src = 'perf';
      this.anchorSrc = p;
      return true;
    }
  };

  // ---- settings ----
  function reducedMotion() {
    var s = save.settings.reducedMotion;
    if (s === 'on') return true;
    if (s === 'off') return false;
    return !!(systemReduce && systemReduce.matches);
  }
  function applySettings() {
    audio.setMuted(!save.settings.sound);
    renderer.reducedFlash = save.settings.reducedFlash;
    renderer.reducedMotion = reducedMotion();
    document.documentElement.classList.toggle('reduce-motion', renderer.reducedMotion);
    document.body.classList.toggle('muted', !save.settings.sound);
  }
  function haptic(style) { if (save.settings.haptics) Shell.haptic(style); }

  // ---- text ----
  function fillText() {
    var els = document.querySelectorAll('[data-t]');
    for (var i = 0; i < els.length; i++) els[i].textContent = T(els[i].getAttribute('data-t'));
    var ar = document.querySelectorAll('[data-aria]');
    for (i = 0; i < ar.length; i++) ar[i].setAttribute('aria-label', T(ar[i].getAttribute('data-aria')));
    $('howtoText').textContent = T('howTo');
    var tips = $('howtoTips');
    tips.textContent = '';
    T('tips').forEach(function (tip) { var li = document.createElement('li'); li.textContent = tip; tips.appendChild(li); });
  }

  var toastTimer = 0;
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  // ---- layout ----
  // Drops to 1 for the rest of the session when frames stay slow (see watchSpeed).
  var renderScale = 2;
  function resize() {
    var ins = Shell.caps.insets;
    renderer.resize(window.innerWidth, window.innerHeight, Math.min(renderScale, window.devicePixelRatio || 1), ins);
    var v = renderer.view;
    var city = Math.round(window.innerHeight - (v.ground - 34 * v.s));
    document.documentElement.style.setProperty('--city', Math.max(120, city) + 'px');
  }

  // ---- screens ----
  var SHEETS = ['pause', 'encore', 'results', 'daily', 'settings', 'howto', 'postcard'];
  var MENU_SHEETS = ['daily', 'settings', 'howto', 'postcard'];
  function onMenu(name) { return name === 'menu' || MENU_SHEETS.indexOf(name) >= 0; }
  function setScreen(next) {
    screen = next;
    $('begin').hidden = next !== 'begin';
    $('menu').hidden = !onMenu(next);
    for (var i = 0; i < SHEETS.length; i++) $(SHEETS[i]).hidden = SHEETS[i] !== next;
    $('scrim').hidden = !(next === 'pause' || next === 'encore' || MENU_SHEETS.indexOf(next) >= 0);
    $('pauseBtn').hidden = next !== 'play';
    updateBanner();
  }

  // Banners only on the web, and only on menus and result screens.
  function updateBanner() {
    var want = caps.platform === 'web' && (onMenu(screen) || screen === 'results');
    if (want === bannerWanted) return;
    bannerWanted = want;
    Shell.banner(want).then(function (r) {
      document.documentElement.classList.toggle('banner-on', !!(r && r.visible && r.height > 0));
    });
  }

  // ---- menu ----
  function skylineState(id) {
    var def = SL.BY_ID[id];
    var fest = festival();
    if (def.paid) {
      if (caps.adFree) return { show: true, play: true, sub: bestText(id) };
      return { show: !!caps.removeAds, play: false, sub: T('hints.river'), buy: true };
    }
    if (def.festival) {
      if (fest === def.festival) return { show: true, play: true, sub: bestText(id) };
      return { show: true, play: false, sub: T('hints.newyear') };
    }
    if (id === 'harbour' || save.unlocks[id]) return { show: true, play: true, sub: bestText(id) };
    var left = save.previews.left[id] || 0;
    if (left > 0) return { show: true, play: true, sub: T('previewLeft', { n: left }), preview: true };
    return { show: true, play: false, sub: T('hints.' + id), locked: true };
  }
  function bestText(id) { return save.best[id] ? T('best', { n: save.best[id].toLocaleString('en-US') }) : ''; }

  function thumb(canvas, def) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 86 * dpr; canvas.height = 34 * dpr;
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var grad = g.createLinearGradient(0, 0, 0, 34);
    grad.addColorStop(0, def.sky[1]); grad.addColorStop(1, def.sky[3]);
    g.fillStyle = grad; g.fillRect(0, 0, 86, 34);
    var s = 0.86;
    var fake = { view: { s: s }, sx: function (x) { return x * s; }, sy: function (y) { return 33 - y * s; } };
    g.fillStyle = def.silhouette;
    var win = new Path2D();
    SL.silhouette(def).forEach(function (sh) {
      var p = new Path2D();
      Sky.render.Renderer.prototype.shapePath.call(fake, p, sh, s);
      g.fill(p);
      if (sh.windows) sh.windows.forEach(function (w) { if ((w.x * 7 + w.y * 3) % 2 < 1.2) win.rect(w.x * s, 33 - (w.y + w.h) * s, Math.max(0.8, w.w * s), Math.max(0.8, w.h * s)); });
    });
    g.fillRect(0, 33, 86, 2);
    g.fillStyle = 'rgba(242,176,76,0.85)';
    g.fill(win);
  }

  function renderMenu() {
    var day = today();
    $('dailyLabel').textContent = T('dailyNumber', { n: day });
    var st = D.streak(save.daily.history, day);
    $('dailyStreak').textContent = st > 0 ? String(st) : '';
    var box = $('skylines');
    box.textContent = '';
    var ids = ['harbour', 'desert', 'snow', 'river', 'newyear'];
    var visible = ids.filter(function (id) { return skylineState(id).show; });
    if (visible.indexOf(selected) < 0) selected = 'harbour';
    visible.forEach(function (id) {
      var def = SL.BY_ID[id];
      var stt = skylineState(id);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'card' + (stt.play ? '' : ' locked');
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-pressed', id === selected ? 'true' : 'false');
      var cv = document.createElement('canvas');
      thumb(cv, def);
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = T('skylines.' + id);
      var sb = document.createElement('span'); sb.className = 'st'; sb.textContent = stt.sub || ' ';
      b.appendChild(cv); b.appendChild(nm); b.appendChild(sb);
      b.addEventListener('click', function () {
        selected = id;
        audio.tick();
        if (skylineState(id).play) renderer.setSkyline(SL.BY_ID[id]);
        renderMenu();
      });
      box.appendChild(b);
    });
    var cur = skylineState(selected);
    var curDef = SL.BY_ID[selected];
    $('playBtn').hidden = !cur.play;
    $('playBtn').textContent = selected === 'harbour' ? T('play') : T('playOn', { name: T('skylines.' + selected) });
    var note = $('skylineNote');
    note.hidden = cur.play;
    note.textContent = cur.play ? '' : (cur.sub || T('locked'));
    var pv = $('previewBtn');
    var canPreview = cur.locked && P.mayPreview(save, day, selected, caps);
    pv.hidden = !canPreview;
    pv.textContent = caps.adFree ? T('previewFree') : T('previewAd');
    var rb = $('riverBuyBtn');
    rb.hidden = !(curDef.paid && cur.buy && caps.removeAds && !caps.adFree);
    rb.textContent = caps.removeAdsPrice ? T('removeAdsPrice', { price: caps.removeAdsPrice }) : T('removeAds');
    $('bestLine').textContent = cur.play ? bestText(selected) : '';
    var card = save.postcards[selected];
    $('postcardBtn').hidden = !(cur.play && card);
    if (card) $('postcardLen').textContent = String(card.length);
    renderGoals();
  }

  var ICON = {
    chain: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.6"/><circle cx="12" cy="7" r="2.6"/><circle cx="18" cy="12" r="2.6"/><path d="M8 10.5l2.2-1.8M14 8.7l2.2 1.8"/></svg>',
    noDud: '<svg viewBox="0 0 24 24"><path d="M3 20h18M5 20v-7h4v7M10 20v-11h4v11M15 20v-5h4v5"/><path d="M12 3v2M8 4.5l1 1.6M16 4.5l-1 1.6"/></svg>',
    perfect: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="M12 3l2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z"/></svg>',
    dud: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M8 16l8-8"/></svg>'
  };

  function renderGoals() {
    var g = save.goals;
    var items = [
      { k: 'chain', icon: ICON.chain, text: Math.min(g.chain, 15) + '/15', done: g.chain >= 15 },
      { k: 'noDud', icon: ICON.noDud, text: g.noDud ? '1/1' : '0/1', done: g.noDud },
      { k: 'perfectRun', icon: ICON.perfect, text: Math.min(g.perfectRun, 8) + '/8', done: g.perfectRun >= 8 }
    ];
    var box = $('goals');
    box.textContent = '';
    items.forEach(function (it) {
      var s = document.createElement('span');
      s.className = 'goal' + (it.done ? ' done' : '');
      s.setAttribute('aria-label', T('goals.' + it.k) + ', ' + it.text);
      s.title = T('goals.' + it.k);
      s.innerHTML = it.icon;
      var b = document.createElement('b'); b.textContent = it.text; b.style.fontWeight = '500';
      s.appendChild(b);
      box.appendChild(s);
    });
  }

  function goMenu() {
    if (show && (screen === 'play' || screen === 'pause')) leaveShow();
    show = null;
    renderer.setSkyline(SL.BY_ID[skylineState(selected).play ? selected : 'harbour']);
    renderMenu();
    setScreen('menu');
  }

  // ---- shows ----
  function newSeed() {
    seedCounter = Sky.rng.mix(seedCounter, save.stats.shows + 17);
    return seedCounter;
  }

  /** Starts a show. Call from a tap (the web needs a gesture for sound). */
  function startShow(o) {
    audio.unlock();
    var def = SL.BY_ID[o.skyline];
    var daily = !!o.daily;
    var seed = daily ? D.seed(o.day) : (o.seed || newSeed());
    lastSeed = seed;
    var tutorial = !daily && !save.stats.firstShowDone;
    show = new Sky.show.Show({ def: def, seed: seed, daily: daily, types: daily ? [0, 1, 2, 3] : P.shellTypes(save), tutorial: tutorial });
    show.provider.get(0);
    ctx = { skyline: def.id, daily: daily, day: o.day || today(), tryIndex: o.tryIndex || 1, seed: seed,
      preview: !daily && (def.id === 'desert' || def.id === 'snow') && !save.unlocks[def.id] ? def.id : null };
    if (daily) { P.startDaily(save, ctx.day, ctx.tryIndex); persist(); }
    if (!daily) { selected = def.id; save.lastSkyline = def.id; }
    rewardedSinceEnd = false;
    renderer.setSkyline(def);
    renderer.reset();
    ambient.sparks.length = 0;
    Shell.banner(false);
    bannerWanted = false;
    setScreen('play');
    // Wait a moment for the audio context so the show runs on its clock when it can.
    var started = false;
    function go() {
      if (started || !show) return;
      started = true;
      clock.begin(-0.25, 0.08);
      startMusic();
    }
    if (audio.running()) go();
    else { audio.unlock().then(go); setTimeout(go, 450); }
  }

  function startMusic() {
    nextEighth = Math.max(0, Math.ceil(clock.show() / (show.plan.beat / 2)));
    if (clock.src === 'audio') audio.startMusic(show.def, show.plan.beat, clock.audioAt(0), clock.anchorSrc);
  }

  function pauseShow() {
    if (screen !== 'play' || !show) return;
    clock.freeze();
    audio.stopMusic(0.15);
    // The Daily try is spent when it starts: keep its score so far, so a kill while paused never loses it.
    if (ctx.daily) P.applyDaily(save, ctx.day, show.summary(), show.longest, ctx.tryIndex);
    persist();
    renderPauseSound();
    setScreen('pause');
  }

  function resumeShow() {
    if (!show) return;
    audio.unlock();
    setScreen('play');
    var frozen = clock.anchorShow - clock.delay;
    var go = function () { clock.begin(frozen, 0); startMusic(); };
    if (audio.running()) go(); else audio.unlock().then(go);
  }

  /** The player left a show from pause: a normal show just ends; a Daily keeps the score so far. */
  function leaveShow() {
    if (!show) return;
    show.finish();
    audio.stopMusic(0.2);
    if (ctx.daily) {
      var summary = show.summary();
      P.applyDaily(save, ctx.day, summary, show.longest, ctx.tryIndex);
      persist();
    }
    show = null;
  }

  function endShow() {
    var summary = show.summary();
    var chain = show.longest;
    audio.stopMusic(1.2);
    var res;
    if (ctx.daily) {
      P.applyDaily(save, ctx.day, summary, chain, ctx.tryIndex);
      res = P.applyShow(save, summary, chain, { day: ctx.day });
    } else {
      res = P.applyShow(save, summary, chain, { day: today(), preview: ctx.preview });
    }
    var offer = P.mayOfferRemoveAds(save, summary, caps);
    if (offer) save.offers.removeAdsShown = true;
    persist();
    lastSummary = summary;
    if (res.unlocked.length || res.goals.length) audio.fanfare(show.def);
    haptic('success');
    renderResults(summary, res, chain, offer);
    setScreen('results');
  }

  // ---- results ----
  function stat(icon, value, label) {
    var li = document.createElement('li');
    var b = document.createElement('b');
    b.innerHTML = icon;
    b.appendChild(document.createTextNode(String(value)));
    var sp = document.createElement('span'); sp.textContent = label;
    li.appendChild(b); li.appendChild(sp);
    return li;
  }

  function drawCard(canvas, defId, bursts) {
    var def = SL.BY_ID[defId];
    canvas.width = 640; canvas.height = 480;
    if (bursts && bursts.length) Sky.render.postcard(canvas, def, bursts, {});
    else Sky.render.postcard(canvas, def, [], {});
  }

  function renderResults(summary, res, chain, offer) {
    var daily = summary.daily;
    $('resKicker').textContent = daily ? T('dailyNumber', { n: ctx.day }) + (ctx.tryIndex === 2 ? ', ' + T('dailyTry2').toLowerCase() : '') : T('skylines.' + summary.skyline);
    $('resScore').textContent = summary.score.toLocaleString('en-US');
    var best = daily ? 0 : save.best[summary.skyline] || 0;
    $('resBest').textContent = daily ? '' : res.newBest ? T('newBest') : T('best', { n: best.toLocaleString('en-US') });
    var stats = $('resStats');
    stats.textContent = '';
    stats.appendChild(stat(ICON.chain, summary.maxChain, T('statChain')));
    stats.appendChild(stat(ICON.perfect, summary.perfects, T('statPerfects')));
    stats.appendChild(stat(ICON.clear, summary.fullClears, T('statClears')));
    stats.appendChild(stat(ICON.dud, summary.duds, T('statDuds')));
    drawCard($('resCard'), summary.skyline, chain && chain.bursts);
    $('resCardCap').textContent = chain ? T('postcard', { name: T('skylines.' + summary.skyline) }) : T('noPostcard');
    var notes = $('resNotes');
    notes.textContent = '';
    res.unlocked.forEach(function (id) {
      var li = document.createElement('li');
      li.textContent = SL.BY_ID[id] ? T('newSkyline', { name: T('skylines.' + id) }) : T('newShell', { name: T('shells.' + id) });
      notes.appendChild(li);
    });
    res.goals.forEach(function (g) {
      var li = document.createElement('li');
      li.textContent = T('goalDone', { name: T('goals.' + g) });
      notes.appendChild(li);
    });
    $('resOffer').hidden = !offer;
    $('offerBuyBtn').textContent = caps.removeAdsPrice ? T('removeAdsPrice', { price: caps.removeAdsPrice }) : T('removeAds');
    $('nextBtn').hidden = daily;
    $('againBtn').hidden = daily;
    updateResultButtons();
  }

  /** Shell.share arrived in game-sdk.js 1.1.0; offer sharing only where the platform says it can. */
  function shareAvailable() { return typeof Shell.share === 'function' && !!caps.share; }

  function updateResultButtons() {
    if (!lastSummary) return;
    var daily = lastSummary.daily;
    var sec = $('secondBtn');
    sec.hidden = !(daily && P.mayDailySecond(save, ctx.day, caps));
    sec.textContent = caps.adFree ? T('dailySecondFree') : T('dailySecondAd');
    $('shareBtn').hidden = !(daily && shareAvailable());
    if (!$('resOffer').hidden && (caps.adFree || !caps.removeAds)) $('resOffer').hidden = true;
  }

  // ---- the postcard of a skyline's longest chain ----
  function renderPostcard() {
    var card = save.postcards[selected];
    if (!card) return false;
    $('postcardTitle').textContent = T('skylines.' + selected);
    drawCard($('pcCard'), selected, card.bursts);
    $('pcCaption').textContent = T('postcardCaption', { n: card.length });
    return true;
  }

  // ---- daily ----
  function renderDaily() {
    var day = today();
    $('dailyTitle').textContent = T('dailyNumber', { n: day });
    var st = D.streak(save.daily.history, day);
    $('dailyStreakLine').textContent = st > 0 ? T('streak', { n: st }) : T('streakNone');
    var cal = $('calendar');
    cal.textContent = '';
    cal.setAttribute('aria-label', T('calendar'));
    D.calendar(save.daily.history, day, 28).forEach(function (c) {
      var i = document.createElement('i');
      i.className = (c.played ? (c.second ? 'two' : 'on') : '') + (c.today ? ' today' : '');
      cal.appendChild(i);
    });
    var state = P.dailyState(save, day);
    var rec = save.daily.history[day];
    $('dailyPlayBtn').hidden = state !== 'open';
    $('dailyScore').hidden = !rec || !rec.done;
    if (rec && rec.done) $('dailyScore').textContent = rec.score.toLocaleString('en-US');
    var wrap = $('dailyCardWrap');
    wrap.hidden = !(rec && rec.bursts);
    if (rec && rec.bursts) drawCard($('dailyCard'), D.skylineFor(day), rec.bursts);
    $('dailyNote').textContent = state === 'open' ? T('skylines.' + D.skylineFor(day)) : T('dailyComeBack');
    var sec = $('dailySecondBtn');
    sec.hidden = !P.mayDailySecond(save, day, caps);
    sec.textContent = caps.adFree ? T('dailySecondFree') : T('dailySecondAd');
    $('dailyShareBtn').hidden = !(rec && rec.done && shareAvailable());
  }

  /** The second-try mark on the share card: an open circular arrow. */
  function cardRetry(g, x, y) {
    g.beginPath(); g.arc(x, y, 12, -Math.PI * 0.35, Math.PI * 1.4); g.stroke();
    g.beginPath(); g.moveTo(x + 13, y - 15); g.lineTo(x + 9, y - 5); g.lineTo(x + 19, y - 6); g.closePath(); g.fill();
  }

  /** Called straight from the tap, with no await before Shell.share (Web Share needs the tap). */
  function shareDaily(day) {
    var rec = save.daily.history[day];
    if (!rec || !shareAvailable()) return;
    var text = D.shareText(day, rec);
    var png = null;
    try {
      var c = document.createElement('canvas');
      c.width = 600; c.height = 600;
      Sky.render.postcard(c, SL.BY_ID[D.skylineFor(day)], rec.bursts || [], {});
      var g = c.getContext('2d');
      var grad = g.createLinearGradient(0, 380, 0, 600);
      grad.addColorStop(0, 'rgba(6,10,25,0)'); grad.addColorStop(1, 'rgba(6,10,25,0.85)');
      g.fillStyle = grad; g.fillRect(0, 380, 600, 220);
      g.fillStyle = '#FFF7EA';
      g.textBaseline = 'alphabetic';
      g.font = '600 64px ' + Sky.render.FONT;
      g.fillText('#' + day, 36, 556);
      // the longest chain and the Perfects, drawn as vector marks (no symbol font needed)
      g.font = '600 38px ' + Sky.render.FONT;
      g.fillStyle = '#F2B04C';
      g.strokeStyle = '#F2B04C';
      g.lineWidth = 3;
      g.textAlign = 'right';
      var xr = 564;
      if (rec.second) { cardRetry(g, xr - 14, 540); xr -= 46; }
      g.fillText(String(rec.perfects), xr, 553);
      xr -= g.measureText(String(rec.perfects)).width + 30;
      g.beginPath(); g.arc(xr, 540, 14, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(xr, 540, 5, 0, Math.PI * 2); g.fill();
      xr -= 34;
      g.fillText(String(rec.chain), xr, 553);
      xr -= g.measureText(String(rec.chain)).width + 46;
      [[-16, 6], [0, -8], [16, 6]].forEach(function (c) { g.beginPath(); g.arc(xr + c[0], 540 + c[1], 6, 0, Math.PI * 2); g.stroke(); });
      g.beginPath(); g.moveTo(xr - 11, 541); g.lineTo(xr - 5, 536); g.moveTo(xr + 5, 536); g.lineTo(xr + 11, 541); g.stroke();
      g.textAlign = 'left';
      g.font = '500 22px ' + Sky.render.FONT;
      g.fillStyle = 'rgba(255,247,234,0.75)';
      g.fillText('Skychime', 36, 60);
      png = c.toDataURL('image/png');
      if (png.length > 1360000) png = null; // keep the PNG under 1 MB (base64 is 4/3 of the bytes)
    } catch (e) { png = null; }
    Shell.share({ text: text, url: D.PLAY_URL, png: png || undefined }).then(function (r) {
      if (r && r.ok) {
        if (r.reason === 'copied') toast(T('shareCopied'));
        else if (r.reason === 'shared') toast(T('shareShared'));
      } else if (!r || (r.reason !== 'cancelled' && r.reason !== 'busy')) {
        toast(T('shareFailed'));
      }
    });
  }

  // ---- settings ----
  function renderSettings() {
    function setVal(id, on, text) {
      var b = $(id).querySelector('b');
      b.textContent = text || (on ? T('on') : T('off'));
      b.classList.toggle('on', !!on);
    }
    setVal('setSound', save.settings.sound);
    setVal('setHaptics', save.settings.haptics);
    setVal('setFlash', save.settings.reducedFlash);
    var rm = save.settings.reducedMotion;
    setVal('setMotion', reducedMotion(), rm === 'auto' ? T('auto') : rm === 'on' ? T('on') : T('off'));
    $('adsBlock').hidden = !caps.removeAds && !caps.adFree;
    $('adFreeLine').hidden = !caps.adFree;
    $('buyBtn').hidden = !caps.removeAds || caps.adFree;
    $('buyDesc').hidden = !caps.removeAds || caps.adFree;
    $('buyLabel').textContent = caps.removeAdsPrice ? T('removeAdsPrice', { price: caps.removeAdsPrice }) : T('removeAds');
    $('restoreBtn').hidden = !caps.removeAds;
    $('privacyBtn').hidden = !caps.privacyOptions;
  }

  function renderPauseSound() {
    $('pauseSoundBtn').textContent = save.settings.sound ? T('soundOn') : T('soundOff');
  }

  function buyRemoveAds(btn) {
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;
    Shell.buyRemoveAds().then(function (r) {
      busy = false;
      if (btn) btn.disabled = false;
      caps = Shell.caps;
      toast(T('buy.' + r.reason) !== 'buy.' + r.reason ? T('buy.' + r.reason) : T('buy.failed'));
      refreshAll();
    });
  }

  function refreshAll() {
    caps = Shell.caps;
    applySettings();
    if (onMenu(screen)) renderMenu();
    if (screen === 'settings') renderSettings();
    if (screen === 'daily') renderDaily();
    if (screen === 'results') updateResultButtons();
    if (screen === 'encore') renderEncore();
  }

  /** Any rewarded ad that played (granted or skipped) means no interstitial at this break. */
  function noteRewarded(r) { if (r && (r.granted || r.reason === 'skipped')) rewardedSinceEnd = true; }

  // ---- encore ----
  function renderEncore() {
    var b = $('encoreBtn');
    var offer = show && show.canEncore() && P.rewardOffered(caps);
    b.hidden = !offer;
    b.textContent = caps.adFree ? T('encoreFree') : T('encoreAd');
  }

  function lightsOut() {
    clock.freeze();
    audio.darken(true);
    haptic('heavy');
    lightsOutAt = performance.now();
    setTimeout(function () {
      if (!show || show.state !== 'lightsOut') return;
      if (show.canEncore() && P.rewardOffered(caps)) {
        renderEncore();
        setScreen('encore');
      } else {
        show.finish();
        endShow();
      }
    }, 900);
  }

  // ---- events from the show ----
  function onEvents(list, now, vt) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      switch (e.k) {
        case 'launch': audio.launch(); break;
        case 'open': haptic(e.grade === 'perfect' ? 'medium' : 'light'); break;
        case 'burst':
          renderer.burst(e, now);
          audio.crackle(e.opening ? 1 : 0.7);
          audio.chime(e.chainPos, e.final, e.opening && e.grade === 'perfect');
          break;
        case 'fullclear': renderer.fullClear(now); haptic('success'); break;
        case 'dud': renderer.dud(e.shell, vt); audio.dud(); break;
        case 'lightsOut': lightsOut(); return;
        case 'over': endShow(); return;
      }
    }
  }

  function scheduleBeats() {
    if (clock.src !== 'audio' || !audio.live() || !show) return;
    var eighth = show.plan.beat / 2;
    var horizon = audio.now() + 0.18;
    var guard = 0;
    while (guard++ < 16) {
      var at = clock.audioAt(nextEighth * eighth);
      if (at > horizon) break;
      if (at >= audio.now() - 0.01) audio.eighth(nextEighth, at);
      nextEighth++;
    }
  }

  // ---- input ----
  $('sky').addEventListener('pointerdown', function (e) {
    if (screen !== 'play' || !show || !clock.running) return;
    e.preventDefault();
    var age = Math.max(0, Math.min(0.1, (performance.now() - e.timeStamp) / 1000));
    var vt = clock.visual() - age;
    // Bring the show up to the tap's own time first, so the tap meets the same shells at any frame rate.
    evNow = performance.now() / 1000; evVt = vt;
    show.advanceTo(vt, stepEvents, 30);
    if (screen !== 'play' || !show || !clock.running) return;
    var r = show.tap(renderer.wx(e.clientX), renderer.wy(e.clientY), vt);
    renderer.tapRipple(e.clientX, e.clientY, r.ok, performance.now() / 1000);
  });

  $('begin').addEventListener('click', function () {
    if (screen !== 'begin') return;
    startShow({ skyline: 'harbour' });
  });

  $('playBtn').addEventListener('click', function () {
    if (busy || screen !== 'menu' || !skylineState(selected).play) return;
    startShow({ skyline: selected });
  });
  $('dailyBtn').addEventListener('click', function () { audio.tick(); renderDaily(); setScreen('daily'); });
  $('dailyClose').addEventListener('click', function () { setScreen('menu'); });
  $('dailyPlayBtn').addEventListener('click', function () {
    var day = today();
    if (busy || screen !== 'daily' || P.dailyState(save, day) !== 'open') return;
    startShow({ skyline: D.skylineFor(day), daily: true, day: day, tryIndex: 1 });
  });
  function secondTry(btn) {
    var day = ctx && ctx.daily ? ctx.day : today();
    if (busy || (screen !== 'results' && screen !== 'daily') || !P.mayDailySecond(save, day, caps)) return;
    busy = true; btn.disabled = true;
    audio.unlock();
    Shell.rewarded('daily_second').then(function (r) {
      busy = false; btn.disabled = false;
      caps = Shell.caps;
      noteRewarded(r);
      if (r.granted) {
        startShow({ skyline: D.skylineFor(day), daily: true, day: day, tryIndex: 2 });
      } else {
        toast(r.reason === 'notReady' ? T('rewardNotReady') : T('rewardNotGranted'));
        refreshAll();
      }
    });
  }
  $('dailySecondBtn').addEventListener('click', function () { secondTry($('dailySecondBtn')); });
  $('secondBtn').addEventListener('click', function () { secondTry($('secondBtn')); });
  $('dailyShareBtn').addEventListener('click', function () { shareDaily(today()); });
  $('shareBtn').addEventListener('click', function () { shareDaily(ctx.day); });

  $('previewBtn').addEventListener('click', function () {
    var day = today(), id = selected;
    if (busy || !P.mayPreview(save, day, id, caps)) return;
    busy = true;
    var btn = $('previewBtn'); btn.disabled = true;
    Shell.rewarded('skyline_preview').then(function (r) {
      busy = false; btn.disabled = false;
      caps = Shell.caps;
      noteRewarded(r);
      if (r.granted) {
        P.grantPreview(save, day, id);
        persist();
        haptic('success');
      } else {
        toast(r.reason === 'notReady' ? T('rewardNotReady') : T('rewardNotGranted'));
      }
      renderMenu();
    });
  });
  $('riverBuyBtn').addEventListener('click', function () { buyRemoveAds($('riverBuyBtn')); });

  $('soundBtn').addEventListener('click', function () {
    save.settings.sound = !save.settings.sound;
    audio.unlock();
    applySettings(); persist();
    $('soundBtn').setAttribute('aria-label', save.settings.sound ? T('soundOn') : T('soundOff'));
    audio.tick();
  });
  $('settingsBtn').addEventListener('click', function () { audio.tick(); renderSettings(); setScreen('settings'); });
  $('settingsClose').addEventListener('click', function () { setScreen('menu'); });
  $('setSound').addEventListener('click', function () { save.settings.sound = !save.settings.sound; audio.unlock(); applySettings(); persist(); renderSettings(); });
  $('setHaptics').addEventListener('click', function () { save.settings.haptics = !save.settings.haptics; persist(); renderSettings(); haptic('light'); });
  $('setFlash').addEventListener('click', function () { save.settings.reducedFlash = !save.settings.reducedFlash; applySettings(); persist(); renderSettings(); });
  $('setMotion').addEventListener('click', function () {
    var order = ['auto', 'on', 'off'];
    save.settings.reducedMotion = order[(order.indexOf(save.settings.reducedMotion) + 1) % 3];
    applySettings(); persist(); renderSettings();
  });
  $('setHowTo').addEventListener('click', function () { setScreen('howto'); });
  $('howtoClose').addEventListener('click', function () { renderSettings(); setScreen('settings'); });
  $('buyBtn').addEventListener('click', function () { buyRemoveAds($('buyBtn')); });
  $('restoreBtn').addEventListener('click', function () {
    if (busy) return;
    busy = true;
    Shell.restore().then(function (r) {
      busy = false;
      caps = Shell.caps;
      if (r.ok) toast(r.adFree ? T('restored') : T('restoredNone'));
      else toast(T('buy.' + r.reason) !== 'buy.' + r.reason ? T('buy.' + r.reason) : T('buy.failed'));
      refreshAll();
    });
  });
  $('privacyBtn').addEventListener('click', function () {
    if (!caps.privacyOptions) return;
    Shell.privacyOptions().then(function () { caps = Shell.caps; refreshAll(); });
  });

  $('postcardBtn').addEventListener('click', function () { audio.tick(); if (renderPostcard()) setScreen('postcard'); });
  $('postcardClose').addEventListener('click', function () { setScreen('menu'); });

  // Tapping outside a menu sheet closes it (pause and Encore wait for a button).
  $('scrim').addEventListener('click', function () {
    if (screen === 'daily' || screen === 'settings' || screen === 'postcard') setScreen('menu');
    else if (screen === 'howto') { renderSettings(); setScreen('settings'); }
  });

  $('pauseBtn').addEventListener('click', function () { pauseShow(); });
  $('resumeBtn').addEventListener('click', function () { resumeShow(); });
  $('pauseSoundBtn').addEventListener('click', function () {
    save.settings.sound = !save.settings.sound; applySettings(); persist(); renderPauseSound();
  });
  $('endShowBtn').addEventListener('click', function () { leaveShow(); goMenu(); });

  $('encoreBtn').addEventListener('click', function () {
    if (busy || !show || !show.canEncore()) return;
    busy = true;
    var btn = $('encoreBtn'); btn.disabled = true;
    Shell.rewarded('encore').then(function (r) {
      busy = false; btn.disabled = false;
      caps = Shell.caps;
      noteRewarded(r);
      if (r.granted && show && show.encore()) {
        audio.darken(false);
        renderer.reset();
        setScreen('play');
        audio.unlock();
        var go = function () { clock.begin(show.time(), 0); startMusic(); };
        if (audio.running()) go(); else audio.unlock().then(go);
      } else {
        toast(r.reason === 'notReady' ? T('rewardNotReady') : T('rewardNotGranted'));
        renderEncore();
      }
    });
  });
  $('encoreEndBtn').addEventListener('click', function () {
    if (busy || !show || screen !== 'encore') return; // never while the Encore ad is still answering
    show.finish();
    endShow();
  });

  // The natural break: Next show may bring an interstitial under the game's own count rules.
  $('nextBtn').addEventListener('click', function () {
    if (busy || screen !== 'results' || !lastSummary || lastSummary.daily) return;
    var id = lastSummary.skyline;
    if (!skylineState(id).play) id = 'harbour';
    audio.unlock();
    if (caps.interstitial && !caps.adFree && P.mayInterstitial(save, { daily: false, encoreUsed: lastSummary.encoreUsed, rewardedSinceEnd: rewardedSinceEnd })) {
      busy = true;
      var btn = $('nextBtn'); btn.disabled = true;
      Shell.interstitial('show_break').then(function (r) {
        busy = false; btn.disabled = false;
        if (r.shown) { P.interstitialShown(save); persist(); }
        startShow({ skyline: id });
      });
    } else {
      startShow({ skyline: id });
    }
  });
  $('againBtn').addEventListener('click', function () {
    if (busy || screen !== 'results' || !lastSummary || lastSummary.daily) return;
    var id = lastSummary.skyline;
    if (!skylineState(id).play) { goMenu(); return; }
    startShow({ skyline: id, seed: lastSeed });
  });
  $('resMenuBtn').addEventListener('click', function () { if (!busy && screen === 'results') goMenu(); });
  $('offerBuyBtn').addEventListener('click', function () { buyRemoveAds($('offerBuyBtn')); });
  $('offerNoBtn').addEventListener('click', function () { $('resOffer').hidden = true; });

  // ---- shell events ----
  Shell.onPause(function () {
    if (screen === 'play') pauseShow();
    persist();
    audio.suspend();
  });
  Shell.onResume(function () { caps = Shell.caps; refreshAll(); });
  Shell.onChange(function () {
    var before = caps.insets;
    caps = Shell.caps;
    var ins = caps.insets;
    if (!before || before.top !== ins.top || before.bottom !== ins.bottom || before.left !== ins.left || before.right !== ins.right) resize();
    refreshAll();
  });
  Shell.onBack(function () {
    switch (screen) {
      case 'play': pauseShow(); return true;
      case 'pause': resumeShow(); return true;
      case 'encore': if (!busy && show) { show.finish(); endShow(); } return true;
      case 'results': goMenu(); return true;
      case 'daily': case 'settings': case 'postcard': setScreen('menu'); return true;
      case 'howto': renderSettings(); setScreen('settings'); return true;
      default: return false;
    }
  });
  window.addEventListener('resize', resize);
  if (systemReduce && systemReduce.addEventListener) systemReduce.addEventListener('change', applySettings);

  // ---- the frame loop ----
  // Some WebViews draw this canvas on the CPU: a Galaxy S22+ on WebView 156 managed about 25 frames a second
  // at full resolution from the second launch on. When 90 frames in a row average over 21 ms (under about 48
  // of the 60 the pacer asks for), draw at one canvas pixel per CSS pixel for the rest of the session (a
  // quarter of the pixels).
  var slowSum = 0, slowN = 0;
  function watchSpeed(gap) {
    if (renderScale === 1 || gap <= 0 || gap > 100 || document.hidden) return;
    slowSum += gap; slowN++;
    if (slowN < 90) return;
    if (slowSum / slowN > 21 && (window.devicePixelRatio || 1) > 1) { renderScale = 1; resize(); }
    slowSum = 0; slowN = 0;
  }
  var last = performance.now();
  var stepsLastFrame = 0;
  // Every screen, play included, draws at most about 60 frames a second. At the display rate a Galaxy
  // S22+ (120 Hz) used about two cores in play and reached thermal SEVERE within minutes. Taps are judged
  // at their own event time, never at a frame's (see the pointerdown handler), so the cap costs no accuracy.
  var pacer = new Sky.pace.Pacer(60);
  var evNow = 0, evVt = 0;
  function stepEvents(ev) { onEvents(ev, evNow, evVt); }
  function frame(ms) {
    if (!pacer.due(ms)) { requestAnimationFrame(frame); return; }
    watchSpeed(ms - last);
    var now = ms / 1000;
    var dt = Math.min(0.1, Math.max(0, (ms - last) / 1000));
    last = ms;
    if (show && (screen === 'play' || screen === 'pause' || screen === 'encore')) {
      if (screen === 'play' && clock.watch()) audio.stopMusic(0.15);
      var vt = clock.visual();
      stepsLastFrame = 0;
      if (screen === 'play' && clock.running) {
        show.provider.work(3, function () { return performance.now(); });
        evNow = now; evVt = vt;
        stepsLastFrame = show.advanceTo(vt, stepEvents, 30);
        scheduleBeats();
      }
      if (show) {
        var st = show.model.step * M.DT;
        var alpha = 1 - (st - vt) / M.DT;
        if (alpha > 1) alpha = 1; else if (alpha < 0) alpha = 0;
        var tv = Math.min(vt, st);
        var b = tv / show.plan.beat;
        var bi = Math.floor(b);
        if (bi !== lastBeat) {
          lastBeat = bi;
          if (screen === 'play' && !save.settings.sound && save.settings.haptics) crestHaptic(bi * show.plan.beat);
        }
        renderer.frame({
          t: tv, alpha: alpha, now: now, dt: dt, sparks: show.model.sparks, shells: liveShells(),
          lights: show.lights, beatPhase: tv > 0 ? (b - bi) * show.plan.beat : null, bar: bi % 4 === 0,
          guide: screen === 'play' ? show.guide(tv) : null,
          hud: { score: show.score, mult: show.mult, lights: show.lights, spark: sparkReady(tv), progress: show.progress() }
        });
      }
    } else {
      ambientFrame(now, dt);
    }
    requestAnimationFrame(frame);
  }

  function crestHaptic(beatT) {
    var list = show.tapCandidates(beatT);
    for (var i = 0; i < list.length; i++) {
      if (Math.abs(list[i].crestT - beatT) < 0.02) { Shell.haptic('tap'); return; }
    }
  }

  function sparkReady(t) {
    for (var v = 0; v < show.volleys.length; v++) {
      var vs = show.volleys[v];
      if (vs.spawned && !vs.sparkUsed && !vs.resolved && vs.data.firstLaunch <= t) return true;
    }
    return false;
  }

  var liveList = [];
  function liveShells() {
    liveList.length = 0;
    for (var v = 0; v < show.volleys.length; v++) {
      var vs = show.volleys[v];
      if (!vs.spawned || vs.skipped) continue;
      if (vs.resolved && vs.data.lastDead < show.time() - 1.2) continue;
      for (var i = 0; i < vs.shells.length; i++) liveList.push(vs.shells[i]);
    }
    return liveList;
  }

  function ambientFrame(now, dt) {
    var a = ambient;
    var lively = !renderer.reducedMotion && (onMenu(screen) || screen === 'results' || screen === 'begin');
    if (lively && renderer.def) {
      a.next -= dt;
      if (a.next <= 0) {
        a.next = screen === 'results' ? 2.4 : 1.5 + a.rng.float() * 0.8;
        if (a.sparks.length < 120) renderer.ambientBurst(a.sparks, a.rng, now);
      }
    }
    a.acc += dt;
    var guard = 0;
    while (a.acc >= M.DT && guard++ < 8) {
      a.acc -= M.DT;
      var w = 0;
      for (var i = 0; i < a.sparks.length; i++) {
        var p = a.sparks[i];
        M.stepSpark(p);
        if (p.age < p.life) a.sparks[w++] = p;
      }
      a.sparks.length = w;
    }
    if (!renderer.def) return;
    var pulse = (now % 1.1) / 1.1;
    renderer.frame({
      t: 0, alpha: a.acc / M.DT, now: now, dt: dt, sparks: a.sparks, shells: [],
      lights: screen === 'results' && lastSummary && show ? show.lights : 10, beatPhase: pulse * 1.1, bar: false, guide: null, hud: null
    });
  }

  // ---- debug hooks for tests (read-only views and a bot entry point) ----
  window.__skychime = {
    state: function () {
      return { screen: screen, show: !!show, score: show ? show.score : null, lights: show ? show.lights : null,
        mult: show ? show.mult : null, time: show ? show.time() : null, visual: clock.visual(), clockSrc: clock.src,
        caps: Shell.caps, save: save, steps: stepsLastFrame, particles: renderer.parts.n,
        sparks: show ? show.model.sparks.length : ambient.sparks.length };
    },
    show: function () { return show; },
    renderer: renderer,
    view: function () { return renderer.view; },
    clock: clock,
    toScreen: function (wx, wy) { return { x: renderer.sx(wx), y: renderer.sy(wy) }; }
  };

  // ---- boot ----
  fillText();
  applySettings();
  resize();
  renderer.setSkyline(SL.BY_ID[selected] || SL.BY_ID.harbour);
  if (!save.stats.firstShowDone) {
    setScreen('begin');
  } else {
    renderMenu();
    setScreen('menu');
  }
  if (document.fonts && document.fonts.load) document.fonts.load('600 20px Archivo').then(function () { if (screen === 'menu') renderMenu(); });
  Shell.ready().then(function (c) {
    caps = c;
    resize();
    refreshAll();
    updateBanner();
  });
  requestAnimationFrame(function (t) { last = t; frame(t); });
})();
