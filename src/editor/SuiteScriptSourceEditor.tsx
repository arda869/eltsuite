import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Editor, JSONContent } from '@tiptap/react';
import { AddWindow } from '../components/AddWindow';
import { FileBrowser } from '../components/FileBrowser';
import { FileIcon } from '../components/FileIcon';
import { TaskRenderer } from '../components/TaskRenderer';
import { LocalActivityMode, LocalLearnerPreviewMode } from '../communicative/LocalActivity';
import { auth } from '../lib/firebase';
import { libName, useDrive, useMyOrg, type DriveFolder } from '../lib/admin';
import { useFolderDocs, useMyDocs, type SharedDoc, type SharedFolder } from '../lib/sharedDocs';
import { parseSuiteScript, SUITE_SCRIPT_HEADER, type SuiteScriptTypes } from '../lib/suiteScript';
import { suiteScriptGuide, type SuiteScriptCatalogEntry } from '../lib/suiteScriptGuide';
import { ensureSuiteScriptReference, validSuiteScriptReference, type SuiteScriptDestination } from '../lib/suiteScriptReferences';
import type { ArchiveItem } from '../lib/archive';
import { splitKey } from '../lib/questions';
import starterCatalogJson from './suiteScriptStarterCatalog.json';
import questionCatalogJson from './suiteScriptQuestionCatalog.json';
import './suite-script-source.css';

type Starter = { key: string; label: string; section: string; body?: string };
type QuestionStarter = { key: string; label: string; group: string; body: string };
const starterCatalog = starterCatalogJson as Starter[];
const questionCatalog = questionCatalogJson as QuestionStarter[];
const starterIds = new Set([...starterCatalog, ...questionCatalog].flatMap(item => [...(item.body ?? '').matchAll(/"(?:id|activityItemId|docKey)":"([^"]+)"/g)].map(match => match[1])));
const HEADER_START = SUITE_SCRIPT_HEADER.length + 1;
const MAX_HISTORY = 120;
const TIMELINE_STARTER = `@timeline(
  title: "Timeline",
  sentence: "We met, worked together, and finished the project.",
  now: 600,
  showNow: true,
  ends: true,
  marks: [
    {kind: "event", x: 180, label: "We met", side: "above"},
    {kind: "period", x: 300, x2: 520, label: "Working together", side: "below"},
    {kind: "event", x: 760, label: "Project complete", side: "above"}
  ]
)`;

const basic = [
  { key: 'heading', label: '@heading', body: '@heading("‹Heading›")' },
  { key: 'bold', label: '@bold', body: '@bold("‹Text›")' },
  { key: 'italic', label: '@italic', body: '@italic("‹Text›")' },
  { key: 'underline', label: '@underline', body: '@underline("‹Text›")' },
  { key: 'strike', label: '@strike', body: '@strike("‹Text›")' },
  { key: 'audio', label: '@audio', body: '@audio("‹Choose a recording›")' },
  { key: 'image', label: '@image', body: '@image("‹Choose an image›", alt: "‹Describe the image›")' },
  { key: 'video', label: '@video', body: '@video("‹Choose a video›")' },
  { key: 'pdf', label: '@pdf', body: '@pdf("‹Type a PDF reference›")' },
  { key: 'question', label: '@question', body: '@question(type: "‹Question type›")' },
  { key: 'timeline', label: '@timeline', body: TIMELINE_STARTER },
];

type Prepared = { content: JSONContent[]; warnings?: string[] };
export type SuiteScriptSourceEditorProps = {
  editor: Editor;
  labels: SuiteScriptTypes;
  commands: SuiteScriptCatalogEntry[];
  /** Convert existing media to authorised typed references before code is shown. */
  loadSource: () => Promise<string>;
  /** Resolve file permissions and limit content to this editor's audience. */
  prepareContent: (parsed: JSONContent[]) => Promise<Prepared>;
  /** Apply an already validated document to the original field. May reject on an external edit. */
  applyContent: (content: JSONContent[]) => void | Promise<void>;
  onClose: () => void;
  className?: string;
  title?: string;
  textOnly?: boolean;
  previewClassId?: string;
  /** Zero-based seat represented by the current learner version. */
  previewLearnerSeat?: number;
  /** A private teacher field must never be presented as learner-visible. */
  previewAudience?: 'learner' | 'teacher';
  /** File choices are shown only where the resolver can make them usable. */
  referenceDestination: SuiteScriptDestination;
  /** Optional host picker for saved questions and organisation-specific forms. */
  chooseDynamic?: (key: 'bankpick' | 'tt-org') => Promise<string | null>;
};

type Issue = { line: number; text: string };
type Suggestion = { key: string; label: string; body?: string; kind: 'command' | 'question' | 'file' | 'dynamic'; fileAction?: 'browse' | 'type' };
type SuggestionState = { mode: 'command' | 'question' | 'file'; items: Suggestion[]; start: number; end: number; top: number; left: number };
type FileChoice = { kind: 'audio' | 'video' | 'image' | 'pdf'; start: number; end: number };

function sharedFileFits(doc: SharedDoc, kind: FileChoice['kind'], classId: string): boolean {
  if (doc.kind === 'file' && doc.uploadStatus !== 'ready') return false;
  const sharedWithClass = !!doc.classes?.[classId]?.role;
  if (kind === 'pdf') return sharedWithClass && (doc.kind === 'pdf' || doc.kind === 'file' && doc.file?.type === 'application/pdf');
  if (kind === 'image') return sharedWithClass && doc.kind === 'file' && !!doc.file?.type.startsWith('image/');
  if (kind === 'audio') return doc.kind === 'file' && ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg'].includes(doc.file?.type ?? '');
  if (kind === 'video') return doc.kind === 'file' && ['video/mp4', 'video/webm'].includes(doc.file?.type ?? '');
  return false;
}

function SharedFileList({ kind, classId, files, busy, onPick, empty }: { kind: FileChoice['kind']; classId: string; files: SharedDoc[] | null; busy: boolean; onPick: (doc: SharedDoc) => void; empty: string }) {
  const [query, setQuery] = useState('');
  const shown = (files ?? []).filter(doc => sharedFileFits(doc, kind, classId) && doc.title.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="fb">
    <div className="fb-bar"><span className="fb-search"><input type="search" aria-label="Search files" placeholder="Search files" value={query} onChange={event => setQuery(event.target.value)} /></span></div>
    <div className="fb-scroll"><div className="fb-items list">
      {files === null ? <p className="hint fb-wait">Opening files…</p> : shown.length ? shown.map(doc => <button key={doc.id} type="button" className="fb-item" disabled={busy} onClick={() => onPick(doc)}><span className="fb-kind"><FileIcon kind={doc.kind} size={18} label={false} /></span><span className="fb-name">{doc.title}</span></button>) : <p className="hint fb-wait">{query ? 'No files match this search.' : empty}</p>}
    </div></div>
  </div>;
}

function MySharedFiles({ kind, classId, busy, onPick }: { kind: FileChoice['kind']; classId: string; busy: boolean; onPick: (doc: SharedDoc) => void }) {
  const { mine, withMe } = useMyDocs(auth.currentUser?.uid);
  const files = mine === null || withMe === null ? null : [...new Map([...mine, ...withMe].map(doc => [doc.id, doc])).values()];
  return <SharedFileList kind={kind} classId={classId} files={files} busy={busy} onPick={onPick} empty="No PDFs shared with this Class yet." />;
}

function OrgFolderFiles({ folder, uid, kind, classId, busy, onPick }: { folder: DriveFolder; uid: string; kind: FileChoice['kind']; classId: string; busy: boolean; onPick: (doc: SharedDoc) => void }) {
  const files = useFolderDocs(folder as unknown as SharedFolder, uid);
  return <SharedFileList kind={kind} classId={classId} files={files} busy={busy} onPick={onPick} empty={kind === 'image' || kind === 'pdf' ? `No ${kind === 'pdf' ? 'PDFs' : 'pictures'} shared with this Class in this folder.` : `No ${kind === 'audio' ? 'recordings' : 'videos'} in this folder.`} />;
}

function OrganisationFiles({ kind, classId, busy, onPick }: { kind: FileChoice['kind']; classId: string; busy: boolean; onPick: (doc: SharedDoc) => void }) {
  const org = useMyOrg();
  const folders = useDrive(org);
  const uid = auth.currentUser?.uid ?? '';
  const available = (folders ?? []).filter(folder => folder.owner === uid || (folder.memberIds ?? []).includes(uid));
  const [folderId, setFolderId] = useState('');
  const chosen = available.find(folder => folder.id === folderId) ?? available[0];
  if (!org) return <p className="hint fb-wait">Join an organisation to browse its files.</p>;
  if (!folders) return <p className="hint fb-wait">Opening {libName(org)}…</p>;
  if (!chosen) return <p className="hint fb-wait">No organisation folders are available to you.</p>;
  return <div className="fb"><div className="fb-bar"><nav className="fb-path" aria-label="Organisation folder">{available.map(folder => <button key={folder.id} type="button" className={chosen.id === folder.id ? 'on' : ''} onClick={() => setFolderId(folder.id)}>{folder.name}</button>)}</nav></div><OrgFolderFiles key={chosen.id} folder={chosen} uid={uid} kind={kind} classId={classId} busy={busy} onPick={onPick} /></div>;
}

function stripHeaders(value: string): string {
  let text = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  while (text === SUITE_SCRIPT_HEADER || text.startsWith(`${SUITE_SCRIPT_HEADER}\n`)) text = text === SUITE_SCRIPT_HEADER ? '' : text.slice(HEADER_START);
  return text;
}
function protectedSource(value: string): string {
  const normal = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const body = normal.startsWith(`${SUITE_SCRIPT_HEADER}\n`) ? normal.slice(HEADER_START) : normal === SUITE_SCRIPT_HEADER ? '' : normal;
  return `${SUITE_SCRIPT_HEADER}\n${stripHeaders(body)}`;
}
function lineAt(value: string, at: number): number { return value.slice(0, at).split('\n').length; }
function parseIssue(error: string): Issue {
  const match = error.match(/^Line (\d+):\s*(.*)$/s);
  return { line: match ? Number(match[1]) : 1, text: match ? match[2] : error };
}
function sourceIssues(value: string): Issue[] {
  const issues: Issue[] = [];
  const placeholder = /‹[^›]+›/g;
  for (const match of value.matchAll(placeholder)) issues.push({ line: lineAt(value, match.index), text: 'Fill this placeholder before the change can appear.' });
  for (const match of value.matchAll(/ELTSUITE-[A-Za-z0-9-]+/g)) {
    if (!validSuiteScriptReference(match[0])) issues.push({ line: lineAt(value, match.index), text: 'This file reference has an invalid check digit. Choose the exact file again.' });
  }
  return issues;
}
function freshen(body: string): string {
  const replacements = new Map<string, string>();
  for (const match of body.matchAll(/"(?:id|activityItemId|docKey)":"([^"]+)"/g)) if (!replacements.has(match[1])) replacements.set(match[1], crypto.randomUUID().replace(/-/g, '').slice(0, 12));
  // Map exact string values, including any internal references to those IDs.
  return body.replace(/"(?:\\.|[^"\\])*"/g, literal => {
    try { const old = JSON.parse(literal) as string; return replacements.has(old) ? JSON.stringify(replacements.get(old)) : literal; }
    catch { return literal; }
  });
}
function collectInternalIds(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) { value.forEach(item => collectInternalIds(item, output)); return output; }
  if (!value || typeof value !== 'object') return output;
  for (const [key, item] of Object.entries(value)) {
    if (['id', 'activityItemId', 'docKey'].includes(key) && typeof item === 'string' && item) output.add(item);
    collectInternalIds(item, output);
  }
  return output;
}
function remapIds(content: JSONContent[], originals: Set<string>, generated: Map<string, string>): JSONContent[] {
  const seen = new Set<string>();
  const replaceStrings = (value: unknown, map: Map<string, string>): unknown => {
    if (typeof value === 'string') return map.get(value) ?? value;
    if (Array.isArray(value)) return value.map(item => replaceStrings(item, map));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'text' ? item : replaceStrings(item, map)]));
  };
  return content.map((block, index) => {
    const map = new Map<string, string>();
    const ids = collectInternalIds(block);
    for (const id of ids) {
      const duplicate = seen.has(id);
      seen.add(id);
      if (!duplicate && (!starterIds.has(id) || originals.has(id))) continue;
      const key = `${index}:${id}`;
      if (!generated.has(key)) generated.set(key, crypto.randomUUID().replace(/-/g, '').slice(0, 12));
      map.set(id, generated.get(key)!);
    }
    return map.size ? replaceStrings(block, map) as JSONContent : block;
  });
}
function starterFor(item: Starter): string | undefined {
  if (item.key === 'timeline') return TIMELINE_STARTER;
  if (item.key === 'image') return '@image("‹Choose an image›", alt: "‹Describe the image›")';
  if (item.key === 'pdf') return '@pdf("‹Type a PDF reference›")';
  return item.body ? formatNativeStarter(freshen(item.body)) : undefined;
}
function formatNativeStarter(body: string): string {
  if (body.length < 190) return body;
  const match = body.match(/^(.*?\bdata:\s*)(\{[\s\S]*\})(\s*\))$/);
  if (!match) return body;
  try {
    const data = JSON.parse(match[2]) as Record<string, unknown>;
    const lines = Object.entries(data).map(([key, value]) => {
      if (Array.isArray(value) && value.length > 1) return `  ${JSON.stringify(key)}: [\n${value.map(entry => `    ${JSON.stringify(entry)}`).join(',\n')}\n  ]`;
      return `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`;
    });
    return `${match[1]}{\n${lines.join(',\n')}\n}${match[3]}`;
  } catch { return body; }
}
function aiInstructions(commands: SuiteScriptCatalogEntry[], textOnly: boolean): string {
  if (textOnly) return `${SUITE_SCRIPT_HEADER}\nWrite one instruction as ordinary prose with inline @bold, @italic, @underline, @strike, @audio or @video commands. Use exact authorised ELTSUITE references for media. Do not add headings, questions, blocks, another learner version, private notes or activity metadata. Return the SuiteScript v1 line followed by only the instruction, with no Markdown fence.`;
  const starters = starterCatalog.map(item => `${item.section} — ${item.label} [${item.key}]\n${item.key === 'tt-org' || item.key === 'bankpick' ? 'Choose the actual item in ELT Suite. Do not invent its private ID.' : item.key === 'timeline' ? TIMELINE_STARTER : item.key === 'image' ? '@image("‹Choose an image›", alt: "‹Describe the image›")' : item.key === 'pdf' ? '@pdf("‹Type a PDF reference›")' : item.body ?? ''}`).join('\n\n');
  return `${suiteScriptGuide(commands)}\n\nCOMPLETE NATIVE STARTERS (${starterCatalog.length} Add entries)\nThese are genuine starting structures from the editor insertion registry. Replace visible sample content, but keep each native data shape. An existing media file needs its exact authorised ELTSUITE reference. A timeline can contain any number of named marks in its marks list.\n\n${starters}`;
}
function escaped(text: string): string { return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char)); }
function highlighted(text: string): string {
  return text.split('\n').map((line, index) => {
    if (index === 0) return `<span class="ss-hdr">${escaped(line)}</span>`;
    const pattern = /(@[A-Za-z][\w-]*)(?=\()|("(?:\\.|[^"\\])*")|\b(\d+(?:\.\d+)?|true|false)\b|\b(title|sentence|now|showNow|ends|marks|kind|x|x2|label|side|color|count|type|prompt|options|teacherOnly|answer|alt)(?=\s*:)/g;
    let html = ''; let last = 0; let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
      html += escaped(line.slice(last, match.index));
      html += `<span class="${match[1] ? 'ss-command' : match[2] ? 'ss-string' : match[3] ? 'ss-number' : 'ss-key'}">${escaped(match[0])}</span>`;
      last = match.index + match[0].length;
    }
    return html + escaped(line.slice(last));
  }).join('\n') + '\n';
}

export function SuiteScriptSourceEditor({ editor, labels, commands, loadSource, prepareContent, applyContent, onClose, className = '', title = 'SuiteScript', textOnly = false, previewClassId = '', previewLearnerSeat = 0, previewAudience = 'learner', referenceDestination, chooseDynamic }: SuiteScriptSourceEditorProps) {
  const [value, setValue] = useState(`${SUITE_SCRIPT_HEADER}\n`);
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [caret, setCaret] = useState(HEADER_START);
  const [scrollTop, setScrollTop] = useState(0);
  const [suggestions, setSuggestions] = useState<SuggestionState | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [spellcheck, setSpellcheck] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [fileChoice, setFileChoice] = useState<FileChoice | null>(null);
  const [fileSource, setFileSource] = useState<'my' | 'org'>('my');
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [previewDoc, setPreviewDoc] = useState<JSONContent>(() => editor.getJSON());
  const textarea = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const loadRef = useRef(loadSource);
  const prepareRef = useRef(prepareContent);
  const applyRef = useRef(applyContent);
  const valueRef = useRef(value);
  const revision = useRef(0);
  const applyQueue = useRef<Promise<void>>(Promise.resolve());
  const applied = useRef('');
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const originalIds = useRef(collectInternalIds(editor.getJSON().content ?? []));
  const generatedIds = useRef(new Map<string, string>());
  const lineCount = value.split('\n').length;
  prepareRef.current = prepareContent;
  applyRef.current = applyContent;

  useEffect(() => {
    let active = true;
    void loadRef.current().then(source => {
      if (!active) return;
      const next = protectedSource(source);
      valueRef.current = next; applied.current = next; history.current = [next]; historyIndex.current = 0;
      setValue(next); setLoading(false);
      window.setTimeout(() => textarea.current?.focus(), 0);
    }).catch(error => { if (active) { setStatusError(error instanceof Error ? error.message : 'Could not prepare this field for SuiteScript.'); setLoading(false); } });
    return () => { active = false; revision.current++; };
  }, []);
  useEffect(() => {
    const update = () => setPreviewDoc(editor.getJSON());
    editor.on('update', update);
    return () => { editor.off('update', update); };
  }, [editor]);

  const available = useMemo(() => {
    const keys = new Set(commands.map(command => command.key));
    return textOnly ? [] : starterCatalog.filter(item => keys.has(item.key) && (item.body || item.key === 'timeline' || item.key === 'image' || item.key === 'pdf' || ((item.key === 'tt-org' || item.key === 'bankpick') && chooseDynamic)));
  }, [commands, textOnly, chooseDynamic]);

  useEffect(() => {
    if (loading || !history.current.length) return;
    const generation = ++revision.current;
    const parsed = parseSuiteScript(value, labels);
    const nextIssues = [...parsed.errors.map(parseIssue), ...sourceIssues(value)];
    setIssues(nextIssues);
    if (nextIssues.length) { setBusy(false); return; }
    if (value === applied.current) { setBusy(false); setStatusError(''); return; }
    setBusy(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const prepared = await prepareRef.current(remapIds(parsed.content, originalIds.current, generatedIds.current));
          if (generation !== revision.current || value !== valueRef.current) return;
          editor.schema.nodeFromJSON({ type: 'doc', content: prepared.content.length ? prepared.content : [{ type: 'paragraph' }] }).check();
          // Apply calls may be asynchronous in a host editor. Keep their order
          // so an older save cannot finish after a newer valid edit or Undo.
          const applyCurrent = async () => {
            if (generation !== revision.current || value !== valueRef.current) return;
            await applyRef.current(prepared.content);
          };
          const queued = applyQueue.current.then(applyCurrent, applyCurrent);
          applyQueue.current = queued.then(() => {}, () => {});
          await queued;
          if (generation !== revision.current || value !== valueRef.current) return;
          applied.current = value; setWarnings(prepared.warnings ?? []); setStatusError(''); setBusy(false);
        } catch (error) {
          if (generation !== revision.current || value !== valueRef.current) return;
          setStatusError(error instanceof Error ? error.message : String(error)); setBusy(false);
        }
      })();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [value, labels, loading, editor]);

  function remember(next: string) {
    if (history.current[historyIndex.current] !== next) {
      revision.current++;
      history.current = [...history.current.slice(0, historyIndex.current + 1), next].slice(-MAX_HISTORY);
      historyIndex.current = history.current.length - 1;
    }
    valueRef.current = next; setValue(next);
  }
  function select(start: number, end = start) { window.requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(start, end); setCaret(start); }); }
  function replaceRange(start: number, end: number, text: string) {
    const a = Math.max(HEADER_START, start), b = Math.max(a, end);
    const next = valueRef.current.slice(0, a) + text + valueRef.current.slice(b);
    remember(protectedSource(next)); select(a + text.length);
  }
  function insert(text: string) {
    const node = textarea.current; if (!node) return;
    replaceRange(node.selectionStart, node.selectionEnd, stripHeaders(text));
    setSuggestions(null);
  }
  function undo() { if (historyIndex.current <= 0) return; revision.current++; historyIndex.current--; valueRef.current = history.current[historyIndex.current]; setValue(valueRef.current); select(Math.min(textarea.current?.selectionStart ?? HEADER_START, valueRef.current.length)); }
  function redo() { if (historyIndex.current >= history.current.length - 1) return; revision.current++; historyIndex.current++; valueRef.current = history.current[historyIndex.current]; setValue(valueRef.current); select(Math.min(textarea.current?.selectionStart ?? HEADER_START, valueRef.current.length)); }
  function movePlaceholder(reverse = false) {
    const node = textarea.current; if (!node) return false;
    const places = [...valueRef.current.matchAll(/‹[^›]+›/g)].map(match => ({ start: match.index, end: match.index + match[0].length }));
    const found = reverse ? places.filter(place => place.start < node.selectionStart).at(-1) : places.find(place => place.start >= node.selectionEnd);
    if (!found) return false;
    select(found.start, found.end); return true;
  }
  function insertTemplate(body: string, start: number, end: number) {
    replaceRange(start, end, body); setSuggestions(null);
    const place = /‹[^›]+›/.exec(body);
    if (place) select(start + place.index, start + place.index + place[0].length);
  }
  function syncCaret() { const node = textarea.current; if (!node) return; setCaret(node.selectionStart); }
  function syncScroll() {
    const node = textarea.current; if (!node) return;
    setScrollTop(node.scrollTop);
    if (mirror.current) { mirror.current.scrollTop = node.scrollTop; mirror.current.scrollLeft = node.scrollLeft; }
    if (gutter.current) gutter.current.scrollTop = node.scrollTop;
  }

  const suggestion = useMemo((): SuggestionState | null => {
    if (loading || fileChoice || findOpen) return null;
    const before = value.slice(0, caret);
    const current = before.split('\n').at(-1) ?? '';
    const q = before.match(/@question\([^\n]*type:\s*"([^"\n]*)$/);
    const media = before.match(/@(audio|image|video|pdf)\("([^"\n]*)$/);
    let items: Suggestion[] = [], mode: SuggestionState['mode'] = 'command', start = caret, end = caret;
    if (q) {
      mode = 'question'; start = caret - q[1].length;
      items = questionCatalog.filter(item => item.label.toLowerCase().includes(q[1].toLowerCase())).map(item => ({ key: item.key, label: item.label, body: item.body, kind: 'question' }));
    } else if (media && media[2].length === 0) {
      mode = 'file';
      items.push({ key: 'browse', label: 'Browse files', kind: 'file', fileAction: 'browse' });
      items.push({ key: 'type', label: 'Type a reference', kind: 'file', fileAction: 'type' });
    } else {
      const cmd = current.match(/@([A-Za-z0-9-]*)$/);
      if (!cmd) return null;
      start = caret - cmd[0].length;
      const query = cmd[1].toLowerCase().replace(/-/g, ' ');
      const core = basic.filter(item => !textOnly || ['bold', 'italic', 'underline', 'strike', 'audio', 'video'].includes(item.key));
      const matches = query ? [...core.filter(item => item.key.includes(query)), ...available.filter(item => item.label.toLowerCase().includes(query) || item.key.toLowerCase().replace(/-/g, ' ').includes(query)).map(item => ({ key: item.key, label: item.label }))] : [...core, ...available.map(item => ({ key: item.key, label: item.label }))];
      const seen = new Set<string>();
      items = matches.filter(item => { if (seen.has(item.key)) return false; seen.add(item.key); return true; }).map(item => ({ ...item, kind: item.key === 'tt-org' || item.key === 'bankpick' ? 'dynamic' : 'command' }));
    }
    if (!items.length) return null;
    const node = textarea.current;
    const line = before.split('\n').length - 1;
    const col = current.length;
    const width = node?.clientWidth ?? 600, height = node?.clientHeight ?? 420;
    const rows = mode === 'command' && !before.endsWith('@') ? Math.min(items.length, 9) : Math.min(items.length, 8);
    return { mode, items, start, end, top: Math.max(8, Math.min(16 + line * 24 - (node?.scrollTop ?? 0) + 25, height - 32 - rows * 26)), left: Math.max(10, Math.min(16 + col * 7.8 - (node?.scrollLeft ?? 0), width - 320)) };
  }, [available, caret, fileChoice, findOpen, loading, textOnly, value]);

  useEffect(() => { setSuggestions(suggestion); setSuggestionIndex(0); }, [suggestion]);

  async function choose(item: Suggestion, start: number, end: number) {
    setSuggestions(null);
    if (item.kind === 'file') {
      if (item.fileAction === 'type') { textarea.current?.focus(); return; }
      const before = valueRef.current.slice(0, start);
      const match = before.match(/@(audio|video|image|pdf)\("$/);
      const kind = match?.[1] as FileChoice['kind'] | undefined;
      if (kind) { setFileSource('my'); setFileChoice({ kind, start, end }); }
      return;
    }
    if (item.kind === 'dynamic') {
      if (!chooseDynamic) return;
      try { const body = await chooseDynamic(item.key as 'bankpick' | 'tt-org'); if (body) insertTemplate(body, start, end); }
      catch (error) { setStatusError(error instanceof Error ? error.message : String(error)); }
      return;
    }
    if (item.kind === 'question') {
      const from = valueRef.current.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = valueRef.current.indexOf('\n', end);
      insertTemplate(freshen(item.body ?? ''), from, lineEnd < 0 ? valueRef.current.length : lineEnd);
      return;
    }
    const body = item.body ?? starterFor(starterCatalog.find(starter => starter.key === item.key) ?? { key: item.key, label: item.label, section: '' });
    if (body) insertTemplate(body, start, end);
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
    if ((event.metaKey || event.ctrlKey) && key === 'y') { event.preventDefault(); redo(); return; }
    if ((event.metaKey || event.ctrlKey) && key === 'f') { event.preventDefault(); setFindOpen(true); return; }
    if ((event.metaKey || event.ctrlKey) && key === 'h') { event.preventDefault(); setFindOpen(true); window.setTimeout(() => document.querySelector<HTMLInputElement>('.ss-source__replace')?.focus(), 0); return; }
    if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'u'].includes(key) && event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) {
      event.preventDefault(); const node = event.currentTarget, a = Math.max(HEADER_START, node.selectionStart), b = Math.max(HEADER_START, node.selectionEnd);
      const text = valueRef.current.slice(a, b).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      replaceRange(a, b, `@${{ b: 'bold', i: 'italic', u: 'underline' }[key as 'b' | 'i' | 'u']}("${text}")`); return;
    }
    if (event.key === 'Tab' && event.shiftKey) { event.preventDefault(); setSuggestions(null); movePlaceholder(true); return; }
    if (suggestions && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setSuggestionIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.items.length) % suggestions.items.length); return; }
    if (suggestions && ['Enter', 'Tab'].includes(event.key)) {
      if (event.key === 'Tab' && /^‹[^›]+›$/.test(valueRef.current.slice(event.currentTarget.selectionStart, event.currentTarget.selectionEnd))) { event.preventDefault(); setSuggestions(null); movePlaceholder(event.shiftKey); return; }
      event.preventDefault(); void choose(suggestions.items[suggestionIndex], suggestions.start, suggestions.end); return;
    }
    if (suggestions && event.key === 'Escape') { event.preventDefault(); setSuggestions(null); return; }
    if (event.key === 'Tab') { event.preventDefault(); if (!movePlaceholder(event.shiftKey) && !event.shiftKey) insert('  '); return; }
    if (event.key === 'Backspace' && event.currentTarget.selectionStart <= HEADER_START && event.currentTarget.selectionEnd <= HEADER_START) { event.preventDefault(); return; }
    if (event.key === 'Delete' && event.currentTarget.selectionStart < HEADER_START && event.currentTarget.selectionEnd <= HEADER_START) { event.preventDefault(); return; }
  }
  function changeSource(raw: string, selection: number) {
    const next = protectedSource(raw);
    remember(next);
    const at = Math.max(HEADER_START, Math.min(selection + next.length - raw.length, next.length));
    setCaret(at);
    if (next !== raw) select(at);
  }
  function findNext(reverse = false) {
    if (!findText) return;
    const haystack = valueRef.current.toLocaleLowerCase(), needle = findText.toLocaleLowerCase();
    const from = textarea.current?.selectionEnd ?? HEADER_START;
    let at = reverse ? haystack.lastIndexOf(needle, Math.max(HEADER_START, from - needle.length - 1)) : haystack.indexOf(needle, from);
    if (at < HEADER_START) at = reverse ? haystack.lastIndexOf(needle) : haystack.indexOf(needle, HEADER_START);
    if (at >= HEADER_START) select(at, at + findText.length);
  }
  function replaceCurrent() {
    const node = textarea.current; if (!node || !findText) return;
    const current = valueRef.current.slice(node.selectionStart, node.selectionEnd);
    if (current.toLocaleLowerCase() !== findText.toLocaleLowerCase()) return findNext();
    replaceRange(node.selectionStart, node.selectionEnd, replaceText);
  }
  function replaceAll() {
    if (!findText) return;
    const body = valueRef.current.slice(HEADER_START).replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceText.replace(/\$/g, '$$$$'));
    remember(`${SUITE_SCRIPT_HEADER}\n${body}`);
  }
  function close() {
    // A valid edit may still be waiting for the short apply delay or an async
    // host save. Require an explicit decision instead of dropping that source.
    if (valueRef.current !== applied.current || busy || issues.length || statusError) setConfirmClose(true);
    else onClose();
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setStatusError(''); } catch { setStatusError('Clipboard access is unavailable. Use your browser’s Copy shortcut.'); } }
  async function paste() { try { insert(await navigator.clipboard.readText()); } catch { setStatusError('Use your browser’s Paste shortcut in the code area.'); } }
  async function pickFile(items: ArchiveItem[]) {
    const chosen = items[0]; if (!chosen || !fileChoice) return;
    setFileBusy(true); setFileError('');
    try {
      const ref = await ensureSuiteScriptReference('archive', chosen.id);
      if (!validSuiteScriptReference(ref)) throw new Error('The file reference could not be verified.');
      insertFileReference(ref);
    } catch (error) { setFileError(error instanceof Error ? error.message : String(error)); }
    finally { setFileBusy(false); }
  }
  function insertFileReference(ref: string) {
    if (!fileChoice) return;
    const target = /^‹[^›\n]+›/.exec(valueRef.current.slice(fileChoice.start));
    const start = fileChoice.start;
    const after = valueRef.current.slice(start + (target?.[0].length ?? 0));
    const close = after.startsWith('"') ? '' : '")';
    replaceRange(start, start + (target?.[0].length ?? 0), ref + close);
    setFileChoice(null);
  }
  async function pickSharedFile(doc: SharedDoc) {
    setFileBusy(true); setFileError('');
    try {
      const ref = await ensureSuiteScriptReference('sharedDoc', doc.id);
      if (!validSuiteScriptReference(ref)) throw new Error('The file reference could not be verified.');
      insertFileReference(ref);
    } catch (error) { setFileError(error instanceof Error ? error.message : String(error)); }
    finally { setFileBusy(false); }
  }
  const currentLine = lineAt(value, caret);
  const errorByLine = new Map(issues.map(issue => [issue.line, issue.text]));
  const status = loading ? 'Opening SuiteScript…' : statusError ? 'Could not update' : issues.length ? `${issues.length} ${issues.length === 1 ? 'error' : 'errors'}` : busy ? 'Updating…' : 'No problems';
  const allProblems = [...issues.map(issue => `Line ${issue.line}: ${issue.text}`), ...(statusError ? [statusError] : []), ...warnings];
  const body: ReactNode = loading ? <div className="ss-source__loading" role="status">Preparing your editable SuiteScript…</div> : (
    <div className="ss-source__codebox">
      <div className="ss-source__current" style={{ top: `${14 + (currentLine - 1) * 24 - scrollTop}px` }} aria-hidden="true" />
      <div className="ss-source__gutter" ref={gutter} aria-hidden="true">{Array.from({ length: lineCount }, (_, index) => <div key={index} className={errorByLine.has(index + 1) ? 'ss-source__gutter-error' : ''} title={errorByLine.get(index + 1)}>{index + 1}</div>)}</div>
      <div className="ss-source__codepane">
        <pre ref={mirror} className="ss-source__highlight" aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlighted(value) }} />
        <textarea ref={textarea} className="ss-source__textarea" aria-label="SuiteScript source" aria-multiline="true" aria-autocomplete="list" aria-expanded={!!suggestions} value={value} wrap="off" spellCheck={spellcheck} onChange={event => changeSource(event.target.value, event.target.selectionStart)} onPaste={event => { event.preventDefault(); insert(event.clipboardData.getData('text/plain')); }} onClick={syncCaret} onKeyUp={syncCaret} onSelect={syncCaret} onScroll={syncScroll} onKeyDown={onKeyDown} />
      </div>
      {suggestions && <div className="ss-source__suggestions" role="listbox" aria-label={suggestions.mode === 'question' ? 'Question types' : suggestions.mode === 'file' ? 'File source' : 'SuiteScript commands'} style={{ top: suggestions.top, left: suggestions.left }}>
        <div className="ss-source__suggest-head">{suggestions.mode === 'question' ? 'QUESTION TYPE' : suggestions.mode === 'file' ? 'ADD FILE' : 'SUGGESTED COMMANDS'} <span>↑ ↓ &nbsp; Enter</span></div>
        <div className="ss-source__suggest-list">{suggestions.items.map((item, index) => <button key={`${item.key}-${index}`} type="button" role="option" aria-selected={index === suggestionIndex} className={index === suggestionIndex ? 'on' : ''} onMouseDown={event => event.preventDefault()} onClick={() => void choose(item, suggestions.start, suggestions.end)}>{item.label}</button>)}</div>
      </div>}
    </div>
  );
  return <section className={`ss-source ${className}`} aria-label={title}>
    <header className="ss-source__toolbar" role="toolbar" aria-label="SuiteScript tools">
      <span className="ss-source__identity">@_ <strong>{title}</strong></span>
      <button type="button" onClick={undo} disabled={historyIndex.current <= 0} aria-label="Undo" title="Undo (Ctrl or Command Z)">↶ <span>Undo</span></button>
      <button type="button" onClick={() => void paste()} disabled={loading} aria-label="Paste plain text" title="Paste plain text">▤ <span>Paste</span></button>
      <button type="button" onClick={() => void copy(value)} disabled={loading} aria-label="Copy all SuiteScript" title="Copy all SuiteScript">▣ <span>Copy all</span></button>
      <button type="button" onClick={() => setSpellcheck(on => !on)} aria-pressed={spellcheck} aria-label="Spelling" title="Spelling">A<span className="ss-source__spell-mark">✓</span></button>
      <button type="button" onClick={() => setHelpOpen(open => !open)} aria-expanded={helpOpen} aria-label="SuiteScript help" title="SuiteScript help">?</button>
      <button type="button" onClick={() => setFindOpen(open => !open)} aria-expanded={findOpen} aria-label="Find and replace" title="Find and replace (Ctrl or Command F)">⌕</button>
      <button type="button" className="ss-source__close" onClick={close} aria-label="Return to rich text editor" title="Return to rich text editor">×</button>
    </header>
    {findOpen && <div className="ss-source__find" role="search"><input type="search" aria-label="Find" placeholder="Find" value={findText} onChange={event => setFindText(event.target.value)} /><button type="button" onClick={() => findNext(true)} aria-label="Previous match">↑</button><button type="button" onClick={() => findNext()} aria-label="Next match">↓</button><input className="ss-source__replace" aria-label="Replace with" placeholder="Replace with" value={replaceText} onChange={event => setReplaceText(event.target.value)} /><button type="button" onClick={replaceCurrent}>Replace</button><button type="button" onClick={replaceAll}>All</button><button type="button" onClick={() => setFindOpen(false)} aria-label="Close find">×</button></div>}
    {helpOpen && <div className="ss-source__help"><strong>Write naturally. Add power with @.</strong><p>Type @ to add a command. Use Tab and Shift+Tab between placeholders. A valid edit updates the real lesson preview. Keep answers teacher-only.</p><button type="button" onClick={() => void copy(aiInstructions(commands, textOnly))}>{textOnly ? 'Copy AI instructions for this field' : `Copy AI instructions for all ${starterCatalog.length} Add items`}</button></div>}
    <div className="ss-source__workspace">
      {body}
      {!loading && <aside className="ss-source__preview" aria-label={previewAudience === 'teacher' ? 'Private teacher preview' : 'Live learner preview'}>
        <div className="ss-source__preview-head"><span>{previewAudience === 'teacher' ? 'PRIVATE TEACHER PREVIEW' : 'LEARNER PREVIEW'}</span><span>{busy ? 'Updating…' : issues.length || statusError ? 'Last valid version' : 'Live'}</span></div>
        <div className="ss-source__preview-body"><LocalLearnerPreviewMode.Provider value={previewLearnerSeat}><LocalActivityMode.Provider value={true}><TaskRenderer content={previewAudience === 'teacher' ? previewDoc : splitKey(previewDoc, true).content} responses={{}} disabled hideAnswers={previewAudience !== 'teacher'} classId={previewClassId} /></LocalActivityMode.Provider></LocalLearnerPreviewMode.Provider></div>
      </aside>}
    </div>
    <footer className="ss-source__status"><span className={issues.length || statusError ? 'is-error' : busy ? 'is-busy' : 'is-ready'} tabIndex={0} aria-label={[status, ...allProblems].join('. ')} title={allProblems.join('\n') || status}>● {status}{!!allProblems.length && <span className="ss-source__tooltip">{allProblems.slice(0, 6).map((problem, index) => <span key={index}>{problem}</span>)}</span>}</span><span>Ln {currentLine}, Col {(value.slice(0, caret).split('\n').at(-1) ?? '').length + 1}</span><span className="ss-source__version">SuiteScript v1</span></footer>
    {confirmClose && <div className="ss-source__confirm" role="dialog" aria-modal="true" aria-label="Discard unfinished SuiteScript"><div><h3>Return to rich text?</h3><p>The last valid change is already in the task. The unfinished code will be discarded.</p><button type="button" onClick={() => setConfirmClose(false)}>Keep editing</button><button type="button" onClick={() => { setConfirmClose(false); onClose(); }}>Discard unfinished code</button></div></div>}
    {fileChoice && <AddWindow<'my' | 'org'>
      title={`Choose ${fileChoice.kind === 'audio' ? 'a recording' : fileChoice.kind === 'image' ? 'an image' : fileChoice.kind === 'pdf' ? 'a PDF' : 'a video'}`}
      sources={[{ k: 'my', label: 'My Files', icon: 'folder' }, { k: 'org', label: 'Organisation Files', icon: 'folder' }]}
      source={fileSource}
      onSource={setFileSource}
      onClose={() => setFileChoice(null)}
      status={referenceDestination.mode !== 'class'
        ? 'SuiteScript file references are available in Classes. This destination cannot provide learner access to those files yet.'
        : fileError || (fileBusy ? 'Preparing this file…' : fileChoice.kind === 'pdf' || fileSource === 'org' && fileChoice.kind === 'image' ? 'Choose a file already shared with this Class.' : 'Choose an item to copy into this Class.')}
      wide
    >
      {referenceDestination.mode !== 'class'
        ? <p className="hint fb-wait">Files cannot be added to this lesson with SuiteScript yet. Use a Class lesson for files, or continue editing text here.</p>
        : fileSource === 'org'
          ? <OrganisationFiles kind={fileChoice.kind} classId={referenceDestination.classId} busy={fileBusy} onPick={doc => void pickSharedFile(doc)} />
          : fileChoice.kind === 'pdf'
            ? <MySharedFiles kind="pdf" classId={referenceDestination.classId} busy={fileBusy} onPick={doc => void pickSharedFile(doc)} />
            : <FileBrowser uid={auth.currentUser?.uid} kind={fileChoice.kind} busy={fileBusy} onPick={items => void pickFile(items)} />}
    </AddWindow>}
  </section>;
}
