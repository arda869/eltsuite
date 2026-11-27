import type { JSONContent } from '@tiptap/react';

// SuiteScript is deliberately plain text. The first line is the opt-in marker;
// ordinary prose and ordinary clipboard text remain ordinary editor content.
export const SUITE_SCRIPT_HEADER = 'SuiteScript v1';
export const SUITE_SCRIPT_MAX_CHARS = 200_000;
const MAX_BLOCKS = 2_000;
const MAX_COMMAND_CHARS = 20_000;
const MAX_NESTING = 32;
const KNOWN = new Set(['bold', 'italic', 'underline', 'strike', 'marked', 'break', 'stress', 'element', 'heading', 'numbered', 'bullet', 'question', 'audio', 'video', 'image', 'pdf', 'collab', 'timeline', 'activity', 'endactivity', 'task', 'instructions', 'content', 'teacherNotes', 'paperInstructions', 'endtask']);
export type SuiteScriptTypes = Record<string, string>;
export type SuiteScriptParse = { content: JSONContent[]; errors: string[] };
const questionLabel = (node: JSONContent, labels: SuiteScriptTypes) =>
  (node.type === 'gap' ? (node.attrs?.letters ? labels['gap:letters'] : node.attrs?.stem ? labels['gap:stem'] : undefined) : undefined)
  ?? (node.type === 'choice' && node.attrs?.display === 'radio' && JSON.stringify(node.attrs?.options) === '["True","False","Not given"]' ? labels['choice:notgiven'] : undefined)
  ?? (node.type === 'choice' && node.attrs?.display === 'radio' && JSON.stringify(node.attrs?.options) === '["True","False"]' ? labels['choice:truefalse'] : undefined)
  ?? labels[`${node.type}:${node.attrs?.kind}`]
  ?? labels[`${node.type}:${node.attrs?.family}`]
  ?? labels[`${node.type}:${node.attrs?.about}`]
  ?? labels[`${node.type}:${node.attrs?.mode}`]
  ?? labels[`${node.type}:${node.attrs?.display}`]
  ?? (node.type === 'pack' ? labels[`pq:${node.attrs?.kind}`] : undefined)
  ?? (node.type === 'investigation' ? labels[`investigation:${node.attrs?.family}`] : undefined)
  ?? labels[node.type ?? ''];

const encoded = (value: unknown) => JSON.stringify(value);
const command = (name: string, value: unknown) => `@${name}(${encoded(value)})`;
const quoteLiteral = (value: string) => value.replace(/@/g, '@@');

function inline(nodes: JSONContent[], labels: SuiteScriptTypes): string {
  return nodes.map(node => {
    if (node.type === 'text') {
      const text = node.text ?? '';
      const marks = node.marks ?? [];
      if (!marks.length) return quoteLiteral(text);
      if (marks.length === 1 && ['bold', 'italic', 'underline', 'strike'].includes(marks[0].type ?? '') && !marks[0].attrs) return command(marks[0].type!, text);
      return `@marked(text: ${encoded(text)}, marks: ${encoded(marks)})`;
    }
    if (node.type === 'hardBreak') return '@break()';
    if (node.type === 'stress' && Array.isArray(node.attrs?.syllables) && node.attrs.syllables.length > 0 && (node.attrs.style ?? 'box') === 'box') return `@stress(${node.attrs.syllables.map(encoded).join(', ')}, stressed: ${Number(node.attrs.stressed ?? 0) + 1})`;
    if (node.attrs?.suiteRef && ['media', 'inlineMedia', 'picture', 'pdfBlock', 'collab'].includes(node.type ?? '')) {
      const name = node.type === 'picture' ? 'image' : node.type === 'pdfBlock' ? 'pdf' : node.type === 'collab' ? 'collab' : node.attrs.kind === 'video' ? 'video' : 'audio';
      return `@${name}(${encoded(node.attrs.suiteRef)})`;
    }
    const label = questionLabel(node, labels);
    if (label) {
      return `@question(type: ${encoded(label)}, data: ${encoded(node)})`;
    }
    if (node.type === 'media' || node.type === 'inlineMedia') {
      const kind = node.attrs?.kind === 'video' ? 'video' : 'audio';
      return `@${kind}(data: ${encoded(node)})`;
    }
    return `@element(data: ${encoded(node)})`;
  }).join('');
}

function block(node: JSONContent, labels: SuiteScriptTypes): string {
  if (node.type === 'timeline') {
    const attrs = node.attrs ?? {};
    const marks = Array.isArray(attrs.items) ? attrs.items as Record<string, unknown>[] : [];
    const markLines = marks.map(mark => {
      const fields = ['kind', 'x', 'x2', 'label', 'side', 'color', 'count']
        .filter(key => mark[key] !== undefined)
        .map(key => `${key}: ${encoded(mark[key])}`);
      return `    { ${fields.join(', ')} }`;
    });
    const marksText = markLines.length ? `[\n${markLines.join(',\n')}\n  ]` : '[]';
    return `@timeline(\n  title: ${encoded(attrs.title ?? '')},\n  sentence: ${encoded(attrs.sentence ?? '')},\n  now: ${encoded(attrs.now ?? 600)},\n  showNow: ${encoded(attrs.showNow ?? true)},\n  ends: ${encoded(attrs.ends ?? true)},\n  marks: ${marksText}\n)`;
  }
  if (node.type === 'paragraph') {
    const children = node.content ?? [];
    // A lone generic @element would otherwise be read as a block, losing its
    // paragraph wrapper (and making an inline node invalid in Tiptap).
    if (children.length === 1 && inline(children, labels).startsWith('@element(')) return `@element(data: ${encoded(node)})`;
    return inline(children, labels);
  }
  if (node.type === 'heading' && node.content?.every(child => child.type === 'text' && !child.marks)) return node.attrs?.level === 1 ? command('heading', (node.content ?? []).map(child => child.text ?? '').join('')) : command('heading', { level: node.attrs?.level ?? 1, text: (node.content ?? []).map(child => child.text ?? '').join('') });
  if ((node.type === 'bulletList' || node.type === 'orderedList') && !node.attrs && node.content?.every(child => child.type === 'listItem' && child.content?.length === 1 && child.content[0].type === 'paragraph')) {
    const name = node.type === 'bulletList' ? 'bullet' : 'numbered';
    return node.content.map(child => `@${name}(data: ${encoded(child)})`).join('\n');
  }
  const label = questionLabel(node, labels);
  if (label) return `@question(type: ${encoded(label)}, data: ${encoded(node)})`;
  if (['gap', 'choice', 'mcq', 'pack', 'communicativeActivity'].includes(node.type ?? '')) return inline([node], labels);
  return `@element(data: ${encoded(node)})`;
}

export function toSuiteScript(content: JSONContent[], labels: SuiteScriptTypes = {}): string {
  return `${SUITE_SCRIPT_HEADER}\n${content.map(node => block(node, labels)).join('\n')}`;
}

export function isSuiteScript(text: string): boolean {
  return text.replace(/^\uFEFF/, '').replace(/^SuiteScript v1\r\n?/, `${SUITE_SCRIPT_HEADER}\n`).startsWith(`${SUITE_SCRIPT_HEADER}\n`);
}

function splitArgs(source: string): string[] {
  if (!source.trim()) return [];
  const out: string[] = [];
  let start = 0; let depth = 0; let quoted = false; let escape = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; continue; }
    if ('[{('.includes(c)) depth++;
    else if (']})'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { out.push(source.slice(start, i).trim()); start = i + 1; }
    if (depth < 0 || depth > MAX_NESTING) throw new Error('SuiteScript command has invalid nesting.');
  }
  if (quoted || depth !== 0) throw new Error('Unclosed SuiteScript command.');
  out.push(source.slice(start).trim());
  return out;
}

function parseValue(source: string): unknown {
  // Teacher-facing examples use object keys like { answer: "..." }. Quote only
  // keys outside strings, then parse as JSON; never evaluate pasted code.
  let normalized = ''; let quoted = false; let escape = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) { normalized += c; if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; normalized += c; continue; }
    if (/[A-Za-z_$]/.test(c) && /[{,]\s*$/.test(normalized)) {
      const m = source.slice(i).match(/^([A-Za-z_$][\w$]*)\s*:/);
      if (m) { normalized += `"${m[1]}":`; i += m[0].length - 1; continue; }
    }
    normalized += c;
  }
  return JSON.parse(normalized);
}

function parseArgs(source: string): { positional: unknown[]; named: Record<string, unknown> } {
  const positional: unknown[] = []; const named: Record<string, unknown> = {};
  for (const part of splitArgs(source)) {
    const colon = part.match(/^([A-Za-z][\w-]*):\s*([\s\S]+)$/);
    if (colon) named[colon[1]] = parseValue(colon[2]);
    else positional.push(parseValue(part));
  }
  return { positional, named };
}

function readCommand(source: string, at: number): { name: string; args: ReturnType<typeof parseArgs>; end: number } | null {
  const match = source.slice(at).match(/^@([A-Za-z][\w-]*)\(/);
  if (!match || !KNOWN.has(match[1])) return null;
  const name = match[1]; const begin = at + match[0].length;
  let depth = 1; let quoted = false; let escape = false;
  for (let i = begin; i < source.length; i++) {
    const c = source[i];
    if (quoted) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; continue; }
    if (c === '(') depth++;
    if (c === ')' && --depth === 0) return { name, args: parseArgs(source.slice(begin, i)), end: i + 1 };
    if (depth > MAX_NESTING || i - at > MAX_COMMAND_CHARS) throw new Error(`@${name} is too long or deeply nested.`);
    if (c !== ')' && c !== '(') continue;
  }
  throw new Error(`Unclosed @${name} command.`);
}

// Structural SuiteScript commands are parsed only by the explicit whole-task
// workflow. The ordinary rich-text paste path never routes them to metadata.
export function readSuiteScriptDirective(line: string) {
  const parsed = readCommand(line, 0);
  return parsed && parsed.end === line.length ? { name: parsed.name, ...parsed.args } : null;
}

function asNode(value: unknown): JSONContent {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as { type?: unknown }).type !== 'string') throw new Error('A SuiteScript element is missing its type.');
  return value as JSONContent;
}

function asText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('SuiteScript text must be quoted.');
  return value;
}

const TIMELINE_KINDS = new Set(['event', 'point', 'wave', 'period', 'repeat', 'arrow', 'question']);
const TIMELINE_SPANS = new Set(['wave', 'period', 'repeat', 'arrow']);
const TIMELINE_MARK_KEYS = new Set(['kind', 'x', 'x2', 'label', 'side', 'color', 'count']);

function timelineNode(args: ReturnType<typeof parseArgs>): JSONContent {
  if (args.positional.length) throw new Error('@timeline uses named fields.');
  const allowed = new Set(['title', 'sentence', 'now', 'showNow', 'ends', 'marks']);
  const unknown = Object.keys(args.named).find(key => !allowed.has(key));
  if (unknown) throw new Error(`@timeline has an unknown field: ${unknown}.`);
  const title = args.named.title ?? '';
  const sentence = args.named.sentence ?? '';
  const now = args.named.now ?? 600;
  const showNow = args.named.showNow ?? true;
  const ends = args.named.ends ?? true;
  const marks = args.named.marks ?? [];
  if (typeof title !== 'string' || typeof sentence !== 'string') throw new Error('@timeline title and sentence must be quoted text.');
  if (typeof now !== 'number' || !Number.isFinite(now) || now < 30 || now > 970) throw new Error('@timeline now must be between 30 and 970.');
  if (typeof showNow !== 'boolean' || typeof ends !== 'boolean') throw new Error('@timeline showNow and ends must be true or false.');
  if (!Array.isArray(marks) || marks.length > 100) throw new Error('@timeline marks must be a list of at most 100 marks.');
  const items = marks.map((value, index) => {
    const n = index + 1;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Timeline mark ${n} must be an object.`);
    const mark = value as Record<string, unknown>;
    const extra = Object.keys(mark).find(key => !TIMELINE_MARK_KEYS.has(key));
    if (extra) throw new Error(`Timeline mark ${n} has an unknown field: ${extra}.`);
    if (typeof mark.kind !== 'string' || !TIMELINE_KINDS.has(mark.kind)) throw new Error(`Timeline mark ${n} needs a valid kind.`);
    if (typeof mark.x !== 'number' || !Number.isFinite(mark.x) || mark.x < 30 || mark.x > 970) throw new Error(`Timeline mark ${n} x must be between 30 and 970.`);
    if (mark.x2 !== undefined && (typeof mark.x2 !== 'number' || !Number.isFinite(mark.x2) || mark.x2 < 30 || mark.x2 > 970)) throw new Error(`Timeline mark ${n} x2 must be between 30 and 970.`);
    if (TIMELINE_SPANS.has(mark.kind) && (mark.x2 === undefined || mark.x2 === mark.x)) throw new Error(`Timeline mark ${n} needs an x2 different from x.`);
    if (mark.x2 !== undefined && !TIMELINE_SPANS.has(mark.kind)) throw new Error(`Timeline mark ${n} does not use x2.`);
    if (mark.label !== undefined && typeof mark.label !== 'string') throw new Error(`Timeline mark ${n} label must be quoted text.`);
    if (mark.side !== undefined && mark.side !== 'above' && mark.side !== 'below') throw new Error(`Timeline mark ${n} side must be "above" or "below".`);
    if (mark.color !== undefined && (typeof mark.color !== 'string' || !(mark.color === 'accent' || /^#[0-9a-fA-F]{6}$/.test(mark.color)))) throw new Error(`Timeline mark ${n} color must be "accent" or a six-digit hex colour.`);
    if (mark.count !== undefined && (mark.kind !== 'repeat' || !Number.isInteger(mark.count) || (mark.count as number) < 2 || (mark.count as number) > 12)) throw new Error(`Timeline mark ${n} count must be 2–12 and is only used for repeated marks.`);
    return { id: 'suiteScript', ...mark };
  });
  return { type: 'timeline', attrs: { id: 'suiteScript', title, sentence, now, showNow, ends, items } };
}

function valueOf(cmd: ReturnType<typeof readCommand> & object, labels: SuiteScriptTypes): JSONContent[] {
  const { name, args } = cmd;
  const first = args.positional[0];
  if (name === 'break') return [{ type: 'hardBreak' }];
  if (name === 'stress') {
    const syllables = args.positional.map(asText);
    const stressed = Number(args.named.stressed);
    if (!syllables.length || !Number.isInteger(stressed) || stressed < 1 || stressed > syllables.length) throw new Error('@stress needs an explicit one-based stressed syllable within the supplied parts.');
    return [{ type: 'stress', attrs: { syllables, stressed: stressed - 1, style: 'box' } }];
  }
  if (['bold', 'italic', 'underline', 'strike'].includes(name)) return [{ type: 'text', text: asText(first), marks: [{ type: name }] }];
  if (name === 'marked') {
    if (!Array.isArray(args.named.marks)) throw new Error('@marked needs marks.');
    return [{ type: 'text', text: asText(args.named.text), marks: args.named.marks as NonNullable<JSONContent['marks']> }];
  }
  if (name === 'element') return [asNode(args.named.data ?? first)];
  if (['audio', 'video', 'image', 'pdf', 'collab'].includes(name) && typeof first === 'string' && !args.named.data) {
    const nodeType = name === 'image' ? 'picture' : name === 'pdf' ? 'pdfBlock' : name === 'collab' ? 'collab' : 'media';
    return [{ type: nodeType, attrs: { suiteRef: first, ...(name === 'audio' || name === 'video' ? { kind: name } : {}), ...(name === 'image' ? { alt: typeof args.named.alt === 'string' ? args.named.alt : '' } : {}) } }];
  }
  if (name === 'audio' || name === 'video') {
    const node = asNode(args.named.data);
    if (!['media', 'inlineMedia'].includes(node.type ?? '') || node.attrs?.kind !== name) throw new Error(`@${name} has mismatched media data.`);
    return [node];
  }
  if (name === 'question') {
    const label = asText(args.named.type);
    if (args.named.data) {
      const node = asNode(args.named.data);
      if (questionLabel(node, labels) !== label) throw new Error(`Unknown or mismatched question type: ${label}.`);
      return [node];
    }
    if (label !== labels['choice:letters'] && label !== labels['choice:radio']) throw new Error(`Unsupported question type: ${label}.`);
    const options = args.named.options;
    if (!Array.isArray(options) || !options.every(option => typeof option === 'string') || options.length < 2) throw new Error('@question needs at least two quoted options.');
    const teacherOnly = args.named.teacherOnly as { answer?: unknown } | undefined;
    const answer = teacherOnly?.answer;
    const correct = (options as string[]).indexOf(answer as string);
    if (teacherOnly && correct < 0) throw new Error('The teacher-only answer must match one of the options.');
    return [{ type: 'choice', attrs: { id: 'suiteScript', options, correct, display: 'radio' } }];
  }
  throw new Error(`Unknown SuiteScript command: @${name}.`);
}

function parseInline(line: string, labels: SuiteScriptTypes): JSONContent[] {
  const out: JSONContent[] = [];
  let prose = '';
  const flush = () => { if (prose) out.push({ type: 'text', text: prose }); prose = ''; };
  for (let at = 0; at < line.length;) {
    if (line.startsWith('@@', at)) { prose += '@'; at += 2; continue; }
    if (line[at] !== '@') { prose += line[at++]; continue; }
    const cmd = readCommand(line, at);
    if (!cmd) { prose += line[at++]; continue; }
    flush();
    out.push(...valueOf(cmd, labels).map(node => (node.type === 'media' ? { ...node, type: 'inlineMedia' } : node)));
    at = cmd.end;
  }
  flush();
  return out;
}

function statements(body: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  let start = 0; let line = 2; let startLine = 2; let depth = 0; let quoted = false; let escape = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (!depth && c === '@' && body[i + 1] === '@') { i++; continue; }
    if (!depth && c === '@') {
      const match = body.slice(i).match(/^@([A-Za-z][\w-]*)\(/);
      if (match && KNOWN.has(match[1])) { depth = 1; i += match[0].length - 1; continue; }
    }
    if (depth) {
      if (quoted) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quoted = false; }
      else { if (c === '"') quoted = true; else if (c === '(') depth++; else if (c === ')') depth--; }
    }
    if (c === '\n') {
      if (depth === 0) { out.push({ text: body.slice(start, i), line: startLine }); start = i + 1; startLine = line + 1; }
      line++;
    }
  }
  out.push({ text: body.slice(start), line: startLine });
  return out;
}

export function parseSuiteScript(text: string, labels: SuiteScriptTypes = {}): SuiteScriptParse {
  if (!isSuiteScript(text)) return { content: [], errors: ['Missing SuiteScript v1 header.'] };
  if (text.length > SUITE_SCRIPT_MAX_CHARS) return { content: [], errors: [`SuiteScript is too long (maximum ${SUITE_SCRIPT_MAX_CHARS} characters).`] };
  const body = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').slice(1).join('\n');
  const lines = statements(body);
  if (lines.length > MAX_BLOCKS) return { content: [], errors: [`SuiteScript has too many blocks (maximum ${MAX_BLOCKS}).`] };
  const content: JSONContent[] = []; const errors: string[] = [];
  lines.forEach(({ text: line, line: lineNumber }) => {
    try {
      const start = readCommand(line, 0);
      if (start && start.end === line.length) {
        if (start.name === 'heading') {
          const value = start.args.positional[0];
          const data = value && typeof value === 'object' ? value as { level?: number; text?: string } : { level: 1, text: asText(value) };
          if (!Number.isInteger(data.level) || (data.level ?? 0) < 1 || (data.level ?? 0) > 6) throw new Error('Heading level must be 1–6.');
          content.push({ type: 'heading', attrs: { level: data.level }, content: [{ type: 'text', text: asText(data.text) }] }); return;
        }
        if (start.name === 'bullet' || start.name === 'numbered') {
          if (start.args.positional.length > 1 && !start.args.named.data) {
            const type = start.name === 'bullet' ? 'bulletList' : 'orderedList';
            content.push({ type, content: start.args.positional.map(value => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: asText(value) }] }] })) });
            return;
          }
          const item = start.args.named.data ? asNode(start.args.named.data) : { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: asText(start.args.positional[0]) }] }] };
          if (item.type !== 'listItem') throw new Error('List command needs a list item.');
          const type = start.name === 'bullet' ? 'bulletList' : 'orderedList';
          const last = content.at(-1);
          if (last?.type === type) last.content = [...(last.content ?? []), item];
          else content.push({ type, content: [item] });
          return;
        }
        if (start.name === 'element') { content.push(asNode(start.args.named.data ?? start.args.positional[0])); return; }
        if (start.name === 'timeline') { content.push(timelineNode(start.args)); return; }
        if (start.name === 'question') {
          const nodes = valueOf(start, labels);
          const prompt = start.args.named.prompt;
          if (typeof prompt === 'string') content.push({ type: 'paragraph', content: [{ type: 'text', text: prompt }, ...nodes] });
          else if (start.args.named.data && nodes.length === 1 && !['gap', 'choice', 'dropgap'].includes(nodes[0].type ?? '')) content.push(nodes[0]);
          else content.push(...nodes.map(node => ({ type: 'paragraph', content: [node] })));
          return;
        }
        if (['audio', 'video', 'image', 'pdf', 'collab'].includes(start.name)) {
          const nodes = valueOf(start, labels);
          content.push(...nodes.map(node => ['inlineMedia', 'picture'].includes(node.type ?? '') ? { type: 'paragraph', content: [node] } : node)); return;
        }
      }
      content.push({ type: 'paragraph', ...(line ? { content: parseInline(line, labels) } : {}) });
    } catch (error) { errors.push(`Line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`); }
  });
  let nextId = 0;
  const assignDraftIds = (node: JSONContent): void => {
    if (node.attrs?.id === 'suiteScript') node.attrs.id = `suiteScript-${++nextId}`;
    if (node.type === 'timeline' && Array.isArray(node.attrs?.items)) {
      node.attrs.items = (node.attrs.items as Record<string, unknown>[]).map(item =>
        item.id === 'suiteScript' ? { ...item, id: `suiteScript-${++nextId}` } : item);
    }
    node.content?.forEach(assignDraftIds);
  };
  content.forEach(assignDraftIds);
  return { content: errors.length ? [] : content, errors };
}

// Messages cannot carry teacher keys or a private learner version. Convert a
// SuiteScript draft to text before inserting it into a recipient-visible chat.
export function suiteScriptMessageSafe(content: JSONContent[]): JSONContent[] {
  const visible = (node: JSONContent): string => {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'choice') return (node.attrs?.options as string[] | undefined)?.join(' / ') ?? '';
    if (node.type === 'gap') return '________';
    if (node.type === 'stress') return (node.attrs?.syllables as string[] | undefined)?.join('') ?? '';
    if (node.type === 'inlineMedia' || node.type === 'media') return node.attrs?.kind === 'video' ? '[Video]' : '[Audio]';
    if (node.type === 'hardBreak') return '\n';
    // Unknown nodes can carry private notes or answers in their descendants.
    // The message projection is allowlisted, never a generic content walk.
    if (!['paragraph', 'heading', 'listItem', 'bulletList', 'orderedList'].includes(node.type ?? '')) return '[Activity]';
    return (node.content ?? []).map(visible).join(node.type === 'paragraph' ? '' : ' ');
  };
  return content.map(node => ({ type: 'paragraph', content: [{ type: 'text', text: visible(node) }] }));
}
