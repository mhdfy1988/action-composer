// 页面只装配区域；内部控件归各组件，不在这里维护一套节点注册表。
export function mountShell({ header, library, toolbar, viewport, inspector, timeline }) {
  const main = document.createElement('main');
  const workspace = document.createElement('section');
  workspace.className = 'workspace';
  workspace.setAttribute('aria-label', '校准工作区');
  workspace.append(toolbar, viewport);
  main.append(library, workspace, inspector, timeline);
  document.body.prepend(header, main);
}
