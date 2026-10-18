'use strict';
// EchoDepths haptic vocabulary. Prefers the Android bridge (window.EchoNative, amplitude-capable),
// falls back to navigator.vibrate (pattern-only). Never gates gameplay: audio carries the full signal.
const Haptics = (() => {
  let enabled = true, strength = 1;
  const lastByKey = Object.create(null);
  const native = () => (window.EchoNative && typeof window.EchoNative.vibrate === 'function') ? window.EchoNative : null;
  function available() { return !!(native() || (navigator && typeof navigator.vibrate === 'function')); }
  function gate(key, minGap) {
    const now = performance.now();
    if (lastByKey[key] && now - lastByKey[key] < minGap) return false;
    lastByKey[key] = now; return true;
  }
  function pulse(ms, amp, key, minGap) {
    if (!enabled || !available()) return;
    if (key && !gate(key, minGap || 0)) return;
    const d = Math.max(8, Math.round(ms * (0.6 + 0.4 * strength)));
    const a = Math.round(U.clamp(amp * strength, 0.04, 1) * 255);
    const n = native();
    if (n) { try { n.vibrate(d, a); } catch (e) {} return; }
    try { navigator.vibrate(d); } catch (e) {}
  }
  function pattern(arr, amp, key, minGap) {
    if (!enabled || !available()) return;
    if (key && !gate(key, minGap || 0)) return;
    const a = Math.round(U.clamp(amp * strength, 0.04, 1) * 255);
    const n = native();
    if (n && typeof n.vibratePattern === 'function') { try { n.vibratePattern(JSON.stringify(arr), a); } catch (e) {} return; }
    try { navigator.vibrate(arr); } catch (e) {}
  }
  // --- the vocabulary (see BLUEPRINT §7) ---
  const V = {
    wallBrush: () => pulse(40, 0.35, 'wall', 220),
    bearing: (closeness) => pattern([28, 70, 28], 0.3 + 0.7 * closeness, 'bearing', 650),
    current: () => pulse(18, 0.14, 'current', 420),
    damage: () => pattern([120, 60, 60], 1, 'dmg', 0),
    tick: () => pulse(14, 0.5, 'tick', 90),
    charge: (level) => pulse(10 + level * 6, 0.25 + level * 0.2, 'charge', 0),
    pingClick: () => pulse(12, 0.3, 'ping', 0),
    pingChirp: () => pattern([18, 40, 18], 0.5, 'ping', 0),
    pingShout: () => pattern([60, 50, 40, 50, 25], 0.9, 'ping', 0),
    bellow: (closeness) => pattern([90, 90, 90], 0.4 + 0.6 * closeness, 'bellow', 900),
    otolith: () => pattern([10, 30, 10], 0.45, 'oto', 0),
    sink: () => pattern([20, 40, 30, 40, 50], 0.6, 'sink', 0),
    death: () => pattern([200, 100, 120, 100, 60], 1, 'death', 0),
    preview: (arr, amp) => pattern(arr, amp == null ? 0.7 : amp, null, 0),
  };
  return Object.assign({
    setEnabled(v) { enabled = !!v; }, isEnabled: () => enabled,
    setStrength(v) { strength = U.clamp(v, 0.2, 1.5); }, getStrength: () => strength,
    available, pulse, pattern,
  }, V);
})();
