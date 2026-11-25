import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useTeacherClasses } from '../lib/coteach';
import { useMyDocs, KIND_LABEL, type SharedDoc } from '../lib/sharedDocs';
import { useArchive } from '../lib/archive';
import { msgsCol, useChats, type Chat } from '../lib/chat';
import { SUITE_APPS } from '../components/AppGrid';
import { HUB_ACTIVITIES } from '../resourceHub/catalog';
import { usePublishedHubResources } from '../resourceHub/usePublishedHubResources';
import { kvGet, kvSet } from './kv';
import { indexed, type Entry, type Indexed } from './engine';

// Everything search looks through, for the person signed in. Names come from what the app already
// loads. The words inside messages and documents are kept in the browser (kv.ts) and topped up with
// only what is new since last time, so the first search is quick and later ones instant.

const ms = (t: unknown) => (t && typeof (t as { toMillis?: () => number }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : typeof t === 'number' ? t : 0);
const DOC_ICON: Record<string, string> = { doc: 'collab', flash: 'cards', pd: 'reading', lesson: 'classes', pdf: 'pdf', design: 'design', game: 'games', file: 'archive' };
const GUIDE: [string, string][] = [['start', 'One place for all your teaching'], ['blend', 'Teach your way: choose your blend'], ['lessons', 'Lessons and tasks'], ['questions', 'Question types'], ['notation', 'Language notation'], ['live', 'Teaching live'], ['games', 'Games and activities'], ['progress', 'Marking and progress'], ['studio', 'Studio: record and edit sound'], ['print', 'PDFs, printing and worksheets'], ['files', 'My Files and their apps'], ['week', 'Timetable and Rooms'], ['share', 'Colleagues and Messages'], ['org', 'Running an organisation']];
const SETTINGS: [string, string, string][] = [['Settings', '/settings', 'Your name, picture, password, language, notifications and theme'], ['Notifications', '/settings#notifications', 'Emails and alerts you get'], ['Your account', '/settings#account', 'Email, password and signing in']];

type MsgRow = { id: string; at: number; text: string; name: string };
type MsgCache = { upTo: number; rows: MsgRow[] };
const PER_CHAT = 3000;

async function chatMessages(me: string, c: Chat): Promise<MsgRow[]> {
  const key = `m:${me}:${c.id}`;
  const cached = (await kvGet<MsgCache>(key)) ?? { upTo: 0, rows: [] };
  if (c.lastAt <= cached.upTo) return cached.rows;
  const since = cached.upTo;
  const snap = await getDocs(since ? query(msgsCol(c.id), where('at', '>', since), orderBy('at', 'asc'), limit(2000)) : query(msgsCol(c.id), orderBy('at', 'desc'), limit(1500)));
  const fresh = snap.docs.map((d) => { const x = d.data(); return { id: d.id, at: Number(x.at) || 0, text: x.deleted ? '' : String(x.text ?? x.share?.title ?? x.file?.title ?? ''), name: String(x.name ?? '') }; });
  const byId = new Map(cached.rows.map((r) => [r.id, r]));
  for (const r of fresh) byId.set(r.id, r);
  const hiddenBefore = c.hidden?.[me] ?? 0;
  const rows = [...byId.values()].filter((r) => r.text && r.at > hiddenBefore).sort((a, b) => a.at - b.at).slice(-PER_CHAT);
  const upTo = Math.max(since, ...rows.map((r) => r.at));
  void kvSet(key, { upTo, rows });
  return rows;
}

type TextCache = { u: number; text: string };
const changedAt = (d: SharedDoc) => Math.max(ms(d.updatedAt), d.searchAt ?? 0);
async function docText(d: SharedDoc): Promise<string> {
  const u = changedAt(d);
  const key = `d:${d.id}`;
  const cached = await kvGet<TextCache>(key);
  if (cached && cached.u === u) return cached.text;
  let text = '';
  try {
    if (d.kind === 'pdf') {
      const s = await getDocs(collection(db, 'sharedDocs', d.id, 'ocr'));
      text = s.docs.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1))).map((x) => String(x.get('text') ?? '')).join('\n');
    }
    const t = await getDoc(doc(db, 'sharedDocs', d.id, 'index', 'text'));
    if (t.exists()) text = [text, String(t.get('text') ?? '')].filter(Boolean).join('\n');
  } catch { /* no words for this one */ }
  void kvSet(key, { u, text: text.slice(0, 200_000) });
  return text;
}

// A few at a time, so a long list does not hold everything up.
async function each<T>(list: T[], n: number, f: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await f(list[i++]).catch(() => {}); }));
}

export function useSearchIndex(active: boolean): { entries: Indexed[]; status: string } {
  const { user, profile } = useAuth();
  const teacher = profile?.role === 'teacher';
  const uid = user?.uid;
  const me = profile?.role === 'learner' ? profile.learnerId : teacher ? uid : undefined;
  const { classes } = useTeacherClasses(active && teacher ? uid : undefined);
  const docs = useMyDocs(active && teacher ? uid : undefined);
  const archive = useArchive(active && teacher ? uid : undefined);
  const chats = useChats(active ? me : undefined);
  const hub = usePublishedHubResources();
  const [msgEntries, setMsgEntries] = useState<Entry[]>([]);
  const [textOf, setTextOf] = useState<Record<string, string>>({});
  const [classEntries, setClassEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState<string[]>([]);
  const work = (k: string, on: boolean) => setBusy((b) => (on ? [...new Set([...b, k])] : b.filter((x) => x !== k)));

  // Messages: every chat's words.
  const chatKey = (chats ?? []).map((c) => c.id + ':' + c.lastAt).join();
  const lastChats = useRef('');
  useEffect(() => {
    if (!active || !me || !chats || lastChats.current === chatKey) return;
    lastChats.current = chatKey;
    let live = true;
    work('messages', true);
    const out: Entry[] = [];
    void each(chats, 4, async (c) => {
      const title = c.title || Object.entries(c.names).filter(([k]) => k !== me).map(([, v]) => v).join(', ') || 'Chat';
      for (const r of await chatMessages(me, c)) out.push({ key: `msg:${c.id}:${r.id}`, group: 'Messages', title: r.name ? `${r.name} in ${title}` : title, text: r.text, to: `/messages?c=${encodeURIComponent(c.id)}&m=${encodeURIComponent(r.id)}`, at: r.at, icon: 'message' });
    }).then(() => { if (live) { setMsgEntries(out); work('messages', false); } });
    return () => { live = false; work('messages', false); };
  }, [active, me, chatKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Words inside Collab documents and scanned PDFs.
  const allDocs = useMemo(() => [...(docs.mine ?? []), ...(docs.withMe ?? []).filter((d) => !docs.mine?.some((m) => m.id === d.id))], [docs.mine, docs.withMe]);
  const docKey = allDocs.filter((d) => d.kind === 'doc' || d.kind === 'pdf').map((d) => d.id + ':' + changedAt(d)).join();
  const lastDocs = useRef('');
  useEffect(() => {
    if (!active || !docs.mine || lastDocs.current === docKey) return;
    lastDocs.current = docKey;
    let live = true;
    work('documents', true);
    const next: Record<string, string> = {};
    void each(allDocs.filter((d) => d.kind === 'doc' || d.kind === 'pdf'), 6, async (d) => { next[d.id] = await docText(d); }).then(() => { if (live) { setTextOf(next); work('documents', false); } });
    return () => { live = false; work('documents', false); };
  }, [active, docKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Classes: their lessons and learners.
  const classKey = (classes ?? []).map((c) => c.id).join();
  useEffect(() => {
    if (!active || !classes) return;
    let live = true;
    work('classes', true);
    const out: Entry[] = [];
    void each(classes, 4, async (c) => {
      const cls = c as unknown as { id: string; name: string; level?: string; code?: string; status?: string };
      out.push({ key: 'class:' + c.id, group: 'Classes', title: cls.name || 'Class', sub: [cls.level, cls.status === 'archived' ? 'Archived' : ''].filter(Boolean).join(' · '), text: cls.code ? `Class code ${cls.code}` : '', to: `/class/${c.id}`, icon: 'classes' });
      const [items, learners, topics] = await Promise.all([
        getDocs(collection(db, 'classes', c.id, 'items')).catch(() => null),
        getDocs(collection(db, 'classes', c.id, 'learners')).catch(() => null),
        getDocs(collection(db, 'classes', c.id, 'topics')).catch(() => null),
      ]);
      const topicName = new Map((topics?.docs ?? []).map((t) => [t.id, String(t.get('name') ?? '')]));
      for (const t of topics?.docs ?? []) if (t.get('name')) out.push({ key: `topic:${c.id}:${t.id}`, group: 'Lessons', title: String(t.get('name')), sub: `Topic · ${cls.name}`, to: `/class/${c.id}`, icon: 'folder' });
      for (const it of items?.docs ?? []) {
        const x = it.data();
        if (x.deletedAt || x.kind === 'topic') continue;
        const outline = Array.isArray(x.lockedTaskOutlines) ? x.lockedTaskOutlines.map((o: { title?: string }) => o.title ?? '').join(' · ') : '';
        out.push({ key: `lesson:${c.id}:${it.id}`, group: 'Lessons', title: String(x.title || 'Lesson'), sub: [cls.name, topicName.get(x.topicId) ?? '', x.type && x.type !== 'lesson' ? String(x.type) : ''].filter(Boolean).join(' · '), text: outline, to: `/class/${c.id}/lesson/${it.id}`, at: Number(x.updatedAt) || Number(x.createdAt) || undefined, icon: 'lesson' });
      }
      for (const l of learners?.docs ?? []) {
        const x = l.data();
        out.push({ key: `learner:${c.id}:${l.id}`, group: 'Learners', title: String(x.displayName || 'Learner'), sub: cls.name, to: `/class/${c.id}?learner=${encodeURIComponent(l.id)}`, icon: 'person' });
      }
    }).then(() => { if (live) { setClassEntries(out); work('classes', false); } });
    return () => { live = false; work('classes', false); };
  }, [active, classKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = useMemo(() => {
    const out: Entry[] = [];
    for (const a of SUITE_APPS) if (a.to && (teacher || !a.teacher)) out.push({ key: 'app:' + a.k, group: 'Apps', title: a.name, text: a.about, to: a.to, icon: a.k });
    if (teacher) {
      for (const [id, t] of GUIDE) out.push({ key: 'guide:' + id, group: 'Help', title: t, sub: 'Guide', to: `/guide#${id}`, icon: 'help' });
      for (const [t, to, about] of SETTINGS) out.push({ key: 'set:' + to, group: 'Help', title: t, text: about, to, icon: 'settings' });
      for (const d of allDocs) out.push({ key: 'doc:' + d.id, group: 'Files', title: d.title || 'Untitled', sub: [KIND_LABEL[d.kind] ?? 'File', d.owner !== uid ? `from ${d.ownerName}` : '', d.path || d.folder || ''].filter(Boolean).join(' · '), text: [textOf[d.id], d.file?.name].filter(Boolean).join('\n'), to: `/doc/${d.id}`, at: ms(d.updatedAt) || ms(d.createdAt), icon: DOC_ICON[d.kind] ?? 'archive' });
      for (const a of archive ?? []) if (!a.deletedAt) out.push({ key: 'arc:' + a.id, group: 'Files', title: a.name, sub: ['My Files', a.kind === 'audio' ? 'Recording' : a.kind, a.folder].filter(Boolean).join(' · '), text: [a.tags.join(' '), (a.script ?? []).map((l) => l.text).join(' ')].filter(Boolean).join('\n'), to: a.kind === 'audio' && a.home && !a.link ? `/studio/sound/${a.id}` : `/archive?q=${encodeURIComponent(a.name)}`, at: a.updatedAt || a.createdAt, icon: a.kind === 'audio' ? 'recordings' : 'archive' });
      const hubList = [...HUB_ACTIVITIES.filter((a) => a.status === 'ready'), ...(hub.items ?? [])];
      const seen = new Set<string>();
      for (const a of hubList) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        out.push({ key: 'hub:' + a.id, group: 'Resource Hub', title: a.title, sub: [a.level, `${a.minutes} min`, a.interaction].filter(Boolean).join(' · '), text: [a.summary, a.focus, a.tags.join(' '), a.worksheet.join(' ')].join('\n'), to: `/resource-hub?activity=${encodeURIComponent(a.id)}`, at: a.publishedAt, icon: 'resourcehub' });
      }
      out.push(...classEntries);
    }
    for (const c of chats ?? []) {
      const people = Object.entries(c.names).filter(([k]) => k !== me).map(([, v]) => v);
      out.push({ key: 'chat:' + c.id, group: 'Chats', title: c.title || people.join(', ') || 'Chat', sub: c.kind === 'group' ? `${c.members.length} people` : 'Chat', text: people.join(', '), to: `/messages?c=${encodeURIComponent(c.id)}`, at: c.lastAt, icon: 'message' });
    }
    out.push(...msgEntries);
    return out.map(indexed);
  }, [teacher, allDocs, textOf, archive, hub.items, classEntries, chats, msgEntries, me, uid]);

  const status = busy.length ? `Still looking through your ${busy.join(', ')}…` : '';
  return { entries, status };
}
