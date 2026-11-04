import type { ComponentType } from 'react';
import { useAuth } from '../lib/auth';
import { isProxyTab } from '../lib/proxy';

// Gate the panel before mounting it: some panels prepare suggestions on open.
export function teacherPanel<P extends object>(Panel: ComponentType<P>) {
  return function TeacherPanel(props: P) {
    const { profile } = useAuth();
    if (profile?.role !== 'teacher' || isProxyTab()) return null;
    return <Panel {...props} />;
  };
}
