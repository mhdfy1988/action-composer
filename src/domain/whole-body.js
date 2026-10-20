import { alphaBounds } from './output-layout.js';

// 与匹配掩膜采用同一阈值，排除几乎透明的抠图残边；不是人体识别。
export function foregroundBounds(image) {
  const pixels = new Uint8ClampedArray(image.data);
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 200) pixels[i] = 0;
  return alphaBounds(pixels, image.width, image.height);
}

export function wholeRegion(image, bounds) {
  if (!bounds) throw new Error('参照图片没有足够不透明的前景，无法选择全身');
  const x = Math.max(0, bounds.left - 2),
    y = Math.max(0, bounds.top - 2);
  return {
    x,
    y,
    width: Math.min(image.width, bounds.right + 2) - x,
    height: Math.min(image.height, bounds.bottom + 2) - y,
  };
}

export function wholeBodyCheck(reference, target, transform) {
  if (!reference || !target) return null;
  const referenceHeight = reference.bottom - reference.top;
  return {
    heightPercent: (((target.bottom - target.top) * transform.scale) / referenceHeight - 1) * 100,
    topOffset: target.top * transform.scale + transform.ty - reference.top,
    bottomOffset: target.bottom * transform.scale + transform.ty - reference.bottom,
  };
}
