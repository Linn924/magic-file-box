import {ref,onMounted,onBeforeUnmount,nextTick,type Ref} from 'vue';
import type {PreviewFile} from '../../shared/contracts';
import {hasPendingFileEdits} from './pendingEdits';
export function useUpdateRestart(files:Ref<PreviewFile[]>){
  const locked=ref(false);let token='',remove:()=>void=()=>{},resume:()=>void=()=>{},focus:HTMLElement|undefined,selection:[number,number]|undefined;
  const key=(event:KeyboardEvent)=>{if(locked.value){event.preventDefault();event.stopImmediatePropagation();}};
  onMounted(()=>{window.addEventListener('keydown',key,true);remove=window.localPreview.onUpdatePrepare(value=>{token=value;focus=document.activeElement instanceof HTMLElement?document.activeElement:undefined;selection=focus instanceof HTMLTextAreaElement||focus instanceof HTMLInputElement&&focus.selectionStart!==null?[focus.selectionStart!,focus.selectionEnd!]:undefined;locked.value=true;window.localPreview.updatePrepared(token,{busy:hasPendingFileEdits(),notes:files.value.some(f=>!!f.view?.pdfNotes?.length)});});resume=window.localPreview.onUpdateResume(value=>{if(token===value){token='';locked.value=false;const target=focus,range=selection;void nextTick(()=>{if(target?.isConnected){target.focus({preventScroll:true});if(range&&(target instanceof HTMLTextAreaElement||target instanceof HTMLInputElement))target.setSelectionRange(...range);}});}});});
  onBeforeUnmount(()=>{remove();resume();window.removeEventListener('keydown',key,true);});return locked;
}
