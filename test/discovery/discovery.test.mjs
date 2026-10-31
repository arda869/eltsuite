import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Exercise the exact catalog/engine shipped to the browser, on Node 22 as well as 24.
const source = ts.transpileModule(readFileSync('src/discovery/catalog.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { defaults, completed, recommendations, canDeliver, quiet, usageLabel, DAY, FEATURES } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const now = Date.UTC(2026, 9, 31, 12), allowed = FEATURES.map(f => f.id);
const optedIn = () => { const s = defaults(); s.settings.tracking = true; s.settings.enabled = true; return s; };
test('collection and proactive messages are off until explicitly enabled', () => {
  const s = defaults(); assert.equal(completed(s, 'lessons', 'one', now), s); assert.equal(canDeliver(s, now, 12), false);
});
test('successful unique workflows count once; autosaves and retries do not inflate adoption', () => {
  let s = completed(optedIn(), 'lessons', 'one', now);
  assert.equal(s.usage.lessons.count, 1); assert.equal(usageLabel(s.usage.lessons), 'Tried once');
  assert.equal(completed(s, 'lessons', 'one', now + 1), s);
  s = completed(s, 'lessons', 'two', now + 1); s = completed(s, 'lessons', 'three', now + 2);
  assert.equal(usageLabel(s.usage.lessons), 'Used regularly'); assert.equal(s.usage.lessons.lastUsed, Math.floor(now / DAY) * DAY);
});
test('recommendations exclude used, denied, nonexistent, snoozed and dismissed features', () => {
  let s = completed(optedIn(), 'lessons', 'one', now);
  s.feedback.notes = { dismissed: true }; s.feedback.live = { snoozedUntil: now + DAY };
  const ids = recommendations(s, ['lessons', 'notes', 'live', 'assessment', 'future'], '/class/demo', '', now).map(x => x.feature.id);
  assert.deepEqual(ids, ['assessment']);
  assert(recommendations(s, ['live'], '/', '', now + DAY).some(x => x.feature.id === 'live'));
});
test('goal and successful adjacent workflows influence ranking without reading teaching content', () => {
  assert.equal(recommendations(optedIn(), allowed, '/', 'study', now)[0].feature.id, 'reading');
  const s = completed(optedIn(), 'lessons', 'one', now);
  assert.equal(recommendations(s, allowed, '/class/demo', '', now)[0].score > recommendations(s, allowed, '/', '', now)[0].score, true);
});
test('rolling frequency limit, pause and unread delivery prevent repeat nudges', () => {
  const s = optedIn(); assert(canDeliver(s, now, 12));
  s.delivery = { feature: 'notes', at: now, read: false };
  assert.equal(canDeliver(s, now + 30 * DAY, 12), false);
  s.delivery.read = true; assert.equal(canDeliver(s, now + DAY, 12), false); assert(canDeliver(s, now + 7 * DAY, 12));
  s.settings.pausedUntil = now + 20 * DAY; assert.equal(canDeliver(s, now + 8 * DAY, 12), false);
  s.settings.pausedUntil = 0; s.settings.enabled = false; assert.equal(canDeliver(s, now + 8 * DAY, 12), false);
});
test('quiet windows work overnight, same-day and with the off setting', () => {
  const s = defaults().settings; for (const h of [0, 7, 20, 23]) assert(quiet(s, h));
  for (const h of [8, 12, 19]) assert.equal(quiet(s, h), false);
  s.quietStart = 10; s.quietEnd = 15; assert(quiet(s, 12)); assert.equal(quiet(s, 16), false);
  s.quietEnd = 10; assert.equal(quiet(s, 10), false);
});
test('opening or reading a guide does not activate a feature; completion links adoption', () => {
  const s = optedIn(); s.feedback.notes = { openedAt: now, guideStarted: true }; s.delivery = { feature: 'notes', at: now, read: false };
  assert.equal(s.usage.notes, undefined);
  const done = completed(s, 'notes', 'saved-note', now); assert(done.usage.notes.guided); assert(done.delivery.read);
});
test('history and usage remain bounded', () => {
  let s = optedIn(); for (let i = 0; i < 100; i++) s = completed(s, 'notes', String(i), now);
  assert.equal(s.usage.notes.events.length, 80); assert.equal(s.usage.notes.count, 100);
});
