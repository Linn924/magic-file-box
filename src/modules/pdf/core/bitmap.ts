/** A 6M-pixel canvas needs roughly 24 MB of uncompressed RGBA storage. */
export const MAX_PREVIEW_PIXELS = 6_000_000;

export function previewPixelRatio(
  width: number,
  height: number,
  deviceRatio: number,
  pixelBudget = MAX_PREVIEW_PIXELS,
): number {
  const area = Math.max(1, width * height);
  return Math.min(Math.max(1, deviceRatio), 2, Math.sqrt(Math.min(MAX_PREVIEW_PIXELS,pixelBudget) / area),8192/Math.max(1,width),8192/Math.max(1,height));
}
