// Song models return audio without word timestamps. Keep each written lyric line
// editable on the timeline, with approximate positions across the recording.
export function songScriptLines(lyrics: string, start: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const rows = lyrics.replace(/\r\n?/g, '\n').split('\n');
  const first = rows.findIndex(row => row.trim());
  if (first < 0) return [];
  let last = rows.length - 1;
  while (last >= first && !rows[last].trim()) last--;
  const parts = rows.slice(first, last + 1).map(row => {
    const text = row.trim();
    return { text, weight: text ? Math.max(2, text.split(/\s+/u).length) : 2 };
  });
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  let elapsed = 0;
  return parts.flatMap(part => {
    const a = start + duration * elapsed / total;
    elapsed += part.weight;
    return part.text ? [{ text: part.text, a, b: start + duration * elapsed / total }] : [];
  });
}

type SavedLine = { text: string; t: number | null; e?: number; who?: string };
export function expandSavedSongScript(lines: SavedLine[], duration: number): SavedLine[] {
  return lines.flatMap(line => {
    if (!/[\r\n]/u.test(line.text)) return [line];
    const start = line.t ?? 0;
    const parts = songScriptLines(line.text, start, (line.e ?? duration) - start);
    return parts.length ? parts.map(part => ({ text: part.text, t: part.a, e: part.b, who: line.who })) : [line];
  });
}
