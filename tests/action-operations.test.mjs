import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderAction } from '../src/domain/action-operations.js';

test('动作排序按落点插入，保留完整动作参数和对象身份，不交换首尾', () => {
  const groups = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      x: i * 10,
      frames: [{ id: `f${i}`, durationTicks: i + 1 }],
    })),
    p = { groups: [...groups] };
  reorderAction(p, 'a', 'd', true);
  assert.deepEqual(
    p.groups.map((g) => g.id),
    ['b', 'c', 'd', 'a'],
  );
  assert.equal(p.groups[3], groups[0]);
  assert.equal(p.groups[3].frames[0].durationTicks, 1);
  reorderAction(p, 'a', 'b');
  assert.deepEqual(p.groups, groups);
  const before = [...p.groups];
  reorderAction(p, 'b', 'b');
  assert.deepEqual(p.groups, before);
  reorderAction(p, 'b', 'a', true);
  assert.deepEqual(p.groups, before);
  assert.throws(() => reorderAction(p, 'missing', 'a'));
});
