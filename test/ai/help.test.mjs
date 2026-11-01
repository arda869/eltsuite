import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canUseHelp, library, questionInput, selectedArticles, selectionSchema } from '../../functions/help/core.js';
import {exactArticles,searchArticles,normalise} from '../../functions/help/search.js';
import {routingIndex} from '../../functions/help/core.js';
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
    assert.match(a.href, /^\/(guide|classes|rooms|recordings|archive|collab|timetable|settings|development|linguistics|design|pdf|messages|colleagues|org-admin|studio\/video)(#gu-[a-z]+|\?section=(reading|coach))?$/);
    assert.ok(a.steps.length >= 2);
    for (const source of a.source.split('; ')) assert.ok(readFileSync(new URL('../../' + source, import.meta.url), 'utf8').length > 0);
    validate(selectionSchema, { articleIds: [a.id] });
  }
  assert.match(selectedArticles(['recordings'])[0].summary, /video-lesson recording.*not confirmed/);
});

test('related help points only to shipped, verified alternatives', () => {
  const ids = new Set(library.articles.map(a => a.id));
  for (const a of library.articles) for (const id of a.related) assert.ok(ids.has(id) && id !== a.id);
  const recording = selectedArticles(['recordings'])[0];
  assert.ok(recording.related.includes('ai-audio'));
  const speech = selectedArticles(['ai-audio'])[0];
  assert.ok(speech.steps.some(s => s.includes('Create speech')));
  assert.ok(speech.steps.some(s => s.includes('Draft with AI')));
  assert.equal(selectedArticles(['ai-lessons'])[0].requiresPilot, true);
  assert.equal(speech.requiresPilot, false);
});

test('knowledge base covers teacher apps with searchable questions and a bounded routing index',()=>{
 assert(library.articles.length>=100);
 for(const a of library.articles){assert(a.category);assert(a.questions.length>=2);assert.match(a.reviewedAt,/^\d{4}-\d{2}-\d{2}$/);for(const q of a.questions)assert(exactArticles(library.articles,q).some(x=>x.id===a.id),q);}
 assert(JSON.stringify(routingIndex).length<65000);
 for(const [q,id]of [['How do I generate images?','ai-images'],['Why does my video not move?','animate-image'],['Can I make a song without linking a lesson?','songs'],['Can I import a scanned PDF or Word document?','material-formats']])assert(exactArticles(library.articles,q).some(x=>x.id===id));
 assert.equal(normalise('How DO I generate images?!'),'how do i generate images');
 assert.equal(searchArticles(library.articles,'magic eraser')[0].id,'image-erase');
 assert(searchArticles(library.articles,'six selected pages').some(a=>a.id==='material-formats'));
 assert.equal(exactArticles(library.articles,'Please delete every learner for me').length,0);
});
