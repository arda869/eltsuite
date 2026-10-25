import type { ReactNode } from 'react';
import type { JSONContent } from '@tiptap/react';
import { isCorrect, type AnswerKey, type Responses } from '../lib/tasks';

const LETTERS = 'abcdefghij';

type Props = {
  content: JSONContent | null;
  responses: Responses;
  onChange?: (id: string, value: string | number) => void;
  results?: AnswerKey | null; // when present, show right and wrong
  disabled?: boolean;
};

function marks(text: ReactNode, m: JSONContent['marks']) {
  let out = text;
  for (const mark of m ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
  }
  return out;
}

export function TaskRenderer({ content, responses, onChange, results, disabled }: Props) {
  let n = 0;
  const numbers: Record<string, number> = {};
  const walkNumbers = (node: JSONContent) => {
    if ((node.type === 'gap' || node.type === 'mcq') && node.attrs?.id) numbers[node.attrs.id] = ++n;
    node.content?.forEach(walkNumbers);
  };
  if (content) walkNumbers(content);

  const num = (id: string) => (
    <span className="q-num" aria-hidden="true">
      {numbers[id]}
    </span>
  );

  const gap = (node: JSONContent, key: string) => {
    const id = node.attrs!.id as string;
    const value = String(responses[id] ?? '');
    const entry = results?.[id];
    const right = results ? isCorrect(entry, value) : false;
    if (results) {
      return (
        <span key={key} className="gap-result">
          {num(id)}
          <span className={right ? 'ans right' : 'ans wrong'}>{value || '—'}</span>
          {right ? (
            <svg className="tick" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-label="correct">
              <path d="M5 12l5 5 9-10" />
            </svg>
          ) : (
            entry?.kind === 'gap' && entry.answers[0] && <span className="fix">{entry.answers[0]}</span>
          )}
        </span>
      );
    }
    return (
      <span key={key} className="gap-wrap">
        {num(id)}
        <input
          className="gap-input"
          aria-label={`Question ${numbers[id]}`}
          value={value}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          size={Math.max(6, value.length + 1)}
          onChange={(e) => onChange?.(id, e.target.value)}
        />
      </span>
    );
  };

  const mcq = (node: JSONContent, key: string) => {
    const id = node.attrs!.id as string;
    const options: string[] = node.attrs!.options ?? [];
    const chosen = responses[id];
    const entry = results?.[id];
    return (
      <fieldset key={key} className="mcq-q">
        <legend>
          {num(id)}
          {node.attrs!.prompt}
        </legend>
        <div className="opts">
          {options.map((o, i) => {
            if (!o.trim()) return null;
            const isChosen = Number(chosen) === i && chosen !== undefined && chosen !== '';
            let state = isChosen ? 'on' : '';
            if (results && entry?.kind === 'mcq') {
              if (i === entry.correct) state = 'right';
              else if (isChosen) state = 'wrong';
              else state = '';
            }
            return (
              <label key={i} className={'opt ' + state}>
                <input type="radio" name={id} checked={isChosen} disabled={disabled || !!results} onChange={() => onChange?.(id, i)} />
                <span className="letter" aria-hidden="true">
                  {LETTERS[i]}
                </span>
                <span>{o}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  };

  const render = (node: JSONContent, key: string): ReactNode => {
    const kids = () => node.content?.map((c, i) => render(c, key + '.' + i));
    switch (node.type) {
      case 'doc':
        return <>{kids()}</>;
      case 'paragraph':
        return <p key={key}>{kids()}</p>;
      case 'heading':
        return <h3 key={key}>{kids()}</h3>;
      case 'bulletList':
        return <ul key={key}>{kids()}</ul>;
      case 'orderedList':
        return <ol key={key}>{kids()}</ol>;
      case 'listItem':
        return <li key={key}>{kids()}</li>;
      case 'blockquote':
        return <blockquote key={key}>{kids()}</blockquote>;
      case 'hardBreak':
        return <br key={key} />;
      case 'horizontalRule':
        return <hr key={key} />;
      case 'image':
        return node.attrs?.src ? <img key={key} src={node.attrs.src} alt={node.attrs.alt ?? ''} className="task-img" /> : null;
      case 'text':
        return <span key={key}>{marks(node.text ?? '', node.marks)}</span>;
      case 'gap':
        return gap(node, key);
      case 'mcq':
        return mcq(node, key);
      default:
        return kids() ?? null;
    }
  };

  return <div className="task-body">{content ? render(content, 'r') : null}</div>;
}
