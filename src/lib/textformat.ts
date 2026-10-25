// Text convention for exporting and importing lessons (see the brief, section 7).
// Export works from the editor content (answers included). Import builds editor content
// and reports problems with line numbers. Anything the convention has no words for is kept
// as a [[raw]] block, so an export can always be imported again without losing work.
import type { JSONContent } from '@tiptap/react';
import { newId } from './tasks';

export type ExportTask = { title: string; instructions?: string; hidden?: boolean; locked?: boolean; layout?: string; kind?: string; content: JSONContent; notes?: string };

// ---------------------------------------------------------------- export

function inline(nodes: JSONContent[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === 'text') {
        let t = n.text ?? '';
        const m = (n.marks ?? []).map((x) => x.type);
        if (m.includes('bold')) t = `**${t}**`;
        if (m.includes('italic')) t = `*${t}*`;
        const link = n.marks?.find((x) => x.type === 'link');
        if (link?.attrs?.href) t = `[${t}](${link.attrs.href})`;
        return t;
      }
      const a = n.attrs ?? {};
      if (n.type === 'gap') return `{{${(a.answers ?? []).join('|')}${a.caseSensitive ? '|case=sensitive' : ''}}}`;
      if (n.type === 'choice') {
        const correct: number[] = Array.isArray(a.correct) ? a.correct : [a.correct];
        const opts = (a.options ?? []).map((o: string, i: number) => (correct.includes(i) ? '*' : '') + o).join('|');
        return `{{${a.display === 'radio' ? '?radio:' : '?'}${opts}}}`;
      }
      if (n.type === 'dropgap') return `{{drag:${a.answer ?? ''}}}`;
      if (n.type === 'hardBreak') return '  \n';
      if (n.type === 'image') return `![${a.alt ?? ''}](${a.src ?? ''})`;
      return `[[raw]]${JSON.stringify(n)}[[/raw]]`;
    })
    .join('');
}

function block(n: JSONContent, out: string[], listPrefix = '') {
  const a = n.attrs ?? {};
  switch (n.type) {
    case 'paragraph':
      out.push(listPrefix + inline(n.content));
      if (!listPrefix) out.push('');
      return;
    case 'heading':
      out.push('### ' + inline(n.content), '');
      return;
    case 'bulletList':
    case 'orderedList':
      (n.content ?? []).forEach((li, i) => (li.content ?? []).forEach((c, k) => block(c, out, k === 0 ? (n.type === 'orderedList' ? `${i + 1}. ` : '- ') : '   ')));
      out.push('');
      return;
    case 'image':
      out.push(`![${a.alt ?? ''}](${a.src ?? ''})`, '');
      return;
    case 'columnBreak':
      out.push('---panel---', '');
      return;
    case 'table': {
      const rows = (n.content ?? []).map((r) => (r.content ?? []).map((c) => (c.content ?? []).map((p) => inline(p.content)).join(' ').replace(/\|/g, '\\|')));
      if (!rows.length) return;
      out.push('| ' + rows[0].join(' | ') + ' |', '|' + rows[0].map(() => ' --- |').join(''));
      rows.slice(1).forEach((r) => out.push('| ' + r.join(' | ') + ' |'));
      out.push('');
      return;
    }
    case 'match': {
      out.push('[[match]]');
      (a.pairs ?? []).forEach((p: { left: string; right: string }) => out.push(`${p.left} = ${p.right}`));
      (a.extras ?? []).filter(Boolean).forEach((x: string) => out.push(`= ${x}`));
      out.push('[[/match]]', '');
      return;
    }
    case 'wordbank':
      out.push(`[[wordbank${(a.extras ?? []).length ? ' extra=' + a.extras.join(', ') : ''}]]`, '');
      return;
    case 'order':
      out.push('[[order]]', a.sentence ?? '', '[[/order]]', '');
      return;
    case 'writing': {
      const words = a.minWords && a.maxWords ? ` words=${a.minWords}-${a.maxWords}` : a.maxWords ? ` words=${a.maxWords}` : a.minWords ? ` words=${a.minWords}-` : '';
      out.push(`[[long${words}${a.points ? ' points=' + a.points : ''}]]`);
      if (a.model) out.push('model: ' + a.model);
      out.push('[[/long]]', '');
      return;
    }
    case 'textBox':
      out.push(`[[box style=${a.style ?? 'box'} tone=${a.tone ?? 'grey'}${a.label ? ` label="${String(a.label).replace(/"/g, "'")}"` : ''}]]`);
      (n.content ?? []).forEach((c) => block(c, out));
      out.push('[[/box]]', '');
      return;
    case 'blockquote':
      (n.content ?? []).forEach((c) => out.push('> ' + inline(c.content)));
      out.push('');
      return;
    default:
      out.push('[[raw]]', JSON.stringify(n), '[[/raw]]', '');
  }
}

export function exportLesson(title: string, tasks: ExportTask[], withNotes = true) {
  const out: string[] = [`# ${title}`, ''];
  tasks.forEach((t, i) => {
    if (t.kind === 'section') {
      out.push(`## Section: ${t.title}`, '');
      return;
    }
    out.push(`## Task ${i + 1}: ${t.title}`);
    if (t.instructions) out.push('instructions: ' + t.instructions);
    out.push(`hidden: ${t.hidden ? 'yes' : 'no'}`, `locked: ${t.locked ? 'yes' : 'no'}`);
    if (t.layout && t.layout !== 'single') out.push('layout: ' + (t.layout === 'two-wide' ? 'two-columns 60/40' : t.layout === 'media' ? 'media-questions' : 'two-columns 50/50'));
    out.push('');
    (t.content.content ?? []).forEach((n) => block(n, out));
    if (withNotes && t.notes?.trim()) out.push('[[notes]]', t.notes.trim(), '[[/notes]]', '');
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

// ---------------------------------------------------------------- import

export type ImportError = { line: number; message: string };
export type ImportedTask = ExportTask & { line: number };
export type ImportResult = { title: string; tasks: ImportedTask[]; errors: ImportError[] };

const T = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text, ...(marks?.length ? { marks } : {}) });

// Inline text: **bold**, *italic*, [text](https://…), {{gap}} and {{?dropdown}} questions.
function parseInline(s: string, line: number, errors: ImportError[]): JSONContent[] {
  const out: JSONContent[] = [];
  const re = /(\{\{[^}]*\}\}|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https:\/\/[^)]+\)|!\[[^\]]*\]\([^)]+\)|\[\[raw\]\].*?\[\[\/raw\]\])/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push(T(s.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith('{{')) {
      const inner = tok.slice(2, -2).trim();
      if (inner.startsWith('drag:')) out.push({ type: 'dropgap', attrs: { id: newId(), answer: inner.slice(5).trim() } });
      else if (inner.startsWith('?')) {
        const radio = inner.startsWith('?radio:');
        const opts = inner.slice(radio ? 7 : 1).split('|').map((o) => o.trim());
        const correct = opts.map((o, i) => (o.startsWith('*') ? i : -1)).filter((i) => i >= 0);
        if (!correct.length) errors.push({ line, message: `The dropdown {{${inner}}} has no correct option marked with *` });
        out.push({ type: 'choice', attrs: { id: newId(), options: opts.map((o) => o.replace(/^\*/, '')), correct: correct.length > 1 ? correct : correct[0] ?? -1, multi: correct.length > 1, display: radio ? 'radio' : 'dropdown' } });
      } else {
        const parts = inner.split('|').map((x) => x.trim());
        const cs = parts.includes('case=sensitive');
        const answers = parts.filter((x) => x && x !== 'case=sensitive');
        if (!answers.length) errors.push({ line, message: 'A gap {{ }} has no answer inside it' });
        out.push({ type: 'gap', attrs: { id: newId(), answers, caseSensitive: cs } });
      }
    } else if (tok.startsWith('[[raw]]')) {
      try {
        out.push(JSON.parse(tok.slice(7, -8)));
      } catch {
        errors.push({ line, message: 'A [[raw]] part could not be read' });
      }
    } else if (tok.startsWith('**')) out.push(T(tok.slice(2, -2), [{ type: 'bold' }]));
    else if (tok.startsWith('![')) {
      const mm = /!\[([^\]]*)\]\(([^)]+)\)/.exec(tok)!;
      out.push({ type: 'image', attrs: { src: mm[2], alt: mm[1] } });
    } else if (tok.startsWith('[')) {
      const mm = /\[([^\]]+)\]\((https:\/\/[^)]+)\)/.exec(tok)!;
      out.push(T(mm[1], [{ type: 'link', attrs: { href: mm[2] } }]));
    } else out.push(T(tok.slice(1, -1), [{ type: 'italic' }]));
    last = m.index! + tok.length;
  }
  if (last < s.length) out.push(T(s.slice(last)));
  return out.filter((n) => n.type !== 'text' || n.text);
}

const attrsOf = (head: string) => {
  const a: Record<string, string> = {};
  for (const m of head.matchAll(/(\w+)=(?:"([^"]*)"|(.+?))(?=\s+\w+=|\s*$)/g)) a[m[1]] = (m[2] ?? m[3] ?? '').trim();
  return a;
};

export function importLesson(text: string): ImportResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const errors: ImportError[] = [];
  const tasks: ImportedTask[] = [];
  let title = '';
  let cur: ImportedTask | null = null;
  let body: JSONContent[] = [];
  let i = 0;

  const para = (s: string, ln: number): JSONContent => {
    const c = parseInline(s, ln, errors);
    return c.length ? { type: 'paragraph', content: c } : { type: 'paragraph' };
  };
  const finish = () => {
    if (cur) {
      cur.content = { type: 'doc', content: body.length ? body : [{ type: 'paragraph' }] };
      tasks.push(cur);
    }
    body = [];
  };

  while (i < lines.length) {
    const raw = lines[i];
    const ln = i + 1;
    const l = raw.trim();
    if (/^# (?!#)/.test(raw)) {
      title = raw.slice(2).trim();
      i++;
      continue;
    }
    if (raw.startsWith('## ')) {
      finish();
      const h = raw.slice(3).trim();
      if (/^section:/i.test(h)) cur = { kind: 'section', title: h.replace(/^section:\s*/i, ''), content: { type: 'doc' }, line: ln };
      else cur = { kind: 'task', title: h.replace(/^task\s*\d+\s*[:.]\s*/i, ''), content: { type: 'doc' }, line: ln };
      i++;
      continue;
    }
    if (!cur) {
      if (l) {
        if (!title) errors.push({ line: ln, message: 'Text before the first task. Start a task with “## Task title”.' });
        else errors.push({ line: ln, message: 'Text before the first task. Start a task with “## Task title”.' });
      }
      i++;
      continue;
    }
    const meta = /^(hidden|locked|layout|instructions):\s*(.*)$/i.exec(l);
    if (meta && body.length === 0) {
      const [, k, v] = meta;
      const key = k.toLowerCase();
      if (key === 'hidden') cur.hidden = /^yes|true$/i.test(v);
      else if (key === 'locked') cur.locked = /^yes|true$/i.test(v);
      else if (key === 'instructions') cur.instructions = v;
      else cur.layout = /60\/40|wide/.test(v) ? 'two-wide' : /media/.test(v) ? 'media' : /two/.test(v) ? 'two' : 'single';
      i++;
      continue;
    }
    if (!l) {
      i++;
      continue;
    }
    if (l === '---panel---') {
      body.push({ type: 'columnBreak' });
      i++;
      continue;
    }
    const bm = /^\[\[(\w+)([^\]]*)\]\]$/.exec(l);
    if (bm) {
      const kind = bm[1].toLowerCase();
      const a = attrsOf(bm[2]);
      if (kind === 'wordbank') {
        body.push({ type: 'wordbank', attrs: { extras: (a.extra ?? '').split(',').map((x) => x.trim()).filter(Boolean) } });
        i++;
        continue;
      }
      // Collect lines up to the closing tag.
      const start = i;
      const inner: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim().toLowerCase() !== `[[/${kind}]]`) inner.push(lines[i++]);
      if (i >= lines.length) {
        errors.push({ line: start + 1, message: `[[${kind}]] is never closed with [[/${kind}]]` });
        break;
      }
      i++; // closing tag
      const at = (k: number) => start + 2 + k;
      const content = inner.map((x) => x.trim());
      switch (kind) {
        case 'notes':
          cur.notes = inner.join('\n').trim();
          break;
        case 'raw':
          try {
            body.push(JSON.parse(inner.join('\n')));
          } catch {
            errors.push({ line: start + 1, message: 'This [[raw]] block could not be read' });
          }
          break;
        case 'mcq':
        case 'tf': {
          if (kind === 'tf') {
            content.filter(Boolean).forEach((x, k) => {
              const m = /^(.*?)\s*=\s*(T|F|NG|true|false|not given)\s*$/i.exec(x);
              if (!m) return errors.push({ line: at(k), message: 'Write a true / false line like “London is in France. = F”' });
              const ng = /^(ng|not given)$/i.test(m[2]);
              const opts = ['True', 'False', ...(ng || /ng/i.test(a.options ?? '') ? ['Not given'] : [])];
              const correct = /^t/i.test(m[2]) ? 0 : /^f/i.test(m[2]) ? 1 : 2;
              body.push({ type: 'paragraph', content: [...parseInline(m[1] + ' ', at(k), errors), { type: 'choice', attrs: { id: newId(), options: opts, correct, multi: false, display: 'radio' } }] });
            });
            break;
          }
          const prompt = content.filter((x) => x && !/^[-*>]|^%\d+%/.test(x));
          const opts = content.filter((x) => /^(%\d+%\s*)?[-*]\s/.test(x));
          const correct = opts.map((o, k) => (/^(%\d+%\s*)?\*/.test(o) ? k : -1)).filter((k) => k >= 0);
          if (!opts.length) errors.push({ line: start + 1, message: '[[mcq]] has no options. Start each option with - or *' });
          else if (!correct.length) errors.push({ line: start + 1, message: '[[mcq]] has no correct answer marked with *' });
          const fb = content.find((x) => x.startsWith('>'))?.slice(1).trim();
          body.push({
            type: 'paragraph',
            content: [
              ...parseInline((prompt.join(' ') || '') + ' ', start + 2, errors),
              { type: 'choice', attrs: { id: newId(), options: opts.map((o) => o.replace(/^(%\d+%\s*)?[-*]\s*/, '').replace(/\s+#.*$/, '')), correct: correct.length > 1 ? correct : correct[0] ?? -1, multi: correct.length > 1, display: 'radio', feedback: fb ?? '' } },
            ],
          });
          break;
        }
        case 'match': {
          const pairs: { left: string; right: string }[] = [];
          const extras: string[] = [];
          content.forEach((x, k) => {
            if (!x) return;
            const m = /^(.*?)\s*=\s*(.*)$/.exec(x);
            if (!m) return errors.push({ line: at(k), message: 'Write a matching pair like “happy = joyful”' });
            if (!m[1]) extras.push(m[2]);
            else pairs.push({ left: m[1], right: m[2] });
          });
          if (!pairs.length) errors.push({ line: start + 1, message: '[[match]] has no pairs' });
          body.push({ type: 'match', attrs: { id: newId(), pairs, extras } });
          break;
        }
        case 'drag': {
          const extra = (a.extra ?? '').split(',').map((x) => x.trim()).filter(Boolean);
          body.push({ type: 'wordbank', attrs: { extras: extra } });
          let any = false;
          content.forEach((x, k) => {
            if (!x) return;
            const withDrops = x.replace(/\{\{([^}?][^}]*)\}\}/g, (_, w) => ((any = true), `{{drag:${w}}}`));
            body.push(para(withDrops, at(k)));
          });
          if (!any) errors.push({ line: start + 1, message: '[[drag]] has no gaps. Put the answers in {{ }}' });
          break;
        }
        case 'order': {
          const s = content.filter(Boolean).join(' ');
          if (!s) errors.push({ line: start + 1, message: '[[order]] needs the correct sentence inside it' });
          body.push({ type: 'order', attrs: { id: newId(), sentence: s } });
          break;
        }
        case 'long': {
          const [mn, mx] = (a.words ?? '').split('-').map((x) => Number(x) || null);
          const model = content.find((x) => /^model:/i.test(x))?.replace(/^model:\s*/i, '') ?? '';
          const prompt = content.filter((x) => x && !/^model:/i.test(x));
          prompt.forEach((x, k) => body.push(para(x, at(k))));
          body.push({ type: 'writing', attrs: { id: newId(), minWords: a.words && !a.words.includes('-') ? null : mn ?? null, maxWords: a.words && !a.words.includes('-') ? Number(a.words) || null : mx ?? null, model, rich: false, spellcheck: false, points: Number(a.points) || 5 } });
          break;
        }
        case 'survey': {
          const q = content.filter((x) => x && !/^scale:/i.test(x)).join(' ');
          const sc = content.find((x) => /^scale:/i.test(x))?.replace(/^scale:\s*/i, '').split('|').map((x) => x.trim()) ?? [];
          const pts = Number((sc[0] ?? '').split('-')[1]) || 5;
          body.push({ type: 'reflect', attrs: { id: newId(), about: 'self', title: '', items: [{ id: newId(), type: 'scale', prompt: q, points: pts, low: sc[1] ?? '', high: sc[2] ?? '' }] } });
          break;
        }
        case 'box': {
          const sub = importLesson('## x\n' + inner.join('\n'));
          sub.errors.forEach((e) => errors.push({ line: start + e.line - 1, message: e.message }));
          body.push({ type: 'textBox', attrs: { style: a.style ?? 'box', tone: a.tone ?? 'grey', label: a.label ?? '', meta: '', side: 'left', symbol: '!' }, content: sub.tasks[0]?.content.content ?? [{ type: 'paragraph' }] });
          break;
        }
        default:
          errors.push({ line: start + 1, message: `Unknown block [[${kind}]]` });
      }
      continue;
    }
    if (l.startsWith('### ')) {
      body.push({ type: 'heading', attrs: { level: 3 }, content: parseInline(l.slice(4), ln, errors) });
      i++;
      continue;
    }
    if (/^(- |\d+\. )/.test(l)) {
      const ordered = /^\d+\. /.test(l);
      const items: JSONContent[] = [];
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i].trim()) : lines[i].trim().startsWith('- '))) {
        const t = lines[i].trim().replace(/^(- |\d+\. )/, '');
        items.push({ type: 'listItem', content: [para(t, i + 1)] });
        i++;
      }
      body.push({ type: ordered ? 'orderedList' : 'bulletList', content: items });
      continue;
    }
    if (l.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const r = lines[i].trim();
        if (!/^\|[\s\-:|]+\|$/.test(r)) rows.push(r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|')));
        i++;
      }
      body.push({
        type: 'table',
        content: rows.map((r, ri) => ({ type: 'tableRow', content: r.map((c) => ({ type: ri === 0 ? 'tableHeader' : 'tableCell', content: [para(c, ln)] })) })),
      });
      continue;
    }
    if (l.startsWith('> ')) {
      const ps: JSONContent[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) ps.push(para(lines[i++].trim().slice(2), i));
      body.push({ type: 'blockquote', content: ps });
      continue;
    }
    if (/^\[\[\/\w+\]\]$/.test(l)) {
      errors.push({ line: ln, message: `${l} closes a block that was never opened` });
      i++;
      continue;
    }
    body.push(para(raw.replace(/\s+$/, ''), ln));
    i++;
  }
  finish();
  if (!tasks.length && !errors.length) errors.push({ line: 1, message: 'No tasks found. Start each task with “## Task title”.' });
  return { title, tasks, errors };
}
