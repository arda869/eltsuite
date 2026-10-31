import type { JSONContent } from '@tiptap/react';
const text = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const gap = (id: string): JSONContent => ({ type: 'gap', attrs: { id, answers: ['Monday'], answer: 'Monday' } });
const choice: JSONContent = { type: 'choice', attrs: { id: 'nested-choice', options: ['Monday', 'Tuesday', 'Wednesday'], correct: [0], display: 'dropdown' } };
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160" viewBox="0 0 480 160"><rect width="480" height="160" fill="#e9f0f2"/><path d="M30 130L130 30L230 130Z" fill="#338399"/><circle cx="340" cy="80" r="45" fill="#ddaa6d"/></svg>');
const long = 'We are planning a visit to the museum. Please bring your notebook and tell a partner what you would like to find out. ';
export const fixture: JSONContent = { type: 'doc', content: [
  p(text('Reading, dialogue and nested answers', [{ type: 'bold' }])),
  { type: 'textBox', attrs: { style: 'email', tone: 'grey', meta: 'Alex', label: 'Our visit', side: 'left' }, content: [p(text(long.repeat(2))), p(text('We will go on '), gap('email-gap'), text('. Choose a day: '), choice)] },
  { type: 'dialogue', attrs: { speakers: ['Alex', 'Sam'], layout: 'side' }, content: [
    { type: 'dialogueLine', attrs: { who: 0 }, content: [text(long), text('Remember '), gap('dialogue-gap')] },
    { type: 'dialogueLine', attrs: { who: 1 }, content: [text(long.repeat(2))] },
  ] },
  ...(['left', 'right'] as const).map(side => ({ type: 'textBox', attrs: { style: 'speech', tone: 'grey', label: side === 'left' ? 'Alex' : 'Sam', side }, content: [p(text(long.repeat(side === 'left' ? 1 : 3)))] })),
  { type: 'textBox', attrs: { style: 'sticky', tone: 'grey', label: 'Remember' }, content: [p(text('Use a question to find out more.'))] },
  { type: 'textBox', attrs: { style: 'message', tone: 'grey', label: 'Sam', meta: '10:30', side: 'right' }, content: [p(text('See you on Monday.'))] },
  { type: 'table', attrs: { lines: 'all' }, content: [
    { type: 'tableRow', content: ['Day', 'Plan'].map(t => ({ type: 'tableHeader', content: [p(text(t))] })) },
    { type: 'tableRow', content: [{ type: 'tableCell', content: [p(gap('table-gap'))] }, { type: 'tableCell', content: [p(text('Read '), text('carefully', [{ type: 'italic' }, { type: 'underline' }]))] }] },
  ] },
  { type: 'diagram', attrs: { id: 'diagram-fixture', kind: 'flow', title: 'Plan the visit', labels: [] }, content: [
    { type: 'diagramCell', attrs: { label: 'First' }, content: [p(text('Choose a day'))] },
    { type: 'diagramCell', attrs: { label: 'Then' }, content: [p(gap('diagram-gap'))] },
    { type: 'diagramCell', attrs: { label: 'Finally' }, content: [p(text('Visit'))] },
  ] },
  p({ type: 'picture', attrs: { src: image, size: 'm', alt: 'Original geometric picture', tags: [{x:30,y:40,text:'Triangle'}] } }),
  {type:'media',attrs:{media:'style-recording',kind:'audio',title:'Listen to the visit plan',scriptMode:'karaoke'}},
  {type:'randomPick',attrs:{id:'cutout-fixture',mode:'cards',play:'own',repeat:false},content:[{type:'pickCard',attrs:{title:'Ask'},content:[p(text('Ask your partner about the visit.'))]},{type:'pickCard',attrs:{title:'Answer'},content:[p(text('Describe your plan.'))]}]},
  p(text('Pronunciation: '), { type: 'ipa', attrs: { text: 'ˈmʌndeɪ θ ð ʃ ʒ ŋ ə ɜː', accent: 'RP', showAccent: true } }),
  { type: 'wordbank', attrs: { id: 'bank', words: ['Monday', 'museum', 'notebook'] } },
  p(text('Bring your '), { type: 'dropgap', attrs: { id: 'drop-fixture', answer: 'notebook' } }),
  { type: 'order', attrs: { id: 'order-fixture', words: ['We', 'will', 'go', 'on', 'Monday'], sentence: 'We will go on Monday' } },
  { type: 'writing', attrs: { id: 'writing-fixture', prompt: 'Write about your visit.', minWords: 10, maxWords: 30 } },
  { type: 'reveal', attrs: { id: 'reveal-fixture', label: 'Read the hint', mode: 'tap' }, content: [p(text('Start with the day.'))] },
  { type: 'subTask', attrs: { id: 'sub-fixture', instr: 'Compare your ideas.', mode: 'all' }, content: [p(text('A nested answer: '), gap('sub-gap'))] },
] };
export const exportFixture = { title: 'Planning a visit', instructions: 'Read, choose and compare your ideas.', notes: 'Ask learners to explain their choices. Keep the notes with the key.', content: fixture };
