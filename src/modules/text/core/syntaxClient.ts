import {withinSyntaxBudget,SYNTAX_CACHE,type SyntaxData} from './syntaxTypes';
let worker:Worker|undefined,serial=0,idle:ReturnType<typeof setTimeout>|undefined,cost=0;
const cache=new Map<string,{text:string;lang:string;data:SyntaxData}>(),pending=new Map<number,{key:string;text:string;lang:string;resolve:(data:SyntaxData|undefined)=>void;timer:ReturnType<typeof setTimeout>}>();
function stop(){worker?.terminate();worker=undefined;for(const p of pending.values()){clearTimeout(p.timer);p.resolve(undefined);}pending.clear();}
function rest(){clearTimeout(idle);if(!pending.size)idle=setTimeout(stop,30000);}
function start(){if(worker)return worker;worker=new Worker(new URL('../workers/syntax.worker.ts',import.meta.url),{type:'module'});worker.onerror=()=>{stop();};worker.onmessage=(event:MessageEvent<{id:number;data?:SyntaxData}>)=>{const p=pending.get(event.data.id);if(!p)return;clearTimeout(p.timer);pending.delete(event.data.id);const data=event.data.data;if(data&&data.cost<=SYNTAX_CACHE){const prior=cache.get(p.key);if(prior)cost-=prior.data.cost;cache.delete(p.key);cache.set(p.key,{text:p.text,lang:p.lang,data});cost+=data.cost;while(cost>SYNTAX_CACHE||cache.size>16){const [key,item]=cache.entries().next().value!;cost-=item.data.cost;cache.delete(key);}}p.resolve(data);rest();};return worker;}
export function highlightSyntax(key:string,text:string,lang:string){
  if(!withinSyntaxBudget(text))return Promise.resolve(undefined);const cached=cache.get(key);if(cached?.text===text&&cached.lang===lang){cache.delete(key);cache.set(key,cached);return Promise.resolve(cached.data);}
  // Components use their own generation guard; cache only exact source matches.
  clearTimeout(idle);return new Promise<SyntaxData|undefined>(resolve=>{const id=++serial;try{const w=start(),timer=setTimeout(stop,20000);pending.set(id,{key,text,lang,resolve,timer});w.postMessage({id,text,lang});}catch{resolve(undefined);}});
}
export function releaseSyntax(id:string){for(const [key,item] of cache)if(key.startsWith(id+':')){cost-=item.data.cost;cache.delete(key);}for(const [key,p] of pending)if(p.key.startsWith(id+':')){clearTimeout(p.timer);p.resolve(undefined);pending.delete(key);}if(!pending.size&&!cache.size)stop();else rest();}
