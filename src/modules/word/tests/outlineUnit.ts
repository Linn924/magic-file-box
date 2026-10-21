import assert from 'node:assert/strict';
import {markDocxHeadings} from '../core/outline';
const paragraphs: Array<{type: string; styleName?: string; outlineLevel?: number; cssStyle?: Record<string,string>}> = [
  {type:'paragraph',styleName:'Derived'}, {type:'paragraph',styleName:'Heading1',outlineLevel:2},
  {type:'paragraph',styleName:'Heading1',outlineLevel:9}, {type:'paragraph',styleName:'Localized'},
  {type:'paragraph',styleName:'CycleA'}, {type:'paragraph'},
];
markDocxHeadings({stylesPart:{styles:[
  {id:'Heading1',paragraphProps:{outlineLevel:0}}, {id:'Derived',basedOn:'Heading1'},
  {id:'Localized',name:'标题 2'}, {id:'CycleA',basedOn:'CycleB'}, {id:'CycleB',basedOn:'CycleA'},
]},documentPart:{body:{children:paragraphs}}});
assert.deepEqual(paragraphs.map(p=>p.cssStyle?.['$data-word-heading-level']),['1','3',undefined,'2',undefined,undefined]);
assert.deepEqual(paragraphs.filter(p=>p.cssStyle).map(p=>p.cssStyle?.['$data-word-heading-id']),['word-heading-0','word-heading-1','word-heading-2']);
console.log('PASS DOCX outline levels, inherited/localized headings, body overrides and cyclic style protection');
