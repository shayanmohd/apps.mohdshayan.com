/*
 * Sherd: the screens, the flow between them, and everything that talks to the shell (game-sdk.js).
 * Pure rules live in rules, daily, expedition, museum, progress and save; this file wires them up.
 *
 * Ad rules this file follows (GAME-DESIGN.md section 5, WEBGAME-RECIPE.md section 3):
 *   one interstitial placement, dig_next, only from Next on a solved Expedition dig, gated by
 *   progress.interstitialDue (3 digs grace, at most one per 2 digs, never after a rewarded ad in the
 *   same break); nothing around the daily or the archive; rewarded only from buttons that state the
 *   reward, shown only while caps.rewardedReady (or ad free); no banner in the app, and on the web
 *   Shell.banner(true) only on menus and result cards, Shell.banner(false) the moment a dig starts.
 */
(function (root) {
  'use strict';
  var S = root.Sherd;
  var Shell = root.Shell;
  var t = S.t;
  var rules = S.rules;
  var daily = S.daily;
  var exped = S.expedition;
  var museum = S.museum;
  var progress = S.progress;
  var art = S.art;
  var audio = S.audio;
  var icons = S.icons;
  var VERSION = '1.0.1';
  var POLICY_URL = 'https://apps.mohdshayan.com/privacy-policies/sherd-privacy-policy.html';
  var $ = function (id) { return document.getElementById(id); };

  // ---- save ----

  Shell.configureSave({ prefix: 'sherd', version: S.save.VERSION, migrate: S.save.migrate });
  function freshSeed() {
    var a = new Uint32Array(1);
    try { root.crypto.getRandomValues(a); } catch (e) { a[0] = Math.floor(Math.random() * 4294967295); }
    return a[0] || 1;
  }
  var save = S.save.sanitize(Shell.load('main', null), freshSeed());
  function persist() { Shell.save('main', save); }

  var caps = Shell.caps;
  var today = daily.dayNumber();
  if (progress.rollover(save, today)) persist();

  var ui = { screen: null, sheet: null, museumWing: -1, museumSel: -1, busy: false, bannerOn: null, splash: null, legendStart: 0, legendFirst: false };
  var play = null; // the dig on screen: { mode, dig, day, made, rewardedThisBreak, result }

  var reducedQuery = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return save.settings.reducedMotion || !!(reducedQuery && reducedQuery.matches); }

  // ---- text and icons from the strings table ----

  function fillStatic() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-text]'), function (el) { el.textContent = t(el.getAttribute('data-text')); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (el) {
      var label = el.getAttribute('data-label');
      el.insertAdjacentHTML('afterbegin', icons.svg(el.getAttribute('data-icon')));
      if (label) el.setAttribute('aria-label', t(label));
    });
    setBtn($('digBtn'), 'trowel', t('dig'));
    $('versionLine').textContent = t('version', { v: VERSION });
    $('policyLink').href = POLICY_URL;
  }

  function setBtn(el, iconName, text) {
    el.innerHTML = (iconName ? icons.svg(iconName) : '') + '<span></span>';
    el.lastChild.textContent = text;
  }

  // ---- feedback ----

  var toastTimer = 0;
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function haptic(style) { if (save.settings.haptics) Shell.haptic(style); }
  function sound(name, arg, delay) { audio.play(name, arg, delay); }

  // ---- caps ----

  function rewardedOn() { return !!(caps.adFree || caps.rewardedReady); }
  // Shell.share arrived in game-sdk.js 1.1.0; caps.share says this shell or browser can share now.
  function shareOn() { return typeof Shell.share === 'function' && !!caps.share; }

  Shell.onChange(function () {
    caps = Shell.caps;
    refreshScreen();
    if (ui.screen === 'dig') layoutDig(); // insets may have moved; the board keeps its size otherwise
  });

  function syncBanner() {
    var want = caps.platform === 'web' && ui.screen !== 'dig' && ui.screen !== null && !ui.splash && ui.sheet !== 'legend';
    if (ui.screen === 'dig' && ui.sheet === 'result') want = caps.platform === 'web';
    if (want === ui.bannerOn) return;
    ui.bannerOn = want;
    Shell.banner(want);
  }

  // ---- screens ----

  var SCREENS = ['home', 'dig', 'map', 'museum', 'archive'];

  function show(name) {
    if (ui.screen !== name) {
      SCREENS.forEach(function (s) { $(s).hidden = s !== name; });
      ui.screen = name;
      $('museumOffer').hidden = true; // the one-time Remove ads offer lasts one museum visit
      ui.mapScroll = name === 'map'; // centre the current dig when the map opens, not on every caps change
    }
    if (name === 'dig') {
      Shell.banner(false); // play starts: never a banner during a dig
      ui.bannerOn = false;
    }
    refreshScreen();
    syncBanner();
  }

  function refreshScreen() {
    if (ui.screen === 'home') renderHome();
    else if (ui.screen === 'map') renderMap();
    else if (ui.screen === 'museum') renderMuseum();
    else if (ui.screen === 'archive') renderArchive();
    else if (ui.screen === 'dig') renderDigChrome();
    if (ui.sheet === 'settings') renderSettings();
    if (ui.sheet === 'result') renderResultReward();
    if (ui.sheet === 'open') renderOpenSheet();
  }

  // ---- sheets ----

  var SHEETS = { result: 'resultSheet', settings: 'settingsSheet', pause: 'pauseSheet', open: 'openSheet', legend: 'legendSheet' };

  function openSheet(name) {
    Object.keys(SHEETS).forEach(function (k) { $(SHEETS[k]).hidden = k !== name; });
    ui.sheet = name;
    $('scrim').hidden = name === 'legend';
    if (name === 'settings') renderSettings();
    if (name === 'legend') ui.legendStart = performance.now();
    syncBanner();
  }

  function closeSheet(keepBanner) {
    if (!ui.sheet) return;
    $(SHEETS[ui.sheet]).hidden = true;
    $('scrim').hidden = true;
    ui.sheet = null;
    if (!keepBanner) syncBanner(); // a screen change that follows syncs it once
  }

  $('scrim').addEventListener('click', function () {
    if (ui.sheet === 'pause') resumeDig();
    else if (ui.sheet === 'settings' || ui.sheet === 'open') closeSheet();
  });
  Array.prototype.forEach.call(document.querySelectorAll('.sheet-close'), function (b) {
    b.addEventListener('click', function () { sound('tap'); closeSheet(); });
  });

  // ---- home ----

  function shortDate(day) {
    var c = daily.dateOf(day);
    try {
      return new Date(c.y, c.m - 1, c.d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    } catch (e) {
      return c.d + '.' + c.m + '.';
    }
  }

  function untilMidnight() {
    var n = new Date();
    var ms = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n;
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    return h ? t('timeHM', { h: h, m: m }) : t('timeM', { m: m });
  }

  function renderHome() {
    var rec = save.days[today];
    var act = save.active.daily && save.active.daily.day === today ? save.active.daily : null;
    $('dailyNo').textContent = t('dailyNumber', { n: today });
    $('dailyDate').textContent = rec ? t('nextDaily', { time: untilMidnight() }) : shortDate(today);
    var state;
    if (rec) state = rec.w ? t('dailySolved', { n: rec.t }) : t('dailyLost');
    else if (act && act.dig.tries.length) state = t('dailyInProgress', { n: act.dig.tries.length, max: daily.tries });
    else state = t('dailyOpen');
    $('dailyState').textContent = state;
    // streak repair, offered from the first open after one missed day, while an ad can play
    var repair = progress.repairOffered(save, today) && rewardedOn();
    var streak = progress.streakShown(save, today, rewardedOn());
    var line = $('streakLine');
    line.hidden = !streak && !save.streak.best; // nothing to show before the first solved daily
    line.innerHTML = icons.svg(save.streak.mended && streak ? 'mend' : 'glaze') + '<span></span>';
    line.lastChild.textContent = t('streak', { n: streak }) + (save.streak.best > streak ? ' \u00b7 ' + t('streakBest', { n: save.streak.best }) : '');
    // once today's dig is done, the button leads on to the Expedition
    if (rec) setBtn($('dailyBtn'), 'strata', t('expedition'));
    else setBtn($('dailyBtn'), 'trowel', act && act.dig.tries.length ? t('resume') : t('dig'));
    $('dailyShare').hidden = !(rec && shareOn());
    $('repairCard').hidden = !repair;
    if (repair) {
      $('repairNote').textContent = t('repairNote');
      setBtn($('repairBtn'), caps.adFree ? 'mend' : 'play', caps.adFree ? t('repairFree', { n: save.streak.current }) : t('repairAd', { n: save.streak.current }));
    }
    var site = exped.siteFor(save.exp.dig);
    $('rowExpSub').textContent = t('digLabel', { n: save.exp.dig }) + ', ' + t('siteName' + site.id);
    var p = museum.progress(save.exp.fragments, save.glaze);
    $('rowMuseumSub').textContent = p.current >= 0 ? t('fragmentsOf', { a: p.have, b: p.need }) + (p.restored ? ', ' + p.restored + ' ' + t('restored').toLowerCase() : '') : t('wingDone');
    var past = Math.max(0, today - 1);
    $('rowArchiveSub').textContent = past ? t('archiveSub', { n: past }) : t('archiveEmpty');
    drawThumb($('rowVessel'), p.current >= 0 ? p.current : museum.VESSELS.length - 1, p.current >= 0 ? p.have : 999, p.glazed > (p.current >= 0 ? p.current : 17));
    drawHero();
  }

  function drawThumb(canvas, index, pieces, glazed) {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(3, root.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.drawImage(art.vesselCanvas(index, { pieces: pieces, glazed: glazed, w: w, h: h, dpr: dpr }), 0, 0);
  }

  function drawHero() {
    var c = $('heroVessel');
    var p = museum.progress(save.exp.fragments, save.glaze);
    var idx = p.current >= 0 ? p.current : museum.VESSELS.length - 1;
    var pieces = p.current >= 0 ? p.have : 999;
    drawThumb(c, idx, Math.max(pieces, 0), idx < p.glazed);
  }

  $('dailyBtn').addEventListener('click', function () {
    sound('tap');
    if (save.days[today]) { show('map'); return; }
    startDaily();
  });
  $('dailyShare').addEventListener('click', function () { shareDay(today); });
  $('homeSettings').addEventListener('click', function () { sound('tap'); openSheet('settings'); });
  $('rowExp').addEventListener('click', function () { sound('tap'); show('map'); });
  $('rowMuseum').addEventListener('click', function () { sound('tap'); ui.museumSel = -1; ui.museumWing = -1; show('museum'); });
  $('rowArchive').addEventListener('click', function () { sound('tap'); show('archive'); });
  $('repairBtn').addEventListener('click', function () {
    var btn = this;
    askRewarded('streak_repair', btn, function () {
      if (progress.applyRepair(save, today)) {
        persist();
        toast(t('repairDone'));
        sound('restore');
        haptic('success');
      }
      renderHome();
    });
  });

  // ---- rewarded ----

  function askRewarded(placement, btn, grant) {
    if (ui.busy) return;
    ui.busy = true;
    if (btn) btn.disabled = true;
    Shell.rewarded(placement).then(function (r) {
      ui.busy = false;
      if (btn) btn.disabled = false;
      if (play && (r.reason === 'watched' || r.reason === 'skipped')) play.rewardedThisBreak = true;
      if (r.granted) grant(r);
      else if (r.reason === 'skipped') toast(t('noReward'));
      else toast(t('noAd'));
      caps = Shell.caps;
      refreshScreen();
    });
  }

  // ---- starting digs ----

  function startDaily() {
    if (save.days[today]) return;
    var a = save.active.daily;
    var dig = a && a.day === today ? rules.fromJSON(a.dig) : null;
    if (dig && !rules.sameCells(dig.target, daily.target(today))) dig = null; // a stale or edited save
    if (!dig) dig = daily.createDig(today);
    save.active.daily = { day: today, dig: rules.toJSON(dig) };
    persist();
    enterDig({ mode: 'daily', dig: dig, day: today });
  }

  function startArchive(day) {
    var a = save.active.archive;
    var dig = a && a.day === day ? rules.fromJSON(a.dig) : null;
    if (dig && !rules.sameCells(dig.target, daily.target(day))) dig = null;
    if (!dig) dig = daily.createDig(day);
    save.active.archive = { day: day, dig: rules.toJSON(dig) };
    persist();
    enterDig({ mode: 'archive', dig: dig, day: day });
  }

  function startExpedition() {
    var made = exped.makeDig(save.exp.seed, save.exp.dig, save.exp.attempt);
    var a = save.active.exp;
    if (a && a.digNo === made.digNo && a.attempt === made.attempt) {
      var saved = rules.fromJSON(a.dig);
      if (saved && rules.sameCells(saved.target, made.dig.target)) made.dig = saved;
    }
    save.active.exp = { digNo: made.digNo, attempt: made.attempt, dig: rules.toJSON(made.dig) };
    persist();
    enterDig({ mode: 'exp', dig: made.dig, made: made });
  }

  var board = S.board.create($('board'), {
    onPaint: function (count, added) {
      if (added) { sound('paint', count); haptic('tap'); } else sound('unpaint');
    },
    onRefuse: function () { sound('refuse'); haptic('error'); },
    onSelection: function (sel) { updateTray(sel); },
    onTouch: function () { audio.unlock(); }
  });

  function enterDig(p) {
    closeSheet();
    play = { mode: p.mode, dig: p.dig, day: p.day, made: p.made || null, rewardedThisBreak: false, result: null, finished: false };
    var ghost = p.made && p.made.tutorial && !p.dig.tries.length ? exped.TUTORIAL.probe : null;
    board.setReduced(reduced());
    show('dig');
    board.setDig(p.dig, { mode: p.mode, ghost: ghost });
    $('tray').hidden = false;
    $('surveyTray').hidden = true;
    layoutDig();
    renderDigChrome();
    updateTray([]);
    if (p.dig.done) finishDig(true);
  }

  function renderDigChrome() {
    if (!play) return;
    var dig = play.dig;
    if (play.mode === 'exp') {
      var site = play.made.site;
      $('digName').textContent = t('digLabel', { n: play.made.digNo });
      $('digSub').textContent = t('siteLabel', { n: roman(site.id) }) + ', ' + t('par', { n: play.made.par });
    } else {
      $('digName').textContent = t('dailyNumber', { n: play.day });
      $('digSub').textContent = shortDate(play.day);
    }
    var pips = $('pips');
    var html = '';
    for (var i = 0; i < dig.maxTries; i++) {
      var cls = 'pip' + (i < dig.tries.length ? ' used' : '') + (play.mode === 'exp' && i === play.made.par - 1 ? ' par' : '');
      html += '<i class="' + cls + '"></i>';
    }
    pips.innerHTML = html;
    pips.setAttribute('aria-label', dig.tries.length + ' / ' + dig.maxTries);
    // survey: Expedition only, once a dig, only while an ad can play (or ad free)
    var canSurvey = play.mode === 'exp' && !dig.done && !dig.survey && rewardedOn() && !play.made.tutorial;
    var sb = $('surveyBtn');
    sb.hidden = !canSurvey || !$('surveyTray').hidden;
    if (canSurvey) setBtn(sb, caps.adFree ? 'survey' : 'play', caps.adFree ? t('surveyFree') : t('surveyAd'));
    var go = $('surveyGo');
    setBtn(go, caps.adFree ? 'survey' : 'play', caps.adFree ? t('surveyGo') : t('surveyGoAd'));
    var tag = $('doubleTag');
    tag.hidden = !(play.mode === 'exp' && save.exp.double.left > 0);
    if (!tag.hidden) { tag.innerHTML = icons.svg('double') + '<span></span>'; tag.lastChild.textContent = t('doubleActive', { n: save.exp.double.left }); }
    if (!$('surveyTray').hidden && (!rewardedOn() || dig.survey)) cancelSurvey();
  }

  function roman(n) { return ['I', 'II', 'III', 'IV', 'V', 'VI'][n - 1] || String(n); }

  function updateTray(sel) {
    if (!play) return;
    var n = play.dig.n;
    var html = '';
    for (var i = 0; i < n; i++) html += '<i class="' + (i < sel.length ? 'on' : '') + '"></i>';
    var count = $('count');
    count.innerHTML = html;
    count.classList.toggle('full', sel.length === n);
    var live = !play.dig.done && !play.finished;
    $('digBtn').disabled = !(live && sel.length === n && rules.connected(sel, play.dig.W));
    $('undoBtn').disabled = !(live && sel.length);
    $('clearBtn').disabled = !(live && sel.length);
  }

  function layoutDig() {
    var wrap = $('boardWrap');
    var w = wrap.clientWidth;
    var h = wrap.clientHeight;
    if (!w || !h) return;
    board.layout(Math.min(w, h, 560));
    S.legend.strip($('legendMini'), Math.min(3, root.devicePixelRatio || 1));
  }

  // ---- playing a try ----

  $('undoBtn').addEventListener('click', function () { if (board.undo()) sound('unpaint'); });
  $('clearBtn').addEventListener('click', function () { if (board.clear()) sound('unpaint'); });
  $('digBtn').addEventListener('click', function () {
    if (!play || play.dig.done || play.finished) return;
    var sel = board.selection;
    var r = rules.play(play.dig, sel);
    if (!r.ok) { sound('refuse'); haptic('error'); return; }
    audio.unlock();
    sound('dig');
    var last = play.dig.tries[play.dig.tries.length - 1];
    var ms = board.reveal(last);
    var gap = reduced() ? 0.03 : 0.07;
    last.marks.forEach(function (m, k) {
      sound(m === rules.HIT ? 'hit' : m === rules.NEAR ? 'near' : 'miss', null, 0.12 + k * gap);
    });
    haptic('light');
    board.setGhost(null);
    storeActive();
    renderDigChrome();
    if (r.done) {
      play.finished = true;
      updateTray([]);
      setTimeout(function () { finishDig(false); }, ms + 120);
    }
  });

  function storeActive() {
    var json = rules.toJSON(play.dig);
    if (play.mode === 'daily') save.active.daily = { day: play.day, dig: json };
    else if (play.mode === 'archive') save.active.archive = { day: play.day, dig: json };
    else save.active.exp = { digNo: play.made.digNo, attempt: play.made.attempt, dig: json };
    persist();
  }

  // ---- survey (rewarded, Expedition only) ----

  $('surveyBtn').addEventListener('click', function () {
    if (!play || play.dig.done || play.dig.survey) return;
    sound('tap');
    board.startSurvey();
    $('tray').hidden = true;
    $('surveyTray').hidden = false;
    $('surveyBtn').hidden = true;
  });

  function cancelSurvey() {
    board.stopSurvey();
    $('tray').hidden = false;
    $('surveyTray').hidden = true;
    renderDigChrome();
  }
  $('surveyCancel').addEventListener('click', function () { sound('tap'); cancelSurvey(); });
  $('surveyGo').addEventListener('click', function () {
    var c = board.surveyCentre;
    if (!c || !play) return;
    askRewarded('survey', this, function () {
      var r = rules.survey(play.dig, c.cx, c.cy);
      cancelSurvey();
      if (!r.ok) return;
      board.reveal(play.dig.survey);
      r.marks.forEach(function (m, k) { sound(m === rules.HIT ? 'hit' : m === rules.NEAR ? 'near' : 'miss', null, 0.05 + k * 0.05); });
      storeActive();
      renderDigChrome();
    });
  });

  // ---- finishing a dig ----

  // already: the dig was finished before it reached the screen (a done dig restored from the save, which
  // only happens when the player left in the moment between the last Dig and this call). It was never
  // recorded, so it is recorded now; only the board's fresh win or loss effects are skipped.
  function finishDig(already) {
    if (!play) return;
    var dig = play.dig;
    var res;
    if (play.mode === 'daily') {
      res = progress.finishDaily(save, play.day, dig, false);
      save.active.daily = null;
    } else if (play.mode === 'archive') {
      res = progress.finishDaily(save, play.day, dig, true);
      save.active.archive = null;
    } else {
      res = progress.finishExpedition(save, play.made);
      save.active.exp = null;
      if (play.made.tutorial) save.flags.tutorialDone = true;
    }
    persist();
    play.result = res;
    play.finished = true;
    if (dig.won) {
      board.celebrate();
      if (!already) {
        sound('win', null, 0.05);
        haptic('success');
        var rect = board.shardRect();
        S.fxLayer.burst(rect.x + rect.w / 2, rect.y + rect.h / 2, { count: 22, spread: rect.w * 0.6 });
      }
    } else {
      board.mourn();
      if (!already) { sound('lose'); haptic('heavy'); }
    }
    setTimeout(openResult, already ? 50 : dig.won ? 1050 : 800);
  }

  function openResult() {
    if (!play) return;
    var dig = play.dig;
    var res = play.result;
    var isExp = play.mode === 'exp';
    openSheet('result'); // first, so its canvases have a size to draw at
    $('resultKicker').textContent = isExp ? t('digLabel', { n: play.made.digNo }) + ', ' + t('siteName' + play.made.site.id) : t('dailyNumber', { n: play.day }) + (play.mode === 'archive' ? ', ' + t('archive') : '');
    $('resultTitle').textContent = dig.won ? t('found', { n: dig.tries.length }) : t('notFound');
    var stars = $('resultStars');
    stars.innerHTML = '';
    if (isExp && dig.won) {
      var n = exped.stars(true, dig.tries.length, play.made.par);
      for (var i = 0; i < 3; i++) stars.insertAdjacentHTML('beforeend', icons.svg('star', i < n ? 'on' : 'off'));
      if (dig.survey) stars.insertAdjacentHTML('beforeend', icons.svg('survey', 'off'));
    }
    drawNarrow($('narrowCanvas'), rules.narrowing(dig));
    drawRows($('resultRows'), isExp ? null : progress.rows(dig), dig.n);
    var gain = $('resultGain');
    var prog = $('resultProgress');
    var note = $('resultNote');
    note.textContent = '';
    gain.textContent = '';
    prog.textContent = '';
    var vesselCanvas = $('resultVessel');
    var pv = museum.progress(save.exp.fragments, save.glaze);
    if (isExp) {
      if (res && dig.won) {
        gain.textContent = res.gained === 1 ? t('fragmentGained') : t('fragmentsGained', { n: res.gained }) + (res.doubled ? ' ' + t('doubled').toLowerCase() : '');
        if (res.restoredNow > 0) {
          prog.textContent = t('vesselRestored');
          play.flight = { index: res.before.current, from: res.before.have, to: museum.VESSELS[res.before.current].need, restored: true };
        } else if (res.after.current >= 0) {
          prog.textContent = t('fragmentsOf', { a: res.after.have, b: res.after.need });
          play.flight = { index: res.after.current, from: Math.max(0, res.after.have - res.gained), to: res.after.have, restored: false };
        } else {
          // every vessel is restored: spare fragments wait for new wings
          prog.textContent = t('wingDone');
          play.flight = { index: museum.VESSELS.length - 1, from: 999, to: 999, restored: false };
        }
        drawThumb(vesselCanvas, play.flight.index, play.flight.from, false);
      } else {
        play.flight = null;
        drawThumb(vesselCanvas, pv.current >= 0 ? pv.current : 17, pv.current >= 0 ? pv.have : 999, false);
        prog.textContent = pv.current >= 0 ? t('fragmentsOf', { a: pv.have, b: pv.need }) : '';
      }
    } else {
      play.flight = null;
      drawGlazePiece(vesselCanvas, dig.won && play.mode === 'daily');
      if (play.mode === 'daily') {
        if (dig.won && res && res.glaze) gain.textContent = t('glazeGained');
        prog.textContent = t('streak', { n: progress.streakNow(save, today) });
        note.textContent = t('nextDaily', { time: untilMidnight() });
      }
    }
    // buttons
    var primary = $('resultPrimary');
    var secondary = $('resultSecondary');
    $('resultShare').hidden = !(play.mode !== 'exp' && shareOn());
    if (isExp) {
      if (dig.won) {
        setBtn(primary, 'next', t('next'));
        primary.dataset.act = 'next';
        var restored = play.flight && play.flight.restored;
        if (play.made.tutorial && !save.days[today]) {
          // after the tutorial, today's daily is one tap away (where a shared link's reader wants to be)
          setBtn(secondary, 'calendar', t('daily'));
          secondary.dataset.act = 'daily';
        } else {
          setBtn(secondary, restored ? 'vessel' : 'map', restored ? t('museum') : t('map'));
          secondary.dataset.act = restored ? 'museum' : 'map';
        }
      } else {
        setBtn(primary, 'retry', t('retry'));
        primary.dataset.act = 'retry';
        setBtn(secondary, 'map', t('map'));
        secondary.dataset.act = 'map';
      }
    } else if (play.mode === 'daily') {
      setBtn(primary, 'strata', t('expedition'));
      primary.dataset.act = 'map';
      setBtn(secondary, 'home', t('home'));
      secondary.dataset.act = 'home';
    } else {
      setBtn(primary, 'calendar', t('archive'));
      primary.dataset.act = 'archive';
      setBtn(secondary, 'home', t('home'));
      secondary.dataset.act = 'home';
    }
    renderResultReward();
    if (play.flight) setTimeout(flyShard, 420);
  }

  function renderResultReward() {
    var btn = $('resultReward');
    if (!play) { btn.hidden = true; return; }
    var offer = play.mode === 'exp' && play.dig.won && progress.doubleOffered(save, today) && rewardedOn();
    btn.hidden = !offer;
    if (offer) setBtn(btn, caps.adFree ? 'double' : 'play', caps.adFree ? t('doubleFree') : t('doubleAd'));
  }

  $('resultReward').addEventListener('click', function () {
    askRewarded('double_fragments', this, function () {
      if (progress.grantDouble(save, today)) { persist(); toast(t('doubleDone')); haptic('success'); }
      renderResultReward();
    });
  });

  function flyShard() {
    if (!play || !play.flight || ui.sheet !== 'result') return;
    var f = play.flight;
    var canvas = $('resultVessel');
    var r = canvas.getBoundingClientRect();
    var c = art.fragmentCentre(f.index, f.from, r.width, r.height);
    var from = board.shardRect();
    board.state.win = 0; // the shard leaves the board; its glaze marks stay
    board.markDirty();
    S.fxLayer.flight(play.dig.target, play.dig.W, { x: from.x, y: from.y, s: from.s }, { x: r.left + c[0], y: r.top + c[1] }, 7, 640, function (x, y) {
      sound('settle');
      haptic('medium');
      S.fxLayer.burst(x, y, { count: 10, speed: 160, size: 3.5, lift: 60 });
      S.fxLayer.ring(x, y, art.PAL.cobalt, 26);
      var k = f.from;
      var step = function () {
        k++;
        drawThumb(canvas, f.index, k, false);
        if (k < f.to && k < 999) { sound('hit', null, 0); setTimeout(step, reduced() ? 20 : 140); return; }
        if (f.restored) {
          sound('restore', null, 0.1);
          haptic('success');
          var rr = canvas.getBoundingClientRect();
          S.fxLayer.ring(rr.left + rr.width / 2, rr.top + rr.height / 2, art.PAL.cobalt, 70);
          S.fxLayer.burst(rr.left + rr.width / 2, rr.top + rr.height * 0.4, { count: 26, speed: 220 });
        }
      };
      step();
    });
  }

  function drawGlazePiece(canvas, earned) {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(3, root.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var s = Math.min(w, h) / 3.4;
    var ox = w / 2 - s * 1.5;
    var oy = h / 2 - s * 1.2;
    if (earned) art.drawShard(ctx, [1, 3, 4, 5, 7], 3, ox, oy, s, 0.6, -1, 1);
    else {
      ctx.globalAlpha = 0.5;
      art.drawMissedShard(ctx, [1, 3, 4, 5, 7], 3, ox, oy, s, 1);
      ctx.globalAlpha = 1;
    }
  }

  // The daily's tries as rows of marks (hits, then rims, then soil): the share card, drawn.
  var rowTex = [0, 1, 2, 3, 4].map(function (k) { return art.cellTexture(900 + k); });
  function drawRows(canvas, rows, n) {
    canvas.hidden = !rows || !rows.length;
    if (canvas.hidden) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(3, root.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var max = Math.max(rows.length, 6);
    var s = Math.floor(Math.min(w / (n + (n - 1) * 0.18), h / (max + (max - 1) * 0.18)));
    var gap = Math.max(2, Math.round(s * 0.18));
    var x0 = Math.round(w - (n * s + (n - 1) * gap));
    rows.forEach(function (r, y) {
      for (var k = 0; k < n; k++) {
        var x = x0 + k * (s + gap);
        var yy = y * (s + gap);
        if (k < r[0]) art.drawHit(ctx, x, yy, s, rowTex[k]);
        else if (k < r[0] + r[1]) { art.drawEmpty(ctx, x, yy, s); art.drawNear(ctx, x, yy, s); }
        else art.drawMiss(ctx, x, yy, s, rowTex[k]);
      }
    });
  }

  function drawNarrow(canvas, counts) {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(3, root.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!counts || !counts.length) return;
    var max = Math.log(counts[0] + 1);
    var n = counts.length;
    var stepX = n > 1 ? (w - 24) / (n - 1) : 0;
    var pts = counts.map(function (c, i) {
      return [12 + i * stepX, 10 + (1 - Math.log(c + 1) / max) * (h - 34)];
    });
    ctx.strokeStyle = art.PAL.pencil;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.stroke();
    ctx.font = '600 12px "Sofia Cond", system-ui, sans-serif';
    ctx.textAlign = 'center';
    pts.forEach(function (p, i) {
      ctx.fillStyle = counts[i] === 1 ? art.PAL.cobalt : art.PAL.ink;
      ctx.beginPath();
      ctx.arc(p[0], p[1], counts[i] === 1 ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = art.PAL.ink;
      if (n <= 7 || i === 0 || i === n - 1 || i % 2 === 0) ctx.fillText(String(counts[i]), p[0], h - 6);
    });
  }

  $('resultPrimary').addEventListener('click', function () { resultAction(this.dataset.act); });
  $('resultSecondary').addEventListener('click', function () { resultAction(this.dataset.act); });
  $('resultShare').addEventListener('click', function () { if (play) shareDay(play.day); });

  function resultAction(act) {
    if (ui.busy) return;
    sound('tap');
    if (act === 'next') return onNext();
    closeSheet(true);
    var wasPlay = play;
    play = null;
    if (act === 'retry') { startExpedition(); return; }
    if (act === 'daily') { startDaily(); return; }
    if (act === 'map') show('map');
    else if (act === 'museum') { ui.museumSel = -1; ui.museumWing = -1; show('museum'); }
    else if (act === 'archive') show('archive');
    else show('home');
    void wasPlay;
  }

  // The one interstitial break: Next on a solved Expedition dig, under the game's own count rules.
  function onNext() {
    ui.busy = true;
    var due = play && progress.interstitialDue(save, caps.adFree, play.rewardedThisBreak);
    var go = function () {
      ui.busy = false;
      closeSheet();
      play = null;
      startExpedition();
    };
    if (!due) { go(); return; }
    $('resultPrimary').disabled = true;
    Shell.interstitial('dig_next').then(function (r) {
      $('resultPrimary').disabled = false;
      if (r.shown) { progress.interstitialShown(save); persist(); }
      go();
    });
  }

  // ---- share ----

  function shareDay(day) {
    var rec = save.days[day];
    if (!rec || !shareOn()) return;
    var card = S.share.card({ day: day, rows: rec.r, won: !!rec.w, maxTries: daily.tries, n: daily.n,
      mended: !rec.a && save.streak.mended && progress.streakNow(save, today) > 0, archive: !!rec.a });
    // called straight from the tap, so Web Share still has the tap's user activation
    Shell.share({ text: card.text, url: card.url }).then(function (r) {
      r = r || {};
      if (r.reason === 'copied') toast(t('copied'));
      else if (!r.ok && r.reason !== 'cancelled' && r.reason !== 'busy') toast(t('shareFailed'));
    });
  }

  // ---- pause ----

  function pauseDig() {
    // once the last try is in, the result card is on its way: no pause (and no Leave) in between
    if (ui.screen !== 'dig' || ui.sheet || (play && play.finished)) return;
    renderToggle($('pauseSound'), save.settings.sound);
    openSheet('pause');
  }
  function resumeDig() { closeSheet(); }
  $('digPause').addEventListener('click', function () { sound('tap'); pauseDig(); });
  $('pauseResume').addEventListener('click', function () { sound('tap'); resumeDig(); });
  $('pauseLeave').addEventListener('click', function () {
    sound('tap');
    closeSheet();
    var mode = play ? play.mode : 'daily';
    play = null;
    show(mode === 'exp' ? 'map' : mode === 'archive' ? 'archive' : 'home');
  });
  $('pauseSound').addEventListener('click', function () { toggleSound(); renderToggle(this, save.settings.sound); });
  $('pauseHowTo').addEventListener('click', function () { openLegend(false); });
  $('legendStrip').addEventListener('click', function () { sound('tap'); openLegend(false); });

  // ---- map ----

  function renderMap() {
    var body = $('mapBody');
    var cur = save.exp.dig;
    var html = '';
    exped.SITES.forEach(function (site) {
      var last = site.last === Infinity ? Math.max(site.first + 9, cur + 4) : site.last;
      var first = site.first;
      if (site.last === Infinity && cur - first > 24) first = cur - 18;
      var locked = cur < site.first;
      var spec = site.W + '×' + site.W + ', ' + site.n + (site.bedrock[1] ? ', ' + t('siteName3').toLowerCase() : '');
      html += '<section class="site s' + site.id + (locked ? ' locked' : '') + '"><div class="site-head"><span class="site-name">' +
        esc(t('siteLabel', { n: roman(site.id) }) + '  ' + t('siteName' + site.id)) + '</span><span class="site-spec">' + esc(spec) + '</span></div><div class="site-digs">';
      for (var d = first; d <= last; d++) {
        var st = save.exp.stars[d] || 0;
        var cls = 'node' + (d < cur ? ' done s' + st : d === cur ? ' current' : '') + (save.exp.surveyed[d] ? ' surveyed' : '');
        html += '<span class="' + cls + '">' + d + '</span>';
      }
      html += '</div></section>';
    });
    body.innerHTML = html;
    var active = save.active.exp && save.active.exp.digNo === cur;
    setBtn($('mapDig'), 'trowel', t('startDig', { n: cur }) + (active ? ', ' + t('dailyInProgress', { n: save.active.exp.dig.tries.length, max: save.active.exp.dig.maxTries }) : ''));
    var dbl = progress.doubleOffered(save, today) && rewardedOn();
    $('mapDouble').hidden = !dbl;
    if (dbl) setBtn($('mapDouble'), caps.adFree ? 'double' : 'play', caps.adFree ? t('doubleFree') : t('doubleAd'));
    var tag = $('mapDoubleTag');
    tag.hidden = save.exp.double.left <= 0;
    if (!tag.hidden) { tag.innerHTML = icons.svg('double') + '<span></span>'; tag.lastChild.textContent = t('doubleActive', { n: save.exp.double.left }); }
    var node = ui.mapScroll ? body.querySelector('.node.current') : null;
    ui.mapScroll = false;
    if (node) setTimeout(function () { try { node.scrollIntoView({ block: 'center' }); } catch (e) { /* old WebView */ } }, 30);
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  $('mapBack').addEventListener('click', function () { sound('tap'); show('home'); });
  $('mapDig').addEventListener('click', function () { sound('tap'); startExpedition(); });
  $('mapDouble').addEventListener('click', function () {
    askRewarded('double_fragments', this, function () {
      if (progress.grantDouble(save, today)) { persist(); toast(t('doubleDone')); haptic('success'); }
      renderMap();
    });
  });

  // ---- museum ----

  function renderMuseum() {
    var p = museum.progress(save.exp.fragments, save.glaze);
    var focus = p.current >= 0 ? p.current : museum.VESSELS.length - 1;
    if (ui.museumSel < 0) ui.museumSel = focus;
    if (ui.museumWing < 0) ui.museumWing = museum.VESSELS[ui.museumSel].culture;
    // Remove ads and archive, on its own once, after the first vessel is restored
    var offer = $('museumOffer');
    var showOffer = p.restored >= 1 && !save.flags.removeAdsOffered && caps.removeAds && !caps.adFree;
    if (showOffer) {
      save.flags.removeAdsOffered = true;
      persist();
      offer.innerHTML = '<h3></h3><p class="muted"></p><div class="row-actions"><button class="btn primary" id="offerBuy"></button><button class="btn" id="offerLater"></button></div>';
      offer.querySelector('h3').textContent = t('removeAds');
      offer.querySelector('p').textContent = t('removeAdsBody');
      offer.querySelector('#offerBuy').textContent = caps.removeAdsPrice ? t('buyFor', { price: caps.removeAdsPrice }) : t('buy');
      offer.querySelector('#offerLater').textContent = t('notNow');
      offer.querySelector('#offerBuy').addEventListener('click', function () { buyRemoveAds(this, function (ok) { if (ok) offer.hidden = true; }); });
      offer.querySelector('#offerLater').addEventListener('click', function () { sound('tap'); offer.hidden = true; });
      offer.hidden = false;
    } else if (caps.adFree) {
      offer.hidden = true;
    }
    var wings = $('wings');
    wings.innerHTML = '';
    museum.CULTURES.forEach(function (c, ci) {
      var count = museum.VESSELS.filter(function (v) { return v.culture === ci && v.index < p.restored; }).length;
      var b = document.createElement('button');
      b.className = 'wing';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(ci === ui.museumWing));
      b.innerHTML = '<span></span><small></small>';
      b.firstChild.textContent = t('culture' + ci);
      b.lastChild.textContent = count + ' / 6';
      b.addEventListener('click', function () { sound('page'); ui.museumWing = ci; ui.museumSel = ci * 6; renderMuseum(); });
      wings.appendChild(b);
    });
    var grid = $('vessels');
    grid.innerHTML = '';
    museum.VESSELS.filter(function (v) { return v.culture === ui.museumWing; }).forEach(function (v) {
      var card = document.createElement('button');
      card.className = 'vcard' + (v.index === ui.museumSel ? ' sel' : '');
      card.innerHTML = '<canvas></canvas><span></span>';
      var shown = museum.piecesShown(v.index, save.exp.fragments);
      var label = card.lastChild;
      if (shown >= v.need) label.innerHTML = icons.svg(v.index < p.glazed ? 'glaze' : 'check') + '<span></span>';
      else label.innerHTML = '<span></span>';
      label.lastChild.textContent = shown >= v.need ? (v.index < p.glazed ? t('glazed') : t('restored')) : shown + ' / ' + v.need;
      card.addEventListener('click', function () { sound('tap'); ui.museumSel = v.index; renderMuseum(); });
      grid.appendChild(card);
      drawThumb(card.firstChild, v.index, shown, v.index < p.glazed);
    });
    var sel = museum.VESSELS[ui.museumSel];
    var shownSel = museum.piecesShown(sel.index, save.exp.fragments);
    drawThumb($('plinthVessel'), sel.index, shownSel, sel.index < p.glazed);
    $('plinthTitle').textContent = t('culture' + sel.culture) + ' ' + (sel.slot + 1);
    $('plinthSub').textContent = shownSel >= sel.need ? (sel.index < p.glazed ? t('glazed') : t('restored')) : t('fragmentsOf', { a: shownSel, b: sel.need });
    $('glazeLine').textContent = p.glazeStock === 1 ? t('glazeStock1') : p.glazeStock > 1 ? t('glazeStock', { n: p.glazeStock }) : (p.current < 0 ? t('wingDone') : '');
  }

  $('museumBack').addEventListener('click', function () { sound('tap'); show('home'); });

  // ---- archive ----

  function renderArchive() {
    var body = $('archiveBody');
    var left = progress.archiveOpensLeft(save, today);
    $('archiveStatus').textContent = caps.adFree ? t('archiveOwned') : rewardedOn() ? t('archiveLeft', { n: left }) : '';
    var html = '';
    var c = daily.dateOf(today);
    var y = c.y;
    var m = c.m;
    var epoch = daily.dateOf(1);
    var week = '';
    for (var w = 0; w < 7; w++) { // weekday initials, Monday first, from the locale (2026-11-02 is a Monday)
      var dow = '';
      try { dow = new Date(2026, 10, 2 + w).toLocaleDateString(undefined, { weekday: 'narrow' }); } catch (e) { dow = ''; }
      week += '<span class="dow" aria-hidden="true">' + esc(dow) + '</span>';
    }
    while (y > epoch.y || (y === epoch.y && m >= epoch.m)) {
      var first = new Date(y, m - 1, 1);
      var dim = new Date(y, m, 0).getDate();
      var title = '';
      try { title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); } catch (e) { title = m + ' ' + y; }
      html += '<section class="month"><h3>' + esc(title) + '</h3><div class="days">' + week;
      var pad = (first.getDay() + 6) % 7;
      for (var p = 0; p < pad; p++) html += '<span class="day pad"></span>';
      for (var d = 1; d <= dim; d++) {
        var day = daily.dayNumber(new Date(y, m - 1, d, 12));
        var inRange = new Date(y, m - 1, d, 12) >= new Date(epoch.y, epoch.m - 1, epoch.d);
        if (day > today) break; // the calendar ends at today
        if (!inRange) { html += '<span class="day pad"></span>'; continue; }
        var st = progress.archiveState(save, day, today, caps.adFree);
        var rec = save.days[day];
        var cls = 'day ' + (st === 'played' ? (rec.w ? 'won' : 'lost') + (rec.a ? ' played-archive' : '') : st);
        html += '<button class="' + cls + '" data-day="' + day + '" aria-label="' + esc(t('dailyNumber', { n: day })) + '">' + d + '</button>';
      }
      html += '</div></section>';
      m--;
      if (m < 1) { m = 12; y--; }
    }
    body.innerHTML = html;
  }

  $('archiveBody').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.day[data-day]') : null;
    if (!b) return;
    sound('tap');
    var day = +b.getAttribute('data-day');
    var st = progress.archiveState(save, day, today, caps.adFree);
    if (st === 'today') { if (save.days[today]) showPastResult(today); else startDaily(); return; }
    if (st === 'played') { showPastResult(day); return; }
    if (st === 'open') { startArchive(day); return; }
    ui.openDay = day;
    renderOpenSheet();
    openSheet('open');
  });

  function renderOpenSheet() {
    var day = ui.openDay;
    if (!day) return;
    $('openTitle').textContent = t('dailyNumber', { n: day }) + ', ' + shortDate(day);
    var left = progress.archiveOpensLeft(save, today);
    var can = rewardedOn() && (caps.adFree || left > 0);
    var btn = $('openReward');
    btn.hidden = !can;
    if (can) setBtn(btn, caps.adFree ? 'calendar' : 'play', caps.adFree ? t('dailyNumber', { n: day }) : t('archiveAd'));
    // where no rewarded ad can ever play (the web), say where past digs open instead of "try again"
    var never = !caps.rewarded && !caps.adFree;
    $('openNote').textContent = can ? '' : never ? t('archiveApp') : left <= 0 ? t('archiveNone') : t('noAd');
    $('openLeft').textContent = caps.adFree || never ? '' : t('archiveLeft', { n: left });
  }

  $('openReward').addEventListener('click', function () {
    var day = ui.openDay;
    askRewarded('archive_day', this, function () {
      if (caps.adFree || progress.unlockArchive(save, day, today)) {
        persist();
        closeSheet();
        startArchive(day);
      }
    });
  });

  $('archiveBack').addEventListener('click', function () { sound('tap'); show('home'); });

  function showPastResult(day) {
    var rec = save.days[day];
    if (!rec) return;
    // a read-only card built from the stored record
    play = { mode: rec.a ? 'archive' : 'daily', day: day, dig: { won: !!rec.w, tries: rec.r.map(function () { return {}; }), survey: null, maxTries: daily.tries }, made: null, result: null, finished: true, readOnly: true, counts: rec.c };
    openPastCard(rec);
  }

  function openPastCard(rec) {
    openSheet('result');
    $('resultKicker').textContent = t('dailyNumber', { n: play.day }) + ', ' + shortDate(play.day);
    $('resultTitle').textContent = rec.w ? t('found', { n: rec.t }) : t('notFound');
    $('resultStars').innerHTML = '';
    drawNarrow($('narrowCanvas'), rec.c);
    drawRows($('resultRows'), rec.r, daily.n);
    $('resultGain').textContent = '';
    $('resultProgress').textContent = play.day === today ? t('streak', { n: progress.streakNow(save, today) }) : '';
    $('resultNote').textContent = play.day === today ? t('nextDaily', { time: untilMidnight() }) : '';
    drawGlazePiece($('resultVessel'), !!rec.w && !rec.a);
    $('resultShare').hidden = !shareOn();
    $('resultReward').hidden = true;
    setBtn($('resultPrimary'), 'calendar', t('archive'));
    $('resultPrimary').dataset.act = 'archive';
    setBtn($('resultSecondary'), 'home', t('home'));
    $('resultSecondary').dataset.act = 'home';
  }

  // ---- settings and purchases ----

  function renderToggle(el, on) { el.classList.toggle('on', !!on); el.setAttribute('aria-pressed', String(!!on)); }

  function renderSettings() {
    renderToggle($('setSound'), save.settings.sound);
    renderToggle($('setHaptics'), save.settings.haptics);
    renderToggle($('setMotion'), save.settings.reducedMotion);
    var sell = caps.removeAds && !caps.adFree;
    $('buyBlock').hidden = !sell;
    if (sell) $('buyBtn').textContent = caps.removeAdsPrice ? t('buyFor', { price: caps.removeAdsPrice }) : t('buy');
    $('ownedLine').hidden = !caps.adFree;
    $('ownedLine').textContent = t('owned');
    // Restore purchases sits beside Remove ads; an owner can still ask Play again
    $('restoreBtn').hidden = !caps.removeAds;
    $('privacyBtn').hidden = !caps.privacyOptions;
  }

  function toggleSound() {
    save.settings.sound = !save.settings.sound;
    audio.setMuted(!save.settings.sound);
    persist();
    if (save.settings.sound) { audio.unlock(); sound('tap'); }
  }

  $('setSound').addEventListener('click', function () { toggleSound(); renderSettings(); });
  $('setHaptics').addEventListener('click', function () {
    save.settings.haptics = !save.settings.haptics;
    persist();
    renderSettings();
    haptic('tap');
  });
  $('setMotion').addEventListener('click', function () {
    save.settings.reducedMotion = !save.settings.reducedMotion;
    persist();
    applyMotion();
    renderSettings();
  });
  $('setHowTo').addEventListener('click', function () { openLegend(false); });
  $('privacyBtn').addEventListener('click', function () {
    Shell.privacyOptions().then(function () { caps = Shell.caps; renderSettings(); });
  });
  $('buyBtn').addEventListener('click', function () { buyRemoveAds(this); });
  $('restoreBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    Shell.restore().then(function (r) {
      btn.disabled = false;
      caps = Shell.caps;
      if (r.adFree) toast(t('restoreOk'));
      else if (r.ok) toast(t('restoreNone'));
      else toast(buyMessage(r.reason));
      refreshScreen();
    });
  });

  function buyMessage(reason) {
    var key = { purchased: 'buyPurchased', owned: 'buyOwned', pending: 'buyPending', cancelled: 'buyCancelled', unavailable: 'buyUnavailable',
      notOffered: 'buyNotOffered', offline: 'buyOffline' }[reason] || 'buyFailed';
    return t(key);
  }

  function buyRemoveAds(btn, done) {
    if (!caps.removeAds || caps.adFree) return;
    btn.disabled = true;
    Shell.buyRemoveAds().then(function (r) {
      btn.disabled = false;
      caps = Shell.caps;
      toast(buyMessage(r.reason));
      if (r.adFree) { sound('restore'); haptic('success'); }
      if (done) done(!!r.adFree);
      refreshScreen();
    });
  }

  // ---- legend and the opening ----

  function openLegend(first) {
    ui.legendFirst = !!first;
    setBtn($('legendGo'), first ? 'trowel' : 'check', first ? t('begin') : t('close'));
    openSheet('legend');
  }

  $('legendGo').addEventListener('click', function () {
    audio.unlock();
    sound('tap');
    if (ui.legendFirst) {
      save.flags.legendSeen = true;
      persist();
      closeSheet();
      startExpedition();
    } else if (ui.screen === 'dig' && play && !play.finished) {
      closeSheet();
    } else {
      closeSheet();
    }
  });

  function runSplash(done) {
    var el = $('splash');
    el.hidden = false;
    var c = $('splashCanvas');
    var start = performance.now();
    ui.splash = function (now) {
      var w = Math.max(1, c.clientWidth);
      var h = Math.max(1, c.clientHeight);
      var ctx = c.getContext('2d');
      ctx.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var k = (now - start) / (reduced() ? 600 : 2100);
      var vh = Math.min(h * 0.36, w * 0.7);
      art.inkOutline(ctx, 0, w / 2, h * 0.5, vh, art.ease(Math.min(1, k * 1.5)));
      ctx.globalAlpha = Math.max(0, Math.min(1, (k - 0.45) * 3));
      ctx.fillStyle = art.PAL.ink;
      ctx.font = '600 56px "Sofia Cond", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('appName'), w / 2, h * 0.5 + 70);
      ctx.globalAlpha = 1;
      if (k >= 1) {
        ui.splash = null;
        el.hidden = true;
        done();
      }
    };
  }

  // ---- motion, resize and the loop ----

  function applyMotion() {
    var r = reduced();
    document.body.classList.toggle('reduced', r);
    board.setReduced(r);
    S.fxLayer.setReduced(r);
  }

  var filmCanvas = $('film');
  function resize() {
    art.paintFilm(filmCanvas, root.innerWidth, root.innerHeight, Math.min(2, root.devicePixelRatio || 1));
    S.fxLayer.resize();
    if (ui.screen === 'dig') layoutDig();
    if (ui.screen === 'home') drawHero();
  }

  var last = performance.now();
  var boardBusy = false;
  var FRAME_MS = 1000 / 60;
  var nextDraw = 0;
  function frame(now) {
    // About 60 fps on 90 and 120 Hz screens: skip a frame that comes too soon after the last drawn one.
    // Animations run on these timestamps and input on its own events, so play is the same at any rate.
    if (now < nextDraw - 2) { root.requestAnimationFrame(frame); return; }
    nextDraw = now - nextDraw > FRAME_MS ? now + FRAME_MS : nextDraw + FRAME_MS;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (ui.screen === 'dig' && (boardBusy || board.isDirty())) boardBusy = board.render(now);
    S.fxLayer.render(now, dt);
    if (ui.sheet === 'legend') {
      var c = $('legendCanvas');
      var ctx = c.getContext('2d');
      ctx.setTransform(c.width / Math.max(1, c.clientWidth), 0, 0, c.height / Math.max(1, c.clientHeight), 0, 0);
      S.legend.render(ctx, c.clientWidth, c.clientHeight, now, ui.legendStart, reduced());
    }
    if (ui.splash) ui.splash(now);
    root.requestAnimationFrame(frame);
  }

  // ---- shell lifecycle ----

  Shell.onPause(function () {
    persist();
    audio.suspend();
    // A full-screen ad pauses the app too; the player asked for that one, so no pause sheet then.
    if (ui.screen === 'dig' && !ui.sheet && !ui.busy && play && !play.finished) pauseDig();
  });

  Shell.onResume(function () {
    audio.resume();
    checkDay();
  });

  Shell.onBack(function () {
    if (ui.splash) return true;
    if (ui.sheet === 'legend') {
      if (ui.legendFirst) { closeSheet(); save.flags.legendSeen = true; persist(); show('home'); return true; }
      closeSheet();
      return true;
    }
    if (ui.sheet === 'pause') { resumeDig(); return true; }
    if (ui.sheet === 'result') {
      var act = $('resultSecondary').dataset.act;
      resultAction(!act || act === 'daily' ? 'home' : act); // Back never starts a dig
      return true;
    }
    if (ui.sheet) { closeSheet(); return true; }
    if (ui.screen === 'dig') {
      if (!$('surveyTray').hidden) { cancelSurvey(); return true; }
      pauseDig();
      return true;
    }
    if (ui.screen && ui.screen !== 'home') { show('home'); return true; }
    return false; // on the home screen: let the app close
  });

  function checkDay() {
    var now = daily.dayNumber();
    if (now === today) return;
    today = now;
    if (progress.rollover(save, today)) persist();
    if (ui.screen === 'home' || ui.screen === 'archive') refreshScreen();
  }
  setInterval(function () { checkDay(); if (ui.screen === 'home' && save.days[today]) $('dailyDate').textContent = t('nextDaily', { time: untilMidnight() }); }, 30000);

  root.addEventListener('resize', resize);
  document.addEventListener('pointerdown', function () { audio.unlock(); }, { passive: true });

  // ---- boot ----

  S.fxLayer = S.fx.create($('fx'));
  // The other frame-loop canvases get their backing stores now, before Shell.ready() (recipe 2b).
  var screenCss = art.screenCss();
  art.allocate($('legendCanvas'), screenCss.w, screenCss.h, 3);
  if (!save.flags.legendSeen) art.allocate($('splashCanvas'), screenCss.w, screenCss.h, 3);
  fillStatic();
  audio.setMuted(!save.settings.sound);
  applyMotion();
  resize();
  document.body.classList.remove('booting');

  function begin() {
    if (!save.flags.legendSeen) {
      runSplash(function () { openLegend(true); });
      ui.screen = null;
    } else {
      show('home');
    }
  }

  var fontsReady = document.fonts && document.fonts.load ? Promise.all([
    document.fonts.load('500 16px "Sofia Cond"'), document.fonts.load('600 16px "Sofia Cond"')
  ]).catch(function () { return null; }) : Promise.resolve();
  var started = false;
  function startOnce() {
    if (started) return;
    started = true;
    begin();
    root.requestAnimationFrame(function (n) { last = n; frame(n); });
  }
  fontsReady.then(startOnce);
  setTimeout(startOnce, 700);
  Shell.ready().then(function (c) {
    caps = c;
    refreshScreen();
    syncBanner();
  });

  // For the test bots in the scratch folder: read-only views of the state.
  root.SherdDebug = {
    get save() { return JSON.parse(JSON.stringify(save)); },
    get ui() { return { screen: ui.screen, sheet: ui.sheet, busy: ui.busy }; },
    get play() {
      if (!play) return null;
      return { mode: play.mode, day: play.day, finished: play.finished, readOnly: !!play.readOnly,
        dig: play.dig && play.dig.W ? rules.toJSON(play.dig) : null, digNo: play.made ? play.made.digNo : 0 };
    },
    board: board,
    today: function () { return today; }
  };
})(this);
