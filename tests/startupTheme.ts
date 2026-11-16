import assert from 'node:assert/strict';
import {app,BrowserWindow,nativeTheme,screen} from 'electron';
import type {TestContext} from './context';
import {holdStartupResponse} from './previewLoadDriver';

export async function checkStartupTheme(c:TestContext){
  const preference=c.program.settings.get().theme;
  try{
    for(const [theme,os] of [['light','dark'],['dark','light'],['system','light'],['system','dark']] as const){
      c.program.updateSettings({theme});
      nativeTheme.themeSource=os;
      const dark=theme==='dark'||theme==='system'&&os==='dark';
      const background=dark?'rgb(27, 31, 39)':'rgb(243, 245, 248)';
      const inspect=(win:BrowserWindow)=>win.webContents.executeJavaScript(
        "({theme:document.documentElement.dataset.theme,background:getComputedStyle(document.body).backgroundColor,htmlLoading:!!document.querySelector('#startup-status .startup-card')?.getClientRects().length})"
      ) as Promise<{theme:string;background:string;htmlLoading:boolean}>;
      const releaseSettings = holdStartupResponse('settings:get');
      try {
        const homeTheme=new Promise<Awaited<ReturnType<typeof inspect>>>((resolve,reject)=>{
          c.home.webContents.once('dom-ready',()=>{inspect(c.home).then(resolve,reject);});
        });
        c.home.webContents.reload();
        const homeStartup=await homeTheme;
        assert.equal(homeStartup.background,background);
        assert.equal(homeStartup.htmlLoading,true);
        await c.check(c.home,'home card stays until settings are ready '+theme+'/'+os,
          "document.querySelector('.startup-spinner')?.getClientRects().length===1&&getComputedStyle(document.querySelector('#app')).visibility==='hidden'");
        await c.snapshot(c.home,'startup-home-'+theme+'-'+os);
      } finally {
        releaseSettings();
      }
      await c.check(c.home,'home is actionable after card removal '+theme+'/'+os,
        "!document.querySelector('#startup-status')&&getComputedStyle(document.querySelector('.dropzone')).visibility==='visible'");
      let initial:Promise<Awaited<ReturnType<typeof inspect>>>|undefined;
      const created=(_event:Electron.Event,win:BrowserWindow)=>{
        win.webContents.once('dom-ready',()=>{
          initial=inspect(win);
        });
      };
      app.once('browser-window-created',created);
      const win=await c.program.openPath(c.fixture('text.txt'));
      try{
        const first=await initial;
        assert.equal(first?.theme,dark?'dark':'light');
        assert.equal(first?.background,background);
        assert.equal(first?.htmlLoading,false);
        assert.equal(win.getBackgroundColor().toLowerCase(),dark?'#1b1f27':'#f3f5f8');
        await c.check(win,'preview reaches readable content without a loading card '+theme+'/'+os,
          "document.querySelector('.preview-body')?.dataset.loadPhase==='ready'&&!document.querySelector('#startup-status,.preview-file-loading')");
        await c.snapshot(win,'startup-preview-'+theme+'-'+os);
        c.pass('current display DPI '+screen.getDisplayMatching(win.getBounds()).scaleFactor);
      }finally{
        app.removeListener('browser-window-created',created);
        c.close(win);
      }
    }
  }finally{
    c.program.updateSettings({theme:preference});
    nativeTheme.themeSource=preference;
  }
  await c.click(c.home,'.settings-button');
  await c.check(c.home,'settings remains available after startup theme checks',"!!document.querySelector('#theme')");
}
