import {findPdfMatches,type SearchOptions} from '../core/searchIndex';
const worker=globalThis as unknown as {onmessage:((event:MessageEvent)=>void)|null;postMessage:(value:unknown)=>void};
worker.onmessage=event=>{
  const {text,query,options,limit}=event.data as {text:string;query:string;options:SearchOptions;limit:number};
  try {worker.postMessage({matches:findPdfMatches(text,query,options,limit)});}
  catch(error){worker.postMessage({error:error instanceof Error?error.message:String(error)});}
};
