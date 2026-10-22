import {app,BrowserWindow,type WebContents} from 'electron';
import assert from 'node:assert/strict';
import type {Suite} from '../context';
const suite:Suite=async c=>{
  const submissions:Array<{paper:string;pages:number;width:number;height:number}>=[];
  const intercept=(_event:Electron.Event,wc:WebContents)=>{
    wc.getPrintersAsync=async()=>[{name:'nonpdf-test-printer',displayName:'模拟打印出口',isDefault:true,status:0,description:'test',options:{}}];
    wc.print=(options,callback)=>{void(async()=>{
      try{
        const bytes=await wc.printToPDF({preferCSSPageSize:true,printBackground:true}),text=bytes.toString('latin1');
        const box=text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
        assert.ok(box,'print document has physical paper bounds');
        submissions.push({paper:String(options?.pageSize),pages:(text.match(/\/Type\s*\/Page\b/g)||[]).length,width:Number(box[1]),height:Number(box[2])});callback?.(true,'');
      }catch(error){callback?.(false,String(error));}
    })();};
  };
  app.on('web-contents-created',intercept);c.program.updateSettings({printEntry:'current'});
  try{
    for(const [name,paper] of [['image.png','A5'],['document.docx','A4']] as const){
      const preview=await c.open(name);await c.click(preview,'.file-print-button');
      let panel:BrowserWindow|undefined;
      for(let i=0;i<40&&!panel;i++){panel=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('print-panel=1'));if(!panel)await c.pause(50);}
      assert.ok(panel);await c.check(panel,name+' print row ready',"!!document.querySelector('.toggle-print-options')");await c.click(panel,'.toggle-print-options');
      await c.check(panel,name+' print settings omit the read-only PDF dimensions block',"!!document.querySelector('[aria-label=打印纸张]')&&!document.querySelector('.page-dims,.paper-dimensions,.page-size-list')");
      await c.evaluate(panel,`(()=>{const p=document.querySelector('[aria-label=打印纸张]');p.value='${paper}';p.dispatchEvent(new Event('change',{bubbles:true}))})()`);
      const before=submissions.length;await c.click(panel,'.print-go');await c.check(panel,name+' submits through intercepted print exit',"document.querySelector('.print-status').textContent.includes('已提交到系统队列')");
      assert.equal(submissions.length,before+1);const result=submissions.at(-1)!;assert.ok(result.pages>=1);assert.equal(result.paper,paper);
      const dimensions=paper==='A5'?[148,210]:[210,297];assert.ok(Math.abs(result.width-dimensions[0]*72/25.4)<2&&Math.abs(result.height-dimensions[1]*72/25.4)<2);
      c.pass(name+' real print layout has correct '+paper+' dimensions without a printer');c.close(panel);c.close(preview);
    }
  }finally{app.removeListener('web-contents-created',intercept);c.program.updateSettings({printEntry:'all'});}
};
export default suite;
