// Stand-ins for the server-only Firebase modules the quiz service imports, so the real service
// (functions/quiz/service.js) runs in the browser against the mock Firestore and Realtime Database.
import { increment, serverTimestamp } from './firestore';
export class HttpsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export const FieldValue = { increment, serverTimestamp };
export const ServerValue = { increment: (n: number) => ({ __inc: n }) };
