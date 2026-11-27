import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import './standaloneLessonInvite.css';

export const lessonJoinLink = (code: string) => `${window.location.origin}/lesson-join/${encodeURIComponent(code)}`;

export function useLessonJoinQR(code: string, width: number) {
  const [qr, setQr] = useState('');
  useEffect(() => {
    let active = true;
    setQr('');
    if (code) void QRCode.toDataURL(lessonJoinLink(code), {
      width,
      margin: 1,
      color: { dark: '#243c34', light: '#ffffff' },
    }).then(value => { if (active) setQr(value); }).catch(() => { if (active) setQr(''); });
    return () => { active = false; };
  }, [code, width]);
  return qr;
}

type Props = {
  code: string;
  runId: string;
  onClose: () => void;
  onViewRoom: () => void;
};

export function StandaloneLessonInvite({ code, runId, onClose, onViewRoom }: Props) {
  const qr = useLessonJoinQR(code, 360);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const buttons = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'));
      if (!buttons.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, []);
  const copyLink = async () => {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(lessonJoinLink(code));
      setCopied(true);
    } catch { setCopyError(true); }
  };
  return createPortal(<div className="rll-invite-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="rll-invite-title" className="rll-invite-dialog">
      <header className="rll-invite-head"><div><span className="rll-invite-kicker">LESSON → INVITE LEARNERS</span><h2 id="rll-invite-title">Invite learners live</h2></div><button ref={closeRef} type="button" className="rll-invite-close" aria-label="Close invitation" onClick={onClose}>×</button></header>
      <div className="rll-invite-body"><p>Your standalone lesson is ready to share. Show the code on a classroom screen or send the link. Learners join with their names.</p>
        <div className="rll-invite-code-card"><div><span>LESSON CODE</span><strong>{code}</strong><small>Use this code to join the live lesson</small></div>{qr ? <img src={qr} alt={`QR code to join lesson ${code}`} /> : <div className="rll-invite-qr-loading" role="status">Preparing QR code…</div>}</div>
        <div className="rll-invite-link"><span>{lessonJoinLink(code)}</span><button type="button" onClick={() => void copyLink()}>{copied ? 'Copied' : 'Copy link'}</button></div>
        {copyError && <p role="alert" className="rll-invite-copy-error">Couldn’t copy the link. You can select it above.</p>}
        <div className="rll-invite-actions"><a className="rll-invite-primary" href={`/resource-hub/lesson/live/${encodeURIComponent(runId)}?project=1`} target="_blank" rel="noopener noreferrer"><span aria-hidden="true">▣</span> Show on classroom screen</a><button type="button" className="rll-invite-secondary" onClick={onViewRoom}>View room <span aria-hidden="true">→</span></button></div>
        <div className="rll-invite-steps"><h3>What learners see</h3><p><b>1</b> Scan the QR code or open the lesson link.</p><p><b>2</b> Enter a name and join this live lesson.</p></div>
      </div>
      <footer className="rll-invite-foot"><span><i aria-hidden="true" /> Ready for learners · No class required</span><small>Only people with the code can join</small></footer>
    </section>
  </div>, document.body);
}
