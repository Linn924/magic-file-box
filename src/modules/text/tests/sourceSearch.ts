import assert from 'node:assert/strict';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import type {Suite} from '../../../../tests/context';

const suite: Suite = async c => {
  const name = 'search-distant-json-v1.json';
  const marker = '远处JSON目标';
  if (!existsSync(c.fixture(name))) writeFileSync(c.fixture(name), JSON.stringify(Array.from({length: 120}, (_, index) => ({
    id: index,
    value: index === 90 ? marker + ' / ' + marker : index === 115 ? marker : 'ordinary row ' + index,
  }))));
  const before = readFileSync(c.fixture(name));
  const win = await c.open(name);
  const search = async (target: typeof win, value: string) => {
    if (!await c.evaluate(target, "!!document.querySelector('.text-search-input')")) await c.click(target, '.text-search-toggle');
    await c.evaluate(target, `(() => {const input=document.querySelector('.text-search-input');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  };
  const visible = `(() => {
    const root=document.querySelector('.text-scroll'), bounds=root.getBoundingClientRect();
    return [...root.querySelectorAll('.text-current-hit')].some(mark=>[...mark.getClientRects()].some(r=>r.top>=bounds.top&&r.bottom<=bounds.bottom&&r.width>0));
  })()`;
  const current = () => c.evaluate<{line: string; start: string}>(win, "(() => {const hit=document.querySelector('.text-current-hit');return {line:hit.closest('.text-line').dataset.line,start:hit.dataset.hitStart}})()");
  try {
    await search(win, marker);
    await c.pause(450);
    const state = await c.evaluate(win, `(() => {
      const root=document.querySelector('.text-scroll'), bounds=root.getBoundingClientRect();
      const marks=[...root.querySelectorAll('.text-hit')];
      return {scrollTop:root.scrollTop, count:document.querySelector('.text-search-count').textContent,
        marks:marks.length, visible:marks.some(mark=>[...mark.getClientRects()].some(r=>r.top>=bounds.top&&r.bottom<=bounds.bottom))};
    })()`);
    console.log('JSON SEARCH STATE ' + JSON.stringify(state));
    assert.equal((state as {visible: boolean}).visible, true, 'Searching a distant JSON value must reveal its highlight');
    await c.check(win, 'JSON search counts occurrences and reveals the first one', "document.querySelector('.text-search-count').textContent.includes('1 / 3') && " + visible);
    const first = await current();
    await c.click(win, '.text-find-next');
    await c.check(win, 'next JSON occurrence on the same line stays visible', "document.querySelector('.text-search-count').textContent.includes('2 / 3') && " + visible);
    const second = await current();
    assert.equal(second.line, first.line);
    assert.notEqual(second.start, first.start);
    await c.evaluate(win, "document.querySelector('.text-search-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
    await c.check(win, 'Enter locates the next distant JSON value', "document.querySelector('.text-search-count').textContent.includes('3 / 3') && " + visible);
    assert.notEqual((await current()).line, first.line);
    await c.evaluate(win, "document.querySelector('.text-search-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}))");
    await c.check(win, 'Shift Enter moves to the previous JSON occurrence', "document.querySelector('.text-search-count').textContent.includes('2 / 3') && " + visible);
    await c.click(win, '.text-find-previous');
    await c.click(win, '.text-find-previous');
    await c.check(win, 'JSON previous navigation wraps to the last occurrence', "document.querySelector('.text-search-count').textContent.includes('3 / 3') && " + visible);
    const top = await c.evaluate<number>(win, "document.querySelector('.text-scroll').scrollTop");
    await search(win, 'no-such-json-value');
    await c.check(win, 'a missing JSON term clears highlights and disables navigation', "document.querySelector('.text-search-count').textContent.includes('0 处匹配') && !document.querySelector('.text-hit') && document.querySelector('.text-find-next').disabled && document.querySelector('.text-find-previous').disabled");
    assert.equal(await c.evaluate(win, "document.querySelector('.text-scroll').scrollTop"), top);
    await search(win, marker);
    await c.check(win, 'changing back to a JSON term returns to its first occurrence', "document.querySelector('.text-search-count').textContent.includes('1 / 3') && " + visible);
    const originalTheme = c.program.settings.get().theme;
    try {
      c.program.updateSettings({theme: 'dark'});
      await c.check(win, 'JSON current highlight remains distinct in the dark theme', "getComputedStyle(document.querySelector('.text-current-hit')).outlineStyle === 'solid' && " + visible);
      await c.snapshot(win, 'json-search-distant-dark');
    } finally { c.program.updateSettings({theme: originalTheme}); }
    assert.equal(await c.evaluate(win, "[...document.querySelectorAll('.line-body')].map(el=>el.textContent).join('\\n')"), JSON.stringify(JSON.parse(before.toString()), null, 2));
    await c.snapshot(win, 'json-search-distant');
    await c.click(win, '.search-close');
    await c.check(win, 'closing JSON search removes both normal and selected highlights', "!document.querySelector('.text-hit,.text-current-hit')");
    assert.deepEqual(readFileSync(c.fixture(name)), before);
  } finally { c.close(win); }

  const longName = 'search-virtual-json-v1.json';
  if (!existsSync(c.fixture(longName))) writeFileSync(c.fixture(longName), JSON.stringify(Array.from({length: 5000}, (_, index) =>
    index === 3200 || index === 4700 ? marker : index === 1000 ? 'wrapped ' + 'x'.repeat(16000) + 'wrapped-target' : 'row ' + index)));
  const longBefore = readFileSync(c.fixture(longName)), long = await c.open(longName);
  try {
    await search(long, marker);
    await c.check(long, 'virtual JSON search materializes and reveals an offscreen match', "document.querySelector('.text-search-count').textContent.includes('1 / 2') && document.querySelectorAll('.text-line').length < 100 && " + visible);
    await c.click(long, '.text-find-next');
    await c.check(long, 'virtual JSON next navigation reaches a distant result', "document.querySelector('.text-search-count').textContent.includes('2 / 2') && document.querySelectorAll('.text-line').length < 100 && " + visible);
    await c.evaluate(long, "(() => {const z=document.querySelector('.zoom-control input');z.value='175';z.dispatchEvent(new Event('input',{bubbles:true}));z.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");
    await search(long, 'wrapped-target');
    await c.check(long, 'virtual JSON search reaches the end of a tall wrapped line at 175 percent', "document.querySelector('.text-search-count').textContent.includes('1 / 1') && " + visible);
    await c.evaluate(long, `async function change(){const input=document.querySelector('.text-search-input');input.value=${JSON.stringify(marker)};input.dispatchEvent(new Event('input',{bubbles:true}));await Promise.resolve();input.value='wrapped-target';input.dispatchEvent(new Event('input',{bubbles:true}));} change()`);
    await c.check(long, 'a newer query cancels stale virtual search navigation', "document.querySelector('.text-search-count').textContent.includes('1 / 1') && document.querySelector('.text-current-hit')?.textContent === 'wrapped-target' && " + visible);
    await c.snapshot(long, 'json-search-virtual-wrapped');
    assert.deepEqual(readFileSync(c.fixture(longName)), longBefore);
  } finally { c.close(long); }

  for (const [ext, value] of [
    ['txt', 'plain <tag> &lt; .* ['],
    ['js', 'const found = 42;'],
    ['json', 'invalid-json-target'],
    ['md', 'markdown-source-target'],
  ] as const) {
    const file = 'search-source-' + ext + '-v1.' + ext;
    const source = Array.from({length: 160}, (_, i) => ext === 'js' ? '// row ' + i : 'row ' + i).join('\n') + '\n' + value;
    if (!existsSync(c.fixture(file))) writeFileSync(c.fixture(file), source);
    const sourceBefore = readFileSync(c.fixture(file)), target = await c.open(file);
    try {
      if (ext === 'md') await c.click(target, '.md-source-toggle');
      await search(target, value);
      await c.check(target, 'source search reveals and highlights ' + ext, "document.querySelector('.text-search-count').textContent.includes('1 / 1') && " + visible);
      assert.equal(await c.evaluate(target, "[...document.querySelectorAll('.text-current-hit')].map(el=>el.textContent).join('')"), value);
      assert.equal(await c.evaluate(target, "[...document.querySelectorAll('.line-body')].map(el=>el.textContent).join('\\n')"), source);
      assert.deepEqual(readFileSync(c.fixture(file)), sourceBefore);
    } finally { c.close(target); }
  }
};
export default suite;
