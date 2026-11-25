import { useEffect, useMemo, useRef, useState } from 'react';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type Editor, type JSONContent, type NodeViewProps } from '@tiptap/react';

// Collab's Insert and Format additions, as in Google Docs: a date chip, a person chip, bookmarks,
// special characters, building blocks, and spacing for each paragraph.

const fmtDate = (iso: string) => {
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
};
const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------------- date chip
function DateView({ node, updateAttributes, editor }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  return (
    <NodeViewWrapper as="span" className="dx-chip dx-date" contentEditable={false}>
      <button type="button" className="dx-chip-btn" onClick={() => editor.isEditable && setOpen((v) => !v)} aria-label={`Date: ${fmtDate(node.attrs.date)}${editor.isEditable ? '. Change the date' : ''}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="1.8" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
        {fmtDate(node.attrs.date)}
      </button>
      {open && <input className="dx-date-in" type="date" autoFocus value={node.attrs.date} aria-label="Date" onChange={(e) => e.target.value && updateAttributes({ date: e.target.value })} onBlur={() => setOpen(false)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') setOpen(false); }} />}
    </NodeViewWrapper>
  );
}
export const DateChip = Node.create({
  name: 'dateChip',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ date: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-date-chip]' }],
  renderHTML: ({ HTMLAttributes, node }) => ['span', mergeAttributes(HTMLAttributes, { 'data-date-chip': '' }), fmtDate(node.attrs.date)],
  renderText: ({ node }) => fmtDate(node.attrs.date),
  addNodeView: () => ReactNodeViewRenderer(DateView),
});

// ---------------------------------------------------------------------------------- person chip
function PersonView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper as="span" className="dx-chip dx-person" contentEditable={false} title={node.attrs.name}>
      <span className="dx-av" aria-hidden="true" style={{ background: node.attrs.color || 'var(--accent, #c8764a)' }}>{String(node.attrs.name || '?').slice(0, 1).toUpperCase()}</span>
      {node.attrs.name}
    </NodeViewWrapper>
  );
}
export const PersonChip = Node.create({
  name: 'personChip',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ uid: { default: '' }, name: { default: '' }, color: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-person-chip]' }],
  renderHTML: ({ HTMLAttributes, node }) => ['span', mergeAttributes(HTMLAttributes, { 'data-person-chip': '' }), '@' + node.attrs.name],
  renderText: ({ node }) => '@' + node.attrs.name,
  addNodeView: () => ReactNodeViewRenderer(PersonView),
});

// ---------------------------------------------------------------------------------- bookmarks
// A bookmark is a small flag in the text. The sidebar lists them; a link to one opens the document
// there (#bm-<id>).
function BookmarkView({ node, editor, updateAttributes, deleteNode }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const copy = () => {
    const u = new URL(location.href);
    u.hash = 'bm-' + node.attrs.id;
    void navigator.clipboard?.writeText(u.toString());
    setOpen(false);
  };
  return (
    <NodeViewWrapper as="span" className="dx-bm" contentEditable={false} id={'bm-' + node.attrs.id} data-bm={node.attrs.id}>
      <button type="button" className="dx-bm-btn" aria-label={`Bookmark: ${node.attrs.label || 'bookmark'}`} title={node.attrs.label || 'Bookmark'} onClick={() => setOpen((v) => !v)}>
        <svg width="12" height="14" viewBox="0 0 20 24" fill="currentColor" aria-hidden="true"><path d="M3 2h14v20l-7-5-7 5z" /></svg>
      </button>
      {open && (
        <span className="dx-pop" role="dialog" aria-label="Bookmark">
          {editor.isEditable ? <input className="dx-in" defaultValue={node.attrs.label} placeholder="Name the bookmark" aria-label="Bookmark name" autoFocus onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { updateAttributes({ label: (e.target as HTMLInputElement).value.trim().slice(0, 80) }); setOpen(false); } if (e.key === 'Escape') setOpen(false); }} onBlur={(e) => updateAttributes({ label: e.target.value.trim().slice(0, 80) })} /> : <b>{node.attrs.label || 'Bookmark'}</b>}
          <span className="dx-pop-row">
            <button type="button" className="btn small-btn" onClick={copy}>Copy link</button>
            {editor.isEditable && <button type="button" className="btn link small" onClick={() => deleteNode()}>Remove</button>}
          </span>
        </span>
      )}
    </NodeViewWrapper>
  );
}
export const Bookmark = Node.create({
  name: 'bookmark',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ id: { default: '' }, label: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-bookmark]' }],
  renderHTML: ({ HTMLAttributes, node }) => ['span', mergeAttributes(HTMLAttributes, { 'data-bookmark': '', id: 'bm-' + node.attrs.id })],
  addNodeView: () => ReactNodeViewRenderer(BookmarkView),
});
export function bookmarksOf(doc: { descendants: (f: (n: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => void) => void }) {
  const out: { id: string; label: string; pos: number }[] = [];
  doc.descendants((n, pos) => { if (n.type.name === 'bookmark') out.push({ id: String(n.attrs.id), label: String(n.attrs.label || ''), pos }); });
  return out;
}

// ---------------------------------------------------------------------------------- spacing
// Each paragraph or heading can have its own line spacing and space before and after (in pt).
export const ParagraphSpacing = Extension.create({
  name: 'paragraphSpacing',
  addGlobalAttributes: () => [{
    types: ['paragraph', 'heading'],
    attributes: {
      lineHeight: { default: null, parseHTML: (el) => el.style.lineHeight || null, renderHTML: (a) => (a.lineHeight ? { style: `line-height: ${a.lineHeight}` } : {}) },
      spaceBefore: { default: null, parseHTML: (el) => parseFloat(el.style.marginTop) || null, renderHTML: (a) => (a.spaceBefore != null ? { style: `margin-top: ${a.spaceBefore}pt` } : {}) },
      spaceAfter: { default: null, parseHTML: (el) => parseFloat(el.style.marginBottom) || null, renderHTML: (a) => (a.spaceAfter != null ? { style: `margin-bottom: ${a.spaceAfter}pt` } : {}) },
    },
  }],
});
export function setSpacing(editor: Editor, attrs: { lineHeight?: string | null; spaceBefore?: number | null; spaceAfter?: number | null }) {
  const { from, to } = editor.state.selection;
  const tr = editor.state.tr;
  editor.state.doc.nodesBetween(from, to, (n, pos) => {
    if (n.type.name === 'paragraph' || n.type.name === 'heading') tr.setNodeMarkup(pos, undefined, { ...n.attrs, ...attrs });
  });
  editor.view.dispatch(tr);
  editor.commands.focus();
}
export const currentSpacing = (editor: Editor) => {
  const n = editor.state.selection.$from.parent;
  return { lineHeight: (n.attrs.lineHeight as string | null) ?? null, spaceBefore: (n.attrs.spaceBefore as number | null) ?? null, spaceAfter: (n.attrs.spaceAfter as number | null) ?? null };
};

// ---------------------------------------------------------------------------------- special characters
const CHARS: { group: string; list: [string, string][] }[] = [
  { group: 'Punctuation', list: [['“', 'left double quote'], ['”', 'right double quote'], ['‘', 'left single quote'], ['’', 'apostrophe right single quote'], ['…', 'ellipsis'], ['–', 'en dash'], ['—', 'em dash'], ['·', 'middle dot'], ['•', 'bullet'], ['«', 'left guillemet'], ['»', 'right guillemet'], ['¡', 'inverted exclamation'], ['¿', 'inverted question'], ['§', 'section'], ['¶', 'pilcrow paragraph'], ['†', 'dagger'], ['№', 'numero number']] },
  { group: 'Accents', list: [['á', 'a acute'], ['à', 'a grave'], ['â', 'a circumflex'], ['ä', 'a umlaut'], ['ã', 'a tilde'], ['å', 'a ring'], ['ç', 'c cedilla'], ['é', 'e acute'], ['è', 'e grave'], ['ê', 'e circumflex'], ['ë', 'e umlaut'], ['í', 'i acute'], ['ì', 'i grave'], ['î', 'i circumflex'], ['ï', 'i umlaut'], ['ñ', 'n tilde'], ['ó', 'o acute'], ['ò', 'o grave'], ['ô', 'o circumflex'], ['ö', 'o umlaut'], ['õ', 'o tilde'], ['ø', 'o slash'], ['ú', 'u acute'], ['ù', 'u grave'], ['û', 'u circumflex'], ['ü', 'u umlaut'], ['ß', 'sharp s eszett'], ['ğ', 'g breve turkish'], ['ı', 'dotless i turkish'], ['ş', 's cedilla turkish'], ['İ', 'capital dotted i turkish'], ['æ', 'ae'], ['œ', 'oe'], ['ł', 'l stroke polish'], ['ś', 's acute'], ['ż', 'z dot'], ['č', 'c caron'], ['š', 's caron'], ['ž', 'z caron']] },
  { group: 'Arrows and symbols', list: [['→', 'right arrow'], ['←', 'left arrow'], ['↑', 'up arrow'], ['↓', 'down arrow'], ['↔', 'left right arrow'], ['⇒', 'implies double arrow'], ['✓', 'tick check'], ['✗', 'cross'], ['★', 'star'], ['☆', 'empty star'], ['♥', 'heart'], ['☺', 'smile'], ['♪', 'music note'], ['☐', 'empty box'], ['☑', 'ticked box'], ['©', 'copyright'], ['®', 'registered'], ['™', 'trade mark'], ['°', 'degree']] },
  { group: 'Numbers and money', list: [['½', 'half'], ['⅓', 'third'], ['¼', 'quarter'], ['¾', 'three quarters'], ['×', 'times multiply'], ['÷', 'divide'], ['±', 'plus minus'], ['≈', 'about approximately'], ['≠', 'not equal'], ['≤', 'less or equal'], ['≥', 'greater or equal'], ['²', 'squared'], ['³', 'cubed'], ['€', 'euro'], ['£', 'pound'], ['$', 'dollar'], ['¥', 'yen'], ['₺', 'lira turkish'], ['₹', 'rupee'], ['¢', 'cent']] },
];
export function SpecialChars({ onPick, onClose }: { onPick: (c: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal?.(); }, []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = useMemo(() => CHARS.map((g) => ({ ...g, list: g.list.filter(([c, name]) => !words.length || words.every((w) => name.includes(w) || c === w)) })).filter((g) => g.list.length), [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <dialog ref={ref} className="dx-dialog" aria-labelledby="dx-sc-h" onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dx-dialog-head"><h2 id="dx-sc-h">Special characters</h2><button type="button" className="btn" onClick={onClose}>Close</button></div>
      <input className="dx-in dx-search" type="search" autoFocus placeholder="Find a character, for example arrow or e acute" aria-label="Find a character" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="dx-chars">
        {groups.map((g) => (
          <section key={g.group}>
            <h3>{g.group}</h3>
            <div className="dx-char-row">{g.list.map(([c, name]) => <button key={c} type="button" className="dx-char" title={name} aria-label={name} onClick={() => onPick(c)}>{c}</button>)}</div>
          </section>
        ))}
        {!groups.length && <p className="hint">Nothing matches “{q}”.</p>}
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------------- building blocks
const h = (level: number, text: string): JSONContent => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
const p = (text = ''): JSONContent => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' });
const lab = (label: string, text = ''): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text: label + ': ', marks: [{ type: 'bold' }] }, ...(text ? [{ type: 'text', text }] : [])] });
const cell = (text: string, header = false): JSONContent => ({ type: header ? 'tableHeader' : 'tableCell', content: [p(text)] });
const table = (head: string[], rows: string[][]): JSONContent => ({ type: 'table', content: [{ type: 'tableRow', content: head.map((t) => cell(t, true)) }, ...rows.map((r) => ({ type: 'tableRow', content: r.map((t) => cell(t)) }))] });
const checks = (items: string[]): JSONContent => ({ type: 'taskList', content: items.map((t) => ({ type: 'taskItem', attrs: { checked: false }, content: [p(t)] })) });

export const BUILDING_BLOCKS: { key: string; label: string; about: string; content: () => JSONContent[] }[] = [
  { key: 'plan', label: 'Lesson plan', about: 'Aims, stages with timings, materials and what to do next', content: () => [
    h(2, 'Lesson plan'), lab('Class'), lab('Level'), lab('Date', ''), lab('Length', '60 minutes'),
    h(3, 'Aims'), p('By the end of the lesson, learners can …'),
    h(3, 'Stages'), table(['Time', 'Stage', 'What happens', 'Interaction'], [['5 min', 'Warmer', '', 'Whole class'], ['10 min', 'Lead-in', '', 'Pairs'], ['15 min', 'Presentation', '', 'Whole class'], ['15 min', 'Practice', '', 'Pairs'], ['10 min', 'Production', '', 'Groups'], ['5 min', 'Review', '', 'Whole class']]),
    h(3, 'Materials'), checks(['Worksheet', 'Recording', 'Pictures']),
    h(3, 'Possible problems and solutions'), p(),
    h(3, 'After the lesson'), p('What worked, what to change, what to revisit.'),
  ] },
  { key: 'observation', label: 'Observation notes', about: 'Focus, timed notes, strengths and next steps', content: () => [
    h(2, 'Observation notes'), lab('Teacher'), lab('Observer'), lab('Date', ''), lab('Focus'),
    table(['Time', 'What happened', 'Comment'], [['', '', ''], ['', '', ''], ['', '', '']]),
    h(3, 'Strengths'), p(), h(3, 'Things to try'), p(), h(3, 'Agreed next steps'), checks(['', '']),
  ] },
  { key: 'meeting', label: 'Meeting notes', about: 'Who came, the agenda, decisions and actions', content: () => [
    h(2, 'Meeting notes'), lab('Date', ''), lab('Attending'),
    h(3, 'Agenda'), { type: 'bulletList', content: [{ type: 'listItem', content: [p()] }, { type: 'listItem', content: [p()] }] },
    h(3, 'Decisions'), p(),
    h(3, 'Actions'), table(['Action', 'Who', 'By when'], [['', '', ''], ['', '', '']]),
  ] },
  { key: 'reading', label: 'Reading log', about: 'A source, its main ideas and what it means for your teaching', content: () => [
    h(2, 'Reading log'), lab('Title'), lab('Author'), lab('Year'),
    h(3, 'Main ideas'), { type: 'bulletList', content: [{ type: 'listItem', content: [p()] }, { type: 'listItem', content: [p()] }] },
    h(3, 'Quotes worth keeping'), p(),
    h(3, 'What this means for my teaching'), p(),
  ] },
  { key: 'reflection', label: 'Lesson reflection', about: 'What went well, what to change and evidence from learners', content: () => [
    h(2, 'Lesson reflection'), lab('Lesson'), lab('Date', ''),
    h(3, 'What went well'), p(), h(3, 'What I would change'), p(), h(3, 'Evidence from learners'), p(), h(3, 'Next time I will …'), p(),
  ] },
];
export const insertBlock = (editor: Editor, key: string) => {
  const b = BUILDING_BLOCKS.find((x) => x.key === key);
  if (!b) return;
  // Dates in a block are today's date as a chip.
  const withDates = b.content().map((n) => (n.type === 'paragraph' && n.content?.[0]?.text === 'Date: ' && n.content.length === 1 ? { ...n, content: [...n.content, { type: 'dateChip', attrs: { date: today() } }] } : n));
  editor.chain().focus().insertContent(withDates).run();
};

// Choose someone who has this document open or has opened it.
export function PersonPicker({ people, onPick, onClose }: { people: { uid: string; name: string; color: string }[]; onPick: (p: { uid: string; name: string; color: string }) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal?.(); }, []);
  const list = people.filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <dialog ref={ref} className="dx-dialog dx-people" aria-labelledby="dx-pp-h" onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dx-dialog-head"><h2 id="dx-pp-h">Add a person</h2><button type="button" className="btn" onClick={onClose}>Close</button></div>
      <input className="dx-in dx-search" type="search" autoFocus placeholder="Find a name" aria-label="Find a name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && list[0] && onPick(list[0])} />
      <div className="dx-people-list">
        {list.map((x) => <button key={x.uid} type="button" className="dx-person-row" onClick={() => onPick(x)}><span className="dx-av" style={{ background: x.color }} aria-hidden="true">{x.name.slice(0, 1).toUpperCase()}</span>{x.name}</button>)}
        {!list.length && <p className="hint">{people.length ? `Nobody called “${q}” has opened this document.` : 'People appear here once they have opened this document.'}</p>}
      </div>
    </dialog>
  );
}

export const EXTRA_NODES = [DateChip, PersonChip, Bookmark, ParagraphSpacing];
export const newBookmarkId = () => Math.random().toString(36).slice(2, 9);
export { today };
