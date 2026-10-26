import * as Y from 'yjs';
import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import type { JSONContent } from '@tiptap/react';

// Slides kept in a shared Yjs document. The slide canvas is 1000 × 562.5 units (16:9); each
// slide has a layout, a background and elements: text boxes, pictures and shapes.

export const W = 1000;
export const H = 562.5;
export type ElType = 'text' | 'image' | 'shape';
export type Shape = 'rect' | 'round' | 'ellipse' | 'line' | 'arrow';
export type TextSize = 's' | 'm' | 'l' | 'xl';
export type El = { id: string; type: ElType; x: number; y: number; w: number; h: number; size?: TextSize; align?: 'left' | 'center' | 'right'; role?: 'title' | 'body'; src?: string; shape?: Shape; fill?: string; stroke?: string; text?: Y.XmlFragment };
export type Slide = { id: string; layout: string; bg: string; owner?: string; ownerName?: string; els: El[] };
export type Bg = { k: string; label: string; bg: string; ink: string };
export const BGS: Bg[] = [
  { k: 'white', label: 'White', bg: '#ffffff', ink: '#2b2a28' },
  { k: 'paper', label: 'Paper', bg: '#faf7f2', ink: '#2b2a28' },
  { k: 'tint', label: 'Tint', bg: 'color-mix(in srgb, var(--accent) 12%, #fff)', ink: '#2b2a28' },
  { k: 'accent', label: 'Class colour', bg: 'var(--accent)', ink: '#ffffff' },
  { k: 'dark', label: 'Dark', bg: '#2b2a28', ink: '#ffffff' },
];
export const FILLS = ['accent', '#2b2a28', '#8a847d', '#e9e6e1', '#3d6fb6', '#7a5cb8', '#c7772f', '#b8508f', 'none'];
export const fillOf = (c?: string) => (c === 'accent' ? 'var(--accent)' : c === 'none' || !c ? 'transparent' : c);
// Text sizes in points on a 10-inch slide; on screen 1 pt = 1/7.2 of the slide width.
export const PT: Record<TextSize, number> = { s: 14, m: 18, l: 28, xl: 40 };

export const LAYOUTS: { k: string; label: string; els: Omit<El, 'id'>[] }[] = [
  {
    k: 'title',
    label: 'Title',
    els: [
      { type: 'text', role: 'title', x: 80, y: 190, w: 840, h: 110, size: 'xl', align: 'center' },
      { type: 'text', role: 'body', x: 160, y: 315, w: 680, h: 70, size: 'm', align: 'center' },
    ],
  },
  {
    k: 'text',
    label: 'Title and text',
    els: [
      { type: 'text', role: 'title', x: 60, y: 36, w: 880, h: 80, size: 'l' },
      { type: 'text', role: 'body', x: 60, y: 130, w: 880, h: 390, size: 'm' },
    ],
  },
  {
    k: 'two',
    label: 'Two columns',
    els: [
      { type: 'text', role: 'title', x: 60, y: 36, w: 880, h: 80, size: 'l' },
      { type: 'text', role: 'body', x: 60, y: 130, w: 425, h: 390, size: 'm' },
      { type: 'text', role: 'body', x: 515, y: 130, w: 425, h: 390, size: 'm' },
    ],
  },
  {
    k: 'pic',
    label: 'Picture and text',
    els: [
      { type: 'text', role: 'title', x: 60, y: 36, w: 880, h: 80, size: 'l' },
      { type: 'image', x: 60, y: 130, w: 425, h: 390 },
      { type: 'text', role: 'body', x: 515, y: 130, w: 425, h: 390, size: 'm' },
    ],
  },
  { k: 'blank', label: 'Blank', els: [] },
];

const rid = () => Math.random().toString(36).slice(2, 10);
export const slidesOf = (doc: Y.Doc) => doc.getArray<Y.Map<unknown>>('slides');

export function makeEl(e: Omit<El, 'id'> & { id?: string }): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set('id', e.id ?? rid());
  for (const [k, v] of Object.entries(e)) if (k !== 'id' && k !== 'text' && v !== undefined) m.set(k, v);
  if (e.type === 'text') m.set('text', new Y.XmlFragment());
  return m;
}
export function makeSlide(layout: string, owner?: { uid: string; name: string }): Y.Map<unknown> {
  const s = new Y.Map<unknown>();
  s.set('id', rid());
  s.set('layout', layout);
  s.set('bg', 'white');
  if (owner) s.set('owner', owner.uid), s.set('ownerName', owner.name);
  const els = new Y.Array<Y.Map<unknown>>();
  els.push((LAYOUTS.find((l) => l.k === layout)?.els ?? []).map((e) => makeEl(e)));
  s.set('els', els);
  return s;
}

export function readSlides(doc: Y.Doc): Slide[] {
  return slidesOf(doc)
    .toArray()
    .map((s) => ({
      id: String(s.get('id')),
      layout: String(s.get('layout') ?? 'blank'),
      bg: String(s.get('bg') ?? 'white'),
      owner: (s.get('owner') as string) || undefined,
      ownerName: (s.get('ownerName') as string) || undefined,
      els: ((s.get('els') as Y.Array<Y.Map<unknown>>)?.toArray() ?? []).map((m) => ({ ...(m.toJSON() as El), text: m.get('text') as Y.XmlFragment | undefined })),
    }));
}
export const textJSON = (f?: Y.XmlFragment): JSONContent => (f ? (yXmlFragmentToProsemirrorJSON(f) as JSONContent) : { type: 'doc', content: [] });
export const isEmptyText = (f?: Y.XmlFragment) => !f || !textJSON(f).content?.some((p) => (p.content ?? []).length > 0);

export const slideMap = (doc: Y.Doc, id: string) => slidesOf(doc).toArray().find((s) => s.get('id') === id);
export const elMap = (doc: Y.Doc, slideId: string, elId: string) => ((slideMap(doc, slideId)?.get('els') as Y.Array<Y.Map<unknown>>)?.toArray() ?? []).find((m) => m.get('id') === elId);
