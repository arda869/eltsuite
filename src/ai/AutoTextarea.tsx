import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const style = getComputedStyle(el);
    el.style.height = `${el.scrollHeight + parseFloat(style.borderTopWidth || '0') + parseFloat(style.borderBottomWidth || '0')}px`;
  };
  useLayoutEffect(fit, [props.value]);
  useLayoutEffect(() => {
    const el=ref.current;
    if (!el) return;
    let width=el.clientWidth;
    const observer=new ResizeObserver(()=>{if(el.clientWidth!==width){width=el.clientWidth;fit();}});
    observer.observe(el);
    // Fields inside collapsed cards need measuring when their card opens.
    const ancestors:HTMLDetailsElement[]=[];
    let parent=el.parentElement;
    while(parent){if(parent instanceof HTMLDetailsElement){ancestors.push(parent);parent.addEventListener('toggle',fit);}parent=parent.parentElement;}
    return ()=>{observer.disconnect();ancestors.forEach(parent=>parent.removeEventListener('toggle',fit));};
  }, []);
  return <textarea {...props} ref={ref} rows={1} style={{...props.style,resize:'none',overflow:'hidden',minHeight:0}} onChange={e=>{fit();props.onChange?.(e);}} />;
}
