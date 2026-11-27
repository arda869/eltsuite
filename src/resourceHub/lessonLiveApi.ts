import { getFunctions, httpsCallable } from 'firebase/functions';
import type { JSONContent } from '@tiptap/react';
import type { Responses } from '../lib/questions';
import { app } from '../lib/firebase';

export type LessonLiveTask = { id: string; title: string; instructions: string; instrDoc?: JSONContent | null; content: JSONContent; layout?: 'single' | 'two' | 'two-wide' | 'media'; colScroll?: 'separate' | 'together'; identity?: import('../lib/identity').ActivityIdentity | null };
export type LessonTaskSummary = { got: number; max: number; answered: number; submittedAt?: number };
export type LessonLiveRun = { runId: string; sourceKind?: 'file' | 'resource'; resourceId: string | null; fileId?: string | null; title: string; edition: number | null; status: 'lobby' | 'running' | 'ended'; currentTaskId: string | null; taskIds: string[]; taskTitles: Record<string, string>; startedAt: number; endedAt: number | null; participantCount: number; codeExpiresAt?: number; expiresAt?: number; joinOpen?: boolean; expired?: boolean };
export type LessonLiveSignal = { hand?: boolean; stuck?: boolean; reaction?: 'thumbsup' | 'heart' | 'laugh' | 'wow' | 'clap'; updatedAt?: number };
export type LessonLiveParticipant = { pid: string; name: string; joinedAt: number; summaries: Record<string, LessonTaskSummary>; signal?: LessonLiveSignal };
export type LessonLiveGrade = { got: number; max: number; answered: boolean; status: 'unanswered' | 'ungraded' | 'correct' | 'partial' | 'incorrect' };
export type LessonLiveAnswer = { id: string; pid: string; name: string; taskId: string; responses?: Responses; grading?: Record<string, LessonLiveGrade>; got: number; max: number; answered: number; submittedAt: number };
export type LessonTeacherState = { run: LessonLiveRun; code: string | null; participants: LessonLiveParticipant[]; answers: LessonLiveAnswer[]; currentTask?: (LessonLiveTask & { key?: unknown; versionGroup?: string; versionLabel?: string }) | null };
export type LessonLearnerState = { run: Pick<LessonLiveRun, 'title' | 'status' | 'currentTaskId' | 'expired'>; tasks: Pick<LessonLiveTask, 'id' | 'title'>[]; currentTask: LessonLiveTask | null; responses?: Responses; signal?: LessonLiveSignal };
export type LessonResult = { run: LessonLiveRun; participants: LessonLiveParticipant[]; answers: LessonLiveAnswer[]; task?: LessonLiveTask | null };
export type LessonSeat = { runId: string; pid: string; token: string; name: string; code?: string };

export async function lessonLiveApi<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  try {
    const endpoint = httpsCallable<Record<string, unknown>, T>(getFunctions(app, 'us-central1'), 'resourceLessonLive');
    return (await endpoint({ action, ...params })).data;
  } catch (cause) {
    const message = (cause as Error).message || '';
    throw new Error(/(?:network|fetch|unavailable|internal)/i.test(message) ? 'The live lesson could not connect. Check your connection and try again.' : message.replace(/^FirebaseError:\s*/, ''));
  }
}

const seatKey = 'rh.lessonLive.seat';
export function loadLessonSeat(): LessonSeat | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(seatKey) || 'null') as LessonSeat | null;
    return value?.runId && value.pid && value.token ? value : null;
  } catch { return null; }
}
export function saveLessonSeat(value: LessonSeat | null) {
  try { if (value) sessionStorage.setItem(seatKey, JSON.stringify(value)); else sessionStorage.removeItem(seatKey); } catch { /* private browser mode */ }
}
