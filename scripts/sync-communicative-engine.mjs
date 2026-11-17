import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const result = await build({ entryPoints: ['src/communicative/engine.ts'], bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', write: false, legalComments: 'none' });
const content = '// Generated from src/communicative. Run node scripts/sync-communicative-engine.mjs.\n' + result.outputFiles[0].text;
const file = 'functions/communicative/engine.js';
if (process.argv.includes('--check')) {
  if (await readFile(file, 'utf8') !== content) throw new Error('The communicative activity engine is out of sync.');
} else { await mkdir('functions/communicative', { recursive: true }); await writeFile(file, content); }
