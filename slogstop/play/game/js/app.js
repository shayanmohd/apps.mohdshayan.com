/*
 * Slogstop: screens, input, the solo overs, the duel, ads, purchases, saves and links.
 *
 * Ad rules this game follows (WEBGAME-RECIPE.md section 3, GAME-DESIGN.md section 5):
 *   no banner in the app; on the web Shell.banner(true) only on menus and result cards, and
 *   Shell.banner(false) the moment an over starts;
 *   an interstitial only from Next on a solo result card or Next match on a duel result card, under
 *   the game's own counts (progress.js), never around the Daily, never on Retry, Play, launch or Back;
 *   rewarded ads only from a button that states the reward, only while caps.rewardedReady (or ad free);
 *   Remove ads and archive from the menu with Restore beside it, and once on its own after the first duel.
 * Sharing only from a Share button, straight from its tap, never rewarded.
 */
(function () {
  'use strict';
  var SS = window.SS;
  var model = SS.model, ai = SS.ai, over = SS.over, sc = SS.scenarios, daily = SS.daily;
  var progress = SS.progress, strings = SS.strings, share = SS.share, icons = SS.icons;
  var audio = SS.audio, render = SS.render, rng = SS.rng, runlib = SS.run;

  var $ = function (id) { return document.getElementById(id); };
  var NS = 'http://www.w3.org/2000/svg';
  var PRIVACY_URL = 'https://apps.mohdshayan.com/privacy-policies/slogstop-privacy-policy.html';
  var BEAT = 600; // ms a beat of the duel's 3, 2, 1
  var GRACE = 400; // ms after "1" ends before a pick is late

  // ---------------------------------------------------------------- saves and words
  Shell.configureSave({ prefix: 'slogstop', version: progress.VERSION, migrate: progress.migrate });
  var P = progress.clean(Shell.load('progress', null));
  var T = null;
  var langCode = 'en';
  var caps = Shell.caps;
  var today = daily.dayNumber();
  var reduceSystem = false;
  try { reduceSystem = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduceSystem = false; }
  var coarse = false;
  try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e2) { coarse = false; }

  function persist() { Shell.save('progress', P); }
  // In a right to left language, numbers, prices and ball lines (plain ASCII) are isolated so that
  // "4+ 19%" and "$1.99" never come out reordered inside Urdu words.
  var rtl = false;
  function isol(v) {
    var t = String(v);
    return rtl && /^[\x20-\x7e]+$/.test(t) && /[0-9]/.test(t) ? '\u2066' + t + '\u2069' : t;
  }
  /** Text for a share card: without the bidi isolates f() adds in a right to left language. */
  function bare(t) { return String(t).replace(/[\u2066\u2069]/g, ''); }
  function f(s, vars) {
    if (rtl && vars) {
      var c = {};
      for (var k in vars) if (Object.prototype.hasOwnProperty.call(vars, k)) c[k] = isol(vars[k]);
      vars = c;
    }
    return strings.format(s, vars);
  }

  function applyLanguage() {
    langCode = P.lang === 'auto' ? strings.resolve(strings.deviceLang()) : strings.resolve(P.lang);
    T = strings.table(langCode);
    render.setWords({ nb: T.nbShort });
    document.documentElement.lang = langCode;
    document.documentElement.dir = strings.dirOf(langCode);
    rtl = strings.dirOf(langCode) === 'rtl';
  }

  function reduced() { return reduceSystem || P.motion === 'reduce'; }
  function applyMotion() {
    document.body.classList.toggle('reduce', reduced());
    render.setReduced(reduced());
  }

  applyLanguage();
  audio.setOn(P.sound);

  // ---------------------------------------------------------------- canvases before Shell.ready()
  var canvas = $('view');
  render.init(canvas);
  applyMotion();

  // ---------------------------------------------------------------- links
  function query() {
    var q = '';
    try { q = window.parent && window.parent !== window ? window.parent.location.search : ''; } catch (e) { q = ''; }
    return q || window.location.search || '';
  }
  var linkChallenge = share.fromQuery(query());
  var linkDay = daily.fromQuery(query(), today);

  // ---------------------------------------------------------------- small DOM helpers
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svg(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function btn(text, cls, onTap) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    if (onTap) tap(b, onTap);
    return b;
  }
  /** A tap that fires on click (keyboard and mouse) and is not fired twice by touch. */
  function tap(node, fn) {
    node.addEventListener('click', function (e) {
      audio.unlock();
      fn(e);
    });
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function pct(x) { return Math.round(x * 100); }

  var toastTimer = 0;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function haptic(style) { if (caps.haptics || caps.platform !== 'android') Shell.haptic(style); }

  // ---------------------------------------------------------------- screens
  var screen = 'boot';
  var sheetOpen = null; // { kind, onClose }

  function show(name) {
    screen = name;
    document.body.setAttribute('data-screen', name);
    $('menu').hidden = name !== 'menu';
    $('play').hidden = !(name === 'play' || name === 'result');
    $('duel').hidden = name !== 'duel';
    $('result').hidden = name !== 'result';
    $('card').hidden = true;
    var bannerScreen = name === 'menu' || name === 'result' || (name === 'duel' && duel && duel.phase === 'done');
    setBanner(bannerScreen);
    layout();
  }

  function setBanner(on) {
    // No banner in the app (shared rule): only the web page's side slot, only on menus and results.
    if (caps.platform !== 'web') return;
    Shell.banner(!!on);
  }

  // ---------------------------------------------------------------- layout

  function layout() {
    render.resize();
    var vw = window.innerWidth, vh = window.innerHeight;
    if (screen === 'menu') {
      // the floodlit ground and a wagon wheel fill the space between the wordmark and the buttons
      var top = $('tagline').getBoundingClientRect().bottom + 12;
      var bottom = document.querySelector('.menu-stack').getBoundingClientRect().top - 12;
      var gh = Math.min(bottom - top, 520), gw = Math.min(vw - 40, gh * 0.95, 480);
      if (gh >= 110) {
        render.setLayout({ x: (vw - gw) / 2, y: top + (bottom - top - gh) / 2, w: gw, h: gh, flip: 1, dim: 0, deco: true });
      } else {
        // no room between the wordmark and the buttons: the ground becomes a dim backdrop behind them
        var s = Math.min(vw * 1.15, vh * 0.75);
        render.setLayout({ x: (vw - s) / 2, y: (vh - s) / 2, w: s, h: s, flip: 1, dim: 0.6, deco: true });
      }
      render.setField([], false);
      render.setHeat(null);
      render.setLabels(null);
      render.setHot(-1);
      render.setBadge('');
    } else if (screen === 'play' || screen === 'result') {
      var r = $('stage').getBoundingClientRect();
      var top = r.top, bottom = r.bottom;
      if (screen === 'result') {
        // the over's wagon wheel stays in view above the result card
        var card = $('resultPanel').getBoundingClientRect();
        bottom = Math.max(top + 120, card.top - 10);
      }
      var avail = bottom - top;
      var gw = Math.min(r.width, 560);
      var gh = Math.min(avail, gw * 1.3);
      gw = Math.min(gw, gh * 1.1);
      render.setLayout({ x: (vw - gw) / 2, y: top + (avail - gh) / 2, w: gw, h: gh, flip: 1 });
    } else if (screen === 'duel' && duel) {
      var m = $('duelMid').getBoundingClientRect();
      var dh = Math.min(m.height - 22, 560);
      var dw = Math.min(m.width - 16, dh * 1.2, 560);
      render.setLayout({ x: (vw - dw) / 2, y: m.top + (m.height - dh) / 2, w: dw, h: dh, flip: duel.batting === 'top' ? -1 : 1, upright: !coarse });
    } else {
      render.hide();
    }
  }

  window.addEventListener('resize', function () { layout(); });

  // ---------------------------------------------------------------- the menu

  function renderMenu() {
    $('tagline').textContent = T.tagline;
    var ds = progress.dailyState(P, today);
    var e = daily.entry(today);
    $('dailyTitle').textContent = f(T.dailyN, { n: today });
    var st = progress.streak(P, today);
    $('dailyStreak').textContent = st > 0 ? f(T.streakN, { n: st }) : '';
    if (ds.done) {
      $('dailyMeta').textContent = f(ds.result.won ? T.dailyWon : T.dailyLost, { t: ds.result.target, next: today + 1 });
    } else {
      $('dailyMeta').textContent = f(T.dailyNeed, { t: e.target, w: wk(e.wickets) });
    }
    // streak repair: once a week, on the open after one missed day
    var extra = $('dailyExtra');
    clear(extra);
    var repair = ds.canRepair && (caps.rewardedReady || caps.adFree);
    if (repair) {
      extra.appendChild(el('p', 'card-meta', f(T.repairNote, { n: P.daily.streak })));
      extra.appendChild(btn(caps.adFree ? T.repairTake : T.repairAd, 'quiet', function () { rewarded('streak_repair', function () {
        progress.repairStreak(P, today);
        persist();
        toast(T.repaired);
        renderMenu();
      }); }));
    }
    extra.hidden = !repair;
    $('duelLabel').textContent = T.twoPlayers;
    $('duelNote').textContent = T.twoPlayersNote;
    var open = progress.openRung(P);
    $('ladderLabel').textContent = T.ladder;
    $('ladderNote').textContent = f(T.ladderNote, { r: open + 1, s: progress.starsTotal(P) });
    $('defendBtn').textContent = T.defend;
    $('chaseBtn').textContent = T.chase;
    var ads = caps.removeAds && !caps.adFree;
    $('adsRow').hidden = !caps.removeAds;
    $('removeAdsBtn').hidden = !ads;
    $('removeAdsBtn').textContent = caps.removeAdsPrice ? f(T.removeAdsPrice, { price: caps.removeAdsPrice }) : T.removeAds;
    $('restoreBtn').textContent = T.restore;
    $('archiveBtn').hidden = !caps.adFree;
    icons.set($('archiveBtn'), 'archive', T.a11y.archive);
    icons.set($('howBtn'), 'info', T.a11y.how);
    icons.set($('settingsBtn'), 'gear', T.a11y.settings);
    icons.set($('menuSoundBtn'), P.sound ? 'sound' : 'mute', T.a11y.sound);
  }

  function wk(n) { return n === 1 ? T.wickets1 : f(T.wicketsN, { n: n }); }

  function goMenu() {
    session = null;
    duel = null;
    clearRun();
    stopCount();
    closeSheet();
    $('play').className = 'play';
    renderMenu();
    show('menu');
  }

  tap($('dailyCard'), function () {
    var ds = progress.dailyState(P, today);
    if (ds.done) showDailyResult(today);
    else startSolo(dailySpec(today, 'daily'));
  });
  tap($('duelBtn'), function () { startDuel(); });
  tap($('ladderBtn'), function () { openLadder(); });
  tap($('defendBtn'), function () { startSolo(sc.quick('defend', rng.freshSeed())); });
  tap($('chaseBtn'), function () { startSolo(sc.quick('chase', rng.freshSeed())); });
  tap($('settingsBtn'), function () { openSettings(); });
  tap($('howBtn'), function () { openHowTo(); });
  tap($('archiveBtn'), function () { openArchive(); });
  tap($('menuSoundBtn'), function () { toggleSound(); });
  tap($('soundBtn'), function () { toggleSound(); });
  tap($('pauseBtn'), function () { openPause(); });
  tap($('duelPause'), function () { openPause(); });
  tap($('removeAdsBtn'), function () { buyRemoveAds(); });
  tap($('restoreBtn'), function () { restorePurchases(); });

  function toggleSound() {
    P.sound = !P.sound;
    audio.setOn(P.sound);
    persist();
    icons.set($('menuSoundBtn'), P.sound ? 'sound' : 'mute', T.a11y.sound);
    icons.set($('soundBtn'), P.sound ? 'sound' : 'mute', T.a11y.sound);
  }

  // ---------------------------------------------------------------- purchases

  function buyRemoveAds() {
    var b = $('removeAdsBtn');
    b.disabled = true;
    Shell.buyRemoveAds().then(function (r) {
      b.disabled = false;
      toast(T.purchase[r.reason] || T.purchase.failed);
      caps = Shell.caps;
      renderMenu();
    });
  }

  function restorePurchases() {
    Shell.restore().then(function (r) {
      toast(r.ok ? (r.adFree ? T.restored.yes : T.restored.no) : T.restored.failed);
      caps = Shell.caps;
      renderMenu();
    });
  }

  // ---------------------------------------------------------------- rewarded

  /** A rewarded ad the player asked for; grant() runs exactly when the shell grants it. */
  function rewarded(placement, grant) {
    Shell.rewarded(placement).then(function (r) {
      caps = Shell.caps;
      if (r.granted) {
        if (session) session.rewarded = true;
        grant();
      } else if (r.reason === 'skipped') {
        toast(T.rewardSkipped);
      } else {
        toast(T.rewardNotReady);
      }
      refreshOffers();
    });
  }

  function canOfferRewarded() { return !!(caps.rewardedReady || caps.adFree); }

  function refreshOffers() {
    if (screen === 'menu') renderMenu();
    if (screen === 'play' && session && session.phase === 'ball') renderDeck();
    if (screen === 'result' && session && session.resultOffers) session.resultOffers();
  }

  // ---------------------------------------------------------------- solo overs

  var session = null;

  /** The unfinished solo over, saved after every ball (run.js): a closed or killed app resumes it. */
  function saveRun() {
    var s = session;
    if (!s || !s.o || s.phase === 'done' || s.phase === 'field' || s.phase === 'ready' || !s.o.field.slots.length) return;
    Shell.save('run', runlib.snapshot(s));
  }
  function clearRun() { Shell.clearSave('run'); }

  function dailySpec(day, kind) {
    var e = daily.entry(day);
    return { kind: kind, mode: 'defend', target: e.target, wickets: e.wickets, player: e.player, seed: e.seed, day: day };
  }

  function bestShapeFor(target, wickets, batter) {
    var best = 0, bv = Infinity;
    for (var s = 0; s < model.SHAPES.length; s++) {
      var o = over.create({ target: target, wickets: wickets, seed: 1, field: model.makeField(s, null) });
      var w = ai.batterWeights(batter, over.batterContext(o));
      for (var d = 0; d < model.ND; d++) {
        var x = model.summary(model.mix(w, w.map(function (_, z) { return model.dist(d, z, o.cover, {}); })));
        var v = x.runs - 3 * x.out;
        if (v < bv) { bv = v; best = s; }
      }
    }
    return best;
  }

  /** spec: { kind: ladder|quick|daily|archive|challenge, mode, target, wickets, player, seed?, rung?, day?, line? } */
  function startSolo(spec) {
    closeSheet();
    var s = {
      kind: spec.kind, mode: spec.mode, target: spec.target, wickets: spec.wickets, player: spec.player,
      seed: spec.seed != null ? spec.seed >>> 0 : rng.freshSeed(), rung: spec.rung, day: spec.day, theirLine: spec.line || '',
      phase: 'field', shape: 0, move: null, o: null, weights: null, rewarded: false, freeHitUsed: false,
      intro: !P.seen.intro && spec.kind === 'ladder' && spec.rung === 0, introBall: true,
      introChase: !P.seen.chaseIntro && spec.mode === 'chase'
    };
    session = s;
    $('why').dataset.keep = '';
    $('play').className = 'play mode-' + s.mode;
    $('deck').classList.remove('done');
    if (s.mode === 'defend') {
      s.shape = s.intro ? bestShapeFor(s.target, s.wickets, sc.BATTERS[s.player]) : (spec.shape != null ? spec.shape : 0);
    } else {
      s.shape = sc.BOWLERS[s.player].shape;
    }
    s.o = over.create({ target: s.target, wickets: s.wickets, seed: s.seed, field: model.makeField(s.shape, null) });
    render.clearTraces();
    show('play');
    setBanner(false);
    if (s.mode === 'chase') s.phase = 'ready';
    renderSolo();
  }

  function soloField() { return model.makeField(session.shape, session.move); }

  function rebuildOver() {
    session.o = over.create({ target: session.target, wickets: session.wickets, seed: session.seed, field: soloField() });
  }

  function renderSolo() {
    var s = session;
    renderBug(s.o, s.mode === 'defend' ? 'bowl' : 'bat');
    renderDeck();
    layout();
    render.setField(s.o.field.slots, s.phase === 'field');
  }

  function renderBug(o, role) {
    var left = over.ballsLeft(o);
    var need = over.need(o);
    $('bugBig').textContent = o.done ? (o.runs + '/' + o.out) : (left === 1 ? f(T.needBalls1, { t: need }) : f(T.need, { t: need, b: left }));
    $('bugSmall').textContent = (role === 'bowl' ? T.youBowl : T.youBat) + ', ' + wk(over.wicketsLeft(o)) + (o.freeHit ? ', ' + T.freeHit : '');
    var line = $('bugLine');
    clear(line);
    for (var i = 0; i < Math.max(6, o.line.length); i++) {
      var e = o.line[i];
      var li = el('li', e ? ballClass(e.s) : 'empty', e ? e.s : '');
      line.appendChild(li);
      if (i >= 11) break;
    }
    icons.set($('soundBtn'), P.sound ? 'sound' : 'mute', T.a11y.sound);
    icons.set($('pauseBtn'), 'pause', T.a11y.pause);
  }

  function ballClass(s) {
    if (s === 'W') return 'bW';
    if (s === '6') return 'b6';
    if (s === '4') return 'b4';
    if (s.indexOf('nb') === 0) return 'bN';
    if (s === '.') return '';
    return 'bR';
  }

  /** Per-zone labels: the chance of a boundary off a middled shot, from the field's cover. */
  function fieldLabels(cover) {
    var out = [];
    for (var z = 0; z < 6; z++) {
      var row = model.MIDDLED[cover[z]];
      out.push('4+ ' + (row[4] + row[5]));
    }
    return out;
  }

  function renderDeck() {
    var s = session;
    var deck = $('deck');
    var plan = $('plan');
    clear(deck);
    clear(plan);
    var why = $('why');
    var o = s.o;
    if (s.phase === 'field') {
      // Defend: pick a shape, drag one fielder, then bowl
      var batter = sc.BATTERS[s.player];
      var w = ai.batterWeights(batter, over.batterContext(o));
      s.weights = w;
      render.setHeat(w);
      render.setLabels(fieldLabels(o.cover), 'field');
      render.setHot(-1);
      render.setBadge(f(T.ringBadge, { i: 9 - model.deepCount(o.field.slots), o: model.deepCount(o.field.slots) }));
      why.textContent = f(T.batterIs, { s: T.batters[batter.id] }) + '. ' + T.battersNote[batter.id];
      if (s.theirLine) plan.appendChild(theirLineNode());
      deck.appendChild(shapePicker(s.shape, function (i) {
        s.shape = i;
        s.move = null;
        rebuildOver();
        audio.sfx.tap();
        renderSolo();
      }));
      var note = el('div', 'field-note');
      note.appendChild(el('span', '', T.fieldLegend));
      deck.appendChild(note);
      var row = el('div', 'deck-row');
      var go = btn(T.bowl, 'primary' + (s.intro ? ' pulse' : ''), function () { beginBalls(); });
      row.appendChild(go);
      deck.appendChild(row);
      return;
    }
    render.setBadge('');
    if (s.phase === 'ready') {
      // Chase: the computer's field is set; his plan shows once the over starts
      var bowler = sc.BOWLERS[s.player];
      render.setLabels(fieldLabels(o.cover), 'field');
      render.setHeat(null);
      why.textContent = f(T.bowlerIs, { s: T.bowlers[bowler.id] }) + '. ' + T.bowlersNote[bowler.id];
      if (s.theirLine) plan.appendChild(theirLineNode());
      var row2 = el('div', 'deck-row');
      row2.appendChild(btn(T.start, 'primary', function () { beginBalls(); }));
      deck.appendChild(row2);
      return;
    }
    if (s.phase !== 'ball' && s.phase !== 'anim') return;
    var locked = s.phase === 'anim';
    deck.classList.toggle('locked', locked);
    if (s.mode === 'defend') {
      var b2 = sc.BATTERS[s.player];
      var wts = ai.batterWeights(b2, over.batterContext(o));
      s.weights = wts;
      if (!locked) {
        render.setHeat(wts);
        render.setLabels(heatLabels(wts), 'heat');
      }
      var odds = deliveryOdds(o, wts);
      var best = -1;
      if (s.intro && s.introBall) {
        var bv = Infinity;
        odds.forEach(function (x, d) { var v = x.runs - 3 * x.out; if (v < bv) { bv = v; best = d; } });
      }
      deck.appendChild(deliveryGrid(odds, function (d) { soloBall(d); }, best, 0));
      if (!locked && !why.dataset.keep) why.textContent = T.heatNote;
    } else {
      var bw = sc.BOWLERS[s.player];
      var wb = ai.bowlerWeights(bw, over.bowlerContext(o));
      s.weights = wb;
      render.setHeat(null);
      render.setLabels(fieldLabels(o.cover), 'field');
      planBars(plan, wb);
      var podds = pickOdds(o, wb);
      // the first Chase ever: the zone with the best odds pulses on ball 1 (a newcomer is taught by doing)
      var bestZone = -1;
      if (s.introChase && s.introBall) {
        var cv = -Infinity;
        podds.forEach(function (x, z) { var v = x.runs - 3 * x.out; if (v > cv) { cv = v; bestZone = z; } });
      }
      deck.appendChild(zoneWheel(podds, function (z) { soloBall(z); }, 0, bestZone));
      // the free hit: Chase only, once per over, never the Daily (a Daily is a Defend)
      if (!locked && s.kind !== 'daily' && !s.freeHitUsed && !o.freeHit && canOfferRewarded()) {
        var r = el('div', 'deck-row');
        r.appendChild(btn(caps.adFree ? T.freeHitTake : T.freeHitAd, 'quiet', function () {
          rewarded('free_hit', function () {
            s.freeHitUsed = true;
            s.o.freeHit = true;
            s.freeHitAt = s.o.line.length;
            saveRun();
            renderBug(s.o, 'bat');
            renderDeck();
            toast(T.freeHitNote);
          });
        }));
        deck.appendChild(r);
      }
    }
  }

  function theirLineNode() {
    var d = el('div', 'linebox');
    d.style.gridColumn = '1 / -1';
    d.style.textAlign = 'center';
    d.appendChild(el('span', 'lbl', T.theirLine + ': ' + session.theirLine));
    return d;
  }

  function heatLabels(w) {
    var tot = 0;
    for (var i = 0; i < w.length; i++) tot += w[i];
    var out = [];
    for (var z = 0; z < 6; z++) out.push(tot ? Math.round(w[z] * 100 / tot) + '%' : '');
    return out;
  }

  function planBars(plan, w) {
    var tot = 0;
    for (var i = 0; i < w.length; i++) tot += w[i];
    for (var d = 0; d < model.ND; d++) {
      var bar = el('div', 'bar');
      var p = tot ? w[d] / tot : 0;
      var fill = el('i');
      fill.style.transform = 'scaleX(' + Math.max(0.04, p).toFixed(3) + ')';
      bar.appendChild(fill);
      bar.appendChild(el('span', '', T.deliveries[d] + ' ' + isol(Math.round(p * 100) + '%')));
      plan.appendChild(bar);
    }
  }

  function deliveryOdds(o, w) {
    var out = [];
    for (var d = 0; d < model.ND; d++) {
      var dists = w.map(function (_, z) { return model.dist(d, z, o.cover, over.flags(o, d)); });
      out.push(model.summary(model.mix(w, dists)));
    }
    return out;
  }

  function pickOdds(o, w) {
    var out = [];
    for (var z = 0; z <= model.BLOCK; z++) {
      var dists = w.map(function (_, d) { return model.dist(d, z, o.cover, over.flags(o, d)); });
      out.push(model.summary(model.mix(w, dists)));
    }
    return out;
  }

  function beginBalls() {
    var s = session;
    s.phase = 'ball';
    audio.sfx.tap();
    render.setField(s.o.field.slots, false);
    setBanner(false);
    renderSolo();
  }

  /** A solo ball: pick is a delivery (Defend) or a zone or block (Chase). */
  function soloBall(pick) {
    var s = session;
    if (!s || s.phase !== 'ball') return;
    s.phase = 'anim';
    if (s.intro || s.introChase) s.introBall = false;
    var o = s.o;
    var u = over.draws(o);
    var d, z;
    if (s.mode === 'defend') {
      d = pick;
      z = ai.draw(s.weights, u.bat);
    } else {
      z = pick;
      d = ai.draw(s.weights, u.bowl);
    }
    var flagsBefore = { freeHit: o.freeHit };
    var e = over.play(o, d, z);
    saveRun();
    haptic('tap');
    audio.sfx.bowl();
    render.setHeat(null);
    render.setLabels(null);
    renderDeck();
    var idx = o.index;
    var info = render.playBall(e, idx, function () { afterSoloBall(e); });
    $('why').dataset.keep = '1';
    setTimeout(function () {
      if (session !== s || s.phase === 'done') return; // the player left the over meanwhile
      ballSound(e); whyLine(e, info, o.cover, flagsBefore); renderBug(o, s.mode === 'defend' ? 'bowl' : 'bat');
    }, reduced() ? 0 : 380);
  }

  function ballSound(e) {
    if (e.out) { audio.sfx.stumps(); haptic('heavy'); return; }
    if (e.pick === 7) { audio.sfx.thud(); return; }
    if (e.runs === 6) { audio.sfx.crack(1); audio.sfx.crowd(2); audio.sfx.horn(); haptic('success'); return; }
    if (e.runs === 4) { audio.sfx.crack(0.8); audio.sfx.crowd(1); haptic('medium'); return; }
    if (e.runs > 0) { audio.sfx.crack(0.4); return; }
    audio.sfx.thud();
  }

  function whyLine(e, info, cover) {
    var w = $('why');
    clear(w);
    var resultWord;
    if (e.out) resultWord = info.kind === 'bowled' ? T.result.bowled : info.kind === 'caughtBehind' ? T.result.caughtBehind : info.kind === 'caught' ? T.result.caught : T.result.W;
    else resultWord = T.result[e.runs] || String(e.runs);
    w.appendChild(el('b', '', resultWord + '. '));
    var d = e.d >= 0 ? T.deliveries[e.d] : T.noBall;
    var z = e.pick >= 0 && e.pick < 6 ? T.zones[e.pick] : '';
    var text;
    if (e.d === over.LATE) text = T.why.noBall;
    else if (e.pick === over.LEAVE) text = T.why.leave;
    else if (e.pick === model.BLOCK) text = f(T.why.block, { d: d });
    else if (e.fullToss || model.OPEN[e.d][e.pick]) text = (e.slip ? T.why.slip + ' ' : '') + f(T.why['open' + cover[e.pick]], { d: e.slip ? T.deliveries[e.d] : d, z: z });
    else if (info.kind === 'edge') text = f(T.why.edge, { d: d, z: z });
    else text = f(T.why.shut, { d: d, z: z });
    if (e.free && !e.extra) text += ' ' + T.freeHit + '.';
    w.appendChild(document.createTextNode(text));
  }

  function afterSoloBall(e) {
    var s = session;
    if (!s || s.phase === 'done') return; // left or finished while the ball was still on its way
    if (s.o.done) {
      setTimeout(function () { if (session === s) finishSolo(); }, reduced() ? 150 : 450);
      return;
    }
    s.phase = 'ball';
    render.setHot(-1);
    renderDeck();
    $('why').dataset.keep = '1';
  }

  function finishSolo() {
    var s = session;
    var o = s.o;
    s.phase = 'done';
    render.setHot(-1);
    render.setHeat(null);
    render.setLabels(null);
    clearRun();
    var won = s.mode === 'defend' ? o.result === 'bowling' : o.result === 'batting';
    s.won = won;
    s.line = over.lineText(o);
    s.stars = sc.stars(s.mode, o);
    if (won) audio.sfx.win(); else audio.sfx.lose();
    haptic(won ? 'success' : 'error');
    if (s.kind === 'daily') {
      progress.finishDaily(P, s.day, { won: won, runs: o.runs, target: s.target, line: s.line });
    } else if (s.kind === 'archive') {
      progress.finishArchive(P, s.day, { won: won, runs: o.runs, target: s.target, line: s.line });
    } else {
      progress.noteFinished(P, 'solo');
      if (s.kind === 'ladder') progress.recordRung(P, s.rung, s.stars);
    }
    if (s.intro) P.seen.intro = true;
    if (s.introChase) P.seen.chaseIntro = true;
    persist();
    showSoloResult();
  }

  function soloResultTitle(s) {
    if (s.mode === 'defend') return f(s.won ? T.defended : T.notDefended, { t: s.target });
    return f(s.won ? T.chased : T.notChased, { t: s.target });
  }

  function starsNode(n) {
    var d = el('div', 'stars');
    for (var i = 0; i < 3; i++) d.appendChild(icons.icon('star', i < n ? '' : 'off'));
    return d;
  }

  function lineNode(label, line) {
    var box = el('div', 'linebox');
    box.appendChild(el('span', 'lbl', label));
    var ol = el('ol', 'balls');
    var parts = line ? line.split(' ') : [];
    for (var i = 0; i < parts.length; i++) ol.appendChild(el('li', ballClass(parts[i]), parts[i]));
    box.appendChild(ol);
    return box;
  }

  function showSoloResult() {
    var s = session;
    var o = s.o;
    var panel = $('resultPanel');
    clear(panel);
    clear($('plan'));
    $('bugBig').textContent = o.runs + '/' + o.out;
    var head = el('div', 'card-row');
    head.appendChild(el('h2', 'num' + (s.won ? '' : ' lost'), soloResultTitle(s)));
    if (s.kind === 'ladder') head.appendChild(starsNode(s.stars));
    panel.appendChild(head);
    var said = f(s.mode === 'defend' ? T.conceded : T.scored, { r: o.runs, w: o.out });
    if (s.kind === 'ladder') said += ' ' + f(T.rung, { n: s.rung + 1 }) + '.';
    panel.appendChild(el('p', 'strong', said));
    if (s.kind === 'ladder' && s.stars > 0 && s.stars < 3) {
      panel.appendChild(el('p', 'small', f(T.nextStar, { r: T.starsRule[s.mode][s.stars] })));
    }
    if (s.kind === 'challenge' && s.theirLine) {
      panel.appendChild(lineNode(T.theirLine, s.theirLine));
      panel.appendChild(lineNode(T.yourLine, s.line));
    } else if (s.kind === 'daily' || s.kind === 'archive') {
      panel.appendChild(lineNode(f(T.dailyN, { n: s.day }), s.line));
    }
    var offers = el('div', 'stack');
    panel.appendChild(offers);
    s.resultOffers = function () {
      clear(offers);
      if (s.kind === 'daily' && !s.won) {
        var ds = progress.dailyState(P, today);
        if (ds.canSecond && canOfferRewarded()) {
          offers.appendChild(btn(caps.adFree ? T.againTake : T.againAd, 'quiet', function () {
            rewarded('daily_again', function () {
              progress.grantSecond(P, today);
              persist();
              startSolo(dailySpec(today, 'daily'));
            });
          }));
        }
      }
    };
    s.resultOffers();
    var row = el('div', 'row');
    var quietMenu = false;
    if (s.kind === 'ladder') {
      if (s.won && s.rung < sc.LADDER.length - 1) {
        row.appendChild(btn(T.nextRung, 'primary', function (ev) { nextBreak(ev.currentTarget, function () { startSolo(sc.rung(s.rung + 1)); }); }));
        row.appendChild(btn(T.retry, '', function () { startSolo(sc.rung(s.rung)); }));
        quietMenu = true;
      } else {
        row.appendChild(btn(T.retry, s.won ? '' : 'primary', function () { startSolo(sc.rung(s.rung)); }));
        row.appendChild(btn(T.menu, '', goMenu));
      }
    } else if (s.kind === 'quick' || s.kind === 'challenge') {
      row.appendChild(btn(T.next, 'primary', function (ev) { nextBreak(ev.currentTarget, function () { startSolo(sc.quick(s.mode, rng.freshSeed())); }); }));
      row.appendChild(btn(T.menu, '', goMenu));
    } else {
      row.appendChild(btn(T.menu, 'primary', goMenu));
    }
    panel.appendChild(row);
    var quiet = el('div', 'row');
    if (shareAvailable()) quiet.appendChild(btn(T.share, 'quiet', function () { shareSolo(s); }));
    if (quietMenu) quiet.appendChild(btn(T.menu, 'quiet', goMenu));
    if (quiet.firstChild) panel.appendChild(quiet);
    $('deck').classList.add('done');
    show('result');
  }

  /**
   * Next on a solo result card: the natural break. Asks for an interstitial only when the game's own
   * counts allow it, then goes on whatever happened.
   */
  function nextBreak(button, go) {
    var s = session;
    caps = Shell.caps;
    if (caps.adFree || !progress.shouldAskInterstitial(P, 'solo', s && s.rewarded)) { go(); return; }
    button.disabled = true;
    Shell.interstitial('solo_next').then(function (r) {
      button.disabled = false;
      if (r.shown) { progress.noteInterstitialShown(P, 'solo'); persist(); }
      go();
    });
  }

  function shareAvailable() {
    caps = Shell.caps;
    return typeof Shell.share === 'function' && !!caps.share;
  }

  function traceSpecs(o) {
    // the share card's wagon wheel, rebuilt from the line (zones and runs only)
    var out = [];
    for (var i = 0; i < o.line.length; i++) {
      var e = o.line[i];
      if (e.pick < 0 || e.pick > 5 || e.runs === 0) continue;
      var open = e.fullToss || (e.d >= 0 && model.OPEN[e.d][e.pick]);
      var ang = open ? model.ZONES[e.pick].angle : (i % 2 ? 150 : -150);
      var k = e.runs === 6 ? 1.08 : e.runs === 4 ? 1.0 : e.runs === 2 ? 0.76 : 0.48;
      out.push({ angle: ang + ((i * 37) % 21 - 10), k: k, runs: e.runs, aerial: e.runs === 6 });
    }
    return out;
  }

  /** Straight from the Share button's tap: build the text and the card, then Shell.share. */
  function shareSolo(s) {
    var text, url, card;
    if (s.kind === 'daily' || s.kind === 'archive') {
      var res = P.daily.results[s.day] || {};
      text = share.dailyText(T, { day: s.day, second: !!res.second && s.kind === 'daily', won: s.won, target: s.target, line: s.line });
      url = share.dailyUrl(s.day);
      card = render.shareCard({ rtl: rtl, title: '#' + s.day, big: bare(s.won ? f(T.defended, { t: s.target }) : f(T.notDefended, { t: s.target })), line: s.line, traces: traceSpecs(s.o), field: null });
    } else {
      var code = share.encode({ mode: s.mode, target: s.target, wickets: s.wickets, player: s.player, seed: s.seed, entries: s.o.line });
      text = share.soloText(T, { mode: s.mode, won: s.won, target: s.target, line: s.line });
      url = code ? share.challengeUrl(code) : share.PLAY_URL;
      card = render.shareCard({ rtl: rtl, title: T.beatMyOver, big: bare(soloResultTitle(s)), line: s.line, lineLabel: s.theirLine ? T.yourLine : '', line2: s.theirLine || '', line2Label: s.theirLine ? T.theirLine : '', traces: traceSpecs(s.o), field: s.o.field.slots });
    }
    doShare(text, url, card);
  }

  function doShare(text, url, png) {
    Shell.share({ text: text, url: url, png: png }).then(function (r) {
      if (r.reason === 'copied') toast(T.shareCopied);
      else if (!r.ok && r.reason !== 'cancelled') toast(T.shareFailed);
    });
  }

  function showDailyResult(day) {
    var res = P.daily.results[day];
    if (!res) { goMenu(); return; }
    var spec = dailySpec(day, 'daily');
    // a finished Daily: show its card again (no replay)
    session = {
      kind: 'daily', mode: 'defend', target: res.target, wickets: spec.wickets, player: spec.player, seed: spec.seed, day: day,
      won: res.won, line: res.line, stars: 0, o: { runs: res.runs, out: (res.line.match(/W/g) || []).length, line: [], field: { slots: [] }, cover: [0, 0, 0, 0, 0, 0] },
      phase: 'done', rewarded: false
    };
    render.clearTraces();
    $('play').className = 'play mode-defend';
    show('play');
    renderBug(over.create({ target: res.target, wickets: spec.wickets, seed: 1 }), 'bowl');
    $('bugBig').textContent = res.runs + '/' + session.o.out;
    clear($('deck'));
    clear($('plan'));
    $('why').textContent = '';
    showSoloResult();
  }

  // ---------------------------------------------------------------- deck widgets

  /** A mini wheel: the zones a delivery leaves open, lit. rot: 0 or 180 to match the ground. */
  function miniWheel(d, rot) {
    var s = svg('svg', { viewBox: '-20 -20 40 40', class: 'mw', 'aria-hidden': 'true' });
    for (var z = 0; z < 6; z++) {
      var a = model.ZONES[z].angle + rot;
      s.appendChild(svg('path', { d: wedgePath(0, 0, 3, 18, a - 28, a + 28), fill: model.OPEN[d][z] ? '#FFB23E' : 'rgba(233,239,230,0.12)' }));
    }
    s.appendChild(svg('circle', { cx: 0, cy: 0, r: 2.4, fill: '#E9EFE6' }));
    return s;
  }

  function wedgePath(cx, cy, r0, r1, a0, a1) {
    function pt(r, a) { var t = a * Math.PI / 180; return [cx + r * Math.sin(t), cy - r * Math.cos(t)]; }
    var p0 = pt(r0, a0), p1 = pt(r1, a0), p2 = pt(r1, a1), p3 = pt(r0, a1);
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + 'L' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) +
      'A' + r1 + ' ' + r1 + ' 0 0 1 ' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2) +
      'L' + p3[0].toFixed(2) + ' ' + p3[1].toFixed(2) + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + 'Z';
  }

  /** Four delivery buttons. odds: summaries (or null in the duel, which shows the beaten out chance). */
  function deliveryGrid(odds, onPick, pulse, rot, keyHints) {
    var g = el('div', 'dgrid');
    for (var d = 0; d < model.ND; d++) {
      (function (d) {
        var b = el('button', 'dbtn' + (pulse === d ? ' pulse' : ''));
        b.type = 'button';
        b.dataset.pick = d;
        b.appendChild(miniWheel(d, rot));
        var t = el('span', '');
        t.appendChild(el('span', 'dname', T.deliveries[d] + (keyHints ? ' (' + keyHints[d] + ')' : '')));
        var od = el('span', 'odds');
        if (odds) {
          od.appendChild(el('span', 'o-out', f(T.oddsOut, { p: pct(odds[d].out) + '%' })));
          od.appendChild(el('span', 'o-four', f(T.oddsFour, { p: pct(odds[d].boundary) + '%' })));
        } else {
          od.appendChild(el('span', 'o-out', f(T.oddsBeaten, { p: model.BEATEN[d][0] + '%' })));
        }
        t.appendChild(od);
        b.appendChild(t);
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); audio.unlock(); onPick(d, e); });
        b.addEventListener('click', function (e) { if (e.detail === 0) onPick(d, e); }); // keyboard
        g.appendChild(b);
      })(d);
    }
    return g;
  }

  /**
   * The zone wheel: six wedges laid out as the ground, the block in the middle. odds: summaries for
   * zones 0 to 5 and block (solo), or null (the duel shows the field's boundary chance instead).
   */
  function zoneWheel(odds, onPick, rot, best, cover, keyHints) {
    var size = 240, c = size / 2, r0 = 46, r1 = 116;
    var s = svg('svg', { viewBox: '0 0 ' + size + ' ' + size, class: 'wheel', role: 'group' });
    for (var z = 0; z < 6; z++) {
      (function (z) {
        var a = model.ZONES[z].angle + rot;
        var gEl = svg('g', { class: 'wedge' + (best === z ? ' best' : ''), role: 'button', 'aria-label': T.zones[z], tabindex: '0' });
        gEl.appendChild(svg('path', { d: wedgePath(c, c, r0, r1, a - 29, a + 29) }));
        var t = a * Math.PI / 180;
        var tx = c + 81 * Math.sin(t), ty = c - 81 * Math.cos(t);
        var top = svg('text', { x: tx, y: ty - 8, class: 't-four' });
        var bottom = svg('text', { x: tx, y: ty + 10, class: 't-out' });
        if (odds) {
          top.textContent = '4+ ' + pct(odds[z].boundary);
          bottom.textContent = 'W ' + pct(odds[z].out);
        } else {
          var row = model.MIDDLED[cover[z]];
          top.textContent = '4+ ' + (row[4] + row[5]);
          bottom.textContent = keyHints ? keyHints[z] : '';
          bottom.setAttribute('class', 't-name');
        }
        gEl.appendChild(top);
        gEl.appendChild(bottom);
        gEl.addEventListener('pointerdown', function (e) { e.preventDefault(); audio.unlock(); onPick(z, e); });
        gEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') onPick(z, e); });
        s.appendChild(gEl);
      })(z);
    }
    var blk = svg('g', { class: 'wblock' + (best === 6 ? ' best' : ''), role: 'button', 'aria-label': T.block, tabindex: '0' });
    blk.appendChild(svg('circle', { cx: c, cy: c, r: r0 - 4 }));
    var bt = svg('text', { x: c, y: c - 7, class: 't-name' });
    bt.textContent = T.block + (keyHints ? ' ' + keyHints[6] : '');
    var bo = svg('text', { x: c, y: c + 10, class: 't-four' });
    bo.textContent = odds ? 'W ' + pct(odds[6].out) : 'W 0';
    blk.appendChild(bt);
    blk.appendChild(bo);
    blk.addEventListener('pointerdown', function (e) { e.preventDefault(); audio.unlock(); onPick(model.BLOCK, e); });
    blk.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') onPick(model.BLOCK, e); });
    s.appendChild(blk);
    return s;
  }

  /** Six field shapes as small diagrams. rot: 0 or 180 to match the ground. */
  function shapePicker(current, onPick, rot) {
    var g = el('div', 'shapes');
    for (var i = 0; i < model.SHAPES.length; i++) {
      (function (i) {
        var b = el('button', 'shape-btn' + (i === current ? ' on' : ''));
        b.type = 'button';
        b.setAttribute('aria-label', T.shapes[i]);
        b.title = T.shapes[i];
        var s = svg('svg', { viewBox: '-22 -22 44 44', 'aria-hidden': 'true' });
        s.appendChild(svg('ellipse', { cx: 0, cy: 0, rx: 20, ry: 20, fill: 'none', stroke: 'rgba(233,239,230,0.5)', 'stroke-width': 1.2 }));
        s.appendChild(svg('rect', { x: -1.5, y: -5, width: 3, height: 10, fill: '#C8B78F' }));
        var slots = model.SHAPES[i].slots;
        for (var k = 0; k < slots.length; k++) {
          var z = model.slotZone(slots[k]);
          var a = (model.ZONES[z].angle + (rot || 0)) * Math.PI / 180;
          var rr = model.slotDeep(slots[k]) ? 16 : 9;
          s.appendChild(svg('circle', { cx: (rr * Math.sin(a)).toFixed(2), cy: (3 - rr * Math.cos(a)).toFixed(2), r: 2.6, fill: '#E9EFE6' }));
        }
        b.appendChild(s);
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); audio.unlock(); onPick(i); });
        b.addEventListener('click', function (e) { if (e.detail === 0) onPick(i); });
        g.appendChild(b);
      })(i);
    }
    return g;
  }

  // ---------------------------------------------------------------- field drag (on the ground)

  var drag = null;

  function fieldEditable() {
    if (screen === 'play' && session && session.phase === 'field') return { get: function () { return { shape: session.shape, move: session.move }; }, set: function (mv) { session.move = mv; rebuildOver(); renderSolo(); } };
    if (screen === 'duel' && duel && duel.phase === 'field') return { get: function () { return { shape: duel.shape, move: duel.move }; }, set: function (mv) { duel.move = mv; renderDuel(); } };
    return null;
  }

  document.addEventListener('pointerdown', function (e) {
    audio.unlock();
    var ed = fieldEditable();
    if (!ed || drag) return;
    if (e.target.closest && e.target.closest('button, .wheel, .half-deck, .deck, .bug')) return;
    var i = render.fielderAt(e.clientX, e.clientY);
    if (i < 0) return;
    if (e.clientX < 32 || e.clientX > window.innerWidth - 32) return; // the Back gesture's edge
    var cur = ed.get();
    var base = model.SHAPES[cur.shape].slots;
    var field = model.makeField(cur.shape, cur.move);
    drag = { id: e.pointerId, index: i, from: field.slots[i], base: base, shape: cur.shape, ed: ed, x: e.clientX, y: e.clientY, target: -1, ok: false };
    render.setDrag({ index: i, x: e.clientX, y: e.clientY, target: -1, ok: false });
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    var t = render.slotAt(e.clientX, e.clientY);
    var check = moveFor(drag, t);
    drag.target = t;
    drag.ok = !!check;
    render.setDrag({ index: drag.index, x: e.clientX, y: e.clientY, target: t, ok: drag.ok });
  });

  function moveFor(dg, t) {
    if (t < 0 || t === dg.from) return null;
    // one drag per field: the move is always from the shape's own place to an empty one
    var origin = dg.from;
    var cur = dg.ed.get();
    if (cur.move && cur.move.to === dg.from) origin = cur.move.from; // dragging the moved fielder again
    else if (cur.move) return model.canMove(dg.base, dg.from, t) ? { from: dg.from, to: t } : null; // a new fielder: the old move goes back
    if (t === origin) return { reset: true };
    return model.canMove(dg.base, origin, t) ? { from: origin, to: t } : null;
  }

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dg = drag;
    drag = null;
    render.setDrag(null);
    var mv = moveFor(dg, dg.target);
    if (mv) {
      dg.ed.set(mv.reset ? null : mv);
      audio.sfx.tap();
      haptic('light');
    } else if (dg.target >= 0 && dg.target !== dg.from) {
      toast(T.fiveOut);
    }
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', function (e) {
    if (drag && e.pointerId === drag.id) { drag = null; render.setDrag(null); }
  });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------------------------------------------------------------- the duel

  var duel = null;
  var countTimer = 0;

  function startDuel() {
    closeSheet();
    session = null;
    var first = Math.random() < 0.5 ? 'top' : 'bottom';
    duel = {
      innings: [], batFirst: first, batting: first, superOvers: 0, phase: 'field', shape: 0, move: null,
      picks: { top: null, bottom: null }, late: { top: false, bottom: false }, count: 0, t0: 0, o: null,
      result: null, rewarded: false, hint: { top: '', bottom: '' }
    };
    render.clearTraces();
    $('halfTop').classList.toggle('face', coarse);
    show('duel');
    setBanner(false);
    beginInnings();
  }

  function bowlingSide() { return duel.batting === 'top' ? 'bottom' : 'top'; }
  function other(side) { return side === 'top' ? 'bottom' : 'top'; }

  /** The rotation the deck's wheels need, in a half, to match the ground as seen on screen. */
  function rotFor(side) {
    var groundRot = duel.batting === 'top' ? 180 : 0;
    var halfRot = side === 'top' && coarse ? 180 : 0;
    return (groundRot - halfRot + 360) % 360;
  }

  function beginInnings() {
    duel.phase = 'field';
    duel.shape = 0;
    duel.move = null;
    var target = 0;
    var n = duel.innings.length;
    if (n % 2 === 1) target = duel.innings[n - 1].o.runs + 1;
    duel.target = target;
    render.clearTraces();
    renderDuel();
  }

  function duelField() { return model.makeField(duel.shape, duel.move); }

  function startDuelOver() {
    var o = over.create({ target: duel.target, wickets: 2, seed: rng.freshSeed(), field: duelField() });
    duel.o = o;
    duel.innings.push({ batting: duel.batting, o: o });
    duel.phase = 'throw';
    render.setField(o.field.slots, false);
    audio.sfx.tap();
    startThrow();
  }

  function startThrow() {
    duel.picks = { top: null, bottom: null };
    duel.late = { top: false, bottom: false };
    duel.phase = 'throw';
    duel.t0 = performance.now();
    duel.count = 3;
    render.setHot(-1);
    renderDuel();
    audio.sfx.tick(3);
    stopCount();
    countTimer = setTimeout(countStep, BEAT);
  }

  function stopCount() { if (countTimer) { clearTimeout(countTimer); countTimer = 0; } }

  function countStep() {
    countTimer = 0;
    if (!duel || duel.phase !== 'throw') return;
    duel.count -= 1;
    if (duel.count >= 1) {
      audio.sfx.tick(duel.count);
      renderDuelHints();
      countTimer = setTimeout(countStep, BEAT);
    } else {
      audio.sfx.go();
      renderDuelHints();
      countTimer = setTimeout(closeThrow, GRACE);
    }
  }

  /** A pick by one side, judged by its own event time: the first tap during the throw locks it. */
  function duelPick(side, value, e) {
    if (!duel || duel.phase !== 'throw' || duel.picks[side] != null) return;
    var at = e && e.timeStamp ? e.timeStamp : performance.now();
    if (at - duel.t0 > 3 * BEAT + GRACE) return; // after the throw closed: too late
    duel.picks[side] = value;
    audio.sfx.lock();
    haptic('light');
    if (side === 'top') P.seen.duelTop = true; else P.seen.duelBottom = true;
    renderDuelHints();
    lockDeck(side);
    if (duel.picks.top != null && duel.picks.bottom != null) {
      stopCount();
      setTimeout(reveal, 120);
    }
  }

  function closeThrow() {
    countTimer = 0;
    if (!duel || duel.phase !== 'throw') return;
    var bs = bowlingSide();
    if (duel.picks[bs] == null) { duel.picks[bs] = over.LATE; duel.late[bs] = true; }
    if (duel.picks[duel.batting] == null) { duel.picks[duel.batting] = over.LEAVE; duel.late[duel.batting] = true; }
    reveal();
  }

  function reveal() {
    if (!duel || duel.phase !== 'throw') return;
    duel.phase = 'reveal';
    var o = duel.o;
    var d = duel.picks[bowlingSide()];
    var z = duel.picks[duel.batting];
    var e = over.play(o, d, z);
    if (d === over.LATE) audio.sfx.noBall(); else audio.sfx.bowl();
    var info = render.playBall(e, o.index + duel.innings.length * 13, function () { afterDuelBall(); });
    duel.lastE = e;
    duel.lastInfo = info;
    renderDuel();
    setTimeout(function () { ballSound(e); renderDuelHints(); }, reduced() ? 0 : 380);
  }

  /** A duel step that waits for Resume when the pause sheet is open: a throw never starts behind it. */
  function duelStep(fn) {
    if (duel && sheetOpen && sheetOpen.kind === 'pause') duel.deferred = fn; else fn();
  }

  function afterDuelBall() {
    if (!duel) return;
    if (duel.o.done) {
      setTimeout(function () { duelStep(endInnings); }, reduced() ? 200 : 700);
      return;
    }
    setTimeout(function () {
      duelStep(function () { if (duel && duel.phase === 'reveal') startThrow(); });
    }, reduced() ? 300 : 650);
  }

  function endInnings() {
    if (!duel) return;
    var n = duel.innings.length;
    if (n % 2 === 1) {
      // the other side bats next
      duel.phase = 'break';
      duel.batting = other(duel.batting);
      renderDuel();
      setTimeout(function () { duelStep(function () { if (duel && duel.phase === 'break') beginInnings(); }); }, reduced() ? 900 : 1700);
      return;
    }
    var a = duel.innings[n - 2], b = duel.innings[n - 1];
    if (a.o.runs === b.o.runs && duel.superOvers < 3) {
      // a Super Over: the side that batted second bats first
      duel.superOvers += 1;
      duel.phase = 'break';
      duel.batting = b.batting;
      duel.superBreak = true;
      renderDuel();
      setTimeout(function () { duelStep(function () { if (duel && duel.phase === 'break') { duel.superBreak = false; beginInnings(); } }); }, reduced() ? 1200 : 2200);
      return;
    }
    var winner = a.o.runs === b.o.runs ? null : (b.o.result === 'batting' ? b.batting : a.batting);
    duel.result = winner;
    duel.phase = 'done';
    P.duels.played += 1;
    if (winner === 'top') P.duels.top += 1; else if (winner === 'bottom') P.duels.bottom += 1; else P.duels.ties += 1;
    progress.noteFinished(P, 'duel');
    persist();
    audio.sfx.win();
    haptic('success');
    render.setHot(-1);
    renderDuel();
    setBanner(true);
  }

  /** A side's innings in the current pair (the match's two overs, or the latest Super Over pair). */
  function sideScore(side) {
    var n = duel.innings.length;
    if (!n) return null;
    var start = Math.floor((n - 1) / 2) * 2;
    if (duel.phase === 'field' && n % 2 === 0) return null; // a new pair is about to start
    for (var i = start; i < n; i++) if (duel.innings[i].batting === side) return duel.innings[i].o;
    return null;
  }

  function scoreText(o) { return o ? o.runs + '/' + o.out : '0/0'; }

  function renderDuel() {
    if (!duel) return;
    var o = duel.o;
    var fieldNow = duel.phase === 'field' || !o ? duelField() : o.field;
    var cover = model.covers(fieldNow.slots);
    icons.set($('duelPause'), 'pause', T.a11y.pause);
    renderHalf('top', cover);
    renderHalf('bottom', cover);
    renderDuelHints();
    layout(); // after the halves: the ground takes the space between them
    render.setField(fieldNow.slots, duel.phase === 'field');
    render.setLabels(fieldLabels(cover), 'field');
    render.setHeat(null);
    render.setBadge('');
  }

  function keyRow(side) { return side === 'top' ? ['Q', 'W', 'E', 'R', 'T', 'Y', 'U'] : ['Z', 'X', 'C', 'V', 'B', 'N', 'M']; }

  function renderHalf(side, cover) {
    var half = $(side === 'top' ? 'halfTop' : 'halfBottom');
    half.classList.toggle('chalk', side === 'top');
    var deck = half.querySelector('.half-deck');
    clear(deck);
    deck.classList.remove('locked');
    var bug = half.querySelector('.hb-score');
    var note = half.querySelector('.hb-note');
    var mine = sideScore(side), theirs = sideScore(other(side));
    var batting = duel.batting === side;
    bug.textContent = mine ? scoreText(mine) : (batting ? '0/0' : '');
    var bits = [];
    if (duel.phase !== 'done') bits.push(batting ? T.youBat : T.youBowl);
    if (duel.target && duel.phase !== 'done') bits.push(f(T.chaseTarget, { t: duel.target }));
    if (duel.superOvers) bits.push(T.superOver);
    if (duel.o && !duel.o.done && duel.phase !== 'field') bits.push(over.ballsLeft(duel.o) === 1 ? T.ball1Left : f(T.ballsLeft, { b: over.ballsLeft(duel.o) }));
    if (duel.o && duel.o.freeHit && batting) bits.push(T.freeHit);
    note.textContent = bits.join(', ');
    var keys = coarse ? null : keyRow(side);
    if (duel.phase === 'field') {
      if (!batting) {
        deck.appendChild(shapePicker(duel.shape, function (i) { duel.shape = i; duel.move = null; audio.sfx.tap(); renderDuel(); }, rotFor(side)));
        var slots = duelField().slots;
        var fn = el('div', 'field-note');
        fn.appendChild(el('b', '', f(T.ringBadge, { i: 9 - model.deepCount(slots), o: model.deepCount(slots) })));
        fn.appendChild(el('span', '', T.fiveOut));
        deck.appendChild(fn);
        var row = el('div', 'deck-row');
        row.appendChild(btn(T.ready, 'primary', function () { startDuelOver(); }));
        deck.appendChild(row);
      }
      return;
    }
    if (duel.phase === 'done') {
      var stack = el('div', 'stack');
      var row2 = el('div', 'deck-row');
      row2.appendChild(btn(T.nextMatch, 'primary', function (ev) { duelNext(ev.currentTarget); }));
      if (side === 'bottom') {
        row2.appendChild(btn(T.menu, '', goMenu));
        if (shareAvailable()) row2.appendChild(btn(T.share, '', function () { shareDuel(); }));
      }
      stack.appendChild(row2);
      // Remove ads and archive, on its own at most once: after the first finished duel
      if (side === 'bottom' && caps.removeAds && !caps.adFree && !P.seen.removeAdsOffer) {
        P.seen.removeAdsOffer = true;
        persist();
        var offer = el('div', 'offer');
        offer.appendChild(el('p', 'card-meta', T.removeAdsLine));
        var rb = btn(caps.removeAdsPrice ? f(T.removeAdsPrice, { price: caps.removeAdsPrice }) : T.removeAds, 'quiet', function () {
          rb.disabled = true;
          Shell.buyRemoveAds().then(function (r) { rb.disabled = false; toast(T.purchase[r.reason] || T.purchase.failed); caps = Shell.caps; });
        });
        offer.appendChild(rb);
        stack.appendChild(offer);
      }
      deck.appendChild(stack);
      return;
    }
    if (duel.phase === 'break') return;
    var rot = rotFor(side);
    var pick = function (v, e) { duelPick(side, v, e); };
    if (batting) deck.appendChild(zoneWheel(null, pick, rot, -1, cover, keys));
    else deck.appendChild(deliveryGrid(null, pick, -1, rot, keys));
    if (duel.picks[side] != null || duel.phase === 'reveal') deck.classList.add('locked');
  }

  function lockDeck(side) {
    var half = $(side === 'top' ? 'halfTop' : 'halfBottom');
    half.querySelector('.half-deck').classList.add('locked');
  }

  function renderDuelHints() {
    if (!duel) return;
    ['top', 'bottom'].forEach(function (side) {
      var half = $(side === 'top' ? 'halfTop' : 'halfBottom');
      var hint = half.querySelector('.half-hint');
      hint.className = 'half-hint';
      var batting = duel.batting === side;
      var text = '';
      if (duel.phase === 'field') {
        text = batting ? T.waitField : T.setField + '. ' + T.fieldNote;
      } else if (duel.phase === 'throw') {
        if (duel.picks[side] != null) text = T.pickedLock;
        else if (duel.count >= 1) { text = String(duel.count); hint.className = 'half-hint count'; }
        else { text = '\u00a0'; hint.className = 'half-hint count'; }
        var seen = side === 'top' ? P.seen.duelTop : P.seen.duelBottom;
        if (!seen && duel.picks[side] == null && duel.count === 3) { text = batting ? T.tapZone : T.tapBall; hint.className = 'half-hint'; }
      } else if (duel.phase === 'reveal' && duel.lastE) {
        var e = duel.lastE;
        if (duel.late[side]) text = T.late + '. ';
        text += resultWord(e, duel.lastInfo);
        if (e.extra) text += ', ' + T.noBall;
      } else if (duel.phase === 'break') {
        if (duel.superBreak) text = T.superOver + '. ' + (duel.batting === side ? T.inningsBreakBat : T.inningsBreak);
        else text = duel.batting === side ? T.inningsBreakBat : T.inningsBreak;
      } else if (duel.phase === 'done') {
        var n = duel.innings.length;
        var a = duel.innings[n - 2].o, b = duel.innings[n - 1].o;
        var mine = duel.innings[n - 2].batting === side ? a : b, theirs = mine === a ? b : a;
        text = duel.result == null ? T.tie : duel.result === side ? T.youWin : T.theyWin;
        hint.className = 'half-hint count' + (duel.result === side ? '' : ' muted');
        half.querySelector('.hb-note').textContent = f(T.matchScore, { a: scoreText(mine), b: scoreText(theirs) });
      }
      hint.textContent = text;
    });
  }

  function resultWord(e, info) {
    if (e.out) return info && info.kind === 'bowled' ? T.result.bowled : info && info.kind === 'caught' ? T.result.caught : T.result.W;
    return T.result[e.runs] || String(e.runs);
  }

  /** Next match on the duel result: the natural break between duels. */
  function duelNext(button) {
    caps = Shell.caps;
    if (caps.adFree || !progress.shouldAskInterstitial(P, 'duel', duel && duel.rewarded)) { startDuel(); return; }
    button.disabled = true;
    Shell.interstitial('duel_next').then(function (r) {
      button.disabled = false;
      if (r.shown) { progress.noteInterstitialShown(P, 'duel'); persist(); }
      startDuel();
    });
  }

  function shareDuel() {
    var n = duel.innings.length;
    var a = duel.innings[n - 2], b = duel.innings[n - 1];
    var text = share.duelText(T, { a: scoreText(a.o) + ' (' + over.lineText(a.o) + ')', b: scoreText(b.o) + ' (' + over.lineText(b.o) + ')' });
    var card = render.shareCard({ rtl: rtl, title: T.twoPlayers, big: scoreText(a.o) + '  ' + scoreText(b.o), line: over.lineText(a.o), lineLabel: scoreText(a.o), line2: over.lineText(b.o), line2Label: scoreText(b.o), traces: traceSpecs(b.o), field: null });
    doShare(text, share.PLAY_URL, card);
  }

  // ---------------------------------------------------------------- the ladder, archive, settings, how to

  function openSheet(kind, build) {
    var panel = $('sheetPanel');
    clear(panel);
    build(panel);
    sheetOpen = { kind: kind };
    $('sheet').hidden = false;
  }

  function closeSheet() {
    if (!sheetOpen) return false;
    sheetOpen = null;
    $('sheet').hidden = true;
    if (duel && duel.phase === 'paused') startThrow();
    else if (duel && duel.deferred) { var next = duel.deferred; duel.deferred = null; next(); }
    return true;
  }

  tap($('sheet'), function (e) { if (e.target === $('sheet')) closeSheet(); });

  function sheetHead(panel, title) {
    var row = el('div', 'card-row');
    row.appendChild(el('h2', '', title));
    var x = el('button', 'icon-btn');
    x.type = 'button';
    icons.set(x, 'close', T.a11y.close);
    tap(x, closeSheet);
    row.appendChild(x);
    panel.appendChild(row);
  }

  function openLadder() {
    openSheet('ladder', function (panel) {
      sheetHead(panel, T.ladder);
      panel.appendChild(el('p', '', f(T.ladderNote, { r: progress.openRung(P) + 1, s: progress.starsTotal(P) })));
      var grid = el('div', 'ladder-grid');
      var open = progress.openRung(P);
      for (var i = 0; i < sc.LADDER.length; i++) {
        (function (i) {
          var r = sc.rung(i);
          var b = el('button', 'rung' + (i > open ? ' locked' : '') + (i === open ? ' next' : ''));
          b.type = 'button';
          b.appendChild(el('span', 'rn', String(i + 1)));
          b.appendChild(el('span', 'rs', '★★★'.slice(0, P.ladder[i]) || ''));
          b.appendChild(el('span', 'rm', r.mode === 'defend' ? T.defend : T.chase));
          tap(b, function () {
            if (i > open) { toast(T.locked); return; }
            startSolo(r);
          });
          grid.appendChild(b);
        })(i);
      }
      panel.appendChild(grid);
    });
  }

  function openArchive() {
    openSheet('archive', function (panel) {
      sheetHead(panel, T.archive);
      panel.appendChild(el('p', '', T.archiveNote));
      var list = el('div', 'list');
      for (var d = today - 1; d >= 1 && d > today - 120; d--) {
        (function (d) {
          var res = P.daily.results[d];
          var item = el('button', 'item');
          item.type = 'button';
          item.appendChild(el('span', 'strong', f(T.dayN, { n: d })));
          item.appendChild(el('span', 'card-meta', res ? (res.won ? f(T.defended, { t: res.target }) : f(T.notDefended, { t: res.target })) : T.notPlayed));
          tap(item, function () { startSolo(dailySpec(d, 'archive')); });
          list.appendChild(item);
        })(d);
      }
      panel.appendChild(list);
    });
  }

  function openSettings() {
    openSheet('settings', function (panel) {
      sheetHead(panel, T.settings);
      // language
      var lang = el('label', 'setting');
      lang.appendChild(el('span', '', T.language));
      var sel = el('select');
      var opts = [['auto', T.languageAuto]].concat(strings.codes.map(function (c) { return [c, strings.table(c).langName]; }));
      opts.forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; if (P.lang === o[0]) op.selected = true; sel.appendChild(op); });
      sel.addEventListener('change', function () {
        P.lang = sel.value;
        persist();
        applyLanguage();
        renderMenu();
        openSettings();
      });
      lang.appendChild(sel);
      panel.appendChild(lang);
      panel.appendChild(toggleRow(T.sound, P.sound, function () { toggleSound(); openSettings(); }));
      panel.appendChild(toggleRow(T.motion, P.motion === 'reduce' || reduceSystem, function () {
        P.motion = P.motion === 'reduce' ? 'auto' : 'reduce';
        persist();
        applyMotion();
        openSettings();
      }));
      panel.appendChild(btn(T.howToPlay, '', openHowTo));
      if (caps.removeAds) {
        var ads = el('div', 'stack');
        if (!caps.adFree) {
          ads.appendChild(el('p', '', T.removeAdsLine));
          ads.appendChild(btn(caps.removeAdsPrice ? f(T.removeAdsPrice, { price: caps.removeAdsPrice }) : T.removeAds, '', function () { closeSheet(); buyRemoveAds(); }));
        }
        ads.appendChild(btn(T.restore, 'quiet', function () { restorePurchases(); }));
        panel.appendChild(ads);
      }
      if (caps.adFree) panel.appendChild(btn(T.archive, '', openArchive));
      // Privacy options only while the shell says a consent form applies (UMP)
      if (caps.privacyOptions) {
        panel.appendChild(btn(T.privacyOptions, '', function () { Shell.privacyOptions().then(function () { caps = Shell.caps; }); }));
      }
      var link = el('a', 'btn quiet', T.privacyPolicy);
      link.href = PRIVACY_URL;
      link.target = '_blank';
      link.rel = 'noopener';
      panel.appendChild(link);
      panel.appendChild(el('p', 'licences', T.licences));
    });
  }

  function toggleRow(label, value, onTap) {
    var row = el('div', 'setting');
    row.appendChild(el('span', '', label));
    var b = el('button', 'toggle', value ? T.on : T.off);
    b.type = 'button';
    b.setAttribute('aria-pressed', value ? 'true' : 'false');
    tap(b, onTap);
    row.appendChild(b);
    return row;
  }

  function openHowTo() {
    openSheet('how', function (panel) {
      sheetHead(panel, T.howToPlay);
      var box = el('div', 'howto stack');
      T.howTo.forEach(function (p, i) {
        box.appendChild(el('p', '', p));
        if (i === 1) {
          var chart = el('div', 'chart');
          for (var d = 0; d < model.ND; d++) {
            var row = el('div', 'crow');
            row.appendChild(miniWheel(d, 0));
            row.appendChild(el('span', '', T.deliveries[d] + ': ' + T.zones.filter(function (_, z) { return model.OPEN[d][z]; }).join(', ')));
            chart.appendChild(row);
          }
          box.appendChild(chart);
        }
      });
      panel.appendChild(box);
    });
  }

  function openPause() {
    if (screen === 'duel' && duel && duel.phase === 'throw') {
      // a throw in progress is called off and thrown again on resume
      stopCount();
      duel.phase = 'paused';
    }
    openSheet('pause', function (panel) {
      sheetHead(panel, T.paused);
      panel.appendChild(btn(T.resume, 'primary wide', function () { closeSheet(); }));
      panel.appendChild(btn(T.leave, 'wide', function () {
        if (duel) { goMenu(); return; }
        closeSheet();
        if (session && session.kind === 'daily' && session.o && session.o.line.length > 0 && !session.o.done) {
          // leaving a Daily part way counts it as lost, with the balls so far (one try, no way to bank a lead)
          finishSolo();
          return;
        }
        goMenu();
      }));
      if (session && session.kind === 'daily') panel.appendChild(el('p', '', T.leaveDaily));
      panel.appendChild(toggleRow(T.sound, P.sound, function () { toggleSound(); openPause(); }));
    });
  }

  // ---------------------------------------------------------------- keys (desktop and the web)

  window.addEventListener('keydown', function (e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = (e.key || '').toUpperCase();
    if (screen === 'duel' && duel && duel.phase === 'throw') {
      ['top', 'bottom'].forEach(function (side) {
        var i = keyRow(side).indexOf(k);
        if (i < 0) return;
        var batting = duel.batting === side;
        if (!batting && i > 3) return;
        duelPick(side, i, e);
      });
      return;
    }
    if (screen === 'play' && session && session.phase === 'ball' && !sheetOpen) {
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= (session.mode === 'defend' ? 4 : 7)) soloBall(n - 1);
    }
  });

  // ---------------------------------------------------------------- the shell

  Shell.onPause(function () {
    persist();
    var live = duel && (duel.phase === 'throw' || duel.phase === 'reveal' || duel.phase === 'break');
    if (screen === 'duel' && live && !sheetOpen) openPause();
  });
  Shell.onResume(function () {
    var t = daily.dayNumber();
    if (t !== today) { today = t; if (screen === 'menu') renderMenu(); }
  });
  Shell.onChange(function () {
    caps = Shell.caps;
    refreshOffers();
    layout();
  });
  Shell.onBack(function () {
    if (closeSheet()) return true;
    if (screen === 'play' && session && session.phase !== 'done') { openPause(); return true; }
    if (screen === 'duel' && duel && duel.phase !== 'done') { openPause(); return true; }
    if (screen !== 'menu') { goMenu(); return true; }
    return false; // on the menu: the app closes
  });

  // ---------------------------------------------------------------- start

  /** A saved run that will not be resumed. A Daily left part way counts as lost, as leaving it does. */
  function abandonRun(run) {
    var sp = run.spec;
    var had = P.daily.results[sp.day];
    if (sp.kind === 'daily' && !(had && !had.archive) && run.o.line.length > 0) {
      progress.finishDaily(P, sp.day, { won: false, runs: run.o.runs, target: sp.target, line: over.lineText(run.o) });
      persist();
    }
    clearRun();
  }

  function resumeSolo(run) {
    startSolo(run.spec);
    var s = session;
    s.shape = run.shape;
    s.move = run.move;
    s.o = run.o;
    s.freeHitAt = run.freeHitAt;
    s.freeHitUsed = run.freeHitUsed;
    s.rewarded = run.rewarded;
    s.phase = 'ball';
    s.introBall = false;
    render.setField(s.o.field.slots, false);
    renderSolo();
  }

  function firstScreen() {
    var raw = Shell.load('run', null);
    var run = raw ? runlib.restore(raw) : null;
    if (raw && !run) clearRun();
    if (run && run.spec.kind === 'daily' && run.spec.day !== today) { abandonRun(run); run = null; }
    var dailyRun = !!run && run.spec.kind === 'daily';
    if (run && (linkChallenge || (linkDay && linkDay === today && !dailyRun))) { abandonRun(run); run = null; }
    if (run) { resumeSolo(run); return; }
    if (linkChallenge) {
      startSolo({ kind: 'challenge', mode: linkChallenge.mode, target: linkChallenge.target, wickets: linkChallenge.wickets, player: linkChallenge.player, seed: linkChallenge.seed, line: linkChallenge.line });
      return;
    }
    if (linkDay && linkDay === today) {
      var ds = progress.dailyState(P, today);
      if (ds.done) showDailyResult(today);
      else startSolo(dailySpec(today, 'daily'));
      return;
    }
    if (!P.seen.intro) {
      startSolo(sc.rung(0));
      return;
    }
    goMenu();
  }

  render.setFont("'Archivo', system-ui, sans-serif");
  renderMenu();
  firstScreen();
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fontsReady.then(function () { layout(); });
  Shell.ready().then(function (c) {
    caps = c;
    refreshOffers();
    if (screen === 'menu') renderMenu();
  });

  // For the test bots (headless Chrome): a read-only view of the state, only when the bot asks for it
  // before the page loads. A shipped game defines no global of its own.
  if (window.__SLOGSTOP_TEST) window.__slogstop = {
    state: function () {
      return { screen: screen, phase: session ? session.phase : duel ? duel.phase : null, mode: session ? session.mode : null, kind: session ? session.kind : null,
        field: session && session.o && session.o.field ? session.o.field.slots.slice() : null,
        over: session && session.o && session.o.line ? { runs: session.o.runs, out: session.o.out, legal: session.o.legal, done: session.o.done, line: over.lineText(session.o) } : null,
        duel: duel ? { phase: duel.phase, batting: duel.batting, innings: duel.innings.map(function (i) { return { batting: i.batting, runs: i.o.runs, out: i.o.out, line: over.lineText(i.o) }; }), result: duel.result, count: duel.count } : null,
        odds: session && session.phase === 'ball' && session.weights ? (session.mode === 'defend' ? deliveryOdds(session.o, session.weights) : pickOdds(session.o, session.weights)) : null,
        progress: P, render: render.stats(), caps: Shell.caps, sheet: sheetOpen ? sheetOpen.kind : null };
    }
  };
})();
