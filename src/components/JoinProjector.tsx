import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { copyText } from '../lib/copyText';
import { classJoinLink, lessonJoinLink } from '../lib/site';
import './joinProjector.css';

type Props = { className: string; classCode: string; classId: string; lesson?: { id: string; title: string }; onClose: () => void };

export function JoinProjector({ className, classCode, classId, lesson, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [copied, setCopied] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const url = lesson ? lessonJoinLink(classCode, classId, lesson.id) : classJoinLink(classCode);

  useEffect(() => {
    let active = true;
    setQr('');
    setError(false);
    void QRCode.toDataURL(url, { width: 680, margin: 2, color: { dark: '#243d37', light: '#ffffff' } })
      .then((image) => active && setQr(image), () => active && setError(true));
    return () => { active = false; };
  }, [url]);

  useEffect(() => {
    const element = root.current;
    let entered = document.fullscreenElement === element;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCloseRef.current(); } };
    const fullscreen = () => { if (document.fullscreenElement === element) entered = true; else if (entered) onCloseRef.current(); };
    document.addEventListener('keydown', key, true);
    document.addEventListener('fullscreenchange', fullscreen);
    if (element?.requestFullscreen) void element.requestFullscreen().catch(() => {});
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('fullscreenchange', fullscreen);
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  return <div ref={root} className="join-projector" role="dialog" aria-modal="true" aria-label={`Invite learners to ${lesson?.title ?? className}`}>
    <header className="join-projector-head">
      <div><span className="eyebrow">Invite learners</span><h1>{lesson?.title ?? className}</h1><p>{lesson ? `Join ${className} and open this lesson` : `Join ${className}`}</p></div>
      <button type="button" className="btn" onClick={onClose} aria-label="Close learner invitation" autoFocus>Close <span aria-hidden="true">×</span></button>
    </header>
    <div className="join-projector-main">
      <div className="join-projector-qr" aria-label="QR code for learners to join">
        {qr ? <img src={qr} alt={`Scan to join ${lesson?.title ?? className}`} /> : <span role="status">{error ? 'QR code unavailable. Learners can use the code below.' : 'Preparing QR code…'}</span>}
      </div>
      <div className="join-projector-instructions"><span className="eyebrow">Or type this class code</span><strong>{classCode}</strong><p>Open the learner site, enter this code, your name and your PIN.</p><button type="button" className="btn" onClick={() => void copyText(url).then(() => setCopied(true)).catch(() => setCopyError(true))}>{copied ? 'Link copied' : 'Copy join link'}</button>{copyError && <span role="alert">Couldn’t copy. Learners can type the class code instead.</span>}</div>
    </div>
    <footer>Press Esc to return to the {lesson ? 'lesson' : 'class'}.</footer>
  </div>;
}
