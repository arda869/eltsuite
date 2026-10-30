import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { UiIcon } from '../components/UiIcon';

const FORMATTING = ['bold', 'italic', 'underline', 'strike', 'textColor', 'highlight', 'fontStyle', 'superscript', 'subscript'];
type SavedMark = { type: string; attrs: Record<string, unknown> };
type Match = { from: number; to: number };

// Search within text blocks, across formatting spans, without crossing embedded elements.
export function findDocumentText(doc: ProseMirrorNode, query: string, matchCase: boolean): Match[] {
  if (!query || query.includes('\ufffc')) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'gu' : 'giu');
  const matches: Match[] = [];
  doc.descendants((node, pos) => {
    if (node.isAtom && !node.isText) return false;
    if (!node.isTextblock) return;
    const text = node.textBetween(0, node.content.size, '', '\ufffc');
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      matches.push({ from: pos + 1 + match.index, to: pos + 1 + match.index + match[0].length });
    }
    return false;
  });
  return matches;
}

export function useDocumentTools(editor: Editor | null, canFormat: boolean, canReplace: boolean, canFind: boolean) {
  const [findOpen, setFindOpen] = useState(false);
  const [format, setFormat] = useState<SavedMark[] | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!editor || !canFind) return;
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'f') return;
      e.preventDefault();
      setFindOpen(true);
    };
    const root = editor.view.dom.closest('.cd');
    root?.addEventListener('keydown', key as EventListener);
    return () => root?.removeEventListener('keydown', key as EventListener);
  }, [editor, canFind]);
  const copyFormatting = () => {
    if (!editor || !canFormat) return;
    const { from, empty, $from } = editor.state.selection;
    const marks = empty ? editor.state.storedMarks ?? $from.marks() : editor.state.doc.resolve(from).nodeAfter?.marks ?? $from.marks();
    setFormat(marks.filter((m) => FORMATTING.includes(m.type.name)).map((m) => ({ type: m.type.name, attrs: { ...m.attrs } })));
    setNotice('Formatting copied. Select text, then choose Format → Apply text formatting.');
  };
  const applyFormatting = () => {
    if (!editor || !canFormat || !format) return;
    const chain = editor.chain().focus();
    FORMATTING.filter((name) => editor.schema.marks[name]).forEach((name) => chain.unsetMark(name));
    format.forEach((mark) => chain.setMark(mark.type, mark.attrs));
    chain.run();
    setNotice('Text formatting applied.');
  };
  return {
    openFind: () => setFindOpen(true), copyFormatting, applyFormatting, hasFormatting: format !== null,
    panel: editor && <>
      {findOpen && canFind && <FindReplace editor={editor} canReplace={canReplace} onClose={() => { setFindOpen(false); editor.commands.focus(); }} />}
      {notice && canFormat && <div className="document-tool-notice" role="status"><UiIcon name="design" size={16} /><span>{notice}</span><button type="button" aria-label="Dismiss formatting message" onClick={() => setNotice('')}>×</button></div>}
    </>,
  };
}

function FindReplace({ editor, canReplace, onClose }: { editor: Editor; canReplace: boolean; onClose: () => void }) {
  const [query, setQuery] = useState(() => editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ').slice(0, 200));
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState(0);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  useEffect(() => {
    const update = () => setRevision((n) => n + 1);
    editor.on('update', update);
    return () => { editor.off('update', update); };
  }, [editor]);
  const matches = useMemo(() => findDocumentText(editor.state.doc, query, matchCase), [editor, query, matchCase, revision]);
  const current = Math.min(active, Math.max(0, matches.length - 1));
  const select = (i: number) => {
    const match = matches[i];
    if (match) editor.chain().setTextSelection(match).scrollIntoView().run();
  };
  useEffect(() => { select(current); }, [matches, current]); // Selection changes do not update the document revision.
  const move = (step: number) => { if (matches.length) setActive((current + step + matches.length) % matches.length); };
  const replace = (all: boolean) => {
    if (!canReplace || !matches.length) return;
    // One transaction makes Replace all one undo step and preserves surrounding nodes/marks.
    const selected = all ? matches : [matches[current]];
    const tr = editor.state.tr;
    [...selected].reverse().forEach(({ from, to }) => tr.insertText(replacement, from, to));
    editor.view.dispatch(tr);
    setMessage(`${selected.length} ${selected.length === 1 ? 'match' : 'matches'} replaced.`);
  };
  return <section className="document-find" role="dialog" aria-label="Find and replace" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
    <div className="document-find-heading"><strong>Find and replace</strong><button type="button" aria-label="Close find and replace" onClick={onClose}>×</button></div>
    <label>Find<input ref={input} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); setMessage(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1); } }} /></label>
    <div className="document-find-navigation"><span role="status">{query ? matches.length ? `${current + 1} of ${matches.length} matches` : 'No matches' : 'Enter text to search'}</span><button type="button" aria-label="Previous match" disabled={!matches.length} onClick={() => move(-1)}>↑</button><button type="button" aria-label="Next match" disabled={!matches.length} onClick={() => move(1)}>↓</button></div>
    <label className="document-find-case"><input type="checkbox" checked={matchCase} onChange={(e) => { setMatchCase(e.target.checked); setActive(0); }} />Match case</label>
    <label>Replace with<input value={replacement} disabled={!canReplace} onChange={(e) => setReplacement(e.target.value)} /></label>
    {!canReplace && <p className="hint">Switch to Editing to replace text.</p>}
    <div className="document-find-actions"><button type="button" disabled={!canReplace || !matches.length} onClick={() => replace(false)}>Replace</button><button type="button" disabled={!canReplace || !matches.length} onClick={() => replace(true)}>Replace all</button></div>
    {message && <p role="status">{message}</p>}
  </section>;
}
