// Text pasted from Word (and Outlook, which uses Word's HTML) arrives with Office markup: fake
// bullets typed as "·" or "1." in front of each line, empty lines made of &nbsp;, <o:p> tags,
// comments and long style attributes. This turns it into plain paragraphs and real lists before
// the editor reads it, keeping bold, italic, underline and links. Other HTML is left as it is.

const OFFICE = /urn:schemas-microsoft-com|class="?Mso|mso-[a-z-]+:/i;

export function cleanPastedHTML(html: string): string {
  if (!OFFICE.test(html) || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  // Office-only things.
  body.querySelectorAll('style, meta, link, xml, script, title').forEach((n) => n.remove());
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.parentNode?.removeChild(c));
  body.querySelectorAll('*').forEach((el) => {
    if (el.tagName.includes(':')) el.replaceWith(...Array.from(el.childNodes)); // <o:p>, <w:…>
  });
  // Lines Word marks as list paragraphs become list items; a run of them, one list.
  const isListPara = (el: Element | null): el is HTMLElement => !!el && el.tagName === 'P' && (/mso-list:\s*l\d/i.test(el.getAttribute('style') ?? '') || /MsoListParagraph/.test(el.className));
  // The bullet or number Word types in front of a list line, in a span of its own.
  const MARK = '[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]';
  Array.from(body.querySelectorAll('p')).forEach((p) => {
    if (!p.isConnected || !isListPara(p)) return;
    if (isListPara(p.previousElementSibling)) return; // part of a run already handled
    const mark = (p.querySelector(MARK)?.textContent ?? p.textContent ?? '').trim();
    const ordered = /^\(?[0-9a-zA-Z]{1,3}[.)]/.test(mark);
    const list = doc.createElement(ordered ? 'ol' : 'ul');
    p.before(list);
    let cur: Element | null = p;
    while (isListPara(cur)) {
      const next: Element | null = cur.nextElementSibling;
      const li = doc.createElement('li');
      const inner = doc.createElement('p');
      const marks = cur.querySelectorAll(MARK);
      marks.forEach((n) => n.remove());
      inner.innerHTML = cur.innerHTML;
      // No marker span: a bullet character typed at the start of the line.
      if (!marks.length && inner.firstChild?.nodeType === 3) inner.firstChild.textContent = (inner.firstChild.textContent ?? '').replace(/^\s*[·•§▪]\s+/, '');
      li.appendChild(inner);
      list.appendChild(li);
      cur.remove();
      cur = next;
    }
  });

  body.querySelectorAll(MARK).forEach((n) => n.remove());
  // No styles or classes from Office; keep bold, italic and underline as tags.
  body.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const st = el.getAttribute('style') ?? '';
    if (el.tagName === 'SPAN') {
      const wrap = (tag: string) => {
        const t = doc.createElement(tag);
        while (el.firstChild) t.appendChild(el.firstChild);
        el.appendChild(t);
      };
      if (/font-weight:\s*(bold|[6-9]00)/i.test(st)) wrap('strong');
      if (/font-style:\s*italic/i.test(st)) wrap('em');
      if (/text-decoration:[^;]*underline/i.test(st)) wrap('u');
    }
    el.removeAttribute('style');
    el.removeAttribute('class');
    el.removeAttribute('lang');
  });
  // Spans with nothing left to say go; their text stays.
  body.querySelectorAll('span').forEach((s) => !s.attributes.length && s.replaceWith(...Array.from(s.childNodes)));
  // Empty lines Word adds between paragraphs.
  body.querySelectorAll('p').forEach((p) => {
    if (!p.querySelector('img') && !(p.textContent ?? '').replace(/[\s ]/g, '')) p.remove();
  });
  return body.innerHTML;
}
