/* Rucksack: screens, the daily ritual and the words. */
var App = (function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var view = 'camp';
  var campRaf = 0, campStart = 0, mapDrawn = false;
  var pollTimer = 0, permTimer = 0;

  /* Android maps "animations off" to prefers-reduced-motion. When it is set the
     camp still gets painted in full, once, with the flame held at its middle
     value: the motion stops, none of the picture goes away. */
  var motionQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function stillness() { return !!(motionQ && motionQ.matches); }

  function native(fn) { return !!(window.Native && typeof Native[fn] === 'function'); }
  function buzz(ms, amp) {
    if (!Store.all().settings.haptics) return;
    if (native('vibrate')) { try { Native.vibrate(ms, amp || 120); } catch (e) {} }
    else if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
  }

  /* Android registers the step listener before the sensor delivers anything, so
     stepCount() answers -1 for a moment after a cold start or a permission grant.
     Waiting for a real number keeps the baseline honest and the backlog offer alive. */
  var sensorWait = 0;
  function whenSensorReads(cb) {
    clearInterval(sensorWait);
    var raw = Store.sensorRaw();
    if (raw >= 0) { cb(raw); return; }
    var tries = 0;
    sensorWait = setInterval(function () {
      var r = Store.sensorRaw();
      if (r >= 0 || ++tries > 24) { clearInterval(sensorWait); cb(r); }
    }, 250);
  }

  var toastTimer = 0;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  /* ------------------------------------------------------------------ words */
  function kmText(km) { return Content.fmtKm(km) + ' km'; }

  function regionPhrase(reg) {
    var n = reg.name.replace(/^The /, 'the ');
    var t = reg.terrain;
    var prep = 'through ';
    if (t === 'pass' || t === 'cael') prep = 'up into ';
    else if (t === 'lake' || t === 'coast') prep = 'along ';
    else if (t === 'salt' || t === 'steppe' || t === 'downs' || t === 'fen') prep = 'across ';
    return prep + n;
  }

  var REST = [
    'A hearth day. Stayed put, dried things out, and let the fire do the talking.',
    'A hearth day. The road will still be there.',
    'A hearth day. Mended what needed mending and slept badly for no reason.',
    'A hearth day. Watched the weather come in and decided against it.'
  ];

  /** The travelogue line for one date, composed rather than stored. */
  function entryFor(date, forged) {
    var km = Store.kmOn(date), steps = Store.stepsOn(date);
    var from = Store.kmBefore(date), to = from + km;
    var reg = Content.regionAt(to);
    var wx = Content.weatherFor(date, to);
    var h = Content.hash(date + 'entry');
    var day = Store.dayNumber(date);
    var parts = [];

    if (km < 0.15) {
      parts.push(REST[h % REST.length]);
    } else {
      var opener = Content.OPENERS[h % Content.OPENERS.length];
      var crossed = Content.regionAt(from).id !== reg.id;
      var named = crossed || ((h >>> 17) % 3 === 0);
      parts.push(named
        ? opener + ' ' + kmText(km) + ' ' + regionPhrase(reg) + ', in ' + wx.journal + '.'
        : opener + ' ' + kmText(km) + ' in ' + wx.journal + '.');
      var wps = Content.waypointsBetween(from, to);
      if (wps.length === 1) parts.push('Passed ' + wps[0].name + '.');
      else if (wps.length === 2) parts.push('Passed ' + wps[0].name + ' and ' + wps[1].name + '.');
      else if (wps.length > 2) {
        var names = wps.map(function (w) { return w.name; });
        parts.push('Passed ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + '.');
      }
    }

    var met = Store.metOn(date), i;
    for (i = 0; i < met.length; i++) {
      var e = Encounters.byId(met[i]);
      if (e && e.journal) parts.push(e.journal);
    }
    for (i = 0; i < Content.GEAR.length; i++) {
      var g = Content.GEAR[i];
      if (forged[g.id] === date) parts.push('The ' + g.name + ' is finished. ' + g.flourish);
    }
    if (km >= 0.15 && ((h >>> 11) % 5) < 3) {
      var cl = Content.CLOSERS[reg.id] || Content.CLOSERS.reed;
      parts.push(cl[(h >>> 5) % cl.length]);
    }
    return { day: day, date: date, km: km, steps: steps, region: reg, weather: wx, text: parts.join(' ') };
  }

  /* ------------------------------------------------------------- onboarding */
  var obStep = 0, obMode = null, obRaf = 0;

  function obPaint() {
    var cv = $('#obCanvas');
    if (!cv) return;
    var r = cv.getBoundingClientRect();
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var reg = Content.REGIONS[0];
    Paint.camp(c, r.width, r.height, {
      region: reg, weather: Content.weatherFor('2026-05-04', 40), km: 40,
      date: '2026-05-04', t: stillness() ? 0 : performance.now(), gear: { cloak: true }, biscuit: false
    });
    obRaf = stillness() ? 0 : requestAnimationFrame(obPaint);
  }

  function obShow() {
    $$('.ob-card').forEach(function (el) { el.hidden = +el.dataset.step !== obStep; });
    var dots = $('#obDots');
    dots.innerHTML = '';
    for (var i = 0; i < 4; i++) {
      var d = document.createElement('i');
      if (i === obStep) d.className = 'on';
      dots.appendChild(d);
    }
    var next = $('#obNext');
    next.textContent = obStep === 3 ? 'Set out' : 'Next';
    next.disabled = (obStep === 2 && !obMode);
  }

  function obBindings() {
    $('#obNext').onclick = function () {
      if (obStep < 3) { obStep++; obShow(); return; }
      var nm = ($('#obName').value || '').trim().slice(0, 20);
      Store.all().name = nm || 'Wanderer';
      Store.all().onboarded = true;
      if (!Store.all().start) Store.all().start = Store.today();
      // the first camp is always at the gate, so the first thing you do is break it
      Store.all().camp = { km: 0, d: Store.today() };
      Store.save();
      cancelAnimationFrame(obRaf);
      $('#onboard').hidden = true;
      startApp();
    };
    $('#obSensor').onclick = function () {
      if (!Store.sensorAvailable()) {
        $('#obStatus').hidden = false;
        $('#obStatus').textContent = 'This device has no step counter, so Rucksack will let you write your steps down instead.';
        obMode = 'manual'; Store.useManual(); obShow();
        return;
      }
      if (Store.sensorAllowed()) { sensorReady(); return; }
      if (native('requestStepsPermission')) {
        try { Native.requestStepsPermission(); } catch (e) {}
        $('#obStatus').hidden = false;
        $('#obStatus').textContent = 'Waiting for permission to read the step counter.';
        clearInterval(permTimer);
        var tries = 0;
        permTimer = setInterval(function () {
          tries++;
          if (Store.sensorAllowed()) { clearInterval(permTimer); sensorReady(); }
          else if (tries > 40) {
            clearInterval(permTimer);
            $('#obStatus').textContent = 'Permission was not granted. You can write your steps down instead, and turn the counter on later in the ledger.';
          }
        }, 500);
      }
    };
    function sensorReady() {
      $('#obStatus').hidden = false;
      $('#obStatus').textContent = 'The step counter is on. Rucksack reads the total and nothing else.';
      obMode = 'sensor'; obShow();
      whenSensorReads(function (first) { sensorBaseline(first); });
    }
    function sensorBaseline(first) {
      var raw = Store.startSensor(false);
      if (raw < 0) raw = first;
      if (raw > 800) {
        $('#obBacklog').hidden = false;
        var claim = Math.min(raw, Store.DAY_CAP_KM * Content.STEPS_PER_KM);
        $('#obBacklogLine').textContent = 'Your phone has counted ' + raw.toLocaleString() +
          ' steps since it last started up. That is ' + kmText(claim / Content.STEPS_PER_KM) + ' you have already walked.';
        $('#obClaim').onclick = function () {
          Store.addSteps(claim);
          $('#obBacklog').hidden = true;
          $('#obStatus').textContent = 'Counted. You are already on the road.';
        };
        $('#obSkip').onclick = function () { $('#obBacklog').hidden = true; };
      }
    }
    $('#obManual').onclick = function () {
      Store.useManual();
      obMode = 'manual';
      $('#obBacklog').hidden = true;
      $('#obStatus').hidden = false;
      $('#obStatus').textContent = "You will write today's step count into the ledger. Nothing else changes.";
      obShow();
    };
  }

  /* ------------------------------------------------------------- the ribbon
     The signature element: the whole road as contour lines with the walked part
     inked across them toward a low sun, which is Cael. Built once. */
  var ribbon = null;
  function ensureRibbon() {
    if (ribbon) return ribbon;
    var band = $('#ribbonBand');
    if (!band) return null;
    ribbon = Marks.ribbon();
    band.appendChild(ribbon.node);
    return ribbon;
  }
  function renderRibbon() {
    var r = ensureRibbon();
    if (!r) return;
    var total = Math.min(Store.totalKm(), Content.TOTAL_KM);
    var camp = Math.min(Store.campKm(), Content.TOTAL_KM);
    r.set(total / Content.TOTAL_KM, camp / Content.TOTAL_KM);
    var pct = total / Content.TOTAL_KM * 100;
    $('#ribbonPct').textContent = (pct >= 1 ? Math.round(pct) : pct.toFixed(1)) + '% walked';
  }

  /* -------------------------------------------------------------- the camp */
  function gearMap() {
    var st = Store.streak(), m = {};
    for (var k in st.forged) m[k] = st.forged[k];
    return m;
  }
  function gearFlags() {
    var f = {}, m = gearMap();
    for (var k in m) f[k] = true;
    return f;
  }

  function campLoop() {
    var cv = $('#campCanvas');
    if (!cv || $('#v-camp').hidden) { campRaf = 0; return; }
    var still = stillness();
    var r = cv.getBoundingClientRect();
    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    var W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var km = Store.campKm();
    var d = Store.all().camp && Store.all().camp.d ? Store.all().camp.d : Store.today();
    Paint.camp(c, r.width, r.height, {
      region: Content.regionAt(km), weather: Content.weatherFor(d, km),
      km: km, date: d, t: still ? 0 : performance.now() - campStart,
      gear: gearFlags(), biscuit: !!Store.all().flags.biscuit
    });
    campRaf = still ? 0 : requestAnimationFrame(campLoop);
  }

  function renderCamp() {
    var km = Store.campKm(), total = Store.totalKm();
    var db = Store.all();
    var d = db.camp && db.camp.d ? db.camp.d : Store.today();
    var reg = Content.regionAt(km);
    var wx = Content.weatherFor(d, km);
    var last = Content.lastWaypoint(km);
    var next = Content.nextWaypoint(total);
    var st = Store.streak();

    $('#campWeather').textContent = wx.camp;
    renderRibbon();
    $('#campDay').textContent = 'Day ' + Store.dayNumber(Store.today()) + ', ' + Store.longDate(Store.today());

    if (km <= 0.05) $('#campPlace').textContent = "Fenwarden's Gate";
    else if (last.km >= Content.TOTAL_KM) $('#campPlace').textContent = last.name;
    else {
      var past = Math.round((km - last.km) * 10) / 10;
      $('#campPlace').textContent = past < 0.6 ? last.name : (Content.fmtKm(past) + ' km past ' + last.name);
    }
    $('#campNote').textContent = reg.name + '. ' + reg.line;

    $('#figToday').textContent = Content.fmtKm(Store.kmOn(Store.today()));
    $('#figTotal').textContent = Content.fmtKm(total);
    $('#figStreak').textContent = st.current;

    if (next) {
      var togo = next.km - total;
      $('#aheadLine').innerHTML = '<span>Ahead</span> ';
      $('#aheadLine').appendChild(document.createTextNode(next.name + ', ' + kmText(Math.max(0, togo)) + ' on.'));
    } else {
      $('#aheadLine').innerHTML = '<span>The end</span> ';
      $('#aheadLine').appendChild(document.createTextNode('The road is finished. You walked all of it.'));
    }

    var ng = Store.newGround();
    if (ng >= 0.1) {
      $('#arriveBox').hidden = false;
      $('#arriveLine').textContent = 'You have covered ' + kmText(ng) + ' since you made camp here.';
    } else {
      $('#arriveBox').hidden = true;
    }

    renderEncounters();

    var nx = Content.nextGear(st.best);
    if (nx) {
      var need = nx.days - st.current;
      $('#forgeLine').textContent = need > 0
        ? nx.name + ' takes ' + nx.days + ' days of walking. ' + need + ' more to go, and you have ' + st.hearth + ' rest ' + (st.hearth === 1 ? 'day' : 'days') + ' banked this week.'
        : nx.name + ' is being forged tonight.';
    } else {
      $('#forgeLine').textContent = 'Every piece of gear on the road is forged. There is nothing left to earn but the road itself.';
    }

    if (!campRaf) { campStart = performance.now(); campLoop(); }
  }

  function renderEncounters() {
    var list = $('#encList');
    list.innerHTML = '';
    var pending = Store.pendingEncounters().slice(0, 3);
    var i;
    for (i = 0; i < pending.length; i++) {
      list.appendChild(encCard(pending[i], true));
    }
    if (!pending.length) {
      var today = Store.metOn(Store.today());
      for (i = 0; i < today.length; i++) {
        var e = Encounters.byId(today[i]);
        if (e) list.appendChild(encCard(e, false));
      }
    }
  }

  function encCard(e, fresh) {
    var el = document.createElement('button');
    el.className = 'enc' + (fresh ? ' fresh' : '');
    var who = e.who ? Encounters.person(e.who) : null;
    el.innerHTML =
      '<span class="enc-k">' + (fresh ? 'Someone is here' : 'Earlier today') + '</span>' +
      '<span class="enc-t"></span>' +
      '<span class="enc-w"></span>';
    el.querySelector('.enc-t').textContent = e.title;
    el.querySelector('.enc-w').textContent = who ? who.name + ', ' + who.role : 'On the road';
    el.onclick = function () { openEncounter(e); };
    return el;
  }

  function openEncounter(e) {
    var was = !Store.all().met[e.id];
    Store.meet(e);
    var who = e.who ? Encounters.person(e.who) : null;
    var html = '<p class="sh-k">' + (who ? esc(who.name) + ', ' + esc(who.role) : 'On the road') + '</p>' +
               '<h2 id="sheetTitle">' + esc(e.title) + '</h2>';
    for (var i = 0; i < e.lines.length; i++) html += '<p>' + esc(e.lines[i]) + '</p>';
    if (e.gift) {
      var k = Encounters.keep(e.gift);
      html += '<div class="gift"><b>' + esc(k.name) + '</b><span>' + esc(e.gives || '') + '</span></div>';
    }
    openSheet(html);
    if (was) { buzz(28, 140); renderCamp(); }
  }

  /** A drawn empty state, in the same ink as the map. Never a bare sentence. */
  function blank(kind, line, inline) {
    var wrap = document.createElement('div');
    wrap.className = 'blank';
    var d = Marks.drawing(kind);
    if (d) wrap.appendChild(d);
    var p = document.createElement('p');
    p.textContent = line;
    wrap.appendChild(p);
    return inline ? wrap : wrap;
  }

  /** The app writes dates one way everywhere: 7 Sep 2026, 08:22. */
  function readTime(ms) {
    var dt = new Date(ms);
    var mm = dt.getMinutes();
    return Store.shortDate(Store.ymd(dt)) + ', ' + dt.getHours() + ':' + (mm < 10 ? '0' + mm : mm);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function doBreakCamp() {
    var from = Store.campKm();
    var to = Store.totalKm();
    var wps = Content.waypointsBetween(from, to);
    Store.pitchCamp();
    campStart = performance.now();
    renderCamp();
    MapView.invalidate();
    if (wps.length) {
      buzz(46, 180);
      toast('Reached ' + wps[wps.length - 1].name);
    } else buzz(20, 90);
  }

  /* --------------------------------------------------------------- the map */
  function renderMapChrome() {
    var total = Store.totalKm();
    var reg = Content.regionAt(total);
    var next = Content.nextWaypoint(total);
    $('#mapRegion').textContent = reg.name;
    $('#mapKm').textContent = Content.fmtKm(Math.min(total, Content.TOTAL_KM)) + ' of ' + Content.fmtKm(Content.TOTAL_KM) + ' km';
    $('#mapFoot').textContent = next
      ? next.name + ' is ' + kmText(next.km - total) + ' on.'
      : 'The road ends here, and you walked all of it.';
  }

  function pickWaypoint(wp) {
    var total = Store.totalKm();
    var reached = wp.km <= total;
    var html = '<p class="sh-k">' + (reached ? 'Behind you, at ' + Content.fmtKm(wp.km) + ' km' : kmText(wp.km - total) + ' ahead') + '</p>' +
               '<h2 id="sheetTitle">' + esc(wp.name) + '</h2>';
    if (wp.note) html += '<p>' + esc(wp.note) + '</p>';
    html += '<p class="fine">' + esc(Content.regionAt(wp.km).name) + '. ' + esc(Content.regionAt(wp.km).line) + '</p>';
    openSheet(html);
  }

  /* ----------------------------------------------------------- the journal */
  function renderJournal() {
    var keys = Store.dayKeys().slice().reverse();
    var forged = gearMap();
    var list = $('#journalList');
    list.innerHTML = '';
    var db = Store.all();
    var walked = 0, i;
    for (i = 0; i < keys.length; i++) if (Store.walkedOn(keys[i])) walked++;
    var kept = Store.firstDay();
    $('#journalLede').textContent = kept
      ? 'Kept since ' + Store.shortDate(kept) + '. ' + walked + (walked === 1 ? ' day walked, ' : ' days walked, ') + Content.fmtKm(Store.totalKm()) + ' km on the road.'
      : 'Nothing written yet.';

    // there is nothing to export until the first day is on the page
    $('#journalExport').hidden = !keys.length;

    if (!keys.length) {
      list.className = '';
      list.appendChild(blank('journal', 'The first page is written the first day you walk. Nothing is asked of you but the walking.'));
      return;
    }
    list.className = 'stagger';
    var lastRegion = null;
    for (i = 0; i < keys.length; i++) {
      var en = entryFor(keys[i], forged);
      if (lastRegion !== en.region.id) {
        var h = document.createElement('p');
        h.className = 'chapter';
        h.textContent = en.region.name;
        list.appendChild(h);
        lastRegion = en.region.id;
      }
      var art = document.createElement('article');
      art.className = 'entry' + (en.km < 0.15 ? ' rest' : '');
      var head = document.createElement('p');
      head.className = 'entry-head';
      head.innerHTML = '<b></b><span></span>';
      head.querySelector('b').textContent = 'Day ' + en.day;
      head.querySelector('span').textContent = Store.shortDate(en.date) + (en.km >= 0.15 ? ' · ' + Content.fmtKm(en.km) + ' km' : '');
      var body = document.createElement('p');
      body.className = 'entry-body';
      body.textContent = en.text;
      art.appendChild(head); art.appendChild(body);
      list.appendChild(art);
    }
  }

  function journalText() {
    var keys = Store.dayKeys(), forged = gearMap(), db = Store.all();
    var out = ['Rucksack: the crossing of Elsewhere', db.name || 'Wanderer', ''];
    out.push('Total walked: ' + Content.fmtKm(Store.totalKm()) + ' km of 3,500');
    out.push('');
    for (var i = 0; i < keys.length; i++) {
      var en = entryFor(keys[i], forged);
      out.push('Day ' + en.day + '  ' + Store.shortDate(en.date) + '  ' +
               (en.km >= 0.15 ? Content.fmtKm(en.km) + ' km' : 'rest') + '  ' + en.steps.toLocaleString() + ' steps');
      out.push(en.text);
      out.push('');
    }
    return out.join('\n');
  }

  /* -------------------------------------------------------------- the pack */
  function renderPack() {
    var db = Store.all(), st = Store.streak(), forged = st.forged;
    var cv = $('#packCanvas');
    var r = cv.getBoundingClientRect();
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    Paint.wanderer(c, r.width, r.height, gearFlags(), !!db.flags.biscuit);

    $('#packName').textContent = db.name || 'Wanderer';
    var count = Object.keys(forged).length;
    $('#packLine').textContent = count
      ? count + ' of ' + Content.GEAR.length + ' pieces forged, longest unbroken walk ' + st.best + ' days.'
      : 'Nothing forged yet. Three days of walking makes the first thing.';

    var grid = $('#gearGrid');
    grid.innerHTML = '';
    grid.className = 'grid stagger';
    for (var i = 0; i < Content.GEAR.length; i++) {
      var g = Content.GEAR[i];
      var has = !!forged[g.id];
      var el = document.createElement('button');
      el.className = 'item' + (has ? '' : ' locked');
      el.innerHTML = '<canvas class="ic"></canvas><b></b><span></span>';
      el.querySelector('b').textContent = has ? g.name : g.days + ' days';
      el.querySelector('span').textContent = has ? Store.shortDate(forged[g.id]) : 'not yet forged';
      drawIcon(el.querySelector('.ic'), g.id, has);
      (function (g, has) {
        el.onclick = function () {
          var html = '<p class="sh-k">' + (has ? 'Forged ' + Store.shortDate(forged[g.id]) : 'Forged on day ' + g.days + ' of an unbroken walk') + '</p>' +
                     '<h2 id="sheetTitle">' + esc(g.name) + '</h2><p>' + esc(g.line) + '</p>' +
                     '<p class="fine">' + esc(g.from) + '</p>';
          openSheet(html);
        };
      })(g, has);
      grid.appendChild(el);
    }

    var kg = $('#keepGrid');
    kg.innerHTML = '';
    var keys = Object.keys(db.keeps);
    $('#keepNote').textContent = keys.length
      ? 'Things people put into your hands on the road. Not one of them is worth money, which is rather the point.'
      : 'People give things to walkers who are still walking.';
    kg.className = keys.length ? 'grid stagger' : 'blank';
    if (!keys.length) kg.appendChild(blank('keeps', 'Nothing in the pack yet. The first thing anyone gives you is a brass button, twenty two kilometres in.', true));
    for (var j = 0; j < keys.length; j++) {
      var k = Encounters.keep(keys[j]);
      if (!k) continue;
      var e2 = document.createElement('button');
      e2.className = 'item';
      e2.innerHTML = '<canvas class="ic"></canvas><b></b><span></span>';
      e2.querySelector('b').textContent = k.name;
      e2.querySelector('span').textContent = Store.shortDate(db.keeps[keys[j]]);
      drawIcon(e2.querySelector('.ic'), keys[j], true);
      (function (k, when) {
        e2.onclick = function () {
          openSheet('<p class="sh-k">Given ' + esc(Store.shortDate(when)) + '</p><h2 id="sheetTitle">' +
                    esc(k.name) + '</h2><p>' + esc(k.line) + '</p>');
        };
      })(k, db.keeps[keys[j]]);
      kg.appendChild(e2);
    }

    var bc = $('#biscuitCard');
    var metDog = db.met['dog1'];
    if (db.flags.biscuit) {
      bc.hidden = false;
      bc.innerHTML = '<canvas class="dogc"></canvas><div><p class="k">Biscuit</p>' +
        '<p>Brown, mostly, with one ear that has an argument with the other. He joined at ' +
        Content.fmtKm(metDog ? metDog.km : 430) + ' km and stayed because you kept going. He is not a reward. He made up his own mind.</p>' +
        '<p class="fine">Walking since ' + Store.shortDate(db.flags.biscuit) + '.</p></div>';
      var dc = bc.querySelector('.dogc');
      var dr = dc.getBoundingClientRect();
      dc.width = Math.round(dr.width * dpr); dc.height = Math.round(dr.height * dpr);
      var dctx = dc.getContext('2d');
      dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Paint.dog(dctx, dr.width * 0.5, dr.height * 0.86, dr.height * 0.55, '#3B2E20');
    } else if (metDog) {
      bc.hidden = false;
      var run = Store.runSince(metDog.d);
      var runLine = run === 0
        ? 'Your run is back to nothing, so he is still waiting.'
        : 'You are ' + (run === 1 ? 'one day' : run === 2 ? 'two days' : run + ' days') + ' in.';
      bc.innerHTML = '<div><p class="k">The brown dog</p><p>He is keeping his distance and waiting to see whether you are the sort who keeps going. ' +
        'Three days in a row does it. ' + runLine + '</p></div>';
    } else {
      bc.hidden = true;
    }
  }

  function drawIcon(cv, id, on) {
    var r = cv.getBoundingClientRect();
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var w = r.width || 46, h = r.height || 46;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    Paint.item(c, id, w / 2, h / 2, Math.min(w, h) * 0.78, on ? '#2F5D50' : 'rgba(86,80,63,0.42)');
  }

  /* ------------------------------------------------------------ the ledger */
  function renderLedger() {
    var db = Store.all();
    var sensor = Store.sensorAvailable();
    var allowed = Store.sensorAllowed();
    var card = $('#sourceCard');
    var html = '';
    if (db.mode === 'sensor' && allowed) {
      html = '<p class="k">This phone is counting</p>' +
        '<p>Rucksack reads the step counter built into the phone. It keeps counting while the app is closed, and the app banks whatever is new each time you open it.</p>' +
        '<p class="fine">Last read: ' + (db.sensor.at ? readTime(db.sensor.at) : 'not yet') +
        '. Counter since the phone last started: ' + (db.sensor.raw >= 0 ? db.sensor.raw.toLocaleString() : 'unavailable') + '.</p>' +
        '<p class="fine">If the phone restarts, the steps taken between the restart and the next time you open Rucksack are lost. That is a limit of the sensor, not a choice.</p>' +
        '<button class="btn ghost small" id="toManual">Write my steps down instead</button>';
    } else if (sensor && !allowed) {
      html = '<p class="k">The counter is off</p>' +
        '<p>This phone has a step counter, but Rucksack does not have permission to read it yet.</p>' +
        '<button class="btn small" id="askPerm">Turn the step counter on</button>';
    } else if (!sensor) {
      html = '<p class="k">You are writing them down</p>' +
        '<p>This device has no step counter that Rucksack can read, so you keep the ledger yourself. Write in the total your phone or watch shows for today, and the road moves.</p>';
    } else {
      html = '<p class="k">You are writing them down</p>' +
        '<p>Rucksack is not reading the counter. Write in the total your phone or watch shows for today.</p>' +
        '<button class="btn small" id="toSensor">Let this phone count instead</button>';
    }
    card.innerHTML = html;
    if ($('#toManual')) $('#toManual').onclick = function () { Store.useManual(); renderLedger(); toast('Writing them down.'); };
    if ($('#toSensor')) $('#toSensor').onclick = function () {
      whenSensorReads(function () { Store.startSensor(false); renderLedger(); });
      toast('The phone is counting.');
    };
    if ($('#askPerm')) $('#askPerm').onclick = function () {
      if (native('requestStepsPermission')) { try { Native.requestStepsPermission(); } catch (e) {} }
      clearInterval(permTimer);
      var n = 0;
      permTimer = setInterval(function () {
        if (Store.sensorAllowed()) {
          clearInterval(permTimer);
          whenSensorReads(function () { Store.startSensor(false); renderLedger(); toast('The phone is counting.'); });
        }
        else if (++n > 40) clearInterval(permTimer);
      }, 500);
    };

    var manual = !(db.mode === 'sensor' && allowed);
    $('#manualCard').hidden = !manual;
    if (manual) $('#manualSteps').value = Store.stepsOn(Store.today()) || '';

    var list = $('#ledgerList');
    list.innerHTML = '';
    var keys = Store.dayKeys().slice(-30).reverse();
    if (!keys.length) {
      list.className = '';
      list.appendChild(blank('ledger', 'Nothing counted yet. The first number lands the first time you walk about a kilometre.'));
    } else {
      list.className = 'ledger stagger';
    }
    for (var i = 0; i < keys.length; i++) {
      var d = keys[i], row = document.createElement('div');
      row.className = 'lrow';
      var e = Store.dayOf(d);
      row.innerHTML = '<span class="ld"></span><span class="ls"></span><span class="lk"></span>';
      row.querySelector('.ld').textContent = Store.shortDate(d);
      row.querySelector('.ls').textContent = e.steps.toLocaleString() + ' steps';
      row.querySelector('.lk').textContent = Content.fmtKm(e.km) + ' km' + (e.capped ? ' (capped)' : '');
      if (e.capped) row.classList.add('capped');
      if (!Store.walkedOn(d)) row.classList.add('rest');
      list.appendChild(row);
    }

    $('#setName').value = db.name || '';
    $('#setHaptics').checked = db.settings.haptics !== false;
    $('#aboutPerms').textContent = 'Permissions declared: physical activity, for the step counter, and vibration. No internet, no location, no account.';
  }

  /** Inline, next to the field it belongs to. Nothing in this app uses alert(). */
  function manualError(msg) {
    var el = $('#manualErr'), input = $('#manualSteps');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
    input.classList.toggle('bad', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) input.focus();
  }

  /* -------------------------------------------------------------- exports */
  function saveFile(name, mime, text) {
    if (native('saveFile')) {
      try {
        var b64 = btoa(unescape(encodeURIComponent(text)));
        var uri = Native.saveFile(name, mime, b64);
        if (uri) { toast('Saved to your downloads.'); return; }
      } catch (e) {}
    }
    try {
      var blob = new Blob([text], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('Saved.');
    } catch (e) { toast('Could not save the file.'); }
  }

  /* ---------------------------------------------------------------- sheet */
  function openSheet(html) {
    $('#sheetBody').innerHTML = html;
    $('#sheet').hidden = false;
    document.body.classList.add('locked');
    requestAnimationFrame(function () { $('#sheet').classList.add('on'); });
  }
  function closeSheet() {
    $('#sheet').classList.remove('on');
    document.body.classList.remove('locked');
    setTimeout(function () { $('#sheet').hidden = true; }, 220);
  }

  /* ------------------------------------------------------------ navigation */
  function show(v) {
    view = v;
    $$('.view').forEach(function (el) { el.hidden = el.id !== 'v-' + v; });
    $$('.tab').forEach(function (t) { t.classList.toggle('on', t.dataset.view === v); });
    if (v === 'camp') renderCamp();
    if (v === 'map') {
      // the first tile of the continent takes a moment to draw, so say so
      var wait = $('#mapWait');
      if (wait && !mapDrawn) wait.hidden = false;
      MapView.resize();
      renderMapChrome();
      // coming back to a map you left somewhere else, go find the wanderer again
      if (!MapView.seesKm(Store.totalKm())) MapView.focus(Store.totalKm(), Math.max(0.9, MapView.scale()));
      MapView.invalidate();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          mapDrawn = true;
          if (wait) wait.hidden = true;
        });
      });
    }
    if (v === 'journal') renderJournal();
    if (v === 'pack') renderPack();
    if (v === 'ledger') renderLedger();
    var sc = $('#v-' + v + ' .scroller');
    if (sc) sc.scrollTop = 0;
  }

  function refresh() {
    if (view === 'camp') renderCamp();
    else if (view === 'map') { renderMapChrome(); MapView.invalidate(); }
    else if (view === 'journal') renderJournal();
    else if (view === 'pack') renderPack();
    else if (view === 'ledger') renderLedger();
  }

  /* Starting twice would bind the map gestures twice, so every pan would move
     the camera two or three times as far. It can only happen from a stray
     second click on a button that is already gone, but the guard is free. */
  var started = false;
  function startApp() {
    if (started) return;
    started = true;
    $('#tabs').hidden = false;
    $$('.tab').forEach(function (t) {
      var i = t.querySelector('.ti');
      var g = Marks.icon(t.dataset.view);
      if (i && g) { i.innerHTML = ''; i.appendChild(g); }
    });
    [['#mapMe', 'you'], ['#mapFit', 'all'], ['#mapIn', 'plus'], ['#mapOut', 'minus']].forEach(function (pair) {
      var b = $(pair[0]), g = Marks.icon(pair[1]);
      if (b && g) { b.innerHTML = ''; b.appendChild(g); }
    });
    MapView.init($('#mapCanvas'), pickWaypoint);
    MapView.focus(Store.totalKm(), 0.9);
    Store.pollSensor();
    show('camp');
    startPolling();
    if (Store.all().mode === 'sensor' && Store.sensorRaw() < 0) {
      whenSensorReads(function () { if (Store.pollSensor() > 0) refresh(); });
    }
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (Store.pollSensor() > 0) refresh();
    }, 30000);
  }

  function bind() {
    $$('.tab').forEach(function (t) { t.onclick = function () { show(t.dataset.view); }; });
    $('#breakCamp').onclick = doBreakCamp;
    $('#sheetClose').onclick = closeSheet;
    $('#sheetScrim').onclick = closeSheet;
    $('#mapMe').onclick = function () { MapView.focus(Store.totalKm(), Math.max(0.9, MapView.scale())); };
    $('#mapFit').onclick = function () { MapView.fit(); };
    $('#mapIn').onclick = function () { MapView.zoomBy(1.6); };
    $('#mapOut').onclick = function () { MapView.zoomBy(1 / 1.6); };
    $('#journalExport').onclick = function () { saveFile('rucksack-journal.txt', 'text/plain', journalText()); };
    $('#expJournal').onclick = function () { saveFile('rucksack-journal.txt', 'text/plain', journalText()); };
    $('#expData').onclick = function () { saveFile('rucksack-data.json', 'application/json', JSON.stringify(Store.exportObject(), null, 2)); };
    $('#manualSave').onclick = function () {
      var raw = ($('#manualSteps').value || '').trim();
      // a number field accepts exponents, and parseInt('5e3') is 5, so read the
      // whole number and round it rather than reading the first digits of it
      var v = Number(raw);
      if (raw === '' || !isFinite(v)) return manualError('Write in a number of steps first.');
      v = Math.trunc(v);          // a part of a step is not a step you took
      if (v < 0) return manualError('A day cannot have fewer than no steps.');
      if (v > Store.MAX_DAY_STEPS) {
        return manualError('That is more than ' + Store.MAX_DAY_STEPS.toLocaleString() +
          ' steps, which is further than anyone walks in a day.');
      }
      manualError(null);
      var before = Store.totalKm();
      Store.setSteps(Store.today(), v);
      renderLedger();
      buzz(18, 90);
      var gained = Store.totalKm() - before;
      toast(gained > 0 ? 'Counted. ' + kmText(gained) + ' further on.' : 'Ledger updated.');
    };
    $('#manualSteps').oninput = function () { manualError(null); };
    $('#setNameSave').onclick = function () {
      Store.all().name = ($('#setName').value || '').trim().slice(0, 20) || 'Wanderer';
      Store.save(); toast('Saved.');
    };
    $('#setHaptics').onchange = function () {
      Store.all().settings.haptics = $('#setHaptics').checked;
      Store.save();
      if ($('#setHaptics').checked) buzz(24, 120);
    };
    $('#eraseBtn').onclick = function () {
      var b = $('#eraseBtn');
      if (b.dataset.armed) {
        Store.erase();
        location.reload();
        return;
      }
      b.dataset.armed = '1';
      b.textContent = 'Tap again to erase everything';
      setTimeout(function () { delete b.dataset.armed; b.textContent = 'Erase everything'; }, 4000);
    };
    window.addEventListener('resize', function () {
      if (view === 'map') MapView.resize();
      if (view === 'pack') renderPack();
    });
  }

  function init() {
    bind();
    obBindings();
    if (Store.all().onboarded) startApp();
    else {
      $('#onboard').hidden = false;
      var m = $('#obMark');
      if (m) m.appendChild(Marks.mark(66));
      obShow();
      obPaint();
      if (!Store.sensorAvailable()) {
        $('#obSensor').textContent = 'No step counter on this device';
        $('#obSensor').classList.add('ghost');
      }
    }
  }

  /* Called by the Android shell. */
  function back() {
    if (!$('#sheet').hidden) { closeSheet(); return true; }
    // an onboarding card past the first is a screen you can leave: Back steps
    // back through the cards and only gives up the gesture at the first one.
    if (!$('#onboard').hidden) {
      if (obStep > 0) { obStep--; obShow(); return true; }
      return false;
    }
    if (view !== 'camp') { show('camp'); return true; }
    return false;
  }
  function onResume() {
    if (!Store.all().onboarded) {
      // onPause stops the onboarding plate as well; without this it stays a
      // frozen frame for the rest of the run
      if (!$('#onboard').hidden && !obRaf) obPaint();
      return;
    }
    Store.pollSensor();
    refresh();
    startPolling();
    if (view === 'camp' && !campRaf) { campStart = performance.now(); campLoop(); }
    // Android re-registers the sensor listener as the app comes back, so the
    // first read after a resume can still be -1. Wait for a real one rather
    // than leaving the day's walk uncounted until the next poll.
    if (Store.all().mode === 'sensor' && Store.sensorRaw() < 0) {
      whenSensorReads(function () { if (Store.pollSensor() > 0) refresh(); });
    }
  }
  /* Nothing may keep running behind a paused app: not the paint loop, not the
     sensor poll, and not the timer that waits for a permission answer. */
  function onPause() {
    if (campRaf) { cancelAnimationFrame(campRaf); campRaf = 0; }
    if (obRaf) { cancelAnimationFrame(obRaf); obRaf = 0; }
    clearInterval(pollTimer); pollTimer = 0;
    clearInterval(permTimer); permTimer = 0;
    clearInterval(sensorWait); sensorWait = 0;
    clearTimeout(toastTimer);
    var t = $('#toast'); if (t) t.classList.remove('on');
  }

  document.addEventListener('DOMContentLoaded', init);

  return { back: back, onResume: onResume, onPause: onPause, show: show, go: show,
           refresh: refresh, toast: toast, entryFor: entryFor, breakCamp: doBreakCamp,
           openEncounter: openEncounter, closeSheet: closeSheet };
})();

// Classic scripts keep a top-level var out of window in some engines, and the
// Android shell looks for window.App for the Back gesture.
window.App = App;
