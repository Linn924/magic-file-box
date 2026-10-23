<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount,watch} from 'vue';
import {reserveSourcePixels} from '@/services/sourcePixels';
import {usePreviewTask} from '@/composables/usePreviewTask';
const props=withDefaults(defineProps<{url:string;fileId:string;maxPixels?:number;eager?:boolean}>(),{maxPixels:1_000_000,eager:false});
const emit=defineEmits<{rendered:[size:{width:number;height:number}];error:[message:string]}>();
const root=ref<HTMLElement>(),canvas=ref<HTMLCanvasElement>(),status=ref('图片等待显示'),ratio=ref('');
const task=usePreviewTask();let observer:IntersectionObserver|undefined,visible=false,disposed=false,serial=0,image:HTMLImageElement|undefined,rejectImage:((error:Error)=>void)|undefined,lease:string|undefined,reservation:ReturnType<typeof reserveSourcePixels>|undefined;
function clear(){serial++;rejectImage?.(new DOMException('已取消图片读取。','AbortError'));rejectImage=undefined;if(image){image.onload=null;image.onerror=null;image.src='';image=undefined;}if(lease){void window.localPreview.releasePreviewParser(lease).catch(()=>{});lease=undefined;}reservation?.release();reservation=undefined;if(canvas.value){canvas.value.width=1;canvas.value.height=1;}}
async function load(){
  if(disposed||!visible)return;clear();const generation=serial,token=crypto.randomUUID();lease=token;status.value='正在加载…';
  const release=task.hold?.();
  try{
    task.signal.throwIfAborted();
    if(!await window.localPreview.acquirePreviewParser(props.fileId,token))return;
    if(disposed||generation!==serial)return;
    const img=new Image();image=img;
    await new Promise<void>((resolve,reject)=>{rejectImage=reject;img.onload=()=>{rejectImage=undefined;resolve();};img.onerror=()=>{rejectImage=undefined;reject(Error('图片无法显示或超出解码预算。'));};img.src=props.url;});
    if(disposed||generation!==serial)return;
    if(img.naturalWidth*img.naturalHeight>64_000_000)throw Error('图片超过解码像素预算。');
    reservation=reserveSourcePixels(Math.min(props.maxPixels,img.naturalWidth*img.naturalHeight));
    const scale=Math.min(1,Math.sqrt(reservation.pixels/(img.naturalWidth*img.naturalHeight))),target=canvas.value!;
    target.width=Math.max(1,Math.floor(img.naturalWidth*scale));target.height=Math.max(1,Math.floor(img.naturalHeight*scale));
    const context=target.getContext('2d');if(!context)throw Error('无法创建图片预览画布。');
    context.drawImage(img,0,0,target.width,target.height);ratio.value=img.naturalWidth+'/'+img.naturalHeight;status.value='';
    const size={width:img.naturalWidth,height:img.naturalHeight};img.onload=null;img.onerror=null;img.src='';image=undefined;emit('rendered',size);
  }catch(error){if(generation===serial&&!disposed&&!task.signal.aborted){if(image){image.onload=null;image.onerror=null;image.src='';image=undefined;}reservation?.release();reservation=undefined;if(canvas.value){canvas.value.width=1;canvas.value.height=1;}status.value=error instanceof Error?error.message:'图片无法显示。';emit('error',status.value);}}
  finally{release?.();void window.localPreview.releasePreviewParser(token).catch(()=>{});if(lease===token)lease=undefined;}
}
const abort=()=>clear();task.signal.addEventListener('abort',abort,{once:true});
onMounted(()=>{
  if(props.eager){visible=true;void load();return;}
  observer=new IntersectionObserver(entries=>{const active=entries.some(entry=>entry.isIntersecting);if(active===visible)return;visible=active;if(active)void load();else{clear();status.value='图片按需显示';}},{root:root.value?.closest('.source-scroll'),rootMargin:'160px'});observer.observe(root.value!);
});
watch(()=>props.url,()=>{if(visible)void load();});
onBeforeUnmount(()=>{disposed=true;observer?.disconnect();clear();task.signal.removeEventListener('abort',abort);});
</script>
<template><div ref="root" class="source-asset" :style="ratio?{aspectRatio:ratio}:undefined"><canvas ref="canvas" width="1" height="1" :aria-label="status||'文档图片预览'"/><small v-if="status" role="status">{{status}}</small></div></template>
<style scoped>.source-asset{position:relative;display:block;width:min(600px,100%);min-height:100px;max-width:100%;margin:8px 0;background:var(--well)}canvas{display:block;width:100%;height:100%;object-fit:contain}.source-asset small{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:90%;font-size:12px;color:var(--muted);text-align:center}</style>
