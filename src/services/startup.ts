export function removeHomeStartup() {
  delete document.documentElement.dataset.homeStartup;
  document.getElementById('startup-status')?.remove();
}
