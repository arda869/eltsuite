import type { Project, Track, Line } from './mix';
export type TranscriptSegment = { text: string; speaker: string; start: number; end: number };
// Keep the original audio exactly once: diarization labels turns, it cannot isolate
// simultaneous voices. Split at speaker boundaries without dropping inter-turn silence.
export function transcriptTimeline(p: Project, clipId: string, segments: TranscriptSegment[], id: () => string, expected?: {src:string;a:number;b:number}): Project {
  const home = p.tracks.find(t => t.clips.some(c => c.id === clipId));
  const original = home?.clips.find(c => c.id === clipId);
  if (!home || !original) return p; // the teacher removed/undid this take while the request ran
  if(expected&&(original.src!==expected.src||original.a!==expected.a||original.b!==expected.b))return p;
  const clip = original;
  const duration = clip.b - clip.a;
  const rows = segments.filter(s => s.end > 0 && s.start < duration).map(s => ({ ...s, start: Math.max(0,s.start), end: Math.min(duration,s.end) })).sort((a,b) => a.start-b.start);
  if (!rows.length) return p;
  const bySpeaker = new Map<string, Track>();
  rows.forEach(s => {
    if (!bySpeaker.has(s.speaker)) bySpeaker.set(s.speaker, { ...home, id: id(), name: `Speaker ${bySpeaker.size + 1}`, clips: [] });
  });
  rows.forEach((s, i) => {
    const from = i === 0 ? 0 : s.start;
    const to = i === rows.length - 1 ? duration : rows[i + 1].start;
    if (to > from) bySpeaker.get(s.speaker)!.clips.push({ ...clip, id: id(), a: clip.a + from, b: clip.a + to, at: clip.at + from, fadeIn: i === 0 ? clip.fadeIn : 0, fadeOut: i === rows.length - 1 ? clip.fadeOut : 0 });
  });
  const lines: Line[] = rows.map(s => ({ id: id(), track: bySpeaker.get(s.speaker)!.id, text: s.text, a: clip.at + s.start, b: clip.at + s.end }));
  const tracks = p.tracks.map(t => t.id === home.id ? { ...t, clips: t.clips.filter(c => c.id !== clipId) } : t).filter(t => t.id !== home.id || t.clips.length || p.lines.some(l => l.track === t.id));
  return { ...p, tracks: [...tracks.filter(t => t.kind === 'voice'), ...bySpeaker.values(), ...tracks.filter(t => t.kind !== 'voice')], lines: [...p.lines, ...lines] };
}
