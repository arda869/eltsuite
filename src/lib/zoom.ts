// How much an element is scaled by CSS zoom on it and its parents (the task text size uses zoom).
// Positions measured on screen are divided by this before they are used inside the element.
export function zoomOf(el: Element | null): number {
  let z = 1;
  for (let e: Element | null = el; e; e = e.parentElement) {
    const v = parseFloat(getComputedStyle(e).zoom || '1');
    if (v && isFinite(v)) z *= v;
  }
  return z || 1;
}
