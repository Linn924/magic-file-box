import { spawn } from "node:child_process";
import { resolve,dirname } from "node:path";
import { writeFileSync, mkdirSync,existsSync,readFileSync } from "node:fs";
import {createNavigationFixture} from '../src/modules/word/tests/navigation';
type Target = {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
};
type Command = (
  method: string,
  params?: Record<string, unknown>,
) => Promise<any>;
const args=process.argv.slice(2),skipPrint=args.includes('--skip-print'),checkUpdates=args.includes('--updates'),checkTextSearch=args.includes('--text-search'),checkWordNavigation=args.includes('--word-navigation');
const exe = resolve(args.find(arg=>!arg.startsWith('--')) || "outputs/release/win-unpacked/magic file box.exe");
const profile = resolve("work/test-profiles/package-" + process.pid);
mkdirSync(profile, { recursive: true });
writeFileSync(resolve(profile, 'preferences.json'), JSON.stringify({openHomeAction:'keep'}));
mkdirSync("outputs/verification", { recursive: true });
const child = spawn(
  exe,
  [
    "--remote-debugging-port=19387",
    "--user-data-dir=" + profile,
    resolve("work/fixtures/document.pdf"),
  ],
  { windowsHide: true, stdio: "ignore" },
);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sockets: WebSocket[] = [];
async function connect(url: string): Promise<Command> {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  const pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  let id = 0;
  socket.onmessage = (event) => {
    const m = JSON.parse(String(event.data));
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
  };
  socket.onclose = () => {
    for (const p of pending.values()) p.reject(Error("Connection closed"));
    pending.clear();
  };
  sockets.push(socket);
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id;
      pending.set(next, { resolve, reject });
      socket.send(JSON.stringify({ id: next, method, params }));
    });
}
const targets = async (): Promise<Target[]> =>
  (await (await fetch("http://127.0.0.1:19387/json")).json()) as Target[];
async function waitFor<T>(
  check: () => Promise<T | undefined | false>,
  label: string,
): Promise<T> {
  for (let i = 0; i < 150; i++) {
    try {
      const result = await check();
      if (result) return result;
    } catch {}
    await pause(200);
  }
  throw Error(label);
}
async function evaluate(command: Command, expression: string) {
  const r = await command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const results: string[] = [];
try {
  const first = await waitFor(
    async () => (await targets()).find((t) => t.url.includes("?preview=1")),
    "File argument was not opened",
  );
  const view = await connect(first.webSocketDebuggerUrl);
  await waitFor(
    () =>
      evaluate(
        view,
        "document.querySelector('canvas')?.width>0&&!document.querySelector('.loading')",
      ),
    "Packaged PDF render",
  );
  results.push("PASS command-line PDF file opened in packaged app");
  // Keep smoke tests offline and avoid native close prompts in this test profile.
  await evaluate(view,"window.localPreview.setSettings({checkUpdatesOnStart:false,closeAction:'quit'})");
  if(checkUpdates){
    const state=await evaluate(view,"window.localPreview.getUpdateState()"),version=JSON.parse(readFileSync('package.json','utf8')).version;
    if(state.currentVersion!==version)throw Error('Packaged update version mismatch');
    const installed=existsSync(resolve(dirname(exe),'Uninstall magic file box.exe'));
    if(installed?state.phase==='unsupported':state.phase!=='unsupported')throw Error('Packaged updater installation detection mismatch');
    await evaluate(view,"document.querySelector('.settings-button').click();true");
    await waitFor(()=>evaluate(view,"!!document.querySelector('#check-updates')&&document.querySelector('.settings-panel .update-center').textContent.includes("+JSON.stringify(version)+")"),'Packaged update settings');
    await waitFor(()=>evaluate(view,"document.querySelectorAll('.settings-nav button').length===5&&getComputedStyle(document.querySelector('.settings-panel')).overflowY==='hidden'"),'Packaged grouped settings layout');
    for (const group of ['appearance','windows','printing','updates','exclusive']) {
      await evaluate(view, `document.querySelector('[aria-controls="settings-${group}"]').click();true`);
      await waitFor(()=>evaluate(view, `(() => {const body=document.querySelector('.settings-content'),section=document.querySelector('#settings-${group}');return Math.abs(section.getBoundingClientRect().top-body.getBoundingClientRect().top-parseFloat(getComputedStyle(body).paddingTop))<2&&document.querySelector('.settings-nav [aria-current]')?.getAttribute('aria-controls')==='settings-${group}'})()`),'Packaged settings group '+group);
    }
    results.push('PASS packaged settings keep fixed chrome and navigate to all five group starts');
    await evaluate(view,"document.querySelector('[aria-label=关闭设置]').click();true");
    results.push(installed?'PASS installed updater loads, recognizes NSIS installation and exposes correct version/settings':'PASS unpacked updater exposes correct version and avoids automatic installation');
  }
  if(!skipPrint){
  await evaluate(view,"document.querySelector('.pdf-print-button').click()");
  const panelTarget=await waitFor(async()=>(await targets()).find(t=>t.url.includes("print-panel=1")),"Packaged independent print window");
  const panel=await connect(panelTarget.webSocketDebuggerUrl);
  await waitFor(()=>evaluate(panel,"!!document.querySelector('.print-file-card .toggle-print-options')"),"Packaged print row");
  await evaluate(panel,"document.querySelector('.print-file-card .toggle-print-options').click()");
  await waitFor(()=>evaluate(panel,"[...document.querySelector('[aria-label=打印纸张]').options].some(option=>option.value==='A5')"),"Packaged PDF print options");
  await evaluate(panel,"setTimeout(()=>window.localPreview.close(),100);true");
  await pause(150);
  }
  await evaluate(view,"window.localPreview.setFullscreen(true)");
  await waitFor(()=>evaluate(view,"document.documentElement.classList.contains('immersive')"),'Packaged fullscreen');
  await evaluate(view,"window.localPreview.setFullscreen(false)");
  await waitFor(()=>evaluate(view,"!document.documentElement.classList.contains('immersive')"),'Packaged exit fullscreen');
  results.push(skipPrint?'PASS packaged fullscreen (printer UI not opened)':'PASS packaged fullscreen and PDF A5 print panel (no print job submitted)');
  const before = new Set((await targets()).map((t) => t.id));
  const second = spawn(
    exe,
    ["--user-data-dir=" + profile, resolve("work/fixtures/presentation.pptx")],
    { windowsHide: true, stdio: "ignore" },
  );
  const incoming = await waitFor(
    async () =>
      (await targets()).find(
        (t) => !before.has(t.id) && t.url.includes("?preview=1"),
      ),
    "Second-instance file delivery",
  );
  const ppt = await connect(incoming.webSocketDebuggerUrl);
  await waitFor(
    () =>
      evaluate(
        ppt,
        "document.querySelector('.slide-host')?.shadowRoot?.textContent.length>150&&!document.querySelector('.loading')",
      ),
    "Packaged PPT render",
  );
  results.push("PASS second-instance PPTX delivered to existing application");
  if (checkTextSearch) {
    const marker = 'package-json-search-target', file = resolve('work/fixtures/package-json-search-v1.json');
    if (!existsSync(file)) writeFileSync(file, JSON.stringify(Array.from({length: 3600}, (_, index) =>
      index === 3200 ? marker + ' / ' + marker : index === 3500 ? marker : 'row ' + index)));
    const original = readFileSync(file), known = new Set((await targets()).map(target => target.id));
    const jsonChild = spawn(exe, ['--user-data-dir=' + profile, file], {windowsHide: true, stdio: 'ignore'});
    try {
      const target = await waitFor(async () => (await targets()).find(item => !known.has(item.id) && item.url.includes('?preview=1')), 'Packaged JSON file delivery');
      const json = await connect(target.webSocketDebuggerUrl);
      await waitFor(() => evaluate(json, "!!document.querySelector('.text-search-toggle')&&!document.querySelector('.loading')"), 'Packaged JSON ready');
      await evaluate(json, "document.querySelector('.text-search-toggle').click();true");
      await waitFor(() => evaluate(json, "!!document.querySelector('.text-search-input')"), 'Packaged JSON search input');
      await evaluate(json, `(() => {const input=document.querySelector('.text-search-input');input.value=${JSON.stringify(marker)};input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
      const visible = `(() => {const root=document.querySelector('.text-scroll'),bounds=root.getBoundingClientRect();return root.scrollTop>0&&document.querySelectorAll('.text-line').length<100&&[...root.querySelectorAll('.text-current-hit')].some(hit=>[...hit.getClientRects()].some(r=>r.top>=bounds.top&&r.bottom<=bounds.bottom&&r.width>0))})()`;
      await waitFor(() => evaluate(json, "document.querySelector('.text-search-count').textContent.includes('1 / 3')&&" + visible), 'Packaged JSON first match is highlighted and visible');
      for (const index of [2, 3]) {
        await evaluate(json, "document.querySelector('.text-find-next').click();true");
        await waitFor(() => evaluate(json, `document.querySelector('.text-search-count').textContent.includes('${index} / 3')&&` + visible), 'Packaged JSON match ' + index);
      }
      await evaluate(json, "document.querySelector('.search-close').click();true");
      await waitFor(() => evaluate(json, "!document.querySelector('.text-hit,.text-current-hit')"), 'Packaged JSON search cleanup');
      if (!readFileSync(file).equals(original)) throw Error('Packaged JSON search modified its source');
      await evaluate(json, "setTimeout(()=>window.localPreview.close(),100);true");
      results.push('PASS packaged JSON search reveals distant virtual matches, counts same-line occurrences, navigates and clears highlights without changing the source');
    } finally { if (jsonChild.exitCode === null) jsonChild.kill(); }
  }
  if (checkWordNavigation) {
    const name='word-navigation-v1.docx',file=resolve('work/fixtures',name);
    await createNavigationFixture({fixture:name=>resolve('work/fixtures',name)},name);
    const original=readFileSync(file),known=new Set((await targets()).map(target=>target.id));
    const wordChild=spawn(exe,['--user-data-dir='+profile,file],{windowsHide:true,stdio:'ignore'});
    try {
      const target=await waitFor(async()=>(await targets()).find(item=>!known.has(item.id)&&item.url.includes('?preview=1')),'Packaged DOCX file delivery');
      const word=await connect(target.webSocketDebuggerUrl);
      await waitFor(()=>evaluate(word,"!!document.querySelector('.word-search-toggle:not(:disabled)')&&!document.querySelector('.loading')"),'Packaged DOCX ready');
      await evaluate(word,"document.querySelector('.word-outline-toggle').click();true");
      await waitFor(()=>evaluate(word,"document.querySelectorAll('.word-outline button').length===5"),'Packaged DOCX heading directory');
      await evaluate(word,"document.querySelector('.word-search-toggle').click();true");
      await waitFor(()=>evaluate(word,"!!document.querySelector('.word-search-input')"),'Packaged DOCX search input');
      await evaluate(word,"(()=>{const input=document.querySelector('.word-search-input');input.value='跨格式搜索';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
      const visible="(()=>{const root=document.querySelector('.document-scroll'),bounds=root.getBoundingClientRect();return [...document.querySelector('.word-host').shadowRoot.querySelectorAll('.word-current-hit')].some(hit=>[...hit.getClientRects()].some(r=>r.top>=bounds.top&&r.bottom<=bounds.bottom&&r.left>=bounds.left&&r.right<=bounds.right))})()";
      await waitFor(()=>evaluate(word,"document.querySelector('.word-search-count').textContent.includes('1 / 3')&&document.querySelector('.word-host').shadowRoot.querySelectorAll('.word-current-hit').length===3&&"+visible),'Packaged DOCX search across formatted runs');
      for(const index of [2,3]) {
        await evaluate(word,"document.querySelector('.word-find-next').click();true");
        await waitFor(()=>evaluate(word,`document.querySelector('.word-search-count').textContent.includes('${index} / 3')&&`+visible),'Packaged DOCX search result '+index);
      }
      await evaluate(word,"document.querySelector('.search-close').click();true");
      await waitFor(()=>evaluate(word,"!document.querySelector('.word-host').shadowRoot.querySelector('.word-search-hit')"),'Packaged DOCX search cleanup');
      await evaluate(word,"document.querySelector('[data-word-outline-index=\"3\"]').click();true");
      await waitFor(()=>evaluate(word,"document.querySelector('[data-word-outline-index=\"3\"]').hasAttribute('aria-current')&&document.querySelector('.document-scroll').scrollTop>500"),'Packaged DOCX duplicate-title directory navigation');
      if(!readFileSync(file).equals(original))throw Error('Packaged DOCX navigation modified its source');
      await evaluate(word,"setTimeout(()=>window.localPreview.close(),100);true");
      results.push('PASS packaged DOCX searches across formatted runs, navigates table/distant results, clears marks and locates duplicate headings without changing the source');
    } finally {if(wordChild.exitCode===null)wordChild.kill();}
  }
  await evaluate(view, "setTimeout(()=>window.localPreview.close(),100);true");
  await evaluate(ppt, "setTimeout(()=>window.localPreview.close(),100);true");
  await pause(250);
  const home = (await targets()).find((t) => t.type === "page");
  if (home) {
    const command = await connect(home.webSocketDebuggerUrl);
    await evaluate(
      command,
      "setTimeout(()=>window.localPreview.close(),100);true",
    );
  }
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    pause(1500),
  ]);
  if (second.exitCode === null) second.kill();
  writeFileSync("outputs/verification/package-v3.txt", results.join("\n"));
  console.log(results.join("\n"));
} finally {
  for (const socket of sockets) socket.close();
  if (child.exitCode === null) child.kill();
}
