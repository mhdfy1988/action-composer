import { mountIcons } from './icons.js';

// 仅接收源码中的静态模板；用户名称等动态数据必须用textContent或value更新。
export function createView(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const element = template.content.firstElementChild;
  if (!element || template.content.children.length !== 1)
    throw new Error('组件模板必须有一个根节点');
  mountIcons(element);
  const nodes = new Map([...element.querySelectorAll('[id]')].map((node) => [node.id, node]));
  if (element.id) nodes.set(element.id, element);
  return {
    element,
    get(id) {
      const node = nodes.get(id);
      if (!node) throw new Error(`组件缺少节点：${id}`);
      return node;
    },
  };
}
