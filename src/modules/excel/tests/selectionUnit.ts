import assert from 'node:assert/strict';
import {selectionRange,singleton,regionTargets,contains} from '../selection';
const basic=singleton('Data','B2');basic.focus={r:3,c:4};assert.deepEqual(selectionRange(basic,100,20),{s:{r:1,c:1},e:{r:3,c:4}});
const expanded=selectionRange(basic,100,20,[{s:{r:3,c:4},e:{r:6,c:6}},{s:{r:5,c:5},e:{r:8,c:8}}]);assert.deepEqual(expanded.e,{r:8,c:8});assert.ok(contains(expanded,'I9'));assert.ok(!contains(expanded,'J9'));
assert.deepEqual(selectionRange({...basic,mode:'rows'},100,20),{s:{r:1,c:0},e:{r:3,c:19}});assert.deepEqual(selectionRange({...basic,mode:'columns'},100,20),{s:{r:0,c:1},e:{r:99,c:4}});
assert.throws(()=>regionTargets({s:{r:0,c:0},e:{r:99999,c:99}},[]));assert.deepEqual(regionTargets({s:{r:0,c:0},e:{r:1,c:1}},[{s:{r:0,c:0},e:{r:0,c:1}}]),['A1','A2','B2']);
console.log('PASS Excel selection bounds, whole rows/columns, merge closure and atomic operation limit');
