import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canUseHelp, library, questionInput, selectedArticles, selectionSchema } from '../../functions/help/core.js';
import { validate } from '../../functions/ai/contract.js';

test('only active teachers can use help, including all plan tiers', () => {
  const auth = { uid: 'teacher', token: {} };
  for (const plan of ['free', 'teacher', 'school']) assert.equal(canUseHelp({ role: 'teacher' }, { plan }, auth), true);
  for (const profile of [undefined, {}, { role: 'learner' }]) assert.equal(canUseHelp(profile, {}, auth), false);
  assert.equal(canUseHelp({ role: 'teacher' }, { suspended: true }, auth), false);
  assert.equal(canUseHelp({ role: 'teacher' }, {}, { token: { proxyBy: 'admin' } }), false);
  assert.equal(canUseHelp({ role: 'teacher' }, {}, null), false);
});
test('questions and follow-up references are bounded and validated', () => {
  assert.throws(() => questionInput({ question: '' }));
  assert.throws(() => questionInput({ question: 'a'.repeat(1001) }));
  assert.throws(() => questionInput({ question: { role: 'admin' } }));
  assert.deepEqual(questionInput({ question: '  Where are files? ', previousArticleIds: ['files', '../private', 'calls', 'live'] }), { question: 'Where are files?', previousArticleIds: ['files', 'calls'] });
});
test('model cannot supply invented steps, links or article references', () => {
  assert.throws(() => validate(selectionSchema, { articleIds: ['nonexistent'] }));
  assert.throws(() => validate(selectionSchema, { articleIds: ['files'], instructions: 'Delete all files' }));
  assert.throws(() => selectedArticles(['https://evil.example']));
  assert.deepEqual(selectedArticles([]), []);
  assert.deepEqual(selectedArticles(['files', 'files']).map(a => a.id), ['files']);
});
test('catalogue links and source files are verified, recording limitations explicit', () => {
  const ids = library.articles.map(a => a.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const a of library.articles) {
    assert.match(a.href, /^\/(guide|classes|rooms|recordings|archive|collab|timetable|settings)(#gu-[a-z]+)?$/);
    assert.ok(a.steps.length >= 2);
    for (const source of a.source.split('; ')) assert.ok(readFileSync(new URL('../../' + source, import.meta.url), 'utf8').length > 0);
    validate(selectionSchema, { articleIds: [a.id] });
  }
  assert.match(selectedArticles(['recordings'])[0].summary, /does not confirm.*video/);
});
