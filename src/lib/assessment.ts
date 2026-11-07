import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';
import type { AnswerKey, Responses } from './questions';

export function assessTask(classId: string, itemId: string, taskId: string, action: 'check' | 'reset' = 'check', all = false) {
  const call = httpsCallable<{ classId: string; itemId: string; taskId: string; action: 'check' | 'reset'; all: boolean }, { key: AnswerKey | null; checked: boolean; responses?: Responses }>(getFunctions(app, 'us-central1'), 'assessTask');
  return call({ classId, itemId, taskId, action, all }).then(result => result.data);
}
export function resubmitCorrection(classId: string, taskId: string, questionId: string) {
  return httpsCallable<{ classId: string; taskId: string; questionId: string }, { saved: boolean }>(getFunctions(app, 'us-central1'), 'resubmitCorrection')({ classId, taskId, questionId });
}
