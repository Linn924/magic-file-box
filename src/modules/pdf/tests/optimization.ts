import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Exercise the real cache state machine with deterministic loading tasks.
// No PDF parsing is mocked in the Electron suites; this isolates ownership races.
mkdirSync(".test-build", { recursive: true });
const outfile = path.resolve(".test-build/pdf-optimization.mjs");
await build({
  stdin: { resolveDir: path.resolve("src/modules/pdf/core"), loader: "ts", contents: `
    import assert from 'node:assert/strict';
    import { acquireCachedPdf, releaseDoc, docCacheStats } from './docCache';
    import { pdfWork } from './workQueue';
    import { PageIndex } from './pageIndex';
    import { control } from 'pdfjs-dist';
    globalThis.window={localPreview:{pdfResources:async()=>({pixels:24000000,bytes:384*1024*1024,documents:8}),onPdfResources:()=>()=>{},releasePdfResources:()=>{}}};
    const bytes = new Uint8Array(17);
    control.defer = true;
    const first = acquireCachedPdf('same', bytes);
    const second = acquireCachedPdf('same', bytes);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(control.loads.length, 1, 'in-flight parse must be shared');
    control.loads[0].resolve();
    const a = await first, b = await second;
    assert.equal(a.doc, b.doc);
    const hit = await acquireCachedPdf('same', bytes);
    assert.deepEqual(docCacheStats(), {count:1, bytes:17}, 'hits must not recharge');
    releaseDoc('same');
    assert.equal(control.loads[0].destroyed, 0, 'active lease protects retired doc');
    a.release(); a.release(); b.release();
    assert.equal(control.loads[0].destroyed, 0, 'release is idempotent');
    hit.release();
    assert.equal(control.loads[0].destroyed, 1);
    assert.deepEqual(docCacheStats(), {count:0, bytes:0});

    control.defer = false;
    const leases = [];
    for (let i=0;i<10;i++) leases.push(await acquireCachedPdf('p'+i, bytes));
    assert.equal(control.workerStarts,2,'ten documents share one new worker after the first phase');
    assert.equal(docCacheStats().count, 10, 'active readers can exceed idle budget');
    assert.equal(control.loads.slice(1).some(x=>x.destroyed), false);
    leases[0].release(); leases[1].release();
    assert.equal(docCacheStats().count, 8, 'idle documents evicted first');
    for (let i=0;i<10;i++) { releaseDoc('p'+i); leases[i].release(); }
    const large = {byteLength:200*1024*1024, slice:()=>bytes};
    const l1 = await acquireCachedPdf('large1', large);
    const l2 = await acquireCachedPdf('large2', large);
    assert.equal(docCacheStats().bytes,400*1024*1024);
    l1.release();
    assert.deepEqual(docCacheStats(),{count:1,bytes:200*1024*1024});
    releaseDoc('large2'); l2.release();

    control.defer = true;
    const old = acquireCachedPdf('locked', bytes).catch(e=>e);
    await new Promise(resolve=>setImmediate(resolve));
    const oldTask = control.loads.at(-1);
    const unlocked = acquireCachedPdf('locked', bytes, {password:'secret'});
    await new Promise(resolve=>setImmediate(resolve));
    const newTask = control.loads.at(-1);
    assert.notEqual(oldTask, newTask, 'unlock must replace passwordless pending load');
    assert.equal(newTask.options.password,'secret');
    oldTask.reject(new Error('PasswordException'));
    newTask.resolve();
    await old;
    const unlockedLease = await unlocked;
    assert.equal(docCacheStats().count,1, 'old failure must not remove replacement');
    releaseDoc('locked'); unlockedLease.release();
    assert.deepEqual(docCacheStats(),{count:0,bytes:0});
    control.defer = false;
    const retry = await acquireCachedPdf('locked',bytes,{password:'secret'});
    releaseDoc('locked'); retry.release();
    console.log('PASS PDF cache: single flight, accounting, leases, eviction, password replacement');

    control.defer = true;
    const oneController = new AbortController();
    const cancelledLoad = acquireCachedPdf('cancel-shared', bytes, {}, oneController.signal);
    const survivingLoad = acquireCachedPdf('cancel-shared', bytes);
    await new Promise(resolve=>setImmediate(resolve));
    const sharedTask = control.loads.at(-1);
    const cancellation = assert.rejects(cancelledLoad, {name:'AbortError'});
    oneController.abort(); await cancellation;
    assert.equal(sharedTask.destroyed,0,'one cancellation must preserve another PDF reader');
    sharedTask.resolve(); const survivingLease = await survivingLoad;
    releaseDoc('cancel-shared'); survivingLease.release();
    const lastController = new AbortController();
    const lastLoad = acquireCachedPdf('cancel-last', bytes, {}, lastController.signal);
    await new Promise(resolve=>setImmediate(resolve));
    const lastTask = control.loads.at(-1), lastCancellation=assert.rejects(lastLoad,{name:'AbortError'});
    lastController.abort(); await lastCancellation;
    assert.equal(lastTask.destroyed,1,'last cancellation must destroy the pending PDF parse');
    assert.deepEqual(docCacheStats(),{count:0,bytes:0});
    control.defer=false;
    console.log('PASS PDF pending-load cancellation preserves shared readers and releases the last reader');

    const events = [];
    let unblockBackground, unblockForeground;
    const bg = pdfWork(4, async()=>{events.push('background');await new Promise(r=>unblockBackground=r)});
    const queuedBackground = pdfWork(4, async()=>{events.push('next-background')});
    const fg = pdfWork(0, async()=>{events.push('foreground');await new Promise(r=>unblockForeground=r)});
    const nextFg = pdfWork(0, async()=>{events.push('next-foreground')});
    assert.deepEqual(events,['background','foreground'],'background must reserve reading lane');
    unblockForeground(); await fg; await nextFg;
    assert.deepEqual(events,['background','foreground','next-foreground']);
    unblockBackground(); await bg; await queuedBackground;
    assert.equal(events.at(-1),'next-background');
    console.log('PASS PDF scheduling: bounded background work and foreground priority');
    let finish;
    const running=pdfWork(4,()=>new Promise(r=>finish=r));
    const controller=new AbortController();let executed=false;
    const cancelled=pdfWork(4,async()=>{executed=true},controller.signal).catch(e=>e);
    controller.abort();assert.equal((await cancelled).name,'AbortError');
    finish();await running;assert.equal(executed,false,'cancelled queued task must not execute');
    const values=Array.from({length:1000},(_,i)=>100+i%7);
    const positions=new PageIndex(values);
    for(let i=0;i<100;i++){const at=(i*37)%1000;values[at]+=13;positions.set(at,values[at]);}
    let sum=0;
    for(let i=0;i<values.length;i++){assert.equal(positions.prefix(i),sum);assert.equal(positions.indexAt(sum+1),i);sum+=values[i];}
    assert.equal(positions.prefix(values.length),sum);
    console.log('PASS PDF cancellation and incremental mixed-size page positions');
  ` },
  outfile, bundle: true, platform: "node", format: "esm", target: "node22", external:['vue'],
  plugins: [{ name: "deterministic-pdf-loader", setup(plugin) {
    plugin.onResolve({ filter: /^pdfjs-dist$/ }, () => ({ path: "loader", namespace: "fake-pdf" }));
    plugin.onResolve({ filter: /pdf\.worker\.min\.mjs\?url$/ }, () => ({ path: "worker", namespace: "fake-pdf" }));
    plugin.onLoad({ filter: /.*/, namespace: "fake-pdf" }, args => ({ loader: "js", contents:
      args.path === "worker" ? 'export default "mock-worker";' : `
        export const GlobalWorkerOptions = {};
        export class PDFDataRangeTransport {}
        export const control = {defer:false,loads:[],workerStarts:0,workerStops:0};
        export class PDFWorker { constructor(){control.workerStarts++} destroy(){control.workerStops++} }
        export function getDocument(options) {
          let resolve, reject;
          const promise = new Promise((a,b)=>{resolve=a;reject=b});
          const task = { options, promise, destroyed:0,
            resolve:()=>resolve({numPages:1}), reject,
            destroy:async()=>{task.destroyed++} };
          control.loads.push(task);
          if (!control.defer) task.resolve();
          return task;
        }
      ` }));
  } }],
});
await import(pathToFileURL(outfile).href);
