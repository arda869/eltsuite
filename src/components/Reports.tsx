import { NSelect } from './Select';
import { useMemo, useState } from 'react';
import type { ClassDoc, Item } from '../lib/classes';
import type { Learner } from '../lib/learners';
import { addAttendance, correctAttendance, itemResult, minutesOf, STATUS_LABEL, useAttendance, useClassAnswers, type Status } from '../lib/reports';
import { useMistakes } from '../lib/mistakes';
import { discussionSettings, participation } from '../lib/discussion';
import { useEffect } from 'react';
import { ReportDownload } from './ReportDownload';
import type { Report } from '../lib/reportFiles';

// Reports for the teacher: the class across every item, one learner across everything,
// one item across the class, attendance, and the mistake areas. Scores are percentages so
// versions and tasks of different lengths compare.

const TYPE_LABEL: Record<Item['type'], string> = { lesson: 'Lesson', homework: 'Homework', exam: 'Exam', practice: 'Practice' };
const when = (ms?: number) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

function StatusTag({ s, late }: { s: Status; late?: boolean }) {
  return (
    <span className={'rp-status s-' + s}>
      {STATUS_LABEL[s]}
      {late ? ' · late' : ''}
    </span>
  );
}
function Pct({ v }: { v: number | null }) {
  return v === null ? <span className="hint">–</span> : <span className={'rp-pct' + (v >= 80 ? ' good' : v < 50 ? ' low' : '')}>{v}%</span>;
}

export function Reports({ c, items, learners, initialItem }: { c: ClassDoc; items: Item[]; learners: Learner[]; initialItem?: Item | null }) {
  const answers = useClassAnswers(c.id);
  const attendance = useAttendance(c.id);
  const mistakes = useMistakes(c.id, undefined, true);
  const [view, setView] = useState<'class' | 'learner' | 'item' | 'attendance' | 'mistakes' | 'discussion'>(initialItem ? 'item' : 'class');
  const [learnerId, setLearnerId] = useState('');
  const [itemId, setItemId] = useState(initialItem?.id ?? '');
  const [type, setType] = useState<'' | Item['type']>('');
  const list = useMemo(() => items.filter((i) => !type || i.type === type).sort((a, b) => a.order - b.order), [items, type]);
  const roster = [...learners].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const byLearner = (uid: string) => answers.filter((a) => a.learnerUid === uid);
  const avg = (uid: string) => {
    const rs = list.map((i) => itemResult(i, byLearner(uid))).filter((r) => r.pct !== null);
    return rs.length ? Math.round(rs.reduce((s, r) => s + (r.pct ?? 0), 0) / rs.length) : null;
  };
  const attendanceOf = (uid: string) => attendance.filter((a) => a.uid === uid);
  const liveItems = items.filter((i) => attendance.some((a) => a.itemId === i.id)).sort((a, b) => a.order - b.order);

  const classAvg = () => {
    const v = roster.map((l) => avg(l.authUid)).filter((x): x is number => x !== null);
    return v.length ? `${Math.round(v.reduce((x, y) => x + y, 0) / v.length)}%` : '–';
  };
  const classReport = (): Report => ({
    title: type ? `${TYPE_LABEL[type]} report` : 'Class report',
    context: c.name,
    summary: [
      ['learners', String(roster.length)],
      ['items', String(list.length)],
      ['class average', classAvg()],
    ],
    columns: ['Learner', 'Average', ...list.map((i) => `${i.title} (${TYPE_LABEL[i.type]})`), 'Live lessons', 'Minutes'],
    rows: roster.map((l) => {
      const rs = list.map((i) => itemResult(i, byLearner(l.authUid)));
      const att = attendanceOf(l.authUid);
      const a = avg(l.authUid);
      return [l.displayName, a === null ? '' : `${a}%`, ...rs.map((r) => (r.pct === null ? STATUS_LABEL[r.status] : `${r.pct}%${r.late ? ' late' : ''}`)), att.length, Math.round(att.reduce((s2, x) => s2 + minutesOf(x), 0))];
    }),
    note: 'Scores are percentages, so versions and tasks of different lengths compare.',
  });
  const learnerReport = (uid: string): Report => {
    const l = roster.find((x) => x.authUid === uid);
    const a = avg(uid);
    const att = attendanceOf(uid);
    return {
      title: l?.displayName ?? 'Learner',
      context: `${c.name} · learner report`,
      summary: [
        ['average', a === null ? '–' : `${a}%`],
        ['live lessons', String(att.length)],
        ['minutes live', String(Math.round(att.reduce((s2, x) => s2 + minutesOf(x), 0)))],
        ['in the review deck', String(mistakes.filter((m) => m.learnerUid === uid && !m.done).length)],
      ],
      columns: ['Item', 'Type', 'Status', 'Score', 'Percent', 'Submitted'],
      rows: list.map((i) => {
        const r = itemResult(i, byLearner(uid));
        return [i.title, TYPE_LABEL[i.type], STATUS_LABEL[r.status] + (r.late ? ', late' : ''), r.pct === null ? '' : `${r.score} / ${r.total}`, r.pct === null ? '' : `${r.pct}%`, when(r.submittedAt)];
      }),
    };
  };
  const itemReport = (item: Item): Report => {
    const rs = roster.map((l) => ({ l, r: itemResult(item, byLearner(l.authUid)) }));
    const withPct = rs.filter((x) => x.r.pct !== null);
    const mean = withPct.length ? Math.round(withPct.reduce((s2, x) => s2 + (x.r.pct ?? 0), 0) / withPct.length) : null;
    return {
      title: item.title,
      context: `${c.name} · ${TYPE_LABEL[item.type]}`,
      summary: [
        ['submitted', `${rs.filter((x) => x.r.status === 'submitted' || x.r.status === 'marked').length} of ${roster.length}`],
        ['class average', mean === null ? '–' : `${mean}%`],
        ...(item.due ? ([['late', String(rs.filter((x) => x.r.late).length)]] as [string, string][]) : []),
      ],
      columns: ['Learner', 'Status', 'Tasks done', 'Score', 'Percent', 'Submitted'],
      rows: rs.map(({ l, r }) => [l.displayName, STATUS_LABEL[r.status] + (r.late ? ', late' : ''), `${r.tasksDone} of ${r.tasksTotal}`, r.pct === null ? '' : `${r.score} / ${r.total}`, r.pct === null ? '' : `${r.pct}%`, when(r.submittedAt)]),
    };
  };
  const attendanceReport = (): Report => ({
    title: 'Attendance',
    context: c.name,
    summary: [
      ['live lessons', String(liveItems.length)],
      ['learners', String(roster.length)],
    ],
    columns: ['Learner', ...liveItems.map((i) => i.title), 'Total minutes'],
    rows: roster.map((l) => {
      const mins = liveItems.map((i) => Math.round(minutesOf(attendanceOf(l.authUid).find((a) => a.itemId === i.id) ?? ({ minutes: 0 } as never))));
      return [l.displayName, ...mins, mins.reduce((x, y) => x + y, 0)];
    }),
    note: 'Minutes each learner was in the lesson while it was live.',
  });
  const mistakesReport = (): Report => {
    const open = mistakes.filter((m) => !m.done);
    const name = (id: string) => items.find((i) => i.id === id)?.title ?? 'a lesson';
    return {
      title: 'Mistake areas',
      context: c.name,
      summary: [['questions in review decks', String(open.length)]],
      columns: ['Learner', 'In the review deck', 'Most often from'],
      rows: roster.map((l) => {
        const mine = open.filter((m) => m.learnerUid === l.authUid);
        const bi = new Map<string, number>();
        mine.forEach((m) => bi.set(m.itemId, (bi.get(m.itemId) ?? 0) + m.wrongCount));
        const first = [...bi.entries()].sort((x, y) => y[1] - x[1])[0];
        return [l.displayName, mine.length, first ? name(first[0]) : ''];
      }),
    };
  };

  return (
    <div className="rp">
      <div className="rp-bar">
        <span className="seg small-seg rp-views" role="tablist">
          {(
            [
              ['class', 'Class'],
              ['learner', 'One learner'],
              ['item', 'One item'],
              ['attendance', 'Attendance'],
              ['mistakes', 'Mistake areas'],
              ...(discussionSettings(c).track ? [['discussion', 'Discussion'] as const] : []),
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </span>
        {(view === 'class' || view === 'learner') && (
          <NSelect value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Type">
            <option value="">Everything</option>
            {(['lesson', 'homework', 'exam', 'practice'] as const).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}s
              </option>
            ))}
          </NSelect>
        )}
      </div>

      {view === 'class' && (
        <>
          <div className="rp-scroll">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Average</th>
                  {list.map((i) => (
                    <th key={i.id} title={i.title}>
                      <button type="button" className="rp-th" onClick={() => (setItemId(i.id), setView('item'))}>
                        <span className="rp-type">{TYPE_LABEL[i.type]}</span>
                        {i.title}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <button type="button" className="rp-name" onClick={() => (setLearnerId(l.authUid), setView('learner'))}>
                        {l.displayName}
                      </button>
                    </td>
                    <td>
                      <Pct v={avg(l.authUid)} />
                    </td>
                    {list.map((i) => {
                      const r = itemResult(i, byLearner(l.authUid));
                      return (
                        <td key={i.id} title={`${STATUS_LABEL[r.status]}${r.late ? ' · late' : ''}`}>
                          {r.pct === null ? <span className={'rp-dot s-' + r.status} aria-label={STATUS_LABEL[r.status]} /> : <Pct v={r.pct} />}
                          {r.late && <span className="rp-late">late</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="rp-foot">
            <span className="hint">Scores are percentages, so versions and tasks of different lengths compare. A dot means not started (grey), in progress (orange) or submitted with nothing to mark automatically.</span>
            <ReportDownload make={classReport} />
          </span>
        </>
      )}

      {view === 'learner' && (
        <>
          <NSelect value={learnerId} onChange={(e) => setLearnerId(e.target.value)} aria-label="Learner" className="rp-pick">
            <option value="">Choose a learner</option>
            {roster.map((l) => (
              <option key={l.id} value={l.authUid}>
                {l.displayName}
              </option>
            ))}
          </NSelect>
          {learnerId && (
            <>
              <span className="rp-summary">
                <span>
                  <strong>
                    <Pct v={avg(learnerId)} />
                  </strong>{' '}
                  average
                </span>
                <span>
                  <strong>{attendanceOf(learnerId).length}</strong> live lessons · <strong>{Math.round(attendanceOf(learnerId).reduce((s, a) => s + minutesOf(a), 0))}</strong> min
                </span>
                <span>
                  <strong>{mistakes.filter((m) => m.learnerUid === learnerId && !m.done).length}</strong> questions in their review deck
                </span>
                <ReportDownload make={() => learnerReport(learnerId)} />
              </span>
              <table className="rp-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => {
                    const r = itemResult(i, byLearner(learnerId));
                    return (
                      <tr key={i.id}>
                        <td>
                          <span className="rp-type">{TYPE_LABEL[i.type]}</span> {i.title}
                        </td>
                        <td>
                          <StatusTag s={r.status} late={r.late} />
                        </td>
                        <td>{r.pct === null ? <span className="hint">–</span> : <>{r.score} / {r.total} · <Pct v={r.pct} /></>}</td>
                        <td className="hint">{when(r.submittedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      {view === 'item' && (
        <>
          <NSelect value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Item" className="rp-pick">
            <option value="">Choose a lesson, homework, exam or practice</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {TYPE_LABEL[i.type]} · {i.title}
              </option>
            ))}
          </NSelect>
          {itemId &&
            (() => {
              const item = items.find((i) => i.id === itemId)!;
              const rs = roster.map((l) => ({ l, r: itemResult(item, byLearner(l.authUid)) }));
              const done = rs.filter((x) => x.r.status === 'submitted' || x.r.status === 'marked').length;
              const withPct = rs.filter((x) => x.r.pct !== null);
              const mean = withPct.length ? Math.round(withPct.reduce((s, x) => s + (x.r.pct ?? 0), 0) / withPct.length) : null;
              return (
                <>
                  <span className="rp-summary">
                    <span>
                      <strong>{done}</strong> of {roster.length} submitted
                    </span>
                    {item.due && (
                      <span>
                        Due <strong>{new Date(item.due).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong> · {rs.filter((x) => x.r.late).length} late
                      </span>
                    )}
                    <span>
                      Class average <strong>{mean === null ? '–' : `${mean}%`}</strong>
                    </span>
                    <ReportDownload make={() => itemReport(item)} />
                  </span>
                  <table className="rp-table">
                    <thead>
                      <tr>
                        <th>Learner</th>
                        <th>Status</th>
                        <th>Tasks</th>
                        <th>Score</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rs.map(({ l, r }) => (
                        <tr key={l.id}>
                          <td>{l.displayName}</td>
                          <td>
                            <StatusTag s={r.status} late={r.late} />
                          </td>
                          <td className="hint">
                            {r.tasksDone} of {r.tasksTotal}
                          </td>
                          <td>{r.pct === null ? <span className="hint">–</span> : <>{r.score} / {r.total} · <Pct v={r.pct} /></>}</td>
                          <td className="hint">{when(r.submittedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              );
            })()}
        </>
      )}

      {view === 'attendance' && (
        <>
          {liveItems.length === 0 ? (
            <p className="hint">Attendance is recorded automatically while you teach live. Nothing yet.</p>
          ) : (
            <div className="rp-scroll">
              <table className="rp-table">
                <thead>
                  <tr>
                    <th>Learner</th>
                    {liveItems.map((i) => (
                      <th key={i.id}>{i.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((l) => (
                    <tr key={l.id}>
                      <td>{l.displayName}</td>
                      {liveItems.map((i) => {
                        const a = attendanceOf(l.authUid).find((x) => x.itemId === i.id);
                        return (
                          <td key={i.id}>
                            <AttendanceCell classId={c.id} a={a} onAdd={() => addAttendance(c.id, i.id, { id: l.id, uid: l.authUid, name: l.displayName }, 60)} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <span className="rp-foot">
            <span className="hint">Minutes a learner was in the lesson while it was live. Click a number to correct it.</span>
            <ReportDownload make={attendanceReport} disabled={!liveItems.length} />
          </span>
        </>
      )}

      {view === 'mistakes' && (
        <>
          <MistakeAreas learners={roster} items={items} mistakes={mistakes} />
          <span className="rp-foot">
            <span className="hint">Wrong answers in homework and practice, still in each learner’s review deck.</span>
            <ReportDownload make={mistakesReport} />
          </span>
        </>
      )}
      {view === 'discussion' && <Participation c={c} learners={roster.map((l) => ({ id: l.id, name: l.displayName }))} />}
    </div>
  );
}

function AttendanceCell({ classId, a, onAdd }: { classId: string; a?: { id: string; itemId: string; learnerId: string; uid: string; day: string; firstAt: number; lastAt: number; minutes: number; corrected?: number | null; note?: string }; onAdd: () => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');
  if (!a)
    return (
      <button type="button" className="rp-absent" title="Not recorded. Click to mark present (60 min)" onClick={onAdd}>
        –
      </button>
    );
  const m = Math.round(minutesOf(a));
  if (editing)
    return (
      <input
        className="rp-min"
        autoFocus
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
        onBlur={() => (correctAttendance(classId, a as never, v === '' ? null : Number(v), v === '' ? '' : 'corrected by the teacher'), setEditing(false))}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    );
  return (
    <button type="button" className={'rp-min-btn' + (a.corrected != null ? ' corrected' : '')} title={(a.note ? a.note + ' · ' : '') + 'Click to correct'} onClick={() => (setV(String(m)), setEditing(true))}>
      {m} min
    </button>
  );
}

function MistakeAreas({ learners, items, mistakes }: { learners: Learner[]; items: Item[]; mistakes: { learnerUid: string; itemId: string; type: string; done?: boolean; wrongCount: number }[] }) {
  const open = mistakes.filter((m) => !m.done);
  const byItem = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const m of open) {
    byItem.set(m.itemId, (byItem.get(m.itemId) ?? 0) + m.wrongCount);
    byType.set(m.type, (byType.get(m.type) ?? 0) + m.wrongCount);
  }
  const top = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const name = (id: string) => items.find((i) => i.id === id)?.title ?? 'a lesson';
  return (
    <div className="rp-mist">
      {open.length === 0 && <p className="hint">No mistakes recorded yet. Wrong answers in homework and practice go into each learner’s review deck.</p>}
      {open.length > 0 && (
        <div className="rp-mist-cols">
          <div>
            <span className="eyebrow">Where the class slips most</span>
            {top(byItem).map(([id, n]) => (
              <span key={id} className="rp-mist-row">
                <span>{name(id)}</span>
                <strong>{n}</strong>
              </span>
            ))}
          </div>
          <div>
            <span className="eyebrow">By question type</span>
            {top(byType).map(([t, n]) => (
              <span key={t} className="rp-mist-row">
                <span>{t}</span>
                <strong>{n}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
      <table className="rp-table">
        <thead>
          <tr>
            <th>Learner</th>
            <th>In the review deck</th>
            <th>Most often from</th>
          </tr>
        </thead>
        <tbody>
          {learners.map((l) => {
            const mine = open.filter((m) => m.learnerUid === l.authUid);
            const bi = new Map<string, number>();
            mine.forEach((m) => bi.set(m.itemId, (bi.get(m.itemId) ?? 0) + m.wrongCount));
            const first = top(bi)[0];
            return (
              <tr key={l.id}>
                <td>{l.displayName}</td>
                <td>{mine.length}</td>
                <td className="hint">{first ? name(first[0]) : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


// Posts and replies per learner on the discussion board.
function Participation({ c, learners }: { c: ClassDoc; learners: { id: string; name: string }[] }) {
  const [counts, setCounts] = useState<Record<string, { threads: number; replies: number; name: string }> | null>(null);
  useEffect(() => {
    participation(c.id).then(setCounts, () => setCounts({}));
  }, [c.id]);
  if (!counts) return <p className="hint">Counting…</p>;
  const rows = learners.map((l) => ({ name: l.name, threads: counts[l.id]?.threads ?? 0, replies: counts[l.id]?.replies ?? 0 })).sort((a, b) => b.threads + b.replies - (a.threads + a.replies));
  return (
    <div className="rp-section">
      <div className="row-between">
        <span className="hint">Threads started and replies written on the class discussion board.</span>
        <ReportDownload make={() => ({ title: 'Discussion', context: c.name, summary: [['posts and replies', String(rows.reduce((x, r) => x + r.threads + r.replies, 0))]], columns: ['Learner', 'Threads', 'Replies', 'Total'], rows: rows.map((r) => [r.name, r.threads, r.replies, r.threads + r.replies]) })} />
      </div>
      <table className="rp-table">
        <thead>
          <tr>
            <th>Learner</th>
            <th>Threads</th>
            <th>Replies</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.threads}</td>
              <td>{r.replies}</td>
              <td>{r.threads + r.replies}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
