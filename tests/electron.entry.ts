import { app, BrowserWindow } from "electron";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { TestContext, Suite } from "./context";
import immersive,{pdfImmersive} from "./suites/immersive";
import nonpdfprinting from "./suites/nonpdfprinting";
import printing from "@/modules/pdf/tests/printing";
import core from "./suites/core";
import loading from './suites/previewLoading';
import excelbackground from '@/modules/excel/tests/background';
import sources from './suites/fileSources';
import sourcelifecycle from './suites/sourceLifecycle';
import {installPreviewLoadDriver} from './previewLoadDriver';
import settingslayout from './suites/settingsLayout';
import visual from "./suites/visual";
import bulk from "./suites/bulk";
import zoom from "./suites/zoom";
import word from "@/modules/word/tests/e2e";
import wordnav from '@/modules/word/tests/navigation';
import exceledit from '@/modules/excel/tests/editing';
import excelgrid from '@/modules/excel/tests/selectionEditing';
import excelformat from '@/modules/excel/tests/formatEditing';
import exceladvanced from '@/modules/excel/tests/advancedEditing';
import excelfind from '@/modules/excel/tests/findEditing';
import excelsheets from '@/modules/excel/tests/sheetEditing';
import exceltable from '@/modules/excel/tests/tableEditing';
import excel from "@/modules/excel/tests/e2e";
import ppt from "@/modules/ppt/tests/e2e";
import pdf from "@/modules/pdf/tests/e2e";
import pdfthumbs from '@/modules/pdf/tests/thumbnails';
import pdfoutline from '@/modules/pdf/tests/outlineLayout';
import pdfdest from '@/modules/pdf/tests/destinations';
import pdfsources from '@/modules/pdf/tests/sources';
import pdflinks from '@/modules/pdf/tests/links';
import texttools from '@/modules/text/tests/readingTools';
import imagetools from '@/modules/image/tests/tools';
import text from "@/modules/text/tests/e2e";
import textsearch from '@/modules/text/tests/sourceSearch';
import syntax from '@/modules/text/tests/syntax';
import appearance from '@/modules/text/tests/appearance';
import appearancelayout from '@/modules/text/tests/appearanceLayout';
import image from "@/modules/image/tests/e2e";
import bench from "@/modules/pdf/tests/bench";
import pdfperf from "@/modules/pdf/tests/performance";
import pdfenhancements from '@/modules/pdf/tests/enhancements';
import pdfspread from '@/modules/pdf/tests/spread';
import pdfchain from '@/modules/pdf/tests/chain';
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
if(requested==='all'||requested.split(',').includes('loading'))installPreviewLoadDriver();
const program =
  require("../electron-dist/main.cjs") as typeof import("../electron/main");
const results: string[] = [];
const suites: Record<string, Suite> = {
  core,
  loading,
  excelbackground,
  sources,
  sourcelifecycle,
  settingslayout,
  updates,
  visual,
  bulk,
  immersive,
  printing,
  nonpdfprinting,
  zoom,
  word,
  wordnav,
  excel,
  exceledit,
  excelgrid,
  excelformat,
  exceladvanced,
  excelfind,
  excelsheets,
  exceltable,
  ppt,
  pdf,
  pdfthumbs,
  pdfoutline,
  pdfdest,
  pdfsources,
  pdflinks,
  pdfimmersive:pdfImmersive,
  texttools,
  imagetools,
  text,
  textsearch,
  syntax,
  appearance,
  appearancelayout,
  image,
  bench,
  pdfperf,
  pdfchain,
  pdfenhancements,
  pdfspread,
};
const selected =
  requested === "all"
    ? Object.keys(suites).filter((n) => n !== "bench" && n !== "pdfperf" && n !== "pdfimmersive" && n !== "excelgrid" && n !== "excelformat" && n !== "exceladvanced" && n !== "excelfind" && n !== "excelsheets" && n !== "exceltable" && n !== "textsearch" && n !== "wordnav")
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
          openHomeAction: name === 'core' ? 'ask' : 'keep',
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
