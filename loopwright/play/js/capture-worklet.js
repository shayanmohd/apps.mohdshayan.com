/* Pulls the microphone off the main thread. It does nothing clever: it fills a
   block, stamps it with the audio clock, and hands it over. The stamp is what
   lets an overdub land on the beat instead of near it. */
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 2048;
    this.buf = new Float32Array(this.size);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.size) {
        this.port.postMessage({ t: currentTime, d: this.buf });
        this.buf = new Float32Array(this.size);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('capture', Capture);
