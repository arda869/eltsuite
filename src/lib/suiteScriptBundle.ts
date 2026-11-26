import type { JSONContent } from '@tiptap/react';
import { isSuiteScript, parseSuiteScript, readSuiteScriptDirective, toSuiteScript, type SuiteScriptTypes, SUITE_SCRIPT_MAX_CHARS } from './suiteScript';

// Whole-task/activity drafts are an explicit, structural workflow. Rich-text
// paste never calls this parser, so a field paste cannot change metadata or
// create another learner version.
export type SuiteScriptTaskDraft = {
  title: string;
  kind: 'task' | 'section';
  layout?: 'single' | 'two' | 'two-wide' | 'media';
  afterCheck?: 'reveal' | 'retry';
  showScore?: boolean;
  instructions: JSONContent[];
  content: JSONContent[];
  teacherNotes: JSONContent[];
  paperInstructions: JSONContent[];
};
export type SuiteScriptActivityDraft = {
  title: string;
  level?: string;
  aim?: string;
  minutes?: number;
  summary?: string;
  focus?: string;
  tasks: SuiteScriptTaskDraft[];
};
export type SuiteScriptBundle = { kind: 'task'; task: SuiteScriptTaskDraft } | { kind: 'activity'; activity: SuiteScriptActivityDraft };
export type BundleResult = { bundle: SuiteScriptBundle | null; errors: string[] };
type Directive = NonNullable<ReturnType<typeof readSuiteScriptDirective>>;
const SECTION = new Set(['instructions', 'content', 'teacherNotes', 'paperInstructions']);
const ACTIVITY_FIELDS = new Set(['title', 'level', 'aim', 'minutes', 'summary', 'focus']);
const TASK_FIELDS = new Set(['title', 'kind', 'layout', 'afterCheck', 'showScore']);

function asString(value: unknown, field: string, required = false): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim())) throw new Error(`${field} must be quoted${required ? ' and non-empty' : ''}.`);
  return value;
}
function directive(line: string, number: number): Directive | null {
  try { return readSuiteScriptDirective(line); }
  catch (error) { throw new Error(`Line ${number}: ${error instanceof Error ? error.message : String(error)}`); }
}
function onlyNamed(d: Directive, allowed: Set<string>): void {
  const unknown = Object.keys(d.named).filter(key => !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported ${d.name} field: ${unknown.join(', ')}.`);
}
function parseSection(lines: string[], start: number, labels: SuiteScriptTypes): JSONContent[] {
  if (!lines.length) return [];
  const result = parseSuiteScript(`SuiteScript v1\n${lines.join('\n')}`, labels);
  if (result.errors.length) throw new Error(result.errors.map(error => error.replace(/^Line (\d+):/, (_all, line: string) => `Line ${Number(line) + start - 2}:`)).join('\n'));
  return result.content;
}

export function parseSuiteScriptBundle(source: string, labels: SuiteScriptTypes = {}): BundleResult {
  if (!isSuiteScript(source)) return { bundle: null, errors: ['Missing SuiteScript v1 header.'] };
  if (source.length > SUITE_SCRIPT_MAX_CHARS) return { bundle: null, errors: [`SuiteScript is too long (maximum ${SUITE_SCRIPT_MAX_CHARS} characters).`] };
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const errors: string[] = [];
  try {
    let at = 1;
    const first = directive(lines[at] ?? '', at + 1);
    if (!first || !['task', 'activity'].includes(first.name)) throw new Error('Line 2: Start a whole-task or whole-activity draft with @task(...) or @activity(...).');
    let activity: Omit<SuiteScriptActivityDraft, 'tasks'> | null = null;
    if (first.name === 'activity') {
      onlyNamed(first, ACTIVITY_FIELDS);
      if (first.positional.length > 1) throw new Error('Line 2: @activity accepts only one title.');
      const title = asString(first.named.title ?? first.positional[0], 'Activity title', true);
      const minutes = first.named.minutes;
      if (minutes !== undefined && (!Number.isInteger(minutes) || Number(minutes) < 1 || Number(minutes) > 240)) throw new Error('Line 2: Activity minutes must be a whole number from 1 to 240.');
      activity = { title, ...Object.fromEntries(['level', 'aim', 'summary', 'focus'].filter(key => first.named[key] !== undefined).map(key => [key, asString(first.named[key], key)])), ...(minutes === undefined ? {} : { minutes: Number(minutes) }) };
      at++;
    }
    const tasks: SuiteScriptTaskDraft[] = [];
    for (; at < lines.length;) {
      const line = lines[at];
      if (!line.trim()) { at++; continue; }
      const marker = directive(line, at + 1);
      if (marker?.name === 'endactivity') {
        if (!activity || marker.positional.length || Object.keys(marker.named).length) throw new Error(`Line ${at + 1}: Unexpected @endactivity().`);
        if (!tasks.length) throw new Error(`Line ${at + 1}: An activity needs at least one task.`);
        if (lines.slice(at + 1).some(rest => rest.trim())) throw new Error(`Line ${at + 2}: Content after @endactivity() is not allowed.`);
        return { bundle: { kind: 'activity', activity: { ...activity, tasks } }, errors: [] };
      }
      if (marker?.name !== 'task') throw new Error(`Line ${at + 1}: Expected @task(...).`);
      if (tasks.length >= 100) throw new Error(`Line ${at + 1}: A SuiteScript activity can contain at most 100 tasks.`);
      onlyNamed(marker, TASK_FIELDS);
      if (marker.positional.length > 1) throw new Error(`Line ${at + 1}: @task accepts only one title.`);
      const title = asString(marker.named.title ?? marker.positional[0], 'Task title', true);
      const kind = marker.named.kind === undefined ? 'task' : marker.named.kind;
      if (kind !== 'task' && kind !== 'section') throw new Error(`Line ${at + 1}: Task kind must be task or section.`);
      const layout = marker.named.layout;
      if (layout !== undefined && !['single', 'two', 'two-wide', 'media'].includes(String(layout))) throw new Error(`Line ${at + 1}: Unsupported task layout.`);
      const afterCheck = marker.named.afterCheck;
      if (afterCheck !== undefined && !['reveal', 'retry'].includes(String(afterCheck))) throw new Error(`Line ${at + 1}: Unsupported answer-check mode.`);
      const showScore = marker.named.showScore;
      if (showScore !== undefined && typeof showScore !== 'boolean') throw new Error(`Line ${at + 1}: showScore must be true or false.`);
      at++;
      const parts: Record<string, { lines: string[]; start: number }> = {};
      const seen = new Set<string>();
      let section = 'content';
      parts.content = { lines: [], start: at + 1 };
      let ended = false;
      while (at < lines.length) {
        const current = lines[at];
        const action = directive(current, at + 1);
        if (action && (SECTION.has(action.name) || action.name === 'endtask')) {
          if (action.positional.length || Object.keys(action.named).length) throw new Error(`Line ${at + 1}: @${action.name} takes no arguments.`);
          if (action.name === 'endtask') { ended = true; at++; break; }
          section = action.name;
          if (seen.has(section)) throw new Error(`Line ${at + 1}: @${section} appears twice in one task.`);
          seen.add(section);
          parts[section] = { lines: [], start: at + 2 };
          at++; continue;
        }
        if (action && ['task', 'activity', 'endactivity'].includes(action.name)) throw new Error(`Line ${at + 1}: Close the current task with @endtask() first.`);
        parts[section].lines.push(current);
        at++;
      }
      if (!ended) throw new Error(`Line ${at + 1}: Missing @endtask().`);
      const parsed = Object.fromEntries([...SECTION].map(name => [name, parseSection(parts[name]?.lines ?? [], parts[name]?.start ?? at + 1, labels)])) as Record<string, JSONContent[]>;
      tasks.push({ title, kind, ...(layout === undefined ? {} : { layout: layout as SuiteScriptTaskDraft['layout'] }), ...(afterCheck === undefined ? {} : { afterCheck: afterCheck as SuiteScriptTaskDraft['afterCheck'] }), ...(showScore === undefined ? {} : { showScore }), instructions: parsed.instructions, content: parsed.content, teacherNotes: parsed.teacherNotes, paperInstructions: parsed.paperInstructions });
      if (!activity && lines.slice(at).every(rest => !rest.trim())) return { bundle: { kind: 'task', task: tasks[0] }, errors: [] };
      if (!activity) throw new Error(`Line ${at + 1}: A single-task draft cannot include another task.`);
    }
    if (activity) throw new Error(`Line ${lines.length}: Missing @endactivity().`);
    throw new Error(`Line ${lines.length}: Missing @endtask().`);
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return { bundle: null, errors };
}

const body = (nodes: JSONContent[], labels: SuiteScriptTypes) => toSuiteScript(nodes, labels).split('\n').slice(1).join('\n');
function taskSource(task: SuiteScriptTaskDraft, labels: SuiteScriptTypes): string {
  const fields = [`kind: ${JSON.stringify(task.kind)}`, ...(['layout', 'afterCheck', 'showScore'] as const).filter(key => task[key] !== undefined).map(key => `${key}: ${JSON.stringify(task[key])}`)];
  const lines = [`@task(${JSON.stringify(task.title)}, ${fields.join(', ')})`];
  for (const [name, nodes] of [['instructions', task.instructions], ['content', task.content], ['teacherNotes', task.teacherNotes], ['paperInstructions', task.paperInstructions]] as const) {
    if (!nodes.length && name !== 'content') continue;
    lines.push(`@${name}()`, body(nodes, labels));
  }
  lines.push('@endtask()');
  return lines.join('\n');
}
export function toSuiteScriptBundle(bundle: SuiteScriptBundle, labels: SuiteScriptTypes = {}): string {
  if (bundle.kind === 'task') return `SuiteScript v1\n${taskSource(bundle.task, labels)}`;
  const a = bundle.activity;
  const fields = ['level', 'aim', 'minutes', 'summary', 'focus'].filter(key => a[key as keyof SuiteScriptActivityDraft] !== undefined).map(key => `${key}: ${JSON.stringify(a[key as keyof SuiteScriptActivityDraft])}`);
  return `SuiteScript v1\n@activity(${JSON.stringify(a.title)}${fields.length ? ', ' + fields.join(', ') : ''})\n${a.tasks.map(task => taskSource(task, labels)).join('\n')}\n@endactivity()`;
}
