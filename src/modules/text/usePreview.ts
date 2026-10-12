import { computed, onMounted, ref, watch } from "vue";
import type { PreviewFile } from "../../types";
import type { PreviewProps, PreviewEmit } from "../types";
export function usePreview(props: PreviewProps, emit: PreviewEmit) {
  const pane = ref<HTMLElement>();
  const bytes = props.file.bytes;
  const encoding = ref(
    bytes[0] === 255 && bytes[1] === 254
      ? "utf-16le"
      : bytes[0] === 254 && bytes[1] === 255
        ? "utf-16be"
        : "utf-8",
  );
  try {
    if (encoding.value === "utf-8")
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    encoding.value = "gb18030";
  }
  const raw = computed(() => new TextDecoder(encoding.value).decode(bytes));
  if (['utf-8', 'gb18030', 'utf-16le', 'utf-16be'].includes(props.file.view?.encoding ?? ''))
    encoding.value = props.file.view!.encoding!;
  watch(encoding, value => {
    props.file.view ??= { zoom: props.zoom, scroll: [] };
    props.file.view.encoding = value;
  }, { flush: 'sync' });
  const pretty = computed(() => {
    if (props.file.ext === "json") {
      try {
        return JSON.stringify(JSON.parse(raw.value), null, 2);
      } catch {
        return raw.value;
      }
    }
    return raw.value;
  });
  const invalidJson = computed(() => {
    if (props.file.ext !== "json") return false;
    try {
      JSON.parse(raw.value);
      return false;
    } catch {
      return true;
    }
  });
  onMounted(() => emit("ready"));

  return { pane, encoding, raw, pretty, invalidJson };
}
