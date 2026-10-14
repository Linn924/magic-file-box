import assert from 'node:assert/strict';
import {tokenizeSyntax} from '../core/syntaxEngine';
import {syntaxLanguage} from '../core/languages';
import {withinSyntaxBudget} from '../core/syntaxTypes';
import {renderSyntaxLine} from '../core/highlight';
const source='/* opening\nconst inside = 42;\n*/\nconst text = `hello ${name}`;\n\t"<script>&lt;😀";\r';
const data=await tokenizeSyntax(source,'js');assert.equal(data.lines.length,5);assert.ok(data.lines[1].every(t=>data.styles[t[2]].kind==='tok-cmt'),'multiline comment cannot become keywords');assert.ok(data.lines[3].some(t=>data.styles[t[2]].kind==='tok-kw'));
assert.ok(data.styles.some(s=>s.light!==s.dark),'dual themes are available without retokenizing');const rendered=renderSyntaxLine(source.split('\n')[4],data.lines[4],data.styles);assert.ok(rendered.includes('&#13;'),'CR must survive HTML parsing');
const html=renderSyntaxLine(source.split('\n')[4],data.lines[4],data.styles,'<script>');assert.ok(!html.includes('<script>'));assert.ok(html.includes('text-hit'));assert.ok(html.includes('&lt;script&gt;'));
const py=await tokenizeSyntax('value = """hello\nclass inside\n"""\ndef fn():\n  return 42','python');assert.ok(py.lines[1].every(t=>py.styles[t[2]].kind==='tok-str'));assert.ok(py.lines[3].some(t=>py.styles[t[2]].kind==='tok-fn'));
const vue=await tokenizeSyntax('<template><p>{{value}}</p></template>\n<script lang="ts">\nconst value: number = 1;\n</script>\n<style>p { color: red }</style>','vue');assert.ok(vue.lines[0].some(t=>vue.styles[t[2]].kind==='tok-key'));assert.ok(vue.lines[2].some(t=>vue.styles[t[2]].kind==='tok-kw'));
for(const [lang,text] of Object.entries({c:'int main(){return 0;}',cpp:'#include <vector>\nstd::vector<int> values;',csharp:'class Test { string name = "test"; }',java:'class Test { int n = 1; }',go:'package main\nfunc main() {}',rust:'fn main() { let n = 1; }',sql:'SELECT name FROM users WHERE id=1;',powershell:'$value = "hello"\nWrite-Host $value',bash:'#!/bin/bash\necho "$value"',jsx:'const v = <div>{name}</div>;',tsx:'const v: JSX.Element = <div>{name}</div>;',jsonc:'{\n// comment\n"key": 42\n}',json5:'{key: "value"}',less:'.box { color: red; }',scss:'$color: red; .box { color: $color; }'})){const result=await tokenizeSyntax(text,lang);assert.ok(result.styles.length,lang+' loads locally');}
assert.equal(syntaxLanguage('__proto__'),undefined);assert.equal(syntaxLanguage('c++'),'cpp');assert.equal(syntaxLanguage('rs'),'rust');assert.equal(withinSyntaxBudget('x'.repeat(20001)),false);assert.equal(withinSyntaxBudget('\n'.repeat(50000)),false);await assert.rejects(tokenizeSyntax('x','unknown'));
console.log('PASS local syntax grammars, cross-line states, Vue embedding, dual themes, source escaping, CR and bounded fallback');
