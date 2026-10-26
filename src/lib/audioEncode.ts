// Make a sound smaller before it is stored: one channel (speech needs only one), resampled, and
// encoded as MP3 at the chosen quality. Runs in the browser, several times faster than real time.
import { bufferOf, decodeSound, toMono } from './sound';

export type SoundQuality = 'clear' | 'standard' | 'small';
export const SOUND_QUALITY: { k: SoundQuality; label: string; about: string; kbps: number; rate: number }[] = [
  { k: 'clear', label: 'Clear', about: 'For music and speech, about 0.9 MB a minute', kbps: 96, rate: 44100 },
  { k: 'standard', label: 'Standard', about: 'For speech, about 0.6 MB a minute', kbps: 64, rate: 44100 },
  { k: 'small', label: 'Small', about: 'For speech only, about 0.3 MB a minute', kbps: 32, rate: 22050 },
];
// Space taken as stored: the file, plus a third.
export const storedPerMinute = (q: SoundQuality) => (((SOUND_QUALITY.find((x) => x.k === q)?.kbps ?? 64) * 1000) / 8) * 60 * (4 / 3);

export async function encodeMp3(mono: Float32Array, rate: number, quality: SoundQuality, onProgress?: (p: number) => void): Promise<Blob> {
  const q = SOUND_QUALITY.find((x) => x.k === quality) ?? SOUND_QUALITY[1];
  let x = mono;
  if (rate !== q.rate) {
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil((mono.length / rate) * q.rate)), q.rate);
    const src = off.createBufferSource();
    src.buffer = bufferOf(mono, rate);
    src.connect(off.destination);
    src.start();
    x = (await off.startRendering()).getChannelData(0);
  }
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const enc = new Mp3Encoder(1, q.rate, q.kbps);
  const out: Uint8Array[] = [];
  const block = 1152 * 20;
  const pcm = new Int16Array(block);
  for (let i = 0, k = 0; i < x.length; i += block, k++) {
    const n = Math.min(block, x.length - i);
    for (let j = 0; j < n; j++) {
      const v = Math.max(-1, Math.min(1, x[i + j]));
      pcm[j] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    const buf = enc.encodeBuffer(n === block ? pcm : pcm.subarray(0, n));
    if (buf.length) out.push(new Uint8Array(buf));
    if (k % 40 === 0) {
      onProgress?.(i / x.length);
      await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
    }
  }
  const end = enc.flush();
  if (end.length) out.push(new Uint8Array(end));
  onProgress?.(1);
  return new Blob(out as BlobPart[], { type: 'audio/mpeg' });
}

export async function encodeSound(file: Blob, quality: SoundQuality, onProgress?: (p: number) => void): Promise<{ blob: Blob; duration: number }> {
  const b = await decodeSound(file);
  return { blob: await encodeMp3(toMono(b), b.sampleRate, quality, onProgress), duration: b.duration };
}
