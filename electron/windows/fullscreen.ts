import { BrowserWindow, ipcMain } from "electron";
import { trusted } from "../security";
export function setupFullscreen() {
  ipcMain.handle("window:fullscreen", (event, value: boolean) => {
    trusted(event);
    if (
      typeof value !== "boolean" ||
      !event.sender.getURL().includes("?preview=1")
    )
      throw Error("此窗口不能进入阅读模式。");
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.setFullScreen(value);
    return value;
  });
}
export function trackFullscreen(win: BrowserWindow) {
  win.on("enter-full-screen", () =>
    win.webContents.send("window:fullscreen", true),
  );
  win.on("leave-full-screen", () =>
    win.webContents.send("window:fullscreen", false),
  );
  win.webContents.on("before-input-event", (event, input) => {
    if (
      input.type === "keyDown" &&
      input.key === "Escape" &&
      win.isFullScreen()
    ) {
      event.preventDefault();
      win.setFullScreen(false);
    }
  });
}
