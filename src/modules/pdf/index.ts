import "./styles/index.css";
import { defineAsyncComponent } from "vue";
import type { PreviewModule } from "@/modules/types";
export default {
  pageFit: true,
  toolbar: defineAsyncComponent(() => import("./components/PrintButton.vue")),
  id: "pdf",
  closeFile: async (id: string) => { (await import("./core/docCache")).releaseDoc(id); },
  extensions: ["pdf"],
  component: defineAsyncComponent(() => import("./index.vue")),
} satisfies PreviewModule;
