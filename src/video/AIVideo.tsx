import { VideoBrief, type ReadyScene } from "./VideoBrief";
import { VideoButton } from "./VideoButton";
import { VIDEO_STYLES } from "../../functions/video/styles.js";
import { useEffect, useRef, useState } from "react";
import { mediaInfo, saveAsset, videoCall } from "./library";
import { encodeMp3 } from "../lib/audioEncode";
import { createSpeech } from "../lib/speech";
import type { VideoAsset } from "./model";
import { AssetPreview } from "./CharacterLibrary";
type Scene = {
  background: string;
  visualStyle: string;
  id: string;
  prompt: string;
  dialogue: string;
  duration: number;
  references: string[];
  image: string;
  job: string;
  asset: string;
  status: string;
};
const scene = (): Scene => ({
  background: "",
  visualStyle: "3d-cartoon",
  id: crypto.randomUUID(),
  prompt: "",
  dialogue: "",
  duration: 5,
  references: [],
  image: "",
  job: "",
  asset: "",
  status: "",
});
export function AIVideo({
  uid,
  ownerName,
  assets,
  onAdd,
  onError,
  enabled,
  plannerEnabled,
  startingImage,
  onStartingImageUsed,
  onAssemble,
}: {
  uid: string;
  ownerName: string;
  assets: VideoAsset[];
  onAdd: (a: VideoAsset) => void;
  onError: (s: string) => void;
  enabled: boolean;
  plannerEnabled:boolean;
  startingImage?: VideoAsset | null;
  onStartingImageUsed?: () => void;
  onAssemble:(scenes:ReadyScene[],title:string)=>void;
}) {
  const storageKey = `ll.videoScenes.${uid}`;
  const [mode, setMode] = useState("brief"),
    [draft, setDraft] = useState(""),
    [scenes, setScenes] = useState<Scene[]>(() => {
      try {
        return (
          JSON.parse(localStorage.getItem(storageKey) || "null") || [scene()]
        );
      } catch {
        return [scene()];
      }
    }),
    [busy, setBusy] = useState("");
  const timer = useRef(0);
  const startingUsed = useRef<VideoAsset | null>(null);
  useEffect(() => {
    if (!startingImage) {startingUsed.current=null;return;}
    if (startingUsed.current === startingImage) return;
    startingUsed.current = startingImage;
    setScenes(all => [{...scene(), background:startingImage.id, visualStyle:startingImage.visualStyle || "3d-cartoon"}, ...all]);
    setMode("prompt");
    onStartingImageUsed?.();
  }, [startingImage]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (id: string, p: Partial<Scene>) =>
    setScenes((all) => all.map((s) => (s.id === id ? { ...s, ...(['prompt','visualStyle','background','references','duration'].some(k=>k in p)?{asset:'',job:'',status:''}:{}), ...p } : s)));
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(scenes));
  }, [storageKey, scenes]);
  useEffect(() => {
    const pending = scenes.filter((s) => s.job && s.status === "working");
    if (!pending.length) return;
    timer.current = window.setTimeout(() => {
      void Promise.all(
        pending.map(async (s) => {
          try {
            const r = await videoCall<{
              status: string;
              assetId?: string;
              message?: string;
            }>({ action: "poll", jobId: s.job });
            patch(s.id, {
              status: r.status === "starting" ? "working" : r.status,
              asset: r.assetId || s.asset,
            });
            if (r.message) onError(r.message);
          } catch (e) {
            onError((e as Error).message);
          }
        }),
      );
    }, 5000);
    return () => clearTimeout(timer.current);
  }, [scenes]); // eslint-disable-line react-hooks/exhaustive-deps
  const perform = async (s: Scene, action: "scene" | "generate") => {
    setBusy(s.id);
    try {
      if (action === "scene") {
        const r = await videoCall<{ assetId: string }>({
          action,
          requestId: crypto.randomUUID(),
          name: `Scene reference`,
          prompt: `Create exactly one full-frame camera view, not a storyboard, collage, comic strip, split screen or sequence of panels. ${s.prompt}`,
          visualStyle: s.visualStyle,
          references: [
            ...s.references,
            ...(s.background ? [s.background] : []),
          ],
        });
        patch(s.id, { image: r.assetId });
      } else {
        const job = crypto.randomUUID();
        patch(s.id, { job, status: "working" });
        const r = await videoCall<{ status: string; assetId?: string }>({
          action,
          requestId: job,
          name: "AI scene",
          prompt: s.prompt,
          visualStyle: s.visualStyle,
          duration: s.duration,
          references: s.image
            ? [s.image]
            : [...s.references, ...(s.background ? [s.background] : [])],
        });
        patch(s.id, { job, status: r.status, asset: r.assetId || "" });
      }
    } catch (e) {
      patch(s.id, { status: "failed" });
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const voice = async (s: Scene) => {
    setBusy(s.id);
    try {
      const take = await createSpeech({
        text: s.dialogue,
        voice: "marin",
        accent: "British English",
        direction: "Speak clearly at a comfortable pace for young learners.",
      });
      const blob = await encodeMp3(take.samples, take.rate, "standard");
      const { duration } = await mediaInfo(blob);
      const id = await saveAsset(blob, {
        owner: uid,
        ownerName,
        name: "Scene voice-over",
        kind: "audio",
        duration,
        description: s.dialogue,
        voice: "marin",
        org: "",
        readers: [],
      });
      onAdd({
        id,
        owner: uid,
        ownerName,
        name: "Scene voice-over",
        kind: "audio",
        duration,
        type: blob.type,
        size: blob.size,
        parts: 1,
        description: s.dialogue,
        voice: "marin",
        org: "",
        readers: [],
        createdAt: Date.now(),
        ready: true,
      });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="vx-ai">
      <div className="vx-tabs" role="tablist" aria-label="AI creation method">
        {["brief", "prompt", "script"].map((m) => (
          <VideoButton
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
          >
            {m === "brief" ? "Brief → video" : m === "prompt" ? "Single scene" : "Manual scenes"}
          </VideoButton>
        ))}
      </div>
      {mode === "brief" ? <VideoBrief uid={uid} ownerName={ownerName} assets={assets} enabled={enabled} plannerEnabled={plannerEnabled} onError={onError} onAssemble={onAssemble}/> : <>
      {!enabled && (
        <p role="status" className="vx-notice">
          AI video creation needs its server connection set up. You can upload
          media, build scenes and edit your timeline now.
        </p>
      )}
      {mode === "script" && (
        <div className="vx-fields">
          <label>
            Script
            <textarea
              rows={5}
              value={draft}
              maxLength={12000}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="One paragraph per scene. Describe what happens, then edit the scene descriptions and dialogue below."
            />
          </label>
          <VideoButton
            disabled={
              !draft.trim() || scenes.some((s) => s.status === "working")
            }
            onClick={() => {
              setScenes(
                draft
                  .split(/\n\s*\n/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .slice(0, 20)
                  .map((p) => ({ ...scene(), prompt: p, dialogue: p })),
              );
            }}
          >
            Use script as scenes
          </VideoButton>
        </div>
      )}
      {scenes.map((s, i) => {
        const image = assets.find((a) => a.id === s.image),
          video = assets.find((a) => a.id === s.asset);
        return (
          <section key={s.id} className="vx-scene">
            <h3>Scene {i + 1}</h3>
            <div className="vx-fields">
              <label>
                Visual style
                <select
                  aria-label={`Visual style for scene ${i + 1}`}
                  value={s.visualStyle || "3d-cartoon"}
                  disabled={s.status === "working"}
                  onChange={(e) =>
                    patch(s.id, { visualStyle: e.target.value, image: "" })
                  }
                >
                  {VIDEO_STYLES.map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                What happens
                <textarea
                  aria-label="What happens"
                  value={s.prompt}
                  rows={3}
                  maxLength={2800}
                  disabled={s.status === "working"}
                  onChange={(e) =>
                    patch(s.id, { prompt: e.target.value, image: "" })
                  }
                />
              </label>
              <label>
                Length
                <select
                  value={s.duration}
                  disabled={s.status === "working"}
                  onChange={(e) =>
                    patch(s.id, { duration: Number(e.target.value) })
                  }
                >
                  <option value={5}>5 seconds</option>
                  <option value={10}>10 seconds</option>
                </select>
              </label>
            </div>
            <fieldset disabled={s.status === "working"}>
              <legend>Saved characters</legend>
              {assets
                .filter((a) => a.kind === "character")
                .map((a) => (
                  <label className="vx-ref" key={a.id}>
                    <input
                      type="checkbox"
                      checked={s.references.includes(a.id)}
                      onChange={(e) =>
                        patch(s.id, {
                          references: e.target.checked
                            ? [...s.references, a.id].slice(0, 12)
                            : s.references.filter((id) => id !== a.id),
                          image: "",
                          ...(e.target.checked && a.visualStyle
                            ? { visualStyle: a.visualStyle }
                            : {}),
                        })
                      }
                    />
                    {a.name}
                  </label>
                ))}
            </fieldset>
            <label className="vx-fields">
              Starting picture / background
              <select
                value={s.background || ""}
                disabled={s.status === "working"}
                onChange={(e) =>
                  patch(s.id, { background: e.target.value, image: "" })
                }
              >
                <option value="">No starting picture</option>
                {assets
                  .filter((a) => a.kind === "image")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            {image && (
              <div className="vx-scene-image">
                <AssetPreview asset={image} />
                <span>Approved scene image for animation</span>
              </div>
            )}
            <div className="vx-actions">
              <VideoButton
                disabled={
                  !enabled ||
                  !!busy ||
                  !s.prompt.trim() ||
                  s.status === "working"
                }
                onClick={() => void perform(s, "scene")}
              >
                {image ? "Remake still preview" : "Make still preview"}
              </VideoButton>
              <VideoButton
                disabled={
                  !enabled ||
                  !!busy ||
                  !s.prompt.trim() ||
                  s.status === "working" ||
                  (s.references.length + (s.background ? 1 : 0) > 1 && !s.image)
                }
                onClick={() => void perform(s, "generate")}
              >
                Generate moving video · ~US${(s.duration * 0.12).toFixed(2)}
              </VideoButton>
              {s.status === "working" && (
                <VideoButton
                  onClick={async () => {
                    try {
                      const r = await videoCall<{ status: string }>({
                        action: "cancel",
                        jobId: s.job,
                      });
                      patch(s.id, { status: r.status });
                    } catch (e) {
                      onError((e as Error).message);
                    }
                  }}
                >
                  Cancel generation
                </VideoButton>
              )}
            </div>
            <p className="vx-help">A still preview is a picture, not a video. Describe visible movement, then choose Generate moving video. For a storyboard or collage, make a single-frame still preview first so the whole grid is not animated.</p>
            {!s.prompt.trim() && <p className="vx-help">Describe what should move in “What happens” to generate a video.</p>}
            {s.references.length > 1 && !image && (
              <p className="vx-help">
                Make a scene image to place your characters together, then
                animate that image.
              </p>
            )}
            {s.status && (
              <p role="status">
                {s.status === "working"
                  ? "Making the scene… You can return later."
                  : s.status === "complete"
                    ? "Scene saved to your library."
                    : s.status === "failed"
                      ? "This scene could not be made. Your timeline is unchanged."
                      : s.status}
              </p>
            )}
            {video?.kind === "video" && (
              <VideoButton onClick={() => onAdd(video)}>
                Add scene to timeline
              </VideoButton>
            )}
            {mode === "script" && (
              <div className="vx-fields">
                <label>
                  Dialogue / voice-over
                  <textarea
                    value={s.dialogue}
                    rows={2}
                    maxLength={3000}
                    onChange={(e) => patch(s.id, { dialogue: e.target.value })}
                  />
                </label>
                <p className="vx-help">
                  Voice-over is added as a separate audio clip. It does not
                  guarantee matching mouth movements.
                </p>
                <VideoButton
                  disabled={!enabled || !!busy || !s.dialogue.trim()}
                  onClick={() => void voice(s)}
                >
                  Make voice-over
                </VideoButton>
              </div>
            )}
            <div className="vx-actions">
              <VideoButton
                disabled={i === 0 || s.status === "working"}
                onClick={() =>
                  setScenes((a) => {
                    const n = [...a];
                    [n[i - 1], n[i]] = [n[i], n[i - 1]];
                    return n;
                  })
                }
              >
                Move scene earlier
              </VideoButton>
              <VideoButton
                disabled={scenes.length === 1 || s.status === "working"}
                onClick={() => setScenes((a) => a.filter((x) => x.id !== s.id))}
              >
                Remove scene
              </VideoButton>
            </div>
          </section>
        );
      })}
      <VideoButton
        disabled={scenes.length >= 20}
        onClick={() => setScenes((a) => [...a, scene()])}
      >
        Add a scene
      </VideoButton>
      <p className="vx-help">
        Video estimates exclude scene-image and speech generation. Each new
        generation uses your AI allowance; replaying saved media does not.
      </p>
      </>}
    </div>
  );
}
