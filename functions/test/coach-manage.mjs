import test from 'node:test';
import assert from 'node:assert/strict';
import { createManageCoachConversationHandler, manageCoachConversationRequest } from '../ai/coach-manage.js';

function fixture(activeRequest = '') {
  const changed = [];
  const db = {
    doc(path) {
      return {
        path,
        async get() {
          if (path.startsWith('users/')) return { data: () => ({ role: 'teacher' }) };
          if (path.startsWith('accounts/')) return { data: () => ({ suspended: false }) };
          return { exists: true, get: (key) => key === 'activeRequest' ? activeRequest : Date.now() };
        },
        async update(value) { changed.push({ path, value }); },
      };
    },
    async recursiveDelete(ref) { changed.push({ deleted: ref.path }); },
  };
  return { db, changed };
}

const auth = { uid: 'teacher-one', token: { email: 'teacher@example.com' } };

test('Firebase callable response argument is not used as Firestore', async () => {
  const { db, changed } = fixture();
  const handler = createManageCoachConversationHandler(() => db);
  await handler({ auth, data: { action: 'rename', conversationId: 'chat-one', title: 'History check' } }, { send() {} });
  assert.equal(changed[0].value.title, 'History check');
});

test('a teacher can rename only their own saved conversation', async () => {
  const { db, changed } = fixture();
  await manageCoachConversationRequest({ auth, data: { action: 'rename', conversationId: 'chat-one', title: '  New title  ' } }, db);
  assert.equal(changed[0].path, 'teachingCoach/teacher-one/conversations/chat-one');
  assert.equal(changed[0].value.title, 'New title');
  await assert.rejects(manageCoachConversationRequest({ auth: { ...auth, token: { ...auth.token, proxyBy: 'admin' } }, data: { action: 'rename', conversationId: 'chat-one', title: 'Other' } }, db), { code: 'unauthenticated' });
  await assert.rejects(manageCoachConversationRequest({ auth, data: { action: 'rename', conversationId: '../other', title: 'Other' } }, db), { code: 'invalid-argument' });
});

test('deletion removes turns and refuses an active reply', async () => {
  const active = fixture('request-one');
  await assert.rejects(manageCoachConversationRequest({ auth, data: { action: 'delete', conversationId: 'chat-one' } }, active.db), { code: 'failed-precondition' });
  assert.equal(active.changed.length, 0);
  const idle = fixture();
  await manageCoachConversationRequest({ auth, data: { action: 'delete', conversationId: 'chat-one' } }, idle.db);
  assert.deepEqual(idle.changed, [{ deleted: 'teachingCoach/teacher-one/conversations/chat-one' }]);
});
