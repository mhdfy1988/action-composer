import test from 'node:test';
import assert from 'node:assert/strict';
import { alphaBounds, outputLayout } from '../src/domain/output-layout.js';

test('可见像素边界忽略透明 RGB，全透明帧不贡献范围', () => {
  const data = new Uint8Array(4 * 4 * 4).fill(0);
  data[0] = 255;
  assert.equal(alphaBounds(data, 4, 4), null);
  data[(1 * 4 + 2) * 4 + 3] = 1;
  assert.deepEqual(alphaBounds(data, 4, 4), { left: 2, top: 1, right: 3, bottom: 2 });
});
test('全部帧取共同范围，保留负坐标、相对位移及统一原点', () => {
  const result = outputLayout(
    [
      null,
      { left: -10, top: -20, right: 10, bottom: 0 },
      { left: 20, top: -5, right: 40, bottom: 15 },
    ],
    { originX: 0, originY: 0 },
    16,
  );
  assert.deepEqual(result, {
    left: -26,
    top: -36,
    width: 82,
    height: 67,
    originX: 26,
    originY: 36,
  });
});
test('拒绝全部透明、非法留白与超大范围，不回退固定画布', () => {
  assert.throws(() => outputLayout([null], { originX: 0, originY: 0 }), /全部透明/);
  assert.throws(() => outputLayout([], {}, -1), /留白/);
  assert.throws(
    () => outputLayout([{ left: 0, top: 0, right: 9000, bottom: 1 }], {}, 0),
    /范围过大/,
  );
});
