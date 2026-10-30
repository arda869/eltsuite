import test from 'node:test';
import assert from 'node:assert/strict';
import { checkModel, checkRequestSize, isPilotTeacher, reserveBudget, settleBudget, usageCost, RESERVATION_PER_CALL, MONTHLY_LIMIT_MICRO_USD, PRICE_REVIEW_AFTER } from '../../functions/ai/budget.js';

test('reserve both plan calls before work and stop at the monthly boundary', () => {
  const r = reserveBudget(MONTHLY_LIMIT_MICRO_USD - 2 * RESERVATION_PER_CALL, 2);
  assert.equal(r.balance, MONTHLY_LIMIT_MICRO_USD);
  assert.throws(() => reserveBudget(r.balance, 1), /US\$20/);
  assert.throws(() => reserveBudget(MONTHLY_LIMIT_MICRO_USD - RESERVATION_PER_CALL, 2));
  for (const bad of [NaN, -1, 1.1, '0']) assert.throws(() => reserveBudget(bad, 1));
});
test('settlement refunds only known usage, preserving other in-flight reservations', () => {
  const a = reserveBudget(0, 1), b = reserveBudget(a.balance, 2);
  const settled = settleBudget(b.balance, a.reserved, [{ inputTokens: 12000, outputTokens: 6000 }]);
  assert.equal(settled.cost, 84000);
  assert.equal(settled.balance, 2 * RESERVATION_PER_CALL + 84000);
  assert.throws(() => settleBudget(settled.balance, b.reserved, [{ inputTokens: undefined, outputTokens: undefined }]));
});
test('invalid or unexpectedly high provider usage fails closed', () => {
  for (const usage of [{}, { inputTokens: -1, outputTokens: 10 }, { inputTokens: 100001, outputTokens: 10 }, { inputTokens: 1, outputTokens: 12001 }, { inputTokens: 1.5, outputTokens: 10 }]) assert.throws(() => usageCost(usage));
  assert.equal(usageCost({ inputTokens: 100000, outputTokens: 12000 }), RESERVATION_PER_CALL);
});
test('unknown models, stale prices and oversized UTF-8 requests cannot generate', () => {
  checkModel('gpt-6.1-sol', PRICE_REVIEW_AFTER - 1);
  assert.throws(() => checkModel('gpt-6-astra', PRICE_REVIEW_AFTER - 1));
  assert.throws(() => checkModel('gpt-6.1-sol', PRICE_REVIEW_AFTER));
  checkRequestSize({ input: 'short' });
  assert.throws(() => checkRequestSize({ input: '字'.repeat(30000) }));
});
test('account-only mode requires the configured verified email, regardless of allowlist', () => {
  assert.equal(isPilotTeacher({ email: 'OWNER@example.com', email_verified: true }, 'owner@example.com', false), true);
  assert.equal(isPilotTeacher({ email: 'owner@example.com' }, 'owner@example.com', true), false);
  assert.equal(isPilotTeacher({ email: 'other@example.com', email_verified: true }, 'owner@example.com', true), false);
  assert.equal(isPilotTeacher({}, '', true), true);
  assert.equal(isPilotTeacher({}, '', false), false);
});
