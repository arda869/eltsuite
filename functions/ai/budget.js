// USD accounting uses integer millionths of a dollar; no floating-point balance.
// Standard short-context prices verified 30 October 2026:
// https://developers.openai.com/api/docs/pricing
export const PILOT_MODEL = 'gpt-6.1-sol';
export const MONTHLY_LIMIT_MICRO_USD = 20_000_000;
export const MAX_INPUT_TOKENS = 100_000;
export const MAX_OUTPUT_TOKENS = 12_000;
export const RESERVATION_PER_CALL = 2 * MAX_INPUT_TOKENS + 10 * MAX_OUTPUT_TOKENS;
export const PRICE_REVIEW_AFTER = Date.parse('2026-12-01T00:00:00Z');

export function checkModel(model, now = Date.now()) {
  if (model !== PILOT_MODEL || now >= PRICE_REVIEW_AFTER) throw Error('The pilot model prices need review before generation can continue.');
}
export function reserveBudget(balance, calls) {
  if (!Number.isSafeInteger(balance) || balance < 0 || ![1, 2].includes(calls)) throw Error('Invalid budget record.');
  const reserved = calls * RESERVATION_PER_CALL;
  if (balance + reserved > MONTHLY_LIMIT_MICRO_USD) throw Error('The US$20 monthly AI allowance has been reached. Saved plans remain available.');
  return { balance: balance + reserved, reserved };
}
export function usageCost(usage) {
  const { inputTokens, outputTokens } = usage ?? {};
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > MAX_INPUT_TOKENS ||
      !Number.isSafeInteger(outputTokens) || outputTokens < 0 || outputTokens > MAX_OUTPUT_TOKENS) throw Error('The provider returned unexpected usage.');
  // Charge full input price even for cached tokens, to err on the conservative side.
  return inputTokens * 2 + outputTokens * 10;
}
export function settleBudget(balance, reserved, usages) {
  const cost = usages.reduce((sum, usage) => sum + usageCost(usage), 0);
  if (!Number.isSafeInteger(balance) || balance < reserved || cost > reserved) throw Error('Invalid budget settlement.');
  return { balance: balance - reserved + cost, cost };
}
export function checkRequestSize(body) {
  // UTF-8 bytes bound text token count; leave 10K tokens for message/schema framing.
  // Include the instructions AND output schema, not just the teacher's brief.
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 90_000) throw Error('The lesson is too long for this pilot request.');
}
// Missing records, owner status and email addresses never grant access.
export function isPilotTeacher(pilotEnabled) { return pilotEnabled === true; }
