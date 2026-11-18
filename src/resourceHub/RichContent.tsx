import type { ReactNode } from 'react';
import type { JSONContent } from '@tiptap/react';

const safeLink = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value, window.location.origin); return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
};

function renderNode(node: JSONContent, key: string): ReactNode {
  if (node.type === 'text') {
    let inner: ReactNode = node.text ?? '';
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') inner = <strong>{inner}</strong>;
      else if (mark.type === 'italic') inner = <em>{inner}</em>;
      else if (mark.type === 'underline') inner = <u>{inner}</u>;
      else if (mark.type === 'strike') inner = <s>{inner}</s>;
      else if (mark.type === 'link') { const href = safeLink(mark.attrs?.href); if (href) inner = <a href={href} target="_blank" rel="noreferrer">{inner}</a>; }
    }
    return <span key={key}>{inner}</span>;
  }
  const children = node.content?.map((child, index) => renderNode(child, `${key}-${index}`));
  switch (node.type) {
    case 'doc': return <div key={key}>{children}</div>;
    case 'paragraph': return <p key={key}>{children}</p>;
    case 'heading': { const level = Math.max(2, Math.min(5, Number(node.attrs?.level) || 3)); return level === 2 ? <h2 key={key}>{children}</h2> : level === 3 ? <h3 key={key}>{children}</h3> : level === 4 ? <h4 key={key}>{children}</h4> : <h5 key={key}>{children}</h5>; }
    case 'bulletList': return <ul key={key}>{children}</ul>;
    case 'orderedList': return <ol key={key} start={Number(node.attrs?.start) || 1}>{children}</ol>;
    case 'listItem': return <li key={key}>{children}</li>;
    case 'blockquote': return <blockquote key={key}>{children}</blockquote>;
    case 'hardBreak': return <br key={key} />;
    case 'horizontalRule': return <hr key={key} />;
    case 'table': return <table key={key}><tbody>{children}</tbody></table>;
    case 'tableRow': return <tr key={key}>{children}</tr>;
    case 'tableHeader': return <th key={key} colSpan={Number(node.attrs?.colspan) || 1} rowSpan={Number(node.attrs?.rowspan) || 1}>{children}</th>;
    case 'tableCell': return <td key={key} colSpan={Number(node.attrs?.colspan) || 1} rowSpan={Number(node.attrs?.rowspan) || 1}>{children}</td>;
    default: return <span key={key}>{children}</span>;
  }
}

/** Safe read-only rendering for manually published Resource Hub sections. */
export function RichContent({ content }: { content: JSONContent }) { return <div className="rh-rich-content">{renderNode(content, 'root')}</div>; }
