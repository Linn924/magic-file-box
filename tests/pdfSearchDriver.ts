import {ipcMain} from 'electron';
export const searchRangeTest={enabled:false,start:Infinity,end:Infinity,tokens:new Set<string>(),opens:0,failures:0,hold:false,waiting:0,releases:new Set<()=>void>()};
export function releaseSearchRanges(){searchRangeTest.hold=false;for(const release of searchRangeTest.releases)release();searchRangeTest.releases.clear();}
export function installPdfSearchDriver(){
 const handle=ipcMain.handle.bind(ipcMain);
 ipcMain.handle=(channel,listener)=>handle(channel,async(event,...args)=>{
  if(channel==='source:open'&&searchRangeTest.enabled){searchRangeTest.tokens.add(args[1]);searchRangeTest.opens++;}
  if(channel==='source:range'&&searchRangeTest.tokens.has(args[0])){
   if(searchRangeTest.hold){searchRangeTest.waiting++;await new Promise<void>(resolve=>searchRangeTest.releases.add(resolve));searchRangeTest.waiting--;}
   if(args[1]>=searchRangeTest.start&&args[1]<searchRangeTest.end){searchRangeTest.failures++;throw Error('PDF 搜索读取预算测试失败');}
  }
  return listener(event,...args);
 });
}
