import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {syncMind} from '../scripts/sync-mind';
const git=(cwd:string,...args:string[])=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
mkdirSync('.test-build',{recursive:true});const folder=mkdtempSync(path.resolve('.test-build/mind-sync-')),root=path.join(folder,'repo'),remote=path.join(folder,'remote.git');mkdirSync(root);
try{
  git(folder,'init','--bare',remote);git(root,'init','-b','main');git(root,'config','user.name','Edition test');git(root,'config','user.email','edition@example.invalid');git(root,'remote','add','origin',remote);
  mkdirSync(path.join(root,'src/components'),{recursive:true});writeFileSync(path.join(root,'.gitignore'),'work/\n');writeFileSync(path.join(root,'src/edition.ts'),"export const edition = 'main';\nexport const homeIntro = null;\n");writeFileSync(path.join(root,'src/App.vue'),'<component :is="homeIntro" v-if="homeIntro" />');writeFileSync(path.join(root,'keep.txt'),'kept\n');git(root,'add','.');git(root,'commit','-m','base');
  git(root,'switch','-c','mind');writeFileSync(path.join(root,'src/edition.ts'),"import HomeIntro from './components/HomeIntro.vue';\nexport const edition = 'mind';\nexport const homeIntro = HomeIntro;\n");writeFileSync(path.join(root,'src/components/HomeIntro.vue'),'<p>小乖专属软件</p>');git(root,'add','.');git(root,'commit','-m','mind addon');git(root,'switch','main');git(root,'push','-u','origin','main','mind');
  writeFileSync(path.join(root,'common.txt'),'common development\n');git(root,'add','common.txt');git(root,'commit','-m','main feature');assert.throws(()=>syncMind(root),/先完成主分支推送/);git(root,'push','origin','main');
  writeFileSync(path.join(root,'keep.txt'),'uncommitted user work\n');const result=syncMind(root);assert.equal(git(root,'branch','--show-current'),'main');assert.equal(readFileSync(path.join(root,'keep.txt'),'utf8'),'uncommitted user work\n');assert.equal(git(root,'show','mind:common.txt'),'common development');assert.match(git(root,'show','mind:src/edition.ts'),/edition = 'mind'/);assert.match(git(root,'show','mind:src/components/HomeIntro.vue'),/小乖专属软件/);assert.equal(git(root,'rev-parse','mind'),result.mind);assert.equal(git(root,'rev-parse','origin/mind'),result.mind);assert.equal(syncMind(root).mind,result.mind);
  const before=git(root,'rev-parse','mind');writeFileSync(path.join(root,'src/App.vue'),'<div>removed slot</div>');git(root,'add','src/App.vue');git(root,'commit','-m','incompatible main slot change');git(root,'push','origin','main');assert.throws(()=>syncMind(root),/专属入口或首页特效缺失/);assert.equal(git(root,'rev-parse','mind'),before);assert.equal(git(root,'rev-parse','origin/mind'),before);
  console.log('PASS mind sync merges published main, preserves edition and dirty working files, is repeatable and blocks lost startup hooks');
}finally{assert.ok(folder.startsWith(path.resolve('.test-build')+path.sep));rmSync(folder,{recursive:true,force:true});}
