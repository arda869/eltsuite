import { tell } from '../lib/ask';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ClassDoc, Item } from '../lib/classes';
import type { Learner } from '../lib/learners';
import { isOnline, usePresence } from '../lib/presence';
import { itemResult, minutesOf, STATUS_LABEL, useAttendance, useMyAnswers } from '../lib/reports';
import { useMistakes } from '../lib/mistakes';
import { useLearnerAvatars } from '../lib/avatars';
import { ago, useLearnerTimeline, type Activity } from '../lib/activity';
import { openAsLearner } from '../lib/proxy';
import { Avatar } from './avatars';
import { UiIcon } from './UiIcon';
import { ReportDownload } from './ReportDownload';
import type { Report } from '../lib/reportFiles';

// Everything one learner has done: whether they are here now, how they are doing, and a
// timeline of their work, live lessons, discussion posts and files.

const TYPE_LABEL: Record<Item['type'], string> = { lesson: 'Lesson', homework: 'Homework', exam: 'Exam', practice: 'Practice' };
const KIND: Record<Activity['kind'], { icon: string; label: string }> = {
  submit: { icon: 'check', label: 'Work' },
  check: { icon: 'answers', label: 'Work' },
  work: { icon: 'edit', label: 'Work' },
  live: { icon: 'present', label: 'Live' },
  post: { icon: 'discuss', label: 'Discussion' },
  reply: { icon: 'discuss', label: 'Discussion' },
  file: { icon: 'upload', label: 'Files' },
};
const FILTERS = ['All', 'Work', 'Live', 'Discussion', 'Files'];
const dayOf = (at: number) => {
  const d = new Date(at);
  const t = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
};
const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function LearnerDetail({ c, learner, items, pin, onBack }: { c: ClassDoc; learner: Learner; items: Item[]; pin?: string; onBack: () => void }) {
  const uid = learner.authUid;
  const presence = usePresence(c.id).find((p) => p.id === uid);
  const online = presence ? isOnline(presence) : false;
  const answers = useMyAnswers(c.id, uid);
  const attendance = useAttendance(c.id).filter((a) => a.uid === uid);
  const mistakes = useMistakes(c.id, undefined, true).filter((m) => m.learnerUid === uid && !m.done);
  const { byLearner } = useLearnerAvatars(c.id);
  const timeline = useLearnerTimeline(c.id, uid, learner.id, items);
  const [filter, setFilter] = useState('All');
  const first = learner.displayName.split(' ')[0];

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);
  const results = sortedItems.map((i) => ({ i, r: itemResult(i, answers.filter((a) => a.itemId === i.id)) }));
  const scored = results.filter((x) => x.r.pct !== null);
  const avg = scored.length ? Math.round(scored.reduce((s, x) => s + (x.r.pct ?? 0), 0) / scored.length) : null;
  const handedIn = results.filter((x) => x.r.status === 'submitted' || x.r.status === 'marked').length;
  const assigned = results.filter((x) => x.i.type !== 'lesson').length;
  const minutes = Math.round(attendance.reduce((s, a) => s + minutesOf(a), 0));
  const posts = (timeline ?? []).filter((a) => a.kind === 'post' || a.kind === 'reply').length;
  const lastAt = Math.max(presence?.at?.toMillis?.() ?? 0, timeline?.[0]?.at ?? 0);
  const nowItem = items.find((i) => i.id === presence?.itemId);

  const shown = (timeline ?? []).filter((a) => filter === 'All' || KIND[a.kind].label === filter);
  const days: [string, Activity[]][] = [];
  for (const a of shown) {
    const d = dayOf(a.at);
    if (days[days.length - 1]?.[0] !== d) days.push([d, []]);
    days[days.length - 1][1].push(a);
  }

  const report = (): Report => ({
    title: learner.displayName,
    context: `${c.name} · learner report`,
    summary: [
      ['average', avg === null ? '–' : `${avg}%`],
      ['handed in', `${handedIn}`],
      ['minutes live', String(minutes)],
      ['in the review deck', String(mistakes.length)],
    ],
    columns: ['Item', 'Type', 'Status', 'Score', 'Percent'],
    rows: results.map(({ i, r }) => [i.title, TYPE_LABEL[i.type], STATUS_LABEL[r.status] + (r.late ? ', late' : ''), r.pct === null ? '' : `${r.score} / ${r.total}`, r.pct === null ? '' : `${r.pct}%`]),
    sheets: [
      {
        title: 'Activity',
        context: `${c.name} · ${learner.displayName}`,
        columns: ['Date', 'Time', 'What', 'Where', 'Score'],
        rows: (timeline ?? []).map((a) => [new Date(a.at).toLocaleDateString(), clock(a.at), a.title, a.where ?? '', a.pct == null ? '' : `${a.pct}%`]),
      },
    ],
  });

  return (
    <div className="ld">
      <button type="button" className="btn link ld-back" onClick={onBack}>
        <UiIcon name="prev" size={14} /> All learners
      </button>
      <header className="ld-head">
        <span className="ld-face">
          <Avatar k={byLearner[learner.id] ?? presence?.avatar} name={learner.displayName} size={64} />
          {online && <i className="ld-online" aria-label="Online now" />}
        </span>
        <span className="ld-who">
          <h2>{learner.displayName}</h2>
          {online ? (
            <span className="ld-now">
              <span className="live-dot" aria-hidden="true" />
              <b>Online now</b>
              {nowItem && (
                <>
                  {' · in '}
                  <Link to={`/class/${c.id}/lesson/${nowItem.id}`}>{nowItem.title}</Link>
                </>
              )}
            </span>
          ) : (
            <span className="hint">{lastAt ? `Last active ${ago(lastAt)}` : 'Has not signed in yet'}</span>
          )}
        </span>
        <span className="ld-acts">
          <ReportDownload make={report} disabled={!timeline} label="Report" />
          <button type="button" className="btn small-btn" disabled={!pin} onClick={() => openAsLearner({ classId: c.id, classCode: c.classCode, learnerId: learner.id, name: learner.displayName, pin: pin ?? '' }) || void tell('Your browser blocked the new tab. Allow pop-ups for this site.')}>
            View as {first}
          </button>
        </span>
      </header>

      <div className="ld-stats">
        <span>
          <b>{avg === null ? '–' : `${avg}%`}</b>
          <span>average score</span>
        </span>
        <span>
          <b>
            {handedIn}
            {assigned ? <small> of {assigned}</small> : null}
          </b>
          <span>homework and exams handed in</span>
        </span>
        <span>
          <b>{attendance.length}</b>
          <span>live lessons · {minutes} min</span>
        </span>
        <span>
          <b>{mistakes.length}</b>
          <span>in the review deck</span>
        </span>
        <span>
          <b>{timeline ? posts : '…'}</b>
          <span>discussion posts</span>
        </span>
      </div>

      <div className="ld-body">
        <section className="ld-progress" aria-label="Progress">
          <span className="eyebrow">Lessons and homework</span>
          {results.length === 0 && <span className="hint">Nothing in this class yet.</span>}
          {results.map(({ i, r }) => (
            <Link key={i.id} to={`/class/${c.id}/lesson/${i.id}`} className="ld-item">
              <span className="ld-item-top">
                <span className="rp-type">{TYPE_LABEL[i.type]}</span>
                <span className="ld-item-t">{i.title}</span>
                <span className="ld-item-pct">{r.pct === null ? STATUS_LABEL[r.status] : `${r.pct}%`}</span>
              </span>
              <span className="ld-bar" aria-hidden="true">
                <i style={{ width: `${r.tasksTotal ? Math.round((r.tasksDone / r.tasksTotal) * 100) : 0}%` }} />
              </span>
              <span className="hint">
                {r.tasksDone} of {r.tasksTotal} tasks{r.late ? ' · late' : ''}
              </span>
            </Link>
          ))}
        </section>

        <section className="ld-time" aria-label="Activity">
          <span className="ld-time-top">
            <span className="eyebrow">Activity</span>
            <span className="seg small-seg">
              {FILTERS.map((f) => (
                <button key={f} type="button" className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                  {f}
                </button>
              ))}
            </span>
          </span>
          {timeline === null && <span className="hint">Gathering {first}’s activity…</span>}
          {timeline && !shown.length && <span className="hint">{filter === 'All' ? `${first} has not done anything here yet.` : 'Nothing of this kind yet.'}</span>}
          {days.map(([d, list]) => (
            <div key={d} className="ld-day">
              <span className="ld-day-h">{d}</span>
              {list.map((a, k) => (
                <span key={k} className={'ld-ev k-' + a.kind}>
                  <span className="ld-ev-ic">
                    <UiIcon name={KIND[a.kind].icon} size={14} />
                  </span>
                  <span className="ld-ev-main">
                    <span>
                      <b>{a.title}</b> {a.where && <span className="ld-ev-where">{a.where}</span>}
                    </span>
                    {(a.pct != null || a.late) && (
                      <span className="ld-ev-tags">
                        {a.pct != null && <span className="ld-pct">{a.pct}%</span>}
                        {a.pct === 100 && <span className="ld-tag">Full marks</span>}
                        {a.late && <span className="ld-tag">Late</span>}
                      </span>
                    )}
                  </span>
                  <span className="ld-ev-at">{clock(a.at)}</span>
                </span>
              ))}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
