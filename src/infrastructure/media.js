import { LIMITS } from '../domain/project.js';

export async function sha256(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function pngSize(bytes) {
  if (
    bytes.length < 33 ||
    [137, 80, 78, 71, 13, 10, 26, 10].some((b, i) => bytes[i] !== b) ||
    new TextDecoder().decode(bytes.slice(12, 16)) !== 'IHDR'
  )
    throw new Error('仅支持有效 PNG 图片');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (
    !width ||
    !height ||
    width > LIMITS.side ||
    height > LIMITS.side ||
    width * height > LIMITS.pixels
  )
    throw new Error('图片尺寸超过预算（最长边 8192 像素）');
  return { width, height };
}
export async function decodePng(bytes, name, id = crypto.randomUUID()) {
  if (bytes.length > 20 * 1024 * 1024) throw new Error('单张 PNG 最多 20 MB');
  const dimensions = pngSize(bytes);
  const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  try {
    if (image.width !== dimensions.width || image.height !== dimensions.height)
      throw new Error('PNG 尺寸不一致');
    const asset = {
      id,
      name: name.slice(0, 160) || 'image.png',
      ...dimensions,
      sha256: await sha256(bytes),
    };
    return { asset, bytes, image };
  } catch (error) {
    image.close();
    throw error;
  }
}
export function checkMediaBudget(values) {
  if (
    values.reduce((n, v) => n + v.bytes.length, 0) > LIMITS.bytes ||
    values.reduce((n, v) => n + v.asset.width * v.asset.height, 0) > LIMITS.pixels
  )
    throw new Error('素材超过内存预算：总计 96 MB／2400 万像素，请减少帧数或导出后刷新');
}
export function download(bytes, name, type = 'application/zip') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
