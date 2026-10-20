import { placement } from '../../src/domain/project.js';

// 以首帧轮廓高度求一个等比倍率，再对齐底部中心；同一变换应用整组。
export function firstFrameAlignment(project, target, reference, targetBounds, referenceBounds) {
  if (!target || !reference || target.id === reference.id)
    throw new Error('请选择另一个动作作为参照');
  for (const bounds of [targetBounds, referenceBounds]) {
    if (!bounds || bounds.right <= bounds.left || bounds.bottom <= bounds.top)
      throw new Error('首帧没有可见内容，无法对齐');
  }
  const scale =
    (reference.scale * (referenceBounds.bottom - referenceBounds.top)) /
    (targetBounds.bottom - targetBounds.top);
  if (!Number.isFinite(scale) || scale < 0.01 || scale > 20)
    throw new Error('估算尺度超出 1%–2000%，请手动调整参照或当前动作');
  const ref = placement(project, reference, 0);
  const scaled = placement(project, { ...target, scale }, 0);
  const referenceX = ref.x + ((referenceBounds.left + referenceBounds.right) / 2) * reference.scale;
  const referenceY = ref.y + referenceBounds.bottom * reference.scale;
  return {
    scale,
    x: target.lockX
      ? target.x
      : target.x + referenceX - scaled.x - ((targetBounds.left + targetBounds.right) / 2) * scale,
    y: target.lockY ? target.y : target.y + referenceY - scaled.y - targetBounds.bottom * scale,
  };
}
