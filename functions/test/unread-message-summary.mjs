import assert from 'node:assert/strict';
import test from 'node:test';
import { collectSummaryBatch, digestCursor, eligibleMessages, mayHaveEligibleMessage, nextDigestMarker } from '../notifications/digest-logic.js';

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

test('long unread histories use bounded pages and continue from the last emailed message', async () => {
  const messages = Array.from({ length: 620 }, (_, index) => ({ id: `m${String(index).padStart(4, '0')}`, at: thirdAt + index, by: 'teacher' }));
  const chat = { last: { id: messages.at(-1).id, by: 'teacher' }, lastAt: messages.at(-1).at, seen: { learner: 0 } };
  const reads = { pages: 0, maxPage: 0 };
  const cutoff = chat.lastAt;
  const initial = { at: 0, ids: [] };
  const first = await collectSummaryBatch(pagedSource(messages, reads), digestCursor(chat, recipient), cutoff, initial, recipient);
  assert.equal(first.count, 500);
  assert.deepEqual(first.preview.map((message) => message.id), messages.slice(495, 500).map((message) => message.id));
  assert.equal(first.marker.at, messages[499].at);
  assert.equal(reads.pages, 5);
  assert.equal(reads.maxPage, 100);

  chat.digested = { learner: first.marker.at };
  chat.digestedIds = { learner: first.marker.ids };
  const second = await collectSummaryBatch(pagedSource(messages.filter((message) => message.at >= first.marker.at), reads),
    digestCursor(chat, recipient), cutoff, first.marker, recipient);
  assert.equal(second.count, 120);
  assert.equal(second.marker.at, messages.at(-1).at);
  chat.digested.learner = second.marker.at;
  chat.digestedIds.learner = second.marker.ids;
  assert.equal(mayHaveEligibleMessage(chat, recipient, cutoff), false);
  assert.equal(reads.maxPage, 100);
});

test('pagination preserves all IDs when the timestamp is the same across pages', async () => {
  const messages = Array.from({ length: 105 }, (_, index) => ({ id: `m${String(index).padStart(3, '0')}`, at: thirdAt, by: 'teacher' }));
  const chat = { last: { id: messages.at(-1).id, by: 'teacher' }, lastAt: thirdAt, seen: { learner: 0 } };
  const reads = { pages: 0, maxPage: 0 };
  const first = await collectSummaryBatch(pagedSource(messages, reads), digestCursor(chat, recipient), thirdAt, { at: 0, ids: [] }, recipient);
  assert.equal(first.count, 105);
  assert.equal(first.marker.ids.length, 105);
  chat.digested = { learner: thirdAt };
  chat.digestedIds = { learner: first.marker.ids };
  chat.last.id = 'm050b';
  const withNew = [...messages, { id: 'm050b', at: thirdAt, by: 'teacher' }].sort((a, b) => a.id.localeCompare(b.id));
  const second = await collectSummaryBatch(pagedSource(withNew, reads), digestCursor(chat, recipient), thirdAt, first.marker, recipient);
  assert.equal(second.count, 1);
  assert.deepEqual(second.preview.map((message) => message.id), ['m050b']);
  assert.equal(second.marker.ids.length, 106);
  assert.equal(reads.maxPage, 100);
});
