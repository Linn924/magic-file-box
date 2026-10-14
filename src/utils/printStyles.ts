export function sheetStyle(paper: { width: number; height: number }) {
  return `@page{size:${paper.width}mm ${paper.height}mm;margin:0}html,body,#app{margin:0;padding:0;background:white;color:black;color-scheme:light}.print-sheet{box-sizing:border-box;width:${paper.width}mm;height:${paper.height}mm;padding:10mm;break-after:page;display:flex;align-items:center;justify-content:center;overflow:hidden}.print-sheet:last-child{break-after:auto}.print-sheet canvas,.print-sheet img,.print-sheet .word-host{max-width:100%;max-height:100%;object-fit:contain}`;
}
