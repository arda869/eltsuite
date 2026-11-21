import { openPdf } from '../pdf/pdfData';
import { monoContours } from './monoPrint';

export type PdfSlice = { bytes: Uint8Array; from?: number; through?: number; repeat?: number };

/** Merge rendered pages without reading or changing the source PDFs. */
export async function mergePrintPdfs(slices: PdfSlice[], paper: 'a4' | 'letter', monochrome: boolean): Promise<{ bytes: Uint8Array; pages: number }> {
  const { jsPDF } = await import('jspdf');
  let out: import('jspdf').jsPDF | null = null;
  let count = 0;
  for (const slice of slices) {
    const source = await openPdf(slice.bytes.slice());
    const first = Math.max(1, slice.from ?? 1);
    const last = Math.min(source.numPages, slice.through ?? source.numPages);
    for (let copy = 0; copy < (slice.repeat ?? 1); copy++) {
      for (let number = first; number <= last; number++) {
        const page = await source.getPage(number);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Your browser could not draw the print pack.');
        await page.render({ canvasContext: context, viewport }).promise;
        if (monochrome) monoContours(context, canvas.width, canvas.height);
        const portrait = viewport.height >= viewport.width;
        if (!out) out = new jsPDF({ unit: 'mm', format: paper, orientation: portrait ? 'portrait' : 'landscape', compress: true });
        else out.addPage(paper, portrait ? 'portrait' : 'landscape');
        count++;
        const width = out.internal.pageSize.getWidth(), height = out.internal.pageSize.getHeight();
        const scale = Math.min(width / canvas.width, height / canvas.height);
        const drawW = canvas.width * scale, drawH = canvas.height * scale;
        out.addImage(canvas.toDataURL(monochrome ? 'image/png' : 'image/jpeg', .88), monochrome ? 'PNG' : 'JPEG', (width - drawW) / 2, (height - drawH) / 2, drawW, drawH, undefined, 'FAST');
        canvas.width = 0; canvas.height = 0;
      }
    }
    await source.destroy();
  }
  if (!count || !out) throw new Error('Choose at least one printable page.');
  return { bytes: new Uint8Array(out.output('arraybuffer')), pages: count };
}
