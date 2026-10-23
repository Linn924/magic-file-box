import assert from 'node:assert/strict';
import {shell} from 'electron';
import {existsSync,writeFileSync} from 'node:fs';
import type {Suite} from '../../../../tests/context';
function fixture(file:string){
  if(existsSync(file))return;
  const streams=['BT /F1 20 Tf 40 240 Td (Valid page link) Tj 0 -50 Td (Missing page link) Tj 0 -50 Td (External website) Tj 0 -50 Td (Blocked script) Tj ET','BT /F1 20 Tf 40 240 Td (Second page) Tj ET'];
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 300] /Resources << /Font << /F1 8 0 R >> >> /Contents 5 0 R /Annots [7 0 R 9 0 R 10 0 R 11 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 300] /Resources << /Font << /F1 8 0 R >> >> /Contents 6 0 R >>',...streams.map(s=>`<< /Length ${s.length} >>\nstream\n${s}\nendstream`),
    '<< /Type /Annot /Subtype /Link /Rect [40 234 220 260] /Border [0 0 0] /Dest [4 0 R /Fit] >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Annot /Subtype /Link /Rect [40 184 220 210] /Border [0 0 0] /Dest [999 0 R /Fit] >>',
    '<< /Type /Annot /Subtype /Link /Rect [40 134 220 160] /Border [0 0 0] /A << /S /URI /URI (https://example.invalid/pdf-audit) >> >>',
    '<< /Type /Annot /Subtype /Link /Rect [40 84 220 110] /Border [0 0 0] /A << /S /URI /URI (javascript:alert\(1\)) >> >>'];
  let pdf='%PDF-1.4\n';const offsets=objects.map((object,i)=>{const at=Buffer.byteLength(pdf);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;return at;}),xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;writeFileSync(file,pdf);
}
const suite:Suite=async c=>{
  const name='pdf-links-safety-v1.pdf';fixture(c.fixture(name));const win=await c.open(name),realOpen=shell.openExternal,opened:string[]=[];
  shell.openExternal=async url=>{opened.push(url);};
  try{
    await c.check(win,'PDF links are ready and unsafe script link is excluded',"document.querySelectorAll('.pdf-annot-layer a').length===3&&![...document.querySelectorAll('.pdf-annot-layer a')].some(a=>a.href.startsWith('javascript:'))");
    await c.evaluate(win,"window.pdfLinkRejections=0;window.addEventListener('unhandledrejection',()=>{window.pdfLinkRejections++});document.querySelectorAll('.pdf-annot-layer a')[1].click()");
    await c.pause(250);
    assert.equal(await c.evaluate(win,"window.pdfLinkRejections"),0,'a missing PDF target must not produce an unhandled rejection');
    await c.check(win,'missing internal link keeps the current page usable',"document.querySelector('.page-nav input').value==='1'&&!document.querySelector('.error')");
    await c.click(win,'.pdf-annot-layer a[href^="https:"]');assert.deepEqual(opened,['https://example.invalid/pdf-audit']);c.pass('PDF website link reaches the validated external opener without real browsing');
    for(const url of ['javascript:alert(1)','data:text/html,test','file:///C:/test.pdf','https://example.invalid/\nblocked'])await c.check(win,'external bridge rejects a nonwebsite or malformed URL',`window.localPreview.openExternal(${JSON.stringify(url)}).then(()=>false,()=>true)`);
    assert.equal(opened.length,1,'rejected protocols must never reach the system browser');
    await c.evaluate(win,"document.querySelectorAll('.pdf-annot-layer a')[0].click()");
    await c.check(win,'a valid link still navigates after an invalid target',"document.querySelector('.page-nav input').value==='2'");
  }finally{shell.openExternal=realOpen;c.close(win);}
};
export default suite;
