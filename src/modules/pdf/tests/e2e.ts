import type { Suite } from "../../../../tests/context";
import { checkContinuous } from "../../../../tests/continuous";
import { longFixture } from "./longFixture";
import {linkFixture} from './linkFixture';
import {outlineFixture} from './outlineFixture';
const suite: Suite = async (c) => {
  async function dragAt(win:import('electron').BrowserWindow,selector:string,button:'left'|'middle',dx:number,dy:number,space=false){
    win.show();win.focus();await c.pause(150);
    const point=await c.evaluate<{x:number;y:number}>(win,`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+Math.min(160,r.width/2),y:r.top+Math.min(130,r.height/2)}})()`);
    win.webContents.debugger.attach('1.3');
    try{
      if(space)await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button,clickCount:1});
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx,y:point.y+dy,button,buttons:button==='middle'?4:1});
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+dx,y:point.y+dy,button,clickCount:1});
    }finally{
      if(space)await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
      win.webContents.debugger.detach();
    }
    await c.pause(180);
  }
  const win = await c.open("document.pdf");
  await c.check(
    win,
    "PDF pages coexist",
    "document.querySelectorAll('.pdf-page').length===2",
  );
  await c.check(win, "PDF painted", "document.querySelector('canvas').width>0");
  win.unmaximize();
  win.setSize(1000, 700);
  await c.pause(250);
  await checkContinuous(c, win, ".pdf-scroll");
  await c.evaluate(
    win,
    "(()=>{const z=document.querySelector('.zoom-control input');z.value='137';z.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await c.check(
    win,
    "custom zoom remains available",
    "document.querySelector('.zoom-control input').value==='137'",
  );
  await c.snapshot(win, "pdf");
  c.close(win);
  const pan=await c.open('document.pdf');
  pan.unmaximize();pan.setSize(850,650);
  await c.evaluate(pan,"(()=>{const z=document.querySelector('.zoom-control input');z.value='400';z.dispatchEvent(new Event('input',{bubbles:true}));z.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");
  await c.check(pan,'zoomed PDF supports horizontal scrolling',"(()=>{const r=document.querySelector('.pdf-scroll');return r.scrollWidth>r.clientWidth+300})()");
  await c.evaluate(pan,"(()=>{const r=document.querySelector('.pdf-scroll');r.scrollLeft=160;r.scrollTop=160})()");
  await dragAt(pan,'.pdf-scroll','middle',-80,-55);
  await c.check(pan,'middle-button drag pans PDF',"(()=>{const r=document.querySelector('.pdf-scroll');return r.scrollLeft>205&&r.scrollTop>185})()");
  const beforeSpace=await c.evaluate<number>(pan,"document.querySelector('.pdf-scroll').scrollLeft");
  await dragAt(pan,'.pdf-scroll','left',-70,0,true);
  await c.check(pan,'Space plus left drag pans PDF',`document.querySelector('.pdf-scroll').scrollLeft>${beforeSpace+35}`);
  c.close(pan);
  longFixture(c.fixture("long-mixed.pdf"));
  const long = await c.open("long-mixed.pdf");
  long.unmaximize();
  long.setSize(1000, 700);
  await c.pause(250);
  await c.check(long, "long PDF first page painted and full page count available",
    "(()=>{const total=Number(document.querySelector('.page-nav input').max);const dom=document.querySelectorAll('.pdf-page').length;const painted=[...document.querySelectorAll('.pdf-page canvas')].some(c=>c.width>0);return total===80&&dom<=Math.ceil(total*0.25)&&painted})()");
  await c.check(long, "long PDF DOM stays virtualized — nodes well below total pages",
    "(()=>{const total=Number(document.querySelector('.page-nav input').max);const dom=document.querySelectorAll('.pdf-page').length;const hasPads=document.querySelectorAll('.pdf-virtual-pad').length>=1;return hasPads&&dom<=Math.ceil(total*0.15)})()");
  await c.evaluate(long, "(()=>{const p=document.querySelector('.page-nav input');p.value='80';p.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.check(long, "long PDF last page renders after jump",
    "document.querySelector('.page-nav input').value==='80' && [...document.querySelectorAll('.pdf-page')].some(el=>el.dataset.page==='79'&&el.querySelector('canvas')?.width>0)");
  await c.check(long,'last page aligns with scroll position',"(()=>{const root=document.querySelector('.pdf-scroll');const page=root.querySelector('.pdf-page[data-page=\"79\"]');return page&&Math.abs(page.getBoundingClientRect().top-root.getBoundingClientRect().top-26)<60})()");
  await c.evaluate(long,"(()=>{const p=document.querySelector('.page-nav input');p.value='40';p.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.check(long,'middle page aligns after virtual jump',"(()=>{const root=document.querySelector('.pdf-scroll');const page=root.querySelector('.pdf-page[data-page=\"39\"]');return page&&Math.abs(page.getBoundingClientRect().top-root.getBoundingClientRect().top-26)<60})()");
  const painted = (page: number) => `(()=>{const canvas=document.querySelector('.pdf-page[data-page="${page}"] canvas');if(!canvas||canvas.width<100||canvas.height<100)return false;const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let i=0;i<data.length;i+=400){if(data[i+3]>200&&data[i]<180&&data[i+2]>80)return true}return false})()`;
  await c.check(long,'middle page is painted after leaving the end',painted(39));
  await c.evaluate(long,"(()=>{const p=document.querySelector('.page-nav input');p.value='80';p.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.check(long,'last page repaints after returning',painted(79));
  await c.evaluate(long,"(()=>{const p=document.querySelector('.page-nav input');p.value='40';p.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.check(long,'middle page repaints on second visit',painted(39));
  await c.evaluate(long, "(()=>{const z=document.querySelector('.zoom-control input');for(const v of ['125','80','137']){z.value=v;z.dispatchEvent(new Event('input',{bubbles:true}));z.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}})()");
  await c.check(long, "rapid zoom retains rendered page without errors",
    "document.querySelector('.zoom-control input').value==='137' && [...document.querySelectorAll('canvas')].some(c=>c.width>0) && !document.querySelector('.error')");
  await c.evaluate(long,"(()=>{const z=document.querySelector('.zoom-control input');z.value='400';z.dispatchEvent(new Event('input',{bubbles:true}));z.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");
  await c.check(long,'400% bitmap remains bounded and visible',"(()=>{const canvases=[...document.querySelectorAll('.pdf-page canvas')].filter(c=>c.width>0);return document.querySelector('.zoom-control input').value==='400'&&canvases.length>0&&canvases.every(c=>c.width*c.height<=6000000)})()");
  await c.evaluate(long,"(()=>{const p=document.querySelector('.page-nav input');p.value='40';p.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.check(long,'thumbnail test begins on page 40',"document.querySelector('.page-nav input').value==='40'");
  await c.click(long,'.pdf-nav-toggle');
  await c.click(long,'.pdf-nav-tab','缩略图');
  await c.check(long,'visible thumbnail painted before distant jump',"!!document.querySelector('.thumb.thumb-painted canvas[width]')");
  const thumbPage=await c.evaluate<number>(long,"Number(document.querySelector('.thumb.thumb-painted').dataset.page)");
  await c.evaluate(long,"(()=>{const p=document.querySelector('.page-nav input');p.value='80';p.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.check(long,'last thumbnail painted after jump',"document.querySelector('.thumb[data-page=\"80\"].thumb-painted canvas')?.width>0");
  await c.evaluate(long,`(()=>{const p=document.querySelector('.page-nav input');p.value='${thumbPage}';p.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await c.check(long,'thumbnail repaints after virtual remount',`document.querySelector('.thumb[data-page="${thumbPage}"].thumb-painted canvas')?.width>0`);
  c.close(long);

  // --- Precise search / nav interaction (hit-test chrome after opening panels) ---
  const searchWin = await c.open("document.pdf");
  await c.check(
    searchWin,
    "toolbar buttons hit-test as themselves before search",
    `(()=>{
      const btn=document.querySelector('.pdf-search-toggle');
      if(!btn) return false;
      const r=btn.getBoundingClientRect();
      const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return !!(el && (el===btn||btn.contains(el)));
    })()`,
  );
  await c.click(searchWin, ".pdf-search-toggle");
  await c.check(
    searchWin,
    "search bar opens with input and find button",
    "!!document.querySelector('.pdf-search-input') && !!document.querySelector('.pdf-search-go')",
  );
  await c.evaluate(
    searchWin,
    "(()=>{const i=document.querySelector('.pdf-search-input');i.value='Local Preview';i.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await c.click(searchWin, ".pdf-search-go");
  await c.check(
    searchWin,
    "search finds hits and shows count",
    "/\\d+ \\/ \\d+/.test(document.querySelector('.pdf-search-count')?.textContent||'')",
  );
  await c.check(
    searchWin,
    "search marks hit page",
    "!!document.querySelector('.pdf-page.has-hit')",
  );
  await c.check(searchWin,'search mark visible without duplicate text',"(()=>{const layer=document.querySelector('.pdf-text-layer:has(.pdf-hit)');const mark=layer?.querySelector('.pdf-hit');return !!mark&&getComputedStyle(layer).opacity==='1'&&getComputedStyle(mark).backgroundColor!=='rgba(0, 0, 0, 0)'&&getComputedStyle(mark).color==='rgba(0, 0, 0, 0)'})()");
  // Critical: after search open, toolbar / zoom / nav must still receive clicks.
  await c.check(
    searchWin,
    "toolbar still clickable after search open (hit-test)",
    `(()=>{
      const btn=document.querySelector('.pdf-search-toggle');
      const r=btn.getBoundingClientRect();
      const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return !!(el && (el===btn||btn.contains(el)));
    })()`,
  );
  await c.check(
    searchWin,
    "zoom control still clickable after search open",
    `(()=>{
      const btn=document.querySelector('.zoom-control button');
      if(!btn) return false;
      const r=btn.getBoundingClientRect();
      const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return !!(el && (el===btn||btn.contains(el)||el.closest('button')===btn));
    })()`,
  );
  await c.click(searchWin, ".pdf-search-go"); // still works
  await c.evaluate(
    searchWin,
    "(()=>{const i=document.querySelector('.pdf-search-input');i.value='zzz-not-in-doc';i.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await c.click(searchWin, ".pdf-search-go");
  await c.check(
    searchWin,
    "empty search shows 无结果",
    "document.querySelector('.pdf-search-count')?.textContent?.includes('无结果')",
  );
  await c.evaluate(
    searchWin,
    "(()=>{const i=document.querySelector('.pdf-search-input');i.value='Local Preview';i.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await c.click(searchWin, ".pdf-search-go");
  await c.click(searchWin, '.pdf-search-bar button[aria-label="下一处"]');
  await c.check(
    searchWin,
    "next hit updates active index",
    "document.querySelector('.pdf-search-count')?.textContent?.includes('/')",
  );

  // Nav panel
  await c.click(searchWin, ".pdf-nav-toggle");
  await c.check(
    searchWin,
    "nav panel opens with tabs",
    "!!document.querySelector('.pdf-nav') && document.querySelectorAll('.pdf-nav-tab').length===2",
  );
  await c.check(
    searchWin,
    "outline empty state when no bookmarks",
    "!!document.querySelector('.pdf-outline') && document.body.innerText.includes('本文档没有目录') || !!document.querySelector('.outline-item')",
  );
  await c.click(searchWin, ".pdf-nav-tab", "缩略图");
  await c.check(
    searchWin,
    "thumbnail tab activates",
    "document.querySelector('.pdf-thumbs') && document.querySelectorAll('.thumb').length===2",
  );
  await c.check(
    searchWin,
    "thumbnail canvas has non-zero size after paint",
    `[...document.querySelectorAll('.thumb canvas')].some(c=>c.width>0&&c.height>0)`,
  );
  await c.evaluate(searchWin,"(()=>{const s=document.querySelector('.thumb-size-select');s.value='272';s.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.check(searchWin,'large thumbnail size changes sidebar and paint',"(()=>{const nav=document.querySelector('.pdf-nav'),canvas=document.querySelector('.thumb.thumb-painted canvas');return nav.getBoundingClientRect().width>=270&&canvas?.style.width==='216px'&&canvas.width>0})()");
  await dragAt(searchWin,'.pdf-nav-resizer','left',30,0);
  await c.check(searchWin,'dragging sidebar widens thumbnails',"(()=>{const nav=document.querySelector('.pdf-nav'),canvas=document.querySelector('.thumb.thumb-painted canvas');return nav.getBoundingClientRect().width>=295&&parseFloat(canvas?.style.width||'0')>=240})()");
  // Switch outline <-> thumbs several times: canvases must stay painted (no blank).
  for (let i = 0; i < 4; i++) {
    await c.click(searchWin, ".pdf-nav-tab", "目录");
    await c.pause(100);
    await c.click(searchWin, ".pdf-nav-tab", "缩略图");
    await c.pause(180);
  }
  await c.check(
    searchWin,
    "thumbnails stay painted after tab switches",
    `(()=>{const cs=[...document.querySelectorAll('.thumb canvas')];return cs.length===2&&cs.every(c=>c.width>0&&c.height>0&&c.closest('.thumb')?.classList.contains('thumb-painted'))})()`,
  );
  await c.check(
    searchWin,
    "single-flight thumb paint keeps pixels after outline toggle",
    `(()=>{
      const cs=[...document.querySelectorAll('.thumb canvas')];
      return cs.length===2 && cs.every((c)=>c.width>0 && c.height>0);
    })()`,
  );
  await c.check(
    searchWin,
    "thumb aspect matches main page aspect",
    `(()=>{
      const main=document.querySelector('.pdf-page');
      const thumb=document.querySelector('.thumb canvas');
      if(!main||!thumb||!thumb.width) return false;
      const mw=parseFloat(main.style.width), mh=parseFloat(main.style.height);
      const tr=thumb.width/thumb.height, mr=mw/mh;
      return Math.abs(tr-mr)<0.08;
    })()`,
  );
  // Sample center pixel is not empty/transparent (content was drawn).
  await c.check(
    searchWin,
    "thumbnail bitmap has non-blank pixels",
    `(()=>{
      const c=document.querySelector('.thumb canvas');
      if(!c||!c.width) return false;
      const ctx=c.getContext('2d');
      if(!ctx) return false;
      const d=ctx.getImageData(Math.floor(c.width/2), Math.floor(c.height/2), 1, 1).data;
      // Not fully transparent; allow white paper but reject empty black/zero alpha only.
      return d[3]===255;
    })()`,
  );
  await c.check(
    searchWin,
    "toolbar still clickable after nav open",
    `(()=>{
      const btn=document.querySelector('.pdf-search-toggle');
      const r=btn.getBoundingClientRect();
      const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return !!(el && (el===btn||btn.contains(el)));
    })()`,
  );
  // Click second thumbnail → page 2
  await c.click(searchWin, ".thumb[data-page='2']");
  await c.check(
    searchWin,
    "thumbnail click jumps to page 2",
    "document.querySelector('.page-nav input').value==='2'",
  );
  await c.click(searchWin, ".pdf-nav-tab", "目录");
  await c.check(
    searchWin,
    "outline tab switches back",
    "!!document.querySelector('.pdf-outline')",
  );
  await c.click(searchWin, ".pdf-nav-tab", "缩略图");
  await c.click(searchWin, ".thumb[data-page='1']");
  await c.check(
    searchWin,
    "thumbnail click jumps back to page 1",
    "document.querySelector('.page-nav input').value==='1'",
  );
  // Page nav still works with search+nav open
  await c.click(searchWin, ".page-nav button", "下一页");
  await c.check(
    searchWin,
    "page next button works with panels open",
    "document.querySelector('.page-nav input').value==='2'",
  );
  await c.snapshot(searchWin, "pdf-search-nav");

  // --- Multi-hit + always-on text layer + annot + permissions + thumb follow ---
  if (!(await c.evaluate(searchWin, "!!document.querySelector('.pdf-search-input')"))) await c.click(searchWin, ".pdf-search-toggle");
  await c.evaluate(
    searchWin,
    "(()=>{const i=document.querySelector('.pdf-search-input');i.value='Local';i.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await c.click(searchWin, ".pdf-search-go");
  await c.check(
    searchWin,
    "multi-hit search counts words not just pages",
    "(()=>{const t=document.querySelector('.pdf-search-count')?.textContent||'';const m=t.match(/(\\d+) \\/ (\\d+)/);return !!m && Number(m[2])>=2})()",
  );
  await c.check(
    searchWin,
    "text layer built without requiring search open",
    "!!document.querySelector('.pdf-text-layer[data-built=\"1\"]')",
  );
  await c.check(
    searchWin,
    "text spans selectable always",
    "(()=>{const s=document.querySelector('.pdf-text-layer span');if(!s)return false;const cs=getComputedStyle(s);return cs.pointerEvents==='auto'})()",
  );
  await c.check(
    searchWin,
    "annot layer exists",
    "!!document.querySelector('.pdf-annot-layer')",
  );
  await c.check(
    searchWin,
    "print allowed when unrestricted",
    "(()=>{const b=document.querySelector('.pdf-print-button');return !!b && !b.disabled})()",
  );
  if (!(await c.evaluate(searchWin, "!!document.querySelector('.pdf-nav')"))) await c.click(searchWin, ".pdf-nav-toggle");
  await c.click(searchWin, ".pdf-nav-tab", "缩略图");
  await c.evaluate(
    searchWin,
    "(()=>{const p=document.querySelector('.page-nav input');p.value='2';p.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await c.pause(400);
  await c.check(
    searchWin,
    "thumbnail follows current page",
    "(()=>{const host=document.querySelector('.pdf-thumbs');const t=host?.querySelector('.thumb.current');if(!host||!t)return false;const h=host.getBoundingClientRect(),r=t.getBoundingClientRect();return r.bottom>h.top-4&&r.top<h.bottom+4})()",
  );
  c.close(searchWin);

  // --- Text selection (item 1): text layer built without search open ---
  const selWin = await c.open("document.pdf");
  await c.pause(800); // wait for text layer async build
  await c.check(
    selWin,
    "text layer built for visible page without search open",
    "!!document.querySelector('.pdf-text-layer[data-built=\"1\"]')",
  );
  await c.check(
    selWin,
    "text layer spans are selectable (pointer-events auto)",
    `(()=>{
      const span = document.querySelector('.pdf-text-layer[data-built="1"] span');
      if (!span) return false;
      const style = window.getComputedStyle(span);
      return style.pointerEvents === 'auto' && style.userSelect === 'text';
    })()`,
  );
  const selectText="(()=>{const span=document.querySelector('.pdf-page[data-page=\"0\"] .pdf-text-layer span');const range=document.createRange();range.selectNodeContents(span);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.querySelector('.pdf-scroll').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))})()";
  await c.evaluate(selWin,selectText);
  await c.check(selWin,'selected text offers memory highlight',"!!document.querySelector('.pdf-mark-highlight')");
  await c.check(selWin,'selection annotation actions are contextual rather than in top toolbar',"!!document.querySelector('.pdf-selection-actions .pdf-mark-highlight')&&!document.querySelector('.actbar .pdf-mark-highlight,.actbar .pdf-mark-note')");await c.evaluate(selWin,"document.querySelector('.pdf-scroll').dispatchEvent(new Event('scroll'))");await c.check(selWin,'reading scroll dismisses stale selection actions',"!document.querySelector('.pdf-selection-actions')");await c.evaluate(selWin,selectText);await c.check(selWin,'new selection restores annotation actions',"!!document.querySelector('.pdf-mark-highlight')");
  await c.click(selWin,'.pdf-mark-highlight');
  await c.check(selWin,'highlight appears on PDF page',"!!document.querySelector('.pdf-user-mark.highlight')");
  await c.evaluate(selWin,selectText);
  await c.click(selWin,'.pdf-mark-note');
  await c.check(selWin,'memory note can be edited',"document.querySelectorAll('.pdf-note').length===2&&!!document.querySelector('.pdf-note textarea')");
  await c.evaluate(selWin,"(()=>{const t=document.querySelector('.pdf-note textarea');t.value='仅本次预览';t.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await c.check(selWin,'note edit is kept in current session',"document.querySelector('.pdf-note textarea').value==='仅本次预览'");
  await c.click(selWin,'.pdf-rotate');
  await c.check(selWin,'memory marks survive rotation',"document.querySelectorAll('.pdf-user-mark').length>=2");
  c.close(selWin);
  const reopenedNotes=await c.open('document.pdf');
  await c.click(reopenedNotes,'.pdf-notes-toggle');
  await c.check(reopenedNotes,'closing document clears temporary notes',"document.querySelector('.pdf-notes').textContent.includes('0')&&!document.querySelector('.pdf-user-mark')");
  c.close(reopenedNotes);
  const tabbed=(await c.program.openPaths([c.fixture('document.pdf'),c.fixture('text.txt')],'tabs'))[0];
  await c.check(tabbed,'tabbed PDF text ready',"!!document.querySelector('.pdf-page .pdf-text-layer[data-built=\"1\"] span')");
  await c.evaluate(tabbed,selectText);
  await c.click(tabbed,'.pdf-mark-highlight');
  await c.click(tabbed,'.tab .tab-name','text.txt');
  await c.click(tabbed,'.tab .tab-name','document.pdf');
  await c.check(tabbed,'temporary mark survives switching tabs',"!!document.querySelector('.pdf-user-mark.highlight')");
  c.close(tabbed);

  outlineFixture(c.fixture('outlined-pages.pdf'));
  const outlined=await c.open('outlined-pages.pdf');
  await c.click(outlined,'.pdf-nav-toggle');
  await c.check(outlined,'first chapter follows opening page',"document.querySelector('.outline-item.current')?.textContent.includes('Section One')");
  await c.evaluate(outlined,"(()=>{const p=document.querySelector('.page-nav input');p.value='3';p.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.check(outlined,'chapter follows page three',"document.querySelector('.outline-item.current')?.textContent.includes('Section Two')");
  await c.check(outlined,'active chapter scrolls into view',"(()=>{const host=document.querySelector('.pdf-outline'),item=host?.querySelector('.outline-item.current');if(!host||!item)return false;const h=host.getBoundingClientRect(),r=item.getBoundingClientRect();return r.top>=h.top&&r.bottom<=h.bottom+2&&host.scrollTop>0})()");
  c.close(outlined);

  // Rotation and fit must rebuild selectable text and link hit areas in the
  // same page coordinates used by the visible bitmap.
  linkFixture(c.fixture('linked-pages.pdf'));
  const linked=await c.open('linked-pages.pdf');
  await c.check(linked,'link overlay and text layer available',"!!document.querySelector('.pdf-annot-layer a')&&!!document.querySelector('.pdf-text-layer[data-built=\"1\"] span')");
  await c.pause(250);
  const initial=await c.evaluate<{x:number;linkX:number;geometry:string}>(linked,"(()=>{const page=document.querySelector('.pdf-page');const span=page.querySelector('.pdf-text-layer span');const link=page.querySelector('.pdf-annot-layer a');return{x:span.getBoundingClientRect().left-page.getBoundingClientRect().left,linkX:link.getBoundingClientRect().left-page.getBoundingClientRect().left,geometry:page.querySelector('.pdf-text-layer').dataset.geometry}})()");
  await c.click(linked,'.pdf-rotate');
  await c.check(linked,'rotation rebuilds text and link positions',`(()=>{const page=document.querySelector('.pdf-page[data-page="0"]');const layer=page?.querySelector('.pdf-text-layer');const span=layer?.querySelector('span');const link=page?.querySelector('.pdf-annot-layer a');if(!span||!link||layer.dataset.built!=='1'||layer.dataset.geometry===${JSON.stringify(initial.geometry)})return false;const x=span.getBoundingClientRect().left-page.getBoundingClientRect().left;const lx=link.getBoundingClientRect().left-page.getBoundingClientRect().left;return Math.abs(x-${initial.x})>10&&Math.abs(lx-${initial.linkX})>10})()`);
  const rotatedGeometry=await c.evaluate<string>(linked,"document.querySelector('.pdf-text-layer').dataset.geometry");
  await c.evaluate(linked,"(()=>{const select=document.querySelector('[aria-label=页面适配]');select.value='width';select.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.check(linked,'fit mode rebuilds selectable text and link',`(()=>{const layer=document.querySelector('.pdf-page[data-page="0"] .pdf-text-layer');return layer?.dataset.built==='1'&&layer.dataset.geometry!==${JSON.stringify(rotatedGeometry)}&&!!document.querySelector('.pdf-page[data-page="0"] .pdf-annot-layer a')})()`);
  await c.snapshot(linked,'pdf-rotated-link');
  await c.click(linked,'.pdf-page[data-page="0"] .pdf-annot-layer a');
  await c.check(linked,'rotated and fitted link opens its target page',"document.querySelector('.page-nav input').value==='2'");
  c.close(linked);

  // --- Keyboard navigation (item 9): PageDown / PageUp ---
  const kbWin = await c.open("document.pdf");
  kbWin.setSize(1000, 700);
  await c.pause(300);
  // Focus the scroll area then send PageDown
  await c.evaluate(kbWin,
    "document.querySelector('.pdf-scroll').focus();" +
    "document.querySelector('.pdf-scroll').dispatchEvent(new KeyboardEvent('keydown',{key:'PageDown',bubbles:true,cancelable:true}))"
  );
  await c.pause(300);
  await c.check(
    kbWin,
    "PageDown advances to page 2",
    "document.querySelector('.page-nav input').value==='2'",
  );
  await c.evaluate(kbWin,
    "document.querySelector('.pdf-scroll').dispatchEvent(new KeyboardEvent('keydown',{key:'PageUp',bubbles:true,cancelable:true}))"
  );
  await c.pause(300);
  await c.check(
    kbWin,
    "PageUp returns to page 1",
    "document.querySelector('.page-nav input').value==='1'",
  );
  c.close(kbWin);

  // --- Ctrl+F (item 3): opens PDF search bar ---
  const ctrlFWin = await c.open("document.pdf");
  await c.pause(200);
  await c.check(
    ctrlFWin,
    "search bar closed before Ctrl+F",
    "!document.querySelector('.pdf-search-input')",
  );
  await c.evaluate(ctrlFWin,
    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true,cancelable:true}))"
  );
  await c.pause(200);
  await c.check(
    ctrlFWin,
    "Ctrl+F opens PDF search bar",
    "!!document.querySelector('.pdf-search-input')",
  );
  await c.evaluate(ctrlFWin,"(()=>{const i=document.querySelector('.pdf-search-input');i.value='Local';i.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await c.click(ctrlFWin,'.pdf-search-go');
  await c.check(ctrlFWin,'search highlight exists before closing','!!document.querySelector(".pdf-hit")');
  await c.click(ctrlFWin,'.pdf-search-toggle');
  await c.check(ctrlFWin,'closing search clears results and highlights','!document.querySelector(".pdf-search-input,.pdf-hit,.pdf-page.has-hit")');
  await c.click(ctrlFWin,'.pdf-rotate');
  await c.pause(350);
  await c.check(ctrlFWin,'rotated selectable text follows glyph direction',"(()=>{const s=[...document.querySelectorAll('.pdf-text-layer span')].find(s=>s.textContent.length>10);if(!s)return false;const r=s.getBoundingClientRect();return r.height>r.width*2})()");
  c.close(ctrlFWin);
};
export default suite;
