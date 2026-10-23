import { ipcMain } from 'electron';

let held = false;
const responses = new Set<() => void>();
let sourceHeld=false;
const sourceResponses=new Set<()=>void>();
export function holdSourceResponses(){sourceHeld=true;}
export function releaseSourceResponses(){sourceHeld=false;for(const resolve of sourceResponses)resolve();sourceResponses.clear();}
/** Hold completed IPC responses to exercise cancel/retry against late delivery. */
export function holdPreviewResponses() { held = true; }
export function releasePreviewResponses() {
  held = false;
  for (const resolve of responses) resolve();
  responses.clear();
}
export function installPreviewLoadDriver() {
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => handle(channel, !['preview:load','source:page'].includes(channel) ? listener : async (event, ...args) => {
    const result = await listener(event, ...args);
    if (channel==='preview:load'&&held) await new Promise<void>(resolve => responses.add(resolve));
    if (channel==='source:page'&&sourceHeld) await new Promise<void>(resolve=>sourceResponses.add(resolve));
    return result;
  });
}
