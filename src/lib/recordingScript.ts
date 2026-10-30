import { clipEnd, type Project } from './mix';
import type { ScriptLine } from './archive';
export function effectCaption(label: string) {
  const text = label.trim().replace(/^\((.*)\)$/, '$1');
  return `(${text === 'Phone ringing' ? 'phone rings' : text.toLowerCase()})`;
}
export function recordingScript(p: Project): ScriptLine[] {
  const voices = p.tracks.filter(t => t.kind === 'voice');
  const solo = p.tracks.some(t => t.solo);
  const lines = p.lines.filter(l => l.text.trim()).map(l => {
    const track = p.tracks.find(t => t.id === l.track);
    const who = track ? track.name.trim() : l.who || (voices.length > 1 ? voices[0]?.name : '');
    return { text: l.text.trim(), t: +l.a.toFixed(2), e: +l.b.toFixed(2), ...(who && !/^\([^)]*\)$/.test(l.text.trim()) ? { who } : {}) };
  });
  for (const t of p.tracks.filter(t => t.kind === 'sfx' && !t.mute && (!solo || t.solo))) {
    for (const c of t.clips) if (c.caption?.trim() && c.gain > 0 && t.gain > 0) lines.push({ text: effectCaption(c.caption), t: +c.at.toFixed(2), e: +clipEnd(c).toFixed(2) });
  }
  return lines.sort((a,b) => (a.t ?? 0) - (b.t ?? 0));
}
export function recordingEditorUrl(classId: string, mediaId: string, archiveId = '') {
  const query = new URLSearchParams({ class: classId, media: mediaId });
  return `/studio/sound/${encodeURIComponent(archiveId || 'lesson')}?${query}`;
}
