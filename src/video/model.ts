export type AssetKind = "video" | "audio" | "image" | "character";
export type VideoAsset = {
  id: string;
  owner: string;
  ownerName: string;
  name: string;
  kind: AssetKind;
  type: string;
  size: number;
  parts: number;
  duration: number;
  description: string;
  voice: string;
  org: string;
  readers: string[];
  createdAt: number;
  ready: boolean;
  visualStyle?: string;
  provenance?: { provider: string; prompt: string; references: string[] };
};
export type VideoClip = {
  id: string;
  asset: string;
  at: number;
  in: number;
  out: number;
  gain: number;
  speed: number;
  opacity: number;
  fit: "contain" | "cover";
  x: number;
  y: number;
  scale: number;
  fadeIn: number;
  fadeOut: number;
  text?: string;
};
export type VideoTrack = {
  id: string;
  name: string;
  kind: "video" | "audio" | "caption";
  mute: boolean;
  hidden: boolean;
  clips: VideoClip[];
};
export type VideoProject = {
  version: 1;
  title: string;
  width: number;
  height: number;
  background: string;
  tracks: VideoTrack[];
};
export const id = () => crypto.randomUUID();
export const track = (kind: VideoTrack["kind"], name: string): VideoTrack => ({
  id: id(),
  kind,
  name,
  mute: false,
  hidden: false,
  clips: [],
});
export const blankProject = (): VideoProject => ({
  version: 1,
  title: "New video",
  width: 1280,
  height: 720,
  background: "#ffffff",
  tracks: [
    track("caption", "Captions"),
    track("video", "Video 1"),
    track("video", "Video 2"),
    track("audio", "Voice-over"),
    track("audio", "Music"),
  ],
});
export const length = (c: VideoClip) =>
  Math.max(0, c.out - c.in) / (c.speed || 1);
export const end = (c: VideoClip) => c.at + length(c);
export const duration = (p: VideoProject) =>
  Math.max(0, ...p.tracks.flatMap((t) => t.clips.map(end)));
export const active = (c: VideoClip, t: number) => t >= c.at && t < end(c);
export const fade = (c: VideoClip, t: number) =>
  Math.max(
    0,
    Math.min(
      1,
      c.fadeIn ? (t - c.at) / c.fadeIn : 1,
      c.fadeOut ? (end(c) - t) / c.fadeOut : 1,
    ),
  );
export const clipFor = (asset: VideoAsset, at: number): VideoClip => ({
  id: id(),
  asset: asset.id,
  at,
  in: 0,
  out: asset.duration || 5,
  gain: 1,
  speed: 1,
  opacity: 1,
  fit: "contain",
  x: 0.5,
  y: 0.5,
  scale: 1,
  fadeIn: 0,
  fadeOut: 0,
});
export function splitClip(c: VideoClip, t: number): VideoClip[] {
  if (t <= c.at + 0.02 || t >= end(c) - 0.02) return [c];
  const middle = c.in + (t - c.at) * (c.speed || 1);
  return [
    { ...c, out: middle, fadeOut: 0 },
    { ...c, id: id(), at: t, in: middle, fadeIn: 0 },
  ];
}
export function validProject(p: VideoProject): boolean {
  const finite = (v: number, min: number, max: number) =>
    Number.isFinite(v) && v >= min && v <= max;
  return (
    p?.version === 1 &&
    typeof p.title === "string" &&
    p.title.length <= 160 &&
    ["1280x720", "720x1280", "720x720"].includes(`${p.width}x${p.height}`) &&
    /^#[0-9a-f]{6}$/i.test(p.background) &&
    Array.isArray(p.tracks) &&
    p.tracks.length <= 30 &&
    p.tracks.every(
      (t) =>
        t != null &&
        typeof t.id === 'string' &&
        typeof t.name === 'string' &&
        typeof t.mute === 'boolean' &&
        typeof t.hidden === 'boolean' &&
        ["video", "audio", "caption"].includes(t.kind) &&
        Array.isArray(t.clips) &&
        t.clips.length <= 150 &&
        t.clips.every(
          (c) =>
            c != null &&
            typeof c.id === 'string' &&
            typeof c.asset === 'string' &&
            ['contain', 'cover'].includes(c.fit) &&
            finite(c.at, 0, 3600) &&
            finite(c.in, 0, 3600) &&
            finite(c.out, c.in + 0.02, 3600) &&
            finite(c.gain, 0, 2) &&
            finite(c.speed || 1, 0.25, 4) &&
            finite(c.opacity, 0, 1) &&
            finite(c.scale, 0.1, 4) &&
            finite(c.x, 0, 1) &&
            finite(c.y, 0, 1) &&
            finite(c.fadeIn, 0, length(c)) &&
            finite(c.fadeOut, 0, length(c)) &&
            (c.text === undefined || typeof c.text === 'string' && c.text.length <= 2000),
        ),
    ) &&
    duration(p) <= 3600 &&
    new Set(p.tracks.map(t => t.id)).size === p.tracks.length &&
    new Set(p.tracks.flatMap(t => t.clips.map(c => c.id))).size === p.tracks.reduce((n,t) => n+t.clips.length,0) &&
    new TextEncoder().encode(JSON.stringify(p)).byteLength < 700000
  );
}
export const time = (s: number) =>
  `${Math.floor(Math.max(0, s) / 60)}:${(Math.max(0, s) % 60).toFixed(1).padStart(4, "0")}`;
