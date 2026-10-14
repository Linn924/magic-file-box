import { ipcMain, type WebContents } from 'electron';
import { trusted } from '../security';
const clients = new Map<number, WebContents>();
const watched=new WeakSet<WebContents>();
export function pdfResourceStats(){return {clients:clients.size};}
function budget() {
  const count = Math.max(1, clients.size);
  return { pixels: Math.max(1024,Math.min(24_000_000,Math.floor(48_000_000/count))), bytes: Math.floor(384*1024*1024/count), documents:Math.max(1,Math.floor(8/count)) };
}
function broadcast() { const value=budget();for(const client of clients.values())if(!client.isDestroyed())client.send('pdf:resources',value); }
export function setupPdfResources() {
  ipcMain.on('pdf:resources-release',event=>{trusted(event);if(clients.delete(event.sender.id))broadcast();});
  ipcMain.handle('pdf:resources',event=>{
    trusted(event);
    if(!clients.has(event.sender.id)) {
      const id=event.sender.id;clients.set(id,event.sender);
      if(!watched.has(event.sender)){watched.add(event.sender);event.sender.once('destroyed',()=>{clients.delete(id);broadcast();});}
      broadcast();
    }
    return budget();
  });
}
