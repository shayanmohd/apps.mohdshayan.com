/* Loopwright's screens. Three surfaces: the Pad you play, the Arrange strip that
   turns loops into a song, and the Library that keeps them. Everything below is
   presentation and intent; the listening lives in dsp.js and the sound in
   engine.js and voices.js. */

const App = (() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));

  let project = null;
  let view = 'pad';
  let padState = 'idle';        // idle | counting | recording | thinking
  let openLayer = null;
  let songSrc = null, songStart = 0, songDur = 0;
  let armedProject = null;      // the delete-confirm on a library card
  let taps = [];
  let takeBusy = false;      // startTake has awaits in it; a second tap must not slip through
  let raf = 0;
  let lastBeat = -1;
  let lastPlaying = false;

  /* ------------------------------------------------------------- helpers */

  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }
  function busy(on, text) {
    $('#busy').hidden = !on;
    if (text) $('#busyText').textContent = text;
  }
  function buzz(ms, amp) {
    if (!Store.settings().haptics) return;
    try {
      if (window.Native && Native.vibrate) Native.vibrate(ms, amp || 140);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {}
  }
  const isNative = () => !!(window.Native && Native.isNative);

  /* A thumb on a phone bounces. Anything that creates a thing rather than
     toggling one asks this first, so one intended tap makes one thing. */
  const lastFire = {};
  function once(key, ms) {
    const now = Date.now();
    if (lastFire[key] && now - lastFire[key] < (ms || 450)) return false;
    lastFire[key] = now;
    return true;
  }

  function sheet(id, on) {
    $(id).hidden = !on;
  }
  const anySheet = () => $$('.sheet').filter(s => !s.hidden)[0] || null;

  /* --------------------------------------------------------------- top bar */

  function renderTop() {
    $('#tbTitleText').textContent = Store.title(project);
    $('#tbBpm').textContent = Math.round(project.bpm);
    $('#tbKeyName').textContent = Store.keyName(project);
  }

  /* ----------------------------------------------------------- the ring */

  function pt(deg, r) {
    const a = (deg - 90) * Math.PI / 180;
    return [150 + r * Math.cos(a), 150 + r * Math.sin(a)];
  }
  function arcD(a0, a1, r) {
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
    const large = (a1 - a0) > 180 ? 1 : 0;
    return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) +
           ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
  }

  /* The signature. The ring is not a progress bar cut into pieces: it is the
     waveform of the loop, bent until its ends meet, which is the launcher icon
     drawn at screen size. Each layer owns an arc of it, and the wiggle inside
     that arc is that layer's own material sampled round the loop, so a held
     drone swells and a hat pattern reads as a comb. Muted layers keep their
     shape at a quarter of the height rather than vanishing. */
  const RING_R = 112;

  /** A layer's energy round the loop, in `bins` samples, peak normalised. */
  function envelope(layer, bins, ofBeats) {
    const beats = ofBeats || project.beats || 8;
    const key = bins + '|' + beats + '|' + (layer.src ? layer.src.length : 0) + '|' + layer.kind;
    if (layer._env && layer._envk === key) return layer._env;
    const out = new Float32Array(bins);
    const drum = layer.kind === 'drum';
    (layer.src || []).forEach(e => {
      const at = (((e.t % beats) + beats) % beats) / beats;
      const wide = drum ? 0.028 : Math.max(0.035, Math.min(0.11, (e.d || 0.5) / (beats * 2)));
      const v = Math.max(0.2, Math.min(1, e.v || 0.7));
      for (let k = 0; k < bins; k++) {
        let d = Math.abs(k / bins - at);
        if (d > 0.5) d = 1 - d;
        const g = Math.exp(-(d * d) / (2 * wide * wide));
        if (g > 0.004) out[k] += v * g;
      }
    });
    // one smoothing pass, so a comb of hits draws as a comb and not as aliasing
    const sm = new Float32Array(bins);
    for (let k = 0; k < bins; k++) {
      sm[k] = (out[(k - 1 + bins) % bins] + 2 * out[k] + out[(k + 1) % bins]) / 4;
    }
    let m = 0;
    for (let k = 0; k < bins; k++) if (sm[k] > m) m = sm[k];
    // a gentle contrast curve, so a busy layer still shows its troughs and does
    // not flatten into a plain circle once everything is normalised
    if (m > 0) for (let k = 0; k < bins; k++) sm[k] = Math.pow(sm[k] / m, 1.6);
    layer._env = sm; layer._envk = key;
    return sm;
  }

  /** One layer's arc, drawn as its waveform, tapered into the gaps at each end. */
  function segPath(a0, a1, R, amp, env) {
    const n = Math.max(16, Math.round((a1 - a0) / 1.5));
    let d = '';
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      const taper = Math.min(1, Math.min(f, 1 - f) * 6);
      const e = env[Math.min(env.length - 1, Math.round(f * (env.length - 1)))];
      const [x, y] = pt(a0 + (a1 - a0) * f, R + amp * e * taper);
      d += (k ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d;
  }

  /* The empty ring is a waveform at rest: twenty small cycles round the circle
     with their height swelling and falling, which is the same shape a recorded
     layer draws and the same shape the launcher icon carries. */
  function idlePath(R, amp) {
    const steps = 420;
    let d = '';
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      const swell = 0.34 + 0.42 * Math.pow(Math.sin(Math.PI * 2 * 2 * f + 1.1), 2) +
                    0.24 * Math.pow(Math.sin(Math.PI * 2 * 3 * f), 2);
      const [px, py] = pt(f * 360, R + amp * swell * Math.sin(Math.PI * 2 * 20 * f));
      d += (k ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
    }
    return d + 'Z';
  }

  function renderRing() {
    const sc = Store.current(project);
    const n = sc.layers.length;
    const R = RING_R;
    let s = '';
    if (!n) {
      s += '<circle cx="150" cy="150" r="' + R + '" class="seg seg-bg" stroke-width="3" opacity="0.5"/>';
      s += '<path class="seg seg-idle" stroke-width="7" d="' + idlePath(R, 15) + '"/>';
    } else {
      s += '<circle cx="150" cy="150" r="' + R + '" class="seg seg-bg" stroke-width="4" opacity="0.6"/>';
      const gap = n > 1 ? 7 : 4;
      for (let i = 0; i < n; i++) {
        const l = sc.layers[i];
        const a0 = i * 360 / n + gap / 2;
        const a1 = (i + 1) * 360 / n - gap / 2;
        const cls = l.muted ? 'seg-off' : 'seg-on';
        const w = l.muted ? 5 : 8 + Math.round(l.vol * 4);
        const amp = (l.muted ? 4 : 9 + l.vol * 7);
        const d = segPath(a0, a1, R, amp, envelope(l, 96));
        if (!l.muted) s += '<path class="seg seg-glow" stroke-width="' + (w + 4) + '" d="' + d + '"/>';
        s += '<path class="seg ' + cls + '" stroke-width="' + w + '" d="' + d + '"/>';
        s += '<path class="seg" stroke="transparent" stroke-width="40" data-layer="' + l.id +
             '" d="' + arcD(a0, a1, R) + '"/>';
      }
    }
    s += '<path id="recArc" class="seg seg-on" stroke-width="3" stroke-dasharray="2 6" d="" opacity="0.9"/>';
    s += '<g id="phg"><line class="playhead" x1="150" y1="' + (150 - R - 15) +
         '" x2="150" y2="' + (150 - R + 15) + '" opacity="0"/></g>';
    $('#ring').innerHTML = s;
    $$('#ring [data-layer]').forEach(el => bindSegment(el, el.getAttribute('data-layer')));
  }


  /* Tap to mute, hold to open the layer. The short tap is handled on `click`
     rather than on pointerup so that a keyboard, an accessibility service and a
     plain synthetic click all reach it; the hold sets a flag that swallows the
     click that follows it. */
  function bindHold(el, id) {
    let timer = 0, swallow = false, startX = 0, startY = 0;
    el.addEventListener('pointerdown', e => {
      swallow = false; startX = e.clientX; startY = e.clientY;
      timer = setTimeout(() => { swallow = true; buzz(14, 90); openLayerSheet(id); }, 450);
    });
    el.addEventListener('pointermove', e => {
      if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) {
        clearTimeout(timer); swallow = true;
      }
    });
    el.addEventListener('pointerup', () => clearTimeout(timer));
    el.addEventListener('pointercancel', () => { clearTimeout(timer); swallow = true; });
    el.addEventListener('click', () => {
      if (swallow) { swallow = false; return; }
      toggleMute(id);
    });
  }
  const bindSegment = bindHold;

  /* ---------------------------------------------------------- layer chips */

  function renderLayers() {
    const sc = Store.current(project);
    const box = $('#layerStrip');
    if (!sc.layers.length) {
      box.innerHTML = '<p class="emptylayers">No layers yet. The ring fills as you record.</p>';
      return;
    }
    box.innerHTML = sc.layers.map(l => {
      const v = Voices.get(l.voice);
      const drum = l.kind === 'drum';
      const cls = 'lchip' + (l.muted ? ' off' : '');
      const count = drum ? l.src.length + ' hits' : l.src.length + ' notes';
      const wave = drum
        ? '<svg viewBox="0 0 15 11"><path d="M2 1.6 V9.4 M7.5 3.6 V7.4 M13 0.9 V10.1"/></svg>'
        : '<svg viewBox="0 0 15 11"><path d="M1 5.5 C2.9 5.5 2.6 1.4 4.6 1.4 C7 1.4 6.6 9.6 9 9.6 C11 9.6 10.7 5.5 12.6 5.5 L14 5.5"/></svg>';
      return '<button class="' + cls + '" data-id="' + l.id + '">' + wave +
             escapeHtml(v.name) + ' <small>' + count + '</small></button>';
    }).join('');
    Array.prototype.forEach.call(box.children, el => bindHold(el, el.getAttribute('data-id')));
  }

  function toggleMute(id) {
    const sc = Store.current(project);
    const l = sc.layers.find(x => x.id === id);
    if (!l) return;
    l.muted = !l.muted;
    Store.touch(project);
    Engine.setGain(l);
    renderLayers(); renderRing();
    buzz(10, 70);
    if (Store.guide() === 2) advanceGuide(3);
  }

  /* --------------------------------------------------------- voice shelf */

  /* Nine voices, nine drawn waveforms. A shelf of identical tiles tells you
     nothing; these say plucked, held, breathy or struck before you hear them. */
  const VOICE_SHAPE = {
    felt:    [0.16, 0.66, 0.92, 0.56, 0.3, 0.72, 0.95, 0.5, 0.24, 0.42, 0.2],
    dust:    [0.42, 0.54, 0.44, 0.62, 0.5, 0.68, 0.52, 0.6, 0.46, 0.56, 0.44],
    upright: [0.08, 0.34, 0.82, 1, 0.78, 0.32, 0.1, 0.4, 0.86, 0.5, 0.14],
    brass:   [0.18, 0.7, 0.88, 0.9, 0.88, 0.86, 0.88, 0.8, 0.58, 0.28, 0.12],
    choir:   [0.1, 0.28, 0.54, 0.76, 0.9, 0.94, 0.86, 0.66, 0.42, 0.22, 0.08],
    nylon:   [0.96, 0.6, 0.36, 0.2, 0.86, 0.52, 0.3, 0.16, 0.72, 0.4, 0.2],
    glass:   [0.94, 0.26, 0.12, 0.84, 0.22, 0.1, 0.72, 0.18, 0.08, 0.56, 0.14],
    kit:     [1, 0.2, 0.56, 0.18, 0.82, 0.24, 0.5, 0.2, 0.96, 0.28, 0.46],
    card:    [0.82, 0.3, 0.44, 0.24, 0.64, 0.34, 0.4, 0.22, 0.74, 0.36, 0.3]
  };
  function voiceTex(id, drum) {
    const a = VOICE_SHAPE[id] || VOICE_SHAPE.felt;
    const W = 84, H = 15, mid = H / 2, span = (W - 4) / (a.length - 1);
    let d = '';
    for (let i = 0; i < a.length; i++) {
      const x = +(2 + i * span).toFixed(1);
      if (drum) {
        const h = a[i] * (mid - 1.1);
        d += 'M' + x + ' ' + (mid - h).toFixed(1) + 'L' + x + ' ' + (mid + h).toFixed(1) + ' ';
      } else {
        d += (i ? 'L' : 'M') + x + ' ' + (mid - (a[i] - 0.5) * (H - 3)).toFixed(1) + ' ';
      }
    }
    return '<svg class="tex" viewBox="0 0 84 15" aria-hidden="true"><path d="' + d.trim() + '"/></svg>';
  }
  function voiceTile(v, on) {
    return '<button class="vtile' + (on ? ' is-on' : '') + '" data-v="' + v.id + '">' +
      voiceTex(v.id, v.kind === 'drum') + '<b>' + escapeHtml(v.name) + '</b>' +
      '<span class="blurb">' + escapeHtml(v.blurb) + '</span></button>';
  }

  function renderShelf() {
    const cur = Store.settings().voice;
    $('#shelf').innerHTML = Voices.all().map(v => voiceTile(v, v.id === cur)).join('');
    Array.prototype.forEach.call($('#shelf').children, el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-v');
        Store.set('voice', id);
        Engine.preview(id, project);
        renderShelf(); renderPadFace();
      });
    });
  }

  /* ------------------------------------------------------------ the pad */

  function renderPadFace() {
    const big = $('#padBig'), sub = $('#padSub'), pad = $('#pad');
    const v = Voices.get(Store.settings().voice);
    const sc = Store.current(project);
    pad.classList.toggle('rec', padState === 'recording' || padState === 'counting');
    big.classList.remove('count');
    if (padState === 'thinking') {
      big.textContent = 'Listening';
      sub.textContent = 'Working out what you meant';
      return;
    }
    if (padState === 'recording') {
      big.textContent = 'Recording';
      sub.textContent = sc.layers.length ? 'One time round, then it closes'
                                         : 'Tap again to close the loop';
      return;
    }
    if (padState === 'counting') { sub.textContent = 'Come in on the one'; return; }
    if (sc.layers.length >= 8) {
      big.textContent = 'Full';
      sub.textContent = 'Eight layers. Copy the scene to keep going.';
      return;
    }
    big.textContent = v.kind === 'drum' ? 'Beat' : 'Hum';
    sub.textContent = v.kind === 'drum'
      ? 'Tap, then say boots and cats'
      : (sc.layers.length ? 'Tap and hum the next part' : 'Tap and hum a melody');
  }

  function renderPad() {
    renderTop();
    renderRing();
    renderLayers();
    renderShelf();
    renderPadFace();
    renderScenes();
    const sc = Store.current(project);
    $('#btnUndo').disabled = !sc.layers.length || padState !== 'idle';
    $('#btnScene').disabled = !sc.layers.length || padState !== 'idle';
    $('#btnPlay').disabled = !sc.layers.length;
    $('#btnPlay').classList.toggle('on', Engine.playing());
    $('#playLabel').textContent = Engine.playing() ? 'Stop' : 'Play';
  }

  function renderScenes() {
    const row = $('#sceneRow');
    row.innerHTML = project.scenes.map(s =>
      '<button class="scenechip' + (s.id === project.openScene ? ' is-on' : '') +
      '" data-s="' + s.id + '">Scene ' + escapeHtml(s.name) + '</button>'
    ).join('') + '<button class="scenechip add" data-add="1">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6 V18 M6 12 H18"/></svg>New scene</button>';
    // with eight scenes the open one can sit off the end of the row; the row is
    // scrolled by hand rather than with scrollIntoView, which would also move the
    // pad screen underneath it
    const on = row.querySelector('.is-on');
    if (on) row.scrollLeft = Math.max(0, on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2);
    Array.prototype.forEach.call(row.children, el => {
      el.addEventListener('click', () => {
        if (el.getAttribute('data-add')) {
          if (!once('scene', 500)) return;
          if (project.scenes.length >= 8) { toast('Eight scenes is plenty for one song.'); return; }
          Store.addScene(project, null);
          Engine.stop();
        } else {
          project.openScene = el.getAttribute('data-s');
          Store.touch(project);
          Engine.stop();
        }
        renderPad();
      });
    });
  }

  /* ------------------------------------------------------------ recording */

  function onRecState(state, n) {
    if (state === 'countin') {
      if (padState !== 'counting') { padState = 'counting'; renderPadFace(); }
      const big = $('#padBig');
      big.classList.add('count');
      if (big.textContent !== String(n)) {
        big.textContent = String(n);
        buzz(18, 120);
      }
    } else if (state === 'recording') {
      if (padState !== 'recording') {
        padState = 'recording';
        buzz(28, 200);
        renderPadFace();
        renderPad();
      }
    }
  }

  /* startTake waits on the loop starting and then on the microphone, and a
     second tap that arrives inside either await used to arm a second take on top
     of the first. The flag closes that window; cancelling still works, because
     onPadTap only reaches here while the pad is idle. */
  async function startTake() {
    if (takeBusy) return;
    takeBusy = true;
    try { await runTake(); } finally { takeBusy = false; }
  }

  async function runTake() {
    const sc = Store.current(project);
    if (sc.layers.length >= 8) {
      note('Eight layers is the most a scene holds. Copy the scene, or remove one.', true);
      return;
    }
    const first = sc.layers.length === 0;
    if (!first && !Engine.playing()) await Engine.play(project, sc.id);
    if (!first && !Store.settings().headphones) {
      Store.set('headphones', true);
      note('Headphones help from here. Without them the microphone hears the loop as well as you.');
    }

    padState = 'counting';
    $('#padNote').textContent = '';
    renderPadFace();

    const voiceId = Store.settings().voice;
    const drum = Voices.isDrum(voiceId);
    const res = await Engine.record(project, {
      first: first,
      countIn: Store.settings().countIn,
      click: Store.settings().click,
      onState: onRecState
    });

    if (!res || res.error) {
      padState = 'idle';
      renderPad();
      note(res && res.error ? res.error : 'Recording did not start.', true, res && res.refused);
      return;
    }
    if (res.aborted) { padState = 'idle'; renderPad(); return; }

    padState = 'thinking';
    renderPadFace();
    busy(true, drum ? 'Sorting the hits' : 'Listening back');
    await new Promise(r => setTimeout(r, 40));

    try {
      await commitTake(res, voiceId, drum, first);
    } catch (e) {
      note('Something went wrong turning that into a layer.', true);
    }
    busy(false);
    padState = 'idle';
    renderPad();
  }

  /* A note can carry one action. The microphone is the only thing a user can be
     locked out of: Android stops showing the dialog after two refusals, so
     "allow it and tap again" is a dead end without a way to the settings page.
     That note stays until the next one replaces it, rather than fading away. */
  let noteSeq = 0;
  function note(text, warn, fixMic) {
    const n = $('#padNote');
    const seq = ++noteSeq;
    n.textContent = text;
    n.classList.toggle('warn', !!warn);
    const canFix = fixMic && window.Native && Native.openAppSettings;
    if (canFix) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quietlink';
      b.textContent = 'Open app settings';
      b.addEventListener('click', () => { try { Native.openAppSettings(); } catch (e) {} });
      n.appendChild(b);
    }
    if (text && !canFix) {
      setTimeout(() => {
        if (noteSeq === seq) { n.textContent = ''; n.classList.remove('warn'); }
      }, 6500);
    }
  }

  async function commitTake(res, voiceId, drum, first) {
    if (res.duration < 1.1 && first) {
      note('That was too short to build a loop from. Give it a few seconds.', true);
      return;
    }
    const capped = first && res.duration >= Engine.firstMax() - 0.6;
    const heard = drum ? DSP.hearDrums(res.samples, res.sr) : DSP.hearMelody(res.samples, res.sr);
    const events = drum ? heard.hits : heard.notes;
    if (!events.length) {
      note(heard.quiet
        ? 'I could not hear anything. Check the microphone and try a little louder.'
        : (drum ? 'No clear hits in that one. Try sharper sounds: b, k, ts.'
                : 'No steady pitch in that one. Try humming one long note first.'), true);
      return;
    }

    const sc = Store.current(project);
    // The take is captured a fraction before the one and a fraction after the loop
    // point, so times are measured from the beat rather than from the slice.
    const pre = res.pre || 0;
    if (first) {
      const fit = DSP.fitLoop(res.duration, events.map(e => e.t - pre));
      project.bpm = fit.bpm;
      project.beats = fit.beats;
    }
    const spb = 60 / project.bpm;
    const src = events.map(e => drum
      ? { lane: e.lane, t: (e.t - pre) / spb, v: e.v }
      : { p: e.p, t: (e.t - pre) / spb, d: Math.max(0.1, e.d / spb), v: e.v });
    const swing = DSP.detectSwing(src.map(e => e.t));

    if (!drum) {
      const melodicAlready = project.scenes.some(s => s.layers.some(l => l.kind === 'melodic'));
      if (!melodicAlready && !project.keyLocked) {
        const k = DSP.inferKey(src.map(e => ({ p: e.p, d: e.d })));
        if (k) { project.tonic = k.tonic; project.mode = k.mode; }
      }
    }

    // The hum itself, kept at 16k so the A/B comparison costs kilobytes not
    // megabytes. It is a nicety, not the layer: if the store will not take it the
    // take still becomes music, just without the voice to compare against.
    let key = null;
    try {
      const small = DSP.resample(res.samples, res.sr, 16000);
      key = await Hums.put(Store.uid('h'), small, 16000);
    } catch (e) { key = null; }

    const layer = Store.addLayer(project, sc, {
      kind: drum ? 'drum' : 'melodic',
      voice: voiceId,
      src: src,
      swing: swing,
      octave: drum ? 0 : Engine.suggestOctave(voiceId, src),
      tighten: Store.settings().tighten,
      hum: key,
      humDur: res.duration
    });

    if (!Store.save()) { toast(Store.error(), 5000); }
    buzz(40, 210);
    if (first) {
      await Engine.play(project, sc.id);
    } else {
      await Engine.refresh(project, layer, sc.layers.length - 1);
    }
    note(capped
      ? 'That is as long as a first loop goes. Loopwright closed it for you at ' +
        Engine.firstMax() + ' seconds.'
      : (drum
        ? events.length + ' hits, snapped to the groove you played.'
        : events.length + ' notes in ' + Store.keyLong(project) + '.'), capped);

    if (Store.guide() === 0) advanceGuide(1);
    else if (Store.guide() === 1) advanceGuide(2);
  }

  function onPadTap() {
    Engine.ready();
    if (padState === 'recording') {
      const sc = Store.current(project);
      if (!sc.layers.length) Engine.finish();
      return;
    }
    if (padState === 'counting') {
      Engine.cancelRecord();
      padState = 'idle';
      renderPad();
      return;
    }
    if (padState === 'thinking') return;
    startTake();
  }

  /* ------------------------------------------------------- the layer sheet */

  function openLayerSheet(id) {
    const sc = Store.current(project);
    const l = sc.layers.find(x => x.id === id);
    if (!l) return;
    openLayer = l;
    const drum = l.kind === 'drum';
    $('#lsTitle').textContent = Voices.get(l.voice).name;
    $('#lsHelp').textContent = drum
      ? l.src.length + ' hits, heard as kick, snare and hat.'
      : l.src.length + ' notes, snapped into ' + Store.keyLong(project) + '.';
    $('#lsVol').value = Math.round(l.vol * 100);
    $('#lsVolVal').textContent = Math.round(l.vol * 100);
    $('#lsTight').value = Math.round(l.tighten * 100);
    $('#lsTightVal').textContent = Math.round(l.tighten * 100);
    $('#lsOctVal').textContent = l.octave > 0 ? '+' + l.octave : String(l.octave);
    $('#lsOctField').hidden = drum;
    $('#lsChordField').hidden = drum;
    $('#lsChords').checked = !!l.chords;
    $('#lsAb').checked = !!l.ab;
    $('#lsAbField').hidden = !l.hum;
    const pool = drum ? Voices.drums() : Voices.melodic();
    $('#lsVoices').innerHTML = pool.map(v => voiceTile(v, v.id === l.voice)).join('');
    Array.prototype.forEach.call($('#lsVoices').children, el => {
      el.addEventListener('click', () => {
        const vid = el.getAttribute('data-v');
        if (!drum) l.octave = Engine.suggestOctave(vid, l.src);
        l.voice = vid;
        l.ab = false;
        $('#lsAb').checked = false;
        Store.layerPatch(project, l, {});
        Engine.preview(vid, project);
        pushLayer(l);
        openLayerSheet(l.id);
      });
    });
    sheet('#layerSheet', true);
  }

  function pushLayer(l) {
    const sc = Store.current(project);
    const i = sc.layers.indexOf(l);
    Engine.refresh(project, l, Math.max(0, i));
    renderRing(); renderLayers(); renderTop();
  }

  function wireLayerSheet() {
    $('#lsClose').addEventListener('click', () => { sheet('#layerSheet', false); openLayer = null; });
    $('#layerSheet').addEventListener('click', e => {
      if (e.target === $('#layerSheet')) { sheet('#layerSheet', false); openLayer = null; }
    });
    $('#lsVol').addEventListener('input', e => {
      if (!openLayer) return;
      openLayer.vol = e.target.value / 100;
      $('#lsVolVal').textContent = e.target.value;
      Engine.setGain(openLayer);
      Store.touch(project);
      renderRing();
    });
    $('#lsTight').addEventListener('change', e => {
      if (!openLayer) return;
      Store.layerPatch(project, openLayer, { tighten: e.target.value / 100 });
      $('#lsTightVal').textContent = e.target.value;
      pushLayer(openLayer);
    });
    $('#lsTight').addEventListener('input', e => { $('#lsTightVal').textContent = e.target.value; });
    $('#lsOctDown').addEventListener('click', () => shiftOctave(-1));
    $('#lsOctUp').addEventListener('click', () => shiftOctave(1));
    $('#lsChords').addEventListener('change', e => {
      if (!openLayer) return;
      Store.layerPatch(project, openLayer, { chords: e.target.checked });
      pushLayer(openLayer);
    });
    $('#lsAb').addEventListener('change', e => {
      if (!openLayer) return;
      Store.layerPatch(project, openLayer, { ab: e.target.checked });
      pushLayer(openLayer);
      toast(e.target.checked ? 'Playing the take you recorded.' : 'Back to the instrument.');
    });
    $('#lsDelete').addEventListener('click', () => {
      if (!openLayer) return;
      const id = openLayer.id;
      const sc = Store.current(project);
      Engine.forget(id);
      Store.removeLayer(project, sc, id);
      // removing the last one leaves the transport running over nothing, with the
      // playhead still going round an empty ring and Stop disabled
      if (!sc.layers.length) Engine.stop();
      openLayer = null;
      sheet('#layerSheet', false);
      renderPad();
    });
  }

  function shiftOctave(d) {
    if (!openLayer) return;
    const o = Math.max(-3, Math.min(3, openLayer.octave + d));
    Store.layerPatch(project, openLayer, { octave: o });
    $('#lsOctVal').textContent = o > 0 ? '+' + o : String(o);
    pushLayer(openLayer);
  }

  /* -------------------------------------------------------- tempo and key */

  function openKeySheet() {
    $('#ksBpm').textContent = Math.round(project.bpm);
    $('#ksTonics').innerHTML = Store.SHORT.map((n, i) =>
      '<button class="' + (i === project.tonic ? 'is-on' : '') + '" data-t="' + i + '">' + n + '</button>'
    ).join('');
    Array.prototype.forEach.call($('#ksTonics').children, el => {
      el.addEventListener('click', () => {
        project.tonic = parseInt(el.getAttribute('data-t'), 10);
        project.keyLocked = true;
        Store.touch(project);
        reharmonise();
        openKeySheet();
      });
    });
    $$('#keySheet .mode').forEach(el => {
      el.classList.toggle('is-on', el.getAttribute('data-mode') === project.mode);
    });
    sheet('#keySheet', true);
  }

  function reharmonise() {
    project.scenes.forEach(s => s.layers.forEach(l => { l._d = null; Engine.invalidate(l); }));
    renderTop();
    if (Engine.playing()) {
      const sc = Store.current(project);
      sc.layers.forEach((l, i) => Engine.refresh(project, l, i));
    }
  }

  function setBpm(v) {
    project.bpm = Math.max(50, Math.min(200, Math.round(v * 10) / 10));
    Store.touch(project);
    $('#ksBpm').textContent = Math.round(project.bpm);
    renderTop();
    project.scenes.forEach(s => s.layers.forEach(l => Engine.invalidate(l)));
    if (Engine.playing()) Engine.play(project, project.openScene);
  }

  function wireKeySheet() {
    $('#ksClose').addEventListener('click', () => sheet('#keySheet', false));
    $('#keySheet').addEventListener('click', e => { if (e.target === $('#keySheet')) sheet('#keySheet', false); });
    $('#ksSlower').addEventListener('click', () => setBpm(project.bpm - 2));
    $('#ksFaster').addEventListener('click', () => setBpm(project.bpm + 2));
    $('#ksTap').addEventListener('click', () => {
      const now = Date.now();
      taps = taps.filter(t => now - t < 2600);
      taps.push(now);
      if (taps.length < 2) { $('#ksTapNote').textContent = 'Keep tapping.'; return; }
      const gaps = [];
      for (let i = 1; i < taps.length; i++) gaps.push(taps[i] - taps[i - 1]);
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      setBpm(60000 / avg);
      $('#ksTapNote').textContent = 'Following you at ' + Math.round(project.bpm) + ' beats a minute.';
    });
    $$('#keySheet .mode').forEach(el => el.addEventListener('click', () => {
      project.mode = el.getAttribute('data-mode');
      project.keyLocked = true;
      Store.touch(project);
      reharmonise();
      openKeySheet();
    }));
  }

  /* -------------------------------------------------------------- naming */

  function openNameSheet() {
    $('#nsInput').value = project.title || '';
    $('#nsInput').placeholder = Store.suggestTitle(project);
    $('#nsSuggest').textContent = 'Leave it empty and it stays "' + Store.suggestTitle(project) + '".';
    sheet('#nameSheet', true);
    setTimeout(() => $('#nsInput').focus(), 60);
  }

  /* One stroke width, one corner language, everywhere a glyph used to be. */
  const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>';
  const ICON_MINUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12 H18"/></svg>';
  const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6 V18 M6 12 H18"/></svg>';

  /* Drawn, not described: three scene blocks waiting to be lined up, the last
     one still empty, which is exactly what the strip does when you fill it. */
  const STRIP_ART =
    '<div class="stripempty"><svg viewBox="0 0 92 62" aria-hidden="true" fill="none" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="2" y="13" width="24" height="36" rx="7" stroke="var(--accent)" stroke-width="2"/>' +
    '<rect x="32" y="13" width="24" height="36" rx="7" stroke="var(--accent)" stroke-width="2" opacity=".55"/>' +
    '<rect x="62" y="13" width="24" height="36" rx="7" stroke="#5C6844" stroke-width="2" stroke-dasharray="4 5"/>' +
    '<path d="M7 31 C9 31 8.7 24 11 24 C13.7 24 13.3 38 16 38 C18.3 38 18 31 21 31" stroke="var(--accent)" stroke-width="2"/>' +
    '<path d="M37 31 C39 31 38.7 26 41 26 C43.7 26 43.3 36 46 36 C48.3 36 48 31 51 31" stroke="var(--accent)" stroke-width="2" opacity=".55"/>' +
    '</svg>';

  /* ------------------------------------------------------------- arrange */

  function renderArrange() {
    $('#songLen').textContent = Store.clock(Store.songSeconds(project)) +
      ' \u00b7 ' + project.beats + ' beats a loop';
    const strip = $('#strip');
    if (!project.strip.length) {
      strip.innerHTML = STRIP_ART +
        '<p>Nothing lined up yet. Tap a scene below to put it in the song.</p></div>';
    } else {
      strip.innerHTML = project.strip.map((b, i) => {
        const sc = Store.scene(project, b.scene);
        return '<div class="block" data-i="' + i + '" style="--i:' + i + '">' +
          '<button class="kill" data-kill="' + i + '" aria-label="Remove this block">' + ICON_X + '</button>' +
          '<b>' + (sc ? escapeHtml(sc.name) : '?') + '</b>' +
          '<small>' + (sc ? sc.layers.length : 0) + ' layers</small>' +
          '<div class="reps"><button data-dec="' + i + '" aria-label="Fewer repeats">' + ICON_MINUS + '</button>' +
          '<span>x' + b.repeats + '</span>' +
          '<button data-inc="' + i + '" aria-label="More repeats">' + ICON_PLUS + '</button></div></div>';
      }).join('');
      wireStrip();
    }
    $('#stripHelp').textContent = project.strip.length
      ? 'Press and hold a block to drag it somewhere else.'
      : 'A verse, a chorus, the verse again. Two scenes are enough for a song.';
    $('#sceneList').innerHTML = project.scenes.map(s =>
      '<button class="scenebtn" data-s="' + s.id + '">Scene ' + escapeHtml(s.name) +
      ' <small>' + s.layers.length + ' layers</small></button>'
    ).join('');
    Array.prototype.forEach.call($('#sceneList').children, el => {
      el.addEventListener('click', () => {
        project.strip.push({ scene: el.getAttribute('data-s'), repeats: 2 });
        Store.touch(project);
        renderArrange();
        if (Store.guide() === 3) advanceGuide(4);
      });
    });
    exportErr('');
    songErr('');
  }

  function wireStrip() {
    const strip = $('#strip');
    $$('#strip [data-inc]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const i = +b.getAttribute('data-inc');
      project.strip[i].repeats = Math.min(16, project.strip[i].repeats + 1);
      Store.touch(project); renderArrange();
    }));
    $$('#strip [data-dec]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const i = +b.getAttribute('data-dec');
      project.strip[i].repeats = Math.max(1, project.strip[i].repeats - 1);
      Store.touch(project); renderArrange();
    }));
    $$('#strip [data-kill]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      project.strip.splice(+b.getAttribute('data-kill'), 1);
      Store.touch(project); renderArrange();
    }));

    // Press and hold to pick a block up. A short press still scrolls the strip.
    $$('#strip .block').forEach(el => {
      let hold = 0, dragging = false, startX = 0;
      el.addEventListener('pointerdown', e => {
        if (e.target.tagName === 'BUTTON') return;
        startX = e.clientX;
        hold = setTimeout(() => {
          dragging = true;
          el.classList.add('is-drag');
          el.style.touchAction = 'none';
          try { el.setPointerCapture(e.pointerId); } catch (err) {}
          buzz(12, 90);
        }, 220);
      });
      el.addEventListener('pointermove', e => {
        if (!dragging) {
          if (Math.abs(e.clientX - startX) > 8) clearTimeout(hold);
          return;
        }
        const over = document.elementFromPoint(e.clientX, e.clientY);
        const target = over && over.closest ? over.closest('.block') : null;
        if (target && target !== el && target.parentNode === strip) {
          const after = target.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING;
          strip.insertBefore(el, after ? target : target.nextSibling);
        }
      });
      const end = () => {
        clearTimeout(hold);
        if (!dragging) return;
        dragging = false;
        el.classList.remove('is-drag');
        el.style.touchAction = '';
        const order = $$('#strip .block').map(b => project.strip[+b.getAttribute('data-i')]);
        project.strip = order;
        Store.touch(project);
        renderArrange();
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });
  }

  function suggestShape() {
    if (project.scenes.length < 2) {
      toast('Copy the scene on the Pad first, then a shape has two things to alternate.', 4200);
      return;
    }
    const a = project.scenes[0].id, b = project.scenes[1].id;
    project.strip = [
      { scene: a, repeats: 1 }, { scene: a, repeats: 2 }, { scene: b, repeats: 2 },
      { scene: a, repeats: 2 }, { scene: b, repeats: 2 }, { scene: a, repeats: 1 }
    ];
    Store.touch(project);
    renderArrange();
    toast('Intro, verse, chorus, verse, chorus, out. Change any of it.', 3600);
  }

  async function playSong() {
    if (songSrc) { stopSong(); return; }
    const layers = Store.layerCount(project);
    if (!layers) { songErr('There is nothing recorded yet. Hum something on the Pad first.'); return; }
    const bad = tooLong(false);
    if (bad) { songErr(bad); return; }
    songErr('');
    Engine.stop();
    busy(true, 'Rendering the song');
    try {
      const buf = await Engine.renderSong(project);
      busy(false);
      const c = Engine.ready();
      songSrc = c.createBufferSource();
      songSrc.buffer = buf;
      songSrc.connect(c.destination);
      songStart = c.currentTime + 0.05;
      songDur = buf.duration;
      songSrc.onended = () => { songSrc = null; $('#playSong').textContent = 'Play the song'; $('#songProg').hidden = true; };
      songSrc.start(songStart);
      $('#playSong').textContent = 'Stop';
      $('#songProg').hidden = false;
    } catch (e) {
      busy(false);
      songErr('The song could not be rendered on this device.');
    }
  }
  function stopSong() {
    if (!songSrc) return;
    try { songSrc.onended = null; songSrc.stop(); } catch (e) {}
    songSrc = null;
    $('#playSong').textContent = 'Play the song';
    $('#songProg').hidden = true;
  }

  /* -------------------------------------------------------------- export */

  function safeName(s) {
    return (s || 'loopwright').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'loopwright';
  }

  /* One second of the mix is 176 kilobytes of 16 bit stereo, and the whole file
     crosses the bridge to the phone as a single base64 string. Both limits are
     checked from the arrangement's length before anything is rendered, because
     finding out afterwards costs a minute of work and, on a long strip, an
     offline context big enough to take the app down. */
  const WAV_BYTES_SEC = 44100 * 2 * 2;
  const BRIDGE_LIMIT = 24 * 1024 * 1024;
  const RENDER_LIMIT = 300;

  function tooLong(toFile) {
    const sec = Store.songSeconds(project);
    if (sec > RENDER_LIMIT) {
      return 'That arrangement runs ' + Store.clock(sec) +
        '. Loopwright renders up to five minutes at once, so take some repeats off in the strip.';
    }
    if (toFile && isNative() && sec * WAV_BYTES_SEC > BRIDGE_LIMIT) {
      return 'A WAV that long is more than this phone will take in one file. Keep the song under ' +
        Store.clock(BRIDGE_LIMIT / WAV_BYTES_SEC) + ' and it will save.';
    }
    return '';
  }
  function songErr(text) {
    const el = $('#songErr');
    el.textContent = text || '';
    el.hidden = !text;
  }
  function exportErr(text) {
    const el = $('#exportNote');
    el.classList.toggle('warn', !!text);
    el.textContent = text || (isNative()
      ? 'Files land in the Downloads folder on this phone.'
      : 'Files download through the browser.');
  }

  function deliver(name, bytes, share) {
    if (window.Native && Native.saveFile) {
      if (bytes.byteLength > BRIDGE_LIMIT) {
        exportErr('That song is too long to write out in one file. Fewer repeats in Arrange will bring it down.');
        return false;
      }
      const uri = Native.saveFile(name, 'audio/wav', Engine.base64(bytes));
      if (!uri) { exportErr('This phone would not let the file be written.'); return false; }
      if (share && Native.shareUri) Native.shareUri(uri, 'audio/wav');
      return true;
    }
    const blob = new Blob([bytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }

  async function exportMix(share) {
    if (!Store.layerCount(project)) { exportErr('There is nothing recorded yet. Hum something on the Pad first.'); return; }
    const bad = tooLong(true);
    if (bad) { exportErr(bad); return; }
    exportErr('');
    stopSong(); Engine.stop();
    busy(true, 'Bouncing the mix');
    try {
      const buf = await Engine.renderSong(project);
      const wav = Engine.wav(buf);
      busy(false);
      if (deliver(safeName(Store.title(project)) + '.wav', wav, share)) {
        toast(isNative() ? 'Saved to Downloads.' : 'Downloaded.');
        Engine.chime(project);
      }
    } catch (e) { busy(false); exportErr('The mix could not be rendered on this device.'); }
  }

  async function exportStems() {
    // One file per layer, named for the scene it belongs to, because a song with
    // two scenes has two sets of stems and unlabelled numbers help nobody.
    const all = [];
    project.scenes.forEach(sc => sc.layers.forEach((l, k) => all.push({ l: l, tag: sc.name.toLowerCase() + (k + 1) })));
    if (!all.length) { exportErr('There is nothing recorded yet. Hum something on the Pad first.'); return; }
    const bad = tooLong(true);
    if (bad) { exportErr(bad); return; }
    exportErr('');
    stopSong(); Engine.stop();
    const base = safeName(Store.title(project));
    let n = 0;
    for (let i = 0; i < all.length; i++) {
      busy(true, 'Bouncing stem ' + (i + 1) + ' of ' + all.length);
      await new Promise(r => setTimeout(r, 20));
      try {
        const buf = await Engine.renderSong(project, { only: all[i].l.id });
        const name = base + '-' + all[i].tag + '-' + safeName(Voices.get(all[i].l.voice).name) + '.wav';
        if (deliver(name, Engine.wav(buf), false)) n++;
      } catch (e) {}
    }
    busy(false);
    if (n) toast('Saved ' + n + ' stem files.');
    else exportErr('The stems could not be rendered on this device.');
  }

  /* ------------------------------------------------------------- library */

  /* The card thumbnail is the pad's ring drawn small, through the same two
     functions: one arc per layer, each carrying that layer's own waveform, so a
     library of songs reads as a shelf of loops rather than a list of file names.
     It shares the pad's 300 unit space, which is what keeps the two identical. */
  const THUMB_R = 96;
  function thumb(p) {
    const layers = [];
    p.scenes.forEach(sc => sc.layers.forEach(l => { if (layers.length < 8) layers.push(l); }));
    const n = layers.length;
    let s = '<svg class="thumb" viewBox="0 0 300 300" aria-hidden="true">';
    s += '<circle cx="150" cy="150" r="' + THUMB_R + '" fill="none" stroke="#2B3222" stroke-width="' +
         (n ? 10 : 7) + '"/>';
    if (!n) {
      s += '<path class="seg seg-idle" stroke-width="17" d="' + idlePath(THUMB_R, 22) + '"/>';
    }
    for (let i = 0; i < n; i++) {
      const gap = n > 1 ? 9 : 4;
      const a0 = i * 360 / n + gap / 2, a1 = (i + 1) * 360 / n - gap / 2;
      // a fraction of the pad's amplitude: at fifty pixels the full swing reads as
      // a scribble, and what is wanted here is the ring with a grain in it
      const d = segPath(a0, a1, THUMB_R, layers[i].muted ? 3 : 8, envelope(layers[i], 48, p.beats));
      s += '<path class="seg ' + (layers[i].muted ? 'seg-off' : 'seg-on') +
           '" stroke-width="' + (layers[i].muted ? 11 : 17) + '" d="' + d + '"/>';
    }
    return s + '</svg>';
  }

  /* The hum going in on the left, bending round into the closed loop that comes
     out: the app in one drawing, and the same two shapes as the launcher icon. */
  const LIB_ART =
    '<div class="blank"><svg viewBox="0 0 168 116" aria-hidden="true" fill="none" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="108" cy="58" r="43" stroke="#2B3222" stroke-width="2" stroke-dasharray="3 7"/>' +
    '<path d="M6 58 C16 58 14 36 24 36 C36 36 33 82 45 82 C55 82 53 58 63 58" stroke="var(--accent-deep)" stroke-width="4"/>' +
    '<circle cx="108" cy="58" r="30" stroke="var(--accent-deep)" stroke-width="7"/>' +
    '<path d="M78 58 C85.8 58 84.3 43 92 43 C100.7 43 99.1 73 108 73 C116.1 73 114.5 43 122 43 C130.4 43 128.9 58 138 58" ' +
    'stroke="var(--accent)" stroke-width="7"/>' +
    '</svg><p>Nothing here yet. Hum four seconds of anything and Loopwright will play it back to you.</p></div>';

  function renderLibrary() {
    const list = Store.projects().filter(p => Store.layerCount(p) || p.id === project.id);
    const recorded = list.filter(p => Store.layerCount(p));
    // an untitled, empty song is always waiting on the Pad; counting it as a song
    // on this screen would be a lie, and a card for it would be a row of nothing
    $('#libLede').textContent = recorded.length
      ? recorded.length + (recorded.length === 1 ? ' song lives on this phone.' : ' songs live on this phone.')
      : 'Nothing recorded yet. The pad is where songs start.';
    if (!recorded.length) { $('#cards').innerHTML = LIB_ART; return; }
    $('#cards').innerHTML = list.map((p, i) => {
      const sub = [Store.keyName(p), Math.round(p.bpm) + ' bpm',
        Store.layerCount(p) + ' layers', Store.dayLabel(p.updated)].join(' \u00b7 ');
      return '<div class="card' + (armedProject === p.id ? ' armed' : '') + '" data-p="' + p.id + '" style="--i:' + i + '">' +
        thumb(p) +
        '<div class="body"><b>' + escapeHtml(Store.title(p)) + '</b><span>' + sub + '</span></div>' +
        '<button class="del" data-del="' + p.id + '" aria-label="Delete this song">' +
        '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg></button></div>';
    }).join('');
    $$('#cards .card').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('[data-del]')) return;
        openProject(el.getAttribute('data-p'));
      });
    });
    $$('#cards [data-del]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const id = b.getAttribute('data-del');
      if (armedProject !== id) {
        armedProject = id;
        renderLibrary();
        toast('Tap the bin again to delete that song for good.', 4000);
        setTimeout(() => { if (armedProject === id) { armedProject = null; renderLibrary(); } }, 4200);
        return;
      }
      armedProject = null;
      const wasOpen = project && project.id === id;
      Engine.stop(); stopSong();
      Store.remove(id);
      if (wasOpen) {
        Engine.dropCache();
        project = Store.projects()[0] || Store.create();
        Store.open(project.id);
      }
      renderLibrary(); renderPad();
      toast('Deleted.');
    }));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function openProject(id) {
    const p = Store.find(id);
    if (!p) return;
    Engine.stop(); stopSong();
    // rendered loops are megabytes each; the last song's are of no use to this one
    Engine.dropCache();
    project = p;
    Store.open(id);
    setView('pad');
    renderPad();
  }

  /* -------------------------------------------------------------- guide */

  const GUIDE = [
    ['Step one of four', 'Tap the pad and hum any melody for a few seconds. Tap it again to close the loop.'],
    ['Step two of four', 'That was your hum, played as an instrument. Now choose Kit below and tap the pad again: say boots and cats over the loop.'],
    ['Step three of four', 'Tap a layer to drop it out while the loop plays. Tap it again to bring it back. That is the whole performance.'],
    ['Step four of four', 'Copy the scene, change something in the copy, then put both scenes in the song on the Arrange screen.']
  ];

  function renderGuide() {
    const g = Store.guide();
    const on = g >= 0 && g < GUIDE.length && view === 'pad';
    $('#coach').hidden = !on;
    document.body.classList.toggle('coached', on);
    if (!on) return;
    $('#coachStep').textContent = GUIDE[g][0];
    $('#coachText').textContent = GUIDE[g][1];
    // the card wraps differently on every screen, so the pad is told its real height
    requestAnimationFrame(() => {
      const h = $('#coach').offsetHeight;
      if (h) document.body.style.setProperty('--coachh', h + 'px');
    });
  }
  function advanceGuide(n) { Store.setGuide(n); renderGuide(); }

  /* --------------------------------------------------------------- views */

  function setView(v) {
    const changed = view !== v;
    view = v;
    $('#v-pad').hidden = v !== 'pad';
    $('#v-arrange').hidden = v !== 'arrange';
    $('#v-library').hidden = v !== 'library';
    if (changed) {
      const el = $('#v-' + v);
      el.classList.remove('enter');
      void el.offsetWidth;
      el.classList.add('enter');
    }
    $$('#tabs .tab').forEach(t => t.classList.toggle('is-on', t.getAttribute('data-view') === v));
    if (v !== 'arrange') stopSong();
    if (v === 'arrange') renderArrange();
    if (v === 'library') renderLibrary();
    if (v === 'pad') renderPad();
    renderGuide();
  }

  /* --------------------------------------------------------- the heartbeat */

  function frame() {
    raf = requestAnimationFrame(frame);
    const ph = Engine.phase();
    const g = document.getElementById('phg');
    if (g) {
      if (ph < 0) {
        g.firstChild.setAttribute('opacity', '0');
      } else {
        g.firstChild.setAttribute('opacity', '1');
        g.setAttribute('transform', 'rotate(' + (ph * 360).toFixed(2) + ' 150 150)');
      }
    }
    if (ph >= 0) {
      const b = Math.floor(ph * project.beats);
      if (b !== lastBeat) {
        lastBeat = b;
        const pad = $('#pad');
        pad.classList.add('tick');
        setTimeout(() => pad.classList.remove('tick'), 80);
      }
    } else lastBeat = -1;

    if (padState === 'recording') {
      const arc = document.getElementById('recArc');
      if (arc && ph >= 0) arc.setAttribute('d', arcD(0.1, Math.max(0.2, ph * 360), 143));
    } else {
      const arc = document.getElementById('recArc');
      if (arc) arc.setAttribute('d', '');
    }

    const on = Engine.playing();
    if (on !== lastPlaying) {
      lastPlaying = on;
      $('#playLabel').textContent = on ? 'Stop' : 'Play';
      $('#btnPlay').classList.toggle('on', on);
    }

    if (songSrc) {
      const c = Engine.ready();
      const p = Math.max(0, Math.min(1, (c.currentTime - songStart) / songDur));
      const bar = $('#songProg').firstElementChild;
      if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
    }
  }

  /* ---------------------------------------------------------------- wiring */

  function wire() {
    $('#pad').addEventListener('click', onPadTap);
    $('#tbKey').addEventListener('click', openKeySheet);
    $('#tbTitle').addEventListener('click', openNameSheet);

    $('#btnPlay').addEventListener('click', async () => {
      Engine.ready();
      if (Engine.playing()) Engine.stop();
      else await Engine.play(project, project.openScene);
      renderPad();
    });
    $('#btnUndo').addEventListener('click', () => {
      const sc = Store.current(project);
      const last = sc.layers[sc.layers.length - 1];
      if (!last) return;
      Engine.forget(last.id);
      Store.removeLayer(project, sc, last.id);
      if (!sc.layers.length) Engine.stop();
      renderPad();
      toast('Layer removed.');
    });
    // one deliberate tap makes one scene; a fumbled double tap used to make two
    $('#btnScene').addEventListener('click', () => {
      if (!once('scene', 500)) return;
      if (project.scenes.length >= 8) { toast('Eight scenes is plenty for one song.'); return; }
      const sc = Store.current(project);
      Store.addScene(project, sc);
      Engine.stop();
      renderPad();
      toast('Scene copied. Change something in this one.');
    });

    $$('#tabs .tab').forEach(t => t.addEventListener('click', () => setView(t.getAttribute('data-view'))));

    wireLayerSheet();
    wireKeySheet();

    $('#nsClose').addEventListener('click', () => sheet('#nameSheet', false));
    $('#nsSave').addEventListener('click', () => {
      project.title = $('#nsInput').value.trim();
      Store.touch(project);
      sheet('#nameSheet', false);
      renderTop();
      // the card behind the sheet carries the old name until the list is redrawn
      if (view === 'library') renderLibrary();
    });

    $('#introGo').addEventListener('click', () => {
      Store.markIntro();
      sheet('#introSheet', false);
      Engine.ready();
      renderGuide();
    });
    $('#coachSkip').addEventListener('click', () => advanceGuide(GUIDE.length));

    $('#playSong').addEventListener('click', playSong);
    $('#shapeBtn').addEventListener('click', suggestShape);
    $('#exportMix').addEventListener('click', () => exportMix(false));
    $('#exportStems').addEventListener('click', exportStems);
    if (window.Native && Native.shareUri) {
      $('#shareMix').hidden = false;
      $('#shareMix').addEventListener('click', () => exportMix(true));
    }

    $('#newSong').addEventListener('click', () => {
      if (!once('new', 600)) return;
      Engine.stop(); stopSong();
      Engine.dropCache();
      project = Store.create();
      setView('pad');
      toast('New song. Hum something.');
    });

    const s = Store.settings();
    $('#countSel').value = String(s.countIn);
    $('#tightRange').value = Math.round(s.tighten * 100);
    $('#tightVal').textContent = Math.round(s.tighten * 100);
    $('#clickChk').checked = s.click;
    $('#hapChk').checked = s.haptics;
    $('#countSel').addEventListener('change', e => Store.set('countIn', parseInt(e.target.value, 10)));
    $('#tightRange').addEventListener('input', e => {
      $('#tightVal').textContent = e.target.value;
      Store.set('tighten', e.target.value / 100);
    });
    $('#clickChk').addEventListener('change', e => Store.set('click', e.target.checked));
    $('#hapChk').addEventListener('change', e => Store.set('haptics', e.target.checked));
    $('#guideBtn').addEventListener('click', () => { advanceGuide(0); setView('pad'); });

    let eraseArmed = false;
    $('#eraseBtn').addEventListener('click', () => {
      const b = $('#eraseBtn');
      if (!eraseArmed) {
        eraseArmed = true;
        b.textContent = 'Tap again to erase every song';
        $('#setNote').textContent = 'This removes every song, every layer and every recording from this phone. It cannot be undone.';
        setTimeout(() => {
          eraseArmed = false;
          b.textContent = 'Erase everything';
          $('#setNote').textContent = '';
        }, 6000);
        return;
      }
      eraseArmed = false;
      Engine.stop(); stopSong();
      Engine.dropCache();
      Store.eraseAll();
      project = Store.create();
      b.textContent = 'Erase everything';
      $('#setNote').textContent = 'Erased.';
      renderLibrary(); renderPad();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onPause(); else onResume();
    });
  }

  /* ----------------------------------------------------- the shell's hooks */

  function back() {
    if (!$('#busy').hidden) return true;
    const sh = anySheet();
    if (sh) {
      if (sh.id === 'introSheet') Store.markIntro();
      sh.hidden = true;
      openLayer = null;
      return true;
    }
    if (padState === 'counting' || padState === 'recording') {
      Engine.cancelRecord();
      padState = 'idle';
      renderPad();
      return true;
    }
    if (songSrc) { stopSong(); return true; }
    if (view !== 'pad') { setView('pad'); return true; }
    return false;
  }

  function onPause() {
    Engine.cancelRecord();
    Engine.stop();
    stopSong();
    Engine.releaseMic();
    busy(false);
    padState = 'idle';
    takeBusy = false;
    // the audio clock keeps running and keeps the radio warm otherwise
    Engine.suspend();
  }
  function onResume() {
    Engine.ready();
    if (view === 'pad') renderPad();
  }

  /* ------------------------------------------------------------------ go */

  function init() {
    project = Store.find(Store.lastOpen()) || Store.projects()[0] || Store.create();
    Store.open(project.id);
    wire();
    $('#introMark').innerHTML =
      '<circle cx="54" cy="54" r="26.5" fill="none" stroke="var(--accent-deep)" stroke-width="7.4"/>' +
      '<path d="M27.5 54 C34.4 54 33.1 41 40 41 C47.7 41 46.3 67 54 67 C61.2 67 59.8 41 67 41 C74.4 41 73.1 54 80.5 54" ' +
      'fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>';
    $('#topbar').hidden = false;
    $('#tabs').hidden = false;
    setView('pad');
    if (!Store.seenIntro()) sheet('#introSheet', true);
    frame();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    back: back, onPause: onPause, onResume: onResume,
    setView: setView, openLayerSheet: openLayerSheet, openKeySheet: openKeySheet,
    renderPad: renderPad, renderArrange: renderArrange, renderLibrary: renderLibrary,
    project: () => project, exportMix: exportMix, suggestShape: suggestShape,
    sheet: sheet, toast: toast
  };
})();

/* A top-level const is not a window property, and the shell reaches for window.App. */
window.App = App;
