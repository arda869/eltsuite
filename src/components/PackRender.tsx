import { useEffect, useRef, useState, type ReactNode } from 'react';
import { packAnswerText, scorePack, type PackKey, type PackKind } from '../lib/pack';
import { useImageSrc } from '../editor/PackNode';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Data = Record<string, any>;
const L = 'ABCDEFGHIJKLMNOP';
const TICK = (
  <svg className="tick" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label="correct">
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

type Props = {
  id: string;
  kind: PackKind;
  data: Data;
  value: any;
  onChange?: (v: any) => void;
  result?: PackKey | null; // after checking
  revealed?: PackKey | null; // the teacher has shown the answer
  hideAnswers?: boolean;
  locked?: boolean;
  num: (id: string, offset?: number) => ReactNode;
  classId?: string;
  reason?: boolean;
};

// Tap something, then tap where it goes (drag works too).
function usePick() {
  const [picked, setPicked] = useState<number | null>(null);
  return { picked, setPicked };
}

export function PackQuestion(p: Props) {
  const { kind, result, revealed, data } = p;
  const score = result ? scorePack(result, p.value) : null;
  const body = (() => {
    switch (kind) {
      case 'fix':
        return <Fix {...p} />;
      case 'categorise':
        return <Categorise {...p} />;
      case 'transform':
        return <Transform {...p} />;
      case 'highlight':
        return <HighlightQ {...p} />;
      case 'sentences':
        return <Sentences {...p} />;
      case 'label':
        return <LabelQ {...p} />;
      case 'odd':
        return <Odd {...p} />;
      case 'gapped':
        return <Gapped {...p} />;
      case 'matching':
        return <Matching {...p} />;
      case 'speaking':
        return <Speaking {...p} />;
    }
  })();
  return (
    <div className={'pq-q k-' + kind} data-qid={kind === 'speaking' ? undefined : p.id}>
      {body}
      {score && score.max > 1 && (
        <span className="pq-score">
          {score.got} of {score.max}
        </span>
      )}
      {result && !p.hideAnswers && score && score.got < score.max && kind === 'sentences' && <span className="fix pq-fix">{packAnswerText(result, data)}</span>}
      {revealed && !result && <span className="reveal-ans pq-reveal">{packAnswerText(revealed, data)}</span>}
    </div>
  );
}

const arr = (v: any, n: number) => Array.from({ length: n }, (_, i) => (Array.isArray(v) && typeof v[i] === 'number' ? v[i] : -1));

function Fix({ id, data, value, onChange, result, locked, num, hideAnswers }: Props) {
  const toks: string[] = data.toks ?? [];
  const pick: number[] = Array.isArray(value?.pick) ? value.pick : [];
  const fix: string = value?.fix ?? '';
  const k = result?.k;
  const toggle = (i: number) => {
    if (locked) return;
    const next = pick.includes(i) ? pick.filter((x) => x !== i) : [...pick, i].sort((a, b) => a - b);
    onChange?.({ pick: next, fix });
  };
  const s = result ? scorePack(result, value) : null;
  return (
    <div className="pq-fix-q">
      <p className="pq-sentence">
        {num(id)}
        {toks.map((w, i) => {
          const on = pick.includes(i);
          const st = !k ? (on ? ' on' : '') : on ? (k.range.includes(i) ? ' right' : ' wrong') : !hideAnswers && k.range.includes(i) ? ' missed' : '';
          return (
            <button key={i} type="button" className={'pq-tok' + st} disabled={locked} aria-pressed={on} onClick={() => toggle(i)}>
              {w}
            </button>
          );
        })}
      </p>
      {(pick.length > 0 || result) && (
        <span className="pq-fix-row">
          <span className="hint">Correction</span>
          {result ? (
            <span className="gap-result">
              <span className={s && s.got === 2 ? 'ans right' : 'ans wrong'}>{fix || '—'}</span>
              {s && s.got === 2 ? TICK : !hideAnswers && <span className="fix">{k?.fixes?.[0]}</span>}
            </span>
          ) : (
            <input className="gap-input" value={fix} disabled={locked} placeholder=" " size={Math.max(8, fix.length + 1)} autoComplete="off" spellCheck={false} onChange={(e) => onChange?.({ pick, fix: e.target.value })} />
          )}
        </span>
      )}
      {!result && !locked && pick.length === 0 && <span className="hint pq-help">Tap the word or words that are wrong.</span>}
    </div>
  );
}

function Categorise({ id, data, value, onChange, result, locked, num, hideAnswers }: Props) {
  const cats: string[] = data.cats ?? [];
  const items: string[] = data.items ?? [];
  const a = arr(value, items.length);
  const { picked, setPicked } = usePick();
  const put = (item: number, cat: number) => {
    const next = [...a];
    next[item] = cat;
    onChange?.(next);
    setPicked(null);
  };
  const state = (i: number) => (!result ? '' : a[i] === result.k.map[i] ? ' right' : ' wrong');
  const chip = (i: number) => (
    <button
      key={i}
      type="button"
      className={'bank-word pq-chip' + (picked === i ? ' picked' : '') + state(i)}
      draggable={!locked}
      disabled={locked && !result}
      onDragStart={(e) => (e.dataTransfer.setData('text/plain', String(i)), setPicked(i))}
      onClick={() => !locked && (a[i] >= 0 && picked === null ? put(i, -1) : setPicked(picked === i ? null : i))}
    >
      {items[i]}
      {result && a[i] !== result.k.map[i] && !hideAnswers && <span className="pq-belongs"> → {cats[result.k.map[i]]}</span>}
    </button>
  );
  return (
    <div className="pq-cat-q">
      <span className="pq-instr-line">
        {num(id)}
        <span className="hint">Put each word in the right column.</span>
      </span>
      <div className="pq-pool" onDragOver={(e) => e.preventDefault()} onDrop={(e) => put(Number(e.dataTransfer.getData('text/plain')), -1)}>
        {items.map((_, i) => (a[i] < 0 ? chip(i) : null))}
        {!result && !locked && <span className="hint">{picked !== null ? 'Now tap a column.' : 'Tap a word, then tap its column. Or drag it.'}</span>}
      </div>
      <div className="pq-cols" style={{ ['--n' as string]: cats.length }}>
        {cats.map((c, ci) => (
          <div key={ci} className={'pq-col' + (picked !== null ? ' ready' : '')} onClick={() => picked !== null && put(picked, ci)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => put(Number(e.dataTransfer.getData('text/plain')), ci)}>
            <span className="pq-col-head">{c}</span>
            <span className="pq-col-items">{items.map((_, i) => (a[i] === ci ? chip(i) : null))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Transform({ id, data, value, onChange, result, locked, num, hideAnswers }: Props) {
  const v = typeof value === 'string' ? value : '';
  const n = v.trim().split(/\s+/).filter(Boolean).length;
  const s = result ? scorePack(result, v) : null;
  const range = data.min && data.max ? `${data.min}–${data.max} words` : data.max ? `up to ${data.max} words` : '';
  return (
    <div className="pq-tr-q">
      <p className="pq-first">
        {num(id)}
        {data.first}
      </p>
      <span className="pq-key">{data.keyWord}</span>
      <p className="pq-second">
        {data.before}{' '}
        {result ? (
          <span className="gap-result">
            <span className={s?.got ? 'ans right' : 'ans wrong'}>{v || '—'}</span>
            {s?.got ? TICK : !hideAnswers && <span className="fix">{result.k.answers?.[0]}</span>}
          </span>
        ) : (
          <input className="gap-input pq-tr-input" value={v} disabled={locked} placeholder=" " size={Math.max(14, v.length + 1)} autoComplete="off" spellCheck={false} onChange={(e) => onChange?.(e.target.value)} />
        )}{' '}
        {data.after}
      </p>
      {range && (
        <span className={'hint pq-count' + ((data.max && n > data.max) || (data.min && v && n < data.min) ? ' off' : '')}>
          {n} {n === 1 ? 'word' : 'words'} · {range}, using the word in capitals
        </span>
      )}
    </div>
  );
}

function HighlightQ({ id, data, value, onChange, result, locked, num, hideAnswers }: Props) {
  const toks: string[] = data.toks ?? [];
  const pick: number[] = Array.isArray(value) ? value : [];
  const groups: number[][] = result?.k.groups ?? [];
  const target = new Set(groups.flat());
  return (
    <div className="pq-hl-q">
      <p className="pq-instr">
        {num(id)}
        {data.instruction}
      </p>
      <p className="pq-hl-text">
        {toks.map((w, i) => {
          const on = pick.includes(i);
          const st = !result ? (on ? ' on' : '') : on ? (target.has(i) ? ' right' : ' wrong') : !hideAnswers && target.has(i) ? ' missed' : '';
          return (
            <button key={i} type="button" className={'pq-tok hl' + st} disabled={locked} aria-pressed={on} onClick={() => onChange?.(on ? pick.filter((x) => x !== i) : [...pick, i])}>
              {w}
            </button>
          );
        })}
      </p>
      {data.penalty && !result && !locked && <span className="hint">Careful: wrong taps cost a point.</span>}
    </div>
  );
}

function Sentences({ id, data, value, onChange, result, locked, num }: Props) {
  const items: string[] = data.items ?? [];
  const order: number[] = Array.isArray(value) && value.length === items.length ? value : items.map((_, i) => i);
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange?.(next);
  };
  return (
    <div className="pq-sent-q">
      <span className="pq-instr-line">
        {num(id)}
        <span className="hint">Put the sentences in the right order.</span>
      </span>
      <ol className="pq-sent-list">
        {order.map((it, pos) => {
          const st = result ? (result.k.order[pos] === it ? ' right' : ' wrong') : '';
          return (
            <li
              key={it}
              className={'pq-sent' + st + (drag === pos ? ' dragging' : '')}
              draggable={!locked}
              onDragStart={() => setDrag(pos)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drag !== null && (move(drag, pos), setDrag(null))}
              onDragEnd={() => setDrag(null)}
            >
              <span className="pq-sent-n">{pos + 1}</span>
              <span className="pq-sent-text">{items[it]}</span>
              {!locked && (
                <span className="pq-sent-move">
                  <button type="button" className="icon-btn" aria-label="Move up" disabled={pos === 0} onClick={() => move(pos, pos - 1)}>
                    ↑
                  </button>
                  <button type="button" className="icon-btn" aria-label="Move down" disabled={pos === order.length - 1} onClick={() => move(pos, pos + 1)}>
                    ↓
                  </button>
                </span>
              )}
              {result && result.k.order[pos] === it && TICK}
            </li>
          );
        })}
      </ol>
      {!locked && !result && <span className="hint">Drag the sentences, or use the arrows, to put them in order.</span>}
    </div>
  );
}

function LabelQ({ id, data, value, onChange, result, locked, num, classId = '', hideAnswers }: Props) {
  const url = useImageSrc(classId, data.image ?? '');
  const pts: { x: number; y: number }[] = data.points ?? [];
  const labels: string[] = data.labels ?? [];
  const a = arr(value, pts.length);
  const { picked, setPicked } = usePick();
  const place = (pt: number, label: number) => {
    const next = a.map((x) => (x === label ? -1 : x));
    next[pt] = label;
    onChange?.(next);
    setPicked(null);
  };
  return (
    <div className="pq-label-q">
      <span className="pq-instr-line">
        {num(id)}
        <span className="hint">Put each label on the right point.</span>
      </span>
      <div className="pq-label-stage">
        {url ? <img src={url} alt="" draggable={false} /> : <div className="pq-noimg">Picture</div>}
        {pts.map((p, i) => {
          const st = result ? (a[i] === result.k.map[i] ? ' right' : ' wrong') : '';
          return (
            <button
              key={i}
              type="button"
              className={'pq-pin' + (a[i] >= 0 ? ' filled' : '') + (picked !== null ? ' ready' : '') + st}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              disabled={locked}
              onClick={() => (picked !== null ? place(i, picked) : a[i] >= 0 && onChange?.(a.map((x, k) => (k === i ? -1 : x))))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => place(i, Number(e.dataTransfer.getData('text/plain')))}
            >
              <span className="pq-pin-n">{i + 1}</span>
              {a[i] >= 0 && <span className="pq-pin-label">{labels[a[i]]}</span>}
              {result && a[i] !== result.k.map[i] && !hideAnswers && <span className="pq-pin-fix">{labels[result.k.map[i]]}</span>}
            </button>
          );
        })}
      </div>
      {!result && (
        <div className="pq-pool">
          {labels.map((l, i) =>
            a.includes(i) ? null : (
              <button key={i} type="button" className={'bank-word' + (picked === i ? ' picked' : '')} disabled={locked} draggable={!locked} onDragStart={(e) => (e.dataTransfer.setData('text/plain', String(i)), setPicked(i))} onClick={() => setPicked(picked === i ? null : i)}>
                {l}
              </button>
            ),
          )}
          {!locked && <span className="hint">{picked !== null ? 'Now tap a point on the picture.' : 'Tap a label, then tap its point. Or drag it.'}</span>}
        </div>
      )}
    </div>
  );
}

function Odd({ id, data, value, onChange, result, locked, num, hideAnswers }: Props) {
  const ws: string[] = data.words ?? [];
  const v = value && typeof value === 'object' ? value : {};
  return (
    <div className="pq-odd-q">
      <span className="pq-odd-row">
        {num(id)}
        {ws.map((w, i) => {
          const on = v.pick === i;
          const st = !result ? (on ? ' on' : '') : on ? (result.k.odd === i ? ' right' : ' wrong') : !hideAnswers && result.k.odd === i ? ' missed' : '';
          return (
            <button key={i} type="button" className={'pq-odd-chip' + st} disabled={locked} aria-pressed={on} onClick={() => onChange?.({ ...v, pick: on ? undefined : i })}>
              {w}
            </button>
          );
        })}
      </span>
      {data.reason && (
        <input className="pq-reason" value={v.reason ?? ''} disabled={locked} placeholder="Why? (your teacher reads this)" onChange={(e) => onChange?.({ ...v, reason: e.target.value })} />
      )}
    </div>
  );
}

function Gapped({ id, data, value, onChange, result, locked, num, hideAnswers }: Props) {
  const opts: string[] = data.options ?? [];
  const n: number = data.gaps ?? 0;
  const a = arr(value, n);
  const { picked, setPicked } = usePick();
  const place = (gap: number, opt: number) => {
    const next = a.map((x) => (x === opt ? -1 : x));
    next[gap] = opt;
    onChange?.(next);
    setPicked(null);
  };
  const paras = String(data.text ?? '').split(/\n{2,}/);
  return (
    <div className="pq-gapped-q">
      <span className="pq-instr-line">
        {num(id)}
        <span className="hint">Put the right sentence in each gap. One sentence is extra.</span>
      </span>
      <div className="pq-gapped-text">
        {paras.map((para, pi) => (
          <p key={pi}>
            {para.split(/(\{\{\d+\}\})/).map((part, k) => {
              const m = /^\{\{(\d+)\}\}$/.exec(part);
              if (!m) return <span key={k}>{part}</span>;
              const g = Number(m[1]) - 1;
              const st = result ? (a[g] === result.k.map[g] ? ' right' : ' wrong') : '';
              return (
                <button
                  key={k}
                  type="button"
                  className={'pq-gslot' + (a[g] >= 0 ? ' filled' : '') + (picked !== null ? ' ready' : '') + st}
                  disabled={locked}
                  onClick={() => (picked !== null ? place(g, picked) : a[g] >= 0 && onChange?.(a.map((x, i) => (i === g ? -1 : x))))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => place(g, Number(e.dataTransfer.getData('text/plain')))}
                >
                  <span className="pq-gslot-n">{g + 1}</span>
                  {a[g] >= 0 ? <span className="pq-gslot-letter">{L[a[g]]}</span> : null}
                  {result && a[g] !== result.k.map[g] && !hideAnswers && <span className="fix">{L[result.k.map[g]]}</span>}
                </button>
              );
            })}
          </p>
        ))}
      </div>
      <ol className="pq-options">
        {opts.map((o, i) => (
          <li key={i}>
            <button
              type="button"
              className={'pq-option' + (picked === i ? ' picked' : '') + (a.includes(i) ? ' used' : '')}
              disabled={locked}
              draggable={!locked}
              onDragStart={(e) => (e.dataTransfer.setData('text/plain', String(i)), setPicked(i))}
              onClick={() => setPicked(picked === i ? null : i)}
            >
              <span className="letter">{L[i]}</span>
              <span>{o}</span>
            </button>
          </li>
        ))}
      </ol>
      {!locked && !result && <span className="hint">{picked !== null ? 'Now tap a gap in the text.' : 'Tap a sentence, then tap its gap. Or drag it.'}</span>}
    </div>
  );
}

function Matching({ id, data, value, onChange, result, locked, num, hideAnswers }: Props) {
  const opts: string[] = data.options ?? [];
  const names: string[] = data.names ?? [];
  const st: string[] = data.statements ?? [];
  const a = arr(value, st.length);
  return (
    <div className="pq-mm-q">
      {names.some(Boolean) && (
        <span className="pq-mm-legend">
          {opts.map((o, i) => (
            <span key={i}>
              <strong>{o}</strong> {names[i]}
            </span>
          ))}
        </span>
      )}
      <ol className="pq-mm-list">
        {st.map((s, i) => (
          <li key={i} className="pq-mm-row">
            <span className="pq-mm-text">
              {num(id, i)}
              {s}
            </span>
            <span className="pq-mm-opts" role="radiogroup">
              {opts.map((o, k) => {
                const on = a[i] === k;
                const cls = !result ? (on ? ' on' : '') : on ? (result.k.map[i] === k ? ' right' : ' wrong') : !hideAnswers && result.k.map[i] === k ? ' missed' : '';
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} className={'pq-mm-opt' + cls} disabled={locked} onClick={() => onChange?.(a.map((x, j) => (j === i ? (on ? -1 : k) : x)))}>
                    {o}
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Speaking({ data, classId = '' }: Props) {
  const total: number = data.timer ?? 60;
  const [left, setLeft] = useState(total);
  const [run, setRun] = useState(false);
  const [turn, setTurn] = useState<'you' | 'partner' | 'done'>('you');
  const t = useRef<number>();
  useEffect(() => {
    if (!run) return;
    t.current = window.setInterval(() => setLeft((x) => (x <= 1 ? (setRun(false), 0) : x - 1)), 1000);
    return () => window.clearInterval(t.current);
  }, [run]);
  const imgs: string[] = (data.images ?? []).filter(Boolean);
  const pct = left / total;
  const next = () => {
    setRun(false);
    setLeft(total);
    setTurn(data.pairs !== false && turn === 'you' ? 'partner' : 'done');
  };
  return (
    <div className="pq-speak">
      <span className="eyebrow">Speaking</span>
      {data.prompt && <p className="pq-speak-prompt">{data.prompt}</p>}
      {imgs.length > 0 && (
        <div className={'pq-photos n' + imgs.length}>
          {imgs.map((src, i) => (
            <Photo key={i} classId={classId} src={src} />
          ))}
        </div>
      )}
      {(data.questions ?? []).filter(Boolean).length > 0 && (
        <ul className="pq-speak-qs">
          {(data.questions ?? []).filter(Boolean).map((q: string, i: number) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      )}
      <div className="pq-speak-bar">
        <span className="pq-turn">{turn === 'done' ? 'Well done!' : turn === 'you' ? (data.pairs !== false ? 'Your turn' : 'Speak') : 'Your partner’s turn'}</span>
        {turn !== 'done' && (
          <>
            <span className="pq-clock" role="timer">
              <svg width="28" height="28" viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--hair-strong)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray={`${pct * 94.2} 94.2`} transform="rotate(-90 18 18)" strokeLinecap="round" />
              </svg>
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </span>
            <button type="button" className="btn small-btn" onClick={() => setRun((r) => !r)} disabled={left === 0}>
              {run ? 'Pause' : left < total ? 'Go on' : 'Start'}
            </button>
            <button type="button" className={'btn small-btn' + (left === 0 ? ' primary' : '')} onClick={next}>
              {data.pairs !== false && turn === 'you' ? 'Your partner’s turn' : 'Finish'}
            </button>
          </>
        )}
        {turn === 'done' && (
          <button type="button" className="btn small-btn" onClick={() => (setTurn('you'), setLeft(total))}>
            Again
          </button>
        )}
      </div>
    </div>
  );
}

function Photo({ classId, src }: { classId: string; src: string }) {
  const url = useImageSrc(classId, src);
  return url ? <img src={url} alt="" /> : <div className="pq-noimg" />;
}
