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

// Wikimedia Commons: openly licensed photos and drawings, with who made them and their licence, to
// credit on the page.
export type WebPic = { id: string; title: string; thumb: string; url: string; credit: string; w?: number; h?: number };
const strip = (h = '') => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
export async function searchPictures(q: string, page = 1, kind: '' | 'illustration' | 'photograph' = ''): Promise<WebPic[]> {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  const filter = kind === 'illustration' ? ' filetype:drawing' : kind === 'photograph' ? ' filetype:bitmap' : '';
  const p = { action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: q + filter, gsrnamespace: '6', gsrlimit: '30', gsroffset: String((page - 1) * 30), prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: '360', iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ObjectName' };
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error('search');
  type Info = { url: string; thumburl?: string; width: number; height: number; mime: string; extmetadata?: Record<string, { value: string }> };
  const j = (await r.json()) as { query?: { pages: Record<string, { pageid: number; title: string; index?: number; imageinfo?: Info[] }> } };
  return Object.values(j.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((x) => x.imageinfo?.[0]?.thumburl && /image\/(jpeg|png|svg|gif|webp)/.test(x.imageinfo[0].mime))
    .map((x) => {
      const i = x.imageinfo![0];
      const m = i.extmetadata ?? {};
      const name = strip(m.ObjectName?.value) || x.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '');
      const big = i.mime === 'image/svg+xml' || i.width > 1800 ? i.thumburl!.replace(/\/\d+px-/, '/1800px-') : i.url;
      const who = strip(m.Artist?.value);
      return { id: String(x.pageid), title: name, thumb: i.thumburl!, url: big, w: i.width, h: i.height, credit: `“${name}”${who ? ` by ${who}` : ''}, ${strip(m.LicenseShortName?.value) || 'see Wikimedia Commons'}, via Wikimedia Commons. Source: https://commons.wikimedia.org/?curid=${x.pageid}${m.LicenseUrl?.value ? '. Licence: '+strip(m.LicenseUrl.value) : ''}` };
    });
}
