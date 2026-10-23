import './formulaUnit';
import './xlsStylesUnit';
import assert from 'node:assert/strict';
import {parseExcelInput,parseTablePaste,excelInput,changeSignature} from '../core/editing/editModel';
import {moveIndex,moveRange,moveFormula} from '../core/editing/structure';
import {selectionRange,singleton,regionTargets,contains} from '../core/editing/selection';
import {validateFormat,borderFor} from '../core/editing/formatModel';
assert.deepEqual(parseExcelInput('12.5'),{kind:'number',value:12.5});
assert.deepEqual(parseExcelInput("'00123"),{kind:'text',value:'00123'});
assert.deepEqual(parseExcelInput('123456789012345678'),{kind:'text',value:'123456789012345678'});
assert.equal(excelInput({kind:'text',value:'00123'}),"'00123");
for(const expression of ['=A1+2','=SUM(A1:B3,4)','=AVERAGE($A$1:A3)','=2*(3+4)','=1e2+4'])assert.equal(parseExcelInput(expression).kind,'formula');
for(const expression of ['=','=1+','=A1 B2','=SUM(A1,','=WEBSERVICE(1)','=A0+1','=XFE1','=SUM(A1,,B2)'])assert.throws(()=>parseExcelInput(expression),expression);
assert.throws(()=>parseExcelInput('a'.repeat(32768)));assert.throws(()=>parseExcelInput('x\u0000'));
assert.deepEqual(parseTablePaste('"a\tb"\t2\r\n"c\nd"\t3\r\n'),[['a\tb','2'],['c\nd','3']]);
assert.throws(()=>parseTablePaste('"unterminated'));
assert.equal(changeSignature([{sheet:'A',address:'B1',value:{kind:'number',value:2}},{sheet:'A',address:'A1',value:{kind:'blank'}}]),changeSignature([{sheet:'A',address:'A1',value:{kind:'blank'}},{sheet:'A',address:'B1',value:{kind:'number',value:2}}]));
console.log('PASS Excel edit parsing: text/number/formula, exact identifiers, bounds and quoted table paste');
const insert={sheet:'Data',axis:'row' as const,kind:'insert' as const,index:1,count:2};
assert.equal(moveIndex(1,insert),3);assert.equal(moveRange('A1:B3',insert),'A1:B5');
assert.equal(moveFormula('SUM($A$1:A3)+Other!B2','Data',insert),'SUM($A$1:A5)+Other!B2');
assert.equal(moveFormula("'Data'!$B$2+Other!A1",'Other',insert),"'Data'!$B$4+Other!A1");
const remove={...insert,kind:'delete' as const,count:1};assert.equal(moveIndex(1,remove),null);assert.equal(moveFormula('B2+B3','Data',remove),'#REF!+B2');assert.equal(moveRange('A2:B2',remove),null);assert.equal(moveRange('A1:B3',remove),'A1:B2');
assert.equal(moveFormula('#REF!+B2','Data',insert),'#REF!+B4');assert.equal(moveFormula('IF(A1="A2",1,0)','Data',insert),'IF(A1="A2",1,0)');
assert.equal(moveFormula('Data!#REF!+B2','Other',insert),'Data!#REF!+B2');assert.equal(moveFormula('A1048576','Data',insert),'#REF!');
const deleteFirst={sheet:'Data',axis:'row' as const,kind:'delete' as const,index:0,count:1};
assert.equal(moveFormula('SUM(A3:A1)','Data',deleteFirst),'SUM(A2:A1)');
assert.equal(moveFormula("SUM('Data'!$C$3:$A$1)",'Other',{...deleteFirst,axis:'column'}),"SUM('Data'!$B$3:$A$1)");
assert.equal(moveFormula('SUM(A1048576:A1)','Data',{...insert,index:0,count:1}),'SUM(#REF!)');
console.log('PASS Excel structural references: insertion/deletion, absolute/range/cross-sheet references and unsupported formulas');

// Selection and formatting are small parts of the shared Excel editing model.
{
  const basic=singleton('Data','B2');basic.focus={r:3,c:4};assert.deepEqual(selectionRange(basic,100,20),{s:{r:1,c:1},e:{r:3,c:4}});
  const expanded=selectionRange(basic,100,20,[{s:{r:3,c:4},e:{r:6,c:6}},{s:{r:5,c:5},e:{r:8,c:8}}]);assert.deepEqual(expanded.e,{r:8,c:8});assert.ok(contains(expanded,'I9'));assert.ok(!contains(expanded,'J9'));
  assert.deepEqual(selectionRange({...basic,mode:'rows'},100,20),{s:{r:1,c:0},e:{r:3,c:19}});assert.deepEqual(selectionRange({...basic,mode:'columns'},100,20),{s:{r:0,c:1},e:{r:99,c:4}});
  assert.throws(()=>regionTargets({s:{r:0,c:0},e:{r:99999,c:99}},[]));assert.deepEqual(regionTargets({s:{r:0,c:0},e:{r:1,c:1}},[{s:{r:0,c:0},e:{r:0,c:1}}]),['A1','A2','B2']);
  console.log('PASS Excel selection bounds, whole rows/columns, merge closure and atomic operation limit');
}
{
  const range={s:{r:1,c:1},e:{r:3,c:3}},border={preset:'outer' as const,style:'thin',color:'FF0000'};
  assert.deepEqual(Object.keys(borderFor(range,{r:1,c:1},border)),['left','top']);assert.deepEqual(borderFor(range,{r:2,c:2},border),{});
  assert.deepEqual(borderFor(range,{r:2,c:2},{...border,preset:'left'}),{});assert.deepEqual(Object.keys(borderFor(range,{r:2,c:1},{...border,preset:'left'})),['left']);
  assert.equal(Object.keys(borderFor(range,{r:2,c:2},{...border,preset:'inner'})).length,4);
  for(const patch of [{font:{size:0}},{font:{size:Infinity}},{font:{name:''}},{font:{color:'oops'}},{alignment:{indent:16}},{alignment:{textRotation:91}},{numFmt:'\u0000'}])assert.throws(()=>validateFormat(patch));validateFormat({font:{size:16,bold:true},fill:'00FF00',numFmt:'0.00%',alignment:{wrapText:true}});
  console.log('PASS Excel format validation and border edge selection');
}
