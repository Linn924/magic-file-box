/** Temporary DOM-only column sizing. No document data is written back. */
export interface TableResizeOptions {
  /** `tableIndex:colIndex` → px */
  initial?: Record<string, number>;
  onChange?: (widths: Record<string, number>) => void;
}
export function attachTableResize(
  root: ShadowRoot | HTMLElement,
  options: TableResizeOptions = {},
): () => void {
  const cleanups: Array<() => void> = [];
  const widths: Record<string, number> = { ...(options.initial || {}) };
  const emit = () => options.onChange?.({ ...widths });
  root.querySelectorAll<HTMLTableElement>("table").forEach((table, tableIndex) => {
    table.style.tableLayout = "fixed";
    table.style.minWidth = table.getBoundingClientRect().width + "px";
    const cells = Array.from(table.rows[0]?.cells || []);
    cells.forEach((cell, colIndex) => {
      const key = `${tableIndex}:${colIndex}`;
      const saved = widths[key];
      if (saved && saved > 0) {
        cell.style.width = saved + "px";
        const tableW =
          table.offsetWidth + saved - (cell.offsetWidth || saved);
        if (tableW > 0) {
          table.style.width = tableW + "px";
          table.style.minWidth = table.style.width;
        }
      }
      cell.style.position = "relative";
      const handle = document.createElement("span");
      handle.className = "column-resize-handle";
      handle.title = "拖动调整列宽";
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-orientation", "vertical");
      handle.style.cssText =
        "position:absolute;right:-3px;top:0;height:100%;width:7px;cursor:col-resize;background:rgba(62,117,211,.18);z-index:20;touch-action:none";
      const down = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const start = event.clientX,
          width = cell.offsetWidth,
          tableWidth = table.offsetWidth;
        const zoom =
          cell.getBoundingClientRect().width / Math.max(1, cell.offsetWidth);
        handle.setPointerCapture(event.pointerId);
        const move = (e: PointerEvent) => {
          const next = Math.max(
            40,
            Math.min(1800, width + (e.clientX - start) / zoom),
          );
          cell.style.width = next + "px";
          table.style.width = tableWidth + next - width + "px";
          table.style.minWidth = table.style.width;
          widths[key] = next;
          emit();
        };
        const up = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
        cleanups.push(up);
      };
      handle.addEventListener("pointerdown", down);
      cell.append(handle);
      cleanups.push(() => {
        handle.removeEventListener("pointerdown", down);
        handle.remove();
      });
    });
  });
  return () => cleanups.forEach((fn) => fn());
}
