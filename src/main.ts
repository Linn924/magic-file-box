void import('./mount').catch(async() => {
  const error=document.createElement('p');
  error.setAttribute('role','alert');
  error.textContent='界面加载失败，请关闭窗口后重试。';
  document.getElementById('app')?.append(error);
  await window.localPreview.finishStartup();
});
export {};
