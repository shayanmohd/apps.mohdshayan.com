/* The voices. Nothing here is a sample: every sound is built out of oscillators,
   filters and noise at the moment it is needed, which is why the app is two
   megabytes rather than two hundred and why it works with the radio off.

   Each melodic voice is a small opinion about attack, decay and colour. The
   articulation arguments are not decoration: a short hummed syllable really does
   arrive with a harder attack and a shorter tail than a long one, because that is
   how the instrument would answer if you played it that way. */

const Voices = (() => {

  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  /* One noise bed per audio context, made once and shared by every hit. */
  const noiseFor = new WeakMap();
  function noise(ctx) {
    let b = noiseFor.get(ctx);
    if (b) return b;
    b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = 0.72 * last + 0.28 * w;      // a touch of pink, less hissy than white
      d[i] = w * 0.7 + last * 0.6;
    }
    noiseFor.set(ctx, b);
    return b;
  }

  function noiseSrc(ctx, t, dur) {
    const s = ctx.createBufferSource();
    s.buffer = noise(ctx);
    s.playbackRate.value = 1;
    s.loop = true;                      // long notes must not run off the end of the bed
    const off = Math.random() * 1.2;
    s.start(t, off, Math.max(0.01, dur));
    return s;
  }

  /** Attack then exponential fall. Returns the gain node, already scheduled. */
  function env(ctx, t, peak, attack, hold, fall) {
    const g = ctx.createGain();
    const p = Math.max(0.00012, peak);
    g.gain.setValueAtTime(0.00012, t);
    g.gain.linearRampToValueAtTime(p, t + attack);
    if (hold > 0) g.gain.setValueAtTime(p, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.00012, t + attack + hold + fall);
    return g;
  }

  function osc(ctx, type, f, t, stop, detune) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.start(t);
    o.stop(stop);
    return o;
  }

  /* Slow drift, the reason a synthesised chord does not sound like a dial tone. */
  function wobble(ctx, target, t, stop, cents, rate) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(rate, t);
    const amt = ctx.createGain();
    amt.gain.setValueAtTime(cents, t);
    lfo.connect(amt); amt.connect(target);
    lfo.start(t); lfo.stop(stop);
  }

  /* ------------------------------------------------------------- melodic */

  /** Felt: a piano with the hammers muffled. Warm, close, no sustain pedal. */
  function felt(ctx, out, m, t, dur, v) {
    const f = hz(m);
    const fall = Math.min(3.4, 1.5 + dur * 0.7) * (0.7 + v * 0.4);
    const stop = t + 0.02 + fall + 0.1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1500 + 2600 * v, t);
    lp.frequency.exponentialRampToValueAtTime(520, t + fall * 0.8);
    lp.Q.value = 0.6;
    const g = env(ctx, t, 0.30 * v, 0.006, 0, fall);
    [[1, 1], [2, 0.30], [3, 0.11], [4.02, 0.05]].forEach(([mult, amp]) => {
      const o = osc(ctx, 'sine', f * mult, t, stop);
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og); og.connect(lp);
    });
    // the hammer itself, a thud you hear more than a note
    const nz = noiseSrc(ctx, t, 0.05);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = Math.min(3800, f * 4); nf.Q.value = 1.1;
    const ng = env(ctx, t, 0.05 * v, 0.001, 0, 0.045);
    nz.connect(nf); nf.connect(ng); ng.connect(out);
    lp.connect(g); g.connect(out);
  }

  /** Dust: a tape loop of a synth that has been round the block. */
  function dust(ctx, out, m, t, dur, v) {
    const f = hz(m);
    const rel = 0.22;
    const len = Math.max(0.14, dur);
    const stop = t + len + rel + 0.1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(620 + 900 * v, t);
    lp.frequency.linearRampToValueAtTime(430, t + len);
    lp.Q.value = 3.2;
    const g = env(ctx, t, 0.17 * v, 0.045, len * 0.75, rel);
    const a = osc(ctx, 'sawtooth', f, t, stop, -7);
    const b = osc(ctx, 'sawtooth', f, t, stop, 9);
    const c = osc(ctx, 'triangle', f / 2, t, stop);
    wobble(ctx, a.detune, t, stop, 11, 4.9);   // the warble of a stretched tape
    wobble(ctx, b.detune, t, stop, 9, 3.3);
    const cg = ctx.createGain(); cg.gain.value = 0.45;
    a.connect(lp); b.connect(lp); c.connect(cg); cg.connect(lp);
    lp.connect(g); g.connect(out);
    // tape hiss, only while the note sounds
    const nz = noiseSrc(ctx, t, len + rel);
    const nh = ctx.createBiquadFilter();
    nh.type = 'highpass'; nh.frequency.value = 3600;
    const ng = env(ctx, t, 0.012, 0.05, len * 0.6, rel);
    nz.connect(nh); nh.connect(ng); ng.connect(out);
  }

  /** Upright: an acoustic bass, string noise and all. Always in the cellar. */
  function upright(ctx, out, m, t, dur, v) {
    const f = hz(m);
    const fall = Math.min(2.2, 0.75 + dur * 0.9);
    const stop = t + fall + 0.12;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + fall);
    const g = env(ctx, t, 0.42 * v, 0.012, 0, fall);
    const o1 = osc(ctx, 'triangle', f, t, stop);
    const o2 = osc(ctx, 'sine', f / 2, t, stop);
    const o3 = osc(ctx, 'sawtooth', f, t, stop, 5);
    const g2 = ctx.createGain(); g2.gain.value = 0.6;
    const g3 = ctx.createGain(); g3.gain.value = 0.13;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); o3.connect(g3); g3.connect(lp);
    lp.connect(g); g.connect(out);
    const nz = noiseSrc(ctx, t, 0.07);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 2200; nf.Q.value = 0.9;
    const ng = env(ctx, t, 0.045 * v, 0.002, 0, 0.06);
    nz.connect(nf); nf.connect(ng); ng.connect(out);
  }

  /** Brass Sunday: three horns who have played together for years. */
  function brass(ctx, out, m, t, dur, v) {
    const f = hz(m);
    const len = Math.max(0.18, dur);
    const rel = 0.18;
    const stop = t + len + rel + 0.1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(1500 + 1500 * v, t + 0.09);
    lp.frequency.linearRampToValueAtTime(1050, t + len);
    lp.Q.value = 1.4;
    const g = env(ctx, t, 0.13 * v, 0.062, len * 0.72, rel);
    [-9, 0, 8].forEach((det, i) => {
      const o = osc(ctx, 'sawtooth', f, t, stop, det);
      wobble(ctx, o.detune, t, stop, 5, 4.4 + i * 0.7);
      const og = ctx.createGain(); og.gain.value = i === 1 ? 0.5 : 0.32;
      o.connect(og); og.connect(lp);
    });
    const sub = osc(ctx, 'sine', f, t, stop);
    const sg = ctx.createGain(); sg.gain.value = 0.3;
    sub.connect(sg); sg.connect(lp);
    lp.connect(g); g.connect(out);
  }

  /** Choirette: your melody, sung back at you by a small room of yous. */
  function choir(ctx, out, m, t, dur, v) {
    const f = hz(m);
    const len = Math.max(0.2, dur);
    const rel = 0.36;
    const stop = t + len + rel + 0.12;
    const bus = ctx.createGain(); bus.gain.value = 1;
    [-14, -5, 4, 12].forEach((det, i) => {
      const o = osc(ctx, i % 2 ? 'triangle' : 'sine', f, t, stop, det);
      wobble(ctx, o.detune, t, stop, 13, 4.6 + i * 0.55);
      const og = ctx.createGain(); og.gain.value = 0.3;
      o.connect(og); og.connect(bus);
    });
    const o5 = osc(ctx, 'sine', f * 2, t, stop, 6);
    const g5 = ctx.createGain(); g5.gain.value = 0.09;
    o5.connect(g5); g5.connect(bus);
    // two vowel resonances is the whole difference between a pad and an "ooh"
    const f1 = ctx.createBiquadFilter();
    f1.type = 'peaking'; f1.frequency.value = 430; f1.Q.value = 4; f1.gain.value = 9;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'peaking'; f2.frequency.value = 1020; f2.Q.value = 5; f2.gain.value = 6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2800;
    const g = env(ctx, t, 0.19 * v, 0.13, Math.max(0.02, len * 0.6), rel);
    bus.connect(f1); f1.connect(f2); f2.connect(lp); lp.connect(g); g.connect(out);
  }

  /** Nylon: a plucked string, made the honest way. A burst of noise trapped in a
      delay line that loses its high end a little more on every lap. */
  function pluck(ctx, out, m, t, dur, v, bright, decay) {
    const f = hz(m);
    const sr = ctx.sampleRate;
    const n = Math.max(2, Math.round(sr / f));
    const seconds = Math.min(3.0, 0.6 + dur * 1.1);
    const N = Math.ceil(seconds * sr);
    const buf = ctx.createBuffer(1, N, sr);
    const d = buf.getChannelData(0);
    const line = new Float32Array(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      lp += bright * (w - lp);
      line[i] = lp;
    }
    let idx = 0, prev = line[n - 1];
    for (let i = 0; i < N; i++) {
      const cur = line[idx];
      d[i] = cur;
      line[idx] = (cur + prev) * 0.5 * decay;
      prev = cur;
      idx = idx + 1 === n ? 0 : idx + 1;
    }
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = env(ctx, t, 0.42 * v, 0.003, seconds * 0.45, seconds * 0.5);
    s.connect(g); g.connect(out);
    s.start(t);
    s.stop(t + seconds + 0.05);
  }

  function nylon(ctx, out, m, t, dur, v) { pluck(ctx, out, m, t, dur, v, 0.42, 0.9955); }

  /** Glass: a music box. Bright, inharmonic, gone before you can hold it. */
  function glass(ctx, out, m, t, dur, v) {
    const f = hz(m);
    const fall = 1.15 + Math.min(0.9, dur * 0.5);
    const stop = t + fall + 0.08;
    const g = env(ctx, t, 0.20 * v, 0.004, 0, fall);
    [[1, 1], [2.76, 0.30], [5.4, 0.12], [8.9, 0.05]].forEach(([mult, amp]) => {
      const o = osc(ctx, 'sine', f * mult, t, stop);
      const og = ctx.createGain();
      // the higher partials of a struck bar die first
      og.gain.setValueAtTime(amp, t);
      og.gain.exponentialRampToValueAtTime(0.0002, t + fall / Math.max(1, mult * 0.6));
      o.connect(og); og.connect(g);
    });
    const nz = noiseSrc(ctx, t, 0.03);
    const nf = ctx.createBiquadFilter();
    nf.type = 'highpass'; nf.frequency.value = 5200;
    const ng = env(ctx, t, 0.035 * v, 0.001, 0, 0.028);
    nz.connect(nf); nf.connect(ng); ng.connect(out);
    g.connect(out);
  }

  /* --------------------------------------------------------------- drums */

  function kick(ctx, out, t, v, soft) {
    const stop = t + 0.5;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(soft ? 118 : 152, t);
    o.frequency.exponentialRampToValueAtTime(soft ? 58 : 44, t + (soft ? 0.05 : 0.075));
    o.start(t); o.stop(stop);
    const g = env(ctx, t, (soft ? 0.42 : 0.72) * v, 0.002, 0, soft ? 0.2 : 0.34);
    o.connect(g); g.connect(out);
    const nz = noiseSrc(ctx, t, 0.05);
    const nf = ctx.createBiquadFilter();
    nf.type = soft ? 'bandpass' : 'lowpass';
    nf.frequency.value = soft ? 480 : 1600;
    nf.Q.value = 1.2;
    const ng = env(ctx, t, (soft ? 0.20 : 0.10) * v, 0.001, 0, soft ? 0.045 : 0.028);
    nz.connect(nf); nf.connect(ng); ng.connect(out);
  }

  function snare(ctx, out, t, v, soft) {
    const nz = noiseSrc(ctx, t, 0.35);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(soft ? 1100 : 1850, t);
    bp.frequency.exponentialRampToValueAtTime(soft ? 700 : 1200, t + 0.16);
    bp.Q.value = soft ? 1.5 : 0.85;
    const ng = env(ctx, t, (soft ? 0.26 : 0.40) * v, 0.001, 0, soft ? 0.105 : 0.175);
    nz.connect(bp); bp.connect(ng); ng.connect(out);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(soft ? 240 : 195, t);
    o.frequency.exponentialRampToValueAtTime(soft ? 150 : 128, t + 0.1);
    o.start(t); o.stop(t + 0.25);
    const g = env(ctx, t, (soft ? 0.22 : 0.20) * v, 0.001, 0, soft ? 0.075 : 0.11);
    o.connect(g); g.connect(out);
  }

  function hat(ctx, out, t, v, soft) {
    const nz = noiseSrc(ctx, t, 0.14);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = soft ? 4200 : 7200;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = soft ? 5200 : 9800; bp.Q.value = 0.7;
    const g = env(ctx, t, (soft ? 0.16 : 0.22) * v, 0.001, 0, soft ? 0.062 : 0.045);
    nz.connect(hp); hp.connect(bp); bp.connect(g); g.connect(out);
  }

  /* ------------------------------------------------------------ the list */

  const LIST = [
    { id: 'felt', name: 'Felt', kind: 'melodic', blurb: 'Muffled hammers',
      lo: 48, hi: 84, play: felt },
    { id: 'dust', name: 'Dust', kind: 'melodic', blurb: 'Tape warble synth',
      lo: 45, hi: 79, play: dust },
    { id: 'upright', name: 'Upright', kind: 'melodic', blurb: 'Double bass, upright',
      lo: 28, hi: 55, play: upright },
    { id: 'brass', name: 'Brass Sunday', kind: 'melodic', blurb: 'Three soft horns',
      lo: 46, hi: 78, play: brass },
    { id: 'choir', name: 'Choirette', kind: 'melodic', blurb: 'Your melody as oohs',
      lo: 50, hi: 81, play: choir },
    { id: 'nylon', name: 'Nylon', kind: 'melodic', blurb: 'Bedroom guitar',
      lo: 40, hi: 76, play: nylon },
    { id: 'glass', name: 'Glass', kind: 'melodic', blurb: 'Music box, brief',
      lo: 60, hi: 93, play: glass },
    { id: 'kit', name: 'Kit', kind: 'drum', blurb: 'Tight studio drums',
      hit: (ctx, out, lane, t, v) => [kick, snare, hat][lane](ctx, out, t, v, false) },
    { id: 'card', name: 'Cardboard', kind: 'drum', blurb: 'A box and a shush',
      hit: (ctx, out, lane, t, v) => [kick, snare, hat][lane](ctx, out, t, v, true) }
  ];

  const BY = {};
  LIST.forEach(v => { BY[v.id] = v; });

  const get = id => BY[id] || BY.felt;
  const all = () => LIST;
  const melodic = () => LIST.filter(v => v.kind === 'melodic');
  const drums = () => LIST.filter(v => v.kind === 'drum');
  const isDrum = id => get(id).kind === 'drum';

  /** The octave shift that lands a melody where this voice actually lives. */
  function fitOctave(voice, midis) {
    if (voice.kind === 'drum' || !midis.length) return 0;
    const mid = midis.slice().sort((a, b) => a - b)[midis.length >> 1];
    const want = (voice.lo + voice.hi) / 2;
    return Math.round((want - mid) / 12);
  }

  const LANES = ['Kick', 'Snare', 'Hat'];

  return { get, all, melodic, drums, isDrum, fitOctave, hz, LANES, noise };
})();

window.Voices = Voices;
