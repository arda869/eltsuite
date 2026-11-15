import assert from 'node:assert/strict';
import test from 'node:test';
import { digestCursor, eligibleMessages, mayHaveEligibleMessage, nextDigestMarker } from '../notifications/digest-logic.js';

const fifteenMinutes = 15 * 60_000;
const recipient = 'learner';
const firstAt = 1_000_000;
const secondAt = firstAt + 10 * 60_000;
const thirdAt = firstAt + 20 * 60_000;

test('continuous arrivals do not postpone an older unread message or mail a new one early', () => {
  const chat = { last: { id: 'third', by: 'teacher' }, lastAt: thirdAt, seen: { learner: 0 } };
  const messages = [
    { id: 'first', at: firstAt, by: 'teacher' },
    { id: 'second', at: secondAt, by: 'teacher' },
    { id: 'third', at: thirdAt, by: 'teacher' },
  ];
  const cutoff = firstAt + 25 * 60_000 - fifteenMinutes;
  assert.equal(mayHaveEligibleMessage(chat, recipient, cutoff), true);
  const firstBatch = eligibleMessages(messages, digestCursor(chat, recipient), cutoff);
  assert.deepEqual(firstBatch.map((message) => message.id), ['first', 'second']);
  const marker = nextDigestMarker(chat, recipient, firstBatch);
  chat.digested = { learner: marker.at };
  chat.digestedIds = { learner: marker.ids };
  const secondBatch = eligibleMessages(messages, digestCursor(chat, recipient), thirdAt);
  assert.deepEqual(secondBatch.map((message) => message.id), ['third']);
  const next = nextDigestMarker(chat, recipient, secondBatch);
  chat.digested.learner = next.at;
  chat.digestedIds.learner = next.ids;
  assert.equal(mayHaveEligibleMessage(chat, recipient, thirdAt), false);
});

test('two messages with one timestamp remain distinct even when the later ID sorts first', () => {
  const chat = { last: { id: 'z', by: 'teacher' }, lastAt: firstAt, seen: { learner: 0 } };
  const firstBatch = eligibleMessages([{ id: 'a', at: firstAt }, { id: 'z', at: firstAt }], digestCursor(chat, recipient), firstAt);
  const marker = nextDigestMarker(chat, recipient, firstBatch);
  chat.digested = { learner: marker.at };
  chat.digestedIds = { learner: marker.ids };
  chat.last.id = 'b';
  assert.equal(mayHaveEligibleMessage(chat, recipient, firstAt), true);
  const secondBatch = eligibleMessages([{ id: 'a', at: firstAt }, { id: 'b', at: firstAt }, { id: 'z', at: firstAt }], digestCursor(chat, recipient), firstAt);
  assert.deepEqual(secondBatch.map((message) => message.id), ['b']);
  const next = nextDigestMarker(chat, recipient, secondBatch);
  chat.digestedIds.learner = next.ids;
  assert.equal(mayHaveEligibleMessage(chat, recipient, firstAt), false);
});

test('read messages, own messages and messages younger than the selected delay wait', () => {
  const chat = { last: { id: 'second', by: 'teacher' }, lastAt: secondAt, seen: { learner: firstAt } };
  assert.equal(mayHaveEligibleMessage(chat, recipient, secondAt - 1), true);
  assert.deepEqual(eligibleMessages([{ id: 'second', at: secondAt }], digestCursor(chat, recipient), secondAt - 1), []);
  chat.seen.learner = secondAt;
  assert.equal(mayHaveEligibleMessage(chat, recipient, secondAt), false);
  chat.seen.learner = firstAt;
  chat.last.by = recipient;
  assert.equal(mayHaveEligibleMessage(chat, recipient, secondAt), false);
});

test('a batch of more than five eligible messages advances through all of them', () => {
  const chat = { last: { id: 'm7', by: 'teacher' }, lastAt: thirdAt, seen: { learner: 0 } };
  const messages = Array.from({ length: 7 }, (_, index) => ({ id: `m${index + 1}`, at: thirdAt, by: 'teacher' }));
  const eligible = eligibleMessages(messages, digestCursor(chat, recipient), thirdAt);
  assert.equal(eligible.length, 7);
  const marker = nextDigestMarker(chat, recipient, eligible);
  assert.equal(marker.ids.length, 7);
  chat.digested = { learner: marker.at };
  chat.digestedIds = { learner: marker.ids };
  assert.equal(mayHaveEligibleMessage(chat, recipient, thirdAt), false);
});
