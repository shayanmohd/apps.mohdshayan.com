/* Rucksack: the only thing that touches storage.
   One localStorage key. Steps in, kilometres out, and everything else is
   recomputed from the ledger so a gap heals itself. */
var Store = (function () {
  'use strict';

  var KEY = 'rucksack.v1';
  var DAY_CAP_KM = 40;              // walking marathons count, car journeys mostly do not
  var WALKED_STEPS = 1200;          // about a kilometre: the day counts toward a streak
  var HEARTH_PER_WEEK = 2;          // rest days a week that hold a streak open
  var MAX_DELTA = 60000;            // one sensor jump larger than this is not a walk
  var MAX_DAY_STEPS = 120000;       // about 90 km on foot: past any real day, and the ledger stays readable

  function defaults() {
    return {
      onboarded: false,
      name: '',
      start: null,                  // 'YYYY-MM-DD' of the first day on the road
      mode: 'manual',               // 'sensor' when the phone counts, 'manual' when you write it down
      sensor: { raw: -1, at: 0 },   // last cumulative reading from the phone
      days: {},                     // 'YYYY-MM-DD' -> { steps, km, capped }
      met: {},                      // encounter id -> { d, km }
      keeps: {},                    // keepsake id -> 'YYYY-MM-DD'
      flags: {},                    // biscuit: 'YYYY-MM-DD'
      camp: null,                   // { km, d } the camp currently pitched
      settings: { haptics: true, sound: false }
    };
  }

  var db = load();

  function load() {
    var d = defaults();
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return d;
      var p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return d;
      d.onboarded = !!p.onboarded;
      d.name = typeof p.name === 'string' ? p.name.slice(0, 24) : '';
      d.start = typeof p.start === 'string' ? p.start : null;
      d.mode = p.mode === 'sensor' ? 'sensor' : 'manual';
      if (p.sensor && typeof p.sensor.raw === 'number') d.sensor = { raw: p.sensor.raw, at: p.sensor.at || 0 };
      if (p.days && typeof p.days === 'object') {
        for (var k in p.days) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
          var e = p.days[k];
          if (!e) continue;
          var steps = Math.min(MAX_DAY_STEPS, Math.max(0, Math.round(Number(e.steps) || 0)));
          d.days[k] = { steps: steps, km: kmFromSteps(steps).km, capped: kmFromSteps(steps).capped };
        }
      }
      // A phone clock moved backwards, or a record written before the ledger,
      // must never leave `start` later than the earliest day counted.
      var ks = Object.keys(d.days).sort();
      if (ks.length && (!d.start || ks[0] < d.start)) d.start = ks[0];
      if (p.met && typeof p.met === 'object') {
        for (var m in p.met) {
          var v = p.met[m];
          if (v && typeof v.km === 'number') d.met[m] = { d: v.d || null, km: v.km };
        }
      }
      if (p.keeps && typeof p.keeps === 'object') d.keeps = p.keeps;
      if (p.flags && typeof p.flags === 'object') d.flags = p.flags;
      if (p.camp && typeof p.camp.km === 'number') d.camp = { km: p.camp.km, d: p.camp.d || null };
      if (p.settings) {
        d.settings.haptics = p.settings.haptics !== false;
        d.settings.sound = !!p.settings.sound;
      }
      return d;
    } catch (e) { return defaults(); }
  }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  /* ------------------------------------------------------------------ dates */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
  function parse(s) { var a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function today() { return ymd(new Date()); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }

  var MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function longDate(s) { var d = parse(s); return DAY[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function shortDate(s) { var d = parse(s); return d.getDate() + ' ' + MON[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear(); }

  /* ------------------------------------------------------------- conversion */
  function kmFromSteps(steps) {
    var km = steps / Content.STEPS_PER_KM;
    if (km > DAY_CAP_KM) return { km: DAY_CAP_KM, capped: true };
    return { km: Math.round(km * 1000) / 1000, capped: false };
  }

  /* ----------------------------------------------------------- the ledger */
  function dayKeys() { return Object.keys(db.days).sort(); }

  function totalKm() {
    var t = 0, k = dayKeys();
    for (var i = 0; i < k.length; i++) t += db.days[k[i]].km;
    return Math.round(t * 1000) / 1000;
  }

  /** The first day on the road: the earliest day counted, whatever `start` says. */
  function firstDay() {
    var k = dayKeys(), s = db.start;
    if (k.length && (!s || k[0] < s)) s = k[0];
    return s || null;
  }
  /** Day one is the first day on the road. A clock moved backwards cannot make it negative. */
  function dayNumber(d) {
    var s = firstDay();
    if (!s) return 1;
    return Math.max(1, daysBetween(s, d) + 1);
  }

  function dayOf(d) { return db.days[d] || null; }
  function stepsOn(d) { return db.days[d] ? db.days[d].steps : 0; }
  function kmOn(d) { return db.days[d] ? db.days[d].km : 0; }

  /** Distance already walked before day `d` started: where the day begins on the road. */
  function kmBefore(d) {
    var t = 0, k = dayKeys();
    for (var i = 0; i < k.length; i++) { if (k[i] >= d) break; t += db.days[k[i]].km; }
    return Math.round(t * 1000) / 1000;
  }

  function setSteps(d, steps) {
    steps = Math.min(MAX_DAY_STEPS, Math.max(0, Math.round(steps || 0)));
    if (!db.start || d < db.start) db.start = d;
    var c = kmFromSteps(steps);
    if (steps === 0 && !db.days[d]) db.days[d] = { steps: 0, km: 0, capped: false };
    else db.days[d] = { steps: steps, km: c.km, capped: c.capped };
    save();
  }

  function addSteps(n) {
    if (!(n > 0)) return 0;
    var d = today();
    setSteps(d, stepsOn(d) + n);
    return n;
  }

  /* ------------------------------------------------------------ the sensor */
  function sensorAvailable() {
    return !!(window.Native && Native.stepsAvailable && Native.stepsAvailable());
  }
  function sensorAllowed() {
    return !!(window.Native && Native.stepsAllowed && Native.stepsAllowed());
  }
  function sensorRaw() {
    if (!(window.Native && Native.stepCount)) return -1;
    try { return Native.stepCount(); } catch (e) { return -1; }
  }

  /** Read the phone's cumulative counter and bank whatever is new. Returns steps banked. */
  function pollSensor() {
    if (db.mode !== 'sensor') return 0;
    var raw = sensorRaw();
    if (raw < 0) return 0;
    var prev = db.sensor.raw;
    var delta = 0;
    if (prev < 0) delta = 0;                    // first reading only sets the baseline
    else if (raw < prev) delta = raw;           // the phone restarted, so the counter did too
    else delta = raw - prev;
    if (delta > MAX_DELTA) delta = MAX_DELTA;
    db.sensor.raw = raw;
    db.sensor.at = Date.now();
    save();
    if (delta > 0) addSteps(delta);
    return delta;
  }

  /** Start counting from now, optionally banking what the phone counted before today. */
  function startSensor(claimBacklog) {
    db.mode = 'sensor';
    var raw = sensorRaw();
    db.sensor.raw = raw >= 0 ? raw : -1;
    db.sensor.at = Date.now();
    if (!db.start) db.start = today();
    save();
    if (claimBacklog && raw > 0) addSteps(Math.min(raw, DAY_CAP_KM * Content.STEPS_PER_KM));
    return raw;
  }
  function useManual() {
    db.mode = 'manual';
    if (!db.start) db.start = today();
    save();
  }

  /* --------------------------------------------------------------- streaks
     Walked days build a streak. Up to two rest days in any seven hold it open
     rather than breaking it. Nothing forged is ever taken back. */
  function walkedOn(d) { return stepsOn(d) >= WALKED_STEPS; }

  function streak() {
    var start = firstDay(), end = today();
    if (!start) return { current: 0, best: 0, hearth: HEARTH_PER_WEEK, forged: {}, days: 0 };
    var span = daysBetween(start, end);
    if (span < 0) { start = end; span = 0; }
    if (span > 3000) { start = addDays(end, -3000); span = 3000; }

    var cur = 0, best = 0, forged = {}, hearthDates = [];
    var d = start, i, g;
    for (i = 0; i <= span; i++) {
      var isToday = (d === end);
      if (walkedOn(d)) {
        cur++;
        for (g = 0; g < Content.GEAR.length; g++) {
          var it = Content.GEAR[g];
          if (cur >= it.days && !forged[it.id]) forged[it.id] = d;
        }
      } else if (!isToday) {
        var used = 0;
        for (var h = 0; h < hearthDates.length; h++) {
          if (daysBetween(hearthDates[h], d) < 7) used++;
        }
        if (cur > 0 && used < HEARTH_PER_WEEK) hearthDates.push(d);
        else { cur = 0; hearthDates.length = 0; }
      }
      if (cur > best) best = cur;
      d = addDays(d, 1);
    }
    var usedNow = 0;
    for (var j = 0; j < hearthDates.length; j++) if (daysBetween(hearthDates[j], end) < 7) usedNow++;
    return {
      current: cur, best: best, forged: forged,
      hearth: Math.max(0, HEARTH_PER_WEEK - usedNow),
      days: span + 1
    };
  }

  /** Consecutive walked days ending today (or yesterday), used by Biscuit. */
  function runSince(fromDate) {
    var d = today(), n = 0, guard = 0;
    if (!walkedOn(d)) d = addDays(d, -1);
    while (walkedOn(d) && d >= fromDate && guard++ < 400) { n++; d = addDays(d, -1); }
    return n;
  }

  /* ------------------------------------------------------------- encounters
     An encounter fires the moment your total distance passes its kilometre.
     They are stored with the distance so followups can be measured from them. */
  function pendingEncounters() {
    var km = totalKm(), out = [], i;
    for (i = 0; i < Encounters.LIST.length; i++) {
      var e = Encounters.LIST[i];
      if (db.met[e.id]) continue;
      if (e.streakAfter) {
        var base = db.met[e.streakAfter.id];
        if (base && base.d && runSince(base.d) >= e.streakAfter.days) out.push(e);
        continue;
      }
      var t = Encounters.triggerKm(e, db.met);
      if (t !== null && km + 0.0001 >= t) out.push(e);
    }
    out.sort(function (a, b) {
      var ta = Encounters.triggerKm(a, db.met), tb = Encounters.triggerKm(b, db.met);
      return (ta === null ? 1e9 : ta) - (tb === null ? 1e9 : tb);
    });
    return out;
  }

  function meet(e) {
    if (db.met[e.id]) return;
    var t = Encounters.triggerKm(e, db.met);
    db.met[e.id] = { d: today(), km: t === null ? totalKm() : Math.max(t, 0) };
    if (e.gift && !db.keeps[e.gift]) db.keeps[e.gift] = today();
    if (e.id === 'dog2') db.flags.biscuit = today();
    save();
  }

  function metOn(d) {
    var out = [];
    for (var id in db.met) if (db.met[id].d === d) out.push(id);
    out.sort(function (a, b) { return db.met[a].km - db.met[b].km; });
    return out;
  }

  /* -------------------------------------------------------------- the camp */
  function campKm() { return db.camp ? db.camp.km : 0; }
  function pitchCamp() {
    db.camp = { km: totalKm(), d: today() };
    save();
  }
  function newGround() { return Math.round((totalKm() - campKm()) * 1000) / 1000; }

  /* ------------------------------------------------------------------ misc */
  function exportObject() { return JSON.parse(JSON.stringify(db)); }

  function erase() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    db = defaults();
  }

  return {
    KEY: KEY, DAY_CAP_KM: DAY_CAP_KM, WALKED_STEPS: WALKED_STEPS, HEARTH_PER_WEEK: HEARTH_PER_WEEK,
    MAX_DAY_STEPS: MAX_DAY_STEPS,
    all: function () { return db; },
    save: save,
    ymd: ymd, parse: parse, today: today, addDays: addDays, daysBetween: daysBetween,
    longDate: longDate, shortDate: shortDate, MONTHS: MON,
    kmFromSteps: kmFromSteps,
    dayKeys: dayKeys, totalKm: totalKm, dayOf: dayOf, stepsOn: stepsOn, kmOn: kmOn,
    firstDay: firstDay, dayNumber: dayNumber,
    kmBefore: kmBefore, setSteps: setSteps, addSteps: addSteps,
    sensorAvailable: sensorAvailable, sensorAllowed: sensorAllowed, sensorRaw: sensorRaw,
    pollSensor: pollSensor, startSensor: startSensor, useManual: useManual,
    walkedOn: walkedOn, streak: streak, runSince: runSince,
    pendingEncounters: pendingEncounters, meet: meet, metOn: metOn,
    campKm: campKm, pitchCamp: pitchCamp, newGround: newGround,
    exportObject: exportObject, erase: erase
  };
})();
