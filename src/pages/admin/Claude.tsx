import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { composing } from '../../lib/keys';
import { UiIcon } from '../../components/UiIcon';
import { Loader } from '../../components/Loader';
import { STATE_LABEL, markSeen, sendToClaude, startThread, useThread, useThreadParts, type Thread, type ThreadState } from '../../lib/claude';
import type { NewShot } from '../../lib/tickets';
import { Empty, PageHead, Sheet, ago, useNote } from './ui';
import { ShotPicker, Shots } from './shots';
import type { Go } from './types';

// Super Admin → Claude: conversations with Claude, who works in ELT Suite's code (see lib/claude.ts).
// A message waits until the Claude workflow runs; then Claude reads the
// whole conversation, does the work and answers here, with a pull request for anything it changed.

const WAIT_NOTE = 'Waiting for Claude to pick this up. A change can take a while.';

export function ClaudeArea({ threads, params, go }: { threads: Thread[] | null; params: URLSearchParams; go: Go }) {
  const c = params.get('c');
  if (c) return <ThreadView key={c} id={c} go={go} />;
  return <ThreadList threads={threads} go={go} />;
}

const StateTag = ({ s }: { s: ThreadState }) => <span className={'hq-tk-st cl-' + s}>{STATE_LABEL[s]}</span>;
const useMe = () => {
  const { user, profile } = useAuth();
  return { uid: user?.uid ?? '', name: (profile?.role === 'teacher' ? profile.displayName : '') || user?.displayName || user?.email || 'A super admin' };
};

function ThreadList({ threads, go }: { threads: Thread[] | null; go: Go }) {
  const [making, setMaking] = useState(false);
  return (
    <div className="hq-page">
      <PageHead
        title="Claude"
        lede="Ask Claude to change something in ELT Suite, to look into a problem, or about how something works. Claude works in ELT Suite's code and answers here. Anything it changes waits on GitHub, as a pull request, until someone checks and merges it."
        actions={
          <button type="button" className="btn primary" onClick={() => setMaking(true)}>
            <UiIcon name="plus" size={15} /> New conversation
          </button>
        }
      />
      {threads === null ? (
        <Loader label="Loading conversations" />
      ) : !threads.length ? (
        <Empty
          title="No conversations yet"
          text="Start one, or open a support ticket and choose Ask Claude."
          action={
            <button type="button" className="btn" onClick={() => setMaking(true)}>
              New conversation
            </button>
          }
        />
      ) : (
        <div className="hq-table-wrap">
          <table className="hq-table">
            <thead>
              <tr>
                <th>Conversation</th>
                <th>Where it is</th>
                <th>Updated</th>
                <th className="hq-c-go">
                  <span className="hq-sr">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {threads.map((t) => (
                <tr key={t.id} className={(t.state === 'answered' || t.state === 'failed') && !t.seen ? 'cl-new' : ''} onClick={() => go({ tab: 'claude', c: t.id })}>
                  <td data-label="Conversation">
                    <button type="button" className="hq-row-open hq-tk-name" onClick={(e) => (e.stopPropagation(), go({ tab: 'claude', c: t.id }))}>
                      <b>{t.title}</b>
                      <span>
                        {t.byName}
                        {t.ticket && <span className="hq-chip">Support ticket</span>}
                        {t.pr && <span className="hq-chip">Changes ready</span>}
                      </span>
                    </button>
                  </td>
                  <td data-label="Where it is">
                    <StateTag s={t.state} />
                  </td>
                  <td data-label="Updated">{ago(t.updatedAt)}</td>
                  <td className="hq-c-go" aria-hidden="true">
                    ›
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {making && <NewThread onClose={() => setMaking(false)} onDone={(id) => (setMaking(false), go({ tab: 'claude', c: id }))} />}
    </div>
  );
}

function NewThread({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const me = useMe();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [shots, setShots] = useState<NewShot[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ok = text.trim() || shots.length;
  const send = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      onDone(await startThread(me, title.trim() || text.trim().split('\n')[0].slice(0, 80), text.trim(), shots));
    } catch (e) {
      setErr('That could not be sent: ' + ((e as Error).message || 'try again.'));
      setBusy(false);
    }
  };
  return (
    <Sheet title="New conversation with Claude" onClose={onClose} wide>
      <label className="field">
        <span>About</span>
        <input className="hq-in" name="title" maxLength={140} autoComplete="off" placeholder="For example: a dark theme for the timetable" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>What you would like</span>
        <textarea className="hq-in" name="message" rows={7} maxLength={20000} placeholder="Say it as you would to a developer: what should change, where, and how you will know it works. Paste screenshots with Ctrl+V or ⌘V." value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <ShotPicker shots={shots} setShots={setShots} />
      <span className="hint">{WAIT_NOTE}</span>
      {err && (
        <span className="hint hq-tk-err" role="alert">
          {err}
        </span>
      )}
      <div className="hq-sheet-f">
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!ok || busy} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send to Claude'}
        </button>
      </div>
    </Sheet>
  );
}

// Links in what Claude writes can be clicked.
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)<>]+)/g);
  return (
    <p className="hq-tk-body">
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </p>
  );
}

function ThreadView({ id, go }: { id: string; go: Go }) {
  const t = useThread(id);
  const { messages, shots } = useThreadParts(id);
  const me = useMe();
  const [text, setText] = useState('');
  const [add, setAdd] = useState<NewShot[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, say] = useNote();
  useEffect(() => void (t && markSeen(t)), [t]);
  if (t === undefined) return <Loader label="Opening the conversation" />;
  const back = (
    <Link to={{ search: '?tab=claude' }} onClick={(e) => (e.preventDefault(), go({ tab: 'claude' }))}>
      ‹ All conversations
    </Link>
  );
  if (t === null)
    return (
      <div className="hq-page">
        <PageHead crumb={back} title="This conversation is not here" />
      </div>
    );
  const busyClaude = t.state === 'waiting' || t.state === 'working';
  const send = async () => {
    const words = text.trim();
    if (busy || (!words && !add.length)) return;
    setBusy(true);
    try {
      await sendToClaude(t, me, words, add);
      setText('');
      setAdd([]);
      say('Sent. ' + WAIT_NOTE);
    } catch {
      say('That could not be sent. Try again.');
    }
    setBusy(false);
  };
  const late = t.state === 'waiting' && Date.now() - t.updatedAt > 40 * 60 * 1000;
  const lede: ReactNode = (
    <>
      <StateTag s={t.state} /> Started by {t.byName}, {ago(t.at)}
      {t.ticket && (
        <>
          {' · '}
          <Link to={`/admin?tab=tickets&t=${t.ticket}`}>the support ticket</Link>
        </>
      )}
    </>
  );
  return (
    <div className="hq-page">
      <PageHead
        crumb={back}
        title={t.title}
        lede={lede}
        actions={
          t.pr && (
            <a className="btn" href={t.pr} target="_blank" rel="noreferrer" title="Claude's changes go live once this pull request is merged">
              See the changes on GitHub
            </a>
          )
        }
      />
      {messages === null ? (
        <Loader label="Loading the conversation" />
      ) : (
        <ol className="cl-msgs">
          {messages.map((m) => (
            <li key={m.id} className={'cl-msg ' + m.role}>
              <span className="hq-tk-nh">
                <b>{m.role === 'claude' ? 'Claude' : m.byName}</b> <span>{ago(m.at)}</span>
              </span>
              {m.text && <Linked text={m.text} />}
              <Shots list={(shots ?? []).filter((s) => s.msg === m.id)} />
            </li>
          ))}
          {busyClaude && (
            <li className="cl-msg claude wait">
              <span className="cl-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span role="status">{t.state === 'working' ? 'Claude is working on it. This page updates by itself.' : WAIT_NOTE}</span>
            </li>
          )}
        </ol>
      )}
      {late && <span className="hint hq-tk-err">Claude has not picked this up yet. If it stays like this, check that the Claude workflow is set up (see Settings in the GitHub repository: the ANTHROPIC_API_KEY secret).</span>}
      <div className="cl-compose">
        <label className="field">
          <span>Write to Claude</span>
          <textarea
            className="hq-in"
            name="message"
            rows={4}
            maxLength={20000}
            value={text}
            placeholder="Answer Claude, or ask for something more. Paste screenshots here. Ctrl+Enter or ⌘↩ sends."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !composing(e) && (e.preventDefault(), void send())}
          />
        </label>
        <ShotPicker shots={add} setShots={setAdd} />
        <span className="hq-tk-send">
          <button type="button" className="btn primary" disabled={busy || (!text.trim() && !add.length)} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </span>
      </div>
      {toast}
    </div>
  );
}
