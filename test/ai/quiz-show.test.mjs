// The live quiz show's rules (functions/quiz/engine.js): slides, what phones may see, scoring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, cleanResponses, markSlide, pointsFor, publicSlide, ranked, revealFor, slidesOf, streakBonus, uniqueName } from '../../functions/quiz/engine.js';
import { splitKey } from '../../functions/ai/import-question-core.js';

const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const mcq = (id, prompt, options, correct) => ({ type: 'mcq', attrs: { id, prompt, options, correct } });
const gapLine = (before, id, answers) => ({ type: 'paragraph', content: [{ type: 'text', text: before }, { type: 'gap', attrs: { id, answers } }] });
const doc = (...content) => ({ type: 'doc', content });

const full = doc(p('Look at the picture.'), mcq('q1', 'Which is a fruit?', ['Apple', 'Chair', 'Bus'], 0), gapLine('She ', 'q2', ['goes', 'walks']), p('Writing:'), { type: 'writing', attrs: { id: 'w1' } }, mcq('q3', 'Your favourite?', ['Tea', 'Coffee'], -1));

test('a task becomes slides: lead-in blocks travel with their question, long answers are left out', () => {
  const { content } = splitKey(full);
  const slides = slidesOf(content, [{ seconds: 30, points: 2 }, {}, { poll: true }]);
  assert.equal(slides.length, 3);
  assert.deepEqual(slides[0].qids, ['q1']);
  assert.equal(slides[0].blocks.length, 2);
  assert.equal(slides[0].seconds, 30);
  assert.equal(slides[0].points, 2);
  assert.deepEqual(slides[1].qids, ['q2']);
  assert.equal(slides[1].seconds, 20, 'default time');
  // "Writing:" and the writing box are not marked, so they lead in to the poll.
  assert.deepEqual(slides[2].qids, ['q3']);
  assert.equal(slides[2].poll, true);
  assert.equal(slides[2].points, 0);
});

test('saved quiz slide sizes are kept, and ignored once the blocks no longer add up', () => {
  const { content } = splitKey(doc(gapLine('A ', 'a', ['x']), gapLine('B ', 'b', ['y']), mcq('c', 'C?', ['1', '2'], 1)));
  assert.equal(slidesOf(content, [], [2, 1]).length, 2, 'two gaps on one slide');
  assert.deepEqual(slidesOf(content, [], [2, 1])[0].qids, ['a', 'b']);
  assert.equal(slidesOf(content, [], [5, 1]).length, 3, 'stale sizes fall back to one question block per slide');
});

test('phones never see answers', () => {
  const { content, key } = splitKey(full);
  const slides = slidesOf(content);
  const pub = JSON.stringify(slides.map((s) => publicSlide(s, slides.length)));
  assert.ok(!pub.includes('"correct":0'), 'no correct option');
  assert.ok(!pub.includes('walks'), 'no gap answers');
  assert.equal(publicSlide(slides[0], 3).kind, 'choice');
  assert.deepEqual(publicSlide(slides[0], 3).options, ['Apple', 'Chair', 'Bus']);
  assert.equal(publicSlide(slides[1], 3).kind, 'task');
  assert.equal(key.q1.correct, 0);
});

test('marking and points: right and fast earns most, alternatives count, wrong earns nothing', () => {
  const { content, key } = splitKey(full);
  const [s1, s2, s3] = slidesOf(content, [{}, {}, { poll: true }]);
  assert.equal(markSlide(key, s1, { q1: 0 }).frac, 1);
  assert.equal(markSlide(key, s1, { q1: 2 }).frac, 0);
  assert.equal(markSlide(key, s2, { q2: 'Walks' }).frac, 1, 'any accepted answer, any case');
  assert.equal(pointsFor(s1, 1, 0), 1000);
  assert.equal(pointsFor(s1, 1, 10000), 750);
  assert.equal(pointsFor(s1, 1, 999999), 500, 'right but slow still gets 500');
  assert.equal(pointsFor(s1, 0, 0), 0);
  assert.equal(pointsFor(s3, 1, 0), 0, 'polls earn no points');
  assert.equal(pointsFor({ ...s1, points: 2 }, 1, 0), 2000, 'double points');
  assert.equal(pointsFor({ ...s1, points: 0 }, 1, 0), 0, 'no points');
});

test('streaks, places and the reveal', () => {
  assert.deepEqual([1, 2, 3, 6, 9].map(streakBonus), [0, 100, 200, 500, 500]);
  const r = ranked({ a: { name: 'Ana', score: 900 }, b: { name: 'Ben', score: 1200 }, c: { name: 'Cal', score: 900 } });
  assert.deepEqual(r.map((x) => [x.id, x.place]), [['b', 1], ['a', 2], ['c', 2]]);
  const { content, key } = splitKey(full);
  const [s1] = slidesOf(content);
  const rev = revealFor(s1, key, [{ responses: { q1: 0 } }, { responses: { q1: 0 } }, { responses: { q1: 1 } }]);
  assert.deepEqual(rev.counts, [2, 1]);
  assert.deepEqual(rev.correct, [0]);
  assert.equal(rev.right, 2);
  assert.equal(rev.wrong, 1);
});

test('nicknames are tidy, unique and polite; answers are kept small', () => {
  assert.equal(cleanName('  Sam   the  great  ').name, 'Sam the great');
  assert.ok(cleanName('').error);
  assert.ok(cleanName('shithead').error);
  assert.equal(cleanName('Ana<script>').name, 'Anascript');
  assert.equal(uniqueName('Sam', ['sam', 'Sam 2']), 'Sam 3');
  assert.deepEqual(cleanResponses({ q1: 1, q9: 'x', q2: 'a'.repeat(900) }, ['q1', 'q2']), { q1: 1, q2: 'a'.repeat(500) });
});
