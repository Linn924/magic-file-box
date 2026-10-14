import {ref,watch,computed,onBeforeUnmount} from 'vue';
import type {PreviewFile,PdfTemporaryMark} from '@shared/contracts';

import {mergeNoteRects,rotateNoteRect} from '../core/annotationGeometry';

type Rect=PdfTemporaryMark['rects'][number];
export function useAnnotations(file:PreviewFile){
 const notes=ref<PdfTemporaryMark[]>(file.view?.pdfNotes?.map(mark=>({...mark,rects:mark.rects.map(rect=>({...rect}))}))||[]);
 const pending=ref<{page:number;quote:string;rotation:PdfTemporaryMark['rotation'];rects:Rect[]}|null>(null);
 function persist(value=notes.value){
  file.view??={zoom:100,scroll:[]};
  file.view.pdfNotes=value.map(mark=>({...mark,rects:mark.rects.map(rect=>({...rect}))}));
 }
 watch(notes,persist,{deep:true,flush:'pre'});
 onBeforeUnmount(()=>persist());
 function capture(root:HTMLElement|null,rotation:PdfTemporaryMark['rotation']){
  const selection=window.getSelection();
  if(!root||!selection||selection.isCollapsed){pending.value=null;return;}
  const element=(node:Node|null)=>node instanceof Element?node:node?.parentElement;
  const anchor=element(selection.anchorNode),focus=element(selection.focusNode);
  const page=anchor?.closest<HTMLElement>('.pdf-page');
  if(!page||!root.contains(page)||focus?.closest('.pdf-page')!==page||!anchor?.closest('.pdf-text-layer')){
   pending.value=null;return;
  }
  const box=page.getBoundingClientRect();
  const rects=Array.from(selection.getRangeAt(0).getClientRects()).flatMap(rect=>{
   const x0=Math.max(rect.left,box.left),x1=Math.min(rect.right,box.right);
   const y0=Math.max(rect.top,box.top),y1=Math.min(rect.bottom,box.bottom);
   return x1-x0>2&&y1-y0>2?[{x:(x0-box.left)/box.width,y:(y0-box.top)/box.height,width:(x1-x0)/box.width,height:(y1-y0)/box.height}]:[];
  });
  const quote=selection.toString().trim().slice(0,240);
  const index=Number(page.dataset.page);
  pending.value=rects.length&&quote&&Number.isFinite(index)?{page:index+1,quote,rotation,rects:mergeNoteRects(rects,2/box.width,2/box.height)}:null;
 }
 function add(kind:PdfTemporaryMark['kind']){
  if(!pending.value)return;
  notes.value.push({id:crypto.randomUUID(),...pending.value,content:'',kind});
  pending.value=null;
  window.getSelection()?.removeAllRanges();
 }
 function remove(id:string){notes.value=notes.value.filter(note=>note.id!==id);}
 const byPage=computed(()=>{const map=new Map<number,PdfTemporaryMark[]>();for(const note of notes.value){let page=map.get(note.page);if(!page){page=[];map.set(note.page,page);}page.push(note);}return map;});
 const onPage=(page:number)=>byPage.value.get(page)||[];
 function rectStyle(mark:PdfTemporaryMark,rect:Rect,rotation:PdfTemporaryMark['rotation']){
  const converted=rotateNoteRect(rect,mark.rotation,rotation);
  return {left:converted.x*100+'%',top:converted.y*100+'%',width:converted.width*100+'%',height:converted.height*100+'%'};
 }
 return {notes,pending,capture,add,remove,onPage,rectStyle};
}
