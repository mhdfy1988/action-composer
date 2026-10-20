import test from 'node:test';
import assert from 'node:assert/strict';
import { previewFrames, selectVisible } from '../src/domain/preview-frames.js';

test('多动作按共同时间各自循环，隐藏不参与，编辑动作最后绘制', () => {
  const a = { id: 'a', frames: [{ durationTicks: 100 }, { durationTicks: 200 }] };
  const b = {
    id: 'b',
    frames: [{ durationTicks: 50 }, { durationTicks: 50 }, { durationTicks: 50 }],
  };
  const c = { id: 'c', frames: [{ durationTicks: 300 }] };
  const before = JSON.stringify([a, b, c]);
  const samples = previewFrames([a, b, c], new Set(['a', 'b']), 'a', 1, 220);
  assert.deepEqual(
    samples.map((item) => [item.group.id, item.frame]),
    [
      ['b', 1],
      ['a', 1],
    ],
  );
  assert.equal(JSON.stringify([a, b, c]), before);
  assert.deepEqual(previewFrames([a, b], new Set(), 'a', 0, 0), []);
  assert.deepEqual(
    previewFrames([a, b], new Set(['b']), 'a', 0, 100).map((item) => item.frame),
    [2],
  );
});

test('取消编辑动作后选下一个可见动作，末尾回绕；无勾选清空', () => {
  const groups = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const visible = new Set(['a', 'c', 'd']);
  assert.equal(selectVisible(groups, visible, 'c'), 'c');
  assert.equal(selectVisible(groups, visible, 'b'), 'c');
  assert.equal(selectVisible(groups, new Set(['a']), 'd'), 'a');
  assert.equal(selectVisible(groups, visible, null), 'a');
  assert.equal(selectVisible(groups, new Set(), 'a'), null);
  assert.equal(selectVisible([], new Set(), null), null);
});
