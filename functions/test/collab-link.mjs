import test from 'node:test';
import assert from 'node:assert/strict';
import { documentLinkPolicy, removeLinkVisitors, sameToken } from '../collab/link.js';

test('organisation rule controls the maximum link audience', () => {
  assert.equal(documentLinkPolicy({ outside: 'org' }), 'org');
  assert.equal(documentLinkPolicy({ outside: 'org', policy: { docLinks: 'anyone' } }), 'anyone');
  assert.equal(documentLinkPolicy({ outside: 'anyone', policy: { docLinks: 'org' } }), 'org');
});

test('revoking a link removes only visitors who came through the link', () => {
  const existing = {
    members: {
      direct: { role: 'edit', name: 'Direct', kind: 'teacher' },
      visitor: { role: 'view', name: 'Visitor', kind: 'teacher', linkOnly: true },
    },
    memberIds: ['direct', 'visitor'],
  };
  assert.deepEqual(removeLinkVisitors(existing), {
    members: { direct: existing.members.direct }, memberIds: ['direct'], removed: 1,
  });
  assert.deepEqual(removeLinkVisitors(existing, uid => uid === 'visitor'), {
    members: existing.members, memberIds: existing.memberIds, removed: 0,
  });
});

test('a changed document link rejects its old token', () => {
  assert.equal(sameToken('old-token', 'old-token'), true);
  assert.equal(sameToken('old-token', 'new-token'), false);
  assert.equal(sameToken('old-token', 'short'), false);
});
