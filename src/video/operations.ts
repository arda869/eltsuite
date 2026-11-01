import {
  end,
  clipFor,
  id,
  length,
  splitClip,
  track,
  type VideoClip,
  type VideoProject,
} from "./model";
export function rippleDelete(p: VideoProject, clipId: string): VideoProject {
  const target = p.tracks.find((t) => t.clips.some((c) => c.id === clipId));
  const cut = target?.clips.find((c) => c.id === clipId);
  if (!cut) return p;
  // Ripple is explicitly on the selected track. Other tracks retain their timing.
  return {
    ...p,
    tracks: p.tracks.map((t) =>
      t.id !== target!.id
        ? t
        : {
            ...t,
            clips: t.clips
              .filter((c) => c.id !== clipId)
              .map((c) =>
                c.at >= end(cut)
                  ? { ...c, at: Math.max(0, c.at - length(cut)) }
                  : c,
              ),
          },
    ),
  };
}
export function detachAudio(p: VideoProject, clipId: string): VideoProject {
  const cut = p.tracks
    .filter((t) => t.kind === "video")
    .flatMap((t) => t.clips)
    .find((c) => c.id === clipId);
  if (!cut || !cut.asset) return p;
  const audio = track("audio", "Detached audio");
  audio.clips = [{ ...cut, id: id() }];
  return {
    ...p,
    tracks: [
      ...p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, gain: 0 } : c)),
      })),
      audio,
    ],
  };
}
export function insertPause(
  p: VideoProject,
  at: number,
  asset: string,
  seconds = 3,
): VideoProject {
  const image: VideoClip = {
    id: id(),
    asset,
    at,
    in: 0,
    out: seconds,
    speed: 1,
    gain: 0,
    opacity: 1,
    fit: "contain",
    x: 0.5,
    y: 0.5,
    scale: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
  const freeze = track("video", "Pause frame");
  freeze.clips = [image];
  const question = track("caption", "Pause question");
  question.clips = [
    { ...image, id: id(), asset: "", text: "What happens next?", y: 0.85 },
  ];
  const tracks = p.tracks.map((t) => ({
    ...t,
    clips: t.clips
      .flatMap((c) => (c.at < at && end(c) > at ? splitClip(c, at) : [c]))
      .map((c) => (c.at >= at ? { ...c, at: c.at + seconds } : c)),
  }));
  return { ...p, tracks: [question, freeze, ...tracks] };
}

export type SceneMedia = {video:import('./model').VideoAsset;image:import('./model').VideoAsset;audio?:import('./model').VideoAsset;question:string};
// Append one complete approved sequence in one undo step, with no narration over question cards.
export function assembleScenes(p:VideoProject, scenes:SceneMedia[], title:string):VideoProject {
  const pictures=track('video','AI scenes'), narration=track('audio','AI narration'), questions=track('caption','Question cards');
  let at=Math.max(0,...p.tracks.flatMap(t=>t.clips.map(end)));
  for(const s of scenes) {
    const video=clipFor(s.video,at);video.gain=s.audio?0:1;pictures.clips.push(video);
    if(s.audio)narration.clips.push(clipFor(s.audio,at));
    at=end(video);
    if(s.question.trim()) {
      pictures.clips.push({...clipFor(s.image,at),out:3,gain:0});
      questions.clips.push({...clipFor(s.image,at),asset:'',out:3,text:s.question});at+=3;
    }
  }
  return {...p,title:p.tracks.some(t=>t.clips.length)?p.title:title,tracks:[questions,pictures,narration,...p.tracks].filter(t=>t.clips.length||p.tracks.some(old=>old.id===t.id))};
}
