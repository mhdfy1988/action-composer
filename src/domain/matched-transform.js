import { placement } from './project.js';

// 匹配结果先进入参照原图坐标，再经参照已有变换进入舞台。
export function matchedTransform(project, target, reference, match) {
  const ref = placement(project, reference, 0);
  const scale = match.scale * reference.scale;
  const atZero = placement(project, { ...target, scale, x: 0, y: 0 }, 0);
  return {
    scale,
    x: target.lockX ? target.x : ref.x + match.tx * reference.scale - atZero.x,
    y: target.lockY ? target.y : ref.y + match.ty * reference.scale - atZero.y,
  };
}
