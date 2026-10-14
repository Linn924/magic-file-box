import {paperSize} from '@shared/printing';
import {sheetStyle} from '@/utils/printStyles';
import type {PrintRenderer, PrintRenderContext} from '@/types/printing';

export function createWordPrintRenderer(context: PrintRenderContext): PrintRenderer {
  async function printWord(job: Awaited<ReturnType<typeof window.localPreview.consumePrint>>) {
    const paper = paperSize(job.options);
    const style = document.createElement("style");
    style.textContent = sheetStyle(paper);
    context.host.append(style);
    const section = document.createElement("section");
    section.className = "print-sheet word-host";
    section.style.alignItems = "flex-start";
    section.style.justifyContent = "flex-start";
    section.style.overflow = "visible";
    section.style.height = "auto";
    section.style.minHeight = paper.height + "mm";
    section.style.padding = "12mm";
    const body = document.createElement("div");
    section.append(body);
    context.host.append(section);
    const { renderAsync } = await import("docx-preview");
    await renderAsync(job.file.bytes, body, body, {
      useBase64URL: true,
      renderAltChunks: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
    });
    if (context.isDisposed()) return;
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (!context.isDisposed()) await context.ready();
  }

  return {render: printWord, dispose() {}};
}
