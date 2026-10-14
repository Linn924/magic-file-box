<script setup lang="ts">
import { onMounted, onBeforeUnmount, provide, ref, shallowRef, nextTick } from "vue";
import { useImmersive } from "./composables/useImmersive";
import {useTabStrip} from './composables/useTabStrip';
import {waitForFileEdits} from './composables/pendingEdits';
import ToolbarIcon from './components/ToolbarIcon.vue';
import PreviewTab from "./components/PreviewTab.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import {edition,homeIntro} from "./edition";
import UpdateCenter from './components/UpdateCenter.vue';
import {useUpdateRestart} from './composables/useUpdateRestart';
import { defaults, type Settings, type PreviewFile } from "../shared/contracts";
document.documentElement.dataset.edition=edition;
const isPreview = new URLSearchParams(location.search).has("preview");
const immersive = useImmersive(isPreview);
const files = shallowRef<PreviewFile[]>([]);
const updateLocked=useUpdateRestart(files);
const active = ref("");
const settings = ref<Settings>({ ...defaults });
const showSettings = ref(false);
const error = ref("");
const dragging = ref(false);
let dragDepth = 0;
let draggedTab = "";
const tabMime = "application/x-file-preview-tab";
const cleanups: Array<() => void> = [];
const mainEl = ref<HTMLElement>();
const tabsNav = ref<HTMLElement>();
const tabbar = ref<HTMLElement>();
const {overflow:tabsOverflow}=useTabStrip(tabbar,tabsNav,files,()=>{void alignActiveTab('nearest');});
/** Next active-tab scroll policy: center for wheel, nearest for click/close. */
let tabAlignMode: "center" | "nearest" = "nearest";
provide("previewFiles", files);
async function alignActiveTab(mode: "center" | "nearest" = "nearest") {
  await nextTick();
  const bar = tabsNav.value;
  if (!bar) return;
  const tab = bar.querySelector<HTMLElement>(".tab.active");
  if (!tab) return;
  if (mode === "center") {
    const left =
      tab.offsetLeft + tab.offsetWidth / 2 - bar.clientWidth / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    return;
  }
  const tabLeft = tab.offsetLeft;
  const tabRight = tabLeft + tab.offsetWidth;
  const viewLeft = bar.scrollLeft;
  const viewRight = viewLeft + bar.clientWidth;
  if (tabLeft < viewLeft + 8)
    bar.scrollTo({ left: Math.max(0, tabLeft - 12), behavior: "smooth" });
  else if (tabRight > viewRight - 8)
    bar.scrollTo({
      left: tabRight - bar.clientWidth + 12,
      behavior: "smooth",
    });
}
function startDrag(event: DragEvent, id: string) {
  draggedTab = id;
  event.dataTransfer?.setData(tabMime, id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}
async function dropTab(event: DragEvent, before?: string) {
  const id = event.dataTransfer?.getData(tabMime) || draggedTab;
  if (!id) return false;
  if (files.value.some((f) => f.id === id)) {
    draggedTab = id;
    if (before) reorder(before);
    return true;
  }
  if (!isPreview) return true;
  try {
    const file = await window.localPreview.claim(id);
    files.value = [...files.value, file];
    active.value = id;
    tabAlignMode = "center";
    await nextTick();
    void alignActiveTab("center");
    try {
      await window.localPreview.accept(id);
    } catch (e) {
      files.value = files.value.filter((f) => f.id !== id);
      active.value = files.value[0]?.id || "";
      throw e;
    }
  } catch (e) {
    error.value = String(e);
  }
  return true;
}
let unsubscribe: (() => void) | undefined;
const media = matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  document.documentElement.dataset.theme =
    settings.value.theme === "system"
      ? media.matches
        ? "dark"
        : "light"
      : settings.value.theme;
}
async function select() {
  try {
    error.value = "";
    await window.localPreview.select();
  } catch (e) {
    error.value = String(e);
  }
}
async function openFiles() {
  try {
    error.value = "";
    if (isPreview) {
      const added = await window.localPreview.addPreviewFiles();
      if (!added.length) return;
      const known = new Set(files.value.map((f) => f.id));
      const fresh = added.filter((f) => !known.has(f.id));
      if (!fresh.length) return;
      files.value = [...files.value, ...fresh];
      active.value = fresh[fresh.length - 1].id;
      tabAlignMode = "center";
      void alignActiveTab("center");
    } else {
      await select();
    }
  } catch (e) {
    error.value = String(e);
  }
}
async function drop(event: DragEvent) {
  dragging.value = false;
  dragDepth = 0;
  try {
    if (await dropTab(event)) return;
    if (event.dataTransfer?.files.length)
      await window.localPreview.drop(Array.from(event.dataTransfer.files));
  } catch (e) {
    error.value = String(e);
  }
}
function enter(event: DragEvent) {
  if (event.dataTransfer?.types.includes("Files")) {
    dragDepth++;
    dragging.value = true;
  }
}
function leave() {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    dragging.value = false;
  }
}
async function closeTab(id: string,transferred=false) {
  if(!transferred&&!await window.localPreview.confirmDiscard(id))return;
  window.localPreview.release(id);
  const index = files.value.findIndex((f) => f.id === id);
  files.value = files.value.filter((f) => f.id !== id);
  if (active.value === id)
    active.value =
      files.value[Math.min(index, files.value.length - 1)]?.id || "";
  tabAlignMode = "nearest";
  void alignActiveTab("nearest");
  if (!files.value.length) window.localPreview.close();
}
function reorder(id: string) {
  if (!draggedTab || draggedTab === id) return;
  const list = [...files.value];
  const from = list.findIndex((f) => f.id === draggedTab),
    to = list.findIndex((f) => f.id === id);
  if (from < 0 || to < 0) return;
  list.splice(to, 0, list.splice(from, 1)[0]);
  files.value = list;
  draggedTab = "";
}
function activeIndex() {
  return files.value.findIndex((f) => f.id === active.value);
}
function switchBy(delta: number) {
  if (files.value.length < 2) return false;
  const i = activeIndex();
  if (i < 0) return false;
  const next = i + delta;
  if (next < 0 || next >= files.value.length) return false;
  tabAlignMode = "center";
  active.value = files.value[next].id;
  void alignActiveTab("center");
  return true;
}
function selectTab(id: string) {
  if (active.value === id) return;
  tabAlignMode = "nearest";
  active.value = id;
  void alignActiveTab("nearest");
}
/** Wheel over tab bar cycles files; strip centers the new active tab. */
function onTabsWheel(event: WheelEvent) {
  if (files.value.length < 2) return;
  const delta =
    Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;
  if (Math.abs(delta) < 8) return;
  event.preventDefault();
  switchBy(delta > 0 ? 1 : -1);
}
async function save(value: Partial<Settings>) {
  try {
    settings.value = await window.localPreview.setSettings(value);
    applyTheme();
  } catch {
    error.value = "设置保存失败，请稍后重试。";
  }
}
function switchTabBy(delta: number) {
  if (files.value.length < 2) return;
  const i = files.value.findIndex((f) => f.id === active.value);
  if (i < 0) return;
  const next = (i + delta + files.value.length) % files.value.length;
  tabAlignMode = "center";
  active.value = files.value[next].id;
  void alignActiveTab("center");
}
function key(event: KeyboardEvent) {
  if (event.ctrlKey && event.key.toLowerCase() === "o") {
    event.preventDefault();
    void openFiles();
  } else if (event.ctrlKey && event.key.toLowerCase() === "w") {
    event.preventDefault();
    if (active.value) closeTab(active.value);
  } else if (event.ctrlKey && event.key === "Tab") {
    event.preventDefault();
    switchTabBy(event.shiftKey ? -1 : 1);
  } else if (event.ctrlKey && event.key.toLowerCase() === "f") {
    const file = files.value.find((f) => f.id === active.value);
    if (file?.ext === "pdf") {
      event.preventDefault();
      window.dispatchEvent(
        new CustomEvent("pdf:open-search", { detail: file.id }),
      );
    }
  } else if (event.key === "Escape") {
    showSettings.value = false;
  }
}
onMounted(async () => {
  window.addEventListener("keydown", key);
  media.addEventListener("change", applyTheme);
  settings.value = await window.localPreview.getSettings();
  applyTheme();
  unsubscribe = window.localPreview.onSettings((value) => {
    settings.value = value;
    applyTheme();
  });
  cleanups.push(window.localPreview.onRemove(id=>{void closeTab(id,true);}));
  cleanups.push(window.localPreview.onPreviewIncoming(file=>{if(!files.value.some(f=>f.id===file.id))files.value=[...files.value,file];active.value=file.id;tabAlignMode='center';void alignActiveTab('center');}));
  cleanups.push(
    window.localPreview.onPreviewPrintFile((file) => {
      if (!files.value.some((f) => f.id === file.id))
        files.value = [...files.value, file];
      active.value = file.id;
      tabAlignMode = "center";
      void alignActiveTab("center");
    }),
  );
  cleanups.push(
    window.localPreview.onExport(async (id) => {
      const file = files.value.find((f) => f.id === id);
      if (!file) return;
      await waitForFileEdits(file);
      if(!files.value.includes(file))return;
      const tab = document.querySelector(`[data-file-id="${id}"]`);
      const zoom =
        Number(
          tab?.querySelector<HTMLInputElement>(".zoom-control input")?.value,
        ) || 100;
      const scroll = Array.from(
        tab?.querySelectorAll<HTMLElement>(
          ".pdf-scroll,.slide-scroll,.document-scroll,.table-wrap,.text-scroll,.image",
        ) || [],
      ).map((el) => ({ top: el.scrollTop, left: el.scrollLeft }));
      window.localPreview.supply({ ...file, view: { ...file.view, zoom, scroll } });
    }),
  );
  if (isPreview) {
    files.value = await window.localPreview.consume();
    active.value = files.value[0]?.id || "";
    void alignActiveTab("nearest");
    if (!files.value.length) error.value = "预览已释放，请重新打开文件。";
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", key);
  media.removeEventListener("change", applyTheme);
  unsubscribe?.();
  cleanups.forEach((fn) => fn());
});
</script>
<template>
  <main
    :inert="updateLocked"
    ref="mainEl"
    @dragenter.prevent="enter"
    @dragleave.prevent="leave"
    @dragover.prevent
    @drop.prevent="drop"
  >
    <header v-if="!isPreview" class="app-header">
      <button
        class="settings-button"
        aria-label="设置"
        title="设置"
        @click="showSettings = true"
      >
        <ToolbarIcon name="settings" />
      </button>
    </header>
    <section v-if="!isPreview" class="welcome">
      <component :is="homeIntro" v-if="homeIntro" />
      <button class="dropzone" @click="select">
        <span class="file-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M8 11V3M5 6l3-3 3 3M3 12.5h10" />
          </svg>
        </span>
        <strong>打开文件</strong>
        <span class="drop-hint">或将文件拖到此处</span>
      </button>
      <div class="formats">
        <span>Word</span><span>Excel</span><span>PowerPoint</span
        ><span>PDF</span><span>图片</span><span>文本</span>
      </div>
    </section>
    <template v-else
      ><div v-if="files.length" ref="tabbar" class="tabbar" :class="{'has-overflow':tabsOverflow}"><nav
        v-if="files.length"
        ref="tabsNav"
        class="tabs"
        aria-label="文件标签"
        title="点击标签切换；在标签上滚动滚轮也可切换文件"
        @wheel.prevent="onTabsWheel"
      >
        <div
          v-for="file in files"
          :key="file.id"
          class="tab"
          :class="{ active: file.id === active }"
          draggable="true"
          role="button"
          tabindex="0"
          :aria-label="file.name"
          :title="file.name"
          @click="selectTab(file.id)"
          @keydown.enter.prevent="selectTab(file.id)"
          @keydown.space.prevent="selectTab(file.id)"
          @dragstart="startDrag($event, file.id)"
          @dragend="draggedTab = ''"
          @dragover.prevent
          @drop.stop.prevent="dropTab($event, file.id)"
        >
          <i class="dot" :class="{ img: ['png','jpg','jpeg','webp','gif','bmp','svg'].includes(file.ext) }" aria-hidden="true"></i>
          <span class="tab-name">{{ file.name }}</span>
          <button
            type="button"
            class="tab-close"
            :aria-label="'关闭 ' + file.name"
            title="关闭"
            @click.stop="closeTab(file.id)"
          >
            ×
          </button>
        </div>
        <button
          v-if="!tabsOverflow"
          type="button"
          class="tab-add-file"
          title="打开文件（Ctrl+O）"
          aria-label="打开文件"
          @click="openFiles"
        >
          +
        </button>
      </nav>
      <span class="tab-actions">
        <button v-if="tabsOverflow" type="button" class="tab-add-file" title="打开文件（Ctrl+O）" aria-label="打开文件" @click="openFiles">+</button>
        <button
          type="button"
          class="settings-button tab-settings"
          aria-label="设置"
          title="设置"
          @click="showSettings = true"
        >
          <ToolbarIcon name="settings" />
        </button>
      </span></div>
      <PreviewTab
        v-for="file in files"
        v-show="file.id === active"
        :key="file.id"
        :file="file"
        :active="file.id === active"
        :initial-zoom="settings.defaultZoom"
        :immersive="immersive"
    /></template>
    <div v-if="error" class="action-error" role="alert">
      {{ error }}<button @click="error = ''">关闭</button>
    </div>
    <div v-if="dragging" class="drag-overlay">松开鼠标，打开文件</div>
    <SettingsPanel
      v-if="showSettings"
      :settings="settings"
      @close="showSettings = false"
      @change="save"
    />
  </main>
  <UpdateCenter notice :suppressed="showSettings||immersive"/>
</template>
