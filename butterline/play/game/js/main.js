/*
 * Butterline: the game loop, the screens and every call to the shell. Pure rules live in the other
 * modules; this file wires them to input, the renderer, audio and game-sdk.js.
 *
 * Ad rules followed here (WEBGAME-RECIPE.md section 3, GAME-DESIGN.md section 8):
 *   no ad of any kind during an approach; no banner in the app; on the web the banner only on the menu
 *   and result screens, hidden the moment play starts;
 *   interstitials only at circuits_end (a run of 3 or more landings, before its result card) and
 *   daily_next (Next after the 3rd approach or later, once per daily), under rules.js counts;
 *   rewarded only from a button that states the reward, offered only while caps.rewardedReady (or ad
 *   free), always a bonus beside Fly again, Next or Menu.
 */
(function () {
  'use strict';
  var BL = window.BL;
  var S = BL.strings.t, fmt = BL.strings.format;
  var sim = BL.sim, pilot = BL.pilot, progress = BL.progress, rules = BL.rules, daily = BL.daily;
  var grade = BL.grade, share = BL.share, audio = BL.audio, art = BL.art, rng = BL.rng;
  var aircraftMod = BL.aircraft, airportsMod = BL.airports;
  var icon = BL.icons.icon;
  var DT = sim.DT;
  var PRIVACY_URL = 'https://apps.mohdshayan.com/privacy-policies/butterline-privacy-policy.html';

  // ---- save ----
  Shell.configureSave({ prefix: 'butterline', version: progress.VERSION, migrate: progress.migrate });
  var save = progress.sanitize(Shell.load('main', null));
  function persist() { Shell.save('main', save); }
  // A Daily approach the game was closed in counts as missed, as leaving it from the pause panel does.
  var leftDaily = progress.settleAbandoned(save);
  if (leftDaily) persist();

  var caps = Shell.caps;
  var reducedMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  // ---- DOM ----
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var canvas = $('view');
  var R = BL.render.create(canvas);
  var ui = {
    menu: $('menu'), pause: $('pause'), result: $('result'), resultPanel: $('resultPanel'),
    sheet: $('sheet'), sheetPanel: $('sheetPanel'), toast: $('toast'), pauseBtn: $('pauseBtn'),
    dailyCard: $('dailyCard'), dailyNum: $('dailyNum'), dailySlots: $('dailySlots'), dailyMeta: $('dailyMeta'),
    flyBtn: $('flyBtn'), logBtn: $('logBtn'), settingsBtn: $('settingsBtn'), soundBtn: $('soundBtn'),
    airportPicker: $('airportPicker'), aircraftPicker: $('aircraftPicker'),
    resumeBtn: $('resumeBtn'), leaveBtn: $('leaveBtn'), leaveNote: $('leaveNote')
  };

  function staticText() {
    canvas.setAttribute('aria-label', S.a11y.game);
    canvas.setAttribute('role', 'img');
    $('wordmark').textContent = S.title;
    $('dailyLabel').textContent = S.daily;
    $('dailyIcon').appendChild(icon('calendar-blank'));
    $('circuitsLabel').textContent = S.circuits;
    ui.flyBtn.textContent = S.fly;
    ui.pauseBtn.appendChild(icon('pause'));
    ui.pauseBtn.setAttribute('aria-label', S.a11y.pause);
    ui.logBtn.appendChild(icon('book-open'));
    ui.logBtn.setAttribute('aria-label', S.a11y.logbook);
    ui.settingsBtn.appendChild(icon('gear'));
    ui.settingsBtn.setAttribute('aria-label', S.a11y.settings);
    ui.soundBtn.setAttribute('aria-label', S.a11y.sound);
    [ui.airportPicker, ui.aircraftPicker].forEach(function (p) {
      var prev = p.querySelector('.prev'), next = p.querySelector('.next');
      prev.appendChild(icon('caret-left'));
      next.appendChild(icon('caret-right'));
      prev.setAttribute('aria-label', S.a11y.prev);
      next.setAttribute('aria-label', S.a11y.nextItem);
    });
    $('pauseTitle').textContent = S.paused;
    ui.resumeBtn.textContent = S.resume;
  }

  // ---- state ----
  var state = 'boot';      // boot, menu, play, beat, result, paused, break
  var flight = null;       // the player's flight
  var attract = null;      // {f, decide, until} the menu's background approach
  var session = null;      // circuits or daily
  var prev = { x: 0, h: 0, theta: 0 };
  var clock = BL.clock.create();
  var timeScale = 1, timeTarget = 1, slowUntil = 0;
  var realT = 0, lastFrame = 0;
  var pointers = {};
  var keyHold = false;
  var ghost = null;        // first-approach thumb guide
  var dim = 0, dimTarget = 0, flash = 0;
  var stampPop = null;
  var pendingAfter = null; // {at, fn}: a timed step in the beat after a landing
  var pauseNext = false;   // the app paused in the beat: the next approach starts paused
  var frameTimes = [];
  var holdLog = 0;
  var sceneOf = null;

  function held() {
    for (var k in pointers) if (pointers[k]) return true;
    return keyHold;
  }

  function today() { return daily.dayNumber(new Date()); }

  function setState(s) {
    state = s;
    document.body.setAttribute('data-state', s);
  }

  // ---- banner (web only, menus and results only) ----
  function bannerFor(showing) {
    if (caps.platform !== 'web') return;
    Shell.banner(!!showing).then(function () {
      caps = Shell.caps;
      layoutBanner();
    });
  }
  function layoutBanner() {
    document.body.classList.toggle('banner-on', !!(caps.bannerVisible && caps.bannerHeight > 0));
  }

  // ---- toast ----
  var toastTimer = 0;
  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.hidden = true; }, 3200);
  }

  function haptic(style) {
    if (save.settings.haptics) Shell.haptic(style);
  }

  function hideScreens() {
    ui.menu.hidden = true;
    ui.pause.hidden = true;
    ui.result.hidden = true;
    ui.sheet.hidden = true;
  }

  // ---- flights ----
  function snapshot(f) {
    prev.x = f.x; prev.h = f.h; prev.theta = f.theta;
  }

  function beginFlight(f) {
    flight = f;
    snapshot(f);
    BL.clock.reset(clock);
    timeScale = timeTarget = 1;
    slowUntil = 0;
    stampPop = null;
    sceneOf = f;
    R.setScene(f);
    audio.setAircraft(f.ac.id);
    hideScreens();
    ui.pauseBtn.hidden = false;
    pointers = {};
    keyHold = false;
    setState('play');
    Shell.banner(false).then(function () { caps = Shell.caps; layoutBanner(); });
    dimTarget = 0;
    if (pauseNext) {
      pauseNext = false;
      pauseGame();
    }
  }

  function flareCueHeight(f) {
    var sinkGlide = f.vx * Math.tan(f.ac.glide);
    return Math.max(1.6, sinkGlide * 1.45) + 0.8;
  }

  // ---- Circuits ----
  function startCircuits(opts) {
    opts = opts || {};
    var ap = opts.airport || save.sel.airport;
    var ac = opts.aircraft || save.sel.aircraft;
    session = {
      mode: 'circuits', airport: ap, aircraft: ac, step: 0, landings: 0, score: 0, kept: false,
      idx: 0, seedBase: (Date.now() ^ Math.floor(realT * 1000)) >>> 0, tutorial: !!opts.tutorial,
      best: null, last: null, stamps: []
    };
    startCircuitApproach();
  }

  function startCircuitApproach() {
    var seed = rng.hashString('circuits-' + session.seedBase + '-' + session.idx);
    var f = sim.createFlight({
      aircraft: session.aircraft, airport: session.airport, seed: seed, step: session.step,
      tutorial: session.tutorial && session.idx === 0,
      gentle: progress.gentle(save, 'circuits')
    });
    setGhost(f);
    beginFlight(f);
  }

  function setGhost(f) {
    var want = !save.tutorialDone || save.ghostThumb > 0;
    ghost = want ? { phase: 'wait', cue: flareCueHeight(f), shown: false } : null;
  }

  // ---- Daily ----
  function startDaily(round, aircraftId) {
    var n = today();
    var cfg = daily.config(n);
    progress.ensureDay(save, n);
    if (round === 2) {
      if (!save.daily.second) save.daily.second = { aircraft: aircraftId, results: [], done: false };
      persist();
    }
    session = {
      mode: 'daily', day: n, cfg: cfg, round: round || 1,
      aircraft: round === 2 ? save.daily.second.aircraft : cfg.aircraft, goAround: false, offeredGoAround: false
    };
    startDailyApproach();
  }

  function dailyResults() {
    if (!session || session.mode !== 'daily') return [];
    return session.round === 2 ? (save.daily.second ? save.daily.second.results : []) : save.daily.results;
  }

  function startDailyApproach() {
    var results = dailyResults();
    var k = session.goAround ? results.length - 1 : results.length;
    session.k = k;
    var ap = session.cfg.approaches[k];
    var f = sim.createFlight({ aircraft: session.aircraft, airport: session.cfg.airport, seed: ap.seed, step: ap.step });
    progress.startFlying(save, session.day, session.round, session.goAround);
    persist();
    setGhost(f);
    beginFlight(f);
  }

  // ---- the loop ----
  function frame(now) {
    var rdt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    realT += rdt;
    frameTimes.push(rdt);
    if (frameTimes.length > 240) frameTimes.shift();

    if (slowUntil && realT >= slowUntil) { slowUntil = 0; timeTarget = 1; }
    timeScale += (timeTarget - timeScale) * (1 - Math.exp(-rdt / 0.1));

    var f = null, decide = null, stepIt = true;
    if (flight && (state === 'play' || state === 'beat' || state === 'result' || state === 'break' || state === 'paused')) {
      f = flight;
      stepIt = state !== 'paused';
    } else if (attract) {
      f = attract.f;
      decide = attract.decide;
    }
    if (f && f !== sceneOf) {
      sceneOf = f;
      snapshot(f);
      R.setScene(f);
    }
    var simDt = 0;
    if (f && stepIt) {
      if (f === flight) updateGhost(f);
      var n = BL.clock.advance(clock, rdt, f === flight ? timeScale : 1);
      for (var i = 0; i < n; i++) {
        snapshot(f);
        var h = decide ? decide(f) : (state === 'play' || state === 'beat') && held();
        sim.step(f, h);
        if (h && !decide) holdLog++;
        simDt += DT;
        if (f === flight) handleEvents(f); else f.events.length = 0;
      }
    }
    if (attract && f === attract.f && attract.f.done) {
      if (!attract.until) attract.until = realT + 2.2;
      if (realT > attract.until) newAttract(attract.n + 1);
    }
    if (pendingAfter && realT >= pendingAfter.at) {
      var fn = pendingAfter.fn;
      pendingAfter = null;
      fn();
    }

    dim += (dimTarget - dim) * (1 - Math.exp(-rdt / 0.12));
    flash *= Math.exp(-rdt / 0.25);
    if (f) {
      var a = BL.clock.alpha(clock);
      R.draw({
        f: f,
        x: prev.x + (f.x - prev.x) * a,
        h: prev.h + (f.h - prev.h) * a,
        theta: prev.theta + (f.theta - prev.theta) * a,
        t: f.t, realT: realT, dt: simDt, rdt: rdt,
        hud: f === flight && state !== 'result' ? hudInfo() : null,
        ghost: f === flight ? ghostView() : null,
        flash: flash, dim: dim
      });
    }
    var active = f === flight && (state === 'play' || state === 'beat');
    audio.update({
      active: active,
      thrust: active ? Math.min(1, f.thrust / Math.max(0.3, f.thrustApp * 1.8)) : 0,
      airspeed: active ? Math.min(1, f.airspeed / 50) : 0,
      gust: active ? Math.min(1, Math.abs(f.wind.gust || 0) / 4) : 0,
      ground: active && f.phase === 'ground' ? Math.min(1, f.vx / 30) : 0,
      shaker: active && f.shaker
    });
    requestAnimationFrame(frame);
  }

  function hudInfo() {
    if (!session) return null;
    if (session.mode === 'daily') return { mode: 'daily', results: dailyResults(), k: session.k, units: S.units };
    return { mode: 'circuits', landings: session.landings, step: session.step, units: S.units };
  }

  // ---- the ghost thumb (first approach, and again until the player flares) ----
  function updateGhost(f) {
    if (!ghost || state !== 'play') return;
    var tutorialSlow = !save.tutorialDone;
    if (ghost.phase === 'wait' && f.phase === 'air' && f.hr < ghost.cue) {
      ghost.phase = 'press';
      ghost.shown = true;
      if (tutorialSlow) timeTarget = 0.35;
    }
    if (ghost.phase === 'press') {
      if (held() || f.contact) {
        ghost.phase = f.contact ? 'release' : 'flaring';
        timeTarget = 1;
      }
    }
    if (ghost.phase === 'flaring' && f.contact) ghost.phase = 'release';
    if (ghost.phase === 'release' && f.noseDown) ghost.phase = 'brake';
    if (ghost.phase === 'brake' && (f.braking || f.done)) ghost.phase = 'over';
  }

  function ghostView() {
    if (!ghost || state !== 'play' && state !== 'beat') return null;
    if (ghost.phase === 'press') return { press: Math.floor(realT * 1.6) % 2 === 0, nose: true };
    if (ghost.phase === 'release') return { press: false };
    if (ghost.phase === 'brake') return { press: Math.floor(realT * 1.6) % 2 === 0, brake: true };
    return null;
  }

  // ---- events from the sim ----
  function handleEvents(f) {
    for (var i = 0; i < f.events.length; i++) {
      var e = f.events[i];
      switch (e.type) {
        case 'callout':
          audio.tick();
          R.addPop('callout', { ft: e.data.ft, x: f.x, h: f.h }, realT);
          break;
        case 'touch':
          onTouch(f, e.data);
          break;
        case 'stamp':
          onStamp(f, e.data);
          break;
        case 'bounce':
          audio.thump(0.6);
          R.puff(f.x, f.h, 4, 0.7);
          break;
        case 'nosedown':
          audio.thump(0.18);
          break;
        case 'done':
          onDone(f, e.data);
          break;
      }
    }
    f.events.length = 0;
  }

  function onTouch(f, d) {
    var k = Math.min(1.2, d.fpm / 400);
    audio.chirp(0.35 + k * 0.7);
    if (d.fpm >= 120) audio.thump(k);
    var onRunway = airportsMod.isRunway(f.rw, f.x);
    R.puff(f.x, f.h, onRunway ? 3 + Math.round(k * 5) : 7, 0.5 + k * 0.6, onRunway ? null : (f.ap.sky.water && f.x < 0 ? '#d9e6ee' : '#b7a98f'));
    stampPop = { fpm: d.fpm, stamp: null, score: null, sticky: true, unit: S.units.fpm };
    R.clearPops();
    R.addPop('stamp', stampPop, realT);
    haptic(d.fpm < grade.BUTTER_FPM ? 'light' : d.fpm < grade.HARD_FPM ? 'medium' : 'heavy');
    var firstEver = !save.tutorialDone;
    if (d.fpm < grade.BUTTER_FPM || firstEver) {
      timeTarget = 0.3;
      slowUntil = realT + (firstEver ? 1.3 : 0.9);
      R.dip(0.07);
    }
  }

  function onStamp(f, d) {
    if (!stampPop) {
      stampPop = { fpm: d.fpm, stamp: null, score: null, sticky: true, unit: S.units.fpm };
      R.addPop('stamp', stampPop, realT);
    }
    stampPop.stamp = d.stamp;
    stampPop.score = d.score;
    R.clearPops();
    R.addPop('stamp', stampPop, realT);
    var clean = grade.isClean(d.stamp);
    audio.stamp(clean);
    if (d.stamp === 'butter') {
      audio.chime();
      flash = 1;
      haptic('success');
    } else if (!clean) {
      haptic('error');
      if (d.stamp === 'hard') R.shake(7);
      if (d.stamp === 'stall' || d.stamp === 'short') { timeTarget = 0.45; slowUntil = realT + 0.8; }
    }
  }

  function onDone(f, d) {
    setState('beat');
    var clean = d.outcome === 'clean';
    var landing = { stamp: f.stamp || 'missed', fpm: f.fpm, score: f.score, aircraft: f.ac.id, flare: f.flare };
    var before = save.log.landings;
    progress.recordLanding(save, landing);
    if (ghost && !f.heldInFlare) save.ghostThumb = 1;
    else if (ghost && f.heldInFlare) save.ghostThumb = 0;
    if (!save.tutorialDone) save.tutorialDone = true;
    announceUnlocks(before, save.log.landings);
    persist();

    if (session.mode === 'circuits') {
      session.last = { stamp: landing.stamp, fpm: landing.fpm, flare: f.flare };
      session.stamps.push(landing.stamp);
      if (clean) {
        session.landings += 1;
        session.score += f.score;
        if (!session.best || f.fpm < session.best.fpm) session.best = { fpm: f.fpm, flare: f.flare, stamp: f.stamp };
        session.step += 1;
        session.idx += 1;
        stampPop.hold = 1.6;
        stampPop.sticky = false;
        after(1.5, function () {
          dimTarget = 1;
          after(0.28, function () {
            startCircuitApproach();
            dimTarget = 0;
          });
        });
      } else {
        after(1.4, function () { circuitsRunOver(); });
      }
    } else {
      var result = { stamp: landing.stamp, fpm: landing.fpm, score: f.score };
      recordDailyResult(result);
      after(clean ? 1.6 : 1.4, function () { showDailyCard(!clean); });
    }
  }

  function after(sec, fn) {
    pendingAfter = { at: realT + sec, fn: fn };
  }

  function announceUnlocks(before, nowCount) {
    var found = [];
    aircraftMod.list.forEach(function (a) { if (a.unlock > before && a.unlock <= nowCount) found.push(S.aircraft[a.id]); });
    airportsMod.list.forEach(function (a) { if (a.unlock > before && a.unlock <= nowCount) found.push(S.airports[a.id]); });
    if (found.length) toast(S.unlocked + ': ' + found.join(', '));
  }

  function recordDailyResult(result) {
    progress.recordFinished(save);
    if (session.round === 2) {
      if (session.goAround) {
        var sr = save.daily.second.results;
        result.ga = true;
        sr[sr.length - 1] = result;
      } else {
        progress.recordSecond(save, session.day, result);
      }
    } else if (session.goAround) {
      progress.replaceLastDaily(save, session.day, result);
    } else {
      progress.recordDaily(save, session.day, result);
    }
    session.goAround = false;
    save.daily.flying = null;
    persist();
  }

  // ---- Circuits run over: one ad experience at most, then the card ----
  function circuitsRunOver() {
    progress.recordFinished(save);
    progress.recordRun(save, { landings: session.landings, score: session.score });
    var n = today();
    progress.ensureDay(save, n);
    persist();
    var keepOffer = rules.canKeepRun(Shell.caps, session, save.daily.keepRuns);
    if (keepOffer) {
      showRunCard(true);
      return;
    }
    var allowed = rules.interstitialAllowed(save.ads, {
      kind: 'circuits_end', runLandings: session.landings, rewardOffered: false, adFree: Shell.caps.adFree
    });
    if (allowed.ok && Shell.caps.interstitial) {
      setState('break');
      Shell.interstitial('circuits_end').then(function (r) {
        rules.afterInterstitial(save.ads, r);
        persist();
        showRunCard(false);
      });
    } else {
      showRunCard(false);
    }
  }

  function rewardLabel(adText, freeText) {
    return adFreeNow() ? freeText : adText;
  }

  function rewardButton(adText, freeText, onGrant, placement) {
    var b = el('button', 'btn reward wide');
    b.type = 'button';
    b.appendChild(icon('play-circle'));
    b.appendChild(el('span', null, rewardLabel(adText, freeText)));
    b.addEventListener('click', function () {
      b.disabled = true;
      audio.click();
      Shell.rewarded(placement).then(function (r) {
        b.disabled = false;
        if (r.granted) {
          rules.afterRewarded(save.ads, r);
          persist();
          onGrant();
        } else {
          toast(r.reason === 'skipped' ? S.rewardSkipped : S.rewardNotReady);
          if (!rules.rewardReady(Shell.caps)) b.hidden = true;
        }
      });
    });
    b.setAttribute('data-reward', placement);
    return b;
  }

  function stampCanvas(kind, size) {
    var c = el('canvas');
    var d = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * d;
    c.height = size * d;
    c.style.width = size + 'px';
    c.style.height = size + 'px';
    var x = c.getContext('2d');
    x.scale(d, d);
    art.drawStamp(x, kind, size / 2, size / 2, size / 2 - 2, { fill: 'rgba(12, 22, 38, 0.4)' });
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', S.stamps[kind] || kind);
    return c;
  }

  function flareChart(mine, best) {
    var wrap = el('div');
    var c = el('canvas', 'chart');
    wrap.appendChild(c);
    var leg = el('div', 'legend');
    // When this flare is the best one, there is nothing to compare: one line, named as the best. With no
    // best yet (no clean landing in this aircraft), the one line is just this flare.
    var isBest = !!(best && best.pts && mine && best.pts.length === mine.length && best.pts.every(function (v, i) { return v === mine[i]; }));
    if (isBest) best = null;
    var a = el('span'); a.appendChild(el('i')); a.appendChild(document.createTextNode(isBest ? S.bestFlare : S.yourFlare));
    leg.appendChild(a);
    if (best && best.pts && best.pts.length) {
      var b = el('span'); b.appendChild(el('i', 'ghost')); b.appendChild(document.createTextNode(S.bestFlare + ' ' + best.fpm));
      leg.appendChild(b);
    }
    wrap.appendChild(leg);
    requestAnimationFrame(function () {
      var w = c.clientWidth || 300, h = c.clientHeight || 110;
      var d = Math.min(2, window.devicePixelRatio || 1);
      c.width = w * d;
      c.height = h * d;
      var x = c.getContext('2d');
      x.scale(d, d);
      var maxH = 1;
      [mine, best && best.pts].forEach(function (p) {
        if (!p) return;
        for (var i = 0; i < p.length; i += 3) maxH = Math.max(maxH, Math.min(10, p[i + 1]));
      });
      x.strokeStyle = 'rgba(238,243,247,0.18)';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(0, h - 8);
      x.lineTo(w, h - 8);
      x.stroke();
      function line(p, color, dash) {
        if (!p || p.length < 6) return;
        x.strokeStyle = color;
        x.lineWidth = 2;
        x.setLineDash(dash || []);
        x.beginPath();
        var started = false;
        for (var i = 0; i < p.length; i += 3) {
          var px = w * (1 - p[i] / 4);
          var py = (h - 8) - (h - 18) * Math.min(1, p[i + 1] / maxH);
          if (!started) { x.moveTo(px, py); started = true; } else x.lineTo(px, py);
        }
        x.stroke();
        x.setLineDash([]);
      }
      line(best && best.pts, '#f3d27a', [6, 5]);
      line(mine, '#eef3f7');
    });
    return wrap;
  }

  function sheetHead(title, kicker) {
    var head = el('div', 'sheet-head');
    var box = el('div');
    if (kicker) box.appendChild(el('p', 'kicker', kicker));
    box.appendChild(el('h2', null, title));
    head.appendChild(box);
    return head;
  }

  function primaryButton(text, fn, cls) {
    var b = el('button', 'btn ' + (cls || 'primary') + ' wide', text);
    b.type = 'button';
    b.addEventListener('click', function () { audio.click(); fn(); });
    return b;
  }

  function removeAdsOffer(hadButter) {
    if (!rules.offerRemoveAdsOnResult(Shell.caps, save.removeAdsPrompted, hadButter)) return null;
    save.removeAdsPrompted = true;
    persist();
    var box = el('div', 'offer');
    box.appendChild(el('span', null, S.removeAdsLine));
    box.appendChild(removeAdsButton('quiet'));
    return box;
  }

  // A purchase or restore answer can arrive before the shell's caps event: trust either.
  var boughtAdFree = false;
  function adFreeNow() { return !!(Shell.caps.adFree || boughtAdFree); }

  function removeAdsButton(cls) {
    var price = Shell.caps.removeAdsPrice;
    var b = el('button', 'btn ' + (cls || '') + ' wide', price ? fmt(S.removeAdsPrice, { price: price }) : S.removeAds);
    b.type = 'button';
    b.addEventListener('click', function () {
      b.disabled = true;
      Shell.buyRemoveAds().then(function (r) {
        b.disabled = false;
        toast(S.purchase[r.reason] || S.purchase.failed);
        caps = Shell.caps;
        if (r.adFree) {
          boughtAdFree = true;
          b.hidden = true;
          if (!ui.sheet.hidden && sheetKind === 'settings') openSettings();
        }
      });
    });
    return b;
  }

  function openResult(nodes) {
    pauseNext = false;
    R.clearPops();
    ui.resultPanel.textContent = '';
    nodes.forEach(function (n) { if (n) ui.resultPanel.appendChild(n); });
    hideScreens();
    ui.result.hidden = false;
    ui.pauseBtn.hidden = true;
    setState('result');
    ensureAttract();
    bannerFor(true);
    var first = ui.resultPanel.querySelector('.btn.primary');
    if (first) first.focus({ preventScroll: true });
  }

  function showRunCard(offerKeep) {
    var last = session.last || { stamp: 'missed', fpm: 0 };
    var nodes = [sheetHead(S.runOver, S.airports[session.airport] + ', ' + S.aircraft[session.aircraft])];
    var row = el('div', 'big-row');
    row.appendChild(stampCanvas(last.stamp, 76));
    var nb = el('div');
    nb.appendChild(el('div', 'big-num', String(session.landings)));
    nb.appendChild(el('div', 'big-unit', S.landings));
    row.appendChild(nb);
    nodes.push(row);
    var stats = el('div', 'stat-line');
    stats.appendChild(statItem(session.score, S.score));
    stats.appendChild(statItem(session.step, S.windStep));
    if (session.landings > 0 && session.landings >= save.log.bestRun) stats.appendChild(el('span', null, S.newBest));
    nodes.push(stats);
    var shown = session.best || session.last;
    if (shown && shown.flare) nodes.push(flareChart(shown.flare, save.ghosts[session.aircraft]));
    var actions = el('div', 'actions');
    if (offerKeep) {
      actions.appendChild(rewardButton(S.keepRunAd, S.keepRunFree, function () {
        session.kept = true;
        session.idx += 1;
        progress.ensureDay(save, today());
        save.daily.keepRuns += 1;
        persist();
        startCircuitApproach();
      }, 'keep_run'));
    }
    actions.appendChild(primaryButton(S.flyAgain, function () {
      startCircuits({ airport: session.airport, aircraft: session.aircraft });
    }));
    actions.appendChild(primaryButton(S.menu, showMenu, 'quiet'));
    nodes.push(actions);
    var hadButter = session.stamps.indexOf('butter') >= 0;
    nodes.push(removeAdsOffer(hadButter));
    openResult(nodes);
  }

  function statItem(value, label) {
    var s = el('span');
    s.appendChild(el('b', null, String(value)));
    s.appendChild(document.createTextNode(label));
    return s;
  }

  // ---- Daily cards ----
  function showDailyCard(failed) {
    var results = dailyResults();
    var last = results[results.length - 1] || { stamp: 'missed', fpm: 0, score: 0 };
    var finished = results.length >= 5;
    var canGa = rules.canGoAround(Shell.caps, save.daily, failed);
    session.offeredGoAround = canGa;
    if (finished) {
      showDailySummary(canGa);
      return;
    }
    var title = session.round === 2 ? S.secondRound : fmt(S.dailyTitle, { n: session.day });
    var nodes = [sheetHead(fmt(S.approach, { k: results.length }), title)];
    var row = el('div', 'big-row');
    row.appendChild(stampCanvas(last.stamp, 76));
    var nb = el('div');
    nb.appendChild(el('div', 'big-num', String(last.fpm)));
    nb.appendChild(el('div', 'big-unit', S.units.fpm + (grade.isClean(last.stamp) ? '  +' + last.score : '')));
    row.appendChild(nb);
    nodes.push(row);
    nodes.push(stampsRow(results));
    if (flight && flight.flare) nodes.push(flareChart(flight.flare, save.ghosts[session.aircraft]));
    var actions = el('div', 'actions');
    if (canGa) actions.appendChild(goAroundButton());
    actions.appendChild(primaryButton(S.next, dailyNext));
    actions.appendChild(primaryButton(S.menu, showMenu, 'quiet'));
    nodes.push(actions);
    openResult(nodes);
  }

  function goAroundButton() {
    return rewardButton(S.goAroundAd, S.goAroundFree, function () {
      save.daily.goAroundUsed = true;
      persist();
      session.goAround = true;
      startDailyApproach();
    }, 'go_around');
  }

  function dailyNext() {
    var results = dailyResults();
    var allowed = rules.interstitialAllowed(save.ads, {
      kind: 'daily_next', approachesDone: results.length, dailyAdUsed: save.daily.adUsed,
      rewardOffered: session.offeredGoAround, adFree: Shell.caps.adFree
    });
    if (allowed.ok && Shell.caps.interstitial) {
      setState('break');
      Shell.interstitial('daily_next').then(function (r) {
        rules.afterInterstitial(save.ads, r);
        if (r.shown) save.daily.adUsed = true;
        persist();
        startDailyApproach();
      });
    } else {
      startDailyApproach();
    }
  }

  function stampsRow(results) {
    var row = el('div', 'stamps-row');
    for (var i = 0; i < 5; i++) {
      var cell = el('div', 'cell');
      var r = results[i];
      if (r) {
        cell.appendChild(stampCanvas(r.stamp, 44));
        cell.appendChild(el('span', null, r.stamp === 'missed' ? '0' : String(r.fpm)));
        if (r.ga) cell.appendChild(el('small', null, S.goAroundMark));
      } else {
        var blank = el('span', 'slot');
        blank.style.width = '40px';
        blank.style.height = '40px';
        cell.appendChild(blank);
      }
      row.appendChild(cell);
    }
    return row;
  }

  function showDailySummary(offerGoAround) {
    var n = session ? session.day : today();
    var d = progress.ensureDay(save, n);
    var main = d.results;
    var total = progress.dailyTotal(main);
    var nodes = [sheetHead(fmt(S.dailyTitle, { n: n }), S.airports[daily.config(n).airport] + ', ' + S.aircraft[daily.config(n).aircraft])];
    var row = el('div', 'big-row');
    var nb = el('div');
    nb.appendChild(el('div', 'big-num', String(total)));
    nb.appendChild(el('div', 'big-unit', S.total + ' / 500'));
    row.appendChild(nb);
    nodes.push(row);
    nodes.push(stampsRow(main));
    var stats = el('div', 'stat-line');
    stats.appendChild(statItem(progress.currentStreak(save, n), S.streak));
    stats.appendChild(statItem(save.streak.bestScore, S.best));
    nodes.push(stats);
    if (d.second && d.second.results.length) {
      nodes.push(el('p', 'kicker', S.secondRound + ', ' + S.aircraft[d.second.aircraft] + ': ' + progress.dailyTotal(d.second.results) + ' / 500'));
      nodes.push(stampsRow(d.second.results));
    }
    var actions = el('div', 'actions');
    if (offerGoAround && session && session.mode === 'daily') actions.appendChild(goAroundButton());
    if (canShare() && d.done) {
      var sb = el('button', 'btn wide');
      sb.type = 'button';
      sb.appendChild(icon('share-network'));
      sb.appendChild(el('span', null, S.share));
      sb.addEventListener('click', function () { doShare(n); });
      actions.appendChild(sb);
    }
    var secondOpen = d.second && !d.second.done;
    if (secondOpen) {
      actions.appendChild(primaryButton(S.secondRound, function () { startDaily(2); }));
    } else if (d.secondUsed && !d.second) {
      // Granted but no aircraft picked yet (the player went back): the round is still theirs today.
      secondOpen = true;
      actions.appendChild(primaryButton(S.secondRound, function () { pickSecondAircraft(n); }));
    } else if (!offerGoAround && rules.canSecondRound(Shell.caps, d)) {
      actions.appendChild(rewardButton(S.secondAd, S.secondFree, function () {
        save.daily.secondUsed = true;
        persist();
        pickSecondAircraft(n);
      }, 'second_round'));
    }
    actions.appendChild(primaryButton(S.menu, showMenu, secondOpen ? 'quiet' : 'primary'));
    nodes.push(actions);
    nodes.push(el('p', 'note', nextDailyText()));
    var hadButter = main.some(function (r) { return r.stamp === 'butter'; });
    nodes.push(removeAdsOffer(hadButter));
    openResult(nodes);
  }

  function pickSecondAircraft(n) {
    var nodes = [sheetHead(S.pickAircraft, S.secondRound)];
    var actions = el('div', 'actions');
    daily.otherAircraft(n).forEach(function (id) {
      actions.appendChild(primaryButton(S.aircraft[id], function () { startDaily(2, id); }, 'primary'));
    });
    actions.appendChild(primaryButton(S.menu, showMenu, 'quiet'));
    nodes.push(actions);
    openResult(nodes);
  }

  function nextDailyText() {
    var now = new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var mins = Math.max(1, Math.round((next - now) / 60000));
    return fmt(S.dailyNext, { h: Math.floor(mins / 60), m: mins % 60 });
  }

  // Shell.share arrived in game-sdk.js 1.1.0; an older SDK or shell has none, and then there is no button.
  function canShare() {
    return typeof Shell.share === 'function' && !!Shell.caps.share;
  }

  // Called straight from the tap, with no await before Shell.share: Web Share needs the tap's activation.
  function doShare(n) {
    var d = progress.ensureDay(save, n);
    var total = progress.dailyTotal(d.results);
    var text = share.text(n, d.results, total);
    var png = null;
    try {
      png = share.png(n, d.results, total, art, BL.render.FONT);
      if (png && png.length > 1000000) png = null; // keep the card under 1 MB; the text still goes
    } catch (e) { png = null; }
    Shell.share({ text: text, url: share.URL, png: png }).then(function (r) {
      if (r && r.reason === 'copied') toast(S.shareCopied);
      else if (r && !r.ok && r.reason !== 'cancelled') toast(S.shareFailed);
    });
  }

  // ---- menu ----
  function showMenu() {
    pauseNext = false;
    session = null;
    flight = null;
    ghost = null;
    hideScreens();
    ui.pauseBtn.hidden = true;
    ui.menu.hidden = false;
    setState('menu');
    refreshMenu();
    ensureAttract();
    bannerFor(true);
  }

  function ensureAttract() {
    if (!attract) newAttract(0);
  }

  function newAttract(n) {
    var ap = progress.isUnlocked(save, 'airport', save.sel.airport) ? save.sel.airport : 'island';
    var ac = progress.isUnlocked(save, 'aircraft', save.sel.aircraft) ? save.sel.aircraft : 'bush';
    var f = sim.createFlight({ aircraft: ac, airport: ap, seed: rng.hashString('attract-' + n), step: 1 + (n % 3) });
    // Skip most of the approach so the menu shows the interesting part quickly.
    var d = pilot.make({ flare: 0.85, touch: 0.1 });
    for (var i = 0; i < 120 * 6; i++) sim.step(f, d(f));
    f.events.length = 0;
    attract = { f: f, decide: d, n: n, until: 0 };
  }

  function refreshMenu() {
    var n = today();
    var d = save.daily.day === n ? save.daily : null;
    ui.dailyNum.textContent = String(n);
    ui.dailySlots.textContent = '';
    for (var i = 0; i < 5; i++) {
      var r = d && d.results[i];
      var s = el('span', 'slot' + (r ? (r.stamp === 'butter' ? ' butter' : r.stamp === 'firm' ? ' firm' : ' fail') : ''));
      ui.dailySlots.appendChild(s);
    }
    ui.dailyMeta.textContent = '';
    var cfg = daily.config(n);
    ui.dailyMeta.appendChild(document.createTextNode(S.airports[cfg.airport] + ', ' + S.aircraft[cfg.aircraft]));
    var streak = progress.currentStreak(save, n);
    if (streak > 0) {
      var sk = el('span', 'streak', S.streak + ' ');
      sk.appendChild(el('b', null, String(streak)));
      ui.dailyMeta.appendChild(sk);
    }
    $('circuitsBest').textContent = save.log.bestRun ? S.best + ' ' + save.log.bestRun : '';
    renderPicker(ui.airportPicker, 'airport', airportsMod.ids, save.sel.airport, S.airports);
    renderPicker(ui.aircraftPicker, 'aircraft', aircraftMod.ids, save.sel.aircraft, S.aircraft);
    var okA = progress.isUnlocked(save, 'airport', save.sel.airport);
    var okB = progress.isUnlocked(save, 'aircraft', save.sel.aircraft);
    ui.flyBtn.disabled = !(okA && okB);
    soundIcon();
  }

  function renderPicker(node, kind, ids, current, names) {
    var name = node.querySelector('.pick-name');
    name.textContent = '';
    var locked = !progress.isUnlocked(save, kind, current);
    name.className = 'pick-name' + (locked ? ' locked' : '');
    name.appendChild(document.createTextNode(names[current]));
    if (locked) {
      var lk = el('span', 'lock');
      lk.appendChild(icon('lock-simple'));
      lk.appendChild(document.createTextNode(fmt(S.lockedNeed, { n: progress.landingsToUnlock(save, kind, current) })));
      lk.setAttribute('aria-label', S.a11y.locked);
      name.appendChild(lk);
    }
  }

  function cycle(kind, dir) {
    var ids = kind === 'airport' ? airportsMod.ids : aircraftMod.ids;
    var cur = save.sel[kind === 'airport' ? 'airport' : 'aircraft'];
    var i = (ids.indexOf(cur) + dir + ids.length) % ids.length;
    save.sel[kind === 'airport' ? 'airport' : 'aircraft'] = ids[i];
    persist();
    audio.click();
    refreshMenu();
    if (progress.isUnlocked(save, kind, ids[i])) newAttract(attract ? attract.n + 1 : 0);
  }

  function soundIcon() {
    ui.soundBtn.textContent = '';
    ui.soundBtn.appendChild(icon(save.settings.sound ? 'speaker-high' : 'speaker-slash'));
    ui.soundBtn.setAttribute('aria-pressed', save.settings.sound ? 'true' : 'false');
  }

  function toggleSound() {
    save.settings.sound = !save.settings.sound;
    audio.unlock();
    audio.setMuted(!save.settings.sound);
    persist();
    soundIcon();
    if (!ui.sheet.hidden && sheetKind === 'settings') openSettings();
  }

  // ---- sheets: settings, logbook, how to play ----
  var sheetKind = null;
  function openSheet(kind, nodes) {
    sheetKind = kind;
    ui.sheetPanel.textContent = '';
    nodes.forEach(function (n) { if (n) ui.sheetPanel.appendChild(n); });
    ui.sheet.hidden = false;
    var close = ui.sheetPanel.querySelector('[data-close]');
    if (close) close.focus({ preventScroll: true });
  }

  function closeSheet() {
    ui.sheet.hidden = true;
    sheetKind = null;
  }

  function closeButton() {
    var b = el('button', 'icon-btn small');
    b.type = 'button';
    b.setAttribute('aria-label', S.close);
    b.setAttribute('data-close', '1');
    b.appendChild(icon('x'));
    b.addEventListener('click', function () { audio.click(); closeSheet(); });
    return b;
  }

  function headWithClose(title) {
    var h = sheetHead(title);
    h.appendChild(closeButton());
    return h;
  }

  function row(label, value, fn, on) {
    var b = el('button', 'row');
    b.type = 'button';
    b.appendChild(el('span', null, label));
    var v = el('span', 'val' + (on ? ' on' : ''));
    if (typeof value === 'string') v.textContent = value; else if (value) v.appendChild(value);
    b.appendChild(v);
    b.addEventListener('click', function () { audio.click(); fn(); });
    return b;
  }

  function openSettings() {
    var rows = el('div', 'rows');
    rows.appendChild(row(S.sound, save.settings.sound ? S.on : S.off, toggleSound, save.settings.sound));
    rows.appendChild(row(S.vibration, save.settings.haptics ? S.on : S.off, function () {
      save.settings.haptics = !save.settings.haptics;
      persist();
      if (save.settings.haptics) Shell.haptic('tap');
      openSettings();
    }, save.settings.haptics));
    rows.appendChild(row(S.howToPlay, icon('question'), openHowTo));
    var link = el('a', 'row');
    link.href = PRIVACY_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.appendChild(el('span', null, S.privacyPolicy));
    var lv = el('span', 'val');
    lv.appendChild(icon('arrow-square-out'));
    link.appendChild(lv);
    rows.appendChild(link);
    caps = Shell.caps;
    if (caps.privacyOptions) {
      rows.appendChild(row(S.privacyOptions, icon('shield-check'), function () {
        Shell.privacyOptions().then(function (r) {
          caps = Shell.caps;
          if (!r || !r.shown) toast(S.privacyNotReady);
        });
      }));
    }
    var nodes = [headWithClose(S.settings), rows];
    if (caps.removeAds) {
      var box = el('div', 'actions');
      if (adFreeNow()) box.appendChild(el('p', 'note', S.adFreeThanks));
      else box.appendChild(removeAdsButton('primary'));
      var rb = el('button', 'btn quiet wide', S.restore);
      rb.type = 'button';
      rb.addEventListener('click', function () {
        rb.disabled = true;
        Shell.restore().then(function (r) {
          rb.disabled = false;
          if (r.adFree) boughtAdFree = true;
          if (r.ok) toast(r.adFree ? S.restored.yes : S.restored.no);
          else toast(S.purchase[r.reason] || S.restored.failed);
          openSettings();
        });
      });
      box.appendChild(rb);
      nodes.push(box);
    }
    nodes.push(el('p', 'fine', S.licences));
    openSheet('settings', nodes);
  }

  function openHowTo() {
    var prose = el('div', 'prose');
    S.howTo.forEach(function (p) { prose.appendChild(el('p', null, p)); });
    prose.appendChild(el('h3', null, S.tipsTitle));
    var ul = el('ul');
    S.tips.forEach(function (t) { ul.appendChild(el('li', null, t)); });
    prose.appendChild(ul);
    openSheet('howto', [headWithClose(S.howToPlay), prose]);
  }

  function openLogbook() {
    var n = today();
    var tiles = el('div', 'tiles');
    function tile(v, label, wide) {
      var t = el('div', 'tile' + (wide ? ' wide' : ''));
      t.appendChild(el('b', null, String(v)));
      t.appendChild(el('span', null, label));
      tiles.appendChild(t);
    }
    tile(save.log.landings, S.log.landings);
    tile(save.log.butters, S.log.butters);
    tile(save.log.smoothest == null ? '0' : save.log.smoothest + ' ' + S.units.fpm, S.log.smoothest);
    tile(save.log.bestRun, S.log.bestRun);
    tile(save.log.bestRunScore, S.log.bestRunScore);
    tile(save.log.bestButterRun, S.log.butterStreak);
    tile(progress.currentStreak(save, n), S.log.dailyStreak);
    tile(save.streak.bestScore, S.log.bestDaily);
    var unl = el('div', 'unlocks');
    aircraftMod.list.concat(airportsMod.list).forEach(function (item) {
      var isAc = aircraftMod.ids.indexOf(item.id) >= 0 && S.aircraft[item.id];
      var name = isAc ? S.aircraft[item.id] : S.airports[item.id];
      var left = progress.landingsToUnlock(save, isAc ? 'aircraft' : 'airport', item.id);
      var line = el('div');
      line.appendChild(el('span', null, name));
      line.appendChild(el('span', null, left ? fmt(S.lockedNeed, { n: left }) : S.unlocked));
      unl.appendChild(line);
    });
    openSheet('logbook', [headWithClose(S.logbook), tiles, unl]);
  }

  // ---- pause ----
  function pauseGame() {
    if (state !== 'play') return;
    setState('paused');
    pointers = {};
    keyHold = false;
    ui.pause.hidden = false;
    ui.pauseBtn.hidden = true;
    var isDaily = session && session.mode === 'daily';
    ui.leaveBtn.textContent = isDaily ? S.leaveApproach : S.endRun;
    ui.leaveNote.textContent = isDaily ? S.leaveNote : '';
    ui.leaveNote.hidden = !isDaily;
    persist();
    audio.suspend();
    ui.resumeBtn.focus({ preventScroll: true });
  }

  function resumeGame() {
    if (state !== 'paused') return;
    ui.pause.hidden = true;
    ui.pauseBtn.hidden = false;
    setState('play');
    BL.clock.reset(clock);
    audio.resume();
  }

  function leaveFromPause() {
    audio.resume();
    if (session && session.mode === 'daily') {
      recordDailyResult({ stamp: 'missed', fpm: 0, score: 0 });
      showMenu();
      return;
    }
    if (session && session.mode === 'circuits') {
      progress.recordFinished(save);
      progress.recordRun(save, { landings: session.landings, score: session.score });
      persist();
    }
    showMenu();
  }

  // ---- input ----
  function onPointerDown(e) {
    audio.unlock();
    if (state !== 'play') return;
    pointers[e.pointerId] = true;
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
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.key === ' ') {
      if (state === 'play') {
        keyHold = true;
        e.preventDefault();
      }
      audio.unlock();
    } else if ((e.key === 'p' || e.key === 'P') && state === 'play') {
      pauseGame();
    }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space' || e.key === ' ') keyHold = false;
  });
  window.addEventListener('blur', function () { pointers = {}; keyHold = false; });
  document.addEventListener('pointerdown', function () { audio.unlock(); }, { passive: true });

  ui.pauseBtn.addEventListener('click', function () { audio.click(); pauseGame(); });
  ui.resumeBtn.addEventListener('click', function () { audio.click(); resumeGame(); });
  ui.leaveBtn.addEventListener('click', function () { audio.click(); leaveFromPause(); });
  ui.flyBtn.addEventListener('click', function () {
    audio.unlock();
    audio.click();
    startCircuits({});
  });
  ui.dailyCard.addEventListener('click', function () {
    audio.unlock();
    audio.click();
    var n = today();
    var d = progress.ensureDay(save, n);
    if (!d.done) startDaily(1);
    else if (d.second && !d.second.done) startDaily(2);
    else { session = null; showDailySummaryFromMenu(n); }
  });
  function showDailySummaryFromMenu(n) {
    session = { mode: 'daily', day: n, cfg: daily.config(n), round: 1, aircraft: daily.config(n).aircraft, goAround: false };
    showDailySummary(false);
  }
  ui.logBtn.addEventListener('click', function () { audio.click(); openLogbook(); });
  ui.settingsBtn.addEventListener('click', function () { audio.click(); openSettings(); });
  ui.soundBtn.addEventListener('click', toggleSound);
  ui.airportPicker.querySelector('.prev').addEventListener('click', function () { cycle('airport', -1); });
  ui.airportPicker.querySelector('.next').addEventListener('click', function () { cycle('airport', 1); });
  ui.aircraftPicker.querySelector('.prev').addEventListener('click', function () { cycle('aircraft', -1); });
  ui.aircraftPicker.querySelector('.next').addEventListener('click', function () { cycle('aircraft', 1); });
  ui.sheet.addEventListener('click', function (e) { if (e.target === ui.sheet) closeSheet(); });

  // ---- shell lifecycle ----
  Shell.onPause(function () {
    if (state === 'play') pauseGame();
    else if (state === 'beat') pauseNext = true;
    persist();
    audio.suspend();
  });
  Shell.onResume(function () {
    if (state !== 'paused') audio.resume();
  });
  var settingsKey = '';
  Shell.onChange(function () {
    caps = Shell.caps;
    // Settings shows Privacy options and Remove ads from the caps: redraw it when those change.
    var key = [caps.adFree, caps.removeAds, caps.privacyOptions, caps.removeAdsPrice].join('|');
    if (key !== settingsKey) {
      settingsKey = key;
      if (!ui.sheet.hidden && sheetKind === 'settings') openSettings();
    }
    R.setInsets(caps.insets);
    layoutBanner();
    if (state === 'menu') refreshMenu();
    // A rewarded button disappears the moment no ad can be shown.
    var ready = rules.rewardReady(caps);
    Array.prototype.forEach.call(document.querySelectorAll('[data-reward]'), function (b) { b.hidden = !ready; });
  });
  Shell.onBack(function () {
    if (!ui.sheet.hidden) { closeSheet(); return true; }
    if (state === 'play' || state === 'beat') { if (state === 'play') pauseGame(); return true; }
    if (state === 'paused') { resumeGame(); return true; }
    if (state === 'break') return true;
    if (state === 'result') { showMenu(); return true; }
    return false;
  });

  function resize() {
    caps = Shell.caps;
    R.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, caps.insets);
    if (flight) R.setScene(flight); else if (attract) R.setScene(attract.f);
  }
  window.addEventListener('resize', resize);
  if (reducedMq) {
    R.setReduced(reducedMq.matches);
    if (reducedMq.addEventListener) reducedMq.addEventListener('change', function () { R.setReduced(reducedMq.matches); });
  }

  // ---- debug view for automated tests (read only) ----
  window.__butterline = {
    get state() { return state; },
    get flight() {
      var f = flight;
      if (!f) return null;
      return { phase: f.phase, hr: f.hr, vz: f.vz, vx: f.vx, x: f.x, h: f.h, airspeed: f.airspeed, alpha: f.alpha,
        stall: f.ac.alphaStall, shaker: f.shaker, noseDown: f.noseDown, contact: !!f.contact, done: f.done,
        stamp: f.stamp, fpm: f.fpm, t: f.t, ac: f.ac.id, glide: f.ac.glide, aim: f.rw.aim, end: f.rw.end };
    },
    get session() { return session ? { mode: session.mode, landings: session.landings, step: session.step, k: session.k, round: session.round } : null; },
    get save() { return JSON.parse(JSON.stringify(save)); },
    fps: function () {
      var s = 0;
      for (var i = 0; i < frameTimes.length; i++) s += frameTimes[i];
      var sorted = frameTimes.slice().sort(function (a, b) { return a - b; });
      return { avg: frameTimes.length / s, p95ms: sorted[Math.floor(sorted.length * 0.95)] * 1000, frames: frameTimes.length };
    },
    holdSteps: function () { return holdLog; },
    raw: function () { return flight; }
  };

  // ---- boot ----
  staticText();
  audio.setMuted(!save.settings.sound);
  resize();
  setState('boot');
  newAttract(0);
  requestAnimationFrame(frame);
  var fontsReady = document.fonts && document.fonts.load ? Promise.all([
    document.fonts.load('600 20px "Sofia Sans Condensed"'), document.fonts.load('500 20px "Sofia Sans Condensed"')
  ]).catch(function () {}) : Promise.resolve();
  Promise.all([Shell.ready(), fontsReady]).then(function () {
    caps = Shell.caps;
    resize();
    layoutBanner();
    if (!save.tutorialDone) {
      // First launch: the wordmark for a moment, then the first approach starts by itself.
      hideScreens();
      ui.menu.hidden = false;
      refreshMenu();
      ui.menu.querySelector('.menu-stack').hidden = true;
      setTimeout(function () {
        ui.menu.querySelector('.menu-stack').hidden = false;
        if (state === 'boot') startCircuits({ airport: 'island', aircraft: 'bush', tutorial: true });
      }, 1200);
    } else {
      showMenu();
      if (leftDaily) toast(S.dailyLeftMissed);
    }
  });
})();
