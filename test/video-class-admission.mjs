import assert from 'node:assert/strict';
import { test } from 'node:test';
import { issueClassVideoToken } from '../functions/video/class-admission.js';

function fixture(role = 'learner', member = true) {
  const reads = [];
  const docs = {
    'users/learner-one': { role, displayName: 'Mia' },
    'classes/class-one': { status: 'active', teacherId: 'teacher-one', video: { room: 'c-class-one', url: 'https://rooms.example/c-class-one' } },
    ...(member ? { 'classes/class-one/members/learner-one': { learnerId: 'mia' } } : {}),
  };
  const db = { doc: path => ({ get: async () => {
    reads.push(path);
    return { exists: !!docs[path], data: () => docs[path] };
  } }) };
  return { db, docs, reads };
}

test('only a current class member receives a short-lived, non-host token', async () => {
  const { db } = fixture();
  const requests = [];
  const request = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ token: 'learner-token' }) };
  };
  const result = await issueClassVideoToken(db, 'learner-one', 'class-one', 'provider-key', request, () => 1_000_000_000);
  assert.deepEqual(result, { token: 'learner-token', room: 'c-class-one' });
  assert.equal(requests[0].url, 'https://api.daily.co/v1/meeting-tokens');
  const properties = JSON.parse(requests[0].options.body).properties;
  assert.equal(properties.room_name, 'c-class-one');
  assert.equal(properties.is_owner, false);
  assert.equal(properties.user_id, 'learner-one');
  assert.equal(properties.exp, 1_000_600);
});

test('revoked learners and unrelated accounts cannot request admission', async () => {
  for (const [role, member] of [['learner', false], ['guest', true]]) {
    const { db } = fixture(role, member);
    let called = false;
    await assert.rejects(issueClassVideoToken(db, 'learner-one', 'class-one', 'provider-key', async () => { called = true; }), /unavailable to this account/);
    assert.equal(called, false);
  }
});

test('class teacher receives host authority from the trusted server', async () => {
  const { db, docs } = fixture('teacher');
  docs['users/teacher-one'] = { role: 'teacher', displayName: 'Arda' };
  let properties;
  await issueClassVideoToken(db, 'teacher-one', 'class-one', 'provider-key', async (_url, options) => {
    properties = JSON.parse(options.body).properties;
    return { ok: true, json: async () => ({ token: 'host-token' }) };
  });
  assert.equal(properties.is_owner, true);
  assert.equal(properties.room_name, 'c-class-one');
});
