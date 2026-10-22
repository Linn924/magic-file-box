import "./styles/index.css";
import { defineAsyncComponent } from "vue";
import type { PreviewModule } from "@/modules/types";
export default {
  pageFit: true,
  id: "word",
  extensions: ["docx", "doc"],
  toolbar: defineAsyncComponent(
    () => import("@/components/printing/FilePrintButton.vue"),
  ),
  component: defineAsyncComponent(() => import("./index.vue")),
  sourceComponent: defineAsyncComponent(() => import('./components/LargeWordPreview.vue')),
} satisfies PreviewModule;
