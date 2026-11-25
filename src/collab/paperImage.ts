// A piece of the printed page as a picture, for the Word download: questions and anything else Word
// can't hold as text keep their printed look. The print engine draws it in a hidden frame, in the
// document's font, at the width of the page's writing area.

let css: Promise<string> | null = null;
function sheetStyles() {
  css ??= import('../lib/worksheetHtml').then(({ sheetCss }) =>
    sheetCss({ header: false, key: false, qr: true, paper: 'A4', columns: 1, origin: location.origin }).replace(/@page[^}]*}/g, ''),
  );
  return css;
}

export async function paperPng(html: string, font: string, widthPx: number): Promise<{ png: Uint8Array; w: number; h: number } | null> {
  const [style, { default: html2canvas }, { plainColours }] = await Promise.all([sheetStyles(), import('html2canvas'), import('../lib/pdfMake')]);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;height:2000px;border:0`;
  document.body.appendChild(frame);
  try {
    const d = frame.contentDocument!;
    const family = JSON.stringify(font);
    d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><style>${style.replace(/@font-face[^}]*Fraunces[^}]*}/g, '').replace(/\bFraunces\b/g, family.slice(1, -1))}
html, body { background: #fff !important; padding: 0 !important; margin: 0 !important; width: ${widthPx}px; }
body { font-family: ${family}, Georgia, serif; }
.doc-worksheet { padding: 2px 0; display: flow-root; }</style></head><body>${html}</body></html>`);
    d.close();
    await d.fonts?.ready;
    await new Promise((r) => setTimeout(r, 30));
    plainColours(d);
    const el = d.querySelector<HTMLElement>('.doc-worksheet') ?? d.body;
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true, windowWidth: widthPx });
    if (!canvas.width || !canvas.height) return null;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return null;
    return { png: new Uint8Array(await blob.arrayBuffer()), w: canvas.width / 2, h: canvas.height / 2 };
  } catch {
    return null;
  } finally {
    frame.remove();
  }
}
