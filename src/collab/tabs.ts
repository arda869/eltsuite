import { useEffect, useState } from 'react';
import * as Y from 'yjs';

// Document tabs. Each tab is its own shared text in the same Y.Doc, so everyone sees the same tabs
// and edits them live, and access is the document's (learners who can open the document see its
// tabs). The first tab is the text every document already has ('default'), so older documents open
// as one tab and nothing moves. The list of tabs lives in a Y.Array of { id, title }.

export type DocTab = { id: string; title: string };
export const FIRST_TAB: DocTab = { id: 'default', title: 'Tab 1' };
export const fieldOf = (id: string) => (id === 'default' ? 'default' : `tab-${id}`);
const listOf = (doc: Y.Doc) => doc.getArray<DocTab>('tabList');

export function readTabs(doc: Y.Doc): DocTab[] {
  const list = listOf(doc).toArray().filter((t) => t && typeof t.id === 'string');
  return list.length ? list : [FIRST_TAB];
}

export function useDocTabs(doc: Y.Doc | undefined) {
  const [tabs, setTabs] = useState<DocTab[]>(() => (doc ? readTabs(doc) : [FIRST_TAB]));
  useEffect(() => {
    if (!doc) return;
    const a = listOf(doc);
    const read = () => setTabs(readTabs(doc));
    read();
    a.observe(read);
    return () => a.unobserve(read);
  }, [doc]);
  return tabs;
}

const newTabId = () => Math.random().toString(36).slice(2, 10);

// The list is written the first time it changes, starting from the one virtual first tab.
function edit(doc: Y.Doc, f: (list: DocTab[]) => DocTab[]) {
  const a = listOf(doc);
  doc.transact(() => {
    const next = f(readTabs(doc));
    a.delete(0, a.length);
    a.insert(0, next);
  });
}

export function nextTabTitle(tabs: DocTab[]) {
  let n = tabs.length + 1;
  while (tabs.some((t) => t.title === `Tab ${n}`)) n++;
  return `Tab ${n}`;
}

export function addTab(doc: Y.Doc, title?: string, after?: string): string {
  const id = newTabId();
  edit(doc, (list) => {
    const at = after ? list.findIndex((t) => t.id === after) + 1 : list.length;
    const next = [...list];
    next.splice(at > 0 ? at : list.length, 0, { id, title: (title || nextTabTitle(list)).slice(0, 80) });
    return next;
  });
  return id;
}

export function renameTab(doc: Y.Doc, id: string, title: string) {
  const t = title.trim().slice(0, 80);
  if (!t) return;
  edit(doc, (list) => list.map((x) => (x.id === id ? { ...x, title: t } : x)));
}

export function moveTab(doc: Y.Doc, id: string, by: number) {
  edit(doc, (list) => {
    const i = list.findIndex((t) => t.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
}

// A copy of a tab: its text, with every element cloned, under the original.
export function duplicateTab(doc: Y.Doc, id: string): string {
  const src = readTabs(doc).find((t) => t.id === id);
  const copy = addTab(doc, src ? `${src.title} (copy)` : undefined, id);
  doc.transact(() => {
    const from = doc.getXmlFragment(fieldOf(id));
    const to = doc.getXmlFragment(fieldOf(copy));
    to.insert(0, from.toArray().map((n) => (n as Y.XmlElement | Y.XmlText).clone()));
  });
  return copy;
}

// Removing a tab removes its text too. The last tab can't be removed.
export function removeTab(doc: Y.Doc, id: string) {
  const tabs = readTabs(doc);
  if (tabs.length < 2) return;
  doc.transact(() => {
    edit(doc, (list) => list.filter((t) => t.id !== id));
    const f = doc.getXmlFragment(fieldOf(id));
    f.delete(0, f.length);
  });
}

// Every tab's fragment, in order: for exports, word counts and contributions.
export const tabFragments = (doc: Y.Doc) => readTabs(doc).map((t) => ({ tab: t, fragment: doc.getXmlFragment(fieldOf(t.id)) }));

// The whole document for downloads and printing: each tab in order. With more than one tab, each
// starts on a new page under its name as a heading.
export function allTabsJSON(doc: Y.Doc, toJSON: (f: Y.XmlFragment) => { type?: string; content?: unknown[] }): { type: 'doc'; content: unknown[] } {
  const parts = tabFragments(doc);
  if (parts.length === 1) return { type: 'doc', content: toJSON(parts[0].fragment).content ?? [] };
  const content: unknown[] = [];
  parts.forEach(({ tab, fragment }, i) => {
    if (i > 0) content.push({ type: 'docPageBreak' });
    content.push({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: tab.title }] });
    content.push(...(toJSON(fragment).content ?? []));
  });
  return { type: 'doc', content };
}
