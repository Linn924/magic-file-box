import {paperSize} from '@shared/printing';
import {sheetStyle} from '@/utils/printStyles';
import type {PrintRenderer, PrintRenderContext} from '@/types/printing';

export function createImagePrintRenderer(context: PrintRenderContext): PrintRenderer {
  let url: string | undefined;
  async function printImage(job: Awaited<ReturnType<typeof window.localPreview.consumePrint>>) {
    const paper = paperSize(job.options);
    const style = document.createElement("style");
    style.textContent = sheetStyle(paper);
    context.host.append(style);
    url = URL.createObjectURL(
      new Blob([job.file.bytes.slice().buffer], {
        type:
          {
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            webp: "image/webp",
            gif: "image/gif",
            bmp: "image/bmp",
            svg: "image/svg+xml",
          }[job.file.ext] || "application/octet-stream",
      }),
    );
    const section = document.createElement("section");
    section.className = "print-sheet";
    const img = document.createElement("img");
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(Error("无法解码图片用于打印。"));
    });
    if (context.isDisposed()) return;
    section.append(img);
    context.host.append(section);
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (!context.isDisposed()) await context.ready();
  }

  return {render: printImage, dispose() {if(url) URL.revokeObjectURL(url);}};
}
