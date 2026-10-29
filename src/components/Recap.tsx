import { copyText } from '../lib/copyText';
import { useEffect, useMemo, useState } from 'react';
import { getDocs, orderBy, query } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { ClassDoc, Item } from '../lib/classes';
import { tasksCol, type Task } from '../lib/tasks';
import { useNotebook } from '../lib/notebook';
import { useAttendance, useClassAnswers } from '../lib/reports';
import { buildRecaps, parentLink, revokeParentLink, rosterWithUids, saveComment, saveRecaps, shareRecap, useRecaps, type Recap } from '../lib/recap';

const dateText = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// The recap itself, as the learner or a parent sees it.
export function RecapView({ r, learnerLinks }: { r: Omit<Recap, 'uid' | 'learnerId' | 'token'>; learnerLinks?: boolean }) {
  const done = r.tasks.filter((t) => t.done);
  const scored = r.tasks.filter((t) => t.total);
  const score = scored.reduce((s, t) => s + (t.score ?? 0), 0);
  const total = scored.reduce((s, t) => s + (t.total ?? 0), 0);
  return (
    <article className="recap">
      <header className="recap-head">
        <span className="eyebrow accent">Lesson recap · {r.className}</span>
        <h1 className="page-title" style={{ margin: 0 }}>
          {r.lessonTitle}
        </h1>
        <span className="hint">
          {dateText(r.date)} · for {r.name}
          {r.minutes != null ? ` · in class ${r.minutes} min` : ''}
        </span>
      </header>
      {r.comment && (
        <section className="recap-sec recap-comment">
          <span className="eyebrow">From {r.teacherName}</span>
          <p>{r.comment}</p>
        </section>
      )}
      <section className="recap-sec">
        <span className="eyebrow">What we did</span>
        <ul className="recap-tasks">
          {r.tasks.map((t, i) => (
            <li key={t.id} className={t.done ? '' : 'skipped'}>
              <span className="recap-n">{i + 1}</span>
              <span className="recap-t">{t.title}</span>
              <span className="recap-s">{t.total ? `${t.score} / ${t.total}` : t.done ? 'done' : 'not done'}</span>
            </li>
          ))}
        </ul>
        {total > 0 && (
          <span className="hint">
            {done.length} of {r.tasks.length} tasks · {score} of {total} points ({Math.round((score / total) * 100)}%)
          </span>
        )}
      </section>
      {r.vocab.length > 0 && (
        <section className="recap-sec">
          <span className="eyebrow">New words</span>
          <ul className="recap-vocab">
            {r.vocab.map((v, i) => (
              <li key={i}>
                <strong>{v.word}</strong>
                {v.meaning && <span> · {v.meaning}</span>}
                {v.example && <em className="recap-ex">{v.example}</em>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {r.homework.length > 0 && (
        <section className="recap-sec">
          <span className="eyebrow">Homework</span>
          <ul className="recap-hw">
            {r.homework.map((h) => (
              <li key={h.id}>
                {learnerLinks ? <Link to={`/learn/${h.id}`}>{h.title}</Link> : <span>{h.title}</span>}
                {h.due && <span className="hint"> · due {new Date(h.due).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

// Teacher: review the drafts, add a comment, share.
export function RecapDialog({ c, item, items, onClose }: { c: ClassDoc; item: Item; items: Item[]; onClose: () => void }) {
  const { user } = useAuth();
  const me = useMemo(() => (user ? { uid: user.uid, name: (user.displayName || 'Teacher').split(' ')[0], teacher: true } : null), [user]);
  const existing = useRecaps(c.id, item.id);
  const answers = useClassAnswers(c.id);
  const attendance = useAttendance(c.id);
  const entries = useNotebook(c.id, me);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [roster, setRoster] = useState<{ id: string; name: string; uid: string }[] | null>(null);
  const [sel, setSel] = useState('');
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState('');
  useEffect(() => {
    getDocs(query(tasksCol(c.id, item.id), orderBy('order'))).then((s) => setTasks(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) }))));
    rosterWithUids(c.id).then(setRoster);
  }, [c.id, item.id]);
  const drafts = useMemo(
    () => (tasks && roster && me ? buildRecaps({ classId: c.id, className: c.name, item, tasks, roster, answers, entries, attendance, items, teacherName: me.name }, existing) : null),
    [tasks, roster, me, c.id, c.name, item, answers, entries, attendance, items, existing],
  );
  const list = drafts ?? [];
  const cur = list.find((r) => r.id === sel) ?? list[0];
  useEffect(() => {
    setComment(cur?.comment ?? '');
    setLink('');
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = (r: Recap) => existing[r.id];
  const shared = list.filter((r) => saved(r)?.status === 'shared').length;

  const persist = async (rs: Recap[]) => saveRecaps(c.id, rs.map((r) => ({ ...r, comment: r.id === cur?.id ? comment : r.comment })));
  const keepComment = async () => {
    if (!cur) return;
    await persist([cur]);
    await saveComment(c.id, cur.id, comment);
  };
  const share = async (all: boolean) => {
    const rs = all ? list : cur ? [cur] : [];
    setMsg('Sharing…');
    await persist(rs);
    for (const r of rs) await shareRecap(c.id, { ...r, comment: r.id === cur?.id ? comment : r.comment }, true);
    setMsg(all ? `Shared with ${rs.length} learners.` : `Shared with ${cur?.name}.`);
  };
  const unshare = async () => {
    if (!cur) return;
    await shareRecap(c.id, cur, false);
    setMsg(`Hidden from ${cur.name} again.`);
  };
  const parent = async () => {
    if (!cur) return;
    await persist([cur]);
    const url = await parentLink(c.id, { ...cur, comment });
    setLink(url);
    try {
      await copyText(url);
      setMsg('Link copied. Anyone with it can read this recap, so share it privately.');
    } catch {
      setMsg('Copy the link below and share it privately.');
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog wide recap-dialog" role="dialog" aria-label="Lesson recap" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 style={{ margin: 0 }}>Recap · {item.title}</h2>
          <span className="hint">
            {shared} of {list.length} shared
          </span>
        </div>
        {!drafts ? (
          <span className="hint">Putting the recaps together…</span>
        ) : !list.length ? (
          <span className="hint">No learners in this class yet.</span>
        ) : (
          <div className="recap-grid">
            <ul className="recap-people" role="tablist" aria-label="Learners">
              {list.map((r) => (
                <li key={r.id}>
                  <button type="button" role="tab" aria-selected={cur?.id === r.id} className={cur?.id === r.id ? 'on' : ''} onClick={() => setSel(r.id)}>
                    <span>{r.name}</span>
                    <span className="hint">{saved(r)?.status === 'shared' ? 'Shared' : saved(r)?.comment ? 'Draft' : r.tasks.some((t) => t.done) ? '' : 'Absent?'}</span>
                  </button>
                </li>
              ))}
            </ul>
            {cur && (
              <div className="recap-edit">
                <label className="field">
                  <span>Your comment for {cur.name.split(' ')[0]}</span>
                  <textarea value={comment} rows={3} placeholder="For example: Great work on the past simple today. Watch the -ed endings in your writing." onChange={(e) => setComment(e.target.value)} onBlur={keepComment} />
                </label>
                <div className="recap-preview">
                  <RecapView r={{ ...cur, comment }} />
                </div>
              </div>
            )}
          </div>
        )}
        {msg && <span className="hint">{msg}</span>}
        {link && (
          <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Parent link" />
        )}
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          {cur && (
            <>
              <button type="button" className="btn" onClick={parent} title="A private read-only link for a parent. No sign-in needed.">
                Parent link
              </button>
              {saved(cur)?.token && (
                <button type="button" className="btn link small" onClick={() => revokeParentLink(c.id, saved(cur)!).then(() => (setLink(''), setMsg('The parent link no longer works.')))}>
                  Stop the link
                </button>
              )}
              {saved(cur)?.status === 'shared' ? (
                <button type="button" className="btn" onClick={unshare}>
                  Unshare
                </button>
              ) : (
                <button type="button" className="btn" onClick={() => share(false)}>
                  Share with {cur.name.split(' ')[0]}
                </button>
              )}
            </>
          )}
          <button type="button" className="btn primary" disabled={!list.length} onClick={() => share(true)}>
            Share with everyone
          </button>
        </span>
      </div>
    </div>
  );
}
