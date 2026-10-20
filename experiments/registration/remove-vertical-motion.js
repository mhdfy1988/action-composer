import { matchWholeBody } from '../../src/infrastructure/registration.js';

function pixels(frame, media) {
  const image = media.get(frame.assetId)?.image;
  if (!image) throw new Error('动作图片未就绪');
  if (image.width * image.height > 4000000) throw new Error('纵向匹配最多 400 万原图像素');
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// 每帧直接匹配原始首帧，不串联、不累积漂移；结果全齐才交给编辑事务。
export async function removeVerticalMotion(
  group,
  media,
  { signal, onProgress = () => {}, readPixels = pixels, match = matchWholeBody } = {},
) {
  if (group.frames.length < 2) throw new Error('至少需要两帧动作');
  if (group.lockY) throw new Error('请先解除纵向锁定');
  signal?.throwIfAborted();
  const reference = readPixels(group.frames[0], media),
    offsets = [0],
    warnings = [];
  for (let i = 1; i < group.frames.length; i++) {
    signal?.throwIfAborted();
    onProgress(i, group.frames.length - 1);
    let result;
    try {
      result = await match(
        { mode: 'vertical', reference, target: readPixels(group.frames[i], media) },
        signal,
      );
    } catch (error) {
      signal?.throwIfAborted();
      throw new Error(`第 ${i + 1} 帧：${error.message}`);
    }
    signal?.throwIfAborted();
    if (
      result.best.scale !== 1 ||
      result.best.tx !== 0 ||
      !Number.isFinite(result.best.ty) ||
      Math.abs(result.best.ty) > 100000
    )
      throw new Error('纵向匹配结果无效');
    offsets.push(result.best.ty);
    if (result.best.score < 0.75) warnings.push(i + 1);
  }
  return { offsets, warnings };
}
