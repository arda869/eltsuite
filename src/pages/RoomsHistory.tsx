import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Chat } from '../lib/chat';
import type { CallKind } from '../lib/calls';
import type { ClassDoc } from '../lib/classes';
import type { Directory } from '../lib/directory';
import { dayKey, timeText, whenText } from '../lib/sessions';
import { theme } from '../lib/themes';
import { UiIcon } from '../components/UiIcon';
import { attendanceCsv, downloadCsv, durText, endOf, isLive, minsOf, summarise, useCallLog, type LogDoc, type PersonSummary } from '../lib/callHistory';
import { CallPair, Face } from './roomsParts';

// Call history: the latest calls on the Rooms page, all of them in their own view, and one call
// in detail: who came, when, for how long, and with microphone and camera on.

type Ctx = { uid: string; chats: Chat[] | null; classes: ClassDoc[]; dir: Directory | null; calling: string; onCall: (key: string, kind: CallKind, c?: Chat) => void };

const KIND: Record<LogDoc['kind'], { label: string; icon: string }> = {
  class: { label: 'Class', icon: 'classes' },
  meeting: { label: 'Meeting', icon: 'calendar' },
  chat: { label: 'Call', icon: 'phone' },
  link: { label: 'Link call', icon: 'link' },
};
const learnersIn = (l: LogDoc) => Object.values(l.people ?? {}).filter((p) => p.role === 'learner').length;
const peopleIn = (l: LogDoc) => Object.keys(l.people ?? {}).length;
const dayLabel = (t: number, now: number) => (dayKey(t) === dayKey(now) ? 'Today' : dayKey(t) === dayKey(now - 864e5) ? 'Yesterday' : new Date(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }));

// One line: what the call was, when, how long, who came.
function lineOf(l: LogDoc, cls: ClassDoc | undefined, now: number) {
  const live = isLive(l, now);
  const who = l.kind === 'class' && cls?.learnerCount ? `${learnersIn(l)} of ${cls.learnerCount} learners` : `${peopleIn(l)} ${peopleIn(l) === 1 ? 'person' : 'people'}`;
  return [KIND[l.kind].label, live ? 'on now' : durText(endOf(l, now) - l.startedAt), who].join(' · ');
}

function LogIcon({ l, ctx }: { l: LogDoc; ctx: Ctx }) {
  const chat = l.chatId ? ctx.chats?.find((c) => c.id === l.chatId) : undefined;
  if (chat) return <Face c={chat} me={ctx.uid} />;
  const cls = l.classId ? ctx.classes.find((c) => c.id === l.classId) : undefined;
  return (
    <span className={'rm-face rm-kind' + (cls ? ' is-class' : '')} style={cls ? ({ ['--ev' as string]: theme(cls.themeColor).accent } as CSSProperties) : undefined} aria-hidden="true">
      <UiIcon name={KIND[l.kind].icon} size={17} />
    </span>
  );
}

// A call in a list: opens its detail; a chat's call can be made again.
export function HistoryRow({ l, ctx, now, when = 'day' }: { l: LogDoc; ctx: Ctx; now: number; when?: 'day' | 'time' }) {
  const chat = l.chatId ? ctx.chats?.find((c) => c.id === l.chatId) : undefined;
  const cls = l.classId ? ctx.classes.find((c) => c.id === l.classId) : undefined;
  const live = isLive(l, now);
  return (
    <li className="rm-row rm-hrow">
      <Link className="rm-hrow-main" to={`/rooms?call=${encodeURIComponent(l.id)}`}>
        <LogIcon l={l} ctx={ctx} />
        <span className="rm-row-t">
          <b>{l.title || KIND[l.kind].label}</b>
          <span className="hint">
            {live && <span className="vc-live" aria-hidden="true" />} {when === 'time' ? timeText(l.startedAt) : whenText(l.startedAt)} · {lineOf(l, cls, now)}
          </span>
        </span>
      </Link>
      {chat && !live && <CallPair name={l.title} busy={!!ctx.calling} onCall={(kind) => ctx.onCall(chat.id, kind, chat)} again />}
    </li>
  );
}

// Every call, by day, with a filter by kind.
export function HistoryView({ logs, ctx, now }: { logs: LogDoc[] | null; ctx: Ctx; now: number }) {
  const [kind, setKind] = useState<LogDoc['kind'] | 'all'>('all');
  const shown = (logs ?? []).filter((l) => kind === 'all' || l.kind === kind);
  const days = useMemo(() => {
    const m = new Map<string, LogDoc[]>();
    for (const l of shown) m.set(dayKey(l.startedAt), [...(m.get(dayKey(l.startedAt)) ?? []), l]);
    return [...m.values()];
  }, [shown]);
  const kinds: (LogDoc['kind'] | 'all')[] = ['all', 'class', 'meeting', 'chat', 'link'];
  return (
    <>
      <header className="rm-head">
        <span className="rm-head-t">
          <Link className="rm-back" to="/rooms">
            <UiIcon name="prev" size={14} /> Rooms
          </Link>
          <h1 className="rm-title">Call history</h1>
          <span className="rm-date">Attendance for your classes, meetings and calls.</span>
        </span>
        <span className="rm-seg" role="group" aria-label="Show">
          {kinds.map((k) => (
            <button key={k} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === 'all' ? 'All' : k === 'class' ? 'Classes' : k === 'meeting' ? 'Meetings' : k === 'chat' ? 'Calls' : 'Links'}
            </button>
          ))}
        </span>
      </header>
      {logs === null ? (
        <p className="rm-none">Loading your calls…</p>
      ) : !shown.length ? (
        <section className="rm-card rm-hempty">
          <h2>{kind === 'all' ? 'No calls yet' : 'None of these yet'}</h2>
          <p className="rm-none">Every class, meeting and call you’re in is kept here: who came, when, and for how long.</p>
        </section>
      ) : (
        days.map((list) => (
          <section key={dayKey(list[0].startedAt)} className="rm-card rm-hday" aria-labelledby={'rm-d-' + dayKey(list[0].startedAt).replace(/\W/g, '')}>
            <div className="rm-card-h">
              <h2 id={'rm-d-' + dayKey(list[0].startedAt).replace(/\W/g, '')}>{dayLabel(list[0].startedAt, now)}</h2>
              <span className="hint">
                {list.length} {list.length === 1 ? 'call' : 'calls'}
              </span>
            </div>
            <ul className="rm-list">
              {list.map((l) => (
                <HistoryRow key={l.id} l={l} ctx={ctx} now={now} when="time" />
              ))}
            </ul>
          </section>
        ))
      )}
      {logs && logs.length >= 100 && <p className="rm-none">Showing your latest 100 calls.</p>}
    </>
  );
}

const pct = (part: number | null, whole: number) => (part == null || !whole ? null : Math.round((100 * part) / whole));

// One call: when, who came and for how long, microphone and camera, and who did not come.
export function CallDetail({ id, logs, ctx, now }: { id: string; logs: LogDoc[] | null; ctx: Ctx; now: number }) {
  const listed = logs?.find((l) => l.id === id);
  const fetched = useCallLog(listed ? null : id);
  const l = listed ?? fetched;
  if (l === undefined) return <p className="rm-none">Loading the call…</p>;
  if (l === null)
    return (
      <section className="rm-card rm-hempty">
        <Link className="rm-back" to="/rooms?history">
          <UiIcon name="prev" size={14} /> Call history
        </Link>
        <h2>This call’s record isn’t here</h2>
        <p className="rm-none">It may have been removed, or it isn’t one of your calls.</p>
      </section>
    );
  const cls = l.classId ? ctx.classes.find((c) => c.id === l.classId) : undefined;
  const chat = l.chatId ? ctx.chats?.find((c) => c.id === l.chatId) : undefined;
  const { start, end, live, people } = summarise(l, now);
  const span = Math.max(60000, end - start);
  const learners = people.filter((p) => p.role === 'learner');
  const roster = l.classId ? (ctx.dir?.groups.find((g) => g.id === l.classId)?.people ?? []).filter((p) => p.role === 'learner') : [];
  const absent = roster.filter((p) => !l.people?.[p.key]);
  const avgIn = people.length ? people.reduce((t, p) => t + p.inMs, 0) / people.length : 0;
  const totalIn = people.reduce((t, p) => t + p.inMs, 0);
  const camAll = l.media ? pct(people.reduce((t, p) => t + (p.camMs ?? 0), 0), totalIn) : null;
  const micAll = l.media ? pct(people.reduce((t, p) => t + (p.micMs ?? 0), 0), totalIn) : null;
  const cutOff = !live && people.some((p) => (l.people[p.key]?.spans ?? []).some((s) => s.out == null));
  const pos = (t: number) => `${(100 * (t - start)) / span}%`;
  const wid = (a: number, b: number) => `${(100 * Math.max(0, b - a)) / span}%`;
  const color = cls ? theme(cls.themeColor).accent : undefined;
  const ticks = [start, start + span / 2, start + span];

  return (
    <div className="rm-detail" style={color ? ({ ['--ev' as string]: color } as CSSProperties) : undefined}>
      <header className="rm-head">
        <span className="rm-head-t">
          <Link className="rm-back" to="/rooms?history">
            <UiIcon name="prev" size={14} /> Call history
          </Link>
          <span className="rm-kicker rm-dk">
            {live && <span className="vc-live" aria-hidden="true" />} {KIND[l.kind].label} · {dayLabel(start, now)}
          </span>
          <h1 className="rm-title">{l.title || KIND[l.kind].label}</h1>
          <span className="rm-date">
            {timeText(start)} to {live ? 'now' : timeText(end)} · {durText(end - start)}
            {cls ? ` · ${cls.name}` : ''} · started by {l.startedByName}
          </span>
        </span>
        <span className="rm-acts">
          {chat && !live && (
            <button type="button" className="btn" disabled={!!ctx.calling} onClick={() => ctx.onCall(chat.id, 'video', chat)}>
              <UiIcon name="video" size={16} /> Call again
            </button>
          )}
          <button type="button" className="btn primary" onClick={() => downloadCsv(`${l.title || 'Call'} ${new Date(start).toISOString().slice(0, 10)}`, attendanceCsv(l, now))}>
            <UiIcon name="import" size={16} /> Download attendance
          </button>
        </span>
      </header>

      <div className="rm-stats">
        <Stat k={l.kind === 'class' && cls?.learnerCount ? 'Learners came' : 'People'} v={l.kind === 'class' && cls?.learnerCount ? `${learners.length} of ${cls.learnerCount}` : String(people.length)} />
        <Stat k="Average time in" v={durText(avgIn)} />
        {l.media ? (
          <>
            <Stat k="Camera on" v={camAll == null ? 'None' : `${camAll}%`} sub="of the time in the call" />
            <Stat k="Microphone on" v={micAll == null ? 'None' : `${micAll}%`} sub="of the time in the call" />
          </>
        ) : (
          <Stat k="Microphone and camera" v="Not kept" sub="Your organisation turned this off" />
        )}
      </div>

      <section className="rm-card rm-tl" aria-labelledby="rm-tl-h">
        <div className="rm-card-h">
          <h2 id="rm-tl-h">Who was there, and when</h2>
          <span className="rm-legend" aria-hidden="true">
            <i className="lg-in" /> In the call
            {l.media && (
              <>
                <i className="lg-cam" /> Camera on <i className="lg-mic" /> Microphone on
              </>
            )}
          </span>
        </div>
        <div className="rm-tl-axis" aria-hidden="true">
          <span />
          <span className="rm-tl-ticks">
            {ticks.map((t, i) => (
              <span key={i} style={{ left: pos(t) }}>
                {timeText(t)}
              </span>
            ))}
          </span>
        </div>
        <ul className="rm-tl-rows">
          {people.map((p) => (
            <li key={p.key} className="rm-tl-row">
              <span className="rm-tl-who">
                <b>{p.name}</b>
                <span className="hint">{roleText(p)}</span>
              </span>
              <span className="rm-tl-track" role="img" aria-label={trackText(p, l.media)}>
                {p.spans.map(([a, b], i) => (
                  <i key={'s' + i} className="tl-in" style={{ left: pos(a), width: wid(a, b) }} />
                ))}
                {p.cam.map(([a, b], i) => (
                  <i key={'c' + i} className="tl-cam" style={{ left: pos(a), width: wid(a, b) }} />
                ))}
                {p.mic.map(([a, b], i) => (
                  <i key={'m' + i} className="tl-mic" style={{ left: pos(a), width: wid(a, b) }} />
                ))}
              </span>
            </li>
          ))}
        </ul>
        {!people.length && <p className="rm-none">Nobody was recorded in this call.</p>}
      </section>

      <section className="rm-card" aria-labelledby="rm-att-h">
        <div className="rm-card-h">
          <h2 id="rm-att-h">Attendance</h2>
        </div>
        <div className="rm-table-wrap" role="region" aria-labelledby="rm-att-h" tabIndex={0}>
          <table className="rm-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Joined</th>
                <th scope="col">Left</th>
                <th scope="col">Time in</th>
                <th scope="col">Times joined</th>
                {l.media && <th scope="col">Microphone on</th>}
                {l.media && <th scope="col">Camera on</th>}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.key}>
                  <th scope="row">
                    <b>{p.name}</b>
                    <span className="hint">{roleText(p)}</span>
                  </th>
                  <td>{timeText(p.first)}</td>
                  <td>{p.open ? 'Still in' : timeText(p.last)}</td>
                  <td>{durText(p.inMs)}</td>
                  <td>{p.joins}</td>
                  {l.media && <td>{durText(p.micMs ?? 0)}</td>}
                  {l.media && <td>{durText(p.camMs ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {absent.length > 0 && (
          <div className="rm-absent">
            <b>Didn’t join</b>
            <span className="rm-chips">
              {absent.map((p) => (
                <span key={p.key} className="rm-chip">
                  {p.name}
                </span>
              ))}
            </span>
          </div>
        )}
        {cutOff && <p className="rm-note">Someone’s browser closed without saving at the end, so their time ends at the record’s last save, {timeText(l.savedAt)}.</p>}
      </section>
    </div>
  );
}

const roleText = (p: PersonSummary) => (p.role === 'teacher' ? 'Teacher' : p.role === 'learner' ? 'Learner' : 'Guest') + (p.open ? ' · in the call now' : '');
function trackText(p: PersonSummary, media: boolean) {
  const parts = [`${p.name}: in the call ${durText(p.inMs)}, joined ${p.joins === 1 ? 'once' : `${p.joins} times`}, from ${timeText(p.first)} to ${p.open ? 'now' : timeText(p.last)}`];
  if (media) parts.push(`camera on ${minsOf(p.camMs ?? 0)} min, microphone on ${minsOf(p.micMs ?? 0)} min`);
  return parts.join('; ');
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rm-stat">
      <span className="rm-stat-k">{k}</span>
      <b>{v}</b>
      {sub && <span className="hint">{sub}</span>}
    </div>
  );
}
