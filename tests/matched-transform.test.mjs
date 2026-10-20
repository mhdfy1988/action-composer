import test from 'node:test';
import assert from 'node:assert/strict';
import { matchedTransform } from '../src/domain/matched-transform.js';
import { placement } from '../src/domain/project.js';
import { foregroundBounds, wholeBodyCheck } from '../src/domain/whole-body.js';

test('匹配的原图变换映射到参照已有尺度和偏移，不重复乘目标旧尺度', () => {
  const target = {
    id: 'a',
    scale: 0.5,
    x: 12,
    y: -6,
    frames: [{ assetId: 'a' }],
    horizontal: false,
    lockX: false,
    lockY: false,
  };
  const reference = {
    id: 'b',
    scale: 1.5,
    x: 30,
    y: -20,
    frames: [{ assetId: 'b' }],
    horizontal: false,
  };
  const project = {
    stage: { originX: 256, originY: 480 },
    assets: [
      { id: 'a', width: 100, height: 150 },
      { id: 'b', width: 200, height: 300 },
    ],
  };
  const candidate = { scale: 2, tx: 10, ty: 20 };
  const result = matchedTransform(project, target, reference, candidate);
  assert.deepEqual(result, { scale: 3, x: 45, y: 10 });
  const a = placement(project, { ...target, ...result }, 0),
    b = placement(project, reference, 0);
  for (const [x, y] of [
    [0, 0],
    [20, 40],
    [80, 100],
  ]) {
    assert.equal(a.x + x * result.scale, b.x + (x * 2 + 10) * reference.scale);
    assert.equal(a.y + y * result.scale, b.y + (y * 2 + 20) * reference.scale);
  }
  assert.deepEqual(
    matchedTransform(project, { ...target, lockX: true, lockY: true }, reference, candidate),
    { scale: 3, x: 12, y: -6 },
  );
});
test('全身检查过滤低透明边缘，计算高度与底部偏差，不改变像素', () => {
  const image = { width: 3, height: 3, data: new Uint8ClampedArray(36) };
  image.data[3] = 1;
  image.data[(1 * 3 + 1) * 4 + 3] = 255;
  const before = image.data.slice();
  assert.deepEqual(foregroundBounds(image), { left: 1, top: 1, right: 2, bottom: 2 });
  assert.deepEqual(image.data, before);
  assert.deepEqual(
    wholeBodyCheck({ top: 20, bottom: 180 }, { top: 5, bottom: 85 }, { scale: 2, ty: 10 }),
    { heightPercent: 0, topOffset: 0, bottomOffset: 0 },
  );
});
