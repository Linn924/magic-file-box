import assert from 'node:assert/strict';
import {PreviewResidency,type ResidentPreview} from '@/services/previewResidency';
const released:string[]=[];
function entry(name:string,cost=40,active=false,loading=false){
  const state={cost,active,loading};
  const item:ResidentPreview={active:()=>state.active,loading:()=>state.loading,cost:()=>state.cost,async evict(){released.push(name);state.cost=0;return true;}};
  return {state,item};
}
const pool=new PreviewResidency(100),a=entry('a'),b=entry('b'),c=entry('c',40,true);
pool.add(a.item);pool.add(b.item);pool.add(c.item);pool.touch(a.item);
await pool.trim();assert.deepEqual(released,['b'],'evicts the least recently used completed background preview');
assert.equal(a.state.cost,40);assert.equal(c.state.cost,40);
await pool.trim();assert.equal(released.length,1,'under-budget residents have no time-based eviction');
const loading=entry('loading',300,false,true);pool.add(loading.item);await pool.trim();
assert.deepEqual(released,['b','a']);assert.equal(loading.state.cost,300,'ongoing loads are never interrupted by pressure');assert.equal(c.state.cost,40,'active preview protected even over budget');
pool.remove(loading.item);assert.equal(pool.size,3);
const isolated=new PreviewResidency(1);await isolated.trim();assert.equal(c.state.cost,40,'another renderer manager cannot release this pool');
let pressure=true;
const pressured=new PreviewResidency(1000,()=>pressure),idle=entry('idle'),foreground=entry('foreground',40,true);
pressured.add(idle.item);pressured.add(foreground.item);await pressured.trim();assert.equal(idle.state.cost,0);assert.equal(foreground.state.cost,40);
let finish!:()=>void;const gate=new Promise<void>(resolve=>finish=resolve),pending=entry('pending');
pending.item.evict=async()=>{await gate;if(pending.state.active)return false;pending.state.cost=0;return true;};
pressured.add(pending.item);const trimming=pressured.trim();await Promise.resolve();pending.state.active=true;finish();await trimming;
assert.equal(pending.state.cost,40,'reactivation while waiting for an edit prevents eviction');
pressure=false;pending.state.active=false;await pressured.trim();assert.equal(pending.state.cost,40,'completed editing stays resident without pressure');
console.log('PASS residency budget, LRU, loading/active protection, renderer isolation, edit wait/reactivation and no timed eviction');
