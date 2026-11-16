import {removeHomeStartup} from './services/startup';

if (!document.documentElement.hasAttribute('data-home-startup')) removeHomeStartup();

void import('./mount').catch(() => {
  const error=document.createElement('p');
  error.setAttribute('role','alert');
  error.textContent='界面加载失败，请关闭窗口后重试。';
  document.getElementById('app')?.append(error);
  removeHomeStartup();
});
export {};
