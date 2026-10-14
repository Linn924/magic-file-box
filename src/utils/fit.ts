export type FitMode = "original" | "width" | "page";
export function fitScale(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
  mode: FitMode,
  fallback = 1,
) {
  if (mode === "original") return fallback;
  const horizontal = Math.max(1, availableWidth) / Math.max(1, width);
  return mode === "width"
    ? horizontal
    : Math.min(horizontal, Math.max(1, availableHeight) / Math.max(1, height));
}
