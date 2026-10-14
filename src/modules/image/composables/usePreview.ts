import { fitScale } from "@/utils/fit";
import { createSafeResizeObserver } from "@/utils/safeResizeObserver";
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from "vue";
import DOMPurify from "dompurify";
import type { PreviewProps, PreviewEmit } from "@/modules/types";

export function usePreview(props: PreviewProps, emit: PreviewEmit) {
  const pane = ref<HTMLElement>();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
  };
  const bytes = props.file.bytes.slice().buffer;
  const data =
    props.file.ext === "svg"
      ? DOMPurify.sanitize(new TextDecoder().decode(bytes), {
          USE_PROFILES: { svg: true, svgFilters: true },
        })
      : bytes;
  const url = URL.createObjectURL(
    new Blob([data], { type: types[props.file.ext] }),
  );
  const dimensions = ref("");
  const natural = ref({ width: 0, height: 0 });
  const available = ref({ width: 0, height: 0 });

  // Chromium/from-image decodes EXIF (including mirrored orientations) once.
  const rotate=ref<0|90|180|270>(props.file.view?.image?.rotate??0);
  const originalPixels=ref(props.file.view?.image?.originalPixels??false);
  watch([rotate,originalPixels],()=>{
    props.file.view??={zoom:props.zoom,scroll:[]};
    props.file.view.image={rotate:rotate.value,originalPixels:originalPixels.value};
  },{flush:'sync'});
  const fullscreen=ref(document.documentElement.classList.contains('immersive'));
  let restoringFullscreen=false;
  let fullscreenCleanup:(()=>void)|undefined;
  const effectiveOriginal=computed(()=>originalPixels.value&&!fullscreen.value);
  watch(()=>props.fitMode,()=>{if(!fullscreen.value&&!restoringFullscreen)originalPixels.value=false;});
  let disposed=false;
  let observer: ResizeObserver | undefined;
  function measureAvailable(){
    const surface=pane.value?.querySelector('.image');if(!surface?.clientWidth||!surface.clientHeight)return;
    available.value={width:Math.max(0,surface.clientWidth-50),height:Math.max(0,surface.clientHeight-50)};
  }
  onMounted(() => {
    fullscreenCleanup=window.localPreview.onFullscreen(value=>{
      fullscreen.value=value;
      if(!value){restoringFullscreen=true;void nextTick().then(()=>{restoringFullscreen=false;});}
    });
    const surface = pane.value?.querySelector(".image");
    if (!surface) return;
    measureAvailable();observer=createSafeResizeObserver(measureAvailable);
    observer.observe(surface);
  });
  async function loaded(event: Event) {
    if(disposed)return;
    measureAvailable();
    const img = event.target as HTMLImageElement;
    natural.value = { width: img.naturalWidth, height: img.naturalHeight };
    dimensions.value = `${img.naturalWidth} × ${img.naturalHeight}`;
    await nextTick();if(!disposed)emit("ready");
  }
  function cycleRotate() {
    rotate.value = (((rotate.value + 90) % 360) as 0 | 90 | 180 | 270);
  }
  function toggleOriginal() {
    originalPixels.value = !originalPixels.value;
    if (originalPixels.value) emit("update:zoom", 100);
  }
  const fitLabel = computed(() =>
    effectiveOriginal.value ? `原始像素 ${props.zoom}%` : props.fitMode==='width'?'适合宽度':props.fitMode==='page'?'整页适配':"适合窗口",
  );
  const style = computed(() => {
    const { width, height } = natural.value;
    if (effectiveOriginal.value)
      return {
        maxWidth: "none",
        maxHeight: "none",
        width: (width * props.zoom) / 100 + "px",
        height: (height * props.zoom) / 100 + "px",
      };
    const quarter=rotate.value===90||rotate.value===270;
    const displayWidth=quarter?height:width,displayHeight=quarter?width:height;
    const fit =
      width && height
        ? fitScale(
            displayWidth,
            displayHeight,
            available.value.width,
            available.value.height,
            props.fitMode || "original",
            Math.min(
              1,
              Math.max(1, available.value.width) / displayWidth,
              Math.max(1, available.value.height) / displayHeight,
            ),
          )
        : 1;
    return {
      maxWidth: "none",
      maxHeight: "none",
      width: (width * fit * props.zoom) / 100 + "px",
      height: (height * fit * props.zoom) / 100 + "px",
    };
  });
  const frameStyle=computed(()=>{
    const quarter=rotate.value===90||rotate.value===270;
    return {width:quarter?style.value.height:style.value.width,height:quarter?style.value.width:style.value.height};
  });
  onBeforeUnmount(() => {
    disposed=true;
    fullscreenCleanup?.();
    observer?.disconnect();
    URL.revokeObjectURL(url);
  });

  return {
    pane,
    url,
    style,frameStyle,
    dimensions,
    loaded,
    rotate,
    cycleRotate,
    originalPixels,
    toggleOriginal,
    fitLabel,
  };
}
