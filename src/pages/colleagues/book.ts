import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { answerOf, profileFieldsOf, type Org, type TeacherProfile } from '../../lib/admin';
import { statusOf, type Status } from '../../lib/status';
import type { Colleague, Share } from '../../lib/sharing';
import type { SharedDoc, SharedFolder } from '../../lib/sharedDocs';
import type { ClassDoc } from '../../lib/classes';
import type { FileKind } from '../../components/FileIcon';

// The people on the Colleagues page: everyone in my organisation (always colleagues, with the
// profile the organisation asks for) and the teachers I connected with through a link.

export type Mate = {
  id: string;
  name: string;
  first: string;
  title: string; // job title in the organisation, as its admins keep it
  inOrg: boolean; // in my organisation: their profile is readable and they cannot be removed
  orgName?: string;
  email?: string;
  since?: number;
  pic?: string; // their picture, as the organisation keeps it
};

export const firstOf = (name: string) => name.trim().split(/\s+/)[0] || name;

// Everyone, from my colleagues list and my organisation's teachers (in case the list is behind).
export function useBook(uid: string, list: Colleague[] | null, org: Org | null, pics: Record<string, TeacherProfile>) {
  return useMemo(() => {
    if (list === null) return null;
    const out = new Map<string, Mate>();
    const inMine = (id: string) => !!org && !!org.teachers[id];
    for (const c of list) {
      if (c.id === uid) continue;
      const t = org?.teachers[c.id];
      out.set(c.id, { id: c.id, name: c.name || t?.name || 'Colleague', first: firstOf(c.name || t?.name || ''), title: (inMine(c.id) ? t?.title : c.title)?.trim() ?? '', inOrg: inMine(c.id), orgName: inMine(c.id) ? org!.name : undefined, email: c.email || t?.email, since: c.at, pic: pics[c.id]?.avatar });
    }
    for (const [id, t] of Object.entries(org?.teachers ?? {})) {
      if (id === uid || out.has(id)) continue;
      const name = t.name || t.email || 'Colleague';
      out.set(id, { id, name, first: firstOf(name), title: t.title?.trim() ?? '', inOrg: true, orgName: org!.name, email: t.email, pic: pics[id]?.avatar });
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [uid, list, org, pics]);
}

// The profiles of my organisation's teachers, for their pictures and for searching what they wrote.
export function useOrgProfiles(org: Org | null, me: string) {
  const [m, setM] = useState<Record<string, TeacherProfile>>({});
  const ids = org ? Object.keys(org.teachers).filter((id) => id !== me).sort().join() : '';
  useEffect(() => {
    if (!ids) return setM({});
    let dead = false;
    void Promise.all(
      ids.split(',').map((id) =>
        getDoc(doc(db, 'teacherProfiles', id))
          .then((d) => [id, d.exists() ? (d.data() as TeacherProfile) : null] as const)
          .catch(() => [id, null] as const),
      ),
    ).then((all) => !dead && setM(Object.fromEntries(all.filter((x): x is readonly [string, TeacherProfile] => !!x[1]))));
    return () => void (dead = true);
  }, [ids]);
  return m;
}

// The answers a person gave, for the fields their organisation asks for now.
export function answersOf(org: Org | null, p: TeacherProfile | null | undefined) {
  if (!org?.policy?.profiles || !p) return [];
  return profileFieldsOf(org.policy)
    .filter((f) => f.on)
    .map((f) => ({ f, v: answerOf(p, f.id).trim() }))
    .filter((x) => x.v);
}

// Search: by name, job title, organisation, email, and what they wrote in their profile.
// Returns what matched outside the name and title, to show under the name.
export function matchOf(m: Mate, q: string, org: Org | null, p?: TeacherProfile): { hit: boolean; note?: { label: string; text: string } } {
  const s = q.trim().toLowerCase();
  if (!s) return { hit: true };
  const words = s.split(/\s+/);
  const has = (t?: string) => !!t && words.every((w) => t.toLowerCase().includes(w));
  if (has(`${m.name} ${m.title} ${m.orgName ?? ''}`) || has(m.email)) return { hit: true };
  for (const { f, v } of m.inOrg ? answersOf(org, p) : []) if (words.every((w) => `${m.name} ${v}`.toLowerCase().includes(w))) return { hit: true, note: { label: f.label, text: snippet(v, words, f.kind === 'list') } };
  return { hit: false };
}
// The part of an answer that matched: the items of a list, or the words around the first match.
function snippet(v: string, words: string[], list: boolean) {
  if (list) {
    const items = v.split(',').map((x) => x.trim()).filter((x) => words.some((w) => x.toLowerCase().includes(w)));
    if (items.length) return items.join(', ');
  }
  const at = Math.min(...words.map((w) => v.toLowerCase().indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(at) || at < 24) return v;
  const from = v.lastIndexOf(' ', at - 16);
  return '…' + v.slice(from < 0 ? at - 16 : from + 1);
}

// A short line for who is around: online, in class, on a call, away, do not disturb.
export type Around = ReturnType<typeof statusOf>['dot'];
export const AROUND_ORDER: Around[] = ['online', 'class', 'call', 'busy', 'away'];
export const isAround = (st?: Status) => statusOf(st).dot !== 'off';
export function shortStatus(st?: Status) {
  const s = statusOf(st);
  return s.dot === 'class' ? 'In class' : s.dot === 'call' ? 'On a call' : s.dot === 'busy' ? 'Do not disturb' : s.dot === 'away' ? 'Away' : s.dot === 'online' ? 'Online' : '';
}

// Dates in words: today, yesterday, a few days ago, or the day.
export function when(t?: number) {
  if (!t) return '';
  const day = (x: number) => Math.floor((x - new Date().getTimezoneOffset() * 60e3) / 864e5);
  const d = day(Date.now()) - day(t);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  const date = new Date(t);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}
export const since = (t?: number) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '');

// What passes between me and one colleague: things shared each way, and classes taught together.
export type Thing = {
  key: string;
  title: string;
  icon: { file: FileKind; sub?: string } | { folder: true } | { cls: string };
  meta: string;
  at: number;
  to: string;
  owner?: string;
  stop?: () => Promise<unknown>;
};
const ROLE: Record<string, string> = { edit: 'Can edit', suggest: 'Can suggest', comment: 'Can comment', view: 'Can view' };
const DOC_KIND: Record<string, string> = { doc: 'Collab document', slides: 'Slides', flash: 'Flashcards', pd: 'PD reading', lesson: 'Lesson', pdf: 'PDF' };
const SHARE_KIND: Record<string, string> = { lesson: 'Lesson', task: 'Task', doc: 'Document', media: 'Media' };
const ms = (t?: { toMillis?: () => number } | null) => t?.toMillis?.() ?? 0;
const mediaKind = (s: Partial<Share>): FileKind => {
  const k = s.archive?.kind as string | undefined;
  return k === 'image' || k === 'audio' || k === 'video' || k === 'link' ? (k as FileKind) : 'media';
};
const shareThing = (s: Partial<Share> & { id: string }, extra: string): Thing => ({
  key: 's' + s.id,
  title: s.title || 'Untitled',
  icon: { file: s.kind === 'media' ? mediaKind(s) : ((s.kind ?? 'lesson') as FileKind), sub: s.kind === 'lesson' ? (s.item?.type as string | undefined) : undefined },
  meta: [SHARE_KIND[s.kind ?? 'lesson'], extra].filter(Boolean).join(' · '),
  at: s.updated ?? s.at ?? 0,
  to: `/s/${s.id}`,
  owner: s.owner,
});
const docThing = (d: SharedDoc, extra: string): Thing => ({
  key: 'd' + d.id,
  title: d.title || 'Untitled',
  icon: { file: d.kind as FileKind, sub: d.kind === 'lesson' ? d.ltype : undefined },
  meta: [DOC_KIND[d.kind] ?? 'Document', extra].filter(Boolean).join(' · '),
  at: ms(d.updatedAt) || ms(d.createdAt),
  to: `/doc/${d.id}`,
  owner: d.owner,
});
const own = (f: SharedFolder) => !(f as SharedFolder & { org?: string }).org;

export type Sources = {
  mine: Share[] | null;
  withMe: (Partial<Share> & { id: string })[] | null;
  docs: { mine: SharedDoc[] | null; withMe: SharedDoc[] | null };
  folders: { mine: SharedFolder[] | null; withMe: SharedFolder[] | null };
  classes: ClassDoc[] | null;
};
export function between(src: Sources, uid: string, m: Mate, stopShare: (s: Share) => Promise<unknown>, stopDoc: (d: SharedDoc) => Promise<unknown>) {
  const byDate = (a: Thing, b: Thing) => b.at - a.at;
  const theirs: Thing[] = [
    ...(src.withMe ?? []).filter((s) => s.owner === m.id).map((s) => shareThing(s, 'a copy for you')),
    ...(src.docs.withMe ?? []).filter((d) => d.owner === m.id).map((d) => docThing(d, ROLE[d.members?.[uid]?.role ?? 'view'])),
    ...(src.folders.withMe ?? []).filter((f) => f.owner === m.id && own(f)).map((f): Thing => ({ key: 'f' + f.id, title: f.name, icon: { folder: true }, meta: `Shared folder · ${ROLE[f.members?.[uid]?.role ?? 'view']}`, at: 0, to: `/archive?folder=${f.id}`, owner: f.owner })),
  ].sort(byDate);
  const mineTo: Thing[] = [
    ...(src.mine ?? []).filter((s) => s.mode === 'people' && s.people?.includes(m.id)).map((s) => ({ ...shareThing(s, 'a copy'), stop: () => stopShare(s) })),
    ...(src.docs.mine ?? []).filter((d) => d.memberIds?.includes(m.id)).map((d) => ({ ...docThing(d, ROLE[d.members?.[m.id]?.role ?? 'view']), stop: () => stopDoc(d) })),
    ...(src.folders.mine ?? []).filter((f) => f.memberIds?.includes(m.id) && own(f)).map((f): Thing => ({ key: 'f' + f.id, title: f.name, icon: { folder: true }, meta: `Shared folder · ${ROLE[f.members?.[m.id]?.role ?? 'view']}`, at: 0, to: `/archive?folder=${f.id}` })),
  ].sort(byDate);
  const classes: Thing[] = (src.classes ?? [])
    .filter((c) => c.status !== 'deleted' && (c.teacherId === m.id || !!c.coTeachers?.[m.id]))
    .map((c) => {
      const theirClass = c.teacherId === m.id;
      const role = theirClass ? c.coTeachers?.[uid]?.role : c.coTeachers?.[m.id]?.role;
      const meta = theirClass ? `${m.first}’s class · you ${role === 'viewer' ? 'can view it' : 'co-teach'}` : `Your class · ${m.first} ${role === 'viewer' ? 'can view it' : 'co-teaches'}`;
      return { key: 'c' + c.id, title: c.name, icon: { cls: c.themeColor }, meta: [c.level, meta].filter(Boolean).join(' · '), at: ms(c.createdAt), to: `/class/${c.id}` };
    });
  return { theirs, mineTo, classes, loading: src.withMe === null || src.mine === null };
}

// Lately shared with me, by any of my colleagues.
export function lately(src: Sources, uid: string, people: Map<string, Mate>) {
  return [
    ...(src.withMe ?? []).filter((s) => s.owner && people.has(s.owner)).map((s) => shareThing(s, '')),
    ...(src.docs.withMe ?? []).filter((d) => people.has(d.owner)).map((d) => docThing(d, ROLE[d.members?.[uid]?.role ?? 'view'])),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 6);
}
