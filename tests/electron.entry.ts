import { app, BrowserWindow } from "electron";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { TestContext, Suite } from "./context";
import immersive from "./suites/immersive";
import nonpdfprinting from "./suites/nonpdfprinting";
import printing from "../src/modules/pdf/tests/printing";
import core from "./suites/core";
import startup from './suites/startup';
import visual from "./suites/visual";
import bulk from "./suites/bulk";
import zoom from "./suites/zoom";
import word from "../src/modules/word/tests/e2e";
import exceledit from '../src/modules/excel/tests/editing';
import excelgrid from '../src/modules/excel/tests/selectionEditing';
import excelformat from '../src/modules/excel/tests/formatEditing';
import exceladvanced from '../src/modules/excel/tests/advancedEditing';
import excelfind from '../src/modules/excel/tests/findEditing';
import excel from "../src/modules/excel/tests/e2e";
import ppt from "../src/modules/ppt/tests/e2e";
import pdf from "../src/modules/pdf/tests/e2e";
import text from "../src/modules/text/tests/e2e";
import syntax from '../src/modules/text/tests/syntax';
import appearance from '../src/modules/text/tests/appearance';
import image from "../src/modules/image/tests/e2e";
import bench from "../src/modules/pdf/tests/bench";
import pdfperf from "../src/modules/pdf/tests/performance";
import pdfenhancements from '../src/modules/pdf/tests/enhancements';
import pdfspread from '../src/modules/pdf/tests/spread';
import pdfchain from '../src/modules/pdf/tests/chain';
import updates from './suites/updates';
import {installUpdateTestDriver} from './updateDriver';
const profile = path.resolve("work/test-profiles/" + process.pid);
mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
app.on("browser-window-created", (_event, win) => {
  // Test windows must keep processing frame-based UI checks while chat covers them.
  win.webContents.setBackgroundThrottling(false);
  win.webContents.on("preload-error", (_e, p, error) =>
    console.error("PRELOAD", p, error),
  );
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") console.error("RENDER", event.message);
  });
});
const requested = process.argv[process.argv.indexOf("--suite") + 1] || "all";
if(requested==='all'||requested.split(',').includes('updates'))installUpdateTestDriver();
const program =
  require("../electron-dist/main.cjs") as typeof import("../electron/main");
const results: string[] = [];
const suites: Record<string, Suite> = {
  startup,
  core,
  updates,
  visual,
  bulk,
  immersive,
  printing,
  nonpdfprinting,
  zoom,
  word,
  excel,
  exceledit,
  excelgrid,
  excelformat,
  exceladvanced,
  excelfind,
  ppt,
  pdf,
  text,
  syntax,
  appearance,
  image,
  bench,
  pdfperf,
  pdfchain,
  pdfenhancements,
  pdfspread,
};
const selected =
  requested === "all"
    ? Object.keys(suites).filter((n) => n !== "bench" && n !== "pdfperf" && n !== "excelgrid" && n !== "excelformat" && n !== "exceladvanced" && n !== "excelfind")
    : requested.split(",");
const output = path.resolve("outputs/verification");
const fixtureRoot = path.resolve("work/fixtures");
const digest = (name: string) =>
  createHash("sha256")
    .update(readFileSync(path.join(fixtureRoot, name)))
    .digest("hex");
const originals = new Map(
  readdirSync(fixtureRoot).map((name) => [name, digest(name)]),
);
mkdirSync(output, { recursive: true });
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const pass = (name: string) => {
  results.push("PASS " + name);
  console.log("PASS " + name);
};
const evaluate = <T = unknown>(
  win: BrowserWindow,
  expression: string,
): Promise<T> => win.webContents.executeJavaScript(expression);
const check = async (win: BrowserWindow, name: string, expression: string) => {
  for (let i = 0; i < 160; i++) {
    if (await evaluate(win, expression)) {
      pass(name);
      return;
    }
    await pause(100);
  }
  throw new Error(
    name + "\n" + (await evaluate(win, "document.body.innerText")),
  );
};
const timeout = setTimeout(() => {
  console.error("测试超时");
  app.exit(1);
}, 240000);
program.ready
  .then(async (home) => {
    if (!home) throw new Error("Test instance was not created");
    const context: TestContext = {
      home,
      program,
      pass,
      pause,
      evaluate,
      check,
      fixture: (name) => path.resolve("work/fixtures", name),
      close: program.closePreview,
      async open(name) {
        const win = await program.openPath(path.resolve("work/fixtures", name));
        await check(
          win,
          "loaded " + name,
          "!!document.querySelector('.preview-tab') && !document.querySelector('.loading')",
        );
        return win;
      },
      async snapshot(win, name) {
        win.showInactive();
        await pause(550);
        writeFileSync(
          path.join(output, name + ".png"),
          (await win.webContents.capturePage()).toPNG(),
        );
      },
      async click(win, selector, text) {
        await evaluate(
          win,
          `(()=>{const el=${text ? `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(el=>el.textContent.trim()===${JSON.stringify(text)})` : `document.querySelector(${JSON.stringify(selector)})`};if(!el)throw Error('Missing button');el.click()})()`,
        );
        await pause(100);
      },
      async wheel(win, selector, delta) {
        await evaluate(
          win,
          `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new WheelEvent('wheel',{deltaY:${delta},bubbles:true,composed:true,cancelable:true}))`,
        );
        await pause(280);
      },
    };
    try {
      await check(home, "home ready", "!!document.querySelector('.dropzone')");
      for (const name of selected) {
        console.log("SUITE " + name);
        program.updateSettings({
          theme: "light",
          closeAction: "ask",
          multiFileMode: "windows",
        });
        await suites[name](context);
        for (const win of BrowserWindow.getAllWindows())
          if (win.id !== home.id) program.closePreview(win);
      }
      for (const [name, hash] of originals)
        if (digest(name) !== hash) throw Error("Source file changed: " + name);
      pass("all original fixture files unchanged (SHA256)");
      writeFileSync(
        path.join(output, "tests-" + selected.join("-") + ".txt"),
        results.join("\n"),
      );
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) {
      console.error(error);
      writeFileSync(
        path.join(output, "failure.txt"),
        results.join("\n") + "\n" + String(error),
      );
      clearTimeout(timeout);
      app.exit(1);
    }
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
