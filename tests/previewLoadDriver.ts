import { ipcMain } from 'electron';

let held = false;
const responses = new Set<() => void>();
const startupHolds = new Map<string, Set<() => void>>();
export function holdStartupResponse(channel: 'settings:get' | 'preview:consume') {
  const waiting = new Set<() => void>();
  startupHolds.set(channel, waiting);
  return () => {
    startupHolds.delete(channel);
    for (const resolve of waiting) resolve();
    waiting.clear();
  };
}
const attempts=new Map<string,number>();
export function previewLoadAttempts(id:string){return attempts.get(id)??0;}
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
  ipcMain.handle = (channel, listener) => handle(channel, !['preview:load','source:page','settings:get','preview:consume'].includes(channel) ? listener : async (event, ...args) => {
    if(channel==='preview:load'){const id=(args[0] as {id:string}).id;attempts.set(id,(attempts.get(id)??0)+1);}
    const result = await listener(event, ...args);
    const startupWaiters = startupHolds.get(channel);
    if (startupWaiters) await new Promise<void>(resolve => startupWaiters.add(resolve));
    if (channel==='preview:load'&&held) await new Promise<void>(resolve => responses.add(resolve));
    if (channel==='source:page'&&sourceHeld) await new Promise<void>(resolve=>sourceResponses.add(resolve));
    return result;
  });
}
