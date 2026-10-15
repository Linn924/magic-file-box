import { app, dialog } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";
const profile = path.resolve("work/test-profiles/quit-" + process.pid);
mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
const program =
  require("../electron-dist/main.cjs") as typeof import("../electron/main");
program.ready.then(async (home) => {
  if (!home) app.exit(1);
  const configured=process.argv.includes('--configured-quit');let prompts=0;
  program.updateSettings({ closeAction: configured?'quit':"ask", openHomeAction:'keep' });
  const preview=await program.openPath(path.resolve('work/fixtures/text.txt'));
  dialog.showMessageBox = (async () => {prompts++;return {response:0,checkboxChecked:true};}) as typeof dialog.showMessageBox;
  app.once('will-quit',()=>{if(!home!.isDestroyed()||!preview.isDestroyed()||prompts!==(configured?0:1)){console.error('Explicit quit did not close every window or used the wrong preference');app.exit(1);return;}console.log(configured?'PASS configured home quit closes application and previews':'PASS chosen quit closes application and previews');});
  home!.close();
  setTimeout(() => {
    console.error("Application did not exit");
    app.exit(1);
  }, 5000);
});
