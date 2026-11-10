// The live quiz show from the browser's side: calls to the quiz service, the public state everyone
// follows (quizLive/{runId} in the Realtime Database), and the server's clock.
import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { onValue, ref } from 'firebase/database';
import type { JSONContent } from '@tiptap/react';
import { app, rtdb } from '../lib/firebase';
import type { AnswerKey } from '../lib/questions';

export async function quizApi<T = { ok: boolean }>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  try {
    return (await httpsCallable(getFunctions(app, 'us-central1'), 'quizShow')({ action, ...data })).data as T;
  } catch (e) {
    // Firebase puts our message after a code ("permission-denied"); show only our words.
    const msg = (e as { message?: string }).message || '';
    throw Error(/internal|network|fetch|unavailable/i.test(msg) && !/[.’]/.test(msg) ? 'We couldn’t reach the quiz just now. Check your connection and try again.' : msg);
  }
}

export type LiveSlide = {
  index: number;
  total: number;
  kind: 'choice' | 'task';
  seconds: number;
  points: number;
  poll: boolean;
  qids: string[];
  prompt?: string;
  options?: string[];
  multi?: boolean;
  lead?: JSONContent | null;
  content?: JSONContent;
  skin?: string;
};
export type LiveReveal = { right: number; partly: number; wrong: number; none: number; answered: number; key: AnswerKey; counts?: number[]; correct?: number[] };
export type LivePlayer = { n: string; s: number; k?: number; g?: number; r?: number; a?: number; ok?: number | null; m?: number; d?: number; f?: number };
export type Phase = 'lobby' | 'self' | 'question' | 'reveal' | 'board' | 'podium' | 'ended';
export type LiveState = {
  title: string;
  code: string;
  classId?: string | null;
  total: number;
  mode?: 'live' | 'self';
  phase: Phase;
  slide: number;
  startsAt?: number;
  endsAt?: number;
  q?: LiveSlide;
  reveal?: LiveReveal | null;
  players: Record<string, LivePlayer>;
  answered?: Record<string, number>;
  answeredBy?: Record<string, Record<string, boolean>>;
  kicked?: Record<string, boolean>;
  guests: boolean;
  locked?: boolean;
  music?: string;
  host?: string;
  at?: number;
};

/** Count durable answer receipts; fall back to the counter on older active games. */
export function answeredCount(live: LiveState, slide: number) {
  const receipts = live.answeredBy?.[String(slide)];
  return receipts ? Object.values(receipts).filter(Boolean).length : live.answered?.[String(slide)] || 0;
}

const parse = <T,>(v: unknown): T | undefined => {
  if (typeof v !== 'string') return (v as T) ?? undefined;
  try {
    return JSON.parse(v) as T;
  } catch {
    return undefined;
  }
};

/** The game as everyone sees it. null: still loading; false: there's no such game. */
export function useLive(runId: string | null | undefined) {
  const [state, setState] = useState<LiveState | null | false>(null);
  useEffect(() => {
    if (!runId) return;
    return onValue(
      ref(rtdb, 'quizLive/' + runId),
      (s) => {
        const v = s.val();
        if (!v) return setState(false);
        setState({ ...v, players: v.players || {}, q: parse<LiveSlide>(v.q), reveal: parse<LiveReveal>(v.reveal) ?? null });
      },
      () => setState(false),
    );
  }, [runId]);
  return state;
}

/** How far this device's clock is from the server's, so every screen counts down together. */
let offset = 0;
let watching = false;
function watchOffset() {
  if (watching) return;
  watching = true;
  try {
    onValue(ref(rtdb, '.info/serverTimeOffset'), (s) => {
      const v = Number(s.val());
      if (Number.isFinite(v)) offset = v;
    });
  } catch {
    /* no clock offset available: use the device clock */
  }
}
export const serverNow = () => Date.now() + offset;

/** Re-renders every tick (ms) and gives the server time. */
export function useClock(tick = 200, on = true) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    watchOffset();
    if (!on) return;
    const id = setInterval(() => setNow(serverNow()), tick);
    return () => clearInterval(id);
  }, [tick, on]);
  return now;
}

// A player's place in a game survives a refresh or a dropped connection. Kept per tab, so two tabs
// (or two people sharing a computer) are two players.
export type Seat = { runId: string; pid: string; token: string; name: string; member?: boolean };
const SEAT = 'quiz.seat';
export function loadSeat(): Seat | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SEAT) || 'null');
    return s && s.runId && s.pid && s.token ? s : null;
  } catch {
    return null;
  }
}
export function saveSeat(s: Seat | null) {
  try {
    if (s) sessionStorage.setItem(SEAT, JSON.stringify(s));
    else sessionStorage.removeItem(SEAT);
  } catch {
    /* private window: the seat lasts as long as the page */
  }
}

/** Where players join: the learners' address, so the code works on any phone. */
export const joinPath = (code?: string) => '/game' + (code ? '/' + code : '');

/** Players sorted for the leaderboard. */
export const leaders = (players: Record<string, LivePlayer>) =>
  Object.entries(players)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.s || 0) - (a.s || 0) || a.n.localeCompare(b.n));
