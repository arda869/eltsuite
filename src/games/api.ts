import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';
export async function gameApi<T = any>(action: string, data: Record<string, unknown> = {}): Promise<T> { return (await httpsCallable(getFunctions(app, 'us-central1'), 'classroomGames')({ action, ...data })).data as T; }
