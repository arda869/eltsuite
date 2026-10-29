// Copying to the clipboard, which a browser can refuse (an old browser, a setting, a page in a frame).
// Then the old way is tried, and last the text is shown, ready to copy by hand. Never throws.
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* try the old way */
  }
  try {
    const a = document.createElement('textarea');
    a.value = text;
    a.setAttribute('readonly', '');
    a.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.append(a);
    a.select();
    const ok = document.execCommand('copy');
    a.remove();
    if (ok) return true;
  } catch {
    /* show it instead */
  }
  const { askText } = await import('./ask');
  void askText('Your browser didn’t let us copy this. Select it and copy it yourself.', text, { ok: 'Done', cancel: '' });
  return false;
}
