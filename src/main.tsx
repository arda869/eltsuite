import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { UpdateBanner } from './components/UpdateBanner';
import { AuthProvider, useAuth } from './lib/auth';
import { SignIn } from './pages/SignIn';
import { EmailLinkFinish } from './pages/EmailLinkFinish';
import { TeacherHome } from './pages/TeacherHome';
import { ClassPage } from './pages/ClassPage';
import { LessonEditor } from './pages/LessonEditor';
import { LearnerLesson } from './pages/LearnerLesson';
import { LearnerJoin } from './pages/LearnerJoin';
import { LearnerHome } from './pages/LearnerHome';
import { isLearnerEmail } from './lib/learners';
import './styles.css';

function NoAccess() {
  const { signOutNow } = useAuth();
  return (
    <div className="signin">
      <div className="card">
        <h1>You’re signed out of this class</h1>
        <span className="hint">Your teacher may have removed you from the class or reset your PIN.</span>
        <button className="btn primary tall block" onClick={signOutNow}>
          Back to sign-in
        </button>
      </div>
    </div>
  );
}

function Home() {
  const { user, profile, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <SignIn />;
  if (isLearnerEmail(user.email)) {
    return profile?.role === 'learner' ? <LearnerHome classId={profile.classId} name={profile.displayName} /> : <NoAccess />;
  }
  return <TeacherHome />;
}

function Join() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <Navigate to="/" replace /> : <LearnerJoin />;
}

function TeacherOnly({ children }: { children: JSX.Element }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user && !isLearnerEmail(user.email) ? children : <Navigate to="/" replace />;
}

function LearnerOnly({ children }: { children: JSX.Element }) {
  const { user, profile, ready } = useAuth();
  if (!ready) return null;
  return user && profile?.role === 'learner' ? children : <Navigate to="/" replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <UpdateBanner />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth/link" element={<EmailLinkFinish />} />
          <Route path="/join" element={<Join />} />
          <Route path="/class/:classId" element={<TeacherOnly><ClassPage /></TeacherOnly>} />
          <Route path="/class/:classId/lesson/:itemId" element={<TeacherOnly><LessonEditor /></TeacherOnly>} />
          <Route path="/learn/:itemId" element={<LearnerOnly><LearnerLesson /></LearnerOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
