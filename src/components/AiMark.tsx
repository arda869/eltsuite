import type { ButtonHTMLAttributes } from 'react';

// One suite-owned mark: a rounded spark with a quiet orbit while work is running.
export function AiMark({ active = false, size = 20 }: { active?: boolean; size?: number }) {
  return <svg className={'ai-mark'+(active?' is-working':'')} width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path className="ai-mark-spark" d="M16 7.5c1.5 5.2 3.3 7 8.5 8.5-5.2 1.5-7 3.3-8.5 8.5-1.5-5.2-3.3-7-8.5-8.5 5.2-1.5 7-3.3 8.5-8.5Z" />
    <g className="ai-mark-orbit"><path d="M5 11a12 12 0 0 1 15-6M27 21a12 12 0 0 1-15 6"/><circle cx="25.2" cy="7.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="6.8" cy="24.5" r="1.4" fill="currentColor" stroke="none"/></g>
  </svg>;
}

export function AiButton({ children, working = false, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { working?: boolean }) {
  return <button {...props} className={'ai-button '+className}><AiMark active={working}/>{children}</button>;
}

export function AiProgress({ label, detail }: { label: string; detail?: string }) {
  return <div className="ai-inline-progress" role="status"><AiMark active size={26}/><div><strong>{label}</strong>{detail&&<p>{detail}</p>}</div></div>;
}
