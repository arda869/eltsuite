import { usePhone } from '../../lib/useMedia';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { onValue, push, set, update } from 'firebase/database';
import { Highlight } from '../../editor/Highlight';
import { TextColor, TextColorTool } from '../../editor/TextColor';
import { Ipa, newIpa } from '../../editor/Ipa';
import { Stress, newStress } from '../../editor/Stress';
import { EditorClassContext } from '../../editor/context';
import { newId } from '../../lib/tasks';
import { UiIcon } from '../../components/UiIcon';
import { claimStart, collabRef, readState, setLock, watchFlags } from '../provider';
import { useCollabSession, type CollabSession } from '../session';
import { colorOf, CommentCard, MODE_LABEL } from '../CollabDoc';
import type { CollabMode } from '../suggest';
import { BGS, FILLS, fillOf, H, LAYOUTS, makeEl, makeSlide, PT, readSlides, slideMap, slidesOf, W, type El, type Shape, type Slide, type TextSize } from './model';
import { downloadPptx, elHtml, printSlides } from './exportSlides';

// Slides the class makes together, live, like Google Slides: a strip of slides, a canvas with
// text boxes, pictures and shapes to move and resize, backgrounds, comments on each slide,
// presenting full screen, and downloading as PowerPoint or PDF.

type Thread = { by: string; name: string; color: string; text: string; at: number; quote?: string; slide?: string; resolved?: boolean; r?: Record<string, { by: string; name: string; color: string; text: string; at: number }> };
export type SlidesProps = {
  docKey: string;
  title: string;
  modes: CollabMode[];
  teacher?: boolean;
  me: { uid: string; name: string };
  classId: string;
  display?: 'inline' | 'expand' | 'full';
  canDownload?: boolean;
  head?: ReactNode;
  ownSlides?: boolean; // each learner changes only the slides they added
  templateKey?: string; // a new deck begins as a copy of this one
};

const SNAP = 5;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const inkOf = (k: string) => BGS.find((b) => b.k === k)?.ink ?? '#2b2a28';
const bgOf = (k: string) => BGS.find((b) => b.k === k)?.bg ?? '#fff';
const toHex = (c: string) => {
  const x = document.createElement('canvas').getContext('2d');
  if (!x) return '#b8744e';
  x.fillStyle = c || '#b8744e';
  return x.fillStyle.startsWith('#') ? x.fillStyle : '#b8744e';
};

async function pictureData(file: Blob): Promise<{ src: string; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d')!;
  g.drawImage(bmp, 0, 0, c.width, c.height);
  let src = file.type === 'image/png' && file.size < 300_000 ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.82);
  if (src.length > 900_000) src = c.toDataURL('image/jpeg', 0.6);
  return { src, w: c.width, h: c.height };
}

function paraOf(text: string) {
  const p = new Y.XmlElement('paragraph');
  if (text) p.insert(0, [new Y.XmlText(text)]);
  return p;
}

export function SlidesDoc(props: SlidesProps) {
  const session = useCollabSession(props.docKey, props.me.uid);
  if (!session) return <div className="cd cd-wait" />;
  return <SlidesInner {...props} session={session} />;
}

function SlidesInner({ docKey, title, modes, teacher, me, classId, display = 'inline', canDownload, head, ownSlides, templateKey, session }: SlidesProps & { session: CollabSession }) {
  const doc = session.doc;
  const author = { by: me.uid, name: me.name || 'Someone', color: colorOf(me.uid) };
  // Slides have no suggestions: suggesting becomes commenting.
  const allowed = useMemo<CollabMode[]>(() => {
    const list = teacher ? (['edit', 'comment'] as CollabMode[]) : modes.map((m) => (m === 'suggest' ? 'comment' : m));
    return [...new Set(list)].filter(Boolean);
  }, [teacher, modes]);
  const [mode, setMode] = useState<CollabMode>(allowed[0] ?? 'view');
  useEffect(() => {
    if (!allowed.includes(mode)) setMode(allowed[0] ?? 'view');
  }, [allowed, mode]);
  const [flags, setFlags] = useState<{ lock?: boolean }>({});
  useEffect(() => watchFlags(docKey, setFlags, classId), [docKey, classId]);
  const locked = !!flags.lock && !teacher;
  const eff: CollabMode = locked ? 'view' : mode;
  const phone = usePhone();
  const writing = eff === 'edit' && !phone; // arranging slides needs a larger screen

  const [slides, setSlides] = useState<Slide[]>([]);
  const [synced, setSynced] = useState(false);
  const [cur, setCur] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  const [presenting, setPresenting] = useState<number | null>(null);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [people, setPeople] = useState<{ name: string; color: string; slide?: string; uid?: string }[]>([]);
  const [active, setActive] = useState<Editor | null>(null);
  const [, tick] = useState(0);
  const [menu, setMenu] = useState<'' | 'add' | 'shape' | 'bg' | 'dl' | 'layout'>('');
  const [side, setSide] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);

  // Read the slides whenever anyone changes them (once per frame at most).
  useEffect(() => {
    const arr = slidesOf(doc);
    let raf = 0;
    const read = () => {
      raf = 0;
      setSlides(readSlides(doc));
    };
    const later = () => (raf ||= requestAnimationFrame(read));
    arr.observeDeep(later);
    read();
    return () => (arr.unobserveDeep(later), cancelAnimationFrame(raf));
  }, [doc]);

  // The first person to open an empty deck starts it: from the teacher's starting slides, or a title slide.
  useEffect(() => {
    session.provider.whenSynced(async () => {
      setSynced(true);
      if (slidesOf(doc).length > 0) return;
      if (!(await claimStart(docKey))) return;
      const tpl = templateKey ? await readState(templateKey).catch(() => null) : null;
      if (tpl && slidesOf(doc).length === 0) {
        const tmp = new Y.Doc();
        Y.applyUpdate(tmp, tpl);
        if (slidesOf(tmp).length) {
          Y.applyUpdate(doc, Y.encodeStateAsUpdate(tmp));
          tmp.destroy();
          return;
        }
        tmp.destroy();
      }
      if (slidesOf(doc).length) return;
      doc.transact(() => {
        const s = makeSlide('title');
        slidesOf(doc).push([s]);
        const els = (s.get('els') as Y.Array<Y.Map<unknown>>).toArray();
        (els[0]?.get('text') as Y.XmlFragment | undefined)?.insert(0, [paraOf(title)]);
      });
    });
  }, [session, doc, docKey, templateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => onValue(collabRef(docKey, 'c'), (s) => setThreads((s.val() as Record<string, Thread>) ?? {})), [docKey]);

  // Who is here, and on which slide.
  useEffect(() => {
    const aw = session.provider.awareness;
    aw.setLocalStateField('user', { name: author.name, color: author.color, uid: me.uid });
    const f = () =>
      setPeople(
        [...aw.getStates().entries()]
          .filter(([id]) => id !== doc.clientID)
          .map(([, s]) => ({ ...((s as { user?: { name: string; color: string; uid?: string } }).user ?? { name: '', color: '' }), slide: (s as { slide?: string }).slide }))
          .filter((u) => u.name),
      );
    aw.on('change', f);
    f();
    set(collabRef(docKey, `who/${me.uid}`), { name: author.name, color: author.color }).catch(() => {});
    return () => aw.off('change', f);
  }, [session, docKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A slide just added may not be read yet: keep it chosen until it arrives.
  const found = slides.findIndex((s) => s.id === cur);
  const curIdx = Math.max(0, found);
  const slide = slides[curIdx];
  useEffect(() => {
    if (!cur && slide) setCur(slide.id);
  }, [slide, cur]);
  useEffect(() => {
    session.provider.awareness.setLocalStateField('slide', slide?.id ?? '');
    setSel(null);
    setActive(null);
  }, [slide?.id, session]);

  const canEditSlide = (s?: Slide) => !!s && writing && (!ownSlides || !!teacher || s.owner === me.uid);
  const editable = canEditSlide(slide);
  const accentHex = () => toHex(getComputedStyle(root.current ?? document.documentElement).getPropertyValue('--accent').trim());

  // Changes
  const tx = (f: () => void) => doc.transact(f);
  const elsOf = (id: string) => slideMap(doc, id)?.get('els') as Y.Array<Y.Map<unknown>> | undefined;
  const addSlide = (layout: string) => {
    const s = makeSlide(layout, ownSlides && !teacher ? { uid: me.uid, name: me.name } : undefined);
    tx(() => slidesOf(doc).insert(slides.length ? curIdx + 1 : 0, [s]));
    setCur(String(s.get('id')));
    setMenu('');
  };
  const dupSlide = (i: number) => {
    const src = slidesOf(doc).get(i);
    if (!src) return;
    const c = src.clone();
    c.set('id', newId());
    if (ownSlides && !teacher) c.set('owner', me.uid), c.set('ownerName', me.name);
    tx(() => slidesOf(doc).insert(i + 1, [c]));
    setCur(String(c.get('id')));
  };
  const delSlide = (i: number) => {
    tx(() => slidesOf(doc).delete(i, 1));
    setCur(slides[i + 1]?.id ?? slides[i - 1]?.id ?? '');
  };
  const moveSlide = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= slides.length) return;
    const arr = slidesOf(doc);
    const c = arr.get(i).clone();
    tx(() => {
      arr.delete(i, 1);
      arr.insert(j, [c]);
    });
    setCur(String(c.get('id')));
  };
  const setSlideProp = (k: string, v: unknown) => slide && tx(() => slideMap(doc, slide.id)?.set(k, v));
  const changeLayout = (layout: string) => {
    if (!slide) return;
    const els = elsOf(slide.id);
    if (!els) return;
    // Keep what was written; place it in the new layout's boxes.
    const old = els.toArray();
    const tpl = LAYOUTS.find((l) => l.k === layout)?.els ?? [];
    tx(() => {
      const used = new Set<Y.Map<unknown>>();
      for (const t of tpl) {
        const m = old.find((o) => !used.has(o) && o.get('type') === t.type && (t.type !== 'text' || o.get('role') === t.role));
        if (m) {
          used.add(m);
          (['x', 'y', 'w', 'h', 'size', 'align'] as const).forEach((k) => t[k] !== undefined && m.set(k, t[k]));
        } else els.push([makeEl(t)]);
      }
      slideMap(doc, slide.id)?.set('layout', layout);
    });
    setMenu('');
  };
  const addEl = (e: Omit<El, 'id'>) => {
    if (!slide) return;
    const m = makeEl(e);
    tx(() => elsOf(slide.id)?.push([m]));
    setSel(String(m.get('id')));
    setMenu('');
  };
  const elM = (id: string) => elsOf(slide?.id ?? '')?.toArray().find((m) => m.get('id') === id);
  const setElProps = (id: string, p: Partial<El>) => tx(() => Object.entries(p).forEach(([k, v]) => elM(id)?.set(k, v)));
  const delEl = (id: string) => {
    const els = elsOf(slide?.id ?? '');
    const i = els?.toArray().findIndex((m) => m.get('id') === id) ?? -1;
    if (els && i >= 0) tx(() => els.delete(i, 1));
    setSel(null);
  };
  const order = (id: string, front: boolean) => {
    const els = elsOf(slide?.id ?? '');
    const i = els?.toArray().findIndex((m) => m.get('id') === id) ?? -1;
    if (!els || i < 0) return;
    const c = els.get(i).clone();
    tx(() => {
      els.delete(i, 1);
      if (front) els.push([c]);
      else els.insert(0, [c]);
    });
  };
  const dupEl = (id: string) => {
    const m = elM(id);
    if (!m) return;
    const c = m.clone();
    c.set('id', newId());
    c.set('x', Math.min(W - 40, Number(m.get('x')) + 20));
    c.set('y', Math.min(H - 40, Number(m.get('y')) + 20));
    tx(() => elsOf(slide!.id)?.push([c]));
    setSel(String(c.get('id')));
  };
  const addPicture = async (file: File) => {
    const p = await pictureData(file).catch(() => null);
    if (!p || !slide) return;
    const target = slide.els.find((e) => e.id === sel && e.type === 'image') ?? slide.els.find((e) => e.type === 'image' && !e.src);
    if (target) return setElProps(target.id, { src: p.src });
    const k = Math.min(600 / p.w, 380 / p.h);
    const w = Math.round(p.w * k);
    const h = Math.round(p.h * k);
    addEl({ type: 'image', x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, src: p.src });
  };

  // Comments on each slide
  const [draft, setDraft] = useState('');
  const postComment = () => {
    const text = draft.trim();
    if (!text || !slide) return;
    set(collabRef(docKey, `c/${newId()}`), { ...author, text, at: Date.now(), slide: slide.id, quote: `Slide ${curIdx + 1}` }).catch(() => {});
    setDraft('');
  };
  const reply = (id: string, text: string) => text.trim() && set(push(collabRef(docKey, `c/${id}/r`)), { ...author, text: text.trim(), at: Date.now() }).catch(() => {});
  const resolve = (id: string) => update(collabRef(docKey, `c/${id}`), { resolved: true }).catch(() => {});
  const openThreads = Object.entries(threads).filter(([, t]) => !t.resolved);
  const slideThreads = openThreads.filter(([, t]) => t.slide === slide?.id);

  // Keys: Delete removes the chosen item, arrows nudge it, Escape lets it go.
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('[contenteditable="true"], input, textarea, select')) return;
    if (!sel || !editable) return;
    const el = slide?.els.find((x) => x.id === sel);
    if (!el) return;
    if (e.key === 'Delete' || e.key === 'Backspace') return e.preventDefault(), delEl(sel);
    if (e.key === 'Escape') return setSel(null);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') return e.preventDefault(), dupEl(sel);
    const d = e.shiftKey ? 20 : SNAP;
    const mv: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    if (mv[e.key]) {
      e.preventDefault();
      setElProps(sel, { x: clamp(el.x + mv[e.key][0], -el.w + 20, W - 20), y: clamp(el.y + mv[e.key][1], -el.h + 20, H - 20) });
    }
  };
  useEffect(() => {
    if (!big) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && presenting === null && !(e.target as HTMLElement).closest?.('[contenteditable="true"]') && setBig(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [big, presenting]);

  const selEl = slide?.els.find((e) => e.id === sel);
  const B = (label: ReactNode, on: boolean, run: () => void, tip: string, disabled = false) => (
    <button type="button" className={'ne-btn' + (on ? ' on' : '')} data-tip={tip} aria-label={tip} aria-pressed={on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  const Menu = ({ k, label, tip, children }: { k: typeof menu; label: ReactNode; tip: string; children: ReactNode }) => (
    <span className="sl-menu-wrap">
      <button type="button" className={'ne-btn sl-mbtn' + (menu === k ? ' on' : '')} data-tip={tip} aria-label={tip} aria-expanded={menu === k} onMouseDown={(e) => e.preventDefault()} onClick={() => setMenu(menu === k ? '' : k)}>
        {label}
      </button>
      {menu === k && (
        <span className="sl-menu" role="menu">
          {children}
        </span>
      )}
    </span>
  );
  // Menus close on a click elsewhere.
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !(e.target as Element).closest?.('.sl-menu-wrap') && setMenu('');
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu('');
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc));
  }, [menu]);

  const layoutPreview = (k: string) => (
    <span className="sl-lay-mini">
      {(LAYOUTS.find((l) => l.k === k)?.els ?? []).map((e, i) => (
        <i key={i} className={e.type === 'image' ? 'pic' : e.role === 'title' ? 'tt' : ''} style={{ left: `${(e.x / W) * 100}%`, top: `${(e.y / H) * 100}%`, width: `${(e.w / W) * 100}%`, height: `${(e.h / H) * 100}%` }} />
      ))}
    </span>
  );

  const body = (
    <div ref={root} className={'cd sl' + (big ? ' big' : '') + ' m-' + eff + (locked ? ' is-locked' : '')}>
      <div className="cd-top">
        <span className="cd-title">
          <UiIcon name="present" size={16} />
          {title || 'Shared slides'}
        </span>
        {head}
        <span className="cd-people" aria-label="In the slides now">
          {people.slice(0, 6).map((p, i) => (
            <span key={i} className="cd-avatar" style={{ background: p.color }} title={p.name}>
              {p.name.trim().slice(0, 1).toUpperCase()}
            </span>
          ))}
          {people.length > 6 && <span className="cd-more">+{people.length - 6}</span>}
        </span>
        <span className="cd-mode">
          {locked ? (
            <span className="cd-locked">
              <UiIcon name="lock" size={14} /> Locked
            </span>
          ) : allowed.length > 1 ? (
            <select value={mode} onChange={(e) => setMode(e.target.value as CollabMode)} aria-label="Mode">
              {allowed.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m].label}
                </option>
              ))}
            </select>
          ) : (
            <span className="cd-mode-one">{MODE_LABEL[eff].label}</span>
          )}
        </span>
        {teacher && (
          <button type="button" className={'btn small-btn cd-lock' + (flags.lock ? ' on' : '')} onClick={() => setLock(classId, docKey, !flags.lock)} data-tip={flags.lock ? 'Let learners change it again' : 'Stop learners changing it'}>
            <UiIcon name={flags.lock ? 'lock' : 'unlock'} size={14} /> {flags.lock ? 'Locked' : 'Lock'}
          </button>
        )}
        <button type="button" className="btn small-btn" onClick={() => setPresenting(curIdx)} disabled={!slides.length} data-tip="Show the slides full screen">
          <UiIcon name="present" size={14} /> Present
        </button>
        {(teacher || canDownload) && (
          <span className="cd-dl sl-menu-wrap">
            <button type="button" className="cd-icon" onClick={() => setMenu(menu === 'dl' ? '' : 'dl')} aria-label="Download" data-tip="Download">
              <UiIcon name="import" size={16} />
            </button>
            {menu === 'dl' && (
              <span className="cd-dl-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => (setMenu(''), void downloadPptx(readSlides(doc), title, accentHex()))}>
                  PowerPoint (.pptx)
                </button>
                <button type="button" role="menuitem" onClick={() => (setMenu(''), printSlides(readSlides(doc), title, accentHex()))}>
                  PDF (print or save)
                </button>
              </span>
            )}
          </span>
        )}
        <button type="button" className={'cd-icon' + (side ? ' on' : '')} onClick={() => setSide(!side)} aria-label="Comments" data-tip="Comments on this slide">
          <UiIcon name="discuss" size={16} />
          {openThreads.length > 0 && <span className="sl-badge">{openThreads.length}</span>}
        </button>
        {display !== 'inline' || big ? (
          <button type="button" className="cd-icon" onClick={() => setBig(!big)} aria-label={big ? 'Back to the task' : 'Full screen'} data-tip={big ? 'Back to the task (Esc)' : 'Full screen'}>
            <UiIcon name={big ? 'fullscreenOff' : 'fullscreen'} size={16} />
          </button>
        ) : null}
      </div>

      {writing && (
        <div className="ne-bar cd-bar sl-bar" role="toolbar" aria-label="Slide tools">
          <Menu k="add" label={<>+ Slide</>} tip="Add a slide">
            {LAYOUTS.map((l) => (
              <button key={l.k} type="button" role="menuitem" className="sl-lay" onClick={() => addSlide(l.k)}>
                {layoutPreview(l.k)}
                {l.label}
              </button>
            ))}
          </Menu>
          <span className="ne-sep" aria-hidden="true" />
          {B(<span className="sl-tb-t">T</span>, false, () => addEl({ type: 'text', role: 'body', x: 300, y: 230, w: 400, h: 100, size: 'm' }), 'Text box', !editable)}
          {B(<UiIcon name="picture" size={15} />, false, () => fileIn.current?.click(), 'Picture', !editable)}
          <Menu k="shape" label={<span className="sl-shape-ic" />} tip="Shape">
            {(
              [
                ['rect', 'Rectangle'],
                ['round', 'Rounded box'],
                ['ellipse', 'Circle'],
                ['line', 'Line'],
                ['arrow', 'Arrow'],
              ] as [Shape, string][]
            ).map(([k, l]) => (
              <button key={k} type="button" role="menuitem" disabled={!editable} onClick={() => addEl({ type: 'shape', shape: k, x: 400, y: 200, w: k === 'line' || k === 'arrow' ? 240 : 200, h: k === 'line' || k === 'arrow' ? 40 : 140, fill: k === 'line' || k === 'arrow' ? 'none' : 'accent', stroke: k === 'line' || k === 'arrow' ? '#2b2a28' : undefined })}>
                <span className={'sl-shape-pv s-' + k} /> {l}
              </button>
            ))}
          </Menu>
          <Menu k="layout" label={<>Layout</>} tip="Layout of this slide">
            {LAYOUTS.map((l) => (
              <button key={l.k} type="button" role="menuitem" className={'sl-lay' + (slide?.layout === l.k ? ' on' : '')} disabled={!editable} onClick={() => changeLayout(l.k)}>
                {layoutPreview(l.k)}
                {l.label}
              </button>
            ))}
          </Menu>
          <Menu k="bg" label={<span className="sl-bg-ic" style={{ background: bgOf(slide?.bg ?? 'white') }} />} tip="Background">
            {BGS.map((b) => (
              <button key={b.k} type="button" role="menuitem" disabled={!editable} className={slide?.bg === b.k ? 'on' : ''} onClick={() => (setSlideProp('bg', b.k), setMenu(''))}>
                <span className="sl-bg-ic" style={{ background: b.bg }} /> {b.label}
              </button>
            ))}
          </Menu>
          {active && selEl?.type === 'text' && editable && (
            <>
              <span className="ne-sep" aria-hidden="true" />
              {B('B', active.isActive('bold'), () => active.chain().focus().toggleBold().run(), 'Bold')}
              {B(<i>I</i>, active.isActive('italic'), () => active.chain().focus().toggleItalic().run(), 'Italic')}
              {B(<u>U</u>, active.isActive('underline'), () => active.chain().focus().toggleUnderline().run(), 'Underline')}
              <TextColorTool editor={active} />
              {B('▮', active.isActive('highlight'), () => active.chain().focus().toggleMark('highlight', { color: 'yellow' }).run(), 'Highlight')}
              {B('•', active.isActive('bulletList'), () => active.chain().focus().toggleBulletList().run(), 'List')}
              {B('1.', active.isActive('orderedList'), () => active.chain().focus().toggleOrderedList().run(), 'Numbered list')}
              {B(<span className="ne-ipa">/ə/</span>, false, () => active.chain().focus().insertContent(newIpa('RP')).run(), 'IPA: phonemic symbols')}
              {B(<span className="ne-stress">Oo</span>, false, () => active.chain().focus().insertContent(newStress('box')).run(), 'Word stress')}
            </>
          )}
          {selEl && editable && (
            <>
              <span className="ne-sep" aria-hidden="true" />
              {selEl.type === 'text' && (
                <>
                  <select className="sl-size" value={selEl.size ?? 'm'} onChange={(e) => setElProps(selEl.id, { size: e.target.value as TextSize })} aria-label="Text size">
                    <option value="s">Small</option>
                    <option value="m">Normal</option>
                    <option value="l">Large</option>
                    <option value="xl">Title</option>
                  </select>
                  {(['left', 'center', 'right'] as const).map((al) => <span key={al} style={{ display: 'contents' }}>{B(<span className={'sl-al a-' + al} />, (selEl.align ?? 'left') === al, () => setElProps(selEl.id, { align: al }), al === 'left' ? 'Align left' : al === 'center' ? 'Centre' : 'Align right')}</span>)}
                </>
              )}
              {selEl.type === 'shape' && (
                <span className="sl-fills" aria-label="Colour">
                  {FILLS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={'sl-fill' + ((selEl.shape === 'line' || selEl.shape === 'arrow' ? selEl.stroke : selEl.fill) === c ? ' on' : '') + (c === 'none' ? ' none' : '')}
                      style={{ background: c === 'none' ? undefined : fillOf(c) }}
                      aria-label={c === 'none' ? 'No fill' : 'Colour'}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setElProps(selEl.id, selEl.shape === 'line' || selEl.shape === 'arrow' ? { stroke: c === 'none' ? '#2b2a28' : c } : { fill: c })}
                    />
                  ))}
                </span>
              )}
              {B('⤒', false, () => order(selEl.id, true), 'Bring to front')}
              {B('⤓', false, () => order(selEl.id, false), 'Send to back')}
              {B('⧉', false, () => dupEl(selEl.id), 'Duplicate (Ctrl+D)')}
              {B(<UiIcon name="trash" size={14} />, false, () => delEl(selEl.id), 'Delete (Delete key)')}
            </>
          )}
          {!editable && slide && <span className="hint">{ownSlides && slide.owner !== me.uid ? `${slide.ownerName ? slide.ownerName.split(' ')[0] + '’s' : 'This'} slide: you can comment on it` : ''}</span>}
          <input ref={fileIn} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && void addPicture(e.target.files[0]), (e.target.value = ''))} />
        </div>
      )}
      {phone && eff === 'edit' && <div className="cd-lockbar for-teacher">To change the slides, open them on a tablet or a computer. Here you can look, present and comment.</div>}
      {flags.lock && (
        <div className={'cd-lockbar' + (teacher ? ' for-teacher' : '')} role="status">
          <UiIcon name="lock" size={16} />
          {teacher ? (
            <span>
              <b>Locked.</b> Learners can look at the slides but cannot change them. You can still edit.
            </span>
          ) : (
            <span>
              <b>Your teacher has locked these slides.</b> You can look at them, but not change them for now.
            </span>
          )}
        </div>
      )}

      <div className={'sl-main' + (side ? ' with-side' : '')}>
        <div className="sl-strip" role="listbox" aria-label="Slides">
          {slides.map((s, i) => {
            const here = people.filter((p) => p.slide === s.id);
            const n = openThreads.filter(([, t]) => t.slide === s.id).length;
            return (
              <div key={s.id} className={'sl-thumb-row' + (s.id === slide?.id ? ' on' : '')}>
                <span className="sl-num">{i + 1}</span>
                <button type="button" role="option" aria-selected={s.id === slide?.id} className="sl-thumb" onClick={() => setCur(s.id)}>
                  <StaticSlide s={s} />
                  {here.length > 0 && (
                    <span className="sl-here">
                      {here.slice(0, 4).map((p, k) => (
                        <i key={k} style={{ background: p.color }} title={p.name} />
                      ))}
                    </span>
                  )}
                  {n > 0 && <span className="sl-cn">{n}</span>}
                </button>
                {ownSlides && s.ownerName && <span className="sl-owner">{s.ownerName.split(' ')[0]}</span>}
                {s.id === slide?.id && canEditSlide(s) && (
                  <span className="sl-thumb-acts">
                    <button type="button" aria-label="Move up" data-tip="Move up" disabled={i === 0} onClick={() => moveSlide(i, -1)}>
                      ↑
                    </button>
                    <button type="button" aria-label="Move down" data-tip="Move down" disabled={i === slides.length - 1} onClick={() => moveSlide(i, 1)}>
                      ↓
                    </button>
                    <button type="button" aria-label="Duplicate" data-tip="Duplicate" onClick={() => dupSlide(i)}>
                      ⧉
                    </button>
                    <button type="button" aria-label="Delete slide" data-tip="Delete slide" disabled={slides.length < 2} onClick={() => delSlide(i)}>
                      <UiIcon name="trash" size={12} />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
          {writing && (
            <button type="button" className="sl-add" onClick={() => addSlide(slides.length ? 'text' : 'title')}>
              + New slide
            </button>
          )}
        </div>
        <div className="sl-stage" tabIndex={-1} onKeyDown={onKey} onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}>
          {!synced && <span className="cd-sync">Opening the slides…</span>}
          {slide ? (
            <EditorClassContext.Provider value={{ classId, classmates: [] }}>
              <Canvas key={slide.id} doc={doc} s={slide} editable={editable} sel={sel} onSel={setSel} onActive={setActive} onTick={() => tick((n) => n + 1)} onPicture={() => fileIn.current?.click()} onMove={(id, p) => setElProps(id, p)} />
            </EditorClassContext.Provider>
          ) : (
            synced && <p className="hint">No slides yet.</p>
          )}
          {slide && (
            <span className="sl-foot hint">
              Slide {curIdx + 1} of {slides.length}
              {editable && ' · Drag to move, the corners to resize, Delete to remove'}
            </span>
          )}
        </div>
        {side && (
          <aside className="cd-side sl-side">
            <span className="cd-card-who">Comments on slide {curIdx + 1}</span>
            {eff !== 'view' && (
              <div className="cd-card cd-draft">
                <textarea value={draft} placeholder="Comment on this slide" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' && (e.metaKey || e.ctrlKey) ? postComment() : e.stopPropagation())} />
                <span className="cd-card-btns">
                  <button type="button" className="btn small-btn primary" disabled={!draft.trim()} onClick={postComment}>
                    Comment
                  </button>
                </span>
              </div>
            )}
            {slideThreads.map(([id, t]) => (
              <CommentCard key={id} t={{ ...t, quote: undefined }} onGo={() => {}} onReply={(x) => reply(id, x)} onResolve={eff !== 'view' || teacher ? () => resolve(id) : undefined} />
            ))}
            {!slideThreads.length && <span className="hint cd-none">No comments on this slide.</span>}
            {openThreads.length > slideThreads.length && (
              <span className="sl-other">
                <span className="hint">Other slides:</span>
                {slides.map((s, i) => {
                  const n = openThreads.filter(([, t]) => t.slide === s.id).length;
                  return n && s.id !== slide?.id ? (
                    <button key={s.id} type="button" className="ap-chip" onClick={() => setCur(s.id)}>
                      Slide {i + 1} ({n})
                    </button>
                  ) : null;
                })}
              </span>
            )}
          </aside>
        )}
      </div>
      {presenting !== null && createPortal(<Present slides={slides} start={presenting} onClose={(i) => (setPresenting(null), slides[i] && setCur(slides[i].id))} />, document.body)}
    </div>
  );
  if (display === 'full' && !big)
    return (
      <button type="button" className="cd-open" onClick={() => setBig(true)}>
        <span className="cd-open-icon">
          <UiIcon name="present" size={22} />
        </span>
        <span className="cd-open-text">
          <strong>{title || 'Shared slides'}</strong>
          <span className="hint">{people.length ? `${people.length + 1} people in it now` : `${slides.length || ''} ${slides.length === 1 ? 'slide' : 'slides'}`.trim() || 'Open the slides'}</span>
        </span>
        <UiIcon name="fullscreen" size={18} />
      </button>
    );
  return big ? createPortal(<div className="cd-overlay">{body}</div>, document.body) : body;
}

// A slide drawn as a picture (thumbnails, presenting).
function StaticSlide({ s }: { s: Slide }) {
  const html = useMemo(() => s.els.map((e) => elHtml(e, 'var(--accent)', inkOf(s.bg))).join(''), [s]);
  return <span className="sl-static" style={{ background: bgOf(s.bg) }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Present({ slides, start, onClose }: { slides: Slide[]; start: number; onClose: (i: number) => void }) {
  const [i, setI] = useState(start);
  const box = useRef<HTMLDivElement>(null);
  const n = slides.length;
  useEffect(() => {
    box.current?.focus();
    box.current?.requestFullscreen?.().catch(() => {});
    const key = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) setI((x) => Math.min(n - 1, x + 1));
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) setI((x) => Math.max(0, x - 1));
      else if (e.key === 'Home') setI(0);
      else if (e.key === 'End') setI(n - 1);
      else if (e.key === 'Escape') close();
      else return;
      e.preventDefault();
    };
    const fs = () => !document.fullscreenElement && close();
    window.addEventListener('keydown', key);
    document.addEventListener('fullscreenchange', fs);
    return () => (window.removeEventListener('keydown', key), document.removeEventListener('fullscreenchange', fs));
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const iRef = useRef(i);
  iRef.current = i;
  function close() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onClose(iRef.current);
  }
  const s = slides[i];
  return (
    <div ref={box} className="sl-present" tabIndex={-1} onClick={(e) => (e.clientX > window.innerWidth / 3 ? setI((x) => Math.min(n - 1, x + 1)) : setI((x) => Math.max(0, x - 1)))}>
      <div className="sl-present-slide">{s && <StaticSlide s={s} />}</div>
      <div className="sl-present-bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="Previous slide">
          <UiIcon name="prev" size={16} />
        </button>
        <span>
          {i + 1} / {n}
        </span>
        <button type="button" onClick={() => setI((x) => Math.min(n - 1, x + 1))} disabled={i >= n - 1} aria-label="Next slide">
          <UiIcon name="next" size={16} />
        </button>
        <button type="button" onClick={close}>
          End
        </button>
      </div>
    </div>
  );
}

type Box = { x: number; y: number; w: number; h: number };
function Canvas({ doc, s, editable, sel, onSel, onActive, onTick, onPicture, onMove }: { doc: Y.Doc; s: Slide; editable: boolean; sel: string | null; onSel: (id: string | null) => void; onActive: (e: Editor | null) => void; onTick: () => void; onPicture: () => void; onMove: (id: string, b: Box) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<({ id: string } & Box) | null>(null);
  const start = useCallback(
    (e: React.PointerEvent, el: El, how: string) => {
      if (!editable || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      onSel(el.id);
      const k = W / (ref.current?.getBoundingClientRect().width || W);
      const x0 = e.clientX;
      const y0 = e.clientY;
      const b0: Box = { x: el.x, y: el.y, w: el.w, h: el.h };
      let last: Box = b0;
      let moved = false;
      const ratio = el.type === 'image' ? b0.w / b0.h : 0;
      const mv = (ev: PointerEvent) => {
        const dx = (ev.clientX - x0) * k;
        const dy = (ev.clientY - y0) * k;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        moved = true;
        const b = { ...b0 };
        if (how === 'move') {
          b.x = snap(clamp(b0.x + dx, -b0.w + 20, W - 20));
          b.y = snap(clamp(b0.y + dy, -b0.h + 20, H - 20));
          // Snap to the centre of the slide.
          if (Math.abs(b.x + b.w / 2 - W / 2) < 8) b.x = Math.round(W / 2 - b.w / 2);
          if (Math.abs(b.y + b.h / 2 - H / 2) < 8) b.y = Math.round(H / 2 - b.h / 2);
        } else {
          if (how.includes('e')) b.w = Math.max(20, snap(b0.w + dx));
          if (how.includes('s')) b.h = Math.max(20, snap(b0.h + dy));
          if (how.includes('w')) (b.w = Math.max(20, snap(b0.w - dx))), (b.x = b0.x + b0.w - b.w);
          if (how.includes('n')) (b.h = Math.max(20, snap(b0.h - dy))), (b.y = b0.y + b0.h - b.h);
          if (ratio && how.length === 2) {
            b.h = Math.round(b.w / ratio);
            if (how.includes('n')) b.y = b0.y + b0.h - b.h;
          }
        }
        last = b;
        setDrag({ id: el.id, ...b });
      };
      const up = () => {
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
        if (moved) onMove(el.id, last);
        setDrag(null);
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    },
    [editable, onSel, onMove],
  );
  void doc;
  const ink = inkOf(s.bg);
  return (
    <div ref={ref} className="sl-canvas" style={{ background: bgOf(s.bg), color: ink }} onPointerDown={(e) => e.target === e.currentTarget && onSel(null)}>
      {s.els.map((el0) => {
        const el = drag?.id === el0.id ? { ...el0, ...drag } : el0;
        const on = sel === el.id;
        const pos = { left: `${(el.x / W) * 100}%`, top: `${(el.y / H) * 100}%`, width: `${(el.w / W) * 100}%`, height: `${(el.h / H) * 100}%` };
        return (
          <div key={el.id} className={'sl-el t-' + el.type + (on ? ' on' : '') + (editable ? ' can' : '')} style={pos} onPointerDown={(e) => (el.type === 'text' ? onSel(el.id) : start(e, el, 'move'))}>
            {el.type === 'text' && el.text && <TextBox el={el} editable={editable} onFocus={(ed) => (onSel(el.id), onActive(ed))} onTick={onTick} />}
            {el.type === 'image' &&
              (el.src ? (
                <img src={el.src} alt="" draggable={false} />
              ) : (
                <span className="sl-pic-empty">
                  {editable ? (
                    <button type="button" className="btn small-btn" onPointerDown={(e) => e.stopPropagation()} onClick={() => (onSel(el.id), onPicture())}>
                      <UiIcon name="picture" size={14} /> Add a picture
                    </button>
                  ) : (
                    <UiIcon name="picture" size={22} />
                  )}
                </span>
              ))}
            {el.type === 'shape' && <span className="sl-shape" dangerouslySetInnerHTML={{ __html: elHtml({ ...el, x: 0, y: 0, w: W, h: H }, 'var(--accent)', ink).replace(/^<div[^>]*>|<\/div>$/g, '') }} />}
            {on && editable && (
              <>
                {el.type === 'text' && ['n', 's', 'e', 'w'].map((d) => <i key={d} className={'sl-edge e-' + d} onPointerDown={(e) => start(e, el, 'move')} />)}
                {(el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow') ? ['e', 'w'] : ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w']).map((d) => (
                  <i key={'h' + d} className={'sl-h h-' + d} onPointerDown={(e) => start(e, el, d)} />
                ))}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TextBox({ el, editable, onFocus, onTick }: { el: El; editable: boolean; onFocus: (e: Editor) => void; onTick: () => void }) {
  const tickRef = useRef(onTick);
  tickRef.current = onTick;
  const focusRef = useRef(onFocus);
  focusRef.current = onFocus;
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ history: false, heading: false, codeBlock: false, blockquote: false, horizontalRule: false }),
        Underline,
        Highlight,
        TextColor,
        Ipa,
        Stress,
        Placeholder.configure({ placeholder: editable ? (el.role === 'title' ? 'Click to add a title' : 'Click to add text') : '' }),
        Collaboration.configure({ fragment: el.text }),
      ],
      editable,
      editorProps: { attributes: { class: 'sl-text' + (el.role === 'title' ? ' title' : '') } },
      onFocus: ({ editor }) => focusRef.current(editor as Editor),
      onSelectionUpdate: () => tickRef.current(),
    },
    [el.text],
  );
  useEffect(() => editor?.setEditable(editable), [editor, editable]);
  return <EditorContent editor={editor} className="sl-tb" style={{ fontSize: `${PT[el.size ?? 'm'] / 7.2}cqw`, textAlign: el.align ?? 'left' }} />;
}
