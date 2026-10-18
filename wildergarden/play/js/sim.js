/* The valley is never stored. It is recomputed from the ledger every time, by
   walking the days in order and applying the same rules that applied on the day.
   That is what lets a missed week heal itself and an export be complete. */
const Sim = (() => {

  const DAY_STILL   = 100;   // a day with no feed minutes at all
  const STREAK_STEP = 0.06;  // per clean day in a row, up to five
  const SESSION_K   = 0.25;  // a put-it-down session is a bonus, never the engine
  const SESSION_CAP = 60;    // most a day can earn from sessions
  const MIN_CAP     = 300;   // longest single session that counts, in minutes
  const DAMAGE_CAP  = 30;    // most one day can cost
  const DAMAGE_K    = 0.4;
  const HEAL_K      = 0.13;  // two clean days undo the worst day. That ratio is the design.
  const BLIGHT_CAP  = 72;    // the meadow itself never dies. There is always something to come back to.
  const LOG_BONUS   = 6;     // telling the truth about a bad day still grows something
  const SOIL_FULL   = 9000;
  const WATER_SPAN  = 55;

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  let workFrom = 9, workTo = 17;   // set from settings on every compute
  /* Midnight is a real hour. Reading the hour with `parseInt(...) || 9` turned a shift
     that starts at 00:00 into one that starts at nine, because zero is falsy. */
  const hourOf = (v, dflt) => {
    const m = /^([01]\d|2[0-3]):[0-5]\d$/.exec(typeof v === 'string' ? v : '');
    return m ? Number(m[1]) : dflt;
  };
  /* Night shifts exist. A window whose end is before its start wraps around midnight
     instead of quietly meaning "no working hours at all". */
  const inWork = h => workFrom === workTo ? false
    : workFrom < workTo ? (h >= workFrom && h < workTo)
    : (h >= workFrom || h < workTo);

  /** Weighted value of one completed session. Evenings count for more, sleep for much less. */
  function sessionUnits(s) {
    const mins = Math.min(MIN_CAP, (s.e - s.s) / 60000);
    if (mins < 1) return 0;
    const h = new Date(s.s).getHours();
    let ctx = 1;
    if (h >= 23 || h < 6) ctx = 0.35;
    else if (h >= 18) ctx = 1.3;
    else if (inWork(h)) ctx = 0.75;
    let deep = 1;
    if (mins >= 240) deep = 1.8;
    else if (mins >= 120) deep = 1.5;
    else if (mins >= 45) deep = 1.15;
    return mins * ctx * deep * SESSION_K;
  }

  const isDeepEvening = s => {
    const h = new Date(s.s).getHours();
    return h >= 17 && h < 23 && (s.e - s.s) >= 90 * 60000;
  };

  /** Runs the whole ledger. Returns everything the interface needs. */
  function compute(now = Date.now()) {
    const set = Store.settings();
    const limit = Math.max(5, set.limit || 60);
    workFrom = hourOf(set.workStart, 9);
    workTo = hourOf(set.workEnd, 17);
    const today = Store.today(now);
    const dayList = Store.span(now);
    const daysRec = Store.days();

    // Sessions bucketed by the day they started in, plus anything running now.
    const byDay = {};
    const deepEveByDay = {};
    for (const s of Store.sessions()) {
      const d = Store.dayOf(s.s);
      (byDay[d] = byDay[d] || []).push(s);
      if (isDeepEvening(s)) deepEveByDay[d] = (deepEveByDay[d] || 0) + 1;
    }
    const running = Store.live();
    let liveMinutes = 0;
    if (running) {
      liveMinutes = Math.max(0, (now - running.s) / 60000);
      const d = Store.dayOf(running.s);
      (byDay[d] = byDay[d] || []).push({ s: running.s, e: now, running: true });
    }

    // Species carriers.
    const sp = {};
    for (const s of Species.LIST) sp[s.id] = { status: 'absent', arrivedAt: null, health: 0, seen: false };

    let growth = 0, blight = 0, streak = 0;
    let cleanDays = 0, loggedDays = 0, gracedTotal = 0;
    const graceWeeks = {};
    const history = [];
    const arrivals = [];
    const withdrawals = [];

    for (let i = 0; i < dayList.length; i++) {
      const d = dayList[i];
      const rec = daysRec[d] || null;
      const logged = !!rec;
      const feed = logged ? rec.blight : null;

      let sess = 0;
      for (const s of (byDay[d] || [])) sess += sessionUnits(s);
      sess = Math.min(SESSION_CAP, sess);

      let still = sess, damage = 0, graced = false, clean = false;

      if (logged) {
        loggedDays++;
        const base = DAY_STILL * clamp(1 - feed / (2 * limit), 0, 1);
        still += LOG_BONUS + base * (1 + STREAK_STEP * Math.min(streak, 5));
        clean = feed <= limit;
        if (clean) { streak++; cleanDays++; }
        else {
          streak = 0;
          const wk = Store.weekOf(d);
          if (!graceWeeks[wk]) { graceWeeks[wk] = d; graced = true; gracedTotal++; }
          else damage = Math.min(DAMAGE_CAP, (feed - limit) * DAMAGE_K);
        }
      } else if (d !== today) {
        streak = 0;                       // an unrecorded day cannot count as clean
      }

      growth += still;
      blight = clamp(blight + damage - still * HEAL_K, 0, BLIGHT_CAP);

      const water = clamp(1 - blight / WATER_SPAN, 0, 1);
      const soil = clamp(growth / SOIL_FULL, 0, 1);

      // Withdrawals first: a species leaves before another arrives to take its place.
      const leftToday = [];
      for (const s of Species.LIST) {
        const st = sp[s.id];
        if (!st.seen) continue;
        const pressure = blight / 100;
        const health = clamp((s.tol - pressure) / Math.max(0.05, s.tol), 0, 1);
        st.health = health;
        if (st.status === 'resident' && health <= 0.06) { st.status = 'withdrawn'; leftToday.push(s.id); withdrawals.push({ id: s.id, date: d }); }
        else if (st.status === 'withdrawn' && health >= 0.3) st.status = 'resident';
      }

      // Arrivals, at most two a day so the valley never floods.
      const deepEve7 = countBack(deepEveByDay, dayList, i, 7);
      const offlineDay = anyOfflineDay(daysRec, dayList, i, 7);
      const cameToday = [];
      for (const s of Species.LIST) {
        if (cameToday.length >= 2) break;
        const st = sp[s.id];
        if (st.seen) continue;
        if (growth < s.req) continue;
        if (growth < Species.biome(s.biome).unlock) continue;
        if ((s.deps || []).some(x => sp[x].status !== 'resident')) continue;
        const r = s.rule || {};
        if (r.water && water < r.water) continue;
        if (r.streak && streak < r.streak) continue;
        if (r.evenings && deepEve7 < r.evenings) continue;
        if (r.offline && !offlineDay) continue;
        st.seen = true; st.status = 'resident';
        st.health = clamp((s.tol - blight / 100) / Math.max(0.05, s.tol), 0, 1);
        st.arrivedAt = d;
        cameToday.push(s.id);
        arrivals.push({ id: s.id, date: d });
      }

      history.push({ date: d, logged, feed, clean, still, sess, damage, graced,
                     growth, blight, arrivals: cameToday, withdrawals: leftToday });
    }

    const water = clamp(1 - blight / WATER_SPAN, 0, 1);
    const soil = clamp(growth / SOIL_FULL, 0, 1);
    const biomes = Species.BIOMES.filter(b => growth >= b.unlock).map(b => b.id);
    const last = history[history.length - 1] || { still: 0, sess: 0 };
    const thisWeek = Store.weekOf(today);

    const residents = Species.LIST.filter(s => sp[s.id].status === 'resident');
    const everSeen = Species.LIST.filter(s => sp[s.id].seen);

    // What is the next thing that could plausibly arrive?
    const next = Species.LIST.find(s => !sp[s.id].seen) || null;

    return {
      now, today, limit,
      growth, blight, water, soil, streak,
      cleanDays, loggedDays, totalDays: dayList.length,
      graceUsed: !!graceWeeks[thisWeek], graceDay: graceWeeks[thisWeek] || null, gracedTotal,
      biomes, species: sp, arrivals, withdrawals, history,
      residentCount: residents.length, seenCount: everSeen.length, total: Species.count,
      todayStill: last.still, todaySession: last.sess,
      todayLogged: !!daysRec[today], todayFeed: daysRec[today] ? daysRec[today].blight : null,
      liveMinutes, running: !!running,
      unlogged: Store.unlogged(now),
      next
    };
  }

  function countBack(map, list, i, n) {
    let c = 0;
    for (let k = Math.max(0, i - n + 1); k <= i; k++) c += (map[list[k]] || 0);
    return c;
  }
  function anyOfflineDay(daysRec, list, i, n) {
    for (let k = Math.max(0, i - n + 1); k <= i; k++) {
      const r = daysRec[list[k]];
      if (r && r.blight === 0) return true;
    }
    return false;
  }

  /** What today's tally would do, shown live while the user drags the dial. */
  function preview(state, feed) {
    const limit = state.limit;
    const base = DAY_STILL * clamp(1 - feed / (2 * limit), 0, 1);
    const still = base * (1 + STREAK_STEP * Math.min(state.streak, 5));
    const clean = feed <= limit;
    const graced = !clean && !state.graceUsed;
    const damage = clean || graced ? 0 : Math.min(DAMAGE_CAP, (feed - limit) * DAMAGE_K);
    const heal = (still + LOG_BONUS + state.todaySession) * HEAL_K;
    return { still: Math.round(still + LOG_BONUS), clean, graced, damage: Math.round(damage),
             heal: Math.round(heal), net: Math.round(damage - heal) };
  }

  return { compute, preview, sessionUnits, DAY_STILL, BLIGHT_CAP };
})();
