// Slow sound work, off the main thread so the page stays smooth: cleaning up background noise
// and encoding MP3.
import { Mp3Encoder } from '@breezystack/lamejs';
import { reduceNoise, type NoiseLevel } from './sound';

type Job = { id: number; op: 'noise'; x: Float32Array; rate: number; level: NoiseLevel } | { id: number; op: 'mp3'; x: Float32Array; rate: number; kbps: number };

self.onmessage = async (ev: MessageEvent<Job>) => {
  const job = ev.data;
  const progress = (p: number) => (self as unknown as Worker).postMessage({ id: job.id, progress: p });
  try {
    if (job.op === 'noise') {
      const y = await reduceNoise(job.x, job.rate, job.level, progress);
      (self as unknown as Worker).postMessage({ id: job.id, result: y }, [y.buffer]);
      return;
    }
    const enc = new Mp3Encoder(1, job.rate, job.kbps);
    const out: Uint8Array[] = [];
    const block = 1152 * 40;
    const pcm = new Int16Array(block);
    const x = job.x;
    for (let i = 0, k = 0; i < x.length; i += block, k++) {
      const n = Math.min(block, x.length - i);
      for (let j = 0; j < n; j++) {
        const v = Math.max(-1, Math.min(1, x[i + j]));
        pcm[j] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      const buf = enc.encodeBuffer(n === block ? pcm : pcm.subarray(0, n));
      if (buf.length) out.push(new Uint8Array(buf));
      if (k % 20 === 0) progress(i / x.length);
    }
    const end = enc.flush();
    if (end.length) out.push(new Uint8Array(end));
    const blob = new Blob(out as BlobPart[], { type: 'audio/mpeg' });
    (self as unknown as Worker).postMessage({ id: job.id, result: blob });
  } catch (e) {
    (self as unknown as Worker).postMessage({ id: job.id, error: String((e as Error)?.message ?? e) });
  }
};
