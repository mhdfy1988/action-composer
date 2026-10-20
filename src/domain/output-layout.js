// 从实际绘制像素求边界，返回半开区间；全透明帧不贡献内容范围。
export function alphaBounds(data, width, height) {
  let left = width,
    top = height,
    right = 0,
    bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  return right > left ? { left, top, right, bottom } : null;
}

export function outputLayout(bounds, origin, padding = 16) {
  if (!Number.isInteger(padding) || padding < 0 || padding > 256)
    throw new Error('输出留白必须是 0–256 的整数');
  const visible = bounds.filter(Boolean);
  if (!visible.length) throw new Error('当前动作全部透明，没有可导出的内容');
  const left = Math.floor(Math.min(...visible.map((b) => b.left))) - padding;
  const top = Math.floor(Math.min(...visible.map((b) => b.top))) - padding;
  const width = Math.ceil(Math.max(...visible.map((b) => b.right))) + padding - left;
  const height = Math.ceil(Math.max(...visible.map((b) => b.bottom))) + padding - top;
  checkOutputSize(width, height);
  return {
    left,
    top,
    width,
    height,
    originX: origin.originX - left,
    originY: origin.originY - top,
  };
}

export function checkOutputSize(width, height) {
  if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 16000000)
    throw new Error('内容范围过大：最长边 8192，最多 1600 万像素，请调整尺度或分组导出');
}
