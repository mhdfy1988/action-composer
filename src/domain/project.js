import { horizontalCorrection } from './horizontal-motion.js';

export const TICKS = 60000;
export const LIMITS = {
  frames: 240,
  groups: 24,
  pixels: 24000000,
  bytes: 96 * 1024 * 1024,
  side: 8192,
};
export function newProject() {
  return {
    format: 'action-composer',
    version: 1,
    name: '未命名工程',
    ticksPerSecond: TICKS,
    stage: { width: 512, height: 512, originX: 256, originY: 480 },
    reference: null,
    assets: [],
    groups: [],
  };
}
export function duration(group) {
  return group.frames.reduce((sum, frame) => sum + frame.durationTicks, 0);
}
// 半开区间：恰好位于边界时进入下一帧，循环结束回到第零帧。
export function frameAt(group, ticks) {
  const total = duration(group);
  if (!total) return 0;
  let rest = ((Math.floor(ticks) % total) + total) % total;
  for (let i = 0; i < group.frames.length; i++) {
    if (rest < group.frames[i].durationTicks) return i;
    rest -= group.frames[i].durationTicks;
  }
  return group.frames.length - 1;
}
export function frameStart(group, index) {
  return group.frames.slice(0, index).reduce((n, f) => n + f.durationTicks, 0);
}
export function placement(project, group, index) {
  const frames = group.frames.map((frame) => ({
    ...project.assets.find((a) => a.id === frame.assetId),
  }));
  const image = frames[index];
  const correction = horizontalCorrection({ ...group, frames }, index);
  return {
    x:
      project.stage.originX -
      (image.width * group.scale) / 2 +
      group.x +
      correction +
      (group.frames[index].horizontalOffset ?? 0) * group.scale,
    y:
      project.stage.originY -
      image.height * group.scale +
      group.y +
      (group.frames[index].verticalOffset ?? 0) * group.scale,
    width: image.width * group.scale,
    height: image.height * group.scale,
  };
}
