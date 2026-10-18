/* Heirloom recorder. One microphone stream, one MediaRecorder, a level meter for
   the waveform, and a duration we count ourselves because webm blobs routinely
   arrive without one. Nothing is uploaded; the blob goes straight to IndexedDB. */

const Recorder = (() => {
  const MAX_MS = 30 * 60 * 1000;
  const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];

  let stream = null, rec = null, chunks = [], ac = null, analyser = null, buf = null;
  let startedAt = 0, pausedAt = 0, pausedTotal = 0, state = 'idle', mime = '';
  let onCap = null, capTimer = 0, stopping = null;

  const supported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  function pickType() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    for (const t of TYPES) if (MediaRecorder.isTypeSupported(t)) return t;
    return '';
  }

  function reason(err) {
    const n = err && err.name;
    if (n === 'NotAllowedError' || n === 'SecurityError')
      return 'Heirloom needs permission to use the microphone. Open Settings, then Permissions, and allow the microphone.';
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError')
      return 'No microphone was found on this device.';
    if (n === 'NotReadableError')
      return 'Another app is using the microphone. Close it and try again.';
    return 'The microphone could not be started on this device.';
  }

  /** Resolves once audio is actually flowing. Rejects with a sentence a person can act on. */
  function start(onCapReached) {
    if (!supported()) return Promise.reject(new Error('This device cannot record audio in this app.'));
    /* A second tap while the microphone is opening, or while recording, is the same tap. */
    if (state !== 'idle') return Promise.resolve(false);
    state = 'starting';
    onCap = onCapReached || null;
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    }).then(s => {
      if (state !== 'starting') { s.getTracks().forEach(t => t.stop()); return false; }
      stream = s;
      mime = pickType();
      rec = mime ? new MediaRecorder(s, { mimeType: mime, audioBitsPerSecond: 64000 })
                 : new MediaRecorder(s);
      mime = rec.mimeType || mime || 'audio/webm';
      chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ac = new AC();
        analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        ac.createMediaStreamSource(s).connect(analyser);
        buf = new Uint8Array(analyser.fftSize);
      } catch (e) { analyser = null; }
      rec.start(2000);
      startedAt = Date.now(); pausedTotal = 0; pausedAt = 0; state = 'recording';
      capTimer = setInterval(() => { if (elapsed() * 1000 >= MAX_MS && onCap) onCap(); }, 1000);
      return true;
    }).catch(err => {
      cleanup();
      const out = new Error(reason(err));
      /* The card only offers the settings page for a refusal, never for a missing
         or busy microphone, which that page cannot fix. */
      const n = err && err.name;
      out.refused = n === 'NotAllowedError' || n === 'SecurityError';
      throw out;
    });
  }

  function pause() {
    if (state !== 'recording' || !rec) return;
    try { rec.pause(); } catch (e) { return; }
    pausedAt = Date.now(); state = 'paused';
  }
  function resume() {
    if (state !== 'paused' || !rec) return;
    try { rec.resume(); } catch (e) { return; }
    pausedTotal += Date.now() - pausedAt; pausedAt = 0; state = 'recording';
  }

  function elapsed() {
    if (!startedAt) return 0;
    const now = state === 'paused' ? pausedAt : Date.now();
    return Math.max(0, (now - startedAt - pausedTotal) / 1000);
  }

  /** 0 to 1, weighted so a quiet room sits near the floor and speech fills the bar. */
  function level() {
    if (!analyser || state !== 'recording') return 0;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / buf.length);
    return Math.max(0, Math.min(1, Math.pow(rms * 4.2, 0.7)));
  }

  function cleanup() {
    if (capTimer) { clearInterval(capTimer); capTimer = 0; }
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (ac && ac.close) { try { ac.close(); } catch (e) {} }
    stream = null; rec = null; ac = null; analyser = null; state = 'idle'; stopping = null;
  }

  function stop() {
    /* Done tapped twice: both taps wait on the same stop, and the blob is kept once. */
    if (stopping) return stopping;
    if (state === 'starting') { state = 'idle'; return Promise.resolve(null); }
    return (stopping = new Promise(res => {
      if (!rec || state === 'idle') { res(null); return; }
      const secs = elapsed();
      const type = mime;
      rec.onstop = () => {
        const blob = new Blob(chunks, { type });
        chunks = []; cleanup(); startedAt = 0;
        res({ blob, mime: type, dur: secs });
      };
      try { rec.stop(); } catch (e) { cleanup(); res(null); }
    }));
  }

  function cancel() {
    if (state === 'starting') { state = 'idle'; return; }
    if (rec && state !== 'idle') { rec.onstop = null; try { rec.stop(); } catch (e) {} }
    chunks = []; cleanup(); startedAt = 0;
  }

  return { supported, start, pause, resume, stop, cancel, elapsed, level,
           getState: () => state, MAX_MS };
})();
