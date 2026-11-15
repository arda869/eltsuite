// Diagnostic-only safety cleanup for the isolated B-029 learner check.
// Never print the class code, learner details, PIN, transcript, or credentials.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: 'lesson-lit' });
const db = getFirestore();
const item = db.doc('classes/uJlrPEXiArJiZda43ZGr/items/Cto4kITllTmIGOTK93zi');
const before = await item.get();
if (!before.exists) throw Error('B-029 fixture is missing; cannot verify privacy cleanup.');
if (before.get('hidden') !== true) await item.update({ hidden: true });
const after = await item.get();
if (after.get('hidden') !== true) throw Error('B-029 fixture remains visible; restore it immediately.');
console.log('B-029 cleanup: synthetic AI lesson is Hidden.');
