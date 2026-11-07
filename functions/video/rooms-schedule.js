import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { runRoomMaintenance } from './rooms-maintenance.js';

const dailyKey = defineSecret('DAILY_API_KEY');

// GitHub Actions can be unavailable while Firebase remains healthy. Keep room provisioning
// and provider usage reconciliation on Firebase's own schedule.
export const maintainVideoRooms = onSchedule({
  schedule: 'every 15 minutes',
  region: 'us-central1',
  secrets: [dailyKey],
  timeoutSeconds: 540,
  maxInstances: 1,
}, async () => runRoomMaintenance(getFirestore(), dailyKey.value()));
