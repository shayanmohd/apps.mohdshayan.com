/*
 * The board generator in a Web Worker, so building the next board never stalls a frame. The shell's
 * GAME_CSP allows worker-src 'self'. Messages: { id, spec, army, seed } in, { id, def, ms } out.
 */
importScripts('rng.js', 'pieces.js', 'rules.js', 'ai.js', 'solver.js', 'eras.js', 'gen.js');

self.onmessage = function (e) {
  var job = e.data || {};
  var t0 = Date.now();
  var def = null;
  try {
    def = self.Pawnfare.gen.generate(job.spec, job.army, job.seed >>> 0);
  } catch (err) {
    def = null;
  }
  self.postMessage({ id: job.id, def: def, ms: Date.now() - t0 });
};
