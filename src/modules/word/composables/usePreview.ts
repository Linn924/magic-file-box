import { fitScale } from "@/utils/fit";
import { previewError } from '@shared/previewError';
import { createSafeResizeObserver } from "@/utils/safeResizeObserver";
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from "vue";
import { attachTableResize } from "@/utils/resizeTable";
import type { PreviewFile } from "@shared/files";
import type { PreviewProps, PreviewEmit } from "@/modules/types";
export function usePreview(props: PreviewProps, emit: PreviewEmit) {
  const pane = ref<HTMLElement>();
  const host = ref<HTMLElement>();
  const warning = ref("");
  let destroyed = false;
  let cleanupResize: (() => void) | undefined;
  const page = ref(1),
    pageCount = ref(1);
  let pages: HTMLElement[] = [];
  let resize: ResizeObserver | undefined;
  function fit() {
    if (!host.value || !scroller || !pages[0]) return;
    host.value.style.zoom = "1";
    const first = pages[0];
    const width = first.getBoundingClientRect().width,
      height = first.getBoundingClientRect().height;
    host.value.style.zoom = String(
      (fitScale(
        width,
        height,
        scroller.clientWidth - 48,
        scroller.clientHeight - 48,
        props.fitMode || "original",
      ) *
        props.zoom) /
        100,
    );
  }
  watch(() => props.zoom, fit);
  watch(
    () => props.fitMode,
    async () => {
      const number = page.value;
      fit();
      await nextTick();
      jump(number);
    },
  );
  let scroller: HTMLElement | undefined;
  function syncPage() {
    if (!scroller) return;
    const top = scroller.getBoundingClientRect().top;
    let best = 0,
      distance = Infinity;
    pages.forEach((p, i) => {
      const d = Math.abs(p.getBoundingClientRect().top - top - 25);
      if (d < distance) {
        distance = d;
        best = i;
      }
    });
    page.value = best + 1;
  }
  function jump(value: number) {
    const next = Math.max(0, Math.min(pages.length - 1, Math.floor(value) - 1));
    pages[next]?.scrollIntoView({ block: "start" });
    page.value = next + 1;
  }
  onMounted(async () => {
    try {
      const shadow = host.value!.attachShadow({ mode: "open" });
      const body = document.createElement("div");
      shadow.append(body);
      body.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("a")) e.preventDefault();
      });
      if (props.file.ext === "docx") {
        const { renderAsync } = await import("docx-preview");
        if (destroyed) return;
        await renderAsync(props.file.bytes, body, body, {
          useBase64URL: true,
          renderAltChunks: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          ignoreLastRenderedPageBreak: false,
        });
      } else {
        const { parseMsDocToHtml, mountMsDoc } = await import(
          "@file-viewer/doc"
        );
        const rendered = await parseMsDocToHtml(props.file.bytes, {
          renderOptions: {
            externalLinkPolicy: "block",
            externalResourcePolicy: "block",
          },
        });
        if (destroyed) return;
        mountMsDoc(body, rendered);
        if (rendered.warnings.length)
          warning.value =
            "部分旧版 Word 元素无法完整还原，已显示可解析的内容。";
      }
      if (!destroyed) {
        const style = document.createElement("style");
        style.textContent =
          ".docx-wrapper{background:transparent!important;padding:24px!important}section.docx{overflow:visible!important}table{overflow:visible}";
        shadow.append(style);
        pages = Array.from(
          shadow.querySelectorAll<HTMLElement>("section.docx"),
        );
        if (!pages.length) pages = [body];
        for (const pageElement of pages)
          pageElement.classList.add("preview-content");
        pageCount.value = pages.length;
        scroller = pane.value?.querySelector(".document-scroll") as HTMLElement;
        scroller?.addEventListener("scroll", syncPage, { passive: true });
        cleanupResize = attachTableResize(shadow, {
          initial: props.file.view?.word?.widths,
          onChange: (widths) => {
            props.file.view ??= { zoom: props.zoom, scroll: [] };
            props.file.view.word = { widths };
          },
        });
        resize = createSafeResizeObserver(fit);
        resize.observe(scroller);
        fit();
        emit("ready");
      }
    } catch (e) {
      if (!destroyed)
        emit(
          "error",
          previewError(e, 'Word 文件'),
        );
    }
  });
  onBeforeUnmount(() => {
    destroyed = true;
    resize?.disconnect();
    cleanupResize?.();
    scroller?.removeEventListener("scroll", syncPage);
    host.value?.shadowRoot?.replaceChildren();
  });

  return { pane, host, warning, page, pageCount, jump };
}
