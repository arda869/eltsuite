import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Grip } from './nodes';

// A web link shown as a card: YouTube videos with their picture, audio files with a player,
// anything else as a page card. Opens in a new tab.

export const youtubeId = (u: string) => /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(u)?.[1];
const isAudio = (u: string) => /\.(mp3|m4a|wav|ogg|aac)(\?|$)/i.test(u) || /soundcloud\.com/.test(u);
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
export const safeUrl = (u: string) => (/^https:\/\//i.test(u.trim()) ? u.trim() : '');

export function LinkCardView({ url, title, note }: { url: string; title: string; note?: string }) {
  const u = safeUrl(url);
  if (!u) return <div className="lc lc-empty">Add an https link</div>;
  const yt = youtubeId(u);
  if (isAudio(u) && !/soundcloud/.test(u))
    return (
      <div className="lc lc-audio">
        <span className="lc-kind">Audio</span>
        <span className="lc-title">{title || host(u)}</span>
        <audio controls preload="none" src={u} />
        {note && <span className="lc-note">{note}</span>}
      </div>
    );
  return (
    <a className={'lc' + (yt ? ' lc-video' : '')} href={u} target="_blank" rel="noopener noreferrer">
      {yt && (
        <span className="lc-thumb">
          <img src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" />
          <span className="lc-play" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
            </svg>
          </span>
        </span>
      )}
      <span className="lc-text">
        <span className="lc-kind">{yt ? 'Video' : 'Web page'}</span>
        <span className="lc-title">{title || host(u)}</span>
        {note && <span className="lc-note">{note}</span>}
        <span className="lc-host">{host(u)} ↗</span>
      </span>
    </a>
  );
}

function EditView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper className={'block-node lc-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">Link card</span>
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      <div className="lc-fields">
        <input value={node.attrs.url} aria-label="Web address" type="url" inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="https://… (YouTube, an audio file or any web page)" onChange={(e) => updateAttributes({ url: e.target.value })} />
        <input value={node.attrs.title} aria-label="Title (optional)" placeholder="Title (optional)" onChange={(e) => updateAttributes({ title: e.target.value })} />
        <input value={node.attrs.note} aria-label="A note for learners (optional)" placeholder="A note for learners, e.g. Watch from 1:20 (optional)" onChange={(e) => updateAttributes({ note: e.target.value })} />
        {node.attrs.url && !safeUrl(node.attrs.url) && <span className="error">The link must start with https://</span>}
      </div>
      <LinkCardView url={node.attrs.url} title={node.attrs.title} note={node.attrs.note} />
    </NodeViewWrapper>
  );
}

export const LinkCard = Node.create({
  name: 'linkCard',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ url: { default: '' }, title: { default: '' }, note: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-link-card]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-link-card': '' })],
  addNodeView: () => ReactNodeViewRenderer(EditView),
});
