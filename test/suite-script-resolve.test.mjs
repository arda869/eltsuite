import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';

// Exercise the real resolver without a production Firebase connection. Only
// the network/reference boundary is replaced; the asset walk is production code.
const boundary = {
  name: 'suite-script-reference-boundary',
  setup(builder) {
    builder.onResolve({ filter: /^\.\/(fullcopy|suiteScriptReferences|archive|fileStore)$/ }, args =>
      args.importer.endsWith('suiteScriptResolve.ts') ? { path: args.path, namespace: 'reference-boundary' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'reference-boundary' }, args => ({
      contents: args.path === './fullcopy'
        ? 'export async function carryMedia() { throw Error("No media copy expected"); }'
        : args.path === './fileStore'
          ? 'export async function loadAnyFile(id) { return new Blob(["safe bytes"], {type: id === "video-file" ? "video/mp4" : "audio/mpeg"}); }'
          : args.path === './archive'
            ? 'export async function saveSound(_space, _file, meta) { return {mediaId: meta.video ? "copied-video" : "copied-audio"}; }'
            : 'export async function resolveSuiteScriptReference(id) { return id === "audio-ref" || id === "video-ref" ? { kind: "sharedDoc", itemType: "file", sourceId: id === "video-ref" ? "video-file" : "audio-file", mime: id === "video-ref" ? "video/mp4" : "audio/mpeg" } : { kind: "sharedDoc", sourceId: "safe-image", mime: "image/png" }; }',
      loader: 'js',
    }));
  },
};
const built = await build({ entryPoints: ['src/lib/suiteScriptResolve.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', write: false, plugins: [boundary] });
const file = new URL('./.suite-script-resolve-test-bundle.mjs', import.meta.url);
await writeFile(file, built.outputFiles[0].text);
const { resolveSuiteScriptContent } = await import(file.href);
await unlink(file);

test('nested private pictures and media cannot bypass SuiteScript reference checks', async () => {
  const raw = { type: 'communicativeActivity', attrs: {
    activity: { kind: 'spot', items: [
      { title: 'Learner A', picture: { src: 'private-activity:class-secret:image-1', alt: 'A room' } },
      { title: 'Learner B', picture: { src: 'https://private.example.test/photo?token=secret', alt: 'Another room' } },
    ] },
  } };
  const result = await resolveSuiteScriptContent([raw], { mode: 'class', classId: 'class-1' });
  assert.equal(result.content[0].type, 'paragraph');
  assert.match(JSON.stringify(result.content), /Item unavailable/);
  assert.doesNotMatch(JSON.stringify(result), /class-secret|private\.example|token=secret/);
  assert.equal(result.warnings.length, 1);

  const nestedRef = { type: 'pack', attrs: { cards: [{ media: { suiteRef: 'ELTSUITE-0001-0002-0003-0018' } }] } };
  const second = await resolveSuiteScriptContent([nestedRef], { mode: 'class', classId: 'class-1' });
  assert.match(JSON.stringify(second.content), /Item unavailable/);
  assert.doesNotMatch(JSON.stringify(second.content), /ELTSUITE-0001/);
});

test('empty media slots and non-media configuration remain usable', async () => {
  const node = { type: 'timeline', attrs: { title: 'The conversation', marks: [{ kind: 'event', label: 'Arrived', x: 210 }], cover: null, src: '' } };
  const result = await resolveSuiteScriptContent([node], { mode: 'class', classId: 'class-1' });
  assert.deepEqual(result.content, [node]);
  assert.deepEqual(result.warnings, []);
});

test('a root typed picture reference still resolves to its authorised file', async () => {
  const result = await resolveSuiteScriptContent([{ type: 'picture', attrs: { suiteRef: 'ELTSUITE-0001-0002-0003-0018', alt: 'Front desk' } }], { mode: 'class', classId: 'class-1' });
  assert.deepEqual(result.content, [{ type: 'picture', attrs: { src: 'file:safe-image', alt: 'Front desk' } }]);
  assert.deepEqual(result.warnings, []);
});

test('authorised organisation audio and video files become playable class media copies', async () => {
  for (const [reference, kind, media] of [['audio-ref', 'audio', 'copied-audio'], ['video-ref', 'video', 'copied-video']]) {
    const result = await resolveSuiteScriptContent([{ type: 'media', attrs: { suiteRef: reference, kind } }], { mode: 'class', classId: 'class-1' });
    assert.equal(result.content[0].attrs.media, media);
    assert.equal(result.content[0].attrs.kind, kind);
    assert.deepEqual(result.warnings, []);
  }
  const privateResult = await resolveSuiteScriptContent([{ type: 'media', attrs: { suiteRef: 'audio-ref', kind: 'audio' } }], { mode: 'private' });
  assert.match(JSON.stringify(privateResult.content), /Audio unavailable/);
});
