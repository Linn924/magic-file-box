import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const git=(cwd:string,args:string[])=>execFileSync('git',['-c','http.sslBackend=openssl',...args],{cwd,encoding:'utf8',timeout:60000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}}).trim();
export function verifyMind(root:string){
  const entry=readFileSync(path.join(root,'src/edition.ts'),'utf8'),app=readFileSync(path.join(root,'src/App.vue'),'utf8'),intro=path.join(root,'src/components/HomeIntro.vue');
  if(!/export const edition\s*=\s*['"]mind['"]/.test(entry)||!entry.includes('HomeIntro')||!app.includes(':is="homeIntro"')||!existsSync(intro)||!readFileSync(intro,'utf8').includes('小乖专属软件'))throw Error('mind 专属入口或首页特效缺失，禁止推送。');
}
/** Merge published main in a detached worktree; preserve the user's live checkout and edits. */
export function syncMind(cwd=process.cwd()){
  const root=git(cwd,['rev-parse','--show-toplevel']);
  if(git(root,['branch','--show-current'])!=='main')throw Error('请在 main 完成开发和推送后运行同步。');
  git(root,['fetch','origin','main','mind']);
  const main=git(root,['rev-parse','main']),published=git(root,['rev-parse','origin/main']),prior=git(root,['rev-parse','mind']);
  if(main!==published)throw Error('main 与 origin/main 不一致，请先完成主分支推送。');
  if(prior!==git(root,['rev-parse','origin/mind']))throw Error('本地 mind 与远端不一致，请先核对，避免覆盖未同步工作。');
  if(git(root,['worktree','list','--porcelain']).split('\n').some(line=>line==='branch refs/heads/mind'))throw Error('mind 正在其他工作区使用，请先完成该工作区的操作。');
  mkdirSync(path.join(root,'work'),{recursive:true});const folder=mkdtempSync(path.join(root,'work/mind-sync-'));let pushed=false;
  try{
    git(root,['worktree','add','--detach',folder,prior]);
    git(folder,['merge','--no-edit',main]);verifyMind(folder);
    const next=git(folder,['rev-parse','HEAD']);
    git(folder,['push','origin','HEAD:refs/heads/mind']);pushed=true;
    git(root,['update-ref','refs/heads/mind',next,prior]);
    // This is a Git-owned temporary checkout; no user files or dependency links are added.
    const expected=path.join(root,'work')+path.sep;if(!path.resolve(folder).startsWith(expected))throw Error('临时工作区路径越界。');
    git(root,['worktree','remove',folder]);
    return {main,mind:next};
  }catch(error){throw Error(`${pushed?'远端已同步，请核对本地 mind 引用。':'同步未完成，未强制覆盖任何分支。'} 临时工作区保留：${folder}\n${error instanceof Error?error.message:String(error)}`);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{const result=syncMind();console.log(`main ${result.main.slice(0,7)} 已合并到 mind ${result.mind.slice(0,7)}，专属入口保留。`);}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}}
