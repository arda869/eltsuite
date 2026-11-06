import { learnOrigin } from './site';
import { collectMedia, collectPictures, type MediaInfo, type MediaMap, type WsItem } from './worksheet';
import { loadManifest } from './archive';
import { audioUrl } from './media';
import { bakePicture } from '../editor/PicEdit';

// Pictures and QR codes for a printed worksheet, used by the PDF export and the worksheet view in the
// lesson editor, so both print the same thing.

// Uploaded pictures are read from the class first, with their sizes (the Word file needs them).
export async function sheetPictures(classId: string, items: WsItem[]): Promise<MediaMap> {
  const map: MediaMap = {};
  const pictures = collectPictures(items);
  // Draw the selected pages in order, keeping only one source PDF open at a time.
  const documents = new Map<string, {page:number;key:string;src:string}[]>();
  for (const {key,src} of pictures) {
    const match = /^pdf-page:(\d+):((?:media|file):.+)$/.exec(src);
    if (!match) continue;
    const pages = documents.get(match[2]) || [];
    pages.push({page:Number(match[1]),key,src});
    documents.set(match[2],pages);
  }
  for (const [src,pages] of documents) {
    const {loadPdf,openPdf} = await import('../pdf/pdfData');
    const pdf = await openPdf(await loadPdf(src,classId));
    try {
      for(const {page,key,src:pageRef} of pages) {
        const source = await pdf.getPage(page);
        const natural = source.getViewport({scale:1});
        const viewport = source.getViewport({scale:Math.min(2,1600/Math.max(natural.width,natural.height))});
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d')!;
        await source.render({canvasContext:ctx,viewport}).promise;
        if (key !== pageRef) {
          const {MARK_COLORS,inkColor} = await import('../pdf/colours');
          for (const mark of JSON.parse(key.slice(pageRef.length+1))) {
            if (mark.type === 'pdfMark') {
              ctx.fillStyle = (MARK_COLORS.find(c => c.k === mark.color) || MARK_COLORS[0]).bg;
              ctx.fillRect(mark.x*canvas.width,mark.y*canvas.height,mark.w*canvas.width,mark.h*canvas.height);
            } else if (Array.isArray(mark.pts) && mark.pts.length) {
              ctx.strokeStyle = inkColor(String(mark.color || 'ink'));
              ctx.lineWidth = 2*viewport.scale;
              ctx.lineCap = 'round'; ctx.lineJoin = 'round';
              ctx.beginPath();
              mark.pts.forEach(([x,y]:number[],i:number) => i ? ctx.lineTo(x*canvas.width,y*canvas.height) : ctx.moveTo(x*canvas.width,y*canvas.height));
              ctx.stroke();
            }
          }
        }
        map[key] = {data:canvas.toDataURL('image/jpeg',0.92),w:canvas.width,h:canvas.height};
        source.cleanup();
      }
    } finally {await pdf.destroy();}
  }
  await Promise.all(
    pictures.filter(({src})=>!src.startsWith('pdf-page:')).map(async ({ key, src, crop, filter }) => {
      const data = src.startsWith('media:') ? await audioUrl(classId, src.slice(6)).catch(() => '') : src;
      if (!data) return;
      // A cropped or recoloured picture, or one from the web: a copy made here.
      if (crop || filter || !src.startsWith('media:')) {
        const baked = await bakePicture(data, crop, filter);
        if (baked) map[key] = baked;
        if (baked || !src.startsWith('media:')) return;
      }
      const dims = await new Promise<{ w: number; h: number }>((res) => {
        const im = new Image();
        im.onload = () => res({ w: im.naturalWidth || 400, h: im.naturalHeight || 300 });
        im.onerror = () => res({ w: 400, h: 300 });
        im.src = data;
      });
      map[key] = { data, ...dims };
    }),
  );
  return map;
}

// Sounds and videos: a QR code to the page that plays them, and their scripts for the key.
export async function sheetSounds(classId: string, items: WsItem[], accentHex: string): Promise<Record<string, MediaInfo>> {
  const list = collectMedia(items);
  if (!list.length) return {};
  const QR = await import('qrcode');
  const accent = accentHex.replace('#', '');
  const out: Record<string, MediaInfo> = {};
  await Promise.all(
    list.map(async ({ id, mode }) => {
      const m = await loadManifest(classId, id).catch(() => null);
      if (!m) return;
      const url = `${learnOrigin()}/play/${classId}/${id}?c=${accent}${mode !== 'karaoke' ? `&s=${mode}` : ''}`;
      const look = { margin: 0, errorCorrectionLevel: 'M' as const, color: { dark: '#2b2a28', light: '#ffffff' } };
      const [svg, png] = await Promise.all([QR.toString(url, { ...look, type: 'svg' }), QR.toDataURL(url, { ...look, margin: 1, width: 320 })]);
      out[id] = { url, svg, png, title: m.title || 'Listening', video: !!m.video, script: (m.script ?? []).map((l) => l.text.trim()).filter(Boolean) };
    }),
  );
  return out;
}
