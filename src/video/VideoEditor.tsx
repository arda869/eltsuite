import { StudioDivider, useStudioPanels } from "./StudioPanels";
import { UiIcon } from "../components/UiIcon";
import { VideoDialog } from "./VideoDialog";
import { VideoButton, VIDEO_SHORTCUTS } from "./VideoButton";
import { assembleScenes, detachAudio, insertPause, rippleDelete } from "./operations";
import { decodeSound, toMono } from "../lib/sound";
import { transcribeRecording } from "../lib/speech";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
  Link,
} from "react-router-dom";
import { updateDoc } from "firebase/firestore";
import { useAuth } from "../lib/auth";
import { useMyOrg } from "../lib/admin";
import { useColleagues } from "../lib/sharing";
import { appAt, setAppFavicon } from "../components/AppGrid";
import { SuiteMark } from "../components/Wordmark";
import { mediaDoc } from "../lib/media";
import {
  archiveAdd,
  archiveGet,
  loadManifest,
  soundUrl,
  saveSound,
} from "../lib/archive";
import {
  blankProject,
  clipFor,
  duration,
  end,
  id as newId,
  length,
  splitClip,
  time,
  track,
  validProject,
  type VideoAsset,
  type VideoClip,
  type VideoProject,
  type VideoTrack,
} from "./model";
import {
  assetBlob,
  listProjects,
  loadProject,
  mediaInfo,
  saveAsset,
  saveProject,
  shareAsset,
  useVideoLibrary,
  videoCall,
} from "./library";
import { VideoEngine } from "./engine";
import { AssetPreview, CharacterLibrary } from "./CharacterLibrary";
import { AIVideo } from "./AIVideo";
import "./video.css";
type Props = {
  initialFile?: File;
  classId?: string;
  onSaved?: (s: { mediaId: string; archiveId: string; title: string }) => void;
  onBack?: () => void;
};
export function VideoEditor({ initialFile, classId, onSaved, onBack }: Props) {
  useEffect(() => {
    const previous = document.title;
    document.title = "Video editor · ELT Suite";
    setAppFavicon(appAt("/studio/video"));
    return () => {
      document.title = previous;
      setAppFavicon(null);
    };
  }, []);
  const { user, profile } = useAuth(),
    uid = user?.uid || "",
    org = useMyOrg(),
    colleagues = useColleagues(uid);
  const { id: routeId } = useParams();
  const [search] = useSearchParams();
  const importArchive = search.get("archive");
  const navigate = useNavigate();
  const clipboard = useRef<{
    clip: VideoClip;
    kind: VideoTrack["kind"];
  } | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [projectId] = useState(() =>
    !initialFile && routeId && routeId !== "new" ? routeId : newId(),
  );
  const [p, setP] = useState<VideoProject>(blankProject),
    [ready, setReady] = useState(false),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState("media"),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [head, setHead] = useState(0),
    [playing, setPlaying] = useState(false),
    [selected, setSelected] = useState(""),
    [selectedTrack, setSelectedTrack] = useState(""),
    [zoom, setZoom] = useState(36),
    [enabled, setEnabled] = useState(false),
    [plannerEnabled, setPlannerEnabled] = useState(false),
    [exportProgress, setExportProgress] = useState<number | null>(null),
    [projects, setProjects] = useState<{ id: string; title: string }[]>([]),
    [sharing, setSharing] = useState<VideoAsset | null>(null),
    [shareOrg, setShareOrg] = useState(false),
    [readers, setReaders] = useState<string[]>([]);
  const panels = useStudioPanels(
    p.tracks.some((t) => t.clips.some((c) => c.id === selected)),
  );
  const { items: assets, error: libraryError } = useVideoLibrary(
    uid,
    org?.id || "",
  );
  const sourceInput = useRef<HTMLInputElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<VideoEngine>(),
    past = useRef<VideoProject[]>([]),
    future = useRef<VideoProject[]>([]),
    projectRef = useRef(p),
    dirtyRef = useRef(dirty),
    initialized = useRef(false);
  projectRef.current = p;
  dirtyRef.current = dirty;
  const say = (s: string) => setMessage(s);
  const ownerName = profile?.displayName || "Teacher";
  useEffect(() => {
    if (!uid) return;
    let gone = false;
    void (async () => {
      try {
        if (!initialFile && routeId && routeId !== "new") {
          const saved = await loadProject(uid, routeId);
          if (!saved || !validProject(saved)) {
            say(
              "This video project could not be opened. Return to the library and choose another project.",
            );
            return;
          }
          if (!gone) setP(saved);
        }
        if (!gone) setReady(true);
        setProjects(await listProjects(uid));
        const status = await videoCall<{
          enabled: boolean;
          plannerEnabled?: boolean;
          simulated?: boolean;
        }>({ action: "status" });
        if (!gone) {
          setEnabled(status.enabled);
          setPlannerEnabled(!!status.plannerEnabled);
          setSimulated(!!status.simulated);
        }
      } catch (e) {
        if (!gone) {
          say((e as Error).message);
          setReady(true);
        }
      }
    })();
    return () => {
      gone = true;
    };
  }, [uid, projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready || !canvas.current) return;
    const e = new VideoEngine(
      canvas.current,
      projectRef.current,
      assetBlob,
      setHead,
      () => setPlaying(false),
      say,
    );
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = undefined;
    };
  }, [ready]);
  useEffect(() => {
    engine.current?.update(p);
  }, [p]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  const edit = (next: VideoProject, remember = true) => {
    if (exportProgress !== null) return;
    engine.current?.pause();
    if (!validProject(next))
      return say(
        "Keep the project under one hour, with up to 30 tracks. Check the clip times.",
      );
    if (remember) {
      past.current.push(projectRef.current);
      past.current = past.current.slice(-60);
      future.current = [];
    }
    setP(next);
    setDirty(true);
  };
  const undo = () => {
    const prev = past.current.pop();
    if (prev) {
      future.current.push(p);
      setP(prev);
      setDirty(true);
    }
  };
  const redo = () => {
    const next = future.current.pop();
    if (next) {
      past.current.push(p);
      setP(next);
      setDirty(true);
    }
  };
  const setClip = (patch: Partial<VideoClip>) => {
    const a = assets.find(
      (a) =>
        a.id ===
        projectRef.current.tracks
          .flatMap((t) => t.clips)
          .find((c) => c.id === selected)?.asset,
    );
    if (
      patch.out !== undefined &&
      a &&
      ["video", "audio"].includes(a.kind) &&
      patch.out > a.duration + 0.01
    )
      return say("The clip cannot extend past the end of its source.");
    edit({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === selected ? { ...c, ...patch } : c)),
      })),
    });
  };
  const picked = p.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === selected),
    pickedTrack = p.tracks.find((t) => t.clips.some((c) => c.id === selected)),
    pickedAsset = assets.find((a) => a.id === picked?.asset);
  const addAsset = (a: VideoAsset) => {
    const current = projectRef.current;
    const kind = a.kind === "audio" ? "audio" : "video",
      target =
        current.tracks.find((t) => t.id === selectedTrack && t.kind === kind) ||
        current.tracks.find((t) => t.kind === kind);
    if (!target) return;
    const at = Math.max(0, ...target.clips.map(end)),
      clip = clipFor(a, at);
    edit({
      ...current,
      tracks: current.tracks.map((t) =>
        t.id === target.id ? { ...t, clips: [...t.clips, clip] } : t,
      ),
    });
    setSelected(clip.id);
    setSelectedTrack(target.id);
  };
  const upload = async (files: File[], addToProject = false) => {
    engine.current?.pause();
    setBusy("Uploading media…");
    say("");
    try {
      for (const f of files) {
        const info = await mediaInfo(f);
        const id = await saveAsset(
          f,
          {
            owner: uid,
            ownerName,
            name: f.name,
            kind: info.kind,
            duration: info.duration,
            description: "",
            voice: "",
            org: "",
            readers: [],
          },
          (n) => setBusy(`Uploading ${f.name} · ${Math.round(n * 100)}%`),
        );
        say(`${f.name} is in your media library.`);
        if ((initialFile && f === initialFile) || addToProject) {
          const asset = {
            id,
            owner: uid,
            ownerName,
            name: f.name,
            kind: info.kind,
            duration: info.duration,
            type: f.type,
            size: f.size,
            parts: 1,
            description: "",
            voice: "",
            org: "",
            readers: [],
            createdAt: Date.now(),
            ready: true,
          };
          const clip = clipFor(asset, 0);
          setP((cur) => ({
            ...cur,
            title: f.name.replace(/\.[^.]+$/, ""),
            tracks: cur.tracks.map((t) =>
              t.id === cur.tracks.find((x) => x.kind === "video")?.id
                ? { ...t, clips: [clip] }
                : t,
            ),
          }));
          setDirty(true);
        }
      }
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    if (ready && initialFile && !initialized.current) {
      initialized.current = true;
      void upload([initialFile]);
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready || !importArchive || initialized.current || !uid) return;
    initialized.current = true;
    setBusy("Opening your video…");
    void (async () => {
      try {
        const archived = await archiveGet(uid, importArchive);
        if (!archived?.home || archived.kind !== "video" || archived.link)
          throw Error("Upload the original video file to edit it.");
        const manifest = await loadManifest(
          archived.home.classId,
          archived.home.mediaId,
        );
        if (!manifest || manifest.kind === "link")
          throw Error("This video is not available for editing.");
        const url = await soundUrl(
          archived.home.classId,
          archived.home.mediaId,
          manifest,
        );
        const response = await fetch(url);
        if (!response.ok) throw Error("We couldn’t open this video.");
        const blob = await response.blob();
        await upload(
          [new File([blob], archived.name, { type: blob.type })],
          true,
        );
      } catch (e) {
        say((e as Error).message);
        setBusy("");
      }
    })();
  }, [ready, importArchive, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (move = true) => {
    say("");
    setBusy("Saving project…");
    const snapshot = p;
    try {
      await saveProject(uid, projectId, snapshot);
      if (projectRef.current === snapshot) setDirty(false);
      if (move && !onBack && routeId === "new")
        navigate(`/studio/video/${projectId}`, { replace: true });
      setProjects(await listProjects(uid));
      return true;
    } catch {
      say("We couldn’t save the project. Keep this tab open and try again.");
      return false;
    } finally {
      setBusy("");
    }
  };
  const play = () => {
    if (playing) {
      engine.current?.pause();
      setPlaying(false);
    } else {
      setPlaying(true);
      void engine.current?.play(head >= duration(p) ? 0 : head).catch((e) => {
        setPlaying(false);
        say(e.message);
      });
    }
  };
  const remove = () => {
    if (!picked) return;
    edit({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== selected),
      })),
    });
    setSelected("");
  };
  const split = () => {
    if (!picked) return;
    edit({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.flatMap((c) =>
          c.id === selected ? splitClip(c, head) : [c],
        ),
      })),
    });
  };
  const drag = (
    e: ReactPointerEvent,
    c: VideoClip,
    tr: VideoTrack,
    mode: "move" | "in" | "out",
  ) => {
    if (exportProgress !== null) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget.closest("button") as HTMLButtonElement | null)?.focus();
    setSelected(c.id);
    setSelectedTrack(tr.id);
    engine.current?.pause();
    const start = e.clientX,
      original = projectRef.current;
    const source = assets.find((a) => a.id === c.asset);
    const speed = c.speed || 1;
    past.current.push(original);
    future.current = [];
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - start) / zoom;
      let next = { ...c };
      let to = tr.id;
      if (mode === "move") {
        next.at = Math.max(0, Math.round((c.at + dt) * 10) / 10);
        const over = (
          document.elementFromPoint(
            ev.clientX,
            ev.clientY,
          ) as HTMLElement | null
        )?.closest<HTMLElement>("[data-vtrack]")?.dataset.vtrack;
        if (original.tracks.find((t) => t.id === over && t.kind === tr.kind))
          to = over!;
      }
      if (mode === "in") {
        const shift = Math.max(
          -Math.min(c.in / speed, c.at),
          Math.min(length(c) - 0.05, dt),
        );
        next = { ...c, in: c.in + shift * speed, at: c.at + shift };
      }
      if (mode === "out")
        next.out = Math.max(
          c.in + 0.05,
          Math.min(source?.duration || 3600, c.out + dt * speed),
        );
      next.fadeIn = Math.min(next.fadeIn, length(next));
      next.fadeOut = Math.min(next.fadeOut, length(next));
      const project = {
        ...original,
        tracks: original.tracks.map((t) => ({
          ...t,
          clips: [
            ...t.clips.filter((x) => x.id !== c.id),
            ...(t.id === to ? [next] : []),
          ],
        })),
      };
      if (validProject(project)) {
        setP(project);
        setDirty(true);
      }
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };
  const exportVideo = async (saveToLibrary: boolean) => {
    if (!engine.current) return;
    setExportProgress(0);
    say("");
    try {
      const blob = await engine.current.export(setExportProgress);
      if (saveToLibrary && blob.size > 100 * 1024 * 1024)
        throw Error(
          "This export is over 100 MB. Download it, or shorten the video before saving it to the library.",
        );
      if (saveToLibrary) {
        setBusy("Saving the finished video…");
        const space = classId || `user:${uid}`,
          result = await saveSound(space, blob, {
            title: p.title,
            duration: duration(p),
          });
        await updateDoc(mediaDoc(space, result.mediaId), { video: true });
        const archiveId = await archiveAdd(uid, {
          name: p.title,
          kind: "video",
          folder: "",
          tags: [],
          size: blob.size,
          home: { classId: space, mediaId: result.mediaId },
          duration: duration(p),
        });
        const assetId = await saveAsset(blob, {
          owner: uid,
          ownerName,
          name: p.title,
          kind: "video",
          duration: duration(p),
          description: "Edited video",
          voice: "",
          org: "",
          readers: [],
        });
        say(
          `Finished video saved to your resources library and video library.`,
        );
        onSaved?.({ mediaId: result.mediaId, archiveId, title: p.title });
        void assetId;
      } else {
        const url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = `${p.title.replace(/[\\/:*?"<>|]/g, "-")}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        say("Video exported.");
      }
    } catch (e) {
      say((e as Error).message);
    } finally {
      setExportProgress(null);
      setBusy("");
    }
  };
  const captionSource = async () => {
    engine.current?.pause();
    if (!picked?.asset) return;
    const sourceClip = picked;
    setBusy("Making captions…");
    try {
      const buffer = await decodeSound(await assetBlob(sourceClip.asset));
      const samples = toMono(buffer).slice(
        Math.floor(sourceClip.in * buffer.sampleRate),
        Math.floor(sourceClip.out * buffer.sampleRate),
      );
      const segments = (
        await transcribeRecording(samples, buffer.sampleRate)
      ).map((s) => ({
        ...s,
        start: s.start + sourceClip.in,
        end: s.end + sourceClip.in,
      }));
      const target = track("caption", "Auto captions");
      target.clips = segments
        .filter((s) => s.end > sourceClip.in && s.start < sourceClip.out)
        .map((s) => ({
          ...clipFor(
            {
              id: "",
              duration:
                (Math.min(s.end, sourceClip.out) -
                  Math.max(s.start, sourceClip.in)) /
                (sourceClip.speed || 1),
            } as VideoAsset,
            sourceClip.at +
              (Math.max(s.start, sourceClip.in) - sourceClip.in) /
                (sourceClip.speed || 1),
          ),
          text: s.text,
          y: 0.85,
        }));
      if (
        !projectRef.current.tracks.some((t) =>
          t.clips.some(
            (c) =>
              c.id === sourceClip.id &&
              c.in === sourceClip.in &&
              c.out === sourceClip.out &&
              c.at === sourceClip.at &&
              c.speed === sourceClip.speed,
          ),
        )
      )
        throw Error(
          "The source changed while captions were being made. Select it and try again.",
        );
      edit({
        ...projectRef.current,
        tracks: [target, ...projectRef.current.tracks],
      });
      say(
        "Captions added. Check the wording and timing before using the video.",
      );
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const freezeFrame = async () => {
    engine.current?.pause();
    if (!canvas.current) return;
    setBusy("Saving pause frame…");
    try {
      const at = head,
        snapshot = projectRef.current;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (b) =>
            b ? resolve(b) : reject(Error("Could not capture this frame.")),
          "image/png",
        ),
      );
      const asset = await saveAsset(blob, {
        owner: uid,
        ownerName,
        name: "Pause frame",
        kind: "image",
        duration: 3,
        description: "Freeze frame",
        voice: "",
        org: "",
        readers: [],
      });
      if (projectRef.current !== snapshot)
        throw Error("The project changed. Capture the frame again.");
      edit(insertPause(snapshot, at, asset));
      say(
        "A three-second pause and question have been added. Edit the question in Clip settings.",
      );
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const addCaption = () => {
    const target = p.tracks.find((t) => t.kind === "caption");
    if (!target) return;
    const c = {
      ...clipFor({ id: "", duration: 4 } as VideoAsset, head),
      text: "Your caption",
      y: 0.85,
    };
    edit({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === target.id ? { ...t, clips: [...t.clips, c] } : t,
      ),
    });
    setSelected(c.id);
  };
  const record = async () => {
    engine.current?.pause();
    setBusy("Recording voice-over…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream),
        chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!alive.current) return;
        const blob = new Blob(chunks, { type: r.mimeType });
        void upload([new File([blob], "Voice-over.webm", { type: blob.type })]);
      };
      r.start();
      recorder.current = r;
      setBusy("Recording… Press Stop recording when finished.");
    } catch {
      say("We couldn’t start the microphone. Check browser permissions.");
      setBusy("");
    }
  };
  const recorder = useRef<MediaRecorder>();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const r = recorder.current;
      if (r?.state === "recording") {
        r.onstop = null;
        r.stop();
        r.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);
  const duplicate = () => {
    if (picked)
      edit({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === pickedTrack?.id
            ? {
                ...t,
                clips: [
                  ...t.clips,
                  { ...picked, id: newId(), at: end(picked) },
                ],
              }
            : t,
        ),
      });
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowShortcuts(false);
        setSharing(null);
        setLeaving(false);
        document
          .querySelectorAll(".vx details.vx-tools-menu[open]")
          .forEach((el) => el.removeAttribute("open"));
        return;
      }
      if (
        showShortcuts ||
        sharing ||
        leaving ||
        (e.target as HTMLElement).closest("[role=dialog]")
      )
        return;
      const mod = e.metaKey || e.ctrlKey,
        k = e.key.toLowerCase(),
        field = (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        );
      if (mod && k === "s") {
        e.preventDefault();
        if (!busy && exportProgress === null) void save();
        return;
      }
      if (field || busy || exportProgress !== null) return;
      let handled = true;
      if (mod && k === "z") e.shiftKey ? redo() : undo();
      else if (mod && k === "b") split();
      else if (mod && k === "d") duplicate();
      else if (mod && (k === "c" || k === "x")) {
        if (picked && pickedTrack) {
          clipboard.current = {
            clip: structuredClone(picked),
            kind: pickedTrack.kind,
          };
          if (k === "x") remove();
        }
      } else if (mod && k === "v") {
        const copy = clipboard.current;
        if (copy) {
          const target =
            p.tracks.find(
              (t) => t.id === selectedTrack && t.kind === copy.kind,
            ) || p.tracks.find((t) => t.kind === copy.kind);
          if (target) {
            const clip = { ...copy.clip, id: newId(), at: head };
            edit({
              ...p,
              tracks: p.tracks.map((t) =>
                t.id === target.id ? { ...t, clips: [...t.clips, clip] } : t,
              ),
            });
            setSelected(clip.id);
          }
        }
      } else if (mod && k === "y") redo();
      else if (mod && k === "e") void exportVideo(false);
      else if (e.key === " ") {
        const button = (e.target as HTMLElement).closest("button");
        if (button && !button.classList.contains("vx-clip")) return;
        play();
      } else if (e.key === "Home") engine.current?.seek(0);
      else if (e.key === "End") engine.current?.seek(duration(p));
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight")
        engine.current?.seek(
          head + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 0.1),
        );
      else if (e.key === "Delete" || e.key === "Backspace")
        e.shiftKey ? edit(rippleDelete(p, selected)) : remove();
      else if (!mod && k === "c") addCaption();
      else if (!mod && k === "m") {
        const target =
          pickedTrack || p.tracks.find((t) => t.id === selectedTrack);
        if (target)
          edit({
            ...p,
            tracks: p.tracks.map((t) =>
              t.id === target.id ? { ...t, mute: !t.mute } : t,
            ),
          });
      } else if (!mod && k === "v") setTab("media");
      else if (!mod && k === "g") setTab("characters");
      else if (!mod && k === "a") setTab("ai");
      else if (e.key === "+" || e.key === "=")
        setZoom((z) => Math.min(160, z + 8));
      else if (e.key === "-") setZoom((z) => Math.max(8, z - 8));
      else if (e.key === "?") setShowShortcuts(true);
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const exit = () => {
    if (onBack) onBack();
    else navigate("/archive");
  };
  const finish = () => {
    if (dirty) setLeaving(true);
    else exit();
  };
  const timelineWidth = Math.max(900, (duration(p) + 10) * zoom);
  const locked = !!busy || exportProgress !== null;
  return (
    <div className="daw sx vx" aria-label="Video editor" style={panels.style}>
      <header className="sx-bar">
        <Link
          to="/archive"
          className="sx-suite"
          onClick={(e) => {
            e.preventDefault();
            finish();
          }}
        >
          <SuiteMark app="Video editor" color="#487d87" iconKey="video" dark />
        </Link>
        <span className="sx-sep" />
        <input
          className="sx-name"
          aria-label="Video name"
          value={p.title}
          maxLength={160}
          onChange={(e) => edit({ ...p, title: e.target.value })}
        />
        {simulated && (
          <span
            className="vx-test-badge"
            title="AI generation is simulated in this local test preview."
          >
            Test preview
          </span>
        )}
        <span className="vx-status" role="status">
          {dirty
            ? "Unsaved changes"
            : routeId === "new"
              ? "New project"
              : "Saved"}
        </span>
        <span className="sx-acts">
          <VideoButton
            className="sx-act"
            icon="videoKeyboard"
            shortcut="?"
            onClick={() => setShowShortcuts(true)}
          >
            Shortcuts
          </VideoButton>
          <VideoButton
            className="sx-act primary"
            icon="check"
            aria-label="Save project"
            shortcut="⌘/Ctrl S"
            disabled={!ready || locked}
            onClick={() => void save()}
          >
            Save
          </VideoButton>
          <VideoButton
            disabled={!ready || locked || !duration(p)}
            onClick={() => void exportVideo(false)}
            className="sx-act"
            aria-label="Export video"
          >
            Export
          </VideoButton>
          <VideoButton
            disabled={!ready || locked || !duration(p)}
            onClick={() => void exportVideo(true)}
            className="sx-act"
            icon="archive"
            aria-label="Save finished video"
          >
            Add to library
          </VideoButton>
          <VideoButton
            className="sx-act"
            icon="prev"
            onClick={finish}
            disabled={locked}
          >
            Done
          </VideoButton>
        </span>
      </header>
      {(message || libraryError) && (
        <div role="status" className="vx-message">
          {message || libraryError}
          <VideoButton onClick={() => say("")} aria-label="Dismiss message">
            ×
          </VideoButton>
        </div>
      )}
      {exportProgress !== null && (
        <div className="vx-message">
          Exporting · {Math.round(exportProgress * 100)}% · Keep this tab
          visible.
          <progress max={1} value={exportProgress} />
          <VideoButton onClick={() => engine.current?.cancelExport()}>
            Cancel export
          </VideoButton>
        </div>
      )}
      <div className={"vx-workspace" + (picked ? "" : " no-selection")}>
        <aside className="vx-left">
          <div role="tablist" aria-label="Video tools" className="vx-tabs">
            {[
              ["media", "Media"],
              ["characters", "Characters"],
              ["ai", "Make with AI"],
            ].map(([k, label]) => (
              <VideoButton
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
              >
                {label}
              </VideoButton>
            ))}
          </div>
          <div className="vx-side-body">
            {tab === "media" && (
              <>
                <div className="vx-actions">
                  <VideoButton
                    disabled={locked}
                    onClick={() => sourceInput.current?.click()}
                  >
                    Upload media
                  </VideoButton>
                  <VideoButton disabled={locked} onClick={() => void record()}>
                    Record voice-over
                  </VideoButton>
                  {recorder.current?.state === "recording" && (
                    <VideoButton onClick={() => recorder.current?.stop()}>
                      Stop recording
                    </VideoButton>
                  )}
                </div>
                <input
                  ref={sourceInput}
                  type="file"
                  multiple
                  accept="video/*,audio/*,image/*"
                  hidden
                  onChange={(e) => {
                    void upload(Array.from(e.target.files || []));
                    e.target.value = "";
                  }}
                />
                <p className="vx-help">
                  Add a file to the library, then place it on a track. Originals
                  stay unchanged.
                </p>
                <label>
                  Open a saved project
                  <select
                    value=""
                    disabled={dirty || locked}
                    onChange={(e) => {
                      if (e.target.value)
                        window.location.href = `/studio/video/${e.target.value}`;
                    }}
                  >
                    <option value="">Choose a project</option>
                    {projects.map((x) => (
                      <option value={x.id} key={x.id}>
                        {x.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="vx-asset-grid">
                  {assets
                    .filter((a) => a.kind !== "character")
                    .map((a) => (
                      <article key={a.id}>
                        <AssetPreview asset={a} />
                        <b>{a.name}</b>
                        <small>
                          {a.kind} · {time(a.duration)}
                        </small>
                        <VideoButton
                          disabled={locked}
                          onClick={() => addAsset(a)}
                        >
                          Add to timeline
                        </VideoButton>
                        {a.owner === uid && (
                          <VideoButton
                            onClick={() => {
                              setSharing(a);
                              setShareOrg(!!a.org);
                              setReaders(a.readers);
                            }}
                          >
                            Share
                          </VideoButton>
                        )}
                      </article>
                    ))}
                </div>
              </>
            )}
            {tab === "characters" && (
              <CharacterLibrary
                uid={uid}
                ownerName={ownerName}
                assets={assets}
                colleagues={colleagues || []}
                org={org}
                enabled={enabled}
                onError={say}
                onReady={() => say("")}
              />
            )}
            {tab === "ai" && (
              <AIVideo
                uid={uid}
                ownerName={ownerName}
                assets={assets}
                onAdd={addAsset}
                plannerEnabled={plannerEnabled}
                onAssemble={(scenes,title) => {
                  const next=assembleScenes(projectRef.current,scenes,title);
                  if(!validProject(next)) throw Error("This sequence does not fit the project. Make room in your timeline first.");
                  edit(next); say("Your scenes, narration and question cards are on the timeline. Save your project when ready.");
                }}
                onError={say}
                enabled={enabled}
              />
            )}
          </div>
        </aside>
        <StudioDivider
          label="Resize media library"
          orientation="vertical"
          value={panels.sizes.library}
          min={180}
          max={panels.limits.library}
          onChange={(n) => panels.change("library", n)}
          onReset={() => panels.change("library", 280)}
        />
        <main className="vx-centre">
          <div className="vx-preview">
            {!duration(p) && (
              <div className="vx-preview-empty">
                <UiIcon name="video" size={34} />
                <b>Your video preview</b>
                <span>Upload media or choose Make with AI to start.</span>
              </div>
            )}
            <canvas
              ref={canvas}
              aria-label="Video preview"
              style={{ aspectRatio: `${p.width}/${p.height}` }}
            />
          </div>
          <div className="daw-transport vx-transport">
            <VideoButton
              disabled={!ready || locked || !duration(p)}
              onClick={play}
              className="daw-play"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "Pause" : "Play"}
            </VideoButton>
            <VideoButton
              className="daw-b"
              aria-label="To the start"
              disabled={exportProgress !== null}
              onClick={() => {
                engine.current?.pause();
                engine.current?.seek(0);
              }}
            >
              Start
            </VideoButton>
            <output className="daw-lcd">
              <b>{time(head)}</b>
              <span>/ {time(duration(p))}</span>
            </output>
            <label>
              Canvas
              <select
                value={`${p.width}x${p.height}`}
                disabled={locked}
                onChange={(e) => {
                  const [width, height] = e.target.value.split("x").map(Number);
                  edit({ ...p, width, height });
                }}
              >
                <option>1280x720</option>
                <option>720x1280</option>
                <option>720x720</option>
              </select>
            </label>
            <label>
              Background
              <input
                type="color"
                value={p.background}
                disabled={locked}
                onChange={(e) => edit({ ...p, background: e.target.value })}
              />
            </label>
          </div>
          <input
            type="range"
            aria-label="Playhead"
            min={0}
            max={Math.max(0.1, duration(p))}
            step={0.05}
            value={head}
            disabled={exportProgress !== null}
            onChange={(e) => engine.current?.seek(Number(e.target.value))}
          />
          <div className="vx-tools">
            <VideoButton
              disabled={!past.current.length || locked}
              onClick={undo}
            >
              Undo
            </VideoButton>
            <VideoButton
              disabled={!future.current.length || locked}
              onClick={redo}
            >
              Redo
            </VideoButton>
            <VideoButton disabled={!picked || locked} onClick={split}>
              Split at playhead
            </VideoButton>
            <VideoButton disabled={!picked || locked} onClick={remove}>
              Remove clip
            </VideoButton>
            <VideoButton disabled={locked} onClick={addCaption}>
              Add caption
            </VideoButton>
            <details
              className="vx-tools-menu"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  e.currentTarget.removeAttribute("open");
              }}
            >
              <summary>
                <UiIcon name="more" size={16} />
                More tools
              </summary>
              <div
                className="vx-tools-pop"
                onClick={(e) =>
                  e.currentTarget.parentElement?.removeAttribute("open")
                }
              >
                <VideoButton
                  disabled={
                    locked ||
                    !picked?.asset ||
                    pickedTrack?.kind === "caption" ||
                    p.tracks.length >= 30
                  }
                  onClick={() => void captionSource()}
                >
                  Auto captions
                </VideoButton>
                <VideoButton
                  disabled={locked || !picked}
                  onClick={() => edit(rippleDelete(p, selected))}
                >
                  Ripple delete on track
                </VideoButton>
                <VideoButton
                  disabled={locked || !picked}
                  onClick={() => {
                    if (picked)
                      edit({
                        ...p,
                        tracks: p.tracks.map((t) =>
                          t.id === pickedTrack?.id
                            ? {
                                ...t,
                                clips: [
                                  ...t.clips,
                                  { ...picked, id: newId(), at: end(picked) },
                                ],
                              }
                            : t,
                        ),
                      });
                  }}
                >
                  Duplicate
                </VideoButton>
                <VideoButton
                  disabled={
                    locked ||
                    pickedTrack?.kind !== "video" ||
                    !picked?.asset ||
                    pickedAsset?.kind !== "video"
                  }
                  onClick={() => edit(detachAudio(p, selected))}
                >
                  Detach audio
                </VideoButton>
                <VideoButton
                  disabled={locked || !duration(p) || p.tracks.length > 28}
                  onClick={() => void freezeFrame()}
                >
                  Pause for a question
                </VideoButton>
                <VideoButton icon="settings" onClick={panels.reset}>
                  Reset panel layout
                </VideoButton>
              </div>
            </details>
            <label>
              Timeline zoom
              <input
                type="range"
                min={8}
                max={160}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
          </div>
        </main>
        {picked && (
          <StudioDivider
            label="Resize clip settings"
            orientation="vertical"
            value={panels.sizes.inspector}
            min={180}
            max={panels.limits.inspector}
            direction={-1}
            onChange={(n) => panels.change("inspector", n)}
            onReset={() => panels.change("inspector", 240)}
          />
        )}
        <aside className="vx-inspector">
          <h2>Clip settings</h2>
          {picked ? (
            <div className="vx-fields">
              <b>
                {picked.text ? "Caption" : pickedAsset?.name || "Media clip"}
              </b>
              {picked.text !== undefined && (
                <label>
                  Caption
                  <textarea
                    value={picked.text}
                    rows={3}
                    maxLength={2000}
                    onChange={(e) => setClip({ text: e.target.value })}
                  />
                </label>
              )}
              <ClipNumber
                label="Timeline start"
                value={picked.at}
                disabled={locked}
                change={(v) => setClip({ at: v })}
              />
              <ClipNumber
                label="Duration"
                value={length(picked)}
                disabled={locked}
                change={(v) =>
                  setClip({ out: picked.in + v * (picked.speed || 1) })
                }
              />
              {picked.text === undefined && (
                <>
                  <label>
                    Playback speed
                    <select
                      value={picked.speed || 1}
                      disabled={locked}
                      onChange={(e) =>
                        setClip({
                          speed: Number(e.target.value),
                          fadeIn: 0,
                          fadeOut: 0,
                        })
                      }
                    >
                      {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((v) => (
                        <option value={v} key={v}>
                          {v}×
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Volume · {Math.round(picked.gain * 100)}%
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={picked.gain}
                      disabled={locked}
                      onChange={(e) =>
                        setClip({ gain: Number(e.target.value) })
                      }
                    />
                  </label>
                </>
              )}
              {pickedTrack?.kind === "video" && (
                <label>
                  Frame
                  <select
                    value={picked.fit}
                    disabled={locked}
                    onChange={(e) =>
                      setClip({ fit: e.target.value as VideoClip["fit"] })
                    }
                  >
                    <option value="contain">Fit whole picture</option>
                    <option value="cover">Crop to fill</option>
                  </select>
                </label>
              )}
              <details className="vx-inspector-more">
                <summary>Position and fades</summary>
                <ClipNumber
                  label="Scale"
                  value={picked.scale}
                  disabled={locked}
                  change={(v) => setClip({ scale: v })}
                />
                <ClipNumber
                  label="Opacity"
                  value={picked.opacity}
                  disabled={locked}
                  change={(v) => setClip({ opacity: v })}
                />
                <ClipNumber
                  label="Horizontal position"
                  value={picked.x}
                  disabled={locked}
                  change={(v) => setClip({ x: v })}
                />
                <ClipNumber
                  label="Vertical position"
                  value={picked.y}
                  disabled={locked}
                  change={(v) => setClip({ y: v })}
                />
                <ClipNumber
                  label="Fade in"
                  value={picked.fadeIn}
                  disabled={locked}
                  change={(v) => setClip({ fadeIn: v })}
                />
                <ClipNumber
                  label="Fade out"
                  value={picked.fadeOut}
                  disabled={locked}
                  change={(v) => setClip({ fadeOut: v })}
                />
              </details>
              <details className="vx-inspector-more">
                <summary>Source and track</summary>
                <ClipNumber
                  label="Source in"
                  value={picked.in}
                  disabled={locked}
                  change={(v) => setClip({ in: v })}
                />
                <ClipNumber
                  label="Source out"
                  value={picked.out}
                  disabled={locked}
                  change={(v) => setClip({ out: v })}
                />
                <label>
                  Move to track
                  <select
                    value={pickedTrack?.id}
                    disabled={locked}
                    onChange={(e) => {
                      edit({
                        ...p,
                        tracks: p.tracks.map((t) => ({
                          ...t,
                          clips: [
                            ...t.clips.filter((c) => c.id !== selected),
                            ...(t.id === e.target.value ? [picked] : []),
                          ],
                        })),
                      });
                      setSelectedTrack(e.target.value);
                    }}
                  >
                    {p.tracks
                      .filter((t) => t.kind === pickedTrack?.kind)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
              </details>
            </div>
          ) : (
            <p className="vx-help">
              Select a clip to trim, crop, position or fade it. Drag a clip to
              move it; drag either edge to trim.
            </p>
          )}
        </aside>
      </div>
      <StudioDivider
        label="Resize timeline"
        orientation="horizontal"
        value={panels.sizes.timeline}
        min={150}
        max={panels.limits.timeline}
        direction={-1}
        onChange={(n) => panels.change("timeline", n)}
        onReset={() =>
          panels.change("timeline", Math.round(window.innerHeight * 0.32))
        }
      />
      <section className="vx-timeline" aria-label="Video timeline">
        <div className="vx-ruler" style={{ width: timelineWidth + 168 }}>
          <div className="vx-track-head">
            Tracks · upper layers appear in front
          </div>
          <div
            className="vx-ruler-lane"
            onClick={(e) =>
              engine.current?.seek(
                Math.max(
                  0,
                  (e.clientX - e.currentTarget.getBoundingClientRect().left) /
                    zoom,
                ),
              )
            }
          >
            {Array.from(
              { length: Math.ceil(timelineWidth / (zoom * 5)) },
              (_, i) => (
                <span key={i} style={{ left: i * zoom * 5 }}>
                  {time(i * 5)}
                </span>
              ),
            )}
          </div>
        </div>
        {p.tracks.map((t, index) => (
          <div
            key={t.id}
            className={"vx-track" + (selectedTrack === t.id ? " chosen" : "")}
            data-vtrack={t.id}
            style={{ width: timelineWidth + 168 }}
          >
            <div className="vx-track-head">
              <input
                aria-label={`Track name ${index + 1}`}
                value={t.name}
                onChange={(e) =>
                  edit({
                    ...p,
                    tracks: p.tracks.map((tr) =>
                      tr.id === t.id ? { ...tr, name: e.target.value } : tr,
                    ),
                  })
                }
              />
              <div>
                <VideoButton
                  aria-pressed={t.mute}
                  aria-label={`Mute ${t.name}`}
                  onClick={() =>
                    edit({
                      ...p,
                      tracks: p.tracks.map((tr) =>
                        tr.id === t.id ? { ...tr, mute: !tr.mute } : tr,
                      ),
                    })
                  }
                >
                  M
                </VideoButton>
                <VideoButton
                  aria-pressed={t.hidden}
                  aria-label={`Hide ${t.name}`}
                  onClick={() =>
                    edit({
                      ...p,
                      tracks: p.tracks.map((tr) =>
                        tr.id === t.id ? { ...tr, hidden: !tr.hidden } : tr,
                      ),
                    })
                  }
                >
                  Hide
                </VideoButton>
                <VideoButton
                  disabled={index === 0}
                  aria-label={`Move ${t.name} up`}
                  onClick={() => {
                    const tracks = [...p.tracks];
                    [tracks[index - 1], tracks[index]] = [
                      tracks[index],
                      tracks[index - 1],
                    ];
                    edit({ ...p, tracks });
                  }}
                >
                  ↑
                </VideoButton>
              </div>
            </div>
            <div
              className="vx-lane"
              tabIndex={0}
              role="group"
              aria-label={`${t.name} clips`}
              onFocus={() => setSelectedTrack(t.id)}
              onClick={(e) => {
                setSelectedTrack(t.id);
                if (e.target === e.currentTarget) e.currentTarget.focus();
              }}
            >
              {t.clips.map((c) => (
                <VideoButton
                  key={c.id}
                  className={`vx-clip ${t.kind}${c.id === selected ? " picked" : ""}`}
                  style={{
                    left: c.at * zoom,
                    width: Math.max(10, length(c) * zoom),
                  }}
                  onClick={() => {
                    setSelected(c.id);
                    setSelectedTrack(t.id);
                  }}
                  onPointerDown={(e) => drag(e, c, t, "move")}
                  aria-label={`${c.text || assets.find((a) => a.id === c.asset)?.name || "Clip"} at ${time(c.at)}`}
                >
                  <span
                    className="vx-trim left"
                    onPointerDown={(e) => drag(e, c, t, "in")}
                  />
                  <span>
                    {c.text ||
                      assets.find((a) => a.id === c.asset)?.name ||
                      "Media"}
                    <small>{time(length(c))}</small>
                  </span>
                  <span
                    className="vx-trim right"
                    onPointerDown={(e) => drag(e, c, t, "out")}
                  />
                </VideoButton>
              ))}
              <span className="vx-head" style={{ left: head * zoom }} />
            </div>
          </div>
        ))}
        <div className="vx-actions vx-add-track">
          {(["video", "audio", "caption"] as const).map((kind) => (
            <VideoButton
              key={kind}
              disabled={locked || p.tracks.length >= 30}
              onClick={() =>
                edit({
                  ...p,
                  tracks: [
                    ...p.tracks,
                    track(
                      kind,
                      `${kind[0].toUpperCase() + kind.slice(1)} ${p.tracks.filter((t) => t.kind === kind).length + 1}`,
                    ),
                  ],
                })
              }
            >
              Add {kind} track
            </VideoButton>
          ))}
        </div>
      </section>
      <footer className="vx-shortcut-hint">
        Space · Play / pause <span>⌘/Ctrl B · Split</span>
        <span>C · Caption</span>
        <span className="vx-footer-help">? · Keyboard shortcuts</span>
      </footer>
      {leaving && (
        <VideoDialog
          name="Save your video project"
          onClose={() => setLeaving(false)}
        >
          <h2>Save your project?</h2>
          <p>
            Save your edits before leaving, or discard the changes since your
            last save. Uploaded media stays in your library.
          </p>
          <div className="vx-actions">
            <VideoButton
              disabled={!!busy}
              onClick={async () => {
                if (await save(false)) exit();
              }}
            >
              Save and leave
            </VideoButton>
            <VideoButton disabled={!!busy} onClick={exit}>
              Discard changes
            </VideoButton>
            <VideoButton disabled={!!busy} onClick={() => setLeaving(false)}>
              Keep editing
            </VideoButton>
          </div>
        </VideoDialog>
      )}
      {showShortcuts && (
        <VideoDialog
          name="Video editor keyboard shortcuts"
          onClose={() => setShowShortcuts(false)}
        >
          <h2>Keyboard shortcuts</h2>
          <p className="vx-help">
            Shortcuts work while editing the timeline. Typing fields keep their
            normal keys. Use ⌘ on Mac or Ctrl on Windows.
          </p>
          <dl className="vx-shortcuts">
            {VIDEO_SHORTCUTS.map(([keys, action]) => (
              <div key={keys}>
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
          <VideoButton onClick={() => setShowShortcuts(false)}>
            Close
          </VideoButton>
        </VideoDialog>
      )}
      {busy && (
        <div role="status" className="vx-busy">
          {busy}
        </div>
      )}
      {sharing && (
        <VideoDialog
          name={`Share ${sharing.name}`}
          onClose={() => setSharing(null)}
        >
          <h2>Share {sharing.name}</h2>
          {org && (
            <label>
              <input
                type="checkbox"
                checked={shareOrg}
                onChange={(e) => setShareOrg(e.target.checked)}
              />
              Share with {org.name}
            </label>
          )}
          <fieldset>
            <legend>Colleagues</legend>
            {(colleagues || []).map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={readers.includes(c.id)}
                  onChange={(e) =>
                    setReaders((r) =>
                      e.target.checked
                        ? [...r, c.id]
                        : r.filter((x) => x !== c.id),
                    )
                  }
                />
                {c.name}
              </label>
            ))}
          </fieldset>
          <VideoButton
            disabled={!!busy}
            onClick={async () => {
              setBusy("Saving sharing…");
              try {
                await shareAsset(
                  sharing,
                  shareOrg && org ? org.id : "",
                  readers,
                );
                setSharing(null);
              } catch (e) {
                say((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
          >
            Save sharing
          </VideoButton>
          <VideoButton onClick={() => setSharing(null)}>Cancel</VideoButton>
        </VideoDialog>
      )}
    </div>
  );
}

function ClipNumber({
  label,
  value,
  change,
  disabled,
}: {
  label: string;
  value: number;
  change: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        step={0.1}
        min={0}
        value={Number(value.toFixed(3))}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value !== "") change(Number(e.target.value));
        }}
      />
    </label>
  );
}
