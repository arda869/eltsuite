import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ClassDoc } from '../lib/classes';
import { DEFAULT_CODES, useAnnotations } from '../lib/annotations';
import { notify } from '../lib/notices';
import {
  approvePost,
  canPost,
  canStart,
  clearReports,
  deletePost,
  deleteThread,
  discussionSettings,
  editPost,
  editThread,
  findMentions,
  isUnread,
  markSeen,
  muteLearner,
  react,
  readSeen,
  reply,
  report,
  saveDiscussionSettings,
  setPost,
  startThread,
  usePosts,
  useThread,
  useThreads,
  REACTIONS,
  type Me,
  type Post,
  type Reactions,
  type Thread,
} from '../lib/discussion';
import { AnnotationLayer } from './AnnotationLayer';
import { MentionTag } from '../editor/Mention';

type Person = { uid: string; name: string; learnerId?: string };
const ago = (ms: number) => {
  const d = Date.now() - ms;
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)} min ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)} h ago`;
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const IMG = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;

// Plain text with links, pictures by URL and @mentions.
export function PostBody({ text, people, me }: { text: string; people: Person[]; me?: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+|@[\p{L}][\p{L}']*)/gu);
  const nodes: ReactNode[] = [];
  parts.forEach((p, i) => {
    if (/^https?:\/\//.test(p)) {
      const clean = p.replace(/[.,;:!?)]+$/, '');
      const tail = p.slice(clean.length);
      nodes.push(
        IMG.test(clean) ? (
          <a key={i} href={clean} target="_blank" rel="noopener noreferrer" className="post-img-link">
            <img src={clean} alt="" loading="lazy" referrerPolicy="no-referrer" />
          </a>
        ) : (
          <a key={i} href={clean} target="_blank" rel="noopener noreferrer">
            {clean.replace(/^https?:\/\//, '').slice(0, 60)}
          </a>
        ),
        tail,
      );
    } else if (p.startsWith('@')) {
      const uids = findMentions(p, people);
      nodes.push(uids.length ? <MentionTag key={i} label={p.slice(1)} me={!!me && uids.includes(me)} /> : p);
    } else nodes.push(p);
  });
  return <>{nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</>;
}

function ReactionBar({ reactions = {}, me, onToggle, small }: { reactions?: Reactions; me: string; onToggle: (emoji: string, on: boolean) => void; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const used = Object.entries(reactions).filter(([, u]) => u.length);
  return (
    <span className={'rx' + (small ? ' small' : '')}>
      {used.map(([e, u]) => (
        <button key={e} type="button" className={'rx-chip' + (u.includes(me) ? ' on' : '')} onClick={() => onToggle(e, !u.includes(me))} aria-pressed={u.includes(me)} title={`${u.length}`}>
          {e} {u.length}
        </button>
      ))}
      <span className="rx-add">
        <button type="button" className="rx-chip rx-plus" aria-label="Add a reaction" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          +
        </button>
        {open && (
          <span className="rx-pick" onMouseLeave={() => setOpen(false)}>
            {REACTIONS.map((e) => (
              <button key={e} type="button" onClick={() => (onToggle(e, !(reactions[e] ?? []).includes(me)), setOpen(false))}>
                {e}
              </button>
            ))}
          </span>
        )}
      </span>
    </span>
  );
}

// A box for writing a post, with @mention suggestions.
function Composer({ people, placeholder, onSend, busy, autoFocus, submitLabel = 'Post', onCancel, initial = '' }: { people: Person[]; placeholder: string; onSend: (text: string, mentions: string[]) => Promise<void> | void; busy?: boolean; autoFocus?: boolean; submitLabel?: string; onCancel?: () => void; initial?: string }) {
  const [text, setText] = useState(initial);
  const [sug, setSug] = useState<Person[]>([]);
  const ta = useRef<HTMLTextAreaElement>(null);
  const onChange = (v: string) => {
    setText(v);
    const m = /@([\p{L}']{0,20})$/u.exec(v.slice(0, ta.current?.selectionStart ?? v.length));
    setSug(m ? people.filter((p) => p.name.toLowerCase().startsWith(m[1].toLowerCase())).slice(0, 6) : []);
  };
  const pick = (p: Person) => {
    const pos = ta.current?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@([\p{L}']{0,20})$/u, '@' + p.name.split(' ')[0] + ' ');
    setText(before + text.slice(pos));
    setSug([]);
    ta.current?.focus();
  };
  const send = async () => {
    if (!text.trim()) return;
    await onSend(text, findMentions(text, people));
    setText('');
  };
  return (
    <div className="composer">
      <textarea ref={ta} value={text} rows={3} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && send()} />
      {sug.length > 0 && (
        <span className="mention-sug">
          {sug.map((p) => (
            <button key={p.uid} type="button" onClick={() => pick(p)}>
              @{p.name}
            </button>
          ))}
        </span>
      )}
      <span className="composer-foot">
        <span className="hint">Links and picture addresses show as links and pictures. Type @ to mention someone. ⌘⏎ to post.</span>
        <span style={{ display: 'flex', gap: 8 }}>
          {onCancel && (
            <button type="button" className="btn small-btn" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="button" className="btn small-btn primary" disabled={!text.trim() || busy} onClick={send}>
            {submitLabel}
          </button>
        </span>
      </span>
    </div>
  );
}

// The list of threads.
export function DiscussionBoard({ c, me, people, open, onOpen, threadLink }: { c: ClassDoc; me: Me; people: Person[]; open?: string | null; onOpen: (tid: string | null) => void; threadLink?: (tid: string) => string }) {
  const threads = useThreads(c.id, me);
  const [seen, setSeen] = useState(() => readSeen(c.id));
  const [starting, setStarting] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'prompts' | 'mine' | 'review'>('all');
  const s = discussionSettings(c);
  const visible = threads.filter((t) => me.teacher || ((!t.hidden || t.by === me.uid) && (t.approved || t.by === me.uid)));
  const pending = me.teacher ? threads.filter((t) => !t.approved).length : 0;
  const shown = visible.filter((t) => (filter === 'prompts' ? t.teacher : filter === 'mine' ? t.by === me.uid : filter === 'review' ? !t.approved || Object.keys(t.reported ?? {}).length : true));
  useEffect(() => {
    if (open) {
      markSeen(c.id, open);
      setSeen(readSeen(c.id));
    }
  }, [open, c.id]);
  if (open) {
    const t = threads.find((x) => x.id === open);
    return <ThreadView c={c} me={me} people={people} tid={open} thread={t} onBack={() => onOpen(null)} />;
  }
  const start = async (body: string, mentions: string[]) => {
    setBusy(true);
    try {
      const tid = await startThread(c.id, c, me, { title: title.trim() || body.trim().slice(0, 60), body, mentions });
      for (const uid of mentions) {
        const p = people.find((x) => x.uid === uid);
        notify(c.id, { to: p?.learnerId ?? (p ? 'teacher' : ''), fromName: me.name, fromUid: me.uid, what: 'in a discussion', text: body.slice(0, 120), itemId: 'disc', taskId: tid }).catch(() => {});
      }
      setTitle('');
      setStarting(false);
      onOpen(tid);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="disc">
      <div className="disc-head">
        <span className="seg small-seg disc-filters" role="tablist" aria-label="Show">
          {(['all', 'prompts', 'mine', ...(me.teacher ? ['review' as const] : [])] as const).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'prompts' ? 'From the teacher' : f === 'mine' ? 'Mine' : `To review${pending ? ` · ${pending}` : ''}`}
            </button>
          ))}
        </span>
        {canStart(c, me) && !starting && (
          <button type="button" className="btn small-btn primary" onClick={() => setStarting(true)}>
            {me.teacher ? 'New prompt' : 'Start a thread'}
          </button>
        )}
      </div>
      {!canPost(c, me) && <span className="hint">You can read the board, but your teacher has paused your posting for now.</span>}
      {starting && (
        <div className="disc-new">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={me.teacher ? 'Prompt title, for example: Question of the week' : 'Title'} maxLength={140} autoFocus aria-label="Title" />
          <Composer people={people} placeholder={me.teacher ? 'What should learners discuss? You can paste a link or a picture address.' : 'What do you want to talk about?'} onSend={start} busy={busy} submitLabel={me.teacher ? 'Post prompt' : 'Start thread'} onCancel={() => setStarting(false)} />
          {!me.teacher && s.approval && <span className="hint">Your teacher will see your thread first and approve it.</span>}
        </div>
      )}
      {!shown.length ? (
        <p className="hint">{threads.length ? 'Nothing here.' : me.teacher ? 'No discussions yet. Post a prompt, or start one from a task with “Discuss this task”.' : 'No discussions yet.'}</p>
      ) : (
        <ul className="disc-list">
          {shown.map((t) => {
            const unread = isUnread(t, seen) && t.by !== me.uid;
            const inner = (
              <>
                <span className="disc-row-main">
                  <span className="disc-title">
                    {t.pinned && <span className="ann-pin">Pinned</span>}
                    {t.locked && <span className="tag-pill">Locked</span>}
                    {t.hidden && me.teacher && <span className="tag-pill">Hidden</span>}
                    {!t.approved && <span className="tag-pill">Waiting for approval</span>}
                    {Object.keys(t.reported ?? {}).length > 0 && me.teacher && <span className="tag-pill task">Reported</span>}
                    {t.title}
                    {unread && <span className="disc-dot" aria-label="New" />}
                  </span>
                  <span className="hint disc-meta">
                    {t.teacher ? 'Your teacher' : t.byName} · {ago(t.at)}
                    {t.link ? ` · about “${t.link.title}”` : ''}
                  </span>
                </span>
                <span className="disc-count">
                  {t.replyCount} {t.replyCount === 1 ? 'reply' : 'replies'}
                  {t.replyCount > 0 && <span className="hint"> · {ago(t.lastAt)}</span>}
                </span>
              </>
            );
            return (
              <li key={t.id} className={'disc-row' + (unread ? ' unread' : '') + (t.pinned ? ' pinned' : '')}>
                {threadLink ? (
                  <Link to={threadLink(t.id)} onClick={() => onOpen(t.id)}>
                    {inner}
                  </Link>
                ) : (
                  <button type="button" onClick={() => onOpen(t.id)}>
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// One thread with its replies.
export function ThreadView({ c, me, people, tid, thread, onBack }: { c: ClassDoc; me: Me; people: Person[]; tid: string; thread?: Thread; onBack: () => void }) {
  const live = useThread(c.id, tid);
  const t = live ?? thread;
  const posts = usePosts(c.id, tid, me);
  const anns = useAnnotations(c.id, 'disc:' + tid, { teacher: me.teacher, uid: me.uid });
  const bodyRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const s = discussionSettings(c);
  useEffect(() => {
    if (t) markSeen(c.id, tid);
  }, [t?.lastAt, c.id, tid]); // eslint-disable-line react-hooks/exhaustive-deps
  const peopleWithTeacher = useMemo(() => people, [people]);
  if (live === null) return <p className="hint">This thread is gone.</p>;
  if (!t) return <p className="hint">Loading…</p>;
  const canReply = canPost(c, me) && (!t.locked || me.teacher);
  const visiblePosts = posts.filter((p) => me.teacher || ((!p.hidden || p.by === me.uid) && (p.approved || p.by === me.uid)));
  const send = async (text: string, mentions: string[]) => {
    setBusy(true);
    try {
      await reply(c.id, c, me, tid, text, mentions);
      for (const uid of mentions) {
        const p = people.find((x) => x.uid === uid);
        notify(c.id, { to: p?.learnerId ?? (p ? 'teacher' : ''), fromName: me.name, fromUid: me.uid, what: 'in a discussion', text: text.slice(0, 120), itemId: 'disc', taskId: tid }).catch(() => {});
      }
      // tell the thread's author too, unless they wrote the reply
      if (t.by !== me.uid && !mentions.includes(t.by)) {
        const author = people.find((x) => x.uid === t.by);
        notify(c.id, { to: t.teacher ? 'teacher' : author?.learnerId ?? t.learnerId ?? '', fromName: me.name, fromUid: me.uid, what: `in “${t.title}”`, text: text.slice(0, 120), itemId: 'disc', taskId: tid }).catch(() => {});
      }
      if (!me.teacher && s.approval) setMsg('Posted. Your teacher will see it first and approve it.');
    } finally {
      setBusy(false);
    }
  };
  const learnerOf = (uid: string) => people.find((p) => p.uid === uid);
  const Tools = ({ p }: { p: Post | null }) => {
    const item = p ?? t;
    const own = item.by === me.uid;
    const reported = Object.keys(item.reported ?? {}).length;
    return (
      <span className="post-tools">
        {me.teacher && p && !p.approved && (
          <button type="button" className="btn link small" onClick={() => approvePost(c.id, tid, p.id)}>
            Approve
          </button>
        )}
        {me.teacher && !p && !t.approved && (
          <button type="button" className="btn link small" onClick={() => editThread(c.id, tid, { approved: true })}>
            Approve
          </button>
        )}
        {me.teacher && item.by !== me.uid && !item.teacher && (
          <button type="button" className="btn link small" onClick={() => setFeedbackFor(feedbackFor === (p?.id ?? 'thread') ? null : p?.id ?? 'thread')} title="Select text in this post to add a correction code or a private comment, visible only to this learner">
            {feedbackFor === (p?.id ?? 'thread') ? 'Done' : 'Language feedback'}
          </button>
        )}
        {own && p && (
          <button type="button" className="btn link small" onClick={() => setEditing(editing === p.id ? null : p.id)}>
            Edit
          </button>
        )}
        {me.teacher && (
          <>
            {p ? (
              <button type="button" className="btn link small" onClick={() => setPost(c.id, tid, p.id, { hidden: !p.hidden })}>
                {p.hidden ? 'Unhide' : 'Hide'}
              </button>
            ) : (
              <>
                <button type="button" className="btn link small" onClick={() => editThread(c.id, tid, { pinned: !t.pinned })}>
                  {t.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button type="button" className="btn link small" onClick={() => editThread(c.id, tid, { locked: !t.locked })}>
                  {t.locked ? 'Unlock' : 'Lock'}
                </button>
                <button type="button" className="btn link small" onClick={() => editThread(c.id, tid, { hidden: !t.hidden })}>
                  {t.hidden ? 'Unhide' : 'Hide'}
                </button>
              </>
            )}
            {reported > 0 && (
              <button type="button" className="btn link small" onClick={() => clearReports(c.id, tid, p?.id ?? null)}>
                Clear {reported} {reported === 1 ? 'report' : 'reports'}
              </button>
            )}
            {!item.teacher && learnerOf(item.by)?.learnerId && (
              <button type="button" className="btn link small" onClick={() => muteLearner(c, learnerOf(item.by)!.learnerId!, !s.muted.includes(learnerOf(item.by)!.learnerId!))}>
                {s.muted.includes(learnerOf(item.by)!.learnerId!) ? 'Unmute' : 'Mute'} {item.byName.split(' ')[0]}
              </button>
            )}
          </>
        )}
        {(me.teacher || own) && (
          <button type="button" className="btn link small link-danger" onClick={() => window.confirm(p ? 'Delete this reply?' : 'Delete the whole thread?') && (p ? deletePost(c.id, tid, p.id) : (deleteThread(c.id, tid), onBack()))}>
            Delete
          </button>
        )}
        {!me.teacher && !own && (
          <button type="button" className="btn link small" disabled={!!item.reported?.[me.uid]} onClick={() => report(c.id, tid, p?.id ?? null, me.uid)}>
            {item.reported?.[me.uid] ? 'Reported' : 'Report'}
          </button>
        )}
      </span>
    );
  };
  return (
    <div className="thread">
      <button type="button" className="btn link small" onClick={onBack}>
        ← All discussions
      </button>
      <div className="thread-body" ref={bodyRef}>
        <article className={'post op' + (t.hidden ? ' hidden-post' : '')}>
          <header className="post-head">
            <span className="post-by">{t.teacher ? 'Your teacher' : t.byName}</span>
            <span className="hint">{ago(t.at)}</span>
            {t.link && (
              <Link className="hint" to={me.teacher ? `/class/${c.id}/lesson/${t.link.itemId}${t.link.taskId ? `?task=${t.link.taskId}` : ''}` : `/learn/${t.link.itemId}${t.link.taskId ? `?task=${t.link.taskId}` : ''}`}>
                about “{t.link.title}” →
              </Link>
            )}
            {!t.approved && <span className="tag-pill">Waiting for approval</span>}
          </header>
          <h2 className="thread-title">{t.title}</h2>
          <div className="post-text" data-bk={'post:op'}>
            <PostBody text={t.body} people={peopleWithTeacher} me={me.uid} />
          </div>
          <footer className="post-foot">
            <ReactionBar reactions={t.reactions} me={me.uid} onToggle={(e, on) => react(c.id, tid, null, e, me.uid, on)} />
            <Tools p={null} />
          </footer>
        </article>
        {visiblePosts.map((p) => (
          <article key={p.id} className={'post' + (p.hidden ? ' hidden-post' : '') + (!p.approved ? ' pending-post' : '') + (p.teacher ? ' teacher-post' : '')}>
            <header className="post-head">
              <span className="post-by">{p.teacher ? 'Your teacher' : p.byName}</span>
              <span className="hint">
                {ago(p.at)}
                {p.edited ? ' · edited' : ''}
              </span>
              {!p.approved && <span className="tag-pill">{p.by === me.uid ? 'Waiting for approval' : 'Needs approval'}</span>}
              {p.hidden && <span className="tag-pill">Hidden</span>}
            </header>
            {editing === p.id ? (
              <Composer people={people} placeholder="" initial={p.body} submitLabel="Save" onCancel={() => setEditing(null)} onSend={async (text) => (await editPost(c.id, tid, p.id, text), setEditing(null))} />
            ) : (
              <div className="post-text" data-bk={'post:' + p.id}>
                <PostBody text={p.body} people={peopleWithTeacher} me={me.uid} />
              </div>
            )}
            <footer className="post-foot">
              <ReactionBar reactions={p.reactions} me={me.uid} onToggle={(e, on) => react(c.id, tid, p.id, e, me.uid, on)} small />
              <Tools p={p} />
            </footer>
          </article>
        ))}
        <AnnotationLayer container={bodyRef} annotations={anns} classId={c.id} taskId={'disc:' + tid} canAnnotate={me.teacher && !!feedbackFor} me={me} codes={c.codes ?? DEFAULT_CODES} forceVisibility="private" learnerUidFor={(bk) => (bk === 'post:op' ? (t.teacher ? undefined : t.by) : posts.find((p) => 'post:' + p.id === bk)?.by)} />
      </div>
      {feedbackFor && <span className="hint">Select words in {feedbackFor === 'thread' ? 'the first post' : 'the reply'} to add a correction code or a private comment. Only that learner sees it.</span>}
      {msg && <span className="hint">{msg}</span>}
      {canReply ? <Composer people={people} placeholder={t.teacher && !me.teacher ? 'Your answer…' : 'Reply…'} onSend={send} busy={busy} submitLabel="Reply" /> : <span className="hint">{t.locked ? 'This thread is locked.' : 'Your teacher has paused your posting for now.'}</span>}
    </div>
  );
}

// Teacher settings for the board.
export function DiscussionSettingsPanel({ c, people }: { c: ClassDoc; people: Person[] }) {
  const s = discussionSettings(c);
  return (
    <div className="disc-settings">
      <label className="pop-check">
        <input type="checkbox" checked={s.learnersStart} onChange={() => saveDiscussionSettings(c, { learnersStart: !s.learnersStart })} />
        Learners can start their own threads
      </label>
      <label className="pop-check">
        <input type="checkbox" checked={s.approval} onChange={() => saveDiscussionSettings(c, { approval: !s.approval })} />
        Learner posts wait for my approval before others see them
      </label>
      <label className="pop-check">
        <input type="checkbox" checked={s.track} onChange={() => saveDiscussionSettings(c, { track: !s.track })} />
        Count posts and replies in reports
      </label>
      {s.muted.length > 0 && (
        <span className="hint">
          Muted: {s.muted.map((id) => people.find((p) => p.learnerId === id)?.name ?? id).join(', ')} ·{' '}
          <button type="button" className="btn link small" onClick={() => saveDiscussionSettings(c, { muted: [] })}>
            Unmute all
          </button>
        </span>
      )}
    </div>
  );
}
