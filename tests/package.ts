import { spawn } from "node:child_process";
import { resolve,dirname } from "node:path";
import { writeFileSync, mkdirSync,existsSync,readFileSync } from "node:fs";
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
const args=process.argv.slice(2),skipPrint=args.includes('--skip-print'),checkUpdates=args.includes('--updates');
const exe = resolve(args.find(arg=>!arg.startsWith('--')) || "outputs/release/win-unpacked/magic file box.exe");
const profile = resolve("work/test-profiles/package-" + process.pid);
mkdirSync(profile, { recursive: true });
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
