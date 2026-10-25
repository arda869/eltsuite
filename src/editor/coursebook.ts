import type { JSONContent } from '@tiptap/react';
import { newTextBox } from './TextBox';
import { newReveal } from './Reveal';
import { newId } from '../lib/tasks';

// Ready-made coursebook blocks. They are ordinary boxes and text, so everything stays editable.
const P = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', ...(content.length ? { content } : {}) });
const T = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const B = (text: string) => T(text, [{ type: 'bold' }]);
const UL = (...items: string[]): JSONContent => ({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [P(T(i))] })) });
const OL = (...items: string[]): JSONContent => ({ type: 'orderedList', content: items.map((i) => ({ type: 'listItem', content: [P(T(i))] })) });
const box = (style: Parameters<typeof newTextBox>[0], tone: Parameters<typeof newTextBox>[1], label: string, symbol: string, content: JSONContent[]): JSONContent => ({ ...newTextBox(style, tone, label, symbol), content });
const bubble = (side: 'left' | 'right', name: string, text: string): JSONContent => ({ type: 'textBox', attrs: { style: 'speech', tone: side === 'left' ? 'grey' : 'sky', label: name, meta: '', side, symbol: '' }, content: [P(T(text))] });

export type Block = { key: string; label: string; hint: string; make: () => JSONContent[] };

export const BLOCKS: Block[] = [
  { key: 'aims', label: 'Lesson aims', hint: '“In this lesson you will…” with can-do lines', make: () => [box('info', 'sky', 'In this lesson you will', '→', [UL('talk about experiences', 'use the present perfect with ever and never', 'ask follow-up questions')])] },
  { key: 'useful', label: 'Useful language', hint: 'Phrases grouped by function', make: () => [box('info', 'sage', 'Useful language', '✎', [P(B('Agreeing')), UL('I couldn’t agree more.', 'That’s a good point.'), P(B('Disagreeing politely')), UL('I see what you mean, but…', 'I’m not sure about that.')])] },
  { key: 'dialogue', label: 'Model dialogue', hint: 'Speech bubbles with speaker names', make: () => [bubble('left', 'Sam', 'Have you ever been to Japan?'), bubble('right', 'Ana', 'Yes, I have. I went there last year.'), bubble('left', 'Sam', 'Really? What was it like?')] },
  { key: 'note', label: 'Note paper', hint: 'A sticky note for examples or a list', make: () => [box('sticky', 'sand', '', '', [UL('milk', 'eggs', 'bread'), P()])] },
  { key: 'rule', label: 'Remember', hint: 'A short grammar rule with the form', make: () => [box('info', 'sand', 'Remember', '!', [P(B('have / has + past participle')), P(T('I have finished. She has never seen it.'))])] },
  { key: 'notice', label: 'Notice', hint: 'Guided discovery with an answer to reveal', make: () => [box('info', 'grey', 'Notice', '?', [P(T('Look at the sentences. Which ones talk about a finished time?')), OL('I have been to Rome.', 'I went to Rome in 2019.'), newReveal('Show the answer', 'Sentence 2 talks about a finished time (in 2019).')])] },
  { key: 'tip', label: 'Tip', hint: 'A study, exam or learning tip (rename the label)', make: () => [box('info', 'sage', 'Exam tip', '★', [P(T('Read all the options before you choose. Underline the key words in the question.'))])] },
  { key: 'watch', label: 'Watch out', hint: 'A common mistake and the correct form', make: () => [box('info', 'rose', 'Watch out', '≠', [P(T('I have seen him yesterday.', [{ type: 'strike' }]), T('  →  '), B('I saw him yesterday.'))])] },
  { key: 'wordbox', label: 'Word box', hint: 'Words and phrases for the task', make: () => [box('box', 'grey', 'Word box', '', [P(T('journey  ·  luggage  ·  sightseeing  ·  passport  ·  souvenir'))])] },
  { key: 'glossary', label: 'Glossary', hint: 'Meanings of words in a reading text', make: () => [box('box', 'grey', 'Glossary', '', [P(B('reluctant'), T(' (adj.) not wanting to do something')), P(B('remote'), T(' (adj.) far away from towns and cities'))])] },
  { key: 'pron', label: 'Pronunciation', hint: 'Stress, IPA and listening', make: () => [box('info', 'sky', 'Pronunciation', '♪' as never, [P(T('Listen and repeat. Mark the stress.')), P({ type: 'stress', attrs: { syllables: ['pho', 'to', 'graph'], stressed: 0, style: 'box' } }, T('  '), { type: 'ipa', attrs: { text: 'ˈfəʊtəɡrɑːf', accent: 'RP', showAccent: false, listen: 'voice', say: 'photograph', audioId: '' } })])] },
  { key: 'discuss', label: 'Talk about it', hint: 'Discussion questions for pairs or groups', make: () => [box('info', 'sand', 'Talk about it', '✎', [P({ type: 'icon', attrs: { name: 'pair', tone: 'accent' } }, T(' Work in pairs.')), OL('What is the best trip you have ever taken?', 'Where would you like to go next, and why?')])] },
  { key: 'didyouknow', label: 'Did you know?', hint: 'A culture or fact box', make: () => [box('info', 'sky', 'Did you know?', 'i', [P(T('English has more than a million words, but most people use about 20,000.'))])] },
  {
    key: 'cando',
    label: 'Can-do checklist',
    hint: 'End-of-lesson self-assessment; answers go to you',
    make: () => [
      {
        type: 'reflect',
        attrs: {
          id: newId(),
          about: 'self',
          title: 'How well can you do these now?',
          items: ['I can talk about experiences.', 'I can use the present perfect with ever and never.'].map((p) => ({ id: newId(), type: 'scale', prompt: p, points: 3, low: 'Not yet', high: 'Yes, easily' })),
        },
      },
    ],
  },
];
