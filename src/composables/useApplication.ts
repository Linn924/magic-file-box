import {onMounted, onBeforeUnmount, provide, ref, shallowRef, nextTick} from 'vue';
import {useImmersive} from './useImmersive';
import {useUpdateRestart} from './useUpdateRestart';
import {useAppSettings} from './useAppSettings';
import {waitForFileEdits} from '@/services/pendingEdits';
import type {PreviewFile} from '@shared/files';
import type {TabStripHandle} from '@/components/app/types';

export function useApplication() {
  const isPreview = new URLSearchParams(location.search).has("preview");
  const immersive = useImmersive(isPreview);
  const files = shallowRef<PreviewFile[]>([]);
  const updateLocked=useUpdateRestart(files);
  const active = ref("");
  const showSettings = ref(false);
  const error = ref("");
  const dragging = ref(false);
  let dragDepth = 0;
  let draggedTab = "";
  const tabMime = "application/x-file-preview-tab";
  const cleanups: Array<() => void> = [];
  const tabStrip = ref<TabStripHandle>();
  const {settings, save, initializeSettings} = useAppSettings(error);
  /** Next active-tab scroll policy: center for wheel, nearest for click/close. */
  let tabAlignMode: "center" | "nearest" = "nearest";
  provide("previewFiles", files);
  async function alignActiveTab(mode: "center" | "nearest" = "nearest") {
    await nextTick();
    await tabStrip.value?.align(mode);
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
    cleanups.push(window.localPreview.onOpenSettings(()=>{showSettings.value=true;}));
    await initializeSettings();
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
        const scroll = active.value===id?Array.from(
          tab?.querySelectorAll<HTMLElement>(
            ".pdf-scroll,.slide-scroll,.document-scroll,.table-wrap,.text-scroll,.image",
          ) || [],
        ).map((el) => ({ top: el.scrollTop, left: el.scrollLeft })):file.view?.scroll??[];
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
    cleanups.forEach((fn) => fn());
  });

  function endDrag() { draggedTab = ""; }
  return {isPreview, immersive, files, active, updateLocked, settings, showSettings, error, dragging, tabStrip, select, openFiles, enter, leave, drop, startDrag, endDrag, dropTab, closeTab, selectTab, onTabsWheel, save};

}
