import assert from 'node:assert/strict';
import {validateSheetName,nextSheetName,sheetFormula} from '../sheetWorkbook';
for(const name of ['', ' ', 'x'.repeat(32),'a/b','a\\b','a:b','a?b','a*b','[x]',"'a","a'",'a\n','History'])assert.throws(()=>validateSheetName(name,[]));
assert.throws(()=>validateSheetName('data',['Data']));validateSheetName('data',['Data'],'Data');validateSheetName("O'Brien",[]);
assert.equal(nextSheetName(['工作表1','工作表2']),'工作表3');assert.ok(nextSheetName(['x'.repeat(31)],'x'.repeat(31)).length<=31);
assert.equal(sheetFormula('SUM(Data!$A$1:Data!B2)+IF(A1="Data!A1",1,0)','data',"O'Brien"),"SUM('O''Brien'!$A$1:B2)+IF(A1=\"Data!A1\",1,0)");
assert.equal(sheetFormula('Other!A1+Data!A1','Data'),'Other!A1+#REF!');assert.equal(sheetFormula("'O''Brien'!A1", "O'Brien",'中文 表'),"'中文 表'!A1");
assert.throws(()=>sheetFormula('INDIRECT("Data!A1")','Data','new'));assert.throws(()=>sheetFormula('Data:Other!A1','Data','new'));assert.throws(()=>sheetFormula('[Book.xlsx]Data!A1','Data','new'));
console.log('PASS sheet names, Unicode/case/apostrophes, formula strings, absolute/range references and unsafe formula rejection');
