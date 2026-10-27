import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Session } from './sessions';

// Where an online session happens: ELT Suite's own video room, or the tool a teacher already
// uses. Google Meet links are made with the Google Calendar event (lib/gcal.ts); Microsoft Teams
// links with Microsoft Graph, from the browser; Zoom uses the teacher's own Zoom link, saved
// once in Settings (Zoom's API needs a server, and ELT Suite has none).

export type VideoKind = 'eltsuite' | 'meet' | 'teams' | 'zoom' | 'link';
export type SessionVideo = { kind: VideoKind; url?: string; by?: string };
export const VIDEO_KINDS: { k: VideoKind; label: string; short: string }[] = [
  { k: 'eltsuite', label: 'ELT Suite video room', short: 'ELT Suite' },
  { k: 'meet', label: 'Google Meet', short: 'Google Meet' },
  { k: 'teams', label: 'Microsoft Teams', short: 'Teams' },
  { k: 'zoom', label: 'Zoom', short: 'Zoom' },
  { k: 'link', label: 'Another link', short: 'the link' },
];
export const videoLabel = (k?: VideoKind) => VIDEO_KINDS.find((x) => x.k === k)?.label ?? 'ELT Suite video room';
export const external = (s: Pick<Session, 'online' | 'video'>) => !!s.online && !!s.video && s.video.kind !== 'eltsuite';
// The link to join, when the session uses another tool and the link is ready.
export const joinUrl = (s: Pick<Session, 'online' | 'video'>) => (external(s) && s.video?.url && /^https:\/\//.test(s.video.url) ? s.video.url : null);
export const joinText = (s: Pick<Session, 'online' | 'video'>) => `Join on ${VIDEO_KINDS.find((x) => x.k === s.video?.kind)?.short ?? 'the link'}`;
export const cleanUrl = (u: string) => {
  const t = u.trim();
  if (!t) return '';
  const w = /^https?:\/\//i.test(t) ? t : 'https://' + t;
  try {
    const x = new URL(w);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href.replace(/^http:/, 'https:') : '';
  } catch {
    return '';
  }
};
export const looksZoom = (u: string) => /(^|\.)zoom\.(us|com)$/i.test((() => { try { return new URL(u).hostname; } catch { return ''; } })());

// ------------------------------------------------------------------ each teacher's choice
export type VideoPrefs = { kind?: VideoKind; zoom?: string; link?: string };
export function useVideoPrefs(uid?: string) {
  const [p, setP] = useState<VideoPrefs>({});
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'users', uid),
      (d) => setP((d.data()?.video as VideoPrefs | undefined) ?? {}),
      () => setP({}),
    );
  }, [uid]);
  return p;
}
export const saveVideoPrefs = (uid: string, p: VideoPrefs) => updateDoc(doc(db, 'users', uid), { video: JSON.parse(JSON.stringify(p)) });
// What a new online session gets, from the teacher's choice in Settings.
export function defaultVideo(p: VideoPrefs, uid: string): SessionVideo | undefined {
  const k = p.kind ?? 'eltsuite';
  if (k === 'eltsuite') return undefined;
  if (k === 'zoom') return p.zoom ? { kind: 'zoom', url: p.zoom, by: uid } : undefined;
  if (k === 'link') return p.link ? { kind: 'link', url: p.link, by: uid } : undefined;
  return { kind: k, by: uid };
}

// ------------------------------------------------------------------ Microsoft Teams
// The Application (client) ID of ELT Suite's app in Microsoft Entra. Public, not a secret; the
// owner can also set it in Settings.
export const MICROSOFT_CLIENT_ID = '';
const SCOPES = ['OnlineMeetings.ReadWrite'];
let msId: string | null = MICROSOFT_CLIENT_ID || null;
let msAsked: Promise<string | null> | null = null;
export function microsoftClientId(): Promise<string | null> {
  if (msId) return Promise.resolve(msId);
  msAsked ??= getDoc(doc(db, 'admin', 'microsoft'))
    .then((d) => (msId = String(d.data()?.clientId ?? '').trim() || null))
    .catch(() => null);
  return msAsked;
}
export function setMicrosoftClientIdLocal(id: string) {
  msId = id.trim() || null;
  msAsked = null;
  msApp = null;
}
type Msal = import('@azure/msal-browser').PublicClientApplication;
let msApp: Promise<Msal> | null = null;
async function msal() {
  const id = await microsoftClientId();
  if (!id) throw new Error('Microsoft Teams is not set up for ELT Suite yet.');
  msApp ??= import('@azure/msal-browser').then(async (m) => {
    const app = new m.PublicClientApplication({
      // Work and school accounts: Microsoft lets only those make Teams meetings this way.
      auth: { clientId: id, authority: 'https://login.microsoftonline.com/organizations', redirectUri: `${location.origin}/ms-auth.html` },
      cache: { cacheLocation: 'memoryStorage' },
    });
    await app.initialize();
    return app;
  });
  return msApp;
}
// Get ready ahead of time, so the sign-in window can open straight from a click.
export const prepareMicrosoft = () => microsoftClientId().then((id) => (id ? msal().then(() => true) : false)).catch(() => false);
let msToken: { value: string; exp: number } | null = null;
async function teamsToken() {
  if (msToken && msToken.exp > Date.now() + 60_000) return msToken.value;
  const app = await msal();
  const account = app.getAllAccounts()[0];
  try {
    const r = account ? await app.acquireTokenSilent({ scopes: SCOPES, account }) : await app.acquireTokenPopup({ scopes: SCOPES });
    msToken = { value: r.accessToken, exp: r.expiresOn?.getTime() ?? Date.now() + 3000e3 };
    return r.accessToken;
  } catch (e) {
    const code = (e as { errorCode?: string }).errorCode ?? '';
    if (code === 'user_cancelled' || code === 'popup_window_error') throw new Error(code === 'user_cancelled' ? 'The Microsoft window was closed before it finished.' : 'Your browser blocked the Microsoft window. Allow pop-ups for ELT Suite and try again.');
    if (account) {
      const r = await app.acquireTokenPopup({ scopes: SCOPES, account });
      msToken = { value: r.accessToken, exp: r.expiresOn?.getTime() ?? Date.now() + 3000e3 };
      return r.accessToken;
    }
    throw new Error('Microsoft did not let ELT Suite in. Teams meetings need a work or school Microsoft account, and your school may need to allow ELT Suite.');
  }
}
// Start signing in from the click itself (browsers open the window only then); the meeting is
// made once the session is saved.
export function warmTeams() {
  const p = teamsToken();
  p.catch(() => {});
  return p;
}
// A Teams meeting for the whole span of a session (all its weeks), and its join link.
export async function makeTeamsMeeting(s: Pick<Session, 'title' | 'start' | 'mins' | 'weeks'>) {
  const t = await teamsToken();
  const end = s.start + ((Math.max(1, s.weeks ?? 1) - 1) * 7 * 864e5) + s.mins * 60000 + 3600e3;
  const r = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject: s.title || 'ELT Suite', startDateTime: new Date(s.start).toISOString(), endDateTime: new Date(end).toISOString() }),
  });
  const d = (await r.json().catch(() => ({}))) as { joinWebUrl?: string; joinUrl?: string; error?: { message?: string } };
  if (!r.ok || !(d.joinWebUrl || d.joinUrl)) throw new Error(r.status === 403 ? 'Microsoft did not allow a Teams meeting for this account. Teams meetings need a work or school account with Teams.' : d.error?.message ?? 'The Teams meeting could not be made.');
  return (d.joinWebUrl || d.joinUrl)!;
}
