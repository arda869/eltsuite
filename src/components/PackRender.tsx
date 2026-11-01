import { useEffect, useRef, useState, type ReactNode } from 'react';
import { diffWords, highlightGroups, packAnswerText, scorePack, type PackKey, type PackKind, type Placed } from '../lib/pack';
import { speak } from '../lib/media';
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
      case 'dictation':
        return <Dictation {...p} />;
      case 'pairs':
        return <Pairs {...p} />;
      case 'crossword':
        return <Crossword {...p} />;
      case 'wordsearch':
        return <WordSearch {...p} />;
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
            <input className="gap-input" aria-label="The correction" value={fix} disabled={locked} placeholder=" " size={Math.max(8, fix.length + 1)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} onChange={(e) => onChange?.({ pick, fix: e.target.value })} />
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
          <input className="gap-input pq-tr-input" aria-label="Your answer" value={v} disabled={locked} placeholder=" " size={Math.max(14, v.length + 1)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} onChange={(e) => onChange?.(e.target.value)} />
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
  const groups = highlightGroups(result?.k.groups);
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
        <span className="pq-turn">{turn === 'done' ? 'Well done.' : turn === 'you' ? (data.pairs !== false ? 'Your turn' : 'Speak') : 'Your partner’s turn'}</span>
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

// ---- Question pack 2 ---------------------------------------------------------------------

const SPEAKER = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>
);

// Dictation: hear the sentence (limited replays), type it, marked word by word.
function Dictation({ id, data, value, onChange, result, locked, num, hideAnswers }: Props) {
  const v = typeof value === 'string' ? value : '';
  const key = 'dict-' + id;
  const [plays, setPlays] = useState(() => {
    try {
      return Number(sessionStorage.getItem(key) ?? 0);
    } catch {
      return 0;
    }
  });
  const limit = Number(data.replays) || 2;
  const left = limit >= 99 ? Infinity : Math.max(0, limit - plays);
  const play = () => {
    if (left <= 0 || result) return;
    speak(data.say ?? '', data.accent === 'GA' ? 'GA' : 'RP');
    setPlays((n) => {
      try {
        sessionStorage.setItem(key, String(n + 1));
      } catch {
        /* ignore */
      }
      return n + 1;
    });
  };
  const diff = result ? diffWords(result.k.sentence ?? '', v) : null;
  return (
    <div className="pq-dict">
      <span className="pq-dict-head">
        {num(id)}
        <button type="button" className="btn small-btn pq-play" disabled={locked || !!result || left <= 0} onClick={play}>
          {SPEAKER} {plays === 0 ? 'Listen' : 'Listen again'}
        </button>
        <span className="hint">{result ? '' : left === Infinity ? 'Replay as often as you like' : left > 0 ? `${left} ${left === 1 ? 'play' : 'plays'} left` : 'No plays left'} · {data.count ?? '?'} words</span>
      </span>
      {!result ? (
        <input className="gap-input pq-dict-input" value={v} disabled={locked} placeholder="Type what you hear" aria-label="Type what you hear" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} onChange={(e) => onChange?.(e.target.value)} />
      ) : (
        <div className="pq-dict-result">
          <span className="pq-dict-typed">
            {diff!.typed.length ? diff!.typed.map((w, i) => <span key={i} className={'ans ' + (w.ok ? 'right' : 'wrong')}>{w.w} </span>) : <span className="ans wrong">—</span>}
          </span>
          {!hideAnswers && (
            <span className="pq-dict-exp">
              {diff!.expected.map((w, i) => (
                <span key={i} className={w.ok ? '' : 'missed-word'}>
                  {w.w}{' '}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Minimal pairs: hear a word, pick it from similar-sounding options.
function Pairs({ id, data, value, onChange, result, locked, num, hideAnswers }: Props) {
  const items: { say: string; options: string[] }[] = data.items ?? [];
  const v = arr(value, items.length);
  return (
    <div className="pq-pairs">
      {items.map((it, i) => (
        <span key={i} className="pq-pair-row">
          {num(id, i)}
          <button type="button" className="icon-btn pq-say" aria-label="Listen" disabled={locked} onClick={() => speak(it.say, data.accent === 'GA' ? 'GA' : 'RP')}>
            {SPEAKER}
          </button>
          {it.options.map((o, oi) => {
            const on = v[i] === oi;
            const st = !result ? (on ? ' on' : '') : on ? (result.k.map?.[i] === oi ? ' right' : ' wrong') : !hideAnswers && result.k.map?.[i] === oi ? ' missed' : '';
            return (
              <button key={oi} type="button" className={'pq-odd-chip' + st} disabled={locked || !!result} aria-pressed={on} onClick={() => onChange?.(v.map((x, k) => (k === i ? (on ? -1 : oi) : x)))}>
                {o}
              </button>
            );
          })}
          {result && v[i] === result.k.map?.[i] && TICK}
        </span>
      ))}
    </div>
  );
}

// Crossword: the clues, and a grid to type letters into.
function Crossword({ id, data, value, onChange, result, locked, num, hideAnswers }: Props) {
  const rows: number = data.rows ?? 0;
  const cols: number = data.cols ?? 0;
  const clues: { n: number; dir: string; row: number; col: number; len: number; clue: string }[] = data.clues ?? [];
  const cells: Record<string, string> = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const [active, setActive] = useState<number | null>(null);
  const inGrid = new Map<string, { n?: number; clues: number[] }>();
  clues.forEach((c, ci) => {
    for (let i = 0; i < c.len; i++) {
      const k = (c.dir === 'across' ? c.row : c.row + i) + ',' + (c.dir === 'across' ? c.col + i : c.col);
      const cur = inGrid.get(k) ?? { clues: [] };
      cur.clues.push(ci);
      if (i === 0) cur.n = cur.n ?? c.n;
      inGrid.set(k, cur);
    }
  });
  const answerCells = result ? (Object.fromEntries((result.k.layout ?? []).flatMap((p: Placed) => Array.from({ length: p.word.length }, (_, i) => [(p.dir === 'across' ? p.row : p.row + i) + ',' + (p.dir === 'across' ? p.col + i : p.col), p.word[i]]))) as Record<string, string>) : {};
  const ok = (k: string) => (cells[k] ?? '').toUpperCase() === (answerCells[k] ?? '').toUpperCase();
  const move = (r: number, c: number, dir: string, step: number) => {
    const nr = dir === 'across' ? r : r + step;
    const nc = dir === 'across' ? c + step : c;
    const next = document.querySelector<HTMLInputElement>(`[data-cw="${id}"] input[data-rc="${nr},${nc}"]`);
    next?.focus();
    next?.select();
  };
  return (
    <div className="pq-cw" data-cw={id}>
      <span className="pq-cw-head">{num(id)}</span>
      <div className="pq-cw-wrap">
        <div className="pq-cw-grid" style={{ gridTemplateColumns: `repeat(${cols}, var(--cw-cell, 32px))` }}>
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const k = r + ',' + c;
            const g = inGrid.get(k);
            if (!g) return <span key={k} className="pq-cw-black" />;
            const dir = active !== null && g.clues.includes(active) ? clues[active].dir : clues[g.clues[0]].dir;
            return (
              <span key={k} className={'pq-cw-cell' + (active !== null && g.clues.includes(active) ? ' lit' : '') + (result ? (ok(k) ? ' right' : ' wrong') : '')}>
                {g.n && <i className="pq-cw-n">{g.n}</i>}
                {result ? (
                  <b className={ok(k) ? '' : 'pen'}>{cells[k] ?? ''}</b>
                ) : (
                  <input
                    data-rc={k}
                    value={cells[k] ?? ''}
                    maxLength={1}
                    disabled={locked}
                    aria-label={`Row ${r + 1}, column ${c + 1}`}
                    onFocus={() => setActive(g.clues.includes(active ?? -1) ? active : g.clues[0])}
                    onChange={(e) => {
                      const ch = e.target.value.slice(-1).toUpperCase();
                      onChange?.({ ...cells, [k]: ch });
                      if (ch) move(r, c, dir, 1);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !cells[k]) move(r, c, dir, -1);
                      if (e.key === 'ArrowRight') move(r, c, 'across', 1);
                      if (e.key === 'ArrowLeft') move(r, c, 'across', -1);
                      if (e.key === 'ArrowDown') move(r, c, 'down', 1);
                      if (e.key === 'ArrowUp') move(r, c, 'down', -1);
                    }}
                  />
                )}
                {result && !ok(k) && !hideAnswers && <em className="pq-cw-fix">{answerCells[k]}</em>}
              </span>
            );
          })}
        </div>
        <div className="pq-cw-clues">
          {(['across', 'down'] as const).map((dir) => {
            const list = clues.map((c, i) => ({ c, i })).filter((x) => x.c.dir === dir).sort((a, b) => a.c.n - b.c.n);
            if (!list.length) return null;
            return (
              <div key={dir}>
                <span className="eyebrow">{dir}</span>
                <ol className="pq-cw-list">
                  {list.map(({ c, i }) => (
                    <li key={i} className={active === i ? 'on' : ''}>
                      <button type="button" onClick={() => (setActive(i), document.querySelector<HTMLInputElement>(`[data-cw="${id}"] input[data-rc="${c.row},${c.col}"]`)?.focus())}>
                        <b>{c.n}</b> {c.clue || '…'} <span className="hint">({c.len})</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Word search: read a clue, then drag across the word in the grid.
function WordSearch({ id, data, value, onChange, result, locked, num, hideAnswers }: Props) {
  const grid: string[] = data.grid ?? [];
  const size: number = data.size ?? 0;
  const clues: { clue: string; len: number }[] = data.clues ?? [];
  const found: string[] = Array.isArray(value) ? value.map(String) : [];
  const [start, setStart] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const rc = (i: number) => [Math.floor(i / size), i % size] as const;
  const lineOf = (a: number, b: number): number[] | null => {
    const [r1, c1] = rc(a);
    const [r2, c2] = rc(b);
    const dr = Math.sign(r2 - r1);
    const dc = Math.sign(c2 - c1);
    if (!(dr === 0 || dc === 0 || Math.abs(r2 - r1) === Math.abs(c2 - c1))) return null;
    const n = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1)) + 1;
    return Array.from({ length: n }, (_, i) => (r1 + dr * i) * size + c1 + dc * i);
  };
  const keyOf = (a: number, b: number) => {
    const [r1, c1] = rc(a);
    const [r2, c2] = rc(b);
    return `${r1},${c1},${Math.sign(r2 - r1)},${Math.sign(c2 - c1)}`;
  };
  // the cells of every marked word (both ends are accepted, so try the reverse too)
  const marked = new Set<number>();
  const wordCells = (k: string, len: number) => {
    const [r, c, dr, dc] = k.split(',').map(Number);
    return Array.from({ length: len }, (_, i) => (r + dr * i) * size + c + dc * i);
  };
  found.forEach((k) => {
    const len = Number(k.split(',')[4] ?? 0);
    wordCells(k, len).forEach((i) => marked.add(i));
  });
  const answerCells = new Set<number>();
  if (result && !hideAnswers) (result.k.placed ?? []).forEach((p: { row: number; col: number; dir: string; word: string }) => wordCells(`${p.row},${p.col},${p.dir}`, p.word.length).forEach((i) => answerCells.add(i)));
  const finish = (end: number) => {
    if (start === null) return;
    const line = lineOf(start, end);
    setStart(null);
    setHover(null);
    if (!line || line.length < 2) return;
    // a word may be marked from either end, so both directions are stored, each with the length
    const fwd = keyOf(start, end);
    const bwd = keyOf(end, start);
    if (found.some((f) => f.startsWith(fwd + ',') || f.startsWith(bwd + ','))) return;
    onChange?.([...found, `${fwd},${line.length}`, `${bwd},${line.length}`]);
  };
  const path = start !== null && hover !== null ? lineOf(start, hover) : null;
  const okKeys = new Set<string>((result?.k.placed ?? []).map((p: { row: number; col: number; dir: string }) => `${p.row},${p.col},${p.dir}`));
  const foundWords = found.filter((k) => okKeys.has(k.split(',').slice(0, 4).join(','))).length;
  return (
    <div className="pq-ws" data-ws={id}>
      <span className="pq-cw-head">
        {num(id)}
        <span className="hint">
          {result ? `${foundWords} of ${clues.length} found` : `${Math.floor(found.length / 2)} marked · ${clues.length} to find`}
        </span>
      </span>
      <div className="pq-cw-wrap">
        <div
          className="pq-ws-grid"
          style={{ gridTemplateColumns: `repeat(${size}, var(--cw-cell, 30px))` }}
          onPointerLeave={() => start !== null && (setStart(null), setHover(null))}
        >
          {grid.map((ch, i) => {
            const inPath = path?.includes(i);
            const isMarked = marked.has(i);
            const isAns = answerCells.has(i);
            return (
              <button
                key={i}
                type="button"
                className={'pq-ws-cell' + (inPath ? ' lit' : '') + (isMarked ? (result ? (isAns || hideAnswers ? ' right' : ' wrong') : ' marked') : '') + (result && isAns && !isMarked ? ' missed' : '')}
                disabled={locked || !!result}
                onPointerDown={(e) => (e.preventDefault(), setStart(i), setHover(i))}
                onPointerEnter={() => start !== null && setHover(i)}
                onPointerUp={() => finish(i)}
              >
                {ch}
              </button>
            );
          })}
        </div>
        <ol className="pq-cw-list pq-ws-clues">
          {clues.map((c, i) => (
            <li key={i}>
              {c.clue || '…'} <span className="hint">({c.len})</span>
            </li>
          ))}
        </ol>
      </div>
      {found.length > 0 && !result && (
        <button type="button" className="btn link small" onClick={() => onChange?.([])}>
          Clear marks
        </button>
      )}
    </div>
  );
}
