import "./style.css";
import { defineAsyncComponent } from "vue";
import type { PreviewModule } from "../types";
import {codeExtensions} from '../../../shared/codeFormats';
import {releaseSyntax} from './syntaxClient';
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
  closeFile:releaseSyntax,
} satisfies PreviewModule;
