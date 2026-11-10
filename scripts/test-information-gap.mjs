import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const server = spawn('node_modules/.bin/vite', ['--config', 'information-gap/vite.config.ts', '--host', '127.0.0.1'], {
  env: { ...process.env, VITE_TIG_EMULATOR: '1' },
  stdio: 'inherit',
});

async function ready() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('The test site exited before it was ready.');
    try {
      const response = await fetch('http://127.0.0.1:5198/');
      if (response.ok) return;
    } catch { /* Wait for Vite to start. */ }
    await delay(500);
  }
  throw new Error('The Information Gap test site did not start.');
}

async function run(file) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${file} failed (${code}).`)));
  });
}

try {
  await ready();
  await run('test/information-gap-ui.mjs');
  await run('test/information-gap-author-ui.mjs');
} finally {
  server.kill('SIGTERM');
}
