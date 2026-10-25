import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps, type Editor } from '@tiptap/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// Our own "emoji": simple line drawings in the app's style (thin strokes, rounded ends),
// drawn in the text colour or the class colour.

const face = (mouth: ReactNode, eyes: ReactNode = <><circle cx="9" cy="10" r="0.9" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="0.9" fill="currentColor" stroke="none" /></>) => (
  <>
    <circle cx="12" cy="12" r="9" />
    {eyes}
    {mouth}
  </>
);

export const ICONS: { key: string; label: string; group: string; d: ReactNode }[] = [
  // Feelings
  { key: 'smile', label: 'Smile', group: 'Feelings', d: face(<path d="M8 14c1 1.5 2.4 2.3 4 2.3s3-.8 4-2.3" />) },
  { key: 'grin', label: 'Big smile', group: 'Feelings', d: face(<path d="M7.5 13h9a4.5 4.5 0 0 1-9 0z" />) },
  { key: 'wink', label: 'Wink', group: 'Feelings', d: face(<path d="M8 14c1 1.5 2.4 2.3 4 2.3s3-.8 4-2.3" />, <><circle cx="9" cy="10" r="0.9" fill="currentColor" stroke="none" /><path d="M13.8 10.2h2.6" /></>) },
  { key: 'love', label: 'Love it', group: 'Feelings', d: face(<path d="M8 14c1 1.5 2.4 2.3 4 2.3s3-.8 4-2.3" />, <><path d="M7.6 9.4c.3-.8 1.6-.8 1.4.4l-.7.9-.7-.9c-.2-.2-.1-.3 0-.4zM14.6 9.4c.3-.8 1.6-.8 1.4.4l-.7.9-.7-.9c-.2-.2-.1-.3 0-.4z" fill="currentColor" /></>) },
  { key: 'neutral', label: 'Not sure', group: 'Feelings', d: face(<path d="M8.5 15h7" />) },
  { key: 'think', label: 'Thinking', group: 'Feelings', d: face(<path d="M9 15.5c1.5-.8 3.5-.8 6 .3" />, <><circle cx="9" cy="10" r="0.9" fill="currentColor" stroke="none" /><path d="M14 9l2 .6" /></>) },
  { key: 'wow', label: 'Surprised', group: 'Feelings', d: face(<circle cx="12" cy="15.3" r="1.7" />) },
  { key: 'sad', label: 'Sad', group: 'Feelings', d: face(<path d="M8 16.5c1-1.4 2.4-2 4-2s3 .6 4 2" />) },
  { key: 'laugh', label: 'Laughing', group: 'Feelings', d: face(<path d="M7.5 13h9a4.5 4.5 0 0 1-9 0z" />, <><path d="M7.8 10.3l1.4-1 1.4 1M13.4 10.3l1.4-1 1.4 1" /></>) },
  { key: 'cool', label: 'Cool', group: 'Feelings', d: face(<path d="M9 15c1 .8 2 1.1 3 1.1s2-.3 3-1.1" />, <path d="M6.5 9.2h11M7.5 9.2l.6 2.2h2.6l.6-2.2M12.7 9.2l.6 2.2h2.6l.6-2.2" />) },
  // Signs
  { key: 'thumbsup', label: 'Thumbs up', group: 'Signs', d: <><path d="M7 11v9H4.5v-9z" /><path d="M7 11l3.5-6.5c1.3 0 2 .9 1.8 2.2L11.8 10H18a2 2 0 0 1 2 2.3l-1 5.5a2.6 2.6 0 0 1-2.6 2.2H7" /></> },
  { key: 'thumbsdown', label: 'Thumbs down', group: 'Signs', d: <g transform="rotate(180 12 12)"><path d="M7 11v9H4.5v-9z" /><path d="M7 11l3.5-6.5c1.3 0 2 .9 1.8 2.2L11.8 10H18a2 2 0 0 1 2 2.3l-1 5.5a2.6 2.6 0 0 1-2.6 2.2H7" /></g> },
  { key: 'clap', label: 'Well done', group: 'Signs', d: <><path d="M8.5 20l-3-5.2a1.4 1.4 0 0 1 2.4-1.4l1.4 2.3M7.5 12.2L5.7 9a1.4 1.4 0 0 1 2.4-1.4l3 5.2M10.2 10.6L8.6 8a1.4 1.4 0 0 1 2.4-1.4l3.6 6.2c1.8 3.1.8 6-1.7 7.3-1.6.8-3.4.6-4.4-.1" /><path d="M15 3.5l.4 1.6M18.3 5l-1 1.3M19.8 8.4l-1.6.3" /></> },
  { key: 'wave', label: 'Hello', group: 'Signs', d: <><path d="M7.5 12.5V7.8a1.3 1.3 0 0 1 2.6 0v3.7M10.1 11V5.6a1.3 1.3 0 0 1 2.6 0V11M12.7 11V6.6a1.3 1.3 0 0 1 2.6 0v5.2M15.3 11.5v-2a1.3 1.3 0 0 1 2.6 0V14a6 6 0 0 1-6 6h-.7a5 5 0 0 1-4.1-2.2L4.6 14a1.4 1.4 0 0 1 2.2-1.6l.7.9" /></> },
  { key: 'check', label: 'Tick', group: 'Signs', d: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  { key: 'cross', label: 'Cross', group: 'Signs', d: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /> },
  { key: 'question', label: 'Question', group: 'Signs', d: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7" /><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" /></> },
  { key: 'exclaim', label: 'Important', group: 'Signs', d: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" /></> },
  { key: 'star', label: 'Star', group: 'Signs', d: <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8L3.6 9.6l5.8-.8z" strokeLinejoin="round" /> },
  { key: 'heart', label: 'Heart', group: 'Signs', d: <path d="M12 20s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" strokeLinejoin="round" /> },
  { key: 'fire', label: 'On fire', group: 'Signs', d: <path d="M12 21a6 6 0 0 1-6-6c0-3.5 2.6-5.3 3.5-8.5 2.4 1.4 3 3.5 2.7 5.2 1.1-.4 1.9-1.4 2.1-2.9 2 1.6 3.7 3.8 3.7 6.2a6 6 0 0 1-6 6z" strokeLinejoin="round" /> },
  { key: 'trophy', label: 'Trophy', group: 'Signs', d: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 3.5M16 6h3a3 3 0 0 1-3 3.5M12 13v3.5M8.5 20h7M9.5 20l.5-3.5h4l.5 3.5" /></> },
  { key: 'idea', label: 'Idea', group: 'Signs', d: <><path d="M9 17.5h6M10 20.5h4" /><path d="M8.5 14.5a5.5 5.5 0 1 1 7 0c-.8.7-1 1.4-1 3h-5c0-1.6-.2-2.3-1-3z" /></> },
  // Class
  { key: 'book', label: 'Read', group: 'Class', d: <><path d="M12 6.5C10 5 7.5 4.5 4 4.8v13c3.5-.3 6 .2 8 1.7 2-1.5 4.5-2 8-1.7v-13c-3.5-.3-6 .2-8 1.7z" strokeLinejoin="round" /><path d="M12 6.5v13" /></> },
  { key: 'pen', label: 'Write', group: 'Class', d: <><path d="M15.5 4.5l4 4L9 19l-4.8.8L5 15z" strokeLinejoin="round" /><path d="M13.5 6.5l4 4" /></> },
  { key: 'speak', label: 'Speak', group: 'Class', d: <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7L7.5 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z" strokeLinejoin="round" /> },
  { key: 'listen', label: 'Listen', group: 'Class', d: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3.5" y="13.5" width="4" height="6" rx="1.5" /><rect x="16.5" y="13.5" width="4" height="6" rx="1.5" /></> },
  { key: 'pair', label: 'Work in pairs', group: 'Class', d: <><circle cx="8.5" cy="8" r="2.8" /><circle cx="16" cy="9" r="2.4" /><path d="M3.5 19a5 5 0 0 1 10 0M13.8 15a4 4 0 0 1 6.7 3.5" /></> },
  { key: 'group', label: 'Group work', group: 'Class', d: <><circle cx="12" cy="7.5" r="2.6" /><circle cx="5.8" cy="10" r="2" /><circle cx="18.2" cy="10" r="2" /><path d="M7.5 19a4.5 4.5 0 0 1 9 0M2.5 18a3.4 3.4 0 0 1 4.7-3.1M21.5 18a3.4 3.4 0 0 0-4.7-3.1" /></> },
  { key: 'clock', label: 'Time', group: 'Class', d: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { key: 'search', label: 'Look up', group: 'Class', d: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></> },
  { key: 'target', label: 'Goal', group: 'Class', d: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /></> },
  { key: 'flag', label: 'Flag', group: 'Class', d: <path d="M5.5 21V3.5M5.5 4.5h12l-2.5 4 2.5 4h-12" strokeLinejoin="round" /> },
  // Things
  { key: 'home', label: 'Home', group: 'Things', d: <path d="M4 11l8-6.5 8 6.5M6 9.5V20h4.5v-5h3v5H18V9.5" strokeLinejoin="round" /> },
  { key: 'globe', label: 'World', group: 'Things', d: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z" /></> },
  { key: 'plane', label: 'Travel', group: 'Things', d: <path d="M21 4.5L3.5 11l6 2.5 2.5 6 9-15zM9.5 13.5L21 4.5" strokeLinejoin="round" /> },
  { key: 'food', label: 'Food', group: 'Things', d: <><path d="M4 12h16a8 8 0 0 1-16 0z" /><path d="M9 4c0 1.5 1 1.5 1 3M13 3.5c0 1.5 1 1.5 1 3" /></> },
  { key: 'coffee', label: 'Coffee', group: 'Things', d: <><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" /><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M9 3.5c0 1.2 1 1.2 1 2.5M12.5 3.5c0 1.2 1 1.2 1 2.5" /></> },
  { key: 'music', label: 'Music', group: 'Things', d: <><path d="M9 18V5.5l11-2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></> },
  { key: 'camera', label: 'Photo', group: 'Things', d: <><path d="M4 8h3.5L9 5.5h6L16.5 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.4" /></> },
  { key: 'gift', label: 'Gift', group: 'Things', d: <><rect x="4" y="9" width="16" height="11" rx="1" /><path d="M3 9h18M12 9v11M12 9C10.5 6 7 5.5 7.5 7.5 8 9 12 9 12 9zM12 9c1.5-3 5-3.5 4.5-1.5C16 9 12 9 12 9z" /></> },
  { key: 'sun', label: 'Sunny', group: 'Things', d: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></> },
  { key: 'rain', label: 'Rainy', group: 'Things', d: <><path d="M7 15a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.5A3.3 3.3 0 0 1 17 15z" strokeLinejoin="round" /><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5" /></> },
  { key: 'money', label: 'Money', group: 'Things', d: <><rect x="3" y="6.5" width="18" height="11" rx="1.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v.01M18 14.5v.01" strokeWidth="2.2" /></> },
  { key: 'phone', label: 'Phone', group: 'Things', d: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.2" /><path d="M10.5 18.5h3" /></> },
];
export const iconByKey = (k: string) => ICONS.find((i) => i.key === k);

export function Icon({ name, tone = 'ink', size = '1.15em' }: { name: string; tone?: string; size?: string }) {
  const ic = iconByKey(name);
  if (!ic) return null;
  return (
    <svg className={'emo tone-' + tone} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={ic.label}>
      <title>{ic.label}</title>
      {ic.d}
    </svg>
  );
}

export const ICON_TONES = [
  { key: 'ink', label: 'Text colour' },
  { key: 'accent', label: 'Class colour' },
  { key: 'soft', label: 'Grey' },
];

function IconView({ node, updateAttributes, selected }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <NodeViewWrapper as="span" className={'emo-node' + (selected ? ' is-selected' : '')} ref={ref}>
      <span contentEditable={false} onClick={() => setOpen(true)} className="emo-chip">
        <Icon name={node.attrs.name} tone={node.attrs.tone} />
      </span>
      {open && (
        <span className="gap-pop emo-pop" contentEditable={false}>
          <IconGrid tone={node.attrs.tone} current={node.attrs.name} onPick={(name) => updateAttributes({ name })} onTone={(tone) => updateAttributes({ tone })} />
        </span>
      )}
    </NodeViewWrapper>
  );
}

export function IconGrid({ current, tone = 'ink', onPick, onTone }: { current?: string; tone?: string; onPick: (k: string) => void; onTone?: (t: string) => void }) {
  const groups = [...new Set(ICONS.map((i) => i.group))];
  return (
    <span className="emo-grid">
      {groups.map((g) => (
        <span key={g} className="emo-group">
          <span className="ipa-cap">{g}</span>
          <span className="emo-row">
            {ICONS.filter((i) => i.group === g).map((i) => (
              <button key={i.key} type="button" title={i.label} className={'emo-btn' + (current === i.key ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(i.key)}>
                <Icon name={i.key} tone={tone} size="22" />
              </button>
            ))}
          </span>
        </span>
      ))}
      {onTone && (
        <span className="seg small-seg" role="radiogroup" aria-label="Colour">
          {ICON_TONES.map((t) => (
            <button key={t.key} type="button" role="radio" aria-checked={tone === t.key} className={tone === t.key ? 'on' : ''} onClick={() => onTone(t.key)}>
              {t.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

// Toolbar button that opens the picker and inserts at the cursor.
export function IconTool({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState('ink');
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span className="hl-tool" ref={ref}>
      <button type="button" className="tool" title="Add an emoji" aria-label="Add an emoji" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}>
        <Icon name="smile" size="16" />
      </button>
      {open && (
        <span className="hl-pop emo-pop">
          <IconGrid
            tone={tone}
            onTone={setTone}
            onPick={(name) => {
              editor.chain().focus().insertContent({ type: 'icon', attrs: { name, tone } }).run();
              setOpen(false);
            }}
          />
        </span>
      )}
    </span>
  );
}

export const IconNode = Node.create({
  name: 'icon',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ name: { default: 'smile' }, tone: { default: 'ink' } }),
  parseHTML: () => [{ tag: 'span[data-icon]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-icon': '' })],
  addNodeView: () => ReactNodeViewRenderer(IconView),
});
