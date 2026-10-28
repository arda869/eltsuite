import { newIpa, type Accent } from './Ipa';
import { newStress } from './Stress';
import { Mark, mergeAttributes, Node } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { usePopPos } from './usePopPos';
import '../lib/extras.css';
import { newPhonCard, newPhonChart } from './Phonemes';

// Pronunciation in running text, the way teachers mark it on the board: sentence stress (dots,
// size, capitals, underlining or boxes), intonation arrows, linking with sounds that slip in,
// pauses between thought groups, dropped sounds (elision), sounds that change (assimilation,
// glottal stop, the American flap t) and weak vowels.
// Each kind has one look per task, so learners always read the marks the same way.

export type StressLook = 'dot' | 'size' | 'caps' | 'underline' | 'box';
export type ToneLook = 'arrow' | 'line';
export type DropLook = 'cross' | 'bracket';
export type ArcLook = 'under' | 'over';
export type Tone = 'fall' | 'rise' | 'fallrise' | 'risefall' | 'level';
export type LinkKind = 'link' | 'j' | 'w' | 'r' | 'pause' | 'stop';

export const STRESS_LOOKS: { k: StressLook; label: string }[] = [
  { k: 'dot', label: 'Dots' },
  { k: 'size', label: 'Size' },
  { k: 'caps', label: 'Capitals' },
  { k: 'underline', label: 'Underline' },
  { k: 'box', label: 'Box' },
];
export const TONES: { k: Tone; label: string; d: string }[] = [
  { k: 'fall', label: 'Falling', d: 'M2 1.8C9 1.8 13.5 5 17 11.6M12.6 10.8L17.2 11.8L17.9 7.2' },
  { k: 'rise', label: 'Rising', d: 'M2 12.2C9 12.2 13.5 9 17 2.4M12.6 3.2L17.2 2.2L17.9 6.8' },
  { k: 'fallrise', label: 'Fall-rise', d: 'M1.6 2.4C4 9 6.5 12 9.5 12S15.5 8 17.6 2.2M13.8 3.6L17.7 2L18.6 6.1' },
  { k: 'risefall', label: 'Rise-fall', d: 'M1.6 11.6C4 5 6.5 2 9.5 2S15.5 6 17.6 11.8M13.8 10.4L17.7 12L18.6 7.9' },
  { k: 'level', label: 'Level', d: 'M2 7H17.4M13.8 3.6L17.6 7L13.8 10.4' },
];
export const LINKS: { k: LinkKind; label: string; show: string; hint: string }[] = [
  { k: 'link', label: 'Linking', show: '‿', hint: 'turn‿off' },
  { k: 'j', label: 'Linking /j/', show: 'j', hint: 'I‿/j/‿am' },
  { k: 'w', label: 'Linking /w/', show: 'w', hint: 'go‿/w/‿out' },
  { k: 'r', label: 'Linking /r/', show: 'r', hint: 'law‿/r/‿and order' },
  { k: 'pause', label: 'Short pause', show: '|', hint: 'Between thought groups' },
  { k: 'stop', label: 'Long pause', show: '||', hint: 'At the end of an idea' },
];
const CHANGES = ['ʔ', 'ɾ', 'm', 'ŋ', 'p', 'k', 'ʃ', 'ʒ', 'tʃ', 'dʒ'];

// ------------------------------------------------------------------ marks and the linking node

export const SentenceStress = Mark.create({
  name: 'sstress',
  inclusive: false,
  excludes: 'sstress',
  addAttributes: () => ({
    l: { default: 'strong', parseHTML: (el) => el.getAttribute('data-l') || 'strong', renderHTML: (a) => ({ 'data-l': a.l }) },
    s: { default: 'dot', parseHTML: (el) => el.getAttribute('data-s') || 'dot', renderHTML: (a) => ({ 'data-s': a.s }) },
  }),
  parseHTML: () => [{ tag: 'span.pr-ss' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { class: 'pr-ss' }), 0],
});

export const Intonation = Mark.create({
  name: 'inton',
  inclusive: false,
  excludes: 'inton',
  addAttributes: () => ({
    t: { default: 'fall', parseHTML: (el) => el.getAttribute('data-t') || 'fall', renderHTML: (a) => ({ 'data-t': a.t }) },
    s: { default: 'arrow', parseHTML: (el) => el.getAttribute('data-s') || 'arrow', renderHTML: (a) => ({ 'data-s': a.s }) },
  }),
  parseHTML: () => [{ tag: 'span.pr-it' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { class: 'pr-it' }), 0],
});

export const SpeechSound = Mark.create({
  name: 'speechSound',
  inclusive: false,
  excludes: 'speechSound',
  addAttributes: () => ({
    k: { default: 'drop', parseHTML: (el) => el.getAttribute('data-k') || 'drop', renderHTML: (a) => ({ 'data-k': a.k }) },
    s: { default: 'cross', parseHTML: (el) => el.getAttribute('data-s') || 'cross', renderHTML: (a) => ({ 'data-s': a.s }) },
    to: { default: '', parseHTML: (el) => el.getAttribute('data-to') || '', renderHTML: (a) => (a.to ? { 'data-to': a.to } : {}) },
  }),
  parseHTML: () => [{ tag: 'span.pr-sd' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { class: 'pr-sd' }), 0],
});

const ARC = 'M1 2.5C4 9 16 9 19 2.5';
const ARC_OVER = 'M1 7.5C4 1 16 1 19 7.5';
const linkSound = (k: string) => (k === 'j' || k === 'w' || k === 'r' ? `/${k}/` : '');

export function LinkMark({ k, s }: { k: string; s: string }) {
  const snd = linkSound(k);
  const label = LINKS.find((l) => l.k === k)?.label ?? 'Linking';
  if (k === 'pause' || k === 'stop') return <span className="pr-pl" data-k={k} role="img" aria-label={label} />;
  return (
    <span className="pr-pl" data-k={k} data-s={s} role="img" aria-label={label}>
      <span className="pr-pl-arc">
        <svg viewBox="0 0 20 10" preserveAspectRatio="none" aria-hidden="true">
          <path d={s === 'over' ? ARC_OVER : ARC} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </span>
      {snd && <span className="pr-pl-snd">{snd}</span>}
    </span>
  );
}

const svgNS = 'http://www.w3.org/2000/svg';
export const SpeechLink = Node.create({
  name: 'plink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    k: { default: 'link', parseHTML: (el) => el.getAttribute('data-k') || 'link', renderHTML: (a) => ({ 'data-k': a.k }) },
    s: { default: 'under', parseHTML: (el) => el.getAttribute('data-s') || 'under', renderHTML: (a) => ({ 'data-s': a.s }) },
  }),
  parseHTML: () => [{ tag: 'span.pr-pl' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { class: 'pr-pl' })],
  // A plain DOM view: an arc and the sound, the same as learners see.
  addNodeView:
    () =>
    ({ node }) => {
      const dom = document.createElement('span');
      const draw = (k: string, s: string) => {
        dom.className = 'pr-pl';
        dom.setAttribute('data-k', k);
        dom.setAttribute('data-s', s);
        dom.title = LINKS.find((l) => l.k === k)?.label ?? '';
        dom.textContent = '';
        if (k === 'pause' || k === 'stop') return;
        const arc = document.createElement('span');
        arc.className = 'pr-pl-arc';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 20 10');
        svg.setAttribute('preserveAspectRatio', 'none');
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('d', s === 'over' ? ARC_OVER : ARC);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', 'currentColor');
        p.setAttribute('stroke-width', '1.7');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(p);
        arc.appendChild(svg);
        dom.appendChild(arc);
        const snd = linkSound(k);
        if (snd) {
          const t = document.createElement('span');
          t.className = 'pr-pl-snd';
          t.textContent = snd;
          dom.appendChild(t);
        }
      };
      draw(node.attrs.k, node.attrs.s);
      return {
        dom,
        update: (n) => {
          if (n.type.name !== 'plink') return false;
          draw(n.attrs.k, n.attrs.s);
          return true;
        },
      };
    },
});

// What a mark looks like outside the editor: the same class and data attributes.
export function prosodyAttrs(type: string, a: Record<string, unknown> = {}): Record<string, string> | null {
  if (type === 'sstress') return { className: 'pr-ss', 'data-l': String(a.l ?? 'strong'), 'data-s': String(a.s ?? 'dot') };
  if (type === 'inton') return { className: 'pr-it', 'data-t': String(a.t ?? 'fall'), 'data-s': String(a.s ?? 'arrow') };
  if (type === 'speechSound') return { className: 'pr-sd', 'data-k': String(a.k ?? 'drop'), 'data-s': String(a.s ?? 'cross'), ...(a.to ? { 'data-to': String(a.to) } : {}) };
  return null;
}

// ------------------------------------------------------------------ the toolbar tool

type Looks = { stress: StressLook; tone: ToneLook; drop: DropLook; arc: ArcLook };
const DEFAULT_LOOKS: Looks = { stress: 'dot', tone: 'arrow', drop: 'cross', arc: 'under' };
const savedLooks = (): Looks => {
  try {
    return { ...DEFAULT_LOOKS, ...JSON.parse(localStorage.getItem('ll.proLooks') || '{}') };
  } catch {
    return DEFAULT_LOOKS;
  }
};
const saveLooks = (l: Looks) => {
  try {
    localStorage.setItem('ll.proLooks', JSON.stringify(l));
  } catch {
    /* fine */
  }
};

// The looks already used in this task win, so a task stays consistent.
function looksIn(editor: Editor): Looks {
  const l = savedLooks();
  editor.state.doc.descendants((n) => {
    for (const m of n.marks) {
      if (m.type.name === 'sstress') l.stress = m.attrs.s;
      if (m.type.name === 'inton') l.tone = m.attrs.s;
      if (m.type.name === 'speechSound' && m.attrs.k === 'drop') l.drop = m.attrs.s;
    }
    if (n.type.name === 'plink' && !['pause', 'stop'].includes(n.attrs.k)) l.arc = n.attrs.s;
  });
  return l;
}

// Change the look of every mark of one kind in the task.
function restyle(editor: Editor, kind: keyof Looks, look: string) {
  const { state } = editor;
  const tr = state.tr;
  state.doc.descendants((n, pos) => {
    if (n.isText) {
      for (const m of n.marks) {
        const hit = (kind === 'stress' && m.type.name === 'sstress') || (kind === 'tone' && m.type.name === 'inton') || (kind === 'drop' && m.type.name === 'speechSound' && m.attrs.k === 'drop');
        if (hit && m.attrs.s !== look) tr.addMark(pos, pos + n.nodeSize, m.type.create({ ...m.attrs, s: look }));
      }
    }
    if (kind === 'arc' && n.type.name === 'plink' && n.attrs.s !== look && !['pause', 'stop'].includes(n.attrs.k)) tr.setNodeMarkup(pos, undefined, { ...n.attrs, s: look });
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

const ToneIcon = ({ d }: { d: string }) => (
  <svg width="22" height="16" viewBox="0 0 20 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export function ProsodyTool({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [looks, setLooks] = useState<Looks>(DEFAULT_LOOKS);
  const [to, setTo] = useState('');
  const [, tick] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const popStyle = usePopPos(ref, open, 340);
  useEffect(() => {
    if (!open) return;
    setLooks(looksIn(editor));
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    const sel = () => tick((x) => x + 1);
    document.addEventListener('mousedown', close);
    editor.on('selectionUpdate', sel);
    return () => {
      document.removeEventListener('mousedown', close);
      editor.off('selectionUpdate', sel);
    };
  }, [open, editor]);

  const empty = editor.state.selection.empty;
  const setLook = <K extends keyof Looks>(k: K, v: Looks[K]) => {
    const next = { ...looks, [k]: v };
    setLooks(next);
    saveLooks(next);
    restyle(editor, k, v);
  };
  const mark = (name: string, attrs: Record<string, unknown>) => editor.chain().focus().setMark(name, attrs).run();
  const clear = (name: string) => editor.chain().focus().unsetMark(name).run();
  const cur = (name: string) => (editor.isActive(name) ? editor.getAttributes(name) : null);
  const ss = cur('sstress');
  const it = cur('inton');
  const sd = cur('speechSound');

  // A link replaces the space next to the cursor, so the arc joins the two words.
  const link = (k: LinkKind) => {
    const { state } = editor;
    const { from, to: end } = state.selection;
    const node = { type: 'plink', attrs: { k, s: looks.arc } };
    const after = state.doc.textBetween(end, Math.min(end + 1, state.doc.content.size), '', '');
    const before = state.doc.textBetween(Math.max(0, from - 1), from, '', '');
    const pause = k === 'pause' || k === 'stop';
    if (pause) return editor.chain().focus().insertContentAt({ from, to: end }, [node]).run();
    if (from === end && after === ' ') return editor.chain().focus().insertContentAt({ from, to: from + 1 }, [node]).run();
    if (from === end && before === ' ') return editor.chain().focus().insertContentAt({ from: from - 1, to: from }, [node]).run();
    if (from !== end && state.doc.textBetween(from, end) === ' ') return editor.chain().focus().insertContentAt({ from, to: end }, [node]).run();
    return editor.chain().focus().insertContentAt({ from, to: end }, [node]).run();
  };

  const seg = <K extends keyof Looks>(k: K, opts: { k: Looks[K]; label: string }[], label: string) => (
    <span className="pro-look">
      <span className="pro-look-k">{label}</span>
      <span className="seg small-seg" role="radiogroup" aria-label={label}>
        {opts.map((o) => (
          <button key={o.k} type="button" role="radio" aria-checked={looks[k] === o.k} className={looks[k] === o.k ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => setLook(k, o.k)}>
            {o.label}
          </button>
        ))}
      </span>
    </span>
  );
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <span className="hl-tool pro-tool" ref={ref}>
      <button type="button" className={'tool' + (open || ss || it || sd ? ' on' : '')} data-tip="Pronunciation: stress, intonation, linking and sounds" aria-label="Pronunciation" aria-expanded={open} onMouseDown={keep} onClick={() => setOpen((o) => !o)}>
        <span className="ti-row">
          {/* A head speaking: pronunciation */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.5 21v-3.6a6.6 6.6 0 1 1 10-8.4l1.4 3a.6.6 0 0 1-.55.85H14v2.3a1.6 1.6 0 0 1-1.6 1.6H10.5V21" />
            <path d="M18.2 7.6a3.6 3.6 0 0 1 0 4.8" />
            <path d="M20.6 5.4a6.8 6.8 0 0 1 0 9.2" />
          </svg>
        </span>
      </button>
      {open && (
        <span className="hl-pop pro-pop" style={popStyle} role="dialog" aria-label="Pronunciation">
          <span className="pro-sec">
            <span className="pro-h">Add</span>
            <span className="pro-row pro-adds">
              <button type="button" className="pro-b" onMouseDown={keep} onClick={() => (setOpen(false), addIpa(editor))}>
                <span className="pro-ic ipa">/ə/</span> IPA
              </button>
              <button type="button" className="pro-b" onMouseDown={keep} onClick={() => (setOpen(false), addStress(editor))}>
                <span className="pro-ic">Oo</span> Word stress
              </button>
              <button type="button" className="pro-b" onMouseDown={keep} onClick={() => (setOpen(false), editor.chain().focus().insertContent(newPhonCard('sound')).run())}>
                <span className="pro-ic">æ</span> Sound card
              </button>
              <button type="button" className="pro-b" onMouseDown={keep} onClick={() => (setOpen(false), editor.chain().focus().insertContent(newPhonCard('how')).run())}>
                <span className="pro-ic">◐</span> How it is made
              </button>
              <button type="button" className="pro-b" onMouseDown={keep} onClick={() => (setOpen(false), editor.chain().focus().insertContent(newPhonChart()).run())}>
                <span className="pro-ic">▦</span> Phonemic chart
              </button>
            </span>
          </span>
          <span className="pro-sec">
            <span className="pro-h">
              Sentence stress <span className="hint">{empty ? 'Select a word or syllable' : ''}</span>
            </span>
            <span className="pro-row">
              {([
                ['main', 'Main stress'],
                ['strong', 'Stressed'],
                ['weak', 'Weak'],
              ] as const).map(([l, label]) => (
                <button key={l} type="button" className={'pro-b' + (ss?.l === l ? ' on' : '')} disabled={empty} onMouseDown={keep} onClick={() => mark('sstress', { l, s: looks.stress })}>
                  <span className={'pro-dot d-' + l} />
                  {label}
                </button>
              ))}
              {ss && (
                <button type="button" className="pro-x" onMouseDown={keep} onClick={() => clear('sstress')} aria-label="Remove the stress mark">
                  ×
                </button>
              )}
            </span>
            {seg('stress', STRESS_LOOKS, 'Shown as')}
          </span>

          <span className="pro-sec">
            <span className="pro-h">Intonation</span>
            <span className="pro-row">
              {TONES.map((t) => (
                <button key={t.k} type="button" className={'pro-b icon' + (it?.t === t.k ? ' on' : '')} disabled={empty} title={t.label} aria-label={t.label} onMouseDown={keep} onClick={() => mark('inton', { t: t.k, s: looks.tone })}>
                  <ToneIcon d={t.d} />
                </button>
              ))}
              {it && (
                <button type="button" className="pro-x" onMouseDown={keep} onClick={() => clear('inton')} aria-label="Remove the intonation">
                  ×
                </button>
              )}
            </span>
            {seg('tone', [{ k: 'arrow', label: 'Arrow at the end' }, { k: 'line', label: 'Line over the words' }], 'Shown as')}
          </span>

          <span className="pro-sec">
            <span className="pro-h">
              Linking and pauses <span className="hint">At the space between two words</span>
            </span>
            <span className="pro-row">
              {LINKS.map((l) => (
                <button key={l.k} type="button" className="pro-b" title={`${l.label}: ${l.hint}`} onMouseDown={keep} onClick={() => link(l.k)}>
                  <b className="pro-glyph">{l.k === 'link' ? '‿' : l.k === 'pause' || l.k === 'stop' ? l.show : `‿${l.show}`}</b>
                  {l.label.replace('Linking ', '')}
                </button>
              ))}
            </span>
            {seg('arc', [{ k: 'under', label: 'Arc below' }, { k: 'over', label: 'Arc above' }], 'Linking arc')}
          </span>

          <span className="pro-sec">
            <span className="pro-h">
              Sounds <span className="hint">{empty ? 'Select the letters' : ''}</span>
            </span>
            <span className="pro-row">
              <button type="button" className={'pro-b' + (sd?.k === 'drop' ? ' on' : '')} disabled={empty} title="Elision: a sound that isn’t said, as in nex(t) day" onMouseDown={keep} onClick={() => mark('speechSound', { k: 'drop', s: looks.drop })}>
                <s className="pro-glyph">t</s>Dropped
              </button>
              <button type="button" className={'pro-b' + (sd?.k === 'schwa' ? ' on' : '')} disabled={empty} title="A weak vowel, said /ə/" onMouseDown={keep} onClick={() => mark('speechSound', { k: 'schwa', s: 'top' })}>
                <b className="pro-glyph">ə</b>Weak vowel
              </button>
              {sd && (
                <button type="button" className="pro-x" onMouseDown={keep} onClick={() => clear('speechSound')} aria-label="Remove the sound mark">
                  ×
                </button>
              )}
            </span>
            <span className="pro-row pro-change">
              <span className="pro-look-k">Changes to</span>
              {CHANGES.map((c) => (
                <button key={c} type="button" className={'pro-ipa' + (sd?.k === 'change' && sd?.to === c ? ' on' : '')} disabled={empty} title={c === 'ʔ' ? 'Glottal stop' : c === 'ɾ' ? 'Flap t (American)' : `Assimilation to /${c}/`} onMouseDown={keep} onClick={() => mark('speechSound', { k: 'change', s: 'top', to: c })}>
                  {c}
                </button>
              ))}
              <input className="pro-to" value={to} placeholder="other" maxLength={4} disabled={empty} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && to.trim() && (e.preventDefault(), mark('speechSound', { k: 'change', s: 'top', to: to.trim() }))} aria-label="Another sound" />
            </span>
            {seg('drop', [{ k: 'cross', label: 'Crossed out' }, { k: 'bracket', label: 'In brackets' }], 'Dropped sounds')}
          </span>
          <span className="pro-sec">
            <span className="pro-h">The sounds of English</span>
            <span className="pro-row">
              <button type="button" className="pro-b" onMouseDown={keep} onClick={() => (editor.chain().focus().insertContent(newPhonChart()).run(), setOpen(false))}>
                <b className="pro-glyph">iː</b>Chart
              </button>
              <button type="button" className="pro-b" onMouseDown={keep} onClick={() => (editor.chain().focus().insertContent(newPhonCard('sound')).run(), setOpen(false))}>
                <b className="pro-glyph">/ʃ/</b>Sound card
              </button>
              <button type="button" className="pro-b" onMouseDown={keep} onClick={() => (editor.chain().focus().insertContent(newPhonCard('how')).run(), setOpen(false))}>
                <b className="pro-glyph">◔</b>How it is made
              </button>
            </span>
          </span>
          <span className="hint">Each kind of mark looks the same everywhere in this task, so learners always read it the same way.</span>
        </span>
      )}
    </span>
  );
}

// IPA after the cursor, in the accent used last; word stress on the selected word.
function addIpa(editor: Editor) {
  let last: Accent | undefined;
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'ipa') last = n.attrs.accent;
  });
  editor.chain().focus().insertContent(newIpa(last ?? 'RP')).run();
}
function addStress(editor: Editor) {
  const { from, to, empty } = editor.state.selection;
  const word = empty ? '' : editor.state.doc.textBetween(from, to, ' ').trim();
  const base = newStress('box');
  editor.chain().focus().insertContent(word && !/\s/.test(word) ? { ...base, attrs: { ...base.attrs, syllables: [word] } } : base).run();
}
