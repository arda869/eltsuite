import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { warn } from 'firebase-functions/logger';

// For the side-by-side model test only (scripts/ai-compare.mjs). Off unless the ELT_AI_CAPTURE
// environment setting is "on". It copies teachers' AI requests (their lesson content), so switch it
// on only for a short, agreed test window. Copies are readable only by the server and expire after
// 14 days (Firestore TTL on aiCaptures.expireAt). A share of requests is kept, set by
// ELT_AI_CAPTURE_RATE (0 to 1, default 0.25), and at most 40 per job.
const seen = new Map();
export function captureOn() {
  return process.env.ELT_AI_CAPTURE === 'on';
}
export async function captureRequest(name, body, images = []) {
  try {
    const rate = Math.min(1, Math.max(0, Number(process.env.ELT_AI_CAPTURE_RATE ?? '0.25')));
    if (Math.random() > rate || (seen.get(name) ?? 0) >= 40) return;
    seen.set(name, (seen.get(name) ?? 0) + 1);
    const db = getFirestore();
    const { input, ...rest } = body;
    const doc = db.collection('aiCaptures').doc();
    // Pictures go in their own documents, to stay under Firestore's size limit.
    const text = typeof input === 'string' ? input : JSON.stringify(input?.[0]?.content?.[0]?.text ?? '');
    await doc.set({ name, model: body.model, body: JSON.stringify({ ...rest, input: text }), images: images.length, createdAt: Timestamp.now(), expireAt: Timestamp.fromMillis(Date.now() + 14 * 864e5) });
    await Promise.all(images.map((data, i) => doc.collection('aiCaptureImages').doc(String(i)).set({ data, expireAt: Timestamp.fromMillis(Date.now() + 14 * 864e5) })));
  } catch (e) {
    warn('AI capture skipped', { name, reason: e?.message?.slice(0, 120) });
  }
}
