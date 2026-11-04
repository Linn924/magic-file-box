import assert from 'node:assert/strict';
import {app,BrowserWindow,nativeTheme} from 'electron';
import type {TestContext} from './context';

export async function checkStartupTheme(c:TestContext){
  const preference=c.program.settings.get().theme,system=nativeTheme.themeSource;
  try{
    for(const [theme,os] of [['light','dark'],['dark','light'],['system','light'],['system','dark']] as const){
      nativeTheme.themeSource=os;
      c.program.updateSettings({theme});
      const dark=theme==='dark'||theme==='system'&&os==='dark';
      const background=dark?'rgb(27, 31, 39)':'rgb(243, 245, 248)';
      const homeTheme=new Promise<string>((resolve,reject)=>{
        c.home.webContents.once('dom-ready',()=>{
          c.home.webContents.executeJavaScript(
            "getComputedStyle(document.getElementById('startup-status')).backgroundColor"
          ).then(resolve,reject);
        });
      });
      c.home.webContents.reload();
      assert.equal(await homeTheme,background);
      await c.check(c.home,'home startup fade complete '+theme+'/'+os,
        `!!document.querySelector('.dropzone')&&!document.querySelector('#startup-status')&&
        getComputedStyle(document.body).backgroundColor===${JSON.stringify(background)}`);
      let initial:Promise<{theme:string;background:string;layer:string;present:boolean}>|undefined;
      const created=(_event:Electron.Event,win:BrowserWindow)=>{
        win.webContents.once('dom-ready',()=>{
          initial=win.webContents.executeJavaScript(`(()=>{
            const layer=document.getElementById('startup-status');
            return {theme:document.documentElement.dataset.theme,
              background:getComputedStyle(document.body).backgroundColor,
              layer:layer?getComputedStyle(layer).backgroundColor:'',
              present:!!layer};
          })()`);
        });
      };
      app.once('browser-window-created',created);
      const win=await c.program.openPath(c.fixture('text.txt'));
      try{
        const first=await initial;
        assert.ok(first?.present,'loading layer remains while the application mounts');
        assert.equal(first.theme,dark?'dark':'light');
        assert.equal(first.background,background);
        assert.equal(first.layer,background);
        assert.equal(win.getBackgroundColor().toLowerCase(),dark?'#1b1f27':'#f3f5f8');
        await c.check(win,'startup theme and fade complete '+theme+'/'+os,
          `document.querySelector('.preview-body')?.dataset.loadPhase==='ready'&&
          !document.querySelector('#startup-status')&&
          getComputedStyle(document.body).backgroundColor===${JSON.stringify(background)}`);
        await c.snapshot(win,'startup-'+theme+'-'+os);
      }finally{
        app.removeListener('browser-window-created',created);
        c.close(win);
      }
    }
  }finally{
    nativeTheme.themeSource=system;
    c.program.updateSettings({theme:preference});
  }
  await c.click(c.home,'.settings-button');
  await c.check(c.home,'settings remains available after startup theme checks',"!!document.querySelector('#theme')");
}
