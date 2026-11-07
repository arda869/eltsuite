import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/site.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const stored = new Map();
globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
globalThis.location = { hostname: 'eltsuite.com', origin: 'https://eltsuite.com', search: '' };
const site = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('learner domain is accepted only after valid version content, then expires', async () => {
  const now = Date.now;
  let clock = now();
  Date.now = () => clock;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ html: 'a generic page' }) });
    site.probeLearn();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(site.learnReady(), false);
    assert.equal(site.learnOrigin(), 'https://eltsuite.com');

    globalThis.fetch = async () => ({ ok: true, json: async () => ({ build: 'verified-build' }) });
    await new Promise(resolve => site.probeLearn(resolve));
    assert.equal(site.learnReady(), true);
    assert.equal(site.learnOrigin(), 'https://learn.eltsuite.com');
    clock += 5 * 60 * 1000 + 1;
    assert.equal(site.learnReady(), false);
    assert.equal(site.learnOrigin(), 'https://eltsuite.com');
  } finally { Date.now = now; }
});
