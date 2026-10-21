import assert from 'node:assert/strict';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import JSZip from 'jszip';
import type {Suite} from '../../../../tests/context';

const escape = (value: string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const p = (value: string, properties = '') => `<w:p>${properties?'<w:pPr>'+properties+'</w:pPr>':''}<w:r><w:t>${escape(value)}</w:t></w:r></w:p>`;
export async function createNavigationFixture(c: Pick<Parameters<Suite>[0], 'fixture'>, name: string, long = false) {
  if (existsSync(c.fixture(name))) return;
  const zip = new JSZip();
  zip.file('[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[['document','document.main'],['styles','styles'],['header','header'],['footnotes','footnotes']].map(([name,type])=>`<Override PartName="/word/${name}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="main" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${['styles','header','footnotes'].map(name=>`<Relationship Id="${name}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${name}" Target="${name}.xml"/>`).join('')}</Relationships>`);
  zip.file('word/styles.xml','<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Derived"><w:basedOn w:val="Heading2"/></w:style></w:styles>');
  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const body = long ? Array.from({length:240},(_,i)=>p('长目录章节 '+i,'<w:pStyle w:val="Heading1"/>')).join('') : [
    p('序章','<w:pStyle w:val="Heading1"/>'),
    '<w:p><w:r><w:t>跨</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>格式</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>搜索</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p>',
    '<w:tbl><w:tblPr><w:tblW w:w="6000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:tc>'+p('表格跨格式搜索')+'</w:tc><w:tc>'+p('其他单元格')+'</w:tc></w:tr></w:tbl>',
    p('正文覆盖不应入目录','<w:pStyle w:val="Heading1"/><w:outlineLvl w:val="9"/>'),
    pageBreak,p('重复标题','<w:pStyle w:val="Heading1"/>'), p('继承样式章节','<w:pStyle w:val="Derived"/>'),
    ...Array.from({length:12},(_,i)=>p('普通正文 '+i)),
    pageBreak,p('重复标题','<w:pStyle w:val="Heading1"/>'),p('直接大纲章节','<w:outlineLvl w:val="2"/>'),
    p('远处跨格式搜索'),p('literal <tag> &lt; .* [')
  ].join('');
  zip.file('word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="header"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  zip.file('word/header.xml','<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+p('页眉目标')+'</w:hdr>');
  zip.file('word/footnotes.xml','<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="1">'+p('脚注目标')+'</w:footnote></w:footnotes>');
  writeFileSync(c.fixture(name),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
}

const suite: Suite = async c => {
  const name='word-navigation-v1.docx'; await createNavigationFixture(c,name);
  const original=readFileSync(c.fixture(name)), win=await c.open(name);
  const theme=c.program.settings.get().theme, zoom=c.home.webContents.getZoomFactor();
  const shadow="document.querySelector('.word-host').shadowRoot";
  const visible=`(() => {
    const root=document.querySelector('.document-scroll'),b=root.getBoundingClientRect();
    return [...${shadow}.querySelectorAll('.word-current-hit')].some(hit=>[...hit.getClientRects()].some(r=>{
      if(r.top<b.top||r.bottom>b.bottom||r.left<b.left||r.right>b.right)return false;
      return !!document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.word-host');
    }));
  })()`;
  const search=async(value:string)=>{await c.evaluate(win,`(()=>{const e=document.querySelector('.word-search-input');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`);};
  try {
    await c.check(win,'DOCX navigation tools become ready',"!!document.querySelector('.word-search-toggle:not(:disabled)')");
    const before=await c.evaluate<string>(win,shadow+".querySelector('.docx-wrapper').textContent");
    await c.click(win,'.word-outline-toggle');
    await c.check(win,'DOCX heading styles, inheritance and direct levels form the outline',"document.querySelectorAll('.word-outline button').length===5");
    assert.deepEqual(await c.evaluate(win,"[...document.querySelectorAll('.word-outline button')].map(b=>b.textContent)"),['序章','重复标题','继承样式章节','重复标题','直接大纲章节']);
    assert.deepEqual(await c.evaluate(win,`[...${shadow}.querySelectorAll('[data-word-heading-level]')].map(e=>+e.dataset.wordHeadingLevel)`),[1,1,2,1,3]);
    await c.evaluate(win,"window.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true,cancelable:true}))");
    await c.check(win,'Ctrl F focuses the DOCX search input',"document.activeElement===document.querySelector('.word-search-input')");
    await search('跨格式搜索');
    await c.check(win,'DOCX matches across formatted runs count once and reveal the first result',"document.querySelector('.word-search-count').textContent.includes('1 / 3')&&"+visible);
    assert.equal(await c.evaluate(win,shadow+".querySelectorAll('.word-current-hit').length"),3);
    await c.click(win,'.word-find-next');
    await c.check(win,'DOCX next match is highlighted in a table cell',`!!${shadow}.querySelector('td .word-current-hit')&&document.querySelector('.word-search-count').textContent.includes('2 / 3')&&`+visible);
    await c.evaluate(win,"document.querySelector('.word-search-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
    await c.check(win,'DOCX Enter reaches a distant page',"document.querySelector('.word-search-count').textContent.includes('3 / 3')&&document.querySelector('.document-scroll').scrollTop>500&&"+visible);
    await c.evaluate(win,"document.querySelector('.word-search-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}))");
    await c.check(win,'DOCX Shift Enter locates the previous result',"document.querySelector('.word-search-count').textContent.includes('2 / 3')&&"+visible);
    await c.click(win,'.word-find-previous'); await c.click(win,'.word-find-previous');
    await c.check(win,'DOCX previous navigation wraps to the last result',"document.querySelector('.word-search-count').textContent.includes('3 / 3')&&"+visible);
    for (const query of ['脚注目标','页眉目标','<tag> &lt; .* [']) {
      await search(query); await c.check(win,'DOCX searchable rendered content '+query,`!!${shadow}.querySelector('.word-current-hit')&&`+visible);
    }
    await search('missing-word-query');
    await c.check(win,'DOCX zero results clear old marks and disable navigation',`!${shadow}.querySelector('.word-search-hit')&&document.querySelector('.word-find-next').disabled&&document.querySelector('.word-search-count').textContent.includes('0 处匹配')`);
    await search('跨格式搜索'); await c.check(win,'DOCX query can be restored',"document.querySelector('.word-search-count').textContent.includes('1 / 3')");
    assert.equal(await c.evaluate(win,shadow+".querySelector('.docx-wrapper').textContent"),before);
    await c.evaluate(win,"document.querySelector('.word-search-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
    await c.check(win,'DOCX Escape clears search and restores toolbar focus',`!${shadow}.querySelector('.word-search-hit')&&!document.querySelector('.word-search-input')&&document.activeElement.classList.contains('word-search-toggle')`);
    await c.click(win,'[data-word-outline-index="3"]');
    await c.check(win,'duplicate DOCX titles navigate to distinct headings',"document.querySelector('[data-word-outline-index=\"3\"]').hasAttribute('aria-current')&&document.querySelector('.document-scroll').scrollTop>500");
    await c.evaluate(win,"document.querySelector('.document-scroll').scrollTop=0");
    await c.check(win,'manual scrolling updates the current DOCX heading',"document.querySelector('[data-word-outline-index=\"0\"]').hasAttribute('aria-current')");
    c.program.updateSettings({theme:'dark'}); win.unmaximize();win.setSize(720,560);win.webContents.setZoomFactor(1.25);
    await c.click(win,'.word-search-toggle'); await search('跨格式搜索');
    await c.check(win,'DOCX search stays visible in a narrow dark window',"document.querySelector('.word-search-count').textContent.includes('1 / 3')&&"+visible);
    await search('页眉目标');await c.check(win,'DOCX first-page header search is not obscured by the floating panel',visible);
    await search('跨格式搜索');await c.check(win,'DOCX query returns to its first match before zooming',"document.querySelector('.word-search-count').textContent.includes('1 / 3')&&"+visible);
    await c.evaluate(win,"(()=>{const z=document.querySelector('.zoom-control input');z.value='200';z.dispatchEvent(new Event('change',{bubbles:true}))})()");
    await c.click(win,'.word-find-next');await c.check(win,'DOCX search navigation accounts for 200 percent zoom',"document.querySelector('.word-search-count').textContent.includes('2 / 3')&&"+visible);
    await c.snapshot(win,'docx-search-outline-narrow-dark');
    assert.deepEqual(readFileSync(c.fixture(name)),original);
  } catch(error) {
    console.log('DOCX NAV GEOMETRY '+JSON.stringify(await c.evaluate(win,`(()=>{const root=document.querySelector('.document-scroll');return {root:root.getBoundingClientRect().toJSON(),top:root.scrollTop,left:root.scrollLeft,height:root.scrollHeight,width:root.scrollWidth,hostZoom:document.querySelector('.word-host').style.zoom,hits:[...${shadow}.querySelectorAll('.word-current-hit')].map(h=>({text:h.textContent,rect:h.getBoundingClientRect().toJSON()}))}})()`)));
    await c.snapshot(win,'docx-navigation-failure');throw error;
  } finally { win.webContents.setZoomFactor(zoom);c.home.webContents.setZoomFactor(zoom);c.program.updateSettings({theme});c.close(win); }

  const empty=await c.open('document.docx');try{await c.click(empty,'.word-outline-toggle');await c.check(empty,'DOCX without heading metadata shows an empty directory',"!!document.querySelector('.word-outline-empty')");}finally{c.close(empty);}
  const tabs=(await c.program.openPaths([c.fixture(name),c.fixture('text.txt')],'tabs'))[0];
  const receiver=await c.open('data.json');
  try {
    await c.check(tabs,'DOCX tab is ready',"!!document.querySelector('.word-outline-toggle:not(:disabled)')");await c.click(tabs,'.word-outline-toggle');
    await c.click(tabs,'.tab .tab-name','text.txt');await c.pause(2200);await c.click(tabs,'.tab .tab-name',name);
    await c.check(tabs,'DOCX outline survives idle unload',"document.querySelectorAll('.word-outline button').length===5");
    const id=await c.evaluate<string>(tabs,"document.querySelector('.preview-tab:has(.word-host)').dataset.fileId");
    await c.evaluate(receiver,`(()=>{const d=new DataTransfer();d.setData('application/x-file-preview-tab',${JSON.stringify(id)});document.querySelector('main').dispatchEvent(new DragEvent('drop',{dataTransfer:d,bubbles:true,cancelable:true}))})()`);
    await c.check(receiver,'DOCX outline survives transfer without a persisted search',"document.querySelectorAll('.word-outline button').length===5&&!document.querySelector('.word-search-input')");
  }finally{c.close(tabs);c.close(receiver);}
  const longName='word-long-outline-v1.docx';await createNavigationFixture(c,longName,true);const long=await c.open(longName);
  try{await c.click(long,'.word-outline-toggle');await c.check(long,'long DOCX outline keeps a bounded set of entries',"document.querySelectorAll('.word-outline button').length>0&&document.querySelectorAll('.word-outline button').length<60");await c.evaluate(long,"document.querySelector('.word-outline button').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}))");await c.check(long,'DOCX outline keyboard navigation reaches the final heading',"document.activeElement?.textContent==='长目录章节 239'");await c.evaluate(long,"document.activeElement.click()");await c.check(long,'last DOCX directory entry navigates to real content',"document.querySelector('.document-scroll').scrollTop>500&&document.querySelector('.word-outline [aria-current]').textContent==='长目录章节 239'");}finally{c.close(long);}
};
export default suite;
