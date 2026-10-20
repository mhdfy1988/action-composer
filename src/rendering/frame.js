import { placement } from '../domain/project.js';

// 预览与输出共用这一条图像绘制链路。参考图、参考线不属于输出图像。
export function drawFrame(ctx, project, group, index, media) {
  const p = placement(project, group, index);
  const image = media.get(group.frames[index].assetId)?.image;
  if (!image) throw new Error('当前帧图片未就绪');
  ctx.drawImage(image, p.x, p.y, p.width, p.height);
  return p;
}
