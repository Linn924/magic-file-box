import { app, BrowserWindow, dialog } from "electron";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Suite } from "../context";
import {checkTabbarLayout} from '../tabbarLayout';
import {SettingsStore} from '../../electron/settings';
import {trayMenu} from '../trayMenuDriver';
const suite: Suite = async (c) => {
  const cleanHome = "document.documentElement.dataset.exclusive==='false'&&!document.querySelector('.home-credit,.home-intro,.home-intro-title,.home-intro-canvas')";
  await c.check(c.home, "main home uses the standard entry", cleanHome);
  c.home.webContents.reload();
  await c.check(c.home, "home reload is ready", "!!document.querySelector('.dropzone')");
  await c.check(c.home, "home reload preserves the standard entry", cleanHome);
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
  await c.check(c.home, 'open-home default is ask', "document.querySelector('#open-home-action')?.value==='ask'");
  await c.evaluate(c.home, "(()=>{const s=document.querySelector('#open-home-action');s.value='keep';s.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.check(c.home, 'open-home setting saves via UI', "document.querySelector('#open-home-action')?.value==='keep'");
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
  if(config.openHomeAction!=='keep'||new SettingsStore(path.join(app.getPath('userData'),'preferences.json')).get().openHomeAction!=='keep')throw Error('Open-home preference must survive settings reload');
  await c.snapshot(c.home, "settings-dark");
  await c.click(c.home, 'button[aria-label="关闭设置"]');
  const originalMessageBox = dialog.showMessageBox;
  const originalOpenDialog = dialog.showOpenDialog;
  let openPrompts = 0;
  let answer = {response:1,checkboxChecked:false};
  dialog.showMessageBox = (async (...args:unknown[]) => {
    const options = args.at(-1) as Electron.MessageBoxOptions;
    if(options.title!=='打开文件后的主页')throw Error('Unexpected open-home dialog');
    if(options.cancelId!==1||options.checkboxChecked!==false)throw Error('Open-home must default to keeping home without remembering');
    openPrompts++;
    return answer;
  }) as typeof dialog.showMessageBox;
  try {
    c.program.updateSettings({openHomeAction:'ask'});
    const first=await c.open('text.txt');c.close(first);
    const second=await c.open('data.json');c.close(second);
    if(openPrompts!==2||!c.home.isVisible()||c.program.settings.get().openHomeAction!=='ask')throw Error('Each visible-home open must ask without saving an unchecked choice');
    answer={response:0,checkboxChecked:false};
    const hidden=await c.open('text.txt');
    if(c.home.isVisible()||!hidden.isVisible()||c.program.settings.get().openHomeAction!=='ask')throw Error('Open-home hide must preserve preview and ask preference');
    const count=openPrompts;
    const hiddenAgain=await c.open('data.json');c.close(hiddenAgain);
    if(openPrompts!==count)throw Error('Hidden home must not prompt');
    c.close(hidden);c.home.showInactive();
    answer={response:1,checkboxChecked:true};
    const keep=await c.open('text.txt');c.close(keep);
    const savedCount=openPrompts;
    const keepAgain=await c.open('text.txt');c.close(keepAgain);
    if(openPrompts!==savedCount||!c.home.isVisible()||c.program.settings.get().openHomeAction!=='keep')throw Error('Remembered keep must suppress prompts');
    c.program.updateSettings({openHomeAction:'ask'});
    answer={response:0,checkboxChecked:true};
    const tray=await c.open('text.txt');c.close(tray);
    c.home.showInactive();
    const beforeTray=openPrompts;
    const trayAgain=await c.open('text.txt');
    if(openPrompts!==beforeTray||c.home.isVisible()||!trayAgain.isVisible()||c.program.settings.get().closeAction!=='ask'||new SettingsStore(path.join(app.getPath('userData'),'preferences.json')).get().openHomeAction!=='tray')throw Error('Remembered tray must persist independently of home-close preference');
    c.close(trayAgain);c.home.showInactive();
    c.program.updateSettings({openHomeAction:'ask'});
    const beforeCancel=openPrompts;
    if((await c.program.openPaths([])).length)throw Error('Empty open');
    const missing = await c.program.openPath(c.fixture('missing-file.txt'));c.close(missing);
    dialog.showOpenDialog=(async()=>({canceled:true,filePaths:[]})) as typeof dialog.showOpenDialog;
    await c.evaluate(c.home,'window.localPreview.select()');
    if(openPrompts!==beforeCancel||!c.home.isVisible())throw Error('Canceled/failed opens must not hide or ask');
    c.program.updateSettings({multiFileMode:'ask'});
    dialog.showMessageBox=(async(...args:unknown[])=>{if((args.at(-1) as Electron.MessageBoxOptions).title!=='打开多个文件')throw Error('Canceled batch asked about home');return {response:2,checkboxChecked:false};}) as typeof dialog.showMessageBox;
    if((await c.program.openPaths([c.fixture('text.txt'),c.fixture('data.json')])).length||!c.home.isVisible())throw Error('Canceled multi-file open must preserve home');
    c.program.updateSettings({openHomeAction:'keep'});
    const addTarget=await c.open('text.txt');
    c.program.updateSettings({openHomeAction:'ask'});
    dialog.showMessageBox=(async()=>{openPrompts++;return {response:0,checkboxChecked:false};}) as typeof dialog.showMessageBox;
    dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[c.fixture('data.json')]})) as typeof dialog.showOpenDialog;
    await c.click(addTarget,'.tab-add-file');
    await c.check(addTarget,'adding a file also applies open-home preference',"document.querySelectorAll('.tab').length===2");
    if(c.home.isVisible()||!addTarget.isVisible())throw Error('Add-file must hide only home');
    c.close(addTarget);
    c.home.showInactive();
    c.pass('open-home asks each time, preserves previews, remembers choices, skips hidden/failed/canceled opens');
  } finally {
    dialog.showMessageBox=originalMessageBox;
    dialog.showOpenDialog=originalOpenDialog;
    c.program.updateSettings({openHomeAction:'keep'});
    c.home.showInactive();
  }
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
  await c.check(tabs, "preview only contains file viewing controls", "!document.querySelector('.home-intro,.home-intro-title,.home-intro-canvas')");
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
  if (source.getTitle() !== "魔法文件匣" || c.home.getTitle() !== "魔法文件匣")
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
  const retained=await c.open('text.txt'),retainedOther=await c.open('data.json');
  c.program.updateSettings({ closeAction: "ask" });
  dialog.showMessageBox=(async()=>{prompts++;return {response:2,checkboxChecked:false};}) as typeof dialog.showMessageBox;
  c.home.close();await c.pause(150);
  if(!c.home.isVisible()||!retained.isVisible()||!retainedOther.isVisible()||c.program.settings.get().closeAction!=='ask')throw Error('Canceling home close must preserve all windows and the unconfigured setting');
  c.pass('unconfigured home close cancel preserves previews');
  dialog.showMessageBox=(async()=>{prompts++;return {response:1,checkboxChecked:false};}) as typeof dialog.showMessageBox;
  c.home.close();await c.pause(150);
  if(c.home.isVisible()||!retained.isVisible()||!retainedOther.isVisible()||retained.isDestroyed()||retainedOther.isDestroyed()||c.program.settings.get().closeAction!=='ask')throw Error('Home-only tray hide must preserve preview visibility without saving an unchecked choice');
  await c.check(retained,'preview remains usable after hiding an unconfigured home',"document.querySelector('.line-body')?.textContent.length>0");
  c.home.showInactive();
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
  if(!retained.isVisible()||!retainedOther.isVisible()||retained.isDestroyed()||retainedOther.isDestroyed())throw Error('Remembered tray choice must hide only home');
  c.home.showInactive();
  c.pass("close-to-tray remembered without exiting");
  const traySettings=trayMenu()?.items.find(item=>item.label==='设置');
  if(!traySettings)throw Error('Tray menu must contain settings');
  retainedOther.hide();c.home.hide();
  traySettings.click(undefined as never,undefined as never,undefined as never);
  await c.check(c.home,'tray settings restores home and opens the real settings panel',"!!document.querySelector('.settings-panel')");
  if(!c.home.isVisible()||retainedOther.isVisible()||!retained.isVisible())throw Error('Tray settings must preserve other window visibility');
  traySettings.click(undefined as never,undefined as never,undefined as never);
  await c.check(c.home,'repeated tray settings uses the same panel',"document.querySelectorAll('.settings-panel').length===1");
  await c.evaluate(c.home,"(()=>{const select=document.querySelector('#theme');select.value='dark';select.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.check(retained,'tray-opened settings still broadcast to previews',"document.documentElement.dataset.theme==='dark'");
  await c.click(c.home,'button[aria-label="关闭设置"]');
  c.program.updateSettings({theme:'light'});retainedOther.showInactive();
  c.pass('remembered home close retains both preview windows');
  c.close(retained);c.close(retainedOther);
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
