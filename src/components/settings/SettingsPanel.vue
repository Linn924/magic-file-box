<script setup lang="ts">
import type { Settings } from "@shared/contracts";
import UpdateCenter from '@/components/updates/UpdateCenter.vue';
import {defineAsyncComponent, onBeforeUnmount, onMounted, ref} from 'vue';
import ExclusiveSettings from '@/components/exclusive/ExclusiveSettings.vue';
import {loadCodeAppearanceSettings} from '@/modules/text/settings';
const CodeAppearanceSettings=defineAsyncComponent(loadCodeAppearanceSettings);
defineProps<{ settings: Settings }>();
const emit = defineEmits<{ close: []; change: [value: Partial<Settings>] }>();
const groups = [
  {id: 'appearance', label: '外观'},
  {id: 'windows', label: '窗口与文件'},
  {id: 'printing', label: '打印'},
  {id: 'updates', label: '软件更新'},
  {id: 'exclusive', label: '专属服务'},
] as const;
type GroupId = typeof groups[number]['id'];
const content = ref<HTMLElement>();
const activeGroup = ref<GroupId>('appearance');
let resizeObserver: ResizeObserver | undefined;

function updateActiveGroup() {
  const scroller = content.value;
  if (!scroller) return;
  const top = scroller.getBoundingClientRect().top + parseFloat(getComputedStyle(scroller).paddingTop) + 4;
  let current: GroupId = 'appearance';
  for (const group of groups) {
    const section = scroller.querySelector<HTMLElement>('#settings-' + group.id);
    if (section && section.getBoundingClientRect().top <= top) current = group.id;
    else break;
  }
  activeGroup.value = current;
}

function navigate(id: GroupId) {
  const scroller = content.value;
  const section = scroller?.querySelector<HTMLElement>('#settings-' + id);
  if (!scroller || !section) return;
  const top = scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    - parseFloat(getComputedStyle(scroller).paddingTop);
  scroller.scrollTo({top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
}

onMounted(() => {
  if (!content.value) return;
  resizeObserver = new ResizeObserver(updateActiveGroup);
  resizeObserver.observe(content.value);
  content.value.querySelectorAll('.settings-group').forEach(section => resizeObserver!.observe(section));
  updateActiveGroup();
});
onBeforeUnmount(() => resizeObserver?.disconnect());
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
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="设置分组">
          <button v-for="group in groups" :key="group.id" type="button"
            :aria-controls="'settings-' + group.id"
            :aria-current="activeGroup === group.id ? 'location' : undefined"
            @click="navigate(group.id)">{{ group.label }}</button>
        </nav>
        <div ref="content" class="settings-content" tabindex="0" aria-label="全部设置" @scroll.passive="updateActiveGroup">
          <section id="settings-appearance" class="settings-group" aria-labelledby="settings-appearance-title">
            <h3 id="settings-appearance-title">外观</h3>
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
          </section>
          <section id="settings-windows" class="settings-group" aria-labelledby="settings-windows-title">
            <h3 id="settings-windows-title">窗口与文件</h3>
            <div class="setting-row">
              <label for="open-home-action">打开文件时隐藏主页到托盘</label>
              <select id="open-home-action" :value="settings.openHomeAction"
                @change="emit('change', {openHomeAction: ($event.target as HTMLSelectElement).value as Settings['openHomeAction']})">
                <option value="ask">每次询问</option>
                <option value="tray">始终隐藏</option>
                <option value="keep">不隐藏</option>
              </select>
            </div>
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
          </section>
          <section id="settings-printing" class="settings-group" aria-labelledby="settings-printing-title">
            <h3 id="settings-printing-title">打印</h3>
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

          </section>
          <section id="settings-updates" class="settings-group" aria-label="软件更新">
            <UpdateCenter/>
            <div class="setting-row"><label for="check-updates">启动时检查新版本</label><input id="check-updates" type="checkbox" :checked="settings.checkUpdatesOnStart" @change="emit('change',{checkUpdatesOnStart:($event.target as HTMLInputElement).checked})"/></div>
          </section>
          <section id="settings-exclusive" class="settings-group" aria-label="专属服务">
            <ExclusiveSettings />
          </section>
        </div>
      </div>
      <footer class="settings-footer"><p class="settings-help">常规设置自动保存；代码高亮外观点击“应用并保存”后生效。文件和预览记录不会保存。</p></footer>
    </section>
  </div>
</template>
