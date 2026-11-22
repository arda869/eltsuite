import assert from 'node:assert/strict';
import test from 'node:test';
import { validateResourceMetric } from '../functions/resource-hub/metrics.js';

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
