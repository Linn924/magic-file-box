<script setup lang="ts">
import {ref,shallowRef,computed,onMounted,onBeforeUnmount} from 'vue';
import type {PreviewProps} from '@/modules/types';
import {openFileSource,fileSourceError} from '@/services/fileSource';
import {usePreviewTask} from '@/composables/usePreviewTask';
import SourceAsset from '@/components/preview/SourceAsset.vue';
import RecordPreview from '@/components/preview/RecordPreview.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import {createSafeResizeObserver} from '@/utils/safeResizeObserver';
import {fitScale} from '@/utils/fit';
const props=defineProps<PreviewProps>(),emit=defineEmits<{ready:[];error:[message:string]}>(),task=usePreviewTask();
const area=ref<HTMLElement>(),source=shallowRef<Awaited<ReturnType<typeof openFileSource>>>(),available=ref({width:600,height:400}),rotation=ref(props.file.view?.image?.rotate??0);
let resize:ResizeObserver|undefined,disposed=false;
const decoded=ref<{width:number;height:number}>();
const dimensions=computed(()=>decoded.value??({width:source.value?.info.width??1,height:source.value?.info.height??1}));
function rendered(size:{width:number;height:number}){decoded.value=size;emit('ready');}
const geometry=computed(()=>{
  const {width,height}=dimensions.value,quarter=rotation.value%180!==0;
  const factor=fitScale(quarter?height:width,quarter?width:height,available.value.width,available.value.height,props.fitMode??'original',Math.min(1,available.value.width/(quarter?height:width),available.value.height/(quarter?width:height)))*props.zoom/100;
  return {width:width*factor,height:height*factor,frameWidth:(quarter?height:width)*factor,frameHeight:(quarter?width:height)*factor};
});
function rotate(){rotation.value=(rotation.value+90)%360 as 0|90|180|270;props.file.view??={zoom:props.zoom,scroll:[]};props.file.view.image={rotate:rotation.value as 0|90|180|270,originalPixels:false};}
onMounted(async()=>{
  if(props.file.source?.kind==='text')return;
  const measure=()=>{if(area.value)available.value={width:Math.max(1,area.value.clientWidth-40),height:Math.max(1,area.value.clientHeight-40)};};measure();resize=createSafeResizeObserver(measure);if(area.value)resize.observe(area.value);
  try{source.value=await openFileSource(props.file,task.signal);if(disposed){void source.value.close();return;}task.report('rendering');}catch(error){if(!disposed&&!task.signal.aborted)emit('error',fileSourceError(error));}
});
onBeforeUnmount(()=>{disposed=true;resize?.disconnect();void source.value?.close();});
</script>
<template>
  <RecordPreview v-if="file.source?.kind==='text'" :file="file" :zoom="zoom" layout="text" notice="大型 SVG 按源码读取，避免整体生成图形节点；文件中的脚本与外部资源不会执行。" @ready="emit('ready')" @error="emit('error',$event)"/>
  <section v-else class="image-pane">
    <Teleport :to="`[data-file-id='${file.id}'] .module-tools`" defer><ToolButton class="large-image-rotate" icon="rotate" title="旋转图片" @click="rotate"/></Teleport>
    <p class="notice">大图片从源文件读取，以最多 600 万像素的缩小图显示；保留缩放和旋转，此模式不提供原始像素编辑或打印。解码受 6400 万像素预算保护。</p>
    <div ref="area" class="image"><div class="image-frame" :style="{width:geometry.frameWidth+'px',height:geometry.frameHeight+'px'}"><SourceAsset v-if="source?.info.url" class="large-image-preview preview-content" :url="source.info.url" :file-id="file.id" :max-pixels="6_000_000" eager :style="{position:'absolute',left:'50%',top:'50%',width:geometry.width+'px',height:geometry.height+'px',minHeight:'0',maxWidth:'none',margin:0,transform:`translate(-50%, -50%) rotate(${rotation}deg)`}" @rendered="rendered" @error="emit('error',$event)"/></div></div>
    <footer class="pane-footer">{{dimensions.width}} × {{dimensions.height}} · 缩小图预览</footer>
  </section>
</template>
