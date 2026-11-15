import { useEffect, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'> & {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
};

// An editable field with the suite's own suggestion list. Typing a new value remains possible.
export function SuggestionInput({ value, onChange, suggestions, ...inputProps }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, '');
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 220 });
  const choices = [...new Set(suggestions.map(s => s.trim()).filter(Boolean))];
  const shown = typed && value.trim()
    ? choices.filter(s => s.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()))
    : choices;
  const visible = open && shown.length > 0;

  useLayoutEffect(() => {
    if (!visible || !input.current) return;
    const place = () => {
      const r = input.current?.getBoundingClientRect();
      if (!r) return;
      const height = list.current?.offsetHeight ?? 200;
      const width = Math.min(Math.max(r.width, 180), window.innerWidth - 16);
      const above = r.top - 8;
      const below = window.innerHeight - r.bottom - 8;
      const up = below < Math.min(height, 260) && above > below;
      setPosition({
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        top: up ? Math.max(8, r.top - Math.min(height, above) - 6) : Math.min(r.bottom + 6, window.innerHeight - 8),
        width,
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => (window.removeEventListener('scroll', place, true), window.removeEventListener('resize', place));
  }, [visible, shown.length]);

  useEffect(() => {
    if (!visible) return;
    const outside = (event: MouseEvent) => {
      if (!input.current?.contains(event.target as Node) && !list.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [visible]);

  const pick = (choice: string) => {
    onChange(choice);
    setTyped(false);
    setOpen(false);
    input.current?.focus();
  };
  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && shown.length) {
      event.preventDefault();
      setOpen(true);
      setActive(i => (i + (event.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length);
    } else if (event.key === 'Enter' && visible) {
      event.preventDefault();
      pick(shown[active] ?? shown[0]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === 'Tab') setOpen(false);
    inputProps.onKeyDown?.(event);
  };

  const host = input.current?.closest('.sx, dialog, [role="dialog"]') ?? document.body;
  return <>
    <input
      {...inputProps}
      ref={input}
      type="text"
      role="combobox"
      autoComplete="off"
      aria-autocomplete="list"
      aria-haspopup="listbox"
      aria-expanded={visible}
      aria-controls={visible ? `${id}-list` : undefined}
      aria-activedescendant={visible ? `${id}-option-${active}` : undefined}
      value={value}
      onFocus={event => { setTyped(false); setActive(0); setOpen(true); inputProps.onFocus?.(event); }}
      onChange={event => { onChange(event.target.value); setTyped(true); setActive(0); setOpen(true); }}
      onKeyDown={key}
    />
    {visible && createPortal(
      <div ref={list} id={`${id}-list`} className="sel-list suggest-list" role="listbox" aria-label={inputProps['aria-label'] ? `${inputProps['aria-label']} suggestions` : 'Suggestions'} style={position}>
        {shown.map((choice, index) => <button
          key={choice}
          id={`${id}-option-${index}`}
          type="button"
          role="option"
          aria-selected={choice === value}
          tabIndex={-1}
          className={'sel-o' + (index === active ? ' hi' : '')}
          onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => setActive(index)}
          onClick={() => pick(choice)}
        >{choice}</button>)}
      </div>, host)}
  </>;
}
