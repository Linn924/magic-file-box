import { inject, type InjectionKey } from 'vue';
import type { PreviewTask } from '@shared/previewLoading';
// Capture a new task at module setup, so old callbacks cannot update a retry.
export const previewTaskKey: InjectionKey<() => PreviewTask> = Symbol('preview-task');
export function usePreviewTask(): PreviewTask {
  return inject(previewTaskKey, undefined)?.() ?? {
    signal: new AbortController().signal,
    report: () => {},
  };
}

/** Allow the stage to paint before work; abort also settles a suspended frame. */
export function previewFrame(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    let frame = 0;
    const cancel = () => {
      cancelAnimationFrame(frame);
      reject(signal.reason);
    };
    signal.addEventListener('abort', cancel, { once: true });
    frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    });
  });
}
