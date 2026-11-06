import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { quizService } from './service.js';

// The live quiz show. Guests play without an account, so this callable accepts signed-out requests;
// every action checks who may do it (see service.js). Sized for a full hall answering at once.
const RTDB = 'https://lesson-lit-default-rtdb.asia-southeast1.firebasedatabase.app';
export const quizShow = onCall({ region: 'us-central1', maxInstances: 40, concurrency: 80, memory: '512MiB', timeoutSeconds: 60, invoker: 'public' }, (req) =>
  quizService(getFirestore(), getDatabase(undefined, RTDB), req.auth, req.data || {}),
);
