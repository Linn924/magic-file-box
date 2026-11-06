import {app,BrowserWindow,ImageView,nativeTheme,desktopCapturer,protocol,nativeImage,Menu,screen} from 'electron';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {windowTheme} from '../../shared/windowTheme';

protocol.registerSchemesAsPrivileged([{scheme:'prototype',privileges:{standard:true,secure:true}}]);
const output=path.resolve('outputs/verification/image-loading');
mkdirSync(output,{recursive:true});
const html=readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const log:Array<Record<string,unknown>>=[];
let timers=0,overlays=0;
app.setPath('userData',path.resolve('work/image-loading-profile-'+process.pid));
app.commandLine.appendSwitch('disable-background-timer-throttling');

async function capture(win:BrowserWindow,name:string){
  if(!process.argv.includes('--capture'))return false;
  if(name.startsWith('system-')||name.includes('-close-'))return false;
  const sources=await Promise.race([
    desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1200,height:900}}),
    pause(5000).then(()=>[]),
  ]);
  const source=sources.find(item=>item.id===win.getMediaSourceId());
  if(source&&!source.thumbnail.isEmpty()){
    writeFileSync(path.join(output,name+'.png'),source.thumbnail.toPNG());
    return true;
  }
  return false;
}

async function generate(theme:string){
  const generator=new BrowserWindow({show:false,width:1280,height:840,webPreferences:{partition:"frame-generator-"+theme,
    sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,
  }});
  try{
    await generator.webContents.session.protocol.handle('prototype',()=>new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
    await generator.loadURL('prototype://local/index.html');
    await generator.webContents.executeJavaScript(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
    const displayScale=screen.getDisplayMatching(generator.getBounds()).scaleFactor;
    const zoom=3/displayScale;
    generator.webContents.setZoomFactor(zoom);
    const box=await generator.webContents.executeJavaScript(`(()=>{
      const card=document.querySelector('.startup-card'),r=card.getBoundingClientRect();



      document.querySelector('.startup-spinner').getAnimations()[0].pause();
      const width=Math.ceil((r.width+56)/4)*4,height=Math.ceil((r.height+56)/4)*4;
      return {x:r.x+r.width/2-width/2,y:r.y+r.height/2-height/2,width,height};
    })()`);
    const frames=[];
    for(let frame=0;frame<48;frame++){
      await generator.webContents.executeJavaScript(`document.querySelector('.startup-spinner').getAnimations()[0].currentTime=${frame*800/48}`);
      await generator.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      const captured=await generator.webContents.capturePage({
        x:Math.round(box.x*zoom),y:Math.round(box.y*zoom),
        width:Math.round(box.width*zoom),height:Math.round(box.height*zoom),
      });
      const image=nativeImage.createEmpty();
      for(const scale of [1,1.25,1.5,2,3]){
        const pixels=captured.resize({width:Math.round(box.width*scale),height:Math.round(box.height*scale),quality:'best'});
        image.addRepresentation({scaleFactor:scale,buffer:pixels.toPNG()});
      }
      if(frame===0)console.log(JSON.stringify({theme,box,displayScale,representations:image.getScaleFactors()}));
      frames.push(image);
    }
    writeFileSync(path.join(output,theme+'-card.png'),frames[0].toPNG());
    return {frames,box};
  }finally{generator.destroy();}
}

async function run(theme:'light'|'dark'|'system',system:'light'|'dark',assets:Awaited<ReturnType<typeof generate>>,earlyClose=false){
  nativeTheme.themeSource=system;
  const resolved=windowTheme(theme,nativeTheme.shouldUseDarkColors);
  const win=new BrowserWindow({show:false,width:900,height:640,backgroundColor:resolved.background,webPreferences:{
    sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,
  }});
  const card=new ImageView();
  win.contentView.addChildView(card);
  overlays++;
  const layout=()=>{
    if(win.isDestroyed())return;
    const [width,height]=win.getContentSize();

    card.setBounds({x:Math.round((width-assets.box.width)/2),y:Math.round((height-assets.box.height)/2),
      width:assets.box.width,height:assets.box.height});
  };
  layout();
  win.on('resize',layout);
  const started=performance.now();
  const frame=()=>Math.floor((performance.now()-started)%800/800*48)%48;
  card.setImage(assets.frames[0]);
  let active=true;
  const timer=setInterval(()=>{if(active&&!win.isDestroyed())card.setImage(assets.frames[frame()]);},1000/60);
  timers++;
  const dispose=()=>{
    if(!active)return;
    active=false;
    clearInterval(timer);timers--;overlays--;
    win.removeListener('resize',layout);
    if(!win.isDestroyed())win.contentView.removeChildView(card);

  };
  win.once('closed',dispose);
  win.show();
  try{
    assert.equal(win.webContents.getURL(),'','native loading is displayed before HTML navigation');
    win.setContentSize(960,680);
    await pause(300);
    const name=theme+'-'+system+(earlyClose?'-close':'');
    const nativeCaptured=await capture(win,name+'-native');
    win.setContentSize(720,520);await pause(120);
    let bounds=card.getBounds();
    assert.ok(Math.abs(bounds.x+bounds.width/2-360)<=1);
    assert.ok(Math.abs(bounds.y+bounds.height/2-260)<=1);
    win.setContentSize(960,680);await pause(120);
    bounds=card.getBounds();
    assert.ok(Math.abs(bounds.x+bounds.width/2-480)<=1);
    assert.ok(Math.abs(bounds.y+bounds.height/2-340)<=1);
    if(earlyClose){
      win.close();await pause(50);
      assert.equal(active,false);
      log.push({name,nativeCaptured,closed:true,timers,overlays});
      return;
    }
    await win.loadURL('prototype://local/index.html');
    await win.webContents.executeJavaScript(`(()=>{
      document.documentElement.dataset.theme=${JSON.stringify(resolved.name)};
      const spin=document.querySelector('.startup-spinner').getAnimations()[0];
      spin.currentTime=${(performance.now()-started)%800};
      return true;
    })()`);

    const htmlBox=await win.webContents.executeJavaScript(`(()=>{
      const r=document.querySelector('.startup-card').getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    assert.ok(Math.abs(htmlBox.x-(bounds.x+bounds.width/2))<=1);
    assert.ok(Math.abs(htmlBox.y-(bounds.y+bounds.height/2))<=1);
    dispose();
    await pause(30);
    const htmlCaptured=await capture(win,name+'-html');
    await win.webContents.executeJavaScript("(()=>{document.querySelector('#startup-status').animate([{opacity:1},{opacity:0}],{duration:160,fill:'forwards'});})()");
    await pause(220);
    await win.webContents.executeJavaScript("document.querySelector('#startup-status').remove()");
    console.log('Completed '+name);
    log.push({name,nativeCaptured,htmlCaptured,centered:true,htmlAligned:true,timers,overlays});
  }finally{
    dispose();
    if(!win.isDestroyed())win.destroy();
  }
}

app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  Menu.setApplicationMenu(null);
  protocol.handle('prototype',()=>new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
  const light=await generate('light'),dark=await generate('dark');
  for(const [theme,system] of [['light','dark'],['dark','light'],['system','light'],['system','dark']] as const){
    await run(theme,system,(theme==='dark'||theme==='system'&&system==='dark')?dark:light);
  }
  await run('dark','dark',dark,true);
  assert.equal(timers,0);assert.equal(overlays,0);
  writeFileSync(path.join(output,'result.json'),JSON.stringify(log,null,2));
  console.log(JSON.stringify(log));
  app.exit();
}).catch(error=>{console.error(error);app.exit(1);});

















