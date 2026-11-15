import assert from 'node:assert/strict';
import test from 'node:test';
import { collectSummaryBatch, digestCursor, eligibleMessages, mayHaveEligibleMessage } from '../notifications/digest-logic.js';

const fifteenMinutes = 15 * 60_000;
const recipient = 'learner';
const firstAt = 1_000_000;
const secondAt = firstAt + 10 * 60_000;
const thirdAt = firstAt + 20 * 60_000;

function compare(left, right) {
  return left.at - right.at || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

// Model the server's inclusive boundary and saved page position before handing
// pages to collectSummaryBatch. Firestore orders each page by at then document ID.
function query(messages, cursor, cutoff, scanAfter = null) {
  return messages.filter((message) => message.at <= cutoff
    && (cursor.ids ? message.at >= cursor.at : message.at > cursor.at)
    && (!scanAfter || compare(message, scanAfter) > 0)).sort(compare);
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

async function run(chat, messages, cutoff, reads = { pages: 0, maxPage: 0 }) {
  const cursor = digestCursor(chat, recipient);
  const scanAfter = chat.digestedPending?.learner ? chat.digestedScanAfter?.learner : null;
  return collectSummaryBatch(pagedSource(query(messages, cursor, cutoff, scanAfter), reads), cursor, cutoff, recipient);
}

function record(chat, batch) {
  if (batch.processed) {
    chat.digested = { learner: batch.marker.at };
    chat.digestedIds = { learner: batch.marker.ids };
  }
  chat.digestedPending = { learner: batch.more };
  chat.digestedScanAfter = { learner: batch.scanAfter };
}

test('continuous arrivals do not postpone older messages or repeat an emailed message', async () => {
  const chat = { last: { id: 'third', by: 'teacher' }, lastAt: thirdAt, seen: { learner: 0 } };
  const messages = [
    { id: 'first', at: firstAt, by: 'teacher' },
    { id: 'second', at: secondAt, by: 'teacher' },
    { id: 'third', at: thirdAt, by: 'teacher' },
  ];
  const cutoff = firstAt + 25 * 60_000 - fifteenMinutes;
  assert.equal(mayHaveEligibleMessage(chat, recipient, cutoff), true);
  const first = await run(chat, messages, cutoff);
  assert.deepEqual(first.preview.map((message) => message.id), ['first', 'second']);
  record(chat, first);
  const repeat = await run(chat, messages, cutoff);
  assert.equal(repeat.count, 0);
  const second = await run(chat, messages, thirdAt);
  assert.deepEqual(second.preview.map((message) => message.id), ['third']);
  record(chat, second);
  assert.equal(mayHaveEligibleMessage(chat, recipient, thirdAt), false);
});

test('a later same-millisecond message with a lower ID gets its own summary', async () => {
  const chat = { last: { id: 'z', by: 'teacher' }, lastAt: thirdAt, seen: { learner: 0 } };
  const z = { id: 'z', at: thirdAt, by: 'teacher' };
  const a = { id: 'a', at: thirdAt, by: 'teacher' };
  const first = await run(chat, [z], thirdAt);
  record(chat, first);
  assert.deepEqual(chat.digestedIds.learner, ['z']);
  chat.last.id = 'a';
  assert.equal(mayHaveEligibleMessage(chat, recipient, thirdAt), true);
  const second = await run(chat, [a, z], thirdAt);
  assert.deepEqual(second.preview.map((message) => message.id), ['a']);
  record(chat, second);
  assert.deepEqual(chat.digestedIds.learner, ['z', 'a']);
  assert.equal(mayHaveEligibleMessage(chat, recipient, thirdAt), false);
  assert.equal((await run(chat, [a, z], thirdAt)).count, 0);
});

test('read and too-young messages are excluded', () => {
  const chat = { last: { id: 'second', by: 'teacher' }, lastAt: secondAt, seen: { learner: firstAt } };
  assert.deepEqual(eligibleMessages([{ id: 'second', at: secondAt }], digestCursor(chat, recipient), secondAt - 1), []);
  chat.seen.learner = secondAt;
  assert.equal(mayHaveEligibleMessage(chat, recipient, secondAt), false);
});

test('own and deleted messages advance the cursor without appearing in email', async () => {
  const messages = [
    { id: 'own', at: firstAt, by: recipient },
    { id: 'deleted', at: secondAt, by: 'teacher', deleted: true },
  ];
  const batch = await collectSummaryBatch(pagedSource(messages, { pages: 0, maxPage: 0 }),
    { at: 0, ids: null }, secondAt, recipient);
  assert.equal(batch.processed, true);
  assert.equal(batch.count, 0);
  assert.deepEqual(batch.marker, { at: secondAt, ids: ['deleted'] });
});

test('more than five messages are counted while the email keeps five previews', async () => {
  const messages = Array.from({ length: 7 }, (_, index) => ({ id: `m${index + 1}`, at: thirdAt + index, by: 'teacher' }));
  const batch = await collectSummaryBatch(pagedSource(messages, { pages: 0, maxPage: 0 }), { at: 0, ids: null }, thirdAt + 6, recipient);
  assert.equal(batch.count, 7);
  assert.deepEqual(batch.preview.map((message) => message.id), ['m3', 'm4', 'm5', 'm6', 'm7']);
  assert.deepEqual(batch.marker, { at: thirdAt + 6, ids: ['m7'] });
});

test('620 unread messages use bounded pages and continue on the next run', async () => {
  const messages = Array.from({ length: 620 }, (_, index) => ({ id: `m${String(index).padStart(4, '0')}`, at: thirdAt + index, by: 'teacher' }));
  const chat = { last: { id: messages.at(-1).id, by: 'teacher' }, lastAt: messages.at(-1).at, seen: { learner: 0 } };
  const reads = { pages: 0, maxPage: 0 };
  const first = await run(chat, messages, chat.lastAt, reads);
  assert.equal(first.count, 500);
  assert.deepEqual(first.scanAfter, { at: messages[499].at, id: messages[499].id });
  assert.equal(first.more, true);
  assert.equal(reads.pages, 5);
  record(chat, first);
  const second = await run(chat, messages, chat.lastAt, reads);
  assert.equal(second.count, 120);
  assert.deepEqual(second.marker, { at: messages.at(-1).at, ids: [messages.at(-1).id] });
  assert.equal(second.more, false);
  record(chat, second);
  assert.equal(mayHaveEligibleMessage(chat, recipient, chat.lastAt), false);
  assert.equal(reads.maxPage, 100);
});

test('620 equal-timestamp messages continue across the bounded page position', async () => {
  const messages = Array.from({ length: 620 }, (_, index) => ({ id: `m${String(index).padStart(4, '0')}`, at: thirdAt, by: 'teacher' }));
  const chat = { last: { id: 'm0300', by: 'teacher' }, lastAt: thirdAt, seen: { learner: 0 } };
  const reads = { pages: 0, maxPage: 0 };
  const first = await run(chat, messages, thirdAt, reads);
  assert.equal(first.count, 500);
  assert.equal(first.marker.ids.length, 500);
  assert.equal(first.more, true);
  record(chat, first);
  assert.equal(mayHaveEligibleMessage(chat, recipient, thirdAt), true);
  const second = await run(chat, messages, thirdAt, reads);
  assert.equal(second.count, 120);
  assert.equal(second.marker.ids.length, 620);
  assert.equal(second.more, false);
  record(chat, second);
  assert.equal(mayHaveEligibleMessage(chat, recipient, thirdAt), false);
  assert.equal(reads.maxPage, 100);
});

test('a lower-ID message arriving during backlog is found after the backlog clears', async () => {
  const messages = Array.from({ length: 620 }, (_, index) => ({ id: `m${String(index).padStart(4, '0')}`, at: thirdAt, by: 'teacher' }));
  const chat = { last: { id: 'm0300', by: 'teacher' }, lastAt: thirdAt, seen: { learner: 0 } };
  const first = await run(chat, messages, thirdAt);
  record(chat, first);
  const newMessage = { id: 'm0000a', at: thirdAt, by: 'teacher' };
  messages.push(newMessage);
  chat.last.id = newMessage.id;
  const second = await run(chat, messages, thirdAt);
  assert.equal(second.count, 120);
  record(chat, second);
  assert.equal(mayHaveEligibleMessage(chat, recipient, thirdAt), true);
  const third = await run(chat, messages, thirdAt);
  assert.deepEqual(third.preview.map((message) => message.id), [newMessage.id]);
  record(chat, third);
  const cleanup = await run(chat, messages, thirdAt);
  assert.equal(cleanup.processed, false);
  record(chat, cleanup);
  assert.equal(mayHaveEligibleMessage(chat, recipient, thirdAt), false);
});

test('an exactly full final page clears its optimistic backlog flag without resending', async () => {
  const messages = Array.from({ length: 500 }, (_, index) => ({ id: `m${String(index).padStart(4, '0')}`, at: thirdAt + index, by: 'teacher' }));
  const chat = { last: { id: messages.at(-1).id, by: 'teacher' }, lastAt: messages.at(-1).at, seen: { learner: 0 } };
  const first = await run(chat, messages, chat.lastAt);
  assert.equal(first.count, 500);
  assert.equal(first.more, true);
  record(chat, first);
  const next = await run(chat, messages, chat.lastAt);
  assert.equal(next.processed, false);
  assert.equal(next.more, false);
  record(chat, next);
  assert.equal(mayHaveEligibleMessage(chat, recipient, chat.lastAt), false);
});
