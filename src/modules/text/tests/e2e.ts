import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type { Suite } from "../../../../tests/context";
import markdownLinks from './markdownLinks';
import markdownReading from './markdownReading';
const suite: Suite = async (c) => {
  const source='const item = "quoted 42"; // return 7\nspan class <node> &lt;';
  writeFileSync(c.fixture('audit-highlight.js'),source);
  const audit=await c.open('audit-highlight.js');
  assert.equal(await c.evaluate(audit,"[...document.querySelectorAll('.line-body')].map(el=>el.textContent).join('\\n')"),source,'syntax highlighting must preserve exact source text');
  await c.click(audit,'.text-search-toggle');
  for(const query of ['span','class','<node>','&lt;','quoted 42']){
    await c.evaluate(audit,`(()=>{const i=document.querySelector('.text-search-input');i.value=${JSON.stringify(query)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    assert.equal(await c.evaluate(audit,"[...document.querySelectorAll('.line-body')].map(el=>el.textContent).join('\\n')"),source,'search must never rewrite HTML tags or entities');
    await c.check(audit,'literal text search '+query,"!!document.querySelector('.text-hit')");
  }
  c.close(audit);
    const longName='audit-long-lines.txt';writeFileSync(c.fixture(longName),['long '+('x'.repeat(12000)),...Array.from({length:5000},(_,i)=>'row '+i+' END')].join('\n'));
  const long=await c.open(longName);await c.check(long,'long text keeps rendered row count bounded',"document.querySelectorAll('.text-line').length<100");
  await c.evaluate(long,"(()=>{const r=document.querySelector('.text-scroll');r.scrollTop=r.scrollHeight})()");await c.check(long,'long wrapped first line cannot hide final source line',"[...document.querySelectorAll('.line-body')].some(el=>el.textContent==='row 4999 END')");await c.evaluate(long,"(()=>{const z=document.querySelector('.zoom-control input');z.value='175';z.dispatchEvent(new Event('input',{bubbles:true}));z.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");await c.pause(100);await c.evaluate(long,"(()=>{const r=document.querySelector('.text-scroll');r.scrollTop=r.scrollHeight})()");await c.check(long,'long text end remains reachable after software zoom',"[...document.querySelectorAll('.line-body')].some(el=>el.textContent==='row 4999 END')&&document.querySelectorAll('.text-line').length<100");c.close(long);
    for(const [ext,source] of [['txt','a\n\nb'],['ts','const a: string = "42 span"; // class'],['css','.a { color: #aabbcc; content: "span"; }'],['xml','<node id="42">&amp;</node>'],['ini','[section]\nkey=42'],['toml','[table]\nkey="42"'],['yaml','value: true\n# comment'],['json','{"name":"span", "value":42}']] as const){
    const name='audit-source-'+ext+'.'+ext;writeFileSync(c.fixture(name),source);const syntax=await c.open(name);
    const expected=ext==='json'?JSON.stringify(JSON.parse(source),null,2):source;
    assert.equal(await c.evaluate(syntax,"[...document.querySelectorAll('.line-body')].map(el=>el.textContent).join('\\n')"),expected,'source preserved for '+ext);c.close(syntax);
  }
  for(const [name,bytes,encoding] of [['audit-gbk.txt',Buffer.from('d6d0cec4','hex'),'gb18030'],['audit-le.txt',Buffer.concat([Buffer.from([255,254]),Buffer.from('中文','utf16le')]),'utf-16le'],['audit-be.txt',Buffer.concat([Buffer.from([254,255]),Buffer.from('中文','utf16le').swap16()]),'utf-16be']] as const){
    writeFileSync(c.fixture(name),bytes);const encoded=await c.open(name);await c.check(encoded,'text encoding '+encoding,`document.querySelector('[aria-label=文本编码]').value==='${encoding}'&&document.querySelector('.line-body').textContent==='中文'`);c.close(encoded);
  }
    const text = await c.open("text.txt");
  await c.check(
    text,
    "text.txt",
    "document.querySelector('.text-code').textContent.includes('<script>') && !window.BAD",
  );
  await c.check(
    text,
    "text line numbers shown",
    "document.querySelectorAll('.line-no').length>0",
  );
  // 行号应与 data-line 属性一致
  await c.check(
    text,
    "text line-no matches data-line",
    "(()=>{const lines=document.querySelectorAll('.text-line');return Array.from(lines).every((el,i)=>el.querySelector('.line-no')?.textContent.trim()===(parseInt(el.dataset.line||'0')).toString())})()",
  );
  await c.click(text, ".text-search-toggle");
  await c.evaluate(
    text,
    "(()=>{const i=document.querySelector('.text-search-input');i.value='script';i.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await c.check(
    text,
    "text search marks hits",
    "!!document.querySelector('.text-hit') && !!document.querySelector('.text-search-count')",
  );
  await c.wheel(text, ".preview-content", -120);
  await c.check(
    text,
    "text wheel does not zoom",
    "document.querySelector('.zoom-control input').value==='100'",
  );
  c.close(text);
  for (const [file, needle] of [
    ["data.json", String.fromCharCode(10)],
    ["invalid.json", "JSON 格式不完整"],
  ] as const) {
    const win = await c.open(file);
    await c.check(
      win,
      file,
      `document.body.innerText.includes(${JSON.stringify(needle)})`,
    );
    if (file === "data.json")
      await c.check(
        win,
        "json highlight tokens",
        "!!document.querySelector('.tok-key,.tok-str,.tok-num')",
      );
    await c.wheel(win, ".preview-content", -120);
    await c.check(
      win,
      "text wheel does not zoom",
      "document.querySelector('.zoom-control input').value==='100'",
    );
    c.close(win);
  }
  const md = await c.open("readme.md");
  await c.check(md,'Markdown line-number button reflects rendered reading mode',"document.querySelector('.text-lines-toggle').disabled&&document.querySelector('.text-lines-toggle').getAttribute('aria-pressed')==='false'");
  await c.check(
    md,
    "readme.md",
    "document.querySelector('.markdown h1').textContent==='Markdown 预览' && !window.BAD",
  );
  await c.wheel(md, ".preview-content", -120);
  await c.check(
    md,
    "text wheel does not zoom",
    "document.querySelector('.zoom-control input').value==='100'",
  );
  await c.click(md,'.text-search-toggle');await c.check(md,'Markdown query keeps rendered reading and line-control state',"document.querySelector('.text-lines-toggle').disabled&&!!document.querySelector('.markdown h1')");await c.click(md,'.search-close');await c.click(md,'.md-source-toggle');await c.check(md,'Markdown source view has usable line numbers',"!document.querySelector('.text-lines-toggle').disabled&&!!document.querySelector('.line-no')");await c.click(md,'.md-source-toggle');await c.check(md,'Markdown rendered view restores line-control state',"!!document.querySelector('.markdown h1')&&document.querySelector('.text-lines-toggle').disabled");
  c.close(md);
  await markdownLinks(c);
  await markdownReading(c);
};
export default suite;
