import "./styles/index.css";
import { defineAsyncComponent } from "vue";
import type { PreviewModule } from "@/modules/types";
export default {
  pageFit: true,
  id: "image",
  extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"],
  toolbar: defineAsyncComponent(
    () => import("@/components/printing/FilePrintButton.vue"),
  ),
  component: defineAsyncComponent(() => import("./index.vue")),
  sourceComponent: defineAsyncComponent(() => import('./components/LargeImagePreview.vue')),
} satisfies PreviewModule;
