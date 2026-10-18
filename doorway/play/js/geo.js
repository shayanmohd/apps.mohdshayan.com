/* Where you are, used for one thing: putting the nearest places first.
   Nothing is sent anywhere. The last fix is kept so the list still sorts sensibly
   before a new one arrives, and it is dropped the moment you clear your data. */
const Geo = (() => {
  let state = 'idle';          // idle | asking | ok | denied | unavailable | timeout
  let fix = null;
  let watchers = [];

  function last() {
    if (fix) return fix;
    const f = Store.settings().lastFix;
    if (f && typeof f.lat === 'number') { fix = f; return f; }
    return null;
  }

  function notify() { for (const fn of watchers) try { fn(state, fix); } catch (e) {} }
  function onChange(fn) { watchers.push(fn); }

  function locate(opts) {
    const o = opts || {};
    if (!navigator.geolocation) { state = 'unavailable'; notify(); return Promise.resolve(null); }
    state = 'asking'; notify();
    return new Promise(res => {
      navigator.geolocation.getCurrentPosition(pos => {
        fix = { lat: pos.coords.latitude, lng: pos.coords.longitude,
                acc: Math.round(pos.coords.accuracy || 0), at: Date.now() };
        Store.set('lastFix', fix);
        state = 'ok'; notify(); res(fix);
      }, err => {
        state = err && err.code === 1 ? 'denied' : err && err.code === 3 ? 'timeout' : 'unavailable';
        notify(); res(null);
      }, { enableHighAccuracy: o.precise !== false, timeout: o.timeout || 12000, maximumAge: o.maximumAge || 60000 });
    });
  }

  function distance(a, b) {
    if (!a || !b || typeof a.lat !== 'number' || typeof b.lat !== 'number') return null;
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const la1 = a.lat * rad, la2 = b.lat * rad;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function fmt(m) {
    if (m === null || m === undefined) return '';
    if (m < 100) return Math.round(m / 10) * 10 + ' m';
    if (m < 1000) return Math.round(m / 50) * 50 + ' m';
    if (m < 10000) return (m / 1000).toFixed(1) + ' km';
    return Math.round(m / 1000) + ' km';
  }

  const MESSAGES = {
    idle: '',
    asking: 'Looking for your position.',
    ok: '',
    denied: 'Location was declined, so the list is sorted by name. You can still use everything else.',
    timeout: 'No position yet. Indoors it can take a while, or sort by name instead.',
    unavailable: 'This device could not give a position, so the list is sorted by name.'
  };

  return {
    locate, distance, fmt, last, onChange, MESSAGES,
    get state() { return state; },
    clear() { fix = null; state = 'idle'; Store.set('lastFix', null); }
  };
})();
