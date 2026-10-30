import type { Project, Track, Line, Clip } from './mix';
import { projectLen } from './mix';
import type { SpeechTake } from './speech';
export type SpeechInsertion = { speakerId: string; speaker: string; text: string; gap: number; take: SpeechTake };
export function speechTimeline(project: Project, rows: SpeechInsertion[], rate: number, id: () => string) {
  let cursor = projectLen(project), previousStart = cursor;
  const tracks: Track[] = [], lines: Line[] = [], sources: { id: string; name: string; samples: Float32Array }[] = [];
  const bySpeaker = new Map<string, Track>();
  rows.forEach((row, i) => {
    let track = bySpeaker.get(row.speakerId);
    if (!track) {
      track = { id: id(), name: row.speaker, kind: 'voice', clips: [], gain: 1, mute: false, solo: false, noise: 0, echo: 0 };
      tracks.push(track); bySpeaker.set(row.speakerId, track);
    }
    const at = Math.max(previousStart, cursor + (i ? row.gap : 0));
    previousStart = at;
    const input = row.take.samples;
    const samples = new Float32Array(Math.round(input.length * rate / row.take.rate));
    for (let n = 0; n < samples.length; n++) {
      const x = n * row.take.rate / rate, a = Math.floor(x), f = x - a;
      samples[n] = input[a] * (1 - f) + input[Math.min(a + 1, input.length - 1)] * f;
    }
    const src = id(), duration = samples.length / rate;
    const clip: Clip = { id: id(), src, a: 0, b: duration, at, gain: 1, fx: '', fadeIn: 0, fadeOut: 0 };
    track.clips.push(clip);
    lines.push({ id: id(), text: row.text, who: row.speaker, track: track.id, a: at, b: at + duration });
    sources.push({ id: src, name: `${row.speaker} · ${row.text.slice(0,50)}`, samples });
    cursor = at + duration;
  });
  const existing = project.tracks.filter(t => t.clips.length || project.lines.some(l => l.track === t.id) || t.kind !== 'voice');
  return { project: { ...project, tracks: [...existing.filter(t => t.kind === 'voice'), ...tracks, ...existing.filter(t => t.kind !== 'voice')], lines: [...project.lines, ...lines] }, sources };
}
