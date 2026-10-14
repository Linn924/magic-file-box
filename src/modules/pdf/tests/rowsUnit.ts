import assert from 'node:assert/strict';
import {PdfRowIndex,PDF_ROW_GAP} from '../core/rowIndex';
const rows=new PdfRowIndex();
rows.rebuild([{width:480,height:600},{width:480,height:300},{width:300,height:200}],1000);
assert.deepEqual(rows.rows.map(row=>row.pages),[[0,1],[2]]);
assert.equal(rows.mode,'double');assert.equal(rows.offsetForPage(0),rows.offsetForPage(1));assert.equal(rows.offsetForPage(2),600+PDF_ROW_GAP);
rows.rebuild([{width:480,height:600},{width:480,height:300},{width:300,height:200}],990);assert.equal(rows.rows[0].pages.length,2,'hysteresis retains fitting pair');
rows.rebuild([{width:480,height:600},{width:480,height:300},{width:300,height:200}],983);assert.equal(rows.rows[0].pages.length,1,'pair never overflows available width');
rows.rebuild([{width:480,height:600},{width:480,height:300},{width:300,height:200}],999);assert.equal(rows.rows[0].pages.length,1,'16px entry margin prevents threshold chatter');
rows.rebuild([{width:480,height:600},{width:480,height:300},{width:300,height:200}],1000);assert.equal(rows.rows[0].pages.length,2);
rows.update([{index:1,width:520,height:700}]);assert.deepEqual(rows.rows.map(row=>row.pages),[[0],[1],[2]]);assert.equal(rows.offsetForPage(2),600+700+PDF_ROW_GAP*2);
rows.rebuild([{width:300,height:600},{width:300,height:600},{width:800,height:300},{width:800,height:300}],1000);assert.equal(rows.mode,'mixed');assert.deepEqual(rows.rows.map(row=>row.pages),[[0,1],[2],[3]]);
rows.rebuild([{width:300,height:600},{width:300,height:600}],1000,false);assert.equal(rows.mode,'single','presentation bypasses pairing');
rows.rebuild([{width:100,height:100}],1000);assert.deepEqual(rows.rows.map(row=>row.pages),[[0]]);
rows.rebuild([],1000);assert.equal(rows.rows.length,0);
const boxes=Array.from({length:1001},(_,i)=>({width:250+(i%3)*50,height:300+(i%7)*40}));rows.rebuild(boxes,900);
for(let i=0;i<120;i++){
  const page=(i*73)%boxes.length;boxes[page]={width:i%2?300:800,height:250+i};rows.update([{index:page,...boxes[page]}]);
  let top=0;
  for(let row=0;row<rows.rows.length;row++){
    const value=rows.rows[row];assert.equal(rows.offset(row),top);assert.equal(rows.rowAt(top+1),row);
    for(const page of value.pages)assert.equal(rows.rowForPage(page),row);
    assert.equal(value.height,Math.max(...value.pages.map(page=>boxes[page].height)));top+=value.height+PDF_ROW_GAP;
  }
  assert.equal(rows.offset(rows.rows.length),top);
  assert.deepEqual(rows.rows.flatMap(row=>row.pages),Array.from({length:1001},(_,i)=>i),'no lost or duplicated page after regrouping');
}
console.log('PASS PDF rows: stable pairs, mixed sizes, odd tail, threshold margin, presentation and 1001-page incremental positions');
