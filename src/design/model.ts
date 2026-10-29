import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { audioUrl, saveImage } from '../lib/media';

// Design: pictures, posters, flashcards and worksheets made of pages, each with things on it
// (pictures, text, shapes, drawings, labels…). Every thing is its own record, so everyone the file is
// shared with for editing works on it at the same time and sees the others' changes straight away.
// Pictures are kept in the file's own media.

export type ElType = 'image' | 'text' | 'shape' | 'path' | 'art' | 'label' | 'cover' | 'wordbank' | 'qr' | 'lines';
export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star' | 'heart' | 'line' | 'arrow' | 'double' | 'speech' | 'thought' | 'shout' | 'cloud' | 'banner' | 'tick' | 'cross';
export type Fx = { bright?: number; contrast?: number; sat?: number; blur?: number; gray?: number; sepia?: number; hue?: number; invert?: number };
export type Crop = { x: number; y: number; w: number; h: number }; // parts of the picture, 0–1

export type El = {
  id: string;
  page: string;
  t: ElType;
  z: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
  locked?: boolean;
  hidden?: boolean;
  name?: string;
  ver?: 'A' | 'B'; // only on learner A's or B's copy
  // pictures
  img?: string; // media id; none: a frame to put a picture in
  iw?: number; // the picture's own size
  ih?: number;
  crop?: Crop;
  fx?: Fx;
  radius?: number;
  border?: number;
  borderC?: string;
  shadow?: boolean;
  credit?: string; // who made a picture from the web, and its licence
  // text, and text inside shapes and labels
  text?: string;
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  color?: string;
  lh?: number;
  ls?: number;
  upper?: boolean;
  hl?: string; // highlight behind the words
  outline?: number;
  outlineC?: string;
  // shapes
  shape?: ShapeKind;
  fill?: string;
  stroke?: string;
  sw?: number;
  dash?: 'solid' | 'dash' | 'dot';
  // drawing
  pts?: number[]; // x, y, pressure, … in 0–1 of the box
  pen?: 'pen' | 'marker' | 'highlighter';
  // people and things
  art?: 'person' | 'thing';
  ref?: string;
  pose?: string;
  face?: string;
  accent?: string;
  // labels: the point they name, on the page
  ax?: number;
  ay?: number;
  pin?: 'number' | 'dot' | 'none';
  // covers
  mode?: 'blur' | 'pixel' | 'solid' | 'mystery';
  amount?: number;
  // word bank
  title?: string;
  // QR code
  url?: string;
  // writing lines
  gap?: number;
};

export type DPage = { id: string; order: number; w: number; h: number; bg: string; name?: string };
export type DMeta = { accent?: string };

export const pagesCol = (id: string) => collection(db, 'sharedDocs', id, 'dpages');
export const elsCol = (id: string) => collection(db, 'sharedDocs', id, 'dels');
export const metaRef = (id: string) => doc(db, 'sharedDocs', id, 'dmeta', 'main');

export function useDesign(id: string) {
  const [pages, setPages] = useState<DPage[] | null>(null);
  const [els, setEls] = useState<El[]>([]);
  const [meta, setMeta] = useState<DMeta>({});
  useEffect(() => {
    const u1 = onSnapshot(pagesCol(id), (s) => setPages(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DPage, 'id'>) })).sort((a, b) => a.order - b.order)), () => setPages([]));
    const u2 = onSnapshot(elsCol(id), (s) => setEls(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<El, 'id'>) }))), () => {});
    const u3 = onSnapshot(metaRef(id), (s) => setMeta((s.data() as DMeta) ?? {}), () => {});
    return () => (u1(), u2(), u3());
  }, [id]);
  return { pages, els, meta };
}

export const clean = <T,>(o: T) => JSON.parse(JSON.stringify(o)) as T;
export const saveMeta = (id: string, m: DMeta) => setDoc(metaRef(id), clean(m), { merge: true });

// ------------------------------------------------------------------ sizes

export const MM = 96 / 25.4;
export type SizeKey = 'a4' | 'a4l' | 'a5' | 'a3' | 'letter' | 'slide' | 'square' | 'story' | 'card' | 'banner';
export const SIZES: { k: SizeKey; name: string; about: string; w: number; h: number }[] = [
  { k: 'a4', name: 'A4 worksheet', about: '210 × 297 mm', w: 794, h: 1123 },
  { k: 'a4l', name: 'A4 landscape', about: '297 × 210 mm', w: 1123, h: 794 },
  { k: 'a5', name: 'A5 handout', about: '148 × 210 mm', w: 559, h: 794 },
  { k: 'a3', name: 'A3 poster', about: '297 × 420 mm', w: 1123, h: 1587 },
  { k: 'letter', name: 'US Letter', about: '8.5 × 11 in', w: 816, h: 1056 },
  { k: 'slide', name: 'Slide', about: '16:9, for the board', w: 1280, h: 720 },
  { k: 'square', name: 'Square post', about: '1080 × 1080', w: 1080, h: 1080 },
  { k: 'story', name: 'Phone story', about: '1080 × 1920', w: 1080, h: 1920 },
  { k: 'card', name: 'Flashcard', about: 'A6, 148 × 105 mm', w: 559, h: 397 },
  { k: 'banner', name: 'Classroom banner', about: '3:1, for the wall', w: 1500, h: 500 },
];

// ------------------------------------------------------------------ fonts

// Fonts for teaching: clear ones for reading, school handwriting, and display faces for posters.
export const FONTS: { f: string; group: string; about?: string }[] = [
  { f: 'Fraunces', group: 'House' },
  { f: 'Karla', group: 'House' },
  { f: 'Atkinson Hyperlegible', group: 'Easy to read', about: 'clear letters for every reader' },
  { f: 'Andika', group: 'Easy to read', about: 'made for learning to read' },
  { f: 'Lexend', group: 'Easy to read' },
  { f: 'Nunito', group: 'Easy to read' },
  { f: 'Playpen Sans', group: 'Handwriting', about: 'joined-up feel, for young learners' },
  { f: 'Kalam', group: 'Handwriting' },
  { f: 'Patrick Hand', group: 'Handwriting' },
  { f: 'Caveat', group: 'Handwriting' },
  { f: 'Schoolbell', group: 'Handwriting' },
  { f: 'Gloria Hallelujah', group: 'Handwriting' },
  { f: 'Permanent Marker', group: 'Handwriting' },
  { f: 'Baloo 2', group: 'Display' },
  { f: 'Fredoka', group: 'Display' },
  { f: 'Lilita One', group: 'Display' },
  { f: 'Bebas Neue', group: 'Display' },
  { f: 'Anton', group: 'Display' },
  { f: 'Abril Fatface', group: 'Display' },
  { f: 'Pacifico', group: 'Display' },
  { f: 'Playfair Display', group: 'Classic' },
  { f: 'Merriweather', group: 'Classic' },
  { f: 'Lora', group: 'Classic' },
  { f: 'Montserrat', group: 'Modern' },
  { f: 'Poppins', group: 'Modern' },
  { f: 'Inter', group: 'Modern' },
  { f: 'Space Grotesk', group: 'Modern' },
  { f: 'Noto Sans', group: 'Every language', about: 'Arabic, Cyrillic, Greek and more' },
];
const loaded = new Map<string, Promise<void>>();
export function ensureFont(f: string): Promise<void> {
  if (!loaded.has(f)) {
    loaded.set(
      f,
      (async () => {
        if (!['Fraunces', 'Karla', 'Kalam', 'Atkinson Hyperlegible', 'Noto Sans'].includes(f)) {
          const l = document.createElement('link');
          l.rel = 'stylesheet';
          l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
          document.head.append(l);
          await new Promise((r) => ((l.onload = r), (l.onerror = r)));
          // Fonts with no italic or bold: ask again for what there is.
          if (!(await document.fonts.load(`16px "${f}"`)).length) {
            const l2 = document.createElement('link');
            l2.rel = 'stylesheet';
            l2.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}&display=swap`;
            document.head.append(l2);
            await new Promise((r) => ((l2.onload = r), (l2.onerror = r)));
          }
        }
        await Promise.all([document.fonts.load(`16px "${f}"`), document.fonts.load(`bold 16px "${f}"`), document.fonts.load(`italic 16px "${f}"`)]).catch(() => {});
      })(),
    );
  }
  return loaded.get(f)!;
}

// ------------------------------------------------------------------ colours

export const SWATCHES = ['#262420', '#66615b', '#a9a49d', '#ecebe7', '#ffffff', '#c8764a', '#b64a3c', '#d9a23a', '#4f7a55', '#2f7a7a', '#3667a6', '#5b54c9', '#8b3d6b', '#e8b4b8', '#f3e3b5', '#cfe3d1', '#cfe0ef', '#ddd6f3'];

// ------------------------------------------------------------------ pictures

// Shrunk to fit the file's media: PNG when it has see-through parts, JPEG otherwise.
export async function storePicture(designId: string, file: Blob): Promise<{ id: string; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const probe = document.createElement('canvas');
  probe.width = Math.min(64, bmp.width);
  probe.height = Math.min(64, bmp.height);
  const pg = probe.getContext('2d')!;
  pg.drawImage(bmp, 0, 0, probe.width, probe.height);
  const px = pg.getImageData(0, 0, probe.width, probe.height).data;
  let alpha = false;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) (alpha = true), (i = px.length);
  let max = 2200;
  for (let k = 0; k < 8; k++) {
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    const g = c.getContext('2d')!;
    if (!alpha) (g.fillStyle = '#fff'), g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), alpha ? 'image/png' : 'image/jpeg', 0.86));
    if (blob.size < 560 * 1024) return { id: await saveImage('doc:' + designId, blob), w: c.width, h: c.height };
    max = Math.round(max * 0.78);
  }
  throw new Error('too-big');
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
export function loadPicture(designId: string, id: string): Promise<HTMLImageElement> {
  const k = designId + '/' + id;
  if (!imgCache.has(k)) {
    const p = audioUrl('doc:' + designId, id).then(
      (src) =>
        new Promise<HTMLImageElement>((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.src = src;
        }),
    );
    p.catch(() => imgCache.delete(k));
    imgCache.set(k, p);
  }
  return imgCache.get(k)!;
}

// A picture from a web address or a data URL, as a file to store.
export async function blobOf(src: string): Promise<Blob> {
  const r = await fetch(src, { mode: 'cors' });
  if (!r.ok) throw new Error('fetch');
  return r.blob();
}

// ------------------------------------------------------------------ defaults

export const TEXT_STYLES: { k: string; name: string; el: Partial<El> }[] = [
  { k: 'title', name: 'Add a title', el: { text: 'Add a title', font: 'Fraunces', size: 64, bold: true, lh: 1.1 } },
  { k: 'heading', name: 'Add a heading', el: { text: 'Add a heading', font: 'Karla', size: 34, bold: true, lh: 1.2 } },
  { k: 'body', name: 'Add some text', el: { text: 'Add some text', font: 'Fraunces', size: 20, lh: 1.5 } },
  { k: 'instruction', name: 'An instruction', el: { text: 'Look at the picture. Write the words.', font: 'Karla', size: 22, bold: true, lh: 1.35 } },
  { k: 'kicker', name: 'A small label', el: { text: 'UNIT 4 · B1', font: 'Karla', size: 15, bold: true, ls: 2, upper: true, color: '#c8764a' } },
  { k: 'hand', name: 'Handwriting', el: { text: 'Well done!', font: 'Playpen Sans', size: 44, lh: 1.2 } },
];

export const baseText: Partial<El> = { font: 'Fraunces', size: 22, color: '#262420', align: 'left', lh: 1.4, valign: 'top' };
