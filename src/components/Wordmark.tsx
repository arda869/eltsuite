const FLAME = 'M17 2 C25 14 30 22 30 30 C30 39 24 46 17 46 C10 46 4 39 4 30 C4 22 9 14 17 2 Z';

export function Wordmark({ big = false }: { big?: boolean }) {
  return (
    <span className={'wordmark' + (big ? ' big' : '')} aria-label="Lesson Lit">
      <span aria-hidden="true">
        Lesson L
        <span className="i">
          ı
          <svg viewBox="0 0 34 48">
            <path d={FLAME} fill="#d98f63" />
          </svg>
        </span>
        t
      </span>
    </span>
  );
}
