import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
export function VideoDialog({
  name,
  onClose,
  children,
  minimised = false,
  onMinimise,
  portal = false,
}: {
  name: string;
  onClose: () => void;
  children: ReactNode;
  minimised?: boolean;
  onMinimise?: () => void;
  portal?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);
  const dialog = (
    <div
      className={"vx-dialog-backdrop"+(minimised?" ai-panel-minimised":"")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="vx-share"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
          if (e.key === "Tab") {
            const fields = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[href]",
              ),
            );
            const first = fields[0],
              last = fields.at(-1);
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (
              !e.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        {onMinimise&&<button type="button" className="btn ai-minimise" onClick={onMinimise} aria-label="Minimise" title="Minimise: keep it running in the corner while you work"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 12h12"/></svg></button>}
        {children}
      </div>
    </div>
  );
  return portal ? createPortal(dialog, document.querySelector('.shell.wide') ?? document.body) : dialog;
}
