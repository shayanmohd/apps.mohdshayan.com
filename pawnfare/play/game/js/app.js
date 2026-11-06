/*
 * Pawnfare: screens, flows and the shell. The rules, AI, generator and ad rules live in the pure modules;
 * this file wires them to the DOM, the canvas view and game-sdk.js.
 *
 * Ad rules this game follows (WEBGAME-RECIPE.md section 3 and the wave 6 spec):
 *   no ad of any kind during a board; no banner in the app, and on the web only on menus and results;
 *   interstitials only at two breaks of normal runs (after the 3rd and 6th won board, before the draft;
 *   at the end of a run that reached board 4, before the summary), gated by run.mayInterstitial;
 *   never before, during or after the Daily; rewarded ads only from buttons that state the reward.
 * Sharing only from the Share button, straight from its tap, and never rewarded.
 */
(function () {
  'use strict';
  var P = window.Pawnfare;
  var S = P.strings.S;
  var rules = P.rules;
  var ai = P.ai;
  var eras = P.eras;
  var gen = P.gen;
  var codec = P.codec;
  var daily = P.daily;
  var draft = P.draft;
  var runlib = P.run;
  var saveLib = P.save;
  var art = P.art;
  var audio = P.audio;
  var icons = P.icons;
  var pieces = P.pieces;
  var genclient = P.genclient;
  var rng = P.rng;

  var PLAYER = rules.PLAYER;
  var RIVAL = rules.RIVAL;
  var PLAY_URL = 'https://apps.mohdshayan.com/pawnfare/play/';
  var POLICY_URL = 'https://apps.mohdshayan.com/privacy-policies/pawnfare-privacy-policy.html';
  var VERSION = '1.0.0';
  var COMPOUND_TYPES = { champion: 'faras+rukh', centaur: 'faras+bishop', amazon: 'faras+queen', mann: 'ferz+wazir' };
  var MUSEUM = pieces.ORDER.concat(['champion', 'centaur', 'amazon', 'mann']);

  function $(id) { return document.getElementById(id); }
  var el = {
    stage: $('stage'), hud: $('hud'), pauseBtn: $('pauseBtn'), pips: $('pips'), movesNum: $('movesNum'),
    movesTrack: $('movesTrack'), tray: $('tray'), fallen: $('fallen'), trayAction: $('trayAction'), screen: $('screen'),
    sheetWrap: $('sheetWrap'), sheet: $('sheet'), toast: $('toast')
  };
  // A quiet turning ring while a board is still being built (rare, but a weak army can take seconds).
  el.loader = document.createElement('div');
  el.loader.className = 'loader';
  el.loader.hidden = true;
  document.body.appendChild(el.loader);
  var loaderTimer = 0;
  function showLoader(on) {
    clearTimeout(loaderTimer);
    if (on) loaderTimer = setTimeout(function () { el.loader.hidden = false; }, 350);
    else el.loader.hidden = true;
  }

  // ---- saves ----
  Shell.configureSave({ prefix: 'pawnfare', version: saveLib.VERSION, migrate: saveLib.migrate });
  var progress = saveLib.sanitize(Shell.load('progress', null));
  function persist() { Shell.save('progress', progress); }

  var caps = Shell.caps;
  var view = P.board.create(el.stage);
  // Menus carry the lattice as the page background and hide the stage canvas (showScreen, enterPlay): in
  // Android's WebView the full-screen canvas under a menu was composited over part of it, a blank band
  // across the Continue card (emulator-5580, Android 16, 2026-11-06). Same tile, same scale as the stage.
  (function () {
    var T = 88;
    var s = Math.min(3, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
    var c = document.createElement('canvas');
    c.width = T * s;
    c.height = T * s;
    var g = c.getContext('2d');
    g.scale(s, s);
    g.fillStyle = art.groundPattern(g);
    g.fillRect(0, 0, T, T);
    document.body.style.background = 'url(' + c.toDataURL('image/png') + ') 0 0 / ' + T + 'px ' + T + 'px, var(--night)';
  })();
  var screen = 'home';
  var sheetName = null;
  var sheetBack = null;
  var game = null;
  var adBusy = false;
  var bannerOn = null;
  var breakRewarded = false;
  var toastTimer = 0;

  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function applyMotion() {
    view.reduced = progress.settings.motion === 'reduced' || !!(motionQuery && motionQuery.matches);
    document.documentElement.classList.toggle('reduced', progress.settings.motion === 'reduced');
  }
  applyMotion();
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', applyMotion);
  audio.setMuted(!progress.settings.sound);

  function buzz(style) { if (progress.settings.haptics) Shell.haptic(style); }
  function sfx(name) { audio.play(name); }
  document.addEventListener('pointerdown', function () { audio.unlock(); }, true);

  // ---- DOM helpers ----
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function button(label, opts) {
    opts = opts || {};
    var b = h('button', opts.cls || 'btn ghost');
    b.type = 'button';
    if (opts.icon) b.appendChild(icons.icon(opts.icon));
    if (label) b.appendChild(h('span', null, label));
    if (opts.aria) b.setAttribute('aria-label', opts.aria);
    b.addEventListener('click', function (e) {
      if (adBusy) return;
      audio.unlock();
      if (!opts.silent) sfx('tap');
      opts.onClick(e, b);
    });
    return b;
  }

  function discEl(type, side, r, cls) { return art.discElement(type, side, r, cls); }

  function toast(text) {
    el.toast.textContent = text;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 2600);
  }

  /** A mastery star: the eight-point khatam of the board's ground, gilt when earned. */
  function star(on) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-10 -10 20 20');
    svg.setAttribute('class', 'star' + (on ? ' on' : ''));
    var pts = [];
    for (var i = 0; i < 16; i++) {
      var a = (Math.PI * 2 * i) / 16 - Math.PI / 2;
      var rr = i % 2 ? 6.1 : 9.5;
      pts.push((Math.cos(a) * rr).toFixed(2) + ',' + (Math.sin(a) * rr).toFixed(2));
    }
    var poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', pts.join(' '));
    poly.setAttribute('fill', on ? 'currentColor' : 'none');
    poly.setAttribute('stroke', 'currentColor');
    poly.setAttribute('stroke-width', '1.4');
    svg.appendChild(poly);
    return svg;
  }

  // ---- the web banner: menus and results only, never during a board ----
  function setBanner(show) {
    if (caps.platform !== 'web') return;
    if (bannerOn === show) return;
    bannerOn = show;
    Shell.banner(show).then(function (r) {
      document.documentElement.style.setProperty('--banner-pad', r.visible && r.height > 0 ? '48px' : '0px');
    });
  }

  // ---- rewarded offers: shown only while an ad is ready (or the player is ad free) ----
  function offerVisible() { return !!(caps.adFree || (caps.rewarded && caps.rewardedReady)); }

  function rewardedButton(placement, adLabel, freeLabel, onGranted, cls) {
    if (!offerVisible()) return null;
    return button(caps.adFree ? freeLabel : adLabel, {
      cls: cls || 'btn ghost wide',
      icon: caps.adFree ? null : 'play-circle',
      onClick: function (e, b) {
        b.disabled = true;
        adBusy = true;
        Shell.rewarded(placement).then(function (r) {
          adBusy = false;
          caps = Shell.caps;
          if (r.granted) {
            breakRewarded = true;
            onGranted(r);
          } else {
            b.disabled = false;
            if (r.reason !== 'notReady') toast(S('rewardNotGiven'));
            refreshOffers();
          }
        });
      }
    });
  }

  var offerRefreshers = [];
  function refreshOffers() { offerRefreshers.forEach(function (fn) { try { fn(); } catch (e) { /* stale */ } }); }

  // ---- interstitials: only through run.mayInterstitial ----
  function maybeInterstitial(placement, run) {
    var ctx = {
      placement: placement,
      mode: game ? game.mode : 'run',
      finishedBoards: progress.stats.boardsFinished,
      winsSinceAd: progress.ads.winsSinceAd,
      runWins: run.wins,
      boardsReached: run.index + 1,
      rewardedInBreak: breakRewarded || (game && game.rewarded),
      adFree: !!caps.adFree
    };
    if (!runlib.mayInterstitial(ctx)) return Promise.resolve(false);
    adBusy = true;
    return Shell.interstitial(placement).then(function (r) {
      adBusy = false;
      if (r.shown) {
        progress.ads.winsSinceAd = 0;
        persist();
      }
      return r.shown;
    });
  }

  // ---- screens ----
  function clearScreen() {
    while (el.screen.firstChild) el.screen.removeChild(el.screen.firstChild);
    offerRefreshers = [];
  }

  function showScreen(name) {
    showLoader(false);
    closeSheet();
    screen = name;
    game = name === 'play' ? game : null;
    el.hud.hidden = true;
    el.tray.hidden = true;
    el.screen.hidden = false;
    el.stage.style.visibility = 'hidden';
    view.show = false;
    view.interactive = false;
    view.setHint(-1);
    view.request();
    setBanner(true);
    clearScreen();
    ({ home: renderHome, eras: renderEras, museum: renderMuseum, settings: renderSettings, archive: renderArchive })[name]();
    el.screen.scrollTop = 0;
  }

  function topbar(title) {
    var bar = h('div', 'topbar');
    bar.appendChild(button(null, { cls: 'icon-btn', icon: 'caret-left', aria: S('back'), onClick: function () { showScreen('home'); } }));
    bar.appendChild(h('h2', null, title));
    bar.appendChild(h('span'));
    return bar;
  }

  function emblem() {
    var c = h('canvas', 'emblem');
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var size = 124;
    c.width = size * dpr;
    c.height = size * dpr;
    var g = c.getContext('2d');
    g.scale(dpr, dpr);
    art.drawCached(g, 'shah', RIVAL, 78, 44, 30, dpr);
    art.drawCached(g, 'faras', PLAYER, 50, 74, 40, dpr);
    return c;
  }

  function runPips(run, light) {
    var box = h('div', 'pips');
    for (var i = 0; i < runlib.RUN_LENGTH; i++) {
      var p = h('span', 'pip');
      if (i < run.wins) p.classList.add('won');
      else if (i === run.index && !light) p.classList.add('now');
      box.appendChild(p);
    }
    return box;
  }

  function dailyMarks(results) {
    var box = h('div', 'marks');
    for (var i = 0; i < 5; i++) {
      var r = results[i];
      var m = h('span', 'mark');
      if (r) m.classList.add(!r.won ? 'lost' : r.moves <= r.par ? 'par' : 'over');
      box.appendChild(m);
    }
    return box;
  }

  function currentStreak() {
    var today = daily.dayNumber();
    var s = progress.streak;
    return s.lastDay === today || s.lastDay === today - 1 ? s.count : 0;
  }

  function renderHome() {
    var col = h('div', 'col home');
    var head = h('div', 'home-head');
    var titles = h('div');
    titles.appendChild(h('h1', null, S('title')));
    titles.appendChild(h('p', 'tagline', S('tagline')));
    head.appendChild(titles);
    head.appendChild(emblem());
    col.appendChild(head);

    var run = progress.run;
    if (run) {
      var cont = h('button', 'card-btn primary');
      cont.type = 'button';
      var t = h('div');
      t.appendChild(h('div', 'title', S('continueRun')));
      t.appendChild(h('div', 'meta', S('eraBoard', S('era_' + run.era), run.phase === 'draft' ? run.wins + 1 : run.index + 1, 8)));
      cont.appendChild(t);
      cont.appendChild(runPips(run, true));
      cont.addEventListener('click', function () { if (!adBusy) { sfx('tap'); continueRun(); } });
      col.appendChild(cont);
      col.appendChild(button(S('newRun'), { cls: 'btn ghost wide', onClick: confirmNewRun }));
    } else {
      var play = h('button', 'card-btn primary');
      play.type = 'button';
      var pt = h('div');
      pt.appendChild(h('div', 'title', progress.stats.runs ? S('newRun') : S('play')));
      pt.appendChild(h('div', 'meta', S('era_shatranj') + (progress.eras.madqueen ? ', ' + S('era_madqueen') : '')));
      play.appendChild(pt);
      play.appendChild(icons.icon('play'));
      play.addEventListener('click', function () { if (!adBusy) { sfx('tap'); newRunPressed(); } });
      col.appendChild(play);
    }

    var today = daily.dayNumber();
    var log = progress.dailyLog[today];
    var d = progress.daily && progress.daily.day === today && !progress.daily.archive ? progress.daily : null;
    var dailyBtn = h('button', 'card-btn');
    dailyBtn.type = 'button';
    var dt = h('div');
    dt.appendChild(h('div', 'title', S('dailyNumber', today)));
    dt.appendChild(h('div', 'meta', log && log.done ? S('dailyDone', log.won) : d && !d.done ? S('dailyGoing', d.index + 1) :
      S('army_' + daily.entry(today).army.id)));
    dailyBtn.appendChild(dt);
    dailyBtn.appendChild(dailyMarks(log && log.done ? log.results : d ? d.results : []));
    dailyBtn.addEventListener('click', function () { if (!adBusy) { sfx('tap'); openDaily(); } });
    col.appendChild(dailyBtn);

    var tiles = h('div', 'tiles');
    tiles.appendChild(tile('book-open', S('museum'), function () { showScreen('museum'); }));
    if (caps.adFree || caps.rewarded) tiles.appendChild(tile('calendar-blank', S('archive'), function () { showScreen('archive'); }));
    tiles.appendChild(tile('gear', S('settings'), function () { showScreen('settings'); }));
    if (tiles.children.length === 2) tiles.style.gridTemplateColumns = 'repeat(2, 1fr)';
    col.appendChild(tiles);

    var stats = h('div', 'statline');
    var st = h('span');
    st.appendChild(icons.icon('flame'));
    st.appendChild(h('span', null, S('streak', currentStreak())));
    stats.appendChild(st);
    var best = Math.max(progress.stats.bestRun.shatranj, progress.stats.bestRun.madqueen);
    var bt = h('span');
    bt.appendChild(icons.icon('trophy'));
    bt.appendChild(h('span', null, S('bestRun', best)));
    stats.appendChild(bt);
    col.appendChild(stats);

    var buy = purchaseRow();
    if (buy) col.appendChild(buy);
    el.screen.appendChild(col);
  }

  function tile(icon, label, onClick) {
    var t = h('button', 'tile');
    t.type = 'button';
    t.appendChild(icons.icon(icon));
    t.appendChild(h('span', null, label));
    t.addEventListener('click', function () { if (!adBusy) { sfx('tap'); onClick(); } });
    return t;
  }

  /** Remove ads and archive, with Restore beside it: only while the shell sells it. */
  function purchaseRow() {
    if (!caps.removeAds) return null;
    var row = h('div', 'buyrow');
    if (!caps.adFree) {
      row.appendChild(button(caps.removeAdsPrice ? S('removeAdsPrice', caps.removeAdsPrice) : S('removeAds'), {
        cls: 'btn ghost small', icon: 'shopping-bag', onClick: function (e, b) { buy(b); }
      }));
    }
    row.appendChild(button(S('restore'), { cls: 'btn small', onClick: function (e, b) { restore(b); } }));
    row.lastChild.classList.add('link');
    row.lastChild.style.border = '0';
    return row;
  }

  function buy(b) {
    b.disabled = true;
    adBusy = true;
    Shell.buyRemoveAds().then(function (r) {
      adBusy = false;
      b.disabled = false;
      caps = Shell.caps;
      var key = 'buy_' + r.reason;
      toast(P.strings.table[key] ? S(key) : S('buy_failed'));
      rerender();
    });
  }

  function restore(b) {
    b.disabled = true;
    Shell.restore().then(function (r) {
      b.disabled = false;
      caps = Shell.caps;
      toast(r.ok ? (r.adFree ? S('restore_ok') : S('restore_none')) : S('restore_failed'));
      rerender();
    });
  }

  function rerender() {
    if (screen !== 'play' && !sheetName) showScreen(screen);
    refreshOffers();
  }

  /** New run while a run is in progress ends that run: ask once, so a stray tap never costs a run. */
  function confirmNewRun() {
    openSheet('confirmNew', function (box) {
      var head = h('div', 'head center');
      head.appendChild(h('h2', null, S('newRun')));
      head.appendChild(h('div', 'meta', S('newRunEnds')));
      box.appendChild(head);
      var actions = h('div', 'actions');
      actions.appendChild(button(S('newRun'), { cls: 'btn primary wide', onClick: function () { closeSheet(); newRunPressed(); } }));
      actions.appendChild(button(S('back'), { cls: 'btn ghost wide', onClick: closeSheet }));
      box.appendChild(actions);
    }, closeSheet);
  }

  function newRunPressed() {
    if (progress.eras.madqueen) showScreen('eras');
    else startRun('shatranj');
  }

  function renderEras() {
    var col = h('div', 'col');
    col.appendChild(topbar(S('chooseEra')));
    eras.ERA_ORDER.forEach(function (id) {
      var locked = id === 'madqueen' && !progress.eras.madqueen;
      var card = h('button', 'card-btn era-card' + (locked ? ' locked' : ''));
      card.type = 'button';
      var t = h('div');
      t.appendChild(h('div', 'title', S('era_' + id)));
      t.appendChild(h('div', 'meta', locked ? S('era2Locked') : S('eraPlace_' + id)));
      var stars = h('div', 'stars');
      progress.mastery[id].forEach(function (on, i) {
        var s = star(on);
        s.setAttribute('aria-label', S('mastery' + i));
        stars.appendChild(s);
      });
      t.appendChild(stars);
      card.appendChild(t);
      var discs = h('div', 'discs');
      if (locked) discs.appendChild(icons.icon('lock-simple'));
      else eras.ERAS[id].army.forEach(function (type) { discs.appendChild(discEl(type, PLAYER, 15)); });
      card.appendChild(discs);
      if (locked) card.disabled = true;
      card.addEventListener('click', function () { if (!locked && !adBusy) { sfx('tap'); startRun(id); } });
      col.appendChild(card);
    });
    el.screen.appendChild(col);
  }

  function museumType(id) { return COMPOUND_TYPES[id] || id; }
  function museumPin(id) {
    if (pieces.BASE[id]) return pieces.BASE[id].pin;
    var named = pieces.NAMED[museumType(id)];
    return named ? named.pin : null;
  }

  function renderMuseum() {
    var col = h('div', 'col');
    col.appendChild(topbar(S('museum')));
    var grid = h('div', 'museum');
    MUSEUM.forEach(function (id) {
      var found = progress.seen.indexOf(id) >= 0;
      var b = h('button', 'exhibit');
      b.type = 'button';
      if (found) b.appendChild(discEl(museumType(id), id === 'shah' ? RIVAL : PLAYER, 23));
      else b.appendChild(h('span', 'blank'));
      b.appendChild(h('span', null, found ? S('piece_' + id) : ''));
      b.setAttribute('aria-label', found ? S('piece_' + id) : S('museumLocked'));
      b.addEventListener('click', function () { if (found) { sfx('tap'); showExhibit(id); } });
      grid.appendChild(b);
    });
    col.appendChild(grid);
    el.screen.appendChild(col);
  }

  function showExhibit(id) {
    openSheet('exhibit', function (box) {
      var top = h('div', 'detail-top');
      top.appendChild(discEl(museumType(id), id === 'shah' ? RIVAL : PLAYER, 46));
      var t = h('div', 'head');
      t.appendChild(h('h2', null, S('piece_' + id)));
      t.appendChild(h('div', 'meta', S('gloss_' + id)));
      t.appendChild(h('div', 'meta', S('place_' + id)));
      top.appendChild(t);
      box.appendChild(top);
      var mapbox = h('div', 'mapbox');
      var map = h('canvas');
      mapbox.appendChild(map);
      box.appendChild(mapbox);
      box.appendChild(h('p', null, S('history_' + id)));
      if (id === 'gin') box.appendChild(h('p', 'meta', S('sameMoveAs', S('piece_khon'))));
      box.appendChild(button(S('back'), { cls: 'btn ghost wide', onClick: closeSheet }));
      requestAnimationFrame(function () {
        var others = MUSEUM.filter(function (m) { return progress.seen.indexOf(m) >= 0 && m !== id; }).map(museumPin).filter(Boolean);
        art.drawMap(map, museumPin(id), others);
      });
    }, closeSheet);
  }

  function renderSettings() {
    var col = h('div', 'col');
    col.appendChild(topbar(S('settings')));
    var rows = h('div', 'rows');
    rows.appendChild(switchRow(S('sound'), progress.settings.sound, function (on) {
      progress.settings.sound = on;
      audio.setMuted(!on);
      persist();
    }));
    rows.appendChild(switchRow(S('haptics'), progress.settings.haptics, function (on) {
      progress.settings.haptics = on;
      persist();
      if (on) buzz('light');
    }));
    rows.appendChild(switchRow(S('reducedMotion'), progress.settings.motion === 'reduced', function (on) {
      progress.settings.motion = on ? 'reduced' : 'auto';
      applyMotion();
      persist();
    }));
    col.appendChild(rows);
    var actions = h('div', 'actions');
    actions.style.display = 'grid';
    actions.style.gap = '10px';
    actions.appendChild(button(S('replayTutorial'), { cls: 'btn ghost wide', onClick: function () {
      progress.tutorialDone = false;
      persist();
      toast(S('replayTutorial'));
    } }));
    // Privacy options: only while the consent framework asks for an entry (caps.privacyOptions).
    if (caps.privacyOptions) {
      actions.appendChild(button(S('privacyOptions'), { cls: 'btn ghost wide', icon: 'shield-check', onClick: function (e, b) {
        b.disabled = true;
        Shell.privacyOptions().then(function () { b.disabled = false; caps = Shell.caps; });
      } }));
    }
    var policy = h('a', 'btn ghost wide');
    policy.href = POLICY_URL;
    policy.target = '_blank';
    policy.rel = 'noopener';
    policy.style.textDecoration = 'none';
    policy.appendChild(icons.icon('arrow-square-out'));
    policy.appendChild(h('span', null, S('privacyPolicy')));
    actions.appendChild(policy);
    col.appendChild(actions);
    if (caps.removeAds) {
      if (!caps.adFree) col.appendChild(h('p', 'meta', S('removeAdsWhat')));
      col.appendChild(purchaseRow());
    }
    col.appendChild(h('p', 'meta center', S('version', VERSION)));
    el.screen.appendChild(col);
  }

  function switchRow(label, on, onChange) {
    var row = h('div', 'row');
    row.appendChild(h('span', null, label));
    var sw = h('button', 'switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    sw.setAttribute('aria-label', label);
    sw.addEventListener('click', function () {
      var next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', next ? 'true' : 'false');
      onChange(next);
      sfx('tap');
    });
    row.appendChild(sw);
    return row;
  }

  // ---- archive (past Dailies): for owners of Remove ads and archive, or one rewarded ad each, 3 a day ----
  function archiveUsed() {
    var key = daily.dateKey();
    if (progress.archive.date !== key) { progress.archive = { date: key, used: 0 }; }
    return progress.archive.used;
  }

  function renderArchive() {
    var col = h('div', 'col');
    col.appendChild(topbar(S('archive')));
    if (!caps.adFree) col.appendChild(h('p', 'meta', runlib.mayOffer('archive', { archiveUsed: archiveUsed() }) ? S('archiveLeft', 3 - archiveUsed()) : S('archiveNone')));
    var list = h('div', 'days');
    var today = daily.dayNumber();
    for (var day = today - 1; day >= Math.max(1, today - 60); day--) list.appendChild(archiveRow(day));
    if (today <= 1) list.appendChild(h('p', 'meta', S('comeBack')));
    col.appendChild(list);
    el.screen.appendChild(col);
  }

  function archiveRow(day) {
    var log = progress.dailyLog[day];
    var row = h('button', 'card-btn day');
    row.type = 'button';
    row.appendChild(h('span', 'num', '#' + day));
    row.appendChild(h('span', 'meta', S('army_' + daily.entry(day).army.id)));
    row.appendChild(dailyMarks(log && log.done ? log.results : []));
    row.addEventListener('click', function () { if (!adBusy) { sfx('tap'); openArchiveDay(day); } });
    return row;
  }

  function openArchiveDay(day) {
    openSheet('archiveDay', function (box) {
      var e = daily.entry(day);
      var head = h('div', 'head center');
      head.appendChild(h('h2', null, S('dailyArchived', day)));
      head.appendChild(h('div', 'meta', S('army_' + e.army.id)));
      box.appendChild(head);
      var army = h('div', 'armyrow');
      e.army.army.forEach(function (t) { army.appendChild(discEl(t, PLAYER, 20)); });
      box.appendChild(army);
      var actions = h('div', 'actions');
      function fill() {
        while (actions.firstChild) actions.removeChild(actions.firstChild);
        var going = progress.archivePlay && progress.archivePlay.day === day && !progress.archivePlay.done;
        if (going) {
          // Already opened (an ad watched, or ad free): carry on where it stopped, with no new ad.
          actions.appendChild(button(S('continueRun'), { cls: 'btn primary wide', icon: 'play', onClick: function () { playDailyBoard(true); } }));
        } else if (caps.adFree) {
          actions.appendChild(button(S('freeArchive'), { cls: 'btn primary wide', onClick: function () { startDaily(day, true); } }));
        } else if (runlib.mayOffer('archive', { archiveUsed: archiveUsed() })) {
          var b = rewardedButton('archive_day', S('adArchive'), S('freeArchive'), function () {
            archiveUsed();
            progress.archive.used++;
            persist();
            startDaily(day, true);
          }, 'btn ghost wide');
          if (b) actions.appendChild(b);
          actions.appendChild(h('p', 'meta center', S('archiveLeft', 3 - archiveUsed())));
        } else {
          actions.appendChild(h('p', 'meta center', S('archiveNone')));
        }
        actions.appendChild(button(S('back'), { cls: 'btn ghost wide', onClick: closeSheet }));
      }
      fill();
      offerRefreshers.push(fill);
      box.appendChild(actions);
    }, closeSheet);
  }

  // ---- sheets ----
  function openSheet(name, build, onBack) {
    sheetName = name;
    sheetBack = onBack || null;
    while (el.sheet.firstChild) el.sheet.removeChild(el.sheet.firstChild);
    el.sheet.setAttribute('data-sheet', name);
    build(el.sheet);
    el.sheetWrap.hidden = false;
    el.sheet.scrollTop = 0;
    view.dim = screen === 'play' ? 1 : 0;
    view.interactive = false;
    view.request();
    var focus = el.sheet.querySelector('button');
    if (focus && focus.focus) focus.focus({ preventScroll: true });
  }

  function closeSheet() {
    if (!sheetName) return;
    sheetName = null;
    sheetBack = null;
    el.sheetWrap.hidden = true;
    view.dim = 0;
    if (screen === 'play' && game && !game.over && !game.busy) view.interactive = true;
    view.request();
  }

  // ---- the board ----
  function insets() {
    var i = caps.insets || { top: 0, right: 0, bottom: 0, left: 0 };
    return i;
  }

  function boardRect() {
    var W = game.def.W;
    var ins = insets();
    var top = ins.top + 8 + 56 + 18;
    var bottom = window.innerHeight - ins.bottom - 10 - 56 - 14;
    var side = Math.max(40, Math.max(ins.left, ins.right) + 24);
    var avail = Math.min(window.innerWidth - side * 2, bottom - top, 560);
    var cell = Math.max(24, Math.floor(avail / W));
    var size = cell * W;
    return {
      x: Math.round((window.innerWidth - size) / 2),
      y: Math.round(top + Math.max(0, (bottom - top - size) / 2)),
      size: size,
      cell: cell
    };
  }

  function enterPlay() {
    closeSheet();
    screen = 'play';
    el.screen.hidden = true;
    el.stage.style.visibility = '';
    el.hud.hidden = false;
    el.tray.hidden = false;
    view.show = true;
    setBanner(false);
  }

  function markSeen(types) {
    var changed = false;
    types.forEach(function (t) {
      var id = pieces.namedId(t);
      if (id && progress.seen.indexOf(id) < 0) { progress.seen.push(id); changed = true; }
    });
    return changed;
  }

  /** Starts (or resumes, with saved moves) a board. mode: 'run', 'daily' or 'archive'. */
  function startBoard(mode, def, savedMoves) {
    var pos = rules.createPosition(def);
    game = {
      mode: mode, def: def, pos: pos, moves: [], busy: false, over: false, fallen: [], rewarded: false,
      startCount: pos.counts[PLAYER], tutorial: null
    };
    // Replays a saved board, stopping at the first move that is not legal there (a damaged save) and
    // before the move limit or a finished board, so a resume is always a playable position.
    var saved = savedMoves || [];
    for (var i = 0; i < saved.length; i++) {
      var mv = saved[i];
      var side = i % 2 ? RIVAL : PLAYER;
      if (pos.kingSq < 0 || !pos.counts[PLAYER] || (side === PLAYER && Math.ceil((i + 1) / 2) >= def.limit)) break;
      var legal = rules.moves(pos, side);
      if (mv < 0 ? side === PLAYER || legal.length : legal.indexOf(mv) < 0) break;
      game.moves.push(mv);
      if (mv < 0) continue;
      var to = mv & 63;
      if (pos.owner[to] === PLAYER) game.fallen.push({ at: game.moves.length, type: pos.types[pos.kind[to]] });
      rules.doMove(pos, mv);
    }
    // Saved between the player's move and the rival's answer: the player plays that move again.
    if (game.moves.length % 2) {
      game.moves.pop();
      rules.undoMove(pos);
    }
    if (mode === 'run') {
      game.rewarded = !!progress.run.rewardedOnBoard;
      game.tookBack = !!progress.run.boardTookBack;
    }
    markSeen(def.pieces.map(function (p) { return p[1]; }));
    breakRewarded = false;
    enterPlay();
    view.layout(boardRect());
    var last = game.moves.length >= 2 ? game.moves[game.moves.length - 1] : -1;
    view.setPosition(pos, { enter: !savedMoves || !savedMoves.length, lastRival: last >= 0 ? { from: last >> 6, to: last & 63 } : null });
    view.interactive = true;
    if (mode === 'run' && !progress.tutorialDone && progress.run.index === 0 && def.line && def.line.length && !game.moves.length) {
      game.tutorial = { step: 0 };
    }
    updateHud();
    updateTray();
    updateHint();
    persistGame();
    persist();
  }

  function movesUsed() { return Math.ceil(game.moves.length / 2); }

  function persistGame() {
    // Only a board in progress is saved here: a finished board's moves (under the draft, lost or next
    // sheet) must never overwrite the run's phase or the next Daily board's moves.
    if (!game || game.over || !game.def) return;
    if (game.mode === 'run' && progress.run) {
      progress.run.board = game.def;
      progress.run.moves = game.moves.slice();
      progress.run.phase = 'board';
    } else if (dslot(game.mode === 'archive') && (game.mode === 'daily' || game.mode === 'archive')) {
      dslot(game.mode === 'archive').moves = game.moves.slice();
    }
    persist();
  }

  function updateHud() {
    if (!game) return;
    while (el.pips.firstChild) el.pips.removeChild(el.pips.firstChild);
    if (game.mode === 'run') {
      var run = progress.run;
      for (var i = 0; i < runlib.RUN_LENGTH; i++) {
        var p = h('span', 'pip');
        if (i < run.wins) p.classList.add('won');
        else if (i === run.index) p.classList.add('now');
        el.pips.appendChild(p);
      }
    } else {
      var d = dslot(game.mode === 'archive');
      for (var k = 0; k < 5; k++) {
        var q = h('span', 'pip');
        var r = d.results[k];
        if (r) q.classList.add(r.won ? 'won' : 'lost');
        else if (k === d.index) q.classList.add('now');
        el.pips.appendChild(q);
      }
    }
    var used = movesUsed();
    var left = game.def.limit - used;
    el.movesNum.textContent = String(Math.max(0, left));
    el.movesNum.classList.toggle('low', left <= 1);
    el.moves.setAttribute('aria-label', S('movesLeft') + ' ' + left + ', ' + S('par', game.def.par));
    while (el.movesTrack.firstChild) el.movesTrack.removeChild(el.movesTrack.firstChild);
    for (var t = 0; t < game.def.limit; t++) {
      var tick = h('span', 'tick' + (t >= game.def.par ? ' slack' : '') + (t < used ? ' used' : ''));
      el.movesTrack.appendChild(tick);
    }
  }
  el.moves = $('moves');

  function updateTray() {
    while (el.fallen.firstChild) el.fallen.removeChild(el.fallen.firstChild);
    while (el.trayAction.firstChild) el.trayAction.removeChild(el.trayAction.firstChild);
    if (!game) return;
    var gone = (game.mode === 'run' && progress.run ? progress.run.fallen || [] : []).concat(game.fallen.map(function (f) { return f.type; }));
    gone.slice(-8).forEach(function (t) { el.fallen.appendChild(discEl(t, PLAYER, 12)); });
    // No offer while the first board's hint is still teaching the moves.
    if (game.mode === 'run' && !game.over && !game.busy && !game.tutorial) {
      var run = progress.run;
      if (runlib.mayOffer('takeBack', { mode: 'run', run: run, movesMade: game.moves.length >= 2 ? 1 : 0, boardTookBack: game.tookBack })) {
        var b = rewardedButton('take_back', S('adTakeBack'), S('freeTakeBack'), takeBack, 'btn ghost small');
        if (b) el.trayAction.appendChild(b);
      }
    }
  }

  function takeBack() {
    var run = progress.run;
    run.flags.takeBacks++;
    run.boardTookBack = true;
    run.rewardedOnBoard = true;
    game.tookBack = true;
    game.rewarded = true;
    var keep = game.moves.slice(0, Math.max(0, game.moves.length - 2));
    var def = game.def;
    var pos = rules.createPosition(def);
    var fallen = [];
    var moves = [];
    keep.forEach(function (mv) {
      moves.push(mv);
      if (mv < 0) return;
      var to = mv & 63;
      if (pos.owner[to] === PLAYER) fallen.push({ at: moves.length, type: pos.types[pos.kind[to]] });
      rules.doMove(pos, mv);
    });
    game.pos = pos;
    game.moves = moves;
    game.fallen = fallen;
    var last = moves.length >= 2 ? moves[moves.length - 1] : -1;
    view.setPosition(pos, { lastRival: last >= 0 ? { from: last >> 6, to: last & 63 } : null });
    view.interactive = true;
    sfx('promote');
    persistGame();
    updateHud();
    updateTray();
  }

  view.onMove = function (mv, dragged) { onPlayerMove(mv, dragged); };
  view.onSelect = function () { updateHint(); };
  view.onIllegal = function () { sfx('illegal'); buzz('error'); };

  function updateHint() {
    if (!game || !game.tutorial || game.over) { view.setHint(-1); return; }
    var mv = game.def.line[game.tutorial.step];
    if (mv == null) { view.setHint(-1); return; }
    var from = mv >> 6;
    if (view.selected === from) view.setHint(mv & 63, 'to');
    else view.setHint(game.busy ? -1 : from, 'from');
  }

  function onPlayerMove(mv, dragged) {
    if (!game || game.busy || game.over || sheetName || adBusy) return;
    game.busy = true;
    view.interactive = false;
    var to = mv & 63;
    var king = to === game.pos.kingSq;
    var capture = game.pos.owner[to] === RIVAL;
    if (game.tutorial) {
      if (game.def.line[game.tutorial.step] === mv) game.tutorial.step++;
      else game.tutorial = null;
    }
    rules.doMove(game.pos, mv);
    game.moves.push(mv);
    view.setHint(-1);
    sfx(capture ? 'capture' : 'move');
    buzz(capture ? 'medium' : 'tap');
    updateHud();
    updateTray();
    view.animateMove(mv, PLAYER, { dragged: dragged, king: king }).then(function () {
      if (king) { boardWon(to); return; }
      if (movesUsed() >= game.def.limit) { boardLost(); return; }
      setTimeout(rivalTurn, view.reduced ? 120 : 260);
    });
  }

  function rivalTurn() {
    if (!game || game.over) return;
    var r = ai.move(game.pos);
    game.moves.push(r);
    if (r < 0) { afterRival(); return; }
    var to = r & 63;
    var capture = game.pos.owner[to] === PLAYER;
    if (capture) game.fallen.push({ at: game.moves.length, type: game.pos.types[game.pos.kind[to]] });
    rules.doMove(game.pos, r);
    sfx(capture ? 'capture' : 'rival');
    if (capture) buzz('heavy');
    view.animateMove(r, RIVAL, {}).then(afterRival);
  }

  function afterRival() {
    if (!game) return;
    persistGame();
    updateHud();
    if (!game.pos.counts[PLAYER] || !rules.moves(game.pos, PLAYER).length) { boardLost(); return; }
    game.busy = false;
    if (!sheetName) view.interactive = true;
    updateTray();
    updateHint();
  }

  function playerTypes(pos) {
    var out = [];
    for (var sq = 0; sq < pos.N; sq++) if (pos.owner[sq] === PLAYER) out.push(pos.types[pos.kind[sq]]);
    return out;
  }

  function boardWon(kingSq) {
    game.over = true;
    game.busy = true;
    view.interactive = false;
    sfx('king');
    buzz('success');
    progress.stats.boardsFinished++;
    progress.stats.boardsWon++;
    var survivors = playerTypes(game.pos);
    var used = movesUsed();
    var fall = view.kingFall(kingSq);
    if (game.mode === 'run') runBoardWon(survivors, used, fall);
    else dailyBoardDone(true, survivors, used, fall);
  }

  function boardLost() {
    game.over = true;
    game.busy = true;
    view.interactive = false;
    view.setHint(-1);
    sfx('lost');
    buzz('error');
    progress.stats.boardsFinished++;
    var survivors = playerTypes(game.pos);
    var used = movesUsed();
    var beat = view.lostBeat();
    if (game.mode === 'run') {
      progress.run.phase = 'lost';
      persist();
      updateTray();
      beat.then(showLost);
    } else {
      dailyBoardDone(false, survivors, used, beat);
    }
  }

  // ---- runs ----
  function startRun(eraId) {
    var seed = rng.hash(Date.now() | 0, progress.stats.runs, (Math.random() * 0x7fffffff) | 0);
    var run = runlib.newRun(eraId, seed);
    run.fallen = [];
    run.newUnlocks = [];
    var list = P.starters[eraId];
    var def = codec.decode(list[seed % list.length], eras.ERAS[eraId].promo);
    run.board = def;
    run.moves = [];
    run.phase = 'board';
    progress.run = run;
    genclient.clear();
    persist();
    startBoard('run', def, []);
  }

  function continueRun() {
    var run = progress.run;
    run.fallen = run.fallen || [];
    run.newUnlocks = run.newUnlocks || [];
    if (run.phase === 'draft' && run.draftOptions && run.draftOptions.length) {
      prefetch(run, run.draftOptions);
      screen = 'play';
      el.screen.hidden = true;
      setBanner(true);
      showDraft();
    } else if (run.phase === 'lost' && run.board) {
      screen = 'play';
      game = { mode: 'run', def: run.board, pos: rules.createPosition(run.board), moves: [], over: true, busy: true, fallen: [], rewarded: !!run.rewardedOnBoard };
      el.screen.hidden = true;
      showLost();
    } else if (run.board) {
      startBoard('run', run.board, run.moves || []);
    } else {
      loadRunBoard(run);
    }
  }

  function draftSeed(run) { return rng.seed('draft', run.seed, run.index); }

  function requestBoard(run, army, index) {
    var spec = gen.runSpec(run.era, index);
    return genclient.request(spec, army, gen.boardSeed(run.seed, index, army));
  }

  function prefetch(run, options) {
    options.forEach(function (o) { requestBoard(run, draft.apply(run.army, o), run.index + 1); });
  }

  function runBoardWon(survivors, used, fall) {
    var run = progress.run;
    var lost = game.fallen.length;
    run.fallen = (run.fallen || []).concat(game.fallen.map(function (f) { return f.type; }));
    runlib.recordWin(run, { survivors: survivors, lost: lost, moves: used, par: game.def.par });
    updateHud();
    progress.stats.eraWins[run.era]++;
    progress.stats.bestRun[run.era] = Math.max(progress.stats.bestRun[run.era], run.wins);
    progress.ads.winsSinceAd++;
    var un = runlib.unlocksAfterWin(progress, run.era, run.wins);
    run.newUnlocks = run.newUnlocks || [];
    un.pieces.forEach(function (p) {
      progress.unlocked.push(p);
      run.newUnlocks.push(p);
      if (progress.seen.indexOf(p) < 0) progress.seen.push(p);
    });
    if (un.era) { progress.eras.madqueen = true; run.eraUnlocked = true; }
    if (!progress.tutorialDone) progress.tutorialDone = true;
    run.rewardedOnBoard = false;
    run.boardTookBack = false;
    if (runlib.isComplete(run)) {
      run.phase = 'over';
      persist();
      fall.then(function () { finishRun('complete'); });
      return;
    }
    run.draftOptions = draft.options(run.era, run.army, progress.unlocked, draftSeed(run), 3);
    run.phase = 'draft';
    run.board = null;
    run.moves = [];
    persist();
    prefetch(run, run.draftOptions);
    var rewardedHere = game.rewarded;
    fall.then(function () {
      breakRewarded = rewardedHere;
      return maybeInterstitial('board_break', run);
    }).then(function () {
      setBanner(true);
      showDraft();
    });
  }

  function optionCard(o, index, selectedRef, takeBtn) {
    var card = h('button', 'option');
    card.type = 'button';
    var type = o.kind === 'piece' ? o.type : o.kind === 'promote' ? o.to : o.result;
    card.appendChild(discEl(type, PLAYER, 32));
    var id = pieces.namedId(type);
    var name = id ? S('piece_' + id) : pieces.parts(type).map(function (p) { return S('piece_' + p); }).join(' + ');
    card.appendChild(h('span', 'name', name));
    card.appendChild(h('span', 'kind', S(o.kind === 'piece' ? 'draftPiece' : o.kind === 'promote' ? 'draftPromote' : 'draftFuse')));
    if (o.kind !== 'piece') {
      var parts = h('span', 'parts');
      if (o.kind === 'promote') {
        parts.appendChild(discEl(o.from, PLAYER, 9));
        parts.appendChild(icons.icon('arrow-right', 'tiny'));
      } else {
        parts.appendChild(discEl(o.a, PLAYER, 9));
        parts.appendChild(h('span', null, '+'));
        parts.appendChild(discEl(o.b, PLAYER, 9));
      }
      parts.querySelector('.ico') && (parts.querySelector('.ico').style.width = '12px');
      card.appendChild(parts);
    }
    card.addEventListener('click', function () {
      if (adBusy) return;
      sfx('select');
      var prev = selectedRef.card;
      if (prev) prev.classList.remove('on');
      if (prev === card) {
        selectedRef.card = null;
        selectedRef.option = null;
        takeBtn.disabled = true;
        return;
      }
      card.classList.add('on');
      card.classList.remove('hint-ring');
      selectedRef.card = card;
      selectedRef.option = o;
      takeBtn.disabled = false;
    });
    return card;
  }

  function showDraft() {
    var run = progress.run;
    game = game && game.mode === 'run' ? game : { mode: 'run', over: true, busy: true, fallen: [], rewarded: false };
    view.interactive = false;
    sfx('chime');
    openSheet('draft', function (box) {
      var head = h('div', 'head center');
      head.appendChild(h('h2', null, S('draftTitle')));
      head.appendChild(h('div', 'meta', S('eraBoard', S('era_' + run.era), run.wins + 1, 8)));
      box.appendChild(head);
      var selected = { card: null, option: null };
      var take = button(S('take'), { cls: 'btn primary wide', onClick: function () { if (selected.option) pickDraft(selected.option); } });
      take.disabled = true;
      var grid = h('div', 'draft' + (run.draftOptions.length > 3 ? ' four' : ''));
      run.draftOptions.forEach(function (o, i) {
        var c = optionCard(o, i, selected, take);
        if (i === 0 && !progress.draftHintDone) c.classList.add('hint-ring');
        grid.appendChild(c);
      });
      box.appendChild(grid);
      var army = h('div', 'armyrow');
      run.army.forEach(function (t) { army.appendChild(discEl(t, PLAYER, 13)); });
      box.appendChild(army);
      var actions = h('div', 'actions');
      box.appendChild(actions);
      function fill() {
        while (actions.firstChild) actions.removeChild(actions.firstChild);
        actions.appendChild(take);
        if (run.draftOptions.length === 3 && runlib.mayOffer('fourth', { mode: 'run', run: run })) {
          var b = rewardedButton('fourth_option', S('adFourth'), S('freeFourth'), function () {
            run.flags.fourth = true;
            run.draftOptions = draft.options(run.era, run.army, progress.unlocked, draftSeed(run), 4);
            prefetch(run, run.draftOptions);
            persist();
            showDraft();
          });
          if (b) actions.appendChild(b);
        }
      }
      fill();
      offerRefreshers.push(fill);
    }, function () { goHome(); });
  }

  function pickDraft(option) {
    var run = progress.run;
    if (!progress.draftHintDone) progress.draftHintDone = true;
    var nextArmy = draft.apply(run.army, option);
    var type = option.kind === 'piece' ? option.type : option.kind === 'promote' ? option.to : option.result;
    run.drafted.push(type);
    if (option.kind === 'fuse') sfx('fuse'); else sfx('promote');
    buzz('light');
    markSeen([type]);
    run.army = nextArmy;
    run.index++;
    run.phase = 'board';
    run.board = null;
    run.moves = [];
    run.draftOptions = null;
    persist();
    loadRunBoard(run);
  }

  function loadRunBoard(run) {
    closeSheet();
    game = null;
    enterPlay();
    el.hud.hidden = true;
    el.tray.hidden = true;
    view.show = false;
    view.request();
    var army = run.army.slice();
    showLoader(true);
    requestBoard(run, army, run.index).then(function (def) {
      // The player went home (Back) while the board was being built, or it already started: stay put.
      if (progress.run !== run || screen !== 'play' || game) return;
      showLoader(false);
      if (!def) { finishRun('spent'); return; }
      run.board = def;
      run.moves = [];
      persist();
      startBoard('run', def, []);
    });
  }

  function showLost() {
    var run = progress.run;
    view.interactive = false;
    openSheet('lost', function (box) {
      var head = h('div', 'head center');
      head.appendChild(h('h2', null, S('boardLost')));
      head.appendChild(h('div', 'meta', S('eraBoard', S('era_' + run.era), run.index + 1, 8)));
      box.appendChild(head);
      box.appendChild(runPips(run, false));
      box.lastChild.style.justifyContent = 'center';
      var army = h('div', 'armyrow');
      run.army.forEach(function (t) { army.appendChild(discEl(t, PLAYER, 15)); });
      box.appendChild(army);
      var actions = h('div', 'actions');
      box.appendChild(actions);
      function fill() {
        while (actions.firstChild) actions.removeChild(actions.firstChild);
        if (runlib.mayOffer('secondWind', { mode: 'run', run: run })) {
          var b = rewardedButton('second_wind', S('adSecondWind'), S('freeSecondWind'), secondWind, 'btn ghost wide');
          if (b) actions.appendChild(b);
        }
        actions.appendChild(button(S('endRun'), { cls: 'btn ghost wide', onClick: function () { finishRun('lost'); } }));
      }
      fill();
      offerRefreshers.push(fill);
    }, function () { goHome(); });
  }

  function secondWind() {
    var run = progress.run;
    run.flags.secondWind = true;
    run.rewardedOnBoard = true;
    run.boardTookBack = false;
    run.phase = 'board';
    run.moves = [];
    persist();
    startBoard('run', run.board, []);
    game.rewarded = true;
  }

  function finishRun(how) {
    var run = progress.run;
    if (!run) return goHome();
    if (how !== 'complete' && game && game.def) {
      runlib.recordLoss(run, { moves: game.moves ? Math.ceil(game.moves.length / 2) : 0, par: game.def.par, lost: game.fallen ? game.fallen.length : 0 });
    }
    var stars = runlib.masteryOf(run);
    var before = progress.mastery[run.era].slice();
    var firstMastery = !progress.mastery.shatranj[0] && !progress.mastery.madqueen[0] && stars[0];
    progress.mastery[run.era] = before.map(function (b, i) { return b || stars[i]; });
    progress.stats.runs++;
    var summary = {
      era: run.era, wins: run.wins, index: run.index, army: run.army.slice(), how: how,
      stars: stars, newStars: stars.map(function (s, i) { return s && !before[i]; }),
      unlocks: (run.newUnlocks || []).slice(), eraUnlocked: !!run.eraUnlocked, firstMastery: firstMastery
    };
    progress.run = null;
    persist();
    var mode = game ? game.mode : 'run';
    game = game || { mode: 'run' };
    game.mode = mode;
    // A run that reached board 4 may meet an ad here (run.mayInterstitial decides); a quick loss never does.
    maybeInterstitial('run_end', run).then(function () {
      showSummary(summary);
    });
  }

  function showSummary(sum) {
    screen = 'play';
    el.screen.hidden = true;
    el.hud.hidden = true;
    el.tray.hidden = true;
    setBanner(true);
    openSheet('summary', function (box) {
      var head = h('div', 'head center');
      head.appendChild(h('h2', null, sum.how === 'complete' ? S('runComplete') : sum.how === 'spent' ? S('runOver') : S('runOver')));
      head.appendChild(h('div', 'meta', S('eraCleared', S('era_' + sum.era), sum.wins)));
      box.appendChild(head);
      if (sum.how === 'spent') box.appendChild(h('p', 'center', S('armySpent')));
      var pips = runPips({ wins: sum.wins, index: -1 }, true);
      pips.style.justifyContent = 'center';
      box.appendChild(pips);
      var stars = h('div', 'stars');
      stars.style.justifyContent = 'center';
      sum.stars.forEach(function (on, i) {
        var s = star(on);
        s.setAttribute('aria-label', S('mastery' + i));
        stars.appendChild(s);
      });
      box.appendChild(stars);
      var army = h('div', 'armyrow');
      sum.army.forEach(function (t) { army.appendChild(discEl(t, PLAYER, 15)); });
      box.appendChild(army);
      if (sum.unlocks.length) {
        box.appendChild(h('h3', null, S('newPieces')));
        sum.unlocks.forEach(function (p) {
          var n = h('div', 'notice');
          n.appendChild(discEl(p, PLAYER, 16));
          var t = h('div');
          t.appendChild(h('div', null, S('piece_' + p)));
          t.appendChild(h('div', 'meta', S('place_' + p)));
          n.appendChild(t);
          box.appendChild(n);
        });
      }
      if (sum.eraUnlocked) {
        var n2 = h('div', 'notice');
        n2.appendChild(discEl('queen', PLAYER, 16));
        n2.appendChild(h('div', null, S('era2Open')));
        box.appendChild(n2);
      }
      var actions = h('div', 'actions');
      actions.appendChild(button(S('newRun'), { cls: 'btn primary wide', onClick: function () {
        closeSheet();
        if (progress.eras.madqueen) showScreen('eras'); else startRun('shatranj');
      } }));
      actions.appendChild(button(S('home'), { cls: 'btn ghost wide', onClick: goHome }));
      box.appendChild(actions);
      // Remove ads and archive, on its own once: after the first era mastery star, never during a board.
      if (sum.firstMastery && caps.removeAds && !caps.adFree && !progress.removeAdsOffered) {
        progress.removeAdsOffered = true;
        persist();
        var offer = h('div', 'notice');
        offer.style.gridTemplateColumns = '1fr';
        offer.appendChild(h('p', null, S('removeAdsWhat')));
        offer.appendChild(button(caps.removeAdsPrice ? S('removeAdsPrice', caps.removeAdsPrice) : S('removeAds'), {
          cls: 'btn ghost wide', icon: 'shopping-bag', onClick: function (e, b) { buy(b); }
        }));
        offer.appendChild(button(S('notNow'), { cls: 'btn small', onClick: function () { offer.remove(); } }));
        box.appendChild(offer);
      }
    }, goHome);
  }

  function goHome() {
    game = null;
    view.lostTint = 0;
    showScreen('home');
  }

  // ---- the Daily: no ads before, during or after it ----
  function openDaily() {
    var today = daily.dayNumber();
    var log = progress.dailyLog[today];
    if (log && log.done) { showDailyResult(today, false); return; }
    var d = progress.daily;
    if (d && d.day === today && !d.archive && !d.done) { resumeDaily(); return; }
    showDailyIntro(today);
  }

  function showDailyIntro(day) {
    var e = daily.entry(day);
    openSheet('dailyIntro', function (box) {
      var head = h('div', 'head center');
      head.appendChild(h('h2', null, S('dailyNumber', day)));
      head.appendChild(h('div', 'meta', S('army_' + e.army.id)));
      box.appendChild(head);
      var army = h('div', 'armyrow');
      e.army.army.forEach(function (t) { army.appendChild(discEl(t, PLAYER, 22)); });
      box.appendChild(army);
      box.appendChild(h('p', 'center', S('dailyIntro')));
      var actions = h('div', 'actions');
      actions.appendChild(button(S('start'), { cls: 'btn primary wide', onClick: function () { startDaily(day, false); } }));
      actions.appendChild(button(S('back'), { cls: 'btn ghost wide', onClick: closeSheet }));
      box.appendChild(actions);
    }, closeSheet);
  }

  /**
   * Today's Daily and an archive day keep separate slots, so playing a past day never resets (or gives a
   * second try at) today's one scored try, and an archive day in progress survives a restart.
   */
  function dslot(archive) { return archive ? progress.archivePlay : progress.daily; }

  function startDaily(day, archive) {
    var d = { day: day, archive: !!archive, index: 0, results: [], moves: [], done: false };
    if (archive) progress.archivePlay = d; else progress.daily = d;
    persist();
    playDailyBoard(!!archive);
  }

  function resumeDaily() { playDailyBoard(false); }

  function playDailyBoard(archive) {
    var d = dslot(archive === true);
    var e = daily.entry(d.day);
    startBoard(d.archive ? 'archive' : 'daily', e.boards[d.index], d.moves);
  }

  function dailyBoardDone(won, survivors, used, beat) {
    var d = dslot(game.mode === 'archive');
    var def = game.def;
    d.results.push({ won: won, moves: used, par: def.par, survivors: survivors.length, army: game.startCount });
    d.index++;
    d.moves = [];
    if (d.index >= 5) {
      d.done = true;
      var wonCount = d.results.filter(function (r) { return r.won; }).length;
      var existing = progress.dailyLog[d.day];
      // An archive replay never replaces the result of the day as it was played live.
      if (!(d.archive && existing && existing.done && !existing.archive)) {
        progress.dailyLog[d.day] = { done: true, archive: d.archive, won: wonCount, results: d.results.slice() };
      }
      if (!d.archive) {
        var s = progress.streak;
        if (s.lastDay !== d.day) {
          s.count = s.lastDay === d.day - 1 ? s.count + 1 : 1;
          s.lastDay = d.day;
        }
      }
    }
    persist();
    beat.then(function () {
      if (d.done) showDailyResult(d.day, d.archive, d.results.slice());
      else showDailyNext();
    });
  }

  function showDailyNext() {
    var d = dslot(game.mode === 'archive');
    openSheet('dailyNext', function (box) {
      var last = d.results[d.results.length - 1];
      var head = h('div', 'head center');
      head.appendChild(h('h2', null, last.won ? S('boardWon') : S('boardLost')));
      head.appendChild(h('div', 'meta', S('dailyBoardMeta', S(d.archive ? 'dailyArchived' : 'dailyNumber', d.day), d.index + 1)));
      box.appendChild(head);
      var marks = dailyMarks(d.results);
      marks.style.justifyContent = 'center';
      box.appendChild(marks);
      box.appendChild(button(S('next'), { cls: 'btn primary wide', icon: 'arrow-right', onClick: function () { playDailyBoard(d.archive); } }));
    }, function () { goHome(); });
  }

  function showDailyResult(day, archive, own) {
    var stored = progress.dailyLog[day];
    var log = own ? { results: own, won: own.filter(function (r) { return r.won; }).length } : stored;
    var e = daily.entry(day);
    screen = screen === 'play' ? 'play' : screen;
    el.hud.hidden = true;
    el.tray.hidden = true;
    setBanner(true);
    openSheet('dailyResult', function (box) {
      var head = h('div', 'head center');
      head.appendChild(h('h2', null, S(archive ? 'dailyArchived' : 'dailyResult', day)));
      head.appendChild(h('div', 'meta', S('dailyMeta', S('army_' + e.army.id), log.won)));
      box.appendChild(head);
      var rows = h('div', 'results');
      log.results.forEach(function (r, i) {
        var row = h('div', 'result');
        row.appendChild(h('span', 'n', String(i + 1)));
        var m = h('span', 'mark ' + (!r.won ? 'lost' : r.moves <= r.par ? 'par' : 'over'));
        row.appendChild(m);
        row.appendChild(h('span', 'num', r.won ? P.share.versusPar(r) : ''));
        var sv = h('span', 'survivors');
        for (var k = 0; k < (r.army || 5); k++) sv.appendChild(h('span', 'dot' + (k < r.survivors ? '' : ' gone')));
        row.appendChild(sv);
        rows.appendChild(row);
      });
      box.appendChild(rows);
      if (!archive) box.appendChild(h('p', 'meta center', S('streak', currentStreak()) + '. ' + S('comeBack') + '.'));
      var actions = h('div', 'actions');
      // Share: only where the platform can (caps.share), straight from the tap, never rewarded.
      if (typeof Shell.share === 'function' && caps.share) {
        actions.appendChild(button(S('share'), { cls: 'btn primary wide', icon: 'share-network', onClick: function () { shareDaily(day, archive, log.results); } }));
      }
      if (caps.adFree || caps.rewarded) actions.appendChild(button(S('archive'), { cls: 'btn ghost wide', icon: 'calendar-blank', onClick: function () { showScreen('archive'); } }));
      actions.appendChild(button(S('home'), { cls: 'btn ghost wide', onClick: goHome }));
      box.appendChild(actions);
    }, goHome);
  }

  function shareDaily(day, archive, results) {
    var e = daily.entry(day);
    var text = P.share.dailyText(e, results, archive, {
      title: function (d, won, a) { return S(a ? 'shareTitleArchive' : 'shareTitle', d, won); },
      place: function (army) { return S('army_' + army.id); }
    });
    var png = art.shareCard(e, results, archive, S);
    Shell.share({ text: text, url: PLAY_URL, png: png }).then(function (r) {
      if (r.reason === 'copied') toast(S('copied'));
      else if (r.reason === 'shared') toast(S('shared'));
      else if (r.reason === 'unavailable' || r.reason === 'failed' || r.reason === 'invalid') toast(S('shareFailed'));
    });
  }

  // ---- pause ----
  function openPause() {
    if (!game || game.over) return;
    view.interactive = false;
    openSheet('pause', function (box) {
      box.appendChild(h('h2', 'center', S('paused')));
      var actions = h('div', 'actions');
      actions.appendChild(button(S('resume'), { cls: 'btn primary wide', icon: 'play', onClick: closeSheet }));
      var snd = button(S('sound') + ': ' + S(progress.settings.sound ? 'on' : 'off'), {
        cls: 'btn ghost wide', icon: progress.settings.sound ? 'speaker-high' : 'speaker-slash', onClick: function () {
          progress.settings.sound = !progress.settings.sound;
          audio.setMuted(!progress.settings.sound);
          persist();
          openPause();
        }
      });
      actions.appendChild(snd);
      actions.appendChild(button(S('home'), { cls: 'btn ghost wide', icon: 'house', onClick: goHome }));
      box.appendChild(actions);
    }, closeSheet);
  }

  el.pauseBtn.appendChild(icons.icon('pause'));
  el.pauseBtn.setAttribute('aria-label', S('pause'));
  el.pauseBtn.addEventListener('click', function () { if (!adBusy) { sfx('tap'); openPause(); } });

  // ---- shell events ----
  Shell.onPause(function () {
    // A full-screen ad pauses the app too; coming back from one never lands on the pause sheet.
    if (screen === 'play' && game && !game.over && !sheetName && !adBusy) openPause();
    persistGame();
    persist();
    audio.suspend();
  });
  Shell.onResume(function () { audio.resume(); });
  Shell.onChange(function () {
    caps = Shell.caps;
    if (screen === 'play' && game && game.def) view.layout(boardRect());
    if (!sheetName && screen !== 'play') {
      var top = el.screen.scrollTop;
      showScreen(screen);
      el.screen.scrollTop = top;
    }
    refreshOffers();
    if (screen === 'play' && game && !game.over) updateTray();
  });
  Shell.onBack(function () {
    if (adBusy) return true;
    if (sheetName) {
      var back = sheetBack;
      if (back) back(); else closeSheet();
      return true;
    }
    if (screen === 'play') {
      if (game && !game.over) openPause();
      else goHome();
      return true;
    }
    if (screen !== 'home') { showScreen('home'); return true; }
    return false;
  });

  window.addEventListener('resize', function () {
    if (screen === 'play' && game && game.def) view.layout(boardRect());
  });

  // A test hook for the headless play-tests (read only views of the state).
  window.__pawnfare = {
    game: function () { return game; },
    progress: function () { return progress; },
    view: view,
    screen: function () { return screen; },
    sheet: function () { return sheetName; },
    genStats: genclient.stats
  };

  showScreen('home');
  Shell.ready().then(function (c) {
    caps = c;
    if (!sheetName && screen !== 'play') showScreen(screen);
  });
})();
