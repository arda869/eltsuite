import { VideoDialog } from "./VideoDialog";
import { VideoButton } from "./VideoButton";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { VIDEO_STYLES } from "../../functions/video/styles.js";
import { useEffect, useRef, useState } from "react";
import { assetBlob, saveAsset, shareAsset, videoCall } from "./library";
import type { VideoAsset } from "./model";
import type { Colleague } from "../lib/sharing";
export function AssetPreview({ asset }: { asset: VideoAsset }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let gone = false,
      u = "";
    void assetBlob(asset.id)
      .then((b) => {
        if (gone) return;
        u = URL.createObjectURL(b);
        setUrl(u);
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [asset.id]);
  if (!url)
    return (
      <span className="vx-thumb">
        {asset.kind === "character" ? "Character" : asset.kind}
      </span>
    );
  return asset.kind === "video" ? (
    <video className="vx-thumb" src={url} muted preload="metadata" />
  ) : asset.kind === "audio" ? (
    <span className="vx-thumb">Audio</span>
  ) : (
    <img className="vx-thumb" src={url} alt={asset.name} />
  );
}
export function CharacterLibrary({
  uid,
  ownerName,
  assets,
  colleagues,
  org,
  onError,
  onReady,
  enabled,
}: {
  uid: string;
  ownerName: string;
  assets: VideoAsset[];
  colleagues: Colleague[];
  org: { id: string; name: string } | null;
  onError: (s: string) => void;
  onReady: (id: string) => void;
  enabled: boolean;
}) {
  const [view, setView] = useState("");
  const [visualStyle, setVisualStyle] = useState("3d-cartoon");
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [voice, setVoice] = useState(""),
    [busy, setBusy] = useState(""),
    [selected, setSelected] = useState("");
  const [sharing, setSharing] = useState<VideoAsset | null>(null),
    [shareOrg, setShareOrg] = useState(false),
    [readers, setReaders] = useState<string[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const chosen = assets.find((a) => a.id === selected);
  const meta = {
    owner: uid,
    ownerName,
    name: name.trim() || "Character",
    kind: "character" as const,
    visualStyle,
    duration: 5,
    description,
    voice,
    org: "",
    readers: [],
  };
  const upload = async (f: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(f.type))
      return onError("Choose a PNG, JPEG or WebP character picture.");
    if (f.size > 12 * 1024 * 1024)
      return onError("Choose a reference image up to 12 MB.");
    setBusy("Saving the character…");
    try {
      const id = await saveAsset(f, meta);
      setSelected(id);
      onReady(id);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const generate = async () => {
    setBusy("Making the character…");
    try {
      const r = await videoCall<{ assetId: string }>({
        action: "character",
        requestId: crypto.randomUUID(),
        name: `${meta.name}${chosen && view ? " · " + view : ""}`.slice(0, 100),
        visualStyle,
        voice,
        prompt: [
          description,
          chosen && view
            ? `New reference view: ${view}. Preserve the same identity, colours and clothes.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        references: chosen ? [chosen.id] : [],
      });
      setSelected(r.assetId);
      onReady(r.assetId);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="vx-library">
      <p className="vx-help">
        Save a design once, then reuse it in each scene. Pick a saved design to
        make another view without replacing the original.
      </p>
      <div className="vx-fields">
        <label>
          Visual style
          <select
            aria-label="Visual style"
            value={visualStyle}
            onChange={(e) => setVisualStyle(e.target.value)}
          >
            {VIDEO_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <p className="vx-help">
          {VIDEO_STYLES.find((s) => s.id === visualStyle)?.detail}
        </p>
        <label>
          Character name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          Appearance and personality
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2800}
            rows={3}
            placeholder="A friendly fox with round glasses and a blue scarf…"
          />
        </label>
        <label>
          Voice notes
          <input
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            maxLength={200}
            placeholder="Warm voice, slow and clear"
          />
        </label>
      </div>
      {chosen && (
        <label className="vx-fields">
          New view or expression
          <input
            value={view}
            maxLength={120}
            placeholder="Side view, full body, happy expression…"
            onChange={(e) => setView(e.target.value)}
          />
        </label>
      )}
      <div className="vx-actions">
        <VideoButton
          disabled={!!busy || !name.trim()}
          onClick={() => file.current?.click()}
        >
          Upload a character
        </VideoButton>
        <VideoButton
          disabled={!!busy || !enabled || !description.trim() || !name.trim()}
          onClick={() => void generate()}
        >
          {chosen ? "Make another view" : "Make with AI"}
        </VideoButton>
        {chosen?.owner === uid && (
          <VideoButton
            disabled={!!busy}
            onClick={async () => {
              setBusy("Saving details…");
              try {
                await updateDoc(doc(db, "videoAssets", chosen.id), {
                  name,
                  description,
                  voice,
                });
                onReady(chosen.id);
              } catch (e) {
                onError((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
          >
            Save character details
          </VideoButton>
        )}
        {chosen && (
          <VideoButton onClick={() => setSelected("")}>
            Start a new design
          </VideoButton>
        )}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void upload(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {busy && <p role="status">{busy}</p>}
      <div className="vx-asset-grid">
        {assets
          .filter((a) => a.kind === "character")
          .map((a) => (
            <article key={a.id} className={selected === a.id ? "chosen" : ""}>
              <VideoButton
                className="vx-card"
                aria-pressed={selected === a.id}
                onClick={() => {
                  setSelected(a.id);
                  setName(a.name);
                  setDescription(a.description);
                  setVoice(a.voice);
                  setVisualStyle(a.visualStyle || "3d-cartoon");
                }}
              >
                <AssetPreview asset={a} />
                <b>{a.name}</b>
                <small>
                  {a.owner === uid
                    ? "Your character"
                    : `Shared by ${a.ownerName || "a colleague"}`}
                </small>
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
      {sharing && (
        <VideoDialog
          name={`Share ${sharing.name}`}
          onClose={() => setSharing(null)}
        >
          <h3>Share {sharing.name}</h3>
          <p>
            Colleagues can reuse this design. Only you can change its sharing.
          </p>
          {org && (
            <label>
              <input
                type="checkbox"
                checked={shareOrg}
                onChange={(e) => setShareOrg(e.target.checked)}
              />{" "}
              Share with {org.name}
            </label>
          )}
          <fieldset>
            <legend>Colleagues</legend>
            {colleagues.map((c) => (
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
          <div className="vx-actions">
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
                  onError((e as Error).message);
                } finally {
                  setBusy("");
                }
              }}
            >
              Save sharing
            </VideoButton>
            <VideoButton onClick={() => setSharing(null)}>Cancel</VideoButton>
          </div>
        </VideoDialog>
      )}
    </div>
  );
}
