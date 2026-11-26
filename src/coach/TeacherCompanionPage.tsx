import { Navigate, useSearchParams } from 'react-router-dom';
import { CompanionApp } from './companion/CompanionApp';

// Teacher's Companion from Apps: the full workspace (companion/CompanionApp.tsx).
export function TeacherCompanionPage() {
  const [params] = useSearchParams();
  if (params.get('section') === 'profile') return <Navigate to="/settings#set-teacher-s-companion" replace />;
  return <CompanionApp />;
}
