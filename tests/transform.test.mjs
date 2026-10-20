import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, placement } from '../src/domain/project.js';
import { CORNERS, resizeGroup } from '../src/domain/transform.js';

function setup() {
  const project = newProject();
  project.assets = [{ id: 'a', width: 40, height: 60 }];
  const group = {
    frames: [{ assetId: 'a' }],
    scale: 1,
    x: 0,
    y: 0,
    horizontal: false,
    lockX: false,
    lockY: false,
  };
  return { project, group };
}
test('四角等比拉伸固定对角点，原数据不变', () => {
  for (const [corner, [cx, cy]] of Object.entries(CORNERS)) {
    const { project, group } = setup(),
      before = placement(project, group, 0);
    const updated = resizeGroup(project, group, 0, corner, {
      x: (cx * 2 - 1) * 20,
      y: (cy * 2 - 1) * 30,
    });
    assert.equal(updated.scale, 1.5);
    const after = placement(project, { ...group, ...updated }, 0);
    assert.equal(after.x + after.width * (1 - cx), before.x + before.width * (1 - cx));
    assert.equal(after.y + after.height * (1 - cy), before.y + before.height * (1 - cy));
    assert.equal(group.scale, 1);
  }
});
test('缩放不会翻转，保留原倍率预算，平移锁仍有效', () => {
  const { project, group } = setup();
  assert.equal(resizeGroup(project, group, 0, 'se', { x: -99999, y: -99999 }).scale, 0.01);
  assert.equal(resizeGroup(project, group, 0, 'se', { x: 99999, y: 99999 }).scale, 20);
  group.lockX = true;
  group.lockY = true;
  const result = resizeGroup(project, group, 0, 'se', { x: 20, y: 30 });
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
  assert.equal(result.scale, 1.5);
});
