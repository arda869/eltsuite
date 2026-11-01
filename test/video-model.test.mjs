import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite/package.json"))(
  "esbuild",
);
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const out = await mkdtemp(join(tmpdir(), "video-model-"));
await build({
  entryPoints: [
    "src/video/model.ts",
    "src/video/operations.ts",
    "src/video/StudioPanels.tsx",
  ],
  bundle: true,
  format: "esm",
  platform: "node",
  outdir: out,
});
const m = await import(pathToFileURL(join(out, "model.js")));
const ops = await import(pathToFileURL(join(out, "operations.js")));
const asset = { id: "source", duration: 10 };
test("splitting a sped-up clip preserves source coverage and total timeline length", () => {
  const c = {
    ...m.clipFor(asset, 4),
    in: 2,
    out: 10,
    speed: 2,
    fadeIn: 0.5,
    fadeOut: 0.5,
  };
  const [a, b] = m.splitClip(c, 6);
  assert.equal(a.out, 6);
  assert.equal(b.in, 6);
  assert.equal(b.at, 6);
  assert.equal(m.end(a), b.at);
  assert.equal(m.end(b), 8);
  assert.equal(a.fadeOut, 0);
  assert.equal(b.fadeIn, 0);
  assert.notEqual(a.id, b.id);
});
test("ripple delete moves only later clips on selected track", () => {
  const p = m.blankProject(),
    a = m.clipFor(asset, 0),
    b = m.clipFor(asset, 10);
  p.tracks[1].clips = [a, b];
  p.tracks[3].clips = [m.clipFor(asset, 10)];
  const next = ops.rippleDelete(p, a.id);
  assert.equal(next.tracks[1].clips[0].at, 0);
  assert.equal(next.tracks[3].clips[0].at, 10);
  assert.equal(p.tracks[1].clips.length, 2);
});
test("detaching audio preserves source timing without doubling original audio", () => {
  const p = m.blankProject(),
    c = m.clipFor(asset, 3);
  p.tracks[1].clips = [c];
  const n = ops.detachAudio(p, c.id);
  assert.equal(n.tracks[1].clips[0].gain, 0);
  assert.equal(n.tracks.at(-1).clips[0].at, 3);
  assert.equal(n.tracks.at(-1).clips[0].asset, c.asset);
  assert.notEqual(n.tracks.at(-1).clips[0].id, c.id);
});
test("question pause splits every active track, adds silence and preserves later alignment", () => {
  const p = m.blankProject();
  p.tracks[1].clips = [m.clipFor(asset, 0)];
  p.tracks[3].clips = [m.clipFor(asset, 0)];
  const n = ops.insertPause(p, 4, "freeze", 3);
  assert(m.validProject(n));
  for (const t of n.tracks.filter(
    (t) =>
      ["video", "audio"].includes(t.kind) && t.clips[0]?.asset === "source",
  )) {
    assert.equal(t.clips[0].out, 4);
    assert.equal(t.clips[1].in, 4);
    assert.equal(t.clips[1].at, 7);
  }
  assert.equal(m.duration(n), 13);
  assert.equal(n.tracks[0].clips[0].text, "What happens next?");
});
test("invalid and excessively long edit ranges cannot be saved", () => {
  const p = m.blankProject();
  p.tracks[1].clips = [m.clipFor(asset, 0)];
  assert(m.validProject(p));
  for (const patch of [
    { in: 9, out: 1 },
    { gain: Infinity },
    { at: -1 },
    { speed: 8 },
    { opacity: 2 },
    { out: 4000 },
  ])
    assert(
      !m.validProject({
        ...p,
        tracks: p.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => ({ ...c, ...patch })),
        })),
      }),
    );
});

const { fitStudioPanels } = await import(
  pathToFileURL(join(out, "StudioPanels.js"))
);
test("panel resizing keeps room for preview and clamps persisted oversized values", () => {
  for (const width of [701, 900, 1280, 1920])
    for (const open of [false, true]) {
      const { sizes } = fitStudioPanels(
        { library: 10000, inspector: 10000, timeline: 10000 },
        { width, height: 800 },
        open,
      );
      assert(sizes.library >= 180);
      assert(sizes.inspector >= 180);
      assert(sizes.library + (open ? sizes.inspector + 14 : 7) + 300 <= width);
      assert(sizes.timeline <= 470);
    }
});
test('corrupt project structures and non-text captions fail validation safely',()=>{const p=m.blankProject();assert.equal(m.validProject({...p,tracks:[null]}),false);assert.equal(m.validProject({...p,tracks:[{...p.tracks[0],clips:null}]}),false);const c=m.clipFor(asset,0);p.tracks[0].clips=[{...c,text:{malformed:true}}];assert.equal(m.validProject(p),false);});

test('approved AI scenes assemble in order with separate narration and silent question cards',()=>{
 const p=m.blankProject(),video={id:'video',duration:5},image={id:'image',duration:5},audio={id:'voice',duration:4};
 const next=ops.assembleScenes(p,[{video,image,audio,question:'Which fruit?'},{video:{...video,id:'second'},image,question:''}],'Fruit shop');
 assert(m.validProject(next));assert.equal(next.title,'Fruit shop');
 const v=next.tracks.find(t=>t.name==='AI scenes'),a=next.tracks.find(t=>t.name==='AI narration'),q=next.tracks.find(t=>t.name==='Question cards');
 assert.deepEqual(v.clips.map(c=>[c.asset,c.at,c.out]),[['video',0,5],['image',5,3],['second',8,5]]);assert.equal(v.clips[0].gain,0);assert.equal(a.clips[0].at,0);assert.equal(q.clips[0].text,'Which fruit?');assert.equal(m.duration(next),13);assert.equal(p.tracks.flatMap(t=>t.clips).length,0);
});
