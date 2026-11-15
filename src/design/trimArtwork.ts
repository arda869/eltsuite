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
