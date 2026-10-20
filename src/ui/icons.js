// 小型离线图标表：只包含工具实际使用的线性 SVG，不引入图标包或远程资源。
const paths = {
  grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke-width="3"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  delete: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  rename: '<path d="m14 4 6 6M4 20l5-1L21 7l-6-6L3 13Z"/>',
  import: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  export: '<path d="M12 15V3m-4 4 4-4 4 4M4 16v5h16v-5"/>',
  previous: '<path d="M5 5v14M19 5 8 12l11 7Z"/>',
  next: '<path d="M19 5v14M5 5l11 7-11 7Z"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
  overlay:
    '<rect x="3" y="3" width="12" height="12" rx="2"/><rect x="9" y="9" width="12" height="12" rx="2"/>',
  align:
    '<path d="M3 20h18"/><rect x="5" y="7" width="5" height="10" rx="1"/><rect x="14" y="3" width="5" height="14" rx="1"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12h3"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 9M3 3v7h7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  fps: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16m10-16v16M3 9h4m-4 6h4m10-6h4m-4 6h4"/>',
};

export function setIcon(element, name, label) {
  if (!paths[name]) throw new Error(`未知图标：${name}`);
  if (element.dataset.renderedIcon !== name) {
    element.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
    element.dataset.renderedIcon = name;
  }
  if (label) {
    element.setAttribute('aria-label', label);
    element.title = label;
  }
}

export function mountIcons(root) {
  root.querySelectorAll('[data-icon]').forEach((element) => setIcon(element, element.dataset.icon));
}
