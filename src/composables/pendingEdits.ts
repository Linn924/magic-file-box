// In-memory operations must finish before a transfer snapshots the file's draft.
const pending=new Map<string|object,{count:number;promise:Promise<void>;resolve:()=>void}>();
const key=(file:object)=>typeof (file as {id?:string}).id==='string'?(file as {id:string}).id:file;
export function beginFileEdit(file:object){const id=key(file);let entry=pending.get(id);if(!entry){let resolve!:()=>void;entry={count:0,promise:new Promise<void>(done=>{resolve=done;}),resolve:()=>resolve()};pending.set(id,entry);}entry.count++;let ended=false;return ()=>{if(ended)return;ended=true;if(--entry!.count===0){pending.delete(id);entry!.resolve();}};}
export async function waitForFileEdits(file:object){const id=key(file);while(pending.has(id))await pending.get(id)!.promise;}
