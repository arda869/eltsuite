import { listLabel } from './listLabel';
// Text convention for exporting and importing lessons (see the brief, section 7).
// Export works from the editor content (answers included). Import builds editor content
// and reports problems with line numbers. Anything the convention has no words for is kept
// as a [[raw]] block, so an export can always be imported again without losing work.
import type { JSONContent } from '@tiptap/react';
import { newId } from './tasks';

export type ExportTask = { print?: { gap?: string; lines?: number | null; instr?: string } | null; title: string; instructions?: string; instrDoc?: JSONContent | null; hidden?: boolean; locked?: boolean; layout?: string; kind?: string; content: JSONContent; notes?: string; exam?: { minutes: number | null } | null };

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
      if (n.type === 'gap') return `{{${(a.answers ?? []).join('|')}${a.stem ? '|^' + a.stem : ''}${a.caseSensitive ? '|case=sensitive' : ''}}}`;
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
      (n.content ?? []).forEach((li, i) => (li.content ?? []).forEach((c, k) => block(c, out, k === 0 ? (n.type === 'orderedList' ? `${listLabel((typeof a.start === 'number' ? a.start : 1) + i, String(a.listType ?? '1'))}. ` : '- ') : '   ')));
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
      out.push(`[[long${words}${a.points ? ' points=' + a.points : ''}${a.genre ? ' genre=' + a.genre : ''}${a.rubric && a.rubric !== 'none' ? ' rubric=' + a.rubric : ''}]]`);
      if (a.model) out.push('model: ' + a.model);
      out.push('[[/long]]', '');
      return;
    }
    case 'pq':
      packExport(a.kind, a.data ?? {}, out);
      return;
    case 'survey': {
      out.push(`[[survey anonymous=${a.anonymous ? 'yes' : 'no'}${a.title ? ` title="${String(a.title).replace(/"/g, "'")}"` : ''}]]`);
      (a.questions ?? []).forEach((q: any) => {
        out.push(q.prompt || '…');
        if (q.type === 'scale') out.push(`scale: 1-${q.max ?? 5} | ${q.low ?? ''} | ${q.high ?? ''}`);
        else if (q.type === 'single' || q.type === 'multi' || q.type === 'rank') out.push(`${q.type === 'single' ? 'choice' : q.type}: ${(q.options ?? []).join(' | ')}`);
        else if (q.type !== 'text') out.push(q.type);
      });
      out.push('[[/survey]]', '');
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

/* eslint-disable @typescript-eslint/no-explicit-any */
function packExport(kind: string, d: Record<string, any>, out: string[]) {
  const list = (x: unknown) => (Array.isArray(x) ? x.filter(Boolean) : []);
  switch (kind) {
    case 'fix': {
      const w = String(d.wrong ?? '').trim();
      const s = String(d.sentence ?? '');
      const marked = w && s.includes(w) ? s.replace(w, `*${w}*`) : s;
      out.push('[[fix]]', `${marked} = ${list(d.fixes).join('|')}`, '[[/fix]]', '');
      return;
    }
    case 'categorise':
      out.push('[[categorise]]', ...(d.cats ?? []).map((c: any) => `${c.name}: ${list(c.items).join(', ')}`), '[[/categorise]]', '');
      return;
    case 'transform':
      out.push(`[[transform words=${d.min ?? ''}-${d.max ?? ''} key=${d.keyWord ?? ''}]]`, d.first ?? '', `${d.before ?? ''} {{${list(d.answers).join('|')}}} ${d.after ?? ''}`.trim(), '[[/transform]]', '');
      return;
    case 'highlight':
      out.push(`[[highlight${d.penalty === false ? ' penalty=no' : ''}]]`, `${d.instruction ? d.instruction.replace(/:?\s*$/, '') + ': ' : ''}${d.text ?? ''}`, '[[/highlight]]', '');
      return;
    case 'sentences':
      out.push('[[sentences]]', ...list(d.items), '[[/sentences]]', '');
      return;
    case 'label':
      out.push(`[[label image=${d.image ?? ''}]]`, ...(d.points ?? []).map((p: any) => `${p.label} @ ${p.x}%,${p.y}%`), ...(list(d.extras).length ? ['extra: ' + list(d.extras).join(', ')] : []), '[[/label]]', '');
      return;
    case 'odd':
      out.push(`[[odd${d.reason ? ' reason=yes' : ''}]]`, (d.words ?? []).map((w: string, i: number) => (i === d.odd ? '*' : '') + w).join(', '), '[[/odd]]', '');
      return;
    case 'gapped': {
      const ex = list(d.extras);
      const tags = ex.map((_, i) => String.fromCharCode(71 + i)); // G, H, …
      out.push(`[[gapped${ex.length ? ' extra=' + tags.join(',') : ''}]]`, ...String(d.text ?? '').split('\n'), ...(d.removed ?? []).map((r: string, i: number) => `${i + 1} = ${r}`), ...ex.map((r, i) => `${tags[i]} = ${r}`), '[[/gapped]]', '');
      return;
    }
    case 'matching':
      out.push(`[[matching options=${(d.options ?? []).join(',')}]]`, ...(d.names ?? []).map((n: string, i: number) => (n ? `${d.options[i]}: ${n}` : '')).filter(Boolean), ...(d.statements ?? []).map((s: any) => `${s.text} = ${d.options?.[s.answer] ?? ''}`), '[[/matching]]', '');
      return;
    case 'speaking':
      out.push(`[[speaking timer=${d.timer ?? 60}${d.pairs === false ? ' pairs=no' : ''}]]`, d.prompt ?? '', ...list(d.images).map((x: string) => 'image: ' + x), ...list(d.questions).map((q: string) => '- ' + q), '[[/speaking]]', '');
      return;
    case 'dictation':
      out.push(`[[dictation replays=${d.replays ?? 2}${d.accent === 'GA' ? ' accent=GA' : ''}]]`, d.sentence ?? '', '[[/dictation]]', '');
      return;
    case 'pairs':
      out.push(`[[pairs${d.accent === 'GA' ? ' accent=GA' : ''}]]`, ...(d.items ?? []).map((it: any) => list(it.options).map((o: string) => (o === it.say ? '*' + o : o)).join(' | ')), '[[/pairs]]', '');
      return;
    case 'crossword':
    case 'wordsearch':
      out.push(`[[${kind}${d.from === 'notebook' ? ' from=notebook' : ''}]]`, ...(d.words ?? []).filter((w: any) => w.word).map((w: any) => `${w.word} = ${w.clue ?? ''}`), `[[/${kind}]]`, '');
      return;
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
    if (t.exam) out.push(`exam: ${t.exam.minutes ? t.exam.minutes + 'min' : 'yes'}`);
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
        const stem = parts.find((x) => x.startsWith('^'))?.slice(1).trim().toUpperCase() ?? '';
        const answers = parts.filter((x) => x && x !== 'case=sensitive' && !x.startsWith('^'));
        if (!answers.length) errors.push({ line, message: 'A gap {{ }} has no answer inside it' });
        out.push({ type: 'gap', attrs: { id: newId(), answers, caseSensitive: cs, ...(stem ? { stem } : {}) } });
      }
    } else if (tok.startsWith('[[raw]]')) {
      try {
        out.push(JSON.parse(tok.slice(7, -8)));
      } catch {
        errors.push({ line, message: 'We couldn’t read a [[raw]] part' });
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

// Levenshtein distance, for guessing the wrong word in [[fix]] when it isn't marked.
function dist(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function packImport(kind: string, a: Record<string, string>, content: string[], start: number, at: (k: number) => number, errors: ImportError[]): JSONContent[] {
  const node = (k: string, data: Record<string, unknown>) => ({ type: 'pq', attrs: { id: newId(), kind: k, data } });
  const lines = content.map((x, k) => ({ x, k })).filter((l) => l.x);
  const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  switch (kind) {
    case 'fix':
      return lines.map(({ x, k }) => {
        const m = /^(.*?)\s*=\s*(.+)$/.exec(x);
        if (!m) {
          errors.push({ line: at(k), message: 'Write a [[fix]] line like “She *have* been to Paris. = has”' });
          return node('fix', { sentence: x, wrong: '', fixes: [] });
        }
        const fixes = m[2].split('|').map((f) => f.trim()).filter(Boolean);
        const mark = /\*([^*]+)\*/.exec(m[1]);
        const sentence = m[1].replace(/\*([^*]+)\*/, '$1').trim();
        let wrong = mark?.[1].trim() ?? '';
        if (!wrong) {
          const toks = sentence.split(/\s+/);
          const f = (fixes[0] ?? '').toLowerCase();
          wrong = toks.filter((t) => t.toLowerCase() !== f).sort((p, q) => dist(p.toLowerCase().replace(/[.,!?]$/, ''), f) - dist(q.toLowerCase().replace(/[.,!?]$/, ''), f))[0] ?? '';
        }
        return node('fix', { sentence, wrong, fixes });
      });
    case 'categorise': {
      const cats = lines.map(({ x, k }) => {
        const m = /^([^:]+):\s*(.*)$/.exec(x);
        if (!m) errors.push({ line: at(k), message: 'Write a column like “Countable: apple, chair, idea”' });
        return { name: m?.[1].trim() ?? x, items: csv(m?.[2] ?? '') };
      });
      if (cats.length < 2) errors.push({ line: start + 1, message: '[[categorise]] needs at least two columns' });
      return [node('categorise', { cats })];
    }
    case 'transform': {
      const [mn, mx] = (a.words ?? '').split('-').map((x) => Number(x) || null);
      const first = lines[0]?.x ?? '';
      const second = lines[1]?.x ?? '';
      const m = /^(.*?)\{\{([^}]*)\}\}(.*)$/.exec(second);
      if (!m) errors.push({ line: start + 3, message: '[[transform]] needs a second sentence with the answer in {{ }}' });
      if (!a.key) errors.push({ line: start + 1, message: '[[transform]] needs a key word, for example key=NEVER' });
      return [node('transform', { first, keyWord: (a.key ?? '').toUpperCase(), before: m?.[1].trim() ?? '', after: m?.[3].trim() ?? '', answers: (m?.[2] ?? '').split('|').map((x) => x.trim()).filter(Boolean), min: mn ?? null, max: mx ?? null })];
    }
    case 'highlight':
      return lines.map(({ x, k }) => {
        const brace = x.indexOf('{{');
        const colon = x.indexOf(': ');
        const hasInstr = colon > 0 && (brace < 0 || colon < brace);
        if (brace < 0) errors.push({ line: at(k), message: 'Put the words to tap in {{ }}' });
        return node('highlight', { instruction: hasInstr ? x.slice(0, colon + 1) : '', text: hasInstr ? x.slice(colon + 2) : x, penalty: !/^(no|false)$/i.test(a.penalty ?? '') });
      });
    case 'sentences':
      if (lines.length < 2) errors.push({ line: start + 1, message: '[[sentences]] needs at least two sentences' });
      return [node('sentences', { items: lines.map((l) => l.x) })];
    case 'label': {
      const points: { x: number; y: number; label: string }[] = [];
      let extras: string[] = [];
      lines.forEach(({ x, k }) => {
        if (/^extra:/i.test(x)) return void (extras = csv(x.replace(/^extra:\s*/i, '')));
        const m = /^(.*?)\s*@\s*([\d.]+)%\s*,\s*([\d.]+)%$/.exec(x);
        if (!m) return void errors.push({ line: at(k), message: 'Write a label like “kitchen @ 20%,35%”' });
        points.push({ label: m[1].trim(), x: Number(m[2]), y: Number(m[3]) });
      });
      if (!a.image) errors.push({ line: start + 1, message: '[[label]] needs a picture: image=https://…' });
      return [node('label', { image: a.image ?? '', points, extras })];
    }
    case 'odd':
      return lines.map(({ x, k }) => {
        const ws = csv(x);
        const odd = ws.findIndex((w) => w.startsWith('*'));
        if (odd < 0) errors.push({ line: at(k), message: 'Mark the odd one out with *' });
        return node('odd', { words: ws.map((w) => w.replace(/^\*/, '')), odd: Math.max(0, odd), reason: /^(yes|true)$/i.test(a.reason ?? '') });
      });
    case 'gapped': {
      const extraTags = csv(a.extra ?? '');
      const text: string[] = [];
      const removed: string[] = [];
      const extras: string[] = [];
      content.forEach((x) => {
        const m = /^(\w+)\s*=\s*(.+)$/.exec(x.trim());
        if (m && /^\d+$/.test(m[1])) removed[Number(m[1]) - 1] = m[2].trim();
        else if (m && extraTags.includes(m[1])) extras.push(m[2].trim());
        else text.push(x);
      });
      const gaps = (text.join('\n').match(/\{\{\d+\}\}/g) ?? []).length;
      if (gaps !== removed.filter(Boolean).length) errors.push({ line: start + 1, message: `[[gapped]] has ${gaps} gaps but ${removed.filter(Boolean).length} sentences for them` });
      return [node('gapped', { text: text.join('\n').trim(), removed: Array.from({ length: Math.max(gaps, removed.length) }, (_, i) => removed[i] ?? ''), extras })];
    }
    case 'matching': {
      const options = csv(a.options ?? 'A,B,C,D');
      const names = options.map(() => '');
      const statements: { text: string; answer: number }[] = [];
      lines.forEach(({ x, k }) => {
        const nm = /^([A-Z]):\s*(.+)$/.exec(x);
        if (nm && options.includes(nm[1])) return void (names[options.indexOf(nm[1])] = nm[2].trim());
        const m = /^(.*?)\s*=\s*([A-Z])\s*$/.exec(x);
        if (!m || !options.includes(m[2])) return void errors.push({ line: at(k), message: `Write a statement like “Which person regrets a decision? = ${options[0] ?? 'A'}”` });
        statements.push({ text: m[1].trim(), answer: options.indexOf(m[2]) });
      });
      return [node('matching', { options, names, statements })];
    }
    case 'dictation':
      if (!content.filter(Boolean).length) errors.push({ line: start + 1, message: '[[dictation]] needs the sentence inside it' });
      return [node('dictation', { sentence: content.filter(Boolean).join(' '), replays: Number(a.replays) || 2, accent: a.accent === 'GA' ? 'GA' : 'RP' })];
    case 'pairs': {
      const items = lines.map(({ x, k }) => {
        const opts = x.split('|').map((o) => o.trim()).filter(Boolean);
        const star = opts.findIndex((o) => o.startsWith('*'));
        if (opts.length < 2 || star < 0) errors.push({ line: at(k), message: 'Write the words separated by | and mark the one learners hear with *, for example “*ship | sheep”' });
        return { say: (opts[Math.max(0, star)] ?? '').replace(/^\*/, ''), options: opts.map((o) => o.replace(/^\*/, '')) };
      });
      return [node('pairs', { items, accent: a.accent === 'GA' ? 'GA' : 'RP' })];
    }
    case 'crossword':
    case 'wordsearch': {
      const words = lines.map(({ x, k }) => {
        const m = /^(.+?)\s*=\s*(.*)$/.exec(x);
        if (!m) errors.push({ line: at(k), message: 'Write each line as “word = clue”' });
        return { word: (m?.[1] ?? x).trim(), clue: (m?.[2] ?? '').trim() };
      });
      if (words.length < 2) errors.push({ line: start + 1, message: `[[${kind}]] needs at least two words` });
      return [node(kind, { words, from: a.from === 'notebook' ? 'notebook' : '' })];
    }
    case 'speaking': {
      const images = lines.filter((l) => /^image:/i.test(l.x)).map((l) => l.x.replace(/^image:\s*/i, ''));
      const questions = lines.filter((l) => /^- /.test(l.x)).map((l) => l.x.slice(2).trim());
      const prompt = lines.filter((l) => !/^image:/i.test(l.x) && !/^- /.test(l.x)).map((l) => l.x).join(' ');
      return [node('speaking', { prompt, images, questions, timer: Number(a.timer) || 60, pairs: !/^(no|false)$/i.test(a.pairs ?? '') })];
    }
  }
  return [];
}

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
    const meta = /^(hidden|locked|layout|instructions|exam):\s*(.*)$/i.exec(l);
    if (meta && body.length === 0) {
      const [, k, v] = meta;
      const key = k.toLowerCase();
      if (key === 'hidden') cur.hidden = /^yes|true$/i.test(v);
      else if (key === 'locked') cur.locked = /^yes|true$/i.test(v);
      else if (key === 'instructions') cur.instructions = v;
      else if (key === 'exam') cur.exam = /^(no|false)$/i.test(v) ? null : { minutes: Number((/(\d+)/.exec(v) ?? [])[1]) || null };
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
            errors.push({ line: start + 1, message: 'We couldn’t read this [[raw]] block' });
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
          const extra = { ...(a.genre ? { genre: a.genre } : {}), ...(a.rubric ? { rubric: a.rubric === 'cambridge' ? 'cambridge' : 'custom' } : {}), ...(a.rubric === 'cambridge' ? { points: 20 } : {}) };
          const model = content.find((x) => /^model:/i.test(x))?.replace(/^model:\s*/i, '') ?? '';
          const prompt = content.filter((x) => x && !/^model:/i.test(x));
          prompt.forEach((x, k) => body.push(para(x, at(k))));
          body.push({ type: 'writing', attrs: { id: newId(), minWords: a.words && !a.words.includes('-') ? null : mn ?? null, maxWords: a.words && !a.words.includes('-') ? Number(a.words) || null : mx ?? null, model, rich: false, spellcheck: false, points: Number(a.points) || 5, ...extra } });
          break;
        }
        case 'survey': {
          // A question line, optionally followed by a type line (scale:, choice:, multi:, rank:, emoji, thumbs, text).
          const qs: Record<string, unknown>[] = [];
          const typeLine = /^(scale|choice|multi|rank|emoji|thumbs|text)\b:?\s*(.*)$/i;
          content.filter(Boolean).forEach((x, k) => {
            const m = typeLine.exec(x);
            if (!m) return void qs.push({ id: newId(), type: 'text', prompt: x });
            const last = qs[qs.length - 1];
            if (!last || last.type !== 'text' || last.typed) return void errors.push({ line: at(k), message: `“${x}” must come straight after its question` });
            const parts = m[2].split('|').map((y) => y.trim());
            const t = m[1].toLowerCase();
            last.typed = true;
            if (t === 'scale') Object.assign(last, { type: 'scale', max: Number((parts[0] ?? '').split('-')[1]) === 10 ? 10 : 5, low: parts[1] ?? '', high: parts[2] ?? '' });
            else if (t === 'choice' || t === 'multi' || t === 'rank') Object.assign(last, { type: t === 'choice' ? 'single' : t, options: parts.filter(Boolean) });
            else Object.assign(last, { type: t });
          });
          qs.forEach((q) => delete q.typed);
          if (!qs.length) errors.push({ line: start + 1, message: '[[survey]] has no questions' });
          body.push({ type: 'survey', attrs: { id: 's' + newId(), title: a.title ?? '', anonymous: /^(yes|true)$/i.test(a.anonymous ?? ''), questions: qs } });
          break;
        }
        case 'fix':
        case 'categorise':
        case 'transform':
        case 'highlight':
        case 'sentences':
        case 'label':
        case 'odd':
        case 'gapped':
        case 'matching':
        case 'speaking':
        case 'dictation':
        case 'pairs':
        case 'crossword':
        case 'wordsearch':
          packImport(kind, a, content, start, at, errors).forEach((n) => body.push(n));
          break;
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
  if (!tasks.length && !errors.length) errors.push({ line: 1, message: 'We couldn’t find any tasks. Start each task with “## Task title”.' });
  return { title, tasks, errors };
}
