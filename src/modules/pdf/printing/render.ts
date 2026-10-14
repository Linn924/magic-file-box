import {paperSize} from '@shared/printing';
import {sheetStyle} from '@/utils/printStyles';
import type {PrintRenderer, PrintRenderContext} from '@/types/printing';
import {getDocument, GlobalWorkerOptions, type RenderTask} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {selectedPages, applyPageOrder} from '@shared/printing';
import {pdfRasterPlan} from './rasterPlan';

export function createPdfPrintRenderer(context: PrintRenderContext): PrintRenderer {
  let task: RenderTask | undefined;
  let loading: ReturnType<typeof getDocument> | undefined;
  const canvases = new Set<HTMLCanvasElement>();
  async function printPdf(job: Awaited<ReturnType<typeof window.localPreview.consumePrint>>) {
    GlobalWorkerOptions.workerSrc = workerUrl;
    const base = new URL("./pdf-assets/", location.href).href;
    loading = getDocument({
      // This hidden renderer exclusively owns the consumed job; transfer it directly.
      data: job.file.bytes,
      password: job.file.view?.pdfPassword,
      cMapUrl: base + "cmaps/",
      cMapPacked: true,
      standardFontDataUrl: base + "standard_fonts/",
      wasmUrl: base + "wasm/",
      useSystemFonts: true,
    });
    const pdf = await loading.promise;
    const permissions=await pdf.getPermissions();
    if(permissions&&!permissions.has(4))throw Error('此 PDF 不允许打印。');
    const ranged = selectedPages(job.options.range, pdf.numPages);
    const selected = applyPageOrder(ranged, job.options.pageOrder || "forward");
    if (!selected.length) throw Error("按当前页码范围与页序没有可打印的页。");
    const paper = paperSize(job.options);
    const style = document.createElement("style");
    style.textContent = sheetStyle(paper) + `.print-sheet canvas{flex:none;max-width:none;max-height:none}`;
    context.host.append(style);
    let pixels = 0;
    const plans: Array<{ index: number; raster:ReturnType<typeof pdfRasterPlan> }> = [];
    for (const index of selected) {
      if (context.isDisposed()) return;
      const page = await pdf.getPage(index);
      const original = page.getViewport({ scale: 1 });
      const raster=pdfRasterPlan(original,paper,job.options.scale||'fit',150);
      pixels += raster.width*raster.height;
      if (pixels > 60000000)
        throw Error("本次打印页数较多，请填写页码范围分批打印。");
      plans.push({ index, raster });
    }
    // Validate the whole job's raster budget before allocating any print canvases.
    for (const plan of plans) {
      if (context.isDisposed()) return;
      const page = await pdf.getPage(plan.index);
      const viewport = page.getViewport({ scale: plan.raster.scale });
      const section = document.createElement("section");
      section.className = "print-sheet";
      section.dataset.sourcePage = String(plan.index);
      const canvas = document.createElement("canvas");
      canvases.add(canvas);
      canvas.width = plan.raster.width;
      canvas.height = plan.raster.height;
      canvas.style.width = plan.raster.widthMm + 'mm';
      canvas.style.height = plan.raster.heightMm + 'mm';
      canvas.dataset.renderScale=String(plan.raster.scale);
      section.append(canvas);
      context.host.append(section);
      task = page.render({ canvas, viewport, transform:plan.raster.transform, intent:'print' });
      await task.promise;
      page.cleanup();
    }
    await document.fonts.ready;
    // Native print flushes layout; hidden-window animation frames may be throttled.
    await new Promise<void>(resolve=>setTimeout(resolve,0));
    if (!context.isDisposed()) await context.ready();
  }

  return {render: printPdf, dispose() {
    task?.cancel();
    void loading?.destroy();
    for(const canvas of canvases) {canvas.width=0;canvas.height=0;}
    canvases.clear();
  }};
}
