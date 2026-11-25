import { encodeMp3 } from '../lib/audioEncode';
import { decodeSound, toMono } from '../lib/sound';
import { loadManifest, saveSound, soundUrl } from '../lib/archive';
import type { Project } from '../lib/mix';

// A saved recording keeps its tracks. Next to the mixed sound everyone plays, the file keeps every
// raw sound its clips use (each its own media, saved once) and the project: tracks, clips, script
// lines and settings. Reopening it rebuilds the editor exactly, so each voice, effect and backing is
// a track again, with its trims, fades, volume and clean-up still changeable.

export type TrackRef = { id: string; name: string; classId: string; mediaId: string; len: number; delay: number };
export type SavedProject = { v: 1; project: Project; sources: TrackRef[] };
export type OpenedProject = { project: Project; sources: Record<string, Float32Array>; names: Record<string, string>; refs: TrackRef[]; rate: number };

// An MP3 starts a little late (the encoder's lead-in). Measured once by encoding a click at a known
// time and finding it again, so every track lines up to the sample when it is opened.
let delayAt: Promise<number> | null = null;
export function mp3Delay(rate: number): Promise<number> {
  delayAt ??= (async () => {
    const x = new Float32Array(rate);
    const at = Math.round(rate / 4);
    for (let i = 0; i < rate / 200; i++) x[at + i] = Math.sin((2 * Math.PI * 1000 * i) / rate) * 0.9;
    const buf = await decodeSound(await encodeMp3(x, rate, 'clear'));
    const y = buf.getChannelData(0);
    const first = y.findIndex((v) => Math.abs(v) > 0.2);
    return first < 0 ? 0 : Math.max(0, first / buf.sampleRate - 0.25);
  })().catch(() => { delayAt = null; return 0; });
  return delayAt;
}

// The raw sounds the clips use, which are not saved yet; then the project as text for the file.
export async function saveTracks(classId: string, p: Project, sources: Record<string, Float32Array>, names: Record<string, string>, rate: number, saved: Map<string, TrackRef>, onProgress?: (q: number) => void): Promise<string> {
  const used = [...new Set(p.tracks.flatMap((t) => t.clips.map((c) => c.src)))].filter((id) => id !== 'silence' && sources[id]);
  const todo = used.filter((id) => !saved.has(id));
  const delay = todo.length ? await mp3Delay(rate) : 0;
  let done = 0;
  for (const id of todo) {
    const data = sources[id];
    const blob = await encodeMp3(data, rate, 'clear');
    const { mediaId } = await saveSound(classId, blob, { title: `${names[id] || 'Track'} (track)`, duration: +(data.length / rate).toFixed(3) });
    saved.set(id, { id, name: names[id] || 'Track', classId, mediaId, len: data.length / rate, delay });
    onProgress?.(++done / todo.length);
  }
  const out: SavedProject = { v: 1, project: p, sources: used.map((id) => saved.get(id)!).filter(Boolean) };
  return JSON.stringify(out);
}

export function parseProject(text: unknown): SavedProject | null {
  if (typeof text !== 'string' || !text) return null;
  try {
    const x = JSON.parse(text) as SavedProject;
    return x?.v === 1 && Array.isArray(x.project?.tracks) && Array.isArray(x.sources) ? x : null;
  } catch { return null; }
}

// Every track's sound, fetched and lined up again.
export async function openProject(saved: SavedProject, onProgress?: (q: number) => void): Promise<OpenedProject> {
  let done = 0, rate = 0;
  const loaded = await Promise.all(saved.sources.map(async (r) => {
    const m = await loadManifest(r.classId, r.mediaId);
    if (!m) throw new Error('A track is missing');
    const res = await fetch(await soundUrl(r.classId, r.mediaId, m));
    if (!res.ok) throw new Error('A track is unavailable');
    const buf = await decodeSound(await res.blob());
    rate ||= buf.sampleRate;
    const mono = toMono(buf);
    const from = Math.round(r.delay * buf.sampleRate);
    const data = mono.slice(from, from + Math.round(r.len * buf.sampleRate));
    onProgress?.(++done / saved.sources.length);
    return [r, data] as const;
  }));
  const sources: Record<string, Float32Array> = {}, names: Record<string, string> = {};
  for (const [r, d] of loaded) { sources[r.id] = d; names[r.id] = r.name; }
  return { project: saved.project, sources, names, refs: saved.sources, rate };
}
