import { unzipSync, strFromU8 } from 'fflate';
import { imageToData } from './flash';

// A Word file (.docx) turned into a Collab document: headings, paragraphs and their alignment,
// bold, italic, underline, strikethrough and highlight, lists, tables, pictures and links.
// What a Collab document can't hold is left out, and named so the teacher knows.

export type DocxResult = { html: string; title: string; lost: string[] };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kids = (el: Element | null | undefined) => (el ? Array.from(el.children) : []);
const kid = (el: Element | null | undefined, name: string) => kids(el).find((c) => c.nodeName === name) ?? null;
const val = (el: Element | null | undefined) => el?.getAttribute('w:val') ?? null;
const off = (el: Element | null) => !!el && ['0', 'false', 'none'].includes(val(el) ?? '');
const on = (el: Element | null) => !!el && !off(el);

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' };

export async function docxToHtml(file: Blob, name = ''): Promise<DocxResult> {
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const text = (p: string) => (zip[p] ? strFromU8(zip[p]) : '');
  const xml = (p: string) => (zip[p] ? new DOMParser().parseFromString(text(p), 'application/xml') : null);
  const body = xml('word/document.xml')?.getElementsByTagName('w:body')[0];
  if (!body) throw new Error('not a Word file');
  const lost = new Set<string>();

  // Links and pictures are found through the relationships.
  const rels = new Map<string, { target: string; type: string; external: boolean }>();
  for (const r of Array.from(xml('word/_rels/document.xml.rels')?.getElementsByTagName('Relationship') ?? []))
    rels.set(r.getAttribute('Id') ?? '', { target: r.getAttribute('Target') ?? '', type: r.getAttribute('Type') ?? '', external: r.getAttribute('TargetMode') === 'External' });
  if ([...rels.values()].some((r) => /\/(header|footer)$/.test(r.type))) lost.add('Headers and footers');

  // Which styles are headings, and which are lists.
  const heads = new Map<string, number>();
  const styleNum = new Map<string, { numId: string; lvl: number }>();
  const basedOn = new Map<string, string>();
  let titleStyle = '';
  for (const s of Array.from(xml('word/styles.xml')?.getElementsByTagName('w:style') ?? [])) {
    const id = s.getAttribute('w:styleId') ?? '';
    const b = val(kid(s, 'w:basedOn'));
    if (b) basedOn.set(id, b);
    const snp = kid(kid(s, 'w:pPr'), 'w:numPr');
    if (snp && val(kid(snp, 'w:numId'))) styleNum.set(id, { numId: val(kid(snp, 'w:numId'))!, lvl: Number(val(kid(snp, 'w:ilvl')) ?? 0) });
    const nm = (val(kid(s, 'w:name')) ?? '').toLowerCase();
    const m = /^heading (\d)$/.exec(nm) ?? /^Heading(\d)$/.exec(id);
    if (m) heads.set(id, Math.min(3, Number(m[1])));
    else if (nm === 'title') (heads.set(id, 1), (titleStyle = id));
    else if (nm === 'subtitle') heads.set(id, 2);
    const lvl = val(kid(kid(s, 'w:pPr'), 'w:outlineLvl'));
    if (lvl != null && !heads.has(id) && Number(lvl) < 3) heads.set(id, Number(lvl) + 1);
  }

  // A list style can come from the style the paragraph's style is based on.
  const numOfStyle = (id: string) => {
    for (let k = 0, at = id; at && k < 10; k++, at = basedOn.get(at) ?? '') if (styleNum.has(at)) return styleNum.get(at)!;
    return null;
  };
  // With a title in the Title style, Word's headings come one level under it.
  const shift = !!titleStyle && text('word/document.xml').includes(`w:val="${titleStyle}"`);

  // Numbered or bulleted, for each list and level.
  const abstract = new Map<string, Map<number, string>>();
  const numDoc = xml('word/numbering.xml');
  for (const a of Array.from(numDoc?.getElementsByTagName('w:abstractNum') ?? [])) {
    const lv = new Map<number, string>();
    for (const l of kids(a).filter((c) => c.nodeName === 'w:lvl')) lv.set(Number(l.getAttribute('w:ilvl')), val(kid(l, 'w:numFmt')) ?? 'bullet');
    abstract.set(a.getAttribute('w:abstractNumId') ?? '', lv);
  }
  const nums = new Map<string, Map<number, string>>();
  for (const n of Array.from(numDoc?.getElementsByTagName('w:num') ?? [])) nums.set(n.getAttribute('w:numId') ?? '', abstract.get(val(kid(n, 'w:abstractNumId')) ?? '') ?? new Map());
  const listType = (numId: string, lvl: number) => {
    const f = nums.get(numId)?.get(lvl) ?? 'bullet';
    if (f === 'bullet' || f === 'none') return { tag: 'ul', type: '' };
    return { tag: 'ol', type: f === 'lowerLetter' ? 'a' : f === 'upperLetter' ? 'A' : f === 'lowerRoman' ? 'i' : f === 'upperRoman' ? 'I' : '1' };
  };

  // Pictures, made smaller as pictures in documents are.
  const pics = new Map<string, string>();
  const picture = async (rid: string) => {
    if (pics.has(rid)) return pics.get(rid)!;
    const r = rels.get(rid);
    const path = r && !r.external ? 'word/' + r.target.replace(/^\/?word\//, '').replace(/^\//, '') : '';
    const bytes = path ? zip[path.replace(/\/\.\//g, '/')] : undefined;
    const ext = (/\.([a-z]+)$/i.exec(path)?.[1] ?? '').toLowerCase();
    let src = '';
    if (bytes && MIME[ext]) {
      const blob = new Blob([bytes.slice()], { type: MIME[ext] });
      src = ext === 'svg' || ext === 'gif' ? await blobUrl(blob) : await imageToData(blob, 1100).catch(() => '');
    } else lost.add('Some kinds of picture (for example, drawings and old Word pictures)');
    pics.set(rid, src);
    return src;
  };

  // The words in a paragraph, with their marks.
  const runs = async (el: Element): Promise<string> => {
    let out = '';
    for (const c of kids(el)) {
      switch (c.nodeName) {
        case 'w:r':
          out += await run(c);
          break;
        case 'w:hyperlink': {
          const r = rels.get(c.getAttribute('r:id') ?? '');
          const inner = await runs(c);
          out += r?.external && /^(https?|mailto):/i.test(r.target) ? `<a href="${esc(r.target)}">${inner}</a>` : inner;
          break;
        }
        case 'w:ins':
        case 'w:smartTag':
        case 'w:fldSimple':
        case 'w:customXml':
        case 'w:bdo':
        case 'w:dir':
          out += await runs(c);
          break;
        case 'w:sdt':
          out += await runs(kid(c, 'w:sdtContent') ?? c);
          break;
        case 'w:del':
          lost.add('Tracked changes (we kept the text as it is now)');
          break;
        case 'm:oMath':
        case 'm:oMathPara':
          lost.add('Equations');
          break;
        case 'w:commentRangeStart':
          lost.add('Comments');
          break;
      }
    }
    return out;
  };
  const run = async (r: Element) => {
    const pr = kid(r, 'w:rPr');
    let s = '';
    for (const c of kids(r)) {
      switch (c.nodeName) {
        case 'w:t':
          s += esc(c.textContent ?? '');
          break;
        case 'w:tab':
          s += '&emsp;';
          break;
        case 'w:br':
          if (c.getAttribute('w:type') === 'page') lost.add('Page breaks');
          else s += '<br>';
          break;
        case 'w:noBreakHyphen':
          s += '‑';
          break;
        case 'w:sym':
          lost.add('Some symbols');
          break;
        case 'w:footnoteReference':
        case 'w:endnoteReference':
          lost.add('Footnotes and endnotes');
          break;
        case 'w:drawing':
        case 'w:pict':
        case 'mc:AlternateContent': {
          if (c.getElementsByTagName('w:txbxContent').length) lost.add('Text boxes');
          if (c.getElementsByTagName('c:chart').length || c.getElementsByTagName('dgm:relIds').length) lost.add('Charts and SmartArt');
          const blip = c.getElementsByTagName('a:blip')[0];
          const rid = blip?.getAttribute('r:embed') ?? c.getElementsByTagName('v:imagedata')[0]?.getAttribute('r:id');
          if (rid) {
            const src = await picture(rid);
            if (src) s += `<img src="${src}" alt="">`;
          } else if (c.nodeName !== 'mc:AlternateContent' && !c.getElementsByTagName('w:txbxContent').length) lost.add('Shapes and drawings');
          if (c.getElementsByTagName('wp:anchor').length) lost.add('The exact place of pictures that float beside text');
          break;
        }
      }
    }
    if (!s || !pr) return s;
    if (pr.getElementsByTagName('w:vertAlign').length && val(kid(pr, 'w:vertAlign')) !== 'baseline') lost.add('Small raised or lowered text (superscript and subscript)');
    if (kid(pr, 'w:rFonts') || kid(pr, 'w:sz') || kid(pr, 'w:color')) lost.add('Fonts, text sizes and text colours');
    if (on(kid(pr, 'w:b'))) s = `<strong>${s}</strong>`;
    if (on(kid(pr, 'w:i'))) s = `<em>${s}</em>`;
    if (on(kid(pr, 'w:u'))) s = `<u>${s}</u>`;
    if (on(kid(pr, 'w:strike')) || on(kid(pr, 'w:dstrike'))) s = `<s>${s}</s>`;
    if (kid(pr, 'w:highlight') && !off(kid(pr, 'w:highlight'))) s = `<mark>${s}</mark>`;
    else if (kid(pr, 'w:shd') && !['auto', 'FFFFFF', null].includes(kid(pr, 'w:shd')!.getAttribute('w:fill'))) s = `<mark>${s}</mark>`;
    return s;
  };

  // A paragraph: its kind (heading or text), alignment, and whether it is in a list.
  const para = async (p: Element) => {
    const pr = kid(p, 'w:pPr');
    const style = val(kid(pr, 'w:pStyle')) ?? '';
    const lvlOut = val(kid(pr, 'w:outlineLvl'));
    let h = heads.get(style) ?? (lvlOut != null && Number(lvlOut) < 3 ? Number(lvlOut) + 1 : 0);
    if (h && shift && style !== titleStyle) h = Math.min(3, h + 1);
    const jc = val(kid(pr, 'w:jc'));
    const align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' || jc === 'distribute' ? 'justify' : '';
    const np = kid(pr, 'w:numPr');
    const numId = val(kid(np, 'w:numId'));
    const fromStyle = numOfStyle(style);
    const list = np && numId ? (numId !== '0' ? { numId, lvl: Number(val(kid(np, 'w:ilvl')) ?? fromStyle?.lvl ?? 0) } : null) : np && fromStyle ? { ...fromStyle, lvl: Number(val(kid(np, 'w:ilvl')) ?? fromStyle.lvl) } : fromStyle;
    if (kid(pr, 'w:framePr')) lost.add('Text boxes');
    if (kid(pr, 'w:pBdr')) lost.add('Borders and shading around paragraphs');
    if (kid(pr, 'w:sectPr') && kid(kid(pr, 'w:sectPr'), 'w:cols')?.getAttribute('w:num')) lost.add('Columns');
    const inner = await runs(p);
    const tag = h ? 'h' + h : 'p';
    const st = align ? ` style="text-align:${align}"` : '';
    const empty = !inner.replace(/<br>/g, '').trim();
    return { html: empty ? '<p></p>' : `<${tag}${st}>${inner}</${tag}>`, list };
  };

  // A table, with merged cells.
  const table = async (t: Element): Promise<string> => {
    const rows = kids(t).filter((c) => c.nodeName === 'w:tr');
    const grid: { cell: { html: string; span: number; rows: number } | null }[][] = [];
    const origin: ({ rows: number } | null)[] = [];
    for (const tr of rows) {
      const out: { html: string; span: number; rows: number }[] = [];
      let col = 0;
      for (const tc of kids(tr).filter((c) => c.nodeName === 'w:tc' || c.nodeName === 'w:sdt')) {
        const cell = tc.nodeName === 'w:sdt' ? kid(kid(tc, 'w:sdtContent'), 'w:tc') ?? tc : tc;
        const pr = kid(cell, 'w:tcPr');
        const span = Number(val(kid(pr, 'w:gridSpan')) ?? 1) || 1;
        const vm = kid(pr, 'w:vMerge');
        if (vm && val(vm) !== 'restart') {
          if (origin[col]) origin[col]!.rows++;
          col += span;
          continue;
        }
        const c = { html: await blocks(kids(cell)), span, rows: 1 };
        out.push(c);
        for (let k = 0; k < span; k++) origin[col + k] = vm ? c : null;
        col += span;
      }
      grid.push(out.map((cell) => ({ cell })));
    }
    if (kids(t).some((c) => c.nodeName === 'w:tblPr' && kid(c, 'w:tblpPr'))) lost.add('The exact place of tables that float beside text');
    return (
      '<table><tbody>' +
      grid.map((r) => '<tr>' + r.map(({ cell: c }) => `<td${c!.span > 1 ? ` colspan="${c!.span}"` : ''}${c!.rows > 1 ? ` rowspan="${c!.rows}"` : ''}>${c!.html || '<p></p>'}</td>`).join('') + '</tr>').join('') +
      '</tbody></table>'
    );
  };

  // Paragraphs and tables in order; list paragraphs are gathered into lists, nested by level.
  async function blocks(list: Element[]): Promise<string> {
    let out = '';
    const stack: { tag: string; lvl: number }[] = [];
    const close = (to: number) => {
      while (stack.length && stack[stack.length - 1].lvl >= to) out += `</li></${stack.pop()!.tag}>`;
    };
    const flat: Element[] = [];
    for (const el of list) {
      if (el.nodeName === 'w:sdt') flat.push(...kids(kid(el, 'w:sdtContent')));
      else if (el.nodeName === 'w:customXml') flat.push(...kids(el));
      else flat.push(el);
    }
    for (const el of flat) {
      if (el.nodeName === 'w:p') {
        const p = await para(el);
        if (p.list) {
          const lt = listType(p.list.numId, p.list.lvl);
          const top = stack[stack.length - 1];
          if (top && top.lvl === p.list.lvl && top.tag === lt.tag) out += '</li><li>';
          else if (top && top.lvl >= p.list.lvl) {
            close(p.list.lvl + 1);
            const t2 = stack[stack.length - 1];
            if (t2 && t2.lvl === p.list.lvl && t2.tag === lt.tag) out += '</li><li>';
            else {
              close(p.list.lvl);
              out += `<${lt.tag}${lt.type && lt.type !== '1' ? ` type="${lt.type}"` : ''}><li>`;
              stack.push({ tag: lt.tag, lvl: p.list.lvl });
            }
          } else {
            out += `<${lt.tag}${lt.type && lt.type !== '1' ? ` type="${lt.type}"` : ''}><li>`;
            stack.push({ tag: lt.tag, lvl: p.list.lvl });
          }
          out += p.html.replace(/^<h\d([^>]*)>/, '<p$1>').replace(/<\/h\d>$/, '</p>') || '<p></p>';
          continue;
        }
        close(0);
        out += p.html;
      } else if (el.nodeName === 'w:tbl') {
        close(0);
        out += await table(el);
      }
    }
    close(0);
    return out;
  }

  let html = await blocks(kids(body));
  // No more than one empty line in a row, and none at the start or end.
  html = html.replace(/(<p><\/p>){2,}/g, '<p></p>').replace(/^(<p><\/p>)+|(<p><\/p>)+$/g, '');
  if (zip['word/footnotes.xml'] && text('word/document.xml').includes('footnoteReference')) lost.add('Footnotes and endnotes');
  if (zip['word/comments.xml']) lost.add('Comments');
  const coreTitle = /<dc:title>([^<]*)<\/dc:title>/.exec(text('docProps/core.xml'))?.[1]?.trim();
  // A heading at the very top becomes the document's title, which shows above the text.
  const top = /^<h1[^>]*>(.*?)<\/h1>/.exec(html);
  const topText = top ? new DOMParser().parseFromString(top[1], 'text/html').body.textContent?.trim() ?? '' : '';
  if (topText && !top![1].includes('<img')) html = html.slice(top![0].length);
  return { html: html || '<p></p>', title: topText || name.replace(/\.docx$/i, '') || coreTitle || 'Word document', lost: [...lost] };
}

const blobUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(b);
  });
