// A worksheet as a real PDF: the worksheet page is laid out in a hidden frame, exactly as it
// prints, then each page is drawn onto a PDF page of the same paper size.

export async function worksheetPdf(html: string, paper: 'A4' | 'Letter' | 'A5' = 'A4'): Promise<Uint8Array> {
  const [{ jsPDF }, h2i] = await Promise.all([import('jspdf'), import('html-to-image')]);
  const f = document.createElement('iframe');
  // On the page so it lays out, clipped so nobody sees it.
  f.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:1300px;border:0;z-index:-1;clip-path:inset(0 0 100% 0);pointer-events:none';
  f.setAttribute('aria-hidden', 'true');
  document.body.append(f);
  try {
    const d = f.contentDocument!;
    d.open();
    d.write(html);
    d.close();
    const w = f.contentWindow as unknown as { __laidOut?: boolean };
    const t0 = Date.now();
    while (!w.__laidOut && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 120));
    await d.fonts.ready;
    await Promise.all([...d.images].map((i) => (i.complete ? null : new Promise((r) => ((i.onload = r), (i.onerror = r))))));
    // The pages sit centred on a grey desk on screen; for the picture each is taken on its own, with
    // no margin around it, or the PDF page would start with a strip of white and lose its right edge.
    const st = d.createElement('style');
    st.textContent = 'body { padding: 0 !important; background: #fff !important; } .page { margin: 0 !important; box-shadow: none !important; } .toolbar { display: none !important; }';
    d.head.append(st);
    const pages = [...d.querySelectorAll<HTMLElement>('.page')];
    if (!pages.length) throw new Error('The worksheet has no pages yet.');
    const size: [number, number] = paper === 'Letter' ? [215.9, 279.4] : paper === 'A5' ? [148, 210] : [210, 297];
    const pdf = new jsPDF({ unit: 'mm', format: paper.toLowerCase() });
    for (let i = 0; i < pages.length; i++) {
      // The browser draws the page itself (through SVG), so every colour and font comes out as on screen.
      const r = pages[i].getBoundingClientRect();
      const jpg = await h2i.toJpeg(pages[i], { pixelRatio: 2, quality: 0.92, backgroundColor: '#ffffff', cacheBust: false, width: Math.round(r.width), height: Math.round(r.height), style: { margin: '0', boxShadow: 'none', transform: 'none' } });
      if (i) pdf.addPage();
      pdf.addImage(jpg, 'JPEG', 0, 0, size[0], size[1]);
    }
    return new Uint8Array(pdf.output('arraybuffer'));
  } finally {
    f.remove();
  }
}

export const pdfName = (...parts: (string | undefined | false)[]) =>
  parts
    .filter(Boolean)
    .map((p) => String(p).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ')
    .slice(0, 110) || 'Worksheet';

// html2canvas cannot read colours written as color(srgb …), which is how browsers report
// color-mix(). Before the picture is taken, every such colour is written out as rgb().
const PROPS = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow', 'text-shadow', 'fill', 'stroke', 'text-decoration-color', 'column-rule-color', 'caret-color'];
const toRgb = (v: string) =>
  v.replace(/color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+%?))?\)/g, (_m, r, g, b, a) => {
    const c = (x: string) => Math.round(Math.max(0, Math.min(1, Number(x))) * 255);
    const al = a === undefined ? 1 : a.endsWith('%') ? Number(a.slice(0, -1)) / 100 : Number(a);
    return al >= 1 ? `rgb(${c(r)}, ${c(g)}, ${c(b)})` : `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${al})`;
  });
export function plainColours(doc: Document) {
  const win = doc.defaultView;
  if (!win) return;
  for (const el of Array.from(doc.querySelectorAll<HTMLElement | SVGElement>('*'))) {
    const cs = win.getComputedStyle(el);
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (v && v.includes('color(')) el.style.setProperty(p, toRgb(v), 'important');
    }
  }
}
