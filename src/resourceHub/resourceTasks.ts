import type { JSONContent } from '@tiptap/react';
import { newId } from '../lib/tasks';
import type { ImportedTask } from '../lib/textformat';
import type { HubActivity } from './catalog';

const txt = (text: string): JSONContent => ({ type: 'text', text });
const para = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const heading = (text: string): JSONContent => ({ type: 'heading', attrs: { level: 3 }, content: [txt(text)] });
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });
const gap = (answer: string): JSONContent => ({ type: 'gap', attrs: { id: newId(), answers: [answer] } });
const tableCell = (text: string, header = false): JSONContent => ({ type: header ? 'tableHeader' : 'tableCell', content: [text ? para(txt(text)) : { type: 'paragraph' }] });
const tableRow = (values: string[], header = false): JSONContent => ({ type: 'tableRow', content: values.map(value => tableCell(value, header)) });

const examples = [
  ['been', ' to another country?'], ['eaten', ' sushi?'], ['met', ' a famous person?'],
  ['seen', ' snow?'], ['lost', ' your phone?'], ['won', ' a prize?'],
  ['slept', ' in a tent?'], ['broken', ' a bone?'], ['cooked', ' for ten people?'],
  ['forgotten', ' a friend’s birthday?'],
] as const;

const followUps = [
  'Where did you go?', 'Did you like it?', 'Who was it?', 'Where were you?',
  'Did you find it?', 'What did you win?', 'Was it cold?', 'How did it happen?',
  'What did you make?', 'What did you do?',
];

const experiences = [
  'been to another country', 'eaten sushi', 'broken a bone', 'met a famous person',
  'seen snow', 'lost a phone', 'cooked for more than ten people', 'won a prize',
  'slept in a tent', 'forgotten a friend’s birthday',
];

const teacherNotes = [
  'Aim: learners ask and answer about life experiences with the present perfect, then ask one follow-up question in the past simple.',
  'Before the lesson: give each learner the Practice A/B and Find Someone Who worksheets; clear a space for mingling.',
  'Lead-in · 5 minutes: tell the class two true experiences and one false one. Learners ask questions and guess which is false.',
  'Say: “I’ve been to Japan. I’ve met a famous person. I’ve broken my arm. Which one isn’t true? Ask me questions.”',
  'Practice A and B · 10 minutes: learners complete A, match follow-up questions in B, then check in pairs and as a class.',
  'Check understanding: Do we know when in “Have you ever…?” No. Do we say when in the follow-up? Yes: “When did you go?”',
  'Practice C · 5 minutes: learners write their questions for the Find Someone Who table. Help with past participles.',
  'Produce · 15 minutes: learners mingle. After “Yes, I have”, they write the name and ask one more question. Stop when most have five names.',
  'Why it works: genuine answers give the present perfect a reason to exist; follow-up questions make the past simple contrast natural.',
].join('\n\n');

const answerNotes = [
  'Practice A: 1 been · 2 eaten · 3 met · 4 seen · 5 lost · 6 won · 7 slept · 8 broken · 9 cooked · 10 forgotten.',
  'Practice B (source key): 1 a · 2 b · 3 c · 4 g · 5 e · 6 f · 7 d · 8 h · 9 i · 10 j.',
  'Practice C and Produce: no single correct answer. Listen for “Have you ever” + past participle, short answers, and past simple follow-up questions.',
].join('\n\n');

/** Fresh nodes and question IDs on every copy: the original collection is never linked or edited. */
export function resourceTasks(selected: Set<string>): ImportedTask[] {
  const out: ImportedTask[] = [];
  const push = (title: string, instructions: string, content: JSONContent, notes = '') =>
    out.push({ line: out.length + 1, kind: 'task', title, instructions, content, notes, hidden: false, locked: false });

  if (selected.has('lead-in')) push(
    'Lead-in · Have you ever…?',
    'Ask questions to find which of your teacher’s three experiences is false.',
    doc(heading('Two true experiences and one false one'), para(txt('Listen to your teacher. Ask “Have you ever…?” questions and use follow-up questions to find the false experience.'))),
    teacherNotes,
  );
  if (selected.has('practice-a')) push(
    'Practice A · Past participles',
    'Complete the questions with a past participle from the word bank.',
    doc(heading('Word bank'), para(txt('be · eat · meet · see · lose · win · sleep · break · cook · forget')),
      ...examples.map(([answer, end], index) => para(txt(`${index + 1}. Have you ever `), gap(answer), txt(end)))),
    answerNotes,
  );
  if (selected.has('practice-b')) push(
    'Practice B · Follow-up questions',
    'Match the follow-up questions to the experiences in Practice A. Then ask a partner.',
    doc(heading('Follow-up questions'), ...followUps.map((question, index) => para(txt(`${String.fromCharCode(97 + index)}. ${question}`)))),
    answerNotes,
  );
  if (selected.has('practice-c')) push(
    'Practice C · Write your questions',
    'Write a “Have you ever…?” question for each experience. The first two are started for you.',
    doc(heading('Before you start'), para(txt('Write the question for each line. The first two are started for you.')),
      { type: 'table', content: [tableRow(['Find someone who has…', 'Your question'], true), ...experiences.map((experience, index) => tableRow([experience, index === 0 ? 'Have you ever been to another country?' : index === 1 ? 'Have you ever' : '']))] }),
    'Semi-controlled preparation: learners form ten present-perfect experience questions before moving into the mingle. Check past participles before they stand up.',
  );
  if (selected.has('produce')) push(
    'Find someone who… · Mingle and report',
    'Write a “Have you ever…?” question for each experience. Walk around, ask your questions, and write a name plus one more detail when someone says yes. Then write three sentences about your class.',
    doc(heading('Find someone who has…'),
      para(txt('Write each question. Walk around and ask it. When someone says “Yes, I have”, write their name and ask one more question.')),
      { type: 'table', content: [tableRow(['Find someone who has…', 'Your question', 'Name', 'One more detail'], true), ...experiences.map((experience, index) => tableRow([experience, index === 0 ? 'Have you ever been to another country?' : index === 1 ? 'Have you ever…' : '', '', '']))] },
      heading('Useful language'), para(txt('Have you ever…? · Yes, I have. / No, I haven’t. · When was that? · What happened?')),
      heading('After'), para(txt('Write three sentences about your class.')), para(txt('1. ')), para(txt('2. ')), para(txt('3. '))),
    'No single correct answer. Listen for present perfect + past participle; short answers; past simple follow-up questions.',
  );
  return out;
}

export const copyParts = [
  { id: 'lead-in', title: 'Lead-in', detail: 'Two true experiences and one false one · teacher guidance stays private' },
  { id: 'practice-a', title: 'Practice A', detail: 'Ten editable questions with answer keys' },
  { id: 'practice-b', title: 'Practice B', detail: 'Follow-up questions and teacher key' },
  { id: 'practice-c', title: 'Practice C', detail: 'Write ten questions before the mingle' },
  { id: 'produce', title: 'Find someone who', detail: 'Mingle table, useful language and follow-up writing' },
] as const;

const plainText = (node: JSONContent): string => node.text ?? (node.content ?? []).map(child => plainText(child) + (['paragraph', 'heading', 'listItem', 'tableRow'].includes(child.type ?? '') ? '\n' : '')).join('');

/** Published learner sections retain their rich editor content; teacher sections become private notes. */
export function publishedTasks(activity: HubActivity, selected: Set<string>): ImportedTask[] {
  const sections = activity.editorSections ?? [];
  const privateNotes = sections.filter(section => section.audience === 'teacher').map(section => `${section.title}\n${section.instructions}\n${plainText(section.content)}`.trim()).join('\n\n');
  return sections.filter(section => section.audience === 'learner' && selected.has(section.id)).map((section, index) => ({
    line: index + 1, kind: 'task', title: section.title, instructions: section.instructions,
    content: structuredClone(section.content), notes: index === 0 ? privateNotes : '', hidden: false, locked: false,
  }));
}

export type AdaptedResource = {
  title: string;
  changeSummary: string;
  leadIn: string;
  practiceA: { question: string; answer: string }[];
  practiceB: { question: string; targetNumber: number }[];
  practiceC: { instructions: string; experiences: string[]; firstModel: string; secondStarter: string };
  produce: { instructions: string; followUpExamples: string[]; reportInstruction: string };
  teacherNotes: string;
};

/** The reviewed AI result becomes fresh editable tasks. All answer text stays in private keys/notes after Classes saves it. */
export function adaptedResourceTasks(value: AdaptedResource): ImportedTask[] {
  if (value.practiceA.length !== 10 || value.practiceB.length !== 10 || value.practiceC.experiences.length !== 10 ||
      value.practiceA.some(item => item.question.split('___').length !== 2 || !item.answer.trim())) throw new Error('The adaptation is incomplete.');
  const answers = value.practiceA.map((item, index) => `${index + 1} ${item.answer}`).join(' · ');
  const matches = value.practiceB.map((item, index) => `${item.targetNumber} ${String.fromCharCode(97 + index)}`).join(' · ');
  const make = (title: string, instructions: string, content: JSONContent, notes: string): ImportedTask => ({
    line: 1, kind: 'task', title, instructions, content, notes, hidden: false, locked: false,
  });
  return [
    make('Lead-in · Have you ever…?', 'Ask questions to find out about life experiences.', doc(heading('Lead-in'), para(txt(value.leadIn))), value.teacherNotes),
    make('Practice A · Life experiences', 'Complete each question. Then ask a partner.', doc(heading('Complete the questions'), ...value.practiceA.map((item, index) => {
      const [before, after] = item.question.split('___');
      return para(txt(`${index + 1}. ${before}`), gap(item.answer), txt(after));
    })), `Answer key: ${answers}\n\n${value.teacherNotes}`),
    make('Practice B · Follow-up questions', 'Match each follow-up question to a question in Practice A.', doc(heading('Follow-up questions'), ...value.practiceB.map((item, index) => para(txt(`${String.fromCharCode(97 + index)}. ${item.question}`)))), `Matching key: ${matches}\n\n${value.teacherNotes}`),
    make('Practice C · Write your questions', value.practiceC.instructions, doc(heading('Before you start'), para(txt(value.practiceC.instructions)), { type: 'table', content: [tableRow(['Find someone who has…', 'Your question'], true), ...value.practiceC.experiences.map((prompt, index) => tableRow([prompt, index === 0 ? value.practiceC.firstModel : index === 1 ? value.practiceC.secondStarter : '']))] }), value.teacherNotes),
    make('Find someone who… · Mingle and report', value.produce.instructions, doc(heading('Find someone who has…'), para(txt(value.produce.instructions)), { type: 'table', content: [tableRow(['Find someone who has…', 'Name', 'One more detail'], true), ...value.practiceC.experiences.map(prompt => tableRow([prompt, '', '']))] }, heading('Follow-up questions'), para(txt(value.produce.followUpExamples.join(' · '))), heading('After'), para(txt(value.produce.reportInstruction))), value.teacherNotes),
  ].map((item, index) => ({ ...item, line: index + 1 }));
}

