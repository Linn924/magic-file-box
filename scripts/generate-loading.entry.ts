import {app,BrowserWindow,protocol,screen} from 'electron';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {startupCardHtml} from '../shared/startupCard';

const output=process.env.MFB_LOADING_OUTPUT!;
app.setPath('userData',path.resolve('work/loading-generator-profile'));
app.on('window-all-closed',()=>{});
protocol.registerSchemesAsPrivileged([{scheme:'loading-assets',privileges:{standard:true,secure:true}}]);

app.whenReady().then(async()=>{
  protocol.handle('loading-assets',()=>new Response(startupCardHtml,{headers:{'Content-Type':'text/html;charset=utf-8'}}));
  let width=0,height=0;
  const scales=[1,1.25,1.5,2,3];
  for(const theme of ['light','dark']){
    const win=new BrowserWindow({show:false,transparent:true,backgroundColor:'#00000000',width:1280,height:840,webPreferences:{
      sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,
    }});
    try{
      await win.loadURL('loading-assets://local/index.html');
      const zoom=3/screen.getDisplayMatching(win.getBounds()).scaleFactor;
      win.webContents.setZoomFactor(zoom);
      const box=await win.webContents.executeJavaScript(`(()=>{
        document.documentElement.dataset.theme=${JSON.stringify(theme)};
        document.documentElement.style.background='transparent';
        document.body.style.background='transparent';
        document.querySelector('#startup-status').style.background='transparent';
        const spin=document.querySelector('.startup-spinner');
        spin.style.animation='none';
        const r=document.querySelector('.startup-card').getBoundingClientRect();
        const width=Math.ceil((r.width+56)/4)*4,height=Math.ceil((r.height+56)/4)*4;
        return {x:r.x+r.width/2-width/2,y:r.y+r.height/2-height/2,width,height};
      })()`);
      width=box.width;height=box.height;
      for(let frame=0;frame<48;frame++){
        await win.webContents.executeJavaScript(`document.querySelector('.startup-spinner').style.transform='rotate(${frame*360/48}deg)'`);
        await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
        const image=await win.webContents.capturePage({
          x:Math.round(box.x*zoom),y:Math.round(box.y*zoom),
          width:Math.round(width*zoom),height:Math.round(height*zoom),
        });
        for(const scale of scales){
          const dir=path.join(output,theme,String(scale));
          mkdirSync(dir,{recursive:true});
          writeFileSync(path.join(dir,frame+'.png'),image.resize({
            width:Math.round(width*scale),height:Math.round(height*scale),quality:'best',
          }).toPNG());
        }
      }
    }finally{win.destroy();}
  }
  writeFileSync(path.join(output,'manifest.json'),JSON.stringify({width,height,scales,count:48,period:800}));
  app.exit();
}).catch(error=>{console.error(error);app.exit(1);});
