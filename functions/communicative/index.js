import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { runCommunicativeActivity } from './service.js';
export const communicativeActivity = onCall({ region: 'us-central1', maxInstances: 10, timeoutSeconds: 60 }, request => runCommunicativeActivity(getFirestore(), request.auth, request.data));
