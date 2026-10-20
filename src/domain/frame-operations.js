// 帧身份独立于顺序；旧内部数据无 id 时仍按原位置区分重复素材。
export const frameKey = (frame, index) => frame.id ?? `${frame.assetId}:${index}`;

export function reorderFrames(group, indices, boundary) {
  const selected = new Set(indices);
  if (
    !indices.length ||
    indices.some((i) => !group.frames[i]) ||
    !Number.isInteger(boundary) ||
    boundary < 0 ||
    boundary > group.frames.length
  )
    throw new Error('排序位置无效');
  const rows = group.frames.map((frame, i) => ({ frame, anchor: group.anchors[i] }));
  const moving = rows.filter((_, i) => selected.has(i)),
    rest = rows.filter((_, i) => !selected.has(i));
  const at = boundary - [...selected].filter((i) => i < boundary).length;
  rest.splice(at, 0, ...moving);
  group.frames = rest.map((row) => row.frame);
  group.anchors = rest.map((row) => row.anchor);
}
export function captureFrame(group, index) {
  if (!group.frames[index]) throw new Error('当前帧不存在');
  return structuredClone({ frame: group.frames[index], anchor: group.anchors[index] });
}
export function pasteFrame(group, index, clipboard, id) {
  if (!group.frames[index] || !clipboard) throw new Error('没有可粘贴的帧');
  if (group.frames.length >= 120) throw new Error('每组最多 120 帧');
  group.frames.splice(index + 1, 0, { ...structuredClone(clipboard.frame), id });
  group.anchors.splice(index + 1, 0, structuredClone(clipboard.anchor));
  return index + 1;
}
export function deleteFrames(group, indices) {
  const selected = new Set(indices);
  if (selected.size >= group.frames.length)
    throw new Error('至少保留一帧；如需全部移除，请删除动作');
  group.frames = group.frames.filter((_, i) => !selected.has(i));
  group.anchors = group.anchors.filter((_, i) => !selected.has(i));
}
