import { placement } from './project.js';

export const CORNERS = { nw: [0, 0], ne: [1, 0], se: [1, 1], sw: [0, 1] };

// 从手势起点计算等比缩放；未锁定轴保持对角点固定，不逐帧累加误差。
export function resizeGroup(project, group, frame, corner, delta) {
  const [cx, cy] = CORNERS[corner];
  const box = placement(project, group, frame);
  const anchor = { x: box.x + box.width * (1 - cx), y: box.y + box.height * (1 - cy) };
  const vx = box.width * (cx * 2 - 1),
    vy = box.height * (cy * 2 - 1);
  const ratio = 1 + (delta.x * vx + delta.y * vy) / (vx * vx + vy * vy);
  const result = { ...group, scale: Math.max(0.01, Math.min(20, group.scale * ratio)) };
  const scaled = placement(project, result, frame);
  const left = anchor.x - scaled.width * (1 - cx),
    top = anchor.y - scaled.height * (1 - cy);
  if (!group.lockX) result.x += left - scaled.x;
  if (!group.lockY) result.y += top - scaled.y;
  return { scale: result.scale, x: result.x, y: result.y };
}
