import { planVideo } from "./planner.js";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { styleOf } from "./styles.js";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import { authorizeTeacher } from "../speech/access.js";
import { videoRequest, videoBody, runway, characterImage } from "./contract.js";
// Bind configured secrets independently of discovery-time feature flags.
// A runtime flag can enable video after discovery, but cannot inject an omitted secret.
const runwayKey = defineSecret("RUNWAYML_API_SECRET"),
  imageKey = defineSecret("OPENAI_API_KEY");
const DB = () => getFirestore();
const enabled = () => process.env.VIDEO_AI_ENABLED === "true";
const error = (code, message) => new HttpsError(code, message);
async function canRead(uid, a) {
  if (a.owner === uid || a.readers?.includes(uid)) return true;
  if (!a.org) return false;
  const o = await DB().doc(`orgs/${a.org}`).get();
  return !!o.get(`teachers.${uid}`);
}
async function reference(uid, id) {
  const s = await DB().doc(`videoAssets/${id}`).get(),
    a = s.data();
  if (
    !a?.ready ||
    !["character", "image"].includes(a.kind) ||
    !(await canRead(uid, a))
  )
    throw error("permission-denied", "That reference is not available to you.");
  if (
    !/^image\/(png|jpeg|webp)$/.test(a.type) ||
    a.parts > 28 ||
    a.size > 12 * 1024 * 1024
  )
    throw error("invalid-argument", "Use reference images up to 12 MB.");
  const chunks = [];
  let size = 0;
  for (let i = 0; i < a.parts; i++) {
    const p = await s.ref.collection("parts").doc(String(i)).get();
    if (!p.exists) throw error("not-found", "A reference image is incomplete.");
    const part = Buffer.from(p.get("data"), "base64");
    size += part.length;
    if (size > 12 * 1024 * 1024)
      throw error("invalid-argument", "Use reference images up to 12 MB.");
    chunks.push(part);
  }
  return `data:${a.type};base64,${Buffer.concat(chunks).toString("base64")}`;
}
async function store(uid, name, kind, bytes, type, duration, provenance) {
  if (bytes.length > 100 * 1024 * 1024)
    throw error("resource-exhausted", "The generated file is too large.");
  const ref = DB().collection("videoAssets").doc(),
    part = 450 * 1024,
    parts = Math.ceil(bytes.length / part);
  await ref.set({
    owner: uid,
    ownerName: "",
    name,
    kind,
    type,
    size: bytes.length,
    parts,
    duration,
    description: provenance.prompt,
    voice: provenance.voice || "",
    visualStyle: provenance.visualStyle || "3d-cartoon",
    org: "",
    readers: [],
    createdAt: Date.now(),
    ready: false,
    provenance,
  });
  for (let i = 0; i < parts; i++)
    await ref
      .collection("parts")
      .doc(String(i))
      .set({
        data: bytes.subarray(i * part, (i + 1) * part).toString("base64"),
        size: Math.min(part, bytes.length - i * part),
      });
  await ref.update({ ready: true });
  return ref.id;
}
async function reserve(uid, d) {
  const db = DB(),
    job = db.doc(`videoJobs/${uid}_${d.requestId}`),
    day = new Date().toISOString().slice(0, 10),
    usage = db.doc(`videoUsage/${day}/teachers/${uid}`),
    global = db.doc(`videoUsage/${day}`);
  return db.runTransaction(async (tx) => {
    const [j, u, g] = await Promise.all([
      tx.get(job),
      tx.get(usage),
      tx.get(global),
    ]);
    if (j.exists) return { ref: job, existing: j.data() };
    const seconds = d.action === "generate" ? d.duration : 0,
      images = seconds || d.action === "plan" ? 0 : 1,
      plans = d.action === "plan" ? 1 : 0;
    const next = {
        seconds: (u.get("seconds") || 0) + seconds,
        plans: (u.get("plans") || 0) + plans,
        images: (u.get("images") || 0) + images,
      },
      all = {
        seconds: (g.get("seconds") || 0) + seconds,
        plans: (g.get("plans") || 0) + plans,
        images: (g.get("images") || 0) + images,
      };
    if (
      next.seconds > Number(process.env.VIDEO_DAILY_SECONDS || 120) ||
      next.images > 10 || next.plans > 10 || all.plans > 100 ||
      all.seconds > Number(process.env.VIDEO_GLOBAL_DAILY_SECONDS || 1200) ||
      all.images > 100
    )
      throw error(
        "resource-exhausted",
        "Today’s video allowance has been used. Your saved media still works.",
      );
    tx.set(usage, next);
    tx.set(global, all);
    tx.set(job, {
      uid,
      action: d.action,
      status: "starting",
      createdAt: Date.now(),
      prompt: d.prompt,
      name: d.name,
      duration: d.duration,
      references: d.references,
      visualStyle: d.visualStyle,
      voice: d.voice,
    });
    return { ref: job };
  });
}
// One credentialed server boundary. No provider keys or arbitrary download URLs from clients.
export const videoStudio = onCall(
  {
    region: "us-central1",
    secrets: [runwayKey, imageKey],
    maxInstances: 3,
    concurrency: 1,
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (req) => {
    const uid = await authorizeTeacher(req);
    let d;
    try {
      d = videoRequest(req.data);
    } catch (e) {
      throw error("invalid-argument", e.message);
    }
    if (d.action === "status")
      return {
        enabled: enabled(),
        plannerEnabled: process.env.VIDEO_PLANNING_ENABLED !== "false",
        model: "gen4.5",
        usdPerSecond: 0.12,
        maxSeconds: 10,
        imageModel: "gpt-image-2.5-sunburst",
      };
    if (d.action === "share") {
      const ref = DB().doc(`videoAssets/${d.assetId}`),
        a = (await ref.get()).data();
      if (a?.owner !== uid)
        throw error("permission-denied", "Only the owner can change sharing.");
      if (d.org) {
        const o = await DB().doc(`orgs/${d.org}`).get();
        if (!o.get(`teachers.${uid}`))
          throw error("permission-denied", "Choose your own organisation.");
      }
      for (const other of d.readers) {
        const [c, p] = await Promise.all([
          DB().doc(`users/${uid}/colleagues/${other}`).get(),
          DB().doc(`users/${other}`).get(),
        ]);
        let orgMate = false;
        if (!c.exists) {
          const acc = await DB().doc(`accounts/${uid}`).get(),
            org = acc.get("org");
          if (org) {
            const o = await DB().doc(`orgs/${org}`).get();
            orgMate =
              !!o.get(`teachers.${uid}`) && !!o.get(`teachers.${other}`);
          }
        }
        if ((!c.exists && !orgMate) || p.get("role") !== "teacher")
          throw error(
            "permission-denied",
            "Choose teachers from your colleagues list or organisation.",
          );
      }
      await ref.update({ org: d.org, readers: d.readers });
      return { saved: true };
    }
    if (["poll", "cancel"].includes(d.action)) {
      const ref = DB().doc(`videoJobs/${uid}_${d.jobId}`);
      let j = (await ref.get()).data();
      if (!j || j.uid !== uid)
        throw error("not-found", "That generation is not available.");
      if (["complete", "failed", "cancelled"].includes(j.status))
        return {
          status: j.status,
          assetId: j.assetId || "",
          message: j.message || "",
          ...(j.plan ? {plan:j.plan} : {}),
        };
      if (j.action === "plan") return {status:j.status,plan:j.plan || null,message:j.message || ""};
      if (!j.providerId) return { status: "starting" };
      if (d.action === "cancel") {
        await runway(
          runwayKey.value(),
          `tasks/${encodeURIComponent(j.providerId)}`,
          undefined,
          "DELETE",
        );
        await ref.update({ status: "cancelled" });
        return { status: "cancelled" };
      }
      let result;
      try {
        result = await runway(
          runwayKey.value(),
          `tasks/${encodeURIComponent(j.providerId)}`,
        );
      } catch (e) {
        throw error("unavailable", e.message);
      }
      if (["FAILED", "CANCELLED"].includes(result.status)) {
        await ref.update({
          status: result.status === "FAILED" ? "failed" : "cancelled",
          message:
            "The service could not make this scene. Your project is unchanged.",
        });
        return {
          status: "failed",
          message:
            "The service could not make this scene. Your project is unchanged.",
        };
      }
      if (result.status !== "SUCCEEDED")
        return { status: "working", progress: result.progress ?? 0 };
      // Lock finalisation so overlapping polls cannot create duplicate library assets.
      const locked = await DB().runTransaction(async (tx) => {
        const s = await tx.get(ref);
        j = s.data();
        if (j.assetId || (j.importingAt && Date.now() - j.importingAt < 300000))
          return false;
        tx.update(ref, { importingAt: Date.now() });
        return true;
      });
      if (!locked)
        return {
          status: j.assetId ? "complete" : "working",
          assetId: j.assetId || "",
        };
      try {
        const url = result.output?.[0];
        if (typeof url !== "string" || !url.startsWith("https://"))
          throw Error("No video returned.");
        const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
        if (
          !r.ok ||
          Number(r.headers.get("content-length")) > 100 * 1024 * 1024
        )
          throw Error("Could not download generated video.");
        const chunks = [];
        let size = 0;
        for await (const chunk of r.body) {
          size += chunk.length;
          if (size > 100 * 1024 * 1024) throw Error("The video is too large.");
          chunks.push(chunk);
        }
        const assetId = await store(
          uid,
          j.name || "AI scene",
          "video",
          Buffer.concat(chunks),
          "video/mp4",
          j.duration,
          {
            provider: "Runway",
            prompt: j.prompt,
            references: j.references,
            visualStyle: j.visualStyle,
          },
        );
        await ref.update({ status: "complete", assetId, importingAt: 0 });
        return { status: "complete", assetId };
      } catch (e) {
        await ref.update({ importingAt: 0 });
        throw error(
          "unavailable",
          "We couldn’t save that scene yet. Check again; generation will not be charged again.",
        );
      }
    }
    if (d.action === "plan") {
      if (process.env.VIDEO_PLANNING_ENABLED === "false") throw error("failed-precondition","Video planning is not connected yet.");
      const characters=[];
      for (const id of d.references) {
        const a=(await DB().doc(`videoAssets/${id}`).get()).data();
        if (!a?.ready || a.kind !== "character" || !(await canRead(uid,a))) throw error("permission-denied","That character is not available to you.");
        characters.push({name:String(a.name||"").slice(0,100),appearance:String(a.description||"").slice(0,1500)});
      }
      const reservation=await reserve(uid,d);
      if(reservation.existing)return {jobId:d.requestId,status:reservation.existing.status,plan:reservation.existing.plan||null};
      try {
        const plan=await planVideo(imageKey.value(),d.brief,styleOf(d.visualStyle).prompt,characters);
        await reservation.ref.update({status:"complete",plan});
        return {jobId:d.requestId,status:"complete",plan};
      } catch {
        await reservation.ref.update({status:"failed",message:"The scene plan could not be drafted. Your existing script is kept."});
        throw error("unavailable","The scene plan could not be drafted. Your existing script is kept.");
      }
    }
    if (!enabled())
      throw error(
        "failed-precondition",
        "AI video creation has not been connected yet. Uploads and editing still work.",
      );
    const references = await Promise.all(
      d.references.map((id) => reference(uid, id)),
    );
    if (references.reduce((sum, r) => sum + r.length, 0) > 32 * 1024 * 1024)
      throw error("invalid-argument", "Use a smaller set of reference images.");
    if (d.action === "generate" && references.length > 1)
      throw error(
        "invalid-argument",
        "Make a scene image from your characters first, then animate that image.",
      );
    const reservation = await reserve(uid, d);
    if (reservation.existing)
      return {
        jobId: d.requestId,
        status: reservation.existing.status,
        assetId: reservation.existing.assetId || "",
      };
    try {
      if (d.action === "generate") {
        const result = await runway(
          runwayKey.value(),
          references.length ? "image_to_video" : "text_to_video",
          videoBody({
            ...d,
            prompt: `${styleOf(d.visualStyle).prompt} ${d.prompt}`,
            image: references[0],
          }),
        );
        if (!result.id) throw Error("No generation identifier returned.");
        await reservation.ref.update({
          status: "working",
          providerId: result.id,
        });
        return { jobId: d.requestId, status: "working" };
      }
      const prompt =
        d.action === "character"
          ? `Original educational character reference. ${styleOf(d.visualStyle).prompt} ${d.prompt}. Full body, clean simple background. Keep distinctive design details. No text or logos.`
          : `Create a single wide scene for animation: ${styleOf(d.visualStyle).prompt} ${d.prompt}. Preserve the exact character designs from the reference images. No extra text or logos.`;
      const bytes = await characterImage(imageKey.value(), prompt, references);
      const assetId = await store(
        uid,
        d.name || "Character",
        d.action === "character" ? "character" : "image",
        bytes,
        "image/png",
        5,
        {
          provider: "OpenAI",
          prompt: d.prompt,
          references: d.references,
          visualStyle: d.visualStyle,
          voice: d.voice,
        },
      );
      await reservation.ref.update({ status: "complete", assetId });
      return { jobId: d.requestId, status: "complete", assetId };
    } catch (e) {
      await reservation.ref.update({ status: "failed", message: e.message });
      throw e instanceof HttpsError ? e : error("unavailable", e.message);
    }
  },
);

// Persist finished outputs even when the teacher closes the editor.
export const refreshVideoJobs = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "us-central1",
    secrets: [runwayKey],
    maxInstances: 1,
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    const working = await DB()
      .collection("videoJobs")
      .where("status", "==", "working")
      .limit(5)
      .get();
    for (const job of working.docs) {
      const j = job.data();
      try {
        await videoStudio.run({
          auth: { uid: j.uid, token: {} },
          data: { action: "poll", jobId: job.id.slice(j.uid.length + 1) },
        });
      } catch (e) {
        console.warn(
          "Video finalisation waiting",
          job.id,
          e.code || "unavailable",
        );
      }
    }
    const starting = await DB()
      .collection("videoJobs")
      .where("status", "==", "starting")
      .limit(20)
      .get();
    for (const job of starting.docs)
      if (Date.now() - job.get("createdAt") > 15 * 60 * 1000)
        await job.ref.update({
          status: "failed",
          message:
            "The connection stopped before the generation could be confirmed. Check your library before trying again.",
        });
  },
);

