import "./styles/index.css";
import { defineAsyncComponent } from "vue";
import type { PreviewModule } from "@/modules/types";
import {codeExtensions} from '@shared/codeFormats';
import {releaseSyntax} from './core/syntaxClient';
export default {
  id: "text",
  extensions: [
    "txt",
    "text",
    "json",
    "md",
    "log",
    "xml",
    "js",
    "ts",
    "css",
    "ini",
    "yaml",
    "yml",
    "toml",
    ...codeExtensions,
  ],
  component: defineAsyncComponent(() => import("./index.vue")),
  sourceComponent: defineAsyncComponent(() => import('./components/LargeTextPreview.vue')),
  closeFile:releaseSyntax,
} satisfies PreviewModule;
