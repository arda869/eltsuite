import { useEffect, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import type { HubActivity } from './catalog';
import type { HubResourceEdition } from './hubEditorData';

type AuthoredPart = { id: string; title: string; audience: 'learner' | 'teacher'; lines: string[] };
const inlineText = (node: JSONContent | null | undefined): string => node ? [node.text ?? '', ...(node.content ?? []).map(inlineText)].join('') : '';
const linesOf = (node: JSONContent): string[] => {
  const out: string[] = [];
  const visit = (item: JSONContent) => {
    if (['paragraph', 'heading', 'tableRow'].includes(item.type ?? '')) {
      const text = inlineText(item).trim();
      if (text) out.push(text);
      return;
    }
    for (const child of item.content ?? []) visit(child);
  };
  visit(node);
  return out;
};

/** Published editions only; private draft documents are never subscribed to here. */
export function publishedResourceToActivity(edition: HubResourceEdition): HubActivity {
  const authoredParts: AuthoredPart[] = edition.sections.map(section => ({ id: section.id, title: section.title, audience: section.audience, lines: [section.instructions.trim(), ...linesOf(section.content)].filter(Boolean) }));
  const teacherNotes = authoredParts.filter(part => part.audience === 'teacher' && edition.sections.find(section => section.id === part.id)?.kind !== 'answer-key').flatMap(part => [part.title, ...part.lines]);
  const answerKey = authoredParts.filter(part => edition.sections.find(section => section.id === part.id)?.kind === 'answer-key').flatMap(part => [part.title, ...part.lines]);
  const worksheet = authoredParts.filter(part => part.audience === 'learner').flatMap(part => [part.title, ...part.lines]);
  return {
    id: `${edition.collectionId}-${edition.number.padStart(3, '0')}`, number: edition.number.padStart(3, '0'), collectionId: edition.collectionId, title: edition.title,
    kind: 'worksheet', focus: edition.focus, level: edition.level, interaction: edition.interaction,
    minutes: edition.minutes, summary: edition.summary, prep: edition.prep, energy: edition.energy,
    mode: edition.mode, status: 'ready', pages: [], tags: [edition.focus.toLowerCase(), edition.title.toLowerCase()],
    notes: [...teacherNotes, ...(answerKey.length ? ['Key and suggested answers', ...answerKey] : [])], worksheet,
    editorSections: edition.sections.map(section => ({ id: section.id, title: section.title, audience: section.audience, kind: section.kind, instructions: section.instructions, printInstructions: section.printInstructions, versionGroup: section.versionGroup, versionLabel: section.versionLabel, content: section.content })),
    authoredParts,
  } as HubActivity;
}

export function usePublishedHubResources(): { items: HubActivity[] | null; error?: string } {
  const { user } = useAuth();
  const [items, setItems] = useState<HubActivity[] | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    setItems(null); setError(undefined);
    if (!user) { setItems([]); return; }
    return onSnapshot(collection(db, 'resourceHubPublished'), snapshot => {
      setItems(snapshot.docs.map(item => publishedResourceToActivity(item.data() as HubResourceEdition)));
      setError(undefined);
    }, cause => { setItems([]); setError(cause.message || 'Published activities could not be loaded.'); });
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  return { items, error };
}
