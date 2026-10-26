import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Manifest, ScriptLine } from '../lib/archive';
import { Karaoke, Transport, useEngine, useWave, Wave } from './Player';

// The script of a sound or video, and when each line starts. Lines can be timed by tapping
// Space as the recording plays, set one at a time, or spread evenly across the recording.

export const splitScript = (text: string): string[] =>
  text
    .split(/\n+/)
    .flatMap((p) => p.split(/(?<=[.!?…]["”’)]?)\s+(?=[A-Z0-9"“‘(¿¡])/))
    .map((s) => s.trim())
    .filter(Boolean);

const fmt = (t: number | null) => (t === null ? '–' : `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);
const parseT = (s: string): number | null => {
  const m = /^\s*(?:(\d+):)?(\d+(?:\.\d+)?)\s*$/.exec(s);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};

// "Anna: Hello there" → speaker Anna. Short labels only, so "Note: …" in a sentence is unlikely.
const SPEAKER = /^\s*([A-Z][\p{L}0-9 .'-]{0,18}?)\s*:\s+(.+)$/u;
export function parseLine(raw: string): { who?: string; text: string } {
  const m = SPEAKER.exec(raw);
  return m ? { who: m[1].trim(), text: m[2].trim() } : { text: raw.trim() };
}
export const speakersOf = (lines: ScriptLine[]) => [...new Set(lines.map((l) => l.who).filter(Boolean) as string[])];

export function spreadEvenly(lines: ScriptLine[], duration: number, from = 0): ScriptLine[] {
  const total = lines.reduce((s, l) => s + Math.max(4, l.text.length), 0) || 1;
  let acc = 0;
  return lines.map((l) => {
    const t = from + ((duration - from) * acc) / total;
    acc += Math.max(4, l.text.length);
    return { ...l, t: +t.toFixed(2) };
  });
}

export function ScriptEditor({ classId, mediaId, manifest, title, onSave, onClose }: { classId: string; mediaId: string; manifest?: Manifest | null; title?: string; onSave: (lines: ScriptLine[]) => void | Promise<void>; onClose: () => void }) {
  const e = useEngine(classId, mediaId, manifest);
  const wave = useWave(classId, mediaId, e.m);
  const [lines, setLines] = useState<ScriptLine[] | null>(null);
  const [bulk, setBulk] = useState(false);
  const [text, setText] = useState('');
  const [tap, setTap] = useState<number | null>(null); // the line the next tap times
  const [saving, setSaving] = useState(false);
  const rows = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (lines === null && e.m) {
      const l = e.m.script ?? [];
      setLines(l);
      if (!l.length) setBulk(true);
    }
  }, [e.m, lines]);
  const L = lines ?? [];
  const duration = e.duration || e.m?.duration || 0;
  const set = (i: number, patch: Partial<ScriptLine>) => setLines(L.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const fromText = (): ScriptLine[] =>
    text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p, i) => {
        const { who, text: body } = parseLine(p);
        return { text: body, t: L[i]?.t ?? null, ...(who ? { who } : {}) };
      });
  const applyBulk = () => {
    setLines(fromText());
    setBulk(false);
  };
  // Speakers: one (no labels), A and B, or names. Each line can be given to any of them.
  const speakers = speakersOf(L);
  const mode: 'one' | 'ab' | 'names' = !speakers.length ? 'one' : speakers.every((x) => /^[A-D]$/.test(x)) ? 'ab' : 'names';
  const [names, setNames] = useState<string[]>([]);
  const cast = mode === 'names' ? [...new Set([...speakers, ...names])] : mode === 'ab' ? [...new Set(['A', 'B', ...speakers])] : [];
  const setMode = (m: 'one' | 'ab' | 'names') => {
    if (m === 'one') return setLines(L.map(({ who: _w, ...l }) => l));
    if (m === 'ab') return setLines(L.map((l, i) => ({ ...l, who: speakers.length ? 'AB'[Math.max(0, speakers.indexOf(l.who ?? ''))] ?? 'A' : i % 2 ? 'B' : 'A' })));
    const list = names.length >= 2 ? names : ['Speaker 1', 'Speaker 2'];
    setNames(list);
    setLines(L.map((l, i) => ({ ...l, who: list[speakers.length ? Math.max(0, speakers.indexOf(l.who ?? '')) % list.length : i % list.length] })));
  };
  const renameSpeaker = (from: string, to: string) => {
    const n = to.trim();
    if (!n || n === from) return;
    setNames(cast.map((x) => (x === from ? n : x)));
    setLines(L.map((l) => (l.who === from ? { ...l, who: n } : l)));
  };
  const startTap = () => {
    if (!L.length) return;
    setLines(L.map((l) => ({ ...l, t: null })));
    setTap(0);
    e.seek(0);
    e.play();
  };
  const tapNext = () => {
    if (tap === null) return;
    const t = +e.time.toFixed(2);
    setLines((cur) => (cur ?? []).map((l, k) => (k === tap ? { ...l, t } : l)));
    if (tap + 1 >= L.length) setTap(null);
    else setTap(tap + 1);
  };
  useEffect(() => {
    if (tap === null) return;
    const key = (ev: KeyboardEvent) => {
      if (ev.code === 'Space' || ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        tapNext();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        setTap(null);
        e.pause();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  useEffect(() => {
    const row = rows.current?.querySelector<HTMLElement>('.se-row.tapping');
    row?.scrollIntoView({ block: 'nearest' });
  }, [tap]);

  const save = async () => {
    if (bulk) applyBulk();
    const parts = bulk ? fromText() : L.filter((l) => l.text.trim());
    setSaving(true);
    try {
      await onSave(parts);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="scrim" onClick={onClose}>
      <div className="dialog se-dialog" role="dialog" aria-label="Script and timing" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
        <div className="se-head">
          <h2 style={{ margin: 0 }}>Script and timing</h2>
          <span className="hint">{title || e.m?.title}</span>
        </div>
        {e.video && <div className="mp-screen se-screen" ref={e.host} />}
        <Transport e={e}>
          <Wave wave={wave} duration={duration} time={e.time} lines={bulk ? [] : L} onSeek={e.seek} onMove={(i, t) => set(i, { t })} height={64} />
        </Transport>
        {bulk ? (
          <div className="field">
            <span>The script, one line for each sentence or speaker turn</span>
            <textarea className="se-bulk" value={text} autoFocus placeholder={'Paste or type the script here.\nEach line lights up as it is spoken.'} onChange={(ev) => setText(ev.target.value)} />
            <span className="hint">More than one speaker? Start lines with a name or a letter, like “A: Hello” or “Anna: Hello”.</span>
            <span className="se-tools">
              <button type="button" className="btn small-btn" disabled={!text.trim()} onClick={() => setText(splitScript(text).join('\n'))}>
                One line for each sentence
              </button>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn small-btn primary" disabled={!text.trim()} onClick={applyBulk}>
                Next: timing
              </button>
            </span>
          </div>
        ) : (
          <>
            <span className="se-tools">
              {tap === null ? (
                <button type="button" className="btn small-btn primary" disabled={!L.length || (!e.ready && !e.video)} onClick={startTap}>
                  Time it by tapping
                </button>
              ) : (
                <button type="button" className="btn small-btn primary se-tap" onClick={tapNext}>
                  Line {tap + 1} starts now <kbd>Space</kbd>
                </button>
              )}
              <button type="button" className="btn small-btn" disabled={!L.length || !duration} onClick={() => setLines(spreadEvenly(L, duration))}>
                Spread evenly
              </button>
              <button
                type="button"
                className="btn small-btn"
                onClick={() => {
                  setText(L.map((l) => (l.who ? `${l.who}: ${l.text}` : l.text)).join('\n'));
                  setBulk(true);
                  setTap(null);
                }}
              >
                Edit as text
              </button>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn link" disabled={!L.some((l) => l.t !== null)} onClick={() => setLines(L.map((l) => ({ ...l, t: null })))}>
                Clear times
              </button>
            </span>
            <div className="se-speakers">
              <span className="se-sp-l">Speakers</span>
              <span className="seg small-seg" role="radiogroup" aria-label="Speakers">
                {(
                  [
                    ['one', 'One speaker'],
                    ['ab', 'A and B'],
                    ['names', 'Names'],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
                    {l}
                  </button>
                ))}
              </span>
              {mode === 'names' && (
                <span className="se-cast">
                  {cast.map((n, i) => (
                    <input key={n + i} className={'se-castname sp' + (i % 4)} defaultValue={n} aria-label={`Speaker ${i + 1}`} onBlur={(ev) => renameSpeaker(n, ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && (ev.currentTarget as HTMLInputElement).blur()} size={Math.max(4, n.length)} />
                  ))}
                  {cast.length < 6 && (
                    <button type="button" className="btn link small" onClick={() => setNames([...cast, `Speaker ${cast.length + 1}`])}>
                      + Speaker
                    </button>
                  )}
                </span>
              )}
            </div>
            <span className="hint">{tap !== null ? 'Press Space (or the button) as each line begins. Escape stops.' : 'Click a time to set it to now. Click a line number to play from there.'}</span>
            <div className="se-rows" ref={rows}>
              {L.map((l, i) => (
                <div key={i} className={'se-row' + (tap === i ? ' tapping' : '')}>
                  <button type="button" className="se-n" onClick={() => l.t !== null && (e.seek(l.t), e.play())} disabled={l.t === null} aria-label={`Play from line ${i + 1}`}>
                    {i + 1}
                  </button>
                  <TimeField value={l.t} onSet={(t) => set(i, { t })} now={e.time} />
                  {cast.length > 0 && (
                    <select className={'se-who sp' + Math.max(0, cast.indexOf(l.who ?? '')) % 4} value={l.who ?? ''} onChange={(ev) => set(i, { who: ev.target.value || undefined })} aria-label={`Speaker of line ${i + 1}`}>
                      {cast.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  )}
                  <input className="se-text" value={l.text} onChange={(ev) => set(i, { text: ev.target.value })} aria-label={`Line ${i + 1}`} />
                  <button type="button" className="se-x" aria-label={`Remove line ${i + 1}`} onClick={() => setLines(L.filter((_, k) => k !== i))}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="btn link se-add" onClick={() => setLines([...L, { text: '', t: null }])}>
                + Add a line
              </button>
            </div>
            {L.some((l) => l.t !== null) && (
              <div className="se-preview">
                <span className="hint">Preview</span>
                <Karaoke lines={L.filter((l) => l.text.trim())} time={e.time} duration={duration} onSeek={(t) => (e.seek(t), e.play())} />
              </div>
            )}
          </>
        )}
        <span className="pe-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </span>
      </div>
    </div>,
    document.body,
  );
}

function TimeField({ value, onSet, now }: { value: number | null; onSet: (t: number | null) => void; now: number }) {
  const [edit, setEdit] = useState<string | null>(null);
  if (edit !== null)
    return (
      <input
        className="se-time editing"
        value={edit}
        autoFocus
        onChange={(ev) => setEdit(ev.target.value)}
        onBlur={() => (onSet(edit.trim() ? parseT(edit) : null), setEdit(null))}
        onKeyDown={(ev) => ev.key === 'Enter' && (ev.currentTarget as HTMLInputElement).blur()}
        aria-label="Start time"
      />
    );
  return (
    <span className="se-time-wrap">
      <button type="button" className={'se-time' + (value === null ? ' empty' : '')} onClick={() => onSet(+now.toFixed(2))} data-tip="Set to now">
        {fmt(value)}
      </button>
      <button type="button" className="se-time-edit" onClick={() => setEdit(value === null ? '' : fmt(value))} aria-label="Type a time">
        ✎
      </button>
    </span>
  );
}
