import otpCover from './assets/cover-otp.svg';
import nopCover from './assets/cover-nop.svg';
import wfcCover from './assets/cover-wfc.svg';
import igxCover from './assets/cover-igx.svg';
import spgCover from './assets/cover-spg.svg';
import picCover from './assets/cover-pic.svg';
import metadata from './metadata.json';
import type { JSONContent } from '@tiptap/react';

export type HubCollectionId = 'otp' | 'nop' | 'wfc' | 'igx' | 'spg' | 'pic';
export type HubActivityStatus = 'ready' | 'outline';

export interface HubPage {
  id: string;
  title: string;
  image: string;
  audience: 'learner' | 'teacher';
  part: 'lead-in' | 'practice-a' | 'practice-b' | 'practice-c' | 'produce' | 'notes' | 'answer-key';
}

export interface HubActivity {
  id: string;
  number: string;
  collectionId: HubCollectionId;
  title: string;
  kind: 'information-gap' | 'table' | 'cards' | 'board' | 'strips' | 'worksheet';
  focus: string;
  level: string;
  interaction: string;
  minutes: number;
  summary: string;
  prep: 'No prep' | 'Print' | 'Print and cut';
  energy: 1 | 2 | 3;
  mode: 'Face-to-face and online' | 'Face-to-face only' | 'Online only';
  status: HubActivityStatus;
  publishedAt?: number;
  pages: HubPage[];
  supplementalImages?: { id: string; title: string; image: string; audience: 'learner' }[];
  notes: string[];
  worksheet: string[];
  tags: string[];
  editorSections?: { id: string; title: string; audience: 'learner' | 'teacher'; kind: 'task' | 'notes' | 'answer-key'; instructions: string; instrDoc?: JSONContent | null; printInstructions?: string; printInstrDoc?: JSONContent | null; versionGroup?: string; versionLabel?: string; content: JSONContent }[];
  authoredParts?: { id: string; title: string; audience: 'learner' | 'teacher'; lines: string[] }[];
}

export interface HubCollection {
  id: HubCollectionId;
  title: string;
  promise: string;
  cover: string;
  accent: string;
  paperAccent?: string;
  headerImage?: string;
  level: string;
  plannedCount?: number;
  status: 'available' | 'coming-soon';
}

export const HUB_COLLECTIONS: HubCollection[] = [
  { id: 'otp', title: 'Off the Page', promise: 'Communicative activities that take language off the worksheet and into conversation.', cover: otpCover, accent: '#c4643a', level: 'A1–B2', plannedCount: 50, status: 'available' },
  { id: 'nop', title: 'No Prep Activities', promise: 'Walk in, start teaching. Nothing to print, cut or set up.', cover: nopCover, accent: '#5c7a45', level: 'A1–C1', status: 'coming-soon' },
  { id: 'wfc', title: 'Warmers, Fillers & Coolers', promise: 'Short activities for the start, middle and end of a lesson.', cover: wfcCover, accent: '#d18b2f', level: 'A1–C1', status: 'coming-soon' },
  { id: 'igx', title: 'Information Gap Exchange', promise: 'Two different pages, one conversation: pairwork with a real reason to talk.', cover: igxCover, accent: '#2f7480', level: 'A2–B2', status: 'coming-soon' },
  { id: 'spg', title: 'Speaking Games', promise: 'Board games, role cards and challenges that get every learner talking.', cover: spgCover, accent: '#7a4a86', level: 'A2–C1', status: 'coming-soon' },
  { id: 'pic', title: 'Picture Prompts', promise: 'Look, describe, compare and imagine with printable pictures.', cover: picCover, accent: '#2f4f7a', level: 'A1–B2', status: 'coming-soon' },
];

type SourceActivity = { id: string; title: string; level: string; interaction: string; minutes: number; focus: string; format: string; summary: string };
const kindFor = (format: string): HubActivity['kind'] => {
  const lower = format.toLowerCase();
  if (lower.includes('information gap') || lower.includes('spot the difference')) return 'information-gap';
  if (lower.includes('board game') || lower.includes('spinner') || lower.includes('opinion line')) return 'board';
  if (lower.includes('strip stories')) return 'strips';
  if (lower.includes('card') || lower.includes('dominoes') || lower.includes('pelmanism') || lower.includes('bingo')) return 'cards';
  if (lower.includes('survey') || lower.includes('find someone')) return 'table';
  return 'worksheet';
};
const prepFor = (format: string): HubActivity['prep'] => /cards|dominoes|strips|pelmanism/i.test(format) ? 'Print and cut' : 'Print';
const fromSource = (source: SourceActivity): HubActivity => {
  const { format, focus } = source;
  const number = source.id.slice(-3);
  const kit = number === '002';
  const physical = /cards|dominoes|strips|pelmanism|bingo|board game/i.test(format);
  return {
    id: source.id, number, collectionId: 'otp', title: kit ? 'Have You Ever…?' : source.title,
    kind: kit ? 'table' : kindFor(format),
    focus: kit ? 'Present perfect for experience' : focus,
    level: kit ? 'A2–B1' : source.level,
    interaction: kit ? 'Whole class mingle' : source.interaction,
    minutes: kit ? 35 : source.minutes,
    summary: kit ? 'Find a classmate who has done each thing, then ask one follow-up question.' : source.summary,
    prep: kit ? 'Print' : prepFor(format), energy: kit ? 3 : 2,
    mode: kit ? 'Face-to-face and online' : physical ? 'Face-to-face only' : 'Face-to-face and online',
    status: kit ? 'ready' : 'outline',
    publishedAt: kit ? Date.UTC(2026, 10, 18) : undefined,
    pages: kit ? [
    { id: 'notes', title: 'Teacher notes', image: '/resource-hub/otp-002-p1.png', audience: 'teacher', part: 'notes' },
    { id: 'practice-a-b', title: 'Learner sheet · Practice A and B', image: '/resource-hub/otp-002-p2.png', audience: 'learner', part: 'practice-a' },
    { id: 'practice-c-produce', title: 'Learner sheet · Practice C and Produce', image: '/resource-hub/otp-002-p3.png', audience: 'learner', part: 'practice-c' },
    { id: 'answer-key', title: 'Teacher answer key', image: '/resource-hub/otp-002-p4.png', audience: 'teacher', part: 'answer-key' },
    ] : [],
    supplementalImages: undefined,
    // The full source document stays in Drive while the other 49 titles await editorial release.
    notes: [], worksheet: [],
    tags: kit ? ['mingle', 'experience', 'present perfect'] : [format, ...focus.split(/[;,]/)].filter(Boolean),
  };
};

// The collection has fifty activity titles in the teacher's source document. At launch only
// the supplied four-page OTP-002 kit is complete and usable; the other 49 remain coming soon.
export const HUB_ACTIVITIES: HubActivity[] = (metadata as SourceActivity[]).map(fromSource);

export const readyActivities = HUB_ACTIVITIES.filter(activity => activity.status === 'ready');
export const collectionFor = (id: HubCollectionId) => HUB_COLLECTIONS.find(collection => collection.id === id)!;
