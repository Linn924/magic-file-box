import assert from 'node:assert/strict';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {destinationPoint,resolvePdfDestination,type PdfReadingPosition} from '../core/destination';
const viewport={viewBox:[10,20,610,820],convertToViewportPoint:(x:number,y:number)=>[x-10,820-y]} as PdfReadingPosition['viewport'];
for(const [dest,point] of [
  [[0,{name:'XYZ'},50,700,4],[40,120]],[[0,{name:'XYZ'},null,null,null],[0,0]],
  [[0,{name:'FitH'},650],[0,170]],[[0,{name:'FitBH'},650],[0,170]],
  [[0,{name:'FitV'},80],[70,0]],[[0,{name:'FitBV'},80],[70,0]],
  [[0,{name:'FitR'},50,200,150,500],[40,320]],[[0,{name:'Fit'}],[0,0]],[[0,{name:'FitB'}],[0,0]],
] as Array<[unknown[],number[]]>)assert.deepEqual(destinationPoint(dest,viewport),point);
const rotated={...viewport,convertToViewportPoint:(x:number,y:number)=>[y-20,x-10]} as PdfReadingPosition['viewport'];
assert.deepEqual(destinationPoint([0,{name:'XYZ'},50,700,null],rotated),[680,40]);
assert.deepEqual(destinationPoint([0,{name:'FitR'},50,200,150,500],rotated),[180,40]);
const doc={numPages:3,getDestination:async(name:string)=>name==='valid'?[{num:7,gen:0},{name:'FitH'},500]:null,getPageIndex:async(ref:{num:number})=>{if(ref.num===7)return 1;throw Error('Unknown page reference');}} as unknown as PDFDocumentProxy;
assert.equal((await resolvePdfDestination(doc,'valid'))?.page,2);
assert.equal((await resolvePdfDestination(doc,[0,{name:'Fit'}]))?.page,1);
for(const value of ['missing',null,[],[-1,{name:'Fit'}],[3,{name:'Fit'}],[{num:999,gen:0},{name:'Fit'}]])assert.equal(await resolvePdfDestination(doc,value),undefined);
console.log('PASS PDF destination modes, crop and rotation coordinates, named/ref targets and invalid-link fallback');
