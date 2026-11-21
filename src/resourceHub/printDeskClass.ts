import type { ExportTask } from '../lib/textformat';
import type { ClassDoc } from '../lib/classes';
import { gatherLesson } from '../lib/transfer';
import { flattenWithSections, type Paper } from '../lib/worksheet';
import { sheetPictures, sheetSounds } from '../lib/sheetMedia';
import { lessonStyleOf } from '../lib/lessonStyle';
import { worksheetHtml } from '../lib/worksheetHtml';
import { worksheetPdf } from '../lib/pdfMake';
import { theme } from '../lib/themes';
import { coverMarkup } from '../components/Covers';

export type DeskLesson = { key: string; classId: string; itemId: string; title: string; className: string; tasks: ExportTask[] };
export const lessonKey = (classId: string, itemId: string) => `${classId}:${itemId}`;
export const printableTasks = (tasks: ExportTask[]) => tasks.map((task, index) => ({ task, index })).filter(({ task }) => task.kind !== 'section' && !task.hidden && task.print?.show !== 'screen');
export const defaultTaskIndices = (tasks: ExportTask[]) => new Set(printableTasks(tasks).map(({ index }) => index));

/** Load through the same teacher-only reader as the existing Worksheet dialog. */
export async function loadDeskLesson(classId: string, itemId: string, className: string): Promise<DeskLesson> {
  const lesson = await gatherLesson(classId, itemId);
  return { key: lessonKey(classId, itemId), classId, itemId, className, ...lesson };
}

/** The existing worksheet renderer is authoritative for layout and answer keys. */
export async function makeDeskLessonPdfs(lesson: DeskLesson, cls: ClassDoc | undefined, picked: Set<number>, paper: 'a4' | 'letter', mono = false) {
  const rows = flattenWithSections(lesson.tasks, picked, lessonStyleOf(cls));
  if (!rows.some(row => row.kind === 'task')) throw new Error(`Choose at least one printable task in ${lesson.title}.`);
  const accent = theme(cls?.themeColor).accent;
  const [media, sounds, cover] = await Promise.all([
    sheetPictures(lesson.classId, rows),
    sheetSounds(lesson.classId, rows, accent, lesson.itemId),
    cls?.cover ? coverMarkup(cls.cover, lesson.classId).catch(() => '') : Promise.resolve(''),
  ]);
  const base = { lessonStyle: lessonStyleOf(cls), header: true, mono, notes: false, qr: false, paper: (paper === 'a4' ? 'A4' : 'Letter') as Paper, columns: 1 as const, size: 'standard' as const, clear: false, exam: false, marks: false, accent, className: cls?.name ?? lesson.className, level: cls?.level ?? '', cover, origin: location.origin, media, sounds };
  const learner = await worksheetPdf(worksheetHtml(lesson.title, rows, { ...base, key: false }), base.paper);
  const withTeacher = worksheetHtml(lesson.title, rows, { ...base, key: true, notes: true });
  // The existing renderer puts answer keys before cut-out cards, so subtracting the
  // learner PDF page count would select the wrong pages. Render its key template alone.
  const keyMarkup = withTeacher.match(/<template id="u-key">([\s\S]*?)<\/template>/)?.[1] ?? '';
  const teacherOnly = keyMarkup.trim() ? withTeacher
    .replace(/<template id="u-main">[\s\S]*?<\/template>/, '<template id="u-main"></template>')
    .replace(/<template id="cards">[\s\S]*?<\/template>/, '<template id="cards"></template>')
    .replace(/<template id="activity-pages">[\s\S]*?<\/template>/, '<template id="activity-pages"></template>') : null;
  const teacher = teacherOnly ? await worksheetPdf(teacherOnly, base.paper) : null;
  return { learner, teacher };
}
