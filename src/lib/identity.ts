import type { JSONContent } from '@tiptap/react';
import { iconOf, iconSvg } from './identityIcons';

// Activity identities and inline references.
//
// An identity is a named kind of activity a teacher chooses ("Activation", "Pronunciation"), with
// a colour and an icon. It is stored on each task (or Resource Hub section) that uses it, so it
// travels with the task when it is copied; editing it in one task updates every task in the lesson
// that shares its id.
//
// An inline reference (`activityRef` node) points at another activity by its stable `anchor`
// (kept on the task and copied with it, so it survives Copy to Class) or at a version of this
// activity ("Learner A"). Labels are worked out from the lesson each time they are shown, so a
// rename or reorder is always reflected. `snap` keeps the last label for places that have no lesson
// to look at, and the editor warns when the target has gone.

export type ActivityIdentity = { id: string; name: string; colour: string; icon: string };

// Colours that keep at least 4.5 : 1 against white for text and print well in colour. The icon and
// the name carry the meaning, so nothing depends on telling colours apart.
export const IDENTITY_COLOURS: { v: string; label: string }[] = [
  { v: '#b4442e', label: 'Brick' },
  { v: '#a83f6b', label: 'Berry' },
  { v: '#7a4fa3', label: 'Plum' },
  { v: '#4a55a8', label: 'Indigo' },
  { v: '#1f6aa5', label: 'Blue' },
  { v: '#0f7480', label: 'Teal' },
  { v: '#2d7a4b', label: 'Green' },
  { v: '#5f7425', label: 'Olive' },
  { v: '#93611a', label: 'Ochre' },
  { v: '#a1531b', label: 'Copper' },
  { v: '#5d5a55', label: 'Graphite' },
  { v: '#262420', label: 'Ink' },
];

export const newIdentityId = () => 'aid-' + Math.random().toString(36).slice(2, 10);

export const cleanIdentity = (x: unknown): ActivityIdentity | null => {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const name = String(o.name ?? '').trim().slice(0, 40);
  if (!name) return null;
  const colour = /^#[0-9a-f]{6}$/i.test(String(o.colour)) ? String(o.colour) : IDENTITY_COLOURS[4].v;
  return { id: String(o.id || newIdentityId()), name, colour, icon: iconOf(String(o.icon)) ? String(o.icon) : '' };
};

// The identities used in a lesson, once each, in lesson order.
export function lessonIdentities(tasks: { identity?: ActivityIdentity | null }[]): ActivityIdentity[] {
  const seen = new Map<string, ActivityIdentity>();
  for (const t of tasks) if (t.identity?.id && !seen.has(t.identity.id)) seen.set(t.identity.id, t.identity);
  return [...seen.values()];
}

// ----------------------------------------------------------------------------- references

export type RefAttrs = { kind?: 'activity' | 'version'; anchor?: string; version?: string; snap?: RefSnap | null };
export type RefSnap = { label: string; n?: number; icon?: string; colour?: string; version?: string };

// One activity the lesson can point at.
export type RefTarget = { id: string; anchor: string; title: string; n: number; identity?: ActivityIdentity | null; variant?: string | null };
// What a reference shows: resolved from the lesson, or the last snapshot, or missing.
export type RefView = { label: string; n?: number; icon?: string; colour?: string; version?: string; missing: boolean; title?: string; id?: string };

export const anchorOf = (t: { anchor?: string | null; id?: string }) => t.anchor || t.id || '';

// The targets of a lesson: its activities (not sections, not extra versions), numbered as printed.
export function refTargets(tasks: { id?: string; anchor?: string | null; kind?: string; title: string; identity?: ActivityIdentity | null; family?: string | null; variant?: string | null }[]): RefTarget[] {
  const main = tasks.filter((t) => t.kind !== 'section' && !(t.family && t.family !== t.id));
  return main.map((t, i) => ({ id: t.id ?? '', anchor: anchorOf(t), title: t.title, n: i + 1, identity: t.identity ?? null, variant: t.variant ?? null }));
}

// The same for a Resource Hub resource: its learner sections, with a group of versions counted once.
// A section's id is its anchor, and it becomes the anchor of the task it is copied into.
export function hubRefTargets(sections: { id: string; title: string; audience: string; versionGroup?: string; versionLabel?: string; identity?: ActivityIdentity | null }[]): RefTarget[] {
  const firstOf = new Map<string, string>();
  for (const s of sections) if (s.versionGroup && !firstOf.has(s.versionGroup)) firstOf.set(s.versionGroup, s.id);
  return refTargets(sections.filter((s) => s.audience === 'learner').map((s) => ({ id: s.id, anchor: s.id, title: s.title, identity: s.identity ?? null, family: s.versionGroup ? firstOf.get(s.versionGroup) : null, variant: s.versionLabel ?? null })));
}

// A version letter from its label: "Learner A", "Version B", "A" → A. Other names have none.
export const versionLetter = (label: string | null | undefined): string => {
  const m = /^(?:(?:learner|version|student|role)\s+)?([A-Z])$/i.exec(String(label ?? '').trim());
  return m ? m[1].toUpperCase() : '';
};

export function resolveRef(a: RefAttrs, targets: RefTarget[] | null): RefView {
  if (a.kind === 'version') {
    const v = versionLetter(a.version) || String(a.version || 'A');
    return { label: `Learner ${v}`, version: v, missing: false };
  }
  if (!targets) {
    const s = a.snap;
    return s ? { label: s.label, n: s.n, icon: s.icon, colour: s.colour, missing: false } : { label: 'Activity', missing: false };
  }
  const t = targets.find((x) => x.anchor === a.anchor);
  if (!t) {
    const s = a.snap;
    return { label: s?.label || 'Activity', n: s?.n, icon: s?.icon, colour: s?.colour, missing: true };
  }
  if (t.identity) {
    // The number tells activities of the same kind apart; a kind used once needs none.
    const same = targets.filter((x) => x.identity?.id === t.identity!.id);
    const n = same.length > 1 ? same.findIndex((x) => x.anchor === t.anchor) + 1 : undefined;
    return { label: t.identity.name, n, icon: t.identity.icon, colour: t.identity.colour, missing: false, title: t.title, id: t.id };
  }
  return { label: 'Exercise', n: t.n, missing: false, title: t.title, id: t.id };
}

export const refSnap = (v: RefView): RefSnap | null => (v.missing ? null : JSON.parse(JSON.stringify({ label: v.label, n: v.n, icon: v.icon, colour: v.colour, version: v.version })));

export const refText = (v: RefView) => (v.n ? `${v.label} ${v.n}` : v.label);

// Every reference in a lesson's content, with its snapshot brought up to date, so places that
// have no lesson to look at (paper, export, a copy) show the current label.
export function refreshRefs<T extends { content?: JSONContent | null; instrDoc?: JSONContent | null }>(tasks: T[], targets: RefTarget[]): T[] {
  const walk = (n: JSONContent): JSONContent => {
    if (n.type === 'activityRef') {
      const v = resolveRef(n.attrs as RefAttrs, targets);
      return { ...n, attrs: { ...n.attrs, snap: refSnap(v) ?? n.attrs?.snap ?? null, missing: v.missing } };
    }
    return n.content ? { ...n, content: n.content.map(walk) } : n;
  };
  return tasks.map((t) => ({ ...t, ...(t.content ? { content: walk(t.content) } : {}), ...(t.instrDoc ? { instrDoc: walk(t.instrDoc) } : {}) }));
}

// Anchors that references in some content point at.
export function refAnchors(n: JSONContent | null | undefined, out = new Set<string>()): Set<string> {
  if (!n) return out;
  if (n.type === 'activityRef' && n.attrs?.anchor) out.add(String(n.attrs.anchor));
  n.content?.forEach((c) => refAnchors(c, out));
  return out;
}

// ----------------------------------------------------------------------------- HTML, for paper

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// The Learner A / B sign: a letter in a small tile. A is solid, B an outline, C and on a double
// outline, so the shape tells them apart as well as the letter.
export const versionSignHtml = (v: string) => `<span class="vsign" data-v="${esc(v)}" aria-hidden="true">${esc(v)}</span>`;

export function refHtml(v: RefView): string {
  if (v.version) return `<span class="aref aref-v">${versionSignHtml(v.version)}<span class="aref-t">${esc(v.label)}</span></span>`;
  const style = v.colour ? ` style="--aid:${esc(v.colour)}"` : '';
  return `<span class="aref${v.icon ? ' has-icon' : ''}"${style}>${v.icon ? iconSvg(v.icon, '1.05em', 2.1) : ''}<span class="aref-t">${esc(v.label)}${v.n ? ` <b>${v.n}</b>` : ''}</span></span>`;
}

// The identity above an exercise on paper: icon in its colour and the name in small capitals.
export const identityHtml = (id: ActivityIdentity | null | undefined) =>
  id ? `<span class="ex-aid" style="--aid:${esc(id.colour)}">${id.icon ? iconSvg(id.icon, '1.15em', 2) : ''}<span>${esc(id.name)}</span></span>` : '';

// CSS for paper. Sizes in em so it sits at the size of the surrounding text, like a question number.
export const identityCss = `
.aref { display: inline; white-space: nowrap; font: 700 .86em/1 Karla, sans-serif; color: var(--aid, var(--accent-ink, #262420)); letter-spacing: .01em; }
.aref .aid-svg { display: inline-block; vertical-align: -.14em; margin-right: .22em; }
.aref b { font-weight: 800; }
.aref-v { color: var(--accent-ink, #262420); }
.vsign { display: inline-block; min-width: 1.25em; padding: .1em .16em; margin-right: .25em; border-radius: .28em; font: 800 .82em/1 Karla, sans-serif; text-align: center; vertical-align: .06em; box-sizing: border-box; background: var(--accent, #262420); color: #fff; border: .09em solid var(--accent, #262420); }
.vsign[data-v="B"] { background: #fff; color: var(--accent-ink, #262420); }
.vsign:not([data-v="A"]):not([data-v="B"]) { background: #fff; color: var(--accent-ink, #262420); box-shadow: inset 0 0 0 .12em #fff, inset 0 0 0 .2em var(--accent, #262420); }
.ex-aid { display: flex; align-items: center; gap: 1.2mm; margin: 0 0 1mm; font: 800 7.4pt/1 Karla, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--aid); }
.ex-aid .aid-svg { flex: none; }
.pa-role .vsign, .ws-vsign .vsign { font-size: 1em; }
`;
