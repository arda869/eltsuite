import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

export type SuiteScriptReferenceKind = 'archive' | 'sharedDoc';
export type SuiteScriptDestination = { mode: 'private' } | { mode: 'resourceHub' } | { mode: 'class'; classId: string } | { mode: 'message'; recipientIds: string[] };
export type ResolvedSuiteScriptReference = { id: string; kind: SuiteScriptReferenceKind; sourceId: string; owner: string; itemType: string; home?: { classId: string; mediaId: string } | null; copies?: Record<string, string>; docKey?: string; mime?: string };

const callable = httpsCallable<Record<string, unknown>, Record<string, unknown>>(getFunctions(app, 'us-central1'), 'suiteScriptReference');

export function validSuiteScriptReference(value: string): boolean {
  const match = /^ELTSUITE-(\d{4})-(\d{4})-(\d{4})-(\d{4})$/.exec(value);
  if (!match) return false;
  const payload = match.slice(1, 4).join('');
  return String(BigInt(payload) % 9973n).padStart(4, '0') === match[4];
}

export async function ensureSuiteScriptReference(kind: SuiteScriptReferenceKind, id: string): Promise<string> {
  const result = await callable({ action: 'ensure', kind, id });
  return String(result.data.id);
}

export async function resolveSuiteScriptReference(id: string, destination: SuiteScriptDestination): Promise<ResolvedSuiteScriptReference> {
  if (!validSuiteScriptReference(id)) throw new Error('Reference has a missing digit or invalid checksum. Reselect the item.');
  const result = await callable({ action: 'resolve', id, destination });
  return result.data as ResolvedSuiteScriptReference;
}
