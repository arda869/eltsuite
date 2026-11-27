import { Link } from 'react-router-dom';
import { TopBar } from '../components/TopBar';

/** Legacy links stay resolvable without offering a new standalone Games app. */
export function GamesRetiredPage() {
  return <div className="shell"><TopBar /><main className="dp-msg"><h1>Games now live in lessons</h1><p>Add a game or game-style activity to a task in Classes. Existing game files remain in My Files, and live games inside lessons still work.</p><Link className="btn primary" to="/classes">Open Classes</Link><p><Link to="/archive">Find an existing game file</Link></p></main></div>;
}
