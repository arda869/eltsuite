/** Collection identity images are small, owner-authored assets stored with the private draft
 * and copied into the public edition at publish time. No separate media ACL is required. */
export async function prepareHubImage(file: File, kind: 'cover' | 'header'): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 12_000_000) throw new Error('Choose an image smaller than 12 MB.');
  const image = await createImageBitmap(file);
  try {
    const minWidth = kind === 'cover' ? 500 : 700;
    const minHeight = kind === 'cover' ? 500 : 150;
    if (image.width < minWidth || image.height < minHeight) throw new Error(`This image is too small. Use at least ${minWidth} × ${minHeight} pixels.`);
    const width = kind === 'cover' ? 540 : 1040;
    const height = kind === 'cover' ? 720 : 240;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the image.');
    const scale = Math.max(width / image.width, height / image.height);
    const scaledWidth = image.width * scale, scaledHeight = image.height * scale;
    context.drawImage(image, (width - scaledWidth) / 2, (height - scaledHeight) / 2, scaledWidth, scaledHeight);
    for (const quality of [0.86, 0.74, 0.62, 0.5, 0.38]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= 190_000) return data;
    }
    throw new Error('This image has too much detail to save. Try a simpler picture.');
  } finally { image.close(); }
}
