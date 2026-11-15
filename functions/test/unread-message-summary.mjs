import assert from 'node:assert/strict';
import test from 'node:test';
import { newUnreadSince, shouldSummarize } from '../notifications/digest-logic.js';

const fifteenMinutes = 15 * 60_000;
const recipient = 'learner';
const firstAt = 1_000_000;
const secondAt = firstAt + 20 * 60_000;

test('a new unread message is summarized without repeating an older emailed message', () => {
  const chat = { last: { by: 'teacher' }, lastAt: secondAt, seen: { learner: 0 }, digested: { learner: firstAt } };
  assert.equal(shouldSummarize(chat, recipient, secondAt + fifteenMinutes, fifteenMinutes), true);
  const included = [{ at: firstAt, text: 'Already emailed' }, { at: secondAt, text: 'New message' }]
    .filter((message) => message.at > newUnreadSince(chat, recipient));
  assert.deepEqual(included.map((message) => message.text), ['New message']);
  chat.digested.learner = secondAt;
  assert.equal(shouldSummarize(chat, recipient, secondAt + 2 * fifteenMinutes, fifteenMinutes), false);
});

test('a summary waits 15 minutes and excludes read or own messages', () => {
  const chat = { last: { by: 'teacher' }, lastAt: secondAt, seen: { learner: firstAt } };
  assert.equal(shouldSummarize(chat, recipient, secondAt + fifteenMinutes - 1, fifteenMinutes), false);
  assert.equal(shouldSummarize(chat, recipient, secondAt + fifteenMinutes, fifteenMinutes), true);
  chat.seen.learner = secondAt;
  assert.equal(shouldSummarize(chat, recipient, secondAt + fifteenMinutes, fifteenMinutes), false);
  chat.seen.learner = firstAt;
  chat.last.by = recipient;
  assert.equal(shouldSummarize(chat, recipient, secondAt + fifteenMinutes, fifteenMinutes), false);
});
