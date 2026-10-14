import "./styles/index.css";
import { defineAsyncComponent } from "vue";
import type { PreviewModule } from "@/modules/types";
export default {
  id: "excel",
  extensions: ["xlsx", "xls", "csv", "tsv"],
  component: defineAsyncComponent(() => import("./index.vue")),
} satisfies PreviewModule;
