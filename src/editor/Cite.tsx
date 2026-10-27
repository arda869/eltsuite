import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePopPos } from './usePopPos';
import { inText, refsTitle, shortName, sortKey, type CiteStyle, type Source } from '../lib/cite';
import { useAuth } from '../lib/auth';
import { useMyDocs } from '../lib/sharedDocs';
import { allSources, Ref, type ReadSource } from '../pd/PdReading';

// Citations in a document, from the teacher's PD reading, and the reference list made from them.

export const CiteStyleContext = createContext<CiteStyle>('apa');
export const useCiteStyle = () => useContext(CiteStyleContext);

const strip = (s: ReadSource | Source): Source => {
  const { notes, sections, paged, order, ...rest } = s as ReadSource;
  void notes, void sections, void paged, void order;
  return JSON.parse(JSON.stringify(rest));
};

function CiteView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const style = useCiteStyle();
  const src = node.attrs.src as Source;
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
        {src ? inText(src, style, node.attrs.page, node.attrs.narrative) : '(source)'}
      </span>
      {open && src && (
        <span className="gap-pop cite-pop" contentEditable={false} style={pos}>
          <span className="pop-type">Citation</span>
          <Ref s={src} style={style} />
          <label className="pop-field">
            <span>Page</span>
            <input value={node.attrs.page} placeholder="12 or 12–14" onChange={(e) => updateAttributes({ page: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={!!node.attrs.narrative} onChange={(e) => updateAttributes({ narrative: e.target.checked })} />
            The author is part of the sentence: {inText(src, style, node.attrs.page, true)}
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
export function citedSources(doc: { descendants: (f: (n: { type: { name: string }; attrs: Record<string, unknown> }) => void) => void }): Source[] {
  const seen = new Map<string, Source>();
  doc.descendants((n) => {
    if (n.type.name === 'cite' && n.attrs.src) {
      const s = n.attrs.src as Source;
      seen.set(s.id || JSON.stringify(s), s);
    }
  });
  return [...seen.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function RefListView({ editor, selected }: NodeViewProps) {
  const style = useCiteStyle();
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((x) => x + 1);
    editor.on('update', f);
    return () => void editor.off('update', f);
  }, [editor]);
  const list = citedSources(editor.state.doc);
  return (
    <NodeViewWrapper className={'reflist' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <h2 className="reflist-h">{refsTitle(style)}</h2>
      {list.length ? (
        list.map((s) => (
          <p key={s.id} className="reflist-item">
            <Ref s={s} style={style} />
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

// The toolbar button: find a source in your PD reading and cite it.
export function CiteTool({ editor }: { editor: Editor }) {
  const { user } = useAuth();
  const { mine, withMe } = useMyDocs(user?.uid);
  const style = useCiteStyle();
  const [open, setOpen] = useState(false);
  // "/" then Citation opens this.
  useEffect(() => {
    const f = () => setOpen(true);
    window.addEventListener('ll:cite', f);
    return () => window.removeEventListener('ll:cite', f);
  }, []);
  const [all, setAll] = useState<{ src: ReadSource; file: { title: string } }[] | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  const pos = usePopPos(ref, open, 360);
  const files = useMemo(() => [...(mine ?? []), ...(withMe ?? [])], [mine, withMe]);
  useEffect(() => {
    if (!open) return;
    void allSources(files).then(setAll);
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, files]);
  const s = q.trim().toLowerCase();
  const found = (all ?? []).filter((x) => !s || `${shortName(x.src)} ${x.src.title} ${x.file.title}`.toLowerCase().includes(s));
  let hasList = false;
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'refList') hasList = true;
  });
  return (
    <span className="hl-tool" ref={ref}>
      <button type="button" className={'tool' + (open ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)} title="Cite a source from your PD reading" aria-label="Cite a source">
        <span className="ti-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 5.5C6 4.5 9 4.6 12 6.2v13.3c-3-1.6-6-1.7-9-.7zM21 5.5c-3-1-6-.9-9 .7v13.3c3-1.6 6-1.7 9-.7z" />
          </svg>
          <span>Cite</span>
        </span>
      </button>
      {open && (
        <span className="hl-pop cite-tool" style={pos}>
          <input className="cite-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a source: author, title" autoFocus />
          <span className="cite-list">
            {all === null ? (
              <span className="hint">Opening your PD reading…</span>
            ) : found.length ? (
              found.map((x) => (
                <button
                  key={x.file.title + x.src.id}
                  type="button"
                  className="cite-row"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => (editor.chain().focus().insertContent({ type: 'cite', attrs: { src: strip(x.src), page, narrative: false } }).run(), setPage(''), setOpen(false))}
                >
                  <b>{shortName(x.src)}</b>
                  <span>{x.src.title}</span>
                  <span className="hint">{x.file.title}</span>
                </button>
              ))
            ) : (
              <span className="hint">{all.length ? 'Nothing matches.' : 'No sources yet. Add them in a PD reading file, in the resources library.'}</span>
            )}
          </span>
          <label className="cite-page">
            <span>Page</span>
            <input value={page} onChange={(e) => setPage(e.target.value)} placeholder="optional" />
          </label>
          <span className="hint">In {style === 'apa' ? 'APA 7' : style}: {all?.[0] ? inText(all[0].src, style, page || '12') : '(Thornbury, 2006, p. 12)'}</span>
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
