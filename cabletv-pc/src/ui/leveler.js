// Equal volume (VolumeLeveler.kt, 1.9.53): every channel at about the same loudness. The same sums as
// the TV app's, run on the sound of the player that has the sound.

const WORKLET = `
const TARGET_RMS = 0.12, MAX_GAIN = 4, MIN_GAIN = 0.16, WINDOW_S = 3, SILENCE = 3.2e-6, KNEE = 0.8;
class Leveler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.reset(true);
    this.port.onmessage = (e) => { if (e.data === 'flush') this.reset(false); };
  }
  reset(full) {
    // A new channel: measure afresh, and never start louder than unchanged.
    this.gain = full ? 1 : Math.min(this.gain, 1);
    this.mean = -1; this.blocks = 0; this.sum = 0; this.frames = 0;
  }
  measure(power) {
    if (power < SILENCE) return;
    const bs = 0.02;
    this.blocks++;
    if (this.mean < 0) this.mean = power;
    else if (this.blocks * bs < 0.5) this.mean += (power - this.mean) / this.blocks;
    else this.mean += (power - this.mean) * (bs / WINDOW_S);
    const wanted = Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_RMS / Math.sqrt(this.mean)));
    const secs = this.blocks * bs < 1 ? 0.1 : wanted < this.gain ? 0.5 : 3;
    this.gain += (wanted - this.gain) * Math.min(1, bs / secs);
  }
  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    if (!input || !input.length) return true;
    const n = input[0].length, ch = input.length, blockLen = Math.round(sampleRate / 50);
    for (let i = 0; i < n; i++) {
      let p = 0;
      for (let c = 0; c < ch; c++) p += input[c][i] * input[c][i];
      this.sum += p / ch;
      if (++this.frames >= blockLen) { this.measure(this.sum / this.frames); this.sum = 0; this.frames = 0; }
      for (let c = 0; c < output.length; c++) {
        const s = (input[c] || input[0])[i] * this.gain, a = Math.abs(s);
        if (a <= KNEE) { output[c][i] = s; continue; }
        const over = a - KNEE, room = 1 - KNEE, bent = KNEE + room * over / (over + room);
        output[c][i] = s < 0 ? -bent : bent;
      }
    }
    return true;
  }
}
registerProcessor('cabletv-leveler', Leveler);
`;

let ctx = null;
let ready = null;
const nodes = new WeakMap();

function context() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'playback' });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    ready = ctx.audioWorklet.addModule(url).catch(() => null);
  }
  return ctx;
}

/** Sends [video]'s sound through the leveler (once per video element). */
export async function attach(video) {
  if (nodes.has(video)) return;
  nodes.set(video, null);
  try {
    const c = context();
    await ready;
    const source = c.createMediaElementSource(video);
    const node = new AudioWorkletNode(c, 'cabletv-leveler', { outputChannelCount: [2] });
    source.connect(node).connect(c.destination);
    nodes.set(video, node);
    if (c.state === 'suspended') c.resume().catch(() => {});
  } catch {
    // Without the leveler the sound still plays as it is.
  }
}

/** A new channel on [video]: the leveler measures afresh. */
export function flush(video) {
  const n = nodes.get(video);
  if (n) n.port.postMessage('flush');
}
