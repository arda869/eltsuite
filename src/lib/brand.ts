import { currentOrg } from './admin';
import { auth } from './firebase';
import { MARK } from '../components/Wordmark';

// The brand that goes on files a teacher downloads: their organisation's logo (the long one if
// there is one) or ELT Suite's own mark and name. As a PNG, for Word files and PDFs.

export type Brand = { png: Uint8Array; dataUrl: string; w: number; h: number; name: string; color: string };

const toBytes = (dataUrl: string) => Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });

let cache: Promise<Brand> | null = null;
let cacheFor = '';
export function brandMark(): Promise<Brand> {
  const org = currentOrg();
  const key = org ? `${org.id}:${org.brand?.wide ?? ''}${org.brand?.logo ?? ''}` : 'elt';
  if (cache && cacheFor === key) return cache;
  cacheFor = key;
  cache = make();
  return cache;
}

async function make(): Promise<Brand> {
  const org = currentOrg();
  const color = org?.brand?.color || '#d98f63';
  const logo = org?.brand?.wide || org?.brand?.logo;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  if (logo) {
    const img = await loadImg(logo);
    const h = 120;
    const w = Math.max(1, Math.round((img.width / img.height) * h));
    c.width = w;
    c.height = h;
    g.drawImage(img, 0, 0, w, h);
  } else {
    // The mark, then "ELT Suite" in the app's serif.
    await document.fonts?.load('500 72px Fraunces').catch(() => {});
    const img = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(MARK(color)));
    const h = 120;
    g.font = '500 72px Fraunces, Georgia, serif';
    const tw = Math.ceil(g.measureText('ELT Suite').width);
    c.width = h + 28 + tw + 8;
    c.height = h;
    g.drawImage(img, 0, 0, h, h);
    g.font = '500 72px Fraunces, Georgia, serif';
    g.fillStyle = '#2b2a28';
    g.textBaseline = 'middle';
    g.fillText('ELT Suite', h + 28, h / 2 + 4);
  }
  const dataUrl = c.toDataURL('image/png');
  return { png: toBytes(dataUrl), dataUrl, w: c.width, h: c.height, name: org?.name ?? 'ELT Suite', color };
}

// Who made a file, on everything exported: the teacher by name, and a short note that the
// content is theirs and ELT Suite is the tool it was made with.
export function credit(): { by: string; note: string } {
  const name = (auth.currentUser?.displayName ?? '').trim();
  const org = currentOrg()?.name;
  const by = `${name ? `Prepared by ${name}` : 'Prepared'}${org ? ` · ${org}` : ''} · Made with ELT Suite`;
  const note = `The content of this material is the work of ${name || 'its author'}. ELT Suite provides the tools used to make it, and doesn’t review or endorse its content.`;
  return { by, note };
}
