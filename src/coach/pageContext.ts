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

// The server retrieves lesson and learner sources with access checks. Send only
// the page identity here; scraping all visible text can bypass disabled sources.
export function coachPageSnapshot() {
  const page = coachContextOnPage().pageContext!;
  const title = document.querySelector<HTMLElement>('main h1, [role="main"] h1')?.textContent?.trim() || document.title;
  return { ...page, name: title.slice(0, 100) || page.name, content: '' };
}
