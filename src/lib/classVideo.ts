import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

export async function getClassVideoToken(classId: string): Promise<string> {
  const result = await httpsCallable<{ classId: string }, { token: string }>(
    getFunctions(app, 'us-central1'), 'classVideoToken',
  )({ classId });
  if (!result.data.token) throw new Error('The class video room is unavailable.');
  return result.data.token;
}
