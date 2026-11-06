import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../lib/firebase';
import { tell } from '../lib/ask';
import { assetBlob } from '../video/library';
import type { VideoAsset } from '../video/model';
import { AiButton } from '../components/AiMark';
import type { Ctx } from './Editor';
import { metaRef, saveMeta, storePicture, VIEWS, type ArtView, type El } from './model';
import { CHAR_FACES, CHAR_POSES, parseVariant, REF, variantKey } from './variants';

// The controls for a saved character on the page: the side it is seen from, its pose and its
// expression. A variation that already exists (made earlier, in any file) is used at once and costs
// nothing; one that doesn't is made with AI, and the bar says what that costs before it runs.
// Nothing is made without the teacher pressing the button.

const call = httpsCallable<Record<string, unknown>, { status?: string; variantId?: string | null; cached?: boolean; limit?: number | null; used?: number; left?: number | null }>(getFunctions(undefined, 'us-central1'), 'designerImage', { timeout: 300000 });

export function CharacterBar({ cx, e }: { cx: Ctx; e: El }) {
  const [asset, setAsset] = useState<VideoAsset | null | undefined>(undefined);
  const [busy, setBusy] = useState('');
  const applying = useRef(false);
  const requests = useRef(new Map<string, string>());
  const [quoteError, setQuoteError] = useState(false);
  const [quote, setQuote] = useState<{ limit: number | null; left: number | null } | null>(null);
  const cur = parseVariant(e.variant) ?? REF;
  const key = e.variant && e.variant !== 'ref' ? e.variant : 'ref';
  useEffect(() => {
    if (!e.char) return;
    const u = onSnapshot(doc(db, 'videoAssets', e.char), (s) => setAsset(s.exists() ? ({ id: s.id, ...s.data() } as VideoAsset) : null), () => setAsset(null));
    return u;
  }, [e.char]);
  // The variation wanted, and whether it exists already.
  const [want, setWant] = useState(cur);
  useEffect(() => setWant(parseVariant(e.variant) ?? REF), [e.id, e.variant]);
  const wantKey = variantKey(want);
  const isRef = wantKey === variantKey(REF);
  const have = isRef || !!asset?.variants?.[wantKey];
  const same = (isRef ? 'ref' : wantKey) === key;
  useEffect(() => {
    if (have || same || quote || quoteError) return;
    let on = true;
    void call({ action: 'quote', fileId: cx.d.id }).then((r) => on && setQuote({ limit: r.data.limit ?? null, left: r.data.left ?? null })).catch(() => on && setQuoteError(true));
    return () => void (on = false);
  }, [have, same, quote, quoteError, cx.d.id]);

  // Puts a variation (or the reference) in this element: from this file's media if it is already
  // there, otherwise copied in once and remembered in the file.
  const show = async (variantKeyOrRef: string, assetId: string) => {
    const mk = `${e.char}:${variantKeyOrRef}`;
    const meta = (await getDoc(metaRef(cx.d.id))).data() as { charMedia?: Record<string, string> } | undefined;
    let media = meta?.charMedia?.[mk];
    let iw = e.iw;
    let ih = e.ih;
    if (!media) {
      const blob = await assetBlob(assetId);
      const stored = await storePicture(cx.d.id, blob);
      media = stored.id;
      iw = stored.w;
      ih = stored.h;
      await saveMeta(cx.d.id, { charMedia: { ...(meta?.charMedia ?? {}), [mk]: media } });
    } else {
      const bmp = await createImageBitmap(await assetBlob(assetId)).catch(() => null);
      if (bmp) { iw = bmp.width; ih = bmp.height; bmp.close(); }
    }
    // Keep the feet where they are and the height; the width follows the new picture's shape.
    const ratio = iw && ih ? iw / ih : e.w / e.h;
    const w = Math.round(e.h * ratio);
    cx.patch({ [e.id]: { img: media, iw, ih, crop: undefined, variant: variantKeyOrRef, x: Math.round(e.x + e.w / 2 - w / 2), w, view: want.view } });
  };
  const apply = async () => {
    if (!e.char || !asset || applying.current) return;
    applying.current = true;
    setBusy('One moment…');
    try {
      if (isRef) await show('ref', e.char);
      else {
        const id = asset.variants?.[wantKey];
        if (id) await show(wantKey, id);
        else {
          setBusy('Drawing this view…');
          const requestKey = `${cx.d.id}:${e.char}:${wantKey}`;
          const requestId = requests.current.get(requestKey) ?? crypto.randomUUID();
          requests.current.set(requestKey, requestId);
          const r = await call({ action: 'variant', fileId: cx.d.id, requestId, characterId: e.char, variant: wantKey });
          if (r.data.status === 'failed') requests.current.delete(requestKey);
          if (r.data.status !== 'completed' || !r.data.variantId) throw new Error('not-ready');
          setQuote(null);
          await show(wantKey, r.data.variantId);
        }
      }
    } catch (err) {
      const msg = err instanceof Error && /resource-exhausted|daily uses|disabled/.test(err.message) ? err.message : 'We couldn’t show that view just now. Your character is unchanged. Check your connection and try again.';
      void tell(msg);
    } finally {
      applying.current = false;
      setBusy('');
    }
  };
  const costNote = useMemo(() => {
    if (have || same) return '';
    if (quoteError) return 'We couldn’t check your remaining images. Please reopen this character to try again.';
    if (!quote) return 'This view isn’t drawn yet. Making it uses one of your Designer images.';
    if (quote.limit === null) return 'This view isn’t drawn yet. Making it uses one Designer image (no daily limit on your account).';
    if (quote.left === 0) return 'This view isn’t drawn yet, and you’ve used all your Designer images for today.';
    return `This view isn’t drawn yet. Making it uses 1 of your Designer images (${quote.left} of ${quote.limit} left today).`;
  }, [have, same, quote, quoteError]);

  if (asset === null) return <span className="dz-float-t">This character is no longer in your library. The picture stays as it is.</span>;
  const canEdit = !!asset && !busy;
  return (
    <div className="dz-charbar" role="group" aria-label={asset ? `${asset.name}: view, pose and expression` : 'Character'}>
      <span className="dz-views" role="group" aria-label="Seen from">
        {VIEWS.map((v) => (
          <button key={v.k} type="button" className={want.view === v.k ? 'on' : ''} aria-pressed={want.view === v.k} aria-label={v.name} data-tip={v.name} disabled={!canEdit} onClick={() => setWant({ ...want, view: v.k as ArtView })}>
            {v.short}
          </button>
        ))}
      </span>
      <select className="dz-float-sel" value={want.pose} aria-label="Pose" disabled={!canEdit} onChange={(ev) => setWant({ ...want, pose: ev.target.value })}>
        {CHAR_POSES.map((p) => (
          <option key={p.k} value={p.k}>{p.name}</option>
        ))}
      </select>
      <select className="dz-float-sel" value={want.face} aria-label="Expression" disabled={!canEdit} onChange={(ev) => setWant({ ...want, face: ev.target.value })}>
        {CHAR_FACES.map((f) => (
          <option key={f.k} value={f.k}>{f.name}</option>
        ))}
      </select>
      {!same &&
        (have ? (
          <button type="button" className="primary" disabled={!canEdit} onClick={() => void apply()}>
            {busy || (isRef ? 'Use the reference picture' : 'Show this view')}
          </button>
        ) : (
          <AiButton className="primary" disabled={!canEdit || !quote || quoteError || quote.left === 0} onClick={() => void apply()}>
            {busy || 'Draw this view'}
          </AiButton>
        ))}
      {costNote && <span className="dz-float-t dz-cost" role="status">{costNote}</span>}
      {busy && same && <span className="dz-float-t" role="status">{busy}</span>}
    </div>
  );
}
