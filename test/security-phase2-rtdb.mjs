import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { get, ref, set } from 'firebase/database';

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw Error('A disposable Realtime Database emulator is required.');
const [host, port] = process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
const projectId = 'demo-phase2-security';
const env = await initializeTestEnvironment({
  projectId,
  database: { host, port: Number(port), rules: await readFile('database.rules.json', 'utf8') },
});
try {
  const owner = env.authenticatedContext('teacher').database();
  const co = env.authenticatedContext('co').database();
  const attacker = env.authenticatedContext('attacker').database();
  await assertFails(set(ref(attacker, 'classOwners/c1'), 'attacker'));
  await assertFails(set(ref(attacker, 'classTeachers/c1/attacker'), true));
  await env.withSecurityRulesDisabled(async ctx => {
    await set(ref(ctx.database(), 'classOwners/c1'), 'teacher');
    await set(ref(ctx.database(), 'classTeachers/c1/co'), true);
  });
  await assertFails(get(ref(attacker, 'classOwners/c1')));
  await assertFails(get(ref(attacker, 'classTeachers/c1')));
  await assertFails(set(ref(owner, 'classTeachers/c1/attacker'), true));
  await assertFails(set(ref(attacker, 'sessions/c1/pointer'), { taskId: 't1', x: 0, y: 0 }));
  await assertSucceeds(set(ref(owner, 'sessions/c1/pointer'), { taskId: 't1', x: 0, y: 0 }));
  await assertSucceeds(set(ref(co, 'sessions/c1/pointer'), { taskId: 't1', x: 1, y: 1 }));
  console.log('Live class ownership and co-teacher permission checks passed.');
} finally {
  await env.cleanup();
}
