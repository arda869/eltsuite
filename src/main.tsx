import { AskHost } from './lib/ask';
import { startTilt } from './lib/tilt';
import { ChatDock } from './components/ChatDock';
import { startTheme } from './lib/theme';
import { ColleagueJoin, SharedPage, AFTER_SIGN_IN } from './pages/SharedPage';
import { ColleaguesPage } from './pages/ColleaguesPage';
import { MessagesPage } from './pages/MessagesPage';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { UpdateBanner } from './components/UpdateBanner';
import { ConnectionBanner } from './components/ConnectionBanner';
import { Legal } from './pages/Legal';
import { AuthProvider, useAuth } from './lib/auth';
import { SignIn } from './pages/SignIn';
import { EmailLinkFinish } from './pages/EmailLinkFinish';
import { TeacherHome } from './pages/TeacherHome';
import { ClassPage } from './pages/ClassPage';
import { LessonEditor } from './pages/LessonEditor';
import { LearnerNotebook } from './pages/LearnerNotebook';
import { LearnerLesson } from './pages/LearnerLesson';
import { LearnerJoin } from './pages/LearnerJoin';
import { LearnerHome } from './pages/LearnerHome';
import { LearnerRecap, SharedRecap } from './pages/RecapPages';
import { LearnerDiscussion } from './pages/LearnerDiscussion';
import { PlayPage } from './pages/PlayPage';
import { MediaArchive } from './pages/MediaArchive';
import { ProxyGate } from './components/ProxyGate';
import { TooltipLayer } from './components/Tooltip';
import { EscapeToClose } from './components/EscapeToClose';
import { PopupGuard } from './components/PopupGuard';
import { Loader } from './components/Loader';
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

const Boot = () => <Loader full label="" />;

function Home() {
  const { user, profile, ready } = useAuth();
  if (!ready) return <Boot />;
  if (!user) return <SignIn />;
  if (isLearnerEmail(user.email)) {
    return profile?.role === 'learner' ? <LearnerHome classId={profile.classId} name={profile.displayName} /> : <NoAccess />;
  }
  // Back to a shared link opened before signing in.
  let after = '';
  try {
    after = sessionStorage.getItem(AFTER_SIGN_IN) ?? '';
    if (after) sessionStorage.removeItem(AFTER_SIGN_IN);
  } catch {
    /* fine */
  }
  if (after.startsWith('/s/') || after.startsWith('/colleague/')) return <Navigate to={after} replace />;
  return <TeacherHome />;
}

function Join() {
  const { user, ready } = useAuth();
  if (!ready) return <Boot />;
  return user ? <Navigate to="/" replace /> : <LearnerJoin />;
}

function TeacherOnly({ children }: { children: JSX.Element }) {
  const { user, ready } = useAuth();
  if (!ready) return <Boot />;
  return user && !isLearnerEmail(user.email) ? children : <Navigate to="/" replace />;
}

function SignedIn({ children }: { children: JSX.Element }) {
  const { user, profile, ready } = useAuth();
  if (!ready || (user && !profile)) return <Boot />;
  return user ? children : <Navigate to="/" replace />;
}

function LearnerOnly({ children }: { children: JSX.Element }) {
  const { user, profile, ready } = useAuth();
  if (!ready) return <Boot />;
  return user && profile?.role === 'learner' ? children : <Navigate to="/" replace />;
}

startTheme();
startTilt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <UpdateBanner />
        <TooltipLayer />
        <EscapeToClose />
        <PopupGuard />
        <ConnectionBanner />
        <ProxyGate>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth/link" element={<EmailLinkFinish />} />
          <Route path="/join" element={<Join />} />
          <Route path="/class/:classId" element={<TeacherOnly><ClassPage /></TeacherOnly>} />
          <Route path="/class/:classId/lesson/:itemId" element={<TeacherOnly><LessonEditor /></TeacherOnly>} />
          <Route path="/learn/:itemId" element={<LearnerOnly><LearnerLesson /></LearnerOnly>} />
          <Route path="/notebook" element={<LearnerOnly><LearnerNotebook /></LearnerOnly>} />
          <Route path="/recap/:itemId" element={<LearnerOnly><LearnerRecap /></LearnerOnly>} />
          <Route path="/discuss" element={<LearnerOnly><LearnerDiscussion /></LearnerOnly>} />
          <Route path="/discuss/:tid" element={<LearnerOnly><LearnerDiscussion /></LearnerOnly>} />
          <Route path="/r/:token" element={<SharedRecap />} />
          <Route path="/play/:classId/:mediaId" element={<PlayPage />} />
          <Route path="/archive" element={<TeacherOnly><MediaArchive /></TeacherOnly>} />
          <Route path="/s/:id" element={<SharedPage />} />
          <Route path="/messages" element={<SignedIn><MessagesPage /></SignedIn>} />
          <Route path="/colleagues" element={<TeacherOnly><ColleaguesPage /></TeacherOnly>} />
          <Route path="/colleague/:token" element={<ColleagueJoin />} />
          <Route path="/privacy" element={<Legal kind="privacy" />} />
          <Route path="/terms" element={<Legal kind="terms" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ChatDock />
        <AskHost />
        </ProxyGate>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
