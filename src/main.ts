const mode = new URLSearchParams(location.search);
const status = document.querySelector<HTMLElement>('#startup-status');
if (status && mode.has('preview')) status.textContent = '正在加载文件…';

const painted = mode.has('print') || mode.has('print-panel')
  ? Promise.resolve()
  : new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

void painted.then(() => import('./mount')).catch(() => {
  if (status) {
    status.setAttribute('role', 'alert');
    status.textContent = '界面加载失败，请关闭窗口后重试。';
  }
});

export {}
