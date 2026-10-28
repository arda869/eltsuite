import { addTopic, createClass, getClass } from './classes';
import { addLearners } from './learners';
import { importLesson } from './textformat';
import { createLessonFromImport } from './transfer';
import { newId } from './tasks';
import { BLOCKS } from '../editor/coursebook';

const raw = (n: unknown) => `[[raw]]\n${JSON.stringify(n)}\n[[/raw]]`;
const card = (title: string, text: string) => ({ type: 'pickCard', attrs: { title }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const block = (key: string) => (BLOCKS.find((b) => b.key === key)?.make() ?? []).map(raw).join('\n\n');

// A sample lesson that uses every question type, so a teacher can try everything straight away.
export const DEMO_LESSON = `# Present perfect: experiences

## Section: Warm-up

## Task 1: Talk about it
instructions: Work in pairs. Ask and answer.

${block('aims')}

${raw({ type: 'randomPick', attrs: { id: newId(), mode: 'cards', repeat: false, play: 'own', whoDraws: 'teacher', look: 'graphite', symbol: '✦' }, content: [card('Travel', 'Have you ever been abroad? Where did you go?'), card('Food', 'What is the strangest thing you have ever eaten?'), card('Music', 'Have you ever been to a concert? Who did you see?'), card('Sport', 'Have you ever tried a new sport? How was it?')] })}

## Section: Grammar

## Task 2: Notice the rule
instructions: Read the rule, then complete the sentences.
layout: two-columns 60/40

${block('rule')}

${block('watch')}

---panel---

I {{have been|'ve been}} to Tokyo twice.
She {{has never seen|hasn't ever seen}} the sea.
We {{?has|*have|having}} finished our homework.

[[tf]]
"I have seen him yesterday" is correct. = F
[[/tf]]

[[notes]]
Point out that a finished time (yesterday, last year) needs the past simple. Elicit two more examples.
[[/notes]]

## Task 3: Practice
instructions: Choose, match and put the words in order.

[[mcq]]
Which sentence talks about an experience?
- I went to Paris in 2019.
* I have been to Paris.
- I am going to Paris.
> We use the present perfect for experiences when the time isn't important.
[[/mcq]]

[[match]]
ever = at any time in your life
never = not at any time
already = sooner than expected
= after a long time
[[/match]]

[[order]]
Have you ever eaten sushi
[[/order]]

## Task 4: Complete the email
instructions: Drag the words into the gaps.

[[drag extra=went, seeing]]
Hi Sam, I have just {{arrived}} in Lisbon. I have already {{seen}} the castle and I have {{tried}} the famous custard tarts!
[[/drag]]

## Section: Speaking and writing

## Task 5: Your experiences
instructions: Write about something you have done that surprised you.

[[long words=60-100 points=10]]
Write 60 to 100 words.
model: I have always been afraid of heights, but last summer I went paragliding for the first time...
[[/long]]

${raw({ type: 'board', attrs: { id: newId(), mode: 'postits', prompt: 'One thing you have never done but would like to try', replies: true, reactions: true, anonymous: false, tagging: true } })}

## Task 6: Look back
instructions: How did today go?

${block('cando')}

${raw({ type: 'reflect', attrs: { id: newId(), about: 'peer', title: 'Feedback on your partner’s story', pairing: 'learners', share: true, pairs: {}, items: [{ id: newId(), type: 'stars', prompt: 'How interesting was {name}’s story?' }, { id: newId(), type: 'text', prompt: 'One thing {name} did really well' }] } })}
`;

export async function createDemoClass(teacherId: string, onStep?: (s: string) => void) {
  onStep?.('Making the class');
  const id = await createClass(teacherId, { name: 'Demo class', level: 'B1', themeColor: 'flame' });
  const c = await getClass(id);
  if (!c) throw new Error('missing');
  onStep?.('Adding 6 learners');
  const pins = await addLearners(c, ['Mia Chan', 'Leo Wong', 'Sara Lee', 'Ken Ho', 'Ana Silva', 'Tom Baker']);
  onStep?.('Adding the sample lesson');
  const topicId = await addTopic(id, 'Unit 4 · Present perfect', 0);
  const { title, tasks } = importLesson(DEMO_LESSON);
  const itemId = await createLessonFromImport(id, topicId ?? null, title, tasks);
  return { classId: id, itemId, pins };
}
