import assert from 'node:assert/strict';
import type {PDFPageProxy} from 'pdfjs-dist';
import {outlineTitleDestinations} from '../core/outlineTitle';
import type {PdfDestination,PdfReadingPosition} from '../core/destination';

type Content=Awaited<ReturnType<PDFPageProxy['getTextContent']>>;
type Item=Extract<Content['items'][number],{str:string}>;
const viewport={convertToViewportPoint:(x:number,y:number)=>[x-10,1000-y],convertToPdfPoint:(x:number,y:number)=>[x+10,1000-y]} as PdfReadingPosition['viewport'];
const item=(str:string,x:number,y:number,hasEOL=false):Item=>({str,transform:[20,0,0,20,x,y],width:str.length*10,height:20,fontName:'f',dir:'ltr',hasEOL});
const content=(items:Item[]):Content=>({items,styles:{f:{fontFamily:'sans-serif',ascent:.8,descent:-.2,vertical:false}},lang:null});
const target=(title:string):PdfDestination=>({title,page:2,dest:[1,{name:'FitH'},850],key:title});
const parent=target('4.1　父章节'),child=target('4.1.1　程序式标记：自动化程度100%，可控程度0%');
const text=content([item('4.1',40,800),item('父章节',90,800,true),item('4.1.1',40,300),item('程序式标记',110,300),item('：自动化程度100%，可控程度0%',170,300,true)]);
const [resolvedParent,resolvedChild]=outlineTitleDestinations([parent,child],text,viewport);
assert.deepEqual(resolvedParent.dest,[1,{name:'XYZ'},40,816,null]);
assert.deepEqual(resolvedChild.dest,[1,{name:'XYZ'},40,316,null]);
assert.deepEqual(parent.dest,[1,{name:'FitH'},850]);
assert.equal(resolvedChild.key,child.key);assert.equal(resolvedChild.titleResolved,true);
const wrapped=target('2.3 Wrapped heading across lines');
assert.deepEqual(outlineTitleDestinations([wrapped],content([item('2.3 Wrapped heading',40,700,true),item('across lines',70,672,true)]),viewport)[0].dest,[1,{name:'XYZ'},40,716,null]);
for(const source of [content([]),content([item('A paragraph mentions '+parent.title,40,800,true)]),content([item(parent.title!,40,800,true),item(parent.title!,40,200,true)]),content([item('4.1',40,800,true),item('父章节',40,100,true)]),content(Array.from({length:20001},()=>item('x',40,800,true)))]){
  assert.deepEqual(outlineTitleDestinations([parent],source,viewport)[0].dest,parent.dest);
}
assert.deepEqual(outlineTitleDestinations([target('2.3 title')],content([item('2.3',40,700,true),item('title',350,672,true)]),viewport)[0].dest,[1,{name:'FitH'},850]);
console.log('PASS duplicated bookmark coordinates, full split/normalized titles, wrapped headings, crop coordinates, ambiguity and bounded fallback');
