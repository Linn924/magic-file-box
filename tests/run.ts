import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import electron from "electron";
import {testFormats} from './scope';
const args = process.argv.slice(2);
const formatIndex=args.indexOf('--formats'),formats=formatIndex<0?undefined:(args[formatIndex+1]||'').split(',');
if(formats?.some(value=>!testFormats.includes(value as typeof testFormats[number])))throw Error('未知文件类型。支持：'+testFormats.join(','));
const index = args.indexOf("--suite");
const selected = (index < 0 ? "all" : args[index + 1] || "").split(",");
const names = [
  "core",
  "notices",
  "notificationprefs",
  "headerinfo",
  "exitresources",
  "loading",
  "tablifecycle",
  "excelbackground",
  "sources",
  "sourcelifecycle",
  "settingslayout",
  "updates",
  "word",
  "wordnav",
  "excel",
  "exceledit",
  "excelbasic",
  "excelstructure",
  "excelformula",
  "excelcompat",
  "excelrefs",
  "excelsources",
  "excelgrid",
  "excelformat",
  "exceladvanced",
  "excelfind",
  "excelsheets",
  "exceltable",
  "ppt",
  "pdf",
  "pdfthumbs",
  "pdfoutline",
  "pdfdest",
  "pdfsources",
  "pdflinks",
  "pdfimmersive",
  "texttools",
  "imagetools",
  "text",
  "textsearch",
  "syntax",
  "appearance",
  "appearancelayout",
  "image",
  "zoom",
  "immersive",
  "printing",
  "nonpdfprinting",
  "bulk",
  "bench",
  "pdfperf",
  "pdfchain",
  "pdfenhancements",
  "pdfspread",
  "visual",
];
if (selected.some((s) => s !== "all" && !names.includes(s)))
  throw new Error("未知套件。支持：" + names.join(",") + " 或 all");
const run = (command: string, params: string[], shell = false) => {
  const result = spawnSync(command, params, {
    stdio: "inherit",
    shell,
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status || 1);
};
if (!args.includes("--skip-build"))
  run(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "build"],
    process.platform === "win32",
  );
if(selected.includes('exitresources')){
  run(process.execPath,['--import','tsx','tests/exitResources.ts']);
  selected.splice(selected.indexOf('exitresources'),1);
  if(!selected.length)process.exit(0);
}
if(selected.some(name=>['loading','tablifecycle','all'].includes(name)))run(process.execPath,['--import','tsx','tests/previewResidencyUnit.ts']);
if (selected.some(name => !['pdfoutline','pdfdest','pdfsources','pdflinks','pdfimmersive','texttools','imagetools'].includes(name)))
  run(process.execPath, ["--import", "tsx", "tests/unit.ts"]);
if(selected.includes('pdfdest')||selected.includes('all'))run(process.execPath,['--import','tsx','src/modules/pdf/tests/outlineTitleUnit.ts']);
if(selected.includes('pdfdest')||selected.includes('pdflinks')||selected.includes('pdfenhancements')||selected.includes('all'))run(process.execPath,['--import','tsx','src/modules/pdf/tests/destinationUnit.ts']);
if(selected.includes('texttools')||selected.includes('all'))run(process.execPath,['--import','tsx','src/modules/text/tests/readingToolsUnit.ts']);
if(selected.includes('imagetools')||selected.includes('all'))run(process.execPath,['--import','tsx','src/modules/image/tests/toolsUnit.ts']);
if(selected.includes('sources')||selected.includes('all')){
  run(process.execPath,['--import','tsx','src/modules/text/tests/fileRecordsUnit.ts']);
  run(process.execPath,['--import','tsx','tests/sourceArchiveUnit.ts']);
}
if(selected.includes('word')||selected.includes('wordnav')||selected.includes('all'))run(process.execPath,['--import','tsx','src/modules/word/tests/outlineUnit.ts']);
if(selected.includes('text')||selected.includes('syntax')||selected.includes('all'))run(process.execPath,['--import','tsx','src/modules/text/tests/syntaxUnit.ts']);
if(selected.includes('text')||selected.includes('appearance')||selected.includes('all'))run(process.execPath,['--import','tsx','src/modules/text/tests/appearanceUnit.ts']);
if(selected.includes('updates')||selected.includes('all'))run(process.execPath,['--import','tsx','tests/updateUnit.ts']);
if(selected.includes('pdfspread')||selected.includes('pdfenhancements')||selected.includes('pdf')||selected.includes('pdfperf')||selected.includes('pdfchain')||selected.includes('all')) {
  run(process.execPath,['--import','tsx','src/modules/pdf/tests/searchMemory.ts']);
  run(process.execPath,['--import','tsx','src/modules/pdf/tests/enhancementsUnit.ts']);
  run(process.execPath,['--import','tsx','src/modules/pdf/tests/optimization.ts']);
  run(process.execPath,['--import','tsx','src/modules/pdf/tests/rowsUnit.ts']);
}
if(selected.includes('all')||selected.some(name=>['exceledit','excelbasic','excelstructure','excelformula','excelcompat','excelrefs','excelgrid','excelformat','excel'].includes(name)))run(process.execPath,['--import','tsx','src/modules/excel/tests/editModelUnit.ts']);
if(selected.includes('exceledit')||selected.includes('exceladvanced')||selected.includes('excelrefs')||selected.includes('all'))run(process.execPath,['--import','tsx','src/modules/excel/tests/regionFormulaUnit.ts']);
if(selected.includes('exceledit')||selected.includes('excelfind')||selected.includes('all'))run(process.execPath,['--import','tsx','src/modules/excel/tests/findAssistUnit.ts']);
if(selected.includes('exceledit')||selected.includes('excelsheets')||selected.includes('all'))run(process.execPath,['--import','tsx','src/modules/excel/tests/sheetModelUnit.ts']);
if(selected.includes('exceledit')||selected.includes('exceltable')||selected.includes('all'))run(process.execPath,['--import','tsx','src/modules/excel/tests/tableModelUnit.ts']);
if (selected.includes('all') || selected.includes('excel'))
  run(process.execPath, ['--import', 'tsx', 'src/modules/excel/tests/loadWorkbookUnit.ts']);
mkdirSync(".test-build", { recursive: true });
await build({
  tsconfig: 'tsconfig.electron.json',
  entryPoints: ["tests/electron.entry.ts"],
  outfile: ".test-build/tests.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron","electron-updater","electron-updater/*", "../electron-dist/main.cjs"],
  target: "node22",
});
run(electron as unknown as string, [
  ".test-build/tests.cjs",
  "--suite",
  selected.join(","),
  ...(formats?['--formats',formats.join(',')]:[]),
]);
if (selected.includes("core") || selected.includes("all")) {
  await build({
    tsconfig: 'tsconfig.electron.json',
    entryPoints: ["tests/quit.entry.ts"],
    outfile: ".test-build/quit.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron", "../electron-dist/main.cjs"],
    target: "node22",
  });
  run(electron as unknown as string, [".test-build/quit.cjs"]);
  run(electron as unknown as string, [".test-build/quit.cjs","--configured-quit"]);
}
