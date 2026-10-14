import assert from "node:assert/strict";
import {beginFileEdit,waitForFileEdits} from '../src/composables/pendingEdits';
import {preparePreviewFile,loadPreparedFile} from '../electron/files';
import {resolve} from 'node:path';
const lazyText=await preparePreviewFile(resolve('work/fixtures/text.txt'));
assert.equal(lazyText.bytes.byteLength,0,'a chosen file should not occupy byte memory before preview');
const openedText=await loadPreparedFile(lazyText);
assert.equal(openedText.id,lazyText.id);
assert.ok(openedText.bytes.byteLength>0,'opening the active tab should load the content');
assert.equal(lazyText.bytes.byteLength,0,'metadata must not retain the loaded copy');
import { previewError } from '../shared/previewError';
assert.match(previewError({name:'PasswordException'}, 'PDF'), /密码保护/);
assert.match(previewError({code:'ENOENT'}, '文件'), /移动或删除/);
assert.match(previewError({code:'EACCES'}, '文件'), /权限/);
assert.match(previewError({name:'InvalidPDFException'}, 'PDF'), /损坏/);
assert.ok(!previewError(new Error('secret-path'), 'Word').includes('secret-path'));
import {
  paperSize,
  selectedPages,
  printDefaults,
  validatePrintOptions,
  applyPageOrder,
  printScaleFactor,
  paperSupportHint,
} from "../shared/printing";
import { pdfRasterPlan } from '../src/modules/pdf/print/rasterPlan';
import { fitScale } from "../src/composables/fit";
assert.deepEqual(paperSize({ ...printDefaults, paper: "A5" }), {
  width: 148,
  height: 210,
});
assert.equal(paperSupportHint("A4"), null);
assert.ok(paperSupportHint("A5")?.text.includes("A5"));
assert.equal(
  paperSupportHint("A5", { name: "Microsoft Print to PDF" })?.level,
  "warn",
);
assert.ok(
  paperSupportHint("A3", { name: "Office Laser" })?.text.includes("A3"),
);
assert.deepEqual(
  paperSize({ ...printDefaults, paper: "A5", landscape: true }),
  { width: 210, height: 148 },
);
assert.deepEqual(selectedPages("1-3,2,5", 5), [1, 2, 3, 5]);
assert.throws(() => selectedPages("6", 5));
assert.deepEqual(applyPageOrder([1, 2, 3, 4], "reverse"), [4, 3, 2, 1]);
assert.deepEqual(applyPageOrder([1, 2, 3, 4], "odd"), [1, 3]);
assert.deepEqual(applyPageOrder([1, 2, 3, 4], "even"), [2, 4]);
assert.equal(
  printScaleFactor({ width: 72, height: 72 }, { width: 210, height: 297 }, "actual"),
  1,
);
assert.ok(
  printScaleFactor({ width: 720, height: 720 }, { width: 148, height: 210 }, "shrink") < 1,
);
assert.throws(() =>
  validatePrintOptions({ ...printDefaults, deviceName: "printer", copies: 0 }),
);
assert.throws(() =>
  validatePrintOptions({
    ...printDefaults,
    deviceName: "p",
    scale: "bogus" as never,
  }),
);
assert.equal(fitScale(100, 200, 400, 400, "width"), 4);
assert.equal(fitScale(100, 200, 400, 400, "page"), 2);
import { defaults, normalizeSettings, extensions } from "../shared/contracts";
import { readFileSync } from "node:fs";
import { clampZoom } from "../src/composables/zoom";
import { fileArguments, retainPreparedFiles, releasePreparedReference, preparedFileCount } from "../electron/files";
assert.equal(clampZoom(1), 25);
assert.equal(clampZoom(1000), 400);
assert.equal(clampZoom(137.4), 137);
assert.deepEqual(normalizeSettings({}), defaults);
assert.equal(normalizeSettings({ defaultZoom: NaN }).defaultZoom, 100);
assert.equal(normalizeSettings({ defaultZoom: 0 }).defaultZoom, 25);
assert.equal(normalizeSettings({ theme: "dark" }).theme, "dark");
assert.equal(normalizeSettings({}).printEntry, "all");
assert.equal(normalizeSettings({ printEntry: "none" }).printEntry, "none");
assert.equal(
  normalizeSettings({ printEntry: "bogus" as never }).printEntry,
  "all",
);
assert.equal(
  "filePath" in normalizeSettings({ filePath: "secret" } as never),
  false,
);
assert.deepEqual(
  fileArguments([
    "--flag",
    "https://example.com/file.pdf",
    "C:\\data\\中文.pdf",
  ]),
  ["C:\\data\\中文.pdf"],
);
console.log(
  "PASS unit: zoom boundaries, settings validation, preference whitelist, command-line paths",
);
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
mkdirSync('.test-build',{recursive:true});
const sourceSample=path.resolve('.test-build/source-read.txt');
writeFileSync(sourceSample,'local read sample\n'.repeat(50000));
const countBefore=preparedFileCount();
const metadata=await preparePreviewFile(sourceSample);retainPreparedFiles(1,[metadata]);retainPreparedFiles(2,[metadata]);
const [read1,read2]=await Promise.all([loadPreparedFile(metadata),loadPreparedFile(metadata)]);
assert.equal(read1.bytes,read2.bytes,'concurrent readers must share the filesystem read result');
assert.equal(read1.bytes.byteOffset,0);assert.equal(read1.bytes.buffer.byteLength,read1.bytes.byteLength,'IPC bytes must not include pooled buffer padding');
releasePreparedReference(1,metadata.id);assert.equal(preparedFileCount(),countBefore+1,'print/session owner keeps source valid');
releasePreparedReference(2,metadata.id);assert.equal(preparedFileCount(),countBefore);
assert.ok((await loadPreparedFile(metadata)).error.includes('关闭'));
const closing=await preparePreviewFile(sourceSample);retainPreparedFiles(3,[closing]);
const pendingRead=loadPreparedFile(closing);releasePreparedReference(3,closing.id);
assert.ok((await pendingRead).error.includes('关闭'),'closed file must not refill bytes');
assert.equal(preparedFileCount(),countBefore);unlinkSync(sourceSample);
console.log('PASS file read single flight, source ownership and closing during read');
const associations = readFileSync("electron-dist/associations.nsh", "utf8");
const crop=pdfRasterPlan({width:595,height:842},{width:148,height:210},'actual',150);
assert.equal(crop.scale,150/72);
assert.ok(crop.widthMm<=128&&crop.heightMm<=190);
assert.ok(crop.transform[4]<0&&crop.transform[5]<0);
const enormous=pdfRasterPlan({width:595,height:1e9},{width:210,height:297},'actual',150);
assert.ok(enormous.width*enormous.height<2_000_000,'huge original pages must rasterize only the printable crop');
console.log('PASS actual-size PDF crop preserves scale with bounded print raster');
for (const ext of extensions)
  assert.ok(
    associations.includes(`Software\\Classes\\.${ext}\\OpenWithProgids`),
  );
assert.ok(!associations.includes("UserChoice"));
assert.ok(
  !/WriteRegStr[^\n]+"Software\\Classes\\\.[^"\\]+"/.test(associations),
);
assert.ok(associations.includes('"%1"'));
console.log(
  "PASS installer: Open With supports all formats and preserves default associations",
);

// Window transfers must wait for all in-flight edits, regardless of file format.
{
  const file={},endA=beginFileEdit(file),endB=beginFileEdit(file);let exported=false;
  const ready=waitForFileEdits(file).then(()=>{exported=true;});
  endA();await Promise.resolve();assert.equal(exported,false);
  endB();await ready;assert.equal(exported,true);
  endB();await waitForFileEdits(file);
  console.log('PASS pending file edits settle before transfer snapshot');
}
