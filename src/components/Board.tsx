import { useMemo, useRef, useState } from 'react';
import { addPost, boardKey, react, removePost, usePosts, type Post } from '../lib/boards';
import { Icon } from '../editor/Icons';
import { Avatar } from './avatars';
import { useClassAvatars } from '../lib/avatars';
import { findMentions, notify, type Person } from '../lib/notices';

const TEACHER: Person = { id: 'teacher', name: 'Teacher' };
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Message text with @tags highlighted; your own tag stands out.
function Tagged({ text, people, meId }: { text: string; people: Person[]; meId?: string }) {
  if (!people.length || !text.includes('@')) return <>{text}</>;
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length);
  const re = new RegExp('(@(?:' + sorted.map((p) => escapeRe(p.name)).join('|') + '))', 'gi');
  return (
    <>
      {text.split(re).map((part, i) => {
        const p = part.startsWith('@') ? sorted.find((x) => '@' + x.name.toLowerCase() === part.toLowerCase()) : undefined;
        return p ? (
          <span key={i} className={'mention' + (p.id === meId ? ' me' : '')}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

// Suggestions while typing @ in a message.
function useTagInput(people: Person[], value: string, setValue: (v: string) => void, enabled: boolean) {
  const [caret, setCaret] = useState(0);
  const before = value.slice(0, caret);
  const m = enabled ? /(?:^|\s)@([\p{L}' ]{0,24})$/u.exec(before) : null;
  const q = m ? m[1].toLowerCase() : '';
  const items = m ? people.filter((p) => p.name.toLowerCase().startsWith(q) || p.name.toLowerCase().split(' ').some((w) => w.startsWith(q))).slice(0, 6) : [];
  const choose = (p: Person, el?: HTMLTextAreaElement | HTMLInputElement | null) => {
    if (!m) return;
    const start = caret - m[1].length - 1;
    const next = value.slice(0, start) + '@' + p.name + ' ' + value.slice(caret);
    setValue(next);
    const c = start + p.name.length + 2;
    setCaret(c);
    window.setTimeout(() => el && (el.focus(), el.setSelectionRange(c, c)), 0);
  };
  const track = (e: { currentTarget: HTMLTextAreaElement | HTMLInputElement }) => setCaret(e.currentTarget.selectionStart ?? 0);
  return { items, choose, track };
}

function TagList({ items, onPick }: { items: Person[]; onPick: (p: Person) => void }) {
  if (!items.length) return null;
  return (
    <span className="bd-tags" role="listbox">
      {items.map((p) => (
        <button key={p.id} type="button" className="bd-tag-opt" onMouseDown={(e) => (e.preventDefault(), onPick(p))}>
          @{p.name}
        </button>
      ))}
    </span>
  );
}

// A live message board, or a wall of post-it notes, shared by the whole class.

export type BoardAttrs = { id: string; mode: 'board' | 'postits'; prompt: string; replies: boolean; reactions: boolean; anonymous: boolean; tagging?: boolean };
export type BoardMe = { classId: string; taskId: string; itemId?: string; uid: string; name: string; teacher?: boolean; selfId?: string; people?: Person[]; penPeople?: { uid: string; name: string }[] };

export const NOTE_COLORS = [
  { key: 'yellow', bg: '#fdf0a6', edge: '#f1dd76' },
  { key: 'pink', bg: '#fbd6e0', edge: '#f0b5c6' },
  { key: 'green', bg: '#d8f0cf', edge: '#b9dfac' },
  { key: 'blue', bg: '#d6e7fb', edge: '#b4cff0' },
  { key: 'lilac', bg: '#e6dcf7', edge: '#cdbdeb' },
  { key: 'peach', bg: '#fcdcc5', edge: '#f2bf9c' },
];
const noteColor = (k?: string) => NOTE_COLORS.find((c) => c.key === k) ?? NOTE_COLORS[0];
const REACTIONS = [
  { key: 'heart', icon: 'heart', label: 'Love it' },
  { key: 'like', icon: 'thumbsup', label: 'Like' },
  { key: 'clap', icon: 'clap', label: 'Well done' },
  { key: 'idea', icon: 'idea', label: 'Good idea' },
];

function ago(p: Post) {
  const t = p.at?.toMillis?.();
  if (!t) return 'just now';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}
// A stable small tilt for each note.
const tilt = (id: string) => ((id.charCodeAt(0) + id.charCodeAt(id.length - 1)) % 7) - 3;

export function Board({ attrs, me, preview, demo }: { attrs: BoardAttrs; me?: BoardMe; preview?: boolean; demo?: Post[] }) {
  const key = me ? boardKey(me.taskId, attrs.id) : '';
  const live = usePosts(me?.classId ?? '', key, !!me && !preview && !demo);
  const posts = demo ?? live;
  const [text, setText] = useState('');
  const [color, setColor] = useState(NOTE_COLORS[0].key);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const avatars = useClassAvatars();
  const tagging = attrs.tagging !== false;
  const people: Person[] = useMemo(() => [TEACHER, ...(me?.people ?? []).filter((p) => p.id !== me?.selfId)], [me?.people, me?.selfId]);
  const allPeople: Person[] = useMemo(() => [TEACHER, ...(me?.people ?? [])], [me?.people]);
  const meTagId = me?.teacher ? 'teacher' : me?.selfId;
  const composeRef = useRef<HTMLTextAreaElement>(null);
  const replyRef = useRef<HTMLInputElement>(null);
  const tagMain = useTagInput(people, text, setText, tagging && !!me);
  const tagReply = useTagInput(people, replyText, setReplyText, tagging && !!me);
  const fresh = (id: string) => {
    const isNew = posts !== null && !seen.current.has(id) && seen.current.size > 0;
    seen.current.add(id);
    return isNew;
  };
  if (posts && seen.current.size === 0) posts.forEach((p) => seen.current.add(p.id));

  const top = useMemo(() => (posts ?? []).filter((p) => !p.parentId), [posts]);
  const repliesOf = (id: string) => (posts ?? []).filter((p) => p.parentId === id);
  const isNotes = attrs.mode === 'postits';
  const shown = isNotes ? top : [...top].reverse(); // newest message first on a board

  async function send(parentId?: string) {
    const t = (parentId ? replyText : text).trim();
    if (!me || !t || busy) return;
    setBusy(true);
    try {
      await addPost(me.classId, key, {
        text: t,
        byUid: me.uid,
        byName: attrs.anonymous && !me.teacher ? '' : me.name,
        avatar: attrs.anonymous && !me.teacher ? '' : (me.teacher ? avatars.teacher : avatars.byLearner[me.selfId ?? '']) ?? '',
        ...(me.teacher ? { teacher: true } : {}),
        ...(isNotes && !parentId ? { color } : {}),
        ...(parentId ? { parentId } : {}),
      });
      // Tell everyone who was tagged.
      if (tagging) {
        for (const p of findMentions(t, people)) {
          notify(me.classId, {
            to: p.id,
            fromName: attrs.anonymous && !me.teacher ? 'Someone' : me.name.split(' ')[0],
            fromUid: me.uid,
            what: isNotes ? 'on the post-it wall' : 'on the message board',
            text: t,
            itemId: me.itemId ?? '',
            taskId: me.taskId,
          }).catch(() => {});
        }
      }
      if (parentId) {
        setReplyText('');
        setReplyTo(null);
      } else setText('');
    } finally {
      setBusy(false);
    }
  }

  const who = (p: Post) => (p.teacher ? p.byName || 'Teacher' : p.byName || 'Anonymous');
  const mine = (p: Post) => !!me && p.byUid === me.uid;

  const reactionsRow = (p: Post) =>
    attrs.reactions && (
      <span className="bd-reacts">
        {REACTIONS.map((r) => {
          const list = p.reactions?.[r.key] ?? [];
          const on = !!me && list.includes(me.uid);
          return (
            <button key={r.key} type="button" className={'bd-react' + (on ? ' on' : '') + (list.length ? ' has' : '')} title={r.label} disabled={!me || preview} onClick={() => me && react(me.classId, key, p.id, r.key, me.uid, !on)}>
              <Icon name={r.icon} size="15" />
              {list.length > 0 && <span>{list.length}</span>}
            </button>
          );
        })}
      </span>
    );

  const tools = (p: Post) => (
    <span className="bd-tools">
      {attrs.replies && !p.parentId && me && !preview && (
        <button type="button" className="bd-link" onClick={() => (setReplyTo(replyTo === p.id ? null : p.id), setReplyText(''))}>
          Reply
        </button>
      )}
      {me && (mine(p) || me.teacher) && !preview && (
        <button type="button" className="bd-link quiet" onClick={() => window.confirm('Delete this message?') && removePost(me.classId, key, p.id)}>
          Delete
        </button>
      )}
    </span>
  );

  const replyBox = (p: Post) =>
    replyTo === p.id && (
      <form
        className="bd-reply-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(p.id);
        }}
      >
        <span className="bd-reply-wrap">
          <input ref={replyRef} autoFocus value={replyText} maxLength={500} placeholder={tagging ? 'Write a reply. Type @ to tag someone' : 'Write a reply'} onChange={(e) => (setReplyText(e.target.value), tagReply.track(e))} onKeyUp={tagReply.track} onClick={tagReply.track} />
          <TagList items={tagReply.items} onPick={(p) => tagReply.choose(p, replyRef.current)} />
        </span>
        <button type="submit" className="btn small-btn primary" disabled={!replyText.trim() || busy}>
          Reply
        </button>
      </form>
    );

  const replies = (p: Post) =>
    attrs.replies &&
    repliesOf(p.id).length > 0 && (
      <span className="bd-replies">
        {repliesOf(p.id).map((r) => (
          <span key={r.id} className={'bd-reply' + (fresh(r.id) ? ' fresh' : '')}>
            <span className="bd-reply-head">
              <strong>{who(r)}</strong>
              {r.teacher && <span className="bd-teacher">Teacher</span>}
              <span className="bd-time">{ago(r)}</span>
              {me && (mine(r) || me.teacher) && !preview && (
                <button type="button" className="bd-link quiet" onClick={() => removePost(me.classId, key, r.id)}>
                  Delete
                </button>
              )}
            </span>
            <span className="bd-reply-text"><Tagged text={r.text} people={allPeople} meId={meTagId} /></span>
          </span>
        ))}
      </span>
    );

  return (
    <section className={'bd ' + (isNotes ? 'bd-notes' : 'bd-board')}>
      <div className="bd-head">
        <span className="bd-eyebrow">
          <Icon name={isNotes ? 'pen' : 'speak'} size="14" />
          {isNotes ? 'Post-it wall' : 'Message board'}
          {attrs.anonymous && <span className="bd-anon">Anonymous</span>}
        </span>
        {attrs.prompt && <h3 className="bd-prompt">{attrs.prompt}</h3>}
      </div>

      {me && !preview ? (
        <form
          className={'bd-compose' + (isNotes ? ' note-compose' : '')}
          style={isNotes ? { ['--note' as string]: noteColor(color).bg } : undefined}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {!isNotes && (attrs.anonymous && !me.teacher ? <span className="bd-av me"><Icon name="question" size="14" /></span> : <Avatar k={me.teacher ? avatars.teacher : avatars.byLearner[me.selfId ?? '']} name={me.name} size={34} />)}
          <textarea
            ref={composeRef}
            onKeyUp={tagMain.track}
            onClick={tagMain.track}
            value={text}
            maxLength={isNotes ? 240 : 1000}
            rows={isNotes ? 3 : 2}
            placeholder={(isNotes ? 'Write on your note…' : attrs.anonymous && !me.teacher ? 'Write a message. Your name won’t be shown.' : 'Write a message to the class…') + (tagging ? ' Type @ to tag someone.' : '')}
            onChange={(e) => (setText(e.target.value), tagMain.track(e))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
          />
          <TagList items={tagMain.items} onPick={(p) => tagMain.choose(p, composeRef.current)} />
          <span className="bd-compose-foot">
            {isNotes && (
              <span className="bd-colors" role="radiogroup" aria-label="Note colour">
                {NOTE_COLORS.map((c) => (
                  <button key={c.key} type="button" role="radio" aria-checked={color === c.key} title={c.key} className={'bd-color' + (color === c.key ? ' on' : '')} style={{ background: c.bg }} onClick={() => setColor(c.key)} />
                ))}
              </span>
            )}
            <button type="submit" className="btn small-btn primary bd-send" disabled={!text.trim() || busy}>
              {isNotes ? 'Stick it on the wall' : 'Post'}
            </button>
          </span>
        </form>
      ) : (
        <div className="bd-placeholder">{preview ? 'Learners write here during the lesson. Messages appear for everyone straight away.' : ''}</div>
      )}

      {posts === null && me && !preview && <span className="hint">Loading…</span>}
      {posts && posts.length === 0 && <div className="bd-empty">{isNotes ? 'No notes yet. Be the first to stick one on the wall.' : 'No messages yet. Start the conversation.'}</div>}

      {isNotes ? (
        <div className="bd-wall">
          {shown.map((p) => {
            const c = noteColor(p.color);
            return (
              <div key={p.id} className={'bd-note' + (fresh(p.id) ? ' fresh' : '')} style={{ ['--note' as string]: c.bg, ['--edge' as string]: c.edge, ['--tilt' as string]: `${tilt(p.id)}deg` }}>
                <span className="bd-tape" aria-hidden="true" />
                <span className="bd-note-text"><Tagged text={p.text} people={allPeople} meId={meTagId} /></span>
                <span className="bd-note-foot">
                  <span className="bd-note-by">{who(p)}</span>
                  {tools(p)}
                </span>
                {reactionsRow(p)}
                {replies(p)}
                {replyBox(p)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bd-feed">
          {shown.map((p) => (
            <article key={p.id} className={'bd-msg' + (fresh(p.id) ? ' fresh' : '') + (p.teacher ? ' from-teacher' : '') + (mine(p) ? ' mine' : '')}>
              {p.byName ? <Avatar k={p.avatar} name={p.byName} size={34} /> : <span className="bd-av"><Icon name="question" size="14" /></span>}
              <div className="bd-body">
                <span className="bd-msg-head">
                  <strong>{who(p)}</strong>
                  {p.teacher && <span className="bd-teacher">Teacher</span>}
                  <span className="bd-time">{ago(p)}</span>
                </span>
                <p className="bd-text"><Tagged text={p.text} people={allPeople} meId={meTagId} /></p>
                <span className="bd-msg-foot">
                  {reactionsRow(p)}
                  {tools(p)}
                </span>
                {replies(p)}
                {replyBox(p)}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
