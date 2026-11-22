import type { HubActivity, HubCollection } from './catalog';
import { publishedTasks } from './resourceTasks';
import { flattenWithSections, type Paper } from '../lib/worksheet';
import { worksheetHtml } from '../lib/worksheetHtml';
import { worksheetPdf } from '../lib/pdfMake';
import { sheetPictures, sheetSounds } from '../lib/sheetMedia';
import { openPdf } from '../pdf/pdfData';
import type { JSONContent } from '@tiptap/react';

type Options = { activity: HubActivity; collection?: HubCollection; learnerIds: string[]; teacherIds: string[]; copies: number; paper: 'a4' | 'letter'; colour: 'colour' | 'mono' };
const textOf = (node: JSONContent): string => node.text ?? (node.content ?? []).map(child => textOf(child) + (['paragraph', 'heading', 'listItem', 'tableRow'].includes(child.type ?? '') ? '\n' : '')).join('');

/** A Resource Hub lesson uses the same worksheet renderer and PDF capture as Print in Classes. */
export async function makeResourceLessonPdf({ activity, collection, learnerIds, teacherIds, copies, paper, colour }: Options): Promise<Uint8Array> {
  if (!learnerIds.length) throw new Error('Choose at least one learner task.');
  if (!Number.isInteger(copies) || copies < 1 || copies > 30) throw new Error('Choose 1–30 learner copies.');
  const tasks = publishedTasks(activity, new Set(learnerIds)).filter(task => !task.hidden);
  const rows = flattenWithSections(tasks, new Set(tasks.map((_, index) => index)), 'adult');
  const accent = collection?.paperAccent || collection?.accent || '#a06b50';
  const [media, sounds] = await Promise.all([
    sheetPictures('', rows),
    sheetSounds('', rows, accent),
  ]);
  const size = (paper === 'a4' ? 'A4' : 'Letter') as Paper;
  const base = {
    lessonStyle: 'adult' as const, header: true, mono: colour === 'mono', key: false, notes: false, qr: false,
    paper: size, columns: 1 as const, size: 'standard' as const, clear: false, exam: false, marks: false,
    accent, className: 'Resource Hub', level: activity.level, origin: location.origin, media, sounds,
  };
  const learner = await worksheetPdf(worksheetHtml(activity.title, rows, base), size);
  if (copies === 1 && !teacherIds.length) return learner;

  // Keep copies and the optional teacher key as separate sheets, in the same order as Classes.
  const authoredNotes = (activity.editorSections ?? []).filter(section => section.audience === 'teacher' && teacherIds.includes(section.id)).map(section => {
    const manual = { ...section.content, content: (section.content.content ?? []).filter(node => node.attrs?.hubGeneratedAnswer !== true) };
    const body = [section.instructions.trim(), textOf(manual).trim()].filter(Boolean).join('\n');
    return body ? [section.title, body].filter(Boolean).join('\n') : '';
  }).filter(Boolean).join('\n\n');
  let notesPlaced = false;
  const teacherRows = rows.map(row => {
    if (row.kind !== 'task') return row;
    const notes = !notesPlaced ? [row.task.notes, authoredNotes].filter(Boolean).join('\n\n') : row.task.notes;
    notesPlaced = true;
    return { ...row, task: { ...row.task, notes } };
  });
  const teacherHtml = teacherIds.length ? worksheetHtml(activity.title, teacherRows, { ...base, key: true, notes: true }) : '';
  const keyMarkup = teacherHtml.match(/<template id="u-key">([\s\S]*?)<\/template>/)?.[1] ?? '';
  const teacherOnly = keyMarkup.trim() ? teacherHtml
    .replace(/<template id="u-main">[\s\S]*?<\/template>/, '<template id="u-main"></template>')
    .replace(/<template id="cards">[\s\S]*?<\/template>/, '<template id="cards"></template>')
    .replace(/<template id="activity-pages">[\s\S]*?<\/template>/, '<template id="activity-pages"></template>') : '';
  const teacher = teacherOnly ? await worksheetPdf(teacherOnly, size) : null;
  if (copies === 1 && !teacher) return learner;
  const { jsPDF } = await import('jspdf');
  const out = new jsPDF({ unit: 'mm', format: size.toLowerCase(), compress: true });
  const addPages = async (bytes: Uint8Array, repetitions: number, first: boolean) => {
    const document = await openPdf(bytes);
    try {
      for (let copy = 0; copy < repetitions; copy++) for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('The printable page could not be drawn.');
        await page.render({ canvasContext: context, viewport } as Parameters<typeof page.render>[0]).promise;
        if (!first) out.addPage();
        first = false;
        out.addImage(canvas.toDataURL('image/jpeg', .9), 'JPEG', 0, 0, out.internal.pageSize.getWidth(), out.internal.pageSize.getHeight());
      }
    } finally { await document.destroy(); }
    return first;
  };
  let first = await addPages(learner, copies, true);
  if (teacher) first = await addPages(teacher, 1, first);
  return new Uint8Array(out.output('arraybuffer'));
}
