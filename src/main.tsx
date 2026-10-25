import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { SignIn } from './pages/SignIn';
import { EmailLinkFinish } from './pages/EmailLinkFinish';
import { TeacherHome } from './pages/TeacherHome';
import { ClassComingSoon, LearnerJoinComingSoon } from './pages/Placeholders';
import './styles.css';

function Home() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <TeacherHome /> : <SignIn />;
}

function TeacherOnly({ children }: { children: JSX.Element }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? children : <Navigate to="/" replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth/link" element={<EmailLinkFinish />} />
          <Route path="/join" element={<LearnerJoinComingSoon />} />
          <Route
            path="/class/:classId"
            element={
              <TeacherOnly>
                <ClassComingSoon />
              </TeacherOnly>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
