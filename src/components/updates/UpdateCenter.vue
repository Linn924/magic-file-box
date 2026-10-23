<script setup lang="ts">
import {computed,watch,ref} from 'vue';
import {useUpdates} from '@/composables/useUpdates';
import {releaseNotesText} from './releaseNotes';
import {useNotificationTimeout} from '@/composables/useNotificationTimeout';
import NotificationCloseButton from '@/components/ui/NotificationCloseButton.vue';
import PopupTransition from '@/components/ui/PopupTransition.vue';
const props=defineProps<{notice?:boolean;suppressed?:boolean}>();const {state,visible,pending,act}=useUpdates(props.notice,()=>!props.suppressed);
watch(()=>props.suppressed,value=>{if(value)visible.value=false;});
const busy=computed(()=>['checking','downloading','installing'].includes(state.value.phase)),downloadable=computed(()=>state.value.phase==='available'||state.value.phase==='error'&&state.value.retry==='download');
const mb=(n:number)=>(n/1024/1024).toFixed(1)+' MB';
const notes=computed(()=>releaseNotesText(state.value.notes||''));
const element=ref<HTMLElement>();
const timeoutEvents=useNotificationTimeout({element,visible:()=>!!props.notice&&visible.value&&!props.suppressed,content:()=>JSON.stringify([state.value.phase,state.value.version,state.value.message,notes.value]),dismiss:()=>{visible.value=false;}});
</script>
<template><PopupTransition notice :disabled="!notice"><section ref="element" v-if="!notice||visible&&!suppressed" class="update-center" :class="{'update-notice':notice}" aria-label="软件更新" role="region" v-on="timeoutEvents">
  <header><strong>软件更新</strong><span>当前 {{state.currentVersion}}</span><NotificationCloseButton v-if="notice" class="update-dismiss" label="关闭更新提示" title="关闭更新提示；可在设置中继续更新" @click="visible=false"/></header>
  <p v-if="state.version">新版本 {{state.version}}</p><p class="update-message" role="status">{{state.message}}</p>
  <details v-if="notes"><summary>更新说明</summary><pre>{{notes}}</pre></details>
  <div v-if="state.phase==='downloading'"><progress :value="state.progress" max="100" aria-label="更新下载进度"></progress><small>{{Math.floor(state.progress)}}% · {{mb(state.transferred)}} / {{mb(state.total)}}</small></div>
  <footer><button class="update-check" :disabled="pending||busy||state.phase==='downloaded'||state.phase==='unsupported'" @click="act('check')">{{state.phase==='checking'?'检查中…':'检查更新'}}</button><button v-if="downloadable" class="update-download" :disabled="pending" @click="act('download')">下载更新</button><button v-if="state.phase==='downloading'" class="update-cancel" @click="act('cancel')">取消下载</button><button v-if="state.phase==='downloaded'" class="update-install" :disabled="pending" @click="act('install')">重启并更新</button><button v-if="notice&&!busy" @click="visible=false">稍后</button></footer>
</section></PopupTransition></template>
<style scoped>
.update-center{border-top:1px solid var(--line);padding-top:12px;margin-top:12px;min-width:0}.update-center header,.update-center footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.update-center header span{color:var(--muted);margin-left:auto;font-size:12px}.update-center p{margin:8px 0;line-height:1.5}.update-center pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto;font:inherit;font-size:12px}.update-center progress{width:100%;height:10px}.update-center small{display:block;margin:4px 0 10px;color:var(--muted)}.update-center footer{margin-top:10px}.update-notice{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px;margin:0;box-shadow:0 4px 20px #0003}.update-message{font-size:13px}
</style>
