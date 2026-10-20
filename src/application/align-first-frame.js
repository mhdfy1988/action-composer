import { foregroundBounds, wholeRegion } from '../domain/whole-body.js';
import { matchedTransform } from '../domain/matched-transform.js';
import { validateProject } from '../infrastructure/validation.js';
import { matchWholeBody } from '../infrastructure/registration.js';

function firstPixels(group, media) {
  const image = media.get(group.frames[0].assetId)?.image;
  if (!image) throw new Error('首帧图片未就绪');
  if (image.width * image.height > 4000000)
    throw new Error('全身匹配最多 400 万原图像素，请降低分辨率或手动校准');
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height);
}
export async function alignFirstFrame(project, targetId, referenceId, media, signal, onProgress) {
  const target = project.groups.find((g) => g.id === targetId),
    reference = project.groups.find((g) => g.id === referenceId);
  if (!target || !reference || target === reference) throw new Error('请选择另一个动作作为参照');
  signal?.throwIfAborted();
  const targetImage = firstPixels(target, media),
    referenceImage = firstPixels(reference, media);
  const targetBounds = foregroundBounds(targetImage),
    referenceBounds = foregroundBounds(referenceImage);
  if (!targetBounds || !referenceBounds) throw new Error('首帧没有可见内容，无法匹配');
  const guess =
    (referenceBounds.bottom - referenceBounds.top) / (targetBounds.bottom - targetBounds.top);
  const minScale = Math.max(0.1, guess * 0.6),
    maxScale = Math.min(10, guess * 1.6);
  if (minScale >= maxScale) throw new Error('原图尺度差异超出自动匹配范围，请手动校准');
  const candidate = await matchWholeBody(
    {
      reference: referenceImage,
      target: targetImage,
      roi: wholeRegion(referenceImage, referenceBounds),
      minScale,
      maxScale,
      representation: 'edge',
    },
    signal,
    onProgress,
  );
  signal?.throwIfAborted();
  const transform = matchedTransform(project, target, reference, candidate.best);
  const draft = structuredClone(project);
  Object.assign(
    draft.groups.find((g) => g.id === targetId),
    transform,
  );
  validateProject(draft);
  return {
    transform,
    referenceId,
    targetId,
    base: project,
    candidate,
  };
}
