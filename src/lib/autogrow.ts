// Every multi-line text box in the suite starts one line high and grows as the teacher or learner
// adds lines, then shrinks again when lines go. A box with a max-height (a chat composer, say)
// grows to that height and then scrolls.
//
// It works on every <textarea>, including ones React fills in from code, so pages don't each need
// to remember to use a special component. Leave a box at its own size with data-autogrow="off", or
// with one of the classes in KEEP: boxes that are meant to be big from the start.
const KEEP = '[data-autogrow="off"], .import-src textarea, .writing-q textarea, .gl-textarea, .cm-content';

const sized = new WeakSet<HTMLTextAreaElement>();
let queued = new Set<HTMLTextAreaElement>();
let raf = 0;

function fit(el: HTMLTextAreaElement) {
  if (!el.isConnected || el.matches(KEEP)) return;
  const cs = getComputedStyle(el);
  if (cs.display === 'none') return;
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  // Keep the page from jumping while we measure: hold the scroll position of the nearest scroller.
  const scroller = document.scrollingElement;
  const top = scroller?.scrollTop ?? 0;
  el.style.height = 'auto';
  const want = el.scrollHeight + (cs.boxSizing === 'border-box' ? border : 0);
  const max = parseFloat(cs.maxHeight);
  const capped = Number.isFinite(max) && want > max;
  el.style.height = `${capped ? max : want}px`;
  el.style.overflowY = capped ? 'auto' : 'hidden';
  if (scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
}

function soon(el: HTMLTextAreaElement) {
  queued.add(el);
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const now = queued;
    queued = new Set();
    now.forEach(fit);
  });
}

const widths = new WeakMap<Element, number>();
const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
  for (const e of entries) {
    const w = Math.round(e.contentRect.width);
    if (widths.get(e.target) !== w) { widths.set(e.target, w); soon(e.target as HTMLTextAreaElement); }
  }
});

function take(el: HTMLTextAreaElement) {
  if (sized.has(el) || el.matches(KEEP)) return;
  sized.add(el);
  // One line to start with. A page's CSS min-height would stop that, so it goes for these boxes.
  if (!el.hasAttribute('data-rows')) el.rows = 1;
  el.style.minHeight = '0';
  el.style.resize = 'none';
  el.classList.add('autogrow');
  resize?.observe(el);
  soon(el);
}

function scan(root: ParentNode) {
  if (root instanceof HTMLTextAreaElement) take(root);
  root.querySelectorAll?.('textarea').forEach((t) => take(t as HTMLTextAreaElement));
}

export function startAutogrow() {
  // React sets a controlled box's text through the value property, not by typing: watch that too.
  const proto = HTMLTextAreaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set && desc.get) {
    Object.defineProperty(proto, 'value', {
      ...desc,
      set(this: HTMLTextAreaElement, v: string) { desc.set!.call(this, v); if (sized.has(this)) soon(this); },
    });
  }
  document.addEventListener('input', (e) => { if (e.target instanceof HTMLTextAreaElement && sized.has(e.target)) fit(e.target); }, true);
  // A box inside something that was hidden (a closed card, a tab) measures 0 until it shows.
  document.addEventListener('toggle', (e) => (e.target as Element).querySelectorAll?.('textarea').forEach((t) => soon(t as HTMLTextAreaElement)), true);
  document.addEventListener('focusin', (e) => { if (e.target instanceof HTMLTextAreaElement && sized.has(e.target)) soon(e.target); });
  new MutationObserver((list) => {
    for (const m of list) m.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n as Element); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  scan(document);
  // Fonts arriving change line heights.
  document.fonts?.ready.then(() => document.querySelectorAll('textarea.autogrow').forEach((t) => soon(t as HTMLTextAreaElement)));
}
