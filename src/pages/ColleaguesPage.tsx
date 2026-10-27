import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { Loader } from '../components/Loader';
import { UiIcon } from '../components/UiIcon';

// Colleagues: the page itself lives in ./colleagues, loaded when it is opened. This file keeps
// the main navigation for teachers and learners, which many pages use.

const Page = lazy(() => import('./colleagues/Colleagues'));
export function ColleaguesPage() {
  return (
    <Suspense
      fallback={
        <div className="shell">
          <TopBar />
          <Loader label="Opening your colleagues" />
        </div>
      }
    >
      <Page />
    </Suspense>
  );
}

// No tab bar: the apps button in the top bar leads everywhere, on a phone too. Pages still say
// which place they are, for later.
export function MainNav(_: { on: 'home' | 'classes' | 'colleagues' | 'archive' | 'messages' | '' }) {
  void _;
  return null;
}

// The learner's main places, the same way: in the top bar on a computer, at the bottom on a phone.
export function LearnerNav({ on, unreadMsgs = 0, unreadThreads = 0, phoneOnly }: { on: 'home' | 'notebook' | 'messages' | 'discuss'; unreadMsgs?: number; unreadThreads?: number; phoneOnly?: boolean }) {
  const tab = (to: string, key: typeof on, icon: string, label: string, badge?: number) => (
    <Link to={to} className={'mn-tab' + (on === key ? ' on' : '')} aria-current={on === key ? 'page' : undefined}>
      <span className="mn-ic">
        <UiIcon name={icon} size={18} />
        {!!badge && <span className="nav-badge">{badge}</span>}
      </span>
      <span className="mn-l">{label}</span>
      <span className="mn-s">{label}</span>
    </Link>
  );
  return (
    <nav aria-label="Main" className={'main-nav' + (phoneOnly ? ' mn-phone' : '')}>
      {tab('/', 'home', 'home', 'Home')}
      {tab('/messages', 'messages', 'message', 'Messages', unreadMsgs)}
      {tab('/discuss', 'discuss', 'discuss', 'Discussion', unreadThreads)}
    </nav>
  );
}
