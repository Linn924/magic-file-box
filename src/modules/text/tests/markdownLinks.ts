import assert from 'node:assert/strict';
import {BrowserWindow,shell} from 'electron';
import {writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Suite} from '../../../../tests/context';
import {resolveMarkdownLink} from '../../../../electron/markdownLinks';
const suite:Suite=async c=>{
  const sourcePath=c.fixture('md-links.md'),target='md-link-target 中文.md',targetPath=c.fixture(target);
  const source='# 起点\n\n[网页](https://example.com/docs) [本页](#末尾) [文件](md-link-target%20%E4%B8%AD%E6%96%87.md#目标) [文本](text.txt) [缺失](missing-md-link.txt) [危险](javascript:alert(1))\n\n'+('普通段落\n\n'.repeat(100))+'# 末尾\n';
  if(!readFileSyncSafe(sourcePath))writeFileSync(sourcePath,source);if(!readFileSyncSafe(targetPath))writeFileSync(targetPath,'# 开始\n\n'+('目标前的段落\n\n'.repeat(100))+'# 目标\n\n链接目标内容');
  const previous=c.program.settings.get().multiFileMode;await c.evaluate(c.home,"window.localPreview.setSettings({multiFileMode:'windows'})");
  const before=readFileSync(sourcePath),real=shell.openExternal;let external='';shell.openExternal=(async url=>{external=url;}) as typeof real;
  const win=await c.open('md-links.md'),opened:BrowserWindow[]=[];
  try{
    assert.equal(resolveMarkdownLink(sourcePath,'../fixtures/text.txt').path,path.resolve(path.dirname(sourcePath),'../fixtures/text.txt'));for(const value of ['javascript:alert(1)','data:text/html,test','file://server/share/a.txt','bad%00.txt','tool.exe'])assert.throws(()=>resolveMarkdownLink(sourcePath,value),value);
    assert.equal(resolveMarkdownLink(sourcePath,pathToFileURL(targetPath).href).path,targetPath);assert.equal(resolveMarkdownLink(sourcePath,targetPath).path,targetPath);assert.equal(resolveMarkdownLink(sourcePath,'#目标').anchor,'目标');
    await c.click(win,'.markdown a','网页');await c.pause(50);assert.equal(external,'https://example.com/docs');c.pass('Markdown explicit web link uses the system browser');
    await c.click(win,'.markdown a','本页');await c.check(win,'Markdown internal heading anchor scrolls the document',"document.querySelector('.text-scroll').scrollTop>300&&!document.querySelector('[role=alert]')");
    const current=new Set(BrowserWindow.getAllWindows().map(w=>w.id));await c.click(win,'.markdown a','文件');for(let i=0;i<100&&!opened.length;i++){opened.push(...BrowserWindow.getAllWindows().filter(w=>!current.has(w.id)));if(!opened.length)await c.pause(50);}assert.ok(opened.length,'local link opens a preview');await c.check(opened[0],'linked Markdown file opens at its target heading',"document.querySelector('.markdown')?.textContent.includes('链接目标内容')&&document.querySelector('.text-scroll').scrollTop>300");
    const beforeText=new Set(BrowserWindow.getAllWindows().map(w=>w.id));await c.click(win,'.markdown a','文本');let textWindow:BrowserWindow|undefined;for(let i=0;i<100&&!textWindow;i++){textWindow=BrowserWindow.getAllWindows().find(w=>!beforeText.has(w.id));if(!textWindow)await c.pause(50);}assert.ok(textWindow);opened.push(textWindow);await c.check(textWindow,'Markdown linked text file uses its registered preview module',"!!document.querySelector('.text-code')");
    await c.click(win,'.markdown a','缺失');await c.check(win,'missing local link reports an error without replacing source',"document.querySelector('[role=alert]')?.textContent.includes('不存在')&&document.querySelector('.markdown h1').textContent==='起点'");
    await c.click(win,'.markdown a','危险');await c.check(win,'unsafe link scheme cannot launch a program',"document.querySelector('[role=alert]')?.textContent.includes('协议')");assert.equal(external,'https://example.com/docs');assert.deepEqual(readFileSync(sourcePath),before);
    await c.snapshot(win,'markdown-link-errors');c.pass('Markdown relative Unicode file links, cross-document anchors, source protection and protocol rejection');
  }finally{shell.openExternal=real;for(const w of opened)if(!w.isDestroyed())c.close(w);c.close(win);await c.evaluate(c.home,`window.localPreview.setSettings({multiFileMode:${JSON.stringify(previous)}})`);}
};
function readFileSyncSafe(p:string){try{return readFileSync(p);}catch{return undefined;}}
export default suite;
