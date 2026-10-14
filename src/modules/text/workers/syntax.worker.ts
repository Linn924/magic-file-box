import {tokenizeSyntax} from '../core/syntaxEngine';
let queue=Promise.resolve();
self.onmessage=(event:MessageEvent<{id:number;text:string;lang:string}>)=>{const request=event.data;queue=queue.then(async()=>{try{const data=await tokenizeSyntax(request.text,request.lang);self.postMessage({id:request.id,data});}catch{self.postMessage({id:request.id,error:true});}});};
