import {writeFileSync} from 'node:fs';
import type {Suite} from '../context';
import {fixtureInScope} from '../scope';

/** Real Electron layout matrix. Audit mode records before images without enforcing new rules. */
const suite:Suite=async c=>{
 const audit=process.env.FILE_PREVIEW_VISUAL_AUDIT==='1';
 const measurements:unknown[]=[];
 const previousZoom=c.home.webContents.getZoomFactor();
 c.program.updateSettings({maximizePreview:false});
 try{
  for(const name of ['document.pdf','document.docx','styled.xlsx','presentation.pptx','vector.svg','readme.md','data.json'].filter(name=>fixtureInScope(c,name))){
   const win=await c.open(name);win.setMinimumSize(520,380);
   for(const theme of ['light','dark'] as const){
    c.program.updateSettings({theme});win.setContentSize(960,640);win.webContents.setZoomFactor(1.25);await c.pause(180);
    const beforeQuery=await c.evaluate<{bar:number;content:number}>(win,"(()=>{return {bar:document.querySelector('.actbar').getBoundingClientRect().height,content:document.querySelector('.pdf-scroll,.text-scroll')?.getBoundingClientRect().height||0}})()");
    if(name==='document.pdf')await c.click(win,'.pdf-search-toggle');
    if(name==='data.json')await c.click(win,'.text-search-toggle');
    const metrics=await c.evaluate(win,`(()=>{const bar=document.querySelector('.actbar');const rect=bar.getBoundingClientRect();const controls=[...bar.querySelectorAll('button,input,select')].filter(el=>el.getClientRects().length);return {width:innerWidth,height:innerHeight,barHeight:rect.height,barOverflow:bar.scrollWidth-bar.clientWidth,clipped:controls.filter(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth||r.bottom>rect.bottom+1}).map(el=>el.getAttribute('aria-label')||el.textContent.trim()),excelMargin:document.querySelector('.excel')?getComputedStyle(document.querySelector('.excel')).margin:null}})()`);
    measurements.push({name,theme,metrics});
    await c.snapshot(win,`visual-${audit?'before':'after'}-${name.replace('.','-')}-${theme}`);
    if(!audit){
     await c.check(win,`${name}: toolbar icons carry hover and accessibility labels`,"[...document.querySelectorAll('.actbar button')].every(b=>b.querySelector('svg')&&b.title&&b.getAttribute('aria-label'))");
     await c.check(win,`${name} ${theme}: toolbar, tab and page icons stay centered`,"[...document.querySelectorAll('.actbar button,.tab-close,.tab-add-file,.page-nav button,.preview-floating-panel button')].filter(b=>b.getClientRects().length).every(b=>{const r=b.getBoundingClientRect(),svg=b.querySelector(':scope > svg');if(!svg)return true;const s=svg.getBoundingClientRect();return Math.abs(r.left+r.width/2-s.left-s.width/2)<.6&&Math.abs(r.top+r.height/2-s.top-s.height/2)<.6})");
     await c.check(win,`${name}: common viewing controls precede output and immersive actions`,"(()=>{const b=document.querySelector('.actbar'),g=b.querySelector('[data-preview-group=view]');return g&&b.firstElementChild===g&&b.lastElementChild.classList.contains('tool-button-wrap')&&b.lastElementChild.querySelector('.immersive-toggle')})()");
     await c.check(win,`${name} ${theme}: actions stay visible at 125%`,`(()=>{const bar=document.querySelector('.actbar');return bar.scrollWidth<=bar.clientWidth+1&&[...bar.querySelectorAll('button,input,select')].filter(el=>el.getClientRects().length).every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=bar.getBoundingClientRect().bottom+1})})()`);
     await c.check(win,`${name} ${theme}: content remains usable`,`document.querySelector('.preview-tab').clientHeight-document.querySelector('.actbar').clientHeight-document.querySelector('.idbar').clientHeight>200`);
     if(name==='document.pdf'||name==='data.json'){
      await c.check(win,`${name}: query belongs to a non-modal floating panel`,"!!document.querySelector('.preview-floating-panel[role=dialog][aria-modal=false] input')&&!document.querySelector('.actbar .pdf-search-input,.actbar .text-search-input,.search-tools input')");
      await c.check(win,`${name}: opening query preserves toolbar and document geometry`,`Math.abs(document.querySelector('.actbar').getBoundingClientRect().height-${beforeQuery.bar})<1&&Math.abs(document.querySelector('.pdf-scroll,.text-scroll').getBoundingClientRect().height-${beforeQuery.content})<1`);
      await c.check(win,`${name}: query input receives focus`,"document.activeElement===document.querySelector('.preview-floating-panel input')");
      if(theme==='light'){
       const initial=await c.evaluate<{x:number;y:number;left:number;top:number}>(win,"(()=>{const r=document.querySelector('.preview-panel-head').getBoundingClientRect();return {x:r.left+40,y:r.top+r.height/2,left:r.left,top:r.top}})()");
       win.webContents.debugger.attach('1.3');try{await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x:initial.x,y:initial.y,button:'left',clickCount:1});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:initial.x-60,y:initial.y+25,button:'left',buttons:1});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:initial.x-60,y:initial.y+25,button:'left',clickCount:1});}finally{win.webContents.debugger.detach();}
       await c.check(win,`${name}: native drag moves query window`,`(()=>{const r=document.querySelector('.preview-panel-head').getBoundingClientRect();return r.left<${initial.left}-40&&r.top>${initial.top}+15})()`);
       win.setContentSize(720,640);await c.pause(100);await c.check(win,`${name}: resized query stays within preview bounds`,"(()=>{const a=document.querySelector('.preview-floating-panel').getBoundingClientRect(),b=document.querySelector('.floating-tools').getBoundingClientRect();return a.left>=b.left&&a.right<=b.right+1&&a.top>=b.top&&a.bottom<=b.bottom+1})()");win.setContentSize(960,640);await c.pause(80);
      }
     }
     if(name==='vector.svg')await c.check(win,'image status is displayed once in the file information header',"!document.querySelector('.actbar .image-fit-label,.image-pane .pane-footer')&&document.querySelectorAll('.idbar .image-fit-label').length===1");
    }
    if(name==='document.pdf')await c.click(win,'.pdf-search-toggle');
    if(name==='data.json')await c.click(win,'.text-search-toggle');
   }
   win.webContents.setZoomFactor(previousZoom);c.close(win);
  }
  if(fixtureInScope(c,'data.json')){
  const first=fixtureInScope(c,'document.pdf')?'document.pdf':'text.txt',prefix=first==='document.pdf'?'pdf':'text';
  const queryTabs=(await c.program.openPaths([c.fixture(first),c.fixture('data.json')],'tabs'))[0];await c.check(queryTabs,'first file ready for query isolation',`!!document.querySelector('.${prefix}-search-toggle')`);await c.click(queryTabs,`.${prefix}-search-toggle`);await c.check(queryTabs,'query window opens in its own tab',`!!document.querySelector('.${prefix}-search-input')`);await c.click(queryTabs,'.tab .tab-name','data.json');await c.check(queryTabs,'inactive tab query window does not cover current file',"[...document.querySelectorAll('.preview-floating-panel')].every(panel=>panel.getClientRects().length===0)");await c.evaluate(queryTabs,"document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true,cancelable:true}))");await c.check(queryTabs,'Ctrl F opens active text query only',"document.activeElement?.classList.contains('text-search-input')&&[...document.querySelectorAll('.preview-floating-panel')].filter(panel=>panel.getClientRects().length).length===1");await c.evaluate(queryTabs,"document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");await c.check(queryTabs,'closing text query restores entry focus',"![...document.querySelectorAll('.text-search-input')].some(input=>input.getClientRects().length)&&document.activeElement?.classList.contains('text-search-toggle')");c.close(queryTabs);
  }
 }finally{c.home.webContents.setZoomFactor(previousZoom);c.program.updateSettings({maximizePreview:true,theme:'light'});}
 writeFileSync(`outputs/verification/visual-${audit?'before':'after'}${c.formats?'-'+[...c.formats].join('-'):''}.json`,JSON.stringify(measurements,null,2));
};export default suite;
