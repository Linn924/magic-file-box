<script setup lang="ts">
import {computed,ref,onMounted,onBeforeUnmount,watch} from 'vue';
import type {PreviewFile} from '@shared/files';
import ToolButton from '@/components/ui/ToolButton.vue';
import PreviewPanel from '@/components/preview/PreviewPanel.vue';
import {fileSize} from '@/utils/formatters';
import {imageExif} from '../core/exif';
import {pixelAt,sampledColor} from '../core/colorSample';
const props=defineProps<{file:PreviewFile;rotation:number;target:string;size:{width:number;height:number};header?:Uint8Array;previewPixels?:boolean}>();
const root=ref<HTMLElement>(),infoOpen=ref(false),picking=ref(false),error=ref(''),sample=ref<ReturnType<typeof sampledColor>&{x:number;y:number}>();
const fields=computed(()=>imageExif(props.header??props.file.bytes));
let pane:HTMLElement|undefined;const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
const context=canvas.getContext('2d',{willReadFrequently:true});
function target(){return pane?.querySelector<HTMLImageElement|HTMLCanvasElement>(props.target);}
function pick(event:PointerEvent){
  if(!picking.value||event.button!==0)return;const image=target();if(!image||!(event.target instanceof Node)||!image.contains(event.target))return;
  event.preventDefault();event.stopImmediatePropagation();error.value='';
  const pixels=image instanceof HTMLImageElement?{width:image.naturalWidth,height:image.naturalHeight}:{width:image.width,height:image.height},style=getComputedStyle(image);
  const point=pixelAt({x:event.clientX,y:event.clientY},image.getBoundingClientRect(),{width:parseFloat(style.width),height:parseFloat(style.height)},pixels,props.rotation);
  if(!point||!context)return;
  try{context.clearRect(0,0,1,1);context.drawImage(image,point.x,point.y,1,1,0,0,1,1);sample.value={...point,...sampledColor(context.getImageData(0,0,1,1).data)};}
  catch{error.value='此图片无法读取像素颜色。';}
}
function key(event:KeyboardEvent){if(event.key==='Escape'&&picking.value&&pane?.clientWidth){event.preventDefault();event.stopImmediatePropagation();picking.value=false;}}
watch(picking,value=>{pane?.classList.toggle('image-picking',value);error.value='';});
onMounted(()=>{pane=root.value?.closest<HTMLElement>('.image-pane')??undefined;pane?.addEventListener('pointerdown',pick,true);window.addEventListener('keydown',key,true);});
onBeforeUnmount(()=>{pane?.removeEventListener('pointerdown',pick,true);pane?.classList.remove('image-picking');window.removeEventListener('keydown',key,true);canvas.width=canvas.height=0;});
</script>
<template>
  <div ref="root" class="image-inspection">
    <Teleport :to="`[data-file-id='${file.id}'] .module-tools`" defer><span class="preview-tool-group"><ToolButton class="image-info-toggle" icon="note" title="图片信息与 EXIF" :pressed="infoOpen" @click="infoOpen=!infoOpen"/><ToolButton class="image-color-toggle" icon="pipette" title="颜色取样（点击图片，Esc 退出）" :pressed="picking" @click="picking=!picking"/></span></Teleport>
    <PreviewPanel v-model:open="infoOpen" title="图片信息" :target="`[data-file-id='${file.id}'] .floating-tools`" trigger=".image-info-toggle" close-label="关闭图片信息"><dl class="image-info"><dt>文件</dt><dd>{{file.name}}</dd><dt>格式</dt><dd>{{file.ext.toUpperCase()}}</dd><dt>大小</dt><dd>{{fileSize(file.size)}}</dd><dt>预览尺寸</dt><dd>{{size.width}} × {{size.height}}</dd><template v-for="field in fields" :key="field.label"><dt>{{field.label}}</dt><dd>{{field.value}}</dd></template></dl><p v-if="!fields.length" class="image-info-empty">未检测到可读取的 EXIF 信息。</p></PreviewPanel>
    <div v-if="picking||sample||error" class="image-color-result" role="status"><span v-if="picking">点击图片取色，Esc 退出</span><template v-if="sample"><span class="image-color-swatch" :style="{background:sample.hex}" aria-hidden="true"></span><input :value="sample.hex" readonly aria-label="取样颜色值" title="选择颜色值后可复制" @focus="($event.target as HTMLInputElement).select()"/><span>{{sample.rgb}} · A {{sample.alpha}} · {{previewPixels?'预览像素':'像素'}} {{sample.x}}, {{sample.y}}</span></template><span v-if="error" role="alert">{{error}}</span></div>
  </div>
</template>
