import {ref, onBeforeUnmount, type Ref} from 'vue';
import {defaults, type Settings} from '@shared/settings';

export function useAppSettings(error: Ref<string>) {
  const settings = ref<Settings>({...defaults});
  let unsubscribe: (() => void) | undefined;
  const media = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    document.documentElement.dataset.theme = settings.value.theme === 'system'
      ? media.matches ? 'dark' : 'light'
      : settings.value.theme;
  }
  async function save(value: Partial<Settings>) {
    try {
      settings.value = await window.localPreview.setSettings(value);
      applyTheme();
    } catch {
      error.value = '设置保存失败，请稍后重试。';
    }
  }

  async function initializeSettings() {
    media.addEventListener('change', applyTheme);
    settings.value = await window.localPreview.getSettings();
    applyTheme();
    unsubscribe = window.localPreview.onSettings((value) => {
      settings.value = value;
      applyTheme();
    });
  }
  onBeforeUnmount(() => {
    media.removeEventListener('change', applyTheme);
    unsubscribe?.();
  });
  return {settings, save, initializeSettings};
}
