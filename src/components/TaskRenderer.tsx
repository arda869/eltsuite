import { useState, type ReactNode } from 'react';
import type { JSONContent } from '@tiptap/react';
import { RichAnswer } from './RichAnswer';
import { BoxFrame, type BoxAttrs } from '../editor/TextBox';
import { isAnswered, normalise, scoreQuestion, splitWords, textOf, type AnswerKey, type Response, type Responses } from '../lib/questions';

const LETTERS = 'abcdefghijklmnop';

type Props = {
  content: JSONContent | null;
  responses: Responses;
  onChange?: (id: string, value: Response) => void;
  results?: AnswerKey | null; // when present, show right and wrong
  hideAnswers?: boolean; // show only right or wrong, not the correct answer
  disabled?: boolean;
  layout?: 'single' | 'two' | 'two-wide';
  colScroll?: 'separate' | 'together';
};

const TICK = (
  <svg className="tick" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-label="correct">
    <path d="M5 12l5 5 9-10" />
  </svg>
);

function marks(text: ReactNode, m: JSONContent['marks']) {
  let out = text;
  for (const mark of m ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
  }
  return out;
}

const QTYPES = ['gap', 'mcq', 'choice', 'match', 'dropgap', 'order', 'writing'];

export function TaskRenderer({ content, responses, onChange, results, disabled, hideAnswers, layout = 'single', colScroll = 'separate' }: Props) {
  const [picked, setPicked] = useState<string | null>(null); // word picked from a word bank
  const locked = disabled || !!results;

  // Numbering: (1), (2)… in reading order; matching uses one number per row.
  let n = 0;
  const numbers: Record<string, number> = {};
  const listed = new Set<string>();
  const walk = (node: JSONContent, inOl: boolean) => {
    const ol = inOl || node.type === 'orderedList';
    if (node.attrs?.id && QTYPES.includes(node.type ?? '')) {
      numbers[node.attrs.id] = n + 1;
      n += node.type === 'match' ? Math.max(1, (node.attrs.left ?? []).length) : 1;
      if (ol) listed.add(node.attrs.id);
    }
    node.content?.forEach((c) => walk(c, ol));
  };
  if (content) walk(content, false);

  // Words already placed in drag-and-drop gaps.
  const placedWords: string[] = [];
  const collectDrops = (node: JSONContent) => {
    if (node.type === 'dropgap' && node.attrs?.id && isAnswered(responses[node.attrs.id])) placedWords.push(String(responses[node.attrs.id]));
    node.content?.forEach(collectDrops);
  };
  if (content) collectDrops(content);

  const num = (id: string, offset = 0) =>
    listed.has(id) && offset === 0 ? null : (
      <sup className="q-num" aria-hidden="true">
        {numbers[id] + offset}
      </sup>
    );

  const resultText = (key: string, id: string, shown: string, right: boolean, fix?: string) => (
    <span key={key} className="gap-result">
      {num(id)}
      <span className={right ? 'ans right' : 'ans wrong'}>{shown || '—'}</span>
      {right ? TICK : !hideAnswers && fix && <span className="fix">{fix}</span>}
    </span>
  );

  // Question renderers ----------------------------------------------------------------

  const gap = (node: JSONContent, key: string) => {
    const id = node.attrs!.id as string;
    const value = String(responses[id] ?? '');
    const entry = results?.[id];
    if (results) {
      const right = scoreQuestion(entry, value).got === 1;
      return resultText(key, id, value, right, entry?.kind === 'gap' ? entry.answers[0] : undefined);
    }
    return (
      <span key={key} className="gap-wrap">
        {num(id)}
        <input
          className="gap-input"
          placeholder=" "
          aria-label={`Question ${numbers[id]}`}
          value={value}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          size={Math.max(6, value.length + 1)}
          onChange={(e) => onChange?.(id, e.target.value)}
        />
      </span>
    );
  };

  const optionState = (i: number, chosen: number[], correct: number[]) => {
    if (!results) return chosen.includes(i) ? 'on' : '';
    if (correct.includes(i) && (!hideAnswers || chosen.includes(i))) return 'right';
    return chosen.includes(i) ? 'wrong' : '';
  };

  const choiceOptions = (id: string, options: string[], multi: boolean, display: string) => {
    const raw = responses[id];
    const chosen: number[] = Array.isArray(raw) ? raw : isAnswered(raw) ? [Number(raw)] : [];
    const entry = results?.[id];
    const correct = entry?.kind === 'multi' ? entry.correct : entry?.kind === 'mcq' ? [entry.correct] : [];
    const toggle = (i: number) => {
      if (multi) onChange?.(id, chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i].sort());
      else onChange?.(id, i);
    };
    return options.map((o, i) =>
      o.trim() ? (
        <label key={i} className={'opt ' + optionState(i, chosen, correct)}>
          <input type={multi ? 'checkbox' : 'radio'} name={id} checked={chosen.includes(i)} disabled={locked} onChange={() => toggle(i)} />
          {display === 'radio' ? (
            <span className={multi ? 'radio square' : 'radio'} aria-hidden="true" />
          ) : (
            <span className={multi ? 'letter square' : 'letter'} aria-hidden="true">
              {LETTERS[i]}
            </span>
          )}
          <span>{o}</span>
        </label>
      ) : null,
    );
  };

  const choice = (node: JSONContent, key: string) => {
    const a = node.attrs!;
    const id = a.id as string;
    const options: string[] = a.options ?? [];
    const display = (a.display ?? 'letters') as string;
    const multi = !!a.multi;
    if (display === 'dropdown') {
      // Options in the line, separated by slashes; the chosen one is circled.
      const raw = responses[id];
      const chosen: number[] = Array.isArray(raw) ? raw : isAnswered(raw) ? [Number(raw)] : [];
      const entry = results?.[id];
      const correct = entry?.kind === 'multi' ? entry.correct : entry?.kind === 'mcq' ? [entry.correct] : [];
      const shown = options.map((o, i) => ({ o, i })).filter((x) => x.o.trim());
      const pick = (i: number) => {
        if (multi) onChange?.(id, chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i].sort());
        else onChange?.(id, chosen.includes(i) ? '' : i);
      };
      return (
        <span key={key} className="slash-choice" role={multi ? 'group' : 'radiogroup'} aria-label={`Question ${numbers[id]}`}>
          {num(id)}
          {shown.map(({ o, i }, k) => {
            const state = optionState(i, chosen, correct);
            const isOk = results && state === 'right' && chosen.includes(i);
            return (
              <span key={i}>
                {k > 0 && <span className="slash-sep" aria-hidden="true">/</span>}
                <button
                  type="button"
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={chosen.includes(i)}
                  className={'slash-opt ' + state}
                  disabled={locked}
                  onClick={() => pick(i)}
                >
                  {o}
                </button>
                {isOk && TICK}
              </span>
            );
          })}
        </span>
      );
    }
    if (display === 'radio')
      return (
        <span key={key} className="stacked-choice" role={multi ? 'group' : 'radiogroup'} aria-label={`Question ${numbers[id]}`}>
          <span className="stack-num">{num(id)}</span>
          <span className="stack">{choiceOptions(id, options, multi, display)}</span>
        </span>
      );
    return (
      <span key={key} className={'inline-choice d-' + display} role={multi ? 'group' : 'radiogroup'} aria-label={`Question ${numbers[id]}`}>
        {num(id)}
        {choiceOptions(id, options, multi, display)}
      </span>
    );
  };

  const mcq = (node: JSONContent, key: string) => {
    const id = node.attrs!.id as string;
    return (
      <fieldset key={key} className="mcq-q">
        <legend>
          {num(id)}
          {node.attrs!.prompt}
        </legend>
        <div className="opts">{choiceOptions(id, node.attrs!.options ?? [], !!node.attrs!.multi, 'letters')}</div>
      </fieldset>
    );
  };

  const match = (node: JSONContent, key: string) => {
    const a = node.attrs!;
    const id = a.id as string;
    const left: string[] = a.left ?? [];
    const right: string[] = a.right ?? [];
    const raw = responses[id];
    const chosen: number[] = Array.isArray(raw) ? raw : [];
    const entry = results?.[id];
    const map = entry?.kind === 'match' ? entry.map : [];
    return (
      <div key={key} className="match-q">
        <ol className="match-left">
          {left.map((l, i) => {
            const c = chosen[i] ?? -1;
            const ok = results ? c === map[i] : false;
            return (
              <li key={i}>
                <sup className="q-num" aria-hidden="true">
                  {numbers[id] + i}
                </sup>
                <span className="match-l">{l}</span>
                {results ? (
                  <span className="gap-result">
                    <span className={ok ? 'ans right' : 'ans wrong'}>{c >= 0 ? LETTERS[c] : '—'}</span>
                    {ok ? TICK : !hideAnswers && map[i] >= 0 && <span className="fix">{LETTERS[map[i]]}</span>}
                  </span>
                ) : (
                  <select
                    className="drop-input letter-select"
                    aria-label={`Match for ${l}`}
                    value={c >= 0 ? String(c) : ''}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = [...chosen];
                      while (next.length < left.length) next.push(-1);
                      next[i] = e.target.value === '' ? -1 : Number(e.target.value);
                      onChange?.(id, next);
                    }}
                  >
                    <option value="">–</option>
                    {right.map((_, k) => (
                      <option key={k} value={k}>
                        {LETTERS[k]}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            );
          })}
        </ol>
        {notesFor(node)}
        <ul className="match-right">
          {right.map((r, k) => (
            <li key={k} className={chosen.includes(k) && !results ? 'used' : ''}>
              <span className="letter" aria-hidden="true">
                {LETTERS[k]}
              </span>
              {r}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const dropgap = (node: JSONContent, key: string) => {
    const id = node.attrs!.id as string;
    const value = isAnswered(responses[id]) ? String(responses[id]) : '';
    const entry = results?.[id];
    if (results) return resultText(key, id, value, scoreQuestion(entry, value).got === 1, entry?.kind === 'drop' ? entry.answer : undefined);
    return (
      <span key={key} className="gap-wrap">
        {num(id)}
        <button
          type="button"
          className={'drop-slot' + (value ? ' filled' : '') + (picked ? ' ready' : '')}
          disabled={disabled}
          aria-label={value ? `Question ${numbers[id]}: ${value}. Tap to remove` : `Question ${numbers[id]}: empty. Pick a word, then tap here`}
          onClick={() => {
            if (picked) {
              onChange?.(id, picked);
              setPicked(null);
            } else if (value) onChange?.(id, '');
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const w = e.dataTransfer.getData('text/plain');
            if (w) onChange?.(id, w);
            setPicked(null);
          }}
        >
          {value || ' '}
        </button>
      </span>
    );
  };

  const wordbank = (node: JSONContent, key: string) => {
    const words: string[] = node.attrs?.words ?? [];
    const remaining = [...placedWords];
    return (
      <div key={key} className="word-bank" aria-label="Word bank">
        {words.map((w, i) => {
          const usedAt = remaining.findIndex((p) => normalise(p) === normalise(w));
          const used = usedAt >= 0;
          if (used) remaining.splice(usedAt, 1);
          return (
            <button
              type="button"
              key={i}
              className={'bank-word' + (used ? ' used' : '') + (picked === w ? ' picked' : '')}
              disabled={locked || used}
              draggable={!locked && !used}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', w);
                e.dataTransfer.effectAllowed = 'move';
                // A clean pill as the drag image, without a white box around it.
                const ghost = document.createElement('span');
                ghost.className = 'drag-ghost';
                ghost.textContent = w;
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
                setPicked(w);
                window.setTimeout(() => ghost.remove(), 0);
              }}
              onDragEnd={() => setPicked(null)}
              onClick={() => setPicked(picked === w ? null : w)}
            >
              {w}
            </button>
          );
        })}
        {!locked && <span className="hint bank-hint">{picked ? 'Now tap a gap.' : 'Tap a word, then tap a gap. Or drag it.'}</span>}
      </div>
    );
  };

  const order = (node: JSONContent, key: string) => {
    const id = node.attrs!.id as string;
    const words: string[] = node.attrs?.words ?? [];
    const placed = isAnswered(responses[id]) ? splitWords(String(responses[id])) : [];
    const pool = [...words];
    for (const p of placed) {
      const k = pool.indexOf(p);
      if (k >= 0) pool.splice(k, 1);
    }
    const entry = results?.[id];
    if (results) {
      const ok = scoreQuestion(entry, responses[id]).got === 1;
      return (
        <div key={key} className="order-q">
          {num(id)}
          <span className={ok ? 'ans right' : 'ans wrong'}>{placed.join(' ') || '—'}</span>
          {ok ? TICK : !hideAnswers && entry?.kind === 'order' && <span className="fix">{entry.answer}</span>}
          {notesFor(node)}
        </div>
      );
    }
    return (
      <div key={key} className="order-q">
        <div className="order-line">
          {num(id)}
          {placed.length === 0 && <span className="order-empty">Tap the words in order</span>}
          {placed.map((w, i) => (
            <button key={i} type="button" className="bank-word placed" disabled={disabled} onClick={() => onChange?.(id, placed.filter((_, k) => k !== i).join(' '))}>
              {w}
            </button>
          ))}
        </div>
        <div className="order-pool">
          {pool.map((w, i) => (
            <button key={i} type="button" className="bank-word" disabled={disabled} onClick={() => onChange?.(id, [...placed, w].join(' '))}>
              {w}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const writing = (node: JSONContent, key: string) => {
    const id = node.attrs!.id as string;
    const raw = responses[id];
    const rich = !!node.attrs?.rich;
    const spell = !!node.attrs?.spellcheck;
    const text = textOf(raw);
    const count = splitWords(text).length;
    const min = node.attrs?.minWords as number | null;
    const max = node.attrs?.maxWords as number | null;
    const aim = min && max ? `${min}–${max} words` : min ? `at least ${min} words` : max ? `up to ${max} words` : '';
    const under = !!min && count < min;
    const over = !!max && count > max;
    return (
      <div key={key} className="writing-q">
        {num(id)}
        {rich ? (
          <RichAnswer
            value={raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as JSONContent) : null}
            onChange={(v) => onChange?.(id, v)}
            disabled={locked}
            spellcheck={spell}
            label={`Question ${numbers[id]}`}
          />
        ) : (
          <textarea
            aria-label={`Question ${numbers[id]}`}
            value={typeof raw === 'string' ? raw : text}
            disabled={locked}
            rows={8}
            spellCheck={spell}
            autoCorrect={spell ? 'on' : 'off'}
            autoCapitalize="sentences"
            onChange={(e) => onChange?.(id, e.target.value)}
            placeholder="Write your answer here"
          />
        )}
        <span className={'word-count' + (under || over ? ' off' : '')}>
          {count} {count === 1 ? 'word' : 'words'}
          {aim ? ` · ${aim}` : ''}
          {under ? ' · keep going' : over ? ' · too long' : ''}
          {results ? ' · sent to your teacher' : ''}
        </span>
      </div>
    );
  };

  // Hints and feedback for wrong answers, shown under the line they belong to.
  const notesFor = (node: JSONContent) => {
    if (!results) return null;
    const ids: string[] = [];
    const collect = (x: JSONContent) => {
      if (x.attrs?.id && QTYPES.includes(x.type ?? '')) ids.push(x.attrs.id);
      x.content?.forEach(collect);
    };
    collect(node);
    const notes = ids
      .map((id) => {
        const e = results[id];
        if (!e || scoreQuestion(e, responses[id]).got === scoreQuestion(e, responses[id]).max) return null;
        const text = hideAnswers ? e.hint : e.feedback;
        return text ? { id, text } : null;
      })
      .filter(Boolean) as { id: string; text: string }[];
    if (!notes.length) return null;
    return (
      <div className={'q-notes' + (hideAnswers ? ' hint' : '')}>
        {notes.map((nt) => (
          <span key={nt.id}>
            <sup className="q-num">{numbers[nt.id]}</sup>
            {hideAnswers ? 'Hint: ' : ''}
            {nt.text}
          </span>
        ))}
      </div>
    );
  };

  // Document --------------------------------------------------------------------------------

  const render = (node: JSONContent, key: string): ReactNode => {
    const kids = () => node.content?.map((c, i) => render(c, key + '.' + i));
    switch (node.type) {
      case 'doc':
        return <>{kids()}</>;
      case 'paragraph':
        return (
          <div key={key} className="para">
            <p>{kids()}</p>
            {notesFor(node)}
          </div>
        );
      case 'heading':
        return <h3 key={key}>{kids()}</h3>;
      case 'bulletList':
        return <ul key={key}>{kids()}</ul>;
      case 'orderedList':
        return <ol key={key}>{kids()}</ol>;
      case 'listItem':
        return <li key={key}>{kids()}</li>;
      case 'table':
        return (
          <div key={key} className="table-wrap-task">
            <table className="task-table">
              <tbody>{kids()}</tbody>
            </table>
          </div>
        );
      case 'tableRow':
        return <tr key={key}>{kids()}</tr>;
      case 'tableHeader':
        return (
          <th key={key} colSpan={node.attrs?.colspan ?? 1} rowSpan={node.attrs?.rowspan ?? 1}>
            {kids()}
          </th>
        );
      case 'tableCell':
        return (
          <td key={key} colSpan={node.attrs?.colspan ?? 1} rowSpan={node.attrs?.rowspan ?? 1}>
            {kids()}
          </td>
        );
      case 'textBox':
        return (
          <BoxFrame key={key} attrs={node.attrs as BoxAttrs}>
            {kids()}
          </BoxFrame>
        );
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
      case 'choice':
        return choice(node, key);
      case 'mcq':
        return mcq(node, key);
      case 'match':
        return match(node, key);
      case 'dropgap':
        return dropgap(node, key);
      case 'wordbank':
        return wordbank(node, key);
      case 'order':
        return order(node, key);
      case 'writing':
        return writing(node, key);
      case 'columnBreak':
        return null;
      default:
        return kids() ?? null;
    }
  };

  if (!content) return <div className="task-body" />;

  // Two-column layout: split the top level at the first column break; each column scrolls on its own.
  const top = content.content ?? [];
  const at = top.findIndex((c) => c.type === 'columnBreak');
  if (at >= 0) {
    return (
      <div className={'task-columns ' + (layout === 'two-wide' ? 'two-wide' : 'two') + (colScroll === 'together' ? ' together' : ' separate')}>
        <div className="task-body col">{top.slice(0, at).map((c, i) => render(c, 'a' + i))}</div>
        <div className="task-body col">{top.slice(at + 1).map((c, i) => render(c, 'b' + i))}</div>
      </div>
    );
  }
  return <div className="task-body">{render(content, 'r')}</div>;
}
