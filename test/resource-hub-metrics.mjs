import assert from 'node:assert/strict';
import test from 'node:test';
import { publishedResourceForMetric, validateResourceMetric } from '../functions/resource-hub/metrics.js';

test('accepts only the three resource usage actions with safe identifiers', () => {
  for (const kind of ['view', 'download', 'copy']) {
    const result = validateResourceMetric({ activityId: 'otp-002', kind, requestId: 'dcf46c82-3ae7-42d0-a2bb-f43fc967143a' });
    assert.equal(result.field, { view: 'views', download: 'downloads', copy: 'copies' }[kind]);
  }
  for (const activityId of ['../users', 'a/b', '', 'a'.repeat(101)]) {
    assert.throws(() => validateResourceMetric({ activityId, kind: 'view', requestId: 'dcf46c82-3ae7-42d0-a2bb-f43fc967143a' }), { code: 'invalid-argument' });
  }
  assert.throws(() => validateResourceMetric({ activityId: 'otp-002', kind: 'delete', requestId: 'dcf46c82-3ae7-42d0-a2bb-f43fc967143a' }), { code: 'invalid-argument' });
  assert.throws(() => validateResourceMetric({ activityId: 'otp-002', kind: 'view', requestId: 'short' }), { code: 'invalid-argument' });
});

test('resolves published lesson and numbered activity IDs without counting unrelated documents', async () => {
  const documents = {
    'resourceHubNumberClaims/otp-003': { resourceId: 'draft-3' },
    'resourceHubPublished/draft-3': { resourceType: 'activity', collectionId: 'otp', number: '003' },
    'resourceHubPublished/lesson-doc': { resourceType: 'lesson', collectionId: 'otp', number: '' },
  };
  const db = { doc: path => ({ get: async () => ({ exists: path in documents, data: () => documents[path], get: field => documents[path]?.[field] }) }) };
  assert.equal(await publishedResourceForMetric(db, 'otp-002'), true);
  assert.equal(await publishedResourceForMetric(db, 'otp-003'), true);
  assert.equal(await publishedResourceForMetric(db, 'lesson-lesson-doc'), true);
  assert.equal(await publishedResourceForMetric(db, 'otp-004'), false);
  assert.equal(await publishedResourceForMetric(db, 'lesson-draft-3'), false);
});
