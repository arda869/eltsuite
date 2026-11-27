import { doc } from 'firebase/firestore';
import { db } from './firebase';

/** The restricted task body is readable only by the selected learner audience. */
export const bodyRef = (classId: string, itemId: string, taskId: string) =>
  doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'body');
