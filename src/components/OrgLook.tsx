import { useEffect } from 'react';
import { useMyOrg } from '../lib/admin';

// An organisation's colour becomes the app's colour for its teachers, and its logo sits in the
// top bar of every page. Classes keep their own colours.
export function OrgLook() {
  const org = useMyOrg();
  const c = org?.brand?.color;
  useEffect(() => {
    const r = document.documentElement.style;
    const valid = !!c && /^#[0-9a-f]{6}$/i.test(c);
    if (valid) {
      document.documentElement.dataset.orgBrand = 'true';
      r.setProperty('--accent', c);
      r.setProperty('--brand', c);
      r.setProperty('--accent-text', `color-mix(in srgb, ${c} 66%, #000)`);
    } else {
      delete document.documentElement.dataset.orgBrand;
      for (const k of ['--accent', '--brand', '--accent-text']) r.removeProperty(k);
    }
    // Remembered, so the loading mark has the colour before the app starts next time.
    try {
      if (valid) localStorage.setItem('ll.brand', c!);
      else localStorage.removeItem('ll.brand');
    } catch {
      /* fine */
    }
  }, [c, org]);
  return null;
}

export function OrgLogo() {
  const org = useMyOrg();
  const src = org?.brand?.wide || org?.brand?.logo;
  if (!org || !src) return null;
  return (
    <span className={'org-logo' + (org.brand?.wide ? ' wide' : '')}>
      <img src={src} alt={org.name} title={org.name} />
    </span>
  );
}
