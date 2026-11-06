/*
 * Asks the worker pool for boards. Requests are cached by their inputs, so the board for each draft option
 * can be started the moment a board is won and is usually ready before the player picks. Without workers
 * (a browser that refuses them) the generator runs on the main thread after a frame.
 */
(function (root) {
  'use strict';
  var P = root.Pawnfare;
  var POOL = 3;
  var workers = [];
  var busy = [];
  var queue = [];
  var cache = {};
  var nextId = 1;
  var broken = false;
  var stats = [];

  function makeWorkers() {
    if (workers.length || broken) return;
    if (typeof root.Worker !== 'function') { broken = true; return; }
    for (var i = 0; i < POOL; i++) {
      try {
        var w = new root.Worker('js/worker.js');
        w.onmessage = onMessage.bind(null, i);
        w.onerror = onError;
        workers.push(w);
        busy.push(null);
      } catch (e) {
        broken = true;
        workers = [];
        busy = [];
        return;
      }
    }
  }

  function onMessage(i, e) {
    var msg = e.data || {};
    var job = busy[i];
    busy[i] = null;
    if (job && job.id === msg.id) {
      stats.push({ ms: msg.ms, wall: Date.now() - job.t0, worker: true, ok: !!msg.def });
      job.resolve(msg.def || null);
    }
    pump();
  }

  function onError() {
    // A worker that fails to load: finish everything on the main thread from now on.
    broken = true;
    var pending = busy.filter(Boolean).concat(queue);
    workers.forEach(function (w) { try { w.terminate(); } catch (e) { /* gone */ } });
    workers = [];
    busy = [];
    queue = [];
    pending.forEach(runHere);
  }

  function runHere(job) {
    setTimeout(function () {
      var t0 = Date.now();
      var def = null;
      try { def = P.gen.generate(job.spec, job.army, job.seed); } catch (e) { def = null; }
      stats.push({ ms: Date.now() - t0, wall: Date.now() - job.t0, worker: false, ok: !!def });
      job.resolve(def);
    }, 30);
  }

  function pump() {
    for (var i = 0; i < workers.length && queue.length; i++) {
      if (busy[i]) continue;
      var job = queue.shift();
      busy[i] = job;
      workers[i].postMessage({ id: job.id, spec: job.spec, army: job.army, seed: job.seed });
    }
  }

  function key(spec, army, seed) {
    return [seed >>> 0, spec.W, spec.guards, spec.band.join('-'), spec.tier, spec.promo, army.join(',')].join('|');
  }

  /** A Promise of the board (or null when the army cannot be given a winnable board). */
  function request(spec, army, seed) {
    var k = key(spec, army, seed);
    if (cache[k]) return cache[k];
    makeWorkers();
    var p = new Promise(function (resolve) {
      var job = { id: nextId++, spec: spec, army: army.slice(), seed: seed >>> 0, resolve: resolve, t0: Date.now() };
      if (broken || !workers.length) runHere(job);
      else { queue.push(job); pump(); }
    });
    cache[k] = p;
    p.then(function (def) { if (!def) delete cache[k]; });
    return p;
  }

  function clear() { cache = {}; }

  P.genclient = { request: request, clear: clear, stats: stats, usingWorkers: function () { return !broken && workers.length > 0; } };
})(this);
