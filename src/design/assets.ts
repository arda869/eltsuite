import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PersonArt, Sketch, THINGS } from '../storyboard/art';
import { SCENES, sceneBox } from '../storyboard/scenes';
import type { DPage, El } from './model';
import { artKey } from './render';

const toImage = (svg: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });

// People and things from the storyboard library, as pictures to draw on a page, in the accent colour.
// The key matches render.ts's artKey, so the same drawing is found again.
const cache = new Map<string, Promise<HTMLImageElement>>();
export function artImage(e: El, accent: string): Promise<HTMLImageElement> {
  const col = e.accent ?? accent;
  const k = `${e.art}:${e.ref}:${e.pose ?? ''}:${e.face ?? ''}:${e.view ?? ''}:${col}`;
  if (!cache.has(k)) {
    const person = e.art === 'person';
    const thing = THINGS[e.ref ?? ''] ?? THINGS.table;
    const inner = person ? createElement(PersonArt, { who: e.ref, p: e.pose ?? 'stand', face: e.face ?? 'happy', view: e.view }) : thing.draw(e.view);
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: person ? '0 0 200 300' : '0 0 200 200', width: 400, height: person ? 600 : 400, style: { ['--sb-accent' as string]: col } }, createElement(Sketch, { id: 'd' + Math.random().toString(36).slice(2, 7), children: inner })),
    );
    const p = toImage(svg);
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return cache.get(k)!;
}

// A scene's backdrop, in the accent colour, drawn at twice its size so it stays crisp on the board.
export function sceneImage(key: string, accent: string): Promise<HTMLImageElement> {
  const k = `scene:${key}:${accent}`;
  if (!cache.has(k)) {
    const sc = SCENES[key];
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${sceneBox.w} ${sceneBox.h}`, width: sceneBox.w * 2, height: sceneBox.h * 2, style: { ['--sb-accent' as string]: accent } }, createElement(Sketch, { id: 's' + Math.random().toString(36).slice(2, 7), children: sc ? sc.draw() : null })),
    );
    const p = toImage(svg);
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return cache.get(k)!;
}

// Every drawn picture a set of pages needs (people, things, backdrops, QR codes), keyed the way
// render.ts looks them up. Pictures from the file's media are loaded separately.
export async function drawnImages(pages: Pick<DPage, 'scene'>[], els: Pick<El, 't' | 'art' | 'ref' | 'pose' | 'face' | 'view' | 'accent' | 'url'>[], accent: string, into: Map<string, CanvasImageSource> = new Map()) {
  const jobs: Promise<void>[] = [];
  for (const e of els) {
    if (e.t === 'art') {
      const k = artKey(e as El, accent);
      if (!into.has(k)) jobs.push(artImage(e as El, accent).then((im) => void into.set(k, im), () => {}));
    }
    if (e.t === 'qr' && e.url && !into.has('qr:' + e.url)) jobs.push(qrImage(e.url).then((im) => void into.set('qr:' + e.url, im), () => {}));
  }
  for (const p of pages) if (p.scene && p.scene !== 'plain' && !into.has(`scene:${p.scene}:${accent}`)) jobs.push(sceneImage(p.scene, accent).then((im) => void into.set(`scene:${p.scene}:${accent}`, im), () => {}));
  await Promise.all(jobs);
  return into;
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
  const p = { action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: q + filter, gsrnamespace: '6', gsrlimit: '30', gsroffset: String((page - 1) * 30), prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: '1000', iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ObjectName' };
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
      // Use the exact rendition returned by Commons; arbitrary thumbnail widths can fail.
      const big = i.thumburl!;
      const who = strip(m.Artist?.value);
      return { id: String(x.pageid), title: name, thumb: i.thumburl!, url: big, w: i.width, h: i.height, credit: `“${name}”${who ? ` by ${who}` : ''}, ${strip(m.LicenseShortName?.value) || 'see Wikimedia Commons'}, via Wikimedia Commons. Source: https://commons.wikimedia.org/?curid=${x.pageid}${m.LicenseUrl?.value ? '. Licence: '+strip(m.LicenseUrl.value) : ''}` };
    });
}
