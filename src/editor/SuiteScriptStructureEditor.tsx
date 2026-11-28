import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseSuiteScriptBundle, type SuiteScriptBundle } from '../lib/suiteScriptBundle';
import { suiteScriptScopeGroups, suiteScriptScopeIds, type SuiteScriptScopeRow } from '../lib/suiteScriptStructureScope';
import { UiIcon } from '../components/UiIcon';
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
  inline?: boolean;
  onPreview?: (bundle: SuiteScriptBundle | null) => void;
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
function foldEnd(lines: string[], start: number): number {
  if (!/^\s*@[\w-]+\(/.test(lines[start] ?? '')) return start;
  let depth = 0, quoted = false, escaped = false;
  for (let row = start; row < lines.length; row++) {
    for (const char of lines[row]) {
      if (escaped) { escaped = false; continue; }
      if (quoted && char === '\\') { escaped = true; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (!quoted && char === '(') depth++;
      if (!quoted && char === ')') depth--;
    }
    if (depth <= 0) return row > start ? row : start;
  }
  return start;
}

/** Explicit structural workflow. Field-level paste never reaches this component. */
export function SuiteScriptStructureEditor({ kind, title, rows, sharedMetadata = false, loadSource, applyBundle, inline = false, onPreview, onClose }: Props) {
  const groups = useMemo(() => suiteScriptScopeGroups(rows), [rows]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [ids, setIds] = useState<string[]>([]);
  const [stage, setStage] = useState<'scope' | 'loading' | 'editor'>(kind === 'activity' && groups.length ? 'scope' : 'loading');
  const [source, setSource] = useState(`${HEADER}\n`);
  const [initial, setInitial] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [caret, setCaret] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [codeWidth, setCodeWidth] = useState(0);
  const [currentTop, setCurrentTop] = useState(14);
  const [foldedStart, setFoldedStart] = useState<number | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [spellcheck, setSpellcheck] = useState(true);
  const [undoCount, setUndoCount] = useState(0);
  const undoStack = useRef<{ source: string; caret: number }[]>([]);
  const lastTypedAt = useRef(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const codePane = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const previewCallback = useRef(onPreview);
  previewCallback.current = onPreview;
  const parsed = useMemo(() => parseSuiteScriptBundle(source, SUITE_TYPES), [source]);
  const issues = useMemo(() => parsed.errors.map(issueOf), [parsed.errors]);
  const sourceLines = source.split('\n');
  const foldedEnd = foldedStart === null ? -1 : foldEnd(sourceLines, foldedStart);
  const visibleLines = foldedEnd > foldedStart! ? [...sourceLines.slice(0, foldedStart! + 1), `  … ${foldedEnd - foldedStart!} lines folded`, ...sourceLines.slice(foldedEnd + 1)] : sourceLines;
  const visibleValue = visibleLines.join('\n');
  const valid = parsed.bundle?.kind === kind && !issues.length && (parsed.bundle.kind !== 'activity' || parsed.bundle.activity.tasks.length === ids.length);
  const actionError = loadError || saveError || (stage === 'editor' && issues.length ? issues[0].text : stage === 'editor' && parsed.bundle?.kind !== kind ? `This view needs @${kind}(…), not a ${parsed.bundle?.kind ?? 'field'} script.` : stage === 'editor' && kind === 'activity' && parsed.bundle?.kind === 'activity' && parsed.bundle.activity.tasks.length !== ids.length ? `This script has ${parsed.bundle.activity.tasks.length} tasks; the chosen version scope has ${ids.length}.` : '');
  const currentLine = source.slice(0, caret).split('\n').length;
  useLayoutEffect(() => {
    const pane = codePane.current;
    if (!pane) return;
    const observer = new ResizeObserver(() => setCodeWidth(pane.clientWidth));
    observer.observe(pane);
    setCodeWidth(pane.clientWidth);
    return () => observer.disconnect();
  }, [stage]);
  useLayoutEffect(() => {
    const row = gutter.current?.children[currentLine - 1] as HTMLElement | undefined;
    setCurrentTop(row ? row.offsetTop : 14 + (currentLine - 1) * 24);
  }, [currentLine, source, codeWidth, stage]);

  useEffect(() => { if (stage === 'editor' && valid && parsed.bundle) previewCallback.current?.(parsed.bundle); }, [stage, valid, parsed.bundle]);
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
      undoStack.current = []; setUndoCount(0); lastTypedAt.current = 0;
      setSource(value); setInitial(value); setIds(selectedIds); setFoldedStart(null); setStage('editor');
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
  const setEditorValue = (value: string, selection?: number, typing = false) => {
    const next = normalize(value);
    if (next !== source) {
      const now = Date.now();
      if (!typing || now - lastTypedAt.current > 500 || !undoStack.current.length) {
        undoStack.current.push({ source, caret });
        if (undoStack.current.length > 120) undoStack.current.shift();
        setUndoCount(undoStack.current.length);
      }
      lastTypedAt.current = typing ? now : 0;
    }
    setSource(next); setFoldedStart(null); setSaveError('');
    if (selection !== undefined) requestAnimationFrame(() => { const field = textarea.current; field?.focus(); field?.setSelectionRange(selection, selection); setCaret(selection); });
  };
  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    lastTypedAt.current = 0;
    setUndoCount(undoStack.current.length);
    setSource(previous.source); setSaveError(''); setCaret(previous.caret);
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(previous.caret, previous.caret); });
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
  return <div className={inline ? 'sss-inline' : 'sss-overlay'} onMouseDown={event => { if (!inline && event.target === event.currentTarget) close(); }}>
    <section className="sss-dialog" role={inline ? 'region' : 'dialog'} aria-modal={inline ? undefined : 'true'} aria-label={`Edit ${kind} as SuiteScript`}>
      {!inline && <header className="sss-head"><div><span className="sss-kicker">ELT SUITE · SUITESCRIPT</span><h2>Edit {kind === 'task' ? 'whole task' : 'whole activity'}</h2><p>{title}</p></div>{stage !== 'editor' && <button type="button" className="sss-close" aria-label="Close SuiteScript" onClick={close}>×</button>}</header>}
      {stage === 'scope' ? <div className="sss-scope"><span className="sss-kicker">DESTINATION SCOPE</span><h3>Which learner version should this script edit?</h3><p>{scopeMessage}</p>{groups.length ? groups.map(group => <label key={group.id} className="sss-scope-row"><span>{group.title}</span><select value={choices[group.id] ?? ''} onChange={event => { setChoices(current => ({ ...current, [group.id]: event.target.value })); setLoadError(''); }}><option value="">Choose a version</option>{group.options.map(option => <option key={option.id} value={option.id}>{option.version || option.title}</option>)}</select></label>) : <p>All tasks in this activity have one version.</p>}{loadError && <p className="sss-error" role="alert">{loadError}</p>}<div className="sss-scope-actions"><button type="button" className="btn" onClick={close}>Cancel</button><button type="button" className="btn primary" onClick={() => void openScript(choices)}>Open script</button></div></div> : stage === 'loading' ? <div className="sss-loading">Opening the selected {kind}…</div> : <>
        <div className="ss-source sss-workbench">
          <div className="ss-source__toolbar"><span className="sss-tab"><UiIcon name="script" size={15} /> {kind === 'task' ? rows[0]?.version ? `Task · ${rows[0].version}` : 'Task' : 'Activity'}</span><button type="button" onClick={undo} disabled={!undoCount} aria-label="Undo" title="Undo (Ctrl or Command Z)"><UiIcon name="videoUndo" size={15} /><span>Undo</span></button><button type="button" onClick={() => void navigator.clipboard.readText().then(pasteText, () => setSaveError('Clipboard access is unavailable. Use Ctrl+V or Cmd+V.'))} title="Paste plain text"><UiIcon name="paste" size={15} /><span>Paste</span></button><button type="button" onClick={() => void navigator.clipboard.writeText(source).catch(() => setSaveError('Clipboard access is unavailable. Select the script and copy it.'))} title="Copy all SuiteScript"><UiIcon name="copyall" size={15} /><span>Copy all</span></button><button type="button" onClick={() => setSpellcheck(current => !current)} aria-pressed={spellcheck} aria-label="Spelling" title="Spelling">A<span className="ss-source__spell-mark">✓</span></button><button type="button" aria-label="Find and replace" aria-expanded={findOpen} onClick={() => setFindOpen(current => !current)}><UiIcon name="search" size={16} /></button>{kind === 'activity' && groups.length > 0 && <button type="button" className="sss-scope-switch" onClick={changeScope}>Versions</button>}<button type="button" className="ss-source__close" aria-label="Close SuiteScript" onClick={close}><UiIcon name="videoClose" size={16} /></button></div>
          {findOpen && <div className="ss-source__find"><input aria-label="Find" value={findText} onChange={event => setFindText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); findNext(); } }} placeholder="Find" /><input aria-label="Replace with" value={replaceText} onChange={event => setReplaceText(event.target.value)} placeholder="Replace with" /><button type="button" onClick={findNext}>Next</button><button type="button" onClick={replaceOne}>Replace</button><button type="button" onClick={() => { if (findText) setEditorValue(source.split(findText).join(replaceText)); }}>All</button></div>}
          <div className="ss-source__workspace"><div className="ss-source__codebox"><div className="ss-source__current" style={{ top: currentTop - scrollTop }} /><div ref={gutter} className="ss-source__gutter">{visibleLines.map((line, index) => { const sourceLine = foldedEnd > foldedStart! && index > foldedStart! ? index + foldedEnd - foldedStart! : index; const canFold = foldEnd(sourceLines, sourceLine) > sourceLine; return <div key={index} className={issues.some(issue => issue.line === sourceLine + 1) ? 'ss-source__gutter-error' : ''} title={issues.filter(issue => issue.line === sourceLine + 1).map(issue => issue.text).join('\n')}>{canFold && <button type="button" className="ss-source__fold" aria-label={`${foldedStart === sourceLine ? 'Expand' : 'Collapse'} line ${sourceLine + 1}`} onClick={() => { setFoldedStart(foldedStart === sourceLine ? null : sourceLine); setCaret(0); }}>{foldedStart === sourceLine ? '▸' : '▾'}</button>}<span className="ss-source__line-number">{sourceLine + 1}</span><span className="sss-line-measure" style={{ width: Math.max(80, codeWidth - 32) }}>{line || '\u00a0'}</span></div>; })}</div><div ref={codePane} className="ss-source__codepane"><pre ref={highlightRef} className="ss-source__highlight" aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlight(visibleValue) }} /><textarea ref={textarea} className="ss-source__textarea" wrap="soft" aria-label="SuiteScript source" value={visibleValue} readOnly={foldedStart !== null} spellCheck={spellcheck} onChange={event => setEditorValue(event.target.value, undefined, true)} onClick={event => setCaret(event.currentTarget.selectionStart)} onKeyUp={event => setCaret(event.currentTarget.selectionStart)} onScroll={event => { setScrollTop(event.currentTarget.scrollTop); if (highlightRef.current) { highlightRef.current.scrollTop = event.currentTarget.scrollTop; highlightRef.current.scrollLeft = event.currentTarget.scrollLeft; } if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop; }} onPaste={event => { const text = event.clipboardData.getData('text/plain'); if (text === HEADER || text.startsWith(`${HEADER}\n`)) { event.preventDefault(); pasteText(text); } }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey && undoStack.current.length) { event.preventDefault(); undo(); } else if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) { event.preventDefault(); wrapSelection(({ b: 'bold', i: 'italic', u: 'underline' } as Record<string, string>)[event.key.toLowerCase()]); } else if (event.key === 'Tab') { if (nextPlaceholder(event.shiftKey)) event.preventDefault(); else if (!event.shiftKey) { event.preventDefault(); pasteText('  '); } } }} /></div></div></div>
          <div className="ss-source__status"><span tabIndex={0} className={actionError ? 'is-error' : 'is-ready'}>{actionError ? `${issues.length || 1} issue${issues.length === 1 ? '' : 's'}` : 'No problems'}{actionError && <span className="ss-source__tooltip">{[...issues.map(issue => `Line ${issue.line}: ${issue.text}`), ...(saveError || loadError ? [saveError || loadError] : [])].map((message, index) => <span key={index}>{message}</span>)}</span>}</span><span>Ln {currentLine}</span><span className="ss-source__version">SuiteScript v1</span></div>
        </div><footer className="sss-actions"><p>{scopeMessage}{source !== initial ? ' · Unsaved script changes' : ''}</p><div>{actionError && <span className="sss-action-error" role="alert">{actionError}</span>}<button type="button" className="btn" onClick={close}>Cancel</button><button type="button" className="btn primary" disabled={!valid || saving} onClick={() => void apply()}>{saving ? 'Applying…' : `Apply to ${kind}`}</button></div></footer>
      </>}
    </section>
  </div>;
}
