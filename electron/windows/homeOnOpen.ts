import {dialog, type BrowserWindow} from 'electron';
import type {Settings} from '@shared/settings';

/** One decision per open batch; overlapping requests share the visible prompt. */
export function createHomeOnOpen(options: {
  home: () => BrowserWindow | undefined;
  settings: () => Settings;
  save: (value: Partial<Settings>) => unknown;
  hide: (home: BrowserWindow) => void;
  quitting: () => boolean;
}) {
  let pending: Promise<void> | undefined;
  return async () => {
    if (pending) return pending;
    const home = options.home();
    if (!home || home.isDestroyed() || !home.isVisible() || options.quitting()) return;
    const action = options.settings().openHomeAction;
    if (action === 'keep') return;
    if (action === 'tray') { options.hide(home); return; }
    pending = (async () => {
      const result = await dialog.showMessageBox(home, {
        type: 'question',
        title: '打开文件后的主页',
        message: '是否将主页隐藏到右下角托盘？',
        detail: '预览窗口会保持打开。隐藏后可点击托盘图标恢复主页。',
        buttons: ['隐藏到托盘', '保留主页'],
        defaultId: 1,
        cancelId: 1,
        checkboxLabel: '记住我的选择，以后可在设置中修改',
        checkboxChecked: false,
      });
      if (home.isDestroyed() || options.quitting() || options.settings().openHomeAction !== 'ask') return;
      const choice = result.response === 0 ? 'tray' : 'keep';
      if (result.checkboxChecked) options.save({openHomeAction: choice});
      if (choice === 'tray') options.hide(home);
    })().catch(() => {
      dialog.showErrorBox('主页设置未完成', '文件已打开，主页保持显示。请稍后重试或在设置中修改。');
    });
    try { await pending; }
    finally { pending = undefined; }
  };
}
