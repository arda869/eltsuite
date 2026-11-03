// Menus that open over the page (not windows) close when you click or tap anywhere else. Most
// menus in the suite already do this themselves; this is the safety net for the rest:
//  - a <details> used as a drop-down (its content floats over the page) closes;
//  - a menu button (aria-haspopup with aria-expanded="true") is pressed again to close its menu.
// Disclosure sections that open in place (Show more, a card's details) are left alone, and
// nothing inside a dialog's scrim is touched unless the click was inside that same dialog.
const floats = (el: Element) => {
  const p = getComputedStyle(el).position;
  return p === 'absolute' || p === 'fixed';
};

function popupOf(btn: HTMLElement): Element | null {
  const id = btn.getAttribute('aria-controls');
  if (id) return document.getElementById(id);
  const next = btn.nextElementSibling;
  return next && (next.matches('[role=menu], [role=listbox], .menu, [class*="-menu"], [class*="-pop"]') ? next : null);
}

export function startOutsideClose() {
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Element | null;
    if (!t || !(t instanceof Element)) return;
    // Clicks in a context menu or a portalled pop-up belong to whatever opened them.
    if (t.closest('.ctx-menu, [data-keep-open]')) return;
    for (const d of document.querySelectorAll<HTMLDetailsElement>('details[open]')) {
      if (d.contains(t) || d.hasAttribute('data-keep-open')) continue;
      const body = [...d.children].find((c) => c.tagName !== 'SUMMARY');
      if (body && floats(body)) d.open = false;
    }
    for (const b of document.querySelectorAll<HTMLElement>('[aria-haspopup]:not([aria-haspopup=false])[aria-expanded=true]')) {
      if (b.contains(t)) continue;
      const pop = popupOf(b);
      if (!pop || pop.contains(t)) continue;
      // Don't reach across dialogs: a menu in a page behind an open dialog stays as it is.
      const scope = b.closest('dialog, .scrim');
      if (scope && !scope.contains(t)) continue;
      b.click();
    }
  }, true);
}
