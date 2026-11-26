import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { get, ref, set, update, runTransaction } from 'firebase/database';

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw Error('A disposable Realtime Database emulator is required.');
const [host, port] = process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({
  projectId: 'demo-collab-comment-rules',
  database: { host, port: Number(port), rules: await readFile('database.rules.json', 'utf8') },
});
try {
  const owner = env.authenticatedContext('owner').database();
  const alice = env.authenticatedContext('alice').database();
  const bob = env.authenticatedContext('bob').database();
  const peer = env.authenticatedContext('peer').database();
  const viewer = env.authenticatedContext('viewer').database();
  const outsider = env.authenticatedContext('outsider').database();
  const path = 'collab/doc';
  const thread = `${path}/c/first`;
  const reply = `${thread}/r/reply1`;
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), 'collabAccess/doc'), {
      read: { owner: true, alice: true, bob: true, viewer: true },
      edit: { owner: true },
      comment: { owner: true, alice: true, bob: true },
      peer: { peer: true },
      flags: { owner: true },
    });
    await set(ref(ctx.database(), 'collabAccess/copy/edit/owner'), true);
  });

  // The provider can still create a document, write updates, compact, and copy it.
  await assertSucceeds(runTransaction(ref(owner, `${path}/init`), (v) => v || { at: 1 }));
  await assertSucceeds(set(ref(owner, `${path}/snap`), { s: 'snapshot', by: 'owner', at: 1 }));
  await assertSucceeds(set(ref(owner, `${path}/u/u1`), { by: 'owner', u: 'delta' }));
  await assertSucceeds(update(ref(owner, path), { snap: { s: 'compact', by: 'owner', at: 2 }, 'u/u1': null }));
  await assertSucceeds(update(ref(owner, 'collab/copy'), { snap: { s: 'copy', by: 'copy', at: 3 }, init: { at: 3 } }));

  await assertSucceeds(set(ref(alice, thread), { by: 'alice', name: 'Alice', text: 'First', quote: 'quote', at: 1 }));
  await assertFails(set(ref(bob, `${path}/c/spoof`), { by: 'alice', text: 'Spoof' }));
  await assertFails(set(ref(viewer, `${path}/c/viewer`), { by: 'viewer', text: 'Viewer' }));
  await assertFails(set(ref(outsider, `${path}/c/outsider`), { by: 'outsider', text: 'Outsider' }));
  await assertFails(set(ref(bob, thread), { by: 'bob', text: 'Replace' }));
  await assertFails(update(ref(bob, thread), { text: 'Changed', edited: 2 }));
  await assertFails(set(ref(bob, thread), null));
  // An editor must not inherit a broad parent write permission after a snapshot exists.
  await assertFails(update(ref(owner, thread), { text: 'Owner overwrite', edited: 2 }));
  await assertFails(set(ref(owner, thread), null));
  await assertFails(set(ref(alice, `${thread}/by`), 'bob'));
  await assertSucceeds(update(ref(alice, thread), { text: 'Edited', edited: 2 }));

  await assertSucceeds(set(ref(bob, reply), { by: 'bob', name: 'Bob', text: 'Reply', at: 3 }));
  await assertFails(set(ref(alice, `${thread}/r/spoof`), { by: 'bob', text: 'Spoof' }));
  await assertFails(update(ref(alice, reply), { text: 'Changed', edited: 4 }));
  await assertFails(set(ref(alice, reply), null));
  await assertSucceeds(update(ref(bob, reply), { text: 'Edited reply', edited: 4 }));
  await assertSucceeds(update(ref(bob, thread), { resolved: true, resolvedBy: 'bob', resolvedAt: 5 }));
  await assertFails(set(ref(alice, `${thread}/resolvedBy`), 'bob'));
  await assertSucceeds(update(ref(alice, thread), { resolved: false }));
  await assertSucceeds(set(ref(bob, reply), null));

  await assertSucceeds(set(ref(owner, `${path}/flags/shared`), true));
  await assertSucceeds(set(ref(peer, `${path}/c/peer`), { by: 'peer', text: 'Shared peer' }));
  await assertFails(set(ref(peer, thread), null));
  await assertSucceeds(set(ref(alice, thread), null));
  if ((await get(ref(owner, thread))).exists()) throw Error('Own thread deletion did not remove the thread.');
  console.log('Collab comment author permissions and provider writes passed.');
} finally {
  await env.cleanup();
}
