/* The worked example.

   Greenroom is useless to look at without a take in it, and a reviewer, a
   borrowed phone or a denied permission can all leave you with no way to record
   one. So the app can build a take of its own: a speech-shaped sound generated
   here, on this phone, from arithmetic, and then measured by exactly the same
   analysis that measures you. Nothing is faked downstream. The pace, the pauses,
   the pitch and the level on the example screens are all really computed from
   the signal this file makes.

   It is never presented as a recording. Every screen it reaches is labelled, it
   lives in a speech called "An example, not a recording", and it can be removed
   in one tap from Settings. */

const Demo = (() => {

  const SR = 16000;
  const BASE = 116;          // the example voice's own centre, in hertz
  const DUR = 62;            // seconds

  const TITLE = 'An example, not a recording';
  const NOTE = 'Greenroom generated this sound on this phone so you can see what '
             + 'it does without recording anything. It is not a recording of you or of anyone.';

  /* A fixed seed, so the example is the same every time it is built. */
  function rng(seed) {
    let x = seed >>> 0;
    return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  }

  /* One period of a glottal-ish source: fourteen harmonics with a natural tilt.
     Reading a table beats fourteen sine calls a sample by a wide margin, and at
     this fundamental nothing lands anywhere near the Nyquist limit. */
  function sourceTable() {
    const N = 1024;
    const t = new Float32Array(N);
    for (let k = 1; k <= 14; k++) {
      const a = 1 / Math.pow(k, 1.1);
      for (let j = 0; j < N; j++) t[j] += a * Math.sin(2 * Math.PI * k * j / N);
    }
    let m = 0;
    for (let j = 0; j < N; j++) m = Math.max(m, Math.abs(t[j]));
    for (let j = 0; j < N; j++) t[j] /= m;
    return t;
  }

  /** The talk's shape: phrases at a speaking rate, with breaths between them and
      one stretch in the middle where it runs away. That stretch is there on
      purpose, so the coach has something true to say about it. */
  function plan(rnd) {
    const phrases = [];
    let t = 0.7;
    while (t < DUR - 2.2) {
      const rush = t > 16 && t < 34;
      const rate = rush ? 5.2 + rnd() * 0.4 : 3.2 + rnd() * 0.35;
      const count = Math.round(rush ? 20 + rnd() * 10 : 8 + rnd() * 11);
      const span = count / rate;
      if (t + span > DUR - 1.4) break;
      const syl = [];
      for (let i = 0; i < count; i++) {
        syl.push({
          at: t + (i + 0.08 * (rnd() - 0.5)) / rate,
          w: (0.74 + rnd() * 0.16) / rate,
          stress: (i % 3 === 0) || rnd() > 0.82
        });
      }
      // Every phrase sits on its own note, the way a person's does.
      phrases.push({ a: t, b: t + span, syl: syl, key: (rnd() - 0.5) * 5.4 });
      t += span + (rush ? 0.24 + rnd() * 0.22 : 0.4 + rnd() * 1.15);
    }
    return phrases;
  }

  const hann = x => 0.5 - 0.5 * Math.cos(2 * Math.PI * x);
  const ramp = (x, w) => (x < 0 ? 0 : x > w ? 1 : x / w);

  const yieldToPage = () => new Promise(r => setTimeout(r, 0));

  /** Builds the sound. Returns 16 bit mono at 16 kHz, the same shape a real take
      arrives in, so everything downstream is the ordinary path. It yields to the
      page as it goes, so the progress bar in front of it actually moves. */
  async function build(onProgress) {
    const say = p => { if (onProgress) onProgress(p); };
    const rnd = rng(20260921);
    const n = Math.round(DUR * SR);
    const amp = new Float32Array(n);
    const semi = new Float32Array(n);
    const phrases = plan(rnd);
    say(0.04);
    await yieldToPage();

    for (const p of phrases) {
      const a = Math.round(p.a * SR), b = Math.min(n, Math.round(p.b * SR));
      const edge = Math.round(0.045 * SR);
      for (let i = a; i < b; i++) {
        const g = Math.min(ramp(i - a, edge), ramp(b - i, edge));
        amp[i] = Math.max(amp[i], 0.3 * g);
        // Voices fall through a phrase, and lift again at the start of the next.
        const u = (i - a) / Math.max(1, b - a);
        semi[i] = p.key + 2.1 - 4.0 * u;
      }
      for (const sy of p.syl) {
        const s0 = Math.round(sy.at * SR), s1 = Math.min(n, Math.round((sy.at + sy.w) * SR));
        const lift = sy.stress ? 3.1 : 0.7;
        for (let i = Math.max(0, s0); i < s1; i++) {
          const u = (i - s0) / Math.max(1, s1 - s0);
          const h = hann(u);
          amp[i] = Math.min(1, amp[i] + 0.7 * h * (sy.stress ? 1 : 0.86));
          semi[i] += lift * h;
        }
      }
    }
    say(0.12);
    await yieldToPage();

    // A slow drift, so the pitch is never a machine holding one note.
    for (let i = 0; i < n; i++) semi[i] += 1.1 * Math.sin(i / SR * 0.62) + 0.45 * Math.sin(i / SR * 1.9 + 1.1);

    // One thing that is true of most real talks, and that the level chart exists
    // to show: a stretch that drops well under your own middle and stays there.
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let g = 1;
      if (t > 40.5 && t < 50.0) g *= 0.25 + 0.75 * (1 - Math.min(1, ramp(t - 40.5, 0.5) * ramp(50.0 - t, 0.5)));
      amp[i] *= g;
    }
    say(0.18);
    await yieldToPage();

    const table = sourceTable();
    const out = new Int16Array(n);
    let phase = 0;
    const CHUNK = Math.ceil(n / 12);
    for (let c = 0; c < n; c += CHUNK) {
      const end = Math.min(n, c + CHUNK);
      for (let i = c; i < end; i++) {
        const f0 = BASE * Math.pow(2, semi[i] / 12);
        phase += f0 / SR;
        if (phase >= 1) phase -= 1;
        const v = table[(phase * 1024) | 0];
        // A little breath noise rides with the voice, and the room is never silent.
        const air = (rnd() * 2 - 1) * (0.05 * amp[i] + 0.0013);
        let s = amp[i] * v * 0.23 + air;
        s = s > 1 ? 1 : s < -1 ? -1 : s;
        out[i] = Math.round(s * 32767);
      }
      say(0.18 + 0.62 * (end / n));
      await yieldToPage();
    }
    say(0.82);
    return { pcm: out, sr: SR, dur: n / SR };
  }

  return { build, TITLE, NOTE, DUR };
})();
