import {onBeforeUnmount,onMounted,ref,watch,type Ref} from 'vue';

/** Space + left drag and middle-button drag pan the PDF scroll surface. */
export function usePan(scroll:Ref<HTMLElement|undefined>,enabled:Ref<boolean>=ref(true)){
 const panning=ref(false);
 let spaceHeld=false;
 let pointer=-1;
 let bound:HTMLElement|undefined;
 let stopWatching:(()=>void)|undefined;
 let origin={x:0,y:0,left:0,top:0};
 const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&
  !!target.closest('input,textarea,select,button,[contenteditable="true"]');
 const down=(event:PointerEvent)=>{
  const root=scroll.value;
  if(!enabled.value||!root||!(event.button===1||(spaceHeld&&event.button===0)))return;
  event.preventDefault();
  pointer=event.pointerId;
  origin={x:event.clientX,y:event.clientY,left:root.scrollLeft,top:root.scrollTop};
  panning.value=true;
  root.setPointerCapture(pointer);
 };
 const move=(event:PointerEvent)=>{
  if(!panning.value||event.pointerId!==pointer||!scroll.value)return;
  scroll.value.scrollLeft=origin.left-(event.clientX-origin.x);
  scroll.value.scrollTop=origin.top-(event.clientY-origin.y);
 };
 const up=(event:PointerEvent)=>{
  if(event.pointerId!==pointer)return;
  if(scroll.value?.hasPointerCapture(pointer))scroll.value.releasePointerCapture(pointer);
  pointer=-1;panning.value=false;
 };
 const keydown=(event:KeyboardEvent)=>{
  if(enabled.value&&!event.defaultPrevented&&event.code==='Space'&&!editable(event.target)&&!event.ctrlKey&&!event.altKey&&!event.metaKey){
   spaceHeld=true;event.preventDefault();scroll.value?.classList.add('pan-ready');
  }
 };
 const keyup=(event:KeyboardEvent)=>{
  if(event.code==='Space'){spaceHeld=false;scroll.value?.classList.remove('pan-ready');}
 };
 const blur=()=>{spaceHeld=false;scroll.value?.classList.remove('pan-ready');pointer=-1;panning.value=false;};
 function bind(root:HTMLElement|undefined){
  if(bound){
   bound.removeEventListener('pointerdown',down);
   bound.removeEventListener('pointermove',move);
   bound.removeEventListener('pointerup',up);
   bound.removeEventListener('pointercancel',up);
   bound.removeEventListener('auxclick',preventAux);
  }
  bound=root;
  root?.addEventListener('pointerdown',down);
  root?.addEventListener('pointermove',move);
  root?.addEventListener('pointerup',up);
  root?.addEventListener('pointercancel',up);
  root?.addEventListener('auxclick',preventAux);
  if(spaceHeld)root?.classList.add('pan-ready');
 }
 watch(enabled,value=>{if(!value)blur();});
 onMounted(()=>{
  stopWatching=watch(scroll,root=>bind(root),{immediate:true,flush:'post'});
  window.addEventListener('keydown',keydown);
  window.addEventListener('keyup',keyup);
  window.addEventListener('blur',blur);
 });
 function preventAux(event:MouseEvent){if(event.button===1)event.preventDefault();}
 onBeforeUnmount(()=>{
  stopWatching?.();
  bind(undefined);
  window.removeEventListener('keydown',keydown);
  window.removeEventListener('keyup',keyup);
  window.removeEventListener('blur',blur);
 });
 return {panning};
}
