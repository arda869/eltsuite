import type { JSONContent } from '@tiptap/react';
import { collection, doc, getDoc, onSnapshot, runTransaction, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { HubCollectionId } from './catalog';
import { generatedAnswerLines, withGeneratedAnswerKey } from './hubAnswerKey';

/** Draft and public editions live in different collections. Public reads never expose draft text. */
export type HubEditorState = 'draft' | 'in-review';
export type HubEditorSection = { id: string; title: string; audience: 'learner' | 'teacher'; kind: 'task' | 'notes' | 'answer-key'; instructions: string; instrDoc?: JSONContent | null; printInstructions?: string; printInstrDoc?: JSONContent | null; versionGroup?: string; versionLabel?: string; content: JSONContent };
export type HubResourceDraft = {
  id: string; collectionId: HubCollectionId; number: string; title: string; summary: string; focus: string;
  level: string; minutes: number; interaction: string; prep: 'No prep' | 'Print' | 'Print and cut';
  mode: 'Face-to-face and online' | 'Face-to-face only' | 'Online only'; energy: 1 | 2 | 3;
  state: HubEditorState; revision: number; publishedRevision: number | null; publishedAt: number | null;
  sections: HubEditorSection[]; authorUid: string; updatedAt: number;
  sourceReview?: { fileName: string; importedAt: number; rightsConfirmed: boolean; warnings: string[] };
};
export type HubResourceEdition = Omit<HubResourceDraft, 'state' | 'publishedRevision' | 'publishedAt' | 'authorUid' | 'updatedAt' | 'sourceReview'> & { edition: number; publishedAt: number; publishedBy: string };
export type HubCollectionDraft = { id: HubCollectionId; title: string; promise: string; cover: string; accent: string; paperAccent: string; headerImage: string; visible?: boolean; state: HubEditorState; revision: number; publishedRevision: number | null; publishedAt: number | null; updatedAt: number; authorUid: string };

const blankDoc = (): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph' }] });
const newId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rh-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const draftRef = (id: string) => doc(db, 'resourceHubDrafts', id);
const publicRef = (id: string) => doc(db, 'resourceHubPublished', id);
const collectionDraftRef = (id: string) => doc(db, 'resourceHubCollectionsDrafts', id);
const collectionPublicRef = (id: string) => doc(db, 'resourceHubCollectionsPublished', id);
const numberRef = (collectionId: HubCollectionId, number: string) => doc(db, 'resourceHubNumberClaims', `${collectionId}-${number.padStart(3, '0')}`);
const textLength = (doc: JSONContent): number => JSON.stringify(doc ?? {}).length;
const contentText = (node: JSONContent | null | undefined): string => node ? [typeof node.text === 'string' ? node.text : '', ...(node.content ?? []).map(contentText)].join(' ') : '';
const hasAuthoredNode = (node: JSONContent): boolean => !!(node.attrs?.id && !['doc', 'paragraph'].includes(node.type ?? '')) || !!node.content?.some(hasAuthoredNode);

export function blankResourceDraft(uid: string, collectionId: HubCollectionId = 'otp'): HubResourceDraft {
  const id = newId();
  return { id, collectionId, number: '', title: '', summary: '', focus: '', level: 'A2', minutes: 35, interaction: 'Pairs', prep: 'Print', mode: 'Face-to-face and online', energy: 2,
    state: 'draft', revision: 1, publishedRevision: null, publishedAt: null, authorUid: uid, updatedAt: Date.now(), sections: [
      { id: newId(), title: 'Teacher notes', audience: 'teacher', kind: 'notes', instructions: '', content: blankDoc() },
      { id: newId(), title: 'Learner task', audience: 'learner', kind: 'task', instructions: '', content: blankDoc() },
      { id: newId(), title: 'Answer key', audience: 'teacher', kind: 'answer-key', instructions: '', content: blankDoc() },
    ] };
}
export function newSection(audience: 'learner' | 'teacher'): HubEditorSection {
  return { id: newId(), title: audience === 'learner' ? 'New learner task' : 'New teacher note', audience, kind: audience === 'learner' ? 'task' : 'notes', instructions: '', content: blankDoc() };
}
/** A named, blank companion task. A fresh document avoids duplicating question IDs or answers. */
export function addLearnerVersion(sections: HubEditorSection[], sourceId: string): { sections: HubEditorSection[]; id: string } {
  const at = sections.findIndex(section => section.id === sourceId);
  const source = sections[at];
  if (!source || source.audience !== 'learner') throw new Error('Choose a learner task before adding a version.');
  const group = source.versionGroup || newId();
  const siblings = sections.filter(section => section.versionGroup === group);
  const used = new Set(siblings.map(section => section.versionLabel?.trim()));
  const letter = 'BCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(label => !used.has(label) && !used.has(`Learner ${label}`));
  const added: HubEditorSection = { ...newSection('learner'), title: source.title, instructions: source.instructions, instrDoc: source.instrDoc ? structuredClone(source.instrDoc) : null, printInstructions: source.printInstructions ?? '', printInstrDoc: source.printInstrDoc ? structuredClone(source.printInstrDoc) : null, versionGroup: group, versionLabel: letter ? `Learner ${letter}` : `Version ${siblings.length + 1}` };
  const next = sections.map(section => section.id === sourceId && !section.versionGroup ? { ...section, versionGroup: group, versionLabel: 'Learner A' } : section);
  const lastSibling = next.reduce((last, section, index) => section.versionGroup === group ? index : last, at);
  next.splice(lastSibling + 1, 0, added);
  return { sections: next, id: added.id };
}
export function validateResource(draft: HubResourceDraft): string[] {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push('Add an activity title.');
  if (!draft.summary.trim()) errors.push('Add a short summary.');
  if (!draft.focus.trim()) errors.push('Add the language focus.');
  if (!/^\d{1,3}$/.test(draft.number.trim()) || Number(draft.number) < 1) errors.push('Use an activity number from 001 to 999.');
  if (!Number.isFinite(draft.minutes) || draft.minutes < 1 || draft.minutes > 240) errors.push('Set a time from 1 to 240 minutes.');
  if (!draft.sections.some(section => section.audience === 'learner' && (contentText(section.content).trim().length > 1 || hasAuthoredNode(section.content)))) errors.push('Add at least one learner task with content.');
  if (!generatedAnswerLines(draft.sections).length && !draft.sections.some(section => section.audience === 'teacher' && section.kind === 'answer-key' && contentText(section.content).trim().length > 1)) errors.push('Add answers to the learner questions or write suggested responses in the answer key.');
  if (draft.sections.some(section => !section.title.trim())) errors.push('Give every section a title.');
  for (const group of new Set(draft.sections.map(section => section.versionGroup).filter(Boolean))) {
    const versions = draft.sections.filter(section => section.versionGroup === group);
    if (versions.length < 2 || versions.some(section => section.audience !== 'learner' || !section.versionLabel?.trim()) || new Set(versions.map(section => section.versionLabel?.trim().toLowerCase())).size !== versions.length) errors.push('Each learner version set needs at least two learner tasks with different version names.');
  }
  if (draft.sections.some(section => section.content.type !== 'doc')) errors.push('A section has invalid editor content. Reopen it and save again.');
  if (draft.sections.some(section => textLength(section.content) > 300_000)) errors.push('One section is too large. Split it before saving.');
  if (draft.sections.length > 40) errors.push('Use at most 40 sections in one activity.');
  if (draft.sourceReview && !draft.sourceReview.rightsConfirmed) errors.push('Confirm source adaptation permission before review.');
  return errors;
}
export async function createResourceDraft(uid: string, collectionId: HubCollectionId = 'otp', initial?: Partial<Pick<HubResourceDraft, 'title' | 'summary' | 'focus' | 'level' | 'minutes' | 'interaction' | 'sections' | 'sourceReview'>>) {
  const draft = { ...blankResourceDraft(uid, collectionId), ...initial };
  if (JSON.stringify(draft).length > 850_000) throw new Error('This draft is too large. Import fewer pages or shorter sections.');
  await setDoc(draftRef(draft.id), draft);
  return draft;
}
export async function getResourceDraft(id: string): Promise<HubResourceDraft | null> {
  const snapshot = await getDoc(draftRef(id));
  return snapshot.exists() ? snapshot.data() as HubResourceDraft : null;
}
export function subscribeResourceDrafts(onValue: (drafts: HubResourceDraft[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(collection(db, 'resourceHubDrafts'), snapshot => onValue(snapshot.docs.map(item => item.data() as HubResourceDraft).sort((a, b) => b.updatedAt - a.updatedAt)), onError);
}
export function subscribePublishedResources(onValue: (editions: HubResourceEdition[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(collection(db, 'resourceHubPublished'), snapshot => onValue(snapshot.docs.map(item => item.data() as HubResourceEdition).sort((a, b) => b.publishedAt - a.publishedAt)), onError);
}
export async function saveResourceDraft(next: HubResourceDraft, expectedRevision: number): Promise<HubResourceDraft> {
  if (JSON.stringify(next).length > 850_000) throw new Error('This activity is too large for one draft. Split it into smaller resources.');
  return runTransaction(db, async tx => {
    const ref = draftRef(next.id), current = await tx.get(ref);
    if (!current.exists()) throw new Error('This draft has been removed. Reload the editor.');
    if (current.data().revision !== expectedRevision) throw new Error('Someone changed this draft. Reload it before saving your edits.');
    const saved = { ...next, state: 'draft' as const, revision: expectedRevision + 1, updatedAt: Date.now() };
    tx.set(ref, saved);
    return saved;
  });
}
export async function sendResourceForReview(id: string, expectedRevision: number) {
  return runTransaction(db, async tx => {
    const ref = draftRef(id), current = await tx.get(ref);
    if (!current.exists() || current.data().revision !== expectedRevision) throw new Error('Reload this draft before sending it for review.');
    const draft = current.data() as HubResourceDraft;
    const errors = validateResource(draft);
    if (errors.length) throw new Error(errors.join(' '));
    if (draft.collectionId === 'otp' && draft.number.padStart(3, '0') === '002') throw new Error('Activity 002 is already published as a complete kit. Choose another number.');
    tx.update(ref, { state: 'in-review', revision: expectedRevision + 1, updatedAt: Date.now() });
  });
}
export async function returnResourceToDraft(id: string, expectedRevision: number) {
  return runTransaction(db, async tx => {
    const ref = draftRef(id), current = await tx.get(ref);
    if (!current.exists() || current.data().revision !== expectedRevision) throw new Error('Reload this resource before editing it.');
    tx.update(ref, { state: 'draft', revision: expectedRevision + 1, updatedAt: Date.now() });
  });
}
export async function publishResource(id: string, expectedRevision: number, uid: string): Promise<HubResourceEdition> {
  return runTransaction(db, async tx => {
    const ref = draftRef(id), current = await tx.get(ref);
    if (!current.exists() || current.data().revision !== expectedRevision) throw new Error('Reload this resource before publishing.');
    const draft = current.data() as HubResourceDraft;
    if (draft.state !== 'in-review') throw new Error('Send the saved draft for review before publishing.');
    const errors = validateResource(draft);
    if (errors.length) throw new Error(errors.join(' '));
    const claimRef = numberRef(draft.collectionId, draft.number);
    const claim = await tx.get(claimRef);
    if (claim.exists() && claim.data().resourceId !== draft.id) throw new Error('That activity number already belongs to another published resource. Choose an unused number.');
    if (draft.publishedRevision != null) {
      const prior = await tx.get(publicRef(id));
      if (prior.exists() && (prior.data().collectionId !== draft.collectionId || String(prior.data().number).padStart(3, '0') !== draft.number.padStart(3, '0'))) throw new Error('A published activity’s collection and number cannot change. Create a new activity instead.');
    }
    const publishedAt = Date.now();
    const edition: HubResourceEdition = { id: draft.id, collectionId: draft.collectionId, number: draft.number, title: draft.title, summary: draft.summary, focus: draft.focus, level: draft.level, minutes: draft.minutes, interaction: draft.interaction, prep: draft.prep, mode: draft.mode, energy: draft.energy, sections: withGeneratedAnswerKey(draft.sections), revision: draft.revision, edition: draft.revision, publishedAt, publishedBy: uid };
    tx.set(publicRef(id), edition);
    tx.set(claimRef, { resourceId: draft.id, collectionId: draft.collectionId, number: draft.number });
    tx.set(doc(publicRef(id), 'editions', String(draft.revision)), edition);
    tx.update(ref, { publishedRevision: draft.revision, publishedAt, state: 'draft', revision: draft.revision + 1, updatedAt: publishedAt });
    return edition;
  });
}

export async function createCollectionDraft(uid: string, id: HubCollectionId, initial: Pick<HubCollectionDraft, 'title' | 'promise' | 'cover' | 'accent'>): Promise<HubCollectionDraft> {
  const draft: HubCollectionDraft = { id, ...initial, paperAccent: initial.accent, headerImage: '', visible: true, state: 'draft', revision: 1, publishedRevision: null, publishedAt: null, updatedAt: Date.now(), authorUid: uid };
  await setDoc(collectionDraftRef(id), draft);
  return draft;
}
export async function getCollectionDraft(id: HubCollectionId): Promise<HubCollectionDraft | null> {
  const snapshot = await getDoc(collectionDraftRef(id));
  return snapshot.exists() ? snapshot.data() as HubCollectionDraft : null;
}
export async function saveCollectionDraft(next: HubCollectionDraft, expectedRevision: number): Promise<HubCollectionDraft> {
  if (JSON.stringify(next).length > 850_000) throw new Error('These images are too large for one collection edition. Upload smaller images.');
  return runTransaction(db, async tx => {
    const ref = collectionDraftRef(next.id), current = await tx.get(ref);
    if (!current.exists() || current.data().revision !== expectedRevision) throw new Error('Reload this collection before saving.');
    const saved = { ...next, state: 'draft' as const, revision: expectedRevision + 1, updatedAt: Date.now() };
    tx.set(ref, saved); return saved;
  });
}
export async function sendCollectionForReview(id: HubCollectionId, expectedRevision: number) {
  return runTransaction(db, async tx => {
    const ref = collectionDraftRef(id), current = await tx.get(ref);
    if (!current.exists() || current.data().revision !== expectedRevision) throw new Error('Reload this collection before review.');
    const draft = current.data() as HubCollectionDraft;
    if (!draft.title.trim() || !draft.promise.trim() || !/^#[0-9a-fA-F]{6}$/.test(draft.accent) || !/^#[0-9a-fA-F]{6}$/.test(draft.paperAccent)) throw new Error('Add a name, promise and valid accent colours first.');
    if (!/^(https?:\/\/|\/|data:image\/jpeg;base64,)/i.test(draft.cover) || (draft.headerImage && !/^(https?:\/\/|\/|data:image\/jpeg;base64,)/i.test(draft.headerImage))) throw new Error('Use a valid uploaded image or image URL.');
    tx.update(ref, { state: 'in-review', revision: expectedRevision + 1, updatedAt: Date.now() });
  });
}
export async function returnCollectionToDraft(id: HubCollectionId, expectedRevision: number) {
  return runTransaction(db, async tx => {
    const ref = collectionDraftRef(id), current = await tx.get(ref);
    if (!current.exists() || current.data().revision !== expectedRevision) throw new Error('Reload this collection before editing it.');
    tx.update(ref, { state: 'draft', revision: expectedRevision + 1, updatedAt: Date.now() });
  });
}
export async function publishCollection(id: HubCollectionId, expectedRevision: number, uid: string) {
  return runTransaction(db, async tx => {
    const ref = collectionDraftRef(id), current = await tx.get(ref);
    if (!current.exists() || current.data().revision !== expectedRevision) throw new Error('Reload this collection before publishing.');
    const draft = current.data() as HubCollectionDraft;
    if (draft.state !== 'in-review') throw new Error('Send the collection for review before publishing.');
    if (!draft.title.trim() || !draft.promise.trim() || !/^#[0-9a-fA-F]{6}$/.test(draft.accent) || !/^#[0-9a-fA-F]{6}$/.test(draft.paperAccent)) throw new Error('Add a name, promise and valid accent colours first.');
    if (!/^(https?:\/\/|\/|data:image\/jpeg;base64,)/i.test(draft.cover) || (draft.headerImage && !/^(https?:\/\/|\/|data:image\/jpeg;base64,)/i.test(draft.headerImage))) throw new Error('Use a valid uploaded image or image URL.');
    const publishedAt = Date.now();
    const edition = { id, title: draft.title, promise: draft.promise, cover: draft.cover, accent: draft.accent, paperAccent: draft.paperAccent, headerImage: draft.headerImage, visible: draft.visible !== false, edition: draft.revision, publishedAt, publishedBy: uid };
    tx.set(collectionPublicRef(id), edition);
    tx.set(doc(collectionPublicRef(id), 'editions', String(draft.revision)), edition);
    tx.update(ref, { publishedRevision: draft.revision, publishedAt, state: 'draft', revision: draft.revision + 1, updatedAt: publishedAt });
  });
}
