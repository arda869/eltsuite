import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(tmpdir(), 'song-script-test-'));
const output = path.join(temp, 'song-script.mjs');
await build({ entryPoints: ['src/lib/songScript.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm' });
const { songScriptLines, expandSavedSongScript } = await import(output);

test('song lyrics become separate ordered script lines across the audio clip', () => {
  const lyrics = 'Monday, Tuesday\r\nWhat comes next?\r\n\r\nTuesday!\r\n';
  const lines = songScriptLines(lyrics, 5, 30);
  assert.deepEqual(lines.map(line => line.text), ['Monday, Tuesday', 'What comes next?', 'Tuesday!']);
  assert.equal(lines[0].a, 5);
  assert.equal(lines.at(-1).b, 35);
  assert.ok(lines[0].b <= lines[1].a);
  assert.ok(lines[1].b < lines[2].a, 'the blank stanza line leaves a gap');
});

test('empty or zero-length lyrics do not make unusable script cues', () => {
  assert.deepEqual(songScriptLines(' \n ', 0, 30), []);
  assert.deepEqual(songScriptLines('One line', 0, 0), []);
  assert.deepEqual(songScriptLines('One line', 4, 10), [{ text: 'One line', a: 4, b: 14 }]);
});

test('older saved songs show one cue per lyric line in the editor and player', () => {
  const original = [{ text: 'Monday\nTuesday\n\nWednesday', t: 2, e: 20, who: 'Vocals' }];
  const expanded = expandSavedSongScript(original, 30);
  assert.deepEqual(expanded.map(line => line.text), ['Monday', 'Tuesday', 'Wednesday']);
  assert.deepEqual(expanded.map(line => line.who), ['Vocals', 'Vocals', 'Vocals']);
  assert.equal(expanded[0].t, 2);
  assert.equal(expanded.at(-1).e, 20);
  assert.deepEqual(original, [{ text: 'Monday\nTuesday\n\nWednesday', t: 2, e: 20, who: 'Vocals' }]);
});

test.after(async () => rm(temp, { recursive: true, force: true }));
