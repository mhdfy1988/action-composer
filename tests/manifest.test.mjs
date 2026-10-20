import test from 'node:test';
import assert from 'node:assert/strict';
import { orderFromManifest } from '../src/infrastructure/frame-manifest.js';

test('本工具清单保留不等帧时长和指定顺序', () => {
  const result = orderFromManifest(
    {
      format: 'action-composer-animation',
      version: 1,
      ticksPerSecond: 60000,
      frames: [
        { image: 'frames/b.png', durationTicks: 10000 },
        { image: 'frames/a.png', durationTicks: 5000 },
      ],
    },
    [{ name: 'a.png' }, { name: 'b.png' }],
  );
  assert.deepEqual(
    result.files.map((f) => f.name),
    ['b.png', 'a.png'],
  );
  assert.equal(result.timings.get('b.png'), 10000);
});
test('旧 uniform v6 清单明确使用输出帧率，不误用采样时长', () => {
  const result = orderFromManifest(
    {
      formatVersion: 6,
      kind: 'uniform-frame-export',
      playback: { fps: 12, frameCount: 1 },
      frames: [{ image: 'frames/a.png', durationMs: 333.333333 }],
    },
    [{ name: 'a.png' }],
  );
  assert.equal(result.timings.get('a.png'), 5000);
});
test('清单未知版本、危险路径和缺帧显式失败', () => {
  for (const frame of [
    { image: '../a.png', durationTicks: 1 },
    { image: 'frames/missing.png', durationTicks: 1 },
    { image: 'a.png', durationTicks: -1 },
  ])
    assert.throws(() =>
      orderFromManifest(
        { format: 'action-composer-animation', version: 1, ticksPerSecond: 60000, frames: [frame] },
        [{ name: 'a.png' }],
      ),
    );
  assert.throws(() => orderFromManifest({}, []));
});
