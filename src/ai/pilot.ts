import { useAuth } from '../lib/auth';
export function useAiPilot() {
  const { user } = useAuth();
  const email = String(import.meta.env.VITE_ELT_AI_PILOT_EMAIL ?? '').toLowerCase();
  return import.meta.env.VITE_ELT_AI_PILOT === 'true' && !!user && (!email || user.email?.toLowerCase() === email);
}
