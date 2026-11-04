import type { CoachContext } from './conversations';

const lessonPath = /^\/class\/([A-Za-z0-9_-]+)\/lesson\/([A-Za-z0-9_-]+)(?:\/|$)/;

// Capture context when a conversation opens. The server reads the lesson and checks access;
// this only identifies the activity the teacher is currently viewing.
export function coachContextOnPage(): CoachContext {
  const path = window.location.pathname;
  const match = path.match(lessonPath);
  const selected = document.querySelector<HTMLElement>('[data-coach-task-id]')?.dataset.coachTaskId;
  const taskId = selected && /^[A-Za-z0-9_-]{1,100}$/.test(selected) ? selected : new URLSearchParams(window.location.search).get('task') || '';
  return {
    lessonContext: match ? { classId: match[1], itemId: match[2], taskId } : null,
    formContext: null,
    evidencePacketId: '',
    reflectionId: '',
    pageContext: {
      name: match ? 'Classroom lesson' : path.startsWith('/doc/') ? 'Collab document' : path.startsWith('/recordings') ? 'Recordings' : path.startsWith('/archive') || path.startsWith('/resources') ? 'Resources' : path.startsWith('/development') ? 'Development Studio' : path.startsWith('/class/') ? 'Classroom' : path.startsWith('/messages') ? 'Messages' : 'ELT Suite',
      path: path.slice(0,200),
    },
  };
}

// Share only text visible on the page the teacher is looking at when they send.
export function coachPageSnapshot() {
  const page = coachContextOnPage().pageContext!;
  const main = document.querySelector<HTMLElement>('main, [role="main"]');
  const visible = (main ?? document.body).innerText || '';
  return { ...page, content: visible.replace(/\s+/g, ' ').trim().slice(0, 7000) };
}
