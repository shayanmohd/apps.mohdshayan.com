/*
 * Linesaw: the loop, input, screens and every call to the shell. Pure rules live in the other modules;
 * this file wires them to the renderer, audio and game-sdk.js.
 *
 * Ad rules followed here (WEBGAME-RECIPE.md section 3, GAME-DESIGN.md section 5):
 *   no ad of any kind inside a sky or a match; no banner in the app; on the web the banner only on the
 *   menu and result cards, hidden the moment play starts;
 *   interstitials only at sky_next (Next sky on a solo result card) and match_next (Next match), under
 *   rules.js counts; never on Retry, Play, launch, exit, Back or around the Daily;
 *   rewarded only from a button that states the reward, offered only while caps.rewardedReady (or ad
 *   free), always beside a way to go on without it.
 */
(function () {
  'use strict';
  var LS = window.LS;
  var S = LS.strings.t, fmt = LS.strings.format;
  var physics = LS.physics, skyMod = LS.sky, matchMod = LS.match, rules = LS.rules, progress = LS.progress;
  var coachMod = LS.coach;
  var daily = LS.daily, festival = LS.festival, share = LS.share, audio = LS.audio, art = LS.art;
  var icon = LS.icons.icon;
  var clockMod = LS.clock;
  var DT = physics.DT;
  var PRIVACY_URL = 'https://apps.mohdshayan.com/privacy-policies/linesaw-privacy-policy.html';
  var EDGE = 32; // CSS px kept clear of each side edge, where Android's Back gesture starts
  var COLORS = { you: art.C.marigold, friend: art.C.jade };

  // ---- save ----
  Shell.configureSave({ prefix: 'linesaw', version: progress.VERSION, migrate: progress.migrate });
  var save = progress.sanitize(Shell.load('main', null));
  function persist() { Shell.save('main', save); }
  var today = daily.dayNumber(new Date());
  if (progress.settleAbandoned(save, today)) persist();

  var caps = Shell.caps;
  var reducedMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = !!(reducedMq && reducedMq.matches);
  var fest = festival.on(new Date());

  // A Daily link: ?day=N on the play page (the game runs in its frame) or on the game itself.
  var friendDay = 0;
  (function () {
    var q = '';
    try { q = window.parent && window.parent !== window ? window.parent.location.search : ''; } catch (e) { q = ''; }
    if (!q) q = window.location.search;
    var n = daily.fromQuery(q, today);
    if (n && n !== today) friendDay = n;
  })();

  // ---- DOM ----
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var canvas = $('view');
  var R = LS.render.create(canvas);
  var ui = {
    menu: $('menu'), pause: $('pause'), offer: $('offer'), offerPanel: $('offerPanel'), result: $('result'),
    resultPanel: $('resultPanel'), sheet: $('sheet'), sheetPanel: $('sheetPanel'), toast: $('toast'),
    pauseBtn: $('pauseBtn'), dailyCard: $('dailyCard'), dailyLabel: $('dailyLabel'), dailyMeta: $('dailyMeta'),
    dailyStreak: $('dailyStreak'), friendCard: $('friendCard'), soloBtn: $('soloBtn'), duoBtn: $('duoBtn'),
    adsRow: $('adsRow'), removeAdsBtn: $('removeAdsBtn'), restoreBtn: $('restoreBtn'), recordsBtn: $('recordsBtn'),
    settingsBtn: $('settingsBtn'), soundBtn: $('soundBtn'), resumeBtn: $('resumeBtn'), leaveBtn: $('leaveBtn'),
    leaveNote: $('leaveNote'), pauseSoundBtn: $('pauseSoundBtn')
  };

  function staticText() {
    // The device's language picks the table; its lang lets the browser choose the right system font
    // for scripts Barlow lacks (Devanagari, Gujarati, Gurmukhi, Bengali, Urdu, Japanese, Korean,
    // Cyrillic), and Urdu runs right to left. The canvas field and the two halves never mirror.
    document.documentElement.lang = LS.strings.code;
    document.documentElement.dir = LS.strings.dir;
    R.setDir(LS.strings.dir);
    canvas.setAttribute('aria-label', S.a11y.game);
    canvas.setAttribute('role', 'img');
    $('wordmark').textContent = S.title;
    $('tagline').textContent = S.tagline;
    if (fest && S.festival[fest]) {
      $('festivalTag').textContent = S.festival[fest];
      $('festivalTag').hidden = false;
    }
    $('dailyIcon').appendChild(icon('calendar-blank'));
    $('friendIcon').appendChild(icon('arrow-square-out'));
    ui.pauseBtn.appendChild(icon('pause'));
    ui.pauseBtn.setAttribute('aria-label', S.a11y.pause);
    ui.recordsBtn.appendChild(icon('trophy'));
    ui.recordsBtn.setAttribute('aria-label', S.a11y.records);
    ui.settingsBtn.appendChild(icon('gear'));
    ui.settingsBtn.setAttribute('aria-label', S.a11y.settings);
    ui.soundBtn.setAttribute('aria-label', S.a11y.sound);
    ui.pauseSoundBtn.setAttribute('aria-label', S.a11y.sound);
    ui.duoBtn.appendChild(icon('users'));
    ui.duoBtn.appendChild(el('span', null, S.twoPlayers));
    $('pauseTitle').textContent = S.paused;
    ui.resumeBtn.textContent = S.resume;
    ui.leaveBtn.textContent = S.leave;
    ui.restoreBtn.textContent = S.restore;
  }

  // ---- state ----
  var state = 'boot';   // boot, menu, play, paused, out, break, result
  var mode = null;      // lesson, solo, daily, friend, match
  var game = null;      // the sky or match being played
  var attract = null;
  var second = false;   // the Daily's second sky
  var lastSky = null;   // the finished sky, for Retry and Next
  var clock = clockMod.create();
  var realT = 0, lastFrame = 0, nextDraw = 0;
  var FRAME_MS = 1000 / 60;
  var timeScale = 1, slowUntil = 0, slowTo = 1;
  var pointers = {};
  var keys = {};
  var snaps = [null, null];
  var frameTimes = [];
  var pending = null;   // {at, fn}: a timed step after a cut or at sunset
  var lastHold = [false, false];
  var lessonDuelSeen = false;
  var coach = null;        // the newcomer pulse lesson for the one-player sky being flown (coach.js)
  var coachNext = false;   // the last one-player sky, a newcomer's, ended with no cut
  var coachFrames = 0;     // frames drawn with the lesson showing, for automated tests
  var boughtAdFree = false;
  var sheetKind = null;
  var adBusy = false;   // a full-screen ad was asked for: the card ignores taps and Back until it answers

  function setState(s) {
    state = s;
    document.body.setAttribute('data-state', s);
  }
  function setMode(m) {
    mode = m;
    document.body.setAttribute('data-mode', m || '');
  }

  function haptic(style) {
    if (save.settings.haptics) Shell.haptic(style);
  }

  var toastTimer = 0;
  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.hidden = true; }, 3200);
  }

  function hideScreens() {
    ui.menu.hidden = true;
    ui.pause.hidden = true;
    ui.offer.hidden = true;
    ui.result.hidden = true;
    ui.sheet.hidden = true;
    sheetKind = null;
  }

  // ---- banner (web only, menus and result cards only) ----
  function bannerFor(show) {
    if (show && caps.platform !== 'web') return;
    Shell.banner(!!show).then(function () { caps = Shell.caps; });
  }

  function adFreeNow() { return !!(Shell.caps.adFree || boughtAdFree); }

  // ---- starting play ----
  function beginPlay() {
    hideScreens();
    ui.pauseBtn.hidden = mode === 'lesson';
    pointers = {};
    keys = {};
    lastHold = [false, false];
    snaps = [null, null];
    clockMod.reset(clock);
    timeScale = 1; slowUntil = 0;
    pending = null;
    R.clearFx();
    setState('play');
    Shell.banner(false).then(function () { caps = Shell.caps; });
  }

  function sceneFor(seed, hands) {
    R.setScene({ seed: seed, festival: fest, hands: hands });
  }

  // The pulse lesson rides along with every one-player sky; it starts armed after a newcomer's sky that
  // cut nothing.
  function coachFor(m) {
    coach = coachMod.create({ mode: m, number: game.number, reached: save.sky, armed: coachNext });
    coachNext = false;
  }

  function startLesson() {
    coach = null;
    setMode('lesson');
    game = skyMod.create({ tutorial: true, pattern: save.pattern });
    lessonDuelSeen = false;
    sceneFor(game.seed, [skyMod.PLAYER_HAND, skyMod.RIVAL_HAND]);
    beginPlay();
  }

  function startSolo(number) {
    setMode('solo');
    game = skyMod.create({ number: number, pattern: save.pattern });
    coachFor('solo');
    sceneFor(game.seed, [skyMod.PLAYER_HAND, skyMod.RIVAL_HAND]);
    beginPlay();
  }

  function startDaily(isSecond) {
    today = daily.dayNumber(new Date());
    setMode('daily');
    second = !!isSecond;
    progress.startDaily(save, today, second);
    persist();
    game = skyMod.create({ day: today, pattern: save.pattern });
    coachFor('daily');
    sceneFor(game.seed, [skyMod.PLAYER_HAND, skyMod.RIVAL_HAND]);
    beginPlay();
  }

  function startFriend(day) {
    setMode('friend');
    game = skyMod.create({ day: day, pattern: save.pattern });
    coachFor('friend');
    sceneFor(game.seed, [skyMod.PLAYER_HAND, skyMod.RIVAL_HAND]);
    beginPlay();
  }

  function startMatch() {
    coach = null;
    setMode('match');
    var seed = (Date.now() ^ Math.floor(realT * 1000)) >>> 0;
    game = matchMod.create({ seed: seed, patterns: [save.pattern, (save.pattern + 1) % 3] });
    sceneFor(LS.rng.hashString('linesaw-match'), matchMod.HANDS);
    beginPlay();
  }

  // ---- the loop ----
  function holdFor(side) {
    for (var id in pointers) if (pointers[id] === side) return true;
    for (var k in keys) if (keys[k] === side) return true;
    return false;
  }

  function snapshot(world) {
    for (var s = 0; s < 2; s++) {
      var k = world.kites[s];
      if (!k) { snaps[s] = null; continue; }
      var sn = snaps[s];
      if (!sn || sn.k !== k) sn = snaps[s] = { k: k, x: 0, y: 0, th: 0, px: new Float64Array(physics.SEGS + 1), py: new Float64Array(physics.SEGS + 1) };
      sn.x = k.x; sn.y = k.y; sn.th = k.th;
      sn.px.set(k.px); sn.py.set(k.py);
    }
  }

  function slow(scale, seconds) {
    if (reduced) return;
    slowTo = scale;
    slowUntil = realT + seconds;
  }

  function frame(now) {
    // About 60 drawn frames a second on high refresh screens (section 2b): the 120 Hz physics runs the
    // same steps either way, from the real time between drawn frames.
    if (lastFrame && now < nextDraw - 3) { requestAnimationFrame(frame); return; }
    nextDraw = lastFrame && now - nextDraw < FRAME_MS ? nextDraw + FRAME_MS : now + FRAME_MS;
    var rdt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    realT += rdt;
    frameTimes.push(rdt);
    if (frameTimes.length > 240) frameTimes.shift();
    var target = slowUntil > realT ? slowTo : 1;
    timeScale += (target - timeScale) * (1 - Math.exp(-rdt / 0.06));

    var world = null, simDt = 0;
    var playing = game && (state === 'play' || state === 'paused' || state === 'out' || state === 'break' || state === 'result');
    if (playing) {
      world = game.world;
      if (state === 'play') {
        var n = clockMod.advance(clock, rdt, timeScale);
        for (var i = 0; i < n; i++) {
          snapshot(game.world);
          stepGame();
          simDt += DT;
          if (state !== 'play') break;
        }
        world = game.world;
      }
    } else if (attract) {
      var m = clockMod.advance(clock, rdt, 1);
      for (var j = 0; j < m; j++) {
        snapshot(attract.world);
        matchMod.stepAttract(attract);
        simDt += DT;
        handleAttractEvents();
      }
      world = attract.world;
    }
    if (pending && realT >= pending.at) {
      var fn = pending.fn;
      pending = null;
      fn();
    }
    draw(world, simDt, rdt);
    requestAnimationFrame(frame);
  }

  function stepGame() {
    if (mode === 'match') {
      var h = [holdFor(0), holdFor(1)];
      if (game.phase === 'count') h = [false, false];
      edgeSounds(h);
      matchMod.step(game, h);
      handleMatchEvents();
    } else {
      var hold = holdFor(0);
      edgeSounds([hold, false]);
      skyMod.step(game, hold);
      if (coach) coachMod.step(coach, game, hold, DT);
      handleSkyEvents();
    }
  }

  function edgeSounds(h) {
    for (var s = 0; s < 2; s++) {
      var k = game.world.kites[s];
      if (h[s] && !lastHold[s] && k && !k.parked) audio.zip(0.8);
      lastHold[s] = h[s];
    }
  }

  function rivalColor() {
    var k = game && game.rivalIndex != null ? game.rivalIndex : 0;
    return art.RIVALS[k % art.RIVALS.length];
  }

  function colorsNow() {
    if (mode === 'match') return [COLORS.you, COLORS.friend];
    if (game && state !== 'menu' && state !== 'boot') return [COLORS.you, rivalColor()];
    return [COLORS.you, art.RIVALS[0]];
  }

  function handleSkyEvents() {
    var evs = game.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i], d = e.data;
      switch (e.type) {
        case 'duelStart':
          haptic('light');
          if (mode === 'lesson' && !lessonDuelSeen) { lessonDuelSeen = true; slowTo = 0.5; slowUntil = realT + 1.4; }
          break;
        case 'rivalCut':
          R.cut(d.cut, art.RIVALS[(game.rivalIndex - 1) % art.RIVALS.length], game.world.wind.now);
          R.pop(d.cut.x, d.cut.y, '+' + d.mult, COLORS.you, d.mult >= 3);
          audio.snap();
          audio.drum(1 + 0.08 * (d.mult - 1), 1);
          haptic('heavy');
          slow(0.3, 0.5);
          if (d.below && !save.patterns[1]) {
            var u = progress.wonFromBelow(save);
            if (u.unlocked.length) { persist(); toast(fmt(S.newKite, { name: S.patterns[1] })); }
          }
          break;
        case 'kiteLost':
          R.cut(d.cut, COLORS.you, game.world.wind.now);
          audio.snap();
          audio.thud();
          haptic('medium');
          slow(0.45, 0.35);
          break;
        case 'ring':
          audio.chime([0, 4, 7]);
          R.burst(d.x, d.y, '#ffd678', 12);
          haptic('tap');
          break;
        case 'out':
          pending = { at: realT + 0.9, fn: onOutOfKites };
          break;
        case 'over':
          if (d.reason === 'sunset') audio.sunset();
          var wait = d.reason === 'sunset' ? 1.2 : d.reason === 'lesson' ? 1.8 : 0.6;
          setState('break');
          pending = { at: realT + wait, fn: finishSky };
          break;
      }
    }
    evs.length = 0;
  }

  function handleMatchEvents() {
    var evs = game.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i], d = e.data;
      switch (e.type) {
        case 'tick': audio.click(); break;
        case 'go': audio.drum(1.1, 0.7); haptic('tap'); break;
        case 'duelStart': haptic('light'); break;
        case 'penchWon':
          R.cut(d.cut, d.winner === 0 ? COLORS.friend : COLORS.you, game.world.wind.now);
          audio.snap();
          audio.drum(1 + 0.1 * Math.max(d.score[0], d.score[1]), 1);
          haptic('heavy');
          slow(0.3, 0.55);
          break;
        case 'over':
          setState('break');
          pending = { at: realT + 0.4, fn: finishMatch };
          break;
      }
    }
    evs.length = 0;
  }

  function handleAttractEvents() {
    var evs = attract.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.type === 'cut') R.cut(e.data, e.data.loser === 0 ? COLORS.you : art.RIVALS[0], attract.world.wind.now);
    }
    evs.length = 0;
  }

  // ---- drawing ----
  // The lesson's hint from sky.js's cue (said a reaction time early, so a press on the word lands).
  function lessonHint(world) {
    var k = world.kites[0];
    switch (game.cue) {
      case 'hold': return { hand: 'hold', text: S.hold };
      case 'letGo': return { hand: 'up', text: S.letGo };
      case 'steer': return { hand: 'up', text: S.hintSteer, alpha: 0.85 };
      case 'duel': return { text: S.glowHint, hand: null };
      case 'duelLetGo': return { text: S.glowHint, hand: 'up' };
      case 'cross':
        var r = world.kites[1];
        if (!k || !r) return null;
        var best = null, bd = 1e9;
        for (var i = 2; i < physics.SEGS; i++) {
          var dx = r.px[i] - k.x, dy = r.py[i] - k.y, dd = dx * dx + dy * dy;
          if (dd < bd) { bd = dd; best = { x: r.px[i], y: r.py[i] }; }
        }
        return { text: S.crossLine, arrowFrom: { x: k.x, y: k.y }, arrowTo: best };
    }
    return null;
  }

  function draw(world, simDt, rdt) {
    var v = {
      world: world, snaps: snaps, alpha: clockMod.alpha(clock), realT: realT, rdt: rdt, dt: simDt,
      colors: colorsNow(), aim: [false, false], p: 0.3, wind: world ? world.wind.now : 0, gust: world ? world.wind.gust : 0
    };
    if (!game || world !== game.world) v.sunLift = 0.5; // the menu: the sun hangs in the open sky
    if (game && world === game.world) {
      if (mode === 'match') {
        v.aim = [true, true];
        v.p = Math.min(0.8, 0.22 + game.t / 420);
        v.hud = { mode: 'match', firstTo: game.firstTo, score: game.score, count: game.phase === 'count' ? game.count : null };
        if (game.phase === 'count' && state === 'play') v.halves = { alpha: Math.min(1, game.count), label: game.pench === 1 ? S.hold : null };
      } else {
        v.aim = [true, false];
        v.p = mode === 'lesson' ? 0.18 : Math.min(1, world.t / game.duration);
        if (mode !== 'lesson') {
          v.hud = {
            mode: 'solo', kitesTotal: skyMod.KITES + (game.spareUsed ? 1 : 0), kitesLeft: game.kitesLeft,
            score: game.score, mult: Math.min(skyMod.MULT_CAP, game.streak + 1),
            secondsLeft: Math.max(0, game.duration - world.t), overtime: game.overtime && world.t > game.duration
          };
          if (coach && state === 'play') {
            var ca = coachMod.age(coach, world.t);
            if (ca >= 0) {
              var cp = coachMod.pose(ca);
              v.coach = { age: ca, show: coachMod.SHOW, down: cp.down, turn: cp.turn, dart: cp.dart, text: S.hintSteer };
              coachFrames++;
            }
          }
        } else if (state === 'play') {
          v.hint = lessonHint(world);
          if (game.ring >= 0 && game.ring < game.rings.length) {
            var g = game.rings[game.ring];
            v.ring = { x: g.x, y: g.y, r: skyMod.ringRadius(game) };
            // The aim line reaches the ring, so the player sees when it runs through it.
            var k0 = world.kites[0];
            if (k0) v.aimLen = Math.min(80, Math.sqrt((g.x - k0.x) * (g.x - k0.x) + (g.y - k0.y) * (g.y - k0.y)));
          }
        }
      }
    }
    if (state === 'result' || state === 'out') {
      v.hud = null;
      v.dim = 0.6;
    }
    R.draw(v);
    var duel = world && world.duel;
    var active = !!(world && (state === 'play' || state === 'menu'));
    audio.update({
      active: active,
      wind: Math.min(1, Math.abs(v.wind) / 8),
      gust: Math.min(1, Math.abs(v.gust) / 6),
      saw: duel && state === 'play' ? (duel.sawA || 0) + (duel.sawB || 0) : 0,
      hot: !!(duel && world.kites[0] && world.kites[0].heat > 0.6)
    });
  }

  // ---- ends of skies and matches ----
  function onOutOfKites() {
    if (state !== 'play' || !game || game.phase !== 'out') return;
    if (rules.canSpare(Shell.caps, game)) {
      setState('out');
      ui.pauseBtn.hidden = true;
      showSpareOffer();
    } else {
      skyMod.end(game, 'kites');
      handleSkyEvents();
    }
  }

  function showSpareOffer() {
    ui.offerPanel.innerHTML = '';
    ui.offerPanel.appendChild(el('h2', 'panel-title', S.outOfKites));
    var big = el('div', 'big-score');
    big.style.justifyContent = 'center';
    big.appendChild(el('b', null, String(game.score)));
    big.appendChild(el('span', null, S.score));
    ui.offerPanel.appendChild(big);
    ui.offerPanel.appendChild(rewardButton(S.spareAd, S.spareFree, 'spare_kite', function () {
      skyMod.grantSpare(game);
      ui.offer.hidden = true;
      ui.pauseBtn.hidden = false;
      setState('play');
      clockMod.reset(clock);
      lastFrame = 0;
    }));
    var end = el('button', 'btn wide', S.endSky);
    end.type = 'button';
    end.addEventListener('click', function () { audio.click(); endFromOffer(); });
    ui.offerPanel.appendChild(end);
    ui.offer.hidden = false;
  }

  function endFromOffer() {
    if (state !== 'out' || adBusy) return;
    ui.offer.hidden = true;
    setState('play');
    skyMod.end(game, 'kites');
    handleSkyEvents();
  }

  function rewardLabel(adText, freeText) { return adFreeNow() ? freeText : adText; }

  function rewardButton(adText, freeText, placement, onGrant) {
    var b = el('button', 'btn reward wide');
    b.type = 'button';
    b.appendChild(icon('play-circle'));
    b.appendChild(el('span', null, rewardLabel(adText, freeText)));
    b.setAttribute('data-reward', placement);
    b.hidden = !rules.rewardReady(Shell.caps);
    b.addEventListener('click', function () {
      if (adBusy) return;
      adBusy = true;
      b.disabled = true;
      audio.click();
      Shell.rewarded(placement).then(function (r) {
        adBusy = false;
        b.disabled = false;
        if (r.granted) {
          b.hidden = true;
          onGrant();
        } else {
          toast(r.reason === 'skipped' ? S.rewardSkipped : S.rewardNotReady);
          if (!rules.rewardReady(Shell.caps)) b.hidden = true;
        }
      });
    });
    return b;
  }

  function finishSky() {
    if (!game || mode === 'match') return;
    var res = skyMod.result(game);
    lastSky = { number: game.number, day: game.day, mode: mode, spareUsed: game.spareUsed, result: res, second: second };
    var out = { records: [], unlocked: [] };
    if (mode === 'lesson') {
      save.tutorialDone = true;
      persist();
      game = null;
      showMenu();
      return;
    }
    // A sky left in its first 20 s does not count towards the ad breaks.
    var counts = res.reason !== 'left' || game.world.t >= 20;
    if (mode === 'solo') {
      if (counts) rules.recordFinished(save.ads, 'solo');
      out = progress.recordSky(save, res);
    } else if (mode === 'daily') {
      if (counts) rules.recordFinished(save.ads, 'daily');
      progress.finishDaily(save, game.day, res, second);
      out = progress.recordSky(save, res);
    }
    // A sky that cut nothing arms the pulse lesson for the next one, unless it was only a 20 s look.
    coachNext = counts && coachMod.after(res, save.sky);
    persist();
    out.unlocked.forEach(function (i) { toast(fmt(S.newKite, { name: S.patterns[i] })); });
    if (out.records.length) audio.chime([0, 4, 7, 12]);
    haptic('success');
    showSkyResult(res, out);
  }

  function finishMatch() {
    var res = matchMod.result(game);
    rules.recordFinished(save.ads, 'match');
    progress.recordMatch(save, res);
    persist();
    haptic('success');
    showMatchResult(res);
  }

  // ---- result cards ----
  function kiteCanvas(color, pattern, w, h, th) {
    var c = el('canvas');
    var d = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * d;
    c.height = h * d;
    var x = c.getContext('2d');
    x.scale(d, d);
    art.kite(x, w / 2, h * 0.52, th || 0, h * 0.5, { color: color, pattern: pattern });
    return c;
  }

  function cutRow(n) {
    var row = el('div', 'cut-row');
    row.setAttribute('aria-label', S.cuts + ' ' + n);
    for (var i = 0; i < Math.min(n, 16); i++) row.appendChild(kiteCanvas(art.RIVALS[i % 3], i % 3, 22, 26, -0.2 + (i % 3) * 0.2));
    if (n > 16) row.appendChild(el('b', null, '+' + (n - 16)));
    return row;
  }

  function stat(value, label, rec) {
    var s = el('div', 'stat' + (rec ? ' rec' : ''));
    s.appendChild(el('b', null, value));
    s.appendChild(el('span', null, label));
    return s;
  }

  function btn(text, cls, fn, iconName) {
    var b = el('button', 'btn ' + (cls || ''));
    b.type = 'button';
    if (iconName) b.appendChild(icon(iconName, iconName === 'arrow-right' ? 'forward' : ''));
    b.appendChild(el('span', null, text));
    b.addEventListener('click', function () {
      if (adBusy) return;
      audio.click();
      fn(b);
    });
    return b;
  }

  function openResult(nodes) {
    hideScreens();
    ui.pauseBtn.hidden = true;
    ui.resultPanel.innerHTML = '';
    nodes.forEach(function (n) { if (n) ui.resultPanel.appendChild(n); });
    ui.result.hidden = false;
    setState('result');
    bannerFor(true);
  }

  function showSkyResult(res, out) {
    var nodes = [];
    var head = el('div', 'sheet-head');
    var box = el('div');
    var title = res.mode === 'solo' ? fmt(S.sky, { n: res.number }) : fmt(S.dailyN, { n: res.day });
    box.appendChild(el('p', 'kicker', res.reason === 'sunset' ? S.sunset : res.reason === 'kites' ? S.outOfKites : res.reason === 'done' ? S.playedToday : S.leftEarly));
    box.appendChild(el('h2', null, title));
    head.appendChild(box);
    nodes.push(head);
    var big = el('div', 'big-score');
    big.appendChild(el('b', null, String(res.score)));
    big.appendChild(el('span', null, S.score));
    nodes.push(big);
    nodes.push(cutRow(res.cuts));
    var st = el('div', 'stats');
    st.appendChild(stat(String(res.cuts), S.cuts, out.records.indexOf('cuts') >= 0));
    st.appendChild(stat(fmt(S.seconds, { n: res.duel.toFixed(1) }), S.longestDuel, out.records.indexOf('duel') >= 0));
    st.appendChild(stat(String(res.lost), S.kitesLost));
    nodes.push(st);
    if (out.records.length) {
      var bd = el('div', 'badges');
      bd.appendChild(el('span', 'badge', S.newRecord));
      nodes.push(bd);
    }
    if (mode === 'friend') nodes.push(el('p', 'small', S.friendNote));
    var actions = el('div', 'actions');
    if (mode === 'solo') {
      // Cleared (progress.cleared): Next sky leads. Otherwise Retry leads and the sky is kept, so a
      // newcomer replays the sky they could not finish; Next sky still moves on.
      var retry = function () { startSolo(lastSky.number); };
      var rowA = el('div', 'actions-row');
      if (progress.cleared(res)) {
        actions.appendChild(btn(S.nextSky, 'primary wide big', onNextSky, 'arrow-right'));
        rowA.appendChild(btn(S.retry, '', retry, 'arrow-counter-clockwise'));
      } else {
        actions.appendChild(btn(S.retry, 'primary wide big', retry, 'arrow-counter-clockwise'));
        rowA.appendChild(btn(S.nextSky, '', onNextSky, 'arrow-right'));
      }
      rowA.appendChild(btn(S.menu, '', showMenu, 'house'));
      actions.appendChild(rowA);
    } else if (mode === 'daily') {
      var d = save.daily;
      if (canShare()) actions.appendChild(btn(S.share, 'primary wide', function () { doShare(); }, 'share-network'));
      if (rules.canSecondDaily(Shell.caps, d, today)) {
        actions.appendChild(rewardButton(S.secondAd, S.secondFree, 'daily_second', function () { startDaily(true); }));
      }
      var st2 = progress.streak(save, today);
      if (st2 > 0) {
        var sr = el('p', 'small');
        sr.appendChild(document.createTextNode(S.streak + ' ' + st2));
        nodes.push(sr);
      }
      nodes.push(el('p', 'small', S.dailyDone));
      actions.appendChild(btn(S.menu, 'wide', showMenu, 'house'));
    } else {
      actions.appendChild(btn(S.retry, 'primary wide', function () { startFriend(lastSky.day); }, 'arrow-counter-clockwise'));
      actions.appendChild(btn(S.menu, 'wide', showMenu, 'house'));
    }
    nodes.push(actions);
    openResult(nodes);
  }

  // The natural break: Next sky may show an interstitial under rules.js counts, then the sky starts
  // whatever happened.
  function onNextSky(b) {
    if (lastSky) progress.reachSky(save, lastSky.number + 1);
    persist();
    var allowed = rules.interstitialAllowed(save.ads, {
      kind: 'sky_next', adFree: adFreeNow(), daily: false, spareUsed: !!(lastSky && lastSky.spareUsed)
    });
    if (allowed.ok && Shell.caps.interstitial) {
      b.disabled = true;
      adBusy = true;
      setState('break');
      Shell.interstitial('sky_next').then(function (r) {
        adBusy = false;
        rules.afterInterstitial(save.ads, r);
        persist();
        startSolo(save.sky);
      });
    } else {
      startSolo(save.sky);
    }
  }

  function onNextMatch(b) {
    var allowed = rules.interstitialAllowed(save.ads, { kind: 'match_next', adFree: adFreeNow(), daily: false, spareUsed: false });
    if (allowed.ok && Shell.caps.interstitial) {
      b.disabled = true;
      adBusy = true;
      setState('break');
      Shell.interstitial('match_next').then(function (r) {
        adBusy = false;
        rules.afterInterstitial(save.ads, r);
        persist();
        startMatch();
      });
    } else {
      startMatch();
    }
  }

  function showMatchResult(res) {
    var nodes = [];
    var head = el('div', 'sheet-head');
    var box = el('div');
    box.appendChild(el('p', 'kicker', S.twoPlayers));
    box.appendChild(el('h2', null, res.winner === 0 ? S.leftWins : S.rightWins));
    head.appendChild(box);
    nodes.push(head);
    var sc = el('div', 'match-score');
    sc.appendChild(kiteCanvas(COLORS.you, save.pattern, 40, 50, -0.2));
    sc.appendChild(el('span', 'l', String(res.score[0])));
    sc.appendChild(el('i', null, ':'));
    sc.appendChild(el('span', 'r', String(res.score[1])));
    sc.appendChild(kiteCanvas(COLORS.friend, (save.pattern + 1) % 3, 40, 50, 0.2));
    nodes.push(sc);
    var st = el('div', 'stats');
    st.appendChild(stat(fmt(S.seconds, { n: res.duel.toFixed(1) }), S.longestDuel));
    nodes.push(st);
    var actions = el('div', 'actions');
    actions.appendChild(btn(S.nextMatch, 'primary wide big', onNextMatch, 'arrow-right'));
    actions.appendChild(btn(S.menu, 'wide', showMenu, 'house'));
    nodes.push(actions);
    // The one Remove ads offer on its own: after the first finished two-player match, once.
    if (rules.offerRemoveAdsAfterMatch(Shell.caps, save.removeAdsPrompted)) {
      save.removeAdsPrompted = true;
      persist();
      var offer = el('div', 'offer-box');
      offer.appendChild(el('p', null, S.removeAdsLine));
      offer.appendChild(removeAdsButton('quiet'));
      nodes.push(offer);
    }
    openResult(nodes);
  }

  // ---- share (Daily only), straight from the tap ----
  function canShare() {
    return typeof Shell.share === 'function' && !!Shell.caps.share;
  }

  function doShare() {
    var d = save.daily;
    var best = progress.dailyBest(d) || { cuts: 0, lost: 0, duel: 0, spare: false };
    var hasSecond = !!d.second;
    var text = share.text(d.day || today, best, hasSecond);
    var png = share.png(d.day || today, best, hasSecond, save.pattern, LS.render.FONT);
    Shell.share({ text: text, url: daily.link(d.day || today), png: png }).then(function (r) {
      if (r.reason === 'copied') toast(S.shareCopied);
      else if (!r.ok && r.reason !== 'cancelled') toast(S.shareFailed);
    });
  }

  // ---- Remove ads ----
  function removeAdsButton(cls) {
    var price = Shell.caps.removeAdsPrice;
    var b = el('button', 'btn ' + (cls || ''), price ? fmt(S.removeAdsPrice, { price: price }) : S.removeAds);
    b.type = 'button';
    b.addEventListener('click', function () {
      b.disabled = true;
      audio.click();
      Shell.buyRemoveAds().then(function (r) {
        b.disabled = false;
        if (r.adFree) boughtAdFree = true;
        toast(S.purchase[r.reason] || S.purchase.failed);
        caps = Shell.caps;
        refreshMenu();
        if (sheetKind === 'settings') openSettings();
      });
    });
    return b;
  }

  function doRestore() {
    Shell.restore().then(function (r) {
      if (r.adFree) boughtAdFree = true;
      toast(r.ok ? (r.adFree ? S.restored.yes : S.restored.no) : S.restored.failed);
      caps = Shell.caps;
      refreshMenu();
      if (sheetKind === 'settings') openSettings();
    });
  }

  // ---- menu ----
  function showMenu() {
    hideScreens();
    game = null;
    setMode(null);
    ui.pauseBtn.hidden = true;
    pointers = {};
    keys = {};
    if (!attract) attract = matchMod.createAttract(LS.rng.hashString('attract-' + today));
    sceneFor(LS.rng.hashString('linesaw-menu-' + today), matchMod.HANDS);
    snaps = [null, null];
    clockMod.reset(clock);
    setState('menu');
    refreshMenu();
    ui.menu.hidden = false;
    bannerFor(true);
  }

  function refreshMenu() {
    today = daily.dayNumber(new Date());
    var d = progress.ensureDay(save, today);
    ui.dailyLabel.textContent = fmt(S.dailyN, { n: today });
    var streakN = progress.streak(save, today);
    ui.dailyStreak.innerHTML = '';
    if (streakN > 0) {
      ui.dailyStreak.appendChild(icon('flame'));
      ui.dailyStreak.appendChild(document.createTextNode(String(streakN)));
      ui.dailyStreak.setAttribute('aria-label', S.streak + ' ' + streakN);
    }
    if (d.done) {
      var best = progress.dailyBest(d);
      ui.dailyMeta.textContent = S.playedToday + ': ' + S.score + ' ' + (best ? best.score : 0) + (d.second ? ', ' + S.secondMark : '');
    } else {
      ui.dailyMeta.textContent = S.play;
    }
    ui.friendCard.hidden = !friendDay;
    if (friendDay) {
      $('friendLabel').textContent = fmt(S.friendSky, { n: friendDay });
      $('friendNote').textContent = S.friendNote;
    }
    ui.soloBtn.innerHTML = '';
    ui.soloBtn.appendChild(icon('play'));
    ui.soloBtn.appendChild(el('span', null, fmt(S.sky, { n: save.sky })));
    var c = Shell.caps;
    var showAds = !!c.removeAds && !adFreeNow();
    ui.adsRow.hidden = !c.removeAds || adFreeNow();
    ui.removeAdsBtn.hidden = !showAds;
    ui.removeAdsBtn.textContent = c.removeAdsPrice ? fmt(S.removeAdsPrice, { price: c.removeAdsPrice }) : S.removeAds;
    soundIcons();
  }

  function soundIcons() {
    [ui.soundBtn, ui.pauseSoundBtn].forEach(function (b) {
      b.innerHTML = '';
      b.appendChild(icon(save.settings.sound ? 'speaker-high' : 'speaker-slash'));
      b.setAttribute('aria-pressed', save.settings.sound ? 'true' : 'false');
    });
  }

  function toggleSound() {
    save.settings.sound = !save.settings.sound;
    audio.setMuted(!save.settings.sound);
    persist();
    soundIcons();
    if (save.settings.sound) { audio.unlock(); audio.click(); }
  }

  // ---- sheets: settings, records, how to play ----
  function openSheet(kind, nodes) {
    sheetKind = kind;
    ui.sheetPanel.innerHTML = '';
    nodes.forEach(function (n) { if (n) ui.sheetPanel.appendChild(n); });
    ui.sheet.hidden = false;
  }

  function closeSheet() {
    ui.sheet.hidden = true;
    sheetKind = null;
  }

  function headWithClose(title) {
    var head = el('div', 'sheet-head');
    head.appendChild(el('h2', null, title));
    var b = el('button', 'icon-btn', null);
    b.type = 'button';
    b.appendChild(icon('x'));
    b.setAttribute('aria-label', S.a11y.close);
    b.addEventListener('click', function () { audio.click(); closeSheet(); });
    head.appendChild(b);
    return head;
  }

  function row(label, value, fn) {
    var b = el('button', 'row');
    b.type = 'button';
    b.appendChild(el('span', null, label));
    var v = el('span', 'val');
    if (typeof value === 'string') v.textContent = value; else if (value) v.appendChild(value);
    b.appendChild(v);
    b.addEventListener('click', function () { audio.click(); fn(); });
    return b;
  }

  function openSettings() {
    caps = Shell.caps;
    var rows = el('div', 'rows');
    rows.appendChild(row(S.sound, save.settings.sound ? S.on : S.off, function () { toggleSound(); openSettings(); }));
    rows.appendChild(row(S.vibration, save.settings.haptics ? S.on : S.off, function () {
      save.settings.haptics = !save.settings.haptics;
      persist();
      if (save.settings.haptics) Shell.haptic('medium');
      openSettings();
    }));
    rows.appendChild(row(S.howToPlay, icon('question'), openHowTo));
    var link = el('a', 'row');
    link.href = PRIVACY_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.appendChild(el('span', null, S.privacyPolicy));
    var lv = el('span', 'val');
    lv.appendChild(icon('arrow-square-out'));
    link.appendChild(lv);
    rows.appendChild(link);
    // Privacy options: only while the shell says the consent form applies (caps.privacyOptions).
    if (caps.privacyOptions) {
      rows.appendChild(row(S.privacyOptions, icon('shield-check'), function () {
        Shell.privacyOptions().then(function () { caps = Shell.caps; });
      }));
    }
    var nodes = [headWithClose(S.settings), rows];
    if (caps.removeAds) {
      var box = el('div', 'offer-box');
      if (adFreeNow()) {
        box.appendChild(el('p', null, S.adFreeThanks));
      } else {
        box.appendChild(el('p', null, S.removeAdsLine));
        box.appendChild(removeAdsButton('primary wide'));
      }
      var rb = el('button', 'btn quiet', S.restore);
      rb.type = 'button';
      rb.addEventListener('click', function () { audio.click(); doRestore(); });
      box.appendChild(rb);
      nodes.push(box);
    }
    // Keys only where there is likely a keyboard: not in the app, not on a touch-only phone browser.
    if (caps.platform !== 'android' && window.matchMedia && window.matchMedia('(any-pointer: fine)').matches) {
      nodes.push(el('p', 'small', S.keysSolo + '.    ' + S.twoPlayers + ': ' + S.keysTwo));
    }
    nodes.push(el('p', 'small', S.licences));
    openSheet('settings', nodes);
  }

  function openHowTo() {
    var prose = el('div', 'prose');
    S.howTo.forEach(function (p) { prose.appendChild(el('p', null, p)); });
    openSheet('howto', [headWithClose(S.howToPlay), prose]);
  }

  function openRecords() {
    function tile(v, label) {
      var t = el('div', 'tile');
      t.appendChild(el('b', null, v));
      t.appendChild(el('span', null, label));
      return t;
    }
    var tiles = el('div', 'tiles');
    tiles.appendChild(tile(String(save.records.cuts), S.mostCuts));
    tiles.appendChild(tile(String(save.records.score), S.bestScore));
    tiles.appendChild(tile(fmt(S.seconds, { n: save.records.duel.toFixed(1) }), S.longestDuel));
    tiles.appendChild(tile(String(progress.streak(save, today)), S.streak));
    tiles.appendChild(tile(String(save.stats.skies), S.skiesFlown));
    tiles.appendChild(tile(String(save.stats.matches), S.matchesPlayed));
    var kites = el('div', 'kites');
    for (var i = 0; i < progress.PATTERNS; i++) {
      (function (i) {
        var open = save.patterns[i];
        var b = el('button', 'kite-pick' + (save.pattern === i ? ' on' : ''));
        b.type = 'button';
        b.disabled = !open;
        b.appendChild(kiteCanvas(open ? COLORS.you : '#3a3f52', i, 48, 60, 0));
        b.appendChild(el('b', null, S.patterns[i]));
        b.appendChild(el('span', null, S.patternHow[i]));
        if (!open) b.setAttribute('aria-label', S.patterns[i] + ', ' + S.patternHow[i]);
        b.addEventListener('click', function () {
          if (!save.patterns[i]) return;
          audio.click();
          save.pattern = i;
          persist();
          openRecords();
        });
        kites.appendChild(b);
      })(i);
    }
    openSheet('records', [headWithClose(S.records), tiles, el('h3', 'kicker', S.kites), kites]);
  }

  // ---- pause ----
  function pauseGame() {
    if (state !== 'play') return;
    setState('paused');
    pointers = {};
    keys = {};
    if (mode === 'daily' && game) { progress.notePartial(save, skyMod.result(game)); }
    persist();
    ui.leaveNote.textContent = mode === 'daily' ? S.leaveDaily : '';
    ui.leaveNote.hidden = mode !== 'daily';
    soundIcons();
    ui.pause.hidden = false;
  }

  function resumeGame() {
    if (state !== 'paused') return;
    ui.pause.hidden = true;
    setState('play');
    clockMod.reset(clock);
    lastFrame = 0;
    audio.resume();
  }

  function leaveFromPause() {
    ui.pause.hidden = true;
    if (mode === 'lesson') { save.tutorialDone = true; persist(); }
    if (mode === 'match' || mode === 'lesson') { game = null; showMenu(); return; }
    setState('play');
    skyMod.end(game, 'left');
    handleSkyEvents();
  }

  // ---- input ----
  function sideFor(clientX) {
    var w = window.innerWidth;
    if (clientX < EDGE || clientX > w - EDGE) return -1; // the Back gesture's edge
    if (mode === 'match') return clientX < w / 2 ? 0 : 1;
    return 0;
  }

  function onPointerDown(e) {
    audio.unlock();
    if (state !== 'play') return;
    var side = sideFor(e.clientX);
    if (side < 0) return;
    // A thumb resting through the 3, 2, 1 is kept: it launches the kite the moment the count ends.
    pointers[e.pointerId] = side;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    e.preventDefault();
  }
  function onPointerUp(e) {
    delete pointers[e.pointerId];
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('lostpointercapture', onPointerUp);
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('selectstart', function (e) { if (e.target === canvas || state === 'play') e.preventDefault(); });

  var LEFT_KEYS = { KeyA: 1, KeyS: 1, KeyD: 1, KeyW: 1, KeyQ: 1, KeyZ: 1, ShiftLeft: 1 };
  var RIGHT_KEYS = { KeyL: 1, KeyK: 1, KeyJ: 1, KeyI: 1, KeyO: 1, KeyP: 1, ShiftRight: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Semicolon: 1 };
  window.addEventListener('keydown', function (e) {
    audio.unlock();
    if (state !== 'play') return;
    var code = e.code;
    var side = -1;
    if (mode === 'match') {
      side = LEFT_KEYS[code] ? 0 : RIGHT_KEYS[code] ? 1 : -1;
    } else if (code === 'Space' || code === 'Enter' || LEFT_KEYS[code] || RIGHT_KEYS[code]) {
      side = 0;
    }
    if (side < 0) return;
    keys[code] = side;
    e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { delete keys[e.code]; });
  window.addEventListener('blur', function () { pointers = {}; keys = {}; });
  document.addEventListener('pointerdown', function () { audio.unlock(); }, { passive: true });

  ui.pauseBtn.addEventListener('click', function () { audio.click(); pauseGame(); });
  ui.resumeBtn.addEventListener('click', function () { audio.click(); resumeGame(); });
  ui.leaveBtn.addEventListener('click', function () { audio.click(); leaveFromPause(); });
  ui.pauseSoundBtn.addEventListener('click', toggleSound);
  ui.soundBtn.addEventListener('click', toggleSound);
  ui.soloBtn.addEventListener('click', function () { audio.unlock(); audio.click(); startSolo(save.sky); });
  ui.duoBtn.addEventListener('click', function () { audio.unlock(); audio.click(); startMatch(); });
  ui.dailyCard.addEventListener('click', function () {
    audio.unlock();
    audio.click();
    today = daily.dayNumber(new Date());
    var d = progress.ensureDay(save, today);
    if (d.done) {
      lastSky = { mode: 'daily', day: today, result: progress.dailyBest(d) };
      setMode('daily');
      game = null;
      var best = progress.dailyBest(d);
      showSkyResult({ mode: 'daily', day: today, cuts: best.cuts, score: best.score, lost: best.lost, duel: best.duel, spare: best.spare, reason: 'done' }, { records: [], unlocked: [] });
      return;
    }
    startDaily(false);
  });
  ui.friendCard.addEventListener('click', function () { audio.unlock(); audio.click(); startFriend(friendDay); });
  ui.removeAdsBtn.addEventListener('click', function () {
    var b = ui.removeAdsBtn;
    b.disabled = true;
    audio.click();
    Shell.buyRemoveAds().then(function (r) {
      b.disabled = false;
      if (r.adFree) boughtAdFree = true;
      toast(S.purchase[r.reason] || S.purchase.failed);
      caps = Shell.caps;
      refreshMenu();
    });
  });
  ui.restoreBtn.addEventListener('click', function () { audio.click(); doRestore(); });
  ui.recordsBtn.addEventListener('click', function () { audio.click(); openRecords(); });
  ui.settingsBtn.addEventListener('click', function () { audio.click(); openSettings(); });
  ui.sheet.addEventListener('click', function (e) { if (e.target === ui.sheet) closeSheet(); });

  // ---- shell lifecycle ----
  Shell.onPause(function () {
    if (state === 'play') pauseGame();
    if (mode === 'daily' && game && game.phase !== 'over') progress.notePartial(save, skyMod.result(game));
    persist();
    audio.suspend();
  });
  Shell.onResume(function () {
    if (state !== 'paused') audio.resume();
  });
  var capsKey = '';
  var insetsKey = '';
  Shell.onChange(function () {
    caps = Shell.caps;
    // Caps change often (an ad loads, consent settles); only new insets need a new layout.
    var ik = [caps.insets.top, caps.insets.right, caps.insets.bottom, caps.insets.left].join(',');
    if (ik !== insetsKey) {
      insetsKey = ik;
      R.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, caps.insets);
    }
    var key = [caps.adFree, caps.removeAds, caps.privacyOptions, caps.removeAdsPrice].join('|');
    if (key !== capsKey) {
      capsKey = key;
      if (!ui.sheet.hidden && sheetKind === 'settings') openSettings();
    }
    if (state === 'menu') refreshMenu();
    // A rewarded button disappears the moment no ad can be shown (caps.rewardedReady).
    var ready = rules.rewardReady(caps);
    Array.prototype.forEach.call(document.querySelectorAll('[data-reward]'), function (b) { b.hidden = !ready; });
  });
  Shell.onBack(function () {
    if (adBusy) return true;
    if (!ui.sheet.hidden) { closeSheet(); return true; }
    if (state === 'out') { endFromOffer(); return true; }
    if (state === 'play') { pauseGame(); return true; }
    if (state === 'paused') { resumeGame(); return true; }
    if (state === 'break') return true;
    if (state === 'result') { showMenu(); return true; }
    return false;
  });

  function resize() {
    caps = Shell.caps;
    R.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, caps.insets);
  }
  window.addEventListener('resize', resize);
  if (reducedMq) {
    R.setReduced(reduced);
    var onReduced = function () { reduced = reducedMq.matches; R.setReduced(reduced); };
    if (reducedMq.addEventListener) reducedMq.addEventListener('change', onReduced);
  }

  // ---- read-only view for automated tests ----
  window.__linesaw = {
    get state() { return state; },
    get mode() { return mode; },
    get game() {
      if (!game) return null;
      var w = game.world;
      var k0 = w.kites[0], k1 = w.kites[1];
      function kv(k) { return k ? { x: k.x, y: k.y, th: k.th, hold: k.hold, parked: k.parked, heat: k.heat, wear: k.wear } : null; }
      return {
        t: w.t, phase: game.phase, score: game.score, cuts: game.cuts, kitesLeft: game.kitesLeft, lost: game.lost,
        ring: game.ring, duel: !!w.duel, k0: kv(k0), k1: kv(k1), pench: game.pench, matchScore: game.score && game.score.slice ? game.score.slice() : null,
        count: game.count, spareUsed: game.spareUsed, number: game.number, day: game.day
      };
    },
    raw: function () { return game; },
    get save() { return JSON.parse(JSON.stringify(save)); },
    fps: function () {
      var s = 0;
      for (var i = 0; i < frameTimes.length; i++) s += frameTimes[i];
      var sorted = frameTimes.slice().sort(function (a, b) { return a - b; });
      return { avg: frameTimes.length / s, p95ms: sorted[Math.floor(sorted.length * 0.95)] * 1000, frames: frameTimes.length };
    },
    friendDay: function () { return friendDay; },
    get coach() {
      return coach ? { on: coach.on, armed: coach.armed, at: coach.at, why: coach.why, held: coach.held, frames: coachFrames } : null;
    },
    get coachNext() { return coachNext; },
    lang: LS.strings.code,
    dir: LS.strings.dir,
    fit: function (str, size, maxW) { var f = R.fit(str, size, maxW); return { size: f.size, lines: f.lines.slice(), widths: f.widths.slice(), over: f.over }; },
    hintRoom: function () { return R.hintRoom(); },
    halfRoom: function () { return R.w / 2 - 24; }
  };

  // ---- boot ----
  staticText();
  audio.setMuted(!save.settings.sound);
  // Every canvas the frame loop uses is made and sized here, before Shell.ready() (render.js R.alloc).
  var inApp = Shell.caps.platform === 'android';
  R.alloc(inApp ? Math.max(window.innerWidth, screen.width || 0) : window.innerWidth,
    inApp ? Math.max(window.innerHeight, screen.height || 0) : window.innerHeight,
    window.devicePixelRatio || 1, inApp);
  resize();
  setState('boot');
  attract = matchMod.createAttract(LS.rng.hashString('attract-' + today));
  sceneFor(LS.rng.hashString('linesaw-menu-' + today), matchMod.HANDS);
  requestAnimationFrame(frame);
  var fontsReady = document.fonts && document.fonts.load ? Promise.all([
    document.fonts.load('700 20px Barlow'), document.fonts.load('400 20px Barlow')
  ]).catch(function () {}) : Promise.resolve();
  Promise.all([Shell.ready(), fontsReady]).then(function () {
    caps = Shell.caps;
    resize();
    if (!save.tutorialDone) startLesson();
    else showMenu();
  });
})();
