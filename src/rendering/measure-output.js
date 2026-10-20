import { placement } from '../domain/project.js';
import { alphaBounds, outputLayout, checkOutputSize } from '../domain/output-layout.js';
import { drawFrame } from './frame.js';

// 先逐帧测量，再统一输出；不读取预览画布，故观察缩放、灰底和参考图均不参与。
export async function measureOutput(
  project,
  group,
  media,
  { padding = 16, signal, onProgress = () => {} } = {},
) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const bounds = [];
  for (let index = 0; index < group.frames.length; index++) {
    signal?.throwIfAborted();
    const p = placement(project, group, index);
    const left = Math.floor(p.x) - 1,
      top = Math.floor(p.y) - 1;
    const width = Math.ceil(p.x + p.width) - left + 1;
    const height = Math.ceil(p.y + p.height) - top + 1;
    checkOutputSize(width, height);
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(1, 0, 0, 1, -left, -top);
    drawFrame(ctx, project, group, index, media);
    const rect = alphaBounds(ctx.getImageData(0, 0, width, height).data, width, height);
    bounds.push(
      rect
        ? {
            left: left + rect.left,
            top: top + rect.top,
            right: left + rect.right,
            bottom: top + rect.bottom,
          }
        : null,
    );
    onProgress(index + 1, group.frames.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  signal?.throwIfAborted();
  return outputLayout(bounds, project.stage, padding);
}
