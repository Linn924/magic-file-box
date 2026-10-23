import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,mkdirSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import electron from 'electron';
import * as XLSX from 'xlsx';
import {sourceFixtures} from './sourceFixtures';
import {encryptedFixture} from '../src/modules/pdf/tests/encryptedFixture';

if(process.platform!=='win32')throw Error('Exit-resource process/handle checks currently target Windows');
const exec=promisify(execFile),pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const caseNames=['reading','parsing','source-read','password','multi-cache','dirty-cancel','restart-clean'];
const caseIndex=process.argv.indexOf('--cases');
const selected=caseIndex<0?caseNames:(process.argv[caseIndex+1]??'').split(',');
if(!selected.length||selected.some(name=>!caseNames.includes(name)))throw Error('Unknown exit-resource case');
if(selected.includes('restart-clean')&&!selected.includes('multi-cache'))throw Error('restart-clean requires multi-cache in the same run');
const suffix=caseIndex<0?'':'-'+selected.join('-');
const fixtureRoot=path.resolve('work/exit-resource-fixtures'),runRoot=path.resolve('work/test-profiles/exit-resources-'+process.pid),output=path.resolve('outputs/verification');
mkdirSync(fixtureRoot,{recursive:true});mkdirSync(runRoot,{recursive:true});mkdirSync(output,{recursive:true});
const large=await sourceFixtures(),worker=path.join(fixtureRoot,'real-worker-v1.xlsx');
if(!existsSync(worker)){
  const rows=Array.from({length:150000},(_,r)=>Array.from({length:12},(_,c)=>c===0?'exit-row-'+r:r*12+c));
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Data');
  writeFileSync(worker,XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true}));
}
assert.ok(statSync(worker).size<24*1024*1024,'worker fixture must use the real full-buffer parser');
const password=path.join(fixtureRoot,'password.pdf');if(!existsSync(password))encryptedFixture(password,true);
const privateMarker='exit-private-memory-only-7bf4a76e';
const text=path.join(fixtureRoot,'memory-only.txt');if(!existsSync(text))writeFileSync(text,privateMarker+'\nlocal private fixture\n');
assert.ok(readFileSync(text,'utf8').includes(privateMarker),'private-memory fixture must contain the marker being audited');
const code=path.join(fixtureRoot,'cached-code.js');if(!existsSync(code))writeFileSync(code,'// local syntax cache fixture\nexport function cachedPreview(value) {\n  return value + 1;\n}\n');
const fixtures={text,worker,password,largeText:large.txt,pdf:path.resolve('work/fixtures/document.pdf'),code,word:path.resolve('work/fixtures/document.docx'),image:path.resolve('work/fixtures/image.png'),workbook:path.resolve('work/fixtures/styled.xlsx'),ppt:path.resolve('work/fixtures/presentation.pptx')};
const digest=async(file:string)=>{const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');};
const originals=new Map(await Promise.all([...new Set(Object.values(fixtures))].map(async file=>[file,await digest(file)] as const)));
await build({tsconfig:'tsconfig.electron.json',entryPoints:['tests/exitResources.entry.ts'],outfile:'.test-build/exit-resources.cjs',bundle:true,platform:'node',format:'cjs',target:'node22',external:['electron','../electron-dist/main.cjs']});
type Proc={ProcessId:number;ParentProcessId:number;Name:string;Started:string;WorkingSetSize:number};
async function census():Promise<Proc[]>{
  const command="@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,@{n='Started';e={$_.CreationDate.ToUniversalTime().ToString('o')}},WorkingSetSize) | ConvertTo-Json -Compress";
  const {stdout}=await exec('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,maxBuffer:4*1024*1024,timeout:15000});
  return JSON.parse(stdout.replace(/^\uFEFF/,''));
}
function profileFiles(root:string):Array<{name:string;bytes:number}>{
  return readdirSync(root,{withFileTypes:true}).flatMap(item=>{const file=path.join(root,item.name);return item.isDirectory()?profileFiles(file):[{name:path.relative(runRoot,file),bytes:statSync(file).size}];});
}
async function exclusiveRead(files:string[]){
  const command="$ErrorActionPreference='Stop'; $files=$env:MFB_EXIT_FILES | ConvertFrom-Json; foreach($file in $files){$stream=[System.IO.File]::Open($file,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::None);$stream.Dispose()}; 'PASS exclusive read access to all source fixtures'";
  const result=await exec('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:15000,env:{...process.env,MFB_EXIT_FILES:JSON.stringify(files)}});
  assert.match(result.stdout,/PASS exclusive/);
}
const results:Array<Record<string,unknown>>=[];
async function scenario(mode:string,reuse?:string){
  const profile=reuse??path.join(runRoot,mode);mkdirSync(profile,{recursive:true});
  writeFileSync(path.join(profile,'exit-fixtures.json'),JSON.stringify(fixtures));
  const command=path.join(profile,'exit-command.json');
  if(existsSync(command))throw Error('Stale exit command: '+profile);
  const child=spawn(electron as unknown as string,['.test-build/exit-resources.cjs','--case',mode,'--user-data-dir='+profile],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  assert.ok(child.pid);const rootPid=child.pid;
  const tracked=new Map<number,Proc>(),events:Array<Record<string,any>>=[];let stderr='',buffer='',exitCode:number|null|undefined,prepared=false,failed='';
  const exited=new Promise<void>(resolve=>child.once('exit',code=>{exitCode=code;resolve();}));
  child.stdout.on('data',chunk=>{buffer+=String(chunk);const lines=buffer.split(/\r?\n/);buffer=lines.pop()!;for(const line of lines){if(!line.startsWith('__EXIT_RESOURCE__'))continue;const event=JSON.parse(line.slice('__EXIT_RESOURCE__'.length));events.push(event);if(event.event==='prepared')prepared=true;if(event.event==='failure')failed=event.error;}});
  child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-16000);});
  const sample=async()=>{
    const rows=await census(),ids=new Set<number>([rootPid,...tracked.keys()]);
    for(const event of events)for(const metric of event.metrics??[])ids.add(metric.pid);
    let previous=0;while(previous!==ids.size){previous=ids.size;for(const row of rows)if(ids.has(row.ParentProcessId))ids.add(row.ProcessId);}
    const own=rows.filter(row=>ids.has(row.ProcessId));for(const row of own)if(!tracked.has(row.ProcessId))tracked.set(row.ProcessId,row);
    return own.filter(row=>tracked.get(row.ProcessId)?.Started===row.Started);
  };
  try{
    const deadline=Date.now()+75000;
    while(!prepared){if(failed||exitCode!==undefined)throw Error(mode+': '+(failed||'exited before preparation '+exitCode));if(Date.now()>deadline)throw Error(mode+' preparation timeout');await pause(100);}
    const before=await sample();assert.ok(before.some(item=>item.ProcessId===rootPid));assert.ok(before.length>=3,'must observe actual renderer/GPU/helper processes');
    writeFileSync(command,JSON.stringify({action:'quit'}));
    const quitStart=performance.now();let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([exited,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error(mode+' true exit timed out')),15000);})]);}finally{clearTimeout(timer);}
    const exitMs=Math.round(performance.now()-quitStart);
    assert.equal(exitCode,0,mode+' must end normally, not by forced termination: '+failed+' '+stderr);
    assert.ok(events.some(event=>event.event==='will-quit'),mode+' must reach real Electron will-quit');
    const residues=await sample();assert.equal(residues.length,0,mode+' child processes remain: '+JSON.stringify(residues));
    await pause(5000);
    const later=await sample();assert.equal(later.length,0,mode+' delayed process residue: '+JSON.stringify(later));
    await exclusiveRead([...originals.keys()]);
    for(const [file,before] of originals)assert.equal(await digest(file),before,mode+' source SHA256 changed: '+file);
    const files=profileFiles(profile);
    const final=JSON.parse(readFileSync(path.join(profile,'exit-final.json'),'utf8'));
    for(const file of files){
      if(file.name.endsWith('exit-fixtures.json'))continue;
      const absolute=path.resolve(runRoot,file.name);if(file.bytes<=8*1024*1024&&readFileSync(absolute).includes(Buffer.from(privateMarker)))throw Error('Private preview text persisted in profile: '+file.name);
    }
    const result={mode,rootPid,exitMs,observedProcesses:[...tracked.values()].map(row=>({pid:row.ProcessId,parent:row.ParentProcessId,name:row.Name,started:row.Started})),beforeWorkingSetMiB:Math.round(before.reduce((sum,row)=>sum+Number(row.WorkingSetSize),0)/1024/1024),remainingProcesses:later.length,remainingWorkingSetMiB:0,windowsAtWillQuit:final.windows,statsAtWillQuit:final.stats,sourceSha256Verified:true,events,profileFiles:files,stderr};
    results.push(result);writeFileSync(path.join(output,'exit-resources'+suffix+'.json'),JSON.stringify({results,note:'Independent current-source Electron processes; no app.exit or process kill on successful paths. External Windows process identity census plus exclusive read probes. Working-set sum can double-count shared pages; does not measure Windows standby cache. Preferences and Chromium runtime files may remain on disk.'},null,2));
    console.log('PASS '+mode+': normal app exit; '+tracked.size+' observed processes gone at the first post-exit census and after 5 s; source handles unlocked and SHA256 unchanged; memory-only fixture absent from profile');
    return profile;
  }catch(error){
    writeFileSync(path.join(output,'exit-resources-failure.json'),JSON.stringify({mode,error:String(error),events,stderr,tracked:[...tracked.values()]},null,2));
    // Only stop processes belonging to this isolated failed run, with creation
    // time checked to prevent acting on a reused PID or another application.
    const alive=await sample().catch(()=>[]);
    for(const row of [...alive].reverse())try{await exec('powershell.exe',['-NoProfile','-Command',`$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${row.ProcessId}';if($p -and $p.CreationDate.ToUniversalTime().ToString('o') -eq '${row.Started}') {Stop-Process -Id ${row.ProcessId} -Force}`],{windowsHide:true,timeout:10000});}catch{}
    throw error;
  }
}
for(const mode of selected.filter(mode=>mode!=='restart-clean'))await scenario(mode);
// Reuse only the app's saved settings; the previous process's file sessions,
// document models, pixels and pending loads must not reappear after restart.
if(selected.includes('restart-clean')){
  const savedProfile=path.join(runRoot,'multi-cache');
  // A fresh command name is needed when reusing the profile.
  const {unlinkSync}=await import('node:fs');unlinkSync(path.join(savedProfile,'exit-command.json'));
  await scenario('restart-clean',savedProfile);
}
console.log('PASS all exit-resource scenarios and source SHA256; no full application suite executed');
