import { app, BrowserWindow, dialog } from "electron";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Suite } from "../context";
import {checkTabbarLayout} from '../tabbarLayout';
const suite: Suite = async (c) => {
  await c.check(
    c.home,
    "removed old slogans and status",
    "!document.querySelector('.privacy,.statusbar') && !document.body.innerText.includes('独立窗口中预览')",
  );
  await c.check(
    c.home,
    "internal brand removed",
    "!document.querySelector('.app-logo,.brand')",
  );
  await c.click(c.home, ".settings-button");
  await c.evaluate(
    c.home,
    "(()=>{const s=document.querySelector('#theme');s.value='dark';s.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await c.check(
    c.home,
    "dark theme applied",
    "document.documentElement.dataset.theme==='dark'",
  );
  const config = JSON.parse(
    readFileSync(
      path.join(app.getPath("userData"), "preferences.json"),
      "utf8",
    ),
  );
  if (
    config.theme !== "dark" ||
    Object.keys(config).some(
      (k) => /path|file|history/i.test(k) && k !== "multiFileMode",
    )
  )
    throw Error("Preference persistence");
  c.pass("preferences persist without file paths");
  await c.snapshot(c.home, "settings-dark");
  await c.click(c.home, 'button[aria-label="关闭设置"]');
  c.program.updateSettings({ theme: "light", multiFileMode: "ask" });
  const real = dialog.showMessageBox;
  let prompts = 0;
  dialog.showMessageBox = (async () => {
    prompts++;
    return { response: 0, checkboxChecked: true };
  }) as typeof dialog.showMessageBox;
  const tabs = (
    await c.program.openPaths([c.fixture("text.txt"), c.fixture("data.json")])
  )[0];
  await c.check(
    tabs,
    "multi-file tabs",
    "document.querySelectorAll('.tab').length===2",
  );
  if (prompts !== 1 || c.program.settings.get().multiFileMode !== "tabs")
    throw Error("Multi-file preference not saved");
  await c.click(tabs, ".tab .tab-name", "data.json");
  await c.check(
    tabs,
    "tab switch",
    "document.querySelector('.tab.active').textContent.includes('data.json')",
  );
  // Wheel over tab bar cycles files and keeps active tab in view.
  await c.evaluate(
    tabs,
    "document.querySelector('.tabs').dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}))",
  );
  await c.pause(200);
  await c.check(
    tabs,
    "wheel on tab bar switches file",
    "!!document.querySelector('.tab.active')",
  );
  await c.check(
    tabs,
    "active tab remains visible in strip after wheel switch",
    `(()=>{
      const bar=document.querySelector('.tabs');
      const tab=document.querySelector('.tab.active');
      if(!bar||!tab) return false;
      const b=bar.getBoundingClientRect(), t=tab.getBoundingClientRect();
      return t.left>=b.left-2 && t.right<=b.right+2;
    })()`,
  );
  await c.evaluate(
    tabs,
    "(()=>{const tabs=document.querySelectorAll('.tab');tabs[1].dispatchEvent(new DragEvent('dragstart',{bubbles:true}));tabs[0].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true}))})()",
  );
  await c.check(
    tabs,
    "tab reorder",
    "document.querySelector('.tab').textContent.includes('data.json')",
  );
  await c.click(tabs, ".tab-close");
  await c.check(
    tabs,
    "tab close releases component",
    "document.querySelectorAll('.preview-tab').length===1",
  );
  // Preview chrome: + 打开 appends another file as a tab in the same window.
  const realOpen = dialog.showOpenDialog;
  dialog.showOpenDialog = (async () => ({
    canceled: false,
    filePaths: [c.fixture("document.pdf")],
  })) as typeof dialog.showOpenDialog;
  await c.click(tabs, ".tab-add-file");
  await c.check(
    tabs,
    "preview add-file button appends tab",
    "document.querySelectorAll('.tab').length===2 && document.body.textContent.includes('document.pdf')",
  );
  dialog.showOpenDialog = realOpen;
  c.close(tabs);
  const again = await c.program.openPaths([
    c.fixture("text.txt"),
    c.fixture("data.json"),
  ]);
  if (prompts !== 1 || again.length !== 1)
    throw Error("Repeated multi-file prompt");
  c.close(again[0]);
  c.pass("multi-file choice remembered");
  c.program.updateSettings({ multiFileMode: "windows" });
  const separate = await c.program.openPaths([
    c.fixture("text.txt"),
    c.fixture("data.json"),
  ]);
  if (separate.length !== 2) throw Error("Independent windows");
  await c.pause(700);
  if (!separate.every((win) => win.isMaximized()))
    throw Error("Preview window not maximized");
  const beforeClose = prompts;
  separate[0].close();
  await c.pause(150);
  if (
    !separate[0].isDestroyed() ||
    separate[1].isDestroyed() ||
    prompts !== beforeClose
  )
    throw Error("Preview close must not prompt or close other windows");
  c.close(separate[1]);
  c.pass("preview X only closes its own window");
  c.pass("independent windows default maximized");
  const source = await c.open("text.txt"),
    target = await c.open("data.json");
  if (source.getTitle() !== "文件预览" || c.home.getTitle() !== "文件预览")
    throw Error("Chinese native title");
  const id = await c.evaluate<string>(
    source,
    "document.querySelector('.preview-tab').dataset.fileId",
  );
  await c.evaluate(source, "(()=>{const s=document.querySelector('.text-tools select');s.value='gb18030';s.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.evaluate(
    source,
    "(()=>{const z=document.querySelector('.zoom-control input');z.value='137';z.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await c.evaluate(
    target,
    `(()=>{const data=new DataTransfer();data.setData('application/x-file-preview-tab',${JSON.stringify(id)});document.querySelector('main').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}))})()`,
  );
  await c.check(
    target,
    "cross-window tab received",
    "document.querySelectorAll('.tab').length===2&&document.querySelector('.tab.active').textContent.includes('text.txt')",
  );
  await c.check(
    target,
    "transfer retains custom zoom",
    `document.querySelector('[data-file-id="${id}"] .zoom-control input').value==='137'`,
  );
  await c.pause(250);
  if (!source.isDestroyed()) throw Error("Empty source window was not closed");
  c.pass("successful transfer releases source window");
  await c.check(target, 'transfer retains text encoding', `document.querySelector('[data-file-id="${id}"] .text-tools select').value==='gb18030'`);
  await c.evaluate(
    target,
    "(()=>{const data=new DataTransfer();data.setData('application/x-file-preview-tab','missing');document.querySelector('main').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}))})()",
  );
  await c.check(
    target,
    "failed transfer preserves target files",
    "document.querySelectorAll('.tab').length===2&&!!document.querySelector('.action-error')",
  );
  c.close(target);
  const fitSource = await c.open('document.pdf');
  await c.evaluate(fitSource, "(()=>{const s=document.querySelector('[aria-label=页面适配]');s.value='width';s.dispatchEvent(new Event('change',{bubbles:true}))})()");
  const fitTarget = await c.open('text.txt');
  const fitId = await c.evaluate<string>(fitSource, "document.querySelector('.preview-tab').dataset.fileId");
  await c.evaluate(fitTarget, `(()=>{const d=new DataTransfer();d.setData('application/x-file-preview-tab',${JSON.stringify(fitId)});document.querySelector('main').dispatchEvent(new DragEvent('drop',{dataTransfer:d,bubbles:true,cancelable:true}))})()`);
  await c.check(fitTarget, 'transfer retains page fit mode', `document.querySelector('[data-file-id="${fitId}"] [aria-label=页面适配]')?.value==='width'`);
  c.close(fitTarget);
  c.program.updateSettings({ closeAction: "ask" });
  dialog.showMessageBox = (async () => {
    prompts++;
    return { response: 1, checkboxChecked: true };
  }) as typeof dialog.showMessageBox;
  c.home.close();
  await c.pause(300);
  if (c.home.isVisible() || c.program.settings.get().closeAction !== "tray")
    throw Error("Tray close preference");
  const promptCount = prompts;
  c.home.showInactive();
  c.home.close();
  await c.pause(200);
  if (prompts !== promptCount) throw Error("Repeated close prompt");
  c.home.showInactive();
  c.pass("close-to-tray remembered without exiting");
  dialog.showMessageBox = real;
  await c.check(
    c.home,
    "external network blocked",
    "fetch('https://example.com').then(()=>false,()=>true)",
  );
  if (c.home.webContents.session.isPersistent() || c.program.payloads.size)
    throw Error("Session/payload leak");
  c.pass("memory session and payload release");
  await c.snapshot(c.home, "home");
  await checkTabbarLayout(c);
};
export default suite;
