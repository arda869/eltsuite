import { useState, type CSSProperties } from 'react';
import { theme } from '../../lib/themes';
import { addSession, isNow, type Occurrence, type Session, type SessionKind } from '../../lib/sessions';
import { Select, MultiSelect } from '../../components/Select';
import { IconBtn, UiIcon } from '../../components/UiIcon';
import { tell } from '../../lib/ask';
import type { ClassDoc } from '../../lib/classes';
import { clockRange, lengthText, longDay } from './dates';
import type { GridEv } from './TimeGrid';

type Person = { key: string; name: string };

// Quick add: the title, the time you dragged, a class or a meeting. More options opens the full form.
export function QuickCreate({ start, end, classes, colleagues, lastClass, me, onDone, onMore, onTitle }: { start: number; end: number; classes: ClassDoc[]; colleagues: Person[]; lastClass: string | null; me: { uid: string; name: string }; onDone: (saved?: string, classId?: string) => void; onMore: (init: Partial<Session>) => void; onTitle?: (t: string) => void }) {
  const [kind, setKind] = useState<SessionKind>(classes.length ? 'class' : 'meeting');
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState(lastClass && classes.some((c) => c.id === lastClass) ? lastClass : classes[0]?.id ?? '');
  const [who, setWho] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const mins = Math.round((end - start) / 60000);
  const c = classes.find((x) => x.id === classId);
  const name = title.trim() || (kind === 'class' ? c?.name ?? '' : 'Meeting');
  const ok = kind === 'meeting' || !!c;
  const init = (): Partial<Session> => ({ kind, title: title.trim(), start, mins, weeks: 1, online: true, classId: kind === 'class' ? classId || null : null, attendees: kind === 'meeting' ? who : [] });
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await addSession({ owner: me.uid, ownerName: me.name, kind, title: name, start, mins, weeks: 1, online: true, classId: kind === 'class' ? classId : null, itemId: null, attendees: kind === 'meeting' ? who : [], names: Object.fromEntries(colleagues.filter((p) => who.includes(p.key)).map((p) => [p.key, p.name])), live: null });
      onDone(name, kind === 'class' ? classId : undefined);
    } catch (e) {
      console.error(e);
      setBusy(false);
      void tell('It could not be saved. Please try again.');
    }
  };
  return (
    <form className="ttb-quick" onSubmit={(e) => (e.preventDefault(), void save())}>
      <input className="ttb-quick-title" data-autofocus value={title} onChange={(e) => (setTitle(e.target.value), onTitle?.(e.target.value))} placeholder={kind === 'class' ? (c ? `${c.name}, or a title` : 'Add a title') : 'Add a title'} aria-label="Title" maxLength={90} />
      <span className="seg ttb-quick-seg" role="radiogroup" aria-label="What">
        {(
          [
            ['class', 'A class'],
            ['meeting', 'A meeting'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {l}
          </button>
        ))}
      </span>
      <div className="ttb-quick-when">
        <UiIcon name="timer" size={16} />
        <span>
          {longDay(start)}
          <br />
          <b>{clockRange(start, end)}</b> <span className="hint">· {lengthText(mins)}</span>
        </span>
      </div>
      {kind === 'class' ? (
        classes.length ? (
          <div className="ttb-quick-row" style={{ ['--ev' as string]: theme(c?.themeColor).accent } as CSSProperties}>
            <i className="ttb-dot" aria-hidden="true" />
            <Select label="Class" value={classId} options={classes.map((x) => ({ v: x.id, label: x.name }))} onChange={setClassId} placeholder="Choose a class" />
          </div>
        ) : (
          <span className="hint">You have no classes yet. Add one first, or make this a meeting.</span>
        )
      ) : (
        <div className="ttb-quick-row">
          <UiIcon name="person" size={16} />
          <MultiSelect label="Who" value={who} options={colleagues.map((p) => ({ v: p.key, label: p.name }))} onChange={setWho} all={colleagues.length ? 'Invite colleagues' : 'No colleagues yet'} foot="" />
        </div>
      )}
      <div className="ttb-quick-foot">
        <button type="button" className="btn link small" onClick={() => onMore(init())}>
          More options
        </button>
        <button type="submit" className="btn primary" disabled={!ok || busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// A session, beside where it was clicked: when, where, who, and Start or Join.
export function SessionPop({ o, c, lessonTitle, mine, onClose, onStart, onEdit, onDelete }: { o: Occurrence; c?: ClassDoc; lessonTitle?: string; mine: boolean; onClose: () => void; onStart: () => void; onEdit: () => void; onDelete: () => void }) {
  const s = o.s;
  const now = isNow(o) || !!s.live;
  const lone = s.id.startsWith('i:');
  return (
    <div className="ttb-card" style={{ ['--ev' as string]: s.kind === 'class' ? theme(c?.themeColor).accent : 'var(--ink)' } as CSSProperties}>
      <div className="ttb-card-tools">
        {mine && <IconBtn icon="edit" label="Edit (e)" onClick={onEdit} />}
        {mine && !lone && <IconBtn icon="trash" label="Take out (Delete)" onClick={onDelete} />}
        <button type="button" className="icon-tool ttb-x" aria-label="Close" data-tip="Close (Esc)" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="ttb-card-main">
        <i className="ttb-sq" aria-hidden="true" />
        <div>
          <span className="ttb-card-k">{s.kind === 'class' ? c?.name ?? 'Class' : 'Meeting'}</span>
          <h2>{s.title || 'Untitled'}</h2>
          <span className="ttb-card-when">
            {longDay(o.start)} · {clockRange(o.start, o.end)}
          </span>
          {(s.weeks ?? 1) > 1 && (
            <span className="hint ttb-card-rep">
              Every week, {o.week + 1} of {s.weeks}
            </span>
          )}
        </div>
      </div>
      <ul className="ttb-facts">
        {lessonTitle && (
          <li>
            <UiIcon name="task" size={16} /> {lessonTitle}
          </li>
        )}
        {lone && (
          <li className="hint">
            <UiIcon name="calendar" size={16} /> A lesson with a time. Drag it, or Edit, to put it in the timetable.
          </li>
        )}
        <li>
          <UiIcon name={s.online ? 'video' : 'classes'} size={16} />
          <span>{s.online ? (s.kind === 'class' ? (c?.video?.url ? 'Online, in the class video room' : 'Online: the class video room is on its way') : s.live ? `On now: ${s.live.byName} started it` : 'Online: the room opens when it starts') : s.place || 'In person'}</span>
        </li>
        {s.kind === 'meeting' && (
          <li>
            <UiIcon name="person" size={16} />
            <span>{[s.ownerName ? `${s.ownerName} (organiser)` : '', ...(s.attendees ?? []).map((a) => s.names?.[a] ?? 'Colleague')].filter(Boolean).join(', ') || 'Just you'}</span>
          </li>
        )}
        {s.notes && <li className="ttb-notes">{s.notes}</li>}
      </ul>
      {(s.online || s.kind === 'class') && (
        <button type="button" className={'btn ttb-go ' + (now ? 'primary' : '')} onClick={onStart} data-autofocus>
          {s.kind === 'class' ? (s.itemId ? 'Start teaching' : 'Open the class') : s.live ? 'Join' : 'Start now'}
        </button>
      )}
    </div>
  );
}

// "3 more" in the month: that day's sessions.
export function MoreList({ day, list, onPick }: { day: number; list: GridEv[]; onPick: (ev: GridEv, at: DOMRect) => void }) {
  return (
    <div className="ttb-morelist">
      <b className="ttb-morelist-d">{longDay(day)}</b>
      {list.map((ev) => (
        <button key={ev.key} type="button" className="ttb-chip" style={{ ['--ev' as string]: ev.color } as CSSProperties} onClick={(e) => onPick(ev, e.currentTarget.getBoundingClientRect())}>
          <i aria-hidden="true" />
          <span className="ttb-chip-t">{clockRange(ev.o.start, ev.o.end)}</span>
          <b>{ev.o.s.title || 'Untitled'}</b>
        </button>
      ))}
    </div>
  );
}
