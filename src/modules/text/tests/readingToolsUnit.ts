import assert from 'node:assert/strict';
import {tokenizeSyntax} from '../core/syntaxEngine';
import {codeFolds} from '../core/folding';
import {indexSourceMatches,indexSourceMatchesAsync,sourceMatchAt,sourceMatchAtAsync} from '../core/sourceSearch';
import {renderTextLine} from '../core/highlight';
import {Lexer} from 'marked';
const js=['function outer() {','  const text = "}";','  const regex = /[{}]/;','  if (true) {','    // } must not close code','    return 1;','  }','}'];
const ranges=codeFolds(js,await tokenizeSyntax(js.join('\n'),'javascript'),'javascript');
assert.deepEqual(ranges,[{start:0,end:7},{start:3,end:6}]);
const python=['def outer():','    text = ":"','    if True:','        return 2','next_value = 1'];
assert.deepEqual(codeFolds(python,await tokenizeSyntax(python.join('\n'),'python'),'python'),[{start:0,end:3},{start:2,end:3}]);
const xml=['<root value=">">','  <child>','    text','  </child>','</root>'];
assert.deepEqual(codeFolds(xml,await tokenizeSyntax(xml.join('\n'),'xml'),'xml'),[{start:0,end:4},{start:1,end:3}]);
const fenced=['# Main','','````md','```js','# This is code, not a section','```','````','','## Next','body'];
const renderedFence=Lexer.lex(fenced.join('\n')).find(token=>token.type==='code');assert.ok(renderedFence&&'text' in renderedFence);
assert.equal(renderedFence.text,'```js\n# This is code, not a section\n```','the rendered Markdown parser treats the inner shorter fences as source text');
assert.deepEqual(codeFolds(fenced,await tokenizeSyntax(fenced.join('\n'),'markdown'),'markdown'),[{start:0,end:9},{start:2,end:6},{start:8,end:9}],'a shorter fence inside a code example must not close the outer block or create a heading');
const unclosed=['~~~text','code','more code'];
assert.deepEqual(codeFolds(unclosed,await tokenizeSyntax(unclosed.join('\n'),'markdown'),'markdown'),[{start:0,end:2}],'an unclosed Markdown fence extends to the end of the source');
const markup=renderTextLine('a'.repeat(20000),'','a',19000);assert.equal((markup.match(/<mark/g)||[]).length,513);assert.ok(markup.includes('data-hit-start="19000"'));
const lines=['aa AA [x]','mixed [x] aa',''];
for(const query of ['aa','[x]',' ','不存在']){
  const signal=new AbortController().signal,index=await indexSourceMatchesAsync(lines,query,signal);
  assert.deepEqual(index,indexSourceMatches(lines,query));
  for(let n=0;n<index.count;n++)assert.deepEqual(await sourceMatchAtAsync(index,lines,query,n,signal),sourceMatchAt(index,lines,query,n));
}
const controller=new AbortController();let ticked=false;setTimeout(()=>{ticked=true;controller.abort();},0);
await assert.rejects(indexSourceMatchesAsync(['a'.repeat(2_000_000)],'a',controller.signal),{name:'AbortError'});assert.equal(ticked,true);
console.log('PASS syntax-aware folds, strings/regex/comments, indentation, literal search parity and cooperative cancellation');
