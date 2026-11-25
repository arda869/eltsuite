import type { DPage, El } from './model';
export type TplEl = Omit<El, 'id' | 'page' | 'z'>;
export type Tpl = { k: string; name: string; about: string; group?: 'teach' | 'canvas' | 'scene'; story?: boolean; pages: { p: Omit<DPage, 'id' | 'order'>; els: TplEl[] }[] };
import { SCENE_TEMPLATES } from './sceneTemplates';
export { SCENE_TEMPLATES } from './sceneTemplates';

// Templates for teaching: each is a finished-looking page with the words to change. Colours are
// warm neutrals and one accent, like the worksheets, so they print well in colour and in black.
const INK = '#262420', MUTED = '#66615b', HAIR = '#d6d3cd', BAND = '#ecebe7', ACC = '#c8764a', ACC_T = '#f6e6dc';
const text = (x: number, y: number, w: number, h: number, t: string, o: Partial<TplEl> = {}): TplEl => ({ t: 'text', x, y, w, h, text: t, font: 'Fraunces', size: 28, color: INK, align: 'left', ...o });
const label = (x: number, y: number, w: number, h: number, t: string, o: Partial<TplEl> = {}): TplEl => text(x, y, w, h, t, { font: 'Karla', size: 16, bold: true, upper: true, ls: 2, color: ACC, ...o });
const box = (x: number, y: number, w: number, h: number, o: Partial<TplEl> = {}): TplEl => ({ t: 'shape', shape: 'rect', x, y, w, h, fill: '#ffffff', stroke: HAIR, sw: 2, radius: 18, ...o });
const frame = (x: number, y: number, w: number, h: number, name = 'Picture'): TplEl => ({ t: 'image', x, y, w, h, radius: 16, name });
const lines = (x: number, y: number, w: number, h: number, gap = 44): TplEl => ({ t: 'lines', x, y, w, h, gap, stroke: '#a9a49d' });

const A4 = { w: 794, h: 1123 }, A4L = { w: 1123, h: 794 }, SLIDE = { w: 1280, h: 720 }, CARD = { w: 559, h: 397 };

const TEACH: Tpl[] = [
  {
    k: 'poster', group: 'teach', name: 'Classroom poster', about: 'A title, a picture and the key language', pages: [{ p: { ...A4, bg: '#ffffff' }, els: [
      box(0, 0, A4.w, 210, { fill: BAND, stroke: BAND, radius: 0 }),
      label(56, 56, 500, 24, 'Unit 4 · Useful language'),
      text(56, 88, 680, 90, 'Talking about the weather', { size: 48, bold: true, lh: 1.05 }),
      frame(56, 250, 682, 380, 'Poster picture'),
      label(56, 670, 400, 24, 'Say it like this'),
      box(56, 706, 330, 300, { fill: ACC_T, stroke: ACC_T }),
      text(80, 730, 290, 260, 'It’s sunny.\nIt’s raining.\nIt’s windy.\nIt’s freezing.', { size: 26, lh: 1.6 }),
      box(408, 706, 330, 300, { fill: '#ffffff' }),
      text(432, 730, 290, 260, 'What’s the weather like?\nIt looks like rain.\nWhat a lovely day.', { size: 24, lh: 1.6, color: MUTED }),
      text(56, 1040, 682, 30, 'Classroom poster · B1', { font: 'Karla', size: 14, color: MUTED }),
    ] }],
  },
  {
    k: 'flashcards', group: 'teach', name: 'Flashcards', about: 'Eight cards on a page, to cut out', pages: [{ p: { ...A4, bg: '#ffffff' }, els: [
      ...Array.from({ length: 8 }, (_, i) => {
        const c = i % 2, r = Math.floor(i / 2), x = 40 + c * 367, y = 40 + r * 262;
        return [box(x, y, 347, 242, { dash: 'dash', radius: 14, stroke: '#a9a49d' }), frame(x + 24, y + 20, 299, 150, `Card ${i + 1} picture`), text(x + 24, y + 182, 299, 44, ['sunny', 'rainy', 'windy', 'cloudy', 'snowy', 'foggy', 'stormy', 'hot'][i], { size: 30, bold: true, align: 'center' })];
      }).flat(),
    ] }],
  },
  {
    k: 'labelled', group: 'teach', name: 'Labelled picture', about: 'Number the parts; learners write the words', pages: [{ p: { ...A4L, bg: '#ffffff' }, els: [
      label(48, 40, 600, 24, 'Label the picture'),
      text(48, 70, 700, 50, 'In the kitchen', { size: 38, bold: true }),
      frame(48, 140, 640, 600, 'Picture to label'),
      { t: 'label', x: 220, y: 300, w: 140, h: 40, text: 'fridge', ax: 180, ay: 330, pin: 'number', font: 'Karla', size: 18 },
      { t: 'label', x: 420, y: 520, w: 140, h: 40, text: 'cooker', ax: 380, ay: 560, pin: 'number', font: 'Karla', size: 18 },
      { t: 'wordbank', x: 720, y: 140, w: 355, h: 220, title: 'Word bank', text: 'sink, kettle', size: 18 },
      label(720, 400, 300, 24, 'Write the words'),
      lines(720, 440, 355, 300, 50),
    ] }],
  },
  {
    k: 'worksheet', group: 'teach', name: 'Worksheet', about: 'Header, instructions and lines to write on', pages: [{ p: { ...A4, bg: '#ffffff' }, els: [
      box(0, 0, A4.w, 150, { fill: BAND, stroke: BAND, radius: 0 }),
      box(48, 36, 300, 44, { radius: 10 }),
      text(62, 46, 280, 26, 'Name', { font: 'Karla', size: 16, color: MUTED }),
      text(48, 92, 600, 46, 'My weekend', { font: 'Karla', size: 32, bold: true }),
      label(48, 190, 600, 24, '1  Read and answer'),
      text(48, 224, 698, 120, 'Write about your last weekend. Where did you go? Who were you with? What did you enjoy most?', { size: 22, lh: 1.5 }),
      lines(48, 360, 698, 300, 46),
      label(48, 700, 600, 24, '2  Draw it'),
      box(48, 736, 698, 320, { dash: 'dash', fill: '#ffffff' }),
    ] }],
  },
  {
    k: 'board', group: 'teach', name: 'Slide for the board', about: '16:9, a title and three points', pages: [{ p: { ...SLIDE, bg: '#ffffff' }, els: [
      box(0, 0, 18, SLIDE.h, { fill: ACC, stroke: ACC, radius: 0 }),
      label(80, 70, 700, 26, 'Today'),
      text(80, 108, 700, 120, 'Making polite requests', { size: 60, bold: true, lh: 1.05 }),
      text(80, 290, 620, 320, '• Could you open the window?\n• Would you mind waiting?\n• Can I borrow your pen?', { size: 34, lh: 1.7 }),
      frame(760, 120, 440, 480, 'Slide picture'),
    ] }],
  },
  {
    k: 'vocab-card', group: 'teach', name: 'Word card', about: 'A6: a picture, the word and an example', pages: [{ p: { ...CARD, bg: '#ffffff' }, els: [
      frame(24, 24, 200, 349, 'Word picture'),
      label(248, 40, 280, 22, 'Noun · B1'),
      text(248, 70, 290, 60, 'umbrella', { size: 44, bold: true }),
      text(248, 140, 290, 30, '/ʌmˈbrelə/', { font: 'Karla', size: 20, color: MUTED }),
      box(248, 190, 287, 150, { fill: ACC_T, stroke: ACC_T, radius: 14 }),
      text(264, 206, 255, 120, 'Take an umbrella. It looks like rain.', { size: 21, lh: 1.45 }),
    ] }],
  },
  {
    k: 'certificate', group: 'teach', name: 'Certificate', about: 'For a learner who did something great', pages: [{ p: { ...A4L, bg: '#fffdf9' }, els: [
      box(30, 30, A4L.w - 60, A4L.h - 60, { fill: '#fffdf9', stroke: ACC, sw: 4, radius: 22 }),
      box(48, 48, A4L.w - 96, A4L.h - 96, { fill: 'transparent', stroke: HAIR, sw: 2, radius: 16 }),
      label(0, 150, A4L.w, 26, 'Certificate of achievement', { align: 'center', size: 18 }),
      text(0, 200, A4L.w, 40, 'This is to say that', { align: 'center', size: 24, color: MUTED }),
      text(160, 260, A4L.w - 320, 90, 'Learner’s name', { align: 'center', size: 60, bold: true }),
      box(260, 360, A4L.w - 520, 2, { fill: HAIR, stroke: HAIR, radius: 0 }),
      text(160, 400, A4L.w - 320, 80, 'has finished the B1 course with great effort and a lot of good questions.', { align: 'center', size: 24, lh: 1.5 }),
      text(160, 600, 300, 30, 'Teacher', { font: 'Karla', size: 16, color: MUTED, align: 'center' }),
      text(A4L.w - 460, 600, 300, 30, 'Date', { font: 'Karla', size: 16, color: MUTED, align: 'center' }),
      box(160, 590, 300, 2, { fill: HAIR, stroke: HAIR, radius: 0 }),
      box(A4L.w - 460, 590, 300, 2, { fill: HAIR, stroke: HAIR, radius: 0 }),
    ] }],
  },
  {
    k: 'rules', group: 'teach', name: 'Class agreement', about: 'The rules your class agrees on', pages: [{ p: { ...A4, bg: '#ffffff' }, els: [
      label(56, 64, 600, 24, 'Our class agreement'),
      text(56, 98, 680, 120, 'In this class, we…', { size: 52, bold: true }),
      ...['listen when someone is speaking', 'try in English first', 'help each other', 'make mistakes and learn from them', 'are kind'].flatMap((r, i) => [
        { t: 'shape', shape: 'ellipse', x: 56, y: 262 + i * 140, w: 72, h: 72, fill: ACC, stroke: ACC, sw: 0 } as TplEl,
        text(56, 280 + i * 140, 72, 40, String(i + 1), { font: 'Karla', size: 30, bold: true, color: '#ffffff', align: 'center' }),
        text(156, 276 + i * 140, 580, 50, r, { size: 32 }),
      ]),
    ] }],
  },
];

const CANVAS: Tpl[] = [
  { k: 'square', group: 'canvas', name: 'Square image', about: 'For pictures and graphics', pages: [{ p: { w: 1080, h: 1080, bg: '#ffffff' }, els: [] }] },
  { k: 'landscape', group: 'canvas', name: 'Landscape image', about: 'Room for side-by-side pictures', pages: [{ p: { w: 1536, h: 1024, bg: '#ffffff' }, els: [] }] },
  { k: 'portrait', group: 'canvas', name: 'Portrait image', about: 'A tall canvas for a character', pages: [{ p: { w: 1024, h: 1536, bg: '#ffffff' }, els: [] }] },
];

export const TEACH_TEMPLATES = TEACH;
export const TEMPLATES: Tpl[] = [...TEACH, ...CANVAS, ...SCENE_TEMPLATES.map((t) => ({ ...t, group: 'scene' as const }))];
