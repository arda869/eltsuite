// Find the marks on a rendered Designer page. The result is used only when a teacher chooses
// to insert the artwork itself; the original page is always available as a separate choice.
export type ArtworkBounds = { x: number; y: number; w: number; h: number };

export function artworkBounds(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  background: readonly [number, number, number, number],
): ArtworkBounds | null {
  if (width < 1 || height < 1 || rgba.length < width * height * 4) return null;
  let left = width, top = height, right = -1, bottom = -1, marks = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (Math.abs(rgba[i] - background[0]) < 15 &&
          Math.abs(rgba[i + 1] - background[1]) < 15 &&
          Math.abs(rgba[i + 2] - background[2]) < 15 &&
          Math.abs(rgba[i + 3] - background[3]) < 15) continue;
      marks++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (marks < 12) return null;
  const pad = Math.max(4, Math.round(Math.min(width, height) * .025));
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width, right + pad + 1);
  bottom = Math.min(height, bottom + pad + 1);
  if ((right - left) * (bottom - top) > width * height * .97) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

// The same prepared canvas becomes the picker preview and the PNG saved in a Classes task.
// A canvas factory keeps this logic usable in browserless renderer checks.
export function preparePageImage(
  source: HTMLCanvasElement,
  backgroundColor: string,
  fitArtwork: boolean,
  makeCanvas: () => HTMLCanvasElement,
): HTMLCanvasElement {
  if (!fitArtwork) return source;
  try {
    const sample = makeCanvas();
    const scanScale = Math.min(1, 1200 / Math.max(source.width, source.height));
    sample.width = Math.max(1, Math.round(source.width * scanScale));
    sample.height = Math.max(1, Math.round(source.height * scanScale));
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) return source;
    sampleContext.drawImage(source, 0, 0, sample.width, sample.height);
    const backdrop = makeCanvas();
    backdrop.width = backdrop.height = 1;
    const backdropContext = backdrop.getContext('2d');
    if (!backdropContext) return source;
    backdropContext.fillStyle = backgroundColor;
    backdropContext.fillRect(0, 0, 1, 1);
    const background = [...backdropContext.getImageData(0, 0, 1, 1).data] as [number, number, number, number];
    const bounds = artworkBounds(sampleContext.getImageData(0, 0, sample.width, sample.height).data, sample.width, sample.height, background);
    if (!bounds) return source;
    const x = Math.max(0, Math.floor(bounds.x * source.width / sample.width));
    const y = Math.max(0, Math.floor(bounds.y * source.height / sample.height));
    const right = Math.min(source.width, Math.ceil((bounds.x + bounds.w) * source.width / sample.width));
    const bottom = Math.min(source.height, Math.ceil((bounds.y + bounds.h) * source.height / sample.height));
    if (right <= x || bottom <= y) return source;
    const canvas = makeCanvas();
    canvas.width = right - x;
    canvas.height = bottom - y;
    canvas.getContext('2d')!.drawImage(source, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch {
    // If an imported image prevents pixel inspection, preserve the original page.
    return source;
  }
}
