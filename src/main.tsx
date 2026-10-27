import { AskHost } from './lib/ask';
import { MenuHost } from './components/ContextMenu';
import { startServiceWorker } from './lib/push';
import { startTilt } from './lib/tilt';
import { startTheme } from './lib/theme';
import { AFTER_SIGN_IN } from './lib/afterSignIn';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { UpdateBanner } from './components/UpdateBanner';
import { ConnectionBanner } from './components/ConnectionBanner';
import { AuthProvider, useAuth } from './lib/auth';
import { SignIn } from './pages/SignIn';
import { ProxyGate } from './components/ProxyGate';
import { TooltipLayer } from './components/Tooltip';
import { EscapeToClose } from './components/EscapeToClose';
import { PopupGuard } from './components/PopupGuard';
import { PausedGate } from './components/PausedGate';
import { Loader } from './components/Loader';
import { isLearnerEmail } from './lib/learners';
import './styles.css';

// Pages load when they are first opened, so the first screen comes up quickly.
const DocPage = lazy(() => import('./pages/DocPage').then((m) => ({ default: m.DocPage })));
const ChatDock = lazy(() => import('./components/ChatDock').then((m) => ({ default: m.ChatDock })));
const ColleagueJoin = lazy(() => import('./pages/SharedPage').then((m) => ({ default: m.ColleagueJoin })));
const SharedPage = lazy(() => import('./pages/SharedPage').then((m) => ({ default: m.SharedPage })));
const ColleaguesPage = lazy(() => import('./pages/ColleaguesPage').then((m) => ({ default: m.ColleaguesPage })));
const MessagesPage = lazy(() => import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SoundStudio = lazy(() => import('./pages/Studio').then((m) => ({ default: m.SoundStudio })));
const TaskStudio = lazy(() => import('./pages/Studio').then((m) => ({ default: m.TaskStudio })));
const StudioSession = lazy(() => import('./pages/StudioSession').then((m) => ({ default: m.StudioSession })));
const Legal = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Legal })));
const EmailLinkFinish = lazy(() => import('./pages/EmailLinkFinish').then((m) => ({ default: m.EmailLinkFinish })));
const TeacherHome = lazy(() => import('./pages/TeacherHome').then((m) => ({ default: m.TeacherHome })));
const ClassPage = lazy(() => import('./pages/ClassPage').then((m) => ({ default: m.ClassPage })));
const LessonEditor = lazy(() => import('./pages/LessonEditor').then((m) => ({ default: m.LessonEditor })));
const LearnerNotebook = lazy(() => import('./pages/LearnerNotebook').then((m) => ({ default: m.LearnerNotebook })));
const LearnerLesson = lazy(() => import('./pages/LearnerLesson').then((m) => ({ default: m.LearnerLesson })));
const LearnerJoin = lazy(() => import('./pages/LearnerJoin').then((m) => ({ default: m.LearnerJoin })));
const LearnerHome = lazy(() => import('./pages/LearnerHome').then((m) => ({ default: m.LearnerHome })));
const LearnerRecap = lazy(() => import('./pages/RecapPages').then((m) => ({ default: m.LearnerRecap })));
const SharedRecap = lazy(() => import('./pages/RecapPages').then((m) => ({ default: m.SharedRecap })));
const LearnerDiscussion = lazy(() => import('./pages/LearnerDiscussion').then((m) => ({ default: m.LearnerDiscussion })));
const PlayPage = lazy(() => import('./pages/PlayPage').then((m) => ({ default: m.PlayPage })));
const MediaArchive = lazy(() => import('./pages/MediaArchive').then((m) => ({ default: m.MediaArchive })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const InvitePage = lazy(() => import('./pages/InvitePage').then((m) => ({ default: m.InvitePage })));

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
  if (after.startsWith('/s/') || after.startsWith('/colleague/') || after.startsWith('/invite/')) return <Navigate to={after} replace />;
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
        <PausedGate>
        <Suspense fallback={<Loader full label="" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth/link" element={<EmailLinkFinish />} />
          <Route path="/join" element={<Join />} />
          <Route path="/invite/:id" element={<InvitePage />} />
          <Route path="/admin" element={<TeacherOnly><AdminPage mode="super" /></TeacherOnly>} />
          <Route path="/org-admin" element={<TeacherOnly><AdminPage mode="org" /></TeacherOnly>} />
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
          <Route path="/studio/task/:id" element={<TeacherOnly><TaskStudio /></TeacherOnly>} />
          <Route path="/studio/session/:id" element={<TeacherOnly><StudioSession /></TeacherOnly>} />
          <Route path="/studio/sound/:id" element={<TeacherOnly><SoundStudio /></TeacherOnly>} />
          <Route path="/doc/:id" element={<SignedIn><DocPage /></SignedIn>} />
          <Route path="/doc/k/:key" element={<SignedIn><DocPage /></SignedIn>} />
          <Route path="/settings" element={<SignedIn><SettingsPage /></SignedIn>} />
          <Route path="/messages" element={<SignedIn><MessagesPage /></SignedIn>} />
          <Route path="/colleagues" element={<TeacherOnly><ColleaguesPage /></TeacherOnly>} />
          <Route path="/colleague/:token" element={<ColleagueJoin />} />
          <Route path="/privacy" element={<Legal kind="privacy" />} />
          <Route path="/terms" element={<Legal kind="terms" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </PausedGate>
        <Suspense fallback={null}>
          <ChatDock />
        </Suspense>
        <AskHost />
        <MenuHost />
        </ProxyGate>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
startServiceWorker();
