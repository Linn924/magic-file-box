/** Debounced ResizeObserver that avoids "loop completed with undelivered notifications". */
export function createSafeResizeObserver(
  onResize: () => void,
): ResizeObserver {
  let pending = false;
  let raf = 0;
  const ro = new ResizeObserver(() => {
    if (pending) return;
    pending = true;
    raf = requestAnimationFrame(() => {
      pending = false;
      onResize();
    });
  });
  const originalDisconnect = ro.disconnect.bind(ro);
  ro.disconnect = () => {
    cancelAnimationFrame(raf);
    pending = false;
    originalDisconnect();
  };
  return ro;
}
