<script setup lang="ts">
import {ref, onMounted} from 'vue';
import type {ExclusiveState} from '@shared/exclusive';
import {EXCLUSIVE_KEY_LIMIT} from '@shared/exclusive';
const key = ref(''), busy = ref(false), message = ref('');
const state = ref<ExclusiveState>({active:false,pendingRestart:false,canActivate:false});
onMounted(async()=>{try{state.value=await window.localPreview.getExclusiveState();}catch{message.value='专属设置暂不可用。';}});
async function update(clear=false) {
  if(busy.value) return;
  busy.value=true;message.value='';
  try {
    state.value=clear?await window.localPreview.clearExclusiveKey():await window.localPreview.activateExclusiveKey(key.value);
    key.value='';message.value=state.value.pendingRestart?'已保存，重启软件后生效。':'设置已保存。';
  } catch(error) {
    const detail=error instanceof Error?error.message:'';
    const messages=['KEY 无效或与本软件不匹配。','本机安全存储不可用，无法保存专属设置。','专属设置保存失败，请重试。','专属设置清除失败，请重试。'];
    message.value=messages.find(value=>detail.includes(value))||'操作未完成，请重试。';
  }
  finally {busy.value=false;}
}
</script>
<template>
  <section class="exclusive-settings" aria-label="专属">
    <h3>专属</h3>
    <p class="exclusive-status">{{state.active?'已启用专属服务':'当前使用标准服务'}}<span v-if="state.subject"> · {{state.subject}}</span></p>
    <form @submit.prevent="update()">
      <label for="exclusive-key">专属 KEY</label>
      <input id="exclusive-key" v-model="key" type="password" :maxlength="EXCLUSIVE_KEY_LIMIT" autocomplete="off" spellcheck="false" placeholder="粘贴你的专属 KEY" :disabled="busy||!state.canActivate" />
      <div class="exclusive-actions"><button class="exclusive-confirm" type="submit" :disabled="busy||!state.canActivate||!key.trim()">确认</button><button class="exclusive-clear" type="button" :disabled="busy" @click="update(true)">恢复标准服务</button></div>
    </form>
    <p v-if="state.pendingRestart" class="exclusive-pending">更改将在重启软件后生效。</p>
    <p v-if="!state.canActivate" class="exclusive-storage">本机安全存储不可用。</p>
    <p class="exclusive-message" role="status">{{message}}</p>
  </section>
</template>
<style scoped>
.exclusive-settings{border-top:1px solid var(--line);padding-top:12px;margin-top:12px;min-width:0}.exclusive-settings h3{font-size:14px;margin:0 0 8px}.exclusive-status,.exclusive-pending,.exclusive-storage,.exclusive-message{font-size:12px;line-height:1.5;overflow-wrap:anywhere;color:var(--muted);margin:6px 0}.exclusive-settings form{display:flex;flex-direction:column;gap:6px}.exclusive-settings label{font-size:12px}.exclusive-settings input{box-sizing:border-box;width:100%;min-width:0;padding:6px}.exclusive-actions{display:flex;flex-wrap:wrap;gap:8px}.exclusive-message{color:var(--text)}
</style>
