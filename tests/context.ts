import type { BrowserWindow } from "electron";
export interface TestContext {
  /** Optional shared-suite file-format selection; omitted means the existing full matrix. */
  formats?:ReadonlySet<string>;
  home: BrowserWindow;
  program: typeof import("../electron/main");
  open: (name: string) => Promise<BrowserWindow>;
  close: (win: BrowserWindow) => void;
  check: (
    win: BrowserWindow,
    name: string,
    expression: string,
  ) => Promise<void>;
  evaluate: <T = unknown>(win: BrowserWindow, expression: string) => Promise<T>;
  snapshot: (win: BrowserWindow, name: string) => Promise<void>;
  click: (win: BrowserWindow, selector: string, text?: string) => Promise<void>;
  wheel: (win: BrowserWindow, selector: string, delta: number) => Promise<void>;
  fixture: (name: string) => string;
  pass: (name: string) => void;
  pause: (ms: number) => Promise<void>;
}
export type Suite = (context: TestContext) => Promise<void>;
