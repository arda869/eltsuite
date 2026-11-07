import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('A disposable Firestore emulator is required.');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'demo-phase2-security' });
const db = getFirestore();
const { deleteConversationFor } = await import('../functions/messaging/delete.js');

await db.doc('users/chat-teacher').set({ role: 'teacher' });
const chat = db.doc('chats/lifecycle-chat');
await chat.set({ createdBy: 'chat-teacher', members: ['chat-teacher', 'chat-other'] });
await chat.collection('msgs').doc('message').set({ by: 'chat-teacher', text: 'Test' });
await chat.collection('msgs').doc('message').collection('answers').doc('chat-other').set({ by: 'chat-other', answer: 'Yes' });
await chat.collection('media').doc('attachment').set({ data: 'test' });

await assert.rejects(() => deleteConversationFor(db, { uid: 'chat-other' }, { chatId: chat.id }), (error) => error.code === 'permission-denied');
assert.equal((await chat.collection('msgs').doc('message').get()).exists, true);
await deleteConversationFor(db, { uid: 'chat-teacher' }, { chatId: chat.id });
assert.equal((await chat.get()).exists, false);
assert.equal((await chat.collection('msgs').doc('message').get()).exists, false);
assert.equal((await chat.collection('msgs').doc('message').collection('answers').doc('chat-other').get()).exists, false);
assert.equal((await chat.collection('media').doc('attachment').get()).exists, false);
await deleteConversationFor(db, { uid: 'chat-teacher' }, { chatId: chat.id });
console.log('Conversation deletion removes messages, answers and media, and denies other users.');
