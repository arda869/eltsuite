// The same lesson three ways for the public homepage (editor, worksheet and print, learner's phone),
// taken with the landing seed by test/landing-shots.mjs against this preview's app.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
export default async function steps({ say, BASE }) {
  const names = ['paper'];
  const r = spawnSync('node', ['test/landing-shots.mjs', ...names], { env: { ...process.env, BASE }, encoding: 'utf8', timeout: 8 * 60000 });
  say((r.stdout || '') + (r.stderr || '').slice(-2000));
  for (const n of names) {
    const f = `outputs/landing-shots/${n}.png`;
    if (existsSync(f)) { copyFileSync(f, `preview-out/landing-${n}.png`); say('copied', n); }
  }
}
