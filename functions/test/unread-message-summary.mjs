import assert from 'node:assert/strict';
import test from 'node:test';
import { collectSummaryBatch, digestCursor, eligibleMessages, mayHaveEligibleMessage } from '../notifications/digest-logic.js';

const fifteenMinutes = 15 * 60_000;
const recipient = 'learner';
const firstAt = 1_000_000;
const secondAt = firstAt + 10 * 60_000;
const thirdAt = firstAt + 20 * 60_000;

function after(messages, cursor, cutoff) {
  return messages.filter((message) => message.at <= cutoff
    && (message.at > cursor.at || (message.at === cursor.at && cursor.id && message.id > cursor.id)));
}

function pagedSource(messages, reads, start = 0, size = Infinity) {
  const docs = messages.map((message) => ({ id: message.id, data: () => message }));
  return {
    startAfter(last) { return pagedSource(messages, reads, docs.findIndex((document) => document.id === last.id) + 1, size); },
    limit(n) { return pagedSource(messages, reads, start, n); },
    async get() {
      const page = docs.slice(start, start + size);
      reads.pages += 1;
      reads.maxPage = Math.max(reads.maxPage, page.length);
      return { docs: page };
    },
  };
}

function record(chat, marker, more = false) {
  chat.digested = { learner: marker.at };
  chat.digestedId = { learner: marker.id };
  chat.digestedPending = { learner: more };
}

test('continuous arrivals do not postpone an older unread message or mail a new one early', async () => {
  const chat = { last: { id: 'third', by: 'teacher' }, lastAt: thirdAt, seen: { learner: 0 } };
  const messages = [
    { id: 'first', at: firstAt, by: 'teacher' },
    { id: 'second', at: secondAt, by: 'teacher' },
    { id: 'third', at: thirdAt, by: 'teacher' },
  ];
  const cutoff = firstAt + 25 * 60_000 - fifteenMinutes;
  assert.equal(mayHaveEligibleMessage(chat, recipient, cutoff), true);
  const reads = { pages: 0, maxPage: 0 };
  const first = await collectSummaryBatch(pagedSource(after(messages, digestCursor(chat, recipient), cutoff), reads),
    digestCursor(chat, recipient), cutoff, recipient);
  assert.deepEqual(first.preview.map((message) => message.id), ['first', 'second']);
  record(chat, first.marker);
  const second = await collectSummaryBatch(pagedSource(after(messages, digestCursor(chat, recipient), thirdAt), reads),
    digestCursor(chat, recipient), thirdAt, recipient);
  assert.deepEqual(second.preview.map((message) => message.id), ['third']);
  record(chat, second.marker);
  assert.equal(mayHaveEligibleMessage(chat, recipient, thirdAt), false);
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

test('more than five messages are counted while the email keeps five previews', async () => {
  const messages = Array.from({ length: 7 }, (_, index) => ({ id: `m${index + 1}`, at: thirdAt + index, by: 'teacher' }));
  const reads = { pages: 0, maxPage: 0 };
  const batch = await collectSummaryBatch(pagedSource(messages, reads), { at: 0, id: null }, thirdAt + 6, recipient);
  assert.equal(batch.count, 7);
  assert.deepEqual(batch.preview.map((message) => message.id), ['m3', 'm4', 'm5', 'm6', 'm7']);
  assert.deepEqual(batch.marker, { at: thirdAt + 6, id: 'm7' });
});

test('long unread histories use bounded pages and continue on the next scheduled run', async () => {
  const messages = Array.from({ length: 620 }, (_, index) => ({ id: `m${String(index).padStart(4, '0')}`, at: thirdAt + index, by: 'teacher' }));
  const chat = { last: { id: messages.at(-1).id, by: 'teacher' }, lastAt: messages.at(-1).at, seen: { learner: 0 } };
  const reads = { pages: 0, maxPage: 0 };
  const first = await collectSummaryBatch(pagedSource(messages, reads), digestCursor(chat, recipient), chat.lastAt, recipient);
  assert.equal(first.count, 500);
  assert.equal(first.marker.id, messages[499].id);
  assert.equal(first.more, true);
  assert.equal(reads.pages, 5);
  assert.equal(reads.maxPage, 100);
  record(chat, first.marker, first.more);
  const second = await collectSummaryBatch(pagedSource(after(messages, digestCursor(chat, recipient), chat.lastAt), reads),
    digestCursor(chat, recipient), chat.lastAt, recipient);
  assert.equal(second.count, 120);
  assert.equal(second.marker.id, messages.at(-1).id);
  assert.equal(second.more, false);
  record(chat, second.marker, second.more);
  assert.equal(mayHaveEligibleMessage(chat, recipient, chat.lastAt), false);
  assert.equal(reads.maxPage, 100);
});

test('same-timestamp messages continue across the 500-document boundary', async () => {
  const messages = Array.from({ length: 620 }, (_, index) => ({ id: `m${String(index).padStart(4, '0')}`, at: thirdAt, by: 'teacher' }));
  const chat = { last: { id: 'm0300', by: 'teacher' }, lastAt: thirdAt, seen: { learner: 0 } };
  const reads = { pages: 0, maxPage: 0 };
  const first = await collectSummaryBatch(pagedSource(messages, reads), digestCursor(chat, recipient), thirdAt, recipient);
  assert.equal(first.count, 500);
  assert.deepEqual(first.marker, { at: thirdAt, id: 'm0499' });
  assert.equal(first.more, true);
  record(chat, first.marker, first.more);
  assert.equal(mayHaveEligibleMessage(chat, recipient, thirdAt), true);
  const second = await collectSummaryBatch(pagedSource(after(messages, digestCursor(chat, recipient), thirdAt), reads),
    digestCursor(chat, recipient), thirdAt, recipient);
  assert.equal(second.count, 120);
  assert.deepEqual(second.marker, { at: thirdAt, id: 'm0619' });
  assert.equal(second.more, false);
  record(chat, second.marker, second.more);
  assert.equal(mayHaveEligibleMessage(chat, recipient, thirdAt), false);
  assert.equal(reads.maxPage, 100);
});

test('an exactly full final page clears its optimistic backlog flag on the next run', async () => {
  const messages = Array.from({ length: 500 }, (_, index) => ({ id: `m${String(index).padStart(4, '0')}`, at: thirdAt + index, by: 'teacher' }));
  const chat = { last: { id: messages.at(-1).id, by: 'teacher' }, lastAt: messages.at(-1).at, seen: { learner: 0 } };
  const reads = { pages: 0, maxPage: 0 };
  const first = await collectSummaryBatch(pagedSource(messages, reads), digestCursor(chat, recipient), chat.lastAt, recipient);
  assert.equal(first.count, 500);
  assert.equal(first.more, true);
  record(chat, first.marker, first.more);
  assert.equal(mayHaveEligibleMessage(chat, recipient, chat.lastAt), true);
  const next = await collectSummaryBatch(pagedSource([], reads), digestCursor(chat, recipient), chat.lastAt, recipient);
  assert.equal(next.processed, false);
  assert.equal(next.more, false);
  record(chat, first.marker, next.more);
  assert.equal(mayHaveEligibleMessage(chat, recipient, chat.lastAt), false);
});
