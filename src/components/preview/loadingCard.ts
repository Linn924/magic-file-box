import type {Ref} from 'vue';

export interface PreviewLoadingState {
  target: HTMLElement;
  since: Readonly<Ref<number | undefined>>;
  retry: () => void;
}
