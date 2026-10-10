import { checkContinuous } from "../../../../tests/continuous";
import type { Suite } from "../../../../tests/context";
import { checkResize } from "../../../../tests/resize";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import JSZip from "jszip";
const suite: Suite = async (c) => {
  for (const name of ["document.docx", "legacy.doc"]) {
    const win = await c.open(name);
    if(name==='legacy.doc')await c.check(win,'legacy DOC print is disabled with a clear tooltip',"document.querySelector('.file-print-button').disabled&&document.querySelector('.file-print-button').title.includes('不支持打印')");
    await c.check(
      win,
      "Word content " + name,
      "document.querySelector('.word-host').shadowRoot.textContent.length>100",
    );
    if (name === "document.docx") {
      await c.check(
        win,
        "Word table resize handles",
        "!!document.querySelector('.word-host').shadowRoot.querySelector('.column-resize-handle')",
      );
      await c.check(
        win,
        "Word print button present",
        "!!document.querySelector('.file-print-button')",
      );
    }
    if (name === "document.docx")
      await checkResize(
        c,
        win,
        "document.querySelector('.word-host').shadowRoot.querySelector('.column-resize-handle')",
        "document.querySelector('.word-host').shadowRoot.querySelector('td').getBoundingClientRect().width",
      );
    await c.evaluate(
      win,
      "document.querySelector('.word-host').shadowRoot.querySelector('.preview-content').dispatchEvent(new WheelEvent('wheel',{deltaY:-120,bubbles:true,composed:true,cancelable:true}))",
    );
    await c.check(
      win,
      "Word wheel does not zoom",
      "document.querySelector('.zoom-control input').value==='100'",
    );
    await c.snapshot(win, name === "legacy.doc" ? "doc-legacy" : "word");
    c.close(win);
  }
  const bad = await c.open("broken.docx");
  await c.check(
    bad,
    "corrupt Word error",
    "!!document.querySelector('.error')",
  );
  c.close(bad);
  if (!existsSync(c.fixture("pages.docx"))) {
    const archive = await JSZip.loadAsync(
      readFileSync(c.fixture("document.docx")),
    );
    const xml = await archive.file("word/document.xml")!.async("string");
    archive.file(
      "word/document.xml",
      xml.replace(
        "<w:sectPr>",
        '<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>第二页翻页测试</w:t></w:r></w:p><w:sectPr>',
      ),
    );
    writeFileSync(
      c.fixture("pages.docx"),
      await archive.generateAsync({ type: "nodebuffer" }),
    );
  }
  const pages = await c.open("pages.docx");
  await c.check(
    pages,
    "DOCX pages coexist",
    "document.querySelector('.word-host').shadowRoot.querySelectorAll('section.docx').length===2",
  );
  await checkContinuous(c, pages, ".document-scroll");
  await c.check(
    pages,
    "Word table resize handles present",
    "document.querySelector('.word-host').shadowRoot.querySelectorAll('.column-resize-handle').length>0",
  );
  c.close(pages);
  const tabs=(await c.program.openPaths([c.fixture('document.docx'),c.fixture('text.txt')],'tabs'))[0];await c.check(tabs,'Word tab resize ready',"!!document.querySelector('.word-host')?.shadowRoot?.querySelector('.column-resize-handle')");
  await checkResize(c,tabs,"document.querySelector('.word-host').shadowRoot.querySelector('.column-resize-handle')","document.querySelector('.word-host').shadowRoot.querySelector('td').getBoundingClientRect().width");
  const width=await c.evaluate<number>(tabs,"document.querySelector('.word-host').shadowRoot.querySelector('td').getBoundingClientRect().width");
  await c.click(tabs,'.tab .tab-name','text.txt');await c.pause(2200);await c.click(tabs,'.tab .tab-name','document.docx');
  await c.check(tabs,'Word temporary column width survives idle unload',`(()=>{const t=document.querySelector('.word-host')?.shadowRoot?.querySelector('td');return !!t&&Math.abs(t.getBoundingClientRect().width-${width})<2})()`);c.close(tabs);

};
export default suite;
