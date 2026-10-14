<script setup lang="ts">
import type { Settings } from "@shared/contracts";
import UpdateCenter from '@/components/updates/UpdateCenter.vue';
import {defineAsyncComponent} from 'vue';
import {loadCodeAppearanceSettings} from '@/modules/text/settings';
const CodeAppearanceSettings=defineAsyncComponent(loadCodeAppearanceSettings);
defineProps<{ settings: Settings }>();
const emit = defineEmits<{ close: []; change: [value: Partial<Settings>] }>();
</script>
<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <section
      class="settings-panel"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
    >
      <header>
        <h2>设置</h2>
        <button aria-label="关闭设置" @click="emit('close')">×</button>
      </header>
      <div class="setting-row">
        <label for="theme">外观</label
        ><select
          id="theme"
          :value="settings.theme"
          @change="
            emit('change', {
              theme: ($event.target as HTMLSelectElement)
                .value as Settings['theme'],
            })
          "
        >
          <option value="light">白天</option>
          <option value="dark">黑夜</option>
          <option value="system">跟随系统</option>
        </select>
      </div>
      <CodeAppearanceSettings :value="settings.codeAppearance"/>
      <div class="setting-row">
        <label for="close-action">关闭首页时</label
        ><select
          id="close-action"
          :value="settings.closeAction"
          @change="
            emit('change', {
              closeAction: ($event.target as HTMLSelectElement)
                .value as Settings['closeAction'],
            })
          "
        >
          <option value="ask">每次询问</option>
          <option value="quit">退出软件</option>
          <option value="tray">隐藏到右下角托盘</option>
        </select>
      </div>
      <div class="setting-row">
        <label for="multi-mode">同时打开多个文件</label
        ><select
          id="multi-mode"
          :value="settings.multiFileMode"
          @change="
            emit('change', {
              multiFileMode: ($event.target as HTMLSelectElement)
                .value as Settings['multiFileMode'],
            })
          "
        >
          <option value="ask">下次打开时询问</option>
          <option value="tabs">一个窗口，标签切换</option>
          <option value="windows">每个文件一个窗口</option>
        </select>
      </div>
      <div class="setting-row">
        <label for="default-zoom">新文件默认缩放</label
        ><select
          id="default-zoom"
          :value="settings.defaultZoom"
          @change="
            emit('change', {
              defaultZoom: Number(($event.target as HTMLSelectElement).value),
            })
          "
        >
          <option
            v-for="value in [50, 75, 100, 125, 150, 200]"
            :key="value"
            :value="value"
          >
            {{ value }}%{{ value === 100 ? "（适配）" : "" }}
          </option>
        </select>
      </div>
      <div class="setting-row">
        <label for="maximize">预览窗口默认最大化</label
        ><input
          id="maximize"
          type="checkbox"
          :checked="settings.maximizePreview"
          @change="
            emit('change', {
              maximizePreview: ($event.target as HTMLInputElement).checked,
            })
          "
        />
      </div>
      <div class="setting-row">
        <label for="print-entry">点击“打印”时列表</label
        ><select
          id="print-entry"
          :value="settings.printEntry"
          @change="
            emit('change', {
              printEntry: ($event.target as HTMLSelectElement)
                .value as Settings['printEntry'],
            })
          "
        >
          <option value="all">本窗口全部可打印文件</option>
          <option value="current">仅当前文件</option>
          <option value="none">不自动加入（手动添加）</option>
        </select>
      </div>

      <div class="setting-row"><label for="check-updates">启动时检查新版本</label><input id="check-updates" type="checkbox" :checked="settings.checkUpdatesOnStart" @change="emit('change',{checkUpdatesOnStart:($event.target as HTMLInputElement).checked})"/></div>
      <UpdateCenter/>
      <p class="settings-help">常规设置自动保存；代码高亮外观点击“应用并保存”后生效。文件和预览记录不会保存。</p>
    </section>
  </div>
</template>
<style scoped>
.settings-panel>header{position:sticky;top:0;background:var(--panel);z-index:1}
</style>
