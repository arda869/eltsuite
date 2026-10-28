import { useState, type CSSProperties } from 'react';
import { theme } from '../../lib/themes';
import { addSession, isNow, useZones, zoneOf, type Occurrence, type Session, type SessionKind } from '../../lib/sessions';
import { cityOf, clockIn, localZone, sameClock } from '../../lib/tz';
import { defaultVideo, external, joinText, joinUrl, makeTeamsMeeting, videoLabel, warmTeams, type VideoPrefs } from '../../lib/meetings';
import { Select, MultiSelect } from '../../components/Select';
import { IconBtn, UiIcon } from '../../components/UiIcon';
import { tell } from '../../lib/ask';
import { callLinkUrl, guestLink } from '../../lib/calls';
import type { ClassDoc } from '../../lib/classes';
import { clock, clockRange, lengthText, longDay } from './dates';
import type { GridEv } from './TimeGrid';

type Person = { key: string; name: string };

// The same moment on other clocks: the session's own zone, and each colleague's.
function otherClocks(t: number, people: { name: string; tz?: string }[], own?: string) {
  const here = localZone();
  const out: string[] = [];
  if (own && !sameClock(own, here, t)) out.push(`${clockIn(t, own)} in ${cityOf(own)}`);
  for (const p of people) if (p.tz && !sameClock(p.tz, here, t)) out.push(`${clockIn(t, p.tz)} for ${p.name}, ${cityOf(p.tz)}`);
  return [...new Set(out)];
}

// Quick add: the title, the time you dragged, a class or a meeting. More options opens the full form.
export function QuickCreate({ start, end, classes, colleagues, lastClass, me, prefs, onDone, onMore, onTitle }: { start: number; end: number; classes: ClassDoc[]; colleagues: Person[]; lastClass: string | null; me: { uid: string; name: string }; prefs: VideoPrefs; onDone: (saved?: string, classId?: string) => void; onMore: (init: Partial<Session>) => void; onTitle?: (t: string) => void }) {
  const [kind, setKind] = useState<SessionKind>(classes.length ? 'class' : 'meeting');
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState(lastClass && classes.some((c) => c.id === lastClass) ? lastClass : classes[0]?.id ?? '');
  const [who, setWho] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const zones = useZones(kind === 'meeting' ? who : []);
  const theirs = kind === 'meeting' ? otherClocks(start, who.map((k) => ({ name: colleagues.find((p) => p.key === k)?.name ?? 'a colleague', tz: zones[k] }))) : [];
  const mins = Math.round((end - start) / 60000);
  const c = classes.find((x) => x.id === classId);
  const name = title.trim() || (kind === 'class' ? c?.name ?? '' : 'Meeting');
  const ok = kind === 'meeting' || !!c;
  const video = defaultVideo(prefs, me.uid);
  const init = (): Partial<Session> => ({ kind, title: title.trim(), start, mins, weeks: 1, online: true, video: video ?? null, classId: kind === 'class' ? classId || null : null, attendees: kind === 'meeting' ? who : [] });
  const save = async () => {
    if (!ok || busy) return;
    // Teams by default: Microsoft's window may open from this click.
    const teams = video?.kind === 'teams' ? warmTeams() : null;
    setBusy(true);
    let v: Session['video'] = video ?? null;
    if (teams) {
      try {
        await teams;
        v = { kind: 'teams', url: await makeTeamsMeeting({ title: name, start, mins, weeks: 1 }), by: me.uid };
      } catch (e) {
        v = null;
        void tell(`${e instanceof Error ? e.message : 'The Teams meeting could not be made.'} The session uses the ELT Suite video room for now.`);
      }
    }
    try {
      await addSession({ owner: me.uid, ownerName: me.name, kind, title: name, start, mins, weeks: 1, online: true, video: v, classId: kind === 'class' ? classId : null, itemId: null, attendees: kind === 'meeting' ? who : [], names: Object.fromEntries(colleagues.filter((p) => who.includes(p.key)).map((p) => [p.key, p.name])), live: null });
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
          {video && (
            <>
              <br />
              <span className="hint">Online, {videoLabel(video.kind)}</span>
            </>
          )}
          {theirs.length > 0 && (
            <>
              <br />
              <span className="hint">{theirs.join(' · ')}</span>
            </>
          )}
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
          <MultiSelect label="Who" value={who} options={colleagues.map((p) => ({ v: p.key, label: p.name }))} onChange={setWho} none={colleagues.length ? 'Invite colleagues' : 'No colleagues yet'} foot="" />
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
export function SessionPop({ o, c, uid, lessonTitle, mine, onClose, onStart, onEdit, onDelete }: { o: Occurrence; c?: ClassDoc; uid: string; lessonTitle?: string; mine: boolean; onClose: () => void; onStart: () => void; onEdit: () => void; onDelete: () => void }) {
  const s = o.s;
  const people = s.kind === 'meeting' ? [s.owner, ...(s.attendees ?? [])].filter((k) => k && k !== uid) : [];
  const zones = useZones(people);
  const clocks = otherClocks(o.start, people.map((k) => ({ name: k === s.owner ? s.ownerName || 'the organiser' : s.names?.[k] ?? 'a colleague', tz: zones[k] })), s.tz ? zoneOf(s) : undefined);
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
          {joinUrl(s) ? (
            <span className="ttb-link">
              {videoLabel(s.video?.kind)}
              <a href={joinUrl(s)!} target="_blank" rel="noopener noreferrer">
                {joinUrl(s)!.replace(/^https:\/\//, '').replace(/\?.*$/, '')}
              </a>
            </span>
          ) : external(s) ? (
            <span>{videoLabel(s.video?.kind)}: {s.video?.kind === 'meet' ? 'the link is made in Google Calendar, once it is connected in Settings' : 'the link is not ready yet'}</span>
          ) : (
            <span>{s.online ? (s.kind === 'class' ? (c?.video?.url ? 'Online, in the class video room' : 'Online: the class video room is on its way') : s.live ? `On now: ${s.live.byName} started it` : 'Online: the room opens when it starts') : s.place || 'In person'}</span>
          )}
        </li>
        {clocks.length > 0 && (
          <li>
            <UiIcon name="timer" size={16} />
            <span>
              {clock(o.start)} your time · {clocks.join(' · ')}
            </span>
          </li>
        )}
        {s.kind === 'meeting' && (
          <li>
            <UiIcon name="person" size={16} />
            <span>{[s.ownerName ? `${s.ownerName} (organiser)` : '', ...(s.attendees ?? []).map((a) => s.names?.[a] ?? 'Colleague')].filter(Boolean).join(', ') || 'Just you'}</span>
          </li>
        )}
        {s.notes && <li className="ttb-notes">{s.notes}</li>}
        {s.kind === 'meeting' && s.online && !external(s) && !lone && (mine || !!s.guest) && <GuestInvite s={s} o={o} mine={mine} />}
      </ul>
      {(s.online || s.kind === 'class') && (
        <button type="button" className={'btn ttb-go ' + (now ? 'primary' : '')} onClick={onStart} data-autofocus>
          {s.kind === 'class' ? (s.itemId ? 'Start teaching' : 'Open the class') : joinUrl(s) ? joinText(s) : s.live ? 'Join' : 'Start now'}
        </button>
      )}
    </div>
  );
}

// People without ELT Suite: a link to the meeting they open in their browser, by email or copied.
function GuestInvite({ s, o, mine }: { s: Session; o: Occurrence; mine: boolean }) {
  const [code, setCode] = useState(s.guest ?? '');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = code ? callLinkUrl(code) : '';
  const make = async () => {
    setBusy(true);
    try {
      setCode(await guestLink(s, s.ownerName || 'Teacher'));
    } catch {
      void tell('The link could not be made. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const mail = `mailto:?subject=${encodeURIComponent(`Invitation: ${s.title || 'Meeting'}, ${longDay(o.start)}`)}&body=${encodeURIComponent(`You are invited to ${s.title || 'a meeting'} on ${longDay(o.start)}, ${clockRange(o.start, o.end)} (${localZone()}).\n\nJoin in your browser, no account needed:\n${url}\n\nOpen the link a little before it starts; it lets you in when the meeting begins.`)}`;
  return (
    <li className="ttb-guest">
      <UiIcon name="link" size={16} />
      {code ? (
        <span className="ttb-guest-b">
          <span>People without ELT Suite join with this link:</span>
          <span className="ttb-guest-link">{url.replace(/^https:\/\//, '')}</span>
          <span className="ttb-guest-acts">
            <button type="button" className="btn small-btn" onClick={() => (void navigator.clipboard?.writeText(url), setCopied(true), window.setTimeout(() => setCopied(false), 1500))}>
              {copied ? 'Copied' : 'Copy the link'}
            </button>
            <a className="btn small-btn" href={mail}>
              Invite by email
            </a>
          </span>
        </span>
      ) : mine ? (
        <span className="ttb-guest-b">
          <span>Invite someone who is not in ELT Suite</span>
          <button type="button" className="btn small-btn" disabled={busy} onClick={() => void make()}>
            {busy ? 'Making the link…' : 'Make a guest link'}
          </button>
        </span>
      ) : null}
    </li>
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
