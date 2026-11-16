/*
 * Twotenths: the game loop, the screens and the shell. Pure rules live in stop.js, race.js, rush.js,
 * progress.js and breaks.js; this file sequences them, judges input on simulation time and talks to
 * game-sdk.js.
 *
 * Timing: each part of a race (the lights, a call, a stop) is a segment with its own simulation clock,
 * advanced in fixed 1/120 s steps (clock.js). A tap carries its pointer event's timestamp, mapped onto
 * the segment clock, and is applied at that exact instant between steps, so judging never depends on the
 * frame rate. Drawing is paced to at most 60 fps (pace.js); still screens draw only when something
 * changes.
 *
 * Ads (WEBGAME-RECIPE.md section 3 and the wave 7 ad plan): no banner in the app; on the web a banner on
 * the menu and result screens only. Interstitials only at Next race (breaks.nextRace) and at the end of a
 * Stop Rush run of 4+ stops (breaks.rushEnd), never around a daily. Rewarded only from buttons that state
 * the reward, offered only while caps.rewardedReady or ad free.
 */
(function () {
  'use strict';

  var TT = window.TT;
  var S = TT.strings, T = S.t, F = S.format;
  var stopM = TT.stop, raceM = TT.race, rushM = TT.rush, dailyM = TT.daily, prog = TT.progress;
  var breaks = TT.breaks, R = TT.render, audio = TT.audio, icons = TT.icons, clockM = TT.clock;
  var paceM = TT.pace, shareM = TT.share;

  var POLICY_URL = 'https://apps.mohdshayan.com/privacy-policies/twotenths-privacy-policy.html';
  var SLOT = 'progress';
  var DT = clockM.DT;

  document.documentElement.lang = S.code;

  // ---- save ----
  Shell.configureSave({ prefix: 'twotenths', version: prog.VERSION, migrate: prog.migrate });
  var save = prog.sanitize(Shell.load(SLOT, null));
  function persist() { Shell.save(SLOT, save); }

  var caps = Shell.caps;
  var today = dailyM.dayNumber(new Date());
  // A daily left mid-race (the app was closed) counts as retired.
  if (save.daily.day === today && save.daily.state === 'started') { prog.retireDaily(save, today); persist(); }

  var friendDay = 0;
  (function () {
    var q = '';
    try { q = window.parent && window.parent !== window ? window.parent.location.search : ''; } catch (e) { q = ''; }
    if (!q) q = window.location.search;
    var n = dailyM.fromQuery(q, today);
    if (n && n !== today) friendDay = n;
  })();

  // ---- DOM ----
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function iconBtn(btn, name, label) {
    btn.textContent = '';
    btn.appendChild(icons.icon(name));
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }
  function btn(label, cls, icon) {
    var b = el('button', 'btn ' + (cls || ''));
    b.type = 'button';
    if (icon) b.appendChild(icons.icon(icon));
    b.appendChild(el('span', null, label));
    return b;
  }

  var ui = {
    canvas: $('view'), pause: $('pauseBtn'), menu: $('menu'), wordmark: $('wordmark'), tagline: $('tagline'),
    friendCard: $('friendCard'), friendTitle: $('friendTitle'), friendNote: $('friendNote'),
    dailyCard: $('dailyCard'), dailyBtn: $('dailyBtn'), dailyTitle: $('dailyTitle'), dailyDay: $('dailyDay'),
    dailyStatus: $('dailyStatus'), dailyActions: $('dailyActions'), dailyShare: $('dailyShareBtn'), dailyAgain: $('dailyAgainBtn'),
    raceBtn: $('raceBtn'), rushBtn: $('rushBtn'), rushLabel: $('rushLabel'), rushBest: $('rushBest'), bests: $('bests'),
    adsRow: $('adsRow'), removeAds: $('removeAdsBtn'), restore: $('restoreBtn'),
    records: $('recordsBtn'), archive: $('archiveBtn'), settings: $('settingsBtn'), sound: $('soundBtn'),
    call: $('call'), callBar: $('callBar'), callOptions: $('callOptions'),
    pausePanel: $('pause'), pauseTitle: $('pauseTitle'), resume: $('resumeBtn'), leave: $('leaveBtn'), leaveNote: $('leaveNote'), pauseSound: $('pauseSoundBtn'),
    result: $('result'), resultPanel: $('resultPanel'), offer: $('offer'), offerPanel: $('offerPanel'),
    sheet: $('sheet'), sheetPanel: $('sheetPanel'), toast: $('toast')
  };

  ui.wordmark.textContent = T.title;
  ui.tagline.textContent = T.tagline;
  ui.dailyTitle.textContent = T.dailyGp;
  iconBtn(ui.pause, 'pause', T.pause);
  iconBtn(ui.records, 'trophy', T.records);
  iconBtn(ui.archive, 'archive', T.archive);
  iconBtn(ui.settings, 'gear', T.settings);
  ui.pauseTitle.textContent = T.paused;
  ui.resume.textContent = T.resume;
  ui.leave.textContent = T.leave;
  ui.leaveNote.textContent = T.leaveDaily;
  ui.restore.textContent = T.restore;
  ui.rushLabel.textContent = T.rush;

  // ---- settings ----
  var mql = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() {
    if (save.settings.motion === 'reduced') return true;
    if (save.settings.motion === 'full') return false;
    return !!(mql && mql.matches);
  }
  function applySettings() {
    audio.setMuted(!save.settings.sound);
    R.setReduced(reducedMotion());
    iconBtn(ui.sound, save.settings.sound ? 'speaker-high' : 'speaker-slash', save.settings.sound ? T.soundOn : T.soundOff);
    iconBtn(ui.pauseSound, save.settings.sound ? 'speaker-high' : 'speaker-slash', save.settings.sound ? T.soundOn : T.soundOff);
  }
  function haptic(style) {
    if (save.settings.haptics) Shell.haptic(style);
  }

  // ---- state ----
  var state = 'boot';  // menu | play | paused | result | sheet
  var mode = null;     // career | daily | archive | friend | rush
  var phase = null;    // lights | between | call | stop | over
  var game = null;     // the race being run: { race, run, idx, ... }
  var rushRun = null;
  var st = null;       // the stop state
  var seg = { base: 0, t: 0 };
  var clk = clockM.create();
  var inputs = [];
  var lampPointer = null, keyHeld = false;
  var pendingAt = -1, pendingFn = null;
  var hint = null;
  var look = 'night';
  var hud = { watch: '0.00' };
  var pos = 9, posDelta = 0, posAt = -10;
  var steps = [0, 0, 0, 0];
  var realT = 0, lastMs = 0;
  var dirty = true;
  var pacer = paceM.create(60);
  var pausedAt = 0;
  var resultCtx = null;
  var lastLit = 0;
  var callChosen = false;
  var busyAd = false;

  function setState(next) {
    state = next;
    document.body.setAttribute('data-state', next);
    ui.menu.hidden = next !== 'menu';
    ui.pause.hidden = next !== 'play';
    ui.pausePanel.hidden = next !== 'paused';
    ui.result.hidden = next !== 'result';
    if (next !== 'play' && next !== 'paused') ui.call.hidden = true;
    dirty = true;
    banner(next === 'menu' || next === 'result');
  }

  // Banners only on the web, on menus and result screens, never during play (shared rule 1).
  var bannerOn = null;
  function banner(show) {
    if (caps.platform !== 'web') return;
    if (bannerOn === show) return;
    bannerOn = show;
    Shell.banner(show);
  }

  /** While an ad or a purchase is open, every button on that panel is off, so nothing else can start. */
  function lock(panel, on) {
    var bs = panel.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) bs[i].disabled = !!on;
  }

  // ---- toast ----
  var toastTimer = 0;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.hidden = true; }, 2600);
  }

  // ---- formatting ----
  function f2(x) { return (Math.round(x * 100) / 100).toFixed(2); }
  function f3(x) { return (Math.round(x * 1000) / 1000).toFixed(3); }
  function timeClass(stop) {
    if (stop.unsafe) return 't-red';
    if (stop.time <= 1.80) return 't-purple';
    if (stop.time < 2.0) return 't-green';
    return 't-amber';
  }
  function timeCol(stop) {
    var c = R.COL;
    if (stop.unsafe) return c.red;
    if (stop.time <= 1.80) return c.purple;
    if (stop.time < 2.0) return c.green;
    return c.amber;
  }
  function reactionCol(r) {
    var c = R.COL;
    return r < 0.2 ? c.purple : r < 0.28 ? c.green : c.amber;
  }

  // ---- the segment clock ----
  function newSegment() {
    seg.base = performance.now();
    seg.t = 0;
    clockM.reset(clk);
    inputs.length = 0;
  }

  /** The segment time of an event, from its own timestamp (same clock as performance.now in browsers). */
  function eventTime(e) {
    var now = performance.now();
    var ts = e && e.timeStamp;
    if (!(ts > now - 1000 && ts <= now + 1)) ts = now;
    return Math.max(seg.t, (ts - seg.base) / 1000);
  }

  function later(seconds, fn) {
    pendingAt = seg.t + seconds;
    pendingFn = fn;
  }

  // ---- menu ----
  function showMenu() {
    game = null; st = null; rushRun = null; hint = null; phase = null; mode = null;
    resultCtx = null;
    ui.offer.hidden = true;
    ui.sheet.hidden = true;
    R.clearEffects();
    today = dailyM.dayNumber(new Date());
    prog.dailyFor(save, today);
    refreshMenu();
    setState('menu');
  }

  function refreshMenu() {
    caps = Shell.caps;
    var d = save.daily.day === today ? save.daily : { state: 'none' };
    ui.dailyDay.textContent = F(T.dayN, { n: today });
    var streak = prog.streakNow(save, today);
    var status;
    if (d.state === 'done' && d.result) {
      status = F(T.finishedP, { p: d.result.finish }) + (d.result.tries > 1 ? ', ' + T.twoTries : '');
    } else if (d.state === 'retired') {
      status = T.retired;
    } else {
      status = T.oneTry;
    }
    if (streak > 0) status += '. ' + F(T.streak, { n: streak });
    ui.dailyStatus.textContent = status;
    var done = d.state === 'done' || d.state === 'retired';
    ui.dailyBtn.disabled = false;
    ui.dailyBtn.setAttribute('aria-disabled', done ? 'true' : 'false');
    var canShare = d.state === 'done' && d.result && caps.share && typeof Shell.share === 'function';
    ui.dailyShare.hidden = !canShare;
    if (canShare) { iconBtn(ui.dailyShare, 'share-network', T.share); ui.dailyShare.className = 'icon-btn'; }
    var again = breaks.dailyAgainOffer(save, today, caps);
    ui.dailyAgain.hidden = !again;
    if (again) {
      ui.dailyAgain.textContent = '';
      ui.dailyAgain.appendChild(icons.icon(caps.adFree ? 'arrow-counter-clockwise' : 'play'));
      ui.dailyAgain.appendChild(el('span', null, caps.adFree ? T.againFree : T.againAd));
      ui.dailyAgain.className = 'btn quiet small reward';
    }
    ui.dailyActions.hidden = ui.dailyShare.hidden && ui.dailyAgain.hidden;

    ui.friendCard.hidden = !friendDay;
    if (friendDay) {
      ui.friendTitle.textContent = F(T.friendTitle, { n: friendDay });
      ui.friendNote.textContent = T.friendNote;
    }
    ui.raceBtn.textContent = '';
    ui.raceBtn.appendChild(icons.icon('flag-checkered'));
    ui.raceBtn.appendChild(el('span', null, F(T.raceN, { n: save.race })));
    ui.rushBest.textContent = save.best.rush ? F(T.bestN, { n: save.best.rush }) : '';

    // Bests: stop, start and the clubs.
    ui.bests.textContent = '';
    function cell(k, v, extra) {
      var dv = el('div');
      dv.appendChild(el('dt', null, k));
      var dd = el('dd', null, v);
      dv.appendChild(dd);
      if (extra) dv.appendChild(extra);
      ui.bests.appendChild(dv);
      return dd;
    }
    var bs = cell(T.bestStop, save.best.stop ? f2(save.best.stop) : '0.00');
    bs.className = save.best.stop ? timeClass({ time: save.best.stop }) : 'empty';
    var br = cell(T.bestReaction, save.best.reaction ? f3(save.best.reaction) : '0.000');
    if (!save.best.reaction) br.className = 'empty';
    var clubs = el('div', 'clubs');
    [['c200', save.clubs.sub200, T.clubSub200], ['c190', save.clubs.sub190, T.clubSub190], ['rec', save.clubs.record, T.clubRecord]].forEach(function (c) {
      var i = el('i', c[0] + (c[1] ? ' on' : ''));
      i.title = c[2];
      clubs.appendChild(i);
    });
    var cd = cell(T.clubs, '');
    cd.appendChild(clubs);

    // Remove ads and archive, with Restore beside it, only where Play can sell it.
    var showRemove = breaks.removeAdsMenu(caps);
    ui.adsRow.hidden = !caps.removeAds;
    ui.removeAds.hidden = !showRemove;
    ui.removeAds.textContent = T.removeAds + (caps.removeAdsPrice ? '  ' + caps.removeAdsPrice : '');
    ui.restore.hidden = !caps.removeAds;
    ui.archive.hidden = !caps.adFree;
    applySettings();
    dirty = true;
  }

  // ---- starting things ----
  function beginPlay() {
    ui.offer.hidden = true;
    setState('play');
    banner(false);
    R.clearEffects();
    audio.resume();
  }

  function startRace(spec, m) {
    mode = m;
    var race = raceM.build(spec);
    game = { race: race, run: { reaction: null, jump: false, choices: [], stops: [] }, idx: 0, redoIdx: -1, redoUsed: false };
    pos = race.grid; posDelta = 0; posAt = -10;
    steps = [1, 0, 0, 0];
    hud = { watch: '0.000' };
    look = 'night';
    beginPlay();
    beginLights();
  }

  function startCareer(n) { startRace({ kind: 'career', n: n }, 'career'); }

  function startDaily(again) {
    today = dailyM.dayNumber(new Date());
    prog.startDaily(save, today, again);
    persist();
    startRace({ kind: 'daily', day: today }, 'daily');
  }

  /** The hints teach each part the first time: in the lesson, and anywhere until a first stop is done
   * (a player who lands on a shared daily never saw race 1). They never block input. */
  function teaching() {
    return !!(game && game.race.lesson) || !save.seen.basics;
  }

  function beginLights() {
    phase = 'lights';
    game.stage = 'start';
    lastLit = 0;
    newSegment();
    hint = teaching() ? { text: T.hintLights, y: 0 } : null;
    audio.idle();
  }

  function setPos(next) {
    if (next !== pos) {
      posDelta = pos - next;
      posAt = realT;
      pos = next;
    }
  }

  function runningPos() {
    return raceM.score(game.race, game.run).finish;
  }

  function onStart(res) {
    if (res.what === 'jump') {
      if (game.race.lesson) {
        // The lesson never punishes a jump: the lights start again with the hint.
        R.popup(T.jumpStart, R.layout().bx, R.layout().pitTop + 60, R.COL.red, 20);
        haptic('error');
        audio.buzz();
        beginLights();
        hint = { text: T.hintJump, y: 0 };
        return;
      }
      game.run.jump = true;
      game.run.reaction = null;
      hud.watch = '+5.000';
      hud.watchCol = R.COL.red;
      R.popup(T.jumpStart + '  ' + T.plus5, R.size().w / 2, R.layout().pitTop + 140, R.COL.red, 22);
      haptic('error');
      audio.buzz();
      R.shake(5);
    } else {
      game.run.reaction = res.reaction;
      hud.watch = f3(res.reaction);
      hud.watchCol = reactionCol(res.reaction);
      haptic('tap');
      audio.engine();
      if (res.reaction < 0.2) audio.perfect();
    }
    steps[0] = 2;
    setPos(runningPos());
    hint = null;
    phase = 'between';
    later(1.0, function () { beginCall(0); });
  }

  // ---- the pit wall call ----
  function beginCall(i) {
    var r = game.race;
    var call = r.calls[i];
    game.idx = i;
    game.stage = 'call';
    phase = 'call';
    callChosen = false;
    newSegment();
    look = i > 0 && r.stops[i - 1].wet ? 'wet' : 'night';
    steps[i + 1] = 1;
    hint = null;
    if (i === 0 && teaching()) hint = { text: T.hintCall, y: 0 };
    if (call.type === 'sc' && !call.ending && !save.seen.sc) { hint = { text: T.hintSc, y: 0 }; save.seen.sc = true; }
    if (call.type === 'sc' && call.ending && !save.seen.scIn) { hint = { text: T.hintScIn, y: 0 }; save.seen.scIn = true; }
    // Buttons.
    ui.callOptions.textContent = '';
    var opts = call.type === 'sc' ? [['box', T.boxNow], ['stay', T.stayOut]] : [[0, T.dry], [1, T.inter], [2, T.wet]];
    opts.forEach(function (o) {
      var b = el('button', 'call-opt' + (call.type === 'sc' ? ' sc' : ''));
      b.type = 'button';
      if (call.type !== 'sc') {
        b.appendChild(R.tyreGlyph(o[0], 46));
        b.appendChild(R.skyGlyph([[0, 1], [2], [3]][o[0]], 24));
        if (o[0] === call.fitted) b.classList.add('fitted');
      }
      b.appendChild(el('span', null, o[1]));
      b.dataset.choice = String(o[0]);
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); choose(o[0], b); });
      b.addEventListener('click', function () { choose(o[0], b); });
      ui.callOptions.appendChild(b);
    });
    ui.callBar.parentNode.hidden = !call.clock;
    ui.callBar.style.transform = 'scaleX(1)';
    ui.call.hidden = false;
  }

  function choose(choice, b) {
    if (phase !== 'call' || callChosen || state !== 'play') return;
    callChosen = true;
    audio.unlock();
    var r = game.race, i = game.idx, call = r.calls[i];
    game.run.choices[i] = choice;
    var right = raceM.callRight(call, choice);
    var buttons = ui.callOptions.children;
    for (var k = 0; k < buttons.length; k++) {
      var bc = buttons[k].dataset.choice;
      if (String(call.answer) === bc) buttons[k].classList.add('right');
      else if (buttons[k] === b) buttons[k].classList.add('wrong');
    }
    haptic(right ? 'success' : 'error');
    if (right) audio.click(); else audio.buzz();
    setPos(runningPos());
    hint = null;
    phase = 'between';
    later(0.6, function () { ui.call.hidden = true; beginStop(i); });
  }

  function callTimeout() {
    var call = game.race.calls[game.idx];
    var def = call.type === 'sc' ? 'stay' : call.fitted;
    var b = null;
    var buttons = ui.callOptions.children;
    for (var k = 0; k < buttons.length; k++) if (buttons[k].dataset.choice === String(def)) b = buttons[k];
    choose(def, b);
  }

  // ---- the stop ----
  function beginStop(i, cfgOverride) {
    var cfg = cfgOverride || game.race.stops[i];
    st = stopM.create(cfg);
    phase = 'stop';
    newSegment();
    look = cfg.wet ? 'wet' : 'night';
    steps[i + 1] = 1;
    hud = { watch: '0.00', marker: null, best: save.best.stop || null };
    hint = null;
    lampPointer = null;
    keyHeld = false;
    audio.idle();
  }

  function beginRushStop() {
    var g = rushM.rung(rushRun.seed, rushRun.k);
    rushRun.rung = g;
    st = stopM.create(g.stop);
    phase = 'stop';
    newSegment();
    look = g.stop.wet ? 'wet' : 'night';
    hud = { watch: '0.00', marker: null, target: g.target, rung: rushRun.k };
    hint = null;
    lampPointer = null;
    keyHeld = false;
    audio.idle();
  }

  function lessonHints() {
    if (!teaching() || !st) { if (hint && hint.auto) hint = null; return; }
    var L = R.layout();
    var a = stopM.active(st);
    var h = null;
    var idx = game ? game.idx : rushRun ? rushRun.k - 1 : 0;
    if (a === 'catch' && idx === 0) h = { text: T.hintCatch, y: L.pitTop + 30, thumb: { x: L.bx + 1.6 * L.s, y: L.markerY } };
    else if (a === 'ring' && idx === 0 && st.wheel < 2) {
      var rp = R.ringPos(st.rings[st.wheel].corner);
      h = { text: T.hintRing, y: L.pitTop + 30, thumb: { x: rp.x, y: rp.y } };
    } else if (a === 'lamp' && st.phase === 'armed' && idx <= 1) h = { text: T.hintLamp, y: L.pitTop + 30, thumb: { x: L.lampX, y: L.lampY } };
    else if (a === 'lamp' && st.red) h = { text: T.hintRival, y: L.pitTop + 30, thumb: { x: L.lampX, y: L.lampY } };
    if (h) h.auto = true;
    if (h || (hint && hint.auto)) hint = h;
  }

  function stopEvents() {
    var L = R.layout();
    var evs = st.events.splice(0, st.events.length);
    var finished = false;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      switch (e.type) {
        case 'catch':
          haptic('medium');
          audio.lamp();
          var gc = { perfect: R.COL.purple, good: R.COL.green, off: R.COL.amber, wide: R.COL.amber, long: R.COL.red }[e.grade];
          if (e.grade === 'perfect') R.popup(T.perfect, L.bx, L.markerY - 30, gc, 18);
          else R.popup((e.err > 0 ? '+' : '') + f2(e.err), L.bx, L.markerY - 30, gc, 16);
          break;
        case 'jackup':
          audio.hiss();
          R.shake(2);
          break;
        case 'gun':
          var gp = R.ringPos(e.corner);
          audio.gun(1 + e.i * 0.04);
          haptic('light');
          R.burst(gp.x, gp.y, 'spark');
          break;
        case 'wheel':
          if (e.grade === 'perfect') { var wp = R.ringPos(e.corner); R.burst(wp.x, wp.y, 'big'); }
          break;
        case 'cross':
        case 'stuck':
          var cp = R.ringPos(e.corner);
          audio.buzz();
          haptic('error');
          R.burst(cp.x, cp.y, 'red');
          if (e.type === 'stuck' && !save.seen.cross) { save.seen.cross = true; hint = { text: T.hintStuck, y: L.pitTop + 30, until: seg.t + 2.2 }; }
          break;
        case 'reseat':
          audio.gun(0.9);
          haptic('light');
          break;
        case 'redOn':
          if (!game || !game.race.lesson) {
            if (!save.seen.rival) { save.seen.rival = true; hint = { text: T.hintRival, y: L.pitTop + 30, until: seg.t + 2.0 }; }
          }
          break;
        case 'drop':
          audio.hiss();
          R.shake(3);
          haptic('medium');
          break;
        case 'go':
          audio.engine();
          R.smoke(L.bx, L.by + 2.6 * L.s);
          var res = { time: e.time, unsafe: e.unsafe };
          hud.watch = f2(e.time);
          hud.watchCol = timeCol(res);
          hud.marker = e.time;
          if (e.unsafe) {
            audio.screech();
            R.shake(6);
            haptic('heavy');
            R.popup(T.unsafe + '  ' + T.plus5, R.size().w / 2, L.pitTop + 40, R.COL.red, 20);
          } else if (e.time <= 1.80) {
            audio.perfect();
            haptic('success');
            R.popup(f2(e.time), L.bx, L.pitTop + 40, R.COL.purple, 22);
          } else if (e.time < 2.0) {
            haptic('success');
          }
          break;
        case 'done':
          finished = true;
          break;
      }
    }
    if (finished) onStopDone();
  }

  function onStopDone() {
    var res = stopM.result(st);
    if (!save.seen.basics && !(game && game.race.lesson && game.idx < 2)) save.seen.basics = true;
    if (mode === 'rush') return onRushStop(res);
    if (game.redoIdx >= 0) return onRedoDone(res);
    var i = game.idx;
    game.run.stops[i] = res;
    steps[i + 1] = 2;
    setPos(runningPos());
    st = null;
    phase = 'between';
    if (i < 2) later(0.15, function () { beginCall(i + 1); });
    else later(0.3, finishRace);
  }

  // ---- the frame loop ----
  function applyInput(inp) {
    if (phase === 'lights' && inp.kind === 'press') {
      var r = raceM.startTap(game.race, inp.t);
      if (r.what !== 'ignored') onStart(r);
      return;
    }
    if (phase !== 'stop' || !st) return;
    if (inp.kind === 'press') {
      stopM.press(st, inp.t, inp.target, inp.corner);
    } else if (inp.kind === 'lift') {
      stopM.lift(st, inp.t);
    }
  }

  function stepPhase() {
    seg.t += DT;
    if (phase === 'lights') {
      var lit = raceM.litAt(game.race, seg.t);
      if (lit > lastLit) { audio.lamp(); haptic('tap'); }
      lastLit = lit;
      if (seg.t >= raceM.outTime(game.race) + raceM.NO_TAP) onStart({ what: 'start', reaction: raceM.NO_TAP });
    } else if (phase === 'call') {
      var call = game.race.calls[game.idx];
      if (call.clock && seg.t >= call.clock && !callChosen) callTimeout();
    } else if (phase === 'stop' && st) {
      stopM.step(st, DT);
      seg.t = st.t;
      if (st.events.length) stopEvents();
      if (mode === 'rush' && st && rushRun && rushRun.rung && st.tCatch >= 0 && st.tGo < 0 &&
          rushM.lost(stopM.watch(st, st.t), rushRun.rung.target)) {
        onRushStop({ time: Math.round(stopM.watch(st, st.t) * 1000) / 1000, unsafe: false });
      }
    }
    if (pendingFn && seg.t >= pendingAt) {
      var fn = pendingFn;
      pendingFn = null;
      fn();
    }
  }

  function advancePlay(nowMs, rdt) {
    var n = clockM.advance(clk, rdt);
    for (var i = 0; i < n; i++) {
      var end = seg.t + DT;
      while (inputs.length && inputs[0].t < end) {
        var inp = inputs.shift();
        inp.t = Math.max(inp.t, seg.t);
        applyInput(inp);
        if (state !== 'play') return;
      }
      var before = phase;
      stepPhase();
      if (state !== 'play') return;
      if (phase !== before && (before === 'between' || phase === 'lights')) {
        // A new segment began inside this frame: drop the rest of this frame's steps.
        break;
      }
    }
    // Keep event timestamps mapped onto the segment clock (it skips time after a long stall).
    seg.base = nowMs - (seg.t + clockM.alpha(clk) * DT) * 1000;
  }

  // Slow frames: drop to device pixel ratio 1 (dynamic resolution) once.
  var slowSum = 0, slowN = 0, lowRes = false;
  function watchSpeed(ms) {
    if (lowRes || state !== 'play' || ms > 250) return;
    slowSum += ms; slowN++;
    if (slowN < 120) return;
    if (slowSum / slowN > 21 && (window.devicePixelRatio || 1) > 1) { lowRes = true; resize(); }
    slowSum = 0; slowN = 0;
  }

  var drawCount = 0;
  var costs = [];
  function draw(dt) {
    var L = R.layout();
    if (!L) return;
    drawCount++;
    var v = { look: look, dt: dt, now: realT, t: seg.t + clockM.alpha(clk) * DT };
    if (state === 'menu') {
      v.scene = 'menu';
      v.parked = true;
      v.look = 'night';
    } else if (state === 'result' || (state === 'sheet' && !game)) {
      v.scene = 'idle';
      v.parked = true;
    } else if (phase === 'lights' || (phase === 'between' && game && game.stage === 'start')) {
      v.scene = 'lights';
      v.lit = phase === 'lights' ? raceM.litAt(game.race, v.t) : 0;
    } else if (phase === 'call' || (phase === 'between' && !st && game && game.idx >= 0 && !ui.call.hidden)) {
      v.scene = 'call';
      v.call = game.race.calls[game.idx];
    } else {
      v.scene = 'stop';
    }
    if (st && (state === 'play' || state === 'paused')) {
      v.stop = st;
      if (state === 'paused') v.t = st.t;
      var a = stopM.active(st);
      v.lamp = a === 'lamp' ? (st.phase === 'drop' ? (stopM.dangerAt(st, v.t) ? 'red' : 'green') : stopM.dangerAt(st, v.t) ? 'red' : 'armed') : 'idle';
      if (st.phase === 'gone' || st.phase === 'done') v.lamp = 'green';
      if (st.tCatch >= 0 && st.tGo < 0) {
        var w = stopM.watch(st, v.t);
        hud.watch = f2(w);
        hud.watchCol = R.COL.ink;
        hud.marker = w;
      }
    } else if (state === 'play' || state === 'paused') {
      v.lamp = 'idle';
    }
    if (state === 'play' || state === 'paused') {
      hud.pos = mode === 'rush' ? null : pos;
      hud.posDelta = posDelta;
      hud.posAge = realT - posAt;
      hud.steps = mode === 'rush' ? null : steps;
      v.hud = hud;
      if (mode === 'rush' && rushRun) hud.rung = rushRun.k;
      if (phase === 'lights' && game && game.run.reaction == null && !game.run.jump) {
        hud.watch = '0.000';
        hud.watchCol = R.COL.ink;
      }
      if (hint) {
        if (hint.until && seg.t > hint.until) hint = null;
      }
      if (hint) {
        var hy = hint.y || (phase === 'lights' ? L.pitTop + Math.min(120, L.pitH * 0.24) + 90 : phase === 'call' || phase === 'between' ? L.pitTop + Math.min(110, L.pitH * 0.22) + 96 : L.pitTop + 30);
        v.hint = { text: hint.text, y: hy, thumb: hint.thumb };
      }
    }
    if (state === 'menu' || state === 'result') {
      var so = sceneOffset();
      if (so.hide) { v.parked = false; v.plain = true; }
      else { v.offsetY = so.oy; v.zoom = so.zoom; }
    }
    R.frame(v);
  }

  /** Moves the parked car into the space left by the menu or the result sheet. */
  function sceneOffset() {
    var L = R.layout();
    var top, bottom;
    if (state === 'menu') {
      var stack = ui.menu.querySelector('.menu-stack');
      var brand = ui.menu.querySelector('.brand');
      if (!stack || !brand) return { oy: 0, zoom: 1 };
      top = brand.getBoundingClientRect().bottom;
      bottom = stack.getBoundingClientRect().top;
    } else {
      top = L.top;
      bottom = ui.resultPanel.getBoundingClientRect().top;
    }
    var want = (top + bottom) / 2;
    var zoom = Math.min(1, (bottom - top - 12) / (7.6 * L.s));
    // No room for the car (a short screen, a long menu): show the empty lane rather than half a car.
    return { oy: want - L.by, zoom: Math.max(0.3, zoom), hide: zoom < 0.42 };
  }

  function frame(rafTs) {
    requestAnimationFrame(frame);
    if (!paceM.due(pacer, rafTs)) return;
    var nowMs = performance.now();
    var rdt = lastMs ? Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000)) : 1 / 60;
    watchSpeed(nowMs - lastMs);
    lastMs = nowMs;
    realT += rdt;
    if (state === 'play') {
      advancePlay(nowMs, rdt);
      if (phase === 'stop' && (teaching() || (hint && hint.auto))) lessonHints();
      if (phase === 'call' && game) {
        var call = game.race.calls[game.idx];
        if (call.clock) ui.callBar.style.transform = 'scaleX(' + Math.max(0, 1 - seg.t / call.clock).toFixed(4) + ')';
      }
      var c0 = performance.now();
      draw(rdt);
      costs.push(performance.now() - c0);
      if (costs.length > 600) costs.shift();
      return;
    }
    if (dirty || R.busy()) {
      dirty = false;
      draw(state === 'paused' ? 0 : rdt);
    }
  }

  // ---- input ----
  function onPointerDown(e) {
    audio.unlock();
    if (state !== 'play') return;
    if (phase !== 'lights' && phase !== 'stop') return;
    var t = R.hit(e.clientX, e.clientY);
    if (!t) return;
    e.preventDefault();
    try { ui.canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    if (t.kind === 'lamp' && phase === 'stop') lampPointer = e.pointerId;
    inputs.push({ kind: 'press', t: eventTime(e), target: t.kind, corner: t.corner, pointer: e.pointerId });
  }
  function onPointerUp(e) {
    if (lampPointer !== e.pointerId) return;
    lampPointer = null;
    // A finger lifted while paused does not release the car: it stays on the jacks until the lamp is
    // tapped again (press, then lift to go), so resuming can never cause an unsafe release by itself.
    if (state !== 'play') return;
    inputs.push({ kind: 'lift', t: eventTime(e), pointer: e.pointerId });
  }
  ui.canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    audio.unlock();
    if (state !== 'play' || e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (phase === 'lights') inputs.push({ kind: 'press', t: eventTime(e), target: 'any' });
      else if (phase === 'stop') { keyHeld = true; inputs.push({ kind: 'press', t: eventTime(e), target: 'active' }); }
    } else if (phase === 'call' && /^Digit[1-3]$/.test(e.code)) {
      var b = ui.callOptions.children[parseInt(e.code.slice(5), 10) - 1];
      if (b) b.click();
    }
  });
  window.addEventListener('keyup', function (e) {
    if ((e.code === 'Space' || e.code === 'Enter') && keyHeld) {
      keyHeld = false;
      if (state !== 'play') return;
      inputs.push({ kind: 'lift', t: eventTime(e) });
    }
  });
  document.addEventListener('pointerdown', function () { audio.unlock(); }, { passive: true });

  // ---- pause ----
  function pauseGame() {
    if (state !== 'play') return;
    pausedAt = performance.now();
    setState('paused');
    ui.leaveNote.hidden = mode !== 'daily';
    applySettings();
    persist();
  }

  function resumeGame() {
    if (state !== 'paused') return;
    var gap = performance.now() - pausedAt;
    seg.base += gap;
    lastMs = performance.now();
    setState('play');
    banner(false);
    if (phase === 'call') ui.call.hidden = false;
    if (phase === 'lights' && game) beginLights();
    audio.resume();
  }

  function leaveGame() {
    if (mode === 'daily') { prog.retireDaily(save, today); }
    if (mode === 'rush' && rushRun) { prog.finishRun(save, rushRun.cleared); }
    persist();
    showMenu();
  }

  ui.pause.addEventListener('click', function () { audio.click(); pauseGame(); });
  ui.resume.addEventListener('click', function () { audio.click(); resumeGame(); });
  ui.leave.addEventListener('click', function () { audio.click(); leaveGame(); });
  function toggleSound() {
    save.settings.sound = !save.settings.sound;
    persist();
    applySettings();
    audio.unlock();
    audio.click();
  }
  ui.pauseSound.addEventListener('click', toggleSound);
  ui.sound.addEventListener('click', toggleSound);

  // ---- finishing a race ----
  function finishRace() {
    var r = game.race;
    var sum = raceM.score(r, game.run);
    game.summary = sum;
    var flags = null;
    if (mode === 'career') flags = prog.finishCareer(save, sum);
    else if (mode === 'daily') flags = prog.finishDaily(save, today, sum);
    else { prog.finishArchive(save, r.day, sum); flags = { stops: prog.recordStops(save, sum.stops) }; }
    persist();
    resultCtx = { rewarded: false, flags: flags };
    showResult();
    haptic(sum.gained > 0 ? 'success' : 'tap');
  }

  function showResult() {
    var sum = game.summary;
    var r = game.race;
    st = null;
    phase = null;
    ui.call.hidden = true;
    var p = ui.resultPanel;
    p.textContent = '';
    var title = mode === 'career' ? F(T.raceN, { n: r.n }) : T.dailyGp + '  ' + F(T.dayN, { n: r.day });
    p.appendChild(el('h2', null, title));
    // P9 to P3.
    var fin = el('div', 'finish');
    fin.appendChild(el('span', 'grid', 'P' + sum.grid));
    fin.appendChild(el('span', 'arrow', '→'));
    fin.appendChild(el('span', 'pos', 'P' + sum.finish));
    var gain = el('span', 'gain' + (sum.gained < 0 ? ' lost' : sum.gained === 0 ? ' same' : ''), (sum.gained > 0 ? '+' : '') + sum.gained);
    fin.appendChild(gain);
    fin.setAttribute('aria-label', F(T.gridTo, { a: sum.grid, b: sum.finish }));
    p.appendChild(fin);
    // Rows: start, calls, stops.
    var rows = el('div', 'rows');
    function row(k, vNode, places) {
      var rw = el('div', 'row');
      rw.appendChild(el('span', 'k', k));
      rw.appendChild(vNode);
      rw.appendChild(el('span', 'p ' + (places > 0 ? 'up' : places < 0 ? 'down' : ''), (places > 0 ? '+' : '') + places));
      rows.appendChild(rw);
    }
    var sv = el('span', 'v');
    var sr = el('span', sum.jump ? 't-red' : '', sum.jump ? T.jumpStart : f3(sum.reaction));
    if (!sum.jump) sr.style.color = reactionCol(sum.reaction);
    sv.appendChild(sr);
    row(T.start, sv, sum.start);
    var cv = el('span', 'v');
    sum.calls.forEach(function (c) {
      var m = el('span', c.right ? 't-green' : 't-red');
      m.appendChild(icons.icon(c.right ? 'check' : 'x', 'inline'));
      m.style.display = 'inline-grid';
      m.style.width = '22px';
      cv.appendChild(m);
    });
    row(T.calls, cv, sum.callPlaces);
    var tv = el('span', 'v');
    sum.stops.forEach(function (s) {
      var x = el('span', timeClass(s), f2(s.time));
      if (s.redo) x.appendChild(el('span', 'redo-mark', T.redone));
      tv.appendChild(x);
    });
    row(T.stops, tv, sum.stopPlaces);
    p.appendChild(rows);
    // Badges for what changed.
    var flags = resultCtx && resultCtx.flags;
    if (flags && flags.stops) {
      var badges = el('div', 'badges');
      if (flags.stops.best) badges.appendChild(el('span', 'badge green', T.newBest));
      flags.stops.clubs.forEach(function (c) {
        badges.appendChild(el('span', 'badge ' + (c === 'record' ? 'purple' : 'green'), c === 'sub200' ? T.clubSub200 : c === 'sub190' ? T.clubSub190 : T.clubRecord));
      });
      if (badges.children.length) p.appendChild(badges);
    }
    var acts = el('div', 'actions');
    if (mode === 'career') {
      // Redo the slowest stop: rewarded, once per race, never in a daily.
      var redoState = { kind: 'career', redoUsed: game.redoUsed };
      if (breaks.redoOffer(redoState, caps)) {
        var rb = btn(caps.adFree ? T.redoFree : T.redoAd, 'reward', caps.adFree ? 'arrow-counter-clockwise' : 'play');
        rb.addEventListener('click', function () { doRedo(rb); });
        acts.appendChild(rb);
      }
      var next = btn(F(T.nextRace, {}), 'primary big', 'flag-checkered');
      next.addEventListener('click', function () { audio.click(); nextRace(next); });
      acts.appendChild(next);
      var pair = el('div', 'pair');
      var retry = btn(T.retry, '', 'arrow-counter-clockwise');
      retry.addEventListener('click', function () { audio.click(); startCareer(r.n); });
      var menu = btn(T.menu, '', 'house');
      menu.addEventListener('click', function () { audio.click(); showMenu(); });
      pair.appendChild(retry);
      pair.appendChild(menu);
      acts.appendChild(pair);
    } else {
      if (mode === 'daily' && caps.share && typeof Shell.share === 'function') {
        var sb = btn(T.share, '', 'share-network');
        sb.addEventListener('click', function () { shareDaily(save.daily.result || sum, r.day); });
        acts.appendChild(sb);
      }
      var rushB = btn(T.rush, 'primary big', 'lightning');
      rushB.addEventListener('click', function () { audio.click(); startRush(); });
      acts.appendChild(rushB);
      var pair2 = el('div', 'pair');
      if (mode === 'archive') {
        var arc = btn(T.archive, '', 'archive');
        arc.addEventListener('click', function () { audio.click(); showMenu(); openArchive(r.day); });
        pair2.appendChild(arc);
      } else if (mode === 'friend' && !(save.daily.day === today && (save.daily.state === 'done' || save.daily.state === 'retired'))) {
        var td = btn(T.dailyGp, '', 'calendar-blank');
        td.addEventListener('click', function () { audio.click(); friendDay = 0; startDaily(false); });
        pair2.appendChild(td);
      }
      var m2 = btn(T.menu, '', 'house');
      m2.addEventListener('click', function () { audio.click(); showMenu(); });
      pair2.appendChild(m2);
      if (pair2.children.length === 1) acts.appendChild(m2); else acts.appendChild(pair2);
    }
    p.appendChild(acts);
    setState('result');
    p.scrollTop = 0;
    maybeOfferRemoveAds();
  }

  /** The one Remove ads offer on its own, after the first sub-2.00 stop (never after a daily). */
  function maybeOfferRemoveAds() {
    if (!breaks.removeAdsOffer(save, caps, mode)) return;
    setTimeout(function () {
      // Only on a result card nobody has left: not while an ad is opening, never once play has begun.
      // Counted as offered only when it really shows, so a quick Next race keeps it for a later card.
      if (state !== 'result' || busyAd || !ui.offer.hidden || !breaks.removeAdsOffer(save, caps, mode)) return;
      breaks.noteRemoveAdsOffered(save);
      persist();
      var p = ui.offerPanel;
      p.textContent = '';
      p.appendChild(el('h2', 'panel-title', T.offerTitle));
      p.appendChild(el('p', 'note', T.offerBody));
      var buy = btn(caps.removeAdsPrice ? F(T.buy, { price: caps.removeAdsPrice }) : T.buyPlain, 'primary wide', 'shopping-bag');
      buy.addEventListener('click', function () { ui.offer.hidden = true; buyRemoveAds(); });
      var no = btn(T.notNow, 'wide');
      no.addEventListener('click', function () { ui.offer.hidden = true; });
      p.appendChild(buy);
      p.appendChild(no);
      ui.offer.hidden = false;
    }, 700);
  }

  function nextRace(b) {
    if (busyAd) return;
    var ask = breaks.nextRace(save, { kind: mode, adFree: caps.adFree, rewardedThisBreak: resultCtx && resultCtx.rewarded });
    if (!ask) { startCareer(save.race); return; }
    busyAd = true;
    lock(ui.resultPanel, true);
    Shell.interstitial('next_race').then(function (r) {
      busyAd = false;
      breaks.noteInterstitial(save, r);
      persist();
      if (state !== 'result') return;
      startCareer(save.race);
    });
  }

  // ---- rewarded: redo the slowest stop ----
  function rewardMessage(r) {
    if (r.reason === 'skipped') toast(T.msgSkipped);
    else toast(T.msgNotReady);
  }

  function doRedo(b) {
    if (busyAd) return;
    busyAd = true;
    lock(ui.resultPanel, true);
    Shell.rewarded('redo_stop').then(function (r) {
      busyAd = false;
      if (state !== 'result' || !game || !resultCtx) return;
      if (r.reason === 'watched' || r.reason === 'skipped' || r.granted) resultCtx.rewarded = true;
      if (!r.granted) { lock(ui.resultPanel, false); rewardMessage(r); if (r.reason === 'skipped') { game.redoUsed = true; showResult(); } return; }
      game.redoUsed = true;
      var idx = raceM.slowest(game.run.stops);
      game.redoIdx = idx;
      game.idx = idx;
      pos = game.summary.finish;
      beginPlay();
      beginStop(idx);
    });
  }

  function onRedoDone(res) {
    var idx = game.redoIdx;
    game.redoIdx = -1;
    var old = game.run.stops[idx];
    var keep = res.time < old.time ? res : old;
    keep = Object.assign({}, keep, { redo: true });
    game.run.stops[idx] = keep;
    var sum = raceM.score(game.race, game.run);
    game.summary = sum;
    var flags = { stops: prog.recordStops(save, [keep]) };
    prog.recordFinish(save, sum.finish);
    persist();
    var keepCtx = resultCtx;
    resultCtx = { rewarded: true, flags: flags };
    if (keepCtx) resultCtx.rewarded = true;
    st = null;
    showResult();
  }

  // ---- Stop Rush ----
  function startRush() {
    mode = 'rush';
    game = null;
    rushRun = { seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0, k: 1, cleared: 0, windUsed: false, rewarded: false, last: null };
    look = 'night';
    beginPlay();
    if (!save.seen.rush) { save.seen.rush = true; }
    beginRushStop();
  }

  function onRushStop(res) {
    var g = rushRun.rung;
    rushRun.last = { time: res.time, unsafe: res.unsafe, target: g.target };
    st = null;
    var L = R.layout();
    if (rushM.cleared(res, g.target)) {
      rushRun.cleared++;
      rushRun.k++;
      R.popup(f2(res.time) + ' / ' + f2(g.target), R.size().w / 2, L.pitTop + 40, R.COL.green, 18);
      phase = 'between';
      later(0.25, beginRushStop);
      return;
    }
    phase = 'over';
    R.popup(res.unsafe ? T.unsafe : F(T.tooSlow, { t: f2(res.time - g.target) }), R.size().w / 2, L.pitTop + 40, R.COL.red, 20);
    haptic('error');
    later(0.9, rushOver);
  }

  function rushOver() {
    phase = 'over';
    if (breaks.secondWindOffer(rushRun, caps)) {
      var last = rushRun.last;
      var p = ui.offerPanel;
      p.textContent = '';
      p.appendChild(el('h2', 'panel-title', T.runOver));
      p.appendChild(el('p', 'note', last.unsafe ? T.unsafe : F(T.tooSlow, { t: f2(last.time - last.target) })));
      p.appendChild(el('p', 'big-number', F(T.rushStops, { n: rushRun.cleared })));
      var w = btn(caps.adFree ? T.windFree : T.windAd, 'reward wide', caps.adFree ? 'lightning' : 'play');
      w.addEventListener('click', function () { takeSecondWind(w); });
      var no = btn(T.noThanks, 'wide');
      no.addEventListener('click', function () { if (busyAd) return; ui.offer.hidden = true; endRun(); });
      p.appendChild(el('p', 'note', T.windNote));
      p.appendChild(w);
      p.appendChild(no);
      setState('paused');
      ui.pausePanel.hidden = true;
      ui.pause.hidden = true;
      ui.offer.hidden = false;
      return;
    }
    endRun();
  }

  function takeSecondWind(b) {
    if (busyAd) return;
    busyAd = true;
    lock(ui.offerPanel, true);
    Shell.rewarded('second_wind').then(function (r) {
      busyAd = false;
      ui.offer.hidden = true;
      if (mode !== 'rush' || !rushRun) return;
      if (r.reason === 'watched' || r.reason === 'skipped' || r.granted) rushRun.rewarded = true;
      rushRun.windUsed = true;
      if (!r.granted) { rewardMessage(r); endRun(); return; }
      // Another go at the rung that ended the run (the next rung up is faster still, so carrying on
      // from there would end most runs at once).
      lastMs = performance.now();
      setState('play');
      banner(false);
      beginRushStop();
    });
  }

  function endRun() {
    var best = prog.finishRun(save, rushRun.cleared);
    persist();
    var run = { cleared: rushRun.cleared, failed: true, rewarded: rushRun.rewarded };
    if (!breaks.rushEnd(save, run, { adFree: caps.adFree })) { showRushSummary(best); return; }
    busyAd = true;
    Shell.interstitial('rush_end').then(function (r) {
      busyAd = false;
      breaks.noteInterstitial(save, r);
      persist();
      showRushSummary(best);
    });
  }

  function showRushSummary(best) {
    st = null;
    phase = null;
    ui.offer.hidden = true;
    var p = ui.resultPanel;
    p.textContent = '';
    p.appendChild(el('h2', null, T.rush));
    var fin = el('div', 'finish');
    fin.appendChild(el('span', 'pos', String(rushRun.cleared)));
    fin.appendChild(el('span', 'arrow', F(T.rushStops, { n: '' }).trim()));
    fin.appendChild(el('span', 'gain' + (best ? '' : ' same'), best ? T.newRushBest : F(T.bestN, { n: save.best.rush })));
    p.appendChild(fin);
    var rows = el('div', 'rows');
    var last = rushRun.last;
    if (last) {
      var rw = el('div', 'row');
      rw.appendChild(el('span', 'k', T.stops));
      var v = el('span', 'v');
      v.appendChild(el('span', timeClass(last), f2(last.time)));
      v.appendChild(el('span', 't-amber', F(T.rushTarget, { t: f2(last.target) })));
      rw.appendChild(v);
      rw.appendChild(el('span', 'p', ''));
      rows.appendChild(rw);
    }
    p.appendChild(rows);
    var acts = el('div', 'actions');
    var again = btn(T.runAgain, 'primary big', 'lightning');
    again.addEventListener('click', function () { audio.click(); startRush(); });
    var menu = btn(T.menu, '', 'house');
    menu.addEventListener('click', function () { audio.click(); showMenu(); });
    acts.appendChild(again);
    acts.appendChild(menu);
    p.appendChild(acts);
    game = null;
    mode = 'rushResult';
    setState('result');
    p.scrollTop = 0;
    maybeOfferRemoveAds();
  }

  // ---- share ----
  function shareDaily(result, day) {
    var res = Object.assign({}, result, { tries: save.daily.day === day && save.daily.result ? save.daily.result.tries : result.tries || 1 });
    var payload = shareM.text(res, day, T, F, dailyM.link(day));
    var png = shareM.card(res, day, T, F, R.FONT);
    // Straight from the tap: no await before Shell.share (Web Share needs the tap's activation).
    Shell.share({ text: payload.text, url: payload.url, png: png }).then(function (r) {
      if (r.reason === 'copied') toast(T.msgCopied);
      else if (!r.ok && r.reason !== 'cancelled' && r.reason !== 'busy') toast(T.msgShareFailed);
    });
  }

  // ---- menu buttons ----
  ui.raceBtn.addEventListener('click', function () { if (busyAd) return; audio.unlock(); audio.click(); startCareer(save.race); });
  ui.rushBtn.addEventListener('click', function () { if (busyAd) return; audio.unlock(); audio.click(); startRush(); });
  ui.dailyBtn.addEventListener('click', function () {
    audio.unlock();
    audio.click();
    today = dailyM.dayNumber(new Date());
    var d = prog.dailyFor(save, today);
    if (d.state === 'done' || d.state === 'retired') { toast(T.dailyDone); return; }
    startDaily(false);
  });
  ui.dailyShare.addEventListener('click', function () {
    if (save.daily.result) shareDaily(save.daily.result, save.daily.day);
  });
  ui.dailyAgain.addEventListener('click', function () {
    if (busyAd || !breaks.dailyAgainOffer(save, today, caps)) return;
    busyAd = true;
    lock(ui.menu, true);
    Shell.rewarded('daily_again').then(function (r) {
      busyAd = false;
      lock(ui.menu, false);
      if (state !== 'menu') return;
      if (!r.granted) { rewardMessage(r); refreshMenu(); return; }
      startDaily(true);
    });
  });
  ui.friendCard.addEventListener('click', function () {
    if (!friendDay || busyAd) return;
    audio.unlock();
    audio.click();
    startRace({ kind: 'daily', day: friendDay }, 'friend');
  });

  function buyRemoveAds() {
    if (busyAd) return;
    busyAd = true;
    lock(ui.menu, true);
    Shell.buyRemoveAds().then(function (r) {
      busyAd = false;
      lock(ui.menu, false);
      var says = { purchased: T.msgPurchased, owned: T.msgOwned, pending: T.msgPending, cancelled: T.msgCancelled, unavailable: T.msgUnavailable, notOffered: T.msgNotOffered, offline: T.msgOffline }[r.reason] || T.msgFailed;
      toast(says);
      caps = Shell.caps;
      if (state === 'menu') refreshMenu();
    });
  }
  ui.removeAds.addEventListener('click', function () { audio.click(); buyRemoveAds(); });

  function restore() {
    Shell.restore().then(function (r) {
      caps = Shell.caps;
      if (r.adFree) toast(T.msgRestored);
      else if (r.ok) toast(T.msgNoPurchase);
      else toast({ unavailable: T.msgUnavailable, notOffered: T.msgNotOffered, offline: T.msgOffline }[r.reason] || T.msgNoPurchase);
      if (state === 'menu') refreshMenu();
    });
  }
  ui.restore.addEventListener('click', function () { audio.click(); restore(); });

  // ---- sheets: records, settings, how to play, archive ----
  function openSheet(build) {
    var p = ui.sheetPanel;
    p.textContent = '';
    build(p);
    ui.sheet.hidden = false;
    p.scrollTop = 0;
  }
  function closeSheet() { ui.sheet.hidden = true; }
  ui.sheet.addEventListener('click', function (e) { if (e.target === ui.sheet) closeSheet(); });

  function sheetHead(p, title) {
    var h = el('div', 'stepper');
    h.appendChild(el('h2', null, title));
    var x = el('button', 'icon-btn');
    x.type = 'button';
    iconBtn(x, 'x', T.close);
    x.addEventListener('click', closeSheet);
    h.appendChild(x);
    p.appendChild(h);
  }

  function item(list, label, value) {
    var it = el('div', 'item');
    it.appendChild(el('span', null, label));
    it.appendChild(el('span', 'val', value));
    list.appendChild(it);
    return it;
  }

  function openRecords() {
    openSheet(function (p) {
      sheetHead(p, T.records);
      var list = el('div', 'list');
      item(list, T.bestStop, save.best.stop ? f2(save.best.stop) + ' s' : T.none);
      item(list, T.bestReaction, save.best.reaction ? f3(save.best.reaction) + ' s' : T.none);
      item(list, T.bestFinish, save.best.finish ? 'P' + save.best.finish : T.none);
      item(list, T.bestRush, save.best.rush ? F(T.rushStops, { n: save.best.rush }) : T.none);
      item(list, T.racesRun, String(save.races + save.dailies));
      p.appendChild(list);
      p.appendChild(el('h3', null, T.clubs));
      var badges = el('div', 'badges');
      [[save.clubs.sub200, T.clubSub200, 'green'], [save.clubs.sub190, T.clubSub190, 'green'], [save.clubs.record, T.clubRecord, 'purple']].forEach(function (c) {
        var b = el('span', 'badge' + (c[0] ? ' ' + c[2] : ''), c[1]);
        if (!c[0]) b.style.opacity = '0.45';
        badges.appendChild(b);
      });
      p.appendChild(badges);
      p.appendChild(el('p', null, T.recordNote));
    });
  }

  function seg3(options, current, onPick) {
    var s = el('div', 'seg');
    options.forEach(function (o) {
      var b = el('button', null, o[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(o[0] === current));
      b.addEventListener('click', function () {
        onPick(o[0]);
        for (var i = 0; i < s.children.length; i++) s.children[i].setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-pressed', 'true');
      });
      s.appendChild(b);
    });
    return s;
  }

  function openSettings() {
    openSheet(function (p) {
      sheetHead(p, T.settings);
      var list = el('div', 'list');
      var it = item(list, T.sound, '');
      it.replaceChild(seg3([[true, T.on], [false, T.off]], save.settings.sound, function (v) { save.settings.sound = v; persist(); applySettings(); audio.unlock(); }), it.lastChild);
      it = item(list, T.vibration, '');
      it.replaceChild(seg3([[true, T.on], [false, T.off]], save.settings.haptics, function (v) { save.settings.haptics = v; persist(); if (v) Shell.haptic('tap'); }), it.lastChild);
      it = item(list, T.reduceMotion, '');
      it.replaceChild(seg3([['auto', T.auto], ['reduced', T.on], ['full', T.off]], save.settings.motion, function (v) { save.settings.motion = v; persist(); applySettings(); }), it.lastChild);
      var how = el('button', 'item');
      how.type = 'button';
      how.appendChild(el('span', null, T.howTo));
      how.appendChild(icons.icon('question'));
      how.addEventListener('click', openHowTo);
      list.appendChild(how);
      // Privacy options: only while the consent message requires it (caps.privacyOptions).
      if (caps.privacyOptions) {
        var po = el('button', 'item');
        po.type = 'button';
        po.appendChild(el('span', null, T.privacyOptions));
        po.appendChild(icons.icon('shield-check'));
        po.addEventListener('click', function () { Shell.privacyOptions().then(function () { caps = Shell.caps; }); });
        list.appendChild(po);
      }
      var pp = el('a', 'item');
      pp.href = POLICY_URL;
      pp.target = '_blank';
      pp.rel = 'noopener';
      pp.appendChild(el('span', null, T.privacyPolicy));
      pp.appendChild(icons.icon('arrow-square-out'));
      list.appendChild(pp);
      if (caps.removeAds) {
        var rs = el('button', 'item');
        rs.type = 'button';
        rs.appendChild(el('span', null, T.restore));
        rs.appendChild(icons.icon('arrow-counter-clockwise'));
        rs.addEventListener('click', restore);
        list.appendChild(rs);
      }
      p.appendChild(list);
      var lic = el('p', 'note', 'Twotenths. Archivo Narrow, SIL Open Font License 1.1. Phosphor Icons, MIT.');
      p.appendChild(lic);
    });
  }

  function openHowTo() {
    openSheet(function (p) {
      sheetHead(p, T.howTo);
      T.howToText.forEach(function (para) { p.appendChild(el('p', null, para)); });
    });
  }

  function openArchive(day) {
    if (!caps.adFree) return;
    var d = Math.max(1, Math.min(today - 1, day || today - 1));
    if (today <= 1) return;
    openSheet(function (p) {
      sheetHead(p, T.archive);
      var step = el('div', 'stepper');
      var prev = el('button', 'icon-btn'); prev.type = 'button'; iconBtn(prev, 'caret-left', T.prevDay);
      var next = el('button', 'icon-btn'); next.type = 'button'; iconBtn(next, 'caret-right', T.nextDay);
      var mid = el('div');
      var label = el('div', 'day');
      var played = el('div', 'note');
      mid.appendChild(label);
      mid.appendChild(played);
      step.appendChild(prev); step.appendChild(mid); step.appendChild(next);
      p.appendChild(step);
      var go = btn(T.raceDay, 'primary big', 'flag-checkered');
      p.appendChild(go);
      function show() {
        label.textContent = F(T.dayN, { n: d });
        played.textContent = save.archive[d] ? F(T.playedP, { p: save.archive[d] }) : '';
        prev.disabled = d <= 1;
        next.disabled = d >= today - 1;
      }
      prev.addEventListener('click', function () { if (d > 1) { d--; show(); } });
      next.addEventListener('click', function () { if (d < today - 1) { d++; show(); } });
      go.addEventListener('click', function () { closeSheet(); startRace({ kind: 'daily', day: d }, 'archive'); });
      show();
    });
  }

  ui.records.addEventListener('click', function () { audio.click(); openRecords(); });
  ui.settings.addEventListener('click', function () { audio.click(); openSettings(); });
  ui.archive.addEventListener('click', function () { audio.click(); openArchive(); });

  // ---- the shell ----
  Shell.onPause(function () {
    if (state === 'play') pauseGame();
    persist();
    audio.suspend();
  });
  Shell.onResume(function () {
    audio.resume();
    var d = dailyM.dayNumber(new Date());
    if (d !== today && state === 'menu') { today = d; refreshMenu(); }
  });
  var lastInsets = '';
  Shell.onChange(function () {
    caps = Shell.caps;
    if (state === 'menu') refreshMenu();
    else if (state === 'result' && mode === 'career' && game && game.summary && !busyAd) showResult();
    var key = JSON.stringify(caps.insets);
    if (key !== lastInsets) { lastInsets = key; resize(); }
  });
  Shell.onBack(function () {
    if (!ui.sheet.hidden) { closeSheet(); return true; }
    if (busyAd) return true;
    if (!ui.offer.hidden) {
      ui.offer.hidden = true;
      if (mode === 'rush' && phase === 'over') endRun();
      return true;
    }
    if (state === 'play') { pauseGame(); return true; }
    if (state === 'paused') { resumeGame(); return true; }
    if (state === 'result') { showMenu(); return true; }
    return false; // the menu: the app closes
  });

  // ---- size ----
  var warmTimer = 0;
  function resize(force) {
    var dpr = lowRes ? 1 : Math.min(2, window.devicePixelRatio || 1);
    R.resize(window.innerWidth, window.innerHeight, dpr, Shell.caps.insets, force === true);
    dirty = true;
    clearTimeout(warmTimer);
    warmTimer = setTimeout(function () { R.prewarm(); }, 60);
  }
  window.addEventListener('resize', resize);
  if (mql && mql.addEventListener) mql.addEventListener('change', applySettings);

  // ---- boot ----
  R.init(ui.canvas);
  resize();
  applySettings();
  showMenu();
  if (document.fonts && document.fonts.load) {
    document.fonts.load('600 20px "Archivo Narrow"').then(function () { resize(true); }, function () {});
  }
  R.prewarm(); // the static layers exist before the ads SDK can start (WEBGAME-RECIPE.md section 2b)
  Shell.ready().then(function (c) {
    caps = c;
    resize();
    if (state === 'menu') refreshMenu();
  });
  requestAnimationFrame(frame);

  // A test hook for the headless checks (read only).
  window.__tt = {
    state: function () { return { state: state, mode: mode, phase: phase, pos: pos, idx: game ? game.idx : -1, stop: st ? { phase: st.phase, wheel: st.wheel, active: stopM.active(st), red: st.red, t: st.t } : null, save: save, rush: rushRun, summary: game && game.summary }; },
    layout: function () { return R.layout(); },
    ring: function (corner) { return R.ringPos(corner); },
    race: function () { return game ? game.race : null; },
    stopState: function () { return st; },
    segT: function () { return seg.t; },
    segNow: function () { return (performance.now() - seg.base) / 1000; },
    draws: function () { return drawCount; },
    lowRes: function () { return lowRes; },
    costs: function () { var a = costs.slice().sort(function (x, y) { return x - y; }); return { n: a.length, p50: a[Math.floor(a.length / 2)], p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1] }; }
  };
})();
