import test from 'node:test';
import assert from 'node:assert/strict';
import { freshReply, postEmailReply, replyMessageId, replySenderMatches, replyToken } from '../scripts/mail-replies.mjs';

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

test('reprocessing after an IMAP flag failure does not duplicate the chat message', async () => {
  const records = new Map();
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
  records.set('chats/dm_l_t', { ...records.get('chats/dm_l_t'), classId: 'other' });
  await assert.rejects(postEmailReply(db, thread, 'New reply', replyMessageId(token, { ...parsed, messageId: '<reply-2@example.com>' }, 11, 1)), /no longer matches/);
});
