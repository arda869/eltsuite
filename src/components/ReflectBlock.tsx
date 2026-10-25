import type { ReflectAnswer, RItem } from '../editor/Reflect';

// Learner view of a self-reflection or peer feedback block.

const FACES = [
  { label: 'Not happy', mouth: 'M8 16.5c1.2-1.4 2.5-2 4-2s2.8.6 4 2' },
  { label: 'Not sure', mouth: 'M8.5 15.5h7' },
  { label: 'Okay', mouth: 'M8 14.5c1.2 1.3 2.5 2 4 2s2.8-.7 4-2' },
  { label: 'Happy', mouth: 'M7.5 13.5c1.2 2.2 2.7 3.3 4.5 3.3s3.3-1.1 4.5-3.3' },
];

function Face({ mouth }: { mouth: string }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="9" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <path d={mouth} />
    </svg>
  );
}

const STAR = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z';

const grow = (e: { currentTarget: HTMLTextAreaElement }) => {
  const t = e.currentTarget;
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 2 + 'px';
};

type Props = {
  about: 'self' | 'peer';
  title: string;
  items: RItem[];
  value: ReflectAnswer | undefined;
  onChange?: (v: ReflectAnswer) => void;
  disabled?: boolean;
  classmates?: { id: string; name: string }[];
  selfId?: string;
  pairing?: 'learners' | 'teacher';
  pairedWith?: string; // learnerId the teacher paired this learner with
  readOnlyFrom?: string; // showing feedback someone else gave (name)
};

export function ReflectBlock({ about, title, items, value, onChange, disabled, classmates = [], selfId, pairing = 'learners', pairedWith, readOnlyFrom }: Props) {
  const fixed = about === 'peer' && pairing === 'teacher' && !readOnlyFrom ? classmates.find((c) => c.id === pairedWith) : undefined;
  const raw: ReflectAnswer = value ?? { ratings: {} };
  const v: ReflectAnswer = fixed ? { ...raw, peer: fixed.id, peerName: fixed.name } : raw;
  const peerName = v.peerName ?? '';
  const first = peerName.split(' ')[0];
  const others = classmates.filter((c) => c.id !== selfId);
  const needPeer = about === 'peer' && !v.peer && !readOnlyFrom;
  const set = (id: string, r: number | number[] | string) => onChange?.({ ...v, ratings: { ...v.ratings, [id]: r } });
  const needPeerFixed = about === 'peer' && pairing === 'teacher' && !fixed && !readOnlyFrom;
  const text = (s: string) => s.replace(/\{name\}/g, readOnlyFrom ? 'you' : first || 'your classmate');
  const off = disabled || !onChange;

  return (
    <section className={'rf rf-' + about + (readOnlyFrom ? ' rf-received' : '')}>
      <div className="rf-head">
        <span className="rf-eyebrow">{readOnlyFrom ? `Feedback from ${readOnlyFrom}` : about === 'self' ? 'Self-reflection' : 'Feedback for a classmate'}</span>
        {title && <h3 className="rf-title">{title}</h3>}
      </div>

      {about === 'peer' && readOnlyFrom ? null : about === 'peer' && pairing === 'teacher' ? (
        <div className="rf-peer">
          {fixed ? (
            <span className="rf-q">
              You are giving feedback to <strong className="rf-to">{fixed.name}</strong>.
            </span>
          ) : (
            <span className="hint">Your teacher hasn’t paired you with a classmate yet.</span>
          )}
        </div>
      ) : about === 'peer' && (
        <div className="rf-peer">
          <span className="rf-q">Who are you giving feedback to?</span>
          <span className="rf-people" role="radiogroup" aria-label="Classmate">
            {others.length === 0 && <span className="hint">The class list will appear here.</span>}
            {others.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={v.peer === c.id} className={'rf-person' + (v.peer === c.id ? ' on' : '')} disabled={off} onClick={() => onChange?.({ ...v, peer: c.id, peerName: c.name })}>
                <span className="rf-av">{c.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
                {c.name.split(' ')[0]}
              </button>
            ))}
          </span>
        </div>
      )}

      <ol className={'rf-items' + (needPeer ? ' is-waiting' : '')}>
        {items.map((it) => {
          const r = v.ratings[it.id];
          return (
            <li key={it.id} className="rf-item">
              <span className="rf-q">{text(it.prompt) || ' '}</span>
              {it.type === 'stars' && (
                <span className="rf-stars" role="radiogroup" aria-label={text(it.prompt)}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={r === n} aria-label={`${n} of 5`} className={'rf-star' + (typeof r === 'number' && n <= r ? ' on' : '')} disabled={off || needPeer} onClick={() => set(it.id, r === n ? 0 : n)}>
                      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                        <path d={STAR} strokeWidth="1.4" strokeLinejoin="round" />
                      </svg>
                    </button>
                  ))}
                </span>
              )}
              {it.type === 'faces' && (
                <span className="rf-faces" role="radiogroup" aria-label={text(it.prompt)}>
                  {FACES.map((f, n) => (
                    <button key={n} type="button" role="radio" aria-checked={r === n + 1} title={f.label} aria-label={f.label} className={'rf-face' + (r === n + 1 ? ' on' : '')} disabled={off || needPeer} onClick={() => set(it.id, r === n + 1 ? 0 : n + 1)}>
                      <Face mouth={f.mouth} />
                    </button>
                  ))}
                </span>
              )}
              {it.type === 'scale' && (
                <span className="rf-scale">
                  <span className="rf-end">{it.low}</span>
                  <span className="rf-nums" role="radiogroup" aria-label={text(it.prompt)}>
                    {[...Array(it.points ?? 5)].map((_, k) => (
                      <button key={k} type="button" role="radio" aria-checked={r === k + 1} className={'rf-num' + (r === k + 1 ? ' on' : '')} disabled={off || needPeer} onClick={() => set(it.id, r === k + 1 ? 0 : k + 1)}>
                        {k + 1}
                      </button>
                    ))}
                  </span>
                  <span className="rf-end">{it.high}</span>
                </span>
              )}
              {it.type === 'choice' && (
                <span className="rf-pills" role="radiogroup" aria-label={text(it.prompt)}>
                  {(it.options ?? []).filter(Boolean).map((o, k) => (
                    <button key={k} type="button" role="radio" aria-checked={r === k} className={'rf-pill' + (r === k ? ' on' : '')} disabled={off || needPeer} onClick={() => set(it.id, r === k ? -1 : k)}>
                      {text(o)}
                    </button>
                  ))}
                </span>
              )}
              {it.type === 'checklist' && (
                <span className="rf-checks">
                  {(it.options ?? []).filter(Boolean).map((o, k) => {
                    const arr = Array.isArray(r) ? r : [];
                    const on = arr.includes(k);
                    return (
                      <label key={k} className={'rf-check' + (on ? ' on' : '')}>
                        <input type="checkbox" checked={on} disabled={off || needPeer} onChange={() => set(it.id, on ? arr.filter((x) => x !== k) : [...arr, k])} />
                        <span className="rf-box" aria-hidden="true">
                          {on && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12.5l4.5 4.5L19 7.5" />
                            </svg>
                          )}
                        </span>
                        <span>{text(o)}</span>
                      </label>
                    );
                  })}
                </span>
              )}
              {it.type === 'text' && <textarea className="rf-text" rows={2} value={typeof r === 'string' ? r : ''} disabled={off || needPeer} placeholder="Write here" onChange={(e) => set(it.id, e.target.value)} onInput={grow} ref={(el) => el && grow({ currentTarget: el })} />}
            </li>
          );
        })}
      </ol>
      {needPeer && !off && !needPeerFixed && <span className="hint rf-wait">Choose a classmate first.</span>}
    </section>
  );
}
