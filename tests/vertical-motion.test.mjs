import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, placement } from '../src/domain/project.js';
import { validateProject } from '../src/infrastructure/validation.js';
import { removeVerticalMotion } from '../experiments/registration/remove-vertical-motion.js';

function fixture() {
  const p = newProject();
  p.assets = [{ id: 'a', name: 'a.png', width: 40, height: 60, sha256: '0'.repeat(64) }];
  p.groups = [
    {
      id: 'g',
      name: '跳跃',
      frames: [0, 1, 2].map(() => ({ assetId: 'a', durationTicks: 5000 })),
      scale: 2,
      x: 12,
      y: -8,
      lockX: false,
      lockY: false,
      horizontal: false,
      anchors: [null, null, null],
    },
  ];
  return p;
}
test('纵向修正兼容旧 v1，预览和导出共用 placement，随整组尺度变化', () => {
  const p = fixture(),
    g = p.groups[0];
  validateProject(p);
  const before = placement(p, g, 1);
  g.frames[1].verticalOffset = 15;
  validateProject(p);
  assert.deepEqual(placement(p, g, 1), { ...before, y: before.y + 30 });
  g.frames[1].verticalOffset = Infinity;
  assert.throws(() => validateProject(p));
});
test('逐帧直接匹配原始首帧，保持横向尺度时序，重复计算不叠加', async () => {
  const g = fixture().groups[0],
    original = structuredClone(g),
    calls = [];
  g.frames[1].verticalOffset = 99;
  const readPixels = (frame) => frame;
  const result = await removeVerticalMotion(g, null, {
    readPixels,
    match: async (job) => {
      calls.push(job);
      return { best: { scale: 1, tx: 0, ty: calls.length * 10, score: 0.7 } };
    },
  });
  assert.deepEqual(result, { offsets: [0, 10, 20], warnings: [2, 3] });
  assert.ok(calls.every((j) => j.reference === g.frames[0] && j.mode === 'vertical'));
  assert.equal(g.frames[1].verticalOffset, 99);
  delete g.frames[1].verticalOffset;
  assert.deepEqual(g, original);
});
test('取消、锁轴及任意帧失败均不修改输入，拒绝非纵向结果', async () => {
  const g = fixture().groups[0],
    before = structuredClone(g);
  const controller = new AbortController();
  await assert.rejects(
    removeVerticalMotion(g, null, {
      readPixels: () => ({}),
      signal: controller.signal,
      match: async () => {
        controller.abort();
        return { best: {} };
      },
    }),
    { name: 'AbortError' },
  );
  await assert.rejects(
    removeVerticalMotion(g, null, {
      readPixels: () => ({}),
      match: async () => {
        throw new Error('无前景');
      },
    }),
    /无前景/,
  );
  await assert.rejects(
    removeVerticalMotion(g, null, {
      readPixels: () => ({}),
      match: async () => ({ best: { scale: 2, tx: 0, ty: 2 } }),
    }),
    /无效/,
  );
  assert.deepEqual(g, before);
  g.lockY = true;
  await assert.rejects(removeVerticalMotion(g, null), /锁定/);
});
