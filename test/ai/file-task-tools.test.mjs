import test from 'node:test';
import assert from 'node:assert/strict';
import { fileTaskDraftResult } from '../../functions/ai/file-task-tools.js';

const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'I ' }, { type: 'gap', attrs: { id: 'g1', answers: [] } }, { type: 'text', text: ' yesterday.' }] }] };
const source = { id: 'task1', title: 'Complete the sentence', instructions: 'Use the past tense.', content, key: {}, notes: '', order: 0 };
const body = { blocks: [], definitions: [], structures: [], subTasks: [], visuals: [], input: 'Yesterday in the park.', questions: [{ format: 'choice', acceptedAnswers: [], prompt: 'Yesterday I ___ to the park.', options: ['went', 'go'], answer: 'went', explanation: 'Past time.' }] };
const activity = { stageId: 'tool', title: 'Past tense in the park', format: 'choice', mediaPlan: [], layout: 'stacked', imageLayout: 'row', teacherOnlyInput: '', roles: [], minutes: 10, instructions: 'Choose the correct word.', ...body, inlineElements: [], versions: [], teacherNotes: 'Ask learners to explain their choice.', support: '', challenge: '' };
const generated = { title: 'Yesterday', rationale: 'Past time practice.', differentiation: 'No class evidence.', recycling: 'No class evidence.', tasks: [activity] };

test('a new standalone task is native, reviewable, and keeps the key separate', () => {
  const result = fileTaskDraftResult('next', generated, [], 10);
  assert.equal(result.title, 'Past tense in the park');
  assert.equal(result.key.q0_0.correct, 0);
  assert.ok(result.notes.includes('Ask learners to explain'));
  assert.ok(!JSON.stringify(result.content).includes('Past time.'));
  assert.throws(() => fileTaskDraftResult('next', { ...generated, tasks: [{ ...activity, mediaPlan: [{ kind: 'image' }] }] }, [], 10), /media|Invalid/i);
});

test('editing can revise text while preserving the existing question structure', () => {
  const result = fileTaskDraftResult('edit', { summary: 'Clearer title', changes: [{ path: 'title', before: source.title, after: 'Past-tense gap' }], answers: [] }, [source], 10);
  assert.equal(result.title, 'Past-tense gap');
  assert.deepEqual(result.content, content);
  assert.throws(() => fileTaskDraftResult('edit', { summary: '', changes: [{ path: 'content/0', before: '', after: 'Replace all' }], answers: [] }, [source], 10));
});

test('answer key generation accepts only missing questions from this file', () => {
  const result = fileTaskDraftResult('answers', { entries: [{ taskId: 'task1', questionId: 'g1', answerJson: '{"answers":["went"]}', reason: 'Past time.' }], issues: [] }, [source], 10);
  assert.deepEqual(result.entries[0].key.answers, ['went']);
  assert.throws(() => fileTaskDraftResult('answers', { entries: [{ taskId: 'another', questionId: 'g1', answerJson: '{"answers":["went"]}', reason: '' }], issues: [] }, [source], 10));
});

test('differentiation produces a separate, fully reviewed task', () => {
  const result = fileTaskDraftResult('differentiate', generated, [source], 10);
  assert.ok(result.content.content.length);
  assert.equal(result.key.q0_0.correct, 0);
});
