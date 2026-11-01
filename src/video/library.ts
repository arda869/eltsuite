import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, db } from "../lib/firebase";
import type { VideoAsset, VideoProject } from "./model";
const assets = collection(db, "videoAssets");
const PART = 450 * 1024;
export const videoCall = async <T = Record<string, unknown>>(
  data: Record<string, unknown>,
): Promise<T> =>
  (
    await httpsCallable<Record<string, unknown>, T>(
      getFunctions(app, "us-central1"),
      "videoStudio",
      { timeout: 310000 },
    )(data)
  ).data;
export function useVideoLibrary(uid: string, org: string) {
  const [items, setItems] = useState<VideoAsset[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!uid) return;
    const groups = new Map<number, VideoAsset[]>();
    const queries = [
      query(assets, where("owner", "==", uid)),
      query(assets, where("readers", "array-contains", uid)),
      ...(org ? [query(assets, where("org", "==", org))] : []),
    ];
    const off = queries.map((q, i) =>
      onSnapshot(
        q,
        (s) => {
          groups.set(
            i,
            s.docs.map((d) => {
              const a=d.data();
              return {...a,id:d.id,name:typeof a.name==='string'?a.name:'Media',ownerName:typeof a.ownerName==='string'?a.ownerName:'Teacher',description:typeof a.description==='string'?a.description:'',voice:typeof a.voice==='string'?a.voice:'',visualStyle:typeof a.visualStyle==='string'?a.visualStyle:'3d-cartoon',duration:Number.isFinite(a.duration)?a.duration:0,createdAt:Number.isFinite(a.createdAt)?a.createdAt:0} as VideoAsset;
            }),
          );
          setItems(
            [
              ...new Map(
                [...groups.values()]
                  .flat()
                  .filter((a) => a.ready===true && ['video','audio','image','character'].includes(a.kind))
                  .map((a) => [a.id, a]),
              ).values(),
            ].sort((a, b) => b.createdAt - a.createdAt),
          );
          setError("");
        },
        () =>
          setError(
            "We couldn’t open the video library. Your project is still here.",
          ),
      ),
    );
    return () => off.forEach((f) => f());
  }, [uid, org]);
  return { items, error };
}
export async function saveAsset(
  blob: Blob,
  meta: Omit<
    VideoAsset,
    "id" | "parts" | "size" | "type" | "ready" | "createdAt"
  >,
  progress?: (n: number) => void,
) {
  if (!blob.size || blob.size > 100 * 1024 * 1024)
    throw Error("Choose a file up to 100 MB.");
  const ref = doc(assets),
    bytes = new Uint8Array(await blob.arrayBuffer()),
    parts = Math.ceil(bytes.length / PART);
  await setDoc(ref, {
    ...meta,
    parts,
    size: blob.size,
    type: blob.type,
    ready: false,
    createdAt: Date.now(),
  });
  try {
    for (let k = 0; k < parts; k++) {
      const chunk = bytes.subarray(k * PART, (k + 1) * PART);
      let data = "";
      for (let j = 0; j < chunk.length; j += 32768)
        data += String.fromCharCode(...chunk.subarray(j, j + 32768));
      await setDoc(doc(ref, "parts", String(k)), {
        data: btoa(data),
        size: chunk.length,
      });
      progress?.((k + 1) / parts);
    }
    await updateDoc(ref, { ready: true });
    return ref.id;
  } catch (e) {
    const cleanup = writeBatch(db);
    for (let i = 0; i < parts; i++)
      cleanup.delete(doc(ref, "parts", String(i)));
    cleanup.delete(ref);
    await cleanup.commit().catch(() => {});
    throw e;
  }
}
export async function assetBlob(id: string) {
  const ref = doc(assets, id),
    s = await getDoc(ref);
  if (!s.exists() || !s.data().ready)
    throw Error("This media is no longer available.");
  const a = s.data() as VideoAsset,
    chunks: Uint8Array[] = [];
  if(!Number.isSafeInteger(a.parts)||a.parts<1||a.parts>228)throw Error('This media file is incomplete.');
  for (let i = 0; i < a.parts; i++) {
    const p = await getDoc(doc(ref, "parts", String(i)));
    if (!p.exists()) throw Error("A part of this file is missing.");
    chunks.push(Uint8Array.from(atob(p.data().data), (c) => c.charCodeAt(0)));
  }
  return new Blob(chunks as BlobPart[], { type: a.type });
}
export async function shareAsset(
  asset: VideoAsset,
  org: string,
  readers: string[],
) {
  await videoCall({ action: "share", assetId: asset.id, org, readers });
}
export const saveProject = (uid: string, id: string, project: VideoProject) =>
  setDoc(doc(db, "users", uid, "videoProjects", id), {
    project,
    updatedAt: Date.now(),
  });
export async function loadProject(
  uid: string,
  id: string,
): Promise<VideoProject | null> {
  return (
    (await getDoc(doc(db, "users", uid, "videoProjects", id))).data()
      ?.project ?? null
  );
}
export async function listProjects(uid: string) {
  return (await getDocs(collection(db, "users", uid, "videoProjects"))).docs
    .map((d) => ({
      id: d.id,
      title: d.data().project?.title || "Video",
      updatedAt: d.data().updatedAt || 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function removeAsset(asset: VideoAsset) {
  const batch = writeBatch(db);
  for (let i = 0; i < asset.parts; i++)
    batch.delete(doc(db, "videoAssets", asset.id, "parts", String(i)));
  batch.delete(doc(db, "videoAssets", asset.id));
  await batch.commit();
}
export async function mediaInfo(
  file: Blob,
): Promise<{ duration: number; kind: "video" | "audio" | "image" }> {
  const kind = file.type.startsWith("video/")
    ? "video"
    : file.type.startsWith("audio/")
      ? "audio"
      : file.type.startsWith("image/")
        ? "image"
        : null;
  if (!kind) throw Error("Choose a video, sound or picture file.");
  if (kind === "image") return { duration: 5, kind };
  const url = URL.createObjectURL(file),
    el = document.createElement(kind);
  try {
    return await new Promise((resolve, reject) => {
      let finished = false;
      const fail = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(
          Error("This file could not be opened. Try MP4, WebM, MP3 or WAV."),
        );
      };
      const finish = () => {
        if (finished || !Number.isFinite(el.duration) || el.duration <= 0)
          return;
        finished = true;
        clearTimeout(timer);
        el.duration <= 3600
          ? resolve({ duration: el.duration, kind })
          : reject(Error("Choose media up to one hour."));
      };
      const timer = setTimeout(fail, 15000);
      el.onloadedmetadata = () => {
        if (Number.isFinite(el.duration)) finish();
        else {
          el.ontimeupdate = finish;
          el.ondurationchange = finish;
          try {
            el.currentTime = 1e10;
          } catch {
            fail();
          }
        }
      };
      el.onerror = fail;
      el.src = url;
    });
  } finally {
    el.onloadedmetadata = null;
    el.ondurationchange = null;
    el.ontimeupdate = null;
    el.onerror = null;
    el.removeAttribute("src");
    el.load();
    URL.revokeObjectURL(url);
  }
}
