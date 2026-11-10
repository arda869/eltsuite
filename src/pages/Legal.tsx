import { Link } from 'react-router-dom';
import { PublicLayout } from '../public/PublicSite';

// Placeholder privacy policy and terms, to be replaced with reviewed text before opening to other teachers.
export function Legal({ kind }: { kind: 'privacy' | 'terms' | 'cookies' }) {
  return (
    <PublicLayout>
      <main id="public-main" className="pub-section pub-legal" style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span className="eyebrow">Draft for review</span>
        {kind === 'privacy' ? (
          <>
            <h1 className="page-title">Privacy policy</h1>
            <p>This draft describes classroom information used in ELT Suite. The policy is under review.</p>
            <h2>What we keep</h2>
            <ul>
              <li>For teachers: name, email address and the classes, lessons and notes you make.</li>
              <li>For learners: the display name the teacher enters, a profile picture they choose, their answers, feedback, board posts and which task they are on during a lesson.</li>
              <li>Classroom materials, including recordings teachers create or upload.</li>
              <li>Usage information. The scope of analytics, access and retention periods need confirmation in the reviewed policy.</li>
            </ul>
            <h2>Who can see it</h2>
            <p>A teacher sees the work of the learners in their classes. Learners see their own work, and what the teacher shares with the class (for example a message board or feedback a classmate sends them). We don’t sell data or show adverts.</p>
            <h2>Where it’s stored</h2>
            <p>ELT Suite uses Firebase for classroom data. The reviewed policy needs to explain device storage and how external services process material when teachers use AI tools.</p>
            <h2>Deleting data</h2>
            <p>Class and account deletion are separate actions. The reviewed policy needs to specify what each action removes, including shared materials, learner records and backups.</p>
            <h2>Contact</h2>
            <p>Questions about privacy: contact the teacher who runs your class.</p>
          </>
        ) : kind === 'terms' ? (
          <>
            <h1 className="page-title">Terms of use</h1>
            <p>These are placeholder terms. We’ll replace them before ELT Suite opens to every teacher.</p>
            <ul>
              <li>Use ELT Suite for teaching and learning.</li>
              <li>Teachers are responsible for the content they add and for the learners they invite.</li>
              <li>Be kind on message boards and in feedback. Teachers can remove posts.</li>
              <li>The app is provided as it is, while we build it.</li>
            </ul>
          </>
        ) : (
          <>
            <h1 className="page-title">Cookies and storage</h1>
            <p>This page is being reviewed while we complete a feature by feature browser storage audit.</p>
            <h2>What your browser remembers</h2>
            <p>ELT Suite uses browser storage for sign-in, preferences, and drafts that may need to be recovered after a connection problem. The information used depends on the features you open.</p>
            <p>Clearing this site’s browser data may sign you out and remove work that has not yet reached the server. Check that a draft is saved before clearing it.</p>
            <h2>Questions</h2>
            <p>For questions about browser storage, <Link to="/contact">contact us</Link>.</p>
          </>
        )}
        <p className="hint">
          <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> · <Link to="/cookies">Cookies and storage</Link>
        </p>
      </main>
    </PublicLayout>
  );
}
