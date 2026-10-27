import { useState } from 'react';
import { addSession, saveSession, type Session } from '../../lib/sessions';
import { Select, MultiSelect } from '../../components/Select';
import { useDirectory } from '../../lib/directory';
import { tell } from '../../lib/ask';
import type { ClassDoc } from '../../lib/classes';
import { lengthText, niceStart } from './dates';

// The full form, for everything: a class or a meeting, the lesson, when, how often, where.

const pad = (n: number) => String(n).padStart(2, '0');
const dateIn = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const timeIn = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const MINS = [15, 30, 45, 60, 75, 90, 120, 150, 180];

export function SessionDialog({ init, classes, items, me, onClose, onSaved }: { init: Partial<Session>; classes: ClassDoc[]; items: Record<string, { id: string; title: string; type: string }[]>; me: { uid: string; name: string }; onClose: () => void; onSaved?: (title: string) => void }) {
  const dir = useDirectory();
  const colleagues = dir?.groups.find((g) => g.id === 'colleagues')?.people ?? [];
  const first = init.start ?? niceStart(Date.now());
  const [s, setS] = useState<Partial<Session>>({ kind: 'class', mins: 60, weeks: 1, online: true, ...init });
  const [date, setDate] = useState(dateIn(first));
  const [time, setTime] = useState(timeIn(first));
  const [repeat, setRepeat] = useState((init.weeks ?? 1) > 1);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Session>) => setS((x) => ({ ...x, ...p }));
  const c = classes.find((x) => x.id === s.classId);
  const lessons = (items[s.classId ?? ''] ?? []).filter((i) => i.type === 'lesson');
  const title = s.title?.trim() || (s.kind === 'class' ? lessons.find((l) => l.id === s.itemId)?.title || c?.name || '' : '');
  const ok = !!title && !!date && !!time && (s.kind === 'meeting' || !!c);
  const mins = s.mins ?? 60;
  const lengths = [...new Set([...MINS, mins])].sort((a, b) => a - b);
  const save = async () => {
    setBusy(true);
    const start = new Date(`${date}T${time}`).getTime();
    const base = { ...s, title, start, weeks: repeat ? Math.max(2, s.weeks ?? 2) : 1, classId: s.kind === 'class' ? s.classId : null, itemId: s.kind === 'class' ? s.itemId ?? null : null, attendees: s.kind === 'meeting' ? s.attendees ?? [] : [], names: Object.fromEntries(colleagues.filter((p) => (s.attendees ?? []).includes(p.key)).map((p) => [p.key, p.name])) };
    try {
      if (s.id) await saveSession(base as Session);
      else await addSession({ ...base, owner: me.uid, ownerName: me.name, live: null } as Omit<Session, 'id'>);
      onSaved?.(title);
      onClose();
    } catch (e) {
      console.error(e);
      void tell('It could not be saved. Please try again.');
      setBusy(false);
    }
  };
  return (
    <div className="scrim ttb-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="dialog ttb-dialog" role="dialog" aria-label={s.id ? 'Change the session' : 'A new session'} onSubmit={(e) => (e.preventDefault(), ok && void save())} onKeyDown={(e) => e.key === 'Escape' && !busy && !e.defaultPrevented && (e.preventDefault(), onClose())}>
        <h2>{s.id ? 'Change the session' : 'Add to the timetable'}</h2>
        <span className="seg" role="radiogroup" aria-label="What">
          {(
            [
              ['class', 'A class'],
              ['meeting', 'A meeting'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={s.kind === k} className={s.kind === k ? 'on' : ''} onClick={() => set({ kind: k, online: k === 'meeting' ? true : s.online })}>
              {l}
            </button>
          ))}
        </span>
        {s.kind === 'class' ? (
          <div className="ttb-two">
            <div className="field">
              <span>Class</span>
              <Select label="Class" value={s.classId ?? ''} options={classes.map((x) => ({ v: x.id, label: x.name }))} onChange={(v) => set({ classId: v, itemId: null })} placeholder="Choose a class" />
            </div>
            <div className="field">
              <span>Lesson to teach</span>
              <Select label="Lesson" value={s.itemId ?? ''} options={[{ v: '', label: 'Choose later' }, ...lessons.map((l) => ({ v: l.id, label: l.title }))]} onChange={(v) => set({ itemId: v || null })} />
            </div>
            <span className="hint ttb-span">With a lesson, Start teaching opens it live, and learners see its time.</span>
          </div>
        ) : (
          <div className="field">
            <span>Who</span>
            <MultiSelect label="Colleagues" value={s.attendees ?? []} options={colleagues.map((p) => ({ v: p.key, label: p.name }))} onChange={(v) => set({ attendees: v })} all="Nobody yet" foot="" />
            <span className="hint">They see it in their timetable, and are called when it starts.</span>
          </div>
        )}
        <label className="field">
          <span>Title{s.kind === 'class' ? ' (optional)' : ''}</span>
          <input value={s.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder={s.kind === 'class' ? title || 'The lesson or class name' : 'For example: Team planning'} maxLength={90} autoFocus />
        </label>
        <div className="ttb-when">
          <label className="field">
            <span>Day</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Starts</span>
            <input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
          <div className="field">
            <span>How long</span>
            <Select label="How long" value={String(mins)} options={lengths.map((m) => ({ v: String(m), label: lengthText(m) }))} onChange={(v) => set({ mins: Number(v) })} />
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          Every week, at this time
          {repeat && (
            <span className="ttb-weeks">
              for <input type="number" min={2} max={52} value={s.weeks && s.weeks > 1 ? s.weeks : 10} onChange={(e) => set({ weeks: Math.max(2, Math.min(52, Number(e.target.value) || 2)) })} aria-label="How many weeks" /> weeks
            </span>
          )}
        </label>
        <div className="field">
          <span>Where</span>
          <span className="seg small-seg" role="radiogroup" aria-label="Where">
            <button type="button" role="radio" aria-checked={!!s.online} className={s.online ? 'on' : ''} onClick={() => set({ online: true })}>
              Online
            </button>
            <button type="button" role="radio" aria-checked={!s.online} className={!s.online ? 'on' : ''} onClick={() => set({ online: false })}>
              In person
            </button>
          </span>
          {s.online ? (
            <span className="hint">{s.kind === 'class' ? (c?.video?.url ? 'In the class video room. Learners join from their home page; no link to send.' : 'In the class video room, which is made within a few minutes of the class.') : 'A video room opens when it starts. No link to send.'}</span>
          ) : (
            <input value={s.place ?? ''} onChange={(e) => set({ place: e.target.value })} placeholder="Room 4, or the address" aria-label="Where" />
          )}
        </div>
        <label className="field">
          <span>Notes (optional)</span>
          <textarea rows={2} value={s.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <div className="row-between" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!ok || busy}>
            {busy ? 'Saving…' : s.id ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}
