import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, placement } from '../src/domain/project.js';
import { firstFrameAlignment } from '../experiments/registration/contour-align.js';

function fixture() {
  const project = newProject();
  project.assets = [
    { id: 'a', width: 100, height: 150 },
    { id: 'b', width: 200, height: 300 },
  ];
  const base = { lockX: false, lockY: false, horizontal: false, anchors: [null, null] };
  const target = {
    ...base,
    id: 'target',
    scale: 0.5,
    x: 12,
    y: -6,
    frames: [
      { assetId: 'a', durationTicks: 5000 },
      { assetId: 'a', durationTicks: 6000 },
    ],
  };
  const reference = {
    ...base,
    id: 'reference',
    scale: 1.5,
    x: 30,
    y: -20,
    frames: [{ assetId: 'b', durationTicks: 9000 }],
  };
  project.groups = [target, reference];
  return {
    project,
    target,
    reference,
    a: { left: 20, top: 30, right: 60, bottom: 110 },
    b: { left: 50, top: 40, right: 150, bottom: 200 },
  };
}

test('首帧按轮廓高度等比缩放并对齐底部中心，考虑参照已有变换', () => {
  const { project, target, reference, a, b } = fixture();
  const before = JSON.stringify(project);
  const result = firstFrameAlignment(project, target, reference, a, b);
  assert.deepEqual(result, { scale: 3, x: 60, y: -50 });
  const p = placement(project, { ...target, ...result }, 0),
    r = placement(project, reference, 0);
  assert.equal(
    p.x + ((a.left + a.right) / 2) * result.scale,
    r.x + ((b.left + b.right) / 2) * reference.scale,
  );
  assert.equal(p.y + a.bottom * result.scale, r.y + b.bottom * reference.scale);
  assert.equal(JSON.stringify(project), before);
  assert.deepEqual(firstFrameAlignment(project, { ...target, ...result }, reference, a, b), result);
});
test('只生成整组参数，不逐帧改时长、锚点或消除原有运动', () => {
  const { project, target, reference, a, b } = fixture();
  const result = firstFrameAlignment(project, target, reference, a, b);
  assert.deepEqual(Object.keys(result).sort(), ['scale', 'x', 'y']);
  const after = { ...target, ...result };
  assert.equal(after.frames, target.frames);
  assert.equal(after.anchors, target.anchors);
  assert.equal(after.horizontal, false);
  // 图像内两帧身体锚点的相对运动随统一尺度变化，而非被逐帧拉回首帧。
  assert.deepEqual([(45 - 40) * after.scale, (100 - 110) * after.scale], [15, -30]);
});
test('保留锁定偏移；拒绝透明首帧、自参照和超预算倍率', () => {
  const { project, target, reference, a, b } = fixture();
  const locked = firstFrameAlignment(
    project,
    { ...target, lockX: true, lockY: true },
    reference,
    a,
    b,
  );
  assert.deepEqual(locked, { scale: 3, x: 12, y: -6 });
  assert.throws(() => firstFrameAlignment(project, target, target, a, a), /另一个动作/);
  assert.throws(() => firstFrameAlignment(project, target, reference, null, b), /没有可见内容/);
  assert.throws(
    () => firstFrameAlignment(project, target, reference, { ...a, bottom: 31 }, b),
    /超出/,
  );
});
