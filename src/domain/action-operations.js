// 只移动完整动作，不改动作身份、帧顺序或变换参数。
export function reorderAction(project, sourceId, targetId, after = false) {
  const groups = project.groups;
  const from = groups.findIndex((group) => group.id === sourceId);
  const target = groups.findIndex((group) => group.id === targetId);
  if (from < 0 || target < 0) throw new Error('排序动作不存在');
  const boundary = target + (after ? 1 : 0);
  const to = boundary - (from < boundary ? 1 : 0);
  if (from === to) return;
  const [group] = groups.splice(from, 1);
  groups.splice(to, 0, group);
}
