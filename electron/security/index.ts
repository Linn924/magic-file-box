import {
  session,
  net,
  type Session,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
export async function createLocalSession(assetRoot: string): Promise<Session> {
  const local = session.fromPartition("file-preview-memory", { cache: false });
  local.setPermissionRequestHandler((_wc, _permission, reply) => reply(false));
  local.setPermissionCheckHandler(() => false);
  local.on("will-download", (event) => event.preventDefault());
  local.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, reply) =>
    reply({
      cancel: !["preview://local/", "blob:", "data:"].some((prefix) =>
        details.url.startsWith(prefix),
      ),
    }),
  );
  await local.protocol.handle("preview", (request) => {
    try {
      const url = new URL(request.url);
      const asset = path.resolve(
        assetRoot,
        "." + decodeURIComponent(url.pathname),
      );
      if (url.hostname !== "local" || !asset.startsWith(assetRoot + path.sep))
        return new Response(null, { status: 403 });
      return net.fetch(pathToFileURL(asset).toString(), {
        bypassCustomProtocolHandlers: true,
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
  return local;
}
export function protectWindow(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-frame-navigate", (event) => event.preventDefault());
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.webContents.on("page-title-updated", (event) => event.preventDefault());
  win.webContents.on("before-input-event", (event, input) => {
    if (
      (input.control || input.meta) &&
      ["s", "p"].includes(input.key.toLowerCase()) &&
      !(input.shift && input.key.toLowerCase() === "p")
    )
      event.preventDefault();
  });
}
export function trusted(event: IpcMainInvokeEvent): void {
  if (
    event.senderFrame !== event.sender.mainFrame ||
    !event.senderFrame?.url.startsWith("preview://local/")
  )
    throw new Error("无效调用来源。");
}
