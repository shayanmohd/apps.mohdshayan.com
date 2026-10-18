/* Microphone in, take out. Three jobs live here: capture the recording at a
   size a phone can actually keep, run the cheap live meters that the room and
   the pace pill read from, and play a stored take back with a scrub bar.

   The recording is decimated to 16 kHz mono the moment it arrives, because
   speech has nothing above 8 kHz worth keeping and because forty minutes of
   48 kHz floats will empty a phone. */

const Recorder = (() => {
  const SR = 16000;
  const MAX_SEC = 20 * 60;

  let ctx = null, stream = null, src = null, node = null, sink = null;
  let workletReady = false, armed = false;
  // Two taps on a record button used to open two microphones: getUserMedia is
  // slow enough that the second caller saw armed still false, built a second
  // capture graph onto the same handler, doubled every take and left one track
  // live for the rest of the session. One attempt at a time, and a generation
  // counter so a release during that attempt closes what it opened.
  let armPromise = null, armGen = 0;
  let capturing = false;
  let chunks = [], total = 0;
  let resAcc = 0, resCount = 0, resPhase = 0;

  /* live analysis state */
  const live = {
    sm: -100, slow: -100, floor: -70,
    inPeak: false, lastPk: -100, lastVal: -100,
    lastSyl: -1, syls: [], level: 0, silentFor: 0, t: 0,
    dyn: 0, started: false
  };

  function ready() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); }
    return ctx;
  }

  function arm() {
    if (armed) return Promise.resolve({ ok: true });
    if (armPromise) return armPromise;
    armPromise = armOnce();
    const done = () => { armPromise = null; };
    armPromise.then(done, done);
    return armPromise;
  }

  /* A system permission dialog is not the app being slow. The shell calls
     promptOpen(true) when it puts one on screen and promptOpen(false) when it
     is answered, and the arming clock stops for that whole time. Without this a
     reviewer who reads the dialog before tapping Allow gets told the microphone
     did not open. */
  let promptUp = false, graceUntil = 0;
  function promptOpen(on) {
    promptUp = !!on;
    if (!on) graceUntil = Date.now() + 1500;
  }

  const ARM_MS = 8000;

  async function armOnce() {
    const gen = armGen;
    const c = ready();
    if (!c) return { ok: false, error: 'This device has no Web Audio support, so Greenroom cannot listen.' };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, error: 'This device will not hand the app a microphone.' };
    }

    const gum = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
    });

    let iv = 0;
    const clock = new Promise((_, rej) => {
      let left = ARM_MS;
      iv = setInterval(() => {
        if (promptUp || Date.now() < graceUntil) return;
        left -= 200;
        if (left > 0) return;
        clearInterval(iv); iv = 0;
        const e = new Error('timeout'); e.name = 'GreenroomTimeout'; rej(e);
      }, 200);
    });

    let got;
    try {
      // Some devices never settle this promise at all, which would leave the
      // record button doing nothing forever. Give up out loud instead.
      got = await Promise.race([gum, clock]);
    } catch (e) {
      // A stream that turns up after the clock ran out still holds the
      // microphone open, with the recording indicator lit and nothing recording.
      gum.then(st => { try { st.getTracks().forEach(t => t.stop()); } catch (x) {} }, () => {});
      const name = e && e.name;
      const kind = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied'
        : name === 'GreenroomTimeout' ? 'timeout'
        : name === 'NotFoundError' ? 'missing'
        : 'blocked';
      const msg = kind === 'denied'
        ? 'Greenroom needs permission to use the microphone.'
        : kind === 'timeout'
          ? 'The microphone did not open.'
          : kind === 'missing'
            ? 'This device is not offering a microphone at all.'
            : 'Android would not hand Greenroom a microphone.';
      return { ok: false, kind: kind, error: msg, detail: String(name || 'unknown') };
    } finally {
      if (iv) clearInterval(iv);
    }

    // The take was discarded while the microphone was still opening: close what
    // just arrived rather than leaving a live track behind.
    if (gen !== armGen) {
      got.getTracks().forEach(t => t.stop());
      return { ok: false, kind: 'cancelled', error: 'The take was cancelled before the microphone opened.' };
    }

    // Everything below can throw on a device with an odd audio stack, and a
    // throw here used to escape as an unhandled rejection with the record button
    // left disabled for the rest of the session.
    try {
      stream = got;
      src = c.createMediaStreamSource(stream);
      if (c.audioWorklet && !workletReady) {
        try { await c.audioWorklet.addModule('js/capture-worklet.js'); workletReady = true; }
        catch (e) { workletReady = false; }
      }
      if (gen !== armGen) {
        try { src.disconnect(); } catch (e) {}
        stream.getTracks().forEach(t => t.stop());
        stream = null; src = null;
        return { ok: false, kind: 'cancelled', error: 'The take was cancelled before the microphone opened.' };
      }
      if (workletReady) {
        node = new AudioWorkletNode(c, 'capture');
        node.port.onmessage = e => onBlock(e.data);
      } else {
        node = c.createScriptProcessor(2048, 1, 1);
        node.onaudioprocess = e => onBlock(new Float32Array(e.inputBuffer.getChannelData(0)));
      }
      src.connect(node);
      sink = c.createGain();
      sink.gain.value = 0;
      node.connect(sink);
      sink.connect(c.destination);
      armed = true;
      return { ok: true };
    } catch (e) {
      release();
      return {
        ok: false, kind: 'blocked',
        error: 'Greenroom could not set up its audio for this device.',
        detail: String((e && e.name) || e)
      };
    }
  }

  function release() {
    capturing = false;
    armGen++;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    try { if (src) src.disconnect(); } catch (e) {}
    try { if (node) node.disconnect(); } catch (e) {}
    try { if (sink) sink.disconnect(); } catch (e) {}
    src = node = sink = null;
    armed = false;
  }

  /* ------------------------------------------------------------- capturing */

  function begin() {
    chunks = []; total = 0;
    resAcc = 0; resCount = 0; resPhase = 0;
    live.sm = -100; live.slow = -100; live.floor = -70;
    live.inPeak = false; live.lastPk = -100; live.lastVal = -100;
    live.syls = []; live.lastSyl = -1; live.level = 0; live.silentFor = 0; live.t = 0;
    live.dyn = 0; live.started = false;
    capturing = true;
  }

  function end() {
    capturing = false;
    let n = 0;
    for (const c of chunks) n += c.length;
    const out = new Int16Array(n);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    chunks = [];
    return { pcm: out, sr: SR, dur: n / SR };
  }

  const seconds = () => total / SR;

  function onBlock(buf) {
    const c = ctx;
    if (!c) return;
    const inSr = c.sampleRate;

    // meter and live analysis at roughly 10 ms
    const sub = Math.max(1, Math.round(inSr * 0.01));
    for (let i = 0; i < buf.length; i += sub) {
      let s = 0, n = 0;
      for (let j = i; j < Math.min(buf.length, i + sub); j++) { s += buf[j] * buf[j]; n++; }
      if (n) frame(20 * Math.log10(Math.sqrt(s / n) + 1e-10), n / inSr);
    }

    if (!capturing) return;
    if (total >= MAX_SEC * SR) return;

    // decimate to 16 kHz with a box filter whose width follows the rate ratio
    const step = SR / inSr;
    const out = new Int16Array(Math.ceil(buf.length * step) + 2);
    let o = 0;
    for (let i = 0; i < buf.length; i++) {
      resAcc += buf[i]; resCount++;
      resPhase += step;
      if (resPhase >= 1) {
        resPhase -= 1;
        let v = resAcc / resCount;
        resAcc = 0; resCount = 0;
        v = v > 1 ? 1 : v < -1 ? -1 : v;
        out[o++] = Math.round(v * 32767);
      }
    }
    if (o > 0) { chunks.push(out.subarray(0, o)); total += o; }
  }

  /** One 10 ms frame of live loudness: the meter, the pause light and a cheap
      syllable count that the room reacts to. Nothing here is stored.

      The count is a hysteresis trigger on the smoothed envelope, the live cousin
      of the peak-and-dip rule the full analysis uses after the take. It has to
      run in real time on one frame at a time, so it is looser, and the notes
      always come from the offline pass rather than from this. */
  const DIP = 2.6;   // dB a syllable has to climb out of, and fall back into

  function frame(db, dt) {
    live.t += dt;
    if (!live.started) { live.started = true; live.sm = live.slow = live.lastVal = live.lastPk = db; live.floor = db - 6; }

    live.sm += (db - live.sm) * 0.35;
    live.slow += (live.sm - live.slow) * 0.0035;
    live.floor = live.sm < live.floor ? live.floor + (live.sm - live.floor) * 0.06 : live.floor + 0.0012;

    const sp = live.floor + 8;
    const lvl = Math.max(0, Math.min(1, (live.sm - live.floor) / 34));
    live.level = lvl > live.level ? lvl : live.level * 0.86 + lvl * 0.14;
    if (live.sm < sp) live.silentFor += dt; else live.silentFor = 0;

    if (live.inPeak) {
      if (live.sm > live.lastPk) live.lastPk = live.sm;
      if (live.sm < live.lastPk - DIP) { live.inPeak = false; live.lastVal = live.sm; }
    } else {
      if (live.sm < live.lastVal) live.lastVal = live.sm;
      if (live.sm > live.lastVal + DIP && live.sm > sp && live.t - live.lastSyl > 0.09) {
        live.inPeak = true;
        live.lastPk = live.sm;
        live.lastSyl = live.t;
        live.syls.push(live.t);
        if (live.syls.length > 600) live.syls.shift();
      }
    }

    live.dyn += (Math.abs(live.sm - live.slow) / 9 - live.dyn) * 0.01;
  }

  /** Words a minute over the last `win` seconds, or null before there is enough. */
  function paceNow(win) {
    win = win || 10;
    const from = live.t - win;
    if (live.t < 4) return null;
    let n = 0;
    for (let i = live.syls.length - 1; i >= 0; i--) {
      if (live.syls[i] < from) break;
      n++;
    }
    const span = Math.min(win, live.t);
    return Math.round((n / span) * 60 / 1.45);
  }

  const state = () => ({
    level: live.level, silentFor: live.silentFor, t: live.t,
    dyn: live.dyn, wpm: paceNow(10)
  });

  /* -------------------------------------------------------------- playback */

  let player = null;

  function toBuffer(pcm, sr) {
    const c = ready();
    if (!c) return null;
    const b = c.createBuffer(1, pcm.length, sr);
    const ch = b.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    return b;
  }

  function play(pcm, sr, from, onEnd) {
    const c = ready();
    if (!c) return false;
    stop();
    const buf = toBuffer(pcm, sr);
    if (!buf) return false;
    const s = c.createBufferSource();
    s.buffer = buf;
    s.connect(c.destination);
    s.onended = () => { if (player && player.src === s) { player = null; if (onEnd) onEnd(); } };
    const off = Math.max(0, Math.min(buf.duration - 0.05, from || 0));
    s.start(0, off);
    player = { src: s, t0: c.currentTime - off, dur: buf.duration };
    return true;
  }

  function stop() {
    if (player) {
      try { player.src.onended = null; player.src.stop(); } catch (e) {}
      player = null;
    }
  }

  const playing = () => !!player;
  const position = () => (player && ctx ? Math.max(0, ctx.currentTime - player.t0) : 0);

  /* ------------------------------------------------------------------- wav */

  function wav(pcm, sr) {
    const bytes = pcm.length * 2;
    const b = new ArrayBuffer(44 + bytes);
    const v = new DataView(b);
    const put = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    put(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); put(8, 'WAVE');
    put(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    put(36, 'data'); v.setUint32(40, bytes, true);
    new Int16Array(b, 44).set(pcm);
    return b;
  }

  return {
    arm, release, begin, end, seconds, state, live: () => live, promptOpen,
    play, stop, playing, position, wav, SR, MAX_SEC,
    armed: () => armed
  };
})();
