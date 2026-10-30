import { CallButtons } from '../components/Rooms';
import { GifPicker } from '../components/GifPicker';
import { CallCard, FileCard, callOf, fileOf } from '../components/MsgCards';
import { NSelect } from '../components/Select';
import { whoLine } from '../lib/directory';
import { ask, tell } from '../lib/ask';
import { FileIcon, type FileKind } from '../components/FileIcon';
import { startSessionWith } from './StudioSession';
import { isProxyTab } from '../lib/proxy';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, getDocs, type DocumentData } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { tickOf, deleteChat, deletesForAll, type Tick } from '../lib/chat';
import { openMenu, type MenuItem } from '../components/ContextMenu';
import { withShownNames, isSelf, taskPartsOf, addToGroup, blocksIn, chatTitle, deleteWithUndo, undoDelete, undoUntil, editMsg, isEmptyContent, leaveGroup, markRead, mentionsOf, openChat, plainOf, react, QUICK_REACTS, WORD_REACTS, renameGroup, sendMsg, setTyping, unreadIn, saveAnswer, useAnswers, enterSendOn, type ChatAnswer, useChats, useMessages, useTyping, chime, AFTER, saveMsgPrefs, setSounds, soundsOn, useMsgPrefs, type Chat, type Msg, type Person } from '../lib/chat';
import { useDirectory, type Directory } from '../lib/directory';
import { mergeKey, questionIds, scoreTask, splitKey, type AnswerKey } from '../lib/questions';
import type { Responses } from '../lib/tasks';
import { addTask, tasksCol } from '../lib/tasks';
import { carryMedia, remap } from '../lib/fullcopy';
import { allTeacherClasses, canEdit } from '../lib/coteach';
import { createShare } from '../lib/sharing';
import { useArchive } from '../lib/archive';
import { loadLibrary } from './ArchiveLibrary';
import { TaskEditor } from '../editor/TaskEditor';
import { TaskRenderer } from '../components/TaskRenderer';
import { TopBar } from '../components/TopBar';
import { Loader } from '../components/Loader';
import { UiIcon } from '../components/UiIcon';
import { LearnerNav, MainNav } from './ColleaguesPage';
import { SharedWindow } from './SharedPage';
import { dockOpen } from '../components/ChatDock';
import { PersonFace } from '../components/avatars';
import { AppSetupDialog } from '../components/AppSetup';
import { setClip, writeClip, type Clip } from '../lib/clip';
import { Icon, IconGrid, iconByKey } from '../editor/Icons';
import { useDismiss } from '../lib/useDismiss';
import type { ClassDoc } from '../lib/classes';

// Messages: chats on the left, the conversation on the right. Messages use the same tools as
// tasks (formatting, IPA, word stress, definitions, symbols, pictures and whole task elements),
// with @tags, replies and quick reactions.

const EMPTY: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };
const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dayOf = (at: number) => {
  const d = new Date(at);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
};
const short = (at: number) => (new Date(at).toDateString() === new Date().toDateString() ? clock(at) : new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
const initial = (n: string) => n.trim().slice(0, 1).toUpperCase() || '?';

export function MessagesPage() {
  const { user, profile } = useAuth();
  const dir = useDirectory();
  const me = dir?.me;
  const rawChats = useChats(me?.key);
  const chats = useMemo(() => withShownNames(rawChats, dir?.nameFor), [rawChats, dir]);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const open = params.get('c') ?? '';
  const [creating, setCreating] = useState<false | 'chat' | 'group'>(false);
  const [q, setQ] = useState('');
  const teacher = profile?.role === 'teacher';
  // A teacher looking at the app as a learner does not see that learner's messages.
  if (isProxyTab()) return <PrivateMessages />;
  const cur = chats?.find((c) => c.id === open);
  // Leaving this page with a chat open (on a computer): the chat comes along in the small window.
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => () => void (openRef.current && !window.matchMedia('(max-width: 640px)').matches && dockOpen(openRef.current, true)), []);
  // A chat's menu: right-click on a computer, a long press on a phone. Deleting asks first.
  const delChat = async (c: Chat) => {
    if (!me) return;
    const all = deletesForAll(c, me.key) && !isSelf(c);
    const ok = await ask(all ? 'Delete this chat? It goes for everyone in it, with all its messages. You can’t undo this.' : isSelf(c) ? 'Delete your notes to self? You can’t undo this.' : 'Delete this chat? It goes from your list, with its messages so far. The others keep theirs. If someone writes again, it comes back.', { ok: 'Delete chat', cancel: 'Keep it' });
    if (!ok) return;
    if (c.id === open) pick('');
    await deleteChat(c, me.key).catch(() => void tell('We couldn’t delete the chat just now. Try again.'));
  };
  const rowMenu = (c: Chat): MenuItem[] => [
    { label: 'Open', icon: 'message', onClick: () => pick(c.id) },
    ...(unreadIn(c, me?.key ?? '') ? [{ label: 'Mark as read', icon: 'check', onClick: () => void markRead(c, me!.key) } as MenuItem] : []),
    'sep',
    { label: deletesForAll(c, me?.key ?? '') && !isSelf(c) ? 'Delete chat for everyone' : 'Delete chat', icon: 'trash', danger: true, onClick: () => void delChat(c) },
  ];
  const held = useRef(false);
  const timer = useRef(0);
  const hold = (c: Chat) => ({
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      const x = t.clientX;
      const y = t.clientY;
      held.current = false;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        held.current = true;
        navigator.vibrate?.(12);
        openMenu(new MouseEvent('contextmenu', { clientX: x, clientY: y }), rowMenu(c));
      }, 520);
    },
    onTouchMove: () => window.clearTimeout(timer.current),
    onTouchEnd: () => window.clearTimeout(timer.current),
  });
  const shown = (chats ?? []).filter((c) => !q.trim() || chatTitle(c, me?.key ?? '').toLowerCase().includes(q.trim().toLowerCase()) || Object.values(c.names).some((n) => n.toLowerCase().includes(q.trim().toLowerCase())));
  const pick = (id: string) => setParams(id ? { c: id } : {});

  return (
    <div className="shell">
      {teacher ? (
        <TopBar>
          <MainNav on="messages" />
        </TopBar>
      ) : (
        <TopBar>
          <LearnerNav on="messages" />
        </TopBar>
      )}
      {!user || !me || chats === null ? (
        <Loader label="Opening your messages" />
      ) : !teacher && dir?.mode === 'off' ? (
        <div className="msg-empty msg-off">
          <UiIcon name="message" size={30} />
          <strong>Messages are off for your class</strong>
          <span className="hint">Your teacher has turned off messages. You can still use the discussion board.</span>
        </div>
      ) : (
        <div className={'msg' + (cur ? ' has-chat' : '')}>
          <aside className="msg-side">
            <div className="msg-side-top">
              <h1 className="page-title">Messages</h1>
              <span style={{ display: 'flex', gap: 6 }}>
                <MsgSettings uid={teacher ? user.uid : ''} />
                <button type="button" className="btn small-btn" onClick={() => setCreating('group')} data-tip="Start a group chat">
                  + Group
                </button>
                <button type="button" className="btn primary small-btn" onClick={() => setCreating('chat')}>
                  + New
                </button>
              </span>
            </div>
            <input aria-label="Search people and groups" className="ma-search" type="search" value={q} placeholder="Search people and groups" onChange={(e) => setQ(e.target.value)} />
            <div className="msg-list" role={shown.length ? 'listbox' : undefined} aria-label="Chats">
              {shown.length === 0 && <span className="hint msg-none">{chats.length ? 'No chats match.' : teacher ? 'No messages yet. Write to a learner, a group or a colleague.' : dir?.mode === 'free' || !dir?.mode ? 'No messages yet. Write to a classmate or your teacher.' : 'No messages yet. Write to your teacher.'}</span>}
              {shown.map((c) => {
                const un = unreadIn(c, me.key);
                const tagged = un && c.last?.mentions?.includes(me.key);
                const title = chatTitle(c, me.key);
                return (
                  <button key={c.id} type="button" role="option" aria-selected={c.id === open} className={'msg-row' + (c.id === open ? ' on' : '') + (un ? ' unread' : '')} onClick={() => (held.current ? (held.current = false) : pick(c.id))} onContextMenu={(e) => openMenu(e, rowMenu(c))} {...hold(c)}>
                    <span className={'msg-av' + (c.kind === 'group' ? ' group' : '') + (isSelf(c) ? ' self' : '')}>{c.kind === 'group' ? <UiIcon name="groups" size={16} /> : isSelf(c) ? <UiIcon name="pen" size={15} /> : initial(title)}</span>
                    <span className="msg-row-t">
                      <span className="msg-row-top">
                        <b>{title}</b>
                        <span className="hint">{c.last ? short(c.lastAt) : ''}</span>
                      </span>
                      <span className="msg-row-last">
                        {tagged && <span className="msg-at">@you</span>}
                        {c.last ? `${c.last.by === me.key ? 'You' : c.last.name.split(' ')[0]}: ${c.last.text}` : 'No messages yet'}
                      </span>
                    </span>
                    {un && <i className="msg-dot" aria-label="Unread" />}
                  </button>
                );
              })}
            </div>
          </aside>
          <main className="msg-main">
            {cur ? (
              <ChatView key={cur.id} c={cur} me={me} dir={dir!} teacher={teacher} onBack={() => pick('')} onMin={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} />
            ) : (
              <div className="msg-empty">
                <UiIcon name="discuss" size={30} />
                <strong>Choose a chat, or start a new one</strong>
                <span className="hint">{teacher ? 'Write to one learner, a group from a class, or colleagues. Send task elements learners answer right in the chat, and materials colleagues copy into their own classes.' : dir?.mode === 'free' || !dir?.mode ? 'Write to a classmate, a group, or your teacher.' : 'Write to your teacher.'}</span>
                <button type="button" className="btn primary" onClick={() => setCreating('chat')}>
                  New message
                </button>
              </div>
            )}
          </main>
        </div>
      )}
      {creating && dir && <NewChat dir={dir} group={creating === 'group'} onClose={() => setCreating(false)} onOpen={(id) => (setCreating(false), pick(id))} />}
    </div>
  );
}

function PeoplePicker({ dir, picked, onToggle, exclude = [] }: { dir: Directory; picked: Person[]; onToggle: (p: Person) => void; exclude?: string[] }) {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  return (
    <div className="msg-pick">
      <input aria-label="Search names" className="ma-search" type="search" autoFocus value={q} placeholder="Search names" onChange={(e) => setQ(e.target.value)} />
      <div className="msg-pick-list">
        {dir.groups.map((g) => {
          const people = g.people.filter((p) => !exclude.includes(p.key) && (!s || p.name.toLowerCase().includes(s)));
          if (!people.length) return null;
          const all = people.every((p) => picked.some((x) => x.key === p.key));
          return (
            <div key={g.id} className="msg-pick-g">
              <span className="msg-pick-h">
                <span className="eyebrow">{g.label}</span>
                {people.length > 1 && (
                  <button type="button" className="btn link small" onClick={() => people.forEach((p) => (all ? picked.some((x) => x.key === p.key) : !picked.some((x) => x.key === p.key)) && onToggle(p))}>
                    {all ? 'None' : 'Everyone'}
                  </button>
                )}
              </span>
              {people.map((p) => {
                const on = picked.some((x) => x.key === p.key);
                return (
                  <label key={p.key} className={'sh-person' + (on ? ' on' : '')}>
                    <input type="checkbox" checked={on} onChange={() => onToggle(p)} />
                    <span className="sh-av">{initial(p.name)}</span>
                    <span className="sh-pt">
                      <b>{p.name}</b>
                      <span className="hint">{p.role === 'teacher' ? 'Teacher' : 'Learner'}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          );
        })}
        {dir.groups.every((g) => !g.people.length) && <span className="hint">There’s no one to write to yet.</span>}
      </div>
    </div>
  );
}

// group: starting a group chat: pick two or more people and name it.
export function NewChat({ dir, onClose, onOpen, group = false }: { dir: Directory; onClose: () => void; onOpen: (id: string) => void; group?: boolean }) {
  const [picked, setPicked] = useState<Person[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = (p: Person) => setPicked((x) => (x.some((y) => y.key === p.key) ? x.filter((y) => y.key !== p.key) : [...x, p]));
  // Learners from one class only in a chat, so their teachers can look after it.
  const classes = new Set(picked.filter((p) => p.role === 'learner').map((p) => p.classId));
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      onOpen(await openChat(dir.me, picked, title));
    } catch (e) {
      console.error(e);
      setErr('We couldn’t start the chat. Try again.');
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog msg-new" role="dialog" aria-label="New message" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>{group ? 'New group' : 'New message'}</h2>
        {!group && <button type="button" className="msg-self-row" disabled={busy} onClick={() => void ((setBusy(true), openChat(dir.me, [])).then(onOpen).catch(() => (setErr('We couldn’t start the chat. Try again.'), setBusy(false))))}>
          <span className="msg-av self"><UiIcon name="pen" size={15} /></span>
          <span className="sh-pt">
            <b>Notes to self</b>
            <span className="hint">Jot things down, save links and materials for later</span>
          </span>
        </button>}
        <PeoplePicker dir={dir} picked={picked} onToggle={toggle} />
        {(group || picked.length > 1) && (
          <label className="field">
            Group name
            <input aria-label={picked.map((p) => p.name.split(' ')[0]).join(', ')} value={title} placeholder={picked.map((p) => p.name.split(' ')[0]).join(', ')} onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}
        {classes.size > 1 && <span className="error">Put learners from one class in a chat at a time.</span>}
        {err && <span className="error">{err}</span>}
        <span className="sh-foot">
          <span className="hint">{picked.length ? `${picked.length} chosen${picked.length > 1 ? ' · a group' : group ? ' · choose at least two' : ''}` : group ? 'Choose at least two people' : ''}</span>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={picked.length < (group ? 2 : 1) || busy || classes.size > 1} onClick={go}>
            {picked.length > 1 ? 'Start the group' : 'Start'}
          </button>
        </span>
      </div>
    </div>
  );
}

export function ChatView({ c, me, dir, teacher, onBack, onMin }: { c: Chat; me: Person; dir: Directory; teacher: boolean; onBack: () => void; onMin?: () => void }) {
  const msgs = useMessages(c.id);
  // Enter sends (Shift + Enter for a new line), unless the person turned that off.
  const [enterSends] = useState(enterSendOn);
  // Every message starts as plain text; Aa shows the writing tools for this one.
  const [rich, setRich] = useState(false);
  const [tall, setTall] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [openShare, setOpenShare] = useState('');
  const [shareAns, setShareAns] = useState(true);
  // What was being typed is kept for this chat until it is sent: switching chats, minimising the
  // small window or leaving Messages loses nothing (kept for this browser tab).
  const draftKey = 'chat-draft:' + c.id;
  const [content, setContent] = useState<JSONContent>(() => {
    try {
      const d = sessionStorage.getItem(draftKey);
      return d ? (JSON.parse(d) as JSONContent) : EMPTY;
    } catch {
      return EMPTY;
    }
  });
  const draftT = useRef(0);
  const keepDraft = (v: JSONContent | null) => {
    window.clearTimeout(draftT.current);
    const write = () => {
      try {
        if (!v || isEmptyContent(v)) sessionStorage.removeItem(draftKey);
        else sessionStorage.setItem(draftKey, JSON.stringify(v));
      } catch {
        /* storage full or blocked: the draft just is not kept */
      }
    };
    if (v) draftT.current = window.setTimeout(write, 250);
    else write();
  };
  const [edKey, setEdKey] = useState(0);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copying, setCopying] = useState<Msg | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const people = c.members.filter((k) => k !== me.key).map((k) => ({ id: k, name: c.names[k] ?? 'Someone' }));
  const colleaguesHere = c.members.filter((k) => k !== me.key && c.roles[k] === 'teacher');
  // The class teacher decides whether learners may send task elements.
  const elementsOk = teacher || dir.learnerElements !== false;
  const [err, setErr] = useState('');
  // Read receipts: a teacher can turn theirs off; then nobody sees when they've read, and they
  // don't see when others have (as in WhatsApp). Learners always share them.
  const prefs = useMsgPrefs(teacher ? me.key : undefined);
  const receipts = !teacher || prefs.receipts !== false;
  useEffect(() => {
    markRead(c, me.key, receipts);
  }, [c.lastAt, receipts]); // eslint-disable-line react-hooks/exhaustive-deps
  const [forwarding, setForwarding] = useState<Msg | null>(null);
  const [info, setInfo] = useState<Msg | null>(null);
  useEffect(() => {
    // Scroll the conversation itself, not the page or its composer (especially on phones).
    const scroller = end.current?.closest<HTMLElement>('.chat-body');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [msgs?.length]);

  const reset = () => (keepDraft(null), setContent(EMPTY), setRich(false), setEdKey((k) => k + 1), setReplyTo(null), setEditing(null), setTyping(c.id, me.key, false));
  // Others see that I am typing (sent at most every few seconds).
  const typedAt = useRef(0);
  // One line until the words reach the buttons (or there is a second line); empty, one line again.
  const oneLine = useRef(0);
  useEffect(() => {
    const pm = boxRef.current?.querySelector<HTMLElement>('.ProseMirror');
    if (!pm) return;
    if (isEmptyContent(content)) {
      oneLine.current = oneLine.current || pm.offsetHeight;
      return setTall(false);
    }
    if (!tall && oneLine.current && pm.scrollHeight > oneLine.current + 6) setTall(true);
  }, [content, tall]);
  const onType = (v: JSONContent) => {
    setContent(v);
    if (!editing) keepDraft(v);
    const now = Date.now();
    if (isEmptyContent(v)) return setTyping(c.id, me.key, false);
    if (now - typedAt.current > 2500) (typedAt.current = now), setTyping(c.id, me.key, true);
  };
  useEffect(() => () => setTyping(c.id, me.key, false), [c.id, me.key]);
  const typing = useTyping(c.id, me.key);
  const send = async () => {
    if (isEmptyContent(content) || busy) return;
    const tasky = blocksIn(content) + questionIds(content).length;
    if (!elementsOk && tasky) return setErr('Your teacher has turned off task elements in messages. Take out the questions to send.');
    setErr('');
    setBusy(true);
    try {
      const { content: body, key } = splitKey(content);
      const m = { text: plainOf(content).trim(), content: body, key, blocks: tasky, mentions: [...new Set(mentionsOf(content))], ...(questionIds(content).length ? { shareAnswers: shareAns } : {}) };
      // The box clears at once (the reply bar too); if sending fails, what was written comes back.
      const was = { content, replyTo, editing };
      const reply = replyTo ? { id: replyTo.id, name: replyTo.name, text: (replyTo.text || (replyTo.blocks ? 'A task element' : replyTo.share ? replyTo.share.title : '')).slice(0, 120) } : null;
      reset();
      try {
        if (was.editing) await editMsg(c, was.editing.id, m);
        else chime('out'), await sendMsg(c, me, { ...m, replyTo: reply });
      } catch (e) {
        console.error(e);
        setContent(was.content);
        setEdKey((k) => k + 1);
        setReplyTo(was.replyTo);
        setEditing(was.editing);
        setErr('We couldn’t send that just now. Check your connection and try again. Your message is still here.');
      }
    } finally {
      setBusy(false);
    }
  };
  const startEdit = (m: Msg) => {
    setEditing(m);
    setReplyTo(null);
    setContent(m.content ? mergeKey(m.content, m.key ?? {}) : EMPTY);
    setEdKey((k) => k + 1);
  };

  const days: [string, Msg[]][] = [];
  for (const m of msgs ?? []) {
    if (m.at <= (c.hidden?.[me.key] ?? 0)) continue; // deleted from my side
    const d = dayOf(m.at);
    if (days[days.length - 1]?.[0] !== d) days.push([d, []]);
    days[days.length - 1][1].push(m);
  }
  const title = chatTitle(c, me.key);
  return (
    <div className="chat">
      <header className="chat-head">
        <button type="button" className="icon-btn chat-back" onClick={onBack} aria-label="All chats">
          <UiIcon name="prev" size={16} />
        </button>
        <span className={'msg-av' + (c.kind === 'group' ? ' group' : '') + (isSelf(c) ? ' self' : '')}>{c.kind === 'group' ? <UiIcon name="groups" size={16} /> : isSelf(c) ? <UiIcon name="pen" size={15} /> : <PersonFace id={c.members.find((k) => k !== me.key)} name={title} size={36} status />}</span>
        <span className="chat-head-t">
          <b data-tip={c.kind === 'dm' && !isSelf(c) ? whoLine(dir, c.members.find((k) => k !== me.key), c.roles[c.members.find((k) => k !== me.key) ?? ''] === 'teacher' ? 'teacher' : 'learner') : undefined}>{title}</b>
          <span className="hint">{isSelf(c) ? (teacher ? 'Only you can see this' : 'Notes for yourself. Your teacher can see class chats') : c.kind === 'group' ? `${c.members.length} people: ${c.members.map((k) => (k === me.key ? 'you' : (c.names[k] ?? '').split(' ')[0])).join(', ')}` : whoLine(dir, c.members.find((k) => k !== me.key), c.roles[c.members.find((k) => k !== me.key) ?? ''] === 'teacher' ? 'teacher' : 'learner')}</span>
        </span>
        {!isSelf(c) && onMin && <CallButtons c={c} me={me} />}
        {c.kind === 'group' && (
          <button type="button" className="btn small-btn" onClick={() => setSettings((s) => !s)}>
            Group
          </button>
        )}
        {onMin && (
          <button type="button" className="btn small-btn chat-min" onClick={onMin} data-tip="Keep this chat in a small window while you work in other apps">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg> Minimise
          </button>
        )}
      </header>
      {settings && c.kind === 'group' && <GroupSettings c={c} me={me} dir={dir} onLeave={() => (leaveGroup(c, me.key), onBack())} />}
      <div className="chat-body">
        {msgs === null && <Loader label="Opening the chat" />}
        {msgs && msgs.length === 0 && <span className="hint chat-start">Say hello. You can tag people with @, and add questions, vocabulary boxes and more from + Add.</span>}
        {days.map(([d, list]) => (
          <div key={d} className="chat-day">
            <span className="chat-day-h">{d}</span>
            {list.map((m, i) => (
              <Bubble
                key={m.id}
                m={m}
                c={c}
                me={me}
                first={i === 0 || list[i - 1].by !== m.by || m.at - list[i - 1].at > 5 * 60000}
                last={i === list.length - 1 || list[i + 1].by !== m.by || list[i + 1].at - m.at > 5 * 60000}
                teacher={teacher}
                onReply={() => (setReplyTo(m), setEditing(null), (document.querySelector('.chat-box .ProseMirror') as HTMLElement | null)?.focus())}
                onForward={() => setForwarding(m)}
                onInfo={() => setInfo(m)}
                receipts={receipts}
                onEdit={() => startEdit(m)}
                onCopy={() => setCopying(m)}
                onOpenShare={(id) => setOpenShare(id)}
              />
            ))}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="chat-typing" aria-live="polite">
        {typing.length > 0 && (
          <>
            <span className="typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {typing.length === 1 ? `${(c.names[typing[0]] ?? 'Someone').split(' ')[0]} is typing…` : typing.length === 2 ? `${typing.map((k) => (c.names[k] ?? '').split(' ')[0]).join(' and ')} are typing…` : 'Several people are typing…'}
          </>
        )}
      </div>
      <div
        className="chat-compose"
        onKeyDownCapture={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
          const cmd = e.metaKey || e.ctrlKey;
          // Not while a menu (insert, tagging) is open: Enter picks from it.
          const menuOpen = !!document.querySelector('.slash-float, .mention-menu');
          // With formatting on, Enter makes a new line; Ctrl or Cmd + Enter sends.
          if (cmd || (enterSends && !rich && !e.shiftKey && !menuOpen && (e.target as HTMLElement).classList.contains('ProseMirror'))) {
            e.preventDefault();
            e.stopPropagation();
            void send();
          }
        }}
      >
        {(replyTo || editing) && (
          <span className="chat-replying">
            <span>
              <b><UiIcon name={editing ? 'edit' : 'reply'} size={13} /> {editing ? 'Editing your message' : `Replying to ${replyTo!.name.split(' ')[0]}`}</b>
              {editing && <span className="hint"> {editing.text.slice(0, 90)}</span>}
              {replyTo && <span className="hint"> {replyTo.text.slice(0, 90) || (replyTo.blocks ? 'A task element' : '')}</span>}
            </span>
            <button type="button" className="btn link small" onClick={reset}>
              Cancel
            </button>
          </span>
        )}
        {err && <span className="error">{err}</span>}
        {/* The writing box starts as one line, with its buttons at the right. When the words reach
            them, the box grows and the buttons move under the words, as in Teams. */}
        {gifOpen && <GifPicker space={'chat:' + c.id} onClose={() => setGifOpen(false)} onPick={(src, alt) => (setGifOpen(false), chime('out'), void sendMsg(c, me, { text: 'GIF', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'picture', attrs: { src, alt, size: 'm', mark: '' } }] }] }, blocks: 0, mentions: [] }).catch(() => setErr('We couldn’t send the GIF. Try again.')))} />}
        <div className={'chat-box' + (tall || rich ? ' tall' : '')} ref={boxRef}>
          <div className={'chat-editor' + (elementsOk ? '' : ' text-only') + (rich ? '' : ' plain')}>
            <TaskEditor handles={false} compact key={edKey} content={content} onChange={onType} label="Message" enterHint={enterSends && !rich ? 'send' : 'enter'} classmates={people} classId={'chat:' + c.id} placeholder="" />
          </div>
          <span className="chat-in">
            {teacher && colleaguesHere.length > 0 && (
              <button type="button" className="icon-btn" onClick={() => void startSessionWith(me, colleaguesHere.map((k) => ({ key: k, name: c.names[k] ?? 'Colleague', role: 'teacher' as const })), '', c)} aria-label="Record together" data-tip="Record together: a recording session with the colleagues here">
                <UiIcon name="mic" size={16} />
              </button>
            )}
            {teacher && colleaguesHere.length > 0 && (
              <button type="button" className="icon-btn" onClick={() => setSharing(true)} aria-label="Share material" data-tip="Share material: a lesson, task, document or media, for colleagues to copy">
                <UiIcon name="link" size={16} />
              </button>
            )}
            <button type="button" className={'icon-btn chat-gif' + (gifOpen ? ' on' : '')} onClick={() => setGifOpen((v) => !v)} aria-label="GIF" aria-expanded={gifOpen} data-tip="Send a GIF">
              GIF
            </button>
            <button type="button" className={'icon-btn chat-rich' + (rich ? ' on' : '')} onClick={() => setRich(!rich)} aria-pressed={rich} aria-label="Formatting" data-tip={rich ? 'Back to plain text' : 'Formatting: bold, colour, lists, IPA and more'}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 18 9 5l5 13M5.8 13.5h6.4M15 19.5h5M16.5 8.5h3.5M16.5 12.5h3.5" />
              </svg>
            </button>
            <button type="button" className="chat-send" disabled={busy || isEmptyContent(content)} onClick={send} aria-label={editing ? 'Save' : 'Send'} data-tip={editing ? 'Save' : 'Send'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {editing ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />}
              </svg>
            </button>
          </span>
        </div>
        {questionIds(content).length > 0 && (
          <span className="chat-actions">
            <label className="chat-opt" data-tip="Each person sees the others’ answers once they’ve sent their own. You always see everyone’s.">
              <input type="checkbox" checked={shareAns} onChange={(e) => setShareAns(e.target.checked)} />
              Others see answers after answering
            </label>
          </span>
        )}
      </div>
      {sharing && <ShareMaterial c={c} me={me} to={colleaguesHere} onClose={() => setSharing(false)} />}
      {forwarding && <ForwardDialog m={forwarding} from={c} me={me} onClose={() => setForwarding(null)} />}
      {info && <MsgInfo m={info} c={c} me={me} receipts={receipts} onClose={() => setInfo(null)} />}
      {openShare && <SharedWindow id={openShare} onClose={() => setOpenShare('')} />}
      {copying && <CopyElement c={c} m={copying} onClose={() => setCopying(null)} />}
    </div>
  );
}

function Bubble({ m, c, me, first, last, teacher, onReply, onEdit, onCopy, onOpenShare, onForward, onInfo, receipts }: { m: Msg; c: Chat; me: Person; first: boolean; last?: boolean; teacher: boolean; onReply: () => void; onEdit: () => void; onCopy: () => void; onOpenShare: (id: string) => void; onForward: () => void; onInfo: () => void; receipts: boolean }) {
  const [armed, setArmed] = useState(false);
  const mine = m.by === me.key;
  const who = c.names[m.by] ?? m.name; // as the class shows it
  const [responses, setResponses] = useState<Responses>({});
  const [checked, setChecked] = useState<AnswerKey | null>(null);
  const qs = useMemo(() => (m.content ? questionIds(m.content) : []), [m.content]);
  const score = checked ? scoreTask(qs, m.key ?? {}, responses) : null;
  // Answers are saved: the sender sees everyone's, the others see theirs (and everyone's once
  // they have answered, if the sender allowed it).
  const ans = useAnswers(c.id, m, me.key, qs.length > 0 && !m.deleted);
  const [viewing, setViewing] = useState<ChatAnswer | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (ans.mine && !checked) setResponses(ans.mine.responses as Responses), setChecked(m.key ?? {});
  }, [ans.mine]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    const sc = scoreTask(qs, m.key ?? {}, responses);
    setChecked(m.key ?? {});
    setSaving(true);
    try {
      await saveAnswer(c.id, m.id, { by: me.key, name: me.name, at: Date.now(), responses: responses as Record<string, unknown>, score: sc.score, total: sc.total });
    } finally {
      setSaving(false);
    }
  };
  const first1 = (n: string) => n.split(' ')[0];
  const tagged = m.mentions?.includes(me.key);
  const [copied, setCopied] = useState(false);
  // On a phone, as in WhatsApp: swipe a message right to reply; swipe your own left for when it
  // was sent, delivered and read.
  const [swipe, setSwipe] = useState<{ dx: number }>({ dx: 0 });
  const touch = useRef<{ x: number; y: number; on: boolean | null } | null>(null);
  const swipeStart = (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, on: null });
  const swipeMove = (e: React.TouchEvent) => {
    const t = touch.current;
    if (!t) return;
    const dx = e.touches[0].clientX - t.x;
    const dy = e.touches[0].clientY - t.y;
    if (t.on === null && Math.hypot(dx, dy) > 10) t.on = Math.abs(dx) > Math.abs(dy) * 1.4; // sideways, not scrolling
    if (!t.on) return;
    const max = 84;
    setSwipe({ dx: dx > 0 ? Math.min(max, dx) : mine && !isSelf(c) ? Math.max(-max, dx) : 0 });
  };
  const swipeEnd = () => {
    const d = swipe.dx;
    touch.current = null;
    setSwipe({ dx: 0 });
    if (d > 56) onReply();
    else if (d < -56) onInfo();
  };
  // On a phone there is no hover: a tap on the message shows Reply, reactions and the rest.
  const [sel, setSelRaw] = useState(false);
  // One message's menu at a time; a tap anywhere else closes it.
  const setSel = (v: boolean | ((x: boolean) => boolean)) =>
    setSelRaw((x) => {
      const n = typeof v === 'function' ? v(x) : v;
      if (n) window.dispatchEvent(new CustomEvent('bub-sel', { detail: m.id }));
      return n;
    });
  useEffect(() => {
    if (!sel) return;
    const other = (e: Event) => (e as CustomEvent).detail !== m.id && setSelRaw(false);
    const away = (e: PointerEvent) => !(e.target as HTMLElement).closest?.(`#m-${CSS.escape(m.id)}`) && setSelRaw(false);
    window.addEventListener('bub-sel', other);
    document.addEventListener('pointerdown', away);
    return () => (window.removeEventListener('bub-sel', other), document.removeEventListener('pointerdown', away));
  }, [sel, m.id]);
  // Copy the message (its text and task elements, with answers) to paste into a task or another chat.
  const clip = (): Clip => ({ v: 1, space: 'chat:' + c.id, content: (m.content ? mergeKey(m.content, m.key ?? {}) : { type: 'doc', content: [] }).content ?? [] });
  // The copy button takes only the task in a message, to paste into a lesson or another message.
  const taskOnly = (): Clip => ({ v: 1, space: 'chat:' + c.id, content: m.content ? taskPartsOf(mergeKey(m.content, m.key ?? {}), (x) => questionIds({ type: 'doc', content: [x] }).length > 0) : [] });
  const hasTask = !!m.blocks && taskOnly().content.length > 0;
  const copy = async () => {
    const t = taskOnly();
    if (await writeClip(t, plainOf({ type: 'doc', content: t.content }))) setCopied(true), window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div
      className={'bub' + (mine ? ' mine' : ' theirs') + (first ? ' first' : '') + (last ? ' last' : '') + (tagged ? ' tagged' : '') + (sel ? ' picked' : '') + (swipe.dx ? ' swiping' : '')}
      id={'m-' + m.id}
      style={swipe.dx ? { transform: `translateX(${swipe.dx}px)` } : undefined}
      onTouchStart={(e) => !m.deleted && swipeStart(e)}
      onTouchMove={swipeMove}
      onTouchEnd={swipeEnd}
      onTouchCancel={() => setSwipe({ dx: 0 })}
    >
      {swipe.dx > 0 && <span className="bub-swipe-ic r" style={{ opacity: Math.min(1, swipe.dx / 60) }} aria-hidden="true"><UiIcon name="reply" size={16} /></span>}
      {swipe.dx < 0 && <span className="bub-swipe-ic l" style={{ opacity: Math.min(1, -swipe.dx / 60) }} aria-hidden="true">i</span>}
      {/* Like a messaging app: the picture by the last message of a run, the name over the first (in groups), the time inside the bubble. */}
      {!mine && (last ? <span className="bub-av">{initial(who)}</span> : <span className="bub-av-space" />)}
      <div className="bub-col">
        {first && !mine && c.kind === 'group' && (
          <span className="bub-who">
            <b>{who.split(' ')[0]}</b>
            {m.role === 'teacher' && <span className="ld-tag">Teacher</span>}
          </span>
        )}
        <div className={'bub-box' + (m.fwd ? ' fwd' : '')} onClick={(e) => !m.deleted && !(e.target as HTMLElement).closest('button, a, input, textarea, select, label, .ProseMirror [contenteditable], [role=button]') && setSel((v) => !v)}>
          {m.replyTo && (
            <button type="button" className="bub-quote" onClick={() => document.getElementById('m-' + m.replyTo!.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
              <b>{m.replyTo.name.split(' ')[0]}</b> {m.replyTo.text}
            </button>
          )}
          {m.deleted ? (
            <span className="hint bub-del">
              Message deleted
              {mine && <UndoDelete c={c} id={m.id} />}
            </span>
          ) : (
            <>
              {m.fwd && (
                <span className="bub-fwd-h">
                  <ForwardIcon /> Forwarded · {m.fwd.name.split(' ')[0]}, {dayText(m.fwd.at)} {clock(m.fwd.at)}
                </span>
              )}
              {callOf(m) && <CallCard m={m} c={c} me={me} mine={mine} />}
              {m.content && !isEmptyContent(m.content) && !(fileOf(m) && !m.file && /^I shared .* with you/.test(m.text)) && (
                <div className={'bub-doc doc' + (m.blocks ? ' has-blocks' : '')} onCopy={(e) => setClip(e, clip(), window.getSelection()?.toString() || m.text)}>
                  <TaskRenderer content={m.content} responses={viewing ? (viewing.responses as Responses) : responses} onChange={(id, r) => !viewing && setResponses((x) => ({ ...x, [id]: r }))} results={viewing ? m.key ?? {} : checked} revealed={showKey && !viewing ? m.key ?? {} : null} classId={'chat:' + c.id} classmates={c.members.map((k) => ({ id: k, name: c.names[k] ?? '' }))} selfId={me.key} />
                </div>
              )}
              {viewing && (
                <span className="bub-viewing">
                  {viewing.by === me.key ? 'Your answers' : `${first1(viewing.name)}’s answers`}
                  <button type="button" className="btn link small" onClick={() => setViewing(null)}>
                    {mine ? 'Hide' : 'Back to mine'}
                  </button>
                </span>
              )}
              {qs.length > 0 && mine && !viewing && (
                <span className="bub-check">
                  {checked ? (
                    <>
                      <span className="ld-pct">{score!.total ? `${score!.score} of ${score!.total}` : 'Checked'}</span>
                      <button type="button" className="btn link small" onClick={() => (setChecked(null), setResponses({}))}>
                        Try again
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn small-btn" disabled={!Object.keys(responses).length} onClick={() => setChecked(m.key ?? {})} data-tip="Only you see this check">
                      Check
                    </button>
                  )}
                  <button type="button" className={'btn small-btn bub-key' + (showKey ? ' on' : '')} onClick={() => setShowKey((v) => !v)} aria-pressed={showKey}>
                    <UiIcon name="check" size={13} /> {showKey ? 'Hide the answers' : 'Show the answers'}
                  </button>
                </span>
              )}
              {qs.length > 0 && !mine && !viewing && (
                <span className="bub-check">
                  {checked ? (
                    <>
                      <span className="ld-pct">{score!.total ? `${score!.score} of ${score!.total}` : 'Sent'}</span>
                      <button type="button" className="btn link small" onClick={() => (setChecked(null), setResponses({}))}>
                        Try again
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn small-btn primary" disabled={saving || !Object.keys(responses).length} onClick={() => void submit()}>
                      Send my answers
                    </button>
                  )}
                </span>
              )}
              {qs.length > 0 && (ans.all ? (
                <span className="bub-answers">
                  <span className="bub-answers-h">{ans.all.length ? `Answers · ${ans.all.length}` : 'No answers yet'}</span>
                  {ans.all.map((a) => (
                    <button key={a.by} type="button" className={'bub-ans' + (viewing?.by === a.by ? ' on' : '')} onClick={() => setViewing(viewing?.by === a.by ? null : a)}>
                      <span className="bub-ans-av">{initial(a.name)}</span>
                      {a.by === me.key ? 'You' : first1(a.name)}
                      <b>{a.total ? `${a.score}/${a.total}` : '✓'}</b>
                    </button>
                  ))}
                </span>
              ) : !mine && (
                <span className="hint bub-answers-note">{m.shareAnswers ? 'Answer to see everyone’s answers.' : `Only ${first1(who)} sees the answers.`}</span>
              ))}
              {fileOf(m) && <FileCard id={fileOf(m)!} hint={m.file} />}
              {m.share && (
                <button type="button" className="bub-share" onClick={() => onOpenShare(m.share!.id)}>
                  <FileIcon kind={(m.share.kind as FileKind) || 'lesson'} size={36} />
                  <span className="sh-pt">
                    <b>{m.share.title}</b>
                    <span className="hint">
                      {m.share.kind === 'lesson' ? 'Lesson' : m.share.kind === 'task' ? 'Task' : m.share.kind === 'doc' ? 'Shared document' : 'Media'} from {m.share.ownerName} · open, then make your own copy
                    </span>
                  </span>
                </button>
              )}
            </>
          )}
          <span className="bub-meta">
            {m.edited && !m.deleted && <span>edited · </span>}
            {clock(m.at)}
            {mine && !m.deleted && !isSelf(c) && <Ticks t={tickOf(c, m, me.key, receipts)} />}
          </span>
        </div>
        {m.reactions && Object.values(m.reactions).some((l) => l.length) && (
          <span className="bub-reacts">
            {Object.entries(m.reactions).filter(([, l]) => l.length).map(([k, l]) => (
              <button key={k} type="button" className={'bub-react' + (l.includes(me.key) ? ' on' : '')} onClick={() => react(c, m, k, me.key)} title={l.map((x) => (x === me.key ? 'You' : c.names[x] ?? '')).join(', ')}>
                {iconByKey(k) ? <Icon name={k} size="16" /> : WORD_REACTS[k] ?? k} <b>{l.length}</b>
              </button>
            ))}
          </span>
        )}
        {!m.deleted && (
          <span className="bub-tools">
            <button type="button" className="bt-i" onClick={onReply} aria-label="Reply" data-tip="Reply">
              <UiIcon name="reply" size={16} />
            </button>
            {!callOf(m) && (
              <button type="button" className="bt-i" onClick={onForward} aria-label="Forward" data-tip="Forward to another chat">
                <ForwardIcon />
              </button>
            )}
            {mine && !isSelf(c) && (
              <button type="button" className="bt-i" onClick={onInfo} aria-label="Message info" data-tip="When it was sent, delivered and read">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></svg>
              </button>
            )}
            <span className="bub-emo">
              {QUICK_REACTS.map((k) => (
                <button key={k} type="button" className={(m.reactions?.[k] ?? []).includes(me.key) ? 'on' : ''} onClick={() => react(c, m, k, me.key)} aria-label={iconByKey(k)?.label} data-tip={iconByKey(k)?.label}>
                  <Icon name={k} size="17" />
                </button>
              ))}
              <MoreReacts onPick={(k) => react(c, m, k, me.key)} />
            </span>
            {hasTask && (
              <button type="button" className={'bt-i' + (copied ? ' on' : '')} onClick={copy} aria-label="Copy the task" data-tip={copied ? 'Copied' : 'Copy the task, to paste into a lesson or another message'}>
                <UiIcon name={copied ? 'check' : 'copyall'} size={16} />
              </button>
            )}
            {teacher && !!m.blocks && (
              <button type="button" className="bt-i" onClick={onCopy} aria-label="Copy to a lesson" data-tip="Copy to a lesson">
                <UiIcon name="import" size={16} />
              </button>
            )}
            {mine && (
              <>
                <button type="button" className="bt-i" onClick={onEdit} aria-label="Edit" data-tip="Edit">
                  <UiIcon name="edit" size={16} />
                </button>
                {/* Delete asks once, in place: a second click deletes it for everyone. */}
                <button type="button" className={'bt-i' + (armed ? ' bt-armed' : '')} onClick={() => (armed ? (setArmed(false), void deleteWithUndo(c, m)) : (setArmed(true), window.setTimeout(() => setArmed(false), 3000)))} aria-label={armed ? 'Click again to delete for everyone' : 'Delete'} data-tip={armed ? 'Click again to delete for everyone' : 'Delete'}>
                  {armed ? <span className="bt-sure">Delete?</span> : <UiIcon name="trash" size={16} />}
                </button>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function GroupSettings({ c, me, dir, onLeave }: { c: Chat; me: Person; dir: Directory; onLeave: () => void }) {
  const [name, setName] = useState(c.title ?? '');
  const [adding, setAdding] = useState<Person[] | null>(null);
  return (
    <div className="chat-settings">
      <label className="field">
        Group name
        <span className="sh-link">
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="btn small-btn" disabled={!name.trim() || name === c.title} onClick={() => renameGroup(c, name)}>
            Save
          </button>
        </span>
      </label>
      <span className="chat-members">
        {c.members.map((k) => (
          <span key={k} className="ap-chip">
            {k === me.key ? 'You' : c.names[k]}
          </span>
        ))}
      </span>
      {adding ? (
        <>
          <PeoplePicker dir={dir} picked={adding} exclude={c.members} onToggle={(p) => setAdding((x) => (x!.some((y) => y.key === p.key) ? x!.filter((y) => y.key !== p.key) : [...x!, p]))} />
          <span className="sh-foot">
            <button type="button" className="btn" onClick={() => setAdding(null)}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={!adding.length} onClick={() => (addToGroup(c, adding), setAdding(null))}>
              Add {adding.length || ''}
            </button>
          </span>
        </>
      ) : (
        <span className="sh-foot" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn small-btn" onClick={() => setAdding([])}>
            + Add people
          </button>
          <button type="button" className="btn link small" onClick={() => void ask('Leave this group?').then((ok) => { if (ok) onLeave(); })}>
            Leave the group
          </button>
        </span>
      )}
    </div>
  );
}

// Teachers: send a lesson, task, shared document or media to colleagues in the chat.
function ShareMaterial({ c, me, to, onClose }: { c: Chat; me: Person; to: string[]; onClose: () => void }) {
  const { user } = useAuth();
  const archive = useArchive(user?.uid);
  const [tab, setTab] = useState<'lesson' | 'task' | 'doc' | 'media'>('lesson');
  const [lib, setLib] = useState<Awaited<ReturnType<typeof loadLibrary>> | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (user) loadLibrary(user.uid).then(setLib, () => setLib({ classes: [], tasks: [], docs: [] }));
  }, [user]);
  const lessons = useMemo(() => {
    const seen = new Map<string, { classId: string; itemId: string; title: string; className: string }>();
    for (const t of lib?.tasks ?? []) if (!seen.has(t.classId + t.itemId)) seen.set(t.classId + t.itemId, { classId: t.classId, itemId: t.itemId, title: t.itemTitle, className: t.className });
    return [...seen.values()];
  }, [lib]);
  const s = q.trim().toLowerCase();
  type Row = { id: string; title: string; sub: string; go: () => Parameters<typeof createShare>[0] };
  const base = { owner: me.key, ownerName: me.name, ownerEmail: user?.email ?? '', mode: 'people' as const, people: to, notes: false, about: '' };
  const rows: Row[] =
    tab === 'lesson'
      ? lessons.map((l) => ({ id: l.classId + l.itemId, title: l.title, sub: l.className, go: () => ({ ...base, kind: 'lesson', title: l.title, src: { classId: l.classId, itemId: l.itemId } }) }))
      : tab === 'task'
        ? (lib?.tasks ?? []).map((t) => ({ id: t.classId + t.id, title: t.title, sub: `${t.className} · ${t.itemTitle}`, go: () => ({ ...base, kind: 'task', title: t.title, about: t.instructions, src: { classId: t.classId, itemId: t.itemId, taskId: t.id } }) }))
        : tab === 'doc'
          ? (lib?.docs ?? []).map((d) => ({ id: d.classId + d.key, title: d.title, sub: `${d.className} · ${d.kind === 'slides' ? 'Slides' : 'Collab document'}`, go: () => ({ ...base, kind: 'doc', title: d.title, src: { classId: d.classId, docKey: d.key, docKind: d.kind } }) }))
          : (archive ?? []).map((a) => ({ id: a.id, title: a.name, sub: a.kind === 'image' ? 'Picture' : a.kind === 'audio' ? 'Sound' : 'Video', go: () => ({ ...base, kind: 'media', title: a.name, src: { archiveId: a.id }, archive: JSON.parse(JSON.stringify({ kind: a.kind, name: a.name, tags: a.tags, size: a.size, link: a.link, home: a.home, thumb: a.thumb, script: a.script, duration: a.duration })) }) }));
  const list = rows.filter((r) => !s || `${r.title} ${r.sub}`.toLowerCase().includes(s)).slice(0, 80);
  const send = async (r: Row) => {
    setBusy(r.id);
    try {
      const sh = r.go();
      const id = await createShare(sh);
      await sendMsg(c, me, { text: '', content: null, share: { id, title: sh.title, kind: sh.kind, ownerName: me.name } });
      onClose();
    } catch (e) {
      console.error(e);
      setBusy('');
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog it-dialog" role="dialog" aria-label="Share material" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Share material</h2>
        <span className="hint">Colleagues in this chat get a read-only copy they can copy into their own classes.</span>
        <span className="seg small-seg">
          {(
            [
              ['lesson', 'Lessons'],
              ['task', 'Tasks'],
              ['doc', 'Collab documents'],
              ['media', 'Media'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </span>
        <input aria-label="Search" className="ma-search" type="search" value={q} placeholder="Search" onChange={(e) => setQ(e.target.value)} />
        <div className="it-list">
          {!lib && tab !== 'media' ? (
            <span className="hint">Gathering your materials…</span>
          ) : list.length === 0 ? (
            <span className="hint">Nothing here yet.</span>
          ) : (
            list.map((r) => (
              <button key={r.id} type="button" className="it-row" disabled={!!busy} onClick={() => send(r)}>
                <span className="it-t">
                  <b>{r.title}</b>
                  <span className="hint">{r.sub}</span>
                </span>
                <span className="hint">{busy === r.id ? 'Sharing…' : 'Send'}</span>
              </button>
            ))
          )}
        </div>
        <span className="sh-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </span>
      </div>
    </div>
  );
}

// Teachers: a task element from a message, copied into one of their lessons as a new task.
function CopyElement({ c, m, onClose }: { c: Chat; m: Msg; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [toClass, setToClass] = useState('');
  const [lessons, setLessons] = useState<{ id: string; title: string }[]>([]);
  const [toItem, setToItem] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    allTeacherClasses(user.uid).then((all) => {
      const l = all.filter((x) => x.status === 'active' && canEdit(x, user.uid)).sort((a, b) => a.name.localeCompare(b.name));
      setClasses(l);
      setToClass(l[0]?.id ?? '');
    });
  }, [user]);
  useEffect(() => {
    if (!toClass) return;
    getDocs(collection(db, 'classes', toClass, 'items')).then((s) => {
      const l = s.docs.map((d) => ({ id: d.id, title: String(d.data().title ?? 'Untitled'), order: Number(d.data().order ?? 0) })).sort((a, b) => a.order - b.order);
      setLessons(l);
      setToItem(l[0]?.id ?? '');
    });
  }, [toClass]);
  const go = async () => {
    if (!m.content) return;
    setBusy(true);
    try {
      const full = mergeKey(m.content, m.key ?? {});
      const map = await carryMedia('chat:' + c.id, toClass, [full]);
      const ex = await getDocs(tasksCol(toClass, toItem));
      const order = ex.docs.reduce((x, d) => Math.max(x, Number((d.data() as DocumentData).order ?? 0)), -1) + 1;
      const id = await addTask(toClass, toItem, order, 'task', { title: `From ${m.name.split(' ')[0]}`, instructions: '', content: remap(full, map) as JSONContent });
      navigate(`/class/${toClass}/lesson/${toItem}?task=${id}`);
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Copy to a lesson" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Copy to a lesson</h2>
        <span className="hint">The message becomes a new task in the lesson you choose, with its answers.</span>
        <label className="field">
          Class
          <NSelect value={toClass} onChange={(e) => setToClass(e.target.value)}>
            {classes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </NSelect>
        </label>
        <label className="field">
          Lesson
          <NSelect value={toItem} onChange={(e) => setToItem(e.target.value)}>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </NSelect>
        </label>
        <span className="sh-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={busy || !toItem} onClick={go}>
            {busy ? 'Copying…' : 'Copy'}
          </button>
        </span>
      </div>
    </div>
  );
}

function PrivateMessages() {
  return (
    <div className="shell">
      <TopBar />
      <div className="msg-empty msg-private">
        <UiIcon name="lock" size={30} />
        <strong>Messages are private</strong>
        <span className="hint">Learners’ messages are only for the people in each chat. Viewing as a learner doesn’t open them, and teachers can’t read them.</span>
        <Link className="btn" to="/">
          Back
        </Link>
      </div>
    </div>
  );
}

function MoreReacts({ onPick }: { onPick: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLSpanElement>(open, () => setOpen(false));
  return (
    <span className="bub-more" ref={ref}>
      <button type="button" aria-label="More emoji" title="More emoji" onClick={() => setOpen((o) => !o)}>
        +
      </button>
      {open && (
        <span className="hl-pop emo-pop bub-emo-pop">
          <IconGrid onPick={(k) => (onPick(k), setOpen(false))} />
        </span>
      )}
    </span>
  );
}

// Sounds, and (for teachers) an email when messages wait unread.
function MsgSettings({ uid }: { uid: string }) {
  const [open, setOpen] = useState(false);
  const [sounds, setS] = useState(soundsOn());
  const [appOpen, setAppOpen] = useState(false);
  const prefs = useMsgPrefs(uid || undefined);
  const ref = useDismiss<HTMLSpanElement>(open, () => setOpen(false));
  return (
    <span className="msg-set" ref={ref}>
      {appOpen && <AppSetupDialog onClose={() => setAppOpen(false)} />}
      <button type="button" className="cd-icon" aria-label="Message settings" data-tip="Sounds, read receipts and email" onClick={() => setOpen((o) => !o)}>
        <UiIcon name="bell" size={15} />
      </button>
      {open && (
        <span className="menu msg-set-menu" role="menu">
          <label className="switch-row">
            <span>
              Sounds
              <span className="hint">A soft chime when a message comes in</span>
            </span>
            <input type="checkbox" checked={sounds} onChange={(e) => (setSounds(e.target.checked), setS(e.target.checked), e.target.checked && chime('in'))} />
          </label>
          <button type="button" className="btn link small msg-push-link" onClick={() => (setAppOpen(true), setOpen(false))}>
            Notifications on this device…
          </button>
          {uid && (
            <>
              <label className="switch-row">
                <span>
                  Read receipts
                  <span className="hint">{prefs.receipts !== false ? 'Others see when you’ve read their messages, and you see when they’ve read yours' : 'Off: nobody sees when you’ve read, and you don’t see when others have'}</span>
                </span>
                <input type="checkbox" checked={prefs.receipts !== false} onChange={(e) => saveMsgPrefs(uid, { ...prefs, receipts: e.target.checked })} />
              </label>
              <label className="switch-row">
                <span>
                  Email me about unread messages
                  <span className="hint">A short summary of what’s waiting</span>
                </span>
                <input type="checkbox" checked={prefs.email} onChange={(e) => saveMsgPrefs(uid, { ...prefs, email: e.target.checked })} />
              </label>
              {prefs.email && (
                <label className="field msg-after">
                  When they stay unread for
                  <NSelect value={prefs.after} onChange={(e) => saveMsgPrefs(uid, { ...prefs, after: Number(e.target.value) })}>
                    {AFTER.map(([m, l]) => (
                      <option key={m} value={m}>
                        {l}
                      </option>
                    ))}
                  </NSelect>
                </label>
              )}
            </>
          )}
        </span>
      )}
    </span>
  );
}

// "Undo" next to a message you deleted, for a minute.
function UndoDelete({ c, id }: { c: Chat; id: string }) {
  const [until, setUntil] = useState(() => undoUntil(id));
  useEffect(() => {
    if (!until) return;
    const t = window.setTimeout(() => setUntil(0), Math.max(0, until - Date.now()));
    return () => window.clearTimeout(t);
  }, [until]);
  if (!until) return null;
  return (
    <button type="button" className="btn link small bub-undo" onClick={(e) => (e.stopPropagation(), void undoDelete(c, id))}>
      Undo
    </button>
  );
}

const ForwardIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 5l7 7-7 7M21 12H10a6 6 0 0 0-6 6v1" />
  </svg>
);
const dayText = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'today';
  if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return 'yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

// Sent (one grey tick), delivered (two grey), read (two in colour).
function Ticks({ t }: { t: Tick }) {
  const label = t === 'read' ? 'Read' : t === 'got' ? 'Delivered' : 'Sent';
  return (
    <span className={'bub-ticks t-' + t} aria-label={label} title={label}>
      <svg width={t === 'sent' ? 12 : 16} height="10" viewBox={t === 'sent' ? '0 0 12 10' : '0 0 16 10'} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 5.5 4 8.5 10.5 1.5" />
        {t !== 'sent' && <path d="M7.5 8 8 8.5 14.5 1.5" />}
      </svg>
    </span>
  );
}

// Your message: when it was sent, and when each person got it and read it.
function MsgInfo({ m, c, me, receipts, onClose }: { m: Msg; c: Chat; me: Person; receipts: boolean; onClose: () => void }) {
  const others = c.members.filter((k) => k !== me.key);
  const when = (t: number) => `${dayText(t)}, ${clock(t)}`;
  const row = (k: string) => {
    const read = receipts && (c.read?.[k] ?? 0) >= m.at ? c.read![k] : 0;
    const got = Math.max(c.got?.[k] ?? 0, c.read?.[k] ?? 0, c.seen?.[k] ?? 0) >= m.at;
    return (
      <li key={k}>
        <PersonFace id={k} name={c.names[k] ?? ''} size={30} />
        <span className="mi-who">
          <b>{c.names[k] ?? 'Someone'}</b>
          <span className="hint">{read ? `Read by ${when(read)}` : got ? 'Delivered, not read yet' : 'Not delivered yet: their app isn’t open'}</span>
        </span>
        <Ticks t={read ? 'read' : got ? 'got' : 'sent'} />
      </li>
    );
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog mi-dialog" role="dialog" aria-label="Message info" onClick={(e) => e.stopPropagation()}>
        <h2>Message info</h2>
        <p className="mi-text">{m.text || (m.file ? m.file.title : m.share ? m.share.title : 'A task element')}</p>
        <p className="hint">Sent {when(m.at)}</p>
        <ul className="mi-list">{others.map(row)}</ul>
        {!receipts && <p className="hint">Your read receipts are off, so you don’t see when others read your messages. Turn them on under the bell in Messages.</p>}
        <div className="row-between" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Forward a message to other chats: it arrives in a frame saying who sent it first, and when.
function ForwardDialog({ m, from, me, onClose }: { m: Msg; from: Chat; me: Person; onClose: () => void }) {
  const chats = useChats(me.key);
  const dirAll = useDirectory();
  const list = useMemo(() => withShownNames(chats, dirAll?.nameFor) ?? [], [chats, dirAll]);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const s = q.trim().toLowerCase();
  const shown = list.filter((x) => x.id !== from.id && (!s || chatTitle(x, me.key).toLowerCase().includes(s))).slice(0, 60);
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      for (const id of picked) {
        const to = list.find((x) => x.id === id);
        if (!to) continue;
        let content = m.content ?? null;
        // Pictures in it come along, so the people there can see them.
        if (content) {
          const map = await carryMedia('chat:' + from.id, 'chat:' + to.id, [content]).catch(() => ({}) as Record<string, string>);
          content = remap(content, map) as JSONContent;
        }
        await sendMsg(to, me, {
          text: m.text,
          content,
          ...(m.key ? { key: m.key } : {}),
          blocks: m.blocks ?? 0,
          mentions: [],
          share: m.share ?? null,
          file: m.file ?? null,
          fwd: m.fwd ?? { name: from.names[m.by] ?? m.name, at: m.at },
        });
      }
      onClose();
    } catch (e) {
      console.error(e);
      setErr('We couldn’t forward it just now. Check your connection and try again.');
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog fw-dialog" role="dialog" aria-label="Forward" onClick={(e) => e.stopPropagation()}>
        <h2>Forward to…</h2>
        <input className="fw-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a chat" aria-label="Find a chat" autoFocus />
        <ul className="fw-list">
          {shown.map((x) => {
            const on = picked.includes(x.id);
            const other = x.kind === 'dm' ? x.members.find((k) => k !== me.key) : undefined;
            return (
              <li key={x.id}>
                <label className={on ? 'on' : ''}>
                  <input type="checkbox" checked={on} onChange={() => setPicked((p) => (on ? p.filter((y) => y !== x.id) : [...p, x.id]))} />
                  {other ? <PersonFace id={other} name={chatTitle(x, me.key)} size={28} /> : <span className="fw-g"><UiIcon name="groups" size={15} /></span>}
                  <span>{chatTitle(x, me.key)}</span>
                </label>
              </li>
            );
          })}
          {!shown.length && <li className="hint">No other chats yet.</li>}
        </ul>
        {err && <span className="error">{err}</span>}
        <div className="row-between" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!picked.length || busy} onClick={() => void go()}>
            {busy ? 'Forwarding…' : picked.length > 1 ? `Forward to ${picked.length} chats` : 'Forward'}
          </button>
        </div>
      </div>
    </div>
  );
}
