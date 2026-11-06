import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';
import type { AnswerKey } from './questions';

type CheckResult = { checkedParts: string[]; key: AnswerKey; complete: boolean };

export async function checkSubTask(classId: string, itemId: string, taskId: string, partId: string, action: 'check' | 'read' = 'check'): Promise<CheckResult> {
  const call = httpsCallable<{ classId: string; itemId: string; taskId: string; partId: string; action: 'check' | 'read' }, CheckResult>(getFunctions(app, 'us-central1'), 'checkSubTask');
  return (await call({ classId, itemId, taskId, partId, action })).data;
}
