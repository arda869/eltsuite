import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';

// In a Collab document a question shows how it prints whenever you are not working on it. Click it
// and its editor opens right there; click anywhere else in the document and it goes back to the
// printed look. The printed look is drawn by the print engine itself, so it is what prints.
// (Lessons keep their own editor and worksheet view, so this is for Collab documents only.)

type Sheet = { css: string; html: string };
let cssCache: Promise<string> | null = null;

// The house print styles for a shadow root: the page parts taken out, the type in the document's own font.
function sheetStyles() {
  cssCache ??= import('../lib/worksheetHtml').then(({ sheetCss }) =>
    sheetCss({ header: false, key: false, qr: true, paper: 'A4', columns: 1, origin: location.origin })
      .replace(/@font-face[^}]*}/g, '')
      .replace(/@page[^}]*}/g, '')
      .replace(/:root/g, ':host')
      .replace(/\bbody\b/g, ':host')
      .replace(/\bFraunces\b/g, 'inherit')
      + `
:host { display: block; color: inherit; font: inherit; line-height: 1.5; background: none !important; padding: 0 !important; margin: 0 !important; }
.doc-worksheet { padding: 2px 0; }
.doc-worksheet > :first-child { margin-top: 0; } .doc-worksheet > :last-child { margin-bottom: 0; }`,
  );
  return cssCache;
}

async function paperOf(node: NodeViewProps['node']): Promise<Sheet> {
  const [{ flattenTask }, { inlineWorksheetHtml }, css] = await Promise.all([import('../lib/worksheet'), import('../lib/worksheetHtml'), sheetStyles()]);
  const task = flattenTask({ title: '', content: { type: 'doc', content: [node.toJSON()] } });
  return { css, html: inlineWorksheetHtml(task) };
}

function Paper({ sheet }: { sheet: Sheet }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${sheet.css}</style>${sheet.html}`;
  }, [sheet]);
  return <div ref={ref} className="ar-paper" />;
}

let pointerDown = false;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  window.addEventListener('mouseup', () => { pointerDown = false; }, true);
}

const inCollab = (p: NodeViewProps) => !!(p.editor.view.dom as HTMLElement).closest?.('.cd-host');

export function withRest(View: ComponentType<NodeViewProps>, label: string) {
  return function Resting(p: NodeViewProps) {
    const [focus, setFocus] = useState(false);
    const [sheet, setSheet] = useState<Sheet | null>(null);
    const collab = inCollab(p);
    const away = collab && !p.selected && !focus;
    // Wait for the mouse button to come up before the editor folds away, so the page doesn't move
    // under a click that is still going on.
    const [resting, setResting] = useState(away);
    useEffect(() => {
      if (!away) { setResting(false); return; }
      if (!pointerDown) { setResting(true); return; }
      let t = 0;
      const up = () => { t = window.setTimeout(() => setResting(true), 0); };
      window.addEventListener('mouseup', up, { once: true });
      return () => { window.removeEventListener('mouseup', up); window.clearTimeout(t); };
    }, [away]);
    useEffect(() => {
      if (!resting) return;
      let live = true;
      void paperOf(p.node).then((s) => live && setSheet(s)).catch(() => live && setSheet(null));
      return () => { live = false; };
    }, [resting, p.node]);
    // Typing in one of its fields keeps the editor open even when the document's selection moves.
    useEffect(() => {
      if (!collab) return;
      const on = () => {
        const pos = p.getPos();
        const dom = typeof pos === 'number' ? p.editor.view.nodeDOM(pos) : null;
        setFocus(!!(dom instanceof Element && dom.contains(document.activeElement)));
      };
      const off = () => window.setTimeout(on, 0);
      document.addEventListener('focusin', on);
      document.addEventListener('focusout', off);
      return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collab]);
    if (!resting || !sheet) {
      return <View {...p} />;
    }
    const open = () => {
      const pos = p.getPos();
      if (typeof pos !== 'number' || !p.editor.isEditable) return;
      p.editor.view.dispatch(p.editor.state.tr.setSelection(NodeSelection.create(p.editor.state.doc, pos)));
    };
    return (
      <NodeViewWrapper className="ar-rest" contentEditable={false} data-drag-handle="">
        <div
          role={p.editor.isEditable ? 'button' : undefined}
          tabIndex={p.editor.isEditable ? 0 : undefined}
          aria-label={p.editor.isEditable ? `${label}. Click to change it` : label}
          data-tip={p.editor.isEditable ? 'Click to change' : undefined}
          onMouseDown={(e) => { if (p.editor.isEditable) { e.preventDefault(); open(); } }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
        >
          <Paper sheet={sheet} />
        </div>
      </NodeViewWrapper>
    );
  };
}
