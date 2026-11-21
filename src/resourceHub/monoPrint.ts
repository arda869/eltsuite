/** Turn a raster source into white paper with ink strokes for monochrome printing. */
export function monoContours(context: CanvasRenderingContext2D, width: number, height: number): void {
  const pixels = context.getImageData(0, 0, width, height);
  const source = pixels.data;
  const shades = new Uint8Array(width * height);
  for (let i = 0; i < shades.length; i++) {
    const at = i * 4;
    const alpha = source[at + 3] / 255;
    shades[i] = Math.round((.2126 * source[at] + .7152 * source[at + 1] + .0722 * source[at + 2]) * alpha + 255 * (1 - alpha));
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, shade = shades[i];
    const left = shades[y * width + Math.max(0, x - 1)];
    const right = shades[y * width + Math.min(width - 1, x + 1)];
    const above = shades[Math.max(0, y - 1) * width + x];
    const below = shades[Math.min(height - 1, y + 1) * width + x];
    const edge = Math.max(Math.abs(shade - left), Math.abs(shade - right), Math.abs(shade - above), Math.abs(shade - below));
    const ink = shade < 105 || (shade < 230 && edge > 35);
    const at = i * 4;
    source[at] = source[at + 1] = source[at + 2] = ink ? 0 : 255;
    source[at + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
}
