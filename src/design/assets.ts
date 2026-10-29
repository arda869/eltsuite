import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PersonArt, Sketch, THINGS } from '../storyboard/art';
import type { El } from './model';

// People and things from the storyboard library, as pictures to draw on a page, in the accent colour.
const cache = new Map<string, Promise<HTMLImageElement>>();
export function artImage(e: El, accent: string): Promise<HTMLImageElement> {
  const col = e.accent ?? accent;
  const k = `${e.art}:${e.ref}:${e.pose ?? ''}:${e.face ?? ''}:${col}`;
  if (!cache.has(k)) {
    const person = e.art === 'person';
    const inner = person ? createElement(PersonArt, { who: e.ref, p: e.pose ?? 'stand', face: e.face ?? 'happy' }) : (THINGS[e.ref ?? ''] ?? THINGS.table).draw();
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: person ? '0 0 200 300' : '0 0 200 200', width: person ? 400 : 400, height: person ? 600 : 400, style: { ['--sb-accent' as string]: col } }, createElement(Sketch, { id: 'd' + Math.random().toString(36).slice(2, 7), children: inner })),
    );
    cache.set(
      k,
      new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      }),
    );
  }
  return cache.get(k)!;
}

// A QR code to a link: a recording, a video or a web page.
const qrs = new Map<string, Promise<HTMLImageElement>>();
export function qrImage(url: string): Promise<HTMLImageElement> {
  if (!qrs.has(url))
    qrs.set(
      url,
      import('qrcode').then(
        (QR) =>
          QR.toDataURL(url, { margin: 0, width: 480, errorCorrectionLevel: 'M', color: { dark: '#262420', light: '#ffffff' } }).then(
            (src) =>
              new Promise<HTMLImageElement>((res, rej) => {
                const im = new Image();
                im.onload = () => res(im);
                im.onerror = rej;
                im.src = src;
              }),
          ),
      ),
    );
  return qrs.get(url)!;
}

// ------------------------------------------------------------------ pictures from the web

// Openverse: openly licensed pictures, with who made them and their licence, to credit on the page.
export type WebPic = { id: string; title: string; thumb: string; url: string; credit: string; w?: number; h?: number };
export async function searchPictures(q: string, page = 1, kind: '' | 'illustration' | 'photograph' = ''): Promise<WebPic[]> {
  const u = new URL('https://api.openverse.org/v1/images/');
  u.searchParams.set('q', q);
  u.searchParams.set('page_size', '30');
  u.searchParams.set('page', String(page));
  u.searchParams.set('mature', 'false');
  if (kind) u.searchParams.set('category', kind);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error('search');
  const j = (await r.json()) as { results: { id: string; title?: string; thumbnail?: string; url: string; creator?: string; license: string; license_version?: string; width?: number; height?: number }[] };
  return j.results.map((x) => ({
    id: x.id,
    title: x.title ?? '',
    thumb: x.thumbnail ?? `https://api.openverse.org/v1/images/${x.id}/thumb/`,
    url: x.url,
    w: x.width,
    h: x.height,
    credit: `${x.title ? `“${x.title}”` : 'Picture'}${x.creator ? ` by ${x.creator}` : ''}, ${x.license.toUpperCase() === 'CC0' || x.license === 'pdm' ? (x.license === 'pdm' ? 'public domain' : 'CC0') : `CC ${x.license.toUpperCase()} ${x.license_version ?? ''}`.trim()}`,
  }));
}
