import { useEffect, useMemo, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { flattenTask, type MediaInfo, type MediaMap, type WsItem } from '../lib/worksheet';
import { sheetParts } from '../lib/worksheetHtml';
import { sheetPictures, sheetSounds } from '../lib/sheetMedia';
import { coverMarkup } from '../components/Covers';
import type { ExportTask } from '../lib/textformat';

// The printed pieces of a lesson for the worksheet view: the page band and footer, and each task and
// section as the print engine draws it, with its pictures and QR codes.

export type SheetTask = { id: string; kind?: string; title: string; instructions?: string; instrDoc?: JSONContent | null; content: JSONContent | null; hidden?: boolean };
export type SheetLook = { classId: string; accent: string; className?: string; level?: string; cover?: string | null };

export function useSheet(title: string, tasks: SheetTask[], look: SheetLook, on: boolean) {
  // What prints: sections, and the tasks learners can see, in order.
  const shown = useMemo(() => tasks.filter((t) => t.kind === 'section' || (!t.hidden && t.content)), [tasks]);
  const items = useMemo<WsItem[]>(
    () => shown.map((t) => (t.kind === 'section' ? { kind: 'section' as const, title: t.title } : { kind: 'task' as const, task: flattenTask({ ...t, content: t.content! } as ExportTask) })),
    [shown],
  );
  // Pictures and QR codes take a moment: read again a little after the tasks change.
  const [media, setMedia] = useState<{ media: MediaMap; sounds: Record<string, MediaInfo> }>({ media: {}, sounds: {} });
  const [cover, setCover] = useState('');
  useEffect(() => {
    if (!on) return;
    coverMarkup(look.cover, look.classId).then(setCover, () => setCover(''));
  }, [on, look.cover, look.classId]);
  useEffect(() => {
    if (!on) return;
    let off = false;
    const t = window.setTimeout(() => {
      Promise.all([sheetPictures(look.classId, items), sheetSounds(look.classId, items, look.accent)]).then(
        ([m, s]) => !off && setMedia({ media: m, sounds: s }),
        () => {},
      );
    }, 500);
    return () => {
      off = true;
      window.clearTimeout(t);
    };
  }, [on, items, look.classId, look.accent]);
  return useMemo(() => {
    if (!on) return null;
    const p = sheetParts(title, items, { header: true, key: false, qr: true, paper: 'A4', columns: 1, accent: look.accent, className: look.className ?? '', level: look.level ?? '', cover, origin: location.origin, media: media.media, sounds: media.sounds });
    const byId: Record<string, { html: string; n: number }> = {};
    let n = 0;
    shown.forEach((t, i) => (byId[t.id] = { html: p.pieces[i], n: t.kind === 'section' ? 0 : ++n }));
    return { parts: { css: p.css, band: p.band, foot: p.foot }, byId };
  }, [on, title, items, shown, look.accent, look.className, look.level, cover, media]);
}
