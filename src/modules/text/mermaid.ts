import {safeSvg} from './markdown';
let library:Promise<typeof import('mermaid')>|undefined,queue:Promise<unknown>=Promise.resolve(),serial=0;
export function renderDiagram(text:string,dark:boolean,valid:()=>boolean){
  const run=queue.then(async()=>{
    if(!valid())return '';
    if(text.length>30000||/%%\s*\{|^\s*---/.test(text))throw Error('图表过大或含自定义配置，请查看源码。');
    const {default:mermaid}=await (library??=import('mermaid'));if(!valid())return '';
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,theme:dark?'dark':'default',maxTextSize:30000,maxEdges:500,htmlLabels:false,flowchart:{htmlLabels:false},secure:['secure','securityLevel','startOnLoad','maxTextSize','maxEdges','htmlLabels','theme','flowchart']});
    const id='md-diagram-'+(++serial);
    try{const result=await mermaid.render(id,text);return valid()?safeSvg(result.svg):'';}
    finally{document.getElementById('d'+id)?.remove();document.getElementById(id)?.remove();}
  });queue=run.catch(()=>{});return run;
}
