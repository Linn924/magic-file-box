import type { Suite } from "../../../../tests/context";
import { checkResize } from "../../../../tests/resize";
const suite: Suite = async (c) => {
  let win = await c.open("styled.xlsx");
  await c.check(
    win,
    "Excel merges and styles",
    "(()=>{const c=document.querySelector('td[colspan=\"4\"][rowspan=\"2\"]');return c&&getComputedStyle(c).backgroundColor==='rgb(40, 90, 159)'})()",
  );
  await c.check(
    win,
    "Excel formatted values",
    "document.querySelector('table').textContent.includes('87.5%')",
  );
  await c.check(
    win,
    "Excel resizable columns",
    "document.querySelectorAll('.column-resize-handle').length===4",
  );
  await checkResize(
    c,
    win,
    "document.querySelector('.column-resize-handle')",
    "document.querySelectorAll('thead th')[1].getBoundingClientRect().width",
  );
  await c.wheel(win, "table", -120);
  await c.check(
    win,
    "Excel wheel does not zoom",
    "document.querySelector('.zoom-control input').value==='100'",
  );
  const retainedWidth = await c.evaluate<number>(win, "document.querySelectorAll('thead th')[1].getBoundingClientRect().width");
  const originalSheet = await c.evaluate<string>(win, "document.querySelector('.sheets button.active').textContent.trim()");
  await c.click(win, ".sheets button", "分页测试");
  const receiver = await c.open('data.json');
  const transferId = await c.evaluate<string>(win, "document.querySelector('.preview-tab').dataset.fileId");
  await c.evaluate(receiver, `(()=>{const d=new DataTransfer();d.setData('application/x-file-preview-tab',${JSON.stringify(transferId)});document.querySelector('main').dispatchEvent(new DragEvent('drop',{dataTransfer:d,bubbles:true,cancelable:true}))})()`);
  await c.check(receiver, 'Excel transfer restores selected worksheet', "document.querySelector('.sheets button.active')?.textContent.trim()==='分页测试' && !document.querySelector('.loading')");
  await c.click(receiver, '.sheets button', originalSheet);
  await c.check(receiver, 'Excel transfer retains temporary column width', `Math.abs(document.querySelectorAll('thead th')[1].getBoundingClientRect().width-${retainedWidth})<2`);
  c.close(receiver);
  // Continue the remaining checks in a freshly opened workbook.
  const reopened = await c.open('styled.xlsx');
  await c.click(reopened, '.sheets button', '分页测试');
  win = reopened;
  await c.evaluate(
    win,
    "(()=>{const el=document.querySelector('.table-wrap');el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'))})()",
  );
  await c.check(
    win,
    "Excel virtual window keeps DOM bounded after jump to end",
    "document.querySelectorAll('tbody tr.row-virtual-spacer').length>=1 && document.querySelectorAll('tbody tr:not(.row-virtual-spacer)').length<400 && document.querySelector('tbody tr[data-row]')?.dataset.row!=='0'",
  );
  await c.check(
    win,
    "Excel virtual scroll still shows later rows",
    "(()=>{const rows=[...document.querySelectorAll('tbody tr[data-row]')];const last=Number(rows[rows.length-1]?.dataset.row||0);return last>50})()",
  );
  await c.evaluate(
    win,
    "(()=>{const el=document.querySelector('.table-wrap');el.scrollTop=0;el.dispatchEvent(new Event('scroll'))})()",
  );
  await c.check(
    win,
    "Excel virtual scroll returns to first rows",
    "document.querySelector('tbody tr[data-row=\"0\"]')?.querySelector('th')?.textContent==='1'",
  );
  await c.click(win, "footer button", "上一页");
  await c.click(win, "footer button", "后 100 列");
  await c.check(
    win,
    "all Excel columns reachable",
    "document.querySelector('table').textContent.includes('第105列')",
  );
  await c.evaluate(
    win,
    "(()=>{const i=document.querySelector('.cell-locate-input');i.value='B12';i.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await c.click(win, ".cell-locate button", "跳转");
  await c.check(
    win,
    "Excel locate cell B12",
    "document.body.textContent.includes('已定位 B12')",
  );
  await c.evaluate(win,"(()=>{const z=document.querySelector('.zoom-control input');z.value='200';z.dispatchEvent(new Event('input',{bubbles:true}));z.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()");
  await c.evaluate(win,"(()=>{const i=document.querySelector('.cell-locate-input');i.value='B150';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");
  try {
  await c.check(win,'Excel zoomed locate lands in actual visible cell',"(()=>{const r=document.querySelector('.table-wrap').getBoundingClientRect(),row=document.querySelector('tr[data-row=\"149\"]');if(!row)return false;const b=row.getBoundingClientRect();return b.top>=r.top&&b.top<r.bottom})()");
  } catch(error){throw Error(String(error)+' '+JSON.stringify(await c.evaluate(win,"(()=>{const root=document.querySelector('.table-wrap'),row=document.querySelector('tr[data-row=\\\"149\\\"]');return {top:root.scrollTop,scale:document.querySelector('.sheet-surface').style.zoom,root:root.getBoundingClientRect().toJSON(),row:row?.getBoundingClientRect().toJSON(),first:document.querySelector('tbody tr[data-row]')?.dataset.row}})()")));}
  await c.click(win,'.excel-edit-toggle');
  const editPosition=await c.evaluate<{top:number;left:number}>(win,"(()=>{const s=document.querySelector('.table-wrap');return {top:s.scrollTop,left:s.scrollLeft}})()");
  await c.evaluate(win,"document.querySelector('.spreadsheet td[data-address=\"C152\"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await c.check(win,'zoomed inline edit preserves the scrolled viewport',`(()=>{const s=document.querySelector('.table-wrap');return !!document.querySelector('.excel-inline-input')&&Math.abs(s.scrollTop-${editPosition.top})<2&&Math.abs(s.scrollLeft-${editPosition.left})<2})()`);
  await c.evaluate(win,"document.querySelector('.excel-inline-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
  await c.check(win,'zoomed edit commit does not align target to top left',`(()=>{const s=document.querySelector('.table-wrap');return document.querySelector('.excel-selected-cell').dataset.address==='C153'&&Math.abs(s.scrollTop-${editPosition.top})<2&&Math.abs(s.scrollLeft-${editPosition.left})<2})()`);
  await c.click(win,'.excel-edit-toggle');
  await c.evaluate(win,"(()=>{const z=document.querySelector('.zoom-control input');z.value='100';z.dispatchEvent(new Event('input',{bubbles:true}));z.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()");
    await c.check(
    win,
    "Excel extra freeze controls removed; existing header toggles retained",
    "document.querySelectorAll('.freeze-toggle').length===2 && !document.querySelector('.freeze-num')",
  );
  await c.click(win, ".sheets button", "季度报告");
  await c.snapshot(win, "excel");
  // Dark theme: hover must not clear Excel cell fills.
  c.program.updateSettings({ theme: "dark" });
  await c.pause(200);
  await c.check(
    win,
    "dark theme applied for excel",
    "document.documentElement.dataset.theme==='dark'",
  );
  await c.check(
    win,
    "excel styled cell fill survives in dark theme",
    "getComputedStyle(document.querySelector('td[colspan=\"4\"][rowspan=\"2\"]')).backgroundColor==='rgb(40, 90, 159)'",
  );
  await c.check(
    win,
    "excel default cell stays white not transparent",
    "(()=>{const tds=[...document.querySelectorAll('tbody td')];const td=tds.find(el=>getComputedStyle(el).backgroundColor==='rgb(255, 255, 255)');return !!td})()",
  );
  c.program.updateSettings({ theme: "light" });
  c.close(win);
  for (const name of ["legacy.xls", "table.csv"]) {
    const w = await c.open(name);
    await c.check(w, "table " + name, "!!document.querySelector('table')");
    c.close(w);
  }
};
export default suite;
