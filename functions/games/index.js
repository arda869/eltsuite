import {onCall} from '../costs/callable.js';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { generateGame } from './ai.js';
const apiKey = defineSecret('OPENAI_API_KEY');
export const classroomGameDraft = onCall({ region: 'us-central1', secrets: [apiKey], maxInstances: 2, timeoutSeconds: 300 }, req => generateGame(getFirestore(), req.auth, req.data || {}, apiKey.value()));
