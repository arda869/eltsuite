import type { DPage, El } from './model';
import { textHeight } from './render';

// Ready-made starts for the things teachers make most. Pictures are empty frames: drop a picture on
// one, or choose one, and it fills the frame.

export type TplEl = Omit<El, 'id' | 'page' | 'z'>;
export type Tpl = { k: string; name: string; about: string; pages: { p: Omit<DPage, 'id' | 'order'>; els: TplEl[] }[] };

const A4 = { w: 794, h: 1123 };
const ink = '#262420';
const T = (text: string, x: number, y: number, w: number, o: Partial<El> = {}): TplEl => {
  const e = { t: 'text' as const, text, x, y, w, h: 0, font: 'Fraunces', size: 20, color: ink, lh: 1.4, ...o };
  return { ...e, h: textHeight(e, w) };
};
const frame = (x: number, y: number, w: number, h: number, o: Partial<El> = {}): TplEl => ({ t: 'image', x, y, w, h, radius: 10, ...o });
const box = (x: number, y: number, w: number, h: number, o: Partial<El> = {}): TplEl => ({ t: 'shape', shape: 'rect', x, y, w, h, fill: '#ffffff', stroke: '#d6d3cd', sw: 1.5, radius: 12, ...o });
const header = (title: string, kicker = 'UNIT 1 · A2'): TplEl[] => [
  { t: 'shape', shape: 'rect', x: 0, y: 0, w: A4.w, h: 113, fill: '#ecebe7' },
  { t: 'shape', shape: 'rect', x: 38, y: 34, w: 220, h: 44, fill: '#ffffff', radius: 8, text: 'Name', font: 'Karla', size: 12, color: '#66615b', valign: 'top' },
  T(kicker, 290, 30, 440, { font: 'Karla', size: 12, bold: true, ls: 2, upper: true, color: '#c8764a' }),
  T(title, 290, 50, 470, { font: 'Karla', size: 28, bold: true, lh: 1.15 }),
];
const instr = (n: number, text: string, y: number): TplEl[] => [T(String(n), 38, y, 30, { font: 'Karla', size: 22, bold: true, color: '#c8764a' }), T(text, 70, y + 2, 680, { font: 'Karla', size: 18, bold: true, lh: 1.35 })];

export const TEMPLATES: Tpl[] = [
  {
    k: 'blank',
    name: 'Blank A4',
    about: 'A plain worksheet page',
    pages: [{ p: { ...A4, bg: '#ffffff' }, els: [] }],
  },
  {
    k: 'label',
    name: 'Label the picture',
    about: 'Numbered labels and a word bank. Download a learner copy with the words hidden.',
    pages: [
      {
        p: { ...A4, bg: '#ffffff' },
        els: [
          ...header('In the kitchen', 'VOCABULARY · A1'),
          ...instr(1, 'Look at the picture. Write the words.', 140),
          frame(70, 190, 654, 500),
          { t: 'label', text: 'fridge', x: 560, y: 230, w: 150, h: 40, ax: 470, ay: 300, font: 'Fraunces', size: 18 },
          { t: 'label', text: 'cooker', x: 560, y: 600, w: 150, h: 40, ax: 470, ay: 560, font: 'Fraunces', size: 18 },
          { t: 'label', text: 'sink', x: 84, y: 230, w: 130, h: 40, ax: 260, ay: 320, font: 'Fraunces', size: 18 },
          { t: 'label', text: 'cupboard', x: 84, y: 600, w: 150, h: 40, ax: 260, ay: 520, font: 'Fraunces', size: 18 },
          { t: 'wordbank', x: 70, y: 720, w: 654, h: 110, title: 'Word bank', size: 18 },
          ...instr(2, 'Write a sentence about your kitchen.', 860),
          { t: 'lines', x: 70, y: 900, w: 654, h: 140, gap: 28 },
        ],
      },
    ],
  },
  {
    k: 'flash',
    name: 'Flashcards',
    about: 'Eight cards on A4, a picture and a word on each. Print and cut.',
    pages: [
      {
        p: { ...A4, bg: '#ffffff' },
        els: Array.from({ length: 8 }, (_, i) => {
          const c = i % 2;
          const r = Math.floor(i / 2);
          const x = 40 + c * 367;
          const y = 40 + r * 262;
          return [
            { t: 'shape', shape: 'rect', x, y, w: 347, h: 242, fill: '#ffffff', stroke: '#a9a49d', sw: 1.2, dash: 'dash', radius: 14 } as TplEl,
            frame(x + 16, y + 16, 315, 160, { radius: 8 }),
            T('word', x + 16, y + 188, 315, { font: 'Karla', size: 26, bold: true, align: 'center' }),
          ];
        }).flat(),
      },
    ],
  },
  {
    k: 'spot',
    name: 'Spot the difference',
    about: 'Picture A and picture B on two pages. Change things on B.',
    pages: ['A', 'B'].map((v) => ({
      p: { ...A4, bg: '#ffffff', name: 'Picture ' + v },
      els: [
        ...header('Spot the difference', 'SPEAKING · PAIRWORK'),
        ...instr(1, v === 'A' ? 'Learner A: describe your picture. Find six differences.' : 'Learner B: describe your picture. Find six differences.', 140),
        { t: 'shape', shape: 'rect', x: 38, y: 190, w: 54, h: 54, fill: '#c8764a', radius: 27, text: v, font: 'Karla', size: 26, bold: true, color: '#ffffff', align: 'center', valign: 'middle' } as TplEl,
        frame(70, 260, 654, 560),
        ...instr(2, 'Write the differences.', 850),
        { t: 'lines', x: 70, y: 890, w: 654, h: 168, gap: 28 },
      ],
    })),
  },
  {
    k: 'gap',
    name: 'Information gap',
    about: 'One page with Learner A and Learner B parts. Download each learner’s copy.',
    pages: [
      {
        p: { ...A4, bg: '#ffffff' },
        els: [
          ...header('Find the missing information', 'SPEAKING · PAIRWORK'),
          ...instr(1, 'Ask and answer. Complete the table.', 140),
          box(70, 200, 654, 300),
          T('Name: Maya\nAge: 14\nFrom: ____________\nLikes: ____________', 100, 230, 600, { size: 22, lh: 1.9, ver: 'A' }),
          T('Name: Maya\nAge: ____________\nFrom: Lisbon\nLikes: football', 100, 230, 600, { size: 22, lh: 1.9, ver: 'B' }),
          T('Learner A', 600, 210, 110, { font: 'Karla', size: 13, bold: true, upper: true, ls: 1.5, color: '#c8764a', ver: 'A', align: 'right' }),
          T('Learner B', 600, 210, 110, { font: 'Karla', size: 13, bold: true, upper: true, ls: 1.5, color: '#c8764a', ver: 'B', align: 'right' }),
          frame(70, 530, 654, 360),
          T('Tip: switch between A and B at the top to see each learner’s copy.', 70, 920, 654, { font: 'Karla', size: 14, color: '#66615b' }),
        ],
      },
    ],
  },
  {
    k: 'poster',
    name: 'Classroom poster',
    about: 'A big title, a picture and three key points',
    pages: [
      {
        p: { w: 794, h: 1123, bg: '#f3e3b5' },
        els: [
          T('CLASSROOM ENGLISH', 60, 70, 674, { font: 'Karla', size: 18, bold: true, ls: 4, color: '#b64a3c', align: 'center' }),
          T('Can I go to the toilet, please?', 60, 110, 674, { font: 'Fraunces', size: 62, bold: true, lh: 1.05, align: 'center' }),
          frame(110, 330, 574, 420, { radius: 24, border: 10, borderC: '#ffffff', shadow: true }),
          { t: 'shape', shape: 'speech', x: 120, y: 790, w: 270, h: 150, fill: '#ffffff', text: 'Can I borrow a pen?', font: 'Playpen Sans', size: 22, align: 'center', valign: 'middle' } as TplEl,
          { t: 'shape', shape: 'speech', x: 410, y: 820, w: 270, h: 150, fill: '#ffffff', flipX: true, text: 'How do you say … in English?', font: 'Playpen Sans', size: 22, align: 'center', valign: 'middle' } as TplEl,
        ],
      },
    ],
  },
  {
    k: 'story',
    name: 'Picture story',
    about: 'Six numbered pictures to put in order and tell',
    pages: [
      {
        p: { ...A4, bg: '#ffffff' },
        els: [
          ...header('What happened next?', 'SPEAKING · NARRATIVE TENSES'),
          ...instr(1, 'Put the pictures in order. Tell the story.', 140),
          ...Array.from({ length: 6 }, (_, i) => {
            const c = i % 2;
            const r = Math.floor(i / 2);
            const x = 70 + c * 337;
            const y = 195 + r * 300;
            return [
              frame(x, y, 317, 230),
              { t: 'shape', shape: 'ellipse', x: x + 10, y: y + 10, w: 38, h: 38, fill: '#c8764a', text: String.fromCharCode(65 + i), font: 'Karla', size: 18, bold: true, color: '#fff', align: 'center', valign: 'middle' } as TplEl,
              { t: 'lines', x, y: y + 236, w: 317, h: 56, gap: 28 } as TplEl,
            ];
          }).flat(),
        ],
      },
    ],
  },
  {
    k: 'bingo',
    name: 'Bingo card',
    about: 'Five by five, with a free space in the middle',
    pages: [
      {
        p: { ...A4, bg: '#ffffff' },
        els: [
          T('BINGO', 60, 60, 674, { font: 'Lilita One', size: 96, color: '#c8764a', align: 'center', lh: 1 }),
          ...Array.from({ length: 25 }, (_, i) => {
            const c = i % 5;
            const r = Math.floor(i / 5);
            const free = i === 12;
            return box(77 + c * 130, 200 + r * 130, 120, 120, { fill: free ? '#c8764a' : '#ffffff', text: free ? 'FREE' : 'word', font: 'Karla', size: free ? 22 : 20, bold: true, color: free ? '#ffffff' : ink, align: 'center', valign: 'middle', radius: 10 });
          }),
          T('Listen. Cross out the words you hear. Shout “Bingo!” when you have a line.', 77, 870, 640, { font: 'Karla', size: 17, align: 'center', color: '#66615b' }),
        ],
      },
    ],
  },
  {
    k: 'slide',
    name: 'Board slide',
    about: '16:9, for the classroom screen',
    pages: [
      {
        p: { w: 1280, h: 720, bg: '#ffffff' },
        els: [
          frame(640, 0, 640, 720, { radius: 0 }),
          T('WARM-UP', 80, 150, 500, { font: 'Karla', size: 18, bold: true, ls: 3, color: '#c8764a' }),
          T('What do you do at the weekend?', 80, 190, 500, { font: 'Fraunces', size: 58, bold: true, lh: 1.08 }),
          T('Talk to a partner for two minutes.', 80, 420, 500, { font: 'Karla', size: 24, color: '#66615b' }),
        ],
      },
    ],
  },
  {
    k: 'cert',
    name: 'Certificate',
    about: 'A4 landscape, for the end of a course',
    pages: [
      {
        p: { w: 1123, h: 794, bg: '#ffffff' },
        els: [
          { t: 'shape', shape: 'rect', x: 30, y: 30, w: 1063, h: 734, fill: 'none', stroke: '#c8764a', sw: 3, radius: 18 },
          { t: 'shape', shape: 'rect', x: 44, y: 44, w: 1035, h: 706, fill: 'none', stroke: '#d6d3cd', sw: 1, radius: 12 },
          T('CERTIFICATE OF ACHIEVEMENT', 100, 130, 923, { font: 'Karla', size: 20, bold: true, ls: 5, color: '#c8764a', align: 'center' }),
          T('This is to say that', 100, 220, 923, { size: 24, italic: true, align: 'center', color: '#66615b' }),
          T('Learner’s name', 100, 270, 923, { font: 'Playfair Display', size: 72, bold: true, align: 'center', lh: 1.1 }),
          T('has finished General English B1 with hard work and a smile.', 100, 400, 923, { size: 24, align: 'center' }),
          { t: 'shape', shape: 'line', x: 160, y: 600, w: 300, h: 10, stroke: '#a9a49d', sw: 1.5 },
          { t: 'shape', shape: 'line', x: 663, y: 600, w: 300, h: 10, stroke: '#a9a49d', sw: 1.5 },
          T('Teacher', 160, 615, 300, { font: 'Karla', size: 15, align: 'center', color: '#66615b' }),
          T('Date', 663, 615, 300, { font: 'Karla', size: 15, align: 'center', color: '#66615b' }),
          { t: 'shape', shape: 'star', x: 511, y: 560, w: 100, h: 100, fill: '#d9a23a' },
        ],
      },
    ],
  },
  {
    k: 'square',
    name: 'Square post',
    about: '1080 × 1080, for the school’s page or a class group',
    pages: [
      {
        p: { w: 1080, h: 1080, bg: '#cfe0ef' },
        els: [
          T('WORD OF THE WEEK', 90, 120, 900, { font: 'Karla', size: 30, bold: true, ls: 5, color: '#3667a6', align: 'center' }),
          T('serendipity', 90, 330, 900, { font: 'Fraunces', size: 130, bold: true, align: 'center', lh: 1 }),
          T('/ˌser.ənˈdɪp.ə.ti/', 90, 500, 900, { font: 'Noto Sans', size: 40, align: 'center', color: '#3667a6' }),
          T('finding something good by chance', 140, 610, 800, { size: 44, italic: true, align: 'center', lh: 1.25 }),
        ],
      },
    ],
  },
];
