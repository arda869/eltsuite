import { Link } from 'react-router-dom';
import { Wordmark } from '../components/Wordmark';

// Placeholder privacy policy and terms, to be replaced with reviewed text before opening to other teachers.
export function Legal({ kind }: { kind: 'privacy' | 'terms' }) {
  return (
    <div className="shell narrow legal">
      <header className="topbar">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Wordmark />
        </Link>
      </header>
      <main style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span className="eyebrow">Draft · placeholder text</span>
        {kind === 'privacy' ? (
          <>
            <h1 className="page-title">Privacy policy</h1>
            <p>ELT Suite is a classroom tool for small online English classes. This page explains what we keep and why. It’s a placeholder for now. We’ll replace it with a reviewed policy before ELT Suite opens to every teacher.</p>
            <h2>What we keep</h2>
            <ul>
              <li>For teachers: name, email address and the classes, lessons and notes you make.</li>
              <li>For learners: the display name the teacher enters, a profile picture they choose, their answers, feedback, board posts and which task they are on during a lesson. Learners don’t give an email address.</li>
              <li>Short audio clips a teacher records for pronunciation.</li>
              <li>How ELT Suite is used, to run and improve it: for teachers, each visit, the pages opened and the buttons and links clicked (never what is typed); for learners, only when they came. This is kept for 90 days and only the ELT Suite team can see it.</li>
            </ul>
            <h2>Who can see it</h2>
            <p>A teacher sees the work of the learners in their classes. Learners see their own work, and what the teacher shares with the class (for example a message board or feedback a classmate sends them). We don’t sell data or show adverts.</p>
            <h2>Where it’s stored</h2>
            <p>Data is stored with Google Firebase. Answers are kept on the learner’s device until they reach the server.</p>
            <h2>Deleting data</h2>
            <p>Teachers can delete a class, which removes the learner accounts and all their data after 30 days (or straight away with “Delete now”). Teachers can delete their own account, which removes all their classes.</p>
            <h2>Contact</h2>
            <p>Questions about privacy: contact the teacher who runs your class.</p>
          </>
        ) : (
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
        )}
        <p className="hint">
          <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link>
        </p>
      </main>
    </div>
  );
}
