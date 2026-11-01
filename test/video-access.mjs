// Real Firestore emulator rules plus the actual callable handler. Provider HTTP is stubbed.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  collection,
  where,
  getDocs,
  terminate,
} from "firebase/firestore";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const admin = require("firebase-admin/app"),
  adminFs = require("firebase-admin/firestore");
const projectId = "demo-video-editor";
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8091";
const emulatorHost=process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT = projectId;
process.env.RUNWAYML_API_SECRET = "test-only";
process.env.OPENAI_API_KEY = "test-only";
process.env.VIDEO_AI_ENABLED = "false";
await fetch(
  `http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
  { method: "DELETE" },
);
admin.initializeApp({ projectId });
const adb = adminFs.getFirestore();
const { videoStudio } = await import("../functions/video/index.js");
const teacher = (id) => ({
  auth: { uid: id, token: { email: `${id}@example.test` } },
  data: {},
});
const call = (uid, data) => videoStudio.run({ ...teacher(uid), data });
for (const uid of ["owner", "colleague", "orgmate", "outsider", "paused"])
  await adb.doc(`users/${uid}`).set({ role: "teacher" });
await adb.doc("users/learner").set({ role: "learner" });
await adb.doc("accounts/paused").set({ suspended: true });
await adb.doc("orgs/org").set({
  teachers: { owner: { name: "Owner" }, orgmate: { name: "Org mate" } },
  adminEmails: [],
});
await adb
  .doc("orgs/foreign")
  .set({ teachers: { outsider: { name: "Other" } }, adminEmails: [] });
await adb.doc("accounts/owner").set({ org: "org" });
await adb.doc("users/owner/colleagues/colleague").set({ name: "Colleague" });
const asset = {
  owner: "owner",
  ownerName: "Owner",
  name: "Private reference",
  kind: "character",
  type: "image/png",
  size: 1,
  parts: 1,
  duration: 5,
  description: "Fox",
  voice: "",
  org: "",
  readers: [],
  createdAt: 1,
  ready: true,
};
await adb.doc("videoAssets/private").set(asset);
await adb.doc("videoAssets/private/parts/0").set({ data: "YQ==", size: 1 });
const clients = [];
function as(uid) {
  const app = initializeApp({ projectId }, uid);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, emulatorHost.split(":")[0], Number(emulatorHost.split(":")[1]), {
    mockUserToken: { sub: uid, email: `${uid}@example.test` },
  });
  clients.push({ app, db });
  return db;
}
let checks = 0;
const ok = async (name, fn) => {
  await fn();
  checks++;
  console.log("PASS", name);
};
const deny = (fn) =>
  assert.rejects(fn, (e) =>
    ["permission-denied", "unauthenticated"].includes(e.code),
  );
try {
  const owner = as("owner"),
    colleague = as("colleague"),
    orgmate = as("orgmate"),
    other = as("outsider"),
    learner = as("learner");
  await ok('upload parts are private, immutable and match the declared byte budget',async()=>{
    await setDoc(doc(owner,'videoAssets/client-upload'),{...asset,ready:false});
    await setDoc(doc(owner,'videoAssets/client-upload/parts/0'),{data:'YQ==',size:1});
    await deny(()=>setDoc(doc(owner,'videoAssets/client-upload/parts/1'),{data:'YQ==',size:1}));
    await deny(()=>setDoc(doc(owner,'videoAssets/client-upload/parts/00'),{data:'YQ==',size:1}));
    await deny(()=>updateDoc(doc(owner,'videoAssets/client-upload/parts/0'),{data:'Yg=='}));
    await deny(()=>setDoc(doc(owner,'videoAssets/wrong-parts'),{...asset,ready:false,parts:2}));
    await setDoc(doc(owner,'videoAssets/wrong-bytes'),{...asset,ready:false});
    await deny(()=>setDoc(doc(owner,'videoAssets/wrong-bytes/parts/0'),{data:'YWFh',size:1}));
    await adb.recursiveDelete(adb.doc('videoAssets/client-upload'));await adb.recursiveDelete(adb.doc('videoAssets/wrong-bytes'));
  });
  await ok(
    "private asset bytes and metadata denied to outsiders and learners",
    async () => {
      for (const db of [other, colleague, learner]) {
        await deny(() => getDoc(doc(db, "videoAssets/private")));
        await deny(() => getDoc(doc(db, "videoAssets/private/parts/0")));
      }
    },
  );
  await ok(
    "teacher can save/reload a private project, learner cannot create one",
    async () => {
      await setDoc(doc(owner, "users/owner/videoProjects/project"), {
        project: { version: 1, tracks: [] },
        updatedAt: 1,
      });
      assert(
        (
          await getDoc(doc(owner, "users/owner/videoProjects/project"))
        ).exists(),
      );
      await deny(() => getDoc(doc(other, "users/owner/videoProjects/project")));
      await deny(() =>
        setDoc(doc(learner, "users/learner/videoProjects/project"), {
          project: { version: 1, tracks: [] },
          updatedAt: 1,
        }),
      );
    },
  );
  await ok(
    "clients cannot forge sharing, ownership or generated jobs",
    async () => {
      await deny(() =>
        updateDoc(doc(owner, "videoAssets/private"), { readers: ["outsider"] }),
      );
      await deny(() =>
        updateDoc(doc(owner, "videoAssets/private"), { owner: "outsider" }),
      );
      await deny(() =>
        setDoc(doc(owner, "videoJobs/forged"), { uid: "owner" }),
      );
    },
  );
  await ok(
    "disabled provider makes no paid calls; suspended/learner accounts denied",
    async () => {
      assert.equal((await call("owner", { action: "status" })).enabled, false);
      await assert.rejects(
        call("owner", {
          action: "generate",
          requestId: "disabled-request",
          prompt: "A fox",
        }),
        (e) => e.code === "failed-precondition",
      );
      await deny(() => call("learner", { action: "status" }));
      await deny(() => call("paused", { action: "status" }));
    },
  );
  await ok(
    "sharing accepts connected colleagues; refuses unknown teachers and foreign organisations",
    async () => {
      await deny(() =>
        call("owner", {
          action: "share",
          assetId: "private",
          org: "foreign",
          readers: [],
        }),
      );
      await deny(() =>
        call("owner", {
          action: "share",
          assetId: "private",
          org: "",
          readers: ["outsider"],
        }),
      );
      await call("owner", {
        action: "share",
        assetId: "private",
        org: "",
        readers: ["colleague"],
      });
      assert(
        (await getDoc(doc(colleague, "videoAssets/private/parts/0"))).exists(),
      );
      await deny(() =>
        call("colleague", {
          action: "share",
          assetId: "private",
          org: "",
          readers: [],
        }),
      );
    },
  );
  await ok(
    "organisation access is explicit, queryable, and revocable",
    async () => {
      await deny(() => getDoc(doc(orgmate, "videoAssets/private")));
      await call("owner", {
        action: "share",
        assetId: "private",
        org: "org",
        readers: [],
      });
      assert.equal(
        (
          await getDocs(
            query(
              collection(orgmate, "videoAssets"),
              where("org", "==", "org"),
            ),
          )
        ).size,
        1,
      );
      await deny(() => getDoc(doc(colleague, "videoAssets/private")));
      await call("owner", {
        action: "share",
        assetId: "private",
        org: "",
        readers: [],
      });
      await deny(() => getDoc(doc(orgmate, "videoAssets/private/parts/0")));
    },
  );
  let planCalls=0;
  let starts = 0,
    imageBody;
  const nativeFetch = global.fetch;
  process.env.VIDEO_AI_ENABLED = "true";
  global.fetch = async (url, options) => {
    if (String(url).includes("api.dev.runwayml.com/v1/text_to_video")) {
      starts++;
      return new Response(JSON.stringify({ id: "provider-task" }));
    }
    if (String(url).includes("api.dev.runwayml.com/v1/tasks/"))
      return new Response(
        JSON.stringify({
          status: "SUCCEEDED",
          output: ["https://media.example.test/clip.mp4"],
        }),
      );
    if (String(url) === "https://media.example.test/clip.mp4")
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "video/mp4" },
      });
    if (String(url).includes("api.openai.com/v1/responses")) {
      planCalls++;
      const plan={title:"Fruit shop",learningAim:"Ask for fruit",scenes:[{title:"Shop",prompt:"An original fox at a shop",script:"An apple, please.",duration:5,question:"Which fruit?",answer:"An apple.",teacherNotes:"Ask a partner."}]};
      return new Response(JSON.stringify({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify(plan)}]}],usage:{input_tokens:100,output_tokens:100}}));
    }
    if (String(url).includes("api.openai.com/v1/images/")) {
      imageBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ data: [{ b64_json: "YQ==" }] }));
    }
    throw Error(`Unexpected network request ${url}`);
  };
  try {
    await ok("script planning is private, idempotent and makes no video or image requests",async()=>{
      process.env.VIDEO_AI_ENABLED="false";
      const brief={brief:"A fruit shop",audience:"Young learners",level:"A1",length:20};
      const [first,repeat]=await Promise.all([call("owner",{action:"plan",requestId:"planned-script",brief}),call("owner",{action:"plan",requestId:"planned-script",brief})]);
      const result=first.plan?first:repeat.plan?repeat:await call("owner",{action:"poll",jobId:"planned-script"});
      assert.equal(result.plan.scenes[0].script,"An apple, please.");assert.equal(planCalls,1);assert.equal(starts,0);assert.equal(imageBody,undefined);
      await assert.rejects(()=>call("outsider",{action:"poll",jobId:"planned-script"}),e=>e.code==="not-found");
      await deny(()=>call("outsider",{action:"plan",requestId:"forbidden-plan",brief,references:["private"]}));assert.equal(planCalls,1);
      const again=await call("owner",{action:"plan",requestId:"planned-script",brief});assert(again.plan);assert.equal(planCalls,1);
      process.env.VIDEO_AI_ENABLED="true";
    });
    await ok(
      "reference permissions checked before provider calls or usage reservation",
      async () => {
        await deny(() =>
          call("outsider", {
            action: "scene",
            requestId: "forbidden-ref",
            prompt: "A fox",
            references: ["private"],
          }),
        );
        assert.equal(starts, 0);
        assert.equal(
          (await adb.doc("videoJobs/outsider_forbidden-ref").get()).exists,
          false,
        );
      },
    );
    await ok(
      "repeated/concurrent submission creates one billed provider generation",
      async () => {
        await Promise.all([
          call("owner", {
            action: "generate",
            requestId: "stable-request",
            prompt: "A fox",
          }),
          call("owner", {
            action: "generate",
            requestId: "stable-request",
            prompt: "A fox",
          }),
        ]);
        assert.equal(starts, 1);
      },
    );
    await ok(
      "completed outputs are copied into a private durable library once",
      async () => {
        await Promise.all([
          call("owner", { action: "poll", jobId: "stable-request" }),
          call("owner", { action: "poll", jobId: "stable-request" }),
        ]);
        const r = await call("owner", {
          action: "poll",
          jobId: "stable-request",
        });
        assert.equal(r.status, "complete");
        const s = await adb.doc(`videoAssets/${r.assetId}`).get();
        assert.equal(s.get("ready"), true);
        assert.equal(s.get("org"), "");
        assert.equal(s.get("size"), 3);
        await deny(() =>
          getDoc(doc(other, `videoAssets/${r.assetId}/parts/0`)),
        );
        assert.equal(
          (
            await adb
              .collection("videoAssets")
              .where("kind", "==", "video")
              .get()
          ).size,
          1,
        );
        await assert.rejects(
          call("outsider", { action: "poll", jobId: "stable-request" }),
          (e) => e.code === "not-found",
        );
      },
    );
    await ok(
      "saved references and style go into image requests; references stay untouched",
      async () => {
        const r = await call("owner", {
          action: "character",
          requestId: "image-request",
          prompt: "Same fox, side view",
          references: ["private"],
          visualStyle: "paper",
        });
        assert(imageBody.prompt.includes("paper cut-out"));
        assert.deepEqual(imageBody.images, [
          { image_url: "data:image/png;base64,YQ==" },
        ]);
        assert.equal(
          (await adb.doc(`videoAssets/${r.assetId}`).get()).get("visualStyle"),
          "paper",
        );
        assert.equal(
          (await adb.doc("videoAssets/private").get()).get("description"),
          "Fox",
        );
      },
    );
    await ok("per-user daily allowance prevents more billed requests", async () => {
      await adb.doc("aiAllowances/owner").set({limits:{videoScene:1}});
      await assert.rejects(
        call("owner", {
          action: "generate",
          requestId: "over-budget",
          prompt: "Another fox",
        }),
        (e) => e.code === "resource-exhausted",
      );
      assert.equal(starts, 1);
    });
  } finally {
    global.fetch = nativeFetch;
  }
  console.log(`${checks} video access and service checks passed`);
} finally {
  for (const c of clients) {
    await terminate(c.db);
    await deleteApp(c.app);
  }
  await adb.terminate();
}
