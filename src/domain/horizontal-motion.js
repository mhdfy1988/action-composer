// 从 reference-compare-demo/horizontal-motion.js 迁入，保留底部中心与腰点补偿语义。
export function horizontalCorrection(group, index) {
  if (!group.horizontal) return 0;
  const first = group.anchors?.[0],
    point = group.anchors?.[index];
  if (!first || !point) throw new Error('水平补偿缺少腰部标点');
  return (
    (first.x - group.frames[0].width / 2 - (point.x - group.frames[index].width / 2)) * group.scale
  );
}

export function allMarked(group) {
  return (
    group.frames.length > 0 && group.frames.every((_, index) => Boolean(group.anchors?.[index]))
  );
}
