import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { CoachConversation } from './CoachConversation';
import type { CoachContext } from './conversations';
import './coach.css';

export function TeacherCompanionPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  if (params.get('section') === 'profile') return <Navigate to="/settings#set-teacher-s-companion" replace />;
  const classId = params.get('classId');
  const itemId = params.get('itemId');
  const formDoc = params.get('formDoc');
  const formId = params.get('formId');
  const context: CoachContext = {
    ...(classId && itemId ? { lessonContext: { classId, itemId, taskId: params.get('taskId') || '', reportId: params.get('reportId') || '' } } : {}),
    ...(formDoc && formId ? { formContext: { docId: formDoc, formId } } : {}),
    ...(params.get('evidence') ? { evidencePacketId: params.get('evidence')! } : {}),
  };
  return <div className="development-shell"><TopBar /><main className="coach coach-chat-page">
    <header className="coach-hero"><div><h1>Teacher’s Companion</h1></div><div className="development-account"><Link className="btn" to="/settings#set-teacher-s-companion">Profile and settings</Link></div></header>
    <div className="coach-chat-host">{user && <CoachConversation uid={user.uid} initialConversationId={params.get('conversation') || undefined} context={context} />}</div>
  </main></div>;
}
