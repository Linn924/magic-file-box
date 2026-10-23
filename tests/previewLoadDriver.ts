import { ipcMain } from 'electron';

let held = false;
const responses = new Set<() => void>();
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
  ipcMain.handle = (channel, listener) => handle(channel, !['preview:load','source:page'].includes(channel) ? listener : async (event, ...args) => {
    if(channel==='preview:load'){const id=(args[0] as {id:string}).id;attempts.set(id,(attempts.get(id)??0)+1);}
    const result = await listener(event, ...args);
    if (channel==='preview:load'&&held) await new Promise<void>(resolve => responses.add(resolve));
    if (channel==='source:page'&&sourceHeld) await new Promise<void>(resolve=>sourceResponses.add(resolve));
    return result;
  });
}
