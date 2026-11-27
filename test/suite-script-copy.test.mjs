import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';

// Exercise the production export walker. Only Firebase and the permission
// callable are replaced, so a copied Class file cannot fall back to a raw ID.
const boundary = {
  name: 'suite-script-copy-boundary',
  setup(builder) {
    builder.onResolve({ filter: /^(firebase\/firestore|\.\/firebase|\.\/suiteScriptReferences)$/ }, args =>
      args.importer.endsWith('suiteScriptCopy.ts') ? { path: args.path, namespace: 'copy-boundary' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'copy-boundary' }, args => ({
      contents: args.path === 'firebase/firestore'
        ? 'export function collection() { return {}; } export async function getDocs() { throw Error("Archive fallback should not run"); }'
        : args.path === './firebase'
          ? 'export const db = {};'
          : `export async function ensureSuiteScriptReference() { throw Error('A saved reference should be reused'); }
             export async function resolveSuiteScriptReference(id, destination) {
               globalThis.checkedDestinations.push(destination);
               if (id === 'denied') throw Error('permission denied');
               const records = {
                 image: {kind:'sharedDoc',sourceId:'image-source',itemType:'file',mime:'image/png'},
                 pdf: {kind:'sharedDoc',sourceId:'pdf-source',itemType:'file',mime:'application/pdf'},
                 audio: {kind:'sharedDoc',sourceId:'audio-source',itemType:'file',mime:'audio/mpeg'},
                 video: {kind:'sharedDoc',sourceId:'video-source',itemType:'file',mime:'video/mp4'},
               };
               return records[id] ?? records.image;
             }`,
      loader: 'js',
    }));
  },
};
const built = await build({ entryPoints: ['src/lib/suiteScriptCopy.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', write: false, plugins: [boundary] });
const file = new URL('./.suite-script-copy-test-bundle.mjs', import.meta.url);
await writeFile(file, built.outputFiles[0].text);
const { suiteScriptCopyNodes } = await import(file.href);
await unlink(file);

test('Class-owned copies of Organisation image, PDF, audio and video reopen as checked SuiteScript references', async () => {
  globalThis.checkedDestinations = [];
  const stored = [
    {type:'paragraph',content:[{type:'picture',attrs:{src:'media:class-image',suiteRef:'image',alt:'Front desk'}}]},
    {type:'pdfBlock',attrs:{src:'media:class-pdf',suiteRef:'pdf',pages:[{w:612,h:792}]}},
    {type:'media',attrs:{media:'class-audio',suiteRef:'audio',kind:'audio',archiveId:''}},
    {type:'inlineMedia',attrs:{media:'class-video',suiteRef:'video',kind:'video',archiveId:''}},
  ];
  const copied = await suiteScriptCopyNodes(stored, 'teacher-1', 'class-1');
  assert.equal(copied[0].content[0].attrs.suiteRef, 'image');
  assert.equal(copied[1].attrs.suiteRef, 'pdf');
  assert.equal(copied[2].attrs.suiteRef, 'audio');
  assert.equal(copied[3].attrs.suiteRef, 'video');
  assert.doesNotMatch(JSON.stringify(copied), /class-image|class-pdf|class-audio|class-video|image-source|pdf-source/);
  assert.deepEqual(globalThis.checkedDestinations, Array.from({length:4}, () => ({mode:'class',classId:'class-1',mediaCopy:true})));
});

test('reopening fails closed when source permission was revoked or the reference has the wrong type', async () => {
  globalThis.checkedDestinations = [];
  await assert.rejects(
    suiteScriptCopyNodes([{type:'picture',attrs:{src:'media:class-image',suiteRef:'denied'}}], 'teacher-1', 'class-1'),
    /permission denied/,
  );
  await assert.rejects(
    suiteScriptCopyNodes([{type:'pdfBlock',attrs:{src:'media:class-pdf',suiteRef:'image'}}], 'teacher-1', 'class-1'),
    /no longer matches/,
  );
});
