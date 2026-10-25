import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { JSONContent } from '@tiptap/react';
import { TaskEditor } from './editor/TaskEditor';
import { TaskRenderer } from './components/TaskRenderer';
import { splitKey, mergeKey, scoreTask, questionIds, type Responses } from './lib/tasks';
import './styles.css';
const P = (...c: JSONContent[]): JSONContent => ({ type: 'paragraph', content: c });
const T = (text: string): JSONContent => ({ type: 'text', text });
const card = (title: string, text: string, q = false): JSONContent => ({ type: 'pickCard', attrs: { title }, content: [P(T(text)), ...(q ? [P(T('Answer: I have '), { type: 'gap', attrs: { id: 'pg' + title, answers: ['been'] } }, T(' there.'))] : [])] });
const pick = (id: string, mode: string): JSONContent => ({ type: 'randomPick', attrs: { id, mode, repeat: false, play: 'own' }, content: [card('Travel', 'Talk about the best trip you have ever taken. Where did you go?', true), card('Food', 'Describe a dish from your country to someone who has never tried it.'), card('Work', 'What would your dream job be, and why?'), card('Childhood', 'Tell us about a favourite game you played as a child.'), card('Future', 'Where do you see yourself in five years?')] });
const start: JSONContent = { type: 'doc', content: [
  { type: 'textBox', attrs: { style: 'info', tone: 'sand', label: 'Grammar', symbol: '!' }, content: [P({ type: 'text', text: 'Present perfect', marks: [{ type: 'bold' }] }, T(' = have / has + past participle')), P(T('Use it for experiences when the time is not important: I have been to Japan.'))] },
  { type: 'textBox', attrs: { style: 'info', tone: 'sky', label: 'Useful language', symbol: '✎' }, content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [P(T('In my opinion, …'))] }, { type: 'listItem', content: [P(T('I see what you mean, but …'))] }] }] },
  { type: 'reflect', attrs: { id: 'rf1', about: 'peer', title: 'Feedback on the role play', items: [
    { id: 'a', type: 'stars', prompt: 'How clearly did {name} speak?' },
    { id: 'b', type: 'faces', prompt: 'How did {name} seem to feel?' },
    { id: 'c', type: 'scale', prompt: 'How easy was it to understand {name}?', points: 5, low: 'Hard', high: 'Easy' },
    { id: 'd', type: 'choice', prompt: 'Did {name} use the new phrases?', options: ['Yes', 'Partly', 'Not yet'] },
    { id: 'e', type: 'checklist', prompt: '{name} could…', options: ['ask follow-up questions', 'agree and disagree politely'] },
    { id: 'f', type: 'text', prompt: 'One tip for {name}' } ] } },
  pick('pk1', (new URLSearchParams(location.search).get('mode') ?? 'cards')),
  P(T('She was '), { type: 'text', text: 'reluctant', marks: [{ type: 'definition', attrs: { data: { pos: 'adjective', meaning: 'Not wanting to do something, so you do it slowly or not at all.', example: 'He was reluctant to admit his mistake.', ipa: '/rɪˈlʌktənt/', stress: 're·LUC·tant', family: 'reluctance (n), reluctantly (adv)', patterns: 'be reluctant to do sth', register: 'neutral', synonyms: 'unwilling, hesitant', antonyms: 'eager, willing', mistakes: 'Not “reluctant for doing”', cefr: 'B2' } } }] }, T(' '), { type: 'ipa', attrs: { text: 'rɪˈlʌktənt', accent: 'RP' } }, T(' to go. '), { type: 'icon', attrs: { name: 'smile', tone: 'accent' } }, T(' '), { type: 'sym', attrs: { text: '+', shape: 'box', tone: 'ink' } }, T(' '), { type: 'sym', attrs: { text: 'V', shape: 'circle', tone: 'ink' } }, T(' '), { type: 'sym', attrs: { text: 'adj.', shape: 'pill', tone: 'ink' } }, T(' '), { type: 'sym', attrs: { text: 'noun', shape: 'mont' } }, T(' Say '), { type: 'stress', attrs: { syllables: ['pho', 'to', 'graph'], stressed: 0, style: 'box' } }, T(', '), { type: 'stress', attrs: { syllables: ['pho', 'to', 'gra', 'pher'], stressed: 1, style: 'bold' } }, T(' and '), { type: 'stress', attrs: { syllables: ['pho', 'to', 'gra', 'phic'], stressed: 2, style: 'big' } }, T('.')),
  P(T('I have never '), { type: 'gap', attrs: { id: 'g1', answers: ['been'], hint: 'Past participle of be', feedback: 'Use been for experiences.' } }, T(' to Japan.')),
  P(T('She '), { type: 'choice', attrs: { id: 'c1', options: ['go', 'goes', 'going'], correct: 1, display: 'letters' } }, T(' to work.')),
  P(T('Pick two: '), { type: 'choice', attrs: { id: 'c2', options: ['red', 'blue', 'cat'], correct: [0, 1], multi: true, display: 'letters' } }),
  P(T('London is in France. '), { type: 'choice', attrs: { id: 'c3', options: ['True', 'False'], correct: 1, display: 'radio' } }),
  { type: 'columnBreak' },
  { type: 'wordbank', attrs: { extras: ['seen'] } },
  P(T('I have '), { type: 'dropgap', attrs: { id: 'd1', answer: 'eaten' } }, T(' lunch and '), { type: 'dropgap', attrs: { id: 'd2', answer: 'gone' } }, T(' home.')),
  { type: 'match', attrs: { id: 'm1', pairs: [{ left: 'happy', right: 'joyful' }, { left: 'big', right: 'large' }, { left: 'fast', right: 'quick' }], extras: ['slow'] } },
  { type: 'order', attrs: { id: 'o1', sentence: 'I have never been there' } },
  { type: 'writing', attrs: { id: 'w1', minWords: 20, maxWords: 40, model: 'x' } },
  { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [P(T('Verb'))] }, { type: 'tableHeader', content: [P(T('Past participle'))] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [P(T('go'))] }, { type: 'tableCell', content: [P(T('gone'))] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [P(T('see'))] }, { type: 'tableCell', attrs: { bg: 'sand' }, content: [P(T('seen'))] }] }] },
] };
function App() {
  const [doc, setDoc] = useState(start);
  const [r, setR] = useState<Responses>({});
  const [checked, setChecked] = useState(false);
  const s = splitKey(doc);
  const merged = mergeKey(s.content, s.key);
  (window as any).__ok = JSON.stringify(splitKey(merged).key) === JSON.stringify(s.key);
  (window as any).__score = scoreTask(questionIds(s.content), s.key, r);
  return <div style={{ display: 'flex', gap: 20, padding: 20 }}>
    <div style={{ flex: 1 }} id="ed"><TaskEditor content={start} onChange={setDoc} /></div>
    <div style={{ flex: 1.4 }} id="pv"><TaskRenderer disabled={(window as any).__rev} revealed={(window as any).__rev ? s.key : null} classmates={[{id:'x1',name:'Mia Chan'},{id:'x2',name:'Leo Wong'},{id:'x3',name:'Sara Lee'}]} selfId="x3" layout="two" content={s.content} responses={r} onChange={(id, v) => setR({ ...r, [id]: v })} results={checked ? s.key : null} /><button id="chk" onClick={() => setChecked(true)}>check</button></div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
