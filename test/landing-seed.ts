// The fictional class behind the public website's screenshots (test/landing-shots.mjs).
// Runs in the mock app (test/vite.config.ts) after ?seed, using the app's own functions, so every
// screen is the real product with made-up learners. Nothing here touches production data.
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { addTopic, createClass, getClass } from '../src/lib/classes';
import { addLearners } from '../src/lib/learners';
import { importLesson } from '../src/lib/textformat';
import { createLessonFromImport } from '../src/lib/transfer';
import { saveSound, type ScriptLine } from '../src/lib/archive';
import { newTextBox } from '../src/editor/TextBox';
import { newId } from '../src/lib/tasks';

const raw = (n: unknown) => `[[raw]]\n${JSON.stringify(n)}\n[[/raw]]`;
const P = (...content: unknown[]) => ({ type: 'paragraph', ...(content.length ? { content } : {}) });
const T = (text: string, marks?: unknown[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const B = (text: string) => T(text, [{ type: 'bold' }]);
const UL = (...items: string[]) => ({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [P(T(i))] })) });
const box = (style: Parameters<typeof newTextBox>[0], tone: Parameters<typeof newTextBox>[1], label: string, symbol: string, content: unknown[]) => ({ ...newTextBox(style, tone, label, symbol), content });

export const LEARNERS = ['Maya Patel', 'Omar Haddad', 'Lina Costa', 'Theo Martin', 'Ana Souza', 'Jun Park', 'Leila Rahimi', 'Ben Cooper'];
export const DIALOGUE: [string, string][] = [
  ['Flo', 'So, what should we do with the empty shop on the corner?'],
  ['Dan', 'I think a reading room would be better, because the library is so far away.'],
  ['Flo', 'I see your point, but what about the cost?'],
  ['Dan', 'Well, a reading room costs three thousand pounds. That fits our budget.'],
  ['Flo', 'That’s a good point. And older neighbours would have somewhere quiet to meet.'],
  ['Dan', 'Exactly. So, shall we agree on the reading room?'],
];
const EARLIER = [
  ['Getting to know our class', 'Ask follow-up questions about interests.'],
  ['Places that matter', 'Describe a place and explain why it matters.'],
  ['Making suggestions', 'Suggest options for an afternoon together.'],
  ['Comparing options', 'Compare cost, convenience and interest.'],
  ['Asking for clarification', 'Check information before you decide.'],
  ['Agreeing and disagreeing', 'Acknowledge another view before you respond.'],
  ['A neighbourhood decision', 'Give an opinion and support it with a reason.'],
];

// The six recorded lines (test/fixtures/landing), one after another, as one WAV file.
async function dialogueAudio() {
  const ctx = new OfflineAudioContext(1, 1, 22050);
  const parts = await Promise.all(DIALOGUE.map(async (_, i) => ctx.decodeAudioData(await (await fetch(`/test/fixtures/landing/line${i + 1}.wav`)).arrayBuffer())));
  const rate = parts[0].sampleRate, gap = Math.round(rate * 0.45);
  const total = parts.reduce((n, p) => n + p.length + gap, gap);
  const pcm = new Float32Array(total);
  const script: ScriptLine[] = [];
  let at = gap;
  parts.forEach((p, i) => {
    pcm.set(p.getChannelData(0), at);
    script.push({ t: +(at / rate).toFixed(2), e: +((at + p.length) / rate).toFixed(2), text: DIALOGUE[i][1], who: DIALOGUE[i][0] });
    at += p.length + gap;
  });
  const bytes = new DataView(new ArrayBuffer(44 + total * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); bytes.setUint32(4, 36 + total * 2, true); str(8, 'WAVEfmt '); bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true);
  bytes.setUint32(24, rate, true); bytes.setUint32(28, rate * 2, true); bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true); str(36, 'data'); bytes.setUint32(40, total * 2, true);
  pcm.forEach((v, i) => bytes.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return { blob: new Blob([bytes], { type: 'audio/wav' }), script, duration: total / rate };
}

function lessonText(mediaId: string) {
  const aims = box('info', 'sky', 'In this lesson you will', '→', [UL('give an opinion and a reason', 'respond politely to a different view', 'agree on a decision together')]);
  const media = { type: 'media', attrs: { media: mediaId, archiveId: '', kind: 'audio', title: 'Two neighbours decide', scriptMode: 'karaoke', plays: 0 } };
  const useful = box('info', 'sage', 'Useful language', '✎', [
    P(B('Giving a reason')), UL('I think … would be better, because …', 'The main reason is …'),
    P(B('Responding to another view')), UL('I see your point, but what about …?', 'That’s a good point. And …'),
  ]);
  const pron = box('info', 'sky', 'Pronunciation', '♪', [
    P(T('Listen and repeat. Where is the stress?')),
    P({ type: 'stress', attrs: { syllables: ['o', 'pin', 'ion'], stressed: 1, style: 'box' } }, T('  '), { type: 'ipa', attrs: { text: 'əˈpɪnjən', accent: 'RP', showAccent: false, listen: 'voice', say: 'opinion', audioId: '' } }),
  ]);
  const board = { type: 'board', attrs: { id: newId(), mode: 'postits', prompt: 'One phrase that helped you keep the discussion going', replies: true, reactions: true, anonymous: false, tagging: true } };
  return `# Expressing and Justifying Opinions

## Section: Lead-in

## Task 1: Two neighbours decide
instructions: Listen to two neighbours. What do they decide?

${raw(aims)}

${raw(media)}

[[mcq]]
What do they choose for the empty shop?
- A café
* A reading room
- A workshop space
> Dan says a reading room fits their budget.
[[/mcq]]

[[notes]]
Play the recording once for the decision only. Don’t pre-teach the phrases yet: ask pairs what reasons they heard, then play it again.
[[/notes]]

## Section: Language

## Task 2: Notice the language
instructions: Complete what the neighbours say. Then compare with a partner.

${raw(useful)}

“I see your {{point}}, but what {{about}} the cost?”
“A reading room would be better, {{because}} the library is so far away.”

${raw(pron)}

[[notes]]
Drill the response chunk as one unit. Point out the weak “but” and the rise on “cost?”.
[[/notes]]

## Section: Speaking

## Task 3: One space. Two priorities.
instructions: Work in pairs. You each have different information.

[[speaking timer=180]]
Your neighbourhood has one empty shop and a £5,000 budget. Agree on one new use for it.
- What does the neighbourhood need most?
- What can you afford?
- What would make your partner change their mind?
[[/speaking]]

[[notes]]
Learner A has the neighbourhood view; Learner B has the practical view. Listen for reasons before you offer a model.
[[/notes]]

## Task 4: A second conversation
instructions: The budget is now £2,500. Talk again, then write your decision.

[[long words=40-80 points=10]]
Write what you decided and why. Use one phrase from today.
[[/long]]

${raw(board)}

## Section: Reflection

## Task 5: Look back
instructions: How did today go?

[[survey anonymous=no title="Today’s lesson"]]
How confident do you feel giving a reason?
scale: 1-5 | Not yet | Very confident
[[/survey]]
`;
}

export async function seedLanding(teacherId = 'teacher1') {
  const classId = await createClass(teacherId, { name: 'B1 English for Communication', level: 'B1', themeColor: 'flame' });
  // The class's own room, as scripts/video.mjs gives every class. The link is never opened.
  await updateDoc(doc(db, 'classes', classId), { video: { url: 'https://eltsuite.daily.co/b1-english-for-communication' } });
  const c = await getClass(classId);
  if (!c) throw Error('class missing');
  await addLearners(c, LEARNERS);
  const learners = (await getDocs(collection(db, 'classes', classId, 'learners'))).docs.map((d) => ({ id: d.id, ...(d.data() as { displayName: string; authUid: string }) }));
  const topicEarlier = await addTopic(classId, 'Unit 1 · Talking together', 0);
  const topic = await addTopic(classId, 'Unit 2 · Opinions and decisions', 1);
  // Earlier lessons, each with one marked task, so reports and progress have history.
  const earlier: string[] = [];
  for (const [i, [title, aim]] of EARLIER.entries()) {
    const src = `# ${title}\n\n## Task 1: ${aim}\ninstructions: Choose the best answer.\n\n[[mcq]]\nWhich reply keeps the conversation going?\n- Yes.\n* Yes, I do. What about you?\n- OK.\n[[/mcq]]\n`;
    const { tasks } = importLesson(src);
    const id = await createLessonFromImport(classId, (i < 4 ? topicEarlier : topic) ?? null, title, tasks);
    await updateDoc(doc(db, 'classes', classId, 'items', id), { hidden: false });
    earlier.push(id);
  }
  const audio = await dialogueAudio();
  const { mediaId } = await saveSound(classId, audio.blob, { title: 'Two neighbours decide', script: audio.script, duration: audio.duration });
  const { title, tasks } = importLesson(lessonText(mediaId));
  const itemId = await createLessonFromImport(classId, topic ?? null, title, tasks);
  await updateDoc(doc(db, 'classes', classId, 'items', itemId), { hidden: false });
  // Marked answers for the earlier lessons: most learners do well, two have gaps to look into.
  const scores = [[1, 1, 1, 1, 1, 1, 1], [1, 0, 1, 1, 1, 1, 1], [1, 1, 1, 0, 1, 1, 1], [1, 1, 0, 1, 1, 1, 1], [1, 1, 1, 1, 0, 1, 1], [0, 1, 1, 1, 1, 0, 1], [1, 1, -1, 1, 1, -1, -1], [1, -1, 1, 1, -1, 1, -1]];
  for (const [li, l] of learners.entries()) {
    for (const [ei, id] of earlier.entries()) {
      const s = scores[LEARNERS.indexOf(l.displayName)]?.[ei] ?? 1;
      if (s < 0) continue;
      const taskId = (await getDocs(collection(db, 'classes', classId, 'items', id, 'tasks'))).docs[0].id;
      await setDoc(doc(db, 'classes', classId, 'answers', `${taskId}_${l.authUid}`), { learnerUid: l.authUid, learnerId: l.id, itemId: id, taskId, responses: { x: [s ? 1 : 0] }, checked: true, score: s ? 2 + (li % 2) : 1, total: 3, submittedAt: Date.now() - (7 - ei) * 864e5 });
    }
  }
  // The teacher's view of each learner in the portfolio.
  const skillSets = [['B1', 'B1', 'A2', 'B1'], ['B1', 'B2', 'B1', 'B1'], ['A2', 'B1', 'B1', 'A2']];
  const summaries: Record<string, string> = {
    'Maya Patel': 'Maya gives clear opinions and now supports most of them with a reason. Next: respond to a different view before she adds her own.',
    'Omar Haddad': 'Omar asks good questions to check information. Next: say why one option is better, not only which one he prefers.',
  };
  for (const [i, l] of learners.entries()) {
    const [Speaking, Listening, Writing, Pronunciation] = skillSets[i % 3];
    await setDoc(doc(db, 'classes', classId, 'portfolio', 'p_' + l.id), { kind: 'profile', learnerId: l.id, learnerUid: l.authUid, skills: { Speaking, Listening, Writing, Pronunciation }, ...(summaries[l.displayName] ? { summary: summaries[l.displayName] } : {}) }, { merge: true });
  }
  // Answers coming in to the lead-in question while the lesson is taught live.
  const first = (await getDocs(collection(db, 'classes', classId, 'items', itemId, 'tasks'))).docs.map((d) => ({ id: d.id, ...(d.data() as { order?: number; content: never; kind?: string }) })).filter((t) => t.kind !== 'section').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  const { splitKey, questionIds } = await import('../src/lib/questions');
  const qs = questionIds(splitKey(first.content).content).map((q) => q.id);
  const picks = [1, 1, 1, 0, 1, 2, 1, null];
  for (const [i, l] of learners.entries()) {
    const pick = picks[i];
    if (pick === null) continue;
    await setDoc(doc(db, 'classes', classId, 'answers', `${first.id}_${l.authUid}`), { learnerUid: l.authUid, learnerId: l.id, itemId, taskId: first.id, responses: { [qs[0]]: [pick] }, checked: i % 4 !== 3 });
  }
  const out = { classId, itemId, mediaId, earlier, firstTask: first.id, learners: learners.map((l) => ({ id: l.id, uid: l.authUid, name: l.displayName })) };
  localStorage.setItem('landingdemo', JSON.stringify(out));
  return out;
}
