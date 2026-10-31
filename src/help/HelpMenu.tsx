import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isProxyTab } from '../lib/proxy';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UiIcon } from '../components/UiIcon';
import './help.css';

export function HelpMenu() {
  const { user, profile } = useAuth();
  if (!user || profile?.role !== 'teacher' || isProxyTab()) return null;
  return <Menu key={user.uid} uid={user.uid} />;
}
function Menu({ uid }: { uid: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [unread, setUnread] = useState(false);
  useEffect(() => onSnapshot(doc(db, 'featureDiscovery', uid), snap => {
    const data = snap.data();
    setUnread(!!(data?.settings?.enabled && data.settings.tracking && data.settings.pausedUntil <= Date.now() && data.delivery?.read === false));
  }, () => setUnread(false)), [uid]);
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent('top-menu', { detail: 'help' }));
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const other = (e: Event) => { if ((e as CustomEvent).detail !== 'help') setOpen(false); };
    document.addEventListener('mousedown', outside);
    window.addEventListener('top-menu', other);
    return () => { document.removeEventListener('mousedown', outside); window.removeEventListener('top-menu', other); };
  }, [open]);
  function launch(panel: string) { setOpen(false); window.dispatchEvent(new Event('elt-open-' + panel)); }
  return <div className="help-menu" ref={root} onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus();
    }
    if (e.key === 'Tab') setOpen(false);
  }}>
    <button ref={trigger} className="help-menu-trigger" type="button" data-help-trigger aria-label="Help" aria-description={unread ? 'A new discovery suggestion is available' : undefined} data-tip="Help and discovery" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}><UiIcon name="help" size={21} />{unread && <span className="help-menu-dot" aria-hidden="true" />}</button>
    {open && <div className="help-menu-pop" role="menu" aria-label="Help and discovery"><button type="button" role="menuitem" onClick={() => launch('help')}><UiIcon name="message" size={18} /><span><b>Ask ELT Suite</b><small>Get help with your next step</small></span></button><button type="button" role="menuitem" onClick={() => launch('discovery')}><UiIcon name="help" size={18} /><span><b>Discover</b><small>{unread ? 'A new suggestion for you' : 'Explore more of ELT Suite'}</small></span></button><Link role="menuitem" to="/guide" onClick={() => setOpen(false)}><UiIcon name="classes" size={18} /><span><b>Open the guide</b><small>Browse the platform’s features</small></span></Link></div>}
  </div>;
}
