import type { Component } from "vue";
import type { PreviewFile } from "@shared/contracts";
export interface PreviewModule {
  id: string;
  extensions: string[];
  component: Component;
  sourceComponent?: Component;
  pageFit?: boolean;
  toolbar?: Component;
  /** Release module caches on tab close or eviction under memory pressure. */
  closeFile?: (id: string) => void | Promise<void>;
}
export interface PreviewProps {
  file: PreviewFile;
  zoom: number;
  fitMode?: import("@/utils/fit").FitMode;
}
export interface PreviewEmit {
  (event: "ready"): void;
  (event: "error", message: string): void;
  (event: "update:zoom", value: number): void;
}
