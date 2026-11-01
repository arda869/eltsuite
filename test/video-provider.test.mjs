import { test } from "node:test";
import assert from "node:assert/strict";
import {
  videoRequest,
  videoBody,
  runway,
  characterImage,
} from "../functions/video/contract.js";
import { VIDEO_STYLES } from "../functions/video/styles.js";
test("six presets cover illustrated, handmade and realistic looks", () => {
  assert.equal(VIDEO_STYLES.length, 6);
  assert(VIDEO_STYLES.some((s) => s.id === "realistic"));
  assert(VIDEO_STYLES.every((s) => s.prompt.length > 40));
});
test("requests reject arbitrary tasks, oversized prompts and malformed references", () => {
  assert.throws(() => videoRequest({ action: "read-secret" }));
  assert.throws(() =>
    videoRequest({
      action: "generate",
      requestId: "valid-request",
      prompt: "x".repeat(4000),
    }),
  );
  assert.throws(() =>
    videoRequest({
      action: "generate",
      requestId: "valid-request",
      prompt: "A classroom",
      references: ["../../secret"],
    }),
  );
  assert.throws(() => videoRequest({ action: "poll", jobId: "../../private" }));
});
test("Runway payload uses image endpoint only with actual references", async () => {
  let url, body;
  const d = videoRequest({
    action: "generate",
    requestId: "valid-request",
    prompt: "Two mascots",
    duration: 10,
  });
  await runway(
    "secret",
    "text_to_video",
    videoBody(d),
    "POST",
    async (u, o) => {
      url = u;
      body = JSON.parse(o.body);
      assert.equal(o.headers["X-Runway-Version"], "2024-11-06");
      return { ok: true, status: 200, json: async () => ({ id: "task" }) };
    },
  );
  assert(url.endsWith("/v1/text_to_video"));
  assert.equal(body.model, "gen4.5");
  assert.equal(body.duration, 10);
  assert(!("promptImage" in body));
  assert.equal(
    videoBody({ ...d, image: "data:image/png;base64,a" }).promptImage,
    "data:image/png;base64,a",
  );
});
test("OpenAI edits send saved references and preserve provider errors safely", async () => {
  const bytes = await characterImage(
    "secret",
    "Make another view",
    ["data:image/png;base64,YQ=="],
    async (u, o) => {
      assert(u.endsWith("/images/edits"));
      const b = JSON.parse(o.body);
      assert.deepEqual(b.images, [{ image_url: "data:image/png;base64,YQ==" }]);
      return { ok: true, json: async () => ({ data: [{ b64_json: "YQ==" }] }) };
    },
  );
  assert.equal(bytes.toString(), "a");
  await assert.rejects(
    runway("secret", "tasks/id", undefined, "GET", async () => ({
      ok: false,
      status: 401,
    })),
    /API connection/,
  );
});

import {videoBrief,planVideo,validatePlan} from '../functions/video/planner.js';
test('video brief validates age, level and bounded scene target before provider use',()=>{
 assert.throws(()=>videoBrief({brief:'Hello',audience:'Children',level:'A1',length:30}));
 assert.throws(()=>videoRequest({action:'plan',requestId:'valid-plan',brief:{brief:'x'.repeat(3001),audience:'Young learners',level:'A1',length:30}}));
 const d=videoRequest({action:'plan',requestId:'valid-plan',brief:{brief:'A fruit shop',audience:'Young learners',level:'A1',length:20}});assert.equal(d.brief.length,20);
});
test('planning returns a full reviewable script and interactions without generating media',async()=>{
 const value={title:'Fruit shop',learningAim:'Ask for fruit',scenes:[{title:'Shop',prompt:'An original fox at a fruit shop',script:'Can I have an apple, please?',duration:5,question:'Which fruit?',answer:'An apple.',teacherNotes:'Pairs answer.'}]};
 let calls=0;
 const p=await planVideo('key',videoBrief({brief:'A fruit shop',audience:'Young learners',level:'A1',length:20}),'cartoon',[],async(url,opts)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(opts.body);assert.equal(b.text.format.strict,true);assert.match(b.instructions,/BEFORE media creation/);return{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:100,output_tokens:200}})};});
 assert.equal(calls,1);assert.equal(p.scenes[0].script,value.scenes[0].script);assert.equal(p.scenes[0].answer,'An apple.');assert.throws(()=>validatePlan({...value,scenes:[{...value.scenes[0],script:'word '.repeat(40)}]},20));
});


import {execFileSync} from 'node:child_process';
test('deployment requires a Runway secret only when video generation is connected',()=>{
  const names=enabled=>JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`await import('./video/index.js');const {declaredParams}=await import('firebase-functions/params');console.log(JSON.stringify(declaredParams.map(p=>p.name)));`],{cwd:new URL('../functions/',import.meta.url),env:{...process.env,VIDEO_AI_ENABLED:enabled},encoding:'utf8'}));
  assert.deepEqual(names('false'),['OPENAI_API_KEY']);
  assert(names('true').includes('RUNWAYML_API_SECRET'));
});
