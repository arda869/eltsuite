// Run with the Firestore emulator using this repository's firestore.rules on 127.0.0.1:8089.
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, terminate } from 'firebase/firestore';

const projectId = 'demo-suite-script-rules';
const [host, portText] = (process.env.SUITE_FIRESTORE_EMULATOR || '127.0.0.1:8089').split(':');
const port = Number(portText);
const value = v => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(value) } } : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v };
async function seed(path, data) {
  const response = await fetch(`http://${host}:${port}/v1/projects/${projectId}/databases/(default)/documents/${path}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(value(data).mapValue) });
  assert(response.ok, await response.text());
}
await seed('users/teacher', { role: 'teacher' });
await seed('users/teacher/archive/old', { kind: 'audio', title: 'Recording', suiteScriptRef: 'ELTSUITE-0001-0002-0003-0018' });
await seed('sharedDocs/old', { owner: 'teacher', memberIds: [], title: 'Document', suiteScriptRef: 'ELTSUITE-0001-0002-0003-0018' });

const app = initializeApp({ projectId }, 'suite-script-rules');
const db = getFirestore(app);
connectFirestoreEmulator(db, host, port, { mockUserToken: { sub: 'teacher', email: 'teacher@example.test', email_verified: true } });
const allowed = async (label, work) => { await work(); console.log('PASS', label); };
const denied = async (label, work) => { await assert.rejects(work, error => error.code === 'permission-denied'); console.log('PASS', label); };
try {
  await allowed('archive owner can still change title', () => updateDoc(doc(db, 'users/teacher/archive/old'), { title: 'Renamed' }));
  await denied('archive owner cannot replace stable reference', () => updateDoc(doc(db, 'users/teacher/archive/old'), { suiteScriptRef: 'ELTSUITE-1111-2222-3333-4444' }));
  await denied('archive owner cannot remove stable reference', () => updateDoc(doc(db, 'users/teacher/archive/old'), { suiteScriptRef: null }));
  await denied('archive owner cannot create a forged stable reference', () => setDoc(doc(db, 'users/teacher/archive/forged'), { kind: 'audio', suiteScriptRef: 'ELTSUITE-1111-2222-3333-4444' }));
  await allowed('archive owner can create an ordinary item', () => setDoc(doc(db, 'users/teacher/archive/normal'), { kind: 'audio' }));
  await allowed('shared document owner can still change title', () => updateDoc(doc(db, 'sharedDocs/old'), { title: 'Renamed' }));
  await denied('shared document owner cannot replace stable reference', () => updateDoc(doc(db, 'sharedDocs/old'), { suiteScriptRef: 'ELTSUITE-1111-2222-3333-4444' }));
  await denied('shared document owner cannot create a forged stable reference', () => setDoc(doc(db, 'sharedDocs/forged'), { owner: 'teacher', memberIds: [], suiteScriptRef: 'ELTSUITE-1111-2222-3333-4444' }));
  await allowed('shared document owner can create an ordinary file', () => setDoc(doc(db, 'sharedDocs/normal'), { owner: 'teacher', memberIds: [] }));
} finally { await terminate(db); await deleteApp(app); }
