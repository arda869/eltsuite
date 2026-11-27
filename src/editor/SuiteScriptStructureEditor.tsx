import { useEffect, useMemo, useRef, useState } from 'react';
import { TaskRenderer } from '../components/TaskRenderer';
import { LocalActivityMode, LocalLearnerPreviewMode } from '../communicative/LocalActivity';
import { splitKey } from '../lib/questions';
import { parseSuiteScriptBundle, type SuiteScriptBundle } from '../lib/suiteScriptBundle';
import { suiteScriptScopeGroups, suiteScriptScopeIds, type SuiteScriptScopeRow } from '../lib/suiteScriptStructureScope';
import { SUITE_TYPES } from './TaskEditor';
import './suite-script-source.css';
import './suite-script-structure.css';

type Props = {
  kind: 'task' | 'activity';
  title: string;
  rows: SuiteScriptScopeRow[];
  classId?: string;
  sharedMetadata?: boolean;
  loadSource: (ids: string[]) => Promise<string>;
  applyBundle: (bundle: SuiteScriptBundle, ids: string[]) => Promise<void>;
  onClose: () => void;
};
type LineIssue = { line: number; text: string };
const HEADER = 'SuiteScript v1';
const issueOf = (message: string): LineIssue => {
  const match = message.match(/^Line (\d+):\s*(.*)$/s);
  return { line: match ? Number(match[1]) : 1, text: match ? match[2] : message };
};
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
function highlight(value: string): string {
  return value.split('\n').map((line, index) => {
    if (index === 0) return `<span class="ss-hdr">${escapeHtml(line)}</span>`;
    let html = '', last = 0;
    const pattern = /(@[A-Za-z][\w-]*)(?=\()|("(?:\\.|[^"\\])*")|\b(\d+(?:\.\d+)?|true|false)\b|\b(title|kind|level|aim|minutes|summary|focus|layout|afterCheck|showScore|hidden|locked|teacherOnly|prompt|options)(?=\s*:)/g;
    for (const match of line.matchAll(pattern)) {
      const at = match.index ?? 0;
      html += escapeHtml(line.slice(last, at));
      html += `<span class="${match[1] ? 'ss-command' : match[2] ? 'ss-string' : match[3] ? 'ss-number' : 'ss-key'}">${escapeHtml(match[0])}</span>`;
      last = at + match[0].length;
    }
    return html + escapeHtml(line.slice(last));
  }).join('\n') + '\n';
}
const normalize = (value: string): string => value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

/** Explicit structural workflow. Field-level paste never reaches this component. */
export function SuiteScriptStructureEditor({ kind, title, rows, classId = '', sharedMetadata = false, loadSource, applyBundle, onClose }: Props) {
  const groups = useMemo(() => suiteScriptScopeGroups(rows), [rows]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [ids, setIds] = useState<string[]>([]);
  const [stage, setStage] = useState<'scope' | 'loading' | 'editor'>(kind === 'activity' && groups.length ? 'scope' : 'loading');
  const [source, setSource] = useState(`${HEADER}\n`);
  const [initial, setInitial] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastValid, setLastValid] = useState<SuiteScriptBundle | null>(null);
  const [previewTask, setPreviewTask] = useState(0);
  const [caret, setCaret] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const parsed = useMemo(() => parseSuiteScriptBundle(source, SUITE_TYPES), [source]);
  const issues = useMemo(() => parsed.errors.map(issueOf), [parsed.errors]);
  const valid = parsed.bundle?.kind === kind && !issues.length && (parsed.bundle.kind !== 'activity' || parsed.bundle.activity.tasks.length === ids.length);
  const actionError = loadError || saveError || (stage === 'editor' && issues.length ? issues[0].text : stage === 'editor' && parsed.bundle?.kind !== kind ? `This view needs @${kind}(…), not a ${parsed.bundle?.kind ?? 'field'} script.` : stage === 'editor' && kind === 'activity' && parsed.bundle?.kind === 'activity' && parsed.bundle.activity.tasks.length !== ids.length ? `This script has ${parsed.bundle.activity.tasks.length} tasks; the chosen version scope has ${ids.length}.` : '');
  const shown = valid ? parsed.bundle : lastValid;
  const tasks = shown ? shown.kind === 'task' ? [shown.task] : shown.activity.tasks : [];
  const active = tasks[Math.min(previewTask, tasks.length - 1)];
  const previewRow = rows.find(row => row.id === ids[previewTask]);
  const previewGroup = groups.find(group => group.id === previewRow?.group);
  const learnerSeat = previewGroup ? Math.max(0, previewGroup.options.findIndex(option => option.id === previewRow?.id)) : 0;
  const currentLine = source.slice(0, caret).split('\n').length;

  useEffect(() => { if (valid && parsed.bundle) setLastValid(parsed.bundle); }, [valid, parsed.bundle]);
  useEffect(() => {
    if (opened.current || stage !== 'loading') return;
    opened.current = true;
    void openScript({});
    // Initial load only. Scope choices are submitted with Open script.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openScript = async (selected: Record<string, string>) => {
    let selectedIds: string[];
    try { selectedIds = kind === 'task' ? [rows[0]?.id].filter(Boolean) : suiteScriptScopeIds(rows, selected); }
    catch (error) { setLoadError((error as Error).message); setStage('scope'); return; }
    if (!selectedIds.length) { setLoadError('Choose a task before editing SuiteScript.'); setStage('scope'); return; }
    setStage('loading'); setLoadError(''); setSaveError('');
    try {
      const value = normalize(await loadSource(selectedIds));
      if (!value.startsWith(`${HEADER}\n`)) throw new Error('This activity could not be exported as SuiteScript. Reopen it and try again.');
      setSource(value); setInitial(value); setIds(selectedIds); setPreviewTask(0); setStage('editor');
      requestAnimationFrame(() => textarea.current?.focus());
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'This script could not be opened.'); setStage('scope'); }
  };
  const close = () => {
    if (source !== initial && !window.confirm('Leave SuiteScript without applying these changes?')) return;
    onClose();
  };
  const changeScope = () => {
    if (source !== initial && !window.confirm('Change version scope and discard these SuiteScript changes?')) return;
    setStage('scope'); setLoadError(''); setSaveError('');
  };
  const setEditorValue = (value: string, selection?: number) => {
    setSource(normalize(value)); setSaveError('');
    if (selection !== undefined) requestAnimationFrame(() => { const field = textarea.current; field?.focus(); field?.setSelectionRange(selection, selection); setCaret(selection); });
  };
  const pasteText = (text: string) => {
    const clean = normalize(text);
    if (clean === HEADER || clean.startsWith(`${HEADER}\n`)) { setEditorValue(clean, clean.length); return; }
    const field = textarea.current;
    const from = field?.selectionStart ?? source.length, to = field?.selectionEnd ?? from;
    setEditorValue(source.slice(0, from) + clean + source.slice(to), from + clean.length);
  };
  const wrapSelection = (command: string) => {
    const field = textarea.current;
    if (!field) return;
    const from = field.selectionStart, to = field.selectionEnd;
    const selected = source.slice(from, to);
    if (!selected) return;
    const replacement = `@${command}(${JSON.stringify(selected)})`;
    setEditorValue(source.slice(0, from) + replacement + source.slice(to), from + replacement.length);
  };
  const nextPlaceholder = (reverse: boolean) => {
    const field = textarea.current;
    if (!field) return false;
    const placeholders = [...source.matchAll(/‹[^›]+›/g)];
    if (!placeholders.length) return false;
    const at = field.selectionStart;
    const match = reverse ? [...placeholders].reverse().find(item => (item.index ?? 0) < at) ?? placeholders.at(-1) : placeholders.find(item => (item.index ?? 0) > at) ?? placeholders[0];
    if (!match) return false;
    field.setSelectionRange(match.index ?? 0, (match.index ?? 0) + match[0].length);
    return true;
  };
  const apply = async () => {
    if (!valid || !parsed.bundle || saving) return;
    setSaving(true); setSaveError('');
    try { await applyBundle(parsed.bundle, ids); onClose(); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'This change could not be applied. Your script remains here.'); }
    finally { setSaving(false); }
  };
  const findNext = () => {
    if (!findText) return;
    const field = textarea.current;
    const start = field?.selectionEnd ?? 0;
    const at = source.indexOf(findText, start);
    const found = at < 0 ? source.indexOf(findText) : at;
    if (found < 0) return;
    field?.focus(); field?.setSelectionRange(found, found + findText.length); setCaret(found);
  };
  const replaceOne = () => {
    const field = textarea.current;
    if (!field || !findText) return;
    if (source.slice(field.selectionStart, field.selectionEnd) !== findText) { findNext(); return; }
    const from = field.selectionStart, to = field.selectionEnd;
    setEditorValue(source.slice(0, from) + replaceText + source.slice(to), from + replaceText.length);
  };
  const scopeMessage = kind === 'task' ? 'Only the selected task changes. Other tasks and learner versions stay as they are.' : sharedMetadata ? 'Choose one A/B destination. Other learner versions and shared resource details stay as they are.' : 'Choose one destination from every A/B set. Other learner versions stay as they are.';
  return <div className="sss-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="sss-dialog" role="dialog" aria-modal="true" aria-label={`Edit ${kind} as SuiteScript`}>
      <header className="sss-head"><div><span className="sss-kicker">ELT SUITE · SUITESCRIPT</span><h2>Edit {kind === 'task' ? 'whole task' : 'whole activity'}</h2><p>{title}</p></div><button type="button" className="sss-close" aria-label="Close SuiteScript" onClick={close}>×</button></header>
      {stage === 'scope' ? <div className="sss-scope"><span className="sss-kicker">DESTINATION SCOPE</span><h3>Which learner version should this script edit?</h3><p>{scopeMessage}</p>{groups.length ? groups.map(group => <label key={group.id} className="sss-scope-row"><span>{group.title}</span><select value={choices[group.id] ?? ''} onChange={event => { setChoices(current => ({ ...current, [group.id]: event.target.value })); setLoadError(''); }}><option value="">Choose a version</option>{group.options.map(option => <option key={option.id} value={option.id}>{option.version || option.title}</option>)}</select></label>) : <p>All tasks in this activity have one version.</p>}{loadError && <p className="sss-error" role="alert">{loadError}</p>}<div className="sss-scope-actions"><button type="button" className="btn" onClick={close}>Cancel</button><button type="button" className="btn primary" onClick={() => void openScript(choices)}>Open script</button></div></div> : stage === 'loading' ? <div className="sss-loading">Opening the selected {kind}…</div> : <>
        <div className="ss-source sss-workbench">
          <div className="ss-source__toolbar"><span className="sss-tab">@_ {kind === 'task' ? 'Task' : 'Activity'}</span><button type="button" onClick={() => void navigator.clipboard.readText().then(pasteText, () => setSaveError('Clipboard access is unavailable. Use Ctrl+V or Cmd+V.'))} title="Paste plain text">▤ <span>Paste</span></button><button type="button" onClick={() => void navigator.clipboard.writeText(source).catch(() => setSaveError('Clipboard access is unavailable. Select the script and copy it.'))} title="Copy all SuiteScript">▣ <span>Copy all</span></button><button type="button" aria-label="Find and replace" aria-expanded={findOpen} onClick={() => setFindOpen(current => !current)}>⌕</button>{kind === 'activity' && groups.length > 0 && <button type="button" className="sss-scope-switch" onClick={changeScope}>Versions</button>}<button type="button" className="ss-source__close" aria-label="Close SuiteScript" onClick={close}>×</button></div>
          {findOpen && <div className="ss-source__find"><input aria-label="Find" value={findText} onChange={event => setFindText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); findNext(); } }} placeholder="Find" /><input aria-label="Replace with" value={replaceText} onChange={event => setReplaceText(event.target.value)} placeholder="Replace with" /><button type="button" onClick={findNext}>Next</button><button type="button" onClick={replaceOne}>Replace</button><button type="button" onClick={() => { if (findText) setEditorValue(source.split(findText).join(replaceText)); }}>All</button></div>}
          <div className="ss-source__workspace"><div className="ss-source__codebox"><div className="ss-source__current" style={{ top: 14 + (currentLine - 1) * 24 - scrollTop }} /><div ref={gutter} className="ss-source__gutter">{source.split('\n').map((_, index) => <div key={index} className={issues.some(issue => issue.line === index + 1) ? 'ss-source__gutter-error' : ''} title={issues.filter(issue => issue.line === index + 1).map(issue => issue.text).join('\n')}>{index + 1}</div>)}</div><div className="ss-source__codepane"><pre ref={highlightRef} className="ss-source__highlight" aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlight(source) }} /><textarea ref={textarea} className="ss-source__textarea" aria-label="SuiteScript source" value={source} spellCheck={false} onChange={event => setEditorValue(event.target.value)} onClick={event => setCaret(event.currentTarget.selectionStart)} onKeyUp={event => setCaret(event.currentTarget.selectionStart)} onScroll={event => { setScrollTop(event.currentTarget.scrollTop); if (highlightRef.current) { highlightRef.current.scrollTop = event.currentTarget.scrollTop; highlightRef.current.scrollLeft = event.currentTarget.scrollLeft; } if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop; }} onPaste={event => { const text = event.clipboardData.getData('text/plain'); if (text === HEADER || text.startsWith(`${HEADER}\n`)) { event.preventDefault(); pasteText(text); } }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) { event.preventDefault(); wrapSelection(({ b: 'bold', i: 'italic', u: 'underline' } as Record<string, string>)[event.key.toLowerCase()]); } else if (event.key === 'Tab') { if (nextPlaceholder(event.shiftKey)) event.preventDefault(); else if (!event.shiftKey) { event.preventDefault(); pasteText('  '); } } }} /></div></div><aside className="ss-source__preview"><div className="ss-source__preview-head"><span>LEARNER PREVIEW</span><span>{valid ? 'Updating as you type' : 'Last valid preview'}</span></div><div className="ss-source__preview-body">{tasks.length > 1 && <div className="sss-task-tabs" role="tablist" aria-label="Preview task">{tasks.map((task, index) => <button key={index} type="button" role="tab" aria-selected={previewTask === index} onClick={() => setPreviewTask(index)}>{index + 1}. {task.title}</button>)}</div>}{active ? <div className="sss-preview-task"><h3>{active.title}</h3>{active.instructions.length > 0 && <p>{active.instructions.map(node => (node.content ?? []).map(child => child.text ?? '').join('')).join(' ')}</p>}<LocalLearnerPreviewMode.Provider value={learnerSeat}><LocalActivityMode.Provider value={true}><TaskRenderer content={splitKey({ type: 'doc', content: active.content.length ? active.content : [{ type: 'paragraph' }] }, true).content} responses={{}} hideAnswers disabled classId={classId} /></LocalActivityMode.Provider></LocalLearnerPreviewMode.Provider></div> : <p className="sss-preview-empty">Write a valid SuiteScript task to see its learner view here.</p>}</div></aside></div>
          <div className="ss-source__status"><span tabIndex={0} className={actionError ? 'is-error' : 'is-ready'}>{actionError ? `${issues.length || 1} issue${issues.length === 1 ? '' : 's'}` : 'No problems'}{actionError && <span className="ss-source__tooltip">{[...issues.map(issue => `Line ${issue.line}: ${issue.text}`), ...(saveError || loadError ? [saveError || loadError] : [])].map((message, index) => <span key={index}>{message}</span>)}</span>}</span><span>Ln {currentLine}</span><span className="ss-source__version">SuiteScript v1</span></div>
        </div><footer className="sss-actions"><p>{scopeMessage}{source !== initial ? ' · Unsaved script changes' : ''}</p><div>{actionError && <span className="sss-action-error" role="alert">{actionError}</span>}<button type="button" className="btn" onClick={close}>Cancel</button><button type="button" className="btn primary" disabled={!valid || saving} onClick={() => void apply()}>{saving ? 'Applying…' : `Apply to ${kind}`}</button></div></footer>
      </>}
    </section>
  </div>;
}
