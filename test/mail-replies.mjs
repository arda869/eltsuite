import test from 'node:test';
import assert from 'node:assert/strict';
import { freshReply, handleIncomingReply, postEmailReply, processReplyMailbox, replyMessageId, replySenderMatches, replyToken } from '../scripts/mail-replies.mjs';

const token = 'a1b2c3d4e5f6';
const parsed = {
  to: { text: `ELT Suite <reply+${token}@eltsuite.com>` },
  subject: `Holiday plans [#${token}]`,
  from: { value: [{ address: 'Learner@example.com' }] },
  messageId: '<reply-1@example.com>',
  text: 'Tuesday works for me.\n\nOn Monday, Teacher wrote:\n> Can we meet?',
  headers: new Map(),
};
const learner = { role: 'learner', learnerId: 'l', classId: 'c', contactEmail: 'learner@example.com' };

test('accepts one matching learner reply and removes quoted mail', () => {
  assert.equal(replyToken(parsed), token);
  assert.equal(replySenderMatches(parsed, learner), true);
  assert.equal(freshReply(parsed.text), 'Tuesday works for me.');
  assert.equal(replyMessageId(token, parsed, 10, 1), replyMessageId(token, parsed, 11, 1));
});

test('rejects a forwarded or conflicting thread and a different sender', () => {
  assert.equal(replyToken({ ...parsed, subject: 'Holiday plans [#000000000000]' }), null);
  assert.equal(replySenderMatches({ ...parsed, from: { value: [{ address: 'other@example.com' }] } }, learner), false);
  assert.equal(replySenderMatches({ ...parsed, sender: { value: [{ address: 'other@example.com' }] } }, learner), false);
  assert.equal(replySenderMatches(parsed, { ...learner, contactEmail: '' }), false);
  assert.equal(replySenderMatches(parsed, { ...learner, role: 'teacher' }), false);
});

test('permanently invalid mail is marked seen, but a temporary database failure remains unread', async () => {
  let seen = 0, posted = 0;
  const route = overrides => handleIncomingReply({
    message: parsed, uid: 10, uidValidity: 1,
    getThread: async () => ({ teacher: 't', learnerId: 'l', learnerUid: 'u', classId: 'c' }),
    getLearner: async () => learner,
    getClass: async () => ({ teacherId: 't', status: 'active' }),
    post: async () => { posted++; return true; },
    markSeen: async () => { seen++; },
    ...overrides,
  });
  assert.equal(await route({ message: { ...parsed, subject: 'Unrelated', to: { text: 'reply@eltsuite.com' } } }), 'ignored');
  assert.equal(await route({ getThread: async () => null }), 'ignored');
  assert.equal(await route({ getLearner: async () => ({ ...learner, contactEmail: 'changed@example.com' }) }), 'ignored');
  assert.equal(seen, 3);
  assert.equal(posted, 0);
  await assert.rejects(route({ getThread: async () => { throw Error('Firestore unavailable'); } }), /Firestore unavailable/);
  await assert.rejects(route({ getClass: async () => { throw Error('Class read unavailable'); } }), /Class read unavailable/);
  await assert.rejects(route({ post: async () => { throw Error('Write unavailable'); } }), /Write unavailable/);
  assert.equal(seen, 3);
  assert.equal(await route({}), 'posted');
  assert.equal(seen, 4);
  assert.equal(posted, 1);
});

test('mailbox reader finishes each bounded fetch before marking messages seen', async () => {
  const fetched = [], flagged = [], posted = [];
  let fetchInProgress = false;
  const client = {
    mailbox: { uidValidity: 1 },
    search: async (query, options) => {
      assert.deepEqual(query, { seen: false });
      assert.deepEqual(options, { uid: true });
      return [10, 11, 12];
    },
    fetch: () => { throw Error('Streaming fetch would deadlock when marking a message seen.'); },
    fetchAll: async (uids, query, options) => {
      assert.equal(fetchInProgress, false);
      fetchInProgress = true;
      fetched.push(uids);
      assert.deepEqual(query, { source: true, uid: true });
      assert.deepEqual(options, { uid: true });
      await Promise.resolve();
      fetchInProgress = false;
      return uids.map(uid => ({ uid, source: Buffer.from(String(uid)) }));
    },
    messageFlagsAdd: async (uid, flags, options) => {
      assert.equal(fetchInProgress, false, 'flagging inside a fetch would deadlock ImapFlow');
      assert.deepEqual(flags, ['\\Seen']);
      assert.deepEqual(options, { uid: true });
      flagged.push(uid);
      return true;
    },
  };
  const result = await processReplyMailbox({
    client, parse: async source => ({ ...parsed, messageId: `<reply-${source.toString()}@example.com>` }),
    getThread: async () => ({ teacher: 't', learnerId: 'l', learnerUid: 'u', classId: 'c' }),
    getLearner: async () => learner,
    getClass: async () => ({ teacherId: 't', status: 'active' }),
    post: async (_thread, _text, id) => { posted.push(id); return true; },
    limit: 3, batchSize: 2,
  });
  assert.deepEqual(fetched, [[10, 11], [12]]);
  assert.deepEqual(flagged, [10, 11, 12]);
  assert.equal(new Set(posted).size, 3);
  assert.deepEqual(result, { processed: 3, delivered: 3 });
});

test('failed IMAP flagging is retried without losing the posted reply', async () => {
  let postCount = 0;
  const client = {
    mailbox: { uidValidity: 1 },
    search: async () => [10],
    fetchAll: async () => [{ uid: 10, source: Buffer.from('reply') }],
    messageFlagsAdd: async () => false,
  };
  await assert.rejects(processReplyMailbox({
    client, parse: async () => parsed,
    getThread: async () => ({ teacher: 't', learnerId: 'l', learnerUid: 'u', classId: 'c' }),
    getLearner: async () => learner,
    getClass: async () => ({ teacherId: 't', status: 'active' }),
    post: async () => { postCount++; return true; },
  }), /mark a reply as read/);
  assert.equal(postCount, 1);
});

test('a removed teacher cannot receive an old email thread even when teacherIds is stale', async () => {
  let seen = 0, posted = 0;
  const route = cls => handleIncomingReply({
    message: parsed, uid: 10, uidValidity: 1,
    getThread: async () => ({ teacher: 't', learnerId: 'l', learnerUid: 'u', classId: 'c' }),
    getLearner: async () => learner,
    getClass: async () => cls,
    post: async () => { posted++; return true; },
    markSeen: async () => { seen++; },
  });
  for (const cls of [null, { teacherId: 'other', teacherIds: ['t'], coTeachers: {} },
    { teacherId: 'other', teacherIds: ['t'], coTeachers: { t: { role: 'viewer' } } },
    { teacherId: 't', status: 'deleted' }]) assert.equal(await route(cls), 'ignored');
  assert.equal(seen, 4);
  assert.equal(posted, 0);
  assert.equal(await route({ teacherId: 'other', coTeachers: { t: { role: 'co' } } }), 'posted');
  assert.equal(posted, 1);
});

test('reprocessing after an IMAP flag failure does not duplicate the chat message', async () => {
  const records = new Map([['classes/c', { teacherId: 't', status: 'active' }]]);
  const ref = path => ({ id: path.split('/').at(-1), path, collection: name => ({ doc: id => ref(path + '/' + name + '/' + id) }) });
  const db = {
    collection: name => ({ doc: id => ref(name + '/' + id) }),
    runTransaction: async fn => {
      const writes = [];
      const tx = {
        get: async target => ({ exists: records.has(target.path), get: key => records.get(target.path)?.[key] }),
        set: (target, value, options) => writes.push({ target, value, options }),
      };
      const result = await fn(tx);
      for (const { target, value, options } of writes) records.set(target.path, options?.merge ? { ...records.get(target.path), ...value } : value);
      return result;
    },
  };
  const thread = { teacher: 't', teacherName: 'Teacher', learnerId: 'l', learnerName: 'Learner', classId: 'c' };
  const id = replyMessageId(token, parsed, 10, 1);
  assert.equal(await postEmailReply(db, thread, 'Tuesday works for me.', id, 100), true);
  assert.equal(await postEmailReply(db, thread, 'Tuesday works for me.', id, 101), false);
  assert.equal([...records.keys()].filter(path => path.includes('/msgs/')).length, 1);
  assert.equal(records.get('chats/dm_l_t').last.id, id);
  records.set('classes/c', { teacherId: 'other', teacherIds: ['t'], coTeachers: {} });
  assert.equal(await postEmailReply(db, thread, 'New reply', replyMessageId(token, { ...parsed, messageId: '<reply-2@example.com>' }, 11, 1)), false);
  records.set('classes/c', { teacherId: 't', status: 'active' });
  records.set('chats/dm_l_t', { ...records.get('chats/dm_l_t'), classId: 'other' });
  await assert.rejects(postEmailReply(db, thread, 'New reply', replyMessageId(token, { ...parsed, messageId: '<reply-2@example.com>' }, 11, 1)), /no longer matches/);
});
