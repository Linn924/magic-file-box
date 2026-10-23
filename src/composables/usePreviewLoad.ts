import { computed, nextTick, onBeforeUnmount, onErrorCaptured, onMounted, provide, ref, shallowRef, watch } from 'vue';
import type { PreviewFile } from '@shared/files';
import type { PreviewLoadPhase } from '@shared/previewLoading';
import { previewError } from '@shared/previewError';
import { cacheDrop, cacheGet, cachePut } from '@/services/fileContentCache';
import { waitForFileEdits } from '@/services/pendingEdits';
import {previewCost,retainPreview} from '@/services/previewResidency';
import { previewFrame, previewTaskKey } from './usePreviewTask';

type Props = { file: PreviewFile; active?: boolean };
type Attempt = { token: string; controller: AbortController };
type MountedPreview = {
  file: PreviewFile;
  key: string;
  events: { ready: () => void; error: (message: string) => void };
};
export function usePreviewLoad(props: Props, restoreView: () => void, releaseCache:()=>void|Promise<void>) {
  const phase = ref<PreviewLoadPhase>('idle');
  const error = ref(props.file.error);
  const preview = shallowRef<MountedPreview>();
  const elapsed = ref(0);
  const backgroundWork=ref(0);
  let attempt: Attempt | undefined;
  let disposed = false;
  let clock: ReturnType<typeof setInterval> | undefined;
  let eviction:Promise<void>|undefined;
  const busy = computed(() => ['reading', 'queued', 'parsing', 'rendering', 'password'].includes(phase.value));
  const label = computed(() => busy.value ? phase.value === 'password' ? '等待输入密码' : '正在加载…' : '');
  const resident=retainPreview({
    active:()=>!!props.active,
    loading:()=>busy.value||backgroundWork.value>0,
    cost:()=>preview.value?previewCost(preview.value.file,document.querySelector<HTMLElement>(`[data-file-id="${props.file.id}"]`)??undefined):0,
    async evict(){
      const run=attempt;
      await waitForFileEdits(props.file);
      if(disposed||props.active||busy.value||backgroundWork.value||attempt!==run||!preview.value)return false;
      stop();phase.value='idle';cacheDrop(props.file.id);
      const released=nextTick().then(releaseCache);
      eviction=released;
      try{await released;}finally{if(eviction===released)eviction=undefined;}
      return true;
    },
  });
  function current(run: Attempt) { return !disposed && attempt === run && !run.controller.signal.aborted; }
  provide(previewTaskKey, () => {
    const run = attempt;
    return {
      signal: run?.controller.signal ?? AbortSignal.abort(),
      report(stage) { if (run && current(run) && busy.value) phase.value = stage; },
      hold(){
        if(!run||!current(run))return ()=>{};
        backgroundWork.value++;let released=false;
        return ()=>{if(released)return;released=true;if(current(run)){backgroundWork.value--;resident.changed();}};
      },
    };
  });
  function stopClock() { clearInterval(clock); clock = undefined; }
  function stop() {
    const run = attempt;
    attempt = undefined;
    run?.controller.abort();
    if (run) void window.localPreview.cancelPreviewLoad(run.token).catch(() => {});
    preview.value = undefined;
    backgroundWork.value=0;
    stopClock();
  }
  function fail(run: Attempt, message: string) {
    if (!current(run)) return;
    stop();
    phase.value = 'error'; error.value = message;
  }
  async function ready(run: Attempt) {
    if (!current(run) || phase.value === 'ready') return;
    phase.value = 'rendering';
    try {
      await nextTick();
      await previewFrame(run.controller.signal);
      await previewFrame(run.controller.signal);
      if (!current(run)) return;
      phase.value = 'ready'; stopClock(); if(props.active)restoreView();resident.changed();
    } catch { /* Cancellation also settles any pending frame. */ }
  }
  async function load() {
    if (disposed || !props.active || busy.value || preview.value) return;
    error.value = '';
    if (props.file.error) { error.value = props.file.error; phase.value = 'error'; return; }
    const run: Attempt = { token: crypto.randomUUID(), controller: new AbortController() };
    attempt = run;
    phase.value = 'reading'; elapsed.value = 0;
    const started = performance.now();
    stopClock(); clock = setInterval(() => { elapsed.value = Math.floor((performance.now() - started) / 1000); }, 1000);
    try {
      await eviction;
      if(!current(run))return;
      const loaded = cacheGet(props.file.id) ?? await window.localPreview.loadPreview(props.file, run.token);
      if (!current(run)) return;
      if (loaded.error) { fail(run, loaded.error); return; }
      if (loaded.view?.pdfPassword) {
        props.file.view ??= { zoom: 100, scroll: [] };
        props.file.view.pdfPassword = loaded.view.pdfPassword;
      }
      loaded.view = props.file.view;
      props.file.source = loaded.source;
      props.file.size = loaded.size;
      if (!loaded.source) cachePut(props.file.id, loaded);
      phase.value = 'parsing';
      // Paint the stage before mounting modules that perform setup work synchronously.
      await nextTick();
      await previewFrame(run.controller.signal);
      await previewFrame(run.controller.signal);
      if (!current(run)) return;
      preview.value = { file: loaded, key: run.token, events: {
        ready: () => { void ready(run); }, error: message => fail(run, message),
      } };
    } catch (cause) {
      if (current(run)) fail(run, previewError(cause, '文件'));
    }
  }
  function retry() {
    stop(); cacheDrop(props.file.id); phase.value = 'idle';
    void load();
  }
  onMounted(() => { if (props.active) void load(); });
  onErrorCaptured(cause => {
    if (attempt && busy.value && current(attempt)) {
      fail(attempt, previewError(cause, '文件'));
      return false;
    }
  });
  watch(() => props.active, async active => {
    if (active) {
      if (phase.value === 'idle') void load();
      else if(phase.value==='ready'){await nextTick();if(props.active&&!disposed)restoreView();}
    }
    resident.changed();
  });
  onBeforeUnmount(() => { disposed = true; resident.release(); stop(); cacheDrop(props.file.id); });
  return { preview, phase, error, busy, label, elapsed, retry };
}
