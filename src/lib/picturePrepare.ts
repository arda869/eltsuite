// Keep the picture preparation used by rich text and SuiteScript in one pure
// module. This avoids pulling editor UI into a file-reference resolution path.
export type PicQuality = 'high' | 'standard' | 'small';
export const PIC_QUALITY: { k: PicQuality; label: string; about: string; max: [number, number]; q: number; limit: number }[] = [
  { k: 'high', label: 'High', about: 'Sharp on a big screen', max: [2000, 1500], q: 0.88, limit: 560 },
  { k: 'standard', label: 'Standard', about: 'Good for most tasks', max: [1400, 1000], q: 0.82, limit: 500 },
  { k: 'small', label: 'Small', about: 'Saves the most space', max: [900, 700], q: 0.7, limit: 220 },
];

export const shrinkPicture = async (bmp: ImageBitmap, maxW: number, maxH: number, q0: number, limitKB: number) => {
  const scale = Math.min(1, maxW / bmp.width, maxH / bmp.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  let q = q0;
  let blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', q));
  while (blob.size > limitKB * 1024 && q > 0.4) {
    q -= 0.12;
    blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', q));
  }
  return { blob, canvas: c };
};

export async function preparePicture(file: Blob, quality: PicQuality = 'standard'): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    const p = PIC_QUALITY.find(x => x.k === quality) ?? PIC_QUALITY[1];
    return (await shrinkPicture(bmp, p.max[0], p.max[1], p.q, p.limit)).blob;
  } finally { bmp.close(); }
}
