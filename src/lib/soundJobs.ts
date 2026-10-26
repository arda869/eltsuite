import { reduceNoise, type NoiseLevel } from './sound';

// Runs slow sound work in a worker (falls back to the page when workers are not available).
let worker: Worker | null | undefined;
let seq = 0;
const waiting = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void; progress?: (p: number) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./soundWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const { id, progress, result, error } = ev.data as { id: number; progress?: number; result?: unknown; error?: string };
      const w = waiting.get(id);
      if (!w) return;
      if (progress !== undefined) return w.progress?.(progress);
      waiting.delete(id);
      if (error) w.rej(new Error(error));
      else w.res(result);
    };
    worker.onerror = () => {
      waiting.forEach((w) => w.rej(new Error('worker')));
      waiting.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function run<T>(msg: Record<string, unknown>, transfer: Transferable[], progress?: (p: number) => void): Promise<T> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('no-worker'));
  const id = ++seq;
  return new Promise<T>((res, rej) => {
    waiting.set(id, { res: res as (v: unknown) => void, rej, progress });
    w.postMessage({ ...msg, id }, transfer);
  });
}

export async function cleanNoise(x: Float32Array, rate: number, level: NoiseLevel, progress?: (p: number) => void): Promise<Float32Array> {
  if (!level) return x;
  try {
    const copy = x.slice();
    return await run<Float32Array>({ op: 'noise', x: copy, rate, level }, [copy.buffer], progress);
  } catch {
    return reduceNoise(x, rate, level, progress);
  }
}

export async function mp3InWorker(x: Float32Array, rate: number, kbps: number, progress?: (p: number) => void): Promise<Blob | null> {
  try {
    const copy = x.slice();
    return await run<Blob>({ op: 'mp3', x: copy, rate, kbps }, [copy.buffer], progress);
  } catch {
    return null;
  }
}
