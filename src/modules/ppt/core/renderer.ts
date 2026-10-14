import type { PptxViewer } from "@aiden0z/pptx-renderer";
import type { Presentation } from "@web-ppt/core";
import DOMPurify from "dompurify";
export interface SlidesRenderer {
  width: number;
  height: number;
  count: number;
  render(index: number): Promise<void>;
  dispose(): void;
}
export async function openSlides(
  bytes: Uint8Array,
  ext: string,
  stage: HTMLElement,
): Promise<SlidesRenderer> {
  if (ext === "pptx") {
    const { PptxViewer, RECOMMENDED_ZIP_LIMITS } = await import(
      "@aiden0z/pptx-renderer"
    );
    const viewer: PptxViewer = await PptxViewer.open(
      bytes.slice().buffer,
      stage,
      {
        renderMode: "slide",
        fitMode: "none",
        zoomPercent: 100,
        zipLimits: RECOMMENDED_ZIP_LIMITS,
        lazySlides: true,
        lazyMedia: true,
        pdfjs: false,
      },
    );
    return {
      width: viewer.slideWidth,
      height: viewer.slideHeight,
      count: viewer.slideCount,
      render: (index) => viewer.goToSlide(index),
      dispose: () => viewer.destroy(),
    };
  }
  const engine = await import("@web-ppt/core");
  const presentation: Presentation = await engine.parse(bytes);
  return {
    width: presentation.width,
    height: presentation.height,
    count: presentation.slides.length,
    async render(index) {
      // Native SVG text survives sanitization; foreignObject HTML was previously stripped.
      stage.innerHTML = DOMPurify.sanitize(
        engine.renderSlideToSvg(presentation, presentation.slides[index], {
          media: "badge",
          textMode: "svg",
        }),
        { USE_PROFILES: { svg: true, svgFilters: true } },
      );
      const svg = stage.querySelector("svg");
      if (svg) {
        svg.setAttribute("width", String(presentation.width));
        svg.setAttribute("height", String(presentation.height));
      }
    },
    dispose: () => {
      presentation.dispose?.();
      stage.replaceChildren();
    },
  };
}
