import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { gamesService } from './service.js';
export const classroomGames = onCall({ region: 'us-central1', maxInstances: 4, timeoutSeconds: 60 }, req => gamesService(getFirestore(), req.auth, req.data || {}));
import { defineSecret } from 'firebase-functions/params';
import { generateGame } from './ai.js';
const apiKey = defineSecret('OPENAI_API_KEY');
export const classroomGameDraft = onCall({ region: 'us-central1', secrets: [apiKey], maxInstances: 2, timeoutSeconds: 300 }, req => generateGame(getFirestore(), req.auth, req.data || {}, apiKey.value()));
