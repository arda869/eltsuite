import { useEffect, useState } from 'react';
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import type { OpenCall } from './calls';

// The call itself, on Daily's call object: no Daily screen, only the camera and microphone
// streams, which our own call screen draws. One call at a time; it lives outside React, so it
// keeps going while the person moves around the app.

export type Tile = {
  id: string;
  name: string;
  local: boolean;
  owner: boolean;
  audio: boolean;
  video: boolean;
  screen: boolean;
  videoTrack?: MediaStreamTrack;
  audioTrack?: MediaStreamTrack;
  screenTrack?: MediaStreamTrack;
  screenAudioTrack?: MediaStreamTrack;
  network?: 'good' | 'warning' | 'bad' | 'unknown';
  key?: string; // their ELT Suite id, for their picture
  role?: 'teacher' | 'learner' | 'guest';
  avatar?: string;
  photo?: string;
};
export type Me = { name: string; key?: string; role: 'teacher' | 'learner' | 'guest'; avatar?: string; photo?: string };
// What a teacher can do to everyone, or to one person: off at once, or a request to turn on.
export type HostCmd = 'mute' | 'camOff' | 'askMic' | 'askCam';
export type Device = { id: string; label: string; kind: 'audioinput' | 'videoinput' | 'audiooutput' };
export type EngineState = {
  status: 'idle' | 'joining' | 'joined' | 'error';
  error?: string;
  call: OpenCall | null;
  tiles: Tile[];
  speaker?: string;
  mic: boolean;
  cam: boolean;
  sharing: boolean;
  blur: boolean;
  hands: Record<string, number>; // raised hands: participant id → when
  startedAt?: number;
  devices: Device[];
  mics?: string;
  cams?: string;
  ask?: { what: 'mic' | 'cam'; by: string } | null; // a teacher asked you to turn something on
  note?: string | null; // a short note: "Your teacher turned off your microphone"
};

const blank = (): EngineState => ({ status: 'idle', call: null, tiles: [], mic: true, cam: false, sharing: false, blur: false, hands: {}, devices: [] });
let st: EngineState = blank();
let co: DailyCall | null = null;
let queue: Promise<unknown> = Promise.resolve();
let me: Me = { name: 'Guest', role: 'guest' };
let ended: (() => void) | null = null;
export const onEngineEnded = (f: () => void) => void (ended = f);
const subs = new Set<(s: EngineState) => void>();
const emit = (p: Partial<EngineState>) => {
  st = { ...st, ...p };
  subs.forEach((f) => f(st));
};
export const engineState = () => st;
export function useEngine() {
  const [s, setS] = useState(st);
  useEffect(() => {
    subs.add(setS);
    setS(st);
    return () => void subs.delete(setS);
  }, []);
  return s;
}
export const setCallMe = (m: Me) => void (me = { ...m, name: m.name.trim() || 'Guest' });
export const callMe = () => me;

const track = (p: DailyParticipant, k: 'audio' | 'video' | 'screenVideo' | 'screenAudio') => {
  const t = p.tracks?.[k];
  return t && (t.state === 'playable' || t.state === 'loading' || t.state === 'interrupted') ? t.persistentTrack : undefined;
};
const tileOf = (p: DailyParticipant): Tile => ({
  ...((p.userData as Partial<Tile> | undefined) ?? {}),
  id: p.session_id,
  name: p.user_name || 'Guest',
  local: p.local,
  owner: p.owner,
  audio: p.tracks?.audio?.state === 'playable' || (p.local && p.tracks?.audio?.state === 'sendable'),
  video: p.tracks?.video?.state === 'playable',
  screen: p.tracks?.screenVideo?.state === 'playable',
  videoTrack: track(p, 'video'),
  audioTrack: p.local ? undefined : track(p, 'audio'),
  screenTrack: track(p, 'screenVideo'),
  screenAudioTrack: p.local ? undefined : track(p, 'screenAudio'),
  network: p.networkQualityState,
});
const refresh = () => {
  if (!co) return;
  const all = Object.values(co.participants());
  // You first, then the others in the order they came.
  const tiles = all.map(tileOf).sort((a, b) => Number(b.local) - Number(a.local));
  const me = tiles.find((t) => t.local);
  emit({ tiles, mic: co.localAudio(), cam: co.localVideo(), sharing: !!me?.screen });
};

async function devices() {
  if (!co) return;
  try {
    const { devices } = await co.enumerateDevices();
    emit({ devices: devices.filter((d) => d.deviceId && d.label).map((d) => ({ id: d.deviceId, label: d.label, kind: d.kind as Device['kind'] })) });
  } catch {
    /* none listed */
  }
}

export function startEngine(call: OpenCall) {
  queue = queue.then(async () => {
    await stopNow();
    emit({ ...blank(), status: 'joining', call });
    try {
      const Daily = (await import('@daily-co/daily-js')).default;
      Daily.getCallInstance()?.destroy();
      co = Daily.createCallObject({ subscribeToTracksAutomatically: true });
      const on = (e: string, f: (ev: unknown) => void) => co!.on(e as never, f as never);
      ['participant-joined', 'participant-updated', 'participant-left', 'track-started', 'track-stopped', 'joined-meeting', 'network-quality-change'].forEach((e) => on(e, refresh));
      on('participant-left', (ev) => {
        const id = (ev as { participant?: { session_id?: string } }).participant?.session_id;
        if (id && st.hands[id]) {
          const h = { ...st.hands };
          delete h[id];
          emit({ hands: h });
        }
      });
      on('active-speaker-change', (ev) => emit({ speaker: (ev as { activeSpeaker?: { peerId?: string } }).activeSpeaker?.peerId }));
      on('app-message', (ev) => {
        const { data, fromId } = ev as { data?: { hand?: boolean; cmd?: HostCmd; to?: string }; fromId: string };
        const from = st.tiles.find((t) => t.id === fromId);
        const mine = st.tiles.find((t) => t.local);
        // Only a teacher (or the room's host) can turn things off or ask for them on.
        if (data?.cmd && (from?.role === 'teacher' || from?.owner) && (data.to === '*' || data.to === mine?.id) && mine?.role !== 'teacher') {
          const by = from?.name ?? 'Your teacher';
          if (data.cmd === 'mute' && co?.localAudio()) (co.setLocalAudio(false), emit({ note: `${by} turned off your microphone` }));
          if (data.cmd === 'camOff' && co?.localVideo()) (co.setLocalVideo(false), emit({ note: `${by} turned off your camera` }));
          if (data.cmd === 'askMic' && !co?.localAudio()) emit({ ask: { what: 'mic', by } });
          if (data.cmd === 'askCam' && !co?.localVideo()) emit({ ask: { what: 'cam', by } });
          refresh();
        }
        if (data && 'hand' in data) {
          const h = { ...st.hands };
          if (data.hand) h[fromId] = Date.now();
          else delete h[fromId];
          emit({ hands: h });
        }
      });
      on('camera-error', (ev) => {
        const m = String((ev as { errorMsg?: { errorMsg?: string } }).errorMsg?.errorMsg ?? '');
        emit({ error: /denied|permission|NotAllowed/i.test(m) ? 'The camera or microphone is blocked. Allow them in the address bar, then turn them on again.' : 'The camera or microphone could not be used.' });
      });
      on('error', (ev) => emit({ status: 'error', error: String((ev as { errorMsg?: string }).errorMsg ?? 'The call stopped.') }));
      // Left without asking to (removed by a host, or the room closed): the call ends here too.
      on('left-meeting', () => {
        if (!co) return;
        const c = co;
        co = null;
        void c.destroy().catch(() => {});
        emit({ ...blank() });
        ended?.();
      });
      await co.join({ url: call.url, userName: me.name, userData: { key: me.key, role: me.role, avatar: me.avatar, photo: me.photo }, ...(call.token ? { token: call.token } : {}), startVideoOff: call.kind === 'audio' || !!call.camOff, startAudioOff: !!call.micOff });
      emit({ status: 'joined', startedAt: Date.now() });
      refresh();
      void devices();
    } catch (e) {
      console.error(e);
      emit({ status: 'error', error: 'The call could not be joined. Check your connection, then try again.' });
    }
  });
  return queue;
}

async function stopNow() {
  const c = co;
  co = null;
  if (!c) return;
  try {
    await c.leave();
  } catch {
    /* already left */
  }
  try {
    await c.destroy();
  } catch {
    /* gone */
  }
}
// Leaves the call. Returns how many others were still in it.
export function stopEngine() {
  const others = st.tiles.filter((t) => !t.local).length;
  queue = queue.then(async () => {
    await stopNow();
    emit({ ...blank() });
  });
  return others;
}

export const toggleMic = () => co && (co.setLocalAudio(!co.localAudio()), refresh());
export const toggleCam = () => co && (co.setLocalVideo(!co.localVideo()), refresh());
export function toggleShare() {
  if (!co) return;
  if (st.sharing) co.stopScreenShare();
  else co.startScreenShare();
}
export async function setBlur(on: boolean) {
  if (!co) return;
  try {
    await co.updateInputSettings({ video: { processor: on ? { type: 'background-blur', config: { strength: 0.6 } } : { type: 'none' } } });
    emit({ blur: on });
  } catch {
    emit({ error: 'Background blur does not work on this device.' });
  }
}
export function raiseHand(up: boolean) {
  if (!co) return;
  co.sendAppMessage({ hand: up }, '*');
  const me = st.tiles.find((t) => t.local);
  if (!me) return;
  const h = { ...st.hands };
  if (up) h[me.id] = Date.now();
  else delete h[me.id];
  emit({ hands: h });
}
export async function useDevice(kind: 'audioinput' | 'videoinput', id: string) {
  if (!co) return;
  await co.setInputDevicesAsync(kind === 'audioinput' ? { audioDeviceId: id } : { videoDeviceId: id }).catch(() => {});
  emit(kind === 'audioinput' ? { mics: id } : { cams: id });
}
// Teachers: everyone (or one person) off at once, or asked to turn on. Everyone in a call uses
// our call screen, which does as a teacher asks; in a class room the teacher is also the room's
// host, so Daily itself turns them off too.
export function host(cmd: HostCmd, to: string | '*' = '*') {
  if (!co) return;
  co.sendAppMessage({ cmd, to }, to === '*' ? '*' : to);
  const meTile = st.tiles.find((t) => t.local);
  if (meTile?.owner && (cmd === 'mute' || cmd === 'camOff')) {
    const ids = to === '*' ? st.tiles.filter((t) => !t.local).map((t) => t.id) : [to];
    co.updateParticipants(Object.fromEntries(ids.map((id) => [id, cmd === 'mute' ? { setAudio: false } : { setVideo: false }])));
  }
}
export const removeOther = (id: string) => co?.updateParticipant(id, { eject: true });
export const clearError = () => emit({ error: undefined });
export const clearAsk = () => emit({ ask: null, note: null });
export const turnOn = (what: 'mic' | 'cam') => {
  if (!co) return;
  if (what === 'mic') co.setLocalAudio(true);
  else co.setLocalVideo(true);
  emit({ ask: null });
  refresh();
};
