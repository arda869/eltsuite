import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';
export async function speakingCall<T = Record<string, unknown>>(data: Record<string, unknown>): Promise<T> {
  return (await httpsCallable<Record<string, unknown>, T>(getFunctions(app, 'us-central1'), 'speakingTask', { timeout: 240000 })(data)).data;
}
