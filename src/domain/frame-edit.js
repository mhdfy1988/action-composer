// 修正使用原图像素保存，输入增量为舞台像素；与预览、导出共用 placement。
export function moveSelection(group, frame, delta, scope = 'group') {
  const dx = group.lockX ? 0 : delta.x;
  const dy = group.lockY ? 0 : delta.y;
  if (scope === 'frame') {
    const item = group.frames[frame];
    if (dx) item.horizontalOffset = (item.horizontalOffset ?? 0) + dx / group.scale;
    if (dy) item.verticalOffset = (item.verticalOffset ?? 0) + dy / group.scale;
  } else {
    group.x += dx;
    group.y += dy;
  }
}
