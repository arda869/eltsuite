import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

// Recording together: a session the host starts and colleagues join from a link. Everyone hears
// everyone (WebRTC, peer to peer), but each records only their own microphone, at full quality,
// on their own device. When the host stops, each take is uploaded to the session; the host opens
// them all in the Sound editor, one track per person, lined up in time, and saves the result in
// their own resources library. Everyone should wear headphones, so the others are not recorded.

export type Session = { chatId?: string; id: string; host: string; hostName: string; title: string; members: string[]; names: Record<string, string>; state: 'waiting' | 'counting' | 'recording' | 'stopped'; round: number; startAt?: number; createdAt: number };
export type Peer = { video?: boolean; uid: string; name: string; seen: number; mic: boolean; offset?: number; uploading?: number };
export type Take = { id: string; uid: string; name: string; round: number; parts: number; type: string; start: number; duration: number };

const sessions = collection(db, 'studios');
const PART = 700_000; // characters of base64 in one document

export async function createSession(host: { uid: string; name: string }, guests: { uid: string; name: string }[], title: string) {
  const members = [host.uid, ...guests.map((g) => g.uid).filter((u) => u !== host.uid)];
  const r = await addDoc(sessions, { host: host.uid, hostName: host.name, title, members, names: Object.fromEntries([host, ...guests].map((g) => [g.uid, g.name])), state: 'waiting', round: 0, createdAt: Date.now() });
  return r.id;
}
export const sessionLink = (id: string) => `${window.location.origin}/studio/session/${id}`;

export function watchSession(id: string, on: (s: Session | null) => void): Unsubscribe {
  return onSnapshot(doc(sessions, id), (s) => on(s.exists() ? ({ id: s.id, ...(s.data() as Omit<Session, 'id'>) }) : null), () => on(null));
}
export const setSession = (id: string, patch: Partial<Session>) => updateDoc(doc(sessions, id), patch as never);

// ------------------------------------------------------------------ who is here, and the shared clock

export function watchPeers(id: string, on: (p: Peer[]) => void): Unsubscribe {
  return onSnapshot(collection(sessions, id, 'peers'), (s) => on(s.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Peer, 'uid'>) }))), () => on([]));
}
// Being here: a heartbeat every few seconds, and how far this device's clock is from the server's,
// so everyone starts recording at the same moment.
export function joinSession(id: string, me: { uid: string; name: string }, mic: () => boolean, onOffset: (ms: number) => void, video: () => boolean = () => false) {
  const ref = doc(sessions, id, 'peers', me.uid);
  let dead = false;
  let sentAt = 0;
  const beat = () => {
    if (dead) return;
    sentAt = Date.now();
    void setDoc(ref, { name: me.name, seen: Date.now(), mic: mic(), video: video(), ping: serverTimestamp() }, { merge: true }).catch(() => {});
  };
  const un = onSnapshot(ref, { includeMetadataChanges: true }, (s) => {
    const ping = s.data()?.ping as { toMillis?: () => number } | undefined;
    if (!s.metadata.hasPendingWrites && ping?.toMillis && sentAt) {
      const rtt = Date.now() - sentAt;
      if (rtt < 4000) onOffset(ping.toMillis() - (sentAt + rtt / 2));
    }
  });
  beat();
  const t = window.setInterval(beat, 4000);
  const onVideo = () => beat();
  window.addEventListener('studio-video', onVideo);
  return () => {
    dead = true;
    window.removeEventListener('studio-video', onVideo);
    window.clearInterval(t);
    un();
    void deleteDoc(ref).catch(() => {});
  };
}

// ------------------------------------------------------------------ hearing each other (WebRTC)

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

// One connection to each other person; the one whose id sorts first makes the offer.
// The call carries each person's microphone, and their camera when it is on.
export function connectAudio(id: string, me: string, others: () => string[], mic: MediaStream, onRemote: (uid: string, s: MediaStream | null) => void) {
  const pcs = new Map<string, { pc: RTCPeerConnection; unsub: Unsubscribe[] }>();
  const videoSenders = new Map<string, RTCRtpSender>();
  let cam: MediaStreamTrack | null = null;
  const pair = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const open = (other: string) => {
    if (pcs.has(other)) return;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const unsub: Unsubscribe[] = [];
    pcs.set(other, { pc, unsub });
    mic.getTracks().forEach((t) => pc.addTrack(t, mic));
    // A video line from the start, so the camera can go on and off without starting again. The
    // one who offers adds it; the other takes the line the offer brings (see below).
    const useVideo = (t: RTCRtpTransceiver) => { t.direction = 'sendrecv'; videoSenders.set(other, t.sender); if (cam) void t.sender.replaceTrack(cam).catch(() => {}); };
    if (me < other) useVideo(pc.addTransceiver('video', { direction: 'sendrecv', streams: [mic] }));
    const incoming = new MediaStream();
    pc.ontrack = (e) => { incoming.addTrack(e.track); onRemote(other, new MediaStream(incoming.getTracks())); };
    pc.onconnectionstatechange = () => (pc.connectionState === 'failed' || pc.connectionState === 'closed') && onRemote(other, null);
    const sig = doc(sessions, id, 'signal', pair(me, other));
    pc.onicecandidate = (e) => e.candidate && void addDoc(collection(sig, 'ice_' + me), e.candidate.toJSON()).catch(() => {});
    unsub.push(onSnapshot(collection(sig, 'ice_' + other), (s) => s.docChanges().forEach((c) => c.type === 'added' && void pc.addIceCandidate(c.doc.data() as RTCIceCandidateInit).catch(() => {}))));
    const offerer = me < other;
    unsub.push(
      onSnapshot(sig, async (s) => {
        const d = s.data() as { offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit } | undefined;
        try {
          if (offerer && d?.answer && !pc.currentRemoteDescription) await pc.setRemoteDescription(d.answer);
          if (!offerer && d?.offer && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(d.offer);
            const vt = pc.getTransceivers().find((t) => t.receiver.track.kind === 'video');
            if (vt) useVideo(vt);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            await setDoc(sig, { answer: { type: ans.type, sdp: ans.sdp } }, { merge: true });
          }
        } catch {
          /* the next message sorts it out */
        }
      }),
    );
    if (offerer)
      void (async () => {
        // a fresh start: clear the old signals between these two
        const old = await getDocs(collection(sig, 'ice_' + me)).catch(() => null);
        await Promise.all((old?.docs ?? []).map((d) => deleteDoc(d.ref).catch(() => {})));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await setDoc(sig, { offer: { type: offer.type, sdp: offer.sdp }, answer: null });
      })();
  };
  const close = (other: string) => {
    const c = pcs.get(other);
    if (!c) return;
    c.unsub.forEach((u) => u());
    c.pc.close();
    pcs.delete(other);
    videoSenders.delete(other);
    onRemote(other, null);
  };
  const sync = () => {
    const want = new Set(others());
    want.forEach(open);
    [...pcs.keys()].filter((k) => !want.has(k)).forEach(close);
  };
  sync();
  const setVideo = (track: MediaStreamTrack | null) => {
    cam = track;
    videoSenders.forEach((sender) => void sender.replaceTrack(track).catch(() => {}));
  };
  return { sync, setVideo, stop: () => [...pcs.keys()].forEach(close) };
}

// ------------------------------------------------------------------ takes

const toB64 = (u8: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
export async function uploadTake(id: string, me: { uid: string; name: string }, round: number, blob: Blob, start: number, duration: number, onProgress?: (p: number) => void) {
  const b64 = toB64(new Uint8Array(await blob.arrayBuffer()));
  const parts = Math.max(1, Math.ceil(b64.length / PART));
  const tid = `${round}_${me.uid}`;
  const ref = doc(sessions, id, 'takes', tid);
  for (let k = 0; k < parts; k++) {
    await setDoc(doc(ref, 'parts', String(k)), { uid: me.uid, data: b64.slice(k * PART, (k + 1) * PART) });
    onProgress?.((k + 1) / parts);
  }
  await setDoc(ref, { uid: me.uid, name: me.name, round, parts, type: blob.type || 'audio/webm', start, duration });
}
export function watchTakes(id: string, on: (t: Take[]) => void): Unsubscribe {
  return onSnapshot(collection(sessions, id, 'takes'), (s) => on(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Take, 'id'>) }))), () => on([]));
}
export async function loadTake(id: string, t: Take): Promise<Blob> {
  const ref = doc(sessions, id, 'takes', t.id);
  const parts = await Promise.all(Array.from({ length: t.parts }, (_, k) => getDoc(doc(ref, 'parts', String(k)))));
  const b64 = parts.map((p) => String(p.data()?.data ?? '')).join('');
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: t.type });
}
// The host can tidy the session away once the sound is saved.
export async function endSession(id: string) {
  const takes = await getDocs(collection(sessions, id, 'takes')).catch(() => null);
  for (const t of takes?.docs ?? []) {
    const parts = await getDocs(collection(t.ref, 'parts')).catch(() => null);
    const b = writeBatch(db);
    (parts?.docs ?? []).forEach((p) => b.delete(p.ref));
    b.delete(t.ref);
    await b.commit().catch(() => {});
  }
  await updateDoc(doc(sessions, id), { state: 'stopped', ended: true }).catch(() => {});
}

// ------------------------------------------------------------------ the recording as it happens

// While recording, each person's level ten times a second (0–255), so everyone sees every track
// grow live in the studio. The sound itself is recorded on each device at full quality.
export type Live = { uid: string; name: string; round: number; start: number; peaks: number[] };
export const LIVE_RATE = 10;
export const saveLive = (id: string, me: { uid: string; name: string }, round: number, start: number, peaks: number[]) =>
  setDoc(doc(sessions, id, 'live', me.uid), { name: me.name, round, start, peaks }).catch(() => {});
export function watchLive(id: string, on: (l: Live[]) => void): Unsubscribe {
  return onSnapshot(collection(sessions, id, 'live'), (s) => on(s.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Live, 'uid'>) }))), () => on([]));
}

// How long one recording may last. A super admin sets it (admin/studio.maxMinutes); 20 minutes
// unless they change it.
export const DEFAULT_STUDIO_MINUTES = 20;
export function watchStudioLimit(on: (minutes: number) => void): Unsubscribe {
  return onSnapshot(doc(db, 'admin', 'studio'), (s) => { const m = Number(s.data()?.maxMinutes); on(Number.isFinite(m) && m >= 1 && m <= 180 ? m : DEFAULT_STUDIO_MINUTES); }, () => on(DEFAULT_STUDIO_MINUTES));
}
export const setStudioLimit = (minutes: number) => setDoc(doc(db, 'admin', 'studio'), { maxMinutes: minutes }, { merge: true });
