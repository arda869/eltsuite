import { randomInt } from 'node:crypto';

const PATTERN = /^ELTSUITE-(\d{4})-(\d{4})-(\d{4})-(\d{4})$/;
export function suiteScriptChecksum(payload) {
  if (!/^\d{12}$/.test(payload)) throw new Error('SuiteScript payload must have twelve digits.');
  return String(BigInt(payload) % 9973n).padStart(4, '0');
}
export function suiteScriptId(payload = String(randomInt(0, 1_000_000_000_000)).padStart(12, '0')) {
  if (!/^\d{12}$/.test(payload)) throw new Error('SuiteScript payload must have twelve digits.');
  return `ELTSUITE-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${suiteScriptChecksum(payload)}`;
}
export function validSuiteScriptId(value) {
  const match = typeof value === 'string' && value.match(PATTERN);
  return !!match && suiteScriptChecksum(match.slice(1, 4).join('')) === match[4];
}
