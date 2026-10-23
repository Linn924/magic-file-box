import {defaultCodeAppearance,normalizeCodeAppearance,type CodeAppearance} from './codeAppearance';
export type Theme = "light" | "dark" | "system";
export type PrintEntry = "all" | "current" | "none";
export type NotificationDuration = 'always'|'5s';
export interface Settings {
  theme: Theme;
  closeAction: "ask" | "quit" | "tray";
  openHomeAction: "ask" | "tray" | "keep";
  multiFileMode: "ask" | "tabs" | "windows";
  defaultZoom: number;
  maximizePreview: boolean;
  printEntry: PrintEntry;
  checkUpdatesOnStart:boolean;
  notificationDuration:NotificationDuration;
  codeAppearance:CodeAppearance;
}
export const defaults: Settings = {
  theme: "light",
  closeAction: "ask",
  openHomeAction: "ask",
  multiFileMode: "ask",
  defaultZoom: 100,
  maximizePreview: true,
  printEntry: "all",
  checkUpdatesOnStart:true,
  notificationDuration:'always',
  codeAppearance:defaultCodeAppearance(),
};
export function normalizeSettings(
  input: Partial<Settings> = {},
  base: Settings = defaults,
): Settings {
  return {
    theme: ["light", "dark", "system"].includes(input.theme ?? "")
      ? input.theme!
      : base.theme,
    closeAction: ["ask", "quit", "tray"].includes(input.closeAction ?? "")
      ? input.closeAction!
      : base.closeAction,
    openHomeAction: ["ask", "tray", "keep"].includes(input.openHomeAction ?? "")
      ? input.openHomeAction!
      : base.openHomeAction,
    multiFileMode: ["ask", "tabs", "windows"].includes(
      input.multiFileMode ?? "",
    )
      ? input.multiFileMode!
      : base.multiFileMode,
    defaultZoom: Number.isFinite(input.defaultZoom)
      ? Math.min(400, Math.max(25, Math.round(input.defaultZoom!)))
      : base.defaultZoom,
    maximizePreview:
      typeof input.maximizePreview === "boolean"
        ? input.maximizePreview
        : base.maximizePreview,
    printEntry: ["all", "current", "none"].includes(input.printEntry ?? "")
      ? input.printEntry!
      : base.printEntry,
    checkUpdatesOnStart:typeof input.checkUpdatesOnStart==='boolean'?input.checkUpdatesOnStart:base.checkUpdatesOnStart,
    notificationDuration:['always','5s'].includes(input.notificationDuration??'')?input.notificationDuration!:base.notificationDuration,
    codeAppearance:normalizeCodeAppearance(input.codeAppearance,base.codeAppearance),
  };
}
