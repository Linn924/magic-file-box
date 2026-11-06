import assert from 'node:assert/strict';
import {app,BrowserWindow,nativeTheme,screen} from 'electron';
import type {TestContext} from './context';

export async function checkStartupTheme(c:TestContext){
  const preference=c.program.settings.get().theme;
  try{
    for(const [theme,os] of [['light','dark'],['dark','light'],['system','light'],['system','dark']] as const){
      c.program.updateSettings({theme});
      nativeTheme.themeSource=os;
      const dark=theme==='dark'||theme==='system'&&os==='dark';
      const background=dark?'rgb(27, 31, 39)':'rgb(243, 245, 248)';
      const inspect=(win:BrowserWindow)=>win.webContents.executeJavaScript(
        "({theme:document.documentElement.dataset.theme,background:getComputedStyle(document.body).backgroundColor,htmlLoading:!!document.querySelector('#startup-status')})"
      ) as Promise<{theme:string;background:string;htmlLoading:boolean}>;
      const homeTheme=new Promise<Awaited<ReturnType<typeof inspect>>>((resolve,reject)=>{
        c.home.webContents.once('dom-ready',()=>{inspect(c.home).then(resolve,reject);});
      });
      c.home.webContents.reload();
      const homeStartup=await homeTheme;
      assert.equal(homeStartup.background,background);
      assert.equal(homeStartup.htmlLoading,false);
      await c.check(c.home,'home ready without HTML startup layer '+theme+'/'+os,
        "!!document.querySelector('.dropzone')");
      for(let i=0;i<100&&c.program.startupLoadingStats(c.home.webContents.id).bounds;i++)await c.pause(20);
      assert.equal(c.program.startupLoadingStats(c.home.webContents.id).bounds,undefined);
      let initial:Promise<Awaited<ReturnType<typeof inspect>>>|undefined;
      let nativeAtDom=false;
      const created=(_event:Electron.Event,win:BrowserWindow)=>{
        win.webContents.once('dom-ready',()=>{
          nativeAtDom=!!c.program.startupLoadingStats(win.webContents.id).bounds;
          initial=inspect(win);
        });
      };
      app.once('browser-window-created',created);
      const win=await c.program.openPath(c.fixture('text.txt'));
      try{
        const first=await initial;
        assert.ok(nativeAtDom,'native card remains until the preview is ready');
        assert.equal(first?.theme,dark?'dark':'light');
        assert.equal(first?.background,background);
        assert.equal(first?.htmlLoading,false);
        assert.equal(win.getBackgroundColor().toLowerCase(),dark?'#1b1f27':'#f3f5f8');
        await c.check(win,'native loading reaches readable preview '+theme+'/'+os,
          "document.querySelector('.preview-body')?.dataset.loadPhase==='ready'");
        for(let i=0;i<100&&c.program.startupLoadingStats(win.webContents.id).bounds;i++)await c.pause(20);
        assert.equal(c.program.startupLoadingStats(win.webContents.id).bounds,undefined);
        await c.snapshot(win,'startup-native-'+theme+'-'+os);
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
