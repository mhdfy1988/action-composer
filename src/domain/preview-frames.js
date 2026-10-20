import { frameAt } from './project.js';

// 保留仍可见的编辑对象；否则按列表顺序向后找，末尾回绕。
export function selectVisible(groups, visibleIds, activeId) {
  if (groups.some((group) => group.id === activeId && visibleIds.has(group.id))) return activeId;
  const start = groups.findIndex((group) => group.id === activeId);
  for (let offset = 1; offset <= groups.length; offset++) {
    const group = groups[(start + offset) % groups.length];
    if (visibleIds.has(group.id)) return group.id;
  }
  return null;
}

// 同一个预览时刻，各动作按自身时序循环；当前动作最后绘制，编辑不被遮挡。
export function previewFrames(groups, visibleIds, activeId, activeFrame, ticks) {
  const samples = groups
    .filter((group) => visibleIds.has(group.id))
    .map((group) => ({
      group,
      frame: group.id === activeId ? activeFrame : frameAt(group, ticks),
    }));
  return [
    ...samples.filter((item) => item.group.id !== activeId),
    ...samples.filter((item) => item.group.id === activeId),
  ];
}
