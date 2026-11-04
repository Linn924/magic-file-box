import assert from 'node:assert/strict';
import {app,BrowserWindow,nativeTheme} from 'electron';
import type {TestContext} from './context';

export async function checkStartupTheme(c:TestContext){
  const preference=c.program.settings.get().theme;
  try{
    for(const [theme,os] of [['light','dark'],['dark','light'],['system','light'],['system','dark']] as const){
      // 软件配色写入 nativeTheme 后，再用 themeSource 模拟系统明暗，验证窗口与加载层一致。
      c.program.updateSettings({theme});
      nativeTheme.themeSource=os;
      const dark=theme==='dark'||theme==='system'&&os==='dark';
      const background=dark?'rgb(27, 31, 39)':'rgb(243, 245, 248)';
      const panel=dark?'rgb(37, 42, 50)':'rgb(255, 255, 255)';
      const homeTheme=new Promise<{background:string;card:boolean;cardBackground:string;spinner:boolean;round:boolean;animated:boolean}>((resolve,reject)=>{
        c.home.webContents.once('dom-ready',()=>{
          c.home.webContents.executeJavaScript(`(()=>{
            const layer=document.getElementById('startup-status');
            const card=layer&&layer.querySelector('.startup-card');
            const spinner=layer&&layer.querySelector('.startup-spinner');
            return {background:getComputedStyle(layer).backgroundColor,
              card:!!card,
              cardBackground:card?getComputedStyle(card).backgroundColor:'',
              spinner:!!spinner,
              round:spinner?getComputedStyle(spinner).borderRadius==='50%':false,
              animated:spinner?getComputedStyle(spinner).animationName==='startup-spin':false};
          })()`).then(resolve,reject);
        });
      });
      c.home.webContents.reload();
      const homeStartup=await homeTheme;
      assert.equal(homeStartup.background,background);
      assert.ok(homeStartup.card,'home startup layer uses the card style');
      assert.equal(homeStartup.cardBackground,panel);
      assert.ok(homeStartup.spinner,'home startup layer shows a loading spinner');
      assert.ok(homeStartup.round&&homeStartup.animated,'home startup spinner is round and animated');
      await c.check(c.home,'home startup fade complete '+theme+'/'+os,
        `!!document.querySelector('.dropzone')&&!document.querySelector('#startup-status')&&
        getComputedStyle(document.body).backgroundColor===${JSON.stringify(background)}`);
      nativeTheme.themeSource=os;
      let initial:Promise<{theme:string;background:string;layer:string;present:boolean;card:boolean;cardBackground:string;spinner:boolean;round:boolean;animated:boolean}>|undefined;
      const created=(_event:Electron.Event,win:BrowserWindow)=>{
        win.webContents.once('dom-ready',()=>{
          initial=win.webContents.executeJavaScript(`(()=>{
            const layer=document.getElementById('startup-status');
            const card=layer&&layer.querySelector('.startup-card');
            const spinner=layer&&layer.querySelector('.startup-spinner');
            return {theme:document.documentElement.dataset.theme,
              background:getComputedStyle(document.body).backgroundColor,
              layer:layer?getComputedStyle(layer).backgroundColor:'',
              present:!!layer,
              card:!!card,
              cardBackground:card?getComputedStyle(card).backgroundColor:'',
              spinner:!!spinner,
              round:spinner?getComputedStyle(spinner).borderRadius==='50%':false,
              animated:spinner?getComputedStyle(spinner).animationName==='startup-spin':false};
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
        assert.ok(first.card,'preview startup layer uses the card style');
        assert.equal(first.cardBackground,panel);
        assert.ok(first.spinner&&first.round&&first.animated,'preview startup layer shows the round loading spinner');
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
    c.program.updateSettings({theme:preference});
    nativeTheme.themeSource=preference;
  }
  await c.click(c.home,'.settings-button');
  await c.check(c.home,'settings remains available after startup theme checks',"!!document.querySelector('#theme')");
}
