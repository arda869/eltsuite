import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { HubPage } from './catalog';

export type HubStaticOverride = { id: 'otp-002'; title: string; summary: string; pages: HubPage[]; updatedAt: number };
const ref = () => doc(db, 'resourceHubStaticOverrides', 'otp-002');

export function subscribeStaticKitOverride(onValue: (value: HubStaticOverride | null) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(ref(), snapshot => onValue(snapshot.exists() ? snapshot.data() as HubStaticOverride : null), onError);
}

export async function saveStaticKitOverride(value: HubStaticOverride): Promise<void> {
  if (!value.title.trim() || !value.summary.trim()) throw new Error('Add a title and summary.');
  if (!value.pages.length || value.pages.some(page => !page.title.trim() || !page.image.trim())) throw new Error('Each source page needs a title and image.');
  if (JSON.stringify(value).length > 850_000) throw new Error('The page images are too large for one edition. Use smaller images.');
  await setDoc(ref(), { ...value, updatedAt: Date.now() });
}

/** A small print-ready JPEG keeps the source page legible while fitting Firestore's document limit. */
export async function prepareStaticPage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP page image.');
  if (file.size > 12_000_000) throw new Error('Choose an image smaller than 12 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 500 || bitmap.height < 650) throw new Error('Choose a page image at least 500 × 650 pixels.');
    const scale = Math.min(1, 1450 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the page image.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [.9, .82, .74, .66, .58]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= 190_000) return data;
    }
    throw new Error('This page image is too detailed to save. Use a clearer, smaller export.');
  } finally { bitmap.close(); }
}
