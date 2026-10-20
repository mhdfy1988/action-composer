import test from 'node:test';
import assert from 'node:assert/strict';
import { alignAllFirstFrames } from '../src/application/align-all-first-frames.js';

const fixture = () => ({
  groups: ['reference', 'one', 'two', 'broken'].map((id) => ({
    id,
    name: id,
    scale: 1,
    x: 0,
    y: 0,
  })),
});
test('所有目标共用原始基准，失败项保留，计算不修改工程', async () => {
  const project = fixture(),
    before = JSON.stringify(project),
    calls = [],
    progress = [];
  const result = await alignAllFirstFrames(project, 'reference', null, {
    onProgress: (message) => progress.push(message),
    align: async (base, targetId, ref) => {
      assert.equal(base, project);
      assert.equal(JSON.stringify(base), before);
      calls.push([targetId, ref]);
      if (targetId === 'broken') throw new Error('没有可见内容');
      return {
        transform: { scale: 2, x: 20, y: -10 },
        candidate: { boundary: false, best: { score: targetId === 'one' ? 0.9 : 0.5 } },
      };
    },
  });
  assert.deepEqual(calls, [
    ['one', 'reference'],
    ['two', 'reference'],
    ['broken', 'reference'],
  ]);
  assert.deepEqual(
    result.updates.map((item) => item.targetId),
    ['one', 'two'],
  );
  assert.deepEqual(result.warnings, ['two']);
  assert.deepEqual(result.failures, [
    { targetId: 'broken', name: 'broken', message: '没有可见内容' },
  ]);
  assert.equal(progress.at(-1).index, 3);
  assert.equal(progress.at(-1).total, 3);
  assert.equal(JSON.stringify(project), before);
});
test('中途取消不返回前面成功项，原工程保持不变', async () => {
  const project = fixture(),
    before = JSON.stringify(project),
    controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    alignAllFirstFrames(project, 'reference', null, {
      signal: controller.signal,
      align: async () => {
        if (++calls === 2) controller.abort();
        return { transform: { scale: 2, x: 20, y: -10 }, candidate: { best: { score: 0.9 } } };
      },
    }),
    { name: 'AbortError' },
  );
  assert.equal(calls, 2);
  assert.equal(JSON.stringify(project), before);
});
test('全失败不生成更新；无基准或仅一组明确拒绝', async () => {
  const result = await alignAllFirstFrames(fixture(), 'reference', null, {
    align: async () => {
      throw new Error('匹配失败');
    },
  });
  assert.deepEqual(result.updates, []);
  assert.equal(result.failures.length, 3);
  await assert.rejects(alignAllFirstFrames(fixture(), 'missing', null), /请选择/);
  await assert.rejects(
    alignAllFirstFrames({ groups: [{ id: 'reference' }] }, 'reference', null),
    /至少需要两个/,
  );
});
