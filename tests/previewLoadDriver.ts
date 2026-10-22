import { ipcMain } from 'electron';

let held = false;
const responses = new Set<() => void>();
/** Hold completed IPC responses to exercise cancel/retry against late delivery. */
export function holdPreviewResponses() { held = true; }
export function releasePreviewResponses() {
  held = false;
  for (const resolve of responses) resolve();
  responses.clear();
}
export function installPreviewLoadDriver() {
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => handle(channel, channel !== 'preview:load' ? listener : async (event, ...args) => {
    const result = await listener(event, ...args);
    if (held) await new Promise<void>(resolve => responses.add(resolve));
    return result;
  });
}
