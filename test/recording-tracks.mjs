// A recording saved from the sound editor keeps its tracks: each raw sound is stored on its own and
// the project lists them, so opening it again gives back two separate tracks, lined up in time.
// Run with the mock dev server on BASE (npm run smoke starts one).
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5197';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(BASE + '/dev.html?seed&as=teacher');
await p.waitForTimeout(2000);
const r = await p.evaluate(async () => {
  const T = await import('/src/media/trackStore.ts');
  const { auth } = await import('/src/lib/firebase.ts');
  const rate = 44100;
  const tone = (f, s) => Float32Array.from({ length: rate * s }, (_, i) => Math.sin((2 * Math.PI * f * i) / rate) * 0.5);
  const click = new Float32Array(rate); click.fill(0); for (let i = 0; i < 200; i++) click[rate / 2 + i] = 0.9;
  const project = { gain: 1, loud: false, lines: [], tracks: [
    { id: 't1', name: 'Anna', kind: 'voice', gain: 1, mute: false, solo: false, noise: 0, echo: 0, clips: [{ id: 'c1', src: 'main', a: 0, b: 2, at: 0, gain: 1, fx: '', fadeIn: 0, fadeOut: 0 }] },
    { id: 't2', name: 'Ben', kind: 'voice', gain: 0.8, mute: false, solo: false, noise: 1, echo: 0, clips: [{ id: 'c2', src: 'rec2', a: 0, b: 1, at: 1.5, gain: 1, fx: 'phone', fadeIn: 0, fadeOut: 0 }] },
  ] };
  const kept = new Map();
  const text = await T.saveTracks('user:' + auth.currentUser.uid, project, { main: tone(220, 2), rec2: click }, { main: 'Anna', rec2: 'Ben' }, rate, kept);
  const again = await T.saveTracks('user:' + auth.currentUser.uid, project, { main: tone(220, 2), rec2: click }, { main: 'Anna', rec2: 'Ben' }, rate, kept);
  const opened = await T.openProject(T.parseProject(text));
  const y = opened.sources.rec2;
  const at = y.findIndex((v) => Math.abs(v) > 0.3) / opened.rate;
  return { tracks: opened.project.tracks.map((t) => [t.name, t.clips[0].fx, t.noise]), ids: Object.keys(opened.sources).sort(), lens: [opened.sources.main.length / opened.rate, y.length / opened.rate], at, reused: JSON.parse(again).sources.map((s) => s.mediaId).join() === JSON.parse(text).sources.map((s) => s.mediaId).join() };
});
await b.close();
assert.deepEqual(r.tracks, [['Anna', '', 0], ['Ben', 'phone', 1]], 'both tracks come back with their settings');
assert.deepEqual(r.ids, ['main', 'rec2'], 'each raw sound is kept apart');
assert.ok(Math.abs(r.lens[0] - 2) < 0.01 && Math.abs(r.lens[1] - 1) < 0.01, 'tracks keep their length: ' + r.lens);
assert.ok(Math.abs(r.at - 0.5) < 0.01, 'a track starts where it did, not late by the MP3 lead-in: ' + r.at);
assert.ok(r.reused, 'saving again does not upload the same tracks twice');
console.log('recording tracks: ok');
