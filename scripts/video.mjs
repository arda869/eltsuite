// Manual room maintenance from a trusted terminal. Firebase runs the same work on a schedule.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runRoomMaintenance } from '../functions/video/rooms-maintenance.js';

const key = process.env.DAILY_API_KEY;
if (!key) {
  console.error('No DAILY_API_KEY secret: video rooms cannot be maintained.');
  process.exitCode = 1;
} else {
  initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit' });
  await runRoomMaintenance(getFirestore(), key);
}
