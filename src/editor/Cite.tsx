import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePopPos } from './usePopPos';
import { CITE_STYLES, inText, isNumbered, orderFor, refsTitle, shortName, type CiteStyle, type Source } from '../lib/cite';
import { useAuth } from '../lib/auth';
import { type SharedDoc, useMyDocs } from '../lib/sharedDocs';
import { allSources, Ref, type ReadSource } from '../pd/PdReading';

// Citations in a document, from the teacher's PD reading, and the reference list made from them.

import { useCiteStyle } from '../lib/citeContext';
export { CiteStyleContext, useCiteStyle } from '../lib/citeContext';

const strip = (s: ReadSource | Source): Source => {
  const { notes, sections, paged, order, ...rest } = s as ReadSource;
  void notes, void sections, void paged, void order;
  return JSON.parse(JSON.stringify(rest));
};

function CiteView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const style = useCiteStyle();
  const src = node.attrs.src as Source;
  // In a numbered style, the number is the source's place among those cited so far.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!isNumbered(style)) return;
    const f = () => tick((x) => x + 1);
    editor.on('update', f);
    return () => void editor.off('update', f);
  }, [editor, style]);
  const num = isNumbered(style) && src ? citedSources(editor.state.doc, style).findIndex((x) => (x.id || JSON.stringify(x)) === (src.id || JSON.stringify(src))) + 1 || 1 : 1;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const pos = usePopPos(ref, open, 300);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <NodeViewWrapper as="span" className={'cite-node' + (selected ? ' is-selected' : '')} ref={ref}>
      <span className="cite" contentEditable={false} onClick={() => setOpen(true)} title={src?.title}>
        {src ? inText(src, style, node.attrs.page, node.attrs.narrative, num) : '(source)'}
      </span>
      {open && src && (
        <span className="gap-pop cite-pop" contentEditable={false} style={pos}>
          <span className="pop-type">Citation</span>
          <Ref s={src} style={style} />
          <label className="pop-field">
            <span>Page</span>
            <input aria-label="Page or pages" value={node.attrs.page} placeholder="12 or 12–14" onChange={(e) => updateAttributes({ page: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={!!node.attrs.narrative} onChange={(e) => updateAttributes({ narrative: e.target.checked })} />
            The author is part of the sentence: {inText(src, style, node.attrs.page, true, num)}
          </label>
          <button type="button" className="btn link small" onClick={deleteNode}>
            Remove the citation
          </button>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const CiteNode = Node.create({
  name: 'cite',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({
    src: { default: null, parseHTML: (el) => JSON.parse((el as HTMLElement).getAttribute('data-src') || 'null'), renderHTML: (a) => ({ 'data-src': JSON.stringify(a.src) }) },
    page: { default: '' },
    narrative: { default: false },
  }),
  parseHTML: () => [{ tag: 'span[data-cite]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-cite': '' })],
  addNodeView: () => ReactNodeViewRenderer(CiteView),
});

// Every source cited in the document, once, in reference-list order.
export function citedSources(doc: { descendants: (f: (n: { type: { name: string }; attrs: Record<string, unknown> }) => void) => void }, style: CiteStyle = 'apa'): Source[] {
  const seen = new Map<string, Source>();
  doc.descendants((n) => {
    if (n.type.name === 'cite' && n.attrs.src) {
      const s = n.attrs.src as Source;
      const k = s.id || JSON.stringify(s);
      if (!seen.has(k)) seen.set(k, s);
    }
  });
  return orderFor([...seen.values()], style);
}

function RefListView({ editor, selected }: NodeViewProps) {
  const style = useCiteStyle();
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((x) => x + 1);
    editor.on('update', f);
    return () => void editor.off('update', f);
  }, [editor]);
  const list = citedSources(editor.state.doc, style);
  return (
    <NodeViewWrapper className={'reflist' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <h2 className="reflist-h">{refsTitle(style)}</h2>
      {list.length ? (
        list.map((s, i) => (
          <p key={s.id} className="reflist-item">
            <Ref s={s} style={style} n={i + 1} />
          </p>
        ))
      ) : (
        <p className="hint">The sources you cite appear here, in order, as you write.</p>
      )}
    </NodeViewWrapper>
  );
}

export const RefListNode = Node.create({
  name: 'refList',
  group: 'block',
  atom: true,
  parseHTML: () => [{ tag: 'div[data-reflist]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-reflist': '' })],
  addNodeView: () => ReactNodeViewRenderer(RefListView),
});

// The toolbar button: find a source in your Reading Journal and cite it.
export function CiteTool({ editor, openRequest = 0 }: { editor: Editor; openRequest?: number }) {
  const { user } = useAuth();
  const { mine, withMe } = useMyDocs(user?.uid);
  const style = useCiteStyle();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openRequest) setOpen(true); }, [openRequest]);
  useEffect(() => { if (!open) return; const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [open]);
  // "/" then Citation opens this.
  useEffect(() => {
    const f = () => setOpen(true);
    window.addEventListener('ll:cite', f);
    return () => window.removeEventListener('ll:cite', f);
  }, []);
  const [all, setAll] = useState<{ src: ReadSource; file: SharedDoc }[] | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  const pos = usePopPos(ref, open, 360);
  const files = useMemo(() => [...new Map([...(mine ?? []), ...(withMe ?? [])].map((f) => [f.id, f])).values()], [mine, withMe]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void allSources(files).then((list) => active && setAll(list));
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => { active = false; document.removeEventListener('mousedown', close); };
  }, [open, files]);
  const s = q.trim().toLowerCase();
  const found = (all ?? []).filter((x) => !s || `${shortName(x.src)} ${x.src.title} ${x.file.title}`.toLowerCase().includes(s));
  const groups = [...new Map(found.map((x) => [x.file.id, x.file])).values()].sort((a, b) => a.title.localeCompare(b.title));
  let hasList = false;
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'refList') hasList = true;
  });
  return (
    <span className="hl-tool" ref={ref}>
      <button type="button" className={'tool' + (open ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)} title="Cite a source from your Reading Journal" aria-label="Cite a source">
        <span className="ti-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 5.5C6 4.5 9 4.6 12 6.2v13.3c-3-1.6-6-1.7-9-.7zM21 5.5c-3-1-6-.9-9 .7v13.3c3-1.6 6-1.7 9-.7z" />
          </svg>
          <span>Cite</span>
        </span>
      </button>
      {open && (
        <span className="hl-pop cite-tool" style={pos}>
          <input className="cite-q" type="search" aria-label="Find a source" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a source: author, title" autoFocus />
          <span className="cite-list">
            {all === null ? (
              <span className="hint">Opening your Reading Journal…</span>
            ) : found.length ? (
              groups.map((file) => (<span className="cite-group" key={file.id}>
                <span className="cite-group-title"><b>{file.title}</b><a href={'/doc/' + file.id} target="_blank" rel="noopener noreferrer" aria-label={'Open journal: ' + file.title}>Open journal ↗</a></span>
                {found.filter((x) => x.file.id === file.id).map((x) => (
                <button
                  key={x.file.id + x.src.id}
                  type="button"
                  className="cite-row"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => (editor.chain().focus().insertContent({ type: 'cite', attrs: { src: strip(x.src), page, narrative: false } }).run(), setPage(''), setOpen(false))}
                >
                  <b>{shortName(x.src)}</b>
                  <span>{x.src.title}</span>
                </button>
              ))}</span>))
            ) : (
              <span className="hint cite-empty">{all.length ? 'Nothing matches.' : 'No sources yet. Add them in a Reading Journal file, in the resources library.'}</span>
            )}
          </span>
          <label className="cite-page">
            <span>Page</span>
            <input aria-label="Page (optional)" value={page} onChange={(e) => setPage(e.target.value)} placeholder="optional" />
          </label>
          <span className="hint">In {CITE_STYLES.find((c) => c.k === style)?.label ?? style}: {all?.[0] ? inText(all[0].src, style, page || '12') : '(Thornbury, 2006, p. 12)'}</span>
          {!hasList && (
            <button type="button" className="btn small-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => (editor.chain().focus('end').insertContent([{ type: 'refList' }, { type: 'paragraph' }]).run(), setOpen(false))}>
              Add the reference list at the end
            </button>
          )}
        </span>
      )}
    </span>
  );
}
