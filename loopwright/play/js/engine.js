/* The loop engine. Two rules keep the timing honest.

   One: a layer is rendered ahead of time into a buffer exactly one loop long,
   with its own decay tail folded back over the start, so the seam is inaudible
   and playback is a single looping source rather than hundreds of scheduled
   notes. Two: everything is placed in audio-clock seconds, never in setTimeout
   time, so layers stay locked to each other no matter what the screen is doing. */

const Engine = (() => {

  let ctx = null;
  let master = null, comp = null;
  let stream = null, micNode = null, capNode = null, micErr = '';
  let workletReady = false;

  const SR_TAIL = 2.4;               // seconds of ring allowed to wrap round the loop

  /* --------------------------------------------------------------- context */
  function ready() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C({ latencyHint: 'interactive' });
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 3;
      comp.attack.value = 0.004; comp.release.value = 0.16;
      master = ctx.createGain();
      master.gain.value = 0.92;
      comp.connect(master); master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); }
    return ctx;
  }
  const rate = () => (ctx ? ctx.sampleRate : 44100);

  /* ------------------------------------------------------------------- mic */
  const capture = { on: false, blocks: [], t0: 0, sr: 44100, level: 0 };

  function takeBlock(t, data) {
    // t is the audio clock when the block finished, so the block started earlier.
    const start = t - data.length / capture.sr;
    if (!capture.on) return;
    if (!capture.blocks.length) capture.t0 = start;
    capture.blocks.push(data);
    let s = 0;
    for (let i = 0; i < data.length; i += 4) s += data[i] * data[i];
    const rms = Math.sqrt(s / (data.length / 4));
    capture.level = Math.max(rms, capture.level * 0.82);
  }

  async function micReady() {
    const c = ready();
    if (!c) return { ok: false, error: 'This browser has no Web Audio support.' };
    if (micNode) return { ok: true };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      micErr = 'This device will not give the app a microphone.';
      return { ok: false, error: micErr };
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, noiseSuppression: false,
          autoGainControl: false, channelCount: 1
        }
      });
    } catch (e) {
      const refused = !!(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError'));
      micErr = refused
        ? 'Loopwright needs the microphone to hear you.'
        : 'No microphone was available just then.';
      return { ok: false, error: micErr, refused: refused };
    }
    capture.sr = c.sampleRate;
    micNode = c.createMediaStreamSource(stream);
    if (c.audioWorklet && !workletReady) {
      try { await c.audioWorklet.addModule('js/capture-worklet.js'); workletReady = true; }
      catch (e) { workletReady = false; }
    }
    if (workletReady) {
      capNode = new AudioWorkletNode(c, 'capture');
      capNode.port.onmessage = e => takeBlock(e.data.t, e.data.d);
      micNode.connect(capNode);
      // a worklet with nothing downstream is still pulled, but connecting a silent
      // sink keeps every engine happy
      const sink = c.createGain(); sink.gain.value = 0;
      capNode.connect(sink); sink.connect(c.destination);
    } else {
      capNode = c.createScriptProcessor(2048, 1, 1);
      capNode.onaudioprocess = e => {
        const ch = e.inputBuffer.getChannelData(0);
        takeBlock(c.currentTime, new Float32Array(ch));
      };
      micNode.connect(capNode);
      const sink = c.createGain(); sink.gain.value = 0;
      capNode.connect(sink); sink.connect(c.destination);
    }
    return { ok: true };
  }

  function releaseMic() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (micNode) { try { micNode.disconnect(); } catch (e) {} micNode = null; }
    if (capNode) { try { capNode.disconnect(); } catch (e) {} capNode = null; }
    capture.on = false; capture.blocks = [];
  }

  const level = () => capture.level;

  function beginCapture() { capture.blocks = []; capture.t0 = 0; capture.level = 0; capture.on = true; }
  function endCapture() { capture.on = false; }

  /** Everything captured between two audio-clock times, as one array. */
  function sliceCapture(from, to) {
    const sr = capture.sr;
    const n = Math.max(0, Math.round((to - from) * sr));
    const out = new Float32Array(n);
    let cursor = capture.t0;
    for (let b = 0; b < capture.blocks.length; b++) {
      const blk = capture.blocks[b];
      const bEnd = cursor + blk.length / sr;
      if (bEnd > from && cursor < to) {
        const srcFrom = Math.max(0, Math.round((from - cursor) * sr));
        const dstFrom = Math.max(0, Math.round((cursor - from) * sr));
        const count = Math.min(blk.length - srcFrom, n - dstFrom);
        for (let i = 0; i < count; i++) out[dstFrom + i] = blk[srcFrom + i];
      }
      cursor = bEnd;
    }
    return out;
  }

  /* ------------------------------------------------------------ the click */
  /** The count-in is pitched to the song's key, so waiting for the one is musical. */
  function click(when, accent, tonic) {
    const c = ready(); if (!c) return;
    const f = Voices.hz(69 + (((tonic - 9) % 12) + 12) % 12 + (accent ? 12 : 0));
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f * (accent ? 2 : 1), when);
    const g = c.createGain();
    const peak = accent ? 0.18 : 0.09;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + (accent ? 0.11 : 0.07));
    o.connect(g); g.connect(master);
    o.start(when); o.stop(when + 0.16);
  }

  /* -------------------------------------------------- what a layer becomes */
  /** The quantised, key-snapped events a layer plays. Derived, never stored. */
  function derive(project, layer) {
    const key = [layer.voice, layer.tighten, layer.swing, layer.octave, layer.chords,
                 project.tonic, project.mode, project.beats, layer.src.length].join('|');
    if (layer._d && layer._dk === key) return layer._d;
    const src = layer.src || [];
    const beats = src.map(e => e.t);
    const q = DSP.quantise(beats, layer.tighten, layer.swing, project.beats);
    let out;
    if (layer.kind === 'drum') {
      out = src.map((e, i) => ({ lane: e.lane, t: q[i], v: e.v }));
    } else {
      out = [];
      src.forEach((e, i) => {
        const snapped = DSP.snapToKey(e.p, project.tonic, project.mode) + layer.octave * 12;
        const long = e.d >= 0.7;
        const pitches = (layer.chords && long)
          ? DSP.chordOn(snapped, project.tonic, project.mode)
          : [snapped];
        pitches.forEach((p, k) => out.push({
          p, t: q[i], d: Math.max(0.08, e.d), v: e.v * (k ? 0.62 : 1)
        }));
      });
    }
    out.sort((a, b) => a.t - b.t);
    layer._d = out; layer._dk = key;
    return out;
  }

  /** How high or low this take sits once its voice has had its say. */
  function suggestOctave(voiceId, src) {
    const v = Voices.get(voiceId);
    return Voices.fitOctave(v, src.map(e => e.p));
  }

  /* ------------------------------------------------- rendering one layer */
  const bufCache = new Map();

  function cacheKey(project, layer, sr) {
    return [layer.id, sr, layer.voice, layer.tighten, layer.swing, layer.octave,
            layer.chords, layer.ab, project.tonic, project.mode, project.bpm,
            project.beats, layer.src.length, layer._rev || 0].join('|');
  }

  async function layerBuffer(project, layer, sr) {
    sr = sr || rate();
    const ck = cacheKey(project, layer, sr);
    const hit = bufCache.get(layer.id);
    if (hit && hit.k === ck) return hit.b;

    const loopSec = project.beats * 60 / project.bpm;
    const N = Math.ceil(loopSec * sr);
    const tail = Math.ceil(SR_TAIL * sr);

    if (layer.ab) {
      // The A side: the voice memo itself, laid straight into the loop.
      const raw = await Hums.buffer(scratchFor(sr), layer.hum);
      const out = new Float32Array(N);
      if (raw) {
        const ch = raw.getChannelData(0);
        for (let i = 0; i < Math.min(N, ch.length); i++) out[i] = ch[i];
      }
      const buf = toAudioBuffer(out, sr);
      bufCache.set(layer.id, { k: ck, b: buf });
      return buf;
    }

    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new OC(1, N + tail, sr);
    const bus = oc.createGain();
    bus.gain.value = 1;
    bus.connect(oc.destination);

    const voice = Voices.get(layer.voice);
    const spb = 60 / project.bpm;
    const events = derive(project, layer);
    if (voice.kind === 'drum') {
      events.forEach(e => voice.hit(oc, bus, e.lane, e.t * spb + 0.001, e.v));
    } else {
      events.forEach(e => voice.play(oc, bus, e.p, e.t * spb + 0.001, e.d * spb, e.v));
    }
    const rendered = await oc.startRendering();
    const src = rendered.getChannelData(0);
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) out[i] = src[i];
    // fold the ring-out back over the top of the loop, which is what makes the
    // seam disappear instead of clicking
    for (let i = 0; i < tail && i < N; i++) out[i] += src[N + i];
    const buf = toAudioBuffer(out, sr);
    bufCache.set(layer.id, { k: ck, b: buf });
    return buf;
  }

  /* A one-sample offline context is the cheapest legal way to mint AudioBuffers
     at a sample rate the live context does not happen to be running at. */
  const scratches = new Map();
  function scratchFor(sr) {
    let s = scratches.get(sr);
    if (!s) {
      const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      s = new OC(1, 1, sr);
      scratches.set(sr, s);
    }
    return s;
  }

  function toAudioBuffer(f32, sr) {
    const c = ctx && Math.abs(ctx.sampleRate - sr) < 1 ? ctx : scratchFor(sr);
    const b = c.createBuffer(1, Math.max(1, f32.length), sr);
    b.getChannelData(0).set(f32);
    return b;
  }

  function invalidate(layer) { if (layer) { layer._d = null; bufCache.delete(layer.id); } }

  /** Rendered loops are megabytes each. Leaving one song's worth behind when the
      user opens another is how a library of songs turns into a hundred megabytes. */
  function dropCache() { bufCache.clear(); }

  /* -------------------------------------------------------------- transport */
  /* `armed` is the gap between "the transport is on" and "t0 means something":
     the layers are rendered first, and until the clock is picked the old t0 would
     otherwise send the playhead round the ring from a position nobody asked for. */
  const T = { on: false, armed: false, gen: 0, t0: 0, loopSec: 0, project: null, scene: null, nodes: new Map() };

  const playing = () => T.on;
  function phase() {
    if (!T.on || !T.armed || !ctx) return -1;
    const d = ctx.currentTime - T.t0;
    if (d < 0) return 0;
    return (d % T.loopSec) / T.loopSec;
  }
  function nextBoundary(min) {
    const c = ready();
    const ahead = Math.max(min || 0.12, 0.12);
    if (!T.armed || !T.loopSec) return c.currentTime + ahead;
    const k = Math.ceil((c.currentTime + ahead - T.t0) / T.loopSec);
    return T.t0 + k * T.loopSec;
  }

  function panOf(i) { return [0, -0.22, 0.22, -0.36, 0.36, -0.12, 0.12, 0][i % 8]; }

  function chain(layer, i) {
    const c = ready();
    const g = c.createGain();
    g.gain.value = layer.muted ? 0.0001 : layer.vol;
    let node = g;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = panOf(i);
      g.connect(p); node = p;
    }
    node.connect(comp);
    return g;
  }

  async function startLayer(project, layer, i, when) {
    const c = ready();
    const gen = T.gen;
    const buf = await layerBuffer(project, layer, c.sampleRate);
    if (!T.on || gen !== T.gen) return;
    const old = T.nodes.get(layer.id);
    const g = old ? old.g : chain(layer, i);
    const s = c.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.connect(g);
    const at = when || nextBoundary(0.14);
    s.start(at);
    if (old && old.s) { try { old.s.stop(at); } catch (e) {} }
    T.nodes.set(layer.id, { s, g });
  }

  /* Every buffer is rendered before anything starts. Rendering eight layers can take
     longer than the lead-in, and a start time already in the past starts immediately,
     which used to leave the layers spread across the render time instead of locked
     together. Render first, pick the clock second. */
  async function play(project, sceneId) {
    const c = ready(); if (!c) return;
    const scene = Store.scene(project, sceneId) || Store.current(project);
    stop();
    T.project = project; T.scene = scene.id;
    T.loopSec = project.beats * 60 / project.bpm;
    T.on = true; T.armed = false;
    const gen = ++T.gen;
    const layers = scene.layers.slice();
    const bufs = [];
    for (let i = 0; i < layers.length; i++) {
      const b = await layerBuffer(project, layers[i], c.sampleRate);
      if (!T.on || gen !== T.gen) return;
      bufs.push(b);
    }
    const t0 = c.currentTime + 0.12;
    T.t0 = t0; T.armed = true;
    for (let i = 0; i < layers.length; i++) {
      const g = chain(layers[i], i);
      const s = c.createBufferSource();
      s.buffer = bufs[i]; s.loop = true;
      s.connect(g);
      s.start(t0);
      T.nodes.set(layers[i].id, { s, g });
    }
  }

  function stop() {
    T.nodes.forEach(n => { try { n.s.stop(); } catch (e) {} try { n.g.disconnect(); } catch (e) {} });
    T.nodes.clear();
    T.on = false; T.armed = false; T.gen++;
  }

  function setGain(layer) {
    const n = T.nodes.get(layer.id);
    if (!n || !ctx) return;
    n.g.gain.setTargetAtTime(layer.muted ? 0.0001 : layer.vol, ctx.currentTime, 0.012);
  }

  /** A layer changed. Swap its buffer in on the next loop boundary, silently. */
  /* A layer changed. The next loop boundary is chosen after the render, not before:
     a slow render used to push the swap past the boundary it was aiming at. */
  async function refresh(project, layer, index) {
    invalidate(layer);
    if (!T.on) return;
    await startLayer(project, layer, index);
  }

  function forget(layerId) {
    const n = T.nodes.get(layerId);
    if (n) { try { n.s.stop(); } catch (e) {} try { n.g.disconnect(); } catch (e) {} T.nodes.delete(layerId); }
    bufCache.delete(layerId);
  }

  /* ------------------------------------------------------------ recording */
  let rec = null;
  const FIRST_MAX = 26;   // seconds; a first loop longer than this is a recording, not a loop
  const PRE = 0.13;    // heard before the one, so a hit that lands early is not lost
  const POST = 0.13;   // and after the loop point, so a late one wraps round instead

  /**
   * Arm a take. For the first loop the user closes it by hand; for an overdub the
   * take is exactly one loop long and starts on the next one.
   * opts: { first, countIn, tonic, onState(state, n) }
   */
  async function record(project, opts) {
    const c = ready(); if (!c) return { error: 'No audio on this device.' };
    const m = await micReady();
    if (!m.ok) return { error: m.error, refused: m.refused };
    if (rec) return { error: 'Already recording.' };

    const spb = 60 / project.bpm;
    const beats = Math.max(0, opts.countIn | 0);
    beginCapture();

    let startAt, endAt = 0, clickFrom;
    if (opts.first) {
      startAt = c.currentTime + 0.25 + beats * spb;
      clickFrom = c.currentTime + 0.25;
    } else {
      startAt = nextBoundary(Math.max(0.3, beats * spb));
      clickFrom = startAt - beats * spb;
      endAt = startAt + T.loopSec;
    }
    if (opts.click !== false) {
      for (let i = 0; i < beats; i++) click(clickFrom + i * spb, i === 0, project.tonic);
    }

    const state = { startAt, endAt, spb, resolve: null, timer: 0, opts, project };
    rec = state;
    const p = new Promise(res => { state.resolve = res; });

    const tickTo = opts.first ? startAt + FIRST_MAX : endAt;
    state.timer = setInterval(() => {
      if (!rec) return;
      const now = c.currentTime;
      if (now < startAt) {
        const left = Math.ceil((startAt - now) / spb);
        if (opts.onState) opts.onState('countin', left);
      } else if (!opts.first && now >= endAt) {
        finish();
      } else if (opts.first && now > tickTo) {
        finish();
      } else if (opts.onState) {
        opts.onState('recording', opts.first ? now - startAt : (now - startAt) / T.loopSec);
      }
    }, 60);
    return p;
  }

  function finish() {
    if (!rec) return;
    const c = ctx;
    const s = rec;
    rec = null;
    clearInterval(s.timer);
    const stopAt = s.opts.first ? c.currentTime : s.endAt;
    const post = s.opts.first ? 0.04 : POST;
    // let the tail of the last block arrive before slicing
    setTimeout(() => {
      endCapture();
      const samples = sliceCapture(s.startAt - PRE, stopAt + post);
      const out = {
        samples, sr: capture.sr,
        pre: PRE,
        duration: Math.max(0.001, stopAt - s.startAt),
        first: !!s.opts.first,
        startAt: s.startAt
      };
      s.resolve(out);
    }, 200);
  }

  function cancelRecord() {
    if (!rec) return;
    const s = rec; rec = null;
    clearInterval(s.timer);
    endCapture();
    s.resolve({ aborted: true });
  }
  const recording = () => !!rec;

  /* ------------------------------------------------------------- previews */
  let previewAt = 0;
  function preview(voiceId, project) {
    const c = ready(); if (!c) return;
    const v = Voices.get(voiceId);
    const t = Math.max(c.currentTime + 0.02, previewAt);
    previewAt = t + 0.9;
    const g = c.createGain(); g.gain.value = 0.9; g.connect(comp);
    if (v.kind === 'drum') {
      [0, 2, 1, 2].forEach((lane, i) => v.hit(c, g, lane, t + i * 0.16, 0.9));
    } else {
      const root = Math.round((v.lo + v.hi) / 2 / 12) * 12 + (project ? project.tonic : 5);
      [0, 3, 7].forEach((s, i) => v.play(c, g, root + s, t + i * 0.13, 0.5, 0.9));
    }
  }

  /** The chord that says a song was saved, in the song's own key. */
  function chime(project) {
    const c = ready(); if (!c) return;
    const v = Voices.get('glass');
    const root = 60 + project.tonic;
    const third = project.mode === 'minor' ? 3 : 4;
    const g = c.createGain(); g.gain.value = 0.8; g.connect(comp);
    [0, third, 7, 12].forEach((s, i) => v.play(c, g, root + s, c.currentTime + 0.02 + i * 0.07, 0.8, 0.85));
  }

  /* --------------------------------------------------------------- export */
  async function renderSong(project, opts) {
    opts = opts || {};
    const sr = 44100;
    const loopSec = project.beats * 60 / project.bpm;
    const scenes = project.scenes;
    let blocks = project.strip.filter(b => Store.scene(project, b.scene));
    if (!blocks.length) blocks = [{ scene: Store.current(project).id, repeats: 2 }];
    const total = blocks.reduce((n, b) => n + Math.max(1, b.repeats), 0) * loopSec;
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new OC(2, Math.ceil((total + 0.35) * sr), sr);

    const cp = oc.createDynamicsCompressor();
    cp.threshold.value = -12; cp.knee.value = 8; cp.ratio.value = 3;
    cp.attack.value = 0.004; cp.release.value = 0.16;
    const out = oc.createGain();
    out.gain.setValueAtTime(0.92, 0);
    out.gain.setValueAtTime(0.92, Math.max(0, total - 0.28));
    out.gain.linearRampToValueAtTime(0.0001, total + 0.3);
    cp.connect(out); out.connect(oc.destination);

    let t = 0;
    for (const b of blocks) {
      const sc = Store.scene(project, b.scene);
      const reps = Math.max(1, b.repeats);
      for (let i = 0; i < sc.layers.length; i++) {
        const layer = sc.layers[i];
        if (opts.only && layer.id !== opts.only) continue;
        if (!opts.only && layer.muted) continue;
        const buf = await layerBuffer(project, layer, sr);
        const g = oc.createGain();
        g.gain.value = opts.only ? Math.max(layer.vol, 0.5) : layer.vol;
        let node = g;
        if (oc.createStereoPanner) {
          const p = oc.createStereoPanner();
          p.pan.value = opts.only ? 0 : panOf(i);
          g.connect(p); node = p;
        }
        node.connect(cp);
        for (let r = 0; r < reps; r++) {
          const s = oc.createBufferSource();
          s.buffer = buf;
          s.connect(g);
          s.start(t + r * loopSec);
        }
      }
      t += reps * loopSec;
    }
    return oc.startRendering();
  }

  /** 16 bit stereo WAV. The only format we can write without shipping an encoder. */
  function wav(buffer) {
    const ch = Math.min(2, buffer.numberOfChannels);
    const n = buffer.length;
    const sr = buffer.sampleRate;
    const bytes = 44 + n * ch * 2;
    const ab = new ArrayBuffer(bytes);
    const dv = new DataView(ab);
    const str = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
    dv.setUint16(22, ch, true); dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, n * ch * 2, true);
    const data = [];
    for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        let v = data[c][i];
        v = v < -1 ? -1 : v > 1 ? 1 : v;
        dv.setInt16(off, v < 0 ? v * 32768 : v * 32767, true);
        off += 2;
      }
    }
    return ab;
  }

  function base64(ab) {
    const b = new Uint8Array(ab);
    let s = '';
    const step = 0x8000;
    for (let i = 0; i < b.length; i += step) {
      s += String.fromCharCode.apply(null, b.subarray(i, Math.min(i + step, b.length)));
    }
    return btoa(s);
  }

  function suspend() { if (ctx && ctx.state === 'running') { const r = ctx.suspend(); if (r && r.catch) r.catch(() => {}); } }

  return {
    ready, rate, micReady, releaseMic, level, click,
    derive, suggestOctave, layerBuffer, invalidate,
    play, stop, playing, phase, setGain, refresh, forget, nextBoundary,
    record, finish, cancelRecord, recording,
    preview, chime, renderSong, wav, base64, suspend, dropCache,
    firstMax: () => FIRST_MAX,
    loopSec: () => T.loopSec, scene: () => T.scene
  };
})();

window.Engine = Engine;
